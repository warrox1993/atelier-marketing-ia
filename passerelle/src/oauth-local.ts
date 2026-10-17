// Serveur d'autorisation LOCAL de la passerelle (docs/connecteurs-conception.md §6.2).
//
// C'est le mécanisme par lequel l'instance (Paperclip) se connecte aux services réels sans compte de tiers
// (osm, bce, bnb, liens : données ou outils locaux). Il rejoue le parcours « Sign in to continue » de la route
// générique de Paperclip : métadonnées RFC 8414 et RFC 9728, enregistrement dynamique de client RFC 7591, code
// d'autorisation avec PKCE S256, indicateur de ressource RFC 8707, paramètre `iss` RFC 9207, rotation du jeton de
// rafraîchissement. Aucune donnée n'est simulée : la page de consentement propose seulement la source locale du
// service. (Anciennement « oauth-demo.ts » : renommé, car ce serveur n'est pas une démonstration.)
//
// État en mémoire. Sans `fichierEtat`, un redémarrage de la passerelle invalide
// clients et jetons (Paperclip réclame alors une nouvelle connexion). Avec
// `fichierEtat`, les clients enregistrés et les EMPREINTES SHA-256 des jetons
// (jamais les jetons eux-mêmes) survivent au redémarrage ; le fichier est en 0600.

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as z from "zod";
import { COMPTE_LOCAL, type FicheService, type Propriete, type Service } from "./services.js";
import { exigerCorpsJson, RefusGarde } from "./garde-oauth.js";

const DUREE_CODE_MS = 5 * 60 * 1000;
const DUREE_TRANSACTION_MS = 10 * 60 * 1000;
const DUREE_JETON_S = 3600;
const DUREE_RAFRAICHISSEMENT_MS = 30 * 24 * 3600 * 1000;
const MAX_CLIENTS = 200;
const MAX_TRANSACTIONS = 200;
const MAX_CORPS_OCTETS = 16 * 1024;

export const PORTEE_LOCALE = "local";
/** Portée retirée avec le mode démonstration : plus délivrée, et les jetons qui la portent sont refusés (reconnexion obligatoire). */
const PORTEE_RETIREE = "demonstration";
export const MESSAGE_PORTEE_RETIREE =
  "Jeton émis avant le retrait du mode démonstration : reconnecter le service (nouvelle autorisation avec la portée « local »).";

// ---------------------------------------------------------------------------
// PKCE (RFC 7636)
// ---------------------------------------------------------------------------

// Définies dans src/commun/pkce.ts (partagées avec les connecteurs réels), ré-exportées ici.
export { calculerChallengeS256, verifierPkceS256 } from "./commun/pkce.js";
import { calculerChallengeS256, MOTIF_CHALLENGE, verifierPkceS256 } from "./commun/pkce.js";

// ---------------------------------------------------------------------------
// Enregistrement dynamique de client (RFC 7591)
// ---------------------------------------------------------------------------

import { schemaEnregistrementClient, uriRedirectionAcceptable } from "./commun/enregistrement-client.js";
export { schemaEnregistrementClient, uriRedirectionAcceptable };

export interface ClientEnregistre {
  clientId: string;
  redirectUris: string[];
  clientName: string | null;
  grantTypes: string[];
  applicationType: string;
  emisLe: number;
}

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

export interface IdentiteJeton {
  service: Service;
  compte: string;
  propriete: Propriete;
}

interface Transaction {
  clientId: string;
  redirectUri: string;
  etat: string | null;
  challenge: string;
  resource: string;
  service: Service;
  expire: number;
}

interface CodeAutorisation {
  clientId: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  identite: IdentiteJeton;
  expire: number;
  /** Identifiant d'octroi : sert à révoquer les jetons si le code est rejoué. */
  octroi: string;
}

interface JetonEmis {
  clientId: string;
  resource: string;
  identite: IdentiteJeton;
  expire: number;
  octroi: string;
  /** Portée accordée ; absente dans les états écrits avant ce champ (déduite au chargement). */
  portee?: string;
}

export interface OptionsServeurAutorisation {
  /** URL de base de la passerelle (connue après l'écoute), sans barre finale. */
  urlBase: () => string;
  /** Fiche d'un service demandé (le registre en fait foi) ; undefined si le service n'est pas servi. */
  fiche: (service: string) => FicheService | undefined;
  maintenant?: () => number;
  /** Fichier d'état optionnel (JSON, 0600) : clients et empreintes de jetons. */
  fichierEtat?: string;
}

interface EtatPersiste {
  version: 1;
  clients: Array<[string, ClientEnregistre]>;
  jetons: Array<[string, JetonEmis]>;
  rafraichissements: Array<[string, JetonEmis]>;
}

const aleatoire = (octets = 32): string => randomBytes(octets).toString("base64url");
const empreinte = (jeton: string): string => createHash("sha256").update(jeton).digest("hex");

/**
 * États écrits avant le champ `portee` : un jeton issu du mode démonstration (client « demo-… » ou compte
 * « (démonstration) ») est marqué à la portée retirée ; les autres sont des jetons « local ».
 */
function marquerPortee(jeton: JetonEmis): JetonEmis {
  if (jeton.portee !== undefined) return jeton;
  const demo = jeton.clientId.startsWith("demo-") || /d[ée]monstration/i.test(jeton.identite?.compte ?? "");
  return { ...jeton, portee: demo ? PORTEE_RETIREE : PORTEE_LOCALE };
}

function sansBarreFinale(valeur: string): string {
  return valeur.replace(/\/+$/, "");
}

function echapperHtml(texte: string): string {
  return texte
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

class ErreurHttp extends Error {
  constructor(
    readonly statut: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Serveur d'autorisation
// ---------------------------------------------------------------------------

export class ServeurAutorisationLocal {
  private readonly clients = new Map<string, ClientEnregistre>();
  private readonly transactions = new Map<string, Transaction>();
  private readonly codes = new Map<string, CodeAutorisation>();
  /** Codes déjà échangés (empreinte -> octroi), pour détecter un rejeu. */
  private readonly codesConsommes = new Map<string, { octroi: string; expire: number }>();
  private readonly jetons = new Map<string, JetonEmis>();
  private readonly rafraichissements = new Map<string, JetonEmis>();

  constructor(private readonly options: OptionsServeurAutorisation) {
    if (options.fichierEtat) this.charger(options.fichierEtat);
  }

  private charger(fichier: string): void {
    let brut: unknown;
    try {
      brut = JSON.parse(readFileSync(fichier, "utf8"));
    } catch {
      return; // absent ou illisible : on repart d'un état vide
    }
    const etat = brut as Partial<EtatPersiste> | null;
    if (!etat || etat.version !== 1 || !Array.isArray(etat.clients) || !Array.isArray(etat.jetons) || !Array.isArray(etat.rafraichissements)) return;
    for (const [cle, client] of etat.clients) this.clients.set(cle, client);
    for (const [cle, jeton] of etat.jetons) this.jetons.set(cle, marquerPortee(jeton));
    for (const [cle, jeton] of etat.rafraichissements) this.rafraichissements.set(cle, marquerPortee(jeton));
    this.nettoyer();
  }

  private sauvegarder(): void {
    const fichier = this.options.fichierEtat;
    if (!fichier) return;
    const etat: EtatPersiste = {
      version: 1,
      clients: [...this.clients],
      jetons: [...this.jetons],
      rafraichissements: [...this.rafraichissements],
    };
    try {
      mkdirSync(dirname(fichier), { recursive: true, mode: 0o700 });
      const temporaire = `${fichier}.${process.pid}.tmp`;
      writeFileSync(temporaire, JSON.stringify(etat), { mode: 0o600 });
      chmodSync(temporaire, 0o600);
      renameSync(temporaire, fichier);
    } catch {
      // Un échec d'écriture ne doit pas casser le parcours : l'état reste en mémoire.
    }
  }

  private maintenant(): number {
    return (this.options.maintenant ?? Date.now)();
  }

  private urlBase(): string {
    return sansBarreFinale(this.options.urlBase());
  }

  /** Indicateur de ressource canonique d'un service (origine + chemin, sans barre finale). */
  urlRessource(service: Service): string {
    return `${this.urlBase()}/mcp/${service}`;
  }

  private serviceDeRessource(ressource: string): Service | null {
    const prefixe = `${this.urlBase()}/mcp/`;
    const brute = sansBarreFinale(ressource);
    if (!brute.startsWith(prefixe)) return null;
    const nom = brute.slice(prefixe.length);
    return this.options.fiche(nom) ? nom : null;
  }

  private fiche(service: Service): FicheService {
    const fiche = this.options.fiche(service);
    if (!fiche) throw new Error(`Service inconnu : ${service}`);
    return fiche;
  }

  // --- Métadonnées ---------------------------------------------------------

  metadonneesServeur(): Record<string, unknown> {
    const base = this.urlBase();
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [PORTEE_LOCALE],
      authorization_response_iss_parameter_supported: true,
    };
  }

  metadonneesRessource(service: Service): Record<string, unknown> {
    const fiche = this.fiche(service);
    return {
      resource: this.urlRessource(service),
      authorization_servers: [this.urlBase()],
      bearer_methods_supported: ["header"],
      scopes_supported: [PORTEE_LOCALE],
      resource_name: `Passerelle marketing : ${fiche.libelle}`,
    };
  }

  // --- Vérification des jetons (appelée par la route MCP) ------------------

  /** Identité liée au jeton si celui-ci est valide et destiné à cette ressource, sinon null. */
  verifierJeton(jeton: string, service: Service): IdentiteJeton | null {
    const trouve = this.jetons.get(empreinte(jeton));
    if (!trouve) return null;
    if (trouve.portee === PORTEE_RETIREE) return null;
    if (trouve.expire <= this.maintenant()) {
      this.jetons.delete(empreinte(jeton));
      return null;
    }
    if (sansBarreFinale(trouve.resource) !== this.urlRessource(service)) return null;
    return trouve.identite;
  }

  /** Vrai si le jeton existe mais porte la portée « demonstration » retirée (le client doit se reconnecter). */
  porteeRetiree(jeton: string): boolean {
    return this.jetons.get(empreinte(jeton))?.portee === PORTEE_RETIREE;
  }

  // --- Routage /oauth/* ----------------------------------------------------

  /** Traite une requête /oauth/* ; renvoie false si le chemin n'est pas géré ici. */
  async traiter(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const chemin = url.pathname;
    if (!chemin.startsWith("/oauth/")) return false;
    this.nettoyer();
    try {
      if (chemin === "/oauth/register") {
        this.exigerMethode(req, ["POST"]);
        await this.enregistrer(req, res);
      } else if (chemin === "/oauth/authorize") {
        this.exigerMethode(req, ["GET", "POST"]);
        if (req.method === "GET") this.afficherConsentement(res, url);
        else await this.decider(req, res);
      } else if (chemin === "/oauth/token") {
        this.exigerMethode(req, ["POST"]);
        await this.emettreJeton(req, res);
      } else {
        throw new ErreurHttp(404, "not_found", "Chemin inconnu");
      }
    } catch (erreur) {
      if (erreur instanceof ErreurHttp || erreur instanceof RefusGarde) {
        // Les routes /register et /token répondent en JSON ; /authorize en HTML.
        if (chemin === "/oauth/authorize") this.pageErreur(res, erreur.statut, erreur.message);
        else this.json(res, erreur.statut, { error: erreur.code, error_description: erreur.message });
      } else {
        this.json(res, 500, { error: "server_error", error_description: "Erreur interne" });
      }
    }
    return true;
  }

  private exigerMethode(req: IncomingMessage, permises: string[]): void {
    if (!req.method || !permises.includes(req.method)) {
      throw new ErreurHttp(405, "method_not_allowed", "Méthode non permise");
    }
  }

  private nettoyer(): void {
    const t = this.maintenant();
    for (const [cle, v] of this.transactions) if (v.expire <= t) this.transactions.delete(cle);
    for (const [cle, v] of this.codes) if (v.expire <= t) this.codes.delete(cle);
    for (const [cle, v] of this.codesConsommes) if (v.expire <= t) this.codesConsommes.delete(cle);
    for (const [cle, v] of this.jetons) if (v.expire <= t) this.jetons.delete(cle);
    for (const [cle, v] of this.rafraichissements) if (v.expire <= t) this.rafraichissements.delete(cle);
  }

  // --- Lecture du corps ----------------------------------------------------

  private async lireCorps(req: IncomingMessage): Promise<string> {
    const morceaux: Buffer[] = [];
    let total = 0;
    for await (const morceau of req) {
      const tampon = Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau as string);
      total += tampon.length;
      if (total > MAX_CORPS_OCTETS) throw new ErreurHttp(413, "invalid_request", "Corps de requête trop volumineux");
      morceaux.push(tampon);
    }
    return Buffer.concat(morceaux).toString("utf8");
  }

  private async lireFormulaire(req: IncomingMessage): Promise<URLSearchParams> {
    const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/x-www-form-urlencoded") {
      throw new ErreurHttp(400, "invalid_request", "Content-Type attendu : application/x-www-form-urlencoded");
    }
    return new URLSearchParams(await this.lireCorps(req));
  }

  // --- Enregistrement dynamique (RFC 7591) ---------------------------------

  private async enregistrer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    exigerCorpsJson(req); // RFC 7591 §3.1 ; un site tiers ne peut pas l'envoyer sans requête préalable CORS
    let brut: unknown;
    try {
      brut = JSON.parse(await this.lireCorps(req));
    } catch (erreur) {
      if (erreur instanceof ErreurHttp) throw erreur;
      throw new ErreurHttp(400, "invalid_client_metadata", "Corps JSON invalide");
    }
    const analyse = schemaEnregistrementClient.safeParse(brut);
    if (!analyse.success) {
      const redirection = analyse.error.issues.some((i) => i.path[0] === "redirect_uris");
      throw new ErreurHttp(
        400,
        redirection ? "invalid_redirect_uri" : "invalid_client_metadata",
        analyse.error.issues.map((i) => `${i.path.join(".") || "corps"} : ${i.message}`).join(" ; "),
      );
    }
    const donnees = analyse.data;
    if (this.clients.size >= MAX_CLIENTS) {
      // Le plus ancien client SANS connexion vivante cède la place : la démonstration ne grossit pas sans limite,
      // et une rafale d'enregistrements ne peut pas couper une connexion existante.
      const evincable = [...this.clients.keys()].find((id) => !this.clientVivant(id));
      if (evincable === undefined) throw new ErreurHttp(503, "temporarily_unavailable", "Table des clients pleine : réessayer plus tard.");
      this.clients.delete(evincable);
    }
    const client: ClientEnregistre = {
      clientId: `local-${aleatoire(16)}`,
      redirectUris: [...donnees.redirect_uris],
      clientName: donnees.client_name ?? null,
      grantTypes: donnees.grant_types ?? ["authorization_code"],
      applicationType: donnees.application_type ?? "web",
      emisLe: Math.floor(this.maintenant() / 1000),
    };
    this.clients.set(client.clientId, client);
    this.sauvegarder();
    this.json(res, 201, {
      client_id: client.clientId,
      client_id_issued_at: client.emisLe,
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: client.applicationType,
    });
  }

  private clientVivant(clientId: string): boolean {
    for (const j of this.jetons.values()) if (j.clientId === clientId) return true;
    for (const j of this.rafraichissements.values()) if (j.clientId === clientId) return true;
    for (const c of this.codes.values()) if (c.clientId === clientId) return true;
    for (const t of this.transactions.values()) if (t.clientId === clientId) return true;
    return false;
  }

  // --- Autorisation : page de consentement ---------------------------------

  private afficherConsentement(res: ServerResponse, url: URL): void {
    const q = url.searchParams;
    // Tant que le client et l'URI de redirection ne sont pas validés, on ne
    // redirige JAMAIS (RFC 6749 §4.1.2.1) : page d'erreur locale.
    const client = this.clients.get(q.get("client_id") ?? "");
    if (!client) throw new ErreurHttp(400, "invalid_client", "Client inconnu : refaire la connexion depuis Paperclip.");
    const redirectUri = q.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0]! : "");
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      throw new ErreurHttp(400, "invalid_request", "URI de redirection non enregistrée pour ce client.");
    }
    const etat = q.get("state");
    const erreurRedirigee = (code: string, description: string): void =>
      this.rediriger(res, redirectUri, { error: code, error_description: description, state: etat });

    if (q.get("response_type") !== "code") return erreurRedirigee("unsupported_response_type", "response_type=code requis");
    const challenge = q.get("code_challenge") ?? "";
    if (q.get("code_challenge_method") !== "S256" || !MOTIF_CHALLENGE.test(challenge)) {
      return erreurRedirigee("invalid_request", "PKCE S256 obligatoire (code_challenge et code_challenge_method=S256)");
    }
    const ressource = q.get("resource") ?? "";
    const service = ressource ? this.serviceDeRessource(ressource) : null;
    if (!service) return erreurRedirigee("invalid_target", "Indicateur de ressource inconnu ou absent (RFC 8707)");
    const portee = (q.get("scope") ?? "").split(/\s+/).filter(Boolean);
    const inconnues = portee.filter((p) => p !== PORTEE_LOCALE && p !== "offline_access");
    if (portee.includes(PORTEE_RETIREE)) return erreurRedirigee("invalid_scope", MESSAGE_PORTEE_RETIREE);
    if (inconnues.length > 0) return erreurRedirigee("invalid_scope", `Portée inconnue : ${inconnues.join(" ")}`);

    if (this.transactions.size >= MAX_TRANSACTIONS) {
      const plusAncienne = this.transactions.keys().next().value;
      if (plusAncienne !== undefined) this.transactions.delete(plusAncienne);
    }
    const identifiant = aleatoire(24);
    this.transactions.set(identifiant, {
      clientId: client.clientId,
      redirectUri,
      etat,
      challenge,
      resource: this.urlRessource(service),
      service,
      expire: this.maintenant() + DUREE_TRANSACTION_MS,
    });
    this.page(res, 200, this.htmlConsentement(identifiant, service, client, redirectUri), redirectUri);
  }

  private htmlConsentement(
    transaction: string,
    service: Service,
    client: ClientEnregistre,
    redirectUri: string,
  ): string {
    const fiche = this.fiche(service);
    const options = (fiche.proprietes ?? [])
      .map((p, i) => `<label class="choix"><input type="radio" name="propriete" value="${echapperHtml(p.id)}"${i === 0 ? " checked" : ""}> ${echapperHtml(p.libelle)}</label>`)
      .join("\n");
    const demandeur = client.clientName ?? "Paperclip";
    const destination = new URL(redirectUri).host;
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connexion locale</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem 1rem; background: #f4f1ec; color: #222; }
  main { max-width: 34rem; margin: 0 auto; background: #fff; border: 1px solid #cfc8bd; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  .bandeau { background: #fff3cd; border: 1px solid #d9b94b; padding: .5rem .75rem; margin: 0 0 1rem; }
  fieldset { border: 1px solid #cfc8bd; margin: 1rem 0; padding: .75rem; }
  .choix { display: block; margin: .25rem 0; }
  .actions { display: flex; gap: .75rem; margin-top: 1rem; }
  button { font: inherit; padding: .5rem 1rem; border: 1px solid #555; background: #fff; cursor: pointer; }
  button.principal { background: #2b4a3f; color: #fff; border-color: #2b4a3f; }
  small { color: #555; }
</style>
</head>
<body>
<main>
  <h1>${echapperHtml(fiche.libelle)} : connexion locale</h1>
  <p class="bandeau">Source locale de l'atelier : ${echapperHtml(COMPTE_LOCAL)}. Les données viennent de cette machine, aucun compte de tiers n'est utilisé.</p>
  <p><strong>${echapperHtml(demandeur)}</strong> demande l'accès à ce service local de la passerelle.</p>
  <form method="post" action="/oauth/authorize">
    <input type="hidden" name="transaction" value="${echapperHtml(transaction)}">
    <fieldset>
      <legend>Propriété à connecter</legend>
${options}
    </fieldset>
    <div class="actions">
      <button class="principal" type="submit" name="decision" value="autoriser">Autoriser</button>
      <button type="submit" name="decision" value="refuser">Refuser</button>
    </div>
  </form>
  <p><small>Retour vers ${echapperHtml(destination)} après votre choix.</small></p>
</main>
</body>
</html>
`;
  }

  // --- Autorisation : décision de l'utilisateur ----------------------------

  private async decider(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Défense contre une soumission venue d'un autre site : si le navigateur envoie
    // une origine, elle doit être celle de la passerelle.
    const origine = req.headers.origin;
    if (typeof origine === "string" && origine !== "null" && sansBarreFinale(origine) !== this.urlBase()) {
      throw new ErreurHttp(403, "access_denied", "Origine refusée.");
    }
    const formulaire = await this.lireFormulaire(req);
    const identifiant = formulaire.get("transaction") ?? "";
    const transaction = this.transactions.get(identifiant);
    if (!transaction) throw new ErreurHttp(400, "invalid_request", "Demande expirée ou déjà traitée : refaire la connexion depuis Paperclip.");
    this.transactions.delete(identifiant); // usage unique

    if (formulaire.get("decision") !== "autoriser") {
      this.rediriger(res, transaction.redirectUri, {
        error: "access_denied",
        error_description: "Connexion refusée par l'utilisateur",
        state: transaction.etat,
      });
      return;
    }
    const propriete = (this.fiche(transaction.service).proprietes ?? []).find((p) => p.id === formulaire.get("propriete"));
    if (!propriete) throw new ErreurHttp(400, "invalid_request", "Propriété inconnue pour ce service.");

    const code = aleatoire(32);
    this.codes.set(empreinte(code), {
      clientId: transaction.clientId,
      redirectUri: transaction.redirectUri,
      challenge: transaction.challenge,
      resource: transaction.resource,
      identite: { service: transaction.service, compte: COMPTE_LOCAL, propriete },
      expire: this.maintenant() + DUREE_CODE_MS,
      octroi: aleatoire(12),
    });
    this.rediriger(res, transaction.redirectUri, { code, state: transaction.etat });
  }

  // --- Jeton (RFC 6749 §4.1.3 et §6) ---------------------------------------

  private async emettreJeton(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const f = await this.lireFormulaire(req);
    const client = this.clients.get(f.get("client_id") ?? "");
    if (!client) throw new ErreurHttp(401, "invalid_client", "Client inconnu");
    const ressourceDemandee = f.get("resource");
    const grant = f.get("grant_type");

    if (grant === "authorization_code") {
      const code = f.get("code") ?? "";
      const cle = empreinte(code);
      const consomme = this.codesConsommes.get(cle);
      if (consomme) {
        // Rejeu d'un code : on révoque tout ce qu'il avait produit (RFC 6749 §4.1.2).
        this.revoquerOctroi(consomme.octroi);
        throw new ErreurHttp(400, "invalid_grant", "Code d'autorisation déjà utilisé");
      }
      const enregistre = this.codes.get(cle);
      if (!enregistre) throw new ErreurHttp(400, "invalid_grant", "Code d'autorisation inconnu ou expiré");
      this.codes.delete(cle);
      this.codesConsommes.set(cle, { octroi: enregistre.octroi, expire: this.maintenant() + DUREE_CODE_MS });
      if (enregistre.clientId !== client.clientId) throw new ErreurHttp(400, "invalid_grant", "Code émis pour un autre client");
      if (f.get("redirect_uri") !== enregistre.redirectUri) throw new ErreurHttp(400, "invalid_grant", "redirect_uri différente de celle de la demande");
      if (!verifierPkceS256(f.get("code_verifier") ?? "", enregistre.challenge)) {
        throw new ErreurHttp(400, "invalid_grant", "Vérification PKCE échouée");
      }
      if (ressourceDemandee && sansBarreFinale(ressourceDemandee) !== sansBarreFinale(enregistre.resource)) {
        throw new ErreurHttp(400, "invalid_target", "La ressource demandée diffère de celle autorisée");
      }
      this.repondreAvecJetons(res, client.clientId, enregistre.resource, enregistre.identite, enregistre.octroi);
      return;
    }

    if (grant === "refresh_token") {
      const brut = f.get("refresh_token") ?? "";
      const cle = empreinte(brut);
      const ancien = this.rafraichissements.get(cle);
      if (!ancien || ancien.clientId !== client.clientId) {
        throw new ErreurHttp(400, "invalid_grant", "Jeton de rafraîchissement invalide ou expiré");
      }
      if (ancien.portee === PORTEE_RETIREE) {
        this.rafraichissements.delete(cle);
        this.sauvegarder();
        throw new ErreurHttp(400, "invalid_grant", MESSAGE_PORTEE_RETIREE);
      }
      if (ressourceDemandee && sansBarreFinale(ressourceDemandee) !== sansBarreFinale(ancien.resource)) {
        throw new ErreurHttp(400, "invalid_target", "La ressource demandée diffère de celle autorisée");
      }
      this.rafraichissements.delete(cle); // rotation : usage unique
      this.repondreAvecJetons(res, client.clientId, ancien.resource, ancien.identite, ancien.octroi);
      return;
    }

    throw new ErreurHttp(400, "unsupported_grant_type", "grant_type permis : authorization_code, refresh_token");
  }

  private repondreAvecJetons(
    res: ServerResponse,
    clientId: string,
    resource: string,
    identite: IdentiteJeton,
    octroi: string,
  ): void {
    const acces = aleatoire(32);
    const rafraichissement = aleatoire(32);
    const t = this.maintenant();
    this.jetons.set(empreinte(acces), { clientId, resource, identite, octroi, portee: PORTEE_LOCALE, expire: t + DUREE_JETON_S * 1000 });
    this.rafraichissements.set(empreinte(rafraichissement), {
      clientId,
      resource,
      identite,
      octroi,
      portee: PORTEE_LOCALE,
      expire: t + DUREE_RAFRAICHISSEMENT_MS,
    });
    this.sauvegarder();
    this.json(res, 200, {
      access_token: acces,
      token_type: "Bearer",
      expires_in: DUREE_JETON_S,
      refresh_token: rafraichissement,
      scope: PORTEE_LOCALE,
    });
  }

  private revoquerOctroi(octroi: string): void {
    for (const [cle, v] of this.jetons) if (v.octroi === octroi) this.jetons.delete(cle);
    for (const [cle, v] of this.rafraichissements) if (v.octroi === octroi) this.rafraichissements.delete(cle);
    this.sauvegarder();
  }

  // --- Réponses ------------------------------------------------------------

  private rediriger(res: ServerResponse, redirectUri: string, params: Record<string, string | null | undefined>): void {
    const cible = new URL(redirectUri);
    for (const [cle, valeur] of Object.entries(params)) {
      if (valeur !== null && valeur !== undefined) cible.searchParams.set(cle, valeur);
    }
    cible.searchParams.set("iss", this.urlBase()); // RFC 9207
    res.writeHead(302, { location: cible.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  }

  private json(res: ServerResponse, statut: number, corps: unknown): void {
    res.writeHead(statut, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
    });
    res.end(JSON.stringify(corps));
  }

  private page(res: ServerResponse, statut: number, html: string, redirectUri?: string): void {
    // `form-action` doit nommer l'origine de retour : certains navigateurs
    // l'appliquent aussi à la redirection qui suit l'envoi du formulaire.
    const retour = redirectUri ? ` ${new URL(redirectUri).origin}` : "";
    res.writeHead(statut, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${retour}; frame-ancestors 'none'; base-uri 'none'`,
    });
    res.end(html);
  }

  private pageErreur(res: ServerResponse, statut: number, message: string): void {
    this.page(
      res,
      statut,
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Connexion impossible</title></head>` +
        `<body style="font:16px/1.5 system-ui,sans-serif;padding:2rem"><h1>Connexion impossible</h1><p>${echapperHtml(message)}</p></body></html>`,
    );
  }
}
