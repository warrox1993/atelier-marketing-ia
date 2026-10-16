/**
 * Garde des données simulées (lot L9, `docs/connecteurs-conception.md` §6.5).
 *
 * Fonctions PURES et déterministes, jamais alimentées par la seule sortie d'un modèle :
 *
 * 1. `deduireModeReponse` : le mode d'une réponse d'outil de connexion est DÉDUIT de la
 *    réponse elle-même (enveloppe `_atelier` posée par la passerelle, mention en tête,
 *    identifiants fictifs connus), jamais déclaré par l'agent. Au moindre indice de
 *    démonstration, la donnée est de démonstration (prudence) ; sans enveloppe, refus.
 * 2. `extraireChiffres` : valeurs numériques de la réponse, plus les sommes et moyennes de
 *    chaque colonne d'un tableau (un agent additionne volontiers les lignes).
 * 3. `verifierDonneesDemo` : règle de la porte, stricte et sans mode de démonstration : toute donnée
 *    simulée rattachée à la tâche est interdite, citée ou non, mention ou non.
 * 4. `verifierDiffusionDonneesDemo` : une diffusion est refusée dans les mêmes cas.
 */
import type { KeyObject } from "node:crypto";
import { EMPREINTES_PROSPECTION_DEMONSTRATION, MENTION_DONNEES_DEMONSTRATION, type MotifPorte } from "../contrats/index.js";
import { DERIVE_HORLOGE_S, chargeEcriture, empreinteArgumentsAppel, jsonCanonique, verifierEnveloppe } from "./signatures.js";

export type ModeDonnee = "demonstration" | "reel";

/* ------------------------------------------------------------------ */
/* 1. Déduction du mode                                                */
/* ------------------------------------------------------------------ */

/**
 * Identifiants fictifs que seule la passerelle de démonstration produit
 * (`passerelle/src/services.ts`, fiches des services, et modèle L3). Leur présence suffit à
 * classer une réponse en démonstration, même si son enveloppe dit « reel ».
 */
export const EMPREINTES_DEMONSTRATION: readonly string[] = [
  "renovation-liege.example",
  "000-000-0001",
  "customers/0000000001",
  "accounts/9000000000",
  "properties/100000001",
  "@renovation.liege.demo",
  "urn:li:organization:900000001",
  "page/100000000000001",
  "ig/17840000000000001",
  "portail/demo-0001",
  "(démonstration)",
  // Lot P9a : marqueurs des simulateurs de prospection (bce, bnb, fsma), sans doublon.
  ...EMPREINTES_PROSPECTION_DEMONSTRATION.filter((m) => m !== "(démonstration)"),
];

export interface ReponseOutil {
  texte?: string;
  structuredContent?: Record<string, unknown>;
}

export type ResultatDeduction =
  | { ok: true; mode: ModeDonnee; indices: string[]; structures: Record<string, unknown>[]; compte: string | null }
  | { ok: false; raison: string };

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON contenu dans le texte d'une réponse (après la mention éventuelle). */
export function jsonDuTexte(texte: string): Record<string, unknown> | null {
  const debut = texte.indexOf("{");
  if (debut < 0) return null;
  try {
    const v: unknown = JSON.parse(texte.slice(debut));
    return estObjet(v) ? v : null;
  } catch {
    return null;
  }
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();

/** Âge maximal d'une réponse signée acceptée comme réelle (proposition de la revue : 7 jours, à confirmer par l'opérateur). */
export const AGE_MAX_REPONSE_S = 7 * 24 * 3600;

/**
 * Vérification de la signature `_atelier` de la passerelle (revue de sécurité §6 bis, constat M2).
 * Sans clé publique configurée, aucune réponse n'est tenue pour réelle.
 */
export interface VerificationSignature {
  clesPubliques: readonly KeyObject[];
  /** Service et outil DÉCLARÉS par le dépôt : ils doivent égaler ceux qui sont signés. */
  service: string;
  outil: string;
  /**
   * Arguments de l'appel déclarés par le dépôt : leur empreinte doit égaler celle qui est signée.
   * v1.6 (S-6) : OBLIGATOIRES pour une réponse réelle (sinon refus).
   */
  arguments?: Record<string, unknown>;
  /** v1.6 (S-6) : compte déclaré par le dépôt (facultatif) : fourni, il doit égaler le compte signé. */
  compte?: string;
  maintenant: Date;
  ageMaxS?: number;
}

/** Contrôle d'une structure signée : le compte signé si elle est valide pour ce dépôt, sinon le motif. */
function controlerSignature(structure: Record<string, unknown>, v: VerificationSignature): { compte: string | null } | string {
  const verdict = verifierEnveloppe(structure, v.clesPubliques);
  if (!verdict.ok) return verdict.motif;
  const c = verdict.charge;
  if (c.service !== v.service || c.outil !== v.outil) return `réponse signée pour ${c.service} · ${c.outil}, déposée comme ${v.service} · ${v.outil}`;
  if (c.erreur !== false) return "réponse d'erreur de l'outil : aucune donnée à retenir";
  // S-3 : la passerelle signe la nature de l'outil ; une réponse d'outil d'écriture (préparée ou exécutée)
  // recopie les arguments de l'agent : ce n'est jamais une mesure. Charge sans ce champ : écriture (prudence).
  if (chargeEcriture(c)) return "réponse d'un outil d'écriture (ou charge sans nature d'outil) : ce n'est pas une donnée de mesure";
  const maintenantS = Math.floor(v.maintenant.getTime() / 1000);
  if (c.emis > maintenantS + DERIVE_HORLOGE_S) return "réponse signée dans le futur";
  if (maintenantS - c.emis > (v.ageMaxS ?? AGE_MAX_REPONSE_S)) return "réponse trop ancienne (rejeu d'une ancienne réponse) : refaire l'appel";
  // S-6 : une réponse réelle est toujours liée à SON appel (période, propriété) et à son compte.
  if (v.arguments === undefined) return "arguments de l'appel non déclarés : une réponse réelle doit être déposée avec les arguments exacts de son appel (période, propriété)";
  let attendu: string;
  try {
    attendu = empreinteArgumentsAppel(v.arguments);
  } catch {
    return "arguments déclarés non représentables";
  }
  if (c.arguments !== attendu) return "arguments déclarés différents de ceux de l'appel signé (rejeu d'une autre réponse)";
  if (typeof c.compte !== "string" || c.compte.trim() === "") return "réponse signée sans compte : impossible de la rattacher à une propriété";
  if (v.compte !== undefined && v.compte !== c.compte) return `compte déclaré (${v.compte}) différent du compte signé (${c.compte})`;
  return { compte: c.compte };
}

/** Clés qui ne trahissent qu'une réponse d'outil d'écriture (« préparée », exécutée) : jamais une mesure (S-3). */
const MARQUES_ECRITURE = ["cle_idempotence", "executee"];
const ETATS_ECRITURE = new Set(["preparee", "executee", "ambigue_a_reconcilier"]);

/** La réponse est-elle celle d'un outil d'écriture (préparée ou exécutée) ? */
export function reponseEcriture(structures: readonly Record<string, unknown>[]): boolean {
  return structures.some((s) => MARQUES_ECRITURE.some((k) => Object.hasOwn(s, k)) || (typeof s.etat === "string" && ETATS_ECRITURE.has(s.etat) && Object.hasOwn(s, "action")));
}

export function deduireModeReponse(reponse: ReponseOutil, verification?: VerificationSignature): ResultatDeduction {
  const structures: Record<string, unknown>[] = [];
  if (reponse.structuredContent) structures.push(reponse.structuredContent);
  const duTexte = reponse.texte ? jsonDuTexte(reponse.texte) : null;
  // Le texte reprend en général les mêmes données que `structuredContent` : on ne les compte qu'une fois.
  // Comparaison par JSON canonique (insensible à l'ordre des clés, revue des signatures S-2).
  const canon = (v: unknown) => {
    try {
      return jsonCanonique(v);
    } catch {
      return null;
    }
  };
  if (duTexte && !(reponse.structuredContent && canon(duTexte) !== null && canon(duTexte) === canon(reponse.structuredContent))) structures.push(duTexte);

  const enveloppes = structures.map((s) => s._atelier).filter((a) => a !== undefined);
  if (enveloppes.length === 0) {
    return {
      ok: false,
      raison:
        "Provenance inconnue : la réponse ne porte pas l'enveloppe « _atelier » de la passerelle. Déposer la réponse brute de l'outil (texte reçu ou données structurées), sans la modifier.",
    };
  }
  const indices: string[] = [];
  for (const a of enveloppes) {
    if (!estObjet(a) || (a.mode !== "demonstration" && a.mode !== "reel")) {
      return { ok: false, raison: "Enveloppe « _atelier » invalide : mode attendu « demonstration » ou « reel »." };
    }
    if (a.mode === "demonstration") indices.push("_atelier.mode = demonstration");
    if (typeof a.mention === "string" && a.mention.trim()) indices.push("_atelier.mention présente");
  }
  const modes = new Set(enveloppes.map((a) => (a as { mode: string }).mode));
  if (modes.size > 1) indices.push("enveloppes « _atelier » en désaccord (prudence : démonstration)");

  // §6 bis : une réponse qui se dit réelle doit porter une signature valide de la passerelle, liée à
  // ce dépôt (service, outil, arguments, date). Sans clé configurée : jamais réel.
  let compte: string | null = null;
  if (modes.has("reel")) {
    const refus = (probleme: string): ResultatDeduction => ({
      ok: false,
      raison: `Réponse non signée par la passerelle (ou modifiée) : ${probleme}. Déposer la réponse brute de l'outil, sans la modifier.`,
    });
    // S-2 : TOUT contenu porteur de chiffres doit être couvert par une signature vérifiée. Une structure
    // sans enveloppe ne profite jamais de la signature d'une autre ; le texte hors du JSON signé
    // (mention en tête, ajout en fin) ne porte aucun chiffre.
    if (structures.some((x) => x._atelier === undefined)) return refus("une partie de la réponse ne porte pas d'enveloppe « _atelier » signée");
    if (reponse.texte !== undefined) {
      const debut = reponse.texte.indexOf("{");
      const horsJson = debut < 0 ? reponse.texte : reponse.texte.slice(0, debut);
      if (debut < 0 || duTexte === null) return refus("le texte de la réponse ne contient pas la structure signée");
      if (/\p{N}/u.test(horsJson)) return refus("le texte de la réponse porte des chiffres hors de la structure signée");
    }
    const v: VerificationSignature = verification ?? { clesPubliques: [], service: "", outil: "", maintenant: new Date() };
    for (const s of structures) {
      const r = controlerSignature(s, v);
      if (typeof r === "string") return refus(r);
      if (compte !== null && r.compte !== compte) return refus("structures signées pour des comptes différents");
      compte = r.compte;
    }
  }

  const texte = reponse.texte ?? "";
  if (texte.trimStart().startsWith(MENTION_DONNEES_DEMONSTRATION)) indices.push("texte commençant par la mention de démonstration");
  else if (texte.includes(MENTION_DONNEES_DEMONSTRATION)) indices.push("mention de démonstration dans le texte");

  const serialise = sansAccents(`${texte}\n${structures.map((s) => JSON.stringify(s)).join("\n")}`);
  for (const empreinte of EMPREINTES_DEMONSTRATION) {
    if (serialise.includes(sansAccents(empreinte))) indices.push(`identifiant fictif de démonstration : ${empreinte}`);
  }
  const mode: ModeDonnee = indices.length > 0 ? "demonstration" : "reel";
  if (mode === "reel") indices.push("_atelier.mode = reel, signature de la passerelle vérifiée, aucun indice de démonstration");
  return { ok: true, mode, indices: [...new Set(indices)], structures, compte: mode === "reel" ? compte : null };
}

/* ------------------------------------------------------------------ */
/* 2. Chiffres d'une réponse                                           */
/* ------------------------------------------------------------------ */

export interface Chiffre {
  valeur: number;
  /** Chemin dans la réponse (`rows[].clicks`, `somme(rows[].clicks)`…). */
  chemin: string;
}

/** Clés techniques dont les nombres ne sont pas des chiffres marketing. */
const CLES_IGNOREES = /^(?:_atelier|id|.*Id|.*_id|resourceName|name|customerId|siteUrl|property|parent|location|pageToken|nextPageToken|pageSize|startRow|rowLimit|limit|offset|rowCount|totalResultsCount|keys|dimensionValues|dimensionHeaders|metricHeaders|fieldMask|kind|version|date|startDate|endDate|createTime|updateTime|year|month|day)$/u;
const NOMBRE_TEXTE = /^-?\d+(?:\.\d+)?$/u;

function nombre(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && NOMBRE_TEXTE.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Valeurs numériques d'une réponse, hors identifiants et dates. Les montants en micros
 * (`costMicros`, et `averageCpc` qui l'est aussi chez Google Ads) sont aussi retenus en unités. Pour chaque colonne
 * d'un tableau (même chemin, indices effacés), la somme et la moyenne sont ajoutées.
 */
export function extraireChiffres(structures: readonly unknown[], max = 2000): Chiffre[] {
  const parChemin = new Map<string, number[]>();
  const ajouter = (chemin: string, valeur: number) => {
    const liste = parChemin.get(chemin) ?? [];
    liste.push(valeur);
    parChemin.set(chemin, liste);
  };
  const parcourir = (v: unknown, chemin: string, cle: string) => {
    if (CLES_IGNOREES.test(cle)) return;
    if (Array.isArray(v)) {
      for (const x of v) parcourir(x, `${chemin}[]`, cle);
      return;
    }
    if (estObjet(v)) {
      for (const [k, x] of Object.entries(v)) parcourir(x, chemin ? `${chemin}.${k}` : k, k);
      return;
    }
    const n = nombre(v);
    if (n === null) return;
    ajouter(chemin, n);
    if (/micros$/iu.test(cle) || cle === "averageCpc") ajouter(`${chemin}÷1e6`, n / 1e6);
  };
  for (const s of structures) parcourir(s, "", "");

  const chiffres: Chiffre[] = [];
  const vus = new Set<string>();
  const pousser = (valeur: number, chemin: string) => {
    const cle = `${valeur}`;
    if (vus.has(cle) || chiffres.length >= max) return;
    vus.add(cle);
    chiffres.push({ valeur, chemin });
  };
  for (const [chemin, valeurs] of parChemin) for (const v of valeurs) pousser(v, chemin);
  for (const [chemin, valeurs] of parChemin) {
    if (valeurs.length < 2 || !chemin.includes("[]")) continue;
    const somme = valeurs.reduce((a, b) => a + b, 0);
    pousser(somme, `somme(${chemin})`);
    pousser(somme / valeurs.length, `moyenne(${chemin})`);
  }
  return chiffres;
}

/* ------------------------------------------------------------------ */
/* 3. Lecture du livrable                                              */
/* ------------------------------------------------------------------ */

export interface BlocLivrable {
  /** Première ligne du bloc (1 = première ligne du livrable). */
  ligne: number;
  texte: string;
  /** Titres de section actifs (du plus haut au plus proche). */
  titres: string[];
}

/** Blocs du livrable : lignes non vides contiguës (paragraphe, liste ou tableau), titres exclus. */
export function blocsDuLivrable(corps: string): BlocLivrable[] {
  const blocs: BlocLivrable[] = [];
  const pile: Array<{ niveau: number; texte: string }> = [];
  let courant: BlocLivrable | null = null;
  corps.split(/\r?\n/u).forEach((brute, i) => {
    const titre = /^(#{1,6})\s+(.*)$/u.exec(brute.trim());
    if (titre) {
      courant = null;
      const niveau = titre[1]!.length;
      while (pile.length > 0 && pile[pile.length - 1]!.niveau >= niveau) pile.pop();
      pile.push({ niveau, texte: titre[2]!.trim() });
      return;
    }
    if (!brute.trim()) {
      courant = null;
      return;
    }
    if (!courant) {
      courant = { ligne: i + 1, texte: brute, titres: pile.map((t) => t.texte) };
      blocs.push(courant);
    } else {
      courant.texte += `\n${brute}`;
    }
  });
  return blocs;
}

/** Le bloc porte la mention « démonstration », lui-même ou par un titre de section qui le couvre. */
export function blocEtiquete(bloc: BlocLivrable): boolean {
  return [bloc.texte, ...bloc.titres].some((t) => sansAccents(t).includes("demonstration"));
}

export function emplacementDe(bloc: BlocLivrable): string {
  const section = bloc.titres[bloc.titres.length - 1];
  return section ? `section « ${section} », ligne ${bloc.ligne}` : `ligne ${bloc.ligne}`;
}

interface Jeton {
  brut: string;
  candidats: Array<{ valeur: number; decimales: number }>;
  pourcent: boolean;
}

/** Nombres écrits dans un texte (formats français et anglais), avec leurs lectures possibles. */
export function nombresDuTexte(texte: string): Jeton[] {
  const motif = /(?<![\p{L}\p{N}_/:.,-])(\d{1,3}(?:[   ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_/-]|[.,]\d)(\s?%)?/gu;
  const jetons: Jeton[] = [];
  for (const m of texte.matchAll(motif)) {
    const brut = m[1]!;
    const candidats: Jeton["candidats"] = [];
    if (/[   ]/u.test(brut)) {
      const [entier, decimal] = brut.replace(/[   ]/gu, "").split(",");
      candidats.push({ valeur: Number(`${entier}.${decimal ?? "0"}`), decimales: decimal?.length ?? 0 });
    } else {
      const sep = /[.,]/u.exec(brut);
      if (!sep) candidats.push({ valeur: Number(brut), decimales: 0 });
      else {
        const [a, b] = brut.split(/[.,]/u) as [string, string];
        candidats.push({ valeur: Number(`${a}.${b}`), decimales: b.length });
        // « 1.234 » ou « 1,234 » : séparateur de milliers possible.
        if (b.length === 3) candidats.push({ valeur: Number(`${a}${b}`), decimales: 0 });
      }
    }
    jetons.push({ brut: `${brut}${m[2] ?? ""}`, candidats: candidats.filter((c) => Number.isFinite(c.valeur)), pourcent: Boolean(m[2]) });
  }
  return jetons;
}

const arrondir = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const egal = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Le jeton du livrable reproduit-il un chiffre de la donnée (à l'arrondi affiché près) ? */
export function jetonCorrespond(jeton: Jeton, chiffre: number): boolean {
  const f = Math.abs(chiffre);
  for (const c of jeton.candidats) {
    // Un entier de moins de deux chiffres est trop commun pour être attribué à une donnée.
    if (c.decimales === 0 && c.valeur < 10) continue;
    if (jeton.pourcent && egal(arrondir(f * 100, c.decimales), c.valeur)) return true;
    if (c.decimales === 0 && !Number.isInteger(f)) continue;
    if (egal(arrondir(f, c.decimales), c.valeur)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 4. Règle de la porte                                                */
/* ------------------------------------------------------------------ */

export interface SourcePourGarde {
  id: string;
  mode: ModeDonnee;
  provenance: string;
  url: string;
  /** Service et outil d'une source de connexion. */
  service: string | null;
  outil: string | null;
  chiffres: Chiffre[];
}

export interface PreuvePourGarde {
  revisionId: string;
  emplacement: string;
  extrait: string;
  sourceIds: string[];
}

/** Mode effectif d'une campagne et sa raison, affichée telle quelle à l'humain. */
export interface ModeEffectif {
  mode: ModeDonnee;
  raison: string;
}

/**
 * Règle prudente du lot L9 : RÉEL si la campagne est réelle OU si l'entreprise est réglée en
 * mode réel, y compris sans réglages enregistrés puisque le défaut est « réel » depuis le lot G1 (une campagne déclarée en « démonstration » dans une entreprise réelle
 * n'accueille pas de données simulées et ne simule pas sa diffusion) ; sinon démonstration.
 */
export function calculerModeEffectif(
  campagne: { mode: ModeDonnee } | null | undefined,
  reglages: { existe: boolean; modeParDefaut: ModeDonnee },
): ModeEffectif {
  if (campagne?.mode === "reel") return { mode: "reel", raison: "campagne en mode réel" };
  if (reglages.modeParDefaut === "reel") {
    return { mode: "reel", raison: campagne ? "entreprise en mode réel (la campagne est déclarée en démonstration)" : "entreprise en mode réel" };
  }
  return { mode: "demonstration", raison: campagne ? "campagne et entreprise en démonstration" : "entreprise en démonstration" };
}

export interface EntreesDonneesDemo {
  /** Mode effectif : réel si la campagne OU l'entreprise est en mode réel. */
  modeEffectif: ModeDonnee;
  /** Pourquoi ce mode (campagne, entreprise). */
  raisonMode: string;
  livrable: { revisionId: string; corps: string } | null;
  /** Sources rattachées à la tâche (toutes provenances). */
  sources: SourcePourGarde[];
  /** Preuves de couverture de la révision courante (avec leurs sources citées). */
  preuves: PreuvePourGarde[];
}

/** Nombre maximal de motifs par règle (le livrable entier pourrait sinon en produire des centaines). */
export const MOTIFS_MAX_PAR_REGLE = 20;

function motifDemo(code: "donnee_demo_sans_mention" | "donnee_demo_campagne_reelle", message: string, extra: { emplacement?: string | null; sourceId?: string | null; element?: string | null }): MotifPorte {
  return { code, message, exigence: null, role: null, findingId: null, element: extra.element ?? null, emplacement: extra.emplacement ?? null, sourceId: extra.sourceId ?? null };
}

const libelleSource = (s: SourcePourGarde) => (s.service && s.outil ? `${s.service} · ${s.outil}` : s.url);

/** Pour chaque bloc, la première citation d'une source de la liste (chiffre reproduit, identifiant ou adresse). */
function citations(blocs: BlocLivrable[], sources: SourcePourGarde[]) {
  const trouvees: Array<{ bloc: BlocLivrable; source: SourcePourGarde; element: string; nature: "chiffre" | "source" }> = [];
  for (const bloc of blocs) {
    const jetons = nombresDuTexte(bloc.texte);
    let trouve: (typeof trouvees)[number] | null = null;
    for (const s of sources) {
      if (bloc.texte.includes(s.id) || bloc.texte.includes(s.url)) {
        trouve = { bloc, source: s, element: s.url, nature: "source" };
        break;
      }
      const jeton = jetons.find((j) => s.chiffres.some((c) => jetonCorrespond(j, c.valeur)));
      if (jeton) {
        trouve = { bloc, source: s, element: jeton.brut, nature: "chiffre" };
        break;
      }
    }
    if (trouve) trouvees.push(trouve);
  }
  return trouvees;
}

export function verifierDonneesDemo(e: EntreesDonneesDemo): MotifPorte[] {
  // Garde stricte, sans mode de démonstration : toute donnée simulée (ou non signée par la passerelle,
  // donc classée simulée à la déduction) rattachée à la tâche est interdite, citée ou non, étiquetée ou non.
  const simulees = e.sources.filter((s) => s.mode === "demonstration");
  if (simulees.length === 0) return [];
  const blocs = e.livrable ? blocsDuLivrable(e.livrable.corps) : [];
  const motifs: MotifPorte[] = [];
  for (const s of simulees.slice(0, MOTIFS_MAX_PAR_REGLE)) {
    motifs.push(
      motifDemo("donnee_demo_campagne_reelle", `Donnée simulée (${libelleSource(s)}) rattachée à la tâche (${e.raisonMode}) : interdite.`, {
        sourceId: s.id,
        emplacement: "sources de la tâche",
      }),
    );
  }
  for (const c of citations(blocs, simulees).slice(0, MOTIFS_MAX_PAR_REGLE)) {
    motifs.push(
      motifDemo("donnee_demo_campagne_reelle", `Le livrable reprend une donnée simulée (${c.nature === "chiffre" ? `chiffre « ${c.element} »` : `source ${c.element}`}, ${libelleSource(c.source)}).`, {
        sourceId: c.source.id,
        emplacement: emplacementDe(c.bloc),
        element: c.element,
      }),
    );
  }
  return motifs;
}

/* ------------------------------------------------------------------ */
/* 5. Diffusion réelle                                                 */
/* ------------------------------------------------------------------ */

/**
 * Une diffusion RÉELLE (mode réel) est refusée si la tâche porte une donnée de démonstration
 * ou si le livrable diffusé en reprend une. Contrôle fait avant tout autre, pour que le motif
 * affiché soit celui-là.
 */
export function verifierDiffusionDonneesDemo(e: { modeDiffusion: ModeDonnee; livrable: { revisionId: string; corps: string } | null; sources: SourcePourGarde[] }): { ok: true } | { ok: false; motif: string } {
  const motifs = verifierDonneesDemo({ modeEffectif: "reel", raisonMode: "diffusion réelle", livrable: e.livrable, sources: e.sources, preuves: [] });
  if (motifs.length === 0) return { ok: true };
  return { ok: false, motif: `Données simulées interdites dans une diffusion : ${motifs[0]!.message}` };
}
