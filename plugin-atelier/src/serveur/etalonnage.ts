/**
 * Étalonnage statistique du score des prospects (lot P6, conception §5.3).
 *
 * Fonctions pures, sans dépendance : elles transforment un score 0..100 en probabilité observée
 * seulement quand les données le permettent, et disent toujours sur combien d'exemples et à quelle
 * date. Rien ici ne parle de « certitude » ni de « taux exact ».
 *
 * Méthodes, alignées sur scikit-learn 1.9 (référence figée : `tests/donnees/etalonnage-reference.json`) :
 * - Platt : `sklearn.calibration._SigmoidCalibration`, celle de `CalibratedClassifierCV(method="sigmoid")`.
 *   Même objectif : log-vraisemblance avec les cibles lissées de Platt (positifs (N₊+1)/(N₊+2),
 *   négatifs 1/(N₋+2)), point de départ (0, ln((N₋+1)/(N₊+1))), mise à l'échelle des scores par
 *   max |score| quand il atteint 30. scikit-learn minimise par L-BFGS (gtol 1e-6) ; ici, Newton à
 *   hessienne exacte jusqu'à la précision machine. Les deux optimums diffèrent de moins de 3e-8 sur
 *   le jeu de référence. Convention : p = 1 / (1 + exp(a · score + b)).
 *   Choix des cibles lissées plutôt que du maximum de vraisemblance brut : c'est ce que fait la
 *   bibliothèque de référence, et le lissage évite des paramètres infinis sur un segment séparable.
 * - Isotonique : `IsotonicRegression(out_of_bounds="clip")` : moyenne des issues par score identique,
 *   algorithme PAV pondéré, interpolation linéaire entre les scores vus, bornée aux extrêmes.
 *   Seulement à partir de `SEUILS_ETALONNAGE.isotoniqueEffectifMin` exemples d'ajustement.
 * - Intervalle de Wilson à 95 % (formule de `statsmodels` `proportion_confint(method="wilson")`).
 * - Score de Brier : moyenne des (p − issue)², comme `sklearn.metrics.brier_score_loss`.
 *
 * Séparation : les paramètres sont ajustés sur les issues ANTÉRIEURES à une date de coupure ; le
 * diagramme de fiabilité, le Brier et les intervalles sont mesurés sur les issues postérieures.
 */
import {
  Etalonnage,
  type EtalonnageApplique,
  type DateJour,
  type SegmentEtalonnage,
  SEUILS_ETALONNAGE,
  type TrancheEtalonnage,
} from "../contrats/prospection.js";
import type { ModeExecution } from "../contrats/communs.js";

/** Quantile 0,975 de la loi normale (scipy `norm.isf(0.025)`), pour le niveau de confiance fixé à 95 %. */
const Z_95 = 1.959963984540054;

/** Une issue observée : score attribué au moment du contact, conversion ou non dans l'horizon, date du contact. */
export interface ObservationEtalonnage {
  readonly score: number;
  readonly converti: boolean;
  readonly date: DateJour;
}

export interface ParametresPlatt {
  readonly a: number;
  readonly b: number;
}

/** Modèle isotonique : scores distincts vus à l'ajustement et probabilité ajustée pour chacun. */
export interface ModeleIsotonique {
  readonly seuils: readonly number[];
  readonly valeurs: readonly number[];
}

export interface IntervalleWilson {
  readonly borneBasse: number;
  readonly borneHaute: number;
}

function verifierLongueurs(scores: readonly number[], issues: readonly boolean[]): void {
  if (scores.length === 0) throw new Error("Étalonnage impossible : aucune observation");
  if (scores.length !== issues.length) throw new Error("Étalonnage impossible : autant de scores que d'issues attendus");
  for (const s of scores) {
    if (!Number.isFinite(s)) throw new Error("Étalonnage impossible : score non fini");
  }
}

/** Intervalle de Wilson à 95 % pour `conversions` réussites sur `effectif` essais. */
export function intervalleWilson(conversions: number, effectif: number): IntervalleWilson {
  if (!Number.isInteger(effectif) || effectif <= 0) throw new Error("Intervalle de Wilson : effectif entier positif attendu");
  if (!Number.isInteger(conversions) || conversions < 0 || conversions > effectif) {
    throw new Error("Intervalle de Wilson : conversions entre 0 et l'effectif attendues");
  }
  const n = effectif;
  const p = conversions / n;
  const z2 = Z_95 * Z_95;
  const denominateur = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominateur;
  const demiLargeur = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominateur;
  const borner = (v: number): number => Math.min(1, Math.max(0, v));
  return { borneBasse: borner(centre - demiLargeur), borneHaute: borner(centre + demiLargeur) };
}

/** ln(1 + e^z) sans débordement. */
function log1pExp(z: number): number {
  return z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
}

/** p = 1 / (1 + e^z) sans débordement. */
function sigmoideInverse(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return e / (1 + e);
  }
  return 1 / (1 + Math.exp(z));
}

/** Probabilité Platt pour un score : 1 / (1 + exp(a · score + b)). */
export function probabilitePlatt(parametres: ParametresPlatt, score: number): number {
  return sigmoideInverse(parametres.a * score + parametres.b);
}

/** Ajuste les deux paramètres de Platt (voir l'en-tête : même objectif que scikit-learn). */
export function ajusterPlatt(scores: readonly number[], issues: readonly boolean[]): ParametresPlatt {
  verifierLongueurs(scores, issues);
  const maxAbs = scores.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
  const echelle = maxAbs >= 30 ? maxAbs : 1;
  const f = scores.map((s) => s / echelle);
  const n1 = issues.filter(Boolean).length;
  const n0 = issues.length - n1;
  const cibles = issues.map((y) => (y ? (n1 + 1) / (n1 + 2) : 1 / (n0 + 2)));

  const objectif = (a: number, b: number): number => {
    let total = 0;
    for (let i = 0; i < f.length; i++) {
      const z = a * f[i]! + b;
      total += log1pExp(z) - (1 - cibles[i]!) * z;
    }
    return total;
  };

  let a = 0;
  let b = Math.log((n0 + 1) / (n1 + 1));
  let valeur = objectif(a, b);
  for (let iteration = 0; iteration < 200; iteration++) {
    let gA = 0;
    let gB = 0;
    let hAA = 1e-12;
    let hAB = 0;
    let hBB = 1e-12;
    for (let i = 0; i < f.length; i++) {
      const p = sigmoideInverse(a * f[i]! + b);
      const r = cibles[i]! - p;
      const h = p * (1 - p);
      gA += f[i]! * r;
      gB += r;
      hAA += f[i]! * f[i]! * h;
      hAB += f[i]! * h;
      hBB += h;
    }
    if (Math.max(Math.abs(gA), Math.abs(gB)) < 1e-11) break;
    const det = hAA * hBB - hAB * hAB;
    const dA = -(hBB * gA - hAB * gB) / det;
    const dB = -(-hAB * gA + hAA * gB) / det;
    const pente = gA * dA + gB * dB;
    let pas = 1;
    let accepte = false;
    while (pas >= 1e-12) {
      const candidatA = a + pas * dA;
      const candidatB = b + pas * dB;
      const candidat = objectif(candidatA, candidatB);
      if (candidat <= valeur + 1e-4 * pas * pente) {
        a = candidatA;
        b = candidatB;
        valeur = candidat;
        accepte = true;
        break;
      }
      pas /= 2;
    }
    if (!accepte || Math.max(Math.abs(pas * dA), Math.abs(pas * dB)) < 1e-15) break;
  }
  return { a: a / echelle, b };
}

/** Régression isotonique croissante (PAV pondéré), comme `IsotonicRegression` de scikit-learn. */
export function ajusterIsotonique(scores: readonly number[], issues: readonly boolean[]): ModeleIsotonique {
  verifierLongueurs(scores, issues);
  const ordre = scores.map((_, i) => i).sort((i, j) => scores[i]! - scores[j]!);
  const x: number[] = [];
  const somme: number[] = [];
  const poids: number[] = [];
  for (const i of ordre) {
    const s = scores[i]!;
    const y = issues[i] ? 1 : 0;
    if (x.length > 0 && x[x.length - 1] === s) {
      somme[somme.length - 1]! += y;
      poids[poids.length - 1]! += 1;
    } else {
      x.push(s);
      somme.push(y);
      poids.push(1);
    }
  }
  // Pile de blocs : moyenne pondérée, poids et nombre de scores distincts couverts.
  const blocs: { somme: number; poids: number; largeur: number }[] = [];
  for (let k = 0; k < x.length; k++) {
    blocs.push({ somme: somme[k]!, poids: poids[k]!, largeur: 1 });
    while (blocs.length > 1) {
      const dernier = blocs[blocs.length - 1]!;
      const precedent = blocs[blocs.length - 2]!;
      if (precedent.somme / precedent.poids <= dernier.somme / dernier.poids) break;
      blocs.pop();
      precedent.somme += dernier.somme;
      precedent.poids += dernier.poids;
      precedent.largeur += dernier.largeur;
    }
  }
  const valeurs: number[] = [];
  for (const bloc of blocs) {
    for (let k = 0; k < bloc.largeur; k++) valeurs.push(bloc.somme / bloc.poids);
  }
  return { seuils: x, valeurs };
}

/** Probabilité isotonique : interpolation linéaire, bornée aux scores extrêmes vus (`out_of_bounds="clip"`). */
export function probabiliteIsotonique(modele: ModeleIsotonique, score: number): number {
  const { seuils, valeurs } = modele;
  const n = seuils.length;
  if (n === 0) throw new Error("Modèle isotonique vide");
  if (score <= seuils[0]!) return valeurs[0]!;
  if (score >= seuils[n - 1]!) return valeurs[n - 1]!;
  let bas = 0;
  let haut = n - 1;
  while (haut - bas > 1) {
    const milieu = (bas + haut) >> 1;
    if (seuils[milieu]! <= score) bas = milieu;
    else haut = milieu;
  }
  const x0 = seuils[bas]!;
  const x1 = seuils[haut]!;
  if (score === x0) return valeurs[bas]!;
  return valeurs[bas]! + ((score - x0) * (valeurs[haut]! - valeurs[bas]!)) / (x1 - x0);
}

/** Score de Brier : moyenne des carrés des écarts entre probabilité annoncée et issue (0 = parfait). */
export function scoreBrier(probabilites: readonly number[], issues: readonly boolean[]): number {
  if (probabilites.length === 0 || probabilites.length !== issues.length) {
    throw new Error("Score de Brier : autant de probabilités que d'issues attendues (au moins une)");
  }
  let total = 0;
  for (let i = 0; i < probabilites.length; i++) {
    const e = probabilites[i]! - (issues[i] ? 1 : 0);
    total += e * e;
  }
  return total / probabilites.length;
}

/** Bornes des tranches du diagramme de fiabilité : 0-9, 10-19, …, 80-89, 90-100. */
export const TRANCHES_SCORE: readonly (readonly [number, number])[] = Array.from({ length: 10 }, (_, i) => [
  i * 10,
  i === 9 ? 100 : i * 10 + 9,
]);

/** Diagramme de fiabilité : par tranche de score non vide, taux observé, probabilité moyenne annoncée et intervalle de Wilson. */
export function tranchesFiabilite(
  scores: readonly number[],
  issues: readonly boolean[],
  probabilites: readonly number[],
): TrancheEtalonnage[] {
  verifierLongueurs(scores, issues);
  if (probabilites.length !== scores.length) throw new Error("Diagramme de fiabilité : une probabilité par score attendue");
  const tranches: TrancheEtalonnage[] = [];
  for (const [scoreMin, scoreMax] of TRANCHES_SCORE) {
    let effectif = 0;
    let conversions = 0;
    let sommeP = 0;
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!;
      if (s < scoreMin || s > scoreMax) continue;
      effectif += 1;
      if (issues[i]) conversions += 1;
      sommeP += probabilites[i]!;
    }
    if (effectif === 0) continue;
    const { borneBasse, borneHaute } = intervalleWilson(conversions, effectif);
    tranches.push({
      scoreMin,
      scoreMax,
      effectif,
      conversions,
      tauxObserve: conversions / effectif,
      probabilitePredite: sommeP / effectif,
      borneBasse,
      borneHaute,
    });
  }
  return tranches;
}

/** Découpage dans le temps : ajustement sur les issues antérieures à la coupure, évaluation sur les autres. */
export function separerDansLeTemps<T extends { readonly date: DateJour }>(
  observations: readonly T[],
  coupure: DateJour,
): { ajustement: T[]; evaluation: T[] } {
  return {
    ajustement: observations.filter((o) => o.date < coupure),
    evaluation: observations.filter((o) => o.date >= coupure),
  };
}

/** Seuils du §5.3 : au moins 300 prospects observés ET 30 conversions dans le segment. */
export function seuilsEtalonnageAtteints(effectif: number, conversions: number): boolean {
  return effectif >= SEUILS_ETALONNAGE.prospectsMin && conversions >= SEUILS_ETALONNAGE.conversionsMin;
}

export interface EntreeEtalonnage {
  readonly id: string;
  readonly companyId: string;
  readonly segment: SegmentEtalonnage;
  readonly observations: readonly ObservationEtalonnage[];
  /** Date de coupure : ajustement avant, mesure à partir de cette date. */
  readonly coupure: DateJour;
  /** `auto` : isotonique dès 1 000 exemples d'ajustement, Platt sinon. */
  readonly methode?: "platt" | "isotonique" | "auto";
  readonly horizonJours?: number;
  readonly versionPoids: number;
  readonly origines: readonly ("crm" | "usine" | "import")[];
  readonly calculeLe: string;
  readonly calculePar: string;
  readonly mode: ModeExecution;
}

/** Résultat complet : l'étalonnage au format du contrat, plus le modèle isotonique éventuel (non stocké par le contrat). */
export interface ResultatEtalonnage {
  readonly etalonnage: Etalonnage;
  readonly isotonique: ModeleIsotonique | null;
}

/**
 * Étalonne un segment. `statut` vaut `probabilite_mesuree` seulement si le segment (ajustement et
 * évaluation réunis) compte au moins 300 prospects et 30 conversions ; sinon « estimation ».
 */
export function etalonner(entree: EntreeEtalonnage): ResultatEtalonnage {
  const { ajustement, evaluation } = separerDansLeTemps(entree.observations, entree.coupure);
  if (ajustement.length === 0 || evaluation.length === 0) {
    throw new Error("Étalonnage impossible : la coupure doit laisser des issues avant (ajustement) et après (mesure)");
  }
  const conversionsAjustement = ajustement.filter((o) => o.converti).length;
  if (conversionsAjustement === 0 || conversionsAjustement === ajustement.length) {
    throw new Error("Étalonnage impossible : l'ajustement exige des conversions et des non-conversions");
  }
  const demande = entree.methode ?? "auto";
  const methode =
    demande === "auto" ? (ajustement.length >= SEUILS_ETALONNAGE.isotoniqueEffectifMin ? "isotonique" : "platt") : demande;
  if (methode === "isotonique" && ajustement.length < SEUILS_ETALONNAGE.isotoniqueEffectifMin) {
    throw new Error(
      `Régression isotonique seulement à partir de ${SEUILS_ETALONNAGE.isotoniqueEffectifMin} exemples d'ajustement (${ajustement.length} disponibles)`,
    );
  }

  const sA = ajustement.map((o) => o.score);
  const yA = ajustement.map((o) => o.converti);
  const sE = evaluation.map((o) => o.score);
  const yE = evaluation.map((o) => o.converti);

  let parametres: ParametresPlatt | null = null;
  let isotonique: ModeleIsotonique | null = null;
  let probabilites: number[];
  if (methode === "platt") {
    const p = ajusterPlatt(sA, yA);
    parametres = p;
    probabilites = sE.map((s) => probabilitePlatt(p, s));
  } else {
    const m = ajusterIsotonique(sA, yA);
    isotonique = m;
    probabilites = sE.map((s) => probabiliteIsotonique(m, s));
  }

  const effectif = entree.observations.length;
  const conversions = entree.observations.filter((o) => o.converti).length;
  const dates = entree.observations.map((o) => o.date).sort();
  const etalonnage = Etalonnage.parse({
    id: entree.id,
    companyId: entree.companyId,
    segment: entree.segment,
    methode,
    parametres: parametres === null ? null : { a: parametres.a, b: parametres.b },
    separation: "decoupage_temporel",
    horizonJours: entree.horizonJours ?? SEUILS_ETALONNAGE.horizonJoursParDefaut,
    effectif,
    conversions,
    brier: scoreBrier(probabilites, yE),
    tranches: tranchesFiabilite(sE, yE, probabilites),
    statut: seuilsEtalonnageAtteints(effectif, conversions) ? "probabilite_mesuree" : "estimation",
    versionPoids: entree.versionPoids,
    donnees: { debut: dates[0]!, fin: dates[dates.length - 1]!, origines: [...entree.origines] },
    calculeLe: entree.calculeLe,
    calculePar: entree.calculePar,
    mode: entree.mode,
  });
  return { etalonnage, isotonique };
}

export type ResultatApplication =
  | { readonly applique: EtalonnageApplique; readonly motif: null }
  | { readonly applique: null; readonly motif: string };

/**
 * Probabilité appliquée à un score, avec la marge de Wilson de sa tranche. Rend `null` (le score
 * reste une estimation) si l'étalonnage n'atteint pas les seuils, si la tranche n'a pas été observée,
 * ou si la probabilité du modèle sort de l'intervalle observé dans sa tranche : on n'affiche pas un
 * chiffre que les données démentent.
 */
export function appliquerEtalonnage(etalonnage: Etalonnage, score: number): ResultatApplication {
  if (etalonnage.statut !== "probabilite_mesuree" || !seuilsEtalonnageAtteints(etalonnage.effectif, etalonnage.conversions)) {
    return { applique: null, motif: "Seuils non atteints : le score reste une estimation" };
  }
  const tranche = etalonnage.tranches.find((t) => score >= t.scoreMin && score <= t.scoreMax);
  if (tranche === undefined) return { applique: null, motif: "Aucune issue observée dans cette tranche de score" };
  let probabilite: number;
  if (etalonnage.methode === "platt") {
    if (etalonnage.parametres === null) return { applique: null, motif: "Paramètres de Platt absents" };
    probabilite = probabilitePlatt(etalonnage.parametres, score);
  } else {
    probabilite = tranche.probabilitePredite;
  }
  if (probabilite < tranche.borneBasse || probabilite > tranche.borneHaute) {
    return { applique: null, motif: "La probabilité du modèle sort de l'intervalle observé dans cette tranche" };
  }
  return {
    applique: {
      etalonnageId: etalonnage.id,
      marge: {
        probabilite,
        borneBasse: tranche.borneBasse,
        borneHaute: tranche.borneHaute,
        niveauConfiance: SEUILS_ETALONNAGE.niveauConfiance,
        methode: "wilson",
      },
      effectif: etalonnage.effectif,
      conversions: etalonnage.conversions,
      methode: etalonnage.methode,
      date: etalonnage.calculeLe,
    },
    motif: null,
  };
}
