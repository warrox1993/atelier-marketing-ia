// Éléments communs aux simulateurs Google (lot L5) : lecture des dates, annotations,
// refus des dimensions que le modèle ne couvre pas. Aucun nombre n'est produit ici :
// les chiffres viennent de `modeleDemo` (src/demo/modele), le simulateur ne fait que
// les mettre à la forme des API Google.

import { SchemaDate, modeleDemo } from "../modele/index.js";
import type { AnnotationsOutil } from "../../fournisseurs.js";

/** Tous les outils Google de démonstration sont en lecture seule, comme les vraies API de reporting. */
export const ANNOTATIONS_LECTURE: AnnotationsOutil = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Valide une date AAAA-MM-JJ dans la période du modèle ; message clair en français. */
export function lireDate(valeur: string, nom: string): string {
  const analyse = SchemaDate.safeParse(valeur);
  if (!analyse.success) {
    const detail = analyse.error.issues.map((i) => i.message).join(" ; ");
    throw new Error(`${nom} invalide (« ${valeur} ») : ${detail}. Les dates relatives (today, 7daysAgo) ne sont pas prises en charge en démonstration.`);
  }
  return analyse.data;
}

/** Période début ≤ fin, dans la couverture du modèle. */
export function lirePeriode(debut: string, fin: string, nomDebut = "startDate", nomFin = "endDate"): { debut: string; fin: string } {
  const d = lireDate(debut, nomDebut);
  const f = lireDate(fin, nomFin);
  if (d > f) throw new Error(`${nomDebut} (${d}) doit précéder ou égaler ${nomFin} (${f}).`);
  return { debut: d, fin: f };
}

/** Erreur de dimension, de métrique ou de champ que le modèle ne couvre pas : refus explicite, jamais d'invention. */
export function refuserNonModelise(quoi: string, valeur: string, pris: readonly string[]): never {
  throw new Error(
    `${quoi} « ${valeur} » non modélisé(e) en démonstration : aucune donnée n'est inventée. Pris en charge : ${pris.join(", ")}.`,
  );
}

/** « 2026-09-30 » → « 20260930 » (format de la dimension `date` de GA4). */
export const dateCompacte = (date: string): string => date.replaceAll("-", "");

/** « 2026-09-30 » → { year, month, day } (format `Date` des API Google). */
export function dateGoogle(date: string): { year: number; month: number; day: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

export function dateDepuisGoogle(d: { year: number; month: number; day: number }): string {
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export { modeleDemo };
