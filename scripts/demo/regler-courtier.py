#!/usr/bin/env python3
"""Règle l'entreprise de démonstration « Courtier Démo : campagne habitation » (préfixe COU)
comme un courtier en assurances fictif, par les vraies routes du plugin atelier.marketing-ia.

Usage : python3 -I scripts/demo/regler-courtier.py [URL_API] [ID_ENTREPRISE]
Idempotent : la marque n'est réenregistrée que si son contenu change ; les documents déjà
importés sont comptés « dejaImportes » par le plugin. Aucune donnée réelle.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

API = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3580/api").rstrip("/")
COMPANY = sys.argv[2] if len(sys.argv) > 2 else "498b4708-dbe1-41a4-91bb-1d1205d10a38"
TITRE_TACHE_ESSAI = "Prospection habitation Liège (démonstration)"
PLUGIN = "/plugins/atelier.marketing-ia"
RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CORPUS = os.path.join(RACINE, "organisation", "demo", "connaissances")


def api(methode, chemin, corps=None, delai=120):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(API + chemin, data=donnees, method=methode)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=delai) as rep:
            brut = rep.read().decode("utf-8")
            return rep.status, (json.loads(brut) if brut else None)
    except urllib.error.HTTPError as err:
        brut = err.read().decode("utf-8", "replace")
        try:
            return err.code, json.loads(brut)
        except ValueError:
            return err.code, {"brut": brut[:300]}


# --- Bureaux : les 12 de passerelle/src/demo/prospection/particuliers.ts (BUREAUX) ---
BUREAUX = [("liege", "4000", "Liège", "10"), ("ans", "4430", "Ans", "20"), ("herstal", "4040", "Herstal", "5"),
           ("seraing", "4100", "Seraing", "8"), ("verviers", "4800", "Verviers", "12"), ("huy", "4500", "Huy", "3"),
           ("waremme", "4300", "Waremme", "7"), ("spa", "4900", "Spa", "2"), ("eupen", "4700", "Eupen", "9"),
           ("vise", "4600", "Visé", "4"), ("chaudfontaine", "4050", "Chaudfontaine", "6"), ("aywaille", "4920", "Aywaille", "1")]

ENTITES = [
    ("courtier-non-vie", "Courtier Démo, branche non-vie (démonstration)"),
    ("courtier-vie", "Courtier Démo, branche vie (démonstration)"),
    ("courtier-credits", "Courtier Démo, crédits (démonstration)"),
]
MENTION = ("Courtier Démo est une société fictive de démonstration, intermédiaire d'assurance. "
           "Aucun numéro d'agrément réel : à remplacer par la dénomination et le numéro FSMA du client réel. "
           "Les avantages présentés sont toujours accompagnés des risques et conditions.")


def offre(code, nom, description, cible, entite, segments, besoins):
    return {"code": code, "nom": nom, "description": description, "confirmee": True, "cible": cible,
            "segments": segments, "besoinsCouverts": besoins, "argumentsValides": [], "conditions": None,
            "entite": entite, "fournisseur": None}


OFFRES = [
    # Particuliers (B2C)
    offre("auto", "Assurance auto", "RC, omnium et assistance pour les conducteurs de la province de Liège.", "b2c", "courtier-non-vie", ["conducteurs"], ["rouler couvert", "limiter la franchise"]),
    offre("habitation", "Assurance habitation", "Incendie, dégâts des eaux, tempête, vol et bris de vitres, bâtiment et contenu.", "b2c", "courtier-non-vie", ["proprietaires", "locataires"], ["protéger son logement"]),
    offre("hospitalisation", "Assurance hospitalisation", "Frais d'hospitalisation complémentaires.", "b2c", "courtier-non-vie", ["familles"], ["couvrir les frais d'hôpital"]),
    offre("familiale", "Assurance responsabilité familiale", "Responsabilité civile de la famille.", "b2c", "courtier-non-vie", ["familles"], ["couvrir les dégâts causés à autrui"]),
    offre("animaux", "Assurance animaux", "Frais vétérinaires et responsabilité pour chiens et chats.", "b2c", "courtier-non-vie", ["proprietaires-animaux"], ["frais vétérinaires"]),
    offre("obseques", "Assurance obsèques", "Capital pour les frais d'obsèques (offre Sérénité retirée du catalogue).", "b2c", "courtier-vie", ["seniors"], ["préparer ses obsèques"]),
    offre("epargne-pension", "Épargne-pension", "Épargne à long terme pour la pension.", "b2c", "courtier-vie", ["actifs"], ["préparer sa pension"]),
    offre("credit", "Crédit", "Crédit à la consommation et crédit habitation.", "b2c", "courtier-credits", ["proprietaires", "actifs"], ["financer un projet"]),
    # Entreprises (B2B), au même rang
    offre("rc-pro", "RC professionnelle", "Responsabilité civile professionnelle pour indépendants et PME.", "b2b", "courtier-non-vie", ["pme", "independants"], ["couvrir les dommages causés aux clients"]),
    offre("multirisque", "Multirisque entreprise", "Locaux, contenu, pertes d'exploitation.", "b2b", "courtier-non-vie", ["pme", "commerces"], ["protéger les locaux et l'activité"]),
    offre("flotte-auto", "Flotte automobile", "Assurance de flotte avec remises dès 10 véhicules.", "b2b", "courtier-non-vie", ["pme", "transport"], ["assurer plusieurs véhicules"]),
    offre("accidents-travail", "Accidents du travail", "Assurance légale accidents du travail.", "b2b", "courtier-non-vie", ["pme", "independants"], ["respecter l'obligation légale"]),
]
SEGMENTS = [
    ("conducteurs", "Conducteurs", "type_particulier"), ("proprietaires", "Propriétaires", "type_particulier"),
    ("locataires", "Locataires", "type_particulier"), ("familles", "Familles", "type_particulier"),
    ("proprietaires-animaux", "Propriétaires d'animaux", "type_particulier"), ("seniors", "Seniors", "type_particulier"),
    ("actifs", "Actifs de 30 à 55 ans", "type_particulier"),
    ("pme", "PME de la province de Liège", "secteur"), ("independants", "Indépendants et professions libérales", "profession"),
    ("commerces", "Commerces et horeca", "secteur"), ("transport", "Transport et logistique", "secteur"),
]


def referentiel():
    etablissements = [{"code": f"bureau-{i}", "nom": f"Bureau de {nom} (démonstration)", "adresse": f"Rue des Exemples {num}, {cp} {nom}",
                       "confirme": True, "communes": [nom], "codesPostaux": [cp], "entites": [c for c, _ in ENTITES]} for i, cp, nom, num in BUREAUX]
    zones_bureaux = [f"bureau-{i}" for i, *_ in BUREAUX]
    return {
        "identite": ("Courtier Démo (démonstration) : courtier en assurances multi-entités en province de Liège "
                     "(non-vie, vie, crédits), au service des particuliers et des entreprises. Entreprise fictive."),
        "ton": "Sobre, clair et rassurant ; vouvoiement ; jamais de promesse de gain ni de conseil personnalisé dans un contenu marketing.",
        "offres": OFFRES,
        "zones": ["Province de Liège"],
        "etablissements": etablissements,
        "affirmationsAutorisees": [],
        "informationsManquantes": ["Numéro FSMA et mentions légales réelles du client (aucune donnée réelle dans cette démonstration)."],
        "entites": [{"code": c, "nom": n, "type": "entite_juridique", "porteePar": None, "identifiants": [], "mentionsLegales": MENTION} for c, n in ENTITES],
        "segments": [{"code": c, "libelle": l, "type": t, "nace": []} for c, l, t in SEGMENTS],
        "ciblesProspection": [
            {"code": "particuliers-liege", "libelle": "Particuliers de la province de Liège", "cible": "b2c",
             "segments": ["conducteurs", "proprietaires", "locataires", "familles", "seniors", "actifs"],
             "zones": {"etablissements": zones_bureaux, "communes": [], "codesPostaux": [], "provinces": ["Liège"], "regions": []},
             "tailles": [], "offres": ["auto", "habitation", "hospitalisation", "familiale", "obseques", "epargne-pension", "credit"], "entite": None},
            {"code": "entreprises-liege", "libelle": "Entreprises de la province de Liège", "cible": "b2b",
             "segments": ["pme", "independants", "commerces", "transport"],
             "zones": {"etablissements": zones_bureaux, "communes": [], "codesPostaux": [], "provinces": ["Liège"], "regions": []},
             "tailles": ["micro", "petite", "moyenne"], "offres": ["rc-pro", "multirisque", "flotte-auto", "accidents-travail"], "entite": None},
        ],
        "modulesConformite": [{"code": "intermediaire_assurance", "entites": [], "motsInterdits": [], "activeLe": "2026-10-15T00:00:00.000Z", "activePar": "demonstration"}],
    }


def corps_de_base(ref):
    """Seulement la marque classique (champs du schéma Marque)."""
    return {k: ref[k] for k in ("identite", "ton", "offres", "zones", "etablissements", "affirmationsAutorisees", "informationsManquantes")}


def action(cle, params):
    return api("POST", f"{PLUGIN}/actions/{cle}", {"companyId": COMPANY, "params": params})


def donnee(cle, params=None):
    return api("POST", f"{PLUGIN}/data/{cle}", {"companyId": COMPANY, "params": params or {}})


def regler_marque():
    ref = referentiel()
    code, vue = donnee("atelier.marque")
    actuelle = ((vue or {}).get("data") or {}).get("marque")
    # Comparaison sur ce que le plugin conserve réellement (marque classique) ; les champs étendus
    # ne servent pas à décider (l'enregistrement installé peut les ignorer, voir l'affichage final).
    if actuelle and all(actuelle.get(k) == ref[k] for k in ("identite", "ton", "zones")) \
            and [o.get("nom") for o in actuelle.get("offres", [])] == [o["nom"] for o in ref["offres"]] \
            and [e.get("nom") for e in actuelle.get("etablissements", [])] == [e["nom"] for e in ref["etablissements"]] \
            and len(actuelle.get("entites") or []) == len(ref.get("entites") or []):
        print(f"[marque] déjà réglée (version {actuelle['version']}), rien à réenregistrer.")
        return actuelle, "inchangée"
    code, rep = action("atelier.marque.enregistrer", ref)
    mode = "référentiel étendu"
    if code >= 400:
        print(f"[marque] référentiel étendu refusé ({code}) : {json.dumps(rep, ensure_ascii=False)[:400]}")
        code, rep = action("atelier.marque.enregistrer", corps_de_base(ref))
        mode = "marque seule (champs étendus REFUSÉS par le schéma)"
    if code >= 400:
        raise SystemExit(f"[marque] échec : {code} {json.dumps(rep, ensure_ascii=False)[:500]}")
    marque = rep.get("data", rep) if isinstance(rep, dict) else rep
    return marque, mode


def entete(texte):
    m = re.match(r"^---\n(.*?)\n---\n", texte, re.S)
    meta = {}
    for ligne in (m.group(1).splitlines() if m else []):
        cle, _, val = ligne.partition(":")
        meta[cle.strip()] = val.strip().strip('"')
    return meta


METAS_CSV = {"grille-franchises-plafonds-2026.csv": ("Grille des franchises et plafonds 2026 (démonstration)", "conditions_generales", "multi"),
             "remises-flotte-2026.csv": ("Remises de flotte 2026 (démonstration)", "tarif", "flotte_automobile")}


def importer_un_par_un():
    importes = refuses = deja = 0
    for nom in sorted(os.listdir(CORPUS)):
        if nom == "LISEZ-MOI.md":
            continue
        brut = open(os.path.join(CORPUS, nom), "rb").read()
        if nom.endswith(".csv"):
            titre, type_, produit = METAS_CSV[nom]
            meta = {"langue": "fr", "date_document": "2026-01-01", "valide_du": "2026-01-01", "valide_au": "2026-12-31"}
            fmt = "csv"
        else:
            meta = entete(brut.decode("utf-8"))
            titre, type_, produit, fmt = meta["titre"], meta["type"], meta.get("produit"), "markdown"
        corps = {"companyId": COMPANY, "nomFichier": nom, "format": fmt, "contenuBase64": base64.b64encode(brut).decode(), "titre": titre,
                 "type": type_, "produit": produit, "langue": meta["langue"], "dateDocument": meta["date_document"], "valideDu": meta["valide_du"]}
        if meta.get("valide_au"):
            corps["valideAu"] = meta["valide_au"]
        code, rep = api("POST", f"{PLUGIN}/api/connaissances", corps)
        if code >= 400:
            refuses += 1
            print(f"  refusé {nom} : {code} {json.dumps(rep, ensure_ascii=False)[:200]}")
        else:
            importes += 1
    return {"importes": importes, "refuses": refuses, "dejaImportes": deja}


def importer_corpus():
    code, rep = api("POST", f"{PLUGIN}/api/connaissances/demonstration", {"companyId": COMPANY})
    if code in (404,) or (code >= 400 and "introuvable" in json.dumps(rep, ensure_ascii=False).lower()):
        print(f"[connaissances] route de démonstration indisponible ({code}) : import fichier par fichier.")
        return importer_un_par_un(), "fichier par fichier"
    if code >= 400:
        raise SystemExit(f"[connaissances] échec : {code} {json.dumps(rep, ensure_ascii=False)[:500]}")
    return rep, "route de démonstration"


def main():
    marque, mode = regler_marque()
    print(f"[marque] {mode} : version {marque.get('version')}, offres={len(marque.get('offres', []))}, "
          f"établissements={len(marque.get('etablissements', []))}, zones={marque.get('zones')}, "
          f"entités={len(marque.get('entites', []))}, segments={len(marque.get('segments', []))}, "
          f"cibles={len(marque.get('ciblesProspection', []))}, modules={[m.get('code') for m in marque.get('modulesConformite', [])]}")
    if not marque.get("entites"):
        print("[marque] SIGNALEMENT : les champs étendus du référentiel (entités, segments, cibles, module intermediaire_assurance) "
              "sont acceptés par la route mais NON conservés par l'enregistrement installé (seuls les champs de la marque classique le sont).")
    print(f"[marque] identité : {marque.get('identite')}")
    bilan, route = importer_corpus()
    print(f"[connaissances] via {route} : {json.dumps(bilan, ensure_ascii=False)}")
    # Tâche d'essai : celle des prospects de démonstration de l'entreprise, créée au besoin.
    _, taches = api("GET", f"/companies/{COMPANY}/issues")
    taches = taches if isinstance(taches, list) else (taches or {}).get("issues", [])
    tache = next((t for t in taches if t.get("title") == TITRE_TACHE_ESSAI), None)
    if tache is None:
        _, tache = api("POST", f"/companies/{COMPANY}/issues", {"title": TITRE_TACHE_ESSAI, "description": "Tâche d'essai de démonstration.", "status": "todo"})
    code, rep = api("POST", f"{PLUGIN}/api/taches/{tache['id']}/connaissances/recherche", {"question": "franchise dégâts des eaux habitation"})
    print(f"[recherche] HTTP {code}")
    texte = json.dumps(rep, ensure_ascii=False, indent=1)
    print(texte[:3000])
    ok = code < 400 and "cg-habitation-2026" in texte.lower() and "275" in texte
    print("[recherche] cite cg-habitation-2026 et 275 € :", "OUI" if ok else "NON")
    sys.exit(0 if ok else 1)


main()
