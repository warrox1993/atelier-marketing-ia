// Définitions neutres (nom, schéma d'entrée, annotations) des outils pages LinkedIn, partagées par le simulateur
// (src/demo/social-crm/linkedin.ts) et le fournisseur réel (src/reel/social-crm/linkedin.ts). `date` est le schéma de date du mode.

import * as z from "zod";
import { defLecture, defMutation, formePeriodeAvec } from "./outils.js";



export function definitionsLinkedin(date: z.ZodString) {
  const formePeriode = formePeriodeAvec(date);
  return {
    linkedin_publications: defLecture("linkedin_publications", {
        ...formePeriode,
        start: z.number().int().min(0).max(1_000_000).default(0).describe("Index du premier élément (0 par défaut)."),
        count: z.number().int().min(1).max(100).default(10).describe("Éléments par page (10 par défaut, 100 au plus)."),
        sortBy: z.enum(["LAST_MODIFIED", "CREATED"]).default("LAST_MODIFIED").describe("Tri décroissant (identique ici : une publication n'est jamais modifiée)."),
      }),
    linkedin_statistiques: defLecture("linkedin_statistiques", {
        ...formePeriode,
        granularite: z.enum(["DAY", "MONTH"]).optional().describe("timeIntervals.timeGranularityType : DAY ou MONTH."),
        partages: z.array(z.string().regex(/^urn:li:share:\d{1,30}$/, "URN de partage attendu (urn:li:share:...)")).min(1).max(20).optional()
          .describe("Publications visées (champ `id` de linkedin_publications) ; incompatible avec `granularite`."),
      }),
    linkedin_publier: defMutation("linkedin_publier", { commentary: z.string().min(1).max(3000).describe("Texte de la publication (champ `commentary` de l'API Posts).") }, true),
  };
}

/**
 * Outil du profil personnel (service linkedinprofil, seconde application LinkedIn « Share on LinkedIn ») : publication
 * seulement, aucune lecture (la lecture des publications d'un membre exige r_member_social, portée réservée). Le titre
 * d'un article est obligatoire chez LinkedIn et doit faire moins de 400 caractères (Article Post API) ; 3000 caractères
 * de texte au plus, même borne que linkedin_publier.
 */
export function definitionsLinkedinProfil() {
  return {
    linkedin_profil_publier: defMutation("linkedin_profil_publier", {
      commentary: z.string().min(1).max(3000).describe("Texte de la publication (champ `commentary` de l'API Posts)."),
      lien: z.string().url().max(2048).regex(/^https:\/\//, "lien en https:// attendu").optional().describe("Adresse publiée comme article (content.article.source) ; exige `titre_lien`."),
      titre_lien: z.string().min(1).max(399).optional().describe("Titre de l'article lié (content.article.title, moins de 400 caractères) ; obligatoire avec `lien`."),
    }, true),
  };
}
