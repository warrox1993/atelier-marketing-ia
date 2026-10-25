#!/usr/bin/env python3
"""Télécharge UNE fois les poids des modèles de voix, à une révision figée, et contrôle leurs empreintes.

Usage (dans le venv voix, en root, par scripts/installer-fabrique-voix.sh) :
    python -I telecharger-modeles-voix.py <modeles.json> <dossier_modeles> <groupe>
    python -I telecharger-modeles-voix.py --noter <modeles.json>   # relève les empreintes manquantes

Chaque modèle va dans <dossier_modeles>/<nom>@<revision>/, root:<groupe>, lecture seule (0750/0640).
Idempotent : un dossier déjà présent dont toutes les empreintes sont bonnes n'est pas retouché.
Les poids au format pickle (.pt, .bin, .ckpt) sont déclarés dans le fichier de modèles par
« pickle_weights_only » : le code de voix les charge uniquement avec weights_only=True.
"""

from __future__ import annotations

import grp
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path


def sha256_fichier(chemin: Path) -> str:
    empreinte = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            empreinte.update(bloc)
    return empreinte.hexdigest()


def telecharger(modele: dict, cible: Path) -> None:
    from huggingface_hub import hf_hub_download

    for nom in modele["fichiers"]:
        hf_hub_download(
            repo_id=modele["depot"], filename=nom, revision=modele["revision"], local_dir=cible,
        )
    # Le cache local_dir de huggingface_hub n'a rien à faire dans le dossier final.
    shutil.rmtree(cible / ".cache", ignore_errors=True)


def controler(modele: dict, dossier: Path) -> list[str]:
    """Rend la liste des écarts (fichier manquant, empreinte différente, fichier en trop)."""
    ecarts = []
    attendus = modele["fichiers"]
    for nom, info in attendus.items():
        chemin = dossier / nom
        if not chemin.is_file() or chemin.is_symlink():
            ecarts.append(f"{nom} : absent")
        elif sha256_fichier(chemin) != info["sha256"]:
            ecarts.append(f"{nom} : empreinte différente")
    presents = {p.relative_to(dossier).as_posix() for p in dossier.rglob("*") if p.is_file()}
    for en_trop in sorted(presents - set(attendus)):
        ecarts.append(f"{en_trop} : fichier inattendu")
    return ecarts


def fixer_droits(dossier: Path, groupe: str) -> None:
    gid = grp.getgrnam(groupe).gr_gid
    for chemin in [dossier, *dossier.rglob("*")]:
        os.chown(chemin, 0, gid)
        os.chmod(chemin, 0o750 if chemin.is_dir() else 0o640)


def noter(chemin_json: Path) -> int:
    donnees = json.loads(chemin_json.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        for modele in donnees["modeles"]:
            cible = Path(tmp) / modele["nom"]
            telecharger(modele, cible)
            for nom, info in modele["fichiers"].items():
                info["sha256"] = sha256_fichier(cible / nom)
                info["taille"] = (cible / nom).stat().st_size
    chemin_json.write_text(json.dumps(donnees, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Empreintes notées dans {chemin_json}")
    return 0


def installer(chemin_json: Path, dossier_modeles: Path, groupe: str) -> int:
    donnees = json.loads(chemin_json.read_text(encoding="utf-8"))
    for modele in donnees["modeles"]:
        if any(not info.get("sha256") for info in modele["fichiers"].values()):
            print(f"erreur : empreintes manquantes pour {modele['nom']} (lancer avec --noter)", file=sys.stderr)
            return 1
        final = dossier_modeles / f"{modele['nom']}@{modele['revision']}"
        if final.is_dir() and not controler(modele, final):
            fixer_droits(final, groupe)
            print(f"Poids déjà en place : {final}")
            continue
        if final.exists():
            print(f"erreur : {final} existe mais ne correspond pas ; à examiner à la main", file=sys.stderr)
            return 1
        temporaire = Path(tempfile.mkdtemp(prefix=".tmp-", dir=dossier_modeles))
        try:
            telecharger(modele, temporaire)
            ecarts = controler(modele, temporaire)
            if ecarts:
                print(f"erreur : {modele['nom']} : " + " ; ".join(ecarts), file=sys.stderr)
                return 1
            fixer_droits(temporaire, groupe)
            os.rename(temporaire, final)
        finally:
            shutil.rmtree(temporaire, ignore_errors=True)
        print(f"Poids installés : {final}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "--noter":
        return noter(Path(argv[2]))
    if len(argv) == 4:
        return installer(Path(argv[1]), Path(argv[2]), argv[3])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
