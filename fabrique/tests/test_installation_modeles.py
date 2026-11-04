"""Tests de scripts/telecharger-modeles-voix.py : copie locale des poids (sans réseau), contrôle des empreintes, filtre par nom."""

import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("telecharger_modeles", DEPOT / "scripts" / "telecharger-modeles-voix.py")
telecharger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(telecharger)

CONTENUS = {"model_index.json": b'{"a": 1}', "transformer/poids.safetensors": b"x" * 1000}


def modele(nom="flux-3-image-klein", contenus=CONTENUS):
    return {"nom": nom, "depot": "x/y", "revision": "r" * 40,
            "fichiers": {n: {"sha256": hashlib.sha256(c).hexdigest(), "taille": len(c)} for n, c in contenus.items()}}


def source(tmp_path, contenus=CONTENUS):
    dossier = tmp_path / "source"
    for nom, contenu in contenus.items():
        (dossier / nom).parent.mkdir(parents=True, exist_ok=True)
        (dossier / nom).write_bytes(contenu)
    return dossier


def test_copie_locale_puis_controle_sans_reseau(tmp_path, monkeypatch):
    monkeypatch.setenv("FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN", str(source(tmp_path)))
    monkeypatch.setitem(sys.modules, "huggingface_hub", None)  # toute tentative de téléchargement échouerait
    cible = tmp_path / "cible"
    telecharger.telecharger(modele(), cible)
    assert telecharger.controler(modele(), cible) == []


def test_un_fichier_altere_est_detecte(tmp_path, monkeypatch):
    dossier = source(tmp_path)
    monkeypatch.setenv("FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN", str(dossier))
    cible = tmp_path / "cible"
    telecharger.telecharger(modele(), cible)
    (cible / "transformer" / "poids.safetensors").write_bytes(b"y" * 1000)
    assert telecharger.controler(modele(), cible) == ["transformer/poids.safetensors : empreinte différente"]


def test_installer_ne_traite_que_les_noms_demandes_et_refuse_un_nom_inconnu(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("FABRIQUE_POIDS_FLUX_3_IMAGE_KLEIN", str(source(tmp_path)))
    monkeypatch.setattr(telecharger, "fixer_droits", lambda dossier, groupe: None)  # chown root impossible hors installation
    donnees = tmp_path / "modeles.json"
    donnees.write_text(json.dumps({"modeles": [modele(), modele("autre")]}))
    sortie = tmp_path / "modeles"
    sortie.mkdir()
    assert telecharger.installer(donnees, sortie, "groupe", ("flux-3-image-klein",)) == 0
    assert [p.name for p in sortie.iterdir()] == ["flux-3-image-klein@" + "r" * 40]  # « autre » n'est pas touché
    assert telecharger.installer(donnees, sortie, "groupe", ("flux-3-image-klein",)) == 0  # idempotent : déjà en place
    assert telecharger.installer(donnees, sortie, "groupe", ("inconnu",)) == 1
    assert "inconnus" in capsys.readouterr().err
