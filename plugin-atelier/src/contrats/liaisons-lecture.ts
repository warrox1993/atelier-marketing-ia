/**
 * Lecture du bureau de liaison par les humains (lot L7) : fiche des échanges d'une tâche (`liaison.lire`) et
 * registre de la Direction (`liaison.registre`). Types partagés entre le serveur et l'interface.
 *
 * Règle de confidentialité : la vue d'une liaison côté service CIBLE ne contient que ce qui lui a été transmis
 * (objet, question, extraits) et ce qu'il a lui-même répondu ; jamais l'identifiant de la tâche d'origine ni celui
 * de l'entreprise source.
 */
import { z } from "zod";
import { StatutLiaison, STATUTS_LIAISON, type ExtraitLiaison } from "./liaisons.js";

/** Noms lisibles des services du registre (organisation/registre/services.json). */
export const NOMS_SERVICES: Readonly<Record<string, string>> = {
  marketing: "Marketing",
  direction: "Direction",
  administratif: "Administratif",
  juridique: "Juridique",
  commercial: "Commercial",
  recouvrement: "Recouvrement",
  "sav-sinistres": "Service après-vente et sinistres",
  "commerce-exterieur": "Commerce extérieur",
  conformite: "Conformité",
  "comptabilite-finance": "Comptabilité et finance",
  "ressources-humaines": "Ressources humaines",
  informatique: "Informatique",
  achats: "Achats",
  qualite: "Qualité",
  logistique: "Logistique",
  production: "Production",
  "recherche-innovation": "Recherche et innovation",
  communication: "Communication",
  "service-client": "Service client",
  fiscalite: "Fiscalité",
  "gestion-projets": "Gestion de projets",
  hse: "Hygiène, sécurité et environnement",
  formation: "Formation",
  "juridique-social": "Juridique social",
  "donnees-bi": "Données et BI",
  evenementiel: "Événementiel",
  "services-generaux": "Services généraux",
  partenariats: "Partenariats",
};

/** Nom lisible d'un service ; un slug inconnu devient un libellé lisible (tirets remplacés, majuscule initiale). */
export function nomService(slug: string): string {
  const connu = NOMS_SERVICES[slug];
  if (connu) return connu;
  const brut = slug.replace(/-/gu, " ");
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

/** Nom affiché quand l'entreprise cible d'une liaison a été supprimée. */
export const NOM_SERVICE_SUPPRIME = "Service supprimé";

/** Libellé d'un statut. Sur la fiche d'une tâche, l'attente d'approbation s'adresse à l'humain de l'entreprise source. */
export function libelleStatutLiaison(statut: StatutLiaison, contexte: "fiche" | "registre" = "fiche"): string {
  switch (statut) {
    case "en_attente_approbation":
      return contexte === "fiche" ? "En attente de votre accord" : "En attente d'accord";
    case "ouverte":
      return "Transmise";
    case "repondue":
      return "Répondue";
    case "refusee":
      return "Refusée";
    case "annulee":
      return "Annulée";
    case "cible_supprimee":
      return "Service supprimé";
  }
}

/** Vue d'une liaison pour l'onglet « Échanges » d'une tâche. */
export interface VueLiaison {
  id: string;
  /** Côté de la tâche consultée : elle est l'origine de la demande (source) ou la tâche reçue (cible). */
  role: "source" | "cible";
  serviceSource: string;
  serviceCible: string;
  nomServiceSource: string;
  nomServiceCible: string;
  objet: string;
  question: string;
  extraits: ExtraitLiaison[];
  statut: StatutLiaison;
  libelleStatut: string;
  creeLe: string;
  reponduLe: string | null;
  reponse?: string;
}

export interface ReponseLireLiaisons {
  liaisons: VueLiaison[];
}

export const LIMITES_REGISTRE = { tailleDefaut: 25, tailleMax: 100, exportMax: 5000 } as const;

const dateJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Date attendue au format AAAA-MM-JJ.");

/** Paramètres de requête de `liaison.registre` (tous optionnels ; `companyId` est résolu par l'hôte). */
export const FiltreRegistre = z
  .object({
    service: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/u).optional(),
    statut: z.enum(STATUTS_LIAISON).optional(),
    du: dateJour.optional(),
    au: dateJour.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    taille: z.coerce.number().int().min(1).max(LIMITES_REGISTRE.tailleMax).default(LIMITES_REGISTRE.tailleDefaut),
    exporter: z.enum(["csv"]).optional(),
  })
  .strict();
export type FiltreRegistre = z.infer<typeof FiltreRegistre>;

/** Ligne du registre : jamais la question, les extraits ni la réponse (le registre trace, il ne duplique pas les contenus). */
export interface LigneRegistre {
  id: string;
  serviceSource: string;
  serviceCible: string;
  nomServiceSource: string;
  nomServiceCible: string;
  objet: string;
  statut: StatutLiaison;
  libelleStatut: string;
  nombreExtraits: number;
  creeLe: string;
  reponduLe: string | null;
}

/** Réponse de `liaison.acces` : seulement le droit d'accès au registre, jamais une donnée du registre. */
export interface ReponseAccesRegistre {
  acces: boolean;
}

export interface ReponseRegistre {
  autorise: true;
  lignes: LigneRegistre[];
  total: number;
  page: number;
  taille: number;
  pages: number;
}

export interface ReponseExportRegistre {
  autorise: true;
  fichier: { nom: string; typeMime: string; contenuBase64: string };
  lignes: number;
  tronque: boolean;
}
