// @vitest-environment jsdom
/**
 * Redirections entre bureaux d'un client à plusieurs services : le chat est unique (celui de la Direction), Prospects,
 * Carte et les vues Marketing n'existent que dans le bureau Marketing. Un client sans départements, ou à un seul
 * service, ne change pas.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementDeclare, ReponseDepartements } from "../../src/contrats/departements.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { PageAtelier } from "../../src/ui/index.js";
import { bureauAttendu, cibleRedirection, peutRediriger } from "../../src/ui/redirections.js";
import { oublierAccesDirection } from "../../src/ui/vues/echanges.js";
import { cliquer, ENTREPRISE, installerPont, rendre, type Pont, type Rendu } from "./pont.js";

const DIR = "22222222-2222-4222-8222-222222222222";
const COM = "44444444-4444-4444-8444-444444444444";
const MARKETING = ENTREPRISE;
const declare = (companyId: string, slug: string, nom: string, o: Partial<DepartementDeclare> = {}): DepartementDeclare => ({ companyId, slug, nom, estDirection: false, courant: false, ...o });
const TROIS: DepartementDeclare[] = [declare(DIR, "direction", "Direction", { estDirection: true }), declare(COM, "commercial", "Commercial"), declare(MARKETING, "marketing", "Marketing")];
// Préfixes réels du client : Direction = RNOA, Marketing = RNO, Commercial = RNOAAAA.
const ENTREPRISES = [
  { id: MARKETING, name: "Fictive SA · Marketing", issuePrefix: "RNO" },
  { id: DIR, name: "Fictive SA · Direction", issuePrefix: "RNOA" },
  { id: COM, name: "Fictive SA · Commercial", issuePrefix: "RNOAAAA" },
];
const contexte = (companyId: string) => ({ companyId, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" });

let rendu: Rendu | null = null;
let pont: Pont;
const servir = (departements: DepartementDeclare[], entreprises: unknown = ENTREPRISES) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/departements?companyId=")) return new Response(JSON.stringify({ client: "fictive-sa", departements }), { status: 200 });
      if (url.endsWith("/api/companies")) return entreprises === null ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(entreprises), { status: 200 });
      return new Response("{}", { status: 404 });
    }),
  );
beforeEach(() => {
  oublierDepartements();
  oublierAccesDirection();
  window.location.hash = "";
  servir(TROIS);
});
afterEach(() => {
  window.location.hash = "";
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const ouvrir = async (companyId: string, chemin: string, hash = "") => {
  window.location.hash = hash;
  pont = installerPont(chemin);
  rendu = await rendre(createElement(PageAtelier, { context: contexte(companyId) }));
  for (let i = 0; i < 8; i += 1) await cliquer(document.body);
  return rendu.conteneur;
};

describe("fonctions pures", () => {
  it("bureauAttendu : chat vers la Direction, Prospects et vues Marketing vers Marketing, le reste nulle part", () => {
    expect(bureauAttendu("discussion")).toBe("direction");
    for (const v of ["prospects", "carte", "campagnes", "contenus", "calendrier", "resultats", "equipe", "rapport"] as const) expect(bureauAttendu(v)).toBe("marketing");
    for (const v of ["mise-en-place", "marque", "connaissances", "parametres", "corbeille", "echanges", "departements", "organigramme"] as const) expect(bureauAttendu(v)).toBeNull();
  });
  it("cibleRedirection : préfixe du bureau visé, identifiant et requête reportés", () => {
    const base = { departements: { client: "x", departements: TROIS }, entreprises: ENTREPRISES, suffixe: "" };
    expect(cibleRedirection({ ...base, vue: "discussion", id: null, companyId: COM })).toBe("/RNOA/atelier/discussion");
    expect(cibleRedirection({ ...base, vue: "prospects", id: null, companyId: COM, suffixe: "?q=a#importer" })).toBe("/RNO/atelier/prospects?q=a#importer");
    expect(cibleRedirection({ ...base, vue: "equipe", id: "agent 1", companyId: DIR })).toBe("/RNO/atelier/equipe/agent%201");
  });
  it("cibleRedirection : rien si déjà au bon endroit, si le bureau visé est inaccessible ou absent, ou à un seul service", () => {
    const base = { id: null, suffixe: "", entreprises: ENTREPRISES };
    const deux = { client: "x", departements: TROIS };
    expect(cibleRedirection({ ...base, vue: "discussion", companyId: DIR, departements: deux })).toBeNull();
    expect(cibleRedirection({ ...base, vue: "prospects", companyId: MARKETING, departements: deux })).toBeNull();
    expect(cibleRedirection({ ...base, vue: "discussion", companyId: COM, departements: deux, entreprises: ENTREPRISES.filter((e) => e.id !== DIR) })).toBeNull();
    expect(cibleRedirection({ ...base, vue: "prospects", companyId: COM, departements: { client: "x", departements: TROIS.filter((d) => d.slug !== "marketing") } })).toBeNull();
    const seul: ReponseDepartements = { client: "x", departements: [TROIS[2]!] };
    expect(cibleRedirection({ ...base, vue: "discussion", companyId: MARKETING, departements: seul })).toBeNull();
    expect(peutRediriger("discussion", COM, null)).toBe(false);
    expect(peutRediriger("discussion", "inconnue", deux)).toBe(false);
  });
});

describe("le chat est unique : celui de la Direction", () => {
  it("depuis le bureau Commercial, l'adresse du chat mène au chat de la Direction", async () => {
    await ouvrir(COM, "/RNOAAAA/atelier/discussion");
    expect(pont.navigations).toEqual(["/RNOA/atelier/discussion"]);
  });
  it("l'adresse par défaut du bureau (…/atelier) et l'ancienne « accueil » mènent aussi au chat de la Direction", async () => {
    await ouvrir(COM, "/RNOAAAA/atelier");
    expect(pont.navigations).toEqual(["/RNOA/atelier/discussion"]);
    rendu?.demonter();
    await ouvrir(MARKETING, "/RNO/atelier/accueil");
    expect(pont.navigations).toEqual(["/RNOA/atelier/discussion"]);
  });
  it("pendant la redirection, le chat n'est pas affiché sous le fil d'Ariane du mauvais service", async () => {
    const c = await ouvrir(COM, "/RNOAAAA/atelier/discussion");
    expect(c.textContent).not.toContain("la discussion");
    expect(c.textContent).toContain("Ouverture du bureau concerné");
  });
  it("dans la Direction, le chat s'affiche sans redirection", async () => {
    const c = await ouvrir(DIR, "/RNOA/atelier/discussion");
    expect(pont.navigations).toEqual([]);
    // Le chat est monté (ici sa lecture échoue faute de serveur simulé : « Erreur : la discussion »).
    expect(c.textContent).toContain("la discussion");
    expect(c.textContent).not.toContain("Ouverture du bureau concerné");
  });
});

describe("Prospects et Marketing n'existent que dans le bureau Marketing", () => {
  it("« Importer la base » depuis le chat de la Direction : /atelier/prospects mène au bureau Marketing, ancre reportée", async () => {
    await ouvrir(DIR, "/RNOA/atelier/prospects", "importer");
    expect(pont.navigations).toEqual(["/RNO/atelier/prospects#importer"]);
  });
  it("chaque vue Marketing ouverte dans le bureau Commercial mène à la même vue du bureau Marketing", async () => {
    for (const vue of ["prospects", "carte", "campagnes", "contenus", "calendrier", "resultats", "equipe", "rapport"]) {
      rendu?.demonter();
      await ouvrir(COM, `/RNOAAAA/atelier/${vue}`);
      expect(pont.navigations, vue).toEqual([`/RNO/atelier/${vue}`]);
    }
  });
  it("dans le bureau Marketing, ses vues s'ouvrent sans redirection", async () => {
    for (const vue of ["prospects", "carte", "campagnes", "calendrier"]) {
      rendu?.demonter();
      await ouvrir(MARKETING, `/RNO/atelier/${vue}`);
      expect(pont.navigations, vue).toEqual([]);
    }
  });
  it("les Réglages et le registre ne sont pas redirigés, où que l'on soit", async () => {
    for (const vue of ["mise-en-place", "marque", "parametres", "corbeille"]) {
      rendu?.demonter();
      await ouvrir(COM, `/RNOAAAA/atelier/${vue}`);
      expect(pont.navigations, vue).toEqual([]);
    }
  });
});

describe("rien ne change sans plusieurs services", () => {
  it("client à une seule entreprise : ni le chat ni Prospects ne sont redirigés", async () => {
    servir([declare(MARKETING, "marketing", "Marketing", { courant: true })]);
    await ouvrir(MARKETING, "/RNO/atelier/discussion");
    expect(pont.navigations).toEqual([]);
    rendu?.demonter();
    await ouvrir(MARKETING, "/RNO/atelier/prospects");
    expect(pont.navigations).toEqual([]);
  });
  it("client sans départements déclarés : aucune redirection", async () => {
    servir([]);
    await ouvrir(MARKETING, "/RNO/atelier/discussion");
    expect(pont.navigations).toEqual([]);
  });
  it("liste des entreprises indisponible : on reste où l'on est", async () => {
    servir(TROIS, null);
    await ouvrir(COM, "/RNOAAAA/atelier/discussion");
    expect(pont.navigations).toEqual([]);
  });
});
