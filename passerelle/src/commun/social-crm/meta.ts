// Définitions neutres (nom, schéma d'entrée, annotations) des outils Facebook et Instagram, partagées par le simulateur
// (src/demo/social-crm/meta.ts) et le fournisseur réel (src/reel/social-crm/meta.ts). `date` est le schéma de date du mode.

import * as z from "zod";
import { defLecture, defMutation, formePeriodeAvec } from "./outils.js";

export const METRIQUES_PAGE = ["page_media_view", "page_total_media_view_unique"] as const;
export const METRIQUES_MEDIA = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"] as const;

const LIMITE_DEFAUT = 25;
const LIMITE_MAX = 100;

const formePagination = {
  limit: z.number().int().min(1).max(LIMITE_MAX).default(LIMITE_DEFAUT).describe("Éléments par page (25 par défaut, 100 au plus)."),
  after: z.string().max(200).optional().describe("Curseur `paging.cursors.after` de la page précédente."),
};

export function definitionsMeta(date: z.ZodString) {
  const formePeriode = formePeriodeAvec(date);
  return {
    facebook_publications: defLecture("facebook_publications", { ...formePeriode, ...formePagination }),
    facebook_insights_page: defLecture("facebook_insights_page", {
        ...formePeriode,
        metric: z.array(z.enum(METRIQUES_PAGE)).min(1).max(2).default([...METRIQUES_PAGE]).describe("Métriques demandées."),
        period: z.literal("day").default("day").describe("Seule la période « day » est simulée."),
      }),
    facebook_publier: defMutation("facebook_publier", {
        message: z.string().min(1).max(5000).describe("Texte de la publication."),
        link: z.string().url().max(500).optional().describe("Lien à joindre (optionnel)."),
      }, true),
    facebook_envoyer_message: defMutation("facebook_envoyer_message", {
        destinataire: z.string().min(1).max(100).describe("Identifiant (PSID) de la personne qui a écrit à la Page."),
        texte: z.string().min(1).max(2000).describe("Texte du message."),
      }, true),
    instagram_medias: defLecture("instagram_medias", { ...formePeriode, ...formePagination }),
    instagram_insights_media: defLecture("instagram_insights_media", {
        media_id: z.string().regex(/^\d{1,30}$/, "identifiant numérique attendu").describe("Identifiant du média (champ `id` de instagram_medias)."),
        metric: z.array(z.enum(METRIQUES_MEDIA)).min(1).max(METRIQUES_MEDIA.length).default([...METRIQUES_MEDIA]).describe("Métriques demandées."),
      }),
    instagram_publier: defMutation("instagram_publier", {
        caption: z.string().min(1).max(2200).describe("Légende du média."),
        image_url: z.string().url().max(500).describe("Adresse publique de l'image."),
      }, true),
  };
}
