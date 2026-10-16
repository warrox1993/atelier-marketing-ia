/**
 * Navigation de l'atelier en cinq rubriques. Les treize vues et leurs adresses (`/atelier/<vue>`)
 * ne changent pas : une rubrique regroupe des vues sous forme d'onglets, et chaque ancienne
 * adresse ouvre la bonne rubrique sur le bon onglet. Fonctions pures (testées).
 */
import { ANCRE_PASSAGE_AU_REEL } from "./realite.js";
import { chemin, type CleVue } from "./route.js";

export type CleRubriqueNav = "accueil" | "discussion" | "prospects" | "marketing" | "reglages" | "direction";

export interface OngletRubrique {
  cle: string;
  libelle: string;
  /** Vue existante réutilisée telle quelle dans l'onglet. */
  vue: CleVue;
  /** Ancre qui distingue deux onglets d'une même vue (Paramètres et Passage au réel). */
  ancre?: string;
}

export interface RubriqueNav {
  cle: CleRubriqueNav;
  libelle: string;
  onglets: ReadonlyArray<OngletRubrique>;
}

export const RUBRIQUES_NAV: ReadonlyArray<RubriqueNav> = [
  { cle: "accueil", libelle: "Accueil", onglets: [{ cle: "accueil", libelle: "Accueil", vue: "accueil" }] },
  { cle: "discussion", libelle: "Discussion", onglets: [{ cle: "discussion", libelle: "Discussion", vue: "discussion" }] },
  {
    cle: "prospects",
    libelle: "Prospects",
    onglets: [
      { cle: "liste", libelle: "Liste", vue: "prospects" },
      { cle: "carte", libelle: "Carte", vue: "carte" },
    ],
  },
  {
    cle: "marketing",
    libelle: "Marketing",
    onglets: [
      { cle: "campagnes", libelle: "Campagnes", vue: "campagnes" },
      { cle: "contenus", libelle: "Contenus", vue: "contenus" },
      { cle: "calendrier", libelle: "Calendrier", vue: "calendrier" },
      { cle: "resultats", libelle: "Résultats", vue: "resultats" },
      { cle: "equipe", libelle: "Équipe", vue: "equipe" },
      { cle: "rapport", libelle: "Rapport du mois", vue: "rapport" },
    ],
  },
  {
    cle: "reglages",
    libelle: "Réglages",
    onglets: [
      { cle: "mise-en-place", libelle: "Mise en place", vue: "mise-en-place" },
      { cle: "marque", libelle: "Marque et sources", vue: "marque" },
      { cle: "connaissances", libelle: "Connaissances", vue: "connaissances" },
      { cle: "reel", libelle: "Passage au réel", vue: "parametres", ancre: ANCRE_PASSAGE_AU_REEL },
      { cle: "parametres", libelle: "Paramètres", vue: "parametres" },
      { cle: "corbeille", libelle: "Corbeille", vue: "corbeille" },
    ],
  },
];

/** Rubrique visible dans la seule entreprise Direction du client (le serveur refuse le registre ailleurs). */
export const RUBRIQUE_DIRECTION: RubriqueNav = {
  cle: "direction",
  libelle: "Direction",
  onglets: [{ cle: "echanges", libelle: "Registre des échanges", vue: "echanges" }],
};

/** Rubriques affichées : les cinq habituelles, plus « Direction » seulement quand le serveur l'autorise. */
export function rubriquesVisibles(estDirection: boolean): ReadonlyArray<RubriqueNav> {
  return estDirection ? [...RUBRIQUES_NAV.slice(0, -1), RUBRIQUE_DIRECTION, RUBRIQUES_NAV[RUBRIQUES_NAV.length - 1]!] : RUBRIQUES_NAV;
}

/** Adresse relative d'un onglet : l'ancienne adresse de sa vue, avec son ancre éventuelle. */
export function cheminOnglet(o: OngletRubrique): string {
  return `${chemin(o.vue)}${o.ancre ? `#${o.ancre}` : ""}`;
}

/** Rubrique et onglet d'une vue ; `hash` (sans « # ») départage Passage au réel et Paramètres. */
export function rubriqueDe(vue: CleVue, hash = ""): { rubrique: RubriqueNav; onglet: OngletRubrique } {
  const ancre = hash.replace(/^#/u, "");
  const candidats = [...RUBRIQUES_NAV, RUBRIQUE_DIRECTION].flatMap((r) => r.onglets.filter((o) => o.vue === vue).map((onglet) => ({ rubrique: r, onglet })));
  const exact = candidats.find((c) => c.onglet.ancre !== undefined && c.onglet.ancre === ancre);
  const resultat = exact ?? candidats.find((c) => c.onglet.ancre === undefined) ?? candidats[0];
  return resultat ?? { rubrique: RUBRIQUES_NAV[0]!, onglet: RUBRIQUES_NAV[0]!.onglets[0]! };
}
