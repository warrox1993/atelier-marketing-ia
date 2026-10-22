// Réglages du serveur de pages (variables d'environnement) et chemins partagés avec la passerelle.

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { verifierHoteEcoute } from "../config.js";

export const PORT_PAGES_PAR_DEFAUT = 3195;
export const URL_PAGES_PAR_DEFAUT = `http://127.0.0.1:${PORT_PAGES_PAR_DEFAUT}`;

export class ErreurConfigPages extends Error {}

export const baseParDefaut = (): string => join(homedir(), ".local", "share", "atelier", "pages", "pages.sqlite");

export interface ConfigPages {
  hote: string;
  port: number;
  base: string;
  secret: Buffer;
  secretEphemere: boolean;
  fichierUmami: string | null;
  atelierApi: string;
  atelierPlugin: string;
  cleBoard: string | null;
  urlPages: string;
  hotesAutorises: string[];
  indexable: boolean;
  cookieSecurise: boolean;
  confianceProxy: boolean;
  /** Mandataires de confiance devant le serveur (PAGES_PROXY_SAUTS, 1 par défaut). */
  sautsProxy: number;
}

function lireSecretFichier(chemin: string, longueurMin: number): string {
  const st = statSync(chemin);
  if ((st.mode & 0o077) !== 0) throw new ErreurConfigPages(`${chemin} est lisible par d'autres comptes (chmod 600 attendu).`);
  const v = readFileSync(chemin, "utf8").trim();
  if (v.length < longueurMin) throw new ErreurConfigPages(`${chemin} : secret trop court (${longueurMin} caractères au moins).`);
  return v;
}

function entierPositif(v: string | undefined, defaut: number): number {
  if (v === undefined || v.trim() === "") return defaut;
  if (!/^[1-9][0-9]{0,1}$/u.test(v.trim())) throw new ErreurConfigPages("PAGES_PROXY_SAUTS doit être un entier de 1 à 99 (nombre de mandataires de confiance).");
  return Number(v.trim());
}
const oui = (v: string | undefined): boolean => v !== undefined && /^(oui|1|true)$/iu.test(v.trim());

export function lireConfigPages(env: NodeJS.ProcessEnv, aleatoire: () => Buffer): ConfigPages {
  const port = env["PAGES_PORT"] ? Number(env["PAGES_PORT"]) : PORT_PAGES_PAR_DEFAUT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ErreurConfigPages(`PAGES_PORT invalide : « ${env["PAGES_PORT"]} ».`);
  const hote = verifierHoteEcoute(env["PAGES_HOTE"] ?? "127.0.0.1");
  const api = (env["ATELIER_API"]?.trim() || "http://127.0.0.1:3100/api").replace(/\/+$/u, "");
  const u = new URL(api);
  if (u.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) throw new ErreurConfigPages("ATELIER_API doit viser l'instance sur la boucle locale (http://127.0.0.1:<port>/api).");
  const fichierSecret = env["PAGES_SECRET_FICHIER"]?.trim();
  const cleFichier = env["ATELIER_CLE_BOARD_FICHIER"]?.trim();
  const urlPages = (env["PAGES_URL_PUBLIQUE"]?.trim() || `http://127.0.0.1:${port}`).replace(/\/+$/u, "");
  new URL(urlPages);
  return {
    hote,
    port,
    base: env["PAGES_BASE"]?.trim() || baseParDefaut(),
    secret: fichierSecret ? Buffer.from(lireSecretFichier(fichierSecret, 32), "utf8") : aleatoire(),
    secretEphemere: !fichierSecret,
    fichierUmami: env["PAGES_UMAMI_FICHIER"]?.trim() || null,
    atelierApi: api,
    atelierPlugin: env["ATELIER_PLUGIN"]?.trim() || "atelier.marketing-ia",
    cleBoard: cleFichier ? lireSecretFichier(cleFichier, 8) : null,
    urlPages,
    hotesAutorises: (env["PAGES_HOTES_AUTORISES"] ?? "").split(/[\s,]+/u).filter((h) => h !== ""),
    indexable: oui(env["PAGES_INDEXABLE"]),
    cookieSecurise: oui(env["PAGES_COOKIE_SECURISE"]) || urlPages.startsWith("https://"),
    confianceProxy: oui(env["PAGES_CONFIANCE_PROXY"]),
    sautsProxy: entierPositif(env["PAGES_PROXY_SAUTS"], 1),
  };
}
