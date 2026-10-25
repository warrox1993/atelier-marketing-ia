"""Registre des voix autorisées (lot 7) : lecture et résolution, sans dépendance hors bibliothèque standard.

Le registre (`voix-autorisees/registre.json`) est tenu par root, jamais par un agent. Le schéma de
la demande n'a aucun champ d'échantillon audio : une voix est toujours un identifiant du registre,
d'où l'impossibilité de cloner une voix hors contrat. Voir docs/conception-execution-etroite.md §7.

Entrée du registre :
    id            identifiant simple (minuscules, chiffres, tirets)
    moteur        "chatterbox" ou "kokoro"
    type          "synthese" (voix livrée avec le modèle) ou "personne" (échantillon sous contrat)
    entreprises   liste d'identifiants d'entreprise ; "*" admis pour une voix de synthèse seulement
    expire_le     date ISO (AAAA-MM-JJ) ; une voix est refusée à partir de cette date incluse
    fichier_reference  (type personne seulement) nom simple d'un .wav du dossier du registre
    contrat       (type personne seulement, obligatoire) référence du contrat
    voix_moteur   (moteur kokoro seulement) nom de la voix du modèle, par exemple ff_siwis
"""

from __future__ import annotations

import datetime
import json
import os
import re
import stat
from dataclasses import dataclass
from pathlib import Path

MOTEURS = ("chatterbox", "kokoro")
TYPES = ("synthese", "personne")
CHAMPS_AUTORISES = {
    "id", "moteur", "type", "entreprises", "expire_le", "fichier_reference", "contrat", "voix_moteur",
}
MOTIF_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
MOTIF_ENTREPRISE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
MOTIF_FICHIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.wav$")
MOTIF_VOIX_MOTEUR = re.compile(r"^[a-z]{2}_[a-z0-9]{1,30}$")
TAILLE_MAX_REGISTRE = 256 * 1024


class VoixRefusee(ValueError):
    """La voix demandée n'est pas autorisée pour ce travail (message destiné à l'opérateur)."""


@dataclass(frozen=True)
class Voix:
    id: str
    moteur: str
    type: str
    expire_le: datetime.date
    entreprises: tuple[str, ...]
    voix_moteur: str | None = None
    chemin_reference: Path | None = None
    contrat: str | None = None


def _date(valeur: object, nom: str) -> datetime.date:
    if not isinstance(valeur, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valeur):
        raise VoixRefusee(f"{nom} : date AAAA-MM-JJ attendue")
    try:
        return datetime.date.fromisoformat(valeur)
    except ValueError as erreur:
        raise VoixRefusee(f"{nom} : date invalide") from erreur


def _verifier_reference(nom: object, dossier: Path) -> Path:
    if not isinstance(nom, str) or not MOTIF_FICHIER.fullmatch(nom):
        raise VoixRefusee("fichier_reference : nom simple en .wav attendu (aucun chemin)")
    chemin = dossier / nom
    try:
        info = os.lstat(chemin)
    except OSError as erreur:
        raise VoixRefusee("fichier_reference : fichier introuvable dans le dossier du registre") from erreur
    if not stat.S_ISREG(info.st_mode):
        raise VoixRefusee("fichier_reference : fichier régulier exigé (lien symbolique refusé)")
    return chemin


def _construire(entree: object, dossier: Path) -> Voix:
    if not isinstance(entree, dict):
        raise VoixRefusee("entrée de registre : objet attendu")
    inconnus = set(entree) - CHAMPS_AUTORISES
    if inconnus:
        raise VoixRefusee(f"entrée de registre : champs inconnus {sorted(inconnus)}")
    identifiant = entree.get("id")
    if not isinstance(identifiant, str) or not MOTIF_ID.fullmatch(identifiant):
        raise VoixRefusee("entrée de registre : id invalide")
    moteur, genre = entree.get("moteur"), entree.get("type")
    if moteur not in MOTEURS or genre not in TYPES:
        raise VoixRefusee(f"{identifiant} : moteur ou type invalide")
    entreprises = entree.get("entreprises")
    if (not isinstance(entreprises, list) or not entreprises
            or not all(isinstance(e, str) for e in entreprises)):
        raise VoixRefusee(f"{identifiant} : liste d'entreprises attendue")
    for entreprise in entreprises:
        if entreprise == "*":
            if genre != "synthese":
                raise VoixRefusee(f"{identifiant} : « * » réservé aux voix de synthèse")
        elif not MOTIF_ENTREPRISE.fullmatch(entreprise):
            raise VoixRefusee(f"{identifiant} : entreprise invalide {entreprise!r}")
    expire = _date(entree.get("expire_le"), f"{identifiant} : expire_le")
    voix_moteur = entree.get("voix_moteur")
    if moteur == "kokoro":
        if genre != "synthese":
            raise VoixRefusee(f"{identifiant} : Kokoro ne sert que des voix de synthèse")
        if not isinstance(voix_moteur, str) or not MOTIF_VOIX_MOTEUR.fullmatch(voix_moteur):
            raise VoixRefusee(f"{identifiant} : voix_moteur Kokoro invalide")
    elif voix_moteur is not None:
        raise VoixRefusee(f"{identifiant} : voix_moteur réservé à Kokoro")
    reference = contrat = None
    if genre == "personne":
        contrat = entree.get("contrat")
        if not isinstance(contrat, str) or not contrat.strip():
            raise VoixRefusee(f"{identifiant} : une voix de personne exige une référence de contrat")
        reference = _verifier_reference(entree.get("fichier_reference"), dossier)
    elif "fichier_reference" in entree or "contrat" in entree:
        raise VoixRefusee(f"{identifiant} : fichier et contrat réservés aux voix de personne")
    return Voix(identifiant, moteur, genre, expire, tuple(entreprises), voix_moteur, reference, contrat)


def charger_registre(dossier: str | os.PathLike) -> dict[str, Voix]:
    """Lit `registre.json` du dossier. Toute entrée invalide ou doublon fait échouer le chargement."""
    dossier = Path(dossier)
    chemin = dossier / "registre.json"
    try:
        info = os.lstat(chemin)
        if not stat.S_ISREG(info.st_mode) or info.st_size > TAILLE_MAX_REGISTRE:
            raise VoixRefusee("registre illisible : fichier régulier de taille raisonnable exigé")
        brut = json.loads(chemin.read_text(encoding="utf-8"))
    except OSError as erreur:
        raise VoixRefusee(f"registre introuvable : {chemin}") from erreur
    except json.JSONDecodeError as erreur:
        raise VoixRefusee(f"registre invalide : {erreur}") from erreur
    if not isinstance(brut, dict) or set(brut) != {"voix"} or not isinstance(brut["voix"], list):
        raise VoixRefusee("registre invalide : { \"voix\": [...] } attendu")
    voix: dict[str, Voix] = {}
    for entree in brut["voix"]:
        courante = _construire(entree, dossier)
        if courante.id in voix:
            raise VoixRefusee(f"registre invalide : identifiant en double {courante.id}")
        voix[courante.id] = courante
    return voix


def resoudre(identifiant: object, entreprise: object, dossier: str | os.PathLike,
             aujourd_hui: datetime.date | None = None) -> Voix:
    """Rend la voix autorisée pour cette entreprise, aujourd'hui, ou lève VoixRefusee."""
    if not isinstance(identifiant, str) or not MOTIF_ID.fullmatch(identifiant):
        raise VoixRefusee("voix : identifiant du registre attendu (aucun chemin, aucun fichier)")
    if not isinstance(entreprise, str) or not MOTIF_ENTREPRISE.fullmatch(entreprise):
        raise VoixRefusee("entreprise : identifiant invalide")
    registre = charger_registre(dossier)
    voix = registre.get(identifiant)
    if voix is None:
        raise VoixRefusee(f"voix inconnue : {identifiant}")
    jour = aujourd_hui or datetime.date.today()
    if jour >= voix.expire_le:
        raise VoixRefusee(f"voix expirée depuis le {voix.expire_le.isoformat()} : {identifiant}")
    if "*" not in voix.entreprises and entreprise not in voix.entreprises:
        raise VoixRefusee(f"voix non autorisée pour cette entreprise : {identifiant}")
    return voix
