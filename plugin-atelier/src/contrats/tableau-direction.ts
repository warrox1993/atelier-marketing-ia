/**
 * Données brutes du tableau de direction du bureau Marketing (route `tableau.direction`, humain seulement, lecture seule).
 *
 * Complète `rapport.mensuel` avec ce qu'il ne donne pas : prospects avec numéro, étapes de l'entonnoir mesurées
 * (contactés, rendez-vous, clients gagnés), missions et leurs sous-tâches, coût par mission, délai de réponse
 * humain, vues et envois (captation, e-mailing). Chaque bloc vaut `null` quand sa source est absente ou illisible :
 * l'interface écrit alors « non mesuré » (ou « connexion à faire »), jamais un 0 inventé. Les calculs (taux,
 * moyennes, comparaison) sont faits côté interface par `src/ui/tableau-direction.ts`, module pur.
 */
import { z } from "zod";
import { MoisRapport, PeriodeRapport } from "./rapport.js";

/** Somme d'une famille de mesures importées (table `mesures`) ; `null` : aucune mesure ce mois. */
const SommeMesures = z.number().nullable();

export const MissionTableau = z.object({
  id: z.string(),
  identifiant: z.string().nullable(),
  titre: z.string(),
  statut: z.string(),
  creeLe: z.string(),
  termineLe: z.string().nullable(),
});

export const TacheMissionTableau = z.object({
  missionId: z.string(),
  titre: z.string(),
  statut: z.string(),
  agentNom: z.string().nullable(),
  agentCle: z.string().nullable(),
  creeLe: z.string(),
  termineLe: z.string().nullable(),
});

export const CoutMission = z.object({
  identifiant: z.string().nullable(),
  titre: z.string(),
  coutCentimes: z.number(),
  jetons: z.number(),
});

export const DonneesDirection = z.object({
  companyId: z.string(),
  mois: MoisRapport,
  periode: PeriodeRapport,
  genereLe: z.string(),
  /** Prospects trouvés dans le mois (mode réel, hors corbeille) et, parmi eux, ceux qui ont un numéro de téléphone. */
  prospects: z.object({ trouves: z.number(), avecNumero: z.number() }).nullable(),
  /** Étapes de l'entonnoir mesurées par import (table `mesures`). */
  etapes: z.object({ contactes: SommeMesures, rendezVous: SommeMesures, clientsGagnes: SommeMesures }).nullable(),
  /** Captation (pages) et e-mailing, mesurés par import ; absents tant que ces services ne sont pas connectés. */
  captation: z.object({ vues: SommeMesures, soumissions: SommeMesures }).nullable(),
  emailing: z.object({ envois: SommeMesures }).nullable(),
  /** Missions actives dans le mois (au plus 80) et leurs sous-tâches. */
  missions: z.object({ lignes: z.array(MissionTableau), taches: z.array(TacheMissionTableau), plafond: z.number() }).nullable(),
  /** Coût IA du mois rattaché à une mission (tâche racine et sa descendance), les plus coûteuses d'abord. */
  coutParMission: z.object({ lignes: z.array(CoutMission), coutSansMissionCentimes: z.number() }).nullable(),
  /** Délai entre la mise sous porte d'un livrable et la décision humaine, en heures, pour les décisions du mois. */
  delaiDecision: z.object({ heures: z.array(z.number()) }).nullable(),
});
export type DonneesDirection = z.infer<typeof DonneesDirection>;
export type MissionTableau = z.infer<typeof MissionTableau>;
export type TacheMissionTableau = z.infer<typeof TacheMissionTableau>;
export type CoutMission = z.infer<typeof CoutMission>;
