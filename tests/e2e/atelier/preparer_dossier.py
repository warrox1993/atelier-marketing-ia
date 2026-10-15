#!/usr/bin/env python3
"""Prépare un dossier pour les tests e2e qui agissent dans l'interface.

Rejoue le DÉBUT d'un scénario du lot A (scripts/scenarios/atelier_scenarios.py) avec le
vrai moteur Paperclip et les agents de démonstration, puis S'ARRÊTE avant le geste humain :
c'est l'interface qui le fera pendant le test Playwright.

Usage : python3 -I tests/e2e/atelier/preparer_dossier.py [URL_API=http://127.0.0.1:3140/api] [mode]
Modes :
  pret          (défaut) scénario B jusqu'à l'approbation humaine (décision, Diffuser) ;
  epuise        scénario G jusqu'à l'épuisement des cycles (Relancer la correction) ;
  interruption  scénario E : serveur arrêté pendant le run du producteur, puis relancé, la
                tâche reste bloquée sans rejeu (Reprendre). Exige ATELIER_INSTANCE_ESSAI
                (« id port port_pg » de l'instance d'ESSAI ; jamais l'instance principale).
Sortie : une ligne JSON {"prefixe", "issueId", "etat"} ; code 0 si l'état voulu est atteint.
Aucun appel de modèle, aucune dépense, aucune diffusion.
"""
import json
import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3140/api"
MODE = sys.argv[2] if len(sys.argv) > 2 else "pret"
# Le module du lot A lit l'URL dans sys.argv[2] au chargement.
sys.argv = [sys.argv[0], "B", URL]
sys.path.insert(0, os.path.join(RACINE, "scripts", "scenarios"))
import atelier_scenarios as s  # noqa: E402

BRIEF = (
    "Campagne « Toitures avant l'hiver » pour Rénovations Meuse et Ourthe (entreprise fictive). "
    "Créer une page « Nos établissements » qui présente nos trois établissements : Liège-Guillemins, Herstal et Seraing, "
    "avec adresse et horaires, et qui invite à demander un diagnostic via la page contact."
)


def epuise():
    entreprise, ids, projet = s.preparer("G", nom="Dossier e2e relance (démonstration)")
    campagne = s.lancer_campagne(entreprise, ids, projet, BRIEF, ["Liège-Guillemins", "Herstal", "Seraing"])
    production = s.attendre(lambda: s.production(entreprise, campagne["briefIssueId"]), delai=180)
    if not production:
        print(json.dumps({"etat": "pas de tâche de production"}))
        return 1
    dossier = s.attendre_epuisement(entreprise, production["id"])
    _, societe = s.api("GET", f"/companies/{entreprise}")
    print(json.dumps({"prefixe": societe.get("issuePrefix"), "issueId": production["id"], "etat": (dossier or {}).get("cycles")}, ensure_ascii=False))
    return 0 if dossier and dossier["cycles"]["epuises"] else 1


def interruption():
    essai = s.instance_essai()
    if not essai:
        print(json.dumps({"etat": "ATELIER_INSTANCE_ESSAI absent : interruption refusée (jamais l'instance principale)"}))
        return 2
    entreprise, ids, projet = s.preparer("E", env_agents={"producteur": {"DEMO_PAUSE_MS": "30000"}}, nom="Dossier e2e reprise (démonstration)")
    s.COMPAGNIE_SONDE[:] = [entreprise]
    campagne = s.lancer_campagne(entreprise, ids, projet, BRIEF, ["Liège-Guillemins", "Herstal", "Seraing"])
    production = s.attendre(lambda: s.production(entreprise, campagne["briefIssueId"]), delai=180)
    if not production:
        print(json.dumps({"etat": "pas de tâche de production"}))
        return 1
    T = production["id"]
    # Signaux NATIFS (le journal du plugin peut arriver après la pause du producteur) : révision 1
    # écrite et run du producteur encore en cours sur cette tâche (pause DEMO_PAUSE_MS).
    def en_pause():
        doc = s.api("GET", f"/issues/{T}/documents/livrable")[0] == 200
        runs = s.api("GET", f"/companies/{entreprise}/heartbeat-runs?limit=50")[1] or []
        return doc and any(r["status"] == "running" and (r.get("contextSnapshot") or {}).get("issueId") == T for r in runs)
    s.attendre(en_pause, delai=120, pas=1)
    fichier = os.path.join(RACINE, "instance", "scenarios", "instance-essai-e2e-reprise.log")
    os.makedirs(os.path.dirname(fichier), exist_ok=True)
    res = s.arreter_redemarrer(essai, fichier)
    bloquee = s.attendre(lambda: (lambda x: x if x["status"] == "blocked" else None)(s.lire(T)), delai=60)
    _, dossier = s.api("GET", f"/plugins/atelier.marketing-ia/api/taches/{T}/dossier")
    _, societe = s.api("GET", f"/companies/{entreprise}")
    inter = (dossier or {}).get("interruption") if isinstance(dossier, dict) else None
    print(json.dumps({"prefixe": societe.get("issuePrefix"), "issueId": T, "etat": {"redemarrage": res, "statut": (bloquee or {}).get("status"), "interruption": inter}}, ensure_ascii=False))
    return 0 if bloquee and inter else 1


def principal():
    s.installer_plugin()
    if MODE == "epuise":
        return epuise()
    if MODE == "interruption":
        return interruption()
    entreprise, ids, projet = s.preparer("B", nom=os.environ.get("ATELIER_DOSSIER_NOM") or "Dossier e2e lot C (démonstration)")
    campagne = s.lancer_campagne(entreprise, ids, projet, BRIEF, ["Liège-Guillemins", "Herstal", "Seraing"])
    production = s.attendre(lambda: s.production(entreprise, campagne["briefIssueId"]), delai=180)
    if not production:
        print(json.dumps({"etat": "pas de tâche de production"}))
        return 1
    pret = s.attendre_humain(production["id"], delai=420)
    _, societe = s.api("GET", f"/companies/{entreprise}")
    etat = s.etat(pret or s.lire(production["id"]))
    print(json.dumps({"prefixe": societe.get("issuePrefix"), "issueId": production["id"], "etat": etat}, ensure_ascii=False))
    return 0 if pret else 1


if __name__ == "__main__":
    sys.exit(principal())
