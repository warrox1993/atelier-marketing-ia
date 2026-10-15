// Enregistrement des simulateurs Google (lot L5) dans le registre de la passerelle, en mode `demonstration`.
// Appelé au démarrage (src/demarrer.ts). Les mêmes noms d'outils devront exister dans le fournisseur réel (lot L4).

import type { FournisseurService, RegistreFournisseurs } from "../../fournisseurs.js";
import { outilAds } from "./ads.js";
import { outilGa4 } from "./ga4.js";
import { outilAvis, outilMetriques } from "./gbp.js";
import { outilGsc } from "./gsc.js";

export const FOURNISSEURS_GOOGLE_DEMO: readonly FournisseurService[] = [
  { service: "gsc", mode: "demonstration", outils: [outilGsc] },
  { service: "ga4", mode: "demonstration", outils: [outilGa4] },
  { service: "ads", mode: "demonstration", outils: [outilAds] },
  { service: "gbp", mode: "demonstration", outils: [outilAvis, outilMetriques] },
];

/** Inscrit gsc, ga4, ads et gbp (fiche d'établissement) en démonstration. */
export function enregistrerGoogleDemo(registre: RegistreFournisseurs): RegistreFournisseurs {
  for (const fournisseur of FOURNISSEURS_GOOGLE_DEMO) registre.enregistrer(fournisseur);
  return registre;
}
