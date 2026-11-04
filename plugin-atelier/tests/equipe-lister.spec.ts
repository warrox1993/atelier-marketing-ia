/** MK-07 (audit du 29/10/2026) : le coordinateur retrouve l'identifiant d'un agent par son slug, en une lecture compacte. */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { ROUTES_API } from "../src/contrats/routes.js";
import { creerServices } from "../src/serveur/services.js";
import { COORD, SOC, creerBanc } from "./outils-base.js";

const agent: ActeurHote = { type: "agent", id: COORD, agentId: COORD, userId: null, runId: "run-1" };

describe("equipe.lister : équipe compacte de l'entreprise", () => {
  it("rend slug, identifiant, nom, rôle, statut et pause de chaque agent non résilié, sans configuration", async () => {
    const banc = creerBanc();
    (banc.ctx.agents as { list: unknown }).list = async () => [
      { id: "a-1", companyId: SOC, name: "Réseaux sociaux", urlKey: "reseaux-sociaux-2", role: "general", status: "paused", metadata: { atelier: { slug: "reseaux-sociaux" } }, adapterConfig: { secret: "x" } },
      { id: "a-2", companyId: SOC, name: "Veille", urlKey: "veille", role: "general", status: "idle", metadata: null, adapterConfig: {} },
      { id: "a-3", companyId: SOC, name: "Ancien", urlKey: "ancien", role: "general", status: "terminated", metadata: null, adapterConfig: {} },
    ];
    const services = creerServices(banc.ctx, { base: banc.base });
    const r = await services.routes["equipe.lister"]!({ cle: "equipe.lister", params: {}, query: { companyId: SOC }, companyId: SOC, acteur: agent, corps: null });
    expect(r.corps).toEqual({
      agents: [
        { slug: "reseaux-sociaux", id: "a-1", nom: "Réseaux sociaux", role: "general", statut: "paused", enPause: true },
        { slug: "veille", id: "a-2", nom: "Veille", role: "general", statut: "idle", enPause: false },
      ],
    });
    expect(ROUTES_API.find((x) => x.cle === "equipe.lister")).toMatchObject({ methode: "GET", chemin: "/equipe", auth: "board-or-agent" });
  });
});
