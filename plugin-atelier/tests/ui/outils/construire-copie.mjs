// Construit le plugin dans une COPIE isolée (lot C), sans toucher `plugin-atelier/dist/`.
//
// Pourquoi : l'hôte Paperclip surveille le `dist/` d'un plugin installé depuis un
// chemin local et recharge son worker à chaque reconstruction. Le lot A utilise
// `plugin-atelier/dist/` dans sa propre instance ; reconstruire là-bas pendant
// qu'il travaille rechargerait son worker. La copie sert à l'instance d'essai du
// lot C (port 3140).
//
// Usage (depuis plugin-atelier/) : node tests/ui/outils/construire-copie.mjs <dossier cible absolu>
import esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { creerConfigurations } from "../../../esbuild.config.mjs";

const cible = process.argv[2];
if (!cible || !path.isAbsolute(cible)) {
  console.error("Usage : node tests/ui/outils/construire-copie.mjs <dossier cible absolu>");
  process.exit(2);
}

// Même configuration que `esbuild.config.mjs` (bannière `createRequire`, externes), sans la dupliquer.
const configs = creerConfigurations();
const dist = path.join(cible, "dist");
mkdirSync(dist, { recursive: true });
rmSync(path.join(dist, "ui"), { recursive: true, force: true });

await Promise.all([
  esbuild.build({ ...configs.worker, outdir: dist }),
  esbuild.build({ ...configs.vectoriseur, outfile: path.join(dist, "processus-vectoriseur.js") }),
  esbuild.build({ ...configs.extraction, outfile: path.join(dist, "extraction-worker.js") }),
  esbuild.build({ ...configs.manifest, outdir: dist }),
  esbuild.build({ ...configs.ui, outdir: path.join(dist, "ui") }),
]);
cpSync("package.json", path.join(cible, "package.json"));
cpSync("migrations", path.join(cible, "migrations"), { recursive: true });
console.log(`Copie construite : ${cible}`);
