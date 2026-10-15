/**
 * Sous-routes de la page de l'atelier : `/:prefixe/atelier/<rubrique>/<id>`.
 * Fonctions pures (testées) : l'adresse est la seule source de l'état de navigation,
 * ce qui rend chaque vue partageable et le bouton « précédent » fiable.
 */
import { ROUTE_ATELIER, RUBRIQUES } from "../contrats/ui-constantes.js";

export type CleRubrique = (typeof RUBRIQUES)[number]["cle"];
export type CleVue = CleRubrique | "prospects" | "connaissances" | "parametres";

export interface RouteAtelier {
  vue: CleVue;
  /** Identifiant natif sélectionné (agent, campagne, tâche) ou « nouvelle ». */
  id: string | null;
}

export const VUES: ReadonlyArray<{ cle: CleVue; libelle: string }> = [
  ...RUBRIQUES.map((r) => ({ cle: r.cle as CleVue, libelle: r.libelle })),
  { cle: "prospects", libelle: "Prospects" },
  { cle: "connaissances", libelle: "Connaissances" },
  { cle: "parametres", libelle: "Paramètres et diagnostic" },
];

const CLES = new Set<string>(VUES.map((v) => v.cle));

/** Lit la vue depuis le chemin de l'hôte ; vue par défaut : équipe. */
export function lireRoute(pathname: string): RouteAtelier {
  const segments = pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const i = segments.indexOf(ROUTE_ATELIER);
  if (i < 0) return { vue: "equipe", id: null };
  const vue = segments[i + 1];
  if (!vue || !CLES.has(vue)) return { vue: "equipe", id: null };
  return { vue: vue as CleVue, id: segments[i + 2] ?? null };
}

/** Chemin relatif à l'entreprise (l'hôte ajoute le préfixe). */
export function chemin(vue: CleVue, id?: string | null): string {
  return `/${ROUTE_ATELIER}/${vue}${id ? `/${encodeURIComponent(id)}` : ""}`;
}
