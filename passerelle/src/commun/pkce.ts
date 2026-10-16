// PKCE (RFC 7636), méthode S256 : partagé par le serveur d'autorisation de démonstration et les connecteurs réels.

import { createHash, timingSafeEqual } from "node:crypto";

export const MOTIF_VERIFICATEUR = /^[A-Za-z0-9\-._~]{43,128}$/;
export const MOTIF_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export function calculerChallengeS256(verificateur: string): string {
  return createHash("sha256").update(verificateur, "ascii").digest("base64url");
}

/** Vrai si `verificateur` correspond à `challenge` selon la méthode S256 (comparaison à temps constant). */
export function verifierPkceS256(verificateur: string, challenge: string): boolean {
  if (!MOTIF_VERIFICATEUR.test(verificateur) || !MOTIF_CHALLENGE.test(challenge)) return false;
  const attendu = Buffer.from(calculerChallengeS256(verificateur), "utf8");
  const recu = Buffer.from(challenge, "utf8");
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}
