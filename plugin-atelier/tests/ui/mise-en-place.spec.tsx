// @vitest-environment jsdom
/**
 * Lot 2 : bandeau « entreprise courante », vue « Mise en place du client » (sept étapes lues sur les
 * routes existantes) et bouton « Recharger la démonstration » des paramètres. Les routes du plugin
 * et l'API native sont servies par un `fetch` simulé.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauEntreprise } from "../../src/ui/composants.js";
import { VueMiseEnPlace } from "../../src/ui/vues/mise-en-place.js";
import { VueParametres } from "../../src/ui/vues/parametres.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const fixture = (nom: string) => readFileSync(`${process.cwd()}/tests/ui/fixtures/${nom}`, "utf8");
const REGLAGES_BASE = { companyId: ENTREPRISE, maxRunsActifs: 3, maxCyclesCorrection: 3, retentionJours: 365, engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: null, choisi: false }, modifieLe: "2026-10-15T10:00:00.000Z" };

let pont: Pont;
let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let serveur: (methode: string, url: string) => { statut: number; corps: unknown };

beforeEach(() => {
  pont = installerPont();
  appels = [];
  serveur = () => ({ statut: 200, corps: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url, corps: init?.body ? JSON.parse(init.body) : null });
      if (url.endsWith(`/companies/${ENTREPRISE}`)) return new Response(JSON.stringify({ id: ENTREPRISE, name: "Assurances Dupont & Fils SRL" }), { status: 200 });
      if (url.endsWith("/tools/connections")) return new Response(fixture("connexions-natives-vide.json"), { status: 200 });
      const r = serveur(methode, url);
      return new Response(JSON.stringify(r.corps), { status: r.statut });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const SOURCES = (passerelle: "joignable" | "injoignable" | "non_configuree", reelles: string[]) => ({
  data: {
    plugin: { id: "atelier", version: "0.1.0" }, espaceBase: "x", migrationsAppliquees: true, connecteurs: [], verifieLe: "2026-10-16T08:00:00.000Z",
    gardeServeur: { p1PolitiqueVerrouillee: "configure_non_verifie", p2PorteDeterministe: "configure_non_verifie", regulateurRuns: "configure_non_verifie" },
    sourcesReelles: { passerelle, sources: ["bce", "bnb", "osm", "liens"].map((cle) => ({ cle, nom: cle.toUpperCase(), reelle: reelles.includes(cle), detail: "d", verifieLe: "2026-10-16T08:00:00.000Z" })) },
  },
  loading: false, error: null,
});

const reglages = (extra: Record<string, unknown>) => ({ data: { ...REGLAGES_BASE, plafondPub: null, ...extra }, loading: false, error: null });

describe("bandeau de l'entreprise courante", () => {
  it("affiche le nom complet et la pastille « Démonstration »", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    rendu = await rendre(createElement(BandeauEntreprise));
    await vi.waitFor(() => expect(rendu!.conteneur.textContent).toContain("Assurances Dupont & Fils SRL"));
    expect(rendu.conteneur.textContent).toContain("Démonstration");
    expect(rendu.conteneur.textContent).not.toContain("Client réel");
    expect(rendu.conteneur.querySelector('[data-ton="demo"]')).not.toBeNull();
  });

  it("affiche « Client réel » quand l'entreprise est réglée en réel", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "reel" });
    rendu = await rendre(createElement(BandeauEntreprise));
    await vi.waitFor(() => expect(rendu!.conteneur.textContent).toContain("Assurances Dupont & Fils SRL"));
    expect(rendu.conteneur.textContent).toContain("Client réel");
    expect(rendu.conteneur.textContent).not.toContain("Démonstration");
  });

  it("sans nom lisible, il reste utilisable et ne plante pas", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    rendu = await rendre(createElement(BandeauEntreprise));
    expect(rendu.conteneur.textContent).toContain("Entreprise courante");
  });
});

describe("mise en place du client", () => {
  it("client neuf : sept étapes à faire, chacune avec un lien vers sa rubrique", async () => {
    pont.donnees["atelier.marque"] = { data: { marque: null, versions: [], sources: [], imports: [] }, loading: false, error: null };
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    pont.donnees["atelier.campagnes"] = { data: [], loading: false, error: null };
    pont.donnees["atelier.sante"] = SOURCES("injoignable", []);
    serveur = (_m, u) =>
      u.includes("/base-clients?") ? { statut: 200, corps: { existe: false, clients: 0 } } : u.includes("/connaissances/statut") ? { statut: 200, corps: { documents: 0, passages: 0 } } : { statut: 200, corps: {} };
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(c.querySelectorAll('[data-etat="a_faire"]')).toHaveLength(7));
    expect(c.textContent).toContain("0 étape sur 7 faite");
    expect(c.textContent).toContain("0 document de connaissances ; passerelle non vérifiée, aucune source tenue pour réelle.");
    for (const t of ["Marque et offres", "Connexions de la passerelle", "Base clients", "Documents", "Connaissances et sources réelles", "Plafonds de dépense", "Premier brief"]) expect(c.textContent).toContain(t);
    await cliquer(parTexte(c, "a", "Créer une campagne"));
    await cliquer(parTexte(c, "a", "Ouvrir la base clients"));
    await cliquer(parTexte(c, "a", "Ouvrir les documents"));
    await cliquer(parTexte(c, "a", "Ouvrir la marque"));
    await cliquer(parTexte(c, "a", "Voir les sources"));
    expect(pont.navigations).toEqual(["/atelier/campagnes", "/atelier/prospects", "/atelier/connaissances", "/atelier/marque", "/atelier/parametres"]);
  });

  it("client prêt : étapes faites d'après marque, base clients, documents, plafond et campagne", async () => {
    serveur = (_m, u) =>
      u.includes("/base-clients?") ? { statut: 200, corps: { existe: true, clients: 105 } } : u.includes("/connaissances/statut") ? { statut: 200, corps: { documents: 17, passages: 400 } } : { statut: 200, corps: {} };
    pont.donnees["atelier.sante"] = SOURCES("joignable", ["osm", "liens"]);
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration", plafondPub: { type: "aucune_limite", decidePar: "local-board", decideLe: "2026-10-15T10:00:00.000Z" } });
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    // Marque et campagne viennent des exemples du contrat (référentiel enregistré, une campagne).
    await vi.waitFor(() => expect(c.querySelectorAll('[data-etat="fait"]').length).toBeGreaterThanOrEqual(6));
    expect(c.textContent).toContain("17 documents de connaissances ; 2 sources réelles sur 4.");
    expect(c.textContent).toContain("105 clients chargés.");
    expect(c.textContent).toContain("17 documents importés.");
    expect(c.textContent).toContain("Plafond publicitaire choisi par le client.");
    // Les connexions natives sont vides dans ce test : seule cette étape reste à faire.
    expect(c.querySelectorAll('[data-etat="a_faire"]')).toHaveLength(1);
    expect(c.querySelector('[data-etat="a_faire"]')!.textContent).toContain("Connexions de la passerelle");
    expect(pont.violations).toEqual([]);
  });
});

describe("recharger la démonstration (paramètres)", () => {
  it("absent quand l'entreprise est réglée en réel", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "reel" });
    rendu = await rendre(createElement(VueParametres));
    await vi.waitFor(() => expect(rendu!.conteneur.textContent).toContain("Remise à zéro de la démonstration"));
    expect(rendu.conteneur.textContent).not.toContain("Recharger la démonstration");
  });

  it("en démonstration : recharge le corpus puis la base clients et dit comment recharger les prospects", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    serveur = (m, u) =>
      m === "POST" && u.endsWith("/connaissances/demonstration")
        ? { statut: 200, corps: { dossier: "connaissances", importes: [1, 2, 3], refuses: [1], dejaImportes: [] } }
        : m === "POST" && u.endsWith("/base-clients/demonstration")
          ? { statut: 201, corps: { lignesRetenues: 105, lignesRejetees: 0 } }
          : { statut: 200, corps: {} };
    rendu = await rendre(createElement(VueParametres));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(c.textContent).toContain("Recharger la démonstration"));
    expect(c.textContent).toContain("Les prospects se rechargent par le script peupler-prospects.py.");
    await cliquer(parTexte(c, "button", "Recharger la démonstration"));
    await vi.waitFor(() => expect(c.textContent).toContain("Base clients : 105 clients chargés"));
    expect(c.textContent).toContain("Documents : 3 importé(s)");
    const posts = appels.filter((a) => a.methode === "POST").map((a) => a.url.replace(/^.*\/api\/plugins\/[^/]+\/api/u, ""));
    expect(posts).toEqual(["/connaissances/demonstration", "/base-clients/demonstration"]);
    expect(appels.filter((a) => a.methode === "POST").every((a) => (a.corps as { companyId: string }).companyId === ENTREPRISE)).toBe(true);
  });

  it("un refus du serveur est affiché, sans fausse réussite", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    serveur = (m) => (m === "POST" ? { statut: 409, corps: { error: "Entreprise en mode réel : le corpus de démonstration n'y est jamais importé." } } : { statut: 200, corps: {} });
    rendu = await rendre(createElement(VueParametres));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(c.textContent).toContain("Recharger la démonstration"));
    await cliquer(parTexte(c, "button", "Recharger la démonstration"));
    await vi.waitFor(() => expect(c.textContent).toContain("mode réel"));
    expect(c.textContent).not.toContain("clients chargés");
  });
});
