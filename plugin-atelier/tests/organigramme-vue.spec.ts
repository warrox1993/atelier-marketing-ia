/**
 * Calculs purs du zoom et du déplacement de la carte des services (src/ui/organigramme-vue.ts).
 */
import { describe, expect, it } from "vitest";
import {
  boiteDes, borner, ECHELLE_AJUSTEMENT_MIN, ECHELLE_MAX, ECHELLE_MIN, limiter, transformationAjustee, transformationPourVoir, zoomerAutour,
} from "../src/ui/organigramme-vue.js";

const ZONE = { largeur: 1568, hauteur: 724 };

describe("transformationAjustee", () => {
  it("un plan qui tient dans la zone est centré à l'échelle 1, jamais agrandi", () => {
    const t = transformationAjustee({ largeur: 800, hauteur: 400 }, ZONE);
    expect(t).toEqual({ echelle: 1, x: 384, y: 162 });
  });

  it("un plan plus grand est réduit pour tenir en entier, centré", () => {
    const plan = { largeur: 1960, hauteur: 905 };
    const t = transformationAjustee(plan, ZONE);
    expect(t.echelle).toBeCloseTo(0.8, 3);
    expect(plan.largeur * t.echelle).toBeLessThanOrEqual(ZONE.largeur + 1e-6);
    expect(plan.hauteur * t.echelle).toBeLessThanOrEqual(ZONE.hauteur + 1e-6);
    expect(t.x + (plan.largeur * t.echelle) / 2).toBeCloseTo(ZONE.largeur / 2, 6);
    expect(t.y + (plan.hauteur * t.echelle) / 2).toBeCloseTo(ZONE.hauteur / 2, 6);
  });

  it("plancher de 0,4 en ajustement ; la réserve du tiroir est laissée libre à droite", () => {
    expect(transformationAjustee({ largeur: 9000, hauteur: 9000 }, ZONE).echelle).toBe(ECHELLE_AJUSTEMENT_MIN);
    const plan = { largeur: 1568, hauteur: 724 };
    const avecTiroir = transformationAjustee(plan, ZONE, 364);
    expect(avecTiroir.echelle).toBeCloseTo((1568 - 364) / 1568, 6);
    expect(plan.largeur * avecTiroir.echelle + avecTiroir.x).toBeLessThanOrEqual(ZONE.largeur - 364 + 1e-6);
  });
});

describe("zoomerAutour et bornes", () => {
  it("garde fixe le point sous le pointeur", () => {
    const t = { echelle: 0.8, x: 40, y: 25 };
    const z = zoomerAutour(t, 1.25, 600, 300);
    expect(z.echelle).toBeCloseTo(1, 6);
    expect((600 - z.x) / z.echelle).toBeCloseTo((600 - t.x) / t.echelle, 6);
    expect((300 - z.y) / z.echelle).toBeCloseTo((300 - t.y) / t.echelle, 6);
  });

  it("l'échelle reste entre 0,3 et 2,5", () => {
    expect(borner(10)).toBe(ECHELLE_MAX);
    expect(borner(0.01)).toBe(ECHELLE_MIN);
    expect(zoomerAutour({ echelle: 2.4, x: 0, y: 0 }, 5, 0, 0).echelle).toBe(ECHELLE_MAX);
    expect(zoomerAutour({ echelle: 0.35, x: 0, y: 0 }, 0.1, 0, 0).echelle).toBe(ECHELLE_MIN);
  });
});

describe("limiter", () => {
  it("laisse intacte une vue raisonnable et empêche de pousser la carte hors de la zone", () => {
    const plan = { largeur: 1568, hauteur: 724 };
    const bonne = { echelle: 1, x: -100, y: 30 };
    expect(limiter(bonne, plan, ZONE)).toEqual(bonne);
    const loin = limiter({ echelle: 1, x: -99999, y: 99999 }, plan, ZONE);
    expect(loin.x).toBeCloseTo(120 - 1568, 6);
    expect(loin.y).toBeCloseTo(ZONE.hauteur - 120, 6);
    const droite = limiter({ echelle: 1, x: 99999, y: 0 }, plan, ZONE);
    expect(droite.x).toBeCloseTo(ZONE.largeur - 120, 6);
  });
});

describe("transformationPourVoir", () => {
  const boite = boiteDes([{ x: 1500, y: 360, largeur: 120, hauteur: 72 }])!;

  it("boiteDes : plus petite boîte des rectangles, null pour aucun", () => {
    expect(boiteDes([])).toBeNull();
    expect(boiteDes([{ x: 100, y: 50, largeur: 20, hauteur: 10 }, { x: 300, y: 200, largeur: 40, hauteur: 20 }])).toEqual({ x0: 90, y0: 45, x1: 320, y1: 210 });
  });

  it("décale la vue du minimum quand l'échelle est gardée : la boîte sort de la place du tiroir", () => {
    const t = { echelle: 1, x: 0, y: 0 };
    const v = transformationPourVoir(t, boite, ZONE, 364, 24);
    expect(v.echelle).toBe(1);
    expect(boite.x1 * v.echelle + v.x).toBeCloseTo(ZONE.largeur - 364 - 24, 6);
    expect(v.y).toBe(0);
  });

  it("ne bouge pas si la boîte est déjà visible hors du tiroir", () => {
    const t = { echelle: 1, x: 0, y: 0 };
    const dejaVue = boiteDes([{ x: 200, y: 300, largeur: 120, hauteur: 72 }])!;
    expect(transformationPourVoir(t, dejaVue, ZONE, 364)).toEqual(t);
  });

  it("réduit l'échelle et centre quand la boîte ne tient pas, sans descendre sous 0,3", () => {
    const large = boiteDes([{ x: 100, y: 100, largeur: 100, hauteur: 100 }, { x: 1700, y: 600, largeur: 100, hauteur: 100 }])!;
    const v = transformationPourVoir({ echelle: 1, x: 0, y: 0 }, large, ZONE, 364, 24);
    expect(v.echelle).toBeLessThan(1);
    expect(v.echelle).toBeGreaterThanOrEqual(ECHELLE_MIN);
    expect(large.x0 * v.echelle + v.x).toBeGreaterThanOrEqual(24 - 1e-6);
    expect(large.x1 * v.echelle + v.x).toBeLessThanOrEqual(ZONE.largeur - 364 - 24 + 1e-6);
    const enorme = boiteDes([{ x: 0, y: 0, largeur: 10, hauteur: 10 }, { x: 99999, y: 99999, largeur: 10, hauteur: 10 }])!;
    expect(transformationPourVoir({ echelle: 1, x: 0, y: 0 }, enorme, ZONE, 364).echelle).toBe(ECHELLE_MIN);
  });
});
