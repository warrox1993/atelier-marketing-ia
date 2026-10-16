// Corps du PATCH que la Porte envoie au socle après l'évaluation déterministe.
// Module pur (sans réseau) pour être testé à part du programme de l'agent.

/**
 * Motifs qui signalent une information manquante (contrôle impossible : panne d'outil, donnée
 * absente) et non un défaut de qualité du livrable. Même ensemble que `BLOQUANTS` de
 * `src/serveur/porte.ts`.
 */
const MOTIFS_ATTENTE_INFORMATION = new Set(["information_manquante", "revue_bloquee_information"]);

/**
 * Un renvoi est « en attente d'information » quand la décision est `BLOQUE_INFORMATION` et que
 * TOUS ses motifs sont des manques d'information : aucun défaut de qualité, aucun cycle épuisé.
 * Le socle ne le compte alors pas comme un tour de correction (champ `awaitingInformation`).
 */
export function renvoiEnAttenteInformation(evaluation) {
  if (evaluation?.decision !== "BLOQUE_INFORMATION") return false;
  const motifs = evaluation.motifs ?? [];
  return motifs.length > 0 && motifs.every((m) => MOTIFS_ATTENTE_INFORMATION.has(m?.code));
}

/** Corps du PATCH de la tâche selon la décision de la porte. */
export function patchDecisionPorte(evaluation) {
  if (evaluation.decision === "PASS") {
    return { status: "done", comment: `Contrôle automatique réussi (évaluation ${evaluation.id}, empreinte ${evaluation.empreinte.slice(0, 12)}).` };
  }
  const motifs = (evaluation.motifs ?? []).map((m) => `- ${m.message}`).join("\n");
  const patch = {
    status: "in_progress",
    comment: `Contrôle automatique ${evaluation.decision === "REFUS" ? "refusé" : "bloqué (information manquante)"} :\n${motifs}`,
  };
  if (renvoiEnAttenteInformation(evaluation)) patch.awaitingInformation = true;
  return patch;
}
