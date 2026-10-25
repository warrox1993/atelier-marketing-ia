"""Synthèse vocale française dans la cage GPU (lot 7).

    python -I voix.py /entree/demande.json /sortie

Demande (schéma fermé, aucun autre champ n'est admis, donc aucun échantillon audio) :
    { "texte": "...", "langue": "fr", "voix": "<identifiant du registre>", "entreprise": "<identifiant>" }
« entreprise » est posé par le service à partir du travail, jamais par un agent.

Produit /sortie/voix.wav (PCM 16 bits mono, 24 kHz, filigrane PerTh) et écrit sur la sortie standard
un résumé JSON. Chatterbox multilingue en français ; Kokoro (voix française) si Chatterbox échoue
pour une voix de synthèse, ou si le registre désigne Kokoro. Aucun téléchargement : la cage n'a pas
de réseau, un fichier manquant est un échec franc.

Montages attendus dans la cage (lecture seule) : /modeles/chatterbox, /modeles/kokoro,
/voix-autorisees (registre.json et échantillons sous contrat).
Codes de sortie : 0 réussi, 2 demande invalide, 3 voix refusée, 4 échec de synthèse.
"""

from __future__ import annotations

import os

# Avant toute importation lourde : cage sans réseau, caches dans le /tmp éphémère de la cage.
for _nom, _valeur in {
    "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HOME": "/tmp/hf",
    "NUMBA_CACHE_DIR": "/tmp/numba", "MPLCONFIGDIR": "/tmp/mpl", "TOKENIZERS_PARALLELISM": "false",
}.items():
    os.environ.setdefault(_nom, _valeur)

import importlib.util  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import stat  # noqa: E402
import sys  # noqa: E402
import traceback  # noqa: E402
import wave  # noqa: E402
from pathlib import Path  # noqa: E402

TEXTE_MAX = 1500
TAILLE_MAX_DEMANDE = 64 * 1024
CHAMPS_DEMANDE = {"texte", "langue", "voix", "entreprise"}
CHATTERBOX = Path("/modeles/chatterbox")
KOKORO = Path("/modeles/kokoro")
VOIX_AUTORISEES = Path("/voix-autorisees")
VOIX_SECOURS_KOKORO = "ff_siwis"
FICHIERS_CHATTERBOX = ("ve.pt", "t3_mtl23ls_v2.safetensors", "s3gen.pt",
                       "grapheme_mtl_merged_expanded_v1.json", "conds.pt")
FICHIERS_KOKORO = ("config.json", "kokoro-v1_0.pth")
CADENCE = 24000
PAUSE_ENTRE_PHRASES_S = 0.25
LONGUEUR_MORCEAU = 220  # caractères : Chatterbox et Kokoro donnent un meilleur rendu phrase par phrase


class DemandeInvalide(ValueError):
    pass


def charger_registre_voix():
    """Charge registre_voix.py voisin (dossier parent du script, ou dossier du script en test)."""
    ici = Path(__file__).resolve().parent
    for dossier in (ici.parent, ici):
        candidat = dossier / "registre_voix.py"
        if candidat.is_file():
            spec = importlib.util.spec_from_file_location("registre_voix", candidat)
            module = importlib.util.module_from_spec(spec)
            sys.modules["registre_voix"] = module  # requis par @dataclass
            spec.loader.exec_module(module)
            return module
    raise FileNotFoundError("registre_voix.py introuvable à côté de voix.py")


def lire_demande(chemin: str) -> dict:
    info = os.lstat(chemin)
    if not stat.S_ISREG(info.st_mode) or info.st_size > TAILLE_MAX_DEMANDE:
        raise DemandeInvalide("demande : fichier régulier de moins de 64 Kio exigé")
    try:
        demande = json.loads(Path(chemin).read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as erreur:
        raise DemandeInvalide(f"demande : JSON invalide ({erreur})") from erreur
    return valider_demande(demande)


def valider_demande(demande: object) -> dict:
    if not isinstance(demande, dict):
        raise DemandeInvalide("demande : objet JSON attendu")
    inconnus = set(demande) - CHAMPS_DEMANDE
    if inconnus:
        raise DemandeInvalide(f"demande : champs interdits {sorted(inconnus)} (aucun échantillon audio)")
    manquants = CHAMPS_DEMANDE - set(demande)
    if manquants:
        raise DemandeInvalide(f"demande : champs manquants {sorted(manquants)}")
    texte = demande["texte"]
    if not isinstance(texte, str) or not texte.strip():
        raise DemandeInvalide("texte : chaîne non vide attendue")
    if len(texte) > TEXTE_MAX:
        raise DemandeInvalide(f"texte : {TEXTE_MAX} caractères au plus")
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", texte):
        raise DemandeInvalide("texte : caractères de contrôle interdits")
    if demande["langue"] != "fr":
        raise DemandeInvalide("langue : seul « fr » est admis")
    return demande


def decouper(texte: str, longueur: int = LONGUEUR_MORCEAU) -> list[str]:
    """Découpe en phrases, regroupées en morceaux d'au plus `longueur` caractères (phrase trop longue : coupée aux virgules/espaces)."""
    phrases = [p.strip() for p in re.split(r"(?<=[.!?…])\s+|\n+", texte.strip()) if p.strip()]
    petites: list[str] = []
    for phrase in phrases:
        while len(phrase) > longueur:
            coupe = max(phrase.rfind(sep, 0, longueur) for sep in (", ", "; ", ": ", " "))
            coupe = coupe if coupe > 0 else longueur
            petites.append(phrase[:coupe + 1].strip())
            phrase = phrase[coupe + 1:].strip()
        if phrase:
            petites.append(phrase)
    morceaux: list[str] = []
    for phrase in petites:
        if morceaux and len(morceaux[-1]) + 1 + len(phrase) <= longueur:
            morceaux[-1] += " " + phrase
        else:
            morceaux.append(phrase)
    return morceaux


def exiger_fichiers(dossier: Path, noms: tuple[str, ...]) -> None:
    manquants = [n for n in noms if not (dossier / n).is_file()]
    if manquants:
        raise FileNotFoundError(f"poids manquants dans {dossier} : {', '.join(manquants)} (aucun téléchargement en cage)")


def neutraliser_chinois() -> None:
    """Le tokenizer multilingue tente de télécharger un dictionnaire et un modèle de segmentation du chinois.

    Seul le français est admis : on remplace ce convertisseur (sans toucher à la bibliothèque) pour
    qu'aucune tentative de réseau n'ait lieu.
    """
    from chatterbox.models.tokenizers import tokenizer

    class SansChinois:
        def __init__(self, model_dir=None):
            pass

        def __call__(self, texte):
            raise RuntimeError("chinois non pris en charge par la fabrique")

    tokenizer.ChineseCangjieConverter = SansChinois


def synthese_chatterbox(morceaux: list[str], reference: Path | None):
    import numpy as np
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    exiger_fichiers(CHATTERBOX, FICHIERS_CHATTERBOX)
    neutraliser_chinois()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA indisponible dans la cage")
    modele = ChatterboxMultilingualTTS.from_local(CHATTERBOX, "cuda")
    pause = np.zeros(int(PAUSE_ENTRE_PHRASES_S * modele.sr), dtype="float32")
    sons = []
    for morceau in morceaux:
        audio = modele.generate(morceau, language_id="fr",
                                audio_prompt_path=str(reference) if reference else None)
        sons += [audio.squeeze().detach().cpu().numpy().astype("float32"), pause]
    return np.concatenate(sons[:-1]), modele.sr  # le filigrane PerTh est posé par generate()


def synthese_kokoro(morceaux: list[str], voix_moteur: str):
    import numpy as np
    import torch
    import perth
    import espeakng_loader
    from kokoro import KModel, KPipeline
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    # espeak-ng embarqué dans la roue figée, jamais celui du système (la cage ne sait pas le trouver).
    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
    exiger_fichiers(KOKORO, FICHIERS_KOKORO)
    fichier_voix = KOKORO / "voices" / f"{voix_moteur}.pt"
    if not fichier_voix.is_file():
        raise FileNotFoundError(f"voix Kokoro absente : {fichier_voix}")
    appareil = "cuda" if torch.cuda.is_available() else "cpu"
    modele = KModel(config=str(KOKORO / "config.json"), model=str(KOKORO / "kokoro-v1_0.pth")).to(appareil).eval()
    pipeline = KPipeline(lang_code="f", model=modele, device=appareil)
    pause = np.zeros(int(PAUSE_ENTRE_PHRASES_S * CADENCE), dtype="float32")
    sons = []
    for morceau in morceaux:
        for _, _, audio in pipeline(morceau, voice=str(fichier_voix), speed=1.0):
            if audio is not None:
                sons.append(audio.detach().cpu().numpy().astype("float32"))
        sons.append(pause)
    if len(sons) <= len(morceaux):
        raise RuntimeError("Kokoro n'a produit aucun son")
    signal = np.concatenate(sons[:-1])
    # Kokoro ne filigrane pas : on pose PerTh nous-mêmes (marquage lisible par machine, §7).
    signal = perth.PerthImplicitWatermarker().apply_watermark(signal, sample_rate=CADENCE)
    return signal.astype("float32"), CADENCE


def ecrire_wav(chemin: Path, signal, cadence: int) -> float:
    import numpy as np

    signal = np.clip(np.nan_to_num(signal), -1.0, 1.0)
    pcm = (signal * 32767.0).round().astype("<i2")
    with wave.open(str(chemin), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(cadence)
        f.writeframes(pcm.tobytes())
    return len(pcm) / cadence


def synthetiser(demande: dict, registre) -> tuple:
    voix = registre.resoudre(demande["voix"], demande["entreprise"], VOIX_AUTORISEES)
    morceaux = decouper(demande["texte"])
    moteur = voix.moteur
    if moteur == "chatterbox":
        try:
            signal, cadence = synthese_chatterbox(morceaux, voix.chemin_reference)
            return signal, cadence, "chatterbox"
        except Exception as erreur:  # noqa: BLE001 - repli documenté
            if voix.type == "personne":
                raise  # jamais de repli sur une autre voix pour une personne sous contrat
            print(f"Chatterbox a échoué ({type(erreur).__name__}: {erreur}) : repli sur Kokoro", file=sys.stderr)
    signal, cadence = synthese_kokoro(morceaux, voix.voix_moteur or VOIX_SECOURS_KOKORO)
    return signal, cadence, "kokoro"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage : python -I voix.py /entree/demande.json /sortie", file=sys.stderr)
        return 2
    try:
        registre = charger_registre_voix()
        demande = lire_demande(argv[1])
    except (DemandeInvalide, OSError) as erreur:
        print(f"demande refusée : {erreur}", file=sys.stderr)
        return 2
    try:
        signal, cadence, moteur = synthetiser(demande, registre)
        duree = ecrire_wav(Path(argv[2]) / "voix.wav", signal, cadence)
    except registre.VoixRefusee as erreur:
        print(f"voix refusée : {erreur}", file=sys.stderr)
        return 3
    except Exception as erreur:  # noqa: BLE001 - échec franc, message clair
        print(f"échec de synthèse : {type(erreur).__name__}: {erreur}", file=sys.stderr)
        traceback.print_exc(limit=-6)
        return 4
    print(json.dumps({"moteur": moteur, "voix": demande["voix"], "duree_s": round(duree, 2),
                      "cadence": cadence, "filigrane_perth": True}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
