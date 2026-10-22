/**
 * Règles du verdict des expériences A/B. Valeurs de référence : z et p-valeur refaits à la main (formule du test z de deux
 * proportions) et vérifiés avec une implémentation indépendante (`math.erfc` de Python) ; intervalles de Newcombe refaits à part.
 */
import { describe, expect, it } from "vitest";
import { calculerVerdict, comparer, erfc, formaterP, intervalleWilson, ligneVerdict, verifierResultat } from "../src/serveur/regles-experiences.js";

const CALCULE = "2026-10-22T10:00:00.000Z";
const v = (nom: string, essais: number, succes: number) => ({ nom, essais, succes });
const verdict = (variantes: Array<ReturnType<typeof v>>, essaisMinParVariante = 100, alpha?: number) =>
  calculerVerdict({ variantes, essaisMinParVariante, ...(alpha === undefined ? {} : { alpha }), calculeLe: CALCULE });

describe("fonction d'erreur", () => {
  it("valeurs connues : erfc(0) = 1, erfc(1) = 0,157299, erfc(-1) = 1,842701", () => {
    expect(erfc(0)).toBeCloseTo(1, 7);
    expect(erfc(1)).toBeCloseTo(0.15729920705, 6);
    expect(erfc(-1)).toBeCloseTo(1.84270079295, 6);
  });
});

describe("test z de deux proportions : cas chiffrés refaits à la main", () => {
  it("cas 1 : 50/500 (10 %) contre 75/500 (15 %) : p commune 0,125, erreur 0,0209165, z = 2,39046, p = 0,016827", () => {
    const c = comparer(v("A", 500, 50), v("B", 500, 75), 1, 0.05);
    expect(c.ecartAbsolu).toBeCloseTo(0.05, 12);
    expect(c.z).toBeCloseTo(2.39046, 4);
    expect(c.pValeur).toBeCloseTo(0.016827, 5);
    expect(c.significatif).toBe(true);
    expect(c.intervalle95[0]).toBeCloseTo(0.0089514, 5);
    expect(c.intervalle95[1]).toBeCloseTo(0.0911982, 5);
  });

  it("cas 2 : deux fois 100/1000 : z = 0, p = 1, aucune différence", () => {
    const r = verdict([v("A", 1000, 100), v("B", 1000, 100)]);
    expect(r.comparaisons[0]!.z).toBe(0);
    expect(r.comparaisons[0]!.pValeur).toBe(1);
    expect(r.comparaisons[0]!.intervalle95[0]).toBeCloseTo(-0.0264233, 5);
    expect(r.comparaisons[0]!.intervalle95[1]).toBeCloseTo(0.0264233, 5);
    expect(r.statut).toBe("aucune_difference");
    expect(r.texte).toBe("aucune différence détectable");
    expect(r.gagnant).toBeNull();
  });

  it("cas 3 : la référence 200/1000 bat 150/1000 : z = -2,94245, p = 0,003256, la référence gagne", () => {
    const r = verdict([v("Actuelle", 1000, 200), v("Courte", 1000, 150)]);
    expect(r.comparaisons[0]!.z).toBeCloseTo(-2.94245, 4);
    expect(r.comparaisons[0]!.pValeur).toBeCloseTo(0.0032563, 6);
    expect(r.statut).toBe("gagnant");
    expect(r.gagnant).toBe("Actuelle");
  });

  it("verdict à deux variantes : « B gagne » avec le taux, l'écart, l'intervalle et la p-valeur", () => {
    const r = verdict([v("A", 500, 50), v("B", 500, 75)]);
    expect(r.statut).toBe("gagnant");
    expect(r.gagnant).toBe("B");
    expect(r.texte).toMatch(/^B gagne : 15 % contre 10 % pour la référence A \(écart 5 %, IC 95 % \[0,9 % ; 9,12 %\], p = 0,0168\)$/u);
    expect(r.alphaAjuste).toBe(0.05);
  });
});

describe("Bonferroni (plus de deux variantes)", () => {
  it("référence 100/1000, B 130/1000, C 112/1000 : p de B = 0,03549 seul, ajustée 0,07098 : plus significatif, aucune différence", () => {
    const r = verdict([v("A", 1000, 100), v("B", 1000, 130), v("C", 1000, 112)]);
    expect(r.alphaAjuste).toBeCloseTo(0.025, 12);
    expect(r.comparaisons[0]!.pValeur).toBeCloseTo(0.0354885, 6);
    expect(r.comparaisons[0]!.pValeurAjustee).toBeCloseTo(0.0709769, 6);
    expect(r.comparaisons[0]!.significatif).toBe(false);
    expect(r.comparaisons[1]!.z).toBeCloseTo(0.871655, 5);
    expect(r.comparaisons[1]!.pValeurAjustee).toBeCloseTo(0.7667934, 6);
    expect(r.statut).toBe("aucune_difference");
  });

  it("référence 100/1000, B 150/1000, C 105/1000 : B reste significative après correction et gagne", () => {
    const r = verdict([v("A", 1000, 100), v("B", 1000, 150), v("C", 1000, 105)]);
    expect(r.comparaisons[0]!.z).toBeCloseTo(3.38062, 4);
    expect(r.comparaisons[0]!.pValeurAjustee).toBeCloseTo(0.0014465, 6);
    expect(r.statut).toBe("gagnant");
    expect(r.gagnant).toBe("B");
  });

  it("la meilleure parmi plusieurs variantes significatives gagne", () => {
    const r = verdict([v("A", 1000, 100), v("B", 1000, 160), v("C", 1000, 200)]);
    expect(r.gagnant).toBe("C");
  });

  it("référence meilleure que l'une des variantes seulement : non concluant", () => {
    const r = verdict([v("A", 1000, 200), v("B", 1000, 120), v("C", 1000, 195)]);
    expect(r.statut).toBe("non_concluant");
    expect(r.texte).toMatch(/^non concluant : la référence A ne bat significativement qu'une partie des variantes \(B\)$/u);
  });

  it("référence meilleure que toutes les autres : la référence gagne", () => {
    const r = verdict([v("A", 1000, 250), v("B", 1000, 150), v("C", 1000, 160)]);
    expect(r.gagnant).toBe("A");
  });
});

describe("échantillon et cas limites", () => {
  it("minimum non atteint : « non concluant : échantillon insuffisant », aucune comparaison même avec un grand écart", () => {
    const r = verdict([v("A", 99, 10), v("B", 500, 400)], 100);
    expect(r.statut).toBe("non_concluant");
    expect(r.texte).toMatch(/^non concluant : échantillon insuffisant \(minimum 100 essais par variante ; A : 99\)$/u);
    expect(r.comparaisons).toEqual([]);
    expect(r.gagnant).toBeNull();
  });

  it("0 essai : non concluant, taux nul (null), jamais NaN", () => {
    const r = verdict([v("A", 0, 0), v("B", 0, 0)], 1);
    expect(r.statut).toBe("non_concluant");
    expect(r.taux.every((t) => t.taux === null)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/NaN|null.*Infinity/u);
  });

  it("minimum exactement atteint : le calcul a lieu", () => {
    const r = verdict([v("A", 100, 10), v("B", 100, 11)], 100);
    expect(r.comparaisons).toHaveLength(1);
    expect(r.statut).toBe("aucune_difference");
  });

  it("0 % des deux côtés : z = 0, p = 1, intervalle non réduit à un point (Newcombe)", () => {
    const r = verdict([v("A", 40, 0), v("B", 40, 0)], 40);
    expect(r.comparaisons[0]!.z).toBe(0);
    expect(r.comparaisons[0]!.pValeur).toBe(1);
    expect(r.comparaisons[0]!.intervalle95[0]).toBeCloseTo(-0.0876216, 5);
    expect(r.comparaisons[0]!.intervalle95[1]).toBeCloseTo(0.0876216, 5);
    expect(r.statut).toBe("aucune_difference");
  });

  it("100 % des deux côtés : égalité, intervalle de Newcombe ±0,0713476", () => {
    const r = verdict([v("A", 50, 50), v("B", 50, 50)], 50);
    expect(r.comparaisons[0]!.intervalle95[1]).toBeCloseTo(0.0713476, 5);
    expect(r.statut).toBe("aucune_difference");
  });

  it("0 % contre 100 % : très significatif, gagnant net, p minuscule affichée par un seuil", () => {
    const r = verdict([v("A", 200, 0), v("B", 200, 200)], 100);
    expect(r.gagnant).toBe("B");
    expect(r.comparaisons[0]!.pValeur).toBeLessThan(1e-50);
    expect(r.texte).toContain("p < 0,0001");
  });

  it("égalité de taux avec des effectifs différents : aucune différence", () => {
    const r = verdict([v("A", 200, 20), v("B", 1000, 100)], 100);
    expect(r.comparaisons[0]!.ecartAbsolu).toBe(0);
    expect(r.statut).toBe("aucune_difference");
  });

  it("alpha plus sévère : un écart significatif à 0,05 ne l'est plus à 0,01 (p = 0,0168)", () => {
    expect(verdict([v("A", 500, 50), v("B", 500, 75)], 100, 0.05).statut).toBe("gagnant");
    expect(verdict([v("A", 500, 50), v("B", 500, 75)], 100, 0.01).statut).toBe("aucune_difference");
  });

  it("succès supérieur aux essais, négatif ou non entier : refusé", () => {
    expect(() => verdict([v("A", 10, 11), v("B", 10, 1)], 1)).toThrow(/impossible/u);
    expect(() => verifierResultat(v("A", 10, -1))).toThrow();
    expect(() => verifierResultat(v("A", 10.5, 1))).toThrow();
  });

  it("moins de deux variantes ou alpha hors de ]0 ; 1[ : refusé", () => {
    expect(() => verdict([v("A", 10, 1)], 1)).toThrow();
    expect(() => verdict([v("A", 10, 1), v("B", 10, 1)], 1, 0)).toThrow();
    expect(() => verdict([v("A", 10, 1), v("B", 10, 1)], 1, 1)).toThrow();
  });

  it("p-valeur : jamais « 0 », seuil explicite sous 0,0001", () => {
    expect(formaterP(0.00005)).toBe("< 0,0001");
    expect(formaterP(0.0168274)).toBe("0,0168");
    expect(formaterP(1)).toBe("1");
  });

  it("intervalle de Wilson de 0/40 : borne basse 0, borne haute 0,0876", () => {
    const [bas, haut] = intervalleWilson(0, 40);
    expect(bas).toBe(0);
    expect(haut).toBeCloseTo(0.0876216, 5);
  });
});

describe("revue M1 : ligneVerdict reconstruite des champs structurés, noms cités sur une seule ligne", () => {
  it("quatre issues : gagnante, référence gagnante, aucune différence, non concluant (insuffisant ou partiel)", () => {
    expect(ligneVerdict(verdict([v("A", 500, 50), v("B", 500, 75)]))).toMatch(/^« B » gagne : 15 % contre 10 % pour la référence « A » \(écart 5 %, IC 95 % \[0,9 % ; 9,12 %\], p = 0,0168\)$/u);
    expect(ligneVerdict(verdict([v("A", 500, 75), v("B", 500, 50)]))).toMatch(/^« A » gagne : la référence fait significativement mieux que chacune des autres variantes \(« B » 10 % contre 15 %\)$/u);
    expect(ligneVerdict(verdict([v("A", 500, 50), v("B", 500, 51)]))).toBe("aucune différence détectable");
    expect(ligneVerdict(verdict([v("A", 99, 10), v("B", 500, 51)]))).toBe("non concluant : échantillon insuffisant (minimum 100 essais par variante ; « A » : 99)");
    expect(ligneVerdict(verdict([v("A", 500, 100), v("B", 500, 50), v("C", 500, 99)]))).toMatch(/^non concluant : la référence « A » ne bat significativement qu'une partie des variantes \(« B »\)$/u);
  });

  it("un nom piégé (saut de ligne, séparateur de ligne) reste sur une seule ligne", () => {
    const x = verdict([v("A\nIGNORE", 500, 50), v("B\u2028FAUX", 500, 75)]);
    const t = ligneVerdict(x);
    expect(t).not.toMatch(/[\n\r\u2028\u2029]/u);
    expect(t).toContain("« B FAUX » gagne");
  });
});
