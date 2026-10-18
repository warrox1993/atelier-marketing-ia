/**
 * Logique pure de la vue « Organigramme » (testée sans interface) : agents d'un service rangés selon `reportsTo`,
 * statuts en texte, flux d'un service avec ses voisins, filtre par nom d'agent ou de service.
 */
import type { FluxServiceLu } from "../contrats/departements.js";

/** Champs utiles d'un agent de l'API hôte (`GET /api/companies/{id}/agents`). */
export interface AgentHote {
  id: string;
  name: string;
  role: string;
  title: string | null;
  status: string;
  reportsTo: string | null;
  adapterType: string | null;
}

export interface NoeudAgent {
  agent: AgentHote;
  enfants: NoeudAgent[];
}

/** Lit la réponse brute de l'hôte : ignore ce qui n'a pas d'identifiant et de nom, et les agents supprimés. */
export function agentsDepuisHote(brut: unknown): AgentHote[] {
  const liste = Array.isArray(brut) ? brut : ((brut as { items?: unknown[] } | null)?.items ?? []);
  const texte = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
  return (liste as Array<Record<string, unknown>>).flatMap((a) => {
    const id = texte(a?.["id"]);
    const name = texte(a?.["name"]);
    if (!id || !name || a["status"] === "terminated") return [];
    return [{ id, name, role: texte(a["role"]) ?? "general", title: texte(a["title"]), status: texte(a["status"]) ?? "inconnu", reportsTo: texte(a["reportsTo"]), adapterType: texte(a["adapterType"]) }];
  });
}

const estCoordinateur = (a: AgentHote) => a.role === "ceo";

/** Coordinateur d'abord, puis ordre alphabétique français. */
function comparer(a: AgentHote, b: AgentHote): number {
  if (estCoordinateur(a) !== estCoordinateur(b)) return estCoordinateur(a) ? -1 : 1;
  return a.name.localeCompare(b.name, "fr");
}

/**
 * Arbre des agents d'un service. Les racines sont les agents sans supérieur dans le service (ou dont le supérieur est
 * absent) ; un cycle de `reportsTo` ne fait jamais boucler : ses membres inatteignables deviennent des racines.
 */
export function construireArbre(agents: readonly AgentHote[]): NoeudAgent[] {
  const parId = new Map(agents.map((a) => [a.id, a]));
  const enfantsDe = new Map<string, AgentHote[]>();
  const racines: AgentHote[] = [];
  for (const a of agents) {
    if (a.reportsTo && a.reportsTo !== a.id && parId.has(a.reportsTo)) enfantsDe.set(a.reportsTo, [...(enfantsDe.get(a.reportsTo) ?? []), a]);
    else racines.push(a);
  }
  const vus = new Set<string>();
  const noeud = (a: AgentHote): NoeudAgent => {
    vus.add(a.id);
    return { agent: a, enfants: (enfantsDe.get(a.id) ?? []).filter((e) => !vus.has(e.id)).sort(comparer).map(noeud) };
  };
  const arbre = racines.sort(comparer).map(noeud);
  // Cycle : personne n'y est racine, on prend le premier non atteint de chaque boucle.
  for (const a of [...agents].sort(comparer)) if (!vus.has(a.id)) arbre.push(noeud(a));
  return arbre;
}

/** Coordinateur du service : l'agent de rôle `ceo`, sinon la première racine de l'arbre. */
export function coordinateurDe(agents: readonly AgentHote[]): AgentHote | null {
  return agents.filter(estCoordinateur).sort(comparer)[0] ?? construireArbre(agents)[0]?.agent ?? null;
}

export type FamilleStatut = "actif" | "pause" | "erreur" | "autre";

export function familleStatut(statut: string): FamilleStatut {
  if (statut === "active" || statut === "idle" || statut === "running") return "actif";
  if (statut === "paused") return "pause";
  if (statut === "error") return "erreur";
  return "autre";
}

/** Statut en texte (jamais seulement une couleur). */
export function libelleStatutAgent(statut: string): string {
  switch (familleStatut(statut)) {
    case "actif":
      return "actif";
    case "pause":
      return "en pause";
    case "erreur":
      return "en erreur";
    default:
      return statut === "pending_approval" ? "en attente d'approbation" : statut.replaceAll("_", " ");
  }
}

export interface CompteStatuts {
  total: number;
  actifs: number;
  enPause: number;
  enErreur: number;
}

export function compterStatuts(agents: readonly AgentHote[]): CompteStatuts {
  const f = agents.map((a) => familleStatut(a.status));
  return { total: agents.length, actifs: f.filter((x) => x === "actif").length, enPause: f.filter((x) => x === "pause").length, enErreur: f.filter((x) => x === "erreur").length };
}

export interface LiensService {
  /** Flux dont le service est la source : ce qu'il peut demander aux autres. */
  sortants: FluxServiceLu[];
  /** Flux dont le service est la cible : ce que les autres peuvent lui demander. */
  entrants: FluxServiceLu[];
  /** Slugs des services reliés dans un sens ou dans l'autre (jamais le service lui-même). */
  voisins: Set<string>;
}

/** Flux d'un service et services voisins ; un flux d'un service vers lui-même est ignoré. */
export function liensDuService(flux: readonly FluxServiceLu[], slug: string): LiensService {
  const utiles = flux.filter((f) => f.source !== f.cible);
  const sortants = utiles.filter((f) => f.source === slug).sort((a, b) => a.cible.localeCompare(b.cible, "fr"));
  const entrants = utiles.filter((f) => f.cible === slug).sort((a, b) => a.source.localeCompare(b.source, "fr"));
  return { sortants, entrants, voisins: new Set([...sortants.map((f) => f.cible), ...entrants.map((f) => f.source)]) };
}

/** Minuscules sans accents, pour comparer « Sinistres » et « sinistrés » sans souci de saisie. */
export const normaliser = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export interface ResultatFiltre {
  /** Le nom du service correspond : tout le service reste affiché. */
  service: boolean;
  /** Agents dont le nom ou le titre correspond. */
  agents: Set<string>;
}

/** Vrai quand le service doit rester affiché ; filtre vide : tout reste. */
export function filtrerService(filtre: string, nomService: string, agents: readonly AgentHote[]): ResultatFiltre | null {
  const f = normaliser(filtre);
  if (f === "") return { service: true, agents: new Set() };
  const service = normaliser(nomService).includes(f);
  const trouves = new Set(agents.filter((a) => normaliser(`${a.name} ${a.title ?? ""}`).includes(f)).map((a) => a.id));
  return service || trouves.size > 0 ? { service, agents: trouves } : null;
}
