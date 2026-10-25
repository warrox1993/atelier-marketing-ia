"""Sous-titres français horodatés à partir d'un wav (lot 8), par whisper.cpp dans une cage.

Deux rôles dans un seul fichier, comme pdf.py :

- dans la cage (python3 -I, bibliothèque standard seulement) : `main(entree, sortie)` lance
  whisper-cli sur /entree/voix.wav (français, transcription seule, aucune traduction), puis écrit
  /sortie/sous-titres.srt et /sortie/sous-titres.ass. Si /entree/reference.txt existe (texte lu
  par la voix), les segments sont alignés sur ce texte : les mots mal reconnus sont corrigés, les
  horodatages ne changent pas ;
- côté hôte : `sous_titrer(dossier_travail, wav, texte_reference=None)` enchaîne la cage
  (fabrique.cage), sans shell.

Le texte de sortie est neutralisé pour ffmpeg et libass : `{`, `}`, `\\`, `<` et `>` sont remplacés
par des signes de pleine chasse qui leur ressemblent. Aucune balise de surcharge (`{\\an8}`,
`{\\pos()}`), aucun `\\N` et aucune expression `%{...}` ne peut donc être interprété.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import resource
import shutil
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

# Constantes communes (côté cage et côté hôte).
WHISPER = "/opt/atelier-fabrique/bin/whisper-cli"
MODELE_DANS_CAGE = "/modeles/whisper/ggml-large-v3-turbo.bin"
MODELE_NOM = "whisper-large-v3-turbo"
MODELE_REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1"  # voir fabrique/modeles-whisper.json
RACINE_MODELES = "/var/lib/atelier-fabrique/modeles"
FICHIER_WAV = "voix.wav"
FICHIER_REFERENCE = "reference.txt"
FICHIER_SRT = "sous-titres.srt"
FICHIER_ASS = "sous-titres.ass"
FILS_WHISPER = 8
DELAI_WHISPER_S = 540
LONGUEUR_MAX_LIGNE = 60  # caractères par segment demandés à whisper
TAILLE_MAX_WAV = 200 * 1024**2
TAILLE_MAX_REFERENCE = 100 * 1024
MEMOIRE_CAGE_OCTETS = 12 * 1024**3  # l'espace d'adressage de whisper dépasse sa mémoire réelle
CPU_CAGE_S = 8 * 600  # temps processeur cumulé de tous les fils

# Signes de pleine chasse qui remplacent les caractères actifs pour libass et ffmpeg.
NEUTRALISATION = str.maketrans({"{": "｛", "}": "｝", "\\": "＼", "<": "＜", ">": "＞"})
_HORAIRE = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{1,3})")


# --------------------------------------------------------------------------------------------
# Côté cage : lecture et écriture des sous-titres.

@dataclass(frozen=True)
class Segment:
    debut_ms: int
    fin_ms: int
    texte: str


def neutraliser(texte: str) -> str:
    """Texte sûr pour SRT/ASS : caractères actifs remplacés, espaces et contrôles normalisés."""
    propre = "".join(" " if unicodedata.category(c) in ("Cc", "Zl", "Zp") else c for c in texte)
    return " ".join(propre.translate(NEUTRALISATION).split())


def _en_ms(horaire: str) -> int:
    trouve = _HORAIRE.fullmatch(horaire.strip())
    if not trouve:
        raise ValueError(f"horaire SRT invalide : {horaire!r}")
    h, m, s, ms = trouve.groups()
    return ((int(h) * 60 + int(m)) * 60 + int(s)) * 1000 + int(ms.ljust(3, "0"))


def lire_srt(contenu: str) -> list[Segment]:
    """Lit un SRT de whisper. Les segments sans texte sont écartés ; la fin n'est jamais avant le début."""
    segments: list[Segment] = []
    for bloc in re.split(r"\n\s*\n", contenu.replace("\r\n", "\n").strip()):
        lignes = bloc.split("\n")
        for rang, ligne in enumerate(lignes):
            if "-->" in ligne:
                debut, fin = (_en_ms(partie) for partie in ligne.split("-->", 1))
                texte = " ".join(" ".join(lignes[rang + 1:]).split())
                if texte:
                    segments.append(Segment(debut, max(fin, debut + 1), texte))
                break
    return segments


def _horaire_srt(ms: int) -> str:
    s, ms = divmod(ms, 1000)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _horaire_ass(ms: int, vers_le_haut: bool) -> str:
    centiemes = -(-ms // 10) if vers_le_haut else ms // 10
    s, c = divmod(centiemes, 100)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def ecrire_srt(segments: list[Segment]) -> str:
    blocs = [
        f"{rang}\n{_horaire_srt(s.debut_ms)} --> {_horaire_srt(s.fin_ms)}\n{neutraliser(s.texte)}\n"
        for rang, s in enumerate(segments, 1)
    ]
    return "\n".join(blocs)


ENTETE_ASS = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,120,120,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ecrire_ass(segments: list[Segment]) -> str:
    lignes = [
        f"Dialogue: 0,{_horaire_ass(s.debut_ms, False)},{_horaire_ass(s.fin_ms, True)},Default,,0,0,0,,{neutraliser(s.texte)}"
        for s in segments
    ]
    return ENTETE_ASS + "\n".join(lignes) + "\n"


# --------------------------------------------------------------------------------------------
# Côté cage : alignement sur le texte de référence.

def _cle(mot: str) -> str:
    decompose = unicodedata.normalize("NFKD", mot)
    return "".join(c for c in decompose.casefold() if c.isalnum() and not unicodedata.combining(c))


def aligner_sur_reference(textes: list[str], reference: str) -> list[str]:
    """Rend, pour chaque segment, le passage du texte de référence qui lui correspond.

    Les horodatages ne sont pas touchés : seuls les mots changent. Un segment sans correspondance
    dans la référence garde son texte reconnu.
    """
    mots_ref = reference.split()
    indices_ref = [i for i, mot in enumerate(mots_ref) if _cle(mot)]
    cles_ref = [_cle(mots_ref[i]) for i in indices_ref]
    cles_asr: list[str] = []
    debut_segment: list[int] = []
    for texte in textes:
        debut_segment.append(len(cles_asr))
        cles_asr.extend(c for c in (_cle(m) for m in texte.split()) if c)
    if not cles_asr or not cles_ref:
        return list(textes)

    correspondance = [0] * (len(cles_asr) + 1)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, cles_asr, cles_ref, autojunk=False).get_opcodes():
        for i in range(i1, i2):
            if tag == "equal":
                correspondance[i] = j1 + (i - i1)
            elif tag == "replace":
                correspondance[i] = j1 + (i - i1) * (j2 - j1) // (i2 - i1)
            elif tag == "delete":
                correspondance[i] = j1
    correspondance[len(cles_asr)] = len(cles_ref)

    # Bornes contiguës, croissantes, de 0 à la fin de la référence.
    bornes = [0]
    for debut in debut_segment[1:]:
        bornes.append(max(bornes[-1], correspondance[debut]))
    bornes.append(len(cles_ref))

    def position_dans_texte(rang_cle: int) -> int:
        return len(mots_ref) if rang_cle >= len(indices_ref) else indices_ref[rang_cle]

    resultat = []
    for k, texte in enumerate(textes):
        a = 0 if k == 0 else position_dans_texte(bornes[k])
        b = len(mots_ref) if k == len(textes) - 1 else position_dans_texte(bornes[k + 1])
        passage = " ".join(mots_ref[a:b])
        resultat.append(passage if passage else texte)
    return resultat


# --------------------------------------------------------------------------------------------
# Côté cage : exécution.

def transcrire(wav: str, prefixe: str) -> str:
    """Lance whisper-cli (français, sans traduction) et rend le SRT brut."""
    commande = [
        WHISPER, "-m", MODELE_DANS_CAGE, "-f", wav, "-l", "fr", "-t", str(FILS_WHISPER),
        "-ml", str(LONGUEUR_MAX_LIGNE), "-sow", "-osrt", "-of", prefixe, "-np",
    ]
    fini = subprocess.run(commande, stdin=subprocess.DEVNULL, capture_output=True, shell=False,
                          timeout=DELAI_WHISPER_S, check=False)
    if fini.returncode != 0:
        queue = fini.stderr.decode("utf-8", "replace").strip().splitlines()[-5:]
        raise RuntimeError(f"whisper-cli a échoué (code {fini.returncode}) : {' | '.join(queue)}")
    return Path(prefixe + ".srt").read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage : sous_titres.py <dossier_entree> <dossier_sortie>", file=sys.stderr)
        return 2
    entree, sortie = Path(argv[0]), Path(argv[1])
    wav = entree / FICHIER_WAV
    if not wav.is_file():
        print(f"{FICHIER_WAV} absent", file=sys.stderr)
        return 2
    reference = None
    if (entree / FICHIER_REFERENCE).is_file():
        try:
            reference = (entree / FICHIER_REFERENCE).read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print("texte de référence invalide (UTF-8 attendu)", file=sys.stderr)
            return 2
    try:
        segments = lire_srt(transcrire(str(wav), "/tmp/brut"))
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError) as erreur:
        print(f"transcription impossible : {erreur}", file=sys.stderr)
        return 3
    if not segments:
        print("aucune parole reconnue", file=sys.stderr)
        return 4
    aligne = bool(reference and reference.strip())
    if aligne:
        textes = aligner_sur_reference([s.texte for s in segments], reference)
        segments = [Segment(s.debut_ms, s.fin_ms, t) for s, t in zip(segments, textes)]
    (sortie / FICHIER_SRT).write_text(ecrire_srt(segments), encoding="utf-8")
    (sortie / FICHIER_ASS).write_text(ecrire_ass(segments), encoding="utf-8")
    memoire_ko = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    print(json.dumps({"segments": len(segments), "aligne": aligne, "memoire_max_ko": memoire_ko}))
    return 0


# --------------------------------------------------------------------------------------------
# Côté hôte.

@dataclass(frozen=True)
class Resultat:
    ok: bool
    motif: str = ""
    srt: Path | None = None
    ass: Path | None = None
    duree_s: float = 0.0
    segments: int = 0
    memoire_max_ko: int = 0
    aligne: bool = False


def dossier_modele() -> str:
    return f"{RACINE_MODELES}/{MODELE_NOM}@{MODELE_REVISION}"


def sous_titrer(dossier_travail, wav, texte_reference: str | None = None, *, gpu: bool = False) -> Resultat:
    """Transcrit `wav` en sous-titres français dans `dossier_travail/sous-titres/` (SRT et ASS échappé).

    `texte_reference` : texte lu par la voix ; s'il est fourni, les segments sont alignés dessus.
    Crée `st-entree` et `st-sortie` (qui doivent être absents) puis `sous-titres` dans le dossier de
    travail. `gpu=True` si whisper-cli a été compilé avec CUDA. Aucun shell. Un échec rend ok=False
    avec le motif, jamais d'exception pour une entrée audio piégée.
    """
    from fabrique.cage import DELAI_SOUS_TITRES_S, Etape, executer, recuperer_sortie

    travail = Path(dossier_travail).resolve()
    source = Path(wav)
    if source.is_symlink() or not source.is_file():
        raise ValueError("le wav doit être un fichier régulier")
    if source.stat().st_size > TAILLE_MAX_WAV:
        raise ValueError("wav trop volumineux")
    if texte_reference is not None:
        if not isinstance(texte_reference, str) or "\0" in texte_reference:
            raise ValueError("texte de référence invalide")
        if len(texte_reference.encode("utf-8")) > TAILLE_MAX_REFERENCE:
            raise ValueError("texte de référence trop long")
    entree, sortie, final = (travail / nom for nom in ("st-entree", "st-sortie", "sous-titres"))
    for dossier in (entree, sortie, final):
        dossier.mkdir(exist_ok=False)
    shutil.copyfile(source, entree / FICHIER_WAV)
    if texte_reference is not None:
        (entree / FICHIER_REFERENCE).write_text(texte_reference, encoding="utf-8")

    etape = Etape(
        type="gpu" if gpu else "cpu", programme="/usr/bin/python3",
        arguments=("-I", "/code/sous_titres.py", "/entree", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(Path(__file__).resolve().parent), "/code"),
                          (dossier_modele(), "/modeles/whisper")),
        hors_ligne=True)
    execution = executer(etape, DELAI_SOUS_TITRES_S, memoire_octets=MEMOIRE_CAGE_OCTETS, cpu_s=CPU_CAGE_S)
    if execution.delai_depasse:
        return Resultat(False, "délai dépassé", duree_s=execution.duree_s)
    if execution.code != 0:
        detail = execution.erreur.decode("utf-8", "replace").strip().splitlines()
        return Resultat(False, detail[-1] if detail else f"échec (code {execution.code})", duree_s=execution.duree_s)
    trouves = {p.name: p for p in recuperer_sortie(sortie, [FICHIER_SRT, FICHIER_ASS])}
    if set(trouves) != {FICHIER_SRT, FICHIER_ASS}:
        return Resultat(False, "sortie incomplète", duree_s=execution.duree_s)
    try:
        resume = json.loads(execution.sortie.decode("utf-8").strip().splitlines()[-1])
    except (ValueError, IndexError):
        resume = {}
    for nom, chemin in trouves.items():
        shutil.copyfile(chemin, final / nom)
    return Resultat(True, "", final / FICHIER_SRT, final / FICHIER_ASS, execution.duree_s,
                    int(resume.get("segments", 0)), int(resume.get("memoire_max_ko", 0)),
                    bool(resume.get("aligne", False)))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
