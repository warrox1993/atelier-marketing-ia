#!/usr/bin/env python3
"""Réindexe les connaissances d'une entreprise de démonstration (vectorisation locale bge-m3).

Il n'existe pas de route de réindexation : chaque document en vigueur est réimporté comme NOUVELLE
VERSION (route `POST /connaissances` avec `documentId`), à partir de son fichier d'origine du corpus
de démonstration (organisation/demo/connaissances/, retrouvé par le nom de fichier de la version).
Rien n'est supprimé ni mis à la corbeille : l'ancienne version est simplement remplacée par la nouvelle.
Les documents au statut « retire » sont laissés tels quels (un import ne peut pas forcer ce statut).

Usage : python3 -I scripts/reindexer-connaissances.py [URL_API] [ID_ENTREPRISE]
Préalable : `connaissancesVectorisation: "local"` dans la configuration du plugin de l'entreprise.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3100/api").rstrip("/")
COMPANY = sys.argv[2] if len(sys.argv) > 2 else "c1c5eb4f-205b-4fcc-b2fe-2bfa1fcaaab8"
PLUGIN = API + "/plugins/atelier.marketing-ia/api"
RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CORPUS = os.path.join(RACINE, "organisation", "demo", "connaissances")


def ajouter_cle_tableau(req):
    """Mode authentifié (accès à distance) : ajoute la clé d'API du tableau (PAPERCLIP_BOARD_KEY), facultative.

    La clé n'est envoyée que vers http://127.0.0.1:<port>, http://localhost:<port> ou https://<nom>.ts.net ;
    ailleurs, rien n'est envoyé (avertissement sans la clé). L'en-tête est « non redirigeable » : il n'est
    jamais recopié lors d'une redirection. (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    cle = os.environ.get("PAPERCLIP_BOARD_KEY")
    if not cle:
        return
    u = urllib.parse.urlsplit(req.full_url)
    h = (u.hostname or "").lower()
    if u.scheme == "http" and h in ("127.0.0.1", "localhost") and u.port is not None:
        autorise = True
    else:
        autorise = u.scheme == "https" and h.endswith(".ts.net") and len(h) > len(".ts.net")
    if autorise:
        req.add_unredirected_header("Authorization", "Bearer " + cle)
    else:
        print("AVERTISSEMENT : PAPERCLIP_BOARD_KEY non envoyée (destination hors 127.0.0.1, localhost et *.ts.net : "
              + (u.hostname or "?") + ").", file=sys.stderr)


def appel(methode, url, corps=None):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(url, data=donnees, method=methode)
    # Mode authentifié (accès à distance) : clé d'API du tableau, facultative et limitée aux destinations sûres.
    ajouter_cle_tableau(req)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as rep:
            brut = rep.read().decode("utf-8")
            return rep.status, (json.loads(brut) if brut else None)
    except urllib.error.HTTPError as err:
        return err.code, {"brut": err.read().decode("utf-8", "replace")[:300]}


def separer_entete(texte):
    """Sépare l'en-tête `---` du corps, comme le fait le plugin pour son import de démonstration."""
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?", texte, re.S)
    if not m:
        return {}, texte
    champs = {}
    for ligne in m.group(1).splitlines():
        cle, _, val = ligne.strip().partition(":")
        champs[cle.strip()] = val.strip().strip('"')
    return champs, texte[m.end():]


def main():
    code, rep = appel("GET", f"{PLUGIN}/connaissances?companyId={COMPANY}")
    if code >= 400:
        raise SystemExit(f"liste impossible : {code} {rep}")
    importes = ignores = echecs = 0
    for ligne in rep["lignes"]:
        doc, ver = ligne["document"], ligne["derniereVersion"]
        nom = ver["nomFichier"]
        chemin = os.path.join(CORPUS, nom)
        if ver["statut"] == "retire" or not os.path.isfile(chemin):
            print(f"  ignoré  {nom} (statut {ver['statut']}, fichier {'présent' if os.path.isfile(chemin) else 'absent'})")
            ignores += 1
            continue
        texte = open(chemin, encoding="utf-8").read()
        if nom.endswith(".csv"):
            octets = texte.encode("utf-8")
        else:
            _, corps_md = separer_entete(texte)
            octets = corps_md.encode("utf-8")
        corps = {"companyId": COMPANY, "documentId": doc["id"], "nomFichier": nom, "format": ver["format"],
                 "contenuBase64": base64.b64encode(octets).decode(), "titre": doc["titre"], "type": doc["type"],
                 "produit": doc.get("produit"), "langue": doc["langue"], "dateDocument": ver["dateDocument"], "valideDu": ver["valideDu"]}
        if ver.get("valideAu"):
            corps["valideAu"] = ver["valideAu"]
        c, r = appel("POST", f"{PLUGIN}/connaissances", corps)
        if c >= 400:
            echecs += 1
            print(f"  ÉCHEC   {nom} : {c} {json.dumps(r, ensure_ascii=False)[:200]}")
        else:
            importes += 1
            print(f"  version {r['version']['version']} demandée pour {nom} (HTTP {c})")
    print(f"bilan : {importes} réimporté(s), {ignores} ignoré(s), {echecs} échec(s)")
    sys.exit(1 if echecs else 0)


if __name__ == "__main__":
    main()
