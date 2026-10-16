/**
 * Résumé de la liste des prospects (`GET /prospects`).
 *
 * Une page de 50 prospects entiers pèse environ 170 Ko (100 : 335 Ko) sur une seule ligne, illisible d'un coup
 * pour un agent. La route renvoie donc par défaut une page RÉSUMÉE (une fiche courte par prospect, moins de
 * 40 000 caractères même à 100 par page) ; la pagination (`page`, `parPage`) et les filtres sont inchangés,
 * `?partie=detail&prospectId=` rend un prospect entier et `?vue=complete` le corps d'origine. Fonction pure.
 */
import type { Prospect } from "../contrats/index.js";

type Dict = Record<string, unknown>;

/** Page telle que `prospects.lister` la rend (forme historique). */
export interface PageProspectsComplete {
  total: number;
  page: number;
  pages: number;
  prospects: Prospect[];
}

/** Longueur maximale d'une dénomination dans une fiche courte (le détail la donne en entier). */
const DENOMINATION_MAX = 80;

/** Fiche courte d'un prospect : de quoi le reconnaître, le classer et demander son détail. Aucune coordonnée. */
export function fichePourResume(p: Prospect): Dict {
  const nom = p.denomination;
  return {
    id: p.id,
    cible: p.cible,
    identifiant: `${p.identifiant.type}:${p.identifiant.valeur}`,
    ...(p.numeroBce && p.identifiant.type !== "numero_bce" ? { numeroBce: p.numeroBce } : {}),
    denomination: nom !== null && nom.length > DENOMINATION_MAX ? `${nom.slice(0, DENOMINATION_MAX - 1)}…` : nom,
    nace: p.nace.slice(0, 3),
    lieu: [p.zone.codePostal, p.zone.commune].filter(Boolean).join(" ") || null,
    statut: p.statut,
    mode: p.mode,
    ...(p.motifsExclusion.length ? { motifsExclusion: p.motifsExclusion.map((m) => m.motif) } : {}),
    score: p.score ? p.score.valeur : null,
    confiance: p.confiance ? { valeur: p.confiance.valeur, qualifie: p.confiance.qualifie } : null,
  };
}

/** Résumé par défaut de la route : total, pages et fiches courtes. */
export function resumerProspects(page: PageProspectsComplete): Dict {
  return {
    vue: "resume",
    pourAllerPlus:
      "Résumé : une fiche courte par prospect. Un prospect entier : ?partie=detail&prospectId=<id> ; " +
      "le compte rendu d'un lead : GET /prospects/<id>/compte-rendu ; page suivante : &page=<n> ; ?vue=complete pour les prospects entiers.",
    total: page.total,
    page: page.page,
    pages: page.pages,
    prospects: page.prospects.map(fichePourResume),
  };
}
