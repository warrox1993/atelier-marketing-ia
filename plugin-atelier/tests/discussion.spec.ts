/**
 * Discussion avec le Coordinateur : issue unique, envoi suivi du réveil, refus de l'agent, texte vide,
 * entreprise incohérente, lecture incrémentale (`depuis`). Faux hôte en mémoire ; routes fusionnées ici
 * (la ligne `Object.assign` de `services.ts` est ajoutée à part).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { ORIGINE_DISCUSSION, PREFIXE_HUMAIN, routesDiscussion } from "../src/serveur/services-discussion.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: id(900), agentId: id(900), userId: null, runId: "run-1" };
const COORD = id(1);
const AUTRE_SOC = id(77);

function faux(o: { reveilEchoue?: boolean } = {}) {
  const issues: Ligne[] = [];
  const commentaires: Ligne[] = [];
  const reveils: Ligne[] = [];
  const miseAJour: Ligne[] = [];
  const journal: Ligne[] = [];
  let n = 0;
  const o_reveilEchoue = () => o.reveilEchoue === true;
  let horloge = Date.parse("2026-10-16T10:00:00.000Z");
  const tic = () => new Date((horloge += 1000));
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    agents: {
      list: async () => [{ id: COORD, name: "Coordinateur Rénovation", role: "ceo", status: "idle" }],
      get: async (agentId: string) => (agentId === COORD ? { id: COORD, name: "Coordinateur Rénovation" } : null),
    },
    issues: {
      list: async (f: Ligne) => issues.filter((i) => i.companyId === f.companyId && (!f.originKind || i.originKind === f.originKind) && (!f.originId || i.originId === f.originId)),
      get: async (issueId: string, companyId: string) => issues.find((i) => i.id === issueId && i.companyId === companyId) ?? null,
      create: async (input: Ligne) => {
        const issue = { id: id(100 + issues.length), identifier: `DEM-${issues.length + 1}`, createdAt: tic(), ...input };
        issues.push(issue);
        return issue;
      },
      update: async (issueId: string, patch: Ligne) => {
        miseAJour.push({ issueId, patch });
        Object.assign(issues.find((i) => i.id === issueId)!, patch);
      },
      listComments: async (issueId: string) => commentaires.filter((c) => c.issueId === issueId),
      createComment: async (issueId: string, body: string, companyId: string, o?: Ligne) => {
        const c = { id: id(500 + n++), issueId, companyId, body, authorType: o?.authorAgentId ? "agent" : "system", authorAgentId: o?.authorAgentId ?? null, authorUserId: null, createdAt: tic() };
        commentaires.push(c);
        return c;
      },
      requestWakeup: async (issueId: string, _c: string, o: Ligne) => {
        if (o_reveilEchoue()) throw new Error("hôte indisponible");
        reveils.push({ issueId, ...o });
        return { queued: true, runId: "run-9" };
      },
    },
  } as unknown as PluginContext;
  const base = { journaliser: async (e: Ligne) => void journal.push(e) } as unknown as BaseAtelier;
  const routes = routesDiscussion({ ctx, base });
  const appeler = (cle: "discussion.ouvrir" | "discussion.envoyer" | "discussion.messages", r: Partial<RequeteRoute> = {}) =>
    routes[cle]!({ cle, params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  const refus = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null);
  /** Réponse du Coordinateur dans le fil natif. */
  const repondreCoordinateur = (issueId: string, texte: string) => ctx.issues.createComment(issueId, texte, SOC, { authorAgentId: COORD });
  return { appeler, refus, issues, commentaires, reveils, miseAJour, journal, repondreCoordinateur };
}

const envoyer = (texte: unknown, companyId: string = SOC) => ({ corps: { companyId, texte } });

describe("discussion : routes déclarées", () => {
  it("trois routes réservées à l'humain (auth board)", () => {
    for (const cle of ["discussion.ouvrir", "discussion.envoyer", "discussion.messages"]) expect(ROUTES_API.find((x) => x.cle === cle)?.auth, cle).toBe("board");
    expect(ROUTES_API.find((x) => x.cle === "discussion.ouvrir")).toMatchObject({ methode: "GET", chemin: "/discussion" });
    expect(ROUTES_API.find((x) => x.cle === "discussion.envoyer")).toMatchObject({ methode: "POST", chemin: "/discussion/message" });
    expect(ROUTES_API.find((x) => x.cle === "discussion.messages")).toMatchObject({ methode: "GET", chemin: "/discussion/messages" });
  });
});

describe("discussion.ouvrir", () => {
  it("crée l'issue unique assignée au Coordinateur, avec un marqueur stable, sans doublon au second appel", async () => {
    const f = faux();
    const a = (await f.appeler("discussion.ouvrir")).corps as Ligne;
    const b = (await f.appeler("discussion.ouvrir")).corps as Ligne;
    expect(f.issues).toHaveLength(1);
    expect(f.issues[0]).toMatchObject({ title: "Discussion avec le Coordinateur", assigneeAgentId: COORD, originKind: ORIGINE_DISCUSSION, originId: `discussion:${SOC}` });
    expect(b.issueId).toBe(a.issueId);
    expect(a).toMatchObject({ identifiant: "DEM-1", messages: [] });
  });

  it("deux ouvertures simultanées ne créent qu'une issue", async () => {
    const f = faux();
    await Promise.all([f.appeler("discussion.ouvrir"), f.appeler("discussion.ouvrir"), f.appeler("discussion.envoyer", envoyer("Bonjour"))]);
    expect(f.issues).toHaveLength(1);
  });

  it("rend les messages du plus ancien au plus récent, humain et agent distingués, 100 au plus", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    const issueId = f.issues[0]!.id as string;
    for (let i = 0; i < 60; i += 1) {
      await f.appeler("discussion.envoyer", envoyer(`Question ${i}`));
      await f.repondreCoordinateur(issueId, `Réponse ${i}`);
    }
    const { messages } = (await f.appeler("discussion.ouvrir")).corps as { messages: Ligne[] };
    expect(messages).toHaveLength(100);
    expect(messages.at(-1)).toMatchObject({ auteur: "agent", nom: "Coordinateur Rénovation", texte: "Réponse 59" });
    expect(messages.at(-2)).toMatchObject({ auteur: "humain", nom: "Vous", texte: "Question 59" });
    const dates = messages.map((m) => m.date as string);
    expect([...dates].sort()).toEqual(dates);
  });

  it("refuse un agent (403) et ne crée rien", async () => {
    const f = faux();
    const e = await f.refus(f.appeler("discussion.ouvrir", { acteur: AGENT }));
    expect(e?.code).toBe("elevation_refusee");
    expect(e?.statut).toBe(403);
    expect(f.issues).toHaveLength(0);
  });
});

describe("discussion.envoyer", () => {
  it("ajoute le message (sans le préfixe dans la réponse) puis réveille le Coordinateur", async () => {
    const f = faux();
    const { corps, statut } = await f.appeler("discussion.envoyer", envoyer("  Où en sont les missions ?  "));
    expect(statut).toBe(201);
    expect(corps).toMatchObject({ auteur: "humain", nom: "Vous", texte: "Où en sont les missions ?", reveilDemande: true });
    expect(f.commentaires[0]!.body).toBe(`${PREFIXE_HUMAIN}Où en sont les missions ?`);
    expect(f.reveils).toHaveLength(1);
    expect(f.reveils[0]).toMatchObject({ issueId: f.issues[0]!.id, reason: "atelier_discussion_message", idempotencyKey: `atelier-discussion-${(corps as Ligne).id}` });
    expect(f.journal.map((j) => j.type)).toEqual(["discussion.ouverte", "discussion.message"]);
    expect(JSON.stringify(f.journal)).not.toContain("missions");
  });

  it("remet l'issue en todo si elle était terminée ou en revue, et la laisse si elle est déjà en cours", async () => {
    const f = faux();
    await f.appeler("discussion.envoyer", envoyer("Un"));
    for (const [avant, attendu] of [["done", "todo"], ["in_review", "todo"], ["in_progress", "in_progress"]] as const) {
      f.issues[0]!.status = avant;
      await f.appeler("discussion.envoyer", envoyer("Encore"));
      expect(f.issues[0]!.status, avant).toBe(attendu);
    }
  });

  it("un réveil impossible n'empêche pas l'enregistrement du message et le signale", async () => {
    const f = faux({ reveilEchoue: true });
    const r = await f.appeler("discussion.envoyer", envoyer("Bonjour"));
    expect(r.statut).toBe(201);
    expect(r.corps).toMatchObject({ texte: "Bonjour", reveilDemande: false });
    expect(f.commentaires).toHaveLength(1);
    expect(f.journal.at(-1)).toMatchObject({ type: "discussion.message", donnees: { erreurReveil: "hôte indisponible" } });
  });

  it("refuse l'agent (403), le texte vide ou blanc, le texte trop long et une entreprise incohérente", async () => {
    const f = faux();
    expect((await f.refus(f.appeler("discussion.envoyer", { ...envoyer("Bonjour"), acteur: AGENT })))?.statut).toBe(403);
    expect((await f.refus(f.appeler("discussion.envoyer", envoyer(""))))?.code).toBe("entree_invalide");
    expect((await f.refus(f.appeler("discussion.envoyer", envoyer("   \n  "))))?.code).toBe("entree_invalide");
    expect((await f.refus(f.appeler("discussion.envoyer", envoyer("x".repeat(4001)))))?.code).toBe("entree_invalide");
    expect((await f.refus(f.appeler("discussion.envoyer", { corps: { companyId: SOC, texte: "ok", autre: 1 } })))?.code).toBe("entree_invalide");
    expect((await f.refus(f.appeler("discussion.envoyer", envoyer("Bonjour", AUTRE_SOC))))?.code).toBe("hors_entreprise");
    expect(f.commentaires).toHaveLength(0);
    expect(f.reveils).toHaveLength(0);
    expect((await f.appeler("discussion.envoyer", envoyer("x".repeat(4000)))).statut).toBe(201);
  });
});

describe("discussion.messages", () => {
  it("rend seulement les messages strictement postérieurs à `depuis`", async () => {
    const f = faux();
    const premier = (await f.appeler("discussion.envoyer", envoyer("Un"))).corps as Ligne;
    const issueId = f.issues[0]!.id as string;
    await f.repondreCoordinateur(issueId, "Deux");
    await f.appeler("discussion.envoyer", envoyer("Trois"));
    const tout = (await f.appeler("discussion.messages")).corps as Ligne;
    expect(tout.messages.map((m: Ligne) => m.texte)).toEqual(["Un", "Deux", "Trois"]);
    const suite = (await f.appeler("discussion.messages", { query: { depuis: premier.date } })).corps as Ligne;
    expect(suite.messages.map((m: Ligne) => m.texte)).toEqual(["Deux", "Trois"]);
    const rien = (await f.appeler("discussion.messages", { query: { depuis: tout.messages.at(-1).date } })).corps as Ligne;
    expect(rien.messages).toEqual([]);
  });

  it("sans discussion encore ouverte : liste vide, et rien n'est créé", async () => {
    const f = faux();
    expect((await f.appeler("discussion.messages")).corps).toMatchObject({ issueId: null, messages: [] });
    expect(f.issues).toHaveLength(0);
  });

  it("refuse une date illisible et l'agent", async () => {
    const f = faux();
    expect((await f.refus(f.appeler("discussion.messages", { query: { depuis: "hier" } })))?.code).toBe("entree_invalide");
    expect((await f.refus(f.appeler("discussion.messages", { acteur: AGENT })))?.statut).toBe(403);
  });
});
