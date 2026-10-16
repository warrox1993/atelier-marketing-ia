/**
 * Règles des critères de qualification spécialisés « courtier » (lot 1) : tables de données, sans calcul.
 *
 * Trois tables :
 * 1. les métiers dont la responsabilité civile professionnelle (RC pro) est obligatoire (critère
 *    « assurance obligatoire pour son métier ») ;
 * 2. les activités concurrentes (critère contraire « pas un concurrent ») ;
 * 3. la correspondance besoin détecté -> famille d'offre du courtier (critère « besoin couvert par une
 *    offre active »).
 *
 * Règle de prudence : aucun code NACE n'est inventé. Chaque code ci-dessous est soit présent tel quel dans
 * le dépôt (`origine: "depot"`), soit un niveau (4 chiffres, ou division à 2 chiffres) de la nomenclature
 * NACE Rév. 2 commune à l'Europe, dont la NACE-BEL 2008 n'est que le découpage à 5 chiffres
 * (`origine: "nace_rev2"`). Un préfixe couvre tous les codes belges en dessous : « 69.10 » couvre 69.101 et 69.102.
 * Les codes cités par l'opérateur mais introuvables dans le dépôt et non vérifiables à ce niveau (86.902 pour les
 * kinésithérapeutes, 69.201 et 69.203 pour les comptables, 71.111 pour les architectes) ne sont pas utilisés
 * tels quels : leur parent à 4 chiffres le remplace (69.20, 71.11) ; 86.902 est laissé de côté (voir la liste
 * `CODES_A_CONFIRMER`).
 *
 * Les références légales sont des repères pour le client et son juriste, à faire valider avant tout usage
 * commercial : elles ne sont jamais affichées comme un fait vérifié au prospect.
 */

/** D'où vient la certitude du code : déjà présent dans le dépôt, ou niveau de la NACE Rév. 2 européenne. */
export type OrigineCodeNace = "depot" | "nace_rev2";

export interface MetierRcObligatoire {
  /** Identifiant stable du métier. */
  readonly code: string;
  readonly libelle: string;
  /** Préfixes NACE (avec points) ; un code BCE les commence ou les égale. */
  readonly nace: readonly string[];
  readonly origine: OrigineCodeNace;
  /** Étiquettes OpenStreetMap `clé=valeur` du même métier (lieu sans NACE). */
  readonly osm: readonly string[];
  /** Pourquoi la RC pro est obligatoire pour ce métier. */
  readonly raison: string;
}

export const METIERS_RC_OBLIGATOIRE: readonly MetierRcObligatoire[] = [
  {
    code: "medecins", libelle: "médecin", nace: ["86.21", "86.22"], origine: "depot",
    osm: ["amenity=doctors", "healthcare=doctor", "amenity=clinic", "healthcare=clinic", "healthcare=centre"],
    raison: "Les praticiens des soins de santé doivent assurer leur responsabilité civile (loi relative à la qualité de la pratique des soins de santé, 2019, à faire confirmer).",
  },
  {
    code: "dentistes", libelle: "dentiste", nace: ["86.23"], origine: "depot",
    osm: ["amenity=dentist", "healthcare=dentist"],
    raison: "Même obligation que les autres praticiens des soins de santé.",
  },
  {
    // 86.906 figure dans le dépôt avec la mention « à confirmer » (categories-osm-nace.ts) : repris à ce titre seulement.
    code: "kines", libelle: "kinésithérapeute", nace: ["86.906"], origine: "depot",
    osm: ["healthcare=physiotherapist"],
    raison: "Même obligation que les autres praticiens des soins de santé.",
  },
  {
    // 69.10 = activités juridiques (NACE Rév. 2) : avocats 69.101 (dépôt) et notaires 69.102 en dessous.
    code: "avocats_notaires", libelle: "avocat ou notaire", nace: ["69.10"], origine: "nace_rev2",
    osm: ["office=lawyer", "office=notary"],
    raison: "Les barreaux imposent une assurance de la responsabilité professionnelle à leurs avocats ; les notaires sont couverts par une garantie collective et une assurance obligatoires de la profession.",
  },
  {
    code: "architectes", libelle: "architecte", nace: ["71.11"], origine: "nace_rev2",
    osm: ["office=architect"],
    raison: "L'assurance de la responsabilité professionnelle de l'architecte est obligatoire (loi du 20 février 1939 sur le titre et la profession d'architecte, à faire confirmer).",
  },
  {
    // 69.20 = comptabilité, audit, conseil fiscal : couvre les comptables et experts-comptables.
    code: "comptables", libelle: "comptable, expert-comptable ou conseil fiscal", nace: ["69.20"], origine: "nace_rev2",
    osm: ["office=accountant", "office=tax_advisor"],
    raison: "Les professions économiques (experts-comptables, conseils fiscaux) doivent assurer leur responsabilité professionnelle (loi du 22 avril 1999, à faire confirmer).",
  },
  {
    code: "agents_immobiliers", libelle: "agent immobilier", nace: ["68.31"], origine: "nace_rev2",
    osm: ["office=estate_agent"],
    raison: "L'agent immobilier agréé par l'IPI doit assurer sa responsabilité professionnelle et déposer un cautionnement.",
  },
  {
    // Divisions 41 (bâtiment), 42 (génie civil) et 43 (travaux spécialisés) : le dépôt ne cite que « 43 couvre 43.910 ».
    code: "construction", libelle: "entrepreneur de la construction", nace: ["41", "42", "43"], origine: "nace_rev2",
    osm: ["craft=builder", "craft=carpenter", "craft=roofer", "craft=electrician", "craft=plumber", "craft=plasterer", "craft=painter", "craft=tiler", "craft=hvac"],
    raison: "L'assurance de la responsabilité décennale est obligatoire pour les entrepreneurs de gros oeuvre et de finition (lois dites Peeters-Borsus, à faire confirmer selon le métier exact).",
  },
];

/** Codes cités par l'opérateur, laissés de côté faute de preuve dans le dépôt ; à confirmer avant de les ajouter. */
export const CODES_A_CONFIRMER: readonly { readonly code: string; readonly metier: string; readonly remplacePar: string | null }[] = [
  { code: "86.902", metier: "kinésithérapeutes", remplacePar: null },
  { code: "69.201", metier: "comptables", remplacePar: "69.20" },
  { code: "69.203", metier: "comptables", remplacePar: "69.20" },
  { code: "71.111", metier: "architectes", remplacePar: "71.11" },
];

/** Activités concurrentes du courtier : assurance (65) et activités auxiliaires d'assurance (66), dont courtiers et agents. */
export const NACE_CONCURRENTS: readonly string[] = ["65", "66"];

/** Cherche le métier à RC obligatoire d'un code NACE (préfixe en commun, points ignorés) ou d'une étiquette OSM. */
export function metierRcParNace(nace: string): MetierRcObligatoire | null {
  const n = sansPoints(nace);
  return METIERS_RC_OBLIGATOIRE.find((m) => m.nace.some((p) => aPrefixeCommun(n, sansPoints(p)))) ?? null;
}
export function metierRcParOsm(cle: string, valeur: string): MetierRcObligatoire | null {
  const etiquette = `${cle}=${valeur}`;
  return METIERS_RC_OBLIGATOIRE.find((m) => m.osm.includes(etiquette)) ?? null;
}
export function naceConcurrent(nace: string): boolean {
  const n = sansPoints(nace);
  return NACE_CONCURRENTS.some((p) => aPrefixeCommun(n, p));
}

/**
 * Activités qui font probablement rouler une flotte de véhicules (lot 2, critère « flotte probable ») : construction
 * (divisions 41 à 43), transport terrestre (49), poste et courrier, donc livraison (53), et soins ou aide à domicile
 * (88.10). Divisions de la NACE Rév. 2 ; le seuil d'effectif est une ESTIMATION, jamais un fait vérifié.
 */
export const NACE_FLOTTE: readonly string[] = ["41", "42", "43", "49", "53", "88.10"];
/** Effectif minimal (ETP) à partir duquel une flotte devient probable dans ces activités. */
export const EFFECTIF_MIN_FLOTTE = 5;
export function naceFlotte(nace: string): boolean {
  const n = sansPoints(nace);
  return NACE_FLOTTE.some((p) => aPrefixeCommun(n, sansPoints(p)));
}

const sansPoints = (c: string) => c.replace(/\./gu, "");
/**
 * Vrai si le code du prospect (`code`) commence par le préfixe de la règle (`prefixe`) : un code BCE à 5 chiffres contre
 * un préfixe à 2 ou 4. Sens unique : un code trop court (« 69 », « 86.9 ») ne vaut pas un métier précis.
 */
const aPrefixeCommun = (code: string, prefixe: string) => code.startsWith(prefixe);

/* ------------------------------------------------------------------ */
/* Besoin détecté -> famille d'offre du courtier                        */
/* ------------------------------------------------------------------ */

export type FamilleOffre = "rc_pro" | "revenu_garanti" | "pension" | "responsabilite_dirigeants" | "incendie_batiment";

/**
 * Comment reconnaître une famille dans la fiche du client : le code de l'offre (préfixe, minuscules) ou un mot
 * de son nom, sans accents. Une offre non confirmée par le client n'est pas « active ».
 */
export const RECONNAISSANCE_FAMILLES: Readonly<Record<FamilleOffre, { readonly codes: readonly string[]; readonly nom: RegExp }>> = {
  rc_pro: { codes: ["rc-pro", "rc_pro"], nom: /responsabilite civile prof|\brc pro\b/u },
  revenu_garanti: { codes: ["revenu-garanti", "revenu_garanti"], nom: /revenu garanti|incapacite de travail/u },
  pension: { codes: ["pension", "plci", "eip"], nom: /pension|plci|engagement individuel/u },
  responsabilite_dirigeants: { codes: ["rc-dirigeants", "rc-administrateurs"], nom: /responsabilite des (dirigeants|administrateurs)/u },
  incendie_batiment: { codes: ["incendie", "batiment", "multirisque"], nom: /incendie|multirisque|batiment/u },
};

/** Un besoin que les critères A1 à A3 savent détecter. */
export type BesoinCourtier =
  | "rc_pro_obligatoire"
  | "installation_recente"
  | "evenement_changement_forme"
  | "evenement_nouvel_etablissement"
  | "evenement_changement_adresse";

/**
 * Familles d'offre qui répondent à chaque besoin.
 * - RC pro obligatoire : la RC pro.
 * - Installation récente : RC pro, revenu garanti et pension libre complémentaire (PLCI) à mettre en place.
 * - Passage en société : pension de dirigeant (EIP) et responsabilité des dirigeants.
 * - Nouvel établissement ou déménagement : incendie du bâtiment et RC pro à revoir.
 */
export const OFFRES_PAR_BESOIN: Readonly<Record<BesoinCourtier, readonly FamilleOffre[]>> = {
  rc_pro_obligatoire: ["rc_pro"],
  installation_recente: ["rc_pro", "revenu_garanti", "pension"],
  evenement_changement_forme: ["pension", "responsabilite_dirigeants"],
  evenement_nouvel_etablissement: ["incendie_batiment", "rc_pro"],
  evenement_changement_adresse: ["incendie_batiment", "rc_pro"],
};

/** Libellé lisible d'un besoin, pour le détail du critère. */
export const LIBELLE_BESOIN: Readonly<Record<BesoinCourtier, string>> = {
  rc_pro_obligatoire: "RC professionnelle obligatoire",
  installation_recente: "installation récente",
  evenement_changement_forme: "changement de forme juridique",
  evenement_nouvel_etablissement: "nouvel établissement",
  evenement_changement_adresse: "changement d'adresse",
};

interface OffreLue {
  readonly nom: string;
  readonly confirmee: boolean;
  readonly code?: string | undefined;
}

const normaliser = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Offres actives (confirmées par le client) de la fiche qui répondent au besoin. */
export function offresActivesPourBesoin<T extends OffreLue>(besoin: BesoinCourtier, offres: readonly T[]): T[] {
  const familles = OFFRES_PAR_BESOIN[besoin];
  return offres.filter((o) => {
    if (!o.confirmee) return false;
    const code = normaliser(o.code ?? "");
    const nom = normaliser(o.nom);
    return familles.some((f) => {
      const r = RECONNAISSANCE_FAMILLES[f];
      return r.codes.some((c) => code === c || code.startsWith(`${c}-`)) || r.nom.test(nom);
    });
  });
}
