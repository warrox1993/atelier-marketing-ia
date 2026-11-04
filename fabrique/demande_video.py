"""Validation de la demande de travail `video` (lot 12) : fonction pure, bibliothèque standard et constantes de la fabrique.

Le plugin écrit la demande, la fabrique la REVALIDE ici : le schéma est fermé, tout champ inconnu est
refusé (donc ni `entreprise`, ni échantillon audio, ni chemin, ni option ffmpeg). L'entreprise du
travail vient du service, jamais de la demande.

    { "format_sortie": "1080x1920" | "1920x1080" | "1080x1080",
      "musique": "<id de la bibliothèque>",            # facultatif
      "sous_titres": true | false,
      "scenes": [ { "texte_voix": "1 à 1500 caractères",
                    "voix": "<id du registre des voix>",
                    "visuel": { "gabarit": "titre_plein_ecran" | "chiffre_cle" | "liste_3_points",
                                "champs": { "titre"?, "sous_titre"?, "chiffre"?, "points"? } },
                    "duree_max": 1..60 (facultatif, secondes),
                    "illustration": "20 à 2500 caractères" (facultatif : fond plein cadre généré par l'IA) }, ... ] }
                                                                           # 1 à 30 scènes
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping

from fabrique.bibliotheque_musique import MOTIF_IDENTIFIANT as MOTIF_MUSIQUE
from fabrique.generateurs.illustration import DemandeInvalide, valider_illustration
from fabrique.generateurs.montage import FORMATS_SORTIE, MAX_SCENES
from fabrique.generateurs.visuels import GABARITS, valider_champs
from fabrique.registre_voix import MOTIF_ID as MOTIF_VOIX

TEXTE_VOIX_MAX = 1500
DUREE_MAX_SCENE_MIN_S = 1.0
DUREE_MAX_SCENE_MAX_S = 60.0
CHAMPS_DEMANDE = {"format_sortie", "musique", "sous_titres", "scenes"}
CHAMPS_OBLIGATOIRES = {"format_sortie", "sous_titres", "scenes"}
CHAMPS_SCENE = {"texte_voix", "voix", "visuel", "duree_max", "illustration"}
CHAMPS_SCENE_OBLIGATOIRES = {"texte_voix", "voix", "visuel"}
CHAMPS_VISUEL = {"gabarit", "champs"}


class DemandeVideoInvalide(ValueError):
    """Demande refusée : « champ : motif » (message court, sans chemin interne)."""


@dataclass(frozen=True)
class SceneDemandee:
    texte_voix: str
    voix: str
    gabarit: str
    champs: Mapping[str, object]
    duree_max_s: float | None
    illustration: str | None = None


@dataclass(frozen=True)
class DemandeVideo:
    format_sortie: str
    sous_titres: bool
    scenes: tuple[SceneDemandee, ...]
    musique: str | None = None


def _objet(valeur: object, nom: str, permis: set[str], obligatoires: set[str]) -> dict:
    if not isinstance(valeur, dict):
        raise DemandeVideoInvalide(f"{nom} : objet attendu")
    cles = set(valeur)
    if not all(isinstance(c, str) for c in cles):
        raise DemandeVideoInvalide(f"{nom} : noms de champs invalides")
    inconnus = cles - permis
    if inconnus:
        raise DemandeVideoInvalide(f"{nom} : champs inconnus {sorted(inconnus)}")
    manquants = obligatoires - cles
    if manquants:
        raise DemandeVideoInvalide(f"{nom} : champs manquants {sorted(manquants)}")
    return valeur


def _identifiant(valeur: object, nom: str, motif) -> str:
    if not isinstance(valeur, str) or not motif.fullmatch(valeur):
        raise DemandeVideoInvalide(f"{nom} : identifiant simple attendu (aucun chemin)")
    return valeur


def _scene(valeur: object, rang: int) -> SceneDemandee:
    nom = f"scenes[{rang}]"
    scene = _objet(valeur, nom, CHAMPS_SCENE, CHAMPS_SCENE_OBLIGATOIRES)
    texte = scene["texte_voix"]
    if (not isinstance(texte, str) or not texte.strip() or len(texte) > TEXTE_VOIX_MAX
            or any(c < " " and c not in "\n\t" for c in texte)):
        raise DemandeVideoInvalide(f"{nom}.texte_voix : texte de 1 à {TEXTE_VOIX_MAX} caractères attendu")
    voix = _identifiant(scene["voix"], f"{nom}.voix", MOTIF_VOIX)
    visuel = _objet(scene["visuel"], f"{nom}.visuel", CHAMPS_VISUEL, CHAMPS_VISUEL)
    gabarit = visuel["gabarit"]
    if not isinstance(gabarit, str) or gabarit not in GABARITS:
        raise DemandeVideoInvalide(f"{nom}.visuel.gabarit : gabarit inconnu (liste fixe {sorted(GABARITS)})")
    try:
        valider_champs(gabarit, visuel["champs"])
    except ValueError as erreur:
        raise DemandeVideoInvalide(f"{nom}.visuel.champs : {erreur}") from erreur
    duree = scene.get("duree_max")
    if duree is not None:
        if (isinstance(duree, bool) or not isinstance(duree, (int, float)) or not math.isfinite(duree)
                or not DUREE_MAX_SCENE_MIN_S <= duree <= DUREE_MAX_SCENE_MAX_S):
            raise DemandeVideoInvalide(
                f"{nom}.duree_max : nombre entre {DUREE_MAX_SCENE_MIN_S:g} et {DUREE_MAX_SCENE_MAX_S:g}")
        duree = float(duree)
    fond = None
    if "illustration" in scene:
        try:
            fond = valider_illustration(scene["illustration"])
        except DemandeInvalide as erreur:
            raise DemandeVideoInvalide(f"{nom}.{erreur}") from erreur
    return SceneDemandee(texte, voix, gabarit, dict(visuel["champs"]), duree, fond)


def valider_demande_video(demande: object) -> DemandeVideo:
    """Rend la demande typée ou lève DemandeVideoInvalide. Ne modifie pas son argument."""
    brute = _objet(demande, "demande", CHAMPS_DEMANDE, CHAMPS_OBLIGATOIRES)
    if brute["format_sortie"] not in FORMATS_SORTIE:
        raise DemandeVideoInvalide(f"format_sortie : l'un de {sorted(FORMATS_SORTIE)}")
    if not isinstance(brute["sous_titres"], bool):
        raise DemandeVideoInvalide("sous_titres : booléen attendu")
    musique = brute.get("musique")
    if musique is not None:
        musique = _identifiant(musique, "musique", MOTIF_MUSIQUE)
    scenes = brute["scenes"]
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= MAX_SCENES:
        raise DemandeVideoInvalide(f"scenes : liste de 1 à {MAX_SCENES} scènes attendue")
    return DemandeVideo(brute["format_sortie"], brute["sous_titres"],
                        tuple(_scene(s, i) for i, s in enumerate(scenes, 1)), musique)
