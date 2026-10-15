/**
 * Protection SSRF des lectures d'URL (cahier §14) : schémas permis,
 * adresses privées, réservées et de métadonnées bloquées, ports limités,
 * identifiants interdits. Fonctions pures (aucun accès réseau).
 *
 * Plus strict que la protection native de `ctx.http.fetch` : bloque aussi
 * 100.64.0.0/10, 0.0.0.0/8, les plages de test et de documentation, la
 * multidiffusion, 240.0.0.0/4, NAT64, Teredo, 6to4 et site-local, et refuse
 * une résolution DNS dès qu'UNE adresse est interdite.
 */
import { BlockList, isIP } from "node:net";

// Deux listes distinctes : une même BlockList applique ses règles IPv6
// « ::ffff:0:0/96 » aux adresses IPv4 (constaté le 15/10/2026 : toutes les
// IPv4 publiques étaient alors bloquées). Les adresses IPv6 qui embarquent une
// IPv4 sont traitées explicitement dans `adresseInterdite`.
const BLOQUEES_V4 = new BlockList();
for (const [reseau, prefixe] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOQUEES_V4.addSubnet(reseau, prefixe, "ipv4");
}
const BLOQUEES_V6 = new BlockList();
for (const [reseau, prefixe] of [
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  BLOQUEES_V6.addSubnet(reseau, prefixe, "ipv6");
}

/** Développe une adresse IPv6 en 8 groupes de 16 bits (null si invalide). */
export function developperIpv6(adresse: string): number[] | null {
  let texte = adresse.toLowerCase();
  const groupesV4: number[] = [];
  const v4 = texte.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/u);
  if (v4?.[1] && v4[2]) {
    const octets = v4[2].split(".").map(Number);
    if (octets.some((o) => o > 255)) return null;
    groupesV4.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
    texte = v4[1].endsWith("::") ? v4[1] : v4[1].slice(0, -1);
  }
  const moities = texte.split("::");
  if (moities.length > 2) return null;
  const lire = (m: string) => (m === "" ? [] : m.split(":").map((g) => (/^[0-9a-f]{1,4}$/u.test(g) ? parseInt(g, 16) : Number.NaN)));
  const gauche = lire(moities[0] ?? "");
  if (moities.length === 1) {
    const groupes = [...gauche, ...groupesV4];
    return groupes.length === 8 && groupes.every((x) => Number.isInteger(x)) ? groupes : null;
  }
  const droite = [...lire(moities[1] ?? ""), ...groupesV4];
  const zeros = 8 - gauche.length - droite.length;
  if (zeros < 1) return null;
  const groupes = [...gauche, ...Array<number>(zeros).fill(0), ...droite];
  return groupes.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? groupes : null;
}

/** true si l'adresse IP littérale est interdite (privée, réservée, locale, métadonnées…). */
export function adresseInterdite(adresse: string): boolean {
  const brute = adresse.replace(/^\[|\]$/gu, "").split("%")[0] ?? "";
  const famille = isIP(brute);
  if (famille === 0) return true;
  if (famille === 4) return BLOQUEES_V4.check(brute, "ipv4");
  const g = developperIpv6(brute);
  if (!g) return true;
  const prefixeNul = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  if (prefixeNul && g[5] === 0xffff) {
    // ::ffff:a.b.c.d (IPv4 mappée) : jugée comme l'IPv4 embarquée.
    return BLOQUEES_V4.check(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`, "ipv4");
  }
  // ::, ::1 et ::/96 (IPv4 « compatible », obsolète) : interdites.
  if (prefixeNul && g[5] === 0) return true;
  return BLOQUEES_V6.check(brute, "ipv6");
}

const PORTS_PERMIS = new Set([80, 443, 8080, 8443]);
const SUFFIXES_INTERDITS = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp", ".localdomain"];

export type RefusUrl =
  | "url_invalide"
  | "schema_interdit"
  | "identifiants_dans_url"
  | "port_interdit"
  | "hote_interdit"
  | "adresse_interdite"
  | "url_trop_longue";

export interface UrlValidee {
  url: URL;
  hote: string;
  /** Adresse IP littérale si l'hôte en est une. */
  ipLitterale: string | null;
}

/** Valide une URL avant toute résolution DNS. */
export function validerUrl(brute: string): { ok: true; valeur: UrlValidee } | { ok: false; refus: RefusUrl; message: string } {
  if (brute.length > 2048) return { ok: false, refus: "url_trop_longue", message: "URL trop longue (2048 caractères au plus)." };
  let url: URL;
  try {
    url = new URL(brute.trim());
  } catch {
    return { ok: false, refus: "url_invalide", message: "URL invalide." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, refus: "schema_interdit", message: `Schéma ${url.protocol} interdit : seuls http et https sont permis.` };
  }
  if (url.username || url.password) {
    return { ok: false, refus: "identifiants_dans_url", message: "Les identifiants dans l'URL sont interdits." };
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!PORTS_PERMIS.has(port)) {
    return { ok: false, refus: "port_interdit", message: `Port ${port} interdit (80, 443, 8080, 8443 seulement).` };
  }
  const hote = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase().replace(/\.$/u, "");
  if (!hote) return { ok: false, refus: "hote_interdit", message: "Hôte absent." };
  if (isIP(hote) !== 0) {
    if (adresseInterdite(hote)) return { ok: false, refus: "adresse_interdite", message: `Adresse ${hote} interdite (privée, locale ou réservée).` };
    return { ok: true, valeur: { url, hote, ipLitterale: hote } };
  }
  // Formes numériques détournées (http://2130706433, http://0x7f.1) : refusées.
  if (/^[0-9.]+$/u.test(hote) || /^0x[0-9a-f]+/iu.test(hote) || hote.split(".").some((s) => /^0x/iu.test(s))) {
    return { ok: false, refus: "hote_interdit", message: "Forme numérique d'hôte non standard refusée." };
  }
  if (hote === "localhost" || !hote.includes(".") || SUFFIXES_INTERDITS.some((s) => hote.endsWith(s))) {
    return { ok: false, refus: "hote_interdit", message: `Hôte ${hote} interdit (local ou non qualifié).` };
  }
  return { ok: true, valeur: { url, hote, ipLitterale: null } };
}

/** Vérifie TOUTES les adresses issues d'une résolution DNS : une seule interdite suffit à refuser. */
export function adressesResoluesAutorisees(adresses: ReadonlyArray<{ address: string }>): { ok: boolean; interdites: string[] } {
  if (adresses.length === 0) return { ok: false, interdites: [] };
  const interdites = adresses.map((a) => a.address).filter((a) => adresseInterdite(a));
  return { ok: interdites.length === 0, interdites };
}
