#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Registre des services de l'Atelier : chargement et validation.

Chaque service est une entreprise Paperclip distincte ; la matrice « flux » liste les seuls
échanges autorisés entre services (pas de flux déclaré, pas d'échange).

Réseau des coordinateurs (lot 2 de l'usine v2, réduit le 30/10/2026, COORD-P2-7) : le coordinateur général (Direction,
champ « coordinateurGeneral ») et chaque coordinateur se joignent dans les deux sens ; deux départements se parlent
par un flux métier ou par le coordinateur général, jamais par un flux généré (le maillage de toutes les paires rendait
la garde des flux sans effet). Ces flux ne sont JAMAIS écrits à la main dans le registre : `flux_coordinateurs` les
génère pour les paires avec la Direction que la matrice métier ne couvre pas encore, et `flux_complets` rend la matrice
déclarée au plugin (métier puis générés). Un flux qui touche un service « sensible » ou « public » (qui publie hors de
l'usine, V2-6) exige l'approbation humaine. Le cloisonnement par client est tenu par la déclaration (un client à la
fois) et par le plugin.

Usage : python3 -I scripts/atelier_services.py verifier [--fichier CHEMIN]
Code de sortie : 0 si le registre est valide, 1 sinon. Bibliothèque standard seule, aucune écriture.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIER_PAR_DEFAUT = RACINE / "organisation" / "registre" / "services.json"

# Préfixes déjà portés par des entreprises existantes (aperçu local : « COUA »).
PREFIXES_RESERVES = {"COUA"}

RE_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
RE_PREFIXE = re.compile(r"^[A-Z]{3,4}$")

CHAMPS_TEXTE = ("slug", "nom", "prefixe", "description", "coordinateur")
CHAMPS_LISTES = ("agents", "humainSeul", "obligations", "donnees")
CHAMPS_FLUX = ("source", "cible", "objet")
# Projets et routines d'un service (P1-5, audit du 29/10/2026), facultatifs : mêmes valeurs que le marketing et que le socle
# (PROJECT_STATUSES, ROUTINE_CONCURRENCY_POLICIES, ROUTINE_CATCH_UP_POLICIES de packages/shared/src/constants.ts).
STATUTS_PROJET = ("backlog", "planned", "in_progress", "completed", "cancelled")
CONCURRENCES = ("coalesce_if_active", "always_enqueue", "skip_if_active")
RATTRAPAGES = ("skip_missed", "enqueue_missed_with_cap")
RE_COULEUR = re.compile(r"^#[0-9a-f]{6}$")

# Service qui porte le coordinateur général (entreprise Direction du client).
SERVICE_DIRECTION = "direction"
COMPETENCE_PROTOCOLE = "protocole-inter-coordinateurs"
# Objet des anciens flux générés entre départements (réseau réduit le 30/10) : le plugin le reconnaît encore en base.
OBJET_ENTRE_COORDINATEURS = ("Liaison entre coordinateurs (compétence protocole-inter-coordinateurs) : "
                             "question bornée, réponse tracée, au plus deux relais")
OBJET_COORDINATEUR_GENERAL = ("Coordinateur général et coordinateurs de département (compétence "
                              "protocole-inter-coordinateurs) : délégation, réponse et consolidation tracées")


def charger_services(chemin=FICHIER_PAR_DEFAUT) -> dict:
    """Lit le registre. Un service qui porte « agentsRef » (chemin relatif au fichier) reçoit
    les slugs du registre d'agents référencé dans « agents », sans duplication dans le fichier."""
    chemin = Path(chemin)
    with chemin.open(encoding="utf-8") as f:
        registre = json.load(f)
    services = registre.get("services") if isinstance(registre, dict) else None
    for service in services if isinstance(services, list) else []:
        ref = service.get("agentsRef") if isinstance(service, dict) else None
        if not ref:
            continue
        try:
            with (chemin.parent / ref).open(encoding="utf-8") as f:
                service["agents"] = [a["slug"] for a in json.load(f)["agents"]]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            service["agents"] = []
            service["agentsRefErreur"] = f"{type(exc).__name__} : {exc}"
    return registre


def _texte_ok(valeur) -> bool:
    return isinstance(valeur, str) and valeur.strip() != ""


EFFORTS = ("low", "medium", "high", "xhigh", "max")


def _erreurs_outils(pre: str, champ: str, valeur) -> list[str]:
    if isinstance(valeur, list) and all(_texte_ok(o) for o in valeur):
        return []
    return [f"{pre}{champ} doit être une liste de noms d'outils"]


# AFB-8 : variables que le registre peut surcharger par agent (jamais une variable nouvelle, ex. LD_PRELOAD).
ENV_SURCHARGEABLES = frozenset({"CLAUDE_CODE_PROMPT_CACHE_TTL"})


def _erreurs_cadence(pre: str, s: dict, agents: list) -> list[str]:
    """Projets et routines facultatifs d'un service (importés en pause par le bootstrap, TASK.md sous
    organisation/services/<service>/projects/)."""
    erreurs: list[str] = []
    projets, routines = s.get("projets", []), s.get("routines", [])
    if not isinstance(projets, list) or not all(isinstance(p, dict) for p in projets):
        erreurs.append(f"{pre}projets doit être une liste d'objets")
        projets = []
    if not isinstance(routines, list) or not all(isinstance(r, dict) for r in routines):
        erreurs.append(f"{pre}routines doit être une liste d'objets")
        routines = []
    vus = set()
    for p in projets:
        slug = p.get("slug")
        if not (_texte_ok(slug) and RE_SLUG.match(slug)):
            erreurs.append(f"{pre}slug de projet invalide : {slug!r}")
        elif slug in vus:
            erreurs.append(f"{pre}projet en double : {slug}")
        vus.add(slug)
        if p.get("responsable") not in agents:
            erreurs.append(f"{pre}projet {slug} : responsable « {p.get('responsable')} » absent de la liste des agents")
        if p.get("statut") not in STATUTS_PROJET:
            erreurs.append(f"{pre}projet {slug} : statut de projet invalide (parmi {STATUTS_PROJET})")
        if not (isinstance(p.get("couleur"), str) and RE_COULEUR.match(p["couleur"])):
            erreurs.append(f"{pre}projet {slug} : couleur invalide (#rrggbb)")
        if p.get("objectifs") != []:  # aucun service n'a d'objectifs (organisation_service les laisse vides)
            erreurs.append(f"{pre}projet {slug} : objectifs doit être une liste vide")
    vus = set()
    for r in routines:
        slug = r.get("slug")
        if not (_texte_ok(slug) and RE_SLUG.match(slug)):
            erreurs.append(f"{pre}slug de routine invalide : {slug!r}")
        elif slug in vus:
            erreurs.append(f"{pre}routine en double : {slug}")
        vus.add(slug)
        champs = r.get("cron").split() if isinstance(r.get("cron"), str) else []
        if len(champs) != 5:
            erreurs.append(f"{pre}routine {slug} : cron invalide (5 champs attendus) : {r.get('cron')!r}")
        # EXP-C12 : le PC de l'usine n'est allumé que vers 09:44 ; avec skip_missed, une échéance plus tôt ne part jamais.
        elif not (champs[0].isdigit() and champs[1].isdigit() and int(champs[1]) >= 10):
            erreurs.append(f"{pre}routine {slug} : heure fixe à partir de 10 h attendue, trouvé « {r['cron']} »")
        if not _texte_ok(r.get("fuseau")):
            erreurs.append(f"{pre}routine {slug} : fuseau manquant")
        if r.get("concurrence") not in CONCURRENCES:
            erreurs.append(f"{pre}routine {slug} : concurrence invalide (parmi {CONCURRENCES})")
        if r.get("rattrapage") not in RATTRAPAGES:
            erreurs.append(f"{pre}routine {slug} : rattrapage invalide (parmi {RATTRAPAGES})")
    return erreurs


def valider(registre) -> list[str]:
    """Renvoie la liste des erreurs (vide si le registre est valide)."""
    erreurs: list[str] = []
    if not isinstance(registre, dict):
        return ["le registre doit être un objet JSON"]
    services = registre.get("services")
    flux = registre.get("flux")
    if not isinstance(services, list) or not services:
        erreurs.append("« services » doit être une liste non vide")
        services = []
    if not isinstance(flux, list):
        erreurs.append("« flux » doit être une liste")
        flux = []

    slugs: dict[str, dict] = {}
    prefixes: dict[str, str] = {}
    for i, s in enumerate(services):
        if not isinstance(s, dict):
            erreurs.append(f"service #{i} : doit être un objet")
            continue
        nom = s.get("slug") if _texte_ok(s.get("slug")) else f"#{i}"
        pre = f"service {nom} : "
        for champ in CHAMPS_TEXTE:
            if not _texte_ok(s.get(champ)):
                erreurs.append(f"{pre}champ obligatoire manquant ou vide : {champ}")
        if not isinstance(s.get("actif"), bool):
            erreurs.append(f"{pre}champ obligatoire manquant ou non booléen : actif")
        for champ in CHAMPS_LISTES:
            valeur = s.get(champ)
            if not isinstance(valeur, list):
                erreurs.append(f"{pre}champ obligatoire manquant ou non liste : {champ}")
            elif champ != "agents" and not valeur:
                erreurs.append(f"{pre}la liste « {champ} » est vide")
            elif not all(_texte_ok(v) for v in valeur):
                erreurs.append(f"{pre}« {champ} » ne doit contenir que des textes non vides")
        for attribut in ("sensible", "public", "interne"):  # interne (DOC-A2) : hors de « tous », installé seulement nommé
            if attribut in s and not isinstance(s[attribut], bool):
                erreurs.append(f"{pre}« {attribut} » doit être un booléen")
        if "coordinateurGeneral" in s:
            general = s["coordinateurGeneral"]
            if s.get("slug") != SERVICE_DIRECTION:
                erreurs.append(f"{pre}seul le service {SERVICE_DIRECTION} porte le coordinateur général")
            if not _texte_ok(general):
                erreurs.append(f"{pre}« coordinateurGeneral » doit être un texte non vide")
            elif general == s.get("coordinateur"):
                erreurs.append(f"{pre}le coordinateur général doit être distinct du coordinateur du service")
            elif isinstance(s.get("agents"), list) and general not in s["agents"]:
                erreurs.append(f"{pre}coordinateur général « {general} » absent de la liste des agents")

        slug = s.get("slug")
        if _texte_ok(slug):
            if not RE_SLUG.match(slug):
                erreurs.append(f"{pre}slug invalide (minuscules, chiffres et tirets) : {slug!r}")
            if slug in slugs:
                erreurs.append(f"slug en double : {slug}")
            else:
                slugs[slug] = s
        prefixe = s.get("prefixe")
        if _texte_ok(prefixe):
            if not RE_PREFIXE.match(prefixe):
                erreurs.append(f"{pre}préfixe invalide (3 ou 4 lettres majuscules) : {prefixe!r}")
            if prefixe in PREFIXES_RESERVES:
                erreurs.append(f"{pre}préfixe déjà utilisé par une entreprise existante : {prefixe}")
            if prefixe in prefixes:
                erreurs.append(f"préfixe en double : {prefixe} ({prefixes[prefixe]} et {nom})")
            else:
                prefixes[prefixe] = nom

        agents = s.get("agents")
        if isinstance(agents, list) and all(_texte_ok(a) for a in agents):
            if s.get("agentsRefErreur"):
                erreurs.append(f"{pre}registre d'agents référencé illisible : {s['agentsRefErreur']}")
            if len(set(agents)) != len(agents):
                erreurs.append(f"{pre}agents en double")
            if not s.get("agentsRef") and not 2 <= len(agents) <= 13:
                erreurs.append(f"{pre}2 à 13 agents attendus, {len(agents)} trouvé(s)")
            coord = s.get("coordinateur")
            if _texte_ok(coord) and coord not in agents:
                erreurs.append(f"{pre}coordinateur « {coord} » absent de la liste des agents")
            # Agents déterministes (adaptateur process, aucun modèle) : jamais un coordinateur.
            deterministes = s.get("deterministes", [])
            if not isinstance(deterministes, list) or not all(_texte_ok(d) for d in deterministes):
                erreurs.append(f"{pre}deterministes doit être une liste de slugs")
            else:
                for d in deterministes:
                    if d not in agents:
                        erreurs.append(f"{pre}agent « {d} » déterministe absent de la liste des agents")
                    if d in (coord, s.get("coordinateurGeneral")):
                        erreurs.append(f"{pre}« {d} » : un coordinateur ne peut pas être déterministe")
            # Réglages : outils retirés à tout le service ou à un agent, modèle propre à un agent (jamais un programme).
            erreurs += _erreurs_outils(pre, "outilsInterdits", s.get("outilsInterdits", []))
            reglages = s.get("reglages", {})
            if not isinstance(reglages, dict):
                erreurs.append(f"{pre}reglages doit être un objet {{agent: réglage}}")
                reglages = {}
            for slug, r in reglages.items():
                if slug not in agents or not isinstance(r, dict):
                    erreurs.append(f"{pre}réglage pour un agent absent de la liste des agents : « {slug} »")
                    continue
                if isinstance(deterministes, list) and slug in deterministes:
                    erreurs.append(f"{pre}« {slug} » : agent déterministe sans réglage (aucun modèle, aucun outil)")
                m = r.get("modele")
                if m is not None and not (isinstance(m, dict) and str(m.get("id", "")).startswith("claude-")
                                          and m.get("effort") in EFFORTS):
                    erreurs.append(f"{pre}« {slug} » : modèle invalide (id claude-…, effort parmi {EFFORTS})")
                erreurs += _erreurs_outils(f"{pre}« {slug} » : ", "outilsInterdits", r.get("outilsInterdits", []))
                env = r.get("envPortable")
                if env is not None and not (isinstance(env, dict) and all(
                        k in ENV_SURCHARGEABLES and isinstance(v, str) for k, v in env.items())):
                    erreurs.append(f"{pre}« {slug} » : envPortable doit surcharger, en texte, une variable parmi {sorted(ENV_SURCHARGEABLES)}")
                n = r.get("sessionsParRotation")
                if n is not None and not (type(n) is int and 1 <= n <= 50):
                    erreurs.append(f"{pre}« {slug} » : sessionsParRotation doit être un entier de 1 à 50")

            erreurs += _erreurs_cadence(pre, s, agents)

    if not any(isinstance(s, dict) and _texte_ok(s.get("coordinateurGeneral")) for s in services):
        erreurs.append(f"aucun coordinateur général : le service {SERVICE_DIRECTION} doit porter « coordinateurGeneral »")

    vus = set()
    for i, x in enumerate(flux):
        if not isinstance(x, dict):
            erreurs.append(f"flux #{i} : doit être un objet")
            continue
        pre = f"flux #{i} ({x.get('source')} -> {x.get('cible')}) : "
        for champ in CHAMPS_FLUX:
            if not _texte_ok(x.get(champ)):
                erreurs.append(f"{pre}champ obligatoire manquant ou vide : {champ}")
        if not isinstance(x.get("approbationHumaine"), bool):
            erreurs.append(f"{pre}champ obligatoire manquant ou non booléen : approbationHumaine")
        source, cible = x.get("source"), x.get("cible")
        for role, valeur in (("source", source), ("cible", cible)):
            if _texte_ok(valeur) and valeur not in slugs:
                erreurs.append(f"{pre}service inconnu en {role} : {valeur}")
        if _texte_ok(source) and source == cible:
            erreurs.append(f"{pre}un service ne peut pas échanger avec lui-même")
        if x.get("approbationHumaine") is False:
            for valeur in (source, cible):
                for attribut in ("sensible", "public"):
                    if valeur in slugs and slugs[valeur].get(attribut) is True:
                        erreurs.append(f"{pre}le service {attribut} « {valeur} » impose l'approbation humaine")
        # Une seule déclaration par paire source → cible, comme l'exige la route services.declarer du plugin
        # (plusieurs objets se regroupent dans le champ « objet », séparés par « ; »).
        cle = (source, cible)
        if cle in vus:
            erreurs.append(f"{pre}flux en double (paire {source} → {cible} déjà déclarée)")
        vus.add(cle)
    return erreurs


def flux_coordinateurs(registre: dict) -> list[dict]:
    """Flux du réseau des coordinateurs, générés (jamais listés à la main) : une entrée par paire ordonnée entre la
    Direction (coordinateur général, seul interlocuteur de l'humain, rôle ceo de l'entreprise Direction : c'est lui qui
    reçoit les demandes adressées à la Direction) et un autre service, que la matrice métier ne couvre pas. Approbation
    humaine dès qu'un des deux services est sensible ou public. Ordre stable."""
    services = [s for s in registre["services"]]
    approbation = {s["slug"] for s in services if s.get("sensible") is True or s.get("public") is True}
    metier = {(f["source"], f["cible"]) for f in registre["flux"]}
    generes = []
    for a in services:
        for b in services:
            source, cible = a["slug"], b["slug"]
            if source == cible or SERVICE_DIRECTION not in (source, cible) or (source, cible) in metier:
                continue
            generes.append({
                "source": source, "cible": cible, "objet": OBJET_COORDINATEUR_GENERAL,
                "approbationHumaine": source in approbation or cible in approbation, "origine": "coordinateur-general",
            })
    return generes


def origine_plugin(flux: dict) -> str:
    """Origine telle que la porte la table flux_services du plugin : « metier » ou « coordinateurs ». Les deux familles
    générées par flux_coordinateurs (« coordinateurs » et « coordinateur-general ») sont le réseau des coordinateurs."""
    return "metier" if flux.get("origine", "metier") == "metier" else "coordinateurs"


def flux_complets(registre: dict) -> list[dict]:
    """Matrice déclarée au plugin : flux métier du registre (origine « metier »), puis réseau des coordinateurs."""
    return [{**f, "origine": "metier"} for f in registre["flux"]] + flux_coordinateurs(registre)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Registre des services de l'Atelier")
    sous = p.add_subparsers(dest="commande", required=True)
    v = sous.add_parser("verifier", help="valide le registre des services")
    v.add_argument("--fichier", default=str(FICHIER_PAR_DEFAUT), help="registre à contrôler")
    args = p.parse_args(argv)
    try:
        registre = charger_services(args.fichier)
    except (OSError, ValueError) as exc:
        print(f"ÉCHEC lecture de {args.fichier} : {type(exc).__name__} : {exc}")
        return 1
    erreurs = valider(registre)
    for e in erreurs:
        print(f"ÉCHEC {e}")
    if erreurs:
        print(f"Registre des services invalide : {len(erreurs)} erreur(s).")
        return 1
    print(f"OK   registre des services valide : {len(registre['services'])} service(s), {len(registre['flux'])} flux métier, "
          f"{len(flux_coordinateurs(registre))} flux générés entre coordinateurs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
