#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonde : comment les compétences arrivent dans l'espace d'exécution d'un run claude_local.

À lancer avec « python3 -I scripts/bootstrap-sonde-competences.py --sortie DOSSIER ».
AUCUN appel de modèle : l'agent sondé exécute scripts/bootstrap-faux-claude.sh à la place
de claude. La sonde travaille dans une entreprise jetable « Sonde lot B (à supprimer) »,
jamais dans l'organisation de démonstration, et la supprime à la fin (sauf --garder).

Étapes : import natif du paquet dans l'entreprise jetable, versions natives des
compétences, secret factice lié par secret_ref, réveil manuel de l'agent « exigences »,
puis comparaison entre ce que le faux claude a reçu (arguments, --add-dir, empreintes)
et ce que Paperclip journalise pour le run (runtimeSkills, bundle de prompt).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
NOM_SONDE = "Sonde lot B (à supprimer)"


def charger_bootstrap():
    sys.dont_write_bytecode = True  # pas de __pycache__ dans scripts/
    spec = importlib.util.spec_from_file_location("bootstrap_organisation", RACINE / "scripts" / "bootstrap-organisation.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--sortie", required=True, help="dossier où écrire les relevés (vide ou absent)")
    p.add_argument("--garder", action="store_true", help="ne pas supprimer l'entreprise jetable")
    args = p.parse_args()
    b = charger_bootstrap()
    api = b.Api(b.url_api())
    sortie = Path(args.sortie).resolve()
    if sortie.exists() and any(sortie.iterdir()):
        print(f"Le dossier de sortie n'est pas vide : {sortie}", file=sys.stderr)
        return 2
    sortie.mkdir(parents=True, exist_ok=True)

    if any(c.get("name") == NOM_SONDE for c in api.get("/companies")):
        print(f"Une entreprise « {NOM_SONDE} » existe déjà : supprimez-la d'abord.", file=sys.stderr)
        return 2

    fichiers = b.fichiers_paquet()
    resultat = api.appel("POST", "/companies/import", {
        "source": {"type": "inline", "files": fichiers, "expectedFileCount": len(fichiers)},
        "include": {"company": True, "agents": True, "projects": False, "issues": False, "skills": True},
        "target": {"mode": "new_company", "newCompanyName": NOM_SONDE},
        "collisionStrategy": "rename",
        "pauseAutomations": True,
    })
    cid = resultat["company"]["id"]
    print(f"Entreprise jetable : {cid}")
    rapport = {"companyId": cid}
    try:
        versions, _ = b.assurer_versions_competences(api, cid)
        agents = b.agents_par_slug(api, cid)
        # Les gabarits de politiques, résolus avec les agents de l'entreprise jetable, sont
        # soumis au validateur du serveur sur des tâches NON affectées (aucun réveil).
        politiques = {}
        for nom, gabarit in b.resoudre_politiques(agents, b.utilisateur_responsable(api)).items():
            tache = api.appel("POST", f"/companies/{cid}/issues", {
                "title": f"Sonde politique {nom}",
                "executionPolicy": gabarit["executionPolicy"],
                "responsibleUserId": gabarit["responsibleUserId"],
            })
            stockee = (api.get(f"/issues/{tache['id']}").get("executionPolicy") or {})
            politiques[nom] = {
                "acceptee": True,
                "etapes": [e.get("type") for e in stockee.get("stages") or []],
                "maxReviewRounds": stockee.get("maxReviewRounds"),
                "responsable": api.get(f"/issues/{tache['id']}").get("responsibleUserId"),
            }
        rapport["politiques"] = politiques
        agent = agents["exigences"]
        secret = api.appel("POST", f"/companies/{cid}/secrets", {
            "name": "Jeton factice de la sonde",
            "key": "sonde-jeton-factice",
            "value": "valeur-factice-non-valide-pour-la-sonde",
        })
        cwd = sortie / "espace"
        config = sortie / "claude-config"
        releves = sortie / "releves"
        for d in (cwd, config):
            d.mkdir(parents=True, exist_ok=True)
        api.appel("PATCH", f"/agents/{agent['id']}", {"adapterConfig": {
            "command": str(RACINE / "scripts" / "bootstrap-faux-claude.sh"),
            "cwd": str(cwd),
            "env": {
                "DISABLE_TELEMETRY": {"type": "plain", "value": "1"},
                "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": {"type": "plain", "value": "1"},
                "CLAUDE_CONFIG_DIR": {"type": "plain", "value": str(config)},
                "ATELIER_SONDE_SORTIE": {"type": "plain", "value": str(releves)},
                "CLAUDE_CODE_OAUTH_TOKEN": {"type": "secret_ref", "secretId": secret["id"], "version": "latest"},
            },
        }})
        api.appel("POST", f"/agents/{agent['id']}/resume", {})
        rapport["agentActive"] = agent["id"]
        reveil = api.appel("POST", f"/agents/{agent['id']}/wakeup", {
            "source": "on_demand", "triggerDetail": "manual", "reason": "Sonde lot B : injection des compétences",
        }, attendu=(200, 201, 202))
        run_id = (reveil or {}).get("id") or (reveil or {}).get("runId")
        rapport["reveil"] = reveil
        fin = time.time() + 120
        run = None
        while time.time() < fin:
            runs = api.get(f"/companies/{cid}/heartbeat-runs")
            runs = runs if isinstance(runs, list) else runs.get("items", [])
            candidats = [r for r in runs if r.get("agentId") == agent["id"]]
            if run_id:
                candidats = [r for r in candidats if r.get("id") == run_id] or candidats
            if candidats and candidats[0].get("status") in ("succeeded", "failed", "cancelled", "timed_out", "error", "interrupted"):
                run = candidats[0]
                break
            time.sleep(2)
        if run is None:
            raise b.ErreurAtelier("aucun run terminé en 120 s")
        api.appel("POST", f"/agents/{agent['id']}/pause", {})
        rapport.pop("agentActive", None)
        detail = api.get(f"/heartbeat-runs/{run['id']}")
        evenements = api.get(f"/heartbeat-runs/{run['id']}/events")
        (sortie / "run.json").write_text(json.dumps(detail, ensure_ascii=False, indent=2), encoding="utf-8")
        (sortie / "run-events.json").write_text(json.dumps(evenements, ensure_ascii=False, indent=2), encoding="utf-8")
        rapport["run"] = {"id": run["id"], "statut": detail.get("status")}
        rapport["versionsNatives"] = versions
        recues = json.loads((releves / "competences.json").read_text(encoding="utf-8")) if (releves / "competences.json").exists() else {}
        verrou = b.lire_json(b.ORGA / b.FICHIER_VERROU)["competences"]
        souhaitees = set(next(a for a in json.loads((b.ORGA / "registre" / "agents.json").read_text(encoding="utf-8"))["agents"] if a["slug"] == "exigences")["competences"])
        comparaison = {}
        for nom, info in recues.items():
            # Nom d'exécution = <slug>--<suffixe> (buildSkillRuntimeName) ; les compétences
            # intégrées de Paperclip gardent leur nom seul.
            slug = nom.rsplit("--", 1)[0]
            attendu = verrou.get(slug, {}).get("sha256")
            comparaison[nom] = {"slug": slug, "sha256Recu": info["sha256"], "sha256Verrou": attendu, "identique": attendu == info["sha256"]}
        rapport["competencesMontees"] = comparaison
        invocation = next((e for e in (evenements if isinstance(evenements, list) else evenements.get("items", []))
                           if e.get("eventType") == "adapter.invoke"), {})
        notes = (invocation.get("payload") or {}).get("commandNotes") or []
        rapport["journalNatif"] = {
            "bundlePrompt": next((n for n in notes if "prompt bundle" in n), None),
            "jetonDansLeJournal": ((invocation.get("payload") or {}).get("env") or {}).get("CLAUDE_CODE_OAUTH_TOKEN"),
        }
        rapport["versionsAttendues"] = {s: {"versionId": v["versionId"], "etiquette": v["etiquette"]}
                                       for s, v in versions.items() if s in souhaitees}
        rapport["competencesSouhaitees"] = sorted(souhaitees)
        rapport["argv"] = (releves / "argv.txt").read_text(encoding="utf-8").splitlines() if (releves / "argv.txt").exists() else None
        rapport["env"] = (releves / "env.txt").read_text(encoding="utf-8").splitlines() if (releves / "env.txt").exists() else None
    finally:
        if rapport.get("agentActive"):
            api.appel("POST", f"/agents/{rapport.pop('agentActive')}/pause", {})
        if not args.garder:
            api.appel("DELETE", f"/companies/{cid}")
            rapport["entrepriseJetableSupprimee"] = not any(c.get("id") == cid for c in api.get("/companies"))
    (sortie / "rapport.json").write_text(json.dumps(rapport, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in rapport.items() if k not in ("reveil", "versionsNatives")}, ensure_ascii=False, indent=2))
    # La sonde est aussi un test : échec si le run n'a pas réussi ou si une compétence
    # voulue n'est pas montée à l'identique.
    montees = {v["slug"]: v["identique"] for v in rapport.get("competencesMontees", {}).values()}
    reussi = (rapport.get("run") or {}).get("statut") == "succeeded" and all(
        montees.get(s) for s in rapport.get("competencesSouhaitees", []))
    print("SONDE : RÉUSSIE" if reussi else "SONDE : ÉCHEC")
    return 0 if reussi else 1


if __name__ == "__main__":
    sys.exit(main())
