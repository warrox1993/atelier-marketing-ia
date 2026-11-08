/**
 * DROIT-1.4 (reste de R2) : purge des prospects sans contact depuis 3 ans, décision de l'opérateur.
 * Action humaine, à blanc par défaut ; mêmes gardes que la remise à zéro (M1) : un prospect qui porte une base
 * légale est gardé, les oppositions ne sont jamais touchées.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ACTIONS_UI, ESPACE_BASE } from "../src/contrats/index.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerBase } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
type Appel = { sql: string; params: unknown[] };

function banc(candidats: number) {
  const lectures: Appel[] = [], ecritures: Appel[] = [];
  const db = {
    namespace: ESPACE_BASE,
    async query(sql: string, params: unknown[] = []) {
      lectures.push({ sql, params });
      return /count\(\*\) as n from \S+\.prospects p/u.test(sql) ? [{ n: String(candidats) }] : [];
    },
    async execute(sql: string, params: unknown[] = []) {
      ecritures.push({ sql, params });
      return { rowCount: /^delete from \S+\.prospects p/u.test(sql) ? candidats : 1 };
    },
  };
  const services = creerServices(creerBanc().ctx, { base: creerBase(db as unknown as PluginContext["db"]) });
  const purger = (p: Record<string, unknown>) => services.actions["atelier.prospects.purger"]!(ACTIONS_UI["atelier.prospects.purger"].params.parse(p), SOC, humain) as Promise<{ avant: string; aBlanc: boolean; candidats: number; supprimes: number }>;
  return { lectures, ecritures, purger };
}

const plat = (s: string) => s.replace(/\s+/gu, " ");

describe("DROIT-1.4 : purge des prospects sans contact depuis 3 ans", () => {
  it("réservée à un humain", () => {
    expect(ACTIONS_UI["atelier.prospects.purger"].humainSeulement).toBe(true);
  });

  it("à blanc par défaut : compte les candidats, ne supprime rien, ne journalise rien", async () => {
    const b = banc(4);
    const r = await b.purger({});
    expect(r).toMatchObject({ aBlanc: true, candidats: 4, supprimes: 0 });
    expect(b.ecritures).toEqual([]);
    // Terme : 3 ans avant aujourd'hui, passé tel quel à la requête.
    const ans = (Date.now() - Date.parse(r.avant)) / (365.25 * 24 * 3600 * 1000);
    expect(ans).toBeGreaterThan(2.99);
    expect(ans).toBeLessThan(3.01);
    expect(b.lectures.find((l) => /prospects p/u.test(l.sql))!.params).toEqual([SOC, r.avant]);
  });

  it("confirmée : supprime avec les gardes légales et journalise ; jamais les oppositions", async () => {
    const b = banc(2);
    const r = await b.purger({ confirmer: true });
    expect(r).toMatchObject({ aBlanc: false, candidats: 2, supprimes: 2 });
    const suppression = b.ecritures.filter((e) => /^delete/u.test(e.sql));
    expect(suppression).toHaveLength(1);
    const sql = plat(suppression[0]!.sql);
    expect(sql).toMatch(/^delete from \S+\.prospects p where p\.company_id = \$1 and p\.modifie_le < \$2::timestamptz/u);
    expect(sql).toContain("not exists (select 1 from");
    expect(sql).toContain(".bases_legales b where b.prospect_id = p.id)");
    expect(sql).toMatch(/exports_crm e where .* e\.cree_le >= \$2::timestamptz/u);
    expect(sql).toMatch(/issues_commerciales i where i\.prospect_id = p\.id and i\.date_issue >= \$2::timestamptz/u);
    for (const e of b.ecritures) expect(e.sql).not.toMatch(/^delete from \S+\.(oppositions|listes_dncm|dncm_empreintes|bases_legales)\b/u);
    const journal = b.ecritures.find((e) => /^insert into \S+\.journal/u.test(e.sql));
    expect(journal?.params).toContain("prospects.purges");
  });
});
