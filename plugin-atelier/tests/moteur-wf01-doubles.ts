/**
 * Doubles partagés des tests de la chaîne WF-01 (#51) : hôte Paperclip double, base en mémoire qui rejoue les unicités du SQL,
 * vrai `creerEtapesWf01`, double du CRM. Sortis de `moteur-wf01-export.spec.ts` pour servir aussi à `moteur-wf01-integration.spec.ts`.
 */
import type { Empreinte, Prospect } from "../src/contrats/index.js";
import { creerExecuteur, type DepsExecuteur } from "../src/moteur/executeur.js";
import { creerEtapesWf01, type CrmMoteur } from "../src/moteur/export-crm.js";
import { chargerGabarit } from "../src/moteur/gabarits.js";
import type { EtapeMission, Mission } from "../src/serveur/base.js";
import type { ZoneChoisie } from "../src/serveur/regles-prospection.js";
import { chiffrer } from "../src/serveur/chiffrement-donnees.js";
import { creerCrmDouble } from "./outils-crm-double.js";
import { CLES_TEST } from "./outils-cles-donnees.js";

export const SOC = "11111111-1111-4111-8111-111111111111";
export const T = "2026-11-08T10:00:00+01:00";
export const INSTANT = new Date("2026-11-08T10:00:00.000Z");
export const GABARIT = chargerGabarit("wf-01-prospection");
export const EXPORT_CRM = { service: "crm", canal: "courriel", entite: "entite-1" };
export const ENTREES = { brief: "brief", cibles: "cibles", exportCrm: EXPORT_CRM };
export const h = (n: number) => n.toString(16).padStart(64, "0");
/** Source déposée par la tâche du rang 2 : celle que portent les prospects de la mission. */
export const SOURCE_COLLECTE = "00000000-0000-4000-8000-0000000000a1";
/** Autre dépôt : ses prospects ne sont pas ceux de la mission. */
export const SOURCE_AUTRE = "00000000-0000-4000-8000-0000000000a2";

export function prospect(n: number): Prospect {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, companyId: SOC, campagneId: null, cible: "entreprise",
    identifiant: { type: "empreinte", valeur: h(100 + n) }, numeroBce: null,
    referentiel: { version: 1, entite: null, offres: [], segments: [], etablissement: null, cibleProspection: null },
    forme: "personne_morale", denomination: `Société fictive ${n}`, nomChiffre: null, nace: [],
    zone: { codePostal: "4000", commune: "Liège", province: "Liège", region: "Wallonie", pays: "BE" },
    coordonnees: [{ canal: "courriel", valeur: chiffrer(`contact${n}@exemple.invalid`, CLES_TEST.chiffrement), empreinte: h(n), nature: "impersonnelle" }],
    empreintes: [{ type: "courriel", valeur: h(n) }],
    sources: [{ type: "import", sourceId: null, service: null, outil: null, url: null, collecteLe: T }, { type: "depot_signe", sourceId: SOURCE_COLLECTE, service: "bce", outil: "bce_recherche", url: null, collecteLe: T }],
    mode: "reel", statut: "nouveau", motifsExclusion: [], score: null, basesLegales: [], particulier: null, creeLe: T, modifieLe: T,
  };
}
export const P = [1, 2, 3, 4].map(prospect);
/** Prospect de Bruxelles : hors de la zone « 4000 » des essais qui en choisissent une. */
export const PHZ: Prospect = { ...prospect(5), zone: { codePostal: "1000", commune: "Bruxelles", province: null, region: "Bruxelles-Capitale", pays: "BE" } };
export const [P1, P2, P3, P4] = P.map((p) => p.id) as [string, string, string, string];

export function baseMemoire() {
  const missions = new Map<string, Mission>();
  const etapes: EtapeMission[] = [];
  const executions = new Map<string, { statut: string }>();
  const journal: Array<{ type: string; donnees?: Record<string, unknown> }> = [];
  const base = {
    async lireMission(companyId: string, id: string) {
      const m = missions.get(id);
      return m && m.companyId === companyId ? { ...m } : null;
    },
    async missionsActives(companyId: string) {
      return [...missions.values()].filter((m) => m.companyId === companyId && !["cloturee", "annulee", "echec"].includes(m.etat)).map((m) => ({ ...m }));
    },
    async changerEtatMission(companyId: string, id: string, ancien: string, nouveau: string) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.etat !== ancien) return false;
      m.etat = nouveau as Mission["etat"];
      return true;
    },
    async changerRangMission(companyId: string, id: string, ancien: number, nouveau: number) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.rangCourant !== ancien) return false;
      m.rangCourant = nouveau;
      return true;
    },
    async creerEtape(e: { companyId: string; missionId: string; rang: number; role: string; tentative?: number; etat: string; entree?: unknown; issueId?: string | null }) {
      // Unicité (mission, rang, tentative) du SQL.
      if (etapes.some((x) => x.missionId === e.missionId && x.rang === e.rang && x.tentative === (e.tentative ?? 1))) throw new Error(`Étape déjà créée (${e.missionId}, rang ${e.rang}, tentative ${e.tentative ?? 1})`);
      etapes.push({ id: `etape-${etapes.length + 1}`, companyId: e.companyId, missionId: e.missionId, rang: e.rang, role: e.role, tentative: e.tentative ?? 1, etat: e.etat, entree: e.entree ?? null, sortie: null, delaiLe: null, issueId: e.issueId ?? null, revisionLivrable: null, creeLe: "", modifieLe: "" });
      return `etape-${etapes.length}`;
    },
    async lireEtapes(companyId: string, missionId: string) {
      return etapes.filter((e) => e.companyId === companyId && e.missionId === missionId).sort((a, b) => a.rang - b.rang || a.tentative - b.tentative).map((e) => ({ ...e }));
    },
    async majEtape(companyId: string, id: string, c: Record<string, unknown>) {
      const e = etapes.find((x) => x.companyId === companyId && x.id === id);
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
    async lireExecution(companyId: string, cle: string) {
      return executions.get(`${companyId}|${cle}`) ?? null;
    },
    async journaliser(e: { type: string; donnees?: Record<string, unknown> }) {
      journal.push({ type: e.type, donnees: e.donnees });
    },
  };
  return { base, missions, etapes, journal, executions };
}

/** Hôte double : `list` rend la politique et l'état natifs à null, `get` les rend, le réveil refuse comme le vrai hôte (sans assigné, statut non réveillable, bloqueur non terminé). */
export function hoteDouble() {
  const issues = new Map<string, Record<string, unknown>>();
  const creations: Array<Record<string, unknown>> = [];
  const reveils: string[] = [];
  const commentaires: Array<{ issueId: string; body: string }> = [];
  const hote = {
    issues: {
      // Comme l'hôte : la tâche doit exister dans l'entreprise.
      async createComment(issueId: string, body: string, companyId: string) {
        if (issues.get(issueId)?.companyId !== companyId) throw new Error("Issue not found");
        commentaires.push({ issueId, body });
        return {};
      },
      // Comme l'hôte : une tâche hors de l'entreprise rend une liste vide, sans erreur.
      async listComments(issueId: string, companyId: string) {
        if (issues.get(issueId)?.companyId !== companyId) return [];
        return commentaires.filter((c) => c.issueId === issueId).map((c) => ({ body: c.body }));
      },
      async create(i: Record<string, unknown>) {
        const id = `issue-${issues.size + 1}`;
        creations.push(i);
        issues.set(id, { id, ...i });
        return { id };
      },
      async list(f: { originId?: string }) {
        return [...issues.values()].filter((i) => i.originId === f.originId).map((i) => ({ ...i, executionPolicy: null, executionState: null }));
      },
      async get(id: string, companyId: string) {
        const i = issues.get(id);
        return i && i.companyId === companyId ? { executionPolicy: null, executionState: null, ...i } : null;
      },
      async update(id: string, patch: Record<string, unknown>) {
        Object.assign(issues.get(id) ?? {}, patch, { updatedAt: new Date(INSTANT.getTime() + issues.size).toISOString() });
        return {};
      },
      async requestWakeup(issueId: string) {
        const tache = issues.get(issueId);
        if (!tache?.assigneeAgentId) throw new Error("Issue has no assigned agent to wake");
        if (["backlog", "done", "cancelled"].includes(String(tache.status))) throw new Error("Issue is not wakeable");
        if (((tache.blockedByIssueIds as string[] | undefined) ?? []).some((b) => issues.get(b)?.status !== "done")) throw new Error("Issue is blocked by unresolved blockers");
        reveils.push(issueId);
        return {};
      },
    },
    async resoudreAgent(_companyId: string, role: string) {
      return `agent-${role}`;
    },
  };
  return { hote, issues, creations, reveils, commentaires };
}

export const porte = {
  async creerPorte() { return true; },
  async majPolitique(..._args: unknown[]): Promise<unknown> { return {}; },
  async conformiteImposee() { return false; },
  async exigences() { return ["EXI-1"]; },
  async resolveur() { return <T>(v: T) => v; },
};

export interface OptionsBanc { entrees?: Record<string, unknown>; oppositions?: Empreinte[]; sansEtapesCode?: boolean; zone?: ZoneChoisie; crm?: CrmMoteur; collecte?: string[]; prospects?: Prospect[]; sourcesEnPanne?: boolean }

export async function monter(opts: OptionsBanc = {}) {
  const m = baseMemoire();
  const h2 = hoteDouble();
  const crm = creerCrmDouble();
  const docs = new Map<string, string>();
  const lireProspects = async (_c: string, ids: string[]) => ids.flatMap((id) => [...P, PHZ, ...(opts.prospects ?? [])].filter((p) => p.id === id));
  // Comme la vraie base : les sources de la tâche du rang 2 de CETTE mission, de CETTE entreprise ; sans tâche au rang 2, aucune.
  const sourcesCollecte = async (companyId: string, missionId: string) => {
    if (opts.sourcesEnPanne) throw new Error("base indisponible");
    const tache = (await m.base.lireEtapes(companyId, missionId)).find((e) => e.rang === 2 && e.tentative === 1)?.issueId;
    return tache ? (opts.collecte ?? [SOURCE_COLLECTE]) : [];
  };
  const contexteExclusions = async () => ({ contexte: { maintenant: T, modeCampagne: "reel" as const, canaux: [], zone: opts.zone ?? null, clientsActuels: [] }, oppositions: opts.oppositions ?? [] });
  const etapesCode = creerEtapesWf01({ lireProspects, sourcesCollecte, contexteExclusions, deps: { crm: opts.crm ?? crm, base: m.base as never } });
  // Comme l'hôte : la politique posée est écrite sur la tâche, chaque étape reçoit un identifiant.
  const porteDouble = {
    ...porte,
    async majPolitique(issueId: string, _companyId: string, politique: { stages: Array<Record<string, unknown>> }) {
      Object.assign(h2.issues.get(issueId) ?? {}, { executionPolicy: { ...politique, stages: politique.stages.map((s, i) => ({ id: `etape-${i + 1}`, ...s })) } });
      return {};
    },
  };
  const executeur = creerExecuteur({
    hote: h2.hote as never, base: m.base as unknown as DepsExecuteur["base"], porte: porteDouble as never, horloge: () => INSTANT,
    revisionLivrable: async (_c, issueId) => docs.get(issueId) ?? null, chargerGabarit: () => GABARIT, ...(opts.sansEtapesCode ? {} : { etapesCode }),
  });
  const missionId = "mission-1";
  m.missions.set(missionId, { id: missionId, companyId: SOC, gabaritCle: "wf-01-prospection", gabaritVersion: 1, contratId: "wf-01-prospection", contratVersion: 1, mandat: "mandat", etat: "prete", etatAvantPause: null, rangCourant: 0, enveloppeCents: 0, campagneId: "campagne-1", issueRacineId: null, creeLe: "", modifieLe: "" } as Mission);
  await m.base.creerEtape({ companyId: SOC, missionId, rang: 1, role: "prospection", etat: "en_attente", entree: opts.entrees ?? ENTREES });
  const issueDuRang = (rang: number) => m.etapes.find((e) => e.rang === rang)!.issueId!;
  const deposer = (rang: number, sortie: unknown, revisionLivrable?: string) =>
    executeur.recevoirResultat(SOC, { missionId, rang, tentative: 1, sortie, ...(revisionLivrable ? { revisionLivrable } : {}) });
  return { ...m, ...h2, crm, docs, executeur, etapesCode, missionId, issueDuRang, deposer };
}

export const LIMITES = ["aucune limite"];
/** Approbation native : `done` et les étapes d'approbation de la politique posée sur la tâche, marquées franchies. */
export const approbationNative = (tache: Record<string, unknown>) => ({
  status: "done",
  executionState: { completedStageIds: ((tache.executionPolicy as { stages: Array<{ id: string; type: string }> }).stages).filter((s) => s.type === "approval").map((s) => s.id) },
});
/** Mène la mission du lancement à `attente_autorisation` : quatre étapes d'agent, trois étapes en code avant la porte, verdict accepté. */
export async function jusquAutorisation(opts: OptionsBanc & { lot?: string[] } = {}) {
  const t = await monter(opts);
  await t.executeur.demarrerMission(SOC, t.missionId);
  await t.deposer(2, { reponsesBrutesSignees: ["rep-1"], prospectIds: [P1, P2, P3, P1], limites: LIMITES });
  await t.deposer(4, { reponsesBrutesSignees: ["rep-1"], qualification: "qualifiés", personnesOpposeesMarquees: [], limites: LIMITES });
  await t.deposer(5, { prospectIds: [P1, P2, P3], limites: LIMITES });
  t.docs.set(t.issueDuRang(7), "rev-1");
  await t.deposer(7, { prospectIds: opts.lot ?? [P1, P2, P3], limites: LIMITES }, "rev-1");
  await t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 7, tentative: 1, accepte: true, runId: "run-r1" });
  const issue = t.issueDuRang(7);
  const natif = (patch: Record<string, unknown>) => void Object.assign(t.issues.get(issue)!, patch);
  const approuver = () => natif(approbationNative(t.issues.get(issue)!));
  return { ...t, issue, natif, approuver, etat: () => t.missions.get(t.missionId)!.etat };
}
