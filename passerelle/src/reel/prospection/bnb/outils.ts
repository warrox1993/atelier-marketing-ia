// Outil `bnb_comptes` du service `bnb` en mode réel (lot P4) : MÊME nom, MÊME schéma d'entrée et MÊME forme de réponse que le
// simulateur (src/demo/prospection/bnb.ts) : `references` = jusqu'à trois exercices, du plus récent au plus ancien, avec ReferenceNumber,
// ExerciseDates, DepositDate, ModelType, Language, Currency et AccountingData.Rubrics (9087 = effectif moyen en ETP, 20/58 = total du bilan, et pour les critères « courtier » 10/15 = fonds propres, 22 = terrains et constructions, 9904 = résultat de l'exercice ; ces trois codes sont à confirmer sur la documentation BNB).
//
// Différences voulues :
//   - pas de refus de numéro « non fictif » : les vrais numéros sont l'objet du service ; un chiffre de contrôle (modulo 97) faux est refusé
//     AVANT tout appel réseau ;
//   - aucune réponse inventée : un dépôt sans JSON (PDF, ou XBRL déposé avant le 4 avril 2022) est annoncé par `json_disponible: false`, sans chiffres ;
//   - `source`, `environnement` (test | production | personnalise), `date_consultation` à la place de `client_demonstration` et de la note sur les numéros fictifs.
// Personnes physiques : la passerelle ne peut pas les reconnaître par le seul numéro ; elles n'ont aucun compte annuel à la Centrale des bilans
// (la BCE locale ne les charge pas non plus), et la réponse ne reprend jamais le nom, l'adresse ni les mandataires d'un dépôt.

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../../fournisseurs.js";
import { outilLecture } from "../../../commun/prospection/commun.js";
import { analyserNumero } from "../../../commun/prospection/numeros.js";
import { ClientBnb, ErreurBnb, type ReferenceBnb, type RubriqueBnb } from "./client.js";

// La fiche est déclarée dans services.ts (fiches livrées par défaut) ; ré-exportée ici pour les importations existantes.
import { FICHE_BNB } from "../../../services.js";
export { FICHE_BNB };

export const PROPRIETE_BNB_REEL = { id: "centrale/bnb-reel", libelle: "Centrale des bilans de la BNB (service Query authentic data)" } as const;

/** Premier jour où la BNB produit un JSON à partir d'un dépôt XBRL (conditions d'abonnement v2022). */
export const DATE_DEBUT_JSON = "2022-04-04";
export const NB_EXERCICES = 3;
const RUBRIQUE_EFFECTIF = "9087";
const RUBRIQUE_TOTAL_BILAN = "20/58";
// Lot 2 (critères de qualification « courtier ») : codes de rubriques du schéma comptable belge, À CONFIRMER sur la documentation BNB.
const RUBRIQUE_FONDS_PROPRES = "10/15"; // capitaux propres
const RUBRIQUE_TERRAINS = "22"; // terrains et constructions (immobilisations corporelles)
const RUBRIQUE_RESULTAT = "9904"; // bénéfice (perte) de l'exercice, négatif = perte

/** Un dépôt par exercice (le plus récemment déposé : une rectification remplace l'initial), trois exercices au plus, du plus récent au plus ancien. */
export function exercicesRetenus(refs: readonly ReferenceBnb[]): ReferenceBnb[] {
  const parFin = new Map<string, ReferenceBnb>();
  for (const r of refs) {
    const fin = r.ExerciseDates.endDate;
    if (!fin) continue;
    const present = parFin.get(fin);
    if (!present || (r.DepositDate ?? "") > (present.DepositDate ?? "")) parFin.set(fin, r);
  }
  return [...parFin.values()].sort((a, b) => b.ExerciseDates.endDate!.localeCompare(a.ExerciseDates.endDate!)).slice(0, NB_EXERCICES);
}

function valeur(rubriques: readonly RubriqueBnb[], code: string): number | null {
  // Période courante (N) ; une rubrique sans période est acceptée seulement faute de rubrique N.
  const r = rubriques.find((x) => x.Code === code && x.Period === "N") ?? rubriques.find((x) => x.Code === code && x.Period === undefined);
  if (!r) return null;
  const n = Number(r.Value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const taille = (etp: number | null): "micro" | "petite" | "moyenne" | "grande" | "inconnue" =>
  etp === null ? "inconnue" : etp < 10 ? "micro" : etp < 50 ? "petite" : etp < 250 ? "moyenne" : "grande";

export function outilComptesReel(client: ClientBnb, maintenant: () => Date = () => new Date()): OutilPasserelle {
  return outilLecture(
    {
      nom: "bnb_comptes",
      description:
        "Derniers comptes annuels déposés à la Centrale des bilans pour un numéro d'entreprise : effectif (équivalents temps plein) et total du bilan, jusqu'à trois exercices, du plus récent au plus ancien. " +
        "Liste vide : petite entité non tenue au dépôt, création récente ou numéro inconnu. Données avec un an ou plus de retard. " +
        "Un dépôt en PDF ou déposé avant le 4 avril 2022 n'a pas de données structurées : il est listé sans chiffres (json_disponible = false).",
      schemaEntree: { numero: z.string().min(1).max(30).describe("Numéro d'entreprise BCE, avec ou sans points ni préfixe BE.") },
    },
    async (args) => {
      const n = analyserNumero(args.numero);
      if (n.type !== "entreprise") throw new Error("La Centrale des bilans se consulte par numéro d'entreprise (0123.456.789), pas par numéro d'unité d'établissement.");
      if (!n.controleValide) throw new Error(`Numéro d'entreprise invalide (« ${n.formate} ») : le chiffre de contrôle (modulo 97) est faux, faute de frappe probable. Aucune consultation n'a été faite.`);
      const base = {
        source: "Centrale des bilans de la Banque nationale de Belgique (service Query authentic data)",
        environnement: client.environnement,
        date_consultation: maintenant().toISOString().slice(0, 10),
        EnterpriseNumber: n.formate,
      };
      client.commencer();
      const toutes = await client.references(n.chiffres);
      const retenues = exercicesRetenus(toutes);
      if (retenues.length === 0) {
        return { ...base, trouve: false, motif: "aucun_depot", references: [], message: "Aucun compte déposé : petite entité non tenue au dépôt, création récente, personne physique ou numéro inconnu." };
      }
      const references: unknown[] = [];
      let dernierEtp: number | null = null;
      let dernierVu = false;
      for (const r of retenues) {
        const avantJson = r.DepositDate !== null && r.DepositDate < DATE_DEBUT_JSON;
        const rubriques = avantJson ? null : await client.rubriques(r.ReferenceNumber);
        const entete = {
          ReferenceNumber: r.ReferenceNumber,
          ExerciseDates: { startDate: r.ExerciseDates.startDate, endDate: r.ExerciseDates.endDate },
          DepositDate: r.DepositDate,
          ModelType: r.ModelType,
          Language: r.Language,
          Currency: r.Currency,
          DepositType: r.DepositType,
        };
        if (rubriques === null) {
          references.push({ ...entete, json_disponible: false, AccountingData: { Rubrics: [] }, note: avantJson ? `Dépôt antérieur au ${DATE_DEBUT_JSON} : la BNB ne fournit pas de données structurées (PDF ou XBRL ancien).` : "Dépôt sans données structurées (PDF, ou JSON non fourni par la BNB)." });
          continue;
        }
        const etp = valeur(rubriques, RUBRIQUE_EFFECTIF);
        const total = valeur(rubriques, RUBRIQUE_TOTAL_BILAN);
        const fondsPropres = valeur(rubriques, RUBRIQUE_FONDS_PROPRES);
        const terrains = valeur(rubriques, RUBRIQUE_TERRAINS);
        const resultat = valeur(rubriques, RUBRIQUE_RESULTAT);
        if (!dernierVu) { dernierEtp = etp; dernierVu = true; }
        references.push({
          ...entete,
          json_disponible: true,
          AccountingData: {
            Rubrics: [
              { Code: RUBRIQUE_EFFECTIF, Libelle: "Effectif moyen du personnel en équivalents temps plein", Period: "N", Value: etp },
              { Code: RUBRIQUE_TOTAL_BILAN, Libelle: "Total de l'actif (total du bilan)", Period: "N", Value: total },
              { Code: RUBRIQUE_FONDS_PROPRES, Libelle: "Capitaux propres (fonds propres)", Period: "N", Value: fondsPropres },
              { Code: RUBRIQUE_TERRAINS, Libelle: "Terrains et constructions", Period: "N", Value: terrains },
              { Code: RUBRIQUE_RESULTAT, Libelle: "Bénéfice (perte) de l'exercice", Period: "N", Value: resultat },
            ],
          },
          ...(etp === null || total === null ? { note: "Rubrique absente de ce dépôt (selon le modèle de schéma, l'effectif ou le total peuvent ne pas figurer) : valeur nulle, rien de deviné." } : {}),
        });
      }
      return { ...base, trouve: true, references, taille_deduite: taille(dernierEtp), taille_note: "Taille d'après l'effectif (ETP) du dernier exercice avec données structurées ; « inconnue » sans effectif." };
    },
  );
}

/** Fournisseur du service `bnb` en mode réel, derrière le jeton porteur de la passerelle (même contrôle que `bce`). */
export function fournisseurBnbReel(client: ClientBnb, verifier: (jeton: string) => ReturnType<NonNullable<FournisseurService["verifierJeton"]>>): FournisseurService {
  return { service: "bnb", mode: "reel", fiche: FICHE_BNB, outils: [outilComptesReel(client)], verifierJeton: (jeton) => verifier(jeton) };
}

export { ErreurBnb };
