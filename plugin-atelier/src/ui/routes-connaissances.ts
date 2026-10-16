/**
 * Chemins d'API de la rubrique « Connaissances » (contrat : `ROUTES_CONNAISSANCES_PREVUES` dans
 * `src/contrats/connaissances.ts`). Même origine, session de l'utilisateur ; les droits (humain seul
 * pour l'import et la suppression) sont contrôlés par le serveur.
 */
import { PLUGIN_ID } from "../contrats/identifiants.js";
import { appelHote } from "./hote.js";

export const ROUTES_UI_CONNAISSANCES = {
  importer: "/connaissances",
  lister: "/connaissances",
  statut: "/connaissances/statut",
  supprimer: "/connaissances/suppression",
  importerUrl: "/connaissances/page-web",
  rechercher: (issueId: string) => `/taches/${encodeURIComponent(issueId)}/connaissances/recherche`,
} as const;

export function appelConnaissances<T>(methode: "GET" | "POST", chemin: string, corps?: unknown): Promise<T> {
  return appelHote<T>(methode, `/plugins/${PLUGIN_ID}/api${chemin}`, corps);
}

/** Chemin d'une lecture, avec l'entreprise en paramètre de requête. */
export function cheminAvecEntreprise(chemin: string, companyId: string): string {
  return `${chemin}?companyId=${encodeURIComponent(companyId)}`;
}
