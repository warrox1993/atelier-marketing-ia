/**
 * Plafonds de dépenses publicitaires (décision de l'opérateur du 15/10/2026).
 *
 * Le CLIENT choisit, pour l'entreprise et pour chaque campagne, soit un montant
 * maximal, soit « aucune limite ». Ce choix est une décision humaine explicite et
 * tracée (qui, quand). Il ne remplace jamais l'approbation : même sans limite,
 * toute dépense exige une approbation humaine à portée précise (montant, canal,
 * durée), que le serveur revérifie à chaque diffusion.
 *
 * Trois états, jamais confondus :
 * - `null` : aucun choix fait (le serveur refuse alors toute dépense publicitaire) ;
 * - `montant` : plafond en centimes, strictement positif (0 est refusé : il serait
 *   confondu avec le « 0 = illimité » des budgets natifs de Paperclip) ;
 * - `aucune_limite` : choix explicite, jamais un défaut.
 *
 * Les coûts IA n'ont PAS de plafond propre à l'atelier : ils réutilisent les budgets
 * natifs de Paperclip (entreprise et agent), où 0 signifie « illimité ».
 */
import { z } from "zod";
import { Horodatage } from "./communs.js";

/** Plafond maximal accepté (garde-fou de saisie : 100 millions d'euros). */
export const PLAFOND_MONTANT_MAX_CENTS = 10_000_000_000;

/** Choix saisi par l'humain. */
export const PlafondEntree = z.discriminatedUnion("type", [
  z.object({ type: z.literal("montant"), montantCents: z.number().int().positive().max(PLAFOND_MONTANT_MAX_CENTS) }),
  z.object({ type: z.literal("aucune_limite") }),
]);
export type PlafondEntree = z.infer<typeof PlafondEntree>;

/** Choix enregistré, avec sa trace (qui l'a décidé, quand). */
export const PlafondPub = z.discriminatedUnion("type", [
  z.object({ type: z.literal("montant"), montantCents: z.number().int().positive().max(PLAFOND_MONTANT_MAX_CENTS), decidePar: z.string().min(1), decideLe: Horodatage }),
  z.object({ type: z.literal("aucune_limite"), decidePar: z.string().min(1), decideLe: Horodatage }),
]);
export type PlafondPub = z.infer<typeof PlafondPub>;

/**
 * Montants engagés pour l'affichage : dépensé ou diffusé, plus réservé par les
 * approbations valides non encore consommées. `limite` vaut `null` quand le choix
 * est « aucune limite » ou quand aucun choix n'a été fait (`choisi` les distingue).
 */
export const EngagementPub = z.object({
  engageCents: z.number().int().nonnegative(),
  diffuseCents: z.number().int().nonnegative(),
  reserveCents: z.number().int().nonnegative(),
  limiteCents: z.number().int().positive().nullable(),
  choisi: z.boolean(),
});
export type EngagementPub = z.infer<typeof EngagementPub>;

/** Vue des plafonds publicitaires d'une entreprise (réglages), avec le cumul engagé. */
export const VuePlafondsPub = z.object({
  plafondEntreprise: PlafondPub.nullable(),
  engagementEntreprise: EngagementPub,
});
export type VuePlafondsPub = z.infer<typeof VuePlafondsPub>;
