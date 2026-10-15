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
  { cle: "tache.planification", methode: "POST", chemin: "/taches/:issueId/planification", auth: "board-or-agent", resolution: tache, description: "Date de publication PROPOSÉE et canal (calendrier éditorial) ; ce n'est jamais une programmation réelle." },
  { cle: "tache.decision", methode: "POST", chemin: "/taches/:issueId/decisions", auth: "board", resolution: tache, description: "Décision humaine (approuver, demander une correction, rejeter)." },
  { cle: "portes.creer", methode: "POST", chemin: "/portes", auth: "board-or-agent", resolution: corps, description: "Place une tâche native sous la porte de l'atelier." },
  { cle: "campagnes.creer", methode: "POST", chemin: "/campagnes", auth: "board", resolution: corps, description: "Crée une campagne (projet natif + tâche de brief)." },
  { cle: "campagnes.lister", methode: "GET", chemin: "/campagnes", auth: "board-or-agent", resolution: requete, description: "Liste des campagnes de l'entreprise." },
  { cle: "campagnes.exigences", methode: "POST", chemin: "/campagnes/:campagneId/exigences", auth: "board-or-agent", resolution: corps, description: "Enregistre ou corrige les exigences REQ-xxx extraites du brief." },
  { cle: "exigences.exclusion", methode: "POST", chemin: "/exigences/:exigenceId/exclusion", auth: "board-or-agent", resolution: corps, description: "Un agent DEMANDE l'exclusion ; seul un humain l'autorise ou la refuse." },
  { cle: "imports.creer", methode: "POST", chemin: "/imports", auth: "board-or-agent", resolution: corps, description: "Import contrôlé texte, Markdown ou CSV." },
  { cle: "journal.lire", methode: "GET", chemin: "/journal", auth: "board-or-agent", resolution: requete, description: "Rattrapage des événements après reconnexion (`afterSeq`)." },
  { cle: "sante", methode: "GET", chemin: "/sante", auth: "board-or-agent", resolution: requete, description: "Diagnostic de l'atelier et des gardes serveur." },
  { cle: "campagnes.plafond", methode: "POST", chemin: "/campagnes/:campagneId/plafond", auth: "board", resolution: corps, description: "Choix du plafond publicitaire d'une campagne (montant ou « aucune limite »), humain seulement, tracé." },
  { cle: "reglages.enregistrer", methode: "POST", chemin: "/reglages", auth: "board", resolution: corps, description: "Réglages de l'entreprise (plafond de runs, cycles, rétention, plafond publicitaire : humain seulement pour ce dernier)." },
] as const satisfies readonly RouteApi[];

export type CleRouteApi = (typeof ROUTES_API)[number]["cle"];
