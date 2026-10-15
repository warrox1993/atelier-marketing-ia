/**
 * Non-régression des constats de la revue indépendante (`docs/revue-independante.md`) : chaque
 * test reprend un scénario du relecteur (R1, R2, R3 et les constats lus dans le code) et affirme
 * le comportement CORRIGÉ. Les reproductions d'origine (`instance/revue-repro/repro.spec.ts`)
 * affirmaient le défaut : elles échouent désormais.
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { evaluerPorte, refusDeFond, type EntreesPorte } from "../src/serveur/porte.js";
import { verifierDiffusion } from "../src/serveur/regles-diffusion.js";
import { calculerEngagements, cumuler } from "../src/serveur/regles-plafonds.js";
import { creerServices } from "../src/serveur/services.js";
import { calculerStatutFonctionnel } from "../src/contrats/index.js";
import { BRIEF, CAMP, COORD, ISSUE, PORTE_AGENT, PRODUCTEUR, REV1, REV2, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const coordinateur: ActeurHote = { type: "agent", id: COORD, agentId: COORD, userId: null, runId: null };
const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });

async function route(banc: ReturnType<typeof creerBanc>, cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = {}) {
  const services = creerServices(banc.ctx, { base: banc.base });
  try {
    return await services.routes[cle as "tache.contexte"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur, corps });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

const REQ2 = { code: "REQ-002", texteOriginal: "adresse de Seraing", interpretation: "citer Seraing", obligatoire: true, criteres: ["adresse complète"], dependances: [], elementsAttendus: ["Seraing"] };

/* ------------------------------------------------------------------ */
/* H1                                                                  */
/* ------------------------------------------------------------------ */
describe("H1 : un agent peut seulement CRÉER une exigence (décision de l'opérateur du 15/10/2026)", () => {
  async function avecReq2() {
    const banc = creerBanc();
    expect((await route(banc, "campagnes.exigences", coordinateur, { companyId: SOC, exigences: [REQ2] }, { campagneId: CAMP })).statut).toBe(201);
    return banc;
  }

  it("R1 (service) : le coordinateur ne rend pas une exigence facultative et ne vide pas ses éléments attendus", async () => {
    const banc = await avecReq2();
    const r = await route(banc, "campagnes.exigences", coordinateur, { companyId: SOC, exigences: [{ ...REQ2, interpretation: "facultatif", obligatoire: false, elementsAttendus: [] }] }, { campagneId: CAMP });
    expect(r.corps).toMatchObject({ code: "elevation_refusee" });
    expect(banc.t.exigences[0]).toMatchObject({ obligatoire: true, elementsAttendus: ["Seraing"], version: 1 });
    const trace = banc.t.journal.find((j) => j.type === "exigence.modification_refusee");
    expect(trace?.donnees.affaiblissements[0].motifs).toEqual(expect.arrayContaining(["passage en facultatif", "retrait d'éléments attendus : Seraing"]));
  });

  it("aucune modification par un agent, même sans affaiblissement ; rien n'est écrit si un lot en contient une", async () => {
    const banc = await avecReq2();
    const nouvelle = { ...REQ2, code: "REQ-003" };
    const r = await route(banc, "campagnes.exigences", coordinateur, { companyId: SOC, exigences: [nouvelle, { ...REQ2, texteOriginal: "adresse de Seraing (réécrite)" }] }, { campagneId: CAMP });
    expect(r.corps).toMatchObject({ code: "elevation_refusee" });
    expect(banc.t.exigences.map((e) => e.code)).toEqual(["REQ-002"]);
  });

  it("le renvoi identique d'une exigence existante est sans effet ; une nouvelle exigence est créée", async () => {
    const banc = await avecReq2();
    const r = await route(banc, "campagnes.exigences", coordinateur, { companyId: SOC, exigences: [REQ2, { ...REQ2, code: "REQ-004", obligatoire: false }] }, { campagneId: CAMP });
    expect(r.statut).toBe(201);
    expect(banc.t.exigences.map((e) => [e.code, e.version])).toEqual([["REQ-002", 1], ["REQ-004", 1]]);
  });

  it("l'humain peut affaiblir : c'est tracé dans le journal de l'atelier et l'activité native", async () => {
    const banc = await avecReq2();
    const r = await route(banc, "campagnes.exigences", humain, { companyId: SOC, exigences: [{ ...REQ2, obligatoire: false, elementsAttendus: [], texteOriginal: "autre" }] }, { campagneId: CAMP });
    expect(r.statut).toBe(201);
    const affaiblie = banc.t.journal.find((j) => j.type === "exigence.affaiblie");
    expect(affaiblie?.acteur).toBe("local-board");
    expect(affaiblie?.donnees.affaiblissements).toEqual(["passage en facultatif", "retrait d'éléments attendus : Seraing", "changement du texte d'origine"]);
    expect(banc.activite.join("\n")).toMatch(/REQ-002 affaiblie par l'humain local-board/u);
  });

  it("un autre agent que le coordinateur ne crée rien", async () => {
    const banc = creerBanc();
    const r = await route(banc, "campagnes.exigences", agent(RELECTEUR), { companyId: SOC, exigences: [REQ2] }, { campagneId: CAMP });
    expect(r.corps).toMatchObject({ code: "role_non_autorise" });
  });
});

/* ------------------------------------------------------------------ */
/* H2                                                                  */
/* ------------------------------------------------------------------ */
describe("H2 : aucune tâche sous porte sans étape d'approbation humaine finale", () => {
  async function mettreSousPorte(politique: unknown) {
    const banc = creerBanc();
    banc.t.exigences.push({ id: "ex-1", code: "REQ-001", companyId: SOC, campagneId: CAMP, version: 1, exclusion: { etat: "aucune" }, modifieLe: banc.horloge() });
    banc.issues.set(ISSUE, { id: ISSUE, companyId: SOC, projectId: null, status: "todo", assigneeAgentId: PRODUCTEUR, executionPolicy: politique, title: "Page" });
    return route(banc, "portes.creer", coordinateur, { companyId: SOC, issueId: ISSUE, campagneId: CAMP, exigencesCiblees: ["REQ-001"], revuesRequises: [{ role: "metier", agentId: RELECTEUR }] });
  }
  const revue = { type: "review", participants: [{ type: "agent", agentId: PORTE_AGENT }] };

  it("R2 : politique « review » seule refusée", async () => {
    expect((await mettreSousPorte({ stages: [revue] })).corps).toMatchObject({ code: "entree_invalide" });
  });
  it("approbation tenue par un agent, ou approbation qui n'est pas la dernière étape : refusées", async () => {
    expect((await mettreSousPorte({ stages: [revue, { type: "approval", participants: [{ type: "agent", agentId: COORD }] }] })).corps).toMatchObject({ code: "entree_invalide" });
    expect((await mettreSousPorte({ stages: [{ type: "approval", participants: [{ type: "user", userId: "local-board" }] }, revue] })).corps).toMatchObject({ code: "entree_invalide" });
    expect((await mettreSousPorte({ stages: [revue, { type: "approval", participants: [] }] })).corps).toMatchObject({ code: "entree_invalide" });
  });
  it("revue puis approbation par un utilisateur : acceptée", async () => {
    expect((await mettreSousPorte({ stages: [revue, { type: "approval", participants: [{ type: "user", userId: "local-board" }] }] })).statut).toBe(201);
  });
  it("« Approuvée par l'humain » seulement avec une vraie décision sur la révision courante", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "done", etape: null });
    const services = creerServices(banc.ctx, { base: banc.base });
    const dossier = async () => (await services.routes["tache.dossier"]!({ cle: "tache.dossier", params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: humain, corps: null })).corps as { statut: { statut: string } };
    expect((await dossier()).statut.statut).toBe("blocked_information");
    banc.decision({ action: "demander_correction" });
    expect((await dossier()).statut.statut).toBe("blocked_information");
    banc.decision({ action: "approuver" });
    expect((await dossier()).statut.statut).toBe("approved");
    // Décision portant sur une autre révision : plus « approuvée ».
    banc.documents.get(`${ISSUE}:livrable`)!.latestRevisionId = REV2;
    expect((await dossier()).statut.statut).toBe("blocked_information");
    expect(calculerStatutFonctionnel({ status: "done", assigneeAgentId: null, assigneeUserId: null, executionState: null }, { bloqueursNonResolus: 0, runActif: false, dernierRunEchoue: false, agentEnPauseBudget: false, sousPorte: true }).statut).not.toBe("approved");
  });
});

/* ------------------------------------------------------------------ */
/* H3                                                                  */
/* ------------------------------------------------------------------ */
describe("H3 : un livrable modifié après done rouvre la tâche", () => {
  it("nouvelle révision d'une tâche approuvée : rouverte, renvoyée au producteur, approbation invalidée, tracée", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "done", etape: null });
    banc.passe(REV1);
    banc.decision({ action: "approuver", revision: REV1 });
    creerServices(banc.ctx, { base: banc.base });
    banc.documents.get(`${ISSUE}:livrable`)!.latestRevisionId = REV2;
    await banc.evenements.get("issue.document.updated")!({ companyId: SOC, entityId: ISSUE, payload: { key: "livrable" } });
    expect(banc.mises).toEqual([{ issueId: ISSUE, patch: { status: "todo", assigneeAgentId: PRODUCTEUR } }]);
    expect(banc.t.decisions[0]!.invalidee).toBe(true);
    expect(banc.t.evaluations[0]!.perimee).toBe(true);
    expect(banc.t.journal.map((j) => j.type)).toEqual(["livrable.revise", "livrable.modifie_apres_approbation"]);
    expect(banc.commentaires[0]).toMatch(/Livrable modifié après approbation/u);
    expect(banc.reveils).toEqual([ISSUE]);
  });
  it("une révision écrite pendant le travail du producteur ne rouvre rien", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null });
    creerServices(banc.ctx, { base: banc.base });
    await banc.evenements.get("issue.document.updated")!({ companyId: SOC, entityId: ISSUE, payload: { key: "livrable" } });
    expect(banc.mises).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* M1 et B3 : diffusion                                                */
/* ------------------------------------------------------------------ */
describe("M1 : une même publication n'est acceptée qu'une fois", () => {
  const portee = { revisionId: REV1, action: "publier" as const, canal: "linkedin", compte: null, audience: null, montantMaxCents: null, dureeJours: null };
  const entree = {
    demande: { revisionId: REV1, action: "publier" as const, canal: "linkedin", compte: null, audience: null, montantCents: null },
    revisionCourante: REV1, porteFranchie: true, statutNatif: "done",
    decisions: [{ id: "d1", revisionId: REV1, action: "approuver" as const, invalidee: false, creeLe: "2026-10-15T10:00:00.000Z", portee }],
    maintenant: new Date("2026-10-15T11:00:00Z"),
  };
  it("R3 : sans historique des diffusions, la règle refuse (prudence)", () => {
    expect(verifierDiffusion(entree as never).ok).toBe(false);
  });
  it("R3 : la seconde demande identique (autre clé d'idempotence) est refusée ; une diffusion refusée ne compte pas", () => {
    expect(verifierDiffusion({ ...entree, diffusionsAnterieures: [] }).ok).toBe(true);
    const premiere = { id: "f1", revisionId: REV1, decisionId: "d1", action: "publier", canal: "linkedin", compte: null, etat: "simulee", montantCents: null };
    const seconde = verifierDiffusion({ ...entree, diffusionsAnterieures: [premiere] });
    expect(seconde.ok).toBe(false);
    expect(seconde.ok ? "" : seconde.motif).toMatch(/une même publication ne part qu'une fois/u);
    expect(verifierDiffusion({ ...entree, diffusionsAnterieures: [{ ...premiere, etat: "refusee" }] }).ok).toBe(true);
    expect(verifierDiffusion({ ...entree, diffusionsAnterieures: [{ ...premiere, canal: "facebook" }] }).ok).toBe(true);
  });
  it("service : deux demandes avec des clés différentes, la seconde est refusée (403) ; le rejeu de la même clé rend la première", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "done", etape: null });
    banc.passe();
    banc.decision({ portee });
    const corps = (cle: string) => ({ revisionId: REV1, action: "publier", canal: "linkedin", cleIdempotence: cle });
    const a = await route(banc, "tache.diffusions", humain, corps("cle-numero-1"), { issueId: ISSUE });
    expect(a).toMatchObject({ statut: 201, corps: { etat: "simulee" } });
    const b = await route(banc, "tache.diffusions", agent(PRODUCTEUR), corps("cle-numero-2"), { issueId: ISSUE });
    expect(b).toMatchObject({ statut: 403, corps: { etat: "refusee" } });
    const rejeu = await route(banc, "tache.diffusions", humain, corps("cle-numero-1"), { issueId: ISSUE });
    expect(rejeu).toMatchObject({ statut: 200, corps: { id: (a.corps as { id: string }).id } });
  });
});

describe("B3 : le montant payant approuvé est un total PAR RÉVISION (décision de l'opérateur)", () => {
  const payante = (montant: number) => ({ revisionId: REV1, action: "activer_campagne_payante" as const, canal: "facebook", compte: null, audience: null, montantMaxCents: montant, dureeJours: 30 });
  it("ré-approuver la même révision ne remet pas le cumul à zéro (règle de diffusion)", () => {
    const decisions = [
      { id: "d1", revisionId: REV1, action: "approuver" as const, invalidee: false, creeLe: "2026-10-15T10:00:00.000Z", portee: payante(100000) },
      { id: "d2", revisionId: REV1, action: "approuver" as const, invalidee: false, creeLe: "2026-10-15T12:00:00.000Z", portee: payante(100000) },
    ];
    const r = verifierDiffusion({
      demande: { revisionId: REV1, action: "activer_campagne_payante", canal: "facebook", compte: null, audience: null, montantCents: 1 },
      revisionCourante: REV1, porteFranchie: true, statutNatif: "done", decisions, maintenant: new Date("2026-10-16T00:00:00Z"),
      diffusionsAnterieures: [{ id: "f1", revisionId: REV1, decisionId: "d1", action: "activer_campagne_payante", canal: "facebook", compte: null, etat: "simulee", montantCents: 100000 }],
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.motif).toMatch(/déjà diffusés sur cette révision/u);
  });
  it("ré-approuver la même révision ne libère pas de réserve (montant engagé)", () => {
    const d = (id: string, creeLe: string) => ({ id, issueId: ISSUE, revisionId: REV1, campagneId: CAMP, action: "approuver" as const, invalidee: false, creeLe, portee: { action: "activer_campagne_payante", montantMaxCents: 100000 } });
    const e = calculerEngagements([d("d1", "2026-10-15T10:00:00.000Z"), d("d2", "2026-10-15T12:00:00.000Z")], [
      { id: "f1", issueId: ISSUE, revisionId: REV1, campagneId: CAMP, decisionId: "d1", action: "activer_campagne_payante", etat: "simulee", montantCents: 100000 },
    ]);
    // Avant la correction : 100 000 diffusés + 100 000 réservés par d2 = 200 000.
    expect(cumuler(e, CAMP)).toEqual({ engageCents: 100000, diffuseCents: 100000, reserveCents: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* M3                                                                  */
/* ------------------------------------------------------------------ */
describe("M3 : les entrées hors couverture et revues périment aussi l'évaluation", () => {
  it("lecture d'une source sur une tâche sous porte : porte touchée, évaluations périmées", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null });
    banc.passe();
    const avant = banc.t.portes[0]!.modifieLe;
    const r = await route(banc, "tache.sources.lire", agent(PRODUCTEUR), { url: "https://renovation-liege.example/" }, { issueId: ISSUE });
    expect([201, 422]).toContain(r.statut);
    expect(banc.t.evaluations[0]!.perimee).toBe(true);
    expect(banc.t.portes[0]!.modifieLe > avant).toBe(true);
    const ev = await banc.base.etatDerniereEvaluation(SOC, ISSUE, CAMP);
    expect(ev?.plusRecentes).toBe(true);
  });
  it("changement du mode par défaut de l'entreprise : toutes les portes touchées, évaluations périmées, tracé", async () => {
    const banc = creerBanc({ modeEntreprise: "demonstration" });
    banc.tacheSousPorte({ status: "in_review" });
    banc.passe();
    const services = creerServices(banc.ctx, { base: banc.base });
    await services.routes["reglages.enregistrer"]!({ cle: "reglages.enregistrer", params: {}, query: {}, companyId: SOC, acteur: humain, corps: { companyId: SOC, modeParDefaut: "reel" } });
    expect(banc.t.evaluations[0]!.perimee).toBe(true);
    expect(banc.t.journal.find((j) => j.type === "reglages.modifies")?.donnees).toMatchObject({ modeParDefaut: "reel", modeAvant: "demonstration", evaluationsPerimees: true });
  });
  it("même mode renvoyé : rien n'est périmé", async () => {
    const banc = creerBanc({ modeEntreprise: "demonstration" });
    banc.tacheSousPorte({ status: "in_review" });
    banc.passe();
    const services = creerServices(banc.ctx, { base: banc.base });
    await services.routes["reglages.enregistrer"]!({ cle: "reglages.enregistrer", params: {}, query: {}, companyId: SOC, acteur: humain, corps: { companyId: SOC, modeParDefaut: "demonstration" } });
    expect(banc.t.evaluations[0]!.perimee).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* M4 et M5 : cycles                                                    */
/* ------------------------------------------------------------------ */
function porteEntrees(o: Partial<EntreesPorte> = {}): EntreesPorte {
  return {
    porte: { exigencesCiblees: [], revuesRequises: [{ role: "metier", agentId: RELECTEUR }], maxCycles: 2 },
    exigences: [],
    livrable: { revisionId: "r3" },
    couvertures: [],
    verdicts: [{ id: "v", revisionId: "r3", role: "metier", relecteurId: RELECTEUR, verdict: "PASS", exigencesExaminees: [], preuvesVerifiees: [], justification: null, creeLe: "1" }],
    constats: [],
    revisionsDejaRefusees: [],
    ...o,
  };
}

describe("M4 : cycles épuisés = escalade humaine obligatoire, jamais un PASS", () => {
  it("révisions déjà refusées au maximum : BLOQUE_INFORMATION avec cycles_epuises, même si tout le reste passe", () => {
    expect(evaluerPorte(porteEntrees()).decision).toBe("PASS");
    const r = evaluerPorte(porteEntrees({ revisionsDejaRefusees: ["r1", "r2"] }));
    expect(r.decision).toBe("BLOQUE_INFORMATION");
    expect(r.cyclesEpuises).toBe(true);
    expect(r.motifs.map((m) => m.code)).toContain("cycles_epuises");
  });
  it("après une relance humaine (maximum relevé), la révision suivante est évaluée normalement", () => {
    expect(evaluerPorte(porteEntrees({ revisionsDejaRefusees: ["r1", "r2"], porte: { exigencesCiblees: [], revuesRequises: [{ role: "metier", agentId: RELECTEUR }], maxCycles: 4 } })).decision).toBe("PASS");
  });
  it("service : un verdict sur une nouvelle révision est refusé quand les cycles sont épuisés", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "blocked", etape: null, revuesRequises: [{ role: "metier", agentId: RELECTEUR }], maxCycles: 1, revision: REV2 });
    banc.t.evaluations.push({ id: "ev-ancienne", companyId: SOC, issueId: ISSUE, revisionId: REV1, decision: "REFUS", motifs: [{ code: "revue_non_reussie" }], entreesJusquA: banc.horloge(), cyclesEpuises: true, perimee: true, creeLe: banc.horloge() });
    const r = await route(banc, "tache.verdict", agent(RELECTEUR), { revisionId: REV2, role: "metier", verdict: "PASS", exigencesExaminees: [], preuvesVerifiees: [], constats: [], constatsResolus: [] }, { issueId: ISSUE });
    expect(r.corps).toMatchObject({ code: "conflit" });
    expect(banc.t.verdicts).toEqual([]);
  });
});

describe("M5 : une évaluation prématurée ne consomme pas de cycle ; l'évaluation est réservée", () => {
  it("un refus pour « revue absente » seulement n'est pas un refus de fond", () => {
    expect(refusDeFond([{ code: "revue_requise_absente" }])).toBe(false);
    expect(refusDeFond([{ code: "revue_requise_absente" }, { code: "revue_sur_ancienne_version" }])).toBe(false);
    expect(refusDeFond([{ code: "revue_requise_absente" }, { code: "exigence_obligatoire_non_couverte" }])).toBe(true);
    const premature = evaluerPorte(porteEntrees({ verdicts: [] }));
    expect(premature.decision).toBe("REFUS");
    expect(premature.cyclesApres).toBe(0);
  });
  it("le producteur (ou tout agent non participant de l'étape de revue) ne peut pas évaluer la porte", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null });
    for (const qui of [PRODUCTEUR, RELECTEUR, COORD]) {
      expect((await route(banc, "tache.porte.evaluer", agent(qui), {}, { issueId: ISSUE })).corps).toMatchObject({ code: "role_non_autorise" });
    }
    expect(banc.t.evaluations).toEqual([]);
    expect((await route(banc, "tache.porte.evaluer", agent(PORTE_AGENT), {}, { issueId: ISSUE })).statut).toBe(201);
    expect((await route(banc, "tache.porte.evaluer", humain, {}, { issueId: ISSUE })).statut).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/* M6, B1, B4, B5                                                      */
/* ------------------------------------------------------------------ */
describe("M6 : la remise à zéro de démonstration n'efface jamais une trace réelle", () => {
  const reinitialiser = async (banc: ReturnType<typeof creerBanc>) => {
    const services = creerServices(banc.ctx, { base: banc.base });
    try {
      return await services.actions["atelier.demo.reinitialiser"]!({ confirmation: "REINITIALISER" }, SOC, humain);
    } catch (err) {
      return err;
    }
  };
  it("entreprise réglée en mode réel (campagnes restées en démonstration) : refusée", async () => {
    const banc = creerBanc({ modeEntreprise: "reel" });
    expect(await reinitialiser(banc)).toMatchObject({ code: "conflit" });
  });
  it("décision ou diffusion réelle présente : refusée", async () => {
    const banc = creerBanc({ modeEntreprise: "demonstration" });
    banc.decision({ mode: "reel" });
    expect(await reinitialiser(banc)).toMatchObject({ code: "conflit" });
  });
  it("démonstration pure : acceptée", async () => {
    const banc = creerBanc({ modeEntreprise: "demonstration" });
    expect(await reinitialiser(banc)).toHaveProperty("supprimes");
  });
});

describe("B1 : « autorisée par » n'est jamais la parole d'un agent", () => {
  it("couverture d'un agent : autoriseePar vidé ; d'un humain : l'humain authentifié", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null, corps: "# Page\n\nSeraing, quai du Test 3." });
    banc.t.portes[0]!.exigencesCiblees = ["REQ-001"];
    const corps = { revisionId: REV1, lignes: [{ code: "REQ-001", etat: "bloque", question: "Adresse ?", hypotheses: [{ texte: "horaires du site", autoriseePar: "Jean-Baptiste" }] }] };
    expect((await route(banc, "tache.couverture", agent(PRODUCTEUR), corps, { issueId: ISSUE })).statut).toBe(201);
    expect(banc.t.couvertures[0]!.hypotheses).toEqual([{ texte: "horaires du site", autoriseePar: null }]);
    expect((await route(banc, "tache.couverture", humain, corps, { issueId: ISSUE })).statut).toBe(201);
    expect(banc.t.couvertures[1]!.hypotheses).toEqual([{ texte: "horaires du site", autoriseePar: "local-board" }]);
  });
});

describe("B4 : un plafond refusé ne laisse aucun réglage à moitié écrit", () => {
  it("plafond inférieur à l'engagé : conflit, mode et cycles inchangés, aucun journal « réglages modifiés »", async () => {
    const banc = creerBanc({ modeEntreprise: "demonstration" });
    banc.tacheSousPorte({ status: "done", etape: null });
    banc.decision({ portee: { revisionId: REV1, action: "activer_campagne_payante", canal: "facebook", compte: null, audience: null, montantMaxCents: 50000, dureeJours: 30 } });
    const services = creerServices(banc.ctx, { base: banc.base });
    const appel = services.routes["reglages.enregistrer"]!({ cle: "reglages.enregistrer", params: {}, query: {}, companyId: SOC, acteur: humain, corps: { companyId: SOC, modeParDefaut: "reel", maxCyclesCorrection: 5, plafondPub: { type: "montant", montantCents: 100 } } });
    await expect(appel).rejects.toMatchObject({ code: "conflit" });
    expect(banc.t.reglages[0]).toMatchObject({ modeParDefaut: "demonstration", maxCyclesCorrection: 3 });
    expect(banc.t.journal.some((j) => j.type === "reglages.modifies")).toBe(false);
  });
});

describe("B5 : les revues d'une révision sont cherchées par leur origine exacte", () => {
  it("le contexte interroge l'hôte par originId (une requête par rôle), sans limite de 500 revues de l'entreprise", async () => {
    const banc = creerBanc();
    banc.tacheSousPorte({ status: "in_progress", etape: null, revuesRequises: [{ role: "metier", agentId: RELECTEUR }, { role: "exigences", agentId: COORD }] });
    banc.issues.set("revue-metier", { id: "revue-metier", companyId: SOC, originKind: "plugin:atelier.marketing-ia:revue", originId: `${ISSUE}:${REV1}:metier`, status: "todo" });
    const r = await route(banc, "tache.contexte", agent(PRODUCTEUR), null, { issueId: ISSUE });
    expect((r.corps as { revuesRevisionCourante: Array<{ role: string }> }).revuesRevisionCourante.map((x) => x.role)).toEqual(["metier"]);
    expect(banc.listes.filter((q) => q.originKind).map((q) => q.originId)).toEqual([`${ISSUE}:${REV1}:metier`, `${ISSUE}:${REV1}:exigences`]);
  });
});

void BRIEF;
