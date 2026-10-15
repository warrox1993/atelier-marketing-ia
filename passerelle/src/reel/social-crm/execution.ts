// Exécution des outils réels : lectures (renouvellement du jeton et attente courte sur limite de débit),
// mutations gardées par la preuve d'approbation humaine, idempotentes et réconciliées.
//
// Mutation, dans l'ordre :
//   1. sans preuve (ou preuve refusée) : réponse « préparée, non exécutée », même forme qu'en démonstration
//      (etat: "preparee", executee: false, approbation_humaine_requise: true) ; la plateforme n'est pas appelée ;
//   2. preuve valide : la clé d'idempotence de la preuve est cherchée dans le journal :
//        executee              → le résultat déjà obtenu est renvoyé (rejeu: true), aucun nouvel appel ;
//        en cours (ce processus) → refus « en cours » ;
//        en_cours (processus interrompu) ou ambigue → RÉCONCILIATION d'abord : la plateforme est relue ;
//            effet trouvé → executee (rejeu) ; absence prouvée → nouvel essai ; impossible à établir → la réponse
//            reste « ambigue_a_reconcilier » et rien n'est renvoyé à la plateforme ;
//        echouee (refus certain, sans effet) ou absente → exécution ;
//   3. l'entrée passe à « en_cours » AVANT l'appel (écriture atomique sur disque), puis à executee, echouee
//      (refus de la plateforme : aucun effet) ou ambigue (réseau, délai, 5xx : effet possible).

import type { ContexteAppel, OutilPasserelle } from "../../fournisseurs.js";
import type { AccesPlateforme, AutorisationSocialCrm } from "./autorisation.js";
import type { Coffre, EntreeMutation } from "./coffre.js";
import { empreinteArguments, type VerificateurPreuves } from "./approbation.js";
import { ErreurFournisseur } from "./http.js";

export interface DependancesExecution {
  autorisation: AutorisationSocialCrm;
  coffre: Coffre;
  verificateur: VerificateurPreuves;
  attenteQuotaMaxMs: number;
  attendre?: (ms: number) => Promise<void>;
  maintenant?: () => number;
}

const attendreParDefaut = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Lecture : accès à la plateforme, un renouvellement si le jeton est refusé, une attente courte si le débit est dépassé. */
export async function lire<T>(dep: DependancesExecution, contexte: ContexteAppel, appel: (acces: AccesPlateforme) => Promise<T>): Promise<T> {
  let acces = await dep.autorisation.acces(contexte.jetonPorteur, contexte.service);
  let renouvele = false;
  let attendu = false;
  for (;;) {
    try {
      return await appel(acces);
    } catch (e) {
      if (!(e instanceof ErreurFournisseur)) throw e;
      if (e.code === "jeton_expire" && !renouvele) {
        renouvele = true;
        acces = await dep.autorisation.acces(contexte.jetonPorteur, contexte.service, true);
        continue;
      }
      if (e.code === "limite_debit" && !attendu && e.attenteMs !== null && e.attenteMs <= dep.attenteQuotaMaxMs) {
        attendu = true;
        await (dep.attendre ?? attendreParDefaut)(e.attenteMs);
        continue;
      }
      throw e;
    }
  }
}

export type Reconciliation = { etat: "trouve"; resultat: Record<string, unknown> } | { etat: "absent" } | { etat: "inconnu"; motif: string };

export interface DefinitionMutation<A extends Record<string, unknown>> {
  outil: OutilPasserelle;
  requeteReelle: string;
  resume: (args: A) => string;
  /** Contrôles locaux avant tout appel (mêmes refus qu'en démonstration quand ils ont un sens en réel). */
  verifier?: (args: A) => void;
  /** Effectue l'action ; renvoie les identifiants produits. Lève ErreurFournisseur. */
  executer: (acces: AccesPlateforme, args: A) => Promise<Record<string, unknown>>;
  /** Relit la plateforme pour savoir si une tentative ambiguë a produit son effet (depuis `debutMs`). */
  reconcilier: (acces: AccesPlateforme, args: A, debutMs: number) => Promise<Reconciliation>;
}

interface ReponseMutation {
  etat: "preparee" | "executee" | "ambigue_a_reconcilier";
  executee: boolean;
  message: string;
  approbation_humaine_requise: boolean;
  action: { service: string; outil: string; requete_reelle_visee: string; parametres: Record<string, unknown> };
  cle_idempotence?: string;
  rejeu?: boolean;
  resultat?: Record<string, unknown>;
}

const enCours = new Set<string>();

/** Construit l'outil de mutation réel : mêmes nom, schéma (plus `preuve_approbation`) et annotations que L7. */
export function mutationReelle<A extends Record<string, unknown>>(dep: DependancesExecution, def: DefinitionMutation<A>): OutilPasserelle {
  const maintenant = dep.maintenant ?? Date.now;
  return {
    ...def.outil,
    async executer(brut, contexte) {
      const { preuve_approbation: preuve, ...reste } = brut as A & { preuve_approbation?: string };
      const args = reste as unknown as A;
      def.verifier?.(args);
      const action = { service: contexte.service, outil: def.outil.nom, requete_reelle_visee: def.requeteReelle, parametres: { ...reste } };
      const preparee = (motif: string): ReponseMutation => ({
        etat: "preparee",
        executee: false,
        message: `Action préparée, non exécutée : ${def.resume(args)} Motif : ${motif}.`,
        approbation_humaine_requise: true,
        action,
      });
      if (preuve === undefined || preuve.trim() === "") return preparee("aucune preuve d'approbation humaine n'accompagne la demande");

      let acces = await dep.autorisation.acces(contexte.jetonPorteur, contexte.service);
      const verdict = dep.verificateur.verifier(preuve, { service: contexte.service, outil: def.outil.nom, args: reste, compte: acces.compte.id, maintenantS: Math.floor(maintenant() / 1000) });
      if (!verdict.ok) return preparee(verdict.motif);
      const cle = verdict.charge.cle;
      const empreinte = empreinteArguments(reste);
      if (enCours.has(cle)) throw new ErreurFournisseur("indisponible", "Une exécution de cette approbation est déjà en cours : réessayer dans un instant.", null, false);

      const executee = (entree: EntreeMutation, rejeu: boolean): ReponseMutation => ({
        etat: "executee",
        executee: true,
        message: rejeu ? `Action déjà exécutée pour cette approbation (aucun nouvel envoi) : ${def.resume(args)}` : `Action exécutée : ${def.resume(args)}`,
        approbation_humaine_requise: false,
        action,
        cle_idempotence: cle,
        rejeu,
        resultat: entree.resultat ?? {},
      });
      const ambigue = (motif: string): ReponseMutation => ({
        etat: "ambigue_a_reconcilier",
        executee: false,
        message: `Résultat incertain : ${motif}`,
        approbation_humaine_requise: true,
        action,
        cle_idempotence: cle,
      });

      enCours.add(cle);
      try {
        const existante = dep.coffre.mutation(cle);
        if (existante && (existante.empreinte !== empreinte || existante.outil !== def.outil.nom || existante.service !== contexte.service)) {
          return preparee("cette clé d'idempotence a déjà servi pour une autre action");
        }
        if (existante?.etat === "executee") return executee(existante, true);
        if (existante && (existante.etat === "en_cours" || existante.etat === "ambigue")) {
          let rec: Reconciliation;
          try {
            rec = await def.reconcilier(acces, args, existante.debut);
          } catch (e) {
            rec = { etat: "inconnu", motif: e instanceof Error ? e.message : "relecture impossible" };
          }
          if (rec.etat === "trouve") {
            const fin: EntreeMutation = { ...existante, etat: "executee", fin: maintenant(), resultat: rec.resultat, motif: "effet constaté par réconciliation" };
            dep.coffre.ecrireMutation(fin);
            return executee(fin, true);
          }
          if (rec.etat === "inconnu") {
            dep.coffre.ecrireMutation({ ...existante, etat: "ambigue", motif: rec.motif });
            return ambigue(`la tentative précédente n'a pas pu être vérifiée (${rec.motif}) ; rien n'a été renvoyé à la plateforme. Vérifier à la main avant toute nouvelle demande.`);
          }
          // Absence prouvée : un nouvel essai ne peut pas doubler l'effet.
        }

        const entree: EntreeMutation = {
          cle,
          service: contexte.service,
          outil: def.outil.nom,
          empreinte,
          octroi: acces.octroi,
          etat: "en_cours",
          debut: maintenant(),
          fin: null,
          resultat: null,
          tentatives: (existante?.tentatives ?? 0) + 1,
          motif: null,
          expirePreuve: Math.max(existante?.expirePreuve ?? 0, verdict.charge.expire * 1000),
        };
        dep.coffre.ecrireMutation(entree);
        let renouvele = false;
        for (;;) {
          try {
            const resultat = await def.executer(acces, args);
            const fin: EntreeMutation = { ...entree, etat: "executee", fin: maintenant(), resultat };
            dep.coffre.ecrireMutation(fin);
            return executee(fin, false);
          } catch (e) {
            if (e instanceof ErreurFournisseur && e.sansEffet) {
              if (e.code === "jeton_expire" && !renouvele) {
                renouvele = true;
                try {
                  acces = await dep.autorisation.acces(contexte.jetonPorteur, contexte.service, true);
                  continue;
                } catch (e2) {
                  dep.coffre.ecrireMutation({ ...entree, etat: "echouee", fin: maintenant(), motif: e2 instanceof Error ? e2.message : "autorisation" });
                  throw e2;
                }
              }
              dep.coffre.ecrireMutation({ ...entree, etat: "echouee", fin: maintenant(), motif: e.message });
              throw e;
            }
            const motif = e instanceof Error ? e.message : "erreur inconnue";
            dep.coffre.ecrireMutation({ ...entree, etat: "ambigue", fin: maintenant(), motif });
            return ambigue(`${motif} L'action a peut-être eu lieu ; un nouvel appel avec la même preuve vérifiera d'abord chez la plateforme.`);
          }
        }
      } finally {
        enCours.delete(cle);
      }
    },
  };
}
