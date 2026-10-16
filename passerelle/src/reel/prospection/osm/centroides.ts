// Position approximative d'une adresse belge, déduite de l'index OpenStreetMap local (lecture seule) : centroïde (moyenne des
// positions des entités nommées) par code postal, et à défaut par commune normalisée (minuscules, sans accent).
// Ce n'est JAMAIS l'adresse exacte : sert seulement à estimer une distance (par exemple au bureau le plus proche).
// Calculé une fois, en mémoire, à la première demande (et recalculé si l'index est remplacé). Index absent ou illisible :
// `null` partout, sans erreur.

import { existsSync, statSync } from "node:fs";
import Database from "better-sqlite3";
import { normaliserOsm } from "../../../demo/prospection/osm-commun.js";

export interface PositionApprox {
  lat: number;
  lon: number;
  precision: "code_postal" | "commune";
  source: "osm";
}

const arrondi = (x: number): number => Math.round(x * 100000) / 100000;

export class CentroidesOsm {
  private parCodePostal = new Map<string, { lat: number; lon: number }>();
  private parCommune = new Map<string, { lat: number; lon: number }>();
  private inode = -1;

  constructor(readonly chemin: string) {}

  /** (Re)charge les centroïdes si l'index existe et a changé. Renvoie `false` si l'index est absent ou illisible. */
  private charger(): boolean {
    if (!existsSync(this.chemin)) return false;
    let ino: number;
    try {
      ino = statSync(this.chemin).ino;
    } catch {
      return false;
    }
    if (ino === this.inode) return true;
    let db: Database.Database | null = null;
    try {
      db = new Database(this.chemin, { readonly: true, fileMustExist: true });
      db.pragma("busy_timeout = 1000"); // court : better-sqlite3 est synchrone, une base verrouillée ne doit pas figer la passerelle
      const cp = new Map<string, { lat: number; lon: number }>();
      const communes = new Map<string, { lat: number; lon: number }>();
      for (const l of db.prepare("SELECT CodePostal AS cle, AVG(Lat) AS lat, AVG(Lon) AS lon FROM poi WHERE CodePostal IS NOT NULL AND CodePostal <> '' GROUP BY CodePostal HAVING AVG(Lat) IS NOT NULL AND AVG(Lon) IS NOT NULL").all() as { cle: string; lat: number; lon: number }[]) {
        cp.set(l.cle.trim(), { lat: l.lat, lon: l.lon });
      }
      for (const l of db.prepare("SELECT CommuneNorm AS cle, AVG(Lat) AS lat, AVG(Lon) AS lon FROM poi WHERE CommuneNorm IS NOT NULL AND CommuneNorm <> '' GROUP BY CommuneNorm HAVING AVG(Lat) IS NOT NULL AND AVG(Lon) IS NOT NULL").all() as { cle: string; lat: number; lon: number }[]) {
        communes.set(l.cle, { lat: l.lat, lon: l.lon });
      }
      this.parCodePostal = cp;
      this.parCommune = communes;
      this.inode = ino;
      return true;
    } catch {
      return false;
    } finally {
      db?.close();
    }
  }

  /** Position approximative du code postal, sinon de la commune ; `null` si aucune des deux n'est connue de l'index. */
  position(codePostal: string | null | undefined, commune: string | null | undefined): PositionApprox | null {
    if (!this.charger()) return null;
    const cp = codePostal?.trim() ?? "";
    const parCp = cp === "" ? undefined : this.parCodePostal.get(cp);
    if (parCp) return { lat: arrondi(parCp.lat), lon: arrondi(parCp.lon), precision: "code_postal", source: "osm" };
    const nom = commune === undefined || commune === null ? "" : normaliserOsm(commune);
    const parNom = nom === "" ? undefined : this.parCommune.get(nom);
    if (parNom) return { lat: arrondi(parNom.lat), lon: arrondi(parNom.lon), precision: "commune", source: "osm" };
    return null;
  }
}
