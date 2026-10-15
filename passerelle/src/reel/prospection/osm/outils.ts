// Index OpenStreetMap local (lecture seule) et outils du service `osm` en mode réel (lot P3b) : MÊMES noms, MÊMES schémas et MÊMES
// formes de réponse que le simulateur (src/demo/prospection/osm.ts), avec l'attribution et la licence ODbL dans chaque réponse.
// Aucun appel à l'instance publique d'Overpass : tout vient de l'extrait Geofabrik chargé localement.

import { existsSync, statSync } from "node:fs";
import Database from "better-sqlite3";
import type { FournisseurService, OutilPasserelle } from "../../../fournisseurs.js";
import { outilLecture } from "../../../demo/prospection/commun.js";
import {
  ATTRIBUTION_OSM, DESCRIPTION_COMMERCES, DESCRIPTION_REPARTITION, FICHE_OSM, LICENCE_OSM, TAILLE_PAGE_OSM, normaliserOsm, schemaCommerces, schemaRepartition,
  typeEtUrlOsm, type CommerceOsm,
} from "../../../demo/prospection/osm-commun.js";

interface Filtre {
  categories?: string[] | undefined;
  communes?: string[] | undefined;
  codes_postaux?: string[] | undefined;
  provinces?: string[] | undefined;
  regions?: string[] | undefined;
  nom?: string | undefined;
}

const vide = (v: readonly unknown[] | undefined): v is undefined => v === undefined || v.length === 0;

function clause(f: Filtre): { sql: string; params: unknown[] } {
  const morceaux: string[] = [];
  const params: unknown[] = [];
  const dans = (colonne: string, valeurs: readonly string[] | undefined): void => {
    if (vide(valeurs)) return;
    morceaux.push(`${colonne} IN (${valeurs.map(() => "?").join(", ")})`);
    params.push(...valeurs);
  };
  dans("Categorie", f.categories);
  dans("CommuneNorm", f.communes?.map(normaliserOsm));
  dans("CodePostal", f.codes_postaux);
  dans("ProvinceNorm", f.provinces?.map(normaliserOsm));
  dans("Region", f.regions);
  if (f.nom !== undefined) {
    morceaux.push("NomNorm LIKE ? ESCAPE '\\'");
    params.push(`%${normaliserOsm(f.nom).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  return { sql: morceaux.length === 0 ? "1 = 1" : morceaux.join(" AND "), params };
}

interface LignePoi {
  Id: string; Nom: string; Categorie: string; Cle: string; Valeur: string; Rue: string | null; Numero: string | null; CodePostal: string | null;
  Commune: string | null; Telephone: string | null; Site: string | null; Horaires: string | null; Marque: string | null; Lat: number; Lon: number;
}

function commerceDe(l: LignePoi): CommerceOsm {
  const { type, url } = typeEtUrlOsm(l.Id);
  return {
    id: l.Id, type, nom: l.Nom, categorie: l.Categorie as CommerceOsm["categorie"], cle: l.Cle, valeur: l.Valeur,
    adresse: { rue: l.Rue, numero: l.Numero, code_postal: l.CodePostal, commune: l.Commune },
    telephone: l.Telephone, site: l.Site, horaires: l.Horaires, marque: l.Marque, position: { lat: l.Lat, lon: l.Lon }, url_osm: url,
  };
}

export class IndexOsm {
  private db: Database.Database | null = null;
  private inode = -1;

  constructor(readonly chemin: string) {}

  private ouvrir(): Database.Database {
    const ino = statSync(this.chemin).ino;
    if (this.db === null || ino !== this.inode) {
      this.db?.close();
      this.db = new Database(this.chemin, { readonly: true, fileMustExist: true });
      this.db.pragma("busy_timeout = 30000");
      this.inode = ino;
    }
    return this.db;
  }

  disponible(): boolean {
    if (!existsSync(this.chemin)) return false;
    try {
      return this.ouvrir().prepare("SELECT 1 FROM meta WHERE Variable = 'ExtractDate'").get() !== undefined;
    } catch {
      return false;
    }
  }

  fermer(): void {
    this.db?.close();
    this.db = null;
  }

  meta(): Record<string, string> {
    const m: Record<string, string> = {};
    for (const l of this.ouvrir().prepare("SELECT Variable, Value FROM meta").all() as { Variable: string; Value: string }[]) m[l.Variable] = l.Value;
    return m;
  }

  commerces(f: Filtre, page: number): { total: number; elements: CommerceOsm[] } {
    const db = this.ouvrir();
    const c = clause(f);
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM poi WHERE ${c.sql}`).get(...c.params) as { n: number }).n;
    const lignes = db
      .prepare(`SELECT Id, Nom, Categorie, Cle, Valeur, Rue, Numero, CodePostal, Commune, Telephone, Site, Horaires, Marque, Lat, Lon FROM poi WHERE ${c.sql} ORDER BY Id LIMIT ? OFFSET ?`)
      .all(...c.params, TAILLE_PAGE_OSM, (page - 1) * TAILLE_PAGE_OSM) as LignePoi[];
    return { total, elements: lignes.map(commerceDe) };
  }

  repartition(f: Filtre): { commune: string; categorie: string; nombre: number }[] {
    const c = clause(f);
    return this.ouvrir()
      .prepare(`SELECT COALESCE(Commune, '(commune inconnue)') AS commune, Categorie AS categorie, COUNT(*) AS nombre FROM poi WHERE ${c.sql} GROUP BY commune, categorie ORDER BY nombre DESC, commune, categorie LIMIT 100`)
      .all(...c.params) as { commune: string; categorie: string; nombre: number }[];
  }
}

export type AccesIndexOsm = () => IndexOsm;

function contexte(index: IndexOsm): Record<string, string> {
  const m = index.meta();
  return { source: `OpenStreetMap, extrait Geofabrik de la Belgique (extraction du ${m["ExtractDate"] ?? "?"})`, date_extraction: m["ExtractDate"] ?? "", attribution: ATTRIBUTION_OSM, licence: LICENCE_OSM };
}

function indexPret(acces: AccesIndexOsm): IndexOsm {
  const index = acces();
  if (!index.disponible()) throw new Error("Index OpenStreetMap indisponible : aucun extrait n'a été importé (voir docs/passerelle.md, « OpenStreetMap (P3b) »).");
  return index;
}

export function outilsOsm(acces: AccesIndexOsm): OutilPasserelle[] {
  const commerces = outilLecture({ nom: "osm_commerces", description: DESCRIPTION_COMMERCES, schemaEntree: schemaCommerces }, (args) => {
    const index = indexPret(acces);
    const page = args.page ?? 1;
    const { total, elements } = index.commerces(args, page);
    return { ...contexte(index), total, page, taille_page: TAILLE_PAGE_OSM, pages: Math.max(1, Math.ceil(total / TAILLE_PAGE_OSM)), commerces: elements };
  });
  const repartition = outilLecture({ nom: "osm_repartition", description: DESCRIPTION_REPARTITION, schemaEntree: schemaRepartition }, (args) => {
    const index = indexPret(acces);
    const lignes = index.repartition(args);
    return { ...contexte(index), lignes: lignes.length, repartition: lignes };
  });
  return [commerces, repartition];
}

export function fournisseurOsmReel(acces: AccesIndexOsm, verifier: (jeton: string) => ReturnType<NonNullable<FournisseurService["verifierJeton"]>>): FournisseurService {
  return { service: "osm", mode: "reel", fiche: FICHE_OSM, outils: outilsOsm(acces), verifierJeton: (jeton) => verifier(jeton) };
}
