// Importation de l'extrait OpenStreetMap de la Belgique (Geofabrik) dans un index SQLite local (lot P3b).
//
// Chaîne de préparation (outils standard, hors de ce code) :
//   1. télécharger https://download.geofabrik.de/europe/belgium-latest.osm.pbf (environ 664 Mo le 15/10/2026, mis à jour
//      chaque jour par Geofabrik) : NON FAIT par l'atelier, voir docs/passerelle.md ;
//   2. osmium tags-filter belgium-latest.osm.pbf nwr/shop nwr/craft nwr/office nwr/amenity nwr/tourism nwr/healthcare -o commerces.osm.pbf
//   3. osmium export commerces.osm.pbf -f geojsonseq --add-unique-id=type_id -o commerces.geojsonseq
//   4. importer le fichier .geojsonseq avec la commande `osm-importer` de ce dossier.
// Format de sortie d'osmium vérifié le 15/10/2026 avec osmium-tool 1.19.0 : une entité GeoJSON par ligne, précédée du caractère
// RS (0x1E) ; `id` = « n123 » (nœud), « w123 » (chemin), « r123 » (relation), « a123 » (surface) ; `properties` = étiquettes.
//
// Minimisation des données : on ne garde que le nom, la catégorie, l'adresse, le téléphone (`phone`, `contact:phone`), le site,
// les horaires, la marque et la position. Les adresses de courriel et les clés `mobile` ne sont jamais lues. ATTENTION : OSM
// n'est pas un registre d'entreprises : le nom d'un indépendant (médecin, artisan) peut être un nom de personne et `phone` peut
// contenir un numéro personnel ; la finalité et la base légale restent à instruire (docs/passerelle.md, « OpenStreetMap (P3b) »).

import { createReadStream, existsSync, renameSync, rmSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { ATTRIBUTION_OSM, LICENCE_OSM, normaliserOsm } from "../../../demo/prospection/osm-commun.js";
import { synchroniserFichier, zoneDuCodePostal } from "../commun.js";
import { classer } from "./categories.js";

export const VERSION_SCHEMA_OSM = 1;

export interface CompteursOsm {
  lues: number;
  retenues: number;
  sans_nom: number;
  hors_categorie: number;
  sans_position: number;
  invalides: number;
}

export interface RapportImportOsm {
  fichier: string;
  date_extraction: string;
  compteurs: CompteursOsm;
}

export interface OptionsImportOsm {
  /** Date de l'extraction (AAAA-MM-JJ) : date « contient les données jusqu'à » de Geofabrik ; à défaut, date de modification du fichier. */
  date?: string;
  journal?: (message: string) => void;
}

type Coordonnees = unknown;

const nombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const couple = (v: unknown): v is [number, number] => Array.isArray(v) && v.length >= 2 && nombre(v[0]) && nombre(v[1]);

function moyenne(points: [number, number][]): [number, number] | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of points) {
    x += lon;
    y += lat;
  }
  return [x / points.length, y / points.length];
}

/** Position représentative d'une géométrie GeoJSON : le point, ou la moyenne des sommets (chemin, surface). `null` si inutilisable. */
export function positionDe(geometrie: { type?: unknown; coordinates?: Coordonnees } | null | undefined): { lat: number; lon: number } | null {
  if (!geometrie || typeof geometrie !== "object") return null;
  const c = geometrie.coordinates;
  let centre: [number, number] | null = null;
  switch (geometrie.type) {
    case "Point":
      centre = couple(c) ? [c[0], c[1]] : null;
      break;
    case "LineString":
      centre = Array.isArray(c) ? moyenne((c as unknown[]).filter(couple)) : null;
      break;
    case "Polygon":
      centre = Array.isArray(c) && Array.isArray(c[0]) ? moyenne((c[0] as unknown[]).filter(couple)) : null;
      break;
    case "MultiPolygon":
      centre = Array.isArray(c) && Array.isArray(c[0]) && Array.isArray((c[0] as unknown[])[0]) ? moyenne((((c[0] as unknown[])[0]) as unknown[]).filter(couple)) : null;
      break;
    case "MultiLineString":
      centre = Array.isArray(c) && Array.isArray(c[0]) ? moyenne((c[0] as unknown[]).filter(couple)) : null;
      break;
    default:
      return null;
  }
  if (!centre) return null;
  const [lon, lat] = centre;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const arrondi = (v: number): number => Math.round(v * 1e5) / 1e5;
  return { lat: arrondi(lat), lon: arrondi(lon) };
}

/**
 * osmium exporte un chemin fermé deux fois : « w20 » (ligne) et « a40 » (surface, identifiant = 2 × celui du chemin, ou 2 × celui de
 * la relation + 1). On ramène la surface à son objet d'origine pour ne garder qu'un seul établissement (le dernier lu l'emporte).
 */
export function identifiantOsm(id: string): string {
  const m = /^a(\d+)$/.exec(id);
  if (!m) return id;
  const n = Number(m[1]);
  return n % 2 === 0 ? `w${n / 2}` : `r${(n - 1) / 2}`;
}

export function creerTablesOsm(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (Variable TEXT PRIMARY KEY, Value TEXT) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS poi (
      Id TEXT PRIMARY KEY, Nom TEXT NOT NULL, NomNorm TEXT NOT NULL, Categorie TEXT NOT NULL, Cle TEXT NOT NULL, Valeur TEXT NOT NULL,
      Rue TEXT, Numero TEXT, CodePostal TEXT, Commune TEXT, CommuneNorm TEXT, ProvinceNorm TEXT, Region TEXT,
      Telephone TEXT, Site TEXT, Horaires TEXT, Marque TEXT, Lat REAL NOT NULL, Lon REAL NOT NULL
    ) WITHOUT ROWID;
  `);
}

export function creerIndexOsm(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_poi_categorie ON poi (Categorie);
    CREATE INDEX IF NOT EXISTS ix_poi_commune ON poi (CommuneNorm);
    CREATE INDEX IF NOT EXISTS ix_poi_cp ON poi (CodePostal);
    CREATE INDEX IF NOT EXISTS ix_poi_region ON poi (Region);
  `);
}

const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 300) : null);

/** Importe un fichier .geojsonseq d'osmium dans l'index `cheminIndex` (remplacé de façon atomique). */
export async function importerOsm(cheminGeojson: string, cheminIndex: string, options: OptionsImportOsm = {}): Promise<RapportImportOsm> {
  const journal = options.journal ?? ((): void => undefined);
  if (!existsSync(cheminGeojson)) throw new Error(`Fichier introuvable : ${cheminGeojson}`);
  const date = options.date ?? new Date(statSync(cheminGeojson).mtimeMs).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) throw new Error(`Date d'extraction invalide (« ${date} ») : AAAA-MM-JJ attendu.`);
  const temporaire = `${cheminIndex}.nouveau-${process.pid}`;
  for (const s of ["", "-journal"]) rmSync(`${temporaire}${s}`, { force: true });
  const db = new Database(temporaire);
  const compteurs: CompteursOsm = { lues: 0, retenues: 0, sans_nom: 0, hors_categorie: 0, sans_position: 0, invalides: 0 };
  try {
    db.pragma("journal_mode = OFF");
    db.pragma("synchronous = OFF");
    creerTablesOsm(db);
    const inserer = db.prepare(
      `INSERT OR REPLACE INTO poi (Id, Nom, NomNorm, Categorie, Cle, Valeur, Rue, Numero, CodePostal, Commune, CommuneNorm, ProvinceNorm, Region, Telephone, Site, Horaires, Marque, Lat, Lon)
       VALUES (@Id, @Nom, @NomNorm, @Categorie, @Cle, @Valeur, @Rue, @Numero, @CodePostal, @Commune, @CommuneNorm, @ProvinceNorm, @Region, @Telephone, @Site, @Horaires, @Marque, @Lat, @Lon)`,
    );
    const lecteur = createInterface({ input: createReadStream(cheminGeojson, { encoding: "utf8" }), crlfDelay: Infinity });
    db.exec("BEGIN");
    try {
      for await (const brute of lecteur) {
        const ligne = brute.replace(/\u001e/g, "").trim();
        if (ligne === "") continue;
        compteurs.lues++;
        let objet: { type?: string; id?: unknown; geometry?: { type?: unknown; coordinates?: unknown }; properties?: Record<string, unknown> };
        try {
          objet = JSON.parse(ligne) as typeof objet;
        } catch {
          compteurs.invalides++;
          continue;
        }
        const props = objet.properties ?? {};
        const tags: Record<string, string> = {};
        for (const [cle, valeur] of Object.entries(props)) if (typeof valeur === "string") tags[cle] = valeur;
        const idBrut = typeof objet.id === "string" ? objet.id : typeof props["@id"] === "string" ? (props["@id"] as string) : null;
        const id = idBrut === null ? null : identifiantOsm(idBrut);
        if (!id) {
          compteurs.invalides++;
          continue;
        }
        const classement = classer(tags);
        if (!classement) {
          compteurs.hors_categorie++;
          continue;
        }
        const nom = texte(tags["name"]);
        if (!nom) {
          compteurs.sans_nom++;
          continue;
        }
        const pos = positionDe(objet.geometry);
        if (!pos) {
          compteurs.sans_position++;
          continue;
        }
        const codePostal = texte(tags["addr:postcode"]);
        const zone = codePostal !== null ? zoneDuCodePostal(codePostal) : null;
        const commune = texte(tags["addr:city"]);
        inserer.run({
          Id: id, Nom: nom, NomNorm: normaliserOsm(nom), Categorie: classement.categorie, Cle: classement.cle, Valeur: classement.valeur.slice(0, 80),
          Rue: texte(tags["addr:street"]), Numero: texte(tags["addr:housenumber"]), CodePostal: codePostal, Commune: commune,
          CommuneNorm: commune ? normaliserOsm(commune) : null, ProvinceNorm: zone?.province ? normaliserOsm(zone.province) : null, Region: zone?.region ?? null,
          Telephone: texte(tags["phone"]) ?? texte(tags["contact:phone"]), Site: texte(tags["website"]) ?? texte(tags["contact:website"]) ?? texte(tags["url"]),
          Horaires: texte(tags["opening_hours"]), Marque: texte(tags["brand"]), Lat: pos.lat, Lon: pos.lon,
        });
        compteurs.retenues++;
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    creerIndexOsm(db);
    const ecrire = db.prepare("INSERT OR REPLACE INTO meta (Variable, Value) VALUES (?, ?)");
    ecrire.run("ExtractDate", date);
    ecrire.run("Fichier", basename(cheminGeojson));
    ecrire.run("Source", "OpenStreetMap, extrait Geofabrik de la Belgique");
    ecrire.run("Attribution", ATTRIBUTION_OSM);
    ecrire.run("Licence", LICENCE_OSM);
    ecrire.run("DateImport", new Date().toISOString());
    ecrire.run("SchemaVersion", String(VERSION_SCHEMA_OSM));
    db.close();
    synchroniserFichier(temporaire);
    rmSync(`${cheminIndex}-journal`, { force: true });
    renameSync(temporaire, cheminIndex);
  } finally {
    if (db.open) db.close();
    for (const s of ["", "-journal"]) rmSync(`${temporaire}${s}`, { force: true });
  }
  journal(`${basename(cheminGeojson)} : ${compteurs.lues} entités lues, ${compteurs.retenues} retenues, ${compteurs.hors_categorie} hors catégorie, ${compteurs.sans_nom} sans nom, ${compteurs.sans_position} sans position.`);
  return { fichier: basename(cheminGeojson), date_extraction: date, compteurs };
}
