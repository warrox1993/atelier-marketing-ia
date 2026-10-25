"""Conversion PDF d'un document Office de la fabrique, contrôle du PDF et provenance (lot 5).

Deux étapes, chacune dans sa propre cage (docs/conception-execution-etroite.md §6.2) :

1. conversion, dans une cage de type `pdf` (LibreOffice) :

       python -I pdf.py convertir /entree/document.<ext> /sortie

   écrit un profil LibreOffice jetable (macros coupées, liens non mis à jour, pas de recherche
   de mise à jour) dans /tmp/lo, puis remplace le processus par `soffice` (os.execv, aucun
   shell de notre côté) ; produit /sortie/document.pdf ;

2. contrôle et provenance, dans une cage de type `cpu` (pypdf du venv figé) :

       python -I pdf.py controler /entree/document.pdf /sortie

   refuse tout PDF actif (JavaScript, lancement, fichiers joints, lien autre que https, chiffré),
   écrit /sortie/document.pdf (métadonnées Info + XMP de provenance) et /sortie/apercu.txt.

Côté hôte, `convertir(dossier_travail, nom_fichier)` enchaîne les deux cages via fabrique.cage.
Codes de sortie du mode `controler` : 0 succès ; 3 PDF refusé (motif sur la sortie d'erreur) ;
1 erreur interne.

Les imports de pypdf et defusedxml sont faits à l'usage : le mode `convertir` et le côté hôte
n'en ont pas besoin.
"""

from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

PRODUCTEUR = "Atelier Marketing IA"
DESCRIPTION = "Contenu généré avec l'IA"
TYPE_SOURCE_NUMERIQUE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
MOTS_CLES = "trainedAlgorithmicMedia"
LIMITE_APERCU = 20000
EXTENSIONS = ("docx", "xlsx", "pptx")
CLES_INTERDITES = ("/JavaScript", "/JS", "/OpenAction", "/AA", "/Launch", "/EmbeddedFiles",
                   "/EmbeddedFile", "/RichMedia")
SOFFICE = "/usr/bin/soffice"
PROFIL_LO = "/tmp/lo"

# Profil LibreOffice. Chaque clé vient du schéma officiel installé :
# /usr/lib/libreoffice/share/registry/main.xcd (composant : chemin, nom, type, défaut).
#  - Office.Common : Security/Scripting, MacroSecurityLevel (int, défaut 2 ; 0 faible, 1 moyen,
#    2 élevé, 3 très élevé), DisableMacrosExecution (boolean, « désactive Basic, Beanshell,
#    Javascript et Python »), BlockUntrustedRefererLinks (boolean, défaut false).
#  - Office.Writer : Content/Update, Link (int, défaut 1 ; 0 toujours, 1 sur demande, 2 jamais),
#    Field (boolean, défaut true : mise à jour des champs au chargement).
#  - Office.Calc : Content/Update, Link (int, défaut 2 ; 2 = jamais).
#  - Office.Update : Update, Enabled (boolean, « mise à jour automatique activée », défaut true).
PROFIL_XCU = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Field" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Update/Update"><prop oor:name="Enabled" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
"""


# Java coupé : la JVM plante dans la cage et laissait des hs_err_pid*.log dans la sortie. Le schéma
# main.xcd n'a aucune clé Office.Java/VirtualMachine/Enable (seulement Security, NetAccess,
# RunUnoComponentsOutOfProcess) : l'interrupteur de LibreOffice est le fichier de réglages de
# jvmfwk (`enabled`), dans le profil, nommé selon la plateforme.
JAVA_COUPE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<java xmlns="http://openoffice.org/2004/java/framework/1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<enabled xsi:nil="false">false</enabled>
<userClassPath xsi:nil="true"/>
<vmParameters xsi:nil="true"/>
<jreLocations xsi:nil="true"/>
<javaInfo xsi:nil="true" autoSelect="true"/>
</java>
"""
FICHIER_JAVA = "javasettings_Linux_X86_64.xml"


class PdfRefuse(Exception):
    """PDF refusé par le contrôle."""


# ---------- étape 1 : conversion (dans la cage) ----------

def lancer_conversion(source: str, sortie: str) -> None:
    """Écrit le profil jetable puis remplace le processus par soffice. Ne rend jamais la main."""
    user = Path(PROFIL_LO) / "user"
    user.mkdir(parents=True, exist_ok=True)
    (user / "registrymodifications.xcu").write_text(PROFIL_XCU, encoding="utf-8")
    (user / "config").mkdir(exist_ok=True)
    (user / "config" / FICHIER_JAVA).write_text(JAVA_COUPE_XML, encoding="utf-8")
    argv = [SOFFICE, "--headless", "--norestore", "--nolockcheck", "--nodefault", "--nologo",
            f"-env:UserInstallation=file://{PROFIL_LO}", "--convert-to", "pdf",
            "--outdir", sortie, source]
    os.execv(SOFFICE, argv)


# ---------- étape 2 : contrôle et provenance (dans la cage) ----------

def _nom(cle) -> str:
    return str(cle)


def _parcourir(objet, vus: set, trouvailles: list[str], lecteur) -> None:
    """Parcourt récursivement un objet PDF et note les clés ou valeurs interdites."""
    from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject, StreamObject

    pile = [objet]
    while pile:
        courant = pile.pop()
        if isinstance(courant, IndirectObject):
            cle = (courant.idnum, courant.generation)
            if cle in vus:
                continue
            vus.add(cle)
            try:
                pile.append(courant.get_object())
            except Exception as erreur:  # objet illisible : on refuse par prudence
                trouvailles.append(f"objet illisible {cle[0]} : {type(erreur).__name__}")
            continue
        if isinstance(courant, (DictionaryObject, StreamObject)):
            for cle, valeur in courant.items():
                nom = _nom(cle)
                if nom in CLES_INTERDITES:
                    trouvailles.append(nom)
                if nom == "/URI":
                    uri = valeur.get_object() if isinstance(valeur, IndirectObject) else valeur
                    texte = uri if isinstance(uri, str) else str(uri)
                    if not texte.strip().lower().startswith("https:"):
                        trouvailles.append("/URI non https")
                if nom == "/S" and _nom(valeur) in ("/JavaScript", "/Launch", "/ImportData", "/SubmitForm"):
                    trouvailles.append(f"action {_nom(valeur)}")
                pile.append(valeur)
        elif isinstance(courant, ArrayObject):
            pile.extend(courant)


def verifier_pdf(lecteur) -> None:
    """Refuse un PDF chiffré ou contenant une clé interdite, dans n'importe quel objet."""
    if lecteur.is_encrypted:
        raise PdfRefuse("PDF chiffré")
    trouvailles: list[str] = []
    vus: set = set()
    _parcourir(lecteur.trailer, vus, trouvailles, lecteur)
    # Objets non atteignables depuis la racine : on les parcourt aussi.
    from pypdf.generic import IndirectObject
    for generation, objets in lecteur.xref.items():
        for numero in objets:
            _parcourir(IndirectObject(numero, generation, lecteur), vus, trouvailles, lecteur)
    for numero in lecteur.xref_objStm:
        _parcourir(IndirectObject(numero, 0, lecteur), vus, trouvailles, lecteur)
    if trouvailles:
        raise PdfRefuse("contenu actif ou lien interdit : " + ", ".join(sorted(set(trouvailles))))


def _echapper(texte: str) -> str:
    return texte.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def construire_xmp(titre: str) -> bytes:
    """Paquet XMP de provenance (producteur, description, source numérique IPTC)."""
    xml = f"""<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about=""
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
 xmlns:xmp="http://ns.adobe.com/xap/1.0/"
 xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
<pdf:Producer>{_echapper(PRODUCTEUR)}</pdf:Producer>
<xmp:CreatorTool>{_echapper(PRODUCTEUR)}</xmp:CreatorTool>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">{_echapper(titre)}</rdf:li></rdf:Alt></dc:title>
<dc:description><rdf:Alt><rdf:li xml:lang="x-default">{_echapper(DESCRIPTION)}</rdf:li></rdf:Alt></dc:description>
<Iptc4xmpExt:DigitalSourceType>{TYPE_SOURCE_NUMERIQUE}</Iptc4xmpExt:DigitalSourceType>
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"""
    return xml.encode("utf-8")


def poser_provenance(lecteur, destination: str) -> str:
    """Écrit le PDF avec ses métadonnées de provenance ; rend le texte extrait (non tronqué)."""
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, NameObject

    ancien = lecteur.metadata or {}
    titre = str(ancien.get("/Title") or "") or "Document"
    ecrivain = PdfWriter(clone_from=lecteur)
    ecrivain.add_metadata({
        "/Producer": PRODUCTEUR, "/Creator": PRODUCTEUR, "/Title": titre,
        "/Subject": DESCRIPTION, "/Keywords": MOTS_CLES,
    })
    flux = DecodedStreamObject()
    flux.set_data(construire_xmp(titre))
    flux.update({NameObject("/Type"): NameObject("/Metadata"), NameObject("/Subtype"): NameObject("/XML")})
    ecrivain._root_object[NameObject("/Metadata")] = ecrivain._add_object(flux)
    with open(destination, "wb") as fichier:
        ecrivain.write(fichier)
    return "\n".join((page.extract_text() or "") for page in lecteur.pages)


def controler(source: str, sortie: str) -> int:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    dossier = Path(sortie)
    try:
        lecteur = PdfReader(source)
        verifier_pdf(lecteur)
        texte = poser_provenance(lecteur, str(dossier / "document.pdf"))
    except PdfRefuse as erreur:
        print(f"PDF refusé : {erreur}", file=sys.stderr)
        return 3
    except (PyPdfError, ValueError, OSError) as erreur:
        print(f"PDF illisible : {type(erreur).__name__} : {erreur}", file=sys.stderr)
        return 3
    (dossier / "apercu.txt").write_text(texte[:LIMITE_APERCU], encoding="utf-8")
    print('{"fichier": "document.pdf", "apercu": "apercu.txt"}')
    return 0


# ---------- côté hôte ----------

@dataclass(frozen=True)
class Resultat:
    ok: bool
    motif: str  # vide si ok
    pdf: Path | None = None
    apercu: Path | None = None
    duree_s: float = 0.0


def _etape_pdf_puis_controle(travail: Path, extension: str):
    from fabrique.cage import DELAI_DOCUMENT_S, DELAI_PDF_S, Etape, executer, recuperer_sortie

    dossier_code = str(Path(__file__).resolve().parent)
    python = "/opt/atelier-fabrique/venv/bin/python"
    montage = ((dossier_code, "/code"),)
    entree1, sortie1, entree2, sortie2 = (travail / n for n in ("conv-entree", "conv-sortie", "ctrl-entree", "final"))
    conversion = Etape(
        type="pdf", programme=python,
        arguments=("-I", "/code/pdf.py", "convertir", f"/entree/document.{extension}", "/sortie"),
        dossier_entree=str(entree1), dossier_sortie=str(sortie1), montages_modeles=montage)
    r1 = executer(conversion, DELAI_PDF_S)
    if r1.delai_depasse or r1.code != 0:
        return None, "conversion échouée" + (" (délai dépassé)" if r1.delai_depasse else f" (code {r1.code})"), r1.duree_s
    brut = recuperer_sortie(sortie1, ["document.pdf"])
    if not brut:
        return None, "conversion sans PDF", r1.duree_s
    shutil.copyfile(brut[0], entree2 / "document.pdf")
    controle = Etape(
        type="cpu", programme=python,
        arguments=("-I", "/code/pdf.py", "controler", "/entree/document.pdf", "/sortie"),
        dossier_entree=str(entree2), dossier_sortie=str(sortie2), montages_modeles=montage)
    r2 = executer(controle, DELAI_DOCUMENT_S)
    duree = r1.duree_s + r2.duree_s
    if r2.delai_depasse or r2.code != 0:
        detail = r2.erreur.decode("utf-8", "replace").strip()
        return None, detail or f"contrôle échoué (code {r2.code})", duree
    return recuperer_sortie(sortie2, ["document.pdf", "apercu.txt"]), "", duree


def convertir(dossier_travail, nom_fichier: str) -> Resultat:
    """Convertit `nom_fichier` (docx, xlsx ou pptx, situé dans `dossier_travail`) en PDF contrôlé.

    Crée dans `dossier_travail` les sous-dossiers conv-entree, conv-sortie, ctrl-entree et final
    (qui doivent être absents ou vides). Aucun shell : deux cages successives (fabrique.cage).
    Rend Resultat(ok, motif, pdf, apercu, duree_s) ; en cas de succès, `pdf` et `apercu` sont dans
    `dossier_travail/final`. Un refus ou un échec rend ok=False avec le motif, jamais d'exception
    pour un document piégé.
    """
    travail = Path(dossier_travail).resolve()
    if not nom_fichier or "/" in nom_fichier or "\0" in nom_fichier or nom_fichier in (".", ".."):
        raise ValueError(f"nom de fichier invalide : {nom_fichier!r}")
    extension = nom_fichier.rsplit(".", 1)[-1].lower() if "." in nom_fichier else ""
    if extension not in EXTENSIONS:
        raise ValueError(f"extension non prise en charge : {extension!r}")
    source = travail / nom_fichier
    if source.is_symlink() or not source.is_file():
        raise ValueError("le document doit être un fichier régulier")
    for nom in ("conv-entree", "conv-sortie", "ctrl-entree", "final"):
        (travail / nom).mkdir(exist_ok=False)
    shutil.copyfile(source, travail / "conv-entree" / f"document.{extension}")
    trouves, motif, duree = _etape_pdf_puis_controle(travail, extension)
    if trouves is None:
        return Resultat(False, motif, duree_s=duree)
    par_nom = {p.name: p for p in trouves}
    if set(par_nom) != {"document.pdf", "apercu.txt"}:
        return Resultat(False, "sortie du contrôle incomplète", duree_s=duree)
    return Resultat(True, "", par_nom["document.pdf"], par_nom["apercu.txt"], duree)


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == "convertir":
        lancer_conversion(argv[1], argv[2])
        return 1  # inatteignable : execv ne rend pas la main
    if len(argv) == 3 and argv[0] == "controler":
        try:
            return controler(argv[1], argv[2])
        except Exception as erreur:
            print(f"erreur interne : {type(erreur).__name__} : {erreur}", file=sys.stderr)
            return 1
    print("usage : pdf.py convertir <document> <dossier_sortie> | controler <pdf> <dossier_sortie>",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
