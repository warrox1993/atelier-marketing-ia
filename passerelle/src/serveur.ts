// Serveur HTTP de la passerelle marketing (docs/connecteurs-conception.md §6.1).
//
// Une adresse par service (/mcp/<service>), transport « Streamable HTTP » sans
// session (ce que consomme la connexion native `mcp_remote` de Paperclip : un POST
// JSON-RPC par requête, réponse JSON), authentification par jeton porteur.
//   - il n'y a qu'un seul mode : réel. Un service sans fournisseur enregistré répond
//     « non_connecte » (HTTP 503), jamais des données simulées ;
//   - services locaux (osm, bce, bnb, liens : `autorisationLocale`) : serveur
//     d'autorisation local intégré (oauth-local.ts), jeton lié à la ressource demandée ;
//   - autres services (Google, réseaux sociaux, CRM) : le jeton porteur est vérifié par
//     le fournisseur (FournisseurService.verifierJeton : validité, expiration, audience)
//     AVANT toute requête MCP ; refus 401 avec WWW-Authenticate sinon. Le jeton est
//     ensuite transmis au fournisseur (ContexteAppel.jetonPorteur), et les métadonnées
//     annoncent les serveurs d'autorisation du fournisseur (lots L4 et social-CRM).
// Écoute uniquement sur la boucle locale ; en-tête Host et Origin contrôlés
// (protection contre le rebond DNS).

import { createServer, type IncomingMessage, type Server as ServeurHttp, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as ServeurMcp } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { HOTE_PAR_DEFAUT, PORT_PAR_DEFAUT, verifierHoteEcoute } from "./config.js";
import { RegistreFournisseurs, type ContexteAppel, type IdentiteAppel, type ModePasserelle } from "./fournisseurs.js";
import { MESSAGE_PORTEE_RETIREE, ServeurAutorisationLocal } from "./oauth-local.js";
import { appelerOutil, construireCatalogue, enveloppeAtelier, VERSION_PASSERELLE } from "./outils.js";
import { COMPTE_LOCAL, MOTIF_SERVICE, type Service } from "./services.js";
import type { SignataireEnveloppe } from "./signature-enveloppe.js";

const MAX_CORPS_MCP_OCTETS = 1024 * 1024;

/** Mode porté par l'enveloppe signée `_atelier.mode` : toujours « reel » (il n'y a plus de mode démonstration). */
const MODE: ModePasserelle = "reel";

export interface OptionsServeur {
  /** Adresse d'écoute : 127.0.0.1 (défaut) ou ::1. Toute autre valeur est refusée. */
  hote?: string;
  /** Port d'écoute ; 0 = port libre choisi par le système (tests). */
  port?: number;
  registre?: RegistreFournisseurs;
  /** Désactive l'exigence de jeton : acceptée seulement si NODE_ENV=test ou VITEST, sinon erreur au démarrage. */
  sansAuthentification?: boolean;
  journal?: (message: string) => void;
  /** Fichier d'état de l'autorisation locale (clients, empreintes de jetons) qui survit au redémarrage. */
  fichierEtat?: string;
  /** Signature de l'enveloppe `_atelier` de chaque réponse d'outil (revue S9) ; absente : réponses non signées. */
  signataire?: SignataireEnveloppe | null;
}

export interface ServeurPasserelle {
  /** Démarre l'écoute et renvoie l'URL de base (http://127.0.0.1:<port>). */
  ecouter(): Promise<string>;
  arreter(): Promise<void>;
  /** URL de base, valable après `ecouter()`. */
  urlBase(): string;
}

function envoyerJson(res: ServerResponse, statut: number, corps: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(statut, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(corps));
}

function hoteLocalAutorise(entete: string | undefined, port: number): boolean {
  if (!entete) return false;
  const autorises = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  return autorises.includes(entete.toLowerCase());
}

function origineLocaleAutorisee(origine: string, port: number): boolean {
  try {
    const url = new URL(origine);
    return (
      url.protocol === "http:" &&
      Number(url.port || 80) === port &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

async function lireCorpsJson(req: IncomingMessage): Promise<{ ok: true; valeur: unknown } | { ok: false; statut: number }> {
  const morceaux: Buffer[] = [];
  let total = 0;
  for await (const morceau of req) {
    const tampon = Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau as string);
    total += tampon.length;
    if (total > MAX_CORPS_MCP_OCTETS) return { ok: false, statut: 413 };
    morceaux.push(tampon);
  }
  try {
    return { ok: true, valeur: JSON.parse(Buffer.concat(morceaux).toString("utf8")) };
  } catch {
    return { ok: false, statut: 400 };
  }
}

export function creerServeur(options: OptionsServeur): ServeurPasserelle {
  const mode = MODE;
  const hote = verifierHoteEcoute(options.hote ?? HOTE_PAR_DEFAUT);
  const portDemande = options.port ?? PORT_PAR_DEFAUT;
  const registre = options.registre ?? new RegistreFournisseurs();
  const journal = options.journal ?? ((): void => undefined);
  if (options.sansAuthentification === true && process.env.NODE_ENV !== "test" && process.env.VITEST === undefined) {
    throw new Error("L'option sansAuthentification est réservée aux tests (NODE_ENV=test ou VITEST) : démarrage refusé.");
  }
  const exigerJeton = options.sansAuthentification !== true;

  let portReel = portDemande;
  let urlDeBase = "";
  function fournisseurDe(service: Service) {
    return registre.obtenir(service);
  }

  /** Service à autorisation locale (osm, bce, bnb, liens) : son accès est accordé par le serveur d'autorisation local. */
  function estLocal(service: Service): boolean {
    return fournisseurDe(service)?.autorisationLocale === true;
  }

  // Le serveur d'autorisation local ne connaît que les services locaux branchés : les autres ont leur propre autorisation.
  const autorisation = new ServeurAutorisationLocal({
    urlBase: () => urlDeBase,
    fiche: (nom) => (estLocal(nom) ? registre.fiche(nom) : undefined),
    ...(options.fichierEtat ? { fichierEtat: options.fichierEtat } : {}),
  });

  /** Un service est servi seulement s'il a un fournisseur réel enregistré ; sinon il répond « non_connecte ». */
  function serviceConnecte(service: Service): boolean {
    return registre.fiche(service) !== undefined && fournisseurDe(service) !== undefined;
  }

  function reponseNonConnecte(res: ServerResponse, service: Service): void {
    envoyerJson(res, 503, {
      error: "non_connecte",
      message: `Le service ${service} n'est pas connecté : aucun fournisseur réel n'est configuré sur la passerelle. Aucune donnée simulée n'est jamais renvoyée.`,
    });
  }

  function enteteChallenge(service: Service, erreur: boolean): string {
    const meta = `${urlDeBase}/.well-known/oauth-protected-resource/mcp/${service}`;
    return `Bearer resource_metadata="${meta}"${erreur ? ', error="invalid_token"' : ""}`;
  }

  async function traiterMcp(req: IncomingMessage, res: ServerResponse, service: Service): Promise<void> {
    if (req.method !== "POST") {
      // Pas de session ni de flux serveur : GET et DELETE ne sont pas pris en charge (MCP 405).
      envoyerJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Méthode non permise : POST seulement." }, id: null }, { allow: "POST" });
      return;
    }
    if (!serviceConnecte(service)) {
      reponseNonConnecte(res, service);
      return;
    }

    // Authentification par jeton porteur.
    let identite: IdentiteAppel = {
      compte: COMPTE_LOCAL,
      propriete: registre.fiche(service)?.proprietes?.[0] ?? null,
    };
    let jetonPorteur: string | null = null;
    if (exigerJeton) {
      const entete = req.headers.authorization ?? "";
      const correspondance = /^Bearer\s+(\S+)$/i.exec(entete);
      jetonPorteur = correspondance?.[1] ?? null;
      if (!jetonPorteur) {
        envoyerJson(res, 401, { error: "unauthorized", message: "Jeton porteur requis." }, { "www-authenticate": enteteChallenge(service, false) });
        return;
      }
      if (estLocal(service)) {
        const trouve = autorisation.verifierJeton(jetonPorteur, service);
        if (!trouve) {
          const message = autorisation.porteeRetiree(jetonPorteur) ? MESSAGE_PORTEE_RETIREE : "Jeton invalide, expiré ou destiné à un autre service.";
          envoyerJson(res, 401, { error: "invalid_token", message }, { "www-authenticate": enteteChallenge(service, true) });
          return;
        }
        identite = { compte: trouve.compte, propriete: trouve.propriete };
      } else {
        // Le fournisseur du service vérifie le jeton (validité, expiration, audience par service).
        // Sans fonction de vérification, refus : jamais de jeton accepté par défaut (revue S1).
        const verifier = fournisseurDe(service)?.verifierJeton;
        const trouve = verifier ? verifier(jetonPorteur, service) : null;
        if (!trouve) {
          envoyerJson(res, 401, { error: "invalid_token", message: "Jeton invalide, expiré, révoqué ou destiné à un autre service." }, { "www-authenticate": enteteChallenge(service, true) });
          return;
        }
        identite = trouve;
      }
    }

    const corps = await lireCorpsJson(req);
    if (!corps.ok) {
      envoyerJson(res, corps.statut, { jsonrpc: "2.0", error: { code: corps.statut === 413 ? -32600 : -32700, message: corps.statut === 413 ? "Corps trop volumineux" : "JSON invalide" }, id: null });
      return;
    }

    const catalogue = construireCatalogue(registre.fiche(service)!, mode, fournisseurDe(service));
    const contexte: ContexteAppel = { service, mode, identite, jetonPorteur };

    // Serveur MCP sans état : un par requête (modèle sans session du SDK).
    const serveurMcp = new ServeurMcp(
      { name: `passerelle-marketing-${service}`, version: VERSION_PASSERELLE },
      {
        capabilities: { tools: {} },
        instructions: "Passerelle marketing : données réelles uniquement (un service non connecté répond « non_connecte »).",
      },
    );
    serveurMcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: catalogue.descripteurs }));
    serveurMcp.setRequestHandler(CallToolRequestSchema, async (requete) =>
      appelerOutil(catalogue, requete.params.name, requete.params.arguments, contexte, options.signataire ?? null),
    );
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void serveurMcp.close();
    });
    await serveurMcp.connect(transport);
    await transport.handleRequest(req, res, corps.valeur);
  }

  async function aiguiller(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Protection contre le rebond DNS : Host et Origin doivent désigner la boucle locale.
    if (!hoteLocalAutorise(req.headers.host, portReel)) {
      envoyerJson(res, 403, { error: "hote_refuse", message: "En-tête Host refusé." });
      return;
    }
    const origine = req.headers.origin;
    if (typeof origine === "string" && !origineLocaleAutorisee(origine, portReel)) {
      envoyerJson(res, 403, { error: "origine_refusee", message: "Origine refusée." });
      return;
    }
    const url = new URL(req.url ?? "/", urlDeBase);
    const chemin = url.pathname;

    if (chemin === "/sante" && req.method === "GET") {
      // `mode: "reel"` est conservé pour le plugin (il lit `mode` puis `services`) ; `services` = services connectés.
      const tous = registre.fiches().map((f) => f.id);
      envoyerJson(res, 200, { ok: true, mode, version: VERSION_PASSERELLE, services: tous.filter(serviceConnecte), services_non_connectes: tous.filter((id) => !serviceConnecte(id)), _atelier: enveloppeAtelier(mode) });
      return;
    }

    const metaRessource = /^\/\.well-known\/oauth-protected-resource\/mcp\/([a-z0-9]+)$/.exec(chemin);
    if (metaRessource && req.method === "GET") {
      const nom = metaRessource[1]!;
      if (!MOTIF_SERVICE.test(nom) || registre.fiche(nom) === undefined) {
        envoyerJson(res, 404, { error: "service_inconnu" });
        return;
      }
      if (!serviceConnecte(nom)) {
        reponseNonConnecte(res, nom);
        return;
      }
      if (estLocal(nom)) {
        envoyerJson(res, 200, autorisation.metadonneesRessource(nom));
      } else {
        const serveurs = fournisseurDe(nom)?.serveursAutorisation ?? [];
        if (serveurs.length === 0) {
          envoyerJson(res, 404, { error: "autorisation_non_annoncee" });
          return;
        }
        envoyerJson(res, 200, {
          resource: `${urlDeBase}/mcp/${nom}`,
          authorization_servers: [...serveurs],
          bearer_methods_supported: ["header"],
          scopes_supported: [...(registre.fiche(nom)?.portees ?? [])],
          resource_name: `Passerelle marketing : ${registre.fiche(nom)?.libelle ?? nom}`,
        });
      }
      return;
    }

    // Autorisation locale (services osm, bce, bnb, liens) : métadonnées du serveur et routes /oauth/*.
    if (chemin === "/.well-known/oauth-authorization-server" && req.method === "GET") {
      envoyerJson(res, 200, autorisation.metadonneesServeur());
      return;
    }
    if (await autorisation.traiter(req, res, url)) return;

    const route = /^\/mcp\/([a-z0-9]+)\/?$/.exec(chemin);
    if (route) {
      const nom = route[1]!;
      if (registre.fiche(nom) === undefined) {
        envoyerJson(res, 404, { error: "service_inconnu", message: `Services : ${registre.fiches().map((f) => f.id).join(", ")}` });
        return;
      }
      await traiterMcp(req, res, nom);
      return;
    }

    envoyerJson(res, 404, { error: "introuvable" });
  }

  const serveurHttp: ServeurHttp = createServer((req, res) => {
    // Journal d'accès : méthode, chemin (sans paramètres de requête : ils portent
    // codes et états OAuth) et statut. Jamais d'en-têtes ni de corps, donc jamais de jeton.
    res.on("finish", () => {
      journal(`${req.method ?? "?"} ${(req.url ?? "").split("?")[0]} -> ${res.statusCode}`);
    });
    aiguiller(req, res).catch((erreur: unknown) => {
      journal(`erreur interne : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      if (!res.headersSent) envoyerJson(res, 500, { error: "erreur_interne" });
      else res.end();
    });
  });

  return {
    urlBase: () => urlDeBase,
    ecouter: () =>
      new Promise<string>((resolve, reject) => {
        serveurHttp.once("error", reject);
        serveurHttp.listen(portDemande, hote, () => {
          const adresse = serveurHttp.address() as AddressInfo;
          portReel = adresse.port;
          urlDeBase = hote === "::1" ? `http://[::1]:${portReel}` : `http://${hote}:${portReel}`;
          serveurHttp.off("error", reject);
          journal(`passerelle à l'écoute sur ${urlDeBase}`);
          resolve(urlDeBase);
        });
      }),
    arreter: () =>
      new Promise<void>((resolve, reject) => {
        serveurHttp.close((erreur) => (erreur ? reject(erreur) : resolve()));
        serveurHttp.closeAllConnections();
      }),
  };
}
