/**
 * Dictée vocale locale : transcription par un faux serveur whisper (vrai serveur HTTP en boucle locale),
 * refus de type et de taille, refus des agents, serveur absent, texte absent du journal.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { ADRESSE_DICTEE_DEFAUT, TAILLE_MAX_AUDIO, adresseDictee, routesDictee } from "../src/serveur/services-dictee.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "00000000-0000-4000-8000-000000000900", agentId: "00000000-0000-4000-8000-000000000900", userId: null, runId: "run-1" };
const TEXTE_SECRET = "Bonjour, je voudrais un devis pour une toiture à Liège";

let serveurs: Server[] = [];
afterEach(async () => {
  await Promise.all(serveurs.map((s) => new Promise((ok) => s.close(ok))));
  serveurs = [];
});

/** Faux whisper-server : enregistre ce qu'il reçoit et répond comme le vrai (`{"text": " …"}`). */
async function fauxWhisper(reponse: { statut?: number; corps?: string } = {}) {
  const recus: Array<{ chemin: string; methode: string; type: string; taille: number; brut: string }> = [];
  const s = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on("data", (m: Buffer) => morceaux.push(m));
    req.on("end", () => {
      const corps = Buffer.concat(morceaux);
      recus.push({ chemin: req.url ?? "", methode: req.method ?? "", type: String(req.headers["content-type"] ?? ""), taille: corps.length, brut: corps.toString("latin1") });
      res.writeHead(reponse.statut ?? 200, { "content-type": "application/json" });
      res.end(reponse.corps ?? JSON.stringify({ text: ` ${TEXTE_SECRET}\n` }));
    });
  });
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  serveurs.push(s);
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, recus };
}

function faux(url: string | undefined) {
  const journal: Ligne[] = [];
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    // L'adresse configurée n'est valable que sur le port 8178 : le faux serveur whisper écoute sur un port libre,
    // donc on garde l'adresse par défaut et c'est `fetchLocal` qui redirige vers lui.
    config: { get: async () => ({}) },
  } as unknown as PluginContext;
  const base = { journaliser: async (e: Ligne) => void journal.push(e) } as unknown as BaseAtelier;
  const routes = routesDictee({ ctx, base, fetchLocal: (u, init) => fetch(url ? u.replace(ADRESSE_DICTEE_DEFAUT, url) : u, init) });
  const appeler = (cle: "dictee.transcrire" | "dictee.etat", r: Partial<RequeteRoute> = {}) =>
    routes[cle]!({ cle, params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  const refus = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null);
  return { appeler, refus, journal };
}

const audio = (octets: number, type = "audio/webm") => ({ corps: { companyId: SOC, audioBase64: Buffer.alloc(octets, 7).toString("base64"), type } });

describe("dictée : routes déclarées", () => {
  it("deux routes réservées à l'humain (auth board)", () => {
    expect(ROUTES_API.find((r) => r.cle === "dictee.transcrire")).toMatchObject({ methode: "POST", chemin: "/dictee/transcrire", auth: "board" });
    expect(ROUTES_API.find((r) => r.cle === "dictee.etat")).toMatchObject({ methode: "GET", chemin: "/dictee/etat", auth: "board" });
  });
  it("l'adresse reste en boucle locale", () => {
    expect(adresseDictee("http://localhost:8178").hostname).toBe("localhost");
    expect(adresseDictee("http://example.com:8178").hostname).toBe("127.0.0.1");
    expect(adresseDictee(undefined).port).toBe("8178");
  });
  it("un port différent de 8178 (ou absent) ramène l'adresse par défaut", () => {
    for (const brute of ["http://localhost:9000", "http://127.0.0.1:22", "http://localhost", "https://[::1]:3100"]) {
      expect(adresseDictee(brute).toString(), brute).toBe(new URL(ADRESSE_DICTEE_DEFAUT).toString());
    }
    expect(adresseDictee("http://[::1]:8178").hostname).toBe("[::1]");
  });
});

describe("dictee.transcrire", () => {
  it("transcrit : envoie l'audio en multipart à /inference et renvoie {texte, dureeMs}", async () => {
    const w = await fauxWhisper();
    const f = faux(w.url);
    const { corps } = await f.appeler("dictee.transcrire", audio(1000, "audio/webm;codecs=opus"));
    expect(corps).toMatchObject({ texte: TEXTE_SECRET });
    expect(typeof (corps as Ligne).dureeMs).toBe("number");
    expect(w.recus).toHaveLength(1);
    expect(w.recus[0]).toMatchObject({ chemin: "/inference", methode: "POST" });
    expect(w.recus[0]!.type).toContain("multipart/form-data");
    expect(w.recus[0]!.brut).toContain('filename="dictee.webm"');
    expect(w.recus[0]!.taille).toBeGreaterThan(1000);
  });

  it("refuse un type hors liste blanche sans appeler whisper", async () => {
    const w = await fauxWhisper();
    const f = faux(w.url);
    for (const type of ["audio/mpeg", "video/webm", "text/plain"]) {
      const e = await f.refus(f.appeler("dictee.transcrire", audio(100, type)));
      expect(e?.statut, type).toBe(400);
    }
    expect(w.recus).toHaveLength(0);
  });

  it("refuse plus de 700 000 octets décodés, accepte exactement 700 000 (limite de 1 Mo en base64 de l'hôte)", async () => {
    expect(TAILLE_MAX_AUDIO).toBe(700_000);
    expect(Buffer.alloc(TAILLE_MAX_AUDIO).toString("base64").length).toBeLessThan(1_000_000);
    const w = await fauxWhisper();
    const f = faux(w.url);
    const e = await f.refus(f.appeler("dictee.transcrire", audio(TAILLE_MAX_AUDIO + 1)));
    expect(e?.statut).toBe(400);
    expect(e?.message).toMatch(/volumineux/);
    expect(w.recus).toHaveLength(0);
    await f.appeler("dictee.transcrire", audio(TAILLE_MAX_AUDIO));
    expect(w.recus).toHaveLength(1);
  });

  it("refuse base64 invalide, entrée vide et corps d'une autre entreprise", async () => {
    const f = faux((await fauxWhisper()).url);
    expect((await f.refus(f.appeler("dictee.transcrire", { corps: { companyId: SOC, audioBase64: "pas du base64 !", type: "audio/wav" } })))?.statut).toBe(400);
    expect((await f.refus(f.appeler("dictee.transcrire", { corps: { companyId: SOC, audioBase64: "", type: "audio/wav" } })))?.statut).toBe(400);
    expect((await f.refus(f.appeler("dictee.transcrire", { corps: { ...audio(10).corps, companyId: "00000000-0000-4000-8000-0000000000aa" } })))?.statut).toBe(404);
  });

  it("refuse un agent (403), pour la transcription comme pour l'état", async () => {
    const w = await fauxWhisper();
    const f = faux(w.url);
    expect((await f.refus(f.appeler("dictee.transcrire", { ...audio(100), acteur: AGENT })))?.statut).toBe(403);
    expect((await f.refus(f.appeler("dictee.etat", { acteur: AGENT })))?.statut).toBe(403);
    expect(w.recus).toHaveLength(0);
  });

  it("serveur absent : 503 dictee_indisponible", async () => {
    // Port fermé : on ouvre un serveur puis on le ferme pour obtenir une adresse sûrement libre.
    const w = await fauxWhisper();
    await new Promise((ok) => serveurs.pop()!.close(ok));
    const f = faux(w.url);
    const e = await f.refus(f.appeler("dictee.transcrire", audio(100)));
    expect(e?.statut).toBe(503);
    expect(e?.code).toBe("dictee_indisponible");
  });

  it("serveur en erreur 500 : 503 dictee_indisponible", async () => {
    const f = faux((await fauxWhisper({ statut: 500, corps: "{}" })).url);
    expect((await f.refus(f.appeler("dictee.transcrire", audio(100))))?.code).toBe("dictee_indisponible");
  });

  it("le texte et l'audio n'apparaissent jamais dans le journal : durée et taille seulement", async () => {
    const f = faux((await fauxWhisper()).url);
    await f.appeler("dictee.transcrire", audio(321));
    expect(f.journal).toHaveLength(1);
    expect(f.journal[0]).toMatchObject({ type: "dictee.transcrire", donnees: { tailleOctets: 321 } });
    expect(Object.keys(f.journal[0]!.donnees).sort()).toEqual(["dureeMs", "tailleOctets"]);
    const tout = JSON.stringify(f.journal);
    expect(tout).not.toContain("devis");
    expect(tout).not.toContain(Buffer.alloc(321, 7).toString("base64").slice(0, 40));
  });
});

describe("dictee.etat", () => {
  it("disponible quand le serveur répond", async () => {
    const f = faux((await fauxWhisper()).url);
    expect((await f.appeler("dictee.etat")).corps).toEqual({ disponible: true });
  });
  it("indisponible quand il est absent", async () => {
    const w = await fauxWhisper();
    await new Promise((ok) => serveurs.pop()!.close(ok));
    const f = faux(w.url);
    expect((await f.appeler("dictee.etat")).corps).toEqual({ disponible: false });
  });
});
