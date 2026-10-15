// Montage des essais réseaux sociaux et CRM réels : faux serveurs des plateformes + passerelle en mode réel
// + serveur d'autorisation social de la passerelle, tous sur la boucle locale et des ports libres. Le parcours
// de connexion est joué par requêtes HTTP, comme Paperclip (métadonnées de ressource → métadonnées du serveur
// → DCR → autorisation PKCE avec `resource` → échange du code) ; la fenêtre du navigateur est remplacée par le
// suivi des redirections et la soumission des formulaires (choix de Page, clé d'API).

import { createHash, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { creerServeur, type ServeurPasserelle } from "../../src/serveur.js";
import { adressesFaussesSocialCrm, type ConfigSocialCrmReel } from "../../src/reel/social-crm/config.js";
import { construireSocialCrmReel, type SocialCrmReel } from "../../src/reel/social-crm/enregistrer.js";
import { empreinteArguments, signerPreuve, type ChargePreuve } from "../../src/reel/social-crm/approbation.js";
import { FauxOdoo, FauxPlateformes, IDENTIFIANTS } from "./faux-plateformes.js";

export const REDIRECTION_PAPERCLIP = "http://127.0.0.1:3300/api/tools/oauth/callback";

export interface Montage {
  faux: FauxPlateformes;
  odoo19: FauxOdoo;
  odoo17: FauxOdoo;
  passerelle: ServeurPasserelle;
  social: SocialCrmReel;
  urlPasserelle: string;
  config: ConfigSocialCrmReel;
  journal: string[];
  attentes: number[];
  dossier: string;
  clePrivee: KeyObject;
  arreter(): Promise<void>;
}

export async function monter(options: { sansClePublique?: boolean; delaiAppelMs?: number } = {}): Promise<Montage> {
  const faux = new FauxPlateformes();
  const urlFaux = await faux.demarrer();
  const odoo19 = new FauxOdoo(19);
  const odoo17 = new FauxOdoo(17);
  await odoo19.demarrer();
  await odoo17.demarrer();
  const dossier = mkdtempSync(join(tmpdir(), "passerelle-social-"));
  const journal: string[] = [];
  const attentes: number[] = [];
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const config: ConfigSocialCrmReel = {
    cle: Buffer.alloc(32, 9),
    fichierEtat: join(dossier, "social-crm-reel.json"),
    portAutorisation: 0,
    adresses: adressesFaussesSocialCrm(urlFaux),
    essai: true,
    applications: {
      facebook: IDENTIFIANTS.meta,
      instagram: IDENTIFIANTS.instagram,
      linkedin: IDENTIFIANTS.linkedin,
      crm: IDENTIFIANTS.hubspot,
      pipedrive: IDENTIFIANTS.pipedrive,
      teamleader: IDENTIFIANTS.teamleader,
    },
    clePubliqueApprobation: options.sansClePublique ? null : publicKey.export({ type: "spki", format: "pem" }).toString(),
    attenteQuotaMaxMs: 10_000,
    delaiAppelMs: options.delaiAppelMs ?? 3000,
    urlRetourPublique: null,
  };
  const registre = new RegistreFournisseurs();
  let passerelle: ServeurPasserelle | null = null;
  const social = construireSocialCrmReel(registre, {}, {
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
  await social.ecouter();
  return {
    faux, odoo19, odoo17, passerelle, social, urlPasserelle, config, journal, attentes, dossier, clePrivee: privateKey,
    arreter: async () => {
      await social.arreter();
      await passerelle!.arreter();
      await faux.arreter();
      await odoo19.arreter();
      await odoo17.arreter();
      rmSync(dossier, { recursive: true, force: true });
    },
  };
}

const verificateur = (): string => randomBytes(48).toString("base64url");
const defi = (v: string): string => createHash("sha256").update(v).digest("base64url");

export interface OptionsConnexion {
  scope?: string;
  /** Index du compte à choisir si une page de choix s'affiche. */
  choix?: number;
  /** Valeurs du formulaire « adresse et clé » (Odoo, Pipedrive). */
  formulaire?: Record<string, string>;
  /** Pipedrive : suivre le lien OAuth de la page plutôt que le formulaire. */
  oauthDepuisPage?: boolean;
}

export interface Connexion {
  jetons: { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope?: string };
  retour: URLSearchParams;
  pages: string[];
}

/** Parcours complet « Connecter » de Paperclip ; renvoie les jetons de la passerelle (ou l'erreur du retour). */
export async function connecter(m: Montage, service: string, options: OptionsConnexion = {}): Promise<Connexion> {
  const metaRessource = (await (await fetch(`${m.urlPasserelle}/.well-known/oauth-protected-resource/mcp/${service}`)).json()) as Record<string, any>;
  const serveurAut = metaRessource["authorization_servers"][0] as string;
  const meta = (await (await fetch(`${serveurAut}/.well-known/oauth-authorization-server`)).json()) as Record<string, any>;
  const enr = (await (
    await fetch(meta["registration_endpoint"], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECTION_PAPERCLIP], client_name: "Paperclip", grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }),
    })
  ).json()) as Record<string, any>;
  const clientId = enr["client_id"] as string;
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

  const pages: string[] = [];
  let reponse = await fetch(aut.toString(), { redirect: "manual" });
  for (let etape = 0; etape < 10; etape++) {
    if (reponse.status === 302) {
      const cible = reponse.headers.get("location")!;
      if (cible.startsWith(REDIRECTION_PAPERCLIP)) {
        const retour = new URL(cible).searchParams;
        if (!retour.get("code")) return { jetons: null as never, retour, pages };
        const r = await fetch(meta["token_endpoint"], {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", code: retour.get("code")!, redirect_uri: REDIRECTION_PAPERCLIP, client_id: clientId, code_verifier: v, resource: metaRessource["resource"] }),
        });
        const jetons = (await r.json()) as Connexion["jetons"];
        if (r.status !== 200) throw new Error(`Échange refusé : ${JSON.stringify(jetons)}`);
        return { jetons, retour, pages };
      }
      reponse = await fetch(cible, { redirect: "manual" });
      continue;
    }
    const html = await reponse.text();
    pages.push(html);
    if (reponse.status !== 200 && reponse.status !== 400) throw new Error(`Étape inattendue (HTTP ${reponse.status}) : ${html.slice(0, 300)}`);
    const transaction = /name="transaction" value="([^"]+)"/.exec(html)?.[1];
    if (!transaction) throw new Error(`Page sans transaction : ${html.slice(0, 300)}`);
    if (html.includes('action="/oauth/choisir"')) {
      reponse = await fetch(`${serveurAut}/oauth/choisir`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ transaction, compte: String(options.choix ?? 0) }) });
      continue;
    }
    if (options.oauthDepuisPage) {
      reponse = await fetch(`${serveurAut}/oauth/amont?transaction=${encodeURIComponent(transaction)}`, { redirect: "manual" });
      continue;
    }
    if (!options.formulaire || reponse.status === 400) {
      const motif = /<p class="erreur">([^<]*)<\/p>/.exec(html)?.[1];
      throw new Error(`Formulaire refusé ou non prévu : ${motif ?? html.slice(0, 400)}`);
    }
    reponse = await fetch(`${serveurAut}/oauth/formulaire`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ transaction, decision: "autoriser", ...options.formulaire }) });
  }
  throw new Error("Parcours de connexion trop long");
}

export async function clientMcp(m: Montage, service: string, jeton: string): Promise<Client> {
  const c = new Client({ name: "essai-social", version: "0.0.0" });
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
  const { _atelier: _a, ...donnees } = (r["structuredContent"] ?? {}) as Record<string, any>;
  return { donnees, erreur: r["isError"] === true, texte };
}

/** Preuve signée comme le ferait le plugin pour ces arguments exacts. */
export function preuve(m: Montage, service: string, outil: string, args: Record<string, unknown>, extra: Partial<ChargePreuve> = {}): string {
  const maintenant = Math.floor(Date.now() / 1000);
  return signerPreuve(m.clePrivee, {
    v: 1,
    cle: `diffusion-${randomBytes(6).toString("hex")}`,
    service,
    outil,
    empreinte: empreinteArguments(args),
    compte: null,
    diffusion: "diff-1",
    decision: "dec-1",
    emis: maintenant,
    expire: maintenant + 3600,
    ...extra,
  });
}

/** Signature de forme : clés des objets (récursivement), premier élément des tableaux ; les valeurs sont ignorées. */
export function forme(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.length === 0 ? [] : [forme(valeur[0])];
  if (valeur !== null && typeof valeur === "object") {
    return Object.fromEntries(Object.keys(valeur as object).sort().map((k) => [k, forme((valeur as Record<string, unknown>)[k])]));
  }
  return "·";
}
