#!/usr/bin/env python3
"""Affiche les traces (sortie standard) des runs des agents d'une entreprise.

Usage : python3 -I scripts/scenarios/traces_agents.py <préfixe du nom d'entreprise> [URL_API]
Lit les journaux natifs des runs (GET /heartbeat-runs/:id/log), du plus ancien
au plus récent. Lecture seule.
"""
import json
import sys
import urllib.request

PREFIXE = sys.argv[1]
API = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3100/api").rstrip("/")


def lire(chemin):
    with urllib.request.urlopen(API + chemin, timeout=30) as rep:
        return json.loads(rep.read())


entreprises = sorted([c for c in lire("/companies") if c["name"].startswith(PREFIXE)], key=lambda c: c["createdAt"])
if not entreprises:
    raise SystemExit("Aucune entreprise ne correspond.")
S = entreprises[-1]["id"]
noms = {a["id"]: a["name"] for a in lire(f"/companies/{S}/agents")}
runs = lire(f"/companies/{S}/heartbeat-runs")
for run in reversed(runs):
    print(f"== {run['createdAt'][11:19]} {noms.get(run['agentId'], run['agentId'])} run {run['id'][:8]} {run['status']}")
    try:
        contenu = lire(f"/heartbeat-runs/{run['id']}/log").get("content", "")
    except Exception as err:  # noqa: BLE001 - diagnostic seulement
        print("   (journal illisible)", err)
        continue
    for ligne in contenu.splitlines():
        if not ligne.strip():
            continue
        morceau = json.loads(ligne).get("chunk", "")
        for sous in morceau.splitlines():
            try:
                t = json.loads(sous)
                print("   ", {k: v for k, v in t.items() if k not in ("t", "agent", "run", "scenario", "role")})
            except ValueError:
                print("   ", sous[:300])
