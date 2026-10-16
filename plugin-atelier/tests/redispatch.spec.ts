/**
 * Livrable bloqué ou correction humaine : renvoi automatique au Coordinateur (16/10/2026).
 * Constat réel : ATL-35 bloqué à 3 cycles sur 3 avec 7 remarques ouvertes, sans que le Coordinateur
 * ne redistribue le travail ; la correction demandée par l'humain partait directement au producteur.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { classerConstat, informationRepetee } from "../src/serveur/redispatch.js";
import { routesAccueil } from "../src/serveur/services-accueil.js";
import { creerServices } from "../src/serveur/services.js";
import { BRIEF, CAMP, COORD, ISSUE, PRODUCTEUR, REV1, REV2, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const relecteur: ActeurHote = { type: "agent", id: RELECTEUR, agentId: RELECTEUR, userId: null, runId: "run-1" };
const EXIGENCES = [{ role: "exigences", agentId: RELECTEUR }];

const INFO = {
  categorie: "exigence_manquante", gravite: "majeure", emplacement: "Liste des prospects",
  description: "Les codes postaux à moins de 10 km n'ont jamais été interrogés.", preuve: "4000 et 4020 seulement",
  correctionAttendue: "Interroger les codes postaux 4030, 4031 et 4040 dans l'OSM et la BCE.",
};
const REDACTION = { categorie: "marque", gravite: "mineure", emplacement: "Annonce 2", description: "Libellé FSMA approximatif.", preuve: "« agréé FSMA »", correctionAttendue: "Remplacer par le libellé exact de la fiche." };
const DECISION = { categorie: "offre_non_confirmee", gravite: "majeure", emplacement: "Offre", description: "Remise de 15 % non confirmée.", preuve: "absente de la fiche", correctionAttendue: "Faire confirmer la remise par le client." };

const verdict = (revisionId: string, v: Record<string, unknown>) => ({ revisionId, role: "exigences", exigencesExaminees: [], preuvesVerifiees: [], constats: [], constatsResolus: [], ...v });

function banc(o: { maxCycles?: number; parentAttendHumain?: boolean } = {}) {
  const b = creerBanc();
  b.tacheSousPorte({ status: "in_progress", etape: null, revuesRequises: EXIGENCES, maxCycles: o.maxCycles ?? 3 });
  const commentaires: Array<{ issueId: string; texte: string }> = [];
  const reveils: Array<{ issueId: string; cle: string | null | undefined }> = [];
  const issues = b.ctx.issues as unknown as Record<string, unknown>;
  issues.createComment = async (issueId: string, texte: string) => (commentaires.push({ issueId, texte }), { id: `c-${commentaires.length}` });
  issues.requestWakeup = async (issueId: string, _c: string, opts?: { idempotencyKey?: string | null }) => (reveils.push({ issueId, cle: opts?.idempotencyKey }), { queued: true, runId: "run-coord" });
  if (o.parentAttendHumain) b.interactions.set(BRIEF, [{ id: "carte-1", kind: "ask_user_questions", status: "pending" }]);
  const services = creerServices(b.ctx, { base: b.base });
  const route = async (cle: string, acteur: ActeurHote, corps: unknown) => {
    try {
      return await services.routes[cle as "tache.contexte"]!({ cle: cle as never, params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur, corps });
    } catch (err) {
      return { statut: 0, corps: err as { code?: string; message?: string } };
    }
  };
  const nouvelleRevision = (revisionId: string, numero: number) => {
    const doc = b.documents.get(`${ISSUE}:livrable`)!;
    b.documents.set(`${ISSUE}:livrable`, { ...doc, latestRevisionId: revisionId, latestRevisionNumber: numero });
  };
  const demandes = () => b.t.journal.filter((j) => j.type === "coordinateur.redispatch_demande");
  return { b, services, route, commentaires, reveils, nouvelleRevision, demandes };
}

describe("classification des remarques", () => {
  it("information à obtenir, correction de rédaction, décision humaine", () => {
    expect(classerConstat({ role: "exigences", ...INFO } as never)).toBe("information_a_obtenir");
    expect(classerConstat({ role: "metier", ...REDACTION } as never)).toBe("correction_redaction");
    expect(classerConstat({ role: "metier", ...DECISION } as never)).toBe("decision_humaine");
    expect(classerConstat({ role: "metier", categorie: "affirmation_non_sourcee", gravite: "majeure", description: "Chiffre sans source", correctionAttendue: "Retirer le chiffre." } as never)).toBe("information_a_obtenir");
  });

  it("une seule révision refusée ne fait pas une répétition", () => {
    const c = { findingId: "F-EXI-1", role: "exigences", requirementIds: [], statutResolution: "ouvert", creeLe: "2", revisionId: REV1, ...INFO } as never;
    expect(informationRepetee([c], new Map([[REV1, "1"]]))).toBe(false);
    expect(informationRepetee([c], new Map([[REV1, "1"], [REV2, "3"]]))).toBe(true);
  });
});

describe("livrable bloqué : renvoi au Coordinateur", () => {
  it("cycles épuisés : commentaire sur la parente avec TOUTES les remarques classées, un seul réveil", async () => {
    const s = banc({ maxCycles: 1 });
    expect((await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [REDACTION, INFO, DECISION] }))).statut).toBe(201);
    const ev = await s.route("tache.porte.evaluer", humain, {});
    expect(ev.statut).toBe(201);
    expect((ev.corps as { cyclesEpuises: boolean }).cyclesEpuises).toBe(true);

    expect(s.reveils).toEqual([{ issueId: BRIEF, cle: `atelier-redispatch-${ISSUE}-${REV1}` }]);
    const surParente = s.commentaires.filter((c) => c.issueId === BRIEF);
    expect(surParente).toHaveLength(1);
    const texte = surParente[0]!.texte;
    expect(texte).toContain("Livrable bloqué");
    expect(texte).toContain("DEM-1");
    expect(texte).toContain("cycles de correction épuisés");
    expect(texte).toContain("Remarques ouvertes (3)");
    expect(texte).toContain("information à obtenir");
    expect(texte).toContain("correction de rédaction");
    expect(texte).toContain("décision humaine");
    expect(texte).toContain("Interroger les codes postaux 4030");
    // Tri par gravité : les deux majeures avant la mineure.
    expect(texte.indexOf("**majeure**")).toBeLessThan(texte.indexOf("**mineure**"));
    expect(texte).toContain("jamais l'inventer");
    expect(s.demandes()).toHaveLength(1);
    expect(s.demandes()[0]!.donnees).toMatchObject({ cle: REV1, parentId: BRIEF, coordinateurId: COORD, motifs: ["cycles_epuises"], classes: { information_a_obtenir: 1, correction_redaction: 1, decision_humaine: 1 } });
  });

  it("même révision évaluée deux fois (et nouvelle révision écrite après l'épuisement) : pas de second réveil", async () => {
    const s = banc({ maxCycles: 1 });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [INFO] }));
    await s.route("tache.porte.evaluer", humain, {});
    await s.route("tache.porte.evaluer", humain, {});
    s.nouvelleRevision(REV2, 2);
    await s.route("tache.couverture", { type: "agent", id: PRODUCTEUR, agentId: PRODUCTEUR, userId: null, runId: "run-p" }, { revisionId: REV2, lignes: [] });
    await s.route("tache.porte.evaluer", humain, {});
    expect(s.reveils).toHaveLength(1);
    expect(s.commentaires.filter((c) => c.issueId === BRIEF)).toHaveLength(1);
    expect(s.demandes()).toHaveLength(1);
  });

  it("refus intermédiaire avec des cycles restants : rien (le producteur corrige)", async () => {
    const s = banc({ maxCycles: 3 });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [INFO, REDACTION] }));
    const ev = await s.route("tache.porte.evaluer", humain, {});
    expect((ev.corps as { decision: string }).decision).toBe("REFUS");
    expect(s.reveils).toHaveLength(0);
    expect(s.commentaires.filter((c) => c.issueId === BRIEF)).toHaveLength(0);
    expect(s.demandes()).toHaveLength(0);
  });

  it("information à obtenir qui revient sur deux cycles de suite : déclenchement avant l'épuisement", async () => {
    const s = banc({ maxCycles: 3 });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [INFO] }));
    await s.route("tache.porte.evaluer", humain, {});
    expect(s.reveils).toHaveLength(0);
    s.nouvelleRevision(REV2, 2);
    // Le relecteur maintient la remarque bloquante ouverte (aucune nouvelle remarque).
    expect((await s.route("tache.verdict", relecteur, verdict(REV2, { verdict: "CHANGES_REQUESTED" }))).statut).toBe(201);
    await s.route("tache.porte.evaluer", humain, {});
    expect(s.reveils).toEqual([{ issueId: BRIEF, cle: `atelier-redispatch-${ISSUE}-${REV2}` }]);
    expect(s.demandes()[0]!.donnees).toMatchObject({ motifs: ["information_repetee"] });
    expect(s.commentaires.find((c) => c.issueId === BRIEF)!.texte).toContain("deux cycles de suite");
  });

  it("tâche parente qui attend déjà l'humain : ni réveil ni commentaire, attente journalisée une fois", async () => {
    const s = banc({ maxCycles: 1, parentAttendHumain: true });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [INFO] }));
    await s.route("tache.porte.evaluer", humain, {});
    await s.route("tache.porte.evaluer", humain, {});
    expect(s.reveils).toHaveLength(0);
    expect(s.commentaires.filter((c) => c.issueId === BRIEF)).toHaveLength(0);
    expect(s.demandes()).toHaveLength(0);
    expect(s.b.t.journal.filter((j) => j.type === "coordinateur.redispatch_differe")).toHaveLength(1);
  });

  it("brief sans Coordinateur assigné : rien n'est publié ni réveillé, l'absence est journalisée une fois", async () => {
    const s = banc({ maxCycles: 1 });
    s.b.issues.set(BRIEF, { ...s.b.issues.get(BRIEF)!, assigneeAgentId: null });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [INFO] }));
    await s.route("tache.porte.evaluer", humain, {});
    await s.route("tache.porte.evaluer", humain, {});
    expect(s.reveils).toHaveLength(0);
    expect(s.commentaires).toHaveLength(0);
    expect(s.b.t.journal.filter((j) => j.type === "coordinateur.redispatch_sans_parente")).toHaveLength(1);
  });

  it("revue BLOCKED_INFORMATION : le Coordinateur est prévenu sans attendre l'épuisement", async () => {
    const s = banc({ maxCycles: 3 });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "BLOCKED_INFORMATION", controlesNonExecutes: ["BCE injoignable"] }));
    expect(s.reveils).toHaveLength(1);
    expect(s.demandes()[0]!.donnees).toMatchObject({ motifs: ["information_manquante"] });
    expect(s.commentaires.find((c) => c.issueId === BRIEF)!.texte).toContain("BCE injoignable");
  });
});

describe("livrable bloqué : concurrence, journal et consigne (revue indépendante)", () => {
  const attente = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("M2 : deux verdicts BLOCKED_INFORMATION simultanés (hôte lent) : un seul commentaire et un seul réveil", async () => {
    const s = banc({ maxCycles: 3 });
    const issues = s.b.ctx.issues as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const creer = issues.createComment!;
    const reveiller = issues.requestWakeup!;
    issues.createComment = async (...a) => (await attente(25), creer(...a));
    issues.requestWakeup = async (...a) => (await attente(25), reveiller(...a));
    const v = () => s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "BLOCKED_INFORMATION", controlesNonExecutes: ["BCE injoignable"] }));
    await Promise.all([v(), v()]);
    expect(s.commentaires.filter((c) => c.issueId === BRIEF)).toHaveLength(1);
    expect(s.reveils).toHaveLength(1);
    expect(s.demandes()).toHaveLength(1);
  });

  it("M2 : journalisation échouée après la publication : pas de republication au déclencheur suivant", async () => {
    const s = banc({ maxCycles: 3 });
    const journaliser = s.b.base.journaliser;
    s.b.base.journaliser = (async (e: { type: string }) => {
      if (e.type === "coordinateur.redispatch_demande") throw new Error("base indisponible");
      return journaliser(e as never);
    }) as never;
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "BLOCKED_INFORMATION", controlesNonExecutes: ["BCE injoignable"] }));
    await s.route("tache.porte.evaluer", humain, {});
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "BLOCKED_INFORMATION", controlesNonExecutes: ["BCE injoignable"] }));
    expect(s.commentaires.filter((c) => c.issueId === BRIEF)).toHaveLength(1);
    expect(s.reveils).toHaveLength(1);
  });

  it("m4 : sans entrée de ce type au journal, le journal de la tâche n'est pas relu en entier", async () => {
    const s = banc({ maxCycles: 3 });
    let lectures = 0;
    const lire = s.b.base.lireJournal;
    s.b.base.lireJournal = (async (...a: Parameters<typeof lire>) => (lectures += 1, lire(...a))) as never;
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "BLOCKED_INFORMATION", controlesNonExecutes: ["BCE injoignable"] }));
    expect(s.reveils).toHaveLength(1);
    expect(lectures).toBe(0);
  });

  it("M3 : cycles épuisés, la consigne demande une carte request_confirmation et interdit de relancer la revue soi-même", async () => {
    const s = banc({ maxCycles: 1 });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "CHANGES_REQUESTED", constats: [INFO] }));
    await s.route("tache.porte.evaluer", humain, {});
    const texte = s.commentaires.find((c) => c.issueId === BRIEF)!.texte;
    expect(texte).toContain("request_confirmation");
    expect(texte).toContain("ne relancez pas la revue vous-même");
    expect(texte).not.toContain("Relancez la revue quand les sous-tâches sont terminées.");
  });

  it("M3 : information manquante (cycles restants) : la consigne de relance de la revue reste", async () => {
    const s = banc({ maxCycles: 3 });
    await s.route("tache.verdict", relecteur, verdict(REV1, { verdict: "BLOCKED_INFORMATION", controlesNonExecutes: ["BCE injoignable"] }));
    expect(s.commentaires.find((c) => c.issueId === BRIEF)!.texte).toContain("Relancez la revue quand les sous-tâches sont terminées.");
  });
});

describe("correction demandée par l'humain : transmise au Coordinateur", () => {
  /** Livrable à l'étape d'approbation humaine, remarque mineure encore ouverte. */
  async function aLApprobation(o: { sansParente?: boolean } = {}) {
    const b = creerBanc();
    b.tacheSousPorte({ revuesRequises: EXIGENCES });
    if (o.sansParente) b.t.campagnes.find((c) => c.id === CAMP)!.briefIssueId = null;
    b.t.constats.push({ findingId: "F-EXI-AAAA1111", companyId: SOC, issueId: ISSUE, verdictId: "v", role: "exigences", requirementIds: [], revisionId: REV1, statutResolution: "ouvert", creeLe: b.horloge(), modifieLe: b.horloge(), ...REDACTION });
    const commentaires: Array<{ issueId: string; texte: string }> = [];
    const reveils: Array<{ issueId: string; cle: string | null | undefined }> = [];
    const issues = b.ctx.issues as unknown as Record<string, unknown>;
    issues.createComment = async (issueId: string, texte: string) => (commentaires.push({ issueId, texte }), { id: `c-${commentaires.length}` });
    issues.requestWakeup = async (issueId: string, _c: string, opts?: { idempotencyKey?: string | null }) => (reveils.push({ issueId, cle: opts?.idempotencyKey }), { queued: true, runId: null });
    const services = creerServices(b.ctx, { base: b.base });
    const decider = (commentaire: string) =>
      services.routes["tache.decision"]!({ cle: "tache.decision" as never, params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur: humain, corps: { revisionId: REV1, action: "demander_correction", commentaire } });
    return { b, commentaires, reveils, decider };
  }

  it("le livrable passe en blocked, la parente reçoit le commentaire exact et les remarques, un seul réveil", async () => {
    const s = await aLApprobation();
    const r = await s.decider("Reprendre le titre.\nGarder le ton.");
    expect((r.corps as { transmission: unknown }).transmission).toEqual({ transmission: "coordinateur", parentId: BRIEF });
    expect(s.b.mises).toContainEqual({ issueId: ISSUE, patch: expect.objectContaining({ status: "blocked", assigneeAgentId: PRODUCTEUR, executionState: null }) });
    expect(s.commentaires.find((c) => c.issueId === ISSUE)!.texte).toContain("En attente du Coordinateur : correction demandée par l'humain");
    const parente = s.commentaires.filter((c) => c.issueId === BRIEF);
    expect(parente).toHaveLength(1);
    expect(parente[0]!.texte).toContain("> Reprendre le titre.\n> Garder le ton.");
    expect(parente[0]!.texte).toContain(REV1);
    expect(parente[0]!.texte).toContain("correction de rédaction");
    expect(s.reveils).toHaveLength(1);
    expect(s.reveils[0]!.issueId).toBe(BRIEF);
    expect(s.reveils[0]!.cle).toMatch(/^atelier-correction-humaine-/u);
    // La remise à zéro des cycles par la décision humaine est conservée (décision enregistrée).
    expect(s.b.t.decisions.filter((d) => d.action === "demander_correction")).toHaveLength(1);
  });

  for (const panne of ["reveil", "commentaire"] as const) {
    it(`M4 : ${panne} refusé par l'hôte : le livrable est remis dans son état d'avant et la transmission revient au producteur`, async () => {
      const s = await aLApprobation();
      const avant = { ...s.b.issues.get(ISSUE)! };
      const issues = s.b.ctx.issues as unknown as Record<string, unknown>;
      if (panne === "reveil") issues.requestWakeup = async () => { throw new Error("parente en backlog"); };
      else issues.createComment = async (cible: string) => { if (cible === BRIEF) throw new Error("commentaire refusé"); return { id: "c" }; };
      const r = await s.decider("Reprendre le titre.");
      expect((r.corps as { transmission: { transmission: string } }).transmission.transmission).toBe("producteur");
      const apres = s.b.issues.get(ISSUE)!;
      expect(apres.status).toBe(avant.status);
      expect(apres.assigneeAgentId).toBe(avant.assigneeAgentId);
      expect(apres.assigneeUserId ?? null).toBe(avant.assigneeUserId ?? null);
      expect(s.b.t.journal.filter((j) => j.type === "coordinateur.correction_transmise")).toHaveLength(0);
      expect(s.commentaires.filter((c) => c.issueId === ISSUE)).toHaveLength(0);
    });
  }

  it("tâche sans parente assignée au Coordinateur : comportement actuel (rien côté serveur, l'écran rend au producteur)", async () => {
    const s = await aLApprobation({ sansParente: true });
    const r = await s.decider("Reprendre le titre.");
    expect((r.corps as { transmission: { transmission: string } }).transmission.transmission).toBe("producteur");
    expect(s.b.mises.filter((m) => m.issueId === ISSUE)).toHaveLength(0);
    expect(s.reveils).toHaveLength(0);
    expect(s.commentaires).toHaveLength(0);
  });
});

describe("accueil : une question de l'équipe remonte en tête de « À faire »", () => {
  it("carte ask_user_questions en attente sur le brief : premier élément", async () => {
    const parent = { id: BRIEF, companyId: SOC, identifier: "ATL-1", title: "Brief", status: "in_progress", parentId: null, createdAt: new Date(0), updatedAt: new Date(0) };
    const bloquee = { id: ISSUE, companyId: SOC, identifier: "ATL-35", title: "Prospects", status: "blocked", parentId: BRIEF, createdAt: new Date(0), updatedAt: new Date(0) };
    const ctx = {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      agents: { list: async () => [], get: async () => null },
      approvals: { list: async () => [{ id: "ap-1", type: "budget_override_required", payload: {} }] },
      issues: {
        get: async (id: string) => (id === BRIEF ? parent : id === ISSUE ? bloquee : null),
        list: async (q: { status?: string }) => (q.status === "blocked" ? [bloquee] : []),
        listInteractions: async (id: string) => (id === BRIEF ? [{ id: "q1", kind: "ask_user_questions", status: "pending", title: "Codes postaux introuvables" }, { id: "q0", kind: "ask_user_questions", status: "answered", title: "Ancienne" }] : []),
      },
    } as unknown as PluginContext;
    const base = {
      listerPortes: async () => [{ issueId: ISSUE, actif: true }],
      listerCampagnes: async () => [{ id: CAMP, briefIssueId: BRIEF }],
      etatBaseClients: async () => ({ dernierImport: null, clients: 1, actifs: 1 }),
      marques: async () => [{ informationsManquantes: [] }],
    } as unknown as BaseAtelier;
    const routes = routesAccueil({
      ctx, base, statutTache: async () => ({ statut: "blocked_information", motif: "" }), passerelleConnectee: async () => true, documentsARevoir: async () => [],
    });
    const r = await routes["accueil.lister"]!({ cle: "accueil.lister" as never, params: {}, query: {}, corps: null, acteur: humain, companyId: SOC });
    const elements = (r.corps as { elements: Array<{ id: string; type: string; titre: string; action: string; lien: string }> }).elements;
    expect(elements[0]).toMatchObject({ id: "question:q1", type: "information_manquante", titre: "Codes postaux introuvables", action: "Répondre", lien: "/issues/ATL-1" });
    expect(elements.filter((e) => e.id.startsWith("question:"))).toHaveLength(1);
    expect(elements.length).toBeGreaterThan(1);
  });
});

describe("accueil : lectures de l'hôte bornées et parallèles", () => {
  it("m9 : jusqu'à 8 lectures simultanées, résultat dans l'ordre, alerte journalisée en cas de troncature", async () => {
    const portes = Array.from({ length: 70 }, (_, i) => ({ issueId: `liv-${i}`, actif: true }));
    let enCours = 0;
    let max = 0;
    const alertes: string[] = [];
    const attente = () => new Promise((r) => setTimeout(r, 2));
    // Ne mesure que les lectures de la section « questions de l'équipe » (les autres sections lisent aussi les tâches sous porte).
    const suivre = async <T,>(v: T, compter = true): Promise<T> => {
      if (compter) {
        enCours += 1;
        max = Math.max(max, enCours);
      }
      await attente();
      if (compter) enCours -= 1;
      return v;
    };
    const ctx = {
      logger: { info() {}, warn: (m: string) => void alertes.push(m), error() {}, debug() {} },
      agents: { list: async () => [], get: async () => null },
      approvals: { list: async () => [] },
      issues: {
        get: (id: string) => suivre(id.startsWith("liv-") ? { id, companyId: SOC, identifier: id, title: id, status: "blocked", parentId: `parent-${id}`, createdAt: new Date(0), updatedAt: new Date(0) } : { id, companyId: SOC, identifier: id, title: id, status: "in_progress", parentId: null, createdAt: new Date(0), updatedAt: new Date(0) }, id.startsWith("parent-")),
        list: async () => [],
        listInteractions: (id: string) => suivre(id === "parent-liv-1" ? [{ id: "q1", kind: "ask_user_questions", status: "pending", title: "Question 1" }] : []),
      },
    } as unknown as PluginContext;
    const base = {
      listerPortes: async () => portes,
      listerCampagnes: async () => [],
      etatBaseClients: async () => ({ dernierImport: null, clients: 1, actifs: 1 }),
      marques: async () => [{ informationsManquantes: [] }],
    } as unknown as BaseAtelier;
    const routes = routesAccueil({ ctx, base, statutTache: async () => ({ statut: "blocked_information", motif: "" }), passerelleConnectee: async () => true, documentsARevoir: async () => [] });
    const r = await routes["accueil.lister"]!({ cle: "accueil.lister" as never, params: {}, query: {}, corps: null, acteur: humain, companyId: SOC });
    const elements = (r.corps as { elements: Array<{ id: string }> }).elements;
    expect(elements.some((e) => e.id === "question:q1")).toBe(true);
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(8);
    expect(alertes.some((m) => m.includes("tronqu"))).toBe(true);
  });
});
