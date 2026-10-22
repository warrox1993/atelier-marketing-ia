// @vitest-environment jsdom
/**
 * Onglet « Tableau de direction » : présence dans Marketing, lecture des deux routes pour le mois et le mois
 * précédent, entonnoir avec comparaison, « non mesuré » et « connexion à faire » écrits en toutes lettres (jamais 0),
 * liste des sources à connecter, route absente (worker pas à jour) sans casser le tableau, erreur lisible, et suite
 * du rapport du mois (même source, page « à connecter »).
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageAtelier } from "../../src/ui/index.js";
import { moisPrecedent } from "../../src/ui/tableau-direction.js";
import { moisProposes } from "../../src/ui/vues/rapport.js";
import { coutFictif, directionFictive, rapportFictif } from "../outils-tableau.js";
import { installerPont, rendre, saisir, type Pont, type Rendu, ENTREPRISE } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let pont: Pont;
let rendu: Rendu | null = null;
let urls: string[] = [];

type Reponse = { statut?: number; corps: unknown };
let direction: (mois: string) => Reponse;
let rapport: (mois: string) => Reponse;

function stubReseau() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const mois = new URL(url, "http://x").searchParams.get("mois") ?? "";
      const r = url.includes("/tableau/direction?") ? direction(mois) : url.includes("/rapport/mensuel?") ? rapport(mois) : url.includes("/accueil?") ? { corps: { companyId: ENTREPRISE, elements: [], missions: [] } } : { corps: {} };
      return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200 });
    }),
  );
}
beforeEach(() => {
  urls = [];
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  rapport = (mois) => ({ corps: { ...rapportFictif({ mois: mois, trouves: mois === moisProposes()[0] ? 100 : 80, qualifies: mois === moisProposes()[0] ? 20 : 10, couts: [coutFictif("Contenus", 900), coutFictif("Veille", 300)] }), companyId: ENTREPRISE } });
  direction = (mois) => ({ corps: { ...directionFictive({ mois, prospects: { trouves: 100, avecNumero: 60 } }), companyId: ENTREPRISE } });
  stubReseau();
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});
async function ouvrir(chemin = "/RNO/atelier/tableau") {
  pont = installerPont(chemin);
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}
const ligne = (c: ParentNode, nom: string) => Array.from(c.querySelectorAll("li.atl-td-rangee")).find((li) => li.textContent?.includes(nom)) as HTMLElement;

describe("Tableau de direction", () => {
  it("est un onglet de Marketing, juste avant le rapport", async () => {
    const c = await ouvrir();
    const onglets = Array.from(c.querySelectorAll('[role="tablist"][aria-label="Marketing : sections"] [role="tab"]'));
    expect(onglets.map((o) => o.firstChild?.textContent?.trim()).slice(-2)).toEqual(["Tableau de direction", "Rapport du mois"]);
    expect(onglets.find((o) => o.getAttribute("aria-selected") === "true")?.firstChild?.textContent?.trim()).toBe("Tableau de direction");
    expect(pont.violations).toEqual([]);
  });

  it("lit les deux routes pour le mois courant et le mois précédent", async () => {
    await ouvrir();
    const mois = moisProposes()[0]!;
    for (const m of [mois, moisPrecedent(mois)]) {
      expect(urls.some((u) => u.includes(`/rapport/mensuel?companyId=${ENTREPRISE}&mois=${m}`))).toBe(true);
      expect(urls.some((u) => u.includes(`/tableau/direction?companyId=${ENTREPRISE}&mois=${m}`))).toBe(true);
    }
  });

  it("entonnoir : valeurs, taux de passage et comparaison au mois précédent en toutes lettres", async () => {
    const c = await ouvrir();
    const trouves = ligne(c, "Prospects trouvés");
    expect(trouves.textContent).toContain("100");
    expect(trouves.textContent).toContain("+20 (+25 %), 80 le mois précédent");
    expect(ligne(c, "Avec un numéro de téléphone").textContent).toContain("60 % de l'étape précédente");
    expect(ligne(c, "Rendez-vous obtenus").textContent).toContain("6");
    // La barre est décorative : tout passe par le texte.
    expect(trouves.querySelector(".atl-td-piste")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("coût : total, par agent et par mission ; coût par prospect qualifié", async () => {
    const c = await ouvrir();
    expect(c.textContent).toContain("Coût par prospect qualifié");
    const agents = c.querySelector('[aria-label="Coût par agent"]')!;
    expect(agents.querySelectorAll("li")).toHaveLength(2);
    expect(agents.textContent).toContain("Contenus");
    expect(c.querySelector('[aria-label="Coût par mission"]')?.textContent).toContain("MKT-1 Campagne d'automne");
  });

  it("captation et e-mailing absents : « Connexion à faire », jamais 0 ; puis la liste à connecter", async () => {
    const c = await ouvrir();
    const table = c.querySelector('table[aria-label="Captation et e-mailing"]')!;
    expect(table.textContent).toContain("Connexion à faire");
    expect(table.querySelector("td")?.textContent).not.toBe("0");
    const liste = c.querySelector(".atl-td-sources")!;
    expect(liste.textContent).toContain("Vues des pages de captation");
    expect(liste.textContent).toContain("Brancher Umami");
  });

  it("route du tableau absente (worker pas à jour) : le reste s'affiche, le manquant est « non mesuré »", async () => {
    direction = () => ({ statut: 404, corps: { error: "introuvable", message: "pas de route" } });
    const c = await ouvrir();
    expect(ligne(c, "Prospects trouvés").textContent).toContain("100");
    const numero = ligne(c, "Avec un numéro de téléphone");
    expect(numero.textContent).toContain("Non mesuré");
    expect(numero.textContent).not.toMatch(/\b0\b/u);
    expect(c.querySelector('[role="alert"]')).toBeNull();
  });

  it("aucune des deux sources du mois : erreur lisible avec « Réessayer »", async () => {
    direction = () => ({ statut: 500, corps: { error: "erreur_interne", message: "boum" } });
    rapport = () => ({ statut: 500, corps: { error: "erreur_interne", message: "boum" } });
    const c = await ouvrir();
    expect(c.querySelector('[role="alert"]')).not.toBeNull();
    expect(c.querySelector("li.atl-td-rangee")).toBeNull();
  });

  it("le sélecteur de mois relit les routes pour le mois choisi", async () => {
    const c = await ouvrir();
    const autre = moisProposes()[2]!;
    await saisir(c.querySelector<HTMLSelectElement>(".atl-td-commandes select")!, autre);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(urls.some((u) => u.includes(`/tableau/direction?companyId=${ENTREPRISE}&mois=${autre}`))).toBe(true);
  });

  it("aucun tiret cadratin dans la feuille de style ni dans les textes affichés", async () => {
    const { STYLES_TABLEAU } = await import("../../src/ui/styles-tableau.js");
    expect(STYLES_TABLEAU).not.toMatch(/[—–]/u);
    const c = await ouvrir();
    expect(c.textContent).not.toMatch(/[—–]/u);
  });
});

describe("Rapport du mois : suite alimentée par les mêmes sources", () => {
  it("ajoute entonnoir, missions et décisions, captation, puis la page « à connecter »", async () => {
    const c = await ouvrir("/RNO/atelier/rapport");
    expect(c.querySelector('table[aria-label="Entonnoir de prospection"]')?.textContent).toContain("Avec un numéro de téléphone");
    expect(c.querySelector('table[aria-label="Missions et décisions"]')).not.toBeNull();
    const connecter = c.querySelector(".atl-rapport-connecter")!;
    expect(connecter.textContent).toContain("Ce qu'il faudrait connecter pour mesurer davantage");
    expect(connecter.textContent).toContain("Brancher Umami");
    expect(c.querySelector(".atl-rapport")?.contains(connecter)).toBe(true);
  });
  it("impression : la page « à connecter » commence sur une nouvelle page", async () => {
    const { STYLES_RAPPORT } = await import("../../src/ui/styles-rapport.js");
    expect(STYLES_RAPPORT).toContain(".atl-rapport-connecter { break-before: page; }");
  });
});
