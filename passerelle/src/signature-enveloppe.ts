// Signature de l'enveloppe `_atelier` de chaque réponse d'outil (revue de sécurité, constat M2 de
// docs/revue-independante.md, détaillé en S9 dans docs/revue-securite-passerelle.md).
//
// Problème : le plugin déduit le mode (démonstration ou réel) d'une réponse déposée par un agent
// (route `tache.donnees.deposer`) à partir de `_atelier.mode`. Sans signature, un agent peut déposer une réponse
// forgée marquée `mode: "reel"` : des chiffres inventés passent pour réels.
//
// Mécanisme : la passerelle signe en Ed25519 avec SA clé privée (PASSERELLE_SIGNATURE_CLE_PRIVEE ou _FICHIER) ;
// le plugin ne détient que la clé publique. `_atelier.signature` = « aev1.<charge>.<signature> », charge = JSON en
// base64url, signature = Ed25519(« aev1.<charge> »). Champs de la charge :
//   v          1
//   mode       « demonstration » ou « reel » (doit égaler `_atelier.mode`)
//   service    service de la passerelle (gsc, ga4, facebook, crm…)
//   outil      nom de l'outil appelé
//   erreur     vrai si la réponse est une erreur d'outil (isError)
//   compte     compte connecté (identifiant de la propriété ou libellé du compte), ou null
//   arguments  SHA-256 hexadécimal du JSON canonique des arguments validés de l'appel (période, propriété…)
//   empreinte  SHA-256 hexadécimal du JSON canonique de la réponse SANS la clé `_atelier`
//   emis       horodatage de signature (secondes Unix)
// JSON canonique : celui de la preuve d'approbation (clés triées, aucun espace), appliqué aux données telles
// qu'elles voyagent en JSON (après sérialisation puis relecture).

import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { jsonCanonique } from "./reel/social-crm/approbation.js";

export const PREFIXE_ENVELOPPE = "aev1";

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
}

const sha256 = (texte: string): string => createHash("sha256").update(texte, "utf8").digest("hex");

/** Forme exacte que voit le destinataire : sérialisation JSON puis relecture (retire undefined, fonctions…). */
function commeTransmis(valeur: unknown): unknown {
  const texte = JSON.stringify(valeur);
  return texte === undefined ? null : JSON.parse(texte);
}

/** Empreinte d'une réponse structurée, sans `_atelier` (c'est ce que le plugin doit recalculer). */
export function empreinteReponse(structure: Record<string, unknown>): string {
  const { _atelier: _ignore, ...donnees } = structure;
  return sha256(jsonCanonique(commeTransmis(donnees)));
}

export function empreinteArgumentsAppel(args: unknown): string {
  return sha256(jsonCanonique(commeTransmis(args ?? {})));
}

export class SignataireEnveloppe {
  private readonly clePrivee: KeyObject;
  /** Clé publique SPKI DER en base64 (une ligne) : à donner au plugin. */
  readonly clePubliqueBase64: string;
  /** Empreinte courte de la clé publique (journal, contrôle visuel). */
  readonly empreinteCle: string;

  constructor(clePrivee: KeyObject | string, private readonly maintenant: () => number = Date.now) {
    const cle = typeof clePrivee === "string" ? lireClePrivee(clePrivee) : clePrivee;
    if (cle.asymmetricKeyType !== "ed25519") throw new Error("PASSERELLE_SIGNATURE_CLE_PRIVEE : une clé privée Ed25519 est attendue.");
    this.clePrivee = cle;
    const der = createPublicKey(cle).export({ type: "spki", format: "der" });
    this.clePubliqueBase64 = der.toString("base64");
    this.empreinteCle = createHash("sha256").update(der).digest("hex").slice(0, 16);
  }

  signer(p: { mode: ChargeEnveloppe["mode"]; service: string; outil: string; erreur: boolean; compte: string | null; args: unknown; structure: Record<string, unknown> }): string {
    const charge: ChargeEnveloppe = {
      v: 1,
      mode: p.mode,
      service: p.service,
      outil: p.outil,
      erreur: p.erreur,
      compte: p.compte,
      arguments: empreinteArgumentsAppel(p.args),
      empreinte: empreinteReponse(p.structure),
      emis: Math.floor(this.maintenant() / 1000),
    };
    const corps = `${PREFIXE_ENVELOPPE}.${Buffer.from(JSON.stringify(charge), "utf8").toString("base64url")}`;
    return `${corps}.${sign(null, Buffer.from(corps, "utf8"), this.clePrivee).toString("base64url")}`;
  }
}

/** PEM PKCS#8, ou DER PKCS#8 en base64 sur une ligne. */
function lireClePrivee(valeur: string): KeyObject {
  const v = valeur.trim();
  if (v.includes("BEGIN")) return createPrivateKey(v);
  return createPrivateKey({ key: Buffer.from(v, "base64"), format: "der", type: "pkcs8" });
}

/**
 * Lit PASSERELLE_SIGNATURE_CLE_PRIVEE (ou _FICHIER, 0600). Absente : null (réponses non signées ; le plugin doit
 * alors refuser de les tenir pour réelles). Clé invalide : erreur (la passerelle refuse de démarrer).
 */
export function signataireDepuisEnv(env: NodeJS.ProcessEnv): SignataireEnveloppe | null {
  let valeur = env["PASSERELLE_SIGNATURE_CLE_PRIVEE"]?.trim() ?? "";
  const fichier = env["PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER"]?.trim() ?? "";
  if (valeur === "" && fichier !== "") {
    if ((statSync(fichier).mode & 0o077) !== 0) throw new Error("PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER : le fichier doit être lisible par son seul propriétaire (chmod 600).");
    valeur = readFileSync(fichier, "utf8").trim();
  }
  if (valeur === "") return null;
  try {
    return new SignataireEnveloppe(valeur);
  } catch (e) {
    // Message sans la valeur de la clé.
    throw new Error(`PASSERELLE_SIGNATURE_CLE_PRIVEE illisible : ${e instanceof Error && /Ed25519/.test(e.message) ? e.message : "clé privée Ed25519 attendue (PEM PKCS#8 ou DER base64)"}`);
  }
}

export type VerdictEnveloppe = { ok: true; charge: ChargeEnveloppe } | { ok: false; motif: string };

/**
 * Vérification de référence, À REPRENDRE TELLE QUELLE CÔTÉ PLUGIN (dépôt `tache.donnees.deposer`) : `structure` =
 * `structuredContent` de la réponse (ou le JSON du texte), `clePublique` = clé publique de la passerelle.
 */
export function verifierEnveloppe(structure: Record<string, unknown>, clePublique: KeyObject | string): VerdictEnveloppe {
  const atelier = structure["_atelier"];
  if (typeof atelier !== "object" || atelier === null) return { ok: false, motif: "enveloppe _atelier absente" };
  const { mode, signature } = atelier as { mode?: unknown; signature?: unknown };
  if (typeof signature !== "string") return { ok: false, motif: "enveloppe non signée" };
  const morceaux = signature.split(".");
  if (morceaux.length !== 3 || morceaux[0] !== PREFIXE_ENVELOPPE) return { ok: false, motif: "signature illisible" };
  const cle = typeof clePublique === "string"
    ? createPublicKey(clePublique.includes("BEGIN") ? clePublique : { key: Buffer.from(clePublique, "base64"), format: "der", type: "spki" })
    : clePublique;
  let valide = false;
  try {
    valide = verify(null, Buffer.from(`${morceaux[0]}.${morceaux[1]}`, "utf8"), cle, Buffer.from(morceaux[2]!, "base64url"));
  } catch {
    valide = false;
  }
  if (!valide) return { ok: false, motif: "signature invalide" };
  let charge: ChargeEnveloppe;
  try {
    charge = JSON.parse(Buffer.from(morceaux[1]!, "base64url").toString("utf8")) as ChargeEnveloppe;
  } catch {
    return { ok: false, motif: "charge illisible" };
  }
  if (charge.v !== 1) return { ok: false, motif: "version inconnue" };
  if (charge.mode !== mode) return { ok: false, motif: "mode de l'enveloppe différent du mode signé" };
  if (charge.empreinte !== empreinteReponse(structure)) return { ok: false, motif: "contenu modifié après signature" };
  return { ok: true, charge };
}
