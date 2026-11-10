/**
 * Issue 60, tâche 4 : `missions.fichiers-prospects` (GET, humain seulement) liste les fichiers de prospects que des missions
 * sans CRM ont préparés (étape `terminee`, sortie `fichier`). Route réelle par l'aiguillage ; la requête SQL réelle de
 * `base.ts` passe par un faux hôte (mêmes règles que l'hôte : SELECT seul, schéma du plugin, paramètres tous référencés).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/routes.js";
import { ESPACE_BASE } from "../src/contrats/index.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import { creerBase, type BaseAtelier } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";

const AUTRE = "99999999-1111-4111-8111-999999999999";
const AGENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const P = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"];

type Rangee = { companyId: string; missionId: string; issueRacineId: string | null; etat: string; date: string; canal: string; prospectIds: string[] };
const rangee = (companyId: string, n: number, extra: Partial<Rangee> = {}): Rangee => ({
  companyId, missionId: `mission-${n}`, issueRacineId: `issue-${n}`, etat: "cloturee", date: `2026-11-0${(n % 9) + 1}T10:00:00.000Z`, canal: "courriel", prospectIds: P, ...extra,
});

function banc(lignes: Rangee[]) {
  const b = creerBanc();
  const appels: Array<{ companyId: string; limite: number }> = [];
  const ext = {
    missionsAvecFichier: async (companyId: string, limite: number) => {
      appels.push({ companyId, limite });
      return lignes.filter((l) => l.companyId === companyId).slice(0, limite).map(({ companyId: _c, ...reste }) => reste);
    },
  } as Record<string, unknown>;
  const base = new Proxy(b.base as unknown as Record<string, unknown>, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base }));
  const appeler = (o: { agent?: boolean; companyId?: string } = {}) =>
    aiguillage.traiterRequeteApi({
      routeKey: "missions.fichiers-prospects", method: "GET", path: "/missions/fichiers-prospects", params: {}, query: { companyId: o.companyId ?? SOC }, body: undefined,
      actor: o.agent ? { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: "run-1" } : { actorType: "user", actorId: "local-board", userId: "local-board", runId: null },
      companyId: o.companyId ?? SOC, headers: {},
    } as never) as Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { appeler, appels };
}

describe("table des routes", () => {
  it("/missions/fichiers-prospects est déclarée avant /missions/:issueId : l'hôte prend la première route qui correspond (#62)", () => {
    const chemins: string[] = ROUTES_API.map((r) => r.chemin);
    expect(chemins.indexOf("/missions/fichiers-prospects")).toBeGreaterThanOrEqual(0);
    expect(chemins.indexOf("/missions/fichiers-prospects")).toBeLessThan(chemins.indexOf("/missions/:issueId"));
  });
});

describe("missions.fichiers-prospects (route)", () => {
  it("identifiants et nombre seulement, jamais de nom ni de coordonnée", async () => {
    const f = banc([rangee(SOC, 1)]);
    const r = await f.appeler();
    expect(r.status).toBe(200);
    expect(r.body.fichiers).toEqual([{ missionId: "mission-1", issueRacineId: "issue-1", etat: "cloturee", date: "2026-11-02T10:00:00.000Z", canal: "courriel", nombre: 2, prospectIds: P }]);
    expect(Object.keys(r.body.fichiers[0]).sort()).toEqual(["canal", "date", "etat", "issueRacineId", "missionId", "nombre", "prospectIds"]);
  });

  it("autre entreprise exclue : seule l'entreprise de la requête est interrogée", async () => {
    const f = banc([rangee(SOC, 1), rangee(AUTRE, 2)]);
    const r = await f.appeler();
    expect(r.body.fichiers.map((x: { missionId: string }) => x.missionId)).toEqual(["mission-1"]);
    expect(f.appels).toEqual([{ companyId: SOC, limite: 20 }]);
  });

  it("20 missions au plus", async () => {
    const f = banc(Array.from({ length: 25 }, (_, i) => rangee(SOC, i + 1)));
    const r = await f.appeler();
    expect(r.body.fichiers).toHaveLength(20);
  });

  it("refusée à un agent", async () => {
    const f = banc([rangee(SOC, 1)]);
    const r = await f.appeler({ agent: true });
    expect(r.status).toBe(403);
    expect(r.body.fichiers).toBeUndefined();
    expect(f.appels).toEqual([]);
  });
});

describe("base.missionsAvecFichier (SQL réel, règles de l'hôte)", () => {
  function fauxHote(lignes: Array<Record<string, unknown>>) {
    const lectures: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      namespace: ESPACE_BASE,
      async query(sql: string, params: unknown[] = []) {
        if (!/^\s*(select|with)\s/iu.test(sql)) throw new Error("ctx.db.query only allows SELECT statements");
        if (/\b(insert|update|delete|alter|create|drop|truncate)\b/iu.test(sql)) throw new Error(`mutation dans une lecture : ${sql}`);
        const vus = new Set([...sql.matchAll(/\$(\d+)/gu)].map((m) => Number(m[1])));
        if (vus.size !== params.length) throw new Error(`paramètre non référencé : ${sql}`);
        lectures.push({ sql, params });
        return lignes;
      },
      async execute() {
        throw new Error("lecture seule : execute interdit");
      },
    } as unknown as PluginContext["db"];
    return { db, lectures };
  }

  it("filtre par entreprise sur les étapes ET les missions, borne par la limite, et lit la sortie `fichier`", async () => {
    const { db, lectures } = fauxHote([]);
    await creerBase(db).missionsAvecFichier(SOC, 20);
    expect(lectures).toHaveLength(1);
    const { sql, params } = lectures[0]!;
    expect(params).toEqual([SOC, 20]);
    expect(sql).toMatch(/e\.company_id = \$1/u);
    expect(sql).toMatch(/m\.company_id = \$1/u);
    expect(sql).toMatch(/sortie\s*->\s*'fichier'/u);
    expect(sql).toMatch(/limit \$2/u);
    expect(sql).not.toMatch(/\bpublic\./u);
  });

  it("rend missionId, issueRacineId, etat, date, canal, prospectIds ; écarte une sortie `fichier` mal formée", async () => {
    const { db } = fauxHote([
      { mission_id: "m1", issue_racine_id: "i1", etat: "cloturee", date: new Date("2026-11-03T08:00:00.000Z"), fichier: { canal: "courriel", prospectIds: ["a", "b"] } },
      { mission_id: "m2", issue_racine_id: null, etat: "en_cours", date: new Date("2026-11-04T08:00:00.000Z"), fichier: { canal: 3, prospectIds: "x" } },
    ]);
    expect(await creerBase(db).missionsAvecFichier(SOC, 20)).toEqual([
      { missionId: "m1", issueRacineId: "i1", etat: "cloturee", date: "2026-11-03T08:00:00.000Z", canal: "courriel", prospectIds: ["a", "b"] },
    ]);
  });
});
