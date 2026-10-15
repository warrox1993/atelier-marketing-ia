/**
 * Sous-processus de vectorisation locale (lot R3, `docs/rag-conception.md` §13.8).
 *
 * Lancé par `child_process.fork` depuis `src/serveur/connaissances/vectorisation.ts` ; il parle par messages
 * (canal IPC JSON) et porte tout ce qui pèse en mémoire (session ONNX, environ 1,5 Go) : le parent l'arrête
 * après une période d'inactivité pour rendre cette mémoire au système.
 *
 * Messages reçus : `{ type: "charger", id, dossierModele, fichierModele, tailleMax, threads? }`,
 * `{ type: "vectoriser", id, textes }`, `{ type: "arreter" }`.
 * Messages envoyés : `{ type: "pret", id }`, `{ type: "resultat", id, vecteurs }` (un vecteur float32
 * petit-boutiste par texte, en base64 : un tableau de nombres JSON serait 5 fois plus gros),
 * `{ type: "erreur", id, message }`.
 *
 * Fichier AUTONOME : ni import relatif ni énumération TypeScript, pour que Node l'exécute tel quel
 * (retrait des types) comme une fois compilé par esbuild.
 *
 * Modèle : entrée tronquée à `tailleMax` jetons (512), pooling CLS (premier jeton), normalisation L2.
 */
import path from "node:path";

interface TenseurOrt {
  data: Float32Array | BigInt64Array;
  dims: readonly number[];
}
interface SessionOrt {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(entrees: Record<string, unknown>): Promise<Record<string, TenseurOrt>>;
}
interface ModuleOrt {
  InferenceSession: { create(chemin: string, options?: Record<string, unknown>): Promise<SessionOrt> };
  Tensor: new (type: string, donnees: BigInt64Array, dims: number[]) => unknown;
}
interface JetonnerTexte {
  encode(texte: string): { ids: number[]; attention_mask: number[] };
}

const ID_PADDING = 1; // `<pad>` de XLM-RoBERTa, base de bge-m3
const ID_FIN = 2; // `</s>`

let ort: ModuleOrt | null = null;
let session: SessionOrt | null = null;
let jetonneur: JetonnerTexte | null = null;
let tailleMax = 512;
let dimension = 1024;

async function lireJson(chemin: string): Promise<unknown> {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(chemin, "utf8"));
}

async function charger(m: { dossierModele: string; fichierModele: string; tailleMax: number; threads?: number }) {
  tailleMax = m.tailleMax;
  ort = (await import("onnxruntime-node")) as unknown as ModuleOrt;
  const { Tokenizer } = await import("@huggingface/tokenizers");
  const json = await lireJson(path.join(m.dossierModele, "tokenizer.json"));
  const config = await lireJson(path.join(m.dossierModele, "tokenizer_config.json"));
  jetonneur = new Tokenizer(json as never, config as never) as unknown as JetonnerTexte;
  session = await ort.InferenceSession.create(path.join(m.dossierModele, m.fichierModele), {
    executionProviders: ["cpu"],
    ...(m.threads ? { intraOpNumThreads: m.threads } : {}),
  });
}

/** Jetons d'un texte, tronqués à `tailleMax` en gardant le jeton de fin. */
function jetons(texte: string): number[] {
  const ids = jetonneur!.encode(texte).ids;
  if (ids.length <= tailleMax) return ids;
  const coupe = ids.slice(0, tailleMax);
  coupe[tailleMax - 1] = ID_FIN;
  return coupe;
}

async function vectoriser(textes: string[]): Promise<string[]> {
  if (!ort || !session || !jetonneur) throw new Error("Modèle non chargé");
  const lots = textes.map(jetons);
  const longueur = Math.max(...lots.map((l) => l.length));
  const ids = new BigInt64Array(lots.length * longueur).fill(BigInt(ID_PADDING));
  const masque = new BigInt64Array(lots.length * longueur);
  lots.forEach((l, i) => {
    l.forEach((id, j) => {
      ids[i * longueur + j] = BigInt(id);
      masque[i * longueur + j] = 1n;
    });
  });
  const dims = [lots.length, longueur];
  const entrees: Record<string, unknown> = {
    input_ids: new ort.Tensor("int64", ids, dims),
    attention_mask: new ort.Tensor("int64", masque, dims),
  };
  const sortie = await session.run(entrees);
  const etats = sortie[session.outputNames[0]!]!;
  const [n, longueurSortie, d] = etats.dims as [number, number, number];
  if (n !== lots.length || d !== dimension) throw new Error(`Sortie inattendue ${etats.dims.join("x")}`);
  const donnees = etats.data as Float32Array;
  return lots.map((_, i) => {
    // Pooling CLS : premier jeton de chaque texte, puis normalisation L2.
    const v = donnees.slice(i * longueurSortie * d, i * longueurSortie * d + d);
    let somme = 0;
    for (let k = 0; k < d; k += 1) somme += v[k]! * v[k]!;
    const norme = Math.sqrt(somme) || 1;
    for (let k = 0; k < d; k += 1) v[k] = v[k]! / norme;
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
  });
}

function repondre(message: Record<string, unknown>): void {
  process.send?.(message);
}

process.on("disconnect", () => process.exit(0)); // le parent a disparu : ne jamais rester orphelin

process.on("message", (m: Record<string, unknown>) => {
  const id = m.id as number | undefined;
  const echec = (e: unknown) => repondre({ type: "erreur", id, message: e instanceof Error ? e.message : String(e) });
  switch (m.type) {
    case "charger":
      charger(m as never).then(() => repondre({ type: "pret", id }), echec);
      break;
    case "vectoriser":
      vectoriser(m.textes as string[]).then((vecteurs) => repondre({ type: "resultat", id, vecteurs }), echec);
      break;
    case "arreter":
      process.exit(0);
  }
});
