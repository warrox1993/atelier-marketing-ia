/**
 * Expériences A/B tenues par le système (v1, migration 021).
 *
 * Une expérience compare 2 à 4 variantes (la première est la RÉFÉRENCE) sur une métrique de type taux
 * (succès / essais). Le verdict n'est jamais écrit par un agent : il est CALCULÉ par `regles-experiences.ts`
 * à la clôture, puis figé. Les chiffres d'une variante viennent soit d'une réponse de la passerelle SIGNÉE (déposée
 * par `tache.donnees.deposer`, référencée ici par source et chemin : l'agent ne recopie aucun nombre), soit d'une
 * saisie humaine.
 */
import { z } from "zod";
import { IdNatif } from "./communs.js";

export const LIMITES_EXPERIENCE = {
  variantesMin: 2,
  variantesMax: 4,
  hypotheseMax: 600,
  metriqueMax: 120,
  nomVarianteMax: 80,
  descriptionVarianteMax: 500,
  essaisMinMax: 1_000_000_000,
  dureeMaxJours: 365,
  alphaMax: 0.1,
} as const;

export const ALPHA_PAR_DEFAUT = 0.05;

export const StatutExperience = z.enum(["en_cours", "conclue", "arretee"]);
export type StatutExperience = z.infer<typeof StatutExperience>;

/**
 * Nom de variante : une seule ligne, sans caractère de contrôle (saut de ligne, tabulation, NEL, séparateurs de
 * ligne ou de paragraphe). Revue M1 : le nom est recopié dans le verdict et la tâche d'apprentissage du Stratège ;
 * un saut de ligne y ferait passer une consigne pour une ligne du plugin.
 */
// eslint-disable-next-line no-control-regex
const SANS_CONTROLE = /^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/u;
const NomVariante = z.string().trim().min(1).max(LIMITES_EXPERIENCE.nomVarianteMax).regex(SANS_CONTROLE, "Le nom d'une variante tient sur une seule ligne, sans saut de ligne ni caractère de contrôle");

export const VarianteExperience = z
  .object({
    nom: NomVariante,
    description: z.string().trim().min(1).max(LIMITES_EXPERIENCE.descriptionVarianteMax),
  })
  .strict();
export type VarianteExperience = z.infer<typeof VarianteExperience>;

export const ConditionArretExperience = z
  .object({
    /** Essais minimaux à atteindre dans CHAQUE variante avant qu'un verdict soit possible. */
    essaisMinParVariante: z.number().int().min(1).max(LIMITES_EXPERIENCE.essaisMinMax),
    /** Durée maximale : au-delà, l'expérience peut être close même si le minimum n'est pas atteint (verdict « non concluant »). */
    dureeMaxJours: z.number().int().min(1).max(LIMITES_EXPERIENCE.dureeMaxJours),
  })
  .strict();
export type ConditionArretExperience = z.infer<typeof ConditionArretExperience>;

/** Corps de `experiences.creer`. L'entreprise vient de la route ; `companyId` du corps doit la nommer. */
export const CreerExperienceEntree = z
  .object({
    companyId: IdNatif,
    /** Tâche d'origine : l'agent qui crée l'expérience doit en être l'assigné. */
    issueId: IdNatif,
    campagneId: IdNatif.nullable().default(null),
    hypothese: z.string().trim().min(1).max(LIMITES_EXPERIENCE.hypotheseMax),
    /** Métrique de type taux : conversions / essais. Nom libre (« taux de réponse », « taux de clic »…). */
    metrique: z.string().trim().min(1).max(LIMITES_EXPERIENCE.metriqueMax),
    variantes: z.array(VarianteExperience).min(LIMITES_EXPERIENCE.variantesMin).max(LIMITES_EXPERIENCE.variantesMax),
    conditionArret: ConditionArretExperience,
    alpha: z.number().gt(0).max(LIMITES_EXPERIENCE.alphaMax).default(ALPHA_PAR_DEFAUT),
  })
  .strict()
  .superRefine((v, ctx) => {
    const vus = new Set<string>();
    v.variantes.forEach((x, i) => {
      const cle = x.nom.toLowerCase();
      if (vus.has(cle)) ctx.addIssue({ code: "custom", path: ["variantes", i, "nom"], message: "Deux variantes ne peuvent pas porter le même nom" });
      vus.add(cle);
    });
  });
export type CreerExperienceEntree = z.infer<typeof CreerExperienceEntree>;

/** Référence à un chiffre d'une réponse signée déjà déposée : la source et le chemin du chiffre retenu (`chiffres` de la source). */
export const ReferenceChiffreSigne = z
  .object({
    sourceId: IdNatif,
    chemin: z.string().min(1).max(300),
  })
  .strict();
export type ReferenceChiffreSigne = z.infer<typeof ReferenceChiffreSigne>;

/** Saisie humaine : les deux nombres sont écrits par l'humain. */
export const ResultatSaisiEntree = z
  .object({
    variante: NomVariante,
    essais: z.number().int().min(0),
    succes: z.number().int().min(0),
  })
  .strict()
  .refine((r) => r.succes <= r.essais, { path: ["succes"], message: "Le nombre de succès ne peut pas dépasser le nombre d'essais" });

/** Dépôt d'un agent : aucun nombre, seulement des références à des chiffres d'une réponse de la passerelle signée (mode réel). */
export const ResultatSigneEntree = z
  .object({
    variante: NomVariante,
    essais: ReferenceChiffreSigne,
    succes: ReferenceChiffreSigne,
  })
  .strict();

export const DeposerResultatsExperienceEntree = z
  .object({
    companyId: IdNatif,
    experienceId: IdNatif,
    resultats: z.array(z.union([ResultatSaisiEntree, ResultatSigneEntree])).min(1).max(LIMITES_EXPERIENCE.variantesMax),
  })
  .strict();
export type DeposerResultatsExperienceEntree = z.infer<typeof DeposerResultatsExperienceEntree>;

export const CloturerExperienceEntree = z.object({ companyId: IdNatif, experienceId: IdNatif }).strict();
export type CloturerExperienceEntree = z.infer<typeof CloturerExperienceEntree>;

/** D'où vient le résultat d'une variante : réponse signée référencée, ou humain. */
export const ProvenanceResultat = z.discriminatedUnion("type", [
  z.object({ type: z.literal("signee"), essais: ReferenceChiffreSigne, succes: ReferenceChiffreSigne }).strict(),
  z.object({ type: z.literal("humain"), par: z.string().min(1).max(200) }).strict(),
]);
export type ProvenanceResultat = z.infer<typeof ProvenanceResultat>;

export const ResultatVariante = z
  .object({ nom: z.string(), essais: z.number().int().min(0), succes: z.number().int().min(0), provenance: ProvenanceResultat, deposeLe: z.string() })
  .strict();
export type ResultatVariante = z.infer<typeof ResultatVariante>;

/** Comparaison de la référence avec une autre variante (test z bilatéral de deux proportions). */
export const ComparaisonVariante = z
  .object({
    variante: z.string(),
    tauxReference: z.number(),
    tauxVariante: z.number(),
    /** Taux de la variante moins taux de la référence, en proportion (0,02 = 2 points). */
    ecartAbsolu: z.number(),
    /** Intervalle de confiance à 95 % de l'écart (méthode de Newcombe, issue des intervalles de Wilson). */
    intervalle95: z.tuple([z.number(), z.number()]),
    z: z.number(),
    pValeur: z.number(),
    /** p-valeur multipliée par le nombre de comparaisons (Bonferroni), plafonnée à 1. */
    pValeurAjustee: z.number(),
    significatif: z.boolean(),
  })
  .strict();
export type ComparaisonVariante = z.infer<typeof ComparaisonVariante>;

export const StatutVerdict = z.enum(["gagnant", "aucune_difference", "non_concluant"]);
export type StatutVerdict = z.infer<typeof StatutVerdict>;

export const VerdictExperience = z
  .object({
    statut: StatutVerdict,
    /** Nom de la variante gagnante ; null si personne ne gagne. */
    gagnant: z.string().nullable(),
    /** Phrase du verdict : « <variante> gagne », « aucune différence détectable » ou « non concluant : <raison> ». */
    texte: z.string(),
    reference: z.string(),
    alpha: z.number(),
    alphaAjuste: z.number(),
    essaisMinParVariante: z.number().int(),
    taux: z.array(z.object({ variante: z.string(), essais: z.number().int(), succes: z.number().int(), taux: z.number().nullable() }).strict()),
    comparaisons: z.array(ComparaisonVariante),
    calculeLe: z.string(),
  })
  .strict();
export type VerdictExperience = z.infer<typeof VerdictExperience>;

export const ExperienceLue = z
  .object({
    id: z.string(),
    companyId: z.string(),
    campagneId: z.string().nullable(),
    /** Tâche d'origine ; null si elle a été supprimée depuis. */
    issueId: z.string().nullable(),
    hypothese: z.string(),
    metrique: z.string(),
    variantes: z.array(VarianteExperience),
    conditionArret: ConditionArretExperience,
    alpha: z.number(),
    statut: StatutExperience,
    resultats: z.array(ResultatVariante),
    verdict: VerdictExperience.nullable(),
    /** Tâche « Apprentissage » créée pour le Stratège à la clôture (null tant qu'elle n'existe pas). */
    tacheApprentissageId: z.string().nullable(),
    creePar: z.string(),
    creeLe: z.string(),
    clotureLe: z.string().nullable(),
    /** Date limite : création + durée maximale. */
    echeance: z.string(),
  })
  .strict();
export type ExperienceLue = z.infer<typeof ExperienceLue>;
