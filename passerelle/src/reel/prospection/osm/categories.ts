// Classement des étiquettes OpenStreetMap (tags) en catégories d'activité d'atelier (lot P3b).
// Les clés retenues sont celles des commerces et activités : shop, craft, office, amenity (liste restreinte), tourism, healthcare.
// Un objet sans nom n'est pas retenu (inutilisable pour la prospection). Attention : le nom d'un indépendant peut être un nom de personne
// (voir la minimisation dans importer.ts).

import type { CategorieOsm } from "../../../demo/prospection/osm-commun.js";

export interface Classement {
  categorie: CategorieOsm;
  cle: string;
  valeur: string;
}

const SHOP_AUTOMOBILE = new Set(["car", "car_repair", "car_parts", "motorcycle", "motorcycle_repair", "tyres", "caravan", "truck"]);
// Valeurs de shop qui ne désignent pas un commerce en activité.
const SHOP_IGNORES = new Set(["vacant", "no", "yes", "empty"]);
const AMENITY_RESTAURATION = new Set(["restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "biergarten", "food_court"]);
const AMENITY_SANTE = new Set(["pharmacy", "doctors", "dentist", "clinic", "veterinary", "hospital"]);
const AMENITY_AUTOMOBILE = new Set(["fuel", "car_wash", "car_rental", "charging_station"]);
const TOURISME_HEBERGEMENT = new Set(["hotel", "guest_house", "hostel", "motel", "apartment", "chalet", "camp_site"]);
const OFFICE_FINANCE_ASSURANCE = new Set(["insurance", "financial", "financial_advisor", "accountant", "tax_advisor"]);

export function classer(tags: Readonly<Record<string, string>>): Classement | null {
  const shop = tags["shop"];
  if (shop && !SHOP_IGNORES.has(shop)) return { categorie: SHOP_AUTOMOBILE.has(shop) ? "automobile" : "commerce", cle: "shop", valeur: shop };
  const craft = tags["craft"];
  if (craft) return { categorie: "artisanat", cle: "craft", valeur: craft };
  const office = tags["office"];
  if (office && office !== "no") return { categorie: OFFICE_FINANCE_ASSURANCE.has(office) ? "finance_assurance" : "bureau", cle: "office", valeur: office };
  const amenity = tags["amenity"];
  if (amenity) {
    if (AMENITY_RESTAURATION.has(amenity)) return { categorie: "restauration", cle: "amenity", valeur: amenity };
    if (AMENITY_SANTE.has(amenity)) return { categorie: "sante", cle: "amenity", valeur: amenity };
    if (AMENITY_AUTOMOBILE.has(amenity)) return { categorie: "automobile", cle: "amenity", valeur: amenity };
    if (amenity === "bank") return { categorie: "finance_assurance", cle: "amenity", valeur: amenity };
  }
  const tourism = tags["tourism"];
  if (tourism && TOURISME_HEBERGEMENT.has(tourism)) return { categorie: "hebergement", cle: "tourism", valeur: tourism };
  const healthcare = tags["healthcare"];
  if (healthcare && healthcare !== "no") return { categorie: "sante", cle: "healthcare", valeur: healthcare };
  return null;
}
