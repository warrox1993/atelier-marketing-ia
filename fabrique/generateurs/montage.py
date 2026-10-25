"""Montage vidéo ffmpeg en cage (lot 9) : docs/conception-execution-etroite.md §6.3.

Deux parties :

1. construction PURE de la liste d'arguments ffmpeg (`construire_arguments_ffmpeg`,
   `construire_arguments_ffprobe`) : aucune option, aucun filtre ni aucun texte ne vient de
   l'agent, seulement des nombres validés (durées, numéros de scène) et des identifiants
   (format de sortie parmi une liste fermée, type de visuel `png` ou `mp4`) ;
2. exécution côté hôte (`monter`) : chaque appel passe par fabrique.cage (bwrap, sans shell,
   sans réseau, sans /home ni bibliothèque musicale).

Entrées à noms fixes dans /entree : `scene-NN.png` ou `scene-NN.mp4`, `voix-NN.wav`,
`sous-titres.ass` (déjà échappé par le module des sous-titres), `musique.flac` (facultatif) et
`mention.ass` (écrit par `monter`, texte fixe). Sortie : /sortie/video.mp4.

Choix de conception
-------------------
- Assemblage par `filter_complex` : filtre `concat` (assemblage de flux dans le graphe), jamais
  le démultiplexeur `concat` ni de liste de fichiers.
- Musique : mise à longueur par boucle, volume de fond fixe (MUSIQUE_VOLUME) PUIS compression à
  chaîne latérale (`sidechaincompress`) pilotée par la voix : la musique baisse d'elle-même dès
  que la voix parle et remonte dans les silences. Le volume fixe seul laisserait la musique
  trop forte dans les silences ou couvrant la voix ; la compression adaptative est dans le
  filtre standard de ffmpeg et ne demande aucun réglage venant de l'agent.
- Mention IA : carton PERMANENT pendant toute la vidéo (bandeau en haut, fond sombre
  semi-opaque, DejaVu Sans gras, corps proportionnel à la plus petite dimension). Choisi plutôt
  qu'un carton de début et de fin parce qu'une vidéo extraite ou coupée garde alors la mention
  et qu'aucune image ne peut être vue sans elle (AI Act art. 50). Texte fixe, écrit par nous.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import stat
from dataclasses import dataclass
from pathlib import Path

from fabrique.cage import DELAI_MONTAGE_S, FSIZE_VIDEO_OCTETS, Etape, executer

FFMPEG = "/usr/bin/ffmpeg"
FFPROBE = "/usr/bin/ffprobe"
ENTREE = "/entree"
SORTIE = "/sortie"
POLICES = "/opt/atelier-fabrique/polices"
NOM_VIDEO = "video.mp4"

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
MENTION_IA = "Contenu généré avec l'IA"
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


def construire_arguments_ffmpeg(plan: PlanMontage) -> list[str]:
    """Liste d'arguments de ffmpeg (sans le programme). Fonction pure, sans shell ni lecture disque."""
    largeur, hauteur, total = valider_plan(plan)
    scenes = plan.scenes
    n = len(scenes)

    arguments = ["-nostdin", "-hide_banner", "-n", "-loglevel", "warning",
                 "-filter_threads", str(FILS_FILTRES),
                 "-filter_complex_threads", str(FILS_FILTRES)]
    for scene in scenes:
        arguments += _entrees_visuelles(scene)
    for scene in scenes:
        arguments += ["-protocol_whitelist", "file", "-f", "wav", "-i", f"{ENTREE}/voix-{scene.numero:02d}.wav"]
    indice_musique = 2 * n
    if plan.avec_musique:
        arguments += ["-protocol_whitelist", "file", "-f", "flac", "-stream_loop", "-1",
                      "-i", f"{ENTREE}/musique.flac"]

    filtres = [_filtre_visuel(i, s, largeur, hauteur) for i, s in enumerate(scenes)]
    filtres += [_filtre_voix(n + i, s) for i, s in enumerate(scenes)]
    entrees_concat = "".join(f"[v{s.numero}][a{s.numero}]" for s in scenes)
    filtres.append(f"{entrees_concat}concat=n={n}:v=1:a=1[vbrut][voix]")

    # Sous-titres puis mention IA : deux incrustations ASS, polices limitées à POLICES.
    incrustation = f"fontsdir={POLICES}"
    filtres.append(
        f"[vbrut]ass=filename={ENTREE}/sous-titres.ass:{incrustation},"
        f"ass=filename={ENTREE}/mention.ass:{incrustation}[vout]"
    )

    if plan.avec_musique:
        duree = _secondes(total)
        filtres += [
            f"[{indice_musique}:a:0]aresample={FREQUENCE_AUDIO},aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"atrim=duration={duree},volume={MUSIQUE_VOLUME},"
            f"afade=t=out:st={_secondes(max(total - 2.0, 0.0))}:d=2,asetpts=PTS-STARTPTS[musique]",
            "[voix]asplit=2[voixmix][voixpilote]",
            "[musique][voixpilote]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=500[musique_baissee]",
            "[voixmix][musique_baissee]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]",
        ]
    else:
        filtres.append("[voix]anull[aout]")

    arguments += ["-filter_complex", ";".join(filtres), "-map", "[vout]", "-map", "[aout]"]
    arguments += [
        "-threads", str(FILS_ENCODAGE), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
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


def ecrire_mention_ass(dossier_entree: Path, largeur: int, hauteur: int, duree_s: float) -> Path:
    """Écrit `mention.ass` : bandeau permanent en haut de l'image, texte fixe MENTION_IA."""
    corps = round(min(largeur, hauteur) / 24)  # 45 px en 1080 : lisible sur un téléphone
    marge = round(hauteur * 0.04)
    fin = _horodatage_ass(duree_s + 1.0)
    contenu = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {largeur}\nPlayResY: {hauteur}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Mention,DejaVu Sans,{corps},&H00FFFFFF,&H00FFFFFF,&H99000000,&H99000000,"
        f"-1,0,0,0,100,100,0,0,3,{max(corps // 5, 4)},0,8,40,40,{marge},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        f"Dialogue: 9,0:00:00.00,{fin},Mention,,0,0,0,,{MENTION_IA}\n"
    )
    chemin = Path(dossier_entree) / "mention.ass"
    chemin.write_text(contenu, encoding="utf-8")
    return chemin


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


def controler_sortie(dossier_travail: Path, plan: PlanMontage, largeur: int, hauteur: int,
                     duree_max_s: float) -> tuple[bool, str, float]:
    """ffprobe dans une cage sur la vidéo produite. Rend (ok, motif, durée)."""
    ctrl_sortie = dossier_travail / "ctrl-sortie"
    ctrl_sortie.mkdir(exist_ok=True)
    etape = Etape(type="cpu", programme=FFPROBE,
                  arguments=tuple(construire_arguments_ffprobe(f"{ENTREE}/{NOM_VIDEO}", "mov")),
                  dossier_entree=str(dossier_travail / "sortie"), dossier_sortie=str(ctrl_sortie),
                  hors_ligne=True)
    resultat = executer(etape, 60)
    if resultat.delai_depasse or resultat.code != 0:
        return False, "contrôle ffprobe de la sortie en échec", 0.0
    try:
        sonde = json.loads(resultat.sortie.decode("utf-8"))
    except ValueError:
        return False, "sortie ffprobe illisible", 0.0
    return _juger_sonde(sonde, largeur, hauteur, duree_max_s)


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
    ecrire_mention_ass(entree, largeur, hauteur, total)
    sortie = travail / "sortie"
    sortie.mkdir(exist_ok=False)

    etape = Etape(type="cpu", programme=FFMPEG, arguments=tuple(construire_arguments_ffmpeg(plan)),
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
    ok, motif, duree = controler_sortie(travail, plan, largeur, hauteur, total + 1.0)
    if not ok:
        shutil.rmtree(sortie, ignore_errors=True)  # dossier créé ici : refus de la sortie
        return ResultatMontage(False, motif, duree_montage_s=resultat.duree_s)
    return ResultatMontage(True, "", video, duree, resultat.duree_s)
