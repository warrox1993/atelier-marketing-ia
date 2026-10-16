/**
 * Voix en direct, côté serveur : création du secret éphémère par un faux OpenAI (faux `fetch`), absence de clé
 * (503), refus des agents (403), clé absente du journal et de la réponse.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { DUREE_SECRET_SECONDES, MODELE_VOIX, OUTILS_VOIX, URL_SECRETS_CLIENT, routesVoix } from "../src/serveur/services-voix.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "00000000-0000-4000-8000-000000000900", agentId: "00000000-0000-4000-8000-000000000900", userId: null, runId: "run-1" };
const CLE_OPENAI = "sk-proj-CLE-SECRETE-DE-TEST-0123456789";
const SECRET_EPHEMERE = "ek_secret-ephemere-de-test";

function faux(opts: { ref?: unknown; resolu?: string | Error; statut?: number; corps?: unknown; reseau?: boolean } = {}) {
  const journal: Ligne[] = [];
  const appels: Array<{ url: string; init: RequestInit }> = [];
  const logs: unknown[] = [];
  const ctx = {
    logger: { info: (...a: unknown[]) => logs.push(a), warn: (...a: unknown[]) => logs.push(a), error: (...a: unknown[]) => logs.push(a), debug: (...a: unknown[]) => logs.push(a) },
    config: { get: async () => ("ref" in opts ? (opts.ref === undefined ? {} : { openaiSecretRef: opts.ref }) : { openaiSecretRef: { type: "secret_ref", secretId: "s1" } }) },
    secrets: {
      resolve: async () => {
        if (opts.resolu instanceof Error) throw opts.resolu;
        return opts.resolu ?? CLE_OPENAI;
      },
    },
  } as unknown as PluginContext;
  const base = { journaliser: async (e: Ligne) => void journal.push(e) } as unknown as BaseAtelier;
  const routes = routesVoix({
    ctx, base, maintenant: () => 1_000_000,
    fetchSortant: async (url, init) => {
      appels.push({ url, init });
      if (opts.reseau) throw new Error(`coupure avec ${CLE_OPENAI}`);
      return new Response(JSON.stringify(opts.corps ?? { value: SECRET_EPHEMERE, expires_at: 1_800_000_060 }), { status: opts.statut ?? 200 });
    },
  });
  const appeler = (r: Partial<RequeteRoute> = {}) => routes["voix.session"]!({ cle: "voix.session", params: {}, query: {}, corps: { companyId: SOC }, acteur: HUMAIN, companyId: SOC, ...r });
  const refus = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null);
  return { appeler, refus, journal, appels, logs };
}

describe("voix.session : déclaration", () => {
  it("route POST /voix/session réservée à l'humain (auth board)", () => {
    expect(ROUTES_API.find((r) => r.cle === "voix.session")).toMatchObject({ methode: "POST", chemin: "/voix/session", auth: "board" });
  });
  it("outils : trois lectures et la transmission au Coordinateur, rien d'autre", () => {
    expect(OUTILS_VOIX.map((o) => o.name)).toEqual(["etat_missions", "taches_bloquees", "resume_prospects", "transmettre_au_coordinateur"]);
  });
});

describe("voix.session", () => {
  it("crée le secret éphémère : modèle GA, français, outils, durée courte, clé en en-tête seulement", async () => {
    const f = faux();
    const { corps } = await f.appeler();
    expect(corps).toEqual({ clientSecret: SECRET_EPHEMERE, expireLe: new Date(1_800_000_060 * 1000).toISOString(), modele: MODELE_VOIX });
    expect(f.appels).toHaveLength(1);
    const { url, init } = f.appels[0]!;
    expect(url).toBe(URL_SECRETS_CLIENT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CLE_OPENAI}`);
    const envoye = JSON.parse(String(init.body));
    expect(envoye.expires_after.seconds).toBe(DUREE_SECRET_SECONDES);
    expect(envoye.session).toMatchObject({ type: "realtime", model: "gpt-realtime", tool_choice: "auto" });
    expect(envoye.session.audio.input.transcription.language).toBe("fr");
    expect(envoye.session.audio.input.turn_detection.type).toBe("semantic_vad");
    expect(envoye.session.instructions).toContain("français");
    expect(envoye.session.instructions).toContain("Coordinateur");
    expect(envoye.session.tools.map((o: Ligne) => o.name)).toHaveLength(4);
    expect(String(init.body)).not.toContain(CLE_OPENAI);
  });

  it("sans clé configurée : 503 voix_non_configuree, aucun appel sortant", async () => {
    for (const f of [faux({ ref: undefined }), faux({ resolu: new Error("secret introuvable") }), faux({ resolu: "  " })]) {
      const e = await f.refus(f.appeler());
      expect(e?.code).toBe("voix_non_configuree");
      expect(e?.statut).toBe(503);
      expect(e?.message).toContain("openaiSecretRef");
      expect(f.appels).toHaveLength(0);
      expect(f.journal).toHaveLength(0);
    }
  });

  it("un agent est refusé (403) avant toute lecture du secret", async () => {
    const f = faux();
    const e = await f.refus(f.appeler({ acteur: AGENT }));
    expect(e?.code).toBe("elevation_refusee");
    expect(e?.statut).toBe(403);
    expect(f.appels).toHaveLength(0);
  });

  it("une autre entreprise dans le corps est refusée", async () => {
    const f = faux();
    const e = await f.refus(f.appeler({ corps: { companyId: "99999999-9999-4999-8999-999999999999" } }));
    expect(e?.code).toBe("hors_entreprise");
    expect(f.appels).toHaveLength(0);
  });

  it("la clé n'apparaît ni dans la réponse, ni dans le journal, ni dans les logs, même en cas d'échec réseau", async () => {
    const f = faux();
    const { corps } = await f.appeler();
    expect(JSON.stringify(corps)).not.toContain(CLE_OPENAI);
    expect(f.journal).toHaveLength(1);
    expect(f.journal[0]).toMatchObject({ type: "voix.session", entite: "voix", acteur: "local-board" });
    const trace = JSON.stringify([f.journal, f.logs]);
    expect(trace).not.toContain(CLE_OPENAI);
    expect(trace).not.toContain(SECRET_EPHEMERE);

    const g = faux({ reseau: true });
    const e = await g.refus(g.appeler());
    expect(e?.code).toBe("voix_indisponible");
    expect(JSON.stringify([e?.message, e?.details, g.journal, g.logs])).not.toContain(CLE_OPENAI);
  });

  it("OpenAI refuse la clé (401) : voix_non_configuree ; panne (500) ou réponse sans secret : voix_indisponible", async () => {
    const u = faux({ statut: 401, corps: {} });
    expect((await u.refus(u.appeler()))?.code).toBe("voix_non_configuree");
    const a = faux({ statut: 500, corps: {} });
    expect((await a.refus(a.appeler()))?.code).toBe("voix_indisponible");
    const b = faux({ corps: { autre: 1 } });
    expect((await b.refus(b.appeler()))?.code).toBe("voix_indisponible");
    expect(b.journal).toHaveLength(0);
  });
});
