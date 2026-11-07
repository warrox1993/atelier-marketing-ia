"""Provenance IA d'une vidéo de la fabrique (lot 11) : docs/conception-execution-etroite.md §7.

L'obligation est une propriété du livrable, posée ici, vérifiée par la porte de diffusion du plugin
(`plugin-atelier/src/serveur/fabrique-provenance.ts`). Décision de l'opérateur : IPTC seul, pas de C2PA en v1.

`poser_provenance(video, plan, infos)` fait quatre choses, toutes les écritures sur le fichier
passant par une cage (fabrique.cage) :

1. XMP du MP4 : `Iptc4xmpExt:DigitalSourceType` = trainedAlgorithmicMedia (vocabulaire IPTC),
   `dc:description` « Contenu généré avec l'IA », `xmp:CreatorTool` « Atelier Marketing IA ».
   Outil : exiftool (paquet Ubuntu `libimage-exiftool-perl`), qui écrit un vrai paquet XMP dans
   le MP4 (ffmpeg ne sait écrire que des étiquettes ilst, pas de XMP). Le fichier est réécrit
   dans un nouveau fichier (`-o`) puis relu dans une autre cage ; la valeur doit y figurer.
2. Filigrane audio : la piste audio du MP4 final est extraite par ffmpeg en cage (AAC vers wav
   PCM 16 bits) puis PerTh la lit (`fabrique.perth.detecter`, dans l'environnement voix, CPU).
   Le test est donc fait sur ce qui part réellement, après le montage et l'encodage AAC.
3. `provenance.json` à côté de la vidéo (écriture atomique).
4. Échec (ok=False) si le XMP relu n'a pas la valeur ou si le filigrane n'est pas détecté ;
   dans ce cas rien n'est remplacé ni écrit.

Une image (PNG) suit la même règle par `poser_provenance_image` : XMP écrit puis relu dans une cage neuve,
`provenance.json` à côté, mais pas de filigrane PerTh (il ne vaut que pour l'audio d'une vidéo).

Le détecteur PerTh tourne dans une cage `cpu` à l'espace d'adressage relevé (64 Gio : la limite
par défaut de 4 Gio ne convient pas à PyTorch) ; il ne lit qu'un wav que nous venons de produire.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

from fabrique.cage import DELAI_DOCUMENT_S, DELAI_MONTAGE_S, FSIZE_VIDEO_OCTETS, Etape, executer
from fabrique.generateurs.montage import FFMPEG, PlanMontage, valider_plan

EXIFTOOL = "/usr/bin/exiftool"
PYTHON_VOIX = "/opt/atelier-fabrique/venv-voix/bin/python"
SCRIPT_PERTH = str(Path(__file__).resolve().with_name("perth.py"))

DIGITAL_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
MENTION_IA = "Contenu généré avec l'IA"
OUTIL_CREATEUR = "Atelier Marketing IA"
NOM_PROVENANCE = "provenance.json"
DELAI_PERTH_S = 300
MEMOIRE_PERTH_OCTETS = 64 * 1024**3  # espace d'adressage de la cage (torch), pas une mémoire réelle
CPU_PERTH_S = 8 * DELAI_PERTH_S  # temps processeur cumulé des fils de torch
FREQUENCE_PERTH = 48000  # celle de la vidéo finale : on mesure ce qui part, sans rééchantillonner

MOTIF_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MOTIF_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
MOTIF_ENTREPRISE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
MOTIF_OUTIL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ +-]{0,63}$")
MOTIF_VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+~:-]{0,63}$")
MOTIF_GABARIT = re.compile(r"^[a-z0-9][a-z0-9_]{0,63}$")
MOTIF_FORMAT = re.compile(r"^[0-9]{3,4}x[0-9]{3,4}$")
SIGNATURE_PNG = b"\x89PNG\r\n\x1a\n"
# Fichiers qui reçoivent un XMP : extension -> nom dans la cage (liste fixe, jamais un nom venu d'ailleurs).
NOMS_CAGE_XMP = {".mp4": "video.mp4", ".png": "image.png", ".jpg": "image.jpg"}


@dataclass(frozen=True)
class InfosProvenance:
    """Ce que seule la fabrique sait : jamais fourni par un agent (aucun champ du schéma de demande)."""

    travail: str  # UUID du travail
    entreprise: str
    voix: tuple[str, ...]  # identifiants du registre des voix
    outils: Mapping[str, str] = field(default_factory=dict)  # moteur -> version (chatterbox, kokoro...)
    musique: Mapping[str, str] | None = None  # {"id": ..., "licence": ...} ou None
    type: str = "video"


@dataclass(frozen=True)
class InfosProvenanceImage:
    """Ce que seule la fabrique sait d'une image : jamais fourni par un agent."""

    travail: str  # UUID du travail
    entreprise: str
    gabarit: str
    format: str
    charte: str  # identifiant de la charte du registre
    outils: Mapping[str, str] = field(default_factory=dict)  # chrome-headless-shell -> version
    fond_ia: bool = False  # un fond généré par un modèle (lot I2), déclaré en métadonnées
    type: str = "image"


@dataclass(frozen=True)
class ResultatProvenance:
    ok: bool
    motif: str = ""
    provenance: dict | None = None
    chemin_json: Path | None = None


def _valider_infos(infos: InfosProvenance) -> None:
    if infos.type != "video":
        raise ValueError("type : seule la vidéo est prise en charge ici")
    if not MOTIF_UUID.fullmatch(infos.travail):
        raise ValueError("travail : UUID attendu")
    if not MOTIF_ENTREPRISE.fullmatch(infos.entreprise):
        raise ValueError("entreprise : identifiant invalide")
    if not infos.voix or not all(MOTIF_ID.fullmatch(v) for v in infos.voix):
        raise ValueError("voix : au moins un identifiant du registre attendu")
    for nom, version in infos.outils.items():
        if not MOTIF_OUTIL.fullmatch(nom) or not MOTIF_VERSION.fullmatch(str(version)):
            raise ValueError(f"outils : entrée invalide {nom!r}")
    if infos.musique is not None:
        if set(infos.musique) != {"id", "licence"} or not all(
                isinstance(v, str) and 0 < len(v) <= 200 for v in infos.musique.values()):
            raise ValueError("musique : {id, licence} attendus")


def _valider_infos_image(infos: InfosProvenanceImage) -> None:
    if infos.type != "image":
        raise ValueError("type : image attendue")
    if not MOTIF_UUID.fullmatch(infos.travail):
        raise ValueError("travail : UUID attendu")
    if not MOTIF_ENTREPRISE.fullmatch(infos.entreprise):
        raise ValueError("entreprise : identifiant invalide")
    if not MOTIF_GABARIT.fullmatch(infos.gabarit) or not MOTIF_FORMAT.fullmatch(infos.format) \
            or not MOTIF_ID.fullmatch(infos.charte):
        raise ValueError("gabarit, format ou charte : identifiant invalide")
    for nom, version in infos.outils.items():
        if not MOTIF_OUTIL.fullmatch(nom) or not MOTIF_VERSION.fullmatch(str(version)):
            raise ValueError(f"outils : entrée invalide {nom!r}")
    if not isinstance(infos.fond_ia, bool):
        raise ValueError("fond_ia : booléen attendu")


def _fichier_regulier(chemin: Path) -> bool:
    try:
        return stat.S_ISREG(os.lstat(chemin).st_mode)
    except OSError:
        return False


def empreinte_sha256(chemin: Path) -> str:
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloc)
    return h.hexdigest()


def _version_outil(commande: list[str]) -> str:
    """Première ligne de sortie d'une commande à arguments fixes ; « inconnue » si elle échoue."""
    try:
        sortie = subprocess.run(commande, capture_output=True, text=True, timeout=20, check=False,
                                stdin=subprocess.DEVNULL).stdout.strip().splitlines()
    except (OSError, subprocess.SubprocessError):
        return "inconnue"
    return (sortie[0] if sortie else "inconnue")[:64]


def _cage(programme: str, arguments: list[str], entree: Path, sortie: Path, delai: float):
    etape = Etape(type="cpu", programme=programme, arguments=tuple(arguments),
                  dossier_entree=str(entree), dossier_sortie=str(sortie), hors_ligne=True)
    return executer(etape, delai, fsize_octets=FSIZE_VIDEO_OCTETS)


def _derniere_ligne(octets: bytes) -> str:
    lignes = octets.decode("utf-8", "replace").strip().splitlines()
    return lignes[-1][:200] if lignes else ""


def _nom_cage(fichier: Path) -> str:
    """Nom du fichier dans la cage d'après son extension (mp4, png, jpg) ; ValueError sinon."""
    nom = NOMS_CAGE_XMP.get(fichier.suffix.lower())
    if nom is None:
        raise ValueError(f"extension non prise en charge pour le XMP : {fichier.suffix!r} ({sorted(NOMS_CAGE_XMP)})")
    return nom


def ecrire_xmp(fichier: Path, travail: Path) -> tuple[bool, str, Path | None]:
    """Réécrit `fichier` (mp4, png ou jpg) avec le XMP dans `travail/sortie/<nom>` (cage). (ok, motif, chemin)."""
    nom = _nom_cage(fichier)
    entree, sortie = travail / "entree", travail / "sortie"
    entree.mkdir()
    sortie.mkdir()
    shutil.copyfile(fichier, entree / nom)
    arguments = [
        "-o", f"/sortie/{nom}",
        f"-XMP-iptcExt:DigitalSourceType={DIGITAL_SOURCE_TYPE}",
        f"-XMP-dc:Description={MENTION_IA}",
        f"-XMP-xmp:CreatorTool={OUTIL_CREATEUR}",
        f"/entree/{nom}",
    ]
    r = _cage(EXIFTOOL, arguments, entree, sortie, DELAI_DOCUMENT_S)
    nouveau = sortie / nom
    if r.delai_depasse or r.code != 0 or not _fichier_regulier(nouveau):
        return False, f"écriture du XMP en échec : {_derniere_ligne(r.erreur) or _derniere_ligne(r.sortie)}", None
    return True, "", nouveau


def lire_xmp(fichier: Path, travail: Path) -> dict:
    """Relit le XMP d'un mp4, png ou jpg dans une cage neuve : {DigitalSourceType, Description, CreatorTool}."""
    nom = _nom_cage(fichier)
    entree, sortie = travail / "relecture-entree", travail / "relecture-sortie"
    entree.mkdir()
    sortie.mkdir()
    shutil.copyfile(fichier, entree / nom)
    arguments = ["-j", "-n", "-XMP-iptcExt:DigitalSourceType", "-XMP-dc:Description",
                 "-XMP-xmp:CreatorTool", f"/entree/{nom}"]
    r = _cage(EXIFTOOL, arguments, entree, sortie, DELAI_DOCUMENT_S)
    if r.code != 0:
        return {}
    try:
        liste = json.loads(r.sortie.decode("utf-8", "replace"))
        return liste[0] if isinstance(liste, list) and liste and isinstance(liste[0], dict) else {}
    except json.JSONDecodeError:
        return {}


def extraire_audio(fichier: Path, travail: Path) -> tuple[bool, str, Path | None]:
    """Piste audio du MP4 final vers un wav mono PCM 16 bits à 48 kHz (ffmpeg en cage)."""
    entree, sortie = travail / "audio-entree", travail / "audio-sortie"
    entree.mkdir()
    sortie.mkdir()
    shutil.copyfile(fichier, entree / "video.mp4")
    arguments = ["-nostdin", "-hide_banner", "-n", "-protocol_whitelist", "file", "-f", "mp4",
                 "-i", "/entree/video.mp4", "-vn", "-ac", "1", "-ar", str(FREQUENCE_PERTH),
                 "-c:a", "pcm_s16le", "-f", "wav", "/sortie/audio.wav"]
    r = _cage(FFMPEG, arguments, entree, sortie, DELAI_MONTAGE_S)
    wav = sortie / "audio.wav"
    if r.delai_depasse or r.code != 0 or not _fichier_regulier(wav):
        return False, f"extraction audio en échec : {_derniere_ligne(r.erreur)}", None
    return True, "", wav


def mesurer_perth(wav: Path) -> tuple[bool, float]:
    """(détecté, taux) par `fabrique.perth` dans l'environnement voix, en cage `cpu` ; RuntimeError si la mesure échoue.

    La cage n'a ni réseau ni /home. Son espace d'adressage est relevé à MEMOIRE_PERTH_OCTETS : torch
    dépassait les 4 Gio de la cage par défaut (la mémoire réellement occupée reste bien plus basse).
    """
    if not os.access(PYTHON_VOIX, os.X_OK):
        raise RuntimeError("environnement voix absent : PerTh ne peut pas être vérifié")
    with tempfile.TemporaryDirectory(prefix="perth-", dir=wav.parent) as nom:
        entree, sortie = Path(nom) / "entree", Path(nom) / "sortie"
        entree.mkdir()
        sortie.mkdir()
        shutil.copyfile(wav, entree / "audio.wav")
        etape = Etape(type="cpu", programme=PYTHON_VOIX,
                      arguments=("-I", "/code/perth.py", "/entree/audio.wav"),
                      dossier_entree=str(entree), dossier_sortie=str(sortie),
                      montages_modeles=((str(Path(SCRIPT_PERTH).parent), "/code"),), hors_ligne=True)
        r = executer(etape, DELAI_PERTH_S, memoire_octets=MEMOIRE_PERTH_OCTETS, cpu_s=CPU_PERTH_S)
    if r.delai_depasse:
        raise RuntimeError("mesure PerTh : délai dépassé")
    if r.code not in (0, 1):
        raise RuntimeError(f"mesure PerTh en échec : {_derniere_ligne(r.erreur) or 'code ' + str(r.code)}")
    mesure = json.loads(r.sortie.decode("utf-8").strip().splitlines()[-1])
    return bool(mesure["filigrane"]), float(mesure["taux"])


def _ecrire_json_atomique(chemin: Path, contenu: dict) -> None:
    fd, temporaire = tempfile.mkstemp(dir=chemin.parent, prefix=".provenance-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(contenu, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        os.chmod(temporaire, 0o640)
        os.replace(temporaire, chemin)
    except BaseException:
        try:
            os.unlink(temporaire)
        except OSError:
            pass
        raise


def poser_provenance(video: str | os.PathLike, plan: PlanMontage, infos: InfosProvenance) -> ResultatProvenance:
    """Pose le XMP IPTC, vérifie PerTh sur la piste audio finale, écrit `provenance.json` à côté.

    `video` : le `sortie/video.mp4` rendu par `monter`. Une entrée invalide lève ValueError ; une
    vérification qui échoue rend ok=False et laisse la vidéo d'origine inchangée, sans provenance.json.
    """
    chemin = Path(video).resolve()
    valider_plan(plan)
    _valider_infos(infos)
    if not _fichier_regulier(chemin) or chemin.suffix != ".mp4":
        raise ValueError("video : fichier .mp4 régulier attendu")

    with tempfile.TemporaryDirectory(prefix="provenance-") as nom_travail:
        travail = Path(nom_travail)
        ok, motif, nouveau = ecrire_xmp(chemin, travail)
        if not ok or nouveau is None:
            return ResultatProvenance(False, motif)
        relu = lire_xmp(nouveau, travail)
        if relu.get("DigitalSourceType") != DIGITAL_SOURCE_TYPE:
            return ResultatProvenance(False, "XMP relu sans la valeur DigitalSourceType attendue")
        ok, motif, wav = extraire_audio(nouveau, travail)
        if not ok or wav is None:
            return ResultatProvenance(False, motif)
        try:
            detecte, taux = mesurer_perth(wav)
        except (RuntimeError, subprocess.SubprocessError, ValueError, KeyError) as erreur:
            return ResultatProvenance(False, str(erreur))
        if not detecte:
            return ResultatProvenance(False, f"filigrane PerTh non détecté dans la piste audio finale (taux {taux:.3f})")
        # Tout est vérifié : seulement maintenant, la vidéo est remplacée (atomique, même dossier).
        remplacement = chemin.with_name(".video-xmp.tmp")
        shutil.copyfile(nouveau, remplacement)
        os.replace(remplacement, chemin)

    outils = {**{k: str(v) for k, v in infos.outils.items()},
              "ffmpeg": _version_outil([FFMPEG, "-version"]),
              "exiftool": _version_outil([EXIFTOOL, "-ver"])}
    provenance = {
        "travail": infos.travail,
        "entreprise": infos.entreprise,
        "type": infos.type,
        "fichier": chemin.name,
        "outils": outils,
        "voix": list(infos.voix),
        "musique": dict(infos.musique) if infos.musique is not None else None,
        "digital_source_type": DIGITAL_SOURCE_TYPE,
        "filigrane_perth": {"detecte": detecte, "taux": round(taux, 4)},
        "sha256": empreinte_sha256(chemin),
    }
    destination = chemin.with_name(NOM_PROVENANCE)
    _ecrire_json_atomique(destination, provenance)
    return ResultatProvenance(True, "", provenance, destination)


def poser_provenance_image(image: str | os.PathLike, infos: InfosProvenanceImage) -> ResultatProvenance:
    """Pose le XMP IPTC dans le PNG, le relit dans une cage neuve, écrit `provenance.json` à côté.

    `image` : le `image.png` rendu par `generateurs.images`. Une entrée invalide lève ValueError ; une
    vérification qui échoue rend ok=False et laisse l'image d'origine inchangée, sans provenance.json.
    Pas de filigrane PerTh : il ne vaut que pour l'audio d'une vidéo.
    """
    chemin = Path(os.path.abspath(image))  # pas resolve() : un lien symbolique doit rester visible pour le refuser
    _valider_infos_image(infos)
    if not _fichier_regulier(chemin) or chemin.suffix != ".png":
        raise ValueError("image : fichier .png régulier attendu")
    entete = chemin.read_bytes()[:33]
    if entete[:8] != SIGNATURE_PNG:
        raise ValueError("image : ce n'est pas un PNG")

    with tempfile.TemporaryDirectory(prefix="provenance-") as nom_travail:
        travail = Path(nom_travail)
        ok, motif, nouveau = ecrire_xmp(chemin, travail)
        if not ok or nouveau is None:
            return ResultatProvenance(False, motif)
        if nouveau.read_bytes()[:33] != entete:
            return ResultatProvenance(False, "le PNG réécrit n'a plus la même signature ni les mêmes dimensions")
        relu = lire_xmp(nouveau, travail)
        if relu.get("DigitalSourceType") != DIGITAL_SOURCE_TYPE:
            return ResultatProvenance(False, "XMP relu sans la valeur DigitalSourceType attendue")
        # Tout est vérifié : seulement maintenant, l'image est remplacée (atomique, même dossier).
        remplacement = chemin.with_name(".image-xmp.tmp")
        shutil.copyfile(nouveau, remplacement)
        os.replace(remplacement, chemin)

    outils = {**{k: str(v) for k, v in infos.outils.items()}, "exiftool": _version_outil([EXIFTOOL, "-ver"])}
    provenance = {
        "travail": infos.travail,
        "entreprise": infos.entreprise,
        "type": infos.type,
        "fichier": chemin.name,
        "gabarit": infos.gabarit,
        "format": infos.format,
        "charte": infos.charte,
        "outils": outils,
        "voix": [],
        "musique": None,
        "digital_source_type": DIGITAL_SOURCE_TYPE,
        "fond_ia": infos.fond_ia,
        "sha256": empreinte_sha256(chemin),
    }
    destination = chemin.with_name(NOM_PROVENANCE)
    _ecrire_json_atomique(destination, provenance)
    return ResultatProvenance(True, "", provenance, destination)


def main(argv: list[str]) -> int:  # pragma: no cover - aide à l'exploitation
    print("module de bibliothèque : voir poser_provenance()", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
