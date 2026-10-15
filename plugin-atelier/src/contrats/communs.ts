/**
 * Briques communes des contrats : identifiants natifs, dates, acteurs,
 * énumérations transverses. Zod 4 (même version majeure que le socle).
 */
import { z } from "zod";

/** Identifiant natif Paperclip (UUID). Même règle que le socle (`z.string().guid()`). */
export const IdNatif = z.guid();
export type IdNatif = z.infer<typeof IdNatif>;

/** Horodatage de stockage : ISO 8601 en UTC (cahier : stockage UTC, affichage Europe/Brussels). */
export const Horodatage = z.iso.datetime({ offset: true });
export type Horodatage = z.infer<typeof Horodatage>;

/** Mode d'exécution d'une campagne ou d'un résultat (cahier §3). */
export const ModeExecution = z.enum(["demonstration", "reel"]);
export type ModeExecution = z.infer<typeof ModeExecution>;

/**
 * Les six états d'une connexion ou d'un agent qu'affiche l'interface (cahier §3) :
 * démonstration, réel testé, configuré mais non vérifié, non connecté,
 * indisponible, erreur. Une configuration enregistrée ne vaut pas preuve.
 */
export const EtatConnexion = z.enum([
  "demonstration",
  "reel_teste",
  "configure_non_verifie",
  "non_connecte",
  "indisponible",
  "erreur",
]);
export type EtatConnexion = z.infer<typeof EtatConnexion>;

/** Acteur tel qu'authentifié par l'hôte (jamais déclaré par l'appelant). */
export const Acteur = z.object({
  type: z.enum(["agent", "humain", "systeme"]),
  /** id d'agent (UUID) ou id d'utilisateur (texte, ex. `local-board`). */
  id: z.string().min(1),
  runId: IdNatif.nullable().optional(),
});
export type Acteur = z.infer<typeof Acteur>;

/** Code d'exigence stable : REQ-001, REQ-002… (cahier §7). */
export const CodeExigence = z.string().regex(/^REQ-\d{3,}$/u, "Code d'exigence attendu : REQ-001");
export type CodeExigence = z.infer<typeof CodeExigence>;

/** Rôles des trois contrôleurs (cahier §4). */
export const RoleRevue = z.enum(["exigences", "metier", "technique"]);
export type RoleRevue = z.infer<typeof RoleRevue>;

/** Erreur renvoyée par toutes les routes et actions du plugin. */
export const ErreurApi = z.object({
  erreur: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});
export type ErreurApi = z.infer<typeof ErreurApi>;
