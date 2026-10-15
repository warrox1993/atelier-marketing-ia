/**
 * Nettoyage, normalisation et détection de langue du texte extrait (lot R2).
 */
import { sansAccents } from "../vecteurs.js";

/** Ligatures dépliées avant le retrait des accents (`unaccent` de PostgreSQL fait pareil pour `œ`). */
const LIGATURES: Readonly<Record<string, string>> = {
  "œ": "oe", "Œ": "oe", "æ": "ae", "Æ": "ae", "ß": "ss", "ẞ": "ss", "ĳ": "ij", "Ĳ": "ij",
  "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
};
const MOTIF_LIGATURES = new RegExp(`[${Object.keys(LIGATURES).join("")}]`, "gu");

/**
 * Texte propre pour la recherche lexicale : ligatures dépliées, accents retirés, minuscules,
 * espaces réduits. Ne sert jamais à l'affichage.
 */
export function texteNormalise(texte: string): string {
  const deplie = texte.replace(MOTIF_LIGATURES, (c) => LIGATURES[c] ?? c);
  return sansAccents(deplie).replace(/\s+/gu, " ").trim();
}

/**
 * Retire les caractères de contrôle (sauf saut de ligne et tabulation), les caractères invisibles
 * (largeur nulle, sens d'écriture) qui servent à cacher du texte, et unifie la forme Unicode (NFC).
 */
export function nettoyerTexte(texte: string): string {
  return texte
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/gu, "")
    .replace(/[  -   　]/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/ ?\n ?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export type Langue = "fr" | "nl";

/** Mots courants propres à chaque langue (les mots communs aux deux, comme « de » ou « en », sont exclus). */
const MOTS_FR = new Set([
  "le", "la", "les", "des", "du", "une", "est", "que", "qui", "dans", "pour", "pas", "sur", "avec", "au", "aux",
  "ce", "cette", "et", "ne", "vous", "nous", "il", "elle", "sont", "par", "ou", "ont", "mais", "votre", "plus",
]);
const MOTS_NL = new Set([
  "het", "een", "van", "is", "dat", "die", "niet", "op", "te", "voor", "met", "zijn", "aan", "er", "ook", "als",
  "maar", "om", "bij", "dan", "wordt", "naar", "ik", "wij", "we", "hebben", "heeft", "wat", "uw", "deze", "worden",
]);

/** Détection volontairement simple : comptage de mots courants. Égalité ou texte sans indice : français. */
export function detecterLangue(texte: string): Langue {
  let fr = 0;
  let nl = 0;
  for (const mot of texte.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (MOTS_FR.has(mot)) fr += 1;
    else if (MOTS_NL.has(mot)) nl += 1;
  }
  return nl > fr ? "nl" : "fr";
}

/** Estimation du nombre de jetons : environ un jeton pour quatre caractères (suffisant pour dimensionner). */
export function estimerJetons(texte: string): number {
  return Math.ceil(texte.length / 4);
}
