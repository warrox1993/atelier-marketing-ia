"""Tests des sous-titres (lot 8) : whisper.cpp v1.9.5 dans la cage, SRT et ASS échappé.

Le wav de test est produit par le test lui-même avec `espeak-ng` (voix française de synthèse),
car la voix du lot 7 exige torch et un GPU. Les tests de transcription demandent le binaire et le
modèle installés par scripts/installer-fabrique-whisper.sh, lisibles par le groupe
atelier-fabrique (sous une session ouverte avant l'ajout au groupe : `sg atelier-fabrique -c "pytest …"`).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique import cage  # noqa: E402
from fabrique.cage import Etape, executer  # noqa: E402
from fabrique.generateurs import sous_titres as st  # noqa: E402

PHRASE = ("Bonjour, bienvenue dans notre boutique. Aujourd'hui, nous vous présentons une nouvelle "
          "collection de vêtements durables. Profitez de dix pour cent de réduction cette semaine.")
PIEGES = r"{\an8} \N {\pos(0,0)} %{eif:1+1:d} fin"

BWRAP = shutil.which("bwrap")
ESPEAK = shutil.which("espeak-ng")
MODELE = Path(st.dossier_modele()) / "ggml-large-v3-turbo.bin"
pret_cage = pytest.mark.skipif(BWRAP is None, reason="bwrap absent")
pret_whisper = pytest.mark.skipif(
    BWRAP is None or ESPEAK is None or not Path(st.WHISPER).is_file() or not os.access(MODELE, os.R_OK),
    reason="whisper-cli, modèle (groupe atelier-fabrique : sg atelier-fabrique -c …), bwrap ou espeak-ng absent")


def horaire_ms(h):
    a, m, s, ms = re.fullmatch(r"(\d+):(\d\d):(\d\d)[,.](\d{3})", h).groups()
    return ((int(a) * 60 + int(m)) * 60 + int(s)) * 1000 + int(ms)


def blocs_srt(texte):
    return [(horaire_ms(a), horaire_ms(b), t) for a, b, t in
            re.findall(r"^\d+\n(\S+) --> (\S+)\n(.*)$", texte, re.M)]


@pytest.fixture(scope="module")
def wav_essai(tmp_path_factory):
    chemin = tmp_path_factory.mktemp("audio") / "voix.wav"
    subprocess.run([ESPEAK, "-v", "fr", "-s", "150", "-w", str(chemin), PHRASE], check=True)
    with wave.open(str(chemin)) as w:
        chemin.with_suffix(".duree").write_text(str(w.getnframes() / w.getframerate()))
    return chemin


@pytest.fixture(scope="module")
def sans_reference(tmp_path_factory, wav_essai):
    debut = time.monotonic()
    resultat = st.sous_titrer(tmp_path_factory.mktemp("sans"), wav_essai)
    resultat_duree = time.monotonic() - debut
    print(f"\n[mesure] transcription : {resultat_duree:.1f} s pour "
          f"{float(wav_essai.with_suffix('.duree').read_text()):.1f} s d'audio ; "
          f"mémoire max {resultat.memoire_max_ko / 1024:.0f} Mio ; mémoire vidéo : 0 (compilation processeur)")
    return resultat


# ---- Fonctions pures (sans cage) -------------------------------------------------------------

def test_neutralisation_retire_tous_les_caracteres_actifs():
    sur = st.neutraliser(PIEGES + "\nligne <b>deux</b>")
    for actif in "{}\\<>\n":
        assert actif not in sur
    assert "｛＼an8｝" in sur and "％{" not in sur and "%｛eif:1+1:d｝" in sur


def test_ass_et_srt_echappes_sans_balise_ni_expression_ffmpeg():
    segments = [st.Segment(0, 1500, PIEGES), st.Segment(1500, 3000, r"C:\temp\Nouveau {x}")]
    ass, srt = st.ecrire_ass(segments), st.ecrire_srt(segments)
    for sortie in (ass, srt):
        assert "{" not in sortie and "}" not in sortie and "\\" not in sortie
        assert "%{" not in sortie
    assert "｛＼an8｝ ＼N ｛＼pos(0,0)｝ %｛eif:1+1:d｝ fin" in ass
    lignes = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
    assert len(lignes) == 2 and lignes[0].startswith("Dialogue: 0,0:00:00.00,0:00:01.50,Default,,")


def test_lecture_srt_tolerante_et_fin_jamais_avant_debut():
    brut = "1\n00:00:01,000 --> 00:00:00,500\nBonjour\n\n2\n00:00:02,000 --> 00:00:03,000\n\n\n3\n00:00:03,000 --> 00:00:04,000\nsuite\n"
    segments = st.lire_srt(brut)
    assert [(s.debut_ms, s.texte) for s in segments] == [(1000, "Bonjour"), (3000, "suite")]
    assert segments[0].fin_ms > segments[0].debut_ms


def test_alignement_corrige_les_mots_sans_toucher_aux_horodatages():
    reconnus = ["Bonjour bienvenu dans notre boutique", "aujourd'hui nous vous présentons", "une nouvelle collection"]
    reference = "Bonjour, bienvenue dans notre boutique. Aujourd'hui, nous vous présentons une nouvelle collection."
    assert st.aligner_sur_reference(reconnus, reference) == [
        "Bonjour, bienvenue dans notre boutique.", "Aujourd'hui, nous vous présentons", "une nouvelle collection."]


def test_alignement_garde_le_texte_reconnu_sans_correspondance():
    assert st.aligner_sur_reference(["abc def"], "") == ["abc def"]
    assert st.aligner_sur_reference(["abc def", "ghi"], "   ") == ["abc def", "ghi"]


def test_modele_fige_identique_a_modeles_whisper_json():
    donnees = json.loads((DEPOT / "fabrique" / "modeles-whisper.json").read_text(encoding="utf-8"))
    modele = donnees["modeles"][0]
    assert (modele["nom"], modele["revision"]) == (st.MODELE_NOM, st.MODELE_REVISION)
    assert modele["fichier"]["nom"] == Path(st.MODELE_DANS_CAGE).name
    assert re.fullmatch(r"[0-9a-f]{64}", modele["fichier"]["sha256"])
    assert donnees["binaire"]["etiquette"] == "v1.9.5"


# ---- Transcription réelle dans la cage -------------------------------------------------------

@pret_whisper
def test_transcription_horodatages_croissants_et_coherents(sans_reference, wav_essai):
    assert sans_reference.ok, sans_reference.motif
    duree_ms = float(wav_essai.with_suffix(".duree").read_text()) * 1000
    blocs = blocs_srt(sans_reference.srt.read_text(encoding="utf-8"))
    assert len(blocs) >= 2 and sans_reference.segments == len(blocs)
    debuts = [b[0] for b in blocs]
    assert debuts == sorted(debuts)
    for debut, fin, texte in blocs:
        assert 0 <= debut < fin <= duree_ms + 1500, (debut, fin, duree_ms)
        assert texte.strip()
    texte_total = " ".join(b[2] for b in blocs).casefold()
    assert "bonjour" in texte_total and "boutique" in texte_total
    assert sans_reference.memoire_max_ko > 0


@pret_whisper
def test_ass_coherent_avec_le_srt(sans_reference):
    srt = blocs_srt(sans_reference.srt.read_text(encoding="utf-8"))
    ass = [l for l in sans_reference.ass.read_text(encoding="utf-8").splitlines() if l.startswith("Dialogue:")]
    assert len(ass) == len(srt)
    for (debut, fin, texte), ligne in zip(srt, ass):
        _, h1, h2, *_reste, contenu = ligne.split(",", 9)
        assert abs(horaire_ms(h1 + "0") - debut) <= 10 and 0 <= horaire_ms(h2 + "0") - fin <= 10
        assert contenu == texte


@pret_whisper
def test_evasion_texte_de_reference_piege_est_echappe(tmp_path, wav_essai, sans_reference):
    resultat = st.sous_titrer(tmp_path, wav_essai, PHRASE + " " + PIEGES)
    assert resultat.ok, resultat.motif
    assert resultat.aligne
    ass = resultat.ass.read_text(encoding="utf-8")
    srt = resultat.srt.read_text(encoding="utf-8")
    for sortie in (ass, srt):
        assert "{" not in sortie and "}" not in sortie and "\\" not in sortie and "%{" not in sortie
    assert "｛＼an8｝ ＼N ｛＼pos(0,0)｝ %｛eif:1+1:d｝ fin" in ass
    # Les mots reconnus sont corrigés par la référence ; les horodatages ne bougent pas.
    avant = [(d, f) for d, f, _ in blocs_srt(sans_reference.srt.read_text(encoding="utf-8"))]
    apres = [(d, f) for d, f, _ in blocs_srt(srt)]
    assert len(apres) == len(avant)
    assert all(abs(a[0] - b[0]) <= 120 and abs(a[1] - b[1]) <= 120 for a, b in zip(avant, apres))
    assert "dix pour cent" in " ".join(t for _, _, t in blocs_srt(srt))


# ---- Propriétés de la cage -------------------------------------------------------------------

def _sonde(tmp_path, code, montages=()):
    entree, sortie = tmp_path / "e", tmp_path / "s"
    entree.mkdir(), sortie.mkdir()
    etape = Etape(type="cpu", programme="/usr/bin/python3", arguments=("-I", "-c", code),
                  dossier_entree=str(entree), dossier_sortie=str(sortie), montages_modeles=montages,
                  hors_ligne=True)
    return executer(etape, 30)


@pret_cage
def test_la_cage_n_a_pas_de_reseau(tmp_path):
    code = ("import socket,sys\n"
            "try:\n s=socket.create_connection(('1.1.1.1',53),timeout=3)\n print('RESEAU'); sys.exit(1)\n"
            "except OSError as e:\n print('coupe',e)\n")
    resultat = _sonde(tmp_path, code)
    assert resultat.code == 0 and b"coupe" in resultat.sortie and b"RESEAU" not in resultat.sortie


@pret_whisper
def test_le_modele_est_monte_en_lecture_seule(tmp_path):
    code = ("import sys\n"
            f"m='{st.MODELE_DANS_CAGE}'\n"
            "print(len(open(m,'rb').read(16)))\n"
            "for ecriture in (lambda: open(m,'ab'), lambda: open('/modeles/whisper/intrus','w')):\n"
            " try:\n  ecriture(); print('ECRITURE'); sys.exit(1)\n"
            " except OSError as e:\n  print('refuse', e.errno)\n")
    resultat = _sonde(tmp_path, code, ((st.dossier_modele(), "/modeles/whisper"),))
    assert resultat.code == 0, resultat.erreur
    # Le fichier (0440, root) refuse l'ajout par ses droits (13) ; la création dans le dossier
    # prouve le montage en lecture seule (30 = EROFS).
    assert resultat.sortie.split() == [b"16", b"refuse", b"13", b"refuse", b"30"]


@pret_whisper
def test_wav_invalide_echoue_proprement(tmp_path):
    faux = tmp_path / "faux.wav"
    faux.write_bytes(b"ce n'est pas un fichier audio")
    (tmp_path / "t").mkdir()
    resultat = st.sous_titrer(tmp_path / "t", faux)
    assert not resultat.ok and resultat.motif


def test_refus_des_entrees_invalides(tmp_path):
    with pytest.raises(ValueError):
        st.sous_titrer(tmp_path, tmp_path / "absent.wav")
    lien = tmp_path / "lien.wav"
    lien.symlink_to("/etc/passwd")
    with pytest.raises(ValueError):
        st.sous_titrer(tmp_path, lien)
    reel = tmp_path / "a.wav"
    reel.write_bytes(b"RIFF")
    with pytest.raises(ValueError):
        st.sous_titrer(tmp_path, reel, "texte\0piégé")
    with pytest.raises(ValueError):
        st.sous_titrer(tmp_path, reel, "x" * (st.TAILLE_MAX_REFERENCE + 1))
