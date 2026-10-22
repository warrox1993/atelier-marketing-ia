/**
 * Règles pures des expériences A/B : le verdict est CALCULÉ ici, jamais écrit par un agent.
 *
 * Méthode (documentée pour être refaite à la main) :
 * - la variante de référence est la première ; chaque autre variante est comparée à elle ;
 * - tant qu'une variante n'a pas atteint le minimum d'essais : « non concluant : échantillon insuffisant » ;
 * - test z bilatéral de deux proportions avec proportion commune : z = (p2 - p1) / sqrt(p(1 - p)(1/n1 + 1/n2)),
 *   p = (x1 + x2) / (n1 + n2) ; p-valeur = erfc(|z| / sqrt 2) ;
 * - s'il y a plus de 2 variantes, correction de Bonferroni : p-valeur ajustée = min(1, p x m), m = nombre de comparaisons ;
 *   la comparaison est significative quand la p-valeur ajustée est inférieure à alpha ;
 * - intervalle de confiance à 95 % de l'écart (p2 - p1) : méthode de Newcombe (hybride, issue des intervalles de Wilson),
 *   qui reste valable à 0 % et à 100 % (la méthode de Wald y donnerait un intervalle réduit à un point, trompeur) ;
 * - verdict : une variante « gagne » si elle fait significativement mieux que la référence (la meilleure parmi celles-là) ;
 *   la référence gagne si elle bat significativement TOUTES les autres ; aucune significative : « aucune différence
 *   détectable » ; référence meilleure que certaines seulement : non concluant.
 * Aucun arrondi n'est fait ici : les nombres sont rendus tels que calculés.
 */
import { ALPHA_PAR_DEFAUT, type ComparaisonVariante, type VerdictExperience } from "../contrats/experiences.js";

export interface ResultatBrut {
  nom: string;
  essais: number;
  succes: number;
}

/** Quantile 0,975 de la loi normale centrée réduite. */
export const Z_95 = 1.959963984540054;

/** Fonction d'erreur complémentaire (Numerical Recipes, `erfcc` : erreur relative inférieure à 1,2e-7 sur tout l'axe). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const polynome = -1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const r = t * Math.exp(-z * z + polynome);
  return x >= 0 ? r : 2 - r;
}

/** Contrôle d'un résultat : entiers, essais >= succès >= 0. Lève une erreur au message lisible. */
export function verifierResultat(r: ResultatBrut): void {
  if (!Number.isInteger(r.essais) || !Number.isInteger(r.succes) || r.essais < 0 || r.succes < 0) {
    throw new Error(`Variante « ${r.nom} » : essais et succès doivent être des entiers positifs ou nuls.`);
  }
  if (r.succes > r.essais) throw new Error(`Variante « ${r.nom} » : ${r.succes} succès pour ${r.essais} essais, c'est impossible.`);
}

/** Intervalle de Wilson à 95 % d'une proportion x/n (n >= 1). */
export function intervalleWilson(x: number, n: number): [number, number] {
  const p = x / n;
  const z2 = Z_95 * Z_95;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const demi = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - demi), Math.min(1, centre + demi)];
}

/** Comparaison de la variante 2 à la référence 1 (n1 et n2 >= 1). `m` : nombre de comparaisons pour Bonferroni. */
export function comparer(ref: ResultatBrut, autre: ResultatBrut, m: number, alpha: number): ComparaisonVariante {
  const p1 = ref.succes / ref.essais;
  const p2 = autre.succes / autre.essais;
  const commune = (ref.succes + autre.succes) / (ref.essais + autre.essais);
  const variance = commune * (1 - commune) * (1 / ref.essais + 1 / autre.essais);
  // Variance nulle seulement si la proportion commune vaut 0 ou 1, donc si les deux taux sont égaux : z = 0.
  const z = variance === 0 ? 0 : (p2 - p1) / Math.sqrt(variance);
  const pValeur = Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
  const pValeurAjustee = Math.min(1, pValeur * m);
  const [l1, u1] = intervalleWilson(ref.succes, ref.essais);
  const [l2, u2] = intervalleWilson(autre.succes, autre.essais);
  const ecart = p2 - p1;
  const bas = ecart - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2);
  const haut = ecart + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2);
  return {
    variante: autre.nom, tauxReference: p1, tauxVariante: p2, ecartAbsolu: ecart, intervalle95: [bas, haut],
    z, pValeur, pValeurAjustee, significatif: pValeurAjustee < alpha,
  };
}

/** p-valeur lisible sans arrondi trompeur : jamais « 0 », les valeurs minuscules sont données par un seuil. */
export function formaterP(p: number): string {
  if (p < 0.0001) return "< 0,0001";
  return p.toLocaleString("fr-BE", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
}

const pct = (x: number) => `${(x * 100).toLocaleString("fr-BE", { maximumFractionDigits: 2 })} %`;

// eslint-disable-next-line no-control-regex
const CONTROLES = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu;
/** Nom d'agent ou de variante rendu sur une seule ligne, entre « … » : jamais une ligne de consigne. */
const nomCite = (t: string) => `« ${t.replace(CONTROLES, " ").replace(/\s+/gu, " ").trim()} »`;

/**
 * Revue M1 : ligne du verdict reconstruite à partir des champs STRUCTURÉS (statut, taux, comparaisons), jamais
 * recopiée de `verdict.texte` (figé, pouvant dater d'avant le contrôle des noms). Noms passés sur une ligne et cités.
 */
export function ligneVerdict(v: VerdictExperience): string {
  const ref = nomCite(v.reference);
  if (v.statut === "aucune_difference") return "aucune différence détectable";
  if (v.statut === "gagnant" && v.gagnant !== null) {
    if (v.gagnant === v.reference) {
      return `${ref} gagne : la référence fait significativement mieux que chacune des autres variantes (${v.comparaisons.map((c) => `${nomCite(c.variante)} ${pct(c.tauxVariante)}`).join(", ")}${v.comparaisons[0] ? ` contre ${pct(v.comparaisons[0].tauxReference)}` : ""})`;
    }
    const c = v.comparaisons.find((x) => x.variante === v.gagnant);
    if (c) {
      return `${nomCite(c.variante)} gagne : ${pct(c.tauxVariante)} contre ${pct(c.tauxReference)} pour la référence ${ref} (écart ${pct(c.ecartAbsolu)}, IC 95 % [${pct(c.intervalle95[0])} ; ${pct(c.intervalle95[1])}], p ${c.pValeurAjustee < 0.0001 ? "" : "= "}${formaterP(c.pValeurAjustee)})`;
    }
    return `${nomCite(v.gagnant)} gagne`;
  }
  if (v.comparaisons.length === 0) {
    const insuffisantes = v.taux.filter((t) => t.essais < Math.max(1, v.essaisMinParVariante));
    return `non concluant : échantillon insuffisant (minimum ${v.essaisMinParVariante} essais par variante ; ${insuffisantes.map((t) => `${nomCite(t.variante)} : ${t.essais}`).join(", ")})`;
  }
  const pires = v.comparaisons.filter((c) => c.significatif && c.ecartAbsolu < 0);
  return `non concluant : la référence ${ref} ne bat significativement qu'une partie des variantes (${pires.map((c) => nomCite(c.variante)).join(", ")})`;
}

export interface EntreeVerdict {
  /** Variantes dans l'ordre déclaré ; la première est la référence. */
  variantes: ResultatBrut[];
  essaisMinParVariante: number;
  alpha?: number;
  /** Horodatage du calcul (ISO), fourni par l'appelant pour garder la fonction pure. */
  calculeLe: string;
}

export function calculerVerdict(entree: EntreeVerdict): VerdictExperience {
  const alpha = entree.alpha ?? ALPHA_PAR_DEFAUT;
  if (!(alpha > 0 && alpha < 1)) throw new Error("Le seuil alpha doit être strictement compris entre 0 et 1.");
  if (entree.variantes.length < 2) throw new Error("Une expérience compare au moins deux variantes.");
  for (const v of entree.variantes) verifierResultat(v);

  const ref = entree.variantes[0]!;
  const m = entree.variantes.length - 1;
  const alphaAjuste = alpha / m;
  const taux = entree.variantes.map((v) => ({ variante: v.nom, essais: v.essais, succes: v.succes, taux: v.essais > 0 ? v.succes / v.essais : null }));
  const base = { reference: ref.nom, alpha, alphaAjuste, essaisMinParVariante: entree.essaisMinParVariante, taux, calculeLe: entree.calculeLe };

  // Au moins un essai par variante est toujours exigé (un taux sur 0 essai n'existe pas), même si le minimum déclaré est plus bas.
  const insuffisantes = entree.variantes.filter((v) => v.essais < Math.max(1, entree.essaisMinParVariante));
  if (insuffisantes.length > 0) {
    const detail = insuffisantes.map((v) => `${v.nom} : ${v.essais}`).join(", ");
    return {
      ...base, statut: "non_concluant", gagnant: null, comparaisons: [],
      texte: `non concluant : échantillon insuffisant (minimum ${entree.essaisMinParVariante} essais par variante ; ${detail})`,
    };
  }

  const comparaisons = entree.variantes.slice(1).map((v) => comparer(ref, v, m, alpha));
  const meilleures = comparaisons.filter((c) => c.significatif && c.ecartAbsolu > 0);
  if (meilleures.length > 0) {
    const gagnante = meilleures.reduce((a, b) => (b.tauxVariante > a.tauxVariante ? b : a));
    return {
      ...base, statut: "gagnant", gagnant: gagnante.variante, comparaisons,
      texte: `${gagnante.variante} gagne : ${pct(gagnante.tauxVariante)} contre ${pct(gagnante.tauxReference)} pour la référence ${ref.nom} (écart ${pct(gagnante.ecartAbsolu)}, IC 95 % [${pct(gagnante.intervalle95[0])} ; ${pct(gagnante.intervalle95[1])}], p ${gagnante.pValeurAjustee < 0.0001 ? "" : "= "}${formaterP(gagnante.pValeurAjustee)})`,
    };
  }
  const pires = comparaisons.filter((c) => c.significatif && c.ecartAbsolu < 0);
  if (pires.length === comparaisons.length) {
    return {
      ...base, statut: "gagnant", gagnant: ref.nom, comparaisons,
      texte: `${ref.nom} gagne : la référence fait significativement mieux que chacune des autres variantes (${comparaisons.map((c) => `${c.variante} ${pct(c.tauxVariante)}`).join(", ")} contre ${pct(comparaisons[0]!.tauxReference)})`,
    };
  }
  if (pires.length > 0) {
    return {
      ...base, statut: "non_concluant", gagnant: null, comparaisons,
      texte: `non concluant : la référence ${ref.nom} ne bat significativement qu'une partie des variantes (${pires.map((c) => c.variante).join(", ")})`,
    };
  }
  return { ...base, statut: "aucune_difference", gagnant: null, comparaisons, texte: "aucune différence détectable" };
}
