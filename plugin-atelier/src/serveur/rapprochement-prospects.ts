/**
 * Rapprochement prudent des fiches de prospects qui désignent la même entreprise (doublons).
 *
 * Règles (en cas de doute, on ne fusionne pas) :
 * - même numéro BCE : même prospect, toujours ;
 * - deux numéros BCE différents : jamais le même prospect, quel que soit le nom ;
 * - sans numéro BCE commun : même nom normalisé (minuscules, sans accents, sans forme juridique) ET même
 *   code postal ; une commune différente, ou deux positions exactes éloignées de plus de 500 m, l'empêche.
 * Seules les entreprises sont concernées (jamais un particulier ni un partenaire).
 *
 * Module pur : aucune écriture. L'écriture est faite par la route `prospects.fusionner-doublons`.
 */
import type { Prospect } from "../contrats/index.js";
import { distanceKm } from "./geo.js";

/** Formes juridiques retirées du nom (liste explicite, belge et voisins). */
export const FORMES_JURIDIQUES: readonly string[] = [
  "srl", "sprl", "sa", "sc", "scrl", "scri", "sca", "snc", "scs", "asbl", "aisbl", "ivzw", "bv", "bvba", "nv", "vzw", "cv", "cvba", "vof", "gcv", "eurl", "sarl", "sas", "sasu", "gmbh", "ltd",
];
const FORMES = new Set(FORMES_JURIDIQUES);

/** Distance (km) au-delà de laquelle deux positions exactes désignent deux lieux différents. */
const DISTANCE_MAX_KM = 0.5;

/** Nom comparable : minuscules, sans accents ni ponctuation ni forme juridique ; null si trop court pour comparer. */
export function nomRapprochement(denomination: string | null): string | null {
  if (!denomination) return null;
  const brut = denomination.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\./gu, "").replace(/[^a-z0-9]+/gu, " ").trim();
  const mots = brut.split(" ").filter(Boolean);
  while (mots.length > 1 && FORMES.has(mots[mots.length - 1]!)) mots.pop();
  while (mots.length > 1 && FORMES.has(mots[0]!)) mots.shift();
  const nom = mots.join(" ");
  return nom.length >= 3 && !(mots.length === 1 && FORMES.has(nom)) ? nom : null;
}

const chiffres = (bce: string | null) => (bce === null ? null : bce.replace(/\D/gu, "") || null);

export interface PaireDoublon {
  garde: Prospect;
  absorbe: Prospect;
  raison: "bce" | "nom_code_postal";
}

/** Vrai si les deux fiches, sans BCE commun, peuvent être la même entreprise (nom + code postal, sans contre-indication). */
function memeNomEtCodePostal(a: Prospect, b: Prospect): boolean {
  const na = nomRapprochement(a.denomination);
  const nb = nomRapprochement(b.denomination);
  if (na === null || nb === null || na !== nb) return false;
  if (a.zone.codePostal === null || a.zone.codePostal !== b.zone.codePostal) return false;
  const ca = a.zone.commune?.trim().toLowerCase();
  const cb = b.zone.commune?.trim().toLowerCase();
  if (ca && cb && ca.normalize("NFD").replace(/\p{M}/gu, "") !== cb.normalize("NFD").replace(/\p{M}/gu, "")) return false;
  const pa = a.zone.position;
  const pb = b.zone.position;
  if (pa && pb && pa.precision === "exacte" && pb.precision === "exacte" && distanceKm({ latitude: pa.lat, longitude: pa.lon }, { latitude: pb.lat, longitude: pb.lon }) > DISTANCE_MAX_KM) return false;
  return true;
}

/** Les deux fiches désignent-elles le même prospect ? Renvoie la raison, ou null. */
export function raisonDoublon(a: Prospect, b: Prospect): PaireDoublon["raison"] | null {
  if (a.cible !== "entreprise" || b.cible !== "entreprise" || a.companyId !== b.companyId) return null;
  const ba = chiffres(a.numeroBce);
  const bb = chiffres(b.numeroBce);
  if (ba !== null && bb !== null) return ba === bb ? "bce" : null;
  return memeNomEtCodePostal(a, b) ? "nom_code_postal" : null;
}

/** Fiche gardée : celle qui porte un numéro BCE, sinon la plus ancienne (puis l'identifiant, pour un choix stable). */
function prefere(a: Prospect, b: Prospect): Prospect {
  const ka = [a.numeroBce === null ? 1 : 0, a.creeLe, a.id];
  const kb = [b.numeroBce === null ? 1 : 0, b.creeLe, b.id];
  for (let i = 0; i < ka.length; i++) if (ka[i]! !== kb[i]!) return ka[i]! < kb[i]! ? a : b;
  return a;
}

/**
 * Paires à fusionner dans une liste de prospects d'UNE entreprise. Les fiches déjà écartées comme doublon sont
 * ignorées (un second passage ne trouve rien). Si A~B et B~C, B et C vont tous deux vers le même survivant.
 */
export function trouverPairesDoublons(prospects: readonly Prospect[]): PaireDoublon[] {
  const candidats = prospects.filter((p) => p.cible === "entreprise" && !p.motifsExclusion.some((m) => m.motif === "doublon"));
  const parent = new Map<string, string>(candidats.map((p) => [p.id, p.id]));
  const racine = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const raisons = new Map<string, PaireDoublon["raison"]>();
  for (let i = 0; i < candidats.length; i++) {
    for (let j = i + 1; j < candidats.length; j++) {
      const a = candidats[i]!;
      const b = candidats[j]!;
      const raison = raisonDoublon(a, b);
      if (raison === null) continue;
      const ra = racine(a.id);
      const rb = racine(b.id);
      if (ra !== rb) parent.set(rb, ra);
      raisons.set(a.id, raisons.get(a.id) ?? raison);
      raisons.set(b.id, raisons.get(b.id) ?? raison);
    }
  }
  const groupes = new Map<string, Prospect[]>();
  for (const p of candidats) {
    const r = racine(p.id);
    (groupes.get(r) ?? groupes.set(r, []).get(r)!).push(p);
  }
  const paires: PaireDoublon[] = [];
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue;
    // Deux numéros BCE différents dans un même groupe (liés par une fiche sans BCE) : doute, on ne fusionne pas.
    const bces = new Set(membres.map((m) => chiffres(m.numeroBce)).filter((x) => x !== null));
    if (bces.size > 1) continue;
    const garde = membres.reduce(prefere);
    for (const absorbe of membres) if (absorbe.id !== garde.id) paires.push({ garde, absorbe, raison: raisons.get(absorbe.id) ?? "nom_code_postal" });
  }
  return paires;
}

/**
 * Fusion de `absorbe` dans `garde` (sans rien perdre) : coordonnées et sources réunies sans doublon (`egal` décide
 * si deux sources sont identiques), codes NACE du survivant sinon de l'absorbé, empreintes réunies.
 */
export function fusionnerProspects(garde: Prospect, absorbe: Prospect, egal: (a: unknown, b: unknown) => boolean): Pick<Prospect, "coordonnees" | "sources" | "nace" | "empreintes"> {
  const coordonnees = [...garde.coordonnees, ...absorbe.coordonnees.filter((c) => !garde.coordonnees.some((g) => g.canal === c.canal && g.empreinte === c.empreinte))].slice(0, 20);
  const sources = [...garde.sources];
  for (const s of absorbe.sources) if (!sources.some((x) => egal(x, s))) sources.push(s);
  const vues = new Set<string>();
  const empreintes = [...garde.empreintes, ...absorbe.empreintes].filter((e) => {
    const k = `${e.type}:${e.valeur}`;
    if (vues.has(k)) return false;
    vues.add(k);
    return true;
  });
  return { coordonnees, sources: sources.slice(-50), nace: garde.nace.length > 0 ? garde.nace : absorbe.nace, empreintes: empreintes.slice(0, 20) };
}
