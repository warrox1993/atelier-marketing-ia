// Tirages pseudo-aléatoires déterministes du modèle de démonstration
// (docs/connecteurs-conception.md §6.4).
//
// Chaque tirage est un SHA-256 de « marqueur | clé 1 | clé 2 | … », où le marqueur
// identifie l'entreprise fictive et où la première clé est le domaine (gsc, ga4, ads,
// gbp, crm, social, avis), suivi en général de la date. Il n'y a aucun état caché :
// le même jeu de clés donne toujours le même nombre, quel que soit l'ordre des appels,
// le processus ou la machine. Ajouter un tirage ailleurs ne décale donc jamais les autres.

import { createHash } from "node:crypto";

/** Marqueur de l'entreprise fictive : il entre dans toutes les graines. */
export const MARQUEUR_ENTREPRISE = "atelier-demo:renovation-liege";

export type Cle = string | number;

/** Empreinte SHA-256 (32 octets) de « marqueur | clés… ». */
export function graine(...cles: readonly Cle[]): Buffer {
  return createHash("sha256").update([MARQUEUR_ENTREPRISE, ...cles].join("|"), "utf8").digest();
}

/** Nombre uniforme dans [0 ; 1[, tiré des 48 premiers bits de la graine. */
export function alea(...cles: readonly Cle[]): number {
  return graine(...cles).readUIntBE(0, 6) / 2 ** 48;
}

/** Nombre uniforme dans [min ; max[. */
export function entre(min: number, max: number, ...cles: readonly Cle[]): number {
  return min + (max - min) * alea(...cles);
}

/** Facteur multiplicatif dans [1 − amplitude ; 1 + amplitude[. */
export function bruit(amplitude: number, ...cles: readonly Cle[]): number {
  return 1 + amplitude * (2 * alea(...cles) - 1);
}

/**
 * Arrondi aléatoire sans biais : 2,3 donne 3 avec une probabilité de 0,3 et 2 sinon.
 * Les sommes sur une période restent ainsi fidèles aux valeurs non arrondies.
 */
export function arrondiAleatoire(valeur: number, ...cles: readonly Cle[]): number {
  if (valeur <= 0) return 0;
  const base = Math.floor(valeur);
  return base + (alea(...cles) < valeur - base ? 1 : 0);
}

/** Élément d'une liste non vide, choisi uniformément. */
export function choisir<T>(liste: readonly T[], ...cles: readonly Cle[]): T {
  if (liste.length === 0) throw new Error("choisir : liste vide.");
  return liste[Math.floor(alea(...cles) * liste.length)]!;
}

/** Élément choisi selon des poids positifs. */
export function choisirPondere<T>(options: readonly (readonly [T, number])[], ...cles: readonly Cle[]): T {
  const total = options.reduce((s, [, p]) => s + p, 0);
  if (options.length === 0 || total <= 0) throw new Error("choisirPondere : aucun poids positif.");
  let seuil = alea(...cles) * total;
  for (const [valeur, poids] of options) {
    seuil -= poids;
    if (seuil < 0) return valeur;
  }
  return options[options.length - 1]![0];
}
