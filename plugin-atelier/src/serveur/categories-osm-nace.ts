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
  /** Vrai : catégorie de santé connue mais hors des professions assurées visées (le critère segment est alors contraire). */
  readonly horsCible?: boolean;
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

/**
 * Catégories de santé ou d'action sociale connues mais HORS des professions assurées visées (médecins, dentistes,
 * pharmacies, kinésithérapeutes, hôpitaux, vétérinaires). Elles ne doivent pas rester « non vérifiées » : un humain
 * perdrait du temps sur des lieux hors cible (don de sang, laboratoire, planning familial...).
 * Liste volontairement explicite : une étiquette absente reste sans correspondance.
 */
const HORS_CIBLE: Readonly<Record<string, CorrespondanceOsmNace>> = {
  "healthcare=blood_donation": { libelle: "don de sang", nace: ["86.900"], horsCible: true },
  "healthcare=laboratory": { libelle: "laboratoire", nace: ["86.900"], horsCible: true },
  "healthcare=speech_therapist": { libelle: "logopède", nace: ["86.900"], horsCible: true },
  "healthcare=podiatrist": { libelle: "podologue", nace: ["86.900"], horsCible: true },
  "healthcare=optometrist": { libelle: "optométriste", nace: ["86.900"], horsCible: true },
  "healthcare=audiologist": { libelle: "audioprothésiste", nace: ["86.900"], horsCible: true },
  "healthcare=psychotherapist": { libelle: "psychothérapeute", nace: ["86.900"], horsCible: true },
  "healthcare=alternative": { libelle: "médecine alternative", nace: ["86.900"], horsCible: true },
  "healthcare=midwife": { libelle: "sage-femme", nace: ["86.900"], horsCible: true },
  "healthcare=counselling": { libelle: "centre d'écoute et de planning familial", nace: ["88.999"], horsCible: true },
  "amenity=social_facility": { libelle: "structure d'action sociale", nace: ["88.999"], horsCible: true },
};

/** NACE déduits de l'étiquette OpenStreetMap portée par les sources du prospect ; null si aucune correspondance. */
export function naceDeduitOsm(p: Pick<Prospect, "sources">): CorrespondanceOsmNace | null {
  for (const s of p.sources) {
    if (s.categorieOsm === undefined) continue;
    const cle = `${s.categorieOsm.cle}=${s.categorieOsm.valeur}`;
    const c = CATEGORIES_OSM_NACE[cle] ?? HORS_CIBLE[cle];
    if (c !== undefined) return c;
  }
  return null;
}
