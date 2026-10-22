"""Briques communes du banc d'essais des compétences (Lot 4).

Lecture des cas d'essai des études docs/etude-usine-v2, appels HTTP à Phoenix et à Ollama (boucle locale
seulement), notation des sorties (vérifications par code quand c'est sûr, sinon juge local) et appel borné à
Claude Code (`claude -p`) pour le jugement final. Bibliothèque standard uniquement : les tests remplacent Phoenix,
Ollama et `claude` par des faux.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import ipaddress
import json
import os
import re
import subprocess
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ETUDES = [
    "docs/etude-usine-v2/groupe-1-gouvernance-personnes.md",
    "docs/etude-usine-v2/groupe-2-commerce-client.md",
    "docs/etude-usine-v2/groupe-3-finance-operations-tech.md",
    "docs/etude-usine-v2/groupe-4-marketing-expert.md",
]
# Dossier de travail hors dépôt : propositions, résultats, cache. Jamais organisation/.
DOSSIER_BANC = os.environ.get("ATELIER_BANC_DIR", os.path.expanduser("~/.local/share/atelier-banc"))
PHOENIX_URL = os.environ.get("ATELIER_PHOENIX_URL", "http://127.0.0.1:6006")
OLLAMA_URL = os.environ.get("ATELIER_OLLAMA_URL", "http://127.0.0.1:11434")
MODELE_LOCAL = os.environ.get("ATELIER_BANC_MODELE", "qwen3.5:9b")
# Juge Claude : Sonnet par défaut (quota Max) ; Opus seulement sur option explicite (--modele-claude opus).
MODELE_CLAUDE_DEFAUT = "sonnet"
PREFIXE_JEU = "banc-"
# Pièces fictives des cas : tests/banc/pieces/<département>/<clé du cas>/ (voir LISEZ-MOI.md de ce dossier).
DOSSIER_PIECES = os.path.join("tests", "banc", "pieces")
# Plafond de texte injecté par cas (la fenêtre du modèle local est de 16 384 jetons).
PLAFOND_PIECES = 12000
REPETITIONS_DEFAUT = 3

# Noms de départements irréguliers -> dossier de organisation/services (ou « marketing », porté par organisation/agents).
SLUGS_IRREGULIERS = {
    "hygiene-securite-et-environnement": "hse",
    "comptabilite-et-finance": "comptabilite-finance",
    "donnees-et-bi": "donnees-bi",
    "recherche-et-innovation": "recherche-innovation",
    "gestion-de-projets": "gestion-projets",
}


class ErreurBanc(Exception):
    pass


# --------------------------------------------------------------------------------------------- outils texte

def slugifier(texte: str) -> str:
    t = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def normaliser(texte: str) -> str:
    """Minuscules, sans accents, apostrophes et espaces unifiés : pour comparer des fragments."""
    t = texte.replace("’", "'").replace(" ", " ").replace(" ", " ")
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", t).strip()


def empreinte(texte: str) -> str:
    return hashlib.sha256(texte.encode("utf-8")).hexdigest()


def maintenant() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


# --------------------------------------------------------------------------------------------- cas d'essai

_TITRE_DEPT = re.compile(r"^## (\d+)\. (.+?)\s*$")
_TITRE_CAS = re.compile(r"^### (\d+)\.3 Cas d'essai")
_ITEM = re.compile(r"^(\d+)\. \*\*(.+?)\*\*\s*(.*)$")
_CHAMPS = re.compile(r"(Entrée|Sortie attendue|Sortie|Critères?)(?:\s*\([^)]*\))?\s*:\s*")


def _slug_departement(titre: str) -> str:
    m = re.search(r"`services/([a-z0-9-]+)`", titre)
    if m:
        return m.group(1)
    if "organisation/agents" in titre:
        return "marketing"
    nom = re.sub(r"\(.*?\)", "", titre).strip()
    s = slugifier(nom)
    return SLUGS_IRREGULIERS.get(s, s)


def decouper_criteres(texte: str) -> list[str]:
    texte = texte.strip().rstrip(".").strip()
    morceaux = re.split(r"\s*;\s*|\s+(?=\([a-h]\)\s)", texte)
    sortie = []
    for m in morceaux:
        m = re.sub(r"^\([a-h]\)\s*", "", m.strip()).strip().rstrip(".").strip()
        if m:
            sortie.append(m)
    # Une étude énumère parfois ses critères par des virgules seulement (aucun « ; ») : on les sépare alors.
    if len(sortie) == 1 and ", " in sortie[0] and ";" not in texte:
        sortie = [m.strip() for m in sortie[0].split(", ") if m.strip()]
    return sortie


def _analyser_item(texte: str) -> dict:
    parties = _CHAMPS.split(texte)
    champs: dict[str, str] = {}
    # parties = [avant, nom1, val1, nom2, val2, ...]
    for i in range(1, len(parties) - 1, 2):
        nom = parties[i]
        cle = {"Entrée": "entree", "Sortie attendue": "sortie_attendue", "Sortie": "sortie_attendue"}.get(nom, "criteres")
        champs[cle] = (champs.get(cle, "") + " " + parties[i + 1]).strip()
    return champs


def lire_cas(chemin_etude: str, groupe: int) -> list[dict]:
    """Rend les cas d'essai d'une étude (une liste de dictionnaires), avec leur provenance (fichier et ligne)."""
    with open(chemin_etude, encoding="utf-8") as f:
        lignes = f.read().splitlines()
    rel = os.path.relpath(chemin_etude, RACINE)
    cas: list[dict] = []
    dept = None
    dans_cas = False
    courant = None

    def clore():
        nonlocal courant
        if courant is None:
            return
        champs = _analyser_item(" ".join(courant["texte"]))
        manquants = [c for c in ("entree", "sortie_attendue", "criteres") if not champs.get(c)]
        if manquants:
            raise ErreurBanc(f"{rel}:{courant['ligne']} : champ(s) absent(s) {manquants}")
        criteres = decouper_criteres(champs["criteres"])
        cas.append({
            "cle": f"g{groupe}-{dept['num']}.3.{courant['numero']}",
            "groupe": groupe,
            "departement": dept["slug"],
            "departement_nom": dept["nom"],
            "numero": courant["numero"],
            "titre": courant["titre"].rstrip("."),
            "entree": champs["entree"],
            "sortie_attendue": champs["sortie_attendue"],
            "criteres": criteres,
            "source": f"{rel}:{courant['ligne']}",
        })
        courant = None

    for n, ligne in enumerate(lignes, 1):
        m = _TITRE_DEPT.match(ligne)
        if m:
            clore()
            dans_cas = False
            nom = re.sub(r"\s*\(`.*?`\)", "", m.group(2)).strip()
            dept = {"num": m.group(1), "nom": nom, "slug": _slug_departement(m.group(2))}
            continue
        if ligne.startswith("### "):
            clore()
            dans_cas = bool(_TITRE_CAS.match(ligne))
            continue
        if not dans_cas:
            continue
        if ligne.strip() == "---":
            clore()
            dans_cas = False
            continue
        mi = _ITEM.match(ligne)
        if mi:
            clore()
            courant = {"numero": int(mi.group(1)), "titre": mi.group(2), "texte": [mi.group(3)], "ligne": n}
        elif courant is not None and ligne.strip():
            courant["texte"].append(ligne.strip())
    clore()
    return cas


def lire_pieces(racine: str, departement: str, cle: str) -> tuple[list[dict], list[dict]]:
    """Pièces fictives d'un cas (dossier tests/banc/pieces/<département>/<clé>/) et critères vérifiables par code.

    Rend (pièces, critères_code). Pièces : [{"nom", "contenu"}] triées par nom, `criteres.json` exclu.
    """
    d = os.path.join(racine, DOSSIER_PIECES, departement, cle)
    if not os.path.isdir(d):
        return [], []
    pieces, criteres = [], []
    for nom in sorted(os.listdir(d)):
        chemin = os.path.join(d, nom)
        if not os.path.isfile(chemin):
            continue
        with open(chemin, encoding="utf-8") as f:
            contenu = f.read()
        if nom == "criteres.json":
            criteres = json.loads(contenu)
        else:
            pieces.append({"nom": nom, "contenu": contenu})
    return pieces, criteres


def tous_les_cas(racine: str = RACINE) -> list[dict]:
    cas = []
    for i, rel in enumerate(ETUDES, 1):
        cas += lire_cas(os.path.join(racine, rel), i)
    for c in cas:
        c["pieces"], c["criteres_code"] = lire_pieces(racine, c["departement"], c["cle"])
    return cas


def texte_entree(cas: dict) -> str:
    """Entrée du cas telle que la voit le modèle : l'énoncé de l'étude, puis les pièces fictives injectées."""
    texte = cas["entree"]
    pieces = cas.get("pieces") or []
    if pieces:
        texte += "\n\nPièces fournies (fictives, à utiliser telles quelles) :"
        for p in pieces:
            texte += f"\n\n### Pièce « {p['nom']} »\n{p['contenu'].rstrip()}"
    return texte


def departements_valides(racine: str = RACINE) -> set[str]:
    d = os.path.join(racine, "organisation", "services")
    return {n for n in os.listdir(d) if os.path.isdir(os.path.join(d, n))} | {"marketing"}


# --------------------------------------------------------------------------------------------- HTTP local

def verifier_boucle_locale(url: str) -> str:
    hote = urllib.parse.urlsplit(url).hostname or ""
    try:
        ok = hote == "localhost" or ipaddress.ip_address(hote).is_loopback
    except ValueError:
        ok = False
    if not ok:
        raise ErreurBanc(f"adresse refusée (boucle locale seulement) : {url}")
    return url.rstrip("/")


def http_json(methode: str, url: str, corps=None, delai: float = 60.0):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(url, data=donnees, method=methode,
                                 headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=delai) as r:
            brut = r.read()
    except urllib.error.HTTPError as e:
        detail = e.read()[:500].decode("utf-8", "replace")
        raise ErreurBanc(f"{methode} {url} : HTTP {e.code} {detail}") from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise ErreurBanc(f"{methode} {url} : {e}") from None
    return json.loads(brut) if brut.strip() else None


class Phoenix:
    """Accès minimal à l'API REST de Phoenix (jeux de données et expériences)."""

    def __init__(self, url: str = PHOENIX_URL):
        self.url = verifier_boucle_locale(url)

    def jeu_par_nom(self, nom: str):
        r = http_json("GET", f"{self.url}/v1/datasets?name={urllib.parse.quote(nom)}")
        for d in (r or {}).get("data", []):
            if d.get("name") == nom:
                return d
        return None

    def exemples(self, jeu_id: str) -> dict:
        return http_json("GET", f"{self.url}/v1/datasets/{jeu_id}/examples")["data"]

    def versions(self, jeu_id: str) -> list:
        return http_json("GET", f"{self.url}/v1/datasets/{jeu_id}/versions")["data"]

    def envoyer_jeu(self, action: str, nom: str, description: str, entrees, sorties, metas, ids) -> dict:
        corps = {"action": action, "name": nom, "description": description, "inputs": entrees,
                 "outputs": sorties, "metadata": metas, "example_ids": ids}
        return http_json("POST", f"{self.url}/v1/datasets/upload?sync=true", corps)["data"]

    def creer_experience(self, jeu_id: str, nom: str, description: str, meta: dict, version_id=None,
                         repetitions: int = 1) -> dict:
        corps = {"name": nom, "description": description, "metadata": meta, "repetitions": repetitions}
        if version_id:
            corps["version_id"] = version_id
        return http_json("POST", f"{self.url}/v1/datasets/{jeu_id}/experiments", corps)["data"]

    def ajouter_execution(self, exp_id: str, exemple_id: str, sortie, debut: str, fin: str, erreur=None,
                          repetition: int = 1) -> str:
        corps = {"dataset_example_id": exemple_id, "output": sortie, "repetition_number": repetition,
                 "start_time": debut, "end_time": fin}
        if erreur:
            corps["error"] = erreur
        return http_json("POST", f"{self.url}/v1/experiments/{exp_id}/runs", corps)["data"]["id"]

    def ajouter_evaluation(self, run_id: str, nom: str, genre: str, score, libelle, explication, debut, fin):
        corps = {"experiment_run_id": run_id, "name": nom, "annotator_kind": genre, "start_time": debut,
                 "end_time": fin, "result": {"score": score, "label": libelle, "explanation": explication}}
        return http_json("POST", f"{self.url}/v1/experiment_evaluations", corps)


class Ollama:
    def __init__(self, url: str = OLLAMA_URL, modele: str = MODELE_LOCAL):
        self.url = verifier_boucle_locale(url)
        self.modele = modele

    def version(self) -> str:
        return http_json("GET", f"{self.url}/api/version", delai=10)["version"]

    def discuter(self, systeme: str, utilisateur: str, schema=None, temperature: float = 0.0,
                 max_jetons: int = 2048, graine: int = 42) -> dict:
        corps = {"model": self.modele, "stream": False, "think": False,
                 "messages": [{"role": "system", "content": systeme}, {"role": "user", "content": utilisateur}],
                 "options": {"temperature": temperature, "seed": graine, "num_predict": max_jetons}}
        if schema is not None:
            corps["format"] = schema
        r = http_json("POST", f"{self.url}/api/chat", corps, delai=600)
        return {"texte": r["message"]["content"], "jetons_entree": r.get("prompt_eval_count", 0),
                "jetons_sortie": r.get("eval_count", 0), "duree_s": r.get("total_duration", 0) / 1e9}


# --------------------------------------------------------------------------------------------- notation

_FRAGMENTS = re.compile(r"«\s*([^»]+?)\s*»|`([^`]+)`")
_NEGATION = re.compile(r"(^|\W)(aucun|aucune|jamais|sans|pas de|pas d'|ni|0)(\W|$)|n'est pas|ne \w+ pas")


def fragments(critere: str) -> list[str]:
    return [a or b for a, b in _FRAGMENTS.findall(critere)]


def contient(sortie: str, fragment: str) -> bool:
    s, f = normaliser(sortie), normaliser(fragment)
    if not f:
        return False
    motif = (r"(?<![a-z0-9])" if f[0].isalnum() else "") + re.escape(f) + (r"(?![a-z0-9])" if f[-1].isalnum() else "")
    return re.search(motif, s) is not None


def contient_un(sortie: str, fragment: str) -> bool:
    """Fragment éventuellement à variantes (« a|b ») : vrai si l'une des variantes figure dans la sortie."""
    return any(contient(sortie, v) for v in fragment.split("|"))


_NOMBRE_MILLIERS = re.compile(r"\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*")


def extraire_nombres(texte: str) -> list[float]:
    """Tous les nombres d'un texte, quelle que soit la graphie : « 1 815,00 », « 1.815,00 », « 1815.00 », « 94,97 ».

    Un séparateur isolé suivi d'exactement trois chiffres (« 1.815 ») est ambigu : les deux lectures sont rendues.
    Le signe est ignoré (un écart de -3 000 donne 3000).
    """
    t = texte.replace("\u00a0", " ").replace("\u202f", " ")
    valeurs: list[float] = []
    for brut in _NOMBRE_MILLIERS.findall(t):
        s = brut.replace(" ", "")
        if "." in s and "," in s:
            dec = max(s.rfind("."), s.rfind(","))
            candidats = [s[:dec].replace(".", "").replace(",", "") + "." + s[dec + 1:]]
        else:
            sep = "." if "." in s else ("," if "," in s else None)
            if sep is None:
                candidats = [s]
            elif s.count(sep) > 1:
                candidats = [s.replace(sep, "")]
            else:
                entier, frac = s.split(sep)
                candidats = [entier + "." + frac]
                if len(frac) == 3:
                    candidats.append(entier + frac)
        for c in candidats:
            try:
                valeurs.append(float(c))
            except ValueError:
                pass
    return valeurs


def presente(valeurs: list[float], n: float) -> bool:
    return any(abs(v - n) < 0.005 for v in valeurs)


def verifier_critere_piece(spec: dict, sortie: str) -> tuple[bool, str]:
    """Critère chiffré ou textuel tiré d'une pièce fictive (criteres.json) : toujours tranché par code.

    Clés reconnues (toutes facultatives, toutes exigées quand elles sont présentes) : `nombres` (tous présents),
    `un_parmi` (au moins un présent), `nombres_interdits` (aucun présent), `mots` (tous présents, variantes « a|b »),
    `interdits` (aucun présent).
    """
    valeurs = extraire_nombres(sortie)
    manque = [n for n in spec.get("nombres", []) if not presente(valeurs, n)]
    if spec.get("un_parmi") and not any(presente(valeurs, n) for n in spec["un_parmi"]):
        manque.append("un parmi " + " / ".join(f"{n:g}".replace(".", ",") for n in spec["un_parmi"]))
    interdits = [n for n in spec.get("nombres_interdits", []) if presente(valeurs, n)]
    mots_manquants = [m for m in spec.get("mots", []) if not contient_un(sortie, m)]
    mots_interdits = [m for m in spec.get("interdits", []) if contient_un(sortie, m)]
    problemes = []
    if manque:
        problemes.append("nombre(s) absent(s) : " + ", ".join(
            m if isinstance(m, str) else f"{m:g}".replace(".", ",") for m in manque))
    if interdits:
        problemes.append("nombre(s) interdit(s) présent(s) : " + ", ".join(f"{n:g}".replace(".", ",") for n in interdits))
    if mots_manquants:
        problemes.append("fragment(s) absent(s) : " + ", ".join(mots_manquants))
    if mots_interdits:
        problemes.append("fragment(s) interdit(s) présent(s) : " + ", ".join(mots_interdits))
    if problemes:
        return False, "code (pièce) : " + " ; ".join(problemes)
    return True, "code (pièce) : valeurs attendues retrouvées"


def verification_code(critere: str, sortie: str):
    """Vérification par code, seulement quand elle est sûre. Rend (bool, explication) ou None (juge nécessaire).

    Fragment cité (« … » ou `…`) dans un critère négatif : absent de la sortie -> réussi, sans juge.
    Fragment cité dans un critère positif : absent -> échoué, sans juge. Dans les autres cas, le juge tranche.
    """
    frs = fragments(critere)
    if not frs:
        return None
    negatif = _NEGATION.search(normaliser(critere)) is not None
    presents = [f for f in frs if contient(sortie, f)]
    if negatif and not presents:
        return True, "code : aucun fragment interdit (" + " / ".join(frs) + ")"
    if not negatif:
        absents = [f for f in frs if f not in presents]
        if absents:
            return False, "code : fragment exigé absent (" + " / ".join(absents) + ")"
    return None


SCHEMA_JUGE = {
    "type": "object",
    "properties": {"raison": {"type": "string"}, "verdict": {"type": "string", "enum": ["oui", "non"]}},
    "required": ["raison", "verdict"],
}

# La raison est demandée avant le verdict : le modèle justifie puis tranche.
CONSIGNE_JUGE = (
    "Tu es un correcteur. On te donne un cas d'essai, sa sortie attendue (référence), la sortie produite par un agent "
    "et UN critère. Lis le critère selon son intention, à la lumière de la sortie attendue, sans t'attacher aux mots "
    "exacts : il est satisfait si la sortie fait ce qu'il demande, même formulé autrement. Il n'est pas satisfait si "
    "la sortie fait l'inverse, l'omet ou invente une donnée absente de l'entrée. "
    "Réponds en JSON : {\"raison\": \"une phrase\", \"verdict\": \"oui\"|\"non\"}."
)


def juger_critere(ollama: Ollama, cas: dict, sortie: str, critere: str) -> tuple[bool, str]:
    texte = (f"Entrée du cas : {texte_entree(cas)}\n\nSortie attendue (référence) : {cas['sortie_attendue']}\n\n"
             f"Critère à vérifier : {critere}\n\n--- Sortie de l'agent ---\n{sortie}\n--- fin ---")
    r = ollama.discuter(CONSIGNE_JUGE, texte, schema=SCHEMA_JUGE, max_jetons=300)
    try:
        d = json.loads(r["texte"])
        return d.get("verdict") == "oui", "juge local : " + str(d.get("raison", ""))[:300]
    except (json.JSONDecodeError, AttributeError):
        return False, "juge local : réponse illisible"


def noter(ollama: Ollama, cas: dict, sortie: str) -> dict:
    details = []
    for c in cas["criteres"]:
        v = verification_code(c, sortie)
        if v is not None:
            ok, pourquoi, source = v[0], v[1], "code"
        else:
            ok, pourquoi = juger_critere(ollama, cas, sortie, c)
            source = "juge-local"
        details.append({"critere": c, "reussi": bool(ok), "source": source, "explication": pourquoi})
    for spec in cas.get("criteres_code") or []:
        ok, pourquoi = verifier_critere_piece(spec, sortie)
        details.append({"critere": spec["critere"], "reussi": bool(ok), "source": "code-piece", "explication": pourquoi})
    n = len(details)
    return {"score": (sum(d["reussi"] for d in details) / n) if n else 0.0, "details": details}


# --------------------------------------------------------------------------------------------- exécution d'un cas

CADRE_CAS = (
    "Cas d'essai du banc (données fictives). Tu n'as accès à aucun outil : décris précisément les actions que tu "
    "poserais (carte de décision, demande de liaison, brouillon) au lieu de dire qu'elles sont faites. Si une "
    "pièce n'est que décrite, travaille sur sa description ; si une donnée manque, écris « donnée manquante » "
    "plutôt que de l'inventer.\n\nEntrée : {entree}\n\nProduis ta sortie complète, en français, en 700 mots au plus."
)


def lire_competence(chemin: str) -> str:
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def executer_cas(ollama: Ollama, consigne: str, cas: dict, temperature: float = 0.0, graine: int = 42) -> dict:
    return ollama.discuter(consigne, CADRE_CAS.format(entree=texte_entree(cas)), temperature=temperature,
                           max_jetons=2048, graine=graine)


# --------------------------------------------------------------------------------------------- répétitions

def moyenne(valeurs: list[float]) -> float:
    return sum(valeurs) / len(valeurs) if valeurs else 0.0


def ecart_type(valeurs: list[float]) -> float:
    """Écart-type d'échantillon (n - 1) ; 0 pour une seule valeur."""
    if len(valeurs) < 2:
        return 0.0
    m = moyenne(valeurs)
    return (sum((v - m) ** 2 for v in valeurs) / (len(valeurs) - 1)) ** 0.5


def decision_version(a: dict, b: dict) -> dict:
    """Règle du banc : B n'est retenue que si sa moyenne dépasse celle de A de PLUS d'un écart-type combiné
    (racine de la somme des carrés des écarts-types des deux versions) ET sans recul de la moyenne d'un cas.

    Avec une seule répétition (écart-types nuls), la règle redevient « B > A sans recul »."""
    sa, sb = a.get("ecart_type", 0.0), b.get("ecart_type", 0.0)
    combine = (sa ** 2 + sb ** 2) ** 0.5
    ecart = b["score"] - a["score"]
    reculs = [ca["cle"] for ca, cb in zip(a["cas"], b["cas"]) if cb["score"] < ca["score"] - 1e-9]
    return {"ecart": round(ecart, 4), "ecart_type_combine": round(combine, 4), "reculs": reculs,
            "depasse_un_ecart_type": ecart > combine + 1e-9,
            "b_meilleure_sans_regression": bool(ecart > combine + 1e-9 and not reculs)}


# --------------------------------------------------------------------------------------------- juge Claude

def appeler_claude(prompt: str, commande=None, delai: float = 300.0, modele=None) -> dict:
    """Un appel `claude -p --output-format json`. Vérifie is_error et subtype ; rend le JSON décodé du résultat."""
    cmd = commande or os.environ.get("ATELIER_CLAUDE", "claude")
    args = [cmd, "-p", "--output-format", "json", "--no-session-persistence", "--strict-mcp-config",
            "--setting-sources", "project", "--disable-slash-commands"]
    args += ["--model", modele or MODELE_CLAUDE_DEFAUT]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA"}
    os.makedirs(DOSSIER_BANC, exist_ok=True)
    p = subprocess.run(args, input=prompt, capture_output=True, text=True, timeout=delai, env=env, check=False,
                       cwd=DOSSIER_BANC)
    if p.returncode != 0:
        raise ErreurBanc(f"claude -p : code {p.returncode} : {p.stderr.strip()[:300]}")
    try:
        enveloppe = json.loads(p.stdout)
    except json.JSONDecodeError:
        raise ErreurBanc("claude -p : sortie non JSON") from None
    if enveloppe.get("is_error") or enveloppe.get("subtype") != "success":
        raise ErreurBanc(f"claude -p : échec (is_error={enveloppe.get('is_error')}, subtype={enveloppe.get('subtype')})")
    texte = str(enveloppe.get("result", ""))
    m = re.search(r"\{.*\}", texte, re.S)
    if not m:
        raise ErreurBanc("claude -p : aucun objet JSON dans le résultat")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        raise ErreurBanc("claude -p : objet JSON illisible dans le résultat") from None


def prompt_claude(cas: dict, sortie_a: str, sortie_b: str) -> str:
    criteres = "\n".join(f"- {c}" for c in list(cas["criteres"]) + [s["critere"] for s in cas.get("criteres_code") or []])
    return (
        "Tu es juge d'un banc d'essais. Compare deux sorties (X et Y) produites pour le même cas avec deux versions "
        "d'une consigne. Juge seulement sur les critères donnés ; une donnée inventée compte contre la sortie. "
        "N'utilise aucun outil. Réponds UNIQUEMENT par un objet JSON : "
        "{\"meilleure\": \"X\"|\"Y\"|\"egalite\", \"criteres_X\": <nombre de critères satisfaits>, "
        "\"criteres_Y\": <nombre>, \"raison\": \"deux phrases au plus\"}.\n\n"
        f"Entrée : {texte_entree(cas)}\n\nSortie attendue : {cas['sortie_attendue']}\n\nCritères :\n{criteres}\n\n"
        f"=== Sortie X ===\n{sortie_a}\n\n=== Sortie Y ===\n{sortie_b}\n"
    )
