/**
 * Navigation de l'atelier : un menu secondaire de bureau (Prospects, Marketing, registre de la Direction) ;
 * le chat, les Réglages et les vues d'ensemble s'ouvrent depuis le menu principal. Les treize vues et leurs adresses (`/atelier/<vue>`)
 * ne changent pas : une rubrique regroupe des vues sous forme d'onglets, et chaque ancienne
 * adresse ouvre la bonne rubrique sur le bon onglet. Fonctions pures (testées).
 */
import { ANCRE_PASSAGE_AU_REEL } from "./realite.js";
import { chemin, type CleVue } from "./route.js";

export type CleRubriqueNav = "departements" | "accueil" | "discussion" | "prospects" | "marketing" | "reglages" | "direction" | "organigramme";

export interface OngletRubrique {
  cle: string;
  libelle: string;
  /** Vue existante réutilisée telle quelle dans l'onglet. */
  vue: CleVue;
  /** Ancre qui distingue deux onglets d'une même vue (Paramètres et Connexions). */
  ancre?: string;
}

export interface RubriqueNav {
  cle: CleRubriqueNav;
  libelle: string;
  onglets: ReadonlyArray<OngletRubrique>;
}

/** Chat de l'atelier : plus de rubrique affichée (le menu principal l'ouvre), reconnue seulement depuis l'adresse. */
export const RUBRIQUE_DISCUSSION: RubriqueNav = {
  cle: "discussion",
  libelle: "Discussion",
  onglets: [{ cle: "discussion", libelle: "Discussion", vue: "discussion" }],
};

/** Ancienne page « À faire » : son adresse ouvre le chat ; reconnue seulement depuis l'adresse. */
export const RUBRIQUE_ACCUEIL: RubriqueNav = {
  cle: "accueil",
  libelle: "Accueil",
  onglets: [{ cle: "accueil", libelle: "Accueil", vue: "accueil" }],
};

/**
 * Réglages de l'atelier : ses onglets s'affichent en tête de page, mais la rubrique n'est plus dans le menu
 * secondaire (le menu principal propose « Réglages de l'atelier »).
 */
export const RUBRIQUE_REGLAGES: RubriqueNav = {
  cle: "reglages",
  libelle: "Réglages",
  onglets: [
    { cle: "mise-en-place", libelle: "Mise en place", vue: "mise-en-place" },
    { cle: "marque", libelle: "Marque et sources", vue: "marque" },
    { cle: "connaissances", libelle: "Connaissances", vue: "connaissances" },
    { cle: "reel", libelle: "Connexions", vue: "parametres", ancre: ANCRE_PASSAGE_AU_REEL },
    { cle: "parametres", libelle: "Paramètres", vue: "parametres" },
    { cle: "corbeille", libelle: "Corbeille", vue: "corbeille" },
  ],
};

/** Rubriques du menu secondaire d'un bureau de prospection et de marketing. */
export const RUBRIQUES_NAV: ReadonlyArray<RubriqueNav> = [
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
      { cle: "tableau", libelle: "Tableau de direction", vue: "tableau" },
      { cle: "rapport", libelle: "Rapport du mois", vue: "rapport" },
    ],
  },
];

/** Slug du service qui porte la prospection et le marketing. */
export const SLUG_MARKETING = "marketing";

/** Rubrique visible dans la seule entreprise Direction du client (le serveur refuse le registre ailleurs). */
export const RUBRIQUE_DIRECTION: RubriqueNav = {
  cle: "direction",
  libelle: "Registre des échanges",
  onglets: [{ cle: "echanges", libelle: "Registre des échanges", vue: "echanges" }],
};

/**
 * Vues d'ensemble du client (pour un client à au moins deux services). Elles ne figurent pas dans les rubriques
 * affichées : le menu principal de l'hôte propose « Départements » et « Organigramme », et ces deux vues n'ont
 * ni deuxième colonne ni onglets. Les rubriques ci-dessous servent seulement à les reconnaître depuis l'adresse.
 */
export const RUBRIQUE_DEPARTEMENTS: RubriqueNav = {
  cle: "departements",
  libelle: "Départements",
  onglets: [{ cle: "departements", libelle: "Départements", vue: "departements" }],
};

export const RUBRIQUE_ORGANIGRAMME: RubriqueNav = {
  cle: "organigramme",
  libelle: "Organigramme",
  onglets: [{ cle: "organigramme", libelle: "Organigramme", vue: "organigramme" }],
};

/** Vraie pour les deux vues d'ensemble du client, sans deuxième colonne ni onglets de rubrique. */
export function estVueEnsemble(vue: CleVue): boolean {
  return vue === "departements" || vue === "organigramme";
}

/** Vraie pour les vues qui s'affichent sans menu secondaire : vues d'ensemble, chat et Réglages. */
export function sansMenuSecondaire(vue: CleVue, hash = ""): boolean {
  return estVueEnsemble(vue) || vue === "discussion" || vue === "accueil" || rubriqueDe(vue, hash).rubrique.cle === "reglages";
}

export interface ContexteRubriques {
  estDirection: boolean;
  /** Slug du service de l'entreprise courante ; null si le client n'a pas de départements (un seul bureau). */
  slugService: string | null;
}

/**
 * Rubriques du menu secondaire : Prospects et Marketing pour le bureau marketing (ou un client sans départements),
 * « Registre des échanges » seulement dans l'entreprise Direction quand le serveur l'autorise.
 */
export function rubriquesVisibles({ estDirection, slugService }: ContexteRubriques): ReadonlyArray<RubriqueNav> {
  const bureau = slugService === null || slugService === SLUG_MARKETING ? RUBRIQUES_NAV : [];
  return estDirection ? [...bureau, RUBRIQUE_DIRECTION] : bureau;
}

/** Adresse relative d'un onglet : l'ancienne adresse de sa vue, avec son ancre éventuelle. */
export function cheminOnglet(o: OngletRubrique): string {
  return `${chemin(o.vue)}${o.ancre ? `#${o.ancre}` : ""}`;
}

/** Rubrique et onglet d'une vue ; `hash` (sans « # ») départage Connexions et Paramètres. */
export function rubriqueDe(vue: CleVue, hash = ""): { rubrique: RubriqueNav; onglet: OngletRubrique } {
  const ancre = hash.replace(/^#/u, "");
  const candidats = [RUBRIQUE_ACCUEIL, RUBRIQUE_DISCUSSION, ...RUBRIQUES_NAV, RUBRIQUE_REGLAGES, RUBRIQUE_DIRECTION, RUBRIQUE_DEPARTEMENTS, RUBRIQUE_ORGANIGRAMME].flatMap((r) => r.onglets.filter((o) => o.vue === vue).map((onglet) => ({ rubrique: r, onglet })));
  const exact = candidats.find((c) => c.onglet.ancre !== undefined && c.onglet.ancre === ancre);
  const resultat = exact ?? candidats.find((c) => c.onglet.ancre === undefined) ?? candidats[0];
  return resultat ?? { rubrique: RUBRIQUE_DISCUSSION, onglet: RUBRIQUE_DISCUSSION.onglets[0]! };
}
