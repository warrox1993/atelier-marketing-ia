/**
 * Lot P6 : score expliqué et étalonnage statistique.
 *
 * Les valeurs attendues viennent de `tests/donnees/etalonnage-reference.json`, produit une fois par
 * `generer-etalonnage-reference.py` avec scikit-learn et statsmodels. Aucun appel à Python ici.
 * Tolérance : 1e-6 (Wilson : 1e-12, formule fermée).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Etalonnage, ScoreProspect, SEUILS_ETALONNAGE } from "../src/contrats/prospection.js";
import {
  ajusterIsotonique,
  ajusterPlatt,
  appliquerEtalonnage,
  etalonner,
  intervalleWilson,
  probabiliteIsotonique,
  probabilitePlatt,
  scoreBrier,
  separerDansLeTemps,
  type EntreeEtalonnage,
  type ObservationEtalonnage,
} from "../src/serveur/etalonnage.js";
import { calculerScore, expliquerScore, libelleScore, trierParScore, type CritereEvalue } from "../src/serveur/score-prospects.js";

interface TrancheRef {
  scoreMin: number;
  scoreMax: number;
  effectif: number;
  conversions: number;
  tauxObserve: number;
  probabilitePredite: number;
  borneBasse: number;
  borneHaute: number;
}
interface JeuRef {
  nom: string;
  coupure: string;
  observations: ObservationEtalonnage[];
  ajustement: { effectif: number; conversions: number };
  evaluation: { effectif: number; conversions: number };
  platt: {
    a: number;
    b: number;
    probabilitesGrille: number[];
    brierEvaluation: number;
    tranchesEvaluation: TrancheRef[];
  };
  isotonique?: {
    probabilitesGrille: number[];
    pointsHorsGrille: number[];
    probabilitesHorsGrille: number[];
    brierEvaluation: number;
    tranchesEvaluation: TrancheRef[];
  };
}
interface Reference {
  versions: Record<string, string>;
  wilson: { conversions: number; effectif: number; borneBasse: number; borneHaute: number }[];
  jeux: JeuRef[];
}

const REF = JSON.parse(
  readFileSync(new URL("./donnees/etalonnage-reference.json", import.meta.url), "utf-8"),
) as Reference;
const TOL = 1e-6;
const GRILLE = Array.from({ length: 101 }, (_, i) => i);
const ID = "11111111-1111-4111-8111-111111111111";
const ENTREPRISE = "22222222-2222-4222-8222-222222222222";
const ecarts: Record<string, number> = {};

function noterEcart(nom: string, obtenu: number, attendu: number): void {
  ecarts[nom] = Math.max(ecarts[nom] ?? 0, Math.abs(obtenu - attendu));
}

function jeu(nom: string): JeuRef {
  const j = REF.jeux.find((x) => x.nom === nom);
  if (j === undefined) throw new Error(`Jeu de référence absent : ${nom}`);
  return j;
}

function entree(observations: readonly ObservationEtalonnage[], coupure: string, extra: Partial<EntreeEtalonnage> = {}): EntreeEtalonnage {
  return {
    id: ID,
    companyId: ENTREPRISE,
    segment: { cible: "entreprise", nace: [] },
    observations,
    coupure,
    versionPoids: 3,
    origines: ["crm"],
    calculeLe: "2026-10-15T08:00:00.000Z",
    calculePar: "agent-etalonnage",
    mode: "demonstration",
    ...extra,
  };
}

function comparerTranches(nom: string, obtenues: Etalonnage["tranches"], attendues: TrancheRef[]): void {
  expect(obtenues.map((t) => [t.scoreMin, t.scoreMax, t.effectif, t.conversions])).toEqual(
    attendues.map((t) => [t.scoreMin, t.scoreMax, t.effectif, t.conversions]),
  );
  obtenues.forEach((t, i) => {
    const r = attendues[i]!;
    for (const champ of ["tauxObserve", "probabilitePredite", "borneBasse", "borneHaute"] as const) {
      expect(Math.abs(t[champ] - r[champ])).toBeLessThan(TOL);
      noterEcart(`${nom} tranches`, t[champ], r[champ]);
    }
  });
}

describe("intervalle de Wilson à 95 %", () => {
  it("égale statsmodels proportion_confint(method=\"wilson\") sur les cas de référence", () => {
    expect(REF.wilson.length).toBeGreaterThanOrEqual(3);
    for (const c of REF.wilson) {
      const w = intervalleWilson(c.conversions, c.effectif);
      expect(Math.abs(w.borneBasse - c.borneBasse)).toBeLessThan(1e-12);
      expect(Math.abs(w.borneHaute - c.borneHaute)).toBeLessThan(1e-12);
      noterEcart("wilson", w.borneBasse, c.borneBasse);
      noterEcart("wilson", w.borneHaute, c.borneHaute);
    }
  });

  it("donne l'exemple de la conception : 18 sur 100 → environ 12 % à 27 %", () => {
    const w = intervalleWilson(18, 100);
    expect(w.borneBasse).toBeCloseTo(0.117, 3);
    expect(w.borneHaute).toBeCloseTo(0.2667, 3);
  });

  it("refuse un effectif nul ou des conversions impossibles", () => {
    expect(() => intervalleWilson(0, 0)).toThrow();
    expect(() => intervalleWilson(5, 4)).toThrow();
    expect(() => intervalleWilson(-1, 4)).toThrow();
  });
});

describe("Platt, comparé à scikit-learn", () => {
  for (const nom of ["grand_echantillon", "scores_bas_sans_mise_a_echelle"]) {
    it(`${nom} : paramètres a, b et probabilités à 1e-6 près`, () => {
      const j = jeu(nom);
      const { ajustement } = separerDansLeTemps(j.observations, j.coupure);
      expect(ajustement.length).toBe(j.ajustement.effectif);
      const p = ajusterPlatt(
        ajustement.map((o) => o.score),
        ajustement.map((o) => o.converti),
      );
      expect(Math.abs(p.a - j.platt.a)).toBeLessThan(TOL);
      expect(Math.abs(p.b - j.platt.b)).toBeLessThan(TOL);
      noterEcart(`${nom} platt a`, p.a, j.platt.a);
      noterEcart(`${nom} platt b`, p.b, j.platt.b);
      GRILLE.forEach((s) => {
        const v = probabilitePlatt(p, s);
        expect(Math.abs(v - j.platt.probabilitesGrille[s]!)).toBeLessThan(TOL);
        noterEcart(`${nom} platt probabilités`, v, j.platt.probabilitesGrille[s]!);
      });
    });
  }
});

describe("isotonique, comparé à scikit-learn", () => {
  it("probabilités sur la grille 0..100 et hors grille (bornées) à 1e-6 près", () => {
    const j = jeu("grand_echantillon");
    const iso = j.isotonique!;
    const { ajustement } = separerDansLeTemps(j.observations, j.coupure);
    const m = ajusterIsotonique(
      ajustement.map((o) => o.score),
      ajustement.map((o) => o.converti),
    );
    GRILLE.forEach((s) => {
      const v = probabiliteIsotonique(m, s);
      expect(Math.abs(v - iso.probabilitesGrille[s]!)).toBeLessThan(TOL);
      noterEcart("isotonique probabilités", v, iso.probabilitesGrille[s]!);
    });
    iso.pointsHorsGrille.forEach((x, i) => {
      const v = probabiliteIsotonique(m, x);
      expect(Math.abs(v - iso.probabilitesHorsGrille[i]!)).toBeLessThan(TOL);
      noterEcart("isotonique probabilités", v, iso.probabilitesHorsGrille[i]!);
    });
    for (let k = 1; k < m.valeurs.length; k++) expect(m.valeurs[k]!).toBeGreaterThanOrEqual(m.valeurs[k - 1]!);
  });
});

describe("étalonnage complet (découpage dans le temps)", () => {
  it("méthode auto : isotonique dès 1 000 exemples d'ajustement, Brier et tranches égaux à scikit-learn", () => {
    const j = jeu("grand_echantillon");
    const { etalonnage, isotonique } = etalonner(entree(j.observations, j.coupure));
    expect(j.ajustement.effectif).toBeGreaterThanOrEqual(SEUILS_ETALONNAGE.isotoniqueEffectifMin);
    expect(etalonnage.methode).toBe("isotonique");
    expect(etalonnage.parametres).toBeNull();
    expect(isotonique).not.toBeNull();
    expect(Math.abs(etalonnage.brier - j.isotonique!.brierEvaluation)).toBeLessThan(TOL);
    noterEcart("isotonique brier", etalonnage.brier, j.isotonique!.brierEvaluation);
    comparerTranches("isotonique", etalonnage.tranches, j.isotonique!.tranchesEvaluation);
    expect(etalonnage.effectif).toBe(j.observations.length);
    expect(etalonnage.statut).toBe("probabilite_mesuree");
    expect(etalonnage.separation).toBe("decoupage_temporel");
    expect(etalonnage.horizonJours).toBe(SEUILS_ETALONNAGE.horizonJoursParDefaut);
    expect(etalonnage.donnees.debut <= j.coupure && j.coupure <= etalonnage.donnees.fin).toBe(true);
    expect(() => Etalonnage.parse(etalonnage)).not.toThrow();
  });

  it("méthode Platt imposée : paramètres, Brier et tranches égaux à scikit-learn", () => {
    const j = jeu("grand_echantillon");
    const { etalonnage } = etalonner(entree(j.observations, j.coupure, { methode: "platt" }));
    expect(etalonnage.methode).toBe("platt");
    expect(Math.abs(etalonnage.parametres!.a - j.platt.a)).toBeLessThan(TOL);
    expect(Math.abs(etalonnage.parametres!.b - j.platt.b)).toBeLessThan(TOL);
    expect(Math.abs(etalonnage.brier - j.platt.brierEvaluation)).toBeLessThan(TOL);
    noterEcart("platt brier", etalonnage.brier, j.platt.brierEvaluation);
    comparerTranches("platt", etalonnage.tranches, j.platt.tranchesEvaluation);
  });

  it("le Brier seul, sur les probabilités de référence, égale brier_score_loss", () => {
    const j = jeu("scores_bas_sans_mise_a_echelle");
    const { evaluation } = separerDansLeTemps(j.observations, j.coupure);
    const p = { a: j.platt.a, b: j.platt.b };
    const brier = scoreBrier(
      evaluation.map((o) => probabilitePlatt(p, o.score)),
      evaluation.map((o) => o.converti),
    );
    expect(Math.abs(brier - j.platt.brierEvaluation)).toBeLessThan(TOL);
    noterEcart("platt brier (scores bas)", brier, j.platt.brierEvaluation);
  });

  it("sous le seuil (260 prospects) : nature « estimation », Platt, isotonique refusée", () => {
    const j = jeu("scores_bas_sans_mise_a_echelle");
    const { etalonnage } = etalonner(entree(j.observations, j.coupure));
    expect(etalonnage.effectif).toBeLessThan(SEUILS_ETALONNAGE.prospectsMin);
    expect(etalonnage.methode).toBe("platt");
    expect(etalonnage.statut).toBe("estimation");
    expect(appliquerEtalonnage(etalonnage, 20).applique).toBeNull();
    expect(() => etalonner(entree(j.observations, j.coupure, { methode: "isotonique" }))).toThrow(/1000/u);
  });

  it("seuils exacts : 300 prospects et 29 conversions → estimation ; 30 conversions → probabilité mesurée", () => {
    const fabriquer = (conversions: number): ObservationEtalonnage[] =>
      Array.from({ length: 300 }, (_, i) => ({
        score: i % 101,
        converti: i % 10 === 0 && i / 10 < conversions,
        date: i < 150 ? "2026-01-10" : "2026-06-10",
      }));
    expect(etalonner(entree(fabriquer(29), "2026-03-01")).etalonnage.statut).toBe("estimation");
    expect(etalonner(entree(fabriquer(30), "2026-03-01")).etalonnage.statut).toBe("probabilite_mesuree");
    const moinsDe300 = fabriquer(30).slice(0, 299);
    expect(etalonner(entree(moinsDe300, "2026-03-01")).etalonnage.statut).toBe("estimation");
  });

  it("refuse une coupure qui ne laisse rien à mesurer, ou un ajustement sans conversion", () => {
    const j = jeu("scores_bas_sans_mise_a_echelle");
    expect(() => etalonner(entree(j.observations, "2099-01-01"))).toThrow(/coupure/u);
    expect(() => etalonner(entree(j.observations, "2000-01-01"))).toThrow(/coupure/u);
    const sansConversion = j.observations.map((o) => ({ ...o, converti: false }));
    expect(() => etalonner(entree(sansConversion, j.coupure))).toThrow(/conversions/u);
  });

  it("la coupure est un paramètre : la déplacer change les ensembles", () => {
    const j = jeu("grand_echantillon");
    const a = separerDansLeTemps(j.observations, "2025-06-01");
    const b = separerDansLeTemps(j.observations, j.coupure);
    expect(a.ajustement.length).toBeLessThan(b.ajustement.length);
    expect(a.ajustement.length + a.evaluation.length).toBe(j.observations.length);
    expect(a.ajustement.every((o) => o.date < "2025-06-01") && a.evaluation.every((o) => o.date >= "2025-06-01")).toBe(true);
  });
});

const CRITERES: CritereEvalue[] = [
  { code: "secteur_nace", libelle: "Secteur visé", valeur: "43.910", source: "BCE", dateSource: "2026-09-01T00:00:00Z", satisfait: true },
  { code: "taille", libelle: "Effectif 10 à 49", valeur: 23, source: "BCE", dateSource: "2026-09-01T00:00:00Z", satisfait: true },
  { code: "zone", libelle: "Zone couverte", valeur: "Liège", source: "Import", dateSource: "2026-08-15T00:00:00Z", satisfait: false },
  { code: "site_web", libelle: "Site web actif", valeur: true, source: "Vérification", dateSource: "2026-10-01T00:00:00Z", satisfait: true },
  { code: "opposition", libelle: "Opposition connue", valeur: false, source: "Registre", dateSource: "2026-10-01T00:00:00Z", satisfait: false, bloquant: true },
];
const POIDS = { version: 3, poids: { secteur_nace: 40, taille: 20, zone: 15, site_web: 12 } };

describe("score expliqué", () => {
  it("somme les points des critères remplis, garde valeur, source et date, ignore les bloquants", () => {
    const s = calculerScore({ criteres: CRITERES, poids: POIDS, calculeLe: "2026-10-15T08:00:00Z" });
    expect(s.valeur).toBe(72);
    expect(s.criteres.map((c) => [c.code, c.points])).toEqual([
      ["secteur_nace", 40],
      ["taille", 20],
      ["zone", 0],
      ["site_web", 12],
    ]);
    expect(s.criteres.every((c) => c.source.length > 0 && c.dateSource.length > 0)).toBe(true);
    expect(s.nature).toBe("estimation");
    expect(s.etalonnage).toBeNull();
    expect(libelleScore(s)).toBe("Score 72/100 (estimation, non étalonnée)");
    expect(expliquerScore(s)[0]).toBe("Secteur visé : 43.910 → +40 (source : BCE, 01/09/2026)");
    expect(() => ScoreProspect.parse(s)).not.toThrow();
  });

  it("borne le score à 0..100", () => {
    const haut = calculerScore({ criteres: CRITERES, poids: { version: 1, poids: { secteur_nace: 90, taille: 90, zone: 0, site_web: 0 } }, calculeLe: "2026-10-15T08:00:00Z" });
    expect(haut.valeur).toBe(100);
    const bas = calculerScore({ criteres: CRITERES, poids: { version: 1, poids: { secteur_nace: -60, taille: -60, zone: 0, site_web: 0 } }, calculeLe: "2026-10-15T08:00:00Z" });
    expect(bas.valeur).toBe(0);
  });

  it("refuse un critère sans poids et un score sans critère non bloquant", () => {
    expect(() => calculerScore({ criteres: CRITERES, poids: { version: 2, poids: { secteur_nace: 40 } }, calculeLe: "2026-10-15T08:00:00Z" })).toThrow(/taille/u);
    expect(() => calculerScore({ criteres: [CRITERES[4]!], poids: POIDS, calculeLe: "2026-10-15T08:00:00Z" })).toThrow();
  });

  it("trie par score décroissant, de façon stable", () => {
    const a = calculerScore({ criteres: CRITERES, poids: POIDS, calculeLe: "2026-10-15T08:00:00Z" });
    const b = calculerScore({ criteres: CRITERES.slice(0, 1), poids: POIDS, calculeLe: "2026-10-15T08:00:00Z" });
    const liste = [
      { nom: "b1", s: b },
      { nom: "a", s: a },
      { nom: "b2", s: b },
    ];
    expect(trierParScore(liste, (x) => x.s).map((x) => x.nom)).toEqual(["a", "b1", "b2"]);
  });

  it("avec un étalonnage au-dessus des seuils : probabilité mesurée, marge, effectif et date affichés", () => {
    const j = jeu("grand_echantillon");
    const { etalonnage } = etalonner(entree(j.observations, j.coupure, { methode: "platt" }));
    const r = appliquerEtalonnage(etalonnage, 72);
    expect(r.applique).not.toBeNull();
    const s = calculerScore({ criteres: CRITERES, poids: POIDS, calculeLe: "2026-10-15T08:00:00Z", etalonnage: r.applique });
    expect(s.nature).toBe("probabilite_mesuree");
    const libelle = libelleScore(s);
    expect(libelle).toMatch(/^Score 72\/100 \(probabilité mesurée : \d+ % entre \d+ % et \d+ %, sur 2600 prospects dont \d+ conversions, étalonnage du 15\/10\/2026\)$/u);
    const m = r.applique!.marge;
    expect(m.borneBasse).toBeLessThanOrEqual(m.probabilite);
    expect(m.probabilite).toBeLessThanOrEqual(m.borneHaute);
  });

  it("un étalonnage sous les seuils est ignoré : le score reste une estimation", () => {
    const j = jeu("grand_echantillon");
    const { etalonnage } = etalonner(entree(j.observations, j.coupure, { methode: "platt" }));
    const applique = appliquerEtalonnage(etalonnage, 72).applique!;
    const s = calculerScore({
      criteres: CRITERES,
      poids: POIDS,
      calculeLe: "2026-10-15T08:00:00Z",
      etalonnage: { ...applique, effectif: 299 },
    });
    expect(s.nature).toBe("estimation");
    expect(s.etalonnage).toBeNull();
  });

  it("n'affiche une probabilité que si elle tient dans l'intervalle observé de sa tranche", () => {
    const j = jeu("grand_echantillon");
    const { etalonnage } = etalonner(entree(j.observations, j.coupure, { methode: "platt" }));
    const fausse: Etalonnage = { ...etalonnage, parametres: { a: 0, b: -10 } };
    const r = appliquerEtalonnage(fausse, 50);
    expect(r.applique).toBeNull();
    expect(r.motif).toMatch(/intervalle/u);
  });

  it("aucun libellé ne parle de certitude ni de taux exact", () => {
    const j = jeu("grand_echantillon");
    const { etalonnage } = etalonner(entree(j.observations, j.coupure, { methode: "platt" }));
    const libelles: string[] = [];
    for (let score = 0; score <= 100; score += 5) {
      const r = appliquerEtalonnage(etalonnage, score);
      const poids = { version: 1, poids: { secteur_nace: score, taille: 0, zone: 0, site_web: 0 } };
      libelles.push(libelleScore(calculerScore({ criteres: CRITERES, poids, calculeLe: "2026-10-15T08:00:00Z", etalonnage: r.applique })));
      libelles.push(libelleScore(calculerScore({ criteres: CRITERES, poids, calculeLe: "2026-10-15T08:00:00Z" })));
      if (r.motif !== null) libelles.push(r.motif);
    }
    for (const l of libelles) expect(l).not.toMatch(/certitude|certain|taux exact|exactement|garanti/iu);
  });

  it("écarts mesurés face à la référence (affichés si AFFICHER_ECARTS=1)", () => {
    if (process.env["AFFICHER_ECARTS"] === "1") console.log(JSON.stringify({ versions: REF.versions, ecarts }, null, 1));
    expect(Object.values(ecarts).every((e) => e < TOL)).toBe(true);
  });
});
