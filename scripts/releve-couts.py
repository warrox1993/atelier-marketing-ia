#!/usr/bin/env python3
"""Relevé mensuel des coûts IA par entreprise (client) et par agent.

Lit l'API du socle Paperclip, en lecture seule :
  GET /api/companies
  GET /api/companies/:id/costs/by-agent-model?from=...&to=...   (agent x modèle x facturation, jetons, coût)
  GET /api/companies/:id/costs/by-agent?from=...&to=...         (nombre de runs par agent)

Usage : python3 -I scripts/releve-couts.py [--api URL] [--entreprise UUID] [--mois AAAA-MM] [--sortie fichier.csv]

Unité du coût : le socle compte en CENTIMES (entiers, `costCents`), sans devise explicite ; la colonne
`cout_centimes_socle` les reprend tels quels, sans conversion. Les agents tournent aujourd'hui sur
l'abonnement de l'opérateur : le socle rapporte alors un coût nul, la colonne `facturation` vaut `abonnement`
et les jetons restent exposés (ils serviront à estimer le coût futur). Le mois est calculé en UTC, comme
la fenêtre budgétaire du socle.

Codes de sortie : 0 succès, 2 argument invalide, 3 API injoignable ou réponse inexploitable,
4 entreprise inconnue.
"""
import argparse
import calendar
import csv
import datetime
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API_DEFAUT = "http://127.0.0.1:3100"
DELAI_SECONDES = 20
COLONNES = [
    "mois", "entreprise", "agent", "modele", "facturation",
    "jetons_entree", "jetons_entree_cache", "jetons_sortie",
    "cout_centimes_socle", "runs",
]


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


class ErreurReleve(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def appeler_api(base, chemin, parametres=None):
    """GET JSON. Lève ErreurReleve (code 3, ou 4 pour un 404 d'entreprise)."""
    url = base.rstrip("/") + chemin
    if parametres:
        url += "?" + urllib.parse.urlencode(parametres)
    try:
        req = urllib.request.Request(url)
        ajouter_cle_tableau(req)
        with urllib.request.urlopen(req, timeout=DELAI_SECONDES) as reponse:
            return json.load(reponse)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise ErreurReleve(f"Introuvable côté API : {chemin}", 4)
        raise ErreurReleve(f"L'API a répondu HTTP {e.code} sur {chemin}", 3)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ErreurReleve(f"API injoignable ({base}) : {e}", 3)
    except ValueError:
        raise ErreurReleve(f"Réponse non JSON sur {chemin}", 3)


def fenetre_du_mois(mois):
    """('2026-10') -> (début, fin) ISO UTC, fin incluse."""
    try:
        annee, numero = (int(x) for x in mois.split("-"))
        dernier = calendar.monthrange(annee, numero)[1]
    except (ValueError, calendar.IllegalMonthError):
        raise ErreurReleve(f"Mois invalide « {mois} » (attendu AAAA-MM)", 2)
    return (f"{annee:04d}-{numero:02d}-01T00:00:00.000Z",
            f"{annee:04d}-{numero:02d}-{dernier:02d}T23:59:59.999Z")


def type_facturation(billing_type, cout):
    if str(billing_type).startswith("subscription"):
        return "abonnement"
    if billing_type == "metered_api":
        return "api" if cout else "api_cout_nul"
    return str(billing_type or "inconnue")


def liste(valeur, nom):
    if not isinstance(valeur, list):
        raise ErreurReleve(f"Réponse inattendue pour {nom} (liste attendue)", 3)
    return valeur


def lignes_entreprise(base, entreprise, mois):
    """Lignes (dicts) d'une entreprise + sa ligne TOTAL."""
    debut, fin = fenetre_du_mois(mois)
    chemin = f"/api/companies/{entreprise['id']}/costs/"
    periode = {"from": debut, "to": fin}
    par_agent_modele = liste(appeler_api(base, chemin + "by-agent-model", periode), "by-agent-model")
    par_agent = liste(appeler_api(base, chemin + "by-agent", periode), "by-agent")

    runs = {a.get("agentId"): int(a.get("apiRunCount") or 0) + int(a.get("subscriptionRunCount") or 0)
            for a in par_agent}
    lignes, vus = [], set()
    tri = sorted(par_agent_modele, key=lambda r: (str(r.get("agentName") or ""), str(r.get("model") or ""),
                                                  str(r.get("billingType") or "")))
    for r in tri:
        cout = int(round(r.get("costCents") or 0))
        agent_id = r.get("agentId")
        # Les runs sont comptés par agent (pas par modèle) : portés par sa première ligne seulement,
        # pour que leur somme reste exacte.
        nb_runs = "" if agent_id in vus else runs.get(agent_id, 0)
        vus.add(agent_id)
        lignes.append({
            "mois": mois, "entreprise": entreprise["name"],
            "agent": r.get("agentName") or "(agent supprimé)",
            "modele": r.get("model") or "", "facturation": type_facturation(r.get("billingType"), cout),
            "jetons_entree": int(r.get("inputTokens") or 0),
            "jetons_entree_cache": int(r.get("cachedInputTokens") or 0),
            "jetons_sortie": int(r.get("outputTokens") or 0),
            "cout_centimes_socle": cout, "runs": nb_runs,
        })
    types = {l["facturation"] for l in lignes}
    lignes.append({
        "mois": mois, "entreprise": entreprise["name"], "agent": "TOTAL", "modele": "",
        "facturation": types.pop() if len(types) == 1 else ("mixte" if types else ""),
        "jetons_entree": sum(l["jetons_entree"] for l in lignes),
        "jetons_entree_cache": sum(l["jetons_entree_cache"] for l in lignes),
        "jetons_sortie": sum(l["jetons_sortie"] for l in lignes),
        "cout_centimes_socle": sum(l["cout_centimes_socle"] for l in lignes),
        "runs": sum(l["runs"] for l in lignes if l["runs"] != ""),
    })
    return lignes


def choisir_entreprises(base, uuid):
    toutes = liste(appeler_api(base, "/api/companies"), "companies")
    if uuid is None:
        return toutes
    trouvees = [e for e in toutes if e.get("id") == uuid]
    if not trouvees:
        raise ErreurReleve(f"Entreprise inconnue : {uuid}", 4)
    return trouvees


def produire_csv(base, uuid, mois):
    lignes = []
    for entreprise in choisir_entreprises(base, uuid):
        lignes += lignes_entreprise(base, entreprise, mois)
    tampon = io.StringIO()
    ecrivain = csv.DictWriter(tampon, fieldnames=COLONNES, lineterminator="\n")
    ecrivain.writeheader()
    ecrivain.writerows(lignes)
    return tampon.getvalue()


def main(argv=None):
    p = argparse.ArgumentParser(description="Relevé mensuel des coûts IA par entreprise et par agent.")
    p.add_argument("--api", default=os.environ.get("ATELIER_API", API_DEFAUT))
    p.add_argument("--entreprise", help="UUID de l'entreprise (sinon toutes)")
    p.add_argument("--mois", default=datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m"),
                   help="AAAA-MM (défaut : mois courant, UTC)")
    p.add_argument("--sortie", help="fichier CSV (défaut : sortie standard)")
    args = p.parse_args(argv)
    try:
        contenu = produire_csv(args.api, args.entreprise, args.mois)
    except ErreurReleve as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return e.code
    if args.sortie:
        with open(args.sortie, "w", encoding="utf-8", newline="") as f:
            f.write(contenu)
    else:
        sys.stdout.write(contenu)
    print("Coûts en centimes de l'unité du socle (sans conversion de devise) ; "
          "facturation « abonnement » : coût nul, voir les jetons.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
