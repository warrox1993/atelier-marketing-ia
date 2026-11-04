"""Tests de l'illustration IA d'une scène vidéo : validation, enchaînement du service, fond/voile/mouvement des gabarits.

Le modèle d'illustration et HyperFrames sont remplacés : seul l'enchaînement est testé. La génération et le rendu
réels sont prouvés par une vidéo passée par le service installé (voir le rapport du lot).
"""

import copy
import json
import re
import sys
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique import registre_charte, service  # noqa: E402
from fabrique.demande_video import DemandeVideoInvalide, valider_demande_video  # noqa: E402
from fabrique.generateurs import images, visuels as vis  # noqa: E402
from fabrique.tests.test_service import (UID, Video, _gardes_de_test, deposer, demande_video, racine)  # noqa: E402,F401
from fabrique.tests.test_visuels import CHAMPS_VALIDES, GABARITS_DE_BASE  # noqa: E402

ILLUSTRATION = "Painterly World of Warcraft cinematic key art, a young arcane mage casting a purple blast in a tavern"


def scene(**surcharge):
    base = {"texte_voix": "Bonjour tout le monde.", "voix": "synthese-chatterbox-fr",
            "visuel": {"gabarit": "titre_plein_ecran", "champs": {"titre": "Bonjour"}}}
    base.update(surcharge)
    return base


def demande(*scenes):
    return {"format_sortie": "1080x1920", "sous_titres": True, "scenes": list(scenes) or [scene()]}


# ---------- demande ----------

def test_illustration_acceptee_et_conservee():
    v = valider_demande_video(demande(scene(illustration=ILLUSTRATION), scene()))
    assert v.scenes[0].illustration == ILLUSTRATION and v.scenes[1].illustration is None


@pytest.mark.parametrize("valeur", ["x" * 19, "x" * 2501, "Scène\x00nulle de plus de vingt caractères",
                                    "Texte avec\nsaut de ligne de plus de vingt", "Texte avec\ttabulation de plus de vingt",
                                    42, None, ["a"] * 30])
def test_illustration_invalide_refusee(valeur):
    with pytest.raises(DemandeVideoInvalide, match=r"scenes\[1\]\.illustration"):
        valider_demande_video(demande(scene(illustration=valeur)))


def test_illustration_aux_bornes_acceptee():
    for taille in (20, 2500):
        assert valider_demande_video(demande(scene(illustration="x" * taille))).scenes[0].illustration == "x" * taille


# ---------- service ----------

class VideoIllustree(Video):
    """Banc vidéo où l'illustration est simulée : note les fonds, les graines et les options passées au rendu."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.illustrations, self.visuels = [], []

    def illustrer(self, texte, format_sortie, identifiant, dossier_travail, budget, *, dimensions=None, rang=0):
        self.journal.append(f"illustration:{rang}")
        png = Path(dossier_travail) / f"fond-{rang}.png"
        png.write_bytes(b"png%d" % rang)
        self.illustrations.append((texte, format_sortie, dimensions, rang))
        return png

    def visuel(self, scene, format_sortie, duree_s, dossier_travail, budget, **options):
        self.visuels.append(options)
        return super().visuel(scene, format_sortie, duree_s, dossier_travail, budget)


@pytest.fixture
def banc(racine, monkeypatch):
    b = VideoIllustree(racine, monkeypatch, durees_voix=(2.0, 3.0, 2.0))
    monkeypatch.setattr(service, "_illustrer", b.illustrer)
    monkeypatch.setattr(service, "_rendre_visuel", b.visuel)
    return b


def video_avec(*illustrations):
    d = demande_video()
    base = d["scenes"]
    d["scenes"] = [{**base[i % 2], **({"illustration": t} if t else {})} for i, t in enumerate(illustrations)]
    return d


def test_chaque_scene_illustree_recoit_son_fond_et_un_sens_alterne(banc):
    _, _, etat = banc.lancer(video_avec(ILLUSTRATION, ILLUSTRATION + " again", ILLUSTRATION + " third"))
    assert etat["etat"] == "termine", etat
    assert [i[3] for i in banc.illustrations] == [1, 2, 3]
    assert [o["fond"].name for o in banc.visuels] == ["fond-1.png", "fond-2.png", "fond-3.png"]
    assert [o["sens"] for o in banc.visuels] == [1, -1, 1]
    assert banc.journal[:3] == ["voix", "illustration:1", "visuel:2.4"]


def test_scene_sans_illustration_garde_le_rendu_d_avant(banc):
    _, _, etat = banc.lancer(video_avec(ILLUSTRATION, None))
    assert etat["etat"] == "termine", etat
    assert len(banc.illustrations) == 1 and banc.visuels[1] == {}


def test_video_sans_illustration_ne_touche_pas_au_modele(banc):
    _, _, etat = banc.lancer(video_avec(None, None))
    assert etat["etat"] == "termine" and banc.illustrations == []
    assert "flux" not in " ".join(banc.infos[0].outils)


def test_provenance_nomme_flux3_quand_une_illustration_est_utilisee(banc):
    banc.lancer(video_avec(ILLUSTRATION, None))
    modele = service._modele_illustration()
    assert banc.infos[0].outils[modele["nom"]] == modele["revision"][:12]


def test_attente_du_gpu_pendant_une_illustration_remet_le_travail_en_file(banc, monkeypatch):
    def occupe(*a, **k):
        raise service.AttenteGpu("jeu en cours : reaper")
    monkeypatch.setattr(service, "_illustrer", occupe)
    _, livrable, etat = banc.lancer(video_avec(ILLUSTRATION, None), )
    assert etat["etat"] == "en_attente_gpu", etat
    assert "monter" not in banc.journal


def test_illustration_en_echec_fait_echouer_la_video_sans_detail(banc, monkeypatch):
    def echec(*a, **k):
        raise service.Echec("la génération de l'illustration a échoué")
    monkeypatch.setattr(service, "_illustrer", echec)
    _, _, etat = banc.lancer(video_avec(ILLUSTRATION, None))
    assert etat["etat"] == "echec" and etat["message"] == "la génération de l'illustration a échoué"


def test_illustrer_donne_une_graine_et_un_dossier_par_scene(racine, monkeypatch, tmp_path):
    """Deux scènes du même travail : graines différentes (sinon les images se ressemblent), dossiers distincts."""
    vus = []

    def executer(etape, delai_s, **options):
        vus.append((json.loads((Path(etape.dossier_entree) / "demande.json").read_text()), etape.dossier_entree))
        pil = pytest.importorskip("PIL.Image")
        pil.new("RGB", (1920, 1080), (9, 9, 9)).save(Path(etape.dossier_sortie) / "illustration.png")
        return service.cage.Resultat(code=0, duree_s=1.0, sortie=b"{}", erreur=b"", delai_depasse=False)
    monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: (True, "libre"))
    monkeypatch.setattr(service, "memoire_disponible_octets", lambda *a, **k: 32 * 1024**3)
    monkeypatch.setattr(service.cage, "executer", executer)
    budget = service._Budget(1800)
    ident = "12345678-aaaa-bbbb-cccc-1234567890ab"
    for rang in (1, 2):
        service._illustrer(ILLUSTRATION, "1920x1080", ident, tmp_path, budget, dimensions=(1920, 1080), rang=rang)
    (d1, e1), (d2, e2) = vus
    assert (d1["largeur"], d1["hauteur"]) == (1920, 1080) and d1["graine"] != d2["graine"] and e1 != e2


def test_quatre_illustrations_tiennent_largement_dans_le_budget_de_30_minutes():
    """Environ 50 s par illustration (mesure de la fabrique), 6 scènes au plus : moins du quart du budget d'une vidéo."""
    assert 6 * 50 < service.DELAI_TOTAL_VIDEO_S / 4 and 4 * 50 < service.DELAI_TOTAL_VIDEO_S / 8


# ---------- gabarits ----------

@pytest.mark.parametrize("gabarit", list(CHAMPS_VALIDES))
def test_chaque_gabarit_pose_le_fond_dans_la_composition_et_le_script_apres_la_scene(gabarit):
    page = (GABARITS_DE_BASE / gabarit / "index.html").read_text(encoding="utf-8")
    assert re.search(r'<div id="root"[^>]*>\s*\{\{fond\}\}\s*<div id="scene"', page)
    assert re.search(r'<script src="scene.js"></script>\s*\{\{fond_js\}\}', page)


def test_la_page_porte_fond_voile_et_script_seulement_si_demande():
    modele = (GABARITS_DE_BASE / "titre_plein_ecran" / "index.html").read_text(encoding="utf-8")
    valeurs = vis.valider_champs("titre_plein_ecran", CHAMPS_VALIDES["titre_plein_ecran"])
    sans = vis.remplir_gabarit(modele, valeurs, "1080x1920", 5)
    avec = vis.remplir_gabarit(modele, valeurs, "1080x1920", 5, sens_fond=-1)
    assert 'id="fond"' not in sans and 'id="voile"' not in sans and "fond.js" not in sans
    assert '<img id="fond" src="fond.png" alt="" data-sens="-1">' in avec and '<i id="voile"></i>' in avec
    assert '<script src="fond.js"></script>' in avec


def test_la_scene_copie_le_fond_et_le_mouvement_seulement_avec_un_fond(tmp_path):
    fond = tmp_path / "f.png"
    fond.write_bytes(b"png")
    sans = vis.construire_scene(tmp_path / "a", "chiffre_cle", CHAMPS_VALIDES["chiffre_cle"], "1080x1920", 5)
    avec = vis.construire_scene(tmp_path / "b", "chiffre_cle", CHAMPS_VALIDES["chiffre_cle"], "1080x1920", 5, fond=fond)
    assert not (sans / "fond.png").exists() and not (sans / "fond.js").exists()
    assert (avec / "fond.png").read_bytes() == b"png" and (avec / "fond.js").is_file()
    page = (avec / "index.html").read_text(encoding="utf-8")
    assert 'data-sens="1"' in page and "fond.js" in page


def test_le_mouvement_est_un_zoom_lent_sur_la_timeline_de_la_scene():
    js = (GABARITS_DE_BASE / "_commun" / "fond.js").read_text(encoding="utf-8")
    assert "__timelines" in js and "scale" in js and "1.08" in js and "sens" in js and "data-duration" in js.replace("dataset.duration", "data-duration")
    assert not re.search(r"https?://", js)


def test_le_css_pose_fond_plein_cadre_voile_et_texte_clair():
    css = (GABARITS_DE_BASE / "_commun" / "base.css").read_text(encoding="utf-8")
    assert re.search(r"#fond\s*\{[^}]*object-fit:\s*cover", css)
    assert re.search(r"#voile\s*\{[^}]*rgba\(0, 0, 0, 0\.66\)", css)
    assert re.search(r"body:has\(#fond\)[^{]*\{[^}]*color:\s*#fff", css)


def test_le_voile_du_fond_est_celui_des_images_et_le_contraste_de_4_5_est_tenu_sur_le_pire_fond():
    css = (GABARITS_DE_BASE / "_commun" / "base.css").read_text(encoding="utf-8")
    assert f"rgba(0, 0, 0, {images.VOILE_OPACITE})" in css
    pire = images.pire_fond()
    couleurs = re.findall(r"body:has\(#fond\)[^{]*\{[^}]*color:\s*(#[0-9a-f]{3,6})", css)
    assert couleurs
    for couleur in couleurs:
        couleur = couleur if len(couleur) == 7 else "#" + "".join(c * 2 for c in couleur[1:])
        assert registre_charte.contraste(couleur, pire) >= registre_charte.CONTRASTE_TEXTE_MIN, couleur


def test_le_montage_n_incruste_aucune_mention_ia():
    """Choix de l'opérateur du 01/11 : pas de mention IA dans la vidéo, illustrée ou non (elle va dans le texte du post)."""
    import inspect
    from fabrique.generateurs import montage
    source = inspect.getsource(montage)
    assert "mention.ass" not in source and "Contenu généré avec l'IA" not in source


# ---------- rendu réel en cage (HyperFrames) ----------

from fabrique.tests.test_visuels import image_en_gris, pret_rendu, sonde  # noqa: E402


@pret_rendu
def test_rendu_reel_fond_sous_voile_et_zoom_lent_dans_les_deux_sens(tmp_path):
    pil = pytest.importorskip("PIL.Image")
    dessin = pytest.importorskip("PIL.ImageDraw")
    fond = tmp_path / "fond.png"
    image = pil.new("RGB", (1080, 1920), (255, 255, 255))  # pire cas pour le contraste : tout blanc, sauf des repères
    trait = dessin.Draw(image)
    for x in range(0, 1080, 90):
        trait.rectangle((x, 0, x + 12, 1920), fill=(200, 30, 30))
    image.save(fond)
    ecarts = []
    for sens in (1, -1):
        (tmp_path / f"t{sens}").mkdir()
        r = vis.rendre_scene(tmp_path / f"t{sens}", "titre_plein_ecran", CHAMPS_VALIDES["titre_plein_ecran"], "1080x1920", 3,
                             fond=fond, sens_fond=sens)
        assert r.ok, (r.motif, r.journal[-800:])
        assert sonde(r.video)["streams"][0]["nb_read_frames"] == "90"
        debut, fin = image_en_gris(r.video, 1.2), image_en_gris(r.video, 2.8)
        # Voile : un coin sans texte, sur fond blanc, tombe vers 255 * 0,34 = 87 ; jamais le blanc d'origine.
        assert 60 <= debut[5 * 270 + 5] <= 120, debut[5 * 270 + 5]
        ecarts.append(sum(abs(a - b) for a, b in zip(debut, fin)) / len(debut))
    assert all(e > 1.0 for e in ecarts), ecarts  # le texte est posé à 1,2 s : seul le zoom change l'image
