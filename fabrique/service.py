"""Service de la fabrique : lit la file `entrant/` et exécute les travaux un par un.

Voir docs/conception-execution-etroite.md §4.1 et §4.2. Un seul travail à la fois, ordre FIFO
(date de modification). Chaque entrée est lue de façon sûre avant tout traitement : lien symbolique,
fichier étranger, nom hors UUID, JSON invalide ou entreprise douteuse sont déplacés dans `refuses/`.

Types de travaux : `document` (Office ou PDF, 120 s), `video` (voix en cage GPU, visuels, sous-titres,
montage, provenance IA, 30 min), `image` (PNG publicitaire composé en HTML/CSS et rendu en cage par Chrome,
provenance IA, 5 min, processeur seul). La carte graphique est partagée avec les jeux de l'opérateur : une vidéo dont
l'étape de voix trouve le GPU occupé n'occupe pas la file, elle passe en `en_attente_gpu` (etat.json)
et les documents passent devant ; elle est reprise quand le GPU se libère, et abandonnée après 12 h.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import time
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

# Lancé par `python3 -I .../fabrique/service.py` : le dossier parent du paquet n'est alors pas
# dans sys.path (le mode isolé ignore PYTHONPATH), on l'ajoute explicitement.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "fabrique"

from fabrique import bibliotheque_musique, cage, gpu, provenance, registre_charte  # noqa: E402
from fabrique.demande_video import DemandeVideoInvalide, SceneDemandee, valider_demande_video  # noqa: E402
from fabrique.generateurs import illustration, images, montage, sous_titres, visuels  # noqa: E402

RACINE_ETAT = "/var/lib/atelier-fabrique"
INTERVALLE_SCRUTATION_S = 2.0
INTERVALLE_MEMOIRE_S = 5.0
MEMOIRE_MIN_OCTETS = 4 * 1024**3
TAILLE_MAX_ENTREE = 512 * 1024
MOTIF_ENTREPRISE = re.compile(r"[A-Za-z0-9-]{1,64}")
TAILLE_MAX_MESSAGE = 200
TAILLE_MAX_APERCU = 20_000  # caractères d'apercu.txt (conception §4.4)
DELAI_TOTAL_DOCUMENT_S = 120  # durée maximale d'un travail document, toutes étapes comprises (l'opérateur)
DELAI_CONTROLE_S = 30  # contrôle de l'archive Office (hors cage)
DELAI_CONTROLE_PDF_S = 15  # contrôle du PDF dans la cage, réservé à la fin du délai global
DELAI_TOTAL_VIDEO_S = 30 * 60  # durée maximale d'un travail vidéo, toutes étapes comprises (décision de l'opérateur)
DELAI_TOTAL_IMAGE_S = 5 * 60  # durée maximale d'un travail image : rendu Chrome puis provenance
DELAI_TOTAL_IMAGE_ILLUSTREE_S = 15 * 60  # avec une illustration IA : chargement des poids (19 Gio), génération, rendu, provenance
MEMOIRE_MIN_ILLUSTRATION_OCTETS = 14 * 1024**3  # RAM disponible exigée : plafond de la cage (12 Gio, pic mesuré 11,05) + 2 Gio pour le bureau
TAILLE_MAX_ILLUSTRATION = 32 * 1024**2
DELAI_ATTENTE_GPU_S = 12 * 3600  # au-delà, la vidéo en attente du GPU est abandonnée
INTERVALLE_GPU_S = 30.0  # entre deux relevés du GPU pour les travaux en attente
DUREE_MAX_VIDEO_S = 180.0
CLES_CONTROLE_VIDEO = {"sonie_lufs", "crete_vraie_dbtp", "debit_video_kbps", "alertes"}  # lues pour l'aperçu
MARGE_SCENE_S = 0.4  # silence ajouté après la voix de chaque scène
DUREE_MIN_SCENE_S = 1.0  # plancher du rendu HyperFrames
TAILLE_MAX_WAV_VOIX = 30 * 1024**2
MOTIF_TACHE = re.compile(r"[\w.:-]{1,128}")
# Défense en profondeur : le service ne fait pas confiance au déposant au-delà du strict nécessaire.
FICHIER_ENTREPRISES = "entreprises.json"  # liste des entreprises autorisées : root:atelier-fabrique 0640
FICHIER_UUID_VUS = "uuid-vus.log"  # registre append-only des UUID acceptés (un par ligne), jamais purgé
FICHIER_QUOTAS = "quotas.json"  # compteur persistant du jour, par entreprise
UID_PROPRIETAIRE_LISTE = 0  # la liste des entreprises doit appartenir à root (remplaçable dans les tests)
QUOTA_TRAVAUX_PAR_JOUR = 50  # par entreprise et par jour UTC, toutes natures confondues
QUOTA_VIDEOS_PAR_JOUR = 10  # dont au plus 10 vidéos
QUOTA_IMAGES_PAR_JOUR = 30  # et au plus 30 images
MAX_ENTREES_EN_ATTENTE = 200  # fichiers conservés dans entrant/ ; au-delà : refus daté
REFUS_EXCES_PAR_PASSAGE = 100  # excédent refusé au plus à chaque passage de la boucle
TAILLE_MAX_FILE_GPU = 20  # vidéos en attente du GPU ; au-delà : refus à l'entrée
RETENTION_REFUSES_S = 7 * 86400  # refuses/ purgé au-delà de 7 jours
RETENTION_LIVRABLES_S = 30 * 86400  # livrables/ supprimés au-delà de 30 jours (après quoi l'agent ne peut plus les télécharger)
INTERVALLE_PURGE_S = 3600.0  # entre deux purges
DOSSIER_CHARTES = "chartes-autorisees"  # registre humain des chartes graphiques : <entreprise>/<id>.json
PYTHON_VENV = "/opt/atelier-fabrique/venv/bin/python"
PYTHON_VOIX = "/opt/atelier-fabrique/venv-voix/bin/python"
PYTHON_IMAGE = "/opt/atelier-fabrique/venv-image/bin/python"
# Versions épinglées des outils de la chaîne vidéo (fabrique/entrees-voix.in, installer-fabrique-whisper.sh).
VERSIONS_VOIX = {"chatterbox": "0.1.7", "kokoro": "0.7.16"}
VERSION_PERTH = "1.0.1"
VERSION_WHISPER = "v1.9.5"
DOSSIER_GENERATEURS = Path(__file__).resolve().parent / "generateurs"
CONTROLE_OFFICE = Path(__file__).resolve().parent / "controle_office.py"
NOMS_DOCUMENT = ("document.docx", "document.xlsx", "document.pptx")
horloge = time.monotonic  # remplaçable dans les tests
horloge_murale = time.time  # remplaçable dans les tests (abandon après 12 h d'attente)


class Refus(Exception):
    """Entrée de la file refusée : le message part dans le journal."""


class Echec(Exception):
    """Travail en échec : le message (court, sans chemin interne) est écrit dans etat.json."""


class AttenteGpu(Exception):
    """Le GPU est occupé : le travail est remis en attente (la raison part dans etat.json)."""


def maintenant() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def journal(message: str) -> None:
    print(f"{maintenant()} {message}", flush=True)


# ---------- lecture sûre de la file ----------

def nom_uuid_valide(nom: str) -> str | None:
    """Rend l'UUID si `nom` est `<uuid canonique en minuscules>.json`, sinon None."""
    if not nom.endswith(".json"):
        return None
    brut = nom[:-5]
    try:
        if str(uuid.UUID(brut)) != brut:
            return None
    except ValueError:
        return None
    return brut


def lire_entree(fd_dossier: int, nom: str, uid_deposant: int) -> dict:
    """Lit et valide une entrée de la file. Lève Refus au moindre doute. Ne suit aucun lien."""
    identifiant = nom_uuid_valide(nom)
    if identifiant is None:
        raise Refus("nom de fichier qui n'est pas un UUID suivi de .json")
    try:
        fd = os.open(nom, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd_dossier)
    except OSError as erreur:
        raise Refus(f"ouverture impossible ({erreur.strerror}), lien symbolique ou fichier disparu") from None
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Refus("pas un fichier régulier")
        if info.st_uid != uid_deposant:
            raise Refus(f"propriétaire inattendu (uid {info.st_uid})")
        if info.st_size > TAILLE_MAX_ENTREE:
            raise Refus("fichier trop gros")
        with os.fdopen(fd, "rb", closefd=False) as flux:
            brut = flux.read(TAILLE_MAX_ENTREE + 1)
    finally:
        os.close(fd)
    if len(brut) > TAILLE_MAX_ENTREE:
        raise Refus("fichier trop gros")
    try:
        donnees = json.loads(brut)
    except (ValueError, UnicodeDecodeError):
        raise Refus("JSON invalide") from None
    if not isinstance(donnees, dict):
        raise Refus("le JSON n'est pas un objet")
    if donnees.get("travail") != identifiant:
        raise Refus("champ travail différent du nom du fichier")
    entreprise = donnees.get("entreprise")
    if not isinstance(entreprise, str) or not MOTIF_ENTREPRISE.fullmatch(entreprise):
        raise Refus("entreprise invalide")
    if not isinstance(donnees.get("type"), str):
        raise Refus("type absent ou invalide")
    donnees["_brut"] = brut  # octets validés, ce sont eux qui seront conservés
    return donnees


def lister_entrees(dossier: str, plafond: int = MAX_ENTREES_EN_ATTENTE + REFUS_EXCES_PAR_PASSAGE) -> list[str]:
    """Noms des entrées de la file, les plus anciennes d'abord (date de modification).

    La lecture s'arrête après `plafond` entrées valides : un dépôt massif n'épuise pas la mémoire du service.
    """
    candidats = []
    with os.scandir(dossier) as it:
        for entree in it:
            if len(candidats) >= plafond:
                break
            if entree.name.startswith(".") or entree.name.endswith(".tmp"):
                continue  # écriture atomique du dépôt en cours : jamais lus ni déplacés
            try:
                candidats.append((entree.stat(follow_symlinks=False).st_mtime_ns, entree.name))
            except OSError:
                continue
    return [nom for _, nom in sorted(candidats)]


def refuser(fd_entrant: int, nom: str, dossier_refuses: str, raison: str) -> None:
    """Déplace l'entrée (sans la suivre) dans refuses/ sous un nom neuf, et le journalise."""
    destination = f"{int(time.time())}-{uuid.uuid4().hex[:8]}.refuse"
    try:
        fd_refuses = os.open(dossier_refuses, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.rename(nom, destination, src_dir_fd=fd_entrant, dst_dir_fd=fd_refuses)
        finally:
            os.close(fd_refuses)
        journal(f"REFUS {nom!r} -> refuses/{destination} : {raison}")
    except OSError as erreur:
        try:
            os.unlink(nom, dir_fd=fd_entrant)
        except OSError:
            pass
        journal(f"REFUS {nom!r} (déplacement impossible : {erreur.strerror}) : {raison}")


# ---------- gardes du service (registre des UUID, entreprises autorisées, quotas, purges) ----------

def uuid_deja_vu(racine: Path, identifiant: str) -> str | None:
    """Rend la raison si l'UUID est déjà connu : travail en cours, livrable existant ou registre des UUID vus."""
    if (racine / "travaux" / identifiant).exists():
        return "travail déjà connu"
    try:
        with os.scandir(racine / "livrables") as it:
            for entreprise in it:
                if os.path.lexists(os.path.join(entreprise.path, identifiant)):
                    return "travail déjà connu (livrable existant)"
    except OSError as erreur:
        journal(f"lecture de livrables/ impossible ({erreur.strerror}) : contrôle d'UUID sur les livrables sauté")
    try:
        with open(racine / FICHIER_UUID_VUS, encoding="ascii", errors="replace") as flux:
            if any(ligne.strip() == identifiant for ligne in flux):
                return "travail déjà connu (UUID déjà vu)"
    except FileNotFoundError:
        journal(f"{FICHIER_UUID_VUS} absent : aucun UUID déjà vu")
    return None


def noter_uuid_vu(racine: Path, identifiant: str) -> None:
    """Ajoute l'UUID au registre (append-only) avant tout traitement, pour qu'il ne puisse jamais être rejoué."""
    fd = os.open(racine / FICHIER_UUID_VUS, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o640)
    try:
        os.write(fd, f"{identifiant}\n".encode("ascii"))
        os.fsync(fd)
    finally:
        os.close(fd)


def entreprises_autorisees(racine: Path) -> frozenset[str]:
    """Entreprises autorisées d'après `entreprises.json`. Fichier absent, illisible, étranger ou modifiable : aucune."""
    chemin = racine / FICHIER_ENTREPRISES
    try:
        fd = os.open(chemin, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError:
        return frozenset()
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != UID_PROPRIETAIRE_LISTE or info.st_mode & 0o022:
            journal(f"{FICHIER_ENTREPRISES} ignoré : doit être un fichier régulier du propriétaire attendu, sans écriture groupe/autres")
            return frozenset()
        with os.fdopen(fd, "rb", closefd=False) as flux:
            brut = flux.read(65536)
    finally:
        os.close(fd)
    try:
        liste = json.loads(brut)
    except (ValueError, UnicodeDecodeError):
        journal(f"{FICHIER_ENTREPRISES} ignoré : JSON invalide")
        return frozenset()
    if not isinstance(liste, list):
        return frozenset()
    return frozenset(e for e in liste if isinstance(e, str) and MOTIF_ENTREPRISE.fullmatch(e))


def _lire_quotas(racine: Path) -> dict:
    try:
        quotas = json.loads((racine / FICHIER_QUOTAS).read_bytes())
    except (OSError, ValueError):
        return {}
    return quotas if isinstance(quotas, dict) else {}


def _jour() -> str:
    return datetime.fromtimestamp(horloge_murale(), timezone.utc).strftime("%Y-%m-%d")


def verifier_quota(racine: Path, entreprise: str, type_travail: str) -> str | None:
    """Rend le motif de refus si l'entreprise a épuisé son quota du jour (UTC), sinon None."""
    compteur = _lire_quotas(racine).get(entreprise)
    if not isinstance(compteur, dict) or compteur.get("jour") != _jour():
        return None
    if int(compteur.get("travaux", 0)) >= QUOTA_TRAVAUX_PAR_JOUR:
        return f"quota de {QUOTA_TRAVAUX_PAR_JOUR} travaux par jour atteint"
    if type_travail == "video" and int(compteur.get("videos", 0)) >= QUOTA_VIDEOS_PAR_JOUR:
        return f"quota de {QUOTA_VIDEOS_PAR_JOUR} vidéos par jour atteint"
    if type_travail == "image" and int(compteur.get("images", 0)) >= QUOTA_IMAGES_PAR_JOUR:
        return f"quota de {QUOTA_IMAGES_PAR_JOUR} images par jour atteint"
    return None


def compter_travail(racine: Path, entreprise: str, type_travail: str) -> None:
    """Ajoute un travail au compteur persistant du jour ; les jours passés sont oubliés."""
    jour = _jour()
    quotas = {e: c for e, c in _lire_quotas(racine).items() if isinstance(c, dict) and c.get("jour") == jour}
    compteur = quotas.get(entreprise, {"jour": jour, "travaux": 0, "videos": 0, "images": 0})
    compteur["travaux"] = int(compteur.get("travaux", 0)) + 1
    if type_travail == "video":
        compteur["videos"] = int(compteur.get("videos", 0)) + 1
    if type_travail == "image":
        compteur["images"] = int(compteur.get("images", 0)) + 1
    quotas[entreprise] = compteur
    ecrire_json_atomique(racine / FICHIER_QUOTAS, quotas)


def refuser_exces(racine: Path, fd_entrant: int, noms: list[str]) -> list[str]:
    """Au-delà de MAX_ENTREES_EN_ATTENTE fichiers dans entrant/, refuse l'excédent (les plus récents), par lots."""
    if len(noms) <= MAX_ENTREES_EN_ATTENTE:
        return noms
    excedent = noms[MAX_ENTREES_EN_ATTENTE:MAX_ENTREES_EN_ATTENTE + REFUS_EXCES_PAR_PASSAGE]
    (racine / "refuses").mkdir(mode=0o700, exist_ok=True)
    for nom in excedent:
        refuser(fd_entrant, nom, str(racine / "refuses"), f"file d'attente pleine (plus de {MAX_ENTREES_EN_ATTENTE} entrées)")
    return noms[:MAX_ENTREES_EN_ATTENTE]


def _horodatage_refus(entree: os.DirEntry) -> float:
    """Date d'un fichier de refuses/ : préfixe epoch du nom (posé par `refuser`), sinon date de modification."""
    try:
        return float(entree.name.split("-", 1)[0])
    except ValueError:
        return entree.stat(follow_symlinks=False).st_mtime


def purger(racine: Path) -> None:
    """Supprime refuses/ au-delà de 7 jours et les livrables terminés de plus de 30 jours. Ne suit aucun lien."""
    maintenant_s = horloge_murale()
    try:
        with os.scandir(racine / "refuses") as it:
            for entree in it:
                try:
                    if maintenant_s - _horodatage_refus(entree) > RETENTION_REFUSES_S:
                        os.unlink(entree.path)
                        journal(f"PURGE refuses/{entree.name} (plus de {RETENTION_REFUSES_S // 86400} jours)")
                except OSError:
                    continue
    except OSError:
        pass
    try:
        entreprises = [e for e in os.scandir(racine / "livrables") if e.is_dir(follow_symlinks=False)]
    except OSError:
        return
    for entreprise in entreprises:
        with os.scandir(entreprise.path) as it:
            for livrable in list(it):
                try:
                    if (not livrable.is_dir(follow_symlinks=False)
                            or maintenant_s - livrable.stat(follow_symlinks=False).st_mtime <= RETENTION_LIVRABLES_S
                            or (racine / "travaux" / livrable.name).exists()):
                        continue
                    shutil.rmtree(livrable.path)
                    journal(f"PURGE livrables/{entreprise.name}/{livrable.name} (plus de {RETENTION_LIVRABLES_S // 86400} jours)")
                except OSError as erreur:
                    journal(f"purge de {livrable.name!r} impossible : {erreur.strerror}")


# ---------- état et livrables ----------

def ecrire_json_atomique(chemin: Path, contenu: dict) -> None:
    temporaire = chemin.with_name(f".{chemin.name}.{uuid.uuid4().hex[:8]}.tmp")
    fd = os.open(temporaire, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    with os.fdopen(fd, "w", encoding="utf-8") as flux:
        json.dump(contenu, flux, ensure_ascii=False, indent=2)
    os.rename(temporaire, chemin)


def message_court(texte: str) -> str:
    return texte.replace("\n", " ")[:TAILLE_MAX_MESSAGE]


def ecrire_apercu(dossier_livrable: Path, texte: str) -> None:
    """Écrit apercu.txt (UTF-8, au plus TAILLE_MAX_APERCU caractères) de façon atomique."""
    temporaire = dossier_livrable / f".apercu.txt.{uuid.uuid4().hex[:8]}.tmp"
    fd = os.open(temporaire, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    with os.fdopen(fd, "w", encoding="utf-8") as flux:
        flux.write(texte[:TAILLE_MAX_APERCU])
    os.rename(temporaire, dossier_livrable / "apercu.txt")


def lire_texte_livrable(chemin: Path) -> str:
    """Lit un livrable texte (sans suivre de lien), au plus TAILLE_MAX_APERCU caractères, UTF-8 remplacé si invalide."""
    fd = os.open(chemin, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        with os.fdopen(fd, "rb", closefd=False) as flux:
            brut = flux.read(4 * TAILLE_MAX_APERCU)
    finally:
        os.close(fd)
    return brut.decode("utf-8", errors="replace")[:TAILLE_MAX_APERCU]


def copier_vers_livrable(source: Path, dossier_livrable: Path) -> dict:
    """Copie un fichier de sortie de la cage vers les livrables, rend taille et sha256."""
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    empreinte = hashlib.sha256()
    taille = 0
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise Echec("sortie de la cage invalide")
        cible = dossier_livrable / source.name
        fd_cible = os.open(cible, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o640)
        with os.fdopen(fd_cible, "wb") as sortie:
            while bloc := os.read(fd, 1024 * 1024):
                empreinte.update(bloc)
                taille += len(bloc)
                sortie.write(bloc)
    finally:
        os.close(fd)
    return {"fichier": source.name, "taille": taille, "sha256": empreinte.hexdigest()}


# ---------- types de travaux ----------

def traiter_essai(demande: dict, dossier_travail: Path, dossier_livrable: Path) -> dict:
    """Travail factice : une cage qui écrit essai.txt, récupéré avec sa taille et son sha256."""
    entree = dossier_travail / "entree"
    sortie = dossier_travail / "sortie"
    entree.mkdir(mode=0o700, exist_ok=True)
    sortie.mkdir(mode=0o700, exist_ok=True)
    etape = cage.Etape(
        type="cpu", programme="/usr/bin/sh",
        arguments=("-c", "echo ok > /sortie/essai.txt"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
    )
    resultat = cage.executer(etape, cage.DELAI_DOCUMENT_S)
    if resultat.delai_depasse:
        raise Echec("délai dépassé dans la cage")
    if resultat.code != 0:
        journal(f"cage en erreur : {resultat.erreur[:300].decode('utf-8', 'replace')!r}")
        raise Echec(f"la cage a échoué (code {resultat.code})")
    fichiers = cage.recuperer_sortie(sortie, ["essai.txt"])
    if not fichiers:
        raise Echec("fichier essai.txt absent de la sortie")
    copies = [copier_vers_livrable(f, dossier_livrable) for f in fichiers]
    # Aperçu pour l'agent : le contenu du fichier texte produit.
    return {"fichiers": copies, "apercu": lire_texte_livrable(dossier_livrable / "essai.txt")}


class _Budget:
    """Délai global d'un travail : chaque étape reçoit au plus ce qu'il reste."""

    def __init__(self, total_s: float, message: str = "délai dépassé (120 s au plus par document)"):
        self.fin = horloge() + total_s
        self.message = message

    def reste(self) -> float:
        return self.fin - horloge()

    def pour(self, delai_s: float, reserve_s: float = 0.0) -> float:
        disponible = self.reste() - reserve_s
        if disponible < 1:
            raise Echec(self.message)
        return min(delai_s, disponible)


def _etape_generateur(entree: Path, sortie: Path, *arguments: str):
    return cage.Etape(
        type="cpu", programme=PYTHON_VENV,
        arguments=("-I", "/code/documents.py", *arguments),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(DOSSIER_GENERATEURS), "/code"),),
    )


def _message_validation(erreur: bytes) -> str:
    """Première ligne de la sortie d'erreur du générateur : « demande invalide : champ : motif »."""
    ligne = erreur.decode("utf-8", "replace").strip().splitlines()[:1]
    texte = ligne[0] if ligne else ""
    if not texte.startswith("demande invalide"):
        return "demande invalide"
    return texte


def _generer_document(demande: dict, entree: Path, sortie: Path, budget: _Budget) -> Path:
    """Génère le document Office dans la cage ; rend le fichier produit (docx, xlsx ou pptx)."""
    entree.mkdir(mode=0o700, exist_ok=True)
    sortie.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(entree / "demande.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as flux:
        json.dump(demande, flux, ensure_ascii=False)
    etape = _etape_generateur(entree, sortie, "/entree/demande.json", "/sortie")
    resultat = cage.executer(etape, budget.pour(cage.DELAI_DOCUMENT_S))
    if resultat.delai_depasse:
        raise Echec("délai dépassé pendant la génération du document")
    if resultat.code == 2:
        raise Echec(_message_validation(resultat.erreur))
    if resultat.code != 0:
        journal(f"générateur en erreur (code {resultat.code}) : {resultat.erreur[:300].decode('utf-8', 'replace')!r}")
        raise Echec("la génération du document a échoué")
    try:
        annonce = json.loads(resultat.sortie)
        nom = annonce["fichier"]
    except (ValueError, KeyError, TypeError):
        raise Echec("la génération du document a échoué") from None
    if nom not in NOMS_DOCUMENT:
        raise Echec("la génération du document a échoué")
    trouves = cage.recuperer_sortie(sortie, [nom])
    if len(trouves) != 1:
        raise Echec("document absent de la sortie")
    return trouves[0]


def _controler_archive(fichier: Path, budget: _Budget) -> None:
    """Contrôle l'archive Office avec le python du venv (defusedxml), hors cage."""
    try:
        resultat = subprocess.run(
            [PYTHON_VENV, "-I", str(CONTROLE_OFFICE), str(fichier)],
            stdin=subprocess.DEVNULL, capture_output=True, env={}, shell=False,
            timeout=budget.pour(DELAI_CONTROLE_S),
        )
    except subprocess.TimeoutExpired:
        raise Echec("délai dépassé pendant le contrôle du document") from None
    if resultat.returncode == 3:
        journal(f"document refusé : {resultat.stderr[:300].decode('utf-8', 'replace')!r}")
        raise Echec("document refusé par le contrôle de sécurité")
    if resultat.returncode != 0:
        journal(f"contrôle en erreur (code {resultat.returncode}) : {resultat.stderr[:300].decode('utf-8', 'replace')!r}")
        raise Echec("le contrôle du document a échoué")


def _apercu_office(fichier: Path, dossier_travail: Path, budget: _Budget) -> str:
    """Texte du document extrait par la bibliothèque dans la cage. Vide si l'extraction échoue."""
    entree = dossier_travail / "apercu-entree"
    sortie = dossier_travail / "apercu-sortie"
    entree.mkdir(mode=0o700)
    sortie.mkdir(mode=0o700)
    shutil.copyfile(fichier, entree / fichier.name)
    etape = _etape_generateur(entree, sortie, "apercu", f"/entree/{fichier.name}", "/sortie")
    try:
        resultat = cage.executer(etape, budget.pour(cage.DELAI_DOCUMENT_S))
    except Echec:
        return ""
    if resultat.delai_depasse or resultat.code != 0:
        journal(f"aperçu indisponible (code {resultat.code})")
        return ""
    trouves = cage.recuperer_sortie(sortie, ["apercu.txt"])
    return lire_texte_livrable(trouves[0]) if trouves else ""


class _DelaisCage:
    """Plafonne les délais que pdf.convertir lit dans fabrique.cage à chaque appel (service mono-fil)."""

    def __init__(self, pdf_s: float, controle_s: float):
        self.valeurs = {"DELAI_PDF_S": pdf_s, "DELAI_DOCUMENT_S": controle_s}

    def __enter__(self):
        self.anciennes = {nom: getattr(cage, nom) for nom in self.valeurs}
        for nom, valeur in self.valeurs.items():
            setattr(cage, nom, valeur)

    def __exit__(self, *_):
        for nom, valeur in self.anciennes.items():
            setattr(cage, nom, valeur)


def _convertir_en_pdf(fichier: Path, dossier_travail: Path, budget: _Budget) -> tuple[Path, str]:
    """Conversion et contrôle PDF (lot 5). Rend (document.pdf, texte d'aperçu)."""
    from fabrique.generateurs import pdf as generateur_pdf

    travail = dossier_travail / "pdf"
    travail.mkdir(mode=0o700)
    shutil.copyfile(fichier, travail / fichier.name)
    with _DelaisCage(budget.pour(cage.DELAI_PDF_S, reserve_s=DELAI_CONTROLE_PDF_S), DELAI_CONTROLE_PDF_S):
        resultat = generateur_pdf.convertir(travail, fichier.name)
    if not resultat.ok:
        journal(f"conversion PDF en échec : {resultat.motif[:300]!r}")
        if "délai" in resultat.motif:
            raise Echec("délai dépassé pendant la conversion en PDF")
        if resultat.motif.startswith("PDF refusé"):
            raise Echec("PDF refusé par le contrôle de sécurité")
        raise Echec("la conversion en PDF a échoué")
    return resultat.pdf, lire_texte_livrable(resultat.apercu)


def traiter_document(donnees: dict, dossier_travail: Path, dossier_livrable: Path) -> dict:
    """Document Office ou PDF : générateur en cage, contrôle d'archive, conversion PDF éventuelle.

    Durée totale plafonnée à DELAI_TOTAL_DOCUMENT_S. Ne livre que le document final.
    """
    budget = _Budget(DELAI_TOTAL_DOCUMENT_S)
    demande = donnees.get("demande")
    if not isinstance(demande, dict):
        raise Echec("demande invalide : objet attendu")
    fichier = _generer_document(demande, dossier_travail / "entree", dossier_travail / "sortie", budget)
    _controler_archive(fichier, budget)
    if demande.get("format") == "pdf":
        livre, apercu = _convertir_en_pdf(fichier, dossier_travail, budget)
    else:
        livre, apercu = fichier, _apercu_office(fichier, dossier_travail, budget)
    copie = copier_vers_livrable(livre, dossier_livrable)
    ecrire_json_atomique(dossier_livrable / "provenance.json",
                         _provenance_document(donnees, demande["format"], copie))
    return {"fichiers": [copie], "apercu": apercu}


# ---------- provenance des documents ----------

BIBLIOTHEQUES_DOCUMENT = {"docx": "python-docx", "pdf": "python-docx", "xlsx": "openpyxl", "pptx": "python-pptx"}
_PROGRAMME_VERSIONS = (
    "import importlib.metadata as m, json, sys\n"
    "r = {}\n"
    "for n in sys.argv[1:]:\n"
    "    try: r[n] = m.version(n)\n"
    "    except Exception: pass\n"
    "print(json.dumps(r))\n"
)


def _version_commande(commande: list[str]) -> str:
    """Première ligne de sortie d'une commande à arguments fixes ; « inconnue » si elle échoue."""
    try:
        sortie = subprocess.run(commande, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                timeout=20, env={}, shell=False).stdout.strip().splitlines()
    except (OSError, subprocess.SubprocessError):
        return "inconnue"
    return (sortie[0] if sortie else "inconnue")[:64]


def versions_outils_document(format_: str) -> dict[str, str]:
    """Outils et versions qui ont produit le document (bibliothèque du venv, LibreOffice pour le PDF)."""
    bibliotheque = BIBLIOTHEQUES_DOCUMENT.get(format_, "")
    version = "inconnue"
    try:
        brut = subprocess.run([PYTHON_VENV, "-I", "-c", _PROGRAMME_VERSIONS, bibliotheque],
                              stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=20,
                              env={}, shell=False).stdout
        version = str(json.loads(brut).get(bibliotheque, "inconnue"))[:64]
    except (OSError, subprocess.SubprocessError, ValueError, AttributeError):
        pass
    outils = {bibliotheque or "inconnu": version}
    if format_ == "pdf":
        outils["libreoffice"] = _version_commande(["/usr/bin/soffice", "--version"])
    return outils


def _provenance_document(donnees: dict, format_: str, copie: dict) -> dict:
    """provenance.json d'un livrable document, au format que lit la porte de diffusion du plugin."""
    return {
        "travail": donnees["travail"],
        "entreprise": donnees["entreprise"],
        "type": "document",
        "format": format_,
        "fichier": copie["fichier"],
        "outils": versions_outils_document(format_),
        "voix": [],
        "musique": None,
        "digital_source_type": provenance.DIGITAL_SOURCE_TYPE,
        "sha256": copie["sha256"],
    }


# ---------- type vidéo ----------

CADENCE_VOIX = 24000  # Hz, mono 16 bits : sortie de generateurs/voix.py
DOSSIER_FABRIQUE = Path(__file__).resolve().parent


def racine_donnees() -> Path:
    return Path(os.environ.get("FABRIQUE_RACINE", RACINE_ETAT))


class _Plafonner:
    """Plafonne des délais que les générateurs lisent à chaque appel dans un module (service mono-fil)."""

    def __init__(self, cible, **valeurs: float):
        self.cible, self.valeurs = cible, valeurs

    def __enter__(self):
        self.anciennes = {nom: getattr(self.cible, nom) for nom in self.valeurs}
        for nom, valeur in self.valeurs.items():
            setattr(self.cible, nom, valeur)

    def __exit__(self, *_):
        for nom, valeur in self.anciennes.items():
            setattr(self.cible, nom, valeur)


def _dossiers_modeles_voix(racine: Path) -> tuple[tuple[str, str], ...]:
    """Montages (hôte, cage) des poids de Chatterbox et de Kokoro, révisions figées de modeles.json."""
    modeles = json.loads((DOSSIER_FABRIQUE / "modeles.json").read_text(encoding="utf-8"))["modeles"]
    return tuple((str(racine / "modeles" / f"{m['nom']}@{m['revision']}"), f"/modeles/{m['nom']}")
                 for m in modeles if m["nom"] in ("chatterbox", "kokoro"))


def _lire_voix_wav(chemin: Path) -> bytes:
    """PCM d'un voix.wav sorti de la cage, après contrôle de son format (mono, 16 bits, 24 kHz)."""
    if chemin.stat().st_size > TAILLE_MAX_WAV_VOIX:
        raise Echec("la voix produite est trop volumineuse")
    try:
        with wave.open(str(chemin), "rb") as f:
            if (f.getnchannels(), f.getsampwidth(), f.getframerate()) != (1, 2, CADENCE_VOIX):
                raise Echec("la voix produite n'a pas le format attendu")
            pcm = f.readframes(f.getnframes())
    except (wave.Error, EOFError):
        raise Echec("la voix produite est illisible") from None
    if not pcm:
        raise Echec("la voix produite est vide")
    return pcm


def _ecrire_wav(chemin: Path, pcm: bytes) -> None:
    with wave.open(str(chemin), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(CADENCE_VOIX)
        f.writeframes(pcm)


def _caler_pcm(pcm: bytes, duree_s: float) -> bytes:
    """PCM rallongé de silence ou coupé pour durer exactement `duree_s` (comme le fera le montage)."""
    octets = int(round(duree_s * CADENCE_VOIX)) * 2
    return pcm[:octets].ljust(octets, b"\0")


def _synthese_voix(scene: SceneDemandee, entreprise: str, dossier_travail: Path, rang: int,
                   budget: _Budget) -> tuple[Path, str]:
    """Voix d'une scène dans la cage GPU. Rend (voix.wav, moteur). GPU occupé : AttenteGpu.

    L'entreprise est celle du travail, posée par le service : la demande de l'agent n'en a pas.
    """
    libre, raison = gpu.gpu_disponible()
    if not libre:
        raise AttenteGpu(raison)
    racine = racine_donnees()
    entree, sortie = dossier_travail / f"voix-{rang:02d}-e", dossier_travail / f"voix-{rang:02d}-s"
    (entree / "code").mkdir(mode=0o700, parents=True)
    sortie.mkdir(mode=0o700)
    shutil.copyfile(DOSSIER_GENERATEURS / "voix.py", entree / "code" / "voix.py")
    shutil.copyfile(DOSSIER_FABRIQUE / "registre_voix.py", entree / "code" / "registre_voix.py")
    (entree / "demande.json").write_text(json.dumps(
        {"texte": scene.texte_voix, "langue": "fr", "voix": scene.voix, "entreprise": entreprise},
        ensure_ascii=False), encoding="utf-8")
    etape = cage.Etape(
        type="gpu", programme=PYTHON_VOIX,
        arguments=("-I", "/entree/code/voix.py", "/entree/demande.json", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=_dossiers_modeles_voix(racine) + ((str(racine / "voix-autorisees"), "/voix-autorisees"),),
        hors_ligne=True)
    resultat = cage.executer(etape, budget.pour(cage.DELAI_VOIX_S), fsize_octets=200 * 1024**2)
    if resultat.delai_depasse:
        raise Echec("délai dépassé pendant la synthèse vocale")
    detail = resultat.erreur.decode("utf-8", "replace").strip().splitlines()[:1]
    if resultat.code == 3:
        motif = detail[0].removeprefix("voix refusée : ") if detail else ""
        raise Echec("voix refusée" + (f" : {motif}" if motif and "/" not in motif else ""))
    if resultat.code != 0:
        journal(f"voix en erreur (code {resultat.code}) : {resultat.erreur[-300:].decode('utf-8', 'replace')!r}")
        raise Echec("la synthèse vocale a échoué")
    trouves = cage.recuperer_sortie(sortie, ["voix.wav"])
    if len(trouves) != 1:
        raise Echec("voix absente de la sortie")
    try:
        moteur = json.loads(resultat.sortie.decode("utf-8").strip().splitlines()[-1]).get("moteur", "")
    except (ValueError, IndexError, AttributeError):
        moteur = ""
    return trouves[0], moteur if moteur in VERSIONS_VOIX else "chatterbox"


def _rendre_visuel(scene: SceneDemandee, format_sortie: str, duree_s: float, dossier_travail: Path,
                   budget: _Budget, fond: Path | None = None, sens: int = 1) -> Path:
    """Clip HyperFrames de la scène (cage, sans réseau). Rend le chemin du MP4.

    `fond` : PNG de l'illustration de la scène, en plein cadre sous un voile, avec un lent zoom dans le sens `sens`."""
    try:
        with _Plafonner(cage, DELAI_RENDU_HTML_S=budget.pour(cage.DELAI_RENDU_HTML_S)):
            resultat = visuels.rendre_scene(dossier_travail, scene.gabarit, scene.champs, format_sortie, duree_s,
                                            fond, sens)
    except ValueError as erreur:
        raise Echec(f"visuel invalide : {erreur}") from erreur
    if not resultat.ok or resultat.video is None:
        journal(f"rendu du visuel en échec : {resultat.motif[:300]!r}")
        raise Echec("délai dépassé pendant le rendu d'un visuel" if "délai" in resultat.motif
                    else "le rendu d'un visuel a échoué")
    return resultat.video


def _sous_titrer(dossier_travail: Path, wav: Path, reference: str, budget: _Budget,
                 format_sortie: str) -> tuple[Path, str]:
    """Sous-titres de la voix assemblée (whisper.cpp en cage). Rend (fichier ASS, texte du SRT)."""
    try:
        with _Plafonner(cage, DELAI_SOUS_TITRES_S=budget.pour(cage.DELAI_SOUS_TITRES_S)):
            resultat = sous_titres.sous_titrer(dossier_travail, wav, reference, format_sortie=format_sortie)
    except ValueError as erreur:
        raise Echec(f"sous-titres impossibles : {erreur}") from erreur
    if not resultat.ok or resultat.ass is None or resultat.srt is None:
        journal(f"sous-titres en échec : {resultat.motif[:300]!r}")
        raise Echec("délai dépassé pendant les sous-titres" if "délai" in resultat.motif
                    else "les sous-titres ont échoué")
    return resultat.ass, lire_texte_livrable(resultat.srt)


def _monter(dossier_travail: Path, plan: montage.PlanMontage, budget: _Budget) -> Path:
    """Montage et contrôle de qualité en cage. Rend `sortie/video.mp4`, à côté de `planche.png` et
    `controle-qualite.json` ; un rendu hors norme lève Echec avec le motif du refus."""
    try:
        with _Plafonner(montage, DELAI_MONTAGE_S=budget.pour(cage.DELAI_MONTAGE_S)):
            resultat = montage.monter(dossier_travail, plan)
    except ValueError as erreur:
        raise Echec(f"plan de montage invalide : {erreur}") from erreur
    if not resultat.ok or resultat.video is None:
        journal(f"montage en échec : {resultat.motif[:300]!r}")
        raise Echec("délai dépassé pendant le montage" if "délai" in resultat.motif
                    else f"rendu refusé : {resultat.motif}" if resultat.motif_clair
                    else "le montage de la vidéo a échoué")
    return resultat.video


def _poser_provenance(video: Path, plan: montage.PlanMontage, infos: provenance.InfosProvenance) -> Path:
    try:
        resultat = provenance.poser_provenance(video, plan, infos)
    except ValueError as erreur:
        raise Echec(f"provenance IA invalide : {erreur}") from erreur
    if not resultat.ok or resultat.chemin_json is None:
        journal(f"provenance en échec : {resultat.motif[:300]!r}")
        raise Echec("la provenance IA n'a pas pu être posée (vérification en échec)")
    return resultat.chemin_json


def _apercu_video(demande, duree_s: float, srt: str | None, controle: dict) -> str:
    """Aperçu pour l'agent : durée, résolution, mesures de qualité, puis transcription (SRT) ou texte dit."""
    texte = srt if srt else "\n\n".join(s.texte_voix for s in demande.scenes)
    titre = "Transcription (SRT)" if srt else "Texte dit (sous-titres non demandés)"
    alertes = "\n".join(f"- {a}" for a in controle["alertes"]) or "aucune"
    return (f"Vidéo {demande.format_sortie}, {duree_s:.1f} s, {len(demande.scenes)} scène(s)\n"
            f"Qualité mesurée : sonie {controle['sonie_lufs']} LUFS, crête vraie {controle['crete_vraie_dbtp']} dBTP, "
            f"débit vidéo {controle['debit_video_kbps']} kb/s\n"
            f"Alertes (non bloquantes) : {alertes}\n"
            f"{titre} :\n{texte}\n")


def _livrer_revue_video(video: Path, dossier_livrable: Path) -> tuple[dict, dict]:
    """Copie `planche.png` et `controle-qualite.json` (à côté de la vidéo montée) vers le livrable.

    Rend (clé `revue` de resultat.json, contenu du contrôle). Ces fichiers ne sont pas dans `fichiers` :
    ils servent à la revue (le relecteur voit la planche) et ne se diffusent pas.
    """
    try:
        planche = copier_vers_livrable(video.parent / montage.NOM_PLANCHE, dossier_livrable)
        copier_vers_livrable(video.parent / montage.NOM_CONTROLE, dossier_livrable)
        controle = json.loads(lire_texte_livrable(dossier_livrable / montage.NOM_CONTROLE))
        if not CLES_CONTROLE_VIDEO <= controle.keys():
            raise ValueError("clés manquantes dans controle-qualite.json")
    except (OSError, ValueError, AttributeError) as erreur:
        journal(f"planche ou contrôle de qualité absent : {erreur!r}")
        raise Echec("la planche de revue ou le contrôle de qualité est absent") from erreur
    return {"fichier": planche["fichier"], "sha256": planche["sha256"]}, controle


def traiter_video(donnees: dict, dossier_travail: Path, dossier_livrable: Path) -> dict:
    """Vidéo : voix (cage GPU) et visuel de chaque scène, sous-titres, musique, montage, provenance IA.

    Durée d'une scène = durée de la voix + 0,4 s, plafonnée par `duree_max`. Total au plus 180 s.
    Budget de traitement : 30 min. GPU occupé au moment d'une voix : AttenteGpu (le travail repart de
    zéro à sa reprise : les étapes déjà faites ne sont pas conservées).
    """
    budget = _Budget(DELAI_TOTAL_VIDEO_S, "délai dépassé (30 min au plus par vidéo)")
    try:
        demande = valider_demande_video(donnees.get("demande"))
    except DemandeVideoInvalide as erreur:
        raise Echec(f"demande invalide : {erreur}") from erreur
    entree = dossier_travail / "entree"
    entree.mkdir(mode=0o700)
    durees: list[float] = []
    pcms: list[bytes] = []
    moteurs: list[str] = []
    for rang, scene in enumerate(demande.scenes, 1):
        wav, moteur = _synthese_voix(scene, donnees["entreprise"], dossier_travail, rang, budget)
        pcm = _lire_voix_wav(wav)
        voulue = max(len(pcm) / 2 / CADENCE_VOIX + MARGE_SCENE_S, DUREE_MIN_SCENE_S)
        if scene.duree_max_s is None and voulue > visuels.DUREE_MAX_S:
            # Sans plafond demandé, on ne coupe jamais une voix en silence : une scène dure 60 s au plus.
            raise Echec(f"la voix de la scène {rang} dépasse {visuels.DUREE_MAX_S:g} s : raccourcir le texte")
        duree = min(voulue, scene.duree_max_s or visuels.DUREE_MAX_S)
        if sum(durees) + duree > DUREE_MAX_VIDEO_S:
            raise Echec(f"durée totale supérieure à {DUREE_MAX_VIDEO_S:g} s")
        options = {}
        if scene.illustration:
            # Graine propre à la scène (sinon toutes les images se ressemblent) ; le zoom alterne d'une scène à l'autre.
            fond = _illustrer(scene.illustration, demande.format_sortie, donnees["travail"], dossier_travail, budget,
                              dimensions=visuels.FORMATS[demande.format_sortie], rang=rang)
            options = {"fond": fond, "sens": 1 if rang % 2 else -1}
        clip = _rendre_visuel(scene, demande.format_sortie, duree, dossier_travail, budget, **options)
        shutil.copyfile(clip, entree / f"scene-{rang:02d}.mp4")
        shutil.copyfile(wav, entree / f"voix-{rang:02d}.wav")
        durees.append(duree)
        pcms.append(pcm)
        moteurs.append(moteur)
    srt = None
    if demande.sous_titres:
        assemblee = dossier_travail / "voix-assemblee.wav"
        _ecrire_wav(assemblee, b"".join(_caler_pcm(p, d) for p, d in zip(pcms, durees)))
        ass, srt = _sous_titrer(dossier_travail, assemblee,
                                " ".join(s.texte_voix for s in demande.scenes), budget, demande.format_sortie)
        shutil.copyfile(ass, entree / "sous-titres.ass")
    else:
        (entree / "sous-titres.ass").write_text(sous_titres.ecrire_ass([], demande.format_sortie), encoding="utf-8")
    fiche = None
    if demande.musique:
        try:
            fiche = bibliotheque_musique.preparer_musique(demande.musique, entree)
        except bibliotheque_musique.ErreurImport as erreur:
            raise Echec(f"musique refusée : {erreur}") from erreur
    plan = montage.PlanMontage(
        tuple(montage.SceneMontage(i, "mp4", d) for i, d in enumerate(durees, 1)),
        demande.format_sortie, avec_musique=fiche is not None)
    video = _monter(dossier_travail, plan, budget)
    outils = {**{m: VERSIONS_VOIX[m] for m in sorted(set(moteurs))}, "resemble-perth": VERSION_PERTH,
              "hyperframes": visuels.VERSION_HYPERFRAMES}
    if any(s.illustration for s in demande.scenes):
        modele = _modele_illustration()
        outils[modele["nom"]] = modele["revision"][:12]
    if demande.sous_titres:
        outils["whisper.cpp"] = VERSION_WHISPER
    infos = provenance.InfosProvenance(
        travail=donnees["travail"], entreprise=donnees["entreprise"],
        voix=tuple(dict.fromkeys(s.voix for s in demande.scenes)), outils=outils,
        musique={"id": demande.musique, "licence": str(fiche.get("licence", ""))[:200]} if fiche else None)
    budget.pour(1)  # la provenance a ses propres délais : on ne la lance pas si le budget est épuisé
    chemin_provenance = _poser_provenance(video, plan, infos)
    copie = copier_vers_livrable(video, dossier_livrable)
    copier_vers_livrable(chemin_provenance, dossier_livrable)
    revue, controle = _livrer_revue_video(video, dossier_livrable)
    return {"fichiers": [copie], "revue": revue, "controle_qualite": montage.NOM_CONTROLE,
            "apercu": _apercu_video(demande, sum(durees), srt, controle)}


# ---------- type image ----------

CHAMPS_DEMANDE_IMAGE = ("format", "gabarit", "champs", "charte")
CHAMP_ILLUSTRATION = "illustration"  # facultatif : scène de 20 à 2500 caractères, générée par l'IA en fond plein cadre


def _modele_illustration() -> dict:
    """Entrée de modeles.json du modèle d'illustration (dépôt et révision des poids), désignée par la section « illustration »."""
    donnees = json.loads((DOSSIER_FABRIQUE / "modeles.json").read_text(encoding="utf-8"))
    nom = donnees["illustration"]["modele"]
    return next(m for m in donnees["modeles"] if m["nom"] == nom)


def _illustrer(texte: str, format_sortie: str, identifiant: str, dossier_travail: Path, budget: _Budget,
               *, dimensions: tuple[int, int] | None = None, rang: int = 0) -> Path:
    """Illustration du fond dans la cage GPU (hors ligne, 12 Gio de RAM au plus). Rend le PNG. GPU ou RAM occupés : AttenteGpu.

    Une vidéo illustre plusieurs scènes : `dimensions` donne la taille du format vidéo et `rang` (1, 2...) décale la
    graine et le nom des dossiers, pour que chaque scène ait son image. Une image seule : `rang` 0, format des images."""
    libre, raison = gpu.gpu_disponible()
    if not libre:
        raise AttenteGpu(raison)
    if memoire_disponible_octets() < MEMOIRE_MIN_ILLUSTRATION_OCTETS:
        raise AttenteGpu("mémoire vive insuffisante pour charger le modèle d'illustration")
    largeur, hauteur = dimensions or images.valider_format(format_sortie)
    modele = _modele_illustration()
    nom = "illustration" if rang == 0 else f"illustration-{rang:02d}"
    entree, sortie = dossier_travail / f"{nom}-e", dossier_travail / f"{nom}-s"
    (entree / "code").mkdir(mode=0o700, parents=True)
    sortie.mkdir(mode=0o700)
    shutil.copyfile(DOSSIER_GENERATEURS / "illustration.py", entree / "code" / "illustration.py")
    shutil.copyfile(DOSSIER_FABRIQUE / "modeles.json", entree / "code" / "modeles.json")
    (entree / "demande.json").write_text(json.dumps(
        {"illustration": texte, "largeur": largeur, "hauteur": hauteur, "graine": (int(identifiant.replace("-", "")[:8], 16) + rang) % 2**32}),
        encoding="utf-8")
    etape = cage.Etape(
        type="gpu", programme=PYTHON_IMAGE,
        arguments=("-I", "/entree/code/illustration.py", "/entree/demande.json", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(racine_donnees() / "modeles" / f"{modele['nom']}@{modele['revision']}"), str(illustration.POIDS)),),
        hors_ligne=True)
    resultat = cage.executer(etape, budget.pour(cage.DELAI_ILLUSTRATION_S), fsize_octets=200 * 1024**2,
                             donnees_octets=cage.LIMITE_DONNEES_ILLUSTRATION_OCTETS)
    if resultat.delai_depasse:
        raise Echec("délai dépassé pendant la génération de l'illustration")
    if resultat.code == 5:
        raise Echec("illustration refusée : bandes noires persistantes")
    if resultat.code != 0:
        journal(f"illustration en erreur (code {resultat.code}) : {resultat.erreur[-300:].decode('utf-8', 'replace')!r}")
        raise Echec("la génération de l'illustration a échoué")
    trouves = cage.recuperer_sortie(sortie, [illustration.NOM_SORTIE])
    if len(trouves) != 1 or trouves[0].stat().st_size > TAILLE_MAX_ILLUSTRATION:
        raise Echec("illustration absente ou trop volumineuse")
    try:
        lu_l, lu_h, profondeur, type_couleur = registre_charte.lire_ihdr(trouves[0].read_bytes()[:33])
    except ValueError:
        raise Echec("l'illustration produite n'est pas un PNG") from None
    if (lu_l, lu_h) != (largeur, hauteur) or profondeur != 8 or type_couleur not in (0, 2):
        raise Echec("l'illustration produite n'a pas le format attendu")
    return trouves[0]


def _rendre_image(gabarit: str, champs: dict, format_sortie: str, charte: registre_charte.Charte,
                  dossier_travail: Path, budget: _Budget, fond: Path | None = None) -> images.Resultat:
    """PNG de la demande (Chrome en cage, sans réseau). Rend le résultat du rendu, ok=True ; sinon lève Echec.

    Aucune mention IA incrustée (choix de l'opérateur du 01/11) : la provenance la porte en métadonnées."""
    options = {} if fond is None else {"fond": fond}
    try:
        with _Plafonner(images, DELAI_IMAGE_S=budget.pour(images.DELAI_IMAGE_S)):
            resultat = images.rendre_image(dossier_travail, gabarit, champs, format_sortie, charte, **options)
    except ValueError as erreur:
        raise Echec(f"image invalide : {erreur}") from erreur
    if not resultat.ok or resultat.image is None:
        journal(f"rendu de l'image en échec : {resultat.motif[:300]!r}")
        raise Echec("délai dépassé pendant le rendu de l'image" if "délai" in resultat.motif
                    else "le rendu de l'image a échoué")
    return resultat


def _poser_provenance_image(image: Path, infos: provenance.InfosProvenanceImage) -> Path:
    try:
        resultat = provenance.poser_provenance_image(image, infos)
    except ValueError as erreur:
        raise Echec(f"provenance IA invalide : {erreur}") from erreur
    if not resultat.ok or resultat.chemin_json is None:
        journal(f"provenance de l'image en échec : {resultat.motif[:300]!r}")
        raise Echec("la provenance IA n'a pas pu être posée (vérification en échec)")
    return resultat.chemin_json


def _apercu_image(gabarit: str, format_sortie: str, charte: str, copie: dict, fond_ia: bool = False) -> str:
    """Aperçu pour l'agent : ce qui permet de reconnaître l'image sans l'ouvrir."""
    return (f"Image {format_sortie}, gabarit {gabarit}, charte {charte}\n"
            f"Poids : {copie['taille']} octets, sha256 : {copie['sha256']}\n"
            f"fond IA : {'oui' if fond_ia else 'non'}\n")


def traiter_image(donnees: dict, dossier_travail: Path, dossier_livrable: Path) -> dict:
    """Image publicitaire : validation, charte du registre, rendu Chrome en cage, provenance IA (XMP et JSON).

    L'agent ne fournit qu'un format, un gabarit, des champs bornés et l'identifiant d'une charte du registre
    humain (couleurs, police, logo), plus facultativement la description d'une illustration à générer en fond :
    jamais de fichier, d'URL ni de couleur. Budget : 5 min, processeur seul ; 15 min avec une illustration (GPU).
    """
    demande = donnees.get("demande")
    if not isinstance(demande, dict):
        raise Echec("demande invalide : objet attendu")
    texte_illustration = demande.get(CHAMP_ILLUSTRATION)
    avec_illustration = CHAMP_ILLUSTRATION in demande
    budget = (_Budget(DELAI_TOTAL_IMAGE_ILLUSTREE_S, "délai dépassé (15 min au plus par image illustrée)") if avec_illustration
              else _Budget(DELAI_TOTAL_IMAGE_S, "délai dépassé (5 min au plus par image)"))
    inconnus = set(demande) - set(CHAMPS_DEMANDE_IMAGE) - {CHAMP_ILLUSTRATION}
    manquants = [c for c in CHAMPS_DEMANDE_IMAGE if c not in demande]
    if inconnus or manquants:
        raise Echec(f"demande invalide : champs inconnus {sorted(map(str, inconnus))}, manquants {manquants}"[:TAILLE_MAX_MESSAGE])
    try:
        images.valider_format(demande["format"])
        images.valider_champs(demande["gabarit"], demande["champs"])
        if avec_illustration:
            texte_illustration = illustration.valider_illustration(texte_illustration)
    except ValueError as erreur:  # DemandeInvalide en est une
        raise Echec(f"demande invalide : {erreur}"[:TAILLE_MAX_MESSAGE]) from erreur
    try:
        charte = registre_charte.resoudre(demande["charte"], donnees["entreprise"],
                                          racine_donnees() / DOSSIER_CHARTES, uid_proprietaire=UID_PROPRIETAIRE_LISTE)
    except registre_charte.CharteRefusee as erreur:
        raise Echec(f"charte refusée : {erreur}" if "/" not in str(erreur) else "charte refusée") from erreur
    fond, outils = None, {"chrome-headless-shell": images.VERSION_CHROME}
    if avec_illustration:
        fond = _illustrer(texte_illustration, demande["format"], donnees["travail"], dossier_travail, budget)
        modele = _modele_illustration()
        outils[modele["nom"]] = modele["revision"][:12]
    resultat = _rendre_image(demande["gabarit"], demande["champs"], demande["format"], charte, dossier_travail, budget, fond)
    infos = provenance.InfosProvenanceImage(
        travail=donnees["travail"], entreprise=donnees["entreprise"], gabarit=demande["gabarit"],
        format=demande["format"], charte=charte.id, outils=outils,
        fond_ia=avec_illustration)
    budget.pour(1)  # la provenance a ses propres délais : on ne la lance pas si le budget est épuisé
    chemin_provenance = _poser_provenance_image(resultat.image, infos)
    copie = copier_vers_livrable(resultat.image, dossier_livrable)  # après la provenance : c'est l'image portant le XMP
    copier_vers_livrable(chemin_provenance, dossier_livrable)
    return {"fichiers": [copie], "apercu": _apercu_image(demande["gabarit"], demande["format"], charte.id, copie, avec_illustration)}


# Un traitement rend {"fichiers": [...]} et, facultativement, "apercu" : texte lisible par l'agent
# (écrit dans apercu.txt, jamais dans resultat.json).
# Le type `essai` (traiter_essai, qui lance /usr/bin/sh) n'y figure pas : seuls les tests l'y injectent.
REGISTRE: dict[str, Callable[[dict, Path, Path], dict]] = {
    "document": traiter_document,
    "video": traiter_video,
    "image": traiter_image,
}


# ---------- exécution d'un travail ----------

def memoire_disponible_octets(chemin: str = "/proc/meminfo") -> int:
    with open(chemin, encoding="ascii") as flux:
        for ligne in flux:
            if ligne.startswith("MemAvailable:"):
                return int(ligne.split()[1]) * 1024
    return 0


def attendre_memoire(
    lire: Callable[[], int] = memoire_disponible_octets,
    dormir: Callable[[float], None] = time.sleep,
    arret: Callable[[], bool] = lambda: False,
) -> bool:
    """Attend MemAvailable >= 4 Gio. Rend False si l'arrêt est demandé pendant l'attente."""
    prevenu = False
    while lire() < MEMOIRE_MIN_OCTETS:
        if arret():
            return False
        if not prevenu:
            journal("mémoire disponible insuffisante, attente")
            prevenu = True
        dormir(INTERVALLE_MEMOIRE_S)
    return True


def _tache_de(donnees: dict) -> str | None:
    """Tâche du fichier de file (champ `tache`), si elle a la forme d'un identifiant simple."""
    tache = donnees.get("tache")
    return tache if isinstance(tache, str) and MOTIF_TACHE.fullmatch(tache) else None


def executer_travail(racine: Path, donnees: dict, reprise: bool = False) -> str | None:
    """Exécute un travail accepté. Écrit etat.json (en_cours, puis termine, echec ou en_attente_gpu).

    Rend la raison si le travail a été remis en attente du GPU (il garde son demande.json), sinon None.
    Le dossier du livrable est créé sans `exist_ok` : s'il existe déjà (FileExistsError), rien n'est écrasé.
    `reprise=True` (reprise d'une vidéo mise en attente du GPU) autorise le dossier créé par la première tentative.
    """
    identifiant = donnees["travail"]
    dossier_travail = racine / "travaux" / identifiant
    dossier_livrable = racine / "livrables" / donnees["entreprise"] / identifiant
    dossier_livrable.mkdir(mode=0o750, parents=True, exist_ok=reprise)
    debut = maintenant()
    etat = {"travail": identifiant, "type": donnees["type"], "debut": debut}
    if _tache_de(donnees):
        etat["tache"] = _tache_de(donnees)  # la porte de diffusion relie ainsi la tâche et le travail
    ecrire_json_atomique(dossier_livrable / "etat.json", {**etat, "etat": "en_cours"})
    journal(f"DEBUT {identifiant} type={donnees['type']} entreprise={donnees['entreprise']}")
    try:
        traitement = REGISTRE.get(donnees["type"])
        if traitement is None:
            raise Echec("type de travail non pris en charge")
        resultat = traitement(donnees, dossier_travail, dossier_livrable)
        apercu = resultat.pop("apercu", None)
        if isinstance(apercu, str) and apercu:
            ecrire_apercu(dossier_livrable, apercu)
        ecrire_json_atomique(dossier_livrable / "resultat.json", resultat)
        final = {**etat, "etat": "termine", "fin": maintenant()}
    except AttenteGpu as attente:
        raison = message_court(str(attente))
        for reste in dossier_travail.iterdir():  # on ne garde que demande.json : la reprise repart de zéro
            if reste.name != "demande.json":
                shutil.rmtree(reste, ignore_errors=True) if reste.is_dir() else reste.unlink(missing_ok=True)
        ecrire_json_atomique(dossier_livrable / "etat.json", {
            **etat, "etat": "en_attente_gpu", "raison": raison, "en_attente_depuis": maintenant()})
        journal(f"ATTENTE_GPU {identifiant} : {raison}")
        return raison
    except Echec as erreur:
        final = {**etat, "etat": "echec", "fin": maintenant(), "message": message_court(str(erreur))}
    except Exception as erreur:  # noqa: BLE001 : le service ne doit jamais tomber sur un travail
        journal(f"ERREUR {identifiant} : {type(erreur).__name__}: {erreur}")
        final = {**etat, "etat": "echec", "fin": maintenant(), "message": "erreur interne"}
    ecrire_json_atomique(dossier_livrable / "etat.json", final)
    shutil.rmtree(dossier_travail, ignore_errors=True)
    journal(f"FIN {identifiant} etat={final['etat']}")
    return None


class FileAttenteGpu:
    """Travaux vidéo remis en attente du GPU : (donnees, depuis en secondes murales), du plus ancien au plus récent."""

    def __init__(self):
        self.travaux: list[tuple[dict, float]] = []
        self.prochain_releve = 0.0

    def ajouter(self, donnees: dict, depuis: float | None = None) -> bool:
        """Met la vidéo en attente. Rend False (sans l'ajouter) si la file compte déjà TAILLE_MAX_FILE_GPU vidéos."""
        if len(self.travaux) >= TAILLE_MAX_FILE_GPU:
            return False
        self.travaux.append((donnees, horloge_murale() if depuis is None else depuis))
        return True

    def pleine(self) -> bool:
        return len(self.travaux) >= TAILLE_MAX_FILE_GPU

    def __len__(self) -> int:
        return len(self.travaux)


def abandonner(racine: Path, donnees: dict) -> None:
    """Abandon d'un travail resté trop longtemps en attente : échec, dossier de travail retiré."""
    identifiant = donnees["travail"]
    etat = {"travail": identifiant, "type": donnees["type"], "etat": "echec", "fin": maintenant(),
            "message": "carte graphique occupée trop longtemps"}
    if _tache_de(donnees):
        etat["tache"] = _tache_de(donnees)
    livrable = racine / "livrables" / donnees["entreprise"] / identifiant
    ecrire_json_atomique(livrable / "etat.json", etat)
    shutil.rmtree(racine / "travaux" / identifiant, ignore_errors=True)
    journal(f"ABANDON {identifiant} : carte graphique occupée trop longtemps")


def reprendre_attentes(racine: Path, file: FileAttenteGpu, arret: Callable[[], bool]) -> bool:
    """Abandonne les vidéos en attente depuis plus de 12 h ; reprend la plus ancienne si le GPU est libre.

    Rend True si un travail a été repris (la boucle ne dort pas alors). Le GPU n'est relevé qu'une fois
    toutes les INTERVALLE_GPU_S secondes.
    """
    maintenant_s = horloge_murale()
    for donnees, depuis in list(file.travaux):
        if maintenant_s - depuis > DELAI_ATTENTE_GPU_S:
            file.travaux.remove((donnees, depuis))
            abandonner(racine, donnees)
    if not file.travaux or horloge() < file.prochain_releve:
        return False
    file.prochain_releve = horloge() + INTERVALLE_GPU_S
    libre, raison = gpu.gpu_disponible()
    if not libre:
        return False
    donnees, _ = file.travaux.pop(0)
    journal(f"REPRISE {donnees['travail']} : {raison}")
    if attendre_memoire(arret=arret):
        if executer_travail(racine, donnees, reprise=True) is not None:
            file.ajouter(donnees)  # la place libérée par pop() est toujours disponible
    else:
        file.travaux.insert(0, (donnees, maintenant_s))
    return True


def accepter(racine: Path, fd_entrant: int, nom: str, donnees: dict) -> None:
    """Note l'UUID au registre, compte le travail au quota, conserve les octets validés dans
    travaux/<uuid>/demande.json puis retire l'entrée."""
    noter_uuid_vu(racine, donnees["travail"])
    compter_travail(racine, donnees["entreprise"], donnees["type"])
    dossier_travail = racine / "travaux" / donnees["travail"]
    dossier_travail.mkdir(mode=0o700)
    fd = os.open(dossier_travail / "demande.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as flux:
        flux.write(donnees["_brut"])
    try:
        os.unlink(nom, dir_fd=fd_entrant)
    except OSError as erreur:
        journal(f"avertissement : entrée {nom!r} non retirée ({erreur.strerror})")


def _utilise_le_gpu(donnees: dict) -> bool:
    """Vidéo, ou image avec une illustration : travaux qui peuvent attendre le GPU."""
    demande = donnees.get("demande")
    return donnees["type"] == "video" or (donnees["type"] == "image" and isinstance(demande, dict) and CHAMP_ILLUSTRATION in demande)


def traiter_une_entree(racine: Path, uid_deposant: int, nom: str,
                       file_gpu: FileAttenteGpu | None = None, **options) -> None:
    """Valide l'entrée `nom` puis l'exécute ; ou la refuse. Une vidéo qui attend le GPU va dans `file_gpu`."""
    dossier_refuses = racine / "refuses"
    dossier_refuses.mkdir(mode=0o700, exist_ok=True)
    fd_entrant = os.open(racine / "entrant", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        try:
            donnees = lire_entree(fd_entrant, nom, uid_deposant)
        except Refus as raison:
            refuser(fd_entrant, nom, str(dossier_refuses), str(raison))
            return
        motif = (uuid_deja_vu(racine, donnees["travail"])
                 or (None if donnees["entreprise"] in entreprises_autorisees(racine) else "entreprise non autorisée")
                 or verifier_quota(racine, donnees["entreprise"], donnees["type"])
                 or ("file d'attente du GPU pleine" if _utilise_le_gpu(donnees) and file_gpu is not None
                     and file_gpu.pleine() else None))
        if motif:
            refuser(fd_entrant, nom, str(dossier_refuses), motif)
            return
        accepter(racine, fd_entrant, nom, donnees)
    finally:
        os.close(fd_entrant)
    if attendre_memoire(**options):
        try:
            attente = executer_travail(racine, donnees)
        except FileExistsError:
            journal(f"REFUS {donnees['travail']} : le dossier du livrable existe déjà, rien n'est écrasé")
            shutil.rmtree(racine / "travaux" / donnees["travail"], ignore_errors=True)
            return
        if attente is not None and file_gpu is not None:
            file_gpu.ajouter(donnees)


def _depuis_etat(livrable: Path) -> float | None:
    """Début de l'attente du GPU d'après etat.json (secondes murales) ; None si le travail n'était pas en attente."""
    try:
        etat = json.loads((livrable / "etat.json").read_bytes())
        if etat.get("etat") != "en_attente_gpu":
            return None
        return datetime.fromisoformat(etat["en_attente_depuis"]).timestamp()
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def recuperer_interrompus(racine: Path, file_gpu: FileAttenteGpu | None = None) -> None:
    """Au démarrage : un dossier de travail resté en place est un travail interrompu.

    Sauf un travail (image ou vidéo) en `en_attente_gpu` : si `file_gpu` est fourni, il y reprend sa place d'attente.
    """
    for dossier in sorted((racine / "travaux").iterdir()):
        try:
            donnees = json.loads((dossier / "demande.json").read_bytes())
            if (nom_uuid_valide(dossier.name + ".json") is None
                    or not MOTIF_ENTREPRISE.fullmatch(donnees["entreprise"])):
                raise ValueError
            livrable = racine / "livrables" / donnees["entreprise"] / dossier.name
            livrable.mkdir(mode=0o750, parents=True, exist_ok=True)
            depuis = _depuis_etat(livrable)
            if (file_gpu is not None and depuis is not None and donnees.get("travail") == dossier.name
                    and file_gpu.ajouter(donnees, depuis)):
                journal(f"ATTENTE_GPU {dossier.name} reprise de la file après redémarrage")
                continue
            etat = {"travail": dossier.name, "etat": "echec", "fin": maintenant(),
                    "message": "interrompu par un redémarrage du service"}
            if _tache_de(donnees):
                etat["tache"] = _tache_de(donnees)
            ecrire_json_atomique(livrable / "etat.json", etat)
            journal(f"INTERROMPU {dossier.name} marqué en échec")
        except (OSError, ValueError, KeyError, TypeError):
            journal(f"travail orphelin {dossier.name!r} ignoré")
        shutil.rmtree(dossier, ignore_errors=True)


def boucle(racine: Path, uid_deposant: int, arret: Callable[[], bool]) -> None:
    (racine / "refuses").mkdir(mode=0o700, exist_ok=True)
    file_gpu = FileAttenteGpu()
    recuperer_interrompus(racine, file_gpu)
    journal(f"service démarré, déposant uid {uid_deposant}")
    prochaine_purge = 0.0
    while not arret():
        if horloge() >= prochaine_purge:
            prochaine_purge = horloge() + INTERVALLE_PURGE_S
            purger(racine)
        try:
            noms = lister_entrees(str(racine / "entrant"))
            if len(noms) > MAX_ENTREES_EN_ATTENTE:
                fd_entrant = os.open(racine / "entrant", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    noms = refuser_exces(racine, fd_entrant, noms)
                finally:
                    os.close(fd_entrant)
        except OSError as erreur:
            journal(f"lecture de la file impossible : {erreur.strerror}")
            noms = []
        if not noms:
            # Les travaux d'entrant passent toujours devant les vidéos qui attendent le GPU.
            if not reprendre_attentes(racine, file_gpu, arret):
                time.sleep(INTERVALLE_SCRUTATION_S)
            continue
        traiter_une_entree(racine, uid_deposant, noms[0], file_gpu, arret=arret)
    journal("service arrêté")


def main() -> int:
    brut = os.environ.get("FABRIQUE_UID_DEPOSANT", "")
    if not brut.isdigit():
        print("FABRIQUE_UID_DEPOSANT absent ou invalide", file=sys.stderr)
        return 2
    racine = Path(os.environ.get("FABRIQUE_RACINE", RACINE_ETAT))
    demande_arret = []
    signal.signal(signal.SIGTERM, lambda *_: demande_arret.append(True))
    signal.signal(signal.SIGINT, lambda *_: demande_arret.append(True))
    boucle(racine, int(brut), lambda: bool(demande_arret))
    return 0


if __name__ == "__main__":
    sys.exit(main())
