/**
 * Vérification de l'en-tête X-Hub-Signature-256 des notifications de Meta : « sha256=<hex> », HMAC-SHA256 du corps
 * BRUT (octets reçus, jamais un JSON re-sérialisé : Meta échappe l'unicode) avec le secret de l'application.
 * Source : https://developers.facebook.com/docs/graph-api/webhooks/getting-started (« Validating payloads »).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function signer(corps: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(corps).digest("hex")}`;
}

export function signatureValide(corps: Buffer, entete: string | string[] | undefined, secret: string): boolean {
  if (typeof entete !== "string" || !secret) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(entete.trim());
  if (!m) return false;
  const recue = Buffer.from(m[1]!.toLowerCase(), "hex");
  const attendue = createHmac("sha256", secret).update(corps).digest();
  return recue.length === attendue.length && timingSafeEqual(recue, attendue);
}
