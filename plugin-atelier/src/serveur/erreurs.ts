/**
 * Erreurs métier de l'atelier, converties en réponses HTTP par le routeur.
 * Les messages sont exploitables sans exposer de secret (cahier §12).
 */
import type { CodeErreur } from "../contrats/index.js";

const STATUT_PAR_CODE: Record<CodeErreur, number> = {
  entree_invalide: 400,
  introuvable: 404,
  acces_refuse: 403,
  hors_entreprise: 404,
  hors_projet: 403,
  role_non_autorise: 403,
  producteur_ne_peut_pas_relire: 403,
  revision_perimee: 409,
  porte_absente: 409,
  elevation_refusee: 403,
  diffusion_refusee: 403,
  url_refusee: 422,
  import_refuse: 422,
  dictee_indisponible: 503,
  voix_non_configuree: 503,
  voix_indisponible: 503,
  conflit: 409,
  non_implemente: 501,
  erreur_interne: 500,
};

export class ErreurAtelier extends Error {
  readonly code: CodeErreur;
  readonly details: unknown;
  constructor(code: CodeErreur, message: string, details?: unknown) {
    super(message);
    this.name = "ErreurAtelier";
    this.code = code;
    this.details = details;
  }
  get statut(): number {
    return STATUT_PAR_CODE[this.code];
  }
}

export function erreur(code: CodeErreur, message: string, details?: unknown): never {
  throw new ErreurAtelier(code, message, details);
}

/** Convertit une erreur Zod en ErreurAtelier lisible (chemins + messages, pas de valeur brute). */
export function erreurValidation(prefixe: string, issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): never {
  const details = issues.slice(0, 20).map((i) => ({ chemin: i.path.map(String).join("."), message: i.message }));
  throw new ErreurAtelier("entree_invalide", `${prefixe} : entrée invalide`, details);
}
