/**
 * N2 (audit du 29/10) : le serveur lit le web pour un agent seulement s'il est l'agent ASSIGNÉ à la tâche EN COURS
 * et si son rôle documente la route. Le manifeste impose aussi « always-for-agent » (checkout du run vérifié par
 * le socle) ; cette garde est la défense en profondeur du worker. Les humains (board) ne sont pas concernés.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { RequeteRoute } from "./atelier.js";
import { normaliserNom } from "./couverture-prospection.js";
import { erreur } from "./erreurs.js";

/**
 * Rôles autorisés par route (nom de l'agent normalisé par `normaliserNom`) : exactement ceux dont l'AGENTS.md ou une
 * compétence documente la route (parité vérifiée par tests/lecture-web-gardes.spec.ts). Le repérage par le nom
 * suppose qu'un agent ne peut pas changer son nom (patch 0108 du socle, N1).
 */
export const ROLES_LECTURE_WEB = {
  "tache.sources.lire": [
    "analyste technique", "auditeur de securite", "conformite publicitaire", "contenus", "coordinateur", "coordinateur recherche et innovation",
    "enrichissement coordonnees", "explorateur de sources", "integrateur claude et mcp", "prospection", "recherche et selection", "relecteur",
    "relecteur independant", "reseaux sociaux", "sea", "seo local geo", "sourcing", "stratege", "tests techniques", "veille",
    "veille recherche et medias", "veille technique", "veille technologique",
  ],
  "tache.liens.verifier": ["tests techniques"],
  "tache.obs.collecter": ["analyste technique", "integrateur claude et mcp", "veille technique"],
  "tache.obs.sources.proposer": ["explorateur de sources", "veille recherche et medias"],
} as const;
export type CleLectureWeb = keyof typeof ROLES_LECTURE_WEB;

export async function exigerLecteurWeb(hote: Pick<PluginContext, "issues" | "agents">, r: RequeteRoute, cle: CleLectureWeb): Promise<void> {
  if (r.acteur.type !== "agent") return;
  const refus = "La lecture du web est réservée à l'agent assigné à cette tâche, tâche en cours, et aux rôles dont la consigne prévoit cette route.";
  const issue = await hote.issues.get(r.params.issueId ?? "", r.companyId);
  if (!issue || issue.companyId !== r.companyId || !r.acteur.agentId || issue.assigneeAgentId !== r.acteur.agentId || issue.status !== "in_progress") {
    erreur("elevation_refusee", refus);
  }
  const agent = await hote.agents.get(r.acteur.agentId, r.companyId).catch(() => null);
  if (!agent || agent.companyId !== r.companyId || !(ROLES_LECTURE_WEB[cle] as readonly string[]).includes(normaliserNom(agent.name))) {
    erreur("elevation_refusee", refus);
  }
}
