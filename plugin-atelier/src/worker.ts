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

let atelier: ReturnType<typeof creerAtelier> | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    atelier = creerAtelier(ctx);
    atelier.enregistrer();
    ctx.logger.info("Atelier Marketing IA prêt", { espaceBase: ctx.db.namespace });
  },

  async onApiRequest(input) {
    if (!atelier) return { status: 503, body: { erreur: "Atelier non initialisé", code: "erreur_interne" } };
    return atelier.traiterRequeteApi(input);
  },

  async onHealth() {
    return { status: "ok", message: "Worker de l'atelier actif" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
