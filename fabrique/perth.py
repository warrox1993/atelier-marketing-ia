"""Détection du filigrane PerTh (Resemble AI) dans un fichier wav (lot 7, AI Act article 50).

À lancer dans l'environnement voix : `/opt/atelier-fabrique/venv-voix/bin/python -I perth.py voix.wav`
(code 0 : filigrane détecté, 1 : absent, 2 : erreur). Importable aussi par la porte de diffusion.
Le nom de ce fichier est celui du lot ; il ne masque pas la bibliothèque `perth` sous `python -I`
(le dossier du script n'est pas dans le chemin d'import).
"""

from __future__ import annotations

import contextlib
import json
import sys
import wave
from pathlib import Path

SEUIL_DETECTION = 0.5  # part des trames dont le décodeur lit le motif du filigrane


def lire_wav_mono(chemin: str | Path):
    """(signal float32 dans [-1, 1], fréquence d'échantillonnage) d'un wav PCM 16 bits."""
    import numpy as np

    with wave.open(str(chemin), "rb") as f:
        if f.getsampwidth() != 2:
            raise ValueError("wav PCM 16 bits attendu")
        canaux, cadence, trames = f.getnchannels(), f.getframerate(), f.readframes(f.getnframes())
    signal = np.frombuffer(trames, dtype="<i2").astype("float32") / 32768.0
    if canaux > 1:
        signal = signal.reshape(-1, canaux).mean(axis=1)
    return signal, cadence


def mesurer(chemin: str | Path) -> float:
    """Part (0 à 1) des trames où le décodeur PerTh lit le filigrane."""
    import numpy as np
    import perth

    signal, cadence = lire_wav_mono(chemin)
    if signal.size == 0:
        raise ValueError("wav vide")
    lecteur = perth.PerthImplicitWatermarker()
    prediction = lecteur.get_watermark(signal, sample_rate=cadence, round=False)
    return float(np.mean(prediction))


def detecter(chemin: str | Path, seuil: float = SEUIL_DETECTION) -> tuple[bool, float]:
    """(filigrane détecté, taux mesuré)."""
    taux = mesurer(chemin)
    return taux >= seuil, taux


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage : python -I perth.py fichier.wav", file=sys.stderr)
        return 2
    try:
        with contextlib.redirect_stdout(sys.stderr):  # la bibliothèque écrit « loaded PerthNet » sur stdout
            detecte, taux = detecter(argv[1])
    except Exception as erreur:  # noqa: BLE001 - message clair pour l'opérateur
        print(f"erreur : {erreur}", file=sys.stderr)
        return 2
    print(json.dumps({"filigrane": detecte, "taux": round(taux, 4)}))
    return 0 if detecte else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
