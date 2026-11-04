/**
 * Synthèse du client pour le Coordinateur général (route `direction.synthese`, src/serveur/services-synthese.ts).
 *
 * Agrégats seulement : des nombres, des dates et, pour les services non sensibles, au plus
 * `BORNE_BLOQUEES_SYNTHESE` identifiants de tâches bloquées (ex. COM-123). Jamais un titre, jamais un contenu.
 */

/** Nombre maximal d'identifiants de tâches bloquées listés par service. */
export const BORNE_BLOQUEES_SYNTHESE = 5;

/** Nombre maximal de cartes en attente d'un humain listées par service (HUM-C4), les plus anciennes d'abord. */
export const BORNE_CARTES_SYNTHESE = 10;

/** Carte (question ou confirmation) qui attend un humain : jamais son titre ni son contenu. */
export interface CarteEnAttenteSynthese {
  /** Identifiant de la tâche qui porte la carte (ex. COM-12) ; null pour un service sensible. */
  tache: string | null;
  sorte: "question" | "confirmation";
  /** Heures écoulées depuis la pose de la carte (entier, arrondi par défaut). */
  depuisHeures: number;
}

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
  /** Cartes en attente d'un humain (HUM-C4) : le Coordinateur général ne cite jamais une carte absente de cette liste. */
  cartesEnAttente: CarteEnAttenteSynthese[];
}

export interface SyntheseClient {
  client: string;
  services: LigneSyntheseService[];
}
