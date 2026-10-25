"""Tests du générateur de documents Office (lot 4) et du contrôle d'archive.

La génération se fait avec l'environnement figé (/opt/atelier-fabrique/venv, installé par
scripts/installer-fabrique-python.sh), jamais avec les bibliothèques du système. Le test
« cage » passe par fabrique/cage.py, comme le fera le service.
"""

import glob
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

VENV = Path("/opt/atelier-fabrique/venv")
PYTHON_VENV = VENV / "bin" / "python"
DEPOT = Path(__file__).resolve().parents[2]
GENERATEURS = DEPOT / "fabrique" / "generateurs"
DOCUMENTS = GENERATEURS / "documents.py"
CONTROLE = DEPOT / "fabrique" / "controle_office.py"

if not PYTHON_VENV.exists():
    pytest.skip("environnement figé absent : lancer sudo scripts/installer-fabrique-python.sh",
                allow_module_level=True)

# Les mêmes roues (même Python) servent à relire les fichiers dans le processus de test.
for site in glob.glob(str(VENV / "lib" / "python3*" / "site-packages")):
    sys.path.insert(0, site)

import openpyxl  # noqa: E402
from docx import Document  # noqa: E402
from pptx import Presentation  # noqa: E402
from pypdf import PdfReader  # noqa: E402

sys.path.insert(0, str(DEPOT))
from fabrique import controle_office  # noqa: E402
from fabrique.cage import Etape, executer  # noqa: E402
from fabrique.controle_office import ControleOfficeErreur, controler_archive  # noqa: E402

SOFFICE = shutil.which("soffice")
needs_soffice = pytest.mark.skipif(SOFFICE is None, reason="soffice absent")
BWRAP = shutil.which("bwrap")
needs_bwrap = pytest.mark.skipif(BWRAP is None, reason="bwrap absent")


def demande_docx(**extra):
    base = {
        "format": "docx", "modele": "sobre", "titre": "Rapport d'essai", "langue": "fr-BE",
        "blocs": [
            {"type": "titre", "niveau": 1, "texte": "Introduction"},
            {"type": "paragraphe", "texte": "Bonjour le monde entier", "gras": [{"debut": 0, "fin": 7}],
             "italique": [{"debut": 3, "fin": 13}]},
            {"type": "titre", "niveau": 2, "texte": "Listes"},
            {"type": "liste", "elements": ["pomme", "poire"]},
            {"type": "liste", "ordonnee": True, "elements": ["un", "deux"]},
            {"type": "liste", "ordonnee": True, "elements": ["alpha", "bêta"]},
            {"type": "tableau", "entetes": ["Nom", "Valeur"], "lignes": [["a", "1"], ["b", "2"], ["c"]]},
            {"type": "saut_de_page"},
            {"type": "titre", "niveau": 1, "texte": "Suite"},
            {"type": "paragraphe", "texte": "Fin du document."},
        ],
    }
    base.update(extra)
    return base


def demande_xlsx(**extra):
    base = {
        "format": "xlsx", "modele": "sobre", "titre": "Classeur", "langue": "en",
        "feuilles": [
            {"nom": "Ventes", "lignes": [
                [{"type": "texte", "valeur": "Produit"}, {"type": "texte", "valeur": "Quantité"}],
                [{"type": "texte", "valeur": "Café"}, {"type": "nombre", "valeur": 12.5}],
                [{"type": "date", "valeur": "2026-10-24"}, {"type": "booleen", "valeur": True}],
            ]},
            {"nom": "Vide", "lignes": []},
        ],
    }
    base.update(extra)
    return base


def demande_pptx(**extra):
    base = demande_docx(format="pptx", titre="Présentation")
    base.update(extra)
    return base


def lancer(tmp_path, demande, nom="demande.json"):
    entree = tmp_path / "entree"
    sortie = tmp_path / "sortie"
    entree.mkdir(parents=True, exist_ok=True)
    sortie.mkdir(parents=True, exist_ok=True)
    fichier = entree / nom
    fichier.write_text(json.dumps(demande) if not isinstance(demande, str) else demande, encoding="utf-8")
    processus = subprocess.run([str(PYTHON_VENV), "-I", str(DOCUMENTS), str(fichier), str(sortie)],
                               capture_output=True, text=True, timeout=120)
    return processus, sortie


def generer_ok(tmp_path, demande):
    processus, sortie = lancer(tmp_path, demande)
    assert processus.returncode == 0, processus.stderr
    resultat = json.loads(processus.stdout)
    chemin = sortie / resultat["fichier"]
    assert chemin.is_file()
    controler_archive(chemin)
    return chemin, resultat


def convertir_pdf(tmp_path, fichier):
    """Conversion LibreOffice hors cage, profil jetable, dans un dossier temporaire."""
    profil = tmp_path / "profil-lo"
    sortie = tmp_path / "pdf"
    sortie.mkdir()
    processus = subprocess.run(
        [SOFFICE, "--headless", f"-env:UserInstallation=file://{profil}", "--convert-to", "pdf",
         "--outdir", str(sortie), str(fichier)],
        capture_output=True, text=True, timeout=180)
    assert processus.returncode == 0, processus.stderr
    pdf = sortie / (Path(fichier).stem + ".pdf")
    assert pdf.is_file(), processus.stdout + processus.stderr
    return PdfReader(str(pdf))


# ---------- génération des trois formats ----------

def test_docx_s_ouvre_et_contient_les_blocs(tmp_path):
    chemin, resultat = generer_ok(tmp_path, demande_docx())
    assert resultat == {"fichier": "document.docx", "intermediaire_pdf": False}
    document = Document(str(chemin))
    textes = [p.text for p in document.paragraphs]
    assert "Rapport d'essai" in textes and "Introduction" in textes and "Fin du document." in textes
    assert len(document.tables) == 1
    assert [c.text for c in document.tables[0].rows[0].cells] == ["Nom", "Valeur"]
    assert [c.text for c in document.tables[0].rows[3].cells] == ["c", ""]
    paragraphe = next(p for p in document.paragraphs if p.text == "Bonjour le monde entier")
    # plages : gras [0,7), italique [3,13) -> 0-3 gras, 3-7 gras+italique, 7-13 italique, reste
    assert [(r.text, r.bold, r.italic) for r in paragraphe.runs] == [
        ("Bon", True, None), ("jour", True, True), (" le mo", None, True), ("nde entier", None, None)]


def test_docx_proprietes_et_langue(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_docx())
    propriete = Document(str(chemin)).core_properties
    assert propriete.author == "Atelier Marketing IA"
    assert propriete.last_modified_by == "Atelier Marketing IA"
    assert propriete.comments == "Contenu généré avec l'IA"
    assert propriete.keywords == "trainedAlgorithmicMedia"
    assert propriete.language == "fr-BE"
    assert propriete.title == "Rapport d'essai"
    with zipfile.ZipFile(chemin) as z:
        assert 'w:lang w:val="fr-BE"' in z.read("word/styles.xml").decode()


def test_docx_listes_ordonnees_repartent_de_un(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_docx())
    document = Document(str(chemin))
    identifiants = [p._p.pPr.numPr.numId.val for p in document.paragraphs
                    if p.text in ("un", "deux", "alpha", "bêta")]
    assert identifiants[0] == identifiants[1] and identifiants[2] == identifiants[3]
    assert identifiants[0] != identifiants[2]


def test_xlsx_s_ouvre_types_et_proprietes(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_xlsx())
    classeur = openpyxl.load_workbook(chemin)
    assert classeur.sheetnames == ["Ventes", "Vide"]
    feuille = classeur["Ventes"]
    assert feuille["A1"].value == "Produit" and feuille["A2"].value == "Café"
    assert feuille["B2"].value == 12.5 and feuille["B2"].data_type == "n"
    assert str(feuille["A3"].value.date()) == "2026-10-24" and feuille["A3"].data_type == "d"
    assert feuille["B3"].value is True and feuille["B3"].data_type == "b"
    assert classeur.properties.creator == "Atelier Marketing IA"
    assert classeur.properties.description == "Contenu généré avec l'IA"
    assert classeur.properties.keywords == "trainedAlgorithmicMedia"
    assert classeur.properties.language == "en"


def test_pptx_s_ouvre_et_contient_les_diapositives(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_pptx())
    presentation = Presentation(str(chemin))
    titres = [d.shapes.title.text for d in presentation.slides]
    assert titres[0] == "Présentation"
    assert "Introduction" in titres and "Suite" in titres
    assert any(forme.has_table for d in presentation.slides for forme in d.shapes)
    propriete = presentation.core_properties
    assert propriete.author == "Atelier Marketing IA"
    assert propriete.comments == "Contenu généré avec l'IA"
    assert propriete.keywords == "trainedAlgorithmicMedia"
    assert propriete.language == "fr-BE"


def test_pdf_produit_un_docx_intermediaire(tmp_path):
    chemin, resultat = generer_ok(tmp_path, demande_docx(format="pdf"))
    assert resultat == {"fichier": "document.docx", "intermediaire_pdf": True}
    assert Document(str(chemin)).paragraphs


# ---------- LibreOffice (hors cage) ----------

@needs_soffice
@pytest.mark.parametrize("fabrique_demande, mot", [
    (demande_docx, "Introduction"), (demande_xlsx, "Café"), (demande_pptx, "Introduction")])
def test_libreoffice_ouvre_et_convertit_en_pdf(tmp_path, fabrique_demande, mot):
    chemin, _ = generer_ok(tmp_path, fabrique_demande())
    lecteur = convertir_pdf(tmp_path, chemin)
    assert len(lecteur.pages) >= 1
    assert mot in "".join(page.extract_text() for page in lecteur.pages)


# ---------- caractères spéciaux ----------

SPECIAUX = "<>&\"' émojis 😀🎉 tab\tici\nnouvelle ligne <![CDATA[x]]> &amp;"


def test_caracteres_xml_speciaux_dans_les_trois_formats(tmp_path):
    docx, _ = generer_ok(tmp_path / "d", demande_docx(blocs=[
        {"type": "paragraphe", "texte": SPECIAUX},
        {"type": "tableau", "entetes": [SPECIAUX], "lignes": [[SPECIAUX]]},
        {"type": "liste", "elements": [SPECIAUX]}]))
    document = Document(str(docx))
    assert document.paragraphs[1].text == SPECIAUX
    assert document.tables[0].cell(1, 0).text == SPECIAUX

    xlsx, _ = generer_ok(tmp_path / "x", demande_xlsx(feuilles=[
        {"nom": "Spé <&>", "lignes": [[{"type": "texte", "valeur": SPECIAUX}]]}]))
    assert openpyxl.load_workbook(xlsx)["Spé <&>"]["A1"].value == SPECIAUX

    pptx, _ = generer_ok(tmp_path / "p", demande_pptx(blocs=[
        {"type": "titre", "niveau": 1, "texte": SPECIAUX},
        {"type": "paragraphe", "texte": SPECIAUX}]))
    diapos = list(Presentation(str(pptx)).slides)
    assert any(SPECIAUX[:20] in d.shapes.title.text for d in diapos)
    assert any(SPECIAUX[:20] in f.text_frame.text for d in diapos for f in d.shapes
               if f.has_text_frame and f != d.shapes.title)


# ---------- évasion : formules et injections ----------

CELLULES_PIEGES = [
    '=WEBSERVICE("http://x")',
    '=HYPERLINK("file:///etc/passwd")',
    "+cmd|' /c calc'!A1",
    "@SUM(A1)",
    "-2+3",
    "=1+1",
]


def test_xlsx_cellules_piegees_restent_du_texte_et_sans_formule(tmp_path):
    lignes = [[{"type": "texte", "valeur": v}] for v in CELLULES_PIEGES]
    chemin, _ = generer_ok(tmp_path, demande_xlsx(feuilles=[{"nom": "Pièges", "lignes": lignes}]))
    classeur = openpyxl.load_workbook(chemin)
    for i, attendu in enumerate(CELLULES_PIEGES, start=1):
        cellule = classeur["Pièges"].cell(row=i, column=1)
        assert cellule.data_type == "s", (attendu, cellule.data_type)
        assert cellule.value == attendu
        assert cellule.quotePrefix is True
    with zipfile.ZipFile(chemin) as z:
        feuille_xml = z.read("xl/worksheets/sheet1.xml").decode()
        assert "<f>" not in feuille_xml and "<f " not in feuille_xml
        assert not [n for n in z.namelist() if "calcChain" in n or "externalLink" in n]


def test_cellule_numerique_et_date_invalides_refusees(tmp_path):
    cas = [
        {"type": "nombre", "valeur": "12"},
        {"type": "nombre", "valeur": True},
        {"type": "booleen", "valeur": 1},
        {"type": "date", "valeur": "2026-02-30"},
        {"type": "date", "valeur": "24/10/2026"},
        {"type": "texte", "valeur": 5},
    ]
    for cellule in cas:
        processus, _ = lancer(tmp_path, demande_xlsx(feuilles=[{"nom": "A", "lignes": [[cellule]]}]))
        assert processus.returncode == 2, cellule
        assert "demande invalide" in processus.stderr


@pytest.mark.parametrize("champ, valeur", [
    ("modele", "../../instance/x"), ("modele", "inconnu"), ("format", "docm"), ("langue", "de"),
    ("titre", ""), ("titre", "x" * 201), ("inconnu", 1),
])
def test_demande_refusee_champ_invalide(tmp_path, champ, valeur):
    processus, sortie = lancer(tmp_path, demande_docx(**{champ: valeur}))
    assert processus.returncode == 2
    assert "demande invalide" in processus.stderr
    assert list(sortie.iterdir()) == []


@pytest.mark.parametrize("demande", [
    demande_docx(blocs=[{"type": "image", "livrable": "11111111-1111-1111-1111-111111111111"}]),
    demande_docx(blocs=[{"type": "html", "texte": "<b>x</b>"}]),
    demande_docx(blocs=[{"type": "paragraphe", "texte": "x", "style": "rouge"}]),
    demande_docx(blocs=[{"type": "titre", "niveau": 4, "texte": "x"}]),
    demande_docx(blocs=[{"type": "paragraphe", "texte": "abc", "gras": [{"debut": 2, "fin": 9}]}]),
    demande_docx(blocs=[{"type": "paragraphe", "texte": "a\x00b"}]),
    demande_docx(blocs=[{"type": "paragraphe", "texte": "x" * 20001}]),
    demande_docx(blocs=[{"type": "tableau", "lignes": []}]),
    demande_docx(blocs=[{"type": "tableau", "lignes": [["x"] * 51]}]),
    demande_docx(blocs=[{"type": "liste", "elements": ["x"] * 501}]),
    demande_docx(blocs=[{"type": "saut_de_page"}] * 2001),
    demande_docx(feuilles=demande_xlsx()["feuilles"]),
    demande_xlsx(blocs=[{"type": "saut_de_page"}]),
    demande_xlsx(feuilles=[]),
    demande_xlsx(feuilles=[{"nom": "x" * 32, "lignes": []}]),
    demande_xlsx(feuilles=[{"nom": "a/b", "lignes": []}]),
    demande_xlsx(feuilles=[{"nom": "A", "lignes": []}, {"nom": "a", "lignes": []}]),
    demande_xlsx(feuilles=[{"nom": "A", "lignes": [[]] * 2001}]),
    demande_xlsx(feuilles=[{"nom": str(i), "lignes": []} for i in range(21)]),
    demande_xlsx(feuilles=[{"nom": "A", "lignes": [[{"type": "formule", "valeur": "=1"}]]}]),
    demande_xlsx(feuilles=[{"nom": "A", "lignes": [[{"type": "texte", "valeur": "x", "formule": "=1"}]]}]),
    [1, 2],
    "{pas du json",
    '{"format": "docx", "format": "xlsx"}',
    '{"format": "docx", "modele": "sobre", "titre": "t", "langue": "en", "blocs": [NaN]}',
])
def test_demandes_hors_limites_ou_hors_format_refusees(tmp_path, demande):
    processus, sortie = lancer(tmp_path, demande if not isinstance(demande, list) else json.dumps(demande))
    assert processus.returncode == 2, processus.stdout
    assert "demande invalide" in processus.stderr
    assert list(sortie.iterdir()) == []


def test_image_refusee_avec_message_clair(tmp_path):
    processus, _ = lancer(tmp_path, demande_docx(
        blocs=[{"type": "image", "livrable": "11111111-1111-1111-1111-111111111111"}]))
    assert processus.returncode == 2
    assert "images pas encore prises en charge" in processus.stderr


def test_usage_sans_argument():
    processus = subprocess.run([str(PYTHON_VENV), "-I", str(DOCUMENTS)], capture_output=True, text=True)
    assert processus.returncode == 2 and "usage" in processus.stderr


# ---------- contrôle d'archive ----------

def refabriquer(source, destination, ajouts=None, remplacements=None):
    """Recopie l'archive en ajoutant des entrées ou en remplaçant le contenu de certaines."""
    ajouts = ajouts or {}
    remplacements = remplacements or {}
    with zipfile.ZipFile(source) as entree, zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as sortie:
        for info in entree.infolist():
            contenu = remplacements.get(info.filename, entree.read(info.filename))
            sortie.writestr(info.filename, contenu)
        for nom, contenu in ajouts.items():
            sortie.writestr(nom, contenu)
    return destination


@pytest.fixture
def docx_sain(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_docx())
    return chemin


def _relations(docx):
    with zipfile.ZipFile(docx) as z:
        return z.read("word/_rels/document.xml.rels").decode()


def test_controle_accepte_les_trois_formats_generes(tmp_path):
    for fabrique_demande in (demande_docx, demande_xlsx, demande_pptx):
        chemin, _ = generer_ok(tmp_path / fabrique_demande.__name__, fabrique_demande())
        controler_archive(chemin)


def test_controle_refuse_vbaproject_bin(tmp_path, docx_sain):
    piege = refabriquer(docx_sain, tmp_path / "macro.docx", ajouts={"word/vbaProject.bin": b"\x00macro"})
    with pytest.raises(ControleOfficeErreur, match="interdit"):
        controler_archive(piege)


def test_controle_refuse_relation_externe(tmp_path, docx_sain):
    relations = _relations(docx_sain).replace(
        "</Relationships>",
        '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
        'relationships/hyperlink" Target="http://exemple.test/" TargetMode="External"/></Relationships>')
    piege = refabriquer(docx_sain, tmp_path / "externe.docx",
                        remplacements={"word/_rels/document.xml.rels": relations.encode()})
    with pytest.raises(ControleOfficeErreur, match="relation externe"):
        controler_archive(piege)


@pytest.mark.parametrize("nom", [
    "xl/externalLinks/externalLink1.xml", "word/embeddings/oleObject1.bin", "word/activeX/activeX1.xml",
    "../evasion.xml", "/etc/passwd", "word/../../x.xml", "C:/x.xml", "word\\x.xml",
])
def test_controle_refuse_noms_d_entree_dangereux(tmp_path, docx_sain, nom):
    piege = refabriquer(docx_sain, tmp_path / "piege.docx", ajouts={nom: b"<a/>"})
    with pytest.raises(ControleOfficeErreur):
        controler_archive(piege)


def test_controle_refuse_type_de_contenu_macro(tmp_path, docx_sain):
    with zipfile.ZipFile(docx_sain) as z:
        types = z.read("[Content_Types].xml").decode()
    types = types.replace("wordprocessingml.document.main+xml", "ms-word.document.macroEnabled.main+xml")
    piege = refabriquer(docx_sain, tmp_path / "docm.docx", remplacements={"[Content_Types].xml": types.encode()})
    with pytest.raises(ControleOfficeErreur, match="type de contenu"):
        controler_archive(piege)


def test_controle_refuse_type_de_relation_ole_sans_mode_externe(tmp_path, docx_sain):
    relations = _relations(docx_sain).replace(
        "</Relationships>",
        '<Relationship Id="rId98" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
        'relationships/oleObject" Target="embeddings/o.bin"/></Relationships>')
    piege = refabriquer(docx_sain, tmp_path / "ole.docx",
                        remplacements={"word/_rels/document.xml.rels": relations.encode()})
    with pytest.raises(ControleOfficeErreur, match="type de relation"):
        controler_archive(piege)


def test_controle_refuse_xml_avec_entites(tmp_path, docx_sain):
    bombe = ('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]>'
             '<x>&b;</x>').encode()
    piege = refabriquer(docx_sain, tmp_path / "xxe.docx", ajouts={"word/extra.xml": bombe})
    with pytest.raises(ControleOfficeErreur, match="XML dangereux"):
        controler_archive(piege)


def test_controle_refuse_archive_trop_grosse(tmp_path, docx_sain, monkeypatch):
    monkeypatch.setattr(controle_office, "TAILLE_MAX_DECOMPRESSEE", 1000)
    with pytest.raises(ControleOfficeErreur, match="200 Mio|taille"):
        controler_archive(docx_sain)


def test_controle_refuse_zip_gonfle_malgre_taille_declaree_petite(tmp_path, docx_sain, monkeypatch):
    # Contenu réel de 50 Mio de zéros dans un .xml : la taille réelle compte, pas seulement l'en-tête.
    gros = refabriquer(docx_sain, tmp_path / "gros.docx", ajouts={"word/gros.xml": b"<a>" + b"0" * (50 * 1024**2)})
    monkeypatch.setattr(controle_office, "TAILLE_MAX_DECOMPRESSEE", 10 * 1024**2)
    with pytest.raises(ControleOfficeErreur, match="taille"):
        controler_archive(gros)


def test_controle_refuse_fichier_qui_n_est_pas_un_zip(tmp_path):
    faux = tmp_path / "faux.docx"
    faux.write_bytes(b"pas une archive")
    with pytest.raises(ControleOfficeErreur, match="illisible"):
        controler_archive(faux)


def test_controle_en_ligne_de_commande(tmp_path, docx_sain):
    ok = subprocess.run([str(PYTHON_VENV), "-I", str(CONTROLE), str(docx_sain)], capture_output=True, text=True)
    assert ok.returncode == 0, ok.stderr
    piege = refabriquer(docx_sain, tmp_path / "macro.docx", ajouts={"word/vbaProject.bin": b"x"})
    ko = subprocess.run([str(PYTHON_VENV), "-I", str(CONTROLE), str(piege)], capture_output=True, text=True)
    assert ko.returncode == 3 and "refusé" in ko.stderr


# ---------- passage réel par la cage ----------

@needs_bwrap
@pytest.mark.parametrize("fabrique_demande, nom", [
    (demande_docx, "document.docx"), (demande_xlsx, "document.xlsx"), (demande_pptx, "document.pptx")])
def test_generation_dans_la_cage(tmp_path, fabrique_demande, nom):
    entree = tmp_path / "entree"
    sortie = tmp_path / "sortie"
    entree.mkdir()
    sortie.mkdir()
    (entree / "demande.json").write_text(json.dumps(fabrique_demande()), encoding="utf-8")
    etape = Etape(
        type="cpu", programme=str(PYTHON_VENV),
        arguments=("-I", "/code/documents.py", "/entree/demande.json", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(GENERATEURS), "/code"),))
    resultat = executer(etape, 90)
    assert resultat.code == 0, resultat.erreur.decode()
    assert json.loads(resultat.sortie)["fichier"] == nom
    assert (sortie / nom).is_file()
    controler_archive(sortie / nom)


@needs_bwrap
def test_demande_refusee_dans_la_cage(tmp_path):
    entree = tmp_path / "entree"
    sortie = tmp_path / "sortie"
    entree.mkdir()
    sortie.mkdir()
    (entree / "demande.json").write_text(json.dumps(demande_docx(modele="../../instance/x")), encoding="utf-8")
    etape = Etape(
        type="cpu", programme=str(PYTHON_VENV),
        arguments=("-I", "/code/documents.py", "/entree/demande.json", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(GENERATEURS), "/code"),))
    resultat = executer(etape, 90)
    assert resultat.code == 2 and b"demande invalide" in resultat.erreur
    assert list(sortie.iterdir()) == []


# ---------- plages en unités UTF-16 (correction du lot 4) ----------

def test_plages_gras_en_unites_utf16_avec_emoji_avant(tmp_path):
    # « 😀 » compte 2 unités UTF-16 mais 1 point de code : « bon » est en [3, 6) côté JavaScript.
    texte = "😀 bon jour"
    demande = demande_docx(blocs=[{"type": "paragraphe", "texte": texte,
                                   "gras": [{"debut": 3, "fin": 6}]}])
    chemin, _ = generer_ok(tmp_path, demande)
    paragraphe = next(p for p in Document(str(chemin)).paragraphs if p.text == texte)
    assert [(r.text, r.bold) for r in paragraphe.runs] == [("😀 ", None), ("bon", True), (" jour", None)]


def test_plage_utf16_coupant_une_paire_de_substitution_est_refusee(tmp_path):
    demande = demande_docx(blocs=[{"type": "paragraphe", "texte": "😀 x",
                                   "gras": [{"debut": 1, "fin": 3}]}])
    processus, _ = lancer(tmp_path, demande)
    assert processus.returncode == 2 and "paire de substitution" in processus.stderr


def test_plage_utf16_limite_a_la_longueur_utf16(tmp_path):
    # « 😀 » = 2 unités : fin 2 valide, fin 3 hors du texte.
    ok, _ = generer_ok(tmp_path / "a", demande_docx(blocs=[
        {"type": "paragraphe", "texte": "😀", "gras": [{"debut": 0, "fin": 2}]}]))
    assert ok.is_file()
    processus, _ = lancer(tmp_path / "b", demande_docx(blocs=[
        {"type": "paragraphe", "texte": "😀", "gras": [{"debut": 0, "fin": 3}]}]))
    assert processus.returncode == 2
