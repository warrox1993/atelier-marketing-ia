/**
 * Emplacements UI déclarés par le manifeste et rubriques (sans Zod).
 */
/** Segment de route de l'espace atelier : `/:prefixeEntreprise/atelier`. */
export const ROUTE_ATELIER = "atelier" as const;

/** Noms d'export que `src/ui/index.tsx` DOIT fournir (composants React). */
export const EXPORTS_UI = {
  page: "PageAtelier",
  navigation: "NavigationAtelier",
  entreeBarreLaterale: "EntreeAtelier",
  ongletTache: "OngletAtelierTache",
  widget: "WidgetAtelier",
} as const;

/** Les six rubriques obligatoires (cahier §12), sous-routes de la page. */
export const RUBRIQUES = [
  { cle: "equipe", libelle: "Équipe et coordination", chemin: "equipe" },
  { cle: "campagnes", libelle: "Campagnes", chemin: "campagnes" },
  { cle: "contenus", libelle: "Contenus à valider", chemin: "contenus" },
  { cle: "calendrier", libelle: "Calendrier éditorial", chemin: "calendrier" },
  { cle: "resultats", libelle: "Résultats", chemin: "resultats" },
  { cle: "marque", libelle: "Marque et sources", chemin: "marque" },
] as const;

/** Libellés français des types d'événements du journal (besoin B-6 du lot C). */
export const LIBELLES_EVENEMENTS: Readonly<Record<string, string>> = {
  "campagne.creee": "Campagne créée",
  "campagne.annulee": "Campagne annulée",
  "exigence.creee": "Exigence enregistrée",
  "exigence.modifiee": "Exigence modifiée",
  "exigence.affaiblie": "Exigence affaiblie par l'humain (tracé)",
  "exigence.modification_refusee": "Modification d'exigence refusée (réservée à l'humain)",
  "exigence.exclusion_demandee": "Exclusion d'exigence demandée",
  "exigence.exclusion_autorisee": "Exclusion d'exigence autorisée par l'humain",
  "exigence.exclusion_refusee": "Exclusion d'exigence refusée",
  "porte.creee": "Tâche placée sous contrôle automatique",
  /** Historique seulement : l'action de levée a été retirée le 15/10/2026. */
  "porte.levee": "Contrôle automatique levé par l'humain (action retirée)",
  "porte.franchie": "Contrôle automatique réussi",
  "porte.refusee": "Contrôle automatique refusé",
  "porte.bloquee": "Contrôle automatique bloqué : information manquante",
  "planification.proposee": "Date de publication proposée",
  "livrable.revise": "Nouvelle révision du livrable",
  "livrable.modifie_apres_approbation": "Livrable modifié après approbation : tâche rouverte",
  "couverture.declaree": "Couverture des exigences déclarée",
  "cycles.epuises": "Cycles de correction épuisés : escalade",
  "correction.relancee": "Correction relancée par l'humain (nouveaux cycles)",
  "tache.annulee": "Tâche annulée après rejet humain",
  "revue.demandee": "Revue demandée",
  "revue.reussie": "Revue réussie",
  "revue.echouee": "Revue : corrections demandées",
  "message.envoye": "Message envoyé",
  "message.etat": "Message traité",
  "source.collectee": "Source collectée",
  "donnees.deposees": "Données de connexion déposées (mode déduit par le serveur)",
  "donnees.demo_campagne_reelle": "Données de démonstration déposées dans une campagne réelle (interdites)",
  "donnees.refusees": "Dépôt de données de connexion refusé (provenance inconnue)",
  "source.refusee_ssrf": "Lecture d'URL refusée (protection réseau)",
  "liens.verifies": "Liens vérifiés",
  "import.accepte": "Document importé",
  "import.refuse": "Import refusé",
  "decision.approuver": "Décision humaine : approuvé",
  "decision.demander_correction": "Décision humaine : correction demandée",
  "decision.rejeter": "Décision humaine : rejeté",
  "diffusion.simulee": "Diffusion simulée (démonstration)",
  "diffusion.preparee": "Diffusion préparée (aucun envoi)",
  "diffusion.refusee": "Diffusion refusée par le serveur",
  "diffusion.preuve_signee": "Preuve d'approbation signée pour la passerelle",
  "diffusion.confirmee": "Diffusion confirmée par la passerelle",
  "diffusion.ambigue_a_reconcilier": "Diffusion ambiguë : à réconcilier",
  "diffusion.issue_refusee": "Issue de diffusion refusée (réponse non vérifiable)",
  "marque.version": "Nouvelle version de la marque",
  "reglages.modifies": "Réglages modifiés",
  "plafond.modifie": "Plafond publicitaire choisi ou modifié par l'humain",
  "approbation.refusee_plafond": "Approbation refusée par le serveur : plafond publicitaire",
  "budget_ia.modifie": "Budget IA natif modifié par l'humain",
  "demonstration.reinitialisee": "Démonstration remise à zéro",
  "donnees.reinitialisees": "Données de l'atelier remises à zéro",
  "equipe.demande": "Demande envoyée au Coordinateur",
};

export function libelleEvenement(type: string): string {
  return LIBELLES_EVENEMENTS[type] ?? type;
}
