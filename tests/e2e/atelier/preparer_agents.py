#!/usr/bin/env python3
"""Prépare l'organisation d'ESSAI sur l'instance jetable : agents déterministes et clés de données factices.

Bascule les agents de l'organisation d'ESSAI en agents `process` déterministes (aucun modèle, aucun coût).

L'organisation modèle « Rénovation Liège (démonstration) » (nom historique du registre) est créée en mode reel par
`bootstrap-organisation.py appliquer` : ses agents sont alors des agents claude_local en pause. Sur une instance
JETABLE d'essai, ce script les remplace, par l'API de l'instance, par le harnais déterministe
plugin-atelier/demo/agent-demo.mjs (la Porte de contrôle garde son programme déterministe), puis les remet en service.
Elle pose aussi les deux clés de données du plugin (secrets natifs ALÉATOIRES de l'instance jetable : `donneesCleChiffrement`
et `donneesCleHmac`), sans lesquelles le mode réel refuse d'enregistrer le moindre prospect. Idempotent.

Usage : python3 -I tests/e2e/atelier/preparer_agents.py <URL_API> [nom de l'entreprise] [code du scénario]
"""
import json
import os
import sys
import urllib.error
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PLUGIN = os.path.join(RACINE, "plugin-atelier")
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3590/api").rstrip("/")
NOM = sys.argv[2] if len(sys.argv) > 2 else "Rénovation Liège (démonstration)"
SCENARIO = sys.argv[3] if len(sys.argv) > 3 else "B"


def api(methode, chemin, corps=None):
    donnees = None if corps is None else json.dumps(corps).encode()
    req = urllib.request.Request(URL + chemin, data=donnees, method=methode, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            brut = r.read()
            return r.status, (json.loads(brut) if brut else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:400]


def slug(nom):
    import unicodedata
    base = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode().lower()
    return "-".join("".join(c if c.isalnum() else " " for c in base).split())


def poser_cles_donnees(cid):
    """Deux secrets natifs aléatoires et distincts, référencés dans la configuration du plugin (sans toucher aux autres clés)."""
    import base64
    import secrets as alea
    code, rep = api("GET", f"/plugins/atelier.marketing-ia/config?companyId={cid}")
    config = dict((rep or {}).get("configJson") or {}) if code == 200 and isinstance(rep, dict) else {}
    _, existants = api("GET", f"/companies/{cid}/secrets")
    par_cle = {x.get("key"): x for x in (existants or [])}
    for cle, taille in (("donneesCleChiffrement", 32), ("donneesCleHmac", 32)):
        if isinstance(config.get(cle), dict) and config[cle].get("secretId"):
            continue
        cle_secret = "atelier-essai-" + cle
        if cle_secret in par_cle:
            sid = par_cle[cle_secret]["id"]
        else:
            valeur = base64.b64encode(alea.token_bytes(taille)).decode()
            code, sec = api("POST", f"/companies/{cid}/secrets", {"name": f"Clé d'essai ({cle})", "key": cle_secret, "value": valeur})
            if code not in (200, 201):
                print(f"Secret {cle} refusé : HTTP {code} {sec}", file=sys.stderr)
                return False
            sid = sec["id"]
        config[cle] = {"type": "secret_ref", "secretId": sid}
    code, rep = api("POST", "/plugins/atelier.marketing-ia/config", {"companyId": cid, "configJson": config})
    if code != 200:
        print(f"Configuration du plugin refusée : HTTP {code} {rep}", file=sys.stderr)
        return False
    return True


def principal():
    code, societes = api("GET", "/companies")
    liste = societes if isinstance(societes, list) else (societes or {}).get("items", [])
    cible = [c for c in liste if c.get("name") == NOM]
    if len(cible) != 1:
        print(f"Entreprise « {NOM} » introuvable ou ambiguë ({len(cible)}).", file=sys.stderr)
        return 1
    cid = cible[0]["id"]
    _, agents = api("GET", f"/companies/{cid}/agents")
    bascules = 0
    for a in agents:
        if a.get("status") == "terminated":
            continue
        _, d = api("GET", f"/agents/{a['id']}")
        if True:
            config = {"command": "node", "args": ["demo/agent-demo.mjs", slug(a["name"]), SCENARIO], "cwd": PLUGIN, "timeoutSec": 300}
            code, rep = api("PATCH", f"/agents/{a['id']}", {"adapterType": "process", "adapterConfig": config, "replaceAdapterConfig": True})
            if code != 200:
                print(f"Bascule refusée pour {a['name']} : HTTP {code} {rep}", file=sys.stderr)
                return 1
            bascules += 1
        if a.get("status") == "paused":
            api("POST", f"/agents/{a['id']}/resume")
    if not poser_cles_donnees(cid):
        return 1
    print(f"{bascules} agent(s) basculé(s) en process déterministe sur {NOM} ({cid}).")
    return 0


if __name__ == "__main__":
    sys.exit(principal())
