"""Tests du service de la fabrique : lecture sûre de la file, ordre, refus, essai réel dans la cage."""

import hashlib
import json
import os
import shutil
import uuid
from pathlib import Path

import pytest

from fabrique import service

UID = os.getuid()
needs_bwrap = pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap absent")


def nouveau_id():
    return str(uuid.uuid4())


def deposer(dossier, identifiant=None, **champs):
    identifiant = identifiant or nouveau_id()
    contenu = {"travail": identifiant, "entreprise": "acme", "agent": "a", "run": "r",
               "cree_le": "2026-10-24T10:00:00Z", "type": "essai", "demande": {}}
    contenu.update(champs)
    chemin = Path(dossier) / f"{identifiant}.json"
    chemin.write_text(json.dumps(contenu))
    return identifiant, chemin


@pytest.fixture(autouse=True)
def _gardes_de_test(monkeypatch):
    """La liste des entreprises appartient ici à l'utilisateur du test ; `essai` n'existe qu'injecté par les tests."""
    monkeypatch.setattr(service, "UID_PROPRIETAIRE_LISTE", UID)
    monkeypatch.setitem(service.REGISTRE, "essai", service.traiter_essai)


def ecrire_entreprises(racine, *entreprises):
    chemin = racine / "entreprises.json"
    chemin.write_text(json.dumps(list(entreprises)))
    chemin.chmod(0o640)


@pytest.fixture
def racine(tmp_path):
    for nom in ("entrant", "travaux", "livrables"):
        (tmp_path / nom).mkdir()
    ecrire_entreprises(tmp_path, "acme")
    return tmp_path


def lire(racine, nom, uid=UID):
    fd = os.open(racine / "entrant", os.O_RDONLY | os.O_DIRECTORY)
    try:
        return service.lire_entree(fd, nom, uid)
    finally:
        os.close(fd)


# ---------- lecture sûre ----------

def test_entree_valide(racine):
    ident, _ = deposer(racine / "entrant")
    assert lire(racine, f"{ident}.json")["travail"] == ident


def test_nom_non_uuid_refuse(racine):
    (racine / "entrant" / "pas-un-uuid.json").write_text("{}")
    with pytest.raises(service.Refus, match="UUID"):
        lire(racine, "pas-un-uuid.json")


def test_nom_uuid_majuscules_refuse(racine):
    ident = nouveau_id().upper()
    (racine / "entrant" / f"{ident}.json").write_text("{}")
    with pytest.raises(service.Refus):
        lire(racine, f"{ident}.json")


def test_lien_symbolique_refuse(racine, tmp_path_factory):
    secret = tmp_path_factory.mktemp("secret") / "secret.json"
    secret.write_text("{}")
    ident = nouveau_id()
    os.symlink(secret, racine / "entrant" / f"{ident}.json")
    with pytest.raises(service.Refus):
        lire(racine, f"{ident}.json")


def test_proprietaire_etranger_refuse(racine):
    ident, _ = deposer(racine / "entrant")
    with pytest.raises(service.Refus, match="propriétaire"):
        lire(racine, f"{ident}.json", uid=UID + 1)


def test_fichier_special_refuse(racine):
    ident = nouveau_id()
    os.mkfifo(racine / "entrant" / f"{ident}.json")
    with pytest.raises(service.Refus, match="régulier"):
        lire(racine, f"{ident}.json")


def test_trop_gros_refuse(racine):
    ident = nouveau_id()
    (racine / "entrant" / f"{ident}.json").write_text(" " * (service.TAILLE_MAX_ENTREE + 1))
    with pytest.raises(service.Refus, match="gros"):
        lire(racine, f"{ident}.json")


def test_json_invalide_refuse(racine):
    ident = nouveau_id()
    (racine / "entrant" / f"{ident}.json").write_text("{pas du json")
    with pytest.raises(service.Refus, match="JSON"):
        lire(racine, f"{ident}.json")


def test_travail_different_du_nom_refuse(racine):
    ident, _ = deposer(racine / "entrant", travail=nouveau_id())
    with pytest.raises(service.Refus, match="travail"):
        lire(racine, f"{ident}.json")


@pytest.mark.parametrize("entreprise", ["../x", "a/b", "", "a" * 65, "x\n", "é", None, 5])
def test_entreprise_invalide_refusee(racine, entreprise):
    ident, _ = deposer(racine / "entrant", entreprise=entreprise)
    with pytest.raises(service.Refus, match="entreprise"):
        lire(racine, f"{ident}.json")


# ---------- liste et ordre ----------

def test_fifo_par_date_de_modification(racine):
    a, pa = deposer(racine / "entrant")
    b, pb = deposer(racine / "entrant")
    os.utime(pa, (2000, 2000))
    os.utime(pb, (1000, 1000))
    assert service.lister_entrees(str(racine / "entrant")) == [f"{b}.json", f"{a}.json"]


def test_fichiers_temporaires_du_depot_ignores(racine):
    ident = nouveau_id()
    (racine / "entrant" / f".{ident}.json.{nouveau_id()}.tmp").write_text("{")
    (racine / "entrant" / f"{ident}.json.tmp").write_text("{")
    bon, _ = deposer(racine / "entrant")
    assert service.lister_entrees(str(racine / "entrant")) == [f"{bon}.json"]


# ---------- refus et traitement ----------

def test_refus_deplace_sans_suivre_le_lien(racine, tmp_path_factory):
    secret = tmp_path_factory.mktemp("secret") / "secret.json"
    secret.write_text("SECRET")
    ident = nouveau_id()
    os.symlink(secret, racine / "entrant" / f"{ident}.json")
    service.traiter_une_entree(racine, UID, f"{ident}.json")
    assert not (racine / "entrant" / f"{ident}.json").is_symlink()
    refuses = list((racine / "refuses").iterdir())
    assert len(refuses) == 1 and refuses[0].is_symlink()
    assert secret.read_text() == "SECRET"
    assert not (racine / "travaux" / ident).exists()


def test_type_inconnu_donne_echec(racine):
    ident, _ = deposer(racine / "entrant", type="inconnu")
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    etat = json.loads((racine / "livrables" / "acme" / ident / "etat.json").read_text())
    assert etat["etat"] == "echec" and "/" not in etat["message"]
    assert not (racine / "entrant" / f"{ident}.json").exists()


def test_memoire_insuffisante_attend():
    valeurs = iter([1, 1, 10**12])
    pauses = []
    assert service.attendre_memoire(lambda: next(valeurs), pauses.append) is True
    assert len(pauses) == 2


def test_memoire_arret_demande():
    assert service.attendre_memoire(lambda: 1, lambda _: None, lambda: True) is False


def test_travail_interrompu_marque_en_echec(racine):
    ident = nouveau_id()
    (racine / "travaux" / ident).mkdir()
    (racine / "travaux" / ident / "demande.json").write_text(json.dumps({"entreprise": "acme"}))
    service.recuperer_interrompus(racine)
    etat = json.loads((racine / "livrables" / "acme" / ident / "etat.json").read_text())
    assert etat["etat"] == "echec"
    assert not (racine / "travaux" / ident).exists()


@needs_bwrap
def test_essai_reel_dans_la_cage(racine):
    ident, _ = deposer(racine / "entrant")
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    livrable = racine / "livrables" / "acme" / ident
    assert json.loads((livrable / "etat.json").read_text())["etat"] == "termine"
    assert (livrable / "essai.txt").read_text() == "ok\n"
    resultat = json.loads((livrable / "resultat.json").read_text())
    assert resultat["fichiers"][0]["taille"] == 3
    assert "apercu" not in resultat
    assert (livrable / "apercu.txt").read_text() == "ok\n"


def test_apercu_tronque_a_20000_caracteres_et_hors_resultat(racine, monkeypatch):
    monkeypatch.setitem(service.REGISTRE, "essai", lambda d, t, l: {"fichiers": [], "apercu": "é" * 25_000})
    ident, _ = deposer(racine / "entrant")
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    livrable = racine / "livrables" / "acme" / ident
    assert json.loads((livrable / "etat.json").read_text())["etat"] == "termine"
    assert len((livrable / "apercu.txt").read_text(encoding="utf-8")) == 20_000
    assert "apercu" not in json.loads((livrable / "resultat.json").read_text())
    assert oct((livrable / "apercu.txt").stat().st_mode & 0o777) == "0o640"


def test_sans_apercu_aucun_fichier_apercu(racine, monkeypatch):
    monkeypatch.setitem(service.REGISTRE, "essai", lambda d, t, l: {"fichiers": []})
    ident, _ = deposer(racine / "entrant")
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    assert not (racine / "livrables" / "acme" / ident / "apercu.txt").exists()


# ---------- type document ----------

DEMANDE_DOCX = {"format": "docx", "modele": "sobre", "titre": "Essai", "langue": "fr-BE",
                "blocs": [{"type": "paragraphe", "texte": "Bonjour"}]}
needs_venv = pytest.mark.skipif(not os.path.exists(service.PYTHON_VENV), reason="venv de la fabrique absent")


def lancer_document(racine, demande=None, **champs):
    ident, _ = deposer(racine / "entrant", type="document",
                       demande=DEMANDE_DOCX if demande is None else demande, **champs)
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    livrable = racine / "livrables" / "acme" / ident
    return livrable, json.loads((livrable / "etat.json").read_text())


def faux_executer(code=0, sortie=b"", erreur=b"", delai=False, appels=None):
    def executer(etape, delai_s, **options):
        if appels is not None:
            appels.append((etape, delai_s))
        return service.cage.Resultat(code=code, duree_s=0.1, sortie=sortie, erreur=erreur, delai_depasse=delai)
    return executer


def test_document_demande_invalide_donne_le_message_de_validation(racine, monkeypatch):
    monkeypatch.setattr(service.cage, "executer", faux_executer(
        code=2, erreur="demande invalide : modele : valeur permise : sobre\n".encode()))
    livrable, etat = lancer_document(racine)
    assert etat["etat"] == "echec"
    assert etat["message"] == "demande invalide : modele : valeur permise : sobre"
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_document_erreur_interne_donne_un_message_generique_sans_fuite(racine, monkeypatch):
    monkeypatch.setattr(service.cage, "executer", faux_executer(
        code=1, erreur=b"erreur interne : KeyError : /opt/atelier-fabrique/secret"))
    _, etat = lancer_document(racine)
    assert etat["etat"] == "echec"
    assert etat["message"] == "la génération du document a échoué"
    assert "/" not in etat["message"]


def test_document_delai_de_la_cage_depasse(racine, monkeypatch):
    monkeypatch.setattr(service.cage, "executer", faux_executer(code=-9, delai=True))
    _, etat = lancer_document(racine)
    assert etat["etat"] == "echec" and "délai" in etat["message"]


def test_document_delai_global_epuise_n_appelle_pas_la_cage(racine, monkeypatch):
    appels = []
    monkeypatch.setattr(service.cage, "executer", faux_executer(appels=appels))
    monkeypatch.setattr(service, "DELAI_TOTAL_DOCUMENT_S", 0)
    _, etat = lancer_document(racine)
    assert etat["etat"] == "echec" and "délai" in etat["message"]
    assert appels == []


def test_budget_limite_chaque_etape_a_ce_qui_reste(monkeypatch):
    temps = [100.0]
    monkeypatch.setattr(service, "horloge", lambda: temps[0])
    budget = service._Budget(120)
    assert budget.pour(60) == 60
    temps[0] = 190.0  # 90 s écoulées, il reste 30 s
    assert budget.pour(60) == 30
    assert budget.pour(90, reserve_s=15) == 15
    temps[0] = 220.0
    with pytest.raises(service.Echec):
        budget.pour(60)


def test_document_delai_de_generation_plafonne_a_60_s(racine, monkeypatch):
    appels = []
    monkeypatch.setattr(service.cage, "executer", faux_executer(code=1, appels=appels))
    lancer_document(racine)
    assert appels[0][1] == 60
    assert appels[0][0].montages_modeles[0][1] == "/code"


@pytest.mark.parametrize("annonce", [b'{"fichier": "../../x"}', b'{"fichier": "document.pdf"}', b"pas du json", b"{}"])
def test_document_nom_annonce_hors_liste_refuse(racine, monkeypatch, annonce):
    monkeypatch.setattr(service.cage, "executer", faux_executer(sortie=annonce))
    livrable, etat = lancer_document(racine)
    assert etat["etat"] == "echec"
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_document_sans_objet_demande_donne_echec(racine):
    _, etat = lancer_document(racine, demande="pas un objet")
    assert etat["etat"] == "echec" and "demande invalide" in etat["message"]


@needs_bwrap
@needs_venv
def test_document_docx_reel_dans_la_cage(racine):
    livrable, etat = lancer_document(racine)
    assert etat["etat"] == "termine"
    assert sorted(p.name for p in livrable.iterdir()) == [
        "apercu.txt", "document.docx", "etat.json", "provenance.json", "resultat.json"]
    resultat = json.loads((livrable / "resultat.json").read_text())
    assert resultat["fichiers"][0]["fichier"] == "document.docx"
    provenance = json.loads((livrable / "provenance.json").read_text())
    assert provenance["sha256"] == resultat["fichiers"][0]["sha256"] and provenance["fichier"] == "document.docx"
    assert provenance["outils"]["python-docx"] != "inconnue"
    assert "Bonjour" in (livrable / "apercu.txt").read_text()


@needs_bwrap
@needs_venv
def test_document_modele_hors_liste_donne_echec_propre(racine):
    livrable, etat = lancer_document(racine, demande={**DEMANDE_DOCX, "modele": "../../x"})
    assert etat["etat"] == "echec" and etat["message"].startswith("demande invalide : demande.modele")
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


# ---------- tâche dans etat.json ----------

def test_etat_copie_la_tache_du_fichier_de_file(racine):
    ident, _ = deposer(racine / "entrant", tache="a1b2-TACHE_7")
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    etat = json.loads((racine / "livrables" / "acme" / ident / "etat.json").read_text())
    assert etat["tache"] == "a1b2-TACHE_7"


@pytest.mark.parametrize("tache", ["../x", "a b", "", 5, None, "x" * 129])
def test_etat_ignore_une_tache_douteuse(racine, tache):
    ident, _ = deposer(racine / "entrant", tache=tache)
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12)
    etat = json.loads((racine / "livrables" / "acme" / ident / "etat.json").read_text())
    assert "tache" not in etat and etat["etat"] == "termine"


# ---------- provenance des documents ----------

def test_provenance_document_au_format_de_la_porte():
    copie = {"fichier": "document.docx", "taille": 10, "sha256": "ab" * 32}
    p = service._provenance_document({"travail": nouveau_id(), "entreprise": "acme"}, "docx", copie)
    assert p["type"] == "document" and p["fichier"] == "document.docx" and p["sha256"] == copie["sha256"]
    assert p["digital_source_type"] == "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
    assert p["mention_visible"] is False and p["voix"] == [] and p["format"] == "docx"
    assert "python-docx" in p["outils"]


def test_provenance_document_pdf_cite_libreoffice():
    copie = {"fichier": "document.pdf", "taille": 10, "sha256": "cd" * 32}
    p = service._provenance_document({"travail": nouveau_id(), "entreprise": "acme"}, "pdf", copie)
    assert set(p["outils"]) == {"python-docx", "libreoffice"}


# ---------- type vidéo : faux traitements ----------

class Video:
    """Banc de test de la chaîne vidéo : chaque étape lourde est remplacée, les journaux gardent l'ordre."""

    PLANCHE = b"\x89PNG\r\n\x1a\nplanche"
    CONTROLE = {"format": "1080x1920", "sonie_lufs": -16.1, "crete_vraie_dbtp": -1.8, "debit_video_kbps": 5200,
                "alertes": ["la voix démarre à 0.8 s (visé : avant 0.5 s)"]}

    def __init__(self, racine, monkeypatch, durees_voix=(2.0, 3.0), gpu_libre=True):
        self.racine, self.journal, self.appels = racine, [], []
        self.durees_voix = iter(durees_voix)
        self.gpu_libre = gpu_libre
        self.plans, self.infos, self.references, self.formats = [], [], [], []
        monkeypatch.setattr(service.gpu, "gpu_disponible",
                            lambda *a, **k: (True, "GPU libre") if self.gpu_libre else (False, "jeu en cours : reaper"))
        monkeypatch.setattr(service.cage, "executer", self.cage)
        monkeypatch.setattr(service, "_rendre_visuel", self.visuel)
        monkeypatch.setattr(service, "_sous_titrer", self.sous_titres)
        monkeypatch.setattr(service, "_monter", self.monter)
        monkeypatch.setattr(service, "_poser_provenance", self.provenance)
        monkeypatch.setattr(service.bibliotheque_musique, "preparer_musique", self.musique)
        monkeypatch.setattr(service, "attendre_memoire", lambda **k: True)
        monkeypatch.setenv("FABRIQUE_RACINE", str(racine))

    @staticmethod
    def ecrire_wav(chemin, secondes, canaux=1):
        import wave
        with wave.open(str(chemin), "wb") as f:
            f.setnchannels(canaux)
            f.setsampwidth(2)
            f.setframerate(24000)
            f.writeframes(b"\x01\x00" * canaux * int(secondes * 24000))

    def cage(self, etape, delai_s, **options):
        self.appels.append((etape, delai_s))
        self.journal.append("voix")
        self.ecrire_wav(Path(etape.dossier_sortie) / "voix.wav", next(self.durees_voix))
        return service.cage.Resultat(0, 0.1, b'{"moteur": "chatterbox", "duree_s": 1}', b"", False)

    def visuel(self, scene, format_sortie, duree_s, dossier_travail, budget):
        self.journal.append(f"visuel:{duree_s:g}")
        clip = Path(dossier_travail) / f"clip-{len(self.journal)}.mp4"
        clip.write_bytes(b"mp4")
        return clip

    def sous_titres(self, dossier_travail, wav, reference, budget, format_sortie):
        import wave
        self.formats.append(format_sortie)
        with wave.open(str(wav), "rb") as f:
            self.journal.append(f"sous-titres:{f.getnframes() / f.getframerate():g}")
        self.references.append(reference)
        ass = Path(dossier_travail) / "faux.ass"
        ass.write_text("ass")
        return ass, "1\n00:00:00,000 --> 00:00:01,000\nBonjour\n"

    def musique(self, identifiant, dossier_entree, *a, **k):
        self.journal.append(f"musique:{identifiant}")
        (Path(dossier_entree) / "musique.flac").write_bytes(b"flac")
        return {"licence": "CC0"}

    def monter(self, dossier_travail, plan, budget):
        entree = Path(dossier_travail) / "entree"
        self.journal.append("monter")
        self.plans.append(plan)
        self.entree_au_montage = sorted(p.name for p in entree.iterdir())
        self.ass_au_montage = (entree / "sous-titres.ass").read_text()
        video = Path(dossier_travail) / "sortie"
        video.mkdir()
        (video / "video.mp4").write_bytes(b"video")
        (video / "planche.png").write_bytes(self.PLANCHE)
        (video / "controle-qualite.json").write_text(json.dumps(self.CONTROLE), encoding="utf-8")
        return video / "video.mp4"

    def provenance(self, video, plan, infos):
        self.journal.append("provenance")
        self.infos.append(infos)
        chemin = video.with_name("provenance.json")
        chemin.write_text(json.dumps({"fichier": "video.mp4"}))
        return chemin

    def lancer(self, demande=None, **champs):
        ident, _ = deposer(self.racine / "entrant", type="video", demande=demande or demande_video(), **champs)
        service.traiter_une_entree(self.racine, UID, f"{ident}.json", file_gpu=getattr(self, "file", None),
                                   lire=lambda: 10**12)
        livrable = self.racine / "livrables" / "acme" / ident
        return ident, livrable, json.loads((livrable / "etat.json").read_text())


def demande_video(**surcharge):
    base = {"format_sortie": "1080x1920", "sous_titres": True, "scenes": [
        {"texte_voix": "Premiere scene.", "voix": "synthese-chatterbox-fr",
         "visuel": {"gabarit": "titre_plein_ecran", "champs": {"titre": "Un"}}},
        {"texte_voix": "Seconde scene.", "voix": "synthese-chatterbox-fr", "duree_max": 2.5,
         "visuel": {"gabarit": "liste_3_points", "champs": {"titre": "Deux", "points": ["a", "b", "c"]}}},
    ]}
    base.update(surcharge)
    return base


def test_video_ordre_des_etapes_durees_et_livrables(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    ident, livrable, etat = banc.lancer(tache="TACHE-9")
    assert etat["etat"] == "termine" and etat["tache"] == "TACHE-9"
    # voix + 0,4 s ; la seconde scène (3,4 s) est plafonnée par duree_max (2,5 s)
    assert banc.journal == ["voix", "visuel:2.4", "voix", "visuel:2.5", "sous-titres:4.9", "monter", "provenance"]
    assert [(s.numero, s.type_visuel, s.duree_s) for s in banc.plans[0].scenes] == [(1, "mp4", 2.4), (2, "mp4", 2.5)]
    assert banc.plans[0].format_sortie == "1080x1920" and banc.plans[0].avec_musique is False
    assert banc.references == ["Premiere scene. Seconde scene."]
    assert {"scene-01.mp4", "scene-02.mp4", "voix-01.wav", "voix-02.wav", "sous-titres.ass"} <= set(banc.entree_au_montage)
    assert sorted(p.name for p in livrable.iterdir()) == [
        "apercu.txt", "controle-qualite.json", "etat.json", "planche.png", "provenance.json", "resultat.json",
        "video.mp4"]
    resultat = json.loads((livrable / "resultat.json").read_text())
    assert [f["fichier"] for f in resultat["fichiers"]] == ["video.mp4"]  # la planche ne se diffuse pas
    assert resultat["revue"] == {"fichier": "planche.png", "sha256": hashlib.sha256(banc.PLANCHE).hexdigest()}
    assert resultat["controle_qualite"] == "controle-qualite.json"
    assert json.loads((livrable / "controle-qualite.json").read_text()) == banc.CONTROLE
    apercu = (livrable / "apercu.txt").read_text()
    assert "1080x1920" in apercu and "4.9 s" in apercu and "Bonjour" in apercu
    assert "-16.1 LUFS" in apercu and "-1.8 dBTP" in apercu and "5200 kb/s" in apercu
    assert "la voix démarre à 0.8 s" in apercu
    assert banc.formats == ["1080x1920"]  # les sous-titres sont écrits à la taille de la vidéo
    assert not (racine / "travaux" / ident).exists()


def test_video_provenance_recoit_voix_outils_versions(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    banc.lancer()
    infos = banc.infos[0]
    assert infos.entreprise == "acme" and infos.voix == ("synthese-chatterbox-fr",) and infos.musique is None
    assert infos.outils["chatterbox"] == "0.1.7" and infos.outils["whisper.cpp"] and infos.outils["hyperframes"]
    assert infos.outils["resemble-perth"] == "1.0.1"


def test_video_musique_avant_montage_et_dans_la_provenance(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    _, _, etat = banc.lancer(demande=demande_video(musique="fond-calme"))
    assert etat["etat"] == "termine"
    assert banc.journal[-3:] == ["musique:fond-calme", "monter", "provenance"]
    assert banc.plans[0].avec_musique is True and "musique.flac" in banc.entree_au_montage
    assert banc.infos[0].musique == {"id": "fond-calme", "licence": "CC0"}


def test_video_musique_inconnue_donne_echec(racine, monkeypatch):
    banc = Video(racine, monkeypatch)

    def inconnue(*a, **k):
        raise service.bibliotheque_musique.ErreurImport("musique inconnue : zzz")
    monkeypatch.setattr(service.bibliotheque_musique, "preparer_musique", inconnue)
    _, _, etat = banc.lancer(demande=demande_video(musique="zzz"))
    assert etat["etat"] == "echec" and "musique" in etat["message"] and "monter" not in banc.journal


def test_video_sans_sous_titres_ecrit_un_ass_vide(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    _, livrable, etat = banc.lancer(demande=demande_video(sous_titres=False))
    assert etat["etat"] == "termine" and not any(j.startswith("sous-titres") for j in banc.journal)
    assert "sous-titres.ass" in banc.entree_au_montage
    assert "PlayResX: 1080\nPlayResY: 1920" in banc.ass_au_montage
    assert "sous-titres non demandés" in (livrable / "apercu.txt").read_text()
    assert "whisper.cpp" not in banc.infos[0].outils


@pytest.mark.parametrize("clair,attendu", [
    (True, "rendu refusé : sonie intégrée hors norme : -21.0 LUFS"),
    (False, "le montage de la vidéo a échoué"),
])
def test_video_montage_refuse_motif_clair_seulement_pour_un_rendu_hors_norme(racine, monkeypatch, clair, attendu):
    reel = service._monter  # le banc le remplace par un faux : on remet le vrai, devant un faux montage
    banc = Video(racine, monkeypatch)
    monkeypatch.setattr(service, "_monter", reel)
    monkeypatch.setattr(service.montage, "monter", lambda *a, **k: service.montage.ResultatMontage(
        False, "sonie intégrée hors norme : -21.0 LUFS (attendu -16 ± 1)" if clair else "ffmpeg en échec : /secret",
        motif_clair=clair))
    _, livrable, etat = banc.lancer()
    assert etat["etat"] == "echec" and attendu in etat["message"] and "/secret" not in etat["message"]
    assert "provenance" not in banc.journal
    assert not (livrable / "video.mp4").exists() and not (livrable / "planche.png").exists()


SCENE_SIMPLE = {"texte_voix": "x", "voix": "synthese-chatterbox-fr",
                "visuel": {"gabarit": "titre_plein_ecran", "champs": {"titre": "T"}}}


def test_video_duree_totale_superieure_a_180_s_echoue_proprement(racine, monkeypatch):
    banc = Video(racine, monkeypatch, durees_voix=(59.0,) * 4)
    _, livrable, etat = banc.lancer(demande=demande_video(scenes=[SCENE_SIMPLE] * 4))
    assert etat["etat"] == "echec" and "180" in etat["message"]
    # la 4e voix fait dépasser 180 s : aucun visuel, aucun montage ensuite
    assert banc.journal == ["voix", "visuel:59.4"] * 3 + ["voix"]
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_video_voix_trop_longue_sans_plafond_n_est_pas_coupee_en_silence(racine, monkeypatch):
    banc = Video(racine, monkeypatch, durees_voix=(75.0,))
    _, _, etat = banc.lancer(demande=demande_video(scenes=[SCENE_SIMPLE]))
    assert etat["etat"] == "echec" and "dépasse 60 s" in etat["message"] and "monter" not in banc.journal


def test_video_voix_plafonnee_par_duree_max_demandee(racine, monkeypatch):
    banc = Video(racine, monkeypatch, durees_voix=(75.0,))
    scene = {**SCENE_SIMPLE, "duree_max": 10}
    _, _, etat = banc.lancer(demande=demande_video(scenes=[scene], sous_titres=False))
    assert etat["etat"] == "termine" and banc.journal[1] == "visuel:10"


def test_video_budget_30_min_plafonne_chaque_etape_de_cage(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    monkeypatch.setattr(service, "DELAI_TOTAL_VIDEO_S", 500)
    _, _, etat = banc.lancer()
    assert etat["etat"] == "termine" and 400 < banc.appels[0][1] <= 500  # DELAI_VOIX_S (900) ramené au budget


def test_video_budget_par_defaut_30_min():
    assert service.DELAI_TOTAL_VIDEO_S == 1800 and service.DUREE_MAX_VIDEO_S == 180


def test_video_budget_epuise_n_appelle_aucune_etape(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    monkeypatch.setattr(service, "DELAI_TOTAL_VIDEO_S", 0)
    _, _, etat = banc.lancer()
    assert etat["etat"] == "echec" and "30 min" in etat["message"] and banc.journal == []


def test_video_voix_cage_gpu_avec_entreprise_du_travail_et_montages(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    ecrire_entreprises(racine, "acme", "autre-client")
    ident, _ = deposer(racine / "entrant", type="video", demande=demande_video(), entreprise="autre-client")
    suivants = []
    original = banc.cage

    def espion(etape, delai_s, **options):
        suivants.append((etape, json.loads((Path(etape.dossier_entree) / "demande.json").read_text()), options))
        return original(etape, delai_s, **options)
    monkeypatch.setattr(service.cage, "executer", espion)
    service.traiter_une_entree(racine, UID, f"{ident}.json")
    etape, voix, options = suivants[0]
    assert etape.type == "gpu" and etape.hors_ligne and etape.arguments[:2] == ("-I", "/entree/code/voix.py")
    assert voix == {"texte": "Premiere scene.", "langue": "fr", "voix": "synthese-chatterbox-fr",
                    "entreprise": "autre-client"}
    cibles = {cible for _, cible in etape.montages_modeles}
    assert cibles == {"/modeles/chatterbox", "/modeles/kokoro", "/voix-autorisees"}
    assert options["fsize_octets"] == 200 * 1024**2


@pytest.mark.parametrize("code, attendu", [(3, "voix refusée : voix inconnue : x"), (4, "la synthèse vocale a échoué"),
                                           (2, "la synthèse vocale a échoué")])
def test_video_echec_de_la_cage_voix(racine, monkeypatch, code, attendu):
    banc = Video(racine, monkeypatch)
    monkeypatch.setattr(service.cage, "executer", faux_executer(
        code=code, erreur="voix refusée : voix inconnue : x\n".encode()))
    _, livrable, etat = banc.lancer()
    assert etat["etat"] == "echec" and etat["message"] == attendu
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_video_voix_refusee_ne_laisse_pas_fuiter_un_chemin(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    monkeypatch.setattr(service.cage, "executer", faux_executer(
        code=3, erreur="voix refusée : registre introuvable : /voix-autorisees/registre.json\n".encode()))
    _, _, etat = banc.lancer()
    assert etat["message"] == "voix refusée"


def test_video_wav_stereo_refuse(racine, monkeypatch):
    banc = Video(racine, monkeypatch)

    def stereo(etape, delai_s, **options):
        Video.ecrire_wav(Path(etape.dossier_sortie) / "voix.wav", 1.0, canaux=2)
        return service.cage.Resultat(0, 0.1, b"{}", b"", False)
    monkeypatch.setattr(service.cage, "executer", stereo)
    _, _, etat = banc.lancer()
    assert etat["etat"] == "echec" and "format" in etat["message"]


@pytest.mark.parametrize("modif", [
    {"scenes": [{**SCENE_SIMPLE, "voix": "../x"}]},
    {"scenes": [{**SCENE_SIMPLE, "visuel": {"gabarit": "../../x", "champs": {"titre": "T"}}}]},
    {"scenes": [{**SCENE_SIMPLE, "echantillon": "voix.wav"}]},
    {"scenes": [{**SCENE_SIMPLE, "entreprise": "autre"}]},
    {"entreprise": "autre"},
    {"echantillon": "/home/x/voix.wav"},
])
def test_video_evasion_refusee_sans_rien_lancer(racine, monkeypatch, modif):
    banc = Video(racine, monkeypatch)
    _, livrable, etat = banc.lancer(demande=demande_video(**modif))
    assert etat["etat"] == "echec" and etat["message"].startswith("demande invalide")
    assert banc.journal == [] and sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


# ---------- GPU partagé : remise en attente ----------

def test_video_gpu_occupe_est_remise_en_attente_sans_occuper_la_file(racine, monkeypatch):
    banc = Video(racine, monkeypatch, gpu_libre=False)
    banc.file = service.FileAttenteGpu()
    ident, livrable, etat = banc.lancer(tache="T-1")
    assert etat["etat"] == "en_attente_gpu" and etat["raison"] == "jeu en cours : reaper" and etat["tache"] == "T-1"
    assert "en_attente_depuis" in etat and "fin" not in etat
    assert banc.journal == [] and len(banc.file) == 1
    assert [p.name for p in (racine / "travaux" / ident).iterdir()] == ["demande.json"]
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_video_gpu_perdu_en_cours_de_route_repart_de_zero_a_la_reprise(racine, monkeypatch):
    banc = Video(racine, monkeypatch, durees_voix=(2.0, 2.0, 2.0))
    banc.file = service.FileAttenteGpu()
    reponses = iter([(True, "libre"), (False, "jeu en cours : reaper")])
    monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: next(reponses, (True, "libre")))
    ident, _, etat = banc.lancer()
    assert etat["etat"] == "en_attente_gpu" and banc.journal == ["voix", "visuel:2.4"]
    assert [p.name for p in (racine / "travaux" / ident).iterdir()] == ["demande.json"]
    assert service.reprendre_attentes(racine, banc.file, lambda: False) is True
    etat = json.loads((racine / "livrables" / "acme" / ident / "etat.json").read_text())
    assert etat["etat"] == "termine" and len(banc.file) == 0


def test_documents_passent_devant_la_video_en_attente_puis_la_video_reprend(racine, monkeypatch):
    banc = Video(racine, monkeypatch, gpu_libre=False)
    ordre = []

    def faux_document(donnees, travail, livrable):
        ordre.append("document")
        banc.gpu_libre = True  # le jeu s'arrête pendant le document
        return {"fichiers": []}
    monkeypatch.setitem(service.REGISTRE, "document", faux_document)
    video, _ = deposer(racine / "entrant", type="video", demande=demande_video())
    os.utime(racine / "entrant" / f"{video}.json", (1, 1))  # la vidéo est la plus ancienne
    document, _ = deposer(racine / "entrant", type="document", demande={})
    monkeypatch.setattr(service.time, "sleep", lambda s: None)
    tours = []

    def arret():
        tours.append(1)
        etat = racine / "livrables" / "acme" / video / "etat.json"
        return etat.exists() and json.loads(etat.read_text())["etat"] == "termine" or len(tours) > 40
    service.boucle(racine, UID, arret)
    etat_video = json.loads((racine / "livrables" / "acme" / video / "etat.json").read_text())
    etat_document = json.loads((racine / "livrables" / "acme" / document / "etat.json").read_text())
    assert etat_document["etat"] == "termine" and etat_video["etat"] == "termine"
    assert ordre == ["document"] and banc.journal[0] == "voix"  # la voix n'a démarré qu'après le document


def test_video_abandonnee_apres_12_h_d_attente(racine, monkeypatch):
    banc = Video(racine, monkeypatch, gpu_libre=False)
    banc.file = service.FileAttenteGpu()
    temps = [1_000_000.0]
    monkeypatch.setattr(service, "horloge_murale", lambda: temps[0])
    ident, livrable, _ = banc.lancer(tache="T-2")
    temps[0] += 12 * 3600 - 1  # presque 12 h : toujours en attente
    assert service.reprendre_attentes(racine, banc.file, lambda: False) is False
    assert len(banc.file) == 1
    temps[0] += 2  # plus de 12 h
    assert service.reprendre_attentes(racine, banc.file, lambda: False) is False
    etat = json.loads((livrable / "etat.json").read_text())
    assert etat["etat"] == "echec" and etat["message"] == "carte graphique occupée trop longtemps"
    assert etat["tache"] == "T-2" and len(banc.file) == 0 and not (racine / "travaux" / ident).exists()


def test_gpu_n_est_releve_qu_a_intervalle_regulier(racine, monkeypatch):
    banc = Video(racine, monkeypatch, gpu_libre=False)
    banc.file = service.FileAttenteGpu()
    banc.lancer()
    releves = []
    monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: releves.append(1) or (False, "occupé"))
    temps = [100.0]
    monkeypatch.setattr(service, "horloge", lambda: temps[0])
    for _ in range(5):
        service.reprendre_attentes(racine, banc.file, lambda: False)
    assert len(releves) == 1
    temps[0] += service.INTERVALLE_GPU_S + 1
    service.reprendre_attentes(racine, banc.file, lambda: False)
    assert len(releves) == 2


def test_redemarrage_remet_la_video_en_attente_dans_la_file(racine, monkeypatch):
    banc = Video(racine, monkeypatch, gpu_libre=False)
    banc.file = service.FileAttenteGpu()
    ident, _, _ = banc.lancer()
    # autre travail interrompu en cours d'exécution (pas en attente) : marqué en échec
    autre = nouveau_id()
    (racine / "travaux" / autre).mkdir()
    (racine / "travaux" / autre / "demande.json").write_text(json.dumps(
        {"travail": autre, "entreprise": "acme", "type": "essai"}))
    neuve = service.FileAttenteGpu()
    service.recuperer_interrompus(racine, neuve)
    assert [d["travail"] for d, _ in neuve.travaux] == [ident] and (racine / "travaux" / ident).exists()
    etat = json.loads((racine / "livrables" / "acme" / autre / "etat.json").read_text())
    assert etat["etat"] == "echec" and "redémarrage" in etat["message"]


def test_redemarrage_sans_file_marque_tout_en_echec(racine, monkeypatch):
    banc = Video(racine, monkeypatch, gpu_libre=False)
    banc.file = service.FileAttenteGpu()
    ident, livrable, _ = banc.lancer()
    service.recuperer_interrompus(racine)
    assert json.loads((livrable / "etat.json").read_text())["etat"] == "echec"
    assert not (racine / "travaux" / ident).exists()


# ---------- défense en profondeur côté service (E1, C1, M1, F1, F3) ----------

def traiter(racine, ident, **options):
    service.traiter_une_entree(racine, UID, f"{ident}.json", lire=lambda: 10**12, **options)


def refus_du_journal(racine):
    return sorted((racine / "refuses").iterdir()) if (racine / "refuses").exists() else []


def test_rejeu_d_un_uuid_refuse_apres_la_fin_du_travail(racine):
    ident, _ = deposer(racine / "entrant", type="inconnu")
    traiter(racine, ident)
    assert not (racine / "travaux" / ident).exists()  # le dossier de travail est supprimé en fin de travail
    etat = (racine / "livrables" / "acme" / ident / "etat.json").read_text()
    deposer(racine / "entrant", identifiant=ident, type="inconnu")
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1
    assert (racine / "livrables" / "acme" / ident / "etat.json").read_text() == etat


def test_rejeu_refuse_meme_si_le_livrable_a_ete_purge(racine):
    ident, _ = deposer(racine / "entrant", type="inconnu")
    traiter(racine, ident)
    shutil.rmtree(racine / "livrables" / "acme" / ident)
    assert (racine / "uuid-vus.log").read_text().split() == [ident]  # registre append-only
    deposer(racine / "entrant", identifiant=ident, type="inconnu")
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1 and not (racine / "livrables" / "acme" / ident).exists()


def test_rejeu_refuse_si_le_livrable_existe_chez_une_autre_entreprise(racine):
    ident = nouveau_id()
    (racine / "livrables" / "autre" / ident).mkdir(parents=True)
    deposer(racine / "entrant", identifiant=ident, type="inconnu")
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1 and not (racine / "livrables" / "acme").exists()


def test_dossier_livrable_existant_donne_un_echec_franc_sans_rien_ecraser(racine):
    ident = nouveau_id()
    livrable = racine / "livrables" / "acme" / ident
    livrable.mkdir(parents=True)
    (livrable / "etat.json").write_text("ORIGINAL")
    with pytest.raises(FileExistsError):
        service.executer_travail(racine, {"travail": ident, "entreprise": "acme", "type": "inconnu"})
    assert (livrable / "etat.json").read_text() == "ORIGINAL"


def test_dossier_livrable_existant_n_arrete_pas_le_service(racine, monkeypatch):
    ident, _ = deposer(racine / "entrant", type="inconnu")
    livrable = racine / "livrables" / "acme" / ident
    livrable.mkdir(parents=True)
    (livrable / "etat.json").write_text("ORIGINAL")
    monkeypatch.setattr(service, "uuid_deja_vu", lambda *_: None)  # contourne la garde amont : reste la garde du mkdir
    traiter(racine, ident)
    assert (livrable / "etat.json").read_text() == "ORIGINAL" and not (racine / "travaux" / ident).exists()


def test_entreprise_inconnue_refusee(racine):
    ident, _ = deposer(racine / "entrant", type="inconnu", entreprise="intruse")
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1 and not (racine / "livrables" / "intruse").exists()
    assert not (racine / "uuid-vus.log").exists()


@pytest.mark.parametrize("prepare", ["absente", "illisible", "mauvais_proprietaire", "modifiable"])
def test_liste_des_entreprises_defaillante_refuse_tout(racine, monkeypatch, prepare):
    chemin = racine / "entreprises.json"
    if prepare == "absente":
        chemin.unlink()
    elif prepare == "illisible":
        chemin.write_text("pas du json")
    elif prepare == "mauvais_proprietaire":
        monkeypatch.setattr(service, "UID_PROPRIETAIRE_LISTE", UID + 1)
    else:
        chemin.chmod(0o666)
    assert service.entreprises_autorisees(racine) == frozenset()
    ident, _ = deposer(racine / "entrant", type="inconnu")
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1


def test_51e_travail_du_jour_refuse_et_le_compteur_persiste(racine):
    for _ in range(service.QUOTA_TRAVAUX_PAR_JOUR):
        ident, _ = deposer(racine / "entrant", type="inconnu")
        traiter(racine, ident)
    assert refus_du_journal(racine) == []
    ident, _ = deposer(racine / "entrant", type="inconnu")
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1 and not (racine / "livrables" / "acme" / ident).exists()
    compteur = json.loads((racine / "quotas.json").read_text())["acme"]
    assert compteur["travaux"] == 50  # relu depuis le fichier : persistant entre deux passages


def test_quota_remis_a_zero_le_lendemain(racine, monkeypatch):
    for _ in range(service.QUOTA_TRAVAUX_PAR_JOUR):
        service.compter_travail(racine, "acme", "document")
    assert service.verifier_quota(racine, "acme", "document")
    monkeypatch.setattr(service, "horloge_murale", lambda: time_reel() + 86400)
    assert service.verifier_quota(racine, "acme", "document") is None
    assert service.verifier_quota(racine, "autre", "video") is None


def time_reel():
    import time
    return time.time()


def test_11e_video_du_jour_refusee_mais_un_document_passe(racine):
    for _ in range(service.QUOTA_VIDEOS_PAR_JOUR):
        service.compter_travail(racine, "acme", "video")
    assert "vidéos" in service.verifier_quota(racine, "acme", "video")
    assert service.verifier_quota(racine, "acme", "document") is None
    ident, _ = deposer(racine / "entrant", type="video", demande={})
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1 and not (racine / "livrables" / "acme" / ident).exists()


def test_plafond_d_entrees_en_attente_refuse_l_exces_les_plus_recents(racine, monkeypatch):
    monkeypatch.setattr(service, "MAX_ENTREES_EN_ATTENTE", 3)
    monkeypatch.setattr(service, "REFUS_EXCES_PAR_PASSAGE", 2)
    idents = []
    for rang in range(8):
        ident, chemin = deposer(racine / "entrant", type="inconnu")
        os.utime(chemin, (1000 + rang, 1000 + rang))
        idents.append(ident)
    noms = service.lister_entrees(str(racine / "entrant"), plafond=5)  # lecture plafonnée à 3 + 2
    assert len(noms) == 5 and set(noms) <= {f"{i}.json" for i in idents}
    fd = os.open(racine / "entrant", os.O_RDONLY | os.O_DIRECTORY)
    try:
        gardees = service.refuser_exces(racine, fd, noms)
    finally:
        os.close(fd)
    assert gardees == noms[:3]
    assert len(refus_du_journal(racine)) == 2
    restant = {p.name for p in (racine / "entrant").iterdir()}
    assert len(restant) == 6 and restant.isdisjoint(noms[3:])


def test_file_gpu_pleine_refuse_la_video_a_l_entree(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    banc.file = service.FileAttenteGpu()
    for _ in range(service.TAILLE_MAX_FILE_GPU):
        assert banc.file.ajouter({"travail": nouveau_id()}) is True
    assert banc.file.ajouter({"travail": nouveau_id()}) is False and len(banc.file) == 20
    ident, _ = deposer(racine / "entrant", type="video", demande=demande_video())
    traiter(racine, ident, file_gpu=banc.file)
    assert len(refus_du_journal(racine)) == 1 and banc.journal == []
    # un document n'attend pas le GPU : il passe malgré la file pleine
    ident, _ = deposer(racine / "entrant", type="inconnu")
    traiter(racine, ident, file_gpu=banc.file)
    assert (racine / "livrables" / "acme" / ident / "etat.json").exists()


def test_purge_refuses_apres_7_jours_et_livrables_apres_30_jours(racine, monkeypatch):
    maintenant = time_reel()
    refuses = racine / "refuses"
    refuses.mkdir()
    vieux = refuses / f"{int(maintenant) - 8 * 86400}-aaaa.refuse"
    recent = refuses / f"{int(maintenant) - 6 * 86400}-bbbb.refuse"
    vieux.write_text("x")
    recent.write_text("x")
    ancien, jeune, en_attente = nouveau_id(), nouveau_id(), nouveau_id()
    for ident, age in ((ancien, 31), (jeune, 29), (en_attente, 31)):
        dossier = racine / "livrables" / "acme" / ident
        dossier.mkdir(parents=True)
        (dossier / "etat.json").write_text("{}")
        os.utime(dossier, (maintenant - age * 86400,) * 2)
    (racine / "travaux" / en_attente).mkdir()  # vidéo toujours en cours : jamais purgée
    service.purger(racine)
    assert not vieux.exists() and recent.exists()
    assert not (racine / "livrables" / "acme" / ancien).exists()
    assert (racine / "livrables" / "acme" / jeune).exists() and (racine / "livrables" / "acme" / en_attente).exists()
    assert service.RETENTION_LIVRABLES_S == 30 * 86400 and service.RETENTION_REFUSES_S == 7 * 86400


def test_le_type_essai_n_est_pas_dans_le_registre_de_production():
    import subprocess
    import sys
    sortie = subprocess.run(
        [sys.executable, "-c", "from fabrique import service; print(sorted(service.REGISTRE))"],
        capture_output=True, text=True, cwd=Path(service.__file__).resolve().parent.parent,
        )
    assert sortie.returncode == 0, sortie.stderr
    assert sortie.stdout.strip() == "['document', 'image', 'video']"


def test_la_voix_reverifie_le_gpu_avant_chaque_scene(racine, monkeypatch):
    banc = Video(racine, monkeypatch)
    verifications = []
    monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: verifications.append(1) or (True, "libre"))
    banc.lancer()
    assert len(verifications) == 2  # une vérification par scène (deux scènes)


# ---------- type image (lot I1) ----------

CHARTE_IMAGE = {"id": "ma-charte", "couleurs": {"fond": "#f4f1ea", "texte": "#1c1b19", "accent": "#8a3b12"},
                "police": "dejavu-sans"}
DEMANDE_IMAGE = {"format": "1080x1080", "gabarit": "accroche", "charte": "ma-charte",
                 "champs": {"titre": "Une saison de lancement", "sous_titre": "Tout ce qu'il faut savoir"}}


@pytest.fixture(autouse=True)
def _racine_des_chartes(request, monkeypatch):
    """Les tests d'image lisent le registre des chartes sous FABRIQUE_RACINE : celle de la fixture `racine`."""
    if "racine" in request.fixturenames and "image" in request.node.name:
        monkeypatch.setenv("FABRIQUE_RACINE", str(request.getfixturevalue("racine")))


def poser_charte(racine, entreprise="acme", contenu=CHARTE_IMAGE):
    dossier = racine / "chartes-autorisees" / entreprise
    dossier.mkdir(parents=True, exist_ok=True)
    fichier = dossier / f"{contenu['id']}.json"
    fichier.write_text(json.dumps(contenu), encoding="utf-8")
    fichier.chmod(0o640)


def lancer_image(racine, demande=DEMANDE_IMAGE, **champs):
    ident, _ = deposer(racine / "entrant", type="image", demande=demande, **champs)
    traiter(racine, ident)
    livrable = racine / "livrables" / "acme" / ident
    return ident, livrable, json.loads((livrable / "etat.json").read_text())


def test_le_type_image_est_au_registre_de_production():
    assert service.REGISTRE["image"] is service.traiter_image


class BancImage:
    """Remplace le rendu (Chrome en cage) et la provenance (exiftool en cage) : seul l'enchaînement est testé."""

    def __init__(self, racine, monkeypatch):
        self.racine, self.journal, self.infos, self.budgets = racine, [], [], []
        monkeypatch.setattr(service.images, "rendre_image", self.rendre)
        monkeypatch.setattr(service, "_poser_provenance_image", self.provenance)
        self.resultat = None
        poser_charte(racine)

    def rendre(self, dossier_travail, gabarit, champs, format_sortie, charte, *, mention=False, temoin=False):
        self.journal.append(f"rendu:{gabarit}:{format_sortie}:{charte.id}")
        self.budgets.append((service.images.DELAI_IMAGE_S, mention, temoin))
        if self.resultat is not None:
            return self.resultat
        dossier = Path(dossier_travail) / "image-xxxx"
        dossier.mkdir()
        (dossier / "image.png").write_bytes(b"png")
        return service.images.Resultat(True, "", dossier / "image.png", "", 0.5, 1080, 1080, 3, "0" * 64)

    def provenance(self, image, infos):
        self.journal.append("provenance")
        self.infos.append(infos)
        image.write_bytes(b"png+xmp")  # la provenance remplace l'image : la copie vers le livrable vient après
        chemin = image.with_name("provenance.json")
        chemin.write_text(json.dumps({"fichier": "image.png"}))
        return chemin


def test_image_ordre_des_etapes_provenance_avant_copie_et_livrables(racine, monkeypatch):
    banc = BancImage(racine, monkeypatch)
    ident, livrable, etat = lancer_image(racine, tache="TACHE-4")
    assert etat["etat"] == "termine" and etat["tache"] == "TACHE-4"
    assert banc.journal == ["rendu:accroche:1080x1080:ma-charte", "provenance"]
    assert sorted(p.name for p in livrable.iterdir()) == ["apercu.txt", "etat.json", "image.png", "provenance.json", "resultat.json"]
    assert (livrable / "image.png").read_bytes() == b"png+xmp"  # c'est l'image portant le XMP qui est livrée
    resultat = json.loads((livrable / "resultat.json").read_text())
    assert [(f["fichier"], f["taille"]) for f in resultat["fichiers"]] == [("image.png", 7)]
    apercu = (livrable / "apercu.txt").read_text()
    assert "1080x1080" in apercu and "accroche" in apercu and "ma-charte" in apercu and "fond IA : non" in apercu
    assert resultat["fichiers"][0]["sha256"] in apercu
    assert not (racine / "travaux" / ident).exists()


def test_image_provenance_recoit_les_infos_de_la_fabrique_seule(racine, monkeypatch):
    banc = BancImage(racine, monkeypatch)
    ident, _, _ = lancer_image(racine)
    infos = banc.infos[0]
    assert (infos.travail, infos.entreprise, infos.gabarit, infos.format, infos.charte) == (
        ident, "acme", "accroche", "1080x1080", "ma-charte")
    assert infos.fond_ia is False and infos.mention_visible is service.MENTION_VISIBLE_IMAGE
    assert infos.outils == {"chrome-headless-shell": service.images.VERSION_CHROME}


def test_image_budget_de_5_minutes(racine, monkeypatch):
    banc = BancImage(racine, monkeypatch)
    lancer_image(racine)
    assert service.DELAI_TOTAL_IMAGE_S == 300
    # le délai de la cage est plafonné par ce qu'il reste du budget, la mention suit la configuration, jamais le témoin
    assert banc.budgets[0] == (service.images.DELAI_IMAGE_S, service.MENTION_VISIBLE_IMAGE, False)
    assert service.images.DELAI_IMAGE_S == 120  # remis à sa valeur après le travail


@pytest.mark.parametrize("modif,motif", [
    ({"gabarit": "../accroche"}, "gabarit inconnu"),
    ({"gabarit": "video"}, "gabarit inconnu"),
    ({"format": "1200x627"}, "format inconnu"),
    ({"format": "1440x2560"}, "format inconnu"),
    ({"champs": {"titre": "x", "chiffre": "1"}}, "champs inconnus"),
    ({"champs": {}}, "champs manquants"),
    ({"champs": {"titre": "W" * 91}}, "titre"),
    ({"fond_ia": {"sujet": "une prairie"}}, "fond_ia"),  # refusé tant que le lot I2 n'existe pas
    ({"couleur": "#ff0000"}, "couleur"),
    ({"charte": None}, "charte"),
])
def test_image_demande_invalide_ne_lance_rien(racine, monkeypatch, modif, motif):
    banc = BancImage(racine, monkeypatch)
    demande = {**DEMANDE_IMAGE, **modif}
    if modif.get("charte", 1) is None:
        demande.pop("charte")
    _, livrable, etat = lancer_image(racine, demande=demande)
    assert etat["etat"] == "echec" and etat["message"].startswith("demande invalide") and motif in etat["message"]
    assert banc.journal == [] and sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_image_demande_qui_n_est_pas_un_objet(racine, monkeypatch):
    BancImage(racine, monkeypatch)
    _, _, etat = lancer_image(racine, demande=["pas", "un", "objet"])
    assert etat["etat"] == "echec" and etat["message"].startswith("demande invalide")


@pytest.mark.parametrize("charte", ["autre", "ma-charte-expiree", "../ma-charte", "MA-CHARTE"])
def test_image_charte_hors_registre_refusee_sans_fuite_de_chemin(racine, monkeypatch, charte):
    banc = BancImage(racine, monkeypatch)
    _, livrable, etat = lancer_image(racine, demande={**DEMANDE_IMAGE, "charte": charte})
    assert etat["etat"] == "echec" and etat["message"].startswith("charte refusée") and "/" not in etat["message"]
    assert banc.journal == [] and sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_image_charte_d_une_autre_entreprise_refusee(racine, monkeypatch):
    banc = BancImage(racine, monkeypatch)
    poser_charte(racine, entreprise="autre", contenu={**CHARTE_IMAGE, "id": "chez-l-autre"})
    _, _, etat = lancer_image(racine, demande={**DEMANDE_IMAGE, "charte": "chez-l-autre"})
    assert etat["etat"] == "echec" and etat["message"].startswith("charte refusée") and banc.journal == []


def test_image_le_registre_des_chartes_est_lu_avec_le_proprietaire_attendu(racine, monkeypatch):
    BancImage(racine, monkeypatch)
    vus = []
    reel = service.registre_charte.resoudre
    monkeypatch.setattr(service.registre_charte, "resoudre", lambda *a, **k: vus.append((a, k)) or reel(*a, **k))
    lancer_image(racine)
    (args, options), = vus
    assert args == ("ma-charte", "acme", racine / "chartes-autorisees") and options == {"uid_proprietaire": UID}


@pytest.mark.parametrize("motif,attendu", [
    ("délai dépassé", "délai dépassé pendant le rendu de l'image"),
    ("Chrome a échoué (code 4) : /opt/atelier-fabrique/chrome/x", "le rendu de l'image a échoué"),
    ("PNG refusé : dimensions 1x1 au lieu de 1080x1080", "le rendu de l'image a échoué"),
])
def test_image_rendu_en_echec_message_court_sans_chemin(racine, monkeypatch, motif, attendu):
    banc = BancImage(racine, monkeypatch)
    banc.resultat = service.images.Resultat(False, motif, journal="détail interne")
    _, livrable, etat = lancer_image(racine)
    assert etat["etat"] == "echec" and etat["message"] == attendu and "/" not in etat["message"]
    assert banc.journal == ["rendu:accroche:1080x1080:ma-charte"] and sorted(p.name for p in livrable.iterdir()) == ["etat.json"]


def test_image_provenance_en_echec_ne_livre_rien(racine, monkeypatch):
    banc = BancImage(racine, monkeypatch)

    def refuse(image, infos):
        raise service.Echec("la provenance IA n'a pas pu être posée (vérification en échec)")

    monkeypatch.setattr(service, "_poser_provenance_image", refuse)
    _, livrable, etat = lancer_image(racine)
    assert etat["etat"] == "echec" and "provenance" in etat["message"]
    assert sorted(p.name for p in livrable.iterdir()) == ["etat.json"] and banc.journal[0].startswith("rendu")


def test_quota_images_du_jour_refuse_la_suivante_mais_un_document_passe(racine):
    for _ in range(service.QUOTA_IMAGES_PAR_JOUR):
        service.compter_travail(racine, "acme", "image")
    assert "images" in service.verifier_quota(racine, "acme", "image")
    assert service.verifier_quota(racine, "acme", "document") is None
    assert service.verifier_quota(racine, "acme", "video") is None
    assert service.verifier_quota(racine, "autre", "image") is None
    ident, _ = deposer(racine / "entrant", type="image", demande=DEMANDE_IMAGE)
    traiter(racine, ident)
    assert len(refus_du_journal(racine)) == 1 and not (racine / "livrables" / "acme" / ident).exists()
    compteur = json.loads((racine / "quotas.json").read_text())["acme"]
    assert compteur["images"] == service.QUOTA_IMAGES_PAR_JOUR and compteur["travaux"] == service.QUOTA_IMAGES_PAR_JOUR


def test_une_image_ne_compte_ni_comme_video_ni_n_attend_le_gpu(racine, monkeypatch):
    BancImage(racine, monkeypatch)
    service.compter_travail(racine, "acme", "image")
    compteur = json.loads((racine / "quotas.json").read_text())["acme"]
    assert compteur["videos"] == 0 and compteur["images"] == 1
    monkeypatch.setattr(service.gpu, "gpu_disponible", lambda *a, **k: (False, "occupé"))  # sans effet sur une image
    _, _, etat = lancer_image(racine)
    assert etat["etat"] == "termine"


@needs_bwrap
@pytest.mark.skipif(shutil.which("exiftool") is None or not Path(service.images.CHROME).is_file(),
                    reason="exiftool ou chrome-headless-shell de la fabrique absents")
def test_image_reelle_dans_la_cage_avec_provenance(racine):
    poser_charte(racine)
    ident, livrable, etat = lancer_image(racine)
    assert etat["etat"] == "termine", etat
    assert sorted(p.name for p in livrable.iterdir()) == ["apercu.txt", "etat.json", "image.png", "provenance.json", "resultat.json"]
    donnees = (livrable / "image.png").read_bytes()
    assert donnees[:8] == b"\x89PNG\r\n\x1a\n" and int.from_bytes(donnees[16:20], "big") == 1080 == int.from_bytes(donnees[20:24], "big")
    resultat = json.loads((livrable / "resultat.json").read_text())
    provenance = json.loads((livrable / "provenance.json").read_text())
    empreinte = hashlib.sha256(donnees).hexdigest()
    assert resultat["fichiers"][0]["sha256"] == provenance["sha256"] == empreinte
    assert (provenance["type"], provenance["fichier"], provenance["fond_ia"], provenance["entreprise"], provenance["travail"]) == (
        "image", "image.png", False, "acme", ident)
    relecture = racine / "relu"
    relecture.mkdir()
    assert service.provenance.lire_xmp(livrable / "image.png", relecture)["DigitalSourceType"] == service.provenance.DIGITAL_SOURCE_TYPE
