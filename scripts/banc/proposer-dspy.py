#!/usr/bin/env python3
"""Propose une version améliorée d'une compétence avec DSPy (optimiseur COPRO) sur le modèle local.

La compétence (SKILL.md) n'est pas réécrite : DSPy cherche un bloc de « points de vigilance » qui, ajouté à la fin
du SKILL.md, améliore les cas du département. La proposition (SKILL.md complet + proposition.json avec les scores
avant / après mesurés par le banc) est déposée HORS du dépôt, dans
~/.local/share/atelier-banc/propositions/<compétence>/<horodatage>/. Elle n'est JAMAIS écrite dans organisation/ :
c'est à un humain de la reprendre si le banc montre un gain sans régression.

Choix de l'optimiseur : COPRO (dspy.teleprompt.COPRO), non marqué expérimental dans DSPy 3.4.1 ; GEPA est marqué
@experimental et n'est pas utilisé.

À lancer avec le venv du banc (DSPy 3.4.1) :
    ~/.local/share/atelier-banc/venv/bin/python -I scripts/banc/proposer-dspy.py --competence relance-amiable-b2b-b2c
        [--departement recouvrement] [--largeur 3] [--profondeur 2] [--sans-phoenix]
"""
import argparse
import json
import os
import re
import sys
import time

# Avant tout import de DSPy / LiteLLM : aucune ressource réseau (table des coûts locale), cache hors dépôt.
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banc_commun as bc  # noqa: E402

os.environ.setdefault("DSPY_CACHEDIR", os.path.join(bc.DOSSIER_BANC, "cache-dspy"))

TITRE_BLOC = "## Points de vigilance issus du banc d'essais"
CONSIGNE_INITIALE = (
    "Applique la compétence fournie au cas donné, en français. Respecte chacune de ses règles et de ses interdits. "
    "N'invente aucune donnée absente du cas : écris « donnée manquante ». Décris les actions que tu poserais "
    "(carte de décision, demande de liaison, brouillon soumis à validation) sans jamais les dire faites."
)
MOTS_FR = {"le", "la", "les", "des", "une", "un", "et", "est", "pour", "dans", "que", "qui", "pas", "aucune",
           "aucun", "sans", "avec", "chaque", "toujours", "jamais", "du", "au", "sur", "ne", "ou"}
MOTS_EN = {"the", "and", "is", "for", "in", "that", "with", "each", "always", "never", "not", "of", "to", "be",
           "you", "your", "any", "must", "should"}


def consigne_initiale(skill: str) -> str:
    """Consigne de départ de COPRO, ancrée sur le domaine de la compétence : sans elle, les candidats proposés par
    le modèle local dérivent vers un domaine inventé (un premier essai a produit un bloc « médical » pour une
    compétence de recouvrement)."""
    nom = re.search(r'^name:\s*"?([^"\n]+)"?\s*$', skill, re.M)
    desc = re.search(r'^description:\s*"?([^"\n]+)', skill, re.M)
    ancre = ""
    if nom:
        ancre += f" Compétence : {nom.group(1).strip()}."
    if desc:
        ancre += " Objet : " + desc.group(1).split(". ")[0].strip()[:300].rstrip(".") + "."
    return CONSIGNE_INITIALE + ancre


def est_francais(texte: str) -> bool:
    mots = re.findall(r"[a-zà-ÿ']+", texte.lower())
    fr = sum(m in MOTS_FR for m in mots)
    en = sum(m in MOTS_EN for m in mots)
    return fr >= 3 and fr > 2 * en


def dossier_propositions() -> str:
    d = os.path.realpath(os.path.join(bc.DOSSIER_BANC, "propositions"))
    racine = os.path.realpath(bc.RACINE)
    if d == racine or d.startswith(racine + os.sep):
        raise bc.ErreurBanc(f"dossier de propositions dans le dépôt refusé : {d}")
    return d


def assembler(skill: str, bloc: str) -> str:
    """SKILL.md d'origine (un éventuel ancien bloc du banc retiré) + nouveau bloc en fin de fichier."""
    base = skill.split("\n" + TITRE_BLOC)[0].rstrip("\n")
    bloc = bloc.strip()
    return f"{base}\n\n{TITRE_BLOC}\n\n{bloc}\n"


def deposer(competence: str, contenu: str, meta: dict, horodatage: str) -> str:
    d = os.path.join(dossier_propositions(), competence, horodatage)
    os.makedirs(d, exist_ok=True)
    chemin = os.path.join(d, "SKILL.md")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(contenu)
    with open(os.path.join(d, "proposition.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return chemin


def optimiser(competence_texte: str, cas: list[dict], ollama: "bc.Ollama", largeur: int, profondeur: int) -> dict:
    import dspy
    from dspy.teleprompt import COPRO

    class LMOllama(dspy.LM):
        """Ollama ne gère pas n > 1 (plusieurs réponses par appel), que COPRO demande pour ses candidats :
        on fait alors n appels successifs à n = 1 et on concatène les réponses."""

        def __call__(self, prompt=None, *, messages=None, **kwargs):
            n = kwargs.pop("n", None) or 1
            if n <= 1:
                return super().__call__(prompt, messages=messages, **kwargs)
            sorties = []
            for _ in range(n):
                sorties += super().__call__(prompt, messages=messages, n=1, **kwargs)
            return sorties

    lm = LMOllama(f"ollama_chat/{ollama.modele}", api_base=ollama.url, api_key="", temperature=0.0,
                  max_tokens=2048, think=False, cache=False)
    dspy.configure(lm=lm)

    class Executer(dspy.Signature):
        __doc__ = consigne_initiale(competence_texte)
        competence: str = dspy.InputField(desc="consigne de la compétence (SKILL.md)")
        cas: str = dspy.InputField(desc="cas d'essai fictif à traiter")
        sortie: str = dspy.OutputField(desc="sortie complète en français, 700 mots au plus")

    programme = dspy.Predict(Executer)
    par_entree = {bc.texte_entree(c): c for c in cas}
    exemples = [dspy.Example(competence=competence_texte, cas=bc.texte_entree(c)).with_inputs("competence", "cas")
                for c in cas]

    def metrique(exemple, prediction, trace=None):
        c = par_entree[exemple.cas]
        return bc.noter(ollama, c, getattr(prediction, "sortie", "") or "")["score"]

    copro = COPRO(metric=metrique, breadth=largeur, depth=profondeur, init_temperature=0.9, track_stats=True)
    meilleur = copro.compile(programme, trainset=exemples, eval_kwargs={"num_threads": 1, "display_progress": False})
    instruction = meilleur.signature.instructions
    stats = getattr(meilleur, "results_best", None)
    return {"instruction": instruction, "stats": stats, "appels_metrique": getattr(meilleur, "total_calls", None)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--competence", required=True)
    ap.add_argument("--departement")
    ap.add_argument("--largeur", type=int, default=3, help="COPRO breadth (> 1)")
    ap.add_argument("--profondeur", type=int, default=2, help="COPRO depth")
    ap.add_argument("--sans-phoenix", action="store_true")
    ap.add_argument("--repetitions", type=int, default=bc.REPETITIONS_DEFAUT,
                    help="répétitions de la mesure avant / après par le banc (défaut 3)")
    ap.add_argument("--ollama", default=bc.OLLAMA_URL)
    ap.add_argument("--modele", default=bc.MODELE_LOCAL)
    a = ap.parse_args(argv)
    import executer as ex
    try:
        if a.largeur < 2:
            raise bc.ErreurBanc("--largeur doit valoir au moins 2 (exigence de COPRO)")
        chemin = os.path.join(bc.RACINE, "organisation", "skills", a.competence, "SKILL.md")
        if not os.path.isfile(chemin):
            raise bc.ErreurBanc(f"compétence introuvable : {chemin}")
        dept = a.departement or ex.domaine_de(chemin)
        cas = [c for c in bc.tous_les_cas() if c["departement"] == dept]
        if not cas:
            raise bc.ErreurBanc(f"aucun cas pour le département {dept} : préciser --departement")
        texte = bc.lire_competence(chemin)
        ollama = bc.Ollama(a.ollama, a.modele)
        import dspy
        print(f"DSPy {dspy.__version__}, COPRO largeur {a.largeur} profondeur {a.profondeur}, modèle {a.modele}")
        t0 = time.monotonic()
        opt = optimiser(texte, cas, ollama, a.largeur, a.profondeur)
        duree_opt = round(time.monotonic() - t0, 1)
        bloc, traduit = opt["instruction"], False
        if not est_francais(bloc):
            r = ollama.discuter("Traduis fidèlement en français, sans rien ajouter. Rends seulement la traduction.",
                                bloc, max_jetons=800)
            bloc, traduit = r["texte"].strip(), True
        horodatage = time.strftime("%Y%m%d-%H%M%S")
        contenu = assembler(texte, bloc)
        meta = {"competence": a.competence, "departement": dept, "modele": a.modele, "dspy": dspy.__version__,
                "optimiseur": "COPRO", "largeur": a.largeur, "profondeur": a.profondeur,
                "duree_optimisation_s": duree_opt, "bloc": bloc, "bloc_traduit": traduit,
                "empreinte_origine": bc.empreinte(texte)[:12], "stats_copro": str(opt["stats"])[:2000]}
        proposition = deposer(a.competence, contenu, meta, horodatage)
        print(f"Proposition déposée (hors dépôt) : {proposition}")
        # Mesure avant / après par le banc lui-même (même cadre pour les deux versions).
        res: dict = {}
        args = ["--competence", a.competence, "--departement", dept, "--version-b", proposition,
                "--ollama", a.ollama, "--modele", a.modele, "--repetitions", str(a.repetitions)] + (["--sans-phoenix"] if a.sans_phoenix else [])
        code = ex.main(args, retour=res)
        if code != 0:
            return code
        meta.update({"score_avant": res["versions"][0]["score"], "score_apres": res["versions"][1]["score"],
                     "ecart_type_avant": res["versions"][0]["ecart_type"],
                     "ecart_type_apres": res["versions"][1]["ecart_type"],
                     "comparaison": res["comparaison"], "resultat_banc": res["fichier"]})
        deposer(a.competence, contenu, meta, horodatage)
        print(f"Avant {meta['score_avant']:.3f} +/- {meta['ecart_type_avant']:.3f} -> après {meta['score_apres']:.3f}"
              f" +/- {meta['ecart_type_apres']:.3f} ; "
              f"retenue : {'oui' if res['comparaison']['b_meilleure_sans_regression'] else 'non'} "
              "(décision humaine : rien n'est copié dans organisation/)")
        return 0
    except bc.ErreurBanc as e:
        print(f"erreur : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
