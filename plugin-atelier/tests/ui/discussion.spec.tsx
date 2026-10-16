// @vitest-environment jsdom
/**
 * Discussion avec le Coordinateur : affichage, envoi par Entrée, Maj+Entrée, suggestions, indicateur,
 * interrogation périodique (horloge simulée) et pause quand l'onglet est caché.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STYLES_DISCUSSION } from "../../src/ui/styles-discussion.js";
import { INTERVALLE_MS, VueDiscussion } from "../../src/ui/vues/discussion.js";
import { cliquer, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let messages: Array<Record<string, unknown>> = [];
let compteur = 0;
let dicteeDisponible = true;

const msg = (o: Record<string, unknown>) => ({ id: `m${++compteur}`, auteur: "agent", nom: "Coordinateur", texte: "Bonjour", date: new Date(Date.UTC(2026, 9, 16, 10, 0, compteur)).toISOString(), ...o });

function visibilite(etat: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => etat });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
  appels = [];
  messages = [];
  compteur = 0;
  dicteeDisponible = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      const corps = init?.body ? JSON.parse(init.body) : null;
      appels.push({ methode, url, corps });
      if (url.includes("/dictee/etat")) return new Response(JSON.stringify({ disponible: dicteeDisponible }), { status: 200 });
      if (url.includes("/dictee/transcrire")) return new Response(JSON.stringify({ texte: "résume les leads", dureeMs: 900 }), { status: 200 });
      if (methode === "GET" && url.includes("/discussion/messages")) {
        const depuis = new URL(url, "http://x").searchParams.get("depuis");
        return new Response(JSON.stringify({ messages: messages.filter((m) => !depuis || (m.date as string) > depuis) }), { status: 200 });
      }
      if (methode === "GET") return new Response(JSON.stringify({ issueId: "i1", identifiant: "DEM-1", messages }), { status: 200 });
      const m = msg({ auteur: "humain", nom: "Vous", texte: (corps as { texte: string }).texte });
      messages.push(m);
      return new Response(JSON.stringify({ ...m, reveilDemande: true }), { status: 201 });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const champParLibelle = (c: ParentNode, libelle: string) => {
  const champ = c.querySelector(`textarea[aria-label="${libelle}"]`);
  if (!champ) throw new Error(`Champ introuvable : ${libelle}`);
  return champ as HTMLTextAreaElement;
};

async function ouvrir() {
  rendu = await rendre(createElement(VueDiscussion));
  return rendu.conteneur;
}
const posts = () => appels.filter((a) => a.methode === "POST");
const touche = async (champ: Element, o: { key: string; shiftKey?: boolean }) => {
  await act(async () => {
    champ.dispatchEvent(new KeyboardEvent("keydown", { ...o, bubbles: true, cancelable: true }));
  });
};

describe("discussion : affichage", () => {
  it("fil vide : suggestions, deux emplacements nommés, zone de saisie libellée, fil accessible", async () => {
    const c = await ouvrir();
    const fil = c.querySelector('[role="log"]')!;
    expect(fil.getAttribute("aria-live")).toBe("polite");
    for (const s of ["Où en sont les missions ?", "Qu'est-ce qui est bloqué ?", "Résume les nouveaux leads", "Lance une prospection sur une zone"]) expect(parTexte(c, "button", s)).toBeTruthy();
    expect(c.querySelector('[data-emplacement="dicter"]')).toBeTruthy();
    expect(c.querySelector('[data-emplacement="parler-en-direct"]')).toBeTruthy();
    expect(champParLibelle(c, "Votre message au Coordinateur").tagName).toBe("TEXTAREA");
  });

  it("bulles : humain et Coordinateur, nom et date, identifiants de tâche cliquables, jamais de HTML", async () => {
    messages = [msg({ auteur: "humain", nom: "Vous", texte: "Et ATL-12 ?" }), msg({ texte: "Voir ATL-12 <img src=x onerror=alert(1)>" })];
    const c = await ouvrir();
    const bulles = c.querySelectorAll(".atl-disc-bulle");
    expect(Array.from(bulles).map((b) => b.getAttribute("data-auteur"))).toEqual(["humain", "agent"]);
    expect(bulles[1]!.textContent).toContain("Coordinateur");
    expect(bulles[1]!.querySelector("time")).toBeTruthy();
    expect(c.querySelector("img")).toBeNull();
    expect(bulles[1]!.textContent).toContain("<img src=x onerror=alert(1)>");
    const lien = bulles[1]!.querySelector("a")!;
    expect(lien.textContent).toBe("ATL-12");
    expect(lien.getAttribute("href")).toBe("/RNO/issues/ATL-12");
    expect(c.querySelector(".atl-disc-vide")).toBeNull();
  });
});

describe("discussion : envoi", () => {
  it("Entrée envoie, vide le champ et affiche l'indicateur ; Maj+Entrée n'envoie pas", async () => {
    const c = await ouvrir();
    const champ = champParLibelle(c, "Votre message au Coordinateur") as HTMLTextAreaElement;
    await saisir(champ, "Bonjour");
    await touche(champ, { key: "Enter", shiftKey: true });
    expect(posts()).toHaveLength(0);
    await touche(champ, { key: "Enter" });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.url).toContain("/discussion/message");
    expect(posts()[0]!.corps).toMatchObject({ texte: "Bonjour" });
    expect(champ.value).toBe("");
    expect(c.textContent).toContain("Le Coordinateur réfléchit…");
    expect(c.querySelectorAll(".atl-disc-bulle")).toHaveLength(1);
  });

  it("le bouton Envoyer est inactif sans texte et envoie sinon", async () => {
    const c = await ouvrir();
    const bouton = parTexte(c, "button", "Envoyer");
    await cliquer(bouton);
    expect(posts()).toHaveLength(0);
    await saisir(champParLibelle(c, "Votre message au Coordinateur"), "Salut");
    await cliquer(parTexte(c, "button", "Envoyer"));
    expect(posts()).toHaveLength(1);
  });

  it("une suggestion envoie son texte", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Résume les nouveaux leads"));
    expect(posts()[0]!.corps).toMatchObject({ texte: "Résume les nouveaux leads" });
    expect(c.querySelector(".atl-disc-suggestions")).toBeNull();
  });

  it("erreur d'envoi : message d'alerte et texte conservé", async () => {
    const c = await ouvrir();
    const champ = champParLibelle(c, "Votre message au Coordinateur") as HTMLTextAreaElement;
    await saisir(champ, "Bonjour");
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => new Response(JSON.stringify({ message: "Le Coordinateur est absent." }), { status: 404 }));
    await cliquer(parTexte(c, "button", "Envoyer"));
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Le Coordinateur est absent.");
    expect(champ.value).toBe("Bonjour");
  });
});

describe("discussion : interrogation périodique", () => {
  it("toutes les 4 s, avec `depuis`, et l'indicateur disparaît à la réponse", async () => {
    vi.useFakeTimers();
    const c = await ouvrir();
    const champ = champParLibelle(c, "Votre message au Coordinateur") as HTMLTextAreaElement;
    await saisir(champ, "Bonjour");
    await touche(champ, { key: "Enter" });
    expect(c.textContent).toContain("réfléchit");
    messages.push(msg({ texte: "Voici l'état." }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_MS);
    });
    const interrogations = appels.filter((a) => a.url.includes("/discussion/messages"));
    expect(interrogations).toHaveLength(1);
    expect(interrogations[0]!.url).toContain("depuis=");
    expect(c.textContent).toContain("Voici l'état.");
    expect(c.textContent).not.toContain("réfléchit");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 2);
    });
    expect(appels.filter((a) => a.url.includes("/discussion/messages"))).toHaveLength(3);
    expect(c.querySelectorAll(".atl-disc-bulle")).toHaveLength(2);
  });

  it("en pause quand l'onglet est caché, reprise immédiate au retour", async () => {
    vi.useFakeTimers();
    await ouvrir();
    await act(async () => {
      visibilite("hidden");
      await vi.advanceTimersByTimeAsync(INTERVALLE_MS * 5);
    });
    expect(appels.filter((a) => a.url.includes("/discussion/messages"))).toHaveLength(0);
    await act(async () => {
      visibilite("visible");
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(appels.filter((a) => a.url.includes("/discussion/messages"))).toHaveLength(1);
  });
});

describe("discussion : dictée", () => {
  function simulerMicro() {
    class FauxEnregistreur {
      static isTypeSupported = () => true;
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FauxEnregistreur);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  }

  it("grisé quand le serveur de dictée n'est pas disponible", async () => {
    dicteeDisponible = false;
    const c = await ouvrir();
    expect((parTexte(c, "button", "Dicter") as HTMLButtonElement).disabled).toBe(true);
  });

  it("place le texte transcrit dans le champ, modifiable, sans rien envoyer", async () => {
    simulerMicro();
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Dicter"));
    await cliquer(parTexte(c, "button", "Arrêter la dictée"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(appels.some((a) => a.url.includes("/dictee/transcrire"))).toBe(true);
    expect(champParLibelle(c, "Votre message au Coordinateur").value).toBe("résume les leads");
    expect(posts().filter((p) => p.url.includes("/discussion/message"))).toHaveLength(0);
  });
});

describe("styles de la discussion sur mobile", () => {
  it("réserve la hauteur de la barre de navigation fixe de l'hôte sous la zone de saisie", () => {
    const mobile = STYLES_DISCUSSION.slice(STYLES_DISCUSSION.indexOf("@media (max-width: 768px)"));
    expect(mobile).toContain("--atl-nav-hote-mobile: calc(4rem + env(safe-area-inset-bottom, 0px))");
    expect(mobile).toMatch(/\.atl-disc-saisie \{[^}]*bottom: var\(--atl-nav-hote-mobile\)/u);
  });
});
