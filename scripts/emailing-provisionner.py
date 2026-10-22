#!/usr/bin/env python3
"""Provisionnement idempotent de listmonk pour l'atelier (appelé par scripts/emailing-installer.sh).

Ce que fait le script, une fois listmonk démarré (127.0.0.1:19000) :
  1. ouvre une session avec le super-administrateur créé à l'installation (identifiants lus dans
     ~/.config/atelier/emailing-listmonk.env, jamais affichés) ;
  2. crée DEUX rôles à droits réduits et DEUX utilisateurs d'API :
       - « atelier-gestion » : listes, abonnés, brouillons de campagne. AUCUN droit d'envoi (campaigns:send) ;
       - « atelier-envoi »   : le changement d état des campagnes (envoi) et la lecture des listes et abonnés pour compter les destinataires, réservé à la route humaine de l'atelier ;
     les jetons sont rangés dans ~/.config/atelier/ (0600) et ne sont affichés nulle part ;
  3. règle l'envoi sur Mailpit (serveur SMTP de TEST : rien ne sort de la machine), le suivi individuel coupé et
     la désinscription activée ;
  3 bis. supprime les listes et abonnés d'EXEMPLE créés par listmonk à l'installation (« Default list », « Opt-in list », john@example.com,
     anon@example.com) tant qu'ils sont vides ou ne contiennent que ces abonnés ; les listes de l'atelier ne sont jamais touchées ;
  4. crée le gabarit de campagne « atelier-corps » (corps seul : le pied de page de désinscription est ajouté par
     le connecteur, une seule fois).
Relancer le script ne crée rien en double.
"""
from __future__ import annotations

import http.cookiejar
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("EMAILING_LISTMONK_URL", "http://127.0.0.1:19000")
CONFIG = Path.home() / ".config" / "atelier"

ROLES = {
    "atelier-gestion": [
        "settings:get",
        "lists:get_all", "lists:manage_all", "subscribers:get", "subscribers:get_all", "subscribers:manage",
        "campaigns:get", "campaigns:get_all", "campaigns:manage", "campaigns:manage_all", "templates:get",
    ],
    "atelier-envoi": ["settings:get", "lists:get_all", "subscribers:get", "subscribers:get_all", "campaigns:get", "campaigns:get_all", "campaigns:manage", "campaigns:manage_all", "campaigns:send"],
}
UTILISATEURS = {"atelier-gestion": "emailing-passerelle.jeton", "atelier-envoi": "emailing-envoi.jeton"}
GABARIT = "atelier-corps"
CORPS_GABARIT = '{{ template "content" . }}'
SMTP_TEST = {
    "name": "mailpit-test", "enabled": True, "host": "atelier-mailpit", "hello_hostname": "", "port": 1025,
    "auth_protocol": "none", "username": "", "password": "", "email_headers": [], "max_conns": 2,
    "max_msg_retries": 1, "msg_retry_delay": "10ms", "idle_timeout": "15s", "wait_timeout": "5s",
    "tls_type": "none", "tls_skip_verify": False, "from_addresses": [],
}


def lire_env(chemin: Path) -> dict[str, str]:
    donnees: dict[str, str] = {}
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        m = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_]*)=(.*)", ligne.strip())
        if m:
            donnees[m.group(1)] = m.group(2)
    return donnees


class Client:
    def __init__(self) -> None:
        self.cookies = http.cookiejar.CookieJar()
        self.ouvreur = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies), _SansRedirection())

    def connecter(self, utilisateur: str, mot_de_passe: str) -> None:
        corps = urllib.parse.urlencode({"username": utilisateur, "password": mot_de_passe, "next": "/admin"}).encode()
        req = urllib.request.Request(BASE + "/admin/login", data=corps, method="POST")
        try:
            self.ouvreur.open(req, timeout=20)
        except urllib.error.HTTPError as e:
            if e.code != 302:
                raise SystemExit(f"connexion à listmonk refusée (HTTP {e.code})")
        if not any(c.name == "session" for c in self.cookies):
            raise SystemExit("connexion à listmonk refusée (aucune session)")

    def appel(self, methode: str, chemin: str, corps: object | None = None) -> dict:
        donnees = None if corps is None else json.dumps(corps).encode()
        req = urllib.request.Request(BASE + chemin, data=donnees, method=methode, headers={"Content-Type": "application/json"})
        try:
            with self.ouvreur.open(req, timeout=30) as rep:
                texte = rep.read().decode()
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            raise SystemExit(f"{methode} {chemin} : HTTP {e.code} {detail}")
        return json.loads(texte) if texte.strip() else {}


class _SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # noqa: D401 - la connexion répond par une redirection 302 voulue
        return None


def ecrire_secret(chemin: Path, contenu: str) -> None:
    fd = os.open(chemin, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(contenu)
    os.chmod(chemin, 0o600)


LISTES_EXEMPLE = {"Default list", "Opt-in list"}
ABONNES_EXEMPLE = {"john@example.com", "anon@example.com"}


def nettoyer_exemples(c: Client) -> None:
    """Retire les listes d'exemple vides (ou n'ayant que les abonnés d'exemple), puis les abonnés d'exemple. Idempotent."""
    for liste in c.appel("GET", "/api/lists?per_page=all&minimal=false")["data"]["results"]:
        if liste["name"] not in LISTES_EXEMPLE:
            continue
        abonnes = c.appel("GET", f"/api/subscribers?list_id={liste['id']}&per_page=all")["data"]["results"]
        if all(a["email"].lower() in ABONNES_EXEMPLE for a in abonnes):
            c.appel("DELETE", f"/api/lists/{liste['id']}")
            print(f"liste d'exemple supprimée : {liste['name']}")
        else:
            print(f"liste d'exemple conservée (elle contient des abonnés réels) : {liste['name']}")
    for a in c.appel("GET", "/api/subscribers?per_page=all")["data"]["results"]:
        if a["email"].lower() in ABONNES_EXEMPLE:
            c.appel("DELETE", f"/api/subscribers/{a['id']}")
            print(f"abonné d'exemple supprimé : {a['email']}")


def main() -> int:
    env = lire_env(CONFIG / "emailing-listmonk.env")
    c = Client()
    c.connecter(env["LISTMONK_ADMIN_USER"], env["LISTMONK_ADMIN_PASSWORD"])

    # 1. Rôles à droits réduits
    roles = {r["name"]: r for r in c.appel("GET", "/api/roles/users")["data"]}
    for nom, droits in ROLES.items():
        if nom not in roles:
            roles[nom] = c.appel("POST", "/api/roles/users", {"name": nom, "permissions": droits})["data"]
            print(f"rôle créé : {nom}")
        elif sorted(roles[nom]["permissions"]) != sorted(droits):
            c.appel("PUT", f"/api/roles/users/{roles[nom]['id']}", {"name": nom, "permissions": droits})
            print(f"rôle mis à jour : {nom}")

    # 2. Utilisateurs d'API et jetons (le jeton n'est rendu qu'à la création : régénéré s'il manque sur le disque)
    existants = {u["username"]: u for u in c.appel("GET", "/api/users")["data"]}
    for nom, fichier in UTILISATEURS.items():
        chemin = CONFIG / fichier
        if nom in existants and chemin.exists() and chemin.stat().st_size > 0:
            continue
        if nom in existants:
            c.appel("DELETE", f"/api/users/{existants[nom]['id']}")
        rep = c.appel("POST", "/api/users", {
            "username": nom, "email": f"{nom}@atelier.local", "name": nom, "type": "api", "status": "enabled",
            "password_login": False, "user_role_id": roles[nom]["id"], "list_role_id": None,
        })["data"]
        jeton = rep.get("password") or ""
        if not jeton:
            raise SystemExit(f"listmonk n'a pas rendu de jeton pour {nom}")
        ecrire_secret(chemin, f"{nom}:{jeton}\n")
        print(f"utilisateur d'API créé : {nom} (jeton rangé dans {chemin}, non affiché)")

    # 3. Réglages : SMTP de test (Mailpit), suivi individuel coupé, désinscription active
    reglages = c.appel("GET", "/api/settings")["data"]
    voulus = {
        "app.root_url": "http://127.0.0.1:19000",
        "app.from_email": "Atelier (test) <test@atelier.local>",
        "privacy.individual_tracking": False,
        "privacy.unsubscribe_header": True,
        "privacy.allow_blocklist": True,
        # Rien de public : ni page d'inscription publique (listes visibles par n'importe qui), ni archive de campagnes, ni appel de vérification de version.
        "app.enable_public_subscription_page": False,
        "app.enable_public_archive": False,
        "app.check_updates": False,
        "smtp": [SMTP_TEST],
    }
    ecart = {k: v for k, v in voulus.items() if reglages.get(k) != v and k != "smtp"}
    smtp_actuel = reglages.get("smtp") or []
    smtp_ok = len(smtp_actuel) == 1 and all(smtp_actuel[0].get(k) == SMTP_TEST[k] for k in ("host", "port", "auth_protocol", "tls_type", "enabled"))
    if ecart or not smtp_ok:
        reglages.update(voulus)
        # listmonk ne rend pas les mots de passe SMTP : une valeur vide dans la mise à jour n'écrase rien d'utile ici.
        c.appel("PUT", "/api/settings", reglages)
        print("réglages appliqués (SMTP de test : Mailpit) ; listmonk redémarre")
        import time
        time.sleep(6)
        c = Client()
        c.connecter(env["LISTMONK_ADMIN_USER"], env["LISTMONK_ADMIN_PASSWORD"])

    # 3 bis. Listes et abonnés d'exemple de l'installation
    nettoyer_exemples(c)

    # 4. Gabarit de campagne sans pied de page
    gabarits = c.appel("GET", "/api/templates")["data"]
    if not any(g["name"] == GABARIT for g in gabarits):
        c.appel("POST", "/api/templates", {"name": GABARIT, "type": "campaign", "subject": "", "body": CORPS_GABARIT})
        print(f"gabarit créé : {GABARIT}")
    print("provisionnement terminé")
    return 0


if __name__ == "__main__":
    sys.exit(main())
