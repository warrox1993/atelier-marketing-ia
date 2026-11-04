/**
 * Audit du 29/10/2026, HUM-C14 : le rejeu identique d'un verdict (même run, même révision, même rôle,
 * même relecteur) ou d'une couverture déjà déclarée ne crée aucun doublon.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PRODUCTEUR, RELECTEUR, REV1, SOC, creerBanc } from "./outils-base.js";

const agent = (id: string, runId = "run-1"): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId });

type Banc = ReturnType<typeof creerBanc>;

async function route(banc: Banc, cle: string, acteur: ActeurHote, corps: unknown, services = creerServices(banc.ctx, { base: banc.base })) {
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
const REFUS = {
  revisionId: REV1, role: "metier", verdict: "CHANGES_REQUESTED",
  constats: [{ requirementIds: [], categorie: "affirmation_non_sourcee", gravite: "majeure", emplacement: "ligne 3", description: "Adresse fausse", preuve: "fiche", correctionAttendue: "corriger" }],
};

describe("HUM-C14 : idempotence des verdicts et des couvertures", () => {
  it("le rejeu identique d'un verdict par le même run rend le verdict déjà déposé, sans doublon ni constat en plus", async () => {
    const banc = bancSousPorte();
    const premier = await route(banc, "tache.verdict", agent(RELECTEUR), REFUS);
    expect(premier.statut).toBe(201);
    const rejeu = await route(banc, "tache.verdict", agent(RELECTEUR), REFUS);
    expect(rejeu.statut).toBe(200);
    expect((rejeu.corps as { id: string }).id).toBe((premier.corps as { id: string }).id);
    expect((rejeu.corps as { constats: unknown[] }).constats).toHaveLength(1);
    expect(banc.t.verdicts).toHaveLength(1);
    expect(banc.t.constats).toHaveLength(1);
  });

  it("le même verdict déposé par un autre run reste un nouveau verdict", async () => {
    const banc = bancSousPorte();
    expect((await route(banc, "tache.verdict", agent(RELECTEUR), REFUS)).statut).toBe(201);
    expect((await route(banc, "tache.verdict", agent(RELECTEUR, "run-2"), REFUS)).statut).toBe(201);
    expect(banc.t.verdicts).toHaveLength(2);
  });

  it("la même couverture redéclarée sur la même révision n'ajoute aucune ligne ; un changement d'état en ajoute une", async () => {
    const banc = bancSousPorte();
    expect((await route(banc, "tache.couverture", agent(PRODUCTEUR), COUVERTURE)).statut).toBe(201);
    const rejeu = await route(banc, "tache.couverture", agent(PRODUCTEUR), COUVERTURE);
    expect(rejeu.statut).toBe(201);
    expect(banc.t.couvertures).toHaveLength(1);
    const partiel = { ...COUVERTURE, lignes: [{ ...COUVERTURE.lignes[0]!, etat: "partiel" }] };
    expect((await route(banc, "tache.couverture", agent(PRODUCTEUR), partiel)).statut).toBe(201);
    expect((await route(banc, "tache.couverture", agent(PRODUCTEUR), COUVERTURE)).statut).toBe(201);
    expect(banc.t.couvertures.map((c) => c.etat)).toEqual(["couvert", "partiel", "couvert"]);
  });

  it("deux verdicts identiques du même run envoyés en même temps ne créent qu'un verdict et rendent le même identifiant", async () => {
    const banc = bancSousPorte();
    const services = creerServices(banc.ctx, { base: banc.base }); // une instance, comme dans le worker
    const [a, b] = await Promise.all([route(banc, "tache.verdict", agent(RELECTEUR), REFUS, services), route(banc, "tache.verdict", agent(RELECTEUR), REFUS, services)]);
    expect([a.statut, b.statut].sort()).toEqual([200, 201]);
    expect((a.corps as { id: string }).id).toBe((b.corps as { id: string }).id);
    expect(banc.t.verdicts).toHaveLength(1);
    expect(banc.t.constats).toHaveLength(1);
  });

  it("deux couvertures identiques envoyées en même temps n'ajoutent qu'une ligne", async () => {
    const banc = bancSousPorte();
    const services = creerServices(banc.ctx, { base: banc.base });
    const [a, b] = await Promise.all([route(banc, "tache.couverture", agent(PRODUCTEUR), COUVERTURE, services), route(banc, "tache.couverture", agent(PRODUCTEUR), COUVERTURE, services)]);
    expect([a.statut, b.statut]).toEqual([201, 201]);
    expect(banc.t.couvertures).toHaveLength(1);
  });
});
