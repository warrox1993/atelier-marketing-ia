"""Montage vidéo ffmpeg en cage (lot 9) : docs/conception-execution-etroite.md §6.3.

Deux parties :

1. construction PURE de la liste d'arguments ffmpeg (`construire_arguments_ffmpeg`,
   `construire_arguments_ffprobe`) : aucune option, aucun filtre ni aucun texte ne vient de
   l'agent, seulement des nombres validés (durées, numéros de scène) et des identifiants
   (format de sortie parmi une liste fermée, type de visuel `png` ou `mp4`) ;
2. exécution côté hôte (`monter`) : chaque appel passe par fabrique.cage (bwrap, sans shell,
   sans réseau, sans /home ni bibliothèque musicale).

Entrées à noms fixes dans /entree : `scene-NN.png` ou `scene-NN.mp4`, `voix-NN.wav`,
`sous-titres.ass` (déjà échappé par le module des sous-titres) et `musique.flac` (facultatif).
Sortie : /sortie/video.mp4.

Choix de conception
-------------------
- Assemblage par `filter_complex` : filtre `concat` (assemblage de flux dans le graphe), jamais
  le démultiplexeur `concat` ni de liste de fichiers.
- Musique : mise à longueur par boucle, volume de fond fixe (MUSIQUE_VOLUME) PUIS compression à
  chaîne latérale (`sidechaincompress`) pilotée par la voix : la musique baisse d'elle-même dès
  que la voix parle et remonte dans les silences. Le volume fixe seul laisserait la musique
  trop forte dans les silences ou couvrant la voix ; la compression adaptative est dans le
  filtre standard de ffmpeg et ne demande aucun réglage venant de l'agent.
- Mention IA : aucune incrustée (décision de l'opérateur du 06/11 : ni dans la vidéo, ni dans le texte du post) ; la provenance
  IA est portée par les métadonnées (provenance.py).
- Standard de qualité (docs/superpowers/etudes/2026-10-30-qualite-visuels.md §2.1) : encodage x264
  `medium` CRF 20, sonie du mélange normalisée à −16 LUFS (crête vraie −1,5 dBTP) ; la sortie est
  ensuite MESURÉE dans une cage (ebur128, blackdetect, silencedetect, débit ffprobe) et refusée si elle
  est hors norme. Les alertes non bloquantes et les mesures sont écrites dans `controle-qualite.json`,
  avec `planche.png` (images de 0, 1 et 2 s puis première image de chaque scène, pour la revue).
"""

from __future__ import annotations

import json
import math
import os
import shutil
import re
import stat
from dataclasses import dataclass
from pathlib import Path

from fabrique.cage import DELAI_MONTAGE_S, FSIZE_VIDEO_OCTETS, Etape, executer, recuperer_sortie
from fabrique.generateurs import sous_titres

FFMPEG = "/usr/bin/ffmpeg"
FFPROBE = "/usr/bin/ffprobe"
ENTREE = "/entree"
SORTIE = "/sortie"
POLICES = "/opt/atelier-fabrique/polices"
NOM_VIDEO = "video.mp4"
NOM_PLANCHE = "planche.png"
NOM_CONTROLE = "controle-qualite.json"

FORMATS_SORTIE = {
    "1080x1920": (1080, 1920),
    "1920x1080": (1920, 1080),
    "1080x1080": (1080, 1080),
}
IMAGES_PAR_SECONDE = 30
MAX_SCENES = 30
DUREE_MAX_S = 180.0
DUREE_MIN_SCENE_S = 0.5
TYPES_VISUEL = ("png", "mp4")
FREQUENCE_AUDIO = 48000
MUSIQUE_VOLUME = 0.30
# Mémoire virtuelle de la cage de montage : x264 en 1080p avec des fils d'exécution multiples
# dépasse 4 Gio d'espace d'adressage (mesuré), la limite par défaut est donc relevée.
MEMOIRE_MONTAGE_OCTETS = 12 * 1024**3
# Temps processeur total (somme des fils) : plus que le délai mur, x264 utilise plusieurs coeurs.
CPU_MONTAGE_S = 4 * DELAI_MONTAGE_S
# Fils de l'encodeur : la cage limite le nombre de processus (128) ; avec les fils de décodage et
# de filtres, x264 à 24 fils (valeur automatique de ce poste) n'arrivait plus à démarrer (mesuré).
FILS_ENCODAGE = 6
# Fils du graphe de filtres : sans cette limite, chaque `scale` ouvre un fil par coeur (24 ici) et
# un montage de 3 scènes dépassait la limite de processus de la cage (swscaler : EAGAIN, mesuré).
FILS_FILTRES = 2

# Standard de qualité des vidéos (étude 2026-10-30, §2.1). Sources : EBU R 128-2023 (crête vraie),
# AES TD1008 (−16 LUFS), plancher de débit TikTok ; le reste est un choix interne à calibrer.
SONIE_CIBLE_LUFS = -16.0
SONIE_TOLERANCE_LU = 1.0
CRETE_CIBLE_DBTP = -1.5  # cible de loudnorm, qui laisse une marge à la perte de l'AAC
CRETE_MAX_DBTP = -1.0  # seuil de refus, mesuré sur le fichier final
DEBIT_VIDEO_MIN_KBPS = 516.0
# Exigence d'envoi de la régie : sous ce débit mesuré en CRF 20 (fond fixe, texte), une seconde passe en
# débit constant avec bourrage remonte le fichier ; un contenu chargé n'est jamais plafonné.
DEBIT_BOURRAGE_SEUIL_KBPS = 600
DEBIT_CONSTANT_KBPS = 600
DEBIT_VIDEO_CONFORT_KBPS = 4000.0  # alerte en dessous (1080p)
NOIR_REFUS_S = 0.5  # image noire dès l'instant 0 pendant au moins cette durée (dans la première seconde)
VOIX_TARDIVE_S = 0.5
DELAI_MESURES_S = 120
DELAI_PLANCHE_S = 120
FSIZE_PLANCHE_OCTETS = 64 * 1024**2
LARGEUR_VIGNETTE = 360
COLONNES_PLANCHE = 6
MAX_IMAGES_PLANCHE = 36  # 30 scènes au plus plus les images de 0, 1 et 2 s : grille 6 x 6
ZONE_HAUTE_9_16 = 0.14  # Meta Reels : rien d'important dans les 14 % du haut, les 35 % du bas, 6 % de chaque côté
# loudnorm travaille en 192 kHz : on revient à la fréquence du montage, en flottant stéréo.
SUITE_SONIE = f"aresample={FREQUENCE_AUDIO},aformat=sample_fmts=fltp:channel_layouts=stereo"
CLES_SONIE_MESUREE = (("measured_I", "input_i"), ("measured_TP", "input_tp"), ("measured_LRA", "input_lra"),
                      ("measured_thresh", "input_thresh"), ("offset", "target_offset"))


@dataclass(frozen=True)
class SceneMontage:
    numero: int
    type_visuel: str  # "png" ou "mp4"
    duree_s: float


@dataclass(frozen=True)
class PlanMontage:
    scenes: tuple[SceneMontage, ...]
    format_sortie: str
    avec_musique: bool = False


@dataclass(frozen=True)
class ResultatMontage:
    ok: bool
    motif: str = ""
    video: Path | None = None
    duree_video_s: float = 0.0
    duree_montage_s: float = 0.0
    planche: Path | None = None  # planche de revue, dans le dossier de la vidéo (hors `fichiers` du livrable)
    controle_qualite: Path | None = None  # controle-qualite.json, même dossier
    motif_clair: bool = False  # le motif (rendu hors norme) peut être donné tel quel au producteur


def valider_plan(plan: PlanMontage) -> tuple[int, int, float]:
    """Contrôle le plan ; rend (largeur, hauteur, durée totale). ValueError si invalide."""
    if plan.format_sortie not in FORMATS_SORTIE:
        raise ValueError(f"format de sortie non autorisé : {plan.format_sortie!r}")
    if not 1 <= len(plan.scenes) <= MAX_SCENES:
        raise ValueError(f"nombre de scènes hors limites (1 à {MAX_SCENES}) : {len(plan.scenes)}")
    total = 0.0
    for position, scene in enumerate(plan.scenes, start=1):
        if scene.numero != position:
            raise ValueError("les scènes doivent être numérotées 1, 2, 3… sans trou")
        if scene.type_visuel not in TYPES_VISUEL:
            raise ValueError(f"type de visuel non autorisé : {scene.type_visuel!r}")
        duree = scene.duree_s
        if isinstance(duree, bool) or not isinstance(duree, (int, float)) or not math.isfinite(duree):
            raise ValueError("durée de scène non numérique")
        if not DUREE_MIN_SCENE_S <= duree <= DUREE_MAX_S:
            raise ValueError(f"durée de scène hors limites : {duree}")
        total += duree
    if total > DUREE_MAX_S:
        raise ValueError(f"durée totale supérieure à {DUREE_MAX_S} s : {total}")
    largeur, hauteur = FORMATS_SORTIE[plan.format_sortie]
    return largeur, hauteur, total


def _secondes(valeur: float) -> str:
    return f"{valeur:.3f}"


def _nom_visuel(scene: SceneMontage) -> str:
    return f"scene-{scene.numero:02d}.{scene.type_visuel}"


def _entrees_visuelles(scene: SceneMontage) -> list[str]:
    """Entrée d'un visuel : démultiplexeur forcé, seul protocole `file`, durée bornée."""
    base = ["-protocol_whitelist", "file"]
    chemin = f"{ENTREE}/{_nom_visuel(scene)}"
    if scene.type_visuel == "png":
        # Une seule image lue : elle est prolongée par `tpad` dans le graphe. Pas de `-loop 1`, qui
        # relit sans fin un fichier illisible (mesuré : plus de 2 minutes sur un faux PNG).
        return base + ["-f", "image2", "-pattern_type", "none", "-framerate", str(IMAGES_PAR_SECONDE),
                       "-i", chemin]
    return base + ["-f", "mov", "-t", _secondes(scene.duree_s), "-i", chemin]


def _filtre_visuel(indice: int, scene: SceneMontage, largeur: int, hauteur: int) -> str:
    chaine = (
        f"[{indice}:v:0]scale={largeur}:{hauteur}:force_original_aspect_ratio=decrease,"
        f"pad={largeur}:{hauteur}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,"
        f"fps={IMAGES_PAR_SECONDE},format=yuv420p"
    )
    # Image fixe ou clip plus court que la scène : prolongé sur sa dernière image.
    chaine += f",tpad=stop_mode=clone:stop_duration={_secondes(scene.duree_s)}"
    chaine += f",trim=duration={_secondes(scene.duree_s)},setpts=PTS-STARTPTS[v{scene.numero}]"
    return chaine


def _filtre_voix(indice: int, scene: SceneMontage) -> str:
    return (
        f"[{indice}:a:0]aresample={FREQUENCE_AUDIO},aformat=sample_fmts=fltp:channel_layouts=stereo,"
        f"apad=whole_dur={_secondes(scene.duree_s)},atrim=duration={_secondes(scene.duree_s)},"
        f"asetpts=PTS-STARTPTS[a{scene.numero}]"
    )


def _entrees_audio(plan: PlanMontage) -> list[str]:
    """Entrées des voix (une par scène) puis de la musique éventuelle, aux noms fixes de /entree."""
    arguments = []
    for scene in plan.scenes:
        arguments += ["-protocol_whitelist", "file", "-f", "wav", "-i", f"{ENTREE}/voix-{scene.numero:02d}.wav"]
    if plan.avec_musique:
        arguments += ["-protocol_whitelist", "file", "-f", "flac", "-stream_loop", "-1", "-i", f"{ENTREE}/musique.flac"]
    return arguments


def _filtres_melange(plan: PlanMontage, indice_musique: int, total: float, filtre_sonie: str) -> list[str]:
    """Du flux `[voix]` (voix assemblées) au flux `[aout]` : musique sous la voix, puis sonie normalisée."""
    if plan.avec_musique:
        filtres = [
            f"[{indice_musique}:a:0]aresample={FREQUENCE_AUDIO},aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"atrim=duration={_secondes(total)},volume={MUSIQUE_VOLUME},"
            f"afade=t=out:st={_secondes(max(total - 2.0, 0.0))}:d=2,asetpts=PTS-STARTPTS[musique]",
            "[voix]asplit=2[voixmix][voixpilote]",
            "[musique][voixpilote]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=500[musique_baissee]",
            "[voixmix][musique_baissee]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mixe]",
        ]
    else:
        filtres = ["[voix]anull[mixe]"]
    return filtres + [f"[mixe]{filtre_sonie}[aout]"]


def _filtre_sonie(mesure: dict | None, passe_de_mesure: bool = False) -> str:
    """Filtre loudnorm vers −16 LUFS / −1,5 dBTP : mesure (print_format), deux passes (valeurs mesurées) ou une."""
    base = f"loudnorm=I={SONIE_CIBLE_LUFS:g}:TP={CRETE_CIBLE_DBTP:g}:LRA=11"
    if passe_de_mesure:
        return base + ":print_format=json"
    if mesure is None:
        return f"{base},{SUITE_SONIE}"
    valeurs = ":".join(f"{nom}={float(mesure[cle]):.2f}" for nom, cle in CLES_SONIE_MESUREE)
    return f"{base}:{valeurs}:linear=true,{SUITE_SONIE}"


def construire_arguments_sonie(plan: PlanMontage) -> list[str]:
    """Arguments de ffmpeg (sans le programme) de la première passe de loudnorm : audio seul, sans sortie. Pure."""
    _, _, total = valider_plan(plan)
    n = len(plan.scenes)
    arguments = ["-nostdin", "-hide_banner", "-nostats", "-loglevel", "info",
                 "-filter_threads", str(FILS_FILTRES), "-filter_complex_threads", str(FILS_FILTRES)]
    arguments += _entrees_audio(plan)
    filtres = [_filtre_voix(i, s) for i, s in enumerate(plan.scenes)]
    filtres.append("".join(f"[a{s.numero}]" for s in plan.scenes) + f"concat=n={n}:v=0:a=1[voix]")
    filtres += _filtres_melange(plan, n, total, _filtre_sonie(None, passe_de_mesure=True))
    return arguments + ["-filter_complex", ";".join(filtres), "-map", "[aout]", "-t", _secondes(total),
                        "-f", "null", "/dev/null"]


def analyser_sonie(sortie: str) -> dict | None:
    """Mesures de la première passe de loudnorm (bloc JSON de la fin de la sortie), ou None si inexploitables."""
    trouve = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", sortie)
    if trouve is None:
        return None
    try:
        brut = json.loads(trouve.group(0))
        mesure = {cle: float(brut[cle]) for _, cle in CLES_SONIE_MESUREE}
    except (ValueError, KeyError, TypeError):
        return None
    return mesure if all(math.isfinite(v) for v in mesure.values()) else None  # voix muette : une passe


def _reglage_debit(constant: bool) -> list[str]:
    if not constant:
        return ["-crf", "20"]
    debit = f"{DEBIT_CONSTANT_KBPS}k"
    return ["-b:v", debit, "-minrate", debit, "-maxrate", debit, "-bufsize", f"{2 * DEBIT_CONSTANT_KBPS}k",
            "-x264-params", "nal-hrd=cbr"]


def construire_arguments_ffmpeg(plan: PlanMontage, sonie_mesuree: dict | None = None,
                                debit_constant: bool = False) -> list[str]:
    """Liste d'arguments de ffmpeg (sans le programme). Fonction pure, sans shell ni lecture disque.

    `sonie_mesuree` : résultat de `analyser_sonie` (première passe de loudnorm) ; sans elle, loudnorm
    travaille en une passe, moins précis sur les clips courts ou à silences.
    `debit_constant` : seconde passe d'encodage, débit constant avec bourrage (nal-hrd=cbr) à la place du CRF 20.
    """
    largeur, hauteur, total = valider_plan(plan)
    scenes = plan.scenes
    n = len(scenes)

    arguments = ["-nostdin", "-hide_banner", "-n", "-loglevel", "warning",
                 "-filter_threads", str(FILS_FILTRES),
                 "-filter_complex_threads", str(FILS_FILTRES)]
    for scene in scenes:
        arguments += _entrees_visuelles(scene)
    arguments += _entrees_audio(plan)

    filtres = [_filtre_visuel(i, s, largeur, hauteur) for i, s in enumerate(scenes)]
    filtres += [_filtre_voix(n + i, s) for i, s in enumerate(scenes)]
    entrees_concat = "".join(f"[v{s.numero}][a{s.numero}]" for s in scenes)
    filtres.append(f"{entrees_concat}concat=n={n}:v=1:a=1[vbrut][voix]")

    # Sous-titres : incrustation ASS, polices limitées à POLICES.
    filtres.append(f"[vbrut]ass=filename={ENTREE}/sous-titres.ass:fontsdir={POLICES}[vout]")

    filtres += _filtres_melange(plan, 2 * n, total, _filtre_sonie(sonie_mesuree))

    arguments += ["-filter_complex", ";".join(filtres), "-map", "[vout]", "-map", "[aout]"]
    arguments += [
        "-threads", str(FILS_ENCODAGE), "-c:v", "libx264", "-preset", "medium", *_reglage_debit(debit_constant),
        "-pix_fmt", "yuv420p",
        "-r", str(IMAGES_PAR_SECONDE), "-fps_mode", "cfr",
        "-c:a", "aac", "-b:a", "160k", "-ar", str(FREQUENCE_AUDIO), "-ac", "2",
        "-t", _secondes(total), "-map_metadata", "-1", "-movflags", "+faststart",
        "-f", "mp4", f"{SORTIE}/{NOM_VIDEO}",
    ]
    return arguments


def construire_arguments_ffprobe(chemin_cage: str, demultiplexeur: str) -> list[str]:
    """Arguments de ffprobe (sans le programme) pour un fichier de la cage. Fonction pure."""
    if demultiplexeur not in ("mov", "flac", "wav", "mp3", "ogg"):
        raise ValueError(f"démultiplexeur non autorisé : {demultiplexeur!r}")
    if not chemin_cage.startswith((f"{ENTREE}/", f"{SORTIE}/")) or ".." in chemin_cage.split("/"):
        raise ValueError(f"chemin hors de la cage : {chemin_cage!r}")
    return [
        "-v", "error", "-protocol_whitelist", "file", "-format_whitelist", demultiplexeur,
        "-f", demultiplexeur, "-print_format", "json", "-show_format", "-show_streams", chemin_cage,
    ]


def _horodatage_ass(secondes: float) -> str:
    centiemes = round(secondes * 100)
    heures, reste = divmod(centiemes, 360000)
    minutes, reste = divmod(reste, 6000)
    return f"{heures}:{minutes:02d}:{reste // 100:02d}.{reste % 100:02d}"


def _fichier_regulier(chemin: Path) -> bool:
    try:
        return stat.S_ISREG(os.lstat(chemin).st_mode)
    except OSError:
        return False


SIGNATURES_VISUEL = {"png": (0, b"\x89PNG\r\n\x1a\n"), "mp4": (4, b"ftyp")}


def _signature_visuel_ok(chemin: Path, type_visuel: str) -> bool:
    decalage, attendu = SIGNATURES_VISUEL[type_visuel]
    try:
        with open(chemin, "rb") as fichier:
            return fichier.read(decalage + len(attendu))[decalage:] == attendu
    except OSError:
        return False


def _fichiers_requis(plan: PlanMontage) -> list[str]:
    noms = ["sous-titres.ass"]
    for scene in plan.scenes:
        noms += [_nom_visuel(scene), f"voix-{scene.numero:02d}.wav"]
    if plan.avec_musique:
        noms.append("musique.flac")
    return noms


def _sonder(dossier_travail: Path) -> tuple[dict | None, str]:
    """ffprobe dans une cage sur la vidéo produite. Rend (sonde, motif d'échec)."""
    ctrl_sortie = dossier_travail / "ctrl-sortie"
    ctrl_sortie.mkdir(exist_ok=True)
    etape = Etape(type="cpu", programme=FFPROBE,
                  arguments=tuple(construire_arguments_ffprobe(f"{ENTREE}/{NOM_VIDEO}", "mov")),
                  dossier_entree=str(dossier_travail / "sortie"), dossier_sortie=str(ctrl_sortie),
                  hors_ligne=True)
    resultat = executer(etape, 60)
    if resultat.delai_depasse or resultat.code != 0:
        return None, "contrôle ffprobe de la sortie en échec"
    try:
        return json.loads(resultat.sortie.decode("utf-8")), ""
    except ValueError:
        return None, "sortie ffprobe illisible"


def controler_sortie(dossier_travail: Path, plan: PlanMontage, largeur: int, hauteur: int,
                     duree_max_s: float) -> tuple[bool, str, float, dict]:
    """Contrôle de la vidéo produite, en deux cages : structure (ffprobe) puis standard de qualité.

    Rend (ok, motif, durée, contrôle) ; le contrôle (mesures et alertes) est le contenu de
    `controle-qualite.json`. Un rendu hors norme est refusé avec un motif clair.
    """
    sonde, motif = _sonder(dossier_travail)
    if sonde is None:
        return False, motif, 0.0, {}
    ok, motif, duree = _juger_sonde(sonde, largeur, hauteur, duree_max_s)
    if not ok:
        return False, motif, duree, {}
    debit = _debit_video_kbps(sonde)
    mesures, motif = _mesurer(dossier_travail)
    if mesures is None:
        return False, motif, duree, {}
    ok, motif, alertes = juger_controle(mesures, debit)
    controle = {"format": plan.format_sortie, "duree_s": round(duree, 2), **_arrondir(mesures),
                "debit_video_kbps": round(debit), "alertes": alertes}
    return ok, motif, duree, controle


def _arrondir(mesures: dict) -> dict:
    return {cle: (round(valeur, 2) if isinstance(valeur, float) and math.isfinite(valeur) else valeur)
            for cle, valeur in mesures.items()}


def _debit_video_kbps(sonde: dict) -> float:
    """Débit moyen de la piste vidéo : celui du flux, sinon (taille du fichier / durée) moins l'audio."""
    flux = sonde.get("streams", [])
    video = next(f for f in flux if f.get("codec_type") == "video")
    audio = next((f for f in flux if f.get("codec_type") == "audio"), {})
    try:
        return float(video["bit_rate"]) / 1000
    except (KeyError, TypeError, ValueError):
        pass
    try:
        total = float(sonde["format"]["size"]) * 8 / float(sonde["format"]["duration"]) / 1000
        return max(total - float(audio.get("bit_rate", 0)) / 1000, 0.0)
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return 0.0


def construire_arguments_mesures() -> list[str]:
    """Arguments de ffmpeg (sans le programme) qui mesurent /entree/video.mp4. Fonction pure.

    Une seule lecture : sonie intégrée et crête vraie (ebur128), noir de la première seconde
    (blackdetect sur [0 ; 1 s]), silence initial de l'audio (silencedetect). Aucune sortie fichier.
    """
    graphe = (
        "[0:v:0]trim=end=1,blackdetect=d=0.1:pix_th=0.10[v];"
        "[0:a:0]ebur128=peak=true:framelog=quiet,silencedetect=n=-45dB:d=0.1[a]"
    )
    return ["-nostdin", "-hide_banner", "-nostats", "-loglevel", "info",
            "-protocol_whitelist", "file", "-f", "mov", "-i", f"{ENTREE}/{NOM_VIDEO}",
            "-filter_complex", graphe,
            "-map", "[v]", "-f", "null", "/dev/null", "-map", "[a]", "-f", "null", "/dev/null"]


_NOMBRE = r"(-?inf|-?\d+(?:\.\d+)?)"


def analyser_mesures(sortie: str) -> dict:
    """Extrait les mesures de la sortie texte de ffmpeg. ValueError si le résumé ebur128 manque."""
    sonie = re.search(r"Integrated loudness:\s*\n\s*I:\s*" + _NOMBRE + r"\s*LUFS", sortie)
    crete = re.search(r"True peak:\s*\n\s*Peak:\s*" + _NOMBRE + r"\s*dBFS", sortie)
    if sonie is None or crete is None:
        raise ValueError("résumé de sonie absent de la sortie de ffmpeg")
    instant = 1 / IMAGES_PAR_SECONDE + 1e-6  # tolérance : « dès l'instant 0 » à une image près
    noirs = re.findall(r"black_start:\s*(-?[\d.]+)\s+black_end:\s*-?[\d.]+\s+black_duration:\s*(-?[\d.]+)", sortie)
    # silencedetect écrit `silence_start` puis `silence_end` : on garde la fin du silence qui commence à 0
    bornes = re.findall(r"silence_(start|end):\s*(-?[\d.]+)", sortie)
    voix = [float(fin) for (g1, debut), (g2, fin) in zip(bornes, bornes[1:])
            if (g1, g2) == ("start", "end") and float(debut) <= instant]
    return {"sonie_lufs": float(sonie.group(1)), "crete_vraie_dbtp": float(crete.group(1)),
            "noir_initial_s": max((float(d) for debut, d in noirs if float(debut) <= instant), default=0.0),
            "voix_debut_s": max(voix, default=0.0)}


def _mesurer(dossier_travail: Path) -> tuple[dict | None, str]:
    ctrl_sortie = dossier_travail / "ctrl-sortie"
    ctrl_sortie.mkdir(exist_ok=True)
    etape = Etape(type="cpu", programme=FFMPEG, arguments=tuple(construire_arguments_mesures()),
                  dossier_entree=str(dossier_travail / "sortie"), dossier_sortie=str(ctrl_sortie),
                  hors_ligne=True)
    resultat = executer(etape, DELAI_MESURES_S, memoire_octets=MEMOIRE_MONTAGE_OCTETS, cpu_s=CPU_MONTAGE_S)
    if resultat.delai_depasse or resultat.code != 0:
        return None, "mesures de qualité de la sortie en échec"
    try:
        return analyser_mesures(resultat.erreur.decode("utf-8", "replace")), ""
    except ValueError:
        return None, "mesures de qualité de la sortie illisibles"


def juger_controle(mesures: dict, debit_video_kbps: float) -> tuple[bool, str, list[str]]:
    """Applique le standard. Rend (ok, motif du refus, alertes non bloquantes). Fonction pure."""
    sonie, crete = mesures["sonie_lufs"], mesures["crete_vraie_dbtp"]
    if not math.isfinite(sonie) or abs(sonie - SONIE_CIBLE_LUFS) > SONIE_TOLERANCE_LU + 1e-9:
        return False, (f"sonie intégrée hors norme : {sonie:.1f} LUFS "
                       f"(attendu {SONIE_CIBLE_LUFS:g} ± {SONIE_TOLERANCE_LU:g})"), []
    if crete > CRETE_MAX_DBTP:
        return False, f"crête vraie trop haute : {crete:.1f} dBTP (maximum {CRETE_MAX_DBTP:g})", []
    if mesures["noir_initial_s"] >= NOIR_REFUS_S:
        return False, (f"image noire dès l'instant 0 pendant {mesures['noir_initial_s']:.1f} s "
                       "(la première seconde doit montrer quelque chose)"), []
    if debit_video_kbps < DEBIT_VIDEO_MIN_KBPS:
        return False, (f"débit vidéo moyen trop faible : {debit_video_kbps:.0f} kb/s "
                       f"(minimum {DEBIT_VIDEO_MIN_KBPS:g})"), []
    alertes = []
    if mesures["voix_debut_s"] > VOIX_TARDIVE_S:
        alertes.append(f"la voix démarre à {mesures['voix_debut_s']:.1f} s (visé : avant {VOIX_TARDIVE_S:g} s)")
    if debit_video_kbps < DEBIT_VIDEO_CONFORT_KBPS:
        alertes.append(f"débit vidéo moyen de {debit_video_kbps:.0f} kb/s, "
                       f"sous les {DEBIT_VIDEO_CONFORT_KBPS / 1000:g} Mb/s visés en 1080p")
    return True, "", alertes


def indices_planche(plan: PlanMontage) -> list[int]:
    """Numéros d'images (30 i/s, constant) de la planche : 0, 1 et 2 s, puis le début de chaque scène."""
    debuts = [0.0]
    for scene in plan.scenes[:-1]:
        debuts.append(debuts[-1] + scene.duree_s)
    total_images = round(sum(s.duree_s for s in plan.scenes) * IMAGES_PAR_SECONDE)
    candidats = [0, IMAGES_PAR_SECONDE, 2 * IMAGES_PAR_SECONDE] + [round(d * IMAGES_PAR_SECONDE) for d in debuts]
    return sorted({n for n in candidats if 0 <= n < total_images})


def construire_arguments_planche(indices: list[int]) -> list[str]:
    """Arguments de ffmpeg (sans le programme) qui assemblent la planche. Fonction pure, indices validés."""
    if not 1 <= len(indices) <= MAX_IMAGES_PLANCHE or any(
            isinstance(n, bool) or not isinstance(n, int) or n < 0 for n in indices):
        raise ValueError("indices d'images de la planche invalides")
    colonnes = min(COLONNES_PLANCHE, len(indices))
    lignes = -(-len(indices) // colonnes)
    choix = "+".join(f"eq(n,{n})" for n in indices)
    graphe = (f"select='{choix}',scale={LARGEUR_VIGNETTE}:-2,"
              f"tile={colonnes}x{lignes}:margin=6:padding=6:color=0x202020")
    return ["-nostdin", "-hide_banner", "-n", "-loglevel", "error", "-protocol_whitelist", "file",
            "-f", "mov", "-i", f"{ENTREE}/{NOM_VIDEO}", "-vf", graphe, "-an",
            "-frames:v", "1", "-fps_mode", "passthrough", f"{SORTIE}/{NOM_PLANCHE}"]


def faire_planche(dossier_travail: Path, plan: PlanMontage) -> tuple[Path | None, str]:
    """Planche de revue dans une cage hors réseau. Rend (planche.png dans `sortie`, motif d'échec)."""
    dossier_planche = dossier_travail / "planche"
    dossier_planche.mkdir(exist_ok=True)
    etape = Etape(type="cpu", programme=FFMPEG,
                  arguments=tuple(construire_arguments_planche(indices_planche(plan))),
                  dossier_entree=str(dossier_travail / "sortie"), dossier_sortie=str(dossier_planche),
                  hors_ligne=True)
    resultat = executer(etape, DELAI_PLANCHE_S, memoire_octets=MEMOIRE_MONTAGE_OCTETS, cpu_s=CPU_MONTAGE_S,
                        fsize_octets=FSIZE_PLANCHE_OCTETS)
    trouves = recuperer_sortie(dossier_planche, [NOM_PLANCHE])
    if resultat.delai_depasse or resultat.code != 0 or len(trouves) != 1 or \
            not _signature_visuel_ok(trouves[0], "png"):
        return None, "planche de revue impossible"
    destination = dossier_travail / "sortie" / NOM_PLANCHE
    shutil.copyfile(trouves[0], destination)
    return destination, ""


def _juger_sonde(sonde: dict, largeur: int, hauteur: int, duree_max_s: float) -> tuple[bool, str, float]:
    flux = sonde.get("streams", [])
    videos = [f for f in flux if f.get("codec_type") == "video"]
    audios = [f for f in flux if f.get("codec_type") == "audio"]
    if len(flux) != 2 or len(videos) != 1 or len(audios) != 1:
        return False, "la vidéo doit contenir exactement un flux vidéo et un flux audio", 0.0
    if "mp4" not in str(sonde.get("format", {}).get("format_name", "")).split(","):
        return False, "conteneur autre que MP4", 0.0
    video, audio = videos[0], audios[0]
    if video.get("codec_name") != "h264" or video.get("pix_fmt") != "yuv420p":
        return False, "codec vidéo autre que H.264 yuv420p", 0.0
    if audio.get("codec_name") != "aac":
        return False, "codec audio autre que AAC", 0.0
    if (video.get("width"), video.get("height")) != (largeur, hauteur):
        return False, "résolution différente de celle demandée", 0.0
    try:
        duree = float(sonde["format"]["duration"])
    except (KeyError, TypeError, ValueError):
        return False, "durée absente", 0.0
    if not 0 < duree <= duree_max_s:
        return False, f"durée hors limite : {duree}", duree
    return True, "", duree


@dataclass(frozen=True)
class _Reencodage:
    motif: str = ""  # vide si la seconde passe a remplacé la vidéo
    duree_s: float = 0.0


def _debit_apres_crf(travail: Path) -> float | None:
    """Débit vidéo moyen (kb/s) de l'encodage CRF, ou None si ffprobe ne sait pas le lire."""
    sonde, _ = _sonder(travail)
    try:
        return _debit_video_kbps(sonde) if sonde is not None else None
    except StopIteration:  # pas de flux vidéo : le contrôle de sortie le refusera
        return None


def _reencoder_en_debit_constant(travail: Path, plan: PlanMontage, sonie: dict | None) -> _Reencodage:
    """Seconde passe depuis les sources (pas de perte de génération) ; remplace `sortie/video.mp4`."""
    dossier = travail / "sortie-debit-constant"
    dossier.mkdir()
    etape = Etape(type="cpu", programme=FFMPEG,
                  arguments=tuple(construire_arguments_ffmpeg(plan, sonie, debit_constant=True)),
                  dossier_entree=str(travail / "entree"), dossier_sortie=str(dossier), hors_ligne=True)
    resultat = executer(etape, DELAI_MONTAGE_S, memoire_octets=MEMOIRE_MONTAGE_OCTETS,
                        fsize_octets=FSIZE_VIDEO_OCTETS, cpu_s=CPU_MONTAGE_S)
    if resultat.delai_depasse:
        return _Reencodage("délai de montage dépassé (seconde passe)", resultat.duree_s)
    nouvelle = dossier / NOM_VIDEO
    if resultat.code != 0 or not _fichier_regulier(nouvelle):
        return _Reencodage(f"ffmpeg en échec en débit constant (code {resultat.code})", resultat.duree_s)
    os.replace(nouvelle, travail / "sortie" / NOM_VIDEO)
    shutil.rmtree(dossier, ignore_errors=True)
    return _Reencodage("", resultat.duree_s)


def _premiere_passe_sonie(travail: Path, plan: PlanMontage) -> dict | None:
    """Mesure de la sonie du mélange (loudnorm, audio seul) dans une cage ; None si elle échoue (une passe)."""
    dossier = travail / "ctrl-sonie"
    dossier.mkdir(exist_ok=True)
    etape = Etape(type="cpu", programme=FFMPEG, arguments=tuple(construire_arguments_sonie(plan)),
                  dossier_entree=str(travail / "entree"), dossier_sortie=str(dossier), hors_ligne=True)
    resultat = executer(etape, DELAI_MESURES_S, memoire_octets=MEMOIRE_MONTAGE_OCTETS, cpu_s=CPU_MONTAGE_S)
    if resultat.delai_depasse or resultat.code != 0:
        return None
    return analyser_sonie(resultat.erreur.decode("utf-8", "replace"))


def monter(dossier_travail, plan: PlanMontage) -> ResultatMontage:
    """Monte la vidéo du `plan` à partir de `dossier_travail/entree` ; aucun shell.

    `dossier_travail/entree` doit contenir les fichiers aux noms fixes (voir l'en-tête du module) ;
    `sortie` et `ctrl-sortie` sont créés ici (ils doivent être absents). Un plan invalide lève
    ValueError ; un fichier manquant, un échec de ffmpeg ou une sortie non conforme rend
    ok=False avec un motif. En cas de succès : `dossier_travail/sortie/video.mp4`.
    """
    travail = Path(dossier_travail).resolve()
    largeur, hauteur, total = valider_plan(plan)
    entree = travail / "entree"
    if not entree.is_dir() or entree.is_symlink():
        raise ValueError("le dossier entree est absent")
    for nom in _fichiers_requis(plan):
        if not _fichier_regulier(entree / nom):
            return ResultatMontage(False, f"fichier d'entrée manquant ou non régulier : {nom}")
    for scene in plan.scenes:
        if not _signature_visuel_ok(entree / _nom_visuel(scene), scene.type_visuel):
            return ResultatMontage(False, f"visuel non conforme à son type : {_nom_visuel(scene)}")
    sortie = travail / "sortie"
    sortie.mkdir(exist_ok=False)

    sonie = _premiere_passe_sonie(travail, plan)
    etape = Etape(type="cpu", programme=FFMPEG, arguments=tuple(construire_arguments_ffmpeg(plan, sonie)),
                  dossier_entree=str(entree), dossier_sortie=str(sortie), hors_ligne=True)
    resultat = executer(etape, DELAI_MONTAGE_S, memoire_octets=MEMOIRE_MONTAGE_OCTETS,
                        fsize_octets=FSIZE_VIDEO_OCTETS, cpu_s=CPU_MONTAGE_S)
    if resultat.delai_depasse:
        return ResultatMontage(False, "délai de montage dépassé", duree_montage_s=resultat.duree_s)
    if resultat.code != 0:
        reste = resultat.erreur.decode("utf-8", "replace").strip().splitlines()[-1:] or [""]
        return ResultatMontage(False, f"ffmpeg en échec (code {resultat.code}) : {reste[0][:200]}",
                               duree_montage_s=resultat.duree_s)
    video = sortie / NOM_VIDEO
    if not _fichier_regulier(video):
        return ResultatMontage(False, "vidéo absente", duree_montage_s=resultat.duree_s)
    debit_crf, bourrage = _debit_apres_crf(travail), False
    duree_montage = resultat.duree_s
    if debit_crf is not None and debit_crf < DEBIT_BOURRAGE_SEUIL_KBPS:
        bourrage, seconde = True, _reencoder_en_debit_constant(travail, plan, sonie)
        duree_montage += seconde.duree_s
        if seconde.motif:
            shutil.rmtree(sortie, ignore_errors=True)
            return ResultatMontage(False, seconde.motif, duree_montage_s=duree_montage)
    ok, motif, duree, controle = controler_sortie(travail, plan, largeur, hauteur, total + 1.0)
    if controle:
        controle.update(bourrage=bourrage, debit_crf_kbps=round(debit_crf) if debit_crf is not None else None)
    if ok:
        controle["alertes"] += sous_titres.alertes_debit(
            (entree / "sous-titres.ass").read_text(encoding="utf-8", errors="replace"))
        planche, motif = faire_planche(travail, plan)
        ok = planche is not None
    if not ok:
        shutil.rmtree(sortie, ignore_errors=True)  # dossier créé ici : refus de la sortie
        return ResultatMontage(False, motif, duree_montage_s=duree_montage, motif_clair=bool(controle))
    fichier_controle = sortie / NOM_CONTROLE
    fichier_controle.write_text(json.dumps(controle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ResultatMontage(True, "", video, duree, duree_montage, planche, fichier_controle)
