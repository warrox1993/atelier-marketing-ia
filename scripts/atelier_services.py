#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Registre des services de l'Atelier : chargement et validation.

Chaque service est une entreprise Paperclip distincte ; la matrice « flux » liste les seuls
échanges autorisés entre services (pas de flux déclaré, pas d'échange).

Usage : python3 -I scripts/atelier_services.py verifier [--fichier CHEMIN]
Code de sortie : 0 si le registre est valide, 1 sinon. Bibliothèque standard seule, aucune écriture.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIER_PAR_DEFAUT = RACINE / "organisation" / "registre" / "services.json"

# Préfixes déjà portés par des entreprises existantes (aperçu local : « COUA »).
PREFIXES_RESERVES = {"COUA"}

RE_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
RE_PREFIXE = re.compile(r"^[A-Z]{3,4}$")

CHAMPS_TEXTE = ("slug", "nom", "prefixe", "description", "coordinateur")
CHAMPS_LISTES = ("agents", "humainSeul", "obligations", "donnees")
CHAMPS_FLUX = ("source", "cible", "objet")


def charger_services(chemin=FICHIER_PAR_DEFAUT) -> dict:
    """Lit le registre. Un service qui porte « agentsRef » (chemin relatif au fichier) reçoit
    les slugs du registre d'agents référencé dans « agents », sans duplication dans le fichier."""
    chemin = Path(chemin)
    with chemin.open(encoding="utf-8") as f:
        registre = json.load(f)
    services = registre.get("services") if isinstance(registre, dict) else None
    for service in services if isinstance(services, list) else []:
        ref = service.get("agentsRef") if isinstance(service, dict) else None
        if not ref:
            continue
        try:
            with (chemin.parent / ref).open(encoding="utf-8") as f:
                service["agents"] = [a["slug"] for a in json.load(f)["agents"]]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            service["agents"] = []
            service["agentsRefErreur"] = f"{type(exc).__name__} : {exc}"
    return registre


def _texte_ok(valeur) -> bool:
    return isinstance(valeur, str) and valeur.strip() != ""


def valider(registre) -> list[str]:
    """Renvoie la liste des erreurs (vide si le registre est valide)."""
    erreurs: list[str] = []
    if not isinstance(registre, dict):
        return ["le registre doit être un objet JSON"]
    services = registre.get("services")
    flux = registre.get("flux")
    if not isinstance(services, list) or not services:
        erreurs.append("« services » doit être une liste non vide")
        services = []
    if not isinstance(flux, list):
        erreurs.append("« flux » doit être une liste")
        flux = []

    slugs: dict[str, dict] = {}
    prefixes: dict[str, str] = {}
    for i, s in enumerate(services):
        if not isinstance(s, dict):
            erreurs.append(f"service #{i} : doit être un objet")
            continue
        nom = s.get("slug") if _texte_ok(s.get("slug")) else f"#{i}"
        pre = f"service {nom} : "
        for champ in CHAMPS_TEXTE:
            if not _texte_ok(s.get(champ)):
                erreurs.append(f"{pre}champ obligatoire manquant ou vide : {champ}")
        if not isinstance(s.get("actif"), bool):
            erreurs.append(f"{pre}champ obligatoire manquant ou non booléen : actif")
        for champ in CHAMPS_LISTES:
            valeur = s.get(champ)
            if not isinstance(valeur, list):
                erreurs.append(f"{pre}champ obligatoire manquant ou non liste : {champ}")
            elif champ != "agents" and not valeur:
                erreurs.append(f"{pre}la liste « {champ} » est vide")
            elif not all(_texte_ok(v) for v in valeur):
                erreurs.append(f"{pre}« {champ} » ne doit contenir que des textes non vides")
        if "sensible" in s and not isinstance(s["sensible"], bool):
            erreurs.append(f"{pre}« sensible » doit être un booléen")

        slug = s.get("slug")
        if _texte_ok(slug):
            if not RE_SLUG.match(slug):
                erreurs.append(f"{pre}slug invalide (minuscules, chiffres et tirets) : {slug!r}")
            if slug in slugs:
                erreurs.append(f"slug en double : {slug}")
            else:
                slugs[slug] = s
        prefixe = s.get("prefixe")
        if _texte_ok(prefixe):
            if not RE_PREFIXE.match(prefixe):
                erreurs.append(f"{pre}préfixe invalide (3 ou 4 lettres majuscules) : {prefixe!r}")
            if prefixe in PREFIXES_RESERVES:
                erreurs.append(f"{pre}préfixe déjà utilisé par une entreprise existante : {prefixe}")
            if prefixe in prefixes:
                erreurs.append(f"préfixe en double : {prefixe} ({prefixes[prefixe]} et {nom})")
            else:
                prefixes[prefixe] = nom

        agents = s.get("agents")
        if isinstance(agents, list) and all(_texte_ok(a) for a in agents):
            if s.get("agentsRefErreur"):
                erreurs.append(f"{pre}registre d'agents référencé illisible : {s['agentsRefErreur']}")
            if len(set(agents)) != len(agents):
                erreurs.append(f"{pre}agents en double")
            if not s.get("agentsRef") and not 2 <= len(agents) <= 4:
                erreurs.append(f"{pre}2 à 4 agents attendus, {len(agents)} trouvé(s)")
            coord = s.get("coordinateur")
            if _texte_ok(coord) and coord not in agents:
                erreurs.append(f"{pre}coordinateur « {coord} » absent de la liste des agents")

    vus = set()
    for i, x in enumerate(flux):
        if not isinstance(x, dict):
            erreurs.append(f"flux #{i} : doit être un objet")
            continue
        pre = f"flux #{i} ({x.get('source')} -> {x.get('cible')}) : "
        for champ in CHAMPS_FLUX:
            if not _texte_ok(x.get(champ)):
                erreurs.append(f"{pre}champ obligatoire manquant ou vide : {champ}")
        if not isinstance(x.get("approbationHumaine"), bool):
            erreurs.append(f"{pre}champ obligatoire manquant ou non booléen : approbationHumaine")
        source, cible = x.get("source"), x.get("cible")
        for role, valeur in (("source", source), ("cible", cible)):
            if _texte_ok(valeur) and valeur not in slugs:
                erreurs.append(f"{pre}service inconnu en {role} : {valeur}")
        if _texte_ok(source) and source == cible:
            erreurs.append(f"{pre}un service ne peut pas échanger avec lui-même")
        if x.get("approbationHumaine") is False:
            for valeur in (source, cible):
                if valeur in slugs and slugs[valeur].get("sensible") is True:
                    erreurs.append(f"{pre}le service sensible « {valeur} » impose l'approbation humaine")
        cle = (source, cible, x.get("objet"))
        if cle in vus:
            erreurs.append(f"{pre}flux en double")
        vus.add(cle)
    return erreurs


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Registre des services de l'Atelier")
    sous = p.add_subparsers(dest="commande", required=True)
    v = sous.add_parser("verifier", help="valide le registre des services")
    v.add_argument("--fichier", default=str(FICHIER_PAR_DEFAUT), help="registre à contrôler")
    args = p.parse_args(argv)
    try:
        registre = charger_services(args.fichier)
    except (OSError, ValueError) as exc:
        print(f"ÉCHEC lecture de {args.fichier} : {type(exc).__name__} : {exc}")
        return 1
    erreurs = valider(registre)
    for e in erreurs:
        print(f"ÉCHEC {e}")
    if erreurs:
        print(f"Registre des services invalide : {len(erreurs)} erreur(s).")
        return 1
    print(f"OK   registre des services valide : {len(registre['services'])} service(s), {len(registre['flux'])} flux.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
