/**
 * Conduite `echec` du contrat au plafond de refus identiques (#84, tâche 2).
 * Aucun contrat réel n'emprunte cette branche : `wf-01-collecte` (rang 2 de WF-01) est rendu en `conduiteEchec: "echec"` par un mock de `chargerContrat`.
 */
import { describe, expect, it, vi } from "vitest";
import { REFUS_IDENTIQUES_MAX } from "../src/moteur/executeur.js";
import { monter, SOC } from "./moteur-wf01-doubles.js";

vi.mock("../src/moteur/contrats.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/moteur/contrats.js")>();
  return {
    ...original,
    chargerContrat: (id: string, version: number) => {
      const c = original.chargerContrat(id, version);
      return id === "wf-01-collecte" ? { ...c, conduiteEchec: "echec" as const } : c;
    },
  };
});

const HORS = { reponsesBrutesSignees: "pas une liste" };

describe("conduite echec au plafond de refus identiques", () => {
  it("conduite echec : REFUS_IDENTIQUES_MAX refus identiques au rang 2 mènent à echec, sans réveil du coordinateur", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
    const reveils = t.reveils.length;
    for (let i = 0; i < REFUS_IDENTIQUES_MAX; i++) await t.deposer(2, HORS);
    expect(t.missions.get(t.missionId)!.etat).toBe("echec");
    expect(t.journal.find((j) => j.type === "moteur.plafond_atteint")?.donnees).toMatchObject({ conduite: "echec", rang: 2 });
    expect(t.reveils).toHaveLength(reveils);
    expect([...t.issues.values()].filter((i) => i.assigneeAgentId === "agent-coordinateur")).toHaveLength(0);
  });

  it("conduite echec : les tâches ouvertes de la mission sont annulées, les tâches done restent done", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const terminee = [...t.issues.values()].at(-1)!;
    terminee.status = "done";
    for (let i = 0; i < REFUS_IDENTIQUES_MAX; i++) await t.deposer(2, HORS);
    expect(t.missions.get(t.missionId)!.etat).toBe("echec");
    expect(terminee.status).toBe("done");
    const statuts = Object.fromEntries([...t.issues.values()].map((i) => [i.originId, i.status]));
    expect(Object.values(statuts).filter((s) => s === "cancelled").length).toBeGreaterThan(0);
    expect(Object.values(statuts).filter((s) => s === "todo" || s === "backlog" || s === "in_progress")).toHaveLength(0);
  });
});
