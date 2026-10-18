/**
 * Vue d'UN service de l'organigramme : l'arbre de ses agents (selon `reportsTo`) au centre, dessiné comme l'organigramme
 * du socle (cartes reliées par des traits orthogonaux fins), et ses services PARTENAIRES (liaisons métier seulement) en
 * nœuds satellites à gauche (entrants) et à droite (sortants), reliés par des flèches. Le composant est autonome : il ne
 * charge rien, tout lui est donné (agents, flux, services) ; le parent branche `ouvrirService` et `retour`.
 *
 * L'arbre est une toile qui se zoome et se déplace (molette avec Ctrl, glisser, pincement, boutons « + », « − » et
 * « Ajuster », clavier + / − / 0 et flèches) ; le dessin s'ouvre ajusté à la largeur du cadre, jamais sous 60 %.
 *
 * Tenue à l'échelle (un service peut compter 10 000 agents) :
 * - les enfants d'un responsable se rangent en lignes : autant par ligne que la largeur du cadre en laisse (mesurée par
 *   le parent de la disposition), les suivants passent à la ligne d'en dessous, reliés par un trait orthogonal ;
 * - au-delà de 40 enfants, seuls les 40 premiers sont dessinés, suivis d'un groupe repliable « +N agents » ;
 * - au-delà de 200 cartes, seules les cartes (et traits) visibles dans la fenêtre de la toile sont rendues.
 * La disposition (`disposerArbreAgents`) et celle des satellites (`disposerSatellites`) sont des fonctions PURES.
 * Limite connue : la disposition est récursive, une chaîne de plusieurs milliers de niveaux n'est pas prévue.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent as ToucheClavier, type PointerEvent as EvenementPointeur, type RefObject } from "react";
import { LienHote } from "./composants.js";
import { nombre } from "./format.js";
import { compterStatuts, familleStatut, libelleStatutAgent, type AgentHote } from "./organigramme-arbre.js";
import { fluxMetier, liaisonsDe, objetsDuFlux, volumeDuFlux, type FluxBrut, type LiaisonPartenaire, type ServiceCarte } from "./organigramme-flux.js";
import { STYLES_ORGANIGRAMME_SERVICE } from "./styles-organigramme-service.js";
import { useTelephone } from "./telephone.js";

// ---------------------------------------------------------------------------------------------------------------
// Disposition de l'arbre des agents (pure)
// ---------------------------------------------------------------------------------------------------------------

export const CARTE_AGENT: { largeur: number; hauteur: number } = { largeur: 188, hauteur: 60 };
/** Au-delà de ce nombre d'enfants directs, les suivants sont regroupés sous « +N agents ». */
export const ENFANTS_AVANT_GROUPE = 40;
/** Au-delà de ce nombre de cartes, seules les cartes visibles sont rendues. */
export const CARTES_AVANT_VIRTUALISATION = 200;
/** Largeur du cadre supposée quand elle n'est pas encore mesurée (tests, premier rendu). */
export const LARGEUR_PAR_DEFAUT = 1100;

const ECART_H = 16;
const ECART_V = 40;
/** Espace vertical entre deux lignes d'enfants d'un même responsable (la barre de liaison passe au milieu). */
const ECART_LIGNE = 28;
const MARGE = 16;
const RACINES = "__racines__";

export interface CarteArbre {
  /** Identifiant de l'agent, ou `groupe:<id du responsable>` pour le groupe « +N agents » / « Replier ». */
  id: string;
  genre: "agent" | "groupe";
  agent: AgentHote | null;
  /** Coin haut gauche. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  profondeur: number;
  /** Groupe seulement : responsable concerné, nombre d'agents cachés (replié) et état. */
  responsable?: string;
  restants?: number;
  deplie?: boolean;
}

export interface TraitArbre {
  id: string;
  /** Chemin SVG (segments orthogonaux). */
  d: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DispositionArbre {
  largeur: number;
  hauteur: number;
  /** Dans l'ordre de lecture (parcours en profondeur). */
  cartes: CarteArbre[];
  traits: TraitArbre[];
}

const collateur = new Intl.Collator("fr");
const comparerAgents = (a: AgentHote, b: AgentHote): number => {
  const ca = a.role === "ceo";
  const cb = b.role === "ceo";
  if (ca !== cb) return ca ? -1 : 1;
  return collateur.compare(a.name, b.name);
};

/** Enfants retenus de chaque agent (sans boucle) et racines ; un cycle de `reportsTo` ne fait jamais boucler. */
function structure(agents: readonly AgentHote[]): { enfants: Map<string, AgentHote[]>; racines: AgentHote[] } {
  const parId = new Map<string, AgentHote>();
  for (const a of agents) parId.set(a.id, a);
  const candidats = new Map<string, AgentHote[]>();
  const racines: AgentHote[] = [];
  for (const a of agents) {
    if (a.reportsTo && a.reportsTo !== a.id && parId.has(a.reportsTo)) {
      const l = candidats.get(a.reportsTo);
      if (l) l.push(a);
      else candidats.set(a.reportsTo, [a]);
    } else racines.push(a);
  }
  for (const l of candidats.values()) if (l.length > 1) l.sort(comparerAgents);
  racines.sort(comparerAgents);
  const enfants = new Map<string, AgentHote[]>();
  const vus = new Set<string>();
  const explorer = (racine: AgentHote) => {
    const pile = [racine];
    vus.add(racine.id);
    while (pile.length > 0) {
      const a = pile.pop() as AgentHote;
      const retenus: AgentHote[] = [];
      for (const e of candidats.get(a.id) ?? []) {
        if (vus.has(e.id)) continue;
        vus.add(e.id);
        retenus.push(e);
        pile.push(e);
      }
      if (retenus.length > 0) enfants.set(a.id, retenus);
    }
  };
  for (const r of racines) explorer(r);
  // Cycle : personne n'y est racine, on prend le premier non atteint de chaque boucle.
  for (const a of [...agents].sort(comparerAgents)) {
    if (!vus.has(a.id)) {
      racines.push(a);
      explorer(a);
    }
  }
  return { enfants, racines };
}

/** Responsables dont la liste d'enfants dépasse le seuil du groupe, parmi les ancêtres de `agentId` (à déplier pour le montrer). */
export function ancetresDe(agents: readonly AgentHote[], agentId: string): string[] {
  const parId = new Map<string, AgentHote>();
  for (const a of agents) parId.set(a.id, a);
  const res: string[] = [];
  let courant = parId.get(agentId);
  for (let i = 0; courant && i <= agents.length; i++) {
    const pere: string | null = courant.reportsTo;
    if (!pere || pere === courant.id) {
      res.push(RACINES);
      break;
    }
    res.push(pere);
    courant = parId.get(pere);
  }
  return res;
}

interface Visible {
  id: string;
  agent: AgentHote | null;
  groupe?: { responsable: string; restants: number; deplie: boolean };
}

/**
 * Dispose l'arbre : racine en haut, enfants dessous en lignes de `largeurDispo` au plus (autant par ligne que la largeur
 * en laisse, les suivants passent à la ligne d'en dessous) ; au-delà de 40 enfants, groupe « +N agents » sauf si le
 * responsable est dans `depliees`. Aucune carte ne chevauche une autre.
 *
 * Traits (tous orthogonaux) : une tige sous le responsable, puis un trait par ligne d'enfants (barre horizontale et
 * descentes vers chaque carte). Quand il y a plusieurs lignes, une colonne verticale dans la marge à gauche de la première
 * carte relie la barre de chaque ligne à celle de la première.
 */
export function disposerArbreAgents(agents: readonly AgentHote[], depliees: ReadonlySet<string> = new Set(), largeurDispo = LARGEUR_PAR_DEFAUT): DispositionArbre {
  const { enfants, racines } = structure(agents);
  const L = CARTE_AGENT.largeur;
  const H = CARTE_AGENT.hauteur;
  /** Largeur d'une ligne d'enfants : au moins une carte, même si le cadre est plus étroit. */
  const limite = Math.max(L, largeurDispo - 2 * MARGE);
  const cartes: CarteArbre[] = [];
  const traits: TraitArbre[] = [];
  let maxX = 0;
  let maxY = 0;

  const visibles = (id: string): Visible[] => {
    const liste = id === RACINES ? racines : (enfants.get(id) ?? []);
    if (liste.length <= ENFANTS_AVANT_GROUPE) return liste.map((a) => ({ id: a.id, agent: a }));
    const deplie = depliees.has(id);
    const montres: Visible[] = (deplie ? liste : liste.slice(0, ENFANTS_AVANT_GROUPE)).map((a) => ({ id: a.id, agent: a }));
    montres.push({ id: `groupe:${id}`, agent: null, groupe: { responsable: id, restants: liste.length - ENFANTS_AVANT_GROUPE, deplie } });
    return montres;
  };

  const largeurs = new Map<string, number>();
  const lignesCache = new Map<string, Visible[][]>();

  /** Enfants d'un responsable, rangés en lignes : on passe à la ligne quand la suivante ne tient plus dans `limite`. */
  const lignesDe = (id: string): Visible[][] => {
    const connues = lignesCache.get(id);
    if (connues) return connues;
    const lignes: Visible[][] = [];
    let courante: Visible[] = [];
    let largeurCourante = 0;
    for (const e of visibles(id)) {
      const w = mesurer(e);
      if (courante.length > 0 && largeurCourante + ECART_H + w > limite) {
        lignes.push(courante);
        courante = [];
        largeurCourante = 0;
      }
      largeurCourante += (courante.length > 0 ? ECART_H : 0) + w;
      courante.push(e);
    }
    if (courante.length > 0) lignes.push(courante);
    lignesCache.set(id, lignes);
    return lignes;
  };
  const largeurLigne = (ligne: readonly Visible[]): number => ligne.reduce((s, e, i) => s + mesurer(e) + (i > 0 ? ECART_H : 0), 0);

  // Largeur d'un sous-arbre : la plus large de ses lignes d'enfants, au moins une carte.
  const mesurer = (v: Visible): number => {
    const connue = largeurs.get(v.id);
    if (connue !== undefined) return connue;
    let w = L;
    if (v.agent) for (const ligne of lignesDe(v.id)) w = Math.max(w, largeurLigne(ligne));
    largeurs.set(v.id, w);
    return w;
  };

  const ajouterCarte = (v: Visible, x: number, y: number, profondeur: number): CarteArbre => {
    const c: CarteArbre = { id: v.id, genre: v.groupe ? "groupe" : "agent", agent: v.agent, x, y, largeur: L, hauteur: H, profondeur };
    if (v.groupe) {
      c.responsable = v.groupe.responsable;
      c.restants = v.groupe.restants;
      c.deplie = v.groupe.deplie;
    }
    cartes.push(c);
    maxX = Math.max(maxX, x + L);
    maxY = Math.max(maxY, y + H);
    return c;
  };
  const ajouterTrait = (id: string, d: string, x0: number, y0: number, x1: number, y1: number) =>
    traits.push({ id, d, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });

  /**
   * Range des lignes de sous-arbres à partir de (x0, haut) ; une ligne seule est centrée dans la tranche `largeur`, plusieurs
   * lignes sont alignées à gauche. `ecartDessus` : espace entre la ligne et ce qui est au-dessus (la barre passe au milieu).
   * Rend le bas du dessin (y).
   */
  const placerLignes = (id: string, lignes: readonly Visible[][], x0: number, largeur: number, haut: number, ecartDessus: number, profondeur: number, px: number | null): number => {
    const multiple = lignes.length > 1;
    const colonne = x0 - ECART_H / 2;
    let cursor = haut;
    let bas = haut;
    let premiereBarre = 0;
    let derniereBarre = 0;
    lignes.forEach((ligne, n) => {
      const barre = n === 0 ? cursor - ecartDessus / 2 : cursor - ECART_LIGNE / 2;
      const total = largeurLigne(ligne);
      let cx = multiple ? x0 : x0 + (largeur - total) / 2;
      let basLigne = cursor;
      const centres: number[] = [];
      for (const e of ligne) {
        const w = mesurer(e);
        centres.push(cx + w / 2);
        basLigne = Math.max(basLigne, placerArbre(e, cx, cursor, profondeur));
        cx += w + ECART_H;
      }
      if (px !== null) {
        let xa = Math.min(centres[0] as number, n === 0 ? px : Infinity);
        const xb = Math.max(centres[centres.length - 1] as number, n === 0 ? px : -Infinity);
        if (multiple) xa = Math.min(xa, colonne);
        let d = `M${xa} ${barre}H${xb}`;
        for (const c of centres) d += `M${c} ${barre}V${cursor}`;
        ajouterTrait(`ligne:${id}:${n}`, d, xa, barre, xb, cursor);
        if (n === 0) premiereBarre = barre;
        derniereBarre = barre;
      }
      bas = basLigne;
      cursor = basLigne + ECART_LIGNE;
    });
    if (px !== null && multiple) ajouterTrait(`colonne:${id}`, `M${colonne} ${premiereBarre}V${derniereBarre}`, colonne, premiereBarre, colonne, derniereBarre);
    return bas;
  };

  /** Sous-arbre de `v` dans la tranche qui commence à x0 : `v` centré, ses enfants dessous. Rend le bas du sous-arbre. */
  const placerArbre = (v: Visible, x0: number, y: number, profondeur: number): number => {
    const w = mesurer(v);
    const x = x0 + (w - L) / 2;
    ajouterCarte(v, x, y, profondeur);
    const lignes = v.agent ? lignesDe(v.id) : [];
    if (lignes.length === 0) return y + H;
    const px = x + L / 2;
    ajouterTrait(`tige:${v.id}`, `M${px} ${y + H}V${y + H + ECART_V / 2}`, px, y + H, px, y + H + ECART_V / 2);
    return placerLignes(v.id, lignes, x0, w, y + H + ECART_V, ECART_V, profondeur + 1, px);
  };

  const tete = visibles(RACINES);
  if (tete.length === 1 && tete[0]) placerArbre(tete[0], MARGE, MARGE, 0);
  else if (tete.length > 0) {
    // Plusieurs racines (pas de coordinateur unique) : en lignes, sans trait de liaison.
    const lignes = lignesDe(RACINES);
    placerLignes(RACINES, lignes, MARGE, Math.max(...lignes.map(largeurLigne)), MARGE, ECART_LIGNE, 0, null);
  }
  return { largeur: Math.max(maxX + MARGE, 2 * MARGE), hauteur: Math.max(maxY + MARGE, 2 * MARGE), cartes, traits };
}

export interface Fenetre {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/** Cartes et traits à rendre : tout jusqu'à 200 cartes, sinon ceux qui touchent la fenêtre (avec `marge` px autour). */
export function elementsVisibles(dispo: DispositionArbre, fenetre: Fenetre, marge = 240, toujours: string | null = null): { cartes: CarteArbre[]; traits: TraitArbre[] } {
  if (dispo.cartes.length <= CARTES_AVANT_VIRTUALISATION) return { cartes: dispo.cartes, traits: dispo.traits };
  const x0 = fenetre.x - marge;
  const y0 = fenetre.y - marge;
  const x1 = fenetre.x + fenetre.largeur + marge;
  const y1 = fenetre.y + fenetre.hauteur + marge;
  return {
    cartes: dispo.cartes.filter((c) => c.id === toujours || (c.x < x1 && c.x + c.largeur > x0 && c.y < y1 && c.y + c.hauteur > y0)),
    traits: dispo.traits.filter((t) => t.x0 <= x1 && t.x1 >= x0 && t.y0 <= y1 && t.y1 >= y0),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Libellés partagés
// ---------------------------------------------------------------------------------------------------------------

const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
const echanges = (n: number) => pluriel(n, "échange", "échanges");

// ---------------------------------------------------------------------------------------------------------------
// Disposition des satellites (pure)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Nœud satellite : `hauteur` est celle d'un nom sur une ligne ; chaque ligne de nom ou de détail en plus ajoute
 * `ligne`. Les satellites sont posés à la hauteur de leur contenu (jamais rognés) : `pxParCaractere` sert à estimer
 * le retour à la ligne du nom et du détail dans la largeur utile.
 */
export const SATELLITE = { largeur: 176, hauteur: 50, ligne: 18, ecart: 12, pxParCaractere: 7.8, pxParCaractereDetail: 6.6 } as const;
export const GOUTTIERE = 56;
export const HAUTEUR_MIN_FIGURE = 300;
/** Au-delà de ce nombre de satellites dans une colonne, la colonne défile. */
export const SATELLITES_VISIBLES_MAX = 7;
const BORDURE_SATELLITE = 22;

/** Nombre de lignes qu'occupe `texte` dans `largeurUtile` px, à `px` par caractère (au moins une). */
const lignesDe = (texte: string, largeurUtile: number, px: number): number => Math.max(1, Math.ceil((texte.length * px) / largeurUtile));

/** Seconde ligne d'un satellite : nombre d'échanges, puis l'approbation éventuelle. */
export const detailSatellite = (total: number, approbation: boolean): string => `${echanges(total)}${approbation ? " · approbation" : ""}`;

export interface Satellite {
  slug: string;
  nom: string;
  cote: "gauche" | "droite";
  /** Centre vertical, dans le repère de la colonne de son côté. */
  y: number;
  /** Hauteur estimée du nœud (nom complet sur une ou plusieurs lignes, puis le détail). */
  hauteur: number;
  liaison: LiaisonPartenaire;
  /** Nombre d'échanges (objets) que le service peut demander au partenaire, et que le partenaire peut lui demander. */
  sortants: number;
  entrants: number;
}

export interface DispositionSatellites {
  /** Hauteur de la figure : celle de l'arbre, ou de quoi loger les `SATELLITES_VISIBLES_MAX` premiers de la colonne la plus chargée. */
  hauteur: number;
  gauche: Satellite[];
  droite: Satellite[];
  /** Hauteur du contenu de chaque colonne : `hauteur` au moins, plus quand la colonne défile. */
  contenuGauche: number;
  contenuDroite: number;
}

const volumeDe = (l: readonly FluxBrut[]) => l.reduce((s, f) => s + volumeDuFlux(f), 0);

/**
 * Entrants (le partenaire demande au service) à gauche, sortants à droite ; un partenaire dans les deux sens va du côté
 * de son plus fort volume, et à égalité dans la colonne la moins chargée (puis à droite si elles le sont autant).
 * `hauteurMin` : hauteur que l'arbre réclame déjà ; au-delà de `SATELLITES_VISIBLES_MAX` satellites, la colonne défile.
 */
export function disposerSatellites(liaisons: readonly LiaisonPartenaire[], nomDe: (slug: string) => string, hauteurMin = 0): DispositionSatellites {
  const utile = SATELLITE.largeur - BORDURE_SATELLITE;
  const items = liaisons.map((l) => {
    const sortants = volumeDe(l.sortants);
    const entrants = volumeDe(l.entrants);
    const nom = nomDe(l.partenaire);
    const hauteur = SATELLITE.hauteur + SATELLITE.ligne * (lignesDe(nom, utile, SATELLITE.pxParCaractere) - 1 + lignesDe(detailSatellite(sortants + entrants, l.approbation), utile, SATELLITE.pxParCaractereDetail) - 1);
    const cote: "gauche" | "droite" | null = entrants > sortants ? "gauche" : sortants > entrants ? "droite" : null;
    return { l, nom, sortants, entrants, hauteur, cote };
  });
  // Les égalités vont, une à une, dans la colonne la moins chargée.
  let nG = items.filter((i) => i.cote === "gauche").length;
  let nD = items.filter((i) => i.cote === "droite").length;
  const cotes = items.map((i): "gauche" | "droite" => {
    if (i.cote) return i.cote;
    if (nG < nD) {
      nG += 1;
      return "gauche";
    }
    nD += 1;
    return "droite";
  });
  const colonne = (cote: "gauche" | "droite") => items.filter((_, k) => cotes[k] === cote);
  const contenu = (col: readonly { hauteur: number }[]) => col.reduce((s, i) => s + i.hauteur, 0) + SATELLITE.ecart * Math.max(0, col.length - 1);
  const visibles = (col: readonly { hauteur: number }[]) => contenu(col.slice(0, SATELLITES_VISIBLES_MAX));
  const colG = colonne("gauche");
  const colD = colonne("droite");
  const hauteur = Math.max(HAUTEUR_MIN_FIGURE, hauteurMin, Math.min(Math.max(contenu(colG), contenu(colD)), Math.max(visibles(colG), visibles(colD))));
  const placer = (col: typeof items, cote: "gauche" | "droite"): { satellites: Satellite[]; hauteurColonne: number } => {
    const total = contenu(col);
    const hauteurColonne = Math.max(hauteur, total);
    // Colonne qui tient : espaces égaux sur toute la hauteur ; colonne qui défile : satellites contigus.
    const vide = col.length > 0 && total <= hauteur ? (hauteur - col.reduce((s, i) => s + i.hauteur, 0)) / col.length : SATELLITE.ecart;
    let haut = total <= hauteur ? vide / 2 : 0;
    const satellites = col.map((i) => {
      const s: Satellite = { slug: i.l.partenaire, nom: i.nom, cote, y: haut + i.hauteur / 2, hauteur: i.hauteur, liaison: i.l, sortants: i.sortants, entrants: i.entrants };
      haut += i.hauteur + vide;
      return s;
    });
    return { satellites, hauteurColonne };
  };
  const g = placer(colG, "gauche");
  const d = placer(colD, "droite");
  return { hauteur, gauche: g.satellites, droite: d.satellites, contenuGauche: g.hauteurColonne, contenuDroite: d.hauteurColonne };
}

/** Épaisseur du trait selon le nombre d'échanges (1 à 5 px). */
export const epaisseurPourVolume = (v: number): number => Math.min(5, Math.max(1, 1 + Math.log2(Math.max(v, 1))));

// ---------------------------------------------------------------------------------------------------------------
// Toile : transformation de la vue (pure)
// ---------------------------------------------------------------------------------------------------------------

/** Transformation de la vue : le plan est translaté de (x, y) puis agrandi de `echelle`. */
export interface Transformation {
  echelle: number;
  x: number;
  y: number;
}

/** Zoom arrière limité à 25 % : en dessous, plus rien n'est lisible et la fenêtre de rendu couvrirait tout l'arbre. */
export const ECHELLE_MIN = 0.25;
export const ECHELLE_MAX = 2;
/** Échelle plancher à l'ouverture : un grand arbre garde des cartes lisibles et se parcourt en le déplaçant. */
export const ECHELLE_OUVERTURE_MIN = 0.6;
export const bornerEchelle = (e: number): number => Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, e));

/**
 * Dessin visible et aligné en haut au centre de la vue, jamais agrandi au-delà de 100 % ni réduit sous `plancher`.
 * Le dessin porte déjà ses marges (16 px de chaque côté) : on ne les compte pas une seconde fois.
 */
export function transformationAjustee(dispo: Pick<DispositionArbre, "largeur" | "hauteur">, vueL: number, vueH: number, plancher = ECHELLE_MIN): Transformation {
  const echelle = bornerEchelle(Math.max(plancher, Math.min(1, vueL / dispo.largeur, vueH / dispo.hauteur)));
  return { echelle, x: Math.max(0, (vueL - dispo.largeur * echelle) / 2), y: 0 };
}

/** Centre une carte dans la vue, avec au moins l'échelle donnée. */
export function transformationCentree(carte: Pick<CarteArbre, "x" | "y" | "largeur" | "hauteur">, vueL: number, vueH: number, echelleMin = 0.8, actuelle = 0): Transformation {
  const echelle = bornerEchelle(Math.max(echelleMin, actuelle));
  return { echelle, x: vueL / 2 - (carte.x + carte.largeur / 2) * echelle, y: vueH / 2 - (carte.y + carte.hauteur / 2) * echelle };
}

/** Change l'échelle en gardant fixe le point (px, py) de la vue. */
export function zoomerAutour(t: Transformation, facteur: number, px: number, py: number): Transformation {
  const echelle = bornerEchelle(t.echelle * facteur);
  const f = echelle / t.echelle;
  return { echelle, x: px - (px - t.x) * f, y: py - (py - t.y) * f };
}

/** Partie du dessin que la vue montre, dans les coordonnées du dessin (sert à la virtualisation). */
export function fenetreVisible(t: Transformation, vueL: number, vueH: number): Fenetre {
  return { x: -t.x / t.echelle, y: -t.y / t.echelle, largeur: vueL / t.echelle, hauteur: vueH / t.echelle };
}

// ---------------------------------------------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------------------------------------------

export interface PropsVueServiceOrganigramme {
  service: { slug: string; nom: string; companyId: string; prefixe: string; estDirection?: boolean };
  agents: AgentHote[];
  flux: FluxBrut[];
  services: ServiceCarte[];
  agentMisEnEvidence?: string | null;
  ouvrirService: (slug: string) => void;
  retour: () => void;
}

const FENETRE_REPLI: Fenetre = { x: 0, y: 0, largeur: LARGEUR_PAR_DEFAUT, hauteur: 700 };
const PAGE_TELEPHONE = 200;
/** Hauteur maximale que la figure prend pour montrer l'arbre (au-delà, on déplace le dessin). */
const HAUTEUR_MAX_ARBRE = 640;
/** Seuil en pixels avant qu'un appui devienne un glissement (un simple clic reste un clic). */
const SEUIL_GLISSEMENT = 4;
const PAS_CLAVIER = 80;
const FACTEUR_ZOOM = 1.25;

function titreCourt(a: AgentHote): string {
  if (a.title) return a.title;
  return a.role === "ceo" ? "Coordinateur" : "";
}

function CarteAgent({ c, prefixe, misEnEvidence, basculer }: { c: CarteArbre; prefixe: string; misEnEvidence: boolean; basculer: (id: string) => void }) {
  const style = { left: c.x, top: c.y, width: c.largeur, height: c.hauteur };
  if (c.genre === "groupe") {
    const responsable = c.responsable ?? "";
    return (
      <button type="button" className="atl-orgs-carte atl-orgs-groupe" style={style} aria-expanded={c.deplie === true} onClick={() => basculer(responsable)}>
        {c.deplie ? "Replier le groupe" : `+${nombre(c.restants ?? 0)} agents`}
      </button>
    );
  }
  const a = c.agent as AgentHote;
  const t = titreCourt(a);
  return (
    <div className="atl-orgs-carte" style={style} data-famille={familleStatut(a.status)} data-agent={a.id} data-mis-en-evidence={misEnEvidence || undefined}>
      <LienHote vers={`/${prefixe}/agents/${encodeURIComponent(a.id)}`} className="atl-orgs-lien">
        {a.name}
      </LienHote>
      <span className="atl-orgs-meta">
        {t ? <span className="atl-orgs-titre">{t}</span> : null}
        <span className="atl-orgs-statut" data-famille={familleStatut(a.status)}>
          {libelleStatutAgent(a.status)}
        </span>
      </span>
    </div>
  );
}

function Fleches({ sats, cote, largeur }: { sats: Satellite[]; cote: "gauche" | "droite"; largeur: number }) {
  // Gouttière entre un satellite et le bloc : à gauche le satellite est en x = 0, à droite c'est le bloc.
  const xSat = cote === "gauche" ? 0 : largeur;
  const xBloc = cote === "gauche" ? largeur : 0;
  return (
    <>
      {sats.map((s) => {
        const deux = s.sortants > 0 && s.entrants > 0;
        const tracer = (sens: "sortant" | "entrant", volume: number, decalage: number) => {
          const y = s.y + decalage;
          // Sortant : du bloc vers le satellite ; entrant : du satellite vers le bloc.
          const depart = sens === "sortant" ? xBloc : xSat;
          const arrivee = sens === "sortant" ? xSat : xBloc;
          const dir = arrivee > depart ? 1 : -1;
          const pointe = arrivee - dir * 1;
          const titre = sens === "sortant" ? `Demandes de ce service vers ${s.nom} : ${echanges(volume)}` : `Demandes de ${s.nom} vers ce service : ${echanges(volume)}`;
          return (
            <g key={sens} className="atl-orgs-fleche" data-sens={sens}>
              <title>{titre}</title>
              <line x1={depart} y1={y} x2={arrivee - dir * 8} y2={y} strokeWidth={epaisseurPourVolume(volume)} />
              <path d={`M${pointe} ${y}l${-dir * 9} -5l0 10z`} className="atl-orgs-pointe" />
            </g>
          );
        };
        return (
          <g key={s.slug}>
            {s.sortants > 0 ? tracer("sortant", s.sortants, deux ? -7 : 0) : null}
            {s.entrants > 0 ? tracer("entrant", s.entrants, deux ? 7 : 0) : null}
          </g>
        );
      })}
    </>
  );
}

function NoeudSatellite({ s, ouvrir }: { s: Satellite; ouvrir: (slug: string) => void }) {
  const sens = s.sortants > 0 && s.entrants > 0 ? "dans les deux sens" : s.sortants > 0 ? "vers ce partenaire" : "depuis ce partenaire";
  const total = s.sortants + s.entrants;
  return (
    <button
      type="button"
      className="atl-orgs-satellite"
      data-cote={s.cote}
      style={{ top: s.y - s.hauteur / 2, minHeight: s.hauteur }}
      onClick={() => ouvrir(s.slug)}
      aria-label={`Ouvrir le service ${s.nom} (${echanges(total)}, ${sens}${s.liaison.approbation ? ", approbation humaine" : ""})`}
    >
      <span className="atl-orgs-satellite-nom">{s.nom}</span>
      <span className="atl-orgs-satellite-detail">{detailSatellite(total, s.liaison.approbation)}</span>
    </button>
  );
}

/** Un côté de la figure : la colonne de satellites et sa gouttière de flèches, qui défilent ensemble au-delà de 7 satellites. */
function Flanc({ sats, cote, hauteur, contenu, ouvrir }: { sats: Satellite[]; cote: "gauche" | "droite"; hauteur: number; contenu: number; ouvrir: (slug: string) => void }) {
  const defile = contenu > hauteur;
  const colonne = (
    <div className="atl-orgs-colonne">
      {sats.map((s) => (
        <NoeudSatellite key={s.slug} s={s} ouvrir={ouvrir} />
      ))}
    </div>
  );
  const gouttiere = (
    <svg className="atl-orgs-gouttiere" width={GOUTTIERE} height={contenu} aria-hidden="true">
      <Fleches sats={sats} cote={cote} largeur={GOUTTIERE} />
    </svg>
  );
  return (
    <div
      className="atl-orgs-flanc"
      data-cote={cote}
      data-defile={defile || undefined}
      style={{ height: hauteur }}
      {...(defile ? { tabIndex: 0, role: "region", "aria-label": `Services partenaires ${cote === "gauche" ? "qui demandent à ce service" : "que ce service demande"}, liste défilante` } : {})}
    >
      <div className="atl-orgs-flanc-contenu" style={{ height: contenu, gridTemplateColumns: cote === "gauche" ? `${SATELLITE.largeur}px ${GOUTTIERE}px` : `${GOUTTIERE}px ${SATELLITE.largeur}px` }}>
        {cote === "gauche" ? (
          <>
            {colonne}
            {gouttiere}
          </>
        ) : (
          <>
            {gouttiere}
            {colonne}
          </>
        )}
      </div>
    </div>
  );
}

function PanneauEchanges({ liaisons, nomDe, ouvrir }: { liaisons: readonly LiaisonPartenaire[]; nomDe: (slug: string) => string; ouvrir: (slug: string) => void }) {
  if (liaisons.length === 0) return <p className="atl-orgs-vide">Ce service n'a pas d'échange métier avec d'autres services.</p>;
  return (
    <div className="atl-orgs-echanges">
      {liaisons.map((l) => (
        <section key={l.partenaire} className="atl-orgs-partenaire" aria-label={`Échanges avec ${nomDe(l.partenaire)}`}>
          <h4 className="atl-orgs-partenaire-titre">
            <button type="button" className="atl-orgs-lien-service" onClick={() => ouvrir(l.partenaire)}>
              {nomDe(l.partenaire)}
            </button>
            <span className="atl-orgs-compteur">{echanges(l.volume)}</span>
            {l.approbation ? <span className="atl-orgs-etiquette">approbation humaine</span> : null}
          </h4>
          <ul className="atl-orgs-objets">
            {l.sortants.flatMap((f) =>
              objetsDuFlux(f).map((o) => (
                <li key={`s-${f.source}-${f.cible}-${o}`}>
                  <span className="atl-orgs-sens" data-sens="sortant">Vers {nomDe(l.partenaire)}</span> {o}
                  {f.approbationHumaine ? " (approbation humaine)" : ""}
                </li>
              )),
            )}
            {l.entrants.flatMap((f) =>
              objetsDuFlux(f).map((o) => (
                <li key={`e-${f.source}-${f.cible}-${o}`}>
                  <span className="atl-orgs-sens" data-sens="entrant">Depuis {nomDe(l.partenaire)}</span> {o}
                  {f.approbationHumaine ? " (approbation humaine)" : ""}
                </li>
              )),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ListeTelephone({ dispo, prefixe, misEnEvidence, basculer }: { dispo: DispositionArbre; prefixe: string; misEnEvidence: string | null; basculer: (id: string) => void }) {
  const indexMis = misEnEvidence ? dispo.cartes.findIndex((c) => c.id === misEnEvidence) : -1;
  const [limite, setLimite] = useState(PAGE_TELEPHONE);
  const affiche = Math.max(limite, indexMis + 1);
  const cartes = dispo.cartes.slice(0, affiche);
  return (
    <div className="atl-orgs-liste-bloc">
      <ul className="atl-orgs-liste" aria-label="Agents du service">
        {cartes.map((c) => (
          <li key={c.id} className="atl-orgs-ligne" style={{ paddingLeft: `${0.75 + c.profondeur * 1}rem` }} data-mis-en-evidence={c.id === misEnEvidence || undefined} data-agent={c.agent?.id}>
            {c.genre === "groupe" ? (
              <button type="button" className="atl-orgs-groupe-ligne" aria-expanded={c.deplie === true} onClick={() => basculer(c.responsable ?? "")}>
                {c.deplie ? "Replier le groupe" : `+${nombre(c.restants ?? 0)} agents`}
              </button>
            ) : (
              <>
                <LienHote vers={`/${prefixe}/agents/${encodeURIComponent((c.agent as AgentHote).id)}`} className="atl-orgs-lien">
                  {(c.agent as AgentHote).name}
                </LienHote>
                <span className="atl-orgs-statut" data-famille={familleStatut((c.agent as AgentHote).status)}>
                  {libelleStatutAgent((c.agent as AgentHote).status)}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {affiche < dispo.cartes.length ? (
        <button type="button" className="atl-bouton" onClick={() => setLimite(affiche + PAGE_TELEPHONE)}>
          Afficher {nombre(Math.min(PAGE_TELEPHONE, dispo.cartes.length - affiche))} agents de plus
        </button>
      ) : null}
    </div>
  );
}

/** Cartes et traits du dessin : mémorisé, donc non redessiné par un zoom ou un déplacement (la transformation est directe). */
const Plan = memo(function Plan({ cartes, traits, largeur, hauteur, prefixe, misEnEvidence, basculer }: { cartes: CarteArbre[]; traits: TraitArbre[]; largeur: number; hauteur: number; prefixe: string; misEnEvidence: string | null; basculer: (id: string) => void }) {
  return (
    <>
      <svg className="atl-orgs-traits" width={largeur} height={hauteur} aria-hidden="true" focusable="false">
        {traits.map((t) => (
          <path key={t.id} d={t.d} />
        ))}
      </svg>
      {cartes.map((c) => (
        <CarteAgent key={c.id} c={c} prefixe={prefixe} misEnEvidence={c.id === misEnEvidence} basculer={basculer} />
      ))}
    </>
  );
});

/** Taille de l'élément, relue à chaque redimensionnement (rien tant que `actif` est faux ou sans ResizeObserver). */
function useTailleVue(ref: RefObject<HTMLElement | null>, actif: boolean): { l: number; h: number } {
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !actif) return;
    const lire = () => {
      const l = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setTaille((a) => (a.l === l && a.h === h ? a : { l, h }));
    };
    lire();
    if (typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(lire);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [ref, actif]);
  return taille;
}

export function VueServiceOrganigramme(props: PropsVueServiceOrganigramme) {
  const { service, agents, flux, services, agentMisEnEvidence = null, ouvrirService, retour } = props;
  const telephone = useTelephone();
  const [depliees, setDepliees] = useState<ReadonlySet<string>>(() => new Set());
  const basculer = useCallback((id: string) => {
    setDepliees((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });
  }, []);

  // Un agent mis en évidence caché dans un groupe : on déplie ses responsables.
  useLayoutEffect(() => {
    if (!agentMisEnEvidence) return;
    const ancetres = ancetresDe(agents, agentMisEnEvidence);
    setDepliees((avant) => (ancetres.every((a) => avant.has(a)) ? avant : new Set([...avant, ...ancetres])));
  }, [agentMisEnEvidence, agents]);

  const vue = useRef<HTMLDivElement | null>(null);
  const plan = useRef<HTMLDivElement | null>(null);
  const taille = useTailleVue(vue, !telephone);
  const largeurArbre = taille.l > 0 ? taille.l : LARGEUR_PAR_DEFAUT;

  const dispo = useMemo(() => disposerArbreAgents(agents, depliees, largeurArbre), [agents, depliees, largeurArbre]);
  const statuts = useMemo(() => compterStatuts(agents), [agents]);
  const nomPar = useMemo(() => new Map(services.map((s) => [s.slug, s.nom])), [services]);
  const nomDe = useCallback((slug: string) => nomPar.get(slug) ?? slug, [nomPar]);
  const liaisons = useMemo(() => liaisonsDe(service.slug, fluxMetier(flux)), [service.slug, flux]);
  // La figure a la hauteur de l'arbre (plafonnée) ; les colonnes de satellites s'y logent ou défilent.
  const hauteurArbre = Math.max(HAUTEUR_MIN_FIGURE, Math.min(HAUTEUR_MAX_ARBRE, dispo.hauteur));
  const sats = useMemo(() => disposerSatellites(liaisons, nomDe, hauteurArbre), [liaisons, nomDe, hauteurArbre]);
  const hauteurFigure = sats.hauteur;
  const virtualise = dispo.cartes.length > CARTES_AVANT_VIRTUALISATION;

  // --- Toile : la transformation est appliquée directement sur le plan (aucun rendu React pendant un glissement) ---
  const t = useRef<Transformation>({ echelle: 1, x: 0, y: 0 });
  const interagi = useRef(false);
  const geste = useRef<{ pointeurs: Map<number, { x: number; y: number }>; depart: { x: number; y: number; t: Transformation } | null; glisse: boolean; pincement: { distance: number; t: Transformation } | null }>({
    pointeurs: new Map(), depart: null, glisse: false, pincement: null,
  });
  const ignorerClic = useRef(false);
  const [fenetre, setFenetre] = useState<Fenetre>(FENETRE_REPLI);
  const virtualiseRef = useRef(virtualise);
  const hauteurRef = useRef(hauteurFigure);
  const largeurRef = useRef(largeurArbre);
  const trame = useRef(0);
  useLayoutEffect(() => {
    virtualiseRef.current = virtualise;
    hauteurRef.current = hauteurFigure;
    largeurRef.current = largeurArbre;
  });
  useEffect(() => () => {
    if (trame.current && typeof cancelAnimationFrame === "function") cancelAnimationFrame(trame.current);
  }, []);

  const mesure = useCallback(() => ({ l: vue.current?.clientWidth || largeurRef.current, h: vue.current?.clientHeight || hauteurRef.current }), []);
  const lireFenetre = useCallback(() => {
    const { l, h } = mesure();
    setFenetre(fenetreVisible(t.current, l, h));
  }, [mesure]);
  const planifierFenetre = useCallback(() => {
    if (trame.current) return;
    if (typeof requestAnimationFrame !== "function") return lireFenetre();
    trame.current = requestAnimationFrame(() => {
      trame.current = 0;
      lireFenetre();
    });
  }, [lireFenetre]);
  /** `immediat` : la fenêtre de rendu suit tout de suite (geste ponctuel) ; sinon à la prochaine image (glissement, pincement). */
  const appliquer = useCallback(
    (n: Transformation, immediat = true) => {
      t.current = n;
      if (plan.current) plan.current.style.transform = `translate(${n.x}px, ${n.y}px) scale(${n.echelle})`;
      if (!virtualiseRef.current) return;
      if (immediat) lireFenetre();
      else planifierFenetre();
    },
    [lireFenetre, planifierFenetre],
  );
  const ajuster = useCallback(
    (plancher = ECHELLE_MIN) => {
      const { l, h } = mesure();
      appliquer(transformationAjustee(dispo, l, h, plancher));
    },
    [appliquer, dispo, mesure],
  );
  const centrer = useCallback(
    (c: CarteArbre) => {
      const { l, h } = mesure();
      appliquer(transformationCentree(c, l, h, 0.8, t.current.echelle));
    },
    [appliquer, mesure],
  );
  const zoomer = useCallback(
    (facteur: number, px?: number, py?: number) => {
      const { l, h } = mesure();
      interagi.current = true;
      appliquer(zoomerAutour(t.current, facteur, px ?? l / 2, py ?? h / 2));
    },
    [appliquer, mesure],
  );

  // Tant que rien n'a été touché, le dessin reste ajusté à la largeur du cadre (ouverture : jamais sous 60 %).
  useLayoutEffect(() => {
    if (telephone) return;
    if (!interagi.current) ajuster(ECHELLE_OUVERTURE_MIN);
  }, [ajuster, telephone, taille]);

  // Un agent mis en évidence : la toile se centre sur sa carte (une fois par agent et par service).
  const dejaCentre = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (telephone || !agentMisEnEvidence) {
      dejaCentre.current = null;
      return;
    }
    const carte = dispo.cartes.find((c) => c.id === agentMisEnEvidence);
    if (!carte || !vue.current) return;
    const cle = `${service.slug}:${agentMisEnEvidence}`;
    if (dejaCentre.current === cle) return;
    dejaCentre.current = cle;
    interagi.current = true;
    centrer(carte);
  }, [agentMisEnEvidence, dispo, telephone, service.slug, centrer]);

  // Ctrl + molette (et pincement du pavé tactile) : zoom autour du pointeur ; sans Ctrl, la page défile normalement.
  useEffect(() => {
    const el = vue.current;
    if (!el || telephone) return;
    const surMolette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => el.removeEventListener("wheel", surMolette);
  }, [zoomer, telephone]);

  const g = geste.current;
  const relatif = (e: { clientX: number; clientY: number }) => {
    const r = vue.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const distance = () => {
    const [a, b] = [...g.pointeurs.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const surAppui = (e: EvenementPointeur<HTMLDivElement>) => {
    ignorerClic.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    g.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointeurs.size === 1) g.depart = { x: e.clientX, y: e.clientY, t: t.current };
    else if (g.pointeurs.size === 2) {
      g.pincement = { distance: distance() || 1, t: t.current };
      g.depart = null;
      g.glisse = true;
    }
  };
  const surMouvement = (e: EvenementPointeur<HTMLDivElement>) => {
    if (!g.pointeurs.has(e.pointerId)) return;
    g.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointeurs.size >= 2 && g.pincement) {
      const [a, b] = [...g.pointeurs.values()];
      const milieu = relatif({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
      interagi.current = true;
      appliquer(zoomerAutour(g.pincement.t, distance() / g.pincement.distance, milieu.x, milieu.y), false);
      return;
    }
    const d = g.depart;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!g.glisse && Math.hypot(dx, dy) < SEUIL_GLISSEMENT) return;
    if (!g.glisse) {
      g.glisse = true;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Capture impossible (pointeur déjà relâché) : le glissement continue sans.
      }
      e.currentTarget.dataset["deplace"] = "true";
    }
    interagi.current = true;
    appliquer({ ...d.t, x: d.t.x + dx, y: d.t.y + dy }, false);
  };
  const surRelache = (e: EvenementPointeur<HTMLDivElement>) => {
    if (!g.pointeurs.delete(e.pointerId)) return;
    if (g.pointeurs.size < 2) g.pincement = null;
    if (g.pointeurs.size === 0) {
      // Le clic qui suit un glissement ne doit pas activer le lien ou le bouton sous le doigt.
      // Sans minuterie : le drapeau est consommé par ce clic, ou effacé au prochain appui (pas de course sous charge).
      if (g.glisse) ignorerClic.current = true;
      g.glisse = false;
      g.depart = null;
      delete e.currentTarget.dataset["deplace"];
      if (virtualiseRef.current) lireFenetre();
    } else if (g.pointeurs.size === 1) {
      const [reste] = [...g.pointeurs.values()];
      g.depart = reste ? { x: reste.x, y: reste.y, t: t.current } : null;
    }
  };
  const surClavier = (e: ToucheClavier<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.altKey || e.metaKey) return;
    const pas: Record<string, [number, number]> = { ArrowLeft: [PAS_CLAVIER, 0], ArrowRight: [-PAS_CLAVIER, 0], ArrowUp: [0, PAS_CLAVIER], ArrowDown: [0, -PAS_CLAVIER] };
    const p = pas[e.key];
    if (p) {
      e.preventDefault();
      interagi.current = true;
      appliquer({ ...t.current, x: t.current.x + p[0], y: t.current.y + p[1] });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomer(FACTEUR_ZOOM);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomer(1 / FACTEUR_ZOOM);
    } else if (e.key === "0") {
      e.preventDefault();
      interagi.current = false;
      ajuster();
    }
  };
  // Un lien qui prend le focus hors de la vue ramène sa carte au centre (le navigateur ferait défiler le cadre).
  const surFocus = (e: FocusEvent<HTMLDivElement>) => {
    const el = vue.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
    const idCarte = (e.target as HTMLElement).closest<HTMLElement>("[data-agent]")?.dataset["agent"];
    const c = idCarte ? dispo.cartes.find((k) => k.id === idCarte) : undefined;
    if (!c) return;
    const { l, h } = mesure();
    const x = c.x * t.current.echelle + t.current.x;
    const y = c.y * t.current.echelle + t.current.y;
    const dedans = x >= 0 && y >= 0 && x + c.largeur * t.current.echelle <= l && y + c.hauteur * t.current.echelle <= h;
    if (!dedans) {
      interagi.current = true;
      centrer(c);
    }
  };

  const visibles = useMemo(() => elementsVisibles(dispo, fenetre, 240, agentMisEnEvidence), [dispo, fenetre, agentMisEnEvidence]);
  const A = (n: number) => pluriel(n, "agent", "agents");
  const gauche = sats.gauche.length > 0;
  const droite = sats.droite.length > 0;

  return (
    <section className="atl-orgs" aria-label={`Service ${service.nom}`}>
      <style href="atelier-organigramme-service" precedence="default">
        {STYLES_ORGANIGRAMME_SERVICE}
      </style>
      <header className="atl-orgs-entete">
        <nav aria-label="Fil d'Ariane" className="atl-orgs-fil">
          <button type="button" className="atl-orgs-retour" onClick={retour}>
            Organigramme
          </button>
          <span aria-hidden="true" className="atl-orgs-sep">›</span>
          <span aria-current="page" className="atl-orgs-courant">
            {service.nom}
          </span>
        </nav>
        <h2 className="atl-orgs-titre-service">{service.nom}</h2>
        <p className="atl-orgs-resume">
          <strong>{A(statuts.total)}</strong>
          <span>{pluriel(statuts.actifs, "actif", "actifs")}</span>
          <span>{nombre(statuts.enPause)} en pause</span>
          <span>{nombre(statuts.enErreur)} en erreur</span>
        </p>
      </header>

      {agents.length === 0 ? <p className="atl-orgs-vide">Ce service n'a aucun agent.</p> : null}

      {telephone ? (
        <>
          {agents.length > 0 ? <ListeTelephone dispo={dispo} prefixe={service.prefixe} misEnEvidence={agentMisEnEvidence} basculer={basculer} /> : null}
          <h3 className="atl-orgs-sous-titre">Services partenaires</h3>
          {liaisons.length === 0 ? (
            <p className="atl-orgs-vide">Ce service n'a pas d'échange métier avec d'autres services.</p>
          ) : (
            <ul className="atl-orgs-partenaires-liste">
              {sats.gauche.concat(sats.droite).map((s) => (
                <li key={s.slug}>
                  <button type="button" className="atl-orgs-satellite-ligne" onClick={() => ouvrirService(s.slug)}>
                    <span className="atl-orgs-satellite-nom">{s.nom}</span>
                    <span className="atl-orgs-satellite-detail">
                      {s.sortants > 0 ? `${echanges(s.sortants)} sortants` : ""}
                      {s.sortants > 0 && s.entrants > 0 ? ", " : ""}
                      {s.entrants > 0 ? `${echanges(s.entrants)} entrants` : ""}
                      {s.liaison.approbation ? ", approbation" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="atl-orgs-figure-defile">
          <div
            className="atl-orgs-figure"
            style={{
              height: hauteurFigure,
              gridTemplateColumns: `${gauche ? `${SATELLITE.largeur + GOUTTIERE}px ` : ""}minmax(16rem, 1fr)${droite ? ` ${SATELLITE.largeur + GOUTTIERE}px` : ""}`,
            }}
          >
            {gauche ? <Flanc sats={sats.gauche} cote="gauche" hauteur={hauteurFigure} contenu={sats.contenuGauche} ouvrir={ouvrirService} /> : null}
            <div className="atl-orgs-bloc">
              <div
                ref={vue}
                className="atl-orgs-vue"
                role="group"
                tabIndex={0}
                aria-label={`Arbre des agents du service ${service.nom}. Flèches pour déplacer, plus et moins pour zoomer, zéro pour ajuster. Ctrl et molette pour zoomer.`}
                onPointerDown={surAppui}
                onPointerMove={surMouvement}
                onPointerUp={surRelache}
                onPointerCancel={surRelache}
                onKeyDown={surClavier}
                onFocusCapture={surFocus}
                onClickCapture={(e) => {
                  // Le relâché d'un glissement est toujours suivi d'un clic sur l'élément capturé : le drapeau est consommé ici.
                  if (ignorerClic.current) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  ignorerClic.current = false;
                }}
              >
                <div ref={plan} className="atl-orgs-plan" style={{ width: dispo.largeur, height: dispo.hauteur }}>
                  <Plan cartes={visibles.cartes} traits={visibles.traits} largeur={dispo.largeur} hauteur={dispo.hauteur} prefixe={service.prefixe} misEnEvidence={agentMisEnEvidence} basculer={basculer} />
                </div>
              </div>
              <div className="atl-orgs-zoom" role="group" aria-label="Zoom de l'arbre">
                <button type="button" className="atl-orgs-zoom-bouton" aria-label="Zoom avant" onClick={() => zoomer(FACTEUR_ZOOM)}>
                  +
                </button>
                <button type="button" className="atl-orgs-zoom-bouton" aria-label="Zoom arrière" onClick={() => zoomer(1 / FACTEUR_ZOOM)}>
                  −
                </button>
                <button
                  type="button"
                  className="atl-orgs-zoom-bouton"
                  aria-label="Ajuster à l'écran"
                  onClick={() => {
                    interagi.current = false;
                    ajuster();
                  }}
                >
                  Ajuster
                </button>
              </div>
            </div>
            {droite ? <Flanc sats={sats.droite} cote="droite" hauteur={hauteurFigure} contenu={sats.contenuDroite} ouvrir={ouvrirService} /> : null}
          </div>
          {/* Légende sous le dessin : en surimpression, elle masquait des cartes d'agents. */}
          <ul className="atl-orgs-legende" aria-label="Légende des traits">
            <li>
              <svg width="32" height="10" aria-hidden="true"><line x1="0" y1="5" x2="32" y2="5" className="atl-orgs-echantillon" data-sens="sortant" /></svg>
              trait plein : ce que le service demande
            </li>
            <li>
              <svg width="32" height="10" aria-hidden="true"><line x1="0" y1="5" x2="32" y2="5" className="atl-orgs-echantillon" data-sens="entrant" /></svg>
              trait pointillé : ce qu'on lui demande
            </li>
            <li>« approbation » : l'accord d'une personne est requis</li>
          </ul>
        </div>
      )}

      <section className="atl-orgs-panneau" aria-label="Échanges avec les autres services">
        <h3 className="atl-orgs-sous-titre">Échanges avec les autres services</h3>
        <PanneauEchanges liaisons={liaisons} nomDe={nomDe} ouvrir={ouvrirService} />
      </section>
    </section>
  );
}
