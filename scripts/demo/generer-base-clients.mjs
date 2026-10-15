#!/usr/bin/env node
// Génère la base clients de DÉMONSTRATION du courtier fictif : CSV et XLSX (lot P8).
//
// Usage : node scripts/demo/generer-base-clients.mjs [dossier-de-sortie]
// Sortie par défaut : instance/demo/base-clients/ (dossier ignoré par git : aucun fichier de données n'est versionné).
//
// Fichiers produits (déterministes, identiques octet pour octet à graine égale) :
//   base-clients.csv / .xlsx             base importable (particuliers de b2c_clients + entreprises clientes)
//   base-clients-pieges.csv / .xlsx      variante à REFUSER (colonne remarque_sinistre, téléphone saisi comme nombre)
//   historique-opportunites.csv / .xlsx  issues d'opportunités 2025-2026 pour l'étalonnage
//
// Choix techniques :
//  - le générateur est en TypeScript (passerelle/src/demo/prospection/base-clients.ts) : le script le compile d'abord
//    avec le tsc de la passerelle (dossier temporaire passerelle/dist/.generation-base-clients) puis l'importe ;
//  - le paquet `xlsx` (0.20.3) n'est PAS une dépendance de la passerelle : on n'en ajoute pas. Le script l'importe
//    dynamiquement depuis plugin-atelier/node_modules (stable, déjà installé) ; s'il est absent, seuls les CSV sont écrits.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const passerelle = join(racine, "passerelle");
const sortie = resolve(process.argv[2] ?? join(racine, "instance", "demo", "base-clients"));
const compilation = join(passerelle, "dist", ".generation-base-clients"); // dans passerelle/ (ignoré) pour résoudre ses node_modules

rmSync(compilation, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });

const tsc = spawnSync("npx", ["tsc", "-p", "tsconfig.build.json", "--outDir", compilation], { cwd: passerelle, stdio: "inherit" });
if (tsc.status !== 0) {
  console.error("Échec de la compilation de la passerelle : génération abandonnée.");
  process.exit(1);
}

const mod = await import(pathToFileURL(join(compilation, "src", "demo", "prospection", "base-clients.js")).href);
const { nomAssureurDemo } = await import(pathToFileURL(join(compilation, "src", "demo", "prospection", "referentiel.js")).href);

const csv = mod.csvBaseClients();
for (const nom of mod.NOMS_FICHIERS) writeFileSync(join(sortie, `${nom}.csv`), csv[nom], "utf8");

const cheminXlsx = join(racine, "plugin-atelier", "node_modules", "xlsx", "xlsx.mjs");
if (existsSync(cheminXlsx)) {
  const XLSX = await import(pathToFileURL(cheminXlsx).href);
  const tableaux = mod.tableauxBaseClients();
  const date = new Date("2026-09-30T00:00:00.000Z"); // fixe : le classeur ne dépend pas de l'horloge
  for (const nom of mod.NOMS_FICHIERS) {
    const t = tableaux[nom];
    const feuille = XLSX.utils.aoa_to_sheet([[...t.colonnes], ...t.lignes]); // les nombres restent des cellules numériques
    feuille["!cols"] = t.colonnes.map((c) => ({ wch: Math.max(12, c.length + 2) }));
    const classeur = XLSX.utils.book_new();
    classeur.Props = { Title: `${nom} (démonstration, ${nomAssureurDemo()})`, Author: "Atelier marketing (démonstration)", CreatedDate: date, ModifiedDate: date };
    XLSX.utils.book_append_sheet(classeur, feuille, "Données");
    writeFileSync(join(sortie, `${nom}.xlsx`), XLSX.write(classeur, { type: "buffer", bookType: "xlsx", compression: true }));
  }
} else {
  console.warn(`Paquet xlsx absent (${cheminXlsx}) : seuls les CSV ont été écrits.`);
}

rmSync(compilation, { recursive: true, force: true });
console.log(`Base clients de démonstration écrite dans ${sortie}`);
