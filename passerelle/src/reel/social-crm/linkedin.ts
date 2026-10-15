// Pages LinkedIn en mode réel : Community Management API, version 202610 (dernière version publiée,
// https://learn.microsoft.com/en-us/linkedin/marketing/versioning, consultée le 15/10/2026). En-têtes
// obligatoires : Linkedin-Version et X-Restli-Protocol-Version: 2.0.0.
//
//   linkedin_publications  GET  /rest/posts?author={urn}&q=author&count&start&sortBy (aucun filtre de date chez
//                          LinkedIn : la période est reconstituée en parcourant les pages triées par date de
//                          création, au plus 20 pages de 100)
//                          https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
//   linkedin_statistiques  GET  /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity={urn}
//                          &timeIntervals=(timeRange:(start:…,end:…),timeGranularityType:DAY|MONTH) ou &shares=List(…)
//                          (12 mois glissants ; statistiques par publication sans période ; rw_organization_admin)
//                          https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics
//   linkedin_publier       POST /rest/posts → 201, identifiant dans l'en-tête x-restli-id (w_organization_social)

import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { fournisseurLinkedin } from "../../demo/social-crm/linkedin.js";
import type { AccesPlateforme } from "./autorisation.js";
import { gabarit, lendemain, liste, MAX_PAGES_PARCOURUES, msDate, nombre, objet, texte, tropDeResultats, verifierPeriode } from "./commun.js";
import { VERSION_LINKEDIN } from "./config.js";
import { lire, mutationReelle, type Reconciliation } from "./execution.js";
import { envoyer, ErreurFournisseur, verifierReponse } from "./http.js";
import type { DependancesOutils } from "./meta.js";

const ENTETES = { "Linkedin-Version": VERSION_LINKEDIN, "X-Restli-Protocol-Version": "2.0.0" };

async function appelLinkedin(dep: DependancesOutils, acces: AccesPlateforme, methode: "GET" | "POST", cheminEtRequete: string, cible: string, corps?: unknown, methodeRestli?: string) {
  const jeton = acces.secrets.acces;
  if (!jeton) throw new ErreurFournisseur("jeton_expire", "Aucun jeton pour cette connexion : reconnectez le service dans Paperclip (Apps).");
  const reponse = await envoyer(
    { methode, url: `${dep.config.adresses.linkedinApi}${cheminEtRequete}`, auth: { type: "bearer", jeton }, entetes: { ...ENTETES, ...(methodeRestli ? { "X-RestLi-Method": methodeRestli } : {}) }, ...(corps !== undefined ? { corps } : {}) },
    "linkedin",
    dep.config.delaiAppelMs,
  );
  verifierReponse(reponse, "linkedin", cible);
  return reponse;
}

const CLES_PUBLICATION = ["lifecycleState", "lastModifiedAt", "visibility", "publishedAt", "author", "distribution", "content", "lifecycleStateInfo", "isReshareDisabledByAuthor", "createdAt", "id", "commentary"] as const;

/** Forme L7 d'une publication : mêmes clés, dans le même ordre ; `content` vide quand LinkedIn l'omet. */
function publication(e: Record<string, unknown>): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const cle of CLES_PUBLICATION) sortie[cle] = e[cle] ?? (cle === "content" || cle === "lifecycleStateInfo" ? {} : cle === "commentary" ? "" : null);
  // LinkedIn omet les listes vides de `distribution` (exemples de la documentation) : elles sont rétablies vides.
  const distribution = objet(e["distribution"]);
  sortie["distribution"] = { feedDistribution: distribution["feedDistribution"] ?? null, targetEntities: liste(distribution["targetEntities"]), thirdPartyDistributionChannels: liste(distribution["thirdPartyDistributionChannels"]) };
  return sortie;
}

type Stat = Record<"clickCount" | "commentCount" | "engagement" | "impressionCount" | "likeCount" | "shareCount" | "uniqueImpressionsCount", number | null>;

/** Statistiques à la forme L7 ; `uniqueImpressionsCount` vaut null quand LinkedIn ne le fournit pas (requêtes bornées, par publication). */
function statistique(brut: unknown): Stat {
  const s = objet(brut);
  const uniques = s["uniqueImpressionsCount"] ?? s["uniqueImpressionsCounts"];
  return {
    clickCount: nombre(s["clickCount"]),
    commentCount: nombre(s["commentCount"]),
    engagement: nombre(s["engagement"]),
    impressionCount: nombre(s["impressionCount"]),
    likeCount: nombre(s["likeCount"]),
    shareCount: nombre(s["shareCount"]),
    uniqueImpressionsCount: typeof uniques === "number" ? uniques : null,
  };
}

/** Somme sur la période ; l'engagement suit la définition de LinkedIn (clics + J'aime + commentaires + partages) / impressions. */
function cumuler(lignes: Stat[]): Stat {
  const somme = (c: keyof Stat): number => lignes.reduce((t, l) => t + (l[c] ?? 0), 0);
  const impressions = somme("impressionCount");
  const actions = somme("clickCount") + somme("likeCount") + somme("commentCount") + somme("shareCount");
  return {
    clickCount: somme("clickCount"),
    commentCount: somme("commentCount"),
    engagement: impressions === 0 ? 0 : actions / impressions,
    impressionCount: impressions,
    likeCount: somme("likeCount"),
    shareCount: somme("shareCount"),
    // Des portées journalières ne s'additionnent pas en personnes distinctes : aucune valeur inventée.
    uniqueImpressionsCount: null,
  };
}

export function fournisseurLinkedinReel(dep: DependancesOutils): FournisseurService {
  const demo = fournisseurLinkedin();

  async function publicationsPeriode(acces: AccesPlateforme, debut: string, fin: string): Promise<Record<string, unknown>[]> {
    const auteur = encodeURIComponent(acces.compte.id);
    const debutMs = msDate(debut);
    const finMs = msDate(lendemain(fin));
    const retenues: Record<string, unknown>[] = [];
    for (let page = 0; page < MAX_PAGES_PARCOURUES; page++) {
      const r = await appelLinkedin(dep, acces, "GET", `/rest/posts?author=${auteur}&q=author&count=100&start=${page * 100}&sortBy=CREATED`, `les publications de ${acces.compte.id}`, undefined, "FINDER");
      const elements = liste(objet(r.json)["elements"]).map(objet);
      for (const e of elements) {
        const cree = nombre(e["createdAt"], NaN);
        if (cree >= debutMs && cree < finMs) retenues.push(e);
      }
      const plusAncienne = Math.min(...elements.map((e) => nombre(e["createdAt"], Infinity)));
      // LinkedIn peut renvoyer moins que `count` alors qu'il reste des pages : on s'arrête sur le lien « next ».
      const suivant = liste(objet(objet(r.json)["paging"])["links"]).some((l) => objet(l)["rel"] === "next");
      if (elements.length === 0 || plusAncienne < debutMs || !suivant) return retenues;
    }
    throw tropDeResultats("LinkedIn");
  }

  const g1 = gabarit(demo, "linkedin_publications", "Publications de la page (organisation) sur une période (GET /rest/posts?q=author) : elements[] (id, author, commentary, createdAt, publishedAt, lastModifiedAt, lifecycleState, visibility, distribution...) et paging (start, count, links). Les plus récentes d'abord.");
  const publications: OutilPasserelle = {
    ...g1,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; start: number; count: number; sortBy: "LAST_MODIFIED" | "CREATED" };
        verifierPeriode(a.debut, a.fin);
        const cle = a.sortBy === "CREATED" ? "createdAt" : "lastModifiedAt";
        const toutes = (await publicationsPeriode(acces, a.debut, a.fin)).sort((x, y) => nombre(y[cle]) - nombre(x[cle]));
        const page = toutes.slice(a.start, a.start + a.count);
        const links: unknown[] = [];
        if (a.start + a.count < toutes.length) {
          links.push({ type: "application/json", rel: "next", href: `/rest/posts?author=${encodeURIComponent(acces.compte.id)}&q=author&count=${a.count}&start=${a.start + a.count}&sortBy=${a.sortBy}` });
        }
        return { paging: { start: a.start, count: a.count, links }, elements: page.map(publication) };
      }),
  };

  const g2 = gabarit(demo, "linkedin_statistiques", "Statistiques de partage organiques (GET /rest/organizationalEntityShareStatistics, 12 derniers mois) : sans `granularite` ni `partages`, un total sur la période ; avec `granularite`, une ligne par jour ou par mois (timeRange) ; avec `partages`, les statistiques totales de chaque publication (sans période, comme l'API).");
  const statistiques: OutilPasserelle = {
    ...g2,
    executer: (brut, contexte) =>
      lire(dep, contexte, async (acces) => {
        const a = brut as { debut: string; fin: string; granularite?: "DAY" | "MONTH"; partages?: string[] };
        verifierPeriode(a.debut, a.fin);
        if (a.granularite && a.partages) throw new Error("Les statistiques par publication ne sont pas disponibles par période (granularite et partages sont incompatibles).");
        const entite = acces.compte.id;
        const base = `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(entite)}`;
        if (a.partages) {
          const listeUrn = a.partages.map((u) => encodeURIComponent(u)).join(",");
          const r = await appelLinkedin(dep, acces, "GET", `${base}&shares=List(${listeUrn})`, `les statistiques de ${entite}`);
          const elements = liste(objet(r.json)["elements"]).map(objet).map((e) => ({ organizationalEntity: texte(e["organizationalEntity"]) || entite, share: texte(e["share"]), totalShareStatistics: statistique(e["totalShareStatistics"]) }));
          return { paging: { count: 10, start: 0, links: [] }, elements };
        }
        const granularite = a.granularite ?? "DAY";
        const intervalle = `(timeRange:(start:${msDate(a.debut)},end:${msDate(lendemain(a.fin))}),timeGranularityType:${granularite})`;
        const r = await appelLinkedin(dep, acces, "GET", `${base}&timeIntervals=${intervalle}`, `les statistiques de ${entite}`);
        const lignes = liste(objet(r.json)["elements"]).map(objet).map((e) => ({
          timeRange: { start: nombre(objet(e["timeRange"])["start"]), end: nombre(objet(e["timeRange"])["end"]) },
          totalShareStatistics: statistique(e["totalShareStatistics"]),
          organizationalEntity: texte(e["organizationalEntity"]) || entite,
        }));
        if (!a.granularite) return { paging: { count: 10, start: 0 }, elements: [{ totalShareStatistics: cumuler(lignes.map((l) => l.totalShareStatistics)), organizationalEntity: entite }] };
        return { paging: { count: Math.max(10, lignes.length), start: 0 }, elements: lignes };
      }),
  };

  type ArgsPublier = { commentary: string };
  const publier = mutationReelle<ArgsPublier>(dep, {
    outil: { ...gabarit(demo, "linkedin_publier", "Publie un texte au nom de la page LinkedIn (POST /rest/posts, auteur = l'organisation connectée)."), executer: () => undefined },
    requeteReelle: "POST /rest/posts (author = urn:li:organization:..., lifecycleState PUBLISHED)",
    resume: (a) => `publication LinkedIn de ${a.commentary.length} caractères.`,
    executer: async (acces, a) => {
      const r = await appelLinkedin(dep, acces, "POST", "/rest/posts", `la page ${acces.compte.id}`, {
        author: acces.compte.id,
        commentary: a.commentary,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      });
      return { id: r.entetes.get("x-restli-id") ?? "" };
    },
    reconcilier: async (acces, a, debutMs): Promise<Reconciliation> => {
      const r = await appelLinkedin(dep, acces, "GET", `/rest/posts?author=${encodeURIComponent(acces.compte.id)}&q=author&count=50&sortBy=CREATED&viewContext=AUTHOR`, `les publications de ${acces.compte.id}`, undefined, "FINDER");
      const trouve = liste(objet(r.json)["elements"]).map(objet).find((e) => e["commentary"] === a.commentary && nombre(e["createdAt"]) >= debutMs - 120_000);
      return trouve ? { etat: "trouve", resultat: { id: texte(trouve["id"]) } } : { etat: "absent" };
    },
  });

  return { service: "linkedin", mode: "reel", outils: [publications, statistiques, publier] };
}
