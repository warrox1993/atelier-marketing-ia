/**
 * Scène WebGL de la frise (three.js). Ce fichier est un point d'entrée à part du paquet de l'interface
 * (`dist/ui/frise-3d.js`) : il n'est téléchargé qu'au premier affichage de la frise en 3D (import dynamique,
 * voir `chargeur.ts`). Six socles posés sur une piste, vus de trois quarts avec une faible perspective ; un petit cube
 * glisse devant la station courante ; la station qui attend une décision pulse doucement quelques secondes, puis garde
 * un anneau fixe (l'indice ne repose pas sur le mouvement).
 *
 * Rendu à la demande : aucune boucle permanente. Une image est dessinée à la création, à chaque changement d'état, à
 * chaque redimensionnement ; une animation courte (déplacement, hauteur, pulsation) demande des images jusqu'à sa fin,
 * puis plus rien. Les étiquettes (nom, état) restent en HTML, hors de ce fichier.
 */
import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
  type WebGLRendererParameters,
} from "three";
import { HAUTEUR_REF_STATION, type Pieces } from "./pieces.js";
import { adoucir, COULEURS_REPLI, DUREES, formeStation, indexCourant, largeurScene, positionsStations, pulsation, saut, type CouleursScene } from "./logique.js";
import type { EtatPhase } from "../avancement-missions.js";

export interface PhaseScene {
  id: string;
  etat: EtatPhase;
}

/** Ce que la scène attend du moteur de rendu : le strict nécessaire, pour pouvoir le simuler en test. */
export interface MoteurRendu {
  domElement: HTMLCanvasElement;
  shadowMap: { enabled: boolean; type: number };
  setPixelRatio(ratio: number): void;
  setSize(largeur: number, hauteur: number, styleCss?: boolean): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
  forceContextLoss?(): void;
}

export interface OptionsScene {
  conteneur: HTMLElement;
  /** Pièces modelées dans Blender (voir `pieces.ts`) : la scène ne dessine aucune forme elle-même. */
  pieces: Pieces;
  phases: readonly PhaseScene[];
  couleurs?: CouleursScene;
  /** Plafond du rapport de pixels (2 par défaut : au-delà, le coût grimpe sans gain visible). */
  ratioMax?: number;
  /** Appelé si le contexte WebGL est perdu : l'appelant repasse en 2D. */
  surPerte?: () => void;
  /** Fabrique du moteur de rendu (remplacée dans les tests). */
  fabriqueMoteur?: (parametres: WebGLRendererParameters) => MoteurRendu;
}

export interface SceneFrise {
  /** Nouvel état des phases : animation courte si quelque chose change, puis arrêt. */
  mettre(phases: readonly PhaseScene[]): void;
  recolorer(couleurs: CouleursScene): void;
  redimensionner(): void;
  /** Libère géométries, matières, moteur de rendu et canvas. Sans effet au second appel. */
  detruire(): void;
}

const PITCH = (28 * Math.PI) / 180;
const DISTANCE = 14;
const ALTITUDE_CIBLE = 0.36;
const PROFONDEUR_CIBLE = 0.3;
/** Le volume glisse sur la piste, devant les socles. */
const Z_VOLUME = 0.72;

interface Station {
  etat: EtatPhase | null;
  groupe: Group;
  socle: Mesh;
  matiere: MeshStandardMaterial;
  anneau: Mesh;
  matiereAnneau: MeshStandardMaterial;
  hauteur: number;
  hauteurDepart: number;
  hauteurCible: number;
  debutHauteur: number;
}

const melange = (a: number, b: number, t: number): number => new Color(a).lerp(new Color(b), t).getHex();

export function creerScene(options: OptionsScene): SceneFrise {
  const { conteneur } = options;
  const ratioMax = options.ratioMax ?? 2;
  let couleurs = options.couleurs ?? COULEURS_REPLI;
  let phases = options.phases;
  const n = phases.length;
  const abscisses = positionsStations(n);
  const maintenant = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const moteur =
    options.fabriqueMoteur?.({ antialias: true, alpha: true, powerPreference: "low-power" }) ??
    (new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }) as unknown as MoteurRendu);
  moteur.setPixelRatio(Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, ratioMax));
  moteur.shadowMap.enabled = true;
  moteur.shadowMap.type = PCFShadowMap;
  const canvas = moteur.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%";
  canvas.setAttribute("aria-hidden", "true");
  conteneur.append(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(5, 10, 4, 40);

  // Lumière douce : un ciel qui éclaire un peu tout, une source unique en haut à gauche pour des ombres légères.
  const ciel = new HemisphereLight(0xffffff, 0x9aa0a8, 1.15);
  const soleil = new DirectionalLight(0xffffff, 1.9);
  soleil.position.set(-4, 6, 5);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(1024, 512);
  soleil.shadow.radius = 4;
  soleil.shadow.bias = -0.0004;
  Object.assign(soleil.shadow.camera, { left: -9, right: 9, top: 3.5, bottom: -3.5, near: 1, far: 20 });
  scene.add(ciel, soleil, soleil.target);

  // Les formes viennent du modèle Blender ; chaque scène en prend sa propre copie (le nettoyage ne touche pas le modèle partagé).
  const geoStation = options.pieces.station.clone();
  const geoPiste = options.pieces.piste.geometrie.clone();
  const geoVolume = options.pieces.volume.clone();
  const geoAnneau = options.pieces.anneau.clone();

  const matierePiste = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const piste = new Mesh(geoPiste, matierePiste);
  piste.position.y = options.pieces.piste.y;
  piste.receiveShadow = true;
  scene.add(piste);

  const stations: Station[] = abscisses.map((x) => {
    const matiere = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const matiereAnneau = new MeshStandardMaterial({ roughness: 0.8, metalness: 0, transparent: true });
    const socle = new Mesh(geoStation, matiere);
    socle.scale.y = 0.01 / HAUTEUR_REF_STATION;
    socle.castShadow = true;
    socle.receiveShadow = true;
    const anneau = new Mesh(geoAnneau, matiereAnneau);
    anneau.position.y = 0.04;
    anneau.visible = false;
    const groupe = new Group();
    groupe.position.x = x;
    groupe.add(socle, anneau);
    scene.add(groupe);
    return { etat: null, groupe, socle, matiere, anneau, matiereAnneau, hauteur: 0, hauteurDepart: 0, hauteurCible: 0, debutHauteur: 0 };
  });

  const matiereVolume = new MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
  const volume = new Mesh(geoVolume, matiereVolume);
  volume.rotation.y = Math.PI / 4;
  volume.castShadow = true;
  volume.position.set(abscisses[0] ?? 0, 0.17, Z_VOLUME);
  scene.add(volume);

  // Animations en cours. Rien ne tourne quand tout est nul.
  let xVolume = abscisses[0] ?? 0;
  let xDepart = xVolume;
  let xCible = xVolume;
  let debutDeplacement = 0;
  let deplacementEnCours = false;
  let debutPulsation = -Infinity;
  let indexPulsation = -1;
  let image: number | null = null;
  let detruite = false;
  let premiere = true;

  const appliquerCouleurs = () => {
    const sombre = couleurs.sombre;
    matierePiste.color.set(melange(couleurs.fond, couleurs.neutre, sombre ? 0.3 : 0.16));
    matiereVolume.color.set(melange(couleurs.texte, couleurs.fond, 0.2));
    ciel.intensity = sombre ? 1.0 : 1.15;
    ciel.groundColor.set(melange(couleurs.fond, couleurs.neutre, 0.5));
    soleil.intensity = sombre ? 1.6 : 1.9;
    for (const s of stations) teinter(s);
  };

  const teinter = (s: Station) => {
    if (!s.etat) return;
    const f = formeStation(s.etat);
    const base = s.etat === "faite" ? couleurs.succes : s.etat === "en_cours" ? couleurs.info : s.etat === "attend_decision" ? couleurs.attention : couleurs.neutre;
    s.matiere.color.set(base);
    s.matiere.opacity = f.opacite;
    s.matiere.transparent = f.opacite < 1;
    s.matiere.emissive.set(0x000000);
    s.matiereAnneau.color.set(couleurs.attention);
    s.matiereAnneau.emissive.set(0x000000);
    s.anneau.visible = f.anneau;
  };

  const placerCamera = () => {
    const l = conteneur.clientWidth || 1;
    const h = conteneur.clientHeight || 1;
    const aspect = l / h;
    // Le champ couvre exactement la largeur des six colonnes : la station i est au centre de la colonne i des étiquettes.
    const fov = 2 * Math.atan(largeurScene(n) / 2 / (DISTANCE * aspect));
    camera.fov = (fov * 180) / Math.PI;
    camera.aspect = aspect;
    const cible = { y: ALTITUDE_CIBLE, z: PROFONDEUR_CIBLE };
    camera.position.set(0, cible.y + DISTANCE * Math.sin(PITCH), cible.z + DISTANCE * Math.cos(PITCH));
    camera.lookAt(0, cible.y, cible.z);
    camera.updateProjectionMatrix();
  };

  const redimensionner = () => {
    if (detruite) return;
    const l = conteneur.clientWidth;
    const h = conteneur.clientHeight;
    if (l > 0 && h > 0) {
      moteur.setSize(l, h, false);
      placerCamera();
    }
    dessiner();
  };

  const dessiner = () => {
    if (detruite) return;
    moteur.render(scene, camera);
  };

  /** Met à jour tout ce qui est animé à l'instant `t` ; vrai s'il reste du mouvement à venir. */
  const avancer = (t: number): boolean => {
    let encore = false;
    for (const s of stations) {
      if (s.hauteur !== s.hauteurCible) {
        const p = (t - s.debutHauteur) / DUREES.hauteur;
        s.hauteur = p >= 1 ? s.hauteurCible : s.hauteurDepart + (s.hauteurCible - s.hauteurDepart) * adoucir(p);
        if (p < 1) encore = true;
      }
    }
    let levee = 0;
    let tour = 0;
    if (deplacementEnCours) {
      const p = (t - debutDeplacement) / DUREES.deplacement;
      if (p >= 1) {
        xVolume = xCible;
        deplacementEnCours = false;
      } else {
        xVolume = xDepart + (xCible - xDepart) * adoucir(p);
        levee = saut(p, 0.16);
        tour = adoucir(p) * (Math.PI / 2);
        encore = true;
      }
    }
    const pulse = indexPulsation >= 0 ? pulsation(t - debutPulsation) : 0;
    if (indexPulsation >= 0 && t - debutPulsation < DUREES.pulsation) encore = true;
    stations.forEach((s, i) => {
      const h = Math.max(s.hauteur, 0.01);
      const gonfle = i === indexPulsation ? 1 + 0.07 * pulse : 1;
      s.socle.scale.y = (h * gonfle) / HAUTEUR_REF_STATION;
      s.matiere.emissive.set(i === indexPulsation && s.etat === "attend_decision" ? melange(0x000000, couleurs.attention, 0.35 * pulse) : 0x000000);
      if (s.etat === "attend_decision") {
        const k = i === indexPulsation ? 1 + 0.16 * pulse : 1;
        s.anneau.scale.set(k, k, 1);
        s.matiereAnneau.opacity = i === indexPulsation ? 0.55 + 0.45 * pulse : 1;
      }
    });
    volume.position.x = xVolume;
    volume.position.y = 0.17 + levee;
    volume.rotation.y = Math.PI / 4 + tour;
    return encore;
  };

  const image_ = () => {
    image = null;
    if (detruite) return;
    const encore = avancer(maintenant());
    dessiner();
    if (encore) demander();
  };

  /** Demande UNE image ; une seule en attente à la fois. Pas de boucle : `image_` se redemande seulement s'il reste du mouvement. */
  function demander() {
    if (detruite || image !== null) return;
    image = requestAnimationFrame(image_);
  }

  const mettre = (suivantes: readonly PhaseScene[]) => {
    if (detruite) return;
    phases = suivantes;
    const t = maintenant();
    suivantes.forEach((p, i) => {
      const s = stations[i];
      if (!s || s.etat === p.etat) return;
      const avant = s.etat;
      s.etat = p.etat;
      s.hauteurDepart = s.hauteur;
      s.hauteurCible = formeStation(p.etat).hauteur;
      // Au premier affichage, les socles se lèvent l'un après l'autre (décalage court) ; ensuite, tout de suite.
      s.debutHauteur = t + (avant === null ? i * 45 : 0);
      teinter(s);
    });
    const cible = indexCourant(suivantes);
    const x = abscisses[cible] ?? 0;
    if (x !== xCible || premiere) {
      xDepart = premiere ? (abscisses[0] ?? 0) : xVolume;
      xCible = x;
      debutDeplacement = t + (premiere ? 200 : 0);
      deplacementEnCours = xDepart !== xCible;
      if (!deplacementEnCours) xVolume = xCible;
    }
    const attend = suivantes.findIndex((p) => p.etat === "attend_decision");
    if (attend >= 0 && (attend !== indexPulsation || premiere || stations[attend]?.etat !== "attend_decision")) {
      indexPulsation = attend;
      debutPulsation = t;
    } else if (attend < 0) {
      indexPulsation = -1;
    }
    premiere = false;
    avancer(t);
    dessiner();
    demander();
  };

  const surPerte = (e: Event) => {
    e.preventDefault();
    options.surPerte?.();
  };
  canvas.addEventListener("webglcontextlost", surPerte);
  const observateur = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => redimensionner()) : null;
  observateur?.observe(conteneur);

  appliquerCouleurs();
  placerCamera();
  moteur.setSize(Math.max(conteneur.clientWidth, 1), Math.max(conteneur.clientHeight, 1), false);
  mettre(phases);

  const liberer = (objet: Object3D, geometries: Set<BufferGeometry>, matieres: Set<Material>) => {
    objet.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) geometries.add(m.geometry);
      const mat = m.material as Material | Material[] | undefined;
      if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) matieres.add(x);
    });
  };

  return {
    mettre,
    recolorer(c) {
      if (detruite) return;
      couleurs = c;
      appliquerCouleurs();
      avancer(maintenant());
      dessiner();
    },
    redimensionner,
    detruire() {
      if (detruite) return;
      detruite = true;
      if (image !== null) cancelAnimationFrame(image);
      image = null;
      observateur?.disconnect();
      canvas.removeEventListener("webglcontextlost", surPerte);
      const geometries = new Set<BufferGeometry>([geoStation, geoPiste, geoVolume, geoAnneau]);
      const matieres = new Set<Material>();
      liberer(scene, geometries, matieres);
      for (const g of geometries) g.dispose();
      for (const m of matieres) m.dispose();
      scene.clear();
      moteur.dispose();
      moteur.forceContextLoss?.();
      canvas.remove();
    },
  };
}
