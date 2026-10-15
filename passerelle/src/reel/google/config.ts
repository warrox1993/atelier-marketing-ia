// Réglages du fournisseur Google réel (lot L4), lus dans l'environnement.
//
// Rien de secret n'est écrit dans un fichier suivi : l'identifiant et le secret du
// client OAuth Google et la clé de chiffrement viennent de variables d'environnement
// ou de fichiers 0600 désignés par elles.
// Aucune de ces valeurs n'est jamais journalisée.

import { readFileSync, statSync } from "node:fs";
import { lireRedirectionsPermises } from "../../garde-oauth.js";

/** Version de l'API Google Ads (point d'entrée REST relevé le 15/10/2026 : developers.google.com/google-ads/api/rest/common/search). */
export const VERSION_API_ADS = "v26";

/** Adresses des services Google. Valeurs réelles par défaut ; un faux Google local les remplace en test. */
export interface AdressesGoogle {
  /** Point d'autorisation (navigateur). */
  autorisation: string;
  /** Point de jeton (code et rafraîchissement). */
  jeton: string;
  /** Search Console : https://www.googleapis.com (…/webmasters/v3/sites/{siteUrl}/searchAnalytics/query). */
  gsc: string;
  /** GA4 Data API : https://analyticsdata.googleapis.com (…/v1beta/{property}:runReport). */
  ga4: string;
  /** Google Ads : https://googleads.googleapis.com (…/v26/customers/{id}/googleAds:search). */
  ads: string;
  /** Avis v4 : https://mybusiness.googleapis.com (…/v4/{parent}/reviews). */
  avis: string;
  /** Business Profile Performance : https://businessprofileperformance.googleapis.com. */
  performance: string;
}

/** Adresses documentées (métadonnées https://accounts.google.com/.well-known/openid-configuration lues le 15/10/2026). */
export const ADRESSES_GOOGLE: AdressesGoogle = {
  autorisation: "https://accounts.google.com/o/oauth2/v2/auth",
  jeton: "https://oauth2.googleapis.com/token",
  gsc: "https://www.googleapis.com",
  ga4: "https://analyticsdata.googleapis.com",
  ads: "https://googleads.googleapis.com",
  avis: "https://mybusiness.googleapis.com",
  performance: "https://businessprofileperformance.googleapis.com",
};

/** Toutes les adresses sur un seul faux serveur local (essais seulement). */
export function adressesFaussesGoogle(base: string): AdressesGoogle {
  const b = base.replace(/\/+$/, "");
  return { autorisation: `${b}/o/oauth2/v2/auth`, jeton: `${b}/token`, gsc: b, ga4: b, ads: b, avis: b, performance: b };
}

export interface ConfigGoogleReel {
  clientId: string;
  clientSecret: string;
  /** Clé AES-256 (32 octets) qui chiffre les jetons de rafraîchissement Google au repos. */
  cle: Buffer;
  /** Fichier d'état (clients DCR, octrois chiffrés, empreintes de jetons), 0600. */
  fichierEtat: string;
  /** Port du serveur d'autorisation de la passerelle (boucle locale). */
  portAutorisation: number;
  adresses: AdressesGoogle;
  /** Vrai quand les adresses pointent vers un faux Google local (journalisé en avertissement). */
  essai: boolean;
  /** Google Ads : compte administrateur (MCC) par lequel on accède aux comptes clients, chiffres seulement. */
  adsLoginCustomerId: string | null;
  /** Attente maximale acceptée sur un quota (429) avant un unique nouvel essai, en millisecondes. */
  attenteQuotaMaxMs: number;
  /**
   * Origines HTTPS acceptées comme adresse de redirection des clients (PASSERELLE_REDIRECTIONS_PERMISES), en plus
   * de la boucle locale. Vide ou absent : boucle locale seulement (Paperclip local).
   */
  redirectionsPermises?: readonly string[];
}

/** Résultat de lecture : configuration complète, ou raison claire (le mode réel n'expose alors pas Google). */
export type LectureConfig = { ok: true; config: ConfigGoogleReel } | { ok: false; raison: string };

function lireSecret(env: NodeJS.ProcessEnv, nom: string): string | null {
  const direct = env[nom];
  if (direct !== undefined && direct.trim() !== "") return direct.trim();
  const fichier = env[`${nom}_FICHIER`];
  if (fichier === undefined || fichier.trim() === "") return null;
  const mode = statSync(fichier).mode & 0o077;
  if (mode !== 0) throw new Error(`${nom}_FICHIER : le fichier doit être lisible par son seul propriétaire (chmod 600).`);
  const valeur = readFileSync(fichier, "utf8").trim();
  return valeur === "" ? null : valeur;
}

/**
 * Lit la configuration Google du mode réel.
 * Obligatoires : PASSERELLE_GOOGLE_CLIENT_ID, PASSERELLE_GOOGLE_CLIENT_SECRET (ou _FICHIER),
 * PASSERELLE_GOOGLE_CLE (32 octets en base64, ou _FICHIER).
 * Facultatifs : PASSERELLE_GOOGLE_PORT_AUTORISATION (3192), PASSERELLE_GOOGLE_ETAT,
 * PASSERELLE_GOOGLE_ADS_LOGIN_CUSTOMER_ID, PASSERELLE_REDIRECTIONS_PERMISES (origines HTTPS de Paperclip, hors boucle locale),
 * PASSERELLE_GOOGLE_FAUX_URL (ESSAIS SEULEMENT : faux Google local en http://127.0.0.1).
 */
export function lireConfigGoogle(env: NodeJS.ProcessEnv, fichierEtatParDefaut: string): LectureConfig {
  try {
    const clientId = env["PASSERELLE_GOOGLE_CLIENT_ID"]?.trim() ?? "";
    const clientSecret = lireSecret(env, "PASSERELLE_GOOGLE_CLIENT_SECRET");
    const cleBrute = lireSecret(env, "PASSERELLE_GOOGLE_CLE");
    if (!clientId || !clientSecret) {
      return { ok: false, raison: "client OAuth Google non configuré (PASSERELLE_GOOGLE_CLIENT_ID et PASSERELLE_GOOGLE_CLIENT_SECRET)" };
    }
    if (!cleBrute) return { ok: false, raison: "clé de chiffrement absente (PASSERELLE_GOOGLE_CLE ou PASSERELLE_GOOGLE_CLE_FICHIER, 32 octets en base64)" };
    const cle = Buffer.from(cleBrute, "base64");
    if (cle.length !== 32) return { ok: false, raison: "PASSERELLE_GOOGLE_CLE doit contenir exactement 32 octets encodés en base64" };

    const portTexte = env["PASSERELLE_GOOGLE_PORT_AUTORISATION"]?.trim() || "3192";
    if (!/^\d{1,5}$/.test(portTexte) || Number(portTexte) > 65535) return { ok: false, raison: `port d'autorisation invalide : « ${portTexte} »` };

    let adresses = ADRESSES_GOOGLE;
    let essai = false;
    const faux = env["PASSERELLE_GOOGLE_FAUX_URL"]?.trim();
    if (faux) {
      const url = new URL(faux);
      if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) {
        return { ok: false, raison: "PASSERELLE_GOOGLE_FAUX_URL n'accepte qu'un faux serveur de la boucle locale (http://127.0.0.1:<port>)" };
      }
      adresses = adressesFaussesGoogle(faux);
      essai = true;
    }

    const loginCustomer = env["PASSERELLE_GOOGLE_ADS_LOGIN_CUSTOMER_ID"]?.replace(/-/g, "").trim() || null;
    if (loginCustomer !== null && !/^\d{10}$/.test(loginCustomer)) {
      return { ok: false, raison: "PASSERELLE_GOOGLE_ADS_LOGIN_CUSTOMER_ID : 10 chiffres attendus (tirets tolérés)" };
    }

    return {
      ok: true,
      config: {
        clientId,
        clientSecret,
        cle,
        fichierEtat: env["PASSERELLE_GOOGLE_ETAT"]?.trim() || fichierEtatParDefaut,
        portAutorisation: Number(portTexte),
        adresses,
        essai,
        adsLoginCustomerId: loginCustomer,
        attenteQuotaMaxMs: 10_000,
        redirectionsPermises: lireRedirectionsPermises(env),
      },
    };
  } catch (erreur) {
    // Message sans valeur secrète : seuls des noms de variables y figurent.
    return { ok: false, raison: erreur instanceof Error ? erreur.message : "configuration Google illisible" };
  }
}
