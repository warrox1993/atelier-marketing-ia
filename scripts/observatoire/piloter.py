#!/usr/bin/env python3
"""Rejoue l'article pilote de l'Observatoire avec arrêts automatiques.

Usage : python3 -I piloter.py --api http://127.0.0.1:<port>/api --client <slug-client> [--production] --sujet 01
Contrôles, activation de 6 agents (porte, analyste-technique, redacteur-en-chef, relecteur-independant, adaptateur-anglais,
directeur), création de la tâche par confier.py, veille toutes les 30 s (lecture seule), puis pause des 6 agents.
N'approuve rien, n'exporte rien. Le port 3100 est refusé sans --production (règle de confier.py).
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time
import unicodedata
from datetime import datetime

ICI = os.path.dirname(os.path.abspath(__file__))
CONFIER = os.path.join(ICI, "confier.py")
# Photos et journal d'un pilotage : sous /instance/ (ignoré par git), jamais dans le dépôt suivi (AFC-A17).
DOSSIER_PILOTE = os.path.join(os.path.dirname(os.path.dirname(ICI)), "instance", "observatoire", "pilote")
# T7 : l'adaptateur anglais est activé avec la chaîne (sa sous-tâche, bloquée par l'article, démarre après l'approbation de l'opérateur).
ORDRE = ["porte", "analyste technique", "redacteur en chef", "relecteur independant", "adaptateur anglais", "directeur"]
VARIABLE_JETON = "CLAUDE_CODE_OAUTH_TOKEN"
COMMANDE_JETON = "python3 scripts/bootstrap-organisation.py jeton --client {client} --service observatoire --confirmer"
EN_COURS = ("queued", "running")
ECHECS = ("failed", "timed_out")
MAX_RUNS, MAX_ECHECS_DE_SUITE, DUREE_MAX, PAS, DELAI_IDLE = 15, 2, 3600, 30, 60
DELAI_FIN_RUNS = 900  # un run coupé par la pause garde sa comptabilité en attente et met l'entreprise en arrêt budgétaire
STATUTS_TACHE_FINAUX = ("in_review", "done", "blocked")
SOUS_TACHE_ACTIVE = ("backlog", "todo", "in_progress", "in_review")


def _famille(toutes, racines):
    """Tâches d'article et toutes leurs sous-tâches (par parentId)."""
    ids, ajout = set(racines), True
    while ajout:
        ajout = {t["id"] for t in toutes if t.get("parentId") in ids} - ids
        ids |= ajout
    return [t for t in toutes if t["id"] in ids]


class ArretPilote(Exception):
    pass


def _charger_confier():
    spec = importlib.util.spec_from_file_location("confier", CONFIER)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _norme(nom):
    return unicodedata.normalize("NFD", nom or "").encode("ascii", "ignore").decode().strip().lower()


def trouver_agents(appel, cid):
    """{nom normalisé: agent} pour les 6 agents visés ; ArretPilote si l'un manque."""
    tous = {_norme(a["name"]): a for a in appel("GET", f"/companies/{cid}/agents")}
    manque = [n for n in ORDRE if n not in tous]
    if manque:
        raise ArretPilote(f"agent(s) introuvable(s) : {', '.join(manque)}")
    return {n: tous[n] for n in ORDRE}


def photo(appel, cid, agents):
    def par_statut(liste):
        r = {}
        for x in liste:
            r[x.get("status")] = r.get(x.get("status"), 0) + 1
        return r
    return {"agents": {n: appel("GET", f"/agents/{a['id']}").get("status") for n, a in agents.items()},
            "runs": par_statut(appel("GET", f"/companies/{cid}/heartbeat-runs?limit=1000")),
            "taches": par_statut(appel("GET", f"/companies/{cid}/issues?limit=5000")),
            "approbations": par_statut(appel("GET", f"/companies/{cid}/approvals")),
            "incidents_budget": len(appel("GET", f"/companies/{cid}/budgets/overview").get("activeIncidents") or [])}


def ecrire(chemin, donnees):
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, indent=1)


def controles_avant(appel, cid, agents, client):
    for n, a in agents.items():
        cfg = appel("GET", f"/agents/{a['id']}")
        if cfg.get("adapterType") != "claude_local":
            continue
        ref = ((cfg.get("adapterConfig") or {}).get("env") or {}).get(VARIABLE_JETON) or {}
        if ref.get("type") != "secret_ref":
            raise ArretPilote(f"agent « {a['name']} » sans {VARIABLE_JETON} en secret_ref. Commande : {COMMANDE_JETON.format(client=client)}")
    en_cours = [r for r in appel("GET", f"/companies/{cid}/heartbeat-runs?limit=1000") if r.get("status") in EN_COURS]
    if en_cours:
        raise ArretPilote(f"{len(en_cours)} run(s) déjà en cours dans l'entreprise")


def attendre_fin_runs(appel, cid, agents, dormir, horloge):
    """Attend jusqu'à DELAI_FIN_RUNS que les runs en cours des 5 se terminent ; rend les noms encore en cours."""
    ids, debut = {a["id"]: a["name"] for a in agents.values()}, horloge()
    while True:
        try:
            actifs = sorted({ids[r["agentId"]] for r in appel("GET", f"/companies/{cid}/heartbeat-runs?limit=1000")
                             if r.get("agentId") in ids and r.get("status") in EN_COURS})
        except Exception as e:  # API illisible : on ne retarde pas la pause
            print(f"ERREUR lecture des runs avant la pause : {e}", file=sys.stderr)
            return []
        if not actifs or horloge() - debut >= DELAI_FIN_RUNS:
            return actifs
        dormir(10)


def mettre_en_pause(appel, agents, dormir, horloge, cid=None):
    """Attend la fin des runs en cours (si cid), pause des 5 puis relecture jusqu'à 60 s ; rend les statuts relus."""
    coupes = attendre_fin_runs(appel, cid, agents, dormir, horloge) if cid else []
    if coupes:
        print(f"ATTENTION : runs encore en cours après {DELAI_FIN_RUNS // 60} min, coupés par la pause : {coupes} ; "
              "leur comptabilité restera en attente et l'entreprise sera en arrêt budgétaire")
    for a in agents.values():
        try:
            appel("POST", f"/agents/{a['id']}/pause")
        except Exception as e:  # on tente les autres, l'état final dit la vérité
            print(f"ERREUR pause {a['name']} : {e}", file=sys.stderr)
    debut = horloge()
    while True:
        etats = {n: appel("GET", f"/agents/{a['id']}").get("status") for n, a in agents.items()}
        if set(etats.values()) == {"paused"} or horloge() - debut >= DELAI_IDLE:
            return etats
        dormir(2)


def activer(appel, agents, dormir, horloge):
    for n, a in agents.items():
        appel("POST", f"/agents/{a['id']}/resume")
        debut = horloge()
        while appel("GET", f"/agents/{a['id']}").get("status") != "idle":
            if horloge() - debut >= DELAI_IDLE:
                raise ArretPilote(f"agent « {a['name']} » n'est pas idle après {DELAI_IDLE} s")
            dormir(2)
        print(f"activé : {a['name']}")


def _echecs_de_suite(runs, agent_id):
    statuts = [r["status"] for r in sorted((r for r in runs if r.get("agentId") == agent_id), key=lambda r: r.get("createdAt") or "")]
    return len(statuts) >= MAX_ECHECS_DE_SUITE and all(s in ECHECS for s in statuts[-MAX_ECHECS_DE_SUITE:])


def condition_arret(appel, cid, agents, tache_ids, base_runs, base_approbations, debut, horloge):
    """Rend (condition, instantané) ; condition vaut None tant qu'il faut continuer."""
    runs = [r for r in appel("GET", f"/companies/{cid}/heartbeat-runs?limit=1000") if r["id"] not in base_runs]
    famille = _famille(appel("GET", f"/companies/{cid}/issues?limit=5000"), tache_ids)
    taches = [t for t in famille if t["id"] in tache_ids]
    # l'article attend une sous-tâche en cours : état normal de la chaîne, pas un arrêt
    sous_taches_actives = any(t["status"] in SOUS_TACHE_ACTIVE for t in famille if t["id"] not in tache_ids)
    approbations = [x for x in appel("GET", f"/companies/{cid}/approvals") if x.get("status") == "pending" and x["id"] not in base_approbations]
    incidents = appel("GET", f"/companies/{cid}/budgets/overview").get("activeIncidents") or []
    termines = [r for r in runs if r.get("status") not in EN_COURS]
    snap = {"runs": len(runs), "termines": len(termines), "taches": [t["status"] for t in famille],
            "approbations": len(approbations), "incidents": len(incidents), "minutes": round((horloge() - debut) / 60, 1)}
    cond = None
    for t in taches:
        if t["status"] in STATUTS_TACHE_FINAUX and not (t["status"] == "blocked" and sous_taches_actives):
            cond = f"tâche de l'article en {t['status']}"
    if cond is None and not sous_taches_actives and any(t["status"] == "blocked" for t in famille):
        cond = "sous-tâche en blocked, plus rien n'avance"
    if cond is None and approbations:
        cond = "une approbation est demandée"
    if cond is None and incidents:
        cond = "incident de budget"
    if cond is None:
        for n, a in agents.items():
            if _echecs_de_suite(runs, a["id"]):
                cond = f"{MAX_ECHECS_DE_SUITE} échecs de suite de l'agent « {a['name']} »"
    if cond is None and len(termines) >= MAX_RUNS:
        cond = f"{MAX_RUNS} runs terminés"
    if cond is None and horloge() - debut >= DUREE_MAX:
        cond = f"{DUREE_MAX // 60} min écoulées"
    return cond, snap


def _duree(r):
    try:
        return round((datetime.fromisoformat(r["finishedAt"].replace("Z", "+00:00")) -
                      datetime.fromisoformat(r["startedAt"].replace("Z", "+00:00"))).total_seconds())
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def resume(appel, cid, agents, base_runs):
    runs = [r for r in appel("GET", f"/companies/{cid}/heartbeat-runs?limit=1000") if r["id"] not in base_runs]
    lignes = []
    for n, a in agents.items():
        mes = [r for r in runs if r.get("agentId") == a["id"]]
        if not mes:
            continue
        modele = (appel("GET", f"/agents/{a['id']}").get("adapterConfig") or {}).get("model") or "sans modèle"
        durees = [d for d in map(_duree, mes) if d is not None]
        jetons = sum(v for r in mes for v in (r.get("usageJson") or {}).values() if isinstance(v, (int, float)))
        lignes.append(f"  {a['name']} ({modele}) : {len(mes)} run(s) {sorted({r['status'] for r in mes})}, "
                      f"durée {sum(durees)} s, jetons {jetons if jetons else 'non exposés'}")
    return lignes


def piloter(appel, cid, confier, client, dormir=time.sleep, horloge=time.monotonic, dossier=DOSSIER_PILOTE, pas=PAS, tache=None):
    """`tache` : identifiant d'une tâche d'article existante à reprendre ; `confier` la relance alors au lieu d'en créer une."""
    os.makedirs(dossier, mode=0o700, exist_ok=True)
    agents = trouver_agents(appel, cid)
    controles_avant(appel, cid, agents, client)
    avant = photo(appel, cid, agents)
    ecrire(os.path.join(dossier, "pilote-avant.json"), avant)
    base_runs = {r["id"] for r in appel("GET", f"/companies/{cid}/heartbeat-runs?limit=1000")}
    base_approbations = {x["id"] for x in appel("GET", f"/companies/{cid}/approvals")}
    avant_taches = {t["id"] for t in appel("GET", f"/companies/{cid}/issues?limit=5000")}
    condition = None
    try:
        activer(appel, agents, dormir, horloge)
        if confier() != 0:
            raise ArretPilote("confier.py a échoué")
        nouvelles = [t for t in appel("GET", f"/companies/{cid}/issues?limit=5000")
                     if t["id"] not in avant_taches and (t.get("title") or "").startswith("Article : ")]
        if not nouvelles and not tache:
            raise ArretPilote("aucune tâche « Article : » nouvelle après confier.py")
        ids = {tache} if tache else {t["id"] for t in nouvelles}
        debut = horloge()
        with open(os.path.join(dossier, "journal.jsonl"), "a", encoding="utf-8") as journal:
            while condition is None:
                dormir(pas)
                try:
                    condition, snap = condition_arret(appel, cid, agents, ids, base_runs, base_approbations, debut, horloge)
                except Exception as e:  # API illisible : on ne veille plus à l'aveugle
                    condition, snap = f"veille impossible ({e})", {}
                journal.write(json.dumps({"t": time.strftime("%Y-%m-%dT%H:%M:%S"), **snap, "arret": condition}, ensure_ascii=False) + "\n")
                journal.flush()
    finally:
        etats = mettre_en_pause(appel, agents, dormir, horloge, cid)
    apres = photo(appel, cid, agents)
    ecrire(os.path.join(dossier, "pilote-apres.json"), apres)
    lignes = resume(appel, cid, agents, base_runs)
    print(f"ARRÊT : {condition}")
    print(f"Agents après pause : {etats}")
    print("Runs par agent :" if lignes else "Aucun run.")
    print("\n".join(lignes))
    if set(etats.values()) != {"paused"}:
        raise ArretPilote(f"des agents ne sont PAS en pause : {etats}")
    return condition, lignes


def main(argv=None):
    p = argparse.ArgumentParser(description="Rejoue l'article pilote de l'Observatoire")
    p.add_argument("--api", required=True, help="http://127.0.0.1:<port>/api (3100 : seulement avec --production)")
    p.add_argument("--production", action="store_true", help="autorise le port 3100")
    p.add_argument("--client", required=True, help="slug du client (pour la commande de jeton affichée en cas d'arrêt)")
    p.add_argument("--sujet", required=True, metavar="NN")
    p.add_argument("--reprendre", metavar="OBS-N", help="reprend cette tâche d'article au lieu d'en créer une")
    p.add_argument("--confirmer", metavar="ID", help="avec --reprendre : demande de confirmation acceptée après l'activation des agents")
    p.add_argument("--relancer", metavar="OBS-N", action="append", default=[],
                   help="avec --reprendre : sous-tâche bloquée par une pause du pilote, remise à faire après l'activation")
    a = p.parse_args(argv)
    if (a.confirmer or a.relancer) and not a.reprendre:
        p.error("--confirmer et --relancer exigent --reprendre")
    c = _charger_confier()
    try:
        api = c.verifier_api(a.api, a.production)
        appel = c.appel_http(api)
        cid, nom, _ = c.trouver_obs(appel)
        print(f"Instance {api} | entreprise « {nom} » ({cid}) | sujet {a.sujet}")
        options = ["--production"] if a.production else []
        confier = lambda: subprocess.run([sys.executable, "-I", CONFIER, "--api", api, "--seulement", a.sujet, *options]).returncode
        tache = None
        if a.reprendre:
            trouvees = [t for t in appel("GET", f"/companies/{cid}/issues?q={a.reprendre}") if t.get("identifier") == a.reprendre]
            if not trouvees:
                raise ArretPilote(f"tâche {a.reprendre} introuvable")
            tache = trouvees[0]["id"]
            toutes = appel("GET", f"/companies/{cid}/issues?limit=5000")
            relancer = [t["id"] for t in toutes if t.get("identifier") in a.relancer]
            if len(relancer) != len(set(a.relancer)):
                raise ArretPilote(f"sous-tâche introuvable parmi {a.relancer}")

            def confier():
                if a.confirmer:
                    appel("POST", f"/issues/{tache}/interactions/{a.confirmer}/accept", {"selectedOptionIds": []})
                for t in relancer:
                    appel("PATCH", f"/issues/{t}", {"status": "todo", "comment": "Relancée par le pilote : bloquée par la pause des agents "
                                                    "(arrêt du pilote sur une attente normale de sous-tâche), cause corrigée."})
                return 0
        piloter(appel, cid, confier, a.client, tache=tache)
    except (ValueError, ArretPilote, c.ErreurHttp, OSError, KeyError) as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
