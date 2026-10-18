/**
 * Calculs PURS de la vue (zoom et déplacement) de la carte des services, testés sans interface
 * (tests/organigramme-vue.spec.ts). La carte applique le résultat en transformation CSS du plan : la disposition n'est
 * jamais recalculée à un geste.
 *
 * Repère : le plan (la scène de la disposition) est dessiné en (0, 0) et transformé par
 * `translate(x px, y px) scale(echelle)` ; la zone visible est un rectangle de `largeur` x `hauteur`, dont la partie
 * droite (`reserveDroite`) peut être masquée par le tiroir des liaisons.
 */
import type { Dimensions } from "./organigramme-flux.js";

export interface Transformation {
  echelle: number;
  x: number;
  y: number;
}

/** Zoom possible (boutons, molette, pincement, clavier). */
export const ECHELLE_MIN = 0.3;
export const ECHELLE_MAX = 2.5;
/** En ajustement, la carte n'est jamais rendue plus petite que cela (au-delà, on défile plutôt que de rendre illisible). */
export const ECHELLE_AJUSTEMENT_MIN = 0.4;
/** Part du plan qui reste toujours visible dans la zone (aucun geste ne peut faire sortir la carte de l'écran). */
const PART_VISIBLE = 120;

export const borner = (e: number): number => Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, e));

/** Boîte dans le repère du plan. */
export interface Boite {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tout le plan visible et centré dans la zone (hors `reserveDroite`), jamais agrandi au-delà de 1, jamais sous 0,4. */
export function transformationAjustee(plan: Dimensions, zone: Dimensions, reserveDroite = 0): Transformation {
  const largeur = Math.max(1, zone.largeur - reserveDroite);
  const echelle = Math.max(ECHELLE_AJUSTEMENT_MIN, Math.min(1, largeur / plan.largeur, zone.hauteur / plan.hauteur));
  return { echelle, x: (largeur - plan.largeur * echelle) / 2, y: (zone.hauteur - plan.hauteur * echelle) / 2 };
}

/** Change l'échelle (bornée de 0,3 à 2,5) en gardant fixe le point (px, py) de la zone. */
export function zoomerAutour(t: Transformation, facteur: number, px: number, py: number): Transformation {
  const echelle = borner(t.echelle * facteur);
  const f = echelle / t.echelle;
  return { echelle, x: px - (px - t.x) * f, y: py - (py - t.y) * f };
}

/** Garde au moins PART_VISIBLE px du plan dans la zone : on ne peut pas pousser la carte hors de l'écran. */
export function limiter(t: Transformation, plan: Dimensions, zone: Dimensions): Transformation {
  const l = plan.largeur * t.echelle;
  const h = plan.hauteur * t.echelle;
  const vx = Math.min(PART_VISIBLE, l, zone.largeur);
  const vy = Math.min(PART_VISIBLE, h, zone.hauteur);
  return {
    echelle: t.echelle,
    x: Math.min(zone.largeur - vx, Math.max(vx - l, t.x)),
    y: Math.min(zone.hauteur - vy, Math.max(vy - h, t.y)),
  };
}

/**
 * Vue qui montre `boite` dans la zone hors `reserveDroite` (tiroir) avec `marge` px autour : l'échelle courante est
 * gardée si la boîte y tient, sinon réduite (sans descendre sous 0,3) et la boîte centrée ; la carte ne bouge que du
 * minimum nécessaire quand l'échelle ne change pas.
 */
export function transformationPourVoir(t: Transformation, boite: Boite, zone: Dimensions, reserveDroite = 0, marge = 24): Transformation {
  const largeur = Math.max(1, zone.largeur - reserveDroite);
  const bl = Math.max(1, boite.x1 - boite.x0);
  const bh = Math.max(1, boite.y1 - boite.y0);
  const tient = Math.min((largeur - 2 * marge) / bl, (zone.hauteur - 2 * marge) / bh);
  if (tient < t.echelle) {
    const echelle = borner(tient);
    return { echelle, x: largeur / 2 - ((boite.x0 + boite.x1) / 2) * echelle, y: zone.hauteur / 2 - ((boite.y0 + boite.y1) / 2) * echelle };
  }
  let { x, y } = t;
  const gauche = boite.x0 * t.echelle + x;
  const droite = boite.x1 * t.echelle + x;
  const haut = boite.y0 * t.echelle + y;
  const bas = boite.y1 * t.echelle + y;
  if (gauche < marge) x += marge - gauche;
  else if (droite > largeur - marge) x -= droite - (largeur - marge);
  if (haut < marge) y += marge - haut;
  else if (bas > zone.hauteur - marge) y -= bas - (zone.hauteur - marge);
  return { echelle: t.echelle, x, y };
}

/** Plus petite boîte contenant tous les rectangles (centre, largeur, hauteur) donnés ; null si la liste est vide. */
export function boiteDes(noeuds: ReadonlyArray<{ x: number; y: number; largeur: number; hauteur: number }>): Boite | null {
  if (noeuds.length === 0) return null;
  return {
    x0: Math.min(...noeuds.map((n) => n.x - n.largeur / 2)),
    y0: Math.min(...noeuds.map((n) => n.y - n.hauteur / 2)),
    x1: Math.max(...noeuds.map((n) => n.x + n.largeur / 2)),
    y1: Math.max(...noeuds.map((n) => n.y + n.hauteur / 2)),
  };
}
