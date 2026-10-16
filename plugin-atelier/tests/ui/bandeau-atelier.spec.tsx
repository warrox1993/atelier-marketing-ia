// @vitest-environment jsdom
/**
 * Langage clair (proposition 7) : bandeau « Entreprise : <nom> » permanent en tête de la page de l'atelier,
 * avec la mention « démonstration », et exigences affichées par leur titre (le code REQ reste en petit).
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DossierHumain } from "../../src/contrats/dossier.js";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { ENTREPRISE, installerPont, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const NOM = "Assurances Dupont & Fils SRL";
const REGLAGES = { companyId: ENTREPRISE, maxRunsActifs: 3, maxCyclesCorrection: 3, retentionJours: 365, engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: null, choisi: false }, plafondPub: null, modifieLe: "2026-10-15T10:00:00.000Z" };
const dossier = EXEMPLES_DONNEES["atelier.dossier"] as DossierHumain;

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont("/RNO/atelier/contenus/44444444-4444-4444-8444-444444444444");
  pont.donnees["atelier.dossier"] = { data: dossier, loading: false, error: null };
  pont.donnees["atelier.reglages"] = { data: { ...REGLAGES, modeParDefaut: "demonstration" }, loading: false, error: null };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: ENTREPRISE, name: NOM }), { status: 200 })));
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

describe("bandeau d'entreprise en tête de l'atelier", () => {
  it("vient avant la navigation, affiche « Entreprise : » et le nom complet en infobulle, sans pastille de mode", async () => {
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(c.querySelector(".atl-bandeau-nom")?.textContent).toBe(NOM));
    const bandeau = c.querySelector(".atl-bandeau-entreprise")!;
    expect(bandeau.textContent).toContain("Entreprise :");
    expect(bandeau.textContent).not.toMatch(/démo/i);
    expect(bandeau.querySelector(".atl-pastille")).toBeNull();
    expect(c.querySelector(".atl-bandeau-nom")?.getAttribute("title")).toBe(NOM);
    const page = c.querySelector("main.atl-page")!;
    expect(page.firstElementChild).toBe(bandeau);
    expect(c.querySelectorAll(".atl-bandeau-entreprise")).toHaveLength(1);
  });
});

describe("exigences par leur titre", () => {
  it("la matrice de couverture montre l'intitulé de l'exigence, le code REQ en petit", async () => {
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    const c = rendu.conteneur;
    const ligne = await vi.waitFor(() => {
      const th = Array.from(c.querySelectorAll('th[data-libelle="Exigence"]')).find((t) => t.textContent?.includes("Chaque établissement est cité avec son adresse et ses horaires."));
      expect(th).toBeTruthy();
      return th!;
    });
    expect(ligne.querySelector("code")?.textContent).toBe("REQ-001");
    expect(ligne.textContent?.startsWith("Chaque établissement est cité")).toBe(true);
  });
});
