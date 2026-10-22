/**
 * Registre des consentements (route `consentements.registre`, humain seulement, lecture seule) : pour chaque prospect
 * particulier dont une coordonnée repose sur un consentement, la preuve (date, source, texte accepté, page de captation,
 * adresse IP tronquée, campagne) et l'origine des coordonnées (source, date, base légale). Types partagés entre le
 * serveur et l'interface.
 *
 * Les coordonnées sont rendues MASQUÉES par défaut ; `complet=1` les rend en clair et l'accès est journalisé.
 */
import { z } from "zod";
import { IdNatif } from "./communs.js";
import { DateJour } from "./prospection.js";

export const LIMITES_REGISTRE_CONSENTEMENTS = { tailleDefaut: 25, tailleMax: 100, exportMax: 5000 } as const;

/** Paramètres de requête de `consentements.registre` (tous optionnels ; `companyId` est résolu par l'hôte, jamais un filtre). */
export const FiltreConsentements = z
  .object({
    /** Période : date du consentement, bornes incluses (AAAA-MM-JJ). */
    du: DateJour.optional(),
    au: DateJour.optional(),
    campagneId: IdNatif.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    taille: z.coerce.number().int().min(1).max(LIMITES_REGISTRE_CONSENTEMENTS.tailleMax).default(LIMITES_REGISTRE_CONSENTEMENTS.tailleDefaut),
    /** `1` : coordonnées en clair (accès journalisé). Absent ou `0` : masquées. */
    complet: z.enum(["0", "1"]).optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict();
export type FiltreConsentements = z.infer<typeof FiltreConsentements>;

/** Une ligne du registre : une preuve de consentement d'un prospect. */
export interface LigneConsentement {
  prospectId: string;
  /** Pseudonyme stable `[client-xxxx]` : sert d'identifiant tant que le nom est masqué. */
  pseudonyme: string;
  /** Nom (masqué ou en clair selon `complet`), ou null si illisible. */
  nom: string | null;
  courriel: string | null;
  telephone: string | null;
  adresse: string | null;
  canauxAutorises: string[];
  consentementLe: string;
  retireLe: string | null;
  /** Où le consentement a été recueilli (formulaire, événement, partenaire, fournisseur du lead). */
  source: string;
  reference: string;
  texteAccepte: string;
  responsableNomme: string;
  pageCaptation: string | null;
  /** Adresse IP tronquée si la captation l'a transmise, sinon null (non conservée). */
  adresseIpTronquee: string | null;
  campagneId: string | null;
  campagne: string | null;
  /** Origine légale du prospect (formulaire entrant, partenaire, événement, lead acheté…). */
  origine: string;
  /** Origine des coordonnées : première source du prospect (type, date de collecte). */
  origineCoordonnees: { type: string; collecteLe: string; url: string | null } | null;
  /** Base légale par canal (`bases_legales`). */
  basesLegales: Array<{ canal: string; base: string }>;
  mode: "demonstration" | "reel";
}

export interface ReponseRegistreConsentements {
  companyId: string;
  /** Vrai si les coordonnées sont en clair. */
  complet: boolean;
  lignes: LigneConsentement[];
  total: number;
  page: number;
  taille: number;
  pages: number;
}

export interface ReponseExportConsentements {
  companyId: string;
  complet: boolean;
  fichier: { nom: string; typeMime: string; contenuBase64: string };
  lignes: number;
  tronque: boolean;
}
