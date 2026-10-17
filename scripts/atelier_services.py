#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Registre des services de l'Atelier : chargement et validation.

Chaque service est une entreprise Paperclip distincte ; la matrice « flux » liste les seuls
échanges autorisés entre services (pas de flux déclaré, pas d'échange).

Réseau des coordinateurs (lot 2 de l'usine v2) : chaque coordinateur peut adresser une demande à tout autre
coordinateur du même client, et le coordinateur général (Direction, champ « coordinateurGeneral ») à chacun d'eux.
Ces flux ne sont JAMAIS écrits à la main dans le registre : `flux_coordinateurs` les génère pour toutes les paires
ordonnées de services que la matrice métier ne couvre pas encore, et `flux_complets` rend la matrice déclarée au
plugin (métier puis générés). Règle sensible inchangée : un flux qui touche un service « sensible » exige
l'approbation humaine. Le cloisonnement par client est tenu par la déclaration (un client à la fois) et par le plugin.

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

# Service qui porte le coordinateur général (entreprise Direction du client).
SERVICE_DIRECTION = "direction"
COMPETENCE_PROTOCOLE = "protocole-inter-coordinateurs"
OBJET_ENTRE_COORDINATEURS = ("Liaison entre coordinateurs (compétence protocole-inter-coordinateurs) : "
                             "question bornée, réponse tracée, au plus deux relais")
OBJET_COORDINATEUR_GENERAL = ("Coordinateur général et coordinateurs de département (compétence "
                              "protocole-inter-coordinateurs) : délégation, réponse et consolidation tracées")


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
        if "coordinateurGeneral" in s:
            general = s["coordinateurGeneral"]
            if s.get("slug") != SERVICE_DIRECTION:
                erreurs.append(f"{pre}seul le service {SERVICE_DIRECTION} porte le coordinateur général")
            if not _texte_ok(general):
                erreurs.append(f"{pre}« coordinateurGeneral » doit être un texte non vide")
            elif general == s.get("coordinateur"):
                erreurs.append(f"{pre}le coordinateur général doit être distinct du coordinateur du service")
            elif isinstance(s.get("agents"), list) and general not in s["agents"]:
                erreurs.append(f"{pre}coordinateur général « {general} » absent de la liste des agents")

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
            if not s.get("agentsRef") and not 2 <= len(agents) <= 12:
                erreurs.append(f"{pre}2 à 12 agents attendus, {len(agents)} trouvé(s)")
            coord = s.get("coordinateur")
            if _texte_ok(coord) and coord not in agents:
                erreurs.append(f"{pre}coordinateur « {coord} » absent de la liste des agents")

    if not any(isinstance(s, dict) and _texte_ok(s.get("coordinateurGeneral")) for s in services):
        erreurs.append(f"aucun coordinateur général : le service {SERVICE_DIRECTION} doit porter « coordinateurGeneral »")

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
        # Une seule déclaration par paire source → cible, comme l'exige la route services.declarer du plugin
        # (plusieurs objets se regroupent dans le champ « objet », séparés par « ; »).
        cle = (source, cible)
        if cle in vus:
            erreurs.append(f"{pre}flux en double (paire {source} → {cible} déjà déclarée)")
        vus.add(cle)
    return erreurs


def flux_coordinateurs(registre: dict) -> list[dict]:
    """Flux du réseau des coordinateurs, générés (jamais listés à la main) : une entrée par paire ordonnée de services
    distincts que la matrice métier ne couvre pas. Les paires qui touchent la Direction portent l'objet du coordinateur
    général (seul interlocuteur de l'humain, rôle ceo de l'entreprise Direction : c'est lui qui reçoit les demandes
    adressées à la Direction). Approbation humaine dès qu'un des deux services est sensible. Ordre stable."""
    services = [s for s in registre["services"]]
    sensibles = {s["slug"] for s in services if s.get("sensible") is True}
    metier = {(f["source"], f["cible"]) for f in registre["flux"]}
    generes = []
    for a in services:
        for b in services:
            source, cible = a["slug"], b["slug"]
            if source == cible or (source, cible) in metier:
                continue
            general = SERVICE_DIRECTION in (source, cible)
            generes.append({
                "source": source, "cible": cible,
                "objet": OBJET_COORDINATEUR_GENERAL if general else OBJET_ENTRE_COORDINATEURS,
                "approbationHumaine": source in sensibles or cible in sensibles,
                "origine": "coordinateur-general" if general else "coordinateurs",
            })
    return generes


def flux_complets(registre: dict) -> list[dict]:
    """Matrice déclarée au plugin : flux métier du registre (origine « metier »), puis réseau des coordinateurs."""
    return [{**f, "origine": "metier"} for f in registre["flux"]] + flux_coordinateurs(registre)


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
    print(f"OK   registre des services valide : {len(registre['services'])} service(s), {len(registre['flux'])} flux métier, "
          f"{len(flux_coordinateurs(registre))} flux générés entre coordinateurs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
