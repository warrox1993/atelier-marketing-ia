import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, SLUG_ESPACE_BASE } from "./contrats/identifiants.js";
import { ROUTES_API } from "./contrats/routes.js";
import { EXPORTS_UI, ROUTE_ATELIER } from "./contrats/ui-constantes.js";

/**
 * Manifeste du plugin officiel de l'Atelier Marketing IA.
 *
 * Le système de plugins est qualifié
 * d'« alpha surface » par l'amont ; son usage est un choix explicite de l'opérateur pour ce projet
 * uniquement. Ce que le plugin ne peut pas garantir (refuser une transition,
 * plafonner les runs) est assuré par le patch serveur isolé
 * `socle/patches/` (P1, P2, régulateur).
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Atelier",
  description:
    "Exigences, preuves, revues structurées, contrôle automatique, messages typés, sources protégées et vues marketing en français.",
  author: "Atelier Marketing IA (local)",
  categories: ["automation", "ui"],
  minimumHostVersion: "2026.1012.0",
  capabilities: [
    "companies.read",
    "projects.read",
    "issues.read",
    "issue.relations.read",
    "issue.comments.read",
    "issue.documents.read",
    "issue.interactions.read",
    // Envoi d'e-mails : le plugin crée lui-même la carte de confirmation (texte construit côté serveur).
    "issue.interactions.create",
    "agents.read",
    "approvals.read",
    "activity.read",
    "costs.read",
    "issues.orchestration.read",
    "issues.create",
    "issues.update",
    "issue.comments.create",
    "issues.wakeup",
    "activity.log.write",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "api.routes.register",
    "http.outbound",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    // v1.5 (revue de sécurité §6) : clé privée d'approbation lue dans le coffre de secrets natif.
    "secrets.read-ref",
    "ui.page.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "ui.dashboardWidget.register",
  ],
  /**
   * v1.5 (revue de sécurité §6 et §6 bis) : configuration par entreprise, fixée par l'humain
   * (administrateur de l'instance) dans les réglages du plugin, jamais par un agent.
   */
  instanceConfigSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      approbationClePrivee: {
        type: "object",
        format: "secret-ref",
        title: "Clé privée d'approbation (Ed25519)",
        description:
          "Secret natif de Paperclip contenant la clé privée Ed25519 (PEM PKCS#8) qui signe les preuves d'approbation des diffusions réelles. La clé publique correspondante va dans PASSERELLE_APPROBATION_CLE_PUBLIQUE_FICHIER de la passerelle.",
      },
      // Lot P9a (prospection, §4.3) : deux secrets natifs DISTINCTS. Sans eux, en mode réel, aucune donnée
      // personnelle n'est enregistrée ; en démonstration seulement, une clé dérivée sert à défaut.
      donneesCleChiffrement: {
        type: "object",
        format: "secret-ref",
        title: "Clé de chiffrement des coordonnées (AES-256)",
        description:
          "Secret natif de Paperclip contenant 32 octets aléatoires (base64 ou 64 caractères hexadécimaux), par exemple `openssl rand -base64 32`. Chiffre les noms, courriels, téléphones et adresses des prospects à la réception ; jamais en base.",
      },
      donneesCleHmac: {
        type: "object",
        format: "secret-ref",
        title: "Clé des empreintes (HMAC-SHA-256)",
        description:
          "Secret natif DISTINCT de la clé de chiffrement, d'au moins 32 octets (base64 ou hexadécimal). Calcule les empreintes de dédoublonnage et d'opposition ; la changer rend les empreintes existantes inutilisables.",
      },
      passerelleClesPubliques: {
        type: "array",
        title: "Clés publiques de la passerelle",
        description:
          "Clé(s) publique(s) Ed25519 de la passerelle (ligne « clé publique à donner au plugin » de son journal de démarrage, SPKI DER en base64). Plusieurs clés : rotation. Sans clé, aucune donnée de connexion n'est tenue pour réelle.",
        maxItems: 5,
        items: { type: "string", minLength: 40, maxLength: 4000 },
      },
      // Revue F5 : les rôles « Mesure » et « Stratège » (clôture des expériences, tâche d'apprentissage) sont des
      // identifiants d'agent fixés par l'humain ou par l'amorçage, jamais déduits du nom d'un agent (qu'il peut changer).
      rolesAgents: {
        type: "object",
        title: "Rôles d'agents (identifiants)",
        description:
          "Identifiants des agents qui tiennent les rôles « mesure » et « stratege » dans cette entreprise. Remplis par scripts/bootstrap-organisation.py ; sans eux, aucun agent n'a ces rôles dans les expériences A/B.",
        additionalProperties: false,
        properties: {
          mesure: { type: "string", minLength: 8, maxLength: 64 },
          stratege: { type: "string", minLength: 8, maxLength: 64 },
        },
      },
      passerelleUrl: {
        type: "string",
        title: "Adresse de la passerelle",
        description:
          "Adresse locale de la passerelle marketing (par exemple http://127.0.0.1:3190), lue seulement par le diagnostic pour afficher quelles sources sont réelles. Sans adresse : mode non vérifié.",
        maxLength: 200,
      },
      dicteeUrl: {
        type: "string",
        title: "Adresse du serveur de dictée vocale",
        description:
          "Adresse locale de whisper-server (défaut http://127.0.0.1:8178), boucle locale seulement : l'audio ne sort jamais de cette machine et n'est jamais conservé.",
        maxLength: 200,
      },
      // Lot R7 (connaissances du client, docs/rag-conception.md §3.4) : vectorisation des passages.
      connaissancesVectorisation: {
        type: "string",
        enum: ["aucun", "local", "voyage"],
        default: "aucun",
        title: "Vectorisation des connaissances",
        description:
          "« aucun » : recherche plein texte seule (défaut). « local » : modèle bge-m3 sur cette machine (dossier plugin-atelier/.modeles), rien ne sort. « voyage » : API Voyage AI (Europe), seulement si l'accord écrit du client est coché ci-dessous.",
      },
      connaissancesVoyageAccord: {
        type: "boolean",
        default: false,
        title: "Accord écrit du client pour Voyage AI",
        description: "À cocher seulement si le client a accepté PAR ÉCRIT l'envoi du texte de ses documents à Voyage AI. Sans cela, « voyage » retombe sur le plein texte.",
      },
      // Veilleur des tâches orphelines (16/10/2026).
      veilleurSeuilMinutes: {
        type: "integer",
        minimum: 5,
        maximum: 1440,
        default: 15,
        title: "Veilleur : délai avant réveil d'une tâche orpheline (minutes)",
        description:
          "Une tâche assignée à un agent, non terminée et sans passage actif ni programmé depuis ce délai est réveillée une fois par période (au plus 3 fois en 24 heures, puis l'atelier le signale).",
      },
      humainDestinataire: {
        type: "string",
        title: "Humain destinataire (identifiant d'utilisateur)",
        description:
          "Identifiant de l'utilisateur Paperclip (propriétaire ou administrateur) qui reçoit les blocages de revue et les messages adressés à l'humain quand aucun humain n'est assigné à la tâche. Obligatoire en mode authentifié (accès à distance) ; sans valeur, repli « local-board » (mode local_trusted).",
        maxLength: 200,
      },
      openaiSecretRef: {
        type: "object",
        format: "secret-ref",
        title: "Clé d'API OpenAI (voix en direct)",
        description: "Secret natif de Paperclip contenant la clé d'API OpenAI de la voix en direct ; lue à chaque ouverture de session, jamais copiée en configuration ni envoyée au navigateur (il ne reçoit qu'un secret éphémère de 60 secondes).",
      },
      connaissancesVoyageCle: {
        type: "object",
        format: "secret-ref",
        title: "Clé d'API Voyage AI",
        description: "Secret natif de Paperclip contenant la clé d'API Voyage AI ; lue à chaque appel, jamais copiée en configuration.",
      },
    },
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  database: {
    namespaceSlug: SLUG_ESPACE_BASE,
    migrationsDir: "migrations",
    coreReadTables: [
      "companies",
      "projects",
      "agents",
      "issues",
      "issue_documents",
      "issue_relations",
      "issue_comments",
      "heartbeat_runs",
      "cost_events",
      "approvals",
      "budget_incidents",
    ],
  },
  apiRoutes: ROUTES_API.map((route) => ({
    routeKey: route.cle,
    method: route.methode,
    path: route.chemin,
    auth: route.auth,
    capability: "api.routes.register" as const,
    ...("checkout" in route ? { checkoutPolicy: route.checkout } : {}),
    companyResolution: route.resolution,
  })),
  ui: {
    slots: [
      { type: "page", id: "atelier-page", displayName: "Atelier", exportName: EXPORTS_UI.page, routePath: ROUTE_ATELIER },
      { type: "routeSidebar", id: "atelier-navigation", displayName: "Atelier", exportName: EXPORTS_UI.navigation, routePath: ROUTE_ATELIER },
      { type: "sidebar", id: "atelier-entree", displayName: "Atelier", exportName: EXPORTS_UI.entreeBarreLaterale },
      { type: "detailTab", id: "atelier-onglet-tache", displayName: "Atelier", exportName: EXPORTS_UI.ongletTache, entityTypes: ["issue"] },
      { type: "dashboardWidget", id: "atelier-widget", displayName: "Atelier", exportName: EXPORTS_UI.widget },
    ],
  },
};

export default manifest;
