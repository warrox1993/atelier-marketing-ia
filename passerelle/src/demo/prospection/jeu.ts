// Jeu de données fictif de la prospection (lot P2) : entreprises, établissements, comptes annuels, registre FSMA
// et événements de mise à jour BCE. Tout est tiré de la graine SHA-256 du modèle de démonstration (`alea`, première
// clé « prospection ») : mêmes octets d'un appel et d'un processus à l'autre, aucun état caché, aucune horloge.
// Le modèle L3 (src/demo/modele) n'est PAS modifié : son empreinte figée reste valable.
//
// Règles (docs/prospection-conception.md §7) : numéros BCE à contrôle faux, domaines .example, courriels
// @exemple.invalid, téléphones +32 4 000 00 NN (NN ≥ 10, disjoints de ceux du modèle), AUCUNE personne physique
// (ni entité, ni nom de personne), dénominations suffixées « (démonstration) ».

import { alea, bruit, choisir, choisirPondere, entre } from "../modele/alea.js";
import { formaterNumero, numeroDemonstration, type TypeNumero } from "./numeros.js";
import {
  COMMUNES_ZONE_CLIENT, DOMAINE_COURRIEL, DOMAINE_SITES, LOCALITES, RUES, SECTEURS, THEMES, localite,
  type Localite, type Secteur,
} from "./referentiel.js";

const k = (...cles: (string | number)[]): (string | number)[] => ["prospection", ...cles];
const deux = (n: number): string => String(n).padStart(2, "0");

// --- Dates (aucune horloge : tout est borné au 30/09/2026) ---------------------------------------------------

export const DATE_FIN_JEU = "2026-09-30";
const MS_JOUR = 86_400_000;
const ms = (iso: string): number => Date.parse(`${iso}T00:00:00.000Z`);
const iso = (m: number): string => new Date(m).toISOString().slice(0, 10);
const jourAleatoire = (de: string, a: string, ...cles: (string | number)[]): string => iso(ms(de) + Math.floor(alea(...k(...cles)) * (Math.round((ms(a) - ms(de)) / MS_JOUR) + 1)) * MS_JOUR);

/** « 2019-03-01 » → « 01-03-2019 » (format des fichiers de la BCE). */
export const dateBce = (d: string): string => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

// --- Types ----------------------------------------------------------------------------------------------------

export interface AdresseDemo {
  rue: string;
  numero: string;
  boite: string;
  codePostal: string;
  commune: string;
  province: string | null;
  region: string;
  pays: "BE";
}

export interface EtablissementDemo {
  numero: string;
  debut: string;
  adresse: AdresseDemo;
}

export interface CompteDemo {
  exercice: number;
  debut: string;
  fin: string;
  depot: string;
  referenceDepot: string;
  modele: "m01" | "m02" | "m81";
  effectifEtp: number;
  totalBilan: number;
  /** Fonds propres (rubrique 10/15, à confirmer sur la documentation BNB) : fictifs, parfois négatifs. */
  fondsPropres: number;
  /** Terrains et constructions (rubrique 22) : zéro pour les locataires. */
  terrainsConstructions: number;
  /** Résultat de l'exercice (rubrique 9904) : négatif = perte. */
  resultat: number;
}

export type TailleDemo = "micro" | "petite" | "moyenne" | "grande" | "inconnue";

export const CATEGORIES_FSMA = ["Courtier d'assurances", "Agent d'assurances", "Sous-agent d'assurances"] as const;
export type CategorieFsma = (typeof CATEGORIES_FSMA)[number];

export interface InscriptionFsma {
  numeroInscription: string;
  denomination: string;
  /** Numéro BCE tel que la FSMA le publie (peut être mal formé : piège). */
  numeroBce: string;
  categorie: CategorieFsma;
  statut: "Inscrit" | "Radié";
  inscritLe: string;
  radieLe: string | null;
  /** Adresse publiée par la FSMA (celle du siège BCE, sauf piège). */
  adresse: AdresseDemo;
  /** Vrai si l'entreprise correspondante existe dans le fichier BCE actif. */
  dansBce: boolean;
}

export interface EntrepriseDemo {
  id: string;
  numero: string;
  denomination: string;
  forme: string;
  debut: string;
  siege: AdresseDemo;
  etablissements: EtablissementDemo[];
  /** Codes NACE-BEL (le premier est l'activité principale). */
  nace: string[];
  telephone: string | null;
  courriel: string | null;
  site: string | null;
  comptes: CompteDemo[];
  piege: PiegeId | null;
  secteur: string;
}

export type PiegeId = "doublon" | "hors_zone" | "radiee" | "numero_invalide" | "fsma_radie_bce_actif" | "bce_radiee_fsma_inscrit";

export type TypeEvenement = "creation" | "nouvel_etablissement" | "changement_adresse" | "changement_forme" | "radiation";

export interface EvenementBce {
  date: string;
  type: TypeEvenement;
  numero: string;
  detail: Record<string, unknown>;
}

export interface EntrepriseRadiee {
  numero: string;
  denomination: string;
  debut: string;
  radieLe: string;
  siege: AdresseDemo;
  nace: string[];
  comptes: CompteDemo[];
}

export interface JeuProspection {
  entreprises: EntrepriseDemo[];
  radiees: EntrepriseRadiee[];
  fsma: InscriptionFsma[];
  evenements: EvenementBce[];
}

// --- Construction ---------------------------------------------------------------------------------------------

function adresseDe(loc: Localite, ...cles: (string | number)[]): AdresseDemo {
  return {
    rue: choisir(RUES, ...k(...cles, "rue")),
    numero: String(1 + Math.floor(alea(...k(...cles, "num")) * 140)),
    boite: alea(...k(...cles, "boite")) < 0.12 ? String(1 + Math.floor(alea(...k(...cles, "boite-n")) * 6)) : "",
    codePostal: loc.codePostal,
    commune: loc.nom,
    province: loc.province,
    region: loc.region,
    pays: "BE",
  };
}

const arrondi1 = (v: number): number => Math.round(v * 10) / 10;

function comptesDe(id: string, debut: string, forcerAucun = false): CompteDemo[] {
  if (forcerAucun || debut > "2025-06-30" || alea(...k(id, "depose")) >= 0.85) return [];
  const profil = choisirPondere<"micro" | "petite" | "moyenne" | "grande">([["micro", 0.55], ["petite", 0.3], ["moyenne", 0.11], ["grande", 0.04]], ...k(id, "profil"));
  const base = profil === "micro" ? entre(0.5, 9.5, ...k(id, "etp")) : profil === "petite" ? entre(10, 49, ...k(id, "etp")) : profil === "moyenne" ? entre(50, 249, ...k(id, "etp")) : entre(250, 900, ...k(id, "etp"));
  const rapport = entre(45_000, 170_000, ...k(id, "bilan"));
  const comptes: CompteDemo[] = [];
  for (const exercice of [2023, 2024, 2025]) {
    if (debut > `${exercice}-06-30`) continue;
    const depot = `${exercice + 1}-${deux(5 + Math.floor(alea(...k(id, "depot-mois", exercice)) * 5))}-${deux(1 + Math.floor(alea(...k(id, "depot-jour", exercice)) * 28))}`;
    // Retard des données : certains exercices récents ne sont pas encore déposés.
    if (depot > DATE_FIN_JEU || (exercice === 2025 && alea(...k(id, "exercice-2025")) < 0.3)) continue;
    const effectifEtp = Math.max(0.5, arrondi1(base * bruit(0.08, ...k(id, "etp-an", exercice))));
    const totalBilan = Math.round((effectifEtp * rapport * bruit(0.1, ...k(id, "bilan-an", exercice)) + 40_000) / 100) * 100;
    // Rubriques du lot 2, tirées avec leurs propres clés (les tirages d'avant ne bougent pas) : environ 12 % d'entreprises à fonds propres
    // négatifs, un tiers propriétaire de ses locaux, une année sur cinq en perte.
    const fondsNegatifs = alea(...k(id, "fonds-negatifs")) < 0.12;
    const fondsPropres = Math.round((totalBilan * (fondsNegatifs ? -entre(0.02, 0.15, ...k(id, "fonds-an", exercice)) : entre(0.15, 0.55, ...k(id, "fonds-an", exercice)))) / 100) * 100;
    const proprietaire = alea(...k(id, "proprietaire")) < 0.35;
    const terrainsConstructions = proprietaire ? Math.round((totalBilan * entre(0.1, 0.4, ...k(id, "terrains-an", exercice))) / 100) * 100 : 0;
    const enPerte = alea(...k(id, "perte-an", exercice)) < 0.2;
    const resultat = Math.round((totalBilan * (enPerte ? -entre(0.01, 0.08, ...k(id, "resultat-an", exercice)) : entre(0.005, 0.1, ...k(id, "resultat-an", exercice)))) / 100) * 100;
    comptes.push({
      exercice,
      debut: `${exercice}-01-01`,
      fin: `${exercice}-12-31`,
      depot,
      referenceDepot: `${exercice + 1}-${String(Math.floor(alea(...k(id, "ref", exercice)) * 1e7)).padStart(7, "0")}`,
      modele: profil === "micro" ? "m81" : profil === "petite" ? "m02" : "m01",
      effectifEtp,
      totalBilan,
      fondsPropres,
      terrainsConstructions,
      resultat,
    });
  }
  return comptes;
}

export function tailleDe(comptes: readonly CompteDemo[]): TailleDemo {
  const dernier = [...comptes].sort((a, b) => b.exercice - a.exercice)[0];
  if (!dernier) return "inconnue";
  const etp = dernier.effectifEtp;
  return etp < 10 ? "micro" : etp < 50 ? "petite" : etp < 250 ? "moyenne" : "grande";
}

export function construireJeu(): JeuProspection {
  const entreprises: EntrepriseDemo[] = [];
  const noms = new Set<string>();
  const numeros = new Set<string>();
  const fsma: InscriptionFsma[] = [];
  const evenements: EvenementBce[] = [];

  const numeroUnique = (type: TypeNumero, cle: string): string => {
    for (let essai = 0; ; essai++) {
      const n = formaterNumero(numeroDemonstration(type, cle, essai), type);
      if (!numeros.has(n)) {
        numeros.add(n);
        return n;
      }
    }
  };

  const creer = (id: string, secteur: Secteur, denomination: string, p: { loc: Localite; debut: string; adresse?: AdresseDemo; piege?: PiegeId | null; sansComptes?: boolean }): EntrepriseDemo => {
    const siege = p.adresse ?? adresseDe(p.loc, id, "siege");
    const slug = denomination.replace(/ \(démonstration\)$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = alea(...k(id, "contacts"));
    const etablissements: EtablissementDemo[] = [];
    if (alea(...k(id, "nb-etab")) < 0.4) {
      const autre = choisirPondere(LOCALITES.map((l) => [l, l.poids] as const), ...k(id, "etab-loc"));
      etablissements.push({ numero: numeroUnique("etablissement", `${id}-1`), debut: jourAleatoire(p.debut, DATE_FIN_JEU, id, "etab-debut"), adresse: adresseDe(autre, id, "etab") });
    }
    return {
      id,
      numero: numeroUnique("entreprise", id),
      denomination,
      forme: alea(...k(id, "forme")) < 0.8 ? "610" : "014",
      debut: p.debut,
      siege,
      etablissements,
      nace: [secteur.nace],
      telephone: a < 0.75 ? `+32 4 000 00 ${10 + Math.floor(alea(...k(id, "tel")) * 90)}` : null,
      courriel: a < 0.65 ? `info.${slug}@${DOMAINE_COURRIEL}` : null,
      site: alea(...k(id, "site")) < 0.6 ? `https://${slug}.${DOMAINE_SITES}` : null,
      comptes: comptesDe(id, p.debut, p.sansComptes),
      piege: p.piege ?? null,
      secteur: secteur.id,
    };
  };

  let indice = 0;
  for (const secteur of SECTEURS) {
    for (let j = 0; j < secteur.nombre; j++) {
      indice++;
      const id = `e${deux(indice)}`;
      let denomination = "";
      for (let essai = 0; ; essai++) {
        const nom = `${choisir(secteur.prefixes, ...k(id, "prefixe", essai))} ${choisir(THEMES, ...k(id, "theme", essai))}`;
        if (!noms.has(nom)) {
          noms.add(nom);
          denomination = `${nom} (démonstration)`;
          break;
        }
      }
      const loc = choisirPondere(LOCALITES.map((l) => [l, l.poids] as const), ...k(id, "loc"));
      // Quelques créations récentes (signaux de la BCE) : une sur neuf.
      const recente = indice % 9 === 4;
      const debut = recente ? jourAleatoire("2026-06-15", "2026-09-28", id, "debut") : jourAleatoire("1998-01-01", "2025-12-31", id, "debut");
      const e = creer(id, secteur, denomination, { loc, debut });
      entreprises.push(e);

      if (secteur.id === "courtage") {
        const radieFsma = j === secteur.nombre - 1;
        fsma.push({
          numeroInscription: `DEMO-FSMA-${String(fsma.length + 1).padStart(3, "0")}`,
          denomination,
          numeroBce: e.numero,
          categorie: choisirPondere<CategorieFsma>([["Courtier d'assurances", 0.6], ["Agent d'assurances", 0.3], ["Sous-agent d'assurances", 0.1]], ...k(id, "categorie")),
          statut: radieFsma ? "Radié" : "Inscrit",
          inscritLe: jourAleatoire(debut > "2026-01-01" ? debut : "2008-01-01", debut > "2026-01-01" ? DATE_FIN_JEU : "2025-06-30", id, "inscrit"),
          radieLe: radieFsma ? "2026-05-20" : null,
          adresse: e.siege,
          dansBce: true,
        });
        if (radieFsma) e.piege = "fsma_radie_bce_actif";
      }
    }
  }

  // --- Pièges écrits à la main -----------------------------------------------------------------------------------
  const isolation = SECTEURS.find((s) => s.id === "isolation")!;
  const loc4020 = localite("4020");
  const adresseDoublon = adresseDe(loc4020, "doublon", "siege");
  const doublonA = creer("d01", isolation, "Isolation Outremeuse Plus (démonstration)", { loc: loc4020, debut: "2016-04-11", adresse: adresseDoublon, piege: "doublon" });
  const doublonB = creer("d02", isolation, "Isolation Outremeuse Plus (démonstration) SRL", { loc: loc4020, debut: "2016-04-18", adresse: adresseDoublon, piege: "doublon" });
  const couverture = SECTEURS.find((s) => s.id === "couverture")!;
  const horsZone = creer("h01", couverture, "Toitures Herstaliennes (démonstration)", { loc: localite("4040"), debut: "2011-09-05", piege: "hors_zone" });
  entreprises.push(doublonA, doublonB, horsZone);

  // Entreprise radiée : absente du fichier actif, mais encore inscrite à la FSMA (retard de mise à jour).
  const courtage = SECTEURS.find((s) => s.id === "courtage")!;
  const radieeSiege = adresseDe(localite("4000"), "radiee", "siege");
  const radiee: EntrepriseRadiee = {
    numero: numeroUnique("entreprise", "radiee"),
    denomination: "Courtage Place Saint-Lambert (démonstration)",
    debut: "2004-02-02",
    radieLe: "2026-09-14",
    siege: radieeSiege,
    nace: [courtage.nace],
    comptes: comptesDe("radiee", "2004-02-02").slice(0, 2),
  };
  fsma.push({
    numeroInscription: `DEMO-FSMA-${String(fsma.length + 1).padStart(3, "0")}`,
    denomination: radiee.denomination,
    numeroBce: radiee.numero,
    categorie: "Courtier d'assurances",
    statut: "Inscrit",
    inscritLe: "2008-03-14",
    radieLe: null,
    adresse: radieeSiege,
    dansBce: false,
  });
  // Numéro BCE mal formé (9 chiffres) publié par la FSMA : aucune entreprise ne correspond.
  fsma.push({
    numeroInscription: `DEMO-FSMA-${String(fsma.length + 1).padStart(3, "0")}`,
    denomination: "Courtage Rue Imaginaire (démonstration)",
    numeroBce: "0123.456.78",
    categorie: "Agent d'assurances",
    statut: "Inscrit",
    inscritLe: "2019-06-03",
    radieLe: null,
    adresse: adresseDe(localite("4430"), "mal-forme", "siege"),
    dansBce: false,
  });

  // --- Événements de mise à jour (fichiers de mises à jour quotidiennes de la BCE) --------------------------------
  entreprises.forEach((e, i) => {
    if (e.debut >= "2026-06-15") evenements.push({ date: e.debut, type: "creation", numero: e.numero, detail: { denomination: e.denomination, nace: e.nace, commune: e.siege.commune, codePostal: e.siege.codePostal } });
    else if (i % 11 === 3) {
      const loc = choisirPondere(LOCALITES.map((l) => [l, l.poids] as const), ...k(e.id, "nouvel-etab-loc"));
      const etab: EtablissementDemo = { numero: numeroUnique("etablissement", `${e.id}-n`), debut: jourAleatoire("2026-07-01", "2026-09-25", e.id, "nouvel-etab"), adresse: adresseDe(loc, e.id, "nouvel-etab") };
      e.etablissements.push(etab);
      evenements.push({ date: etab.debut, type: "nouvel_etablissement", numero: e.numero, detail: { etablissement: etab.numero, commune: etab.adresse.commune, codePostal: etab.adresse.codePostal } });
    } else if (i % 13 === 5) {
      const ancienne = e.siege;
      e.siege = adresseDe(choisirPondere(LOCALITES.map((l) => [l, l.poids] as const), ...k(e.id, "demenage-loc")), e.id, "demenage");
      evenements.push({ date: jourAleatoire("2026-07-15", "2026-09-20", e.id, "demenage-date"), type: "changement_adresse", numero: e.numero, detail: { de: `${ancienne.codePostal} ${ancienne.commune}`, vers: `${e.siege.codePostal} ${e.siege.commune}` } });
    } else if (i % 17 === 7) {
      evenements.push({ date: jourAleatoire("2026-07-01", "2026-09-25", e.id, "forme-date"), type: "changement_forme", numero: e.numero, detail: { de: "014", vers: "610" } });
      e.forme = "610";
    }
  });
  // L'adresse FSMA suit le siège (hors piège) après un éventuel déménagement.
  for (const f of fsma) {
    const e = entreprises.find((x) => x.numero === f.numeroBce);
    if (e) f.adresse = e.siege;
  }
  evenements.push({ date: radiee.radieLe, type: "radiation", numero: radiee.numero, detail: {} });
  evenements.sort((a, b) => (a.date === b.date ? a.numero.localeCompare(b.numero) : a.date.localeCompare(b.date)));

  return { entreprises, radiees: [radiee], fsma, evenements };
}

let cache: JeuProspection | null = null;
/** Jeu partagé (construit à la demande, jamais modifié ensuite). */
export function jeuProspection(): JeuProspection {
  cache ??= construireJeu();
  return cache;
}

export interface PiegeProspection {
  id: PiegeId;
  numero: string | null;
  denomination: string;
  description: string;
}

/** Pièges utiles, pour les scénarios (P12) et les tests. */
export function piegesProspection(jeu: JeuProspection = jeuProspection()): PiegeProspection[] {
  const sorties: PiegeProspection[] = [];
  const doublons = jeu.entreprises.filter((e) => e.piege === "doublon");
  for (const e of doublons) sorties.push({ id: "doublon", numero: e.numero, denomination: e.denomination, description: "Même entreprise sous deux numéros : dénomination et adresse identiques, au suffixe de forme près." });
  const hz = jeu.entreprises.find((e) => e.piege === "hors_zone");
  if (hz) sorties.push({ id: "hors_zone", numero: hz.numero, denomination: hz.denomination, description: `Hors de la zone du client (${COMMUNES_ZONE_CLIENT.join(", ")}) : Herstal, 4040.` });
  const r = jeu.radiees[0];
  if (r) sorties.push({ id: "bce_radiee_fsma_inscrit", numero: r.numero, denomination: r.denomination, description: "Radiée de la BCE le 14/09/2026 (absente du fichier actif) mais encore inscrite au registre FSMA." });
  const fr = jeu.entreprises.find((e) => e.piege === "fsma_radie_bce_actif");
  if (fr) sorties.push({ id: "fsma_radie_bce_actif", numero: fr.numero, denomination: fr.denomination, description: "Active à la BCE mais radiée du registre FSMA : ne plus la traiter comme intermédiaire." });
  const mal = jeu.fsma.find((f) => !f.dansBce && f.numeroBce === "0123.456.78");
  if (mal) sorties.push({ id: "numero_invalide", numero: null, denomination: mal.denomination, description: `Numéro BCE mal formé publié par la FSMA (« ${mal.numeroBce} », 9 chiffres) : aucune entreprise correspondante.` });
  return sorties;
}
