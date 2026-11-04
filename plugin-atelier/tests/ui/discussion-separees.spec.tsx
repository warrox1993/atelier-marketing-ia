// @vitest-environment jsdom
/**
 * Discussions séparées, comme dans ChatGPT ou Claude : le fil d'une discussion ne montre que les cartes et les missions
 * nées de CETTE discussion. Une nouvelle discussion est vide ; une carte sans discussion d'origine n'apparaît dans aucun
 * fil. Les rappels « À faire » du client, les connexions et les cartes d'ailleurs tiennent dans UNE ligne repliée,
 * hors du journal. La relecture de 15 s ne fait jamais bouger le fil.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueDiscussion } from "../../src/ui/vues/discussion.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { INTERVALLE_CARTES_SERVICES_MS, reinitialiserCartesServices } from "../../src/ui/cartes-services.js";
import { servirHote, type CarteFictive, type ScenarioHote, type TacheFictive } from "./hote-cartes.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Rendu } from "./pont.js";

const DIRECTION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MARKETING = ENTREPRISE;
const SERVICES = [
  { companyId: DIRECTION, slug: "direction", nom: "Direction", estDirection: true, courant: false },
  { companyId: MARKETING, slug: "marketing", nom: "Marketing", estDirection: false, courant: true },
];
const carte = (id: string, titre: string): CarteFictive => ({
  id, kind: "request_confirmation", title: titre, createdAt: "2026-10-18T10:05:00.000Z",
  payload: { prompt: titre, acceptLabel: "Valider", rejectLabel: "Refuser" },
});
const tache = (id: string, identifier: string): TacheFictive => ({ id, companyId: MARKETING, identifier, title: `Tâche ${identifier}` });
const message = (id: string, texte: string) => ({ id, auteur: "agent", nom: "Coordinateur général", texte, date: "2026-10-18T10:00:00.000Z", actions: [] });

/** Trois tâches reçues : une née de la discussion i1, une de i2, une sans discussion d'origine. */
const SCENARIO = (cartes: Record<string, CarteFictive[]> = { a: [carte("ka", "Carte de la discussion UN")], b: [carte("kb", "Carte de la discussion DEUX")], c: [carte("kc", "Carte sans discussion")] }): ScenarioHote => ({
  taches: [tache("a", "MKT-1"), tache("b", "MKT-2"), tache("c", "MKT-3")],
  aSuivre: [
    { companyId: MARKETING, tacheId: "a", slug: "marketing", nom: "Marketing", discussionId: "i1" },
    { companyId: MARKETING, tacheId: "b", slug: "marketing", nom: "Marketing", discussionId: "i2" },
    { companyId: MARKETING, tacheId: "c", slug: "marketing", nom: "Marketing", discussionId: null },
  ],
  cartes,
});

let rendu: Rendu | null = null;
let scenario: ScenarioHote = SCENARIO();
let accueilDirection: unknown[] = [];
let fils: Record<string, { titre: string; messages: unknown[] }> = {};

beforeEach(() => {
  installerPont("/MKT/atelier/discussion");
  oublierDepartements();
  reinitialiserCartesServices();
  scenario = SCENARIO();
  accueilDirection = [];
  fils = { i1: { titre: "Discussion UN", messages: [message("m1", "Réponse UN")] }, i2: { titre: "Discussion DEUX", messages: [message("m2", "Réponse DEUX")] } };
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      const j = (c: unknown, statut = 200) => new Response(JSON.stringify(c), { status: statut });
      const q = new URL(url, "http://x").searchParams;
      if (methode === "GET" && url.includes("/departements?")) return j({ client: "fictive-sa", departements: SERVICES });
      if (methode === "GET" && url.endsWith("/api/companies")) return j([{ id: DIRECTION, name: "Fictive · Direction", issuePrefix: "DIR" }, { id: MARKETING, name: "Fictive · Marketing", issuePrefix: "MKT" }]);
      if (methode === "GET" && url.includes("/accueil?")) return j({ companyId: DIRECTION, elements: q.get("companyId") === DIRECTION ? accueilDirection : [], missions: [] });
      const hoteServi = methode === "GET" ? servirHote(url, scenario) : null;
      if (hoteServi) return hoteServi;
      if (methode === "GET" && url.includes("/discussion/liste")) return j({ discussions: Object.entries(fils).map(([issueId, f], n) => ({ issueId, identifiant: `DIR-${n}`, titre: f.titre, majLe: `2026-10-18T1${9 - n}:00:00.000Z`, statut: "todo" })) });
      if (methode === "GET" && url.includes("/discussion/messages")) return j({ messages: [], cartes: [] });
      if (methode === "GET" && url.includes("/discussion?")) {
        const id = q.get("issueId") ?? "i1";
        return j({ issueId: id, identifiant: `DIR-${id}`, messages: fils[id]?.messages ?? [], cartes: [] });
      }
      if (methode === "POST" && url.endsWith("/discussion/nouvelle")) {
        fils["i3"] = { titre: "Nouvelle discussion", messages: [] };
        return j({ issueId: "i3", identifiant: "DIR-i3", messages: [], cartes: [], cartesIndisponibles: false }, 201);
      }
      return j({});
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(VueDiscussion));
  return rendu.conteneur;
}
const journal = (c: ParentNode) => c.querySelector<HTMLElement>('[role="log"]')!;
const cartesDuFil = (c: ParentNode) => Array.from(journal(c).querySelectorAll('.atl-disc-bulle[data-carte="oui"]')).map((b) => b.textContent ?? "");
const bande = (c: ParentNode) => c.querySelector('[data-testid="bandeau-missions"]');
const ligne = (c: ParentNode) => c.querySelector<HTMLDetailsElement>('[data-testid="points-en-attente"]');

describe("fil d'une discussion : seulement ce qui en est né", () => {
  it("la discussion ouverte (i1) montre sa carte et sa frise de mission, pas celles de i2 ni celle sans discussion d'origine", async () => {
    const c = await ouvrir();
    const cartes = cartesDuFil(c);
    expect(cartes).toHaveLength(1);
    expect(cartes[0]).toContain("Carte de la discussion UN");
    expect(journal(c).textContent).not.toContain("Carte de la discussion DEUX");
    expect(journal(c).textContent).not.toContain("Carte sans discussion");
    expect(bande(c)).not.toBeNull();
  });

  it("une autre discussion (i2) montre la sienne seule", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c.querySelector("aside.atl-disc-historique")!, "button", /Discussion DEUX/));
    const cartes = cartesDuFil(c);
    expect(cartes).toHaveLength(1);
    expect(cartes[0]).toContain("Carte de la discussion DEUX");
    expect(journal(c).textContent).toContain("Réponse DEUX");
    expect(journal(c).textContent).not.toContain("Carte de la discussion UN");
  });

  it("une NOUVELLE discussion est vide : aucune carte, aucune frise de mission, phrase d'accueil", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c.querySelector("aside.atl-disc-historique")!, "button", "Nouvelle discussion"));
    expect(cartesDuFil(c)).toEqual([]);
    expect(bande(c)).toBeNull();
    expect(c.querySelector(".atl-disc-vide")).not.toBeNull();
    expect(journal(c).querySelectorAll(".atl-disc-bulle")).toHaveLength(0);
  });

  it("une carte sans discussion d'origine n'apparaît dans aucun fil, mais reste accessible dans la ligne repliée", async () => {
    scenario = SCENARIO({ c: [carte("kc", "Carte sans discussion")] });
    const c = await ouvrir();
    expect(cartesDuFil(c)).toEqual([]);
    expect(journal(c).textContent).not.toContain("Carte sans discussion");
    expect(ligne(c)!.textContent).toContain("Carte sans discussion");
  });
});

describe("une seule ligne repliée pour le reste", () => {
  it("rappels « À faire », connexions et cartes d'ailleurs : une ligne avec compteur, repliée, hors du journal, qui précède le fil", async () => {
    accueilDirection = [{ id: "tache:9", type: "tache_bloquee", urgence: "basse", titre: "Importer la base de clients", raison: "Raison.", lien: "/issues/ATL-9", action: "Ouvrir la tâche", issueId: "x9" }];
    const c = await ouvrir();
    const l = ligne(c)!;
    expect(l).not.toBeNull();
    expect(l.open).toBe(false);
    expect(l.querySelector("summary")!.textContent).toMatch(/^\d+ points? vous attend/u);
    expect(journal(c).contains(l)).toBe(false);
    expect(l.nextElementSibling).toBe(journal(c));
    // Rien de tout cela dans le journal.
    expect(journal(c).textContent).not.toContain("Importer la base de clients");
    expect(journal(c).textContent).not.toContain("Carte sans discussion");
    // Le clic ouvre la liste, qui reste complète et actionnable.
    await cliquer(l.querySelector("summary")!);
    expect(l.open).toBe(true);
    expect(l.textContent).toContain("Importer la base de clients");
    expect(l.textContent).toContain("Carte sans discussion");
    expect(l.textContent).toContain("Carte de la discussion DEUX");
  });

  it("rien en attente : aucune ligne", async () => {
    scenario = SCENARIO({});
    const c = await ouvrir();
    expect(ligne(c)).toBeNull();
  });
});

describe("la relecture de 15 s ne fait jamais bouger le fil", () => {
  /** Espionne le défilement automatique du fil (jsdom n'a pas de mise en page : hauteur fixe, écritures comptées). */
  function espionnerDefilement(c: ParentNode) {
    const fil = c.querySelector<HTMLElement>(".atl-disc-fil")!;
    const ecritures: number[] = [];
    Object.defineProperty(fil, "scrollHeight", { configurable: true, get: () => 1000 });
    Object.defineProperty(fil, "scrollTop", { configurable: true, get: () => 0, set: (v: number) => void ecritures.push(v) });
    return ecritures;
  }

  it("une nouvelle carte d'une AUTRE discussion ou sans discussion : ni défilement, ni changement du journal", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    scenario = SCENARIO({ a: [carte("ka", "Carte de la discussion UN")] });
    const c = await ouvrir();
    const ecritures = espionnerDefilement(c);
    const avant = journal(c).innerHTML;
    scenario = SCENARIO({ a: [carte("ka", "Carte de la discussion UN")], b: [carte("kb", "Carte de la discussion DEUX")], c: [carte("kc", "Carte sans discussion")] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(ligne(c)).not.toBeNull(); // la relecture a bien eu lieu
    expect(ecritures).toEqual([]);
    expect(journal(c).innerHTML).toBe(avant);
  });

  it("une relecture sans rien de nouveau ne change rien non plus", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const c = await ouvrir();
    const ecritures = espionnerDefilement(c);
    const avant = journal(c).innerHTML;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS * 2);
    });
    expect(ecritures).toEqual([]);
    expect(journal(c).innerHTML).toBe(avant);
  });

  it("une nouvelle carte née de CETTE discussion fait défiler le fil", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    scenario = SCENARIO({});
    const c = await ouvrir();
    const ecritures = espionnerDefilement(c);
    scenario = SCENARIO({ a: [carte("ka", "Carte de la discussion UN")] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(cartesDuFil(c)).toHaveLength(1);
    expect(ecritures.length).toBeGreaterThan(0);
  });
});
