#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Déclare au plugin quelles entreprises d'un client sont quels services, avec la matrice des flux autorisés.

À lancer avec « python3 -I ». Lit le registre local du client (instance/atelier-client/<slug>/entreprise.json,
écrit par « bootstrap-organisation.py nouveau-client ») et la matrice des flux du registre des services
(organisation/registre/services.json), complétée par le réseau des coordinateurs que génère scripts/atelier_services.py
(toute paire de services du client que la matrice métier ne couvre pas ; le coordinateur général de la Direction
compris), puis appelle la route « services.declarer » (humain seulement) avec les seuls flux dont les deux services
appartiennent au client : jamais un flux vers un autre client. Idempotent : la déclaration remplace la précédente.
Aucun appel de modèle. « nouveau-client » crée déjà ces configurations (même fonction) dès que le client a plusieurs
services ; la déclaration des services reste à lancer ici.

Avant la déclaration, chaque entreprise du client reçoit une configuration du plugin si elle n'en a pas (configuration
vide ; une configuration existante n'est jamais modifiée). Raison (essai réel L9, 16/10/2026) : le facteur du bureau
de liaison agit hors invocation, et l'hôte n'y admet que les entreprises configurées pour le plugin
(« proactiveCompanyScopes ») ; sans configuration, la demande reste en file et n'arrive jamais au service cible.

Usage : python3 -I scripts/declarer-services.py <slug-client> [--api URL]
Variables : ATELIER_API (défaut http://127.0.0.1:3100/api), ATELIER_DONNEES_LOCALES (défaut instance/).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PLUGIN_CLE = "atelier.marketing-ia"


def _atelier_services():
    """scripts/atelier_services.py chargé par fichier (le script tourne en « python3 -I » : pas de sys.path local)."""
    spec = importlib.util.spec_from_file_location("atelier_services", RACINE / "scripts" / "atelier_services.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def construire_corps(registre: dict, local: dict) -> dict:
    """Corps de services.declarer : entreprises du client (avec leur slug de service) et flux entre elles."""
    entreprises = [
        {"companyId": e["entrepriseId"], "serviceSlug": slug, "estDirection": slug == "direction"}
        for slug, e in local["entreprises"].items()
    ]
    presents = {e["serviceSlug"] for e in entreprises}
    flux = [
        {"source": f["source"], "cible": f["cible"], "objet": f["objet"], "approbationHumaine": bool(f["approbationHumaine"])}
        for f in _atelier_services().flux_complets(registre)
        if f["source"] in presents and f["cible"] in presents
    ]
    # La route part de la Direction quand le client en a une : le plugin n'accepte comme Direction que l'entreprise
    # de la route ou une entreprise déjà déclarée pour ce client (revue du 18/10/2026, M1).
    route = next((e for e in entreprises if e["estDirection"]), entreprises[0])
    return {
        "companyId": route["companyId"],
        "clientMarqueur": local["slug"],
        "entreprises": entreprises,
        "flux": flux,
    }


def assurer_configurations(appel, entreprises: list[str]) -> list[str]:
    """Crée une configuration vide du plugin pour chaque entreprise qui n'en a pas ; rend les entreprises traitées.

    `appel(methode, chemin, corps=None)` rend le JSON de la réponse. Une configuration existante n'est jamais réécrite :
    elle peut porter des références de secrets (clé d'approbation, clés de chiffrement)."""
    creees = []
    for cid in entreprises:
        if appel("GET", f"/plugins/{PLUGIN_CLE}/config?companyId={cid}") is None:
            appel("POST", f"/plugins/{PLUGIN_CLE}/config", {"companyId": cid, "configJson": {}})
            creees.append(cid)
    return creees


def appel_simple(api: str):
    """Appel JSON minimal vers l'API de l'instance (même accès que la déclaration)."""
    def appel(methode: str, chemin: str, corps=None):
        donnees = None if corps is None else json.dumps(corps).encode("utf-8")
        req = urllib.request.Request(f"{api}{chemin}", data=donnees, method=methode, headers={"Content-Type": "application/json", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            brut = r.read().decode("utf-8")
        return json.loads(brut) if brut else None
    return appel


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Déclare les services d'un client au plugin")
    p.add_argument("slug")
    p.add_argument("--api", default=os.environ.get("ATELIER_API", "http://127.0.0.1:3100/api"))
    args = p.parse_args(argv)
    donnees = Path(os.environ.get("ATELIER_DONNEES_LOCALES", RACINE / "instance"))
    try:
        local = json.loads((donnees / "atelier-client" / args.slug / "entreprise.json").read_text(encoding="utf-8"))
        registre = json.loads((RACINE / "organisation" / "registre" / "services.json").read_text(encoding="utf-8"))
        corps = construire_corps(registre, local)
    except (OSError, ValueError, KeyError) as e:
        print(f"Lecture impossible : {e}", file=sys.stderr)
        return 1
    try:
        creees = assurer_configurations(appel_simple(args.api), [e["companyId"] for e in corps["entreprises"]])
    except urllib.error.HTTPError as e:
        print(f"Configuration du plugin refusée : HTTP {e.code} : {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"API injoignable : {e}", file=sys.stderr)
        return 1
    print(f"Configuration du plugin créée pour {len(creees)} entreprise(s), {len(corps['entreprises']) - len(creees)} déjà configurée(s).")
    try:
        for etape in etapes_declaration(corps, envoyer_declaration(args.api)):
            print(etape)
    except urllib.error.HTTPError as e:
        print(f"Refus HTTP {e.code} : {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"API injoignable : {e}", file=sys.stderr)
        return 1
    return 0


def envoyer_declaration(api: str):
    def envoyer(corps: dict) -> str:
        requete = urllib.request.Request(
            f"{api}/plugins/{PLUGIN_CLE}/api/services/declarer",
            data=json.dumps(corps).encode("utf-8"), method="POST", headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(requete, timeout=30) as r:
            return r.read().decode("utf-8")
    return envoyer


def etapes_declaration(corps: dict, envoyer) -> list[str]:
    """Envoie la déclaration depuis la Direction. Cas d'un client déjà déclaré SANS sa Direction (elle s'ajoute
    maintenant) : le plugin refuse (403) qu'une entreprise encore inconnue redéclare un client existant. On passe
    alors en deux temps : la Direction est d'abord ajoutée comme simple service depuis une entreprise déjà membre,
    puis elle se déclare Direction depuis sa propre route (l'hôte prouve l'accès de l'humain à chaque route)."""
    try:
        return [envoyer(corps)]
    except urllib.error.HTTPError as e:
        autres = [x for x in corps["entreprises"] if x["companyId"] != corps["companyId"]]
        if e.code != 403 or not autres or not any(x["estDirection"] and x["companyId"] == corps["companyId"] for x in corps["entreprises"]):
            raise
    sans_direction = {**corps, "companyId": autres[0]["companyId"],
                      "entreprises": [{**x, "estDirection": False} for x in corps["entreprises"]]}
    return [envoyer(sans_direction), envoyer(corps)]


if __name__ == "__main__":
    sys.exit(main())
