/**
 * Pièces 3D de la frise, modelées dans Blender (`scripts/blender/frise-stations.py`) et exportées en glTF binaire
 * (`src/ui/assets/frise-stations.glb`). Ce fichier lit le GLB avec le GLTFLoader de three.js et en sort les quatre
 * pièces nommées dont la scène a besoin ; la scène leur donne ses propres matières (couleurs des jetons de l'interface).
 */
import type { BufferGeometry, Mesh, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Identifiants des six stations, dans l'ordre de la frise (noms `Station_<id>` dans le fichier). */
export const IDS_STATIONS = ["strategie", "production", "coordonnees", "revue", "controles", "reponse"] as const;
/** Hauteur de référence du socle modelé : la scène l'étire selon l'état de la phase. */
export const HAUTEUR_REF_STATION = 0.34;

export interface Pieces {
  /** Socle (une seule maille partagée par les six stations ; origine au pied). */
  station: BufferGeometry;
  /** Dalle sur laquelle reposent les stations, avec sa position d'origine (face supérieure à y = 0). */
  piste: { geometrie: BufferGeometry; y: number };
  /** Petit cube qui avance (origine au centre). */
  volume: BufferGeometry;
  /** Anneau posé autour d'une station qui attend une décision (origine au centre, couché). */
  anneau: BufferGeometry;
}

const maille = (racine: Object3D, nom: string): Mesh => {
  const o = racine.getObjectByName(nom) as Mesh | undefined;
  if (!o || !(o as Mesh).isMesh) throw new Error(`pièce 3D absente du modèle : ${nom}`);
  return o;
};

/** Lit le GLB et en extrait les pièces ; échoue si l'une des six stations ou l'une des trois autres pièces manque. */
export async function lirePieces(donnees: ArrayBuffer): Promise<Pieces> {
  const gltf = await new GLTFLoader().parseAsync(donnees, "");
  for (const id of IDS_STATIONS) maille(gltf.scene, `Station_${id}`);
  return {
    station: maille(gltf.scene, "Station_strategie").geometry,
    piste: (() => {
      const m = maille(gltf.scene, "Piste");
      return { geometrie: m.geometry, y: m.position.y };
    })(),
    volume: maille(gltf.scene, "Volume").geometry,
    anneau: maille(gltf.scene, "Anneau").geometry,
  };
}
