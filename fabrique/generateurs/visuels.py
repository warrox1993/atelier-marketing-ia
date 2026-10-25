"""Visuels animés (lot 10) : HyperFrames dans une cage sans réseau, à partir de gabarits de la fabrique.

Deux rôles dans un seul fichier, comme sous_titres.py :

- côté hôte : `remplir_gabarit` (fonction PURE : du texte échappé dans un gabarit HTML),
  `construire_scene` (écrit le dossier de la scène) et `rendre_scene` (enchaîne la cage, sans shell) ;
- dans la cage (python3 -I, bibliothèque standard seulement) : `main(entree, sortie)` recopie la
  scène dans /tmp, coupe la télémétrie de HyperFrames, lance `hyperframes render` (Node du système,
  chrome-headless-shell figé, FFmpeg) et écrit /sortie/scene.mp4 et /sortie/rendu.log.

Le texte de l'agent n'est JAMAIS du HTML : `html.escape` sur chaque champ, aucune balise acceptée.
Le gabarit est un identifiant d'une liste fixe, jamais un chemin. La page porte la politique CSP de
docs/conception-execution-etroite.md §6.4 ; voir `politique_csp` pour le seul écart (empreintes des
trois scripts que le moteur injecte lui-même dans la page).
"""

from __future__ import annotations

import html
import json
import re
import resource
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

# --------------------------------------------------------------------------------------------
# Constantes communes (côté cage et côté hôte).

RACINE_FABRIQUE = "/opt/atelier-fabrique"
RACINE_HYPERFRAMES = f"{RACINE_FABRIQUE}/hyperframes"
VERSION_HYPERFRAMES = "0.8.192"
VERSION_CHROME = "152.0.7977.30"  # celle que HyperFrames 0.8.192 exige (CHROME_VERSION de son code)
CHROME = (f"{RACINE_FABRIQUE}/chrome/{VERSION_CHROME}/chrome-headless-shell-linux64/chrome-headless-shell")
CLI_HYPERFRAMES = f"{RACINE_HYPERFRAMES}/node_modules/hyperframes/bin/hyperframes.mjs"
GSAP_LOCAL = f"{RACINE_HYPERFRAMES}/node_modules/gsap/dist/gsap.min.js"
POLICES = (f"{RACINE_FABRIQUE}/polices/DejaVuSans.ttf", f"{RACINE_FABRIQUE}/polices/DejaVuSans-Bold.ttf")

IMAGES_PAR_SECONDE = 30
FICHIER_SCENE = "scene"  # dossier de la scène dans /entree
FICHIER_VIDEO = "scene.mp4"
FICHIER_JOURNAL = "rendu.log"
DELAI_MOTEUR_S = 900  # temps mur laissé à `hyperframes render` dans la cage
TAILLE_MAX_JOURNAL = 256 * 1024
MEMOIRE_CAGE_OCTETS = 128 * 1024**3  # MESURÉ : Chrome échoue sous 64 Gio d'espace d'adressage (tas Oilpan, cage V8), passe à 128 ; ce n'est pas une limite de mémoire réelle
CPU_CAGE_S = 4 * 900  # temps processeur cumulé de Node, Chrome et FFmpeg
FILS_RENDU = 1
PROCESSUS_MAX_CAGE = 512  # MESURÉ : le rendu passe dès 160 fils et échoue à 128 (Chrome logiciel, Node, FFmpeg) ; marge x3

# Politique de contenu exacte du §6.4. `script-src 'self'` y reçoit les empreintes des scripts du moteur.
CSP_EXACTE = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
              "media-src 'self'; font-src 'self'")

DUREE_MIN_S = 1.0
DUREE_MAX_S = 60.0

# Formats : identifiant -> (largeur, hauteur).
FORMATS: dict[str, tuple[int, int]] = {
    "1080x1920": (1080, 1920),
    "1920x1080": (1920, 1080),
    "1080x1080": (1080, 1080),
}

# Liste fixe des gabarits : identifiant -> (champs obligatoires, champs facultatifs).
GABARITS: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "titre_plein_ecran": (("titre",), ("sous_titre",)),
    "chiffre_cle": (("chiffre", "titre"), ("sous_titre",)),
    "liste_3_points": (("titre", "points"), ()),
}
NOMBRE_POINTS = 3
LIMITES = {"titre": 120, "sous_titre": 200, "point": 120, "chiffre": 20}

_DOSSIER_HYPERFRAMES = Path(__file__).resolve().parent.parent / "hyperframes"
_MARQUE = re.compile(r"\{\{(\w+)\}\}")
_EMPREINTE = re.compile(r"sha256-[A-Za-z0-9+/]{43}=")


# --------------------------------------------------------------------------------------------
# Côté hôte : validation et remplissage (fonctions pures).

def politique_csp(empreintes: tuple[str, ...]) -> str:
    """CSP du §6.4, `script-src 'self'` complété par les empreintes (sha256) des scripts du moteur.

    ÉCART MESURÉ au lot 10 : HyperFrames 0.8.192 injecte lui-même trois scripts en ligne dans la page
    (exécution du rendu image par image). Sous `script-src 'self'` seul, ils sont bloqués et le rendu
    n'aboutit pas (« window.__hf not ready »). Les empreintes ci-dessous n'autorisent que ces trois
    scripts exacts, rien d'autre : un script glissé dans la page reste refusé. Aucun `unsafe-inline`.
    Elles sont figées dans fabrique/hyperframes/csp-hashes.json (version du moteur, 30 i/s).
    """
    for empreinte in empreintes:
        if not _EMPREINTE.fullmatch(empreinte):
            raise ValueError(f"empreinte invalide : {empreinte!r}")
    sources = " ".join(f"'{e}'" for e in empreintes)
    return CSP_EXACTE.replace("script-src 'self';", f"script-src 'self' {sources};".replace("  ", " "))


def lire_empreintes() -> tuple[str, ...]:
    donnees = json.loads((_DOSSIER_HYPERFRAMES / "csp-hashes.json").read_text(encoding="utf-8"))
    if donnees.get("hyperframes") != VERSION_HYPERFRAMES or donnees.get("fps") != IMAGES_PAR_SECONDE:
        raise ValueError("csp-hashes.json ne correspond pas à la version de HyperFrames ou à la cadence")
    return tuple(donnees["empreintes"])


def _texte(valeur: object, nom: str, limite: int, *, vide_permis: bool) -> str:
    """Texte brut normalisé : contrôles et séparateurs de ligne en espaces, espaces compactés."""
    if not isinstance(valeur, str):
        raise ValueError(f"{nom} : texte attendu")
    if "\0" in valeur:
        raise ValueError(f"{nom} : octet nul interdit")
    propre = "".join(" " if unicodedata.category(c) in ("Cc", "Zl", "Zp") else c for c in valeur)
    propre = " ".join(propre.split())
    if not propre and not vide_permis:
        raise ValueError(f"{nom} : vide")
    if len(propre) > limite:
        raise ValueError(f"{nom} : {len(propre)} caractères, {limite} au plus")
    return propre


def valider_champs(gabarit: str, champs: Mapping[str, object]) -> dict[str, str]:
    """Champs du gabarit, normalisés, sous le nom des marques `{{...}}` du gabarit (non échappés)."""
    if gabarit not in GABARITS:
        raise ValueError(f"gabarit inconnu : {gabarit!r}")
    if not isinstance(champs, Mapping):
        raise ValueError("champs : dictionnaire attendu")
    obligatoires, facultatifs = GABARITS[gabarit]
    inconnus = set(champs) - set(obligatoires) - set(facultatifs)
    if inconnus:
        raise ValueError(f"champs inconnus pour {gabarit} : {sorted(map(str, inconnus))}")
    manquants = [c for c in obligatoires if c not in champs]
    if manquants:
        raise ValueError(f"champs manquants pour {gabarit} : {manquants}")
    valeurs: dict[str, str] = {}
    for nom in obligatoires + facultatifs:
        if nom == "points":
            points = champs["points"]
            if not isinstance(points, (list, tuple)) or len(points) != NOMBRE_POINTS:
                raise ValueError(f"points : exactement {NOMBRE_POINTS} textes attendus")
            for rang, point in enumerate(points, 1):
                valeurs[f"point_{rang}"] = _texte(point, f"point {rang}", LIMITES["point"], vide_permis=False)
        else:
            valeurs[nom] = _texte(champs.get(nom, ""), nom, LIMITES[nom], vide_permis=nom not in obligatoires)
    return valeurs


def valider_format_duree(format: str, duree_s: float) -> tuple[int, int, str]:
    if format not in FORMATS:
        raise ValueError(f"format inconnu : {format!r} (attendus : {sorted(FORMATS)})")
    if isinstance(duree_s, bool) or not isinstance(duree_s, (int, float)):
        raise ValueError("durée : nombre de secondes attendu")
    if not DUREE_MIN_S <= duree_s <= DUREE_MAX_S:
        raise ValueError(f"durée : entre {DUREE_MIN_S:g} et {DUREE_MAX_S:g} secondes")
    largeur, hauteur = FORMATS[format]
    return largeur, hauteur, f"{duree_s:g}"


def remplir_gabarit(modele: str, valeurs: Mapping[str, str], format: str, duree_s: float,
                    csp: str | None = None) -> str:
    """Fonction PURE : remplit les marques `{{nom}}` d'un gabarit HTML.

    Chaque valeur de `valeurs` est du TEXTE : `html.escape` (guillemets compris) en fait du texte HTML
    inoffensif ; aucune balise n'est jamais acceptée. Les marques sont remplacées en une seule passe :
    un champ qui contient `{{titre}}` reste du texte. Une marque sans valeur est une erreur.
    """
    largeur, hauteur, duree = valider_format_duree(format, duree_s)
    internes = {"format": format, "largeur": str(largeur), "hauteur": str(hauteur), "duree": duree,
                "csp": politique_csp(lire_empreintes()) if csp is None else csp}
    if "\"" in internes["csp"] or "<" in internes["csp"] or ">" in internes["csp"]:
        raise ValueError("csp : caractère interdit dans un attribut HTML")

    def remplacer(trouve: re.Match[str]) -> str:
        nom = trouve.group(1)
        if nom in internes:
            return internes[nom]
        if nom in valeurs:
            return html.escape(valeurs[nom], quote=True)
        raise ValueError(f"marque sans valeur : {{{{{nom}}}}}")

    return _MARQUE.sub(remplacer, modele)


def construire_scene(dossier_scene: str | Path, gabarit: str, champs: Mapping[str, object],
                     format: str, duree_s: float) -> Path:
    """Écrit la scène (index.html, feuilles de style, script, GSAP, polices) dans `dossier_scene`.

    Le dossier doit être absent. `gabarit` est cherché dans la liste fixe, jamais utilisé comme chemin.
    """
    valeurs = valider_champs(gabarit, champs)  # lève d'abord pour gabarit/champs invalides
    source = _DOSSIER_HYPERFRAMES / "gabarits" / gabarit
    page = remplir_gabarit((source / "index.html").read_text(encoding="utf-8"), valeurs, format, duree_s)
    cible = Path(dossier_scene)
    cible.mkdir(parents=True, exist_ok=False)
    (cible / "index.html").write_text(page, encoding="utf-8")
    shutil.copyfile(_DOSSIER_HYPERFRAMES / "gabarits" / "_commun" / "base.css", cible / "base.css")
    shutil.copyfile(source / "scene.css", cible / "scene.css")
    shutil.copyfile(source / "scene.js", cible / "scene.js")
    shutil.copyfile(GSAP_LOCAL, cible / "gsap.min.js")
    (cible / "polices").mkdir()
    for police in POLICES:
        shutil.copyfile(police, cible / "polices" / Path(police).name)
    return cible


# --------------------------------------------------------------------------------------------
# Côté cage : rendu par HyperFrames.

def environnement_moteur() -> dict[str, str]:
    """Environnement du moteur : aucun réseau utile, aucune télémétrie, aucune mise à jour."""
    return {
        "HOME": "/tmp", "TMPDIR": "/tmp", "PATH": "/usr/bin", "LANG": "C.UTF-8",
        "HYPERFRAMES_BROWSER_PATH": CHROME,
        "HYPERFRAMES_NO_TELEMETRY": "1", "DO_NOT_TRACK": "1",
        "HYPERFRAMES_NO_UPDATE_CHECK": "1", "HYPERFRAMES_NO_AUTO_INSTALL": "1",
        "HYPERFRAMES_NO_OPTIONAL_INSTALL": "1",
        "PRODUCER_PLAYER_READY_TIMEOUT_MS": "20000",
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage : visuels.py <dossier_entree> <dossier_sortie>", file=sys.stderr)
        return 2
    entree, sortie = Path(argv[0]), Path(argv[1])
    scene = entree / FICHIER_SCENE
    if not (scene / "index.html").is_file():
        print("scene/index.html absent", file=sys.stderr)
        return 2
    projet = Path("/tmp/projet")
    shutil.copytree(scene, projet, symlinks=False)  # /entree est en lecture seule ; le moteur écrit à côté
    environnement = environnement_moteur()
    commun = dict(stdin=subprocess.DEVNULL, capture_output=True, shell=False, env=environnement, cwd="/tmp")
    # Télémétrie coupée aussi dans la configuration du moteur (en plus des variables d'environnement).
    subprocess.run(["/usr/bin/node", CLI_HYPERFRAMES, "telemetry", "disable"], timeout=60, check=False, **commun)
    commande = ["/usr/bin/node", CLI_HYPERFRAMES, "render", str(projet), "-o", str(sortie / FICHIER_VIDEO),
                "--fps", str(IMAGES_PAR_SECONDE), "--quality", "looks", "--workers", str(FILS_RENDU),
                "--no-browser-gpu"]  # logiciel : aucun GPU dans la cage ; mode « screenshot », qui rend les 150 images
    try:
        fini = subprocess.run(commande, timeout=DELAI_MOTEUR_S, check=False, **commun)
    except subprocess.TimeoutExpired:
        print("HyperFrames : délai dépassé", file=sys.stderr)
        return 3
    journal = (fini.stdout + b"\n" + fini.stderr)[-TAILLE_MAX_JOURNAL:]
    (sortie / FICHIER_JOURNAL).write_bytes(journal)
    if fini.returncode != 0 or not (sortie / FICHIER_VIDEO).is_file():
        fin = journal.decode("utf-8", "replace").strip().splitlines()[-3:]
        print(f"HyperFrames a échoué (code {fini.returncode}) : {' | '.join(fin)}", file=sys.stderr)
        return 4
    memoire_ko = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    print(json.dumps({"memoire_max_ko": memoire_ko}))
    return 0


# --------------------------------------------------------------------------------------------
# Côté hôte : exécution dans la cage.

@dataclass(frozen=True)
class Resultat:
    ok: bool
    motif: str = ""
    video: Path | None = None
    journal: str = ""
    duree_s: float = 0.0
    memoire_max_ko: int = 0


def rendre_scene(dossier_travail, gabarit: str, champs: Mapping[str, object], format: str,
                 duree_s: float) -> Resultat:
    """Rend un clip MP4 (30 i/s) d'un gabarit rempli, dans une cage sans réseau.

    Crée `scene-XXXX/{entree,sortie}` dans `dossier_travail` ; la vidéo est `scene-XXXX/scene.mp4`.
    Aucun shell. Une entrée invalide lève ValueError ; un échec de rendu rend ok=False avec le motif.
    """
    from fabrique.cage import DELAI_RENDU_HTML_S, FSIZE_VIDEO_OCTETS, Etape, executer, recuperer_sortie

    valider_format_duree(format, duree_s)
    travail = Path(dossier_travail).resolve()
    dossier = Path(tempfile.mkdtemp(prefix="scene-", dir=travail))
    entree, sortie = dossier / "entree", dossier / "sortie"
    sortie.mkdir()
    entree.mkdir()
    construire_scene(entree / FICHIER_SCENE, gabarit, champs, format, duree_s)

    etape = Etape(
        type="cpu", programme="/usr/bin/python3",
        arguments=("-I", "/code/visuels.py", "/entree", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(Path(__file__).resolve().parent), "/code"),))
    execution = executer(etape, DELAI_RENDU_HTML_S, memoire_octets=MEMOIRE_CAGE_OCTETS,
                         fsize_octets=FSIZE_VIDEO_OCTETS, cpu_s=CPU_CAGE_S, processus_max=PROCESSUS_MAX_CAGE)
    trouves = {p.name: p for p in recuperer_sortie(sortie, [FICHIER_VIDEO, FICHIER_JOURNAL])}
    journal = trouves[FICHIER_JOURNAL].read_text(encoding="utf-8", errors="replace") if FICHIER_JOURNAL in trouves else ""
    if execution.delai_depasse:
        return Resultat(False, "délai dépassé", journal=journal, duree_s=execution.duree_s)
    if execution.code != 0 or FICHIER_VIDEO not in trouves:
        detail = execution.erreur.decode("utf-8", "replace").strip().splitlines()
        return Resultat(False, detail[-1] if detail else f"échec (code {execution.code})",
                        journal=journal, duree_s=execution.duree_s)
    try:
        memoire = int(json.loads(execution.sortie.decode("utf-8").strip().splitlines()[-1]).get("memoire_max_ko", 0))
    except (ValueError, IndexError):
        memoire = 0
    final = dossier / FICHIER_VIDEO
    shutil.copyfile(trouves[FICHIER_VIDEO], final)
    return Resultat(True, "", final, journal, execution.duree_s, memoire)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
