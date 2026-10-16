/**
 * Lot 1 : routes de l'accueil (`accueil.lister`, `equipe.demander`, `mission.suivre`).
 * Les services sont appelés avec un faux hôte écrit pour ce lot (tâches, agents, approbations,
 * commentaires) ; un dernier bloc passe par l'aiguillage réel (`creerAiguillage` + `creerServices`).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API, type StatutFonctionnel } from "../src/contrats/index.js";
import { creerAiguillage, type ActeurHote, type RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { creerServices } from "../src/serveur/services.js";
import {
  ORIGINE_DEMANDE,
  raisonTacheBloquee,
  resumer,
  routesAccueil,
  titreDepuisTexte,
  trierElements,
  type DependancesAccueil,
  type ElementAccueil,
} from "../src/serveur/services-accueil.js";
import { creerBanc, SOC } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: id(900), agentId: id(900), userId: null, runId: "run-1" };
const COORD = id(1);
const T0 = new Date("2026-10-15T10:00:00.000Z");

interface Options {
  agents?: Ligne[];
  issues?: Ligne[];
  portes?: Ligne[];
  approbations?: Ligne[];
  commentaires?: Record<string, Ligne[]>;
  statuts?: Record<string, StatutFonctionnel>;
  clients?: number;
  passerelle?: boolean;
  marques?: Ligne[];
  documents?: Array<{ id: string; titre: string }>;
  /** Projets lisibles par `ctx.projects.get`. */
  projets?: Record<string, { id: string; name: string }>;
  /** Tâches qui portent un document `plan`. */
  avecPlan?: string[];
  /** Fait échouer `requestWakeup` avec ce message. */
  echecReveil?: string;
}

function faux(o: Options = {}) {
  const issues = new Map<string, Ligne>((o.issues ?? []).map((i) => [i.id as string, i]));
  const crees: Ligne[] = [];
  const journal: Ligne[] = [];
  const reveils: Array<{ issueId: string; companyId: string; options: Ligne }> = [];
  const avertissements: Array<{ message: string; meta: Ligne }> = [];
  const ctx = {
    logger: { info() {}, warn: (message: string, meta: Ligne) => void avertissements.push({ message, meta }), error() {}, debug() {} },
    agents: {
      list: async () => o.agents ?? [{ id: COORD, companyId: SOC, name: "Coordinateur", role: "ceo", status: "idle" }],
      get: async (agentId: string) => (o.agents ?? [{ id: COORD, companyId: SOC, name: "Coordinateur", role: "ceo", status: "idle" }]).find((a) => a.id === agentId) ?? null,
    },
    approvals: { list: async () => o.approbations ?? [] },
    ...(o.projets ? { projects: { get: async (projectId: string) => o.projets![projectId] ?? null } } : {}),
    issues: {
      ...(o.avecPlan ? { documents: { list: async (issueId: string) => (o.avecPlan!.includes(issueId) ? [{ key: "plan", title: "Plan" }, { key: "notes", title: null }] : [{ key: "notes", title: null }]) } } : {}),
      get: async (issueId: string, companyId: string) => (issues.get(issueId)?.companyId === companyId ? issues.get(issueId) : null),
      list: async (q: Ligne) =>
        [...issues.values()].filter((i) => (!q.status || i.status === q.status) && (!q.originKind || i.originKind === q.originKind)),
      listComments: async (issueId: string) => o.commentaires?.[issueId] ?? [],
      requestWakeup: async (issueId: string, companyId: string, options: Ligne) => {
        reveils.push({ issueId, companyId, options });
        if (o.echecReveil) throw new Error(o.echecReveil);
        return { queued: true, runId: "run-1" };
      },
      create: async (c: Ligne) => {
        const cree = { ...c, id: id(100 + crees.length), identifier: `DEM-${crees.length + 1}`, parentId: null, createdAt: T0, updatedAt: T0 };
        crees.push(cree);
        issues.set(cree.id, cree);
        return cree;
      },
    },
  } as unknown as PluginContext;
  const base = {
    listerPortes: async () => o.portes ?? [],
    etatBaseClients: async () => ({ dernierImport: null, clients: o.clients ?? 12, actifs: o.clients ?? 12 }),
    marques: async () => o.marques ?? [{ informationsManquantes: [] }],
    journaliser: async (e: Ligne) => void journal.push(e),
  } as unknown as BaseAtelier;
  const deps: DependancesAccueil = {
    ctx,
    base,
    statutTache: async (_c, issue) => ({ statut: o.statuts?.[issue.id] ?? "ready", motif: "MESSAGE TECHNIQUE DE L'HOTE" }),
    passerelleConnectee: async () => o.passerelle ?? true,
    documentsARevoir: async () => o.documents ?? [],
  };
  const routes = routesAccueil(deps);
  const appeler = (cle: "accueil.lister" | "equipe.demander" | "mission.suivre", r: Partial<RequeteRoute> = {}) =>
    routes[cle]!({ cle, params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  return { appeler, crees, journal, issues, reveils, avertissements };
}

const tache = (n: number, o: Ligne = {}) => ({
  id: id(n), companyId: SOC, identifier: `DEM-${n}`, title: `Tâche ${n}`, status: "todo", parentId: null, assigneeAgentId: null,
  originKind: null, createdAt: new Date(T0.getTime() + n * 1000), updatedAt: new Date(T0.getTime() + n * 1000), ...o,
});

describe("fonctions pures de l'accueil", () => {
  it("trie par urgence, puis par type, puis par titre", () => {
    const e = (idE: string, urgence: ElementAccueil["urgence"], type: ElementAccueil["type"], titre: string): ElementAccueil =>
      ({ id: idE, urgence, type, titre, raison: "r", lien: "/x", action: "a" });
    const tri = trierElements([
      e("1", "basse", "information_manquante", "A"),
      e("2", "haute", "tache_bloquee", "B"),
      e("3", "haute", "contenu_a_valider", "Z"),
      e("4", "moyenne", "document_a_revoir", "C"),
      e("5", "haute", "contenu_a_valider", "A"),
    ]);
    expect(tri.map((x) => x.id)).toEqual(["5", "3", "2", "4", "1"]);
  });

  it("déduit un titre des premiers mots et résume à 200 caractères", () => {
    expect(titreDepuisTexte("Prépare un post LinkedIn sur notre nouvelle offre de toiture pour la rentrée")).toBe("Prépare un post LinkedIn sur notre nouvelle offre…");
    expect(titreDepuisTexte("  Court   texte ")).toBe("Court texte");
    expect(resumer("a ".repeat(300)).length).toBeLessThanOrEqual(200);
    expect(resumer("a ".repeat(300)).endsWith("…")).toBe(true);
    expect(resumer("  un\n\n  deux  ")).toBe("un deux");
  });

  it("n'a de raison que pour les statuts bloquants, jamais le motif technique", () => {
    expect(raisonTacheBloquee("running", { status: "in_progress" })).toBeNull();
    expect(raisonTacheBloquee("blocked_budget", { status: "blocked" })?.raison).toContain("budget");
    expect(raisonTacheBloquee("blocked_information", { status: "done" })?.raison).toContain("approbation");
  });
});

describe("accueil.lister", () => {
  it("rassemble toutes les sources, triées par urgence, avec des raisons en français", async () => {
    const f = faux({
      issues: [
        tache(10, { status: "in_review", title: "Page toiture" }),
        tache(11, { status: "blocked", title: "Rapport mensuel" }),
        tache(12, { status: "blocked", title: "Post budget" }),
      ],
      portes: [{ issueId: id(10), actif: true }],
      statuts: { [id(10)]: "ready_for_human", [id(11)]: "blocked_dependency", [id(12)]: "blocked_budget" },
      approbations: [
        { id: "ap-1", type: "hire_agent", payload: { name: "Agent SEO" } },
        { id: "ap-2", type: "budget_override_required", payload: {} },
      ],
      documents: [{ id: "doc-1", titre: "Tarifs 2025" }],
      clients: 0,
      passerelle: false,
      marques: [{ informationsManquantes: ["horaires", "zone"] }],
    });
    const { corps } = await f.appeler("accueil.lister");
    const { elements } = corps as { elements: ElementAccueil[] };
    expect(elements.map((e) => e.type)).toEqual([
      "contenu_a_valider", "approbation", "tache_bloquee", "tache_bloquee", "demande_acces", "document_a_revoir",
      "information_manquante", "information_manquante", "information_manquante",
    ]);
    const urgences = elements.map((e) => e.urgence);
    expect(urgences).toEqual([...urgences].sort((a, b) => ["haute", "moyenne", "basse"].indexOf(a) - ["haute", "moyenne", "basse"].indexOf(b)));
    expect(elements[0]).toMatchObject({ titre: "Page toiture", lien: `/atelier/contenus/${id(10)}`, action: "Relire et décider" });
    expect(elements.find((e) => e.id === `tache:${id(11)}`)?.raison).toBe("Elle attend qu'une autre tâche soit terminée.");
    expect(elements.find((e) => e.id === `tache:${id(12)}`)?.lien).toBe("/issues/DEM-12");
    expect(elements.find((e) => e.type === "demande_acces")).toMatchObject({ lien: "/approvals/ap-1", titre: expect.stringContaining("Agent SEO") });
    expect(elements.find((e) => e.id === "manque:marque")?.raison).toContain("horaires, zone");
    // Aucun message technique de l'hôte n'est recopié.
    expect(JSON.stringify(elements)).not.toContain("MESSAGE TECHNIQUE");
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
  });

  it("état vide : rien à décider", async () => {
    const f = faux();
    const { corps } = await f.appeler("accueil.lister");
    expect(corps).toMatchObject({ elements: [], missions: [] });
  });

  it("une source en panne ne fait pas échouer l'accueil", async () => {
    // Les approbations lèvent : le reste de la liste est quand même servi.
    const routes = routesAccueil({
      ctx: { logger: { warn() {} }, approvals: { list: async () => { throw new Error("hôte indisponible"); } }, issues: { get: async () => null, list: async () => [] }, agents: { list: async () => [] } } as unknown as PluginContext,
      base: { listerPortes: async () => [], etatBaseClients: async () => ({ clients: 0 }), marques: async () => [{ informationsManquantes: [] }] } as unknown as BaseAtelier,
      statutTache: async () => ({ statut: "ready", motif: "" }),
      passerelleConnectee: async () => true,
      documentsARevoir: async () => [],
    });
    const res = await routes["accueil.lister"]!({ cle: "accueil.lister", params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: SOC });
    expect((res.corps as { elements: ElementAccueil[] }).elements.map((e) => e.id)).toEqual(["manque:base-clients"]);
  });

  it("donne à chaque mission son projet, son statut en français et un lien vers le plan quand il existe", async () => {
    const f = faux({
      issues: [
        tache(20, { status: "in_progress", title: "Avec plan", originKind: ORIGINE_DEMANDE, projectId: id(500) }),
        tache(21, { status: "todo", title: "Sans plan", originKind: ORIGINE_DEMANDE, projectId: null }),
      ],
      projets: { [id(500)]: { id: id(500), name: "Campagne de printemps" } },
      avecPlan: [id(20)],
    });
    const { corps } = await f.appeler("accueil.lister");
    const missions = (corps as { missions: Array<Record<string, unknown>> }).missions;
    const avec = missions.find((m) => m.titre === "Avec plan")!;
    expect(avec).toMatchObject({ projet: { id: id(500), nom: "Campagne de printemps" }, statutLibelle: "En cours", aPlan: true, lienPlan: "/issues/DEM-20#document-plan" });
    const sans = missions.find((m) => m.titre === "Sans plan")!;
    expect(sans).toMatchObject({ projet: null, statutLibelle: "À faire", aPlan: false, lienPlan: null });
  });

  it("liste les missions en cours (demandes non terminées), la plus récente d'abord", async () => {
    const f = faux({
      issues: [
        tache(20, { originKind: ORIGINE_DEMANDE, status: "in_progress", title: "Ancienne" }),
        tache(21, { originKind: ORIGINE_DEMANDE, status: "done", title: "Finie" }),
        tache(22, { originKind: ORIGINE_DEMANDE, status: "todo", title: "Récente" }),
      ],
    });
    const { corps } = await f.appeler("accueil.lister");
    expect((corps as { missions: Array<{ titre: string; statutLibelle: string }> }).missions.map((m) => [m.titre, m.statutLibelle])).toEqual([["Récente", "À faire"], ["Ancienne", "En cours"]]);
  });

  it("refuse un agent (403)", async () => {
    const f = faux();
    const err = await f.appeler("accueil.lister", { acteur: AGENT }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErreurAtelier);
    expect((err as ErreurAtelier).statut).toBe(403);
  });
});

describe("equipe.demander", () => {
  const corps = (texte: string, plus: Ligne = {}) => ({ companyId: SOC, texte, ...plus });

  it("crée une tâche assignée au Coordinateur (rôle ceo) et rend identifiant et lien", async () => {
    const f = faux({ agents: [{ id: id(2), companyId: SOC, name: "Veille", role: "researcher", status: "idle" }, { id: COORD, companyId: SOC, name: "Chef", role: "ceo", status: "idle" }] });
    const res = await f.appeler("equipe.demander", { corps: corps("Prépare un post LinkedIn sur notre nouvelle offre de toiture pour la rentrée") });
    expect(res.statut).toBe(201);
    expect(res.corps).toEqual({ issueId: id(100), identifiant: "DEM-1", lien: "/issues/DEM-1" });
    expect(f.crees[0]).toMatchObject({
      companyId: SOC, assigneeAgentId: COORD, status: "todo", originKind: ORIGINE_DEMANDE,
      title: "Prépare un post LinkedIn sur notre nouvelle offre…",
      description: "Prépare un post LinkedIn sur notre nouvelle offre de toiture pour la rentrée",
    });
    expect(f.journal[0]).toMatchObject({ type: "equipe.demande", issueId: id(100), acteur: "local-board" });
  });

  it("réveille le Coordinateur une seule fois, avec la clé d'idempotence de la demande", async () => {
    const f = faux();
    const res = await f.appeler("equipe.demander", { corps: corps("Prépare un post") });
    expect(f.reveils).toHaveLength(1);
    expect(f.reveils[0]).toMatchObject({ issueId: id(100), companyId: SOC, options: { idempotencyKey: `atelier-demande-${id(100)}` } });
    expect((res.corps as Ligne).issueId).toBe(id(100));
  });

  it("un réveil en échec ne fait pas échouer la demande : tâche créée, échec journalisé", async () => {
    const f = faux({ echecReveil: "hôte indisponible" });
    const res = await f.appeler("equipe.demander", { corps: corps("Prépare un post") });
    expect(res.statut).toBe(201);
    expect(f.crees).toHaveLength(1);
    expect(f.reveils).toHaveLength(1);
    expect(f.avertissements[0]?.meta).toMatchObject({ issueId: id(100), erreur: "hôte indisponible" });
    expect(f.journal[0]?.donnees).toMatchObject({ erreurReveil: "hôte indisponible" });
  });

  it("à défaut de rôle ceo, prend le premier agent dont le nom commence par « Coordinateur » ; titre fourni respecté", async () => {
    const f = faux({ agents: [{ id: id(2), companyId: SOC, name: "Veille", role: "researcher", status: "idle" }, { id: id(3), companyId: SOC, name: "Coordinateur adjoint", role: "pm", status: "idle" }] });
    await f.appeler("equipe.demander", { corps: corps("Texte", { titre: "Mon titre" }) });
    expect(f.crees[0]).toMatchObject({ assigneeAgentId: id(3), title: "Mon titre" });
  });

  it("refuse : aucun coordinateur, texte vide, autre entreprise, agent", async () => {
    const sansCoord = faux({ agents: [{ id: id(2), companyId: SOC, name: "Veille", role: "researcher", status: "idle" }] });
    expect(((await sansCoord.appeler("equipe.demander", { corps: corps("x") }).catch((e: unknown) => e)) as ErreurAtelier).statut).toBe(404);
    const f = faux();
    expect(((await f.appeler("equipe.demander", { corps: corps("   ") }).catch((e: unknown) => e)) as ErreurAtelier).statut).toBe(400);
    expect(((await f.appeler("equipe.demander", { corps: { companyId: id(77), texte: "x" } }).catch((e: unknown) => e)) as ErreurAtelier).statut).toBe(404);
    const refus = (await f.appeler("equipe.demander", { corps: corps("x"), acteur: AGENT }).catch((e: unknown) => e)) as ErreurAtelier;
    expect(refus.statut).toBe(403);
    expect(f.crees).toHaveLength(0);
  });
});

describe("mission.suivre", () => {
  it("rend la mère puis ses sous-tâches avec agent, statut et dernier commentaire résumé", async () => {
    const long = `${"Très long compte rendu. ".repeat(30)}`;
    const f = faux({
      agents: [{ id: COORD, companyId: SOC, name: "Coordinateur", role: "ceo", status: "idle" }, { id: id(2), companyId: SOC, name: "Contenus", role: "general", status: "idle" }],
      issues: [
        tache(30, { title: "Mère", status: "in_progress", assigneeAgentId: COORD }),
        tache(31, { title: "Fille A", status: "in_review", parentId: id(30), assigneeAgentId: id(2) }),
        tache(32, { title: "Fille B", status: "todo", parentId: id(30) }),
        tache(33, { title: "Petite-fille", status: "done", parentId: id(31), assigneeAgentId: id(2) }),
        tache(34, { title: "Autre mission", status: "todo" }),
      ],
      commentaires: {
        [id(31)]: [
          { id: "c1", body: "premier", createdAt: new Date("2026-10-15T10:00:00Z") },
          { id: "c2", body: long, createdAt: new Date("2026-10-15T11:00:00Z") },
        ],
      },
    });
    const res = await f.appeler("mission.suivre", { params: { issueId: id(30) } });
    const { mere, sousTaches } = res.corps as { mere: Ligne; sousTaches: Ligne[] };
    expect(mere).toMatchObject({ titre: "Mère", statutLibelle: "En cours", agent: { nom: "Coordinateur" }, profondeur: 0, dernierCommentaire: null });
    expect(sousTaches.map((s) => [s.titre, s.profondeur, s.statutLibelle])).toEqual([["Fille A", 1, "En relecture"], ["Fille B", 1, "À faire"], ["Petite-fille", 2, "Terminée"]]);
    expect(sousTaches[0]!.agent).toEqual({ id: id(2), nom: "Contenus" });
    expect(sousTaches[0]!.dernierCommentaire.resume.length).toBeLessThanOrEqual(200);
    expect(sousTaches[0]!.dernierCommentaire.resume.startsWith("Très long compte rendu.")).toBe(true);
    expect(sousTaches[1]!.agent).toBeNull();
  });

  it("404 si la tâche n'existe pas dans l'entreprise, 403 pour un agent", async () => {
    const f = faux({ issues: [tache(40)] });
    expect(((await f.appeler("mission.suivre", { params: { issueId: id(99) } }).catch((e: unknown) => e)) as ErreurAtelier).statut).toBe(404);
    expect(((await f.appeler("mission.suivre", { params: { issueId: id(40) }, acteur: AGENT }).catch((e: unknown) => e)) as ErreurAtelier).statut).toBe(403);
  });
});

describe("aiguillage réel", () => {
  it("déclare les trois routes (humain seulement) et les sert à travers creerServices", async () => {
    for (const cle of ["accueil.lister", "equipe.demander", "mission.suivre"]) {
      expect(ROUTES_API.find((r) => r.cle === cle)?.auth).toBe("board");
    }
    const b = creerBanc();
    const hote = b.ctx as unknown as { agents: { list: unknown }; approvals: unknown };
    hote.agents.list = async () => [{ id: COORD, companyId: SOC, name: "Coordinateur", role: "ceo", status: "idle" }];
    hote.approvals = { list: async () => [] };
    const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base: b.base }));
    const humain = { actorType: "user", actorId: "local-board", userId: "local-board" };
    const agent = { actorType: "agent", actorId: id(900), agentId: id(900), runId: "r" };
    const appel = (routeKey: string, method: string, path: string, actor: unknown, extra: Ligne = {}) =>
      aiguillage.traiterRequeteApi({ routeKey, method, path, params: {}, query: {}, body: null, actor, companyId: SOC, headers: {}, ...extra } as never);

    const demande = await appel("equipe.demander", "POST", "/equipe/demande", humain, { body: { companyId: SOC, texte: "Un post sur l'offre de printemps" } });
    expect(demande.status).toBe(201);
    expect((b.issues.get((demande.body as { issueId: string }).issueId) as Ligne).assigneeAgentId).toBe(COORD);

    const accueil = await appel("accueil.lister", "GET", "/accueil", humain, { query: { companyId: SOC } });
    expect(accueil.status).toBe(200);
    expect(accueil.body).toHaveProperty("elements");
    expect((accueil.body as { missions: Ligne[] }).missions).toHaveLength(1);

    expect((await appel("accueil.lister", "GET", "/accueil", agent, { query: { companyId: SOC } })).status).toBe(403);
    expect((await appel("equipe.demander", "POST", "/equipe/demande", agent, { body: { companyId: SOC, texte: "x" } })).status).toBe(403);
    const suivi = await appel("mission.suivre", "GET", "/missions/x", humain, { params: { issueId: (demande.body as { issueId: string }).issueId } });
    expect(suivi.status).toBe(200);
    expect((suivi.body as { mere: Ligne }).mere.titre).toBe("Un post sur l'offre de printemps");
  });
});
