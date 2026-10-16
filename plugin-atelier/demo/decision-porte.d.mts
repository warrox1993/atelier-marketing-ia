// Types de `decision-porte.mjs` (pour les tests TypeScript).
export interface EvaluationPorteDemo {
  id?: string;
  empreinte: string;
  decision: "PASS" | "REFUS" | "BLOQUE_INFORMATION";
  motifs?: Array<{ code: string; message: string }>;
}

export interface PatchDecisionPorte {
  status: "done" | "in_progress";
  comment: string;
  awaitingInformation?: true;
}

export function renvoiEnAttenteInformation(evaluation: EvaluationPorteDemo | null | undefined): boolean;
export function patchDecisionPorte(evaluation: EvaluationPorteDemo): PatchDecisionPorte;
