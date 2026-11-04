/**
 * Contexte d'une tâche : champ `dossierSujet` (tâche porteuse, révision, rubriques présentes), null sans dossier.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { RUBRIQUES_DOSSIER } from "../src/serveur/dossier-sujet.js";
import { ISSUE, PRODUCTEUR, SOC, creerBanc } from "./outils-base.js";

const producteur: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };
const REV_DOSSIER = "99999999-9999-4999-8999-999999999999";
const PARENTE = "aaaaaaaa-0000-4000-8000-0000000000aa";

async function contexte(banc: ReturnType<typeof creerBanc>, query: Record<string, string> = {}) {
  const services = creerServices(banc.ctx, { base: banc.base });
  return services.routes["tache.contexte"]!({ cle: "tache.contexte", params: { issueId: ISSUE }, query, companyId: SOC, acteur: producteur, corps: null });
}

const document = (body: string) => ({ latestRevisionId: REV_DOSSIER, latestRevisionNumber: 1, title: "Dossier", body, updatedByAgentId: PRODUCTEUR, createdByAgentId: PRODUCTEUR });

describe("tache.contexte : dossierSujet", () => {
  it("null quand aucune tâche ne porte de dossier", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte();
    const r = await contexte(banc, { vue: "complete" });
    expect((r.corps as { dossierSujet: unknown }).dossierSujet).toBeNull();
  });

  it("rend la tâche, la révision et les rubriques présentes, dans les vues complète et résumée", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte();
    banc.documents.set(`${ISSUE}:dossier-sujet`, document("## Sujet\n\nUn jeu.\n\n## Ton\n\nDrôle.\n\n## Droits\n\n"));
    const attendu = { issueId: ISSUE, revisionId: REV_DOSSIER, rubriques: ["Sujet", "Ton"] };
    expect(((await contexte(banc, { vue: "complete" })).corps as { dossierSujet: unknown }).dossierSujet).toEqual(attendu);
    expect(((await contexte(banc)).corps as { dossierSujet: unknown }).dossierSujet).toEqual(attendu);
  });

  it("le trouve sur la tâche parente", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte();
    banc.issues.get(ISSUE)!.parentId = PARENTE;
    banc.issues.set(PARENTE, { id: PARENTE, companyId: SOC, status: "done" });
    banc.documents.set(`${PARENTE}:dossier-sujet`, document(RUBRIQUES_DOSSIER.map((n) => `## ${n}\n\ntexte`).join("\n\n")));
    const r = await contexte(banc, { vue: "complete" });
    expect((r.corps as { dossierSujet: unknown }).dossierSujet).toEqual({ issueId: PARENTE, revisionId: REV_DOSSIER, rubriques: [...RUBRIQUES_DOSSIER] });
  });
});
