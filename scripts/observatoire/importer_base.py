#!/usr/bin/env python3
"""Importe la base commune des sources de l'Observatoire (docs/observatoire/sources/base-sources.jsonl) dans le plugin.

Chaque ligne devient une source commune candidate, citable par tout article de l'entreprise « OBS · » après sa première
lecture réussie par une collecte (route obs.base.importer,
humain seulement, idempotente : relancer ne change rien). Envoi par paquets de 200, la limite de la route.
Le type « primaire » est réservé aux éditeurs (type « officiel ») et aux institutions ; voir type_source.

Usage : python3 -I importer_base.py --api http://localhost:<port>/api [--a-blanc] [--production] [--fichier F]
--api est obligatoire (aucune valeur par défaut) et le port 3100 est refusé, sauf avec --production.
"""
import argparse
import importlib.util
import json
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
FICHIER = os.path.join(ICI, "..", "..", "docs", "observatoire", "sources", "base-sources.jsonl")
PAQUET = 200

# Mêmes garde-fous et même client HTTP que confier.py (chargé par chemin : python3 -I n'ajoute pas ce dossier au chemin).
_spec = importlib.util.spec_from_file_location("confier", os.path.join(ICI, "confier.py"))
confier = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(confier)

PRIMAIRES = {"officiel", "institution"}
COMMUNAUTAIRES = {"blog", "forum", "youtube", "podcast", "video"}


def type_source(type_base):
    """Type de la base (presse, officiel, institution...) vers la contrainte de obs_sources ; inconnu : secondaire."""
    if type_base in PRIMAIRES:
        return "primaire"
    return "communautaire" if type_base in COMMUNAUTAIRES else "secondaire"


def vers_source(ligne):
    """Ligne du fichier vers le corps attendu par la route (champs vides rendus null)."""
    # DROIT-5.2 : l'éditeur connu est l'auteur nommé avec une citation de la source ; inconnu, la route le laisse tel quel.
    editeur = (ligne.get("editeur") or "").strip()
    return {**({"auteur": editeur} if editeur else {}),
        "url": ligne["url"].strip(),
        "type": type_source(ligne.get("type")),
        # La note A/B/C du recensement mesure la joignabilité de l'adresse, pas la fiabilité (LIV-OB-7).
        "joignabilite": ligne.get("fiabilite") or None,
        "langue": ligne.get("langue") or None,
        "pays": ligne.get("pays") or None,
        "sujets": list(ligne.get("sujets") or []),
    }


def charger(chemin):
    with open(chemin, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def importer(appel, company_id, lignes, a_blanc):
    """Envoie les sources par paquets de 200 ; rend le nombre de sources envoyées (ou qui le seraient à blanc)."""
    sources = [vers_source(l) for l in lignes]
    if a_blanc:
        return len(sources)
    total = 0
    for i in range(0, len(sources), PAQUET):
        r = appel("POST", f"/plugins/{confier.PLUGIN_CLE}/api/obs/base/sources",
                  {"companyId": company_id, "sources": sources[i:i + PAQUET]})
        total += (r or {}).get("importees", 0)
    return total


def main(argv=None):
    p = argparse.ArgumentParser(description="Importe la base commune des sources de l'Observatoire")
    p.add_argument("--api", required=True, help="http://localhost:<port>/api (3100 : seulement avec --production)")
    p.add_argument("--a-blanc", action="store_true", help="n'écrit rien, affiche ce qui serait fait")
    p.add_argument("--production", action="store_true", help="autorise le port 3100 (instance de production)")
    p.add_argument("--fichier", default=FICHIER, help="base au format JSONL (défaut : docs/observatoire/sources/base-sources.jsonl)")
    a = p.parse_args(argv)
    try:
        api = confier.verifier_api(a.api, a.production)
        lignes = charger(a.fichier)
        appel = confier.appel_http(api)
        cid, nom, _ = confier.trouver_obs(appel)
        n = importer(appel, cid, lignes, a.a_blanc)
        print(f"Instance {api} | entreprise « {nom} » ({cid}) | {'À BLANC : ' if a.a_blanc else ''}{n} source(s) importée(s) sur {len(lignes)}")
    except (ValueError, confier.ErreurHttp, OSError, KeyError) as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
