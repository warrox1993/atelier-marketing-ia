/**
 * Sous-routes de la page de l'atelier : `/:prefixe/atelier/<rubrique>/<id>`.
 * Fonctions pures (testées) : l'adresse est la seule source de l'état de navigation,
 * ce qui rend chaque vue partageable et le bouton « précédent » fiable.
 */
import { ROUTE_ATELIER, RUBRIQUES } from "../contrats/ui-constantes.js";

export type CleRubrique = (typeof RUBRIQUES)[number]["cle"];
export type CleVue = "accueil" | CleRubrique | "prospects" | "carte" | "connaissances" | "mise-en-place" | "parametres" | "corbeille";

export interface RouteAtelier {
  vue: CleVue;
  /** Identifiant natif sélectionné (agent, campagne, tâche) ou « nouvelle ». */
  id: string | null;
}

export const VUES: ReadonlyArray<{ cle: CleVue; libelle: string }> = [
  { cle: "accueil", libelle: "À faire" },
  ...RUBRIQUES.map((r) => ({ cle: r.cle as CleVue, libelle: r.libelle })),
  { cle: "prospects", libelle: "Prospects" },
  { cle: "carte", libelle: "Carte des prospects" },
  { cle: "connaissances", libelle: "Connaissances" },
  { cle: "mise-en-place", libelle: "Mise en place du client" },
  { cle: "parametres", libelle: "Paramètres et diagnostic" },
  { cle: "corbeille", libelle: "Corbeille" },
];

const CLES = new Set<string>(VUES.map((v) => v.cle));

/** Lit la vue depuis le chemin de l'hôte ; vue par défaut : accueil (« À faire »). */
export function lireRoute(pathname: string): RouteAtelier {
  const segments = pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const i = segments.indexOf(ROUTE_ATELIER);
  if (i < 0) return { vue: "accueil", id: null };
  const vue = segments[i + 1];
  if (!vue || !CLES.has(vue)) return { vue: "accueil", id: null };
  return { vue: vue as CleVue, id: segments[i + 2] ?? null };
}

/** Chemin relatif à l'entreprise (l'hôte ajoute le préfixe). */
export function chemin(vue: CleVue, id?: string | null): string {
  return `/${ROUTE_ATELIER}/${vue}${id ? `/${encodeURIComponent(id)}` : ""}`;
}
