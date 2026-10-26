/**
 * Worker du plugin de l'Atelier Marketing IA.
 *
 * Câblage seulement : la logique vit dans `src/serveur/` (fonctions pures
 * testées + accès à l'espace de base du plugin). Le worker ne fait jamais
 * confiance aux paramètres pour l'identité : il lit l'acteur et l'entreprise
 * fournis par l'hôte.
 */
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { creerAtelier } from "./serveur/atelier.js";
import { creerBase } from "./serveur/base.js";
import { creerVeilleur } from "./serveur/veilleur.js";
import { creerOutilsFabrique, dossierFile } from "./serveur/fabrique-outils.js";
import { creerSignalement, SUIVI } from "./serveur/fabrique-remise.js";
import { DECLARATION_ETAT_FABRICATION, DECLARATION_FABRIQUER_DOCUMENT, DECLARATION_FABRIQUER_VIDEO } from "./contrats/fabrique-outils-schemas.js";
import { creerFacteur, stockLiaisonsParesseux } from "./serveur/liaisons/index.js";

let atelier: ReturnType<typeof creerAtelier> | null = null;
let veilleur: ReturnType<typeof creerVeilleur> | null = null;
let facteur: ReturnType<typeof creerFacteur> | null = null;
let signalement: ReturnType<typeof creerSignalement> | null = null;

const plugin = definePlugin({
  // Réglages lus par entreprise (ctx.config.get(companyId)) et aucun onConfigChanged : sans ce drapeau, le SDK refuse 27 entreprises sur 28 à chaque démarrage.
  multiCompanyConfig: true,
  async setup(ctx) {
    atelier = creerAtelier(ctx);
    atelier.enregistrer();
    // Veilleur des tâches orphelines (16/10/2026) : réveille un agent dont la tâche est restée sans passage.
    veilleur = creerVeilleur({
      base: creerBase(ctx.db),
      issues: ctx.issues,
      logger: ctx.logger,
      config: async (companyId) => (await ctx.config.get(companyId)) as Record<string, unknown> | null,
    });
    veilleur.demarrer();
    // Facteur du bureau de liaison (essai L9, 16/10/2026) : transmissions et réponses entre deux entreprises, que l'hôte
    // refuse pendant une route ou un événement. Créé ICI, dans setup() : sa minuterie n'hérite d'aucune invocation.
    facteur = creerFacteur({ ctx, base: creerBase(ctx.db), stock: stockLiaisonsParesseux(ctx) });
    facteur.demarrer();
    // Fabrique (lot 2) : trois outils d'agent qui déposent un travail dans la file de fichiers (aucun programme lancé).
    const fabrique = creerOutilsFabrique({
      agentConnu: async (agentId, companyId) => (await ctx.agents.get(agentId, companyId)) !== null,
      avertir: (message) => ctx.logger.warn(message),
      config: async (companyId) => (await ctx.config.get(companyId)) as Record<string, unknown> | null,
      etatLire: (cle, companyId) => ctx.state.get({ scopeKind: "company", scopeId: companyId, stateKey: cle }),
      etatEcrire: (cle, companyId, valeur) => ctx.state.set({ scopeKind: "company", scopeId: companyId, stateKey: cle }, valeur),
      tacheDuRun: (runId, companyId) => creerBase(ctx.db).tacheDuRun(companyId, runId),
      suiviLire: () => ctx.state.get({ scopeKind: "instance", stateKey: SUIVI.cle }),
      suiviEcrire: (valeur) => ctx.state.set({ scopeKind: "instance", stateKey: SUIVI.cle }, valeur),
    });
    // Fin de travail (lot 6) : commentaire sur la tâche d'origine, puis réveil de l'agent, une seule fois par travail.
    signalement = creerSignalement({
      suiviLire: () => ctx.state.get({ scopeKind: "instance", stateKey: SUIVI.cle }),
      suiviEcrire: (valeur) => ctx.state.set({ scopeKind: "instance", stateKey: SUIVI.cle }, valeur),
      racine: async (companyId) => dossierFile((await ctx.config.get(companyId)) as Record<string, unknown> | null),
      commenter: (tache, texte, companyId) => ctx.issues.createComment(tache, texte, companyId),
      reveiller: (tache, companyId, cle) =>
        ctx.issues.requestWakeup(tache, companyId, { reason: "atelier_fabrique_travail_termine", contextSource: "atelier.fabrique", idempotencyKey: cle }),
      logger: ctx.logger,
    });
    signalement.demarrer();
    const { name: _n1, ...metaDocument } = DECLARATION_FABRIQUER_DOCUMENT;
    const { name: _n3, ...metaVideo } = DECLARATION_FABRIQUER_VIDEO;
    const { name: _n2, ...metaEtat } = DECLARATION_ETAT_FABRICATION;
    ctx.tools.register(DECLARATION_FABRIQUER_DOCUMENT.name, metaDocument, (p, run) => fabrique.fabriquerDocument(p, run));
    ctx.tools.register(DECLARATION_FABRIQUER_VIDEO.name, metaVideo, (p, run) => fabrique.fabriquerVideo(p, run));
    ctx.tools.register(DECLARATION_ETAT_FABRICATION.name, metaEtat, (p, run) => fabrique.etatFabrication(p, run));
    ctx.logger.info("Atelier Marketing IA prêt", { espaceBase: ctx.db.namespace });
  },

  async onApiRequest(input) {
    if (!atelier) return { status: 503, body: { erreur: "Atelier non initialisé", code: "erreur_interne" } };
    return atelier.traiterRequeteApi(input);
  },

  async onShutdown() {
    veilleur?.arreter();
    facteur?.arreter();
    signalement?.arreter();
  },

  async onHealth() {
    return { status: "ok", message: "Worker de l'atelier actif" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
