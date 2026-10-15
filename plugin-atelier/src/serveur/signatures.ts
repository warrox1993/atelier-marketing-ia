/**
 * Signatures Ed25519 échangées avec la passerelle marketing (revue de sécurité, §6 et §6 bis
 * de `docs/revue-securite-passerelle.md`).
 *
 * - Preuve d'approbation (`apv1`) : SIGNÉE ici avec la clé privée du plugin (secret natif de
 *   Paperclip), vérifiée par la passerelle avec la seule clé publique (`VerificateurPreuves`).
 * - Enveloppe `_atelier` (`aev1`) : SIGNÉE par la passerelle, VÉRIFIÉE ici avec sa clé publique
 *   (configuration du plugin fixée par l'humain).
 *
 * Les fonctions `jsonCanonique`, `empreinteArguments`, `empreinteReponse` et `verifierEnveloppe`
 * reprennent TELLES QUELLES celles de la passerelle (`passerelle/src/reel/social-crm/approbation.ts`,
 * `passerelle/src/signature-enveloppe.ts`) : la compatibilité est testée contre le code de la
 * passerelle (`tests/signatures.spec.ts`). Aucun secret n'est journalisé ni renvoyé dans une erreur.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

export const PREFIXE_PREUVE = "apv1";
export const PREFIXE_ENVELOPPE = "aev1";
/** Durée maximale d'une preuve d'approbation acceptée par la passerelle. */
export const DUREE_MAX_PREUVE_S = 7 * 24 * 3600;
/** Dérive d'horloge tolérée (même valeur que la passerelle). */
export const DERIVE_HORLOGE_S = 120;

/* ------------------------------------------------------------------ */
/* JSON canonique et empreintes (repris de la passerelle)               */
/* ------------------------------------------------------------------ */

/** JSON canonique : clés triées, aucun espace ; refuse les valeurs non représentables. */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur === "boolean" || typeof valeur === "string") return JSON.stringify(valeur);
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) throw new Error("nombre non fini dans les arguments");
    return JSON.stringify(valeur);
  }
  if (Array.isArray(valeur)) return `[${valeur.map(jsonCanonique).join(",")}]`;
  if (typeof valeur === "object") {
    const entrees = Object.entries(valeur as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entrees.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entrees.map(([k, v]) => `${JSON.stringify(k)}:${jsonCanonique(v)}`).join(",")}}`;
  }
  throw new Error("valeur non représentable dans les arguments");
}

const sha256 = (texte: string): string => createHash("sha256").update(texte, "utf8").digest("hex");

/** Empreinte des arguments d'un outil de mutation, telle que la passerelle la recalcule (sans `preuve_approbation`). */
export function empreinteArguments(args: Record<string, unknown>): string {
  // Arguments de transport, jamais dans l'empreinte (comme la passerelle).
  const { preuve_approbation: _p, revocations_approbation: _r, ...reste } = args;
  return sha256(jsonCanonique(reste));
}

/** Appel d'outil d'écriture complet, tel que l'humain l'approuve (contrat v1.6, revue des signatures S-1). */
export interface AppelOutil {
  service: string;
  outil: string;
  compte: string;
  arguments: Record<string, unknown>;
}

/**
 * Empreinte canonique d'un APPEL (service, outil, compte, arguments complets sans la preuve) :
 * c'est elle que la décision humaine vise. Tout champ (texte, lien, destinataire, contact, noms et
 * valeurs des propriétés CRM) change l'empreinte ; l'ordre des clés ne la change pas.
 */
export function empreinteAppel(appel: AppelOutil): string {
  const { preuve_approbation: _p, revocations_approbation: _r, ...args } = appel.arguments;
  return sha256(jsonCanonique({ v: 1, service: appel.service, outil: appel.outil, compte: appel.compte, arguments: args }));
}

/** Forme exacte que voit le destinataire : sérialisation JSON puis relecture. */
function commeTransmis(valeur: unknown): unknown {
  const texte = JSON.stringify(valeur);
  return texte === undefined ? null : JSON.parse(texte);
}

/** Empreinte d'une réponse structurée, sans `_atelier`. */
export function empreinteReponse(structure: Record<string, unknown>): string {
  const { _atelier: _ignore, ...donnees } = structure;
  return sha256(jsonCanonique(commeTransmis(donnees)));
}

/** Empreinte des arguments d'un APPEL (lecture comme écriture), telle que signée dans l'enveloppe. */
export function empreinteArgumentsAppel(args: unknown): string {
  return sha256(jsonCanonique(commeTransmis(args ?? {})));
}

/* ------------------------------------------------------------------ */
/* Clés                                                                */
/* ------------------------------------------------------------------ */

/** Clé privée Ed25519 : PEM PKCS#8, ou DER PKCS#8 en base64 sur une ligne. Message d'erreur sans la valeur. */
export function lireClePrivee(valeur: string): KeyObject {
  let cle: KeyObject;
  try {
    const v = valeur.trim();
    cle = v.includes("BEGIN") ? createPrivateKey(v) : createPrivateKey({ key: Buffer.from(v, "base64"), format: "der", type: "pkcs8" });
  } catch {
    throw new Error("clé privée illisible (PEM PKCS#8 ou DER base64 attendu)");
  }
  if (cle.asymmetricKeyType !== "ed25519") throw new Error("clé privée Ed25519 attendue");
  return cle;
}

/** Clé publique Ed25519 : PEM SPKI, ou DER SPKI en base64 (ligne « clé publique à donner au plugin » de la passerelle). */
export function lireClePublique(valeur: string): KeyObject {
  let cle: KeyObject;
  try {
    const v = valeur.trim();
    cle = v.includes("BEGIN") ? createPublicKey(v) : createPublicKey({ key: Buffer.from(v, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("clé publique illisible (PEM SPKI ou DER base64 attendu)");
  }
  if (cle.asymmetricKeyType !== "ed25519") throw new Error("clé publique Ed25519 attendue");
  return cle;
}

/** Empreinte courte d'une clé publique (affichage, contrôle visuel). */
export function empreinteCle(cle: KeyObject): string {
  const der = (cle.type === "private" ? createPublicKey(cle) : cle).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* Preuve d'approbation (signée par le plugin)                          */
/* ------------------------------------------------------------------ */

export interface ChargePreuve {
  v: 1;
  cle: string;
  service: string;
  outil: string;
  empreinte: string;
  compte: string | null;
  diffusion: string;
  decision: string;
  emis: number;
  expire: number;
  /** Entreprise Paperclip qui a approuvé : la passerelle la compare à celle de la liste de révocation (arv1). */
  entreprise?: string;
}

/** Signe une preuve d'approbation (même format que `signerPreuve` de la passerelle). */
export function signerPreuve(clePrivee: KeyObject, charge: ChargePreuve): string {
  const corps = `${PREFIXE_PREUVE}.${Buffer.from(JSON.stringify(charge), "utf8").toString("base64url")}`;
  return `${corps}.${sign(null, Buffer.from(corps, "utf8"), clePrivee).toString("base64url")}`;
}

/* ------------------------------------------------------------------ */
/* Liste de révocation des preuves (signée par le plugin, v1.6, S-7)    */
/* ------------------------------------------------------------------ */

/**
 * Préfixe distinct de `apv1` : une liste ne peut jamais servir de preuve (la passerelle vérifie le
 * préfixe dans le corps signé avant tout), même signée par la même clé.
 */
export const PREFIXE_REVOCATIONS = "arv1";

export interface ChargeRevocations {
  v: 1;
  /** Entreprise de Paperclip dont les preuves sont listées. */
  entreprise: string;
  emis: number;
  /** Preuves révoquées encore non expirées : identifiants de la charge `apv1` (diffusion, clé, décision). */
  revoquees: Array<{ diffusion: string; cle: string; decision: string; expire: number }>;
}

export function signerRevocations(clePrivee: KeyObject, charge: ChargeRevocations): string {
  const corps = `${PREFIXE_REVOCATIONS}.${Buffer.from(JSON.stringify(charge), "utf8").toString("base64url")}`;
  return `${corps}.${sign(null, Buffer.from(corps, "utf8"), clePrivee).toString("base64url")}`;
}

/* ------------------------------------------------------------------ */
/* Enveloppe `_atelier` (signée par la passerelle)                      */
/* ------------------------------------------------------------------ */

export interface ChargeEnveloppe {
  v: 1;
  mode: "demonstration" | "reel";
  service: string;
  outil: string;
  erreur: boolean;
  compte: string | null;
  arguments: string;
  empreinte: string;
  emis: number;
  /**
   * Passerelle v1.6 (revue des signatures S-3) : vrai pour tout outil qui n'est pas annoncé en lecture
   * seule. ABSENT (ancienne charge) : traité comme vrai (prudence).
   */
  ecriture?: boolean;
  /** Vrai seulement si l'outil d'écriture a réellement agi. Absent : faux. */
  executee?: boolean;
}

/** Une charge `aev1` vient-elle d'un outil d'écriture ? Absent : oui (prudence). */
export const chargeEcriture = (c: ChargeEnveloppe): boolean => c.ecriture !== false;

/**
 * v1.6 (S-5, demande du lot passerelle) : clé d'idempotence SIGNÉE dans la preuve, dérivée de
 * l'identifiant de diffusion (UUID unique) et jamais de la valeur choisie par l'agent.
 */
export function cleIdempotenceSignee(diffusionId: string): string {
  return `atelier-diffusion-${diffusionId}`;
}

export type VerdictEnveloppe = { ok: true; charge: ChargeEnveloppe } | { ok: false; motif: string };

/**
 * Vérification de référence de la passerelle (`verifierEnveloppe`), étendue à une LISTE de clés
 * publiques (rotation). La signature est vérifiée AVANT toute lecture de la charge.
 */
export function verifierEnveloppe(structure: Record<string, unknown>, clesPubliques: readonly KeyObject[]): VerdictEnveloppe {
  const atelier = structure["_atelier"];
  if (typeof atelier !== "object" || atelier === null) return { ok: false, motif: "enveloppe _atelier absente" };
  const { mode, signature } = atelier as { mode?: unknown; signature?: unknown };
  if (typeof signature !== "string") return { ok: false, motif: "enveloppe non signée" };
  const morceaux = signature.split(".");
  if (morceaux.length !== 3 || morceaux[0] !== PREFIXE_ENVELOPPE) return { ok: false, motif: "signature illisible" };
  if (clesPubliques.length === 0) return { ok: false, motif: "aucune clé publique de la passerelle configurée dans le plugin" };
  let valide = false;
  for (const cle of clesPubliques) {
    try {
      if (verify(null, Buffer.from(`${morceaux[0]}.${morceaux[1]}`, "utf8"), cle, Buffer.from(morceaux[2]!, "base64url"))) {
        valide = true;
        break;
      }
    } catch {
      // clé suivante
    }
  }
  if (!valide) return { ok: false, motif: "signature invalide" };
  let charge: ChargeEnveloppe;
  try {
    charge = JSON.parse(Buffer.from(morceaux[1]!, "base64url").toString("utf8")) as ChargeEnveloppe;
  } catch {
    return { ok: false, motif: "charge illisible" };
  }
  if (!charge || typeof charge !== "object" || charge.v !== 1) return { ok: false, motif: "version inconnue" };
  if (charge.mode !== mode) return { ok: false, motif: "mode de l'enveloppe différent du mode signé" };
  if (charge.empreinte !== empreinteReponse(structure)) return { ok: false, motif: "contenu modifié après signature" };
  if (typeof charge.emis !== "number" || !Number.isInteger(charge.emis)) return { ok: false, motif: "horodatage de signature illisible" };
  return { ok: true, charge };
}
