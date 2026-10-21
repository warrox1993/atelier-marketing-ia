/**
 * Chaîne entre agents (21/10/2026) : R1 (verdict d'une revue réveille l'auteur désigné par référence explicite, idempotent, plafonné,
 * jamais si une carte attend) et R4 (discussion laissée en revue ou bloquée sans interaction en attente : remise en cours).
 */
import { describe, expect, it } from "vitest";
import { CHAINE, creerChaine, lireVerdict } from "../src/serveur/chaine.js";
import { ORIGINE_DISCUSSION } from "../src/serveur/services-discussion.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const REVUE = "22222222-2222-4222-8222-222222222222";
const AUTEUR = "33333333-3333-4333-8333-333333333333";
const COORD_TACHE = "44444444-4444-4444-8444-444444444444";
const AGENT = "55555555-5555-4555-8555-555555555555";
const DISC = "66666666-6666-4666-8666-666666666666";
const AUTRE = "77777777-7777-4777-8777-777777777777";

type Tache = { id: string; identifier: string; status: string; parentId: string | null; assigneeAgentId: string | null; originKind?: string; originId?: string | null; title?: string };
type Lien = "titre" | "verdict" | "blocks" | "aucun" | "ambigu";

function banc(o: { verdict?: string | null; revision?: string; interactions?: Array<{ status: string }>; lien?: Lien; relecteur?: boolean; approbations?: Array<{ issueId: string; status: string }>; titre?: string } = {}) {
  const lien = o.lien ?? "titre";
  const taches: Record<string, Tache> = {
    // Cas réel : la revue a pour parent la mission du Coordinateur ; l'auteur n'est cité que par une référence explicite.
    [REVUE]: { id: REVUE, identifier: "ABC-10", status: "done", parentId: COORD_TACHE, assigneeAgentId: AGENT, title: o.titre ?? (lien === "titre" ? "Revue de ABC-8" : lien === "ambigu" ? "Revue de ABC-8 et ABC-9" : "Revue") },
    [AUTEUR]: { id: AUTEUR, identifier: "ABC-8", status: "in_review", parentId: null, assigneeAgentId: AGENT },
    [AUTRE]: { id: AUTRE, identifier: "ABC-9", status: "in_review", parentId: null, assigneeAgentId: AGENT },
    [COORD_TACHE]: { id: COORD_TACHE, identifier: "ABC-1", status: "in_progress", parentId: null, assigneeAgentId: "coord" },
    [DISC]: { id: DISC, identifier: "ABC-2", status: "in_review", parentId: null, assigneeAgentId: "coord", originKind: ORIGINE_DISCUSSION, originId: `discussion:${SOC}` },
  };
  const parIdentifiant = (id: string) => taches[id] ?? Object.values(taches).find((t) => t.identifier === id) ?? null;
  const doc = { verdict: o.verdict === undefined ? (lien === "verdict" ? "# Verdict de revue : ABC-8\n\n**Verdict : CHANGES_REQUESTED.**" : "{\"verdict\":\"CHANGES_REQUESTED\"}") : o.verdict, revision: o.revision ?? "rev-1" };
  const commentaires: Array<{ issueId: string; body: string }> = [];
  const reveils: Array<{ issueId: string; raison?: string; cle?: string | null }> = [];
  const maj: Array<{ issueId: string; patch: unknown }> = [];
  const journal: Array<{ type: string; entiteId: string; issueId: string | null; creeLe: string; donnees: Record<string, unknown> }> = [];
  const decisions: Array<{ creeLe: string }> = [];
  const avertissements: string[] = [];
  let interactions = o.interactions ?? [];
  let approbations = o.approbations ?? [];
  let horloge = Date.UTC(2026, 9, 21, 12, 0, 0);
  const ctx = {
    logger: { info() {}, warn: (m: string) => void avertissements.push(m) },
    agents: { get: async () => ({ urlKey: o.relecteur === false ? "redacteur-marketing" : "relecteur-marketing", role: "general", name: o.relecteur === false ? "Rédacteur" : "Relecteur" }) },
    issues: {
      get: async (id: string) => parIdentifiant(id),
      documents: { get: async (_i: string, cle: string) => (cle === "verdict" && doc.verdict !== null ? { body: doc.verdict, latestRevisionId: doc.revision, updatedAt: new Date(horloge) } : null) },
      relations: { get: async () => ({ blockedBy: [], blocks: lien === "blocks" ? [{ id: AUTEUR }] : [] }) },
      summaries: { getOrchestration: async () => ({ approvals: approbations }) },
      listInteractions: async (id: string) => interactions.filter((i) => (i as { issueId?: string }).issueId === undefined || (i as { issueId?: string }).issueId === id),
      createComment: async (issueId: string, body: string) => void commentaires.push({ issueId, body }),
      requestWakeup: async (issueId: string, _c: string, opts: { reason?: string; idempotencyKey?: string | null }) => (reveils.push({ issueId, raison: opts.reason, cle: opts.idempotencyKey }), { queued: true, runId: "r" }),
      update: async (issueId: string, patch: unknown) => void maj.push({ issueId, patch }),
    },
  };
  const base = {
    journaliser: async (e: { type: string; entiteId: string; issueId?: string | null; donnees?: Record<string, unknown> }) => void journal.push({ type: e.type, entiteId: e.entiteId, issueId: e.issueId ?? null, creeLe: new Date(horloge++).toISOString(), donnees: e.donnees ?? {} }),
    datesJournal: async (_c: string, issueId: string, type: string) => journal.filter((j) => j.issueId === issueId && j.type === type).map((j) => j.creeLe).sort().reverse(),
    journalExiste: async (_c: string, type: string, ent: string) => journal.some((j) => j.type === type && j.entiteId === ent),
    listerDecisions: async () => decisions,
  };
  const surEvt = creerChaine({ ctx: ctx as never, base: base as never });
  const evt = (entityId: string, to: string) => surEvt({ companyId: SOC, entityId, entityType: "issue", payload: { changes: { status: { to } } } });
  /** Tous les réveils, sans filtre : (tâche, motif). */
  const tous = () => reveils.map((r) => [r.issueId, r.raison] as const);
  return { tous, evt, taches, doc, commentaires, reveils, maj, journal, decisions, avertissements, setInteractions: (i: Array<{ status: string }>) => (interactions = i), setApprobations: (a: Array<{ issueId: string; status: string }>) => (approbations = a) };
}

const AUCUN_REVEIL: ReadonlyArray<readonly [string, string | undefined]> = [];
const INFO_COORD = [COORD_TACHE, "atelier_revue_verdict_information"] as const;
const CR_AUTEUR = [AUTEUR, "atelier_revue_verdict_changes_requested"] as const;

describe("lireVerdict", () => {
  it("JSON : le champ verdict fait seul foi, PASS = APPROVED, valeur inconnue = null", () => {
    expect(lireVerdict('{"verdict":"changes_requested","remarques":[]}')).toBe("CHANGES_REQUESTED");
    expect(lireVerdict('{"verdict":"PASS"}')).toBe("APPROVED");
    expect(lireVerdict('{"verdict":"APPROVED"}')).toBe("APPROVED");
    expect(lireVerdict('{"verdict":"BLOCKED_INFORMATION"}')).toBe("BLOCKED_INFORMATION");
    expect(lireVerdict('{"verdict":"MAYBE","remarques":"APPROVED"}')).toBeNull();
    expect(lireVerdict('{"verdict":null,"note":"Verdict : APPROVED"}')).toBeNull();
  });

  it("contre-exemple E2 : un mot dans un autre champ n'est jamais lu", () => {
    expect(lireVerdict('{"verdict":"PASS","historique":"cycle 1 : CHANGES_REQUESTED"}')).toBe("APPROVED");
    expect(lireVerdict('{"historique":"cycle 1 : CHANGES_REQUESTED"}')).toBeNull();
  });

  it("texte : seule une ligne « Verdict : X » compte, sensible à la casse", () => {
    expect(lireVerdict("The deliverable is not approved")).toBeNull();
    expect(lireVerdict("# Verdict\nAPPROVED, rien à signaler")).toBeNull();
    expect(lireVerdict("pas de verdict ici")).toBeNull();
    expect(lireVerdict("Verdict : approved")).toBeNull();
    expect(lireVerdict("Verdict : PASS… rien qui justifie CHANGES_REQUESTED")).toBe("APPROVED");
    expect(lireVerdict("Verdict : BLOCKED_INFORMATION")).toBe("BLOCKED_INFORMATION");
    expect(lireVerdict("Le résumé dit que Verdict : APPROVED est possible")).toBeNull();
  });

  it("cas réel : titre « Verdict de revue : ABC-8… » puis ligne en gras", () => {
    expect(lireVerdict("# Verdict de revue : ABC-8 (cycle 2)\n\nContexte.\n\n**Verdict : CHANGES_REQUESTED.**\n\nDétails APPROVED plus haut.")).toBe("CHANGES_REQUESTED");
  });
});

describe("R1 : verdict d'une tâche de revue", () => {
  it("CHANGES_REQUESTED : l'agent de la tâche revue est réveillé, le verdict est dans le motif et dans un commentaire (donnée) ; le Coordinateur est informé", async () => {
    const b = banc();
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD]);
    expect(b.commentaires[0]!.issueId).toBe(AUTEUR);
    expect(b.commentaires[0]!.body).toContain("DONNÉE");
    expect(b.journal.filter((j) => j.type === CHAINE.typeReveilVerdict)).toHaveLength(1);
  });

  it("APPROVED et PASS : l'auteur est réveillé aussi, avec le bon motif", async () => {
    for (const verdict of ['{"verdict":"APPROVED"}', '{"verdict":"PASS"}']) {
      const b = banc({ verdict });
      await b.evt(REVUE, "done");
      expect(b.tous()).toEqual([[AUTEUR, "atelier_revue_verdict_approved"], INFO_COORD]);
    }
  });

  it("BLOCKED_INFORMATION : aucun réveil ni commentaire de l'auteur, seulement l'information au Coordinateur", async () => {
    const b = banc({ verdict: '{"verdict":"BLOCKED_INFORMATION"}' });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([INFO_COORD]);
    expect(b.commentaires.map((c) => c.issueId)).toEqual([COORD_TACHE]);
    expect(b.commentaires[0]!.body).toContain("information seulement");
    // Pas compté dans le plafond.
    expect(b.journal.filter((j) => j.type === CHAINE.typeReveilAuteur)).toHaveLength(0);
  });

  it("idempotent par révision : le même événement rejoué ne réveille qu'une fois, une nouvelle révision réveille", async () => {
    const b = banc();
    await b.evt(REVUE, "done");
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD]);
    b.doc.revision = "rev-2";
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD, CR_AUTEUR, INFO_COORD]);
    expect(new Set(b.reveils.map((r) => r.cle)).size).toBe(4);
  });

  it("aucun réveil quand une carte attend l'humain sur la tâche revue", async () => {
    const b = banc({ interactions: [{ status: "pending" }] });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    expect(b.commentaires).toHaveLength(0);
    expect(b.journal).toHaveLength(0);
  });

  it("sans document verdict, ou tâche qui n'est pas terminée : rien", async () => {
    const b = banc({ verdict: null });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    const c = banc();
    c.taches[REVUE]!.status = "in_review";
    await c.evt(REVUE, "done");
    expect(c.tous()).toEqual(AUCUN_REVEIL);
  });

  it("verdict illisible (texte sans ligne « Verdict : ») : rien, avertissement", async () => {
    const b = banc({ verdict: "The deliverable is not approved" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    expect(b.journal).toHaveLength(0);
    expect(b.avertissements.length).toBeGreaterThan(0);
  });

  it.each(["titre", "verdict", "blocks"] as const)("référence explicite « %s » : la tâche revue est trouvée par son identifiant", async (lien) => {
    const b = banc({ lien });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD]);
  });

  it("la première ligne du document verdict est une référence valable, même sans titre markdown", async () => {
    const b = banc({ lien: "aucun", verdict: "Revue de ABC-8\n\nVerdict : CHANGES_REQUESTED" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD]);
  });

  it("une mention d'identifiant en milieu de document n'est PAS une référence", async () => {
    const b = banc({ lien: "aucun", verdict: "Revue.\n\nVerdict : CHANGES_REQUESTED\n\nVoir aussi ABC-8." });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    expect(b.avertissements.length).toBeGreaterThan(0);
  });

  it("aucun candidat (ni titre, ni verdict, ni blocks) : aucun réveil, même pas le parent ; avertissement journalisé", async () => {
    const b = banc({ lien: "aucun" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    expect(b.commentaires).toHaveLength(0);
    expect(b.journal).toHaveLength(0);
    expect(b.avertissements.some((m) => m.includes("introuvable ou ambiguë"))).toBe(true);
  });

  it("plusieurs candidats distincts : aucun réveil, avertissement", async () => {
    const b = banc({ lien: "ambigu" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    expect(b.avertissements.some((m) => m.includes("introuvable ou ambiguë"))).toBe(true);
  });

  it("un identifiant qui désigne le parent (mission du Coordinateur) n'est pas la tâche revue", async () => {
    const b = banc({ titre: "Revue de ABC-1" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
  });

  it("M2 : revue dont l'assigné n'est pas un agent relecteur et qui ne bloque rien : aucun réveil", async () => {
    const b = banc({ relecteur: false });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual(AUCUN_REVEIL);
    expect(b.commentaires).toHaveLength(0);
    expect(b.avertissements.some((m) => m.includes("relecteur"))).toBe(true);
  });

  it("M2 : assigné non relecteur mais la revue bloque la tâche revue : acceptée", async () => {
    const b = banc({ relecteur: false, lien: "blocks" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD]);
  });

  it("cas réel du 20/10 : parent = mission du Coordinateur, auteur trouvé par la référence ; le Coordinateur est informé sans être pris pour cible, pas de boucle au rejeu", async () => {
    const b = banc({ lien: "verdict" });
    await b.evt(REVUE, "done");
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD]);
    expect(b.commentaires.find((c) => c.issueId === COORD_TACHE)!.body).toContain("Information");
    await b.evt(REVUE, "done");
    expect(b.reveils).toHaveLength(2);
  });

  it("plafond de 3 réveils : le 4e verdict ne réveille pas l'auteur, un seul commentaire au Coordinateur SANS réveil, puis plus rien", async () => {
    const b = banc();
    for (const r of ["a", "b", "c"]) {
      b.doc.revision = r;
      await b.evt(REVUE, "done");
    }
    expect(b.tous()).toEqual([CR_AUTEUR, INFO_COORD, CR_AUTEUR, INFO_COORD, CR_AUTEUR, INFO_COORD]);
    const avant = b.reveils.length;
    for (const r of ["d", "e"]) {
      b.doc.revision = r;
      await b.evt(REVUE, "done");
    }
    expect(b.reveils).toHaveLength(avant);
    const versCoord = b.commentaires.filter((c) => c.issueId === COORD_TACHE && c.body.includes("carte de décision"));
    expect(versCoord).toHaveLength(1);
    expect(b.journal.filter((j) => j.type === CHAINE.typePlafond)).toHaveLength(1);
  });

  it("plafond : pas de commentaire au Coordinateur si une carte humaine y attend déjà (attenteHumaine(cible))", async () => {
    const b = banc();
    for (const r of ["a", "b", "c"]) {
      b.doc.revision = r;
      await b.evt(REVUE, "done");
    }
    // Seule la tâche du Coordinateur a une carte en attente (la tâche revue n'en a pas).
    const ctxInteractions = [{ status: "pending", issueId: COORD_TACHE }];
    b.setInteractions(ctxInteractions);
    const avant = b.commentaires.length;
    b.doc.revision = "d";
    await b.evt(REVUE, "done");
    expect(b.commentaires).toHaveLength(avant);
    expect(b.reveils).toHaveLength(6);
  });

  it("M2 : le plafond vaut aussi pour APPROVED (3 réveils de l'auteur au plus depuis la dernière action humaine)", async () => {
    const b = banc({ verdict: '{"verdict":"APPROVED"}' });
    for (const r of ["a", "b", "c", "d"]) {
      b.doc.revision = r;
      await b.evt(REVUE, "done");
    }
    expect(b.reveils.filter((r) => r.issueId === AUTEUR)).toHaveLength(3);
    expect(b.reveils.filter((r) => r.issueId !== AUTEUR && r.raison !== INFO_COORD[1])).toHaveLength(0);
    expect(b.commentaires.filter((c) => c.issueId === COORD_TACHE && c.body.includes("carte de décision"))).toHaveLength(1);
  });

  it("une décision humaine remet le plafond à zéro", async () => {
    const b = banc();
    for (const r of ["a", "b", "c"]) {
      b.doc.revision = r;
      await b.evt(REVUE, "done");
    }
    b.decisions.push({ creeLe: new Date(Date.UTC(2026, 9, 21, 13, 0, 0)).toISOString() });
    b.doc.revision = "d";
    await b.evt(REVUE, "done");
    expect(b.reveils).toHaveLength(8);
    expect(b.reveils[6]).toMatchObject({ issueId: AUTEUR, raison: CR_AUTEUR[1] });
  });

  it("F1 : un APPROVED remet à zéro le compte des CHANGES_REQUESTED (le plafond total reste à 3 réveils)", async () => {
    const b = banc();
    // 2 CR, puis 1 APPROVED : 3 réveils au total ; une action humaine les remet à zéro, mais ici on teste le décompte CR.
    for (const [r, v] of [["a", "CHANGES_REQUESTED"], ["b", "CHANGES_REQUESTED"]] as const) {
      b.doc.revision = r;
      b.doc.verdict = JSON.stringify({ verdict: v });
      await b.evt(REVUE, "done");
    }
    b.doc.revision = "c";
    b.doc.verdict = JSON.stringify({ verdict: "APPROVED" });
    await b.evt(REVUE, "done");
    expect(b.journal.filter((j) => j.type === CHAINE.typeChanges)).toHaveLength(2);
    expect(b.journal.filter((j) => j.type === CHAINE.typeApprouve)).toHaveLength(1);
    expect(b.reveils.filter((r) => r.issueId === AUTEUR)).toHaveLength(3);
  });
});

describe("R4 : discussion laissée en revue ou bloquée", () => {
  it.each(["in_review", "blocked"])("passage à %s sans interaction ni approbation en attente : remise en in_progress, journalisée, sans réveil", async (statut) => {
    const b = banc();
    b.taches[DISC]!.status = statut;
    await b.evt(DISC, statut);
    expect(b.maj).toEqual([{ issueId: DISC, patch: { status: "in_progress" } }]);
    expect(b.journal[0]).toMatchObject({ type: CHAINE.typeDiscussionReprise, issueId: DISC, donnees: { de: statut, vers: "in_progress" } });
    expect(b.tous()).toEqual(AUCUN_REVEIL);
  });

  it("une interaction humaine en attente : la discussion reste en revue", async () => {
    const b = banc({ interactions: [{ status: "pending" }] });
    await b.evt(DISC, "in_review");
    expect(b.maj).toHaveLength(0);
    expect(b.journal).toHaveLength(0);
  });

  it("F2 : une approbation Paperclip en attente liée à la tâche : la discussion reste en revue", async () => {
    const b = banc({ approbations: [{ issueId: DISC, status: "pending" }] });
    await b.evt(DISC, "in_review");
    expect(b.maj).toHaveLength(0);
    expect(b.journal).toHaveLength(0);
  });

  it("F2 : une approbation déjà décidée ne retient pas la discussion", async () => {
    const b = banc({ approbations: [{ issueId: DISC, status: "approved" }] });
    await b.evt(DISC, "in_review");
    expect(b.maj).toEqual([{ issueId: DISC, patch: { status: "in_progress" } }]);
  });

  it("une tâche ordinaire en revue n'est pas touchée par R4", async () => {
    const b = banc();
    await b.evt(AUTEUR, "in_review");
    expect(b.maj).toHaveLength(0);
  });

  it("un échec de l'hôte ne lève jamais", async () => {
    const surEvt = creerChaine({ ctx: { logger: { info() {}, warn() {} }, issues: { get: async () => { throw new Error("hôte"); } } } as never, base: {} as never });
    await expect(surEvt({ companyId: SOC, entityId: DISC, entityType: "issue", payload: { changes: { status: { to: "in_review" } } } })).resolves.toBeUndefined();
  });
});
