/**
 * Dossier humain, décisions humaines, portée d'approbation et diffusions (cahier §9).
 */
import { z } from "zod";
import { CodeExigence, Horodatage, IdNatif, ModeExecution, RoleRevue } from "./communs.js";
import { DeclarationCouverture, Exigence, Hypothese } from "./exigences.js";
import { EvaluationPorte } from "./porte.js";
import { Constat, VerdictRevue } from "./revues.js";
import { Source } from "./sources.js";
import { StatutFonctionnel } from "./statuts.js";

/** Action externe visée par une approbation. L'approbation d'un article n'autorise pas une campagne payante. */
export const ActionExterne = z.enum(["aucune_action_externe", "publier", "envoyer", "programmer", "activer_campagne_payante", "modifier_crm"]);
export type ActionExterne = z.infer<typeof ActionExterne>;

/** Empreinte SHA-256 en hexadécimal (64 caractères). */
const Empreinte = z.string().regex(/^[0-9a-f]{64}$/u);

/**
 * v1.6 (revue des signatures, S-1) : appel d'outil EXACT approuvé par l'humain. Recopié tel quel de
 * l'aperçu (`AppelPropose`) que l'interface a montré ; le serveur vérifie chaque champ contre l'appel
 * proposé enregistré. Aucune preuve n'est signée pour un autre appel (autre texte, lien, destinataire,
 * contact, propriété CRM ou compte).
 */
export const AppelApprouve = z
  .object({
    id: IdNatif,
    service: z.string().min(1).max(32),
    outil: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
    compte: z.string().min(1).max(200),
    empreinte: Empreinte,
  })
  .strict();
export type AppelApprouve = z.infer<typeof AppelApprouve>;

/** Portée exacte d'une approbation : version, canal, compte, audience, montant, durée, action ; v1.6 : appel exact. */
export const ApprobationPortee = z.object({
  revisionId: IdNatif,
  action: ActionExterne,
  canal: z.string().min(1).max(100).nullable().default(null),
  compte: z.string().min(1).max(200).nullable().default(null),
  audience: z.string().min(1).max(500).nullable().default(null),
  montantMaxCents: z.number().int().nonnegative().nullable().default(null),
  dureeJours: z.number().int().positive().max(365).nullable().default(null),
  /**
   * v1.6 (S-1) : appel d'outil exact approuvé (diffusion réelle par la passerelle). Null : aucune preuve
   * d'approbation ne sera jamais signée sous cette décision (diffusion « préparée » seulement).
   */
  appel: AppelApprouve.nullable().optional(),
});
export type ApprobationPortee = z.infer<typeof ApprobationPortee>;

export const ActionHumaine = z.enum(["approuver", "demander_correction", "rejeter"]);
export type ActionHumaine = z.infer<typeof ActionHumaine>;

/** Décision humaine enregistrée (jamais créée par un agent). */
export const DecisionHumaine = z.object({
  id: IdNatif,
  companyId: IdNatif,
  issueId: IdNatif,
  revisionId: IdNatif,
  action: ActionHumaine,
  commentaire: z.string().min(1).max(4000),
  userId: z.string().min(1),
  portee: ApprobationPortee.nullable(),
  /** Vrai dès qu'une nouvelle révision du livrable existe (modification matérielle). */
  invalidee: z.boolean(),
  mode: ModeExecution,
  creeLe: Horodatage,
});
export type DecisionHumaine = z.infer<typeof DecisionHumaine>;

export const DeciderEntree = z.object({
  issueId: IdNatif,
  revisionId: IdNatif,
  action: ActionHumaine,
  commentaire: z.string().min(1).max(4000),
  portee: ApprobationPortee.nullable().default(null),
});
export type DeciderEntree = z.infer<typeof DeciderEntree>;

/* ------------------------------------------------------------------ */
/* Relance de correction (décision de l'opérateur du 15/10/2026)                  */
/* ------------------------------------------------------------------ */

/**
 * Leviers d'une relance de correction. Il n'existe AUCUN levier « accepter
 * malgré les défauts » : un livrable qui n'a pas passé les contrôles n'est
 * jamais accepté ni diffusé. Changer un critère de contrôle (exigence,
 * exclusion) reste une opération séparée et tracée.
 */
export const LevierRelance = z.enum(["information", "consigne", "escalade", "version_corrigee"]);
export type LevierRelance = z.infer<typeof LevierRelance>;

export const ConfigModele = z.object({ modele: z.string().min(1).max(100), effort: z.string().min(1).max(20) });
export type ConfigModele = z.infer<typeof ConfigModele>;

export const EscaladeProducteur = z.object({ agentId: IdNatif, avant: ConfigModele, apres: ConfigModele });

/** Entrée de l'action humaine `atelier.correction.relancer` (stricte : tout champ inconnu est refusé). */
export const RelancerCorrectionEntree = z
  .object({
    issueId: IdNatif,
    commentaire: z.string().trim().min(1).max(4000),
    /** (a) Information manquante apportée par l'humain : enregistrée comme source de provenance humaine. */
    information: z.object({ question: z.string().trim().min(1).max(2000).nullable().default(null), reponse: z.string().trim().min(1).max(3500) }).strict().nullable().default(null),
    /** (b) Consigne transmise au producteur en plus des constats. */
    consigne: z.string().trim().min(1).max(4000).nullable().default(null),
    /**
     * (c) Montée d'un cran du producteur. L'interface applique d'abord le palier
     * par l'API native de l'agent (le SDK des plugins ne modifie pas un agent) ;
     * le worker vérifie que la configuration actuelle de l'agent est bien `apres`
     * et que `apres` est le palier suivant de `avant`.
     */
    escalade: EscaladeProducteur.strict().nullable().default(null),
    /**
     * (d) Version corrigée à la main : l'humain écrit d'abord la nouvelle révision du document
     * natif (`PUT /api/issues/:id/documents/<clé>` avec `baseRevisionId`, depuis l'interface :
     * l'hôte refuse l'écriture d'un document existant par un plugin sans `baseRevisionId`) ;
     * le worker vérifie ensuite que c'est la révision courante, écrite par un humain, jamais refusée.
     */
    versionCorrigee: z.object({ revisionId: IdNatif }).strict().nullable().default(null),
  })
  .strict()
  .refine((e) => Boolean(e.information || e.consigne || e.escalade || e.versionCorrigee), {
    message: "Au moins un levier est obligatoire : information, consigne, montée du producteur ou version corrigée.",
  });
export type RelancerCorrectionEntree = z.infer<typeof RelancerCorrectionEntree>;

/** Relance de correction enregistrée (jamais créée par un agent). */
export const RelanceCorrection = z.object({
  id: IdNatif,
  companyId: IdNatif,
  issueId: IdNatif,
  userId: z.string().min(1),
  commentaire: z.string().min(1).max(4000),
  leviers: z.array(LevierRelance).min(1),
  information: z.object({ question: z.string().nullable(), reponse: z.string(), sourceId: IdNatif }).nullable(),
  consigne: z.string().nullable(),
  escalade: EscaladeProducteur.nullable(),
  /** Révision courante au moment de la relance (celle qui a épuisé les cycles). */
  revisionAvant: IdNatif.nullable(),
  /** Nouvelle révision écrite par l'humain (levier d). */
  revisionCorrigee: IdNatif.nullable(),
  cyclesConsommes: z.number().int().nonnegative(),
  maximumAvant: z.number().int().positive(),
  maximumApres: z.number().int().positive(),
  mode: ModeExecution,
  creeLe: Horodatage,
});
export type RelanceCorrection = z.infer<typeof RelanceCorrection>;

/** Cycles de correction d'une tâche sous porte, calculés (jamais copiés). */
export const EtatCycles = z.object({
  /** Révisions distinctes refusées (verdict CHANGES_REQUESTED ou porte REFUS), révision courante comprise. */
  consommes: z.number().int().nonnegative(),
  /** Maximum effectif : réglage de l'entreprise et de la porte, relevé par chaque relance humaine. */
  maximum: z.number().int().positive(),
  epuises: z.boolean(),
  relances: z.number().int().nonnegative(),
});
export type EtatCycles = z.infer<typeof EtatCycles>;

/** Producteur de la tâche, pour proposer la montée d'un cran (levier c). */
export const ProducteurVue = z.object({
  agentId: IdNatif,
  nom: z.string(),
  adaptateur: z.string(),
  modele: z.string().nullable(),
  effort: z.string().nullable(),
  palierSuivant: ConfigModele.nullable(),
  raisonSansPalier: z.string().nullable(),
});
export type ProducteurVue = z.infer<typeof ProducteurVue>;

/** États de diffusion, séparés de l'état de la tâche et du livrable. */
export const EtatDiffusion = z.enum(["refusee", "simulee", "preparee", "confirmee", "ambigue_a_reconcilier"]);
export type EtatDiffusion = z.infer<typeof EtatDiffusion>;

/** v1.6 (S-7) : révocation d'une preuve d'approbation déjà remise (nouvelle révision, décision, ou humain). */
export const RevocationPreuve = z.object({ le: Horodatage, motif: z.string() });
export type RevocationPreuve = z.infer<typeof RevocationPreuve>;

export const Diffusion = z.object({
  id: IdNatif,
  companyId: IdNatif,
  issueId: IdNatif,
  revisionId: IdNatif,
  decisionId: IdNatif.nullable(),
  action: ActionExterne,
  canal: z.string(),
  compte: z.string().nullable(),
  montantCents: z.number().int().nonnegative().nullable(),
  etat: EtatDiffusion,
  /** Clé d'idempotence : une même demande ne produit qu'un seul effet. */
  cleIdempotence: z.string().min(8).max(200),
  motifRefus: z.string().nullable(),
  mode: ModeExecution,
  creeLe: Horodatage,
  /** v1.5 : appel d'outil de la passerelle visé (mode réel), sinon null. */
  service: z.string().nullable().default(null),
  outil: z.string().nullable().default(null),
  /**
   * v1.5 (revue de sécurité §6) : preuve d'approbation signée (Ed25519) à joindre à l'appel d'outil
   * (`preuve_approbation`), en mode réel seulement. Renvoyée dans la réponse, JAMAIS stockée ni journalisée.
   */
  preuveApprobation: z.string().max(4000).nullable().optional(),
  /**
   * v1.6 (S-4) : expiration (secondes Unix) de LA preuve de cette diffusion, figée à la première
   * signature ; un rejeu rend la même preuve, jamais une expiration plus lointaine. Null sans preuve.
   */
  preuveExpire: z.number().int().nonnegative().nullable().optional(),
  /** v1.6 (S-7) : preuve révoquée (plus jamais rendue ; la passerelle la refuse via la liste signée). */
  revocation: RevocationPreuve.nullable().optional(),
});
export type Diffusion = z.infer<typeof Diffusion>;

/* ------------------------------------------------------------------ */
/* v1.6 : appel d'outil proposé par l'agent, approuvé par l'humain       */
/* ------------------------------------------------------------------ */

/** Entrée de `tache.appels.proposer` (stricte) : l'appel EXACT que l'agent fera sur la passerelle. */
export const ProposerAppelEntree = z
  .object({
    revisionId: IdNatif,
    service: z.enum(["facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"]),
    outil: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u),
    compte: z.string().min(1).max(200),
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ProposerAppelEntree = z.infer<typeof ProposerAppelEntree>;

/** Ligne d'aperçu : un champ de l'appel, nommé pour l'humain. */
export const ChampApercu = z.object({
  /** Chemin dans les arguments (`message`, `properties.hs_lead_status`…). */
  champ: z.string(),
  libelle: z.string(),
  /** Valeur exacte, en texte (JSON pour une liste). */
  valeur: z.string(),
});
export type ChampApercu = z.infer<typeof ChampApercu>;

/**
 * Appel proposé, avec l'aperçu que l'interface DOIT afficher avant l'approbation : outil, compte, cible
 * (destinataire, contact, fiche), textes publiés et propriétés CRM (noms ET valeurs), plus l'empreinte.
 * `approbation` est l'objet à recopier tel quel dans `portee.appel` de la décision.
 */
export const AppelPropose = z.object({
  id: IdNatif,
  issueId: IdNatif,
  revisionId: IdNatif,
  service: z.string(),
  outil: z.string(),
  action: z.enum(["publier", "envoyer", "modifier_crm"]),
  compte: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  empreinte: Empreinte,
  apercu: z.object({
    resume: z.string(),
    cibles: z.array(ChampApercu),
    textes: z.array(ChampApercu),
    proprietes: z.array(ChampApercu),
  }),
  approbation: AppelApprouve,
  /** Vrai si l'appel vise la révision courante du livrable (sinon il ne peut plus être approuvé). */
  revisionCourante: z.boolean(),
  proposePar: z.string(),
  creeLe: Horodatage,
});
export type AppelPropose = z.infer<typeof AppelPropose>;

/** Entrée de la révocation humaine d'une preuve (`tache.diffusions.revoquer`, `atelier.diffusion.revoquer`). */
export const RevoquerPreuveEntree = z.object({ motif: z.string().trim().min(3).max(500) }).strict();
export type RevoquerPreuveEntree = z.infer<typeof RevoquerPreuveEntree>;

/** Services de la passerelle qui ont des outils d'écriture (revue de sécurité §6). */
export const ServicePublication = z.enum(["facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"]);
export type ServicePublication = z.infer<typeof ServicePublication>;

export const DemanderDiffusionEntree = z.object({
  revisionId: IdNatif,
  action: ActionExterne.exclude(["aucune_action_externe"]),
  canal: z.string().min(1).max(100),
  compte: z.string().min(1).max(200).nullable().default(null),
  audience: z.string().min(1).max(500).nullable().default(null),
  montantCents: z.number().int().nonnegative().nullable().default(null),
  cleIdempotence: z.string().min(8).max(200),
  /** v1.5 : appel d'outil EXACT que l'agent fera sur la passerelle (mode réel) ; signé tel quel. */
  service: ServicePublication.optional(),
  outil: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u).optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
export type DemanderDiffusionEntree = z.infer<typeof DemanderDiffusionEntree>;

/**
 * v1.5 : issue d'une diffusion réelle rapportée après l'appel d'outil de la passerelle
 * (route `tache.diffusions.issue`). L'agent transmet la réponse BRUTE de l'outil ; le serveur
 * vérifie la signature `_atelier` de la passerelle et la lie à la diffusion (service, outil,
 * empreinte des arguments, clé d'idempotence) avant tout changement d'état.
 */
export const RapporterIssueDiffusionEntree = z
  .object({
    reponse: z
      .object({ texte: z.string().min(1).optional(), structuredContent: z.record(z.string(), z.unknown()).optional() })
      .strict()
      .refine((r) => r.texte !== undefined || r.structuredContent !== undefined, "Fournir le texte ou les données structurées de la réponse"),
  })
  .strict();
export type RapporterIssueDiffusionEntree = z.infer<typeof RapporterIssueDiffusionEntree>;

/** Ligne de la matrice exigences / preuves du dossier. */
export const LigneMatrice = z.object({
  exigence: Exigence,
  couverture: DeclarationCouverture.nullable(),
  verdictsParRole: z.record(RoleRevue, z.enum(["PASS", "CHANGES_REQUESTED", "BLOCKED_INFORMATION", "NOT_APPLICABLE_JUSTIFIED", "absent"])),
  examineeParControleur: z.boolean(),
});
export type LigneMatrice = z.infer<typeof LigneMatrice>;

/** Dossier présenté à l'humain (cahier §9). */
export const DossierHumain = z.object({
  issueId: IdNatif,
  companyId: IdNatif,
  campagneId: IdNatif.nullable(),
  titre: z.string(),
  mode: ModeExecution,
  /** Présente si mode = demonstration ; l'interface l'affiche toujours. */
  mentionDemonstration: z.string().nullable(),
  statut: z.object({ statut: StatutFonctionnel, motif: z.string() }),
  brief: z.string().nullable(),
  perimetre: z.object({ etablissements: z.array(z.string()), zones: z.array(z.string()), canaux: z.array(z.string()) }),
  livrable: z
    .object({
      revisionId: IdNatif,
      revisionNumber: z.number().int().positive(),
      titre: z.string().nullable(),
      corps: z.string(),
    })
    .nullable(),
  matrice: z.array(LigneMatrice),
  sources: z.array(Source),
  revues: z.array(VerdictRevue),
  constatsResolus: z.array(Constat),
  constatsRestants: z.array(Constat),
  hypotheses: z.array(Hypothese),
  limites: z.array(z.string()),
  questionsRestantes: z.array(z.object({ exigence: CodeExigence.nullable(), question: z.string() })),
  evaluationPorte: EvaluationPorte.nullable(),
  decisions: z.array(DecisionHumaine),
  diffusions: z.array(z.lazy(() => Diffusion)),
  /** v1.6 (S-1) : appels d'outil proposés par l'agent, avec leur aperçu (la révision courante d'abord). */
  appelsProposes: z.array(z.lazy(() => AppelPropose)).default([]),
  /** Cycles de correction (null hors porte). */
  cycles: EtatCycles.nullable().default(null),
  /** Relances de correction décidées par l'humain, la plus récente en premier. */
  relances: z.array(RelanceCorrection).default([]),
  producteur: ProducteurVue.nullable().default(null),
  /**
   * Run interrompu (arrêt du serveur) qui bloque la tâche : Paperclip ne rejoue rien ;
   * seule la réconciliation humaine native relance le travail (action « Reprendre »).
   * Les effets constatés viennent du journal de l'atelier et des révisions natives.
   */
  interruption: z
    .object({
      runId: IdNatif,
      revisionsLivrable: z.number().int().nonnegative(),
      couverturesDeclarees: z.number().int().nonnegative(),
      diffusions: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
  /** Faux tant qu'aucun connecteur de publication n'existe : le bouton « Diffuser » reste désactivé en réel. */
  connecteurPublication: z.boolean().default(false),
  usage: z.object({
    coutIaCents: z.number().int().nonnegative(),
    /** true si une partie du coût est une estimation (tarif et date affichés). */
    estimation: z.boolean(),
    sourceUsage: z.string(),
    depensesPublicitairesCents: z.number().int().nonnegative().nullable(),
  }),
});
export type DossierHumain = z.infer<typeof DossierHumain>;
