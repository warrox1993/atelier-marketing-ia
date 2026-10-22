/**
 * Prospection sortante et base de clients (contrats v1.7, lot P1).
 *
 * Conception : `docs/prospection-conception.md` (§3 cadre légal, §4 base de clients, §5 score et
 * étalonnage, §6.3 contrats). Migration : `migrations/007_prospection.sql`.
 *
 * Principes portés par les schémas (les règles complètes, dont la matrice canal × cible du §3.2 et
 * le contrôle modulo 97, sont des fonctions pures du lot P5) :
 * - le `mode` (démonstration ou réel) est toujours DÉDUIT par le serveur : aucun schéma d'entrée ne
 *   l'accepte, ni `companyId` quand l'entreprise vient de la tâche ;
 * - aucun identifiant direct de personne n'est transporté en clair hors de l'import : nom, courriel,
 *   téléphone et adresse sont chiffrés (AES-256-GCM, `ValeurChiffree`), le dédoublonnage passe par
 *   des empreintes HMAC-SHA-256 (`EmpreinteHmac`) ;
 * - le score est une ESTIMATION tant qu'aucun étalonnage n'atteint les seuils ; jamais « certitude » ;
 * - aucun envoi par l'usine : l'export vers le CRM est une diffusion réelle ordinaire, sous preuve
 *   d'approbation humaine de l'appel exact (§15 des contrats).
 */
import { z } from "zod";
import { Horodatage, IdNatif, ModeExecution } from "./communs.js";
import { EtatDiffusion } from "./dossier.js";
import { CodeReferentiel, RenvoiReferentiel } from "./referentiel.js";
import type { RouteApi } from "./routes.js";
import { DeposerDonneesConnexionEntree } from "./sources.js";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Marqueurs que seuls les simulateurs `bce`, `bnb` et `fsma` de la passerelle produisent (lot P2,
 * marqueurs des jeux d'essai de prospection). Recopiés ici (le
 * plugin n'importe pas la passerelle). Le lot P9 les ajoute à
 * `EMPREINTES_DEMONSTRATION` (`src/serveur/regles-donnees.ts`, hors du périmètre des contrats).
 */
export const EMPREINTES_PROSPECTION_DEMONSTRATION = ["(démonstration)", "demo-prospection.example", "@exemple.invalid"] as const;

/**
 * Seuils d'affichage d'une probabilité mesurée (§5.3 de la conception) : choix de prudence de
 * conception, pas une norme ; valeurs proposées, à confirmer par l'opérateur (§11, point 5). En dessous, le
 * score reste une « estimation ». Isotonique seulement au-delà d'environ 1 000 exemples (scikit-learn).
 */
export const SEUILS_ETALONNAGE = {
  prospectsMin: 300,
  conversionsMin: 30,
  niveauConfiance: 0.95,
  isotoniqueEffectifMin: 1000,
  horizonJoursParDefaut: 90,
} as const;

/** Durée de validité de la vérification « Ne m'appelez plus » pour le téléphone (proposée, §6.5 ; à fixer par l'opérateur). */
export const DNCM_VALIDITE_JOURS = 30 as const;

/** Limites propres à la prospection et à la base de clients. */
export const LIMITES_PROSPECTION = {
  /** Fichier de base clients avant encodage base64 ; ≈ 8 Mo en base64, sous la limite JSON de 10 Mo de l'hôte. */
  baseClientsTailleMaxOctets: 6 * 1024 * 1024,
  baseClientsLignesMax: 50_000,
  baseClientsColonnesMax: 100,
  /** Rejets détaillés gardés par import (le compte total reste exact). */
  rejetsDetaillesMax: 200,
  /** Prospects par page de liste, et par demande d'export. */
  pageMax: 100,
  exportProspectsMax: 200,
  criteresScoreMax: 30,
  /** Durée de conservation de la base de clients (mois) : défaut proposé 12 sans nouvel import (§4.3). */
  conservationMoisDefaut: 12,
  conservationMoisMax: 120,
} as const;

/**
 * Mots qui, dans un nom de colonne, signalent une donnée exclue de la base de clients (§4.3 :
 * aucune donnée de santé, de sinistre ni bancaire). Comparaison sans accents ni casse, par le lot P7.
 */
export const MOTS_COLONNES_SENSIBLES = [
  "sante",
  "medical",
  "maladie",
  "handicap",
  "diagnostic",
  "sinistre",
  "accident",
  "iban",
  "bic",
  "compte bancaire",
  "carte bancaire",
  "registre national",
  "niss",
  "rijksregister",
  "religion",
  "syndicat",
  "orientation",
  "casier",
] as const;

/* ------------------------------------------------------------------ */
/* Briques                                                             */
/* ------------------------------------------------------------------ */

/** Date du calendrier (AAAA-MM-JJ). */
export const DateJour = z.iso.date();
export type DateJour = z.infer<typeof DateJour>;

/** Empreinte SHA-256 en hexadécimal minuscule. */
export const EmpreinteSha256 = z.string().regex(/^[0-9a-f]{64}$/u, "Empreinte SHA-256 hexadécimale attendue");
export type EmpreinteSha256 = z.infer<typeof EmpreinteSha256>;

/**
 * Empreinte HMAC-SHA-256 (hexadécimal minuscule) d'une valeur NORMALISÉE, clé propre à l'entreprise :
 * dédoublonner et vérifier une opposition sans déchiffrer ni garder la valeur.
 */
export const EmpreinteHmac = z.string().regex(/^[0-9a-f]{64}$/u, "Empreinte HMAC-SHA-256 hexadécimale attendue");
export type EmpreinteHmac = z.infer<typeof EmpreinteHmac>;

/**
 * Valeur chiffrée au niveau applicatif (AES-256-GCM) : `chv1.<clé>.<iv>.<chiffré>.<tag>`.
 * `<clé>` = 16 caractères hexadécimaux identifiant la clé (rotation) ; `iv` 12 octets, `tag` 16 octets,
 * en base64url sans remplissage. La clé vient d'un secret natif de Paperclip (comme
 * `approbationClePrivee`) ; elle n'est jamais en base.
 */
export const ValeurChiffree = z
  .string()
  .max(8192)
  .regex(/^chv1\.[0-9a-f]{16}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/u, "Valeur chiffrée chv1 attendue");
export type ValeurChiffree = z.infer<typeof ValeurChiffree>;

/** Ce que l'empreinte représente (§4.2 : courriel en minuscules, téléphone E.164, nom + code postal, numéro BCE). */
export const TypeEmpreinte = z.enum(["courriel", "telephone", "nom_code_postal", "numero_bce", "identifiant_client"]);
export type TypeEmpreinte = z.infer<typeof TypeEmpreinte>;

export const Empreinte = z.object({ type: TypeEmpreinte, valeur: EmpreinteHmac }).strict();
export type Empreinte = z.infer<typeof Empreinte>;

/**
 * Numéro d'entreprise BCE au format `0123.456.789` (ou `1xxx`). Format seulement : le contrôle
 * modulo 97 est une règle (lot P5) ; les numéros de démonstration y échouent volontairement.
 */
export const NumeroBce = z.string().regex(/^[01]\d{3}\.\d{3}\.\d{3}$/u, "Numéro BCE attendu : 0123.456.789");
export type NumeroBce = z.infer<typeof NumeroBce>;

/** Code NACE-BEL (2008 ou 2025), 2 à 5 chiffres, point facultatif après les deux premiers. */
export const CodeNace = z.string().regex(/^\d{2}(?:\.?\d{1,3})?$/u, "Code NACE attendu (ex. 43.910 ou 66220)");
export type CodeNace = z.infer<typeof CodeNace>;

/**
 * Position d'un prospect sur la carte. `exacte` : point d'un établissement connu (OpenStreetMap) ;
 * `code_postal` ou `commune` : centre de la zone, donc approximatif (la source est dans les sources du prospect).
 */
export const PositionProspect = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    precision: z.enum(["exacte", "code_postal", "commune"]),
  })
  .strict();
export type PositionProspect = z.infer<typeof PositionProspect>;

/** Zone d'un prospect ou d'un client (pas d'adresse précise : elle est chiffrée). */
export const ZoneProspect = z
  .object({
    codePostal: z.string().regex(/^\d{4}$/u, "Code postal belge à 4 chiffres").nullable(),
    commune: z.string().max(120).nullable(),
    province: z.string().max(80).nullable(),
    region: z.enum(["Wallonie", "Bruxelles-Capitale", "Flandre"]).nullable(),
    pays: z.string().regex(/^[A-Z]{2}$/u).default("BE"),
    /** Position facultative (stockée dans le JSON de la zone, sans migration) ; absente ou null = inconnue. */
    position: PositionProspect.nullable().optional(),
  })
  .strict();
export type ZoneProspect = z.infer<typeof ZoneProspect>;

/* ------------------------------------------------------------------ */
/* Prospects                                                           */
/* ------------------------------------------------------------------ */

/** B2B (entreprise, profession libérale, indépendant), B2C (particulier) ou partenaire et prescripteur. */
export const CibleProspect = z.enum(["entreprise", "particulier", "partenaire"]);
export type CibleProspect = z.infer<typeof CibleProspect>;

/** `refuse` : écarté par un humain ; `exclu` : écarté par une règle (au moins un motif). */
export const StatutProspect = z.enum(["nouveau", "exclu", "qualifie", "exporte", "refuse"]);
export type StatutProspect = z.infer<typeof StatutProspect>;

/** Canaux de prise de contact soumis à une base légale par prospect (la publicité ciblée est une campagne, pas un fichier). */
export const CanalContact = z.enum(["courriel", "sms", "telephone", "courrier"]);
export type CanalContact = z.infer<typeof CanalContact>;

/** Adresse électronique : impersonnelle (`info@`) ou nominative (`prenom.nom@`) (§3.2). */
export const NatureAdresse = z.enum(["impersonnelle", "nominative", "inconnue"]);
export type NatureAdresse = z.infer<typeof NatureAdresse>;

/** Faux leads : exclusions automatiques (§5.4), toutes calculées par des règles pures (lot P5). */
export const MotifExclusion = z.enum([
  "doublon",
  "numero_bce_invalide",
  "entreprise_inactive",
  "personne_physique_bce",
  "hors_zone",
  "courriel_invalide",
  "courriel_nominatif_sans_consentement",
  "telephone_invalide",
  "opposition_client",
  "liste_dncm",
  "client_actuel",
  "donnee_demonstration_campagne_reelle",
]);
export type MotifExclusion = z.infer<typeof MotifExclusion>;

export const ExclusionConstatee = z
  .object({ motif: MotifExclusion, detail: z.string().max(500), constateLe: Horodatage })
  .strict();
export type ExclusionConstatee = z.infer<typeof ExclusionConstatee>;

/**
 * Services de la passerelle qui fournissent des prospects (lecture seule). `b2c` (lot P9a) : demandes de
 * devis, clients existants et oppositions du client (particuliers, consentements fournis par la réponse).
 */
export const ServiceProspection = z.enum(["bce", "bnb", "fsma", "osm", "b2c"]);
export type ServiceProspection = z.infer<typeof ServiceProspection>;

/**
 * Forme de la personne visée : une personne morale peut recevoir un courriel sur une adresse
 * impersonnelle sans consentement ; une personne physique (indépendant, profession libérale exercée en
 * nom propre, particulier) jamais. Les données BCE d'une personne physique ne servent jamais au
 * marketing direct (conditions de la BCE).
 */
export const FormePersonne = z.enum(["personne_morale", "personne_physique", "inconnue"]);
export type FormePersonne = z.infer<typeof FormePersonne>;

/* ------------------------------------------------------------------ */
/* Particuliers (B2C) : au même rang que les entreprises               */
/* ------------------------------------------------------------------ */

/**
 * Origine légale d'un prospect particulier (§2.2, §3.3) : il n'existe aucune source « à cibler » ; seules
 * comptent les personnes qui se déclarent, les clients existants et les listes au consentement prouvé.
 */
export const OrigineParticulier = z.enum([
  /** Demande entrante : formulaire du site ou d'une page de campagne. */
  "formulaire_entrant",
  /** Demande entrante née d'une publicité ciblée par zone ou intérêt (campagne, jamais un fichier nominatif). */
  "publicite_ciblee",
  /** Simulateur ou devis en ligne terminé. */
  "simulateur_devis",
  /** Devis en ligne abandonné : relance seulement avec un consentement recueilli sur le simulateur. */
  "devis_abandonne",
  /** Prise de rendez-vous (en ligne ou par téléphone). */
  "prise_rendez_vous",
  /** Visite ou appel spontané à un établissement, bureau ou point de vente du client. */
  "point_de_vente",
  /** Client existant (vente croisée, montée en gamme). */
  "client_existant",
  /** Partenaire dont le consentement recueilli nomme le client. */
  "partenaire_consentement",
  /** Parrainage par lien : la personne se déclare elle-même (l'usine ne collecte jamais un filleul). */
  "parrainage",
  /** Événement : collecte sur place avec consentement. */
  "evenement",
  /** Lead acheté (comparateur, plateforme de demandes) avec consentement prouvé qui couvre le client et l'usage (APD 01/2020 §64 à 67). */
  "lead_achete_consentement",
  /** Courrier adressé, sur une adresse de source licite (intérêt légitime, opposition offerte). */
  "courrier_adresse",
]);
export type OrigineParticulier = z.infer<typeof OrigineParticulier>;

/** Origines qui exigent une preuve de consentement jointe (la personne ou un tiers l'a recueilli). */
export const ORIGINES_AVEC_CONSENTEMENT: readonly OrigineParticulier[] = [
  "formulaire_entrant",
  "publicite_ciblee",
  "simulateur_devis",
  "devis_abandonne",
  "prise_rendez_vous",
  "point_de_vente",
  "partenaire_consentement",
  "parrainage",
  "evenement",
  "lead_achete_consentement",
];

/** Preuve d'un consentement : date, texte exact accepté, source, canaux autorisés, responsable nommé. */
export const PreuveConsentement = z
  .object({
    date: Horodatage,
    /** Texte exact présenté et accepté (case cochée, formulaire, contrat du partenaire). */
    texteAccepte: z.string().min(20).max(4000),
    /** Où il a été recueilli : URL du formulaire, nom de l'événement, partenaire, fournisseur du lead. */
    source: z.string().min(3).max(500),
    canauxAutorises: z.array(z.enum(["courriel", "sms", "telephone", "courrier"])).min(1).max(4),
    /** Responsable du traitement nommé dans le consentement (le client, ou sa catégorie pour un partenaire). */
    responsableNomme: z.string().min(2).max(300),
    /** Référence du justificatif (identifiant de la soumission, du contrat du partenaire, de la livraison du lead). */
    reference: z.string().min(3).max(500),
    /** Retrait du consentement : la date suffit à l'invalider pour tous les canaux. */
    retireLe: Horodatage.nullable().default(null),
    /** Page où le consentement a été capté (adresse de la page du formulaire), quand la captation la transmet. */
    pageCaptation: z.string().min(3).max(2048).optional(),
    /** Adresse IP TRONQUÉE de la personne (IPv4 au dernier octet à zéro, IPv6 réduite à ses 48 premiers bits, ex. 2001:db8:1::) ; jamais l'adresse complète. */
    adresseIpTronquee: z
      .string()
      .max(45)
      .refine(
        (v) => /^(?:\d{1,3}\.){3}0$/u.test(v) || /^(?:[0-9a-fA-F]{1,4}:){1,3}:$/u.test(v),
        "Adresse IP tronquée attendue (a.b.c.0 en IPv4, a:b:c:: en IPv6), jamais l'adresse complète",
      )
      .optional(),
  })
  .strict()
  .refine((c) => new Set(c.canauxAutorises).size === c.canauxAutorises.length, { message: "Canal en double", path: ["canauxAutorises"] })
  .refine((c) => c.retireLe === null || c.retireLe >= c.date, { message: "Retrait antérieur au consentement", path: ["retireLe"] });
export type PreuveConsentement = z.infer<typeof PreuveConsentement>;

/** Volet propre à un prospect particulier. */
export const VoletParticulier = z
  .object({
    origine: OrigineParticulier,
    consentements: z.array(PreuveConsentement).max(10),
    /** Offres demandées ou visées (codes d'offres du référentiel du client). */
    offresDemandees: z.array(CodeReferentiel).max(50),
    /** Client existant de la base (vente croisée) ; null sinon. */
    clientId: IdNatif.nullable(),
    /** Pseudonyme stable remis aux agents à la place du nom, ex. `[client-7f3a]`. */
    pseudonyme: z.string().regex(/^\[client-[0-9a-f]{4,16}\]$/u, "Pseudonyme [client-xxxx] attendu"),
  })
  .strict()
  .refine((v) => !ORIGINES_AVEC_CONSENTEMENT.includes(v.origine) || v.consentements.length > 0, {
    message: "Cette origine exige une preuve de consentement",
    path: ["consentements"],
  })
  .refine((v) => (v.origine === "client_existant") === (v.clientId !== null), {
    message: "Un client existant désigne sa fiche de la base clients, et seulement lui",
    path: ["clientId"],
  })
  .refine((v) => new Set(v.offresDemandees).size === v.offresDemandees.length, { message: "Offre en double", path: ["offresDemandees"] });
export type VoletParticulier = z.infer<typeof VoletParticulier>;

/* ------------------------------------------------------------------ */
/* Démonstration B2C : personnes manifestement fictives                */
/* ------------------------------------------------------------------ */

/** Coordonnées de démonstration (mêmes conventions que la passerelle, L3 et P2). */
export const DEMONSTRATION_COORDONNEES = {
  mention: "(démonstration)",
  domaineCourriel: "@exemple.invalid",
  /** Téléphones fictifs belges `+32 4 000 …` (espaces facultatifs). */
  prefixeTelephone: "+324000",
  /** Rue fictive des adresses de démonstration. */
  rue: "Rue de la Démonstration",
} as const;

/**
 * Coordonnées en clair d'une personne, telles que montrées à l'humain (fiche déchiffrée) ou saisies.
 * Jamais stockées ainsi : le serveur les chiffre (`ValeurChiffree`) et en garde les empreintes.
 */
export const CoordonneesEnClair = z
  .object({
    nom: z.string().trim().min(1).max(200),
    courriel: z.string().trim().max(320).nullable(),
    telephone: z.string().trim().max(40).nullable(),
    adresse: z.string().trim().max(500).nullable(),
  })
  .strict();
export type CoordonneesEnClair = z.infer<typeof CoordonneesEnClair>;

/**
 * Vrai si les coordonnées sont manifestement fictives : nom suffixé « (démonstration) », courriel en
 * `@exemple.invalid`, téléphone `+32 4 000 …`, adresse « Rue de la Démonstration ». Exigé pour toute
 * personne en mode démonstration (aucune vraie personne dans les données de démonstration).
 */
export function coordonneesManifestementFictives(c: CoordonneesEnClair): boolean {
  const d = DEMONSTRATION_COORDONNEES;
  return (
    c.nom.includes(d.mention) &&
    (c.courriel === null || c.courriel.toLowerCase().endsWith(d.domaineCourriel)) &&
    (c.telephone === null || c.telephone.replace(/\s+/gu, "").startsWith(d.prefixeTelephone)) &&
    (c.adresse === null || c.adresse.includes(d.rue))
  );
}

/** D'où vient un fait sur le prospect : un dépôt signé (source de la tâche), une URL lue, un import, un formulaire, un humain. */
/**
 * Fait daté lu dans une réponse BCE (`StartDate` d'une entreprise, ou changement de `bce_changements`) :
 * il porte la date du fait lui-même (AAAA-MM-JJ), distincte de la date de collecte de la source.
 */
export const FaitBce = z
  .object({
    code: z.enum(["debut_entreprise", "creation", "nouvel_etablissement", "changement_adresse", "changement_forme"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  })
  .strict();
export type FaitBce = z.infer<typeof FaitBce>;

/**
 * Taille d'une entreprise lue dans une réponse `bnb_comptes` (Centrale des bilans) : exercice (année de clôture),
 * effectif en équivalents temps plein et catégorie déduite par la passerelle. Chaque champ est null s'il n'est pas fourni.
 */
export const TailleBnb = z
  .object({
    exercice: z.number().int().min(1900).max(2200).nullable(),
    effectifEtp: z.number().min(0).max(10_000_000).nullable(),
    categorie: z.enum(["micro", "petite", "moyenne", "grande"]).nullable(),
    // Lot 2 (critères courtier) : rubriques du bilan, absentes quand la BNB ne les fournit pas (jamais devinées).
    // Les codes de rubriques (10/15, 22, 9904) sont à confirmer sur la documentation BNB.
    /** Fonds propres (rubrique 10/15) du dernier exercice déposé ; peut être négatif. */
    fondsPropres: z.number().min(-1e13).max(1e13).nullable().optional(),
    /** Terrains et constructions (rubrique 22) du dernier exercice déposé. */
    terrainsConstructions: z.number().min(-1e13).max(1e13).nullable().optional(),
    /** Résultat de l'exercice (rubrique 9904, négatif = perte) des deux derniers exercices déposés, du plus récent au plus ancien. */
    resultats: z.array(z.object({ exercice: z.number().int().min(1900).max(2200), resultat: z.number().min(-1e13).max(1e13).nullable() }).strict()).max(3).optional(),
  })
  .strict();
export type TailleBnb = z.infer<typeof TailleBnb>;

export const SourceProspect = z
  .object({
    type: z.enum(["depot_signe", "lecture_url", "import", "formulaire", "partenaire", "saisie_humaine"]),
    /** `Source.id` de la tâche (dépôt `tache.donnees.deposer` ou lecture d'URL) ; null pour un import ou une saisie. */
    sourceId: IdNatif.nullable(),
    service: ServiceProspection.nullable(),
    outil: z.string().max(80).nullable(),
    url: z.string().max(2048).nullable(),
    collecteLe: Horodatage,
    /** Faits datés de la BCE portés par ce dépôt (signaux de moment) ; absent hors dépôt BCE. */
    faits: z.array(FaitBce).max(20).optional(),
    /** Taille tirée des comptes annuels BNB portés par ce dépôt (`bnb_comptes`) ; absente hors dépôt BNB. */
    taille: TailleBnb.optional(),
    /** Étiquette OpenStreetMap du lieu (clé et valeur, ex. `amenity` / `dentist`) portée par ce dépôt ; absente hors dépôt OSM. */
    categorieOsm: z.object({ cle: z.string().min(1).max(40), valeur: z.string().min(1).max(80) }).strict().optional(),
  })
  .strict()
  .refine((s) => s.type !== "depot_signe" || (s.sourceId !== null && s.service !== null && s.outil !== null), {
    message: "Un dépôt signé désigne sa source, son service et son outil",
  });
export type SourceProspect = z.infer<typeof SourceProspect>;

/** Coordonnée d'un prospect : toujours chiffrée, avec son empreinte et, pour un courriel, sa nature. */
export const CoordonneeProspect = z
  .object({
    canal: CanalContact,
    valeur: ValeurChiffree,
    empreinte: EmpreinteHmac,
    nature: NatureAdresse,
  })
  .strict();
export type CoordonneeProspect = z.infer<typeof CoordonneeProspect>;

/* ------------------------------------------------------------------ */
/* Score expliqué et étalonnage                                         */
/* ------------------------------------------------------------------ */

/** Libellé du score (§5.2, §5.3) : « estimation » tant que l'étalonnage n'atteint pas les seuils. Jamais « certitude ». */
export const NatureScore = z.enum(["estimation", "probabilite_mesuree"]);
export type NatureScore = z.infer<typeof NatureScore>;

/** Un critère du score, affiché avec sa valeur, sa source et sa date (§5.2). */
export const CritereScore = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]{1,59}$/u, "Code de critère attendu (ex. secteur_nace)"),
    libelle: z.string().min(1).max(200),
    valeur: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
    points: z.number().int().min(-100).max(100),
    source: z.string().min(1).max(300),
    dateSource: Horodatage,
  })
  .strict();
export type CritereScore = z.infer<typeof CritereScore>;

/** Marge : intervalle de Wilson au niveau de confiance fixé (§5.3). */
export const MargeProbabilite = z
  .object({
    probabilite: z.number().min(0).max(1),
    borneBasse: z.number().min(0).max(1),
    borneHaute: z.number().min(0).max(1),
    niveauConfiance: z.literal(SEUILS_ETALONNAGE.niveauConfiance),
    methode: z.literal("wilson"),
  })
  .strict()
  .refine((m) => m.borneBasse <= m.probabilite && m.probabilite <= m.borneHaute, {
    message: "Bornes incohérentes : borne basse ≤ probabilité ≤ borne haute",
  });
export type MargeProbabilite = z.infer<typeof MargeProbabilite>;

/** Une tranche du diagramme de fiabilité. */
export const TrancheEtalonnage = z
  .object({
    scoreMin: z.number().int().min(0).max(100),
    scoreMax: z.number().int().min(0).max(100),
    effectif: z.number().int().nonnegative(),
    conversions: z.number().int().nonnegative(),
    tauxObserve: z.number().min(0).max(1),
    probabilitePredite: z.number().min(0).max(1),
    borneBasse: z.number().min(0).max(1),
    borneHaute: z.number().min(0).max(1),
  })
  .strict()
  .refine((t) => t.scoreMin <= t.scoreMax && t.conversions <= t.effectif && t.borneBasse <= t.borneHaute, {
    message: "Tranche incohérente (bornes de score, conversions ≤ effectif, borne basse ≤ borne haute)",
  });
export type TrancheEtalonnage = z.infer<typeof TrancheEtalonnage>;

/** Segment étalonné : une cible, éventuellement restreinte à des préfixes NACE. */
export const SegmentEtalonnage = z
  .object({ cible: CibleProspect, nace: z.array(CodeNace).max(50).default([]) })
  .strict();
export type SegmentEtalonnage = z.infer<typeof SegmentEtalonnage>;

function seuilsAtteints(effectif: number, conversions: number): boolean {
  return effectif >= SEUILS_ETALONNAGE.prospectsMin && conversions >= SEUILS_ETALONNAGE.conversionsMin;
}

/**
 * Étalonnage du score sur les issues réelles (§5.3) : Platt (régression logistique à deux paramètres)
 * ou isotonique (au-delà de 1 000 exemples), ajusté sur des données séparées de celles des poids.
 * `statut` = `probabilite_mesuree` seulement si les seuils sont atteints ; sinon « estimation ».
 */
export const Etalonnage = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    segment: SegmentEtalonnage,
    methode: z.enum(["platt", "isotonique"]),
    /** Platt : `p = 1 / (1 + exp(a · score + b))` ; null pour l'isotonique (les tranches suffisent). */
    parametres: z.object({ a: z.number(), b: z.number() }).strict().nullable(),
    separation: z.enum(["validation_croisee", "decoupage_temporel"]),
    horizonJours: z.number().int().min(7).max(730),
    effectif: z.number().int().nonnegative(),
    conversions: z.number().int().nonnegative(),
    /** Score de Brier (0 = parfait). */
    brier: z.number().min(0).max(1),
    tranches: z.array(TrancheEtalonnage).max(20),
    statut: NatureScore,
    versionPoids: z.number().int().positive(),
    /** Période des issues utilisées et leur origine (historique CRM, prospects de l'usine, import). */
    donnees: z
      .object({
        debut: DateJour,
        fin: DateJour,
        origines: z.array(z.enum(["crm", "usine", "import"])).min(1),
      })
      .strict(),
    calculeLe: Horodatage,
    calculePar: z.string().min(1),
    mode: ModeExecution,
  })
  .strict()
  .refine((e) => e.conversions <= e.effectif, { message: "conversions ≤ effectif", path: ["conversions"] })
  .refine((e) => (e.methode === "platt") === (e.parametres !== null), {
    message: "Platt porte ses deux paramètres ; l'isotonique n'en a pas",
    path: ["parametres"],
  })
  .refine((e) => e.methode !== "isotonique" || e.effectif >= SEUILS_ETALONNAGE.isotoniqueEffectifMin, {
    message: `Régression isotonique seulement à partir de ${SEUILS_ETALONNAGE.isotoniqueEffectifMin} exemples`,
    path: ["methode"],
  })
  .refine((e) => e.statut !== "probabilite_mesuree" || seuilsAtteints(e.effectif, e.conversions), {
    message: `Probabilité mesurée seulement à partir de ${SEUILS_ETALONNAGE.prospectsMin} prospects observés et ${SEUILS_ETALONNAGE.conversionsMin} conversions`,
    path: ["statut"],
  })
  .refine((e) => e.donnees.debut <= e.donnees.fin, { message: "Période inversée", path: ["donnees"] });
export type Etalonnage = z.infer<typeof Etalonnage>;

/** Probabilité appliquée à un prospect, avec la référence de l'étalonnage et son effectif. */
export const EtalonnageApplique = z
  .object({
    etalonnageId: IdNatif,
    marge: MargeProbabilite,
    effectif: z.number().int().nonnegative(),
    conversions: z.number().int().nonnegative(),
    methode: z.enum(["platt", "isotonique"]),
    date: Horodatage,
  })
  .strict();
export type EtalonnageApplique = z.infer<typeof EtalonnageApplique>;

/**
 * Score expliqué (§5.2) : somme des points des critères, bornée à 0..100. Sert à trier et prioriser,
 * jamais à fixer un prix, une éligibilité ou une condition (RGPD art. 22).
 */
export const ScoreProspect = z
  .object({
    valeur: z.number().int().min(0).max(100),
    criteres: z.array(CritereScore).min(1).max(LIMITES_PROSPECTION.criteresScoreMax),
    versionPoids: z.number().int().positive(),
    nature: NatureScore,
    etalonnage: EtalonnageApplique.nullable(),
    calculeLe: Horodatage,
  })
  .strict()
  .refine((s) => s.valeur === Math.min(100, Math.max(0, s.criteres.reduce((t, c) => t + c.points, 0))), {
    message: "La valeur doit égaler la somme des points des critères, bornée à 0..100",
    path: ["valeur"],
  })
  .refine((s) => new Set(s.criteres.map((c) => c.code)).size === s.criteres.length, {
    message: "Un critère n'apparaît qu'une fois",
    path: ["criteres"],
  })
  .refine(
    (s) =>
      s.nature === "estimation"
        ? s.etalonnage === null
        : s.etalonnage !== null && seuilsAtteints(s.etalonnage.effectif, s.etalonnage.conversions),
    {
      message: "« probabilite_mesuree » exige un étalonnage qui atteint les seuils ; « estimation » n'en affiche aucun",
      path: ["nature"],
    },
  );
export type ScoreProspect = z.infer<typeof ScoreProspect>;

/* ------------------------------------------------------------------ */
/* Confiance de qualification (distincte du score de conversion)        */
/* ------------------------------------------------------------------ */

/** Seuil de la confiance (en %) à partir duquel un prospect est « qualifié ». */
export const SEUIL_QUALIFICATION = 90;

/** Critères vérifiables : chacun ne monte que sur une source déposée, jamais sur une hypothèse. */
export const CodeCritereQualification = z.enum([
  "entreprise_active",
  "segment_cible",
  "zone_cible",
  "taille_connue",
  "joignable_legalement",
  "pas_deja_client",
  "sources_concordantes",
  // Critères spécialisés « courtier » (lot 1) : besoin d'assurance prouvé et concurrence, entreprises seulement.
  "assurance_obligatoire_metier",
  "installation_recente",
  "evenement_recent",
  "besoin_offre_active",
  "pas_concurrent",
  // Critères « courtier » (lot 2) : fondés sur les comptes annuels BNB (effectif, fonds propres, terrains, résultat), entreprises seulement.
  "emploie_personnel",
  "flotte_probable",
  "proprietaire_locaux",
  "sante_financiere",
  // Critères « courtier » (lot 3) : bureau spécialisé à proximité (fiche du client) et contact professionnel publié permis (sources du prospect).
  "bureau_specialise_proche",
  "contact_public_permis",
]);
export type CodeCritereQualification = z.infer<typeof CodeCritereQualification>;

/** Bornes du seuil de qualification choisi par le client (réglages des leads). */
export const SEUIL_QUALIFICATION_MIN = 50;
export const SEUIL_QUALIFICATION_MAX = 100;
/** Au plus dix critères personnalisés par entreprise. */
export const CRITERES_PERSONNALISES_MAX = 10;
/** Critères codés (18) et personnalisés (10 au plus) : nombre maximal de critères d'une confiance. */
export const CRITERES_CONFIANCE_MAX = 18 + CRITERES_PERSONNALISES_MAX;

/** Code d'un critère : critère codé ou critère personnalisé du client. */
export const CodeCritere = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/u, "Code : minuscules, chiffres et _ (2 à 40 caractères), commençant par une lettre");
export type CodeCritere = z.infer<typeof CodeCritere>;

/** Code d'un critère personnalisé : jamais celui d'un critère codé. */
export const CodeCriterePersonnalise = CodeCritere.refine((c) => !(CodeCritereQualification.options as readonly string[]).includes(c), {
  message: "Ce code est celui d'un critère existant",
});

export const StatutCritereQualification = z.enum(["verifie", "non_verifie", "contraire"]);
export type StatutCritereQualification = z.infer<typeof StatutCritereQualification>;

export const CritereQualification = z
  .object({
    code: CodeCritere,
    libelle: z.string().min(1).max(200),
    statut: StatutCritereQualification,
    poids: z.number().int().min(0).max(100),
    /** `Source.id` du dépôt qui établit le fait ; null quand la preuve n'est pas un dépôt (base légale, base de clients). */
    sourceId: IdNatif.nullable(),
    /** Origine lisible du fait (service et outil, ou nature de la preuve). */
    source: z.string().max(300),
    /** Une décision humaine porte sa justification (500 caractères au plus) dans le détail. */
    detail: z.string().max(800),
  })
  .strict();
export type CritereQualification = z.infer<typeof CritereQualification>;

/**
 * Confiance de qualification (0 à 100) : à quel point il est établi que le prospect correspond à la cible
 * du client. Moyenne pondérée des critères vérifiés ; un critère contraire la plafonne à 50 et la rend non
 * qualifiée. À ne jamais confondre avec le score (`ScoreProspect`), qui estime la chance de conversion.
 */
export const ConfianceQualification = z
  .object({
    valeur: z.number().int().min(0).max(100),
    qualifie: z.boolean(),
    /** Vrai si au moins un critère est contraire (plafond de 50 %). */
    plafonnee: z.boolean(),
    /** Seuil choisi par le client (90 par défaut). */
    seuil: z.number().int().min(SEUIL_QUALIFICATION_MIN).max(SEUIL_QUALIFICATION_MAX),
    criteres: z.array(CritereQualification).min(1).max(CRITERES_CONFIANCE_MAX),
    calculeLe: Horodatage,
  })
  .strict()
  .refine((c) => c.qualifie === (!c.plafonnee && c.valeur >= c.seuil), { message: "« qualifié » vaut : confiance au moins égale au seuil", path: ["qualifie"] })
  .refine((c) => !c.plafonnee || (c.valeur <= 50 && !c.qualifie), { message: "Un critère contraire plafonne la confiance à 50 % et rend non qualifié", path: ["plafonnee"] })
  .refine((c) => c.plafonnee === c.criteres.some((x) => x.statut === "contraire"), { message: "« plafonnée » vaut : au moins un critère contraire", path: ["plafonnee"] });
export type ConfianceQualification = z.infer<typeof ConfianceQualification>;

/** Outil de la passerelle qui pourrait vérifier un critère manquant. */
export const SourceVerification = z
  .object({ service: ServiceProspection, outil: z.string().min(1).max(80), pourquoi: z.string().min(1).max(300) })
  .strict();
export type SourceVerification = z.infer<typeof SourceVerification>;

/** Réponse de `prospects.criteres-manquants` : ce qu'il faut encore établir pour atteindre le seuil. */
export const CriteresManquants = z
  .object({
    prospectId: IdNatif,
    confiance: z.number().int().min(0).max(100),
    qualifie: z.boolean(),
    seuil: z.number().int().min(SEUIL_QUALIFICATION_MIN).max(SEUIL_QUALIFICATION_MAX),
    manquants: z
      .array(
        z
          .object({
            code: CodeCritere,
            libelle: z.string().min(1).max(200),
            poids: z.number().int().min(0).max(100),
            /** Outils de la passerelle qui peuvent le vérifier (vide si la preuve vient d'un humain ou d'un import). */
            verifiePar: z.array(SourceVerification).max(6),
            /** Geste à faire quand aucun outil ne suffit. */
            action: z.string().max(300).nullable(),
          })
          .strict(),
      )
      .max(CRITERES_CONFIANCE_MAX),
    contraires: z.array(CodeCritere).max(CRITERES_CONFIANCE_MAX),
  })
  .strict();
export type CriteresManquants = z.infer<typeof CriteresManquants>;

/** Poids du score choisis par le client dans les réglages, versionnés et journalisés. */
export const PoidsScore = z
  .object({
    companyId: IdNatif,
    version: z.number().int().positive(),
    poids: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,59}$/u), z.number().int().min(-100).max(100)),
    decidePar: z.string().min(1),
    decideLe: Horodatage,
  })
  .strict();
export type PoidsScore = z.infer<typeof PoidsScore>;

/* ------------------------------------------------------------------ */
/* Réglages des leads : critères de confiance, seuil, poids du score   */
/* ------------------------------------------------------------------ */

const Poids0a100 = z.number().int().min(0).max(100);
const sansDoublon = <T extends { code: string }>(l: readonly T[]) => new Set(l.map((x) => x.code)).size === l.length;

/** Critère codé tel que le client le règle : actif ou non, et son poids. */
export const ReglageCritere = z.object({ code: CodeCritereQualification, actif: z.boolean(), poids: Poids0a100 }).strict();
export type ReglageCritere = z.infer<typeof ReglageCritere>;

/** Critère ajouté par le client : il ne se vérifie qu'à la main, dans la fiche d'un lead. */
export const CriterePersonnalise = z
  .object({ code: CodeCriterePersonnalise, libelle: z.string().trim().min(1).max(120), poids: Poids0a100, description: z.string().trim().max(300) })
  .strict();
export type CriterePersonnalise = z.infer<typeof CriterePersonnalise>;

/** Corps de `reglages-leads.enregistrer` : les douze critères codés, le seuil et les critères personnalisés. */
export const EnregistrerReglagesLeads = z
  .object({
    companyId: IdNatif,
    criteres: z.array(ReglageCritere).length(CodeCritereQualification.options.length),
    seuil: z.number().int().min(SEUIL_QUALIFICATION_MIN).max(SEUIL_QUALIFICATION_MAX),
    personnalises: z.array(CriterePersonnalise).max(CRITERES_PERSONNALISES_MAX),
  })
  .strict()
  .refine((r) => sansDoublon(r.criteres), { message: "Chaque critère n'apparaît qu'une fois", path: ["criteres"] })
  .refine((r) => sansDoublon(r.personnalises), { message: "Deux critères personnalisés ont le même code", path: ["personnalises"] })
  .refine((r) => r.criteres.some((c) => c.actif && c.poids > 0 && c.code !== "taille_connue") || r.personnalises.some((c) => c.poids > 0), {
    message: "Au moins un critère qui vaut pour tous les leads (autre que « Taille connue ») doit rester actif avec un poids non nul",
    path: ["criteres"],
  });
export type EnregistrerReglagesLeads = z.infer<typeof EnregistrerReglagesLeads>;

/** Réponse de `reglages-leads.lire` : réglages en vigueur (version 0 : réglages par défaut, jamais enregistrés). */
export const ReglagesLeads = z
  .object({
    companyId: IdNatif,
    version: z.number().int().min(0),
    criteres: z.array(ReglageCritere.extend({ libelle: z.string().min(1).max(200) })).length(CodeCritereQualification.options.length),
    seuil: z.number().int().min(SEUIL_QUALIFICATION_MIN).max(SEUIL_QUALIFICATION_MAX),
    personnalises: z.array(CriterePersonnalise).max(CRITERES_PERSONNALISES_MAX),
    decidePar: z.string().nullable(),
    decideLe: Horodatage.nullable(),
  })
  .strict();
export type ReglagesLeads = z.infer<typeof ReglagesLeads>;

/** Critères du score expliqué (codes calculés par `services-prospection.ts`), dans l'ordre d'affichage. */
export const CRITERES_SCORE = [
  { code: "source_registre_officiel", libelle: "Source : registre officiel (BCE, FSMA)" },
  { code: "activite_nace_connue", libelle: "Activité NACE connue" },
  { code: "courriel_impersonnel", libelle: "Adresse électronique impersonnelle" },
  { code: "telephone_present", libelle: "Téléphone publié" },
  { code: "site_present", libelle: "Site web publié" },
  { code: "origine_demande_personne", libelle: "Origine consentie : demande de devis ou de rendez-vous, ou client existant" },
  { code: "contact_direct", libelle: "Contact direct : rendez-vous, visite au bureau ou client existant" },
  { code: "consentement_actif", libelle: "Consentement actif pour au moins un canal" },
  { code: "produit_demande", libelle: "Produit demandé connu" },
  { code: "zone_desservie", libelle: "Zone desservie par un bureau" },
] as const;
export const CodeCritereScore = z.enum(CRITERES_SCORE.map((c) => c.code) as [(typeof CRITERES_SCORE)[number]["code"], ...(typeof CRITERES_SCORE)[number]["code"][]]);
export type CodeCritereScore = z.infer<typeof CodeCritereScore>;

/** Corps de `reglages-score.enregistrer` : poids de 0 à 100 par critère du score (un critère absent ne compte pas). */
export const EnregistrerPoidsScore = z
  .object({ companyId: IdNatif, poids: z.partialRecord(CodeCritereScore, Poids0a100) })
  .strict()
  .refine((r) => Object.keys(r.poids).length > 0, { message: "Au moins un poids", path: ["poids"] });
export type EnregistrerPoidsScore = z.infer<typeof EnregistrerPoidsScore>;

/** Réponse de `reglages-score.lire` : version courante (null tant qu'aucun poids n'est enregistré). */
export const ReglagesScore = z
  .object({
    companyId: IdNatif,
    version: z.number().int().positive().nullable(),
    poids: z.record(z.string(), z.number().int().min(-100).max(100)),
    criteres: z.array(z.object({ code: CodeCritereScore, libelle: z.string() }).strict()),
    decidePar: z.string().nullable(),
    decideLe: Horodatage.nullable(),
  })
  .strict();
export type ReglagesScore = z.infer<typeof ReglagesScore>;

/** Corps de `prospects.critere.corriger` : décision humaine sur UN critère d'UN lead. */
export const CorrigerCritereEntree = z
  .object({ companyId: IdNatif, statut: StatutCritereQualification, justification: z.string().trim().min(3).max(500) })
  .strict();
export type CorrigerCritereEntree = z.infer<typeof CorrigerCritereEntree>;

/** Correction humaine enregistrée : elle remplace le statut calculé de ce critère pour ce lead. */
export const CorrectionCritere = z
  .object({
    prospectId: IdNatif,
    code: CodeCritere,
    statut: StatutCritereQualification,
    justification: z.string().min(3).max(500),
    auteur: z.string().min(1).max(200),
    date: Horodatage,
  })
  .strict();
export type CorrectionCritere = z.infer<typeof CorrectionCritere>;

/** Source d'une évaluation par l'agent : adresse web ou connaissance interne (`connaissance://…`). */
const SourceEvaluation = z.string().trim().min(8).max(300).regex(/^(https?|connaissance):\/\/\S+$/u, "Source : URL http(s) ou adresse connaissance://");

/** Corps de `prospects.critere.evaluer` : évaluation par l'agent d'UN critère personnalisé d'UN lead. */
export const EvaluerCritereEntree = z
  .object({
    companyId: IdNatif,
    statut: StatutCritereQualification,
    justification: z.string().trim().min(3).max(500),
    sources: z.array(SourceEvaluation).max(10),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.statut !== "non_verifie" && e.sources.length === 0) ctx.addIssue({ code: "custom", path: ["sources"], message: "Un critère vérifié ou contraire exige au moins une source." });
  });
export type EvaluerCritereEntree = z.infer<typeof EvaluerCritereEntree>;

/** Évaluation enregistrée de l'agent : elle passe après la décision humaine, avant « non vérifié ». */
export const EvaluationCritere = z
  .object({
    prospectId: IdNatif,
    code: CodeCritere,
    statut: StatutCritereQualification,
    justification: z.string().min(3).max(500),
    sources: z.array(z.string().max(300)).max(10),
    agent: z.string().min(1).max(200),
    date: Horodatage,
  })
  .strict();
export type EvaluationCritere = z.infer<typeof EvaluationCritere>;

/* ------------------------------------------------------------------ */
/* Base légale par prospect et par canal                               */
/* ------------------------------------------------------------------ */

/** Bases légales de contact (§3.2, §6.3). */
export const BaseLegale = z.enum([
  "consentement",
  "interet_legitime",
  "client_existant_produits_analogues",
  "personne_morale_adresse_impersonnelle",
]);
export type BaseLegale = z.infer<typeof BaseLegale>;

const CANAUX_ELECTRONIQUES: ReadonlySet<CanalContact> = new Set(["courriel", "sms"]);

/**
 * Matrice des bases légales permises, par cible et par canal (§3.2 de la conception, arrêté royal du
 * 4 avril 2003, art. 1er) :
 * - courriel et SMS : consentement préalable, sauf client existant (produits analogues du même
 *   prestataire) et, pour une PERSONNE MORALE seulement, adresse impersonnelle ; jamais l'intérêt
 *   légitime ; pour un PARTICULIER : consentement ou client existant, rien d'autre ;
 * - téléphone : intérêt légitime documenté ou consentement, toujours après vérification de la liste
 *   « Ne m'appelez plus » (et de la liste d'opposition du client) ;
 * - courrier postal : intérêt légitime (source licite de l'adresse) ou consentement.
 * Un partenaire ou un professionnel peut être une personne physique : adresse impersonnelle seulement pour une personne morale.
 * Les conditions qui dépendent du temps (fraîcheur DNCM, retrait) sont des règles du lot P5.
 */
export const MATRICE_BASES_LEGALES: Readonly<Record<CibleProspect, Readonly<Record<CanalContact, readonly BaseLegale[]>>>> = {
  entreprise: {
    courriel: ["consentement", "client_existant_produits_analogues", "personne_morale_adresse_impersonnelle"],
    sms: ["consentement", "client_existant_produits_analogues", "personne_morale_adresse_impersonnelle"],
    telephone: ["interet_legitime", "consentement"],
    courrier: ["interet_legitime", "consentement"],
  },
  particulier: {
    courriel: ["consentement", "client_existant_produits_analogues"],
    sms: ["consentement", "client_existant_produits_analogues"],
    telephone: ["interet_legitime", "consentement"],
    courrier: ["interet_legitime", "consentement"],
  },
  partenaire: {
    courriel: ["consentement", "client_existant_produits_analogues", "personne_morale_adresse_impersonnelle"],
    sms: ["consentement", "client_existant_produits_analogues", "personne_morale_adresse_impersonnelle"],
    telephone: ["interet_legitime", "consentement"],
    courrier: ["interet_legitime", "consentement"],
  },
};

/** Vrai si la base est permise pour cette cible et ce canal (matrice ci-dessus). */
export function basePermise(cible: CibleProspect, canal: CanalContact, base: BaseLegale): boolean {
  return MATRICE_BASES_LEGALES[cible][canal].includes(base);
}

/**
 * Base légale enregistrée pour UN prospect et UN canal, vérifiée contre la matrice cible × canal et
 * des cohérences structurelles (adresse nominative = consentement ; téléphone = DNCM vérifiée).
 */
export const BaseLegaleContact = z
  .object({
    prospectId: IdNatif,
    cible: CibleProspect,
    /** Personne morale ou physique : l'adresse impersonnelle sans consentement n'existe que pour une personne morale. */
    forme: FormePersonne,
    canal: CanalContact,
    base: BaseLegale,
    /** Nature de l'adresse visée (courriel, SMS) ; `inconnue` pour le téléphone et le courrier. */
    natureAdresse: NatureAdresse,
    preuve: z
      .object({
        type: z.enum(["consentement", "source", "mise_en_balance", "relation_client"]),
        /** Référence du consentement, de la source ou du document de mise en balance (jamais le document lui-même). */
        reference: z.string().min(3).max(500),
        date: Horodatage,
      })
      .strict(),
    /** Information art. 14 RGPD prévue dans le premier message, et moyen d'opposition offert. */
    information: z
      .object({
        texteArt14: z.string().min(20).max(4000),
        moyenOpposition: z.string().min(5).max(500),
      })
      .strict(),
    /** Date de vérification contre la liste « Ne m'appelez plus » (obligatoire pour le téléphone). */
    dncmVerifieLe: Horodatage.nullable(),
    verifieLe: Horodatage,
    verifiePar: z.string().min(1),
  })
  .strict()
  .refine((b) => basePermise(b.cible, b.canal, b.base), {
    message: "Base légale non permise pour cette cible et ce canal (matrice §3.2)",
    path: ["base"],
  })
  .refine((b) => b.base !== "personne_morale_adresse_impersonnelle" || b.forme === "personne_morale", {
    message: "Adresse impersonnelle sans consentement : personne morale seulement",
    path: ["forme"],
  })
  .refine((b) => b.cible !== "particulier" || b.forme === "personne_physique", {
    message: "Un particulier est une personne physique",
    path: ["forme"],
  })
  .refine((b) => !(CANAUX_ELECTRONIQUES.has(b.canal) && b.base === "interet_legitime"), {
    message: "Courriel et SMS : l'intérêt légitime ne suffit pas (consentement, client existant ou adresse impersonnelle de personne morale)",
    path: ["base"],
  })
  .refine(
    (b) => b.base !== "personne_morale_adresse_impersonnelle" || (CANAUX_ELECTRONIQUES.has(b.canal) && b.natureAdresse === "impersonnelle"),
    { message: "Cette base ne vaut que pour une adresse impersonnelle, par courriel ou SMS", path: ["base"] },
  )
  .refine((b) => b.base !== "client_existant_produits_analogues" || CANAUX_ELECTRONIQUES.has(b.canal), {
    message: "L'exception « client existant, produits analogues » ne concerne que le courriel et le SMS",
    path: ["base"],
  })
  .refine((b) => !(CANAUX_ELECTRONIQUES.has(b.canal) && b.natureAdresse === "nominative" && b.base !== "consentement"), {
    message: "Adresse nominative par courriel ou SMS : consentement préalable obligatoire",
    path: ["base"],
  })
  .refine((b) => b.base !== "consentement" || b.preuve.type === "consentement", {
    message: "Le consentement se prouve par une référence de consentement",
    path: ["preuve", "type"],
  })
  .refine((b) => b.canal !== "telephone" || b.dncmVerifieLe !== null, {
    message: "Téléphone : vérification « Ne m'appelez plus » obligatoire",
    path: ["dncmVerifieLe"],
  });
export type BaseLegaleContact = z.infer<typeof BaseLegaleContact>;

/** Prospect (§6.3). `mode` est déduit des sources par le serveur, jamais déclaré. */
export const Prospect = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    campagneId: IdNatif.nullable(),
    cible: CibleProspect,
    /** Identifiant de dédoublonnage : numéro BCE, identifiant réglementaire (ex. inscription FSMA), ou empreinte HMAC. */
    identifiant: z
      .object({ type: z.enum(["numero_bce", "identifiant_reglementaire", "empreinte"]), valeur: z.string().min(1).max(64) })
      .strict(),
    numeroBce: NumeroBce.nullable(),
    /**
     * Renvoi au référentiel du client : entité qui prospecte, offres visées, segments (professions,
     * secteurs, types de particuliers), établissement ou bureau de rattachement, cible de prospection.
     */
    referentiel: RenvoiReferentiel,
    forme: FormePersonne,
    /** Dénomination d'une personne morale (en clair) ; null pour un particulier (nom chiffré dans `coordonnees`). */
    denomination: z.string().max(300).nullable(),
    /** Nom d'une personne physique (particulier, professionnel en nom propre), chiffré. */
    nomChiffre: ValeurChiffree.nullable(),
    nace: z.array(CodeNace).max(20),
    zone: ZoneProspect,
    coordonnees: z.array(CoordonneeProspect).max(20),
    empreintes: z.array(Empreinte).max(20),
    sources: z.array(SourceProspect).min(1).max(50),
    mode: ModeExecution,
    statut: StatutProspect,
    motifsExclusion: z.array(ExclusionConstatee).max(20),
    score: ScoreProspect.nullable(),
    /** Confiance de qualification, calculée à la lecture sur les sources déposées (distincte du score). */
    confiance: ConfianceQualification.optional(),
    basesLegales: z.array(BaseLegaleContact).max(4),
    /** Volet B2C : obligatoire pour un particulier, absent (null) pour une entreprise ou un partenaire. */
    particulier: VoletParticulier.nullable(),
    creeLe: Horodatage,
    modifieLe: Horodatage,
  })
  .strict()
  .refine((p) => (p.cible === "particulier") === (p.particulier !== null), {
    message: "Le volet particulier accompagne un particulier, et seulement lui",
    path: ["particulier"],
  })
  .refine((p) => p.basesLegales.every((b) => b.cible === p.cible && b.forme === p.forme), {
    message: "La base légale est vérifiée pour la cible et la forme du prospect",
    path: ["basesLegales"],
  })
  .refine((p) => p.cible !== "particulier" || p.forme === "personne_physique", {
    message: "Un particulier est une personne physique",
    path: ["forme"],
  })
  .refine((p) => p.forme !== "personne_physique" || p.cible === "particulier" || p.sources.every((s) => s.service !== "bce"), {
    message: "Les données BCE d'une personne physique ne servent jamais au marketing direct",
    path: ["sources"],
  })

  .refine(
    (p) =>
      p.particulier === null ||
      p.basesLegales.every(
        (b) =>
          b.base !== "consentement" ||
          p.particulier!.consentements.some((c) => c.retireLe === null && c.canauxAutorises.includes(b.canal)),
      ),
    {
      message: "Particulier : un consentement invoqué doit être prouvé, non retiré, et autoriser ce canal",
      path: ["basesLegales"],
    },
  )
  .refine((p) => (p.statut === "exclu") === (p.motifsExclusion.length > 0), {
    message: "Un prospect exclu porte au moins un motif ; un prospect non exclu n'en porte aucun",
    path: ["motifsExclusion"],
  })
  .refine((p) => p.cible !== "particulier" || (p.numeroBce === null && p.denomination === null), {
    message: "Un particulier n'a ni numéro BCE ni dénomination en clair",
    path: ["cible"],
  })
  .refine((p) => p.identifiant.type !== "numero_bce" || p.identifiant.valeur === p.numeroBce, {
    message: "L'identifiant BCE doit égaler le numéro BCE du prospect",
    path: ["identifiant"],
  })
  .refine((p) => p.basesLegales.every((b) => b.prospectId === p.id), {
    message: "Chaque base légale vise ce prospect",
    path: ["basesLegales"],
  })
  .refine((p) => new Set(p.basesLegales.map((b) => b.canal)).size === p.basesLegales.length, {
    message: "Une seule base légale par canal",
    path: ["basesLegales"],
  });
export type Prospect = z.infer<typeof Prospect>;

/* ------------------------------------------------------------------ */
/* Oppositions et liste « Ne m'appelez plus »                          */
/* ------------------------------------------------------------------ */

export const OrigineOpposition = z.enum(["desinscription_message", "demande_ecrite", "telephone", "formulaire", "import", "humain"]);
export type OrigineOpposition = z.infer<typeof OrigineOpposition>;

/** Opposition (art. 21.3 RGPD) : seule l'empreinte est gardée ; elle survit à la purge de la base. */
export const Opposition = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    type: TypeEmpreinte,
    empreinte: EmpreinteHmac,
    canal: z.union([CanalContact, z.literal("tous")]),
    origine: OrigineOpposition,
    recueillieLe: Horodatage,
    enregistreePar: z.string().min(1),
  })
  .strict();
export type Opposition = z.infer<typeof Opposition>;

/**
 * Entrée de `oppositions.ajouter` : la valeur est donnée en clair, normalisée puis hachée par le
 * serveur ; elle n'est jamais stockée ni journalisée.
 */
export const AjouterOppositionEntree = z
  .object({
    companyId: IdNatif,
    type: z.enum(["courriel", "telephone", "numero_bce"]),
    valeur: z.string().trim().min(3).max(320),
    canal: z.union([CanalContact, z.literal("tous")]).default("tous"),
    origine: OrigineOpposition,
    recueillieLe: Horodatage.optional(),
  })
  .strict();
export type AjouterOppositionEntree = z.infer<typeof AjouterOppositionEntree>;

/** Version chargée de la liste « Ne m'appelez plus » (licence du client ; numéros gardés en empreintes). */
export const VersionListeDncm = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    versionDu: DateJour,
    chargeeLe: Horodatage,
    numeros: z.number().int().nonnegative(),
    empreinteFichier: EmpreinteSha256,
    chargeePar: z.string().min(1),
  })
  .strict();
export type VersionListeDncm = z.infer<typeof VersionListeDncm>;

/* ------------------------------------------------------------------ */
/* Base de clients (§4)                                                */
/* ------------------------------------------------------------------ */

/** Colonnes cibles de l'écran de correspondance (§4.1). */
export const ColonneCible = z.enum([
  "identifiant_client",
  "type_client",
  "nom",
  "prenom",
  "entreprise",
  "numero_bce",
  "courriel",
  "telephone",
  "adresse",
  "code_postal",
  "commune",
  "produits_detenus",
  "debut_contrat",
  "statut_client",
  "consentement_courriel",
  "consentement_sms",
  "consentement_telephone",
  "ignorer",
]);
export type ColonneCible = z.infer<typeof ColonneCible>;

/** Colonnes chiffrées au stockage (identifiants directs, §4.3). */
export const COLONNES_CHIFFREES: readonly ColonneCible[] = ["identifiant_client", "nom", "prenom", "courriel", "telephone", "adresse"];

export const CorrespondanceColonnes = z
  .array(z.object({ colonne: z.string().min(1).max(200), cible: ColonneCible }).strict())
  .min(1)
  .max(LIMITES_PROSPECTION.baseClientsColonnesMax)
  .refine((l) => new Set(l.map((c) => c.colonne)).size === l.length, { message: "Une colonne du fichier n'est associée qu'une fois" })
  .refine(
    (l) => {
      const cibles = l.map((c) => c.cible).filter((c) => c !== "ignorer");
      return new Set(cibles).size === cibles.length;
    },
    { message: "Une colonne cible n'est choisie qu'une fois" },
  )
  .refine(
    (l) => {
      const c = new Set(l.map((x) => x.cible));
      return (
        c.has("identifiant_client") || c.has("numero_bce") || c.has("courriel") || c.has("telephone") || (c.has("nom") && c.has("code_postal"))
      );
    },
    { message: "Il faut au moins un identifiant : identifiant client, numéro BCE, courriel, téléphone, ou nom et code postal" },
  );
export type CorrespondanceColonnes = z.infer<typeof CorrespondanceColonnes>;

export const FormatBaseClients = z.enum(["csv", "xlsx"]);
export type FormatBaseClients = z.infer<typeof FormatBaseClients>;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;

/**
 * Entrée de `base-clients.importer` (humain). Le fichier n'est pas conservé : seuls son empreinte et ses
 * comptes le sont. XLSX : première feuille seulement, fichiers à macros refusés (bibliothèque à décider
 * par l'opérateur, lot P16).
 */
export const ImporterBaseClientsEntree = z
  .object({
    companyId: IdNatif,
    nomFichier: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^/\\\0]+$/u, "Nom de fichier sans chemin")
      .refine((n) => !/\.xls[mb]$/iu.test(n), "Fichier à macros ou binaire refusé (.xlsm, .xlsb)"),
    format: FormatBaseClients,
    contenuBase64: z
      .string()
      .min(4)
      .max(Math.ceil(LIMITES_PROSPECTION.baseClientsTailleMaxOctets / 3) * 4)
      .regex(BASE64, "Contenu base64 attendu"),
    correspondance: CorrespondanceColonnes,
    separateur: z.enum([";", ",", "\t"]).optional(),
    finalite: z.string().trim().min(10).max(500),
    dureeConservationMois: z.number().int().min(1).max(LIMITES_PROSPECTION.conservationMoisMax).default(LIMITES_PROSPECTION.conservationMoisDefaut),
  })
  .strict()
  .refine((e) => e.nomFichier.toLowerCase().endsWith(`.${e.format}`), {
    message: "L'extension du fichier doit correspondre au format",
    path: ["nomFichier"],
  })
  .refine((e) => e.format === "csv" || e.separateur === undefined, { message: "Séparateur : CSV seulement", path: ["separateur"] });
export type ImporterBaseClientsEntree = z.infer<typeof ImporterBaseClientsEntree>;

/** Compte rendu d'un import de base clients (aucune valeur de ligne, aucun contenu de fichier). */
export const ImportBaseClients = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    nomFichier: z.string(),
    format: FormatBaseClients,
    empreinteFichier: EmpreinteSha256,
    lignesLues: z.number().int().nonnegative(),
    lignesRetenues: z.number().int().nonnegative(),
    lignesRejetees: z.number().int().nonnegative(),
    /** Rejets expliqués ligne par ligne (numéro de ligne et motif, jamais la valeur). */
    rejets: z.array(z.object({ ligne: z.number().int().positive(), motif: z.string().max(300) }).strict()).max(LIMITES_PROSPECTION.rejetsDetaillesMax),
    correspondance: CorrespondanceColonnes,
    colonnesSensiblesRefusees: z.array(z.string().max(200)).max(LIMITES_PROSPECTION.baseClientsColonnesMax),
    finalite: z.string(),
    dureeConservationMois: z.number().int().min(1).max(LIMITES_PROSPECTION.conservationMoisMax),
    purgeLe: Horodatage,
    mode: ModeExecution,
    importePar: z.string().min(1),
    importeLe: Horodatage,
  })
  .strict()
  .refine((i) => i.lignesRetenues + i.lignesRejetees === i.lignesLues, { message: "retenues + rejetées = lues", path: ["lignesLues"] })
  .refine((i) => i.rejets.length <= i.lignesRejetees, { message: "Plus de rejets détaillés que de lignes rejetées", path: ["rejets"] })
  .refine((i) => !i.correspondance.some((c) => c.cible !== "ignorer" && i.colonnesSensiblesRefusees.includes(c.colonne)), {
    message: "Une colonne sensible refusée ne peut pas être retenue",
    path: ["colonnesSensiblesRefusees"],
  });
export type ImportBaseClients = z.infer<typeof ImportBaseClients>;

/** Consentement déclaré dans la base du client : oui, non, ou inconnu (null). */
const ConsentementDeclare = z.boolean().nullable();

/** Contrat ou produit détenu par un client, rattaché si possible à une offre du référentiel (ventes croisées). */
export const ContratDetenu = z
  .object({
    /** Entité du client qui gère le contrat et offre du référentiel (codes) ; libellé tel que dans le fichier. */
    entite: CodeReferentiel.nullable(),
    offre: CodeReferentiel.nullable(),
    produit: z.string().min(1).max(120),
    fournisseur: z.string().max(200).nullable(),
    debut: DateJour.nullable(),
    fin: DateJour.nullable(),
  })
  .strict()
  .refine((c) => c.debut === null || c.fin === null || c.debut <= c.fin, { message: "Fin avant le début", path: ["fin"] });
export type ContratDetenu = z.infer<typeof ContratDetenu>;

/** Client de la base (identifiants directs chiffrés ; les agents n'en reçoivent que des agrégats et des pseudonymes). */
export const ClientBase = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    importId: IdNatif.nullable(),
    /** Particulier (B2C) ou entreprise (B2B), au même rang. */
    typeClient: z.enum(["particulier", "entreprise"]),
    /** Établissement ou bureau de rattachement (code du référentiel). */
    etablissement: CodeReferentiel.nullable(),
    /** Entités du client avec qui il a un contrat, et segments (codes du référentiel). */
    entites: z.array(CodeReferentiel).max(20),
    segments: z.array(CodeReferentiel).max(50),
    /** Pseudonyme stable remis aux agents, ex. `[client-7f3a]` ; le nom n'est montré qu'à l'humain, déchiffré. */
    pseudonyme: z.string().regex(/^\[client-[0-9a-f]{4,16}\]$/u, "Pseudonyme [client-xxxx] attendu"),
    contrats: z.array(ContratDetenu).max(50),
    /** Identifiants directs chiffrés, par colonne cible (`COLONNES_CHIFFREES`). */
    donneesChiffrees: z.partialRecord(z.enum(["identifiant_client", "nom", "prenom", "courriel", "telephone", "adresse"]), ValeurChiffree),
    empreintes: z.array(Empreinte).max(10),
    entreprise: z.string().max(300).nullable(),
    numeroBce: NumeroBce.nullable(),
    codePostal: z.string().regex(/^\d{4}$/u).nullable(),
    commune: z.string().max(120).nullable(),
    produitsDetenus: z.array(z.string().min(1).max(120)).max(50),
    debutContrat: DateJour.nullable(),
    statut: z.enum(["actif", "ancien"]),
    consentements: z.object({ courriel: ConsentementDeclare, sms: ConsentementDeclare, telephone: ConsentementDeclare }).strict(),
    mode: ModeExecution,
    creeLe: Horodatage,
  })
  .strict()
  .refine((c) => c.empreintes.length > 0, { message: "Un client porte au moins une empreinte (dédoublonnage, exclusion)", path: ["empreintes"] })
  .refine((c) => c.typeClient === "entreprise" || (c.numeroBce === null && c.entreprise === null), {
    message: "Un client particulier n'a ni numéro BCE ni dénomination d'entreprise",
    path: ["typeClient"],
  });
export type ClientBase = z.infer<typeof ClientBase>;

/**
 * Règle de vente croisée fournie par le client (§4.2) : « qui détient X peut se voir proposer Y ».
 * L'usine ne l'invente pas.
 */
export const RegleVenteCroisee = z
  .object({
    companyId: IdNatif,
    /** Codes d'offres du référentiel : qui détient `detenue` peut se voir proposer `proposee`. */
    detenue: CodeReferentiel,
    proposee: CodeReferentiel,
    typeClient: z.enum(["particulier", "entreprise"]),
    decidePar: z.string().min(1),
    decideLe: Horodatage,
  })
  .strict()
  .refine((r) => r.detenue !== r.proposee, { message: "Une offre ne se propose pas à elle-même", path: ["proposee"] });
export type RegleVenteCroisee = z.infer<typeof RegleVenteCroisee>;

/**
 * Opportunité de vente croisée calculée par une règle pure (lot P5) : besoins manquants d'un client,
 * remise aux agents sous pseudonyme. Canal : client existant (produits analogues du même prestataire)
 * pour le courriel et le SMS, sinon consentement.
 */
export const OpportuniteVenteCroisee = z
  .object({
    clientId: IdNatif,
    pseudonyme: z.string().regex(/^\[client-[0-9a-f]{4,16}\]$/u),
    typeClient: z.enum(["particulier", "entreprise"]),
    /** Codes d'offres détenues et proposées. */
    detenus: z.array(CodeReferentiel).min(1).max(50),
    proposes: z.array(CodeReferentiel).min(1).max(50),
    zone: ZoneProspect,
    mode: ModeExecution,
  })
  .strict()
  .refine((o) => o.proposes.every((b) => !o.detenus.includes(b)), { message: "Une offre proposée est déjà détenue", path: ["proposes"] });
export type OpportuniteVenteCroisee = z.infer<typeof OpportuniteVenteCroisee>;

/**
 * Fiche déchiffrée d'une personne, montrée à l'humain seulement (jamais à un agent). En démonstration,
 * les coordonnées doivent être manifestement fictives (`coordonneesManifestementFictives`).
 */
export const FichePersonneDechiffree = z
  .object({
    prospectId: IdNatif.nullable(),
    clientId: IdNatif.nullable(),
    mode: ModeExecution,
    coordonnees: CoordonneesEnClair,
  })
  .strict()
  .refine((f) => f.prospectId !== null || f.clientId !== null, { message: "La fiche vise un prospect ou un client" })
  .refine((f) => f.mode === "reel" || coordonneesManifestementFictives(f.coordonnees), {
    message: "Démonstration : nom « (démonstration) », courriel @exemple.invalid, téléphone +32 4 000, adresse Rue de la Démonstration",
    path: ["coordonnees"],
  });
export type FichePersonneDechiffree = z.infer<typeof FichePersonneDechiffree>;

/**
 * Entrée de `prospects.particuliers.enregistrer` (humain, ou intégration d'un formulaire, d'un
 * partenaire, d'un lead acheté) : coordonnées en clair, chiffrées par le serveur à la réception, avec
 * l'origine légale et les preuves de consentement. Aucun `mode` : il est déduit de l'entreprise.
 */
export const EnregistrerParticulierEntree = z
  .object({
    companyId: IdNatif,
    campagneId: IdNatif.optional(),
    referentiel: RenvoiReferentiel,
    coordonnees: CoordonneesEnClair,
    zone: ZoneProspect,
    origine: OrigineParticulier,
    consentements: z.array(PreuveConsentement).max(10).default([]),
    clientId: IdNatif.optional(),
  })
  .strict()
  .refine((e) => !ORIGINES_AVEC_CONSENTEMENT.includes(e.origine) || e.consentements.length > 0, {
    message: "Cette origine exige une preuve de consentement",
    path: ["consentements"],
  })
  .refine((e) => (e.origine === "client_existant") === (e.clientId !== undefined), {
    message: "Un client existant désigne sa fiche de la base clients, et seulement lui",
    path: ["clientId"],
  })
  .refine((e) => e.coordonnees.courriel !== null || e.coordonnees.telephone !== null || e.coordonnees.adresse !== null, {
    message: "Au moins un moyen de contact",
    path: ["coordonnees"],
  });
export type EnregistrerParticulierEntree = z.infer<typeof EnregistrerParticulierEntree>;

/** Issue commerciale observée : seule source des taux de conversion (la base clients seule ne donne que des succès). */
export const IssueCommerciale = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    prospectId: IdNatif.nullable(),
    clientId: IdNatif.nullable(),
    issue: z.enum(["gagne", "perdu"]),
    date: DateJour,
    origine: z.enum(["crm", "usine", "import"]),
    mode: ModeExecution,
    importeeLe: Horodatage,
  })
  .strict()
  .refine((i) => i.prospectId !== null || i.clientId !== null, { message: "Une issue vise un prospect ou un client" });
export type IssueCommerciale = z.infer<typeof IssueCommerciale>;

/** Entrée de `base-clients.supprimer` (humain seulement) : confirmation explicite, journalisée. */
export const SupprimerBaseClientsEntree = z
  .object({
    companyId: IdNatif,
    confirmation: z.literal("SUPPRIMER LA BASE CLIENTS"),
    motif: z.string().trim().min(3).max(500),
  })
  .strict();
export type SupprimerBaseClientsEntree = z.infer<typeof SupprimerBaseClientsEntree>;

/* ------------------------------------------------------------------ */
/* Routes : dépôt, liste, exclusion, étalonnage, export                */
/* ------------------------------------------------------------------ */

/**
 * Entrée de `tache.prospects.deposer` : même dépôt BRUT et signé que `tache.donnees.deposer`
 * (v1.4 à v1.6), restreint aux services de prospection. Aucun `mode`, aucun `companyId`.
 */
export const DeposerProspectsEntree = DeposerDonneesConnexionEntree.extend({ service: ServiceProspection }).strict();
export type DeposerProspectsEntree = z.infer<typeof DeposerProspectsEntree>;

/** Entrée (requête) de `prospects.lister`. Les filtres se cumulent ; plusieurs valeurs d'un filtre valent « l'une OU l'autre ». */
export const ListerProspectsEntree = z
  .object({
    companyId: IdNatif,
    campagneId: IdNatif.optional(),
    cibles: z.array(CibleProspect).max(3).optional(),
    nace: z.array(CodeNace).max(50).optional(),
    codesPostaux: z.array(z.string().regex(/^\d{4}$/u)).max(100).optional(),
    communes: z.array(z.string().min(1).max(120)).max(100).optional(),
    provinces: z.array(z.string().min(1).max(80)).max(20).optional(),
    regions: z.array(z.enum(["Wallonie", "Bruxelles-Capitale", "Flandre"])).max(3).optional(),
    statuts: z.array(StatutProspect).max(5).optional(),
    /** Codes du référentiel du client. */
    entites: z.array(CodeReferentiel).max(20).optional(),
    etablissements: z.array(CodeReferentiel).max(50).optional(),
    segments: z.array(CodeReferentiel).max(50).optional(),
    offres: z.array(CodeReferentiel).max(50).optional(),
    /** Origine légale (particuliers). */
    origines: z.array(OrigineParticulier).max(12).optional(),
    /** Zone d'un bureau : codes postaux (4 chiffres) ou communes ; un prospect de l'une OU l'autre convient. */
    zonesBureau: z.array(z.string().min(1).max(120)).max(100).optional(),
    /** Source des données : réelle ou de démonstration. */
    source: z.enum(["reelle", "demonstration"]).optional(),
    /** Par défaut, les prospects déjà clients (critère « pas déjà client » contraire) sont masqués ; `true` les réaffiche. */
    avecClientsActuels: z.boolean().optional(),
    scoreMin: z.number().int().min(0).max(100).optional(),
    /** Seulement les prospects dont la confiance de qualification atteint le seuil (90 %). */
    qualifiesSeulement: z.boolean().optional(),
    page: z.number().int().min(1).default(1),
    parPage: z.number().int().min(1).max(LIMITES_PROSPECTION.pageMax).default(50),
  })
  .strict();
export type ListerProspectsEntree = z.infer<typeof ListerProspectsEntree>;

export const PageProspects = z
  .object({
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pages: z.number().int().nonnegative(),
    prospects: z.array(Prospect).max(LIMITES_PROSPECTION.pageMax),
    /** Fiches chiffrées avec l'ancienne clé (migration 016) : exclues de la page, à réimporter. Absent quand il n'y en a aucune. */
    aReimporter: z.number().int().positive().optional(),
  })
  .strict();
export type PageProspects = z.infer<typeof PageProspects>;

/** Entrée de `prospects.exclure` : un agent ou un humain écarte un prospect avec un motif connu. */
export const ExclureProspectEntree = z
  .object({
    companyId: IdNatif,
    prospectId: IdNatif,
    motif: MotifExclusion,
    detail: z.string().trim().min(3).max(500),
  })
  .strict();
export type ExclureProspectEntree = z.infer<typeof ExclureProspectEntree>;

/**
 * Entrée de `prospects.fusionner-doublons` (humain seulement) : rattrapage des fiches qui désignent la même
 * entreprise. `aBlanc` (défaut) liste les paires sans rien écrire ; `aBlanc: false` fusionne.
 */
export const FusionnerDoublonsEntree = z
  .object({
    companyId: IdNatif,
    aBlanc: z.boolean().default(true),
  })
  .strict();
export type FusionnerDoublonsEntree = z.infer<typeof FusionnerDoublonsEntree>;

/** Entrée de `etalonnage.calculer` (humain seulement). */
export const CalculerEtalonnageEntree = z
  .object({
    companyId: IdNatif,
    segment: SegmentEtalonnage,
    horizonJours: z.number().int().min(7).max(730).default(SEUILS_ETALONNAGE.horizonJoursParDefaut),
    separation: z.enum(["validation_croisee", "decoupage_temporel"]).default("decoupage_temporel"),
    /**
     * Lot P9b : historique d'opportunités importé (format de l'historique d'opportunités des clients :
     * `type_cible`, `canal_origine`, `date_cloture`, `issue` gagnee|perdue, colonne `score` facultative).
     * Absent : les issues commerciales enregistrées (table `issues_commerciales`).
     */
    historique: z
      .object({
        nomFichier: z.string().min(1).max(200).regex(/^[^/\\\0]+$/u, "Nom de fichier sans chemin"),
        format: FormatBaseClients,
        contenuBase64: z.string().min(4).max(Math.ceil(LIMITES_PROSPECTION.baseClientsTailleMaxOctets / 3) * 4).regex(BASE64, "Contenu base64 attendu"),
      })
      .strict()
      .optional(),
    /** Date de coupure (ajustement avant, mesure après) ; absente : 70 % des issues les plus anciennes pour l'ajustement. */
    coupure: DateJour.optional(),
  })
  .strict();
export type CalculerEtalonnageEntree = z.infer<typeof CalculerEtalonnageEntree>;

/** Lot P9b : entrée de `base-clients.apercu` (humain) : lecture seule du fichier, rien n'est stocké. */
export const ApercuBaseClientsEntree = z
  .object({
    companyId: IdNatif,
    nomFichier: z.string().min(1).max(200).regex(/^[^/\\\0]+$/u, "Nom de fichier sans chemin").refine((n) => !/\.xls[mb]$/iu.test(n), "Fichier à macros ou binaire refusé (.xlsm, .xlsb)"),
    format: FormatBaseClients,
    contenuBase64: z.string().min(4).max(Math.ceil(LIMITES_PROSPECTION.baseClientsTailleMaxOctets / 3) * 4).regex(BASE64, "Contenu base64 attendu"),
    separateur: z.enum([";", ",", "\t"]).optional(),
  })
  .strict();
export type ApercuBaseClientsEntree = z.infer<typeof ApercuBaseClientsEntree>;

/** Lot P9b : entrée de `prospects.exporter-fichier` (humain) : prospects désignés OU filtres de la liste. */
export const ExporterFichierProspectsEntree = z
  .object({
    companyId: IdNatif,
    canal: CanalContact,
    format: FormatBaseClients,
    prospectIds: z.array(IdNatif).min(1).max(5000).optional(),
    /** Filtres de `prospects.lister` (mêmes noms), sans pagination. */
    filtres: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((e) => !(e.prospectIds && e.filtres), { message: "Liste d'identifiants OU filtres, pas les deux", path: ["filtres"] });
export type ExporterFichierProspectsEntree = z.infer<typeof ExporterFichierProspectsEntree>;

/** CRM visés par l'export (outils d'écriture de la passerelle, lot P14). */
export const ServiceExportCrm = z.enum(["crm", "pipedrive", "odoo", "teamleader"]);
export type ServiceExportCrm = z.infer<typeof ServiceExportCrm>;

/** Contrôle de la base légale d'un prospect au moment de l'export (§6.5). */
export const VerificationExport = z
  .object({
    prospectId: IdNatif,
    ok: z.boolean(),
    /** Motif de refus : sans base légale pour le canal, opposition, client actuel, exclu, DNCM périmée… */
    motif: z.string().max(300).nullable(),
  })
  .strict()
  .refine((v) => v.ok === (v.motif === null), { message: "Un refus porte un motif ; un accord n'en porte pas" });
export type VerificationExport = z.infer<typeof VerificationExport>;

/**
 * Entrée de `tache.prospects.exporter` : l'agent demande l'export de prospects vers le CRM du client
 * pour un canal prévu. Le serveur vérifie chaque base légale puis crée une diffusion réelle ordinaire
 * (appel exact proposé, approbation humaine, preuve `apv1`) : aucune preuve n'est acceptée ici.
 */
export const DemanderExportCrmEntree = z
  .object({
    prospectIds: z.array(IdNatif).min(1).max(LIMITES_PROSPECTION.exportProspectsMax),
    canal: CanalContact,
    service: ServiceExportCrm,
    /** Entité du référentiel au nom de laquelle les prospects sont exportés (mentions légales, identifiants). */
    entite: CodeReferentiel,
    cleIdempotence: z.string().min(8).max(200),
  })
  .strict()
  .refine((e) => new Set(e.prospectIds).size === e.prospectIds.length, { message: "Prospects en double", path: ["prospectIds"] });
export type DemanderExportCrmEntree = z.infer<typeof DemanderExportCrmEntree>;

/** Export vers le CRM sous preuve : son état suit celui de la diffusion qui le porte. */
export const ExportCrm = z
  .object({
    id: IdNatif,
    companyId: IdNatif,
    issueId: IdNatif,
    diffusionId: IdNatif.nullable(),
    entite: CodeReferentiel,
    referentielVersion: z.number().int().positive(),
    service: ServiceExportCrm,
    canal: CanalContact,
    prospectIds: z.array(IdNatif).min(1).max(LIMITES_PROSPECTION.exportProspectsMax),
    verifications: z.array(VerificationExport).max(LIMITES_PROSPECTION.exportProspectsMax),
    etat: EtatDiffusion,
    motifRefus: z.string().nullable(),
    cleIdempotence: z.string().min(8).max(200),
    mode: ModeExecution,
    demandePar: z.string().min(1),
    creeLe: Horodatage,
  })
  .strict()
  .refine((x) => !["preparee", "confirmee", "ambigue_a_reconcilier"].includes(x.etat) || x.diffusionId !== null, {
    message: "Un export préparé, confirmé ou à réconcilier est porté par une diffusion (preuve d'approbation)",
    path: ["diffusionId"],
  })
  .refine((x) => x.etat !== "confirmee" || x.verifications.every((v) => v.ok), {
    message: "Aucun export confirmé avec un prospect refusé",
    path: ["verifications"],
  })
  .refine((x) => x.etat !== "refusee" || (x.motifRefus !== null && x.motifRefus.length > 0), {
    message: "Un export refusé porte son motif",
    path: ["motifRefus"],
  })
  .refine((x) => x.mode === "reel" || x.etat !== "confirmee", {
    message: "En démonstration, un export n'est jamais confirmé (au plus « simulée »)",
    path: ["etat"],
  });
export type ExportCrm = z.infer<typeof ExportCrm>;

/* ------------------------------------------------------------------ */
/* Compte rendu d'un lead et question au Coordinateur                   */
/* ------------------------------------------------------------------ */

/** Réponse de `prospects.compte-rendu` : lecture déterministe des données stockées, sans IA ni invention. */
export const CompteRenduProspect = z
  .object({
    prospectId: IdNatif,
    /** Dénomination, pseudonyme ou identifiant court : jamais le nom d'une personne. */
    nom: z.string().min(1).max(300),
    genereLe: Horodatage,
    pourquoi: z
      .object({
        verifies: z.array(z.object({ code: CodeCritere, libelle: z.string(), detail: z.string(), source: z.string(), service: ServiceProspection.nullable(), date: Horodatage.nullable() }).strict()).max(CRITERES_CONFIANCE_MAX),
        nonVerifies: z.array(z.object({ code: CodeCritere, libelle: z.string(), detail: z.string() }).strict()).max(CRITERES_CONFIANCE_MAX),
        contraires: z.array(z.object({ code: CodeCritere, libelle: z.string(), detail: z.string() }).strict()).max(CRITERES_CONFIANCE_MAX),
      })
      .strict(),
    /** Confiance de qualification (sources vérifiées), distincte du score. */
    confiance: z.object({ valeur: z.number().int().min(0).max(100), qualifie: z.boolean(), plafonnee: z.boolean(), seuil: z.number().int() }).strict(),
    /** Score de conversion tel qu'il est stocké (estimation ou probabilité mesurée) ; null tant qu'il n'est pas calculé. */
    score: z.object({ valeur: z.number().int().min(0).max(100), nature: NatureScore, libelle: z.string() }).strict().nullable(),
    /** Une phrase qui explique la différence entre la confiance et le score. */
    differenceConfianceScore: z.string(),
    /** Signaux de moment établis par les données ; vide quand les sources n'en portent aucun. */
    signaux: z.array(z.object({ code: z.string(), libelle: z.string(), date: Horodatage.nullable(), source: z.string() }).strict()).max(10),
    offreRecommandee: z.object({ code: z.string().nullable(), nom: z.string(), description: z.string(), raison: z.string() }).strict().nullable(),
    /** Pourquoi aucune offre n'est recommandée (null quand une offre l'est). */
    raisonSansOffre: z.string().nullable(),
    etablissementProche: z
      .object({ code: z.string().nullable(), nom: z.string(), adresse: z.string().nullable(), distanceKm: z.number().min(0).nullable(), raison: z.enum(["distance", "meme_code_postal", "meme_commune"]), precisionPosition: PositionProspect.shape.precision.nullable().optional() })
      .strict()
      .nullable(),
    prochaineAction: z.object({ libelle: z.string(), canal: CanalContact.nullable(), outils: z.array(z.string()).max(10) }).strict(),
    limites: z.array(z.string()).max(10),
    /** Même contenu en Markdown, pour le coller dans une tâche. */
    markdown: z.string(),
  })
  .strict();
export type CompteRenduProspect = z.infer<typeof CompteRenduProspect>;

/** Entrée de `prospects.question` (humain seulement) : une question posée au Coordinateur sur ce lead. */
export const QuestionProspectEntree = z
  .object({
    companyId: IdNatif,
    question: z.string().trim().min(3, "La question est trop courte.").max(4000),
  })
  .strict();
export type QuestionProspectEntree = z.infer<typeof QuestionProspectEntree>;

/* ------------------------------------------------------------------ */
/* Routes prévues                                                      */
/* ------------------------------------------------------------------ */

/**
 * Routes de la prospection prévues au §6.3 et pas encore servies : aucune depuis le lot P9b, qui a versé
 * dans `ROUTES_API` (`routes.ts`) l'export CRM, la base de clients et l'étalonnage. Liste gardée pour
 * le contrôle de non-recouvrement des routes.
 */
export const ROUTES_PROSPECTION_PREVUES = [
] as const satisfies readonly RouteApi[];
