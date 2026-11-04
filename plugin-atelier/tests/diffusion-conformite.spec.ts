/**
 * Audit du 29/10/2026, constat SR2-B-7 (MK-09) : quand la fiche du client active un module de conformité, une
 * diffusion n'est acceptée que si la porte de la tâche a un verdict `conformite` accepté sur la révision courante,
 * quel que soit le gabarit de revues choisi par l'agent (dossier remis à l'humain : revue `exigences` seule).
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PORTE_AGENT, PRODUCTEUR, REV1, REV2, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const producteur: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };
const COMPTE = "urn:li:organization:42";
const demande = { revisionId: REV1, action: "publier", canal: "linkedin", compte: COMPTE, cleIdempotence: "linkedin-publication-conformite" };

/** Tâche « dossier remis à l'humain » : une seule revue requise, `exigences`, déjà passée. */
function banc(o: { module?: boolean; verdictConformite?: { verdict: string; revisionId?: string; justification?: string | null } } = {}) {
  const b = creerBanc();
  b.tacheSousPorte({ status: "done", etape: null, revuesRequises: [{ role: "exigences", agentId: PORTE_AGENT }] });
  b.passe();
  b.decision({ portee: { revisionId: REV1, action: "publier", canal: "linkedin", compte: COMPTE, audience: null, montantMaxCents: null, dureeJours: 30 } });
  if (o.module) {
    (b.base as unknown as { marques: () => Promise<unknown[]> }).marques = async () => [
      { modulesConformite: [{ code: "intermediaire_assurance", entites: [], motsInterdits: [], activeLe: "2026-10-01T00:00:00.000Z", activePar: "local-board" }] },
    ];
  }
  if (o.verdictConformite) {
    b.t.verdicts.push({ companyId: SOC, issueId: ISSUE, revisionId: o.verdictConformite.revisionId ?? REV1, role: "conformite", relecteurId: RELECTEUR, verdict: o.verdictConformite.verdict, justification: o.verdictConformite.justification ?? null, creeLe: b.horloge() });
  }
  const services = creerServices(b.ctx, { base: b.base });
  const demander = () => services.routes["tache.diffusions"]!({ cle: "tache.diffusions", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: producteur, corps: demande });
  return { b, demander };
}

describe("SR2-B-7 : la diffusion exige la revue conformite quand un module de conformité est actif", () => {
  it("module inactif : inchangé, la diffusion est acceptée", async () => {
    const r = await banc().demander();
    expect(r.statut).toBe(201);
  });

  it("module actif, gabarit « dossier remis à l'humain » sans verdict conformite : refusée, motif clair", async () => {
    const { b, demander } = banc({ module: true });
    const r = await demander();
    expect(r.statut).toBe(403);
    expect(r.corps).toMatchObject({ etat: "refusee" });
    expect((r.corps as { motifRefus: string }).motifRefus).toMatch(/conformité.*conformite/u);
    expect(b.t.diffusions[0]).toMatchObject({ etat: "refusee" });
  });

  it("module actif avec un verdict conformite PASS sur la révision courante : acceptée", async () => {
    const r = await banc({ module: true, verdictConformite: { verdict: "PASS" } }).demander();
    expect(r.statut).toBe(201);
  });

  it("module actif : non applicable justifié accepté (comme la porte), sans justification refusé", async () => {
    expect((await banc({ module: true, verdictConformite: { verdict: "NOT_APPLICABLE_JUSTIFIED", justification: "Aucune promesse réglementée." } }).demander()).statut).toBe(201);
    expect((await banc({ module: true, verdictConformite: { verdict: "NOT_APPLICABLE_JUSTIFIED" } }).demander()).statut).toBe(403);
  });

  it("module actif : verdict corrections demandées ou rendu sur une ancienne révision : refusée", async () => {
    expect((await banc({ module: true, verdictConformite: { verdict: "CHANGES_REQUESTED" } }).demander()).statut).toBe(403);
    expect((await banc({ module: true, verdictConformite: { verdict: "PASS", revisionId: REV2 } }).demander()).statut).toBe(403);
  });
});
