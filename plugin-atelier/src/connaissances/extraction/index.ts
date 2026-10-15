/**
 * Extraction du texte des documents d'un client et découpage en passages (lot R2).
 *
 * Entrée : un nom de fichier et ses octets. Sortie : des passages prêts à vectoriser (lots suivants),
 * ou un refus motivé. Rien n'est écrit, aucune base ni route n'est touchée.
 */
import { injectionsSignalees } from "../../serveur/contenu-externe.js";
import { extraireDocx, extraireXlsx, verifierArchive } from "./bureautique.js";
import { decouperEnPassages, type BlocTexte, type ParametresDecoupage, type Passage } from "./decoupage.js";
import { type LimitesExtraction, RefusExtraction, resoudreLimites } from "./limites.js";
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

export async function extraireDocument(
  doc: DocumentEntrant,
  options: { limites?: Partial<LimitesExtraction>; decoupage?: Partial<ParametresDecoupage> } = {},
): Promise<ResultatExtraction> {
  const limites = resoudreLimites(options.limites);
  const format = detecterFormat(doc.nom);
  if (!format) {
    throw new RefusExtraction("format_non_supporte", `Format non pris en charge : « ${doc.nom} ». Formats acceptés : PDF, DOCX, XLSX, Markdown, texte, HTML.`);
  }
  if (doc.contenu.byteLength === 0) throw new RefusExtraction("fichier_vide", "Fichier vide.");
  if (doc.contenu.byteLength > limites.octetsMax) {
    throw new RefusExtraction("fichier_trop_volumineux", `Fichier de ${(doc.contenu.byteLength / 1_048_576).toFixed(1)} Mo : la limite est de ${(limites.octetsMax / 1_048_576).toFixed(1)} Mo.`);
  }
  verifierSignature(format, doc.contenu);

  const echeance = Date.now() + limites.delaiMs;
  let minuteur: NodeJS.Timeout | undefined;
  const delai = new Promise<never>((_resolu, rejete) => {
    minuteur = setTimeout(() => rejete(new RefusExtraction("delai_depasse", `Extraction interrompue : durée maximale de ${limites.delaiMs / 1000} s dépassée.`)), limites.delaiMs);
  });
  let extrait;
  try {
    extrait = await Promise.race([extraireBlocs(doc, format, limites, echeance), delai]);
  } finally {
    clearTimeout(minuteur);
  }

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
