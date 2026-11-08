/**
 * Moteur de missions (#50, tâche 1) : les cinq outils typés (`mission_etat`, `livrable_deposer`, `verdict_deposer`,
 * `decision_demander`, `sources_lister`). Seam : vrai exécuteur, base en mémoire qui rejoue les unicités du SQL, hôte double
 * qui applique les refus du vrai hôte (copie fidèle de `hoteDouble` de moteur-executeur.spec.ts, non exportable).
 */
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";
import { creerExecuteur, type DepsExecuteur } from "../src/moteur/executeur.js";
import { PLUGIN_ID } from "../src/contrats/index.js";
import { chargerGabarit, revuesImposees, type Gabarit } from "../src/moteur/gabarits.js";
import { creerOutilsMoteur, TAILLE_MAX_LIVRABLE_OCTETS, type ErreurOutil } from "../src/moteur/outils.js";
import type { EtapeMission, Mission } from "../src/serveur/base.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const AUTRE = "99999999-9999-4999-8999-999999999999";
const ENTREES = { brief: "brief", charte: "charte", sources: ["https://exemple.fr/a"] };
const SORTIE = { textes: ["un texte"], briefsVisuels: ["un visuel"], sources: ["https://exemple.fr/a"] };
const MISSION = "mission-1";
const ISSUE = "issue-1";
const REDACTEUR = "agent-contenus";
/** Origine des sous-tâches de revue, comme `assurerRevues` (services.ts). */
const ORIGINE_REVUE = `plugin:${PLUGIN_ID}:revue`;

const GABARIT_4: Gabarit = {
  ...chargerGabarit("contenu-reseau-social"),
  porte: false,
  etapes: [1, 2, 3, 4].map((rang) => ({ rang, role: "contenus", competences: [], contratId: "wf-c-contenu", contratVersion: 1 })),
};
const GABARIT_PORTE = chargerGabarit("contenu-reseau-social");
/** Deux revues requises (exigences, métier) : un seul PASS ne suffit pas à franchir la porte. */
const GABARIT_PORTE_2: Gabarit = { ...GABARIT_PORTE, revues: ["exigences", "metier"] };
const REVISION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function baseMemoire() {
  const missions = new Map<string, Mission>();
  const etapes: EtapeMission[] = [];
  const executions = new Map<string, { statut: string }>();
  const journal: Array<{ type: string; donnees?: Record<string, unknown> }> = [];
  const sources: Array<Record<string, unknown>> = [];
  const compteurs = { transitions: 0, majEtape: 0 };
  const base = {
    async creerMission(m: Partial<Mission> & { companyId: string }) {
      missions.set(MISSION, { id: MISSION, gabaritCle: "contenu-reseau-social", gabaritVersion: 1, contratId: "wf-c-contenu", contratVersion: 1, mandat: "mandat", etat: "prete", etatAvantPause: null, rangCourant: 0, enveloppeCents: 0, campagneId: null, issueRacineId: null, creeLe: "", modifieLe: "", ...m } as Mission);
      return MISSION;
    },
    async lireMission(companyId: string, id: string) {
      const m = missions.get(id);
      return m && m.companyId === companyId ? { ...m } : null;
    },
    async missionsActives() { return []; },
    async changerEtatMission(companyId: string, id: string, ancien: string, nouveau: string) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.etat !== ancien) return false;
      m.etat = nouveau as Mission["etat"];
      compteurs.transitions += 1;
      return true;
    },
    async changerRangMission(companyId: string, id: string, ancien: number, nouveau: number) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.rangCourant !== ancien) return false;
      m.rangCourant = nouveau;
      return true;
    },
    async creerEtape(e: { companyId: string; missionId: string; rang: number; role: string; tentative?: number; etat: string; entree?: unknown; issueId?: string | null }) {
      etapes.push({ id: `etape-${etapes.length + 1}`, companyId: e.companyId, missionId: e.missionId, rang: e.rang, role: e.role, tentative: e.tentative ?? 1, etat: e.etat, entree: e.entree ?? null, sortie: null, delaiLe: null, issueId: e.issueId ?? null, revisionLivrable: null, creeLe: "", modifieLe: "" });
      return `etape-${etapes.length}`;
    },
    async lireEtapes(companyId: string, missionId: string) {
      return etapes.filter((e) => e.companyId === companyId && e.missionId === missionId).sort((a, b) => a.rang - b.rang || a.tentative - b.tentative).map((e) => ({ ...e }));
    },
    async majEtape(companyId: string, id: string, c: { etat?: string; sortie?: unknown; issueId?: string | null; revisionLivrable?: string | null }) {
      const e = etapes.find((x) => x.companyId === companyId && x.id === id);
      if (!e) return false;
      compteurs.majEtape += 1;
      Object.assign(e, c);
      return true;
    },
    async etapeParIssue(companyId: string, issueId: string) {
      const e = etapes.find((x) => x.companyId === companyId && x.issueId === issueId);
      return e ? { ...e } : null;
    },
    async enregistrerExecution(e: { companyId: string; cle: string }) {
      const k = `${e.companyId}|${e.cle}`;
      if (executions.has(k)) return false;
      executions.set(k, { statut: "demandee" });
      return true;
    },
    async marquerExecution(companyId: string, cle: string, statut: string) {
      const x = executions.get(`${companyId}|${cle}`);
      if (x) x.statut = statut;
      return Boolean(x);
    },
    async lireExecution(companyId: string, cle: string) { return executions.get(`${companyId}|${cle}`) ?? null; },
    async journaliser(e: { type: string; donnees?: Record<string, unknown> }) { journal.push({ type: e.type, donnees: e.donnees }); },
    async listerSources(_companyId: string, filtre: { campagneId?: string; issueId?: string } = {}) {
      return sources.filter((s) => (filtre.issueId ? s.issueId === filtre.issueId : s.campagneId === filtre.campagneId));
    },
  };
  return { base, missions, etapes, executions, journal, sources, compteurs };
}

function hoteDouble() {
  const issues = new Map<string, Record<string, unknown>>();
  const creations: Array<Record<string, unknown>> = [];
  const majs: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const reveils: Array<{ issueId: string; options: Record<string, unknown> }> = [];
  const cartes: Array<Record<string, unknown>> = [];
  /** Cartes de décision : refus du vrai hôte (plugin-host-services.ts) : tâche hors entreprise, lecture vide ; écriture refusée. */
  const cartesHote = {
    async listInteractions(issueId: string, companyId: string) {
      return issues.get(issueId)?.companyId === companyId ? cartes.filter((c) => c.issueId === issueId) : [];
    },
    async requestConfirmation(issueId: string, interaction: Record<string, unknown>, companyId: string) {
      if (issues.get(issueId)?.companyId !== companyId) throw new Error("Issue not found");
      const carte = { id: `carte-${cartes.length + 1}`, issueId, kind: "request_confirmation", status: "pending", ...interaction };
      cartes.push(carte);
      return carte;
    },
  };
  const hote = {
    issues: {
      async create(i: Record<string, unknown>) {
        const id = `issue-${issues.size + 1}`;
        creations.push(i);
        issues.set(id, { id, ...i });
        return { id };
      },
      /** Comme `issues.list` du vrai hôte : `executionPolicy` et `executionState` rendus à null. */
      async list(f: { originId?: string }) { return [...issues.values()].filter((i) => i.originId === f.originId).map((i) => ({ ...i, executionPolicy: null, executionState: null })); },
      /** Comme `issues.get` : l'objet complet, null hors entreprise. */
      async get(id: string, companyId: string) {
        const i = issues.get(id);
        return i && i.companyId === companyId ? { executionPolicy: null, executionState: null, ...i } : null;
      },
      async update(id: string, patch: Record<string, unknown>) {
        majs.push({ id, patch });
        Object.assign(issues.get(id) ?? {}, patch, { updatedAt: new Date(Date.UTC(2026, 10, 8, 10, 0, majs.length)).toISOString() });
        return {};
      },
      /** Refus du vrai hôte (plugin-host-services.ts, requestWakeup) : sans assigné, statut non réveillable, bloqueur non terminé. */
      async requestWakeup(issueId: string, _companyId: string, options: Record<string, unknown>) {
        const tache = issues.get(issueId);
        if (!tache?.assigneeAgentId) throw new Error("Issue has no assigned agent to wake");
        if (["backlog", "done", "cancelled"].includes(String(tache.status))) throw new Error(`Issue is not wakeable in status: ${String(tache.status)}`);
        const bloqueurs = (tache.blockedByIssueIds as string[] | undefined) ?? [];
        if (bloqueurs.some((b) => issues.get(b)?.status !== "done")) throw new Error("Issue is blocked by unresolved blockers");
        reveils.push({ issueId, options });
        return {};
      },
    },
    async resoudreAgent(_companyId: string, role: string) { return `agent-${role}`; },
  };
  /** Sous-tâche de revue créée comme `assurerRevues` : fille de la tâche d'étape, origine de revue, assignée au relecteur. */
  const creerRevue = (role: string, relecteur: string, parentId = "issue-1", revisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") => {
    const id = `issue-${issues.size + 1}`;
    issues.set(id, { id, companyId: "11111111-1111-4111-8111-111111111111", parentId, originKind: ORIGINE_REVUE, originId: `${parentId}:${revisionId}:${role}`, assigneeAgentId: relecteur, status: "todo" });
    return id;
  };
  return { hote, issues, creations, majs, reveils, cartes, cartesHote, creerRevue };
}

const porte = {
  async creerPorte() { return true; },
  async majPolitique() { return {}; },
  async conformiteImposee() { return false; },
  async exigences() { return ["EXI-1"]; },
  async resolveur() { return <T>(v: T) => v; },
};

const agentDe = (slug: string) => ({ id: `agent-${slug}`, status: "idle", companyId: SOC, metadata: { atelier: { slug } } });
const AGENTS = ["contenus", "autre", "exigences", "relecteur", "coordinateur"].map(agentDe);

/**
 * Route `tache.verdict` du plugin, reprise dans ses refus (services.ts) : livrable existant, rôle désigné, producteur, révision courante.
 * `evaluerPorte` : l'évaluation interne des services, qui ne contrôle pas le rôle ; la route `tache.porte.evaluer` refuse tout agent
 * qui n'est pas le participant de revue native (`exigerEvaluateur`), donc aussi le moteur : un appel par la route échoue.
 * PASS quand chaque revue requise a un PASS.
 */
function routesDouble(gabarit: Gabarit, docs: Map<string, string>) {
  const requises = Object.fromEntries(revuesImposees(gabarit).map((r) => [r.role, `agent-${r.agentId.replace(/^\{\{agent:|\}\}$/gu, "")}`]));
  const verdicts: Array<{ role: string; verdict: string; agentId: string | null; runId: string | null }> = [];
  const appels: Array<{ cle: string; issueId: string | undefined; par?: string }> = [];
  const routes = {
    "tache.verdict": async (r: { params: Record<string, string>; corps: unknown; acteur: { agentId: string | null; runId: string | null } }) => {
      appels.push({ cle: "tache.verdict", issueId: r.params.issueId });
      const v = r.corps as { role: string; verdict: string; revisionId: string };
      const courante = docs.get(r.params.issueId ?? "");
      if (!courante) throw new ErreurAtelier("conflit", "Aucun livrable à relire.");
      if (requises[v.role] !== r.acteur.agentId) throw new ErreurAtelier("role_non_autorise", `Seul le relecteur désigné pour « ${v.role} » dépose ce verdict.`);
      if (r.acteur.agentId === REDACTEUR) throw new ErreurAtelier("producteur_ne_peut_pas_relire", "Le producteur du livrable ne peut pas le relire.");
      if (v.revisionId !== courante) throw new ErreurAtelier("revision_perimee", "Le verdict doit porter sur la révision courante du livrable.");
      if (!verdicts.some((d) => d.role === v.role && d.runId === r.acteur.runId)) verdicts.push({ role: v.role, verdict: v.verdict, agentId: r.acteur.agentId, runId: r.acteur.runId });
      return { statut: 201, corps: v };
    },
    "tache.porte.evaluer": async (r: { params: Record<string, string> }) => {
      appels.push({ cle: "tache.porte.evaluer", issueId: r.params.issueId });
      throw new ErreurAtelier("role_non_autorise", "Seul l'agent participant de l'étape de revue native (« Porte de contrôle ») ou un humain lance le contrôle automatique.");
    },
  };
  const evaluerPorte = async (_companyId: string, issueId: string, par: string) => {
    appels.push({ cle: "evaluerPorte", issueId, par });
    const manquantes = Object.keys(requises).filter((role) => !verdicts.some((d) => d.role === role && d.verdict === "PASS"));
    return { decision: manquantes.length === 0 ? "PASS" : "REFUS", motifs: manquantes.map((role) => ({ code: "revue_manquante", message: `Revue « ${role} » absente.` })) };
  };
  return { routes, evaluerPorte, verdicts, appels, requises };
}

async function monter(opts: { gabarit?: Gabarit; actif?: boolean | undefined; campagneId?: string | null; sansDocument?: boolean } = {}) {
  const m = baseMemoire();
  const h = hoteDouble();
  const gabarit = opts.gabarit ?? GABARIT_4;
  // Document livrable de la tâche de dernière étape (clé de la porte) : sa révision courante, absente si `sansDocument`.
  const docs = new Map<string, string>();
  if (gabarit.porte && !opts.sansDocument) docs.set(ISSUE, REVISION);
  const r = routesDouble(gabarit, docs);
  const revisionLivrable = async (_c: string, issueId: string) => docs.get(issueId) ?? null;
  const executeur = creerExecuteur({ hote: h.hote as never, base: m.base as unknown as DepsExecuteur["base"], porte: porte as never, horloge: () => new Date("2026-11-08T10:00:00.000Z"), revisionLivrable, chargerGabarit: () => gabarit });
  await m.base.creerMission({ companyId: SOC, campagneId: opts.campagneId ?? null });
  for (const g of gabarit.etapes) await m.base.creerEtape({ companyId: SOC, missionId: MISSION, rang: g.rang, role: g.role, etat: "en_attente", entree: ENTREES });
  await executeur.demarrerMission(SOC, MISSION);
  // Les relecteurs travaillent sur leur sous-tâche de revue, créée comme `assurerRevues`.
  const revues = Object.fromEntries(Object.entries(r.requises).map(([role, agent]) => [role, h.creerRevue(role, agent)]));
  const runs = new Map<string, string>();
  const lectures = { base: 0 };
  const baseObservee = Object.fromEntries(Object.entries(m.base).map(([nom, f]) => [nom, (...a: unknown[]) => { lectures.base += 1; return (f as (...x: unknown[]) => unknown)(...a); }]));
  const outils = creerOutilsMoteur({
    config: async (companyId) => (opts.actif === undefined && "actif" in opts ? null : { moteurMissions: opts.actif ?? true, _pour: companyId }),
    base: baseObservee as unknown as Parameters<typeof creerOutilsMoteur>[0]["base"],
    tacheDuRun: async (_c, runId) => runs.get(runId) ?? null,
    agents: async () => AGENTS,
    executeur,
    issues: { ...h.cartesHote, get: h.hote.issues.get } as never,
    routes: r.routes as never,
    evaluerPorte: r.evaluerPorte,
    revisionLivrable,
    chargerGabarit: () => gabarit,
  });
  const run = (agentId: string, runId: string, issueId = ISSUE, companyId = SOC) => {
    runs.set(runId, issueId);
    return { agentId, runId, companyId, projectId: "projet" };
  };
  const etat = () => ({ transitions: m.compteurs.transitions, majs: h.majs.length, reveils: h.reveils.length, creations: h.creations.length, executions: m.executions.size, journal: m.journal.length, majEtape: m.compteurs.majEtape, cartes: h.cartes.length, verdicts: r.verdicts.length });
  const runRevue = (agentId: string, runId: string, role = "exigences") => run(agentId, runId, revues[role]);
  return { ...m, ...h, outils, run, runRevue, revues, docs, etat, lectures, verdictsDeposes: r.verdicts, appelsRoutes: r.appels };
}

const erreurDe = (r: { data?: unknown; error?: string }) => {
  expect(r.error).toBeTruthy();
  return r.data as ErreurOutil;
};
const livrable = (extra: Record<string, unknown> = {}) => ({ missionId: MISSION, versionContrat: 1, sortie: SORTIE, ...extra });
const verdict = (v: "PASS" | "CHANGES_REQUESTED", role = "exigences", extra: Record<string, unknown> = {}) => ({ missionId: MISSION, versionContrat: 1, role, revisionId: REVISION, verdict: v, ...extra });

describe("outils du moteur de missions", () => {
  it("refuse un argument invalide sans rien écrire ni réveiller", async () => {
    const t = await monter();
    const avant = t.etat();
    const e = erreurDe(await t.outils.livrable_deposer({ missionId: MISSION, versionContrat: "1", sortie: "texte" }, t.run(REDACTEUR, "run-a")));
    expect(e.code).toBe("parametres_invalides");
    expect(e.actionRecommandee).not.toBe("");
    expect(e.message).toContain("versionContrat");
    expect(t.etat()).toEqual(avant);
  });

  it("refuse une version de contrat ancienne sans rien écrire", async () => {
    const t = await monter();
    const avant = t.etat();
    const e = erreurDe(await t.outils.livrable_deposer(livrable({ versionContrat: 2 }), t.run(REDACTEUR, "run-a")));
    expect(e.code).toBe("contrat_version");
    expect(e.actionRecommandee).toContain("mission_etat");
    expect(t.etat()).toEqual(avant);
  });

  it("refuse un agent qui n'est pas l'assigné de l'étape courante", async () => {
    const t = await monter();
    const avant = t.etat();
    const e = erreurDe(await t.outils.livrable_deposer(livrable(), t.run("agent-autre", "run-a")));
    expect(e.code).toBe("droit_refuse");
    expect(t.etat()).toEqual(avant);
  });

  it("refuse la mission d'une autre entreprise, même avec un run valide chez elle", async () => {
    const t = await monter();
    const avant = t.etat();
    const e = erreurDe(await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a", ISSUE, AUTRE)));
    expect(e.code).toBe("mission_inconnue");
    expect(t.etat()).toEqual(avant);
  });

  it("refuse un run dont la tâche n'est pas l'étape courante de la mission", async () => {
    const t = await monter();
    const avant = t.etat();
    const e = erreurDe(await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a", "issue-3")));
    expect(e.code).toBe("run_hors_etape");
    expect(t.etat()).toEqual(avant);
  });

  it("refuse un livrable trop gros avant toute écriture", async () => {
    const t = await monter();
    const avant = t.etat();
    const gros = { ...SORTIE, textes: ["x".repeat(TAILLE_MAX_LIVRABLE_OCTETS + 1)] };
    const e = erreurDe(await t.outils.livrable_deposer(livrable({ sortie: gros }), t.run(REDACTEUR, "run-a")));
    expect(e.code).toBe("livrable_trop_gros");
    expect(t.etat()).toEqual(avant);
  });

  it("refuse une sortie hors contrat avec les erreurs du contrat, sans avancer la mission", async () => {
    const t = await monter();
    const e = erreurDe(await t.outils.livrable_deposer(livrable({ sortie: { textes: ["un"] } }), t.run(REDACTEUR, "run-a")));
    expect(e.code).toBe("sortie_hors_contrat");
    expect(e.message).toContain("briefsVisuels");
    expect(t.missions.get(MISSION)!.etat).toBe("en_cours");
    expect(t.etapes.find((x) => x.rang === 1)!.sortie).toBeNull();
  });

  it("dépose sans l'altérer un texte avec des apostrophes droites et typographiques", async () => {
    const t = await monter();
    const sortie = { ...SORTIE, textes: ["L'été d'Éloïse n'est pas l’hiver : « c'est 100 % à l'heure »."] };
    const r = await t.outils.livrable_deposer(livrable({ sortie }), t.run(REDACTEUR, "run-a"));
    expect(r.error).toBeUndefined();
    expect(t.etapes.find((x) => x.rang === 1)!.sortie).toEqual(sortie);
    expect(t.missions.get(MISSION)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
  });

  it("rejoué par le même run, le dépôt n'a aucun effet", async () => {
    const t = await monter();
    const run = t.run(REDACTEUR, "run-a");
    expect((await t.outils.livrable_deposer(livrable(), run)).error).toBeUndefined();
    const avant = t.etat();
    // la mission a avancé à l'étape 2 : la tâche du run n'est plus l'étape courante, refus net et aucune écriture
    expect(erreurDe(await t.outils.livrable_deposer(livrable(), run)).code).toBe("run_hors_etape");
    expect(t.etat()).toEqual(avant);
    expect(t.missions.get(MISSION)!.rangCourant).toBe(2);
  });

  it("un second changements_demandes d'un nouveau run repasse, le même run rejoué non", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE, campagneId: "campagne-1" });
    const redacteurA = t.run(REDACTEUR, "run-a");
    const relecteur1 = t.runRevue("agent-exigences", "run-r1", "exigences");
    expect((await t.outils.livrable_deposer(livrable(), redacteurA)).error).toBeUndefined();
    expect(t.missions.get(MISSION)!.etat).toBe("en_revue");

    expect((await t.outils.verdict_deposer(verdict("CHANGES_REQUESTED"), relecteur1)).error).toBeUndefined();
    expect(t.missions.get(MISSION)!.etat).toBe("en_cours");
    expect(t.etapes.find((x) => x.rang === 1)!.etat).toBe("en_cours");

    expect((await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-b"))).error).toBeUndefined();
    expect(t.missions.get(MISSION)!.etat).toBe("en_revue");
    const transitions = t.compteurs.transitions;
    // même run R1 rejoué : sans effet, l'état reste en_revue
    const rejeu = await t.outils.verdict_deposer(verdict("CHANGES_REQUESTED"), relecteur1);
    expect(rejeu.error).toBeUndefined();
    expect(t.compteurs.transitions).toBe(transitions);
    expect(t.missions.get(MISSION)!.etat).toBe("en_revue");
    // nouveau run R2 : la transition légitime repasse
    expect((await t.outils.verdict_deposer(verdict("CHANGES_REQUESTED"), t.runRevue("agent-exigences", "run-r2", "exigences"))).error).toBeUndefined();
    expect(t.missions.get(MISSION)!.etat).toBe("en_cours");
    expect(t.compteurs.transitions).toBe(transitions + 1);
  });

  it("deux PASS simultanés qui rendent la porte passante : aucun refus, un seul franchissement", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_2, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    await t.outils.verdict_deposer(verdict("PASS", "exigences"), t.runRevue("agent-exigences", "run-r1", "exigences"));
    const resultats = await Promise.all([
      t.outils.verdict_deposer(verdict("PASS", "metier"), t.runRevue("agent-relecteur", "run-r2", "metier")),
      t.outils.verdict_deposer(verdict("PASS", "exigences"), t.runRevue("agent-exigences", "run-r3", "exigences")),
    ]);
    expect(resultats.map((r) => r.error)).toEqual([undefined, undefined]);
    expect(resultats.map((r) => (r.data as { statut: string }).statut).sort()).toEqual(["applique", "deja_franchie"]);
    expect(t.missions.get(MISSION)!.etat).toBe("attente_autorisation");
  });

  it("deux revues requises : le premier PASS laisse la mission en revue, le second la fait passer en attente d'autorisation", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_2, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    const transitions = t.compteurs.transitions;
    const premier = await t.outils.verdict_deposer(verdict("PASS", "exigences"), t.runRevue("agent-exigences", "run-r1", "exigences"));
    expect(premier.error).toBeUndefined();
    expect(premier.data).toMatchObject({ statut: "en_attente_revues", motifs: [{ code: "revue_manquante" }] });
    expect(t.missions.get(MISSION)!.etat).toBe("en_revue");
    expect(t.compteurs.transitions).toBe(transitions);
    expect(t.verdictsDeposes).toHaveLength(1);
    const second = await t.outils.verdict_deposer(verdict("PASS", "metier"), t.runRevue("agent-relecteur", "run-r2", "metier"));
    expect(second.error).toBeUndefined();
    expect(second.data).toMatchObject({ statut: "applique", etat: "attente_autorisation" });
    expect(t.missions.get(MISSION)!.etat).toBe("attente_autorisation");
    // le verdict passe par la route de la tâche de l'étape, puis la porte est évaluée par la fonction interne des services, au nom du run
    expect(t.appelsRoutes.map((x) => `${x.cle}:${x.issueId}:${x.par ?? ""}`)).toEqual([`tache.verdict:${ISSUE}:`, `evaluerPorte:${ISSUE}:moteur:run-r1`, `tache.verdict:${ISSUE}:`, `evaluerPorte:${ISSUE}:moteur:run-r2`]);
  });

  it("un producteur qui dépose un verdict est refusé, rien n'est enregistré", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_2, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    const avant = t.etat();
    expect(erreurDe(await t.outils.verdict_deposer(verdict("PASS"), t.runRevue(REDACTEUR, "run-x", "exigences"))).code).toBe("droit_refuse");
    expect(t.etat()).toEqual(avant);
    expect(t.appelsRoutes).toEqual([]);
  });

  it("un refus de la route (révision périmée) remonte avec son code, la mission reste en revue", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_2, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    const avant = t.etat();
    const e = erreurDe(await t.outils.verdict_deposer({ ...verdict("PASS"), revisionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, t.runRevue("agent-exigences", "run-r1", "exigences")));
    expect(e.code).toBe("revision_perimee");
    expect(t.etat()).toEqual(avant);
  });

  it("un relecteur dont le run est sur la tâche d'étape elle-même est refusé (run_hors_mission), rien n'est enregistré", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_2, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    const avant = t.etat();
    const e = erreurDe(await t.outils.verdict_deposer(verdict("PASS"), t.run("agent-exigences", "run-r1", ISSUE)));
    expect(e.code).toBe("run_hors_mission");
    expect(t.etat()).toEqual(avant);
    expect(t.appelsRoutes).toEqual([]);
  });

  it("une sous-tâche de revue d'un autre rôle ou d'une autre origine ne donne pas le droit de déposer ce verdict", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_2, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    const avant = t.etat();
    // sous-tâche du rôle « metier » utilisée pour déposer le rôle « exigences »
    expect(erreurDe(await t.outils.verdict_deposer(verdict("PASS", "exigences"), t.run("agent-exigences", "run-r1", t.revues.metier))).code).toBe("run_hors_mission");
    // même forme, mais pas l'origine de revue
    t.issues.get(t.revues.exigences!)!.originKind = "manual";
    expect(erreurDe(await t.outils.verdict_deposer(verdict("PASS", "exigences"), t.run("agent-exigences", "run-r2", t.revues.exigences))).code).toBe("run_hors_mission");
    // sous-tâche d'une autre tâche que l'étape courante
    t.issues.get(t.revues.exigences!)!.originKind = ORIGINE_REVUE;
    t.issues.get(t.revues.exigences!)!.parentId = "issue-hors-mission";
    expect(erreurDe(await t.outils.verdict_deposer(verdict("PASS", "exigences"), t.run("agent-exigences", "run-r3", t.revues.exigences))).code).toBe("run_hors_mission");
    expect(t.etat()).toEqual(avant);
    expect(t.appelsRoutes).toEqual([]);
  });

  it("le PASS d'un seul relecteur est évalué au nom du moteur sans franchir la porte (la route d'évaluation, réservée au participant de revue, refuserait cet agent)", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE, campagneId: "campagne-1" });
    await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"));
    const r = await t.outils.verdict_deposer(verdict("PASS"), t.runRevue("agent-exigences", "run-r1"));
    expect(r.error).toBeUndefined();
    // un seul relecteur ne franchit pas la porte, et n'est pas refusé : l'évaluation a bien eu lieu
    expect(r.data).toMatchObject({ statut: "en_attente_revues" });
    expect(t.missions.get(MISSION)!.etat).toBe("en_revue");
    expect(t.appelsRoutes.some((x) => x.cle === "tache.porte.evaluer")).toBe(false);
    expect(t.appelsRoutes.filter((x) => x.cle === "evaluerPorte")).toEqual([{ cle: "evaluerPorte", issueId: ISSUE, par: "moteur:run-r1" }]);
  });

  it("sous porte, la dernière étape sans document livrable est refusée (livrable_absent), rien n'est écrit", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE, campagneId: "campagne-1", sansDocument: true });
    const avant = t.etat();
    const e = erreurDe(await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a")));
    expect(e.code).toBe("livrable_absent");
    expect(e.actionRecommandee).toBe("Écrire d'abord le livrable dans le document de la tâche, puis redéposer.");
    expect(t.etat()).toEqual(avant);
    expect(t.missions.get(MISSION)!.etat).toBe("en_cours");
    expect(t.etapes.find((x) => x.rang === 1)).toMatchObject({ sortie: null, revisionLivrable: null });
  });

  it("sous porte, la sortie déposée retient la révision du document relu ; sans porte, aucune révision n'est lue", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE, campagneId: "campagne-1" });
    expect((await t.outils.livrable_deposer(livrable(), t.run(REDACTEUR, "run-a"))).error).toBeUndefined();
    expect(t.etapes.find((x) => x.rang === 1)!.revisionLivrable).toBe(REVISION);
    const s = await monter();
    expect((await s.outils.livrable_deposer(livrable(), s.run(REDACTEUR, "run-a"))).error).toBeUndefined();
    expect(s.etapes.find((x) => x.rang === 1)!.revisionLivrable).toBeNull();
  });

  it("verdict hors revue : refus de transition sans rien écrire", async () => {
    const t = await monter();
    const avant = t.etat();
    const e = erreurDe(await t.outils.verdict_deposer(verdict("PASS"), t.runRevue("agent-exigences", "run-r", "exigences")));
    expect(e.code).toBe("transition_invalide");
    expect(t.etat()).toEqual(avant);
  });

  it("decision_demander ouvre une seule carte request_confirmation sur la tâche de l'étape, sans changer la mission", async () => {
    const t = await monter();
    const demande = { missionId: MISSION, versionContrat: 1, question: "Quel ton pour la marque ?" };
    const avant = t.etat();
    const premier = await t.outils.decision_demander(demande, t.run(REDACTEUR, "run-a"));
    expect(premier.error).toBeUndefined();
    expect(t.cartes).toHaveLength(1);
    expect(t.cartes[0]).toMatchObject({ issueId: ISSUE, kind: "request_confirmation", status: "pending", continuationPolicy: "wake_assignee_on_accept", payload: { prompt: "Quel ton pour la marque ?" } });
    expect(t.missions.get(MISSION)!.etat).toBe("en_cours");
    expect(t.etat()).toEqual({ ...avant, cartes: 1 });
    // un autre run, même question : la carte en attente est réutilisée
    const second = await t.outils.decision_demander(demande, t.run(REDACTEUR, "run-b"));
    expect(second.error).toBeUndefined();
    expect(second.data).toMatchObject({ statut: "deja_demandee", carteId: (t.cartes[0] as { id: string }).id });
    expect(t.cartes).toHaveLength(1);
    expect(t.etat()).toEqual({ ...avant, cartes: 1 });
  });

  it.each(["mission_etat", "sources_lister"] as const)("%s : le coordinateur lit depuis une autre tâche, même hors de la mission", async (nom) => {
    const t = await monter({ campagneId: "campagne-1" });
    const avant = t.etat();
    for (const tache of ["issue-3", "issue-hors-mission"]) {
      const r = await t.outils[nom]({ missionId: MISSION }, t.run("agent-coordinateur", `run-c-${tache}`, tache));
      expect(r.error).toBeUndefined();
    }
    expect(t.etat()).toEqual(avant);
  });

  it.each(["mission_etat", "sources_lister"] as const)("%s : un relecteur lit avant la revue, un agent sans rôle dans la mission reste refusé", async (nom) => {
    const t = await monter({ gabarit: GABARIT_PORTE, campagneId: "campagne-1" });
    expect(t.missions.get(MISSION)!.etat).toBe("en_cours");
    expect((await t.outils[nom]({ missionId: MISSION }, t.run("agent-exigences", "run-r", "issue-hors-mission"))).error).toBeUndefined();
    expect(erreurDe(await t.outils[nom]({ missionId: MISSION }, t.run("agent-autre", "run-x", "issue-hors-mission"))).code).toBe("droit_refuse");
  });

  it.each(["mission_etat", "sources_lister"] as const)("%s : la mission d'une autre entreprise reste refusée au coordinateur", async (nom) => {
    const t = await monter();
    expect(erreurDe(await t.outils[nom]({ missionId: MISSION }, t.run("agent-coordinateur", "run-c", "issue-3", AUTRE))).code).toBe("mission_inconnue");
  });

  it("mission_etat lit l'état sans écrire ni réveiller", async () => {
    const t = await monter();
    const avant = t.etat();
    const r = await t.outils.mission_etat({ missionId: MISSION }, t.run(REDACTEUR, "run-a"));
    expect(r.error).toBeUndefined();
    expect(r.data).toMatchObject({ etat: "en_cours", rangCourant: 1, etapeCourante: { rang: 1, role: "contenus", contratVersion: 1 } });
    expect(t.etat()).toEqual(avant);
  });

  it("sources_lister rend les sources de la campagne de la mission, sans écrire", async () => {
    const t = await monter({ campagneId: "campagne-1" });
    t.sources.push({ id: "s1", campagneId: "campagne-1", issueId: null, url: "https://exemple.fr/a", titre: "A", statutAcces: "ok", dateCollecte: "2026-11-08T09:00:00.000Z" }, { id: "s2", campagneId: "autre", issueId: null, url: "https://exemple.fr/b" });
    const avant = t.etat();
    const r = await t.outils.sources_lister({ missionId: MISSION }, t.run(REDACTEUR, "run-a"));
    expect(r.error).toBeUndefined();
    expect((r.data as { sources: Array<{ url: string }> }).sources.map((s) => s.url)).toEqual(["https://exemple.fr/a"]);
    expect(t.etat()).toEqual(avant);
  });

  it.each([{ nom: "faux", actif: false }, { nom: "absent", actif: undefined }])("moteur désactivé (réglage $nom) : chaque outil refuse sans toucher la base ni l'hôte", async ({ actif }) => {
    const t = await monter({ actif });
    const base = t.lectures.base;
    const avant = t.etat();
    const run = t.run(REDACTEUR, "run-a");
    for (const [nom, params] of [["mission_etat", { missionId: MISSION }], ["livrable_deposer", livrable()], ["verdict_deposer", verdict("PASS")], ["decision_demander", { missionId: MISSION, versionContrat: 1, question: "?" }], ["sources_lister", { missionId: MISSION }]] as const) {
      expect(erreurDe(await t.outils[nom](params, run)).code).toBe("moteur_desactive");
    }
    expect(t.lectures.base).toBe(base);
    expect(t.etat()).toEqual(avant);
  });

  it("déclare les cinq outils dans le manifeste", () => {
    const noms = ["decision_demander", "livrable_deposer", "mission_etat", "sources_lister", "verdict_deposer"];
    expect((manifest.tools ?? []).map((x) => x.name).filter((n) => noms.includes(n)).sort()).toEqual(noms);
  });
});
