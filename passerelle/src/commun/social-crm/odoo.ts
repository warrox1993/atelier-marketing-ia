// Définitions neutres (nom, schéma d'entrée, annotations) des outils Odoo, partagées par le simulateur
// (src/demo/social-crm/odoo.ts) et le fournisseur réel (src/reel/social-crm/odoo.ts). `date` est le schéma de date du mode.

import * as z from "zod";
import { defLecture, defMutation, formeAuAvec, formePeriodeAvec } from "./outils.js";

const OPERATEURS = ["=", "!=", ">", ">=", "<", "<=", "in", "not in", "ilike", "like"] as const;
export const SchemaClause = z.tuple([z.string().max(64), z.enum(OPERATEURS), z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.union([z.string().max(200), z.number(), z.boolean()])).max(50)])]);

export function definitionsOdoo(date: z.ZodString) {
  const formePeriode = formePeriodeAvec(date);
  const formeAu = formeAuAvec(date);
  return {
    odoo_leads_search_read: defLecture("odoo_leads_search_read", {
        ...formePeriode,
        ...formeAu,
        domain: z.array(SchemaClause).max(20).default([]).describe('Domaine Odoo en triplets [champ, opérateur, valeur], par exemple [["type","=","lead"]]. Seul le « et » implicite est pris en charge.'),
        fields: z.array(z.string().max(64)).max(30).default([]).describe("Champs demandés (tous si vide) ; `id` est toujours renvoyé."),
        offset: z.number().int().min(0).max(1_000_000).default(0).describe("Décalage (offset) de la pagination."),
        limit: z.number().int().min(1).max(500).default(80).describe("Nombre maximal d'enregistrements (limit)."),
        order: z.string().max(200).default("id desc").describe('Ordre de tri, par exemple "create_date desc".'),
        id: z.number().int().default(1).describe("Identifiant de la requête JSON-RPC, renvoyé tel quel."),
      }),
    odoo_ecrire_lead: defMutation("odoo_ecrire_lead", {
        ids: z.array(z.number().int().positive()).min(1).max(50).describe("Identifiants des leads (champ `id` de odoo_leads_search_read)."),
        values: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.union([z.string().max(500), z.number(), z.boolean()])).describe("Valeurs à écrire, par nom de champ."),
      }, false),
  };
}
