/**
 * « Passage au réel » : ce qui manque pour brancher l'entreprise sur la réalité.
 *
 * Route `realite.etat` (humain seulement) : l'état de chaque branchement connu du serveur, lu dans ce qui existe
 * (diagnostic des sources réelles, état de l'import de la base clients, fiche du client, configuration), jamais
 * codé en dur à « réel », plus la synthèse par critère de qualification (combien de leads l'ont « non vérifié »
 * et quel branchement le débloquerait).
 *
 * Les connecteurs Google et de diffusion vivent dans les connexions natives de Paperclip, que seule l'interface
 * peut lire : le serveur ne les renvoie pas, l'interface ajoute ces deux lignes (`BRANCHEMENTS_INTERFACE`)
 * à partir du tableau des connecteurs existant.
 */
import { z } from "zod";
import { Horodatage } from "./communs.js";

/**
 * État d'un branchement, du plus faible au plus fort. `configure_non_verifie` : configuré (clé ou connexion présente)
 * mais jamais prouvé par un appel réel ; il n'est PAS « reel » et reste à faire.
 */
export const EtatBranchement = z.enum(["non_branche", "a_fournir_client", "en_attente_acces", "demonstration", "configure_non_verifie", "reel"]);
export type EtatBranchement = z.infer<typeof EtatBranchement>;

/** Qui doit agir : le client, un accès officiel à obtenir (registre, banque nationale, liste d'opposition) ou nous. */
export const ActeurBranchement = z.enum(["client", "acces_officiel", "nous"]);
export type ActeurBranchement = z.infer<typeof ActeurBranchement>;

/** `mesure` : lu sur la passerelle ou en base ; `declare` : présent dans la configuration mais non vérifié ; `aucune` : rien à lire. */
export const PreuveBranchement = z.enum(["mesure", "declare", "aucune"]);
export type PreuveBranchement = z.infer<typeof PreuveBranchement>;

export const CleBranchement = z.enum(["bce", "bnb", "osm", "base_clients", "consentement", "bureaux_segments", "google", "diffusion", "voix", "moniteur_belge", "ne_m_appelez_plus"]);
export type CleBranchement = z.infer<typeof CleBranchement>;

export const Branchement = z.object({
  cle: CleBranchement,
  nom: z.string(),
  etat: EtatBranchement,
  preuve: PreuveBranchement,
  detail: z.string(),
  acteur: ActeurBranchement,
  /** Ce que ce branchement débloque : critères de qualification des leads (code et libellé) et fonctions. */
  debloque: z.object({ criteres: z.array(z.object({ code: z.string(), libelle: z.string() })), fonctions: z.array(z.string()) }),
  /** Leads de l'entreprise qui ont au moins un critère « non vérifié » que ce branchement établirait ; `null` : non calculable. */
  leadsConcernes: z.number().int().min(0).nullable(),
  verifieLe: Horodatage,
});
export type Branchement = z.infer<typeof Branchement>;

export const SyntheseCritere = z.object({
  code: z.string(),
  libelle: z.string(),
  leadsNonVerifies: z.number().int().min(0),
  /** Branchement qui débloquerait ce critère ; `null` : rien à brancher (fiche du client, agent Prospection). */
  branchement: CleBranchement.nullable(),
  etatBranchement: EtatBranchement.nullable(),
  phrase: z.string(),
});
export type SyntheseCritere = z.infer<typeof SyntheseCritere>;

export const RealiteEtat = z.object({
  companyId: z.string(),
  branchements: z.array(Branchement),
  synthese: z.array(SyntheseCritere),
  leads: z.object({
    /** Leads comptés (hors exclus et refusés). */
    analyses: z.number().int().min(0),
    /** Vrai si le parcours s'est arrêté au plafond : les nombres sont alors des minimums. */
    tronque: z.boolean(),
    /** Leads de la base que le contrat n'a pas pu relire (ignorés). */
    illisibles: z.number().int().min(0),
  }),
  verifieLe: Horodatage,
});
export type RealiteEtat = z.infer<typeof RealiteEtat>;

/**
 * Lignes ajoutées par l'interface (états lus dans les connexions natives, `src/ui/connecteurs.tsx`).
 * `services` : clés de `SERVICES_PASSERELLE` (`src/ui/connexions-natives.ts`) que la ligne regroupe.
 */
export const BRANCHEMENTS_INTERFACE: ReadonlyArray<{
  cle: "google" | "diffusion";
  nom: string;
  acteur: ActeurBranchement;
  services: readonly string[];
  fonctions: readonly string[];
}> = [
  {
    cle: "google",
    nom: "Comptes Google (Ads, Search Console, GA4, fiche d'établissement)",
    acteur: "client",
    services: ["gsc", "ga4", "ads", "gbp"],
    fonctions: ["Rapports de résultats réels : clics et positions, visites, campagnes et coûts, appels et avis", "Mesure de l'effet réel des campagnes"],
  },
  {
    cle: "diffusion",
    nom: "Diffusion réelle (réseaux, e-mail, CRM)",
    acteur: "client",
    services: ["facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"],
    fonctions: ["Publication sur les réseaux, envoi d'e-mails et export vers le CRM, toujours après approbation humaine"],
  },
];
