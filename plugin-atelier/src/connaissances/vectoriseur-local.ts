/**
 * Modèle local `bge-m3` : constantes épinglées et vérification des fichiers (lot R3,
 * `docs/rag-conception.md` §9 et §13).
 *
 * - Modèle : `Xenova/bge-m3`, quantification q8, fichiers LOCAUX seulement, chacun vérifié par SHA-256
 *   contre la révision épinglée ci-dessous (empreintes publiées par Hugging Face, API `?blobs=true`,
 *   15/10/2026). Le chargement lui-même (ONNX Runtime + `@huggingface/tokenizers`, dans un
 *   sous-processus) est dans `src/serveur/connaissances/vectorisation.ts`.
 * - Ce fichier ne dépend que de modules `node:` : le script `scripts/telecharger-modele.mjs` l'importe
 *   directement (Node retire les types), il ne doit donc contenir ni énumération ni import relatif.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";

export const MODELE_BGE_M3 = {
  id: "Xenova/bge-m3",
  revision: "4de13258303883538bd53b696b452bf8099f0858",
  dimension: 1024,
  dtype: "q8",
  pooling: "cls",
  fichiers: {
    "onnx/model_quantized.onnx": "0826f8c1ab9edf1801db86c61919d4d108e8bfc0b809ec823ad366882ff0b77d",
    "tokenizer.json": "6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790",
    "config.json": "734a79bf12d388c1467a4e3ab625f45de7f6906cffcfb93a1eca1787504bed95",
    "tokenizer_config.json": "7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4",
  } as Record<string, string>,
} as const;

/** URL de téléchargement d'un fichier à la révision épinglée (jamais `main`). */
export function urlFichierModele(fichier: string): string {
  return `https://huggingface.co/${MODELE_BGE_M3.id}/resolve/${MODELE_BGE_M3.revision}/${fichier}`;
}

function sha256Fichier(chemin: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const h = createHash("sha256");
    createReadStream(chemin)
      .on("data", (morceau) => h.update(morceau))
      .on("error", rejeter)
      .on("end", () => resoudre(h.digest("hex")));
  });
}

/** Vérifie chaque fichier du modèle ; lève une erreur au premier écart. Renvoie l'empreinte globale. */
export async function verifierModele(dossierModeles: string): Promise<string> {
  const global = createHash("sha256");
  for (const [fichier, attendu] of Object.entries(MODELE_BGE_M3.fichiers).sort()) {
    const obtenu = await sha256Fichier(path.join(dossierModeles, MODELE_BGE_M3.id, fichier));
    if (obtenu !== attendu) throw new Error(`Empreinte du modèle incorrecte pour ${fichier}`);
    global.update(`${fichier}:${obtenu}\n`);
  }
  return global.digest("hex");
}
