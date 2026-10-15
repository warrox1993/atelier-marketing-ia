// Appels sortants vers les plateformes et traduction de leurs erreurs en messages clairs.
//
// Règles :
//   - le jeton voyage dans l'en-tête Authorization (ou x-api-token pour un jeton d'API Pipedrive), jamais
//     dans l'URL, et rien de ce module n'écrit dans un journal ;
//   - une réponse d'erreur est classée : limite de débit, jeton expiré, permission manquante (dont App
//     Review non obtenue), objet introuvable, requête invalide, indisponibilité ;
//   - un échec réseau ou une réponse 5xx est « indéterminé » : pour une mutation, l'effet a pu avoir lieu.
//
// Formes d'erreur documentées (consultées le 15/10/2026) :
//   Meta     { error: { message, type, code, error_subcode, fbtrace_id } }, codes 4/17/32/613/80001/80002
//            (débit), 190 (jeton), 10 et 200-299 (permission), 100 (paramètre ou objet), 506 (doublon)
//            https://developers.facebook.com/docs/graph-api/guides/error-handling
//            https://developers.facebook.com/docs/graph-api/overview/rate-limiting
//   LinkedIn HTTP 401/403 ACCESS_DENIED/404/429 { status, message, serviceErrorCode }
//            https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
//   HubSpot  { status, message, category, correlationId, policyName? } ; 429 { policyName: DAILY|TEN_SECONDLY_ROLLING }
//            https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines
//   Pipedrive { success: false, error, error_info } ; 429 ; en-têtes x-ratelimit-*
//   Odoo     JSON-2 : 4xx/5xx { name, message, arguments } ; JSON-RPC : 200 { error: { code, message, data } }
//   Teamleader { errors: [{ code?, title, status }] } ; 429 x-ratelimit-reset

import { DestinationRefusee, EchecTransport, envoyerVersDestination, resoudreDestination, type Resolveur } from "./reseau-sur.js";

export type CodeErreur =
  | "limite_debit"
  | "jeton_expire"
  | "permission_manquante"
  | "introuvable"
  | "requete_invalide"
  | "indisponible"
  | "doublon";

export type Plateforme = "meta" | "instagram" | "linkedin" | "hubspot" | "pipedrive" | "odoo" | "teamleader";

const NOMS: Record<Plateforme, string> = {
  meta: "Facebook (Meta)",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  hubspot: "HubSpot",
  pipedrive: "Pipedrive",
  odoo: "Odoo",
  teamleader: "Teamleader",
};

/** Erreur présentée à l'agent : code stable entre crochets, puis une explication en français. Jamais de jeton. */
export class ErreurFournisseur extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
    /** Délai d'attente conseillé (limite de débit), en millisecondes. */
    readonly attenteMs: number | null = null,
    /** Vrai quand la requête n'a certainement produit aucun effet chez la plateforme. */
    readonly sansEffet: boolean = true,
  ) {
    super(`[${code}] ${message}`);
  }
}

export interface RequeteHttp {
  methode: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  /** En-têtes supplémentaires (Linkedin-Version, X-Odoo-Database...). */
  entetes?: Record<string, string>;
  /** Corps JSON (objet) ou formulaire (URLSearchParams). */
  corps?: unknown;
  /** Autorisation : jeton porteur, jeton d'API Pipedrive, ou rien (échanges OAuth). */
  auth?: { type: "bearer"; jeton: string } | { type: "pipedrive_api"; jeton: string } | { type: "basic"; utilisateur: string; secret: string };
  /**
   * Adresse SAISIE par un client (instance Odoo) : résolution DNS unique, adresses publiques seulement, connexion à
   * l'adresse vérifiée, aucune redirection (reseau-sur.ts, revue S4). `essai` : boucle locale HTTP permise (tests).
   */
  adresseSaisie?: { essai: boolean; resoudre?: Resolveur };
}

export interface ReponseHttp {
  statut: number;
  entetes: Headers;
  json: unknown;
}

/** Envoie une requête ; lève ErreurFournisseur(« indisponible », sansEffet=false) sur échec réseau ou délai dépassé. */
export async function envoyer(requete: RequeteHttp, plateforme: Plateforme, delaiMs: number): Promise<ReponseHttp> {
  const entetes: Record<string, string> = { accept: "application/json", "user-agent": "atelier-marketing-passerelle/0.1", ...(requete.entetes ?? {}) };
  if (requete.auth?.type === "bearer") entetes["authorization"] = `Bearer ${requete.auth.jeton}`;
  else if (requete.auth?.type === "pipedrive_api") entetes["x-api-token"] = requete.auth.jeton;
  else if (requete.auth?.type === "basic") entetes["authorization"] = `Basic ${Buffer.from(`${requete.auth.utilisateur}:${requete.auth.secret}`).toString("base64")}`;
  let corps: string | URLSearchParams | undefined;
  if (requete.corps instanceof URLSearchParams) {
    corps = requete.corps;
    entetes["content-type"] = "application/x-www-form-urlencoded";
  } else if (requete.corps !== undefined) {
    corps = JSON.stringify(requete.corps);
    entetes["content-type"] = "application/json; charset=utf-8";
  }
  let statut: number;
  let entetesReponse: Headers;
  let texte: string;
  if (requete.adresseSaisie) {
    let destination;
    try {
      destination = await resoudreDestination(new URL(requete.url), requete.adresseSaisie.essai, requete.adresseSaisie.resoudre);
    } catch (e) {
      // Refus AVANT toute connexion : aucun effet possible.
      if (e instanceof DestinationRefusee) throw new ErreurFournisseur(e.motif === "introuvable" ? "introuvable" : "requete_invalide", `${NOMS[plateforme]} : ${e.message}`);
      throw new ErreurFournisseur("requete_invalide", `${NOMS[plateforme]} : adresse invalide.`);
    }
    try {
      const brute = await envoyerVersDestination(
        { methode: requete.methode, url: requete.url, entetes, ...(corps !== undefined ? { corps: corps.toString() } : {}), delaiMs },
        destination,
      );
      ({ statut, entetes: entetesReponse, texte } = brute);
    } catch (e) {
      const detail = e instanceof EchecTransport ? e.message : "réseau ou délai dépassé";
      throw new ErreurFournisseur("indisponible", `${NOMS[plateforme]} ne répond pas (${detail}).`, null, false);
    }
  } else {
    let reponse: Response;
    try {
      reponse = await fetch(requete.url, { method: requete.methode, headers: entetes, ...(corps !== undefined ? { body: corps } : {}), redirect: "error", signal: AbortSignal.timeout(delaiMs) });
    } catch {
      throw new ErreurFournisseur("indisponible", `${NOMS[plateforme]} ne répond pas (réseau ou délai dépassé).`, null, false);
    }
    statut = reponse.status;
    entetesReponse = reponse.headers;
    texte = await reponse.text();
  }
  let json: unknown = null;
  if (texte !== "") {
    try {
      json = JSON.parse(texte);
    } catch {
      json = null;
    }
  }
  return { statut, entetes: entetesReponse, json };
}

const objet = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Attente conseillée par les en-têtes : Retry-After (secondes), x-ratelimit-reset (secondes ou date), utilisation Meta. */
function attenteConseillee(entetes: Headers): number | null {
  const apres = entetes.get("retry-after");
  if (apres && /^\d+$/.test(apres.trim())) return Number(apres.trim()) * 1000;
  const reset = entetes.get("x-ratelimit-reset");
  if (reset) {
    if (/^\d+$/.test(reset.trim())) return Number(reset.trim()) * 1000;
    const date = Date.parse(reset);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  const buc = entetes.get("x-business-use-case-usage");
  if (buc) {
    try {
      // { "<id>": [{ type, call_count, total_cputime, total_time, estimated_time_to_regain_access (minutes) }] }
      for (const liste of Object.values(objet(JSON.parse(buc)))) {
        for (const ligne of Array.isArray(liste) ? liste : []) {
          const minutes = Number(objet(ligne)["estimated_time_to_regain_access"]);
          if (Number.isFinite(minutes) && minutes > 0) return minutes * 60_000;
        }
      }
    } catch {
      // en-tête illisible : pas de délai conseillé
    }
  }
  return null;
}

function texteAttente(ms: number | null): string {
  if (ms === null) return "réessayer plus tard";
  const s = Math.ceil(ms / 1000);
  return s < 120 ? `réessayer dans ${s} s` : `réessayer dans ${Math.ceil(s / 60)} min`;
}

const CODES_DEBIT_META = new Set([4, 17, 32, 613, 80001, 80002, 80006]);

/** Lève l'erreur qui correspond à une réponse non réussie ; ne fait rien si la réponse est un succès. */
export function verifierReponse(reponse: ReponseHttp, plateforme: Plateforme, cible: string): void {
  const nom = NOMS[plateforme];
  const corps = objet(reponse.json);
  // Odoo JSON-RPC : statut 200 mais objet `error`.
  const erreurRpc = plateforme === "odoo" ? objet(corps["error"]) : {};
  if (reponse.statut >= 200 && reponse.statut < 300 && Object.keys(erreurRpc).length === 0) {
    if (plateforme === "pipedrive" && corps["success"] === false) {
      throw new ErreurFournisseur("requete_invalide", `${nom} a refusé la requête sur ${cible} : ${String(corps["error"] ?? "erreur sans message")}.`);
    }
    return;
  }

  const attente = attenteConseillee(reponse.entetes);
  if (plateforme === "meta" || plateforme === "instagram") {
    const e = objet(corps["error"]);
    const code = Number(e["code"]);
    const sous = Number(e["error_subcode"]);
    const message = String(e["message"] ?? "");
    if (CODES_DEBIT_META.has(code) || reponse.statut === 429) {
      throw new ErreurFournisseur("limite_debit", `Limite de débit atteinte chez ${nom} (code ${code}) : ${texteAttente(attente)}.`, attente);
    }
    if (code === 190 || reponse.statut === 401) {
      const detail = sous === 463 ? "jeton expiré" : sous === 460 ? "mot de passe changé" : sous === 458 ? "application retirée par l'utilisateur" : "jeton invalide";
      throw new ErreurFournisseur("jeton_expire", `Autorisation ${nom} refusée (${detail}) : reconnectez le service dans Paperclip (Apps).`);
    }
    if (code === 10 || (code >= 200 && code <= 299)) {
      throw new ErreurFournisseur(
        "permission_manquante",
        `Permission refusée par ${nom} sur ${cible} (code ${code} : ${message}). Soit la permission n'a pas été accordée à la connexion ` +
          "(la refaire en cochant tout), soit l'application de l'atelier n'a pas obtenu l'accès avancé à cette permission par l'App Review de Meta " +
          "(démarche d'opérateur, docs/passerelle.md).",
      );
    }
    if (code === 506) throw new ErreurFournisseur("doublon", `${nom} refuse une publication identique à une publication récente (code 506).`);
    if (code === 100 && (sous === 33 || /does not exist|cannot be loaded/i.test(message))) {
      throw new ErreurFournisseur("introuvable", `Introuvable chez ${nom} : ${cible} (objet inexistant ou non accessible avec cette connexion).`);
    }
    if (reponse.statut >= 500 || code === 1 || code === 2) {
      throw new ErreurFournisseur("indisponible", `${nom} est momentanément indisponible (code ${code || reponse.statut}).`, attente, false);
    }
    throw new ErreurFournisseur("requete_invalide", `${nom} a refusé la requête sur ${cible} (code ${code || reponse.statut} : ${message || "sans message"}).`);
  }

  const messageBrut = (() => {
    if (plateforme === "odoo") {
      const d = objet(erreurRpc["data"]);
      return String(d["message"] ?? erreurRpc["message"] ?? corps["message"] ?? "");
    }
    if (plateforme === "teamleader") {
      const premiere = objet(Array.isArray(corps["errors"]) ? corps["errors"][0] : undefined);
      return String(premiere["title"] ?? premiere["detail"] ?? "");
    }
    if (plateforme === "pipedrive") return String(corps["error"] ?? "");
    return String(corps["message"] ?? "");
  })().slice(0, 300);
  const nomOdoo = plateforme === "odoo" ? String(objet(erreurRpc["data"])["name"] ?? corps["name"] ?? "") : "";

  if (reponse.statut === 429) {
    const politique = plateforme === "hubspot" && corps["policyName"] ? ` (${String(corps["policyName"])})` : "";
    throw new ErreurFournisseur("limite_debit", `Limite de débit atteinte chez ${nom}${politique} : ${texteAttente(attente)}.`, attente);
  }
  if (reponse.statut === 401 || /AccessDenied|Invalid apikey|SessionExpired/i.test(nomOdoo + messageBrut)) {
    throw new ErreurFournisseur("jeton_expire", `Autorisation ${nom} refusée (jeton ou clé expiré, révoqué ou invalide) : reconnectez le service dans Paperclip (Apps).`);
  }
  if (reponse.statut === 403 || /AccessError/.test(nomOdoo)) {
    const conseil =
      plateforme === "linkedin"
        ? " Vérifier que l'application LinkedIn de l'atelier a l'accès Community Management approuvé et que la personne connectée est administratrice de la page."
        : plateforme === "hubspot"
          ? " La connexion n'a pas la portée nécessaire (refaire la connexion avec la méthode « publication »)."
          : " Vérifier les droits de l'utilisateur connecté dans la plateforme.";
    throw new ErreurFournisseur("permission_manquante", `Permission refusée par ${nom} sur ${cible}${messageBrut ? ` (${messageBrut})` : ""}.${conseil}`);
  }
  if (reponse.statut === 404 || /MissingError/.test(nomOdoo)) {
    throw new ErreurFournisseur("introuvable", `Introuvable chez ${nom} : ${cible}.`);
  }
  if (reponse.statut >= 500 || reponse.statut === 408) {
    throw new ErreurFournisseur("indisponible", `${nom} est momentanément indisponible (HTTP ${reponse.statut}).`, attente, false);
  }
  throw new ErreurFournisseur("requete_invalide", `${nom} a refusé la requête sur ${cible} (HTTP ${reponse.statut}${messageBrut ? ` : ${messageBrut}` : ""}).`);
}
