/**
 * Contrôle de provenance IA des livrables de la fabrique avant diffusion (lot 11, conception §7).
 *
 * La fabrique pose `provenance.json` à côté du livrable (fabrique/provenance.py). Avant toute
 * diffusion, la porte le relit et refuse si :
 * - il est absent ou illisible, ou ne vise pas le fichier ;
 * - `digital_source_type` n'est pas la valeur IPTC « trainedAlgorithmicMedia » ;
 * - `mention_visible` n'est pas vrai pour une vidéo ;
 * - une voix est employée et `filigrane_perth.detecte` n'est pas vrai ;
 * - une voix n'est plus au registre des voix autorisées (lu en lecture seule au moment de la
 *   publication ; registre illisible = refus), est expirée ou n'est plus permise à l'entreprise ;
 * - l'empreinte sha256 ne correspond plus au fichier.
 * Les contrôles sont purs (`verifierProvenance`) ; la lecture des fichiers est à part.
 */
import { join } from "node:path";
import { dossierTravail, empreinteDe, lireJson, ouvrirSur } from "./fabrique-remise.js";

export const DIGITAL_SOURCE_TYPE_IA = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
/** Extensions de fichiers de la fabrique soumises au contrôle. */
const EXTENSIONS_CONTROLEES = new Set(["mp4", "pdf", "docx", "xlsx", "pptx"]);
const MOTIF_VOIX = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const UUID_G = /livrables\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/giu;
const TAILLE_MAX_REGISTRE = 256 * 1024;

export interface VoixRegistre {
  id: string;
  expireLe: string;
  entreprises: string[];
}

type Verdict = { ok: true } | { ok: false; motif: string };
const refus = (motif: string): Verdict => ({ ok: false, motif });
const TRAVAUX_CITES_MAX = 10;
const objet = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Registre des voix : null si illisible ou invalide (la porte refuse alors). */
export function lireRegistreVoix(brut: unknown): VoixRegistre[] | null {
  const r = objet(brut);
  if (!r || !Array.isArray(r.voix)) return null;
  const voix: VoixRegistre[] = [];
  for (const e of r.voix) {
    const o = objet(e);
    if (!o || typeof o.id !== "string" || typeof o.expire_le !== "string" || !Array.isArray(o.entreprises)) return null;
    voix.push({ id: o.id, expireLe: o.expire_le, entreprises: o.entreprises.filter((x): x is string => typeof x === "string") });
  }
  return voix;
}

/** Contrôle pur d'une provenance déjà lue. `shaReel` : empreinte du fichier tel qu'il est maintenant (null = illisible). */
export function verifierProvenance(e: {
  provenance: unknown;
  fichier: string;
  entreprise: string;
  shaReel: string | null;
  registre: VoixRegistre[] | null;
  maintenant: Date;
}): Verdict {
  const p = objet(e.provenance);
  const nom = e.fichier;
  if (!p) return refus(`Provenance IA absente ou illisible pour « ${nom} » : diffusion refusée.`);
  if (p.fichier !== nom) return refus(`La provenance IA ne vise pas le fichier « ${nom} ».`);
  const type = p.type;
  if (type !== "video" && type !== "document") return refus(`Provenance IA de « ${nom} » : type inconnu.`);
  if (p.digital_source_type !== DIGITAL_SOURCE_TYPE_IA) return refus(`Provenance IA de « ${nom} » : digital_source_type manquant ou différent de trainedAlgorithmicMedia.`);
  if (type === "video" && p.mention_visible !== true) return refus(`Provenance IA de « ${nom} » : la mention « Contenu généré avec l'IA » n'est pas affichée.`);
  const voix = Array.isArray(p.voix) ? p.voix : null;
  if (!voix || !voix.every((v) => typeof v === "string" && MOTIF_VOIX.test(v))) return refus(`Provenance IA de « ${nom} » : liste de voix invalide.`);
  if (type === "video" && voix.length === 0) return refus(`Provenance IA de « ${nom} » : une vidéo de la fabrique a toujours une voix déclarée.`);
  const filigrane = objet(p.filigrane_perth);
  if (voix.length > 0 && filigrane?.detecte !== true) return refus(`Provenance IA de « ${nom} » : filigrane audio PerTh non détecté pour un contenu avec voix.`);
  if (typeof p.sha256 !== "string" || e.shaReel === null || p.sha256 !== e.shaReel) return refus(`« ${nom} » a été modifié depuis la pose de sa provenance (empreinte différente) : diffusion refusée.`);
  if (voix.length > 0) {
    if (!e.registre) return refus("Registre des voix autorisées illisible : diffusion refusée par prudence.");
    const aujourdhui = e.maintenant.toISOString().slice(0, 10);
    for (const id of voix as string[]) {
      const v = e.registre.find((x) => x.id === id);
      if (!v) return refus(`La voix « ${id} » n'est plus au registre des voix autorisées.`);
      if (aujourdhui >= v.expireLe) return refus(`La voix « ${id} » est expirée depuis le ${v.expireLe}.`);
      if (!v.entreprises.includes("*") && !v.entreprises.includes(e.entreprise.toLowerCase())) return refus(`La voix « ${id} » n'est plus autorisée pour cette entreprise.`);
    }
  }
  return { ok: true };
}

export interface DependancesControle {
  /** Dossier racine de la file de la fabrique pour l'entreprise. */
  racine: string;
  /** Chemin du registre des voix (`voix-autorisees/registre.json`), lu en lecture seule. */
  cheminRegistre: string;
  maintenant?: () => Date;
}

/** Empreinte du fichier ; null s'il est absent, lien symbolique ou non régulier. */
async function empreinteFichier(chemin: string): Promise<string | null> {
  const poignee = await ouvrirSur(chemin);
  if (!poignee) return null;
  try {
    const info = await poignee.stat();
    if (!info.isFile()) return null;
    const sha = await empreinteDe(poignee, info.size);
    return sha === "" ? null : sha;
  } finally {
    await poignee.close();
  }
}

async function lireRegistre(chemin: string): Promise<VoixRegistre[] | null> {
  try {
    const poignee = await ouvrirSur(chemin);
    if (!poignee) return null;
    try {
      const info = await poignee.stat();
      if (!info.isFile() || info.size > TAILLE_MAX_REGISTRE) return null;
      const tampon = Buffer.alloc(info.size);
      await poignee.read(tampon, 0, info.size, 0);
      return lireRegistreVoix(JSON.parse(tampon.toString("utf8")));
    } finally {
      await poignee.close();
    }
  } catch {
    return null;
  }
}

/**
 * Travaux de la fabrique cités par le texte du livrable ET par les arguments de l'appel (liens `.../livrables/<travail>`),
 * plus ceux déclarés. Liste normalisée : minuscules, triée, sans doublon.
 */
export function travauxFabriqueCites(corps: string, declares: readonly string[] = [], argumentsAppel: unknown = undefined): string[] {
  const trouves = new Set(declares.map((t) => t.toLowerCase()));
  let charge = "";
  try {
    charge = argumentsAppel === undefined ? "" : (JSON.stringify(argumentsAppel) ?? "");
  } catch {
    // Arguments non sérialisables : ils ne peuvent pas partir tels quels, rien à chercher.
  }
  for (const texte of [corps, charge]) for (const m of texte.matchAll(UUID_G)) trouves.add(m[1]!.toLowerCase());
  return [...trouves].sort();
}

/** Contrôle tous les fichiers vidéo et documents d'un travail terminé de la fabrique. */
export async function controlerTravailFabrique(d: DependancesControle, companyId: string, travail: string): Promise<Verdict> {
  const dossier = dossierTravail(d.racine, companyId, travail);
  if (!dossier) return refus("Identifiant de travail de la fabrique invalide.");
  const etat = objet(await lireJson(join(dossier, "etat.json")));
  const resultat = objet(await lireJson(join(dossier, "resultat.json")));
  if (!etat || etat.etat !== "termine" || !resultat || !Array.isArray(resultat.fichiers)) return refus(`Travail de la fabrique ${travail} introuvable ou non terminé : diffusion refusée.`);
  const noms = (resultat.fichiers as unknown[])
    .map((f) => objet(f)?.fichier)
    .filter((n): n is string => typeof n === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(n) && EXTENSIONS_CONTROLEES.has(n.slice(n.lastIndexOf(".") + 1).toLowerCase()));
  if (noms.length === 0) return { ok: true };
  const provenance = await lireJson(join(dossier, "provenance.json"));
  let registre: VoixRegistre[] | null | undefined;
  for (const nom of noms) {
    const voixUtilisees = Array.isArray(objet(provenance)?.voix) && (objet(provenance)!.voix as unknown[]).length > 0;
    if (voixUtilisees && registre === undefined) registre = await lireRegistre(d.cheminRegistre);
    const v = verifierProvenance({
      provenance, fichier: nom, entreprise: companyId, shaReel: await empreinteFichier(join(dossier, nom)),
      registre: registre ?? null, maintenant: (d.maintenant ?? (() => new Date()))(),
    });
    if (!v.ok) return v;
  }
  return { ok: true };
}

/** Contrôle de tous les travaux cités ; premier refus rendu. */
export async function controlerLivrablesFabrique(d: DependancesControle, companyId: string, travaux: readonly string[]): Promise<Verdict> {
  // Revue du 25/10 : chaque travail coûte une empreinte SHA-256 de ses fichiers (jusqu'à 600 Mio) ; même plafond que les travaux déclarés.
  if (travaux.length > TRAVAUX_CITES_MAX) return refus(`Trop de travaux de la fabrique cités (${travaux.length}, ${TRAVAUX_CITES_MAX} au plus).`);
  for (const t of travaux) {
    const v = await controlerTravailFabrique(d, companyId, t);
    if (!v.ok) return v;
  }
  return { ok: true };
}
