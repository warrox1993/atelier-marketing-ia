// Éléments communs au simulateur `osm` (lot P3b) et au fournisseur OpenStreetMap réel (src/reel/prospection/osm/) : catégories,
// schémas d'entrée des outils, forme d'un commerce, attribution ODbL. Le réel importe ce fichier : les deux modes ne peuvent
// donc pas diverger sur les noms d'outils, les schémas d'entrée ni la forme des réponses.
//
// Licence des données d'OpenStreetMap : ODbL 1.0 (https://www.openstreetmap.org/copyright). Attribution : « © les contributeurs
// d'OpenStreetMap ». Partage à l'identique : une base DÉRIVÉE utilisée PUBLIQUEMENT doit rester sous ODbL (art. 4.4) ; un usage
// interne à l'organisation n'est pas public (art. 4.5). Voir docs/passerelle.md, « OpenStreetMap (P3b) ».

import * as z from "zod";

export const ATTRIBUTION_OSM = "© les contributeurs d'OpenStreetMap";
export const LICENCE_OSM = "ODbL 1.0, https://www.openstreetmap.org/copyright";

/** Catégories d'activité proposées aux agents (regroupement des clés OSM shop, amenity, craft, office, tourism, healthcare). */
export const CATEGORIES_OSM = ["commerce", "automobile", "restauration", "hebergement", "artisanat", "sante", "finance_assurance", "bureau"] as const;
export type CategorieOsm = (typeof CATEGORIES_OSM)[number];

export const LIBELLES_CATEGORIES: Record<CategorieOsm, string> = {
  commerce: "Commerces (clé OSM shop)",
  automobile: "Automobile : garages, concessions, stations, lavage, location",
  restauration: "Restauration et cafés",
  hebergement: "Hôtels et hébergements",
  artisanat: "Artisans (clé OSM craft)",
  sante: "Santé : pharmacies, médecins, dentistes, vétérinaires",
  finance_assurance: "Banques, assurances, comptables, conseillers financiers",
  bureau: "Autres bureaux et services (clé OSM office)",
};

export const FICHE_OSM = {
  id: "osm",
  libelle: "OpenStreetMap (commerces et activités)",
  portees: ["osm:lecture"],
  proprietesDemo: [{ id: "extrait/demo-osm", libelle: "Extrait OpenStreetMap de démonstration (commerces fictifs)" }],
} as const;

export const PROPRIETE_OSM_REEL = { id: "extrait/osm-belgique", libelle: "Extrait OpenStreetMap de la Belgique (Geofabrik)" } as const;

export const TAILLE_PAGE_OSM = 10;

/** Minuscules, sans accents ni ponctuation. */
export function normaliserOsm(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const formeZoneOsm = {
  communes: z.array(z.string().min(1).max(60)).max(20).optional().describe("Communes (nom français, sans tenir compte des accents). Plusieurs valeurs = l'une OU l'autre."),
  codes_postaux: z.array(z.string().regex(/^\d{4}$/, "code postal à 4 chiffres")).max(50).optional().describe("Codes postaux belges (4 chiffres)."),
  provinces: z.array(z.string().min(1).max(40)).max(11).optional().describe("Provinces (Liège, Namur, Flandre orientale…)."),
  regions: z.array(z.enum(["Wallonie", "Bruxelles-Capitale", "Flandre"])).max(3).optional().describe("Régions."),
};

export const schemaCommerces = {
  categories: z.array(z.enum(CATEGORIES_OSM)).max(CATEGORIES_OSM.length).optional().describe(`Catégories : ${CATEGORIES_OSM.join(", ")}. Plusieurs valeurs = l'une OU l'autre.`),
  ...formeZoneOsm,
  nom: z.string().min(2).max(80).optional().describe("Fragment du nom de l'établissement (sans tenir compte des accents ni de la casse)."),
  page: z.number().int().min(1).max(10_000).optional().describe(`Numéro de page, à partir de 1 (${TAILLE_PAGE_OSM} résultats par page).`),
};

export const schemaRepartition = {
  categories: schemaCommerces.categories,
  ...formeZoneOsm,
};

export const DESCRIPTION_COMMERCES =
  "Commerces, restaurants, hôtels, artisans, bureaux et autres établissements d'une zone, d'après l'extrait OpenStreetMap de la Belgique (hors ligne, mis à jour régulièrement). " +
  "Filtres : catégorie, zone (commune, code postal, province, région) et fragment du nom. Données de la communauté OpenStreetMap, pas du registre officiel : " +
  "un établissement peut manquer ou être périmé, et n'a pas de numéro d'entreprise. Licence ODbL : citer l'attribution renvoyée.";

export const DESCRIPTION_REPARTITION =
  "Nombre d'établissements OpenStreetMap par commune et par catégorie, pour repérer où se trouvent les commerces d'une zone (100 lignes au plus, les plus fournies d'abord).";

/** Un établissement tel que les outils le renvoient (identique en démonstration et en réel). */
export interface CommerceOsm {
  id: string;
  type: "node" | "way" | "relation";
  nom: string;
  categorie: CategorieOsm;
  cle: string;
  valeur: string;
  adresse: { rue: string | null; numero: string | null; code_postal: string | null; commune: string | null };
  telephone: string | null;
  site: string | null;
  horaires: string | null;
  marque: string | null;
  position: { lat: number; lon: number };
  url_osm: string | null;
}

/** Identifiant d'osmium export (`--add-unique-id=type_id`) : n123 = nœud, w123 = chemin, r123 = relation, a123 = surface (2×id pour un chemin, 2×id+1 pour une relation). */
export function typeEtUrlOsm(id: string): { type: CommerceOsm["type"]; url: string | null } {
  const m = /^([nwra])(\d+)$/.exec(id);
  if (!m) return { type: "node", url: null };
  const num = Number(m[2]);
  let type: CommerceOsm["type"];
  let numero = num;
  if (m[1] === "n") type = "node";
  else if (m[1] === "w") type = "way";
  else if (m[1] === "r") type = "relation";
  else if (num % 2 === 0) {
    type = "way";
    numero = num / 2;
  } else {
    type = "relation";
    numero = (num - 1) / 2;
  }
  return { type, url: `https://www.openstreetmap.org/${type}/${numero}` };
}
