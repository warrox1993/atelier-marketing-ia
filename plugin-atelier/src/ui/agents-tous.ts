/**
 * Logique pure de la page « Agents » (testée sans interface) : lecture des agents de l'API hôte,
 * filtres (état, texte, département), tri et texte de la ligne de résumé.
 */
import { nombre } from "./format.js";

/** Un agent tel que la page l'affiche. */
export interface AgentLigne {
  id: string;
  name: string;
  role: string;
  title: string | null;
  status: string;
  model: string | null;
  /** Dernier battement (ISO) ou null. */
  derniereActivite: string | null;
}

export type FiltreEtat = "tous" | "actifs" | "pause" | "erreur" | "encours";

export const ETATS_FILTRE: ReadonlyArray<{ cle: FiltreEtat; libelle: string }> = [
  { cle: "tous", libelle: "Tous" },
  { cle: "actifs", libelle: "Actifs" },
  { cle: "pause", libelle: "En pause" },
  { cle: "erreur", libelle: "En erreur" },
  { cle: "encours", libelle: "En cours" },
];

const texte = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);

/** Lit la réponse brute de l'hôte (`GET /companies/<id>/agents`) : ignore l'incomplet et les agents supprimés. */
export function agentsPourListe(brut: unknown): AgentLigne[] {
  const liste = Array.isArray(brut) ? brut : ((brut as { items?: unknown[] } | null)?.items ?? []);
  return (liste as Array<Record<string, unknown> | null>).flatMap((a) => {
    const id = texte(a?.["id"]);
    const name = texte(a?.["name"]);
    if (!a || !id || !name || a["status"] === "terminated") return [];
    const config = (a["adapterConfig"] ?? {}) as { model?: unknown };
    return [{ id, name, role: texte(a["role"]) ?? "general", title: texte(a["title"]), status: texte(a["status"]) ?? "inconnu", model: texte(config.model), derniereActivite: texte(a["lastHeartbeatAt"]) }];
  });
}

/** Libellé d'état en texte (jamais seulement une couleur). */
export function libelleEtat(statut: string): string {
  switch (statut) {
    case "running":
      return "en cours d'exécution";
    case "active":
    case "idle":
      return "actif";
    case "paused":
      return "en pause";
    case "error":
      return "en erreur";
    case "pending_approval":
      return "en attente d'approbation";
    default:
      return statut.replaceAll("_", " ");
  }
}

/** « Actifs » regroupe actif, au repos et en cours d'exécution ; « En cours » ne garde que l'exécution en train. */
function dansEtat(statut: string, etat: FiltreEtat): boolean {
  switch (etat) {
    case "tous":
      return true;
    case "actifs":
      return statut === "active" || statut === "idle" || statut === "running";
    case "pause":
      return statut === "paused";
    case "erreur":
      return statut === "error";
    case "encours":
      return statut === "running";
  }
}

const aplatir = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Filtre par état et par texte (nom ou intitulé, sans accent ni casse). */
export function filtrerAgents(agents: readonly AgentLigne[], etat: FiltreEtat, recherche: string): AgentLigne[] {
  const q = aplatir(recherche.trim());
  return agents.filter((a) => dansEtat(a.status, etat) && (q === "" || aplatir(`${a.name} ${a.title ?? ""}`).includes(q)));
}

/** Coordinateur d'abord, puis ordre alphabétique français. */
export function trierAgents(agents: readonly AgentLigne[]): AgentLigne[] {
  const rang = (a: AgentLigne) => (a.role === "ceo" ? 0 : 1);
  return [...agents].sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, "fr"));
}

export interface ResumeAgents {
  agents: number;
  departements: number;
  enCours: number;
  enErreur: number;
  illisibles: number;
  enLecture: number;
}

const pl = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

/** « 233 agents dans 29 départements · 5 en cours · 2 en erreur » (+ départements illisibles ou encore en lecture). */
export function texteResumeAgents(r: ResumeAgents): string {
  const parties = [`${pl(r.agents, "agent", "agents")} dans ${pl(r.departements, "département", "départements")}`, `${nombre(r.enCours)} en cours`, `${nombre(r.enErreur)} en erreur`];
  if (r.illisibles) parties.push(`${pl(r.illisibles, "département illisible", "départements illisibles")}`);
  if (r.enLecture) parties.push(`lecture de ${pl(r.enLecture, "département", "départements")} en cours`);
  return parties.join(" · ");
}
