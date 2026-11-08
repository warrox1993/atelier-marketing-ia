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
