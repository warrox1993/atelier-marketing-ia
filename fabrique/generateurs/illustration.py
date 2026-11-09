"""Illustration IA locale dans la cage GPU, pour le fond plein cadre d'une image publicitaire.

    python -I illustration.py /entree/demande.json /sortie

Demande (schéma fermé) :
    { "illustration": "<scène, 20 à 2500 caractères>", "largeur": 1080, "hauteur": 1350, "graine": 123 }
« largeur », « hauteur » et « graine » sont posées par le service, jamais par un agent. La consigne envoyée au
modèle est la scène suivie de SUFFIXE (pas de texte, pas de logo, mains soignées, pas de bandes) ; les
personnages de fiction restent permis.

Le modèle est FLUX 3 Image Klein (pipeline modulaire « flux3-modulaire », distillé : pas de guidance). Tout ce qui le
décrit (modèle de la liste, pipeline, étapes, guidance, modules gardés en bf16, taille maximale) est lu dans la section
« illustration » de modeles.json, copié par le service à côté de ce fichier ; le dépôt et la révision des poids sont ceux
de son entrée dans « modeles ». FLUX 3 veut une description détaillée (100 à 350 mots) : le texte n'est pas réécrit.

Chargement en deux temps, pour tenir dans 10 Gio de carte et peu de RAM : 1) l'encodeur de texte seul (bf16) encode la
consigne puis est libéré ; 2) le transformeur en 8 bits et le décodeur débruitent à partir de ces plongements.

Produit /sortie/illustration.png aux dimensions exactes (génération au format demandé arrondi au multiple de 16,
plafonnée à `pixels_max`, puis recadrage centré). Si les 5 % du haut ou du bas sont presque noirs, une seconde
génération est faite avec une autre graine ; si le défaut persiste, échec clair. Aucun téléchargement : la cage n'a
pas de réseau, un fichier manquant est un échec franc.

Montage attendu dans la cage (lecture seule) : /modeles/illustration.
Codes de sortie : 0 réussi, 2 demande invalide, 4 échec de génération, 5 bandes noires persistantes.
"""

from __future__ import annotations

import gc
import json
import math
import os
import re
import stat
import sys
import traceback
from pathlib import Path

ILLUSTRATION_MIN = 20
ILLUSTRATION_MAX = 2500
SUFFIXE = (", full-bleed composition, no letterbox, no black bars, no borders, anatomically correct hands with five "
           "fingers, no extra fingers, no fused fingers, no text, no letters, no words, no logo, no watermark, no signature")
CHAMPS_DEMANDE = {"illustration", "largeur", "hauteur", "graine"}
TAILLE_MAX_DEMANDE = 16 * 1024
DIMENSION_MIN, DIMENSION_MAX = 256, 4096
GRAINE_MAX = 2**32 - 1
POIDS = Path("/modeles/illustration")
REGLAGES = Path(__file__).resolve().parent / "modeles.json"
PAS_DE_DIMENSION = 16  # les modèles exigent des dimensions multiples de 16
NOM_SORTIE = "illustration.png"
PART_BANDE = 0.05  # part de la hauteur contrôlée en haut et en bas
LUMINANCE_BANDE_MIN = 8  # luminance moyenne (0 à 255) en dessous de laquelle une bande est « presque noire »
_CONTROLE = re.compile(r"[\x00-\x1f\x7f]")
PIPELINE = "flux3-modulaire"  # le seul moteur écrit ici ; modeles.json le désigne pour que le réglage reste explicite
_MODULE = re.compile(r"[a-z][a-z0-9_]{1,60}")


class DemandeInvalide(ValueError):
    pass


class BandesNoires(RuntimeError):
    pass


def valider_illustration(valeur: object) -> str:
    """La description de la scène, ou DemandeInvalide : texte de 20 à 2500 caractères, sans caractère de contrôle."""
    if not isinstance(valeur, str):
        raise DemandeInvalide("illustration : chaîne attendue")
    if _CONTROLE.search(valeur):
        raise DemandeInvalide("illustration : caractères de contrôle interdits")
    texte = valeur.strip()
    if not ILLUSTRATION_MIN <= len(texte) <= ILLUSTRATION_MAX:
        raise DemandeInvalide(f"illustration : de {ILLUSTRATION_MIN} à {ILLUSTRATION_MAX} caractères attendus")
    return texte


def consigne(illustration: str) -> str:
    return valider_illustration(illustration) + SUFFIXE


def valider_demande(demande: object) -> dict:
    if not isinstance(demande, dict):
        raise DemandeInvalide("demande : objet JSON attendu")
    if set(demande) != CHAMPS_DEMANDE:
        raise DemandeInvalide(f"demande : champs attendus {sorted(CHAMPS_DEMANDE)}")
    for nom in ("largeur", "hauteur"):
        valeur = demande[nom]
        if type(valeur) is not int or not DIMENSION_MIN <= valeur <= DIMENSION_MAX:
            raise DemandeInvalide(f"{nom} : entier de {DIMENSION_MIN} à {DIMENSION_MAX} attendu")
    if type(demande["graine"]) is not int or not 0 <= demande["graine"] <= GRAINE_MAX:
        raise DemandeInvalide("graine : entier de 0 à 2^32 - 1 attendu")
    return {**demande, "illustration": valider_illustration(demande["illustration"])}


def lire_demande(chemin: str) -> dict:
    info = os.lstat(chemin)
    if not stat.S_ISREG(info.st_mode) or info.st_size > TAILLE_MAX_DEMANDE:
        raise DemandeInvalide("demande : fichier régulier de moins de 16 Kio exigé")
    try:
        return valider_demande(json.loads(Path(chemin).read_text(encoding="utf-8")))
    except (UnicodeDecodeError, json.JSONDecodeError) as erreur:
        raise DemandeInvalide(f"demande : JSON invalide ({erreur})") from erreur


def valider_reglages(modele: object) -> dict:
    """La section « illustration » de modeles.json, ou ValueError : tout ce qui décrit le modèle, rien ailleurs."""
    if not isinstance(modele, dict):
        raise ValueError("réglages : objet attendu")
    pipeline, etapes, modules = modele.get("pipeline"), modele.get("etapes"), modele.get("modules_non_quantifies")
    if pipeline != PIPELINE:
        raise ValueError(f"réglages : pipeline « {PIPELINE} » attendu")
    if type(etapes) is not int or not 1 <= etapes <= 100:
        raise ValueError("réglages : etapes (entier de 1 à 100) invalide")
    if modele.get("guidance") is not None:
        raise ValueError("réglages : guidance null attendue (modèle distillé, sans guidance)")
    if not isinstance(modules, list) or not modules or not all(isinstance(m, str) and _MODULE.fullmatch(m) for m in modules):
        raise ValueError("réglages : modules_non_quantifies (liste non vide de noms de modules) invalide")
    pixels = modele.get("pixels_max")
    if type(pixels) is not int or not 256 * 256 <= pixels <= 4096 * 4096:
        raise ValueError("réglages : pixels_max invalide")
    return {"nom": str(modele.get("modele", "")), "pipeline": pipeline, "etapes": etapes, "guidance": None,
            "modules_non_quantifies": modules, "pixels_max": pixels}


def lire_reglages(chemin: Path = REGLAGES) -> dict:
    try:
        return valider_reglages(json.loads(Path(chemin).read_text(encoding="utf-8"))["illustration"])
    except (OSError, KeyError, UnicodeDecodeError, json.JSONDecodeError) as erreur:
        raise ValueError(f"réglages illisibles : {type(erreur).__name__}") from erreur


def _arrondi_haut(valeur: float) -> int:
    return int(math.ceil(valeur / PAS_DE_DIMENSION)) * PAS_DE_DIMENSION


def dimensions_generation(largeur: int, hauteur: int, pixels_max: int) -> tuple[int, int]:
    """Taille générée : le format demandé réduit sous `pixels_max`, arrondi au multiple de 16 supérieur."""
    echelle = min(1.0, math.sqrt(pixels_max / (largeur * hauteur)))
    return _arrondi_haut(largeur * echelle), _arrondi_haut(hauteur * echelle)


def recadrer(image, largeur: int, hauteur: int):
    """Image PIL aux dimensions exactes : recadrage centré, après agrandissement si la génération est plus petite."""
    from PIL import Image

    if image.width < largeur or image.height < hauteur:
        echelle = max(largeur / image.width, hauteur / image.height)
        image = image.resize((math.ceil(image.width * echelle), math.ceil(image.height * echelle)), Image.LANCZOS)
    gauche, haut = (image.width - largeur) // 2, (image.height - hauteur) // 2
    return image.crop((gauche, haut, gauche + largeur, haut + hauteur))


def bandes_noires(image) -> bool:
    """Vrai si les 5 % du haut ou du bas de l'image PIL sont presque noirs (luminance moyenne < 8)."""
    from PIL import ImageStat

    lignes = max(1, round(image.height * PART_BANDE))
    for haut in (0, image.height - lignes):
        bande = image.crop((0, haut, image.width, haut + lignes)).convert("L")
        if ImageStat.Stat(bande).mean[0] < LUMINANCE_BANDE_MIN:
            return True
    return False


def graine_de_secours(graine: int) -> int:
    return (graine + 1) % (GRAINE_MAX + 1)


def ouvrir_moteur(reglages: dict, texte: str):
    """Charge le modèle monté dans la cage, encode `texte` et rend `rendre(largeur, hauteur, graine) -> image PIL`."""
    # Avant toute importation lourde : cage sans réseau, caches dans le /tmp éphémère de la cage.
    for nom, valeur in {"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HOME": "/tmp/hf",
                        "TOKENIZERS_PARALLELISM": "false", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"}.items():
        os.environ.setdefault(nom, valeur)
    import torch
    from diffusers import AutoencoderKLFlux2, BitsAndBytesConfig
    from diffusers.models import AutoModel
    from diffusers.modular_pipelines.flux3.modular_blocks_flux3_distilled import Flux3DistilledAutoBlocks
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

    if not (POIDS / "modular_model_index.json").is_file():
        raise FileNotFoundError(f"poids manquants dans {POIDS} (aucun téléchargement en cage)")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA indisponible dans la cage")
    poids = str(POIDS)  # des chaînes : les chargeurs refusent Path
    blocs = Flux3DistilledAutoBlocks()
    blocs.sub_blocks.pop("prompt_upsampler")  # la description arrive déjà détaillée
    blocs_texte = blocs.sub_blocks.pop("text_encoder")
    # 1) l'encodeur de texte seul, sur la carte ; libéré avant de charger le transformeur.
    encodage = blocs_texte.init_pipeline()
    encodage.update_components(
        text_encoder=Qwen3VLForConditionalGeneration.from_pretrained(poids + "/text_encoder", dtype=torch.bfloat16, device_map="cuda", use_safetensors=True),
        tokenizer=AutoProcessor.from_pretrained(poids + "/text_encoder"))
    with torch.no_grad():
        etat = encodage(prompt=texte)
    plongements = {k: (v.detach() if torch.is_tensor(v) else v) for k, v in etat.get_by_kwargs("denoiser_input_fields").items()}
    del encodage, etat
    gc.collect()
    torch.cuda.empty_cache()
    # 2) le transformeur en 8 bits (sauf les modules sensibles : sans cette liste l'image n'est que du bruit) et le décodeur.
    transformeur = AutoModel.from_pretrained(
        poids + "/transformer", torch_dtype=torch.bfloat16, device_map="cuda", use_safetensors=True,
        quantization_config=BitsAndBytesConfig(load_in_8bit=True, llm_int8_skip_modules=reglages["modules_non_quantifies"]))
    # En 8 bits, transformer.dtype renvoie int8 et le bloc de débruitage y convertit les latents ; on calcule en bf16.
    type(transformeur).dtype = property(lambda self: torch.bfloat16)
    pipeline = blocs.init_pipeline()
    pipeline.update_components(transformer=transformeur,
                               vae=AutoencoderKLFlux2.from_pretrained(poids + "/vae", torch_dtype=torch.bfloat16, use_safetensors=True).to("cuda"))

    def rendre(largeur: int, hauteur: int, graine: int):
        return pipeline(**plongements, width=largeur, height=hauteur, num_inference_steps=reglages["etapes"],
                        generator=torch.Generator("cuda").manual_seed(graine), output="images")[0]
    return rendre


def produire(rendre, reglages: dict, demande: dict):
    """(image PIL aux dimensions exactes, graine retenue). Une seconde graine si une bande est noire, sinon BandesNoires."""
    largeur, hauteur = dimensions_generation(demande["largeur"], demande["hauteur"], reglages["pixels_max"])
    for graine in (demande["graine"], graine_de_secours(demande["graine"])):
        image = recadrer(rendre(largeur, hauteur, graine), demande["largeur"], demande["hauteur"]).convert("RGB")
        if not bandes_noires(image):
            return image, graine
    raise BandesNoires("bandes noires en haut ou en bas, avec deux graines différentes")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage : python -I illustration.py /entree/demande.json /sortie", file=sys.stderr)
        return 2
    try:
        demande = lire_demande(argv[1])
    except (DemandeInvalide, OSError) as erreur:
        print(f"demande refusée : {erreur}", file=sys.stderr)
        return 2
    try:
        reglages = lire_reglages()
        image, graine = produire(ouvrir_moteur(reglages, consigne(demande["illustration"])), reglages, demande)
        image.save(Path(argv[2]) / NOM_SORTIE, format="PNG")
    except BandesNoires as erreur:
        print(f"illustration refusée : {erreur}", file=sys.stderr)
        return 5
    except Exception as erreur:  # noqa: BLE001 - échec franc, message clair
        print(f"échec de génération : {type(erreur).__name__}: {erreur}", file=sys.stderr)
        traceback.print_exc(limit=-6)
        return 4
    print(json.dumps({"modele": reglages["nom"], "largeur": demande["largeur"], "hauteur": demande["hauteur"],
                      "graine": graine, "etapes": reglages["etapes"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
