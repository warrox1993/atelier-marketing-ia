#!/usr/bin/env python3
"""Prépare un dossier RÉEL (campagne en mode réel, agents de démonstration, aucun appel de modèle) pour les
parcours e2e du contrat v1.6 : « l'humain approuve l'appel exact proposé » et « révocation de la preuve ».

Étapes : entreprise et campagne réelle ; clés de signature de l'entreprise (`bootstrap-organisation.py cles`,
données locales ISOLÉES : jamais le dossier instance/ de l'instance principale) ; scénario B joué par le vrai
moteur jusqu'à l'étape humaine ; l'agent (ici le script, en board) PROPOSE l'appel exact sur la révision courante.
Mode « diffusee » : en plus, la décision humaine est enregistrée par l'API et l'agent demande la diffusion avec
le même appel, ce qui rend une diffusion « préparée » avec preuve signée (la preuve n'est ni affichée ni stockée).

Usage : python3 -I tests/e2e/atelier/preparer_appel.py [URL_API] [propose|diffusee] [nom d'entreprise]
Variables : ATELIER_DONNEES_LOCALES (défaut instance/essai-appel-donnees), PAPERCLIP_INSTANCE_ID (défaut atelier-appel).
Sortie : une ligne JSON {"prefixe", "issueId", "appel", "diffusion"} ; code 0 si l'état voulu est atteint.
"""
import json
import os
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3590/api"
MODE = sys.argv[2] if len(sys.argv) > 2 else "propose"
NOM = sys.argv[3] if len(sys.argv) > 3 else f"Dossier e2e appel {MODE} (démonstration)"
# Le module du lot A lit l'URL dans sys.argv[2] au chargement.
sys.argv = [sys.argv[0], "B", URL]
sys.path.insert(0, os.path.join(RACINE, "scripts", "scenarios"))
import atelier_scenarios as s  # noqa: E402

# Environnement propre à chaque rôle des agents déterministes (vide par défaut).
ENV_AGENTS = {r: {} for r in ("coordinateur", "producteur", "porte", "exigences", "metier", "technique", "contourneur")}

BRIEF = (
    "Campagne « Toitures avant l'hiver » pour Rénovations Meuse et Ourthe (entreprise fictive). "
    "Créer une page « Nos établissements » qui présente nos trois établissements : Liège-Guillemins, Herstal et Seraing, "
    "avec adresse et horaires, et qui invite à demander un diagnostic via la page contact."
)
COMPTE = "Page Facebook Rénovations Meuse (démonstration)"


def cles(entreprise):
    env = dict(os.environ)
    env["ATELIER_API"] = URL
    env.setdefault("PAPERCLIP_INSTANCE_ID", "atelier-appel")
    env.setdefault("ATELIER_DONNEES_LOCALES", os.path.join(RACINE, "instance", "essai-appel-donnees"))
    r = subprocess.run(
        ["python3", "-I", os.path.join(RACINE, "scripts", "bootstrap-organisation.py"), "cles", "--confirmer", "--entreprise", entreprise],
        env=env, capture_output=True, text=True, timeout=180,
    )
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-800:] + r.stderr[-800:])
    return r.returncode == 0


def phrase_du_livrable(corps):
    """Une ligne complète du livrable (le serveur exige un texte présent TEL QUEL dans la révision)."""
    for ligne in corps.splitlines():
        t = ligne.strip()
        if len(t) >= 40 and not t.startswith(("#", "|", ">", "`")) and "\r" not in t:
            return t
    return None


def principal():
    s.installer_plugin()
    entreprise, ids, projet = s.preparer("B", env_agents=ENV_AGENTS, nom=NOM)
    if not cles(entreprise):
        print(json.dumps({"etat": "clés de signature non créées"}))
        return 1
    campagne = s.lancer_campagne(entreprise, ids, projet, BRIEF, ["Liège-Guillemins", "Herstal", "Seraing"], extra={"mode": "reel", "canaux": ["facebook"]})
    production = s.attendre(lambda: s.production(entreprise, campagne["briefIssueId"]), delai=180)
    if not production:
        print(json.dumps({"etat": "pas de tâche de production"}))
        return 1
    T = production["id"]
    pret = s.attendre_humain(T, delai=420)
    if not pret:
        print(json.dumps({"etat": s.etat(s.lire(T))}, ensure_ascii=False))
        return 1
    plugin = s.PLUGIN
    _, dossier = s.api("GET", f"{plugin}/taches/{T}/dossier?vue=complete", attendu=(200,))
    liv = dossier["livrable"]
    phrase = phrase_du_livrable(liv["corps"])
    if not phrase:
        print(json.dumps({"etat": "aucune ligne exploitable dans le livrable"}))
        return 1
    code, appel = s.api("POST", f"{plugin}/taches/{T}/appels", {
        "revisionId": liv["revisionId"], "service": "facebook", "outil": "facebook_publier", "compte": COMPTE, "arguments": {"message": phrase},
    })
    if code not in (200, 201):
        print(json.dumps({"etat": "proposition refusée", "code": code, "erreur": appel}, ensure_ascii=False))
        return 1
    sortie = {"issueId": T, "appel": appel["id"], "empreinte": appel["empreinte"], "message": phrase, "diffusion": None}
    if MODE == "diffusee":
        portee = {"revisionId": liv["revisionId"], "action": "publier", "canal": "facebook", "compte": COMPTE, "audience": None, "montantMaxCents": None, "dureeJours": 30, "appel": appel["approbation"]}
        c1, d1 = s.api("POST", f"{plugin}/taches/{T}/decisions", {"revisionId": liv["revisionId"], "action": "approuver", "commentaire": "Approuvé pour le parcours e2e (l'appel exact).", "portee": portee})
        c2, _ = s.api("PATCH", f"/issues/{T}", {"status": "done", "comment": "Approuvé (parcours e2e de révocation)."})
        c3, diff = s.api("POST", f"{plugin}/taches/{T}/diffusions", {
            "revisionId": liv["revisionId"], "action": "publier", "canal": "facebook", "compte": COMPTE, "cleIdempotence": f"e2e-appel-{T}",
            "service": "facebook", "outil": "facebook_publier", "arguments": {"message": phrase},
        })
        sortie["diffusion"] = {"decision": c1, "cloture": c2, "demande": c3, "etat": (diff or {}).get("etat"), "preuveExpire": (diff or {}).get("preuveExpire"), "motif": (diff or {}).get("motifRefus"), "id": (diff or {}).get("id")}
        ok = c1 in (200, 201) and c3 in (200, 201) and (diff or {}).get("etat") == "preparee" and (diff or {}).get("preuveExpire")
    else:
        ok = True
    _, societe = s.api("GET", f"/companies/{entreprise}")
    sortie["prefixe"] = societe.get("issuePrefix")
    sortie["entreprise"] = entreprise
    print(json.dumps(sortie, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(principal())
