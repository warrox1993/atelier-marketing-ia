// @vitest-environment jsdom
/**
 * Navigation : rubriques du bureau (Prospects, Marketing), onglets des Réglages, anciennes adresses, ancres des
 * Paramètres, clavier des onglets.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageAtelier } from "../../src/ui/index.js";
import { cheminOnglet, RUBRIQUES_NAV, RUBRIQUE_REGLAGES, rubriqueDe } from "../../src/ui/rubriques.js";
import { STYLES_ATELIER } from "../../src/ui/styles.js";
import { VUES } from "../../src/ui/route.js";
import { cliquer, ENTREPRISE, installerPont, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let pont: Pont;
let rendu: Rendu | null = null;

beforeEach(() => {
  window.location.hash = "";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ points: [], etablissements: [], prospects: [], messages: [], total: 0, page: 1, pages: 1 }), { status: 200 })));
});
afterEach(() => {
  expect(pont?.violations ?? []).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
  window.location.hash = "";
});

async function ouvrir(chemin: string, hash = "") {
  window.location.hash = hash;
  pont = installerPont(chemin);
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}
const onglets = (c: HTMLElement, etiquette: string) => Array.from(c.querySelectorAll<HTMLElement>(`[role="tablist"][aria-label="${etiquette}"] [role="tab"]`));
const choisi = (c: HTMLElement, etiquette: string) => onglets(c, etiquette).find((o) => o.getAttribute("aria-selected") === "true")?.firstChild?.textContent?.trim();

describe("rubriques : table de correspondance", () => {
  it("chaque vue existante est atteignable depuis exactement une rubrique", () => {
    for (const v of VUES) {
      const { rubrique, onglet } = rubriqueDe(v.cle);
      expect(onglet.vue, v.cle).toBe(v.cle);
      expect(rubrique.onglets).toContain(onglet);
    }
    // Le menu secondaire ne garde que Prospects et Marketing ; Accueil, Discussion et Réglages restent reconnus par l'adresse.
    expect(RUBRIQUES_NAV.map((r) => r.libelle)).toEqual(["Prospects", "Marketing"]);
    expect(rubriqueDe("accueil").rubrique.cle).toBe("accueil");
    expect(rubriqueDe("discussion").rubrique.cle).toBe("discussion");
    expect(rubriqueDe("corbeille").rubrique).toBe(RUBRIQUE_REGLAGES);
  });
  it("Connexions et Paramètres partagent la vue et se distinguent par l'ancre", () => {
    expect(rubriqueDe("parametres", "param-reel").onglet.libelle).toBe("Connexions");
    expect(rubriqueDe("parametres", "#param-couts").onglet.libelle).toBe("Paramètres");
    expect(cheminOnglet(rubriqueDe("parametres", "param-reel").onglet)).toBe("/atelier/parametres#param-reel");
  });
});

describe("rubriques : onglets et vues", () => {
  const cas: Array<[string, string, string[], string]> = [
    ["Prospects", "/RNO/atelier/prospects", ["Liste", "Carte"], "Liste"],
    ["Marketing", "/RNO/atelier/campagnes", ["Campagnes", "Contenus", "Calendrier", "Résultats", "Équipe", "Rapport du mois"], "Campagnes"],
    ["Réglages", "/RNO/atelier/mise-en-place", ["Mise en place", "Marque et sources", "Connaissances", "Connexions", "Paramètres", "Corbeille"], "Mise en place"],
  ];
  for (const [rubrique, chemin, attendus, premier] of cas) {
    it(`${rubrique} affiche ses onglets et la vue du premier`, async () => {
      const c = await ouvrir(chemin);
      expect(onglets(c, `${rubrique} : sections`).map((o) => o.firstChild?.textContent?.trim())).toEqual(attendus);
      expect(choisi(c, `${rubrique} : sections`)).toBe(premier);
      const panneau = c.querySelector('[role="tabpanel"]')!;
      expect(panneau.getAttribute("aria-labelledby")).toBe(onglets(c, `${rubrique} : sections`).find((o) => o.getAttribute("aria-selected") === "true")!.id);
      expect(panneau.querySelector("h1")).not.toBeNull();
    });
  }
  it("Discussion n'a pas d'onglets, et l'adresse « accueil » ouvre le chat sans page blanche", async () => {
    expect((await ouvrir("/RNO/atelier/discussion")).querySelector('[role="tablist"]')).toBeNull();
    rendu?.demonter();
    const c = await ouvrir("/RNO/atelier/accueil");
    expect(c.querySelector('[role="tablist"]')).toBeNull();
    expect(c.textContent).not.toBe("");
    expect(c.querySelector(".atl-disc, [class*='atl-disc']")).not.toBeNull();
  });
  it("un clic sur un onglet passe par la navigation de l'hôte, vers l'adresse de sa vue", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    await cliquer(onglets(c, "Marketing : sections")[2]!);
    expect(pont.navigations).toEqual(["/atelier/calendrier"]);
  });
});

describe("rubriques : anciennes adresses", () => {
  const adresses: Array<[string, string, string, string]> = [
    ["/RNO/atelier/prospects", "", "Prospects", "Liste"],
    ["/RNO/atelier/carte", "", "Prospects", "Carte"],
    ["/RNO/atelier/campagnes", "", "Marketing", "Campagnes"],
    ["/RNO/atelier/campagnes/nouvelle", "", "Marketing", "Campagnes"],
    ["/RNO/atelier/contenus", "", "Marketing", "Contenus"],
    ["/RNO/atelier/calendrier", "", "Marketing", "Calendrier"],
    ["/RNO/atelier/resultats", "", "Marketing", "Résultats"],
    ["/RNO/atelier/equipe", "", "Marketing", "Équipe"],
    ["/RNO/atelier/mise-en-place", "", "Réglages", "Mise en place"],
    ["/RNO/atelier/marque", "", "Réglages", "Marque et sources"],
    ["/RNO/atelier/connaissances", "", "Réglages", "Connaissances"],
    ["/RNO/atelier/parametres", "", "Réglages", "Paramètres"],
    ["/RNO/atelier/parametres", "#param-reel", "Réglages", "Connexions"],
    ["/RNO/atelier/parametres", "#param-couts", "Réglages", "Paramètres"],
    ["/RNO/atelier/corbeille", "", "Réglages", "Corbeille"],
  ];
  for (const [chemin, hash, rubrique, onglet] of adresses) {
    it(`${chemin}${hash} ouvre ${rubrique} sur « ${onglet} »`, async () => {
      const c = await ouvrir(chemin, hash);
      // Réglages n'a plus de rubrique dans la barre des rubriques (menu principal) : seuls ses onglets l'identifient.
      if (rubrique !== "Réglages") expect(c.querySelector('nav.atl-onglets a[aria-current="page"]')?.textContent).toBe(rubrique);
      else expect(c.querySelector("nav.atl-onglets")).toBeNull();
      expect(choisi(c, `${rubrique} : sections`)).toBe(onglet);
    });
  }
});

describe("Paramètres en onglets", () => {
  const ancres: Array<[string, string]> = [
    ["param-diagnostic", "Diagnostic"],
    ["param-sources", "Sources"],
    ["param-criteres", "Critères des leads"],
    ["param-depenses", "Dépenses et coûts"],
    ["param-couts", "Dépenses et coûts"],
    ["param-modeles", "Modèles"],
    ["param-reglages", "Avancé"],
    ["param-remise", "Avancé"],
  ];
  for (const [ancre, onglet] of ancres) {
    it(`#${ancre} sélectionne l'onglet « ${onglet} » et sa section y est visible`, async () => {
      const c = await ouvrir("/RNO/atelier/parametres", `#${ancre}`);
      expect(choisi(c, "Sections des paramètres")).toBe(onglet);
      const section = c.querySelector<HTMLElement>(`section#${ancre}`)!;
      expect(section.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
    });
  }
  it("sans ancre : Diagnostic ; les autres panneaux sont masqués mais montés", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    expect(choisi(c, "Sections des paramètres")).toBe("Diagnostic");
    const panneaux = Array.from(c.querySelectorAll<HTMLElement>('[id^="atl-param-panneau-"]'));
    expect(panneaux.filter((p) => !p.hidden).map((p) => p.id)).toEqual(["atl-param-panneau-diagnostic"]);
    expect(panneaux).toHaveLength(6);
  });
  it("#param-reel montre les connexions seul, sans onglets de paramètres visibles", async () => {
    const c = await ouvrir("/RNO/atelier/parametres", "#param-reel");
    expect(c.querySelector<HTMLElement>("section#param-reel")!.closest<HTMLElement>("div[hidden]")).toBeNull();
    expect(c.querySelector<HTMLElement>('[aria-label="Sections des paramètres"]')!.closest<HTMLElement>("div[hidden]")).not.toBeNull();
  });
});

describe("onglets accessibles", () => {
  it("un seul onglet dans l'ordre de tabulation (tabindex itinérant)", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    expect(onglets(c, "Marketing : sections").map((o) => o.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  });
  it("les flèches, Fin et Début déplacent seulement le focus (activation manuelle)", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    const liste = onglets(c, "Marketing : sections");
    const touche = async (el: HTMLElement, key: string) => {
      el.focus();
      await act(async () => {
        el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    };
    const avant = pont.navigations.length;
    await touche(liste[0]!, "ArrowRight");
    expect(document.activeElement).toBe(liste[1]);
    await touche(liste[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(liste[liste.length - 1]);
    await touche(liste[1]!, "End");
    expect(document.activeElement).toBe(liste[liste.length - 1]);
    await touche(liste[2]!, "Home");
    expect(document.activeElement).toBe(liste[0]);
    // Aucune navigation n'a eu lieu : l'onglet affiché n'a pas changé.
    expect(pont.navigations).toHaveLength(avant);
    expect(liste[0]!.getAttribute("aria-selected")).toBe("true");
  });
  it("Espace active l'onglet-lien focalisé ; Entrée est laissée au navigateur (pas de double activation)", async () => {
    const c = await ouvrir("/RNO/atelier/campagnes");
    const liste = onglets(c, "Marketing : sections");
    const touche = async (el: HTMLElement, key: string) => {
      el.focus();
      await act(async () => {
        el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    };
    const avant = pont.navigations.length;
    await touche(liste[1]!, "Enter");
    expect(pont.navigations).toHaveLength(avant);
    await touche(liste[1]!, " ");
    expect(pont.navigations).toHaveLength(avant + 1);
    expect(pont.navigations.at(-1)).toBe("/atelier/contenus");
  });
  it("les onglets de paramètres : une flèche déplace le focus sans changer de panneau, un clic (Entrée ou Espace sur un bouton) l'affiche", async () => {
    const c = await ouvrir("/RNO/atelier/parametres");
    const liste = onglets(c, "Sections des paramètres");
    liste[0]!.focus();
    await act(async () => {
      liste[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(liste[1]);
    expect(choisi(c, "Sections des paramètres")).toBe("Diagnostic");
    expect(c.querySelector<HTMLElement>("#atl-param-panneau-sources")!.hidden).toBe(true);
    // Entrée ou Espace sur un bouton produisent un clic natif.
    await act(async () => {
      liste[1]!.click();
    });
    expect(choisi(c, "Sections des paramètres")).toBe("Sources");
    expect(c.querySelector<HTMLElement>("#atl-param-panneau-sources")!.hidden).toBe(false);
  });
  it("les onglets font au moins 44 px de haut et défilent horizontalement", () => {
    expect(STYLES_ATELIER).toMatch(/\.atl-onglets-rub \[role="tab"\] \{[^}]*min-height: 2\.75rem/u);
    expect(STYLES_ATELIER).toMatch(/\.atl-onglets-rub \[role="tablist"\] \{[^}]*overflow-x: auto/u);
    expect(STYLES_ATELIER).toMatch(/\.atl-onglets a \{[^}]*min-height: 2\.75rem/u);
  });
});
