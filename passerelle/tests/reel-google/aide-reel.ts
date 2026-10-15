// Montage de test du lot L4 : faux Google + passerelle en mode réel + serveur d'autorisation Google de la
// passerelle, tous sur la boucle locale, ports libres. Le parcours d'autorisation est joué par requêtes HTTP,
// exactement comme Paperclip le fait (métadonnées de ressource → métadonnées du serveur → DCR → autorisation
// PKCE avec `resource` → échange du code), la fenêtre du navigateur étant remplacée par le suivi des redirections.

import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { creerServeur, type ServeurPasserelle } from "../../src/serveur.js";
import { adressesFaussesGoogle, type ConfigGoogleReel } from "../../src/reel/google/config.js";
import { construireGoogleReel, type GoogleReel } from "../../src/reel/google/enregistrer.js";
import { FauxGoogle, type OptionsFauxGoogle } from "./faux-google.js";

export const REDIRECTION_PAPERCLIP = "http://127.0.0.1:3300/api/tools/oauth/callback";

export interface Montage {
  faux: FauxGoogle;
  passerelle: ServeurPasserelle;
  google: GoogleReel;
  urlPasserelle: string;
  urlAutorisation: string;
  config: ConfigGoogleReel;
  journal: string[];
  attentes: number[];
  dossier: string;
  arreter(): Promise<void>;
}

export async function monter(optionsFaux: OptionsFauxGoogle = {}, dossierExistant?: string): Promise<Montage> {
  const faux = new FauxGoogle(optionsFaux);
  const urlFaux = await faux.demarrer();
  const dossier = dossierExistant ?? mkdtempSync(join(tmpdir(), "passerelle-l4-"));
  const journal: string[] = [];
  const attentes: number[] = [];
  const config: ConfigGoogleReel = {
    clientId: faux.options.clientId,
    clientSecret: faux.options.clientSecret,
    cle: Buffer.alloc(32, 7),
    fichierEtat: join(dossier, "google-reel.json"),
    portAutorisation: 0,
    adresses: adressesFaussesGoogle(urlFaux),
    essai: true,
    adsLoginCustomerId: "9876543210",
    attenteQuotaMaxMs: 10_000,
  };
  const registre = new RegistreFournisseurs();
  let passerelle: ServeurPasserelle | null = null;
  const google = construireGoogleReel(registre, {}, {
    hote: "127.0.0.1",
    urlPasserelle: () => passerelle!.urlBase(),
    journal: (m) => journal.push(m),
    config,
    attendre: async (ms) => {
      attentes.push(ms);
    },
  })!;
  passerelle = creerServeur({ mode: "reel", port: 0, registre, journal: (m) => journal.push(m) });
  const urlPasserelle = await passerelle.ecouter();
  const urlAutorisation = await google.ecouter();
  return {
    faux,
    passerelle,
    google,
    urlPasserelle,
    urlAutorisation,
    config,
    journal,
    attentes,
    dossier,
    arreter: async () => {
      await google.arreter();
      await passerelle!.arreter();
      await faux.arreter();
    },
  };
}

export function nettoyer(dossier: string): void {
  rmSync(dossier, { recursive: true, force: true });
}

export interface ResultatConnexion {
  jetons: { access_token: string; refresh_token: string; expires_in: number; scope: string; token_type: string };
  clientId: string;
  /** Paramètres reçus par le « callback Paperclip ». */
  retour: URLSearchParams;
}

const verificateur = (): string => randomBytes(48).toString("base64url");
const defi = (v: string): string => createHash("sha256").update(v).digest("base64url");

/** Suit une redirection 302 et renvoie l'URL cible. */
async function suivre(url: string): Promise<URL> {
  const r = await fetch(url, { redirect: "manual" });
  if (r.status !== 302) throw new Error(`Redirection attendue de ${new URL(url).pathname}, reçu HTTP ${r.status} : ${await r.text()}`);
  return new URL(r.headers.get("location")!);
}

/** Parcours complet « Sign in » de Paperclip contre la passerelle réelle et le faux Google. */
export async function connecter(m: Montage, service: string, options: { scope?: string; attendreErreur?: boolean } = {}): Promise<ResultatConnexion> {
  const ressource = `${m.urlPasserelle}/mcp/${service}`;
  // 1. Défi 401 de la ressource, puis métadonnées de ressource protégée (RFC 9728).
  const defi401 = await fetch(ressource, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (defi401.status !== 401) throw new Error(`401 attendu, reçu ${defi401.status}`);
  const metaRessource = (await (await fetch(`${m.urlPasserelle}/.well-known/oauth-protected-resource/mcp/${service}`)).json()) as Record<string, any>;
  const serveurAut = metaRessource["authorization_servers"][0] as string;
  // 2. Métadonnées du serveur d'autorisation (RFC 8414).
  const meta = (await (await fetch(`${serveurAut}/.well-known/oauth-authorization-server`)).json()) as Record<string, any>;
  // 3. Enregistrement dynamique (RFC 7591).
  const enr = (await (
    await fetch(meta["registration_endpoint"], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECTION_PAPERCLIP], client_name: "Paperclip", grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }),
    })
  ).json()) as Record<string, any>;
  const clientId = enr["client_id"] as string;
  // 4. Autorisation avec PKCE et ressource, comme tool-access.ts.
  const v = verificateur();
  const aut = new URL(meta["authorization_endpoint"]);
  aut.searchParams.set("response_type", "code");
  aut.searchParams.set("client_id", clientId);
  aut.searchParams.set("redirect_uri", REDIRECTION_PAPERCLIP);
  aut.searchParams.set("state", "etat-paperclip");
  aut.searchParams.set("code_challenge", defi(v));
  aut.searchParams.set("code_challenge_method", "S256");
  aut.searchParams.set("resource", metaRessource["resource"]);
  aut.searchParams.set("scope", options.scope ?? (metaRessource["scopes_supported"] as string[]).join(" "));
  const versGoogle = await suivre(aut.toString());
  const retourGoogle = await suivre(versGoogle.toString());
  const versPaperclip = await suivre(retourGoogle.toString());
  const retour = versPaperclip.searchParams;
  if (options.attendreErreur) return { jetons: null as never, clientId, retour };
  if (!retour.get("code")) throw new Error(`Pas de code : ${retour.toString()}`);
  // 5. Échange du code (client public, PKCE, ressource).
  const r = await fetch(meta["token_endpoint"], {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: retour.get("code")!,
      redirect_uri: REDIRECTION_PAPERCLIP,
      client_id: clientId,
      code_verifier: v,
      resource: metaRessource["resource"],
    }),
  });
  const jetons = (await r.json()) as ResultatConnexion["jetons"];
  if (r.status !== 200) throw new Error(`Échange refusé : ${JSON.stringify(jetons)}`);
  return { jetons, clientId, retour };
}

export async function clientMcp(m: Montage, service: string, jeton: string): Promise<Client> {
  const c = new Client({ name: "essai-l4", version: "0.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${m.urlPasserelle}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
  return c;
}

export interface ResultatOutil {
  donnees: Record<string, any>;
  erreur: boolean;
  texte: string;
}

export async function appeler(c: Client, nom: string, args: Record<string, unknown>): Promise<ResultatOutil> {
  const r = await c.callTool({ name: nom, arguments: args });
  const texte = (r["content"] as { text: string }[])[0]!.text;
  return { donnees: r["structuredContent"] as Record<string, any>, erreur: r["isError"] === true, texte };
}

/** Données renvoyées sans l'enveloppe `_atelier`. */
export function sansEnveloppe(d: Record<string, any>): Record<string, any> {
  const { _atelier: _a, ...reste } = d;
  return reste;
}
