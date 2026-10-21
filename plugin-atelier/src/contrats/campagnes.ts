/**
 * Campagnes (projet natif), réglages par entreprise, connecteurs, journal.
 */
import { z } from "zod";
import { EtatConnexion, Horodatage, IdNatif, ModeExecution } from "./communs.js";
import { LIMITES } from "./identifiants.js";
import { EngagementPub, PlafondEntree, PlafondPub } from "./plafonds.js";
import { StatutFonctionnel } from "./statuts.js";

/**
 * Campagne de l'atelier. Elle EST un projet natif Paperclip (`projectId`) :
 * son état de pause et d'archivage est celui du projet natif.
 */
export const Campagne = z.object({
  id: IdNatif,
  companyId: IdNatif,
  projectId: IdNatif,
  /** Tâche native du brief (affectée au coordinateur). */
  briefIssueId: IdNatif.nullable(),
  nom: z.string().min(1).max(200),
  objectifs: z.array(z.string().min(1).max(500)).max(20),
  cible: z.string().max(2000).nullable(),
  offre: z.string().max(2000).nullable(),
  canaux: z.array(z.string().min(1).max(100)).max(20),
  perimetre: z.object({
    etablissements: z.array(z.string().min(1).max(200)).max(100),
    zones: z.array(z.string().min(1).max(200)).max(100),
  }),
  /** Montant du plafond publicitaire de la campagne ; `null` si « aucune limite » ou aucun choix (voir `plafondPub`). */
  budgetMaxCents: z.number().int().positive().nullable(),
  /** Choix du client (montant ou « aucune limite »), tracé ; `null` tant qu'aucun choix n'a été fait. */
  plafondPub: PlafondPub.nullable(),
  /** Montants engagés pour cette campagne face à sa limite (calculé à la lecture). */
  engagementPub: EngagementPub,
  mode: ModeExecution,
  /** Lu sur le projet natif (`paused_at`, `archived_at`, `status`). */
  etatProjet: z.object({ statut: z.string(), enPause: z.boolean(), archive: z.boolean() }),
  creeLe: Horodatage,
});
export type Campagne = z.infer<typeof Campagne>;

export const CreerCampagneEntree = z.object({
  companyId: IdNatif,
  /**
   * Projet natif de la campagne, créé au préalable par l'interface
   * (`POST /api/companies/:companyId/projects`) : le SDK des plugins ne crée
   * pas de projet (constaté le 15/10/2026, `PluginProjectsClient`).
   */
  projectId: IdNatif,
  nom: z.string().min(1).max(200),
  brief: z.string().min(1).max(50_000),
  objectifs: z.array(z.string().min(1).max(500)).max(20).default([]),
  cible: z.string().max(2000).nullable().default(null),
  offre: z.string().max(2000).nullable().default(null),
  canaux: z.array(z.string().min(1).max(100)).max(20).default([]),
  etablissements: z.array(z.string().min(1).max(200)).max(100).default([]),
  zones: z.array(z.string().min(1).max(200)).max(100).default([]),
  /**
   * Plafond publicitaire choisi par le client : montant maximal ou « aucune limite ».
   * Réservé à l'humain (refusé à un agent). `null` : aucun choix, donc aucune dépense
   * publicitaire possible tant que ni la campagne ni l'entreprise n'ont choisi.
   */
  plafondPub: PlafondEntree.nullable().default(null),
  /** Ancienne saisie en centimes, conservée pour compatibilité : équivaut à `plafondPub: { type: "montant" }`. 0 est refusé. */
  budgetMaxCents: z.number().int().nonnegative().nullable().default(null),
  mode: ModeExecution.default("reel"),
  /** Agent coordinateur à qui confier la tâche de brief (sinon non affectée). */
  coordinateurAgentId: IdNatif.nullable().default(null),
  /**
   * Création par un agent (rôle `ceo`) seulement : tâche de l'entreprise, assignée à l'agent, dont une
   * demande de confirmation (`request_confirmation`) a été acceptée par un humain. Ignoré pour un humain.
   */
  issueId: IdNatif.optional(),
});
export type CreerCampagneEntree = z.infer<typeof CreerCampagneEntree>;

/** Ligne de tâche d'une campagne : identifiants natifs + statut fonctionnel calculé. */
export const TacheCampagne = z.object({
  issueId: IdNatif,
  identifier: z.string().nullable(),
  titre: z.string(),
  statutNatif: z.string(),
  statut: StatutFonctionnel,
  motif: z.string(),
  assigneeAgentId: IdNatif.nullable(),
  assigneeUserId: z.string().nullable(),
  sousPorte: z.boolean(),
  decisionPorte: z.enum(["PASS", "REFUS", "BLOQUE_INFORMATION"]).nullable(),
  bloqueePar: z.array(IdNatif),
});
export type TacheCampagne = z.infer<typeof TacheCampagne>;

export const ReglagesEntreprise = z.object({
  companyId: IdNatif,
  maxRunsActifs: z.number().int().min(LIMITES.maxRunsActifsMin).max(LIMITES.maxRunsActifsMax),
  maxCyclesCorrection: z.number().int().min(LIMITES.maxCyclesCorrectionMin).max(LIMITES.maxCyclesCorrectionMax),
  modeParDefaut: ModeExecution,
  retentionJours: z.number().int().min(1).max(3650),
  /** Plafond publicitaire de l'entreprise (montant ou « aucune limite ») ; `null` : aucun choix. */
  plafondPub: PlafondPub.nullable(),
  /** Montants engagés pour toute l'entreprise face à ce plafond (calculé à la lecture). */
  engagementPub: EngagementPub,
  modifieLe: Horodatage,
});
export type ReglagesEntreprise = z.infer<typeof ReglagesEntreprise>;

export const EnregistrerReglagesEntree = ReglagesEntreprise.omit({ modifieLe: true, plafondPub: true, engagementPub: true })
  .partial()
  .extend({
    companyId: IdNatif,
    /** Choix du plafond publicitaire (humain seulement) ; `null` retire le choix ; absent : inchangé. */
    plafondPub: PlafondEntree.nullable().optional(),
    /**
     * Mode par défaut : `reel` seulement (faille E1). Le marqueur `demonstration` reste réservé à l'origine
     * d'une donnée simulée (garde des données) et ne peut plus être choisi comme réglage d'une entreprise.
     */
    modeParDefaut: z.literal("reel").optional(),
  });
export type EnregistrerReglagesEntree = z.infer<typeof EnregistrerReglagesEntree>;

/** Contrat d'un connecteur (cahier §13). */
export const NiveauIntegration = z.enum(["implemente_teste", "implemente_non_teste", "contrat_seulement", "non_implemente"]);
export type NiveauIntegration = z.infer<typeof NiveauIntegration>;

export const Connecteur = z.object({
  cle: z.string().min(1).max(64),
  nom: z.string(),
  capacites: z.array(z.enum(["lecture", "preparation_action", "execution_autorisee"])),
  etat: EtatConnexion,
  niveau: NiveauIntegration,
  detail: z.string(),
  verifieLe: Horodatage.nullable(),
});
export type Connecteur = z.infer<typeof Connecteur>;

/** Événement du journal de l'atelier : sert au rattrapage après reconnexion (`afterSeq`). */
export const EvenementJournal = z.object({
  seq: z.number().int().positive(),
  companyId: IdNatif,
  type: z.string().min(1).max(100),
  entite: z.string().min(1).max(64),
  entiteId: z.string().min(1).max(200),
  issueId: IdNatif.nullable(),
  runId: IdNatif.nullable(),
  acteur: z.string().nullable(),
  donnees: z.record(z.string(), z.unknown()),
  creeLe: Horodatage,
});
export type EvenementJournal = z.infer<typeof EvenementJournal>;

export const PageJournal = z.object({
  evenements: z.array(EvenementJournal),
  /** Dernier seq renvoyé ; à repasser en `afterSeq` à la reconnexion. */
  dernierSeq: z.number().int().nonnegative(),
  complet: z.boolean(),
});
export type PageJournal = z.infer<typeof PageJournal>;

/** Une source de données dont le mode (réel ou démonstration) est lu sur la passerelle, jamais supposé. */
export const SourceReelle = z.object({
  cle: z.enum(["bce", "bnb", "osm", "liens", "extraction", "audit"]),
  nom: z.string(),
  reelle: z.boolean(),
  detail: z.string(),
  verifieLe: Horodatage,
});
export type SourceReelle = z.infer<typeof SourceReelle>;

export const SourcesReelles = z.object({
  /** « injoignable » : le worker n'a pas pu lire `/sante` ; « non_configuree » : aucune adresse enregistrée. */
  passerelle: z.enum(["joignable", "injoignable", "non_configuree"]),
  sources: z.array(SourceReelle),
});
export type SourcesReelles = z.infer<typeof SourcesReelles>;

export const Diagnostic = z.object({
  plugin: z.object({ id: z.string(), version: z.string() }),
  espaceBase: z.string(),
  /** Réglage `humainDestinataire` des blocages (optionnel : absent d'un ancien worker). `alerte` : texte à afficher, ou null. */
  destinataireHumain: z.object({ modeDeploiement: z.string(), regle: z.string().nullable(), alerte: z.string().nullable() }).optional(),
  migrationsAppliquees: z.boolean(),
  gardeServeur: z.object({
    /** Patch P1/P2 présent dans le serveur (vérifié par une sonde, pas supposé). */
    p1PolitiqueVerrouillee: EtatConnexion,
    p2PorteDeterministe: EtatConnexion,
    regulateurRuns: EtatConnexion,
  }),
  connecteurs: z.array(Connecteur),
  /** Sources de données lues sur `/sante` de la passerelle (optionnel : absent d'un ancien worker). */
  sourcesReelles: SourcesReelles.optional(),
  verifieLe: Horodatage,
});
export type Diagnostic = z.infer<typeof Diagnostic>;

/** Corps : choix du plafond publicitaire d'une campagne (humain seulement, tracé). `null` retire le choix. */
export const EnregistrerPlafondCampagneEntree = z.object({
  companyId: IdNatif,
  plafondPub: PlafondEntree.nullable(),
});
export type EnregistrerPlafondCampagneEntree = z.infer<typeof EnregistrerPlafondCampagneEntree>;
