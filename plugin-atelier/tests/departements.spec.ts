/**
 * Tableau des départements : routes `departements.lister` et `departement.etat` (src/serveur/services-departements.ts).
 *
 * Deux clients fictifs (« fictive-sa » à trois services, « autre-sprl » à deux) et un faux hôte qui APPLIQUE la règle
 * de portée de l'hôte réel (paperclip/packages/plugins/sdk/src/host-client-factory.ts, `requireInvocationCompanyScope`) :
 * pendant une route, tout appel visant une autre entreprise que celle de la requête est refusé. Le tableau ne peut donc
 * lire une case que par un appel portant le companyId de son service ; ces tests empêchent le défaut de repasser.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ROUTES_API, type EtatDepartement, type ReponseDepartements, type ReponseFluxServices } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import type { ServiceEntreprise } from "../src/serveur/liaisons/base-liaisons.js";
import { routesDepartements } from "../src/serveur/services-departements.js";
import manifest from "../src/manifest.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MKT = id(1);
const DIR = id(2);
const JUR = id(3);
const AUTRE_MKT = id(4);
const AUTRE_DIR = id(5);
const ORPHELINE = id(6); // entreprise déclarée dans aucun client
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const FLUX_BRUTS = [
  { client: "fictive-sa", source: "marketing", cible: "juridique", objet: "Relecture d'une mention légale", approbationHumaine: false },
  { client: "fictive-sa", source: "juridique", cible: "direction", objet: "Avis sur un contrat", approbationHumaine: true },
  { client: "autre-sprl", source: "marketing", cible: "direction", objet: "Budget d'une campagne", approbationHumaine: false },
];
const AGENT: ActeurHote = { type: "agent", id: id(11), agentId: id(11), userId: null, runId: "run-1" };

const SERVICES: ServiceEntreprise[] = [
  { companyId: MKT, clientMarqueur: "fictive-sa", serviceSlug: "marketing", estDirection: false },
  { companyId: DIR, clientMarqueur: "fictive-sa", serviceSlug: "direction", estDirection: true },
  { companyId: JUR, clientMarqueur: "fictive-sa", serviceSlug: "juridique", estDirection: false },
  { companyId: AUTRE_MKT, clientMarqueur: "autre-sprl", serviceSlug: "marketing", estDirection: false },
  { companyId: AUTRE_DIR, clientMarqueur: "autre-sprl", serviceSlug: "direction", estDirection: true },
];

function monde(o: { pannes?: string[]; pause?: string | null; aFaire?: Record<string, Array<{ type: string; urgence: string }>> } = {}) {
  const portee = new AsyncLocalStorage<{ companyId: string }>();
  const appels: Array<{ methode: string; companyId: string; portee: string | null }> = [];
  const exigerPortee = (methode: string, companyId: string) => {
    const inv = portee.getStore() ?? null;
    appels.push({ methode, companyId, portee: inv?.companyId ?? null });
    if (!inv) throw new Error(`Plugin is not allowed to perform "${methode}": company context is required`);
    if (inv.companyId !== companyId) throw new Error(`Plugin is not allowed to perform "${methode}": requested company "${companyId}" but the current invocation is scoped to company "${inv.companyId}"`);
    if (o.pannes?.includes(methode)) throw new Error(`${methode} indisponible`);
  };
  const t = (h: number) => new Date(Date.UTC(2026, 9, 17, h));
  const agents: Ligne[] = [
    { id: id(20), companyId: MKT, status: "idle", lastHeartbeatAt: t(8) },
    { id: id(21), companyId: MKT, status: "running", lastHeartbeatAt: t(9) },
    { id: id(22), companyId: MKT, status: "paused", lastHeartbeatAt: null },
    { id: id(23), companyId: MKT, status: "error", lastHeartbeatAt: t(7) },
    { id: id(24), companyId: MKT, status: "terminated", lastHeartbeatAt: t(23) },
    { id: id(30), companyId: AUTRE_MKT, status: "error", lastHeartbeatAt: t(22) },
  ];
  const issues: Ligne[] = [
    { id: id(100), companyId: MKT, status: "in_progress", updatedAt: t(10) },
    { id: id(101), companyId: MKT, status: "in_progress", updatedAt: t(6) },
    { id: id(102), companyId: MKT, status: "blocked", updatedAt: t(5) },
    { id: id(103), companyId: MKT, status: "done", updatedAt: t(21) },
    { id: id(110), companyId: AUTRE_MKT, status: "blocked", updatedAt: t(20) },
  ];
  const aFaire = o.aFaire ?? {
    [MKT]: [{ type: "contenu_a_valider", urgence: "haute" }, { type: "contenu_a_valider", urgence: "moyenne" }, { type: "approbation", urgence: "haute" }, { type: "information_manquante", urgence: "basse" }],
    [AUTRE_MKT]: [{ type: "approbation", urgence: "haute" }],
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    companies: {
      get: async (companyId: string) => {
        exigerPortee("companies.get", companyId);
        return { id: companyId, status: o.pause !== undefined && companyId === MKT ? "paused" : "active", pauseReason: companyId === MKT ? o.pause ?? null : null };
      },
    },
    agents: { list: async (f: Ligne) => (exigerPortee("agents.list", f.companyId), agents.filter((a) => a.companyId === f.companyId)) },
    issues: { list: async (f: Ligne) => (exigerPortee("issues.list", f.companyId), issues.filter((i) => i.companyId === f.companyId && (!f.status || i.status === f.status))) },
  } as unknown as PluginContext;
  const lectures: string[] = [];
  const stock = {
    serviceDeEntreprise: async (c: string) => (lectures.push(`service:${c}`), SERVICES.find((s) => s.companyId === c) ?? null),
    servicesDuClient: async (m: string) => (lectures.push(`client:${m}`), SERVICES.filter((s) => s.clientMarqueur === m)),
    fluxDuClient: async (m: string) => (lectures.push(`flux:${m}`), FLUX_BRUTS.filter((f) => f.client === m).map(({ client: _c, ...f }) => f)),
  };
  const brutes = routesDepartements({
    ctx, stock,
    // Comme `accueil.lister` : lit dans l'entreprise de la requête, sous la même portée.
    aFaire: async (r) => {
      exigerPortee("accueil.lister", r.companyId);
      return aFaire[r.companyId] ?? [];
    },
  });
  const appeler = (cle: "departements.lister" | "departement.etat" | "services.flux", companyId: string, acteur: ActeurHote = HUMAIN) =>
    portee.run({ companyId }, () => brutes[cle]!({ cle, params: {}, query: { companyId }, corps: null, acteur, companyId } satisfies RequeteRoute));
  const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
  return { appeler, appels, lectures, refus, portee, ctx };
}

describe("departements.lister", () => {
  it("rend les services du MÊME client, Direction d'abord, et jamais un service de l'autre client", async () => {
    const m = monde();
    const r = (await m.appeler("departements.lister", MKT)).corps as ReponseDepartements;
    expect(r.client).toBe("fictive-sa");
    expect(r.departements.map((d) => [d.nom, d.estDirection, d.courant])).toEqual([
      ["Direction", true, false],
      ["Juridique", false, false],
      ["Marketing", false, true],
    ]);
    const ids = r.departements.map((d) => d.companyId);
    expect(ids).not.toContain(AUTRE_MKT);
    expect(ids).not.toContain(AUTRE_DIR);
    // Aucune lecture à l'hôte : la liste vient de la seule déclaration du plugin.
    expect(m.appels).toEqual([]);
    const autre = (await m.appeler("departements.lister", AUTRE_DIR)).corps as ReponseDepartements;
    expect(autre.client).toBe("autre-sprl");
    expect(autre.departements.map((d) => d.companyId).sort()).toEqual([AUTRE_DIR, AUTRE_MKT].sort());
  });

  it("une entreprise déclarée dans aucun client reçoit une liste vide", async () => {
    const m = monde();
    expect((await m.appeler("departements.lister", ORPHELINE)).corps).toEqual({ client: null, departements: [] });
  });

  it("est réservée à un humain", async () => {
    const m = monde();
    expect((await m.refus(m.appeler("departements.lister", MKT, AGENT)))?.code).toBe("elevation_refusee");
    expect(m.lectures).toEqual([]);
  });
});

describe("services.flux", () => {
  it("rend les flux du MÊME client seulement, sans aucun appel à l'hôte", async () => {
    const m = monde();
    const r = (await m.appeler("services.flux", MKT)).corps as ReponseFluxServices;
    expect(r.client).toBe("fictive-sa");
    expect(r.flux).toEqual([
      { source: "marketing", cible: "juridique", objet: "Relecture d'une mention légale", approbationHumaine: false },
      { source: "juridique", cible: "direction", objet: "Avis sur un contrat", approbationHumaine: true },
    ]);
    expect(m.lectures).toContain("flux:fictive-sa");
    expect(m.lectures).not.toContain("flux:autre-sprl");
    expect(m.appels).toEqual([]);
    const autre = (await m.appeler("services.flux", AUTRE_MKT)).corps as ReponseFluxServices;
    expect(autre.client).toBe("autre-sprl");
    expect(autre.flux.map((f) => f.objet)).toEqual(["Budget d'une campagne"]);
  });

  it("une entreprise déclarée dans aucun client reçoit une matrice vide, sans lire de flux", async () => {
    const m = monde();
    expect((await m.appeler("services.flux", ORPHELINE)).corps).toEqual({ client: null, flux: [] });
    expect(m.lectures.some((l) => l.startsWith("flux:"))).toBe(false);
  });

  it("est réservée à un humain et ne lit rien pour un agent", async () => {
    const m = monde();
    expect((await m.refus(m.appeler("services.flux", MKT, AGENT)))?.code).toBe("elevation_refusee");
    expect(m.lectures).toEqual([]);
  });
});

describe("departement.etat", () => {
  it("compte agents, tâches et validations dans la seule entreprise de la requête", async () => {
    const m = monde();
    const e = (await m.appeler("departement.etat", MKT)).corps as EtatDepartement;
    expect(e).toMatchObject({ companyId: MKT, slug: "marketing", nom: "Marketing", enPause: false, motifPause: null, tachesTronquees: false });
    expect(e.agents).toEqual({ actifs: 2, enPause: 1, enErreur: 1 });
    expect(e.taches).toEqual({ enCours: 2, bloquees: 1 });
    // Même calcul que la pastille « À faire » : l'élément de basse urgence ne compte pas.
    expect(e.validations).toEqual({ total: 3, parType: { contenu_a_valider: 2, approbation: 1 } });
    // Dernière activité : la tâche en cours mise à jour à 10 h (l'agent supprimé et l'autre client ne comptent pas).
    expect(e.derniereActivite).toBe("2026-10-17T10:00:00.000Z");
    expect(e.alertes).toEqual([
      { niveau: "haute", texte: "1 agent en erreur." },
      { niveau: "moyenne", texte: "1 tâche bloquée." },
    ]);
    expect(m.appels.length).toBeGreaterThan(0);
    expect(m.appels.every((a) => a.companyId === MKT && a.portee === MKT)).toBe(true);
  });

  it("l'autre client a ses propres nombres, sans rien de fictive-sa", async () => {
    const m = monde();
    const e = (await m.appeler("departement.etat", AUTRE_MKT)).corps as EtatDepartement;
    expect(e.agents).toEqual({ actifs: 0, enPause: 0, enErreur: 1 });
    expect(e.taches).toEqual({ enCours: 0, bloquees: 1 });
    expect(e.validations.total).toBe(1);
    expect(m.appels.every((a) => a.companyId === AUTRE_MKT)).toBe(true);
  });

  it("refuse (404) une entreprise qui n'est le service d'aucun client, sans lire l'hôte", async () => {
    const m = monde();
    const err = await m.refus(m.appeler("departement.etat", ORPHELINE));
    expect(err?.code).toBe("introuvable");
    expect(m.appels).toEqual([]);
  });

  it("est réservée à un humain", async () => {
    const m = monde();
    expect((await m.refus(m.appeler("departement.etat", MKT, AGENT)))?.code).toBe("elevation_refusee");
    expect(m.appels).toEqual([]);
  });

  it("signale un service en pause et son motif", async () => {
    const m = monde({ pause: "budget" });
    const e = (await m.appeler("departement.etat", MKT)).corps as EtatDepartement;
    expect(e.enPause).toBe(true);
    expect(e.motifPause).toBe("budget atteint");
    expect(e.alertes[0]).toEqual({ niveau: "haute", texte: "Service en pause : budget atteint." });
  });

  it("une lecture en panne donne une case partielle, signalée, au lieu d'une erreur", async () => {
    const m = monde({ pannes: ["agents.list"] });
    const e = (await m.appeler("departement.etat", MKT)).corps as EtatDepartement;
    expect(e.agents).toEqual({ actifs: 0, enPause: 0, enErreur: 0 });
    expect(e.taches.enCours).toBe(2);
    expect(e.alertes).toContainEqual({ niveau: "moyenne", texte: "Lecture partielle : agents indisponible." });
  });

  it("le faux hôte refuse ce que l'hôte réel refuse : une lecture d'un autre service pendant la route", async () => {
    const m = monde();
    const err = await m.portee.run({ companyId: MKT }, () => m.ctx.agents.list({ companyId: DIR }).then(() => null, (e: Error) => e));
    expect(err?.message).toMatch(/requested company "[0-9a-f-]+" but the current invocation is scoped to company "[0-9a-f-]+"/u);
  });
});

describe("contrat et manifeste", () => {
  it("trois routes GET, humain, entreprise résolue par la requête", () => {
    for (const [cle, chemin] of [["departements.lister", "/departements"], ["departement.etat", "/departements/etat"], ["services.flux", "/services/flux"]] as const) {
      expect(ROUTES_API.find((r) => r.cle === cle)).toMatchObject({ methode: "GET", chemin, auth: "board", resolution: { from: "query", key: "companyId" } });
    }
    expect((manifest.apiRoutes ?? []).map((r) => r.routeKey)).toEqual(expect.arrayContaining(["departements.lister", "departement.etat", "services.flux"]));
  });

  it("n'ajoute aucune capacité au manifeste", () => {
    expect([...manifest.capabilities].sort()).toEqual(
      [
        "companies.read", "projects.read", "issues.read", "issue.relations.read", "issue.comments.read", "issue.documents.read", "issue.interactions.read",
        "agents.read", "approvals.read", "activity.read", "costs.read", "issues.orchestration.read", "issues.create", "issues.update", "issue.comments.create",
        "issues.wakeup", "activity.log.write", "plugin.state.read", "plugin.state.write", "events.subscribe", "api.routes.register", "http.outbound",
        "database.namespace.migrate", "database.namespace.read", "database.namespace.write", "secrets.read-ref", "ui.page.register", "ui.sidebar.register",
        "ui.detailTab.register", "ui.dashboardWidget.register",
      ].sort(),
    );
  });
});
