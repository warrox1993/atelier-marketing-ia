// Importation des jeux de données ouverts de Statbel dans l'index local `statbel.sqlite` (hors dépôt).
// Quatre sources, toutes lues dans des fichiers TXT (séparateur « | ») que le script `scripts/statbel-mise-a-jour.sh` télécharge :
//   - population par commune, sexe, âge et nationalité (Statbel, CC BY 4.0) ;
//   - statistiques fiscales des revenus par commune (Statbel, CC BY 4.0) ;
//   - assujettis à la TVA par commune et section d'activité (Statbel, CC BY 4.0) ;
//   - table code postal → code INS (bpost, via Opendatasoft ; licence propre à bpost, millésime 2021) : table d'aide à la
//     recherche, jamais une donnée statistique.
// L'index est écrit dans un fichier temporaire puis renommé : un lecteur ne voit jamais un index à moitié rempli.

import { createReadStream, existsSync, renameSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { normaliser } from "../../commun/prospection/commun.js";

export const VERSION_SCHEMA = "1";

const SCHEMA = `
CREATE TABLE meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
CREATE TABLE communes (refnis TEXT PRIMARY KEY, nom_fr TEXT NOT NULL, nom_nl TEXT NOT NULL, nom_fr_norm TEXT NOT NULL, nom_nl_norm TEXT NOT NULL,
  arrondissement TEXT NOT NULL, province TEXT NOT NULL, region TEXT NOT NULL);
CREATE INDEX communes_fr ON communes (nom_fr_norm);
CREATE INDEX communes_nl ON communes (nom_nl_norm);
CREATE TABLE pop_age (refnis TEXT NOT NULL, sexe TEXT NOT NULL, age5 INTEGER NOT NULL, effectif INTEGER NOT NULL, PRIMARY KEY (refnis, sexe, age5)) WITHOUT ROWID;
CREATE TABLE pop_nat (refnis TEXT NOT NULL, nationalite TEXT NOT NULL, effectif INTEGER NOT NULL, PRIMARY KEY (refnis, nationalite)) WITHOUT ROWID;
CREATE TABLE revenus (refnis TEXT NOT NULL, annee INTEGER NOT NULL, declarations INTEGER NOT NULL, declarations_nulles INTEGER NOT NULL,
  revenu_imposable REAL NOT NULL, revenu_net REAL NOT NULL, habitants INTEGER NOT NULL, PRIMARY KEY (refnis, annee)) WITHOUT ROWID;
CREATE TABLE tva (refnis TEXT NOT NULL, section TEXT NOT NULL, libelle TEXT NOT NULL, assujettis INTEGER NOT NULL,
  PRIMARY KEY (refnis, section)) WITHOUT ROWID;
CREATE TABLE codes_postaux (code_postal TEXT NOT NULL, refnis TEXT NOT NULL, PRIMARY KEY (code_postal, refnis)) WITHOUT ROWID;
`;

export interface OptionsImport {
  fichierPopulation: string;
  anneePopulation: number;
  fichierFiscal: string;
  fichierTva: string;
  anneeTva: number;
  fichierCodesPostaux: string;
  /** Chemin de l'index à produire. */
  index: string;
  journal?: (message: string) => void;
  maintenant?: () => Date;
}

export interface BilanImport {
  communes: number;
  anneeRevenus: number;
  revenusSansCommune: string[];
  tvaSansCommune: string[];
  codesPostaux: number;
}

/** Lit un fichier ligne à ligne (séparateur « | »), dans l'encodage donné, sans le charger en entier. */
async function* lignes(chemin: string, encodage: "utf-8" | "windows-1252"): AsyncGenerator<string[]> {
  const decodeur = new TextDecoder(encodage);
  let reste = "";
  let premiere = true;
  const separer = (l: string): string[] => l.split("|");
  for await (const morceau of createReadStream(chemin)) {
    reste += decodeur.decode(morceau as Buffer, { stream: true });
    let i: number;
    while ((i = reste.indexOf("\n")) >= 0) {
      let ligne = reste.slice(0, i).replace(/\r$/u, "");
      reste = reste.slice(i + 1);
      if (premiere) { ligne = ligne.replace(/^(\uFEFF|ï»¿)/u, ""); premiere = false; }
      if (ligne !== "") yield separer(ligne);
    }
  }
  reste += decodeur.decode();
  if (reste.trim() !== "") yield separer(reste.replace(/\r$/u, ""));
}

/** Itère les lignes d'un fichier d'en-tête : chaque ligne est donnée sous forme { COLONNE: valeur }. Colonne absente = erreur claire. */
async function* enregistrements(chemin: string, encodage: "utf-8" | "windows-1252", requises: readonly string[]): AsyncGenerator<Record<string, string>> {
  let entete: string[] | null = null;
  for await (const cols of lignes(chemin, encodage)) {
    if (entete === null) {
      entete = cols;
      const manquantes = requises.filter((c) => !entete!.includes(c));
      if (manquantes.length > 0) throw new Error(`${chemin} : colonnes attendues absentes (${manquantes.join(", ")}) : le format Statbel a changé.`);
      continue;
    }
    const e: Record<string, string> = {};
    for (let i = 0; i < entete.length; i++) e[entete[i]!] = cols[i] ?? "";
    yield e;
  }
  if (entete === null) throw new Error(`${chemin} : fichier vide.`);
}

const masque = (v: string | undefined): boolean => v === undefined || v.trim() === "" || v.trim() === "*";

const entier = (v: string | undefined, contexte: string): number => {
  const n = Number(v);
  if (v === undefined || v.trim() === "" || !Number.isFinite(n)) throw new Error(`Valeur numérique attendue (${contexte}) : « ${v} ».`);
  return n;
};

export async function importerStatbel(o: OptionsImport): Promise<BilanImport> {
  const journal = o.journal ?? ((): void => undefined);
  const temporaire = `${o.index}.import-${process.pid}`;
  rmSync(temporaire, { force: true });
  const db = new Database(temporaire);
  try {
    db.pragma("journal_mode = OFF");
    db.pragma("synchronous = OFF");
    db.exec(SCHEMA);
    const insererCommune = db.prepare("INSERT OR REPLACE INTO communes VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const insererAge = db.prepare("INSERT INTO pop_age VALUES (?, ?, ?, ?) ON CONFLICT (refnis, sexe, age5) DO UPDATE SET effectif = effectif + excluded.effectif");
    const insererNat = db.prepare("INSERT INTO pop_nat VALUES (?, ?, ?) ON CONFLICT (refnis, nationalite) DO UPDATE SET effectif = effectif + excluded.effectif");

    // --- Population ---
    journal("population : lecture…");
    db.exec("BEGIN");
    let ligneN = 0;
    const communesVues = new Set<string>();
    for await (const e of enregistrements(o.fichierPopulation, "utf-8", ["CD_REFNIS", "TX_DESCR_FR", "TX_DESCR_NL", "TX_ADM_DSTR_DESCR_FR", "TX_PROV_DESCR_FR", "TX_RGN_DESCR_FR", "CD_SEX", "CD_NATLTY", "CD_AGE", "MS_POPULATION"])) {
      const refnis = e["CD_REFNIS"]!;
      if (!/^\d{5}$/u.test(refnis)) throw new Error(`Code INS inattendu dans la population : « ${refnis} ».`);
      ligneN++;
      if (!communesVues.has(refnis)) {
        communesVues.add(refnis);
        insererCommune.run(refnis, e["TX_DESCR_FR"], e["TX_DESCR_NL"], normaliser(e["TX_DESCR_FR"]!), normaliser(e["TX_DESCR_NL"]!), e["TX_ADM_DSTR_DESCR_FR"], e["TX_PROV_DESCR_FR"], e["TX_RGN_DESCR_FR"]);
      }
      const effectif = entier(e["MS_POPULATION"], "MS_POPULATION");
      const sexe = e["CD_SEX"]!;
      if (sexe !== "M" && sexe !== "F") throw new Error(`Sexe inattendu : « ${sexe} ».`);
      const age = entier(e["CD_AGE"], "CD_AGE");
      insererAge.run(refnis, sexe, Math.min(Math.floor(age / 5) * 5, 85), effectif);
      insererNat.run(refnis, e["CD_NATLTY"] === "BEL" ? "belge" : "etranger", effectif);
    }
    db.exec("COMMIT");
    if (ligneN === 0 || communesVues.size < 500) throw new Error(`Population : ${communesVues.size} communes seulement, fichier incomplet ou format changé.`);
    journal(`population : ${ligneN} lignes, ${communesVues.size} communes.`);

    // --- Revenus ---
    journal("revenus fiscaux : lecture…");
    const insererRev = db.prepare("INSERT OR REPLACE INTO revenus VALUES (?, ?, ?, ?, ?, ?, ?)");
    const sansCommuneRev = new Set<string>();
    let anneeRevenus = 0;
    db.exec("BEGIN");
    const masques: { annee: number; refnis: string }[] = [];
    for await (const e of enregistrements(o.fichierFiscal, "utf-8", ["CD_YEAR", "CD_MUNTY_REFNIS", "MS_NBR_NON_ZERO_INC", "MS_NBR_ZERO_INC", "MS_TOT_NET_TAXABLE_INC", "MS_TOT_NET_INC", "MS_TOT_RESIDENTS"])) {
      const annee = entier(e["CD_YEAR"], "CD_YEAR");
      const refnis = e["CD_MUNTY_REFNIS"]!;
      // Statbel remplace par « * » les valeurs soumises au secret statistique : la ligne est ignorée (jamais remplacée par 0).
      const valeurs = ["MS_NBR_NON_ZERO_INC", "MS_NBR_ZERO_INC", "MS_TOT_NET_TAXABLE_INC", "MS_TOT_NET_INC", "MS_TOT_RESIDENTS"].map((c) => e[c]!);
      if (annee > anneeRevenus) anneeRevenus = annee;
      if (valeurs.some(masque)) { masques.push({ annee, refnis }); continue; }
      insererRev.run(refnis, annee, ...valeurs.map((v, k) => entier(v, `revenus colonne ${k}`)));
    }
    db.exec("COMMIT");
    for (const r of db.prepare("SELECT DISTINCT refnis FROM revenus WHERE annee = ? AND refnis NOT IN (SELECT refnis FROM communes)").all(anneeRevenus) as { refnis: string }[]) sansCommuneRev.add(r.refnis);
    const masquesDerniere = masques.filter((m) => m.annee === anneeRevenus).length;
    journal(`revenus fiscaux : ${masquesDerniere} commune(s) à valeurs masquées (secret statistique) en ${anneeRevenus}, ignorées.`);
    journal(`revenus fiscaux : dernière année ${anneeRevenus} ; ${sansCommuneRev.size} code(s) INS absents de la population (communes fusionnées depuis).`);

    // --- TVA par commune et section d'activité (agrégation en mémoire : 320 000 lignes) ---
    journal("assujettis à la TVA : lecture…");
    let tvaMasquees = 0;
    const agregat = new Map<string, { refnis: string; section: string; libelle: string; assujettis: number }>();
    for await (const e of enregistrements(o.fichierTva, "windows-1252", ["CD_MUNTY_REFNIS", "TX_NACE_FR_LVL1", "MS_NUM_VAT"])) {
      const refnis = e["CD_MUNTY_REFNIS"]!;
      if (!/^\d{5}$/u.test(refnis)) continue; // « ----- » = établis à l'étranger
      const lib = e["TX_NACE_FR_LVL1"]!.trim();
      const section = lib.slice(0, 1).toUpperCase();
      if (!/^[A-Z]$/u.test(section)) continue;
      const cle = `${refnis}|${section}`;
      const a = agregat.get(cle) ?? { refnis, section, libelle: lib.slice(1).trim(), assujettis: 0 };
      if (masque(e["MS_NUM_VAT"])) { tvaMasquees++; continue; } // secret statistique : jamais remplacé par 0
      a.assujettis += entier(e["MS_NUM_VAT"], "MS_NUM_VAT");
      agregat.set(cle, a);
    }
    const insererTva = db.prepare("INSERT INTO tva VALUES (?, ?, ?, ?)");
    db.exec("BEGIN");
    for (const a of agregat.values()) insererTva.run(a.refnis, a.section, a.libelle, a.assujettis);
    db.exec("COMMIT");
    const sansCommuneTva = (db.prepare("SELECT DISTINCT refnis FROM tva WHERE refnis NOT IN (SELECT refnis FROM communes)").all() as { refnis: string }[]).map((r) => r.refnis);
    journal(`TVA : ${agregat.size} lignes commune × section ; ${sansCommuneTva.length} code(s) INS absents de la population ; ${tvaMasquees} ligne(s) masquées (secret statistique) ignorées.`);

    // --- Codes postaux (bpost) ---
    const insererCp = db.prepare("INSERT OR IGNORE INTO codes_postaux VALUES (?, ?)");
    db.exec("BEGIN");
    for await (const e of enregistrements(o.fichierCodesPostaux, "utf-8", ["postcode", "mun_code"])) {
      if (/^\d{4}$/u.test(e["postcode"]!) && /^\d{5}$/u.test(e["mun_code"]!)) insererCp.run(e["postcode"], e["mun_code"]);
    }
    db.exec("COMMIT");
    const nbCp = (db.prepare("SELECT COUNT(*) AS n FROM codes_postaux").get() as { n: number }).n;
    if (nbCp < 1000) throw new Error(`Table des codes postaux : ${nbCp} lignes seulement, fichier incomplet.`);

    const meta = db.prepare("INSERT INTO meta VALUES (?, ?)");
    const maintenant = (o.maintenant ?? ((): Date => new Date()))().toISOString();
    for (const [k, v] of Object.entries({
      version_schema: VERSION_SCHEMA,
      importe_le: maintenant,
      annee_population: String(o.anneePopulation),
      annee_revenus: String(anneeRevenus),
      annee_tva: String(o.anneeTva),
      communes_revenus_non_rapprochees: sansCommuneRev.size > 0 ? [...sansCommuneRev].sort().join(",") : "",
      communes_tva_non_rapprochees: sansCommuneTva.length > 0 ? sansCommuneTva.sort().join(",") : "",
    })) meta.run(k, v);
    db.close();
    renameSync(temporaire, o.index);
    return { communes: communesVues.size, anneeRevenus, revenusSansCommune: [...sansCommuneRev].sort(), tvaSansCommune: sansCommuneTva.sort(), codesPostaux: nbCp };
  } catch (e) {
    try { db.close(); } catch { /* déjà fermée */ }
    if (existsSync(temporaire)) rmSync(temporaire, { force: true });
    throw e;
  }
}
