"""Tests du fond d'illustration IA des images : gabarits, charte, voile et rendu réel en cage (sans GPU ni poids)."""

import re
import sys
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique import registre_charte  # noqa: E402
from fabrique.generateurs import images  # noqa: E402
from fabrique.tests.test_images import (CHAMPS_VALIDES, FORMATS, GABARITS_IMAGES, PALIERS_M,  # noqa: E402
                                        charte_de_rendu, ouvrir, pret_rendu, temoin_visible)

CHARTE = registre_charte.Charte("c", "#ffffff", "#111111", "#1f4e8c", "#ffffff", "dejavu-sans")


def fond_png(tmp_path, couleur=(255, 255, 255), taille=(1080, 1350)):
    pil = pytest.importorskip("PIL.Image")
    chemin = tmp_path / "illustration.png"
    pil.new("RGB", taille, couleur).save(chemin)
    return chemin


@pytest.mark.parametrize("gabarit", list(CHAMPS_VALIDES))
def test_chaque_gabarit_pose_le_fond_avant_la_page(gabarit):
    page = (GABARITS_IMAGES / gabarit / "index.html").read_text(encoding="utf-8")
    assert re.search(r"<body>\s*\{\{fond\}\}\s*<div id=\"page\">", page)


def test_la_page_porte_le_fond_et_le_voile_seulement_si_demande():
    modele = (GABARITS_IMAGES / "accroche" / "index.html").read_text(encoding="utf-8")
    valeurs = images.valider_champs("accroche", {"titre": "x"})
    sans = images.remplir_gabarit(modele, valeurs, "1080x1080", PALIERS_M)
    avec = images.remplir_gabarit(modele, valeurs, "1080x1080", PALIERS_M, fond=True)
    assert 'id="fond"' not in sans and 'id="voile"' not in sans
    assert '<img id="fond" src="fond.png" alt="">' in avec and '<i id="voile"></i>' in avec


def test_la_scene_copie_le_fond_et_la_feuille_de_charte_declare_le_voile(tmp_path):
    fond = fond_png(tmp_path)
    scene = images.construire_scene(tmp_path / "s", "accroche", CHAMPS_VALIDES["accroche"], "1080x1350", CHARTE, fond=fond)
    assert (scene / "fond.png").read_bytes() == fond.read_bytes() and 'id="fond"' in (scene / "index.html").read_text()
    feuille = (scene / "charte.css").read_text(encoding="utf-8")
    assert "--voile: rgba(0, 0, 0, 0.66)" in feuille and "--accent-fond:" in feuille


def test_sans_fond_la_scene_et_la_feuille_de_charte_restent_celles_d_avant(tmp_path):
    scene = images.construire_scene(tmp_path / "s", "accroche", CHAMPS_VALIDES["accroche"], "1080x1350", CHARTE)
    assert not (scene / "fond.png").exists() and "voile" not in (scene / "charte.css").read_text(encoding="utf-8")
    assert 'id="fond"' not in (scene / "index.html").read_text(encoding="utf-8")


@pytest.mark.parametrize("accent", ["#1f4e8c", "#8a3b12", "#000000", "#ffd400", "#ffffff", "#e8e8e8"])
def test_texte_et_accent_gardent_4_5_sur_le_pire_fond_possible(accent):
    """Pire cas : une illustration entièrement blanche sous le voile."""
    pire = images.pire_fond()
    assert registre_charte.contraste("#ffffff", pire) >= registre_charte.CONTRASTE_TEXTE_MIN
    assert registre_charte.contraste(images.accent_sur_fond(accent), pire) >= registre_charte.CONTRASTE_TEXTE_MIN


def test_un_accent_deja_clair_est_conserve_et_un_accent_sombre_passe_au_blanc():
    assert images.accent_sur_fond("#ffd400") == "#ffd400"
    assert images.accent_sur_fond("#1f4e8c") == "#ffffff"


def test_pire_fond_vient_de_l_opacite_du_voile():
    assert images.VOILE_OPACITE == 0.66 and images.pire_fond() == "#575757"


@pret_rendu
@pytest.mark.parametrize("format", FORMATS)
def test_rendu_avec_fond_aux_dimensions_exactes_voile_pose_et_texte_clair(tmp_path, format):
    largeur, hauteur = map(int, format.split("x"))
    fond = fond_png(tmp_path, (255, 255, 255), (largeur, hauteur))
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], format, charte_de_rendu(), mention=True,
                            temoin=True, fond=fond)
    assert r.ok, (r.motif, r.journal[-800:])
    image = ouvrir(r.image)
    assert image.size == (largeur, hauteur)
    assert image.getpixel((2, 2)) == (87, 87, 87)  # blanc sous le voile à 66 % : le pire fond
    assert temoin_visible(r.image), f"{format} : le contenu déborde"


@pret_rendu
def test_le_fond_est_visible_au_milieu_et_le_texte_est_clair_sur_le_voile(tmp_path):
    fond = fond_png(tmp_path, (255, 255, 255), (1080, 1350))
    champs = {"titre": "Un titre très lisible", "appel_action": "Réserver"}
    r = images.rendre_image(tmp_path, "accroche", champs, "1080x1350", charte_de_rendu(), fond=fond)
    assert r.ok, (r.motif, r.journal[-800:])
    image = ouvrir(r.image)
    assert image.getpixel((540, 770)) == (255, 255, 255)  # la bande centrale (57 % de la hauteur) laisse voir l'illustration
    assert max(image.getpixel((x, y))[0] for y in range(100, 400) for x in range(80, 1000, 2)) == 255  # texte blanc en haut
