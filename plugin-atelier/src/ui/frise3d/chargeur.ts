/**
 * Chargement à la demande de la scène 3D (`dist/ui/frise-3d.js`, qui embarque three.js).
 *
 * Le point d'entrée de l'interface est lui-même importé par l'hôte depuis une adresse `blob:` : un import relatif y est
 * impossible. On construit donc l'adresse absolue du fichier voisin à partir de l'identifiant du plugin dans l'hôte
 * (`/_plugins/<id>/ui/frise-3d.js`, même route statique que le point d'entrée), lu une fois dans l'API de l'hôte.
 * Tout échec (réseau, fichier absent, WebGL refusé plus tard) fait rester la frise en 2D : rien n'est bloquant.
 */
import { PLUGIN_ID } from "../../contrats/identifiants.js";
import { appelHote } from "../hote.js";
import type { OptionsScene, SceneFrise } from "./frise-3d.js";

export interface ModuleScene {
  creerScene(options: Omit<OptionsScene, "pieces">): SceneFrise;
}

/** Clé du plugin dans le registre de l'hôte. */
export const CLE_PLUGIN = PLUGIN_ID;
export const FICHIER_SCENE = "frise-3d.js";

let promesse: Promise<ModuleScene> | null = null;

/** Adresse absolue du module de scène pour un identifiant de plugin et une origine données. */
export const adresseScene = (idPlugin: string, origine: string): string => `${origine}/_plugins/${encodeURIComponent(idPlugin)}/ui/${FICHIER_SCENE}`;

async function charger(): Promise<ModuleScene> {
  const plugins = await appelHote<Array<{ id: string; pluginKey?: string }>>("GET", "/plugins");
  const id = plugins.find((p) => p.pluginKey === CLE_PLUGIN)?.id;
  if (!id) throw new Error("plugin introuvable dans l'hôte");
  const module = (await import(/* @vite-ignore */ adresseScene(id, location.origin))) as ModuleScene;
  if (typeof module.creerScene !== "function") throw new Error("module de scène invalide");
  return module;
}

/** Charge (une seule fois) le module de scène ; un échec n'est pas mémorisé pour qu'un prochain essai reste possible. */
export function chargerScene(): Promise<ModuleScene> {
  promesse ??= charger().catch((e) => {
    promesse = null;
    throw e;
  });
  return promesse;
}
