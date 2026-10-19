// @vitest-environment jsdom
/**
 * Page d'ensemble du client : bascule « Départements | Organigramme », adresses compatibles (`atelier/organigramme`,
 * ancres `service=`, `vue=matrice`), fonction pure `vueEnsemble`, slug du service courant.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementDeclare } from "../../src/contrats/departements.js";
import { oublierDepartements, slugDuService } from "../../src/ui/departements-sonde.js";
import { PageAtelier } from "../../src/ui/index.js";
import { vueEnsemble } from "../../src/ui/vues/ensemble.js";
import { oublierAccesDirection } from "../../src/ui/vues/echanges.js";
import { cliquer, ENTREPRISE, installerPont, rendre, type Rendu } from "./pont.js";

const DIR = "22222222-2222-4222-8222-222222222222";
const JUR = "33333333-3333-4333-8333-333333333333";
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const declare = (companyId: string, slug: string, nom: string, o: Partial<DepartementDeclare> = {}): DepartementDeclare => ({ companyId, slug, nom, estDirection: false, courant: false, ...o });
const TROIS = [declare(DIR, "direction", "Direction", { estDirection: true }), declare(JUR, "juridique", "Juridique"), declare(ENTREPRISE, "marketing", "Marketing", { courant: true })];
const ENTREPRISES = [
  { id: ENTREPRISE, name: "Fictive SA · Marketing", issuePrefix: "RNO" },
  { id: DIR, name: "Fictive SA · Direction", issuePrefix: "RNOAB" },
  { id: JUR, name: "Fictive SA · Juridique", issuePrefix: "RNOAC" },
];

let rendu: Rendu | null = null;
beforeEach(() => {
  oublierDepartements();
  oublierAccesDirection();
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const corps = url.includes("/departements?companyId=") ? { client: "fictive-sa", departements: TROIS } : url.endsWith("/api/companies") ? ENTREPRISES : {};
      return new Response(JSON.stringify(corps), { status: url.includes("/departements?") || url.endsWith("/api/companies") ? 200 : 404 });
    }),
  );
});
afterEach(() => {
  window.location.hash = "";
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const ouvrir = async (chemin: string, hash = "") => {
  window.location.hash = hash;
  installerPont(chemin);
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  for (let i = 0; i < 6; i += 1) await cliquer(document.body);
  return rendu.conteneur;
};
const boutons = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>(".atl-bascule button"));
const presse = (c: HTMLElement) => boutons(c).filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);

describe("vueEnsemble (adresse et ancre)", () => {
  it("l'ancre prime ; sinon la vue de l'adresse ; service= et vue=matrice impliquent l'organigramme", () => {
    expect(vueEnsemble("", "departements")).toBe("departements");
    expect(vueEnsemble("", "organigramme")).toBe("organigramme");
    expect(vueEnsemble("vue=departements", "organigramme")).toBe("departements");
    expect(vueEnsemble("vue=organigramme", "departements")).toBe("organigramme");
    expect(vueEnsemble("vue=matrice", "departements")).toBe("organigramme");
    expect(vueEnsemble("vue=carte", "departements")).toBe("organigramme");
    expect(vueEnsemble("service=juridique", "departements")).toBe("organigramme");
    expect(vueEnsemble("service=juridique&agent=j3&vue=matrice", "departements")).toBe("organigramme");
  });
});

describe("slug du service courant", () => {
  it("vient de la liste ; null si l'entreprise n'y figure pas ou sans liste", () => {
    expect(slugDuService({ client: "x", departements: TROIS }, ENTREPRISE)).toBe("marketing");
    expect(slugDuService({ client: "x", departements: TROIS }, "autre")).toBeNull();
    expect(slugDuService({ client: "x", departements: [] }, ENTREPRISE)).toBeNull();
    expect(slugDuService(null, ENTREPRISE)).toBeNull();
  });
});

describe("bascule Départements | Organigramme", () => {
  it("atelier/departements s'ouvre sur la grille, avec deux boutons à aria-pressed", async () => {
    const c = await ouvrir("/RNO/atelier/departements");
    expect(boutons(c).map((b) => b.textContent)).toEqual(["Départements", "Organigramme"]);
    expect(presse(c)).toEqual(["Départements"]);
    expect(c.querySelector(".atl-dep")).not.toBeNull();
    expect(c.querySelector(".atl-org")).toBeNull();
  });

  it("la bascule sert de titre : une grille sans h1 visible (un h1 masqué pour les lecteurs d'écran), même largeur de page que l'organigramme", async () => {
    let c = await ouvrir("/RNO/atelier/departements");
    const titres = Array.from(c.querySelectorAll("h1"));
    expect(titres.map((h) => h.textContent)).toEqual(["Départements de Fictive SA"]);
    expect(titres[0]!.classList.contains("atl-sr")).toBe(true);
    expect(c.querySelector(".atl-entete")).toBeNull();
    expect(c.querySelector("main")?.classList.contains("atl-page-large")).toBe(true);
    // Même parent et même rang pour la bascule dans les deux vues : elle ne bouge pas en changeant de vue.
    const rang = (el: HTMLElement) => Array.from(el.parentElement!.children).indexOf(el);
    const bascule = c.querySelector<HTMLElement>(".atl-bascule")!;
    const avant = { page: bascule.parentElement!.className, rang: rang(bascule) };
    rendu?.demonter();
    c = await ouvrir("/RNO/atelier/organigramme");
    const apres = c.querySelector<HTMLElement>(".atl-bascule")!;
    expect({ page: apres.parentElement!.className, rang: rang(apres) }).toEqual(avant);
    expect(c.querySelector("main")?.classList.contains("atl-page-large")).toBe(true);
  });

  it("atelier/organigramme reste valide et s'ouvre sur l'organigramme", async () => {
    const c = await ouvrir("/RNO/atelier/organigramme");
    expect(presse(c)).toEqual(["Organigramme"]);
    expect(c.querySelector(".atl-org")).not.toBeNull();
    expect(c.querySelector(".atl-dep")).toBeNull();
  });

  it("un clic bascule d'une vue à l'autre et écrit l'ancre ; l'organigramme reste affiché après un retour de carte", async () => {
    const c = await ouvrir("/RNO/atelier/departements");
    await cliquer(boutons(c)[1]!);
    await new Promise((r) => setTimeout(r, 20));
    await cliquer(document.body);
    expect(window.location.hash).toBe("#vue=carte");
    expect(presse(c)).toEqual(["Organigramme"]);
    expect(c.querySelector(".atl-org")).not.toBeNull();
    await cliquer(boutons(c)[0]!);
    await new Promise((r) => setTimeout(r, 20));
    await cliquer(document.body);
    expect(window.location.hash).toBe("#vue=departements");
    expect(presse(c)).toEqual(["Départements"]);
    expect(c.querySelector(".atl-dep")).not.toBeNull();
  });

  it("sur atelier/organigramme, « Départements » ouvre la grille (l'ancre le retient)", async () => {
    const c = await ouvrir("/RNO/atelier/organigramme");
    await cliquer(boutons(c)[0]!);
    await new Promise((r) => setTimeout(r, 20));
    await cliquer(document.body);
    expect(presse(c)).toEqual(["Départements"]);
    expect(c.querySelector(".atl-dep")).not.toBeNull();
  });

  it("les ancres de l'organigramme restent valides depuis atelier/departements (#service=, #vue=matrice)", async () => {
    let c = await ouvrir("/RNO/atelier/departements", "#service=juridique");
    expect(presse(c)).toEqual(["Organigramme"]);
    expect(c.querySelector(".atl-org")).not.toBeNull();
    rendu?.demonter();
    c = await ouvrir("/RNO/atelier/departements", "#vue=matrice");
    expect(presse(c)).toEqual(["Organigramme"]);
    expect(c.querySelector(".atl-org")).not.toBeNull();
  });
});
