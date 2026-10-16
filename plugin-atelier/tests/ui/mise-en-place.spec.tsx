// @vitest-environment jsdom
/**
 * Lot 2 : bandeau « entreprise courante », vue « Mise en place du client » (parcours en six étapes lues sur les
 * routes existantes) et paramètres (sans rechargement de démonstration). Les routes du plugin
 * et l'API native sont servies par un `fetch` simulé.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BandeauEntreprise } from "../../src/ui/composants.js";
import type { ReglagesEntreprise } from "../../src/contrats/campagnes.js";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { calculerEtapes, indexEtapeCourante, VueMiseEnPlace, type EntreesParcours } from "../../src/ui/vues/mise-en-place.js";
import { lireSegmentsSuivis } from "../../src/ui/vues/marque.js";
import { VueParametres } from "../../src/ui/vues/parametres.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

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
  it("affiche le nom complet sans aucune pastille de mode, quel que soit le réglage lu", async () => {
    for (const mode of ["demonstration", "reel"]) {
      pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: mode });
      rendu = await rendre(createElement(BandeauEntreprise));
      await vi.waitFor(() => expect(rendu!.conteneur.textContent).toContain("Assurances Dupont & Fils SRL"));
      expect(rendu.conteneur.textContent).not.toMatch(/démo|client réel/i);
      expect(rendu.conteneur.querySelector(".atl-pastille")).toBeNull();
      rendu.demonter();
      rendu = null;
    }
  });

  it("sans nom lisible, il reste utilisable et ne plante pas", async () => {
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    rendu = await rendre(createElement(BandeauEntreprise));
    expect(rendu.conteneur.textContent).toContain("Entreprise courante");
  });
});

const H = "2026-10-16T08:00:00.000Z";
const br = (cle: string, etat: string) => ({ cle, nom: `Nom ${cle}`, etat, preuve: "mesure", detail: `Détail ${cle}.`, acteur: "nous", debloque: { criteres: [], fonctions: [`Fonction ${cle}`] }, leadsConcernes: null, verifieLe: H });
const REALITE_COMPLETE = { companyId: ENTREPRISE, branchements: [br("bce", "reel"), br("osm", "reel")], synthese: [], leads: { analyses: 0, tronque: false, illisibles: 0 }, verifieLe: H };
const REALITE_PARTIELLE = { ...REALITE_COMPLETE, branchements: [br("bce", "reel"), br("osm", "demonstration"), br("base_clients", "a_fournir_client")] };

/** Fiche du client avec deux bureaux et un référentiel de segments (aucun bureau n'a encore de segments suivis). */
function marqueAvecSegments(extra: Record<string, unknown> = {}) {
  const base = (EXEMPLES_DONNEES["atelier.marque"] as unknown as { marque: Record<string, unknown> }).marque;
  return {
    data: {
      marque: {
        ...base,
        etablissements: [
          { nom: "Bureau A", adresse: null, confirme: true, code: "bureau-a" },
          { nom: "Bureau B", adresse: null, confirme: true, code: "bureau-b", position: { lat: 50.6, lon: 5.5 }, segmentsSuivis: ["medecins"] },
        ],
        entites: [{ code: "entite", nom: "Entité du client", type: "entite_juridique", porteePar: null, identifiants: [{ type: "bce", libelle: null, valeur: "0123.456.789" }, { type: "fsma", libelle: null, valeur: "12345" }], mentionsLegales: "Mentions." }],
        segments: [
          { code: "medecins", libelle: "Médecins", type: "profession", nace: [] },
          { code: "avocats", libelle: "Avocats", type: "profession", nace: [] },
        ],
        ...extra,
      },
      versions: [{ version: 1, creeLe: H }],
      sources: [],
      imports: [],
    },
    loading: false,
    error: null,
  };
}

/** Sert les routes lues par le parcours ; `realite` absent : la route répond une forme inconnue (état non lu). */
function servir(o: { base?: { existe: boolean; clients: number }; documents?: number; realite?: unknown } = {}) {
  serveur = (_m, u) =>
    u.includes("/base-clients?")
      ? { statut: 200, corps: o.base ?? { existe: false, clients: 0 } }
      : u.includes("/connaissances/statut")
        ? { statut: 200, corps: { documents: o.documents ?? 0, passages: 0 } }
        : u.includes("/realite?")
          ? { statut: 200, corps: o.realite ?? {} }
          : { statut: 200, corps: {} };
}

const etatDe = (c: HTMLElement, cle: string) => c.querySelector(`.atl-parcours-pas[data-etape="${cle}"]`)?.getAttribute("data-etat");
const barre = (c: HTMLElement) => c.querySelector('[role="progressbar"]')!;

describe("calculerEtapes : état de chaque étape d'après les données lues", () => {
  const vide: EntreesParcours = { marque: null, reglages: null, baseClients: null, connaissances: null, nbServices: null, sourcesReelles: null, realite: { etat: "chargement" } };
  const etats = (e: EntreesParcours) => Object.fromEntries(calculerEtapes(e).map((x) => [x.cle, x.etat]));

  it("rien n'est lu : six étapes dont l'état est inconnu, jamais « fait »", () => {
    expect(etats(vide)).toEqual({ fiche: "inconnu", sources: "inconnu", "base-clients": "inconnu", documents: "inconnu", plafonds: "inconnu", reel: "inconnu" });
  });

  it("client neuf : fiche, sources et plafonds à faire ; base clients et documents facultatifs", () => {
    const neuf: EntreesParcours = {
      marque: { marque: null, versions: [], sources: [], imports: [] },
      reglages: { plafondPub: null } as unknown as ReglagesEntreprise,
      baseClients: { existe: false, clients: 0 },
      connaissances: { documents: 0 },
      nbServices: 0,
      sourcesReelles: { passerelle: "injoignable", sources: [] },
      realite: { etat: "pret", realite: REALITE_PARTIELLE as never, branchements: REALITE_PARTIELLE.branchements as never },
    };
    expect(etats(neuf)).toEqual({ fiche: "a_faire", sources: "a_faire", "base-clients": "facultatif", documents: "facultatif", plafonds: "a_faire", reel: "a_faire" });
    expect(indexEtapeCourante(calculerEtapes(neuf))).toBe(0);
  });

  it("client prêt : tout est fait ; l'étape courante est alors la dernière", () => {
    const pret: EntreesParcours = {
      marque: marqueAvecSegments().data as never,
      reglages: { plafondPub: { type: "aucune_limite" } } as unknown as ReglagesEntreprise,
      baseClients: { existe: true, clients: 105 },
      connaissances: { documents: 17 },
      nbServices: 2,
      sourcesReelles: { passerelle: "joignable", sources: [{ cle: "bce", nom: "BCE", reelle: true, detail: "d", verifieLe: H }] },
      realite: { etat: "pret", realite: REALITE_COMPLETE as never, branchements: REALITE_COMPLETE.branchements as never },
    };
    const etapes = calculerEtapes(pret);
    expect(etapes.every((x) => x.etat === "fait")).toBe(true);
    expect(indexEtapeCourante(etapes)).toBe(5);
  });

  it("une source « réelle » n'est comptée que si la passerelle est joignable", () => {
    const sources = (passerelle: "joignable" | "injoignable"): EntreesParcours["sourcesReelles"] => ({ passerelle, sources: [{ cle: "bce", nom: "BCE", reelle: true, detail: "d", verifieLe: H }] });
    expect(etats({ ...vide, nbServices: 0, sourcesReelles: sources("injoignable") }).sources).toBe("a_faire");
    expect(etats({ ...vide, nbServices: 0, sourcesReelles: sources("joignable") }).sources).toBe("fait");
  });

  it("l'étape courante est la première qui n'est pas faite, facultative comprise", () => {
    expect(indexEtapeCourante([{ etat: "fait" }, { etat: "fait" }, { etat: "facultatif" }, { etat: "a_faire" }])).toBe(2);
    expect(indexEtapeCourante([{ etat: "fait" }, { etat: "inconnu" }, { etat: "a_faire" }])).toBe(1);
  });
});

describe("mise en place du client : parcours en étapes", () => {
  it("client neuf : six étapes, première étape courante, progression à zéro et saisie de la fiche ouverte", async () => {
    pont.donnees["atelier.marque"] = { data: { marque: null, versions: [], sources: [], imports: [] }, loading: false, error: null };
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    pont.donnees["atelier.sante"] = SOURCES("injoignable", []);
    servir();
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(etatDe(c, "base-clients")).toBe("facultatif"));
    expect(c.querySelectorAll(".atl-parcours-pas")).toHaveLength(6);
    for (const t of ["Fiche du client", "Sources et connexions", "Base clients", "Documents", "Plafonds et budget", "Connexions"]) expect(c.querySelector(".atl-parcours-liste")!.textContent).toContain(t);
    expect([etatDe(c, "fiche"), etatDe(c, "sources"), etatDe(c, "documents"), etatDe(c, "plafonds")]).toEqual(["a_faire", "a_faire", "facultatif", "a_faire"]);
    expect(c.querySelector('.atl-parcours-pas[aria-current="step"]')!.getAttribute("data-etape")).toBe("fiche");
    expect(c.querySelector(".atl-parcours-pas[data-courante]")!.getAttribute("data-etape")).toBe("fiche");
    expect(barre(c).getAttribute("aria-valuenow")).toBe("0");
    expect(barre(c).getAttribute("aria-valuemax")).toBe("6");
    expect(c.textContent).toContain("0 étape sur 6 faite");
    expect(c.textContent).toContain("Étape 1 sur 6 : Fiche du client");
    expect(c.textContent).toContain("Première version de la marque");
  });

  it("client prêt : les étapes faites d'après les données, la progression et l'étape courante avancent", async () => {
    pont.donnees["atelier.marque"] = marqueAvecSegments();
    pont.donnees["atelier.sante"] = SOURCES("joignable", ["osm"]);
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration", plafondPub: { type: "aucune_limite", decidePar: "local-board", decideLe: H } });
    servir({ base: { existe: true, clients: 105 }, documents: 17, realite: REALITE_PARTIELLE });
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    // Les connexions natives sont vides ici, mais une source réelle suffit pour l'étape des sources.
    await vi.waitFor(() => expect(etatDe(c, "reel")).toBe("a_faire"));
    expect([etatDe(c, "fiche"), etatDe(c, "sources"), etatDe(c, "base-clients"), etatDe(c, "documents"), etatDe(c, "plafonds")]).toEqual(["fait", "fait", "fait", "fait", "fait"]);
    expect(barre(c).getAttribute("aria-valuenow")).toBe("5");
    expect(c.textContent).toContain("5 étapes sur 6 faites");
    expect(c.querySelector(".atl-parcours-pas[data-courante]")!.getAttribute("data-etape")).toBe("reel");
    expect(c.querySelector('.atl-parcours-pas[aria-current="step"]')!.getAttribute("data-etape")).toBe("reel");
    // Récapitulatif des connexions : les branchements qui ne sont pas en réel, et le lien vers l'onglet.
    // Les trois branchements du serveur, plus les deux lignes tirées des connexions natives (vides ici).
    expect(c.textContent).toContain("Connexions à établir : 4 sur 5.");
    expect(c.textContent).toContain("Nom base_clients : À fournir par le client.");
    expect(c.textContent).not.toContain("Nom bce");
    await cliquer(parTexte(c, "a", "Ouvrir les connexions"));
    expect(pont.navigations).toEqual(["/atelier/parametres#param-reel"]);
    expect(pont.violations).toEqual([]);
  });

  it("on choisit une étape au clic, puis les boutons précédent et suivant naviguent", async () => {
    pont.donnees["atelier.marque"] = marqueAvecSegments();
    pont.donnees["atelier.sante"] = SOURCES("injoignable", []);
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    servir();
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(etatDe(c, "base-clients")).toBe("facultatif"));
    // La fiche est faite : l'étape courante est celle des sources.
    expect(c.querySelector('.atl-parcours-pas[aria-current="step"]')!.getAttribute("data-etape")).toBe("sources");
    await cliquer(parTexte(c, "button.atl-parcours-pas", "Plafonds et budget"));
    expect(c.textContent).toContain("Étape 5 sur 6 : Plafonds et budget");
    expect(c.querySelector(".atl-parcours-pas[data-courante]")!.getAttribute("data-etape")).toBe("sources");
    await cliquer(parTexte(c, "button", "Étape suivante"));
    expect(c.textContent).toContain("Étape 6 sur 6 : Connexions");
    expect(Array.from(c.querySelectorAll("button")).some((b) => b.textContent === "Étape suivante")).toBe(false);
    await cliquer(parTexte(c, "button", "Étape précédente"));
    await cliquer(parTexte(c, "button", "Étape précédente"));
    expect(c.textContent).toContain("Étape 4 sur 6 : Documents");
  });

  it("étape Sources : état des sources et lien vers l'onglet qui règle les connexions", async () => {
    pont.donnees["atelier.marque"] = marqueAvecSegments();
    pont.donnees["atelier.sante"] = SOURCES("joignable", ["osm", "liens"]);
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    servir();
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(etatDe(c, "sources")).toBe("fait"));
    await cliquer(parTexte(c, "button.atl-parcours-pas", "Sources et connexions"));
    expect(c.textContent).toContain("2 sources réelles sur 4");
    await cliquer(parTexte(c, "a", "Ouvrir les connexions et les sources"));
    expect(pont.navigations).toEqual(["/atelier/parametres"]);
  });
});

describe("mise en place : segments suivis des bureaux", () => {
  async function ouvrirFiche() {
    pont.donnees["atelier.marque"] = marqueAvecSegments();
    pont.donnees["atelier.sante"] = SOURCES("injoignable", []);
    pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: "demonstration" });
    pont.actions["atelier.marque.enregistrer"] = async () => ({});
    servir();
    rendu = await rendre(createElement(VueMiseEnPlace));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(etatDe(c, "base-clients")).toBe("facultatif"));
    await cliquer(parTexte(c, "button.atl-parcours-pas", "Fiche du client"));
    await cliquer(parTexte(c, "button", "Compléter la fiche"));
    return c;
  }
  const envoyes = () => pont.appelsActions.filter((a) => a.cle === "atelier.marque.enregistrer");

  it("résume les bureaux (position, segments suivis) et les identifiants BCE et FSMA", async () => {
    const c = await ouvrirFiche();
    expect(c.textContent).toContain("2 bureaux dont 1 avec position et 1 avec segments suivis");
    expect(c.textContent).toContain("BCE 0123.456.789, FSMA 12345");
    expect(c.textContent).toContain("Segments suivis : medecins");
    expect(c.textContent).toContain("Segments suivis à saisir");
  });

  it("enregistre les segments suivis saisis par bureau, par la route d'écriture de la marque", async () => {
    const c = await ouvrirFiche();
    expect((champParLibelle(c, "Segments suivis par l'établissement 2") as HTMLInputElement).value).toBe("medecins");
    await saisir(champParLibelle(c, "Segments suivis par l'établissement 1"), "avocats, medecins");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    expect(envoyes()).toHaveLength(1);
    const e = (envoyes()[0]!.params as { etablissements: Array<Record<string, unknown>> }).etablissements;
    expect(e[0]!.segmentsSuivis).toEqual(["avocats", "medecins"]);
    expect(e[1]!.segmentsSuivis).toEqual(["medecins"]);
    expect(e[0]).not.toHaveProperty("segmentsTexte");
    expect(pont.violations).toEqual([]);
  });

  it("vider le champ retire les segments suivis du bureau", async () => {
    const c = await ouvrirFiche();
    await saisir(champParLibelle(c, "Segments suivis par l'établissement 2"), "");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    const e = (envoyes()[0]!.params as { etablissements: Array<Record<string, unknown>> }).etablissements;
    expect(e[1]).not.toHaveProperty("segmentsSuivis");
  });

  it("refuse un segment inconnu du référentiel, avec la liste des codes possibles, et n'envoie rien", async () => {
    const c = await ouvrirFiche();
    await saisir(champParLibelle(c, "Segments suivis par l'établissement 1"), "notaires");
    expect(c.textContent).toContain("Segment inconnu : notaires. Codes possibles : medecins, avocats.");
    await cliquer(parTexte(c, "button", "Enregistrer une nouvelle version"));
    expect(envoyes()).toHaveLength(0);
  });
});

describe("lireSegmentsSuivis", () => {
  it("découpe sur virgules, points-virgules et espaces, sans doublon", () => {
    expect(lireSegmentsSuivis("a, b;c  a", ["a", "b", "c"])).toEqual({ codes: ["a", "b", "c"], erreur: null });
    expect(lireSegmentsSuivis("  ", ["a"])).toEqual({ codes: [], erreur: null });
  });
  it("signale les codes inconnus, et l'absence de segments définis", () => {
    expect(lireSegmentsSuivis("a, x", ["a", "b"]).erreur).toBe("Segment inconnu : x. Codes possibles : a, b.");
    expect(lireSegmentsSuivis("a", []).erreur).toContain("Aucun segment n'est défini");
  });
});

describe("paramètres : plus de rechargement de démonstration", () => {
  it("aucun bouton de rechargement ni sélecteur de mode, quel que soit le réglage de l'entreprise", async () => {
    for (const mode of ["reel", "demonstration"]) {
      pont.donnees["atelier.reglages"] = reglages({ modeParDefaut: mode });
      rendu = await rendre(createElement(VueParametres));
      await vi.waitFor(() => expect(rendu!.conteneur.textContent).toContain("Remise à zéro des données de l'atelier"));
      expect(rendu.conteneur.textContent).not.toMatch(/Recharger la d/);
      expect(rendu.conteneur.textContent).not.toContain("Recharger");
      expect(rendu.conteneur.textContent).not.toContain("Mode par défaut");
      rendu.demonter();
      rendu = null;
    }
  });
});
