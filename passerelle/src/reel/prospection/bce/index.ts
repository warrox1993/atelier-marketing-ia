// Lecture de l'index BCE local (lot P3) : recherche, fiche d'une entité, journal des changements.
// L'index est ouvert en LECTURE SEULE. Si l'importation complète le remplace (renommage), la prochaine requête le rouvre.

import { existsSync, statSync } from "node:fs";
import Database from "better-sqlite3";
import { normaliser } from "../commun.js";
import { lireMetaIndex } from "./importer.js";

export const TAILLE_PAGE = 10;

export interface FiltreZone {
  communes?: string[] | undefined;
  codes_postaux?: string[] | undefined;
  provinces?: string[] | undefined;
  regions?: string[] | undefined;
  pays?: string[] | undefined;
}

export interface FiltreRecherche extends FiltreZone {
  nace?: string[] | undefined;
  formes?: string[] | undefined;
  /** Date ISO : date de début postérieure ou égale. */
  creees_depuis?: string | null | undefined;
  page?: number | undefined;
}

export interface FiltreChangements extends FiltreZone {
  depuis: string;
  nace?: string[] | undefined;
  page?: number | undefined;
}

const dateBce = (iso: string): string => (iso === "" ? "" : `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`);
export const pointNace = (c: string): string => (c.length > 2 ? `${c.slice(0, 2)}.${c.slice(2)}` : c);

interface Condition {
  sql: string;
  params: unknown[];
}

const vide = (v: readonly unknown[] | undefined): v is undefined => v === undefined || v.length === 0;

/** Conditions de zone sur une ligne d'adresse `d` : les critères donnés se cumulent (ET) sur la MÊME adresse. */
function conditionsZone(z: FiltreZone): Condition {
  const morceaux: string[] = [];
  const params: unknown[] = [];
  const dans = (colonne: string, valeurs: readonly string[] | undefined): void => {
    if (vide(valeurs)) return;
    morceaux.push(`${colonne} IN (${valeurs.map(() => "?").join(", ")})`);
    params.push(...valeurs);
  };
  dans("d.MunicipalityNorm", z.communes?.map(normaliser));
  dans("d.Zipcode", z.codes_postaux);
  dans("d.ProvinceNorm", z.provinces?.map(normaliser));
  dans("d.Region", z.regions);
  dans("d.CountryIso", z.pays?.map((p) => p.toUpperCase()));
  return { sql: morceaux.join(" AND "), params };
}

const zoneDonnee = (z: FiltreZone): boolean => conditionsZone(z).sql !== "";

/** Clause `e.EnterpriseNumber IN (…)` : siège OU l'une des unités d'établissement dans la zone (adresses REGO et BAET). */
function clauseZone(z: FiltreZone): Condition | null {
  const c = conditionsZone(z);
  if (c.sql === "") return null;
  return {
    sql:
      `e.EnterpriseNumber IN (` +
      `SELECT d.EntityNumber FROM address d WHERE d.TypeOfAddress IN ('REGO', 'BAET') AND ${c.sql} ` +
      `UNION SELECT s.EnterpriseNumber FROM address d JOIN establishment s ON s.EstablishmentNumber = d.EntityNumber WHERE d.TypeOfAddress IN ('REGO', 'BAET') AND ${c.sql})`,
    params: [...c.params, ...c.params],
  };
}

function clauseNace(nace: readonly string[] | undefined): Condition | null {
  if (vide(nace)) return null;
  const prefixes = nace.map((n) => n.replace(".", ""));
  // Versions 2008 et 2025 seulement (la 2003, encore présente dans le fichier, donne des faux positifs : « 62 » y est du transport aérien) ;
  // activités de l'entreprise OU de l'une de ses unités d'établissement, comme pour la zone.
  const motif = (a: string): string => `${a}NaceVersion IN ('2008', '2025') AND (${prefixes.map(() => `${a}NaceCode LIKE ?`).join(" OR ")})`;
  const like = prefixes.map((p) => `${p}%`);
  return {
    sql:
      `e.EnterpriseNumber IN (SELECT EntityNumber FROM activity WHERE ${motif("")} ` +
      `UNION SELECT s.EnterpriseNumber FROM activity a JOIN establishment s ON s.EstablishmentNumber = a.EntityNumber WHERE ${motif("a.")})`,
    params: [...like, ...like],
  };
}

function assembler(conditions: (Condition | null)[]): Condition {
  const retenues = conditions.filter((c): c is Condition => c !== null);
  return { sql: retenues.length === 0 ? "1 = 1" : retenues.map((c) => c.sql).join(" AND "), params: retenues.flatMap((c) => c.params) };
}

export interface PageResultats<T> {
  total: number;
  page: number;
  taille_page: number;
  pages: number;
  elements: T[];
}

export class IndexBce {
  private db: Database.Database | null = null;
  private inode = -1;
  private libelles = new Map<string, string | null>();

  constructor(readonly chemin: string) {}

  /** Vrai si un index complet est présent (une extraction a été importée). */
  disponible(): boolean {
    if (!existsSync(this.chemin)) return false;
    try {
      return this.ouvrir().prepare("SELECT 1 FROM meta WHERE Variable = 'SnapshotDate'").get() !== undefined;
    } catch {
      return false;
    }
  }

  private ouvrir(): Database.Database {
    const ino = statSync(this.chemin).ino;
    if (this.db === null || ino !== this.inode) {
      this.db?.close();
      this.db = new Database(this.chemin, { readonly: true, fileMustExist: true });
      this.db.pragma("busy_timeout = 30000");
      this.inode = ino;
      this.libelles = new Map();
    }
    return this.db;
  }

  fermer(): void {
    this.db?.close();
    this.db = null;
  }

  meta(): Record<string, string> {
    return lireMetaIndex(this.ouvrir());
  }

  private libelle(categorie: string, code: string): string | null {
    const cle = `${categorie}|${code}`;
    if (!this.libelles.has(cle)) {
      const l = this.ouvrir().prepare("SELECT Description FROM code WHERE Category = ? AND Code = ? AND Language = 'FR'").get(categorie, code) as { Description: string } | undefined;
      this.libelles.set(cle, l?.Description ?? null);
    }
    return this.libelles.get(cle) ?? null;
  }

  // --- Recherche -------------------------------------------------------------------------------------------------

  rechercher(f: FiltreRecherche): PageResultats<Record<string, unknown>> & { filtres_zone: boolean } {
    const db = this.ouvrir();
    const formes: Condition | null = vide(f.formes) ? null : { sql: `e.JuridicalForm IN (${f.formes.map(() => "?").join(", ")})`, params: [...f.formes] };
    const depuis: Condition | null = f.creees_depuis ? { sql: "e.StartDateIso >= ?", params: [f.creees_depuis] } : null;
    const where = assembler([clauseNace(f.nace), clauseZone(f), formes, depuis]);
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM enterprise e WHERE ${where.sql}`).get(...where.params) as { n: number }).n;
    const page = f.page ?? 1;
    const numeros = db
      .prepare(`SELECT e.EnterpriseNumber AS n FROM enterprise e WHERE ${where.sql} ORDER BY e.EnterpriseNumber LIMIT ? OFFSET ?`)
      .all(...where.params, TAILLE_PAGE, (page - 1) * TAILLE_PAGE) as { n: string }[];
    return {
      total, page, taille_page: TAILLE_PAGE, pages: Math.max(1, Math.ceil(total / TAILLE_PAGE)),
      elements: numeros.map((x) => this.entite(x.n)!), filtres_zone: zoneDonnee(f),
    };
  }

  // --- Fiches --------------------------------------------------------------------------------------------------------

  private adresses(entite: string): Record<string, string>[] {
    const lignes = this.ouvrir().prepare("SELECT TypeOfAddress, CountryFR, Zipcode, MunicipalityFR, StreetFR, HouseNumber, Box FROM address WHERE EntityNumber = ? ORDER BY TypeOfAddress").all(entite) as Record<string, string>[];
    return lignes;
  }

  private activites(entite: string): Record<string, string>[] {
    const lignes = this.ouvrir()
      .prepare("SELECT ActivityGroup, NaceVersion, NaceCode, Classification FROM activity WHERE EntityNumber = ? ORDER BY NaceVersion, CASE Classification WHEN 'MAIN' THEN 0 ELSE 1 END, NaceCode")
      .all(entite) as Record<string, string>[];
    return lignes.map((a) => ({ ...a, Libelle: this.libelle(`Nace${a["NaceVersion"]}`, a["NaceCode"]!) ?? a["NaceCode"]! }));
  }

  /** Entreprise complète, à la forme des fichiers de la BCE (comme le simulateur) ; `null` si absente de l'index. */
  entite(numero: string): Record<string, unknown> | null {
    const db = this.ouvrir();
    const e = db.prepare("SELECT * FROM enterprise WHERE EnterpriseNumber = ?").get(numero) as Record<string, string> | undefined;
    if (!e) return null;
    const etablissements = db.prepare("SELECT EstablishmentNumber, StartDate, EnterpriseNumber FROM establishment WHERE EnterpriseNumber = ? ORDER BY EstablishmentNumber").all(numero) as Record<string, string>[];
    return {
      EnterpriseNumber: e["EnterpriseNumber"],
      Status: e["Status"],
      JuridicalSituation: e["JuridicalSituation"],
      TypeOfEnterprise: e["TypeOfEnterprise"],
      JuridicalForm: e["JuridicalForm"],
      JuridicalFormLibelle: this.libelle("JuridicalForm", e["JuridicalForm"]!) ?? e["JuridicalForm"],
      StartDate: e["StartDate"],
      denominations: db.prepare("SELECT Language, TypeOfDenomination, Denomination FROM denomination WHERE EntityNumber = ? ORDER BY TypeOfDenomination, Language, Denomination").all(numero),
      adresses: this.adresses(numero),
      activites: this.activites(numero),
      contacts: db.prepare("SELECT EntityContact, ContactType, Value FROM contact WHERE EntityNumber = ? ORDER BY ContactType, Value").all(numero),
      etablissements: etablissements.map((s) => ({ ...s, adresses: this.adresses(s["EstablishmentNumber"]!), activites: this.activites(s["EstablishmentNumber"]!) })),
    };
  }

  /** Unité d'établissement, à la forme du simulateur ; `null` si absente. */
  etablissement(numero: string): Record<string, unknown> | null {
    const s = this.ouvrir().prepare("SELECT EstablishmentNumber, StartDate, EnterpriseNumber FROM establishment WHERE EstablishmentNumber = ?").get(numero) as Record<string, string> | undefined;
    return s ? { ...s, adresses: this.adresses(numero), activites: this.activites(numero) } : null;
  }

  // --- Changements -----------------------------------------------------------------------------------------------------

  /** Code NACE (version 2008 de préférence) d'une entreprise, avec point, pour enrichir un événement. */
  private naceDe(numero: string): string[] {
    const db = this.ouvrir();
    const v2008 = db.prepare("SELECT DISTINCT NaceCode FROM activity WHERE EntityNumber = ? AND NaceVersion = '2008' ORDER BY NaceCode").all(numero) as { NaceCode: string }[];
    const lignes = v2008.length > 0 ? v2008 : (db.prepare("SELECT DISTINCT NaceCode FROM activity WHERE EntityNumber = ? ORDER BY NaceCode").all(numero) as { NaceCode: string }[]);
    return lignes.map((l) => pointNace(l.NaceCode));
  }

  changements(f: FiltreChangements): PageResultats<Record<string, unknown>> & { journal_depuis: string | null } {
    const db = this.ouvrir();
    const filtre = assembler([clauseNace(f.nace), clauseZone(f)]);
    // Une radiation ne porte que le numéro (l'entreprise a quitté l'index) : elle reste toujours listée.
    const sql = `FROM changement c LEFT JOIN enterprise e ON e.EnterpriseNumber = c.EnterpriseNumber WHERE c.Date >= ? AND (c.Type = 'radiation' OR (e.EnterpriseNumber IS NOT NULL AND ${filtre.sql}))`;
    const params = [f.depuis, ...filtre.params];
    const total = (db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...params) as { n: number }).n;
    const page = f.page ?? 1;
    const lignes = db
      .prepare(`SELECT c.Date, c.Type, c.EnterpriseNumber, c.Detail ${sql} ORDER BY c.Date, c.EnterpriseNumber, c.Id LIMIT ? OFFSET ?`)
      .all(...params, TAILLE_PAGE, (page - 1) * TAILLE_PAGE) as { Date: string; Type: string; EnterpriseNumber: string; Detail: string }[];
    const meta = lireMetaIndex(db);
    return {
      total, page, taille_page: TAILLE_PAGE, pages: Math.max(1, Math.ceil(total / TAILLE_PAGE)),
      journal_depuis: meta["JournalDepuis"] ?? null,
      elements: lignes.map((l) => ({
        date: l.Date, type: l.Type, EnterpriseNumber: l.EnterpriseNumber, ...(JSON.parse(l.Detail) as Record<string, unknown>),
        ...(l.Type !== "radiation" ? { nace: this.naceDe(l.EnterpriseNumber) } : {}),
      })),
    };
  }

  /** Date de l'extraction au format des fichiers (JJ-MM-AAAA). */
  dateExtractionBce(): string {
    return dateBce(this.meta()["SnapshotDate"] ?? "");
  }
}
