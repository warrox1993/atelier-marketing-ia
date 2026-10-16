#!/usr/bin/env python3
"""
Génère `src/serveur/codes-postaux-be.ts` : position approximative de chaque code postal belge
présent dans l'index OpenStreetMap local de la passerelle (extrait Geofabrik de la Belgique).

Méthode (aucune coordonnée inventée) : pour chaque code postal à 4 chiffres, médiane des positions
des établissements OpenStreetMap qui portent ce code (`addr:postcode`), puis seconde médiane après
avoir écarté les points à plus de 15 km de la première (adresses mal saisies, points frontaliers).
Les noms de commune sont les plus fréquents parmi `addr:city` de ces mêmes points.

Un code postal sans aucun établissement dans OpenStreetMap n'apparaît pas : c'est une limite
connue de la source, rappelée dans le module généré.

    python3 -I plugin-atelier/scripts/generer-codes-postaux.py instance/donnees/osm/osm.sqlite

Données © les contributeurs d'OpenStreetMap, licence ODbL 1.0.
"""
import math
import sqlite3
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

SORTIE = Path(__file__).resolve().parent.parent / "src" / "serveur" / "codes-postaux-be.ts"
ECART_MAX_KM = 15.0


def distance_km(a, b):
    r = math.radians
    d_lat, d_lon = r(b[0] - a[0]), r(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(d_lon / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


def normaliser(nom):
    s = unicodedata.normalize("NFD", nom)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return " ".join(s.replace("-", " ").replace("'", " ").split())


def mediane(points):
    return (statistics.median(p[0] for p in points), statistics.median(p[1] for p in points))


def main():
    if len(sys.argv) != 2:
        sys.exit("usage : generer-codes-postaux.py <chemin de osm.sqlite>")
    db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
    meta = dict(db.execute("SELECT Variable, Value FROM meta").fetchall())
    points = defaultdict(list)
    noms = defaultdict(Counter)
    for cp, lat, lon, commune in db.execute(
        "SELECT CodePostal, Lat, Lon, Commune FROM poi WHERE CodePostal GLOB '[1-9][0-9][0-9][0-9]' AND Lat IS NOT NULL AND Lon IS NOT NULL"
    ):
        points[cp].append((lat, lon))
        if commune and commune.strip():
            noms[cp][commune.strip()] += 1

    lignes = []
    for cp in sorted(points):
        pts = points[cp]
        m = mediane(pts)
        gardes = [p for p in pts if distance_km(m, p) <= ECART_MAX_KM] or pts
        lat, lon = mediane(gardes)
        # Noms regroupés par forme normalisée ; orthographe la plus fréquente de chaque groupe.
        groupes = defaultdict(Counter)
        for nom, n in noms[cp].items():
            groupes[normaliser(nom)][nom] += n
        classes = sorted(groupes.values(), key=lambda g: (-sum(g.values()), g.most_common(1)[0][0]))
        communes = [g.most_common(1)[0][0] for i, g in enumerate(classes) if i == 0 or sum(g.values()) >= 2][:4]
        lignes.append((cp, round(lat, 4), round(lon, 4), len(gardes), communes))

    def ts(s):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'

    corps = ",\n".join(f'  [{ts(cp)}, {lat}, {lon}, {n}, [{", ".join(ts(c) for c in communes)}]]' for cp, lat, lon, n, communes in lignes)
    SORTIE.write_text(
        f"""/**
 * FICHIER GÉNÉRÉ par `scripts/generer-codes-postaux.py` : ne pas modifier à la main.
 *
 * Position approximative de chaque code postal belge présent dans l'index OpenStreetMap local
 * ({meta.get("Source", "OpenStreetMap")}, extraction du {meta.get("ExtractDate", "?")}) : médiane des
 * positions des établissements qui portent ce code, après avoir écarté les points à plus de
 * {ECART_MAX_KM:g} km de la première médiane. Ce n'est ni un contour ni un centre officiel : la
 * précision suffit pour dire si un code postal est à moins de quelques kilomètres d'un bureau.
 * Limite : un code postal sans aucun établissement dans OpenStreetMap n'est pas listé.
 *
 * {meta.get("Attribution", "© les contributeurs d'OpenStreetMap")}, {meta.get("Licence", "ODbL 1.0")}.
 */

export const SOURCE_CODES_POSTAUX = {{
  source: {ts(meta.get("Source", "OpenStreetMap"))},
  extraction: {ts(meta.get("ExtractDate", ""))},
  attribution: {ts(meta.get("Attribution", ""))},
  licence: {ts(meta.get("Licence", ""))},
  methode: "Médiane des positions des établissements OpenStreetMap portant le code postal (points à plus de {ECART_MAX_KM:g} km écartés).",
}} as const;

/** [code postal, latitude, longitude, nombre de points retenus, communes (la plus fréquente d'abord)]. */
export type LigneCodePostal = readonly [string, number, number, number, readonly string[]];

export const CODES_POSTAUX_BE: readonly LigneCodePostal[] = [
{corps},
];
""",
        encoding="utf-8",
    )
    print(f"{len(lignes)} codes postaux écrits dans {SORTIE}")


if __name__ == "__main__":
    main()
