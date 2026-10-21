// Service réel « liens » : outil `verifier_url` (lecture seule). Il suit les redirections à la main et rend, pour une URL, le
// code HTTP, la chaîne de redirections, la destination finale et un contrôle du contenu (titre, extrait). Anti-SSRF : schémas
// http et https seulement, refus des adresses locales, privées et réservées, vérifié après résolution DNS à CHAQUE saut, et la
// connexion se fait sur l'adresse déjà vérifiée (pas de seconde résolution, donc pas de « DNS rebinding »). Aucun cookie ni
// en-tête d'authentification n'est transmis.

import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";

export const MAX_REDIRECTIONS = 10;
export const DELAI_REQUETE_MS = 10_000;
export const MAX_OCTETS_CORPS = 512 * 1024;
export const MAX_EXTRAIT = 500;
export const USER_AGENT = "AtelierMarketingIA-VerificationLiens/1.0 (contrôle de liens en lecture seule)";

// La fiche est déclarée dans services.ts (fiches livrées par défaut) ; ré-exportée ici pour les importations existantes.
import { FICHE_LIENS } from "../../services.js";
export { FICHE_LIENS };

// --- Filtre d'adresses ---------------------------------------------------------------------------------------------------
// Règle : « unicast globale seulement ». Une adresse n'est autorisée que si elle est routable sur l'internet public. En IPv4,
// on refuse les plages du registre IANA des adresses à usage spécial ; en IPv6, on n'accepte que 2000::/3 (unicast global), moins
// les plages réservées, et toute IPv4 embarquée (mappée, compatible, 6to4, Teredo, NAT64) est déballée puis jugée comme IPv4.
// Les plages sont écrites en octets (pas en texte) pour rester lisibles et sans ambiguïté de notation.

type Plage4 = readonly [number, number, number, number, number]; // octets + longueur du préfixe

const INTERDITES_IPV4: readonly Plage4[] = [
  [0, 0, 0, 0, 8], // « ce réseau »
  [10, 0, 0, 0, 8], // privé
  [100, 64, 0, 0, 10], // espace partagé des opérateurs (CGNAT)
  [127, 0, 0, 0, 8], // boucle locale
  [169, 254, 0, 0, 16], // lien local (dont les métadonnées des nuages)
  [172, 16, 0, 0, 12], // privé
  [192, 0, 0, 0, 24], // protocole IETF
  [192, 0, 2, 0, 24], // documentation
  [192, 88, 99, 0, 24], // relais 6to4 (obsolète)
  [192, 168, 0, 0, 16], // privé
  [198, 18, 0, 0, 15], // bancs d'essai
  [198, 51, 100, 0, 24], // documentation
  [203, 0, 113, 0, 24], // documentation
  [224, 0, 0, 0, 4], // multidiffusion
  [240, 0, 0, 0, 4], // réservé, dont la diffusion générale
];

function dansPlage4(o: readonly number[], p: Plage4): boolean {
  let bits = p[4];
  for (let i = 0; i < 4 && bits > 0; i++) {
    const masque = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if (((o[i] as number) & masque) !== ((p[i] as number) & masque)) return false;
    bits -= 8;
  }
  return true;
}

function ipv4Publique(o: readonly number[]): boolean {
  return !INTERDITES_IPV4.some((p) => dansPlage4(o, p));
}

/** Les 16 octets d'une adresse IPv6 textuelle valide (formes compressée et à queue IPv4 comprises), ou null. */
function octetsIpv6(ip: string): number[] | null {
  if (ip.includes("%")) return null; // identifiant de zone : lien local, jamais public
  let texte = ip.toLowerCase();
  const queue = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(texte);
  if (queue) {
    const q = [queue[2], queue[3], queue[4], queue[5]].map(Number);
    if (q.some((n) => !(n >= 0 && n <= 255))) return null;
    texte = `${queue[1]}${((q[0] as number) << 8 | (q[1] as number)).toString(16)}:${((q[2] as number) << 8 | (q[3] as number)).toString(16)}`;
  }
  const doubles = texte.split("::");
  if (doubles.length > 2) return null;
  const groupes = (s: string): string[] => (s === "" ? [] : s.split(":"));
  const tete = groupes(doubles[0] as string);
  const fin = doubles.length === 2 ? groupes(doubles[1] as string) : [];
  const manquants = 8 - tete.length - fin.length;
  if (doubles.length === 2 ? manquants < 1 : manquants !== 0) return null;
  const tous = [...tete, ...Array<string>(doubles.length === 2 ? manquants : 0).fill("0"), ...fin];
  const octets: number[] = [];
  for (const g of tous) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    octets.push(v >> 8, v & 0xff);
  }
  return octets;
}

const egaux = (o: readonly number[], debut: readonly number[], depart = 0): boolean => debut.every((v, i) => o[depart + i] === v);

/** IPv6 : vrai seulement pour une adresse unicast globale dont toute IPv4 embarquée est publique. */
function ipv6Publique(o: readonly number[]): boolean {
  const zeros = (de: number, jusqu: number): boolean => o.slice(de, jusqu).every((v) => v === 0);
  // IPv4 mappée (::ffff:a.b.c.d), traduite SIIT (::ffff:0:a.b.c.d), compatible (::a.b.c.d, obsolète) : on juge l'IPv4 portée.
  // Cela couvre aussi « :: » et « ::1 », qui donnent 0.0.0.0 et 0.0.0.1 (refusées comme « ce réseau »).
  if (zeros(0, 10) && o[10] === 0xff && o[11] === 0xff) return ipv4Publique(o.slice(12));
  if (zeros(0, 8) && o[8] === 0xff && o[9] === 0xff && o[10] === 0 && o[11] === 0) return ipv4Publique(o.slice(12));
  if (zeros(0, 12)) return ipv4Publique(o.slice(12));
  // NAT64 : 64:ff9b::/96 (IPv4 dans les 32 derniers bits) et 64:ff9b:1::/48 (RFC 8215, IPv4 aux octets 6, 7, 9 et 10, RFC 6052).
  if (egaux(o, [0x00, 0x64, 0xff, 0x9b]) && zeros(4, 12)) return ipv4Publique(o.slice(12));
  if (egaux(o, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01])) return ipv4Publique([o[6] as number, o[7] as number, o[9] as number, o[10] as number]);
  // 6to4 (2002::/16) : l'IPv4 est aux octets 2 à 5.
  if (egaux(o, [0x20, 0x02])) return ipv4Publique(o.slice(2, 6));
  // Teredo (2001::/32) : serveur aux octets 4 à 7, client aux octets 12 à 15 (inversé bit à bit) ; les deux doivent être publics.
  if (egaux(o, [0x20, 0x01, 0x00, 0x00])) return ipv4Publique(o.slice(4, 8)) && ipv4Publique(o.slice(12, 16).map((v) => v ^ 0xff));
  // Seule la plage 2000::/3 est de l'unicast global : tout le reste (fec0::/10, 100::/64, ULA fc00::/7, lien local fe80::/10,
  // multidiffusion ff00::/8, non spécifiée, boucle locale, réservé) est refusé.
  if (((o[0] as number) & 0xe0) !== 0x20) return false;
  // Réservées à l'intérieur de 2000::/3 : protocole IETF 2001::/23 (dont ORCHID), documentation 2001:db8::/32 et 3fff::/20.
  if (o[0] === 0x20 && o[1] === 0x01 && ((o[2] as number) & 0xfe) === 0) return false;
  if (egaux(o, [0x20, 0x01, 0x0d, 0xb8])) return false;
  if (o[0] === 0x3f && o[1] === 0xff && ((o[2] as number) & 0xf0) === 0) return false;
  return true;
}

/** Adresse IP autorisée en production : unicast globale seulement (ni locale, ni privée, ni réservée, ni IPv4 interne embarquée). */
export function adresseAutorisee(ip: string): boolean {
  const famille = isIP(ip);
  if (famille === 4) return ipv4Publique(ip.split(".").map(Number));
  if (famille === 6) {
    const o = octetsIpv6(ip);
    return o !== null && ipv6Publique(o);
  }
  return false;
}

export type Resolveur = (hote: string) => Promise<string[]>;

export const resolveurSysteme: Resolveur = async (hote) => (await dnsLookup(hote, { all: true, verbatim: true })).map((a) => a.address);

export interface OptionsVerification {
  /** Filtre d'adresses (injectable pour les essais ; en production : `adresseAutorisee`). */
  adresseAutorisee?: (ip: string) => boolean;
  resoudre?: Resolveur;
  delaiMs?: number;
  maxRedirections?: number;
}

// --- Types de sortie -----------------------------------------------------------------------------------------------------

export interface SautChaine { url: string; code: number | null }

export interface ResultatVerification {
  urlDemandee: string;
  code: number | null;
  chaine: SautChaine[];
  destination: string | null;
  typeContenu: string | null;
  titre: string | null;
  extrait: string | null;
  dureeMs: number;
  erreur?: string;
}

export class ErreurVerification extends Error {}

// --- Cœur ----------------------------------------------------------------------------------------------------------------

interface Reponse { code: number; location: string | null; typeContenu: string | null; corps: Buffer }

function nomHoteInterdit(hote: string): boolean {
  const h = hote.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost");
}

/** Résout l'hôte, vérifie TOUTES les adresses obtenues, renvoie celle sur laquelle se connecter. */
export async function adresseVerifiee(url: URL, opts: Required<Pick<OptionsVerification, "adresseAutorisee" | "resoudre">>): Promise<string> {
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  if (nomHoteInterdit(hote)) throw new ErreurVerification(`Adresse refusée : l'hôte « ${hote} » est local.`);
  const adresses = isIP(hote) !== 0 ? [hote] : await opts.resoudre(hote).catch((e: unknown) => {
    throw new ErreurVerification(`Résolution DNS impossible pour « ${hote} » (${e instanceof Error ? e.message : String(e)}).`);
  });
  if (adresses.length === 0) throw new ErreurVerification(`Résolution DNS sans résultat pour « ${hote} ».`);
  for (const a of adresses) {
    if (!opts.adresseAutorisee(a)) throw new ErreurVerification(`Adresse refusée : « ${hote} » pointe vers ${a} (adresse locale, privée ou réservée).`);
  }
  // IPv4 d'abord (toutes les adresses sont vérifiées ci-dessus) : beaucoup de postes et de VPN n'ont pas de route IPv6,
  // et la connexion échouait alors en ECONNREFUSED alors que le site répond en IPv4.
  return (adresses.find((a) => isIP(a) === 4) ?? adresses[0]) as string;
}

/**
 * Contrôle d'une URL avant de la confier à un outil tiers (conteneur d'extraction, navigateur d'audit) : schéma http(s),
 * pas d'identifiants, hôte non local, TOUTES les adresses résolues publiques. Rend l'URL normalisée ou lève une erreur.
 * Limite connue : l'outil tiers résout ensuite lui-même le nom ; les URL finales qu'il rend sont revérifiées par l'appelant.
 * (Le navigateur d'audit, lui, passe par le mandataire local qui refuse à la connexion : voir audit/mandataire-audit.ts.)
 */
export async function exigerUrlPublique(urlDemandee: string, options: Pick<OptionsVerification, "adresseAutorisee" | "resoudre"> = {}): Promise<URL> {
  let url: URL;
  try { url = new URL(urlDemandee); } catch { throw new Error("URL invalide."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Schéma refusé : « ${url.protocol.replace(":", "")} » (http et https seulement).`);
  if (url.username !== "" || url.password !== "") throw new Error("URL refusée : identifiants dans l'adresse (aucune authentification n'est transmise).");
  await adresseVerifiee(url, { adresseAutorisee: options.adresseAutorisee ?? adresseAutorisee, resoudre: options.resoudre ?? resolveurSysteme });
  return url;
}

function requete(url: URL, ip: string, methode: "HEAD" | "GET", delaiMs: number): Promise<Reponse> {
  return new Promise((resolve, reject) => {
    const module = url.protocol === "https:" ? https : http;
    const req = module.request(
      {
        protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, ""), port: url.port === "" ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`, method: methode,
        // Connexion à l'adresse DÉJÀ vérifiée : aucune seconde résolution possible.
        lookup: (_h, options, cb) => {
          const famille = isIP(ip);
          if ((options as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: ip, family: famille }]);
          else cb(null, ip, famille);
        },
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-encoding": "identity", "accept-language": "fr-BE,fr;q=0.9,en;q=0.5", connection: "close" },
        agent: false,
      },
      (res) => {
        const morceaux: Buffer[] = [];
        let total = 0;
        const fin = (): void => {
          clearTimeout(minuteur);
          const loc = res.headers.location;
          resolve({ code: res.statusCode ?? 0, location: typeof loc === "string" ? loc : null, typeContenu: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : null, corps: Buffer.concat(morceaux) });
        };
        if (methode === "HEAD") { res.resume(); res.on("end", fin); res.on("error", reject); return; }
        res.on("data", (c: Buffer) => {
          total += c.length;
          morceaux.push(c);
          if (total >= MAX_OCTETS_CORPS) { res.destroy(); fin(); }
        });
        res.on("end", fin);
        res.on("close", fin);
        res.on("error", reject);
      },
    );
    const minuteur = setTimeout(() => { req.destroy(new ErreurVerification(`Délai dépassé (${delaiMs} ms) sans réponse complète.`)); }, delaiMs);
    req.on("error", (e) => { clearTimeout(minuteur); reject(e); });
    req.end();
  });
}

function decoder(corps: Buffer, typeContenu: string | null): string {
  const charset = /charset=["']?([\w-]+)/i.exec(typeContenu ?? "")?.[1] ?? "utf-8";
  const enc = (t: string): string => { try { return new TextDecoder(t).decode(corps.subarray(0, MAX_OCTETS_CORPS)); } catch { return new TextDecoder("utf-8").decode(corps.subarray(0, MAX_OCTETS_CORPS)); } };
  return enc(charset);
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const dentites = (t: string): string => t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e.startsWith("#")) { const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITES[e.toLowerCase()] ?? m;
});
const compacter = (t: string): string => dentites(t).replace(/\s+/g, " ").trim();

export function analyserContenu(texte: string, typeContenu: string | null): { titre: string | null; extrait: string | null } {
  const estHtml = typeContenu === null || /html|xml/i.test(typeContenu) || /^\s*</.test(texte);
  if (!estHtml) { const e = compacter(texte).slice(0, MAX_EXTRAIT); return { titre: null, extrait: e === "" ? null : e }; }
  const titre = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(texte)?.[1];
  const corps = texte.replace(/<(script|style|noscript|template|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ");
  const extrait = compacter(corps).slice(0, MAX_EXTRAIT);
  const t = titre === undefined ? "" : compacter(titre);
  return { titre: t === "" ? null : t, extrait: extrait === "" ? null : extrait };
}

/** Vérifie une URL : suit les redirections à la main (maxRedirections au plus), contrôle l'adresse à chaque saut. */
export async function verifierUrl(urlDemandee: string, methode: "HEAD" | "GET" = "GET", options: OptionsVerification = {}): Promise<ResultatVerification> {
  const debut = Date.now();
  const opts = {
    adresseAutorisee: options.adresseAutorisee ?? adresseAutorisee,
    resoudre: options.resoudre ?? resolveurSysteme,
  };
  const delaiMs = options.delaiMs ?? DELAI_REQUETE_MS;
  const maxRedirections = options.maxRedirections ?? MAX_REDIRECTIONS;
  const chaine: SautChaine[] = [];
  const r: ResultatVerification = { urlDemandee, code: null, chaine, destination: null, typeContenu: null, titre: null, extrait: null, dureeMs: 0 };
  let courante: URL;
  try {
    courante = new URL(urlDemandee);
  } catch {
    r.erreur = "URL invalide.";
    r.dureeMs = Date.now() - debut;
    return r;
  }
  try {
    for (let saut = 0; ; saut++) {
      if (courante.protocol !== "http:" && courante.protocol !== "https:") throw new ErreurVerification(`Schéma refusé : « ${courante.protocol.replace(":", "")} » (http et https seulement).`);
      if (courante.username !== "" || courante.password !== "") throw new ErreurVerification("URL refusée : identifiants dans l'adresse (aucune authentification n'est transmise).");
      const ip = await adresseVerifiee(courante, opts);
      let rep: Reponse;
      try {
        rep = await requete(courante, ip, methode, delaiMs);
      } catch (e) {
        chaine.push({ url: courante.href, code: null });
        r.destination = courante.href;
        throw e instanceof ErreurVerification ? e : new ErreurVerification(`Échec de la requête : ${e instanceof Error ? e.message : String(e)}`);
      }
      chaine.push({ url: courante.href, code: rep.code });
      r.code = rep.code;
      r.destination = courante.href;
      r.typeContenu = rep.typeContenu;
      if ([301, 302, 303, 307, 308].includes(rep.code) && rep.location !== null) {
        if (saut >= maxRedirections) throw new ErreurVerification(`Trop de redirections (${maxRedirections} au plus).`);
        try { courante = new URL(rep.location, courante); } catch { throw new ErreurVerification(`Redirection vers une adresse invalide : « ${rep.location.slice(0, 200)} ».`); }
        continue;
      }
      if (methode === "GET") Object.assign(r, analyserContenu(decoder(rep.corps, rep.typeContenu), rep.typeContenu));
      break;
    }
  } catch (e) {
    r.erreur = e instanceof Error ? e.message : String(e);
  }
  r.dureeMs = Date.now() - debut;
  return r;
}

// --- Outil et fournisseur ------------------------------------------------------------------------------------------------

export const schemaVerifierUrl = {
  url: z.string().min(1).max(2048).describe("Adresse à contrôler (http ou https, adresse publique)."),
  methode: z.enum(["HEAD", "GET"]).optional().describe("HEAD (code et redirections seulement) ou GET (par défaut : lit aussi le contenu, 512 Ko au plus)."),
};

export function outilsLiens(options: OptionsVerification = {}): OutilPasserelle[] {
  return [{
    nom: "verifier_url",
    description:
      "LECTURE. Contrôle une URL publique : code HTTP, chaîne de redirections suivies une à une (10 au plus), destination finale, type de contenu, " +
      "titre et extrait (500 caractères au plus) pour GET. Refuse les adresses locales, privées ou réservées, y compris atteintes par redirection. " +
      "Aucun cookie ni authentification n'est transmis. Un code 200 sur une page d'erreur reste à juger d'après le titre et l'extrait.",
    schemaEntree: schemaVerifierUrl,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    executer: (args) => {
      const a = args as { url: string; methode?: "HEAD" | "GET" };
      return verifierUrl(a.url, a.methode ?? "GET", options);
    },
  }];
}

export function fournisseurLiensReel(options: OptionsVerification = {}): FournisseurService {
  return { service: "liens", mode: "reel", fiche: FICHE_LIENS, outils: outilsLiens(options), autorisationLocale: true, verifierJeton: () => null };
}
