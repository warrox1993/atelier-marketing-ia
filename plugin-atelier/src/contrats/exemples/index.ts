/**
 * Exemples de réponses (entreprise FICTIVE de rénovation à Liège) pour le
 * lot C : chaque objet est validé contre le schéma de sa clé de données par
 * `tests/contrats.spec.ts`. Ce ne sont pas des données réelles.
 */
import type { CleDonneesUi } from "../ui.js";

const E = "11111111-1111-4111-8111-111111111111"; // entreprise
const P = "22222222-2222-4222-8222-222222222222"; // projet natif (campagne)
const C = "33333333-3333-4333-8333-333333333333"; // campagne
const T = "44444444-4444-4444-8444-444444444444"; // tâche du livrable
const R1 = "55555555-5555-4555-8555-555555555551"; // révision 1
const R2 = "55555555-5555-4555-8555-555555555552"; // révision 2
const AP = "66666666-6666-4666-8666-666666666661"; // agent producteur (contenus)
const AE = "66666666-6666-4666-8666-666666666662"; // contrôleur des exigences
const AC = "66666666-6666-4666-8666-666666666660"; // coordinateur
const H = "2026-10-15T09:00:00.000Z";
const H2 = "2026-10-15T09:20:00.000Z";
const DEMO = "Démonstration : contenu produit par des fixtures déterministes, aucune IA réelle.";

const exigence1 = {
  id: "77777777-7777-4777-8777-777777777771",
  code: "REQ-001",
  companyId: E,
  campagneId: C,
  texteOriginal: "Présenter nos trois établissements : Liège-Guillemins, Herstal et Seraing.",
  interpretation: "Chaque établissement est cité avec son adresse et ses horaires.",
  obligatoire: true,
  criteres: ["Les trois établissements sont nommés", "Adresse et horaires pour chacun"],
  dependances: [],
  elementsAttendus: ["Liège-Guillemins", "Herstal", "Seraing"],
  exclusion: { etat: "aucune", justification: null, demandeePar: null, decideePar: null, decideeLe: null },
  version: 1,
  creeLe: H,
  modifieLe: H,
};

const campagne = {
  id: C,
  companyId: E,
  projectId: P,
  briefIssueId: "44444444-4444-4444-8444-444444444440",
  nom: "Isolation des toitures, automne 2026",
  objectifs: ["Obtenir des demandes de diagnostic qualifiées"],
  cible: "Propriétaires de maisons de la région liégeoise",
  offre: "Diagnostic de toiture (gratuité à confirmer)",
  canaux: ["site", "facebook"],
  perimetre: { etablissements: ["Liège-Guillemins", "Herstal", "Seraing"], zones: ["Liège", "Herstal", "Seraing"] },
  budgetMaxCents: 150000,
  // Plafond choisi par le client (réglage optionnel : montant ou « aucune limite »).
  plafondPub: { type: "montant", montantCents: 150000, decidePar: "local-board", decideLe: H },
  engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: 150000, choisi: true },
  mode: "demonstration",
  etatProjet: { statut: "in_progress", enPause: false, archive: false },
  creeLe: H,
};

const evaluation = {
  id: "88888888-8888-4888-8888-888888888881",
  companyId: E,
  issueId: T,
  revisionId: R2,
  decision: "PASS",
  motifs: [],
  empreinte: "0".repeat(64),
  entreesJusquA: H2,
  perimee: false,
  cyclesEpuises: false,
  evalueePar: "porte-deterministe",
  creeLe: H2,
};

const verdictPass = {
  id: "99999999-9999-4999-8999-999999999992",
  companyId: E,
  issueId: T,
  revisionId: R2,
  role: "exigences",
  relecteur: { type: "agent", id: AE, runId: null },
  verdict: "PASS",
  exigencesExaminees: ["REQ-001"],
  preuvesVerifiees: [
    { revisionId: R2, emplacement: "## Liège-Guillemins", element: "Liège-Guillemins", extrait: "Rue des Guillemins (fictive), du lundi au vendredi", sourceIds: [] },
    { revisionId: R2, emplacement: "## Herstal", element: "Herstal", extrait: "Place de Herstal (fictive), du lundi au samedi", sourceIds: [] },
    { revisionId: R2, emplacement: "## Seraing", element: "Seraing", extrait: "Quai de Seraing (fictif), du mardi au samedi", sourceIds: [] },
  ],
  constats: [],
  constatsResolus: ["F-REQ001-SERAING"],
  limites: ["Horaires repris du brief, non vérifiés en ligne (démonstration)."],
  controlesNonExecutes: [],
  justification: null,
  creeLe: H2,
};

const constatResolu = {
  findingId: "F-REQ001-SERAING",
  companyId: E,
  issueId: T,
  reviewer: { type: "agent", id: AE, runId: null },
  role: "exigences",
  artifactVersion: R1,
  requirementIds: ["REQ-001"],
  categorie: "exigence_manquante",
  gravite: "majeure",
  emplacement: "Livrable entier",
  description: "L'établissement de Seraing n'est pas présenté.",
  preuve: "Aucune section ni mention « Seraing » dans la révision 1.",
  correctionAttendue: "Ajouter une section Seraing avec adresse et horaires.",
  statutResolution: "resolu",
  resoluDansRevision: R2,
  creeLe: H,
};

const message = {
  messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  companyId: E,
  projectId: P,
  campaignId: C,
  runId: null,
  taskId: T,
  sender: { type: "agent", id: AE, runId: null },
  recipient: { type: "agent", id: AP },
  type: "correction_demandee",
  contenu: { type: "correction_demandee", findingIds: ["F-REQ001-SERAING"], texte: "Ajouter Seraing (voir constat)." },
  references: [{ type: "constat", id: "F-REQ001-SERAING" }],
  commentaireNatifId: null,
  horodatage: H,
  etatTraitement: "traite",
  provenance: "agent",
};

const diagnostic = {
  plugin: { id: "atelier.marketing-ia", version: "0.1.0" },
  espaceBase: "plugin_atelier_f0322cc62c",
  migrationsAppliquees: true,
  gardeServeur: { p1PolitiqueVerrouillee: "reel_teste", p2PorteDeterministe: "reel_teste", regulateurRuns: "reel_teste" },
  connecteurs: [
    { cle: "claude_local", nom: "Adaptateur Claude Code (Paperclip)", capacites: ["lecture"], etat: "configure_non_verifie", niveau: "implemente_non_teste", detail: "Jeton d'abonnement non fourni : aucun appel réel effectué.", verifieLe: null },
    { cle: "recherche_web", nom: "Recherche Web", capacites: ["lecture"], etat: "non_connecte", niveau: "non_implemente", detail: "Recherche Web non connectée.", verifieLe: null },
    { cle: "lecture_url", nom: "Lecture d'URL protégée", capacites: ["lecture"], etat: "demonstration", niveau: "implemente_teste", detail: "Corpus de démonstration ; le mode réel suit les mêmes protections.", verifieLe: H },
  ],
  verifieLe: H,
};

const dossier = {
  issueId: T,
  companyId: E,
  campagneId: C,
  titre: "Page « Nos établissements » (démonstration)",
  mode: "demonstration",
  mentionDemonstration: DEMO,
  statut: { statut: "ready_for_human", motif: "Étape d'approbation humaine en cours." },
  brief: "Campagne isolation des toitures. Présenter nos trois établissements : Liège-Guillemins, Herstal et Seraing.",
  perimetre: { etablissements: ["Liège-Guillemins", "Herstal", "Seraing"], zones: ["Liège"], canaux: ["site"] },
  livrable: { revisionId: R2, revisionNumber: 2, titre: "Nos établissements", corps: "## Liège-Guillemins\n…\n## Herstal\n…\n## Seraing\n…" },
  matrice: [
    {
      exigence: exigence1,
      couverture: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        companyId: E,
        issueId: T,
        revisionId: R2,
        code: "REQ-001",
        etat: "couvert",
        preuves: verdictPass.preuvesVerifiees,
        hypotheses: [],
        question: null,
        declareePar: AP,
        creeLe: H2,
      },
      verdictsParRole: { exigences: "PASS", metier: "PASS", technique: "NOT_APPLICABLE_JUSTIFIED" },
      examineeParControleur: true,
    },
  ],
  sources: [],
  revues: [verdictPass],
  constatsResolus: [constatResolu],
  constatsRestants: [],
  hypotheses: [],
  limites: ["Horaires repris du brief, non vérifiés en ligne (démonstration)."],
  questionsRestantes: [],
  evaluationPorte: evaluation,
  decisions: [],
  diffusions: [],
  cycles: { consommes: 1, maximum: 3, epuises: false, relances: 0 },
  relances: [],
  producteur: {
    agentId: AP, nom: "Contenus et création", adaptateur: "process", modele: null, effort: null, palierSuivant: null,
    raisonSansPalier: "Agent de démonstration (adaptateur « process ») : aucun modèle à monter.",
  },
  interruption: null,
  connecteurPublication: false,
  usage: { coutIaCents: 0, estimation: false, sourceUsage: "Démonstration : aucun appel de modèle.", depensesPublicitairesCents: null },
};

export const EXEMPLES_DONNEES: Record<CleDonneesUi, unknown> = {
  "atelier.sante": diagnostic,
  "atelier.equipe": {
    agents: [
      {
        id: AP, nom: "Contenus et création", role: "general", titre: "Producteur de contenus", statutNatif: "idle", pauseRaison: null,
        adaptateur: "process", etatConnexion: "demonstration", mode: "demonstration", rapporteA: AC,
        tacheEnCours: { issueId: T, titre: "Page « Nos établissements »", statut: "ready_for_human" }, runActifId: null,
        competences: [{ cle: "redaction-declinaison-canal", empreinte: null, source: "configuration" }], blocages: [],
      },
    ],
    runsActifs: 0,
    plafondRunsActifs: 3,
    echangesRecents: [message],
    dependances: [],
  },
  "atelier.campagnes": [campagne],
  "atelier.campagne": {
    campagne,
    brief: { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", companyId: E, campagneId: C, issueId: campagne.briefIssueId, texteOriginal: dossier.brief, version: 1, creeLe: H },
    exigences: [exigence1],
    taches: [
      { issueId: T, identifier: "DEM-3", titre: "Page « Nos établissements »", statutNatif: "in_review", statut: "ready_for_human", motif: "Étape d'approbation humaine en cours.", assigneeAgentId: null, assigneeUserId: "local-board", sousPorte: true, decisionPorte: "PASS", bloqueePar: [] },
    ],
    modeEffectif: { mode: "demonstration", raison: "campagne et entreprise en démonstration" },
    connexionsNecessaires: [],
  },
  "atelier.contenus-a-valider": {
    prets: [{ issueId: T, identifier: "DEM-3", titre: "Page « Nos établissements »", campagneId: C, statut: "ready_for_human", motif: "Étape d'approbation humaine en cours.", revisionNumber: 2, decisionPorte: "PASS", constatsOuverts: 0, mode: "demonstration", modifieLe: H2 }],
    bloques: [],
  },
  "atelier.dossier": dossier,
  "atelier.calendrier": [
    { issueId: T, titre: "Page « Nos établissements »", canal: "site", etat: "en_revue", dateProposee: "2026-10-20T08:00:00.000Z", publicationProgrammee: null, fuseau: "Europe/Brussels", dependancesSatisfaites: true, mode: "demonstration" },
  ],
  "atelier.resultats": {
    mesures: [],
    absenceDonnees: { nonMesurable: true, connexionsNecessaires: ["Google Search Console", "Analytics"], explication: "Aucune mesure importée : non mesurable." },
    coutsIa: { totalCents: 0, estimation: false, detail: "Démonstration : aucun appel de modèle.", moisCents: 0, budgetMensuelCents: 0 },
    depensesPublicitaires: null,
    plafondsPub: {
      entreprise: { plafondPub: null, engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: null, choisi: false } },
      campagnes: [{ campagneId: C, nom: "Isolation des toitures, automne 2026", plafondPub: { type: "montant", montantCents: 150000, decidePar: "local-board", decideLe: H }, engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: 150000, choisi: true } }],
    },
  },
  "atelier.marque": {
    marque: {
      id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1", companyId: E, version: 1,
      identite: "Rénovations Meuse et Ourthe (entreprise fictive)", ton: "Clair, concret, sans superlatifs",
      offres: [{ nom: "Diagnostic de toiture", description: "Visite et rapport", confirmee: false }],
      zones: ["Liège", "Herstal", "Seraing"],
      etablissements: [{ nom: "Liège-Guillemins", adresse: null, confirme: true }, { nom: "Herstal", adresse: null, confirme: true }, { nom: "Seraing", adresse: null, confirme: true }],
      affirmationsAutorisees: [], informationsManquantes: ["Gratuité du diagnostic à confirmer"], creeLe: H,
    },
    versions: [{ version: 1, creeLe: H }],
    sources: [],
    imports: [],
  },
  "atelier.journal": {
    evenements: [
      { seq: 41, companyId: E, type: "porte.evaluee", entite: "tache", entiteId: T, issueId: T, runId: null, acteur: "porte-deterministe", donnees: { decision: "PASS", revisionId: R2 }, creeLe: H2 },
    ],
    dernierSeq: 41,
    complet: true,
  },
  "atelier.chronologie": {
    issueId: T,
    etapes: [
      { horodatage: H, type: "tache_lancee", libelle: "Run du producteur démarré", source: "run_natif", reference: null },
      { horodatage: H, type: "livrable_cree", libelle: "Révision 1 du livrable", source: "activite_native", reference: R1 },
      { horodatage: H, type: "controle_echoue", libelle: "Contrôle automatique refusé : REQ-001, Seraing sans preuve", source: "journal_atelier", reference: null },
      { horodatage: H2, type: "correction", libelle: "Révision 2 du livrable", source: "activite_native", reference: R2 },
      { horodatage: H2, type: "controle_reussi", libelle: "Contrôle automatique réussi", source: "journal_atelier", reference: null },
    ],
  },
  "atelier.reglages": { companyId: E, maxRunsActifs: 3, maxCyclesCorrection: 3, modeParDefaut: "demonstration", retentionJours: 365, plafondPub: { type: "montant", montantCents: 150000, decidePar: "local-board", decideLe: H }, engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: 150000, choisi: true }, modifieLe: H },
};
