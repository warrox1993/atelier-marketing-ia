/**
 * Tâches `in_review` sous porte figées (lot 2, T7) : le veilleur ne les réveille pas (`tachesOrphelines` les exclut toujours),
 * mais `tachesFigeesSousPorte` les rend pour que l'accueil les signale. SELECT seul ; le SQL réel est joué sur un PostgreSQL
 * jetable, ici : paramètres, bornes d'entreprise, forme de la réponse.
 */
import { describe, expect, it } from "vitest";
import { creerBase } from "../src/serveur/base.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const NS = "plugin_atelier_f0322cc62c";

function baseEspion(lignes: Array<Record<string, unknown>>) {
  const vues: Array<{ sql: string; params: unknown[] }> = [];
  const base = creerBase({ namespace: NS, query: async (sql: string, params: unknown[]) => (vues.push({ sql: sql.replace(/\s+/gu, " "), params }), lignes), execute: async () => ({ rowCount: 0 }) } as never);
  return { base, vues };
}

describe("base.tachesFigeesSousPorte", () => {
  it("rend la tâche figée avec son propriétaire et l'état de ses revues", async () => {
    const { base, vues } = baseEspion([
      { id: "i-1", identifier: "ABC-5", title: "Page d'accueil", assignee_agent_id: "a-1", agent_nom: "Rédacteur", revue_ouverte: true, le: new Date("2026-11-05T08:00:00Z") },
    ]);
    expect(await base.tachesFigeesSousPorte(SOC)).toEqual([
      { issueId: "i-1", identifier: "ABC-5", titre: "Page d'accueil", agentId: "a-1", agentNom: "Rédacteur", revueOuverte: true, le: "2026-11-05T08:00:00.000Z" },
    ]);
    expect(vues).toHaveLength(1);
    expect(vues[0]!.params).toEqual([SOC, 24]);
  });

  it("SQL : tâche in_review sous porte active, bornée à l'entreprise, sans passage récent ni approbation ni liaison qui la gère", async () => {
    const { base, vues } = baseEspion([]);
    await base.tachesFigeesSousPorte(SOC, 6);
    const { sql, params } = vues[0]!;
    expect(params).toEqual([SOC, 6]);
    expect(sql).toMatch(/^\s*select /iu);
    expect(sql).toContain("i.company_id = $1");
    expect(sql).toContain("i.status = 'in_review'");
    expect(sql).toContain(`from ${NS}.portes p where p.issue_id = i.id and p.actif`);
    expect(sql).toContain("i.updated_at < now() - make_interval(hours => $2::int)");
    expect(sql).toContain("y.status in ('queued', 'running') or y.created_at > now() - make_interval(hours => $2::int)");
    expect(sql).toContain("from public.approvals ap where ap.company_id = i.company_id and ap.status = 'pending'");
    expect(sql).toContain("li.statut = 'en_attente_approbation'");
    // Une revue ouverte et récente (verdict attendu normalement) écarte la tâche.
    expect(sql).toContain("c.parent_id = i.id and c.status not in ('done', 'cancelled') and c.updated_at >= now() - make_interval(hours => $2::int)");
    expect(sql).toMatch(/limit \d+$/u);
  });

  it("tachesOrphelines continue d'exclure les tâches in_review sous porte : aucun réveil de plus", async () => {
    const { base, vues } = baseEspion([]);
    await base.tachesOrphelines(SOC, 15);
    expect(vues[0]!.sql).toContain(`i.status in ('todo', 'in_progress') or not exists (select 1 from ${NS}.portes p where p.issue_id = i.id and p.actif)`);
  });
});
