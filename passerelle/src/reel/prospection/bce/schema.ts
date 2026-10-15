// Schéma de l'index BCE local (lot P3) : SQLite, une table par fichier CSV de la BCE, avec les NOMS DE COLONNES DES FICHIERS
// (EnterpriseNumber, TypeOfEnterprise…), plus quelques colonnes dérivées (dates ISO, commune normalisée, province, région).
//
// Niveau de preuve des noms de fichiers et de colonnes : PROBABLE. Relevés sur des outils publics qui lisent les vrais
// fichiers (Azizo-B/CBE schema.sql, JB-Analytica/kbo-open-data kbo_source.py, Fedict/lod-cbe, companydata.co) le 15/10/2026 ;
// le guide officiel (« cookbook ») n'est lisible qu'après inscription (CAPTCHA sur la page du SPF Économie). À confirmer à
// la première importation réelle : l'importateur refuse un fichier dont il manque une colonne obligatoire, en la nommant.
//
// RÈGLE DE CONFORMITÉ (conditions BCE : pas de marketing direct sur les données de personnes physiques) : l'index ne
// contient JAMAIS une entité personne physique, ni ses établissements, ni ses dénominations, adresses, contacts, activités.

import type Database from "better-sqlite3";

export const VERSION_SCHEMA = 1;

export interface SpecTable {
  /** Nom du fichier CSV (sans suffixe `_insert` ou `_delete` pour une mise à jour). */
  fichier: string;
  table: string;
  /** Colonnes lues dans le CSV et stockées telles quelles. */
  colonnes: readonly string[];
  /** Colonnes obligatoires dans l'en-tête du fichier (les autres sont facultatives : valeur nulle si absentes). */
  obligatoires: readonly string[];
  /** Nature : détermine le filtre « personne morale seulement » appliqué à l'insertion. */
  nature: "entreprise" | "etablissement" | "entite";
}

export const TABLES: readonly SpecTable[] = [
  {
    fichier: "enterprise", table: "enterprise", nature: "entreprise",
    colonnes: ["EnterpriseNumber", "Status", "JuridicalSituation", "TypeOfEnterprise", "JuridicalForm", "JuridicalFormCAC", "StartDate"],
    obligatoires: ["EnterpriseNumber", "TypeOfEnterprise"],
  },
  {
    fichier: "establishment", table: "establishment", nature: "etablissement",
    colonnes: ["EstablishmentNumber", "StartDate", "EnterpriseNumber"],
    obligatoires: ["EstablishmentNumber", "EnterpriseNumber"],
  },
  {
    fichier: "denomination", table: "denomination", nature: "entite",
    colonnes: ["EntityNumber", "Language", "TypeOfDenomination", "Denomination"],
    obligatoires: ["EntityNumber", "Denomination"],
  },
  {
    fichier: "address", table: "address", nature: "entite",
    colonnes: ["EntityNumber", "TypeOfAddress", "CountryNL", "CountryFR", "Zipcode", "MunicipalityNL", "MunicipalityFR", "StreetNL", "StreetFR", "HouseNumber", "Box", "ExtraAddressInfo", "DateStrikingOff"],
    obligatoires: ["EntityNumber", "TypeOfAddress"],
  },
  {
    fichier: "contact", table: "contact", nature: "entite",
    colonnes: ["EntityNumber", "EntityContact", "ContactType", "Value"],
    obligatoires: ["EntityNumber", "ContactType", "Value"],
  },
  {
    fichier: "activity", table: "activity", nature: "entite",
    colonnes: ["EntityNumber", "ActivityGroup", "NaceVersion", "NaceCode", "Classification"],
    obligatoires: ["EntityNumber", "NaceVersion", "NaceCode"],
  },
];

/** Fichiers lisibles dans un fichier complet, en plus des tables ci-dessus. */
export const FICHIERS_COMPLETS_OBLIGATOIRES = ["meta.csv", "code.csv", ...TABLES.map((t) => `${t.fichier}.csv`)] as const;

export function specDeTable(table: string): SpecTable {
  const s = TABLES.find((t) => t.table === table);
  if (!s) throw new Error(`Table inconnue : ${table}`);
  return s;
}

/** Tables et colonnes dérivées (créées sans index secondaires : ils sont ajoutés après un chargement en masse). */
export function creerTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (Variable TEXT PRIMARY KEY, Value TEXT) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS code (Category TEXT NOT NULL, Code TEXT NOT NULL, Language TEXT NOT NULL, Description TEXT, PRIMARY KEY (Category, Code, Language)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS enterprise (
      EnterpriseNumber TEXT PRIMARY KEY, Status TEXT, JuridicalSituation TEXT, TypeOfEnterprise TEXT NOT NULL,
      JuridicalForm TEXT, JuridicalFormCAC TEXT, StartDate TEXT, StartDateIso TEXT
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS establishment (
      EstablishmentNumber TEXT PRIMARY KEY, StartDate TEXT, StartDateIso TEXT, EnterpriseNumber TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS denomination (
      EntityNumber TEXT NOT NULL, Language TEXT, TypeOfDenomination TEXT, Denomination TEXT NOT NULL,
      UNIQUE (EntityNumber, Language, TypeOfDenomination, Denomination)
    );
    CREATE TABLE IF NOT EXISTS address (
      EntityNumber TEXT NOT NULL, TypeOfAddress TEXT NOT NULL, CountryNL TEXT, CountryFR TEXT, Zipcode TEXT,
      MunicipalityNL TEXT, MunicipalityFR TEXT, StreetNL TEXT, StreetFR TEXT, HouseNumber TEXT, Box TEXT,
      ExtraAddressInfo TEXT, DateStrikingOff TEXT,
      MunicipalityNorm TEXT, ProvinceNorm TEXT, Region TEXT, CountryIso TEXT,
      PRIMARY KEY (EntityNumber, TypeOfAddress)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS contact (
      EntityNumber TEXT NOT NULL, EntityContact TEXT, ContactType TEXT NOT NULL, Value TEXT NOT NULL,
      UNIQUE (EntityNumber, EntityContact, ContactType, Value)
    );
    CREATE TABLE IF NOT EXISTS activity (
      EntityNumber TEXT NOT NULL, ActivityGroup TEXT, NaceVersion TEXT NOT NULL, NaceCode TEXT NOT NULL, Classification TEXT,
      UNIQUE (EntityNumber, ActivityGroup, NaceVersion, NaceCode, Classification)
    );
    CREATE TABLE IF NOT EXISTS changement (
      Id INTEGER PRIMARY KEY AUTOINCREMENT, Date TEXT NOT NULL, Type TEXT NOT NULL, EnterpriseNumber TEXT NOT NULL, Detail TEXT NOT NULL
    );
  `);
}

/** Index secondaires, créés après le chargement en masse d'un fichier complet. */
export function creerIndex(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_enterprise_forme ON enterprise (JuridicalForm);
    CREATE INDEX IF NOT EXISTS ix_enterprise_debut ON enterprise (StartDateIso);
    CREATE INDEX IF NOT EXISTS ix_establishment_enterprise ON establishment (EnterpriseNumber);
    CREATE INDEX IF NOT EXISTS ix_denomination_entite ON denomination (EntityNumber);
    CREATE INDEX IF NOT EXISTS ix_address_cp ON address (Zipcode);
    CREATE INDEX IF NOT EXISTS ix_address_commune ON address (MunicipalityNorm);
    CREATE INDEX IF NOT EXISTS ix_contact_entite ON contact (EntityNumber);
    CREATE INDEX IF NOT EXISTS ix_activity_entite ON activity (EntityNumber);
    CREATE INDEX IF NOT EXISTS ix_activity_nace ON activity (NaceCode);
    CREATE INDEX IF NOT EXISTS ix_changement_date ON changement (Date);
  `);
}
