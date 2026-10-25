"""Contrôle d'une archive Office (docx, xlsx, pptx) produite par la fabrique.

Voir docs/conception-execution-etroite.md §6.1. À lancer sur l'hôte avec l'environnement figé
(defusedxml requis, jamais de repli sur l'analyseur XML standard) :

    /opt/atelier-fabrique/venv/bin/python -I controle_office.py fichier [fichier...]

Code de sortie 0 : tous les fichiers sont sains ; 3 : au moins un fichier refusé (message sur
la sortie d'erreur) ; 2 : usage.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import PurePosixPath

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

TAILLE_MAX_DECOMPRESSEE = 200 * 1024 * 1024
NOMBRE_MAX_ENTREES = 20000

# Fragments interdits dans un nom d'entrée (comparaison en minuscules).
_NOMS_INTERDITS = ("vbaproject", "externallinks/", "oleobject", "activex")
# Fragments interdits dans un type de relation (minuscules).
_TYPES_RELATION_INTERDITS = ("oleobject", "activex", "vbaproject", "externallink")
_TYPE_CONTENU_INTERDIT = ("macroenabled", "vbaproject")


class ControleOfficeErreur(ValueError):
    """Archive refusée : le message dit la cause."""


def _verifier_nom(nom: str) -> None:
    if "\0" in nom or "\\" in nom:
        raise ControleOfficeErreur(f"nom d'entrée invalide : {nom!r}")
    if nom.startswith("/") or (len(nom) > 1 and nom[1] == ":"):
        raise ControleOfficeErreur(f"chemin d'archive absolu : {nom!r}")
    if ".." in PurePosixPath(nom).parts:
        raise ControleOfficeErreur(f"chemin d'archive avec '..' : {nom!r}")
    minuscules = nom.lower()
    for fragment in _NOMS_INTERDITS:
        if fragment in minuscules:
            raise ControleOfficeErreur(f"contenu interdit dans l'archive : {nom!r}")


def _lire_borne(archive: zipfile.ZipFile, info: zipfile.ZipInfo, reste: int) -> bytes:
    with archive.open(info) as flux:
        donnees = flux.read(reste + 1)
    if len(donnees) > reste:
        raise ControleOfficeErreur("taille décompressée supérieure à la limite")
    return donnees


def _analyser(donnees: bytes, nom: str):
    try:
        return ElementTree.fromstring(donnees, forbid_dtd=True)
    except DefusedXmlException as erreur:
        raise ControleOfficeErreur(f"XML dangereux dans {nom!r} : {erreur}") from None
    except ElementTree.ParseError as erreur:
        raise ControleOfficeErreur(f"XML invalide dans {nom!r} : {erreur}") from None


def _sans_espace_de_noms(balise: str) -> str:
    return balise.rsplit("}", 1)[-1]


def _verifier_relations(racine, nom: str) -> None:
    for relation in racine.iter():
        if _sans_espace_de_noms(relation.tag) != "Relationship":
            continue
        if relation.get("TargetMode", "").lower() == "external":
            raise ControleOfficeErreur(f"relation externe interdite dans {nom!r}")
        type_relation = relation.get("Type", "").lower()
        if type_relation.endswith("/package") or any(f in type_relation for f in _TYPES_RELATION_INTERDITS):
            raise ControleOfficeErreur(f"type de relation interdit dans {nom!r} : {relation.get('Type')!r}")


def _verifier_types_contenu(racine, nom: str) -> None:
    for element in racine.iter():
        type_contenu = element.get("ContentType", "").lower()
        if any(f in type_contenu for f in _TYPE_CONTENU_INTERDIT):
            raise ControleOfficeErreur(f"type de contenu interdit dans {nom!r} : {element.get('ContentType')!r}")


def controler_archive(chemin) -> None:
    """Lève ControleOfficeErreur si l'archive est refusée ; ne rend rien si elle est saine."""
    try:
        archive = zipfile.ZipFile(chemin)
    except (zipfile.BadZipFile, OSError) as erreur:
        raise ControleOfficeErreur(f"archive illisible : {erreur}") from None
    with archive:
        entrees = archive.infolist()
        if len(entrees) > NOMBRE_MAX_ENTREES:
            raise ControleOfficeErreur("trop d'entrées dans l'archive")
        if sum(e.file_size for e in entrees) > TAILLE_MAX_DECOMPRESSEE:
            raise ControleOfficeErreur("taille décompressée déclarée supérieure à 200 Mio")
        noms = [e.filename for e in entrees]
        if len(set(noms)) != len(noms):
            raise ControleOfficeErreur("entrées en double dans l'archive")
        if "[Content_Types].xml" not in noms:
            raise ControleOfficeErreur("[Content_Types].xml absent : ce n'est pas un fichier Office")
        reste = TAILLE_MAX_DECOMPRESSEE
        for info in entrees:
            _verifier_nom(info.filename)
            if info.is_dir() or not info.filename.lower().endswith((".xml", ".rels")):
                continue
            donnees = _lire_borne(archive, info, reste)
            reste -= len(donnees)
            racine = _analyser(donnees, info.filename)
            if info.filename.endswith(".rels"):
                _verifier_relations(racine, info.filename)
            elif info.filename == "[Content_Types].xml":
                _verifier_types_contenu(racine, info.filename)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage : controle_office.py <fichier> [fichier...]", file=sys.stderr)
        return 2
    code = 0
    for chemin in argv[1:]:
        try:
            controler_archive(chemin)
        except ControleOfficeErreur as erreur:
            print(f"refusé : {chemin} : {erreur}", file=sys.stderr)
            code = 3
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
