/**
 * Verdicts structurés et constats de revue (cahier §8).
 */
import { z } from "zod";
import { Acteur, CodeExigence, Horodatage, IdNatif, RoleRevue } from "./communs.js";
import { Preuve } from "./exigences.js";

export const Verdict = z.enum(["PASS", "CHANGES_REQUESTED", "BLOCKED_INFORMATION", "NOT_APPLICABLE_JUSTIFIED"]);
export type Verdict = z.infer<typeof Verdict>;

export const Gravite = z.enum(["critique", "majeure", "mineure", "info"]);
export type Gravite = z.infer<typeof Gravite>;

/** Gravités qui interdisent le passage à « prêt pour l'humain » tant qu'un constat est ouvert. */
export const GRAVITES_BLOQUANTES: readonly Gravite[] = ["critique", "majeure"];

export const CategorieConstat = z.enum([
  "exigence_manquante",
  "preuve_absente",
  "affirmation_non_sourcee",
  "offre_non_confirmee",
  "promesse_excessive",
  "lien_defectueux",
  "page_erreur",
  "incoherence_canaux",
  "marque",
  "technique",
  "juridique_a_verifier",
  "autre",
]);
export type CategorieConstat = z.infer<typeof CategorieConstat>;

export const StatutResolution = z.enum(["ouvert", "resolu", "rejete", "accepte_par_humain"]);
export type StatutResolution = z.infer<typeof StatutResolution>;

/** Constat (finding) : emplacement, preuve, gravité et correction attendue sont obligatoires. */
export const Constat = z.object({
  findingId: z.string().regex(/^F-[A-Z0-9-]{4,}$/u),
  companyId: IdNatif,
  issueId: IdNatif,
  reviewer: Acteur,
  role: RoleRevue,
  /** Révision du livrable examinée (`document_revisions.id`). */
  artifactVersion: IdNatif,
  requirementIds: z.array(CodeExigence).max(50),
  categorie: CategorieConstat,
  gravite: Gravite,
  emplacement: z.string().min(1).max(300),
  description: z.string().min(1).max(4000),
  preuve: z.string().min(1).max(4000),
  correctionAttendue: z.string().min(1).max(4000),
  statutResolution: StatutResolution,
  resoluDansRevision: IdNatif.nullable(),
  creeLe: Horodatage,
});
export type Constat = z.infer<typeof Constat>;

/** Constat tel que saisi par un relecteur (le serveur attribue findingId, relecteur, version). */
export const ConstatSaisi = z.object({
  requirementIds: z.array(CodeExigence).max(50).default([]),
  categorie: CategorieConstat,
  gravite: Gravite,
  emplacement: z.string().min(1).max(300),
  description: z.string().min(1).max(4000),
  preuve: z.string().min(1).max(4000),
  correctionAttendue: z.string().min(1).max(4000),
});
export type ConstatSaisi = z.infer<typeof ConstatSaisi>;

/** Verdict structuré d'une revue, lié à une révision précise du livrable. */
export const VerdictRevue = z.object({
  id: IdNatif,
  companyId: IdNatif,
  issueId: IdNatif,
  revisionId: IdNatif,
  role: RoleRevue,
  relecteur: Acteur,
  verdict: Verdict,
  /** Exigences effectivement examinées (le contrôleur des exigences doit toutes les lister). */
  exigencesExaminees: z.array(CodeExigence).max(200),
  /** Preuves vérifiées par le relecteur (par établissement, par lien…). */
  preuvesVerifiees: z.array(Preuve).max(200),
  constats: z.array(Constat).max(100),
  /** Constats antérieurs que ce verdict déclare résolus dans cette révision. */
  constatsResolus: z.array(z.string()).max(100),
  limites: z.array(z.string().min(1).max(1000)).max(30),
  controlesNonExecutes: z.array(z.string().min(1).max(1000)).max(30),
  /** Justification obligatoire pour NOT_APPLICABLE_JUSTIFIED. */
  justification: z.string().max(4000).nullable(),
  creeLe: Horodatage,
});
export type VerdictRevue = z.infer<typeof VerdictRevue>;

/** Corps de la route de dépôt d'un verdict. */
export const DeposerVerdictEntree = z
  .object({
    revisionId: IdNatif,
    role: RoleRevue,
    verdict: Verdict,
    exigencesExaminees: z.array(CodeExigence).max(200).default([]),
    preuvesVerifiees: z.array(Preuve).max(200).default([]),
    constats: z.array(ConstatSaisi).max(100).default([]),
    constatsResolus: z.array(z.string()).max(100).default([]),
    limites: z.array(z.string().min(1).max(1000)).max(30).default([]),
    controlesNonExecutes: z.array(z.string().min(1).max(1000)).max(30).default([]),
    justification: z.string().min(1).max(4000).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.verdict === "NOT_APPLICABLE_JUSTIFIED" && !v.justification) {
      ctx.addIssue({ code: "custom", message: "NOT_APPLICABLE_JUSTIFIED exige une justification", path: ["justification"] });
    }
    if (v.verdict === "PASS" && v.constats.some((c) => c.gravite === "critique" || c.gravite === "majeure")) {
      ctx.addIssue({ code: "custom", message: "Un PASS ne peut pas contenir de constat critique ou majeur", path: ["constats"] });
    }
    // CHANGES_REQUESTED exige au moins un constat NOUVEAU ou un constat bloquant
    // du même rôle encore ouvert (vérifié par le service, qui connaît l'existant).
  });
export type DeposerVerdictEntree = z.infer<typeof DeposerVerdictEntree>;
