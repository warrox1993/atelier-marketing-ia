/**
 * Extraction PDF avec `pdfjs-dist` (lot R2).
 *
 * Sécurité : `isEvalSupported: false` ferme la CVE-2024-4367 (exécution de code via une police
 * forgée) ; XFA, polices système et chargement distant sont aussi coupés. Le texte est lu, rien n'est
 * rendu ni exécuté. Dans la 6.4.299 épinglée, le chemin `eval` a été supprimé du code (aucun `eval` ni
 * `new Function` dans les deux fichiers de la version « legacy ») et l'option n'existe plus dans les
 * types : elle est passée quand même, par précaution, au cas où une mise à jour la réintroduirait.
 */
import { inflateSync } from "node:zlib";
import type { BlocTexte } from "./decoupage.js";
import { type LimitesExtraction, RefusExtraction } from "./limites.js";
import { nettoyerTexte } from "./normalisation.js";
import { blocsParTitres } from "./texte.js";

/** Ligne qui ressemble à un titre : numérotée (« 2.1 Franchise ») ou toute en majuscules, courte, sans point final. */
const MOTIF_TITRE = /^(?:\d{1,2}(?:\.\d{1,2}){0,3}[.)]?\s+\S.{0,78}|[A-ZÀ-ÝŒ][A-ZÀ-ÝŒ0-9 '’\-:]{3,80})$/u;
function ressembleATitre(ligne: string): boolean {
  return ligne.length <= 90 && !/[.!?;,]$/u.test(ligne) && MOTIF_TITRE.test(ligne);
}

/** Seuil sous lequel un PDF est considéré comme une image scannée (aucun texte exploitable). */
const CARACTERES_MIN_PDF = 20;

export interface SortiePdf {
  blocs: BlocTexte[];
  nbPages: number;
}

/**
 * Pré-contrôle des flux compressés (FlateDecode) avant pdfjs : chaque flux est décompressé avec un
 * plafond de sortie (`maxOutputLength`), et la somme ne doit pas dépasser `decompresseOctetsMax`.
 * Une « bombe » (100 Mo de texte dans 100 Ko) est ainsi refusée avant que pdfjs n'en construise
 * le texte, ce que la limite de mémoire du fil isolé ne contient pas toujours (Node peut alors
 * arrêter tout le processus). Balayage linéaire par `indexOf` ; un flux illisible (chiffré, autre
 * filtre) est ignoré ici et laissé à pdfjs.
 */
export function verifierFluxPdf(octets: Uint8Array, limites: LimitesExtraction): void {
  const tampon = Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength);
  let total = 0;
  let i = 0;
  for (;;) {
    const debut = tampon.indexOf("stream", i, "latin1");
    if (debut < 0) return;
    let corps = debut + 6;
    if (tampon[corps] === 0x0d) corps += 1;
    if (tampon[corps] === 0x0a) corps += 1;
    const fin = tampon.indexOf("endstream", corps, "latin1");
    if (fin < 0) return;
    // « endstream » contient « stream » : on repart après la fin du flux.
    i = fin + 9;
    if (corps === debut + 6) continue; // « stream » sans fin de ligne : pas un début de flux
    const reste = limites.decompresseOctetsMax - total;
    try {
      total += inflateSync(tampon.subarray(corps, fin), { maxOutputLength: reste + 1, finishFlush: 2 /* Z_SYNC_FLUSH */ }).byteLength;
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) total = limites.decompresseOctetsMax + 1;
      else continue;
    }
    if (total > limites.decompresseOctetsMax) {
      throw new RefusExtraction("archive_trop_volumineuse", `PDF dont les flux décompressés dépassent ${Math.round(limites.decompresseOctetsMax / 1_048_576)} Mo.`);
    }
  }
}

export async function extrairePdf(octets: Uint8Array, limites: LimitesExtraction, echeance: number): Promise<SortiePdf> {
  verifierFluxPdf(octets, limites);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs transfère le tampon : on lui donne une copie.
  const options = {
    data: new Uint8Array(octets),
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  };
  const tache = pdfjs.getDocument(options);
  let doc;
  try {
    doc = await tache.promise;
  } catch (e) {
    await tache.destroy().catch(() => undefined);
    const nom = (e as { name?: string }).name;
    if (nom === "PasswordException") throw new RefusExtraction("document_protege", "PDF protégé par mot de passe : il ne peut pas être lu.");
    throw new RefusExtraction("fichier_illisible", "PDF illisible ou corrompu.");
  }
  try {
    if (doc.numPages > limites.pagesMax) {
      throw new RefusExtraction("trop_de_pages", `PDF de ${doc.numPages} pages : la limite est de ${limites.pagesMax} pages.`);
    }
    const blocs: BlocTexte[] = [];
    let titre: string | null = null;
    let caracteres = 0;
    for (let numero = 1; numero <= doc.numPages; numero += 1) {
      if (Date.now() >= echeance) throw new RefusExtraction("delai_depasse", `Extraction interrompue : durée maximale de ${limites.delaiMs / 1000} s dépassée.`);
      const page = await doc.getPage(numero);
      const contenu = await page.getTextContent();
      let brut = "";
      for (const item of contenu.items) {
        if ("str" in item) brut += item.str + (item.hasEOL ? "\n" : "");
        // Plafond par page : une page démesurée est refusée sans attendre la fin du document.
        if (brut.length > limites.caracteresParPageMax) {
          throw new RefusExtraction("texte_trop_volumineux", `Page ${numero} : texte supérieur à ${limites.caracteresParPageMax} caractères.`);
        }
      }
      page.cleanup();
      const lignes = nettoyerTexte(brut).split("\n").map((l) => l.trim()).filter(Boolean);
      caracteres += lignes.reduce((s, l) => s + l.length, 0);
      if (caracteres > limites.caracteresMax) {
        throw new RefusExtraction("texte_trop_volumineux", `Texte extrait supérieur à ${limites.caracteresMax} caractères.`);
      }
      const elements = lignes.map((texte) => ({ type: ressembleATitre(texte) ? ("titre" as const) : ("texte" as const), texte }));
      const dePage = blocsParTitres(elements, { page: numero, feuille: null }, titre);
      for (const e of elements) if (e.type === "titre") titre = e.texte;
      blocs.push(...dePage);
    }
    if (caracteres < CARACTERES_MIN_PDF) {
      throw new RefusExtraction("pdf_scanne", "PDF sans texte exploitable (probablement un scan) : la reconnaissance de caractères n'est pas prise en charge.");
    }
    return { blocs, nbPages: doc.numPages };
  } finally {
    await tache.destroy().catch(() => undefined);
  }
}
