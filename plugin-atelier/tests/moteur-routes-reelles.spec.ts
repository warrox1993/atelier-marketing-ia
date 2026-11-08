/**
 * Moteur de missions (#50) : l'outil `verdict_deposer` passe par les VRAIES routes du plugin (`tache.couverture`,
 * `tache.verdict`) et par la vraie évaluation de la porte (`creerServices`), sans double. Seuls la mission, ses étapes
 * et l'exécuteur (espion sur `deposerVerdict`) sont simulés. La tâche `ISSUE` joue l'étape courante de la mission.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolResult } from "@paperclipai/plugin-sdk";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { ORIGINE_ETAPE } from "../src/moteur/executeur.js";
import { chargerGabarit } from "../src/moteur/gabarits.js";
import { creerOutilsMoteur, type ErreurOutil } from "../src/moteur/outils.js";
import type { EtapeMission, Mission } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { CAMP, ISSUE, PRODUCTEUR, REV1, REV2, SOC, creerBanc } from "./outils-base.js";

const MISSION = "mission-1";
const AG_EXIGENCES = "agent-exigences";
const AG_METIER = "agent-relecteur";
const AG_TECHNIQUE = "agent-tests-techniques";
const AG_AUTRE = "agent-autre";
const GABARIT = chargerGabarit("contenu-reseau-social");
const ROLES = [{ role: "exigences", agentId: AG_EXIGENCES }, { role: "metier", agentId: AG_METIER }, { role: "technique", agentId: AG_TECHNIQUE }];
const agentDe = (id: string, slug: string) => ({ id, status: "idle", companyId: SOC, metadata: { atelier: { slug } } });
const AGENTS = [agentDe(PRODUCTEUR, "contenus"), agentDe(AG_EXIGENCES, "exigences"), agentDe(AG_METIER, "relecteur"), agentDe(AG_TECHNIQUE, "tests-techniques"), agentDe(AG_AUTRE, "autre")];

const acteur = (agentId: string): ActeurHote => ({ type: "agent", id: agentId, agentId, userId: null, runId: `run-${agentId}` });
const COUVERTURE = { revisionId: REV1, lignes: [{ code: "REQ-001", etat: "couvert", preuves: [{ revisionId: REV1, extrait: "Seraing", emplacement: "ligne 3", element: null }] }] };
/** Le contrôleur des exigences déclare l'exigence ciblée examinée, sans quoi la porte refuse (exigence_non_examinee). */
const verdict = (role: string, v: "PASS" | "CHANGES_REQUESTED" = "PASS", extra: Record<string, unknown> = {}) =>
  ({ missionId: MISSION, versionContrat: 1, role, revisionId: REV1, verdict: v, ...(role === "exigences" ? { exigencesExaminees: ["REQ-001"] } : {}), ...extra });
const CONSTAT = { requirementIds: [], categorie: "affirmation_non_sourcee", gravite: "majeure", emplacement: "ligne 3", description: "Adresse fausse", preuve: "fiche", correctionAttendue: "corriger" };
const erreurDe = (r: ToolResult) => { expect(r.error).toBeTruthy(); return r.data as ErreurOutil; };

/** Banc sous porte : trois revues requises aux rôles du gabarit, mission en revue dont l'étape courante est `ISSUE`. */
function monter() {
  const banc = creerBanc();
  banc.tacheSousPorte({ status: "in_progress", etape: null, corps: "# Page\n\nSeraing, quai du Test 3.", revuesRequises: ROLES });
  banc.t.portes[0]!.exigencesCiblees = ["REQ-001"];
  // L'exigence ciblée existe dans la campagne : sans elle, la vraie porte refuse (exigence_inconnue).
  banc.t.exigences.push({ id: "ex-1", code: "REQ-001", companyId: SOC, campagneId: CAMP, version: 1, obligatoire: true, criteres: [], dependances: [], elementsAttendus: [], exclusion: { etat: "aucune" }, modifieLe: banc.horloge() });
  const services = creerServices(banc.ctx, { base: banc.base });
  const mission = { id: MISSION, companyId: SOC, gabaritCle: GABARIT.cle, gabaritVersion: GABARIT.version, contratId: "wf-c-contenu", contratVersion: 1, mandat: "m", etat: "en_revue", etatAvantPause: null, rangCourant: 1, enveloppeCents: 0, campagneId: null, issueRacineId: null, creeLe: "", modifieLe: "" } as Mission;
  const etape = { id: "etape-1", companyId: SOC, missionId: MISSION, rang: 1, role: "contenus", tentative: 1, etat: "en_cours", entree: null, sortie: null, delaiLe: null, issueId: ISSUE, revisionLivrable: REV1, creeLe: "", modifieLe: "" } as EtapeMission;
  const runs = new Map<string, string>();
  const deposes: Array<{ accepte: boolean }> = [];
  const outils = creerOutilsMoteur({
    config: async () => ({ moteurMissions: true }),
    base: { lireMission: async () => mission, lireEtapes: async () => [etape], listerSources: async () => [] } as never,
    tacheDuRun: async (_c, runId) => runs.get(runId) ?? null,
    agents: async () => AGENTS,
    executeur: { recevoirResultat: async () => { throw new Error("hors sujet"); }, deposerVerdict: async (_c: string, d: { accepte: boolean }) => { deposes.push(d); return { statut: "ok", etat: "attente_autorisation" }; } } as never,
    issues: banc.ctx.issues,
    routes: { "tache.verdict": services.routes["tache.verdict"]! },
    evaluerPorte: services.evaluerPorte!,
    revisionLivrable: async () => REV1,
    chargerGabarit: () => GABARIT,
  });
  const route = (cle: "tache.couverture" | "tache.verdict", agentId: string, corps: unknown) =>
    services.routes[cle]!({ cle, params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: acteur(agentId), corps });
  /** Sous-tâche de revue réelle (créée par la route de couverture) d'un rôle. */
  const revueDe = (role: string) => [...banc.issues.values()].find((i) => i.originKind?.endsWith(":revue") && String(i.originId).endsWith(`:${role}`))!;
  /** L'agent dépose par l'outil, depuis sa propre sous-tâche de revue (ou celle de `surRevueDe`). */
  const deposer = (agentId: string, params: Record<string, unknown>, surRevueDe = String(params.role)) => {
    runs.set(`run-${agentId}`, revueDe(surRevueDe).id);
    return outils.verdict_deposer(params, { agentId, runId: `run-${agentId}`, companyId: SOC, projectId: "projet" });
  };
  return { banc, route, revueDe, deposer, deposes };
}

describe("verdict_deposer par les vraies routes du plugin", () => {
  let b: ReturnType<typeof monter>;
  beforeEach(async () => {
    b = monter();
    // L'étape d'une mission du moteur porte l'origine de mission, comme `creerExecuteur` la pose.
    Object.assign(b.banc.issues.get(ISSUE)!, { originKind: ORIGINE_ETAPE, originId: `mission:${MISSION}:1` });
    expect((await b.route("tache.couverture", PRODUCTEUR, COUVERTURE)).statut).toBe(201);
  });

  it("la route de couverture crée une sous-tâche de revue par rôle, qui nomme la mission", () => {
    const revues = [...b.banc.issues.values()].filter((i) => i.originKind?.endsWith(":revue"));
    expect(revues.map((i) => String(i.originId).split(":").pop()).sort()).toEqual(["exigences", "metier", "technique"]);
    for (const r of revues) {
      expect(r.parentId).toBe(ISSUE);
      expect(r.description).toContain(`mission « ${MISSION} »`);
      expect(r.description).toContain("verdict_deposer");
    }
  });

  it("un PASS seul, une autre revue manquant : verdict enregistré, en_attente_revues, deposerVerdict non appelé", async () => {
    const r = await b.deposer(AG_EXIGENCES, verdict("exigences"));
    expect(r.error).toBeUndefined();
    expect((r.data as { statut: string }).statut).toBe("en_attente_revues");
    expect(b.banc.t.verdicts.map((v) => [v.role, v.verdict, v.relecteurId])).toEqual([["exigences", "PASS", AG_EXIGENCES]]);
    expect(b.deposes).toHaveLength(0);
  });

  it("tous les relecteurs en PASS : la vraie porte rend PASS, deposerVerdict appelé une fois avec accepte true, jamais role_non_autorise", async () => {
    const rs = [await b.deposer(AG_EXIGENCES, verdict("exigences")), await b.deposer(AG_METIER, verdict("metier")), await b.deposer(AG_TECHNIQUE, verdict("technique"))];
    for (const r of rs) expect((r.data as { code?: string }).code).not.toBe("role_non_autorise");
    expect(rs.map((r) => r.error)).toEqual([undefined, undefined, undefined]);
    expect(b.banc.t.verdicts).toHaveLength(3);
    expect(b.banc.t.evaluations.at(-1)?.decision).toBe("PASS");
    expect(b.deposes).toEqual([expect.objectContaining({ accepte: true })]);
    expect((rs[2]!.data as { statut: string }).statut).toBe("ok");
  });

  it("un agent qui n'est pas le relecteur désigné du rôle est refusé par la route : aucun verdict, deposerVerdict non appelé", async () => {
    const e = erreurDe(await b.deposer(AG_METIER, verdict("exigences"), "exigences"));
    expect(e.code).toBe("role_non_autorise");
    expect(b.banc.t.verdicts).toHaveLength(0);
    expect(b.deposes).toHaveLength(0);
  });

  it("un agent étranger à la mission est refusé (droit_refuse), rien n'est écrit", async () => {
    const e = erreurDe(await b.deposer(AG_AUTRE, verdict("exigences"), "exigences"));
    expect(e.code).toBe("droit_refuse");
    expect(b.banc.t.verdicts).toHaveLength(0);
    expect(b.deposes).toHaveLength(0);
  });

  it("le producteur ne peut pas relire : refus réel, rien n'est écrit", async () => {
    const e = erreurDe(await b.deposer(PRODUCTEUR, verdict("exigences"), "exigences"));
    expect(e.code).toBe("droit_refuse");
    expect(b.banc.t.verdicts).toHaveLength(0);
    expect(b.deposes).toHaveLength(0);
  });

  it("une révision périmée (document modifié depuis la revue) est refusée : revision_perimee", async () => {
    b.banc.documents.get(`${ISSUE}:livrable`)!.latestRevisionId = REV2;
    const e = erreurDe(await b.deposer(AG_EXIGENCES, verdict("exigences")));
    expect(e.code).toBe("revision_perimee");
    expect(b.banc.t.verdicts).toHaveLength(0);
    expect(b.deposes).toHaveLength(0);
  });

  it("CHANGES_REQUESTED : verdict et constat enregistrés, deposerVerdict appelé avec accepte false", async () => {
    const r = await b.deposer(AG_METIER, verdict("metier", "CHANGES_REQUESTED", { constats: [CONSTAT] }));
    expect(r.error).toBeUndefined();
    expect(b.banc.t.verdicts.map((v) => [v.role, v.verdict])).toEqual([["metier", "CHANGES_REQUESTED"]]);
    expect(b.banc.t.constats).toHaveLength(1);
    expect(b.deposes).toEqual([expect.objectContaining({ accepte: false })]);
  });
});
