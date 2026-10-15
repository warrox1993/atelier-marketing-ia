/**
 * Vecteurs des connaissances : encodage pour la base et recherche exacte en mémoire.
 *
 * Prototype du lot R0 (`docs/rag-conception.md` §9) : fonctions pures, sans dépendance.
 * - Stockage : `bytea` (float32 petit-boutiste) transporté en base64 à travers `ctx.db`,
 *   car le canal hôte-worker est du JSON : un `Buffer` y deviendrait `{ type, data: [...] }`.
 * - Recherche : produit scalaire exact sur des vecteurs normalisés (= cosinus), meilleurs k
 *   gardés dans un petit tas, restreints éventuellement à une liste de lignes autorisées
 *   (filtres structurés appliqués avant).
 */

/** Float32Array → base64 (octets float32 petit-boutistes, l'ordre natif des processeurs x86 et ARM). */
export function versBase64(vecteur: Float32Array): string {
  return Buffer.from(vecteur.buffer, vecteur.byteOffset, vecteur.byteLength).toString("base64");
}

/** base64 → Float32Array (copie alignée), dimension contrôlée. */
export function depuisBase64(texte: string, dimension: number): Float32Array {
  const octets = Buffer.from(texte, "base64");
  if (octets.byteLength !== dimension * 4) {
    throw new Error(`Vecteur de ${octets.byteLength} octets, ${dimension * 4} attendus`);
  }
  const copie = new Uint8Array(octets.byteLength);
  copie.set(octets);
  return new Float32Array(copie.buffer);
}

/** Littéral PostgreSQL `real[]` (`{0.1,0.2}`), passé en texte puis converti par `$n::real[]`. */
export function versLitteralReel(vecteur: Float32Array): string {
  return `{${Array.from(vecteur).join(",")}}`;
}

/** Normalise en place (norme euclidienne 1) ; renvoie le vecteur. */
export function normaliser(vecteur: Float32Array): Float32Array {
  let somme = 0;
  for (let i = 0; i < vecteur.length; i += 1) somme += vecteur[i]! * vecteur[i]!;
  const norme = Math.sqrt(somme);
  if (norme > 0) for (let i = 0; i < vecteur.length; i += 1) vecteur[i] = vecteur[i]! / norme;
  return vecteur;
}

/** Matrice de vecteurs contigus : une ligne par passage, `dimension` colonnes. */
export interface Matrice {
  dimension: number;
  lignes: number;
  donnees: Float32Array;
}

export function creerMatrice(dimension: number, lignes: number): Matrice {
  return { dimension, lignes, donnees: new Float32Array(dimension * lignes) };
}

export interface Resultat {
  ligne: number;
  score: number;
}

/**
 * Les k lignes au plus grand produit scalaire avec `requete`, par ordre décroissant ; à score égal,
 * la plus petite ligne d'abord (ordre stable et reproductible). `autorisees` restreint la recherche.
 */
export function rechercheExacte(
  matrice: Matrice,
  requete: Float32Array,
  k: number,
  autorisees?: Iterable<number>,
): Resultat[] {
  const { dimension, donnees } = matrice;
  if (requete.length !== dimension) throw new Error("Dimension de la requête incorrecte");
  if (k <= 0) return [];
  // Tas minimal de taille k : la racine est le moins bon des k meilleurs.
  const tasLigne: number[] = [];
  const tasScore: number[] = [];
  const pire = (a: number, b: number) =>
    tasScore[a]! < tasScore[b]! || (tasScore[a] === tasScore[b] && tasLigne[a]! > tasLigne[b]!);
  const echanger = (a: number, b: number) => {
    [tasLigne[a], tasLigne[b]] = [tasLigne[b]!, tasLigne[a]!];
    [tasScore[a], tasScore[b]] = [tasScore[b]!, tasScore[a]!];
  };
  const descendre = (i: number) => {
    for (;;) {
      const g = 2 * i + 1;
      const d = g + 1;
      let m = i;
      if (g < tasLigne.length && pire(g, m)) m = g;
      if (d < tasLigne.length && pire(d, m)) m = d;
      if (m === i) return;
      echanger(i, m);
      i = m;
    }
  };
  const monter = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!pire(i, p)) return;
      echanger(i, p);
      i = p;
    }
  };
  const evaluer = (ligne: number) => {
    const base = ligne * dimension;
    let s = 0;
    for (let j = 0; j < dimension; j += 1) s += donnees[base + j]! * requete[j]!;
    if (tasLigne.length < k) {
      tasLigne.push(ligne);
      tasScore.push(s);
      monter(tasLigne.length - 1);
    } else if (s > tasScore[0]! || (s === tasScore[0] && ligne < tasLigne[0]!)) {
      tasLigne[0] = ligne;
      tasScore[0] = s;
      descendre(0);
    }
  };
  if (autorisees) {
    for (const ligne of autorisees) {
      if (ligne < 0 || ligne >= matrice.lignes) throw new Error(`Ligne hors matrice : ${ligne}`);
      evaluer(ligne);
    }
  } else {
    for (let ligne = 0; ligne < matrice.lignes; ligne += 1) evaluer(ligne);
  }
  return tasLigne
    .map((ligne, i) => ({ ligne, score: tasScore[i]! }))
    .sort((a, b) => b.score - a.score || a.ligne - b.ligne);
}

/** Retire les accents (NFD puis suppression des marques combinantes) et met en minuscules. */
export function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}
