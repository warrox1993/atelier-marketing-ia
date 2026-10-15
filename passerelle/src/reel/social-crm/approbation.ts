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
//   entreprise (facultatif, contrat v1.6+) identifiant de l'entreprise Paperclip qui a approuvé : quand il est présent, la
//              liste de révocation présentée doit viser la même entreprise (sinon la liste vide d'une autre entreprise
//              passerait le contrôle)
//
// Liste de révocation (revue des signatures S-7) : « arv1.<charge>.<signature> », signée par la MÊME clé d'approbation, servie
// par le plugin (GET /preuves/revocations) et transmise par l'agent dans l'argument `revocations_approbation`. Charge :
//   v 1 ; entreprise ; emis (secondes Unix) ; revoquees : [{ diffusion, cle, decision, expire }]
// Toute mutation réelle exige une liste émise depuis moins de 5 minutes (FRAICHEUR_REVOCATIONS_S) : c'est le délai
// maximal d'effet d'une révocation. `preuve_approbation` et `revocations_approbation` voyagent hors des arguments : ni
// l'un ni l'autre n'entre dans l'empreinte (le plugin ne les met jamais dans `arguments`).
// Forme canonique : JSON sans espace, clés d'objet triées par ordre des points de code, tableaux dans l'ordre.

import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

export const PREFIXE_PREUVE = "apv1";
export const PREFIXE_REVOCATIONS = "arv1";
const DUREE_MAX_S = 7 * 24 * 3600;
const DERIVE_HORLOGE_S = 120;
/** Fraîcheur maximale de la liste de révocation (5 minutes, décision proposée par la revue S-7). */
export const FRAICHEUR_REVOCATIONS_S = 5 * 60;
/** Services pour lesquels une preuve sans compte (`compte: null`, « tout compte ») est refusée. */
const SERVICES_RESEAUX_SOCIAUX: ReadonlySet<string> = new Set(["facebook", "instagram", "linkedin"]);
/** Arguments de transport : ils accompagnent l'appel mais n'en font pas partie, donc jamais dans l'empreinte. */
export const ARGUMENTS_DE_TRANSPORT = ["preuve_approbation", "revocations_approbation"] as const;

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
  /** Entreprise Paperclip de l'approbation (champ additif, signé) ; absent : la liste ne peut pas être liée à l'entreprise. */
  entreprise?: string;
}

export interface ChargeRevocations {
  v: 1;
  entreprise: string;
  emis: number;
  revoquees: Array<{ diffusion: string; cle: string; decision: string; expire: number }>;
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

/** Arguments d'un appel sans les arguments de transport (`preuve_approbation`, `revocations_approbation`). */
export function sansArgumentsDeTransport(args: Record<string, unknown>): Record<string, unknown> {
  const reste: Record<string, unknown> = { ...args };
  for (const nom of ARGUMENTS_DE_TRANSPORT) delete reste[nom];
  return reste;
}

/** Empreinte des arguments d'un outil de mutation, telle que le plugin doit la signer. */
export function empreinteArguments(args: Record<string, unknown>): string {
  return createHash("sha256").update(jsonCanonique(sansArgumentsDeTransport(args)), "utf8").digest("hex");
}

/** Signe une preuve (implémentation de référence pour le plugin, et pour les essais). */
export function signerPreuve(clePrivee: KeyObject | string, charge: ChargePreuve): string {
  const corps = `${PREFIXE_PREUVE}.${Buffer.from(JSON.stringify(charge), "utf8").toString("base64url")}`;
  const signature = sign(null, Buffer.from(corps, "utf8"), clePrivee);
  return `${corps}.${signature.toString("base64url")}`;
}

/** Signe une liste de révocation (implémentation de référence ; le plugin a la sienne, `signerRevocations`). */
export function signerRevocations(clePrivee: KeyObject | string, charge: ChargeRevocations): string {
  const corps = `${PREFIXE_REVOCATIONS}.${Buffer.from(JSON.stringify(charge), "utf8").toString("base64url")}`;
  return `${corps}.${sign(null, Buffer.from(corps, "utf8"), clePrivee).toString("base64url")}`;
}

export type VerdictPreuve = { ok: true; charge: ChargePreuve } | { ok: false; motif: string };

export interface AttenduPreuve {
  service: string;
  outil: string;
  args: Record<string, unknown>;
  /** Compte de la connexion (page, organisation, portail...) ; comparé à `compte` si la preuve en vise un. */
  compte: string | null;
  maintenantS: number;
  /** Liste de révocation `arv1` récente servie par le plugin (argument `revocations_approbation`) ; absente = refus. */
  revocations: string | undefined;
}

export class VerificateurPreuves {
  /** Clés publiques acceptées : plusieurs pendant une rotation (ancienne et nouvelle clé du plugin), une en régime normal. */
  private readonly cles: KeyObject[];

  /** `clePubliquePem` : un ou plusieurs blocs PEM « PUBLIC KEY » (concaténés), ou null (aucune mutation permise). */
  constructor(clePubliquePem: string | null) {
    this.cles = [];
    if (!clePubliquePem) return;
    const blocs = clePubliquePem.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g) ?? [clePubliquePem];
    for (const bloc of blocs) {
      const cle = createPublicKey(bloc);
      if (cle.asymmetricKeyType !== "ed25519") throw new Error("PASSERELLE_APPROBATION_CLE_PUBLIQUE : une clé publique Ed25519 est attendue.");
      this.cles.push(cle);
    }
  }

  get configure(): boolean {
    return this.cles.length > 0;
  }

  /** Vérifie `prefixe.charge.signature` avec les clés publiques ; renvoie la charge JSON décodée ou un motif de refus. */
  private lireSignee(jeton: string, prefixe: string, nom: string): { ok: true; charge: unknown } | { ok: false; motif: string } {
    const morceaux = jeton.trim().split(".");
    if (morceaux.length !== 3 || morceaux[0] !== prefixe) return { ok: false, motif: `${nom} illisible` };
    const [pref, charge64, signature64] = morceaux as [string, string, string];
    let valide = false;
    try {
      const corps = Buffer.from(`${pref}.${charge64}`, "utf8");
      const signature = Buffer.from(signature64, "base64url");
      valide = this.cles.some((cle) => verify(null, corps, cle, signature));
    } catch {
      valide = false;
    }
    if (!valide) return { ok: false, motif: `signature de ${nom} invalide` };
    try {
      return { ok: true, charge: JSON.parse(Buffer.from(charge64, "base64url").toString("utf8")) as unknown };
    } catch {
      return { ok: false, motif: `${nom} illisible` };
    }
  }

  verifier(preuve: string | undefined, attendu: AttenduPreuve): VerdictPreuve {
    if (preuve === undefined || preuve.trim() === "") return { ok: false, motif: "aucune preuve d'approbation humaine n'accompagne la demande" };
    if (this.cles.length === 0) return { ok: false, motif: "la passerelle n'a pas de clé de vérification des approbations (PASSERELLE_APPROBATION_CLE_PUBLIQUE) : aucune mutation réelle n'est permise" };
    const lue = this.lireSignee(preuve, PREFIXE_PREUVE, "la preuve d'approbation");
    if (!lue.ok) return { ok: false, motif: lue.motif };
    if (typeof lue.charge !== "object" || lue.charge === null) return { ok: false, motif: "preuve d'approbation incomplète" };
    const charge = lue.charge as ChargePreuve;
    const texte = (v: unknown, max: number): boolean => typeof v === "string" && v.length >= 1 && v.length <= max;
    if (
      charge.v !== 1 || !texte(charge.cle, 200) || charge.cle.length < 8 || !texte(charge.service, 32) || !texte(charge.outil, 64) ||
      typeof charge.empreinte !== "string" || !/^[0-9a-f]{64}$/.test(charge.empreinte) || !(charge.compte === null || texte(charge.compte, 200)) ||
      !texte(charge.diffusion, 200) || !texte(charge.decision, 200) || !Number.isInteger(charge.emis) || !Number.isInteger(charge.expire) ||
      !(charge.entreprise === undefined || texte(charge.entreprise, 200))
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
    // Revue S-7 (défense contre une preuve que l'humain a retirée) : liste de révocation récente exigée.
    if (SERVICES_RESEAUX_SOCIAUX.has(charge.service) && charge.compte === null) {
      return { ok: false, motif: `preuve d'approbation sans compte pour le service ${charge.service} : un compte précis est exigé (l'approbation doit viser une Page ou une organisation)` };
    }
    const revoquee = this.verifierRevocations(charge, attendu);
    if (!revoquee.ok) return revoquee;
    return { ok: true, charge };
  }

  /**
   * Contrôle de la liste de révocation `arv1` présentée avec la preuve : présente, signée par une clé d'approbation, de
   * la bonne forme, fraîche (5 minutes), de la même entreprise que la preuve (quand la preuve en porte une), et qui ne
   * liste ni la diffusion, ni la clé, ni la décision de la preuve.
   */
  private verifierRevocations(charge: ChargePreuve, attendu: AttenduPreuve): { ok: true } | { ok: false; motif: string } {
    const liste = attendu.revocations;
    if (liste === undefined || liste.trim() === "") {
      return { ok: false, motif: "aucune liste de révocation récente n'accompagne la demande : la lire auprès du plugin (GET /preuves/revocations) juste avant l'appel et la joindre dans revocations_approbation" };
    }
    const lue = this.lireSignee(liste, PREFIXE_REVOCATIONS, "la liste de révocation");
    if (!lue.ok) return lue;
    const l = lue.charge as Partial<ChargeRevocations> | null;
    const texte = (v: unknown): v is string => typeof v === "string" && v.length >= 1 && v.length <= 200;
    if (
      typeof l !== "object" || l === null || l.v !== 1 || !texte(l.entreprise) || !Number.isInteger(l.emis) || !Array.isArray(l.revoquees) ||
      l.revoquees.length > 10_000 ||
      !l.revoquees.every((r) => typeof r === "object" && r !== null && texte(r.diffusion) && texte(r.cle) && texte(r.decision))
    ) {
      return { ok: false, motif: "liste de révocation incomplète" };
    }
    const emis = l.emis as number;
    if (emis > attendu.maintenantS + DERIVE_HORLOGE_S) return { ok: false, motif: "liste de révocation émise dans le futur" };
    if (attendu.maintenantS - emis > FRAICHEUR_REVOCATIONS_S) {
      return { ok: false, motif: `liste de révocation trop ancienne (plus de ${FRAICHEUR_REVOCATIONS_S / 60} minutes) : la relire auprès du plugin juste avant l'appel` };
    }
    if (charge.entreprise !== undefined && l.entreprise !== charge.entreprise) {
      return { ok: false, motif: "la liste de révocation ne vise pas la même entreprise que la preuve d'approbation" };
    }
    const trouvee = (l.revoquees as ChargeRevocations["revoquees"]).some((r) => r.diffusion === charge.diffusion || r.cle === charge.cle || r.decision === charge.decision);
    if (trouvee) return { ok: false, motif: "preuve d'approbation révoquée : une nouvelle approbation humaine est nécessaire" };
    return { ok: true };
  }
}
