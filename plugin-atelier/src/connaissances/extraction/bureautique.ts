/**
 * Extraction DOCX (mammoth) et XLSX (SheetJS 0.20.3, version corrigée du CDN officiel) (lot R2).
 *
 * Ni macro ni formule n'est évaluée : on ne lit que le texte et les valeurs affichées.
 */
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { BlocTexte } from "./decoupage.js";
import { type LimitesExtraction, RefusExtraction } from "./limites.js";
import { nettoyerTexte } from "./normalisation.js";
import { blocsParTitres, extraireHtml, type TexteStructure } from "./texte.js";

/**
 * Somme des tailles décompressées annoncées par l'annuaire central d'une archive ZIP, lue sans rien
 * décompresser (protection contre les « bombes » de décompression). Renvoie `null` si l'archive est
 * illisible.
 */
export function tailleDecompressee(octets: Uint8Array): number | null {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let fin = -1;
  for (let i = octets.byteLength - 22; i >= Math.max(0, octets.byteLength - 22 - 65_535); i -= 1) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const entrees = v.getUint16(fin + 10, true);
  let pos = v.getUint32(fin + 16, true);
  let total = 0;
  for (let n = 0; n < entrees; n += 1) {
    if (pos + 46 > octets.byteLength || v.getUint32(pos, true) !== 0x02014b50) return null;
    total += v.getUint32(pos + 24, true);
    pos += 46 + v.getUint16(pos + 28, true) + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
  }
  return total;
}

export function verifierArchive(octets: Uint8Array, limites: LimitesExtraction): void {
  const taille = tailleDecompressee(octets);
  if (taille === null) throw new RefusExtraction("fichier_illisible", "Archive Office illisible ou corrompue.");
  if (taille > limites.decompresseOctetsMax) {
    throw new RefusExtraction("archive_trop_volumineuse", `Contenu décompressé de ${Math.round(taille / 1_048_576)} Mo : la limite est de ${Math.round(limites.decompresseOctetsMax / 1_048_576)} Mo.`);
  }
}

export async function extraireDocx(octets: Uint8Array): Promise<TexteStructure> {
  let html: string;
  try {
    const r = await mammoth.convertToHtml(
      { buffer: Buffer.from(octets) },
      { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
    );
    html = r.value;
  } catch {
    throw new RefusExtraction("fichier_illisible", "Document Word illisible ou corrompu.");
  }
  return extraireHtml(html);
}

export interface SortieXlsx {
  blocs: BlocTexte[];
  nbFeuilles: number;
}

export function extraireXlsx(octets: Uint8Array, limites: LimitesExtraction, echeance: number): SortieXlsx {
  let classeur: XLSX.WorkBook;
  try {
    classeur = XLSX.read(octets, {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      bookVBA: false,
      sheetRows: limites.lignesParFeuilleMax + 1,
    });
  } catch {
    throw new RefusExtraction("fichier_illisible", "Classeur Excel illisible ou corrompu.");
  }
  if (classeur.SheetNames.length > limites.pagesMax) {
    throw new RefusExtraction("trop_de_pages", `Classeur de ${classeur.SheetNames.length} feuilles : la limite est de ${limites.pagesMax}.`);
  }
  const blocs: BlocTexte[] = [];
  let caracteres = 0;
  for (const nom of classeur.SheetNames) {
    if (Date.now() >= echeance) throw new RefusExtraction("delai_depasse", `Extraction interrompue : durée maximale de ${limites.delaiMs / 1000} s dépassée.`);
    const feuille = classeur.Sheets[nom];
    if (!feuille) continue;
    const lignes = XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, raw: false, blankrows: false, defval: "" });
    if (lignes.length > limites.lignesParFeuilleMax) {
      throw new RefusExtraction("trop_de_pages", `Feuille « ${nom} » de plus de ${limites.lignesParFeuilleMax} lignes.`);
    }
    const entetes = (lignes[0] ?? []).map((c) => nettoyerTexte(String(c ?? "")));
    const corps: string[] = [];
    // Chaque ligne devient « En-tête : valeur ; … » pour rester compréhensible hors du tableau.
    lignes.slice(1).forEach((ligne) => {
      const cellules = ligne
        .map((c, i) => {
          const v = nettoyerTexte(String(c ?? ""));
          if (!v) return "";
          const e = entetes[i];
          return e ? `${e} : ${v}` : v;
        })
        .filter(Boolean);
      if (cellules.length) corps.push(`${cellules.join(" ; ")}.`);
    });
    if (!corps.length && entetes.some(Boolean)) corps.push(`${entetes.filter(Boolean).join(" ; ")}.`);
    caracteres += corps.reduce((s, l) => s + l.length, 0);
    if (caracteres > limites.caracteresMax) {
      throw new RefusExtraction("texte_trop_volumineux", `Texte extrait supérieur à ${limites.caracteresMax} caractères.`);
    }
    blocs.push(...blocsParTitres(corps.map((texte) => ({ type: "texte" as const, texte })), { page: null, feuille: nom }, nom));
  }
  return { blocs, nbFeuilles: classeur.SheetNames.length };
}
