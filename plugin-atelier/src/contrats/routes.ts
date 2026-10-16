/**
 * Table figée des routes JSON du plugin (v1), sans dépendance à Zod pour que
 * le manifeste reste léger. Voir `api.ts` pour les schémas des corps.
 */
export type MethodeApi = "GET" | "POST" | "PATCH" | "DELETE";

export interface RouteApi {
  cle: string;
  methode: MethodeApi;
  chemin: string;
  auth: "board" | "agent" | "board-or-agent";
  resolution: { from: "issue"; param: "issueId" } | { from: "body"; key: "companyId" } | { from: "query"; key: "companyId" };
  checkout?: "none" | "required-for-agent-in-progress" | "always-for-agent";
  description: string;
}

const tache = { from: "issue", param: "issueId" } as const;
const corps = { from: "body", key: "companyId" } as const;
const requete = { from: "query", key: "companyId" } as const;

/** Table figée des routes (v1). `manifest.apiRoutes` est dérivé de cette table. */
export const ROUTES_API = [
  { cle: "tache.contexte", methode: "GET", chemin: "/taches/:issueId/contexte", auth: "board-or-agent", resolution: tache, description: "Brief, exigences ciblées, livrable courant, revues requises, verdicts, constats ouverts et boîte de réception de l'appelant." },
  { cle: "tache.couverture", methode: "POST", chemin: "/taches/:issueId/couverture", auth: "board-or-agent", resolution: tache, checkout: "required-for-agent-in-progress", description: "Le producteur déclare la couverture de chaque exigence pour une révision, avec preuves localisables." },
  { cle: "tache.verdict", methode: "POST", chemin: "/taches/:issueId/verdicts", auth: "board-or-agent", resolution: tache, description: "Un relecteur désigné dépose un verdict structuré (jamais le producteur)." },
  { cle: "tache.porte.evaluer", methode: "POST", chemin: "/taches/:issueId/porte/evaluer", auth: "board-or-agent", resolution: tache, description: "Calcul déterministe de la porte P2 sur la révision courante." },
  { cle: "tache.porte.lire", methode: "GET", chemin: "/taches/:issueId/porte", auth: "board-or-agent", resolution: tache, description: "Dernière évaluation de porte." },
  { cle: "tache.dossier", methode: "GET", chemin: "/taches/:issueId/dossier", auth: "board-or-agent", resolution: tache, description: "Dossier humain complet." },
  { cle: "tache.messages.envoyer", methode: "POST", chemin: "/taches/:issueId/messages", auth: "board-or-agent", resolution: tache, description: "Envoi d'un message typé rattaché à la tâche." },
  { cle: "tache.messages.boite", methode: "GET", chemin: "/taches/:issueId/messages", auth: "board-or-agent", resolution: tache, description: "Boîte de réception de l'appelant pour cette tâche." },
  { cle: "tache.messages.etat", methode: "POST", chemin: "/taches/:issueId/messages/:messageId/etat", auth: "board-or-agent", resolution: tache, description: "Le destinataire marque un message lu, traité ou rejeté." },
  { cle: "tache.sources.lire", methode: "POST", chemin: "/taches/:issueId/sources", auth: "board-or-agent", resolution: tache, description: "Lecture d'une URL publique protégée contre la SSRF ; la source est enregistrée comme donnée non fiable." },
  { cle: "tache.donnees.deposer", methode: "POST", chemin: "/taches/:issueId/donnees-connexion", auth: "board-or-agent", resolution: tache, description: "Dépôt de la réponse brute d'un outil de connexion (passerelle marketing) : le serveur en déduit le mode (démonstration ou réel) et retient ses chiffres pour la porte." },
  { cle: "tache.liens.verifier", methode: "POST", chemin: "/taches/:issueId/liens/verifier", auth: "board-or-agent", resolution: tache, description: "Vérification de liens : HTTP 200 ET absence de page d'erreur." },
  { cle: "tache.diffusions", methode: "POST", chemin: "/taches/:issueId/diffusions", auth: "board-or-agent", resolution: tache, description: "Demande d'action externe : refusée côté serveur sans décision humaine valide sur la révision et la portée." },
  { cle: "tache.diffusions.issue", methode: "POST", chemin: "/taches/:issueId/diffusions/:diffusionId/issue", auth: "board-or-agent", resolution: tache, description: "Issue d'une diffusion réelle : réponse brute de l'outil de la passerelle, signature vérifiée, état confirmé ou à réconcilier (v1.5)." },
  { cle: "tache.appels.proposer", methode: "POST", chemin: "/taches/:issueId/appels", auth: "board-or-agent", resolution: tache, description: "L'agent propose l'appel d'outil EXACT (service, outil, compte, arguments) d'une diffusion réelle ; l'humain approuve son empreinte (v1.6)." },
  { cle: "tache.diffusions.revoquer", methode: "POST", chemin: "/taches/:issueId/diffusions/:diffusionId/revoquer", auth: "board", resolution: tache, description: "Révocation humaine de la preuve d'approbation d'une diffusion réelle préparée (v1.6)." },
  { cle: "tache.planification", methode: "POST", chemin: "/taches/:issueId/planification", auth: "board-or-agent", resolution: tache, description: "Date de publication PROPOSÉE et canal (calendrier éditorial) ; ce n'est jamais une programmation réelle." },
  { cle: "tache.decision", methode: "POST", chemin: "/taches/:issueId/decisions", auth: "board", resolution: tache, description: "Décision humaine (approuver, demander une correction, rejeter)." },
  { cle: "portes.creer", methode: "POST", chemin: "/portes", auth: "board-or-agent", resolution: corps, description: "Place une tâche native sous la porte de l'atelier." },
  { cle: "campagnes.creer", methode: "POST", chemin: "/campagnes", auth: "board-or-agent", resolution: corps, description: "Crée une campagne (projet natif + tâche de brief). Un humain : sans condition. Un agent : seulement le rôle ceo, avec issueId (tâche qui lui est assignée dont une confirmation request_confirmation est acceptée par un humain), toujours en mode démonstration et sans plafond publicitaire ; sinon 403 elevation_refusee." },
  { cle: "campagnes.lister", methode: "GET", chemin: "/campagnes", auth: "board-or-agent", resolution: requete, description: "Liste des campagnes de l'entreprise." },
  { cle: "campagnes.exigences", methode: "POST", chemin: "/campagnes/:campagneId/exigences", auth: "board-or-agent", resolution: corps, description: "Enregistre ou corrige les exigences REQ-xxx extraites du brief." },
  { cle: "exigences.exclusion", methode: "POST", chemin: "/exigences/:exigenceId/exclusion", auth: "board-or-agent", resolution: corps, description: "Un agent DEMANDE l'exclusion ; seul un humain l'autorise ou la refuse." },
  { cle: "imports.creer", methode: "POST", chemin: "/imports", auth: "board-or-agent", resolution: corps, description: "Import contrôlé texte, Markdown ou CSV." },
  { cle: "marque.lire", methode: "GET", chemin: "/marque", auth: "board-or-agent", resolution: requete, description: "Lecture seule du référentiel du client (identité, ton, offres, zones, établissements, entités avec leurs identifiants BCE et FSMA, segments, cibles de prospection, modules de conformité, informations manquantes) ; `marque` vaut null tant qu'aucune marque n'est enregistrée." },
  { cle: "journal.lire", methode: "GET", chemin: "/journal", auth: "board-or-agent", resolution: requete, description: "Rattrapage des événements après reconnexion (`afterSeq`)." },
  { cle: "preuves.revocations", methode: "GET", chemin: "/preuves/revocations", auth: "board-or-agent", resolution: requete, description: "Liste signée (arv1) des preuves d'approbation révoquées et non expirées, à transmettre à la passerelle (v1.6)." },
  { cle: "sante", methode: "GET", chemin: "/sante", auth: "board-or-agent", resolution: requete, description: "Diagnostic de l'atelier et des gardes serveur." },
  { cle: "campagnes.plafond", methode: "POST", chemin: "/campagnes/:campagneId/plafond", auth: "board", resolution: corps, description: "Choix du plafond publicitaire d'une campagne (montant ou « aucune limite »), humain seulement, tracé." },
  { cle: "reglages.enregistrer", methode: "POST", chemin: "/reglages", auth: "board", resolution: corps, description: "Réglages de l'entreprise (plafond de runs, cycles, rétention, plafond publicitaire : humain seulement pour ce dernier)." },
  // Lot P9a : prospection (définitions venues de `ROUTES_PROSPECTION_PREVUES`, src/contrats/prospection.ts).
  { cle: "tache.prospects.deposer", methode: "POST", chemin: "/taches/:issueId/prospects", auth: "board-or-agent", resolution: tache, checkout: "required-for-agent-in-progress", description: "Dépôt de la réponse brute et signée d'un outil bce, bnb, fsma, osm ou b2c ; le serveur en tire des prospects, déduit le mode et applique les exclusions." },
  { cle: "prospects.lister", methode: "GET", chemin: "/prospects", auth: "board-or-agent", resolution: requete, description: "Liste filtrée des prospects (secteur, zone, score, statut), avec score expliqué et base légale par canal." },
  { cle: "prospects.carte", methode: "GET", chemin: "/prospects/carte", auth: "board-or-agent", resolution: requete, description: "Carte des prospects : points positionnés { id, nom, lat, lon, precision (exacte, code_postal, commune), confiance, qualifie } avec les mêmes filtres que la liste, plus les établissements du client dont la position est renseignée ; les prospects sans position sont comptés, jamais placés au hasard." },
  { cle: "prospects.criteres-manquants", methode: "GET", chemin: "/prospects/:prospectId/criteres-manquants", auth: "board-or-agent", resolution: requete, description: "Critères de confiance de qualification encore non vérifiés d'un prospect, avec l'outil de la passerelle qui pourrait chacun l'établir (bce_entreprise, bnb_comptes, osm_commerces, fsma_rechercher)." },
  { cle: "prospects.compte-rendu", methode: "GET", chemin: "/prospects/:prospectId/compte-rendu", auth: "board-or-agent", resolution: requete, description: "Compte rendu déterministe d'un lead (aucune IA) : critères vérifiés avec leur source et leur date, critères manquants ou contraires, confiance et score séparés, signaux de moment, offre recommandée, établissement proche, prochaine action et limites RGPD ; aussi en Markdown." },
  { cle: "prospects.question", methode: "POST", chemin: "/prospects/:prospectId/question", auth: "board", resolution: corps, description: "Crée une tâche native assignée au Coordinateur avec la question de l'humain sur ce lead et le compte rendu (humain seulement, journalisé)." },
  { cle: "prospects.particuliers.enregistrer", methode: "POST", chemin: "/prospects/particuliers", auth: "board", resolution: corps, description: "Enregistre un prospect particulier (formulaire, partenaire, parrainage, événement, lead acheté, client existant) avec son origine légale et ses preuves de consentement ; coordonnées chiffrées à la réception." },
  { cle: "prospects.exclure", methode: "POST", chemin: "/prospects/:prospectId/exclusion", auth: "board-or-agent", resolution: corps, description: "Exclusion d'un prospect avec un motif connu, journalisée." },
  { cle: "oppositions.ajouter", methode: "POST", chemin: "/oppositions", auth: "board", resolution: corps, description: "Enregistre une opposition (art. 21.3) : empreinte seule, jamais la valeur." },
  // Lot P9b : export CRM et fichier, base de clients, étalonnage.
  { cle: "tache.prospects.exporter", methode: "POST", chemin: "/taches/:issueId/prospects/exports", auth: "board-or-agent", resolution: tache, description: "Demande d'export de prospects vers le CRM du client pour un canal : base légale vérifiée par prospect, puis diffusion réelle sous preuve d'approbation." },
  { cle: "prospects.exporter-fichier", methode: "POST", chemin: "/prospects/exports-fichier", auth: "board", resolution: corps, description: "Export CSV ou XLSX des prospects contactables pour un canal (humain seulement), coordonnées déchiffrées, formules neutralisées, journalisé." },
  { cle: "base-clients.apercu", methode: "POST", chemin: "/base-clients/apercu", auth: "board", resolution: corps, description: "Lecture d'un fichier de base clients (colonnes, aperçu de 20 lignes, colonnes sensibles refusées) sans rien stocker." },
  { cle: "base-clients.importer", methode: "POST", chemin: "/base-clients/imports", auth: "board", resolution: corps, description: "Import CSV ou XLSX de la base de clients avec correspondance des colonnes ; identifiants chiffrés, empreintes HMAC." },
  { cle: "base-clients.etat", methode: "GET", chemin: "/base-clients", auth: "board", resolution: requete, description: "État de la base de clients : dernier import, nombre de clients, date de purge, finalité." },
  { cle: "base-clients.supprimer", methode: "POST", chemin: "/base-clients/suppression", auth: "board", resolution: corps, description: "Suppression totale de la base de clients (humain seulement), journalisée ; les oppositions sont gardées." },
  { cle: "ventes-croisees.lister", methode: "GET", chemin: "/ventes-croisees", auth: "board", resolution: requete, description: "Opportunités de vente croisée de la base clients importée (règles du client, sinon règles de démonstration), sous pseudonyme, avec le canal permis par la matrice des bases légales ; humain seulement, aucune coordonnée." },
  { cle: "etalonnage.calculer", methode: "POST", chemin: "/etalonnages", auth: "board", resolution: corps, description: "Étalonnage du score sur les issues réelles ou un historique importé (Platt ou isotonique, Brier, Wilson), humain seulement." },
  // Lot R7 : connaissances du client (définitions venues de `ROUTES_CONNAISSANCES_PREVUES`, src/contrats/connaissances.ts).
  { cle: "tache.connaissances.rechercher", methode: "POST", chemin: "/taches/:issueId/connaissances/recherche", auth: "board-or-agent", resolution: tache, description: "Recherche hybride (plein texte et sens) dans les documents de l'entreprise de la tâche ; chaque passage rendu devient une source citée." },
  { cle: "connaissances.importer", methode: "POST", chemin: "/connaissances", auth: "board", resolution: corps, description: "Import d'un document (type, validité, langue) ; indexation en tâche de fond." },
  { cle: "connaissances.lister", methode: "GET", chemin: "/connaissances", auth: "board", resolution: requete, description: "Documents par type avec version, validité, statut, passages et injections signalées." },
  { cle: "connaissances.statut", methode: "GET", chemin: "/connaissances/statut", auth: "board", resolution: requete, description: "Index actif, documents en file, refusés et à revoir." },
  { cle: "connaissances.supprimer", methode: "POST", chemin: "/connaissances/suppression", auth: "board", resolution: corps, description: "Suppression d'un document ou des passages d'une personne (humain seulement), journalisée." },
  { cle: "connaissances.importer-url", methode: "POST", chemin: "/connaissances/page-web", auth: "board", resolution: corps, description: "Import d'une page web publique (lecture seule, anti-SSRF) : titres en Markdown, sans script, style, navigation ni pied de page, avec la source et la date de lecture en tête ; mêmes contrôles que l'import d'un document (humain seulement)." },
  { cle: "connaissances.importer-demo", methode: "POST", chemin: "/connaissances/demonstration", auth: "board", resolution: corps, description: "Import d'un geste du corpus de démonstration (humain, entreprise de démonstration seulement)." },
  { cle: "base-clients.importer-demo", methode: "POST", chemin: "/base-clients/demonstration", auth: "board", resolution: corps, description: "Import d'un geste de la base clients de démonstration (instance/demo/base-clients/base-clients.xlsx) avec la correspondance des 18 colonnes (humain, entreprise de démonstration seulement)." },
  // Lot 1 : accueil, demande à l'équipe et suivi de mission.
  { cle: "accueil.lister", methode: "GET", chemin: "/accueil", auth: "board", resolution: requete, description: "Accueil : liste unique, triée par urgence, de ce qui attend une décision ou une information (contenus, approbations, tâches bloquées, demandes d'accès, documents à revoir, informations manquantes) et missions en cours." },
  { cle: "equipe.demander", methode: "POST", chemin: "/equipe/demande", auth: "board", resolution: corps, description: "Demande en texte libre : crée une tâche native assignée au Coordinateur, qui la répartit (humain seulement)." },
  { cle: "mission.suivre", methode: "GET", chemin: "/missions/:issueId", auth: "board", resolution: tache, description: "Suivi d'une mission : tâche mère et sous-tâches avec agent, statut et dernier commentaire résumé (humain seulement)." },
  // Garde-fous de vérité (src/serveur/services-faits.ts).
  { cle: "tache.plan.controler", methode: "POST", chemin: "/taches/:issueId/plan/controle", auth: "board-or-agent", resolution: tache, description: "Contrôle le document `plan` de la tâche contre la fiche du client et ses connaissances : identifiant FSMA ou BCE incohérent, marque déclarée mais niée, « aucune source » démentie par la recherche. Rend { ok, erreurs }." },
  { cle: "connaissances.titres", methode: "GET", chemin: "/connaissances/titres", auth: "board-or-agent", resolution: requete, description: "Titres des documents de connaissances en vigueur (type, produit, statut, fin de validité), sans contenu ni donnée personnelle." },
  // Corbeille : suppression réversible pendant 30 jours (humain seulement).
  { cle: "corbeille.lister", methode: "GET", chemin: "/corbeille", auth: "board", resolution: requete, description: "Corbeille : tâches, documents de connaissances et prospects supprimés, avec la date de purge prévue à 30 jours (humain seulement)." },
  { cle: "corbeille.supprimer", methode: "POST", chemin: "/corbeille/suppression", auth: "board", resolution: corps, description: "Met une tâche, un document de connaissances ou un prospect à la corbeille, sans rien détruire (humain seulement), journalisé." },
  { cle: "corbeille.restaurer", methode: "POST", chemin: "/corbeille/restauration", auth: "board", resolution: corps, description: "Restaure un élément de la corbeille dans son état d'avant (humain seulement), journalisé." },
  { cle: "corbeille.vider", methode: "POST", chemin: "/corbeille/vidage", auth: "board", resolution: corps, description: "Supprime réellement les documents et prospects de la corbeille, sur confirmation explicite (humain seulement), journalisé." },
] as const satisfies readonly RouteApi[];

export type CleRouteApi = (typeof ROUTES_API)[number]["cle"];
