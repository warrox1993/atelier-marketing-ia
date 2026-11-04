/**
 * Assemblage de la fiche (niveau 1) à partir des affirmations d'un projet.
 *
 * Règle d'or : jamais de valeur sans affirmation, jamais de valeur par défaut.
 * Un champ sans affirmation vaut `{ valeur: null, statut: "non_verifie", affirmationId: null }` :
 * c'est `affirmationId === null` qui signifie « inconnu ».
 */
import { CHAMPS_FICHE, Fiche, type Affirmation, type ChampFiche } from "../../contrats/observatoire.js";
import { derniereStable, type VersionRelevee } from "./collecte.js";

type NomChamp = (typeof CHAMPS_FICHE)[number];

const champInconnu = (): ChampFiche<never> => ({ valeur: null, statut: "non_verifie", affirmationId: null });

/**
 * Convention de valeur : le contrat d'`Affirmation` n'a pas de champ « valeur », donc la valeur d'un
 * champ est le texte brut de l'affirmation (rogné), à condition que le schéma du champ l'accepte.
 * Les URL/dates invalides donnent `null` : on ne découpe ni ne corrige jamais un texte.
 * Un champ liste reçoit un élément par affirmation vérifiée (voir `champListe`).
 */
function valeurDe(a: Affirmation, champ: NomChamp): unknown {
  if (a.statut === "non_verifie") return null; // FR-026 : une affirmation non vérifiée n'affiche pas de valeur.
  const texte = a.texte.trim();
  const essai = Fiche.shape[champ].safeParse({ valeur: texte, statut: a.statut, affirmationId: a.id });
  return essai.success ? texte : null;
}

/** Affirmation active du champ : non remplacée, la dernière dans l'ordre reçu. */
function affirmationActive(affirmations: Affirmation[], champ: NomChamp): Affirmation | null {
  const candidates = affirmations.filter((a) => a.chapitre === `fiche.${champ}` && a.remplaceePar === null);
  return candidates.at(-1) ?? null;
}

// Sonde du schéma : seul un champ liste accepte un tableau (identifiant factice exigé par le contrat).
const estListe = (champ: NomChamp) => Fiche.shape[champ].safeParse({ valeur: [], statut: "non_verifie", affirmationId: "00000000-0000-4000-8000-000000000000" }).success;

/**
 * Champ liste : chaque affirmation active vérifiée apporte un élément (son texte entier). Statut et identifiant
 * sont ceux de la dernière affirmation retenue ; si aucune n'est vérifiée, le champ est « non vérifié ».
 * shortcut: un seul affirmationId par champ liste (les autres éléments restent tracés par leurs ancres dans l'export),
 * passer à affirmationIds[] dans le contrat si la porte doit contrôler chaque élément.
 */
function champListe(affirmations: Affirmation[], champ: NomChamp): ChampFiche<unknown> {
  const actives = affirmations.filter((a) => a.chapitre === `fiche.${champ}` && a.remplaceePar === null);
  // Comme valeurDe : un texte que le schéma du champ refuse est absent, jamais corrigé.
  const verifiees = actives.filter((a) => a.statut !== "non_verifie" && Fiche.shape[champ].safeParse({ valeur: [a.texte.trim()], statut: a.statut, affirmationId: a.id }).success);
  const derniere = verifiees.at(-1) ?? actives.at(-1);
  if (!derniere) return champInconnu();
  const valeur = verifiees.length ? verifiees.map((a) => a.texte.trim()) : null;
  return { valeur, statut: derniere.statut, affirmationId: derniere.id };
}

export function assemblerFiche(_projet: { nom: string }, affirmations: Affirmation[], versions: VersionRelevee[]): Fiche {
  const derniere = derniereStable(versions);
  const stable = derniere?.version ?? null;
  const champs: Record<string, ChampFiche<unknown>> = {};
  for (const champ of CHAMPS_FICHE) {
    if (estListe(champ)) {
      champs[champ] = champListe(affirmations, champ);
      continue;
    }
    const a = affirmationActive(affirmations, champ);
    const valeur = a ? valeurDe(a, champ) : null;
    // La dernière version n'est retenue que si l'affirmation vise exactement la dernière stable relevée.
    const ecartee = !a || (champ === "derniereVersion" && valeur !== stable);
    champs[champ] = ecartee ? champInconnu() : { valeur, statut: a.statut, affirmationId: a.id };
  }
  // La date n'est retenue que si derniereVersion l'est et si elle est exactement celle de la dernière stable.
  const date = champs.dateDerniereVersion!;
  if (champs.derniereVersion!.affirmationId === null || date.valeur !== (derniere?.publieeLe ?? null)) {
    champs.dateDerniereVersion = champInconnu();
  }
  return Fiche.parse(champs);
}

/** « inconnu » (aucune affirmation), « non vérifié » (affirmation non vérifiée sans valeur), sinon `null` : la valeur s'affiche. */
export function libelleChamp(c: ChampFiche<unknown>): string | null {
  if (c.affirmationId === null) return "inconnu";
  if (c.statut === "non_verifie" && c.valeur === null) return "non vérifié";
  return null;
}
