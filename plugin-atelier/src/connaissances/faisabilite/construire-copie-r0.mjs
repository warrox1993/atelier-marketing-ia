// Construit la copie d'essai du lot R0, hors de plugin-atelier/dist (même principe que
// tests/ui/outils/construire-copie.mjs), avec le worker d'essai et la vectorisation externe.
//
// Usage (depuis plugin-atelier/) :
//   node src/connaissances/faisabilite/construire-copie-r0.mjs <copie absolue> <node_modules du banc> <dossier des modèles>
//
// - worker : src/connaissances/faisabilite/worker-essai.ts → <copie>/dist/worker.js ;
// - `@huggingface/transformers`, `onnxruntime-node` et `sharp` restent EXTERNES (modules natifs) :
//   <copie>/node_modules est un lien vers le banc, comme le serait le node_modules du plugin ;
// - migrations du plugin + table jetable 900_essai_r0.sql ;
// - <copie>/modeles est un lien vers les fichiers du modèle (hors dépôt git).
import esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const [cible, nodeModules, modeles] = process.argv.slice(2);
if (![cible, nodeModules, modeles].every((p) => p && path.isAbsolute(p))) {
  console.error("Usage : node src/connaissances/faisabilite/construire-copie-r0.mjs <copie> <node_modules> <modèles> (chemins absolus)");
  process.exit(2);
}
const EXTERNES = ["@huggingface/transformers", "onnxruntime-node", "sharp"];
const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
const dist = path.join(cible, "dist");
mkdirSync(dist, { recursive: true });
rmSync(path.join(dist, "ui"), { recursive: true, force: true });

const resultat = await Promise.all([
  esbuild.build({
    ...presets.esbuild.worker,
    entryPoints: { worker: "src/connaissances/faisabilite/worker-essai.ts" },
    outdir: dist,
    external: [...presets.esbuild.worker.external, ...EXTERNES],
    metafile: true,
  }),
  esbuild.build({ ...presets.esbuild.manifest, outdir: dist }),
  esbuild.build({ ...presets.esbuild.ui, outdir: path.join(dist, "ui") }),
]);
const sortie = resultat[0].metafile.outputs[path.relative(process.cwd(), path.join(dist, "worker.js"))];
cpSync("package.json", path.join(cible, "package.json"));
rmSync(path.join(cible, "migrations"), { recursive: true, force: true });
cpSync("migrations", path.join(cible, "migrations"), { recursive: true });
cpSync("src/connaissances/faisabilite/essai-r0.sql", path.join(cible, "migrations", "900_essai_r0.sql"));
for (const [lien, vers] of [["node_modules", nodeModules], ["modeles", modeles]]) {
  const chemin = path.join(cible, lien);
  if (!existsSync(chemin)) symlinkSync(vers, chemin);
}
writeFileSync(
  path.join(cible, "construction.json"),
  JSON.stringify({ externes: EXTERNES, octetsWorker: sortie?.bytes, importsWorker: sortie?.imports?.filter((i) => i.external).map((i) => i.path) }, null, 2),
);
console.log(`Copie R0 construite : ${cible}`);
console.log(readFileSync(path.join(cible, "construction.json"), "utf8"));
