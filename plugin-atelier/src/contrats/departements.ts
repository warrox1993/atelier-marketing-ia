/**
 * Tableau des départements d'un client (un client = une entreprise Paperclip par service). Types partagés entre le
 * serveur (`departements.lister`, `departement.etat`) et l'interface (vue « Départements »).
 *
 * Cloisonnement : l'hôte refuse, pendant une route, tout appel visant une autre entreprise que celle de la requête
 * (paperclip/packages/plugins/sdk/src/host-client-factory.ts, `requireInvocationCompanyScope`). Une route unique qui
 * lirait l'état de tous les services est donc impossible : `departements.lister` ne lit que la déclaration des
 * services du client (table du plugin `services_entreprises`), et chaque case du tableau est lue par un appel
 * `departement.etat` portant SON `companyId`, que l'hôte autorise seulement si l'utilisateur a accès à ce service.
 */

import type { OrigineFlux } from "./liaisons.js";

/** Un service du client, tel que déclaré dans `services_entreprises` (jamais un service d'un autre client). */
export interface DepartementDeclare {
  companyId: string;
  slug: string;
  /** Nom lisible du service (`nomService`). */
  nom: string;
  estDirection: boolean;
  /** Vrai pour l'entreprise de la requête. */
  courant: boolean;
}

export interface ReponseDepartements {
  /** Marqueur du client de l'entreprise courante ; null si elle n'est déclarée dans aucun client. */
  client: string | null;
  /** Services du client : Direction d'abord, puis par nom. Vide si l'entreprise n'est pas déclarée. */
  departements: DepartementDeclare[];
}

/** Un flux autorisé entre deux services du client (matrice `flux_services`), tel que rendu par `services.flux`. */
export interface FluxServiceLu {
  /** Slug du service source. */
  source: string;
  /** Slug du service cible. */
  cible: string;
  objet: string;
  approbationHumaine: boolean;
  /** « metier » : flux du registre des services ; « coordinateurs » : réseau des coordinateurs généré. */
  origine: OrigineFlux;
}

/** Réponse de `services.flux` : la matrice des flux du client de l'entreprise de la requête (jamais d'un autre client). */
export interface ReponseFluxServices {
  client: string | null;
  flux: FluxServiceLu[];
}

export type NiveauAlerte = "haute" | "moyenne";

export interface AlerteDepartement {
  niveau: NiveauAlerte;
  texte: string;
}

/** Une case du tableau : l'état d'UN service, lu dans sa propre entreprise. */
export interface EtatDepartement {
  companyId: string;
  slug: string;
  nom: string;
  /** Entreprise en pause (statut natif `paused`) et motif lisible. */
  enPause: boolean;
  motifPause: string | null;
  agents: { actifs: number; enPause: number; enErreur: number };
  taches: { enCours: number; bloquees: number };
  /** Vrai si une liste a atteint la borne de lecture : les nombres de tâches sont des minimums. */
  tachesTronquees: boolean;
  /** Validations humaines en attente : même calcul que la pastille « À faire » (urgence non basse). */
  validations: { total: number; parType: Record<string, number> };
  /** Date ISO la plus récente parmi les tâches lues et les derniers battements des agents ; null si aucune. */
  derniereActivite: string | null;
  alertes: AlerteDepartement[];
}

/** Borne de lecture des tâches par statut et par case. */
export const BORNE_TACHES_DEPARTEMENT = 500;

/** Un élément d'« À faire » compte dans la pastille (et dans les validations d'un département) sauf s'il est de basse urgence. */
export function compteDansAFaire(element: { urgence: string }): boolean {
  return element.urgence !== "basse";
}

/** Motifs de pause natifs (`PAUSE_REASONS` de Paperclip), en français. */
export const MOTIFS_PAUSE: Readonly<Record<string, string>> = {
  manual: "mise en pause à la main",
  budget: "budget atteint",
  system: "pause du système",
  company_archived: "entreprise archivée",
  import: "import en cours",
};

/**
 * Services dont la décision engage la responsabilité de l'entreprise : l'interface colore leur étiquette et la
 * synthèse du Coordinateur général n'y expose aucun identifiant de tâche.
 */
export const SERVICES_SENSIBLES: ReadonlySet<string> = new Set(["juridique", "ressources-humaines", "juridique-social", "fiscalite", "hse", "conformite", "sav-sinistres"]);
