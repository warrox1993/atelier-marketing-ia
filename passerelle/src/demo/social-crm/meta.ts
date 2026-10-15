// Simulateurs Facebook (Pages) et Instagram professionnel, formes de l'API Graph de Meta.
// Documentation consultée le 15/10/2026 (URL dans docs/passerelle.md, section L7).
// Chiffres : `modeleDemo.publications` uniquement.

import * as z from "zod";
import { modeleDemo, type Publication } from "../modele/index.js";
import type { FournisseurService } from "../../fournisseurs.js";
import {
  ajouterJours, decoderCurseur, dernierSegment, encoderCurseur, formePeriode, horodatageMeta, outilLecture, outilMutation,
  trancher, verifierPeriode,
} from "./utilitaires.js";

const VERSION_GRAPH = "v26.0";
const LIMITE_DEFAUT = 25;
const LIMITE_MAX = 100;

const formePagination = {
  limit: z.number().int().min(1).max(LIMITE_MAX).default(LIMITE_DEFAUT).describe("Éléments par page (25 par défaut, 100 au plus)."),
  after: z.string().max(200).optional().describe("Curseur `paging.cursors.after` de la page précédente."),
};

/** Objet `paging` de l'API Graph : curseurs, et `next` seulement s'il reste des éléments. */
function paginationGraph(chemin: string, tranche: { elements: unknown[]; decalage: number; suivant: number | null }, limite: number, extra: string) {
  const premier = tranche.decalage === 0;
  const paging: Record<string, unknown> = {
    cursors: { before: encoderCurseur(tranche.decalage), after: encoderCurseur(tranche.decalage + tranche.elements.length) },
  };
  if (!premier) paging["previous"] = `https://graph.facebook.com/${VERSION_GRAPH}/${chemin}?${extra}&limit=${limite}&before=${encoderCurseur(tranche.decalage)}`;
  if (tranche.suivant !== null) paging["next"] = `https://graph.facebook.com/${VERSION_GRAPH}/${chemin}?${extra}&limit=${limite}&after=${encoderCurseur(tranche.suivant)}`;
  return paging;
}

/** Publications les plus récentes d'abord, comme `/{page-id}/feed`. */
function publicationsRecentes(reseau: "facebook" | "instagram", debut: string, fin: string): Publication[] {
  verifierPeriode(debut, fin);
  return modeleDemo.publications({ debut, fin, reseau }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// --- Facebook ----------------------------------------------------------------------

const METRIQUES_PAGE = ["page_media_view", "page_total_media_view_unique"] as const;
const DESCRIPTIONS_PAGE: Record<(typeof METRIQUES_PAGE)[number], { title: string; description: string }> = {
  page_media_view: { title: "Lectures de contenus de la Page", description: "Nombre de lectures ou d'affichages des contenus de la Page (publications, vidéos, stories)." },
  page_total_media_view_unique: { title: "Personnes distinctes ayant vu les contenus", description: "Nombre de personnes distinctes ayant vu les contenus de la Page." },
};

export function fournisseurFacebook(): FournisseurService {
  const lectureFeed = outilLecture(
    {
      nom: "facebook_publications",
      description:
        "Publications de la Page sur une période, forme de GET /{page-id}/feed : data[] (id, message, created_time, link, " +
        "reactions, comments, shares) et paging (cursors, next). Les plus récentes d'abord.",
      schemaEntree: { ...formePeriode, ...formePagination },
    },
    ({ debut, fin, limit, after }) => {
      const liste = publicationsRecentes("facebook", debut, fin);
      const tranche = trancher(liste, decoderCurseur(after), limit);
      const data = tranche.elements.map((p) => ({
        id: p.id,
        message: p.texte,
        created_time: horodatageMeta(p.date),
        link: p.lien,
        reactions: { data: [], summary: { total_count: p.reactions, viewer_reaction: "NONE" } },
        comments: { data: [], summary: { order: "ranked", total_count: p.commentaires, can_comment: true } },
        shares: { count: p.partages },
      }));
      return { data, paging: paginationGraph(`page/feed`, tranche, limit, `since=${debut}&until=${fin}`) };
    },
  );

  const insightsPage = outilLecture(
    {
      nom: "facebook_insights_page",
      description:
        "Statistiques quotidiennes de la Page, forme de GET /{page-id}/insights : data[] (name, period, values[{value, end_time}], " +
        "title, description, id). Métriques en vigueur : page_media_view et page_total_media_view_unique (page_impressions est retirée).",
      schemaEntree: {
        ...formePeriode,
        metric: z.array(z.enum(METRIQUES_PAGE)).min(1).max(2).default([...METRIQUES_PAGE]).describe("Métriques demandées."),
        period: z.literal("day").default("day").describe("Seule la période « day » est simulée."),
      },
    },
    ({ debut, fin, metric }, contexte) => {
      verifierPeriode(debut, fin);
      const idPage = dernierSegment(contexte.identite.propriete?.id, "100000000000001");
      const parJour = new Map<string, { vues: number; distinctes: number }>();
      for (const p of modeleDemo.publications({ debut, fin, reseau: "facebook" })) {
        const cumul = parJour.get(p.date) ?? { vues: 0, distinctes: 0 };
        cumul.vues += p.impressions;
        cumul.distinctes += p.portee;
        parJour.set(p.date, cumul);
      }
      const jours: string[] = [];
      for (let d = debut; d <= fin; d = ajouterJours(d, 1)) jours.push(d);
      const data = [...new Set(metric)].map((nom) => ({
        name: nom,
        period: "day",
        values: jours.map((jour) => {
          const cumul = parJour.get(jour);
          return { value: nom === "page_media_view" ? (cumul?.vues ?? 0) : (cumul?.distinctes ?? 0), end_time: horodatageMeta(ajouterJours(jour, 1), "00:00:00") };
        }),
        ...DESCRIPTIONS_PAGE[nom],
        id: `${idPage}/insights/${nom}/day`,
      }));
      return { data };
    },
  );

  const publier = outilMutation({
    nom: "facebook_publier",
    description: "Prépare la publication d'un message sur la Page Facebook.",
    schemaEntree: {
      message: z.string().min(1).max(5000).describe("Texte de la publication."),
      link: z.string().url().max(500).optional().describe("Lien à joindre (optionnel)."),
    },
    destructif: true,
    requeteReelle: "POST /{page-id}/feed",
    resume: (a) => `publication Facebook de ${a.message.length} caractères.`,
  });

  const message = outilMutation({
    nom: "facebook_envoyer_message",
    description: "Prépare l'envoi d'un message privé depuis la Page Facebook.",
    schemaEntree: {
      destinataire: z.string().min(1).max(100).describe("Identifiant (PSID) de la personne qui a écrit à la Page."),
      texte: z.string().min(1).max(2000).describe("Texte du message."),
    },
    destructif: true,
    requeteReelle: "POST /{page-id}/messages",
    resume: (a) => `message privé de ${a.texte.length} caractères.`,
  });

  return { service: "facebook", mode: "demonstration", outils: [lectureFeed, insightsPage, publier, message] };
}

// --- Instagram ---------------------------------------------------------------------

const METRIQUES_MEDIA = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"] as const;
type MetriqueMedia = (typeof METRIQUES_MEDIA)[number];
const DESCRIPTIONS_MEDIA: Record<MetriqueMedia, { title: string; description: string }> = {
  reach: { title: "Portée", description: "Nombre de comptes distincts ayant vu le média." },
  views: { title: "Vues", description: "Nombre de fois où le média a été vu (remplace impressions, retirée)." },
  likes: { title: "J'aime", description: "Nombre de mentions J'aime du média." },
  comments: { title: "Commentaires", description: "Nombre de commentaires du média." },
  shares: { title: "Partages", description: "Nombre de partages du média." },
  saved: { title: "Enregistrements", description: "Nombre d'enregistrements du média." },
  total_interactions: { title: "Interactions", description: "Total des mentions J'aime, commentaires, partages et enregistrements." },
};

/** L'identifiant d'un média du modèle contient sa date : `17900` + AAAAMMJJ + `01`. */
function retrouverMedia(id: string): Publication {
  const trouve = /^17900(\d{4})(\d{2})(\d{2})01$/.exec(id);
  if (trouve) {
    const date = `${trouve[1]}-${trouve[2]}-${trouve[3]}`;
    try {
      const media = modeleDemo.publications({ debut: date, fin: date, reseau: "instagram" }).find((p) => p.id === id);
      if (media) return media;
    } catch {
      // date hors période du modèle : traité comme un média introuvable
    }
  }
  throw new Error(`Média Instagram introuvable : ${id} (code 100, objet inexistant ou autorisation manquante).`);
}

export function fournisseurInstagram(): FournisseurService {
  const medias = outilLecture(
    {
      nom: "instagram_medias",
      description:
        "Médias du compte professionnel sur une période, forme de GET /{ig-user-id}/media : data[] (id, caption, timestamp, " +
        "like_count, comments_count) et paging (cursors, next). Les plus récents d'abord.",
      schemaEntree: { ...formePeriode, ...formePagination },
    },
    ({ debut, fin, limit, after }) => {
      const tranche = trancher(publicationsRecentes("instagram", debut, fin), decoderCurseur(after), limit);
      const data = tranche.elements.map((p) => ({
        id: p.id,
        caption: p.texte,
        timestamp: horodatageMeta(p.date),
        like_count: p.reactions,
        comments_count: p.commentaires,
      }));
      return { data, paging: paginationGraph("media", tranche, limit, `since=${debut}&until=${fin}`) };
    },
  );

  const insights = outilLecture(
    {
      nom: "instagram_insights_media",
      description:
        "Statistiques d'un média, forme de GET /{ig-media-id}/insights : data[] (name, period « lifetime », values[{value}], " +
        "title, description, id). Métriques : reach, views, likes, comments, shares, saved, total_interactions.",
      schemaEntree: {
        media_id: z.string().regex(/^\d{1,30}$/, "identifiant numérique attendu").describe("Identifiant du média (champ `id` de instagram_medias)."),
        metric: z.array(z.enum(METRIQUES_MEDIA)).min(1).max(METRIQUES_MEDIA.length).default([...METRIQUES_MEDIA]).describe("Métriques demandées."),
      },
    },
    ({ media_id, metric }) => {
      const media = retrouverMedia(media_id);
      const valeur: Record<MetriqueMedia, number> = {
        reach: media.portee,
        views: media.impressions,
        likes: media.reactions,
        comments: media.commentaires,
        shares: media.partages,
        saved: media.enregistrements,
        total_interactions: media.reactions + media.commentaires + media.partages + media.enregistrements,
      };
      return {
        data: [...new Set(metric)].map((nom) => ({
          name: nom,
          period: "lifetime",
          values: [{ value: valeur[nom] }],
          ...DESCRIPTIONS_MEDIA[nom],
          id: `${media.id}/insights/${nom}/lifetime`,
        })),
      };
    },
  );

  const publier = outilMutation({
    nom: "instagram_publier",
    description: "Prépare la publication d'un média sur le compte Instagram professionnel.",
    schemaEntree: {
      caption: z.string().min(1).max(2200).describe("Légende du média."),
      image_url: z.string().url().max(500).describe("Adresse publique de l'image."),
    },
    destructif: true,
    requeteReelle: "POST /{ig-user-id}/media puis POST /{ig-user-id}/media_publish",
    resume: (a) => `publication Instagram avec une légende de ${a.caption.length} caractères.`,
  });

  return { service: "instagram", mode: "demonstration", outils: [medias, insights, publier] };
}
