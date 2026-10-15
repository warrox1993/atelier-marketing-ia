// Enregistrement des simulateurs réseaux sociaux et CRM (lot L7) dans le registre de la
// passerelle. Appelé au démarrage (src/demarrer.ts) ; les fiches des sept services existent
// déjà dans le jeu par défaut (src/services.ts), seuls les fournisseurs sont ajoutés.

import type { RegistreFournisseurs } from "../../fournisseurs.js";
import { fournisseurHubspot } from "./hubspot.js";
import { fournisseurFacebook, fournisseurInstagram } from "./meta.js";
import { fournisseurLinkedin } from "./linkedin.js";
import { fournisseurOdoo } from "./odoo.js";
import { fournisseurPipedrive } from "./pipedrive.js";
import { fournisseurTeamleader } from "./teamleader.js";

/** Services servis par ce lot, dans l'ordre d'enregistrement (HubSpot porte l'identifiant `crm`). */
export const SERVICES_SOCIAL_CRM = ["facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"] as const;

/** Inscrit les sept fournisseurs de démonstration dans le registre. */
export function enregistrerSocialCrm(registre: RegistreFournisseurs): RegistreFournisseurs {
  return registre
    .enregistrer(fournisseurFacebook())
    .enregistrer(fournisseurInstagram())
    .enregistrer(fournisseurLinkedin())
    .enregistrer(fournisseurHubspot())
    .enregistrer(fournisseurPipedrive())
    .enregistrer(fournisseurOdoo())
    .enregistrer(fournisseurTeamleader());
}
