// Protections du serveur de pages : jeton anti-CSRF signé (usage unique), limite de débit, adresse IP tronquée.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* ---------------- CSRF : cookie + jeton signé (double envoi lié par HMAC) ---------------- */

export const AGE_JETON_MIN_MS = 2_000;
export const AGE_JETON_MAX_MS = 2 * 60 * 60 * 1000;

export interface JetonEmis {
  /** Valeur du cookie (HttpOnly, SameSite=Strict). */
  nonce: string;
  /** Valeur du champ caché du formulaire : `nonce.émisÀ.signature`. */
  champ: string;
}

function signer(secret: Buffer, slug: string, nonce: string, emisA: number): string {
  return createHmac("sha256", secret).update(`csrf|${slug}|${nonce}|${emisA}`).digest("base64url");
}

export function emettreJeton(secret: Buffer, slug: string, maintenant: number): JetonEmis {
  const nonce = randomBytes(18).toString("base64url");
  return { nonce, champ: `${nonce}.${maintenant}.${signer(secret, slug, nonce, maintenant)}` };
}

export type VerdictJeton = { ok: true; nonce: string } | { ok: false; raison: "absent" | "invalide" | "expire" | "trop_rapide" };

/** Vérifie le champ caché et le cookie (même nonce, signature valide, âge entre 2 s et 2 h). Le « trop rapide » est le piège de rapidité des robots. */
export function verifierJeton(secret: Buffer, slug: string, champ: string | undefined, cookie: string | undefined, maintenant: number): VerdictJeton {
  if (!champ || !cookie) return { ok: false, raison: "absent" };
  const morceaux = champ.split(".");
  if (morceaux.length !== 3) return { ok: false, raison: "invalide" };
  const [nonce, emis, signature] = morceaux as [string, string, string];
  const emisA = Number(emis);
  if (!/^\d{10,15}$/u.test(emis) || !Number.isSafeInteger(emisA)) return { ok: false, raison: "invalide" };
  const attendue = Buffer.from(signer(secret, slug, nonce, emisA));
  const recue = Buffer.from(signature);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return { ok: false, raison: "invalide" };
  const cookieBuf = Buffer.from(cookie);
  const nonceBuf = Buffer.from(nonce);
  if (cookieBuf.length !== nonceBuf.length || !timingSafeEqual(cookieBuf, nonceBuf)) return { ok: false, raison: "invalide" };
  const age = maintenant - emisA;
  if (age > AGE_JETON_MAX_MS || age < 0) return { ok: false, raison: "expire" };
  if (age < AGE_JETON_MIN_MS) return { ok: false, raison: "trop_rapide" };
  return { ok: true, nonce };
}

/* ---------------- Limite de débit : fenêtre glissante par clé ---------------- */

export class LimiteDebit {
  private readonly passages = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly fenetreMs: number,
    private readonly maintenant: () => number = Date.now,
    private readonly cleMax = 10_000,
  ) {}

  /** Enregistre un passage ; faux si la clé a atteint son plafond dans la fenêtre. */
  autoriser(cle: string): boolean {
    const t = this.maintenant();
    const debut = t - this.fenetreMs;
    const liste = (this.passages.get(cle) ?? []).filter((x) => x > debut);
    if (liste.length >= this.max) {
      this.passages.set(cle, liste);
      return false;
    }
    liste.push(t);
    this.passages.set(cle, liste);
    if (this.passages.size > this.cleMax) this.purger(debut);
    return true;
  }

  private purger(debut: number): void {
    for (const [cle, liste] of this.passages) {
      if (liste.every((x) => x <= debut)) this.passages.delete(cle);
    }
    // Garde-fou : si tout est encore actif, on oublie les plus anciennes clés plutôt que de grossir sans fin.
    while (this.passages.size > this.cleMax) {
      const premiere = this.passages.keys().next();
      if (premiere.done) break;
      this.passages.delete(premiere.value);
    }
  }
}

/* ---------------- Clé des limites de débit ---------------- */

/**
 * Clé de limite d'une adresse : IPv4 telle quelle ; IPv6 réduite à son préfixe /64 (un abonné reçoit en général
 * un /64 entier : changer d'adresse dans ce bloc ne doit pas contourner la limite). Les adresses IPv4 mappées
 * (::ffff:a.b.c.d) redeviennent IPv4.
 */
export function cleLimite(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(ip);
  if (v4) return v4[1]!;
  if (!ip.includes(":") || !/^[0-9a-f:]+$/iu.test(ip)) return ip;
  const [gauche = "", droite] = ip.toLowerCase().split("::");
  const g = gauche.split(":").filter((x) => x !== "");
  const d = droite === undefined ? [] : droite.split(":").filter((x) => x !== "");
  const groupes = droite === undefined ? g : [...g, ...Array<string>(Math.max(0, 8 - g.length - d.length)).fill("0"), ...d];
  return `${groupes.slice(0, 4).map((x) => x.replace(/^0+(?=.)/u, "")).join(":")}::/64`;
}

/* ---------------- Adresse IP tronquée (preuve de consentement minimisée) ---------------- */

/** IPv4 : dernier octet à 0 (/24) ; IPv6 : 3 premiers groupes (/48). Autre valeur : « inconnue ». */
export function tronquerIp(ip: string | undefined | null): string {
  if (!ip) return "inconnue";
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/iu.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (ip.includes(":") && /^[0-9a-f:]+$/iu.test(ip)) {
    const groupes = ip.split("::")[0]!.split(":").filter((g) => g !== "");
    const trois = [...groupes, "0", "0", "0"].slice(0, 3).map((g) => g.toLowerCase());
    return `${trois.join(":")}::`;
  }
  return "inconnue";
}
