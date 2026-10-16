import { describe, expect, it } from "vitest";
import { patchDecisionPorte } from "../demo/decision-porte.mjs";

// Renvoi par la Porte : une panne d'outil (information manquante) ne doit pas compter comme un
// tour de correction dans le socle ; un vrai défaut de qualité, si.
describe("renvoi de la Porte au producteur", () => {
  const base = { id: "ev-1", empreinte: "0123456789abcdef" };

  it("marque le renvoi « en attente d'information » quand seule une revue est bloquée", () => {
    const patch = patchDecisionPorte({
      ...base,
      decision: "BLOQUE_INFORMATION",
      motifs: [{ code: "revue_bloquee_information", message: "Revue « metier » : information manquante." }],
    });
    expect(patch).toMatchObject({ status: "in_progress", awaitingInformation: true });
    expect(patch.comment).toContain("bloqué (information manquante)");
  });

  it("ne marque pas un refus de qualité", () => {
    const patch = patchDecisionPorte({
      ...base,
      decision: "REFUS",
      motifs: [{ code: "revue_non_reussie", message: "Revue « metier » : corrections demandées." }],
    });
    expect(patch.status).toBe("in_progress");
    expect(patch.awaitingInformation).toBeUndefined();
  });

  it("ne marque pas un blocage mêlé à un défaut de qualité ou à des cycles épuisés", () => {
    for (const autre of ["revue_non_reussie", "cycles_epuises"]) {
      const patch = patchDecisionPorte({
        ...base,
        decision: "BLOQUE_INFORMATION",
        motifs: [
          { code: "revue_bloquee_information", message: "Revue bloquée." },
          { code: autre, message: "Autre motif." },
        ],
      });
      expect(patch.awaitingInformation).toBeUndefined();
    }
  });

  it("laisse la clôture PASS inchangée", () => {
    const patch = patchDecisionPorte({ ...base, decision: "PASS", motifs: [] });
    expect(patch).toEqual({ status: "done", comment: "Contrôle automatique réussi (évaluation ev-1, empreinte 0123456789ab)." });
  });

  it("le vocabulaire des commentaires parle de « contrôle automatique », jamais de « porte »", () => {
    const refus = patchDecisionPorte({ ...base, decision: "REFUS", motifs: [{ code: "x", message: "Motif." }] });
    expect(refus.comment).toMatch(/^Contrôle automatique refusé :/u);
    const bloque = patchDecisionPorte({ ...base, decision: "BLOQUE_INFORMATION", motifs: [{ code: "x", message: "Motif." }] });
    expect(bloque.comment).toMatch(/^Contrôle automatique bloqué \(information manquante\) :/u);
    expect(JSON.stringify([refus, bloque])).not.toMatch(/[Pp]orte/u);
  });
});
