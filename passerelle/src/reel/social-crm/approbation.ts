// Preuve d'approbation humaine des mutations réelles (publier, envoyer, modifier).
//
// Mécanisme retenu : un jeton signé Ed25519 par le plugin de l'atelier, vérifié hors ligne par la
// passerelle avec la seule CLÉ PUBLIQUE du plugin (PASSERELLE_APPROBATION_CLE_PUBLIQUE). La passerelle ne
// peut donc pas fabriquer de preuve, et elle n'a besoin d'aucun accès au serveur Paperclip.
//
// Format : « apv1.<charge>.<signature> », charge = JSON en base64url, signature = Ed25519(« apv1.<charge> ») en
// base64url. Champs de la charge (tous obligatoires, `compte` peut valoir null) :
//   v          1
//   cle        clé d'idempotence de la diffusion approuvée (8 à 200 caractères) : UNE clé = UN effet au plus
//   service    identifiant du service de la passerelle (facebook, instagram, linkedin, crm, pipedrive, odoo, teamleader)
//   outil      nom exact de l'outil de mutation
//   empreinte  SHA-256 hexadécimal de la forme canonique des arguments de l'outil, SANS `preuve_approbation`
//   compte     compte visé (page, organisation, portail...) tel que la connexion le désigne, ou null (tout compte)
//   diffusion  identifiant de la diffusion dans le plugin
//   decision   identifiant de la décision humaine d'approbation
//   emis       horodatage d'émission (secondes Unix)
//   expire     horodatage d'expiration (secondes Unix), au plus 7 jours après `emis`
// Forme canonique : JSON sans espace, clés d'objet triées par ordre des points de code, tableaux dans l'ordre.

import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

export const PREFIXE_PREUVE = "apv1";
const DUREE_MAX_S = 7 * 24 * 3600;
const DERIVE_HORLOGE_S = 120;

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
}

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

/** Empreinte des arguments d'un outil de mutation, telle que le plugin doit la signer. */
export function empreinteArguments(args: Record<string, unknown>): string {
  const { preuve_approbation: _ignoree, ...reste } = args;
  return createHash("sha256").update(jsonCanonique(reste), "utf8").digest("hex");
}

/** Signe une preuve (implémentation de référence pour le plugin, et pour les essais). */
export function signerPreuve(clePrivee: KeyObject | string, charge: ChargePreuve): string {
  const corps = `${PREFIXE_PREUVE}.${Buffer.from(JSON.stringify(charge), "utf8").toString("base64url")}`;
  const signature = sign(null, Buffer.from(corps, "utf8"), clePrivee);
  return `${corps}.${signature.toString("base64url")}`;
}

export type VerdictPreuve = { ok: true; charge: ChargePreuve } | { ok: false; motif: string };

export interface AttenduPreuve {
  service: string;
  outil: string;
  args: Record<string, unknown>;
  /** Compte de la connexion (page, organisation, portail...) ; comparé à `compte` si la preuve en vise un. */
  compte: string | null;
  maintenantS: number;
}

export class VerificateurPreuves {
  private readonly cle: KeyObject | null;

  constructor(clePubliquePem: string | null) {
    if (!clePubliquePem) {
      this.cle = null;
      return;
    }
    const cle = createPublicKey(clePubliquePem);
    if (cle.asymmetricKeyType !== "ed25519") throw new Error("PASSERELLE_APPROBATION_CLE_PUBLIQUE : une clé publique Ed25519 est attendue.");
    this.cle = cle;
  }

  get configure(): boolean {
    return this.cle !== null;
  }

  verifier(preuve: string | undefined, attendu: AttenduPreuve): VerdictPreuve {
    if (preuve === undefined || preuve.trim() === "") return { ok: false, motif: "aucune preuve d'approbation humaine n'accompagne la demande" };
    if (!this.cle) return { ok: false, motif: "la passerelle n'a pas de clé de vérification des approbations (PASSERELLE_APPROBATION_CLE_PUBLIQUE) : aucune mutation réelle n'est permise" };
    const morceaux = preuve.trim().split(".");
    if (morceaux.length !== 3 || morceaux[0] !== PREFIXE_PREUVE) return { ok: false, motif: "preuve d'approbation illisible" };
    const [prefixe, charge64, signature64] = morceaux as [string, string, string];
    let valide = false;
    try {
      valide = verify(null, Buffer.from(`${prefixe}.${charge64}`, "utf8"), this.cle, Buffer.from(signature64, "base64url"));
    } catch {
      valide = false;
    }
    if (!valide) return { ok: false, motif: "signature de la preuve d'approbation invalide" };
    let charge: ChargePreuve;
    try {
      charge = JSON.parse(Buffer.from(charge64, "base64url").toString("utf8")) as ChargePreuve;
    } catch {
      return { ok: false, motif: "preuve d'approbation illisible" };
    }
    const texte = (v: unknown, max: number): boolean => typeof v === "string" && v.length >= 1 && v.length <= max;
    if (
      charge.v !== 1 || !texte(charge.cle, 200) || charge.cle.length < 8 || !texte(charge.service, 32) || !texte(charge.outil, 64) ||
      typeof charge.empreinte !== "string" || !/^[0-9a-f]{64}$/.test(charge.empreinte) || !(charge.compte === null || texte(charge.compte, 200)) ||
      !texte(charge.diffusion, 200) || !texte(charge.decision, 200) || !Number.isInteger(charge.emis) || !Number.isInteger(charge.expire)
    ) {
      return { ok: false, motif: "preuve d'approbation incomplète" };
    }
    if (charge.emis > attendu.maintenantS + DERIVE_HORLOGE_S) return { ok: false, motif: "preuve d'approbation émise dans le futur" };
    if (charge.expire <= attendu.maintenantS) return { ok: false, motif: "preuve d'approbation expirée : redemander la diffusion au plugin" };
    if (charge.expire - charge.emis > DUREE_MAX_S) return { ok: false, motif: "preuve d'approbation trop longue (7 jours au plus)" };
    if (charge.service !== attendu.service) return { ok: false, motif: `preuve d'approbation émise pour le service ${charge.service}, pas ${attendu.service}` };
    if (charge.outil !== attendu.outil) return { ok: false, motif: `preuve d'approbation émise pour l'outil ${charge.outil}, pas ${attendu.outil}` };
    if (charge.empreinte !== empreinteArguments(attendu.args)) {
      return { ok: false, motif: "le contenu demandé diffère du contenu approuvé (empreinte des arguments différente)" };
    }
    if (charge.compte !== null && charge.compte !== attendu.compte) {
      return { ok: false, motif: `preuve d'approbation émise pour le compte ${charge.compte}, la connexion désigne ${attendu.compte ?? "un autre compte"}` };
    }
    return { ok: true, charge };
  }
}
