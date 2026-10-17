/**
 * Bureau de liaison entre services (lots L3 et L4).
 *
 * Chaque service de l'entreprise du client est une entreprise Paperclip distincte ; les services ne
 * s'écrivent que par une liaison portée par le plugin. Aucune entrée ne porte de `companyId` (sauf la
 * déclaration humaine des services) : l'entreprise source est celle de la tâche d'origine, résolue par
 * l'hôte, et l'entreprise cible est déduite du service visé.
 */
import { z } from "zod";
import { IdNatif } from "./communs.js";

export const LIMITES_LIAISON = {
  objetMax: 200,
  questionMax: 4000,
  extraitsMax: 10,
  titreExtraitMax: 200,
  texteExtraitMax: 4000,
  /** Réponse recopiée sur la tâche d'origine (dernier commentaire du coordinateur cible). */
  reponseMax: 8000,
  raisonMax: 1000,
  /** Liaisons ouvertes (ou en attente d'approbation) tolérées par entreprise source. */
  ouvertesParEntrepriseMax: 5,
  /**
   * Plafond propre de l'entreprise Direction, dont le seul agent autorisé à ouvrir une liaison est le coordinateur
   * général (rôle ceo) : il doit pouvoir interroger tous les coordinateurs d'un client (27 pour 28 services). Ce plafond
   * n'exempte d'aucune approbation humaine.
   */
  ouvertesCoordinateurGeneralMax: 30,
  /** Relais au plus par chaîne de liaisons (protocole inter-coordinateurs : « au plus deux relais »). */
  relaisMax: 2,
  /** Ancêtres d'une tâche d'origine parcourus au plus pour retrouver sa chaîne ; au-delà, la demande est refusée. */
  ancetresMax: 50,
  /**
   * Teinte par prudence (tâche racine) : une réponse teintée reçue par l'entreprise teinte TOUTES ses liaisons sortantes
   * tant que sa tâche d'origine est ouverte, et au moins pendant ce nombre de jours après la réponse.
   */
  teinteFenetreJours: 7,
  /** Réponses teintées examinées au plus pour la teinte par prudence ; au-delà, l'entreprise est tenue pour teintée. */
  teintesExamineesMax: 200,
} as const;

/** Identifiant stable d'un service (clé du registre des services). */
export const SlugService = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/u, "Slug de service invalide (minuscules, chiffres, tirets).");
export type SlugService = z.infer<typeof SlugService>;

/** Marqueur qui regroupe les entreprises d'un même client. */
export const MarqueurClient = z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/u, "Marqueur de client invalide (minuscules, chiffres, tirets).");

/** Extrait choisi explicitement par l'appelant (minimisation des données personnelles). */
export const ExtraitLiaison = z
  .object({
    titre: z.string().trim().min(1).max(LIMITES_LIAISON.titreExtraitMax),
    texte: z.string().trim().min(1).max(LIMITES_LIAISON.texteExtraitMax),
  })
  .strict();
export type ExtraitLiaison = z.infer<typeof ExtraitLiaison>;

/** Corps de `liaison.demander`. Jamais de `companyId` : le schéma strict le refuse. */
export const DemandeLiaisonEntree = z
  .object({
    tacheOrigineId: IdNatif,
    serviceCible: SlugService,
    objet: z.string().trim().min(1).max(LIMITES_LIAISON.objetMax),
    question: z.string().trim().min(1).max(LIMITES_LIAISON.questionMax),
    extraits: z.array(ExtraitLiaison).max(LIMITES_LIAISON.extraitsMax).default([]),
  })
  .strict();
export type DemandeLiaisonEntree = z.infer<typeof DemandeLiaisonEntree>;

export const STATUTS_LIAISON = ["en_attente_approbation", "ouverte", "repondue", "annulee", "refusee", "cible_supprimee"] as const;
export const StatutLiaison = z.enum(STATUTS_LIAISON);
export type StatutLiaison = z.infer<typeof StatutLiaison>;

/** Corps de `liaison.decider` (humain seulement) : approuver ou refuser une liaison en attente d'approbation. */
export const DeciderLiaisonEntree = z
  .object({
    companyId: IdNatif,
    liaisonId: IdNatif,
    decision: z.enum(["approuver", "refuser"]),
    raison: z.string().trim().min(1).max(LIMITES_LIAISON.raisonMax).optional(),
  })
  .strict();
export type DeciderLiaisonEntree = z.infer<typeof DeciderLiaisonEntree>;

/** Liaison telle qu'enregistrée. `tacheCible` reste nulle tant que la demande attend l'approbation humaine. */
export const LiaisonEnregistree = z
  .object({
    id: IdNatif,
    entrepriseSource: IdNatif,
    /** Nulle quand l'entreprise cible a été supprimée : la liaison de la source survit (migration 015). */
    entrepriseCible: IdNatif.nullable(),
    tacheOrigine: IdNatif,
    tacheCible: IdNatif.nullable(),
    statut: StatutLiaison,
    objet: z.string().max(LIMITES_LIAISON.objetMax),
    extraits: z.array(ExtraitLiaison).max(LIMITES_LIAISON.extraitsMax),
    creeLe: z.string(),
    reponduLe: z.string().nullable(),
    reponse: z.string().max(LIMITES_LIAISON.reponseMax).optional(),
  })
  .strict();
export type LiaisonEnregistree = z.infer<typeof LiaisonEnregistree>;

/** Entreprises (services) d'un même client dans une déclaration. */
export const MAX_ENTREPRISES_DECLAREES = 40;

/** Un flux autorisé de la matrice (registre des services : `flux`). */
export const FluxService = z
  .object({
    source: SlugService,
    cible: SlugService,
    objet: z.string().trim().min(1).max(LIMITES_LIAISON.objetMax),
    approbationHumaine: z.boolean(),
  })
  .strict();
export type FluxService = z.infer<typeof FluxService>;

/**
 * Corps de `services.declarer` (humain seulement) : quelles entreprises sont quels services d'un client,
 * et la matrice des flux autorisés. Remplace la déclaration précédente du même client.
 */
export const DeclarerServicesEntree = z
  .object({
    companyId: IdNatif,
    clientMarqueur: MarqueurClient,
    entreprises: z
      .array(z.object({ companyId: IdNatif, serviceSlug: SlugService, estDirection: z.boolean().default(false) }).strict())
      .min(1)
      .max(MAX_ENTREPRISES_DECLAREES),
    // Matrice complète : flux métier + réseau des coordinateurs généré (toute paire ordonnée de services du client,
    // scripts/atelier_services.py), soit au plus 40 x 39 paires pour 40 entreprises.
    flux: z.array(FluxService).max(MAX_ENTREPRISES_DECLAREES * (MAX_ENTREPRISES_DECLAREES - 1)).default([]),
  })
  .strict();
export type DeclarerServicesEntree = z.infer<typeof DeclarerServicesEntree>;
