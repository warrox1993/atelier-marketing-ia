/**
 * Collecteurs K1 : relevé des versions (GitHub, npm, PyPI) et lecture d'une page officielle.
 * Le texte collecté est une donnée : les injections sont signalées, jamais suivies.
 */
import type { ResultatLecture } from "../lecture-url.js";
import { injectionsSignalees, signalementInvisibles } from "../contenu-externe.js";
import { empreinte, normaliserTexte } from "./normaliseur.js";

export type LireUrl = (url: string) => Promise<ResultatLecture>;

export type VersionRelevee = { version: string; publieeLe: string | null; prerelease: boolean };

export type ResultatCollecte = {
  url: string;
  etat: "nouveau" | "inchange" | "refuse" | "echec" | "quota";
  texteNormalise?: string;
  empreinte?: string;
  etag?: string;
  motif?: string;
  injections?: string[];
};

const SEMVER_FIN = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u;

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texteOuNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Une version est préliminaire si elle a un suffixe semver « -x ». */
const estPrerelease = (version: string): boolean => version.includes("-");

/** Releases GitHub : le tag peut avoir un préfixe (« rea-agents-6.8.0 », « v6.8.0 »). */
export function versionsGithub(releasesJson: unknown): VersionRelevee[] {
  if (!Array.isArray(releasesJson)) return [];
  const relevees: VersionRelevee[] = [];
  for (const r of releasesJson) {
    if (!estObjet(r)) continue;
    const version = texteOuNull(r.tag_name)?.match(SEMVER_FIN)?.[1];
    if (!version) continue;
    relevees.push({ version, publieeLe: texteOuNull(r.published_at), prerelease: r.prerelease === true || estPrerelease(version) });
  }
  return relevees;
}

/** Fiche de paquet npm : versions + dates dans « time ». */
export function versionsNpm(paquetJson: unknown): VersionRelevee[] {
  if (!estObjet(paquetJson) || !estObjet(paquetJson.versions)) return [];
  const dates = estObjet(paquetJson.time) ? paquetJson.time : {};
  return Object.keys(paquetJson.versions).map((version) => ({
    version,
    publieeLe: texteOuNull(dates[version]),
    prerelease: estPrerelease(version),
  }));
}

/** Préversion PEP 440 : segment a, b, rc ou dev (« 6.9.0rc1 », « 7.0.0.dev2 ») ; « .post1 » reste stable. */
const RE_PREVERSION_PEP440 = /\d(?:[._-]?(?:a|b|c|rc|alpha|beta|pre|preview|dev)\d*)/iu;

/** API JSON de PyPI (https://pypi.org/pypi/<nom>/json) : versions dans « releases », date du premier fichier publié. */
export function versionsPypi(paquetJson: unknown): VersionRelevee[] {
  if (!estObjet(paquetJson) || !estObjet(paquetJson.releases)) return [];
  return Object.entries(paquetJson.releases).map(([version, fichiers]) => {
    const premier = Array.isArray(fichiers) && estObjet(fichiers[0]) ? fichiers[0] : {};
    return { version, publieeLe: texteOuNull(premier.upload_time_iso_8601), prerelease: RE_PREVERSION_PEP440.test(version) };
  });
}

const partiesNumeriques = (v: string): number[] => v.split("-")[0]!.split(".").map(Number);

/** Plus haute version non préliminaire (comparaison semver majeur.mineur.correctif). */
export function derniereStable(versions: VersionRelevee[]): VersionRelevee | null {
  let meilleure: VersionRelevee | null = null;
  for (const v of versions) {
    if (v.prerelease) continue;
    if (!meilleure) { meilleure = v; continue; }
    const a = partiesNumeriques(v.version);
    const b = partiesNumeriques(meilleure.version);
    const plusHaute = a.findIndex((n, i) => n !== b[i]);
    if (plusHaute >= 0 && a[plusHaute]! > b[plusHaute]!) meilleure = v;
  }
  return meilleure;
}

function typeNormalisation(typeContenu: string | null): "html" | "texte" | "json" {
  const t = (typeContenu ?? "").toLowerCase();
  if (t.includes("json")) return "json";
  if (t.includes("html")) return "html";
  return "texte";
}

/** Quota épuisé = 403 ou 429 dont le corps parle de limite de débit ; ce n'est pas un échec (FR-033). */
const estQuota = (l: ResultatLecture): boolean =>
  (l.codeHttp === 403 || l.codeHttp === 429) && /rate limit/iu.test(l.corps ?? "");

/** Motif robots.txt (RFC 9309, § 2.2.3) : `*` vaut toute suite, `$` final ancre la fin. */
const motifRobots = (motif: string): RegExp =>
  // shortcut: chemins comparés sans normaliser l'encodage pour cent (RFC 9309, § 2.2.2), à ajouter si une source le demande.
  new RegExp(`^${motif.replace(/[.+?^{}()|[\]\\]/gu, "\\$&").replace(/\$(?!$)/gu, "\\$").replace(/\*/gu, ".*")}`, "u");

/**
 * SPEC-E3 (droits-collecte.md § 1, point 2) : la page est-elle permise par ce robots.txt ? Groupe `*` seulement ;
 * la règle au motif le plus long l'emporte, Allow à égalité ; aucune règle : permise.
 */
export function robotsAutorise(robots: string, url: string): boolean {
  const { pathname, search } = new URL(url);
  const chemin = pathname + search;
  const regles: Array<{ permise: boolean; motif: string }> = [];
  let agents: string[] = [];
  let dansRegles = false;
  for (const brute of robots.split(/\r?\n/u)) {
    const m = /^([a-z-]+)\s*:\s*(.*)$/iu.exec(brute.replace(/#.*/u, "").trim());
    if (!m) continue;
    const cle = m[1]!.toLowerCase();
    const valeur = m[2]!.trim();
    if (cle === "user-agent") {
      if (dansRegles) [agents, dansRegles] = [[], false];
      agents.push(valeur.toLowerCase());
    } else if (cle === "allow" || cle === "disallow") {
      dansRegles = true;
      if (agents.includes("*") && valeur !== "") regles.push({ permise: cle === "allow", motif: valeur });
    }
  }
  let retenue: { permise: boolean; motif: string } | null = null;
  for (const r of regles) {
    if (!motifRobots(r.motif).test(chemin)) continue;
    if (!retenue || r.motif.length > retenue.motif.length || (r.motif.length === retenue.motif.length && r.permise)) retenue = r;
  }
  return retenue?.permise ?? true;
}

export async function collecterSource(
  s: { url: string; etag: string | null; derniereEmpreinte: string | null; politique: { autorisee: boolean; motif?: string } },
  lire: LireUrl,
): Promise<ResultatCollecte> {
  if (!s.politique.autorisee) return { url: s.url, etat: "refuse", motif: s.politique.motif };
  let lecture: ResultatLecture;
  try {
    lecture = await lire(s.url);
  } catch (e) {
    return { url: s.url, etat: "echec", motif: e instanceof Error ? e.message : String(e) };
  }
  // shortcut: transport sans en-têtes, à brancher si le transport les expose (If-None-Match, champ etag)
  if (lecture.codeHttp === 304) return { url: s.url, etat: "inchange" };
  if (estQuota(lecture)) return { url: s.url, etat: "quota", motif: `limite de débit (HTTP ${lecture.codeHttp})` };
  if (lecture.statut !== "accessible" || lecture.corps === null) {
    return { url: s.url, etat: "echec", motif: lecture.message || `HTTP ${lecture.codeHttp ?? "?"}` };
  }
  const texteNormalise = normaliserTexte(lecture.corps, typeNormalisation(lecture.typeContenu));
  if (texteNormalise === "") return { url: s.url, etat: "echec", motif: "contenu vide après normalisation" };
  const emp = empreinte(texteNormalise);
  const injections = [...injectionsSignalees(texteNormalise), ...signalementInvisibles(lecture.corps)];
  if (emp === s.derniereEmpreinte) return { url: s.url, etat: "inchange", empreinte: emp, injections };
  return { url: s.url, etat: "nouveau", texteNormalise, empreinte: emp, injections };
}
