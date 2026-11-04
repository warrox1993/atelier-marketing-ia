"""Registre des chartes graphiques (lot I1 des images) : lecture et résolution, bibliothèque standard seulement.

Une charte est tenue par l'humain, jamais par un agent : `chartes-autorisees/<entreprise>/<id>.json`, sur le modèle
de `voix-autorisees/`. La demande de l'agent ne porte qu'un identifiant : ni couleur, ni police, ni fichier, ni URL.

    id        le même identifiant que le nom du fichier
    couleurs  { "fond", "texte", "accent" } en #RRGGBB (contraste vérifié)
    police    identifiant d'une liste fixe (POLICES_AUTORISEES)
    logo      facultatif : nom simple d'un .png du même dossier, 1 Mo et 2000 x 2000 pixels au plus (lu dans IHDR)

Le logo est lu une fois ici (octets validés) et recopié dans la scène : la page ne charge rien d'autre.
"""

from __future__ import annotations

import json
import os
import re
import stat
import struct
from dataclasses import dataclass
from pathlib import Path

from fabrique.generateurs.visuels import POLICES

# Polices OFL des images, dans le dépôt et à côté du code déployé (empreintes : scripts/installer-fabrique.sh).
_POLICES = Path(__file__).resolve().parent / "polices"
ARCHIVO = str(_POLICES / "archivo" / "Archivo-variable.ttf")
SOURCE_SERIF = str(_POLICES / "source-serif-4" / "SourceSerif4-variable.ttf")
# Identifiant -> faces (famille des gabarits, graisses, chasses, fichier). « Titre » compose titres et chiffres,
# « Texte » le reste ; DejaVu Sans sert toujours de repli pour un glyphe absent (images.feuille_charte).
POLICES_AUTORISEES: dict[str, tuple[tuple[str, str, str, str], ...]] = {
    "dejavu-sans": (("Titre", "700", "100%", POLICES[1]), ("Texte", "400", "100%", POLICES[0]),
                    ("Texte", "700", "100%", POLICES[1])),
    "archivo": (("Titre", "100 900", "62% 125%", ARCHIVO), ("Texte", "100 900", "62% 125%", ARCHIVO)),
    "source-serif": (("Titre", "200 900", "100%", SOURCE_SERIF), ("Texte", "100 900", "62% 125%", ARCHIVO)),
}

MOTIF_ID = re.compile(r"[a-z0-9-]{1,64}")
MOTIF_ENTREPRISE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
MOTIF_COULEUR = re.compile(r"#[0-9A-Fa-f]{6}")
MOTIF_LOGO = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.png")
CHAMPS_CHARTE = {"id", "couleurs", "police", "logo"}
COULEURS_CHARTE = ("fond", "texte", "accent")
TAILLE_MAX_CHARTE = 16 * 1024
LOGO_OCTETS_MAX = 1024 * 1024
LOGO_COTE_MAX = 2000
CONTRASTE_TEXTE_MIN = 4.5  # WCAG AA, texte courant
CONTRASTE_ACCENT_MIN = 3.0  # WCAG AA, grands textes et éléments graphiques
SIGNATURE_PNG = b"\x89PNG\r\n\x1a\n"


class CharteRefusee(ValueError):
    """La charte demandée n'est pas utilisable pour ce travail (message destiné à l'opérateur)."""


@dataclass(frozen=True)
class Charte:
    id: str
    fond: str
    texte: str
    accent: str
    texte_accent: str  # celle de fond ou texte qui se lit le mieux sur l'accent
    police: str
    logo: bytes | None = None


def lire_ihdr(octets: bytes) -> tuple[int, int, int, int]:
    """(largeur, hauteur, profondeur, type de couleur) d'un PNG ; ValueError si ce n'en est pas un."""
    if len(octets) < 33 or octets[:8] != SIGNATURE_PNG or octets[12:16] != b"IHDR" or octets[8:12] != b"\0\0\0\x0d":
        raise ValueError("ce n'est pas un PNG (signature ou en-tête IHDR absents)")
    largeur, hauteur, profondeur, type_couleur = struct.unpack(">IIBB", octets[16:26])
    return largeur, hauteur, profondeur, type_couleur


def _luminance(couleur: str) -> float:
    def lineaire(c: int) -> float:
        v = c / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lineaire(int(couleur[i:i + 2], 16)) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a: str, b: str) -> float:
    haut, bas = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (haut + 0.05) / (bas + 0.05)


def _lire_regulier(dossier: Path, nom: str, taille_max: int, qui: str, uid_proprietaire: int | None) -> bytes:
    """Octets d'un fichier du registre : régulier, sans lien symbolique, pas modifiable par d'autres."""
    try:
        fd = os.open(dossier / nom, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as erreur:
        raise CharteRefusee(f"{qui} : introuvable dans le registre ({erreur.strerror})") from erreur
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise CharteRefusee(f"{qui} : fichier régulier exigé")
        if info.st_size > taille_max:
            raise CharteRefusee(f"{qui} : trop gros ({taille_max} octets au plus)" if qui != "logo"
                                else "logo : plus de 1 Mo")
        if info.st_mode & 0o022:
            raise CharteRefusee(f"{qui} : modifiable par d'autres, refusé")
        if uid_proprietaire is not None and info.st_uid != uid_proprietaire:
            raise CharteRefusee(f"{qui} : propriétaire inattendu")
        with os.fdopen(fd, "rb", closefd=False) as flux:
            return flux.read(taille_max + 1)
    finally:
        os.close(fd)


def _verifier_logo(octets: bytes) -> None:
    try:
        largeur, hauteur, profondeur, type_couleur = lire_ihdr(octets)
    except ValueError as erreur:
        raise CharteRefusee(f"logo : {erreur} (PNG seulement)") from erreur
    if not (0 < largeur <= LOGO_COTE_MAX and 0 < hauteur <= LOGO_COTE_MAX):
        raise CharteRefusee(f"logo : {largeur}x{hauteur} pixels, {LOGO_COTE_MAX}x{LOGO_COTE_MAX} au plus")


def _couleurs(brut: object) -> dict[str, str]:
    if not isinstance(brut, dict) or set(brut) != set(COULEURS_CHARTE):
        raise CharteRefusee(f"couleurs : exactement {list(COULEURS_CHARTE)} attendus")
    for nom, valeur in brut.items():
        if not isinstance(valeur, str) or not MOTIF_COULEUR.fullmatch(valeur):
            raise CharteRefusee(f"couleur {nom} : #RRGGBB attendu")
    couleurs = {nom: valeur.lower() for nom, valeur in brut.items()}
    if contraste(couleurs["texte"], couleurs["fond"]) < CONTRASTE_TEXTE_MIN:
        raise CharteRefusee(f"contraste texte/fond inférieur à {CONTRASTE_TEXTE_MIN:g}")
    if contraste(couleurs["accent"], couleurs["fond"]) < CONTRASTE_ACCENT_MIN:
        raise CharteRefusee(f"contraste accent/fond inférieur à {CONTRASTE_ACCENT_MIN:g}")
    return couleurs


def resoudre(identifiant: object, entreprise: object, dossier: str | os.PathLike,
             uid_proprietaire: int | None = None) -> Charte:
    """Rend la charte `<dossier>/<entreprise>/<identifiant>.json`, ou lève CharteRefusee."""
    if not isinstance(identifiant, str) or not MOTIF_ID.fullmatch(identifiant):
        raise CharteRefusee("charte : identifiant du registre attendu (aucun chemin, aucun fichier)")
    if not isinstance(entreprise, str) or not MOTIF_ENTREPRISE.fullmatch(entreprise):
        raise CharteRefusee("entreprise : identifiant invalide")
    dossier_entreprise = Path(dossier) / entreprise
    try:
        brut = _lire_regulier(dossier_entreprise, f"{identifiant}.json", TAILLE_MAX_CHARTE, "charte", uid_proprietaire)
    except CharteRefusee as erreur:
        if "introuvable" in str(erreur):
            raise CharteRefusee(f"charte inconnue : {identifiant}") from erreur
        raise
    if len(brut) > TAILLE_MAX_CHARTE:
        raise CharteRefusee("charte : fichier trop gros")
    try:
        donnees = json.loads(brut)
    except ValueError as erreur:
        raise CharteRefusee("charte invalide : JSON illisible") from erreur
    if not isinstance(donnees, dict):
        raise CharteRefusee("charte invalide : objet attendu")
    inconnus = set(donnees) - CHAMPS_CHARTE
    if inconnus:
        raise CharteRefusee(f"charte : champs inconnus {sorted(inconnus)}")
    if donnees.get("id") != identifiant:
        raise CharteRefusee("charte : l'id du fichier ne correspond pas à son nom")
    police = donnees.get("police")
    if not isinstance(police, str) or police not in POLICES_AUTORISEES:
        raise CharteRefusee(f"police : une de {sorted(POLICES_AUTORISEES)} attendue")
    couleurs = _couleurs(donnees.get("couleurs"))
    logo = None
    if "logo" in donnees:
        nom = donnees["logo"]
        if not isinstance(nom, str) or not MOTIF_LOGO.fullmatch(nom):
            raise CharteRefusee("logo : nom simple en .png attendu (aucun chemin)")
        logo = _lire_regulier(dossier_entreprise, nom, LOGO_OCTETS_MAX, "logo", uid_proprietaire)
        _verifier_logo(logo)
    texte_accent = max((couleurs["fond"], couleurs["texte"]), key=lambda c: contraste(c, couleurs["accent"]))
    return Charte(identifiant, couleurs["fond"], couleurs["texte"], couleurs["accent"], texte_accent, police, logo)
