/**
 * Règles de la porte de l'Observatoire, OBS-01 à OBS-18 (docs/observatoire/regles-porte.md, section 3 ; OBS-17 et OBS-18 : audit du 29/10/2026).
 *
 * Fonctions pures et déterministes : mêmes entrées, mêmes motifs (aucune sortie de modèle).
 * Conventions de lecture du texte d'une Revision (les contrats ne donnent pas les chapitres à part) :
 * - un chapitre commence par un titre `## <titre>` et peut porter une ligne `État : complet|incomplet|...` ;
 * - une citation d'Affirmation s'écrit `[aff:<id>]` ;
 * - le texte d'une Affirmation `infere` porte son raisonnement après `Raisonnement :`, avec les `[aff:<id>]` de départ ;
 * - les blocs de code ``` et ~~~ sont exclus des contrôles de prose ; le code en ligne `...` aussi, sauf s'il contient une URL ou
 *   un chiffre avec unité de performance (SPEC-E10 : un nom versionné reste exempté).
 */
import type { Affirmation, PreuveObservatoire, StatutVerification } from "../../contrats/observatoire.js";
import type { CodeMotifPorte, MotifPorte } from "../../contrats/porte.js";
import { MOTIFS_MAX_PAR_REGLE } from "../regles-donnees.js";
import { causeExtraitRefuse, raisonExtrait } from "./normaliseur.js";

/**
 * Plafonds par défaut d'OBS-15, quand la décision K4 de la source (politique_collecte.extraitMax, cumulMax) n'en fixe pas.
 * shortcut: valeurs provisoires (500 par extrait, 3 extraits par source et par article) ; à remplacer par celles que l'humain fixe par source.
 */
export const LONGUEUR_MAX_EXTRAIT_DEFAUT = 500;
export const CUMUL_MAX_EXTRAITS_DEFAUT = 3 * LONGUEUR_MAX_EXTRAIT_DEFAUT;
/** Décision de droits K4 d'une source : longueur maximale d'un extrait cité et du cumul de ses extraits dans une révision (null : défaut). */
export type LimitesSource = { extraitMax: number | null; cumulMax: number | null };

export type EntreesPorteObs = {
  revision: {
    id: string;
    langue: "fr" | "en";
    empreinte: string;
    /** `id` = révision française courante ; `texte` et `glossaireProtege` servent à OBS-09 (absents : OBS-09 ne s'applique pas). */
    baseRevisionFr: {
      id: string;
      empreinteActuelle: string;
      empreinteTraduite: string;
      texte?: string;
      glossaireProtege?: string[];
    } | null;
    texte: string;
  };
  affirmations: Affirmation[];
  preuves: PreuveObservatoire[];
  instantanes: Map<string, { texteNormalise: string; sourceId: string }>;
  sources: Set<string>;
  versionsConnues: Set<string>;
  /** Essai attendu : `{ executeParService, termine, succes, version }` (service d'essais K8) ; toute autre forme est refusée. */
  essais: Map<string, unknown>;
  sourcesRefusees: Set<string>;
  /** Sources primaires valables pour toute affirmation (base commune, OBS-14) ; absent = aucune. */
  sourcesPrimaires?: ReadonlySet<string>;
  /** SPEC-E6 : sources primaires de chaque projet, valables pour les seules affirmations de ce projet (OBS-14). */
  sourcesPrimairesParProjet?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Longueur maximale d'un extrait publié (K4) ; défaut `LONGUEUR_MAX_EXTRAIT_DEFAUT`. */
  longueurMaxExtrait?: number;
  /** DROIT-5.1 : plafonds K4 par source (identifiant), prioritaires sur `longueurMaxExtrait` et les défauts. */
  limitesSources?: Map<string, LimitesSource>;
  /** DROIT-5.2 : sources sans auteur enregistré (politique_collecte.auteur) ; une preuve qui s'y appuie est refusée (CDE XI.189). */
  sourcesSansAuteur?: ReadonlySet<string>;
};

function motif(code: CodeMotifPorte, message: string, extra: Partial<Omit<MotifPorte, "code" | "message">> = {}): MotifPorte {
  return { code, message, exigence: null, element: null, role: null, findingId: null, emplacement: null, sourceId: null, ...extra };
}

/* ------------------------------------------------------------------ */
/* Lecture du texte                                                    */
/* ------------------------------------------------------------------ */

type Ligne = { n: number; chapitre: string; texte: string };
type ChapitreLu = { titre: string; etat: string | null; ids: string[] };
type Citation = { id: string; ligne: Ligne };

type Contexte = {
  e: EntreesPorteObs;
  lignes: Ligne[];
  chapitres: ChapitreLu[];
  citations: Citation[];
  parId: Map<string, Affirmation>;
  preuves: PreuveObservatoire[];
};

const RE_CITATION = /\[aff:([^\]\s]+)\]/gu;

function lire(texte: string): { lignes: Ligne[]; chapitres: ChapitreLu[]; citations: Citation[] } {
  const lignes: Ligne[] = [];
  const chapitres: ChapitreLu[] = [];
  const citations: Citation[] = [];
  let courant: ChapitreLu = { titre: "Revision", etat: null, ids: [] };
  let cloture: string | null = null;
  texte.split("\n").forEach((brute, i) => {
    // O8 : même clôture que l'exporteur (``` ou ~~~, refermée par le même caractère, au moins aussi long).
    if (cloture !== null) {
      if (new RegExp(`^\\s*${cloture[0]}{${cloture.length},}\\s*$`, "u").test(brute)) cloture = null;
      return;
    }
    const ouvre = /^\s*(`{3,}|~{3,})(.*)$/u.exec(brute);
    if (ouvre && !(ouvre[1]!.startsWith("`") && ouvre[2]!.includes("`"))) {
      cloture = ouvre[1]!;
      return;
    }
    const titre = /^##\s+(.+?)\s*$/u.exec(brute);
    if (titre) {
      courant = { titre: titre[1] ?? "", etat: null, ids: [] };
      chapitres.push(courant);
      return;
    }
    // O4 : l'état se lit aussi en gras ou en italique (**État** : complet).
    const etat = /^[*_\s]*État[*_]*\s*:[*_\s]*(.+?)[*_\s]*$/iu.exec(brute);
    if (etat) courant.etat = (etat[1] ?? "").toLowerCase();
    const ligne = { n: i + 1, chapitre: courant.titre, texte: brute.replace(/`([^`\n]*)`/gu, (_s, x: string) => (garderCode(x) ? x : "")) };
    lignes.push(ligne);
    for (const m of ligne.texte.matchAll(RE_CITATION)) {
      const id = m[1] ?? "";
      courant.ids.push(id);
      citations.push({ id, ligne });
    }
  });
  return { lignes, chapitres, citations };
}

/** SPEC-E10 : un code en ligne qui contient une URL ou un chiffre avec unité reste lu par OBS-03, 05 et 06. */
const garderCode = (x: string): boolean => new RegExp(RE_URL.source, "iu").test(x) || chiffrePerf(x) !== null;

const emplacement = (l: Ligne): string => `${l.chapitre}, ligne ${l.n}`;
const etiquettePreuve = (p: PreuveObservatoire): string => `${p.instantaneId ?? p.essaiId ?? "?"}#${p.position}`;
const domaine = (id: string): string => {
  try {
    return new URL(id).hostname;
  } catch {
    return id;
  }
};
const sansV = (v: string): string => v.trim().replace(/^v/iu, "");

/** Citations dédoublonnées par identifiant (première occurrence), pour les règles par Affirmation. */
function citeesUniques(c: Contexte): Citation[] {
  const vues = new Set<string>();
  return c.citations.filter((x) => (vues.has(x.id) ? false : (vues.add(x.id), true)));
}

/* ------------------------------------------------------------------ */
/* Règles                                                              */
/* ------------------------------------------------------------------ */

/** Nombre de preuves qui désignent un instantané présent. shortcut: preuves par essai refusées, à rouvrir avec K8 */
const preuvesValables = (c: Contexte, a: Affirmation): number => a.preuves.filter((p) => p.instantaneId !== null && c.e.instantanes.has(p.instantaneId)).length;

/** OBS-01 : toute affirmation citée porte une preuve, `non_verifie` compris (V2-3, décision du 30/10) ; `infere` relève d'OBS-12. */
function obs01(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const { id, ligne } of citeesUniques(c)) {
    const a = c.parId.get(id);
    if (!a || preuvesValables(c, a) > 0 || a.statut === "infere") continue;
    motifs.push(
      motif("obs_affirmation_sans_preuve", `Affirmation ${id} (${a.chapitre}) : aucune preuve liée. Ajoutez une preuve (une affirmation non vérifiée en exige une aussi).`, {
        element: id,
        emplacement: emplacement(ligne),
      }),
    );
  }
  return motifs;
}

/** OBS-02 */
function obs02(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const p of c.preuves) {
    if (p.instantaneId === null) continue;
    const inst = c.e.instantanes.get(p.instantaneId);
    const cause = inst ? causeExtraitRefuse(p.extraitExact, inst.texteNormalise, p.position) : null;
    if (inst && cause === null) continue;
    const raison = cause ? raisonExtrait(cause, p.position) : "l'instantané est inexistant";
    motifs.push(
      motif(
        "obs_extrait_absent_instantane",
        `Preuve ${etiquettePreuve(p)} (instantané ${p.instantaneId}, source ${inst?.sourceId ?? "inconnue"}) : ${raison}.`,
        { element: etiquettePreuve(p), sourceId: inst?.sourceId ?? null },
      ),
    );
  }
  return motifs;
}

// V2-1 : schéma en majuscules (HTTPS://) et adresse sans schéma (//hôte.tld, après un blanc, « ( » ou « < ») comptent aussi.
export const RE_URL = /(?:https?:\/\/|(?<=^|[\s(<])\/\/(?=[a-z0-9-]+\.[a-z]))[^\s)\]>"'`]+/giu;

/** O2 : adresse comparable, sans fragment ni barre oblique finale (schéma et hôte en minuscules) ; texte brut si illisible. */
const urlComparable = (u: string): string => {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href.replace(/\/+$/u, "");
  } catch {
    return u;
  }
};

/** Source enregistrée du même domaine qui partage le plus long début avec `url` ; null s'il n'y en a pas. */
function sourceLaPlusProche(url: string, enregistrees: readonly string[]): string | null {
  const commun = (a: string, b: string): number => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return i;
  };
  const memeDomaine = enregistrees.filter((s) => /^https?:/iu.test(s) && domaine(s) === domaine(url));
  return memeDomaine.sort((a, b) => commun(b, url) - commun(a, url))[0] ?? null;
}

/** OBS-03 */
function obs03(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const p of c.preuves) {
    const inst = p.instantaneId === null ? undefined : c.e.instantanes.get(p.instantaneId);
    if (!inst || c.e.sources.has(inst.sourceId)) continue;
    motifs.push(
      motif("obs_source_non_enregistree", `Preuve ${etiquettePreuve(p)} : la source ${inst.sourceId} n'est pas enregistrée. Lisez-la par la lecture protégée avant de la citer.`, {
        element: etiquettePreuve(p),
        sourceId: inst.sourceId,
      }),
    );
  }
  const enregistrees = [...c.e.sources];
  const comparables = new Set(enregistrees.map(urlComparable));
  const vues = new Set<string>();
  for (const l of c.lignes) {
    for (const m of l.texte.matchAll(RE_URL)) {
      const url = m[0].replace(/[.,;:!?]+$/u, "");
      const cle = urlComparable(url);
      if (comparables.has(cle) || vues.has(cle)) continue;
      vues.add(cle);
      const proche = sourceLaPlusProche(url, enregistrees);
      const indice = proche ? ` Source enregistrée de ce domaine la plus proche : ${proche}.` : "";
      motifs.push(
        motif("obs_source_non_enregistree", `${emplacement(l)} : la source ${url} n'est pas enregistrée. Lisez-la par la lecture protégée avant de la citer.${indice}`, {
          emplacement: emplacement(l),
          sourceId: url,
        }),
      );
    }
  }
  return motifs;
}

type EssaiLu = { executeParService?: unknown; termine?: unknown; succes?: unknown; version?: unknown };

function essaiValide(essai: unknown, a: Affirmation): boolean {
  if (typeof essai !== "object" || essai === null) return false;
  const x = essai as EssaiLu;
  return x.executeParService === true && x.termine === true && x.succes === true && x.version === a.versionConcernee;
}

/** OBS-04 : K8 n'existe pas encore, donc `essais` est vide et tout statut vérifié est refusé (effet voulu). */
function obs04(c: Contexte): MotifPorte[] {
  return c.e.affirmations
    .filter((a) => a.statut === "verifie_experimentalement")
    .filter((a) => !a.preuves.some((p) => p.essaiId !== null && essaiValide(c.e.essais.get(p.essaiId), a)))
    .map((a) =>
      motif("obs_verifie_sans_essai", `Affirmation ${a.id} : « vérifié expérimentalement » sans essai exécuté par notre service sur la version ${a.versionConcernee ?? "non renseignée"}.`, {
        element: a.id,
      }),
    );
}

const RE_VERSION = /\b(?:version|v)\s?(\d+\.\d+(?:\.\d+)*(?:[-+][\w.]+)?)/giu;

/** Version écrite telle quelle dans l'extrait d'une preuve (autre logiciel que l'outil du projet) ; `2.1` ne se lit pas dans `2.1.3`. */
const prouveeParExtrait = (c: Contexte, v: string): boolean => {
  const re = new RegExp(`(?<![\\d.])${sansV(v).replace(/[.+]/gu, "\\$&")}(?!\\d|\\.\\d)`, "u");
  return c.preuves.some((p) => re.test(p.extraitExact));
};

/** OBS-05 */
function obs05(c: Contexte): MotifPorte[] {
  const connues = new Set([...c.e.versionsConnues].map(sansV));
  const motifs: MotifPorte[] = [];
  for (const l of c.lignes) {
    for (const m of l.texte.matchAll(RE_VERSION)) {
      const v = m[1] ?? "";
      if (connues.has(sansV(v)) || prouveeParExtrait(c, v)) continue;
      motifs.push(motif("obs_version_inconnue", `${emplacement(l)} : la version ${v} n'est pas une version connue de l'outil.`, { emplacement: emplacement(l) }));
    }
  }
  for (const a of c.e.affirmations) {
    if (a.versionConcernee === null || connues.has(sansV(a.versionConcernee))) continue;
    motifs.push(motif("obs_version_inconnue", `Affirmation ${a.id} (${a.chapitre}) : la version ${a.versionConcernee} n'est pas une version connue de l'outil.`, { element: a.id }));
  }
  return motifs;
}

// O3 : « 2026 s'ouvre » n'est pas une durée (apostrophe exclue après l'unité) ; un pourcentage seul n'est pas une performance.
const RE_PERF = /(\d+(?:[.,]\d+)?)\s?(?:ms|Mo\/s|Go\/s|req\/s|requêtes par seconde|jetons par seconde|s)(?![\p{L}\d'’])|fois plus rapides?/giu;
const RE_POURCENT = /\d+(?:[.,]\d+)?\s?%/u;
const RE_MOT_PERF = /(?<!\p{L})(?:gains?|plus rapides?|plus lente?s?|accélér|ralenti|latence|débit|vitesse|performances?|temps de|faster|slower|speed|latency|throughput)/iu;
/** Chiffre de performance du texte : unité de mesure, ou pourcentage accompagné d'un mot de performance (ou dans un chapitre de performances) ; null sinon. */
function chiffrePerf(texte: string, chapitrePerf = false): string | null {
  const m = new RegExp(RE_PERF.source, "iu").exec(texte);
  if (m) return m[0];
  return chapitrePerf || RE_MOT_PERF.test(texte) ? (RE_POURCENT.exec(texte)?.[0] ?? null) : null;
}
/** SPEC-O6 : mention d'annonce de l'éditeur exigée sur la ligne qui cite un chiffre `rapporte_editeur`. */
const RE_ANNONCE = /(?<!\p{L})(?:annonc(?:e|es|ent|é|ée|és|ées)|selon|d['’]après|par l['’]éditeur|announce[sd]?|according to)(?!\p{L})/iu;
const STATUTS_SOURCE_PRIMAIRE: ReadonlySet<StatutVerification> = new Set(["verifie_experimentalement", "confirme_doc_officielle", "rapporte_editeur"]);

/** OBS-06 */
function obs06(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const a of c.e.affirmations) {
    const m = chiffrePerf(a.texte);
    if ((a.chapitre !== "ch20" && !m) || STATUTS_SOURCE_PRIMAIRE.has(a.statut)) continue;
    motifs.push(
      motif("obs_performance_sans_essai_ni_source_primaire", `Affirmation ${a.id} (${a.chapitre}) : chiffre de performance « ${m ?? a.texte} » sans essai ni source primaire.`, {
        element: a.id,
      }),
    );
  }
  for (const { id, ligne } of c.citations) {
    const a = c.parId.get(id);
    const m = a?.statut === "rapporte_editeur" ? chiffrePerf(a.texte) : null;
    if (!m || RE_ANNONCE.test(ligne.texte)) continue;
    motifs.push(
      motif("obs_performance_sans_essai_ni_source_primaire", `${emplacement(ligne)} : chiffre « ${m} » rapporté par l'éditeur présenté comme un fait ; écrivez-le comme son annonce (« l'éditeur annonce… »).`, {
        element: id, emplacement: emplacement(ligne),
      }),
    );
  }
  for (const l of c.lignes) {
    for (const phrase of l.texte.split(/(?<=[.!?])\s+/u)) {
      const m = chiffrePerf(phrase, RE_MOT_PERF.test(l.chapitre));
      if (!m || phrase.includes("[aff:")) continue;
      motifs.push(
        motif("obs_performance_sans_essai_ni_source_primaire", `${emplacement(l)} : chiffre de performance « ${m} » sans essai ni source primaire.`, {
          emplacement: emplacement(l),
        }),
      );
    }
  }
  return motifs;
}

/** OBS-07 */
function obs07(c: Contexte): MotifPorte[] {
  return c.chapitres
    .filter((ch) => ch.etat === "complet" && ch.ids.length === 0)
    .map((ch) =>
      motif("obs_chapitre_complet_sans_affirmation", `Chapitre ${ch.titre} : déclaré complet sans aucune affirmation. Rattachez ses faits ou déclarez-le « information manquante ».`, {
        emplacement: ch.titre,
      }),
    );
}

/** OBS-08 */
function obs08(c: Contexte): MotifPorte[] {
  const { langue, baseRevisionFr: base } = c.e.revision;
  if (langue !== "en") return [];
  if (base === null) {
    return [motif("obs_traduction_base_perimee", "Version anglaise : aucune révision française de base n'est indiquée.")];
  }
  if (base.empreinteTraduite === base.empreinteActuelle) return [];
  return [
    motif(
      "obs_traduction_base_perimee",
      `Version anglaise : traduite depuis la révision française d'empreinte ${base.empreinteTraduite.slice(0, 12)}, la révision courante est ${base.id} (empreinte ${base.empreinteActuelle.slice(0, 12)}).`,
    ),
  ];
}

const RE_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/gu;
const segmentsCode = (texte: string): string[] => [...texte.matchAll(RE_CODE)].map((m) => m[0]);

/** OBS-09 */
function obs09(c: Contexte): MotifPorte[] {
  const { langue, baseRevisionFr: base, texte } = c.e.revision;
  if (langue !== "en" || base?.texte === undefined) return [];
  const motifs: MotifPorte[] = [];
  const fr = segmentsCode(base.texte);
  const en = segmentsCode(texte);
  const longueur = Math.max(fr.length, en.length);
  for (let i = 0; i < longueur; i++) {
    if (fr[i] === en[i]) continue;
    motifs.push(
      motif(
        "obs_code_modifie_traduction",
        `Version anglaise, bloc n° ${i + 1} : le bloc de code n° ${i + 1} diffère de la version française. Les commandes et identifiants ne se traduisent pas.`,
        { emplacement: `bloc n° ${i + 1}` },
      ),
    );
    break; // un seul motif : après un décalage, les blocs suivants diffèrent tous
  }
  for (const terme of base.glossaireProtege ?? []) {
    if (!base.texte.includes(terme) || texte.includes(terme)) continue;
    motifs.push(
      motif("obs_code_modifie_traduction", `Version anglaise, glossaire : l'identifiant « ${terme} » diffère de la version française. Les commandes et identifiants ne se traduisent pas.`, {
        element: terme,
      }),
    );
  }
  return motifs;
}

/** OBS-10 */
function obs10(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const { id, ligne } of citeesUniques(c)) {
    const a = c.parId.get(id);
    if (!a || (a.remplaceePar === null && a.statut !== "obsolete")) continue;
    const suite = a.remplaceePar === null ? "est obsolète et n'a pas de remplaçante" : `a été remplacée par ${a.remplaceePar}`;
    motifs.push(motif("obs_citation_affirmation_remplacee", `${emplacement(ligne)} : l'affirmation ${id} ${suite}. Citez la nouvelle.`, { element: id, emplacement: emplacement(ligne) }));
  }
  return motifs;
}

/** OBS-11 */
function obs11(c: Contexte): MotifPorte[] {
  return c.e.affirmations
    .filter((a) => a.statut === "contredit" && preuvesValables(c, a) === 0)
    .map((a) => motif("obs_contredit_sans_preuve_contraire", `Affirmation ${a.id} : « contredit » sans preuve contraire liée.`, { element: a.id }));
}

const STATUTS_PROUVES: ReadonlySet<StatutVerification> = new Set(["verifie_experimentalement", "confirme_doc_officielle", "rapporte_editeur", "rapporte_tiers"]);

/** OBS-12 : raisonnement = texte après `Raisonnement :` ; il doit citer (`[aff:<id>]`) au moins une affirmation prouvée. */
function obs12(c: Contexte): MotifPorte[] {
  return c.e.affirmations
    .filter((a) => a.statut === "infere")
    .filter((a) => {
      const raisonnement = /Raisonnement\s*:\s*([\s\S]+)/iu.exec(a.texte)?.[1]?.trim() ?? "";
      if (raisonnement === "") return true;
      const departs = [...raisonnement.matchAll(RE_CITATION)].map((m) => c.parId.get(m[1] ?? ""));
      return !departs.some((d) => d !== undefined && preuvesValables(c, d) > 0 && STATUTS_PROUVES.has(d.statut));
    })
    .map((a) => motif("obs_infere_sans_raisonnement", `Affirmation ${a.id} : inférence sans raisonnement ni affirmation de départ.`, { element: a.id }));
}

/** OBS-13 */
function obs13(c: Contexte): MotifPorte[] {
  return c.e.affirmations
    .filter((a) => !Number.isInteger(a.confiance.niveau) || a.confiance.niveau < 0 || a.confiance.niveau > 3 || a.confiance.motif.trim() === "")
    .map((a) => motif("obs_confiance_sans_motif", `Affirmation ${a.id} : confiance sans motif (ou hors de 0 à 3).`, { element: a.id }));
}

/** OBS-14 */
function obs14(c: Contexte): MotifPorte[] {
  const communes = c.e.sourcesPrimaires ?? new Set<string>();
  const motifs: MotifPorte[] = [];
  for (const a of c.e.affirmations) {
    if (a.statut !== "confirme_doc_officielle") continue;
    const duProjet = c.e.sourcesPrimairesParProjet?.get(a.projetId);
    const primaires = { has: (s: string) => communes.has(s) || Boolean(duProjet?.has(s)) };
    const sources = a.preuves.flatMap((p) => (p.instantaneId === null ? [] : [c.e.instantanes.get(p.instantaneId)?.sourceId])).filter((s): s is string => s !== undefined);
    if (sources.some((s) => primaires.has(s))) continue;
    const origine = sources.length === 0 ? "aucune source" : sources.map(domaine).join(", ");
    motifs.push(
      motif(
        "obs_doc_officielle_non_primaire",
        `Affirmation ${a.id} : « confirmé par la documentation officielle » mais la preuve vient de ${origine}, qui n'est pas une source de l'éditeur.`,
        { element: a.id },
      ),
    );
  }
  return motifs;
}

/**
 * OBS-15 : une source est autorisée sauf si elle figure dans `sourcesRefusees` (une décision absente se traduit par l'entrée dans cet ensemble).
 * Chaque extrait respecte le plafond K4 de sa source, et le cumul des extraits d'une même source dans la révision son plafond de cumul.
 * DROIT-5.2 : la source d'une preuve a un auteur enregistré.
 */
function obs15(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  const cumuls = new Map<string, number>();
  for (const p of c.preuves) {
    const inst = p.instantaneId === null ? undefined : c.e.instantanes.get(p.instantaneId);
    if (!inst) continue;
    const max = c.e.limitesSources?.get(inst.sourceId)?.extraitMax ?? c.e.longueurMaxExtrait ?? LONGUEUR_MAX_EXTRAIT_DEFAUT;
    cumuls.set(inst.sourceId, (cumuls.get(inst.sourceId) ?? 0) + p.extraitExact.length);
    const sansAuteur = c.e.sourcesSansAuteur?.has(inst.sourceId) === true;
    if (!c.e.sourcesRefusees.has(inst.sourceId) && p.extraitExact.length <= max && !sansAuteur) continue;
    // O6 : chaque cause présente est nommée, la longueur dépassée avec son plafond.
    const raison = [
      c.e.sourcesRefusees.has(inst.sourceId) ? "n'est pas autorisée à la collecte (aucune décision de droits)" : null,
      p.extraitExact.length > max ? `a un extrait de ${p.extraitExact.length} caractères, au-delà des ${max} permis` : null,
      sansAuteur ? "n'a aucun auteur enregistré : une citation publiée nomme son auteur et sa source (CDE, art. XI.189), à faire fixer par l'humain (obs.base.importer, champ auteur)" : null,
    ].filter((x) => x !== null).join(" ; ");
    motifs.push(
      motif("obs_source_collecte_refusee", `Preuve ${etiquettePreuve(p)} : la source ${domaine(inst.sourceId)} ${raison}.`, {
        element: etiquettePreuve(p),
        sourceId: inst.sourceId,
      }),
    );
  }
  for (const [sourceId, total] of cumuls) {
    const max = c.e.limitesSources?.get(sourceId)?.cumulMax ?? CUMUL_MAX_EXTRAITS_DEFAUT;
    if (total <= max) continue;
    motifs.push(motif("obs_source_collecte_refusee", `Source ${domaine(sourceId)} : ${total} caractères d'extraits cités dans cette révision, au-delà des ${max} permis (cumul trop long).`, { element: sourceId, sourceId }));
  }
  return motifs;
}

/** OBS-16 */
function obs16(c: Contexte): MotifPorte[] {
  return citeesUniques(c)
    .filter((x) => !c.parId.has(x.id))
    .map((x) =>
      motif("obs_affirmation_inconnue", `${emplacement(x.ligne)} : renvoi à l'affirmation ${x.id}, qui n'existe pas.`, { element: x.id, emplacement: emplacement(x.ligne) }),
    );
}

// Nombre, date ou heure : `27`, `2026`, `04:50`, `2.1.311` ; « , » décimale et « h » d'heure ramenées à « . » et « : ».
const RE_NOMBRE = /\d+(?:[.,:h]\d+)*/gu;
const nombres = (texte: string): string[] =>
  [...texte.replace(RE_CITATION, " ").replace(RE_URL, " ").matchAll(RE_NOMBRE)].map((m) => m[0].replace(/,/gu, ".").replace(/h/gu, ":"));

/** OBS-17 (LIV-OB-3) : tout nombre, date ou heure d'une phrase qui cite figure dans le texte d'une affirmation qu'elle cite. */
function obs17(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const l of c.lignes) {
    for (const phrase of l.texte.split(/(?<=[.!?])\s+/u)) {
      const citees = [...phrase.matchAll(RE_CITATION)].map((m) => c.parId.get(m[1] ?? "")).filter((a): a is Affirmation => a !== undefined);
      if (citees.length === 0) continue;
      const permis = new Set(citees.flatMap((a) => nombres(a.texte)));
      for (const n of new Set(nombres(phrase).filter((x) => !permis.has(x)))) {
        motifs.push(motif("obs_nombre_absent_affirmation", `${emplacement(l)} : « ${n} » ne figure dans le texte d'aucune affirmation citée par la phrase.`, { emplacement: emplacement(l), element: n }));
      }
    }
  }
  return motifs;
}

/** OBS-18 (LIV-OB-4) : chaque numéro de version (ou nombre décimal) du texte d'une affirmation figure dans l'un de ses extraits. */
function obs18(c: Contexte): MotifPorte[] {
  const motifs: MotifPorte[] = [];
  for (const a of c.e.affirmations) {
    for (const v of new Set([...a.texte.matchAll(/\d+\.\d+(?:\.\d+)*/gu)].map((m) => m[0]))) {
      const re = new RegExp(`(?<![\\d.])${v.replace(/\./gu, "\\.")}(?!\\d|\\.\\d)`, "u");
      if (a.preuves.some((p) => re.test(p.extraitExact))) continue;
      motifs.push(motif("obs_version_hors_extrait", `Affirmation ${a.id} (${a.chapitre}) : « ${v} » ne figure dans aucun de ses extraits ; étendre l'extrait ou scinder l'affirmation.`, { element: a.id }));
    }
  }
  return motifs;
}

const REGLES: ReadonlyArray<(c: Contexte) => MotifPorte[]> = [obs01, obs02, obs03, obs04, obs05, obs06, obs07, obs08, obs09, obs10, obs11, obs12, obs13, obs14, obs15, obs16, obs17, obs18];

/** Évalue les 18 règles sur la Revision soumise à la porte ; liste vide = rien à reprocher. */
export function reglesObservatoire(e: EntreesPorteObs): MotifPorte[] {
  const lu = lire(e.revision.texte);
  const contexte: Contexte = {
    e,
    ...lu,
    parId: new Map(e.affirmations.map((a) => [a.id, a])),
    preuves: [...new Set([...e.preuves, ...e.affirmations.flatMap((a) => a.preuves)])],
  };
  return REGLES.flatMap((regle) => regle(contexte).slice(0, MOTIFS_MAX_PAR_REGLE));
}
