// Simulateur des pages LinkedIn : publications d'organisation (Posts API) et statistiques
// de partage (organizationalEntityShareStatistics). Documentation consultée le 15/10/2026
// (URL dans docs/passerelle.md, section L7). Chiffres : `modeleDemo.publications` uniquement.

import * as z from "zod";
import { modeleDemo, type Publication } from "../modele/index.js";
import type { FournisseurService } from "../../fournisseurs.js";
import { definitionsLinkedin } from "../../commun/social-crm/linkedin.js";
import { SchemaDate } from "../modele/index.js";
import { ajouterJours, dateDepuisMs, formePeriode, msDepuisDate, outilLecture, outilMutation, verifierPeriode } from "./utilitaires.js";

const ORGANISATION_PAR_DEFAUT = "urn:li:organization:900000001";
const MS_PUBLICATION = 8 * 3_600_000; // 08:00 UTC : le modèle fournit des jours, pas des heures
const MS_PAR_JOUR = 86_400_000;

const ms = (date: string): number => msDepuisDate(date) + MS_PUBLICATION;

function organisation(propriete: { id: string } | null | undefined): string {
  return propriete?.id.startsWith("urn:li:organization:") ? propriete.id : ORGANISATION_PAR_DEFAUT;
}

interface Cumul {
  clickCount: number;
  commentCount: number;
  engagement: number;
  impressionCount: number;
  likeCount: number;
  shareCount: number;
  uniqueImpressionsCount: number;
}

/** `engagement` suit la définition de la documentation : (clics + J'aime + commentaires + partages) / impressions. */
function cumuler(publications: readonly Publication[]): Cumul {
  const somme = (cle: (p: Publication) => number): number => publications.reduce((s, p) => s + cle(p), 0);
  const clickCount = somme((p) => p.clics);
  const likeCount = somme((p) => p.reactions);
  const commentCount = somme((p) => p.commentaires);
  const shareCount = somme((p) => p.partages);
  const impressionCount = somme((p) => p.impressions);
  return {
    clickCount, commentCount, engagement: impressionCount === 0 ? 0 : (clickCount + likeCount + commentCount + shareCount) / impressionCount,
    impressionCount, likeCount, shareCount, uniqueImpressionsCount: somme((p) => p.portee),
  };
}

const DEFS = definitionsLinkedin(SchemaDate);

export function fournisseurLinkedin(): FournisseurService {
  const publications = outilLecture(
    {
      nom: "linkedin_publications",
      description:
        "Publications de la page (organisation) sur une période, forme de GET /rest/posts?q=author : elements[] (id, author, " +
        "commentary, createdAt, publishedAt, lastModifiedAt, lifecycleState, visibility, distribution...) et paging (start, count, links). " +
        "Les plus récentes d'abord.",
      schemaEntree: DEFS.linkedin_publications.schemaEntree,
    },
    ({ debut, fin, start, count, sortBy }, contexte) => {
      verifierPeriode(debut, fin);
      const auteur = organisation(contexte.identite.propriete);
      const liste = modeleDemo.publications({ debut, fin, reseau: "linkedin" }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      const page = liste.slice(start, start + count);
      const links: unknown[] = [];
      if (start + count < liste.length) {
        links.push({
          type: "application/json",
          rel: "next",
          href: `/rest/posts?author=${encodeURIComponent(auteur)}&q=author&count=${count}&start=${start + count}&sortBy=${sortBy}`,
        });
      }
      return {
        paging: { start, count, links },
        elements: page.map((p) => ({
          lifecycleState: "PUBLISHED",
          lastModifiedAt: ms(p.date),
          visibility: "PUBLIC",
          publishedAt: ms(p.date),
          author: auteur,
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          content: {},
          lifecycleStateInfo: { isEditedByAuthor: false },
          isReshareDisabledByAuthor: false,
          createdAt: ms(p.date),
          id: p.id,
          commentary: p.texte,
        })),
      };
    },
  );

  const statistiques = outilLecture(
    {
      nom: "linkedin_statistiques",
      description:
        "Statistiques de partage organiques, forme de GET /rest/organizationalEntityShareStatistics : elements[] avec " +
        "totalShareStatistics (clickCount, commentCount, engagement, impressionCount, likeCount, shareCount, uniqueImpressionsCount) " +
        "et organizationalEntity. Sans `granularite` ni `partages` : un seul total sur la période ; avec `granularite` : une ligne " +
        "par jour ou par mois (timeRange) ; avec `partages` : une ligne par publication (champ share).",
      schemaEntree: DEFS.linkedin_statistiques.schemaEntree,
    },
    ({ debut, fin, granularite, partages }, contexte) => {
      verifierPeriode(debut, fin);
      if (granularite && partages) throw new Error("Les statistiques par publication ne sont pas disponibles par période (granularite et partages sont incompatibles).");
      const entite = organisation(contexte.identite.propriete);
      const lignes = modeleDemo.publications({ debut, fin, reseau: "linkedin" });
      const paging = { count: 10, start: 0 };

      if (partages) {
        const voulues = new Set(partages);
        // Comme l'API : une publication sans impression ni action est absente de la liste.
        const elements = lignes
          .filter((p) => voulues.has(p.id))
          .map((p) => ({ organizationalEntity: entite, share: p.id, totalShareStatistics: cumuler([p]) }))
          .filter((e) => e.totalShareStatistics.impressionCount > 0 || e.totalShareStatistics.likeCount > 0);
        return { paging: { ...paging, links: [] }, elements };
      }
      if (!granularite) return { paging, elements: [{ totalShareStatistics: cumuler(lignes), organizationalEntity: entite }] };

      const finExclue = msDepuisDate(ajouterJours(fin, 1));
      const debutMs = msDepuisDate(debut);
      const elements: unknown[] = [];
      if (granularite === "DAY") {
        for (let t = debutMs; t < finExclue; t += MS_PAR_JOUR) {
          const jour = dateDepuisMs(t);
          elements.push({ timeRange: { start: t, end: t + MS_PAR_JOUR }, totalShareStatistics: cumuler(lignes.filter((p) => p.date === jour)), organizationalEntity: entite });
        }
      } else {
        let courant = debutMs;
        while (courant < finExclue) {
          const mois = dateDepuisMs(courant).slice(0, 7);
          const [annee, numero] = mois.split("-").map(Number) as [number, number];
          const suivant = Math.min(Date.UTC(annee, numero, 1), finExclue); // numero est 1..12 : Date.UTC attend 0..11, donc « mois suivant »
          elements.push({ timeRange: { start: courant, end: suivant }, totalShareStatistics: cumuler(lignes.filter((p) => p.date.startsWith(mois))), organizationalEntity: entite });
          courant = suivant;
        }
      }
      return { paging: { ...paging, count: Math.max(10, elements.length) }, elements };
    },
  );

  const publier = outilMutation({
    nom: "linkedin_publier",
    description: "Prépare la publication d'un texte au nom de la page LinkedIn (organisation).",
    schemaEntree: DEFS.linkedin_publier.schemaEntree,
    destructif: DEFS.linkedin_publier.destructif,
    requeteReelle: "POST /rest/posts (author = urn:li:organization:..., lifecycleState PUBLISHED)",
    resume: (a) => `publication LinkedIn de ${a.commentary.length} caractères.`,
  });

  return { service: "linkedin", mode: "demonstration", outils: [publications, statistiques, publier] };
}
