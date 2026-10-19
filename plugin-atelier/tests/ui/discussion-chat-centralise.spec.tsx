// @vitest-environment jsdom
/**
 * Chat du Coordinateur général, lot B : message du Coordinateur en tête du fil (connexions manquantes, points en attente),
 * modèles de demande qui remplissent la saisie, réglages du chat gardés dans le navigateur.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Branchement } from "../../src/contrats/index.js";
import { CLE_REGLAGES_CHAT, lireReglagesChat, REGLAGES_PAR_DEFAUT, useLectureAuto } from "../../src/ui/composants/reglages-chat.js";
import { phraseConnexionsManquantes } from "../../src/ui/composants/chat-situation.js";
import { SERVICES_PASSERELLE } from "../../src/ui/connexions-natives.js";
import { trierParUrgence } from "../../src/ui/composants/chat-a-faire.js";
import { MODELES_DEMANDE } from "../../src/ui/demande.js";
import { IconeReglages } from "../../src/ui/composants/icones-discussion.js";
import { STYLES_DISCUSSION } from "../../src/ui/styles-discussion.js";
import { LIEN_PASSAGE_AU_REEL } from "../../src/ui/realite.js";
import { PASTILLES, VueDiscussion } from "../../src/ui/vues/discussion.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let elements: Array<Record<string, unknown>> = [];
let branchements: Branchement[] = [];
let realiteEnPanne = false;
let connexionsNatives: Array<Record<string, unknown>> = [];
const H = "2026-10-19T08:00:00.000Z";

const br = (cle: Branchement["cle"], nom: string, etat: Branchement["etat"]): Branchement => ({
  cle, nom, etat, preuve: "mesure", detail: "x", acteur: "nous", debloque: { criteres: [], fonctions: ["f"] }, leadsConcernes: null, verifieLe: H,
});
const element = (n: number, urgence: "haute" | "moyenne" | "basse") => ({
  id: `tache:${n}`, type: "tache_bloquee", urgence, titre: `Élément ${n}`, raison: "Raison.", lien: `/issues/ATL-${n}`, action: "Ouvrir la tâche", issueId: `i${n}`,
});
const connexion = (nom: string, slug: string, o: Record<string, unknown> = {}) => ({
  id: `c-${slug}`, name: nom, status: "active", enabled: true, healthStatus: "ok", healthCheckedAt: H, config: { sourceTemplateKey: slug }, ...o,
});
/** Toutes les connexions natives prouvées par un appel réel : plus rien ne manque côté interface. */
const toutConnecte = () => {
  connexionsNatives = SERVICES_PASSERELLE.map((s) => connexion(s.nom, s.slug, { lastUsedAt: H, config: { sourceTemplateKey: s.slug, oauth: { scopes: ["https://www.googleapis.com/auth/x"] } } }));
};
const pastille = (urgence: "haute" | "moyenne" | "basse", n: number) => element(n, urgence);

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
  elements = [];
  branchements = [];
  realiteEnPanne = false;
  connexionsNatives = [];
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const methode = init?.method ?? "GET";
      if (url.includes("/dictee/etat")) return new Response(JSON.stringify({ disponible: true }), { status: 200 });
      if (methode === "GET" && url.includes("/realite?")) {
        if (realiteEnPanne) return new Response("{}", { status: 500 });
        return new Response(JSON.stringify({ companyId: ENTREPRISE, branchements, synthese: [], leads: { analyses: 0, tronque: false, illisibles: 0 }, verifieLe: H }), { status: 200 });
      }
      if (url.endsWith("/tools/connections")) return new Response(JSON.stringify({ connections: connexionsNatives }), { status: 200 });
      if (methode === "GET" && url.includes("/accueil?")) return new Response(JSON.stringify({ companyId: ENTREPRISE, elements, missions: [] }), { status: 200 });
      if (methode === "GET" && url.includes("/discussion/messages")) return new Response(JSON.stringify({ messages: [], cartes: [] }), { status: 200 });
      return new Response(JSON.stringify({ issueId: "i1", identifiant: "DEM-1", messages: [], cartes: [] }), { status: 200 });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function ouvrir() {
  rendu = await rendre(createElement(VueDiscussion));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}
const saisie = (c: ParentNode) => c.querySelector<HTMLTextAreaElement>('textarea[aria-label="Votre message au Coordinateur"]')!;

describe("message de situation du Coordinateur : connexions manquantes", () => {
  const situation = (c: ParentNode) => c.querySelector<HTMLElement>('[data-testid="chat-situation"]');

  it("nomme les connexions qui manquent (texte exact) et mène à la section Connexions des paramètres", async () => {
    branchements = [br("bce", "Registre BCE", "en_attente_acces"), br("osm", "OpenStreetMap", "demonstration"), br("bnb", "Banque nationale", "reel")];
    const c = await ouvrir();
    const m = situation(c)!;
    // Les deux lignes lues par l'interface seulement (Google, diffusion) manquent aussi : aucune connexion native.
    const noms = m.querySelector('[data-testid="situation-connexions"] p')!.textContent!;
    expect(noms).toMatch(/^Avant de commencer : il me manque 4 connexions pour travailler sur vos vraies données \(Registre BCE, OpenStreetMap, Comptes Google \(Ads, Search Console, GA4, fiche d'établissement\) et 1 autre\)\. Tant qu'elles ne sont pas faites, je travaille en démonstration\.$/u);
    const lien = parTexte(m, "a", "Ouvrir les connexions");
    expect(lien.getAttribute("href")).toBe(`/RNO${LIEN_PASSAGE_AU_REEL}`);
    expect(LIEN_PASSAGE_AU_REEL).toMatch(/#param-reel$/u);
    expect(m.querySelector('[data-testid="situation-points"]')).toBeNull();
  });

  it("rendu d'une bulle du Coordinateur : en tête du fil, dans la zone annoncée, avatar et nom, hors du pied, rien d'envoyé au serveur", async () => {
    branchements = [br("bce", "Registre BCE", "demonstration")];
    const c = await ouvrir();
    const m = situation(c)!;
    const journal = c.querySelector('[role="log"]')!;
    expect(journal.getAttribute("aria-live")).toBe("polite");
    expect(journal.firstElementChild).toBe(m);
    expect(m.classList.contains("atl-disc-bulle")).toBe(true);
    expect(m.getAttribute("data-auteur")).toBe("agent");
    expect(m.querySelector(".atl-disc-meta .atl-disc-avatar")).not.toBeNull();
    expect(m.querySelector(".atl-disc-meta .atl-disc-nom")!.textContent).toBe("Coordinateur");
    expect(c.querySelector(".atl-disc-pied")!.contains(m)).toBe(false);
    expect(c.querySelector('section[aria-label="À faire"]')).toBeNull();
    expect(c.querySelector('[data-testid="bandeau-connexions"]')).toBeNull();
    const envois = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((a) => (a[1] as { method?: string } | undefined)?.method === "POST");
    expect(envois).toHaveLength(0);
    expect(c.textContent).not.toContain("—");
    // L'accueil normal du chat reste là, sous le message.
    expect(c.querySelector(".atl-disc-vide")).not.toBeNull();
  });

  it("absent quand tout est connecté (aucune mention « tout est en ordre »)", async () => {
    branchements = [br("bce", "Registre BCE", "reel"), br("osm", "OpenStreetMap", "reel")];
    toutConnecte();
    const c = await ouvrir();
    expect(situation(c)).toBeNull();
    expect(c.querySelector('[role="log"]')!.firstElementChild).toBe(c.querySelector(".atl-disc-vide"));
    expect(c.textContent).not.toMatch(/en ordre/iu);
  });

  it("absent pendant le chargement et quand la lecture des connexions échoue", async () => {
    realiteEnPanne = true;
    const c = await ouvrir();
    expect(situation(c)).toBeNull();
    rendu!.demonter();
    realiteEnPanne = false;
    branchements = [br("bce", "Registre BCE", "demonstration")];
    // Lecture jamais terminée : rien tant qu'elle n'a pas répondu.
    let liberer: () => void = () => {};
    const attente = new Promise<void>((r) => (liberer = r));
    const base = fetch as unknown as (u: string, i?: unknown) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (u: string, i?: unknown) => (u.includes("/realite?") ? (await attente, base(u, i)) : base(u, i))));
    rendu = await rendre(createElement(VueDiscussion));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(situation(rendu.conteneur)).toBeNull();
    await act(async () => {
      liberer();
      await new Promise((r) => setTimeout(r, 0));
    });
    await vi.waitFor(() => expect(situation(rendu!.conteneur)).not.toBeNull());
  });

  it("singulier : une seule connexion", () => {
    expect(phraseConnexionsManquantes(["A"])).toBe("Avant de commencer : il me manque 1 connexion pour travailler sur vos vraies données (A). Tant qu'elle n'est pas faite, je travaille en démonstration.");
    expect(phraseConnexionsManquantes(["A", "B"])).toContain("(A et B)");
    expect(phraseConnexionsManquantes(["A", "B", "C"])).toContain("(A, B et C)");
    expect(phraseConnexionsManquantes(["A", "B", "C", "D", "E"])).toContain("(A, B, C et 2 autres)");
    expect(phraseConnexionsManquantes(["Registre BCE", "Banque nationale", "OpenStreetMap", "d", "e", "f", "g", "h", "i", "j", "k"])).toBe(
      "Avant de commencer : il me manque 11 connexions pour travailler sur vos vraies données (Registre BCE, Banque nationale, OpenStreetMap et 8 autres). Tant qu'elles ne sont pas faites, je travaille en démonstration.",
    );
  });

  it("l'ancien bandeau, la carte épinglée et la pastille d'en-tête n'existent plus", async () => {
    branchements = [br("bce", "Registre BCE", "demonstration")];
    elements = [pastille("haute", 1)];
    const c = await ouvrir();
    expect(c.querySelector('[data-testid="bandeau-connexions"]')).toBeNull();
    expect(c.querySelector(".atl-disc-bandeau")).toBeNull();
    expect(c.querySelector('section[aria-label="À faire"]')).toBeNull();
    expect(c.querySelector(".atl-disc-afaire")).toBeNull();
    expect(c.querySelector('[data-testid="chat-pastille-afaire"]')).toBeNull();
    expect(STYLES_DISCUSSION).not.toMatch(/atl-disc-bandeau|atl-disc-afaire|atl-disc-pastille-afaire|atl-disc-pastille-nb/u);
  });
});

describe("message de situation du Coordinateur : points en attente", () => {
  const situation = (c: ParentNode) => c.querySelector<HTMLElement>('[data-testid="chat-situation"]');
  const points = (c: ParentNode) => c.querySelector<HTMLElement>('[data-testid="situation-points"]');
  const titres = (c: ParentNode) => Array.from(c.querySelectorAll(".atl-afaire-titre")).map((t) => t.textContent);

  it("absent quand rien n'attend la personne", async () => {
    const c = await ouvrir();
    // Connexions natives absentes : seul le message de connexions peut exister, jamais le bloc des points.
    expect(points(c)).toBeNull();
  });

  it("trois points : annonce, triés par urgence, chaque ligne garde son action, aucun bouton « Voir les autres »", async () => {
    toutConnecte();
    elements = [pastille("basse", 1), pastille("haute", 2), pastille("moyenne", 3)];
    const c = await ouvrir();
    const m = situation(c)!;
    expect(points(c)!.querySelector("p")!.textContent).toBe("J'ai 3 points qui attendent votre décision :");
    expect(titres(m)).toEqual(["Élément 2", "Élément 3", "Élément 1"]);
    expect(Array.from(m.querySelectorAll(".atl-afaire a")).map((a) => a.getAttribute("href"))).toEqual(["/RNO/issues/ATL-2", "/RNO/issues/ATL-3", "/RNO/issues/ATL-1"]);
    expect(Array.from(m.querySelectorAll("button")).some((b) => /Voir/u.test(b.textContent ?? ""))).toBe(false);
    // En tête du fil, dans la zone annoncée, jamais dans le pied.
    expect(c.querySelector('[role="log"]')!.firstElementChild).toBe(m);
    const pied = c.querySelector(".atl-disc-pied")!;
    expect(pied.contains(m)).toBe(false);
    expect(Array.from(pied.children).map((e) => e.className.split(" ")[0])).toEqual(["atl-disc-saisie"]);
  });

  it("deux points avec des connexions manquantes : « J'ai aussi 2 points… » après le paragraphe des connexions", async () => {
    branchements = [br("bce", "Registre BCE", "demonstration")];
    elements = [pastille("moyenne", 1), pastille("haute", 2)];
    const c = await ouvrir();
    const m = situation(c)!;
    expect(points(c)!.querySelector("p")!.textContent).toBe("J'ai aussi 2 points qui attendent votre décision :");
    const blocs = Array.from(m.querySelectorAll('[data-testid^="situation-"]')).map((b) => b.getAttribute("data-testid"));
    expect(blocs).toEqual(["situation-connexions", "situation-points"]);
  });

  it("un seul point : singulier", async () => {
    toutConnecte();
    elements = [pastille("haute", 1)];
    const c = await ouvrir();
    expect(points(c)!.querySelector("p")!.textContent).toBe("J'ai 1 point qui attend votre décision :");
  });

  it("au-delà de trois : les trois plus urgents, puis « Voir les N autres » qui déplie et « Voir moins » qui replie", async () => {
    toutConnecte();
    elements = [pastille("basse", 1), pastille("moyenne", 2), pastille("haute", 3), pastille("moyenne", 4), pastille("haute", 5)];
    const c = await ouvrir();
    const m = situation(c)!;
    expect(points(c)!.querySelector("p")!.textContent).toBe("J'ai 5 points qui attendent votre décision :");
    expect(titres(m)).toEqual(["Élément 3", "Élément 5", "Élément 2"]);
    const voir = parTexte(m, "button", "Voir les 2 autres");
    expect(voir.getAttribute("aria-expanded")).toBe("false");
    await cliquer(voir);
    expect(voir.getAttribute("aria-expanded")).toBe("true");
    expect(voir.textContent).toBe("Voir moins");
    expect(titres(m)).toEqual(["Élément 3", "Élément 5", "Élément 2", "Élément 4", "Élément 1"]);
    await cliquer(voir);
    expect(titres(m)).toEqual(["Élément 3", "Élément 5", "Élément 2"]);
  });

  it("quatre points : « Voir l'autre point » (singulier)", async () => {
    toutConnecte();
    elements = [1, 2, 3, 4].map((n) => pastille("moyenne", n));
    const c = await ouvrir();
    expect(parTexte(situation(c)!, "button", "Voir l'autre point")).toBeTruthy();
  });

  it("connexions : l'élément « Aucune connexion à vos outils » ne répète pas le paragraphe des connexions ; sans lui (lecture en échec) il reste", async () => {
    elements = [{ id: "manque:passerelle", type: "information_manquante", urgence: "basse", titre: "Aucune connexion à vos outils", raison: "x", lien: "/RNO/atelier/parametres", action: "Brancher" }, pastille("haute", 2)];
    branchements = [br("bce", "Registre BCE", "demonstration")];
    const c = await ouvrir();
    expect(c.querySelector('[data-testid="situation-connexions"]')).not.toBeNull();
    expect(points(c)!.querySelector("p")!.textContent).toBe("J'ai aussi 1 point qui attend votre décision :");
    expect(titres(c)).toEqual(["Élément 2"]);
    rendu!.demonter();
    realiteEnPanne = true;
    const c2 = await ouvrir();
    expect(c2.querySelector('[data-testid="situation-connexions"]')).toBeNull();
    expect(points(c2)!.querySelector("p")!.textContent).toBe("J'ai 2 points qui attendent votre décision :");
  });

  it("tri stable par urgence", () => {
    const tries = trierParUrgence([pastille("basse", 1), pastille("moyenne", 2), pastille("haute", 3), pastille("haute", 4)] as never);
    expect(tries.map((e) => e.id)).toEqual(["tache:3", "tache:4", "tache:2", "tache:1"]);
  });
});

describe("pastilles du fil vide : toutes remplissent la saisie, aucune n'envoie", () => {
  it("quatre pastilles, dans l'ordre ; un clic place le texte dans la saisie sans l'envoyer", async () => {
    const c = await ouvrir();
    const groupe = c.querySelector('[role="group"][aria-label="Pour commencer"]')!;
    expect(Array.from(groupe.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Prospection d'une zone", "Campagne Google Ads", "Veille concurrentielle hebdomadaire", "Où en sont les missions ?"]);
    expect(PASTILLES).toHaveLength(4);
    expect(MODELES_DEMANDE.some((m) => m.libelle === "Prospection d'une zone")).toBe(true);
    await cliquer(parTexte(groupe as HTMLElement, "button", "Prospection d'une zone"));
    expect(saisie(c).value).toBe(MODELES_DEMANDE.find((m) => m.libelle === "Prospection d'une zone")!.texte);
    const envois = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((a) => (a[1] as { method?: string } | undefined)?.method === "POST");
    expect(envois).toHaveLength(0);
  });

  it("le focus passe dans la saisie, curseur en fin de texte ; un second modèle remplace le premier ; aucun envoi, aucun tiret cadratin", async () => {
    const c = await ouvrir();
    const groupe = c.querySelector('[role="group"][aria-label="Pour commencer"]') as HTMLElement;
    for (const libelle of ["Veille concurrentielle hebdomadaire", "Campagne Google Ads", "Prospection d'une zone"]) expect(parTexte(groupe, "button", libelle)).toBeTruthy();
    const champ = saisie(c);
    await cliquer(parTexte(groupe, "button", "Campagne Google Ads"));
    expect(champ.value).toBe("Prépare une campagne Google Ads pour <produit> : mots-clés, annonces, négatifs, budget conseillé et plan de mesure. Pose-moi tes questions avant de proposer le plan.");
    await vi.waitFor(() => expect(document.activeElement).toBe(champ));
    expect(champ.selectionStart).toBe(champ.value.length);
    expect(champ.selectionEnd).toBe(champ.value.length);
    await cliquer(parTexte(groupe, "button", "Veille concurrentielle hebdomadaire"));
    expect(champ.value).toContain("chaque lundi à 8 h");
    expect(champ.value).not.toContain("Google Ads");
    const envois = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((a) => (a[1] as { method?: string } | undefined)?.method === "POST");
    expect(envois).toHaveLength(0);
    expect(c.textContent).not.toContain("—");
  });

  it("« Où en sont les missions ? » remplit aussi la saisie : aucun envoi au clic, quelle que soit la pastille", async () => {
    const c = await ouvrir();
    const groupe = c.querySelector('[role="group"][aria-label="Pour commencer"]') as HTMLElement;
    for (const p of PASTILLES) {
      await cliquer(parTexte(groupe, "button", p.libelle));
      expect(saisie(c).value).toBe(p.texte);
    }
    expect(saisie(c).value).toBe("Où en sont les missions ?");
    const envois = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((a) => (a[1] as { method?: string } | undefined)?.method === "POST");
    expect(envois).toHaveLength(0);
  });

  it("bureau : les pastilles passent à la ligne si la place manque ; téléphone : une seule rangée qui défile, avec une ombre de défilement", () => {
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-pastilles \{[^}]*flex-wrap: wrap/u);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-pastilles\.atl-disc-colonne \{ width: min\(100%, 56rem\); \}/u);
    const telephone = STYLES_DISCUSSION.slice(STYLES_DISCUSSION.indexOf("@media (max-width: 640px)"), STYLES_DISCUSSION.indexOf("@media (max-width: 767px)"));
    expect(telephone).toMatch(/\.atl-disc-pastilles \{ flex-wrap: nowrap;[^}]*overflow-x: auto;/u);
    expect(telephone).toMatch(/no-repeat local/u);
    expect(telephone).toMatch(/no-repeat scroll/u);
    expect(telephone).toMatch(/\.atl-disc-suggestion \{ flex: none; white-space: nowrap;/u);
    expect(STYLES_DISCUSSION).not.toContain("atl-disc-modeles");
    expect(STYLES_DISCUSSION).not.toContain("atl-disc-suggestions");
  });
});

describe("en-tête du chat", () => {
  it("une seule ligne : nom et sous-titre à gauche, actions à droite ; l'identifiant du fil est dans les réglages, avec son lien", async () => {
    elements = [pastille("haute", 1)];
    const c = await ouvrir();
    const entete = c.querySelector(".atl-disc-entete")!;
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-entete \{[^}]*flex-wrap: nowrap/u);
    expect(Array.from(entete.children).map((e) => e.className)).toEqual(["atl-disc-avatar atl-disc-avatar-grand", "atl-disc-entete-texte", "atl-disc-entete-actions"]);
    const actions = entete.querySelector(".atl-disc-entete-actions")!;
    expect(Array.from(actions.querySelectorAll(":scope > button, :scope > .atl-disc-reglages > button")).map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Gérer les agents", "Réglages du chat"]);
    expect(entete.textContent).not.toContain("DEM-1");
    expect(entete.querySelector(".atl-disc-ident")).toBeNull();
    await cliquer(c.querySelector('button[aria-label="Réglages du chat"]')!);
    const fil = c.querySelector<HTMLElement>(".atl-disc-reglages-fil")!;
    expect(fil.textContent).toBe("Fil de discussion : DEM-1");
    expect(fil.querySelector("a")!.getAttribute("href")).toBe("/RNO/issues/DEM-1");
    // Cibles tactiles du panneau : les cases elles-mêmes mesurent 2,75 rem.
    expect(Array.from(c.querySelectorAll('.atl-disc-reglages-ligne input[type="checkbox"]')).every((i) => i.classList.contains("atl-case-tactile"))).toBe(true);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-case-tactile \{[^}]*width: 2\.75rem; height: 2\.75rem/u);
  });

  it("une seule ligne à tous les formats : conteneur d'actions flex sans retour à la ligne (le bloc des réglages ne tombe plus en dessous), sous-titre masqué sur téléphone", () => {
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-entete \.atl-disc-entete-actions \{ display: flex; flex-wrap: nowrap; flex-direction: row;/u);
    // 55 px : boutons de 2,75 rem (44 px) + 0,625 rem de marge basse (10 px) + 1 px de trait, moins de 64 px.
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-entete \{ display: flex; flex-wrap: nowrap; align-items: center; gap: 0\.625rem; padding: 0 0 0\.625rem;/u);
    const telephone = STYLES_DISCUSSION.slice(STYLES_DISCUSSION.indexOf("@media (max-width: 640px)"), STYLES_DISCUSSION.indexOf("@media (max-width: 767px)"));
    expect(telephone).toMatch(/\.atl-disc-entete \.atl-attenue \{ display: none; \}/u);
    expect(telephone).toMatch(/\.atl-disc-entete > \.atl-disc-avatar \{ display: none; \}/u);
  });

  it("l'engrenage a des dents : huit dents tracées autour d'un moyeu, plus de rayons de soleil", async () => {
    rendu = await rendre(createElement(IconeReglages));
    const chemin = rendu.conteneur.querySelector("path")!.getAttribute("d")!;
    expect(chemin.startsWith("M")).toBe(true);
    expect(chemin.endsWith("Z")).toBe(true);
    expect(chemin.match(/L/g)).toHaveLength(8 * 4 - 1);
    expect(rendu.conteneur.querySelector("circle")!.getAttribute("r")).toBe("3");
  });
});

describe("hauteur du chat", () => {
  it("la section tient dans la fenêtre (hôte compté) ; seul le fil défile ; le pied ne dépasse pas 35 % de la hauteur", () => {
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc \{[^}]*--atl-hote-haut: 11\.5rem; display: flex; flex-direction: column; height: calc\(100dvh - var\(--atl-hote-haut\)\)/u);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-page:has\(> \.atl-disc\) \{ padding-bottom: 0; \}/u);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-fil \{[^}]*flex: 1 1 auto; min-height: 0; overflow-y: auto/u);
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-pied \{[^}]*max-height: 35dvh; overflow-y: auto/u);
    // Plus de bloc qui grandit dans le pied : le message de situation défile avec le fil.
    expect(STYLES_DISCUSSION).not.toMatch(/\.atl-disc-situation \{[^}]*max-height/u);
  });
});

describe("réglages du chat", () => {
  it("valeurs par défaut : comportement d'avant (pas de lecture à voix haute, dictée proposée)", async () => {
    expect(lireReglagesChat()).toEqual(REGLAGES_PAR_DEFAUT);
    expect(REGLAGES_PAR_DEFAUT).toEqual({ lectureAuto: false, voix: "", dictee: true });
    const c = await ouvrir();
    expect(c.querySelector('[data-emplacement="dicter"]')).not.toBeNull();
  });

  it("le bouton à engrenage ouvre le panneau, dans le conteneur d'actions de l'en-tête", async () => {
    const c = await ouvrir();
    const entete = c.querySelector(".atl-disc-entete")!;
    const bouton = entete.querySelector<HTMLButtonElement>('.atl-disc-entete-actions button[aria-label="Réglages du chat"]')!;
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    await cliquer(bouton);
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    expect(entete.querySelector('[role="group"][aria-label="Réglages du chat"]')).not.toBeNull();
  });

  it("désactiver la dictée retire le bouton et se garde dans le navigateur", async () => {
    const c = await ouvrir();
    await cliquer(c.querySelector('button[aria-label="Réglages du chat"]')!);
    const case_ = parTexte(c, "label", "Dictée vocale").querySelector("input")!;
    expect(case_.checked).toBe(true);
    await cliquer(case_);
    expect(c.querySelector('[data-emplacement="dicter"]')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(CLE_REGLAGES_CHAT)!)).toMatchObject({ dictee: false });
    // Un nouvel affichage relit la préférence.
    rendu!.demonter();
    const c2 = await ouvrir();
    expect(c2.querySelector('[data-emplacement="dicter"]')).toBeNull();
  });

  it("lecture vocale : indisponible sans synthèse, sinon enregistrée ; stockage illisible = valeurs par défaut", async () => {
    const c = await ouvrir();
    await cliquer(c.querySelector('button[aria-label="Réglages du chat"]')!);
    expect(c.textContent).toContain("Ce navigateur ne propose pas la lecture vocale.");
    window.localStorage.setItem(CLE_REGLAGES_CHAT, "{pas du json");
    expect(lireReglagesChat()).toEqual(REGLAGES_PAR_DEFAUT);
    window.localStorage.setItem(CLE_REGLAGES_CHAT, JSON.stringify({ lectureAuto: "oui", voix: 3, dictee: false }));
    expect(lireReglagesChat()).toEqual({ lectureAuto: false, voix: "", dictee: false });
  });

  it("avec une synthèse vocale : la case est active et la préférence est gardée", async () => {
    vi.stubGlobal("speechSynthesis", { getVoices: () => [{ voiceURI: "fr1", name: "Amélie", lang: "fr-FR" }, { voiceURI: "en1", name: "Alex", lang: "en-US" }], cancel() {}, speak() {}, addEventListener() {}, removeEventListener() {} });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: (globalThis as never as { speechSynthesis: unknown }).speechSynthesis });
    try {
      const c = await ouvrir();
      await cliquer(c.querySelector('button[aria-label="Réglages du chat"]')!);
      const lecture = parTexte(c, "label", "Lire les réponses à voix haute").querySelector("input")!;
      expect(lecture.disabled).toBe(false);
      await cliquer(lecture);
      expect(JSON.parse(window.localStorage.getItem(CLE_REGLAGES_CHAT)!)).toMatchObject({ lectureAuto: true });
      const options = Array.from(c.querySelectorAll("select option")).map((o) => o.textContent);
      expect(options).toEqual(["Voix par défaut", "Amélie (fr-FR)", "Alex (en-US)"]);
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });
});

describe("lecture vocale automatique", () => {
  type M = { id: string; auteur: "humain" | "agent"; texte: string };
  function Sonde({ messages, actif, pret }: { messages: M[]; actif: boolean; pret: boolean }) {
    useLectureAuto(messages, actif, "", pret);
    return null;
  }
  it("lit seulement les NOUVELLES réponses du Coordinateur, jamais celles déjà affichées ni celles de l'humain", async () => {
    const dites: string[] = [];
    const synthese = { getVoices: () => [], cancel() {}, speak: (u: { text: string }) => dites.push(u.text), addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthese });
    vi.stubGlobal("SpeechSynthesisUtterance", class { text: string; lang = ""; voice = null; constructor(t: string) { this.text = t; } });
    try {
      const ancien: M = { id: "a", auteur: "agent", texte: "Ancienne réponse" };
      rendu = await rendre(createElement(Sonde, { messages: [], actif: true, pret: false }));
      await act(async () => rendu!.racine.render(createElement(Sonde, { messages: [ancien], actif: true, pret: true })));
      expect(dites).toEqual([]);
      await act(async () => rendu!.racine.render(createElement(Sonde, { messages: [ancien, { id: "h", auteur: "humain", texte: "Bonjour" }, { id: "b", auteur: "agent", texte: "Nouvelle réponse" }], actif: true, pret: true })));
      expect(dites).toEqual(["Nouvelle réponse"]);
      await act(async () => rendu!.racine.render(createElement(Sonde, { messages: [ancien, { id: "c", auteur: "agent", texte: "Muette" }], actif: false, pret: true })));
      expect(dites).toEqual(["Nouvelle réponse"]);
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });
});
