// Définitions neutres (nom, schéma d'entrée, annotations) des outils Pipedrive, partagées par le simulateur
// (src/demo/social-crm/pipedrive.ts) et le fournisseur réel (src/reel/social-crm/pipedrive.ts). `date` est le schéma de date du mode.

import * as z from "zod";
import { defLecture, defMutation, formeAuAvec, formePeriodeAvec } from "./outils.js";

const formePagination = {
  start: z.number().int().min(0).max(1_000_000).default(0).describe("Index du premier élément (0 par défaut)."),
  limit: z.number().int().min(1).max(500).default(100).describe("Éléments par page (100 par défaut, 500 au plus)."),
};

export function definitionsPipedrive(date: z.ZodString) {
  const formePeriode = formePeriodeAvec(date);
  const formeAu = formeAuAvec(date);
  return {
    pipedrive_personnes: defLecture("pipedrive_personnes", { ...formePeriode, ...formeAu, ...formePagination }),
    pipedrive_affaires: defLecture("pipedrive_affaires", { ...formePeriode, ...formeAu, ...formePagination }),
    pipedrive_modifier_personne: defMutation("pipedrive_modifier_personne", {
        id: z.number().int().positive().describe("Identifiant de la personne (champ `id` de pipedrive_personnes)."),
        champs: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.union([z.string().max(500), z.number(), z.boolean()])).describe("Champs à modifier (PUT /v1/persons/{id})."),
      }, false),
  };
}
