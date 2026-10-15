/**
 * Fil d'exécution isolé (`worker_threads`) de l'extraction des documents.
 *
 * Lancé par `extraireDocument` (index.ts) avec une limite de mémoire (`resourceLimits`) et arrêté par
 * `worker.terminate()` à l'échéance : une analyse synchrone qui s'emballe (motif, archive, PDF piégé)
 * ne bloque plus le serveur, et un dépassement de mémoire n'arrête que ce fil.
 *
 * Empaqueté à part dans `dist/extraction-worker.js` (voir `esbuild.config.mjs`).
 */
import { parentPort, workerData } from "node:worker_threads";
import { extraireDocumentDansLeFil, type MessageExtraction, type TacheExtraction } from "./index.js";
import { RefusExtraction } from "./limites.js";

const tache = workerData as TacheExtraction;

async function executer(): Promise<MessageExtraction> {
  try {
    const resultat = await extraireDocumentDansLeFil(
      { nom: tache.nom, contenu: tache.contenu },
      { limites: tache.limites, decoupage: tache.decoupage },
    );
    return { type: "resultat", resultat };
  } catch (e) {
    if (e instanceof RefusExtraction) return { type: "refus", code: e.code, message: e.message };
    return { type: "erreur", message: e instanceof Error ? e.message : String(e) };
  }
}

void executer().then((message) => parentPort?.postMessage(message));
