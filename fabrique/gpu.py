"""Disponibilité du GPU partagé avec les jeux de l'opérateur (lot 7, décision JB n°5 : la vidéo attend si un jeu tourne).

`gpu_disponible()` est une fonction pure quand on lui passe les sorties de commandes ; sans argument,
elle relève elle-même ces sorties (nvidia-smi et ps), sans shell. Bibliothèque standard seulement.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass

MEMOIRE_LIBRE_MIN_MIO = 8 * 1024  # 8 Gio, voir conception §6.5
DELAI_COMMANDE_S = 10
# Processus dont la présence signale un jeu (nom de commande exact, comme dans `ps -eo comm=`).
PROCESSUS_JEU = ("gamescope", "gamescope-wl", "gamescopereaper", "reaper")
# Processus de bureau qui tiennent un contexte graphique en permanence : ils ne comptent pas comme un jeu.
# La mémoire vidéo qu'ils prennent reste comptée par le seuil de mémoire libre.
PROCESSUS_BUREAU = (
    "gnome-shell", "xwayland", "xorg", "firefox", "chrome", "chromium", "ptyxis", "steam",
    "steamwebhelper", "explorer.exe", "claude-desktop", "code", "kwin_wayland", "plasmashell",
)


@dataclass(frozen=True)
class SortiesGpu:
    """Sorties brutes des commandes relevées (chaînes vides si la commande échoue)."""

    memoire: str  # nvidia-smi --query-gpu=memory.free,memory.total --format=csv,noheader,nounits
    applications_calcul: str  # nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits
    contextes: str  # nvidia-smi pmon -c 1
    processus: str  # ps -eo comm=


def _nom_court(chemin_ou_commande: str) -> str:
    """Premier mot de la commande, sans répertoire, en minuscules (gère les chemins Windows de Wine)."""
    mot = chemin_ou_commande.strip().split(" --")[0].strip()
    mot = mot.replace("\\", "/").rsplit("/", 1)[-1]
    return mot.split(" ")[0].lower()


def memoire_libre_mio(sortie: str) -> int | None:
    """Plus petite mémoire libre parmi les cartes, en Mio ; None si illisible."""
    valeurs = []
    for ligne in sortie.strip().splitlines():
        champs = [c.strip() for c in ligne.split(",")]
        if len(champs) >= 1 and champs[0].isdigit():
            valeurs.append(int(champs[0]))
    return min(valeurs) if valeurs else None


def applications_calcul(sortie: str) -> list[tuple[int, str, int]]:
    """(pid, nom, Mio) de chaque application de calcul. Le nom peut contenir des virgules : on coupe aux extrémités."""
    liste = []
    for ligne in sortie.strip().splitlines():
        if "," not in ligne:
            continue
        debut, memoire = ligne.rsplit(",", 1)
        pid, _, nom = debut.partition(",")
        if pid.strip().isdigit() and memoire.strip().isdigit():
            liste.append((int(pid), nom.strip(), int(memoire.strip())))
    return liste


def contextes_graphiques(sortie: str) -> list[tuple[int, str]]:
    """(pid, nom tronqué) des processus tenant un contexte GPU (type C, G ou C+G) d'après `nvidia-smi pmon`."""
    noms = []
    for ligne in sortie.splitlines():
        if ligne.lstrip().startswith("#") or not ligne.strip():
            continue
        champs = ligne.split()
        if len(champs) >= 10 and champs[1].isdigit() and champs[2] in ("G", "C+G", "C"):
            noms.append((int(champs[1]), champs[-1]))
    return noms


def gpu_disponible(
    sorties: SortiesGpu | None = None, memoire_min_mio: int = MEMOIRE_LIBRE_MIN_MIO,
) -> tuple[bool, str]:
    """(True, raison) si une étape GPU peut démarrer, sinon (False, raison de l'attente)."""
    if sorties is None:
        sorties = relever_sorties()
    raisons = []
    jeux = sorted({p.strip() for p in sorties.processus.splitlines() if p.strip() in PROCESSUS_JEU})
    if jeux:
        raisons.append(f"processus de jeu en cours : {', '.join(jeux)}")
    # pmon tronque les noms : on prend le nom complet des applications de calcul quand le pid y figure.
    candidats = {pid: nom for pid, nom, _ in applications_calcul(sorties.applications_calcul)}
    for pid, nom_tronque in contextes_graphiques(sorties.contextes):
        candidats.setdefault(pid, nom_tronque)
    usagers = sorted({_nom_court(nom) for nom in candidats.values()} - set(PROCESSUS_BUREAU))
    if usagers:
        raisons.append(f"GPU utilisé par : {', '.join(usagers)}")
    libre = memoire_libre_mio(sorties.memoire)
    if libre is None:
        raisons.append("mémoire vidéo illisible (nvidia-smi indisponible)")
    elif libre < memoire_min_mio:
        raisons.append(f"mémoire vidéo libre insuffisante : {libre} Mio < {memoire_min_mio} Mio")
    if raisons:
        return False, " ; ".join(raisons)
    return True, f"GPU libre ({libre} Mio de mémoire vidéo disponibles)"


def _lancer(commande: list[str]) -> str:
    try:
        resultat = subprocess.run(
            commande, capture_output=True, text=True, timeout=DELAI_COMMANDE_S, check=False,
            shell=False, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C"},
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return resultat.stdout if resultat.returncode == 0 else ""


def relever_sorties() -> SortiesGpu:
    return SortiesGpu(
        memoire=_lancer(["nvidia-smi", "--query-gpu=memory.free,memory.total", "--format=csv,noheader,nounits"]),
        applications_calcul=_lancer(
            ["nvidia-smi", "--query-compute-apps=pid,process_name,used_memory", "--format=csv,noheader,nounits"]),
        contextes=_lancer(["nvidia-smi", "pmon", "-c", "1"]),
        processus=_lancer(["ps", "-eo", "comm="]),
    )
