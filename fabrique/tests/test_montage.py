"""Tests du lot 9 : montage vidéo ffmpeg en cage, bibliothèque musicale, évasions.

Prérequis : bwrap, ffmpeg, ffprobe et les polices installées par
`sudo scripts/installer-fabrique-montage.sh` (/opt/atelier-fabrique/polices).
"""

import json
import re
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))

if shutil.which("bwrap") is None or shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
    pytest.skip("bwrap, ffmpeg ou ffprobe absent", allow_module_level=True)
if not Path("/opt/atelier-fabrique/polices/DejaVuSans.ttf").exists():
    pytest.skip("polices absentes : lancer sudo scripts/installer-fabrique-montage.sh",
                allow_module_level=True)

from fabrique import bibliotheque_musique as bib  # noqa: E402
from fabrique.cage import Etape, executer  # noqa: E402
from fabrique.generateurs import montage  # noqa: E402
from fabrique.generateurs.montage import (PlanMontage, SceneMontage, construire_arguments_ffmpeg,  # noqa: E402
                                          monter)

ASS_BASE = (
    "[Script Info]\nScriptType: v4.00+\nPlayResX: {l}\nPlayResY: {h}\n\n[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
    "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
    "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
    "Style: Defaut,DejaVu Sans,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
    "-1,0,0,0,100,100,0,0,1,3,0,2,40,40,100,1\n\n"
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    "Dialogue: 0,0:00:00.20,0:00:09.00,Defaut,,0,0,0,,{texte}\n"
)


def ffmpeg(*arguments):
    processus = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *arguments],
                               capture_output=True, text=True, timeout=120)
    assert processus.returncode == 0, processus.stderr


def sonde(chemin):
    processus = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
                                "-show_streams", str(chemin)], capture_output=True, text=True, timeout=60)
    assert processus.returncode == 0, processus.stderr
    return json.loads(processus.stdout)


def preparer_entree(tmp_path, durees, format_sortie="1080x1080", texte="Bonjour le monde",
                    types=None, musique=None):
    """Crée tmp_path/entree avec visuels, voix, ASS (et musique) ; rend (travail, plan)."""
    largeur, hauteur = montage.FORMATS_SORTIE[format_sortie]
    travail = tmp_path / "travail"
    entree = travail / "entree"
    entree.mkdir(parents=True)
    types = types or ["png"] * len(durees)
    scenes = []
    for position, (duree, genre) in enumerate(zip(durees, types), start=1):
        nom = f"scene-{position:02d}.{genre}"
        # Visuels assez riches pour passer le plancher de débit (516 kb/s) : un aplat ou un test pattern
        # minuscule, prolongé sur sa dernière image, tomberait à quelques dizaines de kb/s. Le bruit sombre
        # (luma 16 à 76) ne produit aucun pixel clair, les mesures de texte des tests restent valables.
        if genre == "png":
            ffmpeg("-f", "lavfi", "-i", f"nullsrc=s={largeur}x{hauteur}:d=1,geq=lum='16+random(1)*60':cb=128:cr=128",
                   "-frames:v", "1", str(entree / nom))
        else:
            ffmpeg("-f", "lavfi", "-i", f"testsrc2=s={largeur}x{hauteur}:r=30:d=0.5", "-pix_fmt", "yuv420p",
                   str(entree / nom))
        ffmpeg("-f", "lavfi", "-i", f"sine=frequency={300 + 100 * position}:duration={duree}:sample_rate=22050",
               "-ac", "1", str(entree / f"voix-{position:02d}.wav"))
        scenes.append(SceneMontage(position, genre, duree))
    (entree / "sous-titres.ass").write_text(ASS_BASE.format(l=largeur, h=hauteur, texte=texte), encoding="utf-8")
    if musique is not None:
        shutil.copyfile(musique, entree / "musique.flac")
    plan = PlanMontage(tuple(scenes), format_sortie, avec_musique=musique is not None)
    return travail, plan


@pytest.fixture(scope="module")
def piste_test(tmp_path_factory):
    """Piste de test importée dans une bibliothèque jetable ; rend (racine, identifiant)."""
    dossier = tmp_path_factory.mktemp("bib")
    source = dossier / "source.wav"
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=220:duration=4:sample_rate=44100", str(source))
    racine = dossier / "bibliotheque"
    bib.importer(source, "fond-test", "Fond de test", "Auteur de test", "CC0", "https://exemple.org/test",
                 racine=racine)
    return racine, "fond-test"


# ---------------------------------------------------------------- construction pure


def plan_exemple(**options):
    return PlanMontage((SceneMontage(1, "png", 3.0), SceneMontage(2, "mp4", 2.5)), "1080x1920", **options)


def test_arguments_aucun_concat_demuxer_et_whitelist_sur_chaque_entree():
    arguments = construire_arguments_ffmpeg(plan_exemple(avec_musique=True))
    assert arguments[:3] == ["-nostdin", "-hide_banner", "-n"]
    assert "concat" not in [arguments[i + 1] for i, a in enumerate(arguments[:-1]) if a == "-f"]
    entrees = [i for i, a in enumerate(arguments) if a == "-i"]
    assert len(entrees) == 5  # 2 visuels, 2 voix, 1 musique
    for i in entrees:
        avant = arguments[:i]
        derniere_liste = len(avant) - 1 - avant[::-1].index("-protocol_whitelist")
        # la whitelist de cette entrée est dans les options qui précèdent immédiatement son -i
        assert arguments[derniere_liste + 1] == "file"
        assert "-f" in arguments[derniere_liste:i]  # démultiplexeur forcé
        assert "-i" not in arguments[derniere_liste:i]
    assert arguments.count("-protocol_whitelist") == 5


def test_arguments_chemins_seulement_sous_entree_sortie_polices():
    arguments = construire_arguments_ffmpeg(plan_exemple(avec_musique=True))
    texte = " ".join(arguments)
    import re
    for chemin in re.findall(r"/[A-Za-z0-9_./-]+", texte):
        if chemin.startswith(("/entree/", "/sortie/", "/opt/atelier-fabrique/polices")):
            continue
        # fragments de filtres (« (ow-iw)/2 », durées) ne sont pas des chemins
        assert not re.match(r"^/(etc|home|var|usr|tmp|proc|root)", chemin), chemin
    assert "movie=" not in texte and "amovie=" not in texte and "subtitles=" not in texte
    # sous-titres seulement : aucune mention IA incrustée (choix de l'opérateur du 01/11)
    assert texte.count("fontsdir=/opt/atelier-fabrique/polices") == 1 and "mention.ass" not in texte
    assert "sidechaincompress" in texte and "-movflags +faststart" in texte
    assert "libx264" in arguments and "yuv420p" in arguments and "aac" in arguments


def test_arguments_sans_musique_pas_de_flac():
    arguments = construire_arguments_ffmpeg(plan_exemple())
    assert "musique.flac" not in " ".join(arguments)
    assert "sidechaincompress" not in " ".join(arguments)


@pytest.mark.parametrize("plan", [
    PlanMontage((), "1080x1080"),
    PlanMontage((SceneMontage(1, "png", 5.0),), "640x480"),
    PlanMontage((SceneMontage(1, "gif", 5.0),), "1080x1080"),
    PlanMontage((SceneMontage(2, "png", 5.0),), "1080x1080"),
    PlanMontage((SceneMontage(1, "png", float("nan")),), "1080x1080"),
    PlanMontage((SceneMontage(1, "png", 0.1),), "1080x1080"),
    PlanMontage((SceneMontage(1, "png", "5; rm"),), "1080x1080"),
    PlanMontage(tuple(SceneMontage(i, "png", 7.0) for i in range(1, 27)), "1080x1080"),  # 182 s
    PlanMontage(tuple(SceneMontage(i, "png", 1.0) for i in range(1, 32)), "1080x1080"),  # 31 scènes
])
def test_plan_invalide_refuse(plan):
    with pytest.raises(ValueError):
        construire_arguments_ffmpeg(plan)


def test_ffprobe_refuse_chemin_hors_cage_et_demultiplexeur_inconnu():
    with pytest.raises(ValueError):
        montage.construire_arguments_ffprobe("/etc/passwd", "mov")
    with pytest.raises(ValueError):
        montage.construire_arguments_ffprobe("/entree/video.mp4", "concat")


# ---------------------------------------------------------------- standard de qualité (lot 1)

SORTIE_MESURES = """\
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 0.8125 | silence_duration: 0.8125
[blackdetect @ 0x2] black_start:0 black_end:1 black_duration:1
[Parsed_ebur128_2 @ 0x3] Summary:

  Integrated loudness:
    I:         -16.2 LUFS
    Threshold: -26.5 LUFS

  Loudness range:
    LRA:         3.1 LU
    Threshold: -36.4 LUFS
    LRA low:   -19.0 LUFS
    LRA high:  -15.9 LUFS

  True peak:
    Peak:       -1.7 dBFS
"""


def mesures_ok(**surcharge):
    base = {"sonie_lufs": -16.0, "crete_vraie_dbtp": -1.6, "noir_initial_s": 0.0, "voix_debut_s": 0.1}
    return {**base, **surcharge}


def test_arguments_encodage_haut_de_gamme_et_sonie_normalisee():
    for avec_musique in (False, True):
        arguments = construire_arguments_ffmpeg(plan_exemple(avec_musique=avec_musique))
        assert arguments[arguments.index("-preset") + 1] == "medium"
        assert arguments[arguments.index("-crf") + 1] == "20"
        graphe = arguments[arguments.index("-filter_complex") + 1]
        assert "loudnorm=I=-16:TP=-1.5:LRA=11" in graphe
        assert graphe.index("loudnorm") > graphe.index("[voix]")  # sur la piste mixée, pas sur la musique seule
        assert graphe.endswith("[aout]") or "[aout]" in graphe.split(";")[-1]
        assert "aresample=48000" in graphe.split("loudnorm")[1]  # loudnorm sort en 192 kHz


def test_arguments_deux_passes_de_sonie():
    plan = plan_exemple(avec_musique=True)
    premiere = montage.construire_arguments_sonie(plan)
    graphe = premiere[premiere.index("-filter_complex") + 1]
    assert "concat=n=2:v=0:a=1[voix]" in graphe and "print_format=json" in graphe and "sidechaincompress" in graphe
    assert premiere[-3:] == ["-f", "null", "/dev/null"] and "libx264" not in premiere
    mesure = {"input_i": -27.5, "input_tp": -9.25, "input_lra": 4.5, "input_thresh": -38.0, "target_offset": 0.5}
    definitive = construire_arguments_ffmpeg(plan, mesure)
    graphe = definitive[definitive.index("-filter_complex") + 1]
    assert ("loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-27.50:measured_TP=-9.25:measured_LRA=4.50:"
            "measured_thresh=-38.00:offset=0.50:linear=true") in graphe
    with pytest.raises(ValueError):  # jamais un texte venu d'ailleurs dans le filtre
        construire_arguments_ffmpeg(plan, {**mesure, "input_i": "-27;drawtext"})


def test_analyse_de_la_premiere_passe_de_loudnorm():
    sortie = ('[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-27.61",\n\t"input_tp" : "-9.25",\n'
              '\t"input_lra" : "4.50",\n\t"input_thresh" : "-38.07",\n\t"output_i" : "-16.5",\n'
              '\t"target_offset" : "0.51"\n}\n')
    assert montage.analyser_sonie(sortie) == {"input_i": -27.61, "input_tp": -9.25, "input_lra": 4.5,
                                              "input_thresh": -38.07, "target_offset": 0.51}
    assert montage.analyser_sonie(sortie.replace('"-27.61"', '"-inf"')) is None  # voix muette : une seule passe
    assert montage.analyser_sonie("rien") is None


def test_arguments_mesures_en_cage_sans_reseau_ni_fichier_libre():
    arguments = montage.construire_arguments_mesures()
    texte = " ".join(arguments)
    assert "ebur128=peak=true" in texte and "blackdetect" in texte and "silencedetect" in texte
    assert "trim=end=1" in texte  # la détection du noir ne porte que sur la première seconde
    assert "/entree/video.mp4" in arguments and arguments.count("-protocol_whitelist") == 1
    for chemin in re.findall(r"/[A-Za-z0-9_./-]+", texte):
        assert chemin.startswith("/entree/") or chemin == "/dev/null", chemin


def test_analyse_des_mesures_ffmpeg():
    mesures = montage.analyser_mesures(SORTIE_MESURES)
    assert mesures == {"sonie_lufs": -16.2, "crete_vraie_dbtp": -1.7, "noir_initial_s": 1.0, "voix_debut_s": 0.8125}


def test_analyse_des_mesures_sans_resume_est_refusee():
    with pytest.raises(ValueError, match="sonie"):
        montage.analyser_mesures("[silencedetect @ 0x1] silence_start: 0\n")


def test_analyse_des_mesures_silence_total_donne_une_sonie_infinie():
    texte = SORTIE_MESURES.replace("-16.2 LUFS", "-inf LUFS").replace("-1.7 dBFS", "-inf dBFS")
    mesures = montage.analyser_mesures(texte)
    assert mesures["sonie_lufs"] == float("-inf") and mesures["crete_vraie_dbtp"] == float("-inf")


@pytest.mark.parametrize("surcharge,debit,mot", [
    ({"sonie_lufs": -18.5}, 5000, "sonie"),
    ({"sonie_lufs": -14.9}, 5000, "sonie"),
    ({"sonie_lufs": float("-inf")}, 5000, "sonie"),
    ({"crete_vraie_dbtp": -0.4}, 5000, "crête"),
    ({"noir_initial_s": 0.9}, 5000, "noir"),
    ({}, 515.0, "débit"),
])
def test_jugement_refuse_un_rendu_hors_norme(surcharge, debit, mot):
    ok, motif, _ = montage.juger_controle(mesures_ok(**surcharge), debit)
    assert not ok and mot in motif


def test_jugement_accepte_les_bornes_et_ne_signale_rien_de_trop():
    for limite in ({"sonie_lufs": -15.0}, {"sonie_lufs": -17.0}, {"crete_vraie_dbtp": -1.0}, {"noir_initial_s": 0.49}):
        ok, motif, alertes = montage.juger_controle(mesures_ok(**limite), 4000.0)
        assert ok, motif
        assert alertes == []


def test_jugement_alertes_non_bloquantes():
    ok, _, alertes = montage.juger_controle(mesures_ok(voix_debut_s=0.8), 3000.0)
    assert ok
    assert any("voix" in a for a in alertes) and any("débit" in a for a in alertes)
    # sans silence initial détecté, la voix démarre tout de suite : pas d'alerte
    ok, _, alertes = montage.juger_controle(mesures_ok(voix_debut_s=0.0), 4500.0)
    assert ok and alertes == []


def test_indices_de_planche_zero_un_deux_secondes_puis_chaque_scene():
    scenes = (SceneMontage(1, "mp4", 0.5), SceneMontage(2, "mp4", 1.5), SceneMontage(3, "mp4", 4.0))
    assert montage.indices_planche(PlanMontage(scenes, "1080x1080")) == [0, 15, 30, 60]
    # vidéo plus courte que 2 s : aucun indice hors de la vidéo
    court = PlanMontage((SceneMontage(1, "mp4", 1.2),), "1080x1080")
    assert montage.indices_planche(court) == [0, 30]


def test_indices_de_planche_trente_scenes_au_plus_trente_trois_images():
    plan = PlanMontage(tuple(SceneMontage(i, "mp4", 5.0) for i in range(1, 31)), "1080x1080")
    # 30 scènes de 5 s = 150 s ; 0 s est aussi le début de la scène 1 ; 1 s et 2 s s'ajoutent ; pas de doublon
    indices = montage.indices_planche(plan)
    assert len(indices) == 32 and indices == sorted(set(indices))


def test_arguments_planche_select_tile_et_largeur_360():
    arguments = montage.construire_arguments_planche([0, 30, 60, 90, 150, 180, 210])
    graphe = arguments[arguments.index("-filter_complex") + 1] if "-filter_complex" in arguments else arguments[arguments.index("-vf") + 1]
    assert "eq(n,0)+eq(n,30)" in graphe and "scale=360:-2" in graphe and "tile=6x2" in graphe
    assert arguments[-1] == "/sortie/planche.png" and "-frames:v" in arguments
    with pytest.raises(ValueError):
        montage.construire_arguments_planche([0, "1);drawtext"])
    with pytest.raises(ValueError):
        montage.construire_arguments_planche(list(range(37)))


# ---------------------------------------------------------------- montage réel


@pytest.mark.parametrize("format_sortie", ["1080x1920", "1920x1080", "1080x1080"])
def test_montage_reel_trois_formats(tmp_path, piste_test, format_sortie):
    racine, identifiant = piste_test
    travail, plan = preparer_entree(tmp_path, [1.5, 1.5], format_sortie, types=["png", "mp4"])
    bib.preparer_musique(identifiant, travail / "entree", racine)
    plan = PlanMontage(plan.scenes, format_sortie, avec_musique=True)
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    infos = sonde(resultat.video)
    largeur, hauteur = montage.FORMATS_SORTIE[format_sortie]
    video = next(f for f in infos["streams"] if f["codec_type"] == "video")
    audio = next(f for f in infos["streams"] if f["codec_type"] == "audio")
    assert "mp4" in infos["format"]["format_name"]
    assert (video["codec_name"], video["pix_fmt"], video["width"], video["height"]) == ("h264", "yuv420p", largeur, hauteur)
    assert video["r_frame_rate"] == "30/1" and audio["codec_name"] == "aac"
    assert abs(float(infos["format"]["duration"]) - 3.0) < 0.2


def test_montage_sans_musique_deux_png(tmp_path):
    travail, plan = preparer_entree(tmp_path, [1.0, 1.0])
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    assert resultat.duree_video_s == pytest.approx(2.0, abs=0.2)


def test_montage_fichier_manquant_refuse(tmp_path):
    travail, plan = preparer_entree(tmp_path, [1.0])
    (travail / "entree" / "voix-01.wav").unlink()
    resultat = monter(travail, plan)
    assert not resultat.ok and "voix-01.wav" in resultat.motif


def test_montage_visuel_corrompu_refuse_sans_exception(tmp_path):
    travail, plan = preparer_entree(tmp_path, [1.0])
    (travail / "entree" / "scene-01.png").write_bytes(b"#EXTM3U\nfile:///etc/passwd\n")
    resultat = monter(travail, plan)
    assert not resultat.ok


def test_montage_png_tronque_refuse_vite(tmp_path):
    """Bonne signature, corps illisible : le décodeur échoue, le montage est refusé sans exception."""
    travail, plan = preparer_entree(tmp_path, [1.0])
    (travail / "entree" / "scene-01.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
    resultat = monter(travail, plan)
    assert not resultat.ok and resultat.duree_montage_s < 30


def mesurer_image(tmp_path, video, nom):
    """Extrait une image 1080x1080 en niveaux de gris, dans une cage ; rend les octets."""
    entree, sortie = video.parent, tmp_path / f"extrait-{nom}"
    sortie.mkdir()
    arguments = ("-nostdin", "-hide_banner", "-n", "-loglevel", "error", "-protocol_whitelist", "file",
                 "-f", "mov", "-ss", "1.0", "-i", "/entree/video.mp4", "-frames:v", "1", "-pix_fmt", "gray",
                 "-f", "rawvideo", "/sortie/image.raw")
    resultat = executer(Etape("cpu", "/usr/bin/ffmpeg", arguments, str(entree), str(sortie)), 60)
    assert resultat.code == 0, resultat.erreur
    return (sortie / "image.raw").read_bytes()


def pixels_clairs(image, ligne_debut, ligne_fin, largeur=1080):
    zone = image[ligne_debut * largeur:ligne_fin * largeur]
    return sum(1 for octet in zone if octet > 200)


def test_ass_deja_echappe_rendu_tel_quel(tmp_path):
    """`\\{\\\\an8\\}` déjà échappé : les accolades sont du texte visible en bas, pas une balise."""
    avec = tmp_path / "avec"
    sans = tmp_path / "sans"
    avec.mkdir()
    sans.mkdir()
    texte = r"\{\\an8\}"
    travail_a, plan_a = preparer_entree(avec, [2.0], texte=texte)
    travail_b, plan_b = preparer_entree(sans, [2.0], texte=" ")
    assert texte in (travail_a / "entree" / "sous-titres.ass").read_text(encoding="utf-8")
    ra, rb = monter(travail_a, plan_a), monter(travail_b, plan_b)
    assert ra.ok and rb.ok, (ra.motif, rb.motif)
    image_a, image_b = mesurer_image(avec, ra.video, "a"), mesurer_image(sans, rb.video, "b")
    # Bas de l'image (ligne 900 à 1000, MarginV 100) : texte visible seulement avec le texte échappé.
    assert pixels_clairs(image_a, 880, 1000) > 200
    assert pixels_clairs(image_b, 880, 1000) < 20
    # Si la balise \an8 avait été interprétée, le texte serait en haut ; et aucune mention IA n'y est incrustée
    # (choix de l'opérateur du 01/11) : le haut reste sombre dans les deux vidéos.
    assert pixels_clairs(image_a, 20, 140) < 20 and pixels_clairs(image_b, 20, 140) < 20


def test_mesure_duree_montage_30_secondes_1080x1920(tmp_path, piste_test, capsys):
    racine, identifiant = piste_test
    travail, plan = preparer_entree(tmp_path, [10.0, 10.0, 10.0], "1080x1920", types=["png", "png", "mp4"])
    bib.preparer_musique(identifiant, travail / "entree", racine)
    plan = PlanMontage(plan.scenes, "1080x1920", avec_musique=True)
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    assert resultat.duree_video_s == pytest.approx(30.0, abs=0.3)
    with capsys.disabled():
        print(f"\n[mesure] montage 30 s en 1080x1920 : {resultat.duree_montage_s:.1f} s")


def mesurer_hors_cage(video):
    """Sonie intégrée et crête vraie lues par un ffmpeg indépendant du module testé."""
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True, timeout=120)
    resume = r.stderr[r.stderr.rindex("Summary:"):]
    return (float(re.search(r"I:\s+(-?[\d.]+) LUFS", resume).group(1)),
            float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", resume).group(1)))


@pytest.mark.parametrize("avec_musique", [False, True])
def test_montage_reel_respecte_le_standard_de_sonie_et_ecrit_controle_et_planche(tmp_path, piste_test, avec_musique,
                                                                                 capsys):
    racine, identifiant = piste_test
    travail, plan = preparer_entree(tmp_path, [3.0, 3.0], "1080x1920", types=["png", "mp4"])
    if avec_musique:
        bib.preparer_musique(identifiant, travail / "entree", racine)
        plan = PlanMontage(plan.scenes, "1080x1920", avec_musique=True)
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    lufs, dbtp = mesurer_hors_cage(resultat.video)
    assert abs(lufs - (-16.0)) <= 1.0 and dbtp <= -1.0, (lufs, dbtp)
    controle = json.loads(resultat.controle_qualite.read_text(encoding="utf-8"))
    assert controle["sonie_lufs"] == pytest.approx(lufs, abs=0.15) and controle["crete_vraie_dbtp"] <= -1.0
    assert controle["format"] == "1080x1920" and controle["debit_video_kbps"] >= 516
    assert isinstance(controle["alertes"], list) and controle["noir_initial_s"] == 0.0
    with capsys.disabled():
        print(f"\n[mesure] sonie {lufs:.1f} LUFS, crête vraie {dbtp:.1f} dBFS, "
              f"débit vidéo {controle['debit_video_kbps']} kb/s (musique : {avec_musique})")


def test_planche_de_revue_images_de_0_1_2_s_et_de_chaque_scene(tmp_path):
    travail, plan = preparer_entree(tmp_path, [1.5, 1.5], "1080x1080", types=["png", "mp4"])
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    planche = resultat.planche
    assert planche == travail / "sortie" / "planche.png" and planche.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    images = montage.indices_planche(plan)
    assert images == [0, 30, 45, 60]  # 0 s, 1 s, début de la scène 2 (1,5 s), 2 s
    flux = sonde(planche)["streams"][0]
    assert (flux["width"], flux["height"]) == (4 * 360 + 3 * 6 + 12, 360 + 12)  # 4 vignettes de 360 px en une ligne
    assert "planche.png" not in [f.name for f in (travail / "sortie").iterdir() if f.suffix == ".mp4"]


def test_planche_reduit_les_vignettes_a_360_px_de_large_et_aligne_sur_six_colonnes(tmp_path):
    travail, plan = preparer_entree(tmp_path, [1.5] * 6, "1920x1080", types=["png"] * 6)
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    # 6 scènes de 1,5 s : 0 s, 1 s, 2 s, puis les débuts de scène (0, 1,5, 3, 4,5, 6 et 7,5 s) : 8 images
    assert montage.indices_planche(plan) == [0, 30, 45, 60, 90, 135, 180, 225]
    flux = sonde(resultat.planche)["streams"][0]
    assert flux["width"] == 6 * 360 + 5 * 6 + 12 and flux["height"] == 2 * 202 + 6 + 12  # 6 colonnes, 2 lignes


@pytest.mark.skipif(shutil.which("espeak-ng") is None, reason="espeak-ng absent")
@pytest.mark.parametrize("avec_musique", [False, True])
def test_voix_de_synthese_avec_pauses_tient_la_sonie_cible(tmp_path, piste_test, avec_musique):
    """Parole réelle (silences, niveaux variables) : la sonie finale reste dans −16 ± 1 LU."""
    racine, identifiant = piste_test
    travail, plan = preparer_entree(tmp_path, [6.0, 6.0], "1080x1080", types=["png", "png"])
    for numero, texte in enumerate(["Bonjour. Bienvenue dans notre boutique. Profitez de nos nouveautés.",
                                    "Dix pour cent de réduction cette semaine. À très bientôt."], start=1):
        brut = tmp_path / f"parole-{numero}.wav"
        subprocess.run(["espeak-ng", "-v", "fr", "-s", "150", "-w", str(brut), texte], check=True, timeout=60)
        ffmpeg("-i", str(brut), "-af", "apad=whole_dur=6,volume=0.4", "-ac", "1", "-ar", "24000",
               str(travail / "entree" / f"voix-{numero:02d}.wav"))
    if avec_musique:
        bib.preparer_musique(identifiant, travail / "entree", racine)
        plan = PlanMontage(plan.scenes, "1080x1080", avec_musique=True)
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    lufs, dbtp = mesurer_hors_cage(resultat.video)
    assert abs(lufs + 16.0) <= 1.0 and dbtp <= -1.0, (lufs, dbtp)


def test_rendu_dont_la_premiere_seconde_est_noire_est_refuse(tmp_path):
    travail, plan = preparer_entree(tmp_path, [2.0, 2.0], "1080x1080", types=["png", "png"])
    ffmpeg("-f", "lavfi", "-i", "color=c=black:s=1080x1080:d=1", "-frames:v", "1", str(travail / "entree" / "scene-01.png"))
    resultat = monter(travail, plan)
    assert not resultat.ok and "noire" in resultat.motif
    assert not (travail / "sortie").exists()  # rien n'est livré


def espionner_encodages(monkeypatch):
    """Liste des arguments de chaque encodage vidéo lancé en cage (ceux qui écrivent /sortie/video.mp4)."""
    encodages = []
    reel = montage.executer

    def espion(etape, *a, **k):
        if "/sortie/video.mp4" in etape.arguments:
            encodages.append(etape.arguments)
        return reel(etape, *a, **k)
    monkeypatch.setattr(montage, "executer", espion)
    return encodages


def fond_fixe(travail, couleur="0x203040", format_sortie="1080x1080"):
    ffmpeg("-f", "lavfi", "-i", f"color=c={couleur}:s={format_sortie}:d=1", "-frames:v", "1",
           str(travail / "entree" / "scene-01.png"))


def test_clip_fixe_depasse_le_plancher_grace_a_la_seconde_passe_en_debit_constant(tmp_path, monkeypatch):
    """Un fond fixe sort à ~100 kb/s en CRF 20 : une seconde passe en débit constant 600 kb/s le remonte."""
    encodages = espionner_encodages(monkeypatch)
    travail, plan = preparer_entree(tmp_path, [4.0], "1080x1080", types=["png"])
    fond_fixe(travail)
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    assert len(encodages) == 2 and "-crf" in encodages[0] and "-crf" not in encodages[1]
    assert encodages[1][encodages[1].index("-b:v") + 1] == "600k" and "nal-hrd=cbr" in " ".join(encodages[1])
    controle = json.loads(resultat.controle_qualite.read_text(encoding="utf-8"))
    assert controle["bourrage"] is True and controle["debit_crf_kbps"] < 516
    assert 516 <= controle["debit_video_kbps"] <= 700
    video = sonde(resultat.video)
    flux = next(f for f in video["streams"] if f["codec_type"] == "video")
    assert float(flux["bit_rate"]) / 1000 == pytest.approx(controle["debit_video_kbps"], abs=2)
    assert (flux["codec_name"], flux["width"], flux["height"]) == ("h264", 1080, 1080)


def test_contenu_charge_n_est_jamais_plafonne(tmp_path, monkeypatch):
    encodages = espionner_encodages(monkeypatch)
    travail, plan = preparer_entree(tmp_path, [2.0], "1080x1080", types=["png"])  # bruit sombre : débit élevé
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    assert len(encodages) == 1 and "-crf" in encodages[0] and "-b:v" not in encodages[0]
    controle = json.loads(resultat.controle_qualite.read_text(encoding="utf-8"))
    assert controle["bourrage"] is False and controle["debit_crf_kbps"] == controle["debit_video_kbps"] >= 600


def test_le_filet_de_516_kb_s_reste_actif_si_le_debit_constant_ne_suffit_pas(tmp_path, monkeypatch):
    monkeypatch.setattr(montage, "DEBIT_CONSTANT_KBPS", 300)
    travail, plan = preparer_entree(tmp_path, [4.0], "1080x1080", types=["png"])
    fond_fixe(travail)
    resultat = monter(travail, plan)
    assert not resultat.ok and "débit" in resultat.motif and "516" in resultat.motif and resultat.motif_clair
    assert not (travail / "sortie").exists()


def test_mesure_temps_ajoute_par_la_seconde_passe(tmp_path, monkeypatch, capsys):
    """MESURE : montage seul de 15 s en 9:16 (fond fixe), avec puis sans la seconde passe."""
    durees = {}
    for nom, seuil in (("avec", 600), ("sans", 0)):
        monkeypatch.setattr(montage, "DEBIT_BOURRAGE_SEUIL_KBPS", seuil)
        travail, plan = preparer_entree(tmp_path / nom, [5.0, 5.0, 5.0], "1080x1920", types=["png"] * 3)
        for numero in (1, 2, 3):
            ffmpeg("-f", "lavfi", "-i", "color=c=0x203040:s=1080x1920:d=1", "-frames:v", "1",
                   str(travail / "entree" / f"scene-{numero:02d}.png"))
        debut = time.monotonic()
        resultat = monter(travail, plan)
        durees[nom] = time.monotonic() - debut
        assert (resultat.ok is True) == (nom == "avec"), resultat.motif  # sans bourrage, le filet refuse
    with capsys.disabled():
        print(f"\n[mesure] fond fixe 15 s en 1080x1920 : {durees['avec']:.1f} s avec la seconde passe, "
              f"{durees['sans']:.1f} s sans (refusée) ; ajout {durees['avec'] - durees['sans']:.1f} s")


def test_arguments_debit_constant_remplacent_le_crf_sans_toucher_au_reste():
    plan = plan_exemple(avec_musique=True)
    crf, cbr = construire_arguments_ffmpeg(plan), construire_arguments_ffmpeg(plan, debit_constant=True)
    assert "-crf" in crf and "-b:v" not in crf and "nal-hrd=cbr" not in " ".join(crf)
    assert "-crf" not in cbr
    for option in ("-b:v 600k", "-minrate 600k", "-maxrate 600k", "-bufsize 1200k", "-preset medium",
                   "-x264-params nal-hrd=cbr"):
        assert option in " ".join(cbr), option
    sans = [a for a in cbr if a not in ("-b:v", "600k", "-minrate", "-maxrate", "-bufsize", "1200k", "-x264-params",
                                        "nal-hrd=cbr")]
    assert sans == [a for a in crf if a not in ("-crf", "20")]


def test_voix_tardive_est_une_alerte_et_non_un_refus(tmp_path):
    travail, plan = preparer_entree(tmp_path, [3.0], "1080x1080", types=["png"])
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=400:duration=2:sample_rate=22050", "-af", "adelay=1000:all=1,volume=0.5",
           "-ac", "1", str(travail / "entree" / "voix-01.wav"))
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    alertes = json.loads(resultat.controle_qualite.read_text(encoding="utf-8"))["alertes"]
    assert any("voix démarre" in a for a in alertes), alertes


def test_sous_titres_trop_rapides_sont_une_alerte(tmp_path):
    travail, plan = preparer_entree(tmp_path, [2.0], "1080x1080", types=["png"])
    court = ASS_BASE.replace("0:00:09.00", "0:00:01.00").format(l=1080, h=1080, texte="x" * 40)  # 50 car./s
    (travail / "entree" / "sous-titres.ass").write_text(court, encoding="utf-8")
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    alertes = json.loads(resultat.controle_qualite.read_text(encoding="utf-8"))["alertes"]
    assert any("17" in a and "sous-titre" in a for a in alertes), alertes


def test_mesure_encodage_15_secondes_1080x1920(tmp_path, capsys):
    """MESURE (budget 30 min par vidéo, `fabrique/service.py`) : montage seul d'une vidéo de 15 s en 9:16."""
    travail, plan = preparer_entree(tmp_path, [5.0, 5.0, 5.0], "1080x1920", types=["png", "png", "mp4"])
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    with capsys.disabled():
        print(f"\n[mesure] montage 15 s en 1080x1920 (medium, CRF 20, loudnorm, contrôles, planche) : "
              f"{resultat.duree_montage_s:.1f} s dans la cage de montage")


# ---------------------------------------------------------------- cage : pas de bibliothèque ni de réseau


def test_cage_montage_ne_voit_ni_bibliotheque_ni_reseau(tmp_path):
    entree, sortie = tmp_path / "e", tmp_path / "s"
    entree.mkdir()
    sortie.mkdir()
    ecouteur = socket.socket()
    ecouteur.bind(("127.0.0.1", 0))
    ecouteur.listen(1)
    port = ecouteur.getsockname()[1]
    try:
        code = ("import os,socket,sys\n"
                "vu = os.path.exists('/var/lib/atelier-fabrique') or os.path.exists('/home')\n"
                "s = socket.socket(); s.settimeout(2)\n"
                "try:\n s.connect(('127.0.0.1', %d)); joint = True\nexcept OSError:\n joint = False\n"
                "sys.exit(1 if vu or joint else 0)\n" % port)
        resultat = executer(Etape("cpu", "/usr/bin/python3", ("-I", "-c", code), str(entree), str(sortie)), 30)
    finally:
        ecouteur.close()
    assert resultat.code == 0, resultat.erreur


# ---------------------------------------------------------------- bibliothèque : import


def test_import_cree_piste_flac_et_fiche(piste_test):
    racine, identifiant = piste_test
    fiche = json.loads((racine / f"{identifiant}.json").read_text(encoding="utf-8"))
    assert fiche["licence"] == "CC0" and fiche["id"] == identifiant and len(fiche["sha256"]) == 64
    infos = sonde(racine / f"{identifiant}.flac")
    assert infos["format"]["format_name"] == "flac" and len(infos["streams"]) == 1
    assert infos["streams"][0]["codec_type"] == "audio"


def test_preparer_musique_recopie_la_piste(tmp_path, piste_test):
    racine, identifiant = piste_test
    fiche = bib.preparer_musique(identifiant, tmp_path, racine)
    assert fiche["titre"] == "Fond de test"
    assert (tmp_path / "musique.flac").read_bytes() == (racine / f"{identifiant}.flac").read_bytes()
    with pytest.raises(bib.ErreurImport):
        bib.preparer_musique("../etc/passwd", tmp_path, racine)
    with pytest.raises(bib.ErreurImport):
        bib.preparer_musique("inconnue", tmp_path, racine)


def importer_piege(tmp_path, contenu: bytes, nom="piege.mp3"):
    fichier = tmp_path / nom
    fichier.write_bytes(contenu)
    with pytest.raises(bib.ErreurImport):
        bib.importer(fichier, "piege", "Piège", "Auteur", "CC0", "https://exemple.org",
                     racine=tmp_path / "bib-piege")
    assert not (tmp_path / "bib-piege" / "piege.flac").exists()


def test_import_refuse_liste_hls(tmp_path):
    importer_piege(tmp_path, b"#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n")


def test_import_refuse_fichier_concat(tmp_path):
    importer_piege(tmp_path, b"ffconcat version 1.0\nfile '/etc/passwd'\nfile '/etc/shadow'\n")


def test_import_refuse_conteneur_video(tmp_path):
    video = tmp_path / "v.mp4"
    ffmpeg("-f", "lavfi", "-i", "testsrc=s=64x64:d=1:r=10", "-f", "lavfi", "-i", "sine=d=1", "-shortest", str(video))
    importer_piege(tmp_path, video.read_bytes(), "v.mp4")


def test_import_refuse_audio_trop_long(tmp_path):
    long = tmp_path / "long.wav"
    ffmpeg("-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "601", str(long))
    importer_piege(tmp_path, long.read_bytes(), "long.wav")


@pytest.mark.parametrize("licence,attribution,reference", [
    ("", None, None), ("GPL", None, None), ("CC-BY-4.0", None, None), ("commerciale", None, None),
])
def test_import_refuse_licence_absente_ou_incomplete(tmp_path, licence, attribution, reference):
    source = tmp_path / "ok.wav"
    ffmpeg("-f", "lavfi", "-i", "sine=d=1", str(source))
    with pytest.raises(bib.ErreurImport):
        bib.importer(source, "essai", "T", "A", licence, "https://exemple.org", attribution, reference,
                     racine=tmp_path / "b")


def test_import_cc_by_avec_attribution_et_refus_doublon(tmp_path):
    source = tmp_path / "ok.wav"
    ffmpeg("-f", "lavfi", "-i", "sine=d=1", str(source))
    fiche = bib.importer(source, "essai-ccby", "T", "A", "CC-BY-4.0", "https://exemple.org", "T par A, CC BY 4.0",
                         racine=tmp_path / "b")
    assert fiche["attribution"] == "T par A, CC BY 4.0"
    with pytest.raises(bib.ErreurImport):
        bib.importer(source, "essai-ccby", "T", "A", "CC0", "https://exemple.org", racine=tmp_path / "b")
