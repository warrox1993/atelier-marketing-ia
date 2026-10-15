#!/usr/bin/env python3
"""Agent-sonde déterministe pour l'adaptateur natif « process » de Paperclip.

Prototype de l'adaptateur « fixtures » du mode démonstration (phase 1) :
aucun appel de modèle, comportement entièrement déterminé par le rôle passé
en argument et par l'état natif de la tâche. Il sert à prouver, contre une
vraie instance, le cycle réveil -> checkout -> livrable -> clôture interceptée
-> relecture -> correction -> approbation humaine.

Rôles :
  producteur  : prend sa tâche, écrit le document « livrable » (nouvelle
                révision), puis demande la clôture (status=done).
  relecteur   : sur une tâche en revue qui lui est confiée, demande une
                correction tant que le livrable a moins de 2 révisions, puis
                approuve (PASS).
  refuseur    : relecteur qui demande toujours une correction (test de la
                limite de tours).
  contourneur : producteur qui tente de retirer la politique d'exécution
                avant de clore (test de contournement).

Variables injectées par Paperclip : PAPERCLIP_API_URL, PAPERCLIP_API_KEY
(jeton du run), PAPERCLIP_RUN_ID, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID.
Variable de config de l'agent : SONDE_JOURNAL (fichier JSONL de traces).
Aucun secret n'est écrit dans le journal.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROLE = sys.argv[1] if len(sys.argv) > 1 else "producteur"
BASE = os.environ.get("PAPERCLIP_API_URL", "http://localhost:3100").rstrip("/")
if not BASE.endswith("/api"):
    BASE += "/api"
CLE = os.environ.get("PAPERCLIP_API_KEY", "")
RUN = os.environ.get("PAPERCLIP_RUN_ID", "")
MOI = os.environ.get("PAPERCLIP_AGENT_ID", "")
SOCIETE = os.environ.get("PAPERCLIP_COMPANY_ID", "")
JOURNAL = os.environ.get("SONDE_JOURNAL", "")


def trace(evenement, **donnees):
    ligne = {
        "t": datetime.now(timezone.utc).isoformat(),
        "role": ROLE,
        "agent": MOI,
        "run": RUN,
        "evenement": evenement,
        **donnees,
    }
    print(json.dumps(ligne, ensure_ascii=False), flush=True)
    if JOURNAL:
        with open(JOURNAL, "a", encoding="utf-8") as f:
            f.write(json.dumps(ligne, ensure_ascii=False) + "\n")


def api(methode, chemin, corps=None):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(BASE + chemin, data=donnees, method=methode)
    req.add_header("Authorization", f"Bearer {CLE}")
    req.add_header("X-Paperclip-Run-Id", RUN)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as rep:
            brut = rep.read().decode("utf-8")
            return rep.status, (json.loads(brut) if brut else None)
    except urllib.error.HTTPError as err:
        brut = err.read().decode("utf-8", "replace")
        try:
            return err.code, json.loads(brut)
        except ValueError:
            return err.code, {"brut": brut[:500]}


def mes_taches():
    code, corps = api(
        "GET",
        f"/companies/{SOCIETE}/issues?assigneeAgentId={MOI}"
        "&status=todo,in_progress,in_review,blocked",
    )
    if code != 200:
        trace("liste_echec", code=code, corps=corps)
        return []
    return corps if isinstance(corps, list) else corps.get("items", [])


def nb_revisions(tache_id):
    code, corps = api("GET", f"/issues/{tache_id}/documents/livrable/revisions")
    if code != 200:
        return 0
    lignes = corps if isinstance(corps, list) else corps.get("items", [])
    return len(lignes)


def produire(tache, contourner=False):
    tid = tache["id"]
    if tache["status"] in ("todo", "backlog", "blocked", "in_progress"):
        code, corps = api(
            "POST",
            f"/issues/{tid}/checkout",
            {"agentId": MOI, "expectedStatuses": ["todo", "backlog", "blocked", "in_progress"]},
        )
        trace("checkout", tache=tache.get("identifier"), code=code)
        if code not in (200, 201):
            return
    version = nb_revisions(tid) + 1
    # Une révision d'un document existant doit citer la révision de base
    # (contrôle de concurrence optimiste natif ; sans elle : 409).
    code_doc, doc = api("GET", f"/issues/{tid}/documents/livrable")
    base = doc.get("latestRevisionId") if code_doc == 200 and isinstance(doc, dict) else None
    code, _ = api(
        "PUT",
        f"/issues/{tid}/documents/livrable",
        {
            "title": "Livrable (démonstration)",
            "format": "markdown",
            "body": f"# Livrable v{version}\n\nContenu de démonstration, aucune IA réelle.\n",
            "changeSummary": f"Version {version} (démonstration)",
            "baseRevisionId": base,
        },
    )
    trace("livrable_ecrit", tache=tache.get("identifier"), version=version, code=code)
    if contourner:
        code, corps = api("PATCH", f"/issues/{tid}", {"executionPolicy": None})
        trace(
            "tentative_retrait_politique",
            tache=tache.get("identifier"),
            code=code,
            politique_apres=(corps or {}).get("executionPolicy") if isinstance(corps, dict) else None,
        )
    code, corps = api(
        "PATCH",
        f"/issues/{tid}",
        {"status": "done", "comment": f"Livrable v{version} prêt (démonstration)."},
    )
    etat = corps if isinstance(corps, dict) else {}
    trace(
        "demande_cloture",
        tache=tache.get("identifier"),
        code=code,
        statut_apres=etat.get("status"),
        assigne_agent_apres=etat.get("assigneeAgentId"),
        assigne_humain_apres=etat.get("assigneeUserId"),
        etat_execution=etat.get("executionState"),
        erreur=etat.get("error") if code >= 400 else None,
    )


def relire(tache, toujours_refuser=False):
    tid = tache["id"]
    if tache["status"] != "in_review":
        return
    revisions = nb_revisions(tid)
    if toujours_refuser or revisions < 2:
        corps_patch = {
            "status": "in_progress",
            "comment": f"CHANGES_REQUESTED : révision {revisions} insuffisante (démonstration).",
        }
        verdict = "CHANGES_REQUESTED"
    else:
        corps_patch = {
            "status": "done",
            "comment": f"PASS : révision {revisions} conforme (démonstration).",
        }
        verdict = "PASS"
    code, corps = api("PATCH", f"/issues/{tid}", corps_patch)
    etat = corps if isinstance(corps, dict) else {}
    trace(
        "verdict",
        tache=tache.get("identifier"),
        verdict=verdict,
        revisions=revisions,
        code=code,
        statut_apres=etat.get("status"),
        assigne_agent_apres=etat.get("assigneeAgentId"),
        assigne_humain_apres=etat.get("assigneeUserId"),
        etat_execution=etat.get("executionState"),
        erreur=etat.get("error") if code >= 400 else None,
    )


def main():
    trace("reveil", raison=os.environ.get("PAPERCLIP_WAKE_REASON"))
    for tache in mes_taches():
        if ROLE in ("producteur", "contourneur"):
            if tache["status"] != "in_review":
                produire(tache, contourner=(ROLE == "contourneur"))
        elif ROLE in ("relecteur", "refuseur"):
            relire(tache, toujours_refuser=(ROLE == "refuseur"))
    # Le commentaire obligatoire de fin de run est satisfait par le commentaire
    # joint à la mise à jour de statut ci-dessus.
    return 0


if __name__ == "__main__":
    sys.exit(main())
