// Définitions neutres (nom, schéma d'entrée, annotations) des outils Teamleader, partagées par le simulateur
// (src/demo/social-crm/teamleader.ts) et le fournisseur réel (src/reel/social-crm/teamleader.ts). `date` est le schéma de date du mode.

import * as z from "zod";
import { defLecture, defMutation, formeAuAvec, formePeriodeAvec } from "./outils.js";

const formePage = {
  page: z.object({
    size: z.number().int().min(1).max(100).default(20).describe("Éléments par page (20 par défaut, 100 au plus)."),
    number: z.number().int().min(1).max(100_000).default(1).describe("Numéro de page, à partir de 1."),
  }).default({ size: 20, number: 1 }).describe("Pagination : page.size et page.number."),
};

export function definitionsTeamleader(date: z.ZodString) {
  const formePeriode = formePeriodeAvec(date);
  const formeAu = formeAuAvec(date);
  return {
    teamleader_contacts: defLecture("teamleader_contacts", { ...formePeriode, ...formeAu, ...formePage }),
    teamleader_deals: defLecture("teamleader_deals", { ...formePeriode, ...formeAu, ...formePage }),
    teamleader_modifier_contact: defMutation("teamleader_modifier_contact", {
        id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "UUID attendu").describe("Identifiant du contact (champ `id` de teamleader_contacts)."),
        modifications: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.union([z.string().max(500), z.number(), z.boolean()])).describe("Champs à modifier (POST /contacts.update)."),
      }, false),
  };
}
