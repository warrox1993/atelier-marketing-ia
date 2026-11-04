#!/usr/bin/env python3
"""Suivi des jetons consommés par les agents, tiré des journaux de Claude Code (P3-6, audit du 29/10/2026).

L'API du socle ne garde les runs qu'à partir du 19/10/2026 et compte 0 centime sous l'abonnement ; les journaux
`instance/claude-config/**/*.jsonl` gardent tout l'historique, y compris l'ancienne configuration. Chaque réponse
du modèle y peut apparaître plusieurs fois (reprise de session, sous-agent) : on la compte une seule fois, par
`message.id`. Lecture seule ; seuls les fichiers `*.jsonl` sont lus, jamais les identifiants rangés à côté.

Arborescence : `<entreprise>/<agent>/…` (identifiants du socle) ou `<slug>/…` (ancienne configuration, entreprise
« ancienne-configuration »).

Usage : python3 -I scripts/couts-jsonl.py [--racine DOSSIER] [--depuis AAAA-MM-JJ] [--sortie fichier.csv]
Colonnes : entreprise, agent, jour (UTC), modele, messages, entree, cache_ecriture, cache_lecture, sortie.
"""
import argparse
import collections
import csv
import json
import pathlib
import re
import sys

RACINE_DEFAUT = pathlib.Path(__file__).resolve().parent.parent / "instance" / "claude-config"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CHAMPS = ("entree", "cache_ecriture", "cache_lecture", "sortie")
USAGE = {"entree": "input_tokens", "cache_ecriture": "cache_creation_input_tokens",
         "cache_lecture": "cache_read_input_tokens", "sortie": "output_tokens"}


def cle_fichier(racine: pathlib.Path, fichier: pathlib.Path) -> tuple[str, str] | None:
    parties = fichier.relative_to(racine).parts
    if len(parties) < 2:
        return None
    if UUID.match(parties[0]):
        return (parties[0], parties[1]) if len(parties) >= 3 else None
    return ("ancienne-configuration", parties[0])


def agreger(racine: pathlib.Path, depuis: str = "") -> dict[tuple[str, str, str, str], collections.Counter]:
    vus: set[str] = set()
    totaux: dict[tuple[str, str, str, str], collections.Counter] = collections.defaultdict(collections.Counter)
    for fichier in sorted(racine.rglob("*.jsonl")):
        cle = cle_fichier(racine, fichier)
        if cle is None:
            continue
        with fichier.open(encoding="utf-8", errors="replace") as flux:
            for ligne in flux:
                if '"usage"' not in ligne:
                    continue
                try:
                    evenement = json.loads(ligne)
                except json.JSONDecodeError:
                    continue
                message = evenement.get("message") if isinstance(evenement, dict) else None
                if not isinstance(message, dict) or not isinstance(message.get("usage"), dict):
                    continue
                ident = message.get("id")
                jour = str(evenement.get("timestamp") or "")[:10]
                if not ident or ident in vus or jour < depuis:
                    continue
                vus.add(ident)
                compteur = totaux[(*cle, jour, str(message.get("model") or "inconnu"))]
                compteur["messages"] += 1
                for champ, source in USAGE.items():
                    valeur = message["usage"].get(source)
                    compteur[champ] += valeur if isinstance(valeur, int) else 0
    return totaux


def ecrire(totaux: dict, sortie) -> None:
    ecrivain = csv.writer(sortie)
    ecrivain.writerow(["entreprise", "agent", "jour", "modele", "messages", *CHAMPS])
    for (entreprise, agent, jour, modele), c in sorted(totaux.items()):
        ecrivain.writerow([entreprise, agent, jour, modele, c["messages"], *(c[ch] for ch in CHAMPS)])


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--racine", type=pathlib.Path, default=RACINE_DEFAUT)
    p.add_argument("--depuis", default="", help="jour UTC AAAA-MM-JJ (inclus)")
    p.add_argument("--sortie", type=pathlib.Path)
    a = p.parse_args(argv)
    if a.depuis and not re.match(r"^\d{4}-\d{2}-\d{2}$", a.depuis):
        print("--depuis attend AAAA-MM-JJ.", file=sys.stderr)
        return 2
    if not a.racine.is_dir():
        print(f"Dossier introuvable : {a.racine}", file=sys.stderr)
        return 2
    totaux = agreger(a.racine, a.depuis)
    if a.sortie:
        with a.sortie.open("w", encoding="utf-8", newline="") as f:
            ecrire(totaux, f)
    else:
        ecrire(totaux, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
