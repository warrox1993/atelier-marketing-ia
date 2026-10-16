// Éléments communs aux simulateurs de prospection (lot P2). Les briques neutres (formes de zone, secteur, pagination, outil de
// lecture) sont dans src/commun/prospection/commun.ts (partagées avec le réel) et ré-exportées ici ; reste ce qui dépend du jeu.

import { normaliser, type FiltreZone } from "../../commun/prospection/commun.js";
import type { AdresseDemo } from "./jeu.js";

export * from "../../commun/prospection/commun.js";

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
