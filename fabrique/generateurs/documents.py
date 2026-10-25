"""Générateur de documents Office (docx, xlsx, pptx) à partir d'une demande JSON.

Point d'entrée, exécuté DANS la cage par l'environnement figé de la fabrique :

    python -I documents.py /entree/demande.json /sortie

Écrit `document.<format>` dans le dossier de sortie (pour `pdf` : un `document.docx`
intermédiaire, la conversion en PDF étant faite par une étape suivante). Affiche sur la
sortie standard un objet JSON `{"fichier": "...", "intermediaire_pdf": bool}`.

Seconde commande, `apercu <document> <dossier_sortie>` : écrit `apercu.txt` (texte du document,
20 000 caractères au plus).

Codes de sortie : 0 succès ; 2 demande refusée (message sur la sortie d'erreur) ; 1 erreur
interne. Aucun fichier fourni par l'agent n'est ouvert : tout vient du JSON et du gabarit
« sobre » construit ici. Aucune formule n'est jamais écrite. Voir
docs/conception-execution-etroite.md §5 et §6.1. La demande est revalidée ici : la
fabrique ne fait pas confiance au plugin.
"""

from __future__ import annotations

import datetime
import json
import math
import re
import sys
from pathlib import Path

# ---------- limites (miroir de plugin-atelier/src/contrats/fabrique-outils-schemas.ts) ----------

FORMATS = ("docx", "xlsx", "pptx", "pdf")
MODELES = ("sobre",)
LANGUES = ("fr-BE", "nl-BE", "en")
TYPES_CELLULE = ("texte", "nombre", "date", "booleen")
LIMITE_TITRE = 200
LIMITE_BLOCS = 2000
LIMITE_COLONNES = 50
LIMITE_LIGNES = 2000
LIMITE_FEUILLES = 20
LIMITE_TEXTE = 20000
LIMITE_ELEMENTS_LISTE = 500
LIMITE_PLAGES = 500
LIMITE_NOM_FEUILLE = 31
TAILLE_MAX_DEMANDE = 64 * 1024 * 1024

AUTEUR = "Atelier Marketing IA"
COMMENTAIRE = "Contenu généré avec l'IA"
MOTS_CLES = "trainedAlgorithmicMedia"
POLICE = "Arial"

# Caractères interdits en XML 1.0 (contrôles, demi-paires isolées, U+FFFE/U+FFFF).
_CARACTERES_INTERDITS = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff￾￿]")
_NOM_FEUILLE_INTERDIT = re.compile(r"[\[\]:*?/\\]")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class DemandeInvalide(Exception):
    """Demande refusée : le message dit quel champ et pourquoi."""


# ---------- validation ----------

def _refuser(chemin: str, message: str):
    raise DemandeInvalide(f"{chemin} : {message}")


def _objet(valeur, chemin: str, requises: tuple[str, ...], optionnelles: tuple[str, ...] = ()) -> dict:
    if not isinstance(valeur, dict):
        _refuser(chemin, "objet attendu")
    inconnus = sorted(set(valeur) - set(requises) - set(optionnelles))
    if inconnus:
        _refuser(chemin, f"champ inconnu : {inconnus[0]!r}")
    for nom in requises:
        if nom not in valeur:
            _refuser(chemin, f"champ obligatoire absent : {nom!r}")
    return valeur


def _liste(valeur, chemin: str, maximum: int) -> list:
    if not isinstance(valeur, list):
        _refuser(chemin, "liste attendue")
    if len(valeur) > maximum:
        _refuser(chemin, f"trop d'éléments ({len(valeur)} > {maximum})")
    return valeur


def _texte(valeur, chemin: str, minimum: int = 0, maximum: int = LIMITE_TEXTE) -> str:
    if not isinstance(valeur, str):
        _refuser(chemin, "texte attendu")
    if not minimum <= len(valeur) <= maximum:
        _refuser(chemin, f"longueur {len(valeur)} hors de [{minimum}, {maximum}]")
    if _CARACTERES_INTERDITS.search(valeur):
        _refuser(chemin, "caractère de contrôle interdit")
    return valeur


def _entier(valeur, chemin: str, minimum: int, maximum: int | None = None) -> int:
    if isinstance(valeur, bool) or not isinstance(valeur, int):
        _refuser(chemin, "entier attendu")
    if valeur < minimum or (maximum is not None and valeur > maximum):
        _refuser(chemin, "entier hors limites")
    return valeur


def _enumere(valeur, chemin: str, permis: tuple[str, ...]) -> str:
    if not isinstance(valeur, str) or valeur not in permis:
        _refuser(chemin, f"valeur permise : {', '.join(permis)}")
    return valeur


def _frontieres_utf16(texte: str) -> dict[int, int]:
    """Associe chaque décalage UTF-16 situé sur une frontière de caractère à l'indice en points de code."""
    frontieres = {0: 0}
    decalage = 0
    for indice, caractere in enumerate(texte, start=1):
        decalage += 2 if ord(caractere) > 0xFFFF else 1
        frontieres[decalage] = indice
    return frontieres


def _plages(valeur, chemin: str, texte: str) -> list[tuple[int, int]]:
    """Valide les plages {debut, fin}, exprimées en unités UTF-16 (comme le plugin JavaScript).

    Rend des indices en points de code, utilisables directement pour découper `texte`.
    """
    frontieres = _frontieres_utf16(texte)
    longueur_utf16 = max(frontieres)
    resultat = []
    for i, plage in enumerate(_liste(valeur, chemin, LIMITE_PLAGES)):
        p = _objet(plage, f"{chemin}[{i}]", ("debut", "fin"))
        debut = _entier(p["debut"], f"{chemin}[{i}].debut", 0)
        fin = _entier(p["fin"], f"{chemin}[{i}].fin", 0)
        if not debut < fin <= longueur_utf16:
            _refuser(f"{chemin}[{i}]", "plage vide ou hors du texte")
        if debut not in frontieres or fin not in frontieres:
            _refuser(f"{chemin}[{i}]", "plage coupant un caractère (paire de substitution UTF-16)")
        resultat.append((frontieres[debut], frontieres[fin]))
    return resultat


def _bloc(brut, chemin: str) -> dict:
    if not isinstance(brut, dict) or not isinstance(brut.get("type"), str):
        _refuser(chemin, "bloc invalide (champ 'type' absent)")
    genre = brut["type"]
    if genre == "titre":
        b = _objet(brut, chemin, ("type", "niveau", "texte"))
        return {"type": genre, "niveau": _entier(b["niveau"], f"{chemin}.niveau", 1, 3),
                "texte": _texte(b["texte"], f"{chemin}.texte")}
    if genre == "paragraphe":
        b = _objet(brut, chemin, ("type", "texte"), ("gras", "italique"))
        texte = _texte(b["texte"], f"{chemin}.texte")
        return {"type": genre, "texte": texte,
                "gras": _plages(b.get("gras", []), f"{chemin}.gras", texte),
                "italique": _plages(b.get("italique", []), f"{chemin}.italique", texte)}
    if genre == "liste":
        b = _objet(brut, chemin, ("type", "elements"), ("ordonnee",))
        ordonnee = b.get("ordonnee", False)
        if not isinstance(ordonnee, bool):
            _refuser(f"{chemin}.ordonnee", "booléen attendu")
        elements = [_texte(t, f"{chemin}.elements[{i}]")
                    for i, t in enumerate(_liste(b["elements"], f"{chemin}.elements", LIMITE_ELEMENTS_LISTE))]
        return {"type": genre, "ordonnee": ordonnee, "elements": elements}
    if genre == "tableau":
        return _tableau(brut, chemin)
    if genre == "saut_de_page":
        _objet(brut, chemin, ("type",))
        return {"type": genre}
    if genre == "image":
        _objet(brut, chemin, ("type", "livrable"), ("legende",))
        _refuser(chemin, "images pas encore prises en charge")
    _refuser(chemin, f"type de bloc inconnu : {genre!r}")


def _tableau(brut: dict, chemin: str) -> dict:
    b = _objet(brut, chemin, ("type", "lignes"), ("entetes",))
    entetes = [_texte(t, f"{chemin}.entetes[{i}]")
               for i, t in enumerate(_liste(b.get("entetes", []), f"{chemin}.entetes", LIMITE_COLONNES))]
    lignes = []
    for i, ligne in enumerate(_liste(b["lignes"], f"{chemin}.lignes", LIMITE_LIGNES)):
        cellules = _liste(ligne, f"{chemin}.lignes[{i}]", LIMITE_COLONNES)
        lignes.append([_texte(t, f"{chemin}.lignes[{i}][{j}]") for j, t in enumerate(cellules)])
    colonnes = max([len(entetes)] + [len(ligne) for ligne in lignes])
    if colonnes == 0:
        _refuser(chemin, "tableau sans colonne")
    return {"type": "tableau", "entetes": entetes, "lignes": lignes, "colonnes": colonnes}


def _cellule(brut, chemin: str) -> dict:
    c = _objet(brut, chemin, ("type", "valeur"))
    genre = _enumere(c["type"], f"{chemin}.type", TYPES_CELLULE)
    valeur = c["valeur"]
    if genre == "texte":
        valeur = _texte(valeur, f"{chemin}.valeur")
    elif genre == "nombre":
        if isinstance(valeur, bool) or not isinstance(valeur, (int, float)) or not math.isfinite(valeur):
            _refuser(f"{chemin}.valeur", "nombre fini attendu")
    elif genre == "booleen":
        if not isinstance(valeur, bool):
            _refuser(f"{chemin}.valeur", "booléen attendu")
    else:
        if not isinstance(valeur, str) or not _DATE.match(valeur):
            _refuser(f"{chemin}.valeur", "date AAAA-MM-JJ attendue")
        try:
            valeur = datetime.date.fromisoformat(valeur)
        except ValueError:
            _refuser(f"{chemin}.valeur", "date inexistante")
        if valeur.year < 1900:
            _refuser(f"{chemin}.valeur", "date antérieure à 1900")
    return {"type": genre, "valeur": valeur}


def _feuille(brut, chemin: str) -> dict:
    f = _objet(brut, chemin, ("nom", "lignes"))
    nom = _texte(f["nom"], f"{chemin}.nom", 1, LIMITE_NOM_FEUILLE)
    if _NOM_FEUILLE_INTERDIT.search(nom) or nom.startswith("'") or nom.endswith("'") or nom.strip() != nom:
        _refuser(f"{chemin}.nom", "nom de feuille interdit (caractères [ ] : * ? / \\, apostrophe ou espace en bordure)")
    if nom.casefold() == "history":
        _refuser(f"{chemin}.nom", "nom réservé par Excel")
    lignes = []
    for i, ligne in enumerate(_liste(f["lignes"], f"{chemin}.lignes", LIMITE_LIGNES)):
        cellules = _liste(ligne, f"{chemin}.lignes[{i}]", LIMITE_COLONNES)
        lignes.append([_cellule(c, f"{chemin}.lignes[{i}][{j}]") for j, c in enumerate(cellules)])
    return {"nom": nom, "lignes": lignes}


def valider_demande(brut) -> dict:
    """Valide la demande et rend une version normalisée ; lève DemandeInvalide sinon."""
    d = _objet(brut, "demande", ("format", "modele", "titre", "langue"), ("blocs", "feuilles"))
    format_ = _enumere(d["format"], "demande.format", FORMATS)
    demande = {
        "format": format_,
        "modele": _enumere(d["modele"], "demande.modele", MODELES),
        "titre": _texte(d["titre"], "demande.titre", 1, LIMITE_TITRE),
        "langue": _enumere(d["langue"], "demande.langue", LANGUES),
        "blocs": [_bloc(b, f"demande.blocs[{i}]")
                  for i, b in enumerate(_liste(d.get("blocs", []), "demande.blocs", LIMITE_BLOCS))],
        "feuilles": [_feuille(f, f"demande.feuilles[{i}]")
                     for i, f in enumerate(_liste(d.get("feuilles", []), "demande.feuilles", LIMITE_FEUILLES))],
    }
    if format_ == "xlsx":
        if demande["blocs"]:
            _refuser("demande.blocs", "interdit pour le format xlsx (utiliser 'feuilles')")
        if not demande["feuilles"]:
            _refuser("demande.feuilles", "au moins une feuille requise pour le format xlsx")
        noms = [f["nom"].casefold() for f in demande["feuilles"]]
        if len(set(noms)) != len(noms):
            _refuser("demande.feuilles", "noms de feuilles en double")
    elif demande["feuilles"]:
        _refuser("demande.feuilles", "réservé au format xlsx (utiliser 'blocs')")
    return demande


def _sans_doublon(paires: list) -> dict:
    d = {}
    for cle, valeur in paires:
        if cle in d:
            raise DemandeInvalide(f"JSON : clé en double : {cle!r}")
        d[cle] = valeur
    return d


def lire_demande(chemin: Path) -> dict:
    """Lit et valide le fichier JSON de la demande (taille bornée, clés uniques)."""
    try:
        with open(chemin, "rb") as f:
            donnees = f.read(TAILLE_MAX_DEMANDE + 1)
    except OSError as erreur:
        raise DemandeInvalide(f"lecture de la demande impossible : {erreur.strerror}") from None
    if len(donnees) > TAILLE_MAX_DEMANDE:
        raise DemandeInvalide("demande trop volumineuse")
    try:
        brut = json.loads(donnees.decode("utf-8"), object_pairs_hook=_sans_doublon,
                          parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
    except (UnicodeDecodeError, ValueError) as erreur:
        raise DemandeInvalide(f"JSON invalide : {erreur}") from None
    return valider_demande(brut)


# ---------- aides communes ----------

def _segments(texte: str, gras: list, italique: list) -> list[tuple[str, bool, bool]]:
    """Découpe le texte en segments (texte, gras, italique) selon les plages (déjà converties en points de code)."""
    coupes = sorted({0, len(texte), *(p for plage in gras + italique for p in plage)})
    segments = []
    for debut, fin in zip(coupes, coupes[1:]):
        est_gras = any(a <= debut and fin <= b for a, b in gras)
        est_italique = any(a <= debut and fin <= b for a, b in italique)
        segments.append((texte[debut:fin], est_gras, est_italique))
    return segments


def _maintenant() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0, tzinfo=None)


def _proprietes_ooxml(props, demande: dict) -> None:
    """Métadonnées de provenance IA (décision 7 : métadonnées seulement), pour docx et pptx."""
    maintenant = _maintenant()
    props.author = AUTEUR
    props.last_modified_by = AUTEUR
    props.title = demande["titre"]
    props.subject = ""
    props.category = ""
    props.comments = COMMENTAIRE
    props.keywords = MOTS_CLES
    props.language = demande["langue"]
    props.created = maintenant
    props.modified = maintenant


# ---------- docx ----------

def _style_docx(document, langue: str) -> None:
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor

    tailles = {"Normal": 11, "Title": 24, "Heading 1": 18, "Heading 2": 14, "Heading 3": 12}
    for nom, taille in tailles.items():
        style = document.styles[nom]
        style.font.name = POLICE
        style.font.size = Pt(taille)
        propriete = style.element.get_or_add_rPr()
        polices = propriete.get_or_add_rFonts()
        for attribut in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            polices.set(qn(attribut), POLICE)
        for attribut in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
            if polices.get(qn(attribut)) is not None:
                del polices.attrib[qn(attribut)]
        if nom != "Normal":
            style.font.color.rgb = RGBColor(0x22, 0x22, 0x22)
            style.font.bold = True
    langue_xml = OxmlElement("w:lang")
    langue_xml.set(qn("w:val"), langue)
    langue_xml.set(qn("w:eastAsia"), langue)
    document.styles["Normal"].element.get_or_add_rPr().append(langue_xml)


def _nouvelle_numerotation(document) -> int:
    """Crée une numérotation « Liste numérotée » repartant de 1 ; rend son identifiant."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    racine = document.part.numbering_part.element
    id_style = document.styles["List Number"].element.pPr.numPr.numId.val
    abstrait = racine.xpath(f'w:num[@w:numId="{id_style}"]/w:abstractNumId/@w:val')[0]
    nouveau = max(int(n) for n in racine.xpath("w:num/@w:numId")) + 1
    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(nouveau))
    ref = OxmlElement("w:abstractNumId")
    ref.set(qn("w:val"), abstrait)
    surcharge = OxmlElement("w:lvlOverride")
    surcharge.set(qn("w:ilvl"), "0")
    debut = OxmlElement("w:startOverride")
    debut.set(qn("w:val"), "1")
    surcharge.append(debut)
    num.append(ref)
    num.append(surcharge)
    racine.append(num)
    return nouveau


def _ajouter_paragraphe_docx(document, bloc: dict):
    paragraphe = document.add_paragraph()
    for texte, gras, italique in _segments(bloc["texte"], bloc["gras"], bloc["italique"]):
        course = paragraphe.add_run(texte)
        course.bold = True if gras else None
        course.italic = True if italique else None
    return paragraphe


def _ajouter_liste_docx(document, bloc: dict) -> None:
    numero = _nouvelle_numerotation(document) if bloc["ordonnee"] else None
    for element in bloc["elements"]:
        paragraphe = document.add_paragraph(element, style="List Number" if numero else "List Bullet")
        if numero:
            num_pr = paragraphe._p.get_or_add_pPr().get_or_add_numPr()
            num_pr.get_or_add_ilvl().val = 0
            num_pr.get_or_add_numId().val = numero


def _ajouter_tableau_docx(document, bloc: dict) -> None:
    lignes = ([bloc["entetes"]] if bloc["entetes"] else []) + bloc["lignes"]
    tableau = document.add_table(rows=len(lignes), cols=bloc["colonnes"])
    tableau.style = "Table Grid"
    for i, ligne in enumerate(lignes):
        for j in range(bloc["colonnes"]):
            cellule = tableau.cell(i, j)
            cellule.text = ligne[j] if j < len(ligne) else ""
            if bloc["entetes"] and i == 0:
                for course in cellule.paragraphs[0].runs:
                    course.bold = True
    document.add_paragraph()


def generer_docx(demande: dict, chemin: Path) -> None:
    from docx import Document

    document = Document()
    _style_docx(document, demande["langue"])
    _proprietes_ooxml(document.core_properties, demande)
    document.add_paragraph(demande["titre"], style="Title")
    for bloc in demande["blocs"]:
        genre = bloc["type"]
        if genre == "titre":
            document.add_heading(bloc["texte"], level=bloc["niveau"])
        elif genre == "paragraphe":
            _ajouter_paragraphe_docx(document, bloc)
        elif genre == "liste":
            _ajouter_liste_docx(document, bloc)
        elif genre == "tableau":
            _ajouter_tableau_docx(document, bloc)
        elif genre == "saut_de_page":
            document.add_page_break()
    document.save(str(chemin))


# ---------- xlsx ----------

_PREFIXES_FORMULE = ("=", "+", "-", "@", "\t", "\r")


def _ecrire_cellule_xlsx(feuille, ligne: int, colonne: int, cellule: dict) -> int:
    """Écrit une cellule sans jamais créer de formule ; rend la largeur utile en caractères."""
    cible = feuille.cell(row=ligne, column=colonne)
    valeur = cellule["valeur"]
    if cellule["type"] == "texte":
        cible.value = valeur
        cible.data_type = "s"  # chaîne forcée : openpyxl aurait fait une formule d'un « =... »
        if valeur.startswith(_PREFIXES_FORMULE):
            cible.quotePrefix = True  # reste du texte même si on édite la cellule dans Excel
        return max((len(partie) for partie in valeur.split("\n")), default=0)
    cible.value = valeur
    if cellule["type"] == "date":
        cible.number_format = "yyyy-mm-dd"
        return 10
    return len(str(valeur))


def generer_xlsx(demande: dict, chemin: Path) -> None:
    from openpyxl import Workbook
    from openpyxl.utils import get_column_letter

    classeur = Workbook()
    classeur.remove(classeur.active)
    maintenant = _maintenant()
    classeur.properties.creator = AUTEUR
    classeur.properties.lastModifiedBy = AUTEUR
    classeur.properties.title = demande["titre"]
    classeur.properties.description = COMMENTAIRE
    classeur.properties.keywords = MOTS_CLES
    classeur.properties.language = demande["langue"]
    classeur.properties.created = maintenant
    classeur.properties.modified = maintenant
    for brute in demande["feuilles"]:
        feuille = classeur.create_sheet(title=brute["nom"])
        largeurs: dict[int, int] = {}
        for i, ligne in enumerate(brute["lignes"], start=1):
            for j, cellule in enumerate(ligne, start=1):
                largeur = _ecrire_cellule_xlsx(feuille, i, j, cellule)
                largeurs[j] = max(largeurs.get(j, 0), largeur)
        for j, largeur in largeurs.items():
            feuille.column_dimensions[get_column_letter(j)].width = min(60, max(10, largeur + 2))
    classeur.save(str(chemin))


# ---------- pptx ----------

_PARAGRAPHES_PAR_DIAPO = 7
_LIGNES_TABLEAU_PAR_DIAPO = 12


class _Presentation:
    """Construit les diapositives au fil des blocs : un titre de niveau 1 ouvre une diapositive."""

    def __init__(self, demande: dict):
        from pptx import Presentation

        self.prs = Presentation()
        _proprietes_ooxml(self.prs.core_properties, demande)
        self.titre_courant = demande["titre"]
        self.diapo = None
        self.corps = None
        self.nombre = 0
        self.suite = False
        couverture = self.prs.slides.add_slide(self.prs.slide_layouts[0])
        couverture.shapes.title.text = demande["titre"]
        sous_titre = couverture.placeholders[1]
        sous_titre._element.getparent().remove(sous_titre._element)

    def _ouvrir(self, layout: int = 1) -> None:
        titre = self.titre_courant + (" (suite)" if self.suite else "")
        self.diapo = self.prs.slides.add_slide(self.prs.slide_layouts[layout])
        self.diapo.shapes.title.text = titre
        self.corps = self.diapo.placeholders[1] if layout == 1 else None
        self.nombre = 0
        self.suite = True

    def nouveau_titre(self, texte: str) -> None:
        self.titre_courant = texte
        self.suite = False
        self._ouvrir()

    def saut(self) -> None:
        self.diapo = None

    def _paragraphe(self):
        if self.diapo is None or self.corps is None or self.nombre >= _PARAGRAPHES_PAR_DIAPO:
            self._ouvrir()
        cadre = self.corps.text_frame
        paragraphe = cadre.paragraphs[0] if self.nombre == 0 else cadre.add_paragraph()
        self.nombre += 1
        return paragraphe

    def texte(self, segments: list[tuple[str, bool, bool]]) -> None:
        paragraphe = self._paragraphe()
        for texte, gras, italique in segments:
            course = paragraphe.add_run()
            course.text = texte
            course.font.bold = True if gras else None
            course.font.italic = True if italique else None

    def liste(self, bloc: dict) -> None:
        for i, element in enumerate(bloc["elements"], start=1):
            prefixe = f"{i}. " if bloc["ordonnee"] else ""
            self.texte([(prefixe + element, False, False)])

    def tableau(self, bloc: dict) -> None:
        from pptx.util import Inches, Pt

        entete = [bloc["entetes"]] if bloc["entetes"] else []
        lignes = bloc["lignes"]
        pas = _LIGNES_TABLEAU_PAR_DIAPO - len(entete)
        for debut in range(0, max(len(lignes), 1), pas):
            morceau = entete + lignes[debut:debut + pas]
            self._ouvrir(layout=5)
            forme = self.diapo.shapes.add_table(len(morceau), bloc["colonnes"], Inches(0.5), Inches(1.8),
                                                Inches(9), Inches(0.4) * len(morceau))
            for i, ligne in enumerate(morceau):
                for j in range(bloc["colonnes"]):
                    cellule = forme.table.cell(i, j)
                    cellule.text = ligne[j] if j < len(ligne) else ""
                    for paragraphe in cellule.text_frame.paragraphs:
                        for course in paragraphe.runs:
                            course.font.size = Pt(12)
            self.diapo = None

    def terminer(self) -> None:
        for diapo in self.prs.slides:
            for forme in list(diapo.placeholders):
                if forme.placeholder_format.idx == 1 and forme.has_text_frame and not forme.text_frame.text:
                    forme._element.getparent().remove(forme._element)


def generer_pptx(demande: dict, chemin: Path) -> None:
    presentation = _Presentation(demande)
    for bloc in demande["blocs"]:
        genre = bloc["type"]
        if genre == "titre" and bloc["niveau"] == 1:
            presentation.nouveau_titre(bloc["texte"])
        elif genre == "titre":
            presentation.texte([(bloc["texte"], True, False)])
        elif genre == "paragraphe":
            presentation.texte(_segments(bloc["texte"], bloc["gras"], bloc["italique"]))
        elif genre == "liste":
            presentation.liste(bloc)
        elif genre == "tableau":
            presentation.tableau(bloc)
        elif genre == "saut_de_page":
            presentation.saut()
    presentation.terminer()
    presentation.prs.save(str(chemin))


# ---------- point d'entrée ----------

_GENERATEURS = {"docx": generer_docx, "xlsx": generer_xlsx, "pptx": generer_pptx, "pdf": generer_docx}


def generer(chemin_demande: Path, dossier_sortie: Path) -> dict:
    """Valide la demande, génère le document et rend `{"fichier", "intermediaire_pdf"}`."""
    demande = lire_demande(chemin_demande)
    format_ = demande["format"]
    nom = "document.docx" if format_ == "pdf" else f"document.{format_}"
    if not dossier_sortie.is_dir():
        raise DemandeInvalide("dossier de sortie introuvable")
    _GENERATEURS[format_](demande, dossier_sortie / nom)
    return {"fichier": nom, "intermediaire_pdf": format_ == "pdf"}


# ---------- aperçu texte (commande `apercu`) ----------

LIMITE_APERCU = 20000


def _texte_docx(chemin: Path) -> list[str]:
    from docx import Document

    document = Document(str(chemin))
    lignes = [p.text for p in document.paragraphs]
    for tableau in document.tables:
        lignes.extend(" | ".join(c.text for c in ligne.cells) for ligne in tableau.rows)
    return lignes


def _texte_xlsx(chemin: Path) -> list[str]:
    from openpyxl import load_workbook

    classeur = load_workbook(str(chemin), read_only=True, data_only=False)
    lignes: list[str] = []
    try:
        for feuille in classeur.worksheets:
            lignes.append(f"[{feuille.title}]")
            for ligne in feuille.iter_rows(values_only=True):
                lignes.append(" | ".join("" if v is None else str(v) for v in ligne))
    finally:
        classeur.close()
    return lignes


def _texte_pptx(chemin: Path) -> list[str]:
    from pptx import Presentation

    lignes: list[str] = []
    for numero, diapo in enumerate(Presentation(str(chemin)).slides, start=1):
        lignes.append(f"[Diapositive {numero}]")
        for forme in diapo.shapes:
            if forme.has_text_frame:
                lignes.extend(p.text for p in forme.text_frame.paragraphs)
            if getattr(forme, "has_table", False) and forme.has_table:
                lignes.extend(" | ".join(c.text for c in ligne.cells) for ligne in forme.table.rows)
    return lignes


_EXTRACTEURS = {"docx": _texte_docx, "xlsx": _texte_xlsx, "pptx": _texte_pptx}


def apercu(chemin_document: Path, dossier_sortie: Path) -> None:
    """Écrit `apercu.txt` (au plus LIMITE_APERCU caractères) : le texte du document Office."""
    extension = chemin_document.suffix.lstrip(".").lower()
    extracteur = _EXTRACTEURS.get(extension)
    if extracteur is None:
        raise DemandeInvalide("format d'aperçu non pris en charge")
    texte = "\n".join(extracteur(chemin_document))
    (dossier_sortie / "apercu.txt").write_text(texte[:LIMITE_APERCU], encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) == 4 and argv[1] == "apercu":
        try:
            apercu(Path(argv[2]), Path(argv[3]))
        except DemandeInvalide as erreur:
            print(f"demande invalide : {erreur}", file=sys.stderr)
            return 2
        except Exception as erreur:  # noqa: BLE001
            print(f"erreur interne : {type(erreur).__name__} : {erreur}", file=sys.stderr)
            return 1
        return 0
    if len(argv) != 3:
        print("usage : documents.py <demande.json> <dossier_sortie> | apercu <document> <dossier_sortie>",
              file=sys.stderr)
        return 2
    try:
        resultat = generer(Path(argv[1]), Path(argv[2]))
    except DemandeInvalide as erreur:
        print(f"demande invalide : {erreur}", file=sys.stderr)
        return 2
    except Exception as erreur:  # noqa: BLE001 : toute autre panne est interne, jamais silencieuse
        print(f"erreur interne : {type(erreur).__name__} : {erreur}", file=sys.stderr)
        return 1
    print(json.dumps(resultat))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
