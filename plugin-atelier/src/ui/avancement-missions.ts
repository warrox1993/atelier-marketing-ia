/**
 * Avancement d'une mission, phase par phase (logique pure, sans interface ni réseau).
 *
 * Une mission est la tâche reçue par un service ; ses étapes sont ses sous-tâches. Chaque sous-tâche est classée dans
 * l'une des six phases de la frise (Stratégie, Production, Coordonnées, Revue, Contrôles, Réponse) d'après son agent
 * (identifiant d'URL ou nom), à défaut d'après des mots de son titre. « Réponse » n'a pas de tâche propre : elle est
 * faite quand la mission elle-même est terminée. Rien n'est écrit nulle part : tout se calcule à partir de ce que
 * l'interface a déjà lu (`cartes-services-lecture.ts`).
 */

export type IdPhase = "strategie" | "production" | "coordonnees" | "revue" | "controles" | "reponse";

export type EtatPhase = "faite" | "en_cours" | "attend_decision" | "a_venir" | "non_prevue";

/** Phases dans l'ordre d'affichage. */
export const PHASES: ReadonlyArray<{ id: IdPhase; libelle: string }> = [
  { id: "strategie", libelle: "Stratégie" },
  { id: "production", libelle: "Production" },
  { id: "coordonnees", libelle: "Coordonnées" },
  { id: "revue", libelle: "Revue" },
  { id: "controles", libelle: "Contrôles" },
  { id: "reponse", libelle: "Réponse" },
];

export const LIBELLES_ETAT: Record<EtatPhase, string> = {
  faite: "faite",
  en_cours: "en cours",
  attend_decision: "attend votre décision",
  a_venir: "à venir",
  non_prevue: "non prévue",
};

const LIBELLES_STATUT: Record<string, string> = {
  backlog: "En attente",
  todo: "À faire",
  in_progress: "En cours",
  in_review: "En revue",
  blocked: "Bloquée",
  done: "Faite",
  cancelled: "Annulée",
};
export const libelleStatutTache = (statut: string): string => LIBELLES_STATUT[statut] ?? statut;

export interface TacheMission {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  agentId: string | null;
  /** Dernière modification (ISO), si l'hôte la donne. */
  maj: string | null;
}

export interface AgentMission {
  id: string;
  nom: string;
  /** Identifiant d'URL de l'agent (ex. « relecteur »). */
  cle: string | null;
  role: string | null;
}

/** Ce que la lecture partagée rapporte pour une mission suivie. */
export interface MissionLue {
  companyId: string;
  slug: string;
  /** Nom du service qui a reçu la mission. */
  nom: string;
  racine: TacheMission;
  filles: TacheMission[];
  agents: AgentMission[];
}

export interface TachePhase extends TacheMission {
  agentNom: string | null;
  /** Lien relatif à l'entreprise du service. */
  lien: string | null;
}

export interface Phase {
  id: IdPhase;
  libelle: string;
  etat: EtatPhase;
  taches: TachePhase[];
  /** Dernière activité (ISO) parmi les tâches de la phase, `null` sans date. */
  derniere: string | null;
}

export interface AvancementMission {
  companyId: string;
  nom: string;
  racine: TachePhase;
  terminee: boolean;
  phases: Phase[];
}

const fermee = (statut: string) => statut === "done" || statut === "cancelled";

/** Minuscules sans accents, ponctuation en espaces : « Réseaux sociaux » et « r-seaux-sociaux » se rejoignent. */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Phase d'un agent d'après son nom puis son identifiant d'URL ; `null` si inconnu. */
const REGLES_AGENT: ReadonlyArray<[RegExp, IdPhase]> = [
  [/\bstrateg/, "strategie"],
  [/\b(prospection|contenus?|veille|seo|sea|reseaux sociaux|r seaux sociaux|crm)\b/, "production"],
  [/\benrichissement\b/, "coordonnees"],
  [/\b(relecteur|conformit\w*)\b/, "revue"],
  [/\b(tests? techniques?|porte)\b/, "controles"],
];

export function phaseDepuisAgent(agent: Pick<AgentMission, "nom" | "cle"> | null | undefined): IdPhase | null {
  if (!agent) return null;
  for (const texte of [normaliser(agent.nom), agent.cle ? normaliser(agent.cle) : ""]) {
    if (!texte) continue;
    for (const [motif, phase] of REGLES_AGENT) if (motif.test(texte)) return phase;
  }
  return null;
}

/** Repli sans agent reconnu : mots du titre de la tâche. */
const REGLES_TITRE: ReadonlyArray<[RegExp, IdPhase]> = [
  [/\bstrateg/, "strategie"],
  [/\b(coordonnees|numeros|telephone)\b/, "coordonnees"],
  [/\b(controle\w*|verification|test\w*)\b/, "controles"],
  [/\b(revue|relecture|conformite)\b/, "revue"],
  [/\b(prospection|redaction|production|creation|contenu\w*|veille|publication)\b/, "production"],
];

export function phaseDepuisTitre(titre: string): IdPhase | null {
  const t = normaliser(titre);
  for (const [motif, phase] of REGLES_TITRE) if (motif.test(t)) return phase;
  return null;
}

/** Phase d'une sous-tâche : agent reconnu d'abord, titre ensuite, sinon Production (le travail de fond). */
export function classerTache(tache: Pick<TacheMission, "title" | "agentId">, agents: ReadonlyMap<string, AgentMission>): IdPhase {
  return phaseDepuisAgent(tache.agentId ? agents.get(tache.agentId) : null) ?? phaseDepuisTitre(tache.title) ?? "production";
}

/** État d'une phase qui a des tâches. */
export function etatDesTaches(taches: ReadonlyArray<Pick<TacheMission, "status">>, enAttenteDeDecision: boolean): EtatPhase {
  if (taches.length === 0) return "a_venir";
  if (enAttenteDeDecision && taches.some((t) => !fermee(t.status))) return "attend_decision";
  return taches.every((t) => fermee(t.status)) ? "faite" : "en_cours";
}

const plusRecent = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));

/**
 * Calcule la frise d'une mission. `identifiantsEnAttente` : identifiants lisibles des tâches qui portent une carte de
 * décision humaine en attente (lecture des cartes déjà faite par l'interface).
 */
export function avancementMission(mission: MissionLue, identifiantsEnAttente: ReadonlySet<string> = new Set()): AvancementMission {
  const agents = new Map(mission.agents.map((a) => [a.id, a]));
  const prefixe = (t: TacheMission) => t.identifier?.split("-")[0];
  const enrichie = (t: TacheMission): TachePhase => ({
    ...t,
    agentNom: (t.agentId && agents.get(t.agentId)?.nom) || null,
    lien: t.identifier && prefixe(t) ? `/${prefixe(t)}/issues/${t.identifier}` : null,
  });
  const attend = (t: TacheMission) => t.identifier !== null && identifiantsEnAttente.has(t.identifier);
  const terminee = mission.racine.status === "done";

  const parPhase = new Map<IdPhase, TachePhase[]>(PHASES.map((p) => [p.id, []]));
  for (const f of mission.filles) {
    if (f.id === mission.racine.id) continue;
    parPhase.get(classerTache(f, agents))!.push(enrichie(f));
  }

  const phases: Phase[] = PHASES.map(({ id, libelle }) => {
    const taches = parPhase.get(id)!;
    let etat: EtatPhase;
    if (id === "reponse") {
      etat = terminee ? "faite" : attend(mission.racine) ? "attend_decision" : "a_venir";
    } else {
      etat = etatDesTaches(taches, taches.some(attend));
    }
    // Réponse : la date n'a de sens que quand elle est faite (sinon ce serait l'activité de la mission entière).
    const sources = id === "reponse" ? (terminee ? [mission.racine] : []) : taches;
    return { id, libelle, etat, taches: id === "reponse" ? [] : taches, derniere: sources.reduce<string | null>((m, t) => plusRecent(m, t.maj), null) };
  });

  // Une phase sans tâche alors qu'une phase suivante a déjà du travail : elle n'était pas prévue pour cette mission.
  // Réponse n'est jamais « non prévue ». Quand tout le travail est fait mais la mission pas close, la réponse est en cours.
  const reponse = phases[phases.length - 1]!;
  const travail = phases.slice(0, -1);
  for (let i = 0; i < travail.length; i += 1) {
    const p = travail[i]!;
    if (p.taches.length === 0 && (travail.slice(i + 1).some((q) => q.taches.length > 0) || terminee)) p.etat = "non_prevue";
  }
  const avecTaches = travail.filter((p) => p.taches.length > 0);
  if (!terminee && reponse.etat === "a_venir" && avecTaches.length > 0 && avecTaches.every((p) => p.etat === "faite")) reponse.etat = "en_cours";
  return { companyId: mission.companyId, nom: mission.nom, racine: enrichie(mission.racine), terminee, phases };
}

/** Missions en cours d'abord (les plus récemment actives en tête), puis les terminées. */
export function avancements(missions: readonly MissionLue[], identifiantsEnAttente: ReadonlySet<string> = new Set()): { enCours: AvancementMission[]; terminees: AvancementMission[] } {
  const tous = missions.map((m) => avancementMission(m, identifiantsEnAttente));
  const date = (a: AvancementMission) => a.phases.reduce<string | null>((m, p) => plusRecent(m, p.derniere), a.racine.maj) ?? "";
  tous.sort((a, b) => date(b).localeCompare(date(a)));
  return { enCours: tous.filter((a) => !a.terminee && a.racine.status !== "cancelled"), terminees: tous.filter((a) => a.terminee) };
}

/** Phrase lue par un lecteur d'écran pour une phase : « Revue : en cours, 2 tâches ». */
export function annoncePhase(p: Phase): string {
  const n = p.taches.length;
  return `${p.libelle} : ${LIBELLES_ETAT[p.etat]}${n > 0 ? `, ${n} tâche${n > 1 ? "s" : ""}` : ""}`;
}
