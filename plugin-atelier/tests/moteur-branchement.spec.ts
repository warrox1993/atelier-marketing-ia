/**
 * Branchement du moteur de missions (#49) : réglage d'activation, abonné `issue.updated`, pagination des entreprises,
 * minuterie (démarrage unique, arrêt, passes qui se chevauchent) et dépendances de la porte.
 * Seam : faux `ctx` minimal (base SQL, hôte, événements et journal comptés), horloge simulée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { ESPACE_BASE } from "../src/contrats/index.js";
import { brancherMoteur, depsPorte } from "../src/moteur/branchement.js";
import { PorteRefusee } from "../src/moteur/gabarits.js";
import { STATUT_PROJETE } from "../src/moteur/transitions.js";
import { VEILLEUR } from "../src/serveur/veilleur.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const ISSUE = "22222222-2222-4222-8222-222222222222";
const MISSION = "mission-1";

type Gestionnaire = (event: Record<string, unknown>) => Promise<void>;

function fauxCtx(options: { config?: Record<string, Record<string, unknown> | null>; entreprises?: (offset: number) => Promise<Array<{ id: string }>> } = {}) {
  const gestionnaires: Gestionnaire[] = [];
  const ctx = {
    db: { namespace: ESPACE_BASE, query: vi.fn(async () => []), execute: vi.fn(async () => ({ rowCount: 0 })) },
    config: { get: vi.fn(async (companyId: string) => options.config?.[companyId] ?? null) },
    companies: { list: vi.fn(async ({ offset }: { offset: number }) => (options.entreprises ? options.entreprises(offset) : [])) },
    agents: { list: vi.fn(async () => []) },
    issues: { create: vi.fn(), list: vi.fn(async () => []), update: vi.fn(async () => ({})), requestWakeup: vi.fn() },
    events: { on: vi.fn((_nom: string, fn: Gestionnaire) => void gestionnaires.push(fn)) },
    tools: { register: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
  return { ctx, gestionnaires, pc: ctx as unknown as PluginContext };
}

const evenementDone = (to: unknown = "done") => ({ entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { changes: { status: { to } } } });
const vider = async () => { for (let i = 0; i < 2000; i++) await Promise.resolve(); };

/** Base du moteur réduite à ce que `surDoneNatif` lit et écrit : une étape à venir d'une mission prête. */
function baseEtape() {
  return {
    etapeParIssue: vi.fn(async () => ({ missionId: MISSION, rang: 1, etat: "en_attente", sortie: null })),
    lireMission: vi.fn(async () => ({ id: MISSION, companyId: SOC, etat: "prete", rangCourant: 1 })),
    journaliser: vi.fn(async () => undefined),
  } as never;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("abonné issue.updated", () => {
  it.each([["absent", {}], ["faux", { [SOC]: { moteurMissions: false } }]])("réglage moteurMissions %s : aucune requête ni mise à jour", async (_nom, config) => {
    const { ctx, gestionnaires, pc } = fauxCtx({ config });
    brancherMoteur(pc).demarrer();
    await gestionnaires[0]!(evenementDone());
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.db.execute).not.toHaveBeenCalled();
    expect(ctx.issues.update).not.toHaveBeenCalled();
  });

  it("réglage vrai : un done sur une tâche d'étape remet son statut projeté", async () => {
    const { ctx, gestionnaires, pc } = fauxCtx({ config: { [SOC]: { moteurMissions: true } } });
    brancherMoteur(pc, baseEtape()).demarrer();
    await gestionnaires[0]!(evenementDone());
    expect(ctx.issues.update).toHaveBeenCalledWith(ISSUE, { status: STATUT_PROJETE.prete }, SOC);
  });

  it("réglage vrai : un événement sans passage à done ne fait rien", async () => {
    const { ctx, gestionnaires, pc } = fauxCtx({ config: { [SOC]: { moteurMissions: true } } });
    brancherMoteur(pc, baseEtape()).demarrer();
    await gestionnaires[0]!(evenementDone("in_progress"));
    await gestionnaires[0]!({ entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { changes: {} } });
    await gestionnaires[0]!({ entityId: ISSUE, entityType: "issue", companyId: SOC, payload: null });
    expect(ctx.issues.update).not.toHaveBeenCalled();
  });
});

describe("abonné issue.updated : refus humain à l'approbation", () => {
  const natif = { updatedAt: new Date(0), executionState: { status: "changes_requested", lastDecisionOutcome: "changes_requested", lastDecisionId: "decision-1", completedStageIds: [] } };
  /** Mission en attente d'autorisation : base réduite à ce que lit et écrit `changementsNatifs`. */
  function baseAutorisation() {
    const m = { id: MISSION, companyId: SOC, etat: "attente_autorisation", rangCourant: 1 };
    const cles = new Map<string, string>();
    return {
      m, cles,
      base: {
        etapeParIssue: vi.fn(async () => ({ id: "etape-1", missionId: MISSION, rang: 1, tentative: 1, etat: "terminee", sortie: {} })),
        lireMission: vi.fn(async () => ({ ...m })),
        changerEtatMission: vi.fn(async (_c: string, _i: string, _a: string, nouveau: string) => { m.etat = nouveau; return true; }),
        majEtape: vi.fn(async () => true),
        enregistrerExecution: vi.fn(async (e: { cle: string }) => (cles.has(e.cle) ? false : (cles.set(e.cle, "demandee"), true))),
        marquerExecution: vi.fn(async (_c: string, cle: string, statut: string) => void cles.set(cle, statut)),
        lireExecution: vi.fn(async (_c: string, cle: string) => (cles.has(cle) ? { statut: cles.get(cle) } : null)),
        journaliser: vi.fn(async () => undefined),
      } as never,
    };
  }

  it("une mise à jour sans passage à done est lue dans l'état natif : la mission repart en cours, le rejeu ne fait rien", async () => {
    const { ctx, gestionnaires, pc } = fauxCtx({ config: { [SOC]: { moteurMissions: true } } });
    (ctx.issues as Record<string, unknown>).get = vi.fn(async () => natif);
    const { m, base } = baseAutorisation();
    brancherMoteur(pc, base).demarrer();
    await gestionnaires[0]!({ entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { changes: { status: { to: "in_progress" } } } });
    expect(m.etat).toBe("en_cours");
    await gestionnaires[0]!({ entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { changes: { status: { to: "in_progress" } } } });
    expect((base as unknown as { changerEtatMission: { mock: { calls: unknown[] } } }).changerEtatMission.mock.calls).toHaveLength(1);
    expect(ctx.issues.requestWakeup).not.toHaveBeenCalled();
  });

  it("réglage désactivé : aucune lecture de l'état natif", async () => {
    const { ctx, gestionnaires, pc } = fauxCtx({ config: { [SOC]: { moteurMissions: false } } });
    (ctx.issues as Record<string, unknown>).get = vi.fn(async () => natif);
    const { m, base } = baseAutorisation();
    brancherMoteur(pc, base).demarrer();
    await gestionnaires[0]!({ entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { changes: { status: { to: "in_progress" } } } });
    expect(m.etat).toBe("attente_autorisation");
    expect((ctx.issues as unknown as { get: { mock: { calls: unknown[] } } }).get.mock.calls).toHaveLength(0);
  });
});

describe("outils du moteur", () => {
  const NOMS = ["decision_demander", "livrable_deposer", "mission_etat", "sources_lister", "verdict_deposer"];
  const run = { agentId: "agent-1", runId: "run-1", companyId: SOC, projectId: "projet" };

  it.each([["absent", {}], ["faux", { [SOC]: { moteurMissions: false } }]])("enregistrés à la construction, moteur %s : chaque appel refuse sans execute ni issues.update", async (_nom, config) => {
    const { ctx, pc } = fauxCtx({ config });
    brancherMoteur(pc);
    const enregistres = ctx.tools.register.mock.calls as unknown as Array<[string, unknown, (p: unknown, r: typeof run) => Promise<{ data?: { code?: string } }>]>;
    expect(enregistres.map((c) => c[0]).sort()).toEqual(NOMS);
    for (const [, , appel] of enregistres) expect((await appel({}, run)).data?.code).toBe("moteur_desactive");
    expect(ctx.db.execute).not.toHaveBeenCalled();
    expect(ctx.issues.update).not.toHaveBeenCalled();
  });
});

describe("route mission.lancer sur le vrai branchement", () => {
  const MISSION_ID = "33333333-3333-4333-8333-333333333333";
  const mission = { id: MISSION_ID, companyId: SOC, gabaritCle: "wf-c-contenu", gabaritVersion: 1, etat: "attente_information", issueRacineId: ISSUE };
  const corps = { companyId: SOC, missionId: MISSION_ID, campagneId: "campagne-1", entrees: { canal: "linkedin", cible: "PME", objectif: "Notoriété", sources: ["https://exemple.fr"], typeLivrable: "post" } };
  const requete = { cle: "mission.lancer", params: {}, query: {}, corps, acteur: { type: "humain", id: "jb", agentId: null, userId: "jb", runId: null }, companyId: SOC } as never;
  const carte = (status: string) => ({ kind: "request_confirmation", status, resolvedByUserId: "jb", payload: { detailsMarkdown: `Brouillon\n\nMission : ${MISSION_ID}\nDemande : un post` } });
  const monter = (status: string, base: Record<string, unknown> = {}) => {
    const f = fauxCtx({ config: { [SOC]: { moteurMissions: true } } });
    (f.ctx.issues as Record<string, unknown>).listInteractions = vi.fn(async () => [carte(status)]);
    const routes: Record<string, (r: never) => Promise<unknown>> = {};
    const fausseBase = { lireMission: vi.fn(async () => mission), lireCampagne: vi.fn(async () => ({ id: "campagne-1" })), rattacherCampagneMission: vi.fn(async () => true), ...base };
    brancherMoteur(f.pc, fausseBase as never, routes as never);
    return { ...f, routes, fausseBase };
  };

  it("enregistre la route sur les routes du plugin fournies au branchement", () => {
    const { routes } = monter("accepted");
    expect(Object.keys(routes)).toEqual(["mission.lancer"]);
  });

  it("carte en attente : refus elevation_refusee, la campagne n'est pas rattachée", async () => {
    const { routes, fausseBase } = monter("pending");
    await expect(routes["mission.lancer"]!(requete)).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(fausseBase.rattacherCampagneMission).not.toHaveBeenCalled();
  });

  it("carte acceptée : la campagne est rattachée puis l'exécuteur du branchement prend la main", async () => {
    const { routes, fausseBase } = monter("accepted", { enregistrerExecution: vi.fn(async () => { throw new Error("EXECUTEUR_ATTEINT"); }) });
    await expect(routes["mission.lancer"]!(requete)).rejects.toThrow("EXECUTEUR_ATTEINT");
    expect(fausseBase.rattacherCampagneMission).toHaveBeenCalledWith(SOC, MISSION_ID, "campagne-1");
  });

  it("moteur désactivé : refus acces_refuse avant toute lecture de mission", async () => {
    const f = fauxCtx({ config: { [SOC]: { moteurMissions: false } } });
    const routes: Record<string, (r: never) => Promise<unknown>> = {};
    const lireMission = vi.fn();
    brancherMoteur(f.pc, { lireMission } as never, routes as never);
    await expect(routes["mission.lancer"]!(requete)).rejects.toMatchObject({ code: "acces_refuse" });
    expect(lireMission).not.toHaveBeenCalled();
  });
});

describe("passe de reprise", () => {
  it("pagine companies.list (100 puis 1) et consulte le réglage de chaque entreprise", async () => {
    const page = (n: number, debut: number) => Array.from({ length: n }, (_v, i) => ({ id: `ent-${debut + i}` }));
    const { ctx, pc } = fauxCtx({ entreprises: async (offset) => (offset === 0 ? page(100, 0) : page(1, 100)) });
    brancherMoteur(pc).demarrer();
    await vider();
    expect(ctx.companies.list.mock.calls.map(([a]) => a)).toEqual([{ limit: 100, offset: 0 }, { limit: 100, offset: 100 }]);
    expect(ctx.config.get).toHaveBeenCalledTimes(101);
    expect(ctx.config.get).toHaveBeenLastCalledWith("ent-100");
  });

  it("arreter coupe la minuterie, et deux demarrer n'en créent qu'une", async () => {
    const { ctx, pc } = fauxCtx();
    const moteur = brancherMoteur(pc);
    moteur.demarrer();
    moteur.demarrer();
    expect(vi.getTimerCount()).toBe(1);
    expect(ctx.events.on).toHaveBeenCalledTimes(1);
    await vider();
    expect(ctx.companies.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(VEILLEUR.intervalleMs);
    expect(ctx.companies.list).toHaveBeenCalledTimes(2);
    moteur.arreter();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(VEILLEUR.intervalleMs * 3);
    expect(ctx.companies.list).toHaveBeenCalledTimes(2);
  });

  it("une passe qui chevauche la précédente ne fait rien", async () => {
    let liberer: (v: Array<{ id: string }>) => void = () => undefined;
    const { ctx, pc } = fauxCtx({ entreprises: () => new Promise((resoudre) => { liberer = resoudre; }) });
    brancherMoteur(pc).demarrer();
    await vi.advanceTimersByTimeAsync(VEILLEUR.intervalleMs);
    expect(ctx.companies.list).toHaveBeenCalledTimes(1);
    liberer([]);
    await vider();
    await vi.advanceTimersByTimeAsync(VEILLEUR.intervalleMs);
    expect(ctx.companies.list).toHaveBeenCalledTimes(2);
  });

  it("après une passe en échec, la suivante repart", async () => {
    const { ctx, pc } = fauxCtx({ entreprises: async () => { throw new Error("hôte indisponible"); } });
    ctx.logger.warn.mockImplementationOnce(() => { throw new Error("journal en panne"); });
    brancherMoteur(pc).demarrer();
    await vider();
    expect(ctx.logger.warn).toHaveBeenLastCalledWith("Moteur de missions : passe en échec", { erreur: "journal en panne" });
    await vi.advanceTimersByTimeAsync(VEILLEUR.intervalleMs);
    expect(ctx.companies.list).toHaveBeenCalledTimes(2);
  });
});

describe("depsPorte", () => {
  const modeAvant = process.env["PAPERCLIP_DEPLOYMENT_MODE"];
  afterEach(() => {
    if (modeAvant === undefined) delete process.env["PAPERCLIP_DEPLOYMENT_MODE"];
    else process.env["PAPERCLIP_DEPLOYMENT_MODE"] = modeAvant;
  });
  const base = {} as never;

  it("mode authenticated sans humainDestinataire : refus définitif PorteRefusee", async () => {
    process.env["PAPERCLIP_DEPLOYMENT_MODE"] = "authenticated";
    const { pc } = fauxCtx();
    await expect(depsPorte(pc, base).resolveur(SOC)).rejects.toBeInstanceOf(PorteRefusee);
  });

  it("mode authenticated avec humainDestinataire valide : résolveur de l'humain", async () => {
    process.env["PAPERCLIP_DEPLOYMENT_MODE"] = "authenticated";
    const { pc } = fauxCtx({ config: { [SOC]: { humainDestinataire: "jean-baptiste" } } });
    const resoudre = await depsPorte(pc, base).resolveur(SOC);
    expect(resoudre({ a: "{{humain:responsable}}" })).toEqual({ a: "jean-baptiste" });
  });

  it("hors mode authenticated : retombe sur local-board", async () => {
    delete process.env["PAPERCLIP_DEPLOYMENT_MODE"];
    const { pc } = fauxCtx();
    const resoudre = await depsPorte(pc, base).resolveur(SOC);
    expect(resoudre("{{humain:responsable}}")).toBe("local-board");
  });

  it.each([
    ["des modules de conformité", [{ modulesConformite: ["sante"] }], true],
    ["aucun module", [{ modulesConformite: [] }], false],
    ["aucune fiche", [], false],
  ])("conformiteImposee : fiche avec %s", async (_nom, marques, attendu) => {
    const { pc } = fauxCtx();
    const deps = depsPorte(pc, { marques: vi.fn(async () => marques) } as never);
    expect(await deps.conformiteImposee(SOC)).toBe(attendu);
  });
});
