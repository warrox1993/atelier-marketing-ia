/**
 * Une carte acceptée sans suite ne réveille personne. Le réveil qui suivait une carte venait de `continuationPolicy wake_assignee`
 * posé par l'AGENT, pas du plugin : on fige ici qu'aucun abonné du plugin ne réveille quand l'humain accepte une carte.
 */
import { describe, expect, it } from "vitest";
import { ORIGINE_DISCUSSION } from "../src/serveur/services-discussion.js";
import { creerServices } from "../src/serveur/services.js";
import { COORD, ISSUE, SOC, creerBanc } from "./outils-base.js";

const carteAcceptee = { id: "int-1", kind: "request_confirmation", status: "accepted", resolvedByUserId: "local-board", resolvedByAgentId: null };

describe("carte acceptée : aucun réveil du plugin", () => {
  for (const [nom, origine, id] of [["discussion", ORIGINE_DISCUSSION, `discussion:${SOC}`], ["tâche ordinaire", "manual", null]] as const) {
    for (const vers of ["in_review", "blocked", "in_progress", "todo", "done"]) {
      it(`${nom} : événement issue.updated vers ${vers} après acceptation`, async () => {
        const b = creerBanc();
        b.issues.set(ISSUE, { id: ISSUE, companyId: SOC, identifier: "ABC-1", projectId: null, status: vers, parentId: null, assigneeAgentId: COORD, title: "Fil", originKind: origine, originId: id });
        b.interactions.set(ISSUE, [carteAcceptee]);
        (b.ctx.issues as unknown as Record<string, unknown>).summaries = { getOrchestration: async () => ({ approvals: [] }) };
        creerServices(b.ctx, { base: b.base });
        await b.evenements.get("issue.updated")!({
          eventId: "evt-1", eventType: "issue.updated", occurredAt: new Date().toISOString(), actorType: "user", actorId: "local-board",
          entityId: ISSUE, entityType: "issue", companyId: SOC, payload: { changes: { status: { from: "in_review", to: vers } } },
        });
        expect(b.reveils).toEqual([]);
      });
    }
  }
});
