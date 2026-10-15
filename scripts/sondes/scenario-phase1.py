#!/usr/bin/env python3
"""Sonde de phase 1 : vérifie contre une instance Paperclip locale réelle les
capacités natives dont dépend l'Atelier Marketing IA.

Usage : python3 -I scripts/sondes/scenario-phase1.py [URL_API]
Prérequis : instance lancée (scripts/lancer-instance.sh), mode local_trusted.
Agents : adaptateur natif « process » qui exécute scripts/sondes/agent-sonde.py
(aucun appel de modèle, aucune dépense).

Chaque contrôle produit une ligne « OK », « ÉCART » ou « INFO » avec la preuve
(code HTTP, état natif). La sonde crée une entreprise dédiée « Sonde phase 1 ».
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3100/api").rstrip("/")
RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SONDE_AGENT = os.path.join(RACINE, "scripts", "sondes", "agent-sonde.py")
JOURNAL = os.path.join(RACINE, "instance", "sonde-agents.jsonl")
RESULTATS = []


def api(methode, chemin, corps=None, attendu=None):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(API + chemin, data=donnees, method=methode)
    if donnees is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as rep:
            brut = rep.read().decode("utf-8")
            code, sortie = rep.status, (json.loads(brut) if brut else None)
    except urllib.error.HTTPError as err:
        brut = err.read().decode("utf-8", "replace")
        try:
            code, sortie = err.code, json.loads(brut)
        except ValueError:
            code, sortie = err.code, {"brut": brut[:300]}
    if attendu is not None and code not in attendu:
        raise RuntimeError(f"{methode} {chemin} -> {code} : {json.dumps(sortie)[:400]}")
    return code, sortie


def note(statut, controle, preuve):
    RESULTATS.append({"statut": statut, "controle": controle, "preuve": preuve})
    print(f"[{statut}] {controle} :: {json.dumps(preuve, ensure_ascii=False)[:600]}", flush=True)


def attendre(fonction, delai=150, pas=3):
    fin = time.time() + delai
    dernier = None
    while time.time() < fin:
        dernier = fonction()
        if dernier:
            return dernier
        time.sleep(pas)
    return dernier


def agent(societe, nom, role, rapporte_a, role_sonde=None):
    config = {"command": "/bin/true"}
    if role_sonde:
        config = {
            "command": "python3",
            "args": ["-I", SONDE_AGENT, role_sonde],
            "cwd": RACINE,
            "timeoutSec": 120,
            "env": {"SONDE_JOURNAL": JOURNAL},
        }
    _, a = api(
        "POST",
        f"/companies/{societe}/agents",
        {
            "name": nom,
            "role": role,
            "reportsTo": rapporte_a,
            "adapterType": "process",
            "adapterConfig": config,
            "runtimeConfig": {"heartbeat": {"enabled": False}},
            "capabilities": f"Agent de sonde ({role_sonde or 'inactif'})",
        },
        attendu=(200, 201),
    )
    return a


def tache(societe, titre, **champs):
    _, t = api("POST", f"/companies/{societe}/issues", {"title": titre, **champs}, attendu=(200, 201))
    return t


def lire(tid):
    return api("GET", f"/issues/{tid}", attendu=(200,))[1]


def principal(etat):
    p = (etat or {}).get("currentParticipant") or {}
    return p.get("agentId") or p.get("userId")


def main():
    # 0. Entreprise dédiée et hiérarchie
    nom = sys.argv[2] if len(sys.argv) > 2 else "Sonde phase 1"
    _, soc = api("POST", "/companies", {"name": nom, "description": "Vérification du socle"}, attendu=(201,))
    S = soc["id"]
    coord = agent(S, "Coordinateur (sonde)", "cmo", None)
    prod = agent(S, "Producteur A (sonde)", "general", coord["id"], "producteur")
    prod2 = agent(S, "Producteur B (sonde)", "general", coord["id"], "producteur")
    contour = agent(S, "Contourneur (sonde)", "general", coord["id"], "contourneur")
    rel = agent(S, "Relecteur 1 (sonde)", "qa", coord["id"], "relecteur")
    rel2 = agent(S, "Relecteur 2 (sonde)", "qa", coord["id"], "relecteur")
    refus = agent(S, "Refuseur (sonde)", "qa", coord["id"], "refuseur")
    _, org = api("GET", f"/companies/{S}/org", attendu=(200,))
    note("INFO", "organigramme natif", {"racines": len(org) if isinstance(org, list) else "objet"})

    # 1. Cycle hiérarchique refusé
    code, corps = api("PATCH", f"/agents/{coord['id']}", {"reportsTo": prod["id"]})
    note("OK" if code >= 400 else "ÉCART", "cycle hiérarchique refusé", {"code": code, "erreur": (corps or {}).get("error")})

    # 2. Dépendances : cycle de blocage refusé
    b1 = tache(S, "Dépendance 1 (sonde)")
    b2 = tache(S, "Dépendance 2 (sonde)", blockedByIssueIds=[b1["id"]])
    code, corps = api("PATCH", f"/issues/{b1['id']}", {"blockedByIssueIds": [b2["id"]]})
    note("OK" if code >= 400 else "ÉCART", "cycle de dépendances refusé", {"code": code, "erreur": (corps or {}).get("error")})

    # 3. Réclamation atomique : deux checkouts concurrents par le board au nom
    #    de deux agents différents (sans run) -> attendu : un seul gagnant.
    c1 = tache(S, "Checkout concurrent (sonde)", status="todo")
    r1 = api("POST", f"/issues/{c1['id']}/checkout", {"agentId": coord["id"], "expectedStatuses": ["todo"]})
    r2 = api("POST", f"/issues/{c1['id']}/checkout", {"agentId": refus["id"], "expectedStatuses": ["todo"]})
    note("INFO", "checkout par le board (deux agents)", {"premier": r1[0], "second": r2[0], "erreur_second": (r2[1] or {}).get("error")})

    # 4. Politique review (2 participants) + approval humaine, rounds par défaut.
    t1 = tache(
        S,
        "Revue + approbation (sonde)",
        status="todo",
        assigneeAgentId=prod["id"],
        executionPolicy={
            "mode": "normal",
            "commentRequired": True,
            "stages": [
                {"type": "review", "participants": [{"type": "agent", "agentId": rel["id"]}, {"type": "agent", "agentId": rel2["id"]}]},
                {"type": "approval", "participants": [{"type": "user", "userId": "local-board"}]},
            ],
        },
    )
    # 5. Contournement : le producteur tente de retirer la politique.
    t2 = tache(
        S,
        "Contournement (sonde)",
        status="todo",
        assigneeAgentId=contour["id"],
        executionPolicy={"stages": [{"type": "review", "participants": [{"type": "agent", "agentId": refus["id"]}]}]},
    )
    # 6. Limite de tours : relecteur qui refuse toujours, maxReviewRounds=2.
    t3 = tache(
        S,
        "Limite de tours (sonde)",
        status="todo",
        assigneeAgentId=prod2["id"],
        executionPolicy={"maxReviewRounds": 2, "stages": [{"type": "review", "participants": [{"type": "agent", "agentId": refus["id"]}]}]},
    )

    def t1_en_approbation():
        x = lire(t1["id"])
        e = x.get("executionState") or {}
        return x if (x["status"] == "in_review" and e.get("currentStageType") == "approval") else None

    x1 = attendre(t1_en_approbation, delai=200)
    x1 = x1 or lire(t1["id"])
    e1 = x1.get("executionState") or {}
    note(
        "OK" if e1.get("currentStageType") == "approval" else "ÉCART",
        "clôture interceptée, revue, correction, puis étape d'approbation humaine",
        {"statut": x1["status"], "etape": e1.get("currentStageType"), "participant": e1.get("currentParticipant"),
         "assigneUser": x1.get("assigneeUserId"), "etapesFinies": len(e1.get("completedStageIds") or [])},
    )
    _, decisions = api("GET", f"/issues/{t1['id']}/activity")
    _, revs = api("GET", f"/issues/{t1['id']}/documents/livrable/revisions")
    note("INFO", "révisions du livrable T1", {"nombre": len(revs) if isinstance(revs, list) else revs})

    # Approbation humaine (board = local-board) avec commentaire obligatoire.
    code, corps = api("PATCH", f"/issues/{t1['id']}", {"status": "done"})
    note("OK" if code >= 400 else "ÉCART", "approbation sans commentaire refusée", {"code": code, "erreur": (corps or {}).get("error")})
    decisions_humaines = 0
    for _ in range(3):
        x = lire(t1["id"])
        p = (x.get("executionState") or {}).get("currentParticipant") or {}
        if x["status"] != "in_review" or p.get("type") != "user":
            break
        code, corps = api("PATCH", f"/issues/{t1['id']}", {"status": "done", "comment": "Approuvé par l'humain (sonde)."})
        decisions_humaines += 1
    x = lire(t1["id"])
    note("OK" if x["status"] == "done" else "ÉCART", "approbation humaine finale",
         {"statut": x["status"], "decisions_humaines": decisions_humaines, "etat": (x.get("executionState") or {}).get("status")})

    def t3_escalade():
        x = lire(t3["id"])
        e = x.get("executionState") or {}
        p = e.get("currentParticipant") or {}
        return x if p.get("type") == "user" else None

    x3 = attendre(t3_escalade, delai=200) or lire(t3["id"])
    e3 = x3.get("executionState") or {}
    note(
        "OK" if (e3.get("currentParticipant") or {}).get("type") == "user" else "ÉCART",
        "escalade humaine après maxReviewRounds=2",
        {"statut": x3["status"], "participant": e3.get("currentParticipant"), "rounds": e3.get("changesRequestedCount")},
    )

    def t2_traitee():
        x = lire(t2["id"])
        return x if x["status"] in ("in_review", "done") else None

    x2 = attendre(t2_traitee, delai=120) or lire(t2["id"])
    note(
        "OK" if x2["status"] != "done" and x2.get("executionPolicy") else "ÉCART",
        "contournement de la politique par l'agent producteur",
        {"statut": x2["status"], "politique_presente": bool(x2.get("executionPolicy")), "etat": (x2.get("executionState") or {}).get("status")},
    )

    # 6 bis. Même tentative par un agent en preset natif « low_trust_review »,
    #        frontière limitée à sa seule tâche.
    t4 = tache(S, "Contournement low-trust (sonde)", status="todo",
               executionPolicy={"stages": [{"type": "review", "participants": [{"type": "agent", "agentId": refus["id"]}]}]})
    _, lt = api("POST", f"/companies/{S}/agents", {
        "name": "Contourneur low-trust (sonde)", "role": "general", "reportsTo": coord["id"],
        "adapterType": "process",
        "adapterConfig": {"command": "python3", "args": ["-I", SONDE_AGENT, "contourneur"], "cwd": RACINE,
                          "timeoutSec": 120, "env": {"SONDE_JOURNAL": JOURNAL}},
        "runtimeConfig": {"heartbeat": {"enabled": False}},
        "permissions": {"trustPreset": "low_trust_review",
                        "authorizationPolicy": {"trustBoundary": {"mode": "low_trust_review", "issueIds": [t4["id"]]}}},
    })
    code, _ = api("PATCH", f"/issues/{t4['id']}", {"assigneeAgentId": (lt or {}).get("id")})
    note("INFO", "agent low-trust créé et assigné", {"creation": bool(lt and lt.get("id")), "affectation": code})

    def t4_traitee():
        x = lire(t4["id"])
        return x if x["status"] in ("in_review", "done") else None

    x4 = attendre(t4_traitee, delai=120) or lire(t4["id"])
    note("OK" if x4["status"] != "done" and x4.get("executionPolicy") else "ÉCART",
         "contournement par un agent low_trust_review",
         {"statut": x4["status"], "politique_presente": bool(x4.get("executionPolicy"))})

    # 7. Budget : plafond agent puis coût déclaré au-delà -> pause automatique.
    api("PATCH", f"/agents/{coord['id']}/budgets", {"budgetMonthlyCents": 100})
    code, corps = api("POST", f"/companies/{S}/cost-events", {
        "agentId": coord["id"], "provider": "demonstration", "model": "aucun",
        "inputTokens": 0, "outputTokens": 0, "costCents": 150,
        "occurredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    note("INFO", "coût déclaré (démonstration)", {"code": code})
    time.sleep(2)
    _, ag = api("GET", f"/agents/{coord['id']}")
    note("OK" if (ag or {}).get("status") == "paused" else "ÉCART", "pause automatique au plafond", {"statut_agent": (ag or {}).get("status"), "pauseReason": (ag or {}).get("pauseReason")})

    # 8. Approbation humaine native (request_board_approval).
    code, ap = api("POST", f"/companies/{S}/approvals", {"type": "request_board_approval", "payload": {"objet": "Diffusion simulée (sonde)"}})
    note("INFO", "création d'approbation", {"code": code, "statut": (ap or {}).get("status")})
    if code in (200, 201):
        code, ap2 = api("POST", f"/approvals/{ap['id']}/approve", {"decisionNote": "OK (sonde)"})
        note("OK" if (ap2 or {}).get("status") == "approved" else "ÉCART", "décision humaine enregistrée", {"code": code, "statut": (ap2 or {}).get("status")})

    # 9. Secret puis export : la valeur ne doit jamais sortir.
    valeur = "valeur-sonde-ne-doit-pas-fuir-123"
    code, sec = api("POST", f"/companies/{S}/secrets", {"name": "SONDE_SECRET", "value": valeur})
    note("INFO", "création de secret", {"code": code})
    code, liste = api("GET", f"/companies/{S}/secrets")
    note("OK" if valeur not in json.dumps(liste) else "ÉCART", "secret absent de la lecture", {"code": code})
    code, exp = api("POST", f"/companies/{S}/export", {})
    texte = json.dumps(exp)
    note("OK" if code == 200 and valeur not in texte else "ÉCART", "export d'organisation sans valeur secrète",
         {"code": code, "fichiers": sorted(list((exp or {}).get("files", {}).keys()))[:12] if isinstance(exp, dict) else None})

    print("\nRÉSUMÉ " + json.dumps({"societe": S, "OK": sum(r["statut"] == "OK" for r in RESULTATS),
                                    "ECART": sum(r["statut"] == "ÉCART" for r in RESULTATS)}, ensure_ascii=False))
    with open(os.path.join(RACINE, "instance", "sonde-phase1-resultats.json"), "w", encoding="utf-8") as f:
        json.dump({"societe": S, "resultats": RESULTATS}, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
