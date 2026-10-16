#!/usr/bin/env python3 -I
"""Peuple la rubrique « Prospects » de l'instance de démonstration d'aperçu (entreprise COU).

Usage : python3 -I scripts/demo/peupler-prospects.py [--api URL] [--pg-port N] [--passerelle-port N]

Chaque réponse est obtenue SIGNÉE auprès d'une passerelle de démonstration (parcours OAuth complet : enregistrement,
consentement, code, jeton, puis tools/call), puis déposée par la vraie route du plugin
POST /plugins/atelier.marketing-ia/api/taches/<issueId>/prospects, en tant que board.

La passerelle d'aperçu (3581) tourne sans clé de signature : le script lance donc SA PROPRE passerelle de
démonstration signée (port 3582 par défaut, clé Ed25519 dans instance/demo-apercu/, hors dépôt), configure sa clé
publique dans le plugin si elle n'y est pas, et enregistre des poids de score (aucune route n'existe : insertion
directe, une fois, dans la table poids_score de la base de l'instance d'aperçu).

Idempotent : le plugin dédoublonne par identifiant ; poids, clé et tâche ne sont créés que s'ils manquent.
ÉTAT : écrit mais NON EXÉCUTÉ (exécution refusée par le classifieur de permissions, à valider par l'opérateur).
"""
import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOSSIER_DEMO = os.path.join(RACINE, "instance", "demo-apercu")
PLUGIN = "/plugins/atelier.marketing-ia/api"
PREFIXE = os.environ.get("ATELIER_PREFIXE", "COU")
TITRE_TACHE = "Prospection habitation Liège (démonstration)"
MAX_PAGES = 5  # pages de 10 résultats déposées au plus, par appel d'outil
POIDS = {  # critères du score expliqué (plugin-atelier/src/serveur/services-prospection.ts)
    "source_registre_officiel": 30, "activite_nace_connue": 15, "courriel_impersonnel": 25,
    "telephone_present": 15, "site_present": 15,
    # Critères B2C (particuliers) : même échelle que le barème SCORE_DEMO_CANAL de l'historique
    # (plugin-atelier/src/serveur/services-base-clients.ts) : devis dans la zone = 50, rendez-vous = 60.
    "origine_demande_personne": 25, "contact_direct": 10, "consentement_actif": 10,
    "produit_demande": 5, "zone_desservie": 10,
}
# (service, outil, arguments) : B2B puis B2C. Les pages suivantes sont lues d'après `pages` de la réponse.
APPELS = [
    ("bce", "bce_rechercher", {"communes": ["Liège"]}),
    ("bce", "bce_rechercher", {"nace": ["43", "68"], "communes": ["Liège"]}),
    ("fsma", "fsma_rechercher", {"communes": ["Liège"]}),
    ("osm", "osm_commerces", {"communes": ["Liège"]}),
    ("b2c", "b2c_demandes_devis", {"consentement": "actif", "dans_zone": True}),
    ("b2c", "b2c_clients", {}),
    ("b2c", "b2c_oppositions", {}),
]


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


def api(base, methode, chemin, corps=None, attendu=None, delai=60):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(base + chemin, data=donnees, method=methode)
    # Mode authentifié (accès à distance) : clé d'API du tableau, facultative et limitée aux destinations sûres.
    ajouter_cle_tableau(req)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=delai) as rep:
            brut = rep.read().decode("utf-8")
            code, sortie = rep.status, (json.loads(brut) if brut else None)
    except urllib.error.HTTPError as err:
        brut = err.read().decode("utf-8", "replace")
        try:
            code, sortie = err.code, json.loads(brut)
        except ValueError:
            code, sortie = err.code, {"brut": brut[:300]}
    if attendu is not None and code not in attendu:
        raise RuntimeError(f"{methode} {chemin} -> {code} : {json.dumps(sortie, ensure_ascii=False)[:500]}")
    return code, sortie


# --------------------------------------------------------------------------- passerelle signée

def ecoute(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def preparer_cle():
    """Clé de signature Ed25519 (0600, hors dépôt) créée une fois ; renvoie (chemin, clé publique SPKI base64)."""
    os.makedirs(DOSSIER_DEMO, mode=0o700, exist_ok=True)
    chemin = os.path.join(DOSSIER_DEMO, "cle-signature.pem")
    if not os.path.exists(chemin):
        subprocess.run(["openssl", "genpkey", "-algorithm", "ed25519", "-out", chemin], check=True)
        os.chmod(chemin, 0o600)
    der = subprocess.run(["openssl", "pkey", "-in", chemin, "-pubout", "-outform", "DER"], check=True, capture_output=True).stdout
    return chemin, base64.b64encode(der).decode()


def lancer_passerelle(port, cle):
    if ecoute(port):
        return f"passerelle déjà présente sur {port}"
    env = {
        "PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", ""),
        "PASSERELLE_MODE": "demonstration", "PASSERELLE_PORT": str(port),
        "PASSERELLE_ETAT": os.path.join(DOSSIER_DEMO, "oauth.json"),
        "PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER": cle,
        # Mélange : osm en données RÉELLES (extrait Geofabrik importé dans instance/donnees/osm/), le reste en démonstration.
        "PASSERELLE_SERVICES_REELS": "osm",
        "PASSERELLE_OSM_INDEX": os.path.join(RACINE, "instance", "donnees", "osm", "osm.sqlite"),
    }
    journal = open(os.path.join(DOSSIER_DEMO, "passerelle-signee.log"), "ab")
    subprocess.Popen(["node", "dist/src/demarrer.js"], cwd=os.path.join(RACINE, "passerelle"), env=env,
                     stdout=journal, stderr=journal, stdin=subprocess.DEVNULL, start_new_session=True)
    fin = time.time() + 20
    while time.time() < fin:
        if ecoute(port):
            return f"passerelle signée lancée sur {port}"
        time.sleep(0.5)
    raise RuntimeError(f"passerelle signée non joignable sur {port} (voir {DOSSIER_DEMO}/passerelle-signee.log)")


class _SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def _http(methode, url, corps=None, entetes=None):
    ouvreur = urllib.request.build_opener(_SansRedirection)
    req = urllib.request.Request(url, data=corps, method=methode, headers=entetes or {})
    try:
        with ouvreur.open(req, timeout=60) as rep:
            return rep.status, dict(rep.headers), rep.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), err.read().decode("utf-8", "replace")


def jeton_service(url, service, redirection):
    """Parcours OAuth complet (DCR + PKCE S256 + consentement « autoriser ») ; renvoie le jeton d'accès."""
    _, _, brut = _http("POST", f"{url}/oauth/register", json.dumps({
        "client_name": "Peuplement des prospects (démonstration)", "redirect_uris": [redirection],
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
        "token_endpoint_auth_method": "none", "application_type": "web"}).encode(), {"Content-Type": "application/json"})
    client_id = json.loads(brut)["client_id"]
    verificateur = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verificateur.encode()).digest()).rstrip(b"=").decode()
    q = urllib.parse.urlencode({"response_type": "code", "client_id": client_id, "redirect_uri": redirection, "state": "peuplement",
                                "code_challenge": challenge, "code_challenge_method": "S256", "resource": f"{url}/mcp/{service}", "scope": "demonstration"})
    code, _, page = _http("GET", f"{url}/oauth/authorize?{q}")
    m = re.search(r'name="transaction" value="([^"]+)"', page)
    if code != 200 or not m:
        raise RuntimeError(f"consentement {service} : HTTP {code}")
    # Le formulaire de consentement demande aussi de choisir la propriété de démonstration (la première).
    prop = re.search(r'name="propriete"[^>]*value="([^"]+)"', page) or re.search(r'value="([^"]+)"[^>]*name="propriete"', page)
    champs = {"transaction": m.group(1), "decision": "autoriser"}
    if prop:
        champs["propriete"] = prop.group(1)
    code, entetes, _ = _http("POST", f"{url}/oauth/authorize", urllib.parse.urlencode(champs).encode(),
                             {"Content-Type": "application/x-www-form-urlencoded"})
    lieu = entetes.get("Location") or entetes.get("location") or ""
    c = urllib.parse.parse_qs(urllib.parse.urlparse(lieu).query).get("code")
    if code != 302 or not c:
        raise RuntimeError(f"consentement {service} : pas de code (HTTP {code})")
    code, _, brut = _http("POST", f"{url}/oauth/token", urllib.parse.urlencode({
        "grant_type": "authorization_code", "code": c[0], "redirect_uri": redirection, "client_id": client_id, "code_verifier": verificateur}).encode(),
        {"Content-Type": "application/x-www-form-urlencoded"})
    if code != 200:
        raise RuntimeError(f"jeton {service} : HTTP {code} {brut[:200]}")
    return json.loads(brut)["access_token"]


def appeler_outil(url, service, jeton, outil, arguments):
    _, _, brut = _http("POST", f"{url}/mcp/{service}", json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": outil, "arguments": arguments}}).encode(),
                       {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": f"Bearer {jeton}"})
    r = json.loads(brut).get("result") or {}
    if r.get("isError"):
        raise RuntimeError(f"{outil} : erreur d'outil {json.dumps(r)[:300]}")
    texte = (r.get("content") or [{}])[0].get("text")
    return {"texte": texte, "structuredContent": r["structuredContent"]}


# --------------------------------------------------------------------------- instance

def trouver_entreprise(base):
    _, liste = api(base, "GET", "/companies", attendu=(200,))
    e = next((c for c in liste if c.get("issuePrefix") == PREFIXE), None)
    if not e:
        raise RuntimeError(f"aucune entreprise de préfixe {PREFIXE}")
    return e["id"]


def trouver_ou_creer_tache(base, cid):
    _, taches = api(base, "GET", f"/companies/{cid}/issues", attendu=(200,))
    taches = taches.get("items", taches) if isinstance(taches, dict) else taches
    t = next((x for x in taches if x.get("title") == TITRE_TACHE), None)
    if t:
        return t["id"], False
    _, t = api(base, "POST", f"/companies/{cid}/issues", {"title": TITRE_TACHE, "description": "Dépôt de démonstration des prospects B2B et B2C.", "status": "todo"}, attendu=(200, 201))
    return t["id"], True


def configurer_cle(base, cid, publique):
    _, rep = api(base, "GET", f"/plugins/atelier.marketing-ia/config?companyId={cid}", attendu=(200,))
    config = dict((rep or {}).get("configJson") or {})
    cles = list(config.get("passerelleClesPubliques") or [])
    if publique in cles:
        return False
    config["passerelleClesPubliques"] = (cles + [publique])[-5:]
    api(base, "POST", "/plugins/atelier.marketing-ia/config", {"companyId": cid, "configJson": config}, attendu=(200, 201))
    return True


def enregistrer_poids(cid, port_pg):
    env = {"PATH": os.environ.get("PATH", ""), "PGPASSWORD": "paperclip"}
    base = ["psql", "-h", "127.0.0.1", "-p", str(port_pg), "-U", "paperclip", "-d", "paperclip", "-Atq", "-v", "ON_ERROR_STOP=1"]
    # Dernière version des poids : une nouvelle version n'est écrite que si elle ne contient pas déjà POIDS
    # (cas d'une instance peuplée avant l'ajout des critères B2C).
    n = subprocess.run(base + ["-c", f"select version, poids::text from plugin_atelier_f0322cc62c.poids_score where company_id='{cid}' order by version desc limit 1"], env=env, capture_output=True, text=True)
    if n.returncode != 0:
        raise RuntimeError(f"base de l'instance d'aperçu illisible : {n.stderr.strip()[:200]}")
    version = 0
    if n.stdout.strip():
        v, poids = n.stdout.strip().split("|", 1)
        version = int(v)
        if all(json.loads(poids).get(cle) == val for cle, val in POIDS.items()):
            return False
    sql = ("insert into plugin_atelier_f0322cc62c.poids_score (company_id, version, poids, decide_par) "
           f"values ('{cid}', {version + 1}, '{json.dumps(POIDS)}'::jsonb, 'démonstration (peupler-prospects.py)')")
    r = subprocess.run(base + ["-c", sql], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"insertion des poids : {r.stderr.strip()[:200]}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:3580/api")
    ap.add_argument("--pg-port", type=int, default=54780)
    ap.add_argument("--passerelle-port", type=int, default=3582)
    a = ap.parse_args()
    base = a.api.rstrip("/")
    url = f"http://127.0.0.1:{a.passerelle_port}"

    cid = trouver_entreprise(base)
    print(f"entreprise {PREFIXE} : {cid}")
    cle, publique = preparer_cle()
    print(lancer_passerelle(a.passerelle_port, cle))
    print("clé publique ajoutée au plugin" if configurer_cle(base, cid, publique) else "clé publique déjà configurée")
    print("poids du score enregistrés (nouvelle version)" if enregistrer_poids(cid, a.pg_port) else "poids du score déjà à jour")
    issue, cree = trouver_ou_creer_tache(base, cid)
    print(f"tâche {issue} ({'créée' if cree else 'existante'})")

    redirection = f"{base}/tools/oauth/callback"
    jetons = {}
    bilan = []
    for service, outil, args in APPELS:
        if service not in jetons:
            jetons[service] = jeton_service(url, service, redirection)
        page, pages = 1, 1
        while page <= min(pages, MAX_PAGES):
            arguments = dict(args, **({"page": page} if page > 1 else {}))
            reponse = appeler_outil(url, service, jetons[service], outil, arguments)
            pages = int(reponse["structuredContent"].get("pages") or 1)
            code, sortie = api(base, "POST", f"{PLUGIN}/taches/{issue}/prospects?companyId={cid}",
                               {"service": service, "outil": outil, "reponse": reponse, "arguments": arguments})
            print(f"[{code}] {outil} page {page}/{pages} :: {json.dumps(sortie, ensure_ascii=False)[:260]}")
            bilan.append((outil, page, code))
            page += 1

    # vérification : liste par cible et par statut
    comptes = {}
    page = 1
    while True:
        _, liste = api(base, "GET", f"{PLUGIN}/prospects?companyId={cid}&parPage=100&vue=complete&page={page}", attendu=(200,))
        lignes = liste.get("lignes") or liste.get("prospects") or liste.get("items") or []
        for p in lignes:
            cle_c = (p.get("cible"), p.get("statut"))
            comptes[cle_c] = comptes.get(cle_c, 0) + 1
        if len(lignes) < 100:
            break
        page += 1
    print("prospects par (cible, statut) :", json.dumps({f"{k[0]}/{k[1]}": v for k, v in sorted(comptes.items(), key=str)}, ensure_ascii=False))
    print("total :", sum(comptes.values()))
    return 0 if all(c in (200, 201) for _, _, c in bilan) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        sys.exit(1)
