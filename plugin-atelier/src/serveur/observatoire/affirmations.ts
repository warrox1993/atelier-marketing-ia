/**
 * Validation K6 des affirmations et de leurs preuves (FR-003, FR-012, FR-029).
 * Le motif de confiance non vide est déjà imposé par le schéma `Confiance`.
 */
import { Affirmation, PreuveObservatoire } from "../../contrats/observatoire.js";
import { erreur, erreurValidation } from "../erreurs.js";
import { causeExtraitRefuse, raisonExtrait } from "./normaliseur.js";

export function validerAffirmation(a: unknown): Affirmation {
  const r = Affirmation.safeParse(a);
  if (!r.success) erreurValidation("Affirmation", r.error.issues);
  return r.data;
}

/** Une preuve vers un instantané exige son texte normalisé ; une preuve vers un essai est refusée tant que K8 n'existe pas. */
export function validerPreuve(p: unknown, instantane: { texteNormalise: string } | null): PreuveObservatoire {
  const r = PreuveObservatoire.safeParse(p);
  if (!r.success) erreurValidation("Preuve", r.error.issues);
  const preuve = r.data;
  // shortcut: preuves par essai refusées, à rouvrir avec K8
  if (preuve.instantaneId === null) erreur("entree_invalide", "Preuve : une preuve par essai est refusée tant que le service d'essais n'est pas branché");
  if (preuve.instantaneId !== null) {
    if (instantane === null) erreur("entree_invalide", "Preuve : instantané introuvable pour vérifier l'extrait");
    const cause = causeExtraitRefuse(preuve.extraitExact, instantane.texteNormalise, preuve.position);
    if (cause !== null) erreur("entree_invalide", `Preuve : ${raisonExtrait(cause, preuve.position)}`);
  }
  return preuve;
}
