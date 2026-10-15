#!/usr/bin/env python3
"""Importe la base clients FICTIVE du courtier de démonstration par les vraies routes du plugin
atelier.marketing-ia, puis lance l'étalonnage du score (segments particulier et entreprise).

Usage : python3 -I scripts/demo/importer-base-clients.py <URL_API> <ID_ENTREPRISE>
Idempotent : si la base contient déjà les clients du même fichier (même nom de fichier et même effectif), rien n'est
réimporté. Les fichiers sont générés par scripts/demo/generer-base-clients.mjs s'ils manquent.
Aucune donnée réelle.
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)
API = sys.argv[1].rstrip("/")
COMPANY = sys.argv[2]
PLUGIN = "/plugins/atelier.marketing-ia/api"
RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DOSSIER = os.path.join(RACINE, "instance", "demo", "base-clients")
FICHIER_BASE = "base-clients.xlsx"
FICHIER_HISTORIQUE = "historique-opportunites.csv"
ATTENDU = 105
FINALITE = "Prospection de clients existants et de prospects ressemblants (démonstration)"

# Colonnes du fichier -> colonnes cibles du plugin (bureau et entité ne sont pas importés).
CORRESPONDANCE = [
    ("identifiant_client", "identifiant_client"), ("type", "type_client"), ("prenom", "prenom"), ("nom", "nom"),
    ("entreprise", "entreprise"), ("numero_bce", "numero_bce"), ("courriel", "courriel"), ("telephone", "telephone"),
    ("code_postal", "code_postal"), ("commune", "commune"), ("produits_detenus", "produits_detenus"),
    ("date_debut", "debut_contrat"), ("statut", "statut_client"), ("consentement_courriel", "consentement_courriel"),
    ("consentement_sms", "consentement_sms"), ("consentement_telephone", "consentement_telephone"),
    ("bureau", "ignorer"), ("entite", "ignorer"),
]


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


def lire_b64(nom):
    with open(os.path.join(DOSSIER, nom), "rb") as f:
        octets = f.read()
    return octets, base64.b64encode(octets).decode("ascii")


def echec(etape, statut, rep):
    print(f"ECHEC {etape} : HTTP {statut}\n{json.dumps(rep, ensure_ascii=False)}")
    sys.exit(1)


def main():
    print(f"== {API} entreprise {COMPANY}")
    # 1) fichiers
    if not (os.path.exists(os.path.join(DOSSIER, FICHIER_BASE)) and os.path.exists(os.path.join(DOSSIER, FICHIER_HISTORIQUE))):
        print("Génération des fichiers de démonstration...")
        r = subprocess.run(["node", os.path.join(RACINE, "scripts", "demo", "generer-base-clients.mjs")], cwd=RACINE)
        if r.returncode != 0:
            print("ECHEC génération des fichiers")
            sys.exit(1)
    octets, b64 = lire_b64(FICHIER_BASE)

    # 2) aperçu (vérifie les colonnes)
    st, rep = api("POST", PLUGIN + "/base-clients/apercu",
                  {"companyId": COMPANY, "nomFichier": FICHIER_BASE, "format": "xlsx", "contenuBase64": b64})
    if st >= 400:
        echec("aperçu", st, rep)
    d = rep.get("data", rep) if isinstance(rep, dict) else rep
    print("Aperçu :", json.dumps({k: (v if k != "apercu" else f"{len(v)} lignes") for k, v in d.items()}, ensure_ascii=False)[:600]
          if isinstance(d, dict) else str(d)[:600])

    # 3) import (idempotent)
    st, rep = api("GET", PLUGIN + f"/base-clients?companyId={COMPANY}")
    if st >= 400:
        echec("état de la base", st, rep)
    etat = rep.get("data", rep) if isinstance(rep, dict) else rep
    nb = (etat or {}).get("clients")
    if (etat or {}).get("existe") and nb == ATTENDU and etat.get("nomFichier") == FICHIER_BASE:
        print(f"Import déjà fait : {nb} clients issus de {FICHIER_BASE}, rien à refaire.")
    else:
        corps = {"companyId": COMPANY, "nomFichier": FICHIER_BASE, "format": "xlsx", "contenuBase64": b64,
                 "correspondance": [{"colonne": c, "cible": t} for c, t in CORRESPONDANCE],
                 "finalite": FINALITE, "dureeConservationMois": 12}
        st, rep = api("POST", PLUGIN + "/base-clients/imports", corps)
        if st >= 400:
            echec("import", st, rep)
        imp = rep.get("data", rep) if isinstance(rep, dict) else rep
        print(f"Import : lues={imp.get('lignesLues')} retenues={imp.get('lignesRetenues')} "
              f"rejetées={imp.get('lignesRejetees')} (attendu retenues={ATTENDU})")
        if imp.get("lignesRejetees"):
            print("Rejets :", json.dumps(imp.get("rejets"), ensure_ascii=False)[:600])
        if imp.get("lignesRetenues") != ATTENDU:
            print("ATTENTION : nombre de lignes retenues différent de l'attendu")
        st, rep = api("GET", PLUGIN + f"/base-clients?companyId={COMPANY}")
        print("État de la base :", json.dumps(rep, ensure_ascii=False)[:500])

    # 4) étalonnage
    _, hb64 = lire_b64(FICHIER_HISTORIQUE)
    code = 0
    for cible in ("particulier", "entreprise"):
        st, rep = api("POST", PLUGIN + "/etalonnages",
                      {"companyId": COMPANY, "segment": {"cible": cible, "nace": []},
                       "historique": {"nomFichier": FICHIER_HISTORIQUE, "format": "csv", "contenuBase64": hb64}})
        if st >= 400:
            print(f"Étalonnage {cible} : HTTP {st} {json.dumps(rep, ensure_ascii=False)[:500]}")
            code = 1
            continue
        e = rep.get("etalonnage", rep)
        print(f"Étalonnage {cible} : statut={e.get('statut')} effectif={e.get('effectif')} "
              f"conversions={e.get('conversions')} méthode={e.get('methode')} brier={e.get('brier')} "
              f"application={json.dumps(rep.get('application'), ensure_ascii=False)[:200]}")

    # 5) ventes croisées : aucune route exposée par le plugin (routes.ts)
    print("Opportunités de vente croisée : aucune route ne les expose (absentes de contrats/routes.ts).")
    sys.exit(code)


main()
