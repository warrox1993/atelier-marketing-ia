"""Bibliothèque musicale contrôlée de la fabrique (lot 9) : docs/conception-execution-etroite.md §6.3.

Les pistes sont importées par l'OPÉRATEUR (sudo), jamais par l'agent :

    sudo python3 -m fabrique.bibliotheque_musique importer --fichier piste.mp3 --id fond-calme \\
        --titre "Fond calme" --auteur "Nom" --licence CC-BY-4.0 --attribution "Texte d'attribution" \\
        --source https://exemple.org/piste

Import en trois temps, chacun dans une cage (fabrique.cage, sans réseau ni /home) :

1. `ffprobe` avec `-format_whitelist flac,wav,mp3,ogg` : tout autre démultiplexeur (liste HLS,
   fichier concat, MP4, image…) est refusé par ffprobe lui-même ; puis contrôle du résultat :
   un seul flux, de type audio, durée de 0 à 10 minutes ;
2. ré-encodage en FLAC (démultiplexeur forcé, métadonnées et chapitres supprimés) ;
3. nouveau `ffprobe` sur le FLAC produit.

La piste est placée dans `<racine>/<id>.flac` avec la fiche `<id>.json`. Au moment du travail,
le service appelle `preparer_musique(id, dossier_entree)` qui recopie la piste en
`dossier_entree/musique.flac` : la cage de montage ne voit jamais la bibliothèque.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import tempfile
from pathlib import Path

from fabrique.cage import Etape, executer
from fabrique.generateurs.montage import FFMPEG, FFPROBE

RACINE_BIBLIOTHEQUE = "/var/lib/atelier-fabrique/bibliotheque-musique"
FORMATS_AUDIO = ("flac", "wav", "mp3", "ogg")
DUREE_MAX_PISTE_S = 600.0
TAILLE_MAX_SOURCE_OCTETS = 200 * 1024**2
LICENCES = ("CC0", "CC-BY-4.0", "commerciale")
MOTIF_IDENTIFIANT = re.compile(r"^[a-z0-9][a-z0-9-]{1,47}$")
LONGUEUR_MAX_CHAMP = 300
DELAI_SONDE_S = 60
DELAI_REENCODAGE_S = 300


class ErreurImport(Exception):
    """Piste ou fiche refusée à l'import (message destiné à l'opérateur)."""


def identifiant_valide(identifiant: str) -> bool:
    return isinstance(identifiant, str) and MOTIF_IDENTIFIANT.fullmatch(identifiant) is not None


def _champ_texte(nom: str, valeur: object) -> str:
    if not isinstance(valeur, str) or not valeur.strip():
        raise ErreurImport(f"{nom} : obligatoire")
    if len(valeur) > LONGUEUR_MAX_CHAMP or any(ord(c) < 32 or ord(c) == 127 for c in valeur):
        raise ErreurImport(f"{nom} : trop long ou caractère de contrôle")
    return valeur.strip()


def valider_fiche(identifiant: str, titre: str, auteur: str, licence: str, source: str,
                  attribution: str | None = None, reference: str | None = None) -> dict:
    """Contrôle les métadonnées et rend la fiche (sans durée ni empreinte)."""
    if not identifiant_valide(identifiant):
        raise ErreurImport("identifiant : minuscules, chiffres et tirets, 2 à 48 caractères")
    if licence not in LICENCES:
        raise ErreurImport(f"licence obligatoire parmi {', '.join(LICENCES)}")
    fiche = {
        "id": identifiant,
        "titre": _champ_texte("titre", titre),
        "auteur": _champ_texte("auteur", auteur),
        "licence": licence,
        "source": _champ_texte("source", source),
    }
    if licence == "CC-BY-4.0":
        fiche["attribution"] = _champ_texte("attribution (obligatoire avec CC-BY-4.0)", attribution)
    elif licence == "commerciale":
        fiche["reference"] = _champ_texte("référence de la licence commerciale", reference)
    return fiche


def construire_arguments_sonde(chemin_cage: str) -> list[str]:
    """ffprobe sur le fichier source : seuls les démultiplexeurs audio autorisés, protocole file."""
    return ["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", ",".join(FORMATS_AUDIO),
            "-print_format", "json", "-show_format", "-show_streams", chemin_cage]


def construire_arguments_reencodage(format_source: str) -> list[str]:
    """ffmpeg : source /entree/source.bin vers /sortie/piste.flac, démultiplexeur forcé."""
    if format_source not in FORMATS_AUDIO:
        raise ValueError(f"format non autorisé : {format_source!r}")
    return ["-nostdin", "-hide_banner", "-n", "-loglevel", "error",
            "-protocol_whitelist", "file", "-format_whitelist", format_source, "-f", format_source,
            "-i", "/entree/source.bin", "-vn", "-sn", "-dn", "-map", "0:a:0",
            "-map_metadata", "-1", "-map_chapters", "-1", "-ar", "48000", "-ac", "2",
            "-t", f"{DUREE_MAX_PISTE_S:.0f}", "-c:a", "flac", "-f", "flac", "/sortie/piste.flac"]


def _executer(programme: str, arguments: list[str], entree: Path, sortie: Path, delai: float):
    etape = Etape(type="cpu", programme=programme, arguments=tuple(arguments),
                  dossier_entree=str(entree), dossier_sortie=str(sortie), hors_ligne=True)
    return executer(etape, delai)


def _sonder(programme_arguments: list[str], entree: Path, sortie: Path) -> dict:
    resultat = _executer(FFPROBE, programme_arguments, entree, sortie, DELAI_SONDE_S)
    if resultat.delai_depasse or resultat.code != 0:
        motif = resultat.erreur.decode("utf-8", "replace").strip()[:200]
        raise ErreurImport(f"ffprobe refuse le fichier (format audio attendu : "
                           f"{', '.join(FORMATS_AUDIO)}) : {motif}")
    try:
        return json.loads(resultat.sortie.decode("utf-8"))
    except ValueError as erreur:
        raise ErreurImport("sortie ffprobe illisible") from erreur


def juger_sonde_audio(sonde: dict, format_attendu: str | None = None) -> tuple[str, float]:
    """Contrôle d'une sonde audio ; rend (format, durée). ErreurImport sinon."""
    flux = sonde.get("streams", [])
    if len(flux) != 1 or flux[0].get("codec_type") != "audio":
        raise ErreurImport("un seul flux, de type audio, est attendu")
    noms = str(sonde.get("format", {}).get("format_name", "")).split(",")
    formats = [nom for nom in noms if nom in FORMATS_AUDIO]
    if not formats or (format_attendu and format_attendu not in noms):
        raise ErreurImport(f"format audio non autorisé : {sonde.get('format', {}).get('format_name')!r}")
    try:
        duree = float(sonde["format"]["duration"])
    except (KeyError, TypeError, ValueError) as erreur:
        raise ErreurImport("durée absente") from erreur
    if not 0 < duree <= DUREE_MAX_PISTE_S:
        raise ErreurImport(f"durée hors limite (0 à {DUREE_MAX_PISTE_S:.0f} s) : {duree}")
    return (format_attendu or formats[0]), duree


def _copier_source(fichier: Path, destination: Path) -> None:
    """Copie le fichier source (régulier, sans suivre de lien, taille bornée) vers destination."""
    descripteur = os.open(fichier, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descripteur)
        if not stat.S_ISREG(info.st_mode):
            raise ErreurImport("le fichier à importer doit être un fichier régulier")
        if info.st_size > TAILLE_MAX_SOURCE_OCTETS:
            raise ErreurImport("fichier trop volumineux")
        with os.fdopen(descripteur, "rb", closefd=False) as source, open(destination, "xb") as cible:
            shutil.copyfileobj(source, cible)
    finally:
        os.close(descripteur)


def importer(fichier, identifiant: str, titre: str, auteur: str, licence: str, source: str,
             attribution: str | None = None, reference: str | None = None,
             racine: str | os.PathLike = RACINE_BIBLIOTHEQUE) -> dict:
    """Contrôle et importe une piste ; rend la fiche. ErreurImport si refus. Aucun shell."""
    fiche = valider_fiche(identifiant, titre, auteur, licence, source, attribution, reference)
    racine = Path(racine)
    destination_piste, destination_fiche = racine / f"{identifiant}.flac", racine / f"{identifiant}.json"
    if destination_piste.exists() or destination_fiche.exists():
        raise ErreurImport(f"identifiant déjà utilisé : {identifiant}")
    with tempfile.TemporaryDirectory(prefix="import-musique-") as brouillon:
        brouillon = Path(brouillon)
        entree, sortie, sonde_sortie = brouillon / "entree", brouillon / "sortie", brouillon / "s"
        for dossier in (entree, sortie, sonde_sortie):
            dossier.mkdir()
        os.chmod(entree, 0o755)
        os.chmod(sortie, 0o777)
        os.chmod(sonde_sortie, 0o777)
        _copier_source(Path(fichier), entree / "source.bin")
        os.chmod(entree / "source.bin", 0o644)

        format_source, _ = juger_sonde_audio(
            _sonder(construire_arguments_sonde("/entree/source.bin"), entree, sonde_sortie))
        reencodage = _executer(FFMPEG, construire_arguments_reencodage(format_source),
                               entree, sortie, DELAI_REENCODAGE_S)
        piste = sortie / "piste.flac"
        if reencodage.delai_depasse or reencodage.code != 0 or not piste.is_file() or piste.is_symlink():
            motif = reencodage.erreur.decode("utf-8", "replace").strip()[:200]
            raise ErreurImport(f"ré-encodage en FLAC impossible : {motif}")
        # Contrôle de la piste produite, dans une cage, avec le seul démultiplexeur flac.
        sonde = _sonder(["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "flac",
                         "-f", "flac", "-print_format", "json", "-show_format", "-show_streams",
                         "/entree/piste.flac"], sortie, sonde_sortie)
        _, duree = juger_sonde_audio(sonde, "flac")
        fiche["duree_s"] = round(duree, 3)
        fiche["sha256"] = hashlib.sha256(piste.read_bytes()).hexdigest()

        racine.mkdir(mode=0o755, parents=True, exist_ok=True)
        provisoire = racine / f".{identifiant}.flac.tmp"
        shutil.copyfile(piste, provisoire)
        os.chmod(provisoire, 0o644)
        os.replace(provisoire, destination_piste)
        provisoire_fiche = racine / f".{identifiant}.json.tmp"
        provisoire_fiche.write_text(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.chmod(provisoire_fiche, 0o644)
        os.replace(provisoire_fiche, destination_fiche)
    return fiche


def lire_fiche(identifiant: str, racine: str | os.PathLike = RACINE_BIBLIOTHEQUE) -> dict:
    """Fiche d'une piste ; ErreurImport si l'identifiant est invalide ou la piste inconnue."""
    if not identifiant_valide(identifiant):
        raise ErreurImport("identifiant de musique invalide")
    chemin = Path(racine) / f"{identifiant}.json"
    try:
        descripteur = os.open(chemin, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as erreur:
        raise ErreurImport(f"musique inconnue : {identifiant}") from erreur
    with os.fdopen(descripteur, "r", encoding="utf-8") as fichier:
        return json.load(fichier)


def preparer_musique(identifiant: str, dossier_entree, racine: str | os.PathLike = RACINE_BIBLIOTHEQUE) -> dict:
    """Recopie la piste `identifiant` en `dossier_entree/musique.flac` ; rend sa fiche."""
    fiche = lire_fiche(identifiant, racine)
    chemin = Path(racine) / f"{identifiant}.flac"
    try:
        descripteur = os.open(chemin, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as erreur:
        raise ErreurImport(f"piste absente : {identifiant}") from erreur
    try:
        if not stat.S_ISREG(os.fstat(descripteur).st_mode):
            raise ErreurImport(f"piste non régulière : {identifiant}")
        with os.fdopen(descripteur, "rb", closefd=False) as source, \
                open(Path(dossier_entree) / "musique.flac", "xb") as cible:
            shutil.copyfileobj(source, cible)
    finally:
        os.close(descripteur)
    return fiche


def main(argv: list[str]) -> int:
    analyseur = argparse.ArgumentParser(prog="bibliotheque_musique")
    sous = analyseur.add_subparsers(dest="commande", required=True)
    imp = sous.add_parser("importer", help="importer une piste (à lancer en root)")
    imp.add_argument("--fichier", required=True)
    imp.add_argument("--id", required=True, dest="identifiant")
    imp.add_argument("--titre", required=True)
    imp.add_argument("--auteur", required=True)
    imp.add_argument("--licence", required=True, choices=LICENCES)
    imp.add_argument("--attribution")
    imp.add_argument("--reference")
    imp.add_argument("--source", required=True)
    imp.add_argument("--racine", default=RACINE_BIBLIOTHEQUE)
    args = analyseur.parse_args(argv)
    try:
        fiche = importer(args.fichier, args.identifiant, args.titre, args.auteur, args.licence,
                         args.source, args.attribution, args.reference, args.racine)
    except (ErreurImport, OSError) as erreur:
        print(f"import refusé : {erreur}", file=sys.stderr)
        return 3
    print(json.dumps(fiche, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
