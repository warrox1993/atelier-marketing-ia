// Service réel « captation » : pages de destination avec formulaire « On vous rappelle » (contact DIRECT donné par la personne,
// avec son consentement). Trois outils :
//
//   creer_page_destination   écriture : crée une page à partir de champs TEXTE (aucun HTML libre n'existe) ;
//   lister_pages, statistiques_page   lecture (statistiques : API Umami locale + nombre d'envois du magasin).
//
// Les pages sont servies par le serveur de pages (src/pages, 127.0.0.1:3195). Aucune mise en ligne publique n'est faite par
// un outil : l'adresse rendue est locale, la publication est une décision humaine (docs/captation.md). Les envois des
// visiteurs ne passent JAMAIS par la passerelle : le serveur de pages les dépose directement dans l'atelier.

import { homedir } from "node:os";
import { join } from "node:path";
import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { FICHE_CAPTATION } from "../../services.js";
import { baseParDefaut, URL_PAGES_PAR_DEFAUT } from "../../pages/config.js";
import { schemaContenuPage, SchemaContenuPage } from "../../pages/contenu.js";
import { MagasinPages, estSlugValide } from "../../pages/magasin.js";
import { ClientUmami, lireReglagesUmami } from "../../pages/umami.js";
export { FICHE_CAPTATION };

export const PERIODE_MAX_JOURS = 365;
export const PERIODE_PAR_DEFAUT_JOURS = 30;

export interface OptionsCaptation {
  magasin: MagasinPages;
  umami: ClientUmami | null;
  /** Adresse de base des pages (locale tant que rien n'est publié). */
  urlPages: string;
  maintenant?: () => Date;
  journal?: (message: string) => void;
}

/**
 * Variables : PASSERELLE_PAGES_BASE (base SQLite partagée avec le serveur de pages), PASSERELLE_PAGES_URL (adresse publique
 * ou locale des pages), PASSERELLE_PAGES_UMAMI_FICHIER (fichier 0600 : UMAMI_URL, UMAMI_UTILISATEUR, UMAMI_MOT_DE_PASSE).
 */
export function optionsCaptationDepuisEnv(env: NodeJS.ProcessEnv): OptionsCaptation {
  const base = env["PASSERELLE_PAGES_BASE"]?.trim() || baseParDefaut();
  const urlPages = (env["PASSERELLE_PAGES_URL"]?.trim() || URL_PAGES_PAR_DEFAUT).replace(/\/+$/u, "");
  new URL(urlPages);
  const fichierUmami = env["PASSERELLE_PAGES_UMAMI_FICHIER"]?.trim() || join(homedir(), ".config", "atelier", "umami-admin.env");
  let umami: ClientUmami | null = null;
  try {
    umami = new ClientUmami(lireReglagesUmami(fichierUmami));
  } catch {
    umami = null; // statistiques_page le dit clairement
  }
  return { magasin: new MagasinPages(base), umami, urlPages };
}

export const schemaCreerPage = schemaContenuPage;
export const schemaListerPages = {
  entreprise_id: z.string().uuid().optional().describe("Limiter aux pages d'une entreprise de l'atelier."),
};
export const schemaStatistiquesPage = {
  slug: z.string().min(3).max(64).describe("Identifiant de la page (rendu par creer_page_destination ou lister_pages)."),
  jours: z.number().int().min(1).max(PERIODE_MAX_JOURS).default(PERIODE_PAR_DEFAUT_JOURS).describe(`Période en jours (${PERIODE_MAX_JOURS} au plus).`),
};

export function outilsCaptation(o: OptionsCaptation): OutilPasserelle[] {
  const maintenant = o.maintenant ?? ((): Date => new Date());
  const journal = o.journal ?? ((): void => undefined);
  const adresse = (slug: string): string => `${o.urlPages}/p/${slug}`;
  const consigne =
    "La page est servie en LOCAL seulement : rien n'est publié sur Internet. La mise en ligne est une décision humaine (docs/captation.md). " +
    "Chaque envoi crée un prospect dans l'atelier avec la preuve du consentement et une tâche « rappeler sous 24 h » pour la Prospection.";

  return [
    {
      nom: "creer_page_destination",
      description:
        "ÉCRITURE. Crée une page de destination avec formulaire « On vous rappelle » (nom, téléphone, e-mail facultatif, créneau préféré). " +
        "Tu fournis uniquement des TEXTES simples (titre, accroche, offre, responsable du traitement, contact pour les droits) : aucun HTML, aucun script, aucune image, aucun lien. " +
        "Le texte de la case de consentement est construit par le serveur à partir de ces champs (jamais pré-cochée) et conservé comme preuve. " +
        consigne,
      schemaEntree: schemaCreerPage,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      executer: (args) => {
        const contenu = SchemaContenuPage.parse(args);
        const page = o.magasin.creerPage(contenu, maintenant());
        journal(`creer_page_destination ok (${page.slug})`);
        return {
          page: { slug: page.slug, titre: page.titre, entreprise_id: page.entrepriseId, adresse_locale: adresse(page.slug), cree_le: page.creeLe },
          texte_consentement: page.texteConsentement,
          publiee: false,
          note: consigne,
        };
      },
    },
    {
      nom: "lister_pages",
      description: "LECTURE. Liste les pages de destination (identifiant, titre, offre, adresse locale, nombre d'envois enregistrés). Aucune coordonnée de visiteur n'y figure.",
      schemaEntree: schemaListerPages,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      executer: (args) => {
        const a = args as { entreprise_id?: string };
        const pages = o.magasin.listerPages(a.entreprise_id, 100);
        return {
          pages: pages.map((p) => ({ slug: p.slug, titre: p.titre, entreprise_id: p.entrepriseId, offre: p.offreIntitule, adresse_locale: adresse(p.slug), envois: p.envois, cree_le: p.creeLe })),
          total: pages.length,
        };
      },
    },
    {
      nom: "statistiques_page",
      description:
        "LECTURE. Statistiques d'une page sur une période : vues, visiteurs et visites de la page, vues de la page de remerciement (envois du formulaire) selon Umami, et nombre d'envois enregistrés. " +
        "Si Umami est indisponible, seul le nombre d'envois est donné et la réponse le dit : n'invente aucun chiffre de visite.",
      schemaEntree: schemaStatistiquesPage,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      executer: async (args) => {
        const a = args as { slug: string; jours?: number };
        if (!estSlugValide(a.slug)) throw new Error("Identifiant de page invalide.");
        const page = o.magasin.lirePage(a.slug);
        if (!page) throw new Error(`Page « ${a.slug} » introuvable (lister_pages).`);
        const jours = a.jours ?? PERIODE_PAR_DEFAUT_JOURS;
        const fin = maintenant().getTime();
        const debut = fin - jours * 24 * 3600 * 1000;
        const envois = o.magasin.compterEnvois(a.slug, new Date(debut).toISOString());
        const periode = { debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString(), jours };
        if (!o.umami) {
          return { page: { slug: a.slug, titre: page.titre }, periode, envois, visites: null, avertissement: "Umami n'est pas branché : les visites ne sont pas mesurables, seuls les envois sont comptés." };
        }
        try {
          const [vues, merci] = await Promise.all([o.umami.statistiques(`/p/${a.slug}`, debut, fin), o.umami.statistiques(`/p/${a.slug}/merci`, debut, fin)]);
          const taux = vues.visiteurs > 0 ? Math.round((envois / vues.visiteurs) * 1000) / 10 : null;
          return {
            page: { slug: a.slug, titre: page.titre }, periode, envois,
            visites: { vues: vues.vues, visiteurs: vues.visiteurs, visites: vues.visites, vues_page_merci: merci.vues },
            taux_envoi_pour_cent: taux,
            source: "Umami local (visiteurs sans cookie) et magasin des pages",
          };
        } catch (e) {
          journal(`statistiques_page : Umami indisponible (${e instanceof Error ? e.message : String(e)})`);
          return { page: { slug: a.slug, titre: page.titre }, periode, envois, visites: null, avertissement: "Umami n'a pas répondu : les visites ne sont pas mesurables pour l'instant, seuls les envois sont comptés." };
        }
      },
    },
  ];
}

export function fournisseurCaptationReel(options: OptionsCaptation): FournisseurService {
  return { service: "captation", mode: "reel", fiche: FICHE_CAPTATION, outils: outilsCaptation(options), autorisationLocale: true, verifierJeton: () => null };
}
