// Types de `decision-porte.mjs` (pour les tests TypeScript).
export interface EvaluationPorte {
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

export function renvoiEnAttenteInformation(evaluation: EvaluationPorte | null | undefined): boolean;
export function patchDecisionPorte(evaluation: EvaluationPorte): PatchDecisionPorte;
