// Outils du service `statbel` : statistiques publiques belges par commune, en LECTURE SEULE sur l'index local
// (instance/donnees/statbel/statbel.sqlite, rempli par scripts/statbel-mise-a-jour.sh). Aucun compte ni clé.
//
//   profil_commune     population (sexe, âge, nationalité), revenus fiscaux et entreprises assujetties à la TVA d'une commune ;
//   comparer_communes  mêmes indicateurs pour 2 à 10 communes, côte à côte.
//
// Chaque chiffre porte son année et sa source (`{ valeur, annee, source }`). Un chiffre qui n'existe pas dans les données
// publiques vaut `null` avec une `note` : jamais de valeur inventée ni estimée en silence.
// Les réponses sont signées par la passerelle (enveloppe `_atelier`), comme celles des autres services.

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { outilLecture } from "../../commun/prospection/commun.js";
import { FICHE_STATBEL } from "../../services.js";
import { IndexStatbel, MAX_CANDIDATES, type Commune, type Meta } from "./index.js";
export { FICHE_STATBEL };

export const MAX_COMMUNES_COMPARAISON = 10;

const LICENCE = "CC BY 4.0";
const URL_POPULATION = "https://statbel.fgov.be/en/open-data/population-place-residence-nationality-marital-status-age-and-sex-16";
const URL_REVENUS = "https://statbel.fgov.be/en/open-data/fiscal-statistics-income";
const URL_TVA = "https://statbel.fgov.be/en/open-data/enterprises-subject-vat-according-legal-form-11";

/** Tranches d'âge utiles au marketing (bornes multiples de 5 : l'index regroupe l'âge par 5 ans). */
export const TRANCHES: readonly { nom: string; de: number; jusqua: number }[] = [
  { nom: "0-14 ans", de: 0, jusqua: 14 },
  { nom: "15-24 ans", de: 15, jusqua: 24 },
  { nom: "25-39 ans", de: 25, jusqua: 39 },
  { nom: "40-54 ans", de: 40, jusqua: 54 },
  { nom: "55-64 ans", de: 55, jusqua: 64 },
  { nom: "65-79 ans", de: 65, jusqua: 79 },
  { nom: "80 ans et plus", de: 80, jusqua: 200 },
];

export interface Chiffre {
  valeur: number | null;
  unite: string;
  annee: number;
  source: string;
  note?: string;
}

export type AccesIndexStatbel = () => IndexStatbel;

function sources(m: Meta): { population: string; revenus: string; tva: string } {
  return {
    population: `Statbel, population par commune, sexe, âge et nationalité, situation au 1er janvier ${m.annee_population} (open data, ${LICENCE})`,
    revenus: `Statbel, statistiques fiscales des revenus par commune, revenus de l'année ${m.annee_revenus} (open data, ${LICENCE})`,
    tva: `Statbel, entreprises assujetties à la TVA par commune et section d'activité, année ${m.annee_tva} (open data, ${LICENCE})`,
  };
}

const arrondir = (v: number, decimales = 1): number => Math.round(v * 10 ** decimales) / 10 ** decimales;
const pourcent = (partie: number, total: number): number | null => (total > 0 ? arrondir((partie / total) * 100) : null);

interface Indicateurs {
  commune: Commune;
  meta: Meta;
  src: ReturnType<typeof sources>;
  total: number;
  hommes: number;
  femmes: number;
  belges: number;
  etrangers: number;
  tranches: { nom: string; effectif: number }[];
  revenus: ReturnType<IndexStatbel["revenus"]>;
  tva: ReturnType<IndexStatbel["tva"]>;
}

function indicateurs(index: IndexStatbel, commune: Commune): Indicateurs {
  const meta = index.meta();
  const p = index.population(commune.refnis);
  const tranches = TRANCHES.map((t) => {
    let effectif = 0;
    for (const [age5, n] of p.age5) if (age5 >= t.de && age5 <= t.jusqua) effectif += n;
    return { nom: t.nom, effectif };
  });
  return { commune, meta, src: sources(meta), total: p.hommes + p.femmes, hommes: p.hommes, femmes: p.femmes, belges: p.belges, etrangers: p.etrangers, tranches, revenus: index.revenus(commune.refnis), tva: index.tva(commune.refnis) };
}

const ch = (valeur: number | null, unite: string, annee: number, source: string, note?: string): Chiffre => ({ valeur, unite, annee, source, ...(note ? { note } : {}) });

const NOTE_REVENUS_ABSENTS = "Pas de revenus pour cette commune dans l'année des données : valeurs masquées par Statbel (secret statistique) ou commune fusionnée depuis (les statistiques fiscales utilisent encore les anciens codes).";
const NOTE_TVA_ABSENTE = "Aucune entreprise assujettie rapprochée de ce code INS dans l'année des données (commune fusionnée depuis ?).";

function chiffresRevenus(i: Indicateurs): Record<string, Chiffre> {
  const a = i.meta.annee_revenus;
  const r = i.revenus;
  if (r === null) {
    const absent = (unite: string): Chiffre => ch(null, unite, a, i.src.revenus, NOTE_REVENUS_ABSENTS);
    return { declarations_fiscales: absent("déclarations"), revenu_moyen_par_declaration_eur: absent("EUR"), revenu_moyen_par_habitant_eur: absent("EUR") };
  }
  const nbDecl = r.declarations + r.declarations_nulles;
  return {
    declarations_fiscales: ch(nbDecl, "déclarations", a, i.src.revenus, "Nombre de déclarations à l'impôt des personnes physiques : proxy du nombre de foyers fiscaux, ce n'est pas un nombre de ménages."),
    revenu_moyen_par_declaration_eur: ch(nbDecl > 0 ? Math.round(r.revenu_imposable / nbDecl) : null, "EUR", a, i.src.revenus, "Revenu total net imposable divisé par le nombre de déclarations (déclarations à revenu nul comprises). Moyenne, pas médiane."),
    revenu_moyen_par_habitant_eur: ch(r.habitants > 0 ? Math.round(r.revenu_imposable / r.habitants) : null, "EUR", a, i.src.revenus, "Revenu total net imposable divisé par le nombre d'habitants de la commune cette année-là."),
  };
}

function chiffresTva(i: Indicateurs): { total: Chiffre; pour1000: Chiffre; sections: { section: string; libelle: string; assujettis: Chiffre }[] } {
  const a = i.meta.annee_tva;
  if (i.tva.length === 0) return { total: ch(null, "assujettis", a, i.src.tva, NOTE_TVA_ABSENTE), pour1000: ch(null, "assujettis pour 1 000 habitants", a, i.src.tva, NOTE_TVA_ABSENTE), sections: [] };
  const total = i.tva.reduce((s, t) => s + t.assujettis, 0);
  return {
    total: ch(total, "assujettis", a, i.src.tva, "Personnes physiques et sociétés assujetties à la TVA dont l'adresse est dans la commune ; ce n'est pas le nombre d'entreprises actives de la BCE. Les lignes masquées par Statbel (secret statistique) ne sont pas comptées : le total peut être légèrement sous-estimé."),
    pour1000: ch(i.total > 0 ? arrondir((total / i.total) * 1000) : null, "assujettis pour 1 000 habitants", a, i.src.tva, `Assujettis de l'année ${a} rapportés à la population du 1er janvier ${i.meta.annee_population}.`),
    sections: i.tva.slice(0, 5).map((t) => ({ section: t.section, libelle: t.libelle, assujettis: ch(t.assujettis, "assujettis", a, i.src.tva) })),
  };
}

function identite(c: Commune): Record<string, string> {
  return { code_ins: c.refnis, nom_fr: c.nom_fr, nom_nl: c.nom_nl, arrondissement: c.arrondissement, province: c.province, region: c.region };
}

function listeSources(m: Meta): Record<string, unknown>[] {
  return [
    { jeu: "Population par lieu de résidence, nationalité, état civil, âge et sexe", annee: m.annee_population, reference: "1er janvier", editeur: "Statbel", licence: LICENCE, url: URL_POPULATION },
    { jeu: "Statistiques fiscales des revenus par commune", annee: m.annee_revenus, reference: "année de revenus", editeur: "Statbel", licence: LICENCE, url: URL_REVENUS },
    { jeu: "Entreprises assujetties à la TVA par commune et section d'activité", annee: m.annee_tva, reference: "année", editeur: "Statbel", licence: LICENCE, url: URL_TVA },
    { jeu: "Correspondance code postal / commune (aide à la recherche, aucune statistique)", annee: 2021, editeur: "bpost, via Opendatasoft", licence: "licence propre à bpost", url: "https://www.bpost.be/fr/codes-postaux" },
  ];
}

const LIMITES = [
  "Statistiques de commune : elles ne disent rien d'un quartier ni d'une rue.",
  "Pas de revenu médian dans les données ouvertes : seulement des moyennes (par déclaration et par habitant).",
  "Pas de nombre de ménages dans les données ouvertes par commune : `declarations_fiscales` en est un ordre de grandeur, pas une mesure.",
  "Les années diffèrent selon le jeu (population, revenus, TVA) : chaque chiffre porte la sienne ; ne pas les croiser sans le dire.",
];

const schemaRef = z.string().min(1).max(60).describe("Commune : nom (français ou néerlandais, sans tenir compte des accents), code postal à 4 chiffres ou code INS à 5 chiffres.");

function indexPret(acces: AccesIndexStatbel): IndexStatbel {
  const index = acces();
  if (!index.disponible()) throw new Error("Index Statbel indisponible : index absent ou vide. Lancer scripts/statbel-mise-a-jour.sh (voir docs/passerelle.md, « Service statbel »).");
  return index;
}

/**
 * Réponse pour une référence non résolue. Revue E2-A : la saisie de l'agent n'est JAMAIS renvoyée
 * (ni dans `reference`, ni dans `raison`) : une référence numérique (« 123456 ») deviendrait sinon un
 * chiffre signé « réel ». Seuls un message générique et les candidates trouvées dans l'index sortent.
 * `position` (texte, ex. « 2e ») dit laquelle des références d'une liste est en cause.
 */
function nonResolue(position: number | null, r: Exclude<ReturnType<IndexStatbel["resoudre"]>, { statut: "trouvee" }>): Record<string, unknown> {
  const raison = r.statut === "ambigue"
    ? "Cette référence couvre plusieurs communes : relancer avec le code INS d'une des candidates."
    : "Aucune commune ne correspond à cette référence : donner un nom, un code postal à 4 chiffres ou un code INS à 5 chiffres.";
  return {
    ...(position === null ? {} : { position: `${position}${position === 1 ? "re" : "e"}` }),
    statut: r.statut, raison,
    ...(r.statut === "ambigue" ? { candidates: r.candidates.map((c) => ({ code_ins: c.refnis, nom_fr: c.nom_fr, nom_nl: c.nom_nl, province: c.province })), candidates_max: MAX_CANDIDATES } : {}),
  };
}

export function outilsStatbel(acces: AccesIndexStatbel): OutilPasserelle[] {
  const profil = outilLecture(
    {
      nom: "profil_commune",
      description:
        "Profil statistique d'une commune belge d'après les données ouvertes de Statbel : population (sexe, nationalité, 7 tranches d'âge), revenus fiscaux (moyennes par déclaration et par habitant) et entreprises assujetties à la TVA (total, pour 1 000 habitants, principales sections d'activité). " +
        "Chaque chiffre porte son année et sa source. Si le nom ou le code postal couvre plusieurs communes, la réponse liste les candidates (statut « ambigue ») : relancer avec le code INS. À utiliser pour segmenter un marché local ou en estimer la taille ; ne dit rien d'un quartier.",
      schemaEntree: { commune: schemaRef },
    },
    (args) => {
      const index = indexPret(acces);
      const r = index.resoudre(args.commune);
      if (r.statut !== "trouvee") return nonResolue(null, r);
      const i = indicateurs(index, r.commune);
      const aP = i.meta.annee_population;
      const tva = chiffresTva(i);
      return {
        statut: "trouvee",
        commune: identite(r.commune),
        population: {
          total: ch(i.total, "habitants", aP, i.src.population),
          hommes: ch(i.hommes, "habitants", aP, i.src.population),
          femmes: ch(i.femmes, "habitants", aP, i.src.population),
          belges: ch(i.belges, "habitants", aP, i.src.population),
          etrangers: ch(i.etrangers, "habitants", aP, i.src.population),
          part_etrangers_pct: ch(pourcent(i.etrangers, i.total), "%", aP, i.src.population),
        },
        tranches_age: i.tranches.map((t) => ({ tranche: t.nom, effectif: ch(t.effectif, "habitants", aP, i.src.population), part_pct: ch(pourcent(t.effectif, i.total), "%", aP, i.src.population) })),
        revenus: chiffresRevenus(i),
        entreprises_tva: { total_assujettis: tva.total, assujettis_pour_1000_habitants: tva.pour1000, principales_sections: tva.sections },
        sources: listeSources(i.meta),
        index_importe_le: i.meta.importe_le,
        limites: LIMITES,
      };
    },
  );

  const comparer = outilLecture(
    {
      nom: "comparer_communes",
      description:
        `Compare de 2 à ${MAX_COMMUNES_COMPARAISON} communes belges sur les mêmes indicateurs : population, parts d'âge (moins de 15 ans, 25-39 ans, 65 ans et plus), part d'étrangers, revenu moyen par déclaration et par habitant, assujettis à la TVA pour 1 000 habitants. ` +
        "Chaque chiffre porte son année et sa source. Une référence ambiguë ou inconnue est listée dans `non_resolues` sans empêcher la comparaison des autres.",
      schemaEntree: { communes: z.array(schemaRef).min(2).max(MAX_COMMUNES_COMPARAISON).describe(`Entre 2 et ${MAX_COMMUNES_COMPARAISON} communes (nom, code postal ou code INS).`) },
    },
    (args) => {
      const index = indexPret(acces);
      const lignes: Record<string, unknown>[] = [];
      const non: Record<string, unknown>[] = [];
      const vus = new Set<string>();
      for (const [rang, ref] of args.communes.entries()) {
        const r = index.resoudre(ref);
        if (r.statut !== "trouvee") { non.push(nonResolue(rang + 1, r)); continue; }
        if (vus.has(r.commune.refnis)) { non.push({ position: `${rang + 1}e`, statut: "doublon", raison: `La commune ${r.commune.nom_fr} figure déjà dans la liste.` }); continue; }
        vus.add(r.commune.refnis);
        const i = indicateurs(index, r.commune);
        const aP = i.meta.annee_population;
        const part = (de: number, jusqua: number): number | null => pourcent(i.tranches.filter((_, k) => TRANCHES[k]!.de >= de && TRANCHES[k]!.jusqua <= jusqua).reduce((s, t) => s + t.effectif, 0), i.total);
        const rev = chiffresRevenus(i);
        const tva = chiffresTva(i);
        lignes.push({
          commune: identite(r.commune),
          population: ch(i.total, "habitants", aP, i.src.population),
          part_moins_de_15_ans_pct: ch(part(0, 14), "%", aP, i.src.population),
          part_25_39_ans_pct: ch(part(25, 39), "%", aP, i.src.population),
          part_65_ans_et_plus_pct: ch(part(65, 200), "%", aP, i.src.population),
          part_etrangers_pct: ch(pourcent(i.etrangers, i.total), "%", aP, i.src.population),
          revenu_moyen_par_declaration_eur: rev["revenu_moyen_par_declaration_eur"],
          revenu_moyen_par_habitant_eur: rev["revenu_moyen_par_habitant_eur"],
          assujettis_tva_pour_1000_habitants: tva.pour1000,
        });
      }
      const meta = index.meta();
      return { communes: lignes, non_resolues: non, sources: listeSources(meta), index_importe_le: meta.importe_le, limites: LIMITES };
    },
  );

  return [profil, comparer];
}

export function fournisseurStatbelReel(acces: AccesIndexStatbel): FournisseurService {
  return { service: "statbel", mode: "reel", fiche: FICHE_STATBEL, outils: outilsStatbel(acces), autorisationLocale: true, verifierJeton: () => null };
}

/** Enregistrement dans le registre (même forme que les autres services locaux). */
export function enregistrerStatbelReel(registre: { enregistrer(f: FournisseurService): void }, acces: AccesIndexStatbel, o: { journal: (m: string) => void }): void {
  registre.enregistrer(fournisseurStatbelReel(acces));
  o.journal("statbel branché : profil_commune, comparer_communes (index local Statbel, lecture seule)");
}
