/**
 * Limites de l'extraction (lot R2) et motifs de refus.
 *
 * Un fichier qui dépasse une limite n'est jamais tronqué en silence : il est refusé avec un motif stable
 * (`code`) et un message en français destiné à l'utilisateur.
 */

export interface LimitesExtraction {
  /** Taille maximale du fichier reçu, en octets. */
  octetsMax: number;
  /** Nombre maximal de pages (PDF) ou de feuilles (XLSX). */
  pagesMax: number;
  /** Durée maximale de l'extraction, en millisecondes. */
  delaiMs: number;
  /** Nombre maximal de caractères de texte extrait (garde-fou contre les archives piégées). */
  caracteresMax: number;
  /** Taille décompressée maximale d'un DOCX ou d'un XLSX (archive ZIP), en octets. */
  decompresseOctetsMax: number;
  /** Nombre maximal de lignes lues par feuille XLSX. */
  lignesParFeuilleMax: number;
  /** Nombre maximal de caractères de texte lus sur une seule page de PDF. */
  caracteresParPageMax: number;
  /** Mémoire maximale (tas V8, en Mo) du fil d'exécution isolé qui fait l'extraction. */
  memoireMaxMo: number;
}

export const LIMITES_PAR_DEFAUT: Readonly<LimitesExtraction> = Object.freeze({
  octetsMax: 20 * 1024 * 1024,
  pagesMax: 300,
  delaiMs: 30_000,
  caracteresMax: 5_000_000,
  decompresseOctetsMax: 20 * 1024 * 1024,
  lignesParFeuilleMax: 20_000,
  caracteresParPageMax: 200_000,
  memoireMaxMo: 512,
});

export type MotifRefus =
  | "format_non_supporte"
  | "fichier_vide"
  | "fichier_trop_volumineux"
  | "trop_de_pages"
  | "texte_trop_volumineux"
  | "archive_trop_volumineuse"
  | "delai_depasse"
  | "pdf_scanne"
  | "document_protege"
  | "fichier_illisible"
  | "memoire_depassee";

export class RefusExtraction extends Error {
  readonly code: MotifRefus;
  constructor(code: MotifRefus, message: string) {
    super(message);
    this.name = "RefusExtraction";
    this.code = code;
  }
}

export function resoudreLimites(partielles?: Partial<LimitesExtraction>): LimitesExtraction {
  return { ...LIMITES_PAR_DEFAUT, ...(partielles ?? {}) };
}
