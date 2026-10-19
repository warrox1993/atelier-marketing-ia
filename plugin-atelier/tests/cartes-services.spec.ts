/**
 * Route `discussion.cartes-services` : tâches reçues à suivre dans les autres services du client (celles des liaisons nées
 * de la discussion). Faux hôte en mémoire qui APPLIQUE la règle de portée de l'hôte réel (une invocation est limitée à
 * l'entreprise de la route : tout appel `ctx.issues.*` pour une autre entreprise est refusé, comme
 * `requireInvocationCompanyScope` du SDK) ; rien n'est jamais écrit.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { routeCartesServices, TTL_CARTES_SERVICES_MS } from "../src/serveur/liaisons/cartes-services.js";
import type { LiaisonLue } from "../src/serveur/liaisons/lecture-liaisons.js";
import { ORIGINE_DISCUSSION } from "../src/serveur/services-discussion.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DIRECTION = id(1);
const MARKETING = id(2);
const JURIDIQUE = id(3);
const ETRANGER = id(9);
const DISCUSSION = id(10);
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const AGENT: ActeurHote = { type: "agent", id: id(900), agentId: id(900), userId: null, runId: "run-1" };

const liaison = (o: Partial<LiaisonLue>): LiaisonLue => ({
  id: "l1", entrepriseSource: DIRECTION, entrepriseCible: MARKETING, tacheOrigine: DISCUSSION, tacheCible: id(20), serviceSource: "direction", serviceCible: "marketing",
  objet: "Plan", question: "?", extraits: [], statut: "ouverte", creeLe: "2026-10-18T09:00:00Z", reponduLe: null, ...o,
});

function faux(o: { liaisons?: LiaisonLue[]; issues?: Ligne[]; panneListe?: boolean; panneGet?: boolean } = {}) {
  const issues: Ligne[] = [
    { id: DISCUSSION, companyId: DIRECTION, identifier: "DIR-2", title: "Discussion", status: "in_progress", originKind: ORIGINE_DISCUSSION, originId: `discussion:${DIRECTION}`, createdAt: new Date("2026-10-18T08:00:00Z") },
    { id: id(20), companyId: MARKETING, identifier: "MKT-2", title: "Plan de la campagne", status: "in_progress", parentId: null, createdAt: new Date("2026-10-18T09:05:00Z") },
    { id: id(21), companyId: MARKETING, identifier: "MKT-3", title: "Sous-tâche", status: "todo", parentId: id(20), createdAt: new Date("2026-10-18T09:10:00Z") },
    ...(o.issues ?? []),
  ];
  // Entreprise de l'invocation en cours (celle de la route) et journal de TOUS les appels à l'hôte.
  let portee = DIRECTION;
  const appels: Array<{ methode: string; companyId: string }> = [];
  const ecritures: string[] = [];
  /** Même refus que l'hôte réel (`InvocationScopeDeniedError`). */
  const garde = <T>(methode: string, companyId: string, suite: () => T): T => {
    appels.push({ methode, companyId });
    if (companyId !== portee) {
      throw new Error(`Plugin atelier-marketing-ia is not allowed to perform "${methode}": requested company "${companyId}" but the current invocation is scoped to company "${portee}"`);
    }
    return suite();
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    issues: {
      list: async (f: Ligne) => garde("issues.list", f.companyId, () => {
        if (o.panneListe) throw new Error("hôte indisponible");
        return issues.filter((i) => i.companyId === f.companyId && (!f.originKind || i.originKind === f.originKind) && (!f.originId || i.originId === f.originId));
      }),
      get: async (issueId: string, companyId: string) => garde("issues.get", companyId, () => {
        if (o.panneGet) throw new Error("hôte indisponible");
        return issues.find((i) => i.id === issueId && i.companyId === companyId) ?? null;
      }),
      listInteractions: async (_issueId: string, companyId: string) => garde("issues.listInteractions", companyId, () => []),
      update: async () => void ecritures.push("update"),
      createComment: async () => void ecritures.push("commentaire"),
      create: async () => void ecritures.push("create"),
    },
  } as unknown as PluginContext;
  const stock = {
    serviceDeEntreprise: async (c: string) => (c === DIRECTION ? { companyId: DIRECTION, clientMarqueur: "fictive-sa", serviceSlug: "direction", estDirection: true } : c === MARKETING ? { companyId: MARKETING, clientMarqueur: "fictive-sa", serviceSlug: "marketing", estDirection: false } : null),
    servicesDuClient: async (m: string) => (m === "fictive-sa" ? [
      { companyId: DIRECTION, clientMarqueur: m, serviceSlug: "direction", estDirection: true },
      { companyId: MARKETING, clientMarqueur: m, serviceSlug: "marketing", estDirection: false },
      { companyId: JURIDIQUE, clientMarqueur: m, serviceSlug: "juridique", estDirection: false },
    ] : []),
  };
  const lecture = { registre: async () => ({ lignes: o.liaisons ?? [liaison({})], total: 1 }) };
  const routes = routeCartesServices({ ctx, stock, lecture });
  const appeler = (r: Ligne = {}) => {
    portee = r.companyId ?? DIRECTION;
    return routes["discussion.cartes-services"]!({ cle: "discussion.cartes-services", params: {}, query: {}, corps: null, acteur: HUMAIN, companyId: DIRECTION, ...r });
  };
  return { appeler, appels, ecritures, issues, ctx };
}

type Reponse = { taches: Ligne[]; indisponible: boolean };

describe("discussion.cartes-services : route déclarée", () => {
  it("GET réservée à l'humain (auth board)", () => {
    expect(ROUTES_API.find((x) => x.cle === "discussion.cartes-services")).toMatchObject({ methode: "GET", chemin: "/discussion/cartes-services", auth: "board" });
  });
});

describe("le faux hôte applique la règle de portée", () => {
  it("un appel pour une autre entreprise que celle de l'invocation lève l'erreur de l'hôte réel, pour get, list et listInteractions", async () => {
    const f = faux();
    const refus = /is not allowed to perform ".*": requested company ".*" but the current invocation is scoped to company "00000000-0000-4000-8000-000000000001"/;
    await expect(f.ctx.issues.get(id(20), MARKETING)).rejects.toThrow(refus);
    await expect(f.ctx.issues.list({ companyId: MARKETING })).rejects.toThrow(refus);
    await expect(f.ctx.issues.listInteractions(id(20), MARKETING)).rejects.toThrow(refus);
    await expect(f.ctx.issues.get(DISCUSSION, DIRECTION)).resolves.toMatchObject({ id: DISCUSSION });
  });
});

describe("discussion.cartes-services", () => {
  it("rend les tâches reçues à suivre (entreprise, tâche, service) sans lire un seul service : tous les appels à l'hôte restent dans la Direction", async () => {
    const f = faux();
    const { corps } = await f.appeler();
    const r = corps as Reponse;
    expect(r).toEqual({ taches: [{ companyId: MARKETING, tacheId: id(20), slug: "marketing", nom: "Marketing" }], indisponible: false });
    expect(f.appels.length).toBeGreaterThan(0);
    // Aucun appel hors portée : ni tâche, ni liste, ni carte d'une autre entreprise que la Direction.
    expect(f.appels.filter((a) => a.companyId !== DIRECTION)).toEqual([]);
    expect(f.appels.some((a) => a.methode === "issues.listInteractions")).toBe(false);
    expect(f.ecritures).toEqual([]);
  });

  it("ignore une liaison dont la tâche d'origine ne descend pas de la discussion, et suit un descendant", async () => {
    const f = faux({
      issues: [{ id: id(22), companyId: MARKETING, identifier: "MKT-9", title: "Hors discussion", status: "todo", parentId: null }, { id: id(11), companyId: DIRECTION, identifier: "DIR-3", title: "Autre", status: "todo", parentId: null }, { id: id(12), companyId: DIRECTION, identifier: "DIR-4", title: "Sous-demande", status: "todo", parentId: DISCUSSION }],
      liaisons: [liaison({ id: "l-autre", tacheOrigine: id(11), tacheCible: id(22) }), liaison({ id: "l-fille", tacheOrigine: id(12), tacheCible: id(20) })],
    });
    const r = (await f.appeler()).corps as Reponse;
    expect(r.taches.map((t) => t.tacheId)).toEqual([id(20)]);
    expect(f.appels.filter((a) => a.companyId !== DIRECTION)).toEqual([]);
  });

  it("une même tâche reçue par plusieurs liaisons n'est rendue qu'une fois", async () => {
    const f = faux({ liaisons: [liaison({ id: "l1" }), liaison({ id: "l2" })] });
    const r = (await f.appeler()).corps as Reponse;
    expect(r.taches).toHaveLength(1);
  });

  it("ne rend jamais une entreprise hors du client (ni une liaison d'une autre source)", async () => {
    const f = faux({
      issues: [{ id: id(30), companyId: ETRANGER, identifier: "ETR-1", title: "Étranger", status: "todo" }],
      liaisons: [liaison({ id: "l-etr", entrepriseCible: ETRANGER, tacheCible: id(30) }), liaison({ id: "l-src", entrepriseSource: JURIDIQUE })],
    });
    const r = (await f.appeler()).corps as Reponse;
    expect(r.taches).toEqual([]);
    expect(f.appels.filter((a) => a.companyId !== DIRECTION)).toEqual([]);
  });

  it("refuse un agent et toute entreprise autre que la Direction", async () => {
    const f = faux();
    const e1 = (await f.appeler({ acteur: AGENT }).then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
    const e2 = (await f.appeler({ companyId: MARKETING }).then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
    expect(e1?.code).toBe("elevation_refusee");
    expect(e2?.code).toBe("acces_refuse");
    expect(f.appels).toEqual([]);
  });

  it("réutilise la lecture pendant le délai, sauf avec frais=1", async () => {
    const f = faux();
    await f.appeler();
    const n = f.appels.length;
    await f.appeler();
    expect(f.appels.length).toBe(n);
    await f.appeler({ query: { frais: "1" } });
    expect(f.appels.length).toBe(n * 2);
    expect(TTL_CARTES_SERVICES_MS).toBeGreaterThan(0);
  });

  it("une panne de la lecture de la Direction est signalée (indisponible), sans erreur ni mise en cache", async () => {
    const f = faux({ panneListe: true });
    const r = (await f.appeler()).corps as Reponse;
    expect(r).toEqual({ taches: [], indisponible: true });
    const n = f.appels.length;
    await f.appeler();
    expect(f.appels.length).toBeGreaterThan(n);
  });

  it("une tâche d'origine illisible dans la Direction est signalée (indisponible) et n'est pas suivie", async () => {
    const f = faux({
      issues: [{ id: id(12), companyId: DIRECTION, identifier: "DIR-4", title: "Sous-demande", status: "todo", parentId: DISCUSSION }],
      liaisons: [liaison({ id: "l-fille", tacheOrigine: id(12) })],
      panneGet: true,
    });
    const r = (await f.appeler()).corps as Reponse;
    expect(r).toEqual({ taches: [], indisponible: true });
  });

  it("sans discussion ouverte : aucune tâche", async () => {
    const f = faux();
    f.issues.splice(0, 1);
    expect((await f.appeler()).corps).toEqual({ taches: [], indisponible: false });
  });
});
