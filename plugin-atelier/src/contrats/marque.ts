/**
 * Marque classique (identité, ton, offres, zones, établissements, affirmations) : socle du
 * référentiel du client (`referentiel.ts`). Fichier à part pour éviter un import circulaire
 * entre `ui.ts` et `referentiel.ts`.
 */
import { z } from "zod";
import { Horodatage, IdNatif } from "./communs.js";

/**
 * Position géographique d'un bureau, saisie par un humain (aucune valeur n'est déduite : un bureau sans
 * position reste sans position, jamais de centroïde de prospects, ce serait une fausse précision).
 */
export const PositionEtablissement = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();
export type PositionEtablissement = z.infer<typeof PositionEtablissement>;

export const Marque = z.object({
  id: IdNatif,
  companyId: IdNatif,
  version: z.number().int().positive(),
  identite: z.string(),
  ton: z.string(),
  offres: z.array(z.object({ nom: z.string(), description: z.string(), confirmee: z.boolean() })),
  zones: z.array(z.string()),
  etablissements: z.array(z.object({ nom: z.string(), adresse: z.string().nullable(), confirme: z.boolean(), position: PositionEtablissement.nullable().optional() })),
  affirmationsAutorisees: z.array(z.object({ texte: z.string(), sourceId: IdNatif.nullable() })),
  informationsManquantes: z.array(z.string()),
  creeLe: Horodatage,
});
export type Marque = z.infer<typeof Marque>;
export const MarqueSaisie = Marque.omit({ id: true, companyId: true, version: true, creeLe: true });
export type MarqueSaisie = z.infer<typeof MarqueSaisie>;
