// Ligne de commande du service statbel (appelée par scripts/statbel-mise-a-jour.sh).
// Usage : cli.js importer --population f.txt --annee-population AAAA --fiscal f.txt --tva f.txt --annee-tva AAAA --codes-postaux f.csv --index statbel.sqlite
// Codes de sortie : 0 succès, 1 échec de l'importation, 2 usage incorrect.

import { fileURLToPath } from "node:url";
import { importerStatbel } from "./importer.js";

function option(args: string[], nom: string): string {
  const i = args.indexOf(nom);
  const v = i >= 0 ? args[i + 1] : undefined;
  if (v === undefined || v.startsWith("--")) throw new Error(`Option ${nom} manquante.`);
  return v;
}

export async function principal(args: string[]): Promise<number> {
  if (args[0] !== "importer") {
    console.error("Usage : cli.js importer --population f --annee-population AAAA --fiscal f --tva f --annee-tva AAAA --codes-postaux f --index chemin");
    return 2;
  }
  let options;
  try {
    const annee = (nom: string): number => {
      const n = Number(option(args, nom));
      if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new Error(`${nom} : année invalide.`);
      return n;
    };
    options = {
      fichierPopulation: option(args, "--population"), anneePopulation: annee("--annee-population"),
      fichierFiscal: option(args, "--fiscal"), fichierTva: option(args, "--tva"), anneeTva: annee("--annee-tva"),
      fichierCodesPostaux: option(args, "--codes-postaux"), index: option(args, "--index"),
    };
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }
  try {
    const bilan = await importerStatbel({ ...options, journal: (m) => console.log(m) });
    console.log(`importation terminée : ${bilan.communes} communes, revenus ${bilan.anneeRevenus}, ${bilan.codesPostaux} correspondances code postal.`);
    if (bilan.revenusSansCommune.length > 0) console.log(`revenus : codes INS sans commune dans la population (fusions) : ${bilan.revenusSansCommune.join(", ")}`);
    if (bilan.tvaSansCommune.length > 0) console.log(`TVA : codes INS sans commune dans la population (fusions) : ${bilan.tvaSansCommune.join(", ")}`);
    return 0;
  } catch (e) {
    console.error(`importation échouée : ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal(process.argv.slice(2)).then((c) => process.exit(c));
}
