import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";
import {
  ACTIONS_UI,
  DONNEES_UI,
  DeposerVerdictEntree,
  ESPACE_BASE,
  EXPORTS_UI,
  EnvoyerMessageEntree,
  PLUGIN_ID,
  ROUTES_API,
  SLUG_ESPACE_BASE,
  calculerStatutFonctionnel,
  type EtatNatifTache,
  type FaitsComplementaires,
} from "../src/contrats/index.js";
import { SourceReelle } from "../src/contrats/campagnes.js";
import { EXEMPLES_DONNEES } from "../src/contrats/exemples/index.js";

/** Copie conforme de derivePluginDatabaseNamespace (paperclip/server/src/services/plugin-database.ts). */
function deriverEspaceCommeLHote(cle: string, slug?: string) {
  const hash = createHash("sha256").update(cle).digest("hex").slice(0, 10);
  const s = (slug ?? cle).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_").slice(0, 36) || "plugin";
  return `plugin_${s}_${hash}`.slice(0, 63);
}

describe("identifiants figés", () => {
  it("le nom d'espace de base correspond à la dérivation de l'hôte", () => {
    expect(deriverEspaceCommeLHote(PLUGIN_ID, SLUG_ESPACE_BASE)).toBe(ESPACE_BASE);
  });

  it("aucun commentaire SQL ne contient d'apostrophe droite (validateur de l'hôte)", () => {
    const sql = readFileSync(new URL("../migrations/001_atelier_socle.sql", import.meta.url), "utf8");
    const fautives = sql.split("\n").filter((l) => l.trimStart().startsWith("--") && l.includes("'"));
    expect(fautives).toEqual([]);
  });

  it("la migration n'utilise que l'espace du plugin ou des tables publiques déclarées", () => {
    const sql = readFileSync(new URL("../migrations/001_atelier_socle.sql", import.meta.url), "utf8");
    const schemas = new Set([...sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(/g)].map((m) => m[1]));
    for (const s of schemas) expect([ESPACE_BASE, "public"]).toContain(s);
    const publiques = [...sql.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]);
    for (const t of publiques) expect(manifest.database?.coreReadTables).toContain(t);
  });
});

describe("manifeste", () => {
  it("déclare une route par entrée de ROUTES_API, avec résolution d'entreprise", () => {
    expect(manifest.apiRoutes).toHaveLength(ROUTES_API.length);
    for (const r of manifest.apiRoutes ?? []) {
      expect(r.companyResolution).toBeDefined();
      expect(r.capability).toBe("api.routes.register");
    }
    const cles = new Set((manifest.apiRoutes ?? []).map((r) => r.routeKey));
    expect(cles.size).toBe(ROUTES_API.length);
  });

  it("déclare les emplacements UI attendus du lot C", () => {
    const exports = (manifest.ui?.slots ?? []).map((s) => s.exportName).sort();
    expect(exports).toEqual(Object.values(EXPORTS_UI).sort());
  });

  it("les routes réservées à l'humain sont en auth board", () => {
    const decision = ROUTES_API.find((r) => r.cle === "tache.decision");
    expect(decision?.auth).toBe("board");
  });
});

describe("exemples du lot C", () => {
  for (const cle of Object.keys(DONNEES_UI) as Array<keyof typeof DONNEES_UI>) {
    it(`l'exemple ${cle} respecte son schéma`, () => {
      const analyse = DONNEES_UI[cle].resultat.safeParse(EXEMPLES_DONNEES[cle]);
      if (!analyse.success) throw new Error(JSON.stringify(analyse.error.issues.slice(0, 5), null, 1));
      expect(analyse.success).toBe(true);
    });
  }

  it("toutes les actions humaines sont marquées humainSeulement sauf l'évaluation de porte", () => {
    const nonHumaines = Object.entries(ACTIONS_UI).filter(([, a]) => !a.humainSeulement).map(([c]) => c);
    expect(nonHumaines).toEqual(["atelier.porte.evaluer"]);
  });
});

describe("schémas d'entrée", () => {
  const R = "55555555-5555-4555-8555-555555555551";
  it("un verdict PASS ne peut pas contenir de constat majeur", () => {
    const r = DeposerVerdictEntree.safeParse({
      revisionId: R, role: "exigences", verdict: "PASS",
      constats: [{ categorie: "exigence_manquante", gravite: "majeure", emplacement: "x", description: "x", preuve: "x", correctionAttendue: "x" }],
    });
    expect(r.success).toBe(false);
  });
  it("NA exige une justification (le constat d'un CHANGES_REQUESTED est vérifié par le service)", () => {
    expect(DeposerVerdictEntree.safeParse({ revisionId: R, role: "technique", verdict: "NOT_APPLICABLE_JUSTIFIED" }).success).toBe(false);
    expect(DeposerVerdictEntree.safeParse({ revisionId: R, role: "technique", verdict: "NOT_APPLICABLE_JUSTIFIED", justification: "Aucun lien ni formulaire dans ce texte." }).success).toBe(true);
  });
  it("un message refuse tout champ hors contrat (expéditeur, approbation…)", () => {
    const base = { recipient: { type: "agent", id: "x" }, contenu: { type: "blocage", raison: "r", informationManquante: "i" } };
    expect(EnvoyerMessageEntree.safeParse(base).success).toBe(true);
    expect(EnvoyerMessageEntree.safeParse({ ...base, sender: { type: "humain", id: "local-board" } }).success).toBe(false);
    expect(EnvoyerMessageEntree.safeParse({ ...base, approvalId: "a" }).success).toBe(false);
    expect(EnvoyerMessageEntree.safeParse({ recipient: base.recipient, contenu: { type: "approbation", ok: true } }).success).toBe(false);
  });
});

describe("statuts fonctionnels calculés depuis l'état natif", () => {
  const faits: FaitsComplementaires = { bloqueursNonResolus: 0, runActif: false, dernierRunEchoue: false, agentEnPauseBudget: false, sousPorte: true };
  const tache = (t: Partial<EtatNatifTache>): EtatNatifTache => ({ status: "todo", assigneeAgentId: "a", assigneeUserId: null, executionState: null, ...t });
  const cas: Array<[string, EtatNatifTache, Partial<FaitsComplementaires>, string]> = [
    ["backlog", tache({ status: "backlog" }), {}, "queued"],
    ["todo non affectée", tache({ assigneeAgentId: null }), {}, "queued"],
    ["todo affectée", tache({}), {}, "ready"],
    ["todo bloquée par dépendance", tache({}), { bloqueursNonResolus: 2 }, "blocked_dependency"],
    ["en cours avec run", tache({ status: "in_progress" }), { runActif: true }, "running"],
    ["corrections demandées", tache({ status: "in_progress", executionState: { status: "changes_requested", currentStageType: "review", currentParticipant: null } }), {}, "changes_requested"],
    ["en revue agent", tache({ status: "in_review", executionState: { status: "pending", currentStageType: "review", currentParticipant: { type: "agent", agentId: "r" } } }), {}, "awaiting_review"],
    ["escalade humaine", tache({ status: "in_review", executionState: { status: "pending", currentStageType: "review", currentParticipant: { type: "user", userId: "u" } } }), {}, "blocked_information"],
    ["étape d'approbation", tache({ status: "in_review", executionState: { status: "pending", currentStageType: "approval", currentParticipant: { type: "user", userId: "u" } } }), {}, "ready_for_human"],
    ["bloquée sans dépendance", tache({ status: "blocked" }), {}, "blocked_information"],
    ["budget", tache({ status: "in_progress" }), { agentEnPauseBudget: true }, "blocked_budget"],
    ["done sous porte avec décision « approuver » valide sur la révision courante", tache({ status: "done" }), { approbationValide: true }, "approved"],
    // H2 (revue indépendante) : jamais « Approuvée par l'humain » sans vraie décision.
    ["done sous porte sans décision humaine valide", tache({ status: "done" }), { approbationValide: false }, "blocked_information"],
    ["done sous porte, décision inconnue", tache({ status: "done" }), {}, "blocked_information"],
    ["done hors porte", tache({ status: "done" }), { sousPorte: false }, "completed"],
    ["échec du dernier run", tache({ status: "in_progress" }), { dernierRunEchoue: true }, "failed"],
    ["annulée", tache({ status: "cancelled" }), {}, "cancelled"],
  ];
  for (const [nom, t, f, attendu] of cas) {
    it(nom, () => expect(calculerStatutFonctionnel(t, { ...faits, ...f }).statut).toBe(attendu));
  }
});

describe("SourceReelle : services de la passerelle lus en mode réel", () => {
  const base = { nom: "n", reelle: true, detail: "d", verifieLe: "2026-10-21T12:00:00.000Z" };
  for (const cle of ["bce", "bnb", "osm", "liens", "extraction", "audit"]) {
    it(`accepte ${cle}`, () => expect(SourceReelle.safeParse({ ...base, cle }).success).toBe(true));
  }
  it("refuse un service inconnu", () => expect(SourceReelle.safeParse({ ...base, cle: "inconnu" }).success).toBe(false));
});
