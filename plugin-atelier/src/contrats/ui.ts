/**
 * Contrat entre le worker et l'interface (lot C).
 *
 * L'interface lit par `usePluginData(cle, params)` et agit par
 * `usePluginAction(cle)(params)` (pont natif de l'hôte). L'hôte ajoute
 * lui-même le `companyId` autorisé : l'interface ne l'invente pas.
 * Les actions marquées « humain seulement » sont refusées si l'acteur
 * authentifié par l'hôte n'est pas un utilisateur (board).
 */
import { z } from "zod";
import { EtatConnexion, Horodatage, IdNatif, ModeExecution } from "./communs.js";
import { Campagne, Connecteur, CreerCampagneEntree, Diagnostic, EnregistrerPlafondCampagneEntree, EnregistrerReglagesEntree, PageJournal, ReglagesEntreprise, TacheCampagne } from "./campagnes.js";
import { Brief, Exigence } from "./exigences.js";
import { EngagementPub, PlafondPub } from "./plafonds.js";
import { DeciderEntree, DecisionHumaine, DemanderDiffusionEntree, Diffusion, DossierHumain, RelanceCorrection, RelancerCorrectionEntree, RevoquerPreuveEntree } from "./dossier.js";
import { MessageAgent } from "./messages.js";
import { DocumentImporte, ImporterDocumentEntree, Source } from "./sources.js";
import { StatutFonctionnel } from "./statuts.js";
import { ReferentielClient, ReferentielSaisie } from "./referentiel.js";

/* ------------------------------------------------------------------ */
/* Emplacements UI déclarés par le manifeste (exports attendus du lot C) */
/* ------------------------------------------------------------------ */

export * from "./ui-constantes.js";

/* ------------------------------------------------------------------ */
/* Vues composées renvoyées par les clés de données                     */
/* ------------------------------------------------------------------ */

export const AgentVue = z.object({
  id: IdNatif,
  nom: z.string(),
  role: z.string(),
  titre: z.string().nullable(),
  /** Statut natif de l'agent (idle, running, paused…). */
  statutNatif: z.string(),
  pauseRaison: z.string().nullable(),
  adaptateur: z.string(),
  etatConnexion: EtatConnexion,
  mode: ModeExecution,
  rapporteA: IdNatif.nullable(),
  tacheEnCours: z.object({ issueId: IdNatif, titre: z.string(), statut: StatutFonctionnel }).nullable(),
  runActifId: IdNatif.nullable(),
  /** Compétences effectivement transmises au dernier run (clé + empreinte), pas seulement désirées. */
  competences: z.array(z.object({ cle: z.string(), empreinte: z.string().nullable(), source: z.enum(["dernier_run", "configuration"]) })),
  blocages: z.array(z.string()),
});
export type AgentVue = z.infer<typeof AgentVue>;

export const VueEquipe = z.object({
  agents: z.array(AgentVue),
  runsActifs: z.number().int().nonnegative(),
  plafondRunsActifs: z.number().int().positive(),
  echangesRecents: z.array(MessageAgent),
  dependances: z.array(z.object({ issueId: IdNatif, titre: z.string(), bloqueePar: z.array(IdNatif) })),
});
export type VueEquipe = z.infer<typeof VueEquipe>;

export const DetailCampagne = z.object({
  campagne: Campagne,
  brief: Brief.nullable(),
  exigences: z.array(Exigence),
  taches: z.array(TacheCampagne),
  /** Règle prudente du lot L9 : réel si la campagne OU l'entreprise est réelle. Seul mode appliqué (porte, données, diffusion). */
  modeEffectif: z.object({ mode: ModeExecution, raison: z.string() }),
  connexionsNecessaires: z.array(Connecteur),
});
export type DetailCampagne = z.infer<typeof DetailCampagne>;

export const ResumeDossier = z.object({
  issueId: IdNatif,
  identifier: z.string().nullable(),
  titre: z.string(),
  campagneId: IdNatif.nullable(),
  statut: StatutFonctionnel,
  motif: z.string(),
  revisionNumber: z.number().int().nullable(),
  decisionPorte: z.enum(["PASS", "REFUS", "BLOQUE_INFORMATION"]).nullable(),
  constatsOuverts: z.number().int().nonnegative(),
  mode: ModeExecution,
  modifieLe: Horodatage,
});
export type ResumeDossier = z.infer<typeof ResumeDossier>;

export const VueContenusAValider = z.object({
  /** Porte franchie, étape humaine en cours. */
  prets: z.array(ResumeDossier),
  /** Bloqués avant validation (porte refusée, information manquante, escalade). Affichés séparément. */
  bloques: z.array(ResumeDossier),
});
export type VueContenusAValider = z.infer<typeof VueContenusAValider>;

export const EtatCalendrier = z.enum(["brouillon", "en_revue", "approuve", "planifie", "publie"]);
export const EntreeCalendrier = z.object({
  issueId: IdNatif,
  titre: z.string(),
  canal: z.string(),
  etat: EtatCalendrier,
  /** Date proposée (intention) : jamais confondue avec une programmation réelle. */
  dateProposee: Horodatage.nullable(),
  /** Programmation réellement confirmée par un connecteur ; null sinon. */
  publicationProgrammee: Horodatage.nullable(),
  fuseau: z.literal("Europe/Brussels"),
  dependancesSatisfaites: z.boolean(),
  mode: ModeExecution,
});
export type EntreeCalendrier = z.infer<typeof EntreeCalendrier>;

export const Mesure = z.object({
  id: IdNatif,
  campagneId: IdNatif.nullable(),
  indicateur: z.string(),
  valeur: z.number(),
  unite: z.string(),
  periodeDebut: Horodatage,
  periodeFin: Horodatage,
  provenance: z.string(),
  importeLe: Horodatage,
});
export const VueResultats = z.object({
  mesures: z.array(Mesure),
  /** Toujours renseigné quand `mesures` est vide : « non mesurable » + connexions nécessaires. */
  absenceDonnees: z.object({ nonMesurable: z.boolean(), connexionsNecessaires: z.array(z.string()), explication: z.string() }).nullable(),
  coutsIa: z.object({
    totalCents: z.number().int().nonnegative(),
    estimation: z.boolean(),
    detail: z.string(),
    /** Coûts IA du mois civil UTC en cours : la fenêtre des budgets natifs de Paperclip. */
    moisCents: z.number().int().nonnegative(),
    /** Budget IA mensuel NATIF de l'entreprise (0 = aucune limite côté Paperclip). */
    budgetMensuelCents: z.number().int().nonnegative(),
  }),
  depensesPublicitaires: z.object({ totalCents: z.number().int().nonnegative(), provenance: z.string() }).nullable(),
  /**
   * Plafonds publicitaires choisis par le client, face aux montants engagés (dépensé + réservé par
   * les approbations). `limiteCents` nul + `choisi` vrai = « aucune limite » ; `choisi` faux = aucun choix.
   */
  plafondsPub: z.object({
    entreprise: z.object({ plafondPub: PlafondPub.nullable(), engagementPub: EngagementPub }),
    campagnes: z.array(z.object({ campagneId: IdNatif, nom: z.string(), plafondPub: PlafondPub.nullable(), engagementPub: EngagementPub })),
  }),
});
export type VueResultats = z.infer<typeof VueResultats>;

export { Marque, MarqueSaisie } from "./marque.js";

export const VueMarque = z.object({
  marque: ReferentielClient.nullable(),
  versions: z.array(z.object({ version: z.number().int(), creeLe: Horodatage })),
  sources: z.array(Source),
  imports: z.array(DocumentImporte),
});
export type VueMarque = z.infer<typeof VueMarque>;

export const EtapeChronologie = z.object({
  horodatage: Horodatage,
  type: z.enum(["tache_lancee", "outil_appele", "message_envoye", "livrable_cree", "controle_echoue", "controle_reussi", "correction", "validation", "decision_humaine", "refus_serveur", "autre"]),
  libelle: z.string(),
  source: z.enum(["run_natif", "activite_native", "journal_atelier"]),
  reference: z.string().nullable(),
});
export const ChronologieExecution = z.object({
  issueId: IdNatif,
  etapes: z.array(EtapeChronologie),
});
export type ChronologieExecution = z.infer<typeof ChronologieExecution>;

/* ------------------------------------------------------------------ */
/* Clés de données et d'actions (figées v1)                            */
/* ------------------------------------------------------------------ */

const Vide = z.object({}).strict();

/** Clé → { params, resultat }. `companyId` est ajouté par l'hôte. */
export const DONNEES_UI = {
  "atelier.sante": { params: Vide, resultat: Diagnostic },
  "atelier.equipe": { params: Vide, resultat: VueEquipe },
  "atelier.campagnes": { params: Vide, resultat: z.array(Campagne) },
  "atelier.campagne": { params: z.object({ campagneId: IdNatif }), resultat: DetailCampagne },
  "atelier.contenus-a-valider": { params: Vide, resultat: VueContenusAValider },
  "atelier.dossier": { params: z.object({ issueId: IdNatif }), resultat: DossierHumain },
  "atelier.calendrier": { params: z.object({ campagneId: IdNatif.optional() }), resultat: z.array(EntreeCalendrier) },
  "atelier.resultats": { params: z.object({ campagneId: IdNatif.optional() }), resultat: VueResultats },
  "atelier.marque": { params: Vide, resultat: VueMarque },
  "atelier.journal": { params: z.object({ afterSeq: z.number().int().nonnegative().default(0), issueId: IdNatif.optional() }), resultat: PageJournal },
  "atelier.chronologie": { params: z.object({ issueId: IdNatif }), resultat: ChronologieExecution },
  "atelier.reglages": { params: Vide, resultat: ReglagesEntreprise },
} as const;
export type CleDonneesUi = keyof typeof DONNEES_UI;

/** Clé → { params, resultat, humainSeulement }. */
export const ACTIONS_UI = {
  "atelier.campagne.creer": { params: CreerCampagneEntree.omit({ companyId: true }), resultat: Campagne, humainSeulement: true },
  "atelier.campagne.pause": { params: z.object({ campagneId: IdNatif, motif: z.string().min(1).max(500) }), resultat: Campagne, humainSeulement: true },
  "atelier.campagne.reprendre": { params: z.object({ campagneId: IdNatif }), resultat: Campagne, humainSeulement: true },
  "atelier.campagne.annuler": { params: z.object({ campagneId: IdNatif, motif: z.string().min(1).max(500) }), resultat: Campagne, humainSeulement: true },
  "atelier.decision": { params: DeciderEntree, resultat: DecisionHumaine, humainSeulement: true },
  "atelier.exigence.exclusion": {
    params: z.object({ exigenceId: IdNatif, decision: z.enum(["autoriser", "refuser"]), justification: z.string().min(10).max(2000) }),
    resultat: Exigence,
    humainSeulement: true,
  },
  "atelier.porte.evaluer": { params: z.object({ issueId: IdNatif }), resultat: z.unknown(), humainSeulement: false },
  /**
   * Relance de correction après épuisement des cycles (décision de l'opérateur du 15/10/2026).
   * Remplace l'ancienne `atelier.porte.lever`, retirée : elle désactivait la porte et
   * permettait donc de clore la tâche sans évaluation PASS (P2 ne s'applique qu'à une
   * porte active). Aucune action ne permet d'accepter un livrable qui n'a pas passé
   * les contrôles.
   */
  "atelier.correction.relancer": { params: RelancerCorrectionEntree, resultat: RelanceCorrection, humainSeulement: true },
  "atelier.import": { params: ImporterDocumentEntree.omit({ companyId: true }), resultat: DocumentImporte, humainSeulement: true },
  "atelier.marque.enregistrer": { params: ReferentielSaisie, resultat: ReferentielClient, humainSeulement: true },
  /** Plafond publicitaire d'une campagne : montant ou « aucune limite » (décision de l'opérateur du 15/10/2026). */
  "atelier.campagne.plafond": { params: EnregistrerPlafondCampagneEntree.omit({ companyId: true }).extend({ campagneId: IdNatif }), resultat: Campagne, humainSeulement: true },
  /**
   * Trace d'un changement de budget IA NATIF (entreprise ou agent) fait par l'humain dans
   * Paperclip : le worker relit la valeur réelle (0 = illimité côté natif) et la journalise.
   */
  "atelier.budget-ia.tracer": {
    params: z.object({ portee: z.enum(["entreprise", "agent"]), agentId: IdNatif.optional(), avantCents: z.number().int().nonnegative().nullable().default(null) }),
    resultat: z.object({ portee: z.enum(["entreprise", "agent"]), agentId: IdNatif.nullable(), budgetMensuelCents: z.number().int().nonnegative(), illimite: z.boolean() }),
    humainSeulement: true,
  },
  "atelier.reglages.enregistrer": { params: EnregistrerReglagesEntree.omit({ companyId: true }), resultat: ReglagesEntreprise, humainSeulement: true },
  "atelier.diffusion.demander": { params: DemanderDiffusionEntree.extend({ issueId: IdNatif }), resultat: Diffusion, humainSeulement: true },
  /** v1.6 (S-7) : révoquer la preuve d'une diffusion réelle préparée (elle n'est plus jamais rendue). */
  "atelier.diffusion.revoquer": { params: RevoquerPreuveEntree.extend({ issueId: IdNatif, diffusionId: IdNatif }), resultat: Diffusion, humainSeulement: true },
  "atelier.planification": {
    params: z.object({ issueId: IdNatif, canal: z.string().min(1).max(100), dateProposee: Horodatage.nullable() }),
    resultat: z.object({ issueId: IdNatif, canal: z.string(), dateProposee: Horodatage.nullable(), fuseau: z.literal("Europe/Brussels"), publicationProgrammee: z.null() }),
    humainSeulement: true,
  },
  "atelier.demo.reinitialiser": { params: z.object({ confirmation: z.literal("REINITIALISER") }), resultat: z.object({ supprimes: z.record(z.string(), z.number()) }), humainSeulement: true },
} as const;
export type CleActionUi = keyof typeof ACTIONS_UI;
