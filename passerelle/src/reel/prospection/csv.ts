// Lecture CSV en flux pour les fichiers BCE Open Data (lot P3).
//
// Format des fichiers de la BCE : séparateur virgule, champs entre guillemets doubles (guillemet doublé pour échapper),
// première ligne = noms de colonnes, UTF-8 (parfois avec une marque d'ordre des octets). Niveau de preuve : PROBABLE,
// relevé sur des outils publics qui lisent les vrais fichiers (voir docs/passerelle.md, « Fournisseur BCE réel »).
// L'analyseur est volontairement général (RFC 4180) : il accepte aussi des champs sans guillemets, des fins de ligne
// CRLF et des retours à la ligne dans un champ entre guillemets.

import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

/** Une ligne analysée : nom de colonne → valeur (chaîne vide si le champ est vide). */
export type LigneCsv = Record<string, string>;

export interface EnteteEtLignes {
  entete: string[];
  lignes: AsyncGenerator<LigneCsv>;
}

/** Lit un flux d'octets UTF-8 et renvoie les enregistrements bruts (tableaux de champs), un par ligne CSV. */
export async function* enregistrementsCsv(flux: Readable): AsyncGenerator<string[]> {
  const decodeur = new StringDecoder("utf8");
  let champ = "";
  let ligne: string[] = [];
  let entreGuillemets = false;
  // Vrai juste après un guillemet fermant : un guillemet suivant est un guillemet échappé.
  let guillemetPossible = false;
  let debut = true;
  let champCommence = false;

  const fermerChamp = (): void => {
    ligne.push(champ);
    champ = "";
    champCommence = false;
  };

  async function* traiter(texte: string): AsyncGenerator<string[]> {
    let i = 0;
    if (debut) {
      debut = false;
      if (texte.charCodeAt(0) === 0xfeff) i = 1; // marque d'ordre des octets
    }
    for (; i < texte.length; i++) {
      const c = texte[i]!;
      if (entreGuillemets) {
        if (guillemetPossible) {
          guillemetPossible = false;
          if (c === '"') {
            champ += '"';
            continue;
          }
          entreGuillemets = false; // le guillemet précédent fermait le champ ; on retraite ce caractère ci-dessous
        } else if (c === '"') {
          guillemetPossible = true;
          continue;
        } else {
          champ += c;
          continue;
        }
      }
      if (c === '"' && !champCommence) {
        entreGuillemets = true;
        champCommence = true;
      } else if (c === ",") {
        fermerChamp();
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && texte[i + 1] === "\n") i++;
        if (champCommence || champ !== "" || ligne.length > 0) {
          fermerChamp();
          yield ligne;
          ligne = [];
        }
      } else {
        champ += c;
        champCommence = true;
      }
    }
  }

  for await (const morceau of flux) {
    const texte = decodeur.write(morceau as Buffer);
    if (texte !== "") yield* traiter(texte);
  }
  const reste = decodeur.end();
  if (reste !== "") yield* traiter(reste);
  if (entreGuillemets && !guillemetPossible) throw new Error("CSV invalide : guillemet ouvert jamais refermé en fin de fichier.");
  if (champCommence || champ !== "" || ligne.length > 0) {
    fermerChamp();
    yield ligne;
  }
}

/** Lit l'en-tête puis renvoie les lignes sous forme d'objets (colonnes absentes d'une ligne courte : chaîne vide). */
export async function lireCsv(flux: Readable): Promise<EnteteEtLignes> {
  const iterateur = enregistrementsCsv(flux);
  const premier = await iterateur.next();
  if (premier.done) return { entete: [], lignes: (async function* () { /* fichier vide */ })() };
  const entete = premier.value.map((nom) => nom.trim());
  async function* lignes(): AsyncGenerator<LigneCsv> {
    for await (const champs of iterateur) {
      const o: LigneCsv = {};
      for (let i = 0; i < entete.length; i++) o[entete[i]!] = champs[i] ?? "";
      yield o;
    }
  }
  return { entete, lignes: lignes() };
}
