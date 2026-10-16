/**
 * Utilitaires géographiques partagés : distance à vol d'oiseau et province déduite du code postal belge.
 */

/** Distance à vol d'oiseau en kilomètres (formule de haversine). */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type RegionBelge = "Wallonie" | "Bruxelles-Capitale" | "Flandre";

/** Tranches officielles des codes postaux belges (bornes incluses), par province. */
const TRANCHES_POSTALES: ReadonlyArray<readonly [number, number, string]> = [
  [1000, 1299, "Bruxelles-Capitale"],
  [1300, 1499, "Brabant wallon"],
  [1500, 1999, "Brabant flamand"],
  [2000, 2999, "Anvers"],
  [3000, 3499, "Brabant flamand"],
  [3500, 3999, "Limbourg"],
  [4000, 4999, "Liège"],
  [5000, 5999, "Namur"],
  [6000, 6599, "Hainaut"],
  [6600, 6999, "Luxembourg"],
  [7000, 7999, "Hainaut"],
  [8000, 8999, "Flandre-Occidentale"],
  [9000, 9999, "Flandre-Orientale"],
];

/** Province (ou Bruxelles-Capitale) d'un code postal belge à 4 chiffres ; null si inconnu. */
export function provinceDuCodePostal(codePostal: string | null | undefined): string | null {
  if (codePostal === null || codePostal === undefined || !/^\d{4}$/u.test(codePostal)) return null;
  const n = Number(codePostal);
  return TRANCHES_POSTALES.find(([min, max]) => n >= min && n <= max)?.[2] ?? null;
}

const PROVINCES_WALLONNES = new Set(["Brabant wallon", "Hainaut", "Liège", "Luxembourg", "Namur"]);

/** Région d'une province telle que renvoyée par `provinceDuCodePostal`. */
export function regionDeLaProvince(province: string): RegionBelge {
  if (province === "Bruxelles-Capitale") return "Bruxelles-Capitale";
  return PROVINCES_WALLONNES.has(province) ? "Wallonie" : "Flandre";
}
