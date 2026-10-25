"""Tests du lot 5 : conversion PDF en cage, contrôle du PDF, provenance, évasions.

Comme test_documents.py, les fichiers sont produits et relus avec l'environnement figé
(/opt/atelier-fabrique/venv) et les cages sont lancées par fabrique/cage.py.
"""

import glob
import io
import json
import shutil
import socket
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

VENV = Path("/opt/atelier-fabrique/venv")
PYTHON_VENV = VENV / "bin" / "python"
DEPOT = Path(__file__).resolve().parents[2]
GENERATEURS = DEPOT / "fabrique" / "generateurs"

if not PYTHON_VENV.exists():
    pytest.skip("environnement figé absent : lancer sudo scripts/installer-fabrique-python.sh",
                allow_module_level=True)
if shutil.which("bwrap") is None or shutil.which("soffice") is None:
    pytest.skip("bwrap ou soffice absent", allow_module_level=True)

for site in glob.glob(str(VENV / "lib" / "python3*" / "site-packages")):
    sys.path.insert(0, site)

from defusedxml import ElementTree  # noqa: E402
from docx import Document  # noqa: E402
from pypdf import PdfReader, PdfWriter  # noqa: E402
from pypdf.generic import (DictionaryObject, NameObject, TextStringObject)  # noqa: E402

sys.path.insert(0, str(DEPOT))
from fabrique.cage import Etape, executer  # noqa: E402
from fabrique.generateurs import pdf as modulepdf  # noqa: E402
from fabrique.generateurs.pdf import LIMITE_APERCU, convertir  # noqa: E402

from .test_documents import demande_docx, demande_pptx, demande_xlsx  # noqa: E402

MONTAGE_CODE = ((str(GENERATEURS), "/code"),)


def fabriquer(tmp_path, demande, nom):
    """Produit un document Office avec le générateur du lot 4 ; rend son chemin."""
    entree = tmp_path / "gen-entree"
    sortie = tmp_path / "gen-sortie"
    entree.mkdir()
    sortie.mkdir()
    (entree / "demande.json").write_text(json.dumps(demande), encoding="utf-8")
    processus = subprocess.run(
        [str(PYTHON_VENV), "-I", str(GENERATEURS / "documents.py"), str(entree / "demande.json"), str(sortie)],
        capture_output=True, text=True, timeout=120)
    assert processus.returncode == 0, processus.stderr
    travail = tmp_path / "travail"
    travail.mkdir()
    shutil.copyfile(sortie / nom, travail / nom)
    return travail


def conversion_brute(tmp_path, fichier: Path, extension: str, delai=120):
    """Passe un fichier (éventuellement piégé) directement à la cage de conversion."""
    entree = tmp_path / "b-entree"
    sortie = tmp_path / "b-sortie"
    entree.mkdir()
    sortie.mkdir()
    shutil.copyfile(fichier, entree / f"document.{extension}")
    etape = Etape(
        type="pdf", programme=str(PYTHON_VENV),
        arguments=("-I", "/code/pdf.py", "convertir", f"/entree/document.{extension}", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie), montages_modeles=MONTAGE_CODE)
    return executer(etape, delai), sortie


def controle_brut(tmp_path, pdf: Path):
    entree = tmp_path / "c-entree"
    sortie = tmp_path / "c-sortie"
    entree.mkdir()
    sortie.mkdir()
    shutil.copyfile(pdf, entree / "document.pdf")
    etape = Etape(
        type="cpu", programme=str(PYTHON_VENV),
        arguments=("-I", "/code/pdf.py", "controler", "/entree/document.pdf", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie), montages_modeles=MONTAGE_CODE)
    return executer(etape, 90), sortie


def cles_presentes(lecteur) -> bool:
    try:
        modulepdf.verifier_pdf(lecteur)
    except modulepdf.PdfRefuse:
        return True
    return False


# ---------- conversion réelle des trois formats ----------

@pytest.mark.parametrize("fabrique_demande, nom", [
    (demande_docx, "document.docx"), (demande_xlsx, "document.xlsx"), (demande_pptx, "document.pptx")])
def test_conversion_des_trois_formats(tmp_path, fabrique_demande, nom):
    travail = fabriquer(tmp_path, fabrique_demande(), nom)
    resultat = convertir(travail, nom)
    assert resultat.ok, resultat.motif
    lecteur = PdfReader(str(resultat.pdf))
    assert len(lecteur.pages) >= 1
    assert not lecteur.is_encrypted
    assert not cles_presentes(lecteur)
    texte = resultat.apercu.read_text(encoding="utf-8")
    assert texte.strip()
    if nom.endswith(".docx"):
        assert "Introduction" in texte and "Fin du document." in texte


def test_provenance_info_et_xmp(tmp_path):
    travail = fabriquer(tmp_path, demande_docx(), "document.docx")
    resultat = convertir(travail, "document.docx")
    assert resultat.ok, resultat.motif
    lecteur = PdfReader(str(resultat.pdf))
    assert lecteur.metadata["/Producer"] == "Atelier Marketing IA"
    assert lecteur.metadata["/Subject"] == "Contenu généré avec l'IA"
    xmp = ElementTree.fromstring(lecteur.trailer["/Root"]["/Metadata"].get_object().get_data())
    espaces = {"pdf": "http://ns.adobe.com/pdf/1.3/",
               "dc": "http://purl.org/dc/elements/1.1/",
               "ipt": "http://iptc.org/std/Iptc4xmpExt/2008-02-29/",
               "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"}
    assert xmp.find(".//pdf:Producer", espaces).text == "Atelier Marketing IA"
    assert xmp.find(".//ipt:DigitalSourceType", espaces).text == \
        "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
    assert xmp.find(".//dc:description//rdf:li", espaces).text == "Contenu généré avec l'IA"


def test_apercu_tronque_a_la_limite(tmp_path):
    blocs = [{"type": "paragraphe", "texte": "mot " * 1000} for _ in range(8)]
    demande = demande_docx(blocs=blocs)
    travail = fabriquer(tmp_path, demande, "document.docx")
    resultat = convertir(travail, "document.docx")
    assert resultat.ok, resultat.motif
    texte = resultat.apercu.read_text(encoding="utf-8")
    assert len(texte) == LIMITE_APERCU


def test_convertir_refuse_un_nom_ou_une_extension_invalide(tmp_path):
    for nom in ("../x.docx", "a/b.docx", "doc.exe", "doc"):
        with pytest.raises(ValueError):
            convertir(tmp_path, nom)


# ---------- contrôle du PDF ----------

def pdf_avec(tmp_path, nom, ajouter):
    ecrivain = PdfWriter()
    ecrivain.add_blank_page(200, 200)
    ajouter(ecrivain)
    chemin = tmp_path / nom
    with open(chemin, "wb") as f:
        ecrivain.write(f)
    return chemin


def test_pdf_avec_openaction_javascript_est_refuse(tmp_path):
    def ajout(e):
        e.add_js("app.alert('x')")
        action = DictionaryObject({NameObject("/S"): NameObject("/JavaScript"),
                                   NameObject("/JS"): TextStringObject("app.alert('y')")})
        e._root_object[NameObject("/OpenAction")] = e._add_object(action)
    pdf = pdf_avec(tmp_path, "piege.pdf", ajout)
    resultat, sortie = controle_brut(tmp_path, pdf)
    assert resultat.code == 3, resultat.erreur
    assert b"OpenAction" in resultat.erreur and b"JavaScript" in resultat.erreur
    assert list(sortie.iterdir()) == []


def test_pdf_avec_lien_http_ou_launch_est_refuse_et_https_passe(tmp_path):
    def lien(adresse):
        def ajout(e):
            action = DictionaryObject({NameObject("/S"): NameObject("/URI"),
                                       NameObject("/URI"): TextStringObject(adresse)})
            annotation = DictionaryObject({NameObject("/Type"): NameObject("/Annot"),
                                           NameObject("/Subtype"): NameObject("/Link"),
                                           NameObject("/A"): e._add_object(action)})
            e.pages[0][NameObject("/Annots")] = e._add_object(
                __import__("pypdf").generic.ArrayObject([e._add_object(annotation)]))
        return ajout
    (tmp_path / "a").mkdir()
    (tmp_path / "b").mkdir()
    refuse, _ = controle_brut(tmp_path / "a", pdf_avec(tmp_path, "http.pdf", lien("http://exemple.be")))
    assert refuse.code == 3 and b"URI" in refuse.erreur
    fichier = pdf_avec(tmp_path, "https.pdf", lien("https://exemple.be"))
    accepte, sortie = controle_brut(tmp_path / "b", fichier)
    assert accepte.code == 0, accepte.erreur
    assert (sortie / "document.pdf").is_file()


def test_pdf_chiffre_est_refuse(tmp_path):
    def ajout(e):
        e.encrypt("secret")
    resultat, _ = controle_brut(tmp_path, pdf_avec(tmp_path, "chiffre.pdf", ajout))
    assert resultat.code == 3


# ---------- évasions : documents piégés donnés directement à la cage ----------

def docx_piege(tmp_path, secret: Path) -> Path:
    """Docx fabriqué : champ INCLUDETEXT vers un fichier hôte, image distante, lien externe."""
    document = Document()
    document.add_paragraph("Corps visible du document piégé")
    tampon = io.BytesIO()
    document.save(tampon)
    entree = zipfile.ZipFile(io.BytesIO(tampon.getvalue()))
    chemin = tmp_path / "piege.docx"
    champs = (
        '<w:p><w:fldSimple w:instr=\'INCLUDETEXT "/etc/hostname"\'><w:r><w:t>vide1</w:t></w:r></w:fldSimple></w:p>'
        f'<w:p><w:fldSimple w:instr=\'INCLUDETEXT "{secret}"\'><w:r><w:t>vide2</w:t></w:r></w:fldSimple></w:p>'
        '<w:p><w:fldSimple w:instr=\'INCLUDEPICTURE "http://127.0.0.1:3100/x.png"\'><w:r><w:t>vide3</w:t></w:r></w:fldSimple></w:p>'
    )
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as sortie:
        for info in entree.infolist():
            donnees = entree.read(info.filename)
            if info.filename == "word/document.xml":
                texte = donnees.decode("utf-8")
                texte = texte.replace("<w:sectPr", champs + "<w:sectPr", 1)
                donnees = texte.encode("utf-8")
            sortie.writestr(info, donnees)
    return chemin


def test_docx_piege_ne_fuit_aucun_contenu_hote(tmp_path):
    secret = tmp_path / "secret-factice.txt"
    secret.write_text("CONTENU-SECRET-HOTE-12345", encoding="utf-8")
    hostname = Path("/etc/hostname").read_text().strip()
    piege = docx_piege(tmp_path, secret)
    resultat, sortie = conversion_brute(tmp_path, piege, "docx")
    # La conversion peut réussir (champs vides) : dans tous les cas, rien du fichier hôte.
    assert not resultat.delai_depasse
    if (sortie / "document.pdf").is_file():
        lecteur = PdfReader(str(sortie / "document.pdf"))
        texte = "\n".join(p.extract_text() or "" for p in lecteur.pages)
        assert "Corps visible" in texte
        assert "CONTENU-SECRET-HOTE-12345" not in texte
        assert hostname not in texte.replace("Corps visible du document piégé", "")
    for fichier in sortie.rglob("*"):
        if fichier.is_file():
            assert b"CONTENU-SECRET-HOTE-12345" not in fichier.read_bytes()


def odt_avec_macro() -> bytes:
    """Document ODF avec une macro Basic liée à l'événement « ouverture du document »."""
    manifeste = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'
        '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>'
        '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
        '<manifest:file-entry manifest:full-path="Basic/script-lc.xml" manifest:media-type="text/xml"/>'
        '<manifest:file-entry manifest:full-path="Basic/Standard/script-lb.xml" manifest:media-type="text/xml"/>'
        '<manifest:file-entry manifest:full-path="Basic/Standard/Module1.xml" manifest:media-type="text/xml"/>'
        '</manifest:manifest>')
    contenu = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">'
        '<office:body><office:text><text:p>Texte ODF avec macro</text:p></office:text></office:body>'
        '</office:document-content>')
    evenements = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">')
    del evenements  # les événements sont posés dans le contenu ci-dessous
    contenu = contenu.replace(
        '<office:body>',
        '<office:scripts><office:event-listeners>'
        '<script:event-listener xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" script:language="ooo:script" script:event-name="dom:load" '
        'xlink:href="vnd.sun.star.script:Standard.Module1.Marqueur?language=Basic&amp;location=document" '
        'xlink:type="simple"/></office:event-listeners></office:scripts><office:body>')
    liste_lc = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<library:libraries xmlns:library="http://openoffice.org/2000/library" '
        'xmlns:xlink="http://www.w3.org/1999/xlink"><library:library library:name="Standard" '
        'library:link="false"/></library:libraries>')
    liste_lb = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" '
        'library:readonly="false" library:passwordprotected="false">'
        '<library:element library:name="Module1"/></library:library>')
    module = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" '
        'script:language="StarBasic">Sub Marqueur&#10;  Dim n As Integer&#10;  n = FreeFile&#10;'
        '  Open "/sortie/marqueur-macro.txt" For Output As #n&#10;  Print #n, "macro executee"&#10;'
        '  Close #n&#10;End Sub&#10;</script:module>')
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.text")
        z.writestr("META-INF/manifest.xml", manifeste)
        z.writestr("content.xml", contenu)
        z.writestr("Basic/script-lc.xml", liste_lc)
        z.writestr("Basic/Standard/script-lb.xml", liste_lb)
        z.writestr("Basic/Standard/Module1.xml", module)
    return tampon.getvalue()


def test_macro_a_l_ouverture_n_est_pas_executee(tmp_path):
    odt = tmp_path / "macro.odt"
    odt.write_bytes(odt_avec_macro())
    # LIMITE CONNUE : aucun témoin positif. Même avec un profil laxiste (sécurité des macros au plus
    # bas), cette version de LibreOffice n'exécute pas la macro d'ouverture lors d'une conversion
    # sans interface (essayé hors cage et en cage) ; l'absence du marqueur prouve donc peu à elle
    # seule. Elle est complétée par le contrôle direct du profil (test_profil_*).
    resultat, sortie2 = conversion_brute(tmp_path, odt, "odt")
    assert not resultat.delai_depasse
    assert not (sortie2 / "marqueur-macro.txt").exists(), "la macro s'est exécutée sous le profil durci"


def test_docm_avec_macro_autoopen_ne_s_execute_pas(tmp_path):
    """Docm fabriqué (vbaProject.bin factice + type de contenu macro) : jamais exécuté ni propagé."""
    base = io.BytesIO()
    Document().save(base)
    chemin = tmp_path / "macro.docm"
    with zipfile.ZipFile(io.BytesIO(base.getvalue())) as source, zipfile.ZipFile(chemin, "w") as sortie:
        for info in source.infolist():
            donnees = source.read(info.filename)
            if info.filename == "[Content_Types].xml":
                donnees = donnees.replace(
                    b"wordprocessingml.document.main+xml", b"wordprocessingml.document.macroEnabled.main+xml")
            sortie.writestr(info, donnees)
        sortie.writestr("word/vbaProject.bin", b"Sub AutoOpen()\nOpen \"/sortie/marqueur-docm.txt\" For Output As #1\nEnd Sub\n")
    resultat, sortie = conversion_brute(tmp_path, chemin, "docx")
    assert not resultat.delai_depasse
    assert not (sortie / "marqueur-docm.txt").exists()


def test_la_cage_n_a_pas_de_reseau(tmp_path):
    ecoute = socket.socket()
    ecoute.bind(("127.0.0.1", 0))
    ecoute.listen(1)
    ecoute.settimeout(0.5)
    port = ecoute.getsockname()[1]
    entree = tmp_path / "e"
    sortie = tmp_path / "s"
    entree.mkdir()
    sortie.mkdir()
    code = (f"import socket,sys\ns=socket.socket();s.settimeout(3)\n"
            f"try:\n s.connect(('127.0.0.1',{port}))\nexcept OSError as e:\n print('ECHEC',e.errno);sys.exit(7)\n"
            "print('CONNECTE')")
    etape = Etape(type="pdf", programme=str(PYTHON_VENV), arguments=("-I", "-c", code),
                  dossier_entree=str(entree), dossier_sortie=str(sortie))
    resultat = executer(etape, 30)
    try:
        ecoute.accept()
        accepte = True
    except socket.timeout:
        accepte = False
    finally:
        ecoute.close()
    assert resultat.code == 7 and b"ECHEC" in resultat.sortie
    assert not accepte, "la cage a pu joindre l'hôte"


def test_profil_jetable_contient_les_cles_de_securite():
    """Le profil écrit contient les clés vérifiées dans le schéma main.xcd de LibreOffice."""
    racine = ElementTree.fromstring(modulepdf.PROFIL_XCU.encode("utf-8"))
    ns = "{http://openoffice.org/2001/registry}"
    valeurs = {(i.get(ns + "path"), p.get(ns + "name")): p.find("value").text
               for i in racine for p in i}
    scripting = "/org.openoffice.Office.Common/Security/Scripting"
    assert valeurs[(scripting, "MacroSecurityLevel")] == "3"
    assert valeurs[(scripting, "DisableMacrosExecution")] == "true"
    assert valeurs[("/org.openoffice.Office.Writer/Content/Update", "Link")] == "2"
    assert valeurs[("/org.openoffice.Office.Calc/Content/Update", "Link")] == "2"
    assert valeurs[("/org.openoffice.Office.Update/Update", "Enabled")] == "false"
