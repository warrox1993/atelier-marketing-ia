// @vitest-environment jsdom
/**
 * Chat du Coordinateur général : les cartes de décision posées dans les AUTRES services (tâches reçues par liaison) sont
 * dans le fil, à leur date, avec le nom du service ; réponse et acceptation partent vers la bonne tâche sans quitter le
 * chat ; rien n'est écrit au montage ; le message d'ouverture les compte.
 */
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueDiscussion } from "../../src/ui/vues/discussion.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { INTERVALLE_CARTES_SERVICES_MS, reinitialiserCartesServices } from "../../src/ui/cartes-services.js";
import { servirHote, type CarteFictive, type ScenarioHote, type TacheFictive } from "./hote-cartes.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, radio, rendre, type Rendu } from "./pont.js";

const DIRECTION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MARKETING = ENTREPRISE;
const SERVICES = [
  { companyId: DIRECTION, slug: "direction", nom: "Direction", estDirection: true, courant: false },
  { companyId: MARKETING, slug: "marketing", nom: "Marketing", estDirection: false, courant: true },
];
const message = (id: string, date: string, texte: string) => ({ id, auteur: "agent", nom: "Coordinateur général", texte, date, actions: [] });
const MESSAGES = [message("m1", "2026-10-18T10:00:00.000Z", "Je transmets au Marketing."), message("m2", "2026-10-18T10:10:00.000Z", "Voici où nous en sommes.")];
// Cartes natives de l'hôte : une confirmation sur la tâche reçue, une question sur sa sous-tâche.
const CONFIRMATION: CarteFictive = {
  id: "k9", kind: "request_confirmation", title: "Valider ce plan et lancer les sous-tâches ?", createdAt: "2026-10-18T10:05:00.000Z",
  payload: { prompt: "Valider ce plan et lancer les sous-tâches ?", acceptLabel: "Valider le plan", rejectLabel: "Refuser" },
};
const QUESTION: CarteFictive = {
  id: "k8", kind: "ask_user_questions", title: "Quel budget ?", createdAt: "2026-10-18T10:07:00.000Z",
  payload: { questions: [{ id: "qb", prompt: "Quel budget ?", selectionMode: "single", required: true, options: [{ id: "bas", label: "Petit" }, { id: "haut", label: "Grand" }] }] },
};
const TACHES: TacheFictive[] = [
  { id: "iss-mkt-2", companyId: MARKETING, identifier: "MKT-2", title: "Plan de la campagne" },
  { id: "iss-mkt-3", companyId: MARKETING, identifier: "MKT-3", title: "Budget", parentId: "iss-mkt-2" },
];
const hote = (cartes: Record<string, CarteFictive[]>): ScenarioHote => ({
  taches: TACHES,
  aSuivre: [{ companyId: MARKETING, tacheId: "iss-mkt-2", slug: "marketing", nom: "Marketing" }],
  cartes,
});
const TOUTES = { "iss-mkt-2": [CONFIRMATION], "iss-mkt-3": [QUESTION] };

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let scenario: ScenarioHote = hote(TOUTES);
let accueilDirection: unknown[] = [];

beforeEach(() => {
  installerPont("/MKT/atelier/discussion");
  oublierDepartements();
  reinitialiserCartesServices();
  appels = [];
  scenario = hote(TOUTES);
  accueilDirection = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url, corps: init?.body ? JSON.parse(init.body) : null });
      const j = (c: unknown) => new Response(JSON.stringify(c), { status: 200 });
      if (methode === "GET" && url.includes("/departements?")) return j({ client: "fictive-sa", departements: SERVICES });
      if (methode === "GET" && url.endsWith("/api/companies")) return j([{ id: DIRECTION, name: "Fictive · Direction", issuePrefix: "DIR" }, { id: MARKETING, name: "Fictive · Marketing", issuePrefix: "MKT" }]);
      if (methode === "GET" && url.includes("/accueil?")) return j({ companyId: DIRECTION, elements: new URL(url, "http://x").searchParams.get("companyId") === DIRECTION ? accueilDirection : [], missions: [] });
      const hoteServi = methode === "GET" ? servirHote(url, scenario) : null;
      if (hoteServi) return hoteServi;
      if (methode === "GET" && url.includes("/discussion/messages")) return j({ messages: [], cartes: [] });
      if (methode === "GET" && url.includes("/discussion")) return j({ issueId: "i1", identifiant: "DIR-2", messages: MESSAGES, cartes: [] });
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
const lecturesCartes = () => appels.filter((a) => a.methode === "GET" && a.url.includes("/discussion/cartes-services"));

describe("chat : décisions des autres services dans le fil", () => {
  it("la frise de la mission est en tête du fil (lecture partagée avec les cartes) : phase qui attend la décision, aucune lecture en double de la tâche", async () => {
    const c = await ouvrir();
    const frise = c.querySelector("[data-testid=frise-mission]");
    expect(frise).not.toBeNull();
    expect(frise!.querySelectorAll("li.atl-frise-phase")).toHaveLength(6);
    // La sous-tâche MKT-3 (sans agent connu : repli sur le titre, donc Production) porte une question en attente.
    expect(frise!.querySelector("[data-phase=production]")!.textContent).toContain("attend votre décision");
    expect(frise!.querySelector("[data-phase=reponse]")!.textContent).toContain("attend votre décision");
    expect(appels.filter((x) => x.methode === "GET" && x.url.endsWith("/issues/iss-mkt-2"))).toHaveLength(1);
  });

  it("la carte du service est mêlée aux messages à sa date de création, avec le nom du service", async () => {
    const c = await ouvrir();
    const fil = Array.from(c.querySelectorAll('[role="log"] > .atl-disc-bulle')).filter((b) => !b.hasAttribute("data-situation"));
    expect(fil.map((b) => (b.getAttribute("data-carte") === "oui" ? "carte" : "message"))).toEqual(["message", "carte", "carte", "message"]);
    expect(fil[1]!.textContent).toContain("demande votre accord");
    expect(fil[2]!.textContent).toContain("vous pose une question");
    expect(fil[1]!.getAttribute("data-service")).toBe("Marketing");
    expect(fil[1]!.querySelector(".atl-disc-dep")!.textContent).toBe("Marketing");
    expect(fil[1]!.textContent).toContain("Valider ce plan et lancer les sous-tâches ?");
    expect(fil[0]!.textContent).toContain("Je transmets au Marketing.");
    expect(fil[3]!.textContent).toContain("Voici où nous en sommes.");
  });

  it("aucune écriture au montage ; la lecture vise la seule entreprise Direction", async () => {
    await ouvrir();
    expect(appels.filter((a) => a.methode !== "GET")).toEqual([]);
    const lectures = lecturesCartes();
    expect(lectures.length).toBeGreaterThan(0);
    for (const l of lectures) expect(new URL(l.url, "http://x").searchParams.get("companyId")).toBe(DIRECTION);
  });

  it("les cartes sont lues dans l'hôte par l'interface (tâche, sous-tâches, cartes), jamais dans une entreprise non annoncée par la route", async () => {
    await ouvrir();
    const gets = appels.filter((a) => a.methode === "GET").map((a) => a.url);
    expect(gets).toContain("/api/issues/iss-mkt-2");
    expect(gets).toContain(`/api/companies/${MARKETING}/issues?descendantOf=iss-mkt-2&limit=200`);
    expect(gets).toContain("/api/issues/iss-mkt-2/interactions");
    expect(gets).toContain("/api/issues/iss-mkt-3/interactions");
    // Entreprises lues par l'interface : la liste des services, rien d'autre que le service annoncé et la Direction.
    const entreprises = new Set(gets.map((u) => /^\/api\/companies\/([^/?]+)\/issues/.exec(u)?.[1]).filter(Boolean));
    expect([...entreprises]).toEqual([MARKETING]);
    expect(appels.filter((a) => a.methode !== "GET")).toEqual([]);
  });

  it("une carte déjà traitée et une tâche terminée ne donnent rien ; une sous-tâche d'un autre niveau est suivie", async () => {
    scenario = hote({ "iss-mkt-2": [{ ...CONFIRMATION, status: "accepted" }], "iss-mkt-3": [QUESTION], "iss-mkt-4": [{ ...CONFIRMATION, id: "k5", title: "Sur une tâche terminée" }] });
    scenario.taches = [...TACHES, { id: "iss-mkt-4", companyId: MARKETING, identifier: "MKT-4", title: "Terminée", status: "done", parentId: "iss-mkt-3" }];
    const c = await ouvrir();
    const cartes = Array.from(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]'));
    expect(cartes).toHaveLength(1);
    expect(cartes[0]!.textContent).toContain("Quel budget");
  });

  it("une tâche illisible n'efface pas les autres cartes", async () => {
    scenario.enPanne = new Set(["iss-mkt-3"]);
    const c = await ouvrir();
    const cartes = Array.from(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]'));
    expect(cartes).toHaveLength(1);
    expect(cartes[0]!.textContent).toContain("Valider ce plan");
  });

  it("acceptation en place : POST vers la tâche du service, la carte laisse place à la confirmation, lecture fraîche", async () => {
    const c = await ouvrir();
    const avant = lecturesCartes().length;
    scenario = hote({ "iss-mkt-3": [QUESTION] });
    await cliquer(parTexte(c, "button", "Valider le plan"));
    expect(appels.some((a) => a.methode === "POST" && a.url === "/api/issues/iss-mkt-2/interactions/k9/accept")).toBe(true);
    expect(c.textContent).not.toContain("Valider ce plan et lancer les sous-tâches ?");
    expect(c.textContent).toContain("Confirmé : l'équipe reprend le travail.");
    expect(lecturesCartes().length).toBeGreaterThan(avant);
    expect(lecturesCartes().at(-1)!.url).toContain("frais=1");
    // La confirmation garde la place de la carte, entre les deux messages.
    const fil = Array.from(c.querySelectorAll('[role="log"] > *')).map((e) => e.textContent ?? "");
    const i = fil.findIndex((t) => t.includes("Je transmets"));
    expect(fil[i + 1]).toContain("Confirmé : l'équipe reprend le travail.");
    expect(fil[i + 2]).toContain("Quel budget");
  });

  it("réponse à une question en place : corps {answers} posté vers la bonne tâche", async () => {
    const c = await ouvrir();
    const carte = Array.from(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]')).find((b) => b.textContent!.includes("Quel budget"))! as HTMLElement;
    await cliquer(radio(carte, "Grand"));
    await cliquer(parTexte(carte, "button", "Envoyer"));
    const post = appels.find((a) => a.methode === "POST")!;
    expect(post.url).toBe("/api/issues/iss-mkt-3/interactions/k8/respond");
    expect(post.corps).toEqual({ answers: [{ questionId: "qb", optionIds: ["haut"] }] });
  });

  it("le message d'ouverture compte ces décisions parmi les points en attente", async () => {
    const c = await ouvrir();
    const points = c.querySelector('[data-testid="situation-points"]')!;
    expect(points.textContent).toContain("J'ai 2 points qui attendent votre décision");
    expect(c.querySelector('[data-testid="situation-services"]')!.textContent).toContain("Le service Marketing attend 2 décisions de votre part.");
  });

  it("sans carte de service : pas de point ajouté, rien ne change dans le fil", async () => {
    scenario = hote({});
    const c = await ouvrir();
    expect(c.querySelector('[data-testid="situation-points"]')).toBeNull();
    expect(c.querySelector('.atl-disc-bulle[data-carte="oui"]')).toBeNull();
  });

  it("relue toutes les 15 s, une nouvelle carte apparaît sans recharger", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    scenario = hote({});
    const c = await ouvrir();
    expect(c.querySelector('.atl-disc-bulle[data-carte="oui"]')).toBeNull();
    scenario = hote({ "iss-mkt-2": [CONFIRMATION] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_CARTES_SERVICES_MS);
    });
    expect(c.querySelectorAll('.atl-disc-bulle[data-carte="oui"]')).toHaveLength(1);
  });
});
