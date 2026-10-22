/**
 * Logique pure de la frise en 3D (aucune dépendance à three.js, donc chargée avec le premier paquet) :
 * choix 3D ou 2D, position des stations, station où se trouve le petit volume, forme de chaque station selon son état,
 * courbes d'animation. Le dessin lui-même est dans `scene.ts`, chargé à la demande.
 */
import type { EtatPhase, Phase } from "../avancement-missions.js";

/** Sous cette largeur de la bande (en pixels), la frise reste en 2D. */
export const LARGEUR_MIN_3D = 600;

export type ModeRendu = "3d" | "2d";

export interface ConditionsRendu {
  /** Le navigateur sait créer un contexte WebGL. */
  webgl: boolean;
  /** `prefers-reduced-motion: reduce`. */
  mouvementReduit: boolean;
  /** Largeur de la bande, en pixels. */
  largeur: number;
  /** Le chargement du module de scène a échoué, ou le contexte WebGL a été perdu. */
  echec?: boolean;
}

/** 3D seulement si tout est réuni ; dans tous les autres cas, le repli 2D (la liste de phases, lisible partout). */
export function choisirRendu(c: ConditionsRendu): ModeRendu {
  if (c.echec || !c.webgl || c.mouvementReduit || c.largeur < LARGEUR_MIN_3D) return "2d";
  return "3d";
}

let sondeWebgl: boolean | null = null;

/** Vrai si un contexte WebGL peut être créé. Résultat mémorisé (un contexte de sonde coûte) ; le contexte est rendu aussitôt. */
export function webglDisponible(creerCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): boolean {
  if (sondeWebgl !== null) return sondeWebgl;
  // Pas de WebGL du tout (rendu serveur, jsdom) : inutile de créer un canvas pour le savoir.
  if (typeof WebGLRenderingContext === "undefined") {
    sondeWebgl = false;
    return false;
  }
  try {
    const canvas = creerCanvas();
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
    sondeWebgl = gl !== null && typeof gl === "object";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    sondeWebgl = false;
  }
  return sondeWebgl;
}

/** Pour les tests : oublie le résultat mémorisé de la sonde. */
export function reinitialiserSondeWebgl(): void {
  sondeWebgl = null;
}

/** Espacement entre deux stations (unités de la scène) et empreinte d'un socle. */
export const ESPACEMENT = 2.2;
export const EMPREINTE = { largeur: 1.3, profondeur: 0.8 } as const;

/** Abscisses des stations, centrées sur 0 : la station `i` est au centre de la colonne `i` de la grille d'étiquettes. */
export function positionsStations(n: number, espacement: number = ESPACEMENT): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * espacement);
}

/** Largeur totale couverte par les colonnes : le champ de la caméra la couvre exactement, bord à bord. */
export const largeurScene = (n: number, espacement: number = ESPACEMENT): number => n * espacement;

/**
 * Station où se trouve le petit volume : la phase qui attend une décision, sinon la phase en cours, sinon la dernière
 * phase faite (le volume attend la suite), sinon le départ.
 */
export function indexCourant(phases: ReadonlyArray<Pick<Phase, "etat">>): number {
  const attend = phases.findIndex((p) => p.etat === "attend_decision");
  if (attend >= 0) return attend;
  const cours = phases.findIndex((p) => p.etat === "en_cours");
  if (cours >= 0) return cours;
  let derniere = -1;
  phases.forEach((p, i) => {
    if (p.etat === "faite") derniere = i;
  });
  return Math.max(derniere, 0);
}

/** Forme d'un socle selon l'état : la hauteur dit l'état autant que la couleur (jamais la couleur seule). */
export interface FormeStation {
  hauteur: number;
  /** 1 = opaque. */
  opacite: number;
  /** Anneau posé autour du socle (attend votre décision : indice fixe, qui reste quand la pulsation s'arrête). */
  anneau: boolean;
}

export const FORMES: Record<EtatPhase, FormeStation> = {
  faite: { hauteur: 0.24, opacite: 1, anneau: false },
  en_cours: { hauteur: 0.34, opacite: 1, anneau: false },
  attend_decision: { hauteur: 0.46, opacite: 1, anneau: true },
  a_venir: { hauteur: 0.1, opacite: 0.55, anneau: false },
  non_prevue: { hauteur: 0.04, opacite: 0.3, anneau: false },
};

export const formeStation = (etat: EtatPhase): FormeStation => FORMES[etat];

/** Durées des animations, en millisecondes. Aucune ne dépasse quelques secondes : puis le rendu s'arrête. */
export const DUREES = { deplacement: 750, hauteur: 420, pulsation: 4200, periodePulsation: 1400 } as const;

export const adoucir = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Petit saut du volume pendant son déplacement : 0 au départ et à l'arrivée, `max` au milieu. */
export const saut = (t: number, max: number): number => 4 * max * Math.min(1, Math.max(0, t)) * (1 - Math.min(1, Math.max(0, t)));

/** Pulsation douce, 0 à 1 puis retour à 0 ; nulle une fois la durée écoulée (la scène revient alors au repos). */
export function pulsation(ecoule: number): number {
  if (ecoule < 0 || ecoule >= DUREES.pulsation) return 0;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * ecoule) / DUREES.periodePulsation);
}

/** Couleurs de la scène, en entiers 0xRRGGBB, tirées des jetons de l'interface (voir `couleurs.ts`). */
export interface CouleursScene {
  succes: number;
  info: number;
  attention: number;
  neutre: number;
  surface: number;
  fond: number;
  texte: number;
  sombre: boolean;
}

/** Valeurs de repli (sans navigateur ou sans canvas) : proches des jetons du thème clair. */
export const COULEURS_REPLI: CouleursScene = {
  succes: 0x1f6b3d,
  info: 0x2a5fa8,
  attention: 0x8a5200,
  neutre: 0x8a8f98,
  surface: 0xffffff,
  fond: 0xffffff,
  texte: 0x1a1a1a,
  sombre: false,
};
