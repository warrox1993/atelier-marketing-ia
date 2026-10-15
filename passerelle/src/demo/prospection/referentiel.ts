// Référentiel de la démonstration « prospection » (lot P2) : zones, secteurs, formes juridiques.
// Tout est fictif sauf les codes (NACE, formes juridiques) et les communes, qui sont réels pour la crédibilité.
//
// Niveaux de preuve (docs/prospection-conception.md §2.1) : les codes NACE-BEL à 5 chiffres et les libellés
// ci-dessous sont PROBABLES (non relus sur la classification Statbel) ; la correspondance 2008 → 2025 est reprise
// à l'identique (simplification : la révision 2025 a changé certains codes) ; les codes de forme juridique (014, 610)
// sont à confirmer sur le guide officiel de la BCE au lot P3.

/** Nom affiché de l'entreprise cliente simulée (un assureur belge). Lu dans une variable d'environnement locale, jamais dans le dépôt. */
export const VARIABLE_NOM_ASSUREUR = "ATELIER_DEMO_ASSUREUR_NOM";
export const NOM_ASSUREUR_PAR_DEFAUT = "Assurances Démo Liège (démonstration)";

/** Nom du client assureur de démonstration (défaut générique fictif ; la variable le remplace sans toucher aux graines). */
export function nomAssureurDemo(env: NodeJS.ProcessEnv = process.env): string {
  const valeur = env[VARIABLE_NOM_ASSUREUR]?.trim();
  return valeur && valeur.length > 0 && valeur.length <= 120 ? valeur : NOM_ASSUREUR_PAR_DEFAUT;
}

/** Marqueurs qui permettent au plugin de classer une réponse en démonstration (à ajouter à EMPREINTES_DEMONSTRATION côté plugin). */
export const EMPREINTES_PROSPECTION_DEMO: readonly string[] = ["(démonstration)", "demo-prospection.example", "@exemple.invalid"];

export const DOMAINE_SITES = "demo-prospection.example";
export const DOMAINE_COURRIEL = "exemple.invalid";

export interface Localite {
  codePostal: string;
  nom: string;
  province: string | null;
  region: "Wallonie" | "Bruxelles-Capitale" | "Flandre";
  /** Poids de tirage pour les entreprises générées. */
  poids: number;
}

export const LOCALITES: readonly Localite[] = [
  { codePostal: "4000", nom: "Liège", province: "Liège", region: "Wallonie", poids: 0.22 },
  { codePostal: "4020", nom: "Liège", province: "Liège", region: "Wallonie", poids: 0.14 },
  { codePostal: "4030", nom: "Liège", province: "Liège", region: "Wallonie", poids: 0.06 },
  { codePostal: "4430", nom: "Ans", province: "Liège", region: "Wallonie", poids: 0.14 },
  { codePostal: "4040", nom: "Herstal", province: "Liège", region: "Wallonie", poids: 0.04 },
  { codePostal: "4100", nom: "Seraing", province: "Liège", region: "Wallonie", poids: 0.09 },
  { codePostal: "4420", nom: "Saint-Nicolas", province: "Liège", region: "Wallonie", poids: 0.06 },
  { codePostal: "4460", nom: "Grâce-Hollogne", province: "Liège", region: "Wallonie", poids: 0.06 },
  { codePostal: "4400", nom: "Flémalle", province: "Liège", region: "Wallonie", poids: 0.05 },
  { codePostal: "5000", nom: "Namur", province: "Namur", region: "Wallonie", poids: 0.08 },
  { codePostal: "1000", nom: "Bruxelles", province: null, region: "Bruxelles-Capitale", poids: 0.06 },
  { codePostal: "9000", nom: "Gand", province: "Flandre orientale", region: "Flandre", poids: 0.04 },
];

export function localite(codePostal: string): Localite {
  const trouve = LOCALITES.find((l) => l.codePostal === codePostal);
  if (!trouve) throw new Error(`Localité inconnue : ${codePostal}`);
  return trouve;
}

/** Zone desservie par le client de démonstration (communes de Liège et d'Ans) : hors de cette zone = piège « hors zone ». */
export const COMMUNES_ZONE_CLIENT = ["Liège", "Ans"] as const;

export const RUES = [
  "Rue des Exemples", "Quai Imaginaire", "Rue de la Démonstration", "Avenue Fictive", "Boulevard du Modèle",
  "Rue Sans-Nom", "Place de l'Essai", "Chaussée du Test", "Rue de l'Atelier Fictif", "Impasse du Brouillon",
] as const;

export interface FormeJuridique { code: string; libelle: string }
export const FORMES: readonly FormeJuridique[] = [
  { code: "610", libelle: "Société à responsabilité limitée" },
  { code: "014", libelle: "Société anonyme" },
];

export interface Secteur {
  id: string;
  nace: string;
  libelle: string;
  /** Nombre d'entreprises générées. */
  nombre: number;
  prefixes: readonly string[];
  /** Besoin assurable typique d'un assureur (information de démonstration, pas une table du client). */
  besoin: string;
}

/** Cibles d'un assureur : PME, commerces, flottes, métiers du bâtiment, hôtellerie-restauration, courtiers. */
export const SECTEURS: readonly Secteur[] = [
  { id: "couverture", nace: "43910", libelle: "Travaux de couverture", nombre: 6, prefixes: ["Couvertures", "Toitures", "Zinguerie"], besoin: "responsabilité civile et décennale" },
  { id: "isolation", nace: "43291", libelle: "Travaux d'isolation", nombre: 5, prefixes: ["Isolation", "Thermo", "Confort"], besoin: "responsabilité civile et décennale" },
  { id: "menuiserie", nace: "43320", libelle: "Travaux de menuiserie", nombre: 5, prefixes: ["Menuiserie", "Châssis", "Boiseries"], besoin: "incendie atelier, responsabilité civile" },
  { id: "construction", nace: "41201", libelle: "Construction de bâtiments résidentiels", nombre: 4, prefixes: ["Bâtisseurs", "Constructions", "Habitat"], besoin: "tous risques chantier" },
  { id: "commerce", nace: "47190", libelle: "Autre commerce de détail en magasin non spécialisé", nombre: 6, prefixes: ["Comptoir", "Bazar", "Magasin"], besoin: "incendie, vol, pertes d'exploitation" },
  { id: "restauration", nace: "56101", libelle: "Restauration à service complet", nombre: 5, prefixes: ["Brasserie", "Table", "Auberge"], besoin: "incendie, pertes d'exploitation" },
  { id: "hotellerie", nace: "55100", libelle: "Hôtels et hébergement similaire", nombre: 2, prefixes: ["Hôtel", "Gîte"], besoin: "incendie, responsabilité des hôteliers" },
  { id: "garage", nace: "45201", libelle: "Entretien et réparation de véhicules automobiles légers", nombre: 3, prefixes: ["Garage", "Carrosserie"], besoin: "garage, responsabilité civile" },
  { id: "transport", nace: "49410", libelle: "Transports routiers de fret", nombre: 4, prefixes: ["Transports", "Logistique"], besoin: "flotte automobile, marchandises transportées" },
  { id: "courtage", nace: "66220", libelle: "Activités des agents et courtiers d'assurances", nombre: 8, prefixes: ["Courtage", "Cabinet", "Conseil"], besoin: "partenaire de distribution (courtier ou agent)" },
];

export const THEMES = [
  "Mosane", "Outremeuse", "Cointe", "Publémont", "Sauvenière", "Féronstrée", "Hesbaye", "Pierreuse", "Fictive",
  "Imaginaire", "Modèle", "Vennes", "Longdoz", "Saint-Léonard", "Ardente", "Haute-Meuse",
] as const;

export function libelleNace(code: string): string {
  return SECTEURS.find((s) => s.nace === code)?.libelle ?? code;
}

export function libelleForme(code: string): string {
  return FORMES.find((f) => f.code === code)?.libelle ?? code;
}
