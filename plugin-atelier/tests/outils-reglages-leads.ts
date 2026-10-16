/** Stock en mémoire des réglages des leads (migration 010) et des poids du score, avec compteurs de lecture. */
import type { CorrectionCritere, EvaluationCritere } from "../src/contrats/index.js";
import type { StockReglagesLeads, VersionPoidsScore, VersionReglagesLeads } from "../src/serveur/services-reglages-leads.js";

export function stockMemoire() {
  const reglages: Array<VersionReglagesLeads & { companyId: string }> = [];
  const poids: Array<VersionPoidsScore & { companyId: string }> = [];
  let corrections: Array<CorrectionCritere & { companyId: string }> = [];
  let evaluations: Array<EvaluationCritere & { companyId: string }> = [];
  const lectures = { reglages: 0, corrections: 0 };
  const derniere = <T extends { companyId: string; version: number }>(l: T[], c: string) => l.filter((x) => x.companyId === c).sort((a, b) => b.version - a.version)[0] ?? null;
  const sans = <T extends { companyId: string }>(x: T | null) => {
    if (x === null) return null;
    const { companyId: _c, ...reste } = structuredClone(x);
    return reste;
  };
  const stock: StockReglagesLeads = {
    reglagesCourants: async (c) => (lectures.reglages++, sans(derniere(reglages, c))),
    insererReglages: async (c, v) => {
      if (reglages.some((x) => x.companyId === c && x.version === v.version)) throw new Error("violation de reglages_leads_pkey");
      reglages.push({ ...structuredClone(v), companyId: c });
    },
    poidsCourants: async (c) => sans(derniere(poids, c)),
    insererPoids: async (c, v) => {
      if (poids.some((x) => x.companyId === c && x.version === v.version)) throw new Error("violation de poids_score_pkey");
      poids.push({ ...structuredClone(v), companyId: c });
    },
    corrections: async (c) => (lectures.corrections++, corrections.filter((x) => x.companyId === c).map((x) => sans(x)!)),
    ecrireCorrection: async (c, k) => {
      corrections = corrections.filter((x) => !(x.prospectId === k.prospectId && x.code === k.code));
      corrections.push({ ...structuredClone(k), companyId: c });
    },
    retirerCorrection: async (c, prospectId, code) => {
      const avant = corrections.length;
      corrections = corrections.filter((x) => !(x.companyId === c && x.prospectId === prospectId && x.code === code));
      return avant - corrections.length;
    },
    evaluations: async (c) => evaluations.filter((x) => x.companyId === c).map((x) => sans(x)!),
    ecrireEvaluation: async (c, e) => {
      evaluations = evaluations.filter((x) => !(x.prospectId === e.prospectId && x.code === e.code));
      evaluations.push({ ...structuredClone(e), companyId: c });
    },
  };
  return { stock, reglages, poids, corrections: () => corrections, evaluations: () => evaluations, lectures };
}
