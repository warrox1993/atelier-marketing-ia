"""Tests des visuels animés (lot 10) : gabarits purs, puis rendu réel par HyperFrames dans la cage.

Les tests de rendu demandent ce que installe scripts/installer-fabrique-hyperframes.sh
(HyperFrames 0.8.192, chrome-headless-shell 152.0.7977.30, Node du système) et bwrap.
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique.cage import Etape, executer  # noqa: E402
from fabrique.generateurs import visuels as vis  # noqa: E402

BWRAP = shutil.which("bwrap")
FFPROBE = shutil.which("ffprobe")
FFMPEG = shutil.which("ffmpeg")
pret_rendu = pytest.mark.skipif(
    BWRAP is None or FFPROBE is None or not Path(vis.CHROME).is_file() or not Path(vis.CLI_HYPERFRAMES).is_file(),
    reason="bwrap, ffprobe, chrome-headless-shell ou HyperFrames absent (scripts/installer-fabrique-hyperframes.sh)")

GABARITS_DE_BASE = DEPOT / "fabrique" / "hyperframes" / "gabarits"
CHAMPS_VALIDES = {
    "titre_plein_ecran": {"titre": "Une saison de lancement", "sous_titre": "Tout ce qu'il faut savoir"},
    "chiffre_cle": {"chiffre": "+42 %", "titre": "de ventes en un an", "sous_titre": "Source interne"},
    "liste_3_points": {"titre": "Trois raisons", "points": ["Premier point", "Deuxième point", "Troisième point"]},
}
PIEGES = {
    "titre": "</title><script>fetch('file:///proc/self/environ')</script>",
    "sous_titre": '<img src="http://127.0.0.1:3100/x"> <script>fetch("file:///proc/self/environ")</script>',
}


def sonde(chemin: Path) -> dict:
    sortie = subprocess.run(
        [FFPROBE, "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
         "stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", str(chemin)],
        capture_output=True, check=True, timeout=60).stdout
    return json.loads(sortie)


def balises_script(page: str) -> list[str]:
    return re.findall(r"<script\b[^>]*>", page)


# ---------- fonctions pures ----------

def test_remplissage_echappe_le_texte_comme_du_html():
    modele = (GABARITS_DE_BASE / "titre_plein_ecran" / "index.html").read_text(encoding="utf-8")
    valeurs = vis.valider_champs("titre_plein_ecran", PIEGES)
    page = vis.remplir_gabarit(modele, valeurs, "1080x1920", 5)
    # Seules les deux balises script du gabarit existent ; le texte piégé est du texte.
    assert balises_script(page) == ['<script src="gsap.min.js">', '<script src="scene.js">']
    assert "&lt;/title&gt;&lt;script&gt;fetch(&#x27;file:///proc/self/environ&#x27;)&lt;/script&gt;" in page
    # Le texte de l'agent n'entre jamais dans <title> : HyperFrames y décode les entités (mesuré au lot 10),
    # ce qui rendait `</title><script>` actif ; la CSP l'avait bloqué.
    assert page.count("</title>") == 1 and "<title>Scène</title>" in page
    assert "<img" not in page
    assert "&lt;img src=&quot;http://127.0.0.1:3100/x&quot;&gt;" in page


def test_une_marque_dans_un_champ_reste_du_texte():
    modele = "<p>{{titre}}</p><p>{{sous_titre}}</p>"
    page = vis.remplir_gabarit(modele, {"titre": "{{sous_titre}}", "sous_titre": "x"}, "1080x1080", 3, csp="a")
    assert page == "<p>{{sous_titre}}</p><p>x</p>"


def test_marque_sans_valeur_refusee():
    with pytest.raises(ValueError, match="marque sans valeur"):
        vis.remplir_gabarit("{{inconnue}}", {}, "1080x1080", 3, csp="a")


def test_csp_exacte_du_cahier_et_hashes_seulement_dans_script_src():
    assert vis.CSP_EXACTE == ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                              "media-src 'self'; font-src 'self'")
    csp = vis.politique_csp(vis.lire_empreintes())
    assert len(vis.lire_empreintes()) == 3
    # Retirer les empreintes redonne la politique du cahier, mot pour mot.
    assert re.sub(r" 'sha256-[A-Za-z0-9+/]{43}='", "", csp) == vis.CSP_EXACTE
    assert "unsafe" not in csp
    modele = (GABARITS_DE_BASE / "chiffre_cle" / "index.html").read_text(encoding="utf-8")
    page = vis.remplir_gabarit(modele, vis.valider_champs("chiffre_cle", CHAMPS_VALIDES["chiffre_cle"]), "1920x1080", 5)
    assert f'<meta http-equiv="Content-Security-Policy" content="{csp}">' in page


def test_empreinte_invalide_refusee():
    with pytest.raises(ValueError):
        vis.politique_csp(("sha256-court'; script-src *",))


@pytest.mark.parametrize("gabarit", sorted(vis.GABARITS))
def test_gabarits_de_la_liste_fixe_existent(gabarit):
    for nom in ("index.html", "scene.css", "scene.js"):
        assert (GABARITS_DE_BASE / gabarit / nom).is_file()
    modele = (GABARITS_DE_BASE / gabarit / "index.html").read_text(encoding="utf-8")
    valeurs = vis.valider_champs(gabarit, CHAMPS_VALIDES[gabarit])
    for format in vis.FORMATS:
        page = vis.remplir_gabarit(modele, valeurs, format, 5)
        assert "{{" not in page
        assert f'data-width="{vis.FORMATS[format][0]}"' in page
    # Les gabarits ne portent aucune ressource externe.
    assert not re.search(r"https?://", modele)


@pytest.mark.parametrize("gabarit", ["../../x", "../gabarits/titre_plein_ecran", "/etc/passwd", "inconnu", "", "titre_plein_ecran/"])
def test_gabarit_hors_liste_refuse(tmp_path, gabarit):
    with pytest.raises(ValueError, match="gabarit inconnu"):
        vis.construire_scene(tmp_path / "scene", gabarit, {"titre": "x"}, "1080x1080", 3)
    assert not (tmp_path / "scene").exists()
    with pytest.raises(ValueError, match="gabarit inconnu"):
        vis.rendre_scene(tmp_path, gabarit, {"titre": "x"}, "1080x1080", 3)


@pytest.mark.parametrize("champs", [
    {"titre": "x" * 121},
    {"titre": ""},
    {"titre": "   \n "},
    {"titre": "ok", "sous_titre": "x" * 201},
    {"titre": "ok", "html": "<b>x</b>"},
    {"titre": 12},
    {"titre": "a\0b"},
    {},
])
def test_champs_invalides_refuses(champs):
    with pytest.raises(ValueError):
        vis.valider_champs("titre_plein_ecran", champs)


def test_limites_chiffre_et_points():
    assert vis.valider_champs("chiffre_cle", {"chiffre": "x" * 20, "titre": "t"})["chiffre"] == "x" * 20
    with pytest.raises(ValueError):
        vis.valider_champs("chiffre_cle", {"chiffre": "x" * 21, "titre": "t"})
    with pytest.raises(ValueError):
        vis.valider_champs("liste_3_points", {"titre": "t", "points": ["a", "b"]})
    with pytest.raises(ValueError):
        vis.valider_champs("liste_3_points", {"titre": "t", "points": ["a", "b", "x" * 121]})
    assert vis.valider_champs("liste_3_points", {"titre": "t", "points": ["a", "b", "x" * 120]})["point_3"] == "x" * 120


def test_saut_de_ligne_et_controles_deviennent_des_espaces():
    assert vis.valider_champs("titre_plein_ecran", {"titre": "a\n\tb\x1bc d"})["titre"] == "a b c d"


@pytest.mark.parametrize("format,duree", [("1920x1081", 5), ("", 5), ("1080x1920", 0), ("1080x1920", 61), ("1080x1920", "5"), ("1080x1920", True)])
def test_format_et_duree_invalides(format, duree):
    with pytest.raises(ValueError):
        vis.valider_format_duree(format, duree)


def test_scene_construite_sans_ressource_externe(tmp_path):
    scene = vis.construire_scene(tmp_path / "scene", "liste_3_points", CHAMPS_VALIDES["liste_3_points"], "1080x1920", 5)
    assert sorted(p.name for p in scene.iterdir()) == ["base.css", "gsap.min.js", "index.html", "polices", "scene.css", "scene.js"]
    assert sorted(p.name for p in (scene / "polices").iterdir()) == ["DejaVuSans-Bold.ttf", "DejaVuSans.ttf"]
    tout = "".join(p.read_text(encoding="utf-8") for p in (scene / "index.html", scene / "base.css", scene / "scene.css", scene / "scene.js"))
    assert not re.search(r"https?://", tout)
    with pytest.raises(FileExistsError):
        vis.construire_scene(scene, "liste_3_points", CHAMPS_VALIDES["liste_3_points"], "1080x1920", 5)


# ---------- rendu réel dans la cage ----------

@pret_rendu
def test_rendu_5_s_en_cage_mp4_lisible_et_mesures(tmp_path):
    r = vis.rendre_scene(tmp_path, "liste_3_points", CHAMPS_VALIDES["liste_3_points"], "1080x1920", 5)
    assert r.ok, (r.motif, r.journal[-800:])
    infos = sonde(r.video)
    flux = infos["streams"][0]
    assert (flux["codec_name"], flux["width"], flux["height"], flux["r_frame_rate"]) == ("h264", 1080, 1920, "30/1")
    assert flux["nb_read_frames"] == "150"
    assert abs(float(infos["format"]["duration"]) - 5.0) < 0.1
    # Aucun script bloqué par la politique CSP : seuls les trois scripts du moteur (empreintes) s'exécutent.
    assert "Executing inline script violates" not in r.journal
    print(f"\nMESURE rendu 5 s (1080x1920, 30 i/s) : {r.duree_s:.1f} s mur ; plus gros processus : {r.memoire_max_ko / 1024:.0f} Mio")
    assert r.duree_s < 120
    assert 0 < r.memoire_max_ko < 4 * 1024**2


@pret_rendu
@pytest.mark.parametrize("gabarit,format", [("titre_plein_ecran", "1920x1080"), ("chiffre_cle", "1080x1080"), ("liste_3_points", "1920x1080")])
def test_rendu_des_autres_gabarits_et_formats(tmp_path, gabarit, format):
    r = vis.rendre_scene(tmp_path, gabarit, CHAMPS_VALIDES[gabarit], format, 2)
    assert r.ok, (r.motif, r.journal[-800:])
    flux = sonde(r.video)["streams"][0]
    assert (flux["width"], flux["height"], flux["r_frame_rate"], flux["nb_read_frames"]) == (*vis.FORMATS[format], "30/1", "60")


def image_en_gris(video: Path, instant_s: float) -> bytes:
    return subprocess.run(
        [FFMPEG, "-v", "error", "-ss", str(instant_s), "-i", str(video), "-frames:v", "1", "-vf", "scale=270:480,format=gray",
         "-f", "rawvideo", "-"], capture_output=True, check=True, timeout=60).stdout


@pret_rendu
def test_evasion_champs_pieges_affiches_comme_texte_sans_requete(tmp_path):
    champs = {"titre": PIEGES["titre"], "sous_titre": PIEGES["sous_titre"]}
    r = vis.rendre_scene(tmp_path, "titre_plein_ecran", champs, "1080x1920", 3)
    assert r.ok, (r.motif, r.journal[-800:])
    page = (r.video.parent / "entree" / "scene" / "index.html").read_text(encoding="utf-8")
    assert balises_script(page) == ['<script src="gsap.min.js">', '<script src="scene.js">']
    assert "<img" not in page and "</title><script>" not in page
    # Rien ne s'est exécuté ni n'a été demandé : aucune violation de la politique, aucune erreur réseau.
    assert "violates" not in r.journal.replace("Applying inline style violates", "")
    assert not re.search(r"ERR_[A-Z_]+|ECONNREFUSED|EAI_AGAIN|127\.0\.0\.1:3100", r.journal)
    # Le texte piégé est bien dessiné (pixels sombres sur le fond clair), pas absent.
    pixels = image_en_gris(r.video, 2.5)
    sombres = sum(1 for p in pixels if p < 100)
    assert sombres > 1500, sombres


@pret_rendu
def test_la_csp_bloque_un_script_en_ligne_injecte(tmp_path, monkeypatch):
    """Preuve que les empreintes n'ouvrent QUE les trois scripts du moteur : un script glissé est refusé."""
    original = vis.remplir_gabarit

    def piege(*args, **kwargs):
        return original(*args, **kwargs).replace("</body>", "<script>document.title='injecte'</script></body>")

    monkeypatch.setattr(vis, "remplir_gabarit", piege)
    r = vis.rendre_scene(tmp_path, "titre_plein_ecran", CHAMPS_VALIDES["titre_plein_ecran"], "1080x1080", 2)
    assert r.ok, (r.motif, r.journal[-800:])
    assert "Executing inline script violates" in r.journal


@pret_rendu
def test_cage_sans_reseau_ni_acces_aux_fichiers_de_l_hote(tmp_path):
    entree, sortie = tmp_path / "e", tmp_path / "s"
    entree.mkdir()
    sortie.mkdir()
    programme = ("import socket,sys\n"
                 "try:\n    socket.create_connection(('127.0.0.1', 3100), 2); print('RESEAU')\n"
                 "except OSError: print('hors-ligne')\n"
                 "import os; print(os.path.exists('/home'), os.path.exists('/proc/1/environ'))\n")
    (entree / "t.py").write_text(programme)
    r = executer(Etape(type="cpu", programme="/usr/bin/python3", arguments=("-I", "/entree/t.py"),
                       dossier_entree=str(entree), dossier_sortie=str(sortie)), 30)
    assert r.code == 0, r.erreur
    assert r.sortie.decode().split()[:2] == ["hors-ligne", "False"]


@pret_rendu
def test_mesure_chrome_exige_no_sandbox_sous_bwrap(tmp_path):
    """MESURE du §6.4 : le bac à sable de Chrome est refusé sous bwrap ; --no-sandbox est nécessaire."""
    entree, sortie = tmp_path / "e", tmp_path / "s"
    entree.mkdir()
    sortie.mkdir()

    def lancer(*options):
        return executer(Etape(type="cpu", programme=vis.CHROME, arguments=(*options, "--dump-dom", "about:blank"),
                              dossier_entree=str(entree), dossier_sortie=str(sortie)), 60,
                        memoire_octets=vis.MEMOIRE_CAGE_OCTETS, processus_max=vis.PROCESSUS_MAX_CAGE)

    avec_bac = lancer()
    assert avec_bac.code != 0 and b"No usable sandbox" in avec_bac.erreur
    sans_bac = lancer("--no-sandbox", "--disable-gpu")
    assert sans_bac.code == 0 and b"<html>" in sans_bac.sortie
