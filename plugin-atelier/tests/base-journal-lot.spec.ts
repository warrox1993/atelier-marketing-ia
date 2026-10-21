/**
 * Journal : dédoublonnage par lot (revue du 21/10/2026, F6). Une seule requête pour tous les commentaires, liste passée en
 * JSON (l'hôte aplatit les paramètres tableau, constaté le 16/10/2026), et date du dernier réveil d'une liaison.
 */
import { describe, expect, it } from "vitest";
import { creerBase } from "../src/serveur/base.js";

function baseAvec(rangs: Array<Record<string, unknown>>) {
  const vues: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    namespace: "plugin_atelier_f0322cc62c",
    query: async (sql: string, params: unknown[] = []) => {
      if (params.some((p) => Array.isArray(p))) throw new Error("l'hôte aplatit les paramètres tableau : passer une chaîne JSON");
      vues.push({ sql, params });
      return rangs;
    },
    execute: async () => ({ rowCount: 0 }),
  };
  return { base: creerBase(db as never), vues };
}

describe("journalExistants (par lot)", () => {
  it("une seule requête pour toute la liste, filtrée sur l'entreprise et le type, liste en JSON", async () => {
    const { base, vues } = baseAvec([{ entite_id: "a" }, { entite_id: "c" }]);
    const r = await base.journalExistants("soc", "liaison.etape_relayee", ["a", "b", "c"]);
    expect([...r].sort()).toEqual(["a", "c"]);
    expect(vues).toHaveLength(1);
    expect(vues[0]!.sql).toContain("company_id = $1 and type = $2 and entite_id in (select jsonb_array_elements_text($3::jsonb))");
    expect(vues[0]!.params).toEqual(["soc", "liaison.etape_relayee", '["a","b","c"]']);
  });

  it("liste vide : aucune requête", async () => {
    const { base, vues } = baseAvec([]);
    expect((await base.journalExistants("soc", "t", [])).size).toBe(0);
    expect(vues).toHaveLength(0);
  });
});

describe("derniereDateJournal", () => {
  it("rend la date ISO la plus récente, ou null", async () => {
    const date = new Date("2026-10-21T12:00:00.000Z");
    expect(await baseAvec([{ le: date }]).base.derniereDateJournal("soc", "t", "e")).toBe("2026-10-21T12:00:00.000Z");
    expect(await baseAvec([{ le: null }]).base.derniereDateJournal("soc", "t", "e")).toBeNull();
  });
});
