// @vitest-environment jsdom
/**
 * Mobile (audit M3) : sommaire et sections repliables des Paramètres, volet « Filtres (n actifs) »
 * des Prospects, onglet actif amené dans la vue. Sous 640 px, `matchMedia` est simulé.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROSPECT_B2B } from "../../src/contrats/exemples/prospection.js";
import { PageAtelier } from "../../src/ui/index.js";
import { FILTRES_VIDES, nombreFiltresActifs } from "../../src/ui/vues/prospects.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let rendu: Rendu | null = null;

function simulerEcran(etroit: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: etroit && q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/prospects?") ? { total: 1, page: 1, pages: 1, prospects: [PROSPECT_B2B] } : {}), { status: 200 })),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
  window.location.hash = "";
});

async function ouvrir(chemin: string) {
  installerPont(chemin);
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}

describe("Paramètres : sommaire et sections repliables", () => {
  it("les onglets des paramètres couvrent chaque section et chaque ancre existe", async () => {
    simulerEcran(false);
    const c = await ouvrir("/RNO/atelier/parametres");
    const onglets = Array.from(c.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Sections des paramètres"] [role="tab"]'));
    expect(onglets.map((o) => o.textContent)).toEqual(["Diagnostic", "Sources", "Critères des leads", "Dépenses et coûts", "Modèles", "Avancé"]);
    for (const ancre of ["param-diagnostic", "param-sources", "param-criteres", "param-depenses", "param-couts", "param-modeles", "param-reglages", "param-remise"]) {
      const cible = c.querySelector(`section#${CSS.escape(ancre)}`);
      expect(cible, ancre).not.toBeNull();
      expect(cible!.querySelector("details > summary h2")).not.toBeNull();
    }
  });

  it("sur grand écran, toutes les sections sont ouvertes", async () => {
    simulerEcran(false);
    const c = await ouvrir("/RNO/atelier/parametres");
    const details = Array.from(c.querySelectorAll<HTMLDetailsElement>("section.atl-section-repliable > details"));
    expect(details.length).toBeGreaterThanOrEqual(7);
    expect(details.every((d) => d.open)).toBe(true);
  });

  it("sur téléphone, tout est replié sauf la section visée par l'ancre", async () => {
    simulerEcran(true);
    window.location.hash = "#param-couts";
    const c = await ouvrir("/RNO/atelier/parametres");
    const ouvertes = Array.from(c.querySelectorAll<HTMLDetailsElement>("section.atl-section-repliable > details")).filter((d) => d.open);
    expect(ouvertes.map((d) => d.parentElement!.id)).toEqual(["param-couts"]);
  });

  it("sur téléphone, un clic sur un onglet affiche ses sections, ouvertes ou non selon l'ancre", async () => {
    simulerEcran(true);
    const c = await ouvrir("/RNO/atelier/parametres");
    const panneau = c.querySelector<HTMLElement>("#atl-param-panneau-avance")!;
    expect(panneau.hidden).toBe(true);
    const section = c.querySelector<HTMLElement>("section#param-reglages")!;
    expect(section.querySelector("details")!.open).toBe(false);
    await cliquer(parTexte(c, '[aria-label="Sections des paramètres"] [role="tab"]', "Avancé"));
    expect(c.querySelector<HTMLElement>("#atl-param-panneau-avance")!.hidden).toBe(false);
    // La première section du panneau choisi est dépliée (sinon l'onglet n'afficherait que des titres repliés).
    expect(section.querySelector("details")!.open).toBe(true);
    expect(c.querySelector<HTMLElement>("#atl-param-panneau-diagnostic")!.hidden).toBe(true);
  });
});

describe("Prospects : volet Filtres", () => {
  it("compte les filtres appliqués", () => {
    expect(nombreFiltresActifs(FILTRES_VIDES)).toBe(0);
    expect(nombreFiltresActifs({ ...FILTRES_VIDES, cibles: ["entreprise", "particulier"], zone: "Liège", qualifies: true })).toBe(3);
  });

  it("sur téléphone, le volet est replié et garde les filtres actifs dans son titre", async () => {
    simulerEcran(true);
    const c = await ouvrir("/RNO/atelier/prospects");
    const volet = c.querySelector<HTMLDetailsElement>("details.atl-filtres-volet")!;
    expect(volet.open).toBe(false);
    expect(volet.querySelector("summary")!.textContent).toBe("Filtres (0 actif)");
    volet.open = true;
    await act(async () => {
      volet.dispatchEvent(new Event("toggle"));
    });
    await saisir(champParLibelle(c, "Zone (commune ou code postal)"), "Liège");
    await cliquer(parTexte(c, "button", "Filtrer"));
    expect(c.querySelector("details.atl-filtres-volet summary")!.textContent).toBe("Filtres (1 actif)");
    // Replié de nouveau : la saisie et le filtre appliqué restent.
    volet.open = false;
    await act(async () => {
      volet.dispatchEvent(new Event("toggle"));
    });
    expect(c.querySelector("details.atl-filtres-volet summary")!.textContent).toBe("Filtres (1 actif)");
    expect((champParLibelle(c, "Zone (commune ou code postal)") as HTMLInputElement).value).toBe("Liège");
  });

  it("sur grand écran, le volet est ouvert", async () => {
    simulerEcran(false);
    const c = await ouvrir("/RNO/atelier/prospects");
    expect(c.querySelector<HTMLDetailsElement>("details.atl-filtres-volet")!.open).toBe(true);
  });
});

describe("Onglets de l'atelier", () => {
  it("amène l'onglet actif dans la vue avec inline: nearest", async () => {
    const defilement = vi.fn();
    const ancien = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = defilement;
    try {
      const c = await ouvrir("/RNO/atelier/campagnes");
      const actif = c.querySelector<HTMLElement>('nav.atl-onglets a[aria-current="page"]')!;
      expect(actif.textContent).toBe("Marketing");
      expect(defilement).toHaveBeenCalledWith({ inline: "nearest", block: "nearest" });
      expect(defilement.mock.contexts[0]).toBe(actif);
    } finally {
      Element.prototype.scrollIntoView = ancien;
    }
  });

  it("n'indique de suite que s'il reste des onglets à faire défiler", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    const cadre = c.querySelector<HTMLElement>(".atl-onglets-cadre")!;
    expect(cadre.dataset.suite).toBeUndefined();
    const barre = cadre.querySelector<HTMLElement>("nav")!;
    Object.defineProperty(barre, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(barre, "scrollWidth", { value: 900, configurable: true });
    await act(async () => {
      barre.dispatchEvent(new Event("scroll"));
    });
    expect(cadre.dataset.suite).toBe("oui");
    barre.scrollLeft = 600;
    await act(async () => {
      barre.dispatchEvent(new Event("scroll"));
    });
    expect(cadre.dataset.suite).toBeUndefined();
  });
});
