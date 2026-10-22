import esbuild from "esbuild";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const watch = process.argv.includes("--watch");

// Modules natifs et paquets de vectorisation : jamais empaquetés, résolus à l'exécution depuis node_modules
// (un `.node` et ses `.so` ne s'embarquent pas dans un fichier JavaScript).
const externesVectorisation = ["onnxruntime-node", "@huggingface/tokenizers"];
// Le worker est un module ESM : les paquets CommonJS empaquetés (mammoth…) appellent `require("url")`,
// que l'ESM n'a pas. On fournit un `require` natif en tête de fichier (sinon : « Dynamic require of "url" »).
const banniereRequire = { js: "import { createRequire as __creerRequire } from 'node:module'; const require = __creerRequire(import.meta.url);" };

/**
 * Options esbuild de chaque sortie (source unique, réutilisée par `tests/ui/outils/construire-copie.mjs`
 * pour que la copie de bout en bout soit identique à `dist/`).
 */
export function creerConfigurations() {
  const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
  return {
    worker: {
      ...presets.esbuild.worker,
      external: [...presets.esbuild.worker.external, ...externesVectorisation],
      banner: banniereRequire,
    },
    // Sous-processus de vectorisation locale : lancé par `fork` à côté du worker (dist/processus-vectoriseur.js).
    vectoriseur: {
      ...presets.esbuild.worker,
      entryPoints: ["src/connaissances/processus-vectoriseur.ts"],
      outdir: undefined,
      outfile: "dist/processus-vectoriseur.js",
      external: externesVectorisation,
      banner: banniereRequire,
    },
    // Fil isolé de l'extraction des documents (worker_threads, mémoire limitée, arrêt net à l'échéance) :
    // chargé par `extraireDocument` à côté du worker (dist/extraction-worker.js).
    extraction: {
      ...presets.esbuild.worker,
      entryPoints: ["src/connaissances/extraction/extraction-worker.ts"],
      outdir: undefined,
      outfile: "dist/extraction-worker.js",
      // pdfjs n'est pas empaqueté : son « fake worker » (pdf.worker.mjs) doit rester à côté de son fichier.
      external: [...presets.esbuild.worker.external, ...externesVectorisation, "pdfjs-dist", "pdfjs-dist/*"],
      banner: banniereRequire,
    },
    manifest: presets.esbuild.manifest,
    ui: presets.esbuild.ui,
    // Scène 3D de la frise (three.js) : fichier voisin de l'interface, chargé à la demande par import dynamique
    // (l'hôte importe l'entrée de l'interface depuis une adresse blob:, donc pas de découpage relatif automatique).
    scene3d: {
      ...presets.esbuild.ui,
      entryPoints: { "frise-3d": "src/ui/frise3d/frise-3d.ts" },
      // Le modèle Blender est embarqué dans le fichier (octets bruts) : pas de route de plus à servir.
      loader: { ".glb": "binary" },
      external: [],
      minify: true,
      sourcemap: false,
    },
  };
}

// Construction : seulement quand le fichier est lancé directement (pas quand il est importé).
// Chemins réels comparés : un lien symbolique ne doit pas rendre la garde fausse (la construction serait sautée en silence).
const lanceDirectement = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (lanceDirectement) {
  const configs = creerConfigurations();
  const workerCtx = await esbuild.context(configs.worker);
  const vectoriseurCtx = await esbuild.context(configs.vectoriseur);
  const extractionCtx = await esbuild.context(configs.extraction);
  const manifestCtx = await esbuild.context(configs.manifest);
  const uiCtx = await esbuild.context(configs.ui);
  const scene3dCtx = await esbuild.context(configs.scene3d);

  if (watch) {
    await Promise.all([workerCtx.watch(), vectoriseurCtx.watch(), extractionCtx.watch(), manifestCtx.watch(), uiCtx.watch(), scene3dCtx.watch()]);
    console.log("esbuild watch mode enabled for worker, extraction worker, manifest, and ui");
  } else {
    await Promise.all([workerCtx.rebuild(), vectoriseurCtx.rebuild(), extractionCtx.rebuild(), manifestCtx.rebuild(), uiCtx.rebuild(), scene3dCtx.rebuild()]);
    await Promise.all([workerCtx.dispose(), vectoriseurCtx.dispose(), extractionCtx.dispose(), manifestCtx.dispose(), uiCtx.dispose(), scene3dCtx.dispose()]);
  }
}
