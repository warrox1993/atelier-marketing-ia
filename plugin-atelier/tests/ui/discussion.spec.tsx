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
let cartes: Array<Record<string, unknown>> = [];
let elementsAccueil: Array<Record<string, unknown>> = [];

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
  cartes = [];
  elementsAccueil = [];
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      const corps = init?.body ? JSON.parse(init.body) : null;
      appels.push({ methode, url, corps });
      if (url.includes("/dictee/etat")) return new Response(JSON.stringify({ disponible: dicteeDisponible }), { status: 200 });
      if (url.includes("/dictee/transcrire")) return new Response(JSON.stringify({ texte: "résume les leads", dureeMs: 900 }), { status: 200 });
      if (url.startsWith("/api/issues/") && url.includes("/interactions/")) {
        cartes = [];
        return new Response("{}", { status: 200 });
      }
      if (methode === "GET" && url.includes("/accueil?")) return new Response(JSON.stringify({ companyId: "c", elements: elementsAccueil, missions: [] }), { status: 200 });
      if (methode === "GET" && url.includes("/discussion/messages")) {
        const depuis = new URL(url, "http://x").searchParams.get("depuis");
        return new Response(JSON.stringify({ messages: messages.filter((m) => !depuis || (m.date as string) > depuis), cartes }), { status: 200 });
      }
      if (methode === "GET") return new Response(JSON.stringify({ issueId: "i1", identifiant: "DEM-1", messages, cartes }), { status: 200 });
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

const QUESTIONS = {
  id: "question:k1", type: "information_manquante", urgence: "haute", enTete: true, titre: "Quelle zone ?", raison: "Il manque une information.", lien: "/issues/ATL-5", action: "Répondre", issueId: "iss-5",
  interaction: {
    id: "k1", kind: "ask_user_questions", invite: null, details: null, libelleAccepter: null, libelleRefuser: null,
    questions: [
      { id: "q1", invite: "Quelle zone viser ?", aide: null, choix: "single", obligatoire: true, autre: false, options: [{ id: "o1", libelle: "Liège", description: null, texteLibre: false }, { id: "o2", libelle: "Namur", description: null, texteLibre: false }] },
      { id: "q2", invite: "Quel secteur ?", aide: null, choix: "single", obligatoire: false, autre: false, options: [{ id: "o3", libelle: "Toiture", description: null, texteLibre: false }] },
      { id: "q3", invite: "Quel budget ?", aide: null, choix: "single", obligatoire: false, autre: false, options: [{ id: "o4", libelle: "Moyen", description: null, texteLibre: false }] },
    ],
  },
};
const CONFIRMATION = {
  id: "question:k2", type: "information_manquante", urgence: "haute", enTete: true, titre: "Mettre l'agent Veille en pause ?", raison: "Une décision vous revient.", lien: "/issues/ATL-6", action: "Confirmer", issueId: "iss-6",
  interaction: { id: "k2", kind: "request_confirmation", invite: "Mettre l'agent Veille en pause ?", details: null, libelleAccepter: "Confirmer", libelleRefuser: "Annuler", questions: [] },
};
const CONTENU = { id: "contenu:iss-1", type: "contenu_a_valider", urgence: "haute", titre: "Page toiture", raison: "Attend votre décision.", lien: "/atelier/contenus/iss-1", action: "Relire et décider", issueId: "iss-1" };
const bloc = (actions: unknown) => `Voici ce que je propose.\n\n\`\`\`atelier-actions\n${JSON.stringify(actions)}\n\`\`\``;

describe("discussion : télécommande (actions dans les messages)", () => {
  it("« ouvrir » avec un filtre : le lien porte les paramètres d'adresse, champ inconnu ou invalide ignoré, autre cible sans filtre", async () => {
    messages = [
      msg({
        actions: [
          { type: "ouvrir", cible: "prospects", filtre: { statut: "qualifie", segment: "medecins" } },
          { type: "ouvrir", cible: "prospects", filtre: { statut: "pirate", inconnu: "x", zone: "Liège" } as never },
          { type: "ouvrir", cible: "contenus", filtre: { statut: "qualifie" } },
        ],
      }),
    ];
    const c = await ouvrir();
    const liens = Array.from(c.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(liens).toContain("/RNO/atelier/prospects?statut=qualifie&segment=medecins");
    expect(liens).toContain("/RNO/atelier/prospects?zone=Li%C3%A8ge");
    expect(liens).toContain("/RNO/atelier/contenus");
  });

  it("« ouvrir » devient un bouton-lien vers la rubrique, avec un libellé fixe et une cible tactile large", async () => {
    messages = [msg({ texte: "Voici.", actions: [{ type: "ouvrir", cible: "prospects" }, { type: "ouvrir", cible: "contenus" }] })];
    const c = await ouvrir();
    const lien = parTexte(c, "a", "Voir les prospects");
    expect(lien.getAttribute("href")).toBe("/RNO/atelier/prospects");
    expect(parTexte(c, "a", "Voir les contenus").getAttribute("href")).toBe("/RNO/atelier/contenus");
    expect(STYLES_DISCUSSION).toMatch(/\.atl-disc-actions \.atl-bouton \{ min-height: 2\.75rem/u);
    expect(appels.some((a) => a.url.includes("/accueil?"))).toBe(false);
  });

  it("cible inconnue ou type inconnu : bouton ignoré, aucune erreur visible, texte intact", async () => {
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    messages = [msg({ texte: "Salut <b>x</b>", actions: [{ type: "ouvrir", cible: "ailleurs" }, { type: "detruire" }, { type: "ouvrir", cible: "carte" }] })];
    const c = await ouvrir();
    expect(c.querySelectorAll(".atl-disc-actions a")).toHaveLength(1);
    expect(parTexte(c, "a", "Voir la carte des prospects")).toBeTruthy();
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(c.querySelector("b")).toBeNull();
    expect(avertir).toHaveBeenCalledTimes(2);
    avertir.mockRestore();
  });

  it("« traiter » : libellé tiré de l'élément, panneau des questions déplié en place, envoi, bouton remplacé par la confirmation", async () => {
    elementsAccueil = [QUESTIONS];
    messages = [msg({ texte: "J'ai besoin de vous.", actions: [{ type: "traiter", element: "question:k1" }] })];
    const c = await ouvrir();
    const bouton = parTexte(c, "button", "Répondre aux 3 questions");
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    expect(c.querySelector(".atl-surplace")).toBeNull();
    await cliquer(bouton);
    expect(c.querySelector('.atl-disc-bulle .atl-surplace[aria-label="Questions de l\'équipe"]')).toBeTruthy();
    await cliquer(c.querySelector('input[type="radio"][value="o1"]')!);
    await cliquer(parTexte(c, "button", "Envoyer"));
    const natif = appels.find((a) => a.url === "/api/issues/iss-5/interactions/k1/respond")!;
    expect(natif.corps).toEqual({ answers: [{ questionId: "q1", optionIds: ["o1"] }] });
    expect(c.querySelector(".atl-surplace")).toBeNull();
    expect(c.querySelector(".atl-disc-fait")!.textContent).toContain("Réponse envoyée");
    expect(document.activeElement).toBe(c.querySelector(".atl-disc-fait"));
  });

  it("« traiter » un contenu à valider déplie l'aperçu et la décision (panneau Contenu)", async () => {
    elementsAccueil = [CONTENU];
    messages = [msg({ actions: [{ type: "traiter", element: "contenu:iss-1" }] })];
    const c = await ouvrir();
    expect(c.querySelector(".atl-disc-texte")).not.toBeNull();
    await cliquer(parTexte(c, "button", "Approuver ce contenu"));
    expect(c.querySelector('.atl-surplace[aria-label="Contenu à valider"]')).toBeTruthy();
  });

  it("« traiter » une demande d'accès, un budget ou un type inconnu : lien vers la page native, aucun bouton de décision", async () => {
    const approb = (id: string, type: string) => ({ id: `approbation:${id}`, type: "approbation", urgence: "haute", titre: `Approbation ${id}`, raison: "x", lien: `/approvals/${id}`, action: "Décider", approbationId: id,
      approbation: { type, surPlace: false, demandeur: "Un agent de l'équipe", lignes: [] } });
    elementsAccueil = [approb("h1", "hire_agent"), approb("b1", "budget_override_required"), approb("u1", "type_futur")];
    messages = [msg({ actions: ["h1", "b1", "u1"].map((i) => ({ type: "traiter", element: `approbation:${i}` })) })];
    const c = await ouvrir();
    const liens = Array.from(c.querySelectorAll<HTMLAnchorElement>(".atl-disc-actions a")).map((a) => a.getAttribute("href"));
    expect(liens).toEqual(["/RNO/approvals/h1", "/RNO/approvals/b1", "/RNO/approvals/u1"]);
    expect(parTexte(c, "a", "Examiner dans la page native")).toBeTruthy();
    expect(c.querySelector("button[aria-expanded]")).toBeNull();
    expect(Array.from(c.querySelectorAll("button")).some((b) => /Approuver|Refuser/.test(b.textContent ?? ""))).toBe(false);
  });

  it("une carte qui exécute un outil, dans le fil : lien vers la tâche, aucun bouton de décision", async () => {
    cartes = [{ ...CONFIRMATION, interaction: { ...(CONFIRMATION as { interaction: object }).interaction, natifSeulement: true } }];
    const c = await ouvrir();
    const carte = c.querySelector('.atl-disc-bulle[data-carte="oui"]')!;
    expect(parTexte(carte as HTMLElement, "a", "Ouvrir la tâche")).toBeTruthy();
    expect(Array.from(carte.querySelectorAll("button")).some((b) => /Confirmer|Refuser/.test(b.textContent ?? ""))).toBe(false);
  });

  it("isolation : un élément absent de l'Accueil de l'entreprise courante (autre entreprise, inconnu) n'a aucun bouton", async () => {
    elementsAccueil = [CONTENU];
    messages = [msg({ actions: [{ type: "traiter", element: "contenu:iss-AUTRE-ENTREPRISE" }, { type: "traiter", element: "approbation:zzz" }] })];
    const c = await ouvrir();
    expect(c.querySelector(".atl-disc-actions")).toBeNull();
    expect(c.querySelector("button[aria-expanded]")).toBeNull();
    expect(appels.filter((a) => a.url.includes("/accueil?")).every((a) => a.url.includes("companyId=11111111-1111-4111-8111-111111111111"))).toBe(true);
  });

  it("l'Accueil en panne : pas de bouton « traiter », message « Actions indisponibles » et bouton Réessayer qui relit", async () => {
    elementsAccueil = [CONTENU];
    messages = [msg({ actions: [{ type: "traiter", element: "contenu:iss-1" }, { type: "ouvrir", cible: "prospects" }] })];
    const ok = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation() as (url: string, init?: unknown) => Promise<Response>;
    let panne = true;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (panne && url.includes("/accueil?")) return new Response("{}", { status: 500 });
      return ok(url, init);
    });
    const c = await ouvrir();
    expect(parTexte(c, "a", "Voir les prospects")).toBeTruthy();
    expect(c.querySelector("button[aria-expanded]")).toBeNull();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Actions indisponibles");
    panne = false;
    await cliquer(parTexte(c, "button", "Réessayer"));
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(parTexte(c, "button", "Approuver ce contenu")).toBeTruthy();
  });

  it("cartes illisibles côté serveur : « Actions indisponibles » avec un bouton qui relit la discussion", async () => {
    const reponse = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation() as (url: string, init?: unknown) => Promise<Response>;
    let panne = true;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const r = await reponse(url, init);
      if (!panne || (init?.method ?? "GET") !== "GET" || !url.includes("/discussion")) return r;
      return new Response(JSON.stringify({ ...(await r.json()), cartes: [], cartesIndisponibles: true }), { status: 200 });
    });
    const c = await ouvrir();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Actions indisponibles");
    panne = false;
    cartes = [CONFIRMATION];
    await cliquer(parTexte(c, "button", "Réessayer"));
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(c.querySelector('.atl-disc-bulle[data-carte="oui"]')).toBeTruthy();
  });
});

describe("discussion : cartes en attente dans le fil", () => {
  it("une confirmation en attente s'affiche comme un message du Coordinateur et se confirme en place", async () => {
    cartes = [CONFIRMATION];
    const c = await ouvrir();
    const carte = c.querySelector('.atl-disc-bulle[data-carte="oui"]')!;
    expect(carte.getAttribute("data-auteur")).toBe("agent");
    expect(carte.textContent).toContain("Coordinateur");
    expect(carte.textContent).toContain("Mettre l'agent Veille en pause ?");
    expect(c.querySelector(".atl-disc-vide")).toBeNull();
    await cliquer(parTexte(carte, "button", "Confirmer"));
    const natif = appels.find((a) => a.url === "/api/issues/iss-6/interactions/k2/accept");
    expect(natif?.methode).toBe("POST");
    expect(c.querySelector('[data-carte="oui"]')).toBeNull();
    expect(c.textContent).toContain("Confirmé");
    expect(document.activeElement?.textContent).toContain("Confirmé");
  });

  it("une carte de questions se remplit et s'envoie depuis le fil", async () => {
    cartes = [QUESTIONS];
    const c = await ouvrir();
    expect(parTexte(c, "legend", /Quelle zone viser/u)).toBeTruthy();
    await cliquer(c.querySelector('input[type="radio"][value="o2"]')!);
    await cliquer(parTexte(c, "button", "Envoyer"));
    expect(appels.find((a) => a.url === "/api/issues/iss-5/interactions/k1/respond")!.corps).toEqual({ answers: [{ questionId: "q1", optionIds: ["o2"] }] });
  });

  it("l'interrogation périodique fait apparaître une carte arrivée entre-temps", async () => {
    vi.useFakeTimers();
    const c = await ouvrir();
    expect(c.querySelector('[data-carte="oui"]')).toBeNull();
    cartes = [CONFIRMATION];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALLE_MS + 50);
    });
    expect(c.querySelector('[data-carte="oui"]')).toBeTruthy();
  });
});
