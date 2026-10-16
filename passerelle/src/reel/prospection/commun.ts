// Éléments communs des fournisseurs réels de prospection (lots P3 et P3b) : zone dérivée du code postal,
// lecture de secrets dans des fichiers 0600, chemins d'instance, accès de la passerelle (jeton porteur statique).
//
// Aucune valeur secrète n'est jamais écrite dans un message d'erreur ni dans le journal.

import { createHash, timingSafeEqual } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { IdentiteAppel } from "../../fournisseurs.js";

export { normaliser } from "../../commun/prospection/commun.js";

/** Dossier d'instance par défaut : passerelle/etat/ (ignoré par git, comme le reste de l'état de la passerelle). */
export const DOSSIER_ETAT_PAR_DEFAUT = fileURLToPath(new URL("../../../../etat/", import.meta.url));

// --- Zone ---------------------------------------------------------------------------------------------------

export type Region = "Wallonie" | "Bruxelles-Capitale" | "Flandre";

export interface ZoneBelge {
  /** `null` pour la Région de Bruxelles-Capitale (pas de province, comme dans la démonstration). */
  province: string | null;
  region: Region;
}

/**
 * Province et région d'après le code postal belge (tranches de la numérotation de bpost).
 * SIMPLIFICATION À CONFIRMER : la correspondance par tranches de 100 est la règle générale de la numérotation postale ;
 * un code postal à cheval sur deux provinces n'est pas géré (aucun cas connu au niveau de la province).
 * Hors tranche ou hors de 4 chiffres : `null`.
 */
export function zoneDuCodePostal(codePostal: string | null | undefined): ZoneBelge | null {
  if (!codePostal || !/^\d{4}$/.test(codePostal)) return null;
  const n = Number(codePostal);
  if (n >= 1000 && n <= 1299) return { province: null, region: "Bruxelles-Capitale" };
  if (n >= 1300 && n <= 1499) return { province: "Brabant wallon", region: "Wallonie" };
  if ((n >= 1500 && n <= 1999) || (n >= 3000 && n <= 3499)) return { province: "Brabant flamand", region: "Flandre" };
  if (n >= 2000 && n <= 2999) return { province: "Anvers", region: "Flandre" };
  if (n >= 3500 && n <= 3999) return { province: "Limbourg", region: "Flandre" };
  if (n >= 4000 && n <= 4999) return { province: "Liège", region: "Wallonie" };
  if (n >= 5000 && n <= 5999) return { province: "Namur", region: "Wallonie" };
  if ((n >= 6000 && n <= 6599) || (n >= 7000 && n <= 7999)) return { province: "Hainaut", region: "Wallonie" };
  if (n >= 6600 && n <= 6999) return { province: "Luxembourg", region: "Wallonie" };
  if (n >= 8000 && n <= 8999) return { province: "Flandre occidentale", region: "Flandre" };
  if (n >= 9000 && n <= 9999) return { province: "Flandre orientale", region: "Flandre" };
  return null;
}

const PAYS_PAR_NOM: Record<string, string> = {
  belgique: "BE", belgie: "BE", belgium: "BE", belgien: "BE",
  france: "FR", frankrijk: "FR",
  "pays bas": "NL", nederland: "NL",
  allemagne: "DE", duitsland: "DE", deutschland: "DE",
  luxembourg: "LU", luxemburg: "LU",
  "royaume uni": "GB", "verenigd koninkrijk": "GB",
  espagne: "ES", italie: "IT", suisse: "CH", irlande: "IE", portugal: "PT", pologne: "PL",
};

/**
 * Code pays ISO d'une adresse BCE. Une colonne pays vide vaut « Belgique » (hypothèse PROBABLE : le fichier ne remplit
 * le pays que pour l'étranger). Pays inconnu de la table (petite, volontairement) : `null`.
 */
export function paysIso(nomPays: string | null | undefined, normaliserNom: (s: string) => string): string | null {
  if (nomPays === null || nomPays === undefined || nomPays.trim() === "") return "BE";
  return PAYS_PAR_NOM[normaliserNom(nomPays)] ?? null;
}

// --- Secrets dans des fichiers 0600 ------------------------------------------------------------------------------

/** Force l'écriture d'un fichier sur le disque (avant de le substituer à l'ancien : une coupure de courant ne doit pas laisser un index tronqué). */
export function synchroniserFichier(chemin: string): void {
  const fd = openSync(chemin, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Lit un fichier de secret : refuse un fichier lisible par un autre utilisateur que son propriétaire. */
export function lireFichierSecret(chemin: string, nomVariable: string): string {
  let mode: number;
  try {
    mode = statSync(chemin).mode & 0o077;
  } catch {
    throw new Error(`${nomVariable} : fichier introuvable ou illisible.`);
  }
  if (mode !== 0) throw new Error(`${nomVariable} : le fichier doit être lisible par son seul propriétaire (chmod 600).`);
  return readFileSync(chemin, "utf8");
}

/** Lit des lignes `clé=valeur` (les lignes vides et celles qui commencent par # sont ignorées). */
export function lireCleValeur(texte: string): Record<string, string> {
  const sortie: Record<string, string> = {};
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const i = ligne.indexOf("=");
    if (i <= 0) continue;
    sortie[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return sortie;
}

// --- Accès de la passerelle : jeton porteur statique (authentification « api_key » de Paperclip) ------------------

export const COMPTE_PROSPECTION = "Index local de prospection (BCE, OpenStreetMap)";

/**
 * Vérificateur d'un jeton porteur statique : les données sont locales, il n'y a aucun compte tiers à autoriser, donc pas
 * de flux OAuth. Le jeton (32 caractères au moins) est lu dans PASSERELLE_PROSPECTION_JETON ou dans le fichier 0600
 * PASSERELLE_PROSPECTION_JETON_FICHIER. Seule son empreinte SHA-256 reste en mémoire ; la comparaison se fait à temps
 * constant.
 */
export class JetonStatique {
  private readonly empreinte: Buffer;

  constructor(jeton: string) {
    if (jeton.length < 32) throw new Error("Jeton de prospection trop court (32 caractères au moins).");
    this.empreinte = createHash("sha256").update(jeton).digest();
  }

  static depuisEnv(env: NodeJS.ProcessEnv): JetonStatique | null {
    const direct = env["PASSERELLE_PROSPECTION_JETON"]?.trim();
    if (direct) return new JetonStatique(direct);
    const fichier = env["PASSERELLE_PROSPECTION_JETON_FICHIER"]?.trim();
    if (!fichier) return null;
    const valeur = lireFichierSecret(fichier, "PASSERELLE_PROSPECTION_JETON_FICHIER").trim();
    return valeur === "" ? null : new JetonStatique(valeur);
  }

  verifier(jeton: string, propriete: { id: string; libelle: string }): IdentiteAppel | null {
    const candidat = createHash("sha256").update(jeton).digest();
    return timingSafeEqual(candidat, this.empreinte) ? { compte: COMPTE_PROSPECTION, propriete } : null;
  }
}
