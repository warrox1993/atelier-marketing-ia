/**
 * Rapport mensuel remis au client (route `rapport.mensuel`, humain seulement, lecture seule).
 *
 * Chaque chiffre porte sa source (table ou route lue) et sa période. Une donnée qui n'est pas mesurée vaut
 * `null` avec `mesure: false` : l'interface écrit « non mesuré », jamais 0. Ce qui vient de la démonstration
 * est compté à part (`mode: "demonstration"`) et nommé comme tel.
 */
import { z } from "zod";

/** Mois demandé, « AAAA-MM ». */
export const MoisRapport = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u, "Mois attendu au format AAAA-MM");

export const PeriodeRapport = z.object({
  /** Premier instant du mois (UTC, inclus). */
  debut: z.string(),
  /** Dernier instant du mois (UTC, inclus). */
  fin: z.string(),
});
export type PeriodeRapport = z.infer<typeof PeriodeRapport>;

export const ChiffreRapport = z.object({
  cle: z.string(),
  libelle: z.string(),
  /** `null` quand la donnée n'est pas mesurée. */
  valeur: z.number().nullable(),
  mesure: z.boolean(),
  /** Nom de la table ou de la route lue. */
  source: z.string(),
  periode: PeriodeRapport,
  /** `demonstration` : donnée de démonstration, comptée à part ; `reel` ; `null` : sans objet. */
  mode: z.enum(["reel", "demonstration"]).nullable(),
  /** Précision lisible (limite, état au jour de la consultation, raison de l'absence). */
  note: z.string().nullable(),
});
export type ChiffreRapport = z.infer<typeof ChiffreRapport>;

export const LigneCoutIa = z.object({
  agent: z.string(),
  modele: z.string(),
  /** `abonnement`, `api`, `api_cout_nul` ou la valeur brute du socle. */
  facturation: z.string(),
  jetonsEntree: z.number(),
  jetonsEntreeCache: z.number(),
  jetonsSortie: z.number(),
  /** Centimes du socle, sans conversion. */
  coutCentimes: z.number(),
});
export type LigneCoutIa = z.infer<typeof LigneCoutIa>;

export const MesureRapport = z.object({
  indicateur: z.string(),
  valeur: z.number(),
  unite: z.string(),
  periodeDebut: z.string(),
  periodeFin: z.string(),
  provenance: z.string(),
});

export const PointClient = z.object({
  type: z.string(),
  titre: z.string(),
  raison: z.string(),
});
export type PointClient = z.infer<typeof PointClient>;

export const RapportMensuel = z.object({
  companyId: z.string(),
  entreprise: z.string().nullable(),
  mois: MoisRapport,
  periode: PeriodeRapport,
  genereLe: z.string(),
  campagnes: z.array(ChiffreRapport),
  contenus: z.array(ChiffreRapport),
  prospects: z.object({
    chiffres: z.array(ChiffreRapport),
    /** Répartition des leads trouvés dans le mois selon leur badge (état au jour de la consultation). */
    badges: z.array(ChiffreRapport),
    /** Le parcours des leads a atteint son plafond : les nombres sont des minimums. */
    tronque: z.boolean(),
    plafond: z.number(),
  }),
  resultats: z.object({ chiffres: z.array(ChiffreRapport), mesures: z.array(MesureRapport) }),
  coutsIa: z.object({
    lignes: z.array(LigneCoutIa),
    total: z.object({ jetonsEntree: z.number(), jetonsEntreeCache: z.number(), jetonsSortie: z.number(), coutCentimes: z.number() }),
    source: z.string(),
    periode: PeriodeRapport,
    note: z.string(),
  }),
  enAttenteClient: z.object({ points: z.array(PointClient), source: z.string(), note: z.string() }),
});
export type RapportMensuel = z.infer<typeof RapportMensuel>;
