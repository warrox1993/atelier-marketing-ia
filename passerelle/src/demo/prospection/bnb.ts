// Simulateur `bnb` (lot P2) : Centrale des bilans de la Banque nationale de Belgique, service « Authentic Data
// Query » (comptes annuels en JSON). Forme inspirée des deux appels du service (liste des dépôts d'une entité,
// puis données comptables d'un dépôt), fusionnés en une réponse : niveau de preuve « probable », noms exacts des
// champs à confirmer sur la documentation BNB au lot P4. Rubriques : 9087 = effectif moyen en équivalents temps
// plein, 20/58 = total de l'actif (total du bilan) ; lot 2 : 10/15 = fonds propres, 22 = terrains et constructions, 9904 = résultat de l'exercice (codes à confirmer).
//
// Comme la vraie centrale : les petites entités non tenues au dépôt et les créations récentes n'ont aucun compte,
// et les données ont un an ou plus de retard. Une entreprise radiée garde ses anciens comptes.

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { outilLecture } from "./commun.js";
import { jeuProspection, tailleDe, type CompteDemo } from "./jeu.js";
import { analyserNumero } from "./numeros.js";
import { nomAssureurDemo } from "./referentiel.js";

export const SOURCE_BNB = "Centrale des bilans BNB (simulateur de démonstration : comptes entièrement fictifs)";

const reference = (c: CompteDemo): Record<string, unknown> => ({
  ReferenceNumber: c.referenceDepot,
  ExerciseDates: { startDate: c.debut, endDate: c.fin },
  DepositDate: c.depot,
  ModelType: c.modele,
  Language: "FR",
  Currency: "EUR",
  AccountingData: {
    Rubrics: [
      { Code: "9087", Libelle: "Effectif moyen du personnel en équivalents temps plein", Period: "N", Value: c.effectifEtp },
      { Code: "20/58", Libelle: "Total de l'actif (total du bilan)", Period: "N", Value: c.totalBilan },
      // Lot 2 (critères « courtier ») : codes de rubriques à confirmer sur la documentation BNB.
      { Code: "10/15", Libelle: "Capitaux propres (fonds propres)", Period: "N", Value: c.fondsPropres },
      { Code: "22", Libelle: "Terrains et constructions", Period: "N", Value: c.terrainsConstructions },
      { Code: "9904", Libelle: "Bénéfice (perte) de l'exercice", Period: "N", Value: c.resultat },
    ],
  },
});

export const outilComptes: OutilPasserelle = outilLecture(
  {
    nom: "bnb_comptes",
    description:
      "Derniers comptes annuels déposés à la Centrale des bilans pour un numéro d'entreprise : effectif (équivalents temps plein) et total du bilan, jusqu'à trois exercices, du plus récent au plus ancien. " +
      "Liste vide : petite entité non tenue au dépôt, création récente ou numéro inconnu. Données avec un an ou plus de retard.",
    schemaEntree: { numero: z.string().min(1).max(30).describe("Numéro d'entreprise BCE, avec ou sans points ni préfixe BE.") },
  },
  (args) => {
    const n = analyserNumero(args.numero);
    const base = { source: SOURCE_BNB, client_demonstration: nomAssureurDemo(), note: "Numéros à chiffre de contrôle volontairement faux : aucune entreprise réelle ne peut y correspondre." };
    if (n.type !== "entreprise") throw new Error("La Centrale des bilans se consulte par numéro d'entreprise (0123.456.789), pas par numéro d'unité d'établissement.");
    if (n.controleValide) {
      return { ...base, EnterpriseNumber: n.formate, trouve: false, motif: "numero_non_fictif", references: [], message: "Ce numéro a un chiffre de contrôle valide : il pourrait désigner une vraie entreprise. Le simulateur ne répond pas." };
    }
    const jeu = jeuProspection();
    const e = jeu.entreprises.find((x) => x.numero === n.formate);
    const radiee = jeu.radiees.find((x) => x.numero === n.formate);
    const comptes = e?.comptes ?? radiee?.comptes;
    if (!comptes) return { ...base, EnterpriseNumber: n.formate, trouve: false, motif: "numero_inconnu", references: [], message: "Numéro inconnu du simulateur." };
    const tries = [...comptes].sort((a, b) => b.exercice - a.exercice);
    return {
      ...base,
      EnterpriseNumber: n.formate,
      trouve: true,
      references: tries.map(reference),
      taille_deduite: tailleDe(comptes),
      ...(tries.length === 0 ? { message: "Aucun compte déposé : petite entité non tenue au dépôt ou création récente." } : {}),
      ...(radiee ? { avertissement: "Entreprise radiée de la BCE : la Centrale des bilans conserve ses anciens comptes." } : {}),
    };
  },
);

export function fournisseurBnb(): FournisseurService {
  return {
    service: "bnb",
    mode: "demonstration",
    fiche: { id: "bnb", libelle: "Centrale des bilans (BNB)", portees: ["bnb:lecture"], proprietesDemo: [{ id: "centrale/demo-bnb", libelle: "Comptes annuels de démonstration (entreprises fictives)" }] },
    outils: [outilComptes],
  };
}
