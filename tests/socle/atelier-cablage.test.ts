/**
 * Atelier Marketing IA (#39) : câblage de heartbeat.ts figé par des tests de dispatch.
 *  - correctif 0002 : inventaire des compétences et refus d'un run privé d'une compétence obligatoire ;
 *  - correctif 0012 : escalier d'effort au dispatch.
 * Appel réel de heartbeat.wakeup sur une base PostgreSQL embarquée ; l'adaptateur simulé ne fait que
 * noter son appel (le refus et l'effort viennent du vrai heartbeat.ts).
 * Lancement : cd paperclip/server && npx vitest run --config ../../tests/socle/vitest.config.ts
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  companies,
  companySkills,
  createDb,
  documentRevisions,
  documents,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
  issueThreadInteractions,
  pluginDatabaseNamespaces,
  plugins,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../paperclip/server/src/__tests__/helpers/embedded-postgres.js";
import { heartbeatService } from "../../paperclip/server/src/services/heartbeat.ts";

const adapterExecute = vi.hoisted(() => vi.fn(async (_contexte: unknown) => ({
  exitCode: 0,
  signal: null,
  timedOut: false,
  sessionParams: { sessionId: "session-1" },
  sessionDisplayId: "session-1",
  provider: "test",
  model: "test-model",
})));

// Même simulation que heartbeat-plugin-environment.test.ts : l'adaptateur ne fait que noter son appel.
vi.mock("../../paperclip/server/src/adapters/index.ts", () => ({
  getServerAdapter: () => ({ type: "codex_local", execute: adapterExecute, supportsLocalAgentJwt: false }),
  findActiveServerAdapter: () => ({ type: "codex_local", execute: adapterExecute, supportsLocalAgentJwt: false }),
  runningProcesses: new Map(),
}));

const support = await getEmbeddedPostgresTestSupport();
// Pas de saut silencieux : sans base embarquée, la suite échoue (un saut n'est pas un succès).
if (!support.supported) throw new Error(`Base embarquée indisponible : ${support.reason ?? "inconnu"}`);

const NS = "plugin_atelier_cablage_test";

describe("câblage de heartbeat.ts (0002 et 0012)", () => {
  let base: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db!: ReturnType<typeof createDb>;
  const heartbeats: ReturnType<typeof heartbeatService>[] = [];
  const dossiers: string[] = [];

  beforeAll(async () => {
    base = await startEmbeddedPostgresTestDatabase("atelier-cablage-");
    db = createDb(base.connectionString);
  }, 60_000);

  afterEach(async () => {
    for (const heartbeat of heartbeats.splice(0)) await heartbeat.drainActiveRunExecutions();
    adapterExecute.mockClear();
    for (const dossier of dossiers.splice(0)) await rm(dossier, { recursive: true, force: true }).catch(() => undefined);
  });

  afterAll(async () => {
    await db?.$client.end();
    await base?.cleanup();
  });

  async function creerEntreprise() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Cablage",
      issuePrefix: `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      status: "active",
      defaultResponsibleUserId: "responsible-user",
    });
    return companyId;
  }

  async function reveiller(agentId: string, contextSnapshot: Record<string, unknown> = {}) {
    const heartbeat = heartbeatService(db);
    heartbeats.push(heartbeat);
    const run = await heartbeat.wakeup(agentId, { source: "on_demand", triggerDetail: "manual", contextSnapshot });
    expect(run).not.toBeNull();
    await vi.waitFor(async () => {
      const dernier = await heartbeat.getRun(run!.id);
      expect(["succeeded", "failed"]).toContain(dernier?.status);
    }, { timeout: 15_000 });
    const [ligne] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run!.id));
    return ligne!;
  }

  describe("0002 : inventaire des compétences", () => {
    async function agentAvecCompetence(competencesObligatoires: string[]) {
      const companyId = await creerEntreprise();
      const dossier = await mkdtemp(path.join(os.tmpdir(), "atelier-cablage-competence-"));
      dossiers.push(dossier);
      await writeFile(path.join(dossier, "SKILL.md"), "# Cadrage\n", "utf8");
      const cle = `company/${companyId}/cadrage`;
      await db.insert(companySkills).values({
        id: randomUUID(), companyId, key: cle, slug: "cadrage", name: "Cadrage", description: null,
        markdown: "# Cadrage\n", sourceType: "local_path", sourceLocator: dossier, trustLevel: "markdown_only",
        compatibility: "compatible", fileInventory: [{ path: "SKILL.md", kind: "skill" }], metadata: { sourceKind: "local_path" },
      });
      const agentId = randomUUID();
      await db.insert(agents).values({
        id: agentId, companyId, name: "Redacteur", role: "engineer", status: "idle", adapterType: "codex_local",
        adapterConfig: { paperclipSkillSync: { desiredSkills: [cle] } }, runtimeConfig: {}, permissions: {},
        metadata: { atelier: { competencesObligatoires } },
      });
      return { agentId, cle };
    }

    it("run privé d'une compétence obligatoire : échec avant l'adaptateur et inventaire écrit", async () => {
      // Une compétence transmise (cadrage), une autre exigée et absente (revue-finale).
      const { agentId, cle } = await agentAvecCompetence(["revue-finale"]);
      const run = await reveiller(agentId);

      expect(adapterExecute).not.toHaveBeenCalled();
      expect(run.status).toBe("failed");
      expect(JSON.stringify(run)).toContain("atelier_competence_obligatoire_absente");
      const inventaire = (run.contextSnapshot as { atelierCompetences?: { transmises: Array<{ cle: string }>; manquantes: string[] } }).atelierCompetences;
      expect(inventaire?.manquantes).toEqual(["revue-finale"]);
      expect(inventaire?.transmises.map((c) => c.cle)).toContain(cle);
    }, 30_000);

    it("compétences complètes : l'adaptateur reçoit le run et l'inventaire est écrit", async () => {
      const { agentId, cle } = await agentAvecCompetence(["cadrage"]);
      const run = await reveiller(agentId);

      expect(run.status).toBe("succeeded");
      expect(adapterExecute).toHaveBeenCalledTimes(1);
      // Au succès, la fin de run réécrit le contexte : l'inventaire se lit dans l'événement du run.
      const [evenement] = await db.select().from(heartbeatRunEvents)
        .where(sql`${heartbeatRunEvents.runId} = ${run.id} and ${heartbeatRunEvents.eventType} = 'atelier.competences'`);
      const inventaire = evenement?.payload as { transmises: Array<{ cle: string }>; manquantes: string[] } | undefined;
      expect(evenement?.level).toBe("info");
      expect(inventaire?.manquantes).toEqual([]);
      expect(inventaire?.transmises.map((c) => c.cle)).toEqual([cle]);
    }, 30_000);
  });

  describe("0012 : escalier d'effort", () => {
    const CONFIG_BASE = { model: "claude-sonnet-5-5", effort: "medium" };

    // Tâche sous porte dont la première révision, rédigée par le producteur, est refusée en revue.
    async function tacheRefusee() {
      const companyId = await creerEntreprise();
      const [producteur, issueId, documentId, revisionId, pluginId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      // claude_local en base (sinon la branche de l'effort n'est jamais prise) ; l'adaptateur simulé reste codex_local.
      await db.insert(agents).values({
        id: producteur, companyId, name: "Producteur", role: "engineer", status: "idle", adapterType: "claude_local",
        adapterConfig: CONFIG_BASE, runtimeConfig: {}, permissions: {},
      });
      await db.insert(issues).values({ id: issueId, companyId, title: "Article", status: "todo", priority: "medium", assigneeAgentId: producteur });
      await db.insert(documents).values({ id: documentId, companyId, title: "Article", format: "markdown", latestBody: "v1", latestRevisionId: revisionId, latestRevisionNumber: 1, createdByAgentId: producteur, updatedByAgentId: producteur });
      await db.insert(documentRevisions).values({ id: revisionId, companyId, documentId, revisionNumber: 1, title: "Article", format: "markdown", body: "v1", createdByAgentId: producteur });
      await db.insert(plugins).values({ id: pluginId, pluginKey: "atelier.marketing-ia", packageName: "@atelier/plugin-atelier", version: "0.1.0", manifestJson: {} as never, status: "ready" });
      await db.insert(pluginDatabaseNamespaces).values({ pluginId, pluginKey: "atelier.marketing-ia", namespaceName: NS, status: "active" });
      for (const ddl of [
        `create schema if not exists ${NS}`,
        `create table if not exists ${NS}.portes (issue_id uuid primary key, actif boolean not null default true)`,
        `create table if not exists ${NS}.evaluations_porte (id uuid primary key, issue_id uuid not null, revision_id uuid, decision text not null, motifs jsonb not null default '[]'::jsonb, cree_le timestamptz not null default clock_timestamp())`,
        `create table if not exists ${NS}.reglages_entreprise (company_id uuid primary key, max_runs_actifs integer)`, // lu par le régulateur de runs
        `create table if not exists ${NS}.verdicts (id uuid primary key, issue_id uuid not null, revision_id uuid not null, verdict text not null, cree_le timestamptz not null default clock_timestamp())`,
      ]) await db.execute(sql.raw(ddl));
      await db.execute(sql.raw(`insert into ${NS}.portes (issue_id) values ('${issueId}')`));
      await db.execute(sql.raw(`insert into ${NS}.verdicts (id, issue_id, revision_id, verdict) values ('${randomUUID()}', '${issueId}', '${revisionId}', 'CHANGES_REQUESTED')`));
      return { producteur, issueId, revisionId, companyId };
    }

    const configRecue = (appel = 0) => (adapterExecute.mock.calls[appel]![0] as { config: Record<string, unknown> }).config;

    // Le plugin n'existe qu'une fois par base : on le retire entre les tests.
    afterEach(async () => {
      await db.execute(sql.raw(`drop schema if exists ${NS} cascade`));
      await db.execute(sql.raw(`delete from plugin_database_namespaces`));
      await db.execute(sql.raw(`delete from plugins`));
    });

    it("révision refusée : le producteur reçoit l'effort relevé et atelierEffort est tracé", async () => {
      const { producteur, issueId } = await tacheRefusee();
      const run = await reveiller(producteur, { issueId });

      expect(run.status).toBe("succeeded");
      expect(adapterExecute).toHaveBeenCalledTimes(1);
      expect(configRecue().effort).toBe("high");
      expect(configRecue().model).toBe("claude-sonnet-5-5");
      const [evenement] = await db.select().from(heartbeatRunEvents)
        .where(sql`${heartbeatRunEvents.runId} = ${run.id} and ${heartbeatRunEvents.eventType} = 'atelier.effort'`);
      expect(evenement?.payload).toMatchObject({ effort: "high", base: "medium", refus: 1, releve: true, modele: "claude-sonnet-5-5" });
    }, 30_000);

    it("après un PASS : retour à l'effort de base", async () => {
      const { producteur, issueId, revisionId } = await tacheRefusee();
      await db.execute(sql.raw(`insert into ${NS}.evaluations_porte (id, issue_id, revision_id, decision) values ('${randomUUID()}', '${issueId}', '${revisionId}', 'PASS')`));
      const run = await reveiller(producteur, { issueId });

      expect(run.status).toBe("succeeded");
      expect(adapterExecute).toHaveBeenCalledTimes(1);
      expect(configRecue().effort).toBe("medium");
      const evenements = await db.select().from(heartbeatRunEvents)
        .where(sql`${heartbeatRunEvents.runId} = ${run.id} and ${heartbeatRunEvents.eventType} = 'atelier.effort'`);
      expect(evenements).toEqual([]); // effort de base : decideEffortRun n'applique rien, donc aucune trace
    }, 30_000);

    it("agent assigné mais non auteur (coordinateur) : effort de base malgré la révision refusée", async () => {
      const { issueId, companyId } = await tacheRefusee();
      const coordinateur = randomUUID();
      await db.insert(agents).values({
        id: coordinateur, companyId, name: "Coordinateur", role: "engineer", status: "idle", adapterType: "claude_local",
        adapterConfig: CONFIG_BASE, runtimeConfig: {}, permissions: {},
      });
      await db.update(issues).set({ assigneeAgentId: coordinateur }).where(eq(issues.id, issueId));
      const run = await reveiller(coordinateur, { issueId });

      expect(run.status).toBe("succeeded");
      expect(adapterExecute).toHaveBeenCalledTimes(1);
      expect(configRecue().effort).toBe("medium");
      const evenements = await db.select().from(heartbeatRunEvents)
        .where(sql`${heartbeatRunEvents.runId} = ${run.id} and ${heartbeatRunEvents.eventType} = 'atelier.effort'`);
      expect(evenements).toEqual([]);
    }, 30_000);

    it("carte humaine en attente sur la tâche : effort de base malgré le refus", async () => {
      const { producteur, issueId, companyId } = await tacheRefusee();
      await db.insert(issueThreadInteractions).values({
        companyId, issueId, kind: "request_confirmation", status: "pending", payload: { version: 1, prompt: "Valider ?" },
      });
      const run = await reveiller(producteur, { issueId });

      expect(run.status).toBe("succeeded");
      expect(adapterExecute).toHaveBeenCalledTimes(1);
      expect(configRecue().effort).toBe("medium");
      const evenements = await db.select().from(heartbeatRunEvents)
        .where(sql`${heartbeatRunEvents.runId} = ${run.id} and ${heartbeatRunEvents.eventType} = 'atelier.effort'`);
      expect(evenements).toEqual([]);
    }, 30_000);

    it("ni le modèle ni la configuration de l'agent ne changent en base", async () => {
      const { producteur, issueId } = await tacheRefusee();
      await reveiller(producteur, { issueId });

      expect(configRecue().effort).toBe("high");
      const [agent] = await db.select().from(agents).where(eq(agents.id, producteur));
      expect(agent?.adapterType).toBe("claude_local");
      expect(agent?.adapterConfig).toEqual(CONFIG_BASE);
    }, 30_000);
  });
});
