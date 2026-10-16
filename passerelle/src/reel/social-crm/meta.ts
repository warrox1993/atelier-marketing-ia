// Facebook (Pages) et Instagram professionnel en mode réel : API Graph de Meta, version v26.0 (version
// courante, sortie le 29/07/2026 : https://developers.facebook.com/docs/graph-api/changelog/).
//
// Requêtes (documentation consultée le 15/10/2026) :
//   facebook_publications    GET  graph.facebook.com/v26.0/{page-id}/feed (since, until, limit, after ; champs
//                            id, message, created_time, link, reactions/comments summary, shares)
//                            https://developers.facebook.com/docs/graph-api/reference/page/feed/
//   facebook_insights_page   GET  /{page-id}/insights?metric=page_media_view,page_total_media_view_unique&period=day
//                            https://developers.facebook.com/docs/graph-api/reference/insights
//   facebook_publier         POST /{page-id}/feed (message, link) → { id }, jeton de Page, pages_manage_posts
//   facebook_envoyer_message POST /{page-id}/messages { recipient: { id }, messaging_type: RESPONSE, message: { text } }
//                            → { recipient_id, message_id }, pages_messaging (fenêtre de réponse standard)
//                            https://developers.facebook.com/docs/messenger-platform/send-messages
//   instagram_medias         GET  graph.instagram.com/v26.0/{ig-user-id}/media (since, until, limit, after)
//                            https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
//   instagram_insights_media GET  /{ig-media-id}/insights?metric=…
//                            https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
//   instagram_publier        POST /{ig-user-id}/media (image_url, caption) → conteneur, statut FINISHED, puis
//                            POST /{ig-user-id}/media_publish (creation_id) → { id }
//                            https://developers.facebook.com/docs/instagram-platform/content-publishing

import { ajouterMention, MENTION_IA_PAR_DEFAUT } from "../../mention-ia.js";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { definitionsMeta } from "../../commun/social-crm/meta.js";
import type { AccesPlateforme } from "./autorisation.js";
import { DateReelle, gabarit, lendemain, liste, msDate, nombre, objet, secondesDate, texte, urlSansJeton, verifierPeriode } from "./commun.js";
import { VERSION_GRAPH_META, type ConfigSocialCrmReel } from "./config.js";
import { lire, mutationReelle, type DependancesExecution, type Reconciliation } from "./execution.js";
import { envoyer, ErreurFournisseur, verifierReponse, type Plateforme } from "./http.js";

export interface DependancesOutils extends DependancesExecution {
  config: ConfigSocialCrmReel;
}

async function graph(
  dep: DependancesOutils,
  plateforme: Plateforme,
  acces: AccesPlateforme,
  methode: "GET" | "POST",
  chemin: string,
  params: Record<string, string | number | undefined>,
  cible: string,
  corpsJson?: unknown,
): Promise<Record<string, unknown>> {
  const base = plateforme === "meta" ? dep.config.adresses.metaGraph : dep.config.adresses.instagramGraph;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const jeton = acces.secrets.acces;
  if (!jeton) throw new ErreurFournisseur("jeton_expire", "Aucun jeton pour cette connexion : reconnectez le service dans Paperclip (Apps).");
  const url = `${base}/${VERSION_GRAPH_META}/${chemin}`;
  const reponse = await envoyer(
    methode === "GET"
      ? { methode, url: q.size > 0 ? `${url}?${q.toString()}` : url, auth: { type: "bearer", jeton } }
      : { methode, url, auth: { type: "bearer", jeton }, corps: corpsJson ?? q },
    plateforme,
    dep.config.delaiAppelMs,
  );
  verifierReponse(reponse, plateforme, cible);
  return objet(reponse.json);
}

/** Pagination Graph telle quelle (curseurs), adresses `next`/`previous` sans aucun jeton. */
function pagingGraph(brut: unknown): Record<string, unknown> {
  const p = objet(brut);
  const curseurs = objet(p["cursors"]);
  const sortie: Record<string, unknown> = { cursors: { before: texte(curseurs["before"]), after: texte(curseurs["after"]) } };
  const prec = urlSansJeton(p["previous"]);
  const suiv = urlSansJeton(p["next"]);
  if (prec) sortie["previous"] = prec;
  if (suiv) sortie["next"] = suiv;
  return sortie;
}

const resumeVide = (v: unknown, defaut: Record<string, unknown>): Record<string, unknown> => ({ ...defaut, ...objet(objet(v)["summary"]) });

// --- Facebook ------------------------------------------------------------------------------------

const DEFS = definitionsMeta(DateReelle);

export function fournisseurFacebookReel(dep: DependancesOutils): FournisseurService {

  const g1 = gabarit(DEFS.facebook_publications, "Publications de la Page sur une période (GET /{page-id}/feed de l'API Graph) : data[] (id, message, created_time, link, reactions, comments, shares) et paging (cursors, next). Les plus récentes d'abord.");
  const publications: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; limit: number; after?: string };
        verifierPeriode(a.debut, a.fin);
        const r = await graph(dep, "meta", acces, "GET", `${acces.compte.id}/feed`, {
          fields: "id,message,created_time,link,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares",
          since: secondesDate(a.debut),
          until: secondesDate(lendemain(a.fin)),
          limit: a.limit,
          after: a.after,
        }, `la Page ${acces.compte.id}`);
        const data = liste(r["data"]).map((brutPub) => {
          const p = objet(brutPub);
          return {
            id: texte(p["id"]),
            message: typeof p["message"] === "string" ? p["message"] : null,
            created_time: texte(p["created_time"]),
            link: typeof p["link"] === "string" ? p["link"] : null,
            reactions: { data: [], summary: resumeVide(p["reactions"], { total_count: 0, viewer_reaction: "NONE" }) },
            comments: { data: [], summary: resumeVide(p["comments"], { order: "ranked", total_count: 0, can_comment: true }) },
            // Meta omet `shares` quand la publication n'a aucun partage.
            shares: { count: nombre(objet(p["shares"])["count"]) },
          };
        });
        return { data, paging: pagingGraph(r["paging"]) };
      }),
  };

  const g2 = gabarit(DEFS.facebook_insights_page, "Statistiques quotidiennes de la Page (GET /{page-id}/insights) : data[] (name, period, values[{value, end_time}], title, description, id). Métriques : page_media_view et page_total_media_view_unique.");
  const insights: OutilPasserelle = {
    ...g2,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; metric: string[]; period: "day" };
        verifierPeriode(a.debut, a.fin);
        const metriques = [...new Set(a.metric)];
        // Les statistiques de Page se demandent par tranches de 90 jours au plus ; les tranches sont recollées.
        const parNom = new Map<string, Record<string, unknown>>();
        let debut = a.debut;
        while (debut <= a.fin) {
          const finTranche = new Date(Math.min(msDate(debut) + 89 * 86_400_000, msDate(a.fin))).toISOString().slice(0, 10);
          const r = await graph(dep, "meta", acces, "GET", `${acces.compte.id}/insights`, {
            metric: metriques.join(","),
            period: "day",
            since: secondesDate(debut),
            until: secondesDate(lendemain(finTranche)),
          }, `les statistiques de la Page ${acces.compte.id}`);
          for (const brutLigne of liste(r["data"])) {
            const l = objet(brutLigne);
            const nom = texte(l["name"]);
            if (!metriques.includes(nom)) continue;
            const existante = parNom.get(nom);
            const valeurs = liste(l["values"]).map((v) => ({ value: objet(v)["value"] ?? 0, end_time: texte(objet(v)["end_time"]) }));
            if (existante) (existante["values"] as unknown[]).push(...valeurs);
            else parNom.set(nom, { name: nom, period: texte(l["period"]) || "day", values: valeurs, title: texte(l["title"]), description: texte(l["description"]), id: texte(l["id"]) });
          }
          debut = lendemain(finTranche);
        }
        return { data: metriques.map((m) => parNom.get(m)).filter((x) => x !== undefined) };
      }),
  };

  type ArgsPublier = { message: string; link?: string };
  const publier = mutationReelle<ArgsPublier>(dep, {
    outil: { ...gabarit(DEFS.facebook_publier, "Publie un message sur la Page Facebook (POST /{page-id}/feed)."), executer: () => undefined },
    requeteReelle: "POST /{page-id}/feed",
    resume: (a) => `publication Facebook de ${a.message.length} caractères.`,
    executer: async (acces, a) => {
      const corps = new URLSearchParams({ message: a.message });
      if (a.link) corps.set("link", a.link);
      const r = await graph(dep, "meta", acces, "POST", `${acces.compte.id}/feed`, {}, `la Page ${acces.compte.id}`, corps);
      return { id: texte(r["id"]) };
    },
    reconcilier: async (acces, a, debutMs): Promise<Reconciliation> => {
      const r = await graph(dep, "meta", acces, "GET", `${acces.compte.id}/feed`, { fields: "id,message,created_time", since: Math.floor(debutMs / 1000) - 120, limit: 50 }, `la Page ${acces.compte.id}`);
      const trouve = liste(r["data"]).map(objet).find((p) => p["message"] === a.message);
      return trouve ? { etat: "trouve", resultat: { id: texte(trouve["id"]) } } : { etat: "absent" };
    },
  });

  const LONGUEUR_MAX_MESSAGE = 2000;
  type ArgsMessage = { destinataire: string; texte: string };
  const message = mutationReelle<ArgsMessage>(dep, {
    outil: { ...gabarit(DEFS.facebook_envoyer_message, "Envoie un message privé depuis la Page (POST /{page-id}/messages, type RESPONSE : réponse dans la fenêtre de messagerie standard)."), executer: () => undefined },
    requeteReelle: "POST /{page-id}/messages",
    resume: (a) => `message privé de ${a.texte.length} caractères.`,
    // Article 50 du règlement européen sur l'IA : la mention est ajoutée à la préparation, donc visible dans ce que l'humain approuve
    // et incluse dans l'empreinte signée.
    preparer: (a) => ({ ...a, texte: ajouterMention(a.texte, dep.config.mentionIa ?? MENTION_IA_PAR_DEFAUT) }),
    verifier: (a) => {
      if (a.texte.length > LONGUEUR_MAX_MESSAGE) throw new ErreurFournisseur("requete_invalide", `Le message, mention d'information IA comprise, dépasse ${LONGUEUR_MAX_MESSAGE} caractères : le raccourcir.`);
    },
    executer: async (acces, a) => {
      const r = await graph(dep, "meta", acces, "POST", `${acces.compte.id}/messages`, {}, "la conversation", { recipient: { id: a.destinataire }, messaging_type: "RESPONSE", message: { text: a.texte } });
      return { recipient_id: texte(r["recipient_id"]), message_id: texte(r["message_id"]) };
    },
    // Relire un message envoyé demande la lecture des conversations (autre permission) : jamais de renvoi automatique.
    reconcilier: async () => ({ etat: "inconnu", motif: "un message privé envoyé ne peut pas être relu par cette connexion" }),
  });

  return { service: "facebook", mode: "reel", outils: [publications, insights, publier, message] };
}

// --- Instagram -------------------------------------------------------------------------------------

export function fournisseurInstagramReel(dep: DependancesOutils): FournisseurService {
  const attendre = dep.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const g1 = gabarit(DEFS.instagram_medias, "Médias du compte professionnel sur une période (GET /{ig-user-id}/media) : data[] (id, caption, timestamp, like_count, comments_count) et paging (cursors, next). Les plus récents d'abord.");
  const medias: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; limit: number; after?: string };
        verifierPeriode(a.debut, a.fin);
        const r = await graph(dep, "instagram", acces, "GET", `${acces.compte.id}/media`, {
          fields: "id,caption,timestamp,like_count,comments_count",
          since: secondesDate(a.debut),
          until: secondesDate(lendemain(a.fin)),
          limit: a.limit,
          after: a.after,
        }, `le compte ${acces.compte.libelle}`);
        const data = liste(r["data"]).map((brutMedia) => {
          const m = objet(brutMedia);
          return {
            id: texte(m["id"]),
            caption: typeof m["caption"] === "string" ? m["caption"] : null,
            timestamp: texte(m["timestamp"]),
            // Absents quand le propriétaire masque les compteurs : null plutôt qu'un zéro inventé.
            like_count: typeof m["like_count"] === "number" ? m["like_count"] : null,
            comments_count: typeof m["comments_count"] === "number" ? m["comments_count"] : null,
          };
        });
        return { data, paging: pagingGraph(r["paging"]) };
      }),
  };

  const g2 = gabarit(DEFS.instagram_insights_media, "Statistiques d'un média (GET /{ig-media-id}/insights) : data[] (name, period, values[{value}], title, description, id).");
  const insights: OutilPasserelle = {
    ...g2,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { media_id: string; metric: string[] };
        const metriques = [...new Set(a.metric)];
        const r = await graph(dep, "instagram", acces, "GET", `${a.media_id}/insights`, { metric: metriques.join(",") }, `le média ${a.media_id}`);
        const data = liste(r["data"]).map(objet).map((l) => ({
          name: texte(l["name"]),
          period: texte(l["period"]) || "lifetime",
          values: liste(l["values"]).map((v) => ({ value: objet(v)["value"] ?? 0 })),
          title: texte(l["title"]),
          description: texte(l["description"]),
          id: texte(l["id"]),
        }));
        return { data };
      }),
  };

  type ArgsPublier = { caption: string; image_url: string };
  const publier = mutationReelle<ArgsPublier>(dep, {
    outil: { ...gabarit(DEFS.instagram_publier, "Publie une image (JPEG à une adresse publique) sur le compte Instagram professionnel : conteneur, puis media_publish."), executer: () => undefined },
    requeteReelle: "POST /{ig-user-id}/media puis POST /{ig-user-id}/media_publish",
    resume: (a) => `publication Instagram avec une légende de ${a.caption.length} caractères.`,
    executer: async (acces, a) => {
      const conteneur = await graph(dep, "instagram", acces, "POST", `${acces.compte.id}/media`, {}, `le compte ${acces.compte.libelle}`, new URLSearchParams({ image_url: a.image_url, caption: a.caption }));
      const idConteneur = texte(conteneur["id"]);
      if (!idConteneur) throw new ErreurFournisseur("requete_invalide", "Instagram n'a pas créé de conteneur.");
      // Le conteneur doit être prêt (FINISHED) avant la publication ; un conteneur non publié expire sans effet.
      for (let essai = 0; essai < 5; essai++) {
        const statut = texte((await graph(dep, "instagram", acces, "GET", idConteneur, { fields: "status_code" }, "le conteneur"))["status_code"]);
        if (statut === "FINISHED") break;
        if (statut === "ERROR" || statut === "EXPIRED") throw new ErreurFournisseur("requete_invalide", `Instagram refuse le média (statut ${statut}) : vérifier que l'image est un JPEG accessible publiquement.`);
        if (essai === 4) throw new ErreurFournisseur("indisponible", "Le média Instagram n'est pas prêt après plusieurs vérifications : réessayer (la même preuve ne publiera qu'une fois).");
        await attendre(2000);
      }
      const r = await graph(dep, "instagram", acces, "POST", `${acces.compte.id}/media_publish`, {}, `le compte ${acces.compte.libelle}`, new URLSearchParams({ creation_id: idConteneur }));
      return { id: texte(r["id"]), conteneur: idConteneur };
    },
    reconcilier: async (acces, a, debutMs): Promise<Reconciliation> => {
      const r = await graph(dep, "instagram", acces, "GET", `${acces.compte.id}/media`, { fields: "id,caption,timestamp", since: Math.floor(debutMs / 1000) - 120, limit: 50 }, `le compte ${acces.compte.libelle}`);
      const trouve = liste(r["data"]).map(objet).find((m) => m["caption"] === a.caption);
      return trouve ? { etat: "trouve", resultat: { id: texte(trouve["id"]) } } : { etat: "absent" };
    },
  });

  return { service: "instagram", mode: "reel", outils: [medias, insights, publier] };
}

