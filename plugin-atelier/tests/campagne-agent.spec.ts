/**
 * Création de campagne par un agent (`campagnes.creer`) : seul le Coordinateur (rôle ceo) le peut, depuis une
 * tâche qui lui est assignée et dont le plan (`request_confirmation`) a été accepté par un humain ; toujours en
 * démonstration et sans plafond publicitaire. L'humain garde le comportement d'origine.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { COORD, ISSUE, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const PROJET_NEUF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTRE_SOCIETE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });
const corps = (plus: Record<string, unknown> = {}) => ({ companyId: SOC, projectId: PROJET_NEUF, nom: "Printemps 2027", brief: "Brief de la campagne.", ...plus });
const planAccepte = (o: Record<string, unknown> = {}) => ({ id: "int-1", kind: "request_confirmation", status: "accepted", resolvedByUserId: "local-board", resolvedByAgentId: null, ...o });

function banc(interactions: Array<Record<string, unknown>> = [planAccepte()]) {
  const b = creerBanc();
  b.issues.set(ISSUE, { id: ISSUE, companyId: SOC, projectId: null, status: "todo", assigneeAgentId: COORD, title: "Plan" });
  b.interactions.set(ISSUE, interactions);
  return b;
}

async function creer(b: ReturnType<typeof creerBanc>, acteur: ActeurHote, c: unknown): Promise<{ statut: number; corps: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const services = creerServices(b.ctx, { base: b.base });
  try {
    return (await services.routes["campagnes.creer"]!({ cle: "campagnes.creer", params: {}, query: {}, companyId: SOC, acteur, corps: c })) as { statut: number; corps: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch (err) {
    return { statut: 0, corps: err as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

describe("campagnes.creer : création par un agent", () => {
  it("humain : accepté comme avant, sans issueId", async () => {
    const r = await creer(banc([]), humain, corps({ plafondPub: { type: "aucune_limite" }, mode: "reel" }));
    expect(r.statut).toBe(201);
  });

  it("agent ceo avec plan accepté : 201, mode démonstration, sans plafond, trace dans le journal", async () => {
    const b = banc();
    const r = await creer(b, agent(COORD), corps({ issueId: ISSUE }));
    expect(r.statut).toBe(201);
    expect(r.corps).toMatchObject({ mode: "demonstration", plafondPub: null });
    const nouvelle = b.t.campagnes.at(-1)!;
    expect(nouvelle.mode).toBe("demonstration");
    const trace = b.t.journal.find((j) => j.type === "campagne.creee");
    expect(trace).toMatchObject({ acteur: COORD, donnees: { creeParAgent: true, agentId: COORD, issueOrigineId: ISSUE } });
    expect(b.activite.join("\n")).toMatch(/créée par l'agent .* depuis la tâche/u);
    // Le brief est confié au Coordinateur : il peut ensuite enregistrer ses exigences.
    expect([...b.issues.values()].find((i) => i.title === "Brief : Printemps 2027")?.assigneeAgentId).toBe(COORD);
  });

  it("agent ceo sans plan accepté : 403, rien n'est créé", async () => {
    for (const interactions of [[], [planAccepte({ status: "pending", resolvedByUserId: null })], [planAccepte({ status: "rejected" })], [planAccepte({ kind: "ask_user_questions" })], [planAccepte({ resolvedByUserId: null, resolvedByAgentId: COORD })]]) {
      const b = banc(interactions);
      const r = await creer(b, agent(COORD), corps({ issueId: ISSUE }));
      expect(r.statut).toBe(0);
      expect(r.corps).toMatchObject({ code: "elevation_refusee", statut: 403 });
      expect(r.corps.message).toMatch(/request_confirmation/u);
      expect(b.t.campagnes).toHaveLength(1);
    }
  });

  it("agent sans issueId : 403 qui nomme la condition manquante", async () => {
    const r = await creer(banc(), agent(COORD), corps());
    expect(r.corps).toMatchObject({ code: "elevation_refusee", statut: 403 });
    expect(r.corps.message).toMatch(/issueId/u);
  });

  it("agent non ceo : 403 même avec une tâche et un plan acceptés", async () => {
    const b = banc();
    b.issues.set(ISSUE, { ...b.issues.get(ISSUE)!, assigneeAgentId: RELECTEUR });
    const r = await creer(b, agent(RELECTEUR), corps({ issueId: ISSUE }));
    expect(r.corps).toMatchObject({ code: "elevation_refusee", statut: 403 });
    expect(r.corps.message).toMatch(/ceo/u);
    expect(b.t.campagnes).toHaveLength(1);
  });

  it("tâche d'une autre entreprise ou assignée à un autre agent : refusé", async () => {
    const b = banc();
    b.issues.set(ISSUE, { ...b.issues.get(ISSUE)!, companyId: AUTRE_SOCIETE });
    const autre = await creer(b, agent(COORD), corps({ issueId: ISSUE }));
    expect([403, 404]).toContain(autre.corps.statut);
    const b2 = banc();
    b2.issues.set(ISSUE, { ...b2.issues.get(ISSUE)!, assigneeAgentId: RELECTEUR });
    const pasAssignee = await creer(b2, agent(COORD), corps({ issueId: ISSUE }));
    expect(pasAssignee.corps).toMatchObject({ code: "elevation_refusee", statut: 403 });
    expect(pasAssignee.corps.message).toMatch(/assignée/u);
  });

  it("plafond fourni par un agent : 403 (plafondPub comme budgetMaxCents)", async () => {
    for (const plafond of [{ plafondPub: { type: "montant", montantCents: 5000 } }, { plafondPub: { type: "aucune_limite" } }, { budgetMaxCents: 5000 }]) {
      const b = banc();
      const r = await creer(b, agent(COORD), corps({ issueId: ISSUE, ...plafond }));
      expect(r.corps).toMatchObject({ code: "elevation_refusee", statut: 403 });
      expect(r.corps.message).toMatch(/plafond/u);
      expect(b.t.campagnes).toHaveLength(1);
    }
  });

  it("mode réel demandé par un agent : 403", async () => {
    const b = banc();
    const r = await creer(b, agent(COORD), corps({ issueId: ISSUE, mode: "reel" }));
    expect(r.corps).toMatchObject({ code: "elevation_refusee", statut: 403 });
    expect(r.corps.message).toMatch(/demonstration/u);
    expect(b.t.campagnes).toHaveLength(1);
  });
});
