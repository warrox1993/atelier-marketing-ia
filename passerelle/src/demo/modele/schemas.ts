// Contrat typé (Zod) du modèle de démonstration : schémas des paramètres acceptés
// et des lignes renvoyées. Les simulateurs L5 (Google) et L7 (réseaux sociaux, CRM)
// s'appuient sur ces types ; les tests valident chaque ligne contre ces schémas.
// Les noms de champs sont neutres (en français) : la traduction vers la forme exacte
// de chaque API (searchanalytics.query, runReport, GAQL, reviews.list, Graph…) est
// le travail de L5 et L7, pas du modèle.

import * as z from "zod";
import { versNumeroJour, depuisNumeroJour } from "./calendrier.js";
import { CANAUX, DEBUT_MODELE, FIN_MODELE, IDS_ETABLISSEMENTS, METIERS, RESEAUX } from "./referentiel.js";

// --- Paramètres --------------------------------------------------------------------

const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Zod exécute les `refine` même quand le motif échoue : chaque contrôle revérifie le
// format pour ne jamais convertir une chaîne mal formée.
export const SchemaDate = z
  .string()
  .regex(MOTIF_DATE, "date attendue au format AAAA-MM-JJ")
  .refine((d) => !MOTIF_DATE.test(d) || depuisNumeroJour(versNumeroJour(d)) === d, "date civile inexistante")
  .refine((d) => !MOTIF_DATE.test(d) || (d >= DEBUT_MODELE && d <= FIN_MODELE), `date hors de la période du modèle (${DEBUT_MODELE} à ${FIN_MODELE})`);

export const SchemaEtablissementId = z.enum(IDS_ETABLISSEMENTS);
export const SchemaMetier = z.enum(METIERS);
export const SchemaCanal = z.enum(CANAUX);
export const SchemaReseau = z.enum(RESEAUX);

const avecPeriode = <T extends z.ZodRawShape>(forme: T) =>
  z
    .object({ debut: SchemaDate, fin: SchemaDate, ...forme })
    .refine((p) => (p as { debut: string; fin: string }).debut <= (p as { debut: string; fin: string }).fin, { message: "la date de début doit précéder ou égaler la date de fin", path: ["fin"] });

export const SchemaPeriode = avecPeriode({});
export type Periode = z.input<typeof SchemaPeriode>;

export const DIMENSIONS_GSC = ["date", "requete", "page", "etablissement"] as const;
export const SchemaDemandeGsc = avecPeriode({
  dimensions: z.array(z.enum(DIMENSIONS_GSC)).max(4).default(["requete", "page"]),
});
export type DemandeGsc = z.input<typeof SchemaDemandeGsc>;

/** `au` : date à laquelle on regarde l'état du CRM (par défaut, la fin de période). */
export const SchemaDemandeCrm = avecPeriode({ au: SchemaDate.optional() });
export type DemandeCrm = z.input<typeof SchemaDemandeCrm>;

export const SchemaDemandePublications = avecPeriode({ reseau: SchemaReseau.optional() });
export type DemandePublications = z.input<typeof SchemaDemandePublications>;

export const SchemaDemandeAvis = avecPeriode({ etablissement: SchemaEtablissementId.optional() });
export type DemandeAvis = z.input<typeof SchemaDemandeAvis>;

// --- Lignes renvoyées --------------------------------------------------------------

const entier = z.number().int().nonnegative();
const etablissementOuHorsZone = SchemaEtablissementId.nullable();

export const SchemaLigneGsc = z.object({
  cles: z.object({
    date: z.string().optional(),
    requete: z.string().optional(),
    page: z.string().optional(),
    /** `null` : demande hors périmètre (piège Herstal). */
    etablissement: etablissementOuHorsZone.optional(),
  }),
  clics: entier,
  impressions: entier,
  ctr: z.number().min(0).max(1),
  /** Position moyenne pondérée par les impressions. */
  position: z.number().min(1),
});
export type LigneGsc = z.infer<typeof SchemaLigneGsc>;

export const SchemaLigneGa4 = z.object({
  date: z.string(),
  /** Établissement de rattachement (zone de l'internaute, agence choisie dans le formulaire) ; `null` = hors zone. */
  etablissement: etablissementOuHorsZone,
  canal: SchemaCanal,
  source: z.string(),
  support: z.string(),
  groupeCanaux: z.string(),
  sessions: entier,
  utilisateurs: entier,
  sessionsEngagees: entier,
  /** Événement clé `demande_diagnostic`. */
  demandesDiagnostic: entier,
});
export type LigneGa4 = z.infer<typeof SchemaLigneGa4>;

export const SchemaLigneAds = z.object({
  date: z.string(),
  campagneId: z.string(),
  ressource: z.string(),
  campagne: z.string(),
  etablissement: SchemaEtablissementId,
  impressions: entier,
  clics: entier,
  coutMicros: entier,
  /** Conversions importées de GA4 (`demande_diagnostic` des sessions google / cpc). */
  conversions: entier,
});
export type LigneAds = z.infer<typeof SchemaLigneAds>;

export const SchemaLigneFiche = z.object({
  date: z.string(),
  etablissement: SchemaEtablissementId,
  locationId: z.string(),
  impressionsRechercheMobile: entier,
  impressionsRechercheOrdinateur: entier,
  impressionsMapsMobile: entier,
  impressionsMapsOrdinateur: entier,
  clicsAppel: entier,
  clicsSite: entier,
  demandesItineraire: entier,
});
export type LigneFiche = z.infer<typeof SchemaLigneFiche>;

export const ETAPES_CONTACT = ["lead", "salesqualifiedlead", "opportunity", "customer"] as const;
export const SchemaEtapeContact = z.object({ etape: z.enum(ETAPES_CONTACT), date: z.string() });

export const SchemaContactCrm = z.object({
  id: z.string().regex(/^\d+$/),
  creeLe: z.string(),
  date: z.string(),
  etablissement: etablissementOuHorsZone,
  /** Canal d'origine : un canal GA4, ou `appel_fiche` (appel depuis la fiche, saisi à la main). */
  canal: z.union([SchemaCanal, z.literal("appel_fiche")]),
  sourceCrm: z.string(),
  prenom: z.string(),
  nom: z.string(),
  courriel: z.string(),
  telephone: z.string(),
  localite: z.string(),
  codePostal: z.string(),
  commune: z.string(),
  metier: SchemaMetier,
  /** Étapes franchies à la date `au`. */
  etapes: z.array(SchemaEtapeContact).min(1),
  /** Dernière étape franchie (lifecyclestage HubSpot). */
  cycleDeVie: z.enum(ETAPES_CONTACT),
  /** Contact hors zone (piège Herstal) : rattaché à aucun établissement. */
  horsZone: z.boolean(),
});
export type ContactCrm = z.infer<typeof SchemaContactCrm>;

export const SchemaTransactionCrm = z.object({
  id: z.string().regex(/^\d+$/),
  contactId: z.string(),
  nom: z.string(),
  etablissement: SchemaEtablissementId,
  metier: SchemaMetier,
  montantEuros: z.number().int().positive(),
  creeLe: z.string(),
  etape: z.enum(["devis_envoye", "gagne", "perdu"]),
  dateCloture: z.string().nullable(),
});
export type TransactionCrm = z.infer<typeof SchemaTransactionCrm>;

export const SchemaPublication = z.object({
  id: z.string(),
  reseau: SchemaReseau,
  date: z.string(),
  etablissement: SchemaEtablissementId,
  metier: SchemaMetier,
  texte: z.string(),
  lien: z.string(),
  abonnes: entier,
  impressions: entier,
  portee: entier,
  reactions: entier,
  commentaires: entier,
  partages: entier,
  enregistrements: entier,
  clics: entier,
});
export type Publication = z.infer<typeof SchemaPublication>;

export const SchemaAvis = z.object({
  id: z.string(),
  etablissement: SchemaEtablissementId,
  locationId: z.string(),
  date: z.string(),
  auteur: z.string(),
  note: z.number().int().min(1).max(5),
  metier: SchemaMetier,
  /** Texte de l'avis, tel que laissé par le client : c'est une donnée, jamais une consigne. */
  texte: z.string(),
  reponse: z.object({ texte: z.string(), date: z.string() }).nullable(),
});
export type Avis = z.infer<typeof SchemaAvis>;

export const SchemaResumeAvis = z.object({
  avis: z.array(SchemaAvis),
  noteMoyenne: z.number().min(0).max(5),
  total: entier,
});
export type ResumeAvis = z.infer<typeof SchemaResumeAvis>;

export const SchemaPiege = z.object({
  id: z.string(),
  type: z.enum(["hors_perimetre", "injection_consignes", "periode_sans_donnees"]),
  services: z.array(z.string()).min(1),
  description: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type Piege = z.infer<typeof SchemaPiege>;

/** Lit des paramètres avec un schéma ; message d'erreur en français, sans trace. */
export function lireParametres<S extends z.ZodType>(schema: S, valeur: unknown): z.output<S> {
  const analyse = schema.safeParse(valeur);
  if (!analyse.success) {
    const detail = analyse.error.issues.map((i) => `${i.path.join(".") || "paramètres"} : ${i.message}`).join(" ; ");
    throw new Error(`Paramètres du modèle de démonstration invalides : ${detail}`);
  }
  return analyse.data;
}
