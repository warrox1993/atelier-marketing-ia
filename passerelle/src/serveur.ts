// Serveur HTTP de la passerelle marketing (docs/connecteurs-conception.md §6.1).
//
// Une adresse par service (/mcp/<service>), transport « Streamable HTTP » sans
// session (ce que consomme la connexion native `mcp_remote` de Paperclip : un POST
// JSON-RPC par requête, réponse JSON), authentification par jeton porteur.
//   - mode demonstration : serveur d'autorisation de démonstration intégré
//     (oauth-demo.ts), jeton lié à la ressource demandée ;
//   - mode reel : le jeton porteur est vérifié par le fournisseur réel du service
//     (FournisseurService.verifierJeton : validité, expiration, audience) AVANT toute
//     requête MCP ; refus 401 avec WWW-Authenticate sinon. Le jeton est ensuite
//     transmis au fournisseur (ContexteAppel.jetonPorteur), et les métadonnées
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
import { ServeurAutorisationDemo } from "./oauth-demo.js";
import { appelerOutil, construireCatalogue, enveloppeAtelier, VERSION_PASSERELLE } from "./outils.js";
import { COMPTE_DEMONSTRATION, MOTIF_SERVICE, type Service } from "./services.js";
import type { SignataireEnveloppe } from "./signature-enveloppe.js";

const MAX_CORPS_MCP_OCTETS = 1024 * 1024;

export interface OptionsServeur {
  mode: ModePasserelle;
  /** Adresse d'écoute : 127.0.0.1 (défaut) ou ::1. Toute autre valeur est refusée. */
  hote?: string;
  /** Port d'écoute ; 0 = port libre choisi par le système (tests). */
  port?: number;
  registre?: RegistreFournisseurs;
  /** Démonstration seulement : désactive l'exigence de jeton (tests unitaires). Jamais en production. */
  sansAuthentification?: boolean;
  journal?: (message: string) => void;
  /** Démonstration : fichier d'état OAuth (clients, empreintes de jetons) qui survit au redémarrage. */
  fichierEtat?: string;
  /** Signature de l'enveloppe `_atelier` de chaque réponse d'outil (revue S9) ; absente : réponses non signées. */
  signataire?: SignataireEnveloppe | null;
}

export interface ServeurPasserelle {
  readonly mode: ModePasserelle;
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
  const mode = options.mode;
  const hote = verifierHoteEcoute(options.hote ?? HOTE_PAR_DEFAUT);
  const portDemande = options.port ?? PORT_PAR_DEFAUT;
  const registre = options.registre ?? new RegistreFournisseurs();
  const journal = options.journal ?? ((): void => undefined);
  const exigerJeton = !(mode === "demonstration" && options.sansAuthentification === true);

  let portReel = portDemande;
  let urlDeBase = "";
  const autorisation = new ServeurAutorisationDemo({ urlBase: () => urlDeBase, fiche: (nom) => registre.fiche(nom), ...(options.fichierEtat ? { fichierEtat: options.fichierEtat } : {}) });

  function fournisseurDe(service: Service) {
    return registre.obtenir(mode, service);
  }

  /** Un service est servi en démonstration même sans fournisseur (atelier_identite seul) ; en réel, seulement avec fournisseur. */
  function serviceDisponible(service: Service): boolean {
    if (registre.fiche(service) === undefined) return false;
    return mode === "demonstration" || fournisseurDe(service) !== undefined;
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
    if (!serviceDisponible(service)) {
      envoyerJson(res, 404, { error: "service_indisponible", message: `Le service ${service} n'est pas disponible en mode ${mode}.` });
      return;
    }

    // Authentification par jeton porteur.
    let identite: IdentiteAppel = {
      compte: COMPTE_DEMONSTRATION,
      propriete: registre.fiche(service)?.proprietesDemo[0] ?? null,
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
      if (mode === "demonstration") {
        const trouve = autorisation.verifierJeton(jetonPorteur, service);
        if (!trouve) {
          envoyerJson(res, 401, { error: "invalid_token", message: "Jeton invalide, expiré ou destiné à un autre service." }, { "www-authenticate": enteteChallenge(service, true) });
          return;
        }
        identite = { compte: trouve.compte, propriete: trouve.propriete };
      } else {
        // Mode réel : le fournisseur réel du service vérifie le jeton (validité, expiration, audience par
        // service). Sans fonction de vérification, refus : jamais de jeton accepté par défaut (revue S1).
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
        instructions:
          mode === "demonstration"
            ? `Passerelle marketing en mode démonstration : ${enveloppeAtelier(mode).mention}. Chaque réponse porte cette mention.`
            : "Passerelle marketing en mode réel.",
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
      envoyerJson(res, 200, { ok: true, mode, version: VERSION_PASSERELLE, services: registre.fiches().map((f) => f.id).filter(serviceDisponible), _atelier: enveloppeAtelier(mode) });
      return;
    }

    const metaRessource = /^\/\.well-known\/oauth-protected-resource\/mcp\/([a-z0-9]+)$/.exec(chemin);
    if (metaRessource && req.method === "GET") {
      const nom = metaRessource[1]!;
      if (!MOTIF_SERVICE.test(nom) || !serviceDisponible(nom)) {
        envoyerJson(res, 404, { error: "service_inconnu" });
        return;
      }
      if (mode === "demonstration") {
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

    if (mode === "demonstration") {
      if (chemin === "/.well-known/oauth-authorization-server" && req.method === "GET") {
        envoyerJson(res, 200, autorisation.metadonneesServeur());
        return;
      }
      if (await autorisation.traiter(req, res, url)) return;
    }

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
    mode,
    urlBase: () => urlDeBase,
    ecouter: () =>
      new Promise<string>((resolve, reject) => {
        serveurHttp.once("error", reject);
        serveurHttp.listen(portDemande, hote, () => {
          const adresse = serveurHttp.address() as AddressInfo;
          portReel = adresse.port;
          urlDeBase = hote === "::1" ? `http://[::1]:${portReel}` : `http://${hote}:${portReel}`;
          serveurHttp.off("error", reject);
          journal(`passerelle ${mode} à l'écoute sur ${urlDeBase}`);
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
