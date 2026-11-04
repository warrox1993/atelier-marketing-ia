"""Tests de l'outil d'images (lot I1) : validations, échappement, registre des chartes, puis rendu réel en cage.

Les tests de rendu demandent ce que installe scripts/installer-fabrique-hyperframes.sh (chrome-headless-shell
152.0.7977.30 figé), DejaVu Sans (police de repli, scripts/installer-fabrique-montage.sh), bwrap et exiftool. Les
polices OFL des images sont lues dans le dépôt (fabrique/polices/, figées par empreinte dans scripts/installer-fabrique.sh). Comme ceux de test_visuels.py, ils sont ignorés si ces prérequis manquent.
"""

import hashlib
import json
import re
import shutil
import struct
import sys
import zlib
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique import registre_charte  # noqa: E402
from fabrique.generateurs import images, visuels  # noqa: E402

GABARITS_IMAGES = DEPOT / "fabrique" / "hyperframes" / "gabarits-images"
POLICES_DEPOT = DEPOT / "fabrique" / "polices"
INSTALLEUR = DEPOT / "scripts" / "installer-fabrique.sh"
POLICES = sorted(registre_charte.POLICES_AUTORISEES)
pret_rendu = pytest.mark.skipif(
    shutil.which("bwrap") is None or shutil.which("exiftool") is None or not Path(images.CHROME).is_file()
    or not all(Path(p).is_file() for p in visuels.POLICES),
    reason="bwrap, exiftool, chrome-headless-shell ou polices absents (scripts/installer-fabrique-hyperframes.sh)")

CHAMPS_VALIDES = {
    "accroche": {"titre": "Une saison de lancement", "sous_titre": "Tout ce qu'il faut savoir", "appel_action": "Découvrir",
                 "mentions_legales": "Offre valable jusqu'au 31 décembre."},
    "chiffre_cle": {"chiffre": "+42 %", "titre": "de ventes en un an", "sous_titre": "Source interne",
                    "mentions_legales": "Chiffres 2025."},
    "liste_3_points": {"titre": "Trois raisons", "points": ["Premier point", "Deuxième point", "Troisième point"],
                       "appel_action": "En savoir plus", "mentions_legales": "Mentions."},
    "offre": {"titre": "Menu de saison", "appel_action": "Réserver", "chiffre": "-20 %", "sous_titre": "Jusqu'à dimanche",
              "mentions_legales": "Sur présentation de ce visuel."},
}
PLAFONDS = {"titre": 90, "sous_titre": 160, "chiffre": 20, "appel_action": 30, "mentions_legales": 200, "point": 80}
PALIERS_M = {"palier_titre": "m", "palier_chiffre": "m", "palier_sous": "g", "palier_points": "g", "palier_charge": "g"}
FORMATS = ["1080x1080", "1080x1350", "1440x1800", "1080x1920", "1200x628"]


# ---------- validation des demandes ----------

@pytest.mark.parametrize("gabarit,champs", CHAMPS_VALIDES.items())
def test_les_champs_valides_passent(gabarit, champs):
    valeurs = images.valider_champs(gabarit, champs)
    assert valeurs["titre"] == champs["titre"]


def test_gabarit_inconnu_refuse():
    with pytest.raises(ValueError, match="gabarit inconnu"):
        images.valider_champs("../accroche", {"titre": "x"})


def test_champ_inconnu_refuse():
    with pytest.raises(ValueError, match="champs inconnus"):
        images.valider_champs("accroche", {"titre": "x", "chiffre": "1"})  # chiffre n'existe pas dans accroche
    with pytest.raises(ValueError, match="champs inconnus"):
        images.valider_champs("accroche", {"titre": "x", "couleur": "#ff0000"})


def test_champ_obligatoire_manquant_refuse():
    with pytest.raises(ValueError, match="champs manquants"):
        images.valider_champs("offre", {"titre": "x"})
    with pytest.raises(ValueError, match="champs manquants"):
        images.valider_champs("chiffre_cle", {"chiffre": "1"})


@pytest.mark.parametrize("gabarit,champ", [(g, c) for g, champs in CHAMPS_VALIDES.items() for c in champs if c != "points"])
def test_le_plafond_est_accepte_et_plafond_plus_un_refuse(gabarit, champ):
    champs = dict(CHAMPS_VALIDES[gabarit])
    champs[champ] = "W" * PLAFONDS[champ]
    assert images.valider_champs(gabarit, champs)[champ] == "W" * PLAFONDS[champ]
    champs[champ] = "W" * (PLAFONDS[champ] + 1)
    with pytest.raises(ValueError, match=champ):
        images.valider_champs(gabarit, champs)


def test_points_exactement_trois_et_plafonnes():
    base = CHAMPS_VALIDES["liste_3_points"]
    for mauvais in (["a", "b"], ["a", "b", "c", "d"], "abc", [1, 2, 3], ["a", "b", ""]):
        with pytest.raises(ValueError):
            images.valider_champs("liste_3_points", {**base, "points": mauvais})
    assert images.valider_champs("liste_3_points", {**base, "points": ["W" * 80] * 3})["point_3"] == "W" * 80
    with pytest.raises(ValueError, match="point 2"):
        images.valider_champs("liste_3_points", {**base, "points": ["a", "W" * 81, "c"]})


def test_format_inconnu_et_1200x627_refuses():
    for mauvais in ("1200x627", "1440x2560", "1920x1080", "100x100", "1080x1080 ", 1080, None):
        with pytest.raises(ValueError, match="format inconnu"):
            images.valider_format(mauvais)
    assert images.valider_format("1200x628") == (1200, 628)
    assert [images.valider_format(f) for f in FORMATS] == [tuple(map(int, f.split("x"))) for f in FORMATS]


def test_les_cinq_formats_sont_exactement_ceux_du_plan():
    assert sorted(images.FORMATS_IMAGE) == sorted(FORMATS)


# ---------- échappement ----------

PIEGES = {
    "titre": "</title><script>fetch('file:///proc/self/environ')</script>",
    "sous_titre": '<img src="http://203.0.113.9/x"> "guillemets" {{titre}} {{csp}}',
    "mentions_legales": "<style>body{display:none}</style>",
}


def test_le_texte_de_l_agent_reste_du_texte():
    modele = (GABARITS_IMAGES / "accroche" / "index.html").read_text(encoding="utf-8")
    valeurs = images.valider_champs("accroche", PIEGES)
    page = images.remplir_gabarit(modele, valeurs, "1080x1080", PALIERS_M)
    assert re.findall(r"<script\b", page) == []
    assert "<img" not in page and "<style" not in page
    assert "&lt;/title&gt;&lt;script&gt;" in page and "&lt;img src=&quot;http://203.0.113.9/x&quot;&gt;" in page
    assert "{{titre}} {{csp}}" in page  # une marque dans un champ n'est jamais remplacée (une seule passe)
    assert page.count("</title>") == 1


def test_une_marque_dans_un_champ_reste_du_texte():
    page = images.remplir_gabarit("<p>{{titre}}</p><p>{{sous_titre}}</p>", {"titre": "{{sous_titre}}", "sous_titre": "x"},
                                  "1080x1080", PALIERS_M, csp="a")
    assert page == "<p>{{sous_titre}}</p><p>x</p>"


def test_marque_sans_valeur_est_une_erreur():
    with pytest.raises(ValueError, match="marque sans valeur"):
        images.remplir_gabarit("{{inconnue}}", {}, "1080x1080", PALIERS_M, csp="a")


def test_la_csp_interdit_les_scripts_et_tout_ce_qui_sort():
    assert images.CSP_IMAGE == ("default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'")
    for gabarit in CHAMPS_VALIDES:
        modele = (GABARITS_IMAGES / gabarit / "index.html").read_text(encoding="utf-8")
        page = images.remplir_gabarit(modele, images.valider_champs(gabarit, CHAMPS_VALIDES[gabarit]), "1080x1080", PALIERS_M)
        assert "script-src 'none'" in page
        assert "<script" not in page and "http://" not in page and "https://" not in page


@pytest.mark.parametrize("gabarit", CHAMPS_VALIDES)
def test_les_gabarits_ne_contiennent_aucun_tiret_cadratin_ni_script_ni_url(gabarit):
    for nom in ("index.html", "scene.css"):
        texte = (GABARITS_IMAGES / gabarit / nom).read_text(encoding="utf-8")
        assert chr(0x2014) not in texte and chr(0x2013) not in texte and "@import" not in texte  # tirets cadratin et demi-cadratin
        assert not re.search(r"https?://|<script", texte)


def test_paliers_de_demande():
    valeurs = images.valider_champs("liste_3_points", {"titre": "T", "points": ["a", "W" * 29, "c"]})
    assert images.paliers_de(valeurs) == {"palier_titre": "g", "palier_chiffre": "g", "palier_sous": "g", "palier_points": "p",
                                          "palier_charge": "g"}
    valeurs = images.valider_champs("offre", {"titre": "W" * 60, "appel_action": "a", "chiffre": "W" * 5, "sous_titre": "W" * 51})
    assert images.paliers_de(valeurs) == {"palier_titre": "p", "palier_chiffre": "m", "palier_sous": "p", "palier_points": "g",
                                          "palier_charge": "p"}


def test_un_texte_secondaire_charge_reduit_le_titre_et_la_page():
    """Le grand titre n'est permis que si le reste est léger : la charge (texte secondaire, moitié des mentions, titre et
    chiffre pondérés) plafonne le palier du titre et pose le palier de densité de la page."""
    def paliers(**champs):
        return images.paliers_de(images.valider_champs("accroche", {"titre": "Court", **champs}))
    assert (paliers()["palier_titre"], paliers()["palier_charge"]) == ("g", "g")
    moyen = paliers(sous_titre="s" * 150, appel_action="a" * 30)
    assert (moyen["palier_titre"], moyen["palier_charge"]) == ("m", "m")
    lourd = paliers(sous_titre="s" * 160, appel_action="a" * 30, mentions_legales="m" * 200)
    assert (lourd["palier_titre"], lourd["palier_charge"]) == ("p", "p")
    # Un gros chiffre charge la page autant qu'un long sous-titre.
    assert images.paliers_de(images.valider_champs("offre", {"titre": "Court", "appel_action": "a", "chiffre": "W" * 20}))[
        "palier_charge"] == "m"
    # La charge ne fait jamais grandir un titre long.
    assert images.paliers_de(images.valider_champs("accroche", {"titre": "T" * 90}))["palier_titre"] == "p"


def test_paliers_de_taille():
    (g, _), (m, _), _ = images.PALIERS_TITRE
    assert [images.palier(t, images.PALIERS_TITRE) for t in ("W" * g, "W" * (g + 1), "W" * m, "W" * (m + 1), "W" * 90)] == \
        ["g", "m", "m", "p", "p"]
    assert [images.palier(t, images.PALIERS_CHIFFRE) for t in ("42", "W" * 4, "+42 %", "W" * 5, "W" * 8, "W" * 9, "W" * 20)] == \
        ["g", "g", "g", "m", "m", "p", "p"]
    # Un titre réel, plus étroit que des « W », reste à un palier plus grand à longueur égale.
    reel = "Le goût du terroir, à portée de main"
    assert (images.palier(reel, images.PALIERS_TITRE), images.palier("W" * len(reel), images.PALIERS_TITRE)) == ("m", "p")


def test_la_largeur_compte_le_w_pour_un_et_l_inconnu_pour_plus():
    assert images.largeur("W" * 10) == 10
    assert images.largeur("il") < images.largeur("mm") < 2.01
    assert images.largeur("\u4e2d") == images.LARGEUR_INCONNUE > max(images.LARGEURS.values())
    assert images.largeur(" ") == images.largeur("\u00a0") >= 0.7  # couvre la place perdue en fin de ligne


def test_la_table_des_largeurs_majore_les_polices():
    """Chaque largeur de la table est au moins celle du caractère rapporté au « W », dans chaque police et chaque
    réglage employés (graisses et chasses de base.css)."""
    ttlib = pytest.importorskip("fontTools.ttLib")
    instancer = pytest.importorskip("fontTools.varLib.instancer")
    polices = [(registre_charte.ARCHIVO, {"wght": w, "wdth": c}) for w in (400, 640, 780, 820) for c in (84, 100)]
    polices += [(registre_charte.SOURCE_SERIF, {"wght": w, "opsz": o}) for w in (620, 640) for o in (8, 20, 60)]
    polices += [(chemin, None) for chemin in visuels.POLICES if Path(chemin).is_file()]
    for chemin, axes in polices:
        police = ttlib.TTFont(chemin)
        if axes:
            police = instancer.instantiateVariableFont(police, axes)
        cmap, chasses = police.getBestCmap(), police["hmtx"].metrics
        w = chasses[cmap[ord("W")]][0]
        for caractere, valeur in images.LARGEURS.items():
            if ord(caractere) in cmap:
                assert chasses[cmap[ord(caractere)]][0] / w <= valeur + 1e-9, (Path(chemin).name, axes, caractere)


# ---------- polices ----------

def empreintes_de_l_installeur() -> dict[str, str]:
    """{chemin sous fabrique/polices : sha256} lus dans la liste EMPREINTES_POLICES de l'installeur."""
    bloc = re.search(r"^EMPREINTES_POLICES=\(\n(.*?)^\)", INSTALLEUR.read_text(encoding="utf-8"), re.S | re.M)
    assert bloc, "liste EMPREINTES_POLICES absente de scripts/installer-fabrique.sh"
    lignes = re.findall(r'^ *"([0-9a-f]{64})  ([A-Za-z0-9._/-]+)"$', bloc.group(1), re.M)
    assert len(lignes) == len(bloc.group(1).strip().splitlines()), "ligne illisible dans EMPREINTES_POLICES"
    return {nom: empreinte for empreinte, nom in lignes}


def test_les_polices_du_depot_sont_exactement_celles_de_l_installeur_avec_leur_empreinte():
    attendues = empreintes_de_l_installeur()
    presentes = {p.relative_to(POLICES_DEPOT).as_posix() for p in POLICES_DEPOT.rglob("*") if p.is_file()}
    assert presentes == set(attendues)
    for nom, empreinte in attendues.items():
        assert hashlib.sha256((POLICES_DEPOT / nom).read_bytes()).hexdigest() == empreinte, nom
    for famille in {Path(nom).parent for nom in attendues}:  # chaque famille garde sa licence
        assert "SIL Open Font License, Version 1.1" in (POLICES_DEPOT / famille / "OFL.txt").read_text(encoding="utf-8")


def test_les_polices_autorisees_viennent_du_depot_ou_de_dejavu():
    assert {"dejavu-sans", "archivo", "source-serif"} == set(registre_charte.POLICES_AUTORISEES)
    for identifiant, faces in registre_charte.POLICES_AUTORISEES.items():
        assert {famille for famille, *_ in faces} == {"Titre", "Texte"}, identifiant
        for _famille, graisses, etirement, chemin in faces:
            assert re.fullmatch(r"\d{3}( \d{3})?", graisses) and re.fullmatch(r"\d{2,3}%( \d{2,3}%)?", etirement)
            assert chemin in visuels.POLICES or (Path(chemin).parent.parent == POLICES_DEPOT and Path(chemin).is_file())


@pytest.mark.parametrize("police", POLICES)
def test_la_scene_declare_titre_texte_et_repli_et_copie_leurs_fichiers(tmp_path, police):
    charte = registre_charte.Charte("c", "#ffffff", "#111111", "#1f4e8c", "#ffffff", police)
    scene = images.construire_scene(tmp_path / "s", "accroche", CHAMPS_VALIDES["accroche"], "1080x1080", charte)
    feuille = (scene / "charte.css").read_text(encoding="utf-8")
    for famille in ("Titre", "Texte", "Repli"):
        assert f'font-family: "{famille}"' in feuille
    for nom in re.findall(r'url\("polices/([^"]+)"\)', feuille):
        assert (scene / "polices" / nom).is_file()
    assert f'data-police="{police}"' in (scene / "index.html").read_text(encoding="utf-8")


def test_la_charte_d_exemple_du_depot_est_acceptee_par_le_registre(tmp_path):
    (tmp_path / "acme").mkdir()
    cible = tmp_path / "acme" / "sobre.json"
    shutil.copyfile(DEPOT / "fabrique" / "chartes-exemple" / "sobre.json", cible)
    cible.chmod(0o640)
    charte = registre_charte.resoudre("sobre", "acme", tmp_path)
    assert charte.police in registre_charte.POLICES_AUTORISEES and charte.logo is None


# ---------- registre des chartes ----------

def png_octets(largeur, hauteur, *, type_couleur=2, signature=b"\x89PNG\r\n\x1a\n", complement=0):
    """PNG minimal valide (une seule couleur) aux dimensions annoncées ; `complement` octets de remplissage."""
    def bloc(nom, donnees):
        return struct.pack(">I", len(donnees)) + nom + donnees + struct.pack(">I", zlib.crc32(nom + donnees))
    canaux = {0: 1, 2: 3, 4: 2, 6: 4}[type_couleur]
    ligne = b"\x00" + b"\xcc" * (largeur * canaux)
    brut = zlib.compress(ligne * min(hauteur, 4))  # la taille réelle ne compte pas pour le contrôle d'en-tête
    ihdr = struct.pack(">IIBBBBB", largeur, hauteur, 8, type_couleur, 0, 0, 0)
    return signature + bloc(b"IHDR", ihdr) + bloc(b"IDAT", brut) + bloc(b"IEND", b"") + b"\0" * complement


CHARTE_VALIDE = {"id": "ma-charte", "couleurs": {"fond": "#F4F1EA", "texte": "#1C1B19", "accent": "#8A3B12"},
                 "police": "dejavu-sans", "logo": "logo.png"}


@pytest.fixture
def chartes(tmp_path):
    dossier = tmp_path / "chartes-autorisees"
    (dossier / "acme").mkdir(parents=True)

    def ecrire(contenu=None, logo=None, identifiant="ma-charte"):
        donnees = dict(CHARTE_VALIDE if contenu is None else contenu)
        (dossier / "acme" / f"{identifiant}.json").write_text(json.dumps(donnees), encoding="utf-8")
        if logo is not None:
            (dossier / "acme" / "logo.png").write_bytes(logo)
        for fichier in (dossier / "acme").iterdir():
            fichier.chmod(0o640)  # le registre refuse un fichier modifiable par le groupe ou les autres
        return dossier

    ecrire.dossier = dossier
    return ecrire


def test_une_charte_valide_est_resolue(chartes):
    dossier = chartes(logo=png_octets(300, 120))
    charte = registre_charte.resoudre("ma-charte", "acme", dossier)
    assert (charte.fond, charte.texte, charte.accent, charte.police) == ("#f4f1ea", "#1c1b19", "#8a3b12", "dejavu-sans")
    assert charte.logo is not None and charte.logo[:8] == b"\x89PNG\r\n\x1a\n"
    assert charte.texte_accent in (charte.fond, charte.texte)


def test_une_charte_sans_logo_est_permise(chartes):
    donnees = {k: v for k, v in CHARTE_VALIDE.items() if k != "logo"}
    assert registre_charte.resoudre("ma-charte", "acme", chartes(donnees)).logo is None


@pytest.mark.parametrize("identifiant", ["../ma-charte", "Ma-Charte", "ma charte", "", "a" * 65, None, 5, "ma-charte/../x"])
def test_identifiant_de_charte_invalide_refuse(chartes, identifiant):
    with pytest.raises(registre_charte.CharteRefusee):
        registre_charte.resoudre(identifiant, "acme", chartes(logo=png_octets(10, 10)))


def test_charte_hors_registre_refusee(chartes):
    with pytest.raises(registre_charte.CharteRefusee, match="inconnue"):
        registre_charte.resoudre("autre", "acme", chartes(logo=png_octets(10, 10)))


def test_charte_d_une_autre_entreprise_refusee(chartes):
    dossier = chartes(logo=png_octets(10, 10))
    with pytest.raises(registre_charte.CharteRefusee, match="inconnue"):
        registre_charte.resoudre("ma-charte", "autre", dossier)
    with pytest.raises(registre_charte.CharteRefusee, match="entreprise"):
        registre_charte.resoudre("ma-charte", "../acme", dossier)


@pytest.mark.parametrize("couleur", ["red", "#fff", "#12345", "#1234567", "#GGGGGG", "rgb(0,0,0)", "#ffffff;}body{", "#ffffff\n", "", None, 7])
def test_couleur_hors_motif_refusee(chartes, couleur):
    donnees = {**CHARTE_VALIDE, "couleurs": {**CHARTE_VALIDE["couleurs"], "accent": couleur}}
    with pytest.raises(registre_charte.CharteRefusee, match="couleur"):
        registre_charte.resoudre("ma-charte", "acme", chartes(donnees, logo=png_octets(10, 10)))


def test_champs_inconnus_ou_manquants_refuses(chartes):
    logo = png_octets(10, 10)
    with pytest.raises(registre_charte.CharteRefusee, match="champs inconnus"):
        registre_charte.resoudre("ma-charte", "acme", chartes({**CHARTE_VALIDE, "url": "http://x"}, logo=logo))
    sans_police = {k: v for k, v in CHARTE_VALIDE.items() if k != "police"}
    with pytest.raises(registre_charte.CharteRefusee, match="police"):
        registre_charte.resoudre("ma-charte", "acme", chartes(sans_police, logo=logo))
    sans_accent = {**CHARTE_VALIDE, "couleurs": {"fond": "#ffffff", "texte": "#000000"}}
    with pytest.raises(registre_charte.CharteRefusee, match="couleurs"):
        registre_charte.resoudre("ma-charte", "acme", chartes(sans_accent, logo=logo))


def test_identifiant_du_fichier_et_de_la_charte_doivent_concorder(chartes):
    with pytest.raises(registre_charte.CharteRefusee, match="id"):
        registre_charte.resoudre("ma-charte", "acme", chartes({**CHARTE_VALIDE, "id": "autre"}, logo=png_octets(10, 10)))


def test_police_hors_liste_refusee(chartes):
    with pytest.raises(registre_charte.CharteRefusee, match="police"):
        registre_charte.resoudre("ma-charte", "acme", chartes({**CHARTE_VALIDE, "police": "comic-sans"}, logo=png_octets(10, 10)))
    with pytest.raises(registre_charte.CharteRefusee, match="police"):
        registre_charte.resoudre("ma-charte", "acme", chartes({**CHARTE_VALIDE, "police": "/usr/share/fonts/x.ttf"}))


def test_contraste_insuffisant_refuse(chartes):
    pale = {**CHARTE_VALIDE, "couleurs": {"fond": "#ffffff", "texte": "#cccccc", "accent": "#8a3b12"}}
    with pytest.raises(registre_charte.CharteRefusee, match="contraste"):
        registre_charte.resoudre("ma-charte", "acme", chartes(pale, logo=png_octets(10, 10)))
    accent_pale = {**CHARTE_VALIDE, "couleurs": {"fond": "#ffffff", "texte": "#000000", "accent": "#eeeeee"}}
    with pytest.raises(registre_charte.CharteRefusee, match="contraste"):
        registre_charte.resoudre("ma-charte", "acme", chartes(accent_pale, logo=png_octets(10, 10)))


@pytest.mark.parametrize("logo,motif", [
    (b"GIF89a" + b"\0" * 40, "PNG"),
    (b"", "PNG"),
    (png_octets(10, 10, signature=b"\x89PNG\r\n\x1a\x00"), "PNG"),
    (png_octets(2001, 100), "2000"),
    (png_octets(100, 2001), "2000"),
    (png_octets(10, 10, complement=1024 * 1024), "1 Mo"),
    (png_octets(10, 10, type_couleur=6)[:20], "PNG"),
])
def test_logo_non_png_trop_gros_ou_trop_grand_refuse(chartes, logo, motif):
    with pytest.raises(registre_charte.CharteRefusee, match=motif):
        registre_charte.resoudre("ma-charte", "acme", chartes(logo=logo))


def test_logo_aux_limites_accepte(chartes):
    assert registre_charte.resoudre("ma-charte", "acme", chartes(logo=png_octets(2000, 2000))).logo


@pytest.mark.parametrize("nom", ["../logo.png", "sous/logo.png", "logo.jpg", "logo.png\0", ".png", "LOGO.PNG ", 5])
def test_nom_de_logo_invalide_refuse(chartes, nom):
    with pytest.raises(registre_charte.CharteRefusee, match="logo"):
        registre_charte.resoudre("ma-charte", "acme", chartes({**CHARTE_VALIDE, "logo": nom}))


def test_logo_absent_ou_lien_symbolique_refuse(chartes, tmp_path):
    dossier = chartes()
    with pytest.raises(registre_charte.CharteRefusee, match="logo"):
        registre_charte.resoudre("ma-charte", "acme", dossier)
    (tmp_path / "ailleurs.png").write_bytes(png_octets(10, 10))
    (dossier / "acme" / "logo.png").symlink_to(tmp_path / "ailleurs.png")
    with pytest.raises(registre_charte.CharteRefusee, match="logo"):
        registre_charte.resoudre("ma-charte", "acme", dossier)


def test_fichier_de_charte_modifiable_par_d_autres_ou_etranger_refuse(chartes):
    import os
    dossier = chartes(logo=png_octets(10, 10))
    fichier = dossier / "acme" / "ma-charte.json"
    fichier.chmod(0o666)
    with pytest.raises(registre_charte.CharteRefusee, match="modifiable"):
        registre_charte.resoudre("ma-charte", "acme", dossier)
    fichier.chmod(0o640)
    assert registre_charte.resoudre("ma-charte", "acme", dossier, uid_proprietaire=os.getuid())
    with pytest.raises(registre_charte.CharteRefusee, match="propriétaire"):
        registre_charte.resoudre("ma-charte", "acme", dossier, uid_proprietaire=os.getuid() + 1)


def test_json_invalide_ou_trop_gros_refuse(chartes):
    dossier = chartes(logo=png_octets(10, 10))
    fichier = dossier / "acme" / "ma-charte.json"
    fichier.write_text("{pas du json")
    with pytest.raises(registre_charte.CharteRefusee, match="invalide"):
        registre_charte.resoudre("ma-charte", "acme", dossier)
    fichier.write_text(json.dumps({**CHARTE_VALIDE, "x": "y" * registre_charte.TAILLE_MAX_CHARTE}))
    with pytest.raises(registre_charte.CharteRefusee, match="trop gros|illisible"):
        registre_charte.resoudre("ma-charte", "acme", dossier)


# ---------- rendu réel dans la cage ----------

def charte_de_rendu(avec_logo=True, police="archivo"):
    from fabrique.registre_charte import Charte
    return Charte("ma-charte", "#f4f1ea", "#1c1b19", "#8a3b12", "#f4f1ea", police,
                  png_octets(240, 80, type_couleur=2) if avec_logo else None)


def ouvrir(chemin):
    image = pytest.importorskip("PIL.Image").open(chemin)
    return image.convert("RGB")


def temoin_visible(chemin) -> bool:
    """Le repère de fin de contenu (magenta, 3 px de haut) est-il dans l'image ? Sinon le contenu déborde."""
    image = ouvrir(chemin)
    pixels = image.load()
    return any(pixels[x, y][0] > 240 and pixels[x, y][1] < 15 and pixels[x, y][2] > 240
               for y in range(image.height) for x in range(0, image.width, 4))


def remplir(motif, plafond):
    """Le motif répété, coupé au plafond de caractères."""
    return (motif * plafond)[:plafond]


def champs_au_plafond(gabarit, motif="W", **surcharge):
    """Tous les champs du gabarit (obligatoires et facultatifs) remplis du motif au plafond : « W », le caractère le plus
    large, ou des mots de « W » séparés d'espaces (place perdue en fin de ligne)."""
    obligatoires, facultatifs = images.GABARITS_IMAGE[gabarit]
    champs = {c: remplir(motif, PLAFONDS[c]) for c in obligatoires + facultatifs if c != "points"}
    if "points" in obligatoires:
        champs["points"] = [remplir(motif, PLAFONDS["point"])] * 3
    champs.update(surcharge)
    return champs


def champs_a_la_charge(gabarit, charge, motif="W", **surcharge):
    """Champs au plafond, puis secondaires raccourcis (mentions, appel, points, sous-titre) jusqu'à la charge visée :
    le pire cas d'un palier de charge, où titre et chiffre restent grands."""
    champs = champs_au_plafond(gabarit, motif, **surcharge)
    for nom in ("mentions_legales", "appel_action", "points", "sous_titre"):
        while nom in champs and images.charge_de(images.valider_champs(gabarit, champs)) > charge:
            if nom == "points":
                if all(len(p) == 1 for p in champs["points"]):
                    break
                champs["points"] = [p[:-1] or "W" for p in champs["points"]]
            elif len(champs[nom]) > 1:
                champs[nom] = champs[nom][:-1]
            else:
                break
    return champs


def a_la_borne(motif, borne):
    """Le plus long texte du motif dont la largeur ne dépasse pas la borne d'un palier."""
    texte = ""
    while images.largeur(texte + motif[len(texte) % len(motif)]) <= borne + 1e-9:
        texte += motif[len(texte) % len(motif)]
    return texte.rstrip()


def variantes_au_plafond(gabarit):
    """Plafond complet, puis titres et chiffres aux bornes de leurs paliers, à chaque palier de charge ; enfin le même
    pire cas en mots (« WWWWWWW » et espaces) pour la place perdue en fin de ligne."""
    avec_chiffre = "chiffre" in images.GABARITS_IMAGE[gabarit][0] + images.GABARITS_IMAGE[gabarit][1]
    (titre_g, _), (titre_m, _), _ = images.PALIERS_TITRE
    (chiffre_g, _), (chiffre_m, _), _ = images.PALIERS_CHIFFRE
    tetes = [{"titre": "W" * 90}, {"titre": a_la_borne("W", titre_m)}, {"titre": a_la_borne("W", titre_g)}]
    if avec_chiffre:
        tetes += [{"chiffre": a_la_borne("W", chiffre_m)}, {"chiffre": a_la_borne("W", chiffre_g)},
                  {"titre": a_la_borne("W", titre_g), "chiffre": a_la_borne("W", chiffre_g)},
                  {"titre": a_la_borne("W", titre_m), "chiffre": a_la_borne("W", chiffre_m)}]
    variantes = [champs_au_plafond(gabarit, **tete) for tete in tetes]
    for limite, _nom in images.PALIERS_CHARGE[:-1]:
        variantes += [champs_a_la_charge(gabarit, limite, **tete) for tete in tetes]
    mot = "WWWWWWW "
    for limite in (images.PALIERS_CHARGE[0][0], 10**6):
        variantes += [champs_a_la_charge(gabarit, limite, mot, titre=a_la_borne(mot, borne)) for borne in (titre_g, titre_m)]
    return variantes


@pret_rendu
@pytest.mark.parametrize("format", FORMATS)
def test_rendu_aux_dimensions_exactes_et_image_non_uniforme(tmp_path, format):
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], format, charte_de_rendu())
    assert r.ok, (r.motif, r.journal[-800:])
    largeur, hauteur = map(int, format.split("x"))
    donnees = r.image.read_bytes()
    assert donnees[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", donnees[16:24]) == (largeur, hauteur)  # lu dans IHDR, pas dans une bibliothèque
    assert (r.largeur, r.hauteur, r.octets) == (largeur, hauteur, len(donnees)) and 0 < len(donnees) <= 8 * 1024**2
    image = ouvrir(r.image)
    assert image.size == (largeur, hauteur) and image.getpixel((1, 1)) == (0xf4, 0xf1, 0xea)  # fond de la charte
    assert len(image.getcolors(maxcolors=1 << 24)) > 20  # du texte et un logo sont dessinés
    assert "violates" not in r.journal  # la police et le logo du dossier sont autorisés par la politique


@pret_rendu
def test_deux_rendus_identiques_donnent_la_meme_empreinte(tmp_path):
    premier = images.rendre_image(tmp_path, "chiffre_cle", CHAMPS_VALIDES["chiffre_cle"], "1080x1080", charte_de_rendu())
    second = images.rendre_image(tmp_path, "chiffre_cle", CHAMPS_VALIDES["chiffre_cle"], "1080x1080", charte_de_rendu())
    assert premier.ok and second.ok and premier.sha256 == second.sha256


def test_les_variantes_couvrent_chaque_palier_de_charge():
    for gabarit in CHAMPS_VALIDES:
        charges = {images.paliers_de(images.valider_champs(gabarit, v))["palier_charge"] for v in variantes_au_plafond(gabarit)}
        assert charges == {"g", "m", "p"}, gabarit


@pret_rendu
@pytest.mark.parametrize("police", POLICES)
@pytest.mark.parametrize("format", FORMATS)
@pytest.mark.parametrize("gabarit", list(CHAMPS_VALIDES))
def test_aucun_debordement_au_plafond_de_caracteres(tmp_path, gabarit, format, police):
    """En « W », avec logo et bandeau IA, au plafond puis au pire cas de chaque palier de charge : le repère de fin reste
    visible, pour chaque police autorisée."""
    for champs in variantes_au_plafond(gabarit):
        r = images.rendre_image(tmp_path, gabarit, champs, format, charte_de_rendu(police=police), mention=True, temoin=True)
        assert r.ok, (r.motif, r.journal[-800:])
        resume = {nom: len(valeur) if isinstance(valeur, str) else [len(v) for v in valeur] for nom, valeur in champs.items()}
        assert temoin_visible(r.image), f"{gabarit} {format} {police} {resume} : le contenu déborde"


@pret_rendu
def test_le_temoin_detecte_un_vrai_debordement(tmp_path, monkeypatch):
    """Contrôle du détecteur : avec un titre bien plus long que le plafond, le repère disparaît."""
    monkeypatch.setitem(images.LIMITES, "titre", 600)
    r = images.rendre_image(tmp_path, "accroche", {"titre": "W" * 600}, "1080x1080", charte_de_rendu(), temoin=True)
    assert r.ok and not temoin_visible(r.image)
    sans = images.rendre_image(tmp_path, "accroche", {"titre": "Un titre normal"}, "1080x1080", charte_de_rendu(), temoin=True)
    assert sans.ok and temoin_visible(sans.image)


@pret_rendu
def test_le_temoin_est_invisible_en_production(tmp_path):
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], "1080x1080", charte_de_rendu())
    assert r.ok and not temoin_visible(r.image)


@pret_rendu
def test_champs_pieges_affiches_comme_texte_sans_rien_charger(tmp_path):
    r = images.rendre_image(tmp_path, "accroche", PIEGES, "1080x1080", charte_de_rendu())
    assert r.ok, (r.motif, r.journal[-800:])
    page = (r.image.parent / "entree" / "scene" / "index.html").read_text(encoding="utf-8")
    assert "<script" not in page and "<img src=\"http" not in page and "<style" not in page
    assert "violates" not in r.journal and not re.search(r"ERR_[A-Z_]+|ECONNREFUSED|EAI_AGAIN", r.journal)
    sombres = sum(ouvrir(r.image).convert("L").histogram()[:100])
    assert sombres > 1500  # le texte piégé est bien dessiné


@pret_rendu
def test_aucune_ressource_http_n_est_chargee_meme_si_la_page_en_demande(tmp_path, monkeypatch):
    """Preuve que la politique tient : une page qui référence http:// est refusée par la CSP, dans le journal de Chrome."""
    original = images.remplir_gabarit

    def piege(*args, **kwargs):
        return original(*args, **kwargs).replace(
            "</body>", '<img src="http://203.0.113.9/x.png"><link rel="stylesheet" href="http://203.0.113.9/x.css"></body>')

    monkeypatch.setattr(images, "remplir_gabarit", piege)
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], "1080x1080", charte_de_rendu())
    assert r.ok, (r.motif, r.journal[-800:])
    assert "Loading the image 'http://203.0.113.9/x.png' violates" in r.journal
    assert "Loading the stylesheet 'http://203.0.113.9/x.css' violates" in r.journal


@pret_rendu
def test_un_script_glisse_dans_la_page_ne_s_execute_pas(tmp_path, monkeypatch):
    original = images.remplir_gabarit
    monkeypatch.setattr(images, "remplir_gabarit", lambda *a, **k: original(*a, **k).replace(
        "</body>", "<script>document.body.style.background='red'</script></body>"))
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], "1080x1080", charte_de_rendu())
    assert r.ok and "Executing inline script violates" in r.journal
    assert ouvrir(r.image).getpixel((1, 1)) == (0xf4, 0xf1, 0xea)


@pret_rendu
def test_png_aux_mauvaises_dimensions_ou_hors_taille_est_refuse(tmp_path, monkeypatch):
    faux = tmp_path / "faux.png"
    faux.write_bytes(png_octets(100, 100))
    with pytest.raises(ValueError, match="dimensions 100x100 au lieu de 1080x1080"):
        images.controler_png(faux, 1080, 1080)
    faux.write_bytes(png_octets(1080, 1080, type_couleur=6))
    with pytest.raises(ValueError, match="sans transparence"):
        images.controler_png(faux, 1080, 1080)
    faux.write_bytes(b"GIF89a" + b"\0" * 40)
    with pytest.raises(ValueError, match="PNG"):
        images.controler_png(faux, 1080, 1080)
    faux.write_bytes(png_octets(1080, 1080, complement=images.TAILLE_MAX_IMAGE))
    with pytest.raises(ValueError, match="octets"):
        images.controler_png(faux, 1080, 1080)
    # un rendu dont le PNG sort aux mauvaises dimensions est refusé avec le motif (rien n'est livré)
    monkeypatch.setitem(images.FORMATS_IMAGE, "1080x1080", (1000, 1000))  # l'hôte attend autre chose que ce que la cage dessine
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], "1080x1080", charte_de_rendu())
    assert not r.ok and "PNG refusé" in r.motif and r.image is None


def test_la_mention_ia_est_celle_de_la_provenance():
    from fabrique import provenance
    assert images.MENTION_IA == provenance.MENTION_IA


def test_la_page_porte_le_bandeau_ia_seulement_si_demande(tmp_path):
    modele = (GABARITS_IMAGES / "accroche" / "index.html").read_text(encoding="utf-8")
    valeurs = images.valider_champs("accroche", {"titre": "x"})
    sans = images.remplir_gabarit(modele, valeurs, "1080x1080", PALIERS_M)
    avec = images.remplir_gabarit(modele, valeurs, "1080x1080", PALIERS_M, mention=True, logo=True)
    assert "mention-ia" not in sans and "logo" not in sans
    assert 'id="mention-ia">Contenu généré avec l&#x27;IA<' in avec and '<img id="logo" src="logo.png"' in avec


# ---------- provenance IA d'une image (XMP IPTC dans le PNG + provenance.json) ----------

TRAVAIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


def infos_image(**surcharge):
    from fabrique import provenance
    base = dict(travail=TRAVAIL, entreprise="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", gabarit="accroche", format="1080x1080",
                charte="ma-charte", outils={"chrome-headless-shell": images.VERSION_CHROME})
    return provenance.InfosProvenanceImage(**{**base, **surcharge})


def image_rendue(tmp_path):
    r = images.rendre_image(tmp_path, "accroche", CHAMPS_VALIDES["accroche"], "1080x1080", charte_de_rendu())
    assert r.ok, (r.motif, r.journal[-500:])
    return r.image


@pret_rendu
def test_xmp_ecrit_dans_un_png_et_relu_dans_une_cage_neuve(tmp_path):
    from fabrique import provenance
    image = image_rendue(tmp_path)
    travail = tmp_path / "xmp"
    travail.mkdir()
    ok, motif, nouveau = provenance.ecrire_xmp(image, travail)
    assert ok, motif
    assert nouveau.suffix == ".png" and nouveau.read_bytes()[:33] == image.read_bytes()[:33]  # signature et IHDR intacts
    relecture = tmp_path / "relu"
    relecture.mkdir()
    xmp = provenance.lire_xmp(nouveau, relecture)
    assert xmp["DigitalSourceType"] == provenance.DIGITAL_SOURCE_TYPE
    assert xmp["Description"] == "Contenu généré avec l'IA" and xmp["CreatorTool"] == "Atelier Marketing IA"
    assert ouvrir(nouveau).size == (1080, 1080)  # l'image reste lisible
    avant = tmp_path / "avant"
    avant.mkdir()
    assert provenance.lire_xmp(image, avant).get("DigitalSourceType") is None  # l'original n'en avait pas


@pytest.mark.parametrize("nom", ["fichier.gif", "fichier.svg", "fichier", "fichier.mp3"])
def test_xmp_refuse_une_extension_hors_liste(tmp_path, nom):
    from fabrique import provenance
    fichier = tmp_path / nom
    fichier.write_bytes(b"x")
    with pytest.raises(ValueError, match="extension"):
        provenance.ecrire_xmp(fichier, tmp_path)
    with pytest.raises(ValueError, match="extension"):
        provenance.lire_xmp(fichier, tmp_path)


@pret_rendu
def test_poser_provenance_image_complete(tmp_path):
    from fabrique import provenance
    image = image_rendue(tmp_path)
    resultat = provenance.poser_provenance_image(image, infos_image())
    assert resultat.ok, resultat.motif
    contenu = json.loads((image.parent / "provenance.json").read_text(encoding="utf-8"))
    assert resultat.chemin_json == image.parent / "provenance.json" and resultat.provenance == contenu
    assert (contenu["type"], contenu["fichier"], contenu["voix"], contenu["musique"]) == ("image", "image.png", [], None)
    assert contenu["digital_source_type"] == provenance.DIGITAL_SOURCE_TYPE
    assert contenu["mention_visible"] is False and contenu["fond_ia"] is False  # image purement typographique
    assert (contenu["gabarit"], contenu["format"], contenu["charte"]) == ("accroche", "1080x1080", "ma-charte")
    assert contenu["sha256"] == provenance.empreinte_sha256(image)  # l'empreinte est celle du fichier final, XMP compris
    assert contenu["outils"]["chrome-headless-shell"] == images.VERSION_CHROME and "exiftool" in contenu["outils"]
    assert "filigrane_perth" not in contenu  # PerTh reste réservé à la vidéo
    relecture = tmp_path / "relu"
    relecture.mkdir()
    assert provenance.lire_xmp(image, relecture)["DigitalSourceType"] == provenance.DIGITAL_SOURCE_TYPE


@pret_rendu
def test_provenance_image_avec_fond_ia_sans_mention_incrustee(tmp_path):
    # choix de l'opérateur du 01/11 : pas de mention incrustée ; la provenance déclare le fond IA en métadonnées
    from fabrique import provenance
    image = image_rendue(tmp_path)
    assert provenance.poser_provenance_image(image, infos_image(fond_ia=True)).ok
    contenu = json.loads((image.parent / "provenance.json").read_text(encoding="utf-8"))
    assert contenu["fond_ia"] is True and contenu["mention_visible"] is False


@pytest.mark.parametrize("modif", [
    {"travail": "pas-un-uuid"}, {"entreprise": "A B"}, {"gabarit": "../x"}, {"format": "grand"}, {"charte": "Ma Charte"},
    {"outils": {"x": "1;rm"}}, {"fond_ia": "oui"},
])
def test_infos_image_invalides(tmp_path, modif):
    from fabrique import provenance
    fichier = tmp_path / "image.png"
    fichier.write_bytes(png_octets(10, 10))
    with pytest.raises(ValueError):
        provenance.poser_provenance_image(fichier, infos_image(**modif))


@pret_rendu
def test_provenance_image_refusee_si_le_xmp_n_est_pas_relu(tmp_path, monkeypatch):
    from fabrique import provenance
    image = image_rendue(tmp_path)
    avant = provenance.empreinte_sha256(image)
    monkeypatch.setattr(provenance, "lire_xmp", lambda fichier, travail: {})
    resultat = provenance.poser_provenance_image(image, infos_image())
    assert not resultat.ok and "XMP" in resultat.motif
    assert not (image.parent / "provenance.json").exists() and provenance.empreinte_sha256(image) == avant


def test_provenance_image_refuse_un_fichier_qui_n_est_pas_un_png_regulier(tmp_path):
    from fabrique import provenance
    faux = tmp_path / "image.png"
    faux.write_bytes(b"GIF89a" + b"\0" * 40)
    with pytest.raises(ValueError, match="PNG"):
        provenance.poser_provenance_image(faux, infos_image())
    (tmp_path / "vrai.png").write_bytes(png_octets(10, 10))
    (tmp_path / "lien.png").symlink_to(tmp_path / "vrai.png")
    with pytest.raises(ValueError, match="régulier"):
        provenance.poser_provenance_image(tmp_path / "lien.png", infos_image())
