"""Tests du générateur d'illustration IA : validation, consigne, réglages du modèle, dimensions, recadrage et
contrôle des bandes noires (sans GPU ni poids).

La génération réelle (le modèle de modeles.json sur la carte) est prouvée par la demande d'image passée par le service installé.
"""

import json
import re
import sys
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique.generateurs import illustration  # noqa: E402

SCENE = "Epic fantasy painting, a young arcane mage casting a purple blast in a cozy tavern"
PIXELS = 1_500_000
DEMANDE = {"illustration": SCENE, "largeur": 1080, "hauteur": 1350, "graine": 7}


def test_les_bornes_de_l_illustration():
    assert illustration.valider_illustration("a" * 20) == "a" * 20
    assert illustration.valider_illustration("a" * 2500) == "a" * 2500  # FLUX 3 exige une description de 100 à 350 mots
    for refusee in ("a" * 19, "a" * 2501, " " * 30, "", 12, None, ["x" * 30]):
        with pytest.raises(illustration.DemandeInvalide):
            illustration.valider_illustration(refusee)


@pytest.mark.parametrize("controle", ["\x00", "\n", "\t", "\x1b", "\x7f"])
def test_les_caracteres_de_controle_sont_refuses(controle):
    with pytest.raises(illustration.DemandeInvalide, match="contrôle"):
        illustration.valider_illustration(SCENE + controle + SCENE)


def test_la_consigne_ajoute_le_suffixe_fixe_sans_interdire_les_personnages():
    texte = illustration.consigne(SCENE)
    assert texte == SCENE + (", full-bleed composition, no letterbox, no black bars, no borders, anatomically correct hands "
                             "with five fingers, no extra fingers, no fused fingers, no text, no letters, no words, "
                             "no logo, no watermark, no signature")
    assert "people" not in texte and "person" not in texte


def test_une_longue_description_garde_son_contenu_et_precede_le_suffixe():
    description = (DEPOT / "fabrique" / "tests" / "description_flux3.txt").read_text(encoding="utf-8").strip()
    assert 1500 < len(description) <= illustration.ILLUSTRATION_MAX
    assert illustration.valider_illustration(description) == description
    assert illustration.consigne(description) == description + illustration.SUFFIXE


def test_la_demande_est_un_schema_ferme_aux_valeurs_bornees():
    assert illustration.valider_demande(DEMANDE) == DEMANDE
    for mauvaise in ({**DEMANDE, "extra": 1}, {k: v for k, v in DEMANDE.items() if k != "graine"},
                     {**DEMANDE, "largeur": 100}, {**DEMANDE, "hauteur": 5000}, {**DEMANDE, "largeur": True},
                     {**DEMANDE, "graine": -1}, {**DEMANDE, "graine": 2**32}, {**DEMANDE, "graine": "7"}, [DEMANDE]):
        with pytest.raises(illustration.DemandeInvalide):
            illustration.valider_demande(mauvaise)


@pytest.mark.parametrize("format", [(1080, 1080), (1080, 1350), (1440, 1800), (1080, 1920), (1200, 628)])
def test_dimensions_de_generation_multiples_de_16_bornees_et_couvrantes(format):
    largeur, hauteur = format
    gl, gh = illustration.dimensions_generation(largeur, hauteur, PIXELS)
    assert gl % 16 == 0 and gh % 16 == 0
    assert gl * gh <= PIXELS * 1.03  # l'arrondi au multiple de 16 peut dépasser de peu
    assert abs(gl / gh / (largeur / hauteur) - 1) < 0.03  # le recadrage ne déforme pas


def test_le_portrait_4_5_est_genere_sans_reechantillonnage():
    assert illustration.dimensions_generation(1080, 1350, PIXELS) == (1088, 1360)  # mesuré : 8,0 Gio, 25 à 31 s


@pytest.mark.parametrize("genere,cible", [((1088, 1360), (1080, 1350)), ((1096, 1368), (1440, 1800)), ((1200, 640), (1200, 628))])
def test_le_recadrage_rend_les_dimensions_exactes(genere, cible):
    pil = pytest.importorskip("PIL.Image")
    image = illustration.recadrer(pil.new("RGB", genere, (10, 20, 30)), *cible)
    assert image.size == cible


def test_le_recadrage_est_centre_sans_deformation():
    pil = pytest.importorskip("PIL.Image")
    source = pil.new("RGB", (100, 80), (0, 0, 0))
    source.paste((255, 0, 0), (45, 0, 55, 80))  # bande rouge au centre
    image = illustration.recadrer(source, 60, 80)
    assert image.size == (60, 80) and image.getpixel((30, 40)) == (255, 0, 0) and image.getpixel((5, 40)) == (0, 0, 0)


def test_main_refuse_une_demande_invalide_avec_le_code_2(tmp_path, capsys):
    demande = tmp_path / "demande.json"
    demande.write_text(json.dumps({**DEMANDE, "illustration": "trop court"}))
    assert illustration.main(["illustration.py", str(demande), str(tmp_path)]) == 2
    assert "illustration" in capsys.readouterr().err
    assert illustration.main(["illustration.py", str(tmp_path / "absente.json"), str(tmp_path)]) == 2
    assert illustration.main(["illustration.py"]) == 2
    (tmp_path / "gros.json").write_text(" " * (illustration.TAILLE_MAX_DEMANDE + 1))
    assert illustration.main(["illustration.py", str(tmp_path / "gros.json"), str(tmp_path)]) == 2


MODULES = ["context_embedder", "x_embedders", "norm_out", "proj_out"]
REGLAGES = {"nom": "modele-essai", "pipeline": "flux3-modulaire", "etapes": 16, "guidance": None,
            "modules_non_quantifies": MODULES, "pixels_max": PIXELS}


def ecrire_demande(tmp_path, demande=DEMANDE):
    entree, sortie = tmp_path / "e.json", tmp_path / "s"
    sortie.mkdir(exist_ok=True)
    entree.write_text(json.dumps(demande))
    return entree, sortie


def brancher(monkeypatch, images):
    """Remplace le modèle : le moteur rend les images données, une par appel, et note les graines et la consigne."""
    graines, suite = [], iter(images)
    monkeypatch.setattr(illustration, "lire_reglages", lambda: REGLAGES)
    monkeypatch.setattr(illustration, "ouvrir_moteur",
                        lambda reglages, texte: lambda largeur, hauteur, graine: graines.append((graine, largeur, hauteur, texte)) or next(suite))
    return graines


def test_main_ecrit_le_png_aux_dimensions_exactes_et_resume(tmp_path, monkeypatch, capsys):
    pil = pytest.importorskip("PIL.Image")
    graines = brancher(monkeypatch, [pil.new("RGB", (1088, 1360), (90, 40, 140))])
    entree, sortie = ecrire_demande(tmp_path)
    assert illustration.main(["illustration.py", str(entree), str(sortie)]) == 0
    assert pil.open(sortie / "illustration.png").size == (1080, 1350)
    resume = json.loads(capsys.readouterr().out)
    assert (resume["graine"], resume["modele"], resume["etapes"]) == (7, "modele-essai", 16)
    assert graines == [(7, 1088, 1360, illustration.consigne(SCENE))]  # consigne = scène + suffixe, au format de génération


def test_main_rend_4_si_la_generation_echoue(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(illustration, "lire_reglages", lambda: REGLAGES)

    def echec(reglages):
        raise RuntimeError("CUDA indisponible dans la cage")
    monkeypatch.setattr(illustration, "ouvrir_moteur", lambda reglages, texte: echec(reglages))
    entree, sortie = ecrire_demande(tmp_path)
    assert illustration.main(["illustration.py", str(entree), str(sortie)]) == 4
    assert "échec de génération" in capsys.readouterr().err


def test_main_rend_4_si_les_reglages_sont_illisibles(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(illustration, "REGLAGES", tmp_path / "absent.json")
    entree, sortie = ecrire_demande(tmp_path)
    assert illustration.main(["illustration.py", str(entree), str(sortie)]) == 4
    assert "réglages illisibles" in capsys.readouterr().err


@pytest.mark.parametrize("bande", ["haut", "bas"])
def test_une_bande_noire_declenche_une_seconde_generation_avec_une_autre_graine(tmp_path, monkeypatch, bande):
    pil = pytest.importorskip("PIL.Image")
    noire = pil.new("RGB", (1088, 1360), (90, 40, 140))
    noire.paste((0, 0, 0), (0, 0 if bande == "haut" else 1360 - 80, 1088, 80 if bande == "haut" else 1360))
    bonne = pil.new("RGB", (1088, 1360), (200, 120, 60))
    graines = brancher(monkeypatch, [noire, bonne])
    entree, sortie = ecrire_demande(tmp_path)
    assert illustration.main(["illustration.py", str(entree), str(sortie)]) == 0
    assert [g[0] for g in graines] == [7, 8]
    assert pil.open(sortie / "illustration.png").getpixel((540, 5)) == (200, 120, 60)  # c'est la seconde image qui est livrée


def test_des_bandes_noires_persistantes_sont_un_echec_clair_sans_png(tmp_path, monkeypatch, capsys):
    pil = pytest.importorskip("PIL.Image")
    graines = brancher(monkeypatch, [pil.new("RGB", (1088, 1360), (0, 0, 0)), pil.new("RGB", (1088, 1360), (3, 3, 3))])
    entree, sortie = ecrire_demande(tmp_path)
    assert illustration.main(["illustration.py", str(entree), str(sortie)]) == 5
    assert "bandes noires" in capsys.readouterr().err and [g[0] for g in graines] == [7, 8] and not (sortie / "illustration.png").exists()


def test_la_graine_de_secours_reste_dans_les_bornes():
    assert illustration.graine_de_secours(7) == 8 and illustration.graine_de_secours(2**32 - 1) == 0


def test_seuil_de_luminance_des_bandes():
    pil = pytest.importorskip("PIL.Image")
    sombre = pil.new("RGB", (100, 200), (200, 200, 200))
    sombre.paste((7, 7, 7), (0, 0, 100, 10))
    assert illustration.bandes_noires(sombre)  # 10 lignes = 5 % : luminance 7 < 8
    sombre.paste((8, 8, 8), (0, 0, 100, 10))
    assert not illustration.bandes_noires(sombre)
    mi = pil.new("RGB", (100, 200), (200, 200, 200))
    mi.paste((0, 0, 0), (0, 80, 100, 120))  # le noir au milieu n'est pas une bande
    assert not illustration.bandes_noires(mi)


def test_reglages_valides():
    r = illustration.valider_reglages({**REGLAGES, "modele": "flux"})
    assert (r["guidance"], r["pipeline"], r["nom"], r["etapes"], r["modules_non_quantifies"]) == (
        None, "flux3-modulaire", "flux", 16, MODULES)


@pytest.mark.parametrize("champ,valeur", [("pipeline", "os.system"), ("pipeline", "ZImagePipeline"), ("pipeline", 3), ("etapes", 0),
                                          ("etapes", "4"), ("etapes", 101), ("guidance", 0.0), ("guidance", 3.5),
                                          ("modules_non_quantifies", []), ("modules_non_quantifies", "proj_out"),
                                          ("modules_non_quantifies", ["../x"]), ("modules_non_quantifies", [3]),
                                          ("pixels_max", 10), ("pixels_max", 10**9)])
def test_reglages_invalides_refuses(champ, valeur):
    with pytest.raises(ValueError):
        illustration.valider_reglages({**REGLAGES, champ: valeur})


def test_les_reglages_du_depot_decrivent_flux_3_klein_sans_rien_coder_en_dur():
    donnees = json.loads((DEPOT / "fabrique" / "modeles.json").read_text(encoding="utf-8"))
    reglages = illustration.lire_reglages(DEPOT / "fabrique" / "modeles.json")
    assert (reglages["nom"], reglages["pipeline"], reglages["etapes"], reglages["guidance"]) == (
        "flux-3-image-klein", "flux3-modulaire", 16, None)
    assert "early_stream_modulations" in reglages["modules_non_quantifies"]  # sans eux, l'image n'est que du bruit
    modele = next(m for m in donnees["modeles"] if m["nom"] == reglages["nom"])
    assert (modele["depot"], modele["revision"], modele["licence"]) == (
        "black-forest-labs/flux-3-image-klein", "337337621b8526e120f2275d250242f4a6bedd75", "FLUX Kommunity License v.1.0")
    assert all(len(info["sha256"]) == 64 for info in modele["fichiers"].values())
    assert {"modular_model_index.json", "transformer/config.json", "text_encoder/config.json", "vae/config.json",
            "LICENSE.md", "NOTICE.md"} <= set(modele["fichiers"])
    assert not any(m["nom"] == "z-image-turbo" for m in donnees["modeles"])
    source = (DEPOT / "fabrique" / "generateurs" / "illustration.py").read_text(encoding="utf-8")
    assert "black-forest-labs" not in source and "337337" not in source  # dépôt et révision ne vivent que dans modeles.json


def test_les_exigences_de_l_environnement_image_sont_figees_avec_empreintes():
    exigences = (DEPOT / "fabrique" / "exigences-image.txt").read_text(encoding="utf-8")
    for paquet in ("bitsandbytes==0.50.2", "torch==2.6.0", "torchvision==0.21.0", "diffusers==0.42.1", "transformers==5.22.1", "accelerate==1.15.0"):
        assert paquet in exigences
    lignes = exigences.splitlines()
    for numero, ligne in enumerate(lignes):
        if re.fullmatch(r"[a-z0-9._-]+==\S+ \\", ligne):
            assert lignes[numero + 1].strip().startswith("--hash=sha256:"), ligne  # chaque version figée porte au moins une empreinte
