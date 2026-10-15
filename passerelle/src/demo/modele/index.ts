// Point d'entrée du modèle de démonstration (lot L3). Les simulateurs L5 (Google) et
// L7 (réseaux sociaux, CRM) importent d'ici, jamais des fichiers internes :
//   import { modeleDemo } from "../demo/modele/index.js";
// Documentation : docs/passerelle.md, section « Modèle de démonstration (L3) ».

export { ModeleDemo, creerModeleDemo, facteurDemande, indiceSaisonnier, tauxClicOrganique, type ServiceModele } from "./modele.js";
export { MARQUEUR_ENTREPRISE } from "./alea.js";
export type { DateIso } from "./calendrier.js";
export * from "./referentiel.js";
export * from "./schemas.js";

import { creerModeleDemo } from "./modele.js";

/** Instance partagée : le cache d'un jour sert à tous les outils de la passerelle. */
export const modeleDemo = creerModeleDemo();
