// Importation de la BCE Open Data dans l'index SQLite local (lot P3) : fichier complet, puis mises à jour.
//
//   - Fichier complet (ZIP de CSV : meta, code, enterprise, establishment, denomination, address, contact, activity) :
//     lecture en flux, chargement dans un fichier SQLite NEUF, puis remplacement atomique de l'index (rename). Le journal des
//     changements de l'ancien index est conservé.
//   - Mise à jour (ZIP de `<table>_delete.csv` et `<table>_insert.csv`) : appliquée dans UNE transaction, suppressions puis
//     insertions. Rejouer la même mise à jour ne change rien (idempotence). Un trou dans la numérotation des extractions est
//     refusé (une mise à jour manquée ferait perdre des changements) sauf demande explicite.
//
// RÈGLE DE CONFORMITÉ : une entité n'est chargée que si `TypeOfEnterprise` vaut « 2 » (personne morale). Liste blanche : toute
// autre valeur (« 1 » = personne physique, valeur inconnue, vide) est ignorée, ainsi que ses établissements, dénominations,
// adresses, contacts et activités. Un numéro qui change de nature dans une mise à jour est purgé de l'index.
//
// Niveau de preuve : formats PROBABLES (voir schema.ts). Valeurs de TypeOfEnterprise : « 2 » = personne morale d'après
// le fichier de codes de la BCE (à confirmer sur le guide officiel) ; la démonstration P2 utilise la même valeur.

import { existsSync, renameSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { lireCsv, type LigneCsv } from "../csv.js";
import { normaliser, paysIso, synchroniserFichier, zoneDuCodePostal } from "../commun.js";
import { ouvrirZip, type ArchiveZip } from "../zip.js";
import { FICHIERS_COMPLETS_OBLIGATOIRES, TABLES, creerIndex, creerTables, VERSION_SCHEMA, type SpecTable } from "./schema.js";

export const TYPE_PERSONNE_MORALE = "2";

export interface OptionsImport {
  /** Autorise une mise à jour dont le numéro d'extraction saute des valeurs (à n'utiliser qu'en connaissance de cause). */
  autoriserTrou?: boolean;
  /** Réapplique une mise à jour déjà appliquée (la réapplication ne change rien : idempotence). */
  forcer?: boolean;
  /** Durée de conservation du journal des changements, en jours avant la date de l'extraction (400 par défaut). */
  conservationJours?: number;
  journal?: (message: string) => void;
}

export interface CompteursFichier {
  lues: number;
  retenues: number;
  /** Entités de type personne physique (ou de type inconnu) refusées : fichier `enterprise` seulement. */
  personnes_physiques: number;
  /** Lignes dont l'entité n'est pas dans l'index (établissements, adresses… de personnes physiques, orphelins). */
  hors_perimetre: number;
  invalides: number;
}

export interface InfoExtraction {
  numero: number | null;
  date: string;
  horodatage: string | null;
  version: string | null;
}

export interface RapportImport {
  type: "complet" | "mise_a_jour";
  statut: "applique" | "deja_appliquee";
  extraction: InfoExtraction;
  fichiers: Record<string, CompteursFichier>;
  evenements: number;
  /** Entreprises supprimées de l'index (radiations, ou passage au type personne physique). */
  purgees: number;
  avertissements: string[];
}

const compteurVide = (): CompteursFichier => ({ lues: 0, retenues: 0, personnes_physiques: 0, hors_perimetre: 0, invalides: 0 });
const JOURS_CONSERVATION_PAR_DEFAUT = 400;

// --- Valeurs ------------------------------------------------------------------------------------------------------

/** « 0123456789 », « 0123.456.789 », « BE0123.456.789 » → « 0123.456.789 » ; unité d'établissement → « 2.123.456.789 ». Sinon `null`. */
export function normaliserNumeroBce(brut: string): string | null {
  const chiffres = brut.replace(/^BE\s*/i, "").replace(/\D/g, "");
  if (chiffres.length !== 10) return null;
  if (chiffres[0] === "0" || chiffres[0] === "1") return `${chiffres.slice(0, 4)}.${chiffres.slice(4, 7)}.${chiffres.slice(7)}`;
  if (chiffres[0] === "2") return `${chiffres[0]}.${chiffres.slice(1, 4)}.${chiffres.slice(4, 7)}.${chiffres.slice(7)}`;
  return null;
}

/** « 31-12-2026 » (format des fichiers) → « 2026-12-31 » ; date civile invalide ou vide → `null`. */
export function dateIsoDeBce(brut: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(brut.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

const COLONNES_NUMERO = ["EnterpriseNumber", "EstablishmentNumber", "EntityNumber"] as const;

type Parametres = Record<string, string>;

/** Prépare les paramètres SQL d'une ligne CSV, ou le motif de rejet. */
export function preparerLigne(spec: SpecTable, ligne: LigneCsv): { params: Parametres } | { rejet: string } {
  const params: Parametres = {};
  for (const col of spec.colonnes) params[col] = (ligne[col] ?? "").trim();
  for (const col of COLONNES_NUMERO) {
    if (!(col in params)) continue;
    const n = normaliserNumeroBce(params[col]!);
    if (n === null) return { rejet: "numero_invalide" };
    params[col] = n;
  }
  if ("StartDate" in params) {
    const iso = params["StartDate"] === "" ? "" : dateIsoDeBce(params["StartDate"]!);
    if (iso === null) return { rejet: "date_invalide" };
    params["StartDateIso"] = iso;
  }
  if (spec.table === "address") {
    const pays = params["CountryFR"] !== "" ? params["CountryFR"]! : params["CountryNL"]!;
    const iso = paysIso(pays, normaliser) ?? "";
    const zone = iso === "BE" ? zoneDuCodePostal(params["Zipcode"]) : null;
    params["MunicipalityNorm"] = normaliser(params["MunicipalityFR"] !== "" ? params["MunicipalityFR"]! : params["MunicipalityNL"]!);
    params["ProvinceNorm"] = zone?.province ? normaliser(zone.province) : "";
    params["Region"] = zone?.region ?? "";
    params["CountryIso"] = iso;
  }
  return { params };
}

function colonnesStockees(spec: SpecTable): string[] {
  const derivees: string[] = [];
  if (spec.colonnes.includes("StartDate")) derivees.push("StartDateIso");
  if (spec.table === "address") derivees.push("MunicipalityNorm", "ProvinceNorm", "Region", "CountryIso");
  return [...spec.colonnes, ...derivees];
}

/** Instruction d'insertion avec liste blanche : l'entité doit déjà être une personne morale de l'index. */
function sqlInsertion(spec: SpecTable): string {
  const cols = colonnesStockees(spec);
  const liste = cols.join(", ");
  const valeurs = cols.map((c) => `@${c}`).join(", ");
  if (spec.nature === "entreprise") return `INSERT OR REPLACE INTO ${spec.table} (${liste}) VALUES (${valeurs})`;
  const garde =
    spec.nature === "etablissement"
      ? "EXISTS (SELECT 1 FROM enterprise WHERE EnterpriseNumber = @EnterpriseNumber)"
      : "(EXISTS (SELECT 1 FROM enterprise WHERE EnterpriseNumber = @EntityNumber) OR EXISTS (SELECT 1 FROM establishment WHERE EstablishmentNumber = @EntityNumber))";
  return `INSERT OR REPLACE INTO ${spec.table} (${liste}) SELECT ${valeurs} WHERE ${garde}`;
}

class Inserteur {
  private readonly requetes = new Map<string, Database.Statement>();

  constructor(private readonly db: Database.Database) {}

  /** Insère une ligne selon la liste blanche. Renvoie le sort de la ligne pour les compteurs. */
  inserer(spec: SpecTable, ligne: LigneCsv, c: CompteursFichier): void {
    c.lues++;
    const p = preparerLigne(spec, ligne);
    if ("rejet" in p) {
      c.invalides++;
      return;
    }
    if (spec.nature === "entreprise" && p.params["TypeOfEnterprise"] !== TYPE_PERSONNE_MORALE) {
      c.personnes_physiques++;
      return;
    }
    let r = this.requetes.get(spec.table);
    if (!r) {
      r = this.db.prepare(sqlInsertion(spec));
      this.requetes.set(spec.table, r);
    }
    const resultat = r.run(p.params);
    if (resultat.changes > 0) c.retenues++;
    else c.hors_perimetre++;
  }
}

// --- Méta ---------------------------------------------------------------------------------------------------------

async function lireMetaZip(zip: ArchiveZip): Promise<Record<string, string>> {
  const { lignes } = await lireCsv(await zip.ouvrir("meta.csv"));
  const meta: Record<string, string> = {};
  for await (const l of lignes) if (l["Variable"]) meta[l["Variable"].trim()] = (l["Value"] ?? "").trim();
  return meta;
}

/** Date de l'extraction : « SnapshotDate » du fichier meta (format JJ-MM-AAAA, ou ISO à défaut). */
function infoExtraction(meta: Record<string, string>, nomArchive: string): InfoExtraction {
  const brute = meta["SnapshotDate"] ?? "";
  const date = dateIsoDeBce(brute) ?? (/^\d{4}-\d{2}-\d{2}$/.test(brute) ? brute : null);
  if (date === null) throw new Error(`meta.csv de ${nomArchive} : SnapshotDate absente ou illisible (« ${brute} »).`);
  const depuisNom = /KboOpenData_(\d{4})_/i.exec(nomArchive);
  const numeroMeta = meta["ExtractNumber"] !== undefined && /^\d+$/.test(meta["ExtractNumber"]) ? Number(meta["ExtractNumber"]) : null;
  return { numero: numeroMeta ?? (depuisNom ? Number(depuisNom[1]) : null), date, horodatage: meta["ExtractTimestamp"] ?? null, version: meta["Version"] ?? null };
}

function ecrireMeta(db: Database.Database, type: "full" | "update", info: InfoExtraction): void {
  const ecrire = db.prepare("INSERT OR REPLACE INTO meta (Variable, Value) VALUES (?, ?)");
  ecrire.run("SnapshotDate", info.date);
  ecrire.run("ExtractType", type);
  if (info.numero !== null) ecrire.run("ExtractNumber", String(info.numero));
  if (info.horodatage !== null) ecrire.run("ExtractTimestamp", info.horodatage);
  if (info.version !== null) ecrire.run("CbeVersion", info.version);
  ecrire.run("DateImport", new Date().toISOString());
  ecrire.run("SchemaVersion", String(VERSION_SCHEMA));
}

export function lireMetaIndex(db: Database.Database): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const l of db.prepare("SELECT Variable, Value FROM meta").all() as { Variable: string; Value: string }[]) meta[l.Variable] = l.Value;
  return meta;
}

// --- Contrôles d'en-tête ------------------------------------------------------------------------------------------

function verifierEntete(spec: SpecTable, entete: readonly string[], nomFichier: string): void {
  const manquantes = spec.obligatoires.filter((c) => !entete.includes(c));
  if (manquantes.length > 0) {
    throw new Error(`${nomFichier} : colonne(s) obligatoire(s) absente(s) de l'en-tête : ${manquantes.join(", ")}. Le format a peut-être changé : comparer avec le guide officiel de la BCE.`);
  }
}

// --- Fichier complet ----------------------------------------------------------------------------------------------

function supprimerFichierSqlite(chemin: string): void {
  for (const suffixe of ["", "-journal", "-wal", "-shm"]) rmSync(`${chemin}${suffixe}`, { force: true });
}

function ajouterJours(dateIso: string, jours: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00.000Z`) + jours * 86_400_000).toISOString().slice(0, 10);
}

async function chargerCode(db: Database.Database, zip: ArchiveZip): Promise<void> {
  const { entete, lignes } = await lireCsv(await zip.ouvrir("code.csv"));
  for (const c of ["Category", "Code", "Language", "Description"]) if (!entete.includes(c)) throw new Error(`code.csv : colonne absente de l'en-tête : ${c}.`);
  const ecrire = db.prepare("INSERT OR REPLACE INTO code (Category, Code, Language, Description) VALUES (?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM code");
    for await (const l of lignes) ecrire.run((l["Category"] ?? "").trim(), (l["Code"] ?? "").trim(), (l["Language"] ?? "").trim(), l["Description"] ?? "");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * Importe un fichier complet de la BCE dans l'index `cheminIndex` (créé ou remplacé de façon atomique).
 * Le journal des changements d'un index existant est repris dans le nouveau.
 */
export async function importerComplet(cheminZip: string, cheminIndex: string, options: OptionsImport = {}): Promise<RapportImport> {
  const journal = options.journal ?? ((): void => undefined);
  const zip = await ouvrirZip(cheminZip);
  const nomArchive = cheminZip.split("/").pop() ?? cheminZip;
  const temporaire = `${cheminIndex}.nouveau-${process.pid}`;
  let db: Database.Database | null = null;
  try {
    const absents = FICHIERS_COMPLETS_OBLIGATOIRES.filter((f) => !zip.noms.includes(f));
    if (absents.length > 0) throw new Error(`${nomArchive} n'est pas un fichier complet de la BCE : fichier(s) absent(s) : ${absents.join(", ")}.`);
    const meta = await lireMetaZip(zip);
    const type = (meta["ExtractType"] ?? "full").toLowerCase();
    if (type !== "full") throw new Error(`${nomArchive} est une extraction de type « ${meta["ExtractType"]} », pas un fichier complet : utiliser la mise à jour.`);
    const info = infoExtraction(meta, nomArchive);

    supprimerFichierSqlite(temporaire);
    db = new Database(temporaire);
    db.pragma("journal_mode = OFF");
    db.pragma("synchronous = OFF");
    creerTables(db);
    await chargerCode(db, zip);

    const inserteur = new Inserteur(db);
    const fichiers: Record<string, CompteursFichier> = {};
    for (const spec of TABLES) {
      const nom = `${spec.fichier}.csv`;
      const { entete, lignes } = await lireCsv(await zip.ouvrir(nom));
      verifierEntete(spec, entete, nom);
      const c = (fichiers[spec.fichier] = compteurVide());
      db.exec("BEGIN");
      try {
        let n = 0;
        for await (const ligne of lignes) {
          inserteur.inserer(spec, ligne, c);
          if (++n % 100_000 === 0) {
            db.exec("COMMIT");
            db.exec("BEGIN");
          }
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      journal(`${nom} : ${c.lues} lignes lues, ${c.retenues} retenues, ${c.personnes_physiques} personnes physiques refusées, ${c.hors_perimetre} hors périmètre.`);
    }
    creerIndex(db);

    // Conservation : le journal des changements de l'ancien index passe dans le nouveau.
    if (existsSync(cheminIndex)) {
      db.exec(`ATTACH DATABASE '${cheminIndex.replace(/'/g, "''")}' AS ancien`);
      try {
        const limite = ajouterJours(info.date, -(options.conservationJours ?? JOURS_CONSERVATION_PAR_DEFAUT));
        const depuis = (db.prepare("SELECT Value FROM ancien.meta WHERE Variable = 'JournalDepuis'").get() as { Value: string } | undefined)?.Value;
        // Seuls les événements d'entreprises encore dans l'index (et les radiations) sont repris : jamais ceux d'une entreprise devenue personne physique.
        db.prepare(
          "INSERT INTO changement (Date, Type, EnterpriseNumber, Detail) SELECT Date, Type, EnterpriseNumber, Detail FROM ancien.changement " +
            "WHERE Date >= ? AND (Type = 'radiation' OR EnterpriseNumber IN (SELECT EnterpriseNumber FROM enterprise)) ORDER BY Id",
        ).run(limite);
        if (depuis) db.prepare("INSERT OR REPLACE INTO meta (Variable, Value) VALUES ('JournalDepuis', ?)").run(depuis);
      } catch (e) {
        // Ancien index illisible ou d'un autre schéma : on repart d'un journal vide, et on le dit.
        journal(`Journal des changements de l'ancien index non repris : ${e instanceof Error ? e.message : "erreur inconnue"}. Le journal repart de l'extraction du ${info.date}.`);
        db.prepare("DELETE FROM changement").run();
      }
      db.exec("DETACH DATABASE ancien");
    }
    if (!db.prepare("SELECT 1 FROM meta WHERE Variable = 'JournalDepuis'").get()) db.prepare("INSERT INTO meta (Variable, Value) VALUES ('JournalDepuis', ?)").run(info.date);
    ecrireMeta(db, "full", info);
    db.close();
    db = null;
    // Remplacement atomique (même dossier, donc même système de fichiers) ; le nouveau fichier est d'abord écrit sur le disque.
    synchroniserFichier(temporaire);
    rmSync(`${cheminIndex}-journal`, { force: true });
    renameSync(temporaire, cheminIndex);
    return { type: "complet", statut: "applique", extraction: info, fichiers, evenements: 0, purgees: 0, avertissements: [] };
  } finally {
    db?.close();
    supprimerFichierSqlite(temporaire);
    zip.fermer();
  }
}

// --- Mise à jour ----------------------------------------------------------------------------------------------------

interface DonneesMiseAJour {
  suppressions: Map<string, { entete: string[]; lignes: LigneCsv[] }>;
  insertions: Map<string, LigneCsv[]>;
}

async function lireMiseAJour(zip: ArchiveZip): Promise<DonneesMiseAJour> {
  const suppressions: DonneesMiseAJour["suppressions"] = new Map();
  const insertions: DonneesMiseAJour["insertions"] = new Map();
  for (const spec of TABLES) {
    for (const sens of ["delete", "insert"] as const) {
      const nom = `${spec.fichier}_${sens}.csv`;
      if (!zip.noms.includes(nom)) continue;
      const { entete, lignes } = await lireCsv(await zip.ouvrir(nom));
      const tout: LigneCsv[] = [];
      for await (const l of lignes) tout.push(l);
      if (sens === "insert") {
        verifierEntete(spec, entete, nom);
        insertions.set(spec.table, tout);
      } else {
        const connues = entete.filter((c) => spec.colonnes.includes(c));
        if (connues.length === 0) throw new Error(`${nom} : aucune colonne reconnue dans l'en-tête (${entete.join(", ")}).`);
        suppressions.set(spec.table, { entete: connues, lignes: tout });
      }
    }
  }
  return { suppressions, insertions };
}

interface Avant {
  existait: boolean;
  forme: string;
  siege: string;
}

const siegeTexte = (db: Database.Database, numero: string): string => {
  const a = db.prepare("SELECT Zipcode, MunicipalityFR, StreetFR, HouseNumber, Box FROM address WHERE EntityNumber = ? AND TypeOfAddress = 'REGO'").get(numero) as
    | { Zipcode: string; MunicipalityFR: string; StreetFR: string; HouseNumber: string; Box: string }
    | undefined;
  return a ? `${a.Zipcode}|${a.MunicipalityFR}|${a.StreetFR}|${a.HouseNumber}|${a.Box}` : "";
};

/** Adresse lisible pour le journal : « 4000 Liège », avec la rue seulement si seule la rue a changé. */
function adresseLisible(texte: string, avecRue: boolean): string {
  const [cp = "", commune = "", rue = "", numero = "", boite = ""] = texte.split("|");
  const base = `${cp} ${commune}`.trim();
  return avecRue ? `${base}, ${[rue, numero, boite ? `bte ${boite}` : ""].filter(Boolean).join(" ")}` : base;
}

function purgerEntreprise(db: Database.Database, numero: string): void {
  const etablissements = (db.prepare("SELECT EstablishmentNumber FROM establishment WHERE EnterpriseNumber = ?").all(numero) as { EstablishmentNumber: string }[]).map((e) => e.EstablishmentNumber);
  for (const entite of [numero, ...etablissements]) for (const t of ["denomination", "address", "contact", "activity"]) db.prepare(`DELETE FROM ${t} WHERE EntityNumber = ?`).run(entite);
  db.prepare("DELETE FROM establishment WHERE EnterpriseNumber = ?").run(numero);
  db.prepare("DELETE FROM enterprise WHERE EnterpriseNumber = ?").run(numero);
  // Le journal des changements ne garde rien d'une entreprise purgée (les radiations sont écrites APRÈS la purge).
  db.prepare("DELETE FROM changement WHERE EnterpriseNumber = ?").run(numero);
}

/** Supprime un établissement et ses données enfants. */
function purgerEtablissement(db: Database.Database, numero: string): void {
  for (const t of ["denomination", "address", "contact", "activity"]) db.prepare(`DELETE FROM ${t} WHERE EntityNumber = ?`).run(numero);
  db.prepare("DELETE FROM establishment WHERE EstablishmentNumber = ?").run(numero);
}

function normaliserSuppression(spec: SpecTable, entete: readonly string[], ligne: LigneCsv): Parametres | null {
  const p: Parametres = {};
  for (const col of entete) {
    const v = (ligne[col] ?? "").trim();
    p[col] = (COLONNES_NUMERO as readonly string[]).includes(col) ? (normaliserNumeroBce(v) ?? "") : v;
    if ((COLONNES_NUMERO as readonly string[]).includes(col) && p[col] === "") return null;
  }
  return spec.colonnes.length > 0 ? p : null;
}

export async function appliquerMiseAJour(cheminZip: string, cheminIndex: string, options: OptionsImport = {}): Promise<RapportImport> {
  const journal = options.journal ?? ((): void => undefined);
  if (!existsSync(cheminIndex)) throw new Error("Aucun index BCE : importer d'abord un fichier complet.");
  const zip = await ouvrirZip(cheminZip);
  const nomArchive = cheminZip.split("/").pop() ?? cheminZip;
  let db: Database.Database | null = null;
  try {
    const meta = await lireMetaZip(zip);
    if ((meta["ExtractType"] ?? "update").toLowerCase() === "full") throw new Error(`${nomArchive} est un fichier complet : utiliser l'importation complète.`);
    const info = infoExtraction(meta, nomArchive);
    db = new Database(cheminIndex, { fileMustExist: true });
    db.pragma("busy_timeout = 30000");
    // Les contenus supprimés (radiations, passage au type personne physique) sont effacés des pages du fichier, pas seulement déréférencés.
    db.pragma("secure_delete = ON");
    const etat = lireMetaIndex(db);
    if (!etat["SnapshotDate"]) throw new Error("Index BCE vide : importer d'abord un fichier complet.");
    const avertissements: string[] = [];
    const vide = (): RapportImport => ({ type: "mise_a_jour", statut: "deja_appliquee", extraction: info, fichiers: {}, evenements: 0, purgees: 0, avertissements });

    const derniereDate = etat["SnapshotDate"]!;
    const dernierNumero = etat["ExtractNumber"] !== undefined ? Number(etat["ExtractNumber"]) : null;
    if (info.date < derniereDate) {
      throw new Error(`Cette mise à jour (extraction du ${info.date}) est plus ancienne que l'index (${derniereDate}) : la rejouer remettrait d'anciennes valeurs. Refusée, même avec --forcer.`);
    }
    if (info.date <= derniereDate && options.forcer !== true) {
      journal(`${nomArchive} : extraction du ${info.date}, déjà appliquée (index à jour au ${derniereDate}). Aucun changement.`);
      return vide();
    }
    if (info.numero !== null && dernierNumero !== null && info.numero > dernierNumero + 1 && options.autoriserTrou !== true) {
      throw new Error(
        `Trou dans les mises à jour : l'index est à l'extraction n° ${dernierNumero}, ce fichier porte le n° ${info.numero}. ` +
          "Des changements ont pu être manqués (les fichiers ne restent que 31 jours sur le portail). Importer un nouveau fichier complet, ou forcer avec --autoriser-trou.",
      );
    }
    if (info.numero !== null && dernierNumero !== null && info.numero <= dernierNumero) avertissements.push(`Numéro d'extraction ${info.numero} non supérieur à celui de l'index (${dernierNumero}) alors que la date est plus récente : numérotation à vérifier.`);

    const donnees = await lireMiseAJour(zip);
    const codeLu = zip.noms.includes("code.csv");
    const nouveauxCodes: string[][] = [];
    if (codeLu) {
      const { lignes } = await lireCsv(await zip.ouvrir("code.csv"));
      for await (const l of lignes) nouveauxCodes.push([(l["Category"] ?? "").trim(), (l["Code"] ?? "").trim(), (l["Language"] ?? "").trim(), l["Description"] ?? ""]);
    }

    const fichiers: Record<string, CompteursFichier> = {};
    const base = db;
    let evenements = 0;
    let purgees = 0;
    const limiteConservation = ajouterJours(info.date, -(options.conservationJours ?? JOURS_CONSERVATION_PAR_DEFAUT));

    base.transaction(() => {
      // 1. Entreprises concernées et état avant.
      const concernees = new Set<string>();
      for (const l of donnees.insertions.get("enterprise") ?? []) {
        const n = normaliserNumeroBce(l["EnterpriseNumber"] ?? "");
        if (n) concernees.add(n);
      }
      for (const l of donnees.suppressions.get("enterprise")?.lignes ?? []) {
        const n = normaliserNumeroBce(l["EnterpriseNumber"] ?? "");
        if (n) concernees.add(n);
      }
      for (const [table, lignes] of [...[...donnees.insertions].map(([t, l]) => [t, l] as const), ...[...donnees.suppressions].map(([t, s]) => [t, s.lignes] as const)]) {
        if (table !== "address") continue;
        for (const l of lignes) {
          const n = normaliserNumeroBce(l["EntityNumber"] ?? "");
          if (n && !n.startsWith("2")) concernees.add(n);
        }
      }
      const avant = new Map<string, Avant>();
      for (const n of concernees) {
        const e = base.prepare("SELECT JuridicalForm FROM enterprise WHERE EnterpriseNumber = ?").get(n) as { JuridicalForm: string } | undefined;
        avant.set(n, { existait: e !== undefined, forme: e?.JuridicalForm ?? "", siege: siegeTexte(base, n) });
      }
      const etablissementsAvant = new Set<string>();
      for (const l of donnees.insertions.get("establishment") ?? []) {
        const n = normaliserNumeroBce(l["EstablishmentNumber"] ?? "");
        if (n && base.prepare("SELECT 1 FROM establishment WHERE EstablishmentNumber = ?").get(n)) etablissementsAvant.add(n);
      }
      const etablissementsSupprimes = new Set<string>();

      // 2. Suppressions (les tables enfants d'abord, puis l'entreprise seule : la purge des radiées vient à la fin).
      for (const spec of [...TABLES].reverse()) {
        const s = donnees.suppressions.get(spec.table);
        if (!s) continue;
        const c = (fichiers[`${spec.fichier}_delete`] = compteurVide());
        for (const l of s.lignes) {
          c.lues++;
          const p = normaliserSuppression(spec, s.entete, l);
          if (!p) {
            c.invalides++;
            continue;
          }
          const cols = Object.keys(p);
          const r = base.prepare(`DELETE FROM ${spec.table} WHERE ${cols.map((col) => `${col} = @${col}`).join(" AND ")}`).run(p);
          if (r.changes > 0) c.retenues++;
          else c.hors_perimetre++;
          if (spec.table === "establishment" && p["EstablishmentNumber"]) etablissementsSupprimes.add(p["EstablishmentNumber"]);
        }
      }

      // 3. Insertions (les entreprises d'abord : la liste blanche des tables suivantes en dépend).
      const inserteur = new Inserteur(base);
      const naturelles = new Set<string>();
      for (const spec of TABLES) {
        const lignes = donnees.insertions.get(spec.table);
        if (!lignes) continue;
        const c = (fichiers[`${spec.fichier}_insert`] = compteurVide());
        for (const l of lignes) {
          if (spec.nature === "entreprise" && (l["TypeOfEnterprise"] ?? "").trim() !== TYPE_PERSONNE_MORALE) {
            const n = normaliserNumeroBce(l["EnterpriseNumber"] ?? "");
            if (n) naturelles.add(n);
          }
          inserteur.inserer(spec, l, c);
        }
      }

      // 3 bis. Établissement dont l'entreprise n'est pas dans l'index (personne physique ou inconnue) : jamais gardé, même s'il existait avant.
      for (const l of donnees.insertions.get("establishment") ?? []) {
        const num = normaliserNumeroBce(l["EstablishmentNumber"] ?? "");
        const ent = normaliserNumeroBce(l["EnterpriseNumber"] ?? "");
        if (num && (!ent || !base.prepare("SELECT 1 FROM enterprise WHERE EnterpriseNumber = ?").get(ent))) purgerEtablissement(base, num);
      }

      // 4. Un numéro devenu personne physique est purgé de l'index (jamais conservé).
      // (La suppression de la ligne entreprise a pu précéder : on purge toujours, car ses établissements et données
      // enfants sont encore là.)
      for (const n of naturelles) {
        purgerEntreprise(base, n);
        if (avant.get(n)?.existait) purgees++;
      }

      // 5. Entreprises supprimées et non réinsérées : radiation, purge de leurs établissements et de leurs données.
      const ecrireEvenement = base.prepare("INSERT INTO changement (Date, Type, EnterpriseNumber, Detail) VALUES (?, ?, ?, ?)");
      const radiations: string[] = [];
      for (const n of concernees) {
        const a = avant.get(n)!;
        const existeMaintenant = base.prepare("SELECT 1 FROM enterprise WHERE EnterpriseNumber = ?").get(n) !== undefined;
        if (a.existait && !existeMaintenant && !naturelles.has(n)) radiations.push(n);
      }
      for (const n of radiations) {
        purgerEntreprise(base, n);
        purgees++;
        ecrireEvenement.run(info.date, "radiation", n, "{}");
        evenements++;
      }
      // Établissements supprimés et non réinsérés : leurs données enfants disparaissent aussi.
      for (const e of etablissementsSupprimes) {
        if (!base.prepare("SELECT 1 FROM establishment WHERE EstablishmentNumber = ?").get(e)) for (const t of ["denomination", "address", "contact", "activity"]) base.prepare(`DELETE FROM ${t} WHERE EntityNumber = ?`).run(e);
      }

      // 6. Événements : création, changement de forme, d'adresse, nouvel établissement.
      const denominationPrincipale = base.prepare("SELECT Denomination FROM denomination WHERE EntityNumber = ? ORDER BY CASE TypeOfDenomination WHEN '001' THEN 0 ELSE 1 END, Language, Denomination LIMIT 1");
      const nouvelles = new Set<string>();
      for (const n of [...concernees].sort()) {
        const a = avant.get(n)!;
        const e = base.prepare("SELECT JuridicalForm FROM enterprise WHERE EnterpriseNumber = ?").get(n) as { JuridicalForm: string } | undefined;
        if (!e) continue;
        const siege = siegeTexte(base, n);
        if (!a.existait) {
          nouvelles.add(n);
          const adr = base.prepare("SELECT Zipcode, MunicipalityFR FROM address WHERE EntityNumber = ? AND TypeOfAddress = 'REGO'").get(n) as { Zipcode: string; MunicipalityFR: string } | undefined;
          const d = denominationPrincipale.get(n) as { Denomination: string } | undefined;
          ecrireEvenement.run(info.date, "creation", n, JSON.stringify({ denomination: d?.Denomination ?? "", commune: adr?.MunicipalityFR ?? "", codePostal: adr?.Zipcode ?? "" }));
          evenements++;
          continue;
        }
        if (a.forme !== e.JuridicalForm) {
          ecrireEvenement.run(info.date, "changement_forme", n, JSON.stringify({ de: a.forme, vers: e.JuridicalForm }));
          evenements++;
        }
        if (a.siege !== "" && siege !== "" && a.siege !== siege) {
          const memeVille = adresseLisible(a.siege, false) === adresseLisible(siege, false);
          ecrireEvenement.run(info.date, "changement_adresse", n, JSON.stringify({ de: adresseLisible(a.siege, memeVille), vers: adresseLisible(siege, memeVille) }));
          evenements++;
        }
      }
      for (const l of donnees.insertions.get("establishment") ?? []) {
        const num = normaliserNumeroBce(l["EstablishmentNumber"] ?? "");
        const ent = normaliserNumeroBce(l["EnterpriseNumber"] ?? "");
        if (!num || !ent || etablissementsAvant.has(num) || nouvelles.has(ent)) continue;
        if (!base.prepare("SELECT 1 FROM establishment WHERE EstablishmentNumber = ?").get(num)) continue;
        const adr = base.prepare("SELECT Zipcode, MunicipalityFR FROM address WHERE EntityNumber = ? ORDER BY TypeOfAddress LIMIT 1").get(num) as { Zipcode: string; MunicipalityFR: string } | undefined;
        ecrireEvenement.run(info.date, "nouvel_etablissement", ent, JSON.stringify({ etablissement: num, commune: adr?.MunicipalityFR ?? "", codePostal: adr?.Zipcode ?? "" }));
        evenements++;
      }

      // 7. Codes, conservation du journal, méta.
      if (codeLu) {
        base.prepare("DELETE FROM code").run();
        const ecrireCode = base.prepare("INSERT OR REPLACE INTO code (Category, Code, Language, Description) VALUES (?, ?, ?, ?)");
        for (const c of nouveauxCodes) ecrireCode.run(...c);
      }
      base.prepare("DELETE FROM changement WHERE Date < ?").run(limiteConservation);
      ecrireMeta(base, "update", info);
    })();
    base.close();
    db = null;
    journal(`${nomArchive} : mise à jour du ${info.date} appliquée, ${evenements} événement(s) enregistré(s), ${purgees} entreprise(s) purgée(s).`);
    return { type: "mise_a_jour", statut: "applique", extraction: info, fichiers, evenements, purgees, avertissements };
  } finally {
    db?.close();
    zip.fermer();
  }
}

/** Détecte le type d'une archive (`full` ou `update`) d'après son fichier meta, sinon d'après ses noms de fichiers. */
export async function detecterTypeArchive(cheminZip: string): Promise<"complet" | "mise_a_jour"> {
  const zip = await ouvrirZip(cheminZip);
  try {
    if (zip.noms.includes("meta.csv")) {
      const type = (await lireMetaZip(zip))["ExtractType"]?.toLowerCase();
      if (type === "full") return "complet";
      if (type === "update") return "mise_a_jour";
    }
    return zip.noms.some((n) => n.endsWith("_insert.csv") || n.endsWith("_delete.csv")) ? "mise_a_jour" : "complet";
  } finally {
    zip.fermer();
  }
}
