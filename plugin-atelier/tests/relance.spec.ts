import { describe, expect, it } from "vitest";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { ACTIONS_UI, DossierHumain, RelancerCorrectionEntree, palierSuivant } from "../src/contrats/index.js";
import { EXEMPLES_DONNEES } from "../src/contrats/exemples/index.js";
import { creerAiguillage, type ActeurHote, type Services } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { ErreurAtelier } from "../src/serveur/erreurs.js";

const ISSUE = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";
const SOC = "33333333-3333-4333-8333-333333333333";

describe("escalier de montée du producteur (levier c)", () => {
  it("monte l'effort d'un cran : medium → high → xhigh → max", () => {
    expect(palierSuivant({ modele: "claude-sonnet-5-5", effort: "medium" })).toEqual({ ok: true, apres: { modele: "claude-sonnet-5-5", effort: "high" } });
    expect(palierSuivant({ modele: "claude-sonnet-5-5", effort: "high" })).toEqual({ ok: true, apres: { modele: "claude-sonnet-5-5", effort: "xhigh" } });
    expect(palierSuivant({ modele: "claude-sonnet-5-5", effort: "xhigh" })).toEqual({ ok: true, apres: { modele: "claude-sonnet-5-5", effort: "max" } });
  });
  it("un effort absent vaut medium (défaut de Claude Code)", () => {
    expect(palierSuivant({ modele: "claude-sonnet-5-5", effort: null })).toEqual({ ok: true, apres: { modele: "claude-sonnet-5-5", effort: "high" } });
  });
  it("au maximum d'effort, passe au modèle au-dessus et repart de medium", () => {
    expect(palierSuivant({ modele: "claude-haiku-4-5", effort: "max" })).toEqual({ ok: true, apres: { modele: "claude-sonnet-5-5", effort: "medium" } });
    expect(palierSuivant({ modele: "claude-sonnet-5-5", effort: "max" })).toEqual({ ok: true, apres: { modele: "claude-opus-5-5", effort: "medium" } });
  });
  it("refuse au sommet, sans modèle, avec un effort ou un modèle inconnu", () => {
    expect(palierSuivant({ modele: "claude-opus-5-5", effort: "max" }).ok).toBe(false);
    expect(palierSuivant({ modele: null, effort: "high" }).ok).toBe(false);
    expect(palierSuivant({ modele: "claude-sonnet-5-5", effort: "turbo" }).ok).toBe(false);
    expect(palierSuivant({ modele: "modele-maison", effort: "max" }).ok).toBe(false);
  });
});

describe("entrée de la relance de correction", () => {
  const base = { issueId: ISSUE, commentaire: "Le producteur n'a pas l'adresse de Seraing." };
  it("exige au moins un levier", () => {
    const r = RelancerCorrectionEntree.safeParse(base);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("Au moins un levier");
  });
  it("accepte chaque levier seul", () => {
    expect(RelancerCorrectionEntree.safeParse({ ...base, consigne: "Ajouter Seraing." }).success).toBe(true);
    expect(RelancerCorrectionEntree.safeParse({ ...base, information: { reponse: "quai du Test 3, 4100 Seraing" } }).success).toBe(true);
    expect(RelancerCorrectionEntree.safeParse({ ...base, versionCorrigee: { revisionId: AGENT } }).success).toBe(true);
    expect(RelancerCorrectionEntree.safeParse({ ...base, versionCorrigee: { corps: "# texte direct" } }).success).toBe(false);
    expect(
      RelancerCorrectionEntree.safeParse({ ...base, escalade: { agentId: AGENT, avant: { modele: "claude-sonnet-5-5", effort: "medium" }, apres: { modele: "claude-sonnet-5-5", effort: "high" } } }).success,
    ).toBe(true);
  });
  it("commentaire obligatoire (non vide)", () => {
    expect(RelancerCorrectionEntree.safeParse({ ...base, commentaire: "   ", consigne: "x" }).success).toBe(false);
  });
  it("aucune option « accepter malgré les défauts » : tout champ inconnu est refusé", () => {
    for (const champ of ["accepterMalgreDefauts", "accepter", "leverPorte", "forcer", "statut"]) {
      expect(RelancerCorrectionEntree.safeParse({ ...base, consigne: "x", [champ]: true }).success).toBe(false);
    }
  });
});

describe("contrat des actions humaines", () => {
  it("l'ancienne levée de porte (contournement de P2) n'existe plus", () => {
    expect(Object.keys(ACTIONS_UI)).not.toContain("atelier.porte.lever");
  });
  it("la relance est réservée à l'humain", () => {
    expect(ACTIONS_UI["atelier.correction.relancer"].humainSeulement).toBe(true);
  });
  it("aucune action n'accepte un livrable sans porte franchie", () => {
    const cles = Object.keys(ACTIONS_UI).join(" ");
    expect(cles).not.toMatch(/accepter|forcer|lever|contourner/u);
  });
  it("le dossier d'exemple reste valide avec les champs de relance (valeurs par défaut)", () => {
    const d = DossierHumain.parse(EXEMPLES_DONNEES["atelier.dossier"]);
    expect(d.relances).toEqual([]);
    expect(d.connecteurPublication).toBe(false);
  });
});

/** Faux contexte minimal : enregistre les gestionnaires et refuse toute lecture de base. */
function fauxContexte() {
  const actions = new Map<string, (p: Record<string, unknown>, c: { actor: unknown; companyId: string }) => Promise<unknown>>();
  const interdit = () => {
    throw new Error("accès à la base interdit dans ce test");
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    data: { register() {} },
    actions: { register: (cle: string, fn: never) => actions.set(cle, fn) },
    events: { on() {} },
    db: { query: interdit, execute: interdit, namespace: "plugin_atelier_f0322cc62c" },
    issues: { get: interdit, update: interdit },
    agents: { get: interdit },
  } as unknown as PluginContext;
  return { ctx, actions };
}

describe("relance : refus côté serveur pour un agent", () => {
  it("le pont refuse l'action à un agent, sans appeler le service", async () => {
    const { ctx, actions } = fauxContexte();
    let appele = false;
    const services: Services = { routes: {}, donnees: {}, actions: { "atelier.correction.relancer": async () => ((appele = true), {}) } };
    creerAiguillage(ctx, services).enregistrer();
    const action = actions.get("atelier.correction.relancer");
    expect(action).toBeDefined();
    const params = { companyId: SOC, issueId: ISSUE, commentaire: "auto", consigne: "accepte" };
    await expect(action!(params, { actor: { type: "agent", agentId: AGENT, runId: null }, companyId: SOC })).rejects.toThrow(/^\[elevation_refusee\]/u);
    await expect(action!(params, { actor: { type: "system", runId: null }, companyId: SOC })).rejects.toThrow(/^\[elevation_refusee\]/u);
    expect(appele).toBe(false);
    // L'hôte peut ajouter `renderEnvironment` : il ne fait pas échouer le schéma strict.
    await action!({ ...params, renderEnvironment: null }, { actor: { type: "user", userId: "local-board", runId: null }, companyId: SOC });
    expect(appele).toBe(true);
    await expect(action!({ ...params, accepterMalgreDefauts: true }, { actor: { type: "user", userId: "local-board", runId: null }, companyId: SOC })).rejects.toThrow(
      /^\[entree_invalide\] Paramètres invalides pour atelier\.correction\.relancer \(/u,
    );
  });

  it("le service refuse aussi un agent (défense en profondeur), avant toute lecture", async () => {
    const { ctx } = fauxContexte();
    const services = creerServices(ctx);
    const agent: ActeurHote = { type: "agent", id: AGENT, agentId: AGENT, userId: null, runId: null };
    const appel = services.actions["atelier.correction.relancer"]!({ issueId: ISSUE, commentaire: "auto", consigne: "x" }, SOC, agent);
    await expect(appel).rejects.toBeInstanceOf(ErreurAtelier);
    await expect(services.actions["atelier.correction.relancer"]!({ issueId: ISSUE, commentaire: "auto", consigne: "x" }, SOC, agent)).rejects.toMatchObject({ code: "elevation_refusee" });
  });
});
