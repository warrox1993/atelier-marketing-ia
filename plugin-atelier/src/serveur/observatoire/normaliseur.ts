/**
 * Normaliseur K2 : une seule fonction partagée par la collecte et la porte, pour que l'extrait cité
 * et l'instantané soient comparés après exactement la même transformation (FR-028).
 */
import { createHash } from "node:crypto";
import { htmlVersMarkdown } from "../html-markdown.js";
import { retirerInvisibles } from "../contenu-externe.js";

/** À incrémenter si la transformation change : les empreintes anciennes ne sont alors plus comparables. */
export const VERSION_NORMALISATION = 2; // 2 : caractères invisibles retirés (V2-2)

export function normaliserTexte(brut: string, type: "html" | "texte" | "json"): string {
  const base = type === "html" ? htmlVersMarkdown(brut) : brut;
  const lignes = retirerInvisibles(base)
    .texte.normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[  ]/gu, " ")
    .split("\n")
    .map((ligne) => ligne.replace(/[ \t\f\v]+/gu, " ").trim());
  return lignes.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function empreinte(texteNormalise: string): string {
  return createHash("sha256").update(texteNormalise, "utf8").digest("hex");
}

/** Longueur minimale d'un extrait cité, une fois normalisé. shortcut: valeur provisoire, à fixer avec la décision K4 */
export const EXTRAIT_MIN_CARACTERES = 20;

/** Cause d'un extrait refusé (O5) : trop court, présent à une autre position, ou absent. */
export type CauseExtrait = { cause: "court"; longueur: number } | { cause: "ailleurs"; position: number } | { cause: "absent" };

/** null si l'extrait normalisé figure dans le texte normalisé, à `position` (indice dans ce texte) quand elle est fournie ; sinon sa cause. */
export function causeExtraitRefuse(extrait: string, texteNormalise: string, position?: number): CauseExtrait | null {
  const cherche = normaliserTexte(extrait, "texte");
  if (cherche.length < EXTRAIT_MIN_CARACTERES) return { cause: "court", longueur: cherche.length };
  if (position !== undefined && texteNormalise.indexOf(cherche, position) === position) return null;
  const trouvee = texteNormalise.indexOf(cherche);
  if (trouvee === -1) return { cause: "absent" };
  return position === undefined ? null : { cause: "ailleurs", position: trouvee };
}

/** Message de la cause, pour la porte (OBS-02) et l'enregistrement d'une preuve. */
export function raisonExtrait(c: CauseExtrait, positionDeclaree: number): string {
  if (c.cause === "court") return `l'extrait normalisé fait ${c.longueur} caractère${c.longueur > 1 ? "s" : ""}, moins des ${EXTRAIT_MIN_CARACTERES} exigés`;
  if (c.cause === "ailleurs") return `l'extrait figure à la position ${c.position} et non à la position ${positionDeclaree} déclarée`;
  return "l'extrait cité ne figure pas dans l'instantané";
}

/** L'extrait normalisé figure dans le texte normalisé, à `position` (indice dans ce texte) quand elle est fournie. */
export function extraitPresent(extrait: string, texteNormalise: string, position?: number): boolean {
  return causeExtraitRefuse(extrait, texteNormalise, position) === null;
}
