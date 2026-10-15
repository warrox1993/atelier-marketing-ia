/**
 * Identifiants et limites figés de l'Atelier Marketing IA (contrats v1, T0).
 *
 * Toute modification de ce fichier passe par l'intégrateur (lot A) : le
 * serveur patché (`paperclip/server/src/atelier/`) et l'interface (lot C)
 * dépendent de ces valeurs.
 */

/** Identifiant du plugin dans Paperclip (`manifest.id`, clé du plugin). */
export const PLUGIN_ID = "atelier.marketing-ia" as const;

/**
 * Suffixe lisible de l'espace de base du plugin. L'hôte dérive le nom réel :
 * `plugin_atelier_<10 premiers caractères hexadécimaux du SHA-256 de PLUGIN_ID>`
 * (`derivePluginDatabaseNamespace`, `server/src/services/plugin-database.ts`).
 */
export const SLUG_ESPACE_BASE = "atelier" as const;

/** Nom réel du schéma PostgreSQL du plugin (vérifié par test contre la règle de l'hôte). */
export const ESPACE_BASE = "plugin_atelier_f0322cc62c" as const;

/** Préfixe des routes JSON du plugin, servies par l'hôte. */
export const PREFIXE_API = `/api/plugins/${PLUGIN_ID}/api` as const;

/** Clé du document natif qui porte le livrable d'une tâche sous porte. */
export const CLE_LIVRABLE_DEFAUT = "livrable" as const;

/** Mention obligatoire sur tout résultat produit en mode démonstration. */
export const MENTION_DEMONSTRATION = "Démonstration : contenu produit par des fixtures déterministes, aucune IA réelle." as const;

/**
 * Mention que la passerelle marketing place en tête de CHAQUE réponse d'outil en mode
 * démonstration (`passerelle/src/services.ts`, `MENTION_DEMONSTRATION`), avec
 * `_atelier: { mode: "demonstration", mention }` dans les données structurées.
 * Recopiée ici (le plugin n'importe pas la passerelle) : les deux valeurs doivent rester égales.
 */
export const MENTION_DONNEES_DEMONSTRATION = "Données de démonstration : aucune activité réelle" as const;

/** Limites appliquées côté serveur (plugin). */
export const LIMITES = {
  /** Plafond par défaut de runs actifs simultanés par entreprise. */
  maxRunsActifsParDefaut: 3,
  maxRunsActifsMin: 1,
  maxRunsActifsMax: 20,
  /** Cycles de correction par tâche avant escalade (cahier §8). */
  maxCyclesCorrectionParDefaut: 3,
  maxCyclesCorrectionMin: 1,
  maxCyclesCorrectionMax: 10,
  /** Import de documents (cahier §13). */
  importTailleMaxOctets: 512 * 1024,
  importLignesCsvMax: 5000,
  importColonnesCsvMax: 100,
  /** Lecture d'URL (cahier §14). */
  lectureUrlTailleMaxOctets: 2 * 1024 * 1024,
  lectureUrlDelaiMs: 10_000,
  lectureUrlRedirectionsMax: 5,
  /** Extrait conservé d'une source (données brutes autorisées). */
  extraitSourceMaxCaracteres: 4000,
  /** Messages typés. */
  messageTexteMaxCaracteres: 8000,
  /** Preuves. */
  extraitPreuveMaxCaracteres: 1000,
  /** Lecture du journal d'événements. */
  journalPageMax: 200,
  /** Dépôt d'une réponse d'outil de connexion (lot L9) : taille JSON maximale. */
  depotConnexionMaxOctets: 256 * 1024,
  /** Chiffres retenus par dépôt pour la garde des données de démonstration. */
  chiffresConnexionMax: 2000,
} as const;
