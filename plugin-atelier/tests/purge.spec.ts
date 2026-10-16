/**
 * Purge des données d'une entreprise : humain seulement, confirmation, à blanc, isolation entre entreprises,
 * couverture de toutes les tables des migrations. Le stock réel est essayé sur une base factice en mémoire.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { creerStockPurge, routesPurge, TABLES_PURGE, type StockPurge } from "../src/serveur/services-purge.js";
import { SOC } from "./outils-base.js";

const AUTRE = "22222222-2222-4222-8222-222222222222";
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "33333333-3333-4333-8333-333333333333", agentId: "33333333-3333-4333-8333-333333333333", userId: null, runId: "run-1" };
const NS = "plugin_atelier_test";

/** Base factice : une table → lignes {company_id}. Comprend seulement les deux requêtes de la purge. */
function fauxeDb(lignes: Record<string, Array<{ company_id: string; [k: string]: unknown }>>) {
  const requetes: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    namespace: NS,
    query: async (sql: string, params: unknown[]) => {
      requetes.push({ sql, params });
      const lecture = /^select to_jsonb\(t\) as ligne from (\S+)\.(\w+) t where company_id = \$1 order by to_jsonb\(t\)::text offset \$2 limit \$3$/.exec(sql);
      if (lecture) {
        if (lecture[1] !== NS) throw new Error(`requête inattendue : ${sql}`);
        const propres = (lignes[lecture[2]!] ?? []).filter((l) => l.company_id === params[0]);
        return propres.slice(Number(params[1]), Number(params[1]) + Number(params[2])).map((ligne) => ({ ligne }));
      }
      const m = /^select count\(\*\)::int as n from (\S+)\.(\w+) where company_id = \$1$/.exec(sql);
      if (!m || m[1] !== NS) throw new Error(`requête inattendue : ${sql}`);
      return [{ n: (lignes[m[2]!] ?? []).filter((l) => l.company_id === params[0]).length }];
    },
    execute: async (sql: string, params: unknown[]) => {
      requetes.push({ sql, params });
      const m = /^delete from (\S+)\.(\w+) where company_id = \$1$/.exec(sql);
      if (!m || m[1] !== NS) throw new Error(`requête inattendue : ${sql}`);
      const avant = (lignes[m[2]!] ??= []);
      lignes[m[2]!] = avant.filter((l) => l.company_id !== params[0]);
      return { rowCount: avant.length - lignes[m[2]!]!.length };
    },
  };
  return { db, requetes };
}

function jeu() {
  const lignes: Record<string, Array<{ company_id: string; [k: string]: unknown }>> = {
    prospects: [{ company_id: SOC }, { company_id: SOC }, { company_id: AUTRE }],
    connaissances_documents: [{ company_id: SOC }, { company_id: AUTRE }, { company_id: AUTRE }],
    connaissances_index: [{ company_id: SOC }, { company_id: AUTRE }],
    journal: [{ company_id: SOC }, { company_id: AUTRE }],
    clients: [{ company_id: AUTRE, donnees_chiffrees: { email: "chv1.autre" } }, { company_id: SOC, donnees_chiffrees: { email: "chv1.AAAA", telephone: "chv1.BBBB" } }],
  };
  const { db, requetes } = fauxeDb(lignes);
  const ctx = { db, logger: { info() {}, warn() {}, error() {}, debug() {} } } as unknown as PluginContext;
  const routes = routesPurge({ ctx });
  const appeler = (r: Partial<RequeteRoute> = {}) =>
    routes["donnees.purger"]!({ cle: "donnees.purger", params: {}, query: {}, corps: { companyId: SOC, confirmer: true }, acteur: HUMAIN, companyId: SOC, ...r });
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  const de = (c: string) => Object.values(lignes).reduce((s, l) => s + l.filter((x) => x.company_id === c).length, 0);
  return { appeler, refus, lignes, requetes, de, routes };
}

describe("purge : route déclarée", () => {
  it("POST /donnees/export, réservée à l'humain (auth board)", () => {
    expect(ROUTES_API.find((x) => x.cle === "donnees.exporter")).toMatchObject({ methode: "POST", chemin: "/donnees/export", auth: "board" });
  });

  it("POST /donnees/purge, réservée à l'humain (auth board)", () => {
    expect(ROUTES_API.find((x) => x.cle === "donnees.purger")).toMatchObject({ methode: "POST", chemin: "/donnees/purge", auth: "board" });
  });
});

describe("purge : couverture des tables", () => {
  it("TABLES_PURGE contient exactement les tables des migrations qui portent company_id", () => {
    const dossier = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
    const attendues = new Set<string>();
    for (const f of readdirSync(dossier).filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(join(dossier, f), "utf-8");
      for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS \S+?\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
        if (/\bcompany_id\s+uuid\b/.test(m[2]!)) attendues.add(m[1]!);
      }
    }
    expect(attendues.size).toBeGreaterThan(40);
    expect([...TABLES_PURGE].sort()).toEqual([...attendues].sort());
    expect(new Set(TABLES_PURGE).size).toBe(TABLES_PURGE.length);
  });
});

describe("donnees.purger", () => {
  it("supprime toutes les lignes de l'entreprise et jamais celles d'une autre", async () => {
    const f = jeu();
    const avantAutre = f.de(AUTRE);
    const { corps } = await f.appeler();
    expect(corps).toMatchObject({ companyId: SOC, aBlanc: false, supprime: true, total: 6 });
    expect((corps as { tables: Record<string, number> }).tables).toMatchObject({ prospects: 2, connaissances_documents: 1, connaissances_index: 1, journal: 1, clients: 1 });
    expect(f.de(SOC)).toBe(0);
    expect(f.de(AUTRE)).toBe(avantAutre);
    // Chaque suppression est filtrée par l'entreprise de la route.
    const suppressions = f.requetes.filter((q) => q.sql.startsWith("delete"));
    expect(suppressions).toHaveLength(TABLES_PURGE.length);
    expect(suppressions.every((q) => q.params.length === 1 && q.params[0] === SOC && q.sql.endsWith("where company_id = $1"))).toBe(true);
  });

  it("à blanc : rend les comptes par table sans rien supprimer, sans confirmation", async () => {
    const f = jeu();
    const { corps } = await f.appeler({ corps: { companyId: SOC, aBlanc: true } });
    expect(corps).toMatchObject({ aBlanc: true, supprime: false, total: 6 });
    expect(Object.keys((corps as { tables: object }).tables)).toEqual([...TABLES_PURGE]);
    expect(f.de(SOC)).toBe(6);
    expect(f.requetes.some((q) => q.sql.startsWith("delete"))).toBe(false);
  });

  it("refuse un agent (403 elevation_refusee) sans rien toucher", async () => {
    const f = jeu();
    const e = await f.refus(f.appeler({ acteur: AGENT }));
    expect(e?.statut).toBe(403);
    expect(e?.code).toBe("elevation_refusee");
    expect(f.requetes).toHaveLength(0);
    expect(f.de(SOC)).toBe(6);
  });

  it("refuse sans confirmation, avec un corps étranger ou invalide, sans rien supprimer", async () => {
    const f = jeu();
    expect((await f.refus(f.appeler({ corps: { companyId: SOC } })))?.statut).toBe(400);
    expect((await f.refus(f.appeler({ corps: { companyId: SOC, confirmer: false } })))?.statut).toBe(400);
    expect((await f.refus(f.appeler({ corps: { companyId: AUTRE, confirmer: true } })))?.statut).toBe(404);
    expect((await f.refus(f.appeler({ corps: { companyId: SOC, confirmer: true, tout: true } })))?.statut).toBe(400);
    expect(f.requetes).toHaveLength(0);
    expect(f.de(SOC)).toBe(6);
  });

  it("échoue si une ligne résiste à la suppression", async () => {
    const stock: StockPurge = { compter: async () => ({ prospects: 1 }), lire: async () => [], supprimer: async () => {} };
    const routes = routesPurge({ ctx: { logger: { info() {} } } as unknown as PluginContext, stock });
    const e = await routes["donnees.purger"]!({ cle: "donnees.purger", params: {}, query: {}, corps: { companyId: SOC, confirmer: true }, acteur: HUMAIN, companyId: SOC })
      .then(() => null, (x: unknown) => x as ErreurAtelier);
    expect(e?.statut).toBe(500);
    expect(e?.message).toContain("prospects (1)");
  });

  it("le stock réel compte et supprime par entreprise", async () => {
    const lignes = { prospects: [{ company_id: SOC }, { company_id: AUTRE }] };
    const stock = creerStockPurge(fauxeDb(lignes).db as unknown as PluginContext["db"]);
    expect((await stock.compter(SOC)).prospects).toBe(1);
    await stock.supprimer(SOC);
    expect(lignes.prospects).toEqual([{ company_id: AUTRE }]);
  });
});

describe("donnees.exporter", () => {
  const exporter = (f: ReturnType<typeof jeu>, corps: Record<string, unknown>, acteur: ActeurHote = HUMAIN) =>
    f.routes["donnees.exporter"]!({ cle: "donnees.exporter", params: {}, query: {}, corps: { companyId: SOC, ...corps }, acteur, companyId: SOC });

  it("sans table : rend les comptes par table (la liste est celle de la purge), sans rien modifier", async () => {
    const f = jeu();
    const { corps } = await exporter(f, {});
    expect(Object.keys((corps as { tables: object }).tables)).toEqual([...TABLES_PURGE]);
    expect(corps).toMatchObject({ companyId: SOC, total: 6 });
    expect(f.requetes.every((q) => q.sql.startsWith("select"))).toBe(true);
    expect(f.de(SOC)).toBe(6);
  });

  it("avec une table : rend seulement les lignes de l'entreprise de la route, jamais celles d'une autre", async () => {
    const f = jeu();
    const { corps } = await exporter(f, { table: "connaissances_documents" });
    expect(corps).toMatchObject({ table: "connaissances_documents", total: 1, decalage: 0, suivant: null, lignes: [{ company_id: SOC }] });
    const lectures = f.requetes.filter((q) => q.sql.startsWith("select to_jsonb"));
    expect(lectures).toHaveLength(1);
    expect(lectures[0]!.params[0]).toBe(SOC);
  });

  it("pagine : décalage, limite et curseur suivant jusqu'à la dernière page", async () => {
    const f = jeu();
    const p1 = (await exporter(f, { table: "prospects", limite: 1 })).corps as { lignes: unknown[]; suivant: number | null; total: number };
    expect(p1).toMatchObject({ total: 2, suivant: 1 });
    expect(p1.lignes).toHaveLength(1);
    const p2 = (await exporter(f, { table: "prospects", limite: 1, decalage: 1 })).corps as { lignes: unknown[]; suivant: number | null };
    expect(p2.lignes).toHaveLength(1);
    expect(p2.suivant).toBeNull();
  });

  it("les colonnes chiffrées restent chiffrées telles que stockées : rien n'est déchiffré", async () => {
    const f = jeu();
    const { corps } = await exporter(f, { table: "clients" });
    expect((corps as { lignes: unknown[] }).lignes).toEqual([{ company_id: SOC, donnees_chiffrees: { email: "chv1.AAAA", telephone: "chv1.BBBB" } }]);
    expect(f.requetes.every((q) => !/decrypt|dechiffr|pgp_|chv1/i.test(q.sql))).toBe(true);
  });

  it("refuse un agent (403) sans toucher à la base", async () => {
    const f = jeu();
    const e = await f.refus(exporter(f, { table: "clients" }, AGENT));
    expect(e?.statut).toBe(403);
    expect(e?.code).toBe("elevation_refusee");
    expect(f.requetes).toHaveLength(0);
  });

  it("refuse une table inconnue (injection comprise), un corps étranger ou invalide, sans lire de ligne", async () => {
    const f = jeu();
    expect((await f.refus(exporter(f, { table: "pg_user" })))?.statut).toBe(400);
    expect((await f.refus(exporter(f, { table: "clients; drop table clients" })))?.statut).toBe(400);
    expect((await f.refus(exporter(f, { companyId: AUTRE, table: "clients" })))?.statut).toBe(404);
    expect((await f.refus(exporter(f, { table: "clients", limite: 100000 })))?.statut).toBe(400);
    expect((await f.refus(exporter(f, { table: "clients", decalage: -1 })))?.statut).toBe(400);
    expect((await f.refus(exporter(f, { table: "clients", confirmer: true })))?.statut).toBe(400);
    expect(f.requetes.some((q) => q.sql.startsWith("select to_jsonb") || q.sql.startsWith("delete"))).toBe(false);
  });
});
