"""Tests du lot 11 : provenance IA d'une vidéo (XMP IPTC, filigrane PerTh après AAC, provenance.json).

Aucune étape GPU : le wav filigrané est produit par PerTh sur CPU à partir d'une voix espeak-ng.
Prérequis : bwrap, ffmpeg, exiftool (paquet libimage-exiftool-perl), espeak-ng, polices et
environnement voix de la fabrique.
"""

import json
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))

PYTHON_VOIX = "/opt/atelier-fabrique/venv-voix/bin/python"
for programme in ("bwrap", "ffmpeg", "exiftool", "espeak-ng"):
    if shutil.which(programme) is None:
        pytest.skip(f"{programme} absent", allow_module_level=True)
if not Path(PYTHON_VOIX).exists() or not Path("/opt/atelier-fabrique/polices/DejaVuSans.ttf").exists():
    pytest.skip("environnement voix ou polices de la fabrique absents", allow_module_level=True)

from fabrique import provenance  # noqa: E402
from fabrique.generateurs.montage import PlanMontage, SceneMontage, monter  # noqa: E402
from fabrique.tests.test_montage import preparer_entree  # noqa: E402

TRAVAIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
INFOS = provenance.InfosProvenance(
    travail=TRAVAIL, entreprise="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    voix=("synthese-chatterbox-fr",), outils={"chatterbox": "0.1.7"},
    musique={"id": "fond-test", "licence": "CC0"})

PROGRAMME_FILIGRANE = textwrap.dedent("""
    import contextlib, sys, wave
    import numpy as np
    sys.path.insert(0, sys.argv[1])
    from fabrique import perth as p
    with contextlib.redirect_stdout(sys.stderr):
        import perth
        signal, cadence = p.lire_wav_mono(sys.argv[2])
        sortie = perth.PerthImplicitWatermarker().apply_watermark(signal, watermark=None, sample_rate=cadence)
    pcm = (np.clip(sortie, -1, 1) * 32767).astype("<i2")
    with wave.open(sys.argv[3], "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(cadence); f.writeframes(pcm.tobytes())
""")


@pytest.fixture(scope="module")
def voix_filigranee(tmp_path_factory):
    """Voix espeak-ng de 6 s environ, filigranée par PerTh sur CPU ; rend (brute, filigranée)."""
    dossier = tmp_path_factory.mktemp("voix")
    brute, marquee = dossier / "brute.wav", dossier / "marquee.wav"
    subprocess.run(["espeak-ng", "-v", "fr", "-w", str(brute),
                    "Bonjour, ceci est un essai de voix de synthèse pour vérifier que le filigrane "
                    "survit au montage et à l'encodage audio compressé de la vidéo finale."],
                   check=True, timeout=60)
    script = dossier / "filigraner.py"
    script.write_text(PROGRAMME_FILIGRANE)
    r = subprocess.run([PYTHON_VOIX, "-I", str(script), str(DEPOT), str(brute), str(marquee)],
                       capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr
    return brute, marquee


def monter_video(tmp_path, voix_wav):
    travail, plan = preparer_entree(tmp_path, [6.0], format_sortie="1080x1080")
    shutil.copyfile(voix_wav, travail / "entree" / "voix-01.wav")
    resultat = monter(travail, plan)
    assert resultat.ok, resultat.motif
    return travail / "sortie" / "video.mp4", plan


def test_perth_survit_au_montage_et_a_l_aac(tmp_path, voix_filigranee):
    """MESURE : taux PerTh sur la piste audio de la vidéo finale (voix + mixage + AAC 160k à 48 kHz)."""
    _, marquee = voix_filigranee
    video, _ = monter_video(tmp_path, marquee)
    ok, motif, wav = provenance.extraire_audio(video, tmp_path)
    assert ok, motif
    detecte, taux = provenance.mesurer_perth(wav)
    print(f"\nMESURE PerTh après montage + AAC : détecté={detecte} taux={taux:.4f}")
    assert detecte and taux > 0.9


def test_poser_provenance_complet(tmp_path, voix_filigranee):
    _, marquee = voix_filigranee
    video, plan = monter_video(tmp_path, marquee)
    resultat = provenance.poser_provenance(video, plan, INFOS)
    assert resultat.ok, resultat.motif
    contenu = json.loads((video.parent / "provenance.json").read_text(encoding="utf-8"))
    assert contenu["digital_source_type"] == provenance.DIGITAL_SOURCE_TYPE
    assert "mention_visible" not in contenu and contenu["filigrane_perth"]["detecte"] is True
    assert contenu["sha256"] == provenance.empreinte_sha256(video)
    assert contenu["voix"] == ["synthese-chatterbox-fr"] and contenu["musique"]["licence"] == "CC0"
    assert contenu["outils"]["chatterbox"] == "0.1.7" and "ffmpeg" in contenu["outils"]
    # XMP relu depuis le fichier final, dans une cage neuve
    dossier = tmp_path / "relu"
    dossier.mkdir()
    xmp = provenance.lire_xmp(video, dossier)
    assert xmp["DigitalSourceType"] == provenance.DIGITAL_SOURCE_TYPE
    assert xmp["Description"] == "Contenu généré avec l'IA" and xmp["CreatorTool"] == "Atelier Marketing IA"
    # la vidéo reste lisible
    assert subprocess.run(["ffprobe", "-v", "error", str(video)], capture_output=True).returncode == 0


def test_refus_sans_filigrane(tmp_path, voix_filigranee):
    brute, _ = voix_filigranee
    video, plan = monter_video(tmp_path, brute)
    avant = provenance.empreinte_sha256(video)
    resultat = provenance.poser_provenance(video, plan, INFOS)
    assert not resultat.ok and "filigrane" in resultat.motif
    assert not (video.parent / "provenance.json").exists()
    assert provenance.empreinte_sha256(video) == avant  # vidéo d'origine inchangée


def test_refus_si_xmp_absent_a_la_relecture(tmp_path, voix_filigranee, monkeypatch):
    _, marquee = voix_filigranee
    video, plan = monter_video(tmp_path, marquee)
    monkeypatch.setattr(provenance, "lire_xmp", lambda fichier, travail: {})
    resultat = provenance.poser_provenance(video, plan, INFOS)
    assert not resultat.ok and "XMP" in resultat.motif
    assert not (video.parent / "provenance.json").exists()


def test_xmp_absent_d_une_video_non_traitee(tmp_path, voix_filigranee):
    _, marquee = voix_filigranee
    video, _ = monter_video(tmp_path, marquee)
    dossier = tmp_path / "relu"
    dossier.mkdir()
    assert provenance.lire_xmp(video, dossier).get("DigitalSourceType") is None


@pytest.mark.parametrize("modif", [
    {"travail": "pas-un-uuid"}, {"voix": ()}, {"voix": ("../etc",)}, {"entreprise": "A B"},
    {"outils": {"x": "1;rm"}}, {"musique": {"id": "a"}}, {"type": "document"},
])
def test_infos_invalides(tmp_path, modif):
    valeurs = {**INFOS.__dict__, **modif}
    plan = PlanMontage((SceneMontage(1, "png", 3.0),), "1080x1080")
    fictive = tmp_path / "video.mp4"
    fictive.write_bytes(b"x")
    with pytest.raises(ValueError):
        provenance.poser_provenance(fictive, plan, provenance.InfosProvenance(**valeurs))
