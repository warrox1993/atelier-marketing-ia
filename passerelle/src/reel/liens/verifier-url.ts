// Service réel « liens » : outil `verifier_url` (lecture seule). Il suit les redirections à la main et rend, pour une URL, le
// code HTTP, la chaîne de redirections, la destination finale et un contrôle du contenu (titre, extrait). Anti-SSRF : schémas
// http et https seulement, refus des adresses locales, privées et réservées, vérifié après résolution DNS à CHAQUE saut, et la
// connexion se fait sur l'adresse déjà vérifiée (pas de seconde résolution, donc pas de « DNS rebinding »). Aucun cookie ni
// en-tête d'authentification n'est transmis.

import { BlockList, isIP } from "node:net";
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

export const FICHE_LIENS = {
  id: "liens",
  libelle: "Vérification de liens (lecture d'URL protégée)",
  portees: ["liens:lecture"],
  proprietesDemo: [{ id: "web/public", libelle: "Web public (lecture seule, adresses publiques uniquement)" }],
} as const;

// --- Filtre d'adresses ---------------------------------------------------------------------------------------------------

const INTERDITES = new BlockList();
for (const [reseau, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) INTERDITES.addSubnet(reseau, bits, "ipv4");
for (const [reseau, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96]] as const) {
  INTERDITES.addSubnet(reseau, bits, "ipv6");
}

/** Adresse IP autorisée en production : publique seulement (ni locale, ni privée, ni réservée). */
export function adresseAutorisee(ip: string): boolean {
  const famille = isIP(ip);
  if (famille === 0) return false;
  if (famille === 6 && /^::ffff:/i.test(ip)) {
    // IPv4 inscrite dans IPv6 (::ffff:a.b.c.d ou forme hexadécimale) : on juge l'IPv4 portée.
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (m?.[1]) return adresseAutorisee(m[1]);
    const h = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (h?.[1] && h[2]) {
      const a = parseInt(h[1], 16), b = parseInt(h[2], 16);
      return adresseAutorisee(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
    }
    return false;
  }
  return !INTERDITES.check(ip, famille === 4 ? "ipv4" : "ipv6");
}

export type Resolveur = (hote: string) => Promise<string[]>;

const resolveurSysteme: Resolveur = async (hote) => (await dnsLookup(hote, { all: true, verbatim: true })).map((a) => a.address);

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

class ErreurVerification extends Error {}

// --- Cœur ----------------------------------------------------------------------------------------------------------------

interface Reponse { code: number; location: string | null; typeContenu: string | null; corps: Buffer }

function nomHoteInterdit(hote: string): boolean {
  const h = hote.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost");
}

/** Résout l'hôte, vérifie TOUTES les adresses obtenues, renvoie celle sur laquelle se connecter. */
async function adresseVerifiee(url: URL, opts: Required<Pick<OptionsVerification, "adresseAutorisee" | "resoudre">>): Promise<string> {
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
  return { service: "liens", mode: "reel", fiche: FICHE_LIENS, outils: outilsLiens(options), verifierJeton: () => null };
}
