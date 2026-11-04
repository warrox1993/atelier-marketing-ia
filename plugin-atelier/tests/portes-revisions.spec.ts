/**
 * Audit du 29/10/2026, paquet GP2 : la porte est évaluée à chaque révision avant les revues (LIV-OB-1)
 * et un verdict CHANGES_REQUESTED vide est refusé (LIV-OB-6).
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PRODUCTEUR, RELECTEUR, REV1, SOC, creerBanc } from "./outils-base.js";

const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });

async function route(banc: ReturnType<typeof creerBanc>, cle: string, acteur: ActeurHote, corps: unknown) {
  const services = creerServices(banc.ctx, { base: banc.base });
  try {
    return await services.routes[cle as "tache.contexte"]!({ cle: cle as never, params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur, corps });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

function bancSousPorte() {
  const banc = creerBanc();
  banc.tacheSousPorte({ status: "in_progress", etape: null, corps: "# Page\n\nSeraing, quai du Test 3.", revuesRequises: [{ role: "metier", agentId: RELECTEUR }] });
  banc.t.portes[0]!.exigencesCiblees = ["REQ-001"];
  return banc;
}

const COUVERTURE = { revisionId: REV1, lignes: [{ code: "REQ-001", etat: "couvert", preuves: [{ revisionId: REV1, extrait: "Seraing", emplacement: "ligne 3", element: null }] }] };

describe("LIV-OB-1 : la porte est évaluée sur chaque révision avant les revues", () => {
  it("la couverture d'une révision lance l'évaluation de la porte, puis crée les revues", async () => {
    const banc = bancSousPorte();
    expect(banc.t.evaluations).toHaveLength(0);
    const r = await route(banc, "tache.couverture", agent(PRODUCTEUR), COUVERTURE);
    expect(r.statut).toBe(201);
    const fraiches = banc.t.evaluations.filter((e) => e.revisionId === REV1 && !e.perimee);
    expect(fraiches).toHaveLength(1);
    expect((r.corps as { revues: unknown[] }).revues).toHaveLength(1);
  });
});

describe("LIV-OB-6 : un CHANGES_REQUESTED sans constat nouveau ni justification est refusé", () => {
  async function avecConstatOuvert() {
    const banc = bancSousPorte();
    const premier = await route(banc, "tache.verdict", agent(RELECTEUR), {
      revisionId: REV1, role: "metier", verdict: "CHANGES_REQUESTED",
      constats: [{ requirementIds: [], categorie: "affirmation_non_sourcee", gravite: "majeure", emplacement: "ligne 3", description: "Adresse fausse", preuve: "fiche", correctionAttendue: "corriger" }],
    });
    expect(premier.statut).toBe(201);
    return banc;
  }

  it("maintien des constats ouverts sans justification : refusé", async () => {
    const banc = await avecConstatOuvert();
    const r = await route(banc, "tache.verdict", agent(RELECTEUR), { revisionId: REV1, role: "metier", verdict: "CHANGES_REQUESTED" });
    expect(r.corps).toMatchObject({ code: "entree_invalide" });
  });

  it("maintien des constats ouverts avec justification : accepté", async () => {
    const banc = await avecConstatOuvert();
    const r = await route(banc, "tache.verdict", agent(RELECTEUR), { revisionId: REV1, role: "metier", verdict: "CHANGES_REQUESTED", justification: "Le constat majeur de la ligne 3 reste ouvert." });
    expect(r.statut).toBe(201);
  });
});
