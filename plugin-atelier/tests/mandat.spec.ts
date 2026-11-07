/** Mandat : une seule confirmation humaine ; la création de campagne par un agent reste dans ce qui a été accepté. */
import { describe, expect, it } from "vitest";
import { horsMandat, lireMandat } from "../src/contrats/mandat.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { COORD, ISSUE, SOC, creerBanc } from "./outils-base.js";

const PROJET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const agent: ActeurHote = { type: "agent", id: COORD, agentId: COORD, userId: null, runId: "run-1" };
const VISEE = { type: "issue_document", key: "mandat", revisionId: "r1" };
const carte = (o: Record<string, unknown> = {}) => ({ id: "int-1", kind: "request_confirmation", status: "accepted", resolvedByUserId: "local-board", resolvedByAgentId: null, payload: { version: 1, prompt: "Accepter le mandat ?", target: VISEE }, ...o });
const mandat = (o: Record<string, unknown> = {}) => JSON.stringify({ objectifs: ["Remplir le stage de mars"], perimetre: ["Namur", "PME locales"], canaux: ["email"], budgetMaxCents: null, ...o });
const corps = (plus: Record<string, unknown> = {}) => ({ companyId: SOC, projectId: PROJET, nom: "Printemps", brief: "Brief.", issueId: ISSUE, ...plus });

function banc(doc: string | null, interactions = [carte()], revision = "r1") {
  const b = creerBanc();
  b.issues.set(ISSUE, { id: ISSUE, companyId: SOC, projectId: null, status: "todo", assigneeAgentId: COORD, title: "Plan" });
  b.interactions.set(ISSUE, interactions);
  if (doc !== null) b.documents.set(`${ISSUE}:mandat`, { latestRevisionId: revision, latestRevisionNumber: 1, title: "Mandat", body: doc });
  return b;
}
async function creer(b: ReturnType<typeof creerBanc>, c: unknown) {
  const s = creerServices(b.ctx, { base: b.base });
  return s.routes["campagnes.creer"]!({ cle: "campagnes.creer", params: {}, query: {}, companyId: SOC, acteur: agent, corps: c }).then((r) => ({ ok: true as const, r }), (e: { code?: string; message?: string }) => ({ ok: false as const, e }));
}

describe("mandat : dans le mandat, sans deuxième carte", () => {
  it("campagne dans le mandat : créée", async () => {
    const b = banc(mandat());
    const r = await creer(b, corps({ canaux: ["Email"], zones: ["namur"], objectifs: ["Remplir le stage de mars"] }));
    expect(r.ok).toBe(true);
    expect(b.t.campagnes).toHaveLength(2);
  });
  it("sans effet externe : la carte unique acceptée suffit (aucune autre carte requise)", async () => {
    const b = banc(mandat());
    expect((await creer(b, corps())).ok).toBe(true);
    expect(b.interactions.get(ISSUE)).toHaveLength(1);
  });
});

describe("mandat : ce qui en sort est refusé, nouvel accord demandé", () => {
  for (const [nom, plus] of [["canal", { canaux: ["sms"] }], ["cible", { cible: "Liège" }], ["zone", { zones: ["Liège"] }], ["objectif", { objectifs: ["Vendre"] }]] as const) {
    it(nom, async () => {
      const b = banc(mandat());
      const r = await creer(b, corps(plus));
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ e: { code: "elevation_refusee" } });
      expect((r as { e: { message: string } }).e.message).toMatch(/nouvel accord/u);
      expect(b.t.campagnes).toHaveLength(1);
    });
  }
  it("budget au-delà du mandat (fonction pure : un agent ne fixe de toute façon aucun plafond)", () => {
    const m = lireMandat(mandat({ budgetMaxCents: 5000 }))!;
    const d = { objectifs: [], cible: null, canaux: [], etablissements: [], zones: [], budgetMaxCents: 6000 };
    expect(horsMandat(m, d)).toEqual(["budget 6000 centimes"]);
    expect(horsMandat(m, { ...d, budgetMaxCents: 5000 })).toEqual([]);
    expect(horsMandat(lireMandat(mandat())!, { ...d, budgetMaxCents: 1 })).toHaveLength(1);
  });
  it("mandat dont la carte n'est pas acceptée par un humain, ou illisible : refusé", async () => {
    for (const b of [banc(mandat(), [carte({ resolvedByUserId: null, resolvedByAgentId: COORD })]), banc("pas du json"), banc(mandat({ extra: 1 }))]) {
      const r = await creer(b, corps());
      expect(r.ok).toBe(false);
      expect(b.t.campagnes).toHaveLength(1);
    }
  });
});

describe("mandat : l'accord vaut pour la révision que l'humain a vue", () => {
  it("mandat réécrit après l'acceptation (révision différente) : 403 elevation_refusee", async () => {
    const b = banc(mandat(), [carte()], "r2");
    const r = await creer(b, corps());
    expect(r).toMatchObject({ ok: false, e: { code: "elevation_refusee" } });
    expect(b.t.campagnes).toHaveLength(1);
  });
  it("carte acceptée sans target vers le mandat alors qu'un mandat existe : refusée", async () => {
    for (const payload of [{ version: 1, prompt: "Plan ?" }, { version: 1, prompt: "x", target: { ...VISEE, key: "plan" } }, { version: 1, prompt: "x", target: { type: "custom", key: "mandat", revisionId: "r1" } }]) {
      const b = banc(mandat(), [carte({ payload })]);
      expect(await creer(b, corps())).toMatchObject({ ok: false, e: { code: "elevation_refusee" } });
    }
  });
  it("sans mandat : une carte d'approbation d'outil, de secret ou de connexion ne vaut pas accord", async () => {
    for (const extra of [{ toolAction: {} }, { secretProposal: {} }, { connectionAuthorization: {} }]) {
      const b = banc(null, [carte({ payload: { version: 1, prompt: "x", ...extra } })]);
      expect(await creer(b, corps())).toMatchObject({ ok: false, e: { code: "elevation_refusee" } });
    }
  });
  it("sans mandat : une carte de plan ordinaire acceptée reste un accord", async () => {
    expect((await creer(banc(null, [carte({ payload: { version: 1, prompt: "Plan ?" } })]), corps())).ok).toBe(true);
  });
});

describe("mandat : effets externes", () => {
  it("le mandat ne remplace pas l'approbation de diffusion : la campagne créée n'a aucune diffusion autorisée", async () => {
    const b = banc(mandat());
    await creer(b, corps());
    expect(b.t.journal.some((j) => /diffusion|publication/u.test(String(j.type)))).toBe(false);
  });
});
