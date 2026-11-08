/**
 * WF-C de bout en bout (#50, tâche 4) : demande de contenu au chat, brouillon et carte, refus du lancement tant que l'humain
 * n'a pas accepté, lancement, rédaction, revues, porte, approbation native, clôture. Seam : `discussion.envoyer`, `mission.lancer`, vrai exécuteur, vrais
 * outils, hôte et base doubles (recopie fidèle de `hoteDouble`, `baseMemoire` et `routesDouble` de moteur-outils.spec.ts et du
 * `faux` de moteur-chat.spec.ts, qui n'exportent rien).
 *
 * Fidélité de l'hôte double : `issues.list` rend `executionPolicy` et `executionState` à null, seul `issues.get` rend la tâche complète
 * (l'approbation se lit donc par `get`) ; `requestWakeup` applique les refus du vrai hôte. Les relecteurs travaillent sur la sous-tâche de
 * revue (créée comme `assurerRevues` : fille de la tâche d'étape, origine de revue, assignée au relecteur) et la porte est évaluée par la
 * fonction interne des services (`evaluerPorte`, au nom du moteur), la route d'évaluation refusant tout agent. `tache.verdict` applique
 * les refus réels : document existant, relecteur désigné, producteur qui ne relit pas, révision courante.
 *
 * Limites : l'état natif d'approbation est posé à la main sur le double (`approuver`), la politique native elle-même n'est pas jouée ;
 * `tache.verdict` et l'évaluation de la porte sont des doubles recopiés, non les vrais services (voir la limite du montage dans le rapport de la tâche).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { chargerContrat } from "../src/moteur/contrats.js";
import { creerExecuteur, type DepsExecuteur } from "../src/moteur/executeur.js";
import { PLUGIN_ID } from "../src/contrats/index.js";
import { chargerGabarit, PorteRefusee, revuesImposees } from "../src/moteur/gabarits.js";
import { creerOutilsMoteur } from "../src/moteur/outils.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier, EtapeMission, Mission } from "../src/serveur/base.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { routesDiscussion, routesLancement } from "../src/serveur/services-discussion.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const SOC = "11111111-1111-4111-8111-111111111111";
const AUTRE = "99999999-9999-4999-8999-999999999999";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const COORD = id(1);
const REDACTEUR = "agent-contenus";
const REVISION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAMPAGNE = "campagne-1";
/** Origine des sous-tâches de revue, comme `assurerRevues` (services.ts). */
const ORIGINE_REVUE = `plugin:${PLUGIN_ID}:revue`;
const GABARIT = chargerGabarit("wf-c-contenu");
const SORTIE = { textes: ["Un texte prêt à relire."], briefsVisuels: ["Un visuel sobre."], sources: ["https://exemple.fr/a"] };
const entreesDe = (typeLivrable: string, canal: string) => ({ canal, cible: "Dirigeants de PME belges", objectif: "Faire connaître l'offre", sources: ["https://exemple.fr/a"], typeLivrable });

const agentDe = (slug: string) => ({ id: `agent-${slug}`, status: "idle", companyId: SOC, metadata: { atelier: { slug } } });
const AGENTS = ["contenus", "exigences", "relecteur", "tests-techniques", "coordinateur"].map(agentDe);

function monter() {
  const reglage = { moteurActif: true };
  const issues: Ligne[] = [];
  const commentaires: Ligne[] = [];
  const interactions: Ligne[] = [];
  const missions = new Map<string, Mission>();
  const etapes: EtapeMission[] = [];
  const executions = new Map<string, { statut: string }>();
  const journal: Ligne[] = [];
  const reveils: Ligne[] = [];
  const majs: Ligne[] = [];
  const appelsRoutes: string[] = [];
  const verdicts: Array<{ role: string; verdict: string; runId: string | null }> = [];
  const portes: Ligne[] = [];
  const runs = new Map<string, string>();
  /** Révision courante du document livrable, par tâche (absente tant que l'agent n'a rien écrit). */
  const docs = new Map<string, string>();
  const revisionLivrable = async (_companyId: string, issueId: string) => docs.get(issueId) ?? null;
  let compteurMissions = 0;
  const dehors = (companyId: string) => {
    if (companyId !== SOC) throw new Error("hôte : tâche d'une autre entreprise");
  };

  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    config: { get: async () => ({ moteurMissions: reglage.moteurActif }) },
    agents: { list: async () => [{ id: COORD, name: "Coordinateur", role: "ceo", status: "idle" }], get: async () => ({ id: COORD, name: "Coordinateur" }) },
    issues: {
      /** Comme `issues.list` du vrai hôte : `executionPolicy` et `executionState` rendus à null. */
      list: async (f: Ligne) => issues.filter((i) => i.companyId === f.companyId && i.originKind === f.originKind && (f.originId === undefined || i.originId === f.originId)).map((i) => ({ ...i, executionPolicy: null, executionState: null })),
      get: async (issueId: string, companyId: string) => issues.find((i) => i.id === issueId && i.companyId === companyId) ?? null,
      create: async (input: Ligne) => {
        const issue = { id: `issue-${issues.length + 1}`, identifier: `DEM-${issues.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...input };
        issues.push(issue);
        return issue;
      },
      update: async (issueId: string, patch: Ligne) => {
        majs.push({ id: issueId, patch });
        Object.assign(issues.find((i) => i.id === issueId)!, patch);
        return {};
      },
      listInteractions: async (issueId: string, companyId: string) => {
        dehors(companyId);
        return interactions.filter((c) => c.issueId === issueId);
      },
      listComments: async (issueId: string) => commentaires.filter((c) => c.issueId === issueId),
      createComment: async (issueId: string, body: string, companyId: string, opt?: Ligne) => {
        dehors(companyId);
        const c = { id: id(500 + commentaires.length), issueId, companyId, body, authorType: opt?.authorAgentId ? "agent" : "system", authorAgentId: opt?.authorAgentId ?? null, createdAt: new Date() };
        commentaires.push(c);
        return c;
      },
      requestConfirmation: async (issueId: string, interaction: Ligne, companyId: string) => {
        dehors(companyId);
        const carte = { id: `carte-${interactions.length + 1}`, issueId, companyId, kind: "request_confirmation", status: "pending", ...interaction };
        interactions.push(carte);
        return carte;
      },
      /** Refus du vrai hôte (plugin-host-services.ts) : sans assigné, statut non réveillable, bloqueur non terminé. */
      requestWakeup: async (issueId: string, _companyId: string, options: Ligne) => {
        const tache = issues.find((i) => i.id === issueId);
        if (!tache?.assigneeAgentId) throw new Error("Issue has no assigned agent to wake");
        if (["backlog", "done", "cancelled"].includes(String(tache.status))) throw new Error(`Issue is not wakeable in status: ${String(tache.status)}`);
        const bloqueurs = (tache.blockedByIssueIds as string[] | undefined) ?? [];
        if (bloqueurs.some((b) => issues.find((i) => i.id === b)?.status !== "done")) throw new Error("Issue is blocked by unresolved blockers");
        reveils.push({ issueId, options });
        return { queued: true, runId: "run-hote" };
      },
    },
  } as unknown as PluginContext;

  const base = {
    journaliser: async (e: Ligne) => void journal.push(e),
    coutsEntreprise: async () => ({ totalCents: 0, evenements: 0 }),
    async creerMission(m: Partial<Mission> & { companyId: string }) {
      const mid = id(900 + ++compteurMissions);
      missions.set(mid, { id: mid, gabaritCle: "", gabaritVersion: 1, contratId: "", contratVersion: 1, mandat: "", etat: "prete", etatAvantPause: null, rangCourant: 0, enveloppeCents: 0, campagneId: null, issueRacineId: null, creeLe: "", modifieLe: "", ...m } as Mission);
      return mid;
    },
    async lireMission(companyId: string, mid: string) {
      const m = missions.get(mid);
      return m && m.companyId === companyId ? { ...m } : null;
    },
    async missionsActives(companyId: string) {
      return [...missions.values()].filter((m) => m.companyId === companyId && !["cloturee", "annulee", "echec"].includes(m.etat)).map((m) => ({ ...m }));
    },
    /** Campagnes : une par entreprise, lecture filtrée par `company_id` comme le SQL. */
    async lireCampagne(companyId: string, campagneId: string) {
      return (companyId === SOC && campagneId === CAMPAGNE) || (companyId === AUTRE && campagneId === "campagne-autre") ? { id: campagneId, companyId } : null;
    },
    /** Même condition que l'UPDATE de base.ts : entreprise, état d'attente, campagne absente ou identique. */
    async rattacherCampagneMission(companyId: string, mid: string, campagneId: string) {
      const m = missions.get(mid);
      if (!m || m.companyId !== companyId || m.etat !== "attente_information" || (m.campagneId !== null && m.campagneId !== campagneId)) return false;
      m.campagneId = campagneId;
      return true;
    },
    async changerEtatMission(companyId: string, mid: string, ancien: string, nouveau: string) {
      const m = missions.get(mid);
      if (!m || m.companyId !== companyId || m.etat !== ancien) return false;
      m.etat = nouveau as Mission["etat"];
      return true;
    },
    async changerRangMission(companyId: string, mid: string, ancien: number, nouveau: number) {
      const m = missions.get(mid);
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
    async majEtape(companyId: string, eid: string, c: Ligne) {
      const e = etapes.find((x) => x.companyId === companyId && x.id === eid);
      if (!e) return false;
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
    async listerSources() { return []; },
  } as unknown as BaseAtelier;

  const porte = {
    async creerPorte(p: Ligne) { portes.push(p); return true; },
    async majPolitique() { return {}; },
    async conformiteImposee() { return false; },
    async exigences() { return ["EXI-1"]; },
    async resolveur() { return <T>(v: T) => v; },
  };
  const executeur = creerExecuteur({
    hote: { issues: (ctx as unknown as { issues: never }).issues, resoudreAgent: async (_c: string, role: string) => `agent-${role}` } as never,
    base: base as unknown as DepsExecuteur["base"], porte: porte as never, horloge: () => new Date("2026-11-08T10:00:00.000Z"), revisionLivrable,
  });

  /** Route `tache.verdict` reprise dans ses refus (document existant, relecteur désigné, producteur, révision courante) ; l'évaluation de la porte est PASS quand chaque revue requise a un PASS. */
  const requises = Object.fromEntries(revuesImposees(GABARIT).map((r) => [r.role, `agent-${r.agentId.replace(/^\{\{agent:|\}\}$/gu, "")}`]));
  const routesPorte = {
    "tache.verdict": async (r: Ligne) => {
      appelsRoutes.push("tache.verdict");
      const v = r.corps as { role: string; verdict: string; revisionId: string };
      const courante = docs.get(r.params.issueId);
      if (!courante) throw new ErreurAtelier("conflit", "Aucun livrable à relire.");
      if (requises[v.role] !== r.acteur.agentId) throw new ErreurAtelier("role_non_autorise", `Seul le relecteur désigné pour « ${v.role} » dépose ce verdict.`);
      if (r.acteur.agentId === REDACTEUR) throw new ErreurAtelier("producteur_ne_peut_pas_relire", "Le producteur du livrable ne peut pas le relire.");
      if (v.revisionId !== courante) throw new ErreurAtelier("revision_perimee", "Le verdict doit porter sur la révision courante du livrable.");
      if (!verdicts.some((d) => d.role === v.role && d.runId === r.acteur.runId)) verdicts.push({ role: v.role, verdict: v.verdict, runId: r.acteur.runId });
      return { statut: 201, corps: v };
    },
    /** `exigerEvaluateur` : seul le participant de revue native ou un humain ; le moteur et ses relecteurs sont refusés. */
    "tache.porte.evaluer": async () => {
      appelsRoutes.push("tache.porte.evaluer");
      throw new ErreurAtelier("role_non_autorise", "Seul l'agent participant de l'étape de revue native (« Porte de contrôle ») ou un humain lance le contrôle automatique.");
    },
  };
  const evaluerPorte = async () => {
    appelsRoutes.push("evaluerPorte");
    const manquantes = Object.keys(requises).filter((role) => !verdicts.some((d) => d.role === role && d.verdict === "PASS"));
    return { decision: manquantes.length === 0 ? "PASS" : "REFUS", motifs: manquantes.map((role) => ({ code: "revue_manquante", message: `Revue « ${role} » absente.` })) };
  };
  const outils = creerOutilsMoteur({
    config: async () => ({ moteurMissions: true }), base: base as never, tacheDuRun: async (_c, runId) => runs.get(runId) ?? null, agents: async () => AGENTS,
    executeur, issues: (ctx as unknown as { issues: never }).issues, routes: routesPorte as never, evaluerPorte, revisionLivrable,
  });
  /** Sous-tâches de revue de la tâche d'étape, une par rôle requis (`assurerRevues`) ; rend rôle -> identifiant de la sous-tâche. */
  const creerRevues = async (etapeIssueId: string) => Object.fromEntries(await Promise.all(Object.entries(requises).map(async ([role, agent]) => [role, (await ctx.issues.create({
    companyId: SOC, parentId: etapeIssueId, title: `Revue ${role}`, status: "todo", assigneeAgentId: agent, originKind: ORIGINE_REVUE as never, originId: `${etapeIssueId}:${REVISION}:${role}`,
  } as never)).id])));

  const routes = { ...routesDiscussion({ ctx, base }), ...routesLancement({ ctx, base, executeur }) };
  const requete = (cle: string, corps: Ligne, companyId = SOC, acteur: ActeurHote = HUMAIN) => ({ cle, params: {}, query: {}, corps, acteur, companyId }) as unknown as RequeteRoute;
  const envoyer = (texte: string) => routes["discussion.envoyer"]!(requete("discussion.envoyer", { companyId: SOC, texte }));
  const lancer = (corps: Ligne, companyId = SOC, acteur: ActeurHote = HUMAIN) => routes["mission.lancer"]!(requete("mission.lancer", { companyId, ...corps }, companyId, acteur));
  const run = (agentId: string, runId: string, issueId: string) => {
    runs.set(runId, issueId);
    return { agentId, runId, companyId: SOC, projectId: "projet" };
  };
  /** Tout ce qu'un refus ne doit pas toucher. */
  const instantane = () => JSON.stringify({ missions: [...missions.values()], etapes, issues: issues.length, majs: majs.length, reveils: reveils.length, executions: executions.size, portes: portes.length, cartes: interactions.length });
  const accepter = (carte: Ligne) => void Object.assign(carte, { status: "accepted", resolvedByUserId: "local-board" });
  return { reglage, porte, envoyer, lancer, executeur, outils, run, instantane, accepter, docs, creerRevues, issues, interactions, missions, etapes, majs, reveils, portes, verdicts, appelsRoutes, journal };
}

type Banc = ReturnType<typeof monter>;
const brouillon = async (b: Banc, texte: string) => {
  await b.envoyer(texte);
  return { mission: [...b.missions.values()][0]!, carte: b.interactions[0]! };
};

/** Ce que la politique native laisse sur la tâche : `terminees` liste ses étapes terminées (review, approval). */
const fermer = (tache: Ligne, terminees: string[]) => Object.assign(tache, {
  status: "done",
  executionPolicy: { stages: [{ id: "revue", type: "review" }, { id: "approbation", type: "approval" }] },
  executionState: { completedStageIds: terminees },
});

describe("WF-C : demande de contenu jusqu'au livrable approuvé", () => {
  it.each([
    ["post", "Écris-moi un post sur LinkedIn", entreesDe("post", "linkedin")],
    ["article", "Rédige un article", entreesDe("article", "blog")],
    ["newsletter", "Prépare une newsletter", entreesDe("newsletter", "courriel")],
  ])("%s : brouillon, refus sans accord, lancement après accord, rédaction, trois revues, approbation humaine, clôture", async (_type, texte, entrees) => {
    const b = monter();
    const { mission, carte } = await brouillon(b, texte);

    // Brouillon : une seule carte, mission en attente d'information, sans campagne ni étape.
    expect(b.interactions).toHaveLength(1);
    expect(mission).toMatchObject({ gabaritCle: "wf-c-contenu", etat: "attente_information", campagneId: null });
    expect(carte.payload.detailsMarkdown).toContain(`Mission : ${mission.id}`);

    // Tant que la carte n'est pas acceptée : refus, rien d'écrit.
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(b.instantane()).toBe(avant);

    // Carte acceptée : la mission démarre, étape 1 réveillée, porte posée sur la tâche de la dernière étape.
    b.accepter(carte);
    await b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees });
    expect(b.missions.get(mission.id)).toMatchObject({ etat: "en_cours", rangCourant: 1, campagneId: CAMPAGNE });
    const etape = b.etapes.find((e) => e.missionId === mission.id && e.rang === 1)!;
    expect(etape).toMatchObject({ etat: "en_cours", entree: entrees });
    expect(b.issues.find((i) => i.id === etape.issueId)).toMatchObject({ status: "todo", assigneeAgentId: REDACTEUR });
    expect(b.reveils).toHaveLength(1);
    expect(b.portes).toHaveLength(1);

    // Rejeu : refus net, aucun doublon (tâche, réveil, porte).
    const apresLancement = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "conflit" });
    expect(b.instantane()).toBe(apresLancement);

    // Sous porte, la sortie se rattache au document relu : sans document, refus et rien d'écrit ; puis l'agent écrit le livrable et redépose.
    const avantDepot = b.instantane();
    const sansDoc = await b.outils.livrable_deposer({ missionId: mission.id, versionContrat: 1, sortie: SORTIE }, b.run(REDACTEUR, "run-sans-doc", etape.issueId!));
    expect(sansDoc.data).toMatchObject({ code: "livrable_absent" });
    expect(b.instantane()).toBe(avantDepot);
    b.docs.set(etape.issueId!, REVISION);
    const depot = await b.outils.livrable_deposer({ missionId: mission.id, versionContrat: 1, sortie: SORTIE }, b.run(REDACTEUR, "run-redac", etape.issueId!));
    expect(depot.error).toBeUndefined();
    expect(b.missions.get(mission.id)!.etat).toBe("en_revue");
    expect(b.etapes.find((e) => e.missionId === mission.id && e.rang === 1)!.revisionLivrable).toBe(REVISION);
    const revues = await b.creerRevues(etape.issueId!);

    // Plusieurs relecteurs : la porte ne se franchit qu'au dernier PASS.
    const verdict = (role: string) => ({ missionId: mission.id, versionContrat: 1, role, revisionId: REVISION, verdict: "PASS" });
    const relecteurs: Array<[string, string]> = [["exigences", "agent-exigences"], ["metier", "agent-relecteur"], ["technique", "agent-tests-techniques"]];
    for (const [i, [role, agent]] of relecteurs.entries()) {
      expect((await b.outils.verdict_deposer(verdict(role), b.run(agent, `run-${role}`, revues[role]!))).error).toBeUndefined();
      expect(b.missions.get(mission.id)!.etat).toBe(i < relecteurs.length - 1 ? "en_revue" : "attente_autorisation");
    }
    expect(b.verdicts.map((v) => v.role)).toEqual(["exigences", "metier", "technique"]);

    // Aucune étape ne publie : contrat sans effet externe ; verdicts par la route, porte évaluée par la fonction interne, jamais par la route d'évaluation.
    for (const g of GABARIT.etapes) expect(chargerContrat(g.contratId, g.contratVersion).effetExterne).toBe("aucun");
    expect(new Set(b.appelsRoutes)).toEqual(new Set(["tache.verdict", "evaluerPorte"]));
    expect(b.missions.get(mission.id)!.etat).toBe("attente_autorisation");

    // Un `done` sans approbation, ou avec la seule revue terminée, ne vaut pas accord : la tâche est rouverte, la mission attend.
    const tache = b.issues.find((i) => i.id === etape.issueId)!;
    for (const terminees of [[], ["revue"]]) {
      fermer(tache, terminees);
      await b.executeur.surDoneNatif(SOC, tache.id as string);
      expect(tache.status).toBe("in_review");
      expect(b.missions.get(mission.id)!.etat).toBe("attente_autorisation");
    }

    // Approbation humaine native : le livrable est approuvé et la mission close, sans aucun nouveau réveil.
    const reveils = b.reveils.length;
    fermer(tache, ["revue", "approbation"]);
    await b.executeur.surDoneNatif(SOC, tache.id as string);
    expect(b.missions.get(mission.id)!.etat).toBe("cloturee");
    expect(tache.status).toBe("done");
    expect(b.reveils).toHaveLength(reveils);
    // L'événement rejoué ne change plus rien.
    await b.executeur.surDoneNatif(SOC, tache.id as string);
    expect(b.missions.get(mission.id)!.etat).toBe("cloturee");
  });

  it("approbation survenue pendant un arrêt, sans événement : la reprise clôt la mission", async () => {
    const b = monter();
    const { mission, carte } = await brouillon(b, "Écris-moi un post sur LinkedIn");
    b.accepter(carte);
    await b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees: entreesDe("post", "linkedin") });
    const etape = b.etapes.find((e) => e.missionId === mission.id && e.rang === 1)!;
    b.docs.set(etape.issueId!, REVISION);
    await b.outils.livrable_deposer({ missionId: mission.id, versionContrat: 1, sortie: SORTIE }, b.run(REDACTEUR, "run-redac", etape.issueId!));
    const revues = await b.creerRevues(etape.issueId!);
    for (const [role, agent] of [["exigences", "agent-exigences"], ["metier", "agent-relecteur"], ["technique", "agent-tests-techniques"]] as const) {
      await b.outils.verdict_deposer({ missionId: mission.id, versionContrat: 1, role, revisionId: REVISION, verdict: "PASS" }, b.run(agent, `run-${role}`, revues[role]!));
    }
    fermer(b.issues.find((i) => i.id === etape.issueId)!, ["revue", "approbation"]);
    await b.executeur.reprendre(SOC);
    expect(b.missions.get(mission.id)!.etat).toBe("cloturee");
  });
});

describe("mission.lancer : porte refusée au lancement", () => {
  it("erreur conflit lisible avec le motif, mission toujours en attente ; la relance après correction réveille le rédacteur, pas le coordinateur, sans doublon", async () => {
    const b = monter();
    const { mission, carte } = await brouillon(b, "Écris-moi un post sur LinkedIn");
    b.accepter(carte);
    const entrees = entreesDe("post", "linkedin");
    let refus = true;
    b.porte.resolveur = (async () => {
      if (refus) throw new PorteRefusee("Humain responsable inconnu : renseignez humainDestinataire.");
      return <T>(v: T) => v;
    }) as never;
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "conflit", message: expect.stringContaining("humainDestinataire") });
    expect(b.missions.get(mission.id)!.etat).toBe("attente_information");
    expect(b.reveils).toHaveLength(0);
    expect(b.journal.some((j) => j.type === "moteur.porte_refusee")).toBe(true);
    refus = false;
    await b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees });
    expect(b.missions.get(mission.id)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
    expect(b.reveils.map((r) => b.issues.find((i) => i.id === r.issueId)!.assigneeAgentId)).toEqual([REDACTEUR]);
    expect(b.portes).toHaveLength(1);
  });
});

describe("mission.lancer : refus, dans l'ordre, sans rien écrire", () => {
  const entrees = entreesDe("post", "linkedin");
  const prete = async () => {
    const b = monter();
    const { mission, carte } = await brouillon(b, "Écris-moi un post sur LinkedIn");
    return { b, mission, carte };
  };

  it("moteur désactivé", async () => {
    const { b, mission, carte } = await prete();
    b.accepter(carte);
    b.reglage.moteurActif = false;
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "acces_refuse" });
    expect(b.instantane()).toBe(avant);
  });

  it("mission d'une autre entreprise : introuvable", async () => {
    const { b, mission, carte } = await prete();
    b.accepter(carte);
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: "campagne-autre", entrees }, AUTRE)).rejects.toMatchObject({ code: "introuvable" });
    expect(b.instantane()).toBe(avant);
  });

  it("campagne d'une autre entreprise : refusée avant même la carte", async () => {
    const { b, mission } = await prete();
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: "campagne-autre", entrees })).rejects.toMatchObject({ code: "hors_entreprise" });
    await expect(b.lancer({ missionId: mission.id, campagneId: "inexistante", entrees })).rejects.toMatchObject({ code: "hors_entreprise" });
    expect(b.instantane()).toBe(avant);
  });

  it.each([["en attente", "pending"], ["refusée", "rejected"]])("carte %s : refus", async (_nom, statut) => {
    const { b, mission, carte } = await prete();
    carte.status = statut;
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(b.instantane()).toBe(avant);
  });

  it("carte acceptée mais pour une autre mission : refus", async () => {
    const { b, mission, carte } = await prete();
    carte.status = "accepted";
    carte.payload = { ...carte.payload, detailsMarkdown: `Mission : ${id(999)}` };
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(b.instantane()).toBe(avant);
  });

  it("carte acceptée mais créée par un agent : refus", async () => {
    const { b, mission, carte } = await prete();
    b.accepter(carte);
    carte.createdByAgentId = id(2);
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(b.instantane()).toBe(avant);
  });

  it("carte acceptée sans résolveur humain : refus", async () => {
    const { b, mission, carte } = await prete();
    b.accepter(carte);
    carte.resolvedByUserId = null;
    const avant = b.instantane();
    await expect(b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(b.instantane()).toBe(avant);
  });

  it("mandat multiligne portant « Mission : <autre id> » : la carte acceptée n'autorise pas l'autre mission", async () => {
    const b = monter();
    const { mission: autre } = await brouillon(b, "Écris-moi un article");
    await b.envoyer(`Écris-moi un post\nMission : ${autre.id}`);
    const carteDuPost = b.interactions[1]!;
    expect(String(carteDuPost.payload.detailsMarkdown).split("\n").filter((l) => l === `Mission : ${autre.id}`)).toEqual([]);
    b.accepter(carteDuPost);
    const avant = b.instantane();
    await expect(b.lancer({ missionId: autre.id, campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "elevation_refusee" });
    expect(b.instantane()).toBe(avant);
  });

  it("entrées incomplètes : refus listant ce qui manque", async () => {
    const { b, mission, carte } = await prete();
    b.accepter(carte);
    const avant = b.instantane();
    const erreur = await b.lancer({ missionId: mission.id, campagneId: CAMPAGNE, entrees: { canal: "linkedin", typeLivrable: "post" } }).catch((e: unknown) => e) as ErreurAtelier;
    expect(erreur.code).toBe("entree_invalide");
    expect(JSON.stringify(erreur.details)).toContain("objectif");
    expect(b.instantane()).toBe(avant);
  });

  it("corps invalide : refus de validation", async () => {
    const { b } = await prete();
    await expect(b.lancer({ missionId: "", campagneId: CAMPAGNE, entrees })).rejects.toMatchObject({ code: "entree_invalide" });
  });
});
