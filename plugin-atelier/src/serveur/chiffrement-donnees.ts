/**
 * Lot P7 : chiffrement applicatif des identifiants directs de la base de clients (§4.3).
 *
 * - `chiffrer` / `dechiffrer` : AES-256-GCM, format `chv1.<clé 16 hex>.<iv b64url>.<chiffré b64url>.<tag b64url>`
 *   (voir `ValeurChiffree`). L'identifiant de clé est les 16 premiers caractères hexadécimaux du
 *   SHA-256 de la clé : il permet de refuser explicitement une clé qui n'est pas la bonne.
 * - `empreinte` : HMAC-SHA-256 d'une valeur normalisée, avec une clé HMAC distincte de la clé de chiffrement.
 *
 * Les clés sont fournies par l'appelant (secret natif Paperclip) ; ce module n'en génère, n'en lit
 * et n'en garde aucune. Fonctions pures, sans accès à la base.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ValeurChiffree, type EmpreinteHmac, type TypeEmpreinte } from "../contrats/index.js";

export const TAILLE_CLE_CHIFFREMENT = 32;
export const TAILLE_CLE_HMAC_MIN = 32;

/** Refus explicite : clé invalide, clé différente de celle du chiffrement, valeur altérée ou mal formée. */
export class ErreurChiffrement extends Error {
  constructor(
    readonly motif: "cle_invalide" | "cle_differente" | "valeur_alteree" | "format_invalide" | "valeur_vide",
    message: string,
  ) {
    super(message);
    this.name = "ErreurChiffrement";
  }
}

function verifierCleChiffrement(cle: Uint8Array): void {
  if (cle.byteLength !== TAILLE_CLE_CHIFFREMENT) {
    throw new ErreurChiffrement("cle_invalide", `Clé de chiffrement de ${TAILLE_CLE_CHIFFREMENT} octets attendue.`);
  }
}

/** Identifiant public d'une clé de chiffrement : 16 premiers caractères hexadécimaux de son SHA-256. */
export function identifiantCle(cle: Uint8Array): string {
  verifierCleChiffrement(cle);
  return createHash("sha256").update(cle).digest("hex").slice(0, 16);
}

const base64url = (b: Buffer) => b.toString("base64url");

/** Chiffre une valeur non vide (AES-256-GCM, IV aléatoire de 12 octets). */
export function chiffrer(valeur: string, cle: Uint8Array): ValeurChiffree {
  verifierCleChiffrement(cle);
  if (valeur === "") throw new ErreurChiffrement("valeur_vide", "Une valeur vide ne se chiffre pas.");
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  const chiffre = Buffer.concat([chiffreur.update(valeur, "utf8"), chiffreur.final()]);
  const jeton = `chv1.${identifiantCle(cle)}.${base64url(iv)}.${base64url(chiffre)}.${base64url(chiffreur.getAuthTag())}`;
  return ValeurChiffree.parse(jeton);
}

/** Déchiffre une valeur `chv1`. Refuse explicitement une autre clé, un tag invalide ou un format inconnu. */
export function dechiffrer(valeurChiffree: string, cle: Uint8Array): string {
  verifierCleChiffrement(cle);
  const lue = ValeurChiffree.safeParse(valeurChiffree);
  if (!lue.success) throw new ErreurChiffrement("format_invalide", "Valeur chiffrée au format chv1 attendue.");
  const [, idCle, iv, chiffre, tag] = lue.data.split(".") as [string, string, string, string, string];
  if (idCle !== identifiantCle(cle)) {
    throw new ErreurChiffrement("cle_differente", "Valeur chiffrée avec une autre clé que celle fournie.");
  }
  try {
    const dechiffreur = createDecipheriv("aes-256-gcm", cle, Buffer.from(iv, "base64url"));
    dechiffreur.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([dechiffreur.update(Buffer.from(chiffre, "base64url")), dechiffreur.final()]).toString("utf8");
  } catch {
    throw new ErreurChiffrement("valeur_alteree", "Tag d'authentification invalide : valeur altérée ou clé incorrecte.");
  }
}

/**
 * Empreinte HMAC-SHA-256 d'une valeur DÉJÀ NORMALISÉE. Le type entre dans le calcul : un même texte
 * ne donne pas la même empreinte pour deux types. La clé HMAC doit faire au moins 32 octets.
 */
export function empreinte(type: TypeEmpreinte, valeurNormalisee: string, cleHmac: Uint8Array): EmpreinteHmac {
  if (cleHmac.byteLength < TAILLE_CLE_HMAC_MIN) {
    throw new ErreurChiffrement("cle_invalide", `Clé HMAC d'au moins ${TAILLE_CLE_HMAC_MIN} octets attendue.`);
  }
  return createHmac("sha256", cleHmac).update(`${type}\0${valeurNormalisee}`, "utf8").digest("hex");
}

/** Vrai si deux clés sont identiques (comparaison à temps constant). */
export function memeCle(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
