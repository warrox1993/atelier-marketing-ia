#!/usr/bin/env python3
"""Exporte une révision validée par un humain de l'Observatoire en Markdown vers le dépôt de contenu (git).

# shortcut: pas d'appel HTTP (le script n'en fait nulle part ailleurs) : l'appelant sauvegarde la réponse de
# POST /obs/publications/a-exporter (corps {companyId}, car la route copie en base) et la passe en --liste-a-exporter ; à remplacer par l'appel direct quand l'usine l'orchestre.

Usage : python3 scripts/exporter-observatoire.py (--revision <fichier.json> | --id <revisionId>) --liste-a-exporter <reponse.json> --depot <chemin>
`--id` construit la révision depuis l'entrée de même `id` de la liste (corps = `contenuMd`, article si `articleNumero` est présent) : aucun fichier à assembler ;
une entrée absente est refusée comme pour `--revision`.

`--liste-a-exporter` : réponse de la route, {"copiees", "aPublier": [{"id", "slug", "articleNumero", "langue", "numero", "empreinte", "contenuMd",
"affirmations": [{"id", "texte", "statut", "chapitre", "sourceIds"}], "sources": [{"id", "url"}], "verifieLe", "baseRevisionFr" (en : id de la révision française publiée), "fiche"? (projet : 26 champs {valeur, statut, affirmationId}),
"secondeDecision": {"requise", "motifs", "confirmee"}}]} ; une révision dont la seconde décision est requise et non confirmée est refusée (INJ-9).
Le script ne publie QUE des données du serveur (cette liste) et le corps Markdown approuvé (sous empreinte) : le fichier `revision` ne fournit
que `id`, `langue`, `numero` et `corps`, le reste est ignoré. Titre et chapeau d'un article sont extraits du corps (`# titre`, premier paragraphe).
Le corps est du Markdown pur : tout HTML, attribut `on…=` ou lien `javascript:`/`data:`/`vbscript:` le fait refuser (jamais nettoyé : il est sous empreinte),
sauf dans les blocs de code clôturés et le code en ligne (rendus comme du texte) ; un bloc clôturé non fermé fait refuser le corps.
Chaque citation `[aff:<id>]` hors code devient un numéro de note `[n]` qui mène à l'ancre `#a-<id>` de la liste des affirmations ;
une citation absente de la liste du serveur fait refuser l'export (X3).
Seule source de vérité de l'approbation humaine : le statut déclaré dans le fichier `revision` n'est jamais consulté.

Forme de `revision` (dict) : {"id", "langue": "fr"|"en", "numero", "corps": "<markdown>", "article": {...}?}  (la clé "article" marque un article).

Écrit <depot>/<langue>/projets/<slug>/fiche.md ; un article du magazine (clé "article": {"numero", "slug", "titre", "chapeau"}
à la place de "projet") est écrit dans <depot>/<langue>/magazine/<numero>/<slug>.md, sources en URL. Refus (ExportRefuse) : révision absente de la liste ou empreinte sha256(contenu Markdown) différente (FR-024),
dépôt avec modifications locales (FR-036), fuite détectée par gitleaks. Renvoie le hash du commit, ou None
si le fichier est identique (aucun commit).
Après un commit, la ligne de commande affiche (sur la sortie d'erreur) le corps exact de POST /obs/publications à envoyer
aussitôt : sans lui, la révision reste « à exporter » (X4).
"""
import argparse
import datetime
import hashlib
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

STATUT_EXPORTE = "valide"  # statut enregistré par le serveur à la validation humaine
# T18 : art. 50, §4, al. 2 du règlement (UE) 2024/1689, lu au JO (https://publications.europa.eu/resource/celex/32024R1689) :
# l'examen humain et la responsabilité éditoriale assumée dispensent de la mention « généré par une IA » ; on publie les deux.
# L'éditeur est nommé par la page « Mentions » du site (configuration du site, hors de ce dépôt).
MENTION_EDITORIALE = {
    "fr": "Rédigé avec l'aide d'une IA, relu et approuvé par un humain ; l'éditeur du site en assume la responsabilité éditoriale.",
    "en": "Written with the help of AI, reviewed and approved by a human; the site's publisher takes editorial responsibility for it.",
}
LANGUES = ("fr", "en")
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
STATUTS = ("verifie_experimentalement", "confirme_doc_officielle", "rapporte_editeur", "rapporte_tiers", "infere", "non_verifie", "contredit", "obsolete")
CHAMPS_FICHE = ("nom", "logo", "descriptionCourte", "categorie", "objectifPrincipal", "problemeResolu", "editeur", "siteOfficiel", "depotSource",
                "licence", "derniereVersion", "dateDerniereVersion", "dateVerification", "plateformes", "compatibiliteClaudeMcp", "prerequis", "niveauDifficulte",
                "coutsLicenceCommerciale", "avantages", "limitations", "risquesNotables", "casUsage", "alternatives", "tutorielDemarrage",
                "liensSources", "accesDossierComplet")  # miroir de plugin-atelier/src/contrats/observatoire.ts (formeFiche)
# Catégories (tiroirs) de l'encyclopédie, liste fermée : copie de CATEGORIES_OBS dans plugin-atelier/src/contrats/observatoire.ts
# (et de `categories` dans src/data/encyclopedie.ts du site). Un test de parité vérifie l'égalité avec le contrat TS.
CATEGORIES = ("modeles", "agents", "outils-de-code", "mcp-et-plugins", "retro-ingenierie", "image-et-video", "voix", "reglementation")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# X2 : types de valeur de la fiche, miroir de formeFiche (contrat TS) et de champsFiche (src/content.config.ts du site) ; test de parité.
LISTES_FICHE = ("plateformes", "prerequis", "avantages", "limitations", "risquesNotables", "casUsage", "alternatives")
DATES_FICHE = ("dateDerniereVersion", "dateVerification")
STATUTS_PROUVES = ("verifie_experimentalement", "confirme_doc_officielle")  # STATUTS_PROUVES de src/data/statuts.ts du site
SCHEMAS_DANGEREUX = ("javascript:", "data:", "vbscript:")
AUTOLIEN = re.compile(r"<[a-zA-Z][a-zA-Z0-9+.-]*://[^\s<>]*>")  # <https://…> : Markdown, pas du HTML
BALISE = re.compile(r"<\s*[/!?]?\s*[a-zA-Z]")
ATTRIBUT_EVENEMENT = re.compile(r"(?i)\bon[a-z]{3,}\s*=")
DESTINATION_LIEN = re.compile(r"\]\(\s*<?([^)\s>]*)|^[ ]{0,3}\[[^\]]*\]:\s*<?(\S*)", re.M)
IMAGE = re.compile(r"!\[")  # image Markdown, en ligne ou par référence
URL_NUE = re.compile(r"(?i)(?:https?://|(?<![\w.@/])www\.)[^\s<>()\[\]\"'`]+")  # GFM rend cliquables les URL nues et www.
# V2-2 : caractères invisibles (largeur nulle, contrôles bidirectionnels, balises), même liste que retirerInvisibles du plugin.
CITATION = re.compile(r"\[aff:([^\]\s]+)\]")  # même motif que RE_CITATION de plugin-atelier/src/serveur/observatoire/entrees-porte.ts
INVISIBLES = re.compile("[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\U000e0000-\U000e007f]")


class ExportRefuse(Exception):
    """Export refusé pour une raison explicite (non validée, dépôt sale, secret détecté)."""


def _git(depot, *args, ok=(0,)):
    r = subprocess.run(["git", "-C", str(depot), *args], capture_output=True, text=True)
    if r.returncode not in ok:
        raise ExportRefuse(f"git {' '.join(args)} a échoué : {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout


def _yaml(valeur):
    """Chaîne YAML entre guillemets doubles, échappée."""
    s = str(valeur).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{s}"'


def _liste_yaml(cle, valeurs):
    return [f"{cle}:"] + [f"  - {_yaml(v)}" for v in valeurs] if valeurs else [f"{cle}: []"]


FENCE_OUVRANTE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def _lignes(texte, nom):
    """(dans_code, ligne) pour chaque ligne : les blocs de code clôturés (clôtures comprises) sont du code, que Markdown rend comme du texte.

    Choix du plus sûr : tout ce qui n'est pas reconnu avec certitude comme du code reste contrôlé (clôture indentée de 4 espaces ou
    dans une citation, accent échappé, accents non fermés). Un bloc clôturé jamais refermé est refusé : le rendu en ferait du code
    jusqu'à la fin, mais un autre rendu pourrait le lire autrement."""
    cloture = None
    for ligne in texte.split("\n"):
        if cloture is not None:
            if re.fullmatch(r" {0,3}" + re.escape(cloture[0]) + "{" + str(len(cloture)) + r",}[ \t]*", ligne):
                cloture = None
            yield True, ligne
            continue
        m = FENCE_OUVRANTE.match(ligne)
        if m and not (m.group(1)[0] == "`" and "`" in m.group(2)):  # l'info d'une clôture d'accents n'en contient pas
            cloture = m.group(1)
            yield True, ligne
            continue
        yield False, ligne
    if cloture is not None:
        raise ExportRefuse(f"{nom} contient un bloc de code non fermé : export refusé")


def _sans_code(texte, nom):
    """Texte privé des blocs de code clôturés et du code en ligne (rien n'y est interprété)."""
    return "\n".join(_sans_code_en_ligne(l) for code, l in _lignes(texte, nom) if not code)


def _segments_en_ligne(ligne):
    """(est_code, texte) : codes en ligne (suite de N accents graves refermée par une suite de N exactement, sur la même ligne) et le reste."""
    segments, texte, i = [], [], 0
    while i < len(ligne):
        c = ligne[i]
        if c == "\\":  # accent grave échappé : jamais ouvrant
            texte.append(ligne[i:i + 2])
            i += 2
        elif c == "`":
            n = len(ligne) - i - len(ligne[i:].lstrip("`"))
            fin = next((m.end() for m in re.finditer(r"`+", ligne[i + n:]) if len(m.group()) == n), None)
            if fin is None:
                texte.append("`" * n)
                i += n
            else:
                segments += [(False, "".join(texte)), (True, ligne[i:i + n + fin])]
                texte = []
                i += n + fin
        else:
            texte.append(c)
            i += 1
    return segments + [(False, "".join(texte))]


def _sans_code_en_ligne(ligne):
    return "".join(t for code, t in _segments_en_ligne(ligne) if not code)


def _hors_code(texte, f):
    """Applique f au texte hors code (blocs clôturés et code en ligne laissés tels quels)."""
    return "\n".join(l if code else "".join(t if c else f(t) for c, t in _segments_en_ligne(l)) for code, l in _lignes(texte, "corps"))


def _verifier_markdown(texte, nom, hotes):
    """Refuse (sans nettoyer) tout ce qui n'est pas du Markdown pur : HTML, attribut `on…=`, lien javascript:/data:/vbscript:,
    image, lien vers un hôte qui n'est celui d'aucune source rendue (V2-1).
    Le contenu des blocs de code et du code en ligne, rendu comme du texte, n'est pas contrôlé."""
    texte = _sans_code(texte, nom)
    if BALISE.search(AUTOLIEN.sub("", texte)) or ATTRIBUT_EVENEMENT.search(texte):
        raise ExportRefuse(f"{nom} contient du HTML ou un attribut d'évènement : export refusé")
    _verifier_liens(texte, nom, hotes)


def _hote(destination):
    """Hôte (minuscules) d'une destination absolue, sans schéma (//hôte) ou en www. ; None pour un lien interne ou une ancre."""
    if destination.startswith("www."):
        destination = "//" + destination
    return urlsplit(destination).hostname if destination.startswith(("http://", "https://", "//")) else None


def _verifier_liens(texte, nom, hotes):
    """`hotes` : hôtes des sources rendues par le serveur, seuls autorisés pour un lien (une image n'est jamais autorisée)."""
    if IMAGE.search(texte):
        raise ExportRefuse(f"{nom} contient une image Markdown (contenu tiers chargé par chaque lecteur) : export refusé (V2-1)")
    destinations = [m.group(1) or m.group(2) or "" for m in DESTINATION_LIEN.finditer(texte)]
    destinations += [m.group(0)[1:-1] for m in AUTOLIEN.finditer(texte)] + [m.group(0) for m in URL_NUE.finditer(texte)]
    for brute in destinations:
        # Les entités (&#106;) et caractères de contrôle sont résolus par le rendu Markdown : on compare la destination décodée.
        destination = re.sub(r"[\x00-\x20]", "", html.unescape(brute)).lower()
        if destination.startswith(SCHEMAS_DANGEREUX):
            raise ExportRefuse(f"{nom} contient un lien {destination.split(':')[0]}: : export refusé")
        hote = _hote(destination)
        if hote is not None and hote not in hotes:
            raise ExportRefuse(f"{nom} contient un lien vers {hote}, qui n'est l'hôte d'aucune source rendue : export refusé (V2-1)")


def _date_iso(v):
    try:
        return isinstance(v, str) and bool(DATE.match(v)) and bool(datetime.date.fromisoformat(v))
    except ValueError:
        return False


def _valeur_valide(nom, v):
    """Valeur renseignée de la forme que le site exige : texte non vide, liste de textes non vides, date ISO réelle."""
    texte = lambda x: isinstance(x, str) and x.strip() != ""
    if nom in LISTES_FICHE:
        return isinstance(v, list) and all(texte(x) for x in v)
    if nom in DATES_FICHE:
        return _date_iso(v)
    return nom == "liensSources" or texte(v)  # liensSources : contrôlé plus bas


def _verifier_fiche(fiche, affirmations):
    """Fiche du serveur : exactement les 26 champs {valeur, statut, affirmationId} ; une valeur renseignée est liée à une affirmation.

    X2 : mêmes refus que le schéma du site (affirmation publiée, statut prouvé avec source, valeurs non vides, dates ISO)."""
    sources_de = {a["id"]: a.get("sourceIds") or [] for a in affirmations}
    if not isinstance(fiche, dict) or set(fiche) != set(CHAMPS_FICHE):
        raise ExportRefuse("fiche absente ou dont les champs diffèrent des 26 attendus dans la liste du serveur : export refusé")
    for nom, champ in fiche.items():
        if not isinstance(champ, dict) or set(champ) != {"valeur", "statut", "affirmationId"} or champ["statut"] not in STATUTS:
            raise ExportRefuse(f"fiche : champ {nom!r} invalide (valeur, statut officiel, affirmationId attendus) : export refusé")
        lie = champ["affirmationId"]
        if lie is not None and not (isinstance(lie, str) and GUID.match(lie)):
            raise ExportRefuse(f"fiche : affirmationId du champ {nom!r} n'est pas un GUID : export refusé")
        if champ["valeur"] is not None and lie is None:
            raise ExportRefuse(f"fiche : le champ {nom!r} a une valeur sans affirmation : export refusé")
        if lie is not None and lie not in sources_de:
            raise ExportRefuse(f"fiche : le champ {nom!r} renvoie à une affirmation absente de la liste du serveur : export refusé")
        if champ["statut"] in STATUTS_PROUVES and not sources_de.get(lie):
            raise ExportRefuse(f"fiche : le champ {nom!r} a un statut prouvé sans source liée : export refusé")
        if champ["valeur"] is not None and not _valeur_valide(nom, champ["valeur"]):
            raise ExportRefuse(f"fiche : valeur du champ {nom!r} vide ou de forme invalide (texte, liste de textes ou date AAAA-MM-JJ) : export refusé")
    for nom in ("siteOfficiel", "depotSource"):
        v = fiche[nom]["valeur"]
        if v is not None and not (isinstance(v, str) and re.match(r"(?i)https?://[^\s<>\"]+$", v)):
            raise ExportRefuse(f"fiche : {nom} n'est pas une URL http(s) : export refusé")
    categorie = fiche["categorie"]["valeur"]
    if categorie is not None and categorie not in CATEGORIES:
        raise ExportRefuse(f"fiche : categorie {str(categorie)[:40]!r} hors de la liste fermée {CATEGORIES} : export refusé")
    liens = fiche["liensSources"]["valeur"]
    if liens is not None and not (isinstance(liens, list) and all(isinstance(v, str) and re.match(r"(?i)https?://[^\s<>\"]+$", v) for v in liens)):
        raise ExportRefuse("fiche : liensSources n'est pas une liste d'URL http(s) : export refusé")


def _hotes(sources):
    return {h for x in sources if (h := urlsplit(x["url"].strip().lower()).hostname)}


def _donnees_serveur(entree, avec_fiche):
    """Affirmations, sources, date de vérification et fiche (projet) fournies par le serveur, validées ; rien ne vient du fichier de l'appelant."""
    affirmations, sources, verifie_le = entree.get("affirmations"), entree.get("sources"), entree.get("verifieLe")
    if not isinstance(affirmations, list) or not isinstance(sources, list) or not isinstance(verifie_le, str) or not DATE.match(verifie_le):
        raise ExportRefuse("affirmations, sources ou date de vérification absentes ou invalides dans la liste du serveur : export refusé")
    for a in affirmations:
        if not isinstance(a, dict) or not isinstance(a.get("id"), str) or not GUID.match(a["id"]):
            raise ExportRefuse(f"identifiant d'affirmation invalide (GUID attendu) : {str(a.get('id') if isinstance(a, dict) else a)[:40]!r}")
    if not all(isinstance(x, dict) and isinstance(x.get("id"), str) and isinstance(x.get("url"), str) for x in sources):
        raise ExportRefuse("source invalide dans la liste du serveur : export refusé")
    if not sources:
        raise ExportRefuse("aucune source dans la liste du serveur (le site en exige au moins une) : export refusé")
    for x in sources:
        u = urlsplit(x["url"].strip())
        if u.scheme.lower() not in ("http", "https") or not u.hostname:
            raise ExportRefuse(f"source {x['id']!r} : {x['url'][:60]!r} n'est pas une URL http(s) (le site la refuse) : export refusé")
    hotes = _hotes(sources)
    for a in affirmations:
        _verifier_liens(str(a.get("texte", "")), "texte d'affirmation", hotes)  # le HTML du texte est échappé au rendu
    connues = {x["id"] for x in sources}
    for a in affirmations:
        ids = a.get("sourceIds", [])
        inconnu = [i for i in ids if i not in connues] if isinstance(ids, list) else ["(liste invalide)"]
        if inconnu:
            raise ExportRefuse(f"sourceIds de l'affirmation {a['id']} inconnu(s) des sources du serveur : {inconnu} : export refusé")
    fiche = entree.get("fiche")
    if avec_fiche:
        _verifier_fiche(fiche, affirmations)
    return affirmations, sources, verifie_le, fiche if avec_fiche else None


def _titre_et_chapeau(corps):
    """Titre = première ligne `# ` du corps ; chapeau = premier paragraphe qui suit. Absents : refus."""
    lignes = corps.splitlines()
    debut = next((i for i, l in enumerate(lignes) if l.startswith("# ")), None)
    if debut is None:
        raise ExportRefuse("article sans titre `# ` dans le corps approuvé : export refusé")
    paragraphe = []
    for l in lignes[debut + 1:]:
        if l.strip():
            paragraphe.append(l.strip())
        elif paragraphe:
            break
    if not paragraphe:
        raise ExportRefuse("article sans chapeau (paragraphe après le titre) dans le corps approuvé : export refusé")
    return lignes[debut][2:].strip(), " ".join(paragraphe)


def _sans_titre_ni_chapeau(corps):
    """Corps sans la ligne `# ` ni le paragraphe de chapeau extraits par `_titre_et_chapeau` (le reste, intact)."""
    lignes = corps.splitlines(keepends=True)
    debut = next(i for i, l in enumerate(lignes) if l.startswith("# "))
    i = debut + 1
    while not lignes[i].strip():
        i += 1
    while i < len(lignes) and lignes[i].strip():
        i += 1
    while i < len(lignes) and not lignes[i].strip():
        i += 1
    return "".join(lignes[:debut] + lignes[i:])


def _json_ligne(donnees):
    """JSON sur une ligne, lisible tel quel comme YAML : les séparateurs de ligne YAML (NEL, U+2028, U+2029) restent échappés."""
    brut = json.dumps(donnees, ensure_ascii=False, sort_keys=False)
    return brut.replace("\x85", "\\u0085").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def _renvois(affirmations, sources):
    """{GUID d'affirmation: rangs (à partir de 1) de ses sources dans la liste `sources` de l'en-tête}."""
    rang = {x["id"]: i for i, x in enumerate(sources, 1)}
    return {a["id"]: [rang[i] for i in a.get("sourceIds", [])] for a in affirmations}


def rendre(revision, entree, corps, affirmations, sources, verifie_le, fiche=None):
    """Document publié : métadonnées du serveur, corps approuvé, affirmations du serveur (id GUID, texte échappé HTML)."""
    art = revision.get("article")
    # La ligne technique `base_revision_fr:` du corps (révision native lue par la porte) n'est pas publiée. L'en-tête porte la
    # révision française PUBLIÉE (id du serveur), celle que le site compare au champ `revision` de la version française (T7).
    base = entree.get("baseRevisionFr") if entree["langue"] == "en" else None
    if entree["langue"] == "en" and not (isinstance(base, str) and base.strip()):
        raise ExportRefuse("révision anglaise sans révision française de base dans la liste du serveur : régénérez la liste à exporter (T7)")
    corps = re.sub(r"(?m)^base_revision_fr:.*(\n\n?|$)", "", corps)
    numeros = {x["id"]: i for i, x in enumerate(affirmations, 1)}
    if (inconnue := next((i for i in CITATION.findall(_sans_code(corps, "corps")) if i not in numeros), None)) is not None:
        raise ExportRefuse(f"citation [aff:{inconnue[:40]}] d'une affirmation absente de la liste du serveur : export refusé")
    if art:
        titre, chapeau = (" ".join(re.sub(r"\s*" + CITATION.pattern, "", x).split()) for x in _titre_et_chapeau(corps))  # l'en-tête n'a pas de liens
        corps = _sans_titre_ni_chapeau(corps)  # le gabarit du site affiche déjà titre et chapeau depuis l'en-tête : sinon doublon
        identite = [f"titre: {_yaml(titre)}", f"chapeau: {_yaml(chapeau)}", f"numero: {art['numero']}", f"slug: {_yaml(art['slug'])}"]
    else:
        identite = [f"projet: {_yaml(entree['slug'])}"]
    # X3 : [aff:<id>] devient un numéro de note qui mène à l'ancre de l'affirmation dans la liste publiée.
    corps = _hors_code(corps, lambda t: CITATION.sub(lambda m: f"[\\[{numeros[m.group(1)]}\\]](#a-{m.group(1)})", t))
    tete = [
        "---",
        *identite,
        f"revision: {_yaml(entree['id'])}",
        f"langue: {_yaml(entree['langue'])}",
        f"base_revision_fr: {_yaml(base) if base else 'null'}",
        f"verifie_le: {_yaml(verifie_le)}",
        f"statut: {_yaml(STATUT_EXPORTE)}",
        *_liste_yaml("sources", [x["url"] for x in sources]),
        *_liste_yaml("affirmations", [a["id"] for a in affirmations]),
        *([] if art else [f"renvois: {_json_ligne(_renvois(affirmations, sources))}", f"champs: {_json_ligne(fiche)}"]),
        "---",
        "",
    ]
    lignes = ["", "## Affirmations", ""]
    for a in affirmations:
        texte = html.escape(" ".join(str(a.get("texte", "")).split()))
        lignes.append(f'- <a id="a-{a["id"]}"></a>{texte} ({html.escape(str(a.get("statut", "")))})')
    lignes += ["", f"*{MENTION_EDITORIALE[entree['langue']]}*"]
    return "\n".join(tete) + corps.rstrip("\n") + "\n" + "\n".join(lignes) + "\n"


def _identite(depot):
    """Identité lue dans la configuration git du dépôt ; absente, git garde sa configuration."""
    args = []
    for cle, option in (("user.name", "user.name"), ("user.email", "user.email")):
        r = subprocess.run(["git", "-C", str(depot), "config", "--get", cle], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            args += ["-c", f"{option}={r.stdout.strip()}"]
    return args


def _annuler(depot, rel, existait):
    _git(depot, "reset", "-q", "--", rel, ok=(0, 1))
    if existait:
        _git(depot, "checkout", "--", rel)
    else:
        (Path(depot) / rel).unlink(missing_ok=True)


def _verifier_validation(revision, a_exporter):
    """Refuse toute révision que le serveur n'a pas listée avec l'empreinte exacte du contenu exporté, sa langue et son numéro ; renvoie l'entrée du serveur."""
    entree = next((e for e in a_exporter.get("aPublier", []) if e.get("id") == revision["id"]), None)
    if entree is None:
        raise ExportRefuse(f"révision {revision['id']!r} absente de la liste à exporter (pas de validation humaine) : export refusé (FR-024)")
    empreinte = hashlib.sha256(revision["corps"].encode("utf-8")).hexdigest()
    if empreinte != entree.get("empreinte"):
        raise ExportRefuse(f"empreinte du contenu ({empreinte[:12]}…) différente de celle validée ({str(entree.get('empreinte'))[:12]}…) : export refusé (FR-024)")
    for champ, libelle in (("langue", "langue"), ("numero", "numéro")):
        if revision.get(champ) != entree.get(champ):
            raise ExportRefuse(f"{libelle} du fichier ({revision.get(champ)!r}) différent de celui validé par le serveur ({entree.get(champ)!r}) : export refusé")
    # INJ-9 : première publication du site et article à lien externe exigent une seconde décision humaine, confirmée au serveur.
    decision = entree.get("secondeDecision")
    if not isinstance(decision, dict) or not isinstance(decision.get("requise"), bool):
        raise ExportRefuse("liste sans seconde décision (serveur antérieur au 30/10/2026) : régénérez la liste à exporter (INJ-9)")
    if decision["requise"] and decision.get("confirmee") is not True:
        motifs = ", ".join(str(m) for m in decision.get("motifs", []))
        raise ExportRefuse(f"seconde décision humaine requise ({motifs}) : POST /obs/publications/confirmer puis régénérez la liste (INJ-9)")
    return entree


def exporter(revision, depot, a_exporter):
    depot = Path(depot)
    entree = _verifier_validation(revision, a_exporter)
    # Langue, slug et numéro d'article : valeurs du serveur, jamais celles du fichier de l'appelant.
    art = revision.get("article")
    langue, slug, num_article = entree["langue"], entree.get("slug"), entree.get("articleNumero")
    if num_article is not None and not art:
        raise ExportRefuse("le serveur annonce un article mais la révision n'en est pas un : export refusé")
    if art:
        art = {**art, "numero": num_article, "slug": slug}
        revision = {**revision, "article": art}
    if langue not in LANGUES or not isinstance(slug, str) or not SLUG.match(slug) or (art and not (isinstance(num_article, int) and num_article >= 0)):
        raise ExportRefuse(f"langue, slug ou numéro invalide : {langue!r}, {slug!r}")
    corps = revision["corps"]
    affirmations, sources, verifie_le, fiche = _donnees_serveur(entree, not art)
    _verifier_markdown(corps, "corps approuvé", _hotes(sources))
    if _git(depot, "status", "--porcelain").strip():
        raise ExportRefuse("dépôt de contenu avec modifications locales : export refusé (FR-036)")

    rel = f"{langue}/magazine/{art['numero']}/{slug}.md" if art else f"{langue}/projets/{slug}/fiche.md"
    cible = depot / rel
    if not cible.resolve().is_relative_to(depot.resolve()):
        raise ExportRefuse(f"chemin {rel!r} hors du dépôt (lien symbolique) : export refusé")
    existait = cible.exists()
    contenu = rendre(revision, entree, corps, affirmations, sources, verifie_le, fiche)  # avant toute écriture : un refus ne laisse rien
    if (invisible := INVISIBLES.search(contenu)):
        raise ExportRefuse(f"caractère invisible U+{ord(invisible.group()):04X} dans le contenu à publier : export refusé (V2-2)")
    cible.parent.mkdir(parents=True, exist_ok=True)
    cible.write_text(contenu, encoding="utf-8")
    if not _git(depot, "status", "--porcelain", "--", rel).strip():
        return None  # identique : aucun commit

    _git(depot, "add", "--", rel)
    try:
        r = subprocess.run(["gitleaks", "protect", "--staged", "--redact", "--no-banner"],
                           cwd=depot, capture_output=True, text=True)
    except FileNotFoundError:
        _annuler(depot, rel, existait)
        raise ExportRefuse("gitleaks introuvable : export annulé")
    if r.returncode != 0:
        _annuler(depot, rel, existait)
        raise ExportRefuse(f"gitleaks a refusé l'export : {(r.stdout + r.stderr).strip()}")

    message = f"observatoire: {'article ' + str(art['numero']) + ' ' if art else ''}{slug} révision {entree['numero']} ({langue})"
    try:
        _git(depot, *_identite(depot), "commit", "-q", "-m", message)
    except ExportRefuse:
        _annuler(depot, rel, existait)  # X5 : sinon le fichier reste indexé et FR-036 refuse tous les exports suivants
        raise
    return _git(depot, "rev-parse", "HEAD").strip()


def revision_depuis_liste(identifiant, a_exporter):
    """Révision au format `--revision` bâtie sur l'entrée de la liste ; entrée absente : révision réduite à son id, que exporter() refuse."""
    e = next((e for e in a_exporter.get("aPublier", []) if e.get("id") == identifiant), None)
    if e is None:
        return {"id": identifiant}
    rev = {"id": e["id"], "langue": e.get("langue"), "numero": e.get("numero"), "corps": e.get("contenuMd", "")}
    if e.get("articleNumero") is not None:
        rev["article"] = {"numero": e["articleNumero"], "slug": e.get("slug")}
    return rev


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    source = ap.add_mutually_exclusive_group(required=True)
    source.add_argument("--revision", type=Path, help="fichier JSON de la révision à exporter")
    source.add_argument("--id", help="identifiant d'une révision de la liste à exporter (remplace --revision)")
    ap.add_argument("--liste-a-exporter", required=True, type=Path, help="réponse JSON sauvegardée de POST /obs/publications/a-exporter (corps {companyId})")
    ap.add_argument("--depot", required=True, type=Path, help="dépôt git de contenu")
    args = ap.parse_args(argv)
    try:
        a_exporter = json.loads(args.liste_a_exporter.read_text(encoding="utf-8"))
        revision = revision_depuis_liste(args.id, a_exporter) if args.id else json.loads(args.revision.read_text(encoding="utf-8"))
        h = exporter(revision, args.depot, a_exporter)
    except (ExportRefuse, OSError, ValueError, KeyError) as e:
        print(f"Export refusé : {e}", file=sys.stderr)
        return 1
    print(h if h else "Rien à exporter : fiche identique, aucun commit.")
    if h:
        # X4 : tant que la publication n'est pas enregistrée, la révision reste « à exporter » ; appel exact à faire aussitôt.
        rel = _git(args.depot, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", h).strip()
        corps = {"companyId": "<id de l'entreprise OBS>", "objet": revision["id"],
                 "empreinteArtefact": hashlib.sha256((args.depot / rel).read_bytes()).hexdigest(), "commitContenu": h}
        print(f"À faire maintenant : POST /obs/publications {json.dumps(corps, ensure_ascii=False)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
