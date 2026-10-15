// Appel d'une API Google avec gestion des erreurs réelles (lot L4).
//
// Règles (pas de réessai aveugle) :
//   - 401 : le jeton d'accès Google est renouvelé UNE fois par le jeton de rafraîchissement, puis la requête
//     est rejouée une fois ; si Google refuse encore, l'erreur est rendue.
//   - 429 (quota) : UN seul nouvel essai, seulement si l'attente annoncée par Google (en-tête Retry-After, ou
//     détail google.rpc.RetryInfo / retryDelay) est connue et bornée (10 s par défaut). Sinon l'erreur est
//     rendue avec le délai annoncé.
//   - 403 : « la propriété n'est pas accessible avec ce compte » (ou API non activée, projet Google
//     Cloud sans accès Ads de production, selon le motif de Google) ; 404 : propriété introuvable ; 400 : requête refusée.
//   - aucune autre erreur n'est rejouée.
// Format d'erreur des API Google : { error: { code, message, status, details[] } }
// (https://cloud.google.com/apis/design/errors, consulté le 15/10/2026) ; Search Console v3 garde l'ancien
// format { error: { code, message, errors: [{ reason }] } } ; Google Ads ajoute un détail GoogleAdsFailure
// (https://developers.google.com/google-ads/api/docs/get-started/handle-errors ; motifs : reference/rpc/v26/AuthorizationErrorEnum.AuthorizationError,
// QuotaErrorEnum.QuotaError, QuotaErrorDetails.retry_delay).
// Jamais de jeton dans un message : ni l'en-tête Authorization ni la requête ne sont recopiés.

import { ErreurAutorisation } from "./autorisation.js";

export type MotifErreurGoogle =
  | "quota"
  | "acces_refuse"
  | "api_non_activee"
  | "niveau_acces_ads"
  | "introuvable"
  | "requete_invalide"
  | "autorisation"
  | "indisponible";

export class ErreurGoogle extends Error {
  constructor(readonly motif: MotifErreurGoogle, message: string, readonly statut: number | null = null) {
    super(message);
  }
}

export interface RequeteGoogle {
  methode: "GET" | "POST";
  url: string;
  corps?: unknown;
  entetes?: Record<string, string>;
  /** Ce que désigne la requête, pour un message clair (« la propriété sc-domain:exemple.be »). */
  cible: string;
}

export interface Jetons {
  /** Jeton d'accès Google courant ; `forcer` : le précédent a été refusé, le renouveler. */
  obtenir(forcer: boolean): Promise<string>;
}

export interface OptionsAppel {
  attenteQuotaMaxMs: number;
  /** Attente (tests : remplaçable). */
  attendre?: (ms: number) => Promise<void>;
  delaiMs?: number;
}

const attendreParDefaut = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface CorpsErreur {
  code?: number;
  message?: string;
  status?: string;
  details?: Array<Record<string, unknown>>;
  errors?: Array<{ reason?: string; message?: string }>;
}

function lireErreur(json: unknown): CorpsErreur {
  if (typeof json === "object" && json !== null && "error" in json) {
    const e = (json as { error: unknown }).error;
    if (typeof e === "object" && e !== null) return e as CorpsErreur;
  }
  return {};
}

/** Durée « 30s » ou « 1.5s » (google.protobuf.Duration en JSON) → millisecondes. */
function dureeVersMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

/** Attente annoncée par Google pour un 429 : Retry-After (secondes), RetryInfo.retryDelay, ou quotaErrorDetails.retryDelay (Ads). */
export function attenteAnnoncee(entete: string | null, erreur: CorpsErreur): number | null {
  if (entete && /^\d+$/.test(entete.trim())) return Number(entete.trim()) * 1000;
  for (const d of erreur.details ?? []) {
    const direct = dureeVersMs(d["retryDelay"]);
    if (direct !== null) return direct;
    for (const e of (d["errors"] as Array<Record<string, unknown>> | undefined) ?? []) {
      const q = e["details"] as Record<string, unknown> | undefined;
      const qd = q?.["quotaErrorDetails"] as Record<string, unknown> | undefined;
      const ms = dureeVersMs(qd?.["retryDelay"]);
      if (ms !== null) return ms;
    }
  }
  return null;
}

/** Motifs (ErrorInfo.reason, anciens errors[].reason, codes d'erreur Google Ads) présents dans l'erreur. */
function motifs(erreur: CorpsErreur): string[] {
  const liste: string[] = [];
  for (const e of erreur.errors ?? []) if (e.reason) liste.push(e.reason);
  for (const d of erreur.details ?? []) {
    if (typeof d["reason"] === "string") liste.push(d["reason"]);
    for (const e of (d["errors"] as Array<Record<string, unknown>> | undefined) ?? []) {
      const code = e["errorCode"] as Record<string, unknown> | undefined;
      for (const v of Object.values(code ?? {})) if (typeof v === "string") liste.push(v);
    }
  }
  return liste;
}

/** Message de Google, tronqué, sans saut de ligne (il ne contient jamais le jeton : Google ne le renvoie pas). */
function messageGoogle(erreur: CorpsErreur): string {
  const m = (erreur.message ?? "").replace(/\s+/g, " ").trim();
  return m.length > 300 ? `${m.slice(0, 300)}…` : m;
}

export function traduireErreur(statut: number, erreur: CorpsErreur, cible: string, attenteMs: number | null): ErreurGoogle {
  const m = motifs(erreur);
  const detail = messageGoogle(erreur);
  const suffixe = detail ? ` (Google : ${detail})` : "";
  const quotas = ["RESOURCE_EXHAUSTED", "RESOURCE_TEMPORARILY_EXHAUSTED", "rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"];
  if (statut === 429 || erreur.status === "RESOURCE_EXHAUSTED" || quotas.some((q) => m.includes(q))) {
    const quand = attenteMs !== null ? `réessayer dans ${Math.ceil(attenteMs / 1000)} s` : "réessayer plus tard";
    return new ErreurGoogle("quota", `Quota Google atteint pour ${cible} : ${quand}.${suffixe}`, statut);
  }
  if (m.includes("CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION") || m.includes("DEVELOPER_TOKEN_NOT_APPROVED")) {
    return new ErreurGoogle("niveau_acces_ads", `Le projet Google Cloud de l'opérateur n'a pas d'accès Google Ads de production pour ${cible} (niveau Explorer, Basic ou Standard à demander dans la console Google Cloud, page « Google Ads API »).${suffixe}`, statut);
  }
  if (statut === 401) {
    return new ErreurGoogle("autorisation", `Google refuse l'autorisation pour ${cible} : reconnectez le service dans Paperclip (Apps).${suffixe}`, statut);
  }
  if (statut === 403) {
    if (m.includes("SERVICE_DISABLED") || m.includes("accessNotConfigured")) {
      return new ErreurGoogle("api_non_activee", `L'API Google n'est pas activée dans le projet Google Cloud de l'opérateur (${cible}).${suffixe}`, statut);
    }
    return new ErreurGoogle("acces_refuse", `La propriété n'est pas accessible avec ce compte : ${cible}.${suffixe}`, statut);
  }
  if (statut === 404) return new ErreurGoogle("introuvable", `Propriété introuvable : ${cible}.${suffixe}`, statut);
  if (statut === 400) {
    if (m.includes("USER_PERMISSION_DENIED") || m.includes("CUSTOMER_NOT_ENABLED") || m.includes("INVALID_LOGIN_CUSTOMER_ID_SERVING_CUSTOMER_ID_COMBINATION")) {
      return new ErreurGoogle("acces_refuse", `La propriété n'est pas accessible avec ce compte : ${cible}.${suffixe}`, statut);
    }
    return new ErreurGoogle("requete_invalide", `Requête refusée par Google pour ${cible}.${suffixe}`, statut);
  }
  return new ErreurGoogle("indisponible", `Google a répondu HTTP ${statut} pour ${cible} ; réessayer plus tard.${suffixe}`, statut);
}

export async function appelerGoogle(requete: RequeteGoogle, jetons: Jetons, options: OptionsAppel): Promise<unknown> {
  const attendre = options.attendre ?? attendreParDefaut;
  let jetonRenouvele = false;
  let quotaRejoue = false;
  let jeton = await jetons.obtenir(false);
  for (;;) {
    let reponse: Response;
    try {
      reponse = await fetch(requete.url, {
        method: requete.methode,
        headers: {
          authorization: `Bearer ${jeton}`,
          accept: "application/json",
          ...(requete.corps !== undefined ? { "content-type": "application/json" } : {}),
          ...requete.entetes,
        },
        ...(requete.corps !== undefined ? { body: JSON.stringify(requete.corps) } : {}),
        signal: AbortSignal.timeout(options.delaiMs ?? 30_000),
      });
    } catch {
      throw new ErreurGoogle("indisponible", `Google ne répond pas pour ${requete.cible} ; réessayer plus tard.`);
    }
    let json: unknown = null;
    const texte = await reponse.text();
    if (texte !== "") {
      try {
        json = JSON.parse(texte);
      } catch {
        json = null;
      }
    }
    if (reponse.ok) {
      if (json === null && texte !== "") throw new ErreurGoogle("indisponible", `Réponse illisible de Google pour ${requete.cible}.`);
      return json ?? {};
    }
    const erreur = lireErreur(json);
    if (reponse.status === 401 && !jetonRenouvele) {
      jetonRenouvele = true;
      try {
        jeton = await jetons.obtenir(true);
      } catch (e) {
        if (e instanceof ErreurAutorisation) throw new ErreurGoogle("autorisation", e.message, 401);
        throw e;
      }
      continue;
    }
    const attente = reponse.status === 429 ? attenteAnnoncee(reponse.headers.get("retry-after"), erreur) : null;
    if (reponse.status === 429 && !quotaRejoue && attente !== null && attente <= options.attenteQuotaMaxMs) {
      quotaRejoue = true;
      await attendre(attente);
      continue;
    }
    throw traduireErreur(reponse.status, erreur, requete.cible, attente);
  }
}
