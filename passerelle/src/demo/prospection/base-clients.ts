// Base clients de DÉMONSTRATION du courtier en assurances fictif (lot P8) : fichier d'import (CSV et XLSX), variante
// « pièges » et historique d'opportunités passées pour l'étalonnage des scores.
//
// Cohérence : les particuliers sont exactement les clients du simulateur B2C (`jeuParticuliers().clients` : mêmes
// identifiants, mêmes contrats). Les entreprises clientes sont tirées du jeu de prospection (`jeuProspection()`),
// avec leur numéro BCE fictif. Tout est déterministe : une clé de graine dédiée (« base-clients ») sans effet sur
// les autres jeux ; deux générations donnent des fichiers identiques octet pour octet.
// Fictivité : « (démonstration) » dans les noms, courriels @exemple.invalid, téléphones +32 4 000 …, aucune marque réelle.
// Le nom de l'assureur de démonstration vient de `nomAssureurDemo()` (jamais écrit en dur ici).

import { alea } from "../modele/alea.js";
import { BUREAUX, bureauLePlusProche, canauxUtilisables, jeuParticuliers, type ClientDemo, type ProduitB2c } from "./particuliers.js";
import { DATE_FIN_JEU, jeuProspection, type EntrepriseDemo } from "./jeu.js";

const k = (...cles: (string | number)[]): (string | number)[] => ["base-clients", ...cles];
const deux = (n: number): string => String(n).padStart(2, "0");
const quatre = (n: number): string => String(n).padStart(4, "0");

// --- Dates (aucune horloge) ----------------------------------------------------------------------------------

const MS_JOUR = 86_400_000;
const ms = (d: string): number => Date.parse(`${d}T00:00:00.000Z`);
const iso = (m: number): string => new Date(m).toISOString().slice(0, 10);
const plusJours = (d: string, n: number): string => { const r = iso(ms(d) + n * MS_JOUR); return r > DATE_FIN_JEU ? DATE_FIN_JEU : r; };
const jourAleatoire = (de: string, a: string, ...cles: (string | number)[]): string =>
  iso(ms(de) + Math.floor(alea(...k(...cles)) * (Math.round((ms(a) - ms(de)) / MS_JOUR) + 1)) * MS_JOUR);

// --- Référentiel entreprises ---------------------------------------------------------------------------------

export const PRODUITS_B2B = ["rc_pro", "multirisque", "flotte_auto", "accidents_travail"] as const;
export type ProduitB2b = (typeof PRODUITS_B2B)[number];
export const LIBELLE_PRODUIT_B2B: Record<ProduitB2b, string> = {
  rc_pro: "Responsabilité civile professionnelle", multirisque: "Multirisque professionnelle", flotte_auto: "Flotte automobile", accidents_travail: "Accidents du travail",
};
export const NOMBRE_ENTREPRISES_CLIENTES = 30;
const NOMBRE_ENTREPRISES_ANCIENNES = 4;
const SECTEURS_VEHICULES = new Set(["transport", "garage", "construction", "commerce"]);

// --- Types ---------------------------------------------------------------------------------------------------

export const COLONNES_CLIENTS = [
  "identifiant_client", "type", "prenom", "nom", "entreprise", "numero_bce", "courriel", "telephone", "code_postal", "commune",
  "produits_detenus", "date_debut", "statut", "consentement_courriel", "consentement_sms", "consentement_telephone", "bureau", "entite",
] as const;
export const COLONNES_PIEGES = [...COLONNES_CLIENTS, "remarque_sinistre"] as const;
export const COLONNES_HISTORIQUE = ["identifiant_opportunite", "segment", "type_cible", "produit", "canal_origine", "date_creation", "date_cloture", "issue", "motif_perte"] as const;

export interface LigneClient {
  identifiant_client: string;
  type: "particulier" | "entreprise";
  prenom: string;
  nom: string;
  entreprise: string;
  numero_bce: string;
  courriel: string;
  telephone: string;
  code_postal: string;
  commune: string;
  /** Codes des produits ACTIFS, séparés par « | ». */
  produits_detenus: string;
  date_debut: string;
  statut: "actif" | "ancien";
  consentement_courriel: "oui" | "non";
  consentement_sms: "oui" | "non";
  consentement_telephone: "oui" | "non";
  bureau: string;
  entite: string;
}

export interface LigneHistorique {
  identifiant_opportunite: string;
  segment: string;
  type_cible: "particulier" | "entreprise";
  produit: string;
  canal_origine: string;
  date_creation: string;
  date_cloture: string;
  issue: "gagnee" | "perdue";
  motif_perte: string;
}

/** Tableau neutre (en-têtes + cellules) : sert à la fois au CSV et au XLSX. Un nombre reste un nombre dans le XLSX. */
export interface Tableau { colonnes: readonly string[]; lignes: (string | number)[][] }

// --- Clients -------------------------------------------------------------------------------------------------

const oui = (b: boolean): "oui" | "non" => (b ? "oui" : "non");

function ligneParticulier(c: ClientDemo): LigneClient {
  const [prenom = "", ...reste] = c.personne.nom.split(" ");
  const canaux = canauxUtilisables(c.consentement);
  const actifs = c.contrats.filter((x) => x.statut === "actif").map((x) => x.produit);
  return {
    identifiant_client: c.id, type: "particulier", prenom, nom: reste.join(" "), entreprise: "", numero_bce: "",
    courriel: c.personne.courriel ?? "", telephone: c.personne.telephone ?? "", code_postal: c.personne.adresse.codePostal, commune: c.personne.adresse.commune,
    produits_detenus: actifs.join("|"), date_debut: c.depuis, statut: actifs.length > 0 ? "actif" : "ancien",
    consentement_courriel: oui(canaux.email), consentement_sms: oui(canaux.sms), consentement_telephone: oui(canaux.telephone),
    bureau: bureauLePlusProche(c.personne.localite)?.bureau.id ?? "", entite: c.entite,
  };
}

/** Entreprises clientes : sans piège de prospection, hors courtage (concurrents), créées avant avril 2026. Tirage par graine. */
function entreprisesClientes(): EntrepriseDemo[] {
  const candidates = jeuProspection().entreprises.filter((e) => e.piege === null && e.secteur !== "courtage" && e.debut <= "2026-03-31");
  return [...candidates].sort((a, b) => alea(...k("choix-entreprise", a.id)) - alea(...k("choix-entreprise", b.id))).slice(0, NOMBRE_ENTREPRISES_CLIENTES).sort((a, b) => a.id.localeCompare(b.id));
}

function produitsEntreprise(e: EntrepriseDemo): ProduitB2b[] {
  const vehicules = SECTEURS_VEHICULES.has(e.secteur);
  const p: ProduitB2b[] = [];
  if (alea(...k(e.id, "rc_pro")) < 0.9) p.push("rc_pro");
  if (alea(...k(e.id, "multirisque")) < 0.5) p.push("multirisque");
  if (alea(...k(e.id, "flotte_auto")) < (vehicules ? 0.6 : 0.1)) p.push("flotte_auto");
  if (alea(...k(e.id, "accidents_travail")) < 0.7) p.push("accidents_travail");
  return p.length > 0 ? p : ["rc_pro"];
}

/** Date de début de la relation : après la création de l'entreprise (au plus tôt 2012), au plus tard mi-2025 (mi-2026 pour une entreprise récente). */
function debutClient(e: EntrepriseDemo): string {
  const de = e.debut > "2012-01-01" ? e.debut : "2012-01-01";
  return jourAleatoire(de, de > "2025-06-30" ? DATE_FIN_JEU : "2025-06-30", "debut-client", e.id);
}

function lignesEntreprises(): LigneClient[] {
  const choisies = entreprisesClientes();
  const anciennes = new Set([...choisies].sort((a, b) => alea(...k("ancien", a.id)) - alea(...k("ancien", b.id))).slice(0, NOMBRE_ENTREPRISES_ANCIENNES).map((e) => e.id));
  const lignes = choisies.map((e) => {
    const ancien = anciennes.has(e.id);
    return { e, ancien, produits: ancien ? [] : produitsEntreprise(e) };
  });
  // Garantie de démonstration : au moins trois clientes actives avec RC pro sans multirisque (vente croisée B2B).
  let sansMulti = lignes.filter((l) => l.produits.includes("rc_pro") && !l.produits.includes("multirisque")).length;
  for (const l of lignes) {
    if (sansMulti >= 3) break;
    if (!l.ancien && l.produits.includes("multirisque")) { l.produits = l.produits.filter((p) => p !== "multirisque"); if (!l.produits.includes("rc_pro")) l.produits.unshift("rc_pro"); sansMulti++; }
  }
  return lignes.map(({ e, ancien, produits }): LigneClient => ({
    identifiant_client: `ent-${e.id}`, type: "entreprise", prenom: "", nom: "", entreprise: e.denomination, numero_bce: e.numero,
    courriel: e.courriel ?? "", telephone: e.telephone ?? "", code_postal: e.siege.codePostal, commune: e.siege.commune,
    produits_detenus: produits.join("|"), date_debut: debutClient(e), statut: ancien ? "ancien" : "actif",
    consentement_courriel: oui(e.courriel !== null && alea(...k(e.id, "c-email")) < 0.85), consentement_sms: "non", consentement_telephone: oui(e.telephone !== null && alea(...k(e.id, "c-tel")) < 0.7),
    bureau: BUREAUX.find((b) => b.adresse.commune === e.siege.commune)?.id ?? "bureau-liege", entite: "non-vie",
  }));
}

/** Base clients : 75 particuliers (ceux de b2c_clients) puis une trentaine d'entreprises clientes. */
export function construireBaseClients(): LigneClient[] {
  return [...jeuParticuliers().clients.map(ligneParticulier), ...lignesEntreprises()];
}

// --- Opportunités de vente croisée (déduites de la base) -----------------------------------------------------------

export interface OpportuniteVenteCroisee { identifiant_client: string; regle: "auto_sans_habitation" | "rc_pro_sans_multirisque"; produit_propose: ProduitB2c | ProduitB2b }

export function opportunitesVenteCroisee(base: readonly LigneClient[] = construireBaseClients()): OpportuniteVenteCroisee[] {
  const r: OpportuniteVenteCroisee[] = [];
  for (const l of base) {
    if (l.statut !== "actif") continue;
    const p = l.produits_detenus.split("|");
    if (l.type === "particulier" && p.includes("auto") && !p.includes("habitation")) r.push({ identifiant_client: l.identifiant_client, regle: "auto_sans_habitation", produit_propose: "habitation" });
    if (l.type === "entreprise" && p.includes("rc_pro") && !p.includes("multirisque")) r.push({ identifiant_client: l.identifiant_client, regle: "rc_pro_sans_multirisque", produit_propose: "multirisque" });
  }
  return r;
}

// --- Historique d'opportunités (étalonnage) -------------------------------------------------------------------------

/** Seuils d'étalonnage : un segment n'est étalonné qu'à partir de ces effectifs ; en dessous, la démonstration affiche « données insuffisantes ». */
export const SEUIL_PROSPECTS = 300;
export const SEUIL_CONVERSIONS = 30;

interface SegmentHistorique { type: "particulier" | "entreprise"; produit: string; total: number; gagnees: number }
/** Effectifs exacts (opportunités closes 2025-2026) : deux segments au-dessus des seuils, les autres en dessous. */
const SEGMENTS: readonly SegmentHistorique[] = [
  { type: "particulier", produit: "auto", total: 480, gagnees: 62 },
  { type: "particulier", produit: "habitation", total: 340, gagnees: 41 },
  { type: "particulier", produit: "hospitalisation", total: 150, gagnees: 14 },
  { type: "particulier", produit: "familiale", total: 90, gagnees: 9 },
  { type: "particulier", produit: "epargne_pension", total: 120, gagnees: 10 },
  { type: "particulier", produit: "obseques", total: 60, gagnees: 3 },
  { type: "particulier", produit: "animaux", total: 80, gagnees: 5 },
  { type: "particulier", produit: "credit", total: 100, gagnees: 9 },
  { type: "entreprise", produit: "rc_pro", total: 110, gagnees: 16 },
  { type: "entreprise", produit: "multirisque", total: 70, gagnees: 9 },
  { type: "entreprise", produit: "flotte_auto", total: 45, gagnees: 7 },
  { type: "entreprise", produit: "accidents_travail", total: 60, gagnees: 6 },
];
const CANAUX_ORIGINE = ["devis_en_ligne", "recommandation", "prospection_courriel", "appel_sortant", "bureau"] as const;
/**
 * Taux de conversion FICTIFS par canal d'origine (démonstration uniquement), croissants avec le score de démonstration du canal
 * (`SCORE_DEMO_CANAL` côté plugin : recommandation 70, bureau 60, devis en ligne 50, appel sortant 40, prospection par courriel 30).
 * Ils servent de poids relatifs : le nombre de gagnées par segment reste exact (seuils d'étalonnage), mais les gagnées se
 * répartissent entre canaux au prorata de ces taux (les taux mesurés sont donc proportionnels, à l'échelle du segment près). Aucune donnée réelle.
 */
export const TAUX_CONVERSION_DEMO_CANAL: Readonly<Record<(typeof CANAUX_ORIGINE)[number], number>> = {
  recommandation: 0.30, bureau: 0.25, devis_en_ligne: 0.12, appel_sortant: 0.08, prospection_courriel: 0.05,
};
const MOTIFS_PERTE = ["prix", "concurrent", "pas_de_reponse", "pas_de_besoin", "delai_trop_long"] as const;
const choisirDans = <T>(liste: readonly T[], ...cles: (string | number)[]): T => liste[Math.min(liste.length - 1, Math.floor(alea(...k(...cles)) * liste.length))]!;

/**
 * Répartit exactement `nombre` gagnées entre les canaux au prorata de (effectif du canal x taux fictif du canal), méthode du plus
 * fort reste, puis choisit dans chaque canal les opportunités de plus petite clé pseudo-aléatoire (déterministe).
 */
function choisirGagnees(nombre: number, canaux: readonly (typeof CANAUX_ORIGINE)[number][], segment: string): Set<number> {
  const poids = CANAUX_ORIGINE.map((c) => canaux.filter((x) => x === c).length * TAUX_CONVERSION_DEMO_CANAL[c]);
  const somme = poids.reduce((t, p) => t + p, 0);
  const brut = poids.map((p) => (p / somme) * nombre);
  const quota = brut.map(Math.floor);
  const parReste = brut.map((b, j) => ({ j, reste: b - Math.floor(b) })).sort((x, y) => y.reste - x.reste || x.j - y.j);
  const manque = nombre - quota.reduce((t, q) => t + q, 0);
  for (let r = 0; r < manque; r++) quota[parReste[r]!.j]!++;
  const gagnees = new Set<number>();
  CANAUX_ORIGINE.forEach((c, j) => {
    const indices = canaux.flatMap((x, i) => (x === c ? [i] : [])).sort((a, b) => alea(...k("gagne", segment, a)) - alea(...k("gagne", segment, b)) || a - b);
    indices.slice(0, quota[j]).forEach((i) => gagnees.add(i));
  });
  return gagnees;
}

export function construireHistorique(): LigneHistorique[] {
  const lignes: Omit<LigneHistorique, "identifiant_opportunite">[] = [];
  for (const s of SEGMENTS) {
    const segment = `${s.type}_${s.produit}`;
    const canaux = [...Array(s.total).keys()].map((i) => choisirDans(CANAUX_ORIGINE, "canal", segment, i));
    const gagnees = choisirGagnees(s.gagnees, canaux, segment);
    for (let i = 0; i < s.total; i++) {
      const creation = jourAleatoire("2025-01-01", "2026-08-31", "creation", segment, i);
      const gagne = gagnees.has(i);
      lignes.push({
        segment, type_cible: s.type, produit: s.produit, canal_origine: canaux[i]!, date_creation: creation,
        date_cloture: plusJours(creation, 2 + Math.floor(alea(...k("duree", segment, i)) * 88)), issue: gagne ? "gagnee" : "perdue",
        motif_perte: gagne ? "" : choisirDans(MOTIFS_PERTE, "motif", segment, i),
      });
    }
  }
  lignes.sort((a, b) => a.date_creation.localeCompare(b.date_creation) || a.segment.localeCompare(b.segment) || a.date_cloture.localeCompare(b.date_cloture));
  return lignes.map((l, i) => ({ identifiant_opportunite: `op-${quatre(i + 1)}`, ...l }));
}

export interface EtalonnageSegment { segment: string; prospects: number; conversions: number; etalonne: boolean }

export function etalonnage(historique: readonly LigneHistorique[] = construireHistorique()): EtalonnageSegment[] {
  const m = new Map<string, EtalonnageSegment>();
  for (const h of historique) {
    const e = m.get(h.segment) ?? { segment: h.segment, prospects: 0, conversions: 0, etalonne: false };
    e.prospects++;
    if (h.issue === "gagnee") e.conversions++;
    m.set(h.segment, e);
  }
  return [...m.values()].map((e) => ({ ...e, etalonne: e.prospects >= SEUIL_PROSPECTS && e.conversions >= SEUIL_CONVERSIONS })).sort((a, b) => a.segment.localeCompare(b.segment));
}

// --- Variante « pièges » ------------------------------------------------------------------------------------------------

/** Nombre de lignes de la variante portant une remarque de sinistre. */
export const NOMBRE_REMARQUES_SINISTRE = 3;
export function telephoneEnNombre(telephone: string): number {
  // « +32 4 000 01 10 » → numéro national « 04 000 01 10 » → nombre 40000110 (le 0 de tête disparaît).
  return Number(`0${telephone.replace(/\D/g, "").slice(2)}`);
}

/** Variante qui DOIT être refusée par l'import : colonne `remarque_sinistre` (donnée de sinistre) et un téléphone au format nombre. */
export function tableauPieges(base: readonly LigneClient[] = construireBaseClients()): Tableau {
  const parts = base.map((l, i) => ({ l, i })).filter(({ l }) => l.type === "particulier" && l.statut === "actif");
  const avecRemarque = new Set(parts.slice(0, NOMBRE_REMARQUES_SINISTRE * 4).filter((_, j) => j % 4 === 0).map(({ i }) => i));
  const indexTelephone = base.findIndex((l) => l.type === "particulier" && l.telephone !== "");
  return {
    colonnes: COLONNES_PIEGES,
    lignes: base.map((l, i) => COLONNES_PIEGES.map((c): string | number => {
      if (c === "remarque_sinistre") return avecRemarque.has(i) ? "Sinistre déclaré en 2026, dossier en cours d'expertise (démonstration)" : "";
      if (c === "telephone" && i === indexTelephone) return telephoneEnNombre(l.telephone);
      return l[c];
    })),
  };
}

// --- Sérialisation ------------------------------------------------------------------------------------------------------

export function tableauClients(base: readonly LigneClient[] = construireBaseClients()): Tableau {
  return { colonnes: COLONNES_CLIENTS, lignes: base.map((l) => COLONNES_CLIENTS.map((c) => l[c])) };
}
export function tableauHistorique(h: readonly LigneHistorique[] = construireHistorique()): Tableau {
  return { colonnes: COLONNES_HISTORIQUE, lignes: h.map((l) => COLONNES_HISTORIQUE.map((c) => l[c])) };
}

const cellule = (v: string | number): string => {
  const t = String(v);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
/** CSV UTF-8 sans BOM, séparateur « ; », fins de ligne « \n », en-têtes en français. */
export function versCsv(t: Tableau): string {
  return [t.colonnes.map(cellule).join(";"), ...t.lignes.map((l) => l.map(cellule).join(";"))].join("\n") + "\n";
}

export const NOMS_FICHIERS = ["base-clients", "base-clients-pieges", "historique-opportunites"] as const;
export type NomFichier = (typeof NOMS_FICHIERS)[number];

/** Les trois tableaux de la livraison (le script en tire les CSV et les XLSX). */
export function tableauxBaseClients(): Record<NomFichier, Tableau> {
  const base = construireBaseClients();
  return { "base-clients": tableauClients(base), "base-clients-pieges": tableauPieges(base), "historique-opportunites": tableauHistorique() };
}
export function csvBaseClients(): Record<NomFichier, string> {
  const t = tableauxBaseClients();
  return { "base-clients": versCsv(t["base-clients"]), "base-clients-pieges": versCsv(t["base-clients-pieges"]), "historique-opportunites": versCsv(t["historique-opportunites"]) };
}
