// @vitest-environment jsdom
/**
 * Historique des discussions : colonne de gauche, reprise d'une ancienne discussion au clic, « Nouvelle discussion »,
 * `/clear` (décidé par le serveur), identifiant joint à chaque lecture et à chaque envoi, repli en fenêtre étroite.
 * Faux serveur en mémoire qui tient plusieurs discussions.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STYLES_HISTORIQUE } from "../../src/ui/styles-historique-discussions.js";
import { STYLES_DISCUSSION } from "../../src/ui/styles-discussion.js";
import { VueDiscussion } from "../../src/ui/vues/discussion.js";
import { cliquer, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: Record<string, unknown> | null }> = [];
let panneListe = false;
let cartesEnPanne = false;
interface Fil { id: string; titre: string; majLe: string; messages: Array<Record<string, unknown>> }
let fils: Fil[] = [];
let n = 0;

const message = (auteur: "humain" | "agent", texte: string) => ({ id: `m${++n}`, auteur, nom: auteur === "humain" ? "Vous" : "Coordinateur", texte, date: new Date(Date.UTC(2026, 9, 27, 10, 0, n)).toISOString(), actions: [] });
const fil = (id: string, titre: string, majLe: string, messages: Array<Record<string, unknown>> = []): Fil => ({ id, titre, majLe, messages });
const ouverture = (f: Fil | undefined) => (f ? { issueId: f.id, identifiant: `DEM-${f.id}`, messages: f.messages, cartes: [], cartesIndisponibles: cartesEnPanne } : { issueId: null, identifiant: null, messages: [], cartes: [], cartesIndisponibles: false });
const recente = () => [...fils].sort((a, b) => b.majLe.localeCompare(a.majLe))[0];
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut });

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
  appels = [];
  panneListe = false;
  cartesEnPanne = false;
  n = 0;
  fils = [fil("iB", "Plan de la campagne", "2026-10-27T09:00:00.000Z", [message("humain", "Plan"), message("agent", "Voici le plan")]), fil("iA", "Où en sont les missions ?", "2026-10-20T09:00:00.000Z", [message("humain", "Missions"), message("agent", "Tout avance")])];
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      const corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      appels.push({ methode, url, corps });
      const q = new URL(url, "http://x").searchParams;
      if (url.includes("/dictee/etat")) return json({ disponible: false });
      if (url.startsWith("/api/issues/")) return json({});
      if (methode === "GET" && url.includes("/accueil?")) return json({ companyId: "c", elements: [], missions: [] });
      if (methode === "GET" && url.includes("/discussion/liste")) return panneListe ? json({ erreur: "panne" }, 500) : json({ discussions: [...fils].sort((a, b) => b.majLe.localeCompare(a.majLe)).map((f) => ({ issueId: f.id, identifiant: `DEM-${f.id}`, titre: f.titre, majLe: f.majLe, statut: "todo" })) });
      if (methode === "GET" && url.includes("/discussion/messages")) return json({ ...ouverture(fils.find((f) => f.id === q.get("issueId")) ?? recente()), messages: [] });
      if (methode === "GET" && url.includes("/discussion?")) return json(ouverture(q.get("issueId") ? fils.find((f) => f.id === q.get("issueId")) : recente()));
      if (methode === "POST" && url.endsWith("/discussion/nouvelle")) {
        const f = fil("iN", "Nouvelle discussion", "2026-10-27T11:00:00.000Z");
        fils.push(f);
        return json(ouverture(f), 201);
      }
      if (methode === "POST" && url.endsWith("/discussion/supprimer")) {
        fils = fils.filter((f) => f.id !== corps?.issueId);
        return json({ supprimee: corps?.issueId });
      }
      if (methode === "POST" && url.endsWith("/discussion/message")) {
        if (/^\/(clear|nouveau)$/i.test(String(corps?.texte))) {
          const f = fil("iC", "Nouvelle discussion", "2026-10-27T12:00:00.000Z");
          fils.push(f);
          return json({ nouvelle: ouverture(f) }, 201);
        }
        const m = message("humain", String(corps?.texte));
        fils.find((f) => f.id === corps?.issueId)?.messages.push(m);
        return json({ ...m, reveilDemande: true }, 201);
      }
      return json({});
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(VueDiscussion));
  return rendu.conteneur;
}
const colonne = (c: ParentNode) => c.querySelector<HTMLElement>("aside.atl-disc-historique")!;
const titres = (c: ParentNode) => Array.from(colonne(c).querySelectorAll(".atl-disc-item-titre")).map((e) => e.textContent);
const courante = (c: ParentNode) => colonne(c).querySelector('[aria-current="true"] .atl-disc-item-titre')?.textContent;
const textes = (c: ParentNode) => Array.from(c.querySelectorAll(".atl-disc-texte")).map((e) => e.textContent);
const envoyer = async (c: ParentNode, texte: string) => {
  const champ = c.querySelector<HTMLTextAreaElement>('textarea[aria-label="Votre message au Coordinateur"]')!;
  await saisir(champ, texte);
  await act(async () => {
    champ.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("historique des discussions", () => {
  it("colonne nommée : bouton « Nouvelle discussion », discussions de la plus récente à la plus ancienne, l'ouverte marquée aria-current", async () => {
    const c = await ouvrir();
    expect(colonne(c).getAttribute("aria-label")).toBe("Historique des discussions");
    expect(parTexte(colonne(c), "button", "Nouvelle discussion")).toBeTruthy();
    expect(titres(c)).toEqual(["Plan de la campagne", "Où en sont les missions ?"]);
    expect(courante(c)).toBe("Plan de la campagne");
    expect(colonne(c).querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    expect(textes(c)).toEqual(["Plan", "Voici le plan"]);
  });

  it("réponse du Coordinateur mise en forme (Markdown de l'hôte, titres abaissés) ; message de l'humain en texte brut", async () => {
    fils[0]!.messages.push(message("agent", "# Bilan\n\n**Fait** : ATE-8"));
    const c = await ouvrir();
    const agents = Array.from(c.querySelectorAll('.atl-disc-bulle[data-auteur="agent"] [data-natif="MarkdownBlock"]')).map((e) => e.textContent);
    expect(agents).toEqual(["Voici le plan", "### Bilan\n\n**Fait** : ATE-8"]);
    expect(c.querySelector('.atl-disc-bulle[data-auteur="humain"] [data-natif="MarkdownBlock"]')).toBeNull();
    expect(textes(c)).toEqual(["Plan", "Voici le plan", "### Bilan\n\n**Fait** : ATE-8"]);
    // Le style de base de l'hôte retire puces et marges : la discussion les rend lisibles.
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-md ul \{ list-style: disc;/u);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-md ol \{ list-style: decimal;/u);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-md :is\(p, ul, ol[^)]*\) \{ margin: 0\.625rem 0; \}/u);
  });

  it("« Réessayer » relit la discussion affichée, même quand une autre est devenue la plus récente", async () => {
    cartesEnPanne = true;
    const c = await ouvrir();
    expect(courante(c)).toBe("Plan de la campagne");
    fils.find((f) => f.id === "iA")!.majLe = "2026-10-28T09:00:00.000Z";
    appels = [];
    await cliquer(parTexte(c, "button", "Réessayer"));
    const relue = appels.find((a) => a.methode === "GET" && a.url.includes("/discussion?"));
    expect(relue?.url).toContain("issueId=iB");
    expect(textes(c)).toEqual(["Plan", "Voici le plan"]);
    expect(courante(c)).toBe("Plan de la campagne");
  });

  it("un clic reprend une ancienne discussion : ses messages remplacent ceux de l'autre, l'identifiant accompagne la lecture", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(colonne(c), "button", /Où en sont les missions/));
    expect(appels.some((a) => a.methode === "GET" && a.url.includes("/discussion?") && a.url.includes("issueId=iA"))).toBe(true);
    expect(textes(c)).toEqual(["Missions", "Tout avance"]);
    expect(courante(c)).toBe("Où en sont les missions ?");
  });

  it("envoyer écrit dans la discussion ouverte (issueId joint), pas dans une autre", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(colonne(c), "button", /Où en sont les missions/));
    await envoyer(c, "Et les leads ?");
    const post = appels.find((a) => a.methode === "POST" && a.url.endsWith("/discussion/message"))!;
    expect(post.corps).toMatchObject({ texte: "Et les leads ?", issueId: "iA" });
    expect(fils.find((f) => f.id === "iA")!.messages).toHaveLength(3);
    expect(fils.find((f) => f.id === "iB")!.messages).toHaveLength(2);
  });

  it("« Nouvelle discussion » : fil vide, nouvelle entrée marquée, anciennes conservées", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(colonne(c), "button", "Nouvelle discussion"));
    expect(appels.some((a) => a.methode === "POST" && a.url.endsWith("/discussion/nouvelle") && a.corps?.["companyId"])).toBe(true);
    expect(textes(c)).toEqual([]);
    expect(c.querySelector(".atl-disc-vide")).toBeTruthy();
    expect(titres(c)).toEqual(["Nouvelle discussion", "Plan de la campagne", "Où en sont les missions ?"]);
    expect(courante(c)).toBe("Nouvelle discussion");
  });

  it("/clear tapé dans le champ part au serveur, qui répond par une nouvelle discussion : aucune bulle de l'humain, champ vidé", async () => {
    const c = await ouvrir();
    await envoyer(c, "/clear");
    expect(appels.find((a) => a.methode === "POST" && a.url.endsWith("/discussion/message"))!.corps).toMatchObject({ texte: "/clear", issueId: "iB" });
    expect(textes(c)).toEqual([]);
    expect(c.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("");
    expect(courante(c)).toBe("Nouvelle discussion");
    expect(titres(c)).toHaveLength(3);
  });

  it("repli en fenêtre étroite : le bouton « Discussions » ouvre et referme la colonne (aria-expanded), un choix la referme", async () => {
    const c = await ouvrir();
    const bascule = parTexte(c, "button", "Discussions");
    expect(bascule.getAttribute("aria-controls")).toBe(colonne(c).id);
    expect(bascule.getAttribute("aria-expanded")).toBe("false");
    expect(colonne(c).getAttribute("data-ouvert")).toBeNull();
    await cliquer(bascule);
    expect(bascule.getAttribute("aria-expanded")).toBe("true");
    expect(colonne(c).getAttribute("data-ouvert")).toBe("oui");
    await cliquer(parTexte(colonne(c), "button", /Où en sont les missions/));
    expect(colonne(c).getAttribute("data-ouvert")).toBeNull();
    expect(STYLES_HISTORIQUE).toMatch(/@media \(max-width: 767px\)[\s\S]*\.atl-disc-historique \{ display: none; \}/u);
    expect(STYLES_HISTORIQUE).toMatch(/\.atl-disc-bascule \{ display: none; \}/u);
  });

  it("historique illisible : message et « Réessayer », la discussion reste utilisable", async () => {
    panneListe = true;
    const c = await ouvrir();
    expect(colonne(c).textContent).toContain("Historique indisponible.");
    expect(textes(c)).toEqual(["Plan", "Voici le plan"]);
    panneListe = false;
    await cliquer(parTexte(colonne(c), "button", "Réessayer"));
    expect(titres(c)).toHaveLength(2);
  });
});

describe("suppression d'une discussion", () => {
  const corbeille = (c: ParentNode, titre: string) => colonne(c).querySelector<HTMLElement>(`button[aria-label="Supprimer la discussion ${titre}"]`)!;
  const suppressions = () => appels.filter((a) => a.methode === "POST" && a.url.endsWith("/discussion/supprimer"));

  it("chaque discussion a un bouton « Supprimer la discussion <titre> » ; la confirmation est en ligne (Oui / Annuler), jamais window.confirm, et Annuler n'écrit rien", async () => {
    const confirmer = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmer);
    const c = await ouvrir();
    expect(corbeille(c, "Plan de la campagne")).toBeTruthy();
    expect(corbeille(c, "Où en sont les missions ?")).toBeTruthy();
    await cliquer(corbeille(c, "Où en sont les missions ?"));
    expect(colonne(c).textContent).toContain("Supprimer ?");
    expect(parTexte(colonne(c), "button", "Oui")).toBeTruthy();
    await cliquer(parTexte(colonne(c), "button", "Annuler"));
    expect(colonne(c).textContent).not.toContain("Supprimer ?");
    expect(suppressions()).toHaveLength(0);
    expect(titres(c)).toEqual(["Plan de la campagne", "Où en sont les missions ?"]);
    expect(confirmer).not.toHaveBeenCalled();
  });

  it("« Oui » supprime la discussion choisie (companyId et issueId envoyés) : elle quitte la liste, la discussion ouverte reste affichée", async () => {
    const c = await ouvrir();
    await cliquer(corbeille(c, "Où en sont les missions ?"));
    await cliquer(parTexte(colonne(c), "button", "Oui"));
    expect(suppressions()).toHaveLength(1);
    expect(suppressions()[0]!.corps).toMatchObject({ issueId: "iA" });
    expect(suppressions()[0]!.corps?.["companyId"]).toBeTruthy();
    expect(titres(c)).toEqual(["Plan de la campagne"]);
    expect(courante(c)).toBe("Plan de la campagne");
    expect(textes(c)).toEqual(["Plan", "Voici le plan"]);
  });

  it("supprimer la discussion OUVERTE ouvre la plus récente restante", async () => {
    const c = await ouvrir();
    await cliquer(corbeille(c, "Plan de la campagne"));
    await cliquer(parTexte(colonne(c), "button", "Oui"));
    expect(titres(c)).toEqual(["Où en sont les missions ?"]);
    expect(courante(c)).toBe("Où en sont les missions ?");
    expect(textes(c)).toEqual(["Missions", "Tout avance"]);
  });

  it("supprimer la dernière discussion en ouvre une nouvelle, vide", async () => {
    fils = [fils[0]!];
    const c = await ouvrir();
    await cliquer(corbeille(c, "Plan de la campagne"));
    await cliquer(parTexte(colonne(c), "button", "Oui"));
    expect(appels.some((a) => a.methode === "POST" && a.url.endsWith("/discussion/nouvelle"))).toBe(true);
    expect(textes(c)).toEqual([]);
    expect(titres(c)).toEqual(["Nouvelle discussion"]);
  });
});
