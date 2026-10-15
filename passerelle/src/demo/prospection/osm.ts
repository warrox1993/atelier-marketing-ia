// Simulateur `osm` (lot P3b) : établissements OpenStreetMap FICTIFS, cohérents avec le simulateur de la BCE (P2).
//
// Cohérence avec P2 (prouvée par tests/reel-prospection/osm-demo.test.ts) : les établissements des secteurs commerce,
// restauration, hôtellerie, garage, couverture, isolation, menuiserie et courtage reprennent le nom, l'adresse, le téléphone et
// le site des entreprises fictives de `bce` ; des établissements supplémentaires, sans entreprise correspondante à la BCE,
// complètent chaque commune. Aucune vraie enseigne, aucune vraie personne : noms suffixés « (démonstration) », sites en
// `.demo-prospection.example`, téléphones `+32 4 000 00 NN`, identifiants `demo/n…` (jamais un vrai identifiant OSM).
// Les positions sont des points fictifs autour du centre approximatif de chaque commune.
//
// Mêmes noms d'outils, mêmes schémas et mêmes formes de réponse que le fournisseur réel (src/reel/prospection/osm/).

import type { FournisseurService, OutilPasserelle, RegistreFournisseurs } from "../../fournisseurs.js";
import { alea } from "../modele/alea.js";
import { outilLecture } from "./commun.js";
import { jeuProspection, type EntrepriseDemo } from "./jeu.js";
import {
  ATTRIBUTION_OSM, DESCRIPTION_COMMERCES, DESCRIPTION_REPARTITION, FICHE_OSM, LICENCE_OSM, TAILLE_PAGE_OSM,
  normaliserOsm, schemaCommerces, schemaRepartition, type CategorieOsm, type CommerceOsm,
} from "./osm-commun.js";
import { DOMAINE_SITES, LOCALITES, RUES, nomAssureurDemo, type Localite } from "./referentiel.js";
import type { AdresseDemo } from "./jeu.js";

export const SOURCE_OSM_DEMO = "OpenStreetMap (simulateur de démonstration : établissements entièrement fictifs)";
export const DATE_EXTRACTION_OSM_DEMO = "2026-09-30";

/** Centre approximatif (latitude, longitude) des localités du jeu de démonstration. */
const CENTRES: Record<string, readonly [number, number]> = {
  "4000": [50.633, 5.568], "4020": [50.642, 5.585], "4030": [50.615, 5.595], "4430": [50.66, 5.52], "4040": [50.667, 5.625],
  "4100": [50.583, 5.5], "4420": [50.63, 5.53], "4460": [50.65, 5.47], "4400": [50.605, 5.465], "5000": [50.467, 4.872],
  "1000": [50.85, 4.352], "9000": [51.054, 3.722],
};

const SECTEUR_VERS_OSM: Record<string, { categorie: CategorieOsm; cle: string; valeur: string }> = {
  couverture: { categorie: "artisanat", cle: "craft", valeur: "roofer" },
  isolation: { categorie: "artisanat", cle: "craft", valeur: "insulation" },
  menuiserie: { categorie: "artisanat", cle: "craft", valeur: "carpenter" },
  commerce: { categorie: "commerce", cle: "shop", valeur: "general" },
  restauration: { categorie: "restauration", cle: "amenity", valeur: "restaurant" },
  hotellerie: { categorie: "hebergement", cle: "tourism", valeur: "hotel" },
  garage: { categorie: "automobile", cle: "shop", valeur: "car_repair" },
  courtage: { categorie: "finance_assurance", cle: "office", valeur: "insurance" },
};

interface Supplementaire { nom: string; categorie: CategorieOsm; cle: string; valeur: string; codePostal: string; marque?: string }

const SUPPLEMENTAIRES: readonly Supplementaire[] = [
  { nom: "Boulangerie des Exemples (démonstration)", categorie: "commerce", cle: "shop", valeur: "bakery", codePostal: "4000" },
  { nom: "Pharmacie de la Démonstration (démonstration)", categorie: "sante", cle: "amenity", valeur: "pharmacy", codePostal: "4020" },
  { nom: "Café du Modèle (démonstration)", categorie: "restauration", cle: "amenity", valeur: "cafe", codePostal: "4000" },
  { nom: "Fleuriste Imaginaire (démonstration)", categorie: "commerce", cle: "shop", valeur: "florist", codePostal: "4430" },
  { nom: "Coiffure Fictive (démonstration)", categorie: "commerce", cle: "shop", valeur: "hairdresser", codePostal: "4430" },
  { nom: "Librairie du Brouillon (démonstration)", categorie: "commerce", cle: "shop", valeur: "books", codePostal: "4100" },
  { nom: "Station Essai (démonstration)", categorie: "automobile", cle: "amenity", valeur: "fuel", codePostal: "4460" },
  { nom: "Cabinet Dentaire Fictif (démonstration)", categorie: "sante", cle: "amenity", valeur: "dentist", codePostal: "4000" },
  { nom: "Boucherie du Test (démonstration)", categorie: "commerce", cle: "shop", valeur: "butcher", codePostal: "4420" },
  { nom: "Auberge de l'Essai (démonstration)", categorie: "hebergement", cle: "tourism", valeur: "guest_house", codePostal: "5000" },
  { nom: "Atelier Menuiserie Modèle (démonstration)", categorie: "artisanat", cle: "craft", valeur: "carpenter", codePostal: "4400" },
  { nom: "Comptabilité Fictive (démonstration)", categorie: "finance_assurance", cle: "office", valeur: "accountant", codePostal: "4000" },
  { nom: "Agence Immobilière Démo (démonstration)", categorie: "bureau", cle: "office", valeur: "estate_agent", codePostal: "1000" },
  { nom: "Garage du Test (démonstration)", categorie: "automobile", cle: "shop", valeur: "car_repair", codePostal: "4040" },
  { nom: "Brasserie du Brouillon (démonstration)", categorie: "restauration", cle: "amenity", valeur: "restaurant", codePostal: "4040" },
  { nom: "Supérette Fictive (démonstration)", categorie: "commerce", cle: "shop", valeur: "convenience", codePostal: "4100" },
];

interface PoiDemo extends CommerceOsm {
  /** Numéro BCE de l'entreprise fictive correspondante (cohérence avec P2), `null` pour un établissement sans entreprise. */
  numeroBce: string | null;
  commune: string;
  province: string | null;
  region: string;
}

const slug = (nom: string): string => normaliserOsm(nom.replace(/ \(démonstration\)$/, "")).replace(/ /g, "-");
const k = (...cles: (string | number)[]): (string | number)[] => ["prospection", "osm", ...cles];

function position(codePostal: string, cle: string): { lat: number; lon: number } {
  const [lat, lon] = CENTRES[codePostal] ?? [50.6, 5.5];
  const arrondi = (v: number): number => Math.round(v * 1e5) / 1e5;
  return { lat: arrondi(lat + (alea(...k(cle, "lat")) - 0.5) * 0.02), lon: arrondi(lon + (alea(...k(cle, "lon")) - 0.5) * 0.03) };
}

function adresseVersOsm(a: AdresseDemo): CommerceOsm["adresse"] {
  return { rue: a.rue, numero: a.numero, code_postal: a.codePostal, commune: a.commune };
}

let cache: PoiDemo[] | null = null;

/** Établissements fictifs (construits une fois, jamais modifiés : mêmes octets d'un appel à l'autre). */
export function poisOsmDemo(): readonly PoiDemo[] {
  if (cache) return cache;
  const pois: PoiDemo[] = [];
  const telephonesUtilises = new Set<string>();
  let compteur = 0;
  const idSuivant = (): string => `demo/n${String(++compteur).padStart(4, "0")}`;

  for (const e of jeuProspection().entreprises as readonly EntrepriseDemo[]) {
    const m = SECTEUR_VERS_OSM[e.secteur];
    if (!m) continue;
    if (e.telephone) telephonesUtilises.add(e.telephone);
    const id = idSuivant();
    pois.push({
      id, type: "node", nom: e.denomination, categorie: m.categorie, cle: m.cle, valeur: m.valeur, adresse: adresseVersOsm(e.siege),
      telephone: e.telephone, site: e.site, horaires: m.categorie === "restauration" || m.categorie === "commerce" ? "Mo-Sa 09:00-18:00" : null, marque: null,
      position: position(e.siege.codePostal, e.id), url_osm: null, numeroBce: e.numero, commune: e.siege.commune, province: e.siege.province, region: e.siege.region,
    });
  }

  for (const s of SUPPLEMENTAIRES) {
    const loc: Localite = LOCALITES.find((l) => l.codePostal === s.codePostal)!;
    const cle = `supp-${s.nom}`;
    let tel: string | null = null;
    if (alea(...k(cle, "tel")) < 0.8) {
      for (let essai = 0; ; essai++) {
        const candidat = `+32 4 000 00 ${10 + Math.floor(alea(...k(cle, "tel-n", essai)) * 90)}`;
        if (!telephonesUtilises.has(candidat)) {
          telephonesUtilises.add(candidat);
          tel = candidat;
          break;
        }
      }
    }
    pois.push({
      id: idSuivant(), type: "node", nom: s.nom, categorie: s.categorie, cle: s.cle, valeur: s.valeur,
      adresse: { rue: RUES[Math.floor(alea(...k(cle, "rue")) * RUES.length)]!, numero: String(1 + Math.floor(alea(...k(cle, "num")) * 140)), code_postal: loc.codePostal, commune: loc.nom },
      telephone: tel, site: alea(...k(cle, "site")) < 0.5 ? `https://${slug(s.nom)}.${DOMAINE_SITES}` : null,
      horaires: alea(...k(cle, "horaires")) < 0.7 ? "Mo-Fr 08:30-17:30" : null, marque: null,
      position: position(loc.codePostal, cle), url_osm: null, numeroBce: null, commune: loc.nom, province: loc.province, region: loc.region,
    });
  }
  pois.sort((a, b) => a.id.localeCompare(b.id));
  cache = pois;
  return pois;
}

/** Forme renvoyée par les outils : sans les champs internes de démonstration. */
export function commerceDe(p: PoiDemo): CommerceOsm {
  const { numeroBce: _n, commune: _c, province: _p, region: _r, ...commerce } = p;
  return commerce;
}

interface FiltreDemo {
  categories?: string[] | undefined;
  communes?: string[] | undefined;
  codes_postaux?: string[] | undefined;
  provinces?: string[] | undefined;
  regions?: string[] | undefined;
  nom?: string | undefined;
}

const vide = (v: readonly unknown[] | undefined): boolean => v === undefined || v.length === 0;

export function filtrerPois(f: FiltreDemo): PoiDemo[] {
  return poisOsmDemo().filter(
    (p) =>
      (vide(f.categories) || f.categories!.includes(p.categorie)) &&
      (vide(f.communes) || f.communes!.some((c) => normaliserOsm(c) === normaliserOsm(p.commune))) &&
      (vide(f.codes_postaux) || f.codes_postaux!.includes(p.adresse.code_postal ?? "")) &&
      (vide(f.provinces) || (p.province !== null && f.provinces!.some((x) => normaliserOsm(x) === normaliserOsm(p.province!)))) &&
      (vide(f.regions) || f.regions!.includes(p.region)) &&
      (f.nom === undefined || normaliserOsm(p.nom).includes(normaliserOsm(f.nom))),
  );
}

/** Contexte rappelé dans chaque réponse de démonstration (le nom du client vient de l'environnement local, pas du dépôt). */
const contexte = (): Record<string, string> => ({
  source: SOURCE_OSM_DEMO, date_extraction: DATE_EXTRACTION_OSM_DEMO, attribution: ATTRIBUTION_OSM, licence: LICENCE_OSM, client_demonstration: nomAssureurDemo(),
});

export const outilCommerces: OutilPasserelle = outilLecture(
  { nom: "osm_commerces", description: DESCRIPTION_COMMERCES, schemaEntree: schemaCommerces },
  (args) => {
    const trouves = filtrerPois(args);
    const page = args.page ?? 1;
    return {
      ...contexte(), total: trouves.length, page, taille_page: TAILLE_PAGE_OSM, pages: Math.max(1, Math.ceil(trouves.length / TAILLE_PAGE_OSM)),
      commerces: trouves.slice((page - 1) * TAILLE_PAGE_OSM, page * TAILLE_PAGE_OSM).map(commerceDe),
    };
  },
);

export const outilRepartition: OutilPasserelle = outilLecture(
  { nom: "osm_repartition", description: DESCRIPTION_REPARTITION, schemaEntree: schemaRepartition },
  (args) => {
    const comptes = new Map<string, { commune: string; categorie: string; nombre: number }>();
    for (const p of filtrerPois(args)) {
      const cle = `${p.commune}|${p.categorie}`;
      const c = comptes.get(cle) ?? { commune: p.commune, categorie: p.categorie, nombre: 0 };
      c.nombre++;
      comptes.set(cle, c);
    }
    const lignes = [...comptes.values()].sort((a, b) => b.nombre - a.nombre || a.commune.localeCompare(b.commune) || a.categorie.localeCompare(b.categorie)).slice(0, 100);
    return { ...contexte(), lignes: lignes.length, repartition: lignes };
  },
);

export function fournisseurOsm(): FournisseurService {
  return { service: "osm", mode: "demonstration", fiche: FICHE_OSM, outils: [outilCommerces, outilRepartition] };
}

/** Une ligne au démarrage : inscrit le service `osm` en démonstration. */
export function enregistrerOsmDemo(registre: RegistreFournisseurs): RegistreFournisseurs {
  registre.enregistrer(fournisseurOsm());
  return registre;
}

