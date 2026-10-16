// @vitest-environment jsdom
/**
 * Vue « Carte des prospects » : carte SVG sans appel externe, points colorés par confiance, bureaux en
 * carrés, légende, liste textuelle, clic vers la rubrique Prospects, états vide et d'erreur.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueCarte, classeConfiance, projeter } from "../../src/ui/vues/carte.js";
import { installerPont, rendre, type Pont, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let pont: Pont;
let urls: string[] = [];
let reponse: { statut: number; corps: unknown };

const point = (n: number, o: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, nom: `Société ${n}`, lat: 50.6 + n / 100, lon: 5.5 + n / 100, precision: "exacte", confiance: 95, qualifie: true, ...o });

beforeEach(() => {
  pont = installerPont("/RNO/atelier/carte");
  urls = [];
  reponse = { statut: 200, corps: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(reponse.corps), { status: reponse.statut });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(VueCarte));
  return rendu.conteneur;
}

describe("projection et classes", () => {
  it("garde tous les points dans le cadre, le nord en haut, sans division par zéro pour un seul point", () => {
    const pts = [{ lat: 50.6, lon: 5.5 }, { lat: 50.7, lon: 5.7 }, { lat: 50.65, lon: 5.6 }];
    const f = projeter(pts);
    for (const p of pts) {
      const { x, y } = f(p);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(800);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(480);
    }
    expect(f(pts[1]!).y).toBeLessThan(f(pts[0]!).y);
    expect(f(pts[1]!).x).toBeGreaterThan(f(pts[0]!).x);
    const seul = projeter([{ lat: 50.6, lon: 5.5 }])({ lat: 50.6, lon: 5.5 });
    expect(seul).toEqual({ x: 400, y: 240 });
  });
  it("classe la confiance : 90 et plus, 60 à 89, moins de 60 ou absente", () => {
    expect([classeConfiance(100), classeConfiance(90), classeConfiance(89), classeConfiance(60), classeConfiance(59), classeConfiance(null)]).toEqual(["haute", "haute", "moyenne", "moyenne", "basse", "basse"]);
  });
});

describe("vue carte", () => {
  it("dessine les prospects en cercles colorés, les bureaux en carrés, la légende et la liste ; un clic ouvre les prospects", async () => {
    reponse.corps = {
      total: 5, positionnes: 3, sansPosition: 2, tronque: false,
      points: [point(1), point(2, { confiance: 70, qualifie: false, precision: "code_postal" }), point(3, { confiance: null, qualifie: false, precision: "commune" })],
      etablissements: [{ nom: "Bureau Liège", code: "bureau-liege", adresse: "Rue X 1", lat: 50.64, lon: 5.56, confirme: true }],
    };
    const c = await ouvrir();
    expect(urls[0]).toContain("/prospects/carte?companyId=");
    expect(c.querySelector("h1")?.textContent).toBe("Carte des prospects");
    const svg = c.querySelector("svg.atl-carte")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title")?.textContent).toContain("Carte des prospects");
    const cercles = Array.from(svg.querySelectorAll("circle.atl-carte-point"));
    expect(cercles.map((x) => x.getAttribute("data-classe"))).toEqual(["haute", "moyenne", "basse"]);
    expect(cercles.map((x) => x.getAttribute("data-approx"))).toEqual([null, "true", "true"]);
    expect(svg.querySelectorAll("rect.atl-carte-bureau")).toHaveLength(1);
    expect(c.textContent).toContain("3 prospects placés, 2 sans position connue (non placés)");
    expect(c.querySelector('ul[aria-label="Légende de la carte"]')?.textContent).toContain("Confiance 90 % et plus");
    const liste = c.querySelector("#carte-liste")!.closest("section")!;
    expect(liste.textContent).toContain("Société 2");
    expect(liste.textContent).toContain("Confiance 70 %");
    expect(liste.textContent).toContain("Confiance non calculée");
    expect(liste.textContent).toContain("approximative, centre du code postal");
    expect(c.querySelector("#carte-bureaux")?.closest("section")?.textContent).toContain("Bureau Liège");
    // Aucune ressource externe : ni image, ni script, ni iframe.
    expect(c.querySelector("img, iframe, script, link")).toBeNull();
    expect(urls).toHaveLength(1);
    // Les éléments SVG n'ont pas de méthode click() dans jsdom : on envoie l'évènement de clic.
    await act(async () => {
      svg.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(pont.navigations).toContain("/atelier/prospects");
  });

  it("le survol d'un point affiche son nom", async () => {
    reponse.corps = { total: 1, positionnes: 1, sansPosition: 0, tronque: false, points: [point(1, { nom: "Boulangerie du Pont" })], etablissements: [] };
    const c = await ouvrir();
    expect(c.querySelector("text.atl-carte-etiquette")).toBeNull();
    const g = c.querySelector("svg.atl-carte a g")!;
    await act(async () => {
      g.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(c.querySelector("text.atl-carte-etiquette")?.textContent).toBe("Boulangerie du Pont");
  });

  it("sans position connue : état vide honnête, aucune carte", async () => {
    reponse.corps = { total: 4, positionnes: 0, sansPosition: 4, tronque: false, points: [], etablissements: [] };
    const c = await ouvrir();
    expect(c.querySelector("svg.atl-carte")).toBeNull();
    expect(c.textContent).toContain("Aucun prospect n'a de position connue.");
    expect(c.textContent).toContain("jamais placés au hasard");
    expect(c.querySelector("#carte-bureaux")?.closest("section")?.textContent).toContain("jamais déduite des prospects");
  });

  it("erreur de la route : message et bouton de nouvel essai", async () => {
    reponse = { statut: 500, corps: { erreur: "panne", code: "erreur_interne" } };
    const c = await ouvrir();
    expect(c.querySelector("svg.atl-carte")).toBeNull();
    expect(c.querySelector('[role="alert"]')).not.toBeNull();
  });
});
