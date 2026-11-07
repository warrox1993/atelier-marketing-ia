/**
 * Règles du verdict des expériences A/B. Valeurs de référence : z et p-valeur refaits à la main (formule du test z de deux
 * proportions) et vérifiés avec une implémentation indépendante (`math.erfc` de Python) ; intervalles de Newcombe refaits à part.
 */
import { describe, expect, it } from "vitest";
import { CONVERSIONS_MIN_TEST_Z, calculerVerdict, comparer, erfc, fisherBilateral, formaterP, intervalleWilson, ligneVerdict, verifierResultat } from "../src/serveur/regles-experiences.js";

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
    expect(r.statut).toBe("superieur_aux_autres");
    expect(r.gagnant).toBe("Actuelle");
  });

  it("verdict à deux variantes : « B gagne » avec le taux, l'écart, l'intervalle et la p-valeur", () => {
    const r = verdict([v("A", 500, 50), v("B", 500, 75)]);
    expect(r.statut).toBe("superieur_aux_autres");
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
    expect(r.statut).toBe("superieur_aux_autres");
    expect(r.gagnant).toBe("B");
  });

  it("plusieurs variantes battent la référence sans écart démontré entre elles : supérieures à la référence, aucun gagnant (lot 2 #22)", () => {
    // C contre B : 200 contre 160 sur 1 000, p = 0,0199 brute, 0,0597 après correction sur les 3 paires : pas démontré.
    const r = verdict([v("A", 1000, 100), v("B", 1000, 160), v("C", 1000, 200)]);
    expect(r.statut).toBe("superieur_reference");
    expect(r.gagnant).toBeNull();
    expect(r.texte).toMatch(/^B, C font significativement mieux que la référence A ; meilleur taux observé : C \(20 %\), sans supériorité démontrée sur chacune des autres variantes$/u);
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
    expect(verdict([v("A", 500, 50), v("B", 500, 75)], 100, 0.05).statut).toBe("superieur_aux_autres");
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

/* ------------------------------------------------------------------ */
// Lot 2 (#22, T10). Valeurs de référence calculées à part par scripts/tests/tester-fisher.py (loi hypergéométrique exacte, math.comb).
const FISHER_0_4 = 0.12462490634400826;
const FISHER_160_200 = 0.023123625484721928;

describe("verdict A/B juste : Fisher exact sous le seuil, jamais de faux gagnant", () => {
  it("Fisher bilatéral : 0 contre 4 conversions sur 1 000 = 0,1246 ; symétrique ; 160 contre 200 = 0,0231", () => {
    expect(fisherBilateral(0, 1000, 4, 1000)).toBeCloseTo(FISHER_0_4, 12);
    expect(fisherBilateral(4, 1000, 0, 1000)).toBeCloseTo(FISHER_0_4, 12);
    expect(fisherBilateral(160, 1000, 200, 1000)).toBeCloseTo(FISHER_160_200, 12);
    expect(fisherBilateral(5, 10, 5, 10)).toBeCloseTo(1, 12);
  });

  it("0 contre 4 conversions sur 1 000 : test exact de Fisher, pas de gagnant (le test z aurait dit p = 0,045)", () => {
    expect(CONVERSIONS_MIN_TEST_Z).toBeGreaterThan(4);
    const r = verdict([v("A", 1000, 0), v("B", 1000, 4)]);
    expect(r.comparaisons[0]!.methode).toBe("fisher_exact");
    expect(r.comparaisons[0]!.pValeur).toBeCloseTo(FISHER_0_4, 12);
    expect(r.comparaisons[0]!.significatif).toBe(false);
    expect(r.statut).toBe("aucune_difference");
    expect(r.gagnant).toBeNull();
  });

  it("au-dessus du seuil, le test z reste la méthode", () => {
    expect(verdict([v("A", 500, 50), v("B", 500, 75)]).comparaisons[0]!.methode).toBe("z");
  });

  it("100, 140, 141 sur 1 000 : B et C battent la référence, mais le verdict ne dit pas que C bat B", () => {
    const r = verdict([v("A", 1000, 100), v("B", 1000, 140), v("C", 1000, 141)]);
    expect(r.statut).toBe("superieur_reference");
    expect(r.gagnant).toBeNull();
    for (const texte of [r.texte, ligneVerdict(r)]) {
      expect(texte).not.toMatch(/gagne|bat|mieux que (?:« )?B/u);
      expect(texte).toContain("meilleur taux observé");
    }
  });

  it("jamais de gagnant quand l'intervalle de l'écart contient zéro, même avec une p-valeur sous alpha", () => {
    const c = comparer(v("A", 1000, 0), v("B", 1000, 4), 1, 0.2);
    expect(c.pValeur).toBeLessThan(0.2);
    const [bas, haut] = c.intervalle95;
    expect(bas <= 0 && haut >= 0).toBe(true);
    expect(c.significatif).toBe(false);
  });

  it("ligneVerdict des statuts : supérieure aux autres, supérieure à la référence, ancien « gagnant » figé", () => {
    expect(ligneVerdict(verdict([v("A", 500, 50), v("B", 500, 75)]))).toMatch(/^« B » gagne : /u);
    expect(ligneVerdict(verdict([v("A", 1000, 100), v("B", 1000, 160), v("C", 1000, 200)]))).toBe(
      "« B », « C » font significativement mieux que la référence « A » ; meilleur taux observé : « C » (20 %), sans supériorité démontrée sur chacune des autres variantes",
    );
    // Verdict figé avant le lot 2 : statut « gagnant » relu sans affirmer plus que ce qui était démontré (mieux que la référence).
    const ancien = { ...verdict([v("A", 1000, 100), v("B", 1000, 160), v("C", 1000, 200)]), statut: "gagnant" as const, gagnant: "C" };
    expect(ligneVerdict(ancien)).toMatch(/^« C » fait significativement mieux que la référence « A » : 20 % contre 10 %/u);
  });
});
