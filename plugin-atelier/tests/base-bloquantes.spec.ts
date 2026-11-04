/**
 * `tachesBloquantes` : relations `blocks` qui visent une tâche, bornées à l'entreprise.
 * Le SQL réel est joué sur un PostgreSQL jetable (méthode : mémoire atelier-migrations-pg-jetable) ; ici, SELECT seul,
 * paramètres attendus, forme de la réponse.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE } from "../src/contrats/index.js";
import { creerBase } from "../src/serveur/base.js";

describe("base.tachesBloquantes", () => {
  it("lit par SELECT, borne la relation ET la tâche bloquante à l'entreprise, rend les identifiants", async () => {
    const appels: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      namespace: ESPACE_BASE,
      query: async (sql: string, params: unknown[] = []) => {
        if (!/^\s*(select|with)\s/iu.test(sql)) throw new Error("ctx.db.query only allows SELECT statements");
        appels.push({ sql, params });
        return [{ bloqueur: "b-1" }, { bloqueur: "b-2" }];
      },
    } as unknown as PluginContext["db"];
    const r = await creerBase(db).tachesBloquantes("entreprise-1", "tache-1");
    expect(r).toEqual(["b-1", "b-2"]);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.params).toEqual(["entreprise-1", "tache-1"]);
    const sql = appels[0]!.sql.replace(/\s+/gu, " ");
    expect(sql).toContain("r.company_id = $1");
    expect(sql).toContain("b.company_id = r.company_id");
    expect(sql).toContain("t.company_id = r.company_id");
    expect(sql).toContain("r.type = 'blocks'");
    expect(sql).toContain("r.related_issue_id = $2");
    expect(sql).toMatch(/limit \d+/u);
  });

  it("tachesSoeurs : SELECT des autres enfants du même parent, bornés à l'entreprise, sans les tâches annulées", async () => {
    const appels: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      namespace: ESPACE_BASE,
      query: async (sql: string, params: unknown[] = []) => {
        if (!/^\s*(select|with)\s/iu.test(sql)) throw new Error("ctx.db.query only allows SELECT statements");
        appels.push({ sql, params });
        return [{ id: "s-1" }];
      },
    } as unknown as PluginContext["db"];
    expect(await creerBase(db).tachesSoeurs("entreprise-1", "parent-1", "tache-1")).toEqual(["s-1"]);
    expect(appels[0]!.params).toEqual(["entreprise-1", "parent-1", "tache-1"]);
    const sql = appels[0]!.sql.replace(/\s+/gu, " ");
    expect(sql).toContain("company_id = $1");
    expect(sql).toContain("parent_id = $2");
    expect(sql).toContain("id <> $3");
    expect(sql).toContain("'cancelled'");
    expect(sql).toMatch(/limit \d+/u);
  });
});
