// Simulateur `b2c` (courtier en assurances, particuliers) : demandes de devis en ligne, clients existants et personnes
// opposées (liste « Ne m'appelez plus »). Même modèle que la prospection d'entreprises (P2) : jeu déterministe tiré de
// la graine SHA-256 du modèle de démonstration (`alea`, première clé « b2c », donc sans effet sur les autres jeux),
// outils en lecture seule, enveloppe signée par la passerelle.
//
// Règles : particuliers 100 % fictifs (noms « Prénom Nom (démonstration) », courriels @exemple.invalid, téléphones
// +32 4 000 0X YY avec X ≥ 1, disjoints de ceux des entreprises « +32 4 000 00 NN » et du modèle), adresses « Rue des
// Exemples ». Le courtier est multi-compagnies (zone : province de Liège), avec trois entités (non-vie, vie, crédits),
// une marque de devis en ligne et douze bureaux. Son nom s'affiche depuis ATELIER_DEMO_ASSUREUR_NOM (nomAssureurDemo).
// La liste « Ne m'appelez plus » réelle n'est pas interrogeable par un courtier : celle-ci est une simulation.

import * as z from "zod";
import type { FournisseurService, OutilPasserelle } from "../../fournisseurs.js";
import { alea, choisir, choisirPondere, entre } from "../modele/alea.js";
import { adresseDansZone, formePage, formeZone, outilLecture, paginer, verifierDateIso, type FiltreZone } from "./commun.js";
import { DATE_FIN_JEU, type AdresseDemo } from "./jeu.js";
import { DOMAINE_COURRIEL, nomAssureurDemo } from "./referentiel.js";

export const SOURCE_B2C = "Particuliers d'un courtier en assurances (simulateur de démonstration : personnes entièrement fictives ; liste « Ne m'appelez plus » simulée)";
export const MARQUE_DEVIS = "Devis en ligne (démonstration)";

const k = (...cles: (string | number)[]): (string | number)[] => ["b2c", ...cles];
const deux = (n: number): string => String(n).padStart(2, "0");
const trois = (n: number): string => String(n).padStart(3, "0");

// --- Dates (aucune horloge : tout est borné au 30/09/2026) ---------------------------------------------------

const MS_JOUR = 86_400_000;
const ms = (iso: string): number => Date.parse(`${iso}T00:00:00.000Z`);
const iso = (m: number): string => new Date(m).toISOString().slice(0, 10);
const plusJours = (d: string, n: number): string => { const r = iso(ms(d) + n * MS_JOUR); return r > DATE_FIN_JEU ? DATE_FIN_JEU : r; };
const jourAleatoire = (de: string, a: string, ...cles: (string | number)[]): string =>
  iso(ms(de) + Math.floor(alea(...k(...cles)) * (Math.round((ms(a) - ms(de)) / MS_JOUR) + 1)) * MS_JOUR);
const anneesEntre = (de: string, a: string): number => Math.floor((ms(a) - ms(de)) / (365.25 * MS_JOUR));

// --- Référentiel -----------------------------------------------------------------------------------------------

export const PRODUITS = ["auto", "habitation", "hospitalisation", "familiale", "animaux", "obseques", "epargne_pension", "credit"] as const;
export type ProduitB2c = (typeof PRODUITS)[number];
export type EntiteB2c = "non-vie" | "vie" | "credits";

export const LIBELLE_PRODUIT: Record<ProduitB2c, string> = {
  auto: "Assurance auto", habitation: "Assurance habitation", hospitalisation: "Assurance hospitalisation", familiale: "Responsabilité familiale",
  animaux: "Assurance animaux", obseques: "Assurance obsèques", epargne_pension: "Épargne-pension", credit: "Crédit",
};
export const ENTITE_PRODUIT: Record<ProduitB2c, EntiteB2c> = {
  auto: "non-vie", habitation: "non-vie", hospitalisation: "non-vie", familiale: "non-vie", animaux: "non-vie", obseques: "vie", epargne_pension: "vie", credit: "credits",
};

export const STATUTS_DEMANDE = ["abandonne", "complete", "rendez_vous_pris"] as const;
export type StatutDemande = (typeof STATUTS_DEMANDE)[number];
const LIBELLE_STATUT: Record<StatutDemande, string> = { abandonne: "Abandonné", complete: "Complété", rendez_vous_pris: "Rendez-vous pris" };

export const CANAUX = ["email", "telephone", "sms"] as const;
export type Canal = (typeof CANAUX)[number];

export const SOURCES_OPPOSITION = ["registre_ne_m_appelez_plus", "opposition_courtier", "desabonnement_en_ligne"] as const;
export type SourceOpposition = (typeof SOURCES_OPPOSITION)[number];
const LIBELLE_SOURCE: Record<SourceOpposition, string> = {
  registre_ne_m_appelez_plus: "Liste « Ne m'appelez plus » (simulée)", opposition_courtier: "Opposition faite directement auprès du courtier", desabonnement_en_ligne: "Désabonnement par lien dans un e-mail",
};

const COMPAGNIES = ["Assureur Alpha (démonstration)", "Assureur Bêta (démonstration)", "Assureur Gamma (démonstration)", "Assureur Delta (démonstration)"] as const;

const TEXTES_CONSENTEMENT = [
  `J'accepte de recevoir des offres commerciales de ${MARQUE_DEVIS} par les canaux cochés. Je peux retirer mon accord à tout moment.`,
  "J'accepte que mes coordonnées servent à me proposer des assurances adaptées, par les canaux cochés (texte de démonstration).",
] as const;

interface LocaliteB2c { codePostal: string; nom: string; province: string; region: AdresseDemo["region"]; lat: number; lon: number; poids: number }

/** Communes de la province de Liège (zone du courtier) puis trois communes hors zone. Coordonnées approximatives. */
const LOCALITES_ZONE: readonly LocaliteB2c[] = [
  { codePostal: "4000", nom: "Liège", province: "Liège", region: "Wallonie", lat: 50.6326, lon: 5.5797, poids: 0.16 },
  { codePostal: "4020", nom: "Liège", province: "Liège", region: "Wallonie", lat: 50.635, lon: 5.59, poids: 0.1 },
  { codePostal: "4030", nom: "Liège", province: "Liège", region: "Wallonie", lat: 50.62, lon: 5.605, poids: 0.05 },
  { codePostal: "4430", nom: "Ans", province: "Liège", region: "Wallonie", lat: 50.66, lon: 5.52, poids: 0.09 },
  { codePostal: "4040", nom: "Herstal", province: "Liège", region: "Wallonie", lat: 50.67, lon: 5.63, poids: 0.06 },
  { codePostal: "4100", nom: "Seraing", province: "Liège", region: "Wallonie", lat: 50.585, lon: 5.495, poids: 0.08 },
  { codePostal: "4420", nom: "Saint-Nicolas", province: "Liège", region: "Wallonie", lat: 50.635, lon: 5.54, poids: 0.05 },
  { codePostal: "4460", nom: "Grâce-Hollogne", province: "Liège", region: "Wallonie", lat: 50.645, lon: 5.49, poids: 0.04 },
  { codePostal: "4400", nom: "Flémalle", province: "Liège", region: "Wallonie", lat: 50.59, lon: 5.45, poids: 0.04 },
  { codePostal: "4050", nom: "Chaudfontaine", province: "Liège", region: "Wallonie", lat: 50.59, lon: 5.65, poids: 0.04 },
  { codePostal: "4800", nom: "Verviers", province: "Liège", region: "Wallonie", lat: 50.59, lon: 5.865, poids: 0.06 },
  { codePostal: "4900", nom: "Spa", province: "Liège", region: "Wallonie", lat: 50.492, lon: 5.864, poids: 0.02 },
  { codePostal: "4500", nom: "Huy", province: "Liège", region: "Wallonie", lat: 50.52, lon: 5.24, poids: 0.04 },
  { codePostal: "4300", nom: "Waremme", province: "Liège", region: "Wallonie", lat: 50.697, lon: 5.255, poids: 0.03 },
  { codePostal: "4700", nom: "Eupen", province: "Liège", region: "Wallonie", lat: 50.628, lon: 6.036, poids: 0.02 },
  { codePostal: "4600", nom: "Visé", province: "Liège", region: "Wallonie", lat: 50.74, lon: 5.698, poids: 0.02 },
  { codePostal: "4920", nom: "Aywaille", province: "Liège", region: "Wallonie", lat: 50.473, lon: 5.677, poids: 0.01 },
  { codePostal: "4680", nom: "Oupeye", province: "Liège", region: "Wallonie", lat: 50.705, lon: 5.64, poids: 0.03 },
];
const LOCALITES_HORS_ZONE: readonly LocaliteB2c[] = [
  { codePostal: "5000", nom: "Namur", province: "Namur", region: "Wallonie", lat: 50.467, lon: 4.867, poids: 0 },
  { codePostal: "1000", nom: "Bruxelles", province: "Bruxelles-Capitale", region: "Bruxelles-Capitale", lat: 50.85, lon: 4.352, poids: 0 },
  { codePostal: "9000", nom: "Gand", province: "Flandre orientale", region: "Flandre", lat: 51.054, lon: 3.717, poids: 0 },
];
const localiteHorsZone = (cp: string): LocaliteB2c => LOCALITES_HORS_ZONE.find((l) => l.codePostal === cp)!;
const localiteZone = (cp: string): LocaliteB2c => LOCALITES_ZONE.find((l) => l.codePostal === cp)!;

export interface BureauDemo { id: string; nom: string; adresse: AdresseDemo; lat: number; lon: number }
const bureau = (id: string, cp: string, numero: string): BureauDemo => {
  const l = localiteZone(cp);
  return { id: `bureau-${id}`, nom: `Bureau de ${l.nom} (démonstration)`, adresse: { rue: "Rue des Exemples", numero, boite: "", codePostal: l.codePostal, commune: l.nom, province: l.province, region: l.region, pays: "BE" }, lat: l.lat, lon: l.lon };
};
/** Une douzaine de bureaux dans la province de Liège. */
export const BUREAUX: readonly BureauDemo[] = [
  bureau("liege", "4000", "10"), bureau("ans", "4430", "20"), bureau("herstal", "4040", "5"), bureau("seraing", "4100", "8"),
  bureau("verviers", "4800", "12"), bureau("huy", "4500", "3"), bureau("waremme", "4300", "7"), bureau("spa", "4900", "2"),
  bureau("eupen", "4700", "9"), bureau("vise", "4600", "4"), bureau("chaudfontaine", "4050", "6"), bureau("aywaille", "4920", "1"),
];

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Bureau le plus proche, pour une commune de la zone du courtier ; null hors zone (province de Liège). */
export function bureauLePlusProche(loc: LocaliteB2c): { bureau: BureauDemo; distanceKm: number } | null {
  if (loc.province !== "Liège") return null;
  let meilleur: { bureau: BureauDemo; distanceKm: number } | null = null;
  for (const b of BUREAUX) {
    const d = distanceKm(loc, b);
    if (meilleur === null || d < meilleur.distanceKm) meilleur = { bureau: b, distanceKm: d };
  }
  return meilleur;
}

// --- Types -----------------------------------------------------------------------------------------------------

export interface PersonneDemo { nom: string; courriel: string | null; telephone: string | null; adresse: AdresseDemo; localite: LocaliteB2c }

export interface ConsentementDemo {
  /** Date de l'accord ; null = aucun accord recueilli. */
  date: string | null;
  texte: string | null;
  /** Canaux cochés à l'origine. */
  canaux: Record<Canal, boolean>;
  retireLe: string | null;
}

export type PiegeB2cId = "doublon" | "consentement_retire" | "hors_zone" | "deja_equipe" | "contrat_resilie";

export interface DemandeDevisDemo {
  id: string;
  produit: ProduitB2c;
  demandeLe: string;
  statut: StatutDemande;
  rendezVousLe: string | null;
  personne: PersonneDemo;
  consentement: ConsentementDemo;
  /** Client existant dont la personne est issue (piège « déjà équipé »). */
  clientId: string | null;
  piege: PiegeB2cId | null;
}

export interface ContratDemo { produit: ProduitB2c; compagnie: string; debut: string; fin: string | null; statut: "actif" | "resilie"; montantAnnuel: number }

export interface ClientDemo {
  id: string;
  /** Entité du courtier qui tient la fiche (celle du premier contrat). */
  entite: EntiteB2c;
  depuis: string;
  personne: PersonneDemo;
  contrats: ContratDemo[];
  consentement: ConsentementDemo;
  piege: PiegeB2cId | null;
}

export interface OppositionDemo {
  id: string;
  personne: PersonneDemo;
  inscritLe: string;
  source: SourceOpposition;
  canaux: Canal[];
}

export interface JeuParticuliers { demandes: DemandeDevisDemo[]; clients: ClientDemo[]; oppositions: OppositionDemo[] }

// --- Construction ----------------------------------------------------------------------------------------------

const PRENOMS = ["Léa", "Noah", "Emma", "Louis", "Chloé", "Arthur", "Manon", "Jules", "Camille", "Lucas", "Inès", "Hugo", "Zoé", "Nathan", "Alice", "Théo"] as const;
const NOMS = ["Fictif", "Exemplaire", "Imaginaire", "Factice", "Témoin", "Échantillon", "Brouillon", "Maquette", "Simulé", "Hypothétique", "Anonymisé", "Illustratif"] as const;
const MAX_PERSONNES = PRENOMS.length * NOMS.length;
const sansAccent = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ordre fixe des couples prénom/nom (tirage par graine) : aucun couple n'apparaît deux fois. */
const ORDRE_NOMS: readonly number[] = [...Array(MAX_PERSONNES).keys()].sort((a, b) => alea(...k("ordre-noms", a)) - alea(...k("ordre-noms", b)));

const ZONE_PONDEREE = LOCALITES_ZONE.map((l) => [l, l.poids] as const);

const sansConsentement = (): ConsentementDemo => ({ date: null, texte: null, canaux: { email: false, telephone: false, sms: false }, retireLe: null });

function consentement(cle: string, dateAccord: string, p: { probabilite?: number; retire?: boolean } = {}): ConsentementDemo {
  if (p.probabilite !== undefined && alea(...k(cle, "accord")) >= p.probabilite) return sansConsentement();
  const canaux: Record<Canal, boolean> = { email: alea(...k(cle, "c-email")) < 0.85, telephone: alea(...k(cle, "c-tel")) < 0.45, sms: alea(...k(cle, "c-sms")) < 0.3 };
  if (!canaux.email && !canaux.telephone && !canaux.sms) canaux.email = true;
  return {
    date: dateAccord,
    texte: choisir(TEXTES_CONSENTEMENT, ...k(cle, "texte")),
    canaux,
    retireLe: p.retire === true ? plusJours(dateAccord, 5 + Math.floor(alea(...k(cle, "retrait")) * 40)) : null,
  };
}

export function consentementActif(c: ConsentementDemo): boolean {
  return c.date !== null && c.retireLe === null;
}
/** Canaux réellement utilisables : vides si aucun accord ou si l'accord a été retiré. */
export function canauxUtilisables(c: ConsentementDemo): Record<Canal, boolean> {
  return consentementActif(c) ? c.canaux : { email: false, telephone: false, sms: false };
}

export function construireJeuParticuliers(): JeuParticuliers {
  let rang = 0;
  const personne = (cle: string, loc: LocaliteB2c, p: { telephone?: boolean; courriel?: boolean } = {}): PersonneDemo => {
    if (rang >= MAX_PERSONNES) throw new Error("Jeu B2C : plus de couples prénom/nom disponibles.");
    const r = rang++;
    const couple = ORDRE_NOMS[r]!;
    const prenom = PRENOMS[couple % PRENOMS.length]!;
    const nom = NOMS[Math.floor(couple / PRENOMS.length)]!;
    const avecTel = p.telephone ?? alea(...k(cle, "tel")) >= 0.12;
    const avecMail = p.courriel ?? alea(...k(cle, "mail")) >= 0.08;
    return {
      nom: `${prenom} ${nom} (démonstration)`,
      courriel: avecMail ? `${sansAccent(prenom)}.${sansAccent(nom)}.${trois(r + 1)}@${DOMAINE_COURRIEL}` : null,
      telephone: avecTel ? `+32 4 000 0${1 + Math.floor(r / 90)} ${10 + (r % 90)}` : null,
      adresse: { rue: "Rue des Exemples", numero: String(1 + Math.floor(alea(...k(cle, "num")) * 120)), boite: "", codePostal: loc.codePostal, commune: loc.nom, province: loc.province, region: loc.region, pays: "BE" },
      localite: loc,
    };
  };
  const tirerZone = (cle: string): LocaliteB2c => choisirPondere(ZONE_PONDEREE, ...k(cle, "loc"));

  // --- Clients -----------------------------------------------------------------------------------------------
  const clients: ClientDemo[] = [];
  const PROBA_PRODUIT: Record<ProduitB2c, number> = { auto: 0.6, habitation: 0.5, familiale: 0.3, hospitalisation: 0.25, animaux: 0.1, obseques: 0.08, epargne_pension: 0.2, credit: 0.08 };
  const PRIME: Record<ProduitB2c, readonly [number, number]> = { auto: [350, 1100], habitation: [180, 600], familiale: [60, 140], hospitalisation: [150, 700], animaux: [80, 300], obseques: [300, 900], epargne_pension: [600, 1050], credit: [1800, 9600] };
  const contrat = (cle: string, produit: ProduitB2c, depuis: string, statut: "actif" | "resilie"): ContratDemo => {
    const debut = jourAleatoire(depuis, DATE_FIN_JEU, cle, "debut", produit);
    return {
      produit, compagnie: choisir(COMPAGNIES, ...k(cle, "compagnie", produit)), debut,
      fin: statut === "resilie" ? plusJours(debut, 200 + Math.floor(alea(...k(cle, "fin", produit)) * 1200)) : null, statut,
      montantAnnuel: Math.round(entre(PRIME[produit][0], PRIME[produit][1], ...k(cle, "montant", produit))),
    };
  };
  const nouveauClient = (id: string, loc: LocaliteB2c, p: { depuis?: string; produits?: readonly ProduitB2c[]; resilies?: readonly ProduitB2c[]; consentement?: ConsentementDemo; piege?: PiegeB2cId; personne?: PersonneDemo }): ClientDemo => {
    const depuis = p.depuis ?? jourAleatoire("2004-01-01", "2026-08-31", id, "depuis");
    let produits = p.produits ?? PRODUITS.filter((x) => alea(...k(id, "detient", x)) < PROBA_PRODUIT[x]);
    if (produits.length === 0) produits = ["auto"];
    // Les résiliations (une fois sur dix) laissent un client « sans » le produit : piège pour la vente croisée.
    const resilies = p.resilies ?? (p.produits === undefined ? produits.filter((x) => alea(...k(id, "resilie", x)) < 0.1) : []);
    const contrats = produits.map((x) => contrat(id, x, depuis, resilies.includes(x) ? "resilie" : "actif"));
    return {
      id, entite: ENTITE_PRODUIT[produits[0]!], depuis, personne: p.personne ?? personne(id, loc), contrats,
      consentement: p.consentement ?? consentement(id, jourAleatoire(depuis, DATE_FIN_JEU, id, "date-accord"), { probabilite: 0.75 }),
      piege: p.piege ?? null,
    };
  };

  for (let i = 1; i <= 70; i++) {
    const id = `cl${trois(i)}`;
    clients.push(nouveauClient(id, tirerZone(id), {}));
  }
  // Pièges écrits à la main.
  const personneDoublon = personne("cl901", localiteZone("4020"), { telephone: true, courriel: true });
  clients.push(
    nouveauClient("cl901", localiteZone("4020"), { depuis: "2012-05-14", produits: ["auto", "habitation"], personne: personneDoublon, consentement: consentement("cl901", "2020-02-10") }),
    // Même personne, fiche tenue par l'entité vie (obsèques) : doublon entre entités.
    nouveauClient("cl902", localiteZone("4020"), { depuis: "2019-11-03", produits: ["obseques"], personne: personneDoublon, consentement: consentement("cl902", "2020-02-10") }),
  );
  clients[clients.length - 2]!.piege = "doublon";
  clients[clients.length - 1]!.piege = "doublon";
  clients.push(
    nouveauClient("cl903", localiteZone("4100"), { depuis: "2016-03-21", produits: ["auto", "familiale"], consentement: consentement("cl903", "2021-04-12", { retire: true }), piege: "consentement_retire" }),
    nouveauClient("cl904", localiteHorsZone("5000"), { depuis: "2014-09-08", produits: ["auto", "habitation"], consentement: consentement("cl904", "2022-01-17"), piege: "hors_zone" }),
    // Auto actif, habitation RÉSILIÉE : compte comme « auto sans habitation » dans la vente croisée.
    nouveauClient("cl905", localiteZone("4430"), { depuis: "2015-06-30", produits: ["auto", "habitation"], resilies: ["habitation"], consentement: consentement("cl905", "2021-09-01"), piege: "contrat_resilie" }),
  );

  // --- Demandes de devis -------------------------------------------------------------------------------------
  const demandes: DemandeDevisDemo[] = [];
  const PRODUITS_POIDS: readonly (readonly [ProduitB2c, number])[] = [["auto", 0.28], ["habitation", 0.2], ["hospitalisation", 0.12], ["familiale", 0.08], ["animaux", 0.07], ["obseques", 0.06], ["epargne_pension", 0.1], ["credit", 0.09]];
  const STATUTS_POIDS: readonly (readonly [StatutDemande, number])[] = [["abandonne", 0.35], ["complete", 0.4], ["rendez_vous_pris", 0.25]];
  const rendezVous = (statut: StatutDemande, date: string, cle: string): string | null => (statut === "rendez_vous_pris" ? plusJours(date, 1 + Math.floor(alea(...k(cle, "rdv")) * 14)) : null);

  for (let i = 1; i <= 56; i++) {
    const id = `dv${trois(i)}`;
    const statut = choisirPondere(STATUTS_POIDS, ...k(id, "statut"));
    const demandeLe = jourAleatoire("2026-04-01", DATE_FIN_JEU, id, "date");
    demandes.push({
      id, produit: choisirPondere(PRODUITS_POIDS, ...k(id, "produit")), demandeLe, statut, rendezVousLe: rendezVous(statut, demandeLe, id),
      personne: personne(id, tirerZone(id)),
      // Un devis abandonné a rarement atteint l'étape du consentement.
      consentement: consentement(id, demandeLe, { probabilite: statut === "abandonne" ? 0.3 : 0.9 }),
      clientId: null, piege: null,
    });
  }
  const demandeManuelle = (id: string, p: Omit<DemandeDevisDemo, "id" | "rendezVousLe"> & { rdv?: boolean }): DemandeDevisDemo => {
    const { rdv, ...reste } = p;
    return { id, rendezVousLe: rdv === true ? plusJours(p.demandeLe, 4) : null, ...reste };
  };
  // Doublon : même personne, deux demandes le même jour (abandon puis reprise).
  const personneDevis = personne("dv901", localiteZone("4030"), { telephone: true, courriel: true });
  demandes.push(
    demandeManuelle("dv901", { produit: "auto", demandeLe: "2026-08-03", statut: "abandonne", personne: personneDevis, consentement: sansConsentement(), clientId: null, piege: "doublon" }),
    demandeManuelle("dv902", { produit: "auto", demandeLe: "2026-08-03", statut: "complete", personne: personneDevis, consentement: consentement("dv902", "2026-08-03"), clientId: null, piege: "doublon" }),
    // Consentement retiré après la demande.
    demandeManuelle("dv903", { produit: "habitation", demandeLe: "2026-07-10", statut: "complete", personne: personne("dv903", localiteZone("4420")), consentement: consentement("dv903", "2026-07-10", { retire: true }), clientId: null, piege: "consentement_retire" }),
    demandeManuelle("dv904", { produit: "obseques", demandeLe: "2026-06-02", statut: "rendez_vous_pris", rdv: true, personne: personne("dv904", localiteZone("4460")), consentement: consentement("dv904", "2026-06-02", { retire: true }), clientId: null, piege: "consentement_retire" }),
    // Hors zone : province de Namur et Bruxelles.
    demandeManuelle("dv905", { produit: "auto", demandeLe: "2026-07-21", statut: "complete", personne: personne("dv905", localiteHorsZone("5000")), consentement: consentement("dv905", "2026-07-21"), clientId: null, piege: "hors_zone" }),
    demandeManuelle("dv906", { produit: "hospitalisation", demandeLe: "2026-09-05", statut: "rendez_vous_pris", rdv: true, personne: personne("dv906", localiteHorsZone("1000")), consentement: consentement("dv906", "2026-09-05"), clientId: null, piege: "hors_zone" }),
  );
  // Déjà équipé : demande d'un produit que la personne détient déjà (contrat actif) chez le courtier.
  const equipe = (produit: ProduitB2c): ClientDemo => clients.find((c) => c.piege === null && c.personne.localite.province === "Liège" && c.contrats.some((x) => x.produit === produit && x.statut === "actif"))!;
  const clientAuto = equipe("auto");
  const clientHab = equipe("habitation");
  demandes.push(
    demandeManuelle("dv907", { produit: "auto", demandeLe: "2026-08-18", statut: "complete", personne: clientAuto.personne, consentement: consentement("dv907", "2026-08-18"), clientId: clientAuto.id, piege: "deja_equipe" }),
    demandeManuelle("dv908", { produit: "habitation", demandeLe: "2026-09-12", statut: "abandonne", personne: clientHab.personne, consentement: sansConsentement(), clientId: clientHab.id, piege: "deja_equipe" }),
  );

  // --- Oppositions ---------------------------------------------------------------------------------------------
  const oppositions: OppositionDemo[] = [];
  for (let i = 1; i <= 22; i++) {
    const id = `op${trois(i)}`;
    const source = choisirPondere<SourceOpposition>([["registre_ne_m_appelez_plus", 0.6], ["opposition_courtier", 0.25], ["desabonnement_en_ligne", 0.15]], ...k(id, "source"));
    const canaux: Canal[] = source === "registre_ne_m_appelez_plus" ? ["telephone"] : source === "desabonnement_en_ligne" ? ["email"] : ["telephone", "sms", ...(alea(...k(id, "mail")) < 0.5 ? ["email" as const] : [])];
    // Un désabonnement part d'un e-mail : courriel obligatoire ; la liste téléphonique exige un numéro.
    const p = personne(id, tirerZone(id), { telephone: source !== "desabonnement_en_ligne" || alea(...k(id, "tel")) < 0.5, courriel: source !== "registre_ne_m_appelez_plus" || alea(...k(id, "mail2")) < 0.5 });
    oppositions.push({ id, personne: p, inscritLe: jourAleatoire("2024-01-01", DATE_FIN_JEU, id, "date"), source, canaux });
  }
  // Oppositions postérieures à un accord : le contact reste présent dans une demande et dans la base clients.
  const demandeConflit = demandes.find((d) => d.piege === null && d.statut === "complete" && d.personne.telephone !== null && consentementActif(d.consentement) && d.consentement.canaux.telephone);
  const clientConflit = clients.find((c) => c.piege === null && c.personne.telephone !== null && consentementActif(c.consentement) && c.consentement.canaux.telephone && c.consentement.date! <= "2026-06-30");
  if (demandeConflit) oppositions.push({ id: "op901", personne: demandeConflit.personne, inscritLe: plusJours(demandeConflit.demandeLe, 20), source: "registre_ne_m_appelez_plus", canaux: ["telephone"] });
  if (clientConflit) oppositions.push({ id: "op902", personne: clientConflit.personne, inscritLe: plusJours(clientConflit.consentement.date!, 30), source: "opposition_courtier", canaux: ["telephone", "sms"] });

  return { demandes, clients, oppositions };
}

let cache: JeuParticuliers | null = null;
/** Jeu partagé (construit à la demande, jamais modifié ensuite). */
export function jeuParticuliers(): JeuParticuliers {
  cache ??= construireJeuParticuliers();
  return cache;
}

const cleContact = (p: PersonneDemo): string[] => [p.telephone !== null ? `tel:${p.telephone.replace(/\s/g, "")}` : "", p.courriel !== null ? `mail:${p.courriel.toLowerCase()}` : ""].filter((x) => x !== "");

/** Oppositions dont le téléphone ou le courriel correspond à la personne (canaux réellement opposés). */
export function oppositionsDe(p: PersonneDemo, jeu: JeuParticuliers = jeuParticuliers()): OppositionDemo[] {
  const cles = new Set(cleContact(p));
  return jeu.oppositions.filter((o) => cleContact(o.personne).some((c) => cles.has(c)));
}

export interface PiegeB2c { id: PiegeB2cId; reference: string; description: string }

/** Pièges utiles pour les scénarios et les tests. */
export function piegesParticuliers(jeu: JeuParticuliers = jeuParticuliers()): PiegeB2c[] {
  const sorties: PiegeB2c[] = [];
  const description: Record<PiegeB2cId, string> = {
    doublon: "Même personne enregistrée deux fois (même nom, courriel et téléphone) : à fusionner avant tout envoi.",
    consentement_retire: "Accord marketing retiré après coup : aucun canal n'est utilisable.",
    hors_zone: "Personne hors de la province de Liège (zone du courtier) : aucun bureau proche.",
    deja_equipe: "La personne est déjà cliente et détient ce produit (contrat actif) : ne pas lui proposer un devis pour ce produit.",
    contrat_resilie: "Client dont le contrat habitation est résilié : il compte comme « auto sans habitation ».",
  };
  for (const d of jeu.demandes) if (d.piege !== null) sorties.push({ id: d.piege, reference: d.id, description: description[d.piege] });
  for (const c of jeu.clients) if (c.piege !== null) sorties.push({ id: c.piege, reference: c.id, description: description[c.piege] });
  return sorties;
}

// --- Fiches ------------------------------------------------------------------------------------------------------

const adresseSortie = (a: AdresseDemo): Record<string, unknown> => ({ rue: a.rue, numero: a.numero, boite: a.boite, code_postal: a.codePostal, commune: a.commune, province: a.province, region: a.region, pays: a.pays });
const dansZone = (p: PersonneDemo): boolean => p.localite.province === "Liège";

const sortieConsentement = (c: ConsentementDemo): Record<string, unknown> => ({
  date: c.date, texte: c.texte, actif: consentementActif(c), retire_le: c.retireLe, canaux: canauxUtilisables(c), canaux_a_l_origine: c.canaux,
});

const sortieOpposition = (p: PersonneDemo): { opposition_canaux: Canal[] } => {
  const canaux = new Set<Canal>();
  for (const o of oppositionsDe(p)) for (const c of o.canaux) canaux.add(c);
  return { opposition_canaux: CANAUX.filter((c) => canaux.has(c)) };
};

const ficheDemande = (d: DemandeDevisDemo): Record<string, unknown> => {
  const proche = bureauLePlusProche(d.personne.localite);
  return {
    id: d.id, marque: MARQUE_DEVIS, produit: d.produit, produit_libelle: LIBELLE_PRODUIT[d.produit], entite: ENTITE_PRODUIT[d.produit],
    demande_le: d.demandeLe, statut: d.statut, statut_libelle: LIBELLE_STATUT[d.statut], rendez_vous_le: d.rendezVousLe,
    personne: { nom: d.personne.nom, courriel: d.personne.courriel, telephone: d.personne.telephone },
    adresse: adresseSortie(d.personne.adresse), dans_zone: dansZone(d.personne),
    bureau_plus_proche: proche ? { id: proche.bureau.id, nom: proche.bureau.nom, distance_km: Math.round(proche.distanceKm * 10) / 10 } : null,
    consentement_marketing: sortieConsentement(d.consentement),
    client_existant: d.clientId,
    deja_equipe: d.clientId !== null && (jeuParticuliers().clients.find((c) => c.id === d.clientId)?.contrats.some((x) => x.produit === d.produit && x.statut === "actif") ?? false),
    ...sortieOpposition(d.personne),
  };
};

const produitsActifs = (c: ClientDemo): ProduitB2c[] => c.contrats.filter((x) => x.statut === "actif").map((x) => x.produit);

const ficheClient = (c: ClientDemo): Record<string, unknown> => {
  const proche = bureauLePlusProche(c.personne.localite);
  return {
    id: c.id, entite: c.entite, client_depuis: c.depuis, anciennete_annees: anneesEntre(c.depuis, DATE_FIN_JEU),
    personne: { nom: c.personne.nom, courriel: c.personne.courriel, telephone: c.personne.telephone },
    adresse: adresseSortie(c.personne.adresse), dans_zone: dansZone(c.personne),
    bureau_plus_proche: proche ? { id: proche.bureau.id, nom: proche.bureau.nom, distance_km: Math.round(proche.distanceKm * 10) / 10 } : null,
    produits_actifs: produitsActifs(c),
    contrats: c.contrats.map((x) => ({ produit: x.produit, produit_libelle: LIBELLE_PRODUIT[x.produit], entite: ENTITE_PRODUIT[x.produit], compagnie: x.compagnie, debut: x.debut, fin: x.fin, statut: x.statut, montant_annuel_eur: x.montantAnnuel })),
    consentement_marketing: sortieConsentement(c.consentement),
    ...sortieOpposition(c.personne),
  };
};

const ficheOpposition = (o: OppositionDemo, jeu: JeuParticuliers): Record<string, unknown> => {
  const cles = new Set(cleContact(o.personne));
  const memes = (p: PersonneDemo): boolean => cleContact(p).some((c) => cles.has(c));
  return {
    id: o.id, personne: { nom: o.personne.nom, courriel: o.personne.courriel, telephone: o.personne.telephone },
    adresse: adresseSortie(o.personne.adresse), dans_zone: dansZone(o.personne),
    inscrit_le: o.inscritLe, source: o.source, source_libelle: LIBELLE_SOURCE[o.source], canaux_opposes: o.canaux,
    correspond_a: { demandes: jeu.demandes.filter((d) => memes(d.personne)).map((d) => d.id), clients: jeu.clients.filter((c) => memes(c.personne)).map((c) => c.id) },
  };
};

const base = (): Record<string, string> => ({
  source: SOURCE_B2C, client_demonstration: nomAssureurDemo(),
  note: "Personnes entièrement fictives (suffixe « (démonstration) », courriels @exemple.invalid, téléphones +32 4 000 0X YY) : aucune personne réelle ne peut y correspondre.",
});

// --- Outils ------------------------------------------------------------------------------------------------------

const dateOptionnelle = (nom: string): z.ZodOptional<z.ZodString> => z.string().optional().describe(`${nom} (AAAA-MM-JJ, bornes comprises).`);
const canalUtilisable = z.enum(CANAUX).optional().describe("Garde ceux dont le consentement marketing est actif sur ce canal (accord donné et non retiré).");

export const outilDemandesDevis: OutilPasserelle = outilLecture(
  {
    nom: "b2c_demandes_devis",
    description: "Demandes de devis entrantes du site de devis en ligne : produit, commune, date, statut, consentement marketing (date, texte, canaux e-mail, téléphone, SMS), bureau le plus proche. Filtres cumulés (ET).",
    schemaEntree: {
      produits: z.array(z.enum(PRODUITS)).max(8).optional().describe("Produits demandés (l'un OU l'autre)."),
      statuts: z.array(z.enum(STATUTS_DEMANDE)).max(3).optional().describe("Statuts : abandonne, complete, rendez_vous_pris."),
      depuis: dateOptionnelle("Demandes à partir de"),
      jusqu_au: dateOptionnelle("Demandes jusqu'à"),
      consentement: z.enum(["actif", "retire", "aucun"]).optional().describe("actif = accord non retiré ; retire = accord retiré ; aucun = aucun accord recueilli."),
      canal: canalUtilisable,
      bureau: z.string().min(1).max(40).optional().describe("Identifiant du bureau le plus proche (bureau-liege, bureau-ans…)."),
      dans_zone: z.boolean().optional().describe("true = province de Liège seulement ; false = hors zone seulement."),
      ...formeZone,
      ...formePage,
    },
  },
  (args) => {
    const depuis = args.depuis === undefined ? undefined : verifierDateIso(args.depuis, "depuis");
    const jusquAu = args.jusqu_au === undefined ? undefined : verifierDateIso(args.jusqu_au, "jusqu_au");
    const zone: FiltreZone = args;
    const trouves = jeuParticuliers().demandes.filter((d) =>
      (args.produits === undefined || args.produits.length === 0 || args.produits.includes(d.produit)) &&
      (args.statuts === undefined || args.statuts.length === 0 || args.statuts.includes(d.statut)) &&
      (depuis === undefined || d.demandeLe >= depuis) && (jusquAu === undefined || d.demandeLe <= jusquAu) &&
      (args.consentement === undefined || (args.consentement === "actif" ? consentementActif(d.consentement) : args.consentement === "retire" ? d.consentement.retireLe !== null : d.consentement.date === null)) &&
      (args.canal === undefined || canauxUtilisables(d.consentement)[args.canal]) &&
      (args.bureau === undefined || bureauLePlusProche(d.personne.localite)?.bureau.id === args.bureau) &&
      (args.dans_zone === undefined || dansZone(d.personne) === args.dans_zone) &&
      adresseDansZone(d.personne.adresse, zone),
    );
    const { elements, ...pagination } = paginer(trouves, args.page);
    return { ...base(), ...pagination, demandes: elements.map(ficheDemande) };
  },
);

export const outilClients: OutilPasserelle = outilLecture(
  {
    nom: "b2c_clients",
    description: "Base de clients existants du courtier : contrats détenus (actifs ou résiliés), ancienneté, commune, consentements. Sert à la vente croisée : detient=[auto] et ne_detient_pas=[habitation] donne « auto sans habitation » (seuls les contrats ACTIFS comptent). Filtres cumulés (ET).",
    schemaEntree: {
      detient: z.array(z.enum(PRODUITS)).max(8).optional().describe("Produits détenus en contrat actif (TOUS ceux listés)."),
      ne_detient_pas: z.array(z.enum(PRODUITS)).max(8).optional().describe("Produits sans contrat actif (AUCUN de ceux listés)."),
      entite: z.enum(["non-vie", "vie", "credits"]).optional().describe("Entité qui tient la fiche client."),
      anciennete_min: z.number().int().min(0).max(80).optional().describe("Ancienneté minimale en années entières."),
      anciennete_max: z.number().int().min(0).max(80).optional().describe("Ancienneté maximale en années entières."),
      canal: canalUtilisable,
      dans_zone: z.boolean().optional().describe("true = province de Liège seulement ; false = hors zone seulement."),
      ...formeZone,
      ...formePage,
    },
  },
  (args) => {
    const zone: FiltreZone = args;
    const trouves = jeuParticuliers().clients.filter((c) => {
      const actifs = produitsActifs(c);
      const anciennete = anneesEntre(c.depuis, DATE_FIN_JEU);
      return (
        (args.detient === undefined || args.detient.every((p) => actifs.includes(p))) &&
        (args.ne_detient_pas === undefined || args.ne_detient_pas.every((p) => !actifs.includes(p))) &&
        (args.entite === undefined || c.entite === args.entite) &&
        (args.anciennete_min === undefined || anciennete >= args.anciennete_min) &&
        (args.anciennete_max === undefined || anciennete <= args.anciennete_max) &&
        (args.canal === undefined || canauxUtilisables(c.consentement)[args.canal]) &&
        (args.dans_zone === undefined || dansZone(c.personne) === args.dans_zone) &&
        adresseDansZone(c.personne.adresse, zone)
      );
    });
    const { elements, ...pagination } = paginer(trouves, args.page);
    return { ...base(), ...pagination, clients: elements.map(ficheClient) };
  },
);

export const outilOppositions: OutilPasserelle = outilLecture(
  {
    nom: "b2c_oppositions",
    description: "Personnes opposées au démarchage, dont les inscrits à la liste « Ne m'appelez plus » (simulée) : canaux refusés, date, source, et correspondances avec les demandes et les clients. Avec telephone ou courriel : vérifie un contact avant toute prise de contact.",
    schemaEntree: {
      telephone: z.string().min(5).max(30).optional().describe("Numéro à vérifier (espaces ignorés)."),
      courriel: z.string().min(3).max(120).optional().describe("Courriel à vérifier (sans tenir compte de la casse)."),
      canal: z.enum(CANAUX).optional().describe("Garde les oppositions qui couvrent ce canal."),
      sources: z.array(z.enum(SOURCES_OPPOSITION)).max(3).optional().describe("Origine de l'opposition (l'une OU l'autre)."),
      depuis: dateOptionnelle("Inscriptions à partir de"),
      ...formeZone,
      ...formePage,
    },
  },
  (args) => {
    const depuis = args.depuis === undefined ? undefined : verifierDateIso(args.depuis, "depuis");
    const zone: FiltreZone = args;
    const jeu = jeuParticuliers();
    const tel = args.telephone?.replace(/\s/g, "");
    const mail = args.courriel?.toLowerCase();
    const trouves = jeu.oppositions.filter((o) =>
      (tel === undefined || o.personne.telephone?.replace(/\s/g, "") === tel) &&
      (mail === undefined || o.personne.courriel?.toLowerCase() === mail) &&
      (args.canal === undefined || o.canaux.includes(args.canal)) &&
      (args.sources === undefined || args.sources.length === 0 || args.sources.includes(o.source)) &&
      (depuis === undefined || o.inscritLe >= depuis) &&
      adresseDansZone(o.personne.adresse, zone),
    );
    const { elements, ...pagination } = paginer(trouves, args.page);
    return { ...base(), ...pagination, oppositions: elements.map((o) => ficheOpposition(o, jeu)) };
  },
);

export const SERVICE_B2C = "b2c";

export function fournisseurB2c(): FournisseurService {
  return {
    service: SERVICE_B2C,
    mode: "demonstration",
    fiche: { id: SERVICE_B2C, libelle: "Particuliers du courtier (B2C)", portees: ["b2c:lecture"], proprietesDemo: [{ id: "particuliers/demo-b2c", libelle: "Particuliers fictifs du courtier de démonstration (devis, clients, oppositions)" }] },
    outils: [outilDemandesDevis, outilClients, outilOppositions],
  };
}
