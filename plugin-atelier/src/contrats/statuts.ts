/**
 * Statuts fonctionnels du cahier (§10), CALCULÉS à la lecture à partir de
 * l'état natif de Paperclip. Ils ne sont jamais stockés : aucune seconde
 * copie du statut d'une tâche n'existe dans l'atelier.
 */
import { z } from "zod";

export const StatutFonctionnel = z.enum([
  "queued",
  "ready",
  "running",
  "awaiting_review",
  "changes_requested",
  "blocked_information",
  "blocked_dependency",
  "blocked_budget",
  "ready_for_human",
  "approved",
  "completed",
  "failed",
  "cancelled",
]);
export type StatutFonctionnel = z.infer<typeof StatutFonctionnel>;

/** Libellés français affichés par l'interface. */
export const LIBELLES_STATUT: Record<StatutFonctionnel, string> = {
  queued: "En file",
  ready: "Prête",
  running: "En cours d'exécution",
  awaiting_review: "En revue",
  changes_requested: "Corrections demandées",
  blocked_information: "Décision humaine requise",
  blocked_dependency: "Bloquée par une dépendance",
  blocked_budget: "Bloquée par le budget",
  ready_for_human: "Prête pour validation humaine",
  approved: "Approuvée par l'humain",
  completed: "Terminée",
  failed: "Échec",
  cancelled: "Annulée",
};

/** Sous-ensemble de l'état natif d'une tâche nécessaire au calcul. */
export interface EtatNatifTache {
  status: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  executionState: {
    status: "pending" | "completed" | "changes_requested" | string;
    currentStageType: "review" | "approval" | null | string;
    currentParticipant: { type: "agent" | "user"; agentId?: string | null; userId?: string | null } | null;
    changesRequestedCount?: number;
  } | null;
}

export interface FaitsComplementaires {
  /** Bloqueurs natifs non résolus. */
  bloqueursNonResolus: number;
  /** Un run natif est en cours sur la tâche. */
  runActif: boolean;
  /** Le dernier run natif de la tâche a échoué. */
  dernierRunEchoue: boolean;
  /** L'agent assigné est en pause pour budget (incident natif). */
  agentEnPauseBudget: boolean;
  /** La tâche est sous porte atelier (P2). */
  sousPorte: boolean;
  /**
   * v1.5 (H2) : une décision humaine « approuver » non invalidée existe sur la révision courante
   * du livrable. Une tâche `done` sous porte n'est « approuvée » que si c'est vrai ; sinon (aucune
   * décision, livrable modifié après l'approbation), elle demande une décision humaine.
   */
  approbationValide?: boolean;
  /** Participant de l'étape de revue = humain non prévu (escalade après les cycles). */
  escaladeHumaine?: boolean;
}

export interface StatutCalcule {
  statut: StatutFonctionnel;
  /** Explication courte en français, destinée à l'interface. */
  motif: string;
}

/** Correspondance documentée dans `docs/contrats.md` (§ Statuts). Fonction pure, testée. */
export function calculerStatutFonctionnel(t: EtatNatifTache, f: FaitsComplementaires): StatutCalcule {
  const etat = t.executionState;
  switch (t.status) {
    case "cancelled":
      return { statut: "cancelled", motif: "Tâche annulée (statut natif cancelled)." };
    case "done":
      if (!f.sousPorte) return { statut: "completed", motif: "Tâche terminée (statut natif done)." };
      return f.approbationValide === true
        ? { statut: "approved", motif: "Contrôle automatique réussi puis décision humaine d'approbation sur la révision courante." }
        : { statut: "blocked_information", motif: "Terminée sans approbation humaine valide sur la révision courante (aucune décision, ou livrable modifié après l'approbation) : décision humaine requise." };
    case "blocked":
      if (f.bloqueursNonResolus > 0) {
        return { statut: "blocked_dependency", motif: `${f.bloqueursNonResolus} dépendance(s) non résolue(s).` };
      }
      if (f.agentEnPauseBudget) return { statut: "blocked_budget", motif: "Agent en pause : plafond de budget atteint." };
      return { statut: "blocked_information", motif: "Information ou arbitrage humain manquant." };
    case "in_review": {
      if (etat?.currentStageType === "approval") {
        return { statut: "ready_for_human", motif: "Étape d'approbation humaine en cours." };
      }
      const participant = etat?.currentParticipant;
      if (f.escaladeHumaine || (participant?.type === "user" && etat?.currentStageType === "review")) {
        return { statut: "blocked_information", motif: "Escalade vers l'humain responsable après épuisement des cycles de revue." };
      }
      return { statut: "awaiting_review", motif: "Revue en cours." };
    }
    case "in_progress":
      if (f.agentEnPauseBudget) return { statut: "blocked_budget", motif: "Agent en pause : plafond de budget atteint." };
      if (etat?.status === "changes_requested") {
        return { statut: "changes_requested", motif: `Corrections demandées (cycle ${etat.changesRequestedCount ?? 0}).` };
      }
      if (f.runActif) return { statut: "running", motif: "Un passage est en cours." };
      if (f.dernierRunEchoue) return { statut: "failed", motif: "Le dernier passage a échoué ; reprise selon la politique native." };
      return { statut: "ready", motif: "En cours, en attente du prochain passage." };
    case "todo":
      if (f.agentEnPauseBudget) return { statut: "blocked_budget", motif: "Agent en pause : plafond de budget atteint." };
      if (f.bloqueursNonResolus > 0) {
        return { statut: "blocked_dependency", motif: `${f.bloqueursNonResolus} dépendance(s) non résolue(s).` };
      }
      if (f.runActif) return { statut: "running", motif: "Un passage est en cours." };
      return t.assigneeAgentId || t.assigneeUserId
        ? { statut: "ready", motif: "Affectée, dépendances satisfaites." }
        : { statut: "queued", motif: "Non affectée." };
    case "backlog":
    default:
      return { statut: "queued", motif: "En attente (backlog)." };
  }
}
