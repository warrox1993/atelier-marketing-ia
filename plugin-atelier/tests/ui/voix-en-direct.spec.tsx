// @vitest-environment jsdom
/**
 * Voix en direct, côté interface : démarrage et arrêt (RTCPeerConnection, getUserMedia et OpenAI simulés), micro
 * refusé, contexte non sécurisé, voix non configurée, transcription, et un appel d'outil qui déclenche la bonne route.
 */
import { createElement, act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREFIXE_DEMANDE_VOIX, VoixEnDirect, executerOutil, URL_APPELS_REALTIME } from "../../src/ui/composants/voix-en-direct.js";
import { cliquer, rendre, type Rendu } from "./pont.js";

const SOC = "11111111-1111-4111-8111-111111111111";

class FauxCanal {
  readyState = "open";
  onmessage: ((m: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  envoyes: Array<Record<string, any>> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  send(s: string) { this.envoyes.push(JSON.parse(s)); }
  close() { this.readyState = "closed"; }
}
let connexions: FauxPC[] = [];
class FauxPC {
  canal = new FauxCanal();
  ferme = false;
  pistes: unknown[] = [];
  ontrack: unknown = null;
  onconnectionstatechange: unknown = null;
  connectionState = "new";
  constructor() { connexions.push(this); }
  addTrack(t: unknown) { this.pistes.push(t); }
  createDataChannel() { return this.canal; }
  async createOffer() { return { type: "offer", sdp: "v=0 offre" }; }
  async setLocalDescription() {}
  async setRemoteDescription(d: { sdp: string }) { this.reponse = d.sdp; }
  reponse = "";
  close() { this.ferme = true; }
}

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown; auth?: string }> = [];
let serveur: (methode: string, url: string, corps: unknown) => { statut: number; corps: unknown } | string;
let arrets: number;

beforeEach(() => {
  connexions = [];
  appels = [];
  arrets = 0;
  serveur = (methode, url) => {
    if (url.endsWith("/voix/session")) return { statut: 200, corps: { clientSecret: "ek_test", expireLe: "2026-10-16T10:00:00.000Z", modele: "gpt-realtime" } };
    if (url === URL_APPELS_REALTIME) return "v=0 reponse";
    return { statut: 404, corps: {} };
  };
  vi.stubGlobal("RTCPeerConnection", FauxPC);
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => { arrets += 1; } }] })) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const corps = init?.body && init.body.startsWith("{") ? JSON.parse(init.body) : (init?.body ?? null);
      appels.push({ methode: init?.method ?? "GET", url, corps, auth: init?.headers?.Authorization });
      const r = serveur(init?.method ?? "GET", url, corps);
      return typeof r === "string" ? new Response(r, { status: 201 }) : new Response(JSON.stringify(r.corps), { status: r.statut });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const ouvrir = async () => {
  rendu = await rendre(createElement(VoixEnDirect, { companyId: SOC }));
  return rendu.conteneur;
};
const bouton = (c: HTMLElement) => c.querySelector("button") as HTMLButtonElement;
const boutonNomme = (c: HTMLElement, nom: string) => [...c.querySelectorAll("button")].find((b) => b.textContent === nom) as HTMLButtonElement;
const recevoir = async (evt: Record<string, unknown>) => {
  await act(async () => {
    connexions[0]!.canal.onmessage?.({ data: JSON.stringify(evt) });
  });
};

describe("VoixEnDirect", () => {
  it("démarre : micro, secret éphémère, offre SDP envoyée à OpenAI avec ce secret, puis arrêt qui libère tout", async () => {
    const c = await ouvrir();
    expect(bouton(c).textContent).toBe("Parler en direct");
    await cliquer(bouton(c));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    const session = appels.find((a) => a.url.endsWith("/voix/session"))!;
    expect(session).toMatchObject({ methode: "POST", corps: { companyId: SOC } });
    const sdp = appels.find((a) => a.url === URL_APPELS_REALTIME)!;
    expect(sdp).toMatchObject({ methode: "POST", corps: "v=0 offre", auth: "Bearer ek_test" });
    expect(connexions[0]!.reponse).toBe("v=0 reponse");
    expect(connexions[0]!.pistes).toHaveLength(1);
    await act(async () => connexions[0]!.canal.onopen?.());
    expect(c.querySelector("[role=status]")!.textContent).toBe("Je vous écoute");
    expect(bouton(c).textContent).toBe("Arrêter");
    expect(bouton(c).style.minHeight).toBe("2.75rem");

    await cliquer(bouton(c));
    expect(connexions[0]!.ferme).toBe(true);
    expect(arrets).toBe(1);
    expect(bouton(c).textContent).toBe("Parler en direct");
    expect(c.querySelector("[role=status]")!.textContent).toBe("Micro arrêté");
  });

  it("affiche la transcription des deux côtés et l'état réfléchit / parle / écoute", async () => {
    const c = await ouvrir();
    await cliquer(bouton(c));
    await recevoir({ type: "input_audio_buffer.speech_stopped" });
    expect(c.querySelector("[role=status]")!.textContent).toBe("Je réfléchis");
    await recevoir({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Où en sont les missions ?" });
    await recevoir({ type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Deux missions " });
    await recevoir({ type: "response.output_audio_transcript.delta", item_id: "a1", delta: "en cours." });
    expect(c.querySelector("[role=status]")!.textContent).toBe("Je parle");
    const lignes = [...c.querySelectorAll("li")].map((l) => l.textContent);
    expect(lignes).toEqual(["Vous : Où en sont les missions ?", "Assistant : Deux missions en cours."]);
    await recevoir({ type: "output_audio_buffer.stopped" });
    expect(c.querySelector("[role=status]")!.textContent).toBe("Je vous écoute");
  });

  it("un appel d'outil déclenche la bonne route puis renvoie le résultat au modèle", async () => {
    serveur = (methode, url, corps) => {
      if (url.endsWith("/voix/session")) return { statut: 200, corps: { clientSecret: "ek_test", expireLe: "x", modele: "gpt-realtime" } };
      if (url === URL_APPELS_REALTIME) return "v=0 reponse";
      if (methode === "POST" && url.endsWith("/equipe/demande")) return { statut: 201, corps: { issueId: "i1", identifiant: "DEM-7", lien: "/x" } };
      if (url.includes("/accueil?")) return { statut: 200, corps: { missions: [{ titre: "Mission A" }], elements: [{ type: "tache_bloquee", titre: "DEM-1 · Post", raison: "Échec", urgence: "haute" }, { type: "approbation", titre: "x" }] } };
      return { statut: 404, corps: {} };
    };
    const c = await ouvrir();
    await cliquer(bouton(c));
    await recevoir({ type: "response.function_call_arguments.done", name: "transmettre_au_coordinateur", call_id: "call_1", arguments: JSON.stringify({ demande: "Prépare un post pour lundi" }) });
    // Sans clic humain : l'encart montre la demande, aucun appel, rien renvoyé au modèle.
    expect(appels.find((a) => a.url.endsWith("/equipe/demande"))).toBeUndefined();
    expect(connexions[0]!.canal.envoyes).toHaveLength(0);
    expect(c.querySelector("[aria-label='Demande à confirmer']")!.textContent).toContain("Prépare un post pour lundi");
    await cliquer(boutonNomme(c, "Transmettre"));
    const demande = appels.find((a) => a.url.endsWith("/equipe/demande"))!;
    expect(demande.corps).toEqual({ companyId: SOC, texte: `${PREFIXE_DEMANDE_VOIX} Prépare un post pour lundi` });
    expect(PREFIXE_DEMANDE_VOIX).toBe("[Demande dictée en direct]");
    expect(c.querySelector("[aria-label='Demande à confirmer']")).toBeNull();
    const envoyes = connexions[0]!.canal.envoyes;
    expect(envoyes[0]).toMatchObject({ type: "conversation.item.create", item: { type: "function_call_output", call_id: "call_1" } });
    expect(JSON.parse(envoyes[0]!.item.output)).toEqual({ transmise: true, tache: "DEM-7" });
    expect(envoyes[1]).toEqual({ type: "response.create" });

    expect(JSON.parse(await executerOutil("etat_missions", "{}", SOC))).toEqual({ missions: [{ titre: "Mission A" }] });
    expect(JSON.parse(await executerOutil("taches_bloquees", "{}", SOC)).taches).toEqual([{ titre: "DEM-1 · Post", raison: "Échec", urgence: "haute" }]);
  });

  it("« Annuler » : aucun appel à la route, le modèle reçoit « refusé par l'utilisateur »", async () => {
    const c = await ouvrir();
    await cliquer(bouton(c));
    await recevoir({ type: "response.function_call_arguments.done", name: "transmettre_au_coordinateur", call_id: "call_2", arguments: JSON.stringify({ demande: "Supprime tout" }) });
    expect(c.querySelector("[aria-label='Demande à confirmer']")!.textContent).toContain("Supprime tout");
    await cliquer(boutonNomme(c, "Annuler"));
    expect(appels.find((a) => a.url.endsWith("/equipe/demande"))).toBeUndefined();
    const envoyes = connexions[0]!.canal.envoyes;
    expect(envoyes[0]).toMatchObject({ type: "conversation.item.create", item: { type: "function_call_output", call_id: "call_2" } });
    expect(JSON.parse(envoyes[0]!.item.output)).toMatchObject({ erreur: "refusé par l'utilisateur", transmise: false });
    expect(envoyes[1]).toEqual({ type: "response.create" });
    expect(c.querySelector("[aria-label='Demande à confirmer']")).toBeNull();
  });

  it("l'outil seul, sans confirmation, refuse de transmettre ; arrêter la voix pendant la proposition la refuse", async () => {
    const avant = appels.length;
    expect(JSON.parse(await executerOutil("transmettre_au_coordinateur", JSON.stringify({ demande: "x" }), SOC)).erreur).toContain("confirmation");
    expect(appels.length).toBe(avant);
    const c = await ouvrir();
    await cliquer(bouton(c));
    await recevoir({ type: "response.function_call_arguments.done", name: "transmettre_au_coordinateur", call_id: "call_3", arguments: JSON.stringify({ demande: "Autre" }) });
    await cliquer(bouton(c));
    expect(appels.find((a) => a.url.endsWith("/equipe/demande"))).toBeUndefined();
    expect(c.querySelector("[aria-label='Demande à confirmer']")).toBeNull();
  });

  it("resume_prospects lit le total et les qualifiés ; un outil inconnu est refusé sans appel", async () => {
    serveur = (_m, url) => (url.includes("qualifiesSeulement=true") ? { statut: 200, corps: { total: 4 } } : url.includes("/prospects?") ? { statut: 200, corps: { total: 30 } } : { statut: 404, corps: {} });
    expect(JSON.parse(await executerOutil("resume_prospects", "{}", SOC))).toEqual({ total: 30, qualifies: 4 });
    const avant = appels.length;
    expect(JSON.parse(await executerOutil("supprimer_tout", "{}", SOC)).erreur).toContain("inconnu");
    expect(appels.length).toBe(avant);
  });

  it("micro refusé : message lisible, rien ne reste ouvert, aucune session créée", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    const c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toBe("Accès au micro refusé.");
    expect(appels).toHaveLength(0);
    expect(bouton(c).textContent).toBe("Parler en direct");
  });

  it("navigateur sans micro ou sans WebRTC : message français, jamais « Not supported »", async () => {
    const msg = "Ce navigateur ne permet pas la voix en direct (micro ou WebRTC indisponible).";
    // 1. RTCPeerConnection absent
    vi.stubGlobal("RTCPeerConnection", undefined);
    let c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toBe(msg);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    // 2. NotSupportedError levé par le navigateur
    vi.stubGlobal("RTCPeerConnection", FauxPC);
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new DOMException("Not supported", "NotSupportedError"));
    c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toBe(msg);
    // 3. erreur brute inconnue : message générique français
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Something broke"));
    c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toBe("La voix en direct n'a pas pu démarrer.");
  });

  it("navigateur sans mediaDevices : message français", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    const c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toBe("Ce navigateur ne permet pas la voix en direct (micro ou WebRTC indisponible).");
  });

  it("contexte non sécurisé : message HTTPS, micro jamais demandé", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toContain("HTTPS");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("voix non configurée : le message du serveur est affiché et le micro est relâché", async () => {
    serveur = () => ({ statut: 503, corps: { error: "[voix_non_configuree] La voix en direct n'est pas configurée : renseignez le secret de la clé OpenAI." } });
    const c = await ouvrir();
    await cliquer(bouton(c));
    expect(c.querySelector("[role=alert]")!.textContent).toContain("n'est pas configurée");
    expect(arrets).toBe(1);
    expect(connexions).toHaveLength(0);
    expect(bouton(c).textContent).toBe("Parler en direct");
  });
});
