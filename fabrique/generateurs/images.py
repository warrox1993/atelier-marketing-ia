"""Images publicitaires fixes (lot I1) : une page HTML/CSS sans script, rendue en PNG par chrome-headless-shell.

Deux rôles dans un seul fichier, comme visuels.py :

- côté hôte : `valider_champs`, `valider_format`, `remplir_gabarit` (fonction PURE : du texte échappé dans un
  gabarit), `construire_scene` (écrit le dossier de la scène) et `rendre_image` (cage, sans shell, puis contrôle
  du PNG reçu) ;
- dans la cage (python3 -I, tout le paquet `fabrique` monté en lecture seule sous /code) : `main(entree, sortie,
  format)` recopie la scène dans /tmp et lance `chrome-headless-shell --screenshot`.

Le texte de l'agent n'est JAMAIS du HTML : `html.escape` sur chaque champ. Couleurs, police et logo viennent d'une
charte du registre humain (fabrique/registre_charte.py), jamais de la demande. La page n'a aucun script (CSP
`script-src 'none'`) : le débordement du texte est donc évité par construction. Les tailles de police sont fixées par
format et par palier de longueur (calculé ici, à l'hôte), et un test rend chaque gabarit au plafond de caractères, dans
chaque police autorisée.
"""

from __future__ import annotations

import hashlib
import html
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

# Lancé par `python3 -I .../images.py` dans la cage : le dossier du paquet n'est pas dans sys.path.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    __package__ = "fabrique.generateurs"

from fabrique.generateurs.visuels import (CHROME, MEMOIRE_CAGE_OCTETS, POLICES, PROCESSUS_MAX_CAGE,  # noqa: E402
                                          TAILLE_MAX_JOURNAL, VERSION_CHROME, _texte)
from fabrique.registre_charte import CONTRASTE_TEXTE_MIN, POLICES_AUTORISEES, Charte, contraste, lire_ihdr  # noqa: E402

# --------------------------------------------------------------------------------------------
# Constantes.

# Politique de contenu : aucun script, rien qui sorte de la scène (fichiers du même dossier seulement).
CSP_IMAGE = "default-src 'none'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'"

FICHIER_IMAGE = "image.png"
FICHIER_JOURNAL = "rendu.log"
DELAI_IMAGE_S = 120  # temps mur laissé à Chrome dans la cage
CPU_CAGE_S = 4 * DELAI_IMAGE_S
FSIZE_IMAGE_OCTETS = 16 * 1024**2  # la cage coupe au-delà ; le contrôle de sortie refuse au-delà de 8 Mo
TAILLE_MAX_IMAGE = 8 * 1024**2

# Formats : identifiant -> (largeur, hauteur). 1200x628 est la valeur de l'aide de LinkedIn ; 1200x627 est refusé.
FORMATS_IMAGE: dict[str, tuple[int, int]] = {
    "1080x1080": (1080, 1080),
    "1080x1350": (1080, 1350),
    "1440x1800": (1440, 1800),
    "1080x1920": (1080, 1920),
    "1200x628": (1200, 628),
}

# Liste fixe des gabarits : identifiant -> (champs obligatoires, champs facultatifs).
GABARITS_IMAGE: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "accroche": (("titre",), ("sous_titre", "appel_action", "mentions_legales")),
    "chiffre_cle": (("chiffre", "titre"), ("sous_titre", "mentions_legales")),
    "liste_3_points": (("titre", "points"), ("appel_action", "mentions_legales")),
    "offre": (("titre", "appel_action"), ("chiffre", "sous_titre", "mentions_legales")),
}
NOMBRE_POINTS = 3
LIMITES = {"titre": 90, "sous_titre": 160, "point": 80, "chiffre": 20, "appel_action": 30, "mentions_legales": 200}
# Largeur relative des caractères, le « W » valant 1 : pour chacun, la plus grande mesurée dans les polices autorisées,
# dans les graisses et chasses de base.css (test_la_table_des_largeurs_majore_les_polices), arrondie au vingtième
# supérieur. Un caractère absent de la table compte plus que le plus large. Un espace compte 0,7 : il couvre la place
# perdue en fin de ligne quand un mot passe à la ligne.
_CLASSES_LARGEUR = (
    (0.3, "'"), (0.35, ",.ijl|¦ìíîï’‘"), (0.4, "-:;If\xad·ÌÍÎÏ"), (0.45, "!()/[\\]t¡²³¹"), (0.5, "r"),
    (0.55, '"*`¨ª¯°´¸º'), (0.6, "_z“”–"), (0.65, "$?svy{}«»¿ýÿ"),
    (0.7, "0123456789FJLabcdeghknopqux¢£¥§µßàáâãäåçèéêëðñòóôõöøùúûüþ€ \u00a0\u202f"),
    (0.75, "EPSTZ¤¶ÈÉÊËÞ"), (0.8, "ABCDRVXYÀÁÂÃÄÅÇÐÝŸ"), (0.85, "#+<=>HKNU^~¬±Ñ×ÙÚÛÜ÷"), (0.9, "&GOQÒÓÔÕÖØ"),
    (0.95, "w"), (1.0, "MWm¼¾"), (1.05, "%©®½æœ…"), (1.1, "@Æ"), (1.25, "\u2192"), (1.35, "Œ"),
)
LARGEURS: dict[str, float] = {caractere: valeur for valeur, caracteres in _CLASSES_LARGEUR for caractere in caracteres}
LARGEUR_INCONNUE = 1.4

# Paliers de taille (largeur maximale du palier, en « W », nom) : un titre étroit est composé plus grand. Le test au
# plafond rend chaque borne en « W » ; un texte réel, plus étroit, garde donc toujours de la marge.
PALIERS_TITRE = ((16, "g"), (32, "m"), (LIMITES["titre"] * LARGEUR_INCONNUE, "p"))
PALIERS_CHIFFRE = ((4, "g"), (8, "m"), (LIMITES["chiffre"] * LARGEUR_INCONNUE, "p"))
PALIERS_SOUS_TITRE = ((50, "g"), (LIMITES["sous_titre"] * LARGEUR_INCONNUE, "p"))
PALIERS_POINT = ((20, "g"), (LIMITES["point"] * LARGEUR_INCONNUE, "p"))
# Charge de la page, en « W » : le texte secondaire (sous-titre, points, appel, moitié des mentions) plus une fois et
# demie le titre et quatre fois le chiffre. Au-delà de 75 le titre est au plus moyen, au-delà de 160 il est petit, et la page resserre tous ses
# textes (data-charge). Sans cela, un grand titre et tous les autres champs au plafond déborderaient.
POIDS_TITRE_CHARGE = 1.5
POIDS_CHIFFRE_CHARGE = 4
PALIERS_CHARGE = ((75, "g"), (160, "m"), (10**6, "p"))

_DOSSIER_GABARITS = Path(__file__).resolve().parent.parent / "hyperframes" / "gabarits-images"
_MARQUE = re.compile(r"\{\{(\w+)\}\}")
LOGO_HTML = '<img id="logo" src="logo.png" alt="">'
# Fond d'illustration IA (plein cadre) et voile sombre qui garantit le contraste du texte clair posé dessus.
FICHIER_FOND = "fond.png"
FOND_HTML = f'<img id="fond" src="{FICHIER_FOND}" alt=""><i id="voile"></i>'
VOILE_OPACITE = 0.66
COULEUR_TEMOIN = "#ff00ff"  # témoin de débordement des tests : invisible (transparent) en production


# --------------------------------------------------------------------------------------------
# Côté hôte : validation et remplissage (fonctions pures).

def valider_format(format: object) -> tuple[int, int]:
    if not isinstance(format, str) or format not in FORMATS_IMAGE:
        raise ValueError(f"format inconnu : {format!r} (attendus : {sorted(FORMATS_IMAGE)})")
    return FORMATS_IMAGE[format]


def valider_champs(gabarit: str, champs: Mapping[str, object]) -> dict[str, str]:
    """Champs du gabarit, normalisés, sous le nom des marques `{{...}}` du gabarit (non échappés)."""
    if not isinstance(gabarit, str) or gabarit not in GABARITS_IMAGE:
        raise ValueError(f"gabarit inconnu : {gabarit!r}")
    if not isinstance(champs, Mapping):
        raise ValueError("champs : dictionnaire attendu")
    obligatoires, facultatifs = GABARITS_IMAGE[gabarit]
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


def largeur(texte: str) -> float:
    """Largeur d'un texte en « W » (majorée : table LARGEURS)."""
    return sum(LARGEURS.get(caractere, LARGEUR_INCONNUE) for caractere in texte)


def palier(texte: str, paliers: tuple[tuple[float, str], ...]) -> str:
    """Nom du palier de taille d'un texte (g, m ou p) d'après sa largeur."""
    mesure = largeur(texte)
    for limite, nom in paliers:
        if mesure <= limite + 1e-9:
            return nom
    return paliers[-1][1]


def charge_de(valeurs: Mapping[str, str]) -> float:
    """Charge de la page, en « W » : sous-titre, points et appel, la moitié des mentions (composées plus petit) et le
    titre compté une fois et demie, le chiffre quatre fois (composés plus grand)."""
    secondaires = ("sous_titre", "appel_action", *(f"point_{rang}" for rang in range(1, NOMBRE_POINTS + 1)))
    return (sum(largeur(valeurs.get(nom, "")) for nom in secondaires) + largeur(valeurs.get("mentions_legales", "")) / 2
            + POIDS_TITRE_CHARGE * largeur(valeurs.get("titre", "")) + POIDS_CHIFFRE_CHARGE * largeur(valeurs.get("chiffre", "")))


def paliers_de(valeurs: Mapping[str, str]) -> dict[str, str]:
    """Paliers de taille des textes d'une demande validée : les marques `palier_*` des gabarits."""
    plus_long_point = max((valeurs[f"point_{rang}"] for rang in range(1, NOMBRE_POINTS + 1) if f"point_{rang}" in valeurs),
                          key=len, default="")
    palier_charge = next(nom for limite, nom in PALIERS_CHARGE if charge_de(valeurs) <= limite + 1e-9)
    return {"palier_titre": max(palier(valeurs["titre"], PALIERS_TITRE), palier_charge, key="gmp".index),
            "palier_chiffre": palier(valeurs.get("chiffre", ""), PALIERS_CHIFFRE),
            "palier_sous": palier(valeurs.get("sous_titre", ""), PALIERS_SOUS_TITRE),
            "palier_points": palier(plus_long_point, PALIERS_POINT),
            "palier_charge": palier_charge}


def pire_fond() -> str:
    """Le fond le plus clair que le voile laisse passer : une illustration entièrement blanche sous le voile."""
    niveau = round(255 * (1 - VOILE_OPACITE))
    return f"#{niveau:02x}{niveau:02x}{niveau:02x}"


def accent_sur_fond(accent: str) -> str:
    """L'accent de la charte s'il reste lisible (4,5:1) sur le pire fond, sinon le blanc (le texte y est blanc)."""
    return accent if contraste(accent, pire_fond()) >= CONTRASTE_TEXTE_MIN else "#ffffff"


def remplir_gabarit(modele: str, valeurs: Mapping[str, str], format: str, paliers: Mapping[str, str],
                    csp: str | None = None, *, logo: bool = False, police: str = "dejavu-sans",
                    fond: bool = False) -> str:
    """Fonction PURE : remplit les marques `{{nom}}` d'un gabarit HTML.

    Chaque valeur de `valeurs` est du TEXTE : `html.escape` (guillemets compris) en fait du texte HTML
    inoffensif ; aucune balise n'est jamais acceptée. Les marques sont remplacées en une seule passe :
    un champ qui contient `{{titre}}` reste du texte. Une marque sans valeur est une erreur.
    """
    largeur, hauteur = valider_format(format)
    if police not in POLICES_AUTORISEES:
        raise ValueError(f"police inconnue : {police!r}")
    internes = {"format": format, "police": police, "largeur": str(largeur), "hauteur": str(hauteur), "csp": CSP_IMAGE if csp is None else csp,
                "logo": LOGO_HTML if logo else "",
                "fond": FOND_HTML if fond else ""}
    for nom, taille in paliers.items():
        if taille not in ("g", "m", "p"):
            raise ValueError(f"{nom} : g, m ou p attendu")
        internes[nom] = taille
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


def fichiers_police(police: str) -> list[str]:
    """Fichiers à recopier dans la scène : ceux de la police de la charte, puis DejaVu Sans (repli)."""
    return list(dict.fromkeys([chemin for *_, chemin in POLICES_AUTORISEES[police]] + list(POLICES)))


def feuille_charte(charte: Charte, *, temoin: bool = False, fond: bool = False) -> str:
    """charte.css : polices figées et couleurs validées par motif (#rrggbb), les seules valeurs qui viennent de la charte.

    Avec un fond d'illustration : le voile et l'accent lisible sur le pire fond (base.css passe le texte au blanc)."""
    faces = list(POLICES_AUTORISEES[charte.police]) + [("Repli", "400", "100%", POLICES[0]), ("Repli", "700", "100%", POLICES[1])]
    return ("".join(f'@font-face {{ font-family: "{famille}"; font-weight: {graisses}; font-stretch: {chasses}; '
                    f'src: url("polices/{Path(chemin).name}"); }}\n' for famille, graisses, chasses, chemin in faces)
            + f":root {{ --fond: {charte.fond}; --texte: {charte.texte}; --accent: {charte.accent}; "
            f"--texte-accent: {charte.texte_accent}; --temoin: {COULEUR_TEMOIN if temoin else 'transparent'}; }}\n"
            + (f":root {{ --voile: rgba(0, 0, 0, {VOILE_OPACITE}); --accent-fond: {accent_sur_fond(charte.accent)}; }}\n" if fond else ""))


def construire_scene(dossier_scene: str | Path, gabarit: str, champs: Mapping[str, object], format: str,
                     charte: Charte, *, temoin: bool = False, fond: Path | None = None) -> Path:
    """Écrit la scène (index.html, feuilles de style, polices, logo) dans `dossier_scene`, qui doit être absent.

    `gabarit` est cherché dans la liste fixe, jamais utilisé comme chemin. `temoin` rend visible, en magenta, le
    repère de fin de contenu : s'il n'apparaît pas, le texte déborde (contrôle des tests, jamais en production).
    `fond` est le PNG d'une illustration (déjà contrôlé par l'appelant) : copié dans la scène, il remplit tout le cadre.
    """
    valeurs = valider_champs(gabarit, champs)  # lève d'abord pour gabarit/champs invalides
    valider_format(format)
    source = _DOSSIER_GABARITS / gabarit
    page = remplir_gabarit((source / "index.html").read_text(encoding="utf-8"), valeurs, format, paliers_de(valeurs),
                           logo=charte.logo is not None, police=charte.police,
                           fond=fond is not None)
    cible = Path(dossier_scene)
    cible.mkdir(parents=True, exist_ok=False)
    (cible / "index.html").write_text(page, encoding="utf-8")
    shutil.copyfile(_DOSSIER_GABARITS / "_commun" / "base.css", cible / "base.css")
    shutil.copyfile(source / "scene.css", cible / "scene.css")
    (cible / "charte.css").write_text(feuille_charte(charte, temoin=temoin, fond=fond is not None), encoding="utf-8")
    (cible / "polices").mkdir()
    for police in fichiers_police(charte.police):
        shutil.copyfile(police, cible / "polices" / Path(police).name)
    if charte.logo is not None:
        (cible / "logo.png").write_bytes(charte.logo)
    if fond is not None:
        shutil.copyfile(fond, cible / FICHIER_FOND)
    return cible


# --------------------------------------------------------------------------------------------
# Côté cage : rendu par chrome-headless-shell.

def commande_chrome(largeur: int, hauteur: int, sortie: str, page: str) -> list[str]:
    """Ligne de commande de Chrome (mesurée : --no-sandbox est nécessaire sous bwrap, la cage est le bac à sable)."""
    return [CHROME, "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
            "--enable-logging=stderr", f"--window-size={largeur},{hauteur}", f"--screenshot={sortie}", page]


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage : images.py <dossier_entree> <dossier_sortie> <format>", file=sys.stderr)
        return 2
    entree, sortie, format = Path(argv[0]), Path(argv[1]), argv[2]
    try:
        largeur, hauteur = valider_format(format)
    except ValueError as erreur:
        print(erreur, file=sys.stderr)
        return 2
    scene = entree / "scene"
    if not (scene / "index.html").is_file():
        print("scene/index.html absent", file=sys.stderr)
        return 2
    projet = Path("/tmp/projet")
    shutil.copytree(scene, projet, symlinks=False)  # /entree est en lecture seule
    environnement = {"HOME": "/tmp", "TMPDIR": "/tmp", "PATH": "/usr/bin", "LANG": "C.UTF-8"}
    commande = commande_chrome(largeur, hauteur, str(sortie / FICHIER_IMAGE), (projet / "index.html").as_uri())
    try:
        fini = subprocess.run(commande, stdin=subprocess.DEVNULL, capture_output=True, shell=False, env=environnement,
                              cwd="/tmp", timeout=DELAI_IMAGE_S - 10, check=False)
    except subprocess.TimeoutExpired:
        print("Chrome : délai dépassé", file=sys.stderr)
        return 3
    journal = (fini.stdout + b"\n" + fini.stderr)[-TAILLE_MAX_JOURNAL:]
    (sortie / FICHIER_JOURNAL).write_bytes(journal)
    if fini.returncode != 0 or not (sortie / FICHIER_IMAGE).is_file():
        fin = journal.decode("utf-8", "replace").strip().splitlines()[-3:]
        print(f"Chrome a échoué (code {fini.returncode}) : {' | '.join(fin)}", file=sys.stderr)
        return 4
    return 0


# --------------------------------------------------------------------------------------------
# Côté hôte : exécution dans la cage et contrôle du PNG reçu.

@dataclass(frozen=True)
class Resultat:
    ok: bool
    motif: str = ""
    image: Path | None = None
    journal: str = ""
    duree_s: float = 0.0
    largeur: int = 0
    hauteur: int = 0
    octets: int = 0
    sha256: str = ""


def controler_png(chemin: Path, largeur: int, hauteur: int) -> tuple[int, str]:
    """(taille, sha256) d'un PNG de la cage, ou ValueError : signature, dimensions exactes, 8 bits sans alpha, 8 Mo."""
    donnees = chemin.read_bytes()
    if len(donnees) > TAILLE_MAX_IMAGE:
        raise ValueError(f"image de {len(donnees)} octets, {TAILLE_MAX_IMAGE} au plus")
    lu_l, lu_h, profondeur, type_couleur = lire_ihdr(donnees)
    if (lu_l, lu_h) != (largeur, hauteur):
        raise ValueError(f"dimensions {lu_l}x{lu_h} au lieu de {largeur}x{hauteur}")
    if profondeur != 8 or type_couleur not in (0, 2):
        raise ValueError("PNG attendu en 8 bits, sans transparence")
    return len(donnees), hashlib.sha256(donnees).hexdigest()


def rendre_image(dossier_travail, gabarit: str, champs: Mapping[str, object], format: str, charte: Charte, *,
                 temoin: bool = False, fond: Path | None = None) -> Resultat:
    """Rend un PNG (`image-XXXX/image.png`) d'un gabarit rempli, dans une cage sans réseau.

    Aucun shell. Une entrée invalide lève ValueError ; un échec de rendu ou un PNG refusé rend ok=False avec le motif.
    """
    from fabrique.cage import Etape, executer, recuperer_sortie

    largeur, hauteur = valider_format(format)
    travail = Path(dossier_travail).resolve()
    dossier = Path(tempfile.mkdtemp(prefix="image-", dir=travail))
    entree, sortie = dossier / "entree", dossier / "sortie"
    sortie.mkdir()
    entree.mkdir()
    construire_scene(entree / "scene", gabarit, champs, format, charte, temoin=temoin, fond=fond)

    etape = Etape(
        type="cpu", programme="/usr/bin/python3",
        arguments=("-I", "/code/fabrique/generateurs/images.py", "/entree", "/sortie", format),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(Path(__file__).resolve().parent.parent), "/code/fabrique"),))
    execution = executer(etape, DELAI_IMAGE_S, memoire_octets=MEMOIRE_CAGE_OCTETS, fsize_octets=FSIZE_IMAGE_OCTETS,
                         cpu_s=CPU_CAGE_S, processus_max=PROCESSUS_MAX_CAGE)
    trouves = {p.name: p for p in recuperer_sortie(sortie, [FICHIER_IMAGE, FICHIER_JOURNAL])}
    journal = trouves[FICHIER_JOURNAL].read_text(encoding="utf-8", errors="replace") if FICHIER_JOURNAL in trouves else ""
    if execution.delai_depasse:
        return Resultat(False, "délai dépassé", journal=journal, duree_s=execution.duree_s)
    if execution.code != 0 or FICHIER_IMAGE not in trouves:
        detail = execution.erreur.decode("utf-8", "replace").strip().splitlines()
        return Resultat(False, detail[-1] if detail else f"échec (code {execution.code})",
                        journal=journal, duree_s=execution.duree_s)
    try:
        octets, sha256 = controler_png(trouves[FICHIER_IMAGE], largeur, hauteur)
    except ValueError as erreur:
        return Resultat(False, f"PNG refusé : {erreur}", journal=journal, duree_s=execution.duree_s)
    final = dossier / FICHIER_IMAGE
    shutil.copyfile(trouves[FICHIER_IMAGE], final)
    return Resultat(True, "", final, journal, execution.duree_s, largeur, hauteur, octets, sha256)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
