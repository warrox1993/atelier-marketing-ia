// Numéros BCE de démonstration (lot P2, docs/prospection-conception.md §7).
//
// Les numéros de démonstration ont un chiffre de contrôle VOLONTAIREMENT FAUX : ils échouent au contrôle
// modulo 97, donc ne peuvent correspondre à aucune vraie entreprise. Le contrôle, l'analyse et la mise en forme
// des numéros sont dans src/commun/prospection/numeros.ts (partagés avec le réel), ré-exportés ici.

import { alea } from "../modele/alea.js";
import { controleValide, type TypeNumero } from "../../commun/prospection/numeros.js";

export * from "../../commun/prospection/numeros.js";

/**
 * Numéro de démonstration tiré de la graine : base de 8 chiffres, puis chiffre de contrôle faux.
 * `essai` décale la base en cas de collision (le jeu garantit l'unicité).
 */
export function numeroDemonstration(type: TypeNumero, cle: string, essai = 0): string {
  const hasard = Math.floor(alea("prospection", "numero", type, cle, essai) * 10 ** 7);
  const entete = type === "etablissement" ? 2 : alea("prospection", "numero-tete", cle, essai) < 0.5 ? 0 : 1;
  const base = `${entete}${String(hasard).padStart(7, "0")}`;
  const valide = controleValide(base);
  // Décalage de 1 à 95 modulo 97 sur 1..97 : le résultat ne peut jamais redonner le contrôle valide.
  const decalage = 1 + Math.floor(alea("prospection", "controle-faux", type, cle, essai) * 95);
  const faux = ((valide - 1 + decalage) % 97) + 1;
  return `${base}${String(faux).padStart(2, "0")}`;
}
