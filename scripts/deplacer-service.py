#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fait passer UN service (une entreprise Paperclip existante) d'un client à un autre, sans recréer l'entreprise.

Les données du service restent rangées par identifiant d'entreprise : seuls changent son nom, son marqueur, les deux
registres locaux (instance/atelier-client/<client>/entreprise.json) et le dossier local du service.

Usage : python3 -I scripts/deplacer-service.py --service <slug> --de <client> --vers <client> --nom-commercial "<nom>"
                                               [--a-blanc | --confirmer]
Sans l'une des deux options : refus. « --a-blanc » liste les écritures sans rien écrire.
Variables : ATELIER_API (instance visée), ATELIER_DONNEES_LOCALES (défaut instance/).

Contrôles avant toute écriture : service présent au registre de départ (version 2) et pas « marketing » ; nom et marqueur
Paperclip conformes ; service absent du registre d'arrivée ; entreprise revendiquée par aucun autre registre ; le départ
garde au moins une entreprise ; dossier d'arrivée libre.
Écritures, dans cet ordre : (1) PATCH du nom et du marqueur ; (2) registre d'arrivée (créé « personnel », sans BCE, s'il
manque) ; (3) registre de départ sans le service ; (4) déplacement du dossier services/<service>/. Idempotent : relancé après
une interruption, le script termine le travail. Journal : instance/atelier-client/<vers>/journal-deplacements.jsonl.
« declarer-services.py » n'est PAS appelé : le script affiche les deux commandes à lancer ensuite.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import shutil
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIER_REGISTRE = "entreprise.json"
FICHIER_JOURNAL = "journal-deplacements.jsonl"
SEPARATEUR_NOM = " · "
MAX_NOM_COMMERCIAL = 120
_bo = None


class ErreurDeplacement(Exception):
    """Refus ou incohérence : rien n'a été écrit (ou la relance termine le travail)."""


def bootstrap():
    """scripts/bootstrap-organisation.py chargé par fichier (le script tourne en « python3 -I »), une seule fois."""
    global _bo
    if _bo is None:
        spec = importlib.util.spec_from_file_location("bootstrap_organisation", RACINE / "scripts" / "bootstrap-organisation.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _bo = module
    return _bo


def marqueur_de(client: str, service: str) -> str:
    return f"{bootstrap().PREFIXE_MARQUEUR_CLIENT}{client}:{service}"


def dossier(client: str) -> Path:
    return bootstrap().INSTANCE / "atelier-client" / client


def verifier_slug(valeur: str, option: str) -> None:
    if not bootstrap().RE_SLUG_REGISTRE.fullmatch(valeur or ""):
        raise ErreurDeplacement(f"{option} invalide (lettres minuscules, chiffres, tirets) : {valeur!r}")


def lire_registre(client: str) -> dict | None:
    """Registre version 2 du client (None s'il n'existe pas), lu par lire_registre_client de bootstrap (règle commune,
    client « personnel » compris) ; l'ancien format (une seule entreprise) est refusé ici."""
    bo = bootstrap()
    try:
        r = bo.lire_registre_client(client)
    except bo.ErreurAtelier as e:
        raise ErreurDeplacement(str(e)) from None
    if r is None:
        return None
    if r.get("_ancienFormat") or r.get("version") != 2:
        raise ErreurDeplacement(f"registre local du client {client} : version 2 attendue (relancer mettre-a-jour-client pour le migrer)")
    if not r["personnel"]:
        r.pop("personnel")  # clé ajoutée à la lecture : ne pas la réécrire dans un registre à BCE
    return r


def ecrire_registre(client: str, contenu: dict) -> None:
    """Écriture atomique : dossier 0700, fichier 0600 (comme ecrire_registre_client de bootstrap)."""
    d = dossier(client)
    d.parent.mkdir(parents=True, exist_ok=True)
    d.mkdir(exist_ok=True)
    os.chmod(d, 0o700)
    tmp = d / f".{FICHIER_REGISTRE}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(contenu, indent=2, ensure_ascii=False) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, d / FICHIER_REGISTRE)


def clients_revendiquant(cid: str, exclus: set[str]) -> list[str]:
    """Clients (hors `exclus`) dont le registre lisible désigne cette entreprise."""
    racine = bootstrap().INSTANCE / "atelier-client"
    trouves = []
    if racine.is_dir() and not racine.is_symlink():
        for d in sorted(racine.iterdir()):
            if d.name in exclus or d.is_symlink() or not d.is_dir() or not bootstrap().RE_SLUG_REGISTRE.fullmatch(d.name):
                continue
            try:
                r = lire_registre(d.name)
            except ErreurDeplacement:
                continue
            if r and any(e["entrepriseId"] == cid for e in r["entreprises"].values()):
                trouves.append(d.name)
    return trouves


def etat_paperclip(entreprise: dict, entree: dict, nom_service: str, de: str, vers: str, service: str, nom_commercial: str):
    """('ancien' | 'nouveau', nom d'arrivée, description d'arrivée) ou refus si nom et marqueur ne correspondent pas."""
    bo = bootstrap()
    nom, description = entreprise.get("name") or "", entreprise.get("description") or ""
    avant, apres = marqueur_de(de, service), marqueur_de(vers, service)
    if SEPARATEUR_NOM not in nom:
        raise ErreurDeplacement(f"le nom « {nom} » de l'entreprise {entreprise.get('id')} n'a pas la forme « <préfixe> · <service> · <nom> » : refusé.")
    nom_apres = f"{nom.split(SEPARATEUR_NOM)[0]}{SEPARATEUR_NOM}{nom_service}{SEPARATEUR_NOM}{nom_commercial}"
    motif = re.compile(r"(?<![A-Za-z0-9_-])" + re.escape(avant) + r"(?![A-Za-z0-9_:-])")
    nouvelle_description = motif.sub(lambda _: apres, description)
    if bo.porte_marqueur(description, apres):
        if nom != nom_apres:
            raise ErreurDeplacement(f"le marqueur {apres} est posé mais le nom « {nom} » diffère de « {nom_apres} » : refusé.")
        return "nouveau", nom_apres, description
    if not bo.porte_marqueur(description, avant):
        raise ErreurDeplacement(f"le marqueur {avant} ne figure pas dans la description de l'entreprise {entreprise.get('id')} : refusé.")
    if entree.get("nom") is not None and nom != entree["nom"]:
        raise ErreurDeplacement(f"le nom Paperclip « {nom} » diffère du nom du registre « {entree['nom']} » : refusé.")
    return "ancien", nom_apres, nouvelle_description


def preparer(api, service: str, de: str, vers: str, nom_commercial: str) -> dict:
    """Tous les contrôles et le plan des écritures ; n'écrit rien."""
    bo = bootstrap()
    verifier_slug(service, "--service")
    verifier_slug(de, "--de")
    verifier_slug(vers, "--vers")
    if de == vers:
        raise ErreurDeplacement("--de et --vers doivent différer.")
    if service == "marketing":
        raise ErreurDeplacement("le service marketing ne se déplace pas : refusé.")
    if (not nom_commercial.strip() or len(nom_commercial) > MAX_NOM_COMMERCIAL
            or any(ord(c) < 32 or ord(c) == 127 for c in nom_commercial)):
        raise ErreurDeplacement(f"nom commercial invalide (1 à {MAX_NOM_COMMERCIAL} caractères, sans caractère de contrôle).")
    svc = next((s for s in bo.registre_services()["services"] if s["slug"] == service), None)
    if svc is None:
        raise ErreurDeplacement(f"service {service!r} inconnu du registre des services.")
    reg_de, reg_vers = lire_registre(de), lire_registre(vers)
    if reg_de is None:
        raise ErreurDeplacement(f"registre local du client de départ {de} absent : refusé.")
    e_de = reg_de["entreprises"].get(service)
    e_vers = (reg_vers or {"entreprises": {}})["entreprises"].get(service)
    if e_de is None and e_vers is None:
        raise ErreurDeplacement(f"le service {service} n'est pas au registre du client {de} : refusé.")
    if e_de and e_vers and e_de["entrepriseId"] != e_vers["entrepriseId"]:
        raise ErreurDeplacement(f"le client {vers} a déjà un service {service} (autre entreprise, {e_vers['entrepriseId']}) : refusé.")
    if e_de and len(reg_de["entreprises"]) < 2:
        raise ErreurDeplacement(f"le client {de} doit garder au moins une entreprise : refusé.")
    cid = (e_de or e_vers)["entrepriseId"]
    if e_de and e_de["marqueur"] != marqueur_de(de, service):
        raise ErreurDeplacement(f"le marqueur du registre ({e_de['marqueur']}) n'est pas {marqueur_de(de, service)} : refusé.")
    ailleurs = clients_revendiquant(cid, {de, vers})
    if ailleurs:
        raise ErreurDeplacement(f"l'entreprise {cid} est aussi revendiquée par le registre de : {', '.join(ailleurs)} : refusé.")
    entreprise = next((c for c in api.get("/companies") if c.get("id") == cid), None)
    if entreprise is None:
        raise ErreurDeplacement(f"l'entreprise {cid} du service {service} est introuvable dans Paperclip : refusé.")
    etat, nom_apres, description_apres = etat_paperclip(entreprise, e_de or e_vers, svc["nom"], de, vers, service, nom_commercial)
    src, dst = dossier(de) / "services" / service, dossier(vers) / "services" / service
    deplacer = src.exists() or src.is_symlink()
    if deplacer and src.is_symlink():
        raise ErreurDeplacement(f"{src} est un lien symbolique : refusé.")
    if deplacer and (dst.exists() or dst.is_symlink()):
        raise ErreurDeplacement(f"le dossier {dst} existe déjà : refusé.")
    plan = {"service": service, "de": de, "vers": vers, "cid": cid, "etat": etat, "nom": nom_apres, "description": description_apres,
            "marqueur": marqueur_de(vers, service), "reg_de": reg_de, "reg_vers": reg_vers, "src": src, "dst": dst,
            "ecrire_arrivee": e_vers is None, "ecrire_depart": e_de is not None, "deplacer": deplacer, "actions": []}
    if etat == "ancien":
        plan["actions"].append(f"PATCH /companies/{cid} : nom « {nom_apres} », marqueur {plan['marqueur']}")
    if e_vers is None:
        plan["actions"].append(f"{'ajouter au' if reg_vers else 'créer le'} registre d'arrivée {dossier(vers) / FICHIER_REGISTRE}")
    if e_de:
        plan["actions"].append(f"retirer le service du registre de départ {dossier(de) / FICHIER_REGISTRE}")
    if deplacer:
        plan["actions"].append(f"déplacer le dossier {src} vers {dst}")
    return plan


def journaliser(plan: dict, etape: str) -> None:
    d = dossier(plan["vers"])
    d.parent.mkdir(parents=True, exist_ok=True)
    d.mkdir(exist_ok=True)
    os.chmod(d, 0o700)
    ligne = {"date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "service": plan["service"], "de": plan["de"],
             "vers": plan["vers"], "entrepriseId": plan["cid"], "etape": etape}
    fd = os.open(d / FICHIER_JOURNAL, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "a", encoding="utf-8") as f:
        f.write(json.dumps(ligne, ensure_ascii=False) + "\n")


def etape_paperclip(api, plan: dict) -> None:
    api.appel("PATCH", f"/companies/{plan['cid']}", {"name": plan["nom"], "description": plan["description"]})


def etape_arrivee(plan: dict) -> None:
    entree = {"entrepriseId": plan["cid"], "nom": plan["nom"], "marqueur": plan["marqueur"]}
    if plan["reg_vers"]:
        contenu = json.loads(json.dumps(plan["reg_vers"]))
    else:
        contenu = {"version": 2, "entrepriseId": plan["cid"], "numeroBce": None, "personnel": True, "slug": plan["vers"],
                   "creeLe": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "entreprises": {}}
    contenu["entreprises"][plan["service"]] = entree
    ecrire_registre(plan["vers"], contenu)


def etape_depart(plan: dict) -> None:
    contenu = json.loads(json.dumps(plan["reg_de"]))
    del contenu["entreprises"][plan["service"]]
    if contenu["entrepriseId"] == plan["cid"]:
        restant = contenu["entreprises"].get("marketing") or next(iter(contenu["entreprises"].values()))
        contenu["entrepriseId"] = restant["entrepriseId"]
    ecrire_registre(plan["de"], contenu)


def etape_dossier(plan: dict) -> None:
    plan["dst"].parent.mkdir(parents=True, exist_ok=True)
    os.chmod(plan["dst"].parent, 0o700)
    shutil.move(str(plan["src"]), str(plan["dst"]))


def executer(api, plan: dict) -> None:
    """Les quatre écritures dans l'ordre, chacune journalisée une fois faite."""
    if plan["etat"] == "ancien":
        etape_paperclip(api, plan)
        journaliser(plan, "paperclip")
    if plan["ecrire_arrivee"]:
        etape_arrivee(plan)
        journaliser(plan, "registre-arrivee")
    if plan["ecrire_depart"]:
        etape_depart(plan)
        journaliser(plan, "registre-depart")
    if plan["deplacer"]:
        etape_dossier(plan)
        journaliser(plan, "dossier")


def main(argv=None, api=None) -> int:
    p = argparse.ArgumentParser(description="Déplace un service d'un client à un autre sans recréer l'entreprise")
    p.add_argument("--service", required=True)
    p.add_argument("--de", required=True)
    p.add_argument("--vers", required=True)
    p.add_argument("--nom-commercial", required=True)
    p.add_argument("--a-blanc", action="store_true", help="liste les écritures sans rien écrire")
    p.add_argument("--confirmer", action="store_true", help="exécute le déplacement")
    args = p.parse_args(argv)
    if args.a_blanc == args.confirmer:
        print("ERREUR : indiquez exactement une option parmi --a-blanc et --confirmer : refusé, rien n'est écrit.", file=sys.stderr)
        return 2
    try:
        if api is None:
            bo = bootstrap()
            api = bo.Api(bo.url_api())
        plan = preparer(api, args.service, args.de, args.vers, args.nom_commercial)
        if not plan["actions"]:
            print(f"Service {args.service} déjà déplacé vers {args.vers} : rien à faire.")
        elif args.a_blanc:
            print("À blanc : écritures prévues (aucune n'est faite) :")
            for i, a in enumerate(plan["actions"], 1):
                print(f"  {i}. {a}")
            return 0
        else:
            executer(api, plan)
            print(f"Service {args.service} déplacé de {args.de} vers {args.vers} (entreprise {plan['cid']}).")
    except (ErreurDeplacement, bootstrap().ErreurAtelier) as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 2
    print("Reste à lancer à la main :")
    print(f"  python3 -I scripts/declarer-services.py {args.de}")
    print(f"  python3 -I scripts/declarer-services.py {args.vers}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
