// Jeu d'essai FICTIF au format des fichiers Statbel (communes inventées, chiffres inventés) pour tester l'importation et les outils.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importerStatbel } from "../../src/reel/statbel/importer.js";

export const COMMUNES = [
  { ins: "90001", fr: "Exempleville", nl: "Voorbeeldstad", arr: "Arrondissement d'Exemple", prov: "Province d'Exemple", rgn: "Région wallonne" },
  { ins: "90002", fr: "Essaimont", nl: "Proefmunt", arr: "Arrondissement d'Exemple", prov: "Province d'Exemple", rgn: "Région wallonne" },
  { ins: "90003", fr: "Saint-Exemple", nl: "Sint-Voorbeeld", arr: "Arrondissement de Test", prov: "Province de Test", rgn: "Région flamande" },
  { ins: "90004", fr: "Saint-Essai", nl: "Sint-Proef", arr: "Arrondissement de Test", prov: "Province de Test", rgn: "Région flamande" },
];

/** Exempleville : 10 hommes et 10 femmes de chaque âge de 0 à 79 ans (1 600 habitants), dont 400 étrangers ; les autres communes sont plus petites. */
function lignesPopulation(): string {
  const entete = "CD_REFNIS|TX_DESCR_NL|TX_DESCR_FR|CD_DSTR_REFNIS|TX_ADM_DSTR_DESCR_NL|TX_ADM_DSTR_DESCR_FR|CD_PROV_REFNIS|TX_PROV_DESCR_NL|TX_PROV_DESCR_FR|CD_RGN_REFNIS|TX_RGN_DESCR_NL|TX_RGN_DESCR_FR|CD_SEX|CD_NATLTY|TX_NATLTY_NL|TX_NATLTY_FR|CD_CIV_STS|TX_CIV_STS_NL|TX_CIV_STS_FR|CD_AGE|MS_POPULATION";
  const lignes = ["﻿" + entete];
  const ajouter = (c: (typeof COMMUNES)[number], sexe: string, nat: string, age: number, n: number): void => {
    lignes.push([c.ins, c.nl, c.fr, "90000", c.arr, c.arr, "90000", c.prov, c.prov, "01000", c.rgn, c.rgn, sexe, nat, "x", "x", "1", "x", "x", String(age), String(n)].join("|"));
  };
  for (let age = 0; age < 80; age++) for (const sexe of ["M", "F"]) {
    ajouter(COMMUNES[0]!, sexe, "BEL", age, 7); // 7 belges + 3 étrangers = 10 par sexe et par âge
    ajouter(COMMUNES[0]!, sexe, "ETR", age, 3);
  }
  for (const c of COMMUNES.slice(1)) for (const sexe of ["M", "F"]) { ajouter(c, sexe, "BEL", 30, 100); ajouter(c, sexe, "ETR", 90, 20); } // âge 90 : tranche « 85 et plus » -> 80 ans et plus
  return lignes.join("\r\n") + "\r\n";
}

function lignesFiscal(): string {
  const entete = "CD_YEAR|CD_MUNTY_REFNIS|MS_NBR_NON_ZERO_INC|MS_NBR_ZERO_INC|MS_TOT_NET_TAXABLE_INC|MS_TOT_NET_INC|MS_TOT_RESIDENTS|TX_MUNTY_DESCR_FR";
  return [
    entete,
    "2022|90001|700|100|20000000|20100000|1590|Exempleville",
    "2023|90001|700|100|24000000|24100000|1600|Exempleville", // 800 déclarations, 24 000 000 EUR : 30 000 EUR par déclaration, 15 000 par habitant
    "2023|90002|300|50|*|*|*|Essaimont", // secret statistique : ignoré
    "2023|90003|400|0|10000000|10100000|500|Saint-Exemple",
    "2023|99999|10|0|1000|1000|20|Commune fusionnée depuis",
  ].join("\n") + "\n";
}

function lignesTva(): string {
  const entete = "CD_LGL_PSN_VAT|TX_NACE_FR_LVL1|CD_MUNTY_REFNIS|MS_NUM_VAT|MS_NUM_VAT_START|MS_NUM_VAT_STOP";
  return [
    entete,
    "0|A Agriculture, sylviculture et pêche|90001|10|1|0",
    "1|F Construction|90001|60|3|2",
    "0|F Construction|90001|40|1|1",
    "1|G Commerce de gros et de détail|90001|50|2|2",
    "1|I Hébergement et restauration|90003|7|0|0",
    "0|I Hébergement et restauration|-----|99|0|0", // étranger : ignoré
  ].join("\r\n") + "\r\n";
}

function lignesCodesPostaux(): string {
  const lignes = ["postcode|mun_code|mun_name_fr|mun_name_nl", "9000|90001|Exempleville|Voorbeeldstad", "9001|90002|Essaimont|Proefmunt", "9100|90003|Saint-Exemple|Sint-Voorbeeld", "9100|90004|Saint-Essai|Sint-Proef", "9999|99999|Fusionnée|Gefuseerd"];
  for (let k = 1; k <= 1100; k++) lignes.push(`${String(2000 + k).padStart(4, "0")}|90001|x|x`); // volume minimal exigé par l'importateur
  return lignes.join("\n") + "\n";
}

export interface IndexDeTest { dossier: string; index: string }

export async function construireIndexDeTest(): Promise<IndexDeTest> {
  const dossier = mkdtempSync(join(tmpdir(), "statbel-test-"));
  const f = (nom: string, contenu: string | Buffer): string => { const c = join(dossier, nom); writeFileSync(c, contenu); return c; };
  const index = join(dossier, "statbel.sqlite");
  // L'importateur refuse une population de moins de 500 communes : on complète avec des communes fictives sans intérêt.
  const pop = lignesPopulation() + Array.from({ length: 520 }, (_, k) => `${String(80000 + k)}|N|F${k}|0|a|a|0|p|p|0|r|r|M|BEL|x|x|1|x|x|30|1`).join("\r\n") + "\r\n";
  await importerStatbel({
    fichierPopulation: f("pop.txt", pop), anneePopulation: 2026, fichierFiscal: f("fiscal.txt", lignesFiscal()),
    fichierTva: f("tva.txt", Buffer.from(lignesTva(), "latin1")), anneeTva: 2024, fichierCodesPostaux: f("cp.csv", lignesCodesPostaux()),
    index, maintenant: () => new Date("2026-10-22T10:00:00Z"),
  });
  return { dossier, index };
}
