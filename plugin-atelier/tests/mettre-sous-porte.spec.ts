/**
 * MK-01 (audit du 29/10/2026) : aucune tâche marketing n'était sous la porte (executionPolicy null partout, l'unique
 * POST /portes refusé). La route tache.mettre-sous-porte pose la politique native du gabarit livrable-public puis
 * crée la porte ; /sante signale les tâches à livrable restées sans porte.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { GABARIT_LIVRABLE_PUBLIC } from "../src/contrats/index.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { CAMP, COORD, ISSUE, PORTE_AGENT, PRODUCTEUR, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const EXIGENCES = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const TECH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const CONF = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";
const BIS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4";
const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });
const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };

function banc(avant: unknown[] = []) {
  const b = creerBanc();
  b.t.exigences.push({ id: "ex-1", code: "REQ-001", companyId: SOC, campagneId: CAMP, version: 1, exclusion: { etat: "aucune" }, modifieLe: b.horloge() });
  b.issues.set(ISSUE, { id: ISSUE, companyId: SOC, projectId: null, status: "todo", assigneeAgentId: PRODUCTEUR, executionPolicy: null, title: "Page", identifier: "DEM-1" });
  const slugs: Array<[string, string]> = [[COORD, "coordinateur"], [PORTE_AGENT, "porte"], [EXIGENCES, "exigences"], [RELECTEUR, "relecteur"], [TECH, "tests-techniques"], [CONF, "conformite-publicitaire"], [PRODUCTEUR, "contenus"]];
  (b.ctx.agents as unknown as { list: () => Promise<unknown[]> }).list = async () => [
    ...avant,
    ...slugs.map(([id, slug]) => ({ id, companyId: SOC, name: slug, role: id === COORD ? "ceo" : "general", status: "active", urlKey: slug, metadata: { atelier: { slug } } })),
  ];
  return b;
}

async function route(b: ReturnType<typeof creerBanc>, cle: string, acteur: ActeurHote, corps: unknown, params: Record<string, string> = {}) {
  const services = creerServices(b.ctx, { base: b.base, modeDeploiement: () => "local_trusted" });
  try {
    return await services.routes[cle as "tache.contexte"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur, corps });
  } catch (err) {
    return { statut: 0, corps: err as { code?: string; message?: string } };
  }
}

const corps = { campagneId: CAMP, exigencesCiblees: ["REQ-001"] };

describe("MK-01 : tache.mettre-sous-porte", () => {
  it("le gabarit du plugin est celui de organisation/politiques/livrable-public.json", () => {
    const fichier = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "organisation", "politiques", "livrable-public.json"), "utf8"));
    expect(GABARIT_LIVRABLE_PUBLIC).toEqual({ revuesRequises: fichier.porte.revuesRequises, executionPolicy: fichier.executionPolicy });
  });

  it("le Coordinateur pose la politique native résolue puis la porte à trois revues", async () => {
    const b = banc();
    const r = await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE });
    expect(r.statut).toBe(201);
    expect(b.issues.get(ISSUE)!.executionPolicy).toEqual({
      mode: "normal", commentRequired: true, maxReviewRounds: 3,
      stages: [{ type: "review", participants: [{ type: "agent", agentId: PORTE_AGENT }] }, { type: "approval", participants: [{ type: "user", userId: "local-board" }] }],
    });
    expect(b.t.portes[0]!.revuesRequises).toEqual([{ role: "exigences", agentId: EXIGENCES }, { role: "metier", agentId: RELECTEUR }, { role: "technique", agentId: TECH }]);
    // Une seconde mise sous porte est refusée sans toucher à la politique.
    expect((await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).corps).toMatchObject({ code: "conflit" });
  });

  it("communication réglementée : la revue « conformite » s'ajoute (quatre revues)", async () => {
    const b = banc();
    expect((await route(b, "tache.mettre-sous-porte", agent(COORD), { ...corps, conformite: true }, { issueId: ISSUE })).statut).toBe(201);
    expect(b.t.portes[0]!.revuesRequises.map((x: { role: string }) => x.role)).toEqual(["exigences", "metier", "technique", "conformite"]);
    expect(b.t.portes[0]!.revuesRequises[3]).toEqual({ role: "conformite", agentId: CONF });
  });

  it("réservée au Coordinateur : un autre agent ou un humain est refusé, rien n'est posé", async () => {
    for (const acteur of [agent(PRODUCTEUR), humain]) {
      const b = banc();
      expect((await route(b, "tache.mettre-sous-porte", acteur, corps, { issueId: ISSUE })).corps).toMatchObject({ code: "role_non_autorise" });
      expect(b.issues.get(ISSUE)!.executionPolicy).toBeNull();
      expect(b.t.portes).toEqual([]);
    }
  });

  it("/sante signale une tâche à livrable sans porte, plus après la mise sous porte", async () => {
    const b = banc();
    b.documents.set(`${ISSUE}:livrable`, { latestRevisionId: "88888888-8888-4888-8888-888888888881", latestRevisionNumber: 1, title: "Page", body: "# Page", updatedByAgentId: PRODUCTEUR, createdByAgentId: PRODUCTEUR });
    const sante = async () => (await route(b, "sante", humain, undefined)).corps as { portesManquantes: { taches: string[]; alerte: string | null } };
    const avant = (await sante()).portesManquantes;
    expect(avant.taches).toEqual(["DEM-1"]);
    expect(avant.alerte).toMatch(/1 tâche à livrable sans porte/u);
    expect((await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).statut).toBe(201);
    expect((await sante()).portesManquantes).toEqual({ taches: [], alerte: null });
  });
});

/* ------------------------------------------------------------------ */
/* Revue de sécurité finale du 30/10/2026 : M2 et B1                    */
/* ------------------------------------------------------------------ */
const POLITIQUE = {
  mode: "normal", commentRequired: true, maxReviewRounds: 3,
  stages: [{ type: "review", participants: [{ type: "agent", agentId: PORTE_AGENT }] }, { type: "approval", participants: [{ type: "user", userId: "local-board" }] }],
};
const AGENT_DU_ROLE: Record<string, string> = { exigences: EXIGENCES, metier: RELECTEUR, technique: TECH, conformite: CONF };
const creer = (b: ReturnType<typeof creerBanc>, acteur: ActeurHote, roles: string[]) =>
  route(b, "portes.creer", acteur, { companyId: SOC, issueId: ISSUE, campagneId: CAMP, exigencesCiblees: ["REQ-001"], revuesRequises: roles.map((role) => ({ role, agentId: AGENT_DU_ROLE[role] })) });
/** Tâche dont la politique native est déjà posée (revue par la Porte, approbation humaine). */
function sousPolitique() {
  const b = banc();
  b.issues.get(ISSUE)!.executionPolicy = POLITIQUE;
  return b;
}
/** Fiche du client avec un module de conformité actif (réglage du client, jamais d'un agent). */
function avecModuleConformite(b: ReturnType<typeof creerBanc>) {
  (b.base as unknown as { marques: () => Promise<unknown[]> }).marques = async () => [
    { modulesConformite: [{ code: "intermediaire_assurance", entites: [], motsInterdits: [], activeLe: "2026-10-01T00:00:00.000Z", activePar: "local-board" }] },
  ];
  return b;
}

describe("M2 : portes.creer réservé au board et au Coordinateur, revues d'un gabarit", () => {
  it("un agent autre que le Coordinateur ne pose pas la porte, même sur une tâche déjà sous politique native", async () => {
    for (const a of [PRODUCTEUR, RELECTEUR]) {
      const b = sousPolitique();
      expect((await creer(b, agent(a), ["exigences", "metier", "technique"])).corps).toMatchObject({ code: "role_non_autorise" });
      expect(b.t.portes).toEqual([]);
    }
  });

  it("le Coordinateur : seulement les revues d'un gabarit (dossier, interne, public), conformite en plus", async () => {
    for (const roles of [["technique"], ["metier"], ["exigences", "technique"], ["metier", "technique"], ["conformite"]]) {
      const b = sousPolitique();
      expect((await creer(b, agent(COORD), roles)).corps).toMatchObject({ code: "entree_invalide" });
      expect(b.t.portes).toEqual([]);
    }
    for (const roles of [["exigences"], ["exigences", "metier"], ["exigences", "metier", "technique"], ["exigences", "metier", "conformite"]]) {
      expect((await creer(sousPolitique(), agent(COORD), roles)).statut).toBe(201);
    }
  });

  it("le board garde le choix des revues (Observatoire : une seule revue métier)", async () => {
    expect((await creer(sousPolitique(), humain, ["metier"])).statut).toBe(201);
  });

  it("module de conformité actif : un livrable public posé par un agent exige conformite, la mise sous porte l'ajoute d'office", async () => {
    const b = avecModuleConformite(sousPolitique());
    expect((await creer(b, agent(COORD), ["exigences", "metier", "technique"])).corps).toMatchObject({ code: "entree_invalide" });
    expect(b.t.portes).toEqual([]);
    expect((await creer(b, agent(COORD), ["exigences", "metier", "technique", "conformite"])).statut).toBe(201);
    const c = avecModuleConformite(banc());
    expect((await route(c, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).statut).toBe(201);
    expect(c.t.portes[0]!.revuesRequises).toEqual([
      { role: "exigences", agentId: EXIGENCES }, { role: "metier", agentId: RELECTEUR }, { role: "technique", agentId: TECH }, { role: "conformite", agentId: CONF },
    ]);
  });
});

describe("B1 : mettre-sous-porte contrôle tout avant d'écrire la politique, relecteurs par slug enregistré", () => {
  it("campagne inconnue ou exigence absente : refus, aucune politique native posée", async () => {
    const cas: Array<[unknown, string]> = [[{ ...corps, campagneId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9" }, "hors_entreprise"], [{ ...corps, exigencesCiblees: ["REQ-999"] }, "entree_invalide"]];
    for (const [c, code] of cas) {
      const b = banc();
      expect((await route(b, "tache.mettre-sous-porte", agent(COORD), c, { issueId: ISSUE })).corps).toMatchObject({ code });
      expect(b.issues.get(ISSUE)!.executionPolicy).toBeNull();
      expect(b.t.journal.filter((j) => j.type === "porte.politique_posee")).toEqual([]);
    }
  });

  it("un agent dont seul l'urlKey vaut « relecteur » n'est pas pris pour le relecteur", async () => {
    const imposteur = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5", companyId: SOC, name: "relecteur", role: "general", status: "active", urlKey: "relecteur", metadata: {} };
    const b = banc([imposteur]);
    expect((await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).statut).toBe(201);
    expect(b.t.portes[0]!.revuesRequises[1]).toEqual({ role: "metier", agentId: RELECTEUR });
  });

  // Patch socle 0154 : un plugin ne retire ni ne change des étapes déjà posées (403 atelier_politique_verrouillee).
  it("politique native déjà posée et différente du gabarit : refus clair avant toute écriture, rien n'est touché", async () => {
    const b = banc();
    const autre = { mode: "normal", commentRequired: true, maxReviewRounds: 3, stages: [{ type: "review", participants: [{ type: "agent", agentId: RELECTEUR }] }, { type: "approval", participants: [{ type: "user", userId: "local-board" }] }] };
    b.issues.get(ISSUE)!.executionPolicy = autre;
    const r = await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE });
    expect(r.corps).toMatchObject({ code: "conflit" });
    expect((r.corps as { message: string }).message).toMatch(/board/u);
    expect(b.issues.get(ISSUE)!.executionPolicy).toEqual(autre);
    expect(b.mises.filter((m) => m.patch.executionPolicy !== undefined)).toEqual([]);
    expect(b.t.portes).toEqual([]);
  });

  it("politique du gabarit déjà posée : la porte est créée sans réécrire la politique", async () => {
    const b = sousPolitique();
    expect((await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).statut).toBe(201);
    expect(b.mises.filter((m) => m.patch.executionPolicy !== undefined)).toEqual([]);
    expect(b.t.portes).toHaveLength(1);
  });

  it("deux agents au même slug enregistré : refus, aucune politique native posée", async () => {
    const doublon = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6", companyId: SOC, name: "Relecteur 2", role: "general", status: "active", urlKey: "relecteur-2", metadata: { atelier: { slug: "relecteur" } } };
    const b = banc([doublon]);
    expect((await route(b, "tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).corps).toMatchObject({ code: "entree_invalide" });
    expect(b.issues.get(ISSUE)!.executionPolicy).toBeNull();
    expect(b.t.portes).toEqual([]);
  });
});

describe("B3 : /sante garde la liste des livrables sans porte 60 s par entreprise", () => {
  it("une seule série de lectures dans les 60 s, oubliée à la mise sous porte, relue après 60 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const b = banc();
      b.issues.set(BIS, { id: BIS, companyId: SOC, projectId: null, status: "todo", assigneeAgentId: PRODUCTEUR, executionPolicy: null, title: "Page 2", identifier: "DEM-2" });
      for (const id of [ISSUE, BIS]) b.documents.set(`${id}:livrable`, { latestRevisionId: "88888888-8888-4888-8888-888888888881", latestRevisionNumber: 1, title: "Page", body: "# Page", updatedByAgentId: PRODUCTEUR, createdByAgentId: PRODUCTEUR });
      const docs = b.ctx.issues.documents as unknown as { get: (...a: unknown[]) => Promise<unknown> };
      const lire = docs.get;
      let lectures = 0;
      docs.get = async (...a) => ((lectures += 1), lire(...a));
      // Un seul jeu de services, comme le worker : le cache vit dans creerServices.
      const services = creerServices(b.ctx, { base: b.base, modeDeploiement: () => "local_trusted" });
      const appel = async (cle: string, acteur: ActeurHote, c: unknown, params: Record<string, string> = {}) =>
        services.routes[cle as "sante"]!({ cle: cle as never, params, query: {}, companyId: SOC, acteur, corps: c });
      const manquantes = async () => ((await appel("sante", humain, undefined)).corps as { portesManquantes: { taches: string[] } }).portesManquantes.taches;
      expect(await manquantes()).toEqual(["DEM-1", "DEM-2"]);
      const premieres = lectures;
      expect(premieres).toBeGreaterThan(0);
      b.documents.delete(`${BIS}:livrable`);
      expect(await manquantes()).toEqual(["DEM-1", "DEM-2"]);
      expect(lectures).toBe(premieres);
      expect((await appel("tache.mettre-sous-porte", agent(COORD), corps, { issueId: ISSUE })).statut).toBe(201);
      expect(await manquantes()).toEqual([]);
      b.documents.set(`${BIS}:livrable`, { latestRevisionId: "88888888-8888-4888-8888-888888888882", latestRevisionNumber: 1, title: "Page 2", body: "# Page 2", updatedByAgentId: PRODUCTEUR, createdByAgentId: PRODUCTEUR });
      const avant = lectures;
      expect(await manquantes()).toEqual([]);
      expect(lectures).toBe(avant);
      vi.setSystemTime(Date.now() + 60_001);
      expect(await manquantes()).toEqual(["DEM-2"]);
      expect(lectures).toBeGreaterThan(avant);
    } finally {
      vi.useRealTimers();
    }
  });
});
