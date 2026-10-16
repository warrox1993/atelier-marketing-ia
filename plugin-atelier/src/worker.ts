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
import { creerFacteur, stockLiaisonsParesseux } from "./serveur/liaisons/index.js";

let atelier: ReturnType<typeof creerAtelier> | null = null;
let veilleur: ReturnType<typeof creerVeilleur> | null = null;
let facteur: ReturnType<typeof creerFacteur> | null = null;

const plugin = definePlugin({
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
    ctx.logger.info("Atelier Marketing IA prêt", { espaceBase: ctx.db.namespace });
  },

  async onApiRequest(input) {
    if (!atelier) return { status: 503, body: { erreur: "Atelier non initialisé", code: "erreur_interne" } };
    return atelier.traiterRequeteApi(input);
  },

  async onShutdown() {
    veilleur?.arreter();
    facteur?.arreter();
  },

  async onHealth() {
    return { status: "ok", message: "Worker de l'atelier actif" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
