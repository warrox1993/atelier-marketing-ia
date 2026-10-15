// Utilitaires partagés des tests : démarrage d'une vraie passerelle sur un port
// libre de la boucle locale, parcours OAuth complet et appels JSON-RPC bruts.

import { createHash, randomBytes } from "node:crypto";
import * as z from "zod";
import { RegistreFournisseurs, type FournisseurService } from "../src/fournisseurs.js";
import { creerServeur, type OptionsServeur, type ServeurPasserelle } from "../src/serveur.js";
import { calculerChallengeS256 } from "../src/oauth-demo.js";

/** Fournisseur factice minimal : prouve le point d'extension (L4, L5, L7 en feront de vrais). */
export function fournisseurFactice(mode: "demonstration" | "reel" = "demonstration"): FournisseurService {
  return {
    service: "gsc",
    mode,
    serveursAutorisation: ["https://accounts.google.example"],
    // Mode réel : seul « jeton-google-factice » est un jeton valide pour gsc (vérification au niveau HTTP).
    ...(mode === "reel"
      ? { verifierJeton: (jeton: string, service: string) => (jeton === "jeton-google-factice" && service === "gsc" ? { compte: "Compte factice (réel)", propriete: null } : null) }
      : {}),
    outils: [
      {
        nom: "gsc_ping",
        description: "Outil factice de lecture : renvoie le texte reçu et le jeton relayé (test).",
        schemaEntree: { texte: z.string().min(1).max(50) },
        annotations: { readOnlyHint: true },
        executer: (args, contexte) => ({
          echo: args["texte"],
          jetonRelaye: contexte.jetonPorteur,
          propriete: contexte.identite.propriete?.id ?? null,
        }),
      },
      {
        nom: "gsc_publier_factice",
        description: "Outil factice d'écriture : ne publie rien.",
        schemaEntree: {},
        annotations: { readOnlyHint: false, destructiveHint: true },
        executer: () => ({ etat: "simulee" }),
      },
      {
        nom: "gsc_echec",
        description: "Outil factice qui échoue.",
        schemaEntree: {},
        executer: () => {
          throw new Error("échec volontaire");
        },
      },
    ],
  };
}

export interface PasserelleDeTest {
  serveur: ServeurPasserelle;
  url: string;
  arreter: () => Promise<void>;
}

export async function demarrer(options: Partial<OptionsServeur> = {}): Promise<PasserelleDeTest> {
  const registre = options.registre ?? new RegistreFournisseurs().enregistrer(fournisseurFactice(options.mode ?? "demonstration"));
  const serveur = creerServeur({ mode: "demonstration", port: 0, ...options, registre });
  const url = await serveur.ecouter();
  return { serveur, url, arreter: () => serveur.arreter() };
}

export interface ClientOAuth {
  clientId: string;
  redirectUri: string;
}

export const REDIRECTION_TEST = "http://127.0.0.1:3200/api/tools/oauth/callback";

export async function enregistrerClient(url: string, redirectUri = REDIRECTION_TEST): Promise<ClientOAuth> {
  const rep = await fetch(`${url}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Paperclip (test)",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
    }),
  });
  if (rep.status !== 201) throw new Error(`enregistrement refusé : ${rep.status} ${await rep.text()}`);
  const corps = (await rep.json()) as { client_id: string };
  return { clientId: corps.client_id, redirectUri };
}

export function nouveauPkce(): { verificateur: string; challenge: string } {
  const verificateur = randomBytes(48).toString("base64url");
  return { verificateur, challenge: calculerChallengeS256(verificateur) };
}

export function urlAutorisation(
  url: string,
  client: ClientOAuth,
  pkce: { challenge: string },
  service: string,
  extra: Record<string, string> = {},
): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    state: "etat-test",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    resource: `${url}/mcp/${service}`,
    scope: "demonstration",
    ...extra,
  });
  return `${url}/oauth/authorize?${q.toString()}`;
}

/** Ouvre la page de consentement et renvoie l'identifiant de transaction caché dans le formulaire. */
export async function ouvrirConsentement(adresse: string): Promise<{ transaction: string; html: string }> {
  const rep = await fetch(adresse, { redirect: "manual" });
  const html = await rep.text();
  if (rep.status !== 200) throw new Error(`consentement indisponible : ${rep.status}`);
  const trouve = /name="transaction" value="([^"]+)"/.exec(html);
  if (!trouve) throw new Error("transaction absente de la page");
  return { transaction: trouve[1]!, html };
}

export async function decider(
  url: string,
  transaction: string,
  decision: "autoriser" | "refuser",
  propriete?: string,
): Promise<Response> {
  const corps = new URLSearchParams({ transaction, decision });
  if (propriete) corps.set("propriete", propriete);
  return fetch(`${url}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: corps,
    redirect: "manual",
  });
}

export async function echangerCode(
  url: string,
  client: ClientOAuth,
  code: string,
  verificateur: string,
  extra: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${url}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: client.redirectUri,
      client_id: client.clientId,
      code_verifier: verificateur,
      ...extra,
    }),
  });
}

export interface JetonsObtenus {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  client: ClientOAuth;
}

/** Parcours complet : enregistrement, consentement, code, jeton. */
export async function obtenirJetons(url: string, service: string, propriete?: string): Promise<JetonsObtenus> {
  const client = await enregistrerClient(url);
  const pkce = nouveauPkce();
  const { transaction } = await ouvrirConsentement(urlAutorisation(url, client, pkce, service));
  const rep = await decider(url, transaction, "autoriser", propriete);
  const lieu = rep.headers.get("location");
  if (rep.status !== 302 || !lieu) throw new Error(`pas de redirection : ${rep.status}`);
  const code = new URL(lieu).searchParams.get("code");
  if (!code) throw new Error("code absent");
  const jeton = await echangerCode(url, client, code, pkce.verificateur);
  if (jeton.status !== 200) throw new Error(`jeton refusé : ${jeton.status} ${await jeton.text()}`);
  return { ...((await jeton.json()) as Omit<JetonsObtenus, "client">), client };
}

/** Appel JSON-RPC brut, comme le fait Paperclip (POST, Accept JSON et flux). */
export async function rpc(
  url: string,
  service: string,
  methode: string,
  params: unknown,
  jeton?: string,
  id: number = 1,
): Promise<{ statut: number; corps: any; entetes: Headers }> {
  const rep = await fetch(`${url}/mcp/${service}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: methode, params }),
  });
  const texte = await rep.text();
  let corps: any = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }
  return { statut: rep.status, corps, entetes: rep.headers };
}

export const PARAMS_INITIALISATION = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "0.0.0" },
};

export const empreinteSha256 = (valeur: string): string => createHash("sha256").update(valeur).digest("hex");
