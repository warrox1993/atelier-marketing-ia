// Particularités d'autorisation de chaque plateforme (côté « client » de la passerelle).
//
// La passerelle est le serveur d'autorisation que voit Paperclip (autorisation.ts) ; en amont, elle est
// le client OAuth de la plateforme, ou, pour Odoo et le jeton d'API Pipedrive, elle reçoit l'adresse et la
// clé que le client colle dans un formulaire. Chaque connecteur dit comment obtenir les secrets, comment
// choisir le compte (page, organisation, portail...) et comment les renouveler.
//
// Sources (consultées le 15/10/2026) :
//   Facebook Login, flux manuel   https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
//   Jetons longue durée et Pages   https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
//   Instagram Business Login       https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
//   LinkedIn OAuth 3 étapes        https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
//   LinkedIn rafraîchissement      https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
//   HubSpot OAuth v3               https://developers.hubspot.com/docs/api-reference/auth-oauth-v3/guide
//   Pipedrive OAuth                https://pipedrive.readme.io/docs/marketplace-oauth-authorization (api_domain)
//   Pipedrive OpenAPI v1/v2        https://developers.pipedrive.com/docs/api/v1/openapi.yaml, …/openapi-v2.yaml
//   Odoo JSON-2 et JSON-RPC        https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
//   Teamleader OAuth               https://developer.focus.teamleader.eu/docs/authentication

import { VERSION_GRAPH_META, VERSION_LINKEDIN, type ConfigSocialCrmReel, type IdentifiantsApplication, type ServiceSocialCrm } from "./config.js";
import { envoyer, ErreurFournisseur, verifierReponse, type Plateforme } from "./http.js";
import { DestinationRefusee, resoudreDestination, type Resolveur } from "./reseau-sur.js";

/** Secrets d'un octroi : chiffrés au repos, jamais journalisés, jamais renvoyés à l'agent. */
export interface Secrets {
  acces?: string;
  /** Expiration du jeton d'accès (ms Unix), si connue. */
  expireAcces?: number;
  rafraichissement?: string;
  /** Jeton d'accès de longue durée, horodatage d'obtention (Instagram : rafraîchissable après 24 h). */
  obtenuLe?: number;
  /** Jeton ou clé d'API (Pipedrive, Odoo). */
  cleApi?: string;
}

/** Informations non secrètes de l'octroi : adresse d'API, version d'Odoo, identifiant d'utilisateur... */
export type Details = Record<string, string | number | null>;

export interface CompteChoisi {
  id: string;
  libelle: string;
  /** Secrets propres au compte (jeton de Page Facebook), fusionnés aux secrets de l'octroi. */
  secrets?: Secrets;
  details?: Details;
}

export interface ResultatAutorisation {
  secrets: Secrets;
  details: Details;
  comptes: CompteChoisi[];
}

export interface ChampFormulaire {
  nom: string;
  libelle: string;
  type: "text" | "password" | "url";
  obligatoire: boolean;
  aide: string;
}

export interface Connecteur {
  service: ServiceSocialCrm;
  plateforme: Plateforme;
  libelle: string;
  /** OAuth amont disponible (application configurée par l'opérateur). */
  oauth: boolean;
  /** Formulaire « adresse ou clé » (Odoo, jeton d'API Pipedrive). */
  formulaire: ChampFormulaire[] | null;
  /** Portées amont demandées par défaut (lecture) et portées permises (lecture et publication). */
  porteesParDefaut: string[];
  porteesPermises: string[];
  urlAutorisation?(p: { etat: string; retour: string; portees: string[]; challenge: string }): string;
  echangerCode?(p: { code: string; retour: string; verificateur: string }): Promise<ResultatAutorisation>;
  validerFormulaire?(champs: Record<string, string>): Promise<ResultatAutorisation>;
  /** Renouvelle l'accès ; renvoie les secrets mis à jour, ou null si la plateforme n'en permet pas (reconnexion). */
  rafraichir?(secrets: Secrets, details: Details, forcer: boolean): Promise<Secrets | null>;
  /** Faut-il renouveler avant l'appel ? */
  doitRafraichir?(secrets: Secrets, maintenant: number): boolean;
}

const objet = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texte = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Échange OAuth : requête de formulaire, erreurs rendues sans jamais citer un secret. */
async function echangeJeton(
  config: ConfigSocialCrmReel,
  plateforme: Plateforme,
  url: string,
  corps: URLSearchParams,
  methode: "POST" | "GET" = "POST",
  basic?: IdentifiantsApplication,
): Promise<Record<string, unknown>> {
  const requete = methode === "GET" ? { methode, url: `${url}?${corps.toString()}` } : { methode, url, corps };
  const reponse = await envoyer({ ...requete, ...(basic ? { auth: { type: "basic", utilisateur: basic.clientId, secret: basic.clientSecret } as const } : {}) }, plateforme, config.delaiAppelMs);
  if (reponse.statut < 200 || reponse.statut >= 300) {
    const j = objet(reponse.json);
    const erreur = texte(j["error"]) || texte(objet(j["error"])["message"]) || texte(j["status"]) || `HTTP ${reponse.statut}`;
    throw new ErreurFournisseur(
      /invalid_grant|BAD_REFRESH_TOKEN|expired|revoked/i.test(erreur) ? "jeton_expire" : "requete_invalide",
      `Échange d'autorisation refusé par la plateforme (${erreur.slice(0, 120)}).`,
    );
  }
  return objet(reponse.json);
}

async function lireJson(config: ConfigSocialCrmReel, plateforme: Plateforme, url: string, auth: { type: "bearer" | "pipedrive_api"; jeton: string }, cible: string, entetes?: Record<string, string>) {
  const reponse = await envoyer({ methode: "GET", url, auth, ...(entetes ? { entetes } : {}) }, plateforme, config.delaiAppelMs);
  verifierReponse(reponse, plateforme, cible);
  return objet(reponse.json);
}

// --- Facebook (Pages) ------------------------------------------------------------------------

function connecteurFacebook(config: ConfigSocialCrmReel, app: IdentifiantsApplication): Connecteur {
  const graph = `${config.adresses.metaGraph}/${VERSION_GRAPH_META}`;
  return {
    service: "facebook",
    plateforme: "meta",
    libelle: "Facebook (Pages)",
    oauth: true,
    formulaire: null,
    porteesParDefaut: ["pages_show_list", "pages_read_engagement", "read_insights"],
    porteesPermises: ["pages_show_list", "pages_read_engagement", "pages_read_user_engagement", "read_insights", "pages_manage_posts", "pages_manage_engagement", "pages_messaging"],
    urlAutorisation: ({ etat, retour, portees }) => {
      const u = new URL(config.adresses.metaDialogue);
      u.searchParams.set("client_id", app.clientId);
      u.searchParams.set("redirect_uri", retour);
      u.searchParams.set("state", etat);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", portees.join(","));
      return u.toString();
    },
    async echangerCode({ code, retour }) {
      const court = await echangeJeton(config, "meta", `${graph}/oauth/access_token`, new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: retour, code }), "GET");
      const jetonCourt = texte(court["access_token"]);
      if (!jetonCourt) throw new ErreurFournisseur("requete_invalide", "Meta n'a renvoyé aucun jeton.");
      // Jeton utilisateur de longue durée (environ 60 jours), puis jetons de Page (sans date d'expiration).
      const long = await echangeJeton(config, "meta", `${graph}/oauth/access_token`, new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.clientId, client_secret: app.clientSecret, fb_exchange_token: jetonCourt }), "GET");
      const jetonLong = texte(long["access_token"]) || jetonCourt;
      const pages = await lireJson(config, "meta", `${graph}/me/accounts?fields=id,name,access_token,tasks&limit=100`, { type: "bearer", jeton: jetonLong }, "la liste des Pages");
      const comptes: CompteChoisi[] = [];
      for (const p of Array.isArray(pages["data"]) ? pages["data"] : []) {
        const page = objet(p);
        const id = texte(page["id"]);
        const jeton = texte(page["access_token"]);
        if (id && jeton) comptes.push({ id, libelle: texte(page["name"]) || id, secrets: { acces: jeton } });
      }
      return { secrets: {}, details: {}, comptes };
    },
    // Un jeton de Page obtenu depuis un jeton utilisateur long n'expire pas : pas de renouvellement, reconnexion si refusé.
  };
}

// --- Instagram (connexion Instagram) ---------------------------------------------------------

const JOUR_MS = 86_400_000;

function connecteurInstagram(config: ConfigSocialCrmReel, app: IdentifiantsApplication): Connecteur {
  const graph = config.adresses.instagramGraph;
  return {
    service: "instagram",
    plateforme: "instagram",
    libelle: "Instagram professionnel",
    oauth: true,
    formulaire: null,
    porteesParDefaut: ["instagram_business_basic", "instagram_business_manage_insights"],
    porteesPermises: ["instagram_business_basic", "instagram_business_manage_insights", "instagram_business_content_publish"],
    urlAutorisation: ({ etat, retour, portees }) => {
      const u = new URL(config.adresses.instagramAutorisation);
      u.searchParams.set("client_id", app.clientId);
      u.searchParams.set("redirect_uri", retour);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", portees.join(","));
      u.searchParams.set("state", etat);
      return u.toString();
    },
    async echangerCode({ code, retour }) {
      const court = await echangeJeton(config, "instagram", config.adresses.instagramJeton, new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: "authorization_code", redirect_uri: retour, code }));
      // Réponse documentée : { access_token, user_id, permissions } (certaines versions l'enveloppent dans data[]).
      const premier = Array.isArray(court["data"]) ? objet(court["data"][0]) : court;
      const jetonCourt = texte(premier["access_token"]);
      if (!jetonCourt) throw new ErreurFournisseur("requete_invalide", "Instagram n'a renvoyé aucun jeton.");
      const long = await echangeJeton(config, "instagram", `${graph}/access_token`, new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: app.clientSecret, access_token: jetonCourt }), "GET");
      const jeton = texte(long["access_token"]);
      if (!jeton) throw new ErreurFournisseur("requete_invalide", "Instagram n'a pas fourni de jeton de longue durée.");
      const maintenant = Date.now();
      const moi = await lireJson(config, "instagram", `${graph}/${VERSION_GRAPH_META}/me?fields=user_id,username`, { type: "bearer", jeton }, "le compte Instagram");
      const id = texte(moi["user_id"]) || texte(premier["user_id"]) || texte(moi["id"]);
      if (!id) throw new ErreurFournisseur("requete_invalide", "Instagram n'a pas indiqué le compte professionnel connecté.");
      return {
        secrets: { acces: jeton, obtenuLe: maintenant, expireAcces: maintenant + Number(long["expires_in"] ?? 5_184_000) * 1000 },
        details: {},
        comptes: [{ id, libelle: texte(moi["username"]) ? `@${texte(moi["username"])}` : id }],
      };
    },
    // Rafraîchissable après 24 h ; on renouvelle quand il reste moins de 30 jours.
    doitRafraichir: (s, maintenant) => s.expireAcces !== undefined && s.obtenuLe !== undefined && maintenant - s.obtenuLe > JOUR_MS && s.expireAcces - maintenant < 30 * JOUR_MS,
    async rafraichir(secrets) {
      if (!secrets.acces) return null;
      const r = await echangeJeton(config, "instagram", `${graph}/refresh_access_token`, new URLSearchParams({ grant_type: "ig_refresh_token", access_token: secrets.acces }), "GET");
      const jeton = texte(r["access_token"]);
      if (!jeton) return null;
      const maintenant = Date.now();
      return { ...secrets, acces: jeton, obtenuLe: maintenant, expireAcces: maintenant + Number(r["expires_in"] ?? 5_184_000) * 1000 };
    },
  };
}

// --- Rafraîchissement OAuth standard (LinkedIn, HubSpot, Pipedrive, Teamleader) ------------------

async function rafraichirStandard(
  config: ConfigSocialCrmReel,
  plateforme: Plateforme,
  url: string,
  app: IdentifiantsApplication,
  secrets: Secrets,
  basic = false,
): Promise<Secrets | null> {
  if (!secrets.rafraichissement) return null;
  const corps = new URLSearchParams({ grant_type: "refresh_token", refresh_token: secrets.rafraichissement });
  if (!basic) {
    corps.set("client_id", app.clientId);
    corps.set("client_secret", app.clientSecret);
  }
  const r = await echangeJeton(config, plateforme, url, corps, "POST", basic ? app : undefined);
  const acces = texte(r["access_token"]);
  if (!acces) return null;
  return {
    ...secrets,
    acces,
    // Teamleader : le jeton de rafraîchissement est à usage unique, le nouveau remplace l'ancien.
    rafraichissement: texte(r["refresh_token"]) || secrets.rafraichissement,
    expireAcces: Date.now() + Number(r["expires_in"] ?? 3600) * 1000,
  };
}

const presqueExpire = (s: Secrets, maintenant: number): boolean => s.expireAcces !== undefined && s.expireAcces - 60_000 <= maintenant;

// --- LinkedIn (pages d'organisation) -----------------------------------------------------------

function connecteurLinkedin(config: ConfigSocialCrmReel, app: IdentifiantsApplication): Connecteur {
  const entetes = { "Linkedin-Version": VERSION_LINKEDIN, "X-Restli-Protocol-Version": "2.0.0" };
  return {
    service: "linkedin",
    plateforme: "linkedin",
    libelle: "LinkedIn (pages)",
    oauth: true,
    formulaire: null,
    // rw_organization_admin : liste des organisations administrées et statistiques de partage (documentation share-statistics).
    porteesParDefaut: ["r_organization_social", "rw_organization_admin"],
    porteesPermises: ["r_organization_social", "rw_organization_admin", "w_organization_social"],
    urlAutorisation: ({ etat, retour, portees }) => {
      const u = new URL(config.adresses.linkedinAutorisation);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", app.clientId);
      u.searchParams.set("redirect_uri", retour);
      u.searchParams.set("state", etat);
      u.searchParams.set("scope", portees.join(" "));
      return u.toString();
    },
    async echangerCode({ code, retour }) {
      const r = await echangeJeton(config, "linkedin", config.adresses.linkedinJeton, new URLSearchParams({ grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: retour }));
      const acces = texte(r["access_token"]);
      if (!acces) throw new ErreurFournisseur("requete_invalide", "LinkedIn n'a renvoyé aucun jeton.");
      const secrets: Secrets = { acces, expireAcces: Date.now() + Number(r["expires_in"] ?? 5_184_000) * 1000 };
      if (texte(r["refresh_token"])) secrets.rafraichissement = texte(r["refresh_token"]);
      // Organisations dont la personne est administratrice (organizationAcls, rôle ADMINISTRATOR approuvé).
      const acl = await lireJson(
        config,
        "linkedin",
        `${config.adresses.linkedinApi}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100`,
        { type: "bearer", jeton: acces },
        "la liste des organisations administrées",
        entetes,
      );
      const comptes: CompteChoisi[] = [];
      for (const e of Array.isArray(acl["elements"]) ? acl["elements"] : []) {
        const urn = texte(objet(e)["organization"]) || texte(objet(e)["organizationTarget"]);
        if (urn.startsWith("urn:li:organization:")) comptes.push({ id: urn, libelle: urn });
      }
      return { secrets, details: {}, comptes };
    },
    doitRafraichir: presqueExpire,
    rafraichir: (s) => rafraichirStandard(config, "linkedin", config.adresses.linkedinJeton, app, s),
  };
}

// --- HubSpot -------------------------------------------------------------------------------------

function connecteurHubspot(config: ConfigSocialCrmReel, app: IdentifiantsApplication): Connecteur {
  return {
    service: "crm",
    plateforme: "hubspot",
    libelle: "CRM (HubSpot)",
    oauth: true,
    formulaire: null,
    porteesParDefaut: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    porteesPermises: ["crm.objects.contacts.read", "crm.objects.deals.read", "crm.objects.contacts.write", "crm.objects.deals.write", "oauth"],
    urlAutorisation: ({ etat, retour, portees }) => {
      const u = new URL(config.adresses.hubspotAutorisation);
      u.searchParams.set("client_id", app.clientId);
      u.searchParams.set("redirect_uri", retour);
      u.searchParams.set("scope", portees.join(" "));
      u.searchParams.set("state", etat);
      return u.toString();
    },
    async echangerCode({ code, retour }) {
      const r = await echangeJeton(config, "hubspot", config.adresses.hubspotJeton, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: retour, client_id: app.clientId, client_secret: app.clientSecret }));
      const acces = texte(r["access_token"]);
      if (!acces) throw new ErreurFournisseur("requete_invalide", "HubSpot n'a renvoyé aucun jeton.");
      const hub = texte(r["hub_id"]);
      return {
        secrets: { acces, rafraichissement: texte(r["refresh_token"]), expireAcces: Date.now() + Number(r["expires_in"] ?? 1800) * 1000 },
        details: {},
        comptes: [{ id: hub || "portail", libelle: hub ? `Portail HubSpot ${hub}` : "Portail HubSpot" }],
      };
    },
    doitRafraichir: presqueExpire,
    rafraichir: (s) => rafraichirStandard(config, "hubspot", config.adresses.hubspotJeton, app, s),
  };
}

// --- Pipedrive -------------------------------------------------------------------------------------

const MOTIF_SOCIETE_PIPEDRIVE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** « https://acme.pipedrive.com », « acme.pipedrive.com » ou « acme » → « acme ». */
export function societePipedrive(saisie: string): string {
  let s = saisie.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.pipedrive\.com$/, "");
  if (!MOTIF_SOCIETE_PIPEDRIVE.test(s)) throw new ErreurFournisseur("requete_invalide", "Adresse Pipedrive invalide : attendu « votre-societe.pipedrive.com ».");
  return s;
}

function connecteurPipedrive(config: ConfigSocialCrmReel, app: IdentifiantsApplication | undefined): Connecteur {
  async function compteDepuis(base: string, auth: { type: "bearer" | "pipedrive_api"; jeton: string }): Promise<CompteChoisi> {
    const moi = await lireJson(config, "pipedrive", `${base}/api/v1/users/me`, auth, "l'utilisateur Pipedrive");
    const d = objet(moi["data"]);
    const domaine = texte(d["company_domain"]);
    const nom = texte(d["company_name"]);
    return { id: domaine || base, libelle: nom ? `${nom} (Pipedrive)` : domaine || "Société Pipedrive" };
  }
  return {
    service: "pipedrive",
    plateforme: "pipedrive",
    libelle: "CRM (Pipedrive)",
    oauth: app !== undefined,
    formulaire: [
      { nom: "societe", libelle: "Adresse Pipedrive", type: "text", obligatoire: true, aide: "Par exemple votre-societe.pipedrive.com" },
      { nom: "jeton", libelle: "Jeton d'API personnel", type: "password", obligatoire: true, aide: "Pipedrive : Paramètres personnels › API" },
    ],
    // Les portées Pipedrive sont fixées dans l'application du Marketplace, pas dans l'URL d'autorisation.
    porteesParDefaut: [],
    porteesPermises: ["base", "contacts:read", "contacts:full", "deals:read", "deals:full"],
    ...(app
      ? {
          urlAutorisation: ({ etat, retour }: { etat: string; retour: string }) => {
            const u = new URL(config.adresses.pipedriveAutorisation);
            u.searchParams.set("client_id", app.clientId);
            u.searchParams.set("redirect_uri", retour);
            u.searchParams.set("state", etat);
            return u.toString();
          },
          async echangerCode({ code, retour }: { code: string; retour: string }) {
            const r = await echangeJeton(config, "pipedrive", config.adresses.pipedriveJeton, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: retour }), "POST", app);
            const acces = texte(r["access_token"]);
            const domaine = texte(r["api_domain"]).replace(/\/+$/, "");
            if (!acces || !domaine) throw new ErreurFournisseur("requete_invalide", "Pipedrive n'a renvoyé ni jeton ni api_domain.");
            const base = config.essai ? domaine : (() => {
              const u = new URL(domaine);
              if (u.protocol !== "https:" || !u.hostname.endsWith(".pipedrive.com")) throw new ErreurFournisseur("requete_invalide", "api_domain Pipedrive inattendu.");
              return u.origin;
            })();
            const compte = await compteDepuis(base, { type: "bearer", jeton: acces });
            return {
              secrets: { acces, rafraichissement: texte(r["refresh_token"]), expireAcces: Date.now() + Number(r["expires_in"] ?? 3600) * 1000 },
              details: { base, mode: "oauth" },
              comptes: [compte],
            };
          },
          doitRafraichir: presqueExpire,
          rafraichir: (s: Secrets) => rafraichirStandard(config, "pipedrive", config.adresses.pipedriveJeton, app, s, true),
        }
      : {}),
    async validerFormulaire(champs) {
      const societe = societePipedrive(champs["societe"] ?? "");
      const jeton = (champs["jeton"] ?? "").trim();
      if (!/^[A-Za-z0-9]{20,100}$/.test(jeton)) throw new ErreurFournisseur("requete_invalide", "Jeton d'API Pipedrive invalide (lettres et chiffres).");
      const base = config.adresses.pipedriveSociete(societe);
      const compte = await compteDepuis(base, { type: "pipedrive_api", jeton });
      return { secrets: { cleApi: jeton }, details: { base, mode: "cle_api" }, comptes: [compte] };
    },
  };
}

// --- Odoo ------------------------------------------------------------------------------------------

/**
 * Adresse d'instance Odoo fournie par le client : https seulement, hôte public (aucune adresse privée, locale,
 * réservée ni IPv6 qui embarque une IPv4, y compris après résolution DNS), aucun identifiant dans l'URL. En essai :
 * boucle locale permise. Contrôle précoce pour un message clair dans le formulaire ; CHAQUE appel ultérieur refait
 * la résolution et se connecte à l'adresse vérifiée (http.ts, `adresseSaisie`, revue S4).
 */
export async function verifierAdresseInstance(saisie: string, essai: boolean, resoudre?: Resolveur): Promise<string> {
  let url: URL;
  try {
    url = new URL(saisie.trim().startsWith("http") ? saisie.trim() : `https://${saisie.trim()}`);
  } catch {
    throw new ErreurFournisseur("requete_invalide", "Adresse de l'instance Odoo invalide.");
  }
  if (url.username || url.password) throw new ErreurFournisseur("requete_invalide", "L'adresse de l'instance ne doit contenir aucun identifiant.");
  if (!essai && url.protocol !== "https:") throw new ErreurFournisseur("requete_invalide", "L'instance Odoo doit être servie en HTTPS.");
  try {
    await resoudreDestination(url, essai, resoudre);
  } catch (e) {
    if (e instanceof DestinationRefusee && e.motif === "introuvable") throw new ErreurFournisseur("introuvable", `Instance Odoo introuvable : ${url.hostname}.`);
    if (e instanceof DestinationRefusee && /HTTPS/.test(e.message)) throw new ErreurFournisseur("requete_invalide", "L'instance Odoo doit être servie en HTTPS.");
    throw new ErreurFournisseur("requete_invalide", "Adresse d'instance refusée : réseau privé ou local (ou plage réservée).");
  }
  return url.origin;
}

/** Version majeure d'Odoo d'après /web/version (« 19.0 », « saas~18.3 »...). */
export function versionMajeureOdoo(json: Record<string, unknown>): number {
  const info = json["version_info"];
  if (Array.isArray(info) && typeof info[0] === "number") return info[0];
  const v = /(\d+)\./.exec(texte(json["version"]));
  return v ? Number(v[1]) : 0;
}

function connecteurOdoo(config: ConfigSocialCrmReel): Connecteur {
  return {
    service: "odoo",
    plateforme: "odoo",
    libelle: "CRM (Odoo)",
    oauth: false,
    formulaire: [
      { nom: "instance", libelle: "Adresse de votre Odoo", type: "url", obligatoire: true, aide: "Par exemple https://votre-societe.odoo.com" },
      { nom: "cle", libelle: "Clé d'API", type: "password", obligatoire: true, aide: "Odoo : Préférences › Sécurité du compte › Nouvelle clé d'API" },
      { nom: "base", libelle: "Base de données (si plusieurs)", type: "text", obligatoire: false, aide: "Laisser vide si votre adresse suffit" },
      { nom: "identifiant", libelle: "Identifiant de connexion (Odoo 18 ou antérieur)", type: "text", obligatoire: false, aide: "Votre adresse de connexion à Odoo" },
    ],
    porteesParDefaut: [],
    porteesPermises: ["crm.lead:read", "crm.lead:write"],
    async validerFormulaire(champs): Promise<ResultatAutorisation> {
      const base = await verifierAdresseInstance(champs["instance"] ?? "", config.essai);
      const cle = (champs["cle"] ?? "").trim();
      if (cle.length < 16 || cle.length > 200 || /\s/.test(cle)) throw new ErreurFournisseur("requete_invalide", "Clé d'API Odoo invalide.");
      const nomBase = (champs["base"] ?? "").trim();
      const identifiant = (champs["identifiant"] ?? "").trim();
      if (nomBase && !/^[A-Za-z0-9_.-]{1,63}$/.test(nomBase)) throw new ErreurFournisseur("requete_invalide", "Nom de base de données invalide.");
      const garde = { adresseSaisie: { essai: config.essai } };
      const version = await envoyer({ methode: "GET", url: `${base}/web/version`, ...garde }, "odoo", config.delaiAppelMs);
      verifierReponse(version, "odoo", "la version de l'instance");
      const majeure = versionMajeureOdoo(objet(version.json));
      const libelle = `${new URL(base).hostname}${nomBase ? ` (${nomBase})` : ""}`;
      if (majeure >= 19) {
        // API JSON-2 : la clé suffit ; context_get vérifie la clé et renvoie le contexte de l'utilisateur.
        const r = await envoyer(
          { methode: "POST", url: `${base}/json/2/res.users/context_get`, corps: {}, auth: { type: "bearer", jeton: cle }, ...garde, ...(nomBase ? { entetes: { "X-Odoo-Database": nomBase } } : {}) },
          "odoo",
          config.delaiAppelMs,
        );
        verifierReponse(r, "odoo", "la clé d'API");
        return { secrets: { cleApi: cle }, details: { base, version: majeure, protocole: "json2", bd: nomBase || null }, comptes: [{ id: libelle, libelle: `Odoo ${majeure} · ${libelle}` }] };
      }
      // Repli JSON-RPC (Odoo 18 et antérieurs) : base et identifiant obligatoires, la clé sert de mot de passe.
      if (!nomBase || !identifiant) throw new ErreurFournisseur("requete_invalide", `Odoo ${majeure || "ancien"} : la base de données et l'identifiant de connexion sont nécessaires.`);
      const r = await envoyer(
        { methode: "POST", url: `${base}/jsonrpc`, corps: { jsonrpc: "2.0", method: "call", id: 1, params: { service: "common", method: "authenticate", args: [nomBase, identifiant, cle, {}] } }, ...garde },
        "odoo",
        config.delaiAppelMs,
      );
      verifierReponse(r, "odoo", "la connexion");
      const uid = objet(r.json)["result"];
      if (typeof uid !== "number" || uid <= 0) throw new ErreurFournisseur("jeton_expire", "Odoo a refusé l'identifiant ou la clé d'API.");
      return { secrets: { cleApi: cle }, details: { base, version: majeure, protocole: "jsonrpc", bd: nomBase, identifiant, uid }, comptes: [{ id: libelle, libelle: `Odoo ${majeure} · ${libelle}` }] };
    },
  };
}

// --- Teamleader Focus -------------------------------------------------------------------------------

function connecteurTeamleader(config: ConfigSocialCrmReel, app: IdentifiantsApplication): Connecteur {
  return {
    service: "teamleader",
    plateforme: "teamleader",
    libelle: "CRM (Teamleader)",
    oauth: true,
    formulaire: null,
    // Portées fixées dans l'intégration du Marketplace Teamleader, pas dans l'URL.
    porteesParDefaut: [],
    porteesPermises: ["contacts", "deals"],
    urlAutorisation: ({ etat, retour }) => {
      const u = new URL(config.adresses.teamleaderAutorisation);
      u.searchParams.set("client_id", app.clientId);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", retour);
      u.searchParams.set("state", etat);
      return u.toString();
    },
    async echangerCode({ code, retour }) {
      const r = await echangeJeton(config, "teamleader", config.adresses.teamleaderJeton, new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, code, grant_type: "authorization_code", redirect_uri: retour }));
      const acces = texte(r["access_token"]);
      if (!acces) throw new ErreurFournisseur("requete_invalide", "Teamleader n'a renvoyé aucun jeton.");
      const moi = await envoyer({ methode: "GET", url: `${config.adresses.teamleaderApi}/users.me`, auth: { type: "bearer", jeton: acces } }, "teamleader", config.delaiAppelMs);
      verifierReponse(moi, "teamleader", "l'utilisateur Teamleader");
      const compte = objet(objet(objet(moi.json)["data"])["account"]);
      const id = texte(compte["id"]) || "compte";
      return {
        secrets: { acces, rafraichissement: texte(r["refresh_token"]), expireAcces: Date.now() + Number(r["expires_in"] ?? 3600) * 1000 },
        details: {},
        comptes: [{ id, libelle: `Compte Teamleader ${id}` }],
      };
    },
    doitRafraichir: presqueExpire,
    rafraichir: (s) => rafraichirStandard(config, "teamleader", config.adresses.teamleaderJeton, app, s),
  };
}

/** Connecteurs des services servis par cette configuration. */
export function construireConnecteurs(config: ConfigSocialCrmReel): Map<ServiceSocialCrm, Connecteur> {
  const c = new Map<ServiceSocialCrm, Connecteur>();
  const a = config.applications;
  if (a.facebook) c.set("facebook", connecteurFacebook(config, a.facebook));
  if (a.instagram) c.set("instagram", connecteurInstagram(config, a.instagram));
  if (a.linkedin) c.set("linkedin", connecteurLinkedin(config, a.linkedin));
  if (a.crm) c.set("crm", connecteurHubspot(config, a.crm));
  c.set("pipedrive", connecteurPipedrive(config, a.pipedrive));
  c.set("odoo", connecteurOdoo(config));
  if (a.teamleader) c.set("teamleader", connecteurTeamleader(config, a.teamleader));
  return c;
}
