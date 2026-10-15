// Téléchargement des fichiers BCE Open Data depuis le portail du SPF Économie (lot P3).
//
// CE CODE N'A JAMAIS ÉTÉ EXÉCUTÉ CONTRE LE VRAI PORTAIL : il exige l'inscription de l'opérateur (compte gratuit, acceptation
// des conditions), que l'opérateur fera plus tard. Il est testé seulement contre un FAUX PORTAIL local (tests/reel-prospection/faux-portail-bce.ts).
//
// Ce qui est VÉRIFIÉ (page publique lue le 15/10/2026, sans compte) : le formulaire de connexion est
// `POST /kbo-open-data/static/j_spring_security_check` avec les champs `j_username` et `j_password`, après un `GET
// /kbo-open-data/login`, avec cookies de session (JSESSIONID, KSESSIONID-KBOPUB-OPENDATA). La page dit : « Les fichiers Open
// Data contiennent des informations sur toutes les entités actives enregistrées dans la BCE. Ces fichiers sont disponibles
// gratuitement. » Les noms d'archives `KboOpenData_NNNN_AAAA_MM_Full.zip` et `…_Update.zip` sont relevés dans des outils
// publics (Azizo-B/CBE, companydata.co).
//
// Ce qui est PROBABLE, À CONFIRMER à la première connexion réelle : l'adresse de la page qui liste les fichiers après connexion
// (on lit la page d'accueil du portail, puis les liens qui contiennent « affiliation » ou « files »), et la forme des liens de
// téléchargement (on cherche un `href` qui contient le nom de l'archive). Si la structure diffère, la commande s'arrête avec
// un message clair, sans rien deviner. L'accès SFTP (sur demande par courriel au SPF Économie) n'est pas implémenté.

import { createWriteStream, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { lireCleValeur, lireFichierSecret } from "../commun.js";

export const PORTAIL_BCE_OFFICIEL = "https://kbopub.economie.fgov.be";
const MOTIF_ARCHIVE = /KboOpenData_(\d{4})_(\d{4})_(\d{2})_(Full|Update)\.zip/i;
const MAX_REDIRECTIONS = 5;

export interface IdentifiantsBce {
  identifiant: string;
  motDePasse: string;
}

/**
 * Lit les identifiants du portail dans le fichier 0600 désigné par PASSERELLE_BCE_IDENTIFIANTS_FICHIER
 * (lignes `identifiant=…` et `mot_de_passe=…`). Les valeurs ne figurent jamais dans un message d'erreur.
 */
export function lireIdentifiantsBce(env: NodeJS.ProcessEnv): IdentifiantsBce {
  const fichier = env["PASSERELLE_BCE_IDENTIFIANTS_FICHIER"]?.trim();
  if (!fichier) throw new Error("PASSERELLE_BCE_IDENTIFIANTS_FICHIER absent : indiquer le fichier (chmod 600) qui contient les lignes identifiant=… et mot_de_passe=… du portail BCE Open Data.");
  const valeurs = lireCleValeur(lireFichierSecret(fichier, "PASSERELLE_BCE_IDENTIFIANTS_FICHIER"));
  const identifiant = valeurs["identifiant"];
  const motDePasse = valeurs["mot_de_passe"];
  if (!identifiant || !motDePasse) throw new Error("PASSERELLE_BCE_IDENTIFIANTS_FICHIER : les lignes identifiant=… et mot_de_passe=… sont obligatoires.");
  return { identifiant, motDePasse };
}

/** Portail officiel, ou (ESSAIS SEULEMENT) un faux portail de la boucle locale désigné par PASSERELLE_BCE_PORTAIL_URL. */
export function adressePortail(env: NodeJS.ProcessEnv): URL {
  const faux = env["PASSERELLE_BCE_PORTAIL_URL"]?.trim();
  if (!faux) return new URL(PORTAIL_BCE_OFFICIEL);
  const url = new URL(faux);
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) {
    throw new Error("PASSERELLE_BCE_PORTAIL_URL n'accepte qu'un faux portail de la boucle locale (http://127.0.0.1:<port>).");
  }
  return url;
}

export interface FichierPortail {
  nom: string;
  url: string;
  type: "complet" | "mise_a_jour";
  numero: number;
  annee: number;
  mois: number;
}

export function analyserNomArchive(nom: string): Omit<FichierPortail, "url"> | null {
  const m = MOTIF_ARCHIVE.exec(nom);
  if (!m) return null;
  return { nom: m[0], type: m[4]!.toLowerCase() === "full" ? "complet" : "mise_a_jour", numero: Number(m[1]), annee: Number(m[2]), mois: Number(m[3]) };
}

/** Liens d'archives trouvés dans une page HTML (adresses relatives résolues par rapport à la page). */
export function extraireArchives(html: string, page: URL): FichierPortail[] {
  const vus = new Map<string, FichierPortail>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = m[1]!.replace(/&amp;/g, "&");
    let decode = href;
    try {
      decode = decodeURIComponent(href);
    } catch {
      // lien mal encodé : on lit le texte tel quel, sans faire échouer toute la liste
    }
    const info = analyserNomArchive(decode);
    if (!info) continue;
    const url = new URL(href, page);
    if (url.origin !== page.origin) continue; // jamais de téléchargement hors du portail
    vus.set(info.nom, { ...info, url: url.toString() });
  }
  return [...vus.values()].sort((a, b) => a.numero - b.numero);
}

export interface PlanTelechargement {
  telecharger: FichierPortail[];
  /** Vrai si les mises à jour disponibles ne suivent pas l'index : il faut repartir d'un fichier complet. */
  trou: boolean;
}

/**
 * Quels fichiers télécharger : sans index (`dernierNumero` nul), le dernier fichier complet puis les mises à jour qui le
 * suivent ; avec un index, les mises à jour de numéro supérieur, dans l'ordre. Si la première mise à jour disponible saute
 * des numéros, le plan repart du dernier fichier complet (`trou`).
 */
export function planifier(fichiers: readonly FichierPortail[], dernierNumero: number | null): PlanTelechargement {
  const complets = fichiers.filter((f) => f.type === "complet");
  const majs = fichiers.filter((f) => f.type === "mise_a_jour").sort((a, b) => a.numero - b.numero);
  const dernierComplet = complets.reduce<FichierPortail | null>((m, f) => (m === null || f.numero > m.numero ? f : m), null);
  const depuisComplet = (): PlanTelechargement => ({
    telecharger: dernierComplet ? [dernierComplet, ...majs.filter((f) => f.numero > dernierComplet.numero)] : [],
    trou: false,
  });
  if (dernierNumero === null) return depuisComplet();
  const suivantes = majs.filter((f) => f.numero > dernierNumero);
  if (suivantes.length > 0 && suivantes[0]!.numero > dernierNumero + 1) return { ...depuisComplet(), trou: true };
  return { telecharger: suivantes, trou: false };
}

// --- Client HTTP du portail -------------------------------------------------------------------------------------------

type Fetch = typeof fetch;

export class ClientPortailBce {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly base: URL,
    private readonly appeler: Fetch = fetch,
    private readonly agent = "atelier-marketing-ia-passerelle (import BCE Open Data)",
  ) {}

  private entetes(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { "user-agent": this.agent, accept: "text/html,application/zip;q=0.9,*/*;q=0.5", ...(cookie ? { cookie } : {}), ...extra };
  }

  private retenirCookies(reponse: Response): void {
    for (const brut of reponse.headers.getSetCookie()) {
      const [paire] = brut.split(";");
      const i = paire!.indexOf("=");
      if (i > 0) this.cookies.set(paire!.slice(0, i).trim(), paire!.slice(i + 1).trim());
    }
  }

  /** Requête qui suit les redirections à la main, sur le MÊME site seulement, en gardant les cookies. */
  private async requete(url: URL, init: RequestInit = {}): Promise<{ reponse: Response; url: URL }> {
    let courante = url;
    let methode = init.method ?? "GET";
    let corps = init.body;
    for (let i = 0; i <= MAX_REDIRECTIONS; i++) {
      const reponse = await this.appeler(courante, { ...init, method: methode, body: corps, redirect: "manual", headers: this.entetes((init.headers as Record<string, string> | undefined) ?? {}) });
      this.retenirCookies(reponse);
      if (reponse.status >= 300 && reponse.status < 400 && reponse.headers.get("location")) {
        const suivante = new URL(reponse.headers.get("location")!, courante);
        if (suivante.origin !== this.base.origin) throw new Error(`Redirection hors du portail refusée (${suivante.origin}).`);
        await reponse.body?.cancel();
        courante = suivante;
        methode = "GET";
        corps = undefined;
        init = { ...init, headers: {} };
        continue;
      }
      return { reponse, url: courante };
    }
    throw new Error("Trop de redirections depuis le portail BCE.");
  }

  /** Ouvre la session : page de connexion (cookies), puis formulaire. Identifiants refusés : erreur sans aucune valeur secrète. */
  async connecter(identifiants: IdentifiantsBce): Promise<void> {
    const page = await this.requete(new URL("/kbo-open-data/login?lang=fr", this.base));
    await page.reponse.body?.cancel();
    const formulaire = new URLSearchParams({ j_username: identifiants.identifiant, j_password: identifiants.motDePasse });
    const { reponse, url } = await this.requete(new URL("/kbo-open-data/static/j_spring_security_check", this.base), {
      method: "POST",
      body: formulaire.toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const texte = await reponse.text();
    if (!reponse.ok) throw new Error(`Connexion au portail BCE impossible : HTTP ${reponse.status}.`);
    if (/login/i.test(url.pathname) || /name=["']j_password["']/i.test(texte)) {
      throw new Error("Connexion au portail BCE refusée : identifiant ou mot de passe incorrect (ou compte non activé).");
    }
  }

  /** Liste des archives proposées après connexion (voir l'en-tête : structure du portail à confirmer). */
  async lister(): Promise<FichierPortail[]> {
    const accueil = await this.requete(new URL("/kbo-open-data/", this.base));
    const html = await accueil.reponse.text();
    if (!accueil.reponse.ok) throw new Error(`Liste des fichiers BCE illisible : HTTP ${accueil.reponse.status}.`);
    let fichiers = extraireArchives(html, accueil.url);
    if (fichiers.length === 0) {
      const pages = [...html.matchAll(/href\s*=\s*["']([^"']*(?:affiliation|files)[^"']*)["']/gi)].map((m) => new URL(m[1]!.replace(/&amp;/g, "&"), accueil.url)).filter((u) => u.origin === this.base.origin).slice(0, 3);
      for (const p of pages) {
        const r = await this.requete(p);
        if (r.reponse.ok) fichiers = extraireArchives(await r.reponse.text(), r.url);
        else await r.reponse.body?.cancel();
        if (fichiers.length > 0) break;
      }
    }
    if (fichiers.length === 0) {
      throw new Error("Aucune archive KboOpenData_… trouvée sur le portail : la structure du portail n'est pas celle qu'attend l'importateur (non vérifiée avant l'inscription). Télécharger à la main puis importer.");
    }
    return fichiers;
  }

  /** Télécharge une archive dans `dossier` (fichier `.part` puis renommage) et vérifie la signature ZIP. */
  async telecharger(fichier: FichierPortail, dossier: string): Promise<string> {
    mkdirSync(dossier, { recursive: true, mode: 0o700 });
    const { reponse } = await this.requete(new URL(fichier.url));
    if (!reponse.ok || !reponse.body) throw new Error(`Téléchargement de ${fichier.nom} impossible : HTTP ${reponse.status}.`);
    if (/text\/html/i.test(reponse.headers.get("content-type") ?? "")) {
      await reponse.body.cancel();
      throw new Error(`Téléchargement de ${fichier.nom} : le portail a renvoyé une page web au lieu de l'archive (session expirée ?).`);
    }
    const destination = join(dossier, fichier.nom);
    const partiel = `${destination}.part`;
    try {
      let debut = Buffer.alloc(0);
      const flux = Readable.fromWeb(reponse.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>);
      flux.on("data", (m: Buffer) => {
        if (debut.length < 4) debut = Buffer.concat([debut, m]).subarray(0, 4);
      });
      await pipeline(flux, createWriteStream(partiel, { mode: 0o600 }));
      // Signature d'une archive ZIP : « PK » puis 0x03 0x04 (fichier non vide).
      if (debut.length < 4 || debut[0] !== 0x50 || debut[1] !== 0x4b || debut[2] !== 0x03 || debut[3] !== 0x04) throw new Error(`${fichier.nom} : le contenu reçu n'est pas une archive ZIP.`);
      const annonce = reponse.headers.get("content-length");
      if (annonce !== null && /^\d+$/.test(annonce) && statSync(partiel).size !== Number(annonce)) throw new Error(`${fichier.nom} : téléchargement incomplet (taille reçue différente de la taille annoncée).`);
      renameSync(partiel, destination);
      return destination;
    } catch (e) {
      rmSync(partiel, { force: true });
      throw e;
    }
  }
}

export interface ResultatTelechargement {
  plan: PlanTelechargement;
  fichiers: string[];
}

/** Se connecte, dresse le plan d'après le dernier numéro d'extraction de l'index, télécharge ce qui manque. */
export async function telechargerNouveautes(client: ClientPortailBce, identifiants: IdentifiantsBce, dossier: string, dernierNumero: number | null): Promise<ResultatTelechargement> {
  await client.connecter(identifiants);
  const plan = planifier(await client.lister(), dernierNumero);
  const fichiers: string[] = [];
  for (const f of plan.telecharger) fichiers.push(await client.telecharger(f, dossier));
  return { plan, fichiers };
}
