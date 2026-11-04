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


LONG = ("Profitez de dix pour cent de réduction cette semaine seulement sur toute la collection "
        "de vêtements durables pour la famille")  # 107 caractères


def evenements(ass):
    """(début_ms, fin_ms, lignes) de chaque Dialogue d'un ASS."""
    sortie = []
    for ligne in ass.splitlines():
        if ligne.startswith("Dialogue:"):
            _, debut, fin, *_reste, texte = ligne.split(",", 9)
            sortie.append((horaire_ms(debut + "0"), horaire_ms(fin + "0"), texte.split("\\N")))
    return sortie


@pytest.mark.parametrize("format_sortie,largeur,hauteur", [
    ("1920x1080", 1920, 1080), ("1080x1920", 1080, 1920), ("1080x1080", 1080, 1080)])
def test_entete_ass_a_la_taille_reelle_du_format(format_sortie, largeur, hauteur):
    ass = st.ecrire_ass([st.Segment(0, 1000, "Bonjour")], format_sortie)
    assert f"PlayResX: {largeur}\nPlayResY: {hauteur}\n" in ass


def test_format_par_defaut_inchange_et_format_inconnu_refuse():
    assert "PlayResX: 1920\nPlayResY: 1080" in st.ecrire_ass([])
    with pytest.raises(ValueError):
        st.ecrire_ass([], "640x480")
    with pytest.raises(ValueError):
        st.ecrire_ass([], "1080x1920\nStyle: x")


@pytest.mark.parametrize("format_sortie", ["1920x1080", "1080x1920", "1080x1080"])
def test_coupe_a_42_caracteres_par_ligne_et_deux_lignes_au_plus(format_sortie):
    segment = st.Segment(1000, 9000, LONG)
    evts = evenements(st.ecrire_ass([segment], format_sortie))
    assert len(evts) >= 2  # 107 caractères ne tiennent pas dans 2 x 42
    for _, _, lignes in evts:
        assert 1 <= len(lignes) <= 2
        assert all(0 < len(ligne) <= 42 for ligne in lignes)
    # les mots sont tous là, dans l'ordre ; les durées se suivent sans trou de 1000 à 9000 ms
    assert " ".join(" ".join(lignes) for _, _, lignes in evts) == LONG
    assert evts[0][0] == 1000 and evts[-1][1] == 9000
    assert all(abs(a[1] - b[0]) <= 10 for a, b in zip(evts, evts[1:]))


def test_ligne_plus_courte_en_vertical_pour_tenir_dans_les_6_pourcent_de_cote():
    vertical = evenements(st.ecrire_ass([st.Segment(0, 5000, LONG)], "1080x1920"))
    large = evenements(st.ecrire_ass([st.Segment(0, 5000, LONG)], "1920x1080"))
    assert max(len(l) for _, _, lignes in vertical for l in lignes) <= 31
    assert len(vertical) > len(large)


def test_un_segment_court_reste_sur_une_ligne_sans_antislash():
    ass = st.ecrire_ass([st.Segment(0, 2000, "Bonjour tout le monde")], "1080x1920")
    assert "\\" not in ass.split("[Events]")[1].replace("Format:", "")


def test_mot_plus_long_que_la_ligne_est_coupe():
    evts = evenements(st.ecrire_ass([st.Segment(0, 4000, "x" * 100)], "1920x1080"))
    assert all(len(l) <= 42 for _, _, lignes in evts for l in lignes)
    assert "".join("".join(lignes) for _, _, lignes in evts) == "x" * 100


def test_alerte_au_dela_de_17_caracteres_par_seconde():
    rapide = st.ecrire_ass([st.Segment(0, 2000, "x" * 40)], "1920x1080")  # 20 car./s
    calme = st.ecrire_ass([st.Segment(0, 4000, "x" * 40)], "1920x1080")  # 10 car./s
    alertes = st.alertes_debit(rapide)
    assert len(alertes) == 1 and "17" in alertes[0]
    assert st.alertes_debit(calme) == []
    assert st.alertes_debit(st.ecrire_ass([])) == []


POLICES = Path("/opt/atelier-fabrique/polices")
pret_rendu = pytest.mark.skipif(shutil.which("ffmpeg") is None or not (POLICES / "DejaVuSans.ttf").exists(),
                                reason="ffmpeg ou polices absents")


def boite_du_texte(tmp_path, ass, largeur, hauteur):
    """Rend l'ASS sur un fond noir et rend la boîte (gauche, haut, droite, bas) des pixels clairs, en pixels."""
    fichier = tmp_path / "essai.ass"
    fichier.write_text(ass, encoding="utf-8")
    r = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
         f"color=c=black:s={largeur}x{hauteur}:d=3:r=10", "-vf",
         f"ass=filename={fichier}:fontsdir={POLICES}", "-ss", "1", "-frames:v", "1", "-pix_fmt", "gray",
         "-f", "rawvideo", "-"], capture_output=True, timeout=60)
    assert r.returncode == 0, r.stderr
    image = r.stdout
    lignes = [y for y in range(hauteur) if max(image[y * largeur:(y + 1) * largeur]) > 64]
    colonnes = [x for x in range(largeur) if max(image[x::largeur]) > 64]
    assert lignes and colonnes, "aucun texte rendu"
    return colonnes[0], lignes[0], colonnes[-1] + 1, lignes[-1] + 1


@pret_rendu
def test_9_16_texte_au_dessus_des_35_pourcent_du_bas_et_hors_zones_haute_et_laterales(tmp_path, capsys):
    ass = st.ecrire_ass([st.Segment(0, 3000, LONG)], "1080x1920")
    gauche, haut, droite, bas = boite_du_texte(tmp_path, ass, 1080, 1920)
    with capsys.disabled():
        print(f"\n[mesure] 9:16 : texte de {haut / 1920:.1%} à {bas / 1920:.1%} depuis le haut "
              f"(bas libre : {(1920 - bas) / 1920:.1%}), côtés {gauche / 1080:.1%} et {(1080 - droite) / 1080:.1%}")
    assert 1920 - bas >= 0.35 * 1920
    assert haut >= 0.14 * 1920
    assert gauche >= 0.06 * 1080 and 1080 - droite >= 0.06 * 1080


@pret_rendu
@pytest.mark.parametrize("format_sortie,largeur,hauteur", [("1920x1080", 1920, 1080), ("1080x1080", 1080, 1080)])
def test_autres_formats_texte_dans_l_image_et_au_bas(tmp_path, format_sortie, largeur, hauteur):
    ass = st.ecrire_ass([st.Segment(0, 3000, LONG)], format_sortie)
    gauche, haut, droite, bas = boite_du_texte(tmp_path, ass, largeur, hauteur)
    assert gauche >= 0.05 * largeur and largeur - droite >= 0.05 * largeur
    assert bas <= 0.95 * hauteur and haut >= 0.55 * hauteur  # sous-titres dans le bas de l'image


def test_main_et_sous_titrer_refusent_un_format_inconnu(tmp_path):
    assert st.main([str(tmp_path), str(tmp_path), "640x480"]) == 2
    wav = tmp_path / "x.wav"
    wav.write_bytes(b"RIFF")
    with pytest.raises(ValueError):
        st.sous_titrer(tmp_path / "t", wav, format_sortie="640x480")


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
        assert contenu.replace("\\N", " ") == texte  # le seul \N est la coupure de ligne posée par ecrire_ass


@pret_whisper
def test_evasion_texte_de_reference_piege_est_echappe(tmp_path, wav_essai, sans_reference):
    resultat = st.sous_titrer(tmp_path, wav_essai, PHRASE + " " + PIEGES)
    assert resultat.ok, resultat.motif
    assert resultat.aligne
    ass = resultat.ass.read_text(encoding="utf-8")
    srt = resultat.srt.read_text(encoding="utf-8")
    ass = ass.replace("\\N", " ")  # coupures de ligne posées par ecrire_ass : tout autre antislash reste interdit
    for sortie in (ass, srt):
        assert "{" not in sortie and "}" not in sortie and "\\" not in sortie and "%{" not in sortie
    # le texte piégé peut être coupé entre deux évènements : on le relit à la suite
    suite = " ".join(" ".join(lignes) for _, _, lignes in evenements(resultat.ass.read_text(encoding="utf-8")))
    assert "｛＼an8｝ ＼N ｛＼pos(0,0)｝ %｛eif:1+1:d｝ fin" in suite
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


@pret_whisper
def test_format_9_16_transmis_a_la_cage_et_coupe_a_31_caracteres(tmp_path, wav_essai):
    resultat = st.sous_titrer(tmp_path, wav_essai, PHRASE, format_sortie="1080x1920")
    assert resultat.ok, resultat.motif
    ass = resultat.ass.read_text(encoding="utf-8")
    assert "PlayResX: 1080\nPlayResY: 1920" in ass
    assert all(len(l) <= 31 for _, _, lignes in evenements(ass) for l in lignes)
