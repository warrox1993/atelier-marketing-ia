/**
 * Cycles de correction : une décision humaine remet le compteur de l'atelier à zéro, comme celui du
 * socle (constat réel du 16/10/2026 : tâche SEA renvoyée au travail par un humain, compteur du socle
 * remis à zéro, compteur de l'atelier resté à 3 sur 3, plus aucune revue créée, tâche bloquée).
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, RELECTEUR, REV1, REV2, SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });
const TECH = [{ role: "technique", agentId: RELECTEUR }];
const REV3 = "88888888-8888-4888-8888-888888888883";
const constat = { categorie: "autre", gravite: "majeure", emplacement: "Annonce 1", description: "Lien mort", preuve: "404", correctionAttendue: "Corriger le lien" };
const verdict = (revisionId: string, v: Record<string, unknown>) => ({ revisionId, role: "technique", exigencesExaminees: [], preuvesVerifiees: [], constats: [], constatsResolus: [], ...v });

async function route(banc: ReturnType<typeof creerBanc>, cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = {}) {
  const services = creerServices(banc.ctx, { base: banc.base });
  try {
    return await services.routes[cle as "tache.contexte"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur, corps });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

function nouvelleRevision(banc: ReturnType<typeof creerBanc>, revisionId: string, numero: number) {
  const doc = banc.documents.get(`${ISSUE}:livrable`)!;
  banc.documents.set(`${ISSUE}:livrable`, { ...doc, latestRevisionId: revisionId, latestRevisionNumber: numero });
}

/** Constats encore ouverts : un PASS doit les résoudre (sinon « PASS incohérent »). */
const ouverts = (banc: ReturnType<typeof creerBanc>) => banc.t.constats.filter((c) => c.statutResolution === "ouvert").map((c) => c.findingId as string);

/** Un cycle (maximum 1) consommé sur REV1, nouvelle révision REV2 : cycles épuisés. */
async function cyclesEpuises() {
  const banc = creerBanc();
  banc.tacheSousPorte({ status: "in_progress", etape: null, revuesRequises: TECH, maxCycles: 1 });
  expect((await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [constat] }), { issueId: ISSUE })).statut).toBe(201);
  nouvelleRevision(banc, REV2, 2);
  expect((await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV2, { verdict: "PASS", constatsResolus: ouverts(banc) }), { issueId: ISSUE })).corps).toMatchObject({ code: "conflit" });
  return banc;
}

/** Événement `issue.updated` tel que l'hôte le publie après un PATCH (charge = détails de l'activité). */
async function patchSocle(banc: ReturnType<typeof creerBanc>, actorType: "user" | "agent", de: string, vers: string) {
  creerServices(banc.ctx, { base: banc.base });
  const gestionnaire = banc.evenements.get("issue.updated");
  expect(gestionnaire).toBeDefined();
  await gestionnaire!({
    eventId: "evt-1", eventType: "issue.updated", occurredAt: new Date().toISOString(), actorType, actorId: actorType === "user" ? "local-board" : RELECTEUR,
    entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { source: "comment", status: vers, changes: { status: { from: de, to: vers } } },
  });
}

describe("décision humaine dans le socle : les cycles de l'atelier repartent de zéro", () => {
  it("renvoi au travail par un humain (blocked → in_progress) : la révision suivante est de nouveau relue", async () => {
    const banc = await cyclesEpuises();
    await patchSocle(banc, "user", "blocked", "in_progress");
    expect(banc.t.journal.filter((j) => j.type === "cycles.remise_humaine")).toHaveLength(1);
    expect(await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV2, { verdict: "PASS", constatsResolus: ouverts(banc) }), { issueId: ISSUE })).toMatchObject({ statut: 201 });
  });

  it("après la remise, le compteur reprend : un nouveau refus épuise de nouveau le cycle accordé", async () => {
    const banc = await cyclesEpuises();
    await patchSocle(banc, "user", "blocked", "in_progress");
    expect((await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV2, { verdict: "CHANGES_REQUESTED", constats: [{ ...constat, emplacement: "Annonce 2" }] }), { issueId: ISSUE })).statut).toBe(201);
    nouvelleRevision(banc, REV3, 3);
    expect((await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV3, { verdict: "PASS", constatsResolus: ouverts(banc) }), { issueId: ISSUE })).corps).toMatchObject({ code: "conflit" });
  });

  it("un agent qui change le statut ne s'accorde aucun cycle", async () => {
    const banc = await cyclesEpuises();
    await patchSocle(banc, "agent", "blocked", "in_progress");
    expect(banc.t.journal.filter((j) => j.type === "cycles.remise_humaine")).toHaveLength(0);
    expect((await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV2, { verdict: "PASS", constatsResolus: ouverts(banc) }), { issueId: ISSUE })).corps).toMatchObject({ code: "conflit" });
  });

  it("un changement humain qui n'est pas un renvoi au travail (in_progress → blocked) ne remet rien", async () => {
    const banc = await cyclesEpuises();
    await patchSocle(banc, "user", "in_progress", "blocked");
    expect((await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV2, { verdict: "PASS", constatsResolus: ouverts(banc) }), { issueId: ISSUE })).corps).toMatchObject({ code: "conflit" });
  });
});

describe("décision « demander_correction » de l'atelier : remet aussi les cycles à zéro", () => {
  it("la révision suivante est de nouveau relue", async () => {
    const banc = await cyclesEpuises();
    const r = await route(banc, "tache.decision", humain, { revisionId: REV2, action: "demander_correction", commentaire: "Reprendre les liens morts." }, { issueId: ISSUE });
    expect(r.statut).toBe(201);
    expect(await route(banc, "tache.verdict", agent(RELECTEUR), verdict(REV2, { verdict: "PASS", constatsResolus: ouverts(banc) }), { issueId: ISSUE })).toMatchObject({ statut: 201 });
  });
});
