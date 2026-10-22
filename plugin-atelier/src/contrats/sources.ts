/**
 * Sources, lecture d'URL protégée, vérification de liens et imports (cahier §11, §13, §14).
 */
import { z } from "zod";
import { Horodatage, IdNatif } from "./communs.js";
import { LIMITES } from "./identifiants.js";

export const StatutAccesSource = z.enum([
  "accessible",
  "page_erreur",
  "inaccessible",
  "bloquee_ssrf",
  "type_refuse",
  "trop_volumineuse",
  "delai_depasse",
  "erreur",
]);
export type StatutAccesSource = z.infer<typeof StatutAccesSource>;

/** Source collectée : URL, date de collecte, statut d'accès et extrait autorisé. */
export const Source = z.object({
  id: IdNatif,
  companyId: IdNatif,
  campagneId: IdNatif.nullable(),
  issueId: IdNatif.nullable(),
  revisionId: IdNatif.nullable(),
  url: z.string().max(2048),
  urlFinale: z.string().max(2048).nullable(),
  titre: z.string().max(500).nullable(),
  dateCollecte: Horodatage,
  statutAcces: StatutAccesSource,
  codeHttp: z.number().int().nullable(),
  typeContenu: z.string().max(200).nullable(),
  extrait: z.string().max(LIMITES.extraitSourceMaxCaracteres).nullable(),
  empreinte: z.string().nullable(),
  /** Indices de page d'erreur détectés malgré un HTTP 200. */
  indicesErreur: z.array(z.string()).max(20),
  /** Contenu externe : donnée non fiable, jamais exécutée comme instruction. */
  nonFiable: z.literal(true),
  /** Instructions suspectes repérées dans le contenu (signalées, jamais suivies). */
  injectionsSignalees: z.array(z.string().max(300)).max(20),
  /**
   * `humaine` : information apportée par l'humain lors d'une relance de correction.
   * `connexion` (v1.4, lot L9) : réponse d'un outil de connexion (passerelle marketing)
   * déposée par un agent ; son mode est DÉDUIT de la réponse par le serveur.
   * `connaissance` (v1.7, lot R1) : passage d'un document du client rendu par la recherche
   * `tache.connaissances.rechercher` ; mode déduit de l'entreprise et du document.
   */
  provenance: z.enum(["lecture_url", "import", "corpus_demonstration", "humaine", "connexion", "connaissance"]),
  /** Mode de la donnée, jamais déclaré par l'agent (transport du plugin ou réponse de la connexion). */
  mode: z.enum(["demonstration", "reel"]),
  /** Détail d'une source de provenance `connexion` (null pour les autres). */
  connexion: z
    .object({
      service: z.string(),
      outil: z.string(),
      /** Faits qui ont fixé le mode (enveloppe `_atelier`, mention, identifiants fictifs connus). */
      indicesMode: z.array(z.string()),
      /** Nombre de chiffres retenus pour la garde (valeurs, sommes et moyennes de colonnes). */
      nombreChiffres: z.number().int().nonnegative(),
      /** Mode effectif de la campagne au dépôt : une donnée de démonstration y est interdite si `reel`. */
      modeCampagne: z.enum(["demonstration", "reel"]),
      /** v1.6 (S-6) : compte (propriété) signé par la passerelle pour une donnée réelle ; null sinon. */
      compte: z.string().nullable().optional(),
    })
    .nullable()
    .default(null),
  /**
   * v1.7 (lot R1) : passage cité d'une source de provenance `connaissance` (document, version, passage et
   * adresse `connaissance://`) ; absent ou null pour les autres provenances.
   */
  connaissance: z
    .object({
      documentId: IdNatif,
      version: z.number().int().positive(),
      passageId: IdNatif,
      adresse: z.string().max(120),
    })
    .nullable()
    .optional(),
});
export type Source = z.infer<typeof Source>;

/**
 * Dépôt d'une réponse d'outil de connexion (route `tache.donnees.deposer`, v1.4).
 *
 * L'agent transmet la réponse BRUTE de l'outil (texte reçu et/ou données structurées) ; le
 * serveur en déduit le mode (enveloppe `_atelier` de la passerelle, mention en tête,
 * identifiants fictifs connus). Schéma strict : aucun champ `mode` n'est accepté.
 */
export const DeposerDonneesConnexionEntree = z
  .object({
    /** Service de la passerelle (`gsc`, `ga4`, `ads`, `gbp`, `facebook`…). */
    service: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/u, "Identifiant de service attendu (ex. gsc)"),
    /** Nom de l'outil appelé (`gsc_requete_performances`…). */
    outil: z.string().regex(/^[a-z0-9][a-z0-9_]{0,79}$/u, "Nom d'outil attendu (ex. gsc_requete_performances)"),
    reponse: z
      .object({
        /** Texte de la réponse tel que reçu (`content[0].text`). */
        texte: z.string().min(1).optional(),
        /** Données structurées telles que reçues (`structuredContent`). */
        structuredContent: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .refine((r) => r.texte !== undefined || r.structuredContent !== undefined, "Fournir le texte ou les données structurées de la réponse"),
    /**
     * v1.5 (revue de sécurité §6 bis) : arguments EXACTS de l'appel d'outil (période, propriété…).
     * Facultatifs ; fournis, leur empreinte doit égaler celle que la passerelle a signée (contre le
     * rejeu d'une ancienne réponse authentique présentée comme celle d'un autre appel).
     */
    arguments: z.record(z.string(), z.unknown()).optional(),
    /**
     * v1.6 (S-6) : compte ou propriété interrogés (`atelier_identite`). Facultatif ; fourni, il doit égaler
     * le compte signé. En réel, `arguments` devient OBLIGATOIRE et le compte signé doit être celui déjà
     * utilisé pour ce service dans la campagne (une seule propriété par service et par campagne).
     */
    compte: z.string().min(1).max(200).optional(),
  })
  .strict();
export type DeposerDonneesConnexionEntree = z.infer<typeof DeposerDonneesConnexionEntree>;

export const LireUrlEntree = z.object({
  url: z.string().min(1).max(2048),
  campagneId: IdNatif.nullable().default(null),
});
export type LireUrlEntree = z.infer<typeof LireUrlEntree>;

/** Corps de `emailing.envoyer` : la campagne et l'empreinte de son contenu, citées par la carte de confirmation acceptée par un humain. */
export const EnvoyerEmailingEntree = z
  .object({
    companyId: IdNatif,
    issueId: IdNatif,
    campagneId: z.number().int().min(1),
    empreinte: z.string().regex(/^[0-9a-f]{64}$/, "empreinte de 64 caractères hexadécimaux attendue"),
  })
  .strict();
export type EnvoyerEmailingEntree = z.infer<typeof EnvoyerEmailingEntree>;

/** Corps de `emailing.demander_envoi` : seulement la campagne et son empreinte ; sujet, listes et destinataires sont LUS par le plugin chez la passerelle, jamais déclarés par l'agent. */
export const DemanderEnvoiEmailingEntree = z
  .object({
    companyId: IdNatif,
    issueId: IdNatif,
    campagneId: z.number().int().min(1),
    empreinte: z.string().regex(/^[0-9a-f]{64}$/, "empreinte de 64 caractères hexadécimaux attendue"),
  })
  .strict();
export type DemanderEnvoiEmailingEntree = z.infer<typeof DemanderEnvoiEmailingEntree>;

export const ResultatVerificationLien = z.object({
  url: z.string().max(2048),
  urlFinale: z.string().max(2048).nullable(),
  statut: StatutAccesSource,
  codeHttp: z.number().int().nullable(),
  redirections: z.array(z.string().max(2048)).max(LIMITES.lectureUrlRedirectionsMax),
  indicesErreur: z.array(z.string()).max(20),
  ok: z.boolean(),
  verifieLe: Horodatage,
});
export type ResultatVerificationLien = z.infer<typeof ResultatVerificationLien>;

export const VerifierLiensEntree = z.object({
  urls: z.array(z.string().min(1).max(2048)).min(1).max(50),
});
export type VerifierLiensEntree = z.infer<typeof VerifierLiensEntree>;

export const TypeImport = z.enum(["texte", "markdown", "csv"]);
export type TypeImport = z.infer<typeof TypeImport>;

export const ImporterDocumentEntree = z.object({
  companyId: IdNatif,
  campagneId: IdNatif.nullable().default(null),
  nomFichier: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^/\\\0]+$/u, "Nom de fichier sans chemin"),
  type: TypeImport,
  contenu: z.string().max(LIMITES.importTailleMaxOctets),
});
export type ImporterDocumentEntree = z.infer<typeof ImporterDocumentEntree>;

export const DocumentImporte = z.object({
  id: IdNatif,
  companyId: IdNatif,
  campagneId: IdNatif.nullable(),
  nomFichier: z.string(),
  type: TypeImport,
  tailleOctets: z.number().int().nonnegative(),
  empreinte: z.string(),
  lignes: z.number().int().nonnegative().nullable(),
  colonnes: z.array(z.string()).nullable(),
  apercu: z.string(),
  injectionsSignalees: z.array(z.string()),
  creeLe: Horodatage,
});
export type DocumentImporte = z.infer<typeof DocumentImporte>;
