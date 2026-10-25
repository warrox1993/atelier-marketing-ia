"""Lanceur de cage bwrap : construction pure des arguments, exécution bornée, récupération sûre.

Aucun shell n'est jamais utilisé. Voir docs/conception-execution-etroite.md §4.3.
"""

from __future__ import annotations

import os
import signal
import stat
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from fabrique.filtre_seccomp import construire_filtre

# Délais mur par défaut (secondes).
DELAI_DOCUMENT_S = 60
DELAI_PDF_S = 90
DELAI_VOIX_S = 900
DELAI_SOUS_TITRES_S = 600
DELAI_MONTAGE_S = 1200
DELAI_RENDU_HTML_S = 1200

# Limites de ressources par défaut.
LIMITE_MEMOIRE_OCTETS = 4 * 1024**3
FSIZE_DOCUMENT_OCTETS = 50 * 1024**2
FSIZE_VIDEO_OCTETS = 500 * 1024**2
LIMITE_FICHIERS_OUVERTS = 256
LIMITE_PROCESSUS = 128
TAILLE_MAX_SORTIE = 64 * 1024
# Numéro de descripteur supposé pour le filtre seccomp quand on construit la ligne sans l'exécuter ;
# executer() passe le vrai numéro de son descripteur mémoire.
FD_SECCOMP_DEFAUT = 3

RACINE_FABRIQUE = "/opt/atelier-fabrique"
PERIPHERIQUES_GPU = (
    "/dev/nvidia0",
    "/dev/nvidiactl",
    "/dev/nvidia-uvm",
    "/dev/nvidia-uvm-tools",
)
TYPES_ETAPE = ("cpu", "pdf", "gpu")
# Limite de temps processeur par type d'étape (secondes), si non précisée.
CPU_PAR_TYPE = {"cpu": DELAI_DOCUMENT_S, "pdf": DELAI_PDF_S, "gpu": DELAI_RENDU_HTML_S}


@dataclass(frozen=True)
class Etape:
    type: str  # "cpu", "pdf" ou "gpu"
    programme: str  # chemin absolu fixe
    arguments: tuple[str, ...] = ()
    dossier_entree: str = ""
    dossier_sortie: str = ""
    montages_modeles: tuple[tuple[str, str], ...] = ()  # (hôte, cage), lecture seule
    hors_ligne: bool = False


@dataclass(frozen=True)
class Resultat:
    code: int | None
    duree_s: float
    sortie: bytes
    erreur: bytes
    delai_depasse: bool


def _verifier_chemin(chemin: str, nom: str) -> None:
    if not isinstance(chemin, str) or not chemin:
        raise ValueError(f"{nom} : chemin vide ou invalide")
    if "\0" in chemin:
        raise ValueError(f"{nom} : octet nul interdit")
    if not chemin.startswith("/"):
        raise ValueError(f"{nom} : chemin non absolu : {chemin!r}")
    if ".." in chemin.split("/"):
        raise ValueError(f"{nom} : '..' interdit : {chemin!r}")


def _valider(etape: Etape) -> None:
    if etape.type not in TYPES_ETAPE:
        raise ValueError(f"type d'étape inconnu : {etape.type!r}")
    _verifier_chemin(etape.programme, "programme")
    _verifier_chemin(etape.dossier_entree, "dossier_entree")
    _verifier_chemin(etape.dossier_sortie, "dossier_sortie")
    for hote, cage in etape.montages_modeles:
        _verifier_chemin(hote, "montage (hôte)")
        _verifier_chemin(cage, "montage (cage)")
    for argument in etape.arguments:
        if not isinstance(argument, str):
            raise ValueError("argument non textuel")
        if "\0" in argument:
            raise ValueError("argument contenant un octet nul")


def construire_arguments(
    etape: Etape,
    *,
    racine_fabrique: str = RACINE_FABRIQUE,
    existe: Callable[[str], bool] = os.path.exists,
    memoire_octets: int = LIMITE_MEMOIRE_OCTETS,
    fsize_octets: int = FSIZE_DOCUMENT_OCTETS,
    cpu_s: int | None = None,
    processus_max: int = LIMITE_PROCESSUS,
    fd_seccomp: int | None = FD_SECCOMP_DEFAUT,
) -> list[str]:
    """Construit la ligne de commande complète (prlimit + bwrap). Fonction pure, sans shell."""
    _valider(etape)
    _verifier_chemin(racine_fabrique, "racine_fabrique")
    if cpu_s is None:
        cpu_s = CPU_PAR_TYPE[etape.type]

    limites = ["prlimit"]
    if etape.type in ("cpu", "pdf"):
        limites.append(f"--as={memoire_octets}")
    limites += [
        f"--fsize={fsize_octets}",
        f"--nofile={LIMITE_FICHIERS_OUVERTS}",
        f"--cpu={cpu_s}",
        "--",
    ]

    cage = [
        "bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
        # Aucun espace de noms utilisateur imbriqué dans la cage (constat M2 de la revue du 24/10).
        "--unshare-user", "--disable-userns",
        "--ro-bind", "/usr", "/usr",
        "--symlink", "usr/bin", "/bin",
        "--symlink", "usr/lib", "/lib",
        "--symlink", "usr/lib64", "/lib64",
        "--ro-bind", "/etc/fonts", "/etc/fonts",
    ]
    if etape.type == "pdf":
        cage += ["--ro-bind", "/etc/libreoffice", "/etc/libreoffice"]
    if existe(racine_fabrique):
        cage += ["--ro-bind", racine_fabrique, racine_fabrique]
    cage += [
        "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
        "--ro-bind", etape.dossier_entree, "/entree",
        "--bind", etape.dossier_sortie, "/sortie",
    ]
    for hote, dans_cage in etape.montages_modeles:
        cage += ["--ro-bind", hote, dans_cage]
    if etape.type == "gpu":
        for peripherique in PERIPHERIQUES_GPU:
            if existe(peripherique):
                cage += ["--dev-bind", peripherique, peripherique]
    cage += [
        "--setenv", "HOME", "/tmp",
        "--setenv", "PATH", f"/usr/bin:{racine_fabrique}/bin",
        "--setenv", "LANG", "C.UTF-8",
    ]
    if etape.hors_ligne:
        cage += ["--setenv", "HF_HUB_OFFLINE", "1", "--setenv", "TRANSFORMERS_OFFLINE", "1"]
    if fd_seccomp is not None:
        # Filtre d'appels système (fabrique/filtre_seccomp.py), lu par bwrap sur ce descripteur.
        cage += ["--seccomp", str(fd_seccomp)]
    # RLIMIT_NPROC se compte par utilisateur sur tout le poste : posée devant bwrap, elle fait
    # échouer la création de la cage dès que l'hôte dépasse la limite (mesuré : 1809 fils pour
    # 128). Posée dans la cage, elle compte dans l'espace de noms utilisateur neuf.
    cage += [
        "--chdir", "/sortie", "--", "/usr/bin/prlimit", f"--nproc={processus_max}", "--",
        etape.programme, *etape.arguments,
    ]
    return limites + cage


def _lire_tronque(fichier) -> bytes:
    fichier.seek(0)
    return fichier.read(TAILLE_MAX_SORTIE)


def executer(etape: Etape, delai_s: float, **options) -> Resultat:
    """Lance l'étape dans la cage, sans shell. À expiration du délai, tue tout le groupe."""
    fd_filtre = os.memfd_create("filtre-seccomp")
    try:
        os.write(fd_filtre, construire_filtre())
        os.lseek(fd_filtre, 0, os.SEEK_SET)
        commande = construire_arguments(etape, **{"fd_seccomp": fd_filtre, **options})
        return _executer_commande(commande, delai_s, fd_filtre)
    finally:
        os.close(fd_filtre)


def _executer_commande(commande: list[str], delai_s: float, fd_filtre: int) -> Resultat:
    debut = time.monotonic()
    with tempfile.TemporaryFile() as sortie, tempfile.TemporaryFile() as erreur:
        processus = subprocess.Popen(
            commande, stdin=subprocess.DEVNULL, stdout=sortie, stderr=erreur,
            start_new_session=True, shell=False, pass_fds=(fd_filtre,),
        )
        delai_depasse = False
        try:
            code = processus.wait(timeout=delai_s)
        except subprocess.TimeoutExpired:
            delai_depasse = True
            try:
                os.killpg(processus.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            code = processus.wait()
        # Tue d'éventuels survivants du groupe même après une fin normale.
        try:
            os.killpg(processus.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        return Resultat(
            code=code,
            duree_s=time.monotonic() - debut,
            sortie=_lire_tronque(sortie),
            erreur=_lire_tronque(erreur),
            delai_depasse=delai_depasse,
        )


def recuperer_sortie(dossier_sortie: str | os.PathLike, noms_attendus: list[str]) -> list[Path]:
    """Rend les fichiers réguliers attendus. Ignore liens symboliques, fichiers spéciaux, absents."""
    dossier = Path(dossier_sortie)
    trouves: list[Path] = []
    fd_dossier = os.open(dossier, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for nom in noms_attendus:
            if not nom or nom in (".", "..") or "/" in nom or "\0" in nom:
                raise ValueError(f"nom attendu invalide : {nom!r}")
            try:
                info = os.lstat(nom, dir_fd=fd_dossier)
            except FileNotFoundError:
                continue
            if not stat.S_ISREG(info.st_mode):
                continue
            try:
                fd = os.open(nom, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd_dossier)
            except OSError:
                continue
            try:
                if stat.S_ISREG(os.fstat(fd).st_mode):
                    trouves.append(dossier / nom)
            finally:
                os.close(fd)
    finally:
        os.close(fd_dossier)
    return trouves
