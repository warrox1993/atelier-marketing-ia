"""Tests du générateur de documents Office (lot 4) et du contrôle d'archive.

La génération se fait avec l'environnement figé (/opt/atelier-fabrique/venv, installé par
scripts/installer-fabrique-python.sh), jamais avec les bibliothèques du système. Le test
« cage » passe par fabrique/cage.py, comme le fera le service.
"""

import glob
import hashlib
import importlib.util
import io
import json
import re
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
from fabrique import controle_office, registre_charte  # noqa: E402
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

FORMULES_REFUSEES = [
    "=1+1",
    "=SOMME(A1)",
    '=WEBSERVICE("http://x")',
    '=HYPERLINK("file:///etc/passwd")',
    "  =1+1",
    "\u200b=1+1",  # caractère invisible (Cf) en tête
    "\uff1d1+1",  # « ＝ » pleine chasse, ramené à « = » par NFKC
    "+SOMME(A1)",
    "+SOMMÉ(A1)",
    "-SUM(A1)",
    "@SUM(A1)",
    "+cmd|' /c calc'!A1",
    "+Feuil1!A1",
    "-'Ma feuille'!B2",
    "+A1+B2",
    "@A1:B2",
    "+a1", "-(A1+B1)", "+SUM (A1)", "+2+5+cmd|' /C calc'!A0", "-(1+2)",
]

TEXTES_LEGITIMES = [
    "+32 470 12 34 56", "-5 %", "@marque", "- premier point", "-2+3", "+5", "-12,5", "@jean",
    "+", "-", "@", "--", "+1.5e3", "+ (option)", "-TVA incluse", "+BE12 3456", "-1 000 €",
    "@ marque", "@2026", "-10 °C", "+Total", "+33 (0)1 23 45 67 89",
    "-Q1 : marge 12 %", "- E40 : travaux", "@bob1", "- Marge (brute)", "- (voir note)", "+ 3 clients",
    "-Marge (brute)",
]


def feuille_xml(chemin):
    with zipfile.ZipFile(chemin) as z:
        assert not [n for n in z.namelist() if "calcChain" in n or "externalLink" in n]
        return z.read("xl/worksheets/sheet1.xml").decode()


@pytest.mark.parametrize("cellule", FORMULES_REFUSEES)
def test_formules_refusees_cellule_xlsx_avec_message_clair(tmp_path, cellule):
    processus, sortie = lancer(tmp_path, demande_xlsx(feuilles=[
        {"nom": "A", "lignes": [[{"type": "texte", "valeur": cellule}]]}]))
    assert processus.returncode == 2, cellule
    assert "texte qui ressemble à une formule" in processus.stderr
    assert "la fabrique n'écrit aucune formule" in processus.stderr
    assert list(sortie.iterdir()) == []


@pytest.mark.parametrize("format_, demande", [
    ("docx", lambda t: demande_docx(blocs=[{"type": "tableau", "lignes": [["ok", t]]}])),
    ("docx", lambda t: demande_docx(blocs=[{"type": "tableau", "entetes": [t], "lignes": [["ok"]]}])),
    ("pptx", lambda t: demande_pptx(blocs=[{"type": "tableau", "lignes": [[t]]}])),
])
def test_formule_refusee_dans_un_tableau_docx_et_pptx(tmp_path, format_, demande):
    for formule in FORMULES_REFUSEES:
        processus, _ = lancer(tmp_path, demande(formule))
        assert processus.returncode == 2, (format_, formule)
        assert "texte qui ressemble à une formule" in processus.stderr


def test_textes_legitimes_gardes_avec_quote_prefix(tmp_path):
    lignes = [[{"type": "texte", "valeur": v}] for v in TEXTES_LEGITIMES]
    chemin, _ = generer_ok(tmp_path, demande_xlsx(feuilles=[{"nom": "Textes", "lignes": lignes}]))
    classeur = openpyxl.load_workbook(chemin)
    for i, attendu in enumerate(TEXTES_LEGITIMES, start=1):
        cellule = classeur["Textes"].cell(row=i, column=1)
        assert cellule.data_type == "s", (attendu, cellule.data_type)
        assert cellule.value == attendu
        assert cellule.quotePrefix is True
    xml = feuille_xml(chemin)
    assert "<f>" not in xml and "<f " not in xml


def test_textes_legitimes_gardes_dans_un_tableau_docx(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_docx(blocs=[
        {"type": "tableau", "lignes": [TEXTES_LEGITIMES]}]))
    cellules = [c.text for c in Document(str(chemin)).tables[0].rows[0].cells]
    assert cellules == TEXTES_LEGITIMES


def test_ecriture_xlsx_reste_du_texte_sans_le_validateur(tmp_path):
    """Seconde barrière : même sans le refus au dépôt, l'écriture ne crée jamais de formule."""
    spec = importlib.util.spec_from_file_location("documents_direct", DOCUMENTS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for i, valeur in enumerate(FORMULES_REFUSEES, start=1):
        module._ecrire_cellule_xlsx(feuille, i, 1, {"type": "texte", "valeur": valeur})
    chemin = tmp_path / "direct.xlsx"
    classeur.save(chemin)
    relu = openpyxl.load_workbook(chemin).active
    for i, valeur in enumerate(FORMULES_REFUSEES, start=1):
        cellule = relu.cell(row=i, column=1)
        assert cellule.data_type == "s", (valeur, cellule.data_type)
        assert cellule.value == valeur
        if valeur.startswith(("=", "+", "-", "@")):
            assert cellule.quotePrefix is True, valeur
    xml = feuille_xml(chemin)
    assert "<f>" not in xml and "<f " not in xml


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


# ---------- charte du registre (#67, tâche 2) ----------
# Le service écrit `charte.json` (couleurs calculées contre le papier blanc, deux familles de police) et `logo.png`
# à côté de `demande.json` ; le générateur ne lit que ces deux noms fixes.

BLANC = "#ffffff"


def png_essai(taille=(60, 30), couleur=(200, 30, 30)) -> bytes:
    from PIL import Image

    flux = io.BytesIO()
    Image.new("RGB", taille, couleur).save(flux, "PNG")
    return flux.getvalue()


CHARTE_ESSAI = registre_charte.Charte("document", "#ffffff", "#1b1b1b", "#1f6f5c", "#ffffff", "source-serif",
                                      png_essai())
CHARTE_SOMBRE = registre_charte.Charte("document", "#101820", "#ffffff", "#f2c94c", "#101820", "dejavu-sans", None)


def poser_charte(tmp_path, charte=CHARTE_ESSAI):
    entree = tmp_path / "entree"
    entree.mkdir(parents=True, exist_ok=True)
    (entree / "charte.json").write_text(json.dumps(registre_charte.donnees_document(charte)), encoding="utf-8")
    if charte.logo:
        (entree / "logo.png").write_bytes(charte.logo)


def hachage_partie(chemin, partie) -> str:
    with zipfile.ZipFile(chemin) as z:
        return hashlib.sha256(z.read(partie)).hexdigest()


def noms_dans_archive(chemin, prefixe) -> list[str]:
    with zipfile.ZipFile(chemin) as z:
        return [n for n in z.namelist() if n.startswith(prefixe)]


def test_sans_charte_le_docx_reste_sobre(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_docx())
    document = Document(str(chemin))
    assert document.styles["Normal"].font.name == "Arial"
    assert document.styles["Normal"].font.color.rgb is None
    for nom in ("Title", "Heading 1", "Heading 2", "Heading 3"):
        assert str(document.styles[nom].font.color.rgb) == "222222"
    assert noms_dans_archive(chemin, "word/media") == [] and noms_dans_archive(chemin, "word/header") == []


# Empreintes relevées avant la charte, avec les roues figées : sans charte.json, les styles restent identiques
# octet pour octet (à rafraîchir seulement si les roues python-docx, python-pptx ou openpyxl changent).
@pytest.mark.parametrize("fabrique_demande, partie, empreinte", [
    (demande_docx, "word/styles.xml", "1f4542588cd4b7e10b189c300905e4a8e513ea13ca26b77937e674af9af1422f"),
    (demande_pptx, "ppt/slideMasters/slideMaster1.xml",
     "44cc65956f47c1cf689803dcc7a1d9225c93d3fd90754a9f85e2bdcea27565bc"),
    (demande_xlsx, "xl/styles.xml", "c524b7ab89942603625f58975d0beca99d2731579c3c5849f5a478d69960afb9")])
def test_sans_charte_les_styles_restent_identiques_octet_pour_octet(tmp_path, fabrique_demande, partie, empreinte):
    chemin, _ = generer_ok(tmp_path, fabrique_demande())
    assert hachage_partie(chemin, partie) == empreinte


def test_charte_docx_couleurs_police_logo(tmp_path):
    from docx.oxml.ns import qn
    from docx.shared import Cm

    poser_charte(tmp_path)
    chemin, _ = generer_ok(tmp_path, demande_docx())
    document = Document(str(chemin))
    normal = document.styles["Normal"]
    assert normal.font.name == "Archivo" and str(normal.font.color.rgb) == "1B1B1B"
    for nom in ("Title", "Heading 1", "Heading 2", "Heading 3"):
        style = document.styles[nom]
        assert style.font.name == "Source Serif 4" and str(style.font.color.rgb) == "1F6F5C"
    # le filet sous le titre garde sinon le bleu du gabarit (vu sur le rendu)
    assert document.styles["Title"].element.xpath("w:pPr/w:pBdr/w:bottom/@w:color") == ["1F6F5C"]
    polices = document.styles["Heading 1"].element.rPr.rFonts
    assert polices.get(qn("w:eastAsia")) == "Source Serif 4" and polices.get(qn("w:asciiTheme")) is None
    entete = document.tables[0].rows[0].cells[0]
    assert entete._tc.tcPr.xpath("w:shd/@w:fill")[0].upper() == "1F6F5C"
    assert str(entete.paragraphs[0].runs[0].font.color.rgb) == "FFFFFF"
    haut = document.sections[0].header
    assert not haut.is_linked_to_previous
    (inline,) = haut.paragraphs[0]._p.xpath(".//wp:inline")
    assert int(inline.xpath("wp:extent/@cx")[0]) == Cm(3)
    assert inline.xpath("wp:docPr/@descr") == ["Logo"]
    assert len(noms_dans_archive(chemin, "word/media/")) == 1


def test_charte_pptx_masque_en_tete_de_tableau_logo(tmp_path):
    from pptx.enum.dml import MSO_FILL
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    from pptx.oxml.ns import qn

    poser_charte(tmp_path)
    chemin, _ = generer_ok(tmp_path, demande_pptx())
    presentation = Presentation(str(chemin))
    styles = presentation.slide_master.element.find(qn("p:txStyles"))
    for branche, couleur, police in (("p:titleStyle", "1F6F5C", "Source Serif 4"), ("p:bodyStyle", "1B1B1B", "Archivo")):
        niveaux = list(styles.find(qn(branche)).iter(qn("a:defRPr")))
        assert niveaux
        for rpr in niveaux:
            assert rpr.find(qn("a:solidFill")).find(qn("a:srgbClr")).get("val").upper() == couleur
            assert rpr.find(qn("a:latin")).get("typeface") == police
    images = [f for f in presentation.slides[0].shapes if f.shape_type == MSO_SHAPE_TYPE.PICTURE]
    assert len(images) == 1 and images[0]._element.nvPicPr.cNvPr.get("descr") == "Logo"
    tableau = next(f.table for d in presentation.slides for f in d.shapes if f.has_table)
    assert tableau.horz_banding is False
    entete = tableau.cell(0, 0)
    assert str(entete.fill.fore_color.rgb) == "1F6F5C"
    course = entete.text_frame.paragraphs[0].runs[0]
    assert str(course.font.color.rgb) == "FFFFFF" and course.font.name == "Archivo"
    # les lignes ne gardent pas la teinte bleutée du style de tableau du gabarit (vu sur le rendu)
    assert tableau.cell(1, 0).fill.type == MSO_FILL.BACKGROUND


def test_charte_pptx_zones_de_texte_libres_dans_la_police(tmp_path):
    poser_charte(tmp_path)
    chemin, _ = generer_ok(tmp_path, demande_graphique("pptx", blocs=[bloc_graphique(sous_titre="Sous-titre")]))
    zones = [f for d in Presentation(str(chemin)).slides for f in d.shapes if f.has_text_frame and not f.is_placeholder]
    assert len(zones) == 2
    assert all(z.text_frame.paragraphs[0].runs[0].font.name == "Archivo" for z in zones)


def test_charte_xlsx_police_et_premiere_ligne(tmp_path):
    poser_charte(tmp_path)
    chemin, _ = generer_ok(tmp_path, demande_xlsx())
    feuille = openpyxl.load_workbook(chemin)["Ventes"]
    assert all(c.font.name == "Archivo" for ligne in feuille.iter_rows() for c in ligne)
    premiere = feuille["A1"]
    assert premiere.font.b and premiere.font.color.rgb[-6:] == "FFFFFF"
    assert premiere.fill.fill_type == "solid" and premiere.fill.fgColor.rgb[-6:] == "1F6F5C"
    suivante = feuille["A2"]
    assert not suivante.font.b and suivante.font.color.rgb[-6:] == "1B1B1B" and suivante.fill.fill_type is None
    assert noms_dans_archive(chemin, "xl/media") == []


def _paires_texte_fond(chemin, format_):
    """Couples (couleur de texte, couleur de fond) de tout le texte relu du document, fond = papier blanc sauf en-tête."""
    if format_ == "docx":
        document = Document(str(chemin))
        paires = []
        for nom in ("Normal", "Title", "Heading 1", "Heading 2", "Heading 3"):
            rgb = document.styles[nom].font.color.rgb
            paires.append((f"#{rgb}" if rgb is not None else "#000000", BLANC))
        entete = document.tables[0].rows[0].cells[0]
        fond = entete._tc.tcPr.xpath("w:shd/@w:fill")[0]
        paires.append((f"#{entete.paragraphs[0].runs[0].font.color.rgb}", f"#{fond}"))
        return paires
    if format_ == "pptx":
        from pptx.oxml.ns import qn

        presentation = Presentation(str(chemin))
        styles = presentation.slide_master.element.find(qn("p:txStyles"))
        paires = [(f"#{rpr.find(qn('a:solidFill')).find(qn('a:srgbClr')).get('val')}", BLANC)
                  for branche in ("p:titleStyle", "p:bodyStyle") for rpr in styles.find(qn(branche)).iter(qn("a:defRPr"))]
        entete = next(f.table for d in presentation.slides for f in d.shapes if f.has_table).cell(0, 0)
        paires.append((f"#{entete.text_frame.paragraphs[0].runs[0].font.color.rgb}", f"#{entete.fill.fore_color.rgb}"))
        return paires
    feuille = openpyxl.load_workbook(chemin)["Ventes"]
    premiere, suivante = feuille["A1"], feuille["A2"]
    return [(f"#{premiere.font.color.rgb[-6:]}", f"#{premiere.fill.fgColor.rgb[-6:]}"),
            (f"#{suivante.font.color.rgb[-6:]}", BLANC)]


@pytest.mark.parametrize("fabrique_demande, format_", [(demande_docx, "docx"), (demande_pptx, "pptx"), (demande_xlsx, "xlsx")])
def test_charte_sombre_reste_lisible_sur_papier_blanc(tmp_path, fabrique_demande, format_):
    poser_charte(tmp_path, CHARTE_SOMBRE)
    chemin, _ = generer_ok(tmp_path, fabrique_demande())
    paires = _paires_texte_fond(chemin, format_)
    assert len(paires) >= 2
    for texte, fond in paires:
        assert registre_charte.contraste(texte, fond) >= 4.5, (texte, fond)
    assert not any(texte.lower() == CHARTE_SOMBRE.texte for texte, fond in paires if fond == BLANC)


def test_couleurs_du_document_calculees_contre_le_blanc():
    assert registre_charte.donnees_document(CHARTE_ESSAI) == {
        "titre": "#1f6f5c", "corps": "#1b1b1b", "entete_fond": "#1f6f5c", "entete_texte": "#ffffff",
        "serie": "#1f6f5c", "police_titre": "Source Serif 4", "police_texte": "Archivo", "logo": True}
    # Accent clair, texte blanc : tout retombe sur le sombre, l'en-tête garde l'accent avec un texte noir.
    assert registre_charte.donnees_document(CHARTE_SOMBRE) == {
        "titre": "#222222", "corps": "#000000", "entete_fond": "#f2c94c", "entete_texte": "#000000",
        "serie": "#222222", "police_titre": "DejaVu Sans", "police_texte": "DejaVu Sans", "logo": False}
    # Accent moyen (3,64 sur blanc) : titres en couleur de texte, série en accent (seuil 3).
    moyen = registre_charte.Charte("document", "#ffffff", "#1b1b1b", "#c96f1a", "#1b1b1b", "archivo", None)
    donnees = registre_charte.donnees_document(moyen)
    assert (donnees["titre"], donnees["serie"], donnees["entete_texte"]) == ("#1b1b1b", "#c96f1a", "#000000")


def test_familles_document_couvrent_les_polices_autorisees():
    assert set(registre_charte.FAMILLES_DOCUMENT) == set(registre_charte.POLICES_AUTORISEES)


def test_familles_du_registre_sont_celles_que_connait_le_generateur():
    from fabrique.generateurs import documents

    utilisees = {famille for paire in registre_charte.FAMILLES_DOCUMENT.values() for famille in paire}
    assert utilisees == set(documents.FAMILLES_CHARTE)


@pytest.mark.parametrize("fabrique_demande, nom", [(demande_docx, "docx"), (demande_pptx, "pptx"), (demande_xlsx, "xlsx")])
def test_controle_office_accepte_les_fichiers_avec_charte_et_logo(tmp_path, fabrique_demande, nom):
    poser_charte(tmp_path)
    chemin, _ = generer_ok(tmp_path, fabrique_demande())  # generer_ok appelle controler_archive
    controler_archive(chemin)
    ko = subprocess.run([str(PYTHON_VENV), "-I", str(CONTROLE), str(chemin)], capture_output=True, text=True)
    assert ko.returncode == 0, ko.stderr
    if nom != "xlsx":
        assert noms_dans_archive(chemin, f"{'word' if nom == 'docx' else 'ppt'}/media/")


def test_demande_avec_champ_charte_refusee_meme_si_la_charte_existe(tmp_path):
    poser_charte(tmp_path)
    processus, sortie = lancer(tmp_path, demande_docx(charte="document"))
    assert processus.returncode == 2 and "champ inconnu : 'charte'" in processus.stderr
    assert list(sortie.iterdir()) == []


@pytest.mark.parametrize("contenu", [
    "pas du json", '{"titre": "rouge"}', '[]',
    json.dumps({**registre_charte.donnees_document(CHARTE_ESSAI), "titre": "red"}),
    json.dumps({**registre_charte.donnees_document(CHARTE_ESSAI), "police_texte": "Comic Sans"}),
    json.dumps({**registre_charte.donnees_document(CHARTE_ESSAI), "inconnu": 1}),
])
def test_charte_json_invalide_fait_echouer_le_generateur_sans_document(tmp_path, contenu):
    poser_charte(tmp_path)
    (tmp_path / "entree" / "charte.json").write_text(contenu, encoding="utf-8")
    processus, sortie = lancer(tmp_path, demande_docx())
    assert processus.returncode == 1 and "charte" in processus.stderr
    assert list(sortie.iterdir()) == []


@pytest.mark.parametrize("contenu", [b"", b"pas un png", b"\x89PNG\r\n\x1a\nxxxx"])
def test_logo_absent_ou_illisible_fait_echouer_le_generateur_sans_document(tmp_path, contenu):
    poser_charte(tmp_path)
    logo = tmp_path / "entree" / "logo.png"
    if contenu:
        logo.write_bytes(contenu)
    else:
        logo.unlink()
    processus, sortie = lancer(tmp_path, demande_docx())
    assert processus.returncode == 1 and "logo" in processus.stderr
    assert list(sortie.iterdir()) == []


# ---------- bloc graphique natif (#67, tâche 3) ----------
# Données fictives, sans nom de client. Le graphique est généré par la fabrique à partir des chiffres déposés :
# aucun classeur incorporé, aucune image.

TEXTE_REMPLACEMENT = "Colonnes : 28,5 millions d'euros en 2026 contre 21 en 2025."


def bloc_graphique(**extra):
    base = {"type": "graphique", "genre": "colonnes", "titre": "Chiffre d'affaires par année",
            "categories": ["2025", "2026"],
            "series": [{"nom": "Ventes", "valeurs": [21, 28.5]}, {"nom": "Objectif", "valeurs": [20, 25]}],
            "source": "Direction financière, comptes provisoires", "texte_remplacement": TEXTE_REMPLACEMENT}
    base.update(extra)
    return base


def demande_graphique(format_="docx", blocs=None, **extra):
    base = demande_docx(format=format_, blocs=blocs if blocs is not None else [bloc_graphique()])
    base.update(extra)
    return base


def xml_graphiques(chemin) -> list[str]:
    with zipfile.ZipFile(chemin) as z:
        return [z.read(n).decode("utf-8") for n in sorted(z.namelist()) if "/charts/chart" in n and n.endswith(".xml")]


def test_graphique_docx_partie_chart_et_texte_de_remplacement(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_graphique())
    assert noms_dans_archive(chemin, "word/charts/") == ["word/charts/chart1.xml"]
    assert noms_dans_archive(chemin, "word/embeddings") == []
    document = Document(str(chemin))
    (inline,) = document.element.body.xpath(".//wp:inline")
    assert inline.xpath("wp:docPr/@descr") == [TEXTE_REMPLACEMENT]
    assert inline.xpath(".//c:chart/@r:id")
    textes = [p.text for p in document.paragraphs]
    assert "Chiffre d'affaires par année" in textes and "Source : Direction financière, comptes provisoires" in textes
    (xml,) = xml_graphiques(chemin)
    assert "<c:barChart>" in xml and "<c:v>28.5</c:v>" in xml and "<c:v>2026</c:v>" in xml and "<c:v>Objectif</c:v>" in xml


def test_deux_graphiques_docx_parties_distinctes(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_graphique(blocs=[bloc_graphique(), bloc_graphique(genre="courbe")]))
    assert noms_dans_archive(chemin, "word/charts/") == ["word/charts/chart1.xml", "word/charts/chart2.xml"]
    document = Document(str(chemin))
    inlines = document.element.body.xpath(".//wp:inline")
    assert len({i.xpath("wp:docPr/@id")[0] for i in inlines}) == 2
    assert len({i.xpath("wp:docPr/@name")[0] for i in inlines}) == 2
    assert len({i.xpath(".//c:chart/@r:id")[0] for i in inlines}) == 2
    xml1, xml2 = xml_graphiques(chemin)
    assert "<c:barChart>" in xml1 and "<c:lineChart>" in xml2


def test_graphique_pptx_sans_classeur_incorpore(tmp_path):
    chemin, _ = generer_ok(tmp_path, demande_graphique("pptx"))
    assert noms_dans_archive(chemin, "ppt/embeddings") == []
    assert all("externalData" not in xml for xml in xml_graphiques(chemin))
    with zipfile.ZipFile(chemin) as z:
        assert not [n for n in z.namelist() if n.endswith(".rels") and b"/relationships/package\"" in z.read(n)]
    diapo = [d for d in Presentation(str(chemin)).slides if any(f.has_chart for f in d.shapes)][0]
    graphique = [f for f in diapo.shapes if f.has_chart][0].chart
    assert list(graphique.plots[0].categories) == ["2025", "2026"]
    assert [(s.name, list(s.values)) for s in graphique.plots[0].series] == [("Ventes", [21.0, 28.5]),
                                                                              ("Objectif", [20.0, 25.0])]
    assert diapo.shapes.title.text == "Chiffre d'affaires par année"
    assert diapo.shapes.title.text_frame.paragraphs[0].runs[0].font.size.pt == 28
    assert "Source : Direction financière, comptes provisoires" in [f.text_frame.text for f in diapo.shapes
                                                                      if f.has_text_frame]


@pytest.mark.parametrize("genre, valeurs, zero", [
    ("colonnes", [3, 5], True), ("barres", [3, 5], True), ("colonnes", [3, -5], False),
    ("barres", [-1, 5], False), ("courbe", [3, 5], False)])
def test_graphique_axe_a_zero_sauf_valeur_negative(tmp_path, genre, valeurs, zero):
    bloc = bloc_graphique(genre=genre, series=[{"nom": "S", "valeurs": valeurs}])
    chemin, _ = generer_ok(tmp_path, demande_graphique(blocs=[bloc]))
    (xml,) = xml_graphiques(chemin)
    assert bool(re.search(r'<c:min val="0(\.0)?"/>', xml)) is zero


@pytest.mark.parametrize("genre, inverse", [("barres", True), ("colonnes", False), ("courbe", False)])
def test_graphique_etiquettes_en_bas_et_barres_dans_l_ordre_de_lecture(tmp_path, genre, inverse):
    bloc = bloc_graphique(genre=genre, series=[{"nom": "S", "valeurs": [3, -5]}])
    chemin, _ = generer_ok(tmp_path, demande_graphique(blocs=[bloc]))
    (xml,) = xml_graphiques(chemin)
    categories = xml[xml.index("<c:catAx>"):xml.index("</c:catAx>")]
    assert '<c:tickLblPos val="low"/>' in categories  # sinon une valeur négative recouvre les étiquettes
    assert ('<c:orientation val="maxMin"/>' in categories) is inverse  # la première catégorie reste en haut
    assert ('<c:crosses val="max"/>' in xml[xml.index("<c:valAx>"):]) is inverse  # et l'axe des valeurs en bas


@pytest.mark.parametrize("langue, code", [("fr-BE", "[$-80C]General"), ("nl-BE", "[$-813]General"),
                                          ("en", "[$-409]General")])
def test_graphique_format_de_nombre_selon_la_langue(tmp_path, langue, code):
    chemin, _ = generer_ok(tmp_path, demande_graphique(langue=langue))
    (xml,) = xml_graphiques(chemin)
    assert f'<c:numFmt formatCode="{code}" sourceLinked="0"/>' in xml


@pytest.mark.parametrize("format_, charte", [("docx", False), ("docx", True), ("pptx", False), ("pptx", True)])
def test_graphique_couleur_accent_avec_et_sans_charte(tmp_path, format_, charte):
    if charte:
        poser_charte(tmp_path)
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_))
    (xml,) = xml_graphiques(chemin)
    accent = "1F6F5C" if charte else "1F4E8C"
    couleurs = re.findall(r'<c:ser>.*?<c:spPr><a:solidFill><a:srgbClr val="([0-9A-F]{6})"', xml, re.S)
    assert couleurs == [accent, "8C8C8C"]


def test_graphique_six_series_toutes_distinctes(tmp_path):
    series = [{"nom": f"Série {i}", "valeurs": [i, i + 1]} for i in range(1, 7)]
    chemin, _ = generer_ok(tmp_path, demande_graphique(blocs=[bloc_graphique(series=series)]))
    (xml,) = xml_graphiques(chemin)
    couleurs = re.findall(r'<c:ser>.*?<c:spPr><a:solidFill><a:srgbClr val="([0-9A-F]{6})"', xml, re.S)
    assert len(couleurs) == 6 and len(set(couleurs)) == 6


@pytest.mark.parametrize("format_", ["docx", "pptx"])
@pytest.mark.parametrize("genre", ["colonnes", "barres", "courbe"])
def test_graphique_identifiants_d_axes_entiers_non_signes(tmp_path, format_, genre):
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_, blocs=[bloc_graphique(genre=genre)]))
    (xml,) = xml_graphiques(chemin)
    axes = re.findall(r'<c:axId val="(-?\d+)"', xml)
    croises = re.findall(r'<c:crossAx val="(-?\d+)"', xml)
    assert len(croises) == 2 and all(0 <= int(v) < 2**31 for v in axes + croises)
    assert set(axes) == set(croises)  # chaque axe croise bien l'autre


@pytest.mark.parametrize("format_", ["docx", "pptx"])
def test_graphique_passe_le_controle_d_archive(tmp_path, format_):
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_))  # generer_ok appelle controler_archive
    ko = subprocess.run([str(PYTHON_VENV), "-I", str(CONTROLE), str(chemin)], capture_output=True, text=True)
    assert ko.returncode == 0, ko.stderr


def lignes_apercu(tmp_path, chemin) -> list[str]:
    sortie = tmp_path / "apercu"
    sortie.mkdir()
    processus = subprocess.run([str(PYTHON_VENV), "-I", str(DOCUMENTS), "apercu", str(chemin), str(sortie)],
                               capture_output=True, text=True, timeout=120)
    assert processus.returncode == 0, processus.stderr
    return (sortie / "apercu.txt").read_text(encoding="utf-8").splitlines()


@pytest.mark.parametrize("format_, attendus", [
    ("docx", [TEXTE_REMPLACEMENT, "2025 | 2026", "Ventes : 21 | 28.5", "Objectif : 20 | 25"]),
    ("pptx", ["2025 | 2026", "Ventes : 21 | 28.5", "Objectif : 20 | 25"])])
def test_apercu_reprend_le_graphique(tmp_path, format_, attendus):
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_))
    lignes = lignes_apercu(tmp_path, chemin)
    for attendu in attendus:
        assert attendu in lignes
    assert "Logo" not in lignes


@pytest.mark.parametrize("format_", ["docx", "pptx"])
def test_apercu_garde_les_chiffres_sans_notation_scientifique(tmp_path, format_):
    bloc = bloc_graphique(series=[{"nom": "Ventes", "valeurs": [1234567, 12345.67]}])
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_, blocs=[bloc]))
    assert "Ventes : 1234567 | 12345.67" in lignes_apercu(tmp_path, chemin)


@pytest.mark.parametrize("format_", ["docx", "pptx"])
@pytest.mark.parametrize("titre", ["\nX", "\n"])
def test_graphique_titre_commencant_par_un_saut_de_ligne(tmp_path, format_, titre):
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_, blocs=[bloc_graphique(titre=titre)]))
    if format_ == "pptx":
        diapo = [d for d in Presentation(str(chemin)).slides if any(f.has_chart for f in d.shapes)][0]
        titre_diapo = diapo.shapes.title
        tailles = [c.font.size.pt for p in titre_diapo.text_frame.paragraphs for c in p.runs]
        assert tailles == [28.0] * len(tailles) and (tailles or titre == "\n")


@pytest.mark.parametrize("format_", ["docx", "pptx"])
@pytest.mark.parametrize("points, etiquettes", [(30, True), (31, False)])
def test_graphique_etiquettes_de_valeur_coupees_au_dela_de_30_points(tmp_path, format_, points, etiquettes):
    bloc = bloc_graphique(categories=[str(i) for i in range(points)],
                          series=[{"nom": "S", "valeurs": [1] * points}])
    chemin, _ = generer_ok(tmp_path, demande_graphique(format_, blocs=[bloc]))
    (xml,) = xml_graphiques(chemin)
    assert ("<c:dLbls>" in xml) is etiquettes


def test_graphique_refuse_dans_un_xlsx(tmp_path):
    demande = demande_xlsx()
    demande["blocs"] = [bloc_graphique()]
    processus, _ = lancer(tmp_path, demande)
    assert processus.returncode == 2 and "interdit pour le format xlsx" in processus.stderr
