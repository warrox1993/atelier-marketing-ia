// Définitions neutres (nom, schéma d'entrée, annotations) des outils HubSpot, partagées par le simulateur
// (src/demo/social-crm/hubspot.ts) et le fournisseur réel (src/reel/social-crm/hubspot.ts). `date` est le schéma de date du mode.

import * as z from "zod";
import { defLecture, defMutation, formeAuAvec, formePeriodeAvec } from "./outils.js";

const LIMITE_DEFAUT = 10;
const LIMITE_MAX = 100;

const formePagination = {
  limit: z.number().int().min(1).max(LIMITE_MAX).default(LIMITE_DEFAUT).describe("Résultats par page (10 par défaut, 100 au plus)."),
  after: z.string().max(20).optional().describe("Curseur `paging.next.after` de la page précédente."),
};

export function definitionsHubspot(date: z.ZodString) {
  const formePeriode = formePeriodeAvec(date);
  const formeAu = formeAuAvec(date);
  return {
    crm_contacts: defLecture("crm_contacts", { ...formePeriode, ...formeAu, ...formePagination }),
    crm_transactions: defLecture("crm_transactions", { ...formePeriode, ...formeAu, ...formePagination }),
    crm_modifier_contact: defMutation("crm_modifier_contact", {
        contact_id: z.string().regex(/^\d{1,20}$/, "identifiant numérique attendu").describe("Identifiant du contact (champ `id` de crm_contacts)."),
        properties: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.string().max(500)).describe("Propriétés à modifier, valeurs en texte (comme PATCH /crm/v3/objects/contacts/{id})."),
      }, false),
  };
}
