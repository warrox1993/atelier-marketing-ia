/** Logique pure de la frise 3D : choix 3D ou 2D, positions des stations, station courante, formes, courbes d'animation. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { adoucir, choisirRendu, DUREES, ESPACEMENT, formeStation, indexCourant, LARGEUR_MIN_3D, positionsStations, pulsation, reinitialiserSondeWebgl, saut, webglDisponible } from "../../src/ui/frise3d/logique.js";
import type { EtatPhase } from "../../src/ui/avancement-missions.js";

const ok = { webgl: true, mouvementReduit: false, largeur: 800 };
const ph = (...etats: EtatPhase[]) => etats.map((etat) => ({ etat }));

afterEach(() => {
  reinitialiserSondeWebgl();
  vi.unstubAllGlobals();
});

describe("choisirRendu", () => {
  it("3D quand tout s'y prête", () => expect(choisirRendu(ok)).toBe("3d"));
  it("2D sans WebGL", () => expect(choisirRendu({ ...ok, webgl: false })).toBe("2d"));
  it("2D avec prefers-reduced-motion", () => expect(choisirRendu({ ...ok, mouvementReduit: true })).toBe("2d"));
  it("2D sous 600 px, 3D dès 600 px", () => {
    expect(choisirRendu({ ...ok, largeur: LARGEUR_MIN_3D - 1 })).toBe("2d");
    expect(choisirRendu({ ...ok, largeur: LARGEUR_MIN_3D })).toBe("3d");
  });
  it("2D après un échec de chargement ou une perte de contexte", () => expect(choisirRendu({ ...ok, echec: true })).toBe("2d"));
});

describe("webglDisponible", () => {
  it("faux sans WebGLRenderingContext (jsdom, rendu serveur)", () => {
    vi.stubGlobal("WebGLRenderingContext", undefined);
    expect(webglDisponible()).toBe(false);
  });
  it("vrai si un contexte se crée, et le contexte de sonde est rendu aussitôt", () => {
    vi.stubGlobal("WebGLRenderingContext", class {});
    const perdre = vi.fn();
    const canvas = { getContext: vi.fn(() => ({ getExtension: () => ({ loseContext: perdre }) })) } as unknown as HTMLCanvasElement;
    expect(webglDisponible(() => canvas)).toBe(true);
    expect(perdre).toHaveBeenCalledOnce();
    expect(webglDisponible(() => canvas)).toBe(true);
    expect(canvas.getContext).toHaveBeenCalledTimes(1); // résultat mémorisé
  });
  it("faux si getContext renvoie null ou lève", () => {
    vi.stubGlobal("WebGLRenderingContext", class {});
    expect(webglDisponible(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).toBe(false);
    reinitialiserSondeWebgl();
    expect(webglDisponible(() => { throw new Error("refusé"); })).toBe(false);
  });
});

describe("positions et station courante", () => {
  it("six stations espacées régulièrement et centrées sur 0", () => {
    const x = positionsStations(6);
    expect(x).toHaveLength(6);
    expect(x[0]).toBeCloseTo(-2.5 * ESPACEMENT);
    expect(x[5]).toBeCloseTo(2.5 * ESPACEMENT);
    expect(x.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    for (let i = 1; i < 6; i += 1) expect(x[i]! - x[i - 1]!).toBeCloseTo(ESPACEMENT);
  });
  it("le volume va à la décision en attente, sinon à la phase en cours, sinon à la dernière faite, sinon au départ", () => {
    expect(indexCourant(ph("faite", "faite", "attend_decision", "en_cours", "a_venir", "a_venir"))).toBe(2);
    expect(indexCourant(ph("non_prevue", "faite", "faite", "en_cours", "a_venir", "a_venir"))).toBe(3);
    expect(indexCourant(ph("faite", "faite", "a_venir", "a_venir", "a_venir", "a_venir"))).toBe(1);
    expect(indexCourant(ph("a_venir", "a_venir", "a_venir", "a_venir", "a_venir", "a_venir"))).toBe(0);
    expect(indexCourant(ph("faite", "faite", "faite", "faite", "faite", "faite"))).toBe(5);
  });
});

describe("formes et animations", () => {
  it("la hauteur distingue les états sans la couleur : décision > en cours > faite > à venir > non prévue", () => {
    const h = (e: EtatPhase) => formeStation(e).hauteur;
    expect(h("attend_decision")).toBeGreaterThan(h("en_cours"));
    expect(h("en_cours")).toBeGreaterThan(h("faite"));
    expect(h("faite")).toBeGreaterThan(h("a_venir"));
    expect(h("a_venir")).toBeGreaterThan(h("non_prevue"));
    expect(formeStation("attend_decision").anneau).toBe(true);
    expect(formeStation("faite").anneau).toBe(false);
  });
  it("la pulsation est bornée et s'éteint d'elle-même", () => {
    expect(pulsation(0)).toBe(0);
    expect(pulsation(DUREES.periodePulsation / 2)).toBeCloseTo(1);
    expect(pulsation(DUREES.pulsation)).toBe(0);
    expect(pulsation(DUREES.pulsation + 10_000)).toBe(0);
    expect(pulsation(-5)).toBe(0);
  });
  it("adoucir et saut : bornes exactes", () => {
    expect(adoucir(-1)).toBe(0);
    expect(adoucir(0)).toBe(0);
    expect(adoucir(1)).toBe(1);
    expect(adoucir(2)).toBe(1);
    expect(saut(0, 0.2)).toBe(0);
    expect(saut(1, 0.2)).toBe(0);
    expect(saut(0.5, 0.2)).toBeCloseTo(0.2);
  });
});
