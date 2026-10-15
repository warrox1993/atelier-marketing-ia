// Éléments communs aux simulateurs de prospection (lot P2) : filtres de zone et de secteur, pagination,
// annotations de lecture seule. Aucun chiffre n'est tiré ici : tout vient du jeu (jeu.ts).

import * as z from "zod";
import type { AnnotationsOutil, ContexteAppel, OutilPasserelle } from "../../fournisseurs.js";
import type { AdresseDemo } from "./jeu.js";

export const ANNOTATIONS_LECTURE: AnnotationsOutil = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TAILLE_PAGE = 10;

/** Minuscules, sans accents ni ponctuation : « Saint-Nicolas » = « saint nicolas ». */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// --- Zone ---------------------------------------------------------------------------------------------------

export const formeZone = {
  communes: z.array(z.string().min(1).max(60)).max(20).optional().describe("Communes (nom français, sans tenir compte des accents). Plusieurs valeurs = l'une OU l'autre."),
  codes_postaux: z.array(z.string().regex(/^\d{4}$/, "code postal à 4 chiffres")).max(50).optional().describe("Codes postaux belges (4 chiffres)."),
  provinces: z.array(z.string().min(1).max(40)).max(11).optional().describe("Provinces (Liège, Namur, Flandre orientale…)."),
  regions: z.array(z.enum(["Wallonie", "Bruxelles-Capitale", "Flandre"])).max(3).optional().describe("Régions."),
  pays: z.array(z.string().length(2)).max(5).optional().describe("Codes pays ISO à 2 lettres (en démonstration : BE seulement)."),
};

export interface FiltreZone {
  communes?: string[] | undefined;
  codes_postaux?: string[] | undefined;
  provinces?: string[] | undefined;
  regions?: string[] | undefined;
  pays?: string[] | undefined;
}

/** Les critères donnés se cumulent (ET) ; à l'intérieur d'un critère, une valeur suffit (OU). */
export function adresseDansZone(adresse: AdresseDemo, f: FiltreZone): boolean {
  const dans = (valeurs: string[] | undefined, candidate: string | null): boolean =>
    valeurs === undefined || valeurs.length === 0 || (candidate !== null && valeurs.some((v) => normaliser(v) === normaliser(candidate)));
  return (
    dans(f.communes, adresse.commune) &&
    dans(f.codes_postaux, adresse.codePostal) &&
    dans(f.provinces, adresse.province) &&
    dans(f.regions, adresse.region) &&
    dans(f.pays, adresse.pays)
  );
}

export function zoneDonnee(f: FiltreZone): boolean {
  return [f.communes, f.codes_postaux, f.provinces, f.regions, f.pays].some((v) => v !== undefined && v.length > 0);
}

// --- Secteur --------------------------------------------------------------------------------------------------

export const formeNace = {
  nace: z.array(z.string().regex(/^\d{2}(\.?\d{1,3})?$/, "code NACE de 2 à 5 chiffres (43, 43.91, 43910)")).max(20).optional()
    .describe("Codes NACE (2008 ou 2025) ou préfixes : 43 = construction spécialisée, 43.91 = couverture. Plusieurs valeurs = l'une OU l'autre."),
};

export function codesNaceCorrespondent(codes: readonly string[], filtres: string[] | undefined): boolean {
  if (filtres === undefined || filtres.length === 0) return true;
  const prefixes = filtres.map((f) => f.replace(".", ""));
  return codes.some((c) => prefixes.some((p) => c.startsWith(p)));
}

/** « 43910 » → « 43.910 » (écriture usuelle des codes NACE-BEL). */
export const pointNace = (c: string): string => `${c.slice(0, 2)}.${c.slice(2)}`;

// --- Dates -----------------------------------------------------------------------------------------------------

export function verifierDateIso(valeur: string, nom: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !d || d.toISOString().slice(0, 10) !== valeur) throw new Error(`${nom} invalide (« ${valeur} ») : date civile AAAA-MM-JJ attendue.`);
  return valeur;
}

// --- Pagination ------------------------------------------------------------------------------------------------

export const formePage = { page: z.number().int().min(1).max(10_000).optional().describe(`Numéro de page, à partir de 1 (${TAILLE_PAGE} résultats par page).`) };

export function paginer<T>(liste: readonly T[], page: number | undefined): { total: number; page: number; taille_page: number; pages: number; elements: T[] } {
  const p = page ?? 1;
  return { total: liste.length, page: p, taille_page: TAILLE_PAGE, pages: Math.max(1, Math.ceil(liste.length / TAILLE_PAGE)), elements: liste.slice((p - 1) * TAILLE_PAGE, p * TAILLE_PAGE) };
}

// --- Outils ----------------------------------------------------------------------------------------------------

export function outilLecture<S extends z.ZodRawShape>(
  definition: { nom: string; description: string; schemaEntree: S },
  executer: (args: z.output<z.ZodObject<S>>, contexte: ContexteAppel) => unknown,
): OutilPasserelle {
  return {
    nom: definition.nom,
    description: `LECTURE. ${definition.description}`,
    schemaEntree: definition.schemaEntree,
    annotations: ANNOTATIONS_LECTURE,
    executer: (args, contexte) => executer(args as z.output<z.ZodObject<S>>, contexte),
  };
}
