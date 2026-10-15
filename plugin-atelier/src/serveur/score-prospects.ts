/**
 * Score expliqué des prospects (lot P6, conception §5.2).
 *
 * Le score est la somme des points des critères remplis, chaque point venant des poids choisis par le
 * client, borné à 0..100. Chaque critère garde sa valeur, sa source et sa date pour que le score se
 * lise ligne par ligne. Les critères bloquants n'apportent aucun point : ils excluent un prospect, ce
 * qui relève d'un autre lot. Le score sert à trier et à prioriser, jamais à fixer un prix, une
 * éligibilité ou une condition.
 *
 * Tant que l'étalonnage du segment n'atteint pas les seuils (300 prospects et 30 conversions), le
 * score est une « estimation » et s'affiche comme tel. Aucun libellé ne parle de certitude.
 */
import {
  LIMITES_PROSPECTION,
  type CritereScore,
  type EtalonnageApplique,
  type PoidsScore,
  ScoreProspect,
} from "../contrats/prospection.js";
import { seuilsEtalonnageAtteints } from "./etalonnage.js";

/** Un critère évalué pour un prospect, avant pondération. */
export interface CritereEvalue {
  readonly code: string;
  readonly libelle: string;
  readonly valeur: string | number | boolean | null;
  readonly source: string;
  readonly dateSource: string;
  /** Le critère est-il rempli ? S'il l'est, il rapporte le poids fixé par le client pour son code. */
  readonly satisfait: boolean;
  /** Critère d'exclusion : il n'entre pas dans le score. */
  readonly bloquant?: boolean;
}

export interface EntreeScore {
  readonly criteres: readonly CritereEvalue[];
  readonly poids: Pick<PoidsScore, "version" | "poids">;
  readonly calculeLe: string;
  /** Probabilité étalonnée éventuelle ; ignorée si elle n'atteint pas les seuils. */
  readonly etalonnage?: EtalonnageApplique | null;
}

/** Calcule le score expliqué et le valide contre le contrat `ScoreProspect`. */
export function calculerScore(entree: EntreeScore): ScoreProspect {
  const retenus = entree.criteres.filter((c) => c.bloquant !== true);
  if (retenus.length === 0) throw new Error("Score impossible : aucun critère non bloquant");
  if (retenus.length > LIMITES_PROSPECTION.criteresScoreMax) {
    throw new Error(`Score impossible : au plus ${LIMITES_PROSPECTION.criteresScoreMax} critères`);
  }
  const criteres: CritereScore[] = retenus.map((c) => {
    const poids = entree.poids.poids[c.code];
    if (poids === undefined) {
      throw new Error(`Score impossible : le critère « ${c.code} » n'a pas de poids dans la version ${entree.poids.version}`);
    }
    return {
      code: c.code,
      libelle: c.libelle,
      valeur: c.valeur,
      points: c.satisfait ? poids : 0,
      source: c.source,
      dateSource: c.dateSource,
    };
  });
  const somme = criteres.reduce((t, c) => t + c.points, 0);
  const etalonnage =
    entree.etalonnage != null && seuilsEtalonnageAtteints(entree.etalonnage.effectif, entree.etalonnage.conversions)
      ? entree.etalonnage
      : null;
  return ScoreProspect.parse({
    valeur: Math.min(100, Math.max(0, somme)),
    criteres,
    versionPoids: entree.poids.version,
    nature: etalonnage === null ? "estimation" : "probabilite_mesuree",
    etalonnage,
    calculeLe: entree.calculeLe,
  });
}

function pourcent(v: number, arrondi: (x: number) => number): string {
  return `${arrondi(v * 100)} %`;
}

function dateCourte(horodatage: string): string {
  const d = new Date(horodatage);
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${jj}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Libellé affiché. Estimation : « Score 72/100 (estimation, non étalonnée) ». Probabilité mesurée :
 * « Score 72/100 (probabilité mesurée : 18 % entre 12 % et 26 %, sur 412 prospects dont 41 conversions,
 * étalonnage du 15/10/2026) ». Les bornes sont arrondies vers l'extérieur pour ne jamais rétrécir la marge.
 */
export function libelleScore(score: ScoreProspect): string {
  const tete = `Score ${score.valeur}/100`;
  if (score.nature === "estimation" || score.etalonnage === null) return `${tete} (estimation, non étalonnée)`;
  const e = score.etalonnage;
  return (
    `${tete} (probabilité mesurée : ${pourcent(e.marge.probabilite, Math.round)} entre ` +
    `${pourcent(e.marge.borneBasse, Math.floor)} et ${pourcent(e.marge.borneHaute, Math.ceil)}, ` +
    `sur ${e.effectif} prospects dont ${e.conversions} conversions, étalonnage du ${dateCourte(e.date)})`
  );
}

/** Explication ligne par ligne : critère, valeur, points, source et date. */
export function expliquerScore(score: ScoreProspect): string[] {
  return score.criteres.map(
    (c) =>
      `${c.libelle} : ${c.valeur === null ? "inconnu" : String(c.valeur)} → ${c.points > 0 ? "+" : ""}${c.points} ` +
      `(source : ${c.source}, ${dateCourte(c.dateSource)})`,
  );
}

/** Tri décroissant par score, stable : à score égal, l'ordre d'arrivée est conservé. */
export function trierParScore<T>(elements: readonly T[], score: (e: T) => ScoreProspect): T[] {
  return elements
    .map((e, i) => ({ e, i, v: score(e).valeur }))
    .sort((x, y) => y.v - x.v || x.i - y.i)
    .map((x) => x.e);
}
