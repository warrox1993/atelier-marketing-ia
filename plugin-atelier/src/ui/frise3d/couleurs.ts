/**
 * Couleurs de la scène 3D lues dans les jetons de l'interface (`--atl-succes`, `--atl-info`, `--atl-attention`…), pour que
 * la 3D suive le thème clair ou sombre et reste d'accord avec la frise 2D. Les jetons sont en oklch ou color-mix :
 * le navigateur les convertit en sRGB par un canvas 2D (un pixel). Sans canvas (tests), valeurs de repli.
 */
import { COULEURS_REPLI, type CouleursScene } from "./logique.js";

/** Un jeton CSS (ou n'importe quelle couleur CSS) en 0xRRGGBB, ou `null` si le navigateur ne sait pas le convertir. */
export function couleurVersEntier(css: string, ctx: CanvasRenderingContext2D | null): number | null {
  if (!ctx || !css) return null;
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (r === undefined || g === undefined || b === undefined || a === 0) return null;
    return (r << 16) | (g << 8) | b;
  } catch {
    return null;
  }
}

const JETONS: ReadonlyArray<[keyof Omit<CouleursScene, "sombre">, string]> = [
  ["succes", "--atl-succes"],
  ["info", "--atl-info"],
  ["attention", "--atl-attention"],
  ["neutre", "--atl-attenue"],
  ["surface", "--atl-surface"],
  ["fond", "--atl-fond"],
  ["texte", "--atl-texte"],
];

/** Luminance relative approchée d'un 0xRRGGBB (0 à 1), pour savoir si le fond est sombre. */
export const luminance = (c: number): number => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;

/** Lit les jetons tels qu'ils s'appliquent à `element` (donc avec le thème de l'hôte). */
export function lireCouleurs(element: HTMLElement): CouleursScene {
  const sortie: CouleursScene = { ...COULEURS_REPLI };
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return sortie;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  } catch {
    ctx = null;
  }
  if (!ctx) return sortie;
  const sonde = document.createElement("span");
  sonde.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0";
  element.append(sonde);
  try {
    for (const [cle, jeton] of JETONS) {
      sonde.style.color = `var(${jeton})`;
      const valeur = couleurVersEntier(getComputedStyle(sonde).color, ctx);
      if (valeur !== null) sortie[cle] = valeur;
    }
  } finally {
    sonde.remove();
  }
  sortie.sombre = luminance(sortie.fond) < 0.5;
  return sortie;
}
