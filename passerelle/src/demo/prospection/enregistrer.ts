// Enregistrement des simulateurs de prospection (lot P2) dans le registre de la passerelle, en mode `demonstration`.
// Appelé au démarrage (src/demarrer.ts, une ligne). Les fiches bce, bnb et fsma viennent des fournisseurs (champ `fiche`).

import type { FournisseurService, RegistreFournisseurs } from "../../fournisseurs.js";
import { fournisseurBce } from "./bce.js";
import { fournisseurBnb } from "./bnb.js";
import { fournisseurFsma } from "./fsma.js";
import { fournisseurB2c } from "./particuliers.js";

export const SERVICES_PROSPECTION = ["bce", "bnb", "fsma"] as const;

export const FOURNISSEURS_PROSPECTION_DEMO = (): readonly FournisseurService[] => [fournisseurBce(), fournisseurBnb(), fournisseurFsma(), fournisseurB2c()];

/** Inscrit bce, bnb, fsma et b2c (particuliers du courtier) en démonstration. */
export function enregistrerProspectionDemo(registre: RegistreFournisseurs): RegistreFournisseurs {
  for (const fournisseur of FOURNISSEURS_PROSPECTION_DEMO()) registre.enregistrer(fournisseur);
  return registre;
}
