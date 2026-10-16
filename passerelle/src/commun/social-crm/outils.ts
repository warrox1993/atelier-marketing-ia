// Briques neutres des outils réseaux sociaux et CRM (lot L7), partagées par les simulateurs (src/demo/social-crm/) et les
// fournisseurs réels (src/reel/social-crm/) : formes de période, annotations et définitions d'outils (nom, schéma d'entrée,
// annotations). Aucune donnée ni comportement fictif ici.

import * as z from "zod";
import type { AnnotationsOutil } from "../../fournisseurs.js";

export const ANNOTATIONS_LECTURE: AnnotationsOutil = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

/** Écriture : l'agent la présente à l'approbation humaine du plugin avant tout effet réel. */
export function annotationsMutation(destructive: boolean): AnnotationsOutil {
  return { readOnlyHint: false, destructiveHint: destructive, idempotentHint: false, openWorldHint: true };
}

/** Période : les deux dates sont obligatoires (aucune horloge cachée). `date` est le schéma de date du mode (borné au modèle en démonstration). */
export const formePeriodeAvec = (date: z.ZodString) => ({
  debut: date.describe("Premier jour de la période, AAAA-MM-JJ (modèle de démonstration : 2025-01-01 à 2027-12-31)."),
  fin: date.describe("Dernier jour de la période, AAAA-MM-JJ, inclus."),
});

/** Date d'observation du CRM (par défaut la fin de période) : état des étapes à ce jour. */
export const formeAuAvec = (date: z.ZodString) => ({
  au: date.optional().describe("Date à laquelle on observe l'état du CRM (par défaut : la fin de période)."),
});

/** Définition neutre d'un outil : nom, schéma d'entrée et annotations. */
export interface DefinitionOutil<S extends z.ZodRawShape = z.ZodRawShape> {
  nom: string;
  schemaEntree: S;
  annotations: AnnotationsOutil;
}

export function defLecture<S extends z.ZodRawShape>(nom: string, schemaEntree: S): DefinitionOutil<S> {
  return { nom, schemaEntree, annotations: ANNOTATIONS_LECTURE };
}

export function defMutation<S extends z.ZodRawShape>(nom: string, schemaEntree: S, destructif: boolean): DefinitionOutil<S> & { destructif: boolean } {
  return { nom, schemaEntree, annotations: annotationsMutation(destructif), destructif };
}
