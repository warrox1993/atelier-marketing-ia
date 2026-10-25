"""Tests de la synthèse vocale (lot 7) : cage GPU réelle, registre des voix, filigrane PerTh, GPU partagé.

Prérequis : `sudo scripts/installer-fabrique-voix.sh` (venv, poids, registre). Les poids sont lisibles par
le groupe atelier-fabrique : lancer sous ce groupe tant que la session de l'opérateur ne l'a pas reçu,
par exemple `sg atelier-fabrique -c "pytest fabrique/tests/test_voix.py -q"`.
"""

import datetime
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import threading
import wave
from pathlib import Path

import pytest

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT))
from fabrique import gpu  # noqa: E402
from fabrique.cage import Etape, executer  # noqa: E402

VENV_VOIX = Path("/opt/atelier-fabrique/venv-voix")
PYTHON_VOIX = VENV_VOIX / "bin" / "python"
DONNEES = Path("/var/lib/atelier-fabrique")
REGISTRE_REEL = DONNEES / "voix-autorisees"
MODELES = json.loads((DEPOT / "fabrique" / "modeles.json").read_text(encoding="utf-8"))["modeles"]
DOSSIERS_MODELES = {m["nom"]: DONNEES / "modeles" / f"{m['nom']}@{m['revision']}" for m in MODELES}
VOIX_PY = DEPOT / "fabrique" / "generateurs" / "voix.py"
REGISTRE_PY = DEPOT / "fabrique" / "registre_voix.py"
PERTH_PY = DEPOT / "fabrique" / "perth.py"

if not PYTHON_VOIX.exists():
    pytest.skip("environnement voix absent : lancer sudo scripts/installer-fabrique-voix.sh",
                allow_module_level=True)
if not (DOSSIERS_MODELES["chatterbox"] / "ve.pt").is_file():
    pytest.skip("poids illisibles : installer-fabrique-voix.sh, puis sg atelier-fabrique -c 'pytest ...'",
                allow_module_level=True)

TEXTE = ("Bonjour, ceci est un essai de synthèse vocale en français. "
         "La fabrique de l'atelier produit une voix claire.")
EXPIRATION_LOINTAINE = "2099-12-31"


def charger_module(chemin: Path, nom: str):
    avant = dict(os.environ)  # voix.py pose des variables d'environnement à l'import
    try:
        spec = importlib.util.spec_from_file_location(nom, chemin)
        module = importlib.util.module_from_spec(spec)
        sys.modules[nom] = module
        spec.loader.exec_module(module)
    finally:
        os.environ.clear()
        os.environ.update(avant)
    return module


registre_voix = charger_module(REGISTRE_PY, "registre_voix")
VoixRefusee = registre_voix.VoixRefusee


def preparer(tmp_path: Path, demande: dict | str) -> tuple[Path, Path]:
    """Dossiers d'entrée (code + demande) et de sortie d'un travail de voix."""
    entree, sortie = tmp_path / "entree", tmp_path / "sortie"
    (entree / "code").mkdir(parents=True)
    sortie.mkdir()
    shutil.copy(VOIX_PY, entree / "code" / "voix.py")
    shutil.copy(REGISTRE_PY, entree / "code" / "registre_voix.py")
    texte = demande if isinstance(demande, str) else json.dumps(demande)
    (entree / "demande.json").write_text(texte, encoding="utf-8")
    return entree, sortie


def lancer_voix(tmp_path: Path, demande, registre: Path = REGISTRE_REEL, delai_s: float = 900):
    entree, sortie = preparer(tmp_path, demande)
    etape = Etape(
        type="gpu", programme=str(PYTHON_VOIX),
        arguments=("-I", "/entree/code/voix.py", "/entree/demande.json", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=(
            (str(DOSSIERS_MODELES["chatterbox"]), "/modeles/chatterbox"),
            (str(DOSSIERS_MODELES["kokoro"]), "/modeles/kokoro"),
            (str(registre), "/voix-autorisees"),
        ),
        hors_ligne=True,
    )
    return executer(etape, delai_s, fsize_octets=200 * 1024**2), sortie


def demande(**changements) -> dict:
    base = {"texte": TEXTE, "langue": "fr", "voix": "synthese-chatterbox-fr", "entreprise": "essai"}
    return {**base, **changements}


def memoire_utilisee_mio() -> int:
    sortie = subprocess.run(
        ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, check=True).stdout
    return int(sortie.split()[0])


class SondeMemoire:
    """Relève la mémoire vidéo maximale pendant un bloc (nvidia-smi toutes les 0,5 s)."""

    def __enter__(self):
        self.depart, self.maximum, self._actif = memoire_utilisee_mio(), 0, True
        self._fil = threading.Thread(target=self._boucle, daemon=True)
        self._fil.start()
        return self

    def _boucle(self):
        import time
        while self._actif:
            try:
                self.maximum = max(self.maximum, memoire_utilisee_mio())
            except (subprocess.SubprocessError, ValueError, IndexError):
                pass
            time.sleep(0.5)

    def __exit__(self, *_):
        self._actif = False
        self._fil.join(timeout=5)

    @property
    def supplement_mio(self) -> int:
        return self.maximum - self.depart


def detecter_filigrane(wav: Path) -> tuple[int, dict]:
    resultat = subprocess.run([str(PYTHON_VOIX), "-I", str(PERTH_PY), str(wav)],
                              capture_output=True, text=True, timeout=300)
    return resultat.returncode, json.loads(resultat.stdout) if resultat.stdout.strip() else {}


def lire_wav(chemin: Path) -> tuple[int, int, int, float]:
    with wave.open(str(chemin), "rb") as f:
        return f.getnchannels(), f.getsampwidth(), f.getframerate(), f.getnframes() / f.getframerate()


# ---------------------------------------------------------------- cage GPU réelle

def gpu_libre_sinon_sauter():
    """Règle de l'opérateur : aucune étape GPU pendant qu'il joue. Le test est sauté, raison affichée, jamais forcé."""
    libre, raison = gpu.gpu_disponible()
    if not libre:
        pytest.skip(f"carte graphique occupée, essai réel GPU reporté : {raison}")

def test_phrase_francaise_synthetisee_dans_la_cage_gpu(tmp_path, capsys):
    gpu_libre_sinon_sauter()
    with SondeMemoire() as sonde:
        resultat, sortie = lancer_voix(tmp_path, demande())
    erreur = resultat.erreur.decode(errors="replace")[-2000:]
    assert resultat.code == 0, erreur
    resume = json.loads(resultat.sortie.decode().strip().splitlines()[-1])
    assert resume["moteur"] == "chatterbox", f"repli inattendu sur Kokoro : {erreur}"
    canaux, largeur, cadence, duree = lire_wav(sortie / "voix.wav")
    assert (canaux, largeur, cadence) == (1, 2, 24000)
    assert 3.0 <= duree <= 25.0, f"durée implausible pour ~100 caractères : {duree} s"
    code, mesure = detecter_filigrane(sortie / "voix.wav")
    assert code == 0 and mesure["filigrane"] is True, mesure
    assert sonde.supplement_mio < gpu.MEMOIRE_LIBRE_MIN_MIO, "la synthèse dépasse la réserve de 8 Gio"
    with capsys.disabled():
        print(f"\n[mesure] Chatterbox : {resultat.duree_s:.1f} s mur, audio {duree:.1f} s, "
              f"mémoire vidéo maximale +{sonde.supplement_mio} Mio (taux PerTh {mesure['taux']})")


def test_kokoro_en_cage_gpu_porte_aussi_le_filigrane(tmp_path, capsys):
    gpu_libre_sinon_sauter()
    with SondeMemoire() as sonde:
        resultat, sortie = lancer_voix(tmp_path, demande(voix="synthese-kokoro-fr"))
    assert resultat.code == 0, resultat.erreur.decode(errors="replace")[-2000:]
    assert json.loads(resultat.sortie.decode().strip().splitlines()[-1])["moteur"] == "kokoro"
    _, _, _, duree = lire_wav(sortie / "voix.wav")
    assert 3.0 <= duree <= 25.0
    code, mesure = detecter_filigrane(sortie / "voix.wav")
    assert code == 0 and mesure["filigrane"] is True, mesure
    with capsys.disabled():
        print(f"\n[mesure] Kokoro : {resultat.duree_s:.1f} s mur, audio {duree:.1f} s, "
              f"mémoire vidéo maximale +{sonde.supplement_mio} Mio")


def test_texte_de_1500_caracteres_accepte_au_dela_refuse(tmp_path):
    voix = charger_module(VOIX_PY, "voix_validation")
    assert voix.valider_demande(demande(texte="a" * 1500))["texte"] == "a" * 1500
    with pytest.raises(voix.DemandeInvalide):
        voix.valider_demande(demande(texte="a" * 1501))
    with pytest.raises(voix.DemandeInvalide):
        voix.valider_demande(demande(langue="en"))
    with pytest.raises(voix.DemandeInvalide):
        voix.valider_demande(demande(texte="   "))
    assert all(len(m) <= voix.LONGUEUR_MORCEAU for m in voix.decouper("Un mot, " * 150))


def test_filigrane_absent_d_un_signal_non_synthetise(tmp_path):
    import math
    chemin = tmp_path / "sinus.wav"
    with wave.open(str(chemin), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(24000)
        f.writeframes(b"".join(
            int(8000 * math.sin(2 * math.pi * 220 * i / 24000)).to_bytes(2, "little", signed=True)
            for i in range(24000 * 3)))
    code, mesure = detecter_filigrane(chemin)
    assert code == 1 and mesure["filigrane"] is False, mesure


# ---------------------------------------------------------------- évasions refusées dans la cage

@pytest.fixture
def registre_essai(tmp_path):
    """Registre de test, monté à la place du vrai : voix expirée, voix d'une autre entreprise, personne sous contrat."""
    dossier = tmp_path / "registre"
    dossier.mkdir()
    (dossier / "ref.wav").write_bytes(b"RIFF")
    (dossier / "registre.json").write_text(json.dumps({"voix": [
        {"id": "expiree", "moteur": "kokoro", "type": "synthese", "voix_moteur": "ff_siwis",
         "entreprises": ["essai"], "expire_le": "2020-01-01"},
        {"id": "autre-entreprise", "moteur": "kokoro", "type": "synthese", "voix_moteur": "ff_siwis",
         "entreprises": ["acme"], "expire_le": EXPIRATION_LOINTAINE},
        {"id": "personne-sans-contrat", "moteur": "chatterbox", "type": "personne",
         "fichier_reference": "ref.wav", "entreprises": ["essai"], "expire_le": EXPIRATION_LOINTAINE},
    ]}), encoding="utf-8")
    return dossier


@pytest.mark.parametrize("changement, code_attendu", [
    ({"voix": "../voix-autorisees/x.wav"}, 3),
    ({"voix": "/voix-autorisees/ref.wav"}, 3),
    ({"voix": "inconnue"}, 3),
    ({"voix": "expiree"}, 3),
    ({"voix": "autre-entreprise"}, 3),
    ({"voix": "personne-sans-contrat"}, 3),
    ({"echantillon": "/entree/code/voix.py"}, 2),
    ({"echantillon": "../x.wav", "voix": "expiree"}, 2),
    ({"langue": "en"}, 2),
    ({"entreprise": "../acme"}, 3),
])
def test_evasions_refusees_sans_produire_de_son(tmp_path, registre_essai, changement, code_attendu):
    resultat, sortie = lancer_voix(tmp_path, demande(**changement), registre=registre_essai, delai_s=120)
    assert resultat.code == code_attendu, resultat.erreur.decode(errors="replace")[-1000:]
    assert not (sortie / "voix.wav").exists()


def test_demande_illisible_ou_trop_grosse_refusee(tmp_path, registre_essai):
    resultat, sortie = lancer_voix(tmp_path, "{pas du json", registre=registre_essai, delai_s=120)
    assert resultat.code == 2 and not (sortie / "voix.wav").exists()


def test_poids_manquants_echec_franc_sans_telechargement(tmp_path, registre_essai):
    entree, sortie = preparer(tmp_path, demande(voix="synthese-chatterbox-fr"))
    vide = tmp_path / "vide"
    vide.mkdir()
    shutil.copy(REGISTRE_REEL / "registre.json", registre_essai / "registre.json")
    etape = Etape(
        type="gpu", programme=str(PYTHON_VOIX),
        arguments=("-I", "/entree/code/voix.py", "/entree/demande.json", "/sortie"),
        dossier_entree=str(entree), dossier_sortie=str(sortie),
        montages_modeles=((str(vide), "/modeles/chatterbox"), (str(vide), "/modeles/kokoro"),
                          (str(registre_essai), "/voix-autorisees")),
        hors_ligne=True,
    )
    resultat = executer(etape, 300, fsize_octets=200 * 1024**2)
    assert resultat.code == 4 and not (sortie / "voix.wav").exists()
    assert "poids manquants" in resultat.erreur.decode(errors="replace")


def test_la_cage_n_a_pas_de_reseau(tmp_path):
    entree, sortie = tmp_path / "entree", tmp_path / "sortie"
    entree.mkdir()
    sortie.mkdir()
    (entree / "reseau.py").write_text(
        "import urllib.request, sys\n"
        "try:\n"
        "    urllib.request.urlopen('http://example.com', timeout=5)\n"
        "except OSError as e:\n"
        "    print('ECHEC-RESEAU', type(e).__name__); sys.exit(7)\n"
        "print('RESEAU-OUVERT')\n", encoding="utf-8")
    etape = Etape(type="gpu", programme=str(PYTHON_VOIX), arguments=("-I", "/entree/reseau.py"),
                  dossier_entree=str(entree), dossier_sortie=str(sortie), hors_ligne=True)
    resultat = executer(etape, 60)
    assert resultat.code == 7 and b"ECHEC-RESEAU" in resultat.sortie
    assert b"RESEAU-OUVERT" not in resultat.sortie


# ---------------------------------------------------------------- registre (fonctions pures)

def ecrire_registre(dossier: Path, voix: list[dict]) -> Path:
    dossier.mkdir(exist_ok=True)
    (dossier / "registre.json").write_text(json.dumps({"voix": voix}), encoding="utf-8")
    return dossier


def personne(**changements) -> dict:
    base = {"id": "marie", "moteur": "chatterbox", "type": "personne", "fichier_reference": "marie.wav",
            "contrat": "CT-2026-014", "entreprises": ["essai"], "expire_le": EXPIRATION_LOINTAINE}
    return {**base, **changements}


def test_registre_reel_contient_deux_voix_de_synthese():
    registre = registre_voix.charger_registre(REGISTRE_REEL)
    assert {v.type for v in registre.values()} == {"synthese"}
    assert {v.moteur for v in registre.values()} == {"chatterbox", "kokoro"}
    assert registre_voix.resoudre("synthese-chatterbox-fr", "n-importe-laquelle", REGISTRE_REEL).moteur == "chatterbox"


def test_voix_de_personne_autorisee_avec_contrat_et_expiration_future(tmp_path):
    dossier = ecrire_registre(tmp_path, [personne()])
    (dossier / "marie.wav").write_bytes(b"RIFF")
    voix = registre_voix.resoudre("marie", "essai", dossier)
    assert voix.contrat == "CT-2026-014" and voix.chemin_reference == dossier / "marie.wav"


@pytest.mark.parametrize("changement, morceau_message", [
    ({"contrat": None}, "contrat"),
    ({"contrat": "  "}, "contrat"),
    ({"expire_le": "2020-01-01"}, "expirée"),
    ({"expire_le": datetime.date.today().isoformat()}, "expirée"),
    ({"entreprises": ["acme"]}, "entreprise"),
    ({"entreprises": ["*"]}, "synthèse"),
    ({"fichier_reference": "../marie.wav"}, "fichier_reference"),
    ({"fichier_reference": "/etc/passwd"}, "fichier_reference"),
    ({"fichier_reference": "sous/marie.wav"}, "fichier_reference"),
    ({"fichier_reference": "absent.wav"}, "introuvable"),
    ({"moteur": "kokoro", "voix_moteur": "ff_siwis"}, "Kokoro"),
    ({"champ_inconnu": 1}, "inconnus"),
])
def test_voix_de_personne_refusee(tmp_path, changement, morceau_message):
    entree = {k: v for k, v in personne(**changement).items() if v is not None}
    dossier = ecrire_registre(tmp_path, [entree])
    (dossier / "marie.wav").write_bytes(b"RIFF")
    with pytest.raises(VoixRefusee, match=morceau_message):
        registre_voix.resoudre("marie", "essai", dossier)


def test_lien_symbolique_comme_reference_refuse(tmp_path):
    dossier = ecrire_registre(tmp_path, [personne()])
    (tmp_path / "secret.wav").write_bytes(b"RIFF")
    (dossier / "marie.wav").symlink_to(tmp_path / "secret.wav")
    with pytest.raises(VoixRefusee, match="lien symbolique"):
        registre_voix.resoudre("marie", "essai", dossier)


@pytest.mark.parametrize("identifiant", ["../x", "a/b", "A", "", None, 3, "x.wav", "marie\0"])
def test_identifiant_de_voix_invalide_refuse(tmp_path, identifiant):
    dossier = ecrire_registre(tmp_path, [])
    with pytest.raises(VoixRefusee):
        registre_voix.resoudre(identifiant, "essai", dossier)


def test_registre_invalide_ou_absent_refuse(tmp_path):
    with pytest.raises(VoixRefusee, match="introuvable"):
        registre_voix.charger_registre(tmp_path / "rien")
    (tmp_path / "registre.json").write_text("[]", encoding="utf-8")
    with pytest.raises(VoixRefusee, match="invalide"):
        registre_voix.charger_registre(tmp_path)
    ecrire_registre(tmp_path, [personne(id="a"), personne(id="a")])
    (tmp_path / "marie.wav").write_bytes(b"RIFF")
    with pytest.raises(VoixRefusee, match="double"):
        registre_voix.charger_registre(tmp_path)


# ---------------------------------------------------------------- GPU partagé (sorties simulées)

MEMOIRE_LIBRE = "9500, 10240\n"
MEMOIRE_JEU = "7595, 10240\n"
RIEN = ""
PS_CALME = "systemd\nbash\noom_reaper\npython3\n"
PMON_BUREAU = ("# gpu pid type sm mem enc dec jpg ofa command\n# Idx # C/G % % % % % % name\n"
               "    0  14340  G  -  -  -  -  -  -  gnome-shell\n"
               "    0  18935  G  -  -  -  -  -  -  firefox\n"
               "    0  15540  C+G  -  -  -  -  -  -  jean-b\n")
BUREAU_CALCUL = ("15540, /usr/lib/claude-desktop/claude-desktop --type=gpu-process --x=1,2, 37\n"
                 "17168, /usr/bin/ptyxis, 30\n")


def test_gpu_libre_avec_seulement_le_bureau():
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_LIBRE, BUREAU_CALCUL, PMON_BUREAU, PS_CALME))
    assert libre is True and "9500" in raison


@pytest.mark.parametrize("processus", ["gamescope\n", "bash\nreaper\n", "gamescope-wl\n"])
def test_gpu_occupe_si_gamescope_ou_reaper_de_steam(processus):
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_LIBRE, RIEN, RIEN, processus))
    assert libre is False and "jeu" in raison


def test_oom_reaper_du_noyau_n_est_pas_un_jeu():
    assert gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_LIBRE, RIEN, RIEN, "oom_reaper\n"))[0] is True


def test_gpu_occupe_si_un_processus_de_calcul_inconnu_l_utilise():
    calcul = BUREAU_CALCUL + ("709085, C:/Program Files (x86)/Ubisoft/games/AC1\\\\AssassinsCreed_Dx10.exe, 1243\n")
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_LIBRE, calcul, PMON_BUREAU, PS_CALME))
    assert libre is False and "assassinscreed_dx10.exe" in raison


def test_gpu_occupe_si_contexte_graphique_d_un_jeu_sans_calcul():
    pmon = PMON_BUREAU + "    0  709085  G  38  11  -  -  -  -  TheGame\n"
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_LIBRE, RIEN, pmon, PS_CALME))
    assert libre is False and "thegame" in raison


def test_gpu_occupe_si_memoire_libre_sous_8_gio():
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_JEU, RIEN, RIEN, PS_CALME))
    assert libre is False and "7595" in raison
    assert gpu.gpu_disponible(gpu.SortiesGpu("8192, 10240", RIEN, RIEN, PS_CALME))[0] is True
    assert gpu.gpu_disponible(gpu.SortiesGpu("8191, 10240", RIEN, RIEN, PS_CALME))[0] is False


def test_gpu_occupe_si_nvidia_smi_illisible():
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(RIEN, RIEN, RIEN, PS_CALME))
    assert libre is False and "illisible" in raison


def test_raisons_cumulees():
    libre, raison = gpu.gpu_disponible(gpu.SortiesGpu(MEMOIRE_JEU, RIEN, RIEN, "gamescope\n"))
    assert libre is False and "jeu" in raison and "7595" in raison
