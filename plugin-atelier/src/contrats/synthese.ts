/**
 * Synthèse du client pour le Coordinateur général (route `direction.synthese`, src/serveur/services-synthese.ts).
 *
 * Agrégats seulement : des nombres, des dates et, pour les services non sensibles, au plus
 * `BORNE_BLOQUEES_SYNTHESE` identifiants de tâches bloquées (ex. COM-123). Jamais un titre, jamais un contenu.
 */

/** Nombre maximal d'identifiants de tâches bloquées listés par service. */
export const BORNE_BLOQUEES_SYNTHESE = 5;

export interface LigneSyntheseService {
  slug: string;
  nom: string;
  estDirection: boolean;
  agents: { idle: number; running: number; paused: number; error: number };
  taches: { todo: number; in_progress: number; blocked: number; in_review: number };
  /** Identifiants des tâches bloquées (au plus 5) ; vide pour un service sensible. */
  bloquees: string[];
  /** Coûts du mois en cours (UTC), en centimes. */
  coutsMoisCentimes: number;
  /** Dernière activité (tâche modifiée ou battement d'un agent), ISO 8601, ou null. */
  derniereActivite: string | null;
  prospects: { total: number; qualifies: number };
  liaisonsOuvertes: number;
}

export interface SyntheseClient {
  client: string;
  services: LigneSyntheseService[];
}
