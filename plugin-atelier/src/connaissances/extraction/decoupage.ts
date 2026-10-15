/**
 * Découpage en passages (lot R2) : 200 à 400 jetons environ, avec chevauchement.
 *
 * Déterministe : la même entrée donne toujours les mêmes passages. Un passage ne franchit jamais une
 * frontière de bloc (page, feuille ou section), ce qui garantit que sa page, sa feuille et son titre
 * sont exacts.
 */
import { injectionsSignalees } from "../../serveur/contenu-externe.js";
import { detecterLangue, estimerJetons, type Langue, texteNormalise } from "./normalisation.js";

/** Morceau de texte homogène : une seule page ou feuille, une seule section. */
export interface BlocTexte {
  texte: string;
  page: number | null;
  feuille: string | null;
  titre: string | null;
}

export interface Passage {
  /** Rang du passage dans le document, à partir de 0. */
  ordre: number;
  texte: string;
  texte_normalise: string;
  page: number | null;
  feuille: string | null;
  titre_section: string | null;
  langue: Langue;
  jetons: number;
  /** Consignes cachées repérées dans ce passage (vide si rien de suspect). */
  consignes_cachees: string[];
}

export interface ParametresDecoupage {
  /** Jetons visés : on clôt un passage dès qu'il les atteint. */
  cibleJetons: number;
  /** Plafond dur d'un passage. */
  maxJetons: number;
  /** Jetons repris du passage précédent au début du suivant. */
  chevauchementJetons: number;
}

export const DECOUPAGE_PAR_DEFAUT: Readonly<ParametresDecoupage> = Object.freeze({
  cibleJetons: 300,
  maxJetons: 400,
  chevauchementJetons: 50,
});

/** Découpe un bloc en unités (lignes puis phrases) dont aucune ne dépasse `maxJetons`. */
function unites(texte: string, maxJetons: number): string[] {
  const resultat: string[] = [];
  const maxCaracteres = maxJetons * 4;
  for (const ligne of texte.split("\n")) {
    for (const phrase of ligne.split(/(?<=[.!?…])\s+/u)) {
      const p = phrase.trim();
      if (!p) continue;
      if (p.length <= maxCaracteres) {
        resultat.push(p);
        continue;
      }
      // Phrase démesurée (tableau, texte sans ponctuation) : coupe aux espaces.
      let reste = p;
      while (reste.length > maxCaracteres) {
        let coupe = reste.lastIndexOf(" ", maxCaracteres);
        if (coupe <= 0) coupe = maxCaracteres;
        resultat.push(reste.slice(0, coupe).trim());
        reste = reste.slice(coupe).trim();
      }
      if (reste) resultat.push(reste);
    }
  }
  return resultat;
}

function decouperBloc(bloc: BlocTexte, p: ParametresDecoupage): string[] {
  const liste = unites(bloc.texte, p.maxJetons);
  const passages: string[] = [];
  let courant: string[] = [];
  let jetonsCourant = 0;
  let nouveaux = 0; // unités propres (hors chevauchement) du passage en cours

  const emettre = (): void => {
    if (nouveaux === 0) return;
    passages.push(courant.join(" "));
    // Chevauchement : dernières unités du passage clos, dans la limite du budget.
    const reprise: string[] = [];
    let jetons = 0;
    for (let i = courant.length - 1; i >= 0; i -= 1) {
      const u = courant[i] as string;
      const j = estimerJetons(u) + 1;
      if (jetons + j > p.chevauchementJetons) break;
      reprise.unshift(u);
      jetons += j;
    }
    courant = reprise;
    jetonsCourant = jetons;
    nouveaux = 0;
  };

  for (const u of liste) {
    const j = estimerJetons(u) + 1;
    if (nouveaux > 0 && jetonsCourant + j > p.maxJetons) emettre();
    if (nouveaux === 0 && jetonsCourant + j > p.maxJetons) {
      // Le chevauchement empêcherait de tenir : on repart sans lui.
      courant = [];
      jetonsCourant = 0;
    }
    courant.push(u);
    jetonsCourant += j;
    nouveaux += 1;
    if (jetonsCourant >= p.cibleJetons) emettre();
  }
  emettre();
  return passages;
}

export function decouperEnPassages(blocs: readonly BlocTexte[], parametres?: Partial<ParametresDecoupage>): Passage[] {
  const p = { ...DECOUPAGE_PAR_DEFAUT, ...(parametres ?? {}) };
  const passages: Passage[] = [];
  for (const bloc of blocs) {
    for (const texte of decouperBloc(bloc, p)) {
      passages.push({
        ordre: passages.length,
        texte,
        texte_normalise: texteNormalise(texte),
        page: bloc.page,
        feuille: bloc.feuille,
        titre_section: bloc.titre,
        langue: detecterLangue(texte),
        jetons: estimerJetons(texte),
        consignes_cachees: injectionsSignalees(texte),
      });
    }
  }
  return passages;
}
