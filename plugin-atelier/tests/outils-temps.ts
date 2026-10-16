/**
 * Mesure de la CROISSANCE du temps d'exécution, pour les tests de non-régression ReDoS.
 *
 * Un seuil absolu en millisecondes dépend de la charge du poste (échecs constatés à 563 ms, 1 054 ms et
 * 2 055 ms quand d'autres suites tournaient). On chronomètre plutôt une entrée de taille `petit`, puis
 * une entrée `FACTEUR_CROISSANCE` fois plus grande, et on rend le rapport des deux (minimum de plusieurs
 * mesures, après une chauffe). La charge ralentit les deux mesures dans la même proportion : le rapport
 * vaut environ 4 pour un temps linéaire, 16 pour un temps quadratique, 64 pour un temps cubique.
 */
export const FACTEUR_CROISSANCE = 4;
/** Au-dessus : croissance plus que linéaire (quadratique = 16, cubique = 64). */
export const RAPPORT_CROISSANCE_MAX = 8;

function chronometrer(f: (entree: string) => unknown, entree: string, repetitions: number): number {
  let meilleure = Number.POSITIVE_INFINITY;
  let total = 0;
  // Une mesure déjà longue (motif à retour arrière, contrôle par mutation) n'est pas répétée.
  for (let i = 0; i < repetitions && total < 300; i++) {
    const t0 = performance.now();
    f(entree);
    const ecoule = performance.now() - t0;
    total += ecoule;
    meilleure = Math.min(meilleure, ecoule);
  }
  return meilleure;
}

/**
 * Rapport temps(grande entrée) / temps(petite entrée). Le plus petit de trois essais : une pause du
 * ramasse-miettes peut gonfler un essai, jamais le faire passer sous le vrai rapport d'un motif
 * quadratique ou cubique. Les essais s'arrêtent dès qu'un rapport passe sous le seuil.
 */
export function rapportCroissance(motif: (n: number) => string, f: (entree: string) => unknown, petit: number, repetitions = 5): number {
  f(motif(petit)); // chauffe : compilation JIT avant les mesures
  const petite = motif(petit);
  const grande = motif(petit * FACTEUR_CROISSANCE);
  let meilleur = Number.POSITIVE_INFINITY;
  for (let essai = 0; essai < 3 && meilleur >= RAPPORT_CROISSANCE_MAX; essai++) {
    const tPetit = chronometrer(f, petite, repetitions);
    const tGrand = chronometrer(f, grande, repetitions);
    meilleur = Math.min(meilleur, tGrand / Math.max(tPetit, 0.05));
  }
  return meilleur;
}
