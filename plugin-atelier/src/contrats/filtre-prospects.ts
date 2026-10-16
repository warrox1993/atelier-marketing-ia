/**
 * Filtre de la liste des prospects porté par l'adresse (`?statut=qualifie&segment=medecins`).
 *
 * Un seul format pour les deux sens : le Coordinateur le joint à une action `ouvrir` de la Discussion
 * (objet JSON), la télécommande le transforme en paramètres d'adresse, et la vue Prospects le relit.
 * Chaque champ a une forme fermée et bornée : une valeur hors forme est ignorée, jamais une erreur.
 */
import { z } from "zod";
import { StatutProspect } from "./prospection.js";

export const FiltreProspects = z
  .object({
    /** Étape du prospect : nouveau, exclu, qualifie, exporte, refuse. */
    statut: StatutProspect,
    /** Code de segment du référentiel du client. */
    segment: z.string().regex(/^[a-z0-9_-]{1,40}$/u),
    /** Identifiant de la campagne (mission). */
    campagne: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
    /** Communes ou codes postaux, séparés par des virgules. */
    zone: z.string().regex(/^[\p{L}\p{N} ,'.-]{1,80}$/u),
    /** Codes NACE, séparés par des virgules. */
    secteur: z.string().regex(/^[0-9., ]{1,60}$/u),
    source: z.enum(["reelle", "demonstration"]),
    /** Score minimal, entier de 0 à 100. */
    score: z.string().regex(/^(100|[1-9]?\d)$/u),
    /** « oui » : seulement les prospects qualifiés. */
    qualifies: z.literal("oui"),
  })
  .partial()
  .strict();
export type FiltreProspects = z.infer<typeof FiltreProspects>;

export const CLES_FILTRE_PROSPECTS = Object.keys(FiltreProspects.shape) as ReadonlyArray<keyof FiltreProspects>;

/** Paramètres d'adresse d'un filtre : correspondance explicite, champ inconnu ou invalide ignoré. */
export function parametresDepuisFiltre(filtre: unknown): URLSearchParams {
  const q = new URLSearchParams();
  if (typeof filtre !== "object" || filtre === null) return q;
  for (const cle of CLES_FILTRE_PROSPECTS) {
    const valeur = (filtre as Record<string, unknown>)[cle];
    if (valeur === undefined) continue;
    if (FiltreProspects.shape[cle].safeParse(valeur).success) q.set(cle, String(valeur));
  }
  return q;
}

/** Filtre lu dans une chaîne de recherche d'adresse (`?a=b`) : seuls les champs valides sont gardés. */
export function filtreDepuisAdresse(recherche: string): FiltreProspects {
  const q = new URLSearchParams(recherche.length > 2000 ? "" : recherche);
  const filtre: Record<string, string> = {};
  for (const cle of CLES_FILTRE_PROSPECTS) {
    const valeur = q.get(cle);
    if (valeur !== null && FiltreProspects.shape[cle].safeParse(valeur).success) filtre[cle] = valeur;
  }
  return filtre as FiltreProspects;
}
