#!/usr/bin/env python3
"""Donne une position approximative aux prospects entreprise ou partenaire qui n'en ont pas, pour la carte.

Usage : PGPASSWORD=... python3 -I scripts/positions-prospects.py <port-pg> [--appliquer]

Sans --appliquer : affiche ce qui serait fait et n'écrit rien (la connexion n'ouvre aucune écriture).
Avec --appliquer : met à jour, en UNE transaction, les seuls prospects entreprise ou partenaire sans position.

Règle de position : la même que passerelle/src/reel/prospection/osm/centroides.ts, à partir de l'index OpenStreetMap
local (instance/donnees/osm/osm.sqlite, ouvert en lecture seule) : moyenne des coordonnées par code postal, sinon par
commune normalisée (minuscules, sans accent) ; groupes sans coordonnées ignorés ; arrondi à 4 décimales.
Les particuliers (B2C) ne reçoivent jamais de position (protection des données) ; une position existante n'est jamais touchée.
Aucun identifiant n'est écrit ici : le mot de passe vient de l'environnement (PGPASSWORD) de la ligne de commande locale.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import subprocess
import sys
import unicodedata
import uuid
from collections import Counter
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
INDEX_OSM = RACINE / "instance" / "donnees" / "osm" / "osm.sqlite"
CIBLES_AVEC_POSITION = ("entreprise", "partenaire")  # jamais « particulier »
IDENTIFIANT_SQL = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")


def normaliser_osm(texte: str) -> str:
    """Même normalisation que normaliserOsm (passerelle) : sans accent, minuscules, non alphanumérique en espace."""
    sans_accent = "".join(c for c in unicodedata.normalize("NFD", texte) if not 0x300 <= ord(c) <= 0x36F)
    return re.sub(r"[^a-z0-9]+", " ", sans_accent.lower()).strip()


def charger_centroides(chemin: Path) -> tuple[dict[str, tuple[float, float]], dict[str, tuple[float, float]]]:
    if not chemin.exists():
        sys.exit(f"Index OpenStreetMap introuvable : {chemin}")
    base = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
    try:
        def groupes(colonne: str) -> dict[str, tuple[float, float]]:
            requete = (
                f"SELECT {colonne}, AVG(Lat), AVG(Lon) FROM poi WHERE {colonne} IS NOT NULL AND {colonne} <> '' "
                f"GROUP BY {colonne} HAVING AVG(Lat) IS NOT NULL AND AVG(Lon) IS NOT NULL"
            )
            return {(cle.strip() if colonne == "CodePostal" else cle): (lat, lon) for cle, lat, lon in base.execute(requete)}

        return groupes("CodePostal"), groupes("CommuneNorm")
    finally:
        base.close()


def position_approx(cp, communes, code_postal, commune):
    """Renvoie (lat, lon, précision) ou None ; code postal d'abord, commune ensuite."""
    code = (code_postal or "").strip() if isinstance(code_postal, str) else ""
    if code and code in cp:
        lat, lon = cp[code]
        return round(lat, 4), round(lon, 4), "code_postal"
    nom = normaliser_osm(commune) if isinstance(commune, str) else ""
    if nom and nom in communes:
        lat, lon = communes[nom]
        return round(lat, 4), round(lon, 4), "commune"
    return None


def psql(args, entree: str) -> str:
    cmd = ["psql", "-h", args.hote, "-p", str(args.port), "-U", args.utilisateur, "-d", args.base,
           "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
    r = subprocess.run(cmd, input=entree, capture_output=True, text=True, check=False)
    if r.returncode != 0:
        sys.exit(f"psql a échoué (code {r.returncode}) : {r.stderr.strip()}")
    return r.stdout


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("port", type=int, help="port PostgreSQL (54329 : instance 3100, 54780 : instance 3580)")
    ap.add_argument("--appliquer", action="store_true", help="écrit les positions (sinon : à blanc, aucune écriture)")
    ap.add_argument("--hote", default="127.0.0.1")
    ap.add_argument("--utilisateur", default="paperclip")
    ap.add_argument("--base", default="paperclip")
    ap.add_argument("--schema", default="plugin_atelier_f0322cc62c")
    ap.add_argument("--index-osm", type=Path, default=INDEX_OSM)
    args = ap.parse_args()
    if not IDENTIFIANT_SQL.match(args.schema):
        sys.exit("Nom de schéma invalide.")
    table = f'"{args.schema}".prospects'
    cibles_sql = ", ".join(f"'{c}'" for c in CIBLES_AVEC_POSITION)
    sans_position = "coalesce(zone->'position', 'null'::jsonb) = 'null'::jsonb"

    cp, communes = charger_centroides(args.index_osm)

    # Lecture : identifiant et zone seulement (aucun nom de personne, aucune donnée chiffrée).
    sortie = psql(args, f"SELECT coalesce(json_agg(json_build_object('id', id, 'cp', zone->>'codePostal', 'commune', zone->>'commune')), '[]'::json) "
                        f"FROM {table} WHERE cible IN ({cibles_sql}) AND {sans_position};")
    candidats = json.loads(sortie.strip() or "[]")

    a_ecrire: list[tuple[str, float, float, str]] = []
    non_resolus = 0
    for c in candidats:
        p = position_approx(cp, communes, c["cp"], c["commune"])
        if p is None:
            non_resolus += 1
        else:
            a_ecrire.append((str(uuid.UUID(c["id"])), p[0], p[1], p[2]))

    par_precision = Counter(p for *_, p in a_ecrire)
    print(f"Port {args.port} : {len(candidats)} prospect(s) entreprise ou partenaire sans position.")
    print(f"  position trouvée : {len(a_ecrire)} (code_postal : {par_precision['code_postal']}, commune : {par_precision['commune']})")
    print(f"  sans position possible (code postal et commune inconnus de l'index) : {non_resolus}")
    for ident, lat, lon, prec in a_ecrire[:3]:
        print(f"  exemple : prospect {ident[:8]}… -> lat {lat}, lon {lon}, précision {prec}")

    if not args.appliquer:
        print("À blanc : rien n'a été écrit. Ajouter --appliquer pour écrire.")
        return 0
    if not a_ecrire:
        print("Rien à écrire.")
        return 0

    # Valeurs construites ici seulement à partir d'un UUID validé, de flottants et d'une précision fixe : pas d'injection possible.
    valeurs = ",\n".join(f"('{i}'::uuid, {lat:.4f}::numeric, {lon:.4f}::numeric, '{prec}')" for i, lat, lon, prec in a_ecrire)
    sql = (
        "BEGIN;\n"
        "WITH m AS (\n"
        f"  UPDATE {table} p\n"
        "  SET zone = jsonb_set(p.zone, '{position}', jsonb_build_object('lat', v.lat, 'lon', v.lon, 'precision', v.prec))\n"
        f"  FROM (VALUES\n{valeurs}\n) AS v(id, lat, lon, prec)\n"
        f"  WHERE p.id = v.id AND p.cible IN ({cibles_sql}) AND coalesce(p.zone->'position', 'null'::jsonb) = 'null'::jsonb\n"
        "  RETURNING 1)\n"
        "SELECT count(*) FROM m;\n"
        "COMMIT;\n"
    )
    modifiees = psql(args, sql).strip().splitlines()[0]
    print(f"Appliqué en une transaction : {modifiees} ligne(s) modifiée(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
