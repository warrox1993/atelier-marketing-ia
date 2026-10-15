/**
 * Porte déterministe (P2) : mise sous porte d'une tâche et évaluation.
 *
 * L'évaluation est calculée par le plugin à partir des données (jamais
 * d'une sortie de modèle) et relue par le serveur patché sous verrou de
 * ligne avant tout passage à l'étape d'approbation humaine ou à « done »
 * (`paperclip/server/src/atelier/gardes-atelier.ts`).
 */
import { z } from "zod";
import { CodeExigence, Horodatage, IdNatif, RoleRevue } from "./communs.js";
import { CLE_LIVRABLE_DEFAUT, LIMITES } from "./identifiants.js";

export const DecisionPorte = z.enum(["PASS", "REFUS", "BLOQUE_INFORMATION"]);
export type DecisionPorte = z.infer<typeof DecisionPorte>;

export const CodeMotifPorte = z.enum([
  "livrable_absent",
  "exigence_inconnue",
  "exigence_obligatoire_non_couverte",
  "exigence_partielle",
  "element_attendu_sans_preuve",
  "preuve_absente",
  "preuve_sur_autre_revision",
  "exclusion_non_autorisee",
  "exigence_non_examinee",
  "information_manquante",
  "revue_requise_absente",
  "revue_sur_ancienne_version",
  "revue_non_reussie",
  "revue_bloquee_information",
  "revue_na_non_justifiee",
  "constat_bloquant_ouvert",
  "cycles_epuises",
  /** v1.4 (L9) : chiffre ou source d'une connexion de démonstration cité sans la mention « démonstration ». */
  "donnee_demo_sans_mention",
  /** v1.4 (L9) : donnée de démonstration dans une campagne réelle (interdite). */
  "donnee_demo_campagne_reelle",
]);
export type CodeMotifPorte = z.infer<typeof CodeMotifPorte>;

export const MotifPorte = z.object({
  code: CodeMotifPorte,
  message: z.string().min(1),
  exigence: CodeExigence.nullable().default(null),
  element: z.string().nullable().default(null),
  role: RoleRevue.nullable().default(null),
  findingId: z.string().nullable().default(null),
  /** v1.4 : endroit du livrable concerné (section et ligne), quand le motif est localisable. */
  emplacement: z.string().nullable().default(null),
  /** v1.4 : source en cause (donnée de connexion, lecture d'URL…). */
  sourceId: z.string().nullable().default(null),
});
export type MotifPorte = z.infer<typeof MotifPorte>;

export const RevueRequise = z.object({
  role: RoleRevue,
  /** Agent désigné (contexte d'invocation distinct du producteur). */
  agentId: IdNatif,
});
export type RevueRequise = z.infer<typeof RevueRequise>;

/** Tâche native placée sous la porte de l'atelier. */
export const TacheSousPorte = z.object({
  issueId: IdNatif,
  companyId: IdNatif,
  campagneId: IdNatif,
  cleLivrable: z.string().min(1).max(64),
  exigencesCiblees: z.array(CodeExigence).min(1).max(200),
  revuesRequises: z.array(RevueRequise).min(1).max(3),
  maxCycles: z.number().int().min(LIMITES.maxCyclesCorrectionMin).max(LIMITES.maxCyclesCorrectionMax),
  /** Refus de porte déjà prononcés (cycles de correction consommés). */
  cyclesConsommes: z.number().int().nonnegative(),
  actif: z.boolean(),
  /** Levée explicite par un humain (motif tracé). */
  leveePar: z.string().nullable(),
  motifLevee: z.string().nullable(),
  creeLe: Horodatage,
  modifieLe: Horodatage,
});
export type TacheSousPorte = z.infer<typeof TacheSousPorte>;

/** Corps de la mise sous porte. */
export const MettreSousPorteEntree = z.object({
  companyId: IdNatif,
  issueId: IdNatif,
  campagneId: IdNatif,
  cleLivrable: z.string().min(1).max(64).default(CLE_LIVRABLE_DEFAUT),
  exigencesCiblees: z.array(CodeExigence).min(1).max(200),
  revuesRequises: z.array(RevueRequise).min(1).max(3),
  maxCycles: z
    .number()
    .int()
    .min(LIMITES.maxCyclesCorrectionMin)
    .max(LIMITES.maxCyclesCorrectionMax)
    .default(LIMITES.maxCyclesCorrectionParDefaut),
});
export type MettreSousPorteEntree = z.infer<typeof MettreSousPorteEntree>;

/** Résultat d'une évaluation déterministe. */
export const EvaluationPorte = z.object({
  id: IdNatif,
  companyId: IdNatif,
  issueId: IdNatif,
  /** Révision évaluée ; null si aucun livrable. */
  revisionId: IdNatif.nullable(),
  decision: DecisionPorte,
  motifs: z.array(MotifPorte),
  /** SHA-256 des entrées canonisées (reproductibilité). */
  empreinte: z.string().regex(/^[0-9a-f]{64}$/u),
  /** Horodatage de la dernière entrée prise en compte (fraîcheur vérifiée par le serveur). */
  entreesJusquA: Horodatage,
  /** true dès qu'une entrée change après l'évaluation. */
  perimee: z.boolean(),
  cyclesEpuises: z.boolean(),
  evalueePar: z.string(),
  creeLe: Horodatage,
});
export type EvaluationPorte = z.infer<typeof EvaluationPorte>;
