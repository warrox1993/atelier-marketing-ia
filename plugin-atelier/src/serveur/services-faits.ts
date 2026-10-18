/**
 * Garde-fous de VÉRITÉ : ce que les agents écrivent doit rester d'accord avec la fiche du client et avec ses
 * connaissances.
 *
 * Deux couches :
 * (a) fonctions PURES (détection des identifiants légaux incohérents, des marques niées, des sources niées à
 *     tort), réutilisées par la porte (`porte.ts`) pour le texte des livrables ;
 * (b) `routesFaits` : les routes `tache.plan.controler` (contrôle du plan natif d'une tâche) et
 *     `connaissances.titres` (titres des documents en vigueur, sans contenu).
 *
 * Cas d'origine : le Coordinateur a écrit « Numéro FSMA 0455.961.267 » (c'est le numéro BCE de l'entité), « la
 * marque X n'apparaît nulle part » (elle est déclarée dans la fiche) et « connaissances vides » (la recherche
 * trouve des passages). Les identifiants et les noms ne viennent QUE de la fiche du client (`marque.lire`).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { type CleRouteApi } from "../contrats/index.js";
import type { GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur } from "./erreurs.js";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CodeErreurFait = "identifiant_legal_incoherent" | "marque_declaree_niee" | "source_niee_a_tort";

export interface ErreurFait {
  code: CodeErreurFait;
  /** Phrase (ou fragment) fautif, tronqué. */
  extrait: string;
  explication: string;
}

export interface IdentifiantFiche {
  type: "bce" | "fsma" | "tva" | "autre";
  valeur: string;
  /** Nom de l'entité qui le porte (pour l'explication). */
  entite: string;
}

export interface NomFiche {
  nom: string;
  type: "entite_juridique" | "marque";
}

/** Ce que les contrôles lisent dans la fiche du client. */
export interface FaitsFiche {
  identifiants: IdentifiantFiche[];
  noms: NomFiche[];
}

export const FAITS_VIDES: FaitsFiche = { identifiants: [], noms: [] };

/** Extrait des faits d'une marque (forme de `marque.lire`) ; tolère une marque absente ou incomplète. */
export function faitsDeLaFiche(marque: unknown): FaitsFiche {
  const entites = (marque as { entites?: unknown } | null | undefined)?.entites;
  if (!Array.isArray(entites)) return FAITS_VIDES;
  const faits: FaitsFiche = { identifiants: [], noms: [] };
  for (const e of entites as Array<Record<string, unknown>>) {
    const nom = typeof e.nom === "string" ? e.nom : "";
    if (nom) faits.noms.push({ nom, type: e.type === "marque" ? "marque" : "entite_juridique" });
    if (Array.isArray(e.identifiants)) {
      for (const i of e.identifiants as Array<Record<string, unknown>>) {
        if (typeof i.valeur === "string" && (i.type === "bce" || i.type === "fsma" || i.type === "tva" || i.type === "autre")) {
          faits.identifiants.push({ type: i.type, valeur: i.valeur, entite: nom });
        }
      }
    }
  }
  return faits;
}

/* ------------------------------------------------------------------ */
/* Outils de texte                                                     */
/* ------------------------------------------------------------------ */

/** Minuscules, sans accents, apostrophes droites, espaces simples (même longueur de lecture que l'original n'est PAS garantie). */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[’‘`]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Plafond de longueur d'une ligne recollée : au-delà, on ne recolle plus. */
const LONGUEUR_LIGNE_RECOLLEE_MAX = 2000;
const FIN_LIGNE_A_RECOLLER = /(?<![\p{L}\p{N}])(?:FSMA|BCE|TVA)\s?:\s*$/iu;

/** Phrases : coupées après . ! ? suivis d'une espace, ou sur un saut de ligne ; un point entre chiffres ne coupe pas. */
export function phrases(texte: string): string[] {
  // Une ligne qui se termine par « FSMA : », « BCE : » ou « TVA : » est recollée à la suivante.
  // On ne teste que la ligne qui vient d'être lue (jamais la ligne déjà recollée : temps quadratique),
  // et une ligne recollée ne dépasse pas LONGUEUR_LIGNE_RECOLLEE_MAX caractères.
  const lignes: string[] = [];
  let recolle = false;
  for (const l of texte.split(/\n+/u)) {
    if (recolle && lignes.length > 0 && lignes[lignes.length - 1]!.length < LONGUEUR_LIGNE_RECOLLEE_MAX) lignes[lignes.length - 1] += ` ${l}`;
    else lignes.push(l);
    recolle = FIN_LIGNE_A_RECOLLER.test(l);
  }
  return lignes
    .flatMap((l) => l.split(/(?<=[.!?])\s+/u))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function tronquer(texte: string, max = 200): string {
  const t = texte.replace(/\s+/gu, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/* ------------------------------------------------------------------ */
/* 1. Identifiants légaux                                              */
/* ------------------------------------------------------------------ */

/** Distance maximale (caractères) entre le mot-clé et le numéro, dans la même phrase. */
export const DISTANCE_MAX_IDENTIFIANT = 60 as const;

/**
 * Numéros candidats : BCE de 10 chiffres écrits avec points, espaces ou tirets (0123.456.789), ou collés (avec ou sans « BE »), numéro FSMA de 5 ou 6
 * chiffres, code FSMA lettres-tiret-chiffres (DEMO-0001). Jamais collé à d'autres chiffres ou points.
 */
const CANDIDAT = /(?<![\d.])(?:(?:BE\s?)?\d{4}[ .\-]?\d{3}[ .\-]?\d{3}|[A-Z]{2,8}-\d{2,8}|\d{5,6})(?![\d]|\.\d)/gu;
const MOT_CLE = /(?<![\p{L}\p{N}])(FSMA|BCE|KBO|TVA)(?![\p{L}\p{N}])/giu;
/** Repères internes de l'atelier (exigences, objectifs, sources, segments, offres) : jamais des identifiants légaux. */
const REPERE_INTERNE = /^(?:REQ|OBJ|SRC|SEG|OFF|CAM|T)-\d+$/u;
/**
 * Phrase qui SIGNALE un écart vu sur une source (« la page affiche X comme numéro FSMA, c'est-à-dire le numéro
 * BCE ») : elle n'affirme pas l'identifiant, elle le dénonce. Il faut à la fois l'attribution à une source et un
 * marqueur de correction ; une affirmation simple (« Numéro FSMA X ») reste contrôlée.
 */
const ATTRIBUTION_SOURCE = /\b(?:affich(?:e|ent|er|ait|aient)|indiqu(?:e|ent|er)|mentionn(?:e|ent|er)|port(?:e|ent)|cit(?:e|ent))\b/iu;
const MARQUEUR_CORRECTION = /c[’']est-à-dire|au lieu d|alors que|erreur|écart|ecart|incorrect|erroné|errone|à corriger|confusion|confond/iu;

function cle(valeur: string): string {
  return valeur.toUpperCase().replace(/[^A-Z0-9]/gu, "").replace(/^BE(?=\d{10}$)/u, "");
}

/**
 * Un numéro cité à côté du mot « FSMA » ou « BCE » (même phrase, 60 caractères au plus) doit être un identifiant
 * de CE type dans la fiche. Le mot-clé le plus proche du numéro décide. Un numéro sans mot-clé n'est pas contrôlé.
 */
export function controlerIdentifiantsLegaux(texte: string, faits: FaitsFiche): ErreurFait[] {
  const erreurs: ErreurFait[] = [];
  const vus = new Set<string>();
  for (const phrase of phrases(texte)) {
    const motsCles = [...phrase.matchAll(MOT_CLE)].map((m) => ({ mot: m[1]!.toUpperCase() === "FSMA" ? ("fsma" as const) : ("bce" as const), debut: m.index!, fin: m.index! + m[0].length }));
    if (motsCles.length === 0) continue;
    const signaleUnEcart = ATTRIBUTION_SOURCE.test(phrase) && MARQUEUR_CORRECTION.test(phrase);
    for (const c of phrase.matchAll(CANDIDAT)) {
      const debut = c.index!;
      const fin = debut + c[0].length;
      // Distance au mot-clé : écart entre les deux intervalles.
      const proches = motsCles
        .map((k) => ({ k, ecart: k.fin <= debut ? debut - k.fin : fin <= k.debut ? k.debut - fin : 0 }))
        .filter((x) => x.ecart <= DISTANCE_MAX_IDENTIFIANT)
        .sort((a, b) => a.ecart - b.ecart);
      const choisi = proches[0]?.k;
      if (!choisi) continue;
      const numero = c[0];
      if (REPERE_INTERNE.test(numero)) continue;
      const valide = faits.identifiants.some((i) => cle(i.valeur) === cle(numero) && (choisi.mot === "fsma" ? i.type === "fsma" : i.type === "bce" || i.type === "tva"));
      if (valide) continue;
      // Une phrase qui dénonce l'erreur d'une source n'est tolérée que si elle donne AUSSI le bon identifiant de la fiche
      // pour ce mot-clé, écrit d'un seul tenant : on le cherche parmi les candidats de la phrase (hors numéro dénoncé),
      // jamais dans le texte aplati, où il pourrait être reconstitué à partir de morceaux.
      if (signaleUnEcart) {
        const autres = [...phrase.matchAll(CANDIDAT)].filter((x) => x.index !== debut).map((x) => cle(x[0]));
        const bon = faits.identifiants.some((i) => (choisi.mot === "fsma" ? i.type === "fsma" : i.type === "bce" || i.type === "tva") && cle(i.valeur) !== "" && autres.includes(cle(i.valeur)));
        if (bon) continue;
      }
      const marque = `${choisi.mot}|${cle(numero)}|${phrase}`;
      if (vus.has(marque)) continue;
      vus.add(marque);
      const ailleurs = faits.identifiants.find((i) => cle(i.valeur) === cle(numero));
      const motAffiche = choisi.mot.toUpperCase();
      const explication = ailleurs
        ? `${numero} est ${ailleurs.type === "autre" ? "un autre identifiant" : `le numéro ${ailleurs.type.toUpperCase()}`} de « ${ailleurs.entite} » dans la fiche du client, pas son ${motAffiche}. N'écrire que les identifiants de la fiche, avec leur vrai type.`
        : `${numero} n'est pas un ${motAffiche} de la fiche du client. N'écrire que les identifiants de la fiche (lecture : marque.lire) ou signaler l'information manquante.`;
      erreurs.push({ code: "identifiant_legal_incoherent", extrait: tronquer(phrase), explication });
    }
  }
  return erreurs;
}

/* ------------------------------------------------------------------ */
/* 2. Marque déclarée mais niée                                        */
/* ------------------------------------------------------------------ */

const NEGATION_EXISTENCE = /n'apparai(?:t|ssent)|n'exist(?:e|ent)|aucune trace|inconnu(?:e|s|es)?\b/u;

/** Noms à reconnaître : le nom complet et, s'il y en a un, le nom sans la parenthèse finale. */
function variantesNom(nom: string): string[] {
  const complet = normaliser(nom);
  const sansParenthese = normaliser(nom.replace(/\s*\([^)]*\)\s*$/u, ""));
  return [...new Set([complet, sansParenthese])].filter((v) => v.length >= 3);
}

function contientMot(phraseNormalisee: string, nom: string): boolean {
  const echappe = nom.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![a-z0-9])${echappe}(?![a-z0-9])`, "u").test(phraseNormalisee);
}

/** Le nom d'une entité ou d'une marque de la fiche apparaît dans une phrase qui nie son existence. */
export function controlerMarquesNiees(texte: string, faits: FaitsFiche): ErreurFait[] {
  const erreurs: ErreurFait[] = [];
  for (const phrase of phrases(texte)) {
    const n = normaliser(phrase);
    if (!NEGATION_EXISTENCE.test(n)) continue;
    for (const f of faits.noms) {
      if (!variantesNom(f.nom).some((v) => contientMot(n, v))) continue;
      const genre = f.type === "marque" ? "La marque" : "L'entité";
      erreurs.push({
        code: "marque_declaree_niee",
        extrait: tronquer(phrase),
        explication: `${genre} « ${f.nom} » est déclarée dans la fiche du client (marque.lire) : elle existe. Ne pas écrire qu'elle n'apparaît, n'existe pas ou est inconnue ; si une source manque, le dire sans nier la fiche.`,
      });
    }
  }
  return erreurs;
}

/* ------------------------------------------------------------------ */
/* 3. Source niée à tort                                               */
/* ------------------------------------------------------------------ */

const SOURCE_NIEE = /connaissances? (?:est |sont )?vides?|aucune source|aucun document/u;

/** Phrases qui affirment l'absence de connaissances, de source ou de document. */
export function phrasesSourceNiee(texte: string): string[] {
  return phrases(texte).filter((p) => SOURCE_NIEE.test(normaliser(p)));
}

const MOTS_NEUTRES_PLAN = new Set("plan mission objectif tache demande projet etape etapes".split(" "));

/** Texte d'objectif d'un plan : la section « Objectif » ou la ligne « Objectif : … ». Vide s'il n'y en a pas. */
export function objectifDuPlan(corps: string): string {
  const lignes = corps.split(/\r?\n/u);
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i]!;
    const titre = /^#{1,6}\s*(.*)$/u.exec(l);
    if (titre && normaliser(titre[1]!).startsWith("objectif")) {
      const suite: string[] = [];
      for (let j = i + 1; j < lignes.length && !/^#{1,6}\s/u.test(lignes[j]!); j++) suite.push(lignes[j]!);
      return suite.join(" ").trim();
    }
    const inline = /^\s*(?:[-*]\s*)?(?:\*\*)?objectifs?\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/iu.exec(l);
    if (inline) return inline[1]!.trim();
  }
  return "";
}

/** Les 3 à 5 termes les plus fréquents (ordre d'apparition à égalité), sans mots vides ni mots neutres de plan. */
export function termesFrequents(texte: string, mots: ReadonlySet<string>, maximum = 5): string[] {
  const compte = new Map<string, { n: number; rang: number }>();
  let rang = 0;
  for (const m of normaliser(texte).split(/[^\p{L}\p{N}]+/u)) {
    if (m.length < 4 || mots.has(m) || MOTS_NEUTRES_PLAN.has(m) || /^\d+$/u.test(m)) continue;
    const c = compte.get(m);
    if (c) c.n += 1;
    else compte.set(m, { n: 1, rang: rang++ });
  }
  return [...compte.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].rang - b[1].rang)
    .slice(0, maximum)
    .map(([m]) => m);
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export interface TitreConnaissance {
  documentId: string;
  titre: string;
  type: string;
  produit: string | null;
  statut: string;
  valideAu: string | null;
  /** Base d'origine, présente quand la base commune du groupe (Direction du client) est consultée. */
  portee?: "service" | "commune";
}

export interface DependancesFaits {
  ctx: PluginContext;
  base: BaseAtelier;
  tache(companyId: string, issueId: string): Promise<{ id: string }>;
  /** Mode (démonstration ou réel) de la tâche, pour borner la recherche comme la route de recherche. */
  modeDeTache(companyId: string, issueId: string): Promise<"demonstration" | "reel">;
  /** Recherche tolérante SANS trace (aucune source de tâche créée, aucune évaluation périmée). */
  rechercherTitres(companyId: string, mode: "demonstration" | "reel", question: string): Promise<string[]>;
  /** Documents en vigueur, sans contenu. */
  titresEnVigueur(companyId: string): Promise<TitreConnaissance[]>;
  /** Mots vides français (ceux de la recherche). */
  motsVides: ReadonlySet<string>;
}

/** Clé du document natif qui porte le plan de la tâche. */
export const CLE_DOCUMENT_PLAN = "plan" as const;

export function routesFaits(d: DependancesFaits): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["tache.plan.controler"] = async (r) => {
    const issue = await d.tache(r.companyId, r.params.issueId ?? "");
    const doc = await d.ctx.issues.documents.get(issue.id, CLE_DOCUMENT_PLAN, r.companyId);
    if (!doc || !doc.latestRevisionId) erreur("introuvable", "Cette tâche n'a pas de document « plan ».");
    const corps = String(doc.body ?? "");
    const titre = String(doc.title ?? "");
    const versions = await d.base.marques(r.companyId);
    const faits = faitsDeLaFiche(versions[0] ?? null);

    const erreurs: ErreurFait[] = [...controlerIdentifiantsLegaux(corps, faits), ...controlerMarquesNiees(corps, faits)];

    const niees = phrasesSourceNiee(corps);
    if (niees.length > 0) {
      const objectif = objectifDuPlan(corps);
      let termes = termesFrequents(`${titre} ${objectif}`, d.motsVides);
      if (termes.length === 0) termes = termesFrequents(corps, d.motsVides, 3);
      if (termes.length > 0) {
        const mode = await d.modeDeTache(r.companyId, issue.id);
        const trouves = await d.rechercherTitres(r.companyId, mode, termes.join(" "));
        if (trouves.length > 0) {
          erreurs.push({
            code: "source_niee_a_tort",
            extrait: tronquer(niees[0]!),
            explication: `Le plan affirme qu'il n'y a ni source ni document, mais la recherche (${termes.join(", ")}) trouve des passages dans : ${trouves.map((t) => `« ${t} »`).join(", ")}. Lancer la recherche de connaissances et citer ces documents.`,
          });
        }
      }
    }

    await d.base.journaliser({
      companyId: r.companyId, type: "plan.controle", entite: "tache", entiteId: issue.id, issueId: issue.id, runId: r.acteur.runId, acteur: r.acteur.id,
      donnees: { ok: erreurs.length === 0, erreurs: erreurs.length },
    });
    return { corps: { ok: erreurs.length === 0, erreurs } };
  };

  routes["connaissances.titres"] = async (r) => {
    const titres = await d.titresEnVigueur(r.companyId);
    return { corps: { companyId: r.companyId, total: titres.length, documents: titres } };
  };

  return routes;
}
