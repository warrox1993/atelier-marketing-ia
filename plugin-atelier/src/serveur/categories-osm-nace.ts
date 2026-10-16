/**
 * Correspondance explicite entre les étiquettes OpenStreetMap de la santé et les codes NACE belges (NACE-BEL 2008).
 *
 * Un lieu OpenStreetMap n'a pas de code NACE : on le déduit de son étiquette (clé=valeur) seulement quand la
 * correspondance est évidente. Toute étiquette absente de la table n'a PAS de correspondance : le critère
 * « segment » de la confiance de qualification reste alors « non vérifié ». Un NACE déduit n'est jamais
 * enregistré sur le prospect (il reste un NACE de la BCE ou rien) : il sert seulement à comparer aux segments.
 */
import type { Prospect } from "../contrats/index.js";

export interface CorrespondanceOsmNace {
  /** Libellé français affiché dans les détails (« dentiste »). */
  readonly libelle: string;
  /** Codes NACE déduits, au format avec points. */
  readonly nace: readonly string[];
}

export const CATEGORIES_OSM_NACE: Readonly<Record<string, CorrespondanceOsmNace>> = {
  "amenity=doctors": { libelle: "médecin", nace: ["86.210", "86.220"] },
  "amenity=dentist": { libelle: "dentiste", nace: ["86.230"] },
  "healthcare=dentist": { libelle: "dentiste", nace: ["86.230"] },
  "amenity=pharmacy": { libelle: "pharmacie", nace: ["47.730"] },
  "healthcare=pharmacy": { libelle: "pharmacie", nace: ["47.730"] },
  "amenity=clinic": { libelle: "centre de santé", nace: ["86.210", "86.220"] },
  "healthcare=centre": { libelle: "centre de santé", nace: ["86.210", "86.220"] },
  "healthcare=clinic": { libelle: "centre de santé", nace: ["86.210", "86.220"] },
  "healthcare=doctor": { libelle: "médecin", nace: ["86.210", "86.220"] },
  // Code belge des kinésithérapeutes, à confirmer.
  "healthcare=physiotherapist": { libelle: "kinésithérapeute", nace: ["86.906"] },
  "amenity=hospital": { libelle: "hôpital", nace: ["86.100"] },
  "healthcare=hospital": { libelle: "hôpital", nace: ["86.100"] },
  "amenity=veterinary": { libelle: "vétérinaire", nace: ["75.000"] },
};

/** NACE déduits de l'étiquette OpenStreetMap portée par les sources du prospect ; null si aucune correspondance. */
export function naceDeduitOsm(p: Pick<Prospect, "sources">): { libelle: string; nace: readonly string[] } | null {
  for (const s of p.sources) {
    if (s.categorieOsm === undefined) continue;
    const c = CATEGORIES_OSM_NACE[`${s.categorieOsm.cle}=${s.categorieOsm.valeur}`];
    if (c !== undefined) return c;
  }
  return null;
}
