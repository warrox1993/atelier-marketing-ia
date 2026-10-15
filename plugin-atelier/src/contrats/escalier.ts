/**
 * Escalier de montée du producteur pour une relance de correction (décision de
 * l'opérateur du 15/10/2026) : effort medium → high → xhigh → max, puis modèle au-dessus
 * (l'effort repart alors de medium, défaut du nouveau modèle).
 *
 * Fonction pure, partagée par le worker (vérification) et l'interface
 * (proposition du palier suivant). Les valeurs sont celles de l'adaptateur
 * natif `claude_local` (`adapterConfig.model`, `adapterConfig.effort`).
 */

/** Efforts acceptés par `claude --effort`, dans l'ordre croissant. */
export const EFFORTS_ESCALIER = ["low", "medium", "high", "xhigh", "max"] as const;

/** Modèles de l'escalier, du plus léger au plus capable. */
export const MODELES_ESCALIER = ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;

/** Effort par défaut d'un modèle dans Claude Code (point de départ après un changement de modèle). */
export const EFFORT_PAR_DEFAUT = "medium" as const;

export interface ConfigModeleEscalier {
  modele: string;
  effort: string;
}

export type PalierSuivant = { ok: true; apres: ConfigModeleEscalier } | { ok: false; raison: string };

/** Palier suivant de l'escalier, ou la raison pour laquelle il n'y en a pas. */
export function palierSuivant(avant: { modele: string | null; effort: string | null }): PalierSuivant {
  const modele = avant.modele?.trim() ?? "";
  if (!modele) return { ok: false, raison: "Aucun modèle configuré pour ce producteur (agent de démonstration ou modèle par défaut) : rien à monter." };
  const effort = avant.effort?.trim() || EFFORT_PAR_DEFAUT;
  const rangEffort = (EFFORTS_ESCALIER as readonly string[]).indexOf(effort);
  if (rangEffort < 0) return { ok: false, raison: `Effort « ${effort} » inconnu de l'escalier.` };
  if (rangEffort < EFFORTS_ESCALIER.length - 1) return { ok: true, apres: { modele, effort: EFFORTS_ESCALIER[rangEffort + 1] as string } };
  const rangModele = (MODELES_ESCALIER as readonly string[]).indexOf(modele);
  if (rangModele < 0) return { ok: false, raison: `Modèle « ${modele} » hors de l'escalier : choisir le modèle à la main dans la fiche de l'agent.` };
  if (rangModele === MODELES_ESCALIER.length - 1) return { ok: false, raison: "Sommet de l'escalier atteint (modèle le plus capable à l'effort maximal)." };
  return { ok: true, apres: { modele: MODELES_ESCALIER[rangModele + 1] as string, effort: EFFORT_PAR_DEFAUT } };
}
