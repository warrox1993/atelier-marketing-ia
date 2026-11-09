// Création de contacts dans un CRM réel (export de prospects) : boucle commune aux quatre fournisseurs, branchée sur
// `mutationReelle` (preuve d'approbation, idempotence, réconciliation).
//
// Pour chaque contact : recherche (coordonnée si présente, sinon dénomination et code postal) ; déjà présent → « existants »,
// sinon création → « crees ». Un nouvel essai après un arrêt au milieu du lot retrouve donc ce qui a déjà été créé et ne crée
// que le reste. La coordonnée est la VRAIE valeur du prospect : elle part vers le CRM seulement, jamais dans la réponse
// (`parametres` ramené à un nombre), ni dans `resume`, ni dans un message d'erreur (le texte de la plateforme n'est jamais recopié : code, statut HTTP et référence seulement).

import type { ContactACreer } from "../../commun/social-crm/outils.js";
import type { OutilPasserelle } from "../../fournisseurs.js";
import type { AccesPlateforme } from "./autorisation.js";
import type { Gabarit } from "./commun.js";
import { attendreParDefaut, mutationReelle, type DependancesExecution, type Reconciliation } from "./execution.js";
import { ErreurFournisseur } from "./http.js";

/** Un fournisseur dit comment chercher et comment créer un contact ; les identifiants rendus sont toujours des textes. */
export interface AdaptateurCreation {
  /** Identifiant du contact déjà présent dans le CRM, ou null. */
  chercher(acces: AccesPlateforme, contact: ContactACreer): Promise<string | null>;
  /** Crée le contact et rend son identifiant. */
  creer(acces: AccesPlateforme, contact: ContactACreer): Promise<string>;
}

type ArgsCreation = { contacts: ContactACreer[] };
type Present = { reference: string; id: string };

const CANAUX_AVEC_COORDONNEE = ["courriel", "sms", "telephone"];

export const estCourriel = (c: ContactACreer): boolean => c.canal === "courriel";

/** Nom exigé par la plupart des CRM : la dénomination, sinon la coordonnée (`verifier` garantit qu'une des deux existe). */
export const nomDuContact = (c: ContactACreer): string => c.denomination ?? c.coordonnee ?? c.reference;

/** Ce qui identifie le contact dans le CRM : sa coordonnée si elle existe, sinon sa dénomination (et son code postal). */
export type Critere = { type: "email" | "phone"; valeur: string } | { type: "nom"; valeur: string; codePostal: string | null };

export function critereRecherche(c: ContactACreer): Critere {
  if (c.coordonnee !== null) return { type: estCourriel(c) ? "email" : "phone", valeur: c.coordonnee };
  return { type: "nom", valeur: c.denomination ?? c.reference, codePostal: c.code_postal };
}

/** Retire les valeurs nulles : un champ inconnu n'est pas envoyé au CRM. */
export const sansNull = (champs: Record<string, string | null>): Record<string, string> =>
  Object.fromEntries(Object.entries(champs).filter((e): e is [string, string] => e[1] !== null));

/** Corps d'une recherche : un champ attendu absent ou d'un autre type n'est pas « aucun résultat » (il ferait créer un doublon). */
export function tableau(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new ErreurFournisseur("indisponible", "Réponse inattendue à la recherche d'un contact.", null, false);
  return v;
}

/**
 * Erreur d'un contact du lot, sans le texte de la plateforme (elle répète parfois le nom ou la coordonnée) : code, statut HTTP et
 * référence du contact. Dès qu'une création a eu lieu dans l'exécution, l'effet est possible : jamais « sans effet » (donc ambigu, puis réconciliation).
 */
function erreurDuContact(e: unknown, reference: string, dejaCree: boolean): Error {
  const suite = dejaCree ? " Des contacts de ce lot ont déjà été créés." : "";
  if (!(e instanceof ErreurFournisseur)) return new Error(`Contact ${reference} : erreur inattendue.${suite}`);
  const http = e.statut === null ? "" : ` (HTTP ${e.statut})`;
  return new ErreurFournisseur(e.code, `Contact ${reference} : échec${http}.${suite}`, e.attenteMs, e.sansEffet && !dejaCree, e.statut);
}

/** Limite de débit dont l'attente tient sous le plafond : une attente, puis un nouvel essai du même appel (comme `lire`) ; sinon l'erreur remonte. */
async function avecAttente<T>(dep: DependancesExecution, appel: () => Promise<T>): Promise<T> {
  try {
    return await appel();
  } catch (e) {
    if (!(e instanceof ErreurFournisseur) || e.code !== "limite_debit" || e.attenteMs === null || e.attenteMs > dep.attenteQuotaMaxMs) throw e;
    await (dep.attendre ?? attendreParDefaut)(e.attenteMs);
    return appel();
  }
}

export function creationContacts(dep: DependancesExecution, def: { outil: Gabarit; requeteReelle: string }, adaptateur: AdaptateurCreation): OutilPasserelle {
  return mutationReelle<ArgsCreation>(dep, {
    outil: { ...def.outil, executer: () => undefined },
    requeteReelle: def.requeteReelle,
    resume: (a) => `création de ${a.contacts.length} contact(s) (ceux déjà présents ne sont pas recréés).`,
    parametres: (a) => ({ contacts: a.contacts.length }),
    verifier: (a) => {
      a.contacts.forEach((c, i) => {
        if (c.coordonnee !== null && !CANAUX_AVEC_COORDONNEE.includes(c.canal)) throw new Error(`Contact n° ${i + 1} : le canal « ${c.canal} » n'a pas de champ de coordonnée connu (courriel, sms ou telephone attendus).`);
        if (c.denomination === null && c.coordonnee === null) throw new Error(`Contact n° ${i + 1} : ni dénomination ni coordonnée, rien ne l'identifie dans le CRM.`);
      });
    },
    executer: async (acces, a) => {
      const crees: Present[] = [];
      const existants: Present[] = [];
      const connus = new Map<string, string>(); // deux contacts du lot au même critère : une seule recherche, une seule création
      for (const c of a.contacts) {
        try {
          const critere = JSON.stringify(critereRecherche(c));
          const present = connus.get(critere) ?? (await avecAttente(dep, () => adaptateur.chercher(acces, c)));
          if (present !== null) existants.push({ reference: c.reference, id: present });
          else crees.push({ reference: c.reference, id: await avecAttente(dep, () => adaptateur.creer(acces, c)) });
          connus.set(critere, present ?? crees[crees.length - 1]!.id);
        } catch (e) {
          throw erreurDuContact(e, c.reference, crees.length > 0);
        }
      }
      return { crees, existants };
    },
    // Tout est présent : l'effet a eu lieu (ou les contacts existaient déjà). Un seul absent : le nouvel essai saute ceux déjà créés.
    // Une recherche en erreur remonte : mutationReelle la range en « inconnu » et ne renvoie rien à la plateforme.
    reconcilier: async (acces, a): Promise<Reconciliation> => {
      const existants: Present[] = [];
      for (const c of a.contacts) {
        let present: string | null;
        try {
          present = await adaptateur.chercher(acces, c);
        } catch (e) {
          throw erreurDuContact(e, c.reference, false);
        }
        if (present === null) return { etat: "absent" };
        existants.push({ reference: c.reference, id: present });
      }
      return { etat: "trouve", resultat: { crees: [], existants } };
    },
  });
}
