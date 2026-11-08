/**
 * Registre des agents (#49) : `organisation/registre/agents.json` importé, jamais lu sur disque par le worker
 * (même modèle que `serveur/regles-promesses.ts`). Source unique des entrées, sorties, critères et compétences.
 */
import registre from "../../../organisation/registre/agents.json" with { type: "json" };

export type AgentRegistre = (typeof registre.agents)[number];

export function agentDuRegistre(slug: string): AgentRegistre | undefined {
  return registre.agents.find((a) => a.slug === slug);
}
