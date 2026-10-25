"""Contrats partagés entre le plugin TypeScript et la fabrique Python.

Les jeux de `fabrique/contrats-essai/*.json` sont lus ici ET par `plugin-atelier/tests/fabrique-contrats.spec.ts` :
chaque demande doit recevoir le même verdict des deux côtés. Pour `provenance.json`, le côté Python vérifie que
l'exemple de base est bien celui que produit le code réel (`service._provenance_document`) ; le côté plugin
vérifie que `verifierProvenance` l'accepte et refuse les variantes altérées.
"""

import hashlib
import json
from pathlib import Path

import pytest

from fabrique import service
from fabrique.demande_video import DemandeVideoInvalide, valider_demande_video
from fabrique.generateurs.documents import DemandeInvalide, valider_demande

DOSSIER = Path(__file__).resolve().parents[1] / "contrats-essai"


def charger(nom: str) -> dict:
    return json.loads((DOSSIER / nom).read_text(encoding="utf-8"))


def cas_de(nom: str):
    return [pytest.param(c["demande"], c["valide"], id=c["nom"]) for c in charger(nom)["cas"]]


def verdict(valideur, erreur, demande) -> bool:
    try:
        valideur(demande)
    except erreur:
        return False
    return True


@pytest.mark.parametrize("demande, attendu", cas_de("demandes-document.json"))
def test_demande_document(demande, attendu):
    assert verdict(valider_demande, DemandeInvalide, demande) is attendu


@pytest.mark.parametrize("demande, attendu", cas_de("demandes-video.json"))
def test_demande_video(demande, attendu):
    assert verdict(valider_demande_video, DemandeVideoInvalide, demande) is attendu


@pytest.mark.parametrize("fichier", ["demandes-document.json", "demandes-video.json"])
def test_jeu_contient_valides_et_invalides(fichier):
    verdicts = [c["valide"] for c in charger(fichier)["cas"]]
    assert verdicts.count(True) >= 5 and verdicts.count(False) >= 20


# ---------- provenance.json ----------

def test_provenance_de_base_est_celle_du_code_reel():
    jeu = charger("provenance.json")
    sha = hashlib.sha256(jeu["contenu_fichier_utf8"].encode()).hexdigest()
    produite = service._provenance_document(
        {"travail": jeu["provenance"]["travail"], "entreprise": jeu["entreprise"]}, "docx",
        {"fichier": "document.docx", "sha256": sha})
    attendue = dict(jeu["provenance"])
    # Les versions d'outils dépendent de l'installation : on exige les mêmes outils, pas les mêmes versions.
    assert set(produite.pop("outils")) == set(attendue.pop("outils"))
    assert produite == attendue
    assert jeu["provenance"]["sha256"] == sha


def test_provenance_variantes_sont_toutes_decrites():
    jeu = charger("provenance.json")
    noms = [c["nom"] for c in jeu["cas"]]
    assert len(noms) == len(set(noms))
    assert sum(1 for c in jeu["cas"] if c["valide"]) >= 3 and sum(1 for c in jeu["cas"] if not c["valide"]) >= 15
    for c in jeu["cas"]:
        assert c["registre"] in jeu["registres"] if "registre" in c else True
