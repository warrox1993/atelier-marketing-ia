/**
 * Fonctions PURES de l'organigramme « carte des services » (testées sans interface, voir tests/organigramme-flux.spec.ts) :
 * classement des flux métier, liaisons d'un service par partenaire, matrice des échanges, disposition en anneau,
 * courbes de liaison qui évitent les autres nœuds, index de recherche des services et des agents.
 *
 * Le rendu ne dépend que du nombre de SERVICES (carte, matrice) : aucune fonction ne parcourt les agents hors de
 * `indexRecherche` / `chercher`, conçus pour 10 000 agents.
 */
import type { FluxServiceLu } from "../contrats/departements.js";
import { origineDepuisObjet, type OrigineFlux } from "../contrats/liaisons.js";
import { liensDuService, normaliser, type AgentHote } from "./organigramme-arbre.js";

// ---------------------------------------------------------------------------------------------------------------
// Flux : classement métier / réseau des coordinateurs
// ---------------------------------------------------------------------------------------------------------------

/** Flux tel que rendu par `services.flux` ; `origine` peut manquer (ancien serveur) : repli par l'objet. */
export type FluxBrut = Omit<FluxServiceLu, "origine"> & { origine?: OrigineFlux };

/** Origine d'un flux : le champ du serveur, sinon déduite du préfixe d'objet des flux générés. */
export const origineDuFlux = (f: FluxBrut): OrigineFlux => f.origine ?? origineDepuisObjet(f.objet);

/** Flux métier seulement (jamais le réseau des coordinateurs, 638 flux sur 756 en réel) ; un flux d'un service vers lui-même est écarté. */
export function fluxMetier<T extends FluxBrut>(flux: readonly T[]): T[] {
  return flux.filter((f) => f.source !== f.cible && origineDuFlux(f) === "metier");
}

/** Objets d'un flux : un flux par paire, plusieurs objets regroupés dans `objet` séparés par « ; ». */
export const objetsDuFlux = (f: Pick<FluxBrut, "objet">): string[] => {
  const liste = f.objet.split(";").map((o) => o.trim()).filter((o) => o !== "");
  return liste.length > 0 ? liste : [f.objet.trim()];
};

/** Nombre d'échanges (objets) portés par un flux. */
export const volumeDuFlux = (f: Pick<FluxBrut, "objet">): number => objetsDuFlux(f).length;

// ---------------------------------------------------------------------------------------------------------------
// Liaisons d'un service, regroupées par partenaire
// ---------------------------------------------------------------------------------------------------------------

export interface LiaisonPartenaire<T extends FluxBrut = FluxBrut> {
  partenaire: string;
  /** Flux dont le service est la source (ce qu'il peut demander au partenaire). */
  sortants: T[];
  /** Flux dont le service est la cible (ce que le partenaire peut lui demander). */
  entrants: T[];
  /** Vrai si l'un des flux avec ce partenaire exige l'approbation humaine. */
  approbation: boolean;
  /** Nombre total d'échanges (objets) dans les deux sens : sert au tri et à l'épaisseur du trait. */
  volume: number;
}

/** Liaisons de `slug` par partenaire, les plus nourries d'abord (volume décroissant, puis ordre alphabétique). */
export function liaisonsDe<T extends FluxBrut>(slug: string, flux: readonly T[]): Array<LiaisonPartenaire<T>> {
  const liens = liensDuService(flux as readonly FluxServiceLu[], slug);
  const partenaires = new Map<string, LiaisonPartenaire<T>>();
  const entree = (p: string): LiaisonPartenaire<T> => {
    let e = partenaires.get(p);
    if (!e) partenaires.set(p, (e = { partenaire: p, sortants: [], entrants: [], approbation: false, volume: 0 }));
    return e;
  };
  for (const f of liens.sortants as unknown as T[]) {
    const e = entree(f.cible);
    e.sortants.push(f);
    e.approbation ||= f.approbationHumaine;
    e.volume += volumeDuFlux(f);
  }
  for (const f of liens.entrants as unknown as T[]) {
    const e = entree(f.source);
    e.entrants.push(f);
    e.approbation ||= f.approbationHumaine;
    e.volume += volumeDuFlux(f);
  }
  return [...partenaires.values()].sort((a, b) => b.volume - a.volume || a.partenaire.localeCompare(b.partenaire, "fr"));
}

// ---------------------------------------------------------------------------------------------------------------
// Matrice des échanges (services x services)
// ---------------------------------------------------------------------------------------------------------------

/** Ce que les fonctions de ce fichier lisent d'un service (compatible avec `DepartementDeclare` et `ServiceADisposer`). */
export interface ServiceCarte {
  slug: string;
  nom: string;
  estDirection?: boolean;
}

/** Direction d'abord, puis par nom (ordre « fr »), sans doublon de slug. */
export function ordonnerServices<S extends ServiceCarte>(services: readonly S[]): S[] {
  const vus = new Set<string>();
  const uniques = services.filter((s) => (vus.has(s.slug) ? false : (vus.add(s.slug), true)));
  return uniques.sort((a, b) => Number(b.estDirection === true) - Number(a.estDirection === true) || a.nom.localeCompare(b.nom, "fr"));
}

export interface CaseMatrice {
  /** Échanges (objets) de la ligne vers la colonne ; 0 = aucune liaison. */
  nombre: number;
  /** Vrai si l'un des flux de la case exige l'approbation humaine. */
  approbation: boolean;
  /** Flux de la case (zéro ou un : une déclaration par paire source > cible). */
  flux: FluxBrut[];
}

export interface Matrice {
  /** Slugs, identiques en lignes (sources) et en colonnes (cibles). */
  ordre: string[];
  noms: string[];
  /** `cases[ligne][colonne]` = de la source `ordre[ligne]` vers la cible `ordre[colonne]` ; la diagonale reste vide. */
  cases: CaseMatrice[][];
  /** Total d'échanges par ligne (sortants) et par colonne (entrants). */
  totalLigne: number[];
  totalColonne: number[];
}

/** Matrice services x services des flux donnés (passer `fluxMetier(...)` pour la vue ordinaire). Flux d'un service inconnu : ignorés. */
export function matriceEchanges(services: readonly ServiceCarte[], flux: readonly FluxBrut[]): Matrice {
  const ordonnes = ordonnerServices(services);
  const ordre = ordonnes.map((s) => s.slug);
  const indice = new Map(ordre.map((s, i) => [s, i]));
  const cases: CaseMatrice[][] = ordre.map(() => ordre.map(() => ({ nombre: 0, approbation: false, flux: [] })));
  const totalLigne = ordre.map(() => 0);
  const totalColonne = ordre.map(() => 0);
  for (const f of flux) {
    const i = indice.get(f.source);
    const j = indice.get(f.cible);
    if (i === undefined || j === undefined || i === j) continue;
    const c = cases[i]![j]!;
    const n = volumeDuFlux(f);
    c.nombre += n;
    c.approbation ||= f.approbationHumaine;
    c.flux.push(f);
    totalLigne[i]! += n;
    totalColonne[j]! += n;
  }
  return { ordre, noms: ordonnes.map((s) => s.nom), cases, totalLigne, totalColonne };
}

// ---------------------------------------------------------------------------------------------------------------
// Disposition en anneau
// ---------------------------------------------------------------------------------------------------------------

export interface Dimensions {
  largeur: number;
  hauteur: number;
}

export interface NoeudAnneau {
  /** « general » pour le Coordinateur général au centre, sinon le slug du service. */
  id: string;
  genre: "general" | "service";
  /** Centre du nœud. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Angle du centre vu du centre de la carte, en radians (-PI/2 = en haut) ; 0 pour le général. */
  angle: number;
  /** 0 = centre, 1 = anneau intérieur (ou unique), 2 = anneau extérieur. */
  anneau: 0 | 1 | 2;
}

export interface DispositionAnneau {
  /** Dimensions de la carte : au moins celles demandées, agrandies si les nœuds ne tiennent pas autrement. */
  largeur: number;
  hauteur: number;
  centre: { x: number; y: number };
  /** Rayons des anneaux, du plus petit au plus grand (un seul rayon jusqu'à 24 services). */
  rayons: number[];
  noeuds: NoeudAnneau[];
}

export interface OptionsAnneau {
  /** Taille d'un nœud de service (défaut 168 x 60). */
  noeud?: Dimensions;
  /** Taille du nœud du Coordinateur général (défaut 176 x 72). */
  general?: Dimensions;
  /** Marge minimale entre deux nœuds et autour de la carte (défaut 12). */
  marge?: number;
}

/** Au-delà de ce nombre de services, deux anneaux concentriques. */
export const SERVICES_PAR_ANNEAU_MAX = 24;
export const NOEUD_SERVICE = { largeur: 168, hauteur: 60 } as const;
export const NOEUD_GENERAL = { largeur: 176, hauteur: 72 } as const;
export const ID_GENERAL = "general";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const rectDe = (n: Pick<NoeudAnneau, "x" | "y" | "largeur" | "hauteur">, marge = 0): Rect => ({
  x0: n.x - n.largeur / 2 - marge, y0: n.y - n.hauteur / 2 - marge, x1: n.x + n.largeur / 2 + marge, y1: n.y + n.hauteur / 2 + marge,
});
const seChevauchent = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Vrai si aucun nœud ne chevauche un autre (avec `marge` de chaque côté de chacun). */
export function sansChevauchement(noeuds: readonly NoeudAnneau[], marge = 0): boolean {
  const rects = noeuds.map((n) => rectDe(n, marge / 2));
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) if (seChevauchent(rects[i]!, rects[j]!)) return false;
  return true;
}

function placerAnneau(ids: readonly string[], rayon: number, depart: number, anneau: 1 | 2, taille: Dimensions): NoeudAnneau[] {
  return ids.map((id, i) => {
    const angle = depart + (2 * Math.PI * i) / ids.length;
    return { id, genre: "service", x: rayon * Math.cos(angle), y: rayon * Math.sin(angle), largeur: taille.largeur, hauteur: taille.hauteur, angle, anneau };
  });
}

/** Plus petit rayon (par pas de 2 px, à partir de `min`) pour lequel `construire(rayon)` ne chevauche rien. */
function rayonSansChevauchement(min: number, construire: (r: number) => NoeudAnneau[], marge: number): number {
  let r = Math.max(min, 1);
  for (let tour = 0; tour < 5000; tour += 1, r += 2) if (sansChevauchement(construire(r), marge)) return r;
  return r;
}

/**
 * Carte des services : le Coordinateur général au centre, les services sur un anneau (deux anneaux concentriques
 * au-delà de 24), la Direction en haut. Les services gardent l'ordre donné après la Direction (l'appelant peut
 * rapprocher les services qui échangent le plus). Le rayon est calculé pour qu'aucun nœud ne se chevauche, quelle que
 * soit la taille demandée : la carte grandit au besoin (`largeur` et `hauteur` du résultat), jamais l'inverse.
 */
export function dispositionAnneau(services: readonly ServiceCarte[], taille: Dimensions, options: OptionsAnneau = {}): DispositionAnneau {
  const marge = options.marge ?? 12;
  const nd = options.noeud ?? NOEUD_SERVICE;
  const ng = options.general ?? NOEUD_GENERAL;
  const vus = new Set<string>();
  const uniques = services.filter((s) => (vus.has(s.slug) ? false : (vus.add(s.slug), true)));
  const direction = uniques.filter((s) => s.estDirection === true);
  const ordonnes = [...direction, ...uniques.filter((s) => s.estDirection !== true)];
  const n = ordonnes.length;
  const haut = -Math.PI / 2;
  const general: NoeudAnneau = { id: ID_GENERAL, genre: "general", x: 0, y: 0, largeur: ng.largeur, hauteur: ng.hauteur, angle: 0, anneau: 0 };
  // Rayon qui remplit l'espace demandé (le plus petit des deux axes) quand il est plus grand que le minimum.
  const rayonLibreMax = Math.max(0, Math.min((taille.largeur - nd.largeur) / 2, (taille.hauteur - nd.hauteur) / 2) - marge);

  let noeuds: NoeudAnneau[];
  let rayons: number[];
  if (n === 0) {
    noeuds = [general];
    rayons = [];
  } else if (n <= SERVICES_PAR_ANNEAU_MAX) {
    const ids = ordonnes.map((s) => s.slug);
    const construire = (r: number) => [general, ...placerAnneau(ids, r, haut, 1, nd)];
    const minimum = rayonSansChevauchement(Math.hypot(ng.largeur, ng.hauteur) / 2 + Math.hypot(nd.largeur, nd.hauteur) / 2 * 0.6, construire, marge);
    const r = Math.max(minimum, rayonLibreMax);
    noeuds = construire(r);
    rayons = [r];
  } else {
    // Deux anneaux : la Direction (premier service) est sur l'anneau extérieur, les autres se répartissent régulièrement.
    const nInterieur = Math.floor(n * 0.45);
    const exterieur: string[] = [];
    const interieur: string[] = [];
    ordonnes.forEach((s, i) => {
      // Répartition régulière (Bresenham) ; la Direction (i = 0) reste sur l'anneau extérieur.
      const versInterieur = i > 0 && Math.floor(((i + 1) * nInterieur) / n) > Math.floor((i * nInterieur) / n);
      (versInterieur ? interieur : exterieur).push(s.slug);
    });
    const decalageInterieur = interieur.length > 0 ? Math.PI / interieur.length : 0;
    const construire = (rInt: number, rExt: number) => [general, ...placerAnneau(interieur, rInt, haut + decalageInterieur, 1, nd), ...placerAnneau(exterieur, rExt, haut, 2, nd)];
    // 1) rayon intérieur minimal (autour du général), 2) rayon extérieur minimal avec un écart radial suffisant.
    const rInt0 = rayonSansChevauchement(Math.hypot(ng.largeur, ng.hauteur) / 2 + nd.hauteur, (r) => [general, ...placerAnneau(interieur, r, haut + decalageInterieur, 1, nd)], marge);
    const rExt0 = rayonSansChevauchement(rInt0 + nd.hauteur * 2, (r) => placerAnneau(exterieur, r, haut, 2, nd), marge);
    let rExt = Math.max(rExt0, rayonLibreMax);
    let rInt = Math.max(rInt0, Math.min(rExt - nd.hauteur * 2.2, rExt * 0.55));
    while (!sansChevauchement(construire(rInt, rExt), marge)) {
      rExt += 4;
      rInt = Math.max(rInt0, Math.min(rExt - nd.hauteur * 2.2, rExt * 0.55));
    }
    noeuds = construire(rInt, rExt);
    rayons = [rInt, rExt];
  }

  const rayonMax = rayons.length > 0 ? rayons[rayons.length - 1]! : 0;
  const dessinLargeur = n === 0 ? ng.largeur : Math.max(ng.largeur, (rayonMax + nd.largeur / 2) * 2);
  const dessinHauteur = n === 0 ? ng.hauteur : Math.max(ng.hauteur, (rayonMax + nd.hauteur / 2) * 2);
  // Place pour les arcs qui contournent l'anneau extérieur quand aucun passage intérieur n'existe.
  const largeur = Math.max(taille.largeur, dessinLargeur + 2 * (marge + LOBE_EXTERIEUR));
  const hauteur = Math.max(taille.hauteur, dessinHauteur + 2 * (marge + LOBE_EXTERIEUR));
  const centre = { x: largeur / 2, y: hauteur / 2 };
  return { largeur, hauteur, centre, rayons, noeuds: noeuds.map((p) => ({ ...p, x: p.x + centre.x, y: p.y + centre.y })) };
}

/** Réserve autour de l'anneau extérieur pour les courbes de dernier recours qui le contournent. */
const LOBE_EXTERIEUR = 56;

// ---------------------------------------------------------------------------------------------------------------
// Courbes de liaison
// ---------------------------------------------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface CourbeLiaison {
  /** Chemin SVG (attribut `d`) : quadratique `M … Q …` ou cubique `M … C …`. */
  chemin: string;
  depart: Point;
  arrivee: Point;
  /** Pointe de la flèche : position (= `arrivee`) et angle en radians (direction de la courbe à l'arrivée). */
  fleche: Point & { angle: number };
  /** Points échantillonnés de la courbe (départ à arrivée), pour les tests et le survol. */
  points: Point[];
  /** Vrai si la courbe ne traverse aucun autre nœud (toujours vrai sur une disposition en anneau produite par `dispositionAnneau`). */
  libre: boolean;
}

const ECHANTILLONS = 64;
/** Écart minimal entre une courbe et le rectangle d'un autre nœud. */
const MARGE_COURBE = 6;

const soustraire = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const norme = (a: Point): number => Math.hypot(a.x, a.y);
const unitaire = (a: Point): Point => { const n = norme(a) || 1; return { x: a.x / n, y: a.y / n }; };

/** Point où la demi-droite du centre du nœud vers `vers` sort du rectangle du nœud (écart `ecart` px au-delà). */
function sortieDuRectangle(n: Pick<NoeudAnneau, "x" | "y" | "largeur" | "hauteur">, vers: Point, ecart = 2): Point {
  const d = unitaire(soustraire(vers, n));
  const tx = d.x === 0 ? Infinity : n.largeur / 2 / Math.abs(d.x);
  const ty = d.y === 0 ? Infinity : n.hauteur / 2 / Math.abs(d.y);
  const t = Math.min(tx, ty) + ecart;
  return { x: n.x + d.x * t, y: n.y + d.y * t };
}

/** Courbe de Bézier quadratique (3 points) ou cubique (4 points). */
type Bezier = [Point, Point, Point] | [Point, Point, Point, Point];

function echantillonner(c: Bezier, nb = ECHANTILLONS): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= nb; i += 1) {
    const t = i / nb;
    const u = 1 - t;
    if (c.length === 3) {
      const [a, b, d] = c;
      pts.push({ x: u * u * a.x + 2 * u * t * b.x + t * t * d.x, y: u * u * a.y + 2 * u * t * b.y + t * t * d.y });
    } else {
      const [a, b, d, e] = c;
      pts.push({ x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * d.x + t * t * t * e.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * d.y + t * t * t * e.y });
    }
  }
  return pts;
}

/** Vrai si le segment [p, q] coupe l'intérieur du rectangle (Liang-Barsky). */
function segmentCoupe(p: Point, q: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const bornes: Array<[number, number]> = [[-dx, p.x - r.x0], [dx, r.x1 - p.x], [-dy, p.y - r.y0], [dy, r.y1 - p.y]];
  for (const [a, b] of bornes) {
    if (a === 0) { if (b <= 0) return false; continue; }
    const t = b / a;
    if (a < 0) { if (t >= t1) return false; if (t > t0) t0 = t; } else { if (t <= t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/** Nombre de rectangles traversés par la polyligne. */
function collisions(points: readonly Point[], rects: readonly Rect[]): number {
  if (points.length === 0) return 0;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of points) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  let n = 0;
  for (const r of rects) {
    if (r.x1 <= x0 || r.x0 >= x1 || r.y1 <= y0 || r.y0 >= y1) continue; // hors de la boîte englobante de la courbe
    for (let i = 0; i < points.length - 1; i += 1) {
      if (segmentCoupe(points[i]!, points[i + 1]!, r)) { n += 1; break; }
    }
  }
  return n;
}

const nombre = (v: number): string => (Math.round(v * 10) / 10).toString();
const pt = (p: Point): string => `${nombre(p.x)} ${nombre(p.y)}`;
const cheminBezier = (c: Bezier): string => (c.length === 3 ? `M ${pt(c[0])} Q ${pt(c[1])} ${pt(c[2])}` : `M ${pt(c[0])} C ${pt(c[1])} ${pt(c[2])} ${pt(c[3])}`);

/** Centre de la carte : le nœud général s'il existe, sinon le centre de gravité des nœuds. */
function centreDe(noeuds: readonly NoeudAnneau[]): Point {
  const g = noeuds.find((n) => n.genre === "general");
  if (g) return { x: g.x, y: g.y };
  const s = noeuds.reduce((acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }), { x: 0, y: 0 });
  return { x: s.x / (noeuds.length || 1), y: s.y / (noeuds.length || 1) };
}

// --- Contournement : plus court chemin dans le graphe de visibilité des rectangles (repli des courbes directes) ----

interface GrapheVisibilite {
  rects: Rect[];
  coins: Point[];
  /** Voisins visibles de chaque coin : [indice, distance]. */
  voisins: Array<Array<[number, number]>>;
}

const graphes = new WeakMap<readonly NoeudAnneau[], GrapheVisibilite>();
/**
 * Écart de routage : les rectangles du graphe sont élargis de MARGE_ROUTAGE, donc un contournement ne se glisse pas dans
 * un interstice étroit entre deux nœuds et laisse la place à un décalage (aller et retour séparés).
 */
const MARGE_ROUTAGE = 14;
const EPS = 0.01;
const reduit = (r: Rect, e: number): Rect => ({ x0: r.x0 + e, y0: r.y0 + e, x1: r.x1 - e, y1: r.y1 - e });

function visible(p: Point, q: Point, rects: readonly Rect[]): boolean {
  for (const r of rects) if (segmentCoupe(p, q, reduit(r, EPS))) return false;
  return true;
}

function grapheDe(noeuds: readonly NoeudAnneau[]): GrapheVisibilite {
  const connu = graphes.get(noeuds);
  if (connu) return connu;
  const rects = noeuds.map((n) => rectDe(n, MARGE_ROUTAGE));
  const coins = rects.flatMap((r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]);
  const voisins: GrapheVisibilite["voisins"] = coins.map(() => []);
  for (let i = 0; i < coins.length; i += 1) {
    for (let j = i + 1; j < coins.length; j += 1) {
      if (!visible(coins[i]!, coins[j]!, rects)) continue;
      const d = norme(soustraire(coins[i]!, coins[j]!));
      voisins[i]!.push([j, d]);
      voisins[j]!.push([i, d]);
    }
  }
  const g = { rects, coins, voisins };
  graphes.set(noeuds, g);
  return g;
}

/** Ports d'un nœud : milieu de chacune de ses quatre faces, à l'écart de MARGE_ROUTAGE (sur le bord du rectangle élargi). */
function ports(n: NoeudAnneau): Array<{ dehors: Point; bord: Point }> {
  const mx = n.largeur / 2;
  const my = n.hauteur / 2;
  const m = MARGE_ROUTAGE;
  return [
    { bord: { x: n.x, y: n.y - my }, dehors: { x: n.x, y: n.y - my - m } },
    { bord: { x: n.x + mx, y: n.y }, dehors: { x: n.x + mx + m, y: n.y } },
    { bord: { x: n.x, y: n.y + my }, dehors: { x: n.x, y: n.y + my + m } },
    { bord: { x: n.x - mx, y: n.y }, dehors: { x: n.x - mx - m, y: n.y } },
  ];
}

/** Trajet polygonal le plus court de `a` à `b` qui évite tous les autres nœuds, ou null s'il n'existe pas. */
function trajetContournement(a: NoeudAnneau, b: NoeudAnneau, noeuds: readonly NoeudAnneau[]): Point[] | null {
  const g = grapheDe(noeuds);
  const pa = ports(a);
  const pb = ports(b);
  const nc = g.coins.length;
  // Nœuds du graphe : coins (0..nc-1), ports de a (nc..nc+3), ports de b (nc+4..nc+7).
  const total = nc + 8;
  const position = (i: number): Point => (i < nc ? g.coins[i]! : i < nc + 4 ? pa[i - nc]!.dehors : pb[i - nc - 4]!.dehors);
  const dist = new Array<number>(total).fill(Infinity);
  const pere = new Array<number>(total).fill(-1);
  const fait = new Array<boolean>(total).fill(false);
  // Les ports de b ne sont reliés qu'à leur propre visibilité ; on calcule leurs voisins à la demande.
  const voisinsPort = (i: number): Array<[number, number]> => {
    const p = position(i);
    const res: Array<[number, number]> = [];
    for (let j = 0; j < total; j += 1) {
      if (j === i || (j >= nc && Math.floor((j - nc) / 4) === Math.floor((i - nc) / 4))) continue;
      const q = position(j);
      if (visible(p, q, g.rects)) res.push([j, norme(soustraire(p, q))]);
    }
    return res;
  };
  const adjacence = new Map<number, Array<[number, number]>>();
  for (let i = nc; i < total; i += 1) {
    const v = voisinsPort(i);
    adjacence.set(i, v);
    for (const [j, d] of v) if (j < nc) { (adjacence.get(j) ?? adjacence.set(j, []).get(j)!).push([i, d]); }
  }
  for (let i = nc; i < nc + 4; i += 1) dist[i] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < total; i += 1) if (!fait[i] && dist[i]! < Infinity && (u === -1 || dist[i]! < dist[u]!)) u = i;
    if (u === -1 || u >= nc + 4) break; // premier port de b atteint
    fait[u] = true;
    const liens = [...(u < nc ? g.voisins[u]! : []), ...(adjacence.get(u) ?? [])];
    for (const [v, d] of liens) {
      if (dist[u]! + d < dist[v]!) { dist[v] = dist[u]! + d; pere[v] = u; }
    }
  }
  let fin = -1;
  for (let i = nc + 4; i < total; i += 1) if (dist[i]! < Infinity && (fin === -1 || dist[i]! < dist[fin]!)) fin = i;
  if (fin === -1) return null;
  const chaine: number[] = [];
  for (let i = fin; i !== -1; i = pere[i]!) chaine.unshift(i);
  const portA = pa[chaine[0]! - nc]!;
  const portB = pb[fin - nc - 4]!;
  return [portA.bord, ...chaine.map(position), portB.bord];
}

/** Décale d'`ecart` px, vers la gauche du sens de marche, tous les sommets du trajet sauf ses deux extrémités (sur les bords des nœuds). */
function decalerTrajet(trajet: readonly Point[], ecart: number): Point[] {
  const gaucheDe = (p: Point, q: Point): Point => { const u = unitaire(soustraire(q, p)); return { x: -u.y, y: u.x }; };
  return trajet.map((c, i) => {
    if (i === 0 || i === trajet.length - 1) return c;
    const n1 = gaucheDe(trajet[i - 1]!, c);
    const n2 = gaucheDe(c, trajet[i + 1]!);
    const bis = unitaire({ x: n1.x + n2.x, y: n1.y + n2.y });
    const cos = Math.max(0.35, bis.x * n1.x + bis.y * n1.y);
    return { x: c.x + (bis.x * ecart) / cos, y: c.y + (bis.y * ecart) / cos };
  });
}

/** Arrondit les angles d'un trajet polygonal (courbes quadratiques) sans jamais rentrer dans un obstacle. */
function arrondir(trajet: readonly Point[], obstacles: readonly Rect[]): { chemin: string; points: Point[] } {
  for (const rayon of [22, 12, 6, 0]) {
    const points: Point[] = [trajet[0]!];
    let chemin = `M ${pt(trajet[0]!)}`;
    for (let i = 1; i < trajet.length - 1; i += 1) {
      const p = trajet[i - 1]!; const c = trajet[i]!; const q = trajet[i + 1]!;
      const dp = norme(soustraire(p, c)); const dq = norme(soustraire(q, c));
      const r = Math.min(rayon, dp / 2, dq / 2);
      if (r < 1) { chemin += ` L ${pt(c)}`; points.push(c); continue; }
      const entree = { x: c.x + ((p.x - c.x) / dp) * r, y: c.y + ((p.y - c.y) / dp) * r };
      const sortie = { x: c.x + ((q.x - c.x) / dq) * r, y: c.y + ((q.y - c.y) / dq) * r };
      chemin += ` L ${pt(entree)} Q ${pt(c)} ${pt(sortie)}`;
      points.push(entree, ...echantillonner([entree, c, sortie], 8).slice(1));
    }
    const dernier = trajet[trajet.length - 1]!;
    chemin += ` L ${pt(dernier)}`;
    points.push(dernier);
    if (collisions(points, obstacles) === 0 || rayon === 0) return { chemin, points };
  }
  return { chemin: `M ${pt(trajet[0]!)}`, points: [...trajet] };
}

/**
 * Courbe de `a` vers `b`, du bord de `a` au bord de `b`, courbée vers l'INTÉRIEUR de l'anneau. `decalage` (px) écarte
 * la courbe de la ligne droite, du côté gauche de a vers b : donner le même décalage positif à l'aller et au retour
 * d'une même paire les place de part et d'autre (côtés opposés). Aucune courbe ne traverse le rectangle d'un AUTRE
 * nœud de `noeuds` (écart d'au moins 6 px) : si la forme préférée gêne, elle est creusée ou déportée, puis, en dernier
 * recours, remplacée par le plus court contournement des nœuds (angles arrondis).
 */
export function courbeLiaison(a: NoeudAnneau, b: NoeudAnneau, noeuds: readonly NoeudAnneau[], decalage = 0): CourbeLiaison {
  const obstacles = noeuds.filter((n) => n.id !== a.id && n.id !== b.id).map((n) => rectDe(n, MARGE_COURBE));
  const c = centreDe(noeuds);
  const m: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ab = soustraire(b, a);
  const dist = norme(ab) || 1;
  const u = { x: ab.x / dist, y: ab.y / dist };
  const gauche: Point = { x: -u.y, y: u.x };
  const versCentre = soustraire(c, m);
  const interieur = norme(versCentre) < 1e-6 ? gauche : unitaire(versCentre);
  const signe = decalage < 0 ? -1 : 1;

  // Candidats triés par coût : creux vers l'intérieur (k > 0) ou, en dernier, vers l'extérieur (k < 0), puis déport latéral.
  const creux = [0.32, 0.6, 1.0, 1.6, -0.5];
  const deports = [0, 1, -1, 2.5, -2.5].map((k) => k * 28);
  const candidats = creux.flatMap((k) => deports.map((lat) => ({ k, lat, cout: Math.abs(k) * dist * (k < 0 ? 3 : 1) + 1.5 * Math.abs(lat) + (Math.sign(lat) * signe < 0 ? 12 : 0) })))
    .sort((p, q) => p.cout - q.cout);

  let retenu: { chemin: string; points: Point[]; depart: Point; arrivee: Point; avantArrivee: Point; nb: number } | null = null;
  for (const { k, lat } of candidats) {
    const creuse = k < 0 ? k * dist : Math.max(k * dist, 24);
    const ctrl: Point = {
      x: m.x + interieur.x * creuse + gauche.x * (decalage + lat * signe),
      y: m.y + interieur.y * creuse + gauche.y * (decalage + lat * signe),
    };
    const courbe: Bezier = [sortieDuRectangle(a, ctrl), ctrl, sortieDuRectangle(b, ctrl)];
    const points = echantillonner(courbe);
    const nb = collisions(points, obstacles);
    if (nb === 0) { retenu = { chemin: cheminBezier(courbe), points, depart: courbe[0], arrivee: courbe[2], avantArrivee: courbe[1], nb }; break; }
  }

  if (!retenu) {
    const trajet = trajetContournement(a, b, noeuds);
    if (trajet) {
      // Le contournement longe le bord des rectangles élargis : tolérance de 0,5 px pour les arrondis de calcul.
      const tolerants = obstacles.map((r) => reduit(r, 0.5));
      // Décalage : essayé du côté gauche du trajet, puis réduit de moitié, puis nul (le côté des obstacles reste fermé).
      let meilleur: { chemin: string; points: Point[]; trajet: Point[]; nb: number } | null = null;
      for (const d of decalage === 0 ? [0] : [decalage, decalage / 2, 0]) {
        const t = d === 0 ? trajet : decalerTrajet(trajet, d);
        const { chemin, points } = arrondir(t, tolerants);
        const nb = collisions(points, tolerants);
        if (!meilleur || nb < meilleur.nb) meilleur = { chemin, points, trajet: t, nb };
        if (nb === 0) break;
      }
      const m2 = meilleur!;
      retenu = { chemin: m2.chemin, points: m2.points, depart: m2.trajet[0]!, arrivee: m2.trajet[m2.trajet.length - 1]!, avantArrivee: m2.trajet[m2.trajet.length - 2]!, nb: m2.nb };
    } else {
      // Aucun passage (nœuds collés, ce que dispositionAnneau ne produit pas) : droite entre les bords, signalée `libre: false`.
      const depart = sortieDuRectangle(a, b);
      const arrivee = sortieDuRectangle(b, a);
      const points = echantillonner([depart, m, arrivee]);
      retenu = { chemin: cheminBezier([depart, m, arrivee]), points, depart, arrivee, avantArrivee: m, nb: collisions(points, obstacles) };
    }
  }

  const tangente = soustraire(retenu.arrivee, retenu.avantArrivee);
  return {
    chemin: retenu.chemin,
    depart: retenu.depart,
    arrivee: retenu.arrivee,
    fleche: { x: retenu.arrivee.x, y: retenu.arrivee.y, angle: Math.atan2(tangente.y, tangente.x) },
    points: retenu.points,
    libre: retenu.nb === 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Recherche : services et agents
// ---------------------------------------------------------------------------------------------------------------

export interface EntreeRecherche {
  type: "service" | "agent";
  /** Slug du service (le service lui-même, ou celui de l'agent). */
  slug: string;
  nomService: string;
  /** Identifiant de l'agent ; vide pour un service. */
  id: string;
  nom: string;
  titre: string | null;
  /** Nom normalisé (sans accents, minuscules), pour le classement. */
  cleNom: string;
  /** Nom + titre normalisés, sur lesquels portent tous les mots cherchés. */
  cleTexte: string;
}

export interface IndexRecherche {
  entrees: EntreeRecherche[];
}

export interface ResultatRecherche {
  type: "service" | "agent";
  slug: string;
  nomService: string;
  id: string;
  nom: string;
  titre: string | null;
  score: number;
}

type AgentsParService = ReadonlyMap<string, readonly AgentHote[]> | Readonly<Record<string, readonly AgentHote[] | undefined>>;

/** Index en mémoire des services et des agents (une passe, aucun dessin) ; reconstruit à chaque chargement de service. */
export function indexRecherche(services: readonly ServiceCarte[], agentsParService: AgentsParService): IndexRecherche {
  const entrees: EntreeRecherche[] = [];
  const lire = (slug: string): readonly AgentHote[] => (agentsParService instanceof Map ? agentsParService.get(slug) : (agentsParService as Record<string, readonly AgentHote[] | undefined>)[slug]) ?? [];
  for (const s of services) {
    const cleNom = normaliser(s.nom);
    entrees.push({ type: "service", slug: s.slug, nomService: s.nom, id: "", nom: s.nom, titre: null, cleNom, cleTexte: cleNom });
    for (const a of lire(s.slug)) {
      const cle = normaliser(a.name);
      entrees.push({ type: "agent", slug: s.slug, nomService: s.nom, id: a.id, nom: a.name, titre: a.title, cleNom: cle, cleTexte: a.title ? `${cle} ${normaliser(a.title)}` : cle });
    }
  }
  return { entrees };
}

/** Résultats par défaut et plafond dur : la liste affichée reste courte quelle que soit la taille de l'index. */
export const RESULTATS_PAR_DEFAUT = 20;
export const RESULTATS_MAX = 200;

/**
 * Cherche dans l'index : sans accents ni casse, tous les mots doivent figurer dans le nom ou le titre. Classement :
 * nom commençant par la requête, puis mot du nom commençant par un mot cherché, puis le reste ; à égalité, les
 * services avant les agents, puis l'ordre alphabétique. Au plus `limite` résultats (borné à 200).
 */
export function chercher(index: IndexRecherche, texte: string, limite = RESULTATS_PAR_DEFAUT): ResultatRecherche[] {
  const max = Math.min(RESULTATS_MAX, Math.max(1, Math.floor(limite)));
  const requete = normaliser(texte);
  if (requete === "") return [];
  const mots = requete.split(/\s+/u);
  const retenus: ResultatRecherche[] = [];
  const pire = (): number => (retenus.length < max ? -Infinity : retenus[retenus.length - 1]!.score);
  for (const e of index.entrees) {
    let ok = true;
    for (const m of mots) if (!e.cleTexte.includes(m)) { ok = false; break; }
    if (!ok) continue;
    let score = e.type === "service" ? 1 : 0;
    if (e.cleNom.startsWith(requete)) score += 100;
    else if (mots.some((m) => e.cleNom.startsWith(m) || e.cleNom.includes(` ${m}`))) score += 50;
    else if (e.cleNom.includes(requete)) score += 20;
    if (score <= pire() && retenus.length >= max) continue;
    const r: ResultatRecherche = { type: e.type, slug: e.slug, nomService: e.nomService, id: e.id, nom: e.nom, titre: e.titre, score };
    // Insertion triée (score décroissant, puis nom) dans une liste bornée : O(limite) par résultat retenu.
    let i = retenus.length;
    while (i > 0 && (retenus[i - 1]!.score < score || (retenus[i - 1]!.score === score && retenus[i - 1]!.nom.localeCompare(r.nom, "fr") > 0))) i -= 1;
    retenus.splice(i, 0, r);
    if (retenus.length > max) retenus.pop();
  }
  return retenus;
}
