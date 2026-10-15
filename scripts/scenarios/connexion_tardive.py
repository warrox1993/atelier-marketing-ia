#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve : une connexion créée par une carte APRÈS le bootstrap est réservée aux rôles prévus,
sans intervention humaine, dans le délai du Gardien des connexions.

Usage : python3 -I scripts/scenarios/connexion_tardive.py <API> <carte> [methode] [--delai SECONDES]
  <API>    base de l'API, par exemple http://127.0.0.1:3360/api (instance d'essai, JAMAIS une
           instance qu'un autre utilise) ;
  <carte>  slug d'une carte de galerie de la passerelle (atelier-facebook, atelier-hubspot,
           atelier-google-ads, …), passerelle en DÉMONSTRATION (aucun fournisseur réel) ;
  --delai  durée d'attente maximale (défaut 240 s).

Déroulé :
  1. relevé de l'organisation (11 agents du registre + Gardien des connexions) ;
  2. la carte crée la connexion et la finalise avec « tous les agents » (défaut natif, comme
     l'interface) : on mesure alors la FENÊTRE OUVERTE (agents qui voient la connexion) ;
  3. aucune action humaine : attente, par relevé toutes les 3 s, que l'accès natif, les
     installations et les profils effectifs correspondent au registre ;
  4. contrôles finals : seuls les rôles déclarés voient la connexion (jamais le Gardien),
     les rôles en lecture ont la politique « block » sur les écritures, appel d'essai d'une
     écriture refusé pour eux.
Sortie : un résumé lisible puis le JSON des mesures ; code 0 si tout est conforme, 1 sinon.
Aucun appel de modèle, aucune dépense, aucun fournisseur réel.
"""
import importlib.util
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
GARDIEN_SLUG = "gardien-des-connexions"


def charger_cartes():
    spec = importlib.util.spec_from_file_location("cartes", Path(__file__).with_name("cartes.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fabriquer_api(base):
    def api(methode, chemin, corps=None, attendu=None):
        donnees = None if corps is None else json.dumps(corps).encode()
        req = urllib.request.Request(base + chemin, data=donnees, method=methode,
                                     headers={"Content-Type": "application/json", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as rep:
                brut = rep.read().decode()
                code, sortie = rep.status, (json.loads(brut) if brut else None)
        except urllib.error.HTTPError as err:
            code, sortie = err.code, err.read().decode()[:600]
        if attendu and code not in attendu:
            raise RuntimeError(f"{methode} {chemin} -> {code} : {sortie}")
        return code, sortie

    return api


def slug_agent(nom):
    import re
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", nom.strip().lower()))


def main(argv):
    delai = 240
    if "--delai" in argv:
        i = argv.index("--delai")
        delai = int(argv[i + 1])
        del argv[i:i + 2]
    if len(argv) < 3:
        print(__doc__)
        return 2
    base, carte = argv[1].rstrip("/"), argv[2]
    methode = argv[3] if len(argv) > 3 else "lecture"
    api = fabriquer_api(base)
    cartes = charger_cartes()

    reg = json.load(open(RACINE / "organisation" / "registre" / "agents.json", encoding="utf-8"))
    services = reg["connexionsPasserelle"]["services"]
    cle_service = next((cle for cle, slug in services.items() if slug == carte), None)
    if cle_service is None:
        print(f"Carte inconnue du registre : {carte} (attendu : {', '.join(services.values())})")
        return 2
    prevus = {a["slug"]: a["connexions"][cle_service] for a in reg["agents"] if cle_service in (a.get("connexions") or {})}

    _, entreprises = api("GET", "/companies", attendu=(200,))
    entreprise = next(c for c in entreprises if "Rénovation Liège" in (c.get("name") or ""))
    cid = entreprise["id"]
    _, liste = api("GET", f"/companies/{cid}/agents", attendu=(200,))
    agents = {slug_agent(a["name"]): a for a in liste if a.get("status") != "terminated"}
    gardien = agents.get(GARDIEN_SLUG)
    if gardien is None:
        print("Gardien des connexions absent : lancer « bootstrap-organisation.py appliquer » d'abord.")
        return 2
    registre = [a["slug"] for a in reg["agents"]]
    print(f"Organisation : {len(registre)} agents du registre ; Gardien {gardien['status']} ; "
          f"rôles prévus pour {carte} : {', '.join(f'{s} ({a})' for s, a in prevus.items()) or 'aucun'}")

    def voient(connexion_id):
        """Agents (registre + gardien) dont le profil effectif contient la connexion."""
        vus = []
        for slug in registre + [GARDIEN_SLUG]:
            _, eff = api("GET", f"/companies/{cid}/tools/profiles/effective/agents/{agents[slug]['id']}", attendu=(200,))
            if any(p.get("profileKey") == f"app:{connexion_id}" for p in eff.get("profiles", [])):
                vus.append(slug)
        return sorted(vus)

    def installs(connexion_id):
        _, rep = api("GET", f"/tool-connections/{connexion_id}/installs", attendu=(200,))
        par_id = {a["id"]: s for s, a in agents.items()}
        return sorted(par_id.get(i["targetId"], "entreprise entière") if i["targetType"] == "agent" else "entreprise entière"
                      for i in rep.get("installs", []))

    # 2. Création par la carte (défaut natif : tous les agents).
    t0 = time.time()
    resume = cartes.connecter_carte(api, cid, carte, methode, finaliser=True)
    cx = resume["connexionId"]
    cree = time.time() - t0
    fenetre = voient(cx)
    print(f"Connexion « {resume.get('nom')} » créée et finalisée par la carte (tous les agents, défaut natif) ; "
          f"fenêtre ouverte : {len(fenetre)} agent(s) la voient ({', '.join(fenetre)}) ; installations : {installs(cx)}")
    attendu_voient = sorted(prevus)
    mesures = {"carte": carte, "connexion": cx, "prevus": prevus, "fenetreOuverte": fenetre}
    if fenetre == attendu_voient:
        print("ÉCART : la connexion était déjà réservée à la création (rien à prouver avec cette carte).")

    # 3. Attente SANS action humaine.
    debut = time.time()
    conforme = False
    while time.time() - debut < delai:
        if installs(cx) == attendu_voient and voient(cx) == attendu_voient:
            conforme = True
            break
        time.sleep(3)
    duree = round(time.time() - debut, 1)
    mesures["secondesJusquaConformite"] = duree if conforme else None
    if not conforme:
        print(f"ÉCHEC : toujours pas conforme après {delai} s (installations {installs(cx)}, profils {voient(cx)}).")
        print(json.dumps(mesures, ensure_ascii=False, indent=2))
        return 1
    print(f"Conforme après {duree} s sans intervention : seuls {', '.join(attendu_voient)} voient la connexion.")

    # 4. Contrôles finals.
    erreurs = []
    if GARDIEN_SLUG in voient(cx):
        erreurs.append("le Gardien voit la connexion")
    _, politiques = api("GET", f"/companies/{cid}/tools/policies", attendu=(200,))
    politiques = politiques.get("policies", politiques) if isinstance(politiques, dict) else politiques
    noms = {p.get("name") for p in politiques}
    catalogue = resume.get("catalogue") or {}
    ecritures = [nom for nom, risque in catalogue.items() if risque in ("write", "destructive")]
    mesures["appelsEssai"] = {}
    for slug, acces in prevus.items():
        bloc = f"atelier-lecture-seule:{cx}:{slug}"
        if acces != "lecture":
            continue
        if bloc not in noms:
            erreurs.append(f"politique de lecture seule absente pour {slug}")
        # Appel d'essai natif de chaque écriture : le rôle en lecture doit être refusé par la politique « block ».
        for ecriture in ecritures:
            _, essai = api("POST", f"/tool-connections/{cx}/test-calls",
                           {"agentId": agents[slug]["id"], "toolName": ecriture, "parameters": {}})
            essai = essai if isinstance(essai, dict) else {}
            # Refus par la politique native : décision « off » et motif « deny_policy_block ».
            motif = (essai.get("error") or {}).get("reasonCode")
            mesures["appelsEssai"][f"{slug}:{ecriture}"] = f"{essai.get('decision')} / {motif}"
            if motif != "deny_policy_block":
                erreurs.append(f"{slug} : {ecriture} devrait être refusé par la politique block, obtenu {essai.get('decision')} / {motif}")
    # Idempotence : le battement suivant n'écrit rien (état stable).
    stable = installs(cx) == attendu_voient and voient(cx) == attendu_voient
    if not stable:
        erreurs.append("état instable après la conformité")
    mesures["delaiAnnonce"] = "intervalle du Gardien (60 s) + pas du planificateur (30 s) : environ 90 s, 100 s au plus en régime normal"
    mesures["erreurs"] = erreurs
    print(json.dumps(mesures, ensure_ascii=False, indent=2))
    print("RÉUSSI" if not erreurs else "ÉCHEC : " + " ; ".join(erreurs))
    return 0 if not erreurs else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
