// Chiffrement au repos des jetons de rafraîchissement Google : AES-256-GCM
// (node:crypto), vecteur d'initialisation aléatoire de 12 octets par valeur,
// étiquette d'authentification vérifiée au déchiffrement. Format : « v1.<iv>.<tag>.<chiffré> » en base64url.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function chiffrer(cle: Buffer, clair: string, contexte: string): string {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  // Le contexte (identifiant d'octroi) est lié au chiffré : une valeur recopiée dans un autre octroi ne se déchiffre pas.
  chiffreur.setAAD(Buffer.from(contexte, "utf8"));
  const corps = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);
  return ["v1", iv.toString("base64url"), chiffreur.getAuthTag().toString("base64url"), corps.toString("base64url")].join(".");
}

export function dechiffrer(cle: Buffer, chiffre: string, contexte: string): string {
  const [version, iv, tag, corps] = chiffre.split(".");
  if (version !== "v1" || !iv || !tag || corps === undefined) throw new Error("Valeur chiffrée illisible.");
  const dechiffreur = createDecipheriv("aes-256-gcm", cle, Buffer.from(iv, "base64url"));
  dechiffreur.setAAD(Buffer.from(contexte, "utf8"));
  dechiffreur.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([dechiffreur.update(Buffer.from(corps, "base64url")), dechiffreur.final()]).toString("utf8");
}
