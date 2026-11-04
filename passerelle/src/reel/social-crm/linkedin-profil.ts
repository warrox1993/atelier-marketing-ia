// Profil personnel LinkedIn en mode réel (service linkedinprofil). Sources consultées le 30/10/2026 :
//   Share on LinkedIn (w_member_social)     https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
//   Sign In with LinkedIn using OpenID Connect (openid, profile ; GET /v2/userinfo, `sub` = identifiant de la personne)
//                                           https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
//   Posts API (remplace ugcPosts ; auteur urn:li:person ou urn:li:organization)
//                                           https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
//   Organic Posts (w_member_social : créer au nom du membre ; r_member_social : lecture, restreinte)
//                                           https://learn.microsoft.com/en-us/linkedin/marketing/usecases/page-management/organic-posts-usecase
//   Article Post API (source et title obligatoires, title < 400 caractères, aucune lecture de la page liée)
//                                           https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-targeting/version/article-ads-integrations
//
//   linkedin_profil_publier  POST /rest/posts → 201, identifiant dans l'en-tête x-restli-id (w_member_social)
//
// Community Management doit être le seul produit de son application : le profil a donc sa propre application
// (PASSERELLE_LINKEDIN_PROFIL_CLIENT_ID/SECRET). Réconciliation : sans r_member_social, la passerelle ne peut pas relire
// les publications du membre ; une issue ambiguë reste « à vérifier à la main » et n'est jamais renvoyée.

import type { FournisseurService } from "../../fournisseurs.js";
import { definitionsLinkedinProfil } from "../../commun/social-crm/linkedin.js";
import { gabarit } from "./commun.js";
import { mutationReelle } from "./execution.js";
import { appelLinkedin } from "./linkedin.js";
import type { DependancesOutils } from "./meta.js";

const DEFS = definitionsLinkedinProfil();

export function fournisseurLinkedinProfilReel(dep: DependancesOutils): FournisseurService {
  type ArgsPublier = { commentary: string; lien?: string; titre_lien?: string };
  const publier = mutationReelle<ArgsPublier>(dep, {
    outil: { ...gabarit(DEFS.linkedin_profil_publier, "Publie un texte (et, au besoin, un lien en article) au nom de la personne connectée sur son profil LinkedIn (POST /rest/posts, auteur = urn:li:person de la connexion)."), executer: () => undefined },
    requeteReelle: "POST /rest/posts (author = urn:li:person:..., lifecycleState PUBLISHED)",
    resume: (a) => `publication sur le profil LinkedIn de ${a.commentary.length} caractères${a.lien ? " avec un lien" : ""}.`,
    verifier: (a) => {
      if ((a.lien === undefined) !== (a.titre_lien === undefined)) throw new Error("`lien` et `titre_lien` vont ensemble : LinkedIn exige le titre d'un article lié.");
    },
    executer: async (acces, a) => {
      const r = await appelLinkedin(dep, acces, "POST", "/rest/posts", `le profil ${acces.compte.id}`, {
        author: acces.compte.id,
        commentary: a.commentary,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(a.lien ? { content: { article: { source: a.lien, title: a.titre_lien } } } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      });
      return { id: r.entetes.get("x-restli-id") ?? "" };
    },
    reconcilier: async () => ({ etat: "inconnu", motif: "LinkedIn ne laisse pas relire les publications d'un membre (portée r_member_social réservée) ; vérifier le profil à la main" }),
  });

  return { service: "linkedinprofil", mode: "reel", outils: [publier] };
}
