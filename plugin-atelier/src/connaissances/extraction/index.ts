/**
 * Extraction du texte des documents d'un client et découpage en passages (lot R2).
 *
 * Entrée : un nom de fichier et ses octets. Sortie : des passages prêts à vectoriser (lots suivants),
 * ou un refus motivé. Rien n'est écrit, aucune base ni route n'est touchée.
 *
 * Isolement : l'analyse tourne dans un fil `worker_threads` (`extraction-worker.ts`) limité en
 * mémoire et arrêté net à l'échéance. Un `Promise.race` dans le même fil n'interrompait pas un calcul
 * synchrone (motif à retour arrière, décompression) : le délai était inopérant.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { injectionsSignalees } from "../../serveur/contenu-externe.js";
import { extraireDocx, extraireXlsx, verifierArchive } from "./bureautique.js";
import { decouperEnPassages, type BlocTexte, type ParametresDecoupage, type Passage } from "./decoupage.js";
import { type LimitesExtraction, type MotifRefus, RefusExtraction, resoudreLimites } from "./limites.js";
import { detecterLangue, type Langue } from "./normalisation.js";
import { extrairePdf } from "./pdf.js";
import { extraireHtml, extraireMarkdown, extraireTexteBrut, type TexteStructure } from "./texte.js";

export { RefusExtraction, LIMITES_PAR_DEFAUT, type LimitesExtraction, type MotifRefus } from "./limites.js";
export { type Passage, type BlocTexte, type ParametresDecoupage, DECOUPAGE_PAR_DEFAUT, decouperEnPassages } from "./decoupage.js";
export { detecterLangue, estimerJetons, nettoyerTexte, texteNormalise, type Langue } from "./normalisation.js";

export type FormatDocument = "pdf" | "docx" | "xlsx" | "markdown" | "texte" | "html";

export interface DocumentEntrant {
  nom: string;
  contenu: Uint8Array;
}

export interface ResultatExtraction {
  nom: string;
  format: FormatDocument;
  langue: Langue;
  /** Pages (PDF) ou feuilles (XLSX) ; `null` pour les formats sans pagination. */
  nbPages: number | null;
  passages: Passage[];
  /** Consignes cachées repérées hors des passages (commentaires HTML ou Markdown) ou à cheval sur deux passages. */
  signalements: string[];
}

const EXTENSIONS: Readonly<Record<string, FormatDocument>> = {
  pdf: "pdf", docx: "docx", xlsx: "xlsx",
  md: "markdown", markdown: "markdown",
  txt: "texte", text: "texte",
  html: "html", htm: "html",
};

export function detecterFormat(nom: string): FormatDocument | null {
  const ext = /\.([a-z0-9]+)$/iu.exec(nom.trim())?.[1]?.toLowerCase();
  return ext ? (EXTENSIONS[ext] ?? null) : null;
}

function commencePar(octets: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((o, i) => octets[i] === o);
}

function verifierSignature(format: FormatDocument, octets: Uint8Array): void {
  const ok =
    format === "pdf" ? commencePar(octets, [0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
      : format === "docx" || format === "xlsx" ? commencePar(octets, [0x50, 0x4b, 0x03, 0x04]) // PK\x03\x04
        : !octets.subarray(0, 4096).includes(0); // texte : pas d'octet nul
  if (!ok) throw new RefusExtraction("fichier_illisible", `Le contenu ne correspond pas à un fichier ${format.toUpperCase()} valide.`);
}

function decoderTexte(octets: Uint8Array): string {
  return new TextDecoder("utf-8").decode(octets);
}

async function extraireBlocs(
  doc: DocumentEntrant,
  format: FormatDocument,
  limites: LimitesExtraction,
  echeance: number,
): Promise<{ blocs: BlocTexte[]; nbPages: number | null; commentaires: string[] }> {
  if (format === "pdf") {
    const r = await extrairePdf(doc.contenu, limites, echeance);
    return { blocs: r.blocs, nbPages: r.nbPages, commentaires: [] };
  }
  if (format === "xlsx") {
    verifierArchive(doc.contenu, limites);
    const r = extraireXlsx(doc.contenu, limites, echeance);
    return { blocs: r.blocs, nbPages: r.nbFeuilles, commentaires: [] };
  }
  let s: TexteStructure;
  if (format === "docx") {
    verifierArchive(doc.contenu, limites);
    s = await extraireDocx(doc.contenu);
  } else if (format === "html") s = extraireHtml(decoderTexte(doc.contenu));
  else if (format === "markdown") s = extraireMarkdown(decoderTexte(doc.contenu));
  else s = extraireTexteBrut(decoderTexte(doc.contenu));
  return { blocs: s.blocs, nbPages: null, commentaires: s.commentaires };
}

/** Contrôles rapides faits avant toute analyse : format, taille, signature. */
function controlesPrealables(doc: DocumentEntrant, limites: LimitesExtraction): FormatDocument {
  const format = detecterFormat(doc.nom);
  if (!format) {
    throw new RefusExtraction("format_non_supporte", `Format non pris en charge : « ${doc.nom} ». Formats acceptés : PDF, DOCX, XLSX, Markdown, texte, HTML.`);
  }
  if (doc.contenu.byteLength === 0) throw new RefusExtraction("fichier_vide", "Fichier vide.");
  if (doc.contenu.byteLength > limites.octetsMax) {
    throw new RefusExtraction("fichier_trop_volumineux", `Fichier de ${(doc.contenu.byteLength / 1_048_576).toFixed(1)} Mo : la limite est de ${(limites.octetsMax / 1_048_576).toFixed(1)} Mo.`);
  }
  verifierSignature(format, doc.contenu);
  return format;
}

export interface OptionsExtraction {
  limites?: Partial<LimitesExtraction>;
  decoupage?: Partial<ParametresDecoupage>;
}

/** Données passées au fil isolé (`workerData`). */
export interface TacheExtraction {
  nom: string;
  contenu: Uint8Array;
  limites: LimitesExtraction;
  decoupage: Partial<ParametresDecoupage> | undefined;
}

/** Message rendu par le fil isolé. */
export type MessageExtraction =
  | { type: "resultat"; resultat: ResultatExtraction }
  | { type: "refus"; code: MotifRefus; message: string }
  | { type: "erreur"; message: string };

/** En-tête du fichier empaqueté : `require` natif pour les paquets CommonJS (mammoth…), comme `esbuild.config.mjs`. */
const BANNIERE_REQUIRE = "import { createRequire as __creerRequire } from 'node:module'; const require = __creerRequire(import.meta.url);";

/**
 * Paquets jamais empaquetés dans le fil isolé : pdfjs charge son « fake worker » (`pdf.worker.mjs`)
 * à côté de son propre fichier, ce qu'un paquet empaqueté ne retrouve plus. Résolu à l'exécution
 * depuis `node_modules` (dépendance d'exécution du plugin).
 */
export const EXTERNES_FIL_EXTRACTION = ["pdfjs-dist", "pdfjs-dist/*"] as const;

let cheminWorkerMemorise: string | null = null;

/**
 * Chemin du fil isolé, résolu depuis `import.meta.url` : `extraction-worker.js` à côté du module une
 * fois empaqueté (`dist/`). Depuis les sources (tests), le même point d'entrée est empaqueté une fois
 * par processus à la volée par esbuild (dépendance de développement) dans `node_modules/.cache/` du
 * plugin (pour résoudre pdfjs) : le fil isolé tourne alors exactement comme en production.
 */
function cheminWorker(): string {
  if (cheminWorkerMemorise) return cheminWorkerMemorise;
  const courant = import.meta.url;
  if (!courant.includes("/src/connaissances/extraction/")) {
    cheminWorkerMemorise = fileURLToPath(new URL("./extraction-worker.js", courant));
    return cheminWorkerMemorise;
  }
  const dossier = fileURLToPath(new URL("../../../node_modules/.cache/atelier-extraction/", courant));
  mkdirSync(dossier, { recursive: true });
  const provisoire = join(dossier, `extraction-worker-${process.pid}-${randomUUID()}.mjs`);
  const final = join(dossier, "extraction-worker.mjs");
  // Nom calculé : esbuild n'essaie pas d'empaqueter esbuild lui-même dans `dist/worker.js`.
  const esbuild = createRequire(courant)(["es", "build"].join("")) as typeof import("esbuild");
  esbuild.buildSync({
    entryPoints: [fileURLToPath(new URL("./extraction-worker.ts", courant))],
    outfile: provisoire,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    logLevel: "error",
    external: [...EXTERNES_FIL_EXTRACTION],
    banner: { js: BANNIERE_REQUIRE },
  });
  // Renommage atomique : un autre processus de test ne lit jamais un fichier à moitié écrit.
  renameSync(provisoire, final);
  cheminWorkerMemorise = final;
  return final;
}

/**
 * Extrait le texte d'un document et le découpe en passages, dans un fil isolé :
 * - mémoire du fil limitée à `limites.memoireMaxMo` (un dépassement donne le refus `memoire_depassee`) ;
 * - fil arrêté net (`terminate`) à `limites.delaiMs` (refus `delai_depasse`), même en plein calcul.
 */
export async function extraireDocument(doc: DocumentEntrant, options: OptionsExtraction = {}): Promise<ResultatExtraction> {
  const limites = resoudreLimites(options.limites);
  controlesPrealables(doc, limites);
  const tache: TacheExtraction = { nom: doc.nom, contenu: doc.contenu, limites, decoupage: options.decoupage };
  const chemin = cheminWorker();
  return new Promise<ResultatExtraction>((resoudre, rejeter) => {
    let fini = false;
    const worker = new Worker(chemin, {
      workerData: tache,
      resourceLimits: { maxOldGenerationSizeMb: limites.memoireMaxMo, maxYoungGenerationSizeMb: 64, stackSizeMb: 4 },
    });
    const terminer = (issue: () => void): void => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      void worker.terminate().catch(() => undefined);
      issue();
    };
    const minuteur = setTimeout(() => {
      terminer(() => rejeter(new RefusExtraction("delai_depasse", `Extraction interrompue : durée maximale de ${limites.delaiMs / 1000} s dépassée.`)));
    }, limites.delaiMs);
    worker.once("message", (m: MessageExtraction) => {
      terminer(() => {
        if (m.type === "resultat") resoudre(m.resultat);
        else if (m.type === "refus") rejeter(new RefusExtraction(m.code, m.message));
        else rejeter(new Error(m.message));
      });
    });
    worker.once("error", (e: Error & { code?: string }) => {
      terminer(() => {
        if (e.code === "ERR_WORKER_OUT_OF_MEMORY") {
          rejeter(new RefusExtraction("memoire_depassee", `Document trop lourd à analyser : mémoire maximale de ${limites.memoireMaxMo} Mo dépassée.`));
        } else rejeter(new RefusExtraction("fichier_illisible", "Extraction impossible : le document a fait échouer l'analyse."));
      });
    });
    worker.once("exit", (code) => {
      terminer(() => rejeter(new RefusExtraction("fichier_illisible", `Extraction interrompue sans résultat (code ${code}).`)));
    });
  });
}

/**
 * Extraction dans le fil courant. Réservée au fil isolé (`extraction-worker.ts`) : tout appelant
 * passe par `extraireDocument`.
 */
export async function extraireDocumentDansLeFil(
  doc: DocumentEntrant,
  options: { limites?: Partial<LimitesExtraction>; decoupage?: Partial<ParametresDecoupage> } = {},
): Promise<ResultatExtraction> {
  const limites = resoudreLimites(options.limites);
  const format = controlesPrealables(doc, limites);
  // Les contrôles d'échéance internes (par page, par feuille) complètent l'arrêt net du fil isolé.
  const echeance = Date.now() + limites.delaiMs;
  const extrait = await extraireBlocs(doc, format, limites, echeance);

  const total = extrait.blocs.reduce((s, b) => s + b.texte.length, 0);
  if (total > limites.caracteresMax) {
    throw new RefusExtraction("texte_trop_volumineux", `Texte extrait supérieur à ${limites.caracteresMax} caractères.`);
  }
  if (total === 0) throw new RefusExtraction("fichier_vide", "Aucun texte exploitable dans le document.");

  const passages = decouperEnPassages(extrait.blocs, options.decoupage);
  const signalements = new Set<string>();
  for (const c of extrait.commentaires) for (const s of injectionsSignalees(c)) signalements.add(`commentaire caché, ${s}`);
  // Une consigne coupée entre deux passages échappe au contrôle par passage : contrôle du bloc entier.
  const dejaVues = new Set(passages.flatMap((p) => p.consignes_cachees));
  for (const b of extrait.blocs) for (const s of injectionsSignalees(b.texte)) if (!dejaVues.has(s)) signalements.add(s);

  const echantillon = extrait.blocs.map((b) => b.texte).join("\n").slice(0, 200_000);
  return { nom: doc.nom, format, langue: detecterLangue(echantillon), nbPages: extrait.nbPages, passages, signalements: [...signalements] };
}
