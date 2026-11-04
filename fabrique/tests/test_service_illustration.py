"""Tests de l'illustration IA d'une image côté service : étape GPU en cage, mention et provenance, attente du GPU, refus.

Le modèle et Chrome sont remplacés : seul l'enchaînement du service est testé. La génération réelle est prouvée par
une demande d'image passée par le service installé (voir le rapport du lot).
"""

import json
import sys
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique import cage, service  # noqa: E402
from fabrique.tests.test_service import (DEMANDE_IMAGE, UID, _gardes_de_test, _racine_des_chartes, deposer,  # noqa: E402,F401
                                         lancer_image, poser_charte, racine, traiter)

SCENE = "Epic fantasy painting, a young arcane mage casting a purple blast in a cozy tavern"
REVISION = json.loads((DEPOT / "fabrique" / "modeles.json").read_text(encoding="utf-8"))["modeles"][-1]["revision"]


def ecrire_png(chemin, taille=(1080, 1080), couleur=(90, 40, 140)):
    pil = pytest.importorskip("PIL.Image")
    pil.new("RGB", taille, couleur).save(chemin)


class BancIllustration:
    """Remplace la cage GPU (illustration), le rendu Chrome et la provenance. Note ce que le service leur demande."""

    def __init__(self, racine, monkeypatch, code=0, taille=(1080, 1080), delai=False, memoire=32 * 1024**3):
        self.racine, self.etapes, self.rendus, self.infos = racine, [], [], []
        self.code, self.taille, self.delai = code, taille, delai
        poser_charte(racine)
        monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: (True, "libre"))
        monkeypatch.setattr(service, "memoire_disponible_octets", lambda *a, **k: memoire)
        monkeypatch.setattr(service.cage, "executer", self.executer)
        monkeypatch.setattr(service.images, "rendre_image", self.rendre)
        monkeypatch.setattr(service, "_poser_provenance_image", self.provenance)

    def executer(self, etape, delai_s, **options):
        demande = json.loads((Path(etape.dossier_entree) / "demande.json").read_text())
        self.etapes.append((etape, demande, options, delai_s, sorted(p.name for p in (Path(etape.dossier_entree) / "code").iterdir())))
        if self.code == 0:
            ecrire_png(Path(etape.dossier_sortie) / "illustration.png", self.taille)
        return service.cage.Resultat(code=self.code, duree_s=1.0, sortie=b"{}", erreur=b"MemoryError: secret /home/x", delai_depasse=self.delai)

    def rendre(self, dossier_travail, gabarit, champs, format_sortie, charte, *, mention=False, temoin=False, fond=None):
        self.rendus.append((mention, fond, fond.read_bytes()[:8] if fond else None))
        dossier = Path(dossier_travail) / "image-xxxx"
        dossier.mkdir()
        (dossier / "image.png").write_bytes(b"png")
        return service.images.Resultat(True, "", dossier / "image.png", "", 0.5, 1080, 1080, 3, "0" * 64)

    def provenance(self, image, infos):
        self.infos.append(infos)
        chemin = image.with_name("provenance.json")
        chemin.write_text(json.dumps({"fichier": "image.png"}))
        return chemin


def avec_illustration(texte=SCENE, **modif):
    return {**DEMANDE_IMAGE, "illustration": texte, **modif}


def test_image_illustree_etape_gpu_en_cage_hors_ligne_avec_poids_montes_et_plafond_de_ram(racine, monkeypatch):
    banc = BancIllustration(racine, monkeypatch)
    ident, livrable, etat = lancer_image(racine, demande=avec_illustration())
    assert etat["etat"] == "termine", etat
    etape, demande, options, delai, code = banc.etapes[0]
    assert etape.type == "gpu" and etape.hors_ligne and etape.programme == service.PYTHON_IMAGE
    assert etape.arguments == ("-I", "/entree/code/illustration.py", "/entree/demande.json", "/sortie")
    assert etape.montages_modeles == ((str(racine / "modeles" / f"flux-3-image-klein@{REVISION}"), "/modeles/illustration"),)
    assert code == ["illustration.py", "modeles.json"]
    assert demande == {"illustration": SCENE, "largeur": 1080, "hauteur": 1080, "graine": int(ident.replace("-", "")[:8], 16)}
    assert options == {"fsize_octets": 200 * 1024**2, "donnees_octets": 12 * 1024**3} and delai == cage.DELAI_ILLUSTRATION_S


def test_image_illustree_pose_le_fond_sans_mention_incrustee_et_la_provenance_fond_ia(racine, monkeypatch):
    banc = BancIllustration(racine, monkeypatch)
    ident, livrable, etat = lancer_image(racine, demande=avec_illustration())
    mention, fond, signature = banc.rendus[0]
    # choix de l'opérateur du 01/11 : la mention IA va dans le texte du post, pas sur l'image ; la provenance la porte en métadonnées
    assert mention is False and signature == b"\x89PNG\r\n\x1a\n" and fond.name == "illustration.png"
    infos = banc.infos[0]
    assert infos.fond_ia is True and infos.mention_visible is False
    assert infos.outils["flux-3-image-klein"] == REVISION[:12] and "chrome-headless-shell" in infos.outils
    assert "fond IA : oui, mention visible : non" in (livrable / "apercu.txt").read_text()
    assert not (racine / "travaux" / ident).exists()


def test_image_sans_illustration_ne_lance_aucune_etape_gpu(racine, monkeypatch):
    banc = BancIllustration(racine, monkeypatch)
    _, livrable, etat = lancer_image(racine)
    assert etat["etat"] == "termine" and banc.etapes == []
    assert banc.rendus[0][:2] == (service.MENTION_VISIBLE_IMAGE, None) and banc.infos[0].fond_ia is False
    assert "fond IA : non" in (livrable / "apercu.txt").read_text()


@pytest.mark.parametrize("valeur", ["a" * 19, "a" * 2501, "scène\nsur deux lignes pour le test", None, 12, ["x" * 30]])
def test_image_illustration_invalide_ne_lance_rien(racine, monkeypatch, valeur):
    banc = BancIllustration(racine, monkeypatch)
    _, _, etat = lancer_image(racine, demande=avec_illustration(valeur))
    assert etat["etat"] == "echec" and "illustration" in etat["message"] and banc.etapes == [] and banc.rendus == []


@pytest.mark.parametrize("code,delai,attendu", [(5, False, "bandes noires persistantes"), (4, False, "la génération de l'illustration a échoué"),
                                                (2, False, "la génération de l'illustration a échoué"),
                                                (0, True, "délai dépassé pendant la génération de l'illustration")])
def test_image_echec_de_la_cage_illustration_sans_fuite_de_detail(racine, monkeypatch, code, delai, attendu):
    banc = BancIllustration(racine, monkeypatch, code=code, delai=delai)
    _, livrable, etat = lancer_image(racine, demande=avec_illustration())
    assert etat["etat"] == "echec" and attendu in etat["message"] and "/home" not in etat["message"]
    assert banc.rendus == [] and sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_image_illustration_aux_mauvaises_dimensions_est_refusee(racine, monkeypatch):
    banc = BancIllustration(racine, monkeypatch, taille=(1088, 1360))
    _, _, etat = lancer_image(racine, demande=avec_illustration())
    assert etat["etat"] == "echec" and "format attendu" in etat["message"] and banc.rendus == []


@pytest.mark.parametrize("raison", ["gpu", "memoire"])
def test_image_illustree_attend_le_gpu_ou_la_memoire_sans_occuper_la_file(racine, monkeypatch, raison):
    banc = BancIllustration(racine, monkeypatch, memoire=2 * 1024**3 if raison == "memoire" else 32 * 1024**3)
    if raison == "gpu":
        monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: (False, "jeu en cours"))
    file_gpu = service.FileAttenteGpu()
    ident, _ = deposer(racine / "entrant", type="image", demande=avec_illustration())
    traiter(racine, ident, file_gpu=file_gpu)
    etat = json.loads((racine / "livrables" / "acme" / ident / "etat.json").read_text())
    assert etat["etat"] == "en_attente_gpu" and len(file_gpu) == 1 and banc.etapes == [] and banc.rendus == []
    assert (racine / "travaux" / ident / "demande.json").is_file()  # la reprise repart de la demande


def test_image_la_file_du_gpu_pleine_refuse_une_image_illustree_mais_pas_une_image_simple(racine, monkeypatch):
    BancIllustration(racine, monkeypatch)
    file_gpu = service.FileAttenteGpu()
    file_gpu.travaux = [({}, 0.0)] * service.TAILLE_MAX_FILE_GPU
    ident, _ = deposer(racine / "entrant", type="image", demande=avec_illustration())
    traiter(racine, ident, file_gpu=file_gpu)
    assert not (racine / "livrables" / "acme" / ident).exists()
    simple, _ = deposer(racine / "entrant", type="image", demande=DEMANDE_IMAGE)
    traiter(racine, simple, file_gpu=file_gpu)
    assert json.loads((racine / "livrables" / "acme" / simple / "etat.json").read_text())["etat"] == "termine"


def test_image_illustree_a_un_budget_de_15_minutes_et_l_image_simple_de_5(racine, monkeypatch):
    assert service.DELAI_TOTAL_IMAGE_ILLUSTREE_S == 900 and service.DELAI_TOTAL_IMAGE_S == 300
    banc = BancIllustration(racine, monkeypatch)
    lancer_image(racine, demande=avec_illustration())
    assert banc.etapes[0][3] == cage.DELAI_ILLUSTRATION_S  # le budget restant dépasse les 10 min de la cage


def test_le_seuil_de_memoire_de_l_illustration_est_le_plafond_de_la_cage_plus_2_gio():
    assert service.MEMOIRE_MIN_ILLUSTRATION_OCTETS == cage.LIMITE_DONNEES_ILLUSTRATION_OCTETS + 2 * 1024**3 == 14 * 1024**3
