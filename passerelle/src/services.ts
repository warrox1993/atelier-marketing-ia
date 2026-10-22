// Fiches de services de la passerelle : un service = une adresse /mcp/<id> = une
// connexion native Paperclip (docs/connecteurs-conception.md §6.1). La passerelle
// n'est câblée sur aucun service : elle accueille autant de fiches que le registre
// en contient. Les fiches ci-dessous sont seulement le jeu livré par défaut ; un
// nouveau service (Pipedrive, Odoo, Teamleader, autre) s'ajoute par
// RegistreFournisseurs.declarerFiche ou par le champ `fiche` d'un fournisseur.

/** Identifiant de service : minuscules et chiffres, 32 caractères au plus (il sert de chemin /mcp/<id>). */
export type Service = string;

export const MOTIF_SERVICE = /^[a-z][a-z0-9]{0,31}$/;

/** Nom du compte affiché sur la page d'autorisation locale (services sans compte de tiers : osm, bce, bnb, liens). */
export const COMPTE_LOCAL = "Poste local de la passerelle";

/** Propriété (source de données) proposée sur la page d'autorisation locale d'un service. */
export interface Propriete {
  id: string;
  libelle: string;
}

/** Fiche d'un service : ce que la passerelle sait de lui, hors outils (ceux-ci viennent du fournisseur). */
export interface FicheService {
  id: Service;
  libelle: string;
  /**
   * Portées minimales de l'API du service (informatif ; annoncées dans les métadonnées de ressource protégée).
   */
  portees: readonly string[];
  /**
   * Services à autorisation LOCALE seulement (osm, bce, bnb, liens) : sources proposées sur la page d'autorisation
   * locale. Les services de tiers (Google, réseaux sociaux, CRM) n'en ont pas : leur compte vient de la plateforme.
   */
  proprietes?: readonly Propriete[];
}

export function verifierFiche(fiche: FicheService): void {
  if (!MOTIF_SERVICE.test(fiche.id)) {
    throw new Error(`Identifiant de service invalide : « ${fiche.id} » (minuscules et chiffres, 32 caractères au plus).`);
  }
  if (fiche.libelle.trim() === "") throw new Error(`Fiche ${fiche.id} : libellé vide.`);
}

/**
 * Fiches des services LOCAUX (osm, bce, bnb, liens : aucun compte de tiers, accès par l'autorisation locale de la
 * passerelle). Déclarées ici pour qu'un service local non branché réponde « non_connecte » plutôt que « inconnu ».
 */
export const FICHE_OSM: FicheService = {
  id: "osm",
  libelle: "OpenStreetMap (commerces et activités)",
  portees: ["osm:lecture"],
  proprietes: [{ id: "extrait/osm-local", libelle: "Extrait OpenStreetMap local (index de la passerelle, licence ODbL)" }],
};

export const FICHE_BCE: FicheService = {
  id: "bce",
  libelle: "BCE Open Data (entreprises belges)",
  portees: ["bce:lecture"],
  proprietes: [{ id: "registre/bce-local", libelle: "Fichier BCE Open Data local (index de la passerelle)" }],
};

export const FICHE_BNB: FicheService = {
  id: "bnb",
  libelle: "Centrale des bilans (BNB)",
  portees: ["bnb:lecture"],
  proprietes: [{ id: "centrale/bnb-cbso", libelle: "Centrale des bilans de la BNB (API CBSO, clé de la passerelle)" }],
};

export const FICHE_LIENS: FicheService = {
  id: "liens",
  libelle: "Vérification de liens (lecture d'URL protégée)",
  portees: ["liens:lecture"],
  proprietes: [{ id: "web/public", libelle: "Web public (lecture seule, adresses publiques uniquement)" }],
};

export const FICHE_EXTRACTION: FicheService = {
  id: "extraction",
  libelle: "Extraction de sites web (Crawl4AI local)",
  portees: ["extraction:lecture"],
  proprietes: [{ id: "web/public", libelle: "Web public (lecture seule, adresses publiques uniquement, conteneur local)" }],
};

export const FICHE_AUDIT: FicheService = {
  id: "audit",
  libelle: "Audit de pages (Lighthouse)",
  portees: ["audit:lecture"],
  proprietes: [{ id: "web/public", libelle: "Web public (lecture seule, adresses publiques uniquement)" }],
};

export const FICHE_EMAILING: FicheService = {
  id: "emailing",
  libelle: "E-mailing (listmonk local, envoi de test vers Mailpit)",
  portees: ["emailing:lecture", "emailing:ecriture"],
  proprietes: [{ id: "listmonk/local", libelle: "listmonk local (listes, abonnés avec consentement, brouillons ; envoi de test seulement)" }],
};

export const FICHE_CAPTATION: FicheService = {
  id: "captation",
  libelle: "Captation de prospects (pages de destination avec formulaire, Umami local)",
  portees: ["captation:lecture", "captation:ecriture"],
  proprietes: [{ id: "pages/local", libelle: "Pages de destination locales (contacts donnés par la personne avec son consentement ; aucune mise en ligne par un outil)" }],
};

export const FICHE_STATBEL: FicheService = {
  id: "statbel",
  libelle: "Statbel (statistiques publiques belges par commune)",
  portees: ["statbel:lecture"],
  proprietes: [{ id: "statistiques/statbel-local", libelle: "Index Statbel local (population, revenus fiscaux, assujettis TVA par commune ; open data CC BY 4.0)" }],
};

/** Jeu de fiches livré par défaut : services de tiers (comptes et jetons de la plateforme). Aucune donnée n'est simulée. */
export const FICHES_PAR_DEFAUT: readonly FicheService[] = [
  { id: "gsc", libelle: "Search Console", portees: ["https://www.googleapis.com/auth/webmasters.readonly"] },
  { id: "ga4", libelle: "Google Analytics 4", portees: ["https://www.googleapis.com/auth/analytics.readonly"] },
  { id: "ads", libelle: "Google Ads", portees: ["https://www.googleapis.com/auth/adwords"] },
  { id: "gbp", libelle: "Fiche d'établissement", portees: ["https://www.googleapis.com/auth/business.manage"] },
  { id: "facebook", libelle: "Facebook (Pages)", portees: ["pages_show_list", "pages_read_engagement"] },
  { id: "instagram", libelle: "Instagram professionnel", portees: ["instagram_business_basic"] },
  { id: "linkedin", libelle: "LinkedIn (pages)", portees: ["r_organization_social"] },
  { id: "crm", libelle: "CRM (HubSpot)", portees: ["crm.objects.contacts.read"] },
  { id: "pipedrive", libelle: "CRM (Pipedrive)", portees: ["contacts:read", "deals:read"] },
  { id: "odoo", libelle: "CRM (Odoo)", portees: ["crm.lead:read"] },
  { id: "fsma", libelle: "Registre FSMA des intermédiaires", portees: ["fsma:lecture"] },
  { id: "teamleader", libelle: "CRM (Teamleader)", portees: ["contacts", "deals"] },
  FICHE_OSM,
  FICHE_BCE,
  FICHE_BNB,
  FICHE_LIENS,
  FICHE_EXTRACTION,
  FICHE_AUDIT,
  FICHE_EMAILING,
  FICHE_CAPTATION,
  FICHE_STATBEL,
];
