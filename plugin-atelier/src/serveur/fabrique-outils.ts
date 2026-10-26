/**
 * Outils d'agent de la fabrique (lot 2) : `fabriquer_document` et `etat_fabrication`.
 *
 * Le plugin ne lance AUCUN programme : il valide la demande, contrôle le rôle de l'agent et le quota,
 * puis dépose un fichier JSON dans la file (`<dossier>/entrant/<uuid>.json`, écriture atomique). La
 * fabrique (Python, hors plugin) consomme la file. Les résultats se lisent dans
 * `<dossier>/livrables/<entreprise>/<travail>/{etat,resultat}.json`.
 *
 * Fonctions pures + dépendances injectées (testables sans hôte).
 */
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolResult } from "@paperclipai/plugin-sdk";
import {
  FORMATS_DOCUMENT,
  FORMATS_SORTIE_VIDEO,
  GABARITS_VIDEO,
  LANGUES_DOCUMENT,
  LIMITE_BLOCS,
  LIMITE_CHIFFRE_VISUEL,
  LIMITE_COLONNES,
  LIMITE_ELEMENTS_LISTE,
  LIMITE_FEUILLES,
  LIMITE_LIGNES,
  LIMITE_PLAGES,
  LIMITE_POINT_VISUEL,
  LIMITE_SCENES,
  LIMITE_SOUS_TITRE_VISUEL,
  LIMITE_TEXTE,
  LIMITE_TEXTE_VOIX,
  LIMITE_TITRE,
  LIMITE_TITRE_VISUEL,
  DUREE_MAX_SCENE_MAX,
  DUREE_MAX_SCENE_MIN,
  MOTIF_IDENTIFIANT_VIDEO,
  MODELES_DOCUMENT,
  TYPES_CELLULE,
} from "../contrats/fabrique-outils-schemas.js";

import { ajouterAuSuivi, dossierTravail, lireApercu, sousVerrouSuivi, type TravailSuivi } from "./fabrique-remise.js";

export const DOSSIER_FILE_DEFAUT = "/var/lib/atelier-fabrique";
export const QUOTA_TRAVAUX_PAR_JOUR = 50;
export const QUOTA_VIDEOS_PAR_JOUR = 10;
export const TAILLE_MAX_DEMANDE_OCTETS = 256 * 1024;
export const TAILLE_MAX_FICHIER_OCTETS = 512 * 1024;
const CLE_QUOTA = "fabrique-quota";
const CLE_QUOTA_VIDEO = "fabrique-quota-video";
const MODE_FICHIER = 0o640;
const MODE_DOSSIER = 0o750;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
// Caractères de contrôle retirés, sauf tabulation (0x09) et saut de ligne (0x0A).
const CONTROLES = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;

// Demi-paire de substitution isolée : séquence qui ne s'encode pas en UTF-8 valide.
const SUBSTITUT_ISOLE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export type Demande = Record<string, unknown>;
export type ResultatValidation = { ok: true; demande: Demande } | { ok: false; erreur: string };

class ErreurDemande extends Error {}

function refuser(chemin: string, message: string): never {
  throw new ErreurDemande(`${chemin} : ${message}`);
}

function objet(v: unknown, chemin: string, permises: readonly string[], requises: readonly string[]): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) refuser(chemin, "objet attendu");
  const o = v as Record<string, unknown>;
  for (const cle of Object.keys(o)) if (!permises.includes(cle)) refuser(chemin, `champ inconnu « ${cle.slice(0, 40)} »`);
  for (const cle of requises) if (!(cle in o)) refuser(chemin, `champ obligatoire « ${cle} » absent`);
  return o;
}

function chaine(v: unknown, chemin: string, max: number, min = 0): string {
  if (typeof v !== "string") refuser(chemin, "texte attendu");
  if (SUBSTITUT_ISOLE.test(v)) refuser(chemin, "UTF-8 invalide");
  const propre = v.replace(CONTROLES, "");
  if (propre.length > max) refuser(chemin, `texte trop long (max ${max} caractères)`);
  if (propre.length < min) refuser(chemin, "texte trop court");
  return propre;
}

function tableau(v: unknown, chemin: string, max: number): unknown[] {
  if (!Array.isArray(v)) refuser(chemin, "tableau attendu");
  if (v.length > max) refuser(chemin, `trop d'éléments (max ${max})`);
  return v;
}

function enumeration<T extends string>(v: unknown, chemin: string, valeurs: readonly T[]): T {
  if (typeof v !== "string" || !(valeurs as readonly string[]).includes(v)) refuser(chemin, `valeur hors liste (${valeurs.join(", ")})`);
  return v as T;
}

function plages(v: unknown, chemin: string, longueur: number): Array<{ debut: number; fin: number }> {
  return tableau(v, chemin, LIMITE_PLAGES).map((p, i) => {
    const o = objet(p, `${chemin}[${i}]`, ["debut", "fin"], ["debut", "fin"]);
    const { debut, fin } = o;
    if (!Number.isInteger(debut) || !Number.isInteger(fin)) refuser(`${chemin}[${i}]`, "entiers attendus");
    const d = debut as number;
    const f = fin as number;
    if (d < 0 || f < d || f > longueur) refuser(`${chemin}[${i}]`, "plage hors du texte");
    return { debut: d, fin: f };
  });
}

function bloc(v: unknown, chemin: string): Record<string, unknown> {
  const brut = objet(v, chemin, ["type", "niveau", "texte", "gras", "italique", "ordonnee", "elements", "entetes", "lignes", "livrable", "legende"], ["type"]);
  const type = enumeration(brut.type, `${chemin}.type`, ["titre", "paragraphe", "liste", "tableau", "saut_de_page", "image"] as const);
  const permises: Record<typeof type, readonly string[]> = {
    titre: ["type", "niveau", "texte"],
    paragraphe: ["type", "texte", "gras", "italique"],
    liste: ["type", "ordonnee", "elements"],
    tableau: ["type", "entetes", "lignes"],
    saut_de_page: ["type"],
    image: ["type", "livrable", "legende"],
  };
  const requises: Record<typeof type, readonly string[]> = {
    titre: ["type", "niveau", "texte"],
    paragraphe: ["type", "texte"],
    liste: ["type", "elements"],
    tableau: ["type", "lignes"],
    saut_de_page: ["type"],
    image: ["type", "livrable"],
  };
  const o = objet(brut, chemin, permises[type], requises[type]);
  switch (type) {
    case "titre": {
      const niveau = o.niveau;
      if (!Number.isInteger(niveau) || (niveau as number) < 1 || (niveau as number) > 3) refuser(`${chemin}.niveau`, "entier de 1 à 3 attendu");
      return { type, niveau, texte: chaine(o.texte, `${chemin}.texte`, LIMITE_TEXTE) };
    }
    case "paragraphe": {
      const t = chaine(o.texte, `${chemin}.texte`, LIMITE_TEXTE);
      return {
        type,
        texte: t,
        ...(o.gras !== undefined ? { gras: plages(o.gras, `${chemin}.gras`, t.length) } : {}),
        ...(o.italique !== undefined ? { italique: plages(o.italique, `${chemin}.italique`, t.length) } : {}),
      };
    }
    case "liste": {
      if (o.ordonnee !== undefined && typeof o.ordonnee !== "boolean") refuser(`${chemin}.ordonnee`, "booléen attendu");
      return {
        type,
        ...(o.ordonnee !== undefined ? { ordonnee: o.ordonnee } : {}),
        elements: tableau(o.elements, `${chemin}.elements`, LIMITE_ELEMENTS_LISTE).map((e, i) => chaine(e, `${chemin}.elements[${i}]`, LIMITE_TEXTE)),
      };
    }
    case "tableau": {
      const ligne = (l: unknown, c: string) => tableau(l, c, LIMITE_COLONNES).map((x, i) => chaine(x, `${c}[${i}]`, LIMITE_TEXTE));
      return {
        type,
        ...(o.entetes !== undefined ? { entetes: ligne(o.entetes, `${chemin}.entetes`) } : {}),
        lignes: tableau(o.lignes, `${chemin}.lignes`, LIMITE_LIGNES).map((l, i) => ligne(l, `${chemin}.lignes[${i}]`)),
      };
    }
    case "saut_de_page":
      return { type };
    case "image": {
      const livrable = chaine(o.livrable, `${chemin}.livrable`, 36);
      if (!UUID.test(livrable)) refuser(`${chemin}.livrable`, "identifiant de livrable (UUID) attendu");
      return { type, livrable: livrable.toLowerCase(), ...(o.legende !== undefined ? { legende: chaine(o.legende, `${chemin}.legende`, LIMITE_TEXTE) } : {}) };
    }
  }
}

function cellule(v: unknown, chemin: string): Record<string, unknown> {
  const o = objet(v, chemin, ["type", "valeur"], ["type", "valeur"]);
  const type = enumeration(o.type, `${chemin}.type`, TYPES_CELLULE);
  const valeur = o.valeur;
  if (type === "nombre") {
    if (typeof valeur !== "number" || !Number.isFinite(valeur)) refuser(`${chemin}.valeur`, "nombre fini attendu");
    return { type, valeur };
  }
  if (type === "booleen") {
    if (typeof valeur !== "boolean") refuser(`${chemin}.valeur`, "booléen attendu");
    return { type, valeur };
  }
  // « texte » : une chaîne commençant par = + - @ reste du texte (le générateur la marquera, le schéma ne la refuse pas).
  const t = chaine(valeur, `${chemin}.valeur`, LIMITE_TEXTE);
  if (type === "date" && (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/u.test(t) || Number.isNaN(Date.parse(t)))) {
    refuser(`${chemin}.valeur`, "date ISO 8601 attendue (AAAA-MM-JJ)");
  }
  return { type, valeur: t };
}

function feuille(v: unknown, chemin: string): Record<string, unknown> {
  const o = objet(v, chemin, ["nom", "lignes"], ["nom", "lignes"]);
  return {
    nom: chaine(o.nom, `${chemin}.nom`, 31, 1),
    lignes: tableau(o.lignes, `${chemin}.lignes`, LIMITE_LIGNES).map((l, i) =>
      tableau(l, `${chemin}.lignes[${i}]`, LIMITE_COLONNES).map((c, j) => cellule(c, `${chemin}.lignes[${i}][${j}]`)),
    ),
  };
}

/** Valide une demande de document et renvoie une copie nettoyée (contrôles retirés). Ne modifie pas l'entrée. */
export function validerDemandeDocument(entree: unknown): ResultatValidation {
  try {
    const o = objet(entree, "demande", ["format", "modele", "titre", "langue", "blocs", "feuilles"], ["format", "modele", "titre", "langue"]);
    const format = enumeration(o.format, "format", FORMATS_DOCUMENT);
    const demande: Demande = {
      format,
      modele: enumeration(o.modele, "modele", MODELES_DOCUMENT),
      titre: chaine(o.titre, "titre", LIMITE_TITRE, 1),
      langue: enumeration(o.langue, "langue", LANGUES_DOCUMENT),
    };
    if (o.blocs !== undefined) demande.blocs = tableau(o.blocs, "blocs", LIMITE_BLOCS).map((b, i) => bloc(b, `blocs[${i}]`));
    if (o.feuilles !== undefined) {
      if (format !== "xlsx") refuser("feuilles", "réservé au format xlsx");
      demande.feuilles = tableau(o.feuilles, "feuilles", LIMITE_FEUILLES).map((f, i) => feuille(f, `feuilles[${i}]`));
    }
    // Mêmes règles que la fabrique (fabrique/generateurs/documents.py, validation de la demande) :
    // xlsx = au moins une feuille et aucun bloc ; autres formats = blocs facultatifs.
    if (format === "xlsx") {
      if (Array.isArray(demande.blocs) && demande.blocs.length > 0) refuser("blocs", "interdit pour le format xlsx (utiliser 'feuilles')");
      if (!Array.isArray(demande.feuilles) || demande.feuilles.length === 0) refuser("feuilles", "au moins une feuille requise pour le format xlsx");
    }
    return verifierTaille(demande);
  } catch (e) {
    if (e instanceof ErreurDemande) return { ok: false, erreur: e.message };
    throw e;
  }
}

const IDENTIFIANT_VIDEO = new RegExp(MOTIF_IDENTIFIANT_VIDEO, "u");

function identifiantVideo(v: unknown, chemin: string): string {
  const t = chaine(v, chemin, 64, 1);
  if (!IDENTIFIANT_VIDEO.test(t)) refuser(chemin, "identifiant attendu (minuscules, chiffres et tirets, 1 à 64 caractères)");
  return t;
}

// Champs obligatoires et facultatifs de chaque gabarit, identiques à GABARITS de fabrique/generateurs/visuels.py.
const CHAMPS_GABARIT: Record<(typeof GABARITS_VIDEO)[number], { obligatoires: string[]; facultatifs: string[] }> = {
  titre_plein_ecran: { obligatoires: ["titre"], facultatifs: ["sous_titre"] },
  chiffre_cle: { obligatoires: ["chiffre", "titre"], facultatifs: ["sous_titre"] },
  liste_3_points: { obligatoires: ["titre", "points"], facultatifs: [] },
};

function champsVisuel(v: unknown, chemin: string, gabarit: (typeof GABARITS_VIDEO)[number]): Record<string, unknown> {
  const { obligatoires, facultatifs } = CHAMPS_GABARIT[gabarit];
  const o = objet(v, chemin, [...obligatoires, ...facultatifs], obligatoires);
  return {
    ...(o.titre !== undefined ? { titre: chaine(o.titre, `${chemin}.titre`, LIMITE_TITRE_VISUEL) } : {}),
    ...(o.sous_titre !== undefined ? { sous_titre: chaine(o.sous_titre, `${chemin}.sous_titre`, LIMITE_SOUS_TITRE_VISUEL) } : {}),
    ...(o.chiffre !== undefined ? { chiffre: chaine(o.chiffre, `${chemin}.chiffre`, LIMITE_CHIFFRE_VISUEL) } : {}),
    ...(o.points !== undefined
      ? {
          points: (() => {
            const pts = tableau(o.points, `${chemin}.points`, 3);
            if (pts.length !== 3) refuser(`${chemin}.points`, "exactement 3 points attendus");
            return pts.map((p, i) => chaine(p, `${chemin}.points[${i}]`, LIMITE_POINT_VISUEL));
          })(),
        }
      : {}),
  };
}

function scene(v: unknown, chemin: string): Record<string, unknown> {
  const o = objet(v, chemin, ["texte_voix", "voix", "visuel", "duree_max"], ["texte_voix", "voix", "visuel"]);
  const visuel = objet(o.visuel, `${chemin}.visuel`, ["gabarit", "champs"], ["gabarit", "champs"]);
  const resultat: Record<string, unknown> = {
    texte_voix: chaine(o.texte_voix, `${chemin}.texte_voix`, LIMITE_TEXTE_VOIX, 1),
    voix: identifiantVideo(o.voix, `${chemin}.voix`),
    visuel: (() => {
      const gabarit = enumeration(visuel.gabarit, `${chemin}.visuel.gabarit`, GABARITS_VIDEO);
      return { gabarit, champs: champsVisuel(visuel.champs, `${chemin}.visuel.champs`, gabarit) };
    })(),
  };
  if (o.duree_max !== undefined) {
    const d = o.duree_max;
    if (typeof d !== "number" || !Number.isFinite(d) || d < DUREE_MAX_SCENE_MIN || d > DUREE_MAX_SCENE_MAX) {
      refuser(`${chemin}.duree_max`, `nombre de ${DUREE_MAX_SCENE_MIN} à ${DUREE_MAX_SCENE_MAX} attendu`);
    }
    resultat.duree_max = d;
  }
  return resultat;
}

/** Valide une demande de vidéo et renvoie une copie nettoyée. Ne modifie pas l'entrée. */
export function validerDemandeVideo(entree: unknown): ResultatValidation {
  try {
    const o = objet(entree, "demande", ["format_sortie", "musique", "sous_titres", "scenes"], ["format_sortie", "sous_titres", "scenes"]);
    if (typeof o.sous_titres !== "boolean") refuser("sous_titres", "booléen attendu");
    const scenes = tableau(o.scenes, "scenes", LIMITE_SCENES);
    if (scenes.length < 1) refuser("scenes", "au moins une scène attendue");
    const demande: Demande = {
      format_sortie: enumeration(o.format_sortie, "format_sortie", FORMATS_SORTIE_VIDEO),
      ...(o.musique !== undefined ? { musique: identifiantVideo(o.musique, "musique") } : {}),
      sous_titres: o.sous_titres,
      scenes: scenes.map((s, i) => scene(s, `scenes[${i}]`)),
    };
    return verifierTaille(demande);
  } catch (e) {
    if (e instanceof ErreurDemande) return { ok: false, erreur: e.message };
    throw e;
  }
}

function verifierTaille(demande: Demande): ResultatValidation {
  if (Buffer.byteLength(JSON.stringify(demande), "utf8") > TAILLE_MAX_DEMANDE_OCTETS) {
    refuser("demande", `taille totale supérieure à ${TAILLE_MAX_DEMANDE_OCTETS / 1024} Kio`);
  }
  return { ok: true, demande };
}

export interface ContexteExecution {
  agentId: string;
  runId: string;
  companyId: string;
}

export interface DependancesFabrique {
  /** Vrai si l'agent existe dans l'entreprise (l'autorisation elle-même porte sur son identifiant, jamais sur son rôle). */
  agentConnu(agentId: string, companyId: string): Promise<boolean>;
  /** Journal d'avertissement (facultatif) : sert à signaler une fois une configuration à l'ancien format. */
  avertir?(message: string): void;
  /** Configuration d'instance de l'entreprise. */
  config(companyId: string): Promise<Record<string, unknown> | null>;
  etatLire(cle: string, companyId: string): Promise<unknown>;
  etatEcrire(cle: string, companyId: string, valeur: unknown): Promise<void>;
  /** Tâche d'origine du run (le contexte de l'outil ne la donne pas) ; absente : le travail n'est pas signalé à la fin. */
  tacheDuRun?(runId: string, companyId: string): Promise<string | null>;
  /** Suivi des travaux à signaler (état d'instance), relevé par la minuterie de fabrique-remise. */
  suiviLire?(): Promise<unknown>;
  suiviEcrire?(valeur: unknown): Promise<void>;
  maintenant?: () => Date;
  nouvelUuid?: () => string;
}

const verrous = new Map<string, Promise<unknown>>();
/** Sérialise les accès au compteur d'une entreprise (lecture, test, écriture) dans ce processus. */
function sousVerrou<T>(cle: string, fn: () => Promise<T>): Promise<T> {
  const suite = (verrous.get(cle) ?? Promise.resolve()).then(fn, fn);
  verrous.set(cle, suite.catch(() => undefined));
  return suite;
}

const erreur = (message: string): ToolResult => ({ error: message });
const succes = (data: Record<string, unknown>): ToolResult => ({ content: JSON.stringify(data), data });

export function dossierFile(config: Record<string, unknown> | null): string {
  const v = config?.fabriqueDossierFile;
  return typeof v === "string" && v.trim() ? v.trim() : DOSSIER_FILE_DEFAUT;
}

/** Identifiants d'agent (UUID) autorisés par la clé de configuration ; défaut vide = tout refusé. */
function agentsAutorises(config: Record<string, unknown> | null, cleConfig: string): string[] {
  const v = config?.[cleConfig];
  return Array.isArray(v) ? v.filter((r): r is string => typeof r === "string" && r.length > 0) : [];
}

/** Écrit `contenu` dans `dossier/nom` de façon atomique : fichier temporaire du même dossier, puis rename. */
export async function ecrireAtomique(dossier: string, nom: string, contenu: string): Promise<void> {
  const octets = Buffer.from(contenu, "utf8");
  if (octets.length > TAILLE_MAX_FICHIER_OCTETS) throw new Error("fichier de file trop gros");
  await mkdir(dossier, { recursive: true, mode: MODE_DOSSIER });
  const temporaire = join(dossier, `.${nom}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaire, octets, { flag: "wx", mode: MODE_FICHIER });
    await chmod(temporaire, MODE_FICHIER);
    await rename(temporaire, join(dossier, nom));
  } catch (e) {
    await unlink(temporaire).catch(() => undefined);
    throw e;
  }
}

export function creerOutilsFabrique(deps: DependancesFabrique) {
  let ancienFormatSignale = false;
  const maintenant = deps.maintenant ?? (() => new Date());
  const nouvelUuid = deps.nouvelUuid ?? randomUUID;

  /** Réserve une place dans le compteur `cle` (remis à zéro chaque jour) ; renvoie le message de refus ou null. */
  async function reserverCompteur(companyId: string, cle: string, plafond: number, refus: string): Promise<string | null> {
    const jour = maintenant().toISOString().slice(0, 10);
    return sousVerrou(companyId, async () => {
      const actuel = (await deps.etatLire(cle, companyId)) as { jour?: unknown; n?: unknown } | null;
      const n = actuel && actuel.jour === jour && typeof actuel.n === "number" ? actuel.n : 0;
      if (n >= plafond) return refus;
      await deps.etatEcrire(cle, companyId, { jour, n: n + 1 });
      return null;
    });
  }

  async function rendreCompteur(companyId: string, cle: string): Promise<void> {
    await sousVerrou(companyId, async () => {
      const actuel = (await deps.etatLire(cle, companyId)) as { jour?: unknown; n?: unknown } | null;
      if (actuel && typeof actuel.n === "number" && actuel.n > 0) await deps.etatEcrire(cle, companyId, { jour: actuel.jour, n: actuel.n - 1 });
    }).catch(() => undefined);
  }

  const reserverQuota = (companyId: string) =>
    reserverCompteur(companyId, CLE_QUOTA, QUOTA_TRAVAUX_PAR_JOUR, `Quota atteint : ${QUOTA_TRAVAUX_PAR_JOUR} travaux par jour et par entreprise. Réessayer demain.`);

  interface TypeTravail {
    type: "document" | "video";
    cleAgents: string;
    refusAgent: string;
    valider: (params: unknown) => ResultatValidation;
    /** Compteur propre au type, en plus du quota total. */
    plafond?: { cle: string; max: number; refus: string };
  }

  async function deposer(t: TypeTravail, params: unknown, run: ContexteExecution): Promise<ToolResult> {
    const config = await deps.config(run.companyId);
    const autorises = agentsAutorises(config, t.cleAgents);
    if (!ancienFormatSignale && config && ("fabriqueRolesDocuments" in config || "fabriqueRolesVideo" in config)) {
      // Anciennes clés (par rôle Paperclip, trop grossier) ignorées : seules fabriqueAgents* comptent.
      ancienFormatSignale = true;
      deps.avertir?.("Fabrique : fabriqueRolesDocuments/fabriqueRolesVideo sont ignorées (remplacées par fabriqueAgentsDocuments/fabriqueAgentsVideo) ; relancer le bootstrap de l'organisation.");
    }
    if (!autorises.includes(run.agentId) || !(await deps.agentConnu(run.agentId, run.companyId))) return erreur(t.refusAgent);
    const v = t.valider(params);
    if (!v.ok) return erreur(`Demande refusée : ${v.erreur}`);
    const travail = nouvelUuid();
    const tache = deps.tacheDuRun ? await deps.tacheDuRun(run.runId, run.companyId).catch(() => null) : null;
    const contenu = JSON.stringify({
      travail,
      entreprise: run.companyId,
      agent: run.agentId,
      run: run.runId,
      ...(tache ? { tache } : {}),
      cree_le: maintenant().toISOString(),
      type: t.type,
      demande: v.demande,
    });
    if (Buffer.byteLength(contenu, "utf8") > TAILLE_MAX_FICHIER_OCTETS) return erreur("Demande refusée : fichier de file trop gros (max 512 Kio).");
    const refus = await reserverQuota(run.companyId);
    if (refus) return erreur(refus);
    if (t.plafond) {
      const refusType = await reserverCompteur(run.companyId, t.plafond.cle, t.plafond.max, t.plafond.refus);
      if (refusType) {
        await rendreCompteur(run.companyId, CLE_QUOTA);
        return erreur(refusType);
      }
    }
    try {
      await ecrireAtomique(join(dossierFile(config), "entrant"), `${travail}.json`, contenu);
    } catch {
      await rendreCompteur(run.companyId, CLE_QUOTA);
      if (t.plafond) await rendreCompteur(run.companyId, t.plafond.cle);
      return erreur("Dépôt impossible : la file de la fabrique n'est pas disponible. Réessayer plus tard.");
    }
    if (deps.suiviLire && deps.suiviEcrire) {
      // Échec du suivi : le travail est déposé, seul le signalement de fin est perdu (avertissement journalisé).
      await sousVerrouSuivi(async () => {
        const nouveau = { entreprise: run.companyId, travail, agent: run.agentId, run: run.runId, tache, cree: maintenant().toISOString(), essais: 0 };
        await deps.suiviEcrire!(ajouterAuSuivi(await deps.suiviLire!(), nouveau));
      }).catch((e) =>
        deps.avertir?.(`Fabrique : suivi du travail ${travail} impossible, sa fin ne sera pas signalée (${e instanceof Error ? e.message : String(e)}).`),
      );
    }
    return succes({ travail, etat: "en_file" });
  }

  const fabriquerDocument = (params: unknown, run: ContexteExecution) =>
    deposer(
      {
        type: "document",
        cleAgents: "fabriqueAgentsDocuments",
        refusAgent: "Refusé : cet agent n'est pas autorisé à fabriquer des documents.",
        valider: validerDemandeDocument,
      },
      params,
      run,
    );

  const fabriquerVideo = (params: unknown, run: ContexteExecution) =>
    deposer(
      {
        type: "video",
        cleAgents: "fabriqueAgentsVideo",
        refusAgent: "Refusé : cet agent n'est pas autorisé à fabriquer des vidéos.",
        valider: validerDemandeVideo,
        plafond: {
          cle: CLE_QUOTA_VIDEO,
          max: QUOTA_VIDEOS_PAR_JOUR,
          refus: `Quota atteint : ${QUOTA_VIDEOS_PAR_JOUR} vidéos par jour et par entreprise. Réessayer demain.`,
        },
      },
      params,
      run,
    );

  /** Agent autorisé à fabriquer (documents ou vidéos) ou agent qui a déposé ce travail. */
  async function agentAdmisSurTravail(config: Record<string, unknown> | null, run: ContexteExecution, travail: string): Promise<boolean> {
    if (agentsAutorises(config, "fabriqueAgentsDocuments").includes(run.agentId) || agentsAutorises(config, "fabriqueAgentsVideo").includes(run.agentId)) return true;
    if (!deps.suiviLire) return false;
    const suivi = await deps.suiviLire().catch(() => null);
    return (
      Array.isArray(suivi) &&
      suivi.some((t: Partial<TravailSuivi>) => t?.travail === travail.toLowerCase() && t.entreprise === run.companyId && t.agent === run.agentId)
    );
  }

  async function etatFabrication(params: unknown, run: ContexteExecution): Promise<ToolResult> {
    let brut: Record<string, unknown>;
    try {
      brut = objet(params, "demande", ["travail"], ["travail"]);
    } catch (e) {
      return erreur(`Demande refusée : ${(e as Error).message}`);
    }
    const travail = brut.travail;
    if (typeof travail !== "string" || !UUID.test(travail)) return erreur("Demande refusée : travail doit être un identifiant UUID.");
    if (!UUID.test(run.companyId)) return erreur("Refusé : entreprise invalide.");
    const config = await deps.config(run.companyId);
    if (!(await agentAdmisSurTravail(config, run, travail))) return erreur("Refusé : cet agent n'est pas autorisé à consulter ce travail.");
    const racine = dossierFile(config);
    const dossier = dossierTravail(racine, run.companyId, travail);
    if (!dossier) return erreur("Demande refusée : identifiant invalide.");
    const lire = async (nom: string): Promise<unknown | null> => {
      try {
        return JSON.parse(await readFile(join(dossier, nom), "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    };
    try {
      const etat = await lire("etat.json");
      if (etat === null) return erreur("Travail introuvable.");
      const resultat = await lire("resultat.json");
      const termine = (etat as { etat?: unknown }).etat === "termine";
      const apercu = termine ? await lireApercu(dossier) : null;
      return succes({ travail: travail.toLowerCase(), etat, ...(resultat !== null ? { resultat } : {}), ...(apercu ? { apercu } : {}) });
    } catch {
      return erreur("Travail introuvable.");
    }
  }

  return { fabriquerDocument, fabriquerVideo, etatFabrication };
}
