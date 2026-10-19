// @vitest-environment jsdom
/**
 * Notification des décisions humaines qui attendent dans les services : bandeau persistant sur les pages de l'atelier,
 * nombre publié pour la pastille du menu, titre de l'onglet, notification du navigateur seulement sur demande.
 * Une seule lecture partagée par tous les emplacements.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntreeAtelier, PageAtelier } from "../../src/ui/index.js";
import { CLE_NOTIFICATIONS, INTERVALLE_CARTES_SERVICES_MS, phraseDecisions, reinitialiserCartesServices } from "../../src/ui/cartes-services.js";
import { reinitialiserCompteurAFaire } from "../../src/ui/compteur-afaire.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { ReglagesDuChat, REGLAGES_PAR_DEFAUT } from "../../src/ui/composants/reglages-chat.js";
import { servirHote, type ScenarioHote } from "./hote-cartes.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Rendu } from "./pont.js";

const DIRECTION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SERVICES = [
  { companyId: DIRECTION, slug: "direction", nom: "Direction", estDirection: true, courant: false },
  { companyId: ENTREPRISE, slug: "marketing", nom: "Marketing", estDirection: false, courant: true },
];
const carte = (id: string, kind = "request_confirmation", nom = "Marketing") => ({
  element: { id: `question:${id}`, type: "information_manquante", urgence: "haute", enTete: true, titre: "Valider ce plan ?", raison: "r", lien: "/MKT/issues/MKT-2", action: "Confirmer", issueId: "i", interaction: { id, kind, invite: null, details: null, questions: [] } },
  date: "2026-10-18T10:05:00.000Z", companyId: ENTREPRISE, slug: nom.toLowerCase(), nom, tache: "MKT-2",
});
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "u" };

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string }> = [];
/** Cartes en attente dans le service Marketing, côté hôte : [identifiant, sorte]. */
let cartes: Array<[string, "request_confirmation" | "ask_user_questions"]> = [];
const scenario = (): ScenarioHote => ({
  taches: [{ id: "tache-mkt-2", companyId: ENTREPRISE, identifier: "MKT-2", title: "Plan de la campagne" }],
  aSuivre: [{ companyId: ENTREPRISE, tacheId: "tache-mkt-2", slug: "marketing", nom: "Marketing" }],
  cartes: { "tache-mkt-2": cartes.map(([id, kind]) => ({ id, kind, title: "Valider ce plan ?", createdAt: "2026-10-18T10:05:00.000Z", payload: { prompt: "Valider ce plan ?" } })) },
});

class FauxNotification {
  static permission: NotificationPermission = "default";
  static demandes = 0;
  static creees: Array<{ titre: string; options: { body?: string } | undefined }> = [];
  static requestPermission = vi.fn(async () => {
    FauxNotification.demandes += 1;
    FauxNotification.permission = "granted";
    return "granted" as NotificationPermission;
  });
  constructor(titre: string, options?: { body?: string }) {
    FauxNotification.creees.push({ titre, options });
  }
}

beforeEach(() => {
  installerPont("/RNO/atelier/equipe");
  oublierDepartements();
  reinitialiserCartesServices();
  reinitialiserCompteurAFaire();
  appels = [];
  cartes = [["k1", "request_confirmation"]];
  FauxNotification.permission = "default";
  FauxNotification.demandes = 0;
  FauxNotification.creees = [];
  FauxNotification.requestPermission.mockClear();
  vi.stubGlobal("Notification", FauxNotification);
  try {
    window.localStorage.removeItem(CLE_NOTIFICATIONS);
  } catch {
    // sans stockage
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      appels.push({ methode: init?.method ?? "GET", url });
      const j = (c: unknown) => new Response(JSON.stringify(c), { status: 200 });
      if (url.includes("/departements?")) return j({ client: "fictive-sa", departements: SERVICES });
      const hote = (init?.method ?? "GET") === "GET" ? servirHote(url, scenario()) : null;
      if (hote) return hote;
      if (url.includes("/accueil?")) return j({ companyId: "c", elements: [], missions: [] });
      if (url.includes("/discussion")) return j({ issueId: "i1", identifiant: "DIR-2", messages: [], cartes: [] });
      if (url.endsWith("/api/companies")) return j([]);
      return j({ id: ENTREPRISE, name: "Fictive · Marketing" });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  reinitialiserCartesServices();
});

const lecturesCartes = () => appels.filter((a) => a.url.includes("/discussion/cartes-services"));
const nombrePublie = () => (window as unknown as { __atelierDecisions?: number }).__atelierDecisions;

describe("phrase des décisions", () => {
  it("un service, une confirmation ou une question, plusieurs décisions, plusieurs services", () => {
    expect(phraseDecisions([carte("a") as never])).toBe("Le service Marketing attend votre accord.");
    expect(phraseDecisions([carte("a", "ask_user_questions") as never])).toBe("Le service Marketing vous pose une question.");
    expect(phraseDecisions([carte("a") as never, carte("b") as never])).toBe("Le service Marketing attend 2 décisions de votre part.");
    expect(phraseDecisions([carte("a") as never, carte("b", "request_confirmation", "Juridique") as never])).toBe("2 décisions vous attendent, dans les services Marketing et Juridique.");
    expect(phraseDecisions([])).toBe("");
  });
});

describe("bandeau, titre de l'onglet et nombre publié pour le menu", () => {
  it("bandeau persistant en haut d'une page de l'atelier, avec le lien vers le chat ; titre « (1) Atelier » ; une seule lecture partagée", async () => {
    document.title = "Paperclip";
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(c.querySelector('[data-testid="bandeau-decisions"]')).not.toBeNull());
    const bandeau = c.querySelector('[data-testid="bandeau-decisions"]')!;
    expect(bandeau.textContent).toContain("Le service Marketing attend votre accord.");
    expect(bandeau.querySelector("a")!.textContent).toBe("Ouvrir dans le chat");
    expect(bandeau.querySelector("a")!.getAttribute("href")).toBe("/RNO/atelier/discussion");
    expect(bandeau.textContent).not.toContain("—");
    expect(document.title).toBe("(1) Atelier");
    expect(nombrePublie()).toBe(1);
    // Bandeau, titre : une seule lecture, pas une par emplacement.
    expect(lecturesCartes()).toHaveLength(1);
    expect(appels.filter((a) => a.methode !== "GET")).toEqual([]);
  });

  it("pas de bandeau dans le chat lui-même (les cartes y sont dans le fil)", async () => {
    installerPont("/RNO/atelier/discussion");
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    await vi.waitFor(() => expect(nombrePublie()).toBe(1));
    expect(rendu.conteneur.querySelector('[data-testid="bandeau-decisions"]')).toBeNull();
  });

  it("le bandeau reste tant qu'une carte attend, puis disparaît quand la lecture suivante (15 s) n'en trouve plus", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    const c = rendu.conteneur;
    await vi.waitFor(() => expect(c.querySelector('[data-testid="bandeau-decisions"]')).not.toBeNull());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(c.querySelector('[data-testid="bandeau-decisions"]')).not.toBeNull();
    expect(lecturesCartes().length).toBeGreaterThanOrEqual(2);
    cartes = [];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(c.querySelector('[data-testid="bandeau-decisions"]')).toBeNull();
    expect(nombrePublie()).toBe(0);
  });

  it("l'entrée du menu publie le nombre pour la pastille du socle et l'annonce par un événement, sans rien afficher d'autre", async () => {
    const recus: number[] = [];
    const ecoute = (e: Event) => recus.push((e as CustomEvent<{ nombre: number }>).detail.nombre);
    window.addEventListener("atelier:decisions", ecoute);
    try {
      rendu = await rendre(createElement(EntreeAtelier, { context: contexte } as never));
      await vi.waitFor(() => expect(nombrePublie()).toBe(1));
      expect(recus).toContain(1);
      expect(rendu.conteneur.querySelector('[data-testid="bandeau-decisions"]')).toBeNull();
    } finally {
      window.removeEventListener("atelier:decisions", ecoute);
    }
  });

  it("client à un seul service : aucune lecture des cartes, rien de publié", async () => {
    const base = fetch as unknown as ReturnType<typeof vi.fn>;
    const ancien = base.getMockImplementation()! as (u: string, i?: unknown) => Promise<Response>;
    base.mockImplementation(async (url: string, init?: unknown) => (url.includes("/departements?") ? new Response(JSON.stringify({ client: "x", departements: [SERVICES[1]] }), { status: 200 }) : ancien(url, init)));
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    await new Promise((r) => setTimeout(r, 20));
    expect(lecturesCartes()).toHaveLength(0);
    expect(rendu.conteneur.querySelector('[data-testid="bandeau-decisions"]')).toBeNull();
    expect(nombrePublie() ?? 0).toBe(0);
  });
});

describe("notification du navigateur : seulement si la personne l'a demandée", () => {
  it("aucune demande d'autorisation ni notification au chargement", async () => {
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    await vi.waitFor(() => expect(nombrePublie()).toBe(1));
    expect(FauxNotification.requestPermission).not.toHaveBeenCalled();
    expect(FauxNotification.creees).toEqual([]);
  });

  it("le bouton « Me prévenir » des réglages du chat demande l'autorisation au clic, puis active les notifications", async () => {
    rendu = await rendre(createElement(ReglagesDuChat, { reglages: REGLAGES_PAR_DEFAUT, onChange: () => undefined }));
    expect(FauxNotification.requestPermission).not.toHaveBeenCalled();
    await cliquer(rendu.conteneur.querySelector("button.atl-disc-reglage")!);
    await cliquer(parTexte(rendu.conteneur, "button", "Me prévenir"));
    expect(FauxNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(CLE_NOTIFICATIONS)).toBe("1");
    expect(parTexte(rendu.conteneur, "label", "Me prévenir dans le navigateur").querySelector<HTMLInputElement>("input")!.checked).toBe(true);
  });

  it("autorisation refusée par le navigateur : explication, pas de bouton", async () => {
    FauxNotification.permission = "denied";
    rendu = await rendre(createElement(ReglagesDuChat, { reglages: REGLAGES_PAR_DEFAUT, onChange: () => undefined }));
    await cliquer(rendu.conteneur.querySelector("button.atl-disc-reglage")!);
    expect(rendu.conteneur.textContent).toContain("Les notifications sont bloquées pour ce site");
    expect(() => parTexte(rendu!.conteneur, "button", "Me prévenir")).toThrow();
  });

  it("autorisée ET demandée : une notification pour une NOUVELLE décision seulement (pas pour celles déjà présentes au chargement)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    FauxNotification.permission = "granted";
    window.localStorage.setItem(CLE_NOTIFICATIONS, "1");
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    await vi.waitFor(() => expect(nombrePublie()).toBe(1));
    expect(FauxNotification.creees).toEqual([]);
    cartes = [["k1", "request_confirmation"], ["k2", "ask_user_questions"]];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(FauxNotification.creees).toHaveLength(1);
    expect(FauxNotification.creees[0]!.options?.body).toBe("Le service Marketing vous pose une question.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(FauxNotification.creees).toHaveLength(1);
  });

  it("autorisée mais non demandée dans les réglages : aucune notification", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    FauxNotification.permission = "granted";
    rendu = await rendre(createElement(PageAtelier, { context: contexte } as never));
    await vi.waitFor(() => expect(nombrePublie()).toBe(1));
    cartes = [["k1", "request_confirmation"], ["k2", "request_confirmation"]];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(FauxNotification.creees).toEqual([]);
  });
});
