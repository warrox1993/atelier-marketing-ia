// Réglages des fournisseurs réels réseaux sociaux et CRM, lus dans l'environnement.
//
// Rien de secret n'est écrit dans un fichier suivi : identifiants et secrets des applications OAuth
// (Meta, Instagram, LinkedIn, HubSpot, Pipedrive, Teamleader), clé de chiffrement au repos et clé
// publique de vérification des preuves d'approbation viennent de variables d'environnement ou de
// fichiers 0600 désignés par elles (suffixe _FICHIER). Aucune de ces valeurs n'est jamais journalisée.
//
// Un service n'est servi en réel que si sa configuration est complète :
//   facebook   : PASSERELLE_META_CLIENT_ID + PASSERELLE_META_CLIENT_SECRET
//   instagram  : PASSERELLE_INSTAGRAM_CLIENT_ID + PASSERELLE_INSTAGRAM_CLIENT_SECRET (identifiant d'app Instagram)
//   linkedin   : PASSERELLE_LINKEDIN_CLIENT_ID + PASSERELLE_LINKEDIN_CLIENT_SECRET
//   crm        : PASSERELLE_HUBSPOT_CLIENT_ID + PASSERELLE_HUBSPOT_CLIENT_SECRET
//   teamleader : PASSERELLE_TEAMLEADER_CLIENT_ID + PASSERELLE_TEAMLEADER_CLIENT_SECRET
//   pipedrive  : toujours (jeton d'API personnel du client) ; OAuth en plus si PASSERELLE_PIPEDRIVE_CLIENT_ID/SECRET
//   odoo       : toujours (adresse de l'instance + clé d'API du client)
// Et, pour tous : PASSERELLE_SOCIAL_CLE (32 octets en base64, ou _FICHIER).

import { createPublicKey, type KeyObject } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { lireRedirectionsPermises } from "../../garde-oauth.js";

export const SERVICES_SOCIAL_CRM_REELS = ["facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"] as const;
export type ServiceSocialCrm = (typeof SERVICES_SOCIAL_CRM_REELS)[number];

/** Versions d'API retenues (documentation consultée le 15/10/2026, voir docs/passerelle.md). */
export const VERSION_GRAPH_META = "v26.0";
export const VERSION_LINKEDIN = "202610";

/** Adresses des plateformes. Valeurs réelles par défaut ; un faux serveur local les remplace en test. */
export interface AdressesSocialCrm {
  /** Boîte de dialogue Facebook Login : https://www.facebook.com/v26.0/dialog/oauth */
  metaDialogue: string;
  /** API Graph : https://graph.facebook.com (le chemin de version est ajouté par l'appelant). */
  metaGraph: string;
  /** Instagram Login : https://www.instagram.com/oauth/authorize */
  instagramAutorisation: string;
  /** Échange du code Instagram : https://api.instagram.com/oauth/access_token */
  instagramJeton: string;
  /** API Instagram (connexion Instagram) : https://graph.instagram.com */
  instagramGraph: string;
  linkedinAutorisation: string;
  linkedinJeton: string;
  /** https://api.linkedin.com */
  linkedinApi: string;
  hubspotAutorisation: string;
  /** https://api.hubspot.com/oauth/v3/token */
  hubspotJeton: string;
  /** https://api.hubapi.com */
  hubspotApi: string;
  pipedriveAutorisation: string;
  pipedriveJeton: string;
  /** Gabarit de domaine d'une société Pipedrive : https://{societe}.pipedrive.com */
  pipedriveSociete: (societe: string) => string;
  teamleaderAutorisation: string;
  teamleaderJeton: string;
  /** https://api.focus.teamleader.eu */
  teamleaderApi: string;
}

export const ADRESSES_SOCIAL_CRM: AdressesSocialCrm = {
  metaDialogue: `https://www.facebook.com/${VERSION_GRAPH_META}/dialog/oauth`,
  metaGraph: "https://graph.facebook.com",
  instagramAutorisation: "https://www.instagram.com/oauth/authorize",
  instagramJeton: "https://api.instagram.com/oauth/access_token",
  instagramGraph: "https://graph.instagram.com",
  linkedinAutorisation: "https://www.linkedin.com/oauth/v2/authorization",
  linkedinJeton: "https://www.linkedin.com/oauth/v2/accessToken",
  linkedinApi: "https://api.linkedin.com",
  hubspotAutorisation: "https://app.hubspot.com/oauth/authorize",
  hubspotJeton: "https://api.hubspot.com/oauth/v3/token",
  hubspotApi: "https://api.hubapi.com",
  pipedriveAutorisation: "https://oauth.pipedrive.com/oauth/authorize",
  pipedriveJeton: "https://oauth.pipedrive.com/oauth/token",
  pipedriveSociete: (societe) => `https://${societe}.pipedrive.com`,
  teamleaderAutorisation: "https://focus.teamleader.eu/oauth2/authorize",
  teamleaderJeton: "https://focus.teamleader.eu/oauth2/access_token",
  teamleaderApi: "https://api.focus.teamleader.eu",
};

/** Toutes les plateformes sur un seul faux serveur local, un préfixe de chemin par hôte imité (essais seulement). */
export function adressesFaussesSocialCrm(base: string): AdressesSocialCrm {
  const b = base.replace(/\/+$/, "");
  return {
    metaDialogue: `${b}/facebook-www/${VERSION_GRAPH_META}/dialog/oauth`,
    metaGraph: `${b}/meta-graph`,
    instagramAutorisation: `${b}/instagram-www/oauth/authorize`,
    instagramJeton: `${b}/instagram-api/oauth/access_token`,
    instagramGraph: `${b}/instagram-graph`,
    linkedinAutorisation: `${b}/linkedin-www/oauth/v2/authorization`,
    linkedinJeton: `${b}/linkedin-www/oauth/v2/accessToken`,
    linkedinApi: `${b}/linkedin-api`,
    hubspotAutorisation: `${b}/hubspot-app/oauth/authorize`,
    hubspotJeton: `${b}/hubspot-api/oauth/v3/token`,
    hubspotApi: `${b}/hubspot-api`,
    pipedriveAutorisation: `${b}/pipedrive-oauth/oauth/authorize`,
    pipedriveJeton: `${b}/pipedrive-oauth/oauth/token`,
    pipedriveSociete: (societe) => `${b}/pipedrive-societe/${societe}`,
    teamleaderAutorisation: `${b}/teamleader-www/oauth2/authorize`,
    teamleaderJeton: `${b}/teamleader-www/oauth2/access_token`,
    teamleaderApi: `${b}/teamleader-api`,
  };
}

export interface IdentifiantsApplication {
  clientId: string;
  clientSecret: string;
}

export interface ConfigSocialCrmReel {
  /** Clé AES-256 (32 octets) qui chiffre au repos les jetons et clés des plateformes. */
  cle: Buffer;
  /** Fichier d'état (clients DCR, octrois chiffrés, empreintes de jetons, journal des mutations), 0600. */
  fichierEtat: string;
  /** Port du serveur d'autorisation social et CRM (boucle locale). */
  portAutorisation: number;
  adresses: AdressesSocialCrm;
  /** Vrai quand les adresses pointent vers un faux serveur local (journalisé en avertissement). */
  essai: boolean;
  applications: Partial<Record<"facebook" | "instagram" | "linkedin" | "crm" | "pipedrive" | "teamleader", IdentifiantsApplication>>;
  /** Clé publique Ed25519 (PEM SPKI) du plugin de l'atelier ; sans elle, aucune mutation n'est jamais exécutée. */
  clePubliqueApprobation: string | null;
  /** Attente maximale acceptée sur une limite de débit avant un unique nouvel essai (lectures seulement), en ms. */
  attenteQuotaMaxMs: number;
  /** Délai d'un appel sortant, en ms. */
  delaiAppelMs: number;
  /**
   * Base publique HTTPS du serveur d'autorisation, telle que les plateformes la voient pour l'adresse de retour
   * (PASSERELLE_SOCIAL_URL_RETOUR, par exemple https://atelier.example.be/passerelle-auth). Absente : adresse locale.
   */
  urlRetourPublique: string | null;
  /**
   * Origines HTTPS acceptées comme adresse de redirection des clients (PASSERELLE_REDIRECTIONS_PERMISES), en plus
   * de la boucle locale. Vide ou absent : boucle locale seulement (Paperclip local).
   */
  redirectionsPermises?: readonly string[];
}

export type LectureConfigSocial = { ok: true; config: ConfigSocialCrmReel } | { ok: false; raison: string };

export function lireSecret(env: NodeJS.ProcessEnv, nom: string): string | null {
  const direct = env[nom];
  if (direct !== undefined && direct.trim() !== "") return direct.trim();
  const fichier = env[`${nom}_FICHIER`];
  if (fichier === undefined || fichier.trim() === "") return null;
  const mode = statSync(fichier).mode & 0o077;
  if (mode !== 0) throw new Error(`${nom}_FICHIER : le fichier doit être lisible par son seul propriétaire (chmod 600).`);
  const valeur = readFileSync(fichier, "utf8").trim();
  return valeur === "" ? null : valeur;
}

const PREFIXES_APPLICATIONS = {
  facebook: "PASSERELLE_META",
  instagram: "PASSERELLE_INSTAGRAM",
  linkedin: "PASSERELLE_LINKEDIN",
  crm: "PASSERELLE_HUBSPOT",
  pipedrive: "PASSERELLE_PIPEDRIVE",
  teamleader: "PASSERELLE_TEAMLEADER",
} as const;

/** Services réellement servis par une configuration : ceux dont l'application est configurée, plus Odoo et Pipedrive. */
export function servicesServis(config: ConfigSocialCrmReel): ServiceSocialCrm[] {
  return SERVICES_SOCIAL_CRM_REELS.filter((s) => s === "odoo" || s === "pipedrive" || config.applications[s] !== undefined);
}

/**
 * Valide et normalise PASSERELLE_APPROBATION_CLE_PUBLIQUE (revue des signatures, section 5) : un ou plusieurs blocs PEM
 * « PUBLIC KEY », OU une clé SPKI DER en base64 par ligne (plusieurs lignes : rotation). Chaque clé doit être lisible et de
 * type Ed25519. Renvoie du PEM normalisé. Lève une erreur claire qui ne cite JAMAIS la valeur de la clé.
 */
export function normaliserClePubliqueApprobation(valeur: string): string {
  const nom = "PASSERELLE_APPROBATION_CLE_PUBLIQUE";
  const enPem = (der: Buffer): string => `-----BEGIN PUBLIC KEY-----\n${der.toString("base64").replace(/(.{64})/g, "$1\n").replace(/\n$/, "")}\n-----END PUBLIC KEY-----\n`;
  const lire = (cle: () => KeyObject): Buffer => {
    let objet: KeyObject;
    try {
      objet = cle();
    } catch {
      throw new Error(`${nom} illisible : une clé publique Ed25519 est attendue (PEM « PUBLIC KEY », ou SPKI DER en base64 sur une ligne).`);
    }
    if (objet.type !== "public" || objet.asymmetricKeyType !== "ed25519") throw new Error(`${nom} : une clé publique Ed25519 est attendue.`);
    return objet.export({ type: "spki", format: "der" });
  };
  const v = valeur.trim();
  if (v.includes("-----")) {
    const blocs = v.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g) ?? [];
    // Rien d'autre que des blocs « PUBLIC KEY » (pas de certificat, de clé privée ni de texte parasite).
    if (blocs.length === 0 || v.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g, "").trim() !== "") {
      throw new Error(`${nom} illisible : seuls des blocs PEM « PUBLIC KEY » sont acceptés.`);
    }
    return blocs.map((b) => enPem(lire(() => createPublicKey(b)))).join("");
  }
  const lignes = v.split(/\s+/).filter((l) => l !== "");
  return lignes
    .map((ligne) => {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ligne)) throw new Error(`${nom} illisible : une clé en base64 (SPKI DER) par ligne est attendue.`);
      return enPem(lire(() => createPublicKey({ key: Buffer.from(ligne, "base64"), format: "der", type: "spki" })));
    })
    .join("");
}

/** Lit la configuration réseaux sociaux et CRM du mode réel. */
export function lireConfigSocialCrm(env: NodeJS.ProcessEnv, fichierEtatParDefaut: string): LectureConfigSocial {
  try {
    const cleBrute = lireSecret(env, "PASSERELLE_SOCIAL_CLE");
    if (!cleBrute) return { ok: false, raison: "clé de chiffrement absente (PASSERELLE_SOCIAL_CLE ou PASSERELLE_SOCIAL_CLE_FICHIER, 32 octets en base64)" };
    const cle = Buffer.from(cleBrute, "base64");
    if (cle.length !== 32) return { ok: false, raison: "PASSERELLE_SOCIAL_CLE doit contenir exactement 32 octets encodés en base64" };

    const portTexte = env["PASSERELLE_SOCIAL_PORT_AUTORISATION"]?.trim() || "3193";
    if (!/^\d{1,5}$/.test(portTexte) || Number(portTexte) > 65535) return { ok: false, raison: `port d'autorisation invalide : « ${portTexte} »` };

    let adresses = ADRESSES_SOCIAL_CRM;
    let essai = false;
    const faux = env["PASSERELLE_SOCIAL_FAUX_URL"]?.trim();
    if (faux) {
      const url = new URL(faux);
      if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) {
        return { ok: false, raison: "PASSERELLE_SOCIAL_FAUX_URL n'accepte qu'un faux serveur de la boucle locale (http://127.0.0.1:<port>)" };
      }
      adresses = adressesFaussesSocialCrm(faux);
      essai = true;
    }

    const applications: ConfigSocialCrmReel["applications"] = {};
    for (const [service, prefixe] of Object.entries(PREFIXES_APPLICATIONS) as [keyof typeof PREFIXES_APPLICATIONS, string][]) {
      const clientId = env[`${prefixe}_CLIENT_ID`]?.trim() ?? "";
      const clientSecret = lireSecret(env, `${prefixe}_CLIENT_SECRET`);
      if (clientId && clientSecret) applications[service] = { clientId, clientSecret };
    }

    const brute = lireSecret(env, "PASSERELLE_APPROBATION_CLE_PUBLIQUE");
    const clePubliqueApprobation = brute ? normaliserClePubliqueApprobation(brute) : null;

    let urlRetourPublique: string | null = null;
    const retour = env["PASSERELLE_SOCIAL_URL_RETOUR"]?.trim();
    if (retour) {
      const u = new URL(retour);
      const locale = ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname);
      if (u.protocol !== "https:" && !(u.protocol === "http:" && locale)) return { ok: false, raison: "PASSERELLE_SOCIAL_URL_RETOUR doit être une adresse HTTPS (ou la boucle locale)" };
      urlRetourPublique = retour.replace(/\/+$/, "");
    }

    return {
      ok: true,
      config: {
        urlRetourPublique,
        cle,
        fichierEtat: env["PASSERELLE_SOCIAL_ETAT"]?.trim() || fichierEtatParDefaut,
        portAutorisation: Number(portTexte),
        adresses,
        essai,
        applications,
        clePubliqueApprobation,
        attenteQuotaMaxMs: 10_000,
        delaiAppelMs: 20_000,
        redirectionsPermises: lireRedirectionsPermises(env),
      },
    };
  } catch (erreur) {
    // Message sans valeur secrète : seuls des noms de variables y figurent.
    return { ok: false, raison: erreur instanceof Error ? erreur.message : "configuration réseaux sociaux et CRM illisible" };
  }
}
