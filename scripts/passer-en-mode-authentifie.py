#!/usr/bin/env python3
"""Bascule d'une instance de l'atelier du mode local_trusted au mode authenticated (et retour).

Point d'entrée : scripts/passer-en-mode-authentifie.sh (mode d'emploi : docs/mode-authentifie.md).

Idempotent : chaque lancement relit l'état de l'instance et reprend à l'étape suivante.
  1. sauvegarde (config.json, surcharge existante) dans instance/instances/<id>/mode-authentifie/ ;
  2. surcharge atelier-auth.env (authenticated, private), redémarrage ;
  3. URL de réclamation (claim URL, 24 h) AFFICHÉE dans le terminal, jamais écrite dans un fichier suivi :
     JB crée son compte sur /auth puis ouvre l'URL ; le script attend la réclamation ;
  4. clé board des scripts : défi d'autorisation (/cli-auth/…) approuvé par l'opérateur dans son navigateur, puis clé
     durable écrite dans ~/.config/atelier/board-<port>.key (0600) ; la clé temporaire du défi est révoquée ;
  5. cartes en attente et tâches ouvertes adressées à « local-board » réaffectées au compte de l'opérateur (identifiants
     notés pour le retour arrière) ; réglage du plugin `humainDestinataire` posé là où il était vide ;
  6. inscriptions fermées (PAPERCLIP_AUTH_DISABLE_SIGN_UP=true), redémarrage, contrôles finaux.
--revenir défait tout dans l'ordre inverse ; --a-blanc liste sans rien écrire.

Instance réelle (« atelier ») : le script ne redémarre l'instance que si --redemarrer est donné (systemd
utilisateur atelier-instance@atelier) ; sinon il affiche la commande et s'arrête (code 3), à relancer ensuite.
Instance d'essai (--essai) : arrêt et démarrage par scripts/instance-essai.sh, journal dans
instance/instances/<id>/logs/mode-authentifie.log (0600).

Codes de sortie : 0 terminé ; 1 erreur ; 2 mauvais usage ; 3 action humaine ou redémarrage attendu (relancer).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
INSTANCES = RACINE / "instance" / "instances"
PLUGIN = "atelier.marketing-ia"
LOCAL_BOARD = "local-board"
NOM_CLE = "scripts de l'atelier"
# Identifiants du PostgreSQL embarqué de Paperclip (paperclip/server/src/index.ts, création de la base embarquée) :
# ce ne sont pas des secrets (base sur la boucle locale seulement), passés par l'environnement, jamais en argument.
PG_UTILISATEUR = PG_BASE = PG_MOT_DE_PASSE = "paperclip"
ANSI = re.compile(r"\x1b\[[0-9;]*m")
MOTIF_CLAIM = re.compile(r"(https?://[^\s/]+)?/board-claim/([0-9a-f]{32,128})\?code=([0-9a-f]{16,128})")
MOTIF_CLE = re.compile(r"^[A-Za-z0-9_.-]{16,512}$")


class Arret(Exception):
    """Arrêt contrôlé : message pour l'humain et code de sortie."""

    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.code = code


def dire(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------------------------------------------
# Cible : instance réelle ou d'essai


class Cible:
    def __init__(self, args):
        self.essai = args.essai is not None
        if self.essai:
            ident, port, port_pg = args.essai
            if not re.fullmatch(r"atelier-[a-z0-9-]+", ident) or ident == "atelier":
                raise Arret("identifiant d'essai refusé : atelier-<suffixe>, jamais l'instance principale.", 2)
            self.id, self.port, self.port_pg = ident, int(port), int(port_pg)
            self.dossier = INSTANCES / ident
            self.surcharge = self.dossier / "atelier-auth.env"
        else:
            self.id = "atelier"
            env = (RACINE / "config" / "atelier.env").read_text(encoding="utf-8")
            m = re.search(r"^PORT=(\d+)\s*$", env, re.M)
            self.port = int(m.group(1)) if m else 3100
            self.dossier = INSTANCES / "atelier"
            c = json.loads((self.dossier / "config.json").read_text(encoding="utf-8"))
            self.port_pg = int(c["database"]["embeddedPostgresPort"])
            self.surcharge = RACINE / "config" / "atelier-auth.env"
        if not (self.dossier / "config.json").is_file():
            raise Arret(f"instance {self.id} introuvable ({self.dossier}/config.json).", 2)
        self.base = f"http://127.0.0.1:{self.port}"
        self.api = self.base + "/api"
        self.fichier_cle = Path(os.environ.get("ATELIER_CLE_BOARD_FICHIER")
                                or Path.home() / ".config" / "atelier" / f"board-{self.port}.key")
        self.travail = self.dossier / "mode-authentifie"
        self.etat_fichier = self.travail / "etat.json"
        self.journal = self.dossier / "logs" / "mode-authentifie.log"

    # --- état persistant (identifiants seulement, jamais de clé ni d'URL de réclamation) ---
    def etat(self) -> dict:
        try:
            return json.loads(self.etat_fichier.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def ecrire_etat(self, etat: dict) -> None:
        self.travail.mkdir(mode=0o700, parents=True, exist_ok=True)
        tmp = self.etat_fichier.with_suffix(".tmp")
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
            json.dump(etat, f, indent=2, ensure_ascii=False)
        os.replace(tmp, self.etat_fichier)


# ---------------------------------------------------------------------------------------------------------------
# HTTP (boucle locale uniquement)


def http(cible: Cible, methode: str, chemin: str, corps=None, cle: str | None = None, attendu=(200, 201)):
    """Appel JSON ; rend (statut, json). Lève Arret si le statut n'est pas attendu (attendu=None : tout accepté)."""
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(cible.api + chemin, data=donnees, method=methode)
    req.add_header("Accept", "application/json")
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
        req.add_header("Origin", cible.base)
    if cle:
        req.add_unredirected_header("Authorization", "Bearer " + cle)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            statut, brut = r.status, r.read()
    except urllib.error.HTTPError as e:
        statut, brut = e.code, e.read()
    except (urllib.error.URLError, OSError) as e:
        if attendu is None:
            return 0, None
        raise Arret(f"API injoignable ({cible.api}{chemin}) : {e}") from None
    try:
        js = json.loads(brut) if brut else None
    except ValueError:
        js = None
    if attendu is not None and statut not in attendu:
        detail = (js or {}).get("error") if isinstance(js, dict) else None
        raise Arret(f"{methode} {chemin} : HTTP {statut}{' : ' + str(detail)[:200] if detail else ''}")
    return statut, js


def sante(cible: Cible) -> dict | None:
    statut, js = http(cible, "GET", "/health", attendu=None)
    return js if statut == 200 and isinstance(js, dict) else None


def attendre_sante(cible: Cible, mode: str, delai: int = 300) -> dict:
    debut = time.time()
    while time.time() - debut < delai:
        s = sante(cible)
        if s and s.get("status") == "ok" and s.get("deploymentMode") == mode:
            return s
        time.sleep(3)
    raise Arret(f"instance {cible.id} (port {cible.port}) pas prête en mode {mode} après {delai} s.")


# ---------------------------------------------------------------------------------------------------------------
# Clé board (fichier 0600 hors dépôt)


def lire_cle(cible: Cible) -> str | None:
    try:
        st = cible.fichier_cle.stat()
    except OSError:
        return None
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise Arret(f"{cible.fichier_cle} doit m'appartenir et être en 0600 (chmod 600).")
    cle = cible.fichier_cle.read_text(encoding="utf-8").strip()
    return cle if MOTIF_CLE.fullmatch(cle) else None


def ecrire_cle(cible: Cible, cle: str) -> None:
    cible.fichier_cle.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = cible.fichier_cle.with_name(cible.fichier_cle.name + ".tmp")
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(cle + "\n")
    os.replace(tmp, cible.fichier_cle)


def moi(cible: Cible, cle: str | None) -> dict | None:
    if not cle:
        return None
    statut, js = http(cible, "GET", "/cli-auth/me", cle=cle, attendu=None)
    return js if statut == 200 and isinstance(js, dict) else None


# ---------------------------------------------------------------------------------------------------------------
# Redémarrage


def pid_ecoute(port: int) -> str | None:
    r = subprocess.run(["ss", "-ltnpH", f"sport = :{port}"], capture_output=True, text=True, check=False)
    m = re.search(r"pid=(\d+)", r.stdout)
    return m.group(1) if m else None


def redemarrer(cible: Cible, args, mode_attendu: str) -> dict:
    etat = cible.etat()
    etat["redemarre_le"] = dt.datetime.now().isoformat(timespec="seconds")
    cible.ecrire_etat(etat)
    if not cible.essai:
        commande = "systemctl --user restart atelier-instance@atelier"
        if not args.redemarrer:
            raise Arret(f"Redémarrage de l'instance réelle requis : {commande} (ou relancez ce script avec --redemarrer), "
                        "puis relancez ce script pour continuer.", 3)
        dire(f"+ {commande}")
        subprocess.run(["systemctl", "--user", "restart", "atelier-instance@atelier"], check=True)
        return attendre_sante(cible, mode_attendu)
    script = str(RACINE / "scripts" / "instance-essai.sh")
    ports = [cible.id, str(cible.port), str(cible.port_pg)]
    dire(f"+ scripts/instance-essai.sh arreter {' '.join(ports)}")
    subprocess.run([script, "arreter", *ports], check=False, stdout=subprocess.DEVNULL)
    if pid_ecoute(cible.port) or pid_ecoute(cible.port_pg):
        raise Arret(f"instance d'essai {cible.id} toujours à l'écoute après l'arrêt.")
    dire(f"+ scripts/instance-essai.sh demarrer {' '.join(ports)}  (arrière-plan, journal {cible.journal})")
    cible.journal.parent.mkdir(parents=True, exist_ok=True)
    journal = open(os.open(cible.journal, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600), "a", encoding="utf-8")
    journal.write(f"\n===== démarrage {dt.datetime.now().isoformat(timespec='seconds')} =====\n")
    journal.flush()
    subprocess.Popen([script, "demarrer", *ports], stdout=journal, stderr=subprocess.STDOUT,
                     stdin=subprocess.DEVNULL, start_new_session=True, cwd=str(RACINE))
    journal.close()
    return attendre_sante(cible, mode_attendu)


def url_reclamation(cible: Cible, depuis: str | None = None) -> tuple[str, str] | None:
    """(jeton, code) de la DERNIÈRE URL de réclamation affichée au démarrage (journal d'essai ou journald).

    Instance réelle : journald limité aux lignes écrites depuis `depuis` (début de la bascule), pour ne jamais
    reprendre l'URL périmée d'un démarrage précédent."""
    if cible.essai:
        try:
            texte = cible.journal.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        texte = texte.rsplit("===== démarrage", 1)[-1]
    else:
        r = subprocess.run(["journalctl", "--user", "-u", "atelier-instance@atelier", "-o", "cat", "-n", "2000", "--no-pager",
                            *(["--since", depuis.replace("T", " ")] if depuis else [])],
                           capture_output=True, text=True, check=False)
        texte = r.stdout
    trouves = MOTIF_CLAIM.findall(ANSI.sub("", texte))
    return (trouves[-1][1], trouves[-1][2]) if trouves else None


# ---------------------------------------------------------------------------------------------------------------
# Surcharge et sauvegarde


def ecrire_surcharge(cible: Cible, fermer_inscriptions: bool) -> None:
    lignes = ["# Écrit par scripts/passer-en-mode-authentifie.sh (aucun secret). Retour arrière : --revenir.",
              "PAPERCLIP_DEPLOYMENT_MODE=authenticated", "PAPERCLIP_DEPLOYMENT_EXPOSURE=private"]
    if fermer_inscriptions:
        lignes.append("PAPERCLIP_AUTH_DISABLE_SIGN_UP=true")
    tmp = cible.surcharge.with_name(cible.surcharge.name + ".tmp")
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write("\n".join(lignes) + "\n")
    os.replace(tmp, cible.surcharge)
    r = subprocess.run(["bash", "-c", 'source "$1"; verifier_surcharge_auth "$2"', "_",
                        str(RACINE / "scripts" / "lib-mode-auth.sh"), str(cible.surcharge)], check=False)
    if r.returncode != 0:
        raise Arret(f"surcharge {cible.surcharge} non conforme (voir ci-dessus).")


def inscriptions_fermees(cible: Cible) -> bool:
    try:
        return "PAPERCLIP_AUTH_DISABLE_SIGN_UP=true" in cible.surcharge.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False


def sauvegarder(cible: Cible) -> Path:
    dossier = cible.travail / ("sauvegarde-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
    dossier.mkdir(mode=0o700, parents=True, exist_ok=False)
    shutil.copy2(cible.dossier / "config.json", dossier / "config.json")
    if cible.surcharge.exists():
        shutil.copy2(cible.surcharge, dossier / cible.surcharge.name)
    return dossier


# ---------------------------------------------------------------------------------------------------------------
# PostgreSQL embarqué (cartes et tâches de local-board)


def psql(cible: Cible, sql: str) -> list[str]:
    env = {**os.environ, "PGPASSWORD": PG_MOT_DE_PASSE}
    r = subprocess.run(["psql", "-h", "127.0.0.1", "-p", str(cible.port_pg), "-U", PG_UTILISATEUR, "-d", PG_BASE,
                        "-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1"],
                       input=sql, capture_output=True, text=True, env=env, check=False, timeout=120)
    if r.returncode != 0:
        raise Arret(f"psql a échoué : {r.stderr.strip()[:300]}")
    return [l for l in r.stdout.splitlines() if l.strip()]


def litteral(v: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", v):
        raise Arret(f"identifiant d'utilisateur inattendu : {v!r}")
    return "'" + v + "'"


TERMINAUX = "('done','cancelled')"


def a_reaffecter(cible: Cible, de: str) -> tuple[list[str], list[str]]:
    d = litteral(de)
    cartes = psql(cible, f"SELECT id FROM issue_thread_interactions WHERE addressee_user_id={d} AND status='pending' ORDER BY id;")
    taches = psql(cible, f"SELECT id FROM issues WHERE assignee_user_id={d} AND status NOT IN {TERMINAUX} ORDER BY id;")
    return cartes, taches


def reaffecter(cible: Cible, cartes: list[str], taches: list[str], de: str, vers: str) -> tuple[int, int]:
    """Réaffecte, dans UNE transaction, les cartes encore en attente et les tâches encore ouvertes de `de` vers `vers`."""
    if not cartes and not taches:
        return 0, 0
    for i in cartes + taches:
        if not re.fullmatch(r"[0-9a-f-]{36}", i):
            raise Arret(f"identifiant inattendu : {i!r}")
    d, v = litteral(de), litteral(vers)
    liste = lambda ids: "(" + ",".join(f"'{i}'" for i in ids) + ")" if ids else "(NULL)"
    lignes = psql(cible, "BEGIN;\n"
                  f"WITH c AS (UPDATE issue_thread_interactions SET addressee_user_id={v}, updated_at=now() "
                  f"WHERE id IN {liste(cartes)} AND addressee_user_id={d} AND status='pending' RETURNING 1) SELECT 'c', count(*) FROM c;\n"
                  f"WITH t AS (UPDATE issues SET assignee_user_id={v}, updated_at=now() "
                  f"WHERE id IN {liste(taches)} AND assignee_user_id={d} AND status NOT IN {TERMINAUX} RETURNING 1) SELECT 't', count(*) FROM t;\n"
                  "COMMIT;\n")
    n = dict(l.split("|") for l in lignes)
    return int(n.get("c", 0)), int(n.get("t", 0))


# ---------------------------------------------------------------------------------------------------------------
# Plugin : humainDestinataire


def entreprises(cible: Cible, cle: str | None) -> list[dict]:
    _, js = http(cible, "GET", "/companies", cle=cle)
    return js if isinstance(js, list) else []


def config_plugin(cible: Cible, cid: str, cle: str | None) -> dict | None:
    statut, js = http(cible, "GET", f"/plugins/{PLUGIN}/config?companyId={cid}", cle=cle, attendu=None)
    if statut != 200:
        return None
    return dict((js or {}).get("configJson") or {})


def poser_config_plugin(cible: Cible, cid: str, config: dict, cle: str | None) -> None:
    http(cible, "POST", f"/plugins/{PLUGIN}/config", {"companyId": cid, "configJson": config}, cle=cle)


# ---------------------------------------------------------------------------------------------------------------
# Étapes


def attendre_reclamation(cible: Cible, args) -> str | None:
    """Rend l'identifiant du compte qui a réclamé l'instance (None si plus aucune réclamation n'est en cours)."""
    rc = url_reclamation(cible, cible.etat().get("redemarre_le"))
    if not rc:
        return None
    jeton, code = rc
    statut, js = http(cible, "GET", f"/board-claim/{jeton}?code={code}", attendu=None)
    if statut != 200 or not isinstance(js, dict):
        return None
    if js.get("status") == "claimed":
        return js.get("claimedByUserId")
    if js.get("status") != "available":
        raise Arret(f"réclamation {js.get('status')} : redémarrez l'instance pour en obtenir une nouvelle.")
    url = f"{cible.base}/board-claim/{jeton}?code={code}"
    dire("")
    dire("=== À FAIRE PAR JB (navigateur, sur cette machine) =====================================")
    dire(f"1. Ouvrir {cible.base}/auth et créer votre compte (adresse e-mail, nom, mot de passe de votre choix).")
    dire("2. Une fois connecté, ouvrir cette adresse À USAGE UNIQUE (valable 24 h, ne pas la partager) :")
    dire(f"   {url}")
    dire("   et cliquer sur le bouton de réclamation (Claim).")
    dire("=========================================================================================")
    if args.a_blanc:
        return None
    debut = time.time()
    while time.time() - debut < args.delai_minutes * 60:
        _, js = http(cible, "GET", f"/board-claim/{jeton}?code={code}", attendu=None)
        if isinstance(js, dict) and js.get("status") == "claimed":
            dire(f"Instance réclamée par le compte {js.get('claimedByUserId')}.")
            return js.get("claimedByUserId")
        time.sleep(3)
    raise Arret("réclamation non faite dans le délai : relancez le script quand ce sera fait.", 3)


def obtenir_cle(cible: Cible, args) -> str:
    _, defi = http(cible, "POST", "/cli-auth/challenges",
                   {"command": "scripts/passer-en-mode-authentifie.sh", "clientName": NOM_CLE,
                    "requestedAccess": "instance_admin_required"})
    url = defi.get("approvalUrl") or (cible.base + defi["approvalPath"])
    dire("")
    dire("=== À FAIRE PAR JB : autoriser la clé des scripts ========================================")
    dire("Connecté à l'atelier, ouvrir cette adresse (valable 10 minutes) et cliquer sur « Approve » :")
    dire(f"   {url}")
    dire("=========================================================================================")
    debut = time.time()
    while time.time() - debut < min(args.delai_minutes * 60, 600):
        _, js = http(cible, "GET", f"/cli-auth/challenges/{defi['id']}?token={urllib.parse.quote(defi["token"], safe="")}", attendu=None)
        etat = (js or {}).get("status") if isinstance(js, dict) else None
        if etat == "approved":
            break
        if etat in ("cancelled", "expired"):
            raise Arret(f"autorisation {etat} : relancez le script.", 3)
        time.sleep(2)
    else:
        raise Arret("autorisation non donnée dans le délai : relancez le script.", 3)
    temporaire = defi["boardApiToken"]
    _, cree = http(cible, "POST", "/board-api-keys", {"name": NOM_CLE, "expiresAt": None}, cle=temporaire)
    cle = cree["token"]
    ecrire_cle(cible, cle)
    http(cible, "POST", "/cli-auth/revoke-current", {}, cle=temporaire, attendu=None)
    dire(f"Clé des scripts écrite dans {cible.fichier_cle} (0600) ; clé temporaire de l'autorisation révoquée.")
    return cle


def bascule(cible: Cible, args) -> None:
    etat = cible.etat()
    s = sante(cible)
    if s is None:
        raise Arret(f"instance {cible.id} injoignable sur le port {cible.port} : démarrez-la d'abord.")
    dire(f"Instance {cible.id} (port {cible.port}) : mode {s.get('deploymentMode')}, exposition {s.get('deploymentExposure')}.")

    # 1-2. Sauvegarde, surcharge, redémarrage
    if s.get("deploymentMode") != "authenticated":
        cartes, taches = a_reaffecter(cible, LOCAL_BOARD)
        dire(f"À faire : sauvegarde, surcharge {cible.surcharge} (authenticated, private), redémarrage ; "
             f"puis {len(cartes)} carte(s) en attente et {len(taches)} tâche(s) ouverte(s) de local-board à réaffecter.")
        if args.a_blanc:
            return
        d = sauvegarder(cible)
        dire(f"Sauvegarde : {d}")
        ecrire_surcharge(cible, fermer_inscriptions=False)
        etat.update({"sauvegarde": str(d), "debut": dt.datetime.now().isoformat(timespec="seconds")})
        cible.ecrire_etat(etat)
        s = redemarrer(cible, args, "authenticated")
        dire(f"Instance redémarrée en mode {s.get('deploymentMode')}.")
        etat = cible.etat()  # relu : redemarrer() y a noté l'heure du redémarrage

    # 3. Réclamation par l'opérateur
    cle = lire_cle(cible)
    compte = moi(cible, cle)
    if not (compte and compte.get("isInstanceAdmin")):
        reclame = attendre_reclamation(cible, args)
        if args.a_blanc:
            dire("À faire ensuite : autorisation de la clé des scripts (défi /cli-auth), réaffectations, inscriptions fermées.")
            return
        if reclame:
            etat["compte"] = reclame
            cible.ecrire_etat(etat)
        # 4. Clé board des scripts
        cle = obtenir_cle(cible, args)
        compte = moi(cible, cle)
        if not (compte and compte.get("isInstanceAdmin")):
            raise Arret("la clé obtenue n'a pas les droits d'administrateur de l'instance : approuvez avec le compte qui a réclamé l'instance.")
    utilisateur = compte["userId"]
    etat["compte"] = utilisateur
    dire(f"Compte administrateur : {utilisateur} ; clé des scripts valide ({cible.fichier_cle}).")

    # 5. Réaffectations et destinataire humain du plugin
    cartes, taches = a_reaffecter(cible, LOCAL_BOARD)
    if args.a_blanc:
        dire(f"À faire : réaffecter {len(cartes)} carte(s) et {len(taches)} tâche(s) de local-board vers {utilisateur}.")
    else:
        nc, nt = reaffecter(cible, cartes, taches, LOCAL_BOARD, utilisateur)
        etat["cartes"] = sorted(set(etat.get("cartes", [])) | set(cartes))
        etat["taches"] = sorted(set(etat.get("taches", [])) | set(taches))
        cible.ecrire_etat(etat)
        dire(f"Réaffecté à {utilisateur} : {nc} carte(s) en attente, {nt} tâche(s) ouverte(s).")
    precedents = etat.setdefault("humainDestinataire", {})
    poses = 0
    for e in entreprises(cible, cle):
        cfg = config_plugin(cible, e["id"], cle)
        if cfg is None:
            continue
        actuel = cfg.get("humainDestinataire")
        if isinstance(actuel, str) and actuel.strip() not in ("", LOCAL_BOARD):
            continue
        if args.a_blanc:
            poses += 1
            continue
        precedents.setdefault(e["id"], actuel if isinstance(actuel, str) else None)
        poser_config_plugin(cible, e["id"], {**cfg, "humainDestinataire": utilisateur}, cle)
        poses += 1
    if not args.a_blanc:
        cible.ecrire_etat(etat)
    dire(f"{'À poser' if args.a_blanc else 'Posé'} : humainDestinataire = {utilisateur} pour {poses} entreprise(s).")

    # 6. Inscriptions fermées
    if not inscriptions_fermees(cible):
        dire("À faire : fermer les inscriptions (PAPERCLIP_AUTH_DISABLE_SIGN_UP=true) et redémarrer." if args.a_blanc
             else "Fermeture des inscriptions (PAPERCLIP_AUTH_DISABLE_SIGN_UP=true).")
        if args.a_blanc:
            return
        ecrire_surcharge(cible, fermer_inscriptions=True)
        redemarrer(cible, args, "authenticated")
        etat = cible.etat()
    if args.a_blanc:
        return
    controles(cible, "authenticated")
    etat["termine"] = dt.datetime.now().isoformat(timespec="seconds")
    cible.ecrire_etat(etat)
    dire("Bascule terminée.")


def controles(cible: Cible, mode: str) -> None:
    cle = lire_cle(cible)
    sans, _ = http(cible, "GET", "/companies", attendu=None)
    if mode == "authenticated":
        avec, _ = http(cible, "GET", "/companies", cle=cle, attendu=None)
        _, plugins = http(cible, "GET", "/plugins", cle=cle, attendu=None)
        pret = any(p.get("pluginKey") == PLUGIN and p.get("status") == "ready" for p in (plugins or []))
        dire(f"Contrôle : sans jeton GET /api/companies → HTTP {sans} ; avec la clé → HTTP {avec} ; plugin {PLUGIN} prêt : {pret}.")
        if sans not in (401, 403) or avec != 200 or not pret:
            raise Arret("contrôles finaux en échec.")
    else:
        _, plugins = http(cible, "GET", "/plugins", attendu=None)
        pret = any(p.get("pluginKey") == PLUGIN and p.get("status") == "ready" for p in (plugins or []))
        dire(f"Contrôle : sans jeton GET /api/companies → HTTP {sans} ; plugin {PLUGIN} prêt : {pret}.")
        if sans != 200 or not pret:
            raise Arret("contrôles finaux en échec.")


def revenir(cible: Cible, args) -> None:
    etat = cible.etat()
    s = sante(cible)
    if s is None:
        raise Arret(f"instance {cible.id} injoignable sur le port {cible.port} : démarrez-la d'abord.")
    mode = s.get("deploymentMode")
    dire(f"Instance {cible.id} (port {cible.port}) : mode {mode}.")
    cle = lire_cle(cible)
    compte = etat.get("compte")
    precedents = etat.get("humainDestinataire", {})
    dire(f"À défaire : humainDestinataire de {len(precedents)} entreprise(s), {len(etat.get('cartes', []))} carte(s) et "
         f"{len(etat.get('taches', []))} tâche(s) à rendre à local-board, clé {cible.fichier_cle} à révoquer, "
         f"surcharge {cible.surcharge} à retirer, redémarrage.")
    if args.a_blanc:
        return
    cle_api = cle if mode == "authenticated" else None
    if mode == "authenticated" and not moi(cible, cle):
        raise Arret("mode authentifié sans clé valide : impossible de rétablir la configuration du plugin par l'API.")
    for cid, avant in precedents.items():
        cfg = config_plugin(cible, cid, cle_api)
        if cfg is None or cfg.get("humainDestinataire") != compte:
            continue
        if avant is None:
            cfg.pop("humainDestinataire", None)
        else:
            cfg["humainDestinataire"] = avant
        poser_config_plugin(cible, cid, cfg, cle_api)
    dire(f"humainDestinataire rétabli pour {len(precedents)} entreprise(s).")
    if compte:
        nc, nt = reaffecter(cible, etat.get("cartes", []), etat.get("taches", []), compte, LOCAL_BOARD)
        dire(f"Rendu à local-board : {nc} carte(s) encore en attente, {nt} tâche(s) encore ouverte(s).")
    if cle and mode == "authenticated":
        info = moi(cible, cle) or {}
        if info.get("keyId"):
            http(cible, "DELETE", f"/board-api-keys/{info['keyId']}", cle=cle, attendu=None)
            dire("Clé des scripts révoquée dans l'instance.")
    if cible.fichier_cle.exists():
        cible.fichier_cle.unlink()
        dire(f"Fichier de clé supprimé : {cible.fichier_cle}")
    if cible.surcharge.exists():
        cible.travail.mkdir(mode=0o700, parents=True, exist_ok=True)
        retiree = cible.travail / ("atelier-auth.env.retiree-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
        os.replace(cible.surcharge, retiree)
        dire(f"Surcharge retirée (copie : {retiree}).")
    if mode == "authenticated":
        redemarrer(cible, args, "local_trusted")
    controles(cible, "local_trusted")
    for cle_etat in ("cartes", "taches", "humainDestinataire", "termine"):
        etat.pop(cle_etat, None)
    etat["revenu"] = dt.datetime.now().isoformat(timespec="seconds")
    cible.ecrire_etat(etat)
    dire("Retour au mode local_trusted terminé. Le compte de l'opérateur reste dans la base (sans effet en local_trusted).")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="passer-en-mode-authentifie.sh",
                                description="Bascule une instance de l'atelier en mode authentifié (et retour).")
    p.add_argument("--essai", nargs="*", metavar="ID PORT PORT_PG",
                   help="instance d'essai (défaut : atelier-e2e 3590 54790) au lieu de l'instance réelle")
    p.add_argument("--a-blanc", action="store_true", help="liste ce qui serait fait, sans rien écrire")
    p.add_argument("--revenir", action="store_true", help="retour au mode local_trusted")
    p.add_argument("--redemarrer", action="store_true", help="instance réelle : redémarrer par systemd sans demander")
    p.add_argument("--delai-minutes", type=int, default=30, help="attente des actions de l'opérateur (défaut 30)")
    args = p.parse_args(argv)
    if args.essai is not None:
        if len(args.essai) == 0:
            args.essai = ["atelier-e2e", "3590", "54790"]
        elif len(args.essai) != 3 or not all(x.isdigit() for x in args.essai[1:]):
            p.error("--essai attend ID PORT PORT_PG (ou rien pour atelier-e2e 3590 54790)")
    try:
        cible = Cible(args)
        if args.a_blanc:
            dire("MODE À BLANC : rien n'est écrit, rien n'est redémarré.")
        (revenir if args.revenir else bascule)(cible, args)
    except Arret as e:
        print(("ARRÊT : " if e.code != 3 else "EN ATTENTE : ") + str(e), file=sys.stderr)
        return e.code
    return 0


if __name__ == "__main__":
    sys.exit(main())
