// Autorisation « en un clic » des services réseaux sociaux et CRM en mode réel. Même mécanisme que Google
// (src/reel/google/autorisation.ts, lot L4) : la passerelle garde elle-même les secrets des plateformes.
//
// Pourquoi ici aussi : aucune de ces plateformes ne publie de métadonnées RFC 8414 ni d'enregistrement
// dynamique ; Meta n'a pas de jeton de rafraîchissement standard (jeton utilisateur long, puis jeton de Page) ;
// Pipedrive renvoie l'adresse d'API propre à la société (`api_domain`) avec le jeton ; Teamleader fait tourner
// ses jetons de rafraîchissement à chaque usage ; Odoo et le jeton d'API Pipedrive ne sont pas de l'OAuth.
// Paperclip ne sait rien de tout cela : il voit un serveur d'autorisation OAuth 2.1 standard.
//
// Rôles :
//   1. face à Paperclip : métadonnées RFC 8414, enregistrement dynamique RFC 7591, PKCE S256, indicateur de
//      ressource RFC 8707 (un service = une ressource <passerelle>/mcp/<service>), paramètre `iss` RFC 9207 ;
//   2. face à la plateforme : client OAuth « application Web » (application de l'opérateur) ou formulaire
//      « adresse et clé » (Odoo, jeton d'API Pipedrive), puis choix du compte (Page, organisation).
// Aucun jeton ni aucune clé n'est jamais journalisé : le journal ne reçoit que méthode, chemin et statut.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { calculerChallengeS256, verifierPkceS256 } from "../../oauth-demo.js";
import {
  bornerTable,
  ENREGISTREMENTS_PAR_MINUTE,
  exigerCorpsJson,
  LimiteurDebit,
  MAX_CLIENTS_DCR,
  MAX_TRANSACTIONS,
  originesBoucle,
  RefusGarde,
  schemaEnregistrementReel,
  verifierOrigine,
} from "../../garde-oauth.js";
import type { IdentiteAppel } from "../../fournisseurs.js";
import { Coffre, type Octroi } from "./coffre.js";
import type { ConfigSocialCrmReel, ServiceSocialCrm } from "./config.js";
import type { CompteChoisi, Connecteur, Details, ResultatAutorisation, Secrets } from "./connecteurs.js";
import { ErreurFournisseur } from "./http.js";

const DUREE_TRANSACTION_MS = 15 * 60 * 1000;
const DUREE_CODE_MS = 5 * 60 * 1000;
const DUREE_JETON_S = 3600;
const DUREE_RAFRAICHISSEMENT_MS = 180 * 24 * 3600 * 1000;
const MAX_CORPS_OCTETS = 16 * 1024;

const aleatoire = (octets = 32): string => randomBytes(octets).toString("base64url");
const empreinte = (valeur: string): string => createHash("sha256").update(valeur).digest("hex");
const sansBarreFinale = (v: string): string => v.replace(/\/+$/, "");

class ErreurHttp extends Error {
  constructor(readonly statut: number, readonly code: string, message: string) {
    super(message);
  }
}

interface Transaction {
  clientId: string;
  redirectUri: string;
  etatClient: string | null;
  challengeClient: string;
  resource: string;
  service: ServiceSocialCrm;
  portees: string[];
  expire: number;
  /**
   * Vérificateur PKCE propre à l'échange avec la plateforme. Jamais égal à l'identifiant de transaction : celui-ci
   * voyage en clair comme `state` dans l'URL d'autorisation, il ne peut pas servir de secret PKCE (revue S6).
   */
  verificateurAmont: string;
  /** Après l'autorisation amont, quand plusieurs comptes sont possibles : en attente du choix. */
  enAttente?: ResultatAutorisation;
}

interface CodeEmis {
  clientId: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  octroi: string;
  expire: number;
}

/** Ce qu'un outil reçoit pour appeler la plateforme : jamais transmis à l'agent. */
export interface AccesPlateforme {
  octroi: string;
  service: string;
  compte: { id: string; libelle: string };
  details: Details;
  secrets: Secrets;
}

export interface OptionsAutorisationSocial {
  config: ConfigSocialCrmReel;
  coffre: Coffre;
  connecteurs: ReadonlyMap<ServiceSocialCrm, Connecteur>;
  urlPasserelle: () => string;
  journal?: (message: string) => void;
  maintenant?: () => number;
  /** Bornes de l'enregistrement dynamique (tests) ; défauts : 200 clients, 30 enregistrements par minute. */
  limites?: { maxClients?: number; enregistrementsParMinute?: number };
}

const echapper = (v: string): string => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class AutorisationSocialCrm {
  private readonly transactions = new Map<string, Transaction>();
  private readonly codes = new Map<string, CodeEmis>();
  private readonly codesConsommes = new Map<string, { octroi: string; expire: number }>();
  private readonly rafraichissements = new Map<string, Promise<Secrets>>();
  private serveur: Server | null = null;
  private base = "";
  private readonly journal: (m: string) => void;
  private readonly maintenant: () => number;
  private readonly coffre: Coffre;
  private readonly limiteur: LimiteurDebit;

  constructor(private readonly options: OptionsAutorisationSocial) {
    this.journal = options.journal ?? ((): void => undefined);
    this.maintenant = options.maintenant ?? Date.now;
    this.coffre = options.coffre;
    this.limiteur = new LimiteurDebit(options.limites?.enregistrementsParMinute ?? ENREGISTREMENTS_PAR_MINUTE, 60_000, this.maintenant);
  }

  urlBase(): string {
    return this.base;
  }

  /** Adresse de retour à déclarer une fois dans l'application de chaque plateforme. */
  retourUri(service: string): string {
    return `${this.options.config.urlRetourPublique ?? this.base}/oauth/retour/${service}`;
  }

  metadonnees(): Record<string, unknown> {
    const b = this.base;
    const portees = [...new Set([...this.options.connecteurs.values()].flatMap((c) => c.porteesPermises))];
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

  // --- Accès pour les outils -----------------------------------------------------------------

  /**
   * Vérification du jeton porteur au niveau HTTP (serveur MCP, toute requête) : identité du compte connecté si le
   * jeton d'accès est valide, non expiré, émis pour la ressource de CE service et lié à un octroi présent ; sinon null.
   */
  identiteDuJeton(jetonPasserelle: string, service: string): IdentiteAppel | null {
    let octroi: Octroi;
    try {
      octroi = this.octroiDuJeton(jetonPasserelle, service);
    } catch {
      return null;
    }
    return { compte: octroi.compte.libelle, propriete: { id: octroi.compte.id, libelle: octroi.compte.libelle } };
  }

  /** Octroi désigné par le jeton porteur reçu de Paperclip, pour ce service. */
  private octroiDuJeton(jetonPasserelle: string | null, service: string): Octroi {
    const invalide = new ErreurFournisseur("jeton_expire", "Jeton de la passerelle invalide, expiré ou destiné à un autre service : reconnectez le service dans Paperclip (Apps).");
    if (!jetonPasserelle) throw invalide;
    const trouve = this.coffre.jeton(empreinte(jetonPasserelle));
    if (!trouve || trouve.type !== "acces" || trouve.expire <= this.maintenant()) throw invalide;
    if (sansBarreFinale(trouve.resource) !== this.ressource(service)) throw invalide;
    const octroi = this.coffre.octroi(trouve.octroi);
    if (!octroi || octroi.service !== service) throw invalide;
    return octroi;
  }

  /**
   * Accès à la plateforme pour un appel d'outil. `forcer` : la plateforme vient de refuser le jeton (401) ;
   * on tente un renouvellement, et sans renouvellement possible l'erreur demande de reconnecter.
   */
  async acces(jetonPasserelle: string | null, service: string, forcer = false): Promise<AccesPlateforme> {
    const octroi = this.octroiDuJeton(jetonPasserelle, service);
    const connecteur = this.options.connecteurs.get(service as ServiceSocialCrm);
    let secrets = this.coffre.secrets(octroi);
    const renouveler = forcer || (connecteur?.doitRafraichir?.(secrets, this.maintenant()) ?? false);
    if (renouveler) {
      if (!connecteur?.rafraichir) {
        if (forcer) throw new ErreurFournisseur("jeton_expire", `Autorisation ${connecteur?.libelle ?? service} refusée par la plateforme : reconnectez le service dans Paperclip (Apps).`);
      } else {
        secrets = await this.rafraichir(octroi, connecteur, secrets, forcer);
      }
    }
    return { octroi: octroi.id, service, compte: octroi.compte, details: octroi.details, secrets };
  }

  /** Un seul renouvellement à la fois par octroi (Teamleader : un jeton de rafraîchissement ne sert qu'une fois). */
  private rafraichir(octroi: Octroi, connecteur: Connecteur, secrets: Secrets, forcer: boolean): Promise<Secrets> {
    const enCours = this.rafraichissements.get(octroi.id);
    if (enCours) return enCours;
    const promesse = (async () => {
      let nouveaux: Secrets | null;
      try {
        nouveaux = await connecteur.rafraichir!(secrets, octroi.details, forcer);
      } catch (e) {
        if (e instanceof ErreurFournisseur && e.code === "jeton_expire") {
          this.coffre.retirerOctroi(octroi.id);
          throw new ErreurFournisseur("jeton_expire", `L'autorisation ${connecteur.libelle} a été retirée ou a expiré : reconnectez le service dans Paperclip (Apps).`);
        }
        throw e;
      }
      if (!nouveaux) {
        if (forcer) throw new ErreurFournisseur("jeton_expire", `L'autorisation ${connecteur.libelle} a expiré et ne peut pas être renouvelée : reconnectez le service dans Paperclip (Apps).`);
        return secrets;
      }
      this.coffre.remplacerSecrets(octroi, nouveaux);
      return nouveaux;
    })().finally(() => this.rafraichissements.delete(octroi.id));
    this.rafraichissements.set(octroi.id, promesse);
    return promesse;
  }

  private ressource(service: string): string {
    return `${sansBarreFinale(this.options.urlPasserelle())}/mcp/${service}`;
  }

  private serviceDeRessource(resource: string): ServiceSocialCrm | null {
    for (const service of this.options.connecteurs.keys()) if (sansBarreFinale(resource) === this.ressource(service)) return service;
    return null;
  }

  // --- Serveur HTTP --------------------------------------------------------------------------------

  ecouter(hote: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const serveur = createServer((req, res) => {
        res.on("finish", () => this.journal(`autorisation sociale ${req.method ?? "?"} ${(req.url ?? "").split("?")[0]} -> ${res.statusCode}`));
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

  /** Origines sous lesquelles ce serveur est servi : boucle locale, et l'adresse publique HTTPS si elle est déclarée. */
  private originesPropres(): string[] {
    const publique = this.options.config.urlRetourPublique;
    return [...originesBoucle(this.base), ...(publique ? [new URL(publique).origin] : [])];
  }

  private hoteAutorise(entete: string | undefined): boolean {
    if (!entete) return false;
    const port = new URL(this.base).port;
    if ([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(entete.toLowerCase())) return true;
    // Derrière un mandataire HTTPS déclaré (PASSERELLE_SOCIAL_URL_RETOUR), son nom d'hôte est accepté.
    const publique = this.options.config.urlRetourPublique;
    return publique !== null && new URL(publique).host === entete.toLowerCase();
  }

  private nettoyer(): void {
    const t = this.maintenant();
    for (const [c, v] of this.transactions) if (v.expire <= t) this.transactions.delete(c);
    for (const [c, v] of this.codes) if (v.expire <= t) this.codes.delete(c);
    for (const [c, v] of this.codesConsommes) if (v.expire <= t) this.codesConsommes.delete(c);
    this.coffre.nettoyerJetons(t);
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
    const pageHtml = chemin === "/oauth/authorize" || chemin.startsWith("/oauth/retour/") || chemin === "/oauth/amont" || chemin === "/oauth/formulaire" || chemin === "/oauth/choisir";
    try {
      // Aucune route de ce serveur n'est appelée par une page d'un autre site (S2) ; nos formulaires envoient
      // « Origin: null » (politique no-referrer) et restent protégés par leur identifiant de transaction.
      verifierOrigine(req, this.originesPropres());
      const retour = /^\/oauth\/retour\/([a-z]+)$/.exec(chemin);
      if (chemin === "/oauth/register" && req.method === "POST") await this.enregistrer(req, res);
      else if (chemin === "/oauth/authorize" && req.method === "GET") this.autoriser(res, url);
      else if (chemin === "/oauth/amont" && req.method === "GET") this.versAmont(res, url.searchParams.get("transaction") ?? "");
      else if (retour && req.method === "GET") await this.retourAmont(res, url, retour[1]!);
      else if (chemin === "/oauth/formulaire" && req.method === "POST") await this.formulaire(req, res);
      else if (chemin === "/oauth/choisir" && req.method === "POST") await this.choisir(req, res);
      else if (chemin === "/oauth/token" && req.method === "POST") await this.emettre(req, res);
      else throw new ErreurHttp(404, "not_found", "Chemin inconnu");
    } catch (erreur) {
      if (!(erreur instanceof ErreurHttp) && !(erreur instanceof RefusGarde)) throw erreur;
      if (pageHtml) this.page(res, erreur.statut, "Connexion impossible", `<p>${echapper(erreur.message)}</p>`);
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

  private async lireFormulaire(req: IncomingMessage): Promise<URLSearchParams> {
    const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/x-www-form-urlencoded") throw new ErreurHttp(400, "invalid_request", "Content-Type attendu : application/x-www-form-urlencoded");
    return new URLSearchParams(await this.lireCorps(req));
  }

  // --- Enregistrement dynamique (RFC 7591) -----------------------------------------------------------

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
    const client = { clientId: `passerelle-sociale-${aleatoire(16)}`, redirectUris: [...analyse.data.redirect_uris], clientName: analyse.data.client_name ?? null, emisLe: Math.floor(this.maintenant() / 1000) };
    // Table bornée, sans jamais évincer un client qui a une connexion vivante (S2).
    this.coffre.ajouterClient(client, (id) => this.clientVivant(id), this.options.limites?.maxClients ?? MAX_CLIENTS_DCR);
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
    if (this.coffre.clientAUnJetonVivant(clientId, this.maintenant())) return true;
    for (const c of this.codes.values()) if (c.clientId === clientId) return true;
    for (const tr of this.transactions.values()) if (tr.clientId === clientId) return true;
    return false;
  }

  // --- Autorisation ---------------------------------------------------------------------------------

  private autoriser(res: ServerResponse, url: URL): void {
    const q = url.searchParams;
    const client = this.coffre.client(q.get("client_id"));
    if (!client) throw new ErreurHttp(400, "invalid_client", "Client inconnu : refaire la connexion depuis Paperclip.");
    const redirectUri = q.get("redirect_uri") ?? "";
    if (!client.redirectUris.includes(redirectUri)) throw new ErreurHttp(400, "invalid_request", "redirect_uri non enregistrée pour ce client.");
    const etatClient = q.get("state");
    const echec = (code: string, description: string): void => this.rediriger(res, redirectUri, { error: code, error_description: description, state: etatClient });
    if (q.get("response_type") !== "code") return echec("unsupported_response_type", "response_type=code attendu");
    const challenge = q.get("code_challenge") ?? "";
    if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9\-_]{43}$/.test(challenge)) return echec("invalid_request", "PKCE S256 obligatoire");
    const resource = q.get("resource");
    const service = resource ? this.serviceDeRessource(resource) : null;
    if (!resource || !service) return echec("invalid_target", "Ressource absente ou inconnue (attendu : <passerelle>/mcp/<service>)");
    const connecteur = this.options.connecteurs.get(service)!;
    const demandees = (q.get("scope") ?? "").split(" ").filter((p) => p !== "");
    for (const p of demandees) {
      if (!connecteur.porteesPermises.includes(p)) return echec("invalid_scope", `Portée non permise pour ce service : ${p} (permises : ${connecteur.porteesPermises.join(" ")})`);
    }
    // Les portées « lecture » sont toujours demandées ; celles de publication s'y ajoutent si Paperclip les demande.
    const portees = [...new Set([...connecteur.porteesParDefaut, ...demandees])];
    const id = aleatoire(24);
    bornerTable(this.transactions, MAX_TRANSACTIONS);
    this.transactions.set(id, { clientId: client.clientId, redirectUri, etatClient, challengeClient: challenge, resource: sansBarreFinale(resource), service, portees, expire: this.maintenant() + DUREE_TRANSACTION_MS, verificateurAmont: aleatoire(48) });

    if (connecteur.oauth && !connecteur.formulaire) return this.versAmont(res, id);
    this.pageFormulaire(res, 200, id, connecteur, null);
  }

  private transaction(id: string): Transaction {
    const tr = this.transactions.get(id);
    if (!tr || tr.expire <= this.maintenant()) throw new ErreurHttp(400, "invalid_request", "Demande d'autorisation inconnue ou expirée : recommencer depuis Paperclip.");
    return tr;
  }

  private versAmont(res: ServerResponse, id: string): void {
    const tr = this.transaction(id);
    const connecteur = this.options.connecteurs.get(tr.service)!;
    if (!connecteur.urlAutorisation) throw new ErreurHttp(400, "invalid_request", "Connexion OAuth non configurée pour ce service.");
    const adresse = connecteur.urlAutorisation({ etat: id, retour: this.retourUri(tr.service), portees: tr.portees, challenge: calculerChallengeS256(tr.verificateurAmont) });
    res.writeHead(302, { location: adresse, "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  }

  private async retourAmont(res: ServerResponse, url: URL, service: string): Promise<void> {
    const q = url.searchParams;
    const id = q.get("state") ?? "";
    const tr = this.transaction(id);
    if (tr.service !== service) throw new ErreurHttp(400, "invalid_request", "Adresse de retour d'un autre service.");
    const connecteur = this.options.connecteurs.get(tr.service)!;
    const retourClient = (params: Record<string, string | null>): void => {
      this.transactions.delete(id);
      this.rediriger(res, tr.redirectUri, { ...params, state: tr.etatClient });
    };
    const erreurAmont = q.get("error");
    if (erreurAmont) {
      const refus = /access_denied|user_cancelled|denied/i.test(erreurAmont + (q.get("error_reason") ?? ""));
      return retourClient({ error: refus ? "access_denied" : "server_error", error_description: refus ? `Accès refusé sur l'écran de consentement ${connecteur.libelle}.` : `${connecteur.libelle} a refusé l'autorisation.` });
    }
    const code = q.get("code");
    if (!code || !connecteur.echangerCode) return retourClient({ error: "server_error", error_description: `${connecteur.libelle} n'a renvoyé aucun code.` });
    let resultat: ResultatAutorisation;
    try {
      resultat = await connecteur.echangerCode({ code, retour: this.retourUri(tr.service), verificateur: tr.verificateurAmont });
    } catch (e) {
      const message = e instanceof ErreurFournisseur ? e.message : `Échange du code refusé par ${connecteur.libelle}.`;
      return retourClient({ error: "server_error", error_description: message.slice(0, 300) });
    }
    this.apresAutorisation(res, id, tr, connecteur, resultat);
  }

  /** Un compte : code émis tout de suite ; plusieurs : page de choix ; aucun : erreur claire. */
  private apresAutorisation(res: ServerResponse, id: string, tr: Transaction, connecteur: Connecteur, resultat: ResultatAutorisation): void {
    if (resultat.comptes.length === 0) {
      this.transactions.delete(id);
      const quoi = tr.service === "facebook" ? "aucune Page Facebook" : tr.service === "linkedin" ? "aucune page LinkedIn (organisation) administrée" : "aucun compte";
      this.rediriger(res, tr.redirectUri, { error: "access_denied", error_description: `${connecteur.libelle} : ${quoi} n'est accessible avec ce compte.`, state: tr.etatClient });
      return;
    }
    if (resultat.comptes.length === 1) return this.finaliser(res, id, tr, resultat, resultat.comptes[0]!);
    tr.enAttente = resultat;
    const options = resultat.comptes
      .map((c, i) => `<label><input type="radio" name="compte" value="${i}"${i === 0 ? " checked" : ""}> ${echapper(c.libelle)}</label>`)
      .join("<br>");
    this.page(
      res,
      200,
      `${connecteur.libelle} : quel compte connecter ?`,
      `<form method="post" action="/oauth/choisir"><input type="hidden" name="transaction" value="${echapper(id)}">${options}<p><button type="submit">Connecter ce compte</button></p></form>`,
    );
  }

  private async choisir(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const f = await this.lireFormulaire(req);
    const id = f.get("transaction") ?? "";
    const tr = this.transaction(id);
    if (!tr.enAttente) throw new ErreurHttp(400, "invalid_request", "Aucun choix en attente pour cette demande.");
    const index = Number(f.get("compte"));
    const compte = Number.isInteger(index) ? tr.enAttente.comptes[index] : undefined;
    if (!compte) throw new ErreurHttp(400, "invalid_request", "Compte inconnu.");
    this.finaliser(res, id, tr, tr.enAttente, compte);
  }

  private async formulaire(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const f = await this.lireFormulaire(req);
    const id = f.get("transaction") ?? "";
    const tr = this.transaction(id);
    const connecteur = this.options.connecteurs.get(tr.service)!;
    if (!connecteur.formulaire || !connecteur.validerFormulaire) throw new ErreurHttp(400, "invalid_request", "Ce service ne se connecte pas par formulaire.");
    if (f.get("decision") === "refuser") {
      this.transactions.delete(id);
      this.rediriger(res, tr.redirectUri, { error: "access_denied", error_description: "Connexion annulée.", state: tr.etatClient });
      return;
    }
    const champs: Record<string, string> = {};
    for (const c of connecteur.formulaire) {
      const v = (f.get(c.nom) ?? "").trim();
      if (c.obligatoire && v === "") return this.pageFormulaire(res, 400, id, connecteur, `Champ obligatoire : ${c.libelle}.`);
      champs[c.nom] = v;
    }
    let resultat: ResultatAutorisation;
    try {
      resultat = await connecteur.validerFormulaire(champs);
    } catch (e) {
      const message = e instanceof ErreurFournisseur ? e.message.replace(/^\[[a-z_]+\] /, "") : "Vérification impossible.";
      return this.pageFormulaire(res, 400, id, connecteur, message);
    }
    this.apresAutorisation(res, id, tr, connecteur, resultat);
  }

  private finaliser(res: ServerResponse, id: string, tr: Transaction, resultat: ResultatAutorisation, compte: CompteChoisi): void {
    this.transactions.delete(id);
    const octroi = this.coffre.creerOctroi({
      id: aleatoire(16),
      service: tr.service,
      compte,
      portees: tr.portees,
      details: { ...resultat.details, ...(compte.details ?? {}) },
      secrets: { ...resultat.secrets, ...(compte.secrets ?? {}) },
      creeLe: this.maintenant(),
    });
    const notreCode = aleatoire(32);
    this.codes.set(empreinte(notreCode), { clientId: tr.clientId, redirectUri: tr.redirectUri, challenge: tr.challengeClient, resource: tr.resource, octroi: octroi.id, expire: this.maintenant() + DUREE_CODE_MS });
    this.rediriger(res, tr.redirectUri, { code: notreCode, state: tr.etatClient });
  }

  // --- Jetons de la passerelle --------------------------------------------------------------------

  private async emettre(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const f = await this.lireFormulaire(req);
    const client = this.coffre.client(f.get("client_id"));
    if (!client) throw new ErreurHttp(401, "invalid_client", "Client inconnu");
    const ressourceDemandee = f.get("resource");
    const grant = f.get("grant_type");

    if (grant === "authorization_code") {
      const cle = empreinte(f.get("code") ?? "");
      const consomme = this.codesConsommes.get(cle);
      if (consomme) {
        this.coffre.retirerOctroi(consomme.octroi); // rejeu : tout ce que le code avait produit est révoqué
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
      const ancien = this.coffre.jeton(cle);
      if (!ancien || ancien.type !== "rafraichissement" || ancien.clientId !== client.clientId || ancien.expire <= this.maintenant()) {
        throw new ErreurHttp(400, "invalid_grant", "Jeton de rafraîchissement invalide ou expiré");
      }
      if (ressourceDemandee && sansBarreFinale(ressourceDemandee) !== ancien.resource) throw new ErreurHttp(400, "invalid_target", "La ressource demandée diffère de celle autorisée");
      if (!this.coffre.octroi(ancien.octroi)) throw new ErreurHttp(400, "invalid_grant", "Autorisation retirée : refaire la connexion");
      this.coffre.retirerJeton(cle); // rotation
      this.repondreJetons(res, client.clientId, ancien.resource, ancien.octroi);
      return;
    }
    throw new ErreurHttp(400, "unsupported_grant_type", "grant_type non pris en charge");
  }

  private repondreJetons(res: ServerResponse, clientId: string, resource: string, octroi: string): void {
    const acces = aleatoire(32);
    const rafraichissement = aleatoire(32);
    const t = this.maintenant();
    this.coffre.ajouterJetons({
      [empreinte(acces)]: { type: "acces", clientId, resource, octroi, expire: t + DUREE_JETON_S * 1000 },
      [empreinte(rafraichissement)]: { type: "rafraichissement", clientId, resource, octroi, expire: t + DUREE_RAFRAICHISSEMENT_MS },
    });
    const portees = this.coffre.octroi(octroi)?.portees ?? [];
    this.json(res, 200, { access_token: acces, token_type: "Bearer", expires_in: DUREE_JETON_S, refresh_token: rafraichissement, ...(portees.length > 0 ? { scope: portees.join(" ") } : {}) });
  }

  // --- Réponses ------------------------------------------------------------------------------------

  private rediriger(res: ServerResponse, cible: string, params: Record<string, string | null>): void {
    const url = new URL(cible);
    for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
    url.searchParams.set("iss", this.base);
    res.writeHead(302, { location: url.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  }

  private json(res: ServerResponse, statut: number, corps: unknown): void {
    res.writeHead(statut, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(corps));
  }

  private page(res: ServerResponse, statut: number, titre: string, contenu: string): void {
    const html =
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${echapper(titre)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem}` +
      `label{display:block;margin:.8rem 0 .2rem}input[type=text],input[type=url],input[type=password]{width:100%;padding:.4rem}small{color:#555}` +
      `.erreur{color:#a00}</style></head><body><h1>${echapper(titre)}</h1>${contenu}</body></html>`;
    res.writeHead(statut, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    });
    res.end(html);
  }

  /** Formulaire « adresse et clé » (Odoo, Pipedrive), avec le bouton OAuth quand il existe. */
  private pageFormulaire(res: ServerResponse, statut: number, id: string, connecteur: Connecteur, erreur: string | null): void {
    const champs = (connecteur.formulaire ?? [])
      .map((c) => `<label for="${c.nom}">${echapper(c.libelle)}${c.obligatoire ? "" : " (facultatif)"}</label><input id="${c.nom}" name="${c.nom}" type="${c.type}" autocomplete="off"${c.obligatoire ? " required" : ""}><small>${echapper(c.aide)}</small>`)
      .join("");
    const oauth = connecteur.oauth
      ? `<p><a href="/oauth/amont?transaction=${encodeURIComponent(id)}">Se connecter avec ${echapper(connecteur.libelle)}</a></p><p>ou, avec un jeton d'API :</p>`
      : "";
    this.page(
      res,
      statut,
      `Connecter ${connecteur.libelle}`,
      `${erreur ? `<p class="erreur">${echapper(erreur)}</p>` : ""}${oauth}<form method="post" action="/oauth/formulaire"><input type="hidden" name="transaction" value="${echapper(id)}">${champs}` +
        `<p><button type="submit" name="decision" value="autoriser">Connecter</button> <button type="submit" name="decision" value="refuser" formnovalidate>Annuler</button></p></form>` +
        "<p><small>La clé est vérifiée auprès de votre outil puis conservée chiffrée par la passerelle de l'atelier ; elle n'est jamais montrée aux agents.</small></p>",
    );
  }
}
