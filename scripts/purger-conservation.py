#!/usr/bin/env python3
"""Purge des journaux et des documents de tâches d'une instance au terme de la durée de conservation (DROIT-1.4, RGPD art. 5, § 1, e).

Décision de l'opérateur du 30/10/2026 : 3 ans sans contact, puis purge des listes et des journaux qui en contiennent. Les journaux
de runs et d'opérations (`data/run-logs/`, `data/workspace-operation-logs/` sous l'instance) recopient la sortie des agents,
numéros compris, et ne sont purgés par rien d'autre : ce script retire les fichiers plus vieux que la durée (date de
dernière modification). À blanc par défaut ; `--confirmer` supprime. Il ne touche ni la base, ni les pièces jointes, ni
les sauvegardes (rotation de sauvegarde-hors-machine.sh).

Documents : par l'API du socle (clé board), pour chaque entreprise, les documents des tâches terminées ou annulées dont
la dernière modification ET celle de la tâche précèdent la durée (révisions comprises : DELETE …/documents/<clé>,
cascade du socle). Un document verrouillé (409) est signalé, jamais forcé.

Usage : python3 scripts/purger-conservation.py --instance instance/instances/<id> [--api URL] [--jours 1095] [--confirmer]
Codes de sortie : 0 succès, 1 purge incomplète (document verrouillé), 2 réglage refusé, 3 API injoignable ou réponse inexploitable.
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

JOURS_PAR_DEFAUT = 3 * 365
JOURS_MINIMUM = 365  # garde-fou : une faute de frappe ne détruit pas des journaux récents (preuves d'audit)
DOSSIERS_JOURNAUX = ("data/run-logs", "data/workspace-operation-logs")
API_DEFAUT = "http://127.0.0.1:3100"
DELAI_SECONDES = 20
TAILLE_PAGE = 1000  # plafond du socle (ISSUE_LIST_MAX_LIMIT)
STATUTS_CLOS = ("done", "cancelled")


def anciens(instance, limite):
    """Fichiers des dossiers de journaux dont la dernière modification précède `limite` (secondes depuis l'époque)."""
    for rel in DOSSIERS_JOURNAUX:
        for dossier, _, fichiers in os.walk(os.path.join(instance, rel)):
            for nom in fichiers:
                chemin = os.path.join(dossier, nom)
                if not os.path.islink(chemin) and os.path.getmtime(chemin) < limite:
                    yield chemin


def retirer_dossiers_vides(instance):
    for rel in DOSSIERS_JOURNAUX:
        racine = os.path.join(instance, rel)
        for dossier, _, _ in sorted(os.walk(racine), key=lambda x: -len(x[0])):
            if dossier != racine and not os.listdir(dossier):
                os.rmdir(dossier)


def lire_cle_fichier(port) -> str | None:
    """Clé board lue dans un fichier 0600 hors dépôt : ATELIER_CLE_BOARD_FICHIER, sinon ~/.config/atelier/board-<port>.key.

    Absent : None (mode local_trusted, comportement historique). Fichier qui ne m'appartient pas, ouvert au groupe
    ou aux autres, ou contenu invalide : ignoré avec un avertissement. Créé par scripts/passer-en-mode-authentifie.sh.
    (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    chemin = os.environ.get("ATELIER_CLE_BOARD_FICHIER") or os.path.join(
        os.path.expanduser("~"), ".config", "atelier", f"board-{port}.key")
    try:
        st = os.stat(chemin)
    except OSError:
        return None
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        print(f"AVERTISSEMENT : {chemin} ignoré (il doit m'appartenir et être en 0600).", file=sys.stderr)
        return None
    try:
        with open(chemin, encoding="utf-8") as f:
            cle = f.read().strip()
    except OSError:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.-]{16,512}", cle):
        print(f"AVERTISSEMENT : contenu de {chemin} invalide : clé non envoyée.", file=sys.stderr)
        return None
    return cle


def ajouter_cle_tableau(req):
    """Mode authentifié : ajoute la clé d'API du tableau (board), facultative.

    Source : PAPERCLIP_BOARD_KEY si elle est définie, sinon le fichier de clé de l'instance visée
    (lire_cle_fichier, seulement vers la boucle locale). Sans clé, la requête part sans jeton (local_trusted).
    La clé n'est envoyée que vers http://127.0.0.1:<port>, http://localhost:<port> ou https://<nom>.ts.net ;
    ailleurs, rien n'est envoyé (avertissement sans la clé). L'en-tête est « non redirigeable » : il n'est
    jamais recopié lors d'une redirection. (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    u = urllib.parse.urlsplit(req.full_url)
    h = (u.hostname or "").lower()
    boucle_locale = u.scheme == "http" and h in ("127.0.0.1", "localhost") and u.port is not None
    cle = os.environ.get("PAPERCLIP_BOARD_KEY") or (lire_cle_fichier(u.port) if boucle_locale else None)
    if not cle:
        return
    if boucle_locale:
        autorise = True
    else:
        autorise = u.scheme == "https" and h.endswith(".ts.net") and len(h) > len(".ts.net")
    if autorise:
        req.add_unredirected_header("Authorization", "Bearer " + cle)
    else:
        print("AVERTISSEMENT : PAPERCLIP_BOARD_KEY non envoyée (destination hors 127.0.0.1, localhost et *.ts.net : "
              + (u.hostname or "?") + ").", file=sys.stderr)


class ErreurApi(Exception):
    pass


def appeler(base, methode, chemin, parametres=None):
    """Requête JSON vers le socle. Rend (code, corps) pour 2xx et 409 ; lève ErreurApi sinon."""
    url = base.rstrip("/") + chemin + ("?" + urllib.parse.urlencode(parametres) if parametres else "")
    req = urllib.request.Request(url, method=methode)
    ajouter_cle_tableau(req)
    try:
        with urllib.request.urlopen(req, timeout=DELAI_SECONDES) as reponse:
            return reponse.status, json.load(reponse)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return 409, None
        raise ErreurApi(f"l'API a répondu HTTP {e.code} sur {methode} {chemin}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ErreurApi(f"API injoignable ({base}) : {e}")
    except ValueError:
        raise ErreurApi(f"réponse non JSON sur {methode} {chemin}")


def liste(corps, nom):
    if not isinstance(corps, list):
        raise ErreurApi(f"réponse inattendue pour {nom} (liste attendue)")
    return corps


def avant(horodatage, limite):
    """Date ISO 8601 du socle antérieure à `limite` (secondes depuis l'époque) ; date absente ou illisible : non."""
    try:
        return datetime.datetime.fromisoformat(str(horodatage)).timestamp() < limite
    except ValueError:
        return False


def documents_anciens(base, limite):
    """(tâche, clé) des documents des tâches closes dont le document et la tâche précèdent `limite`."""
    for entreprise in liste(appeler(base, "GET", "/api/companies")[1], "companies"):
        eid = urllib.parse.quote(str(entreprise.get("id")), safe="")
        for statut in STATUTS_CLOS:
            debut = 0
            while True:
                page = liste(appeler(base, "GET", f"/api/companies/{eid}/issues",
                                     {"status": statut, "limit": TAILLE_PAGE, "offset": debut})[1], "issues")
                for tache in page:
                    if not avant(tache.get("updatedAt"), limite):
                        continue
                    tid = urllib.parse.quote(str(tache.get("id")), safe="")
                    docs = liste(appeler(base, "GET", f"/api/issues/{tid}/documents", {"includeSystem": "true"})[1], "documents")
                    for doc in docs:
                        if avant(doc.get("updatedAt"), limite):
                            yield tid, urllib.parse.quote(str(doc.get("key")), safe="")
                if len(page) < TAILLE_PAGE:
                    break
                debut += TAILLE_PAGE


def purger_documents(base, limite, confirmer):
    """Code de sortie de la partie documents (0, 1 si un document verrouillé reste)."""
    liste_docs = list(documents_anciens(base, limite))
    print(f"{len(liste_docs)} document(s) de tâches closes de plus de la durée (document et tâche).")
    if not confirmer:
        return 0
    verrouilles = []
    for tid, cle in liste_docs:
        if appeler(base, "DELETE", f"/api/issues/{tid}/documents/{cle}")[0] == 409:
            verrouilles.append(f"{tid}/{cle}")
    print(f"{len(liste_docs) - len(verrouilles)} document(s) supprimé(s).")
    if verrouilles:
        print(f"{len(verrouilles)} document(s) verrouillé(s), non supprimé(s) (jamais forcé) : {', '.join(verrouilles)}.")
        return 1
    return 0


def main(argv=None, maintenant=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--instance", required=True, help="dossier de l'instance (instance/instances/<id>)")
    p.add_argument("--api", default=os.environ.get("ATELIER_API", API_DEFAUT), help=f"API du socle (défaut {API_DEFAUT})")
    p.add_argument("--jours", type=int, default=JOURS_PAR_DEFAUT, help=f"durée de conservation en jours (défaut {JOURS_PAR_DEFAUT})")
    p.add_argument("--confirmer", action="store_true", help="supprimer pour de bon (sinon à blanc)")
    a = p.parse_args(argv)
    if a.jours < JOURS_MINIMUM:
        print(f"Refus : {a.jours} jours est sous le minimum de {JOURS_MINIMUM} jours.", file=sys.stderr)
        return 2
    if not os.path.isdir(os.path.join(a.instance, "data")):
        print(f"Refus : {a.instance} n'a pas de dossier data/ (instance attendue).", file=sys.stderr)
        return 2
    limite = (maintenant if maintenant is not None else time.time()) - a.jours * 86400
    fichiers = list(anciens(a.instance, limite))
    taille = sum(os.path.getsize(f) for f in fichiers)
    print(f"{len(fichiers)} fichier(s) de plus de {a.jours} jours ({taille} octets) dans {', '.join(DOSSIERS_JOURNAUX)}.")
    if a.confirmer:
        for f in fichiers:
            os.remove(f)
        retirer_dossiers_vides(a.instance)
        print(f"{len(fichiers)} fichier(s) supprimé(s).")
    try:
        code = purger_documents(a.api, limite, a.confirmer)
    except ErreurApi as e:
        print(f"Erreur sur les documents : {e}", file=sys.stderr)
        return 3
    if not a.confirmer:
        print("Purge à blanc : rien n'est supprimé (ajouter --confirmer).")
    return code


if __name__ == "__main__":
    sys.exit(main())
