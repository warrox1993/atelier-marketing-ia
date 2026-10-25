"""Tests du lot 9 : montage vidéo ffmpeg en cage, bibliothèque musicale, évasions.

Prérequis : bwrap, ffmpeg, ffprobe et les polices installées par
`sudo scripts/installer-fabrique-montage.sh` (/opt/atelier-fabrique/polices).
"""

import json
import shutil
import socket
import subprocess
import sys
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
        if genre == "png":
            ffmpeg("-f", "lavfi", "-i", f"color=c=0x203040:s=640x360:d=1", "-frames:v", "1", str(entree / nom))
        else:
            ffmpeg("-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=0.5", "-pix_fmt", "yuv420p", str(entree / nom))
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
    assert texte.count("fontsdir=/opt/atelier-fabrique/polices") == 2
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


def test_mention_ass_texte_fixe_et_police(tmp_path):
    chemin = montage.ecrire_mention_ass(tmp_path, 1080, 1920, 30.0)
    contenu = chemin.read_text(encoding="utf-8")
    assert "Contenu généré avec l'IA" in contenu and "DejaVu Sans" in contenu
    assert "0:00:31.00" in contenu  # permanente : toute la vidéo plus une seconde


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
    # Si la balise \an8 avait été interprétée, le texte serait en haut : rien d'autre qu'un bandeau de mention.
    # La mention permanente est bien lisible en haut dans les deux vidéos.
    assert pixels_clairs(image_a, 20, 140) > 500 and pixels_clairs(image_b, 20, 140) > 500


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
                f"s = socket.socket(); s.settimeout(2)\n"
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
