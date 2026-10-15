// Client HTTP de la Centrale des bilans de la Banque nationale de Belgique (CBSO), produit « Query authentic data »
// (lot P4). Deux opérations seulement, en lecture :
//   GET <base>/authentic/legalEntity/{numéro à 10 chiffres}/references        -> liste JSON des dépôts
//   GET <base>/authentic/deposit/{référence}/accountingData                   -> données comptables d'un dépôt (JSON)
//
// Sources lues le 15/10/2026 :
//   - guide technique CBSO v0.94 (§2.1, §4.2) : https://www.nbb.be/doc/ba/cbso2022/cbso_webservices_technical%20guide_0.94.pdf
//     (hôtes ws.cbso.nbb.be en production et ws.uat2.cbso.nbb.be en test ; en-têtes NBB-CBSO-Subscription-Key, X-Request-Id
//     (UUID unique par requête) et Accept ; délai de requête de la BNB : 120 s ; exemple de réponse des références)
//   - page « Test environment, developer portal and operations » : https://nbb.be/en/central-balance-sheet-office/consultation/web-services/test-environment-developer-portal
//   - description de la représentation JSON : https://www.nbb.be/doc/ba/cbso2022/cbso_jsonxbrl%200.94.yaml (rubriques : Code, Period N/NM1, Value en texte)
//   - conditions d'abonnement v2022 : https://www.nbb.be/DOC/BA/CBSO2022/cnd_n_abin_webservices_v2022_en_v7.pdf (JSON seulement pour un
//     dépôt XBRL déposé à partir du 4 avril 2022 ; jamais pour un PDF ni un XBRL plus ancien)
// NON DOCUMENTÉ PUBLIQUEMENT (inconnu, rien d'inventé) : le corps des erreurs, les quotas et limites de débit, le code HTTP exact renvoyé pour
// un dépôt sans JSON, et le nom exact du type de média du JSON des données comptables (la description dit « application/x.jsonxbrl », l'exemple
// d'API dit « application/json » : les deux sont proposés dans Accept ; à vérifier en direct après souscription).
//
// Règles : la clé voyage dans l'en-tête, jamais dans l'URL, jamais dans un message d'erreur ni un journal ; aucun réessai automatique ;
// aucune redirection suivie ; délai borné par appel ET sur l'ensemble d'une consultation.

import { randomUUID } from "node:crypto";

export const URL_BASE_TEST = "https://ws.uat2.cbso.nbb.be";
export const URL_BASE_PRODUCTION = "https://ws.cbso.nbb.be";
export const ENTETE_CLE = "NBB-CBSO-Subscription-Key";
/** La BNB coupe les requêtes à 120 s ; la passerelle est plus stricte. */
export const DELAI_APPEL_DEFAUT_MS = 30_000;
export const DELAI_APPEL_MAX_MS = 120_000;
/** Budget total d'une consultation (une liste + jusqu'à trois dépôts). */
export const DELAI_TOTAL_MS = 100_000;
const TAILLE_MAX_REPONSE = 5_000_000;

export interface RequeteBnb {
  url: string;
  entetes: Record<string, string>;
  delaiMs: number;
}
export interface ReponseBnb {
  statut: number;
  /** Noms d'en-têtes en minuscules. */
  entetes: Record<string, string>;
  texte: string;
}
/** Transport injectable (les essais n'ouvrent jamais de connexion réseau). */
export type TransportBnb = (requete: RequeteBnb) => Promise<ReponseBnb>;

export type CodeErreurBnb = "cle_invalide" | "limite_debit" | "aucun_depot" | "indisponible" | "delai" | "reponse_invalide" | "requete_refusee" | "sans_json";

export class ErreurBnb extends Error {
  constructor(readonly code: CodeErreurBnb, message: string, readonly statut: number | null = null) {
    super(`[${code}] ${message}`);
  }
}

export const transportFetch: TransportBnb = async (requete) => {
  let r: Response;
  try {
    r = await fetch(requete.url, { method: "GET", headers: requete.entetes, redirect: "manual", signal: AbortSignal.timeout(requete.delaiMs) });
  } catch (e) {
    const nom = e instanceof Error ? e.name : "";
    if (nom === "TimeoutError" || nom === "AbortError") throw new ErreurBnb("delai", `La Centrale des bilans n'a pas répondu dans le délai (${Math.round(requete.delaiMs / 1000)} s).`);
    throw new ErreurBnb("indisponible", "La Centrale des bilans est injoignable (échec réseau).");
  }
  const entetes: Record<string, string> = {};
  r.headers.forEach((v, k) => { entetes[k.toLowerCase()] = v; });
  const texte = await r.text();
  if (texte.length > TAILLE_MAX_REPONSE) throw new ErreurBnb("reponse_invalide", "Réponse de la Centrale des bilans trop volumineuse : ignorée.");
  return { statut: r.status, entetes, texte };
};

export interface ConfigBnb {
  /** Clé d'abonnement du produit « Query authentic data » (secret : jamais journalisée). */
  cle: string | null;
  urlBase: string;
  environnement: "test" | "production" | "personnalise";
  delaiAppelMs: number;
}

/** Lecture de la configuration : PASSERELLE_BNB_CLE ou fichier 0600 PASSERELLE_BNB_CLE_FICHIER ; PASSERELLE_BNB_URL_BASE (défaut : TEST). */
export function configDepuisEnv(env: NodeJS.ProcessEnv, lireSecret: (chemin: string, nom: string) => string): ConfigBnb {
  let cle: string | null = env["PASSERELLE_BNB_CLE"]?.trim() || null;
  const fichier = env["PASSERELLE_BNB_CLE_FICHIER"]?.trim();
  if (!cle && fichier) cle = lireSecret(fichier, "PASSERELLE_BNB_CLE_FICHIER").trim() || null;
  const brute = (env["PASSERELLE_BNB_URL_BASE"]?.trim() || URL_BASE_TEST).replace(/\/+$/, "");
  const environnement = brute === URL_BASE_PRODUCTION ? "production" : brute === URL_BASE_TEST ? "test" : "personnalise";
  const delai = Number(env["PASSERELLE_BNB_DELAI_MS"] ?? DELAI_APPEL_DEFAUT_MS);
  const delaiAppelMs = Number.isFinite(delai) && delai >= 1000 ? Math.min(delai, DELAI_APPEL_MAX_MS) : DELAI_APPEL_DEFAUT_MS;
  return { cle, urlBase: brute, environnement, delaiAppelMs };
}

export interface ReferenceBnb {
  ReferenceNumber: string;
  DepositDate: string | null;
  ExerciseDates: { startDate: string | null; endDate: string | null };
  ModelType: string | null;
  DepositType: string | null;
  Language: string | null;
  Currency: string | null;
}
export interface RubriqueBnb { Code: string; Period?: string; Value: string }

const texteOuNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export class ClientBnb {
  private depart = 0;
  constructor(
    private readonly config: ConfigBnb,
    private readonly transport: TransportBnb = transportFetch,
    private readonly horloge: () => number = Date.now,
    private readonly nouvelId: () => string = randomUUID,
  ) {}

  get environnement(): ConfigBnb["environnement"] { return this.config.environnement; }

  /** Démarre le budget de temps d'une consultation. */
  commencer(): void { this.depart = this.horloge(); }

  private async appeler(chemin: string, accept: string): Promise<ReponseBnb> {
    if (!this.config.cle) throw new ErreurBnb("cle_invalide", "Clé BNB invalide ou absente (PASSERELLE_BNB_CLE ou PASSERELLE_BNB_CLE_FICHIER).");
    const reste = DELAI_TOTAL_MS - (this.horloge() - this.depart);
    if (reste < 1000) throw new ErreurBnb("delai", "Délai total de la consultation de la Centrale des bilans dépassé.");
    const reponse = await this.transport({
      url: `${this.config.urlBase}${chemin}`,
      entetes: { [ENTETE_CLE]: this.config.cle, "X-Request-Id": this.nouvelId(), Accept: accept },
      delaiMs: Math.min(this.config.delaiAppelMs, reste),
    });
    this.verifierStatut(reponse);
    return reponse;
  }

  /** Classement des erreurs : jamais de réessai, jamais le corps de la réponse (inconnu et potentiellement sensible), jamais la clé. */
  private verifierStatut(r: ReponseBnb): void {
    const s = r.statut;
    if (s >= 200 && s < 300) return;
    if (s === 401 || s === 403) throw new ErreurBnb("cle_invalide", "Clé BNB invalide ou absente (ou abonnement « Query authentic data » non actif).", s);
    if (s === 404) throw new ErreurBnb("aucun_depot", "Aucun dépôt trouvé à la Centrale des bilans.", 404);
    if (s === 429) {
      const attente = r.entetes["retry-after"];
      throw new ErreurBnb("limite_debit", `Limite de débit de la Centrale des bilans atteinte (HTTP 429) : ${attente ? `réessayer après ${attente} (en-tête Retry-After)` : "délai d'attente non communiqué par la BNB (Retry-After absent)"}. Aucun nouvel essai n'a été fait.`, 429);
    }
    if (s >= 500) throw new ErreurBnb("indisponible", `La Centrale des bilans est indisponible (HTTP ${s}). Aucun nouvel essai n'a été fait.`, s);
    throw new ErreurBnb("requete_refusee", `Requête refusée par la Centrale des bilans (HTTP ${s}).`, s);
  }

  /** Liste des dépôts d'une entité (numéro à 10 chiffres, sans séparateur). Liste vide si aucun dépôt. */
  async references(numero10: string): Promise<ReferenceBnb[]> {
    let r: ReponseBnb;
    try {
      r = await this.appeler(`/authentic/legalEntity/${numero10}/references`, "application/json");
    } catch (e) {
      if (e instanceof ErreurBnb && e.code === "aucun_depot") return [];
      throw e;
    }
    let donnees: unknown;
    try { donnees = JSON.parse(r.texte); } catch { throw new ErreurBnb("reponse_invalide", "Réponse de la Centrale des bilans illisible (JSON attendu)."); }
    if (!Array.isArray(donnees)) throw new ErreurBnb("reponse_invalide", "Réponse de la Centrale des bilans inattendue (liste de dépôts attendue).");
    const sortie: ReferenceBnb[] = [];
    for (const brut of donnees) {
      const o = (brut ?? {}) as Record<string, any>;
      const ref = texteOuNull(o["ReferenceNumber"]);
      if (!ref || !/^[0-9A-Za-z-]{1,40}$/.test(ref)) continue; // la référence est replacée dans une URL : format strict
      sortie.push({
        ReferenceNumber: ref,
        DepositDate: texteOuNull(o["DepositDate"]),
        ExerciseDates: { startDate: texteOuNull(o["ExerciseDates"]?.startDate), endDate: texteOuNull(o["ExerciseDates"]?.endDate) },
        ModelType: texteOuNull(o["ModelType"]),
        DepositType: texteOuNull(o["DepositType"]),
        Language: texteOuNull(o["Language"]),
        Currency: texteOuNull(o["Currency"]),
      });
    }
    return sortie;
  }

  /**
   * Rubriques d'un dépôt. `null` = pas de JSON pour ce dépôt (PDF ou XBRL d'avant le 4 avril 2022 : la BNB ne produit pas de JSON ;
   * le code HTTP exact n'étant pas documenté, un 404, 406 ou 204 sur cette opération est traité ainsi).
   */
  async rubriques(reference: string): Promise<RubriqueBnb[] | null> {
    let r: ReponseBnb;
    try {
      r = await this.appeler(`/authentic/deposit/${reference}/accountingData`, "application/x.jsonxbrl, application/json;q=0.8");
    } catch (e) {
      if (e instanceof ErreurBnb && (e.statut === 404 || e.statut === 406)) return null;
      throw e;
    }
    if (r.statut === 204 || r.texte.trim() === "") return null;
    let donnees: any;
    try { donnees = JSON.parse(r.texte); } catch { return null; } // contenu non JSON (PDF renvoyé par exemple)
    const liste = donnees?.Rubrics;
    if (!Array.isArray(liste)) return [];
    return liste
      .filter((x: any) => x && typeof x.Code === "string" && (typeof x.Value === "string" || typeof x.Value === "number"))
      .map((x: any) => ({ Code: x.Code, ...(typeof x.Period === "string" ? { Period: x.Period } : {}), Value: String(x.Value) }));
  }
}
