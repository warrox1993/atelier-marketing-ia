// Fiches de services de la passerelle : un service = une adresse /mcp/<id> = une
// connexion native Paperclip (docs/connecteurs-conception.md §6.1). La passerelle
// n'est câblée sur aucun service : elle accueille autant de fiches que le registre
// en contient. Les fiches ci-dessous sont seulement le jeu livré par défaut ; un
// nouveau service (Pipedrive, Odoo, Teamleader, autre) s'ajoute par
// RegistreFournisseurs.declarerFiche ou par le champ `fiche` d'un fournisseur.

/** Identifiant de service : minuscules et chiffres, 32 caractères au plus (il sert de chemin /mcp/<id>). */
export type Service = string;

export const MOTIF_SERVICE = /^[a-z][a-z0-9]{0,31}$/;

/** Nom du compte de démonstration, repris dans le nom des connexions (§6.5). */
export const COMPTE_DEMONSTRATION = "Rénovation Liège (démonstration)";

/** Mention portée par chaque réponse en mode démonstration (§6.5). */
export const MENTION_DEMONSTRATION = "Données de démonstration : aucune activité réelle";

export interface ProprieteDemo {
  id: string;
  libelle: string;
}

/** Fiche d'un service : ce que la passerelle sait de lui, hors outils (ceux-ci viennent du fournisseur). */
export interface FicheService {
  id: Service;
  libelle: string;
  /**
   * Portées minimales de l'API du service (informatif ; annoncées en mode réel dans
   * les métadonnées de ressource protégée). La démonstration n'a qu'une portée.
   */
  portees: readonly string[];
  /** Propriétés proposées sur la page de consentement de démonstration (identifiants fictifs, domaine .example). */
  proprietesDemo: readonly ProprieteDemo[];
}

export function verifierFiche(fiche: FicheService): void {
  if (!MOTIF_SERVICE.test(fiche.id)) {
    throw new Error(`Identifiant de service invalide : « ${fiche.id} » (minuscules et chiffres, 32 caractères au plus).`);
  }
  if (fiche.libelle.trim() === "") throw new Error(`Fiche ${fiche.id} : libellé vide.`);
  if (fiche.proprietesDemo.length === 0) throw new Error(`Fiche ${fiche.id} : au moins une propriété de démonstration est requise.`);
}

const un = (id: string, libelle: string): ProprieteDemo[] => [{ id, libelle }];

/** Jeu de fiches livré par défaut. Données de démonstration seulement ; le modèle détaillé est le lot L3. */
export const FICHES_PAR_DEFAUT: readonly FicheService[] = [
  {
    id: "gsc", libelle: "Search Console", portees: ["https://www.googleapis.com/auth/webmasters.readonly"],
    proprietesDemo: [
      { id: "sc-domain:renovation-liege.example", libelle: "renovation-liege.example (domaine)" },
      { id: "https://www.renovation-liege.example/", libelle: "https://www.renovation-liege.example/" },
    ],
  },
  { id: "ga4", libelle: "Google Analytics 4", portees: ["https://www.googleapis.com/auth/analytics.readonly"], proprietesDemo: un("properties/100000001", "Rénovation Liège : site web (properties/100000001)") },
  { id: "ads", libelle: "Google Ads", portees: ["https://www.googleapis.com/auth/adwords"], proprietesDemo: un("customers/0000000001", "Rénovation Liège : compte Ads fictif (000-000-0001)") },
  {
    id: "gbp", libelle: "Fiche d'établissement", portees: ["https://www.googleapis.com/auth/business.manage"],
    proprietesDemo: [
      { id: "locations/9000000001", libelle: "Liège-Centre" },
      { id: "locations/9000000002", libelle: "Liège-Outremeuse" },
      { id: "locations/9000000003", libelle: "Ans" },
    ],
  },
  { id: "facebook", libelle: "Facebook (Pages)", portees: ["pages_show_list", "pages_read_engagement"], proprietesDemo: un("page/100000000000001", "Rénovation Liège (page de démonstration)") },
  { id: "instagram", libelle: "Instagram professionnel", portees: ["instagram_business_basic"], proprietesDemo: un("ig/17840000000000001", "@renovation.liege.demo") },
  { id: "linkedin", libelle: "LinkedIn (pages)", portees: ["r_organization_social"], proprietesDemo: un("urn:li:organization:900000001", "Rénovation Liège (page de démonstration)") },
  { id: "crm", libelle: "CRM (HubSpot)", portees: ["crm.objects.contacts.read"], proprietesDemo: un("portail/demo-0001", "Portail CRM de démonstration (0001)") },
  { id: "pipedrive", libelle: "CRM (Pipedrive)", portees: ["contacts:read", "deals:read"], proprietesDemo: un("societe/demo-0001", "Compte Pipedrive de démonstration (0001)") },
  { id: "odoo", libelle: "CRM (Odoo)", portees: ["crm.lead:read"], proprietesDemo: un("base/demo-0001", "Base Odoo de démonstration (0001)") },
  { id: "teamleader", libelle: "CRM (Teamleader)", portees: ["contacts", "deals"], proprietesDemo: un("compte/demo-0001", "Compte Teamleader de démonstration (0001)") },
];
