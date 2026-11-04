/**
 * MK-09 (audit du 29/10/2026) : le verdict de la Conformité publicitaire bloque la porte. Avant, son verdict
 * était un document libre (aucun rôle de revue « conformite ») et un « non publiable » pouvait atteindre l'humain.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MettreSousPorteEntree, RoleRevue } from "../src/contrats/index.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { CAMP, ISSUE, RELECTEUR, REV1, SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });
const ID = "123e4567-e89b-42d3-a456-426614174000";

async function route(banc: ReturnType<typeof creerBanc>, cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = {}) {
  const services = creerServices(banc.ctx, { base: banc.base });
  try {
    return await services.routes[cle as "tache.contexte"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur, corps });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

describe("MK-09 : rôle de revue « conformite »", () => {
  it("le contrat connaît le rôle et accepte quatre revues requises, pas cinq", () => {
    expect(RoleRevue.options).toContain("conformite");
    const revue = (role: string) => ({ role, agentId: ID });
    const base = { companyId: ID, issueId: ID, campagneId: CAMP, exigencesCiblees: ["REQ-001"] };
    expect(MettreSousPorteEntree.safeParse({ ...base, revuesRequises: ["exigences", "metier", "technique", "conformite"].map(revue) }).success).toBe(true);
    expect(MettreSousPorteEntree.safeParse({ ...base, revuesRequises: ["exigences", "metier", "technique", "conformite", "metier"].map(revue) }).success).toBe(false);
  });

  it("un verdict « corrections demandées » de la Conformité refuse la porte", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null, revuesRequises: [{ role: "conformite", agentId: RELECTEUR }] });
    const constat = { categorie: "promesse_excessive", gravite: "majeure", emplacement: "Titre", description: "Rendement promis", preuve: "« 5 % garantis »", correctionAttendue: "Retirer la promesse" };
    const v = await route(banc, "tache.verdict", agent(RELECTEUR), { revisionId: REV1, role: "conformite", verdict: "CHANGES_REQUESTED", exigencesExaminees: [], preuvesVerifiees: [], constats: [constat], constatsResolus: [] }, { issueId: ISSUE });
    expect(v.statut).toBe(201);
    const ev = await route(banc, "tache.porte.evaluer", humain, {}, { issueId: ISSUE });
    expect(ev.corps).toMatchObject({ decision: expect.not.stringMatching(/^PASS$/u) });
    expect((ev.corps as { motifs: Array<{ code: string; role?: string }> }).motifs).toContainEqual(expect.objectContaining({ code: "revue_non_reussie", role: "conformite" }));
  });

  it("migration 030 : la contrainte des verdicts admet chaque rôle du contrat, sans apostrophe dans les commentaires", () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "030_verdicts_role_conformite.sql"), "utf8");
    const lignes = sql.split("\n");
    expect(lignes.filter((l) => l.trimStart().startsWith("--")).some((l) => l.includes("'"))).toBe(false);
    const instructions = lignes.filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(instructions).toMatch(/DROP CONSTRAINT IF EXISTS verdicts_role_check/u);
    const m = /ADD CONSTRAINT verdicts_role_check CHECK \(role IN \(([^)]*)\)\)/u.exec(instructions);
    expect([...m![1]!.matchAll(/'([a-z]+)'/gu)].map((x) => x[1]).sort()).toEqual([...RoleRevue.options].sort());
  });
});
