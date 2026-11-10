/**
 * Moteur de missions (#50) : l'outil `verdict_deposer` passe par les VRAIES routes du plugin (`tache.couverture`,
 * `tache.verdict`) et par la vraie évaluation de la porte (`creerServices`), sans double. Seuls la mission, ses étapes
 * et l'exécuteur (espion sur `deposerVerdict`) sont simulés. La tâche `ISSUE` joue l'étape courante de la mission.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolResult } from "@paperclipai/plugin-sdk";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerCrmProduction } from "../src/moteur/branchement.js";
import { exporterLot, type CrmMoteur } from "../src/moteur/export-crm.js";
import { ORIGINE_ETAPE } from "../src/moteur/executeur.js";
import { chargerGabarit } from "../src/moteur/gabarits.js";
import { creerOutilsMoteur, type ErreurOutil } from "../src/moteur/outils.js";
import type { EtapeMission, Mission } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { CAMP, ISSUE, PRODUCTEUR, REV1, REV2, SOC, creerBanc } from "./outils-base.js";
import { avecClesDonnees, REFS_CLES } from "./outils-cles-donnees.js";
import { P1, P2, P4, SOC as SOC_WF01, h, jusquAutorisation, prospect } from "./moteur-wf01-doubles.js";

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

/**
 * Câblage de production de l'export CRM de WF-01 (#51, tâche 4) : la vraie route `tache.prospects.exporter` et les vraies lectures des services
 * (`lecturesMoteur`) sur le banc ; seules les lectures et écritures de la base sont celles du banc (copies en mémoire).
 * Le moteur d'une entreprise sans réglage ne fait rien : `moteurActif` (config vide), moteur-executeur.spec.ts, « moteurActif ».
 */
describe("export CRM de production de WF-01 par la vraie route", () => {
  const AUTRE_SOC = "99999999-9999-4999-8999-999999999999";
  const MISSION_WF01 = "mission-wf01";
  /** Base légale du courriel impersonnel d'une personne morale, telle que la base la rend (colonnes SQL). */
  const BASE_LEGALE = {
    cible: "entreprise", forme: "personne_morale", canal: "courriel", base: "personne_morale_adresse_impersonnelle", nature_adresse: "impersonnelle",
    preuve: { type: "source", reference: "Registre public, contact déclaré info@", date: "2026-11-08T10:00:00.000Z" },
    information: { texteArt14: "Nous avons trouvé votre adresse professionnelle dans un registre public.", moyenOpposition: "Lien de désinscription" },
    verifie_le: "2026-11-08T10:00:00.000Z", verifie_par: "systeme",
  };
  const PORTEE_MODIFIER_CRM = { revisionId: REV1, action: "modifier_crm", canal: "crm", compte: null, audience: null, montantMaxCents: null, dureeJours: null };
  const IDENTIFIANT_INCONNU = "00000000-0000-4000-8000-0000000000ff";

  function monterExport(o: { oppositionsAReimporter?: number; sansBaseLegale?: string[]; oppositionSur?: number } = {}) {
    const banc = creerBanc({ modeEntreprise: "demonstration", config: { ...REFS_CLES } });
    avecClesDonnees(banc.ctx);
    banc.tacheSousPorte({ status: "done", etape: null, corps: "# Prospects\n\nLot du jour." });
    // Tâche approuvée nativement (done) et contrôle automatique réussi sur la révision : seule la décision humaine modifier_crm manque dans les essais qui la refusent.
    banc.passe();
    const prospects = [prospect(1), prospect(2), { ...prospect(3), companyId: AUTRE_SOC }, prospect(4)];
    const lectures: string[] = [];
    const exports: Array<Record<string, unknown>> = [];
    const appels: Array<Record<string, unknown>> = [];
    Object.assign(banc.base, {
      lireMission: async (companyId: string, id: string) => (companyId === SOC && id === MISSION_WF01 ? { id, companyId: SOC, gabaritCle: "wf-01-prospection", gabaritVersion: 1, campagneId: null } : null),
      lireEtapes: async () => [
        { rang: 1, tentative: 1, role: "prospection", issueId: null, entree: { exportCrm: { service: "crm", canal: "courriel", entite: "entite-1" } } },
        { rang: 7, tentative: 1, role: "prospection", issueId: ISSUE, entree: null },
      ],
      compterAReimporter: async () => ({ prospects: 0, clients: 0, imports: 0, oppositions: o.oppositionsAReimporter ?? 0 }),
      // Lecture filtrée par entreprise, comme le SQL (`where company_id = $1 and id = $2`).
      lireProspect: async (companyId: string, id: string) => { lectures.push(`${companyId}:${id}`); const p = prospects.find((x) => x.companyId === companyId && x.id === id); return p ? { ...p, empreintes: undefined, score: null, basesLegales: undefined } : null; },
      detailsProspects: async (_c: string, ids: string[]) => ({ empreintes: new Map(ids.map((id) => [id, prospects.find((p) => p.id === id)!.empreintes])), scores: new Map(), bases: new Map(ids.map((id) => [id, o.sansBaseLegale?.includes(id) ? [] : [BASE_LEGALE]])) }),
      oppositionsPour: async (_c: string, valeurs: string[]) => valeurs.filter((v) => o.oppositionSur !== undefined && v === h(o.oppositionSur)).map((valeur) => ({ type: "courriel", valeur })),
      referentielProspection: async () => ({ renvoi: null, versionMarque: 1 }),
      empreintesProspectsEnBase: async () => [],
      clientsActuelsPour: async () => [],
      lireExportCrmParCle: async (companyId: string, c: string) => exports.find((e) => e.companyId === companyId && e.cleIdempotence === c) ?? null,
      insererExportCrm: async (e: Record<string, unknown>) => void exports.push(e),
      // Filtrées par service et par mode, comme le SQL.
      prospectDansExportNonRefuse: async (companyId: string, id: string, service: string, mode: string, issueId: string) => exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && e.etat !== "refusee" && (banc.t.diffusions.find((d) => d.id === e.diffusionId)?.etat !== "preparee" || e.issueId !== issueId) && (e.prospectIds as string[]).includes(id)),
      prospectExportConfirme: async (companyId: string, id: string, service: string, mode: string) => exports.some((e) => e.companyId === companyId && e.service === service && e.mode === mode && (e.prospectIds as string[]).includes(id) && ["simulee", "confirmee"].includes(String(banc.t.diffusions.find((d) => d.id === e.diffusionId)?.etat))),
      lireAppelParEmpreinte: async (_c: string, _i: string, rev: string, empreinte: string) => appels.find((a) => a.revisionId === rev && a.empreinte === empreinte) ?? null,
      insererAppel: async (a: Record<string, unknown>) => void appels.push({ ...a, creeLe: banc.horloge() }),
    });
    const services = creerServices(banc.ctx, { base: banc.base });
    const crm = creerCrmProduction(banc.base as never, services.routes["tache.prospects.exporter"]!, (c, campagneId) => services.lecturesMoteur!.modeMoteur!(c, campagneId));
    // Exécutions du moteur (clés d'effets externes), en mémoire.
    const executions = new Map<string, { statut: string }>();
    const baseExec = {
      lireExecution: async (_c: string, k: string) => executions.get(k) ?? null,
      enregistrerExecution: async (e: { cle: string }) => (executions.has(e.cle) ? false : (executions.set(e.cle, { statut: "demandee" }), true)),
      marquerExecution: async (_c: string, k: string, statut: string) => { const x = executions.get(k); if (x) x.statut = statut; return Boolean(x); },
    };
    /** Une passe de l'export du moteur (le vrai `exporterLot`, le vrai CRM de production, la vraie route). */
    const passe = (ids: string[]) => exporterLot({ crm, base: baseExec as never }, { companyId: SOC, id: MISSION_WF01 }, 9, ids.map((prospectId) => ({ prospectId, marqueOpposition: false })));
    return { banc, services, crm, exports, lectures, executions, passe };
  }
  const nonRefuses = (m: ReturnType<typeof monterExport>) => m.exports.filter((e) => e.etat !== "refusee");
  /** Le vrai CRM de production vu par l'exécuteur : le banc de la route ne connaît que sa mission, l'exécuteur a la sienne. */
  const crmReelPourExecuteur = (m: ReturnType<typeof monterExport>): CrmMoteur => ({
    existe: (c, _mission, p) => m.crm.existe(c, MISSION_WF01, p),
    confirme: (c, _mission, p) => m.crm.confirme(c, MISSION_WF01, p),
    ecrire: (c, e) => m.crm.ecrire(c, { ...e, missionId: MISSION_WF01 }),
  });

  it("bout en bout (exécuteur, étapes en code, vraie route) : approuvée sans décision, la mission attend sans écrire ni consommer d'essai ; avec la décision, un seul export et cloturee", async () => {
    const m = monterExport();
    const t = await jusquAutorisation({ crm: crmReelPourExecuteur(m), lot: [P1, P2] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC_WF01, t.issue);
    await t.executeur.reprendre(SOC_WF01);
    await t.executeur.reprendre(SOC_WF01);
    await t.executeur.reprendre(SOC_WF01);
    expect(t.etat()).toBe("en_execution");
    expect(m.exports).toHaveLength(0);
    expect(m.banc.t.diffusions).toHaveLength(0);
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "en_cours", sortie: { reussis: [], echecs: [], essais: 0, enAttente: true } });
    expect(t.journal.filter((j) => j.type === "moteur.export_en_attente")).toHaveLength(1);

    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    await t.executeur.reprendre(SOC_WF01);
    expect(t.etat()).toBe("cloturee");
    expect(m.exports).toHaveLength(1);
    expect(m.exports[0]).toMatchObject({ prospectIds: [P1, P2], etat: "simulee" });
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(t.etapes.find((e) => e.rang === 9)).toMatchObject({ etat: "terminee", sortie: { reussis: [P1, P2], echecs: [], essais: 1 } });
    expect(t.etapes.find((e) => e.rang === 10)).toMatchObject({ etat: "terminee", sortie: { verifies: 2 } });
  });

  it("bout en bout : un prospect sans base légale part en blocage export_partiel après trois essais, l'autre est exporté une seule fois, le motif est au journal", async () => {
    const m = monterExport({ sansBaseLegale: [P2] });
    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    const t = await jusquAutorisation({ crm: crmReelPourExecuteur(m), lot: [P1, P2] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC_WF01, t.issue);
    await t.executeur.reprendre(SOC_WF01);
    await t.executeur.reprendre(SOC_WF01);
    expect(t.etat()).toBe("blocage");
    expect(nonRefuses(m).map((e) => e.prospectIds)).toEqual([[P1]]);
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(t.journal.filter((j) => j.type === "moteur.export_partiel").at(-1)?.donnees).toMatchObject({ reussis: [P1], echecs: [{ prospectId: P2, raison: expect.stringMatching(/\S/u) }], essais: 3 });
  });

  it("sans décision humaine modifier_crm : en attente, aucun export, aucun échec ; la passe suivante rejoue la même clé", async () => {
    const m = monterExport();
    const r = await m.passe([P1, P2]);
    expect(r).toMatchObject({ reussis: [], echecs: [], attente: { appelId: expect.any(String), consigne: expect.stringContaining("modifier_crm") } });
    expect(m.banc.t.diffusions).toHaveLength(0);
    expect(m.exports).toHaveLength(0);
    expect(await m.crm.existe(SOC, MISSION_WF01, P1)).toBe(false);
    await m.passe([P1, P2]);
    expect(m.executions.size).toBe(1);
    expect(m.banc.t.journal.filter((j) => j.type === "prospects.export_en_attente")).toHaveLength(0);
  });

  it("attente vue du moteur : aucune ligne prospects.export_en_attente, une seule moteur.export_en_attente (#62)", async () => {
    const m = monterExport();
    const t = await jusquAutorisation({ crm: crmReelPourExecuteur(m), lot: [P1, P2] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC_WF01, t.issue);
    for (let i = 0; i < 3; i++) await t.executeur.reprendre(SOC_WF01);
    expect(m.banc.t.journal.filter((j) => j.type === "prospects.export_en_attente")).toHaveLength(0);
    expect(t.journal.filter((j) => j.type === "moteur.export_en_attente")).toHaveLength(1);
  });

  it("agent qui demande deux fois l'export sans décision : une ligne par demande (#62)", async () => {
    const m = monterExport();
    const corps = { prospectIds: [P1], service: "crm", canal: "courriel", entite: "entite-1", cleIdempotence: "cle-de-l-agent" };
    const agent = { type: "agent" as const, id: "agent-x", agentId: "agent-x", userId: null, runId: "run-x" };
    for (let i = 0; i < 2; i++) {
      expect((await m.services.routes["tache.prospects.exporter"]!({ cle: "tache.prospects.exporter", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps })).statut).toBe(202);
    }
    expect(m.banc.t.journal.filter((j) => j.type === "prospects.export_en_attente")).toHaveLength(2);
  });

  it("une approbation d'une autre portée que modifier_crm sur ce CRM ne suffit pas", async () => {
    const m = monterExport();
    m.banc.decision({ portee: { ...PORTEE_MODIFIER_CRM, action: "publier", canal: "linkedin" } });
    expect((await m.passe([P1])).attente).not.toBeNull();
    expect(m.banc.t.diffusions).toHaveLength(0);
  });

  it("avec la décision humaine : UN seul export contenant les deux prospects, une diffusion, et la passe rejouée ne crée rien de plus", async () => {
    const m = monterExport();
    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    const r = await m.passe([P1, P2]);
    expect(r).toEqual({ reussis: [P1, P2], echecs: [], attente: null, execution: null, blocage: null });
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(m.banc.t.diffusions[0]).toMatchObject({ action: "modifier_crm", etat: "simulee" });
    expect(m.exports).toHaveLength(1);
    expect(m.exports[0]).toMatchObject({ prospectIds: [P1, P2], issueId: ISSUE, entite: "entite-1", service: "crm", canal: "courriel", etat: "simulee" });
    expect(String(m.exports[0]!.cleIdempotence)).toMatch(/^moteur:mission-wf01:9:1:export_crm:[0-9a-f]{32}$/u);
    expect(await m.crm.existe(SOC, MISSION_WF01, P1)).toBe(true);
    expect(await m.crm.confirme(SOC, MISSION_WF01, P2)).toBe(true);
    expect(await m.crm.existe(SOC, MISSION_WF01, P4)).toBe(false);
    expect(await m.passe([P1, P2])).toEqual({ reussis: [P1, P2], echecs: [], attente: null, execution: null, blocage: null });
    expect(m.banc.t.diffusions).toHaveLength(1);
    expect(m.exports).toHaveLength(1);
  });

  it("un prospect sans base légale, avec décision : 1er appel refusé, 2e sans lui accepté, le refusé listé avec son motif, une passe de plus n'écrit rien", async () => {
    const m = monterExport({ sansBaseLegale: [P2] });
    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    const r = await m.passe([P1, P2]);
    expect(r.reussis).toEqual([P1]);
    expect(r.attente).toBeNull();
    expect(r.echecs).toEqual([{ prospectId: P2, raison: expect.stringMatching(/\S/u) }]);
    expect(m.exports.map((e) => [e.etat, e.prospectIds])).toEqual([["refusee", [P1, P2]], ["simulee", [P1]]]);
    expect(m.banc.t.diffusions).toHaveLength(1);
    const avant = nonRefuses(m).length;
    const encore = await m.passe([P1, P2]);
    expect(encore.reussis).toEqual([P1]);
    expect(encore.echecs).toHaveLength(1);
    expect(nonRefuses(m)).toHaveLength(avant);
    expect(m.banc.t.diffusions).toHaveLength(1);
    await m.passe([P1, P2]);
    expect(nonRefuses(m)).toHaveLength(avant);
  });

  it("201 prospects : refusés par la route (limite de 200), tous en échec, aucun export", async () => {
    const m = monterExport();
    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1000).padStart(12, "0")}`);
    const r = await m.passe(ids);
    expect(r.reussis).toEqual([]);
    expect(r.echecs.map((e) => e.prospectId)).toEqual(ids);
    expect(m.exports).toHaveLength(0);
  });

  it("un prospect marqué par une opposition : jamais de refus pour ce motif, il est exporté avec les autres", async () => {
    const m = monterExport({ oppositionSur: 2 });
    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    expect(await m.passe([P1, P2])).toEqual({ reussis: [P1, P2], echecs: [], attente: null, execution: null, blocage: null });
    expect(m.exports).toHaveLength(1);
    expect(m.banc.t.journal.map((j) => j.type)).not.toContain("prospects.export_refusee");
  });

  it("la clé « moteur: » est réservée à l'acteur système : un agent qui la demande est refusé, rien n'est écrit", async () => {
    const m = monterExport();
    m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
    const corps = { prospectIds: [P1], service: "crm", canal: "courriel", entite: "entite-1", cleIdempotence: "moteur:occupee-par-un-agent" };
    const agent = { type: "agent" as const, id: "agent-x", agentId: "agent-x", userId: null, runId: "run-x" };
    await expect(m.services.routes["tache.prospects.exporter"]!({ cle: "tache.prospects.exporter", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: agent, corps })).rejects.toMatchObject({ code: "acces_refuse" });
    expect(m.exports).toHaveLength(0);
    expect(m.banc.t.diffusions).toHaveLength(0);
    const systeme = { type: "systeme" as const, id: "moteur-missions", agentId: null, userId: null, runId: null };
    expect((await m.services.routes["tache.prospects.exporter"]!({ cle: "tache.prospects.exporter", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: systeme, corps })).statut).toBe(201);
  });

  describe("clé export:moteur: de la route tache.diffusions", () => {
    const AGENT: ActeurHote = { type: "agent", id: "agent-x", agentId: "agent-x", userId: null, runId: "run-x" };
    const HUMAIN: ActeurHote = { type: "humain", id: "jb", agentId: null, userId: "jb", runId: null };
    const demander = (m: ReturnType<typeof monterExport>, acteur: ActeurHote, cleIdempotence: string) =>
      m.services.routes["tache.diffusions"]!({ cle: "tache.diffusions", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur, corps: { revisionId: REV1, action: "modifier_crm", canal: "crm", cleIdempotence } });
    /** La clé réelle du moteur pour ce lot : calculée sur le contenu, donc identique d'un banc à l'autre. */
    const cleDuMoteur = async () => {
      const m = monterExport();
      m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
      await m.passe([P1, P2]);
      return m.banc.t.diffusions[0]!.cleIdempotence;
    };

    it("un agent qui crée une diffusion export:moteur: est refusé, rien n'est écrit", async () => {
      const m = monterExport();
      await expect(demander(m, AGENT, "export:moteur:occupee")).rejects.toMatchObject({ code: "acces_refuse" });
      expect(m.banc.t.diffusions).toHaveLength(0);
    });

    it("un humain qui crée une diffusion export:moteur: est refusé, rien n'est écrit", async () => {
      const m = monterExport();
      await expect(demander(m, HUMAIN, "export:moteur:occupee")).rejects.toMatchObject({ code: "acces_refuse" });
      expect(m.banc.t.diffusions).toHaveLength(0);
    });

    it("une clé occupée d'avance ne bloque plus l'export du moteur", async () => {
      const cle = await cleDuMoteur();
      expect(cle.startsWith("export:moteur:")).toBe(true);
      const m = monterExport();
      await demander(m, AGENT, cle).catch(() => undefined);
      m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
      expect(await m.passe([P1, P2])).toEqual({ reussis: [P1, P2], echecs: [], attente: null, execution: null, blocage: null });
      expect(m.exports).toHaveLength(1);
    });

    it("un agent rejoue une diffusion export:moteur: créée par le moteur : réponse rejouée, aucune ligne de plus", async () => {
      const m = monterExport();
      m.banc.decision({ portee: PORTEE_MODIFIER_CRM });
      await m.passe([P1, P2]);
      const creees = m.banc.t.diffusions.length;
      const r = await demander(m, AGENT, m.banc.t.diffusions[0]!.cleIdempotence);
      expect((r.corps as { id: string }).id).toBe(m.banc.t.diffusions[0]!.id);
      expect(m.banc.t.diffusions).toHaveLength(creees);
    });

    it("une clé export: sans le préfixe moteur reste ouverte à un agent", async () => {
      const m = monterExport();
      const r = await demander(m, AGENT, "export:agent-lot-1");
      expect(r.statut).toBeLessThan(500);
      expect(m.banc.t.diffusions).toHaveLength(1);
    });

    it("une variante de casse ou un préfixe voisin n'est pas la clé du moteur", async () => {
      const m = monterExport();
      for (const cle of ["EXPORT:moteur:lot-1", "export:moteur2:lot-1"]) await demander(m, AGENT, cle);
      expect(m.banc.t.diffusions).toHaveLength(2);
    });
  });

  it("lecture hors entreprise : un identifiant d'une autre entreprise, inconnu ou mal formé est ignoré, jamais lu", async () => {
    const m = monterExport();
    const lus = await m.services.lecturesMoteur!.lireProspectsMoteur!(SOC, [P1, prospect(3).id, IDENTIFIANT_INCONNU, "pas-un-identifiant", P2]);
    expect(lus.map((p) => p.id)).toEqual([P1, P2]);
    // L'identifiant d'une autre entreprise n'est lu qu'au nom de l'entreprise de la mission (rien ne remonte) ; le mal formé n'atteint pas la base.
    expect(m.lectures).toEqual([`${SOC}:${P1}`, `${SOC}:${prospect(3).id}`, `${SOC}:${IDENTIFIANT_INCONNU}`, `${SOC}:${P2}`]);
    expect(await m.services.lecturesMoteur!.lireProspectsMoteur!(AUTRE_SOC, [P1, P2])).toEqual([]);
  });

  it("une panne de lecture n'est pas prise pour un prospect inconnu ; des oppositions à réimporter refusent le contexte d'exclusions", async () => {
    const m = monterExport({ oppositionsAReimporter: 2 });
    (m.banc.base as unknown as Record<string, unknown>).lireProspect = async () => { throw new Error("base indisponible"); };
    await expect(m.services.lecturesMoteur!.lireProspectsMoteur!(SOC, [P1])).rejects.toThrow("base indisponible");
    await expect(m.services.lecturesMoteur!.contexteExclusionsMoteur!(SOC, null, [])).rejects.toThrow(/réimporter/);
  });
});
