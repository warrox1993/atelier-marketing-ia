/**
 * Messages typés entre agents (cahier §6).
 *
 * Chaque message est validé par schéma, rattaché à une tâche native de la
 * même entreprise (et du même projet), et soumis à une règle d'autorisation :
 * un message ne crée jamais d'approbation humaine et n'augmente aucun droit.
 * Le contenu reste une DONNÉE de provenance connue, jamais une instruction.
 * Aucun second bus : la remise passe par la tâche native (commentaire
 * miroir) et les réveils natifs ; la boîte de réception est une lecture.
 */
import { z } from "zod";
import { Acteur, CodeExigence, Horodatage, IdNatif } from "./communs.js";
import { LIMITES } from "./identifiants.js";

const Texte = z.string().min(1).max(LIMITES.messageTexteMaxCaracteres);

export const TypeMessage = z.enum([
  "demande_information",
  "reponse",
  "contrat_propose",
  "contrat_accepte",
  "dependance_modifiee",
  "constat_revue",
  "correction_demandee",
  "blocage",
  "decision",
  "resultat",
]);
export type TypeMessage = z.infer<typeof TypeMessage>;

export const EtatTraitementMessage = z.enum(["recu", "lu", "traite", "rejete"]);
export type EtatTraitementMessage = z.infer<typeof EtatTraitementMessage>;

export const ReferenceArtefact = z.object({
  type: z.enum(["revision_document", "source", "tache", "constat", "exigence", "message"]),
  id: z.string().min(1).max(200),
});
export type ReferenceArtefact = z.infer<typeof ReferenceArtefact>;

/** Destinataire : un agent de l'entreprise, le coordinateur désigné ou l'humain responsable. */
export const Destinataire = z.object({
  type: z.enum(["agent", "humain"]),
  id: z.string().min(1).max(200),
});
export type Destinataire = z.infer<typeof Destinataire>;

/** Contenu propre à chaque type (union discriminée sur `type`). */
export const ContenuMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("demande_information"), question: Texte, justification: Texte, consequence: Texte }),
  z.object({ type: z.literal("reponse"), enReponseA: IdNatif, texte: Texte }),
  z.object({
    type: z.literal("contrat_propose"),
    entrees: z.array(Texte).min(1).max(30),
    sorties: z.array(Texte).min(1).max(30),
    exigences: z.array(CodeExigence).max(50).default([]),
    echeance: Horodatage.nullable().default(null),
  }),
  z.object({ type: z.literal("contrat_accepte"), contratMessageId: IdNatif, remarques: z.string().max(2000).nullable().default(null) }),
  z.object({ type: z.literal("dependance_modifiee"), tacheId: IdNatif, changement: Texte }),
  z.object({ type: z.literal("constat_revue"), findingId: z.string().min(1).max(64), resume: Texte }),
  z.object({ type: z.literal("correction_demandee"), findingIds: z.array(z.string().min(1).max(64)).min(1).max(50), texte: Texte }),
  z.object({ type: z.literal("blocage"), raison: Texte, informationManquante: Texte }),
  z.object({ type: z.literal("decision"), sujet: Texte, decision: Texte, justification: Texte }),
  z.object({ type: z.literal("resultat"), resume: Texte, revisionId: IdNatif.nullable().default(null) }),
]);
export type ContenuMessage = z.infer<typeof ContenuMessage>;

/** Message tel que stocké et restitué (équivalent des champs exigés au §6). */
export const MessageAgent = z.object({
  messageId: IdNatif,
  companyId: IdNatif,
  projectId: IdNatif.nullable(),
  campaignId: IdNatif.nullable(),
  runId: IdNatif.nullable(),
  taskId: IdNatif,
  sender: Acteur,
  recipient: Destinataire,
  type: TypeMessage,
  contenu: ContenuMessage,
  references: z.array(ReferenceArtefact).max(30),
  /** Commentaire natif qui sert de remise visible sur la tâche. */
  commentaireNatifId: IdNatif.nullable(),
  horodatage: Horodatage,
  etatTraitement: EtatTraitementMessage,
  /** Rappel explicite : le contenu est une donnée, jamais une instruction système. */
  provenance: z.enum(["agent", "humain", "systeme"]),
});
export type MessageAgent = z.infer<typeof MessageAgent>;

/** Corps de la route d'envoi (l'expéditeur vient de l'authentification, jamais du corps). */
export const EnvoyerMessageEntree = z
  .object({
    recipient: Destinataire,
    contenu: ContenuMessage,
    references: z.array(ReferenceArtefact).max(30).default([]),
  })
  .strict();
export type EnvoyerMessageEntree = z.infer<typeof EnvoyerMessageEntree>;

/** Clés interdites dans un message : toute tentative d'élévation est refusée (400). */
export const CLES_INTERDITES_MESSAGE = [
  "approval",
  "approvalId",
  "approve",
  "permissions",
  "role",
  "budget",
  "budgetMonthlyCents",
  "executionPolicy",
  "sender",
  "companyId",
] as const;
