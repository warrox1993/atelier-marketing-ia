/**
 * Discussion avec le Coordinateur : issue unique, envoi suivi du réveil, refus de l'agent, texte vide,
 * entreprise incohérente, lecture incrémentale (`depuis`). Faux hôte en mémoire ; routes fusionnées ici
 * (la ligne `Object.assign` de `services.ts` est ajoutée à part).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { ORIGINE_DISCUSSION, PREFIXE_HUMAIN, TTL_CARTES_MS, routesDiscussion } from "../src/serveur/services-discussion.js";
import { SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: id(900), agentId: id(900), userId: null, runId: "run-1" };
const COORD = id(1);
const AUTRE_SOC = id(77);

function faux(o: { reveilEchoue?: boolean; cartesEchouent?: boolean } = {}) {
  const cartes: Ligne[] = [];
  const issues: Ligne[] = [];
  const commentaires: Ligne[] = [];
  const reveils: Ligne[] = [];
  const miseAJour: Ligne[] = [];
  const journal: Ligne[] = [];
  let n = 0;
  const lecturesCartes = { n: 0 };
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
      listInteractions: async (issueId: string, companyId: string) => {
        lecturesCartes.n++;
        if (o.cartesEchouent) throw new Error("hôte indisponible");
        return cartes.filter((c) => c.issueId === issueId && c.companyId === companyId);
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
  return { appeler, refus, issues, commentaires, reveils, miseAJour, journal, repondreCoordinateur, cartes, lecturesCartes };
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

const bloc = (actions: unknown) => `Voici.\n\n\`\`\`atelier-actions\n${typeof actions === "string" ? actions : JSON.stringify(actions)}\n\`\`\``;
const ouvrirMessages = async (f: ReturnType<typeof faux>) => ((await f.appeler("discussion.ouvrir")).corps as { messages: Ligne[]; cartes: Ligne[] });

describe("discussion : actions du Coordinateur (télécommande)", () => {
  it("valide les actions, retire le bloc du texte et rend `actions`", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    const issueId = f.issues[0]!.id as string;
    await f.repondreCoordinateur(issueId, bloc([{ type: "ouvrir", cible: "prospects" }, { type: "ouvrir", cible: "prospects", filtre: { statut: "qualifie", segment: "medecins" } }, { type: "traiter", element: "contenu:abc-12" }]));
    const m = (await ouvrirMessages(f)).messages[0]!;
    expect(m.texte).toBe("Voici.");
    expect(m.actions).toEqual([{ type: "ouvrir", cible: "prospects" }, { type: "ouvrir", cible: "prospects", filtre: { statut: "qualifie", segment: "medecins" } }, { type: "traiter", element: "contenu:abc-12" }]);
    expect(f.journal.filter((j) => j.type === "discussion.action_ignoree")).toHaveLength(0);
  });

  it("rejette type inconnu, cible inconnue, URL libre, HTML, identifiant d'entreprise et élément mal formé, en journalisant une seule fois", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    const issueId = f.issues[0]!.id as string;
    await f.repondreCoordinateur(
      issueId,
      bloc([
        { type: "supprimer", cible: "prospects" },
        { type: "ouvrir", cible: "https://evil.example" },
        { type: "ouvrir", cible: "discussion" },
        { type: "ouvrir", cible: "prospects", filtre: "<script>" },
        { type: "ouvrir", cible: "prospects", companyId: AUTRE_SOC },
        { type: "traiter", element: "contenu:../../x" },
        { type: "traiter", element: "document:1" },
        { type: "ouvrir", cible: "carte" },
      ]),
    );
    await ouvrirMessages(f);
    const m = (await ouvrirMessages(f)).messages[0]!;
    expect(m.actions).toEqual([{ type: "ouvrir", cible: "carte" }]);
    expect(m.texte).toBe("Voici.");
    const ignorees = f.journal.filter((j) => j.type === "discussion.action_ignoree");
    expect(ignorees).toHaveLength(1);
    expect((ignorees[0]!.donnees.ignorees as string[]).length).toBe(7);
  });

  it("JSON illisible ou non tableau : aucune action, message conservé, journalisé", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    const issueId = f.issues[0]!.id as string;
    await f.repondreCoordinateur(issueId, bloc("{pas du json"));
    await f.repondreCoordinateur(issueId, bloc({ type: "ouvrir", cible: "prospects" }));
    const { messages } = await ouvrirMessages(f);
    expect(messages.map((m) => m.actions)).toEqual([[], []]);
    expect(messages.map((m) => m.texte)).toEqual(["Voici.", "Voici."]);
    expect(f.journal.filter((j) => j.type === "discussion.action_ignoree")).toHaveLength(2);
  });

  it("au plus 6 actions par message", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    await f.repondreCoordinateur(f.issues[0]!.id as string, bloc(["accueil", "prospects", "carte", "campagnes", "contenus", "calendrier", "resultats"].map((cible) => ({ type: "ouvrir", cible }))));
    expect(((await ouvrirMessages(f)).messages[0]!.actions as unknown[]).length).toBe(6);
  });

  it("un message de l'humain ne porte jamais d'actions, même s'il contient un bloc", async () => {
    const f = faux();
    await f.appeler("discussion.envoyer", envoyer(bloc([{ type: "ouvrir", cible: "prospects" }])));
    const m = (await ouvrirMessages(f)).messages[0]!;
    expect(m.auteur).toBe("humain");
    expect(m.actions).toEqual([]);
    expect(m.texte).toContain("atelier-actions");
  });

  it("les actions d'un agent autre que le Coordinateur sont écartées (texte conservé, bloc retiré, motif journalisé)", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    const issueId = f.issues[0]!.id as string;
    await f.repondreCoordinateur(issueId, bloc([{ type: "ouvrir", cible: "prospects" }]));
    const autre = id(2);
    const ctxIssues = (f as unknown as { commentaires: Ligne[] }).commentaires;
    ctxIssues.push({ id: id(900), issueId, companyId: SOC, body: bloc([{ type: "traiter", element: "approbation:abc" }]), authorType: "agent", authorAgentId: autre, authorUserId: null, createdAt: new Date(Date.parse("2026-10-16T11:00:00.000Z")) });
    const { messages } = await ouvrirMessages(f);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.actions).toEqual([{ type: "ouvrir", cible: "prospects" }]);
    expect(messages[1]!.actions).toEqual([]);
    expect(messages[1]!.texte).toBe("Voici.");
    expect(JSON.stringify(f.journal)).toContain("autre que le Coordinateur");
  });

  it("isolation : la discussion d'une autre entreprise ne rend ni ses messages, ni ses actions, ni ses cartes", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    await f.repondreCoordinateur(f.issues[0]!.id as string, bloc([{ type: "ouvrir", cible: "prospects" }]));
    f.cartes.push({ id: "k1", issueId: f.issues[0]!.id, companyId: SOC, kind: "request_confirmation", status: "pending", title: "Confirmer ?", payload: { prompt: "Pause ?" } });
    const autre = (await f.appeler("discussion.messages", { companyId: AUTRE_SOC })).corps as { messages: unknown[]; cartes: unknown[] };
    expect(autre).toMatchObject({ messages: [], cartes: [] });
  });
});

describe("discussion : cartes en attente dans le fil", () => {
  it("rend les cartes en attente de la discussion et des demandes ouvertes, pas les autres", async () => {
    const f = faux();
    await f.appeler("discussion.ouvrir");
    const disc = f.issues[0]!;
    f.issues.push({ id: id(300), identifier: "DEM-9", title: "Demande de test", companyId: SOC, status: "in_progress", originKind: "plugin:atelier.marketing-ia:demande", originId: "demande:x", createdAt: new Date() });
    f.issues.push({ id: id(301), identifier: "DEM-10", title: "Terminée", companyId: SOC, status: "done", originKind: "plugin:atelier.marketing-ia:demande", originId: "demande:y", createdAt: new Date() });
    f.issues.push({ id: id(302), identifier: "ATL-1", title: "Sans lien", companyId: SOC, status: "in_progress", originKind: "manual", originId: null, createdAt: new Date() });
    const carte = (n: string, issueId: string, o: Ligne = {}) => ({ id: n, issueId, companyId: SOC, kind: "request_confirmation", status: "pending", title: `Carte ${n}`, payload: { prompt: "OK ?" }, ...o });
    f.cartes.push(carte("c1", disc.id), carte("c2", id(300)), carte("c3", id(301)), carte("c4", id(302)), carte("c5", disc.id, { status: "accepted" }));
    const { cartes } = await ouvrirMessages(f);
    expect(cartes.map((c) => c.id)).toEqual(["question:c1", "question:c2"]);
    expect(cartes[0]).toMatchObject({ issueId: disc.id, interaction: { id: "c1", kind: "request_confirmation" } });
  });

  it("une lecture de cartes en panne n'empêche pas d'ouvrir le fil", async () => {
    const f = faux({ cartesEchouent: true });
    await f.appeler("discussion.ouvrir");
    await f.appeler("discussion.envoyer", envoyer("Bonjour"));
    const corps = (await f.appeler("discussion.ouvrir")).corps as { cartes: unknown[]; messages: unknown[] };
    expect(corps.cartes).toEqual([]);
    expect(corps.messages).toHaveLength(1);
  });

  it("une lecture de cartes en panne est signalée à l'interface (cartesIndisponibles), sans cache de la panne", async () => {
    const f = faux({ cartesEchouent: true });
    const o = (await f.appeler("discussion.ouvrir")).corps as { cartesIndisponibles: boolean };
    expect(o.cartesIndisponibles).toBe(true);
    const avant = f.lecturesCartes.n;
    const m = (await f.appeler("discussion.messages")).corps as { cartesIndisponibles: boolean };
    expect(m.cartesIndisponibles).toBe(true);
    expect(f.lecturesCartes.n).toBeGreaterThan(avant);
  });

  describe("cache de 30 s", () => {
    afterEach(() => vi.restoreAllMocks());
    it("les interrogations du fil ne relisent les cartes qu'une fois par 30 s ; l'ouverture les relit toujours", async () => {
      let t = Date.parse("2026-10-16T12:00:00Z");
      vi.spyOn(Date, "now").mockImplementation(() => t);
      const f = faux();
      await f.appeler("discussion.ouvrir");
      const apres = f.lecturesCartes.n;
      for (let i = 0; i < 5; i++) {
        t += 4000;
        await f.appeler("discussion.messages");
      }
      expect(f.lecturesCartes.n).toBe(apres); // 20 s : cache
      t += TTL_CARTES_MS;
      await f.appeler("discussion.messages");
      expect(f.lecturesCartes.n).toBeGreaterThan(apres); // cache expiré
      const milieu = f.lecturesCartes.n;
      await f.appeler("discussion.ouvrir");
      expect(f.lecturesCartes.n).toBeGreaterThan(milieu); // ouverture : lecture fraîche
    });
  });
});
