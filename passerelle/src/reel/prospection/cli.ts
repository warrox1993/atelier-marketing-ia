// Commandes d'exploitation des index de prospection (lots P3 et P3b) : node dist/src/reel/prospection/cli.js <commande> …
//
//   bce-importer <archive.zip> [--index chemin] [--forcer] [--autoriser-trou] [--conservation-jours N]
//       Importe un fichier complet OU applique une mise à jour (détectés d'après le fichier meta de l'archive).
//   bce-telecharger [--dossier d] [--index chemin] [--importer]
//       Télécharge les fichiers BCE manquants depuis le portail (identifiants : PASSERELLE_BCE_IDENTIFIANTS_FICHIER, 0600).
//       NÉCESSITE L'INSCRIPTION de l'opérateur ; jamais lancé par les tests contre le vrai portail.
//   osm-verifier-taille                      Lit la taille annoncée de l'extrait Belgique (requête HEAD, ne télécharge RIEN).
//   osm-telecharger <destination> --confirmer  Télécharge l'extrait (environ 664 Mo) ; sans --confirmer, seule la taille est lue.
//   osm-importer <fichier.geojsonseq> [--index chemin] [--date AAAA-MM-JJ]
//
// Sortie : un objet JSON. Code de sortie 0 si tout va bien, 1 en cas d'erreur, 2 pour un usage incorrect.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DOSSIER_ETAT_PAR_DEFAUT } from "./commun.js";
import { appliquerMiseAJour, detecterTypeArchive, importerComplet, lireMetaIndex, type OptionsImport } from "./bce/importer.js";
import { adressePortail, ClientPortailBce, lireIdentifiantsBce, telechargerNouveautes } from "./bce/telechargement.js";
import { importerOsm } from "./osm/importer.js";
import { telechargerExtrait, verifierTaille } from "./osm/telechargement.js";
import { cheminsIndex } from "./enregistrer.js";

interface Arguments {
  positionnels: string[];
  options: Map<string, string | true>;
}

const AVEC_VALEUR = new Set(["--index", "--dossier", "--conservation-jours", "--date"]);

function analyser(argv: readonly string[]): Arguments {
  const positionnels: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) positionnels.push(a);
    else if (AVEC_VALEUR.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} attend une valeur.`);
      options.set(a, v);
    } else options.set(a, true);
  }
  return { positionnels, options };
}

const texte = (a: Arguments, nom: string): string | undefined => {
  const v = a.options.get(nom);
  return typeof v === "string" ? v : undefined;
};

const USAGE =
  "Usage : cli.js bce-importer <archive.zip> | bce-telecharger [--importer] | osm-verifier-taille | osm-telecharger <destination> --confirmer | osm-importer <fichier.geojsonseq> [--date AAAA-MM-JJ]\n" +
  "Options : --index <chemin> (sinon PASSERELLE_BCE_INDEX ou PASSERELLE_OSM_INDEX), --forcer, --autoriser-trou, --conservation-jours N, --dossier <d>.";

function optionsImport(a: Arguments): OptionsImport {
  const jours = texte(a, "--conservation-jours");
  if (jours !== undefined && !/^\d{1,5}$/.test(jours)) throw new Error("--conservation-jours : nombre entier de jours attendu.");
  return {
    ...(a.options.has("--forcer") ? { forcer: true } : {}),
    ...(a.options.has("--autoriser-trou") ? { autoriserTrou: true } : {}),
    ...(jours !== undefined ? { conservationJours: Number(jours) } : {}),
    journal: (m) => console.error(m),
  };
}

async function importerArchive(archive: string, index: string, options: OptionsImport): Promise<unknown> {
  return (await detecterTypeArchive(archive)) === "complet" ? importerComplet(archive, index, options) : appliquerMiseAJour(archive, index, options);
}

function dernierNumero(index: string): number | null {
  if (!existsSync(index)) return null;
  const db = new Database(index, { readonly: true });
  try {
    const n = Number(lireMetaIndex(db)["ExtractNumber"]);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null; // index illisible ou sans numéro d'extraction : on repart du dernier fichier complet
  } finally {
    db.close();
  }
}

export async function executer(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const a = analyser(argv);
  const [commande, ...reste] = a.positionnels;
  const chemins = cheminsIndex(env);
  switch (commande) {
    case "bce-importer": {
      if (reste.length !== 1) throw new UsageErreur("bce-importer attend un seul fichier .zip.");
      return importerArchive(reste[0]!, texte(a, "--index") ?? chemins.bce, optionsImport(a));
    }
    case "bce-telecharger": {
      const index = texte(a, "--index") ?? chemins.bce;
      const dossier = texte(a, "--dossier") ?? join(DOSSIER_ETAT_PAR_DEFAUT, "bce", "telechargements");
      const client = new ClientPortailBce(adressePortail(env));
      const resultat = await telechargerNouveautes(client, lireIdentifiantsBce(env), dossier, dernierNumero(index));
      if (resultat.plan.trou) console.error("ATTENTION : les mises à jour disponibles ne suivent pas l'index : repartir du dernier fichier complet.");
      const importes: unknown[] = [];
      if (a.options.has("--importer")) for (const f of resultat.fichiers) importes.push(await importerArchive(f, index, optionsImport(a)));
      return { fichiers: resultat.fichiers, trou: resultat.plan.trou, importes };
    }
    case "osm-verifier-taille":
      return verifierTaille();
    case "osm-telecharger": {
      if (reste.length !== 1) throw new UsageErreur("osm-telecharger attend le chemin de destination.");
      return telechargerExtrait({ destination: reste[0]!, confirmer: a.options.has("--confirmer") });
    }
    case "osm-importer": {
      if (reste.length !== 1) throw new UsageErreur("osm-importer attend un fichier .geojsonseq.");
      const date = texte(a, "--date");
      return importerOsm(reste[0]!, texte(a, "--index") ?? chemins.osm, { ...(date !== undefined ? { date } : {}), journal: (m) => console.error(m) });
    }
    default:
      throw new UsageErreur(commande ? `Commande inconnue : ${commande}.` : "Commande manquante.");
  }
}

class UsageErreur extends Error {}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  executer(process.argv.slice(2))
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error(e instanceof UsageErreur ? `${message}\n${USAGE}` : `Erreur : ${message}`);
      process.exit(e instanceof UsageErreur ? 2 : 1);
    });
}
