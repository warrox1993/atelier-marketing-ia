import { describe, expect, it } from "vitest";
import { BLOQUANTS, SOURCES_A_FOURNIR, evaluerPorte, refusDeFond, revisionsBloqueesSansSource, type EntreesPorte } from "../src/serveur/porte.js";
import { controlerCitationsConnaissances } from "../src/serveur/regles-connaissances.js";
import { patchDecisionPorte, renvoiEnAttenteInformation } from "../agents/decision-porte.mjs";

// Lot 2 (#22, T8) : une source manquante est une information à fournir, pas un défaut de fond.
// Elle bloque sans consommer de cycle, donc sans relever l'escalier d'effort du producteur.
const R = "r2";

function entrees(livrable: string): EntreesPorte {
  return {
    porte: { exigencesCiblees: [], revuesRequises: [], maxCycles: 3 },
    exigences: [],
    livrable: { revisionId: R },
    couvertures: [],
    verdicts: [],
    constats: [],
    revisionsDejaRefusees: ["r0"],
    connaissances: { livrable, passagesRendus: [], versions: [], date: "2026-10-15" },
  };
}

describe("source manquante : blocage sans hausse d'effort", () => {
  it("chiffre d'offre sans source : BLOQUE_INFORMATION, aucun cycle consommé", () => {
    const r = evaluerPorte(entrees("# Offre auto\n\nProfitez d'une prime de 648 € par an."));
    expect(r.motifs.map((m) => m.code)).toEqual(["chiffre_offre_sans_source"]);
    expect(r.decision).toBe("BLOQUE_INFORMATION");
    expect(r.cyclesApres).toBe(1);
    expect(r.cyclesEpuises).toBe(false);
  });

  it("le renvoi au producteur est marqué « en attente d'information » (pas un tour de correction)", () => {
    const r = evaluerPorte(entrees("# Offre auto\n\nRemise de 8 % la première année."));
    const patch = patchDecisionPorte({ id: "ev", empreinte: r.empreinte, decision: r.decision, motifs: r.motifs });
    expect(patch).toMatchObject({ status: "in_progress", awaitingInformation: true });
  });

  it("une source manquante ne masque pas un défaut de fond : citation inventée + chiffre sans source = REFUS", () => {
    const r = evaluerPorte(entrees("# Offre\n\nPrime de 648 € par an.\n\nVoir connaissance://doc-x/v1/p1."));
    expect(r.motifs.map((m) => m.code).sort()).toEqual(["chiffre_offre_sans_source", "citation_connaissance_inconnue"]);
    expect(r.decision).toBe("REFUS");
    expect(r.cyclesApres).toBe(2);
  });

  it("livrable trop volumineux : REFUS livrable_trop_volumineux, cycle consommé", () => {
    const r = evaluerPorte(entrees(`Texte. ${"a".repeat(600_000)}`));
    expect(r.motifs.map((m) => m.code)).toEqual(["livrable_trop_volumineux"]);
    expect(r.decision).toBe("REFUS");
    expect(r.cyclesApres).toBe(2);
  });

  it("le contrôle des connaissances rend le code distinct pour un livrable trop volumineux", () => {
    const c = controlerCitationsConnaissances(`Texte. ${"a".repeat(600_000)}`, [], [], "2026-10-15");
    expect(c).toEqual([expect.objectContaining({ code: "livrable_trop_volumineux", decision: "refus" })]);
  });

  describe("M2 : révisions répétées sans source", () => {
    // Banc sur le modèle de `services.ts` (evaluer) : cycles et blocages relus dans l'historique des évaluations.
    function banc() {
      const historique: Array<{ revisionId: string; decision: string; motifs: Array<{ code: string }>; creeLe: string }> = [];
      let minute = 10;
      const horloge = () => `2026-11-07T10:${String(minute++).padStart(2, "0")}:00Z`;
      let humain: string | null = null;
      return {
        actionHumaine: () => { humain = horloge(); },
        evaluer(revisionId: string) {
          const r = evaluerPorte({
            ...entrees("# Offre auto\n\nProfitez d'une prime de 648 € par an."),
            livrable: { revisionId },
            revisionsDejaRefusees: [...new Set(historique.filter((h) => h.decision === "REFUS" && refusDeFond(h.motifs) && h.revisionId !== revisionId).map((h) => h.revisionId))],
            revisionsBloqueesSansSource: revisionsBloqueesSansSource(historique, humain, revisionId),
          });
          historique.push({ revisionId, decision: r.decision, motifs: r.motifs, creeLe: horloge() });
          return { ...r, attente: renvoiEnAttenteInformation({ empreinte: r.empreinte, decision: r.decision, motifs: r.motifs }) };
        },
      };
    }

    it("2 révisions bloquées sans cycle, la 3e refusée avec cycle consommé, puis cycles épuisés comme avant", () => {
      const b = banc();
      for (const rev of ["s1", "s2"]) {
        expect(b.evaluer(rev)).toMatchObject({ decision: "BLOQUE_INFORMATION", cyclesApres: 0, attente: true });
      }
      expect(b.evaluer("s2")).toMatchObject({ decision: "BLOQUE_INFORMATION", cyclesApres: 0 }); // même révision réévaluée : pas une 3e
      const trois = b.evaluer("s3");
      expect(trois.motifs.map((m) => m.code)).toEqual(["chiffre_offre_sans_source", "source_manquante_repetee"]);
      expect(trois).toMatchObject({ decision: "REFUS", cyclesApres: 1, cyclesEpuises: false, attente: false });
      expect(patchDecisionPorte({ id: "ev", empreinte: trois.empreinte, decision: trois.decision, motifs: trois.motifs })).not.toHaveProperty("awaitingInformation");
      expect(b.evaluer("s4")).toMatchObject({ decision: "REFUS", cyclesApres: 2 });
      expect(b.evaluer("s5")).toMatchObject({ decision: "REFUS", cyclesApres: 3, cyclesEpuises: true });
      expect(b.evaluer("s6")).toMatchObject({ decision: "BLOQUE_INFORMATION", cyclesEpuises: true, attente: false });
    });

    it("une action humaine entre-temps remet le compteur", () => {
      const b = banc();
      b.evaluer("s1");
      b.evaluer("s2");
      b.actionHumaine();
      expect(b.evaluer("s3")).toMatchObject({ decision: "BLOQUE_INFORMATION", cyclesApres: 0, attente: true });
      expect(b.evaluer("s4")).toMatchObject({ decision: "BLOQUE_INFORMATION", cyclesApres: 0, attente: true });
      expect(b.evaluer("s5")).toMatchObject({ decision: "REFUS", cyclesApres: 1 });
    });
  });

  it("la porte et l'agent partagent la même liste de motifs d'information", () => {
    for (const code of [...BLOQUANTS, ...SOURCES_A_FOURNIR]) {
      expect(renvoiEnAttenteInformation({ empreinte: "e", decision: "BLOQUE_INFORMATION", motifs: [{ code, message: "m" }] })).toBe(true);
    }
  });
});
