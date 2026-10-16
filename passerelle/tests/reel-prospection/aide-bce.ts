// Aides des tests du fournisseur BCE réel (lot P3) : écriture d'archives ZIP et de fichiers CSV AU FORMAT OFFICIEL
// (noms de fichiers et de colonnes de la BCE Open Data, PROBABLES : voir src/reel/prospection/bce/schema.ts), avec des
// entreprises ENTIÈREMENT FICTIVES. Tous les numéros ont un chiffre de contrôle volontairement faux (modulo 97), comme au
// lot P2 : aucun ne peut désigner une vraie entreprise.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import Database from "better-sqlite3";
import * as z from "zod";
import type { ContexteAppel, OutilPasserelle } from "../../src/fournisseurs.js";
import { controleValide } from "../../src/commun/prospection/numeros.js";

// --- ZIP --------------------------------------------------------------------------------------------------------------

/** Archive ZIP (compression « deflate ») de fichiers texte UTF-8, sans dépendance. */
export function creerZip(entrees: Record<string, string>): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const [nom, texte] of Object.entries(entrees)) {
    const nomOctets = Buffer.from(nom, "utf8");
    const brut = Buffer.from(texte, "utf8");
    const comprime = deflateRawSync(brut);
    const crc = crc32(brut);
    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(20, 4);
    entete.writeUInt16LE(0x0800, 6);
    entete.writeUInt16LE(8, 8);
    entete.writeUInt16LE(0x0021, 12);
    entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(comprime.length, 18);
    entete.writeUInt32LE(brut.length, 22);
    entete.writeUInt16LE(nomOctets.length, 26);
    locaux.push(entete, nomOctets, comprime);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprime.length, 20);
    central.writeUInt32LE(brut.length, 24);
    central.writeUInt16LE(nomOctets.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nomOctets);
    decalage += 30 + nomOctets.length + comprime.length;
  }
  const tailleCentral = centraux.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(entrees).length, 8);
  fin.writeUInt16LE(Object.keys(entrees).length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...centraux, fin]);
}

// --- CSV --------------------------------------------------------------------------------------------------------------

const champ = (v: string): string => `"${v.replace(/"/g, '""')}"`;

/** Fichier CSV au style de la BCE : tous les champs entre guillemets, séparateur virgule, fins de ligne CRLF. */
export function csv(entete: readonly string[], lignes: readonly (readonly string[])[], avecBom = false): string {
  return `${avecBom ? "﻿" : ""}${[entete, ...lignes].map((l) => l.map(champ).join(",")).join("\r\n")}\r\n`;
}

// --- Numéros fictifs --------------------------------------------------------------------------------------------------

/** Numéro d'entreprise à contrôle FAUX : base de 8 chiffres, puis un contrôle différent du bon. */
export function numeroFictif(base8: string): string {
  const valide = controleValide(base8);
  const faux = ((valide - 1 + 7) % 97) + 1;
  const dix = `${base8}${String(faux).padStart(2, "0")}`;
  return `${dix.slice(0, 4)}.${dix.slice(4, 7)}.${dix.slice(7)}`;
}

export function etablissementFictif(base: string): string {
  // Base de 8 chiffres commençant par 2 ; même règle de contrôle faux.
  const valide = controleValide(base);
  const faux = ((valide - 1 + 7) % 97) + 1;
  const dix = `${base}${String(faux).padStart(2, "0")}`;
  return `${dix[0]}.${dix.slice(1, 4)}.${dix.slice(4, 7)}.${dix.slice(7)}`;
}

// Entreprises du jeu d'essai (toutes fictives).
export const N = {
  toitures: numeroFictif("01000001"), // Liège 4000, couverture, SRL, établissement à Ans
  brasserie: numeroFictif("01000002"), // Liège 4020, restauration, SA
  couvreurNamur: numeroFictif("01000003"), // Namur 5000, couverture, SRL
  courtier: numeroFictif("11000004"), // Herstal 4040, courtage
  personnePhysique: numeroFictif("01000005"), // TypeOfEnterprise 1 : ne doit JAMAIS entrer dans l'index
  etrangere: numeroFictif("01000006"), // adresse française
  nouvelle: numeroFictif("01000007"), // créée par la mise à jour
  nouvellePersonnePhysique: numeroFictif("01000008"), // personne physique créée par la mise à jour
  orpheline: numeroFictif("01000099"), // absente de enterprise.csv : lignes orphelines
};
export const E = {
  toituresAns: etablissementFictif("20000001"),
  secretPhysique: etablissementFictif("20000002"), // établissement de la personne physique
  namurNouveau: etablissementFictif("20000003"),
};
export const NOM_PERSONNE_PHYSIQUE = "Personne Physique Fictive Alpha";
export const NOM_ETABLISSEMENT_PHYSIQUE = "Etablissement Secret Alpha";
export const RUE_PERSONNE_PHYSIQUE = "Rue Secrete Alpha";
export const COURRIEL_PERSONNE_PHYSIQUE = "alpha.secret@exemple.invalid";

const ENTETE_ENTERPRISE = ["EnterpriseNumber", "Status", "JuridicalSituation", "TypeOfEnterprise", "JuridicalForm", "JuridicalFormCAC", "StartDate"];
const ENTETE_ESTABLISHMENT = ["EstablishmentNumber", "StartDate", "EnterpriseNumber"];
const ENTETE_DENOMINATION = ["EntityNumber", "Language", "TypeOfDenomination", "Denomination"];
const ENTETE_ADDRESS = ["EntityNumber", "TypeOfAddress", "CountryNL", "CountryFR", "Zipcode", "MunicipalityNL", "MunicipalityFR", "StreetNL", "StreetFR", "HouseNumber", "Box", "ExtraAddressInfo", "DateStrikingOff"];
const ENTETE_CONTACT = ["EntityNumber", "EntityContact", "ContactType", "Value"];
const ENTETE_ACTIVITY = ["EntityNumber", "ActivityGroup", "NaceVersion", "NaceCode", "Classification"];

export const adresse = (entite: string, type: "REGO" | "BAET", cp: string, commune: string, rue: string, numero: string, pays = ""): string[] =>
  [entite, type, pays === "" ? "" : pays, pays, cp, commune, commune, rue, rue, numero, "", "", ""];

export const activite = (entite: string, code: string, classification = "MAIN"): string[][] =>
  [[entite, "003", "2008", code, classification], [entite, "003", "2025", code, classification]];

const CODES = [
  ["JuridicalForm", "610", "FR", "Société à responsabilité limitée"],
  ["JuridicalForm", "610", "NL", "Besloten vennootschap"],
  ["JuridicalForm", "014", "FR", "Société anonyme"],
  ["Nace2008", "43910", "FR", "Travaux de couverture"],
  ["Nace2025", "43910", "FR", "Travaux de couverture (2025)"],
  ["Nace2008", "56101", "FR", "Restauration à service complet"],
  ["Nace2008", "66220", "FR", "Activités des agents et courtiers d'assurances"],
  ["TypeOfEnterprise", "1", "FR", "Personne physique"],
  ["TypeOfEnterprise", "2", "FR", "Personne morale"],
];

export interface InfoMeta {
  type: "full" | "update";
  date: string;
  numero: number;
}

const meta = (m: InfoMeta): string =>
  csv(["Variable", "Value"], [
    ["SnapshotDate", m.date], ["ExtractTimestamp", `${m.date} 03:00:00`], ["ExtractType", m.type], ["ExtractNumber", String(m.numero)], ["Version", "1.0"],
  ]);

/** Fichier complet fictif (extraction n° 133 du 14-10-2026). */
export function fichierComplet(m: InfoMeta = { type: "full", date: "14-10-2026", numero: 133 }): Record<string, string> {
  const enterprises = [
    [N.toitures, "AC", "000", "2", "610", "", "15-03-2019"],
    [N.brasserie, "AC", "000", "2", "014", "", "01-06-2024"],
    [N.couvreurNamur, "AC", "000", "2", "610", "", "20-09-2005"],
    [N.courtier, "AC", "000", "2", "610", "", "02-02-2011"],
    [N.personnePhysique, "AC", "000", "1", "", "", "05-05-2000"],
    [N.etrangere, "AC", "000", "2", "610", "", "11-11-2021"],
  ];
  const establishments = [
    [E.toituresAns, "01-02-2022", N.toitures],
    [E.secretPhysique, "03-03-2003", N.personnePhysique],
  ];
  const denominations = [
    [N.toitures, "1", "001", "Toitures Fictives SRL"],
    [N.toitures, "1", "003", "Toitures Fictives"],
    [N.brasserie, "1", "001", "Brasserie de l'Essai SA"],
    [N.couvreurNamur, "1", "001", "Couvertures Namuroises Fictives SRL"],
    [N.courtier, "1", "001", "Courtage Herstalien Fictif SRL"],
    [N.personnePhysique, "1", "001", NOM_PERSONNE_PHYSIQUE],
    [E.secretPhysique, "1", "004", NOM_ETABLISSEMENT_PHYSIQUE],
    [N.etrangere, "1", "001", "Importation Etrangere Fictive SRL"],
    [N.orpheline, "1", "001", "Orpheline Fictive"],
  ];
  const addresses = [
    adresse(N.toitures, "REGO", "4000", "Liège", "Rue des Exemples", "12"),
    adresse(E.toituresAns, "BAET", "4430", "Ans", "Rue de l'Atelier Fictif", "3"),
    adresse(N.brasserie, "REGO", "4020", "Liège", "Quai Imaginaire", "7"),
    adresse(N.couvreurNamur, "REGO", "5000", "Namur", "Place de l'Essai", "1"),
    adresse(N.courtier, "REGO", "4040", "Herstal", "Rue Sans-Nom", "44"),
    adresse(N.personnePhysique, "REGO", "4000", "Liège", RUE_PERSONNE_PHYSIQUE, "1"),
    adresse(E.secretPhysique, "BAET", "4000", "Liège", RUE_PERSONNE_PHYSIQUE, "2"),
    adresse(N.etrangere, "REGO", "75001", "Paris", "Rue Fictive", "9", "France"),
    adresse(N.orpheline, "REGO", "4000", "Liège", "Rue Orpheline", "1"),
  ];
  const contacts = [
    [N.toitures, "ENT", "TEL", "+32 4 000 00 11"],
    [N.toitures, "ENT", "EMAIL", "info.toitures@exemple.invalid"],
    [N.toitures, "ENT", "WEB", "https://toitures.demo-prospection.example"],
    [N.personnePhysique, "ENT", "EMAIL", COURRIEL_PERSONNE_PHYSIQUE],
    [N.brasserie, "ENT", "TEL", "+32 4 000 00 12"],
  ];
  const activities = [
    ...activite(N.toitures, "43910"), ...activite(E.toituresAns, "43910"),
    ...activite(N.brasserie, "56101"), ...activite(N.couvreurNamur, "43910"),
    ...activite(N.courtier, "66220"), ...activite(N.personnePhysique, "43910"), ...activite(E.secretPhysique, "43910"),
    ...activite(N.etrangere, "46900"), ...activite(N.orpheline, "43910"),
  ];
  return {
    "meta.csv": meta(m),
    "code.csv": csv(["Category", "Code", "Language", "Description"], CODES),
    "enterprise.csv": csv(ENTETE_ENTERPRISE, enterprises, true),
    "establishment.csv": csv(ENTETE_ESTABLISHMENT, establishments),
    "denomination.csv": csv(ENTETE_DENOMINATION, denominations),
    "address.csv": csv(ENTETE_ADDRESS, addresses),
    "contact.csv": csv(ENTETE_CONTACT, contacts),
    "activity.csv": csv(ENTETE_ACTIVITY, activities),
  };
}

/**
 * Mise à jour fictive n° 134 du 15-10-2026 :
 *  - création de `nouvelle` (SRL, Seraing) et d'une personne physique `nouvellePersonnePhysique` (à ignorer) ;
 *  - `brasserie` passe de SA (014) à SRL (610) : suppression puis insertion de la ligne entreprise ;
 *  - `toitures` déménage de Liège (4000) à Seraing (4100) : suppression puis insertion de l'adresse REGO ;
 *  - nouvel établissement de `couvreurNamur` ;
 *  - radiation de `courtier` (suppression seule).
 */
export function miseAJour134(m: InfoMeta = { type: "update", date: "15-10-2026", numero: 134 }): Record<string, string> {
  return {
    "meta.csv": meta(m),
    "code.csv": csv(["Category", "Code", "Language", "Description"], CODES),
    "enterprise_delete.csv": csv(["EnterpriseNumber"], [[N.brasserie], [N.courtier]]),
    "enterprise_insert.csv": csv(ENTETE_ENTERPRISE, [
      [N.brasserie, "AC", "000", "2", "610", "", "01-06-2024"],
      [N.nouvelle, "AC", "000", "2", "610", "", "14-10-2026"],
      [N.nouvellePersonnePhysique, "AC", "000", "1", "", "", "14-10-2026"],
    ]),
    "establishment_insert.csv": csv(ENTETE_ESTABLISHMENT, [[E.namurNouveau, "10-10-2026", N.couvreurNamur]]),
    "denomination_insert.csv": csv(ENTETE_DENOMINATION, [
      [N.nouvelle, "1", "001", "Nouvelle Entreprise Fictive SRL"],
      [N.nouvellePersonnePhysique, "1", "001", "Personne Physique Fictive Beta"],
    ]),
    // Suppression par clé seulement (EntityNumber, TypeOfAddress) : forme tolérée, puis insertion de la nouvelle adresse.
    "address_delete.csv": csv(["EntityNumber", "TypeOfAddress"], [[N.toitures, "REGO"]]),
    "address_insert.csv": csv(ENTETE_ADDRESS, [
      adresse(N.toitures, "REGO", "4100", "Seraing", "Rue Nouvelle", "5"),
      adresse(N.nouvelle, "REGO", "4100", "Seraing", "Rue Neuve", "8"),
      adresse(E.namurNouveau, "BAET", "5000", "Namur", "Rue du Nouvel Etablissement", "2"),
      adresse(N.nouvellePersonnePhysique, "REGO", "4000", "Liège", "Rue Secrete Beta", "3"),
    ]),
    // Suppression par ligne complète (toutes les colonnes de l'activité).
    "activity_delete.csv": csv(ENTETE_ACTIVITY, [[N.brasserie, "003", "2008", "56101", "MAIN"]]),
    "activity_insert.csv": csv(ENTETE_ACTIVITY, [
      [N.brasserie, "003", "2008", "56101", "MAIN"],
      ...activite(N.nouvelle, "56101"),
      ...activite(E.namurNouveau, "43910"),
    ]),
    "contact_insert.csv": csv(ENTETE_CONTACT, [[N.nouvelle, "ENT", "TEL", "+32 4 000 00 13"]]),
  };
}

/** Mise à jour n° 135 du 16-10-2026 : `couvreurNamur` devient une personne physique (doit disparaître de l'index). */
export function miseAJour135(): Record<string, string> {
  return {
    "meta.csv": meta({ type: "update", date: "16-10-2026", numero: 135 }),
    "enterprise_delete.csv": csv(["EnterpriseNumber"], [[N.couvreurNamur]]),
    "enterprise_insert.csv": csv(ENTETE_ENTERPRISE, [[N.couvreurNamur, "AC", "000", "1", "", "", "20-09-2005"]]),
  };
}

// --- Fichiers ---------------------------------------------------------------------------------------------------------

export function dossierTemporaire(prefixe = "passerelle-p3-"): string {
  return mkdtempSync(join(tmpdir(), prefixe));
}

export function ecrireZip(dossier: string, nom: string, entrees: Record<string, string>): string {
  const chemin = join(dossier, nom);
  writeFileSync(chemin, creerZip(entrees));
  return chemin;
}

/** Contenu complet de l'index (toutes les tables, trié), hors date d'importation : sert à comparer deux états. */
export function etatIndex(chemin: string): string {
  const db = new Database(chemin, { readonly: true });
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
    const sortie: Record<string, unknown[]> = {};
    for (const t of tables) {
      const lignes = db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
      sortie[t] = lignes
        .filter((l) => !(t === "meta" && l["Variable"] === "DateImport"))
        .map((l) => JSON.stringify(l))
        .sort();
    }
    return JSON.stringify(sortie);
  } finally {
    db.close();
  }
}

// --- Appel direct d'un outil ----------------------------------------------------------------------------------------------

export const CONTEXTE_REEL: ContexteAppel = { service: "bce", mode: "reel", identite: { compte: "essai", propriete: null }, jetonPorteur: null };

/** Appelle un outil par son nom, le schéma Zod étant appliqué comme le fait la passerelle. */
export async function appeler(outils: readonly OutilPasserelle[], nom: string, args: Record<string, unknown> = {}): Promise<Record<string, any>> {
  const outil = outils.find((o) => o.nom === nom);
  if (!outil) throw new Error(`Outil absent du catalogue : ${nom}`);
  const valides = z.object(outil.schemaEntree).parse(args) as Record<string, unknown>;
  return (await outil.executer(valides, CONTEXTE_REEL)) as Record<string, any>;
}
