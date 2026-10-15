/**
 * Routes JSON du plugin (agents et humains), servies par l'hôte sous
 * `/api/plugins/atelier.marketing-ia/api/*`. L'hôte authentifie, résout
 * l'entreprise (tâche, corps ou requête), vérifie l'accès à l'entreprise et
 * la politique de checkout AVANT d'appeler le worker. Le worker revérifie
 * l'appartenance de chaque objet à l'entreprise résolue.
 */
import { z } from "zod";
import { CodeExigence, IdNatif } from "./communs.js";
import { ExigenceSaisie } from "./exigences.js";
import { EtatTraitementMessage } from "./messages.js";

export * from "./routes.js";

/** Corps : enregistrement des exigences d'une campagne. */
export const EnregistrerExigencesEntree = z.object({
  companyId: IdNatif,
  exigences: z.array(ExigenceSaisie).min(1).max(200),
});
export type EnregistrerExigencesEntree = z.infer<typeof EnregistrerExigencesEntree>;

/** Corps : exclusion d'une exigence. Un agent ne peut envoyer que `demander`. */
export const ExclusionEntree = z.object({
  companyId: IdNatif,
  action: z.enum(["demander", "autoriser", "refuser"]),
  justification: z.string().min(10).max(2000),
});
export type ExclusionEntree = z.infer<typeof ExclusionEntree>;

/** Corps : planification proposée d'un contenu (calendrier éditorial). */
export const PlanifierEntree = z.object({
  canal: z.string().min(1).max(100),
  dateProposee: z.iso.datetime({ offset: true }).nullable(),
});
export type PlanifierEntree = z.infer<typeof PlanifierEntree>;

export const EtatMessageEntree = z.object({ etat: EtatTraitementMessage.exclude(["recu"]) });
export type EtatMessageEntree = z.infer<typeof EtatMessageEntree>;

export const JournalRequete = z.object({
  companyId: IdNatif,
  afterSeq: z.coerce.number().int().nonnegative().default(0),
  limite: z.coerce.number().int().positive().max(200).default(100),
  issueId: IdNatif.optional(),
});
export type JournalRequete = z.infer<typeof JournalRequete>;

/** Contexte d'une tâche renvoyé aux agents (producteur et relecteurs). */
export const ContexteTacheSchemaCles = [
  "tache",
  "campagne",
  "brief",
  "exigences",
  "porte",
  "livrable",
  "couvertures",
  "verdicts",
  "constatsOuverts",
  "boiteReception",
  "mode",
  "mentionDemonstration",
  "donneesConnexion",
  "regleDonneesDemo",
  "rappelSecurite",
] as const;

/** Codes d'erreur stables des routes et actions. */
export const CODES_ERREUR = [
  "entree_invalide",
  "introuvable",
  "acces_refuse",
  "hors_entreprise",
  "hors_projet",
  "role_non_autorise",
  "producteur_ne_peut_pas_relire",
  "revision_perimee",
  "porte_absente",
  "elevation_refusee",
  "diffusion_refusee",
  "url_refusee",
  "import_refuse",
  "conflit",
  "non_implemente",
  "erreur_interne",
] as const;
export type CodeErreur = (typeof CODES_ERREUR)[number];

export const CodesExigences = z.array(CodeExigence);
