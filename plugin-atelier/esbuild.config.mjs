import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
const watch = process.argv.includes("--watch");

// Modules natifs et paquets de vectorisation : jamais empaquetés, résolus à l'exécution depuis node_modules
// (un `.node` et ses `.so` ne s'embarquent pas dans un fichier JavaScript).
const externesVectorisation = ["onnxruntime-node", "@huggingface/tokenizers"];
// Le worker est un module ESM : les paquets CommonJS empaquetés (mammoth…) appellent `require("url")`,
// que l'ESM n'a pas. On fournit un `require` natif en tête de fichier (sinon : « Dynamic require of "url" »).
const banniereRequire = { js: "import { createRequire as __creerRequire } from 'node:module'; const require = __creerRequire(import.meta.url);" };

const workerCtx = await esbuild.context({
  ...presets.esbuild.worker,
  external: [...presets.esbuild.worker.external, ...externesVectorisation],
  banner: banniereRequire,
});
// Sous-processus de vectorisation locale : lancé par `fork` à côté du worker (dist/processus-vectoriseur.js).
const vectoriseurCtx = await esbuild.context({
  ...presets.esbuild.worker,
  entryPoints: ["src/connaissances/processus-vectoriseur.ts"],
  outdir: undefined,
  outfile: "dist/processus-vectoriseur.js",
  external: externesVectorisation,
  banner: banniereRequire,
});
const manifestCtx = await esbuild.context(presets.esbuild.manifest);
const uiCtx = await esbuild.context(presets.esbuild.ui);

if (watch) {
  await Promise.all([workerCtx.watch(), vectoriseurCtx.watch(), manifestCtx.watch(), uiCtx.watch()]);
  console.log("esbuild watch mode enabled for worker, manifest, and ui");
} else {
  await Promise.all([workerCtx.rebuild(), vectoriseurCtx.rebuild(), manifestCtx.rebuild(), uiCtx.rebuild()]);
  await Promise.all([workerCtx.dispose(), vectoriseurCtx.dispose(), manifestCtx.dispose(), uiCtx.dispose()]);
}
