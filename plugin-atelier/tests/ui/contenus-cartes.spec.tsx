// @vitest-environment jsdom
/**
 * « Contenus à valider » rappelle les décisions en attente dans les tâches du service (UI-9) : la liste des livrables
 * pouvait dire « Rien à valider » pendant que le chat comptait des cartes à traiter.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueContenus } from "../../src/ui/vues/contenus.js";
import { WidgetAtelier } from "../../src/ui/index.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { reinitialiserCartesServices } from "../../src/ui/cartes-services.js";
import { servirHote, type ScenarioHote } from "./hote-cartes.js";
import { cliquer, ENTREPRISE, installerPont, rendre, type Rendu } from "./pont.js";

const DIRECTION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MARKETING = ENTREPRISE;
const SERVICES = [
  { companyId: DIRECTION, slug: "direction", nom: "Direction", estDirection: true, courant: false },
  { companyId: MARKETING, slug: "marketing", nom: "Marketing", estDirection: false, courant: true },
];
let scenario: ScenarioHote;
let rendu: Rendu | null = null;

beforeEach(() => {
  installerPont("/MKT/atelier/contenus");
  oublierDepartements();
  reinitialiserCartesServices();
  scenario = {
    taches: [{ id: "iss-mkt-9", companyId: MARKETING, identifier: "MKT-9", title: "Liste finale" }],
    aSuivre: [{ companyId: MARKETING, tacheId: "iss-mkt-9", slug: "marketing", nom: "Marketing" }],
    cartes: { "iss-mkt-9": [{ id: "k1", kind: "request_confirmation", title: "Valider la liste", createdAt: "2026-10-25T10:00:00.000Z", payload: { prompt: "Valider la liste ?" } }] },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const methode = init?.method ?? "GET";
      const j = (c: unknown) => new Response(JSON.stringify(c), { status: 200 });
      if (methode === "GET" && url.includes("/departements?")) return j({ client: "fictive-sa", departements: SERVICES });
      const servi = methode === "GET" ? servirHote(url, scenario) : null;
      return servi ?? j({});
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

describe("Contenus à valider : décisions en attente dans les tâches", () => {
  it("rappelle la carte en attente du service avec le lien vers sa tâche", async () => {
    rendu = await rendre(createElement(VueContenus, { id: null }));
    await cliquer(document.body);
    await cliquer(document.body);
    const s = Array.from(rendu.conteneur.querySelectorAll("section")).find((x) => x.querySelector("h2")?.textContent?.startsWith("Décisions en attente dans les tâches"));
    expect(s?.querySelector("h2")?.textContent).toBe("Décisions en attente dans les tâches (1)");
    const lien = s!.querySelector("li a")!;
    expect(lien.textContent).toBe("Valider la liste");
    expect(lien.getAttribute("href")).toMatch(/\/MKT\/issues\/MKT-9$/u);
    expect(rendu.conteneur.textContent).not.toContain("—");
  });

  it("l'encart du tableau de bord compte aussi ces décisions, au lieu de « 0 à valider » seul", async () => {
    rendu = await rendre(createElement(WidgetAtelier, { context: { companyId: MARKETING, companyPrefix: "MKT", projectId: null, entityId: null, entityType: null, userId: "local-board" } }));
    await cliquer(document.body);
    await cliquer(document.body);
    expect(rendu.conteneur.querySelector(".atl-widget-ligne")?.textContent).toContain("1 décision en attente");
  });

  it("aucune carte : pas de section", async () => {
    scenario = { ...scenario, cartes: {} };
    rendu = await rendre(createElement(VueContenus, { id: null }));
    await cliquer(document.body);
    await cliquer(document.body);
    expect(rendu.conteneur.textContent).not.toContain("Décisions en attente dans les tâches");
  });
});
