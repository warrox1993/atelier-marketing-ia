/** Réponse compacte de `tache.sources.lire` : ce que l'agent doit lire, sans l'enregistrement complet de la base. */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { CONSIGNE_PASSAGE } from "../src/contrats/connaissances.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PRODUCTEUR, SOC, creerBanc } from "./outils-base.js";

const agent: ActeurHote = { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-1" };

describe("tache.sources.lire : réponse compacte", () => {
  it("renvoie l'identifiant, l'adresse, le titre, le statut et l'extrait, sans les champs internes de la base", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null });
    banc.passe();
    banc.noms.set(PRODUCTEUR, "Prospection"); // N2 : rôle dont la consigne documente la lecture de sources
    const services = creerServices(banc.ctx, { base: banc.base });
    const r = await services.routes["tache.sources.lire"]!({ cle: "tache.sources.lire", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps: { url: "https://renovation-liege.example/" } });
    expect([201, 422]).toContain(r.statut);
    const corps = r.corps as Record<string, unknown>;
    expect(Object.keys(corps)).toEqual(expect.arrayContaining(["id", "url", "titre", "statut", "extrait", "nonFiable", "injectionsSignalees", "mode"]));
    for (const interne of ["companyId", "campagneId", "issueId", "revisionId", "empreinte", "connexion", "connaissance", "provenance", "typeContenu"]) expect(corps, interne).not.toHaveProperty(interne);
    expect(banc.t.sources).toHaveLength(1);
    expect(corps.id).toBe(banc.t.sources[0]!.id);
    // INJ-10 : le texte lu est une donnée, jamais une instruction ; la consigne voyage avec la réponse.
    expect(corps.consigne).toBe(CONSIGNE_PASSAGE);
  });
});
