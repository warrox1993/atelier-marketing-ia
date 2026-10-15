/**
 * Briefs, exigences, couverture et preuves (cahier §7 et §8).
 */
import { z } from "zod";
import { CodeExigence, Horodatage, IdNatif } from "./communs.js";
import { LIMITES } from "./identifiants.js";

/** États de couverture d'une exigence par un livrable (cahier §7). */
export const EtatCouverture = z.enum(["non_traite", "partiel", "couvert", "bloque", "na_justifie"]);
export type EtatCouverture = z.infer<typeof EtatCouverture>;

/**
 * Exclusion d'une exigence obligatoire : seule une décision humaine explicite
 * l'autorise. Un agent peut la demander, jamais l'accorder (cahier §7).
 */
export const EtatExclusion = z.enum(["aucune", "demandee", "autorisee", "refusee"]);
export type EtatExclusion = z.infer<typeof EtatExclusion>;

export const Exclusion = z.object({
  etat: EtatExclusion,
  justification: z.string().max(2000).nullable(),
  demandeePar: z.string().nullable(),
  decideePar: z.string().nullable(),
  decideeLe: Horodatage.nullable(),
});
export type Exclusion = z.infer<typeof Exclusion>;

/** Brief d'origine d'une campagne, conservé tel quel et versionné. */
export const Brief = z.object({
  id: IdNatif,
  companyId: IdNatif,
  campagneId: IdNatif,
  /** Tâche native qui porte le brief (le coordinateur y travaille). */
  issueId: IdNatif.nullable(),
  texteOriginal: z.string().min(1).max(50_000),
  version: z.number().int().positive(),
  creeLe: Horodatage,
});
export type Brief = z.infer<typeof Brief>;

/** Une exigence extraite du brief, identifiée de façon stable (REQ-001). */
export const Exigence = z.object({
  /** Identifiant technique (UUID) de la ligne. */
  id: IdNatif,
  code: CodeExigence,
  companyId: IdNatif,
  campagneId: IdNatif,
  /** Extrait du brief d'où vient l'exigence, sans reformulation. */
  texteOriginal: z.string().min(1).max(4000),
  /** Interprétation retenue (peut être corrigée ; chaque correction est tracée). */
  interpretation: z.string().min(1).max(4000),
  obligatoire: z.boolean(),
  /** Critères vérifiables qui permettent de dire « couvert ». */
  criteres: z.array(z.string().min(1).max(1000)).max(30),
  /** Codes des exigences dont celle-ci dépend. */
  dependances: z.array(CodeExigence).max(30),
  /** Entités à couvrir une par une (ex. établissements) : preuve exigée pour chacune. */
  elementsAttendus: z.array(z.string().min(1).max(200)).max(100),
  exclusion: Exclusion,
  version: z.number().int().positive(),
  creeLe: Horodatage,
  modifieLe: Horodatage,
});
export type Exigence = z.infer<typeof Exigence>;

/** Saisie d'une exigence par le coordinateur ou un humain. */
export const ExigenceSaisie = z.object({
  code: CodeExigence,
  texteOriginal: z.string().min(1).max(4000),
  interpretation: z.string().min(1).max(4000),
  obligatoire: z.boolean(),
  criteres: z.array(z.string().min(1).max(1000)).max(30).default([]),
  dependances: z.array(CodeExigence).max(30).default([]),
  elementsAttendus: z.array(z.string().min(1).max(200)).max(100).default([]),
});
export type ExigenceSaisie = z.infer<typeof ExigenceSaisie>;

/**
 * Preuve localisable dans une révision précise du livrable. Une
 * correspondance textuelle seule ne prouve pas la couverture (cahier §4) :
 * l'emplacement et l'élément couvert sont obligatoires.
 */
export const Preuve = z.object({
  /** Révision native du document livrable (`document_revisions.id`). */
  revisionId: IdNatif,
  /** Emplacement dans le livrable : titre de section, ancre ou numéro de ligne. */
  emplacement: z.string().min(1).max(300),
  /** Élément attendu couvert par cette preuve (ex. nom d'un établissement), si l'exigence en liste. */
  element: z.string().min(1).max(200).nullable().default(null),
  extrait: z.string().min(1).max(LIMITES.extraitPreuveMaxCaracteres),
  sourceIds: z.array(IdNatif).max(20).default([]),
});
export type Preuve = z.infer<typeof Preuve>;

/** Hypothèse autorisée : elle reste visible dans tout livrable qui en dépend (cahier §7). */
export const Hypothese = z.object({
  texte: z.string().min(1).max(1000),
  autoriseePar: z.string().nullable(),
});
export type Hypothese = z.infer<typeof Hypothese>;

/** Déclaration de couverture faite par le producteur pour une révision. */
export const DeclarationCouverture = z.object({
  id: IdNatif,
  companyId: IdNatif,
  issueId: IdNatif,
  revisionId: IdNatif,
  code: CodeExigence,
  etat: EtatCouverture,
  preuves: z.array(Preuve).max(100),
  hypotheses: z.array(Hypothese).max(20),
  /** Question précise si l'état est « bloque » (information introuvable). */
  question: z.string().max(2000).nullable(),
  declareePar: z.string(),
  creeLe: Horodatage,
});
export type DeclarationCouverture = z.infer<typeof DeclarationCouverture>;

/** Corps de la route de déclaration de couverture. */
export const DeclarerCouvertureEntree = z.object({
  revisionId: IdNatif,
  lignes: z
    .array(
      z.object({
        code: CodeExigence,
        etat: EtatCouverture,
        preuves: z.array(Preuve).max(100).default([]),
        hypotheses: z.array(Hypothese).max(20).default([]),
        question: z.string().min(1).max(2000).nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});
export type DeclarerCouvertureEntree = z.infer<typeof DeclarerCouvertureEntree>;
