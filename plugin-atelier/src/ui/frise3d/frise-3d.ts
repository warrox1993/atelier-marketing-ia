/**
 * Point d'entrée du fichier chargé à la demande (`dist/ui/frise-3d.js`) : three.js, la scène et le modèle Blender
 * (`frise-stations.glb`, embarqué dans le fichier : un seul téléchargement, aucune route à servir en plus).
 * Le modèle est lu une fois, à l'évaluation du module ; `creerScene` reste ensuite synchrone.
 */
import modele from "../assets/frise-stations.glb";
import { lirePieces } from "./pieces.js";
import { creerScene as creerSceneBase, type OptionsScene, type SceneFrise } from "./scene.js";

const pieces = await lirePieces(modele.buffer.slice(modele.byteOffset, modele.byteOffset + modele.byteLength) as ArrayBuffer);

export const creerScene = (options: Omit<OptionsScene, "pieces">): SceneFrise => creerSceneBase({ ...options, pieces });
export type { OptionsScene, SceneFrise };
