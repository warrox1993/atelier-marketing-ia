// Autorisation du mode réel Google (lot L4), option b : la passerelle garde elle-même les jetons Google.
//
// Pourquoi (docs/passerelle.md, « Fournisseurs Google réels (L4) ») : Google n'a pas d'enregistrement
// dynamique, et la connexion générique de Paperclip, avec un client préconfiguré, n'envoie ni
// `access_type=offline` ni `prompt=consent` à Google (paperclip/server/src/services/tool-access.ts,
// construction de l'URL d'autorisation : ces deux paramètres ne viennent que d'une carte de galerie). Google
// ne délivre alors aucun jeton de rafraîchissement, et la connexion meurt au bout d'une heure
// (« OAuth credentials have expired and no refresh token is available », même fichier).
//
// Rôles :
//   1. face à Paperclip : serveur d'autorisation OAuth 2.1 (métadonnées RFC 8414, enregistrement dynamique
//      RFC 7591, PKCE S256, indicateur de ressource RFC 8707, `iss` RFC 9207). Paperclip garde dans son coffre
//      les jetons de la PASSERELLE, jamais ceux de Google ;
//   2. face à Google : client OAuth « application Web » (client préconfiguré par l'opérateur), PKCE S256,
//      `access_type=offline` et `prompt=consent` pour obtenir un jeton de rafraîchissement, portées minimales
//      du service, sans paramètre `resource` (non documenté chez Google).
// Le jeton de rafraîchissement Google est chiffré (AES-256-GCM) dans le fichier d'état (0600). Les jetons
// d'accès Google ne vivent qu'en mémoire. Les jetons de la passerelle ne sont stockés que sous forme
// d'empreinte SHA-256. Aucun jeton n'est jamais journalisé : le journal ne reçoit que méthode, chemin et statut.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { calculerChallengeS256, verifierPkceS256 } from "../../commun/pkce.js";
import {
  bornerTable,
  ENREGISTREMENTS_PAR_MINUTE,
  exigerCorpsJson,
  LimiteurDebit,
  MAX_CLIENTS_DCR,
  MAX_TRANSACTIONS,
  originesBoucle,
  placerClient,
  RefusGarde,
  schemaEnregistrementReel,
  verifierOrigine,
} from "../../garde-oauth.js";
import type { IdentiteAppel } from "../../fournisseurs.js";
import { chiffrer, dechiffrer } from "./chiffrement.js";
import type { ConfigGoogleReel } from "./config.js";

const DUREE_TRANSACTION_MS = 10 * 60 * 1000;
const DUREE_CODE_MS = 5 * 60 * 1000;
const DUREE_JETON_S = 3600;
const DUREE_RAFRAICHISSEMENT_MS = 180 * 24 * 3600 * 1000;
/** Marge avant expiration d'un jeton d'accès Google : on le renouvelle une minute avant. */
const MARGE_EXPIRATION_MS = 60 * 1000;
const MAX_CORPS_OCTETS = 16 * 1024;
const DELAI_GOOGLE_MS = 15_000;

/** Erreur d'autorisation présentée à l'agent : message clair, jamais de jeton. */
export class ErreurAutorisation extends Error {
  constructor(readonly code: "jeton_passerelle_invalide" | "autorisation_google_retiree" | "google_injoignable", message: string) {
    super(message);
  }
}

class ErreurHttp extends Error {
  constructor(readonly statut: number, readonly code: string, message: string) {
    super(message);
  }
}

const aleatoire = (octets = 32): string => randomBytes(octets).toString("base64url");
const empreinte = (valeur: string): string => createHash("sha256").update(valeur).digest("hex");
const sansBarreFinale = (v: string): string => v.replace(/\/+$/, "");

interface Client {
  clientId: string;
  redirectUris: string[];
  clientName: string | null;
  emisLe: number;
}

/** Octroi : un consentement Google pour un service. Seul le rafraîchissement Google y est gardé, chiffré. */
interface Octroi {
  id: string;
  service: string;
  portees: string[];
  rafraichissementGoogle: string;
  creeLe: number;
}

interface JetonPasserelle {
  type: "acces" | "rafraichissement";
  clientId: string;
  resource: string;
  octroi: string;
  expire: number;
}

interface Etat {
  version: 1;
  clients: Client[];
  octrois: Octroi[];
  /** Clé : empreinte SHA-256 du jeton. */
  jetons: Record<string, JetonPasserelle>;
}

interface Transaction {
  clientId: string;
  redirectUri: string;
  etatClient: string | null;
  challengeClient: string;
  resource: string;
  service: string;
  portees: string[];
  verificateurGoogle: string;
  expire: number;
}

interface CodeEmis {
  clientId: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  octroi: string;
  expire: number;
}

export interface OptionsAutorisationGoogle {
  config: ConfigGoogleReel;
  /** URL de base de la passerelle MCP (les ressources sont `<base>/mcp/<service>`). */
  urlPasserelle: () => string;
  /** Portées Google de chaque service servi en réel (fiche du service). */
  porteesParService: ReadonlyMap<string, readonly string[]>;
  journal?: (message: string) => void;
  /** Horloge (tests). */
  maintenant?: () => number;
  /** Bornes de l'enregistrement dynamique (tests) ; défauts : 200 clients, 30 enregistrements par minute. */
  limites?: { maxClients?: number; enregistrementsParMinute?: number };
}

/** Réponse d'erreur OAuth de Google : { error, error_description } (RFC 6749 §5.2). */
async function lireJsonSur(reponse: Response): Promise<Record<string, unknown>> {
  try {
    const v = (await reponse.json()) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export class AutorisationGoogle {
  private etat: Etat = { version: 1, clients: [], octrois: [], jetons: {} };
  private readonly transactions = new Map<string, Transaction>();
  private readonly codes = new Map<string, CodeEmis>();
  private readonly codesConsommes = new Map<string, { octroi: string; expire: number }>();
  /** Jetons d'accès Google en mémoire seulement, par octroi. */
  private readonly accesGoogle = new Map<string, { jeton: string; expire: number }>();
  private readonly rafraichissementsEnCours = new Map<string, Promise<string>>();
  private serveur: Server | null = null;
  private base = "";
  private readonly journal: (m: string) => void;
  private readonly maintenant: () => number;
  private readonly limiteur: LimiteurDebit;
  private readonly maxClients: number;

  constructor(private readonly options: OptionsAutorisationGoogle) {
    this.journal = options.journal ?? ((): void => undefined);
    this.maintenant = options.maintenant ?? Date.now;
    this.limiteur = new LimiteurDebit(options.limites?.enregistrementsParMinute ?? ENREGISTREMENTS_PAR_MINUTE, 60_000, this.maintenant);
    this.maxClients = options.limites?.maxClients ?? MAX_CLIENTS_DCR;
    this.charger();
  }

  // --- État persistant ------------------------------------------------------------

  private charger(): void {
    const fichier = this.options.config.fichierEtat;
    if (!existsSync(fichier)) return;
    const brut = JSON.parse(readFileSync(fichier, "utf8")) as Etat;
    if (brut.version !== 1) throw new Error("Fichier d'état Google : version inconnue.");
    this.etat = brut;
  }

  private sauvegarder(): void {
    const fichier = this.options.config.fichierEtat;
    mkdirSync(dirname(fichier), { recursive: true, mode: 0o700 });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    writeFileSync(temporaire, JSON.stringify(this.etat), { mode: 0o600 });
    renameSync(temporaire, fichier);
  }

  private nettoyer(): void {
    const t = this.maintenant();
    for (const [c, v] of this.transactions) if (v.expire <= t) this.transactions.delete(c);
    for (const [c, v] of this.codes) if (v.expire <= t) this.codes.delete(c);
    for (const [c, v] of this.codesConsommes) if (v.expire <= t) this.codesConsommes.delete(c);
    let change = false;
    for (const [c, v] of Object.entries(this.etat.jetons)) {
      if (v.expire <= t) {
        delete this.etat.jetons[c];
        change = true;
      }
    }
    if (change) this.sauvegarder();
  }

  // --- Métadonnées ------------------------------------------------------------------

  /** URL de base du serveur d'autorisation (annoncée dans les métadonnées de ressource protégée). */
  urlBase(): string {
    return this.base;
  }

  metadonnees(): Record<string, unknown> {
    const b = this.base;
    const portees = [...new Set([...this.options.porteesParService.values()].flat())];
    return {
      issuer: b,
      authorization_endpoint: `${b}/oauth/authorize`,
      token_endpoint: `${b}/oauth/token`,
      registration_endpoint: `${b}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: portees,
      authorization_response_iss_parameter_supported: true,
    };
  }

  // --- Accès Google pour les outils -------------------------------------------------

  /**
   * Jeton d'accès Google pour un appel d'outil. `jetonPasserelle` est le jeton porteur reçu de Paperclip ;
   * il doit être valide et émis pour la ressource de ce service. `forcer` : le jeton Google en cache a été
   * refusé (401), on le renouvelle par le jeton de rafraîchissement.
   */
  async jetonGoogle(jetonPasserelle: string | null, service: string, forcer = false): Promise<string> {
    const octroi = this.octroiDuJeton(jetonPasserelle, service);
    const cache = this.accesGoogle.get(octroi.id);
    if (!forcer && cache && cache.expire - MARGE_EXPIRATION_MS > this.maintenant()) return cache.jeton;
    const enCours = this.rafraichissementsEnCours.get(octroi.id);
    if (enCours) return enCours;
    const promesse = this.rafraichirGoogle(octroi).finally(() => this.rafraichissementsEnCours.delete(octroi.id));
    this.rafraichissementsEnCours.set(octroi.id, promesse);
    return promesse;
  }

  /**
   * Vérification du jeton porteur au niveau HTTP (serveur MCP, toute requête) : identité si le jeton d'accès est
   * valide, non expiré, émis pour la ressource de CE service et lié à un octroi Google encore présent ; sinon null.
   */
  identiteDuJeton(jetonPasserelle: string, service: string): IdentiteAppel | null {
    try {
      this.octroiDuJeton(jetonPasserelle, service);
    } catch {
      return null;
    }
    return { compte: "Compte Google (réel)", propriete: null };
  }

  private octroiDuJeton(jetonPasserelle: string | null, service: string): Octroi {
    const invalide = new ErreurAutorisation(
      "jeton_passerelle_invalide",
      "Jeton de la passerelle invalide, expiré ou destiné à un autre service : reconnectez le service dans Paperclip (Apps).",
    );
    if (!jetonPasserelle) throw invalide;
    const trouve = this.etat.jetons[empreinte(jetonPasserelle)];
    if (!trouve || trouve.type !== "acces" || trouve.expire <= this.maintenant()) throw invalide;
    if (sansBarreFinale(trouve.resource) !== this.ressource(service)) throw invalide;
    const octroi = this.etat.octrois.find((o) => o.id === trouve.octroi);
    if (!octroi || octroi.service !== service) throw invalide;
    return octroi;
  }

  private async rafraichirGoogle(octroi: Octroi): Promise<string> {
    const { config } = this.options;
    const corps = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: dechiffrer(config.cle, octroi.rafraichissementGoogle, octroi.id),
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    let reponse: Response;
    try {
      reponse = await fetch(config.adresses.jeton, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: corps,
        signal: AbortSignal.timeout(DELAI_GOOGLE_MS),
      });
    } catch {
      throw new ErreurAutorisation("google_injoignable", "Google ne répond pas au renouvellement de l'autorisation ; réessayer plus tard.");
    }
    const json = await lireJsonSur(reponse);
    if (!reponse.ok) {
      if (json["error"] === "invalid_grant" || json["error"] === "unauthorized_client") {
        // Accès retiré par l'utilisateur, jeton de 7 jours d'un projet en mode « test », 6 mois sans usage...
        this.retirerOctroi(octroi.id);
        throw new ErreurAutorisation(
          "autorisation_google_retiree",
          "L'autorisation Google a été retirée ou a expiré : reconnectez le service dans Paperclip (Apps).",
        );
      }
      throw new ErreurAutorisation("google_injoignable", `Google a refusé le renouvellement de l'autorisation (HTTP ${reponse.status}) ; réessayer plus tard.`);
    }
    const acces = json["access_token"];
    const duree = Number(json["expires_in"] ?? 3600);
    if (typeof acces !== "string" || acces === "") throw new ErreurAutorisation("google_injoignable", "Réponse de jeton Google inattendue.");
    this.accesGoogle.set(octroi.id, { jeton: acces, expire: this.maintenant() + duree * 1000 });
    return acces;
  }

  private retirerOctroi(id: string): void {
    this.etat.octrois = this.etat.octrois.filter((o) => o.id !== id);
    for (const [c, v] of Object.entries(this.etat.jetons)) if (v.octroi === id) delete this.etat.jetons[c];
    this.accesGoogle.delete(id);
    this.sauvegarder();
  }

  private ressource(service: string): string {
    return `${sansBarreFinale(this.options.urlPasserelle())}/mcp/${service}`;
  }

  private serviceDeRessource(resource: string): string | null {
    for (const service of this.options.porteesParService.keys()) {
      if (sansBarreFinale(resource) === this.ressource(service)) return service;
    }
    return null;
  }

  // --- Serveur HTTP ------------------------------------------------------------------

  ecouter(hote: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const serveur = createServer((req, res) => {
        res.on("finish", () => this.journal(`autorisation ${req.method ?? "?"} ${(req.url ?? "").split("?")[0]} -> ${res.statusCode}`));
        this.aiguiller(req, res).catch(() => {
          if (!res.headersSent) this.json(res, 500, { error: "server_error", error_description: "Erreur interne" });
          else res.end();
        });
      });
      serveur.once("error", reject);
      serveur.listen(this.options.config.portAutorisation, hote, () => {
        const adresse = serveur.address() as AddressInfo;
        this.base = hote === "::1" ? `http://[::1]:${adresse.port}` : `http://${hote}:${adresse.port}`;
        serveur.off("error", reject);
        this.serveur = serveur;
        resolve(this.base);
      });
    });
  }

  arreter(): Promise<void> {
    const serveur = this.serveur;
    if (!serveur) return Promise.resolve();
    return new Promise((resolve, reject) => {
      serveur.close((e) => (e ? reject(e) : resolve()));
      serveur.closeAllConnections();
    });
  }

  private hoteAutorise(entete: string | undefined): boolean {
    if (!entete) return false;
    const port = new URL(this.base).port;
    return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(entete.toLowerCase());
  }

  private async aiguiller(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.hoteAutorise(req.headers.host)) {
      this.json(res, 403, { error: "hote_refuse" });
      return;
    }
    const url = new URL(req.url ?? "/", this.base);
    const chemin = url.pathname;
    this.nettoyer();
    if (chemin === "/.well-known/oauth-authorization-server" && req.method === "GET") {
      this.json(res, 200, this.metadonnees());
      return;
    }
    try {
      // Aucune route de ce serveur n'est appelée par une page d'un autre site (S2).
      verifierOrigine(req, originesBoucle(this.base));
      if (chemin === "/oauth/register" && req.method === "POST") await this.enregistrer(req, res);
      else if (chemin === "/oauth/authorize" && req.method === "GET") this.autoriser(res, url);
      else if (chemin === "/oauth/google/retour" && req.method === "GET") await this.retourGoogle(res, url);
      else if (chemin === "/oauth/token" && req.method === "POST") await this.emettre(req, res);
      else throw new ErreurHttp(404, "not_found", "Chemin inconnu");
    } catch (erreur) {
      if (!(erreur instanceof ErreurHttp) && !(erreur instanceof RefusGarde)) throw erreur;
      if (chemin === "/oauth/authorize" || chemin === "/oauth/google/retour") this.pageErreur(res, erreur.statut, erreur.message);
      else this.json(res, erreur.statut, { error: erreur.code, error_description: erreur.message });
    }
  }

  private async lireCorps(req: IncomingMessage): Promise<string> {
    const morceaux: Buffer[] = [];
    let total = 0;
    for await (const m of req) {
      const t = Buffer.isBuffer(m) ? m : Buffer.from(m as string);
      total += t.length;
      if (total > MAX_CORPS_OCTETS) throw new ErreurHttp(413, "invalid_request", "Corps trop volumineux");
      morceaux.push(t);
    }
    return Buffer.concat(morceaux).toString("utf8");
  }

  // --- Enregistrement dynamique (RFC 7591), mêmes règles qu'en démonstration -----------

  private async enregistrer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    exigerCorpsJson(req);
    this.limiteur.consommer();
    let brut: unknown;
    try {
      brut = JSON.parse(await this.lireCorps(req));
    } catch (e) {
      if (e instanceof ErreurHttp) throw e;
      throw new ErreurHttp(400, "invalid_client_metadata", "Corps JSON invalide");
    }
    const analyse = schemaEnregistrementReel(this.options.config.redirectionsPermises ?? []).safeParse(brut);
    if (!analyse.success) {
      const redirection = analyse.error.issues.some((i) => i.path[0] === "redirect_uris");
      throw new ErreurHttp(400, redirection ? "invalid_redirect_uri" : "invalid_client_metadata", analyse.error.issues.map((i) => `${i.path.join(".") || "corps"} : ${i.message}`).join(" ; "));
    }
    const client: Client = {
      clientId: `passerelle-${aleatoire(16)}`,
      redirectUris: [...analyse.data.redirect_uris],
      clientName: analyse.data.client_name ?? null,
      emisLe: Math.floor(this.maintenant() / 1000),
    };
    // Table bornée, sans jamais évincer un client qui a une connexion vivante (S2).
    placerClient(this.etat.clients, client, (id) => this.clientVivant(id), this.maxClients);
    this.sauvegarder();
    this.json(res, 201, {
      client_id: client.clientId,
      client_id_issued_at: client.emisLe,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(client.clientName ? { client_name: client.clientName } : {}),
    });
  }

  /** Un client est « vivant » s'il a un jeton non expiré, un code ou un parcours d'autorisation en cours. */
  private clientVivant(clientId: string): boolean {
    const t = this.maintenant();
    if (Object.values(this.etat.jetons).some((j) => j.clientId === clientId && j.expire > t)) return true;
    for (const c of this.codes.values()) if (c.clientId === clientId) return true;
    for (const tr of this.transactions.values()) if (tr.clientId === clientId) return true;
    return false;
  }

  // --- Autorisation : renvoi vers Google ------------------------------------------------

  private autoriser(res: ServerResponse, url: URL): void {
    const q = url.searchParams;
    const client = this.etat.clients.find((c) => c.clientId === q.get("client_id"));
    if (!client) throw new ErreurHttp(400, "invalid_client", "Client inconnu : refaire la connexion depuis Paperclip.");
    const redirectUri = q.get("redirect_uri") ?? "";
    if (!client.redirectUris.includes(redirectUri)) throw new ErreurHttp(400, "invalid_request", "redirect_uri non enregistrée pour ce client.");
    // À partir d'ici, les erreurs reviennent au client par redirection (RFC 6749 §4.1.2.1).
    const etatClient = q.get("state");
    const echec = (code: string, description: string): void => this.rediriger(res, redirectUri, { error: code, error_description: description, state: etatClient });
    if (q.get("response_type") !== "code") return echec("unsupported_response_type", "response_type=code attendu");
    const challenge = q.get("code_challenge") ?? "";
    if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9\-_]{43}$/.test(challenge)) return echec("invalid_request", "PKCE S256 obligatoire");
    const resource = q.get("resource");
    const service = resource ? this.serviceDeRessource(resource) : null;
    if (!resource || !service) return echec("invalid_target", "Ressource absente ou inconnue (attendu : <passerelle>/mcp/<service>)");
    const porteesService = [...(this.options.porteesParService.get(service) ?? [])];
    const demandees = (q.get("scope") ?? "").split(" ").filter((p) => p !== "");
    for (const p of demandees) {
      if (!porteesService.includes(p)) return echec("invalid_scope", `Portée non permise pour ce service : ${p} (permises : ${porteesService.join(" ")})`);
    }
    const id = aleatoire(24);
    const verificateur = aleatoire(48);
    bornerTable(this.transactions, MAX_TRANSACTIONS);
    this.transactions.set(id, {
      clientId: client.clientId,
      redirectUri,
      etatClient,
      challengeClient: challenge,
      resource: sansBarreFinale(resource),
      service,
      portees: porteesService,
      verificateurGoogle: verificateur,
      expire: this.maintenant() + DUREE_TRANSACTION_MS,
    });
    const google = new URL(this.options.config.adresses.autorisation);
    google.searchParams.set("client_id", this.options.config.clientId);
    google.searchParams.set("redirect_uri", this.retourGoogleUri());
    google.searchParams.set("response_type", "code");
    google.searchParams.set("scope", porteesService.join(" "));
    google.searchParams.set("access_type", "offline");
    google.searchParams.set("prompt", "consent");
    google.searchParams.set("state", id);
    google.searchParams.set("code_challenge", calculerChallengeS256(verificateur));
    google.searchParams.set("code_challenge_method", "S256");
    res.writeHead(302, { location: google.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  }

  /** Adresse de retour à déclarer une fois dans le client OAuth Google (« URI de redirection autorisés »). */
  retourGoogleUri(): string {
    return `${this.base}/oauth/google/retour`;
  }

  private async retourGoogle(res: ServerResponse, url: URL): Promise<void> {
    const q = url.searchParams;
    const id = q.get("state") ?? "";
    const tr = this.transactions.get(id);
    if (!tr || tr.expire <= this.maintenant()) throw new ErreurHttp(400, "invalid_request", "Demande d'autorisation inconnue ou expirée : recommencer depuis Paperclip.");
    this.transactions.delete(id); // usage unique
    const retour = (params: Record<string, string | null>): void => this.rediriger(res, tr.redirectUri, { ...params, state: tr.etatClient });
    const erreurGoogle = q.get("error");
    if (erreurGoogle) {
      return retour({ error: erreurGoogle === "access_denied" ? "access_denied" : "server_error", error_description: erreurGoogle === "access_denied" ? "Accès refusé sur l'écran de consentement Google." : "Google a refusé l'autorisation." });
    }
    const code = q.get("code");
    if (!code) return retour({ error: "server_error", error_description: "Google n'a renvoyé aucun code." });

    const { config } = this.options;
    let reponse: Response;
    try {
      reponse = await fetch(config.adresses.jeton, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.retourGoogleUri(),
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code_verifier: tr.verificateurGoogle,
        }),
        signal: AbortSignal.timeout(DELAI_GOOGLE_MS),
      });
    } catch {
      return retour({ error: "temporarily_unavailable", error_description: "Google ne répond pas ; réessayer." });
    }
    const json = await lireJsonSur(reponse);
    if (!reponse.ok || typeof json["access_token"] !== "string") {
      return retour({ error: "server_error", error_description: "Échange du code refusé par Google." });
    }
    // Consentement granulaire : l'utilisateur peut décocher une portée ; on vérifie ce qui a été accordé.
    const accordees = String(json["scope"] ?? "").split(" ");
    const manquantes = tr.portees.filter((p) => !accordees.includes(p));
    if (manquantes.length > 0) {
      return retour({ error: "access_denied", error_description: `Autorisation incomplète : la portée ${manquantes.join(" ")} n'a pas été accordée.` });
    }
    const rafraichissement = json["refresh_token"];
    if (typeof rafraichissement !== "string" || rafraichissement === "") {
      return retour({ error: "server_error", error_description: "Google n'a pas fourni de jeton de rafraîchissement ; recommencer la connexion." });
    }
    const octroiId = aleatoire(16);
    this.etat.octrois.push({
      id: octroiId,
      service: tr.service,
      portees: tr.portees,
      rafraichissementGoogle: chiffrer(config.cle, rafraichissement, octroiId),
      creeLe: this.maintenant(),
    });
    this.accesGoogle.set(octroiId, { jeton: json["access_token"], expire: this.maintenant() + Number(json["expires_in"] ?? 3600) * 1000 });
    this.sauvegarder();
    const notreCode = aleatoire(32);
    this.codes.set(empreinte(notreCode), {
      clientId: tr.clientId,
      redirectUri: tr.redirectUri,
      challenge: tr.challengeClient,
      resource: tr.resource,
      octroi: octroiId,
      expire: this.maintenant() + DUREE_CODE_MS,
    });
    retour({ code: notreCode });
  }

  // --- Jetons de la passerelle --------------------------------------------------------------

  private async emettre(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/x-www-form-urlencoded") throw new ErreurHttp(400, "invalid_request", "Content-Type attendu : application/x-www-form-urlencoded");
    const f = new URLSearchParams(await this.lireCorps(req));
    const client = this.etat.clients.find((c) => c.clientId === f.get("client_id"));
    if (!client) throw new ErreurHttp(401, "invalid_client", "Client inconnu");
    const ressourceDemandee = f.get("resource");
    const grant = f.get("grant_type");

    if (grant === "authorization_code") {
      const cle = empreinte(f.get("code") ?? "");
      const consomme = this.codesConsommes.get(cle);
      if (consomme) {
        this.retirerOctroi(consomme.octroi); // rejeu : tout ce que le code avait produit est révoqué
        throw new ErreurHttp(400, "invalid_grant", "Code d'autorisation déjà utilisé");
      }
      const code = this.codes.get(cle);
      if (!code || code.expire <= this.maintenant()) throw new ErreurHttp(400, "invalid_grant", "Code d'autorisation inconnu ou expiré");
      this.codes.delete(cle);
      this.codesConsommes.set(cle, { octroi: code.octroi, expire: this.maintenant() + DUREE_CODE_MS });
      if (code.clientId !== client.clientId) throw new ErreurHttp(400, "invalid_grant", "Code émis pour un autre client");
      if (f.get("redirect_uri") !== code.redirectUri) throw new ErreurHttp(400, "invalid_grant", "redirect_uri différente de celle de la demande");
      if (!verifierPkceS256(f.get("code_verifier") ?? "", code.challenge)) throw new ErreurHttp(400, "invalid_grant", "Vérification PKCE échouée");
      if (ressourceDemandee && sansBarreFinale(ressourceDemandee) !== code.resource) throw new ErreurHttp(400, "invalid_target", "La ressource demandée diffère de celle autorisée");
      this.repondreJetons(res, client.clientId, code.resource, code.octroi);
      return;
    }

    if (grant === "refresh_token") {
      const cle = empreinte(f.get("refresh_token") ?? "");
      const ancien = this.etat.jetons[cle];
      if (!ancien || ancien.type !== "rafraichissement" || ancien.clientId !== client.clientId || ancien.expire <= this.maintenant()) {
        throw new ErreurHttp(400, "invalid_grant", "Jeton de rafraîchissement invalide ou expiré");
      }
      if (!this.etat.octrois.some((o) => o.id === ancien.octroi)) throw new ErreurHttp(400, "invalid_grant", "Autorisation Google retirée : reconnecter le service");
      if (ressourceDemandee && sansBarreFinale(ressourceDemandee) !== sansBarreFinale(ancien.resource)) throw new ErreurHttp(400, "invalid_target", "La ressource demandée diffère de celle autorisée");
      delete this.etat.jetons[cle]; // rotation : usage unique
      this.repondreJetons(res, client.clientId, ancien.resource, ancien.octroi);
      return;
    }
    throw new ErreurHttp(400, "unsupported_grant_type", "grant_type permis : authorization_code, refresh_token");
  }

  private repondreJetons(res: ServerResponse, clientId: string, resource: string, octroiId: string): void {
    const acces = aleatoire(32);
    const rafraichissement = aleatoire(32);
    const t = this.maintenant();
    this.etat.jetons[empreinte(acces)] = { type: "acces", clientId, resource, octroi: octroiId, expire: t + DUREE_JETON_S * 1000 };
    this.etat.jetons[empreinte(rafraichissement)] = { type: "rafraichissement", clientId, resource, octroi: octroiId, expire: t + DUREE_RAFRAICHISSEMENT_MS };
    this.sauvegarder();
    const octroi = this.etat.octrois.find((o) => o.id === octroiId);
    this.json(res, 200, {
      access_token: acces,
      token_type: "Bearer",
      expires_in: DUREE_JETON_S,
      refresh_token: rafraichissement,
      scope: (octroi?.portees ?? []).join(" "),
    });
  }

  // --- Réponses -------------------------------------------------------------------------------

  private rediriger(res: ServerResponse, redirectUri: string, params: Record<string, string | null | undefined>): void {
    const cible = new URL(redirectUri);
    for (const [c, v] of Object.entries(params)) if (v !== null && v !== undefined) cible.searchParams.set(c, v);
    cible.searchParams.set("iss", this.base); // RFC 9207
    res.writeHead(302, { location: cible.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  }

  private json(res: ServerResponse, statut: number, corps: unknown): void {
    res.writeHead(statut, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(corps));
  }

  private pageErreur(res: ServerResponse, statut: number, message: string): void {
    const sur = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.writeHead(statut, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
    });
    res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Connexion Google</title><p>${sur}</p></html>`);
  }
}
