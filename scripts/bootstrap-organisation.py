#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bootstrap de l'organisation de démonstration « Rénovation Liège (démonstration) ».

À lancer avec « python3 -I » (mode isolé : aucun module local ni variable PYTHON*).
Bibliothèque standard, plus PyYAML (paquet Ubuntu python3-yaml) pour la seule sous-commande
« exporter », qui doit relire le YAML produit par Paperclip. Aucun appel de modèle : le script ne parle qu'à
l'API locale de Paperclip et n'agit que sur l'entreprise portant le nom et le
marqueur déclarés dans organisation/registre/organisation.json.

Sous-commandes :
  generer [--verifier]   produit .paperclip.yaml, les en-têtes de COMPANY.md et des
                         AGENTS.md, et company-package.lock.json à partir du registre ;
                         --verifier n'écrit rien et échoue s'il y a un écart.
  appliquer              import natif idempotent (création, puis mise à jour en place),
                         liaison locale des agents, objectifs, liens projets-objectifs,
                         gabarits de politiques résolus. Deuxième lancement sans
                         changement : aucune écriture.
  etat                   affiche ce qui existe pour l'organisation de démonstration.
  nouveau-client --fiche F [--reel] [--a-blanc]
                         crée l'entreprise d'un NOUVEAU client à partir d'une fiche (.yaml ou .json ; modèle :
                         organisation/modeles/fiche-client.exemple.json) : entreprise marquée
                         « atelier-client:<slug> », organisation des agents (mêmes étapes que « appliquer »),
                         budget IA mensuel, référentiel de marque. Idempotent (entreprise retrouvée par
                         marqueur) ; --a-blanc liste les écritures sans rien écrire ; démonstration par
                         défaut, mode réel seulement avec --reel ; refus si l'entreprise appartient à la démonstration.
  assurer-connexions     étape légère et idempotente : réserve aux rôles déclarés chaque connexion de la
                         passerelle créée depuis le dernier « appliquer » (accès natif, installations,
                         politiques « block » des rôles en lecture). Lancée toutes les minutes par le
                         « Gardien des connexions » (agent natif sans modèle créé par « appliquer »).
  exporter [--sortie DIR] [--entreprise UUID]
                         export natif, nettoyage des valeurs propres à la machine, contrôle, puis aperçu
                         d'import du paquet exporté, et manifeste « manifeste-export.json » (entreprise, date,
                         empreinte SHA-256 de chaque fichier). Sans --entreprise : l'organisation de
                         démonstration (--sortie obligatoire). Avec --entreprise : cette entreprise ; sans
                         --sortie, l'export va dans instance/exports/<UUID>/<horodatage>/ ; les données du
                         plugin (route donnees.exporter, colonnes chiffrées laissées chiffrées) y sont écrites
                         table par table dans donnees-plugin/<table>.json, avec leurs empreintes au manifeste.
  purger --entreprise UUID [--confirmer] [--a-blanc] [--export DIR] [--hors-marqueur --nom-confirme NOM]
                         fin de contrat / droit à l'effacement : supprime TOUTES les données d'un client, après
                         un export de moins de 24 h (manifeste vérifié, données du plugin présentes et de même
                         nombre de lignes que les comptes actuels). Refus sans --confirmer, pour l'entreprise
                         de démonstration, sans export récent et complet, ou si aucun registre local
                         (instance/atelier-client/<slug>/entreprise.json) ne la désigne (sauf --hors-marqueur et --nom-confirme avec le nom exact). Étapes journalisées : données du
                         plugin (toutes les tables, connaissances comprises), entreprise côté socle, fichiers
                         Paperclip et espaces locaux. --a-blanc liste tout avec les comptes par table. Rapport
                         JSON horodaté à côté de l'export. Les sauvegardes existantes ne sont PAS modifiées.
  reinitialiser --confirmer "<nom exact>"
                         supprime l'entreprise de démonstration, ses dossiers locaux et les
                         fichiers que Paperclip a rangés pour elle sous
                         <PAPERCLIP_HOME>/instances/<instance>/companies/<id>/.
  jeton --confirmer      lit un jeton sur l'entrée standard (jamais en argument), le
                         range comme secret Paperclip natif et le lie aux agents.
  cles [--confirmer] [--entreprise ID] [--rotation|--basculer passerelle|approbation | --retirer-anciennes]
                         clés de l'opérateur en un geste : génère les paires Ed25519 du plugin (preuves
                         d'approbation) et de la passerelle (signature des réponses) si elles manquent,
                         range la clé privée du plugin comme secret natif, renseigne la configuration du
                         plugin et celle de la passerelle (fichiers 0600 sous instance/). Idempotente ;
                         rotation en trois temps. Sans --confirmer : état, rien n'est écrit. Jamais de
                         clé privée affichée ni journalisée.
  test-reel [--agent SLUG] [--confirmer]
                         test réel minimal de claude_local (sonde « hello » native) ;
                         à blanc sans --confirmer.

Limite connue : l'API masque les valeurs « plain » des variables d'un agent (***REDACTED***). Une valeur
changée dans l'interface (par exemple CLAUDE_CONFIG_DIR) n'est ni détectée ni corrigée par « appliquer » ;
l'empreinte de liaison décrit la liaison voulue par le registre, pas la valeur réelle. Détection manuelle :
GET /agents/<id>/config-revisions (docs/exploitation.md, section 8).

Verrou : « appliquer », « reinitialiser » et « purger » prennent un verrou de fichier exclusif
(instance/.bootstrap-ecriture.lock) ; un second lancement simultané est refusé.

Variables : ATELIER_API (défaut http://127.0.0.1:<PORT>/api, PORT lu dans
config/atelier.env, sinon 3100) ; PAPERCLIP_HOME et PAPERCLIP_INSTANCE_ID (défaut : valeurs de
config/atelier.env) pour retrouver les fichiers Paperclip d'une entreprise ;
ATELIER_DONNEES_LOCALES (défaut : dossier instance/ du dépôt).
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import fcntl
import getpass
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ORGA = RACINE / "organisation"
REGISTRE_AGENTS = ORGA / "registre" / "agents.json"
REGISTRE_ORGA = ORGA / "registre" / "organisation.json"
# Consignes communes à tous les rôles claude_local (hors paquet), recopiées par
# « generer » à la fin de chaque AGENTS.md après ce marqueur : tout ce qui suit le
# marqueur est régénéré, le texte propre au rôle reste au-dessus.
CONSIGNES_COMMUNES = ORGA / "registre" / "consignes-communes.md"
MARQUEUR_CONSIGNES_COMMUNES = (
    "<!-- Consignes communes : générées depuis organisation/registre/consignes-communes.md "
    "par scripts/bootstrap-organisation.py generer ; ne pas modifier sous cette ligne. -->"
)
# Fiche des corps de requête des routes ouvertes aux agents, GÉNÉRÉE par
# plugin-atelier/scripts/fiche-routes-agents.ts. « generer » en recopie, à la fin de l'AGENTS.md de
# chaque agent, seulement les sections des routes que son texte ou ses compétences citent.
FICHE_ROUTES_AGENTS = ORGA / "registre" / "routes-agents.md"
TITRE_FICHE_ROUTES = "## Corps des requêtes de tes routes (fiche routes-agents)"
DOSSIER_POLITIQUES = ORGA / "politiques"
# Dossier des données locales du bootstrap (espaces d'agents, configurations Claude dédiées,
# état, verrou). ATELIER_DONNEES_LOCALES permet d'isoler une instance d'essai : sans elle,
# c'est le dossier « instance » du dépôt.
INSTANCE = Path(os.environ.get("ATELIER_DONNEES_LOCALES") or (RACINE / "instance")).resolve()
FICHIER_VERROU_EXECUTION = INSTANCE / ".bootstrap-ecriture.lock"
ETAT_LOCAL = INSTANCE / "atelier-demo"
ESPACES = INSTANCE / "agents-atelier"
CONFIGS_CLAUDE = INSTANCE / "claude-config"
FICHIER_VERROU = "company-package.lock.json"
PLUGIN = RACINE / "plugin-atelier"
# Contrat du lot A (docs/contrats.md §8) : agents de démonstration « process » lancés avec
# cwd = dossier du plugin et un chemin RELATIF vers le script déterministe.
SCRIPT_DEMO = "demo/agent-demo.mjs"
MODES = ("reel", "demonstration")
# « Gardien des connexions » : agent natif SANS modèle (adaptateur process) créé par « appliquer »,
# hors paquet. Son battement natif (heartbeat à intervalle) lance « assurer-connexions » : une
# connexion créée par une carte après le bootstrap est réservée aux rôles prévus sans intervention.
GARDIEN_NOM = "Gardien des connexions"
GARDIEN_SLUG = "gardien-des-connexions"
GARDIEN_INTERVALLE_SEC = 60

# Fichiers du paquet AgentCompanies envoyés à Paperclip. Tout le reste
# d'organisation/ (registre, politiques, corpus de démonstration, README) reste
# hors du paquet.
RACINES_PAQUET = ("COMPANY.md", ".paperclip.yaml", "agents", "skills", "projects")

SCHEMA_VERSION_PAQUET = 7
CLE_SECRET_JETON = "claude-code-oauth-token"
VARIABLE_JETON = "CLAUDE_CODE_OAUTH_TOKEN"


class ErreurAtelier(Exception):
    pass


# ---------------------------------------------------------------------------
# Lecture du registre
# ---------------------------------------------------------------------------

def lire_json(chemin: Path):
    with chemin.open(encoding="utf-8") as f:
        return json.load(f)


def registres():
    return lire_json(REGISTRE_AGENTS), lire_json(REGISTRE_ORGA)


# ---------------------------------------------------------------------------
# YAML dans le dialecte restreint que lit Paperclip
# (server/src/services/company-portability.ts, parseYamlBlock) : indentation de
# deux espaces, chaînes en JSON entre guillemets doubles, pas de bloc « > »,
# listes en « - ». C'est aussi du YAML valide pour un parseur standard.
# ---------------------------------------------------------------------------

def _scalaire(valeur) -> str:
    if valeur is None:
        return "null"
    if isinstance(valeur, bool):
        return "true" if valeur else "false"
    if isinstance(valeur, (int, float)):
        return json.dumps(valeur)
    if isinstance(valeur, str):
        return json.dumps(valeur, ensure_ascii=False)
    raise ErreurAtelier(f"valeur YAML non prise en charge : {valeur!r}")


def yaml_lignes(objet, indent: int = 0) -> list[str]:
    pad = " " * indent
    lignes: list[str] = []
    if isinstance(objet, dict):
        for cle, valeur in objet.items():
            if not re.fullmatch(r"[A-Za-z0-9_.\-]+", str(cle)):
                raise ErreurAtelier(f"clé YAML non portable : {cle!r}")
            if isinstance(valeur, dict) and valeur:
                lignes.append(f"{pad}{cle}:")
                lignes.extend(yaml_lignes(valeur, indent + 2))
            elif isinstance(valeur, list) and valeur:
                lignes.append(f"{pad}{cle}:")
                lignes.extend(yaml_lignes(valeur, indent + 2))
            elif isinstance(valeur, dict):
                lignes.append(f"{pad}{cle}: {{}}")
            elif isinstance(valeur, list):
                lignes.append(f"{pad}{cle}: []")
            else:
                lignes.append(f"{pad}{cle}: {_scalaire(valeur)}")
    elif isinstance(objet, list):
        for element in objet:
            if isinstance(element, (dict, list)):
                lignes.append(f"{pad}-")
                lignes.extend(yaml_lignes(element, indent + 2))
            else:
                lignes.append(f"{pad}- {_scalaire(element)}")
    else:
        lignes.append(f"{pad}{_scalaire(objet)}")
    return lignes


def yaml_texte(objet) -> str:
    return "\n".join(yaml_lignes(objet)) + "\n"


def separer_frontmatter(texte: str) -> tuple[str | None, str]:
    texte = texte.replace("\r\n", "\n")
    if not texte.startswith("---\n"):
        return None, texte
    fin = texte.find("\n---\n", 4)
    if fin < 0:
        return None, texte
    return texte[4:fin], texte[fin + 5:]


def avec_frontmatter(entete: dict, corps: str) -> str:
    return "---\n" + yaml_texte(entete) + "---\n\n" + corps.lstrip("\n")


# ---------------------------------------------------------------------------
# Génération (registre -> paquet natif)
# ---------------------------------------------------------------------------

# Outils de lecture sans chemin : inutiles dans --allowedTools (lecture du cwd déjà permise) et
# dangereux (tous les chemins autorisés).
OUTILS_LECTURE_NUS = ("Read", "Grep", "Glob")


def arguments_outils(agent: dict, adaptateur: dict) -> list[str]:
    outils = agent["outils"]
    # Sécurité (revue du 16/10/2026) : en mode dontAsk, une règle SANS chemin autorise tous les
    # chemins (lire ~/.ssh, écrire ~/.zshrc). Read, Grep et Glob nus sont donc retirés (la lecture
    # dans le cwd reste permise sans règle) ; Write et Edit sont bornés au répertoire de travail.
    autorises = []
    for outil in outils["recherche"] + outils["mutation"]:
        if outil in OUTILS_LECTURE_NUS:
            continue
        # Mesuré le 16/10/2026 (claude -p, Claude Code 2.1.292) : « Write(./**) » n'autorise rien ;
        # c'est « Edit(./**) » qui couvre Write et Edit (les règles Edit visent tous les outils qui
        # modifient des fichiers), y compris quand « Edit » seul reste dans --disallowedTools.
        regle = "Edit(./**)" if outil in ("Write", "Edit") else outil
        if regle not in autorises:
            autorises.append(regle)
    # Une valeur par argument (forme de la documentation Claude Code :
    # --allowedTools "Bash(git log *)" "Read"). Le prompt arrive par l'entrée
    # standard (execute.ts : stdin), donc les options variadiques ne l'absorbent pas.
    return (
        ["--permission-mode", adaptateur["permissionMode"], "--allowedTools"]
        + autorises
        + ["--disallowedTools"]
        + outils["interdits"]
    )


def config_adaptateur(agent: dict, adaptateur: dict) -> dict:
    env = {cle: {"type": "plain", "value": val} for cle, val in adaptateur["envPortable"].items()}
    return {
        "engine": adaptateur["engine"],
        "model": agent["modele"]["id"],
        "effort": agent["modele"]["effort"],
        "dangerouslySkipPermissions": adaptateur["dangerouslySkipPermissions"],
        "maxTurnsPerRun": agent["maxToursParExecution"],
        "timeoutSec": adaptateur["timeoutSec"],
        "graceSec": adaptateur["graceSec"],
        "extraArgs": arguments_outils(agent, adaptateur),
        "env": env,
    }


def metadata_atelier(agent: dict, reg_agents: dict) -> dict:
    return {
        "atelier": {
            "registre": reg_agents["schema"],
            "versionRegistre": reg_agents["version"],
            "titre": agent["titre"],
            "entrees": agent["entrees"],
            "sorties": agent["sorties"],
            "competencesObligatoires": agent["competencesObligatoires"],
            "outilsRecherche": agent["outils"]["recherche"],
            "outilsMutation": agent["outils"]["mutation"],
            "outilsInterdits": agent["outils"]["interdits"],
            "relit": agent["relit"],
            "roleRevue": agent["roleRevue"],
            "connexions": agent.get("connexions") or {},
            **({"outilsBloques": agent["outilsBloques"]} if agent.get("outilsBloques") else {}),
            "criteresReussite": agent["criteresReussite"],
        }
    }


def config_deterministe(agent: dict) -> dict:
    """Agent déterministe (Porte de contrôle) : adaptateur natif process, aucun modèle.
    Chemin RELATIF du script ; le cwd (dossier du plugin) est posé par la liaison locale."""
    return {"command": "node", "args": [SCRIPT_DEMO, agent["slug"]], "timeoutSec": 300}


def construire_extension(reg_agents: dict, reg_orga: dict) -> dict:
    adaptateur = reg_agents["adaptateur"]
    agents = {}
    for agent in reg_agents["agents"]:
        if agent.get("deterministe"):
            agents[agent["slug"]] = {
                "role": agent["role"],
                "capabilities": agent["mission"],
                "adapter": {"type": "process", "config": config_deterministe(agent)},
                "runtime": {"heartbeat": {"maxConcurrentRuns": adaptateur["maxConcurrentRuns"]}},
                "budgetMonthlyCents": agent["budgetMensuelCentimes"],
                "metadata": metadata_atelier(agent, reg_agents),
                "inputs": {"env": {}},
            }
            continue
        inputs = {}
        for cle, description in adaptateur["envSecrets"].items():
            inputs[cle] = {"kind": "secret", "requirement": "optional", "description": description}
        for cle, description in adaptateur["envLocal"].items():
            inputs[cle] = {
                "kind": "plain",
                "requirement": "optional",
                "portability": "system_dependent",
                "description": description,
            }
        agents[agent["slug"]] = {
            "role": agent["role"],
            "capabilities": agent["mission"],
            "adapter": {"type": adaptateur["type"], "config": config_adaptateur(agent, adaptateur)},
            "runtime": {"heartbeat": {"maxConcurrentRuns": adaptateur["maxConcurrentRuns"]}},
            "budgetMonthlyCents": agent["budgetMensuelCentimes"],
            "metadata": metadata_atelier(agent, reg_agents),
            "inputs": {"env": inputs},
        }
    projets = {}
    for projet in reg_orga["projets"]:
        projets[projet["slug"]] = {
            "leadAgentSlug": projet["responsable"],
            "status": projet["statut"],
            "color": projet["couleur"],
            "metadata": {"atelier": {"objectifs": projet["objectifs"]}},
        }
    routines = {}
    for routine in reg_orga["routines"]:
        routines[routine["slug"]] = {
            "concurrencyPolicy": routine["concurrence"],
            "catchUpPolicy": routine["rattrapage"],
            "triggers": [
                {"kind": "schedule", "cronExpression": routine["cron"], "timezone": routine["fuseau"]}
            ],
        }
    return {
        "schema": "paperclip/v1",
        # Version de paquet lue par le socle épinglé (BUNDLE_SCHEMA_VERSION = 7 dans
        # server/src/services/company-portability.ts) ; contrôlée par le vérificateur.
        "schemaVersion": SCHEMA_VERSION_PAQUET,
        "company": {"requireBoardApprovalForNewAgents": reg_orga["entreprise"]["approbationHumainePourNouveauxAgents"]},
        "agents": agents,
        "projects": projets,
        "routines": routines,
    }


def empreinte_dossier(dossier: Path) -> str:
    h = hashlib.sha256()
    for chemin in sorted(p for p in dossier.rglob("*") if p.is_file()):
        rel = chemin.relative_to(dossier).as_posix()
        h.update(rel.encode("utf-8") + b"\0")
        h.update(chemin.read_bytes() + b"\0")
    return h.hexdigest()


def construire_verrou() -> dict:
    competences = {}
    for dossier in sorted(p for p in (ORGA / "skills").iterdir() if p.is_dir()):
        fm, _ = separer_frontmatter((dossier / "SKILL.md").read_text(encoding="utf-8"))
        version = None
        if fm:
            m = re.search(r'^\s+version:\s*"([^"]+)"', fm, re.M)
            version = m.group(1) if m else None
        competences[dossier.name] = {
            "version": version,
            "sha256": empreinte_dossier(dossier),
            "fichiers": sorted(p.relative_to(dossier).as_posix() for p in dossier.rglob("*") if p.is_file()),
        }
    return {
        "schema": "atelier/company-package-lock/v1",
        "note": "Fichier généré (spécification AgentCompanies §18, verrou facultatif). L'empreinte sha256 couvre chemins et contenus de chaque dossier de compétence ; elle sert d'identifiant de version vérifiable à l'exécution.",
        "competences": competences,
    }


def fichiers_generes(reg_agents: dict, reg_orga: dict) -> dict[Path, str]:
    sortie: dict[Path, str] = {}
    sortie[ORGA / ".paperclip.yaml"] = yaml_texte(construire_extension(reg_agents, reg_orga))

    entreprise = reg_orga["entreprise"]
    chemin = ORGA / "COMPANY.md"
    _, corps = separer_frontmatter(chemin.read_text(encoding="utf-8")) if chemin.exists() else (None, "")
    sortie[chemin] = avec_frontmatter(
        {
            "schema": "agentcompanies/v1",
            "kind": "company",
            "slug": entreprise["slug"],
            "name": entreprise["nom"],
            "description": entreprise["description"],
            "version": reg_orga["version"],
            "goals": [f"{o['cle']} · {o['titre']}" for o in reg_orga["objectifs"]],
        },
        corps,
    )

    consignes_communes = CONSIGNES_COMMUNES.read_text(encoding="utf-8").strip("\n") + "\n"
    for agent in reg_agents["agents"]:
        chemin = ORGA / "agents" / agent["slug"] / "AGENTS.md"
        if not chemin.exists():
            raise ErreurAtelier(f"instructions manquantes : {chemin.relative_to(RACINE)}")
        _, corps = separer_frontmatter(chemin.read_text(encoding="utf-8"))
        corps = corps.split(MARQUEUR_CONSIGNES_COMMUNES)[0].rstrip("\n") + "\n"
        if not agent.get("deterministe"):
            corps_role = corps
            corps += "\n" + MARQUEUR_CONSIGNES_COMMUNES + "\n\n" + consignes_communes
            fiche = fiche_routes_agent(agent, corps_role)
            if fiche:
                corps += "\n" + fiche
        sortie[chemin] = avec_frontmatter(
            {
                "kind": "agent",
                "slug": agent["slug"],
                "name": agent["nom"],
                "title": agent["titre"],
                "reportsTo": agent["rapporteA"],
                "skills": agent["competences"],
            },
            corps,
        )

    verrou = construire_verrou()
    sortie[ORGA / FICHIER_VERROU] = json.dumps(verrou, ensure_ascii=False, indent=2) + "\n"
    return sortie


def sections_fiche_routes() -> list[tuple[str, str]]:
    """Sections (chemin de la route, texte) de la fiche routes-agents, dans l'ordre du fichier."""
    if not FICHE_ROUTES_AGENTS.exists():
        raise ErreurAtelier(
            "fiche des routes d'agents absente : lancer « npx tsx scripts/fiche-routes-agents.ts » dans plugin-atelier"
        )
    sections: list[tuple[str, str]] = []
    courant: list[str] = []
    chemin = ""
    for ligne in FICHE_ROUTES_AGENTS.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^## (?:GET|POST|PATCH|DELETE) (\S+)$", ligne)
        if m:
            if courant:
                sections.append((chemin, "\n".join(courant).rstrip("\n") + "\n"))
            chemin, courant = m.group(1), [ligne]
        elif courant:
            courant.append(ligne)
    if courant:
        sections.append((chemin, "\n".join(courant).rstrip("\n") + "\n"))
    return sections


def route_citee(chemin: str, texte: str) -> bool:
    """Vrai si `texte` cite la route (`:param` du chemin écrit `<param>`, `<id>`… dans les consignes)."""
    morceaux = re.split(r":[A-Za-z]+", chemin)
    motif = "<[^>/\\s]+>".join(re.escape(m) for m in morceaux)
    return re.search(motif + r"(?![\w/<-])", texte) is not None


def fiche_routes_agent(agent: dict, corps_role: str) -> str:
    """Bloc généré (vide si l'agent n'appelle aucune route à corps) : ses routes seulement."""
    textes = [corps_role]
    for nom in agent.get("competences", []):
        fichier = ORGA / "skills" / nom / "SKILL.md"
        if fichier.exists():
            textes.append(fichier.read_text(encoding="utf-8"))
    texte = "\n".join(textes)
    # Les consignes communes décrivent le dépôt des réponses d'outils pour tout agent qui a des connexions.
    retenues = [
        s
        for chemin, s in sections_fiche_routes()
        if route_citee(chemin, texte) or (chemin == "/taches/:issueId/donnees-connexion" and agent.get("connexions"))
    ]
    if not retenues:
        return ""
    bloc = [
        TITRE_FICHE_ROUTES,
        "",
        "Corps JSON à envoyer, tirés des contrats du plugin : ne lis jamais le code source du plugin pour les deviner.",
        "",
    ]
    for s in retenues:
        bloc.append(s.replace("## ", "### ", 1).rstrip("\n"))
        bloc.append("")
    return "\n".join(bloc).rstrip("\n") + "\n"


def cmd_generer(args) -> int:
    reg_agents, reg_orga = registres()
    attendus = fichiers_generes(reg_agents, reg_orga)
    ecarts = []
    for chemin, contenu in attendus.items():
        actuel = chemin.read_text(encoding="utf-8") if chemin.exists() else None
        if actuel != contenu:
            ecarts.append(chemin)
            if not args.verifier:
                chemin.write_text(contenu, encoding="utf-8")
    if args.verifier:
        if ecarts:
            for chemin in ecarts:
                print(f"ÉCART : {chemin.relative_to(RACINE)} ne correspond pas au registre", file=sys.stderr)
            print("Lancez : python3 -I scripts/bootstrap-organisation.py generer", file=sys.stderr)
            return 1
        print(f"Fichiers générés à jour ({len(attendus)} vérifiés).")
        return 0
    print(f"{len(ecarts)} fichier(s) réécrit(s) sur {len(attendus)}.")
    for chemin in ecarts:
        print(f"  {chemin.relative_to(RACINE)}")
    return 0


# ---------------------------------------------------------------------------
# Paquet envoyé à Paperclip
# ---------------------------------------------------------------------------

def fichiers_paquet() -> dict[str, str]:
    fichiers: dict[str, str] = {}
    for racine in RACINES_PAQUET:
        chemin = ORGA / racine
        if chemin.is_file():
            fichiers[racine] = chemin.read_text(encoding="utf-8")
        elif chemin.is_dir():
            for f in sorted(p for p in chemin.rglob("*") if p.is_file()):
                fichiers[f.relative_to(ORGA).as_posix()] = f.read_text(encoding="utf-8")
    return fichiers


def empreinte_paquet(fichiers: dict[str, str]) -> str:
    h = hashlib.sha256()
    for chemin in sorted(fichiers):
        h.update(chemin.encode("utf-8") + b"\0" + fichiers[chemin].encode("utf-8") + b"\0")
    # La liaison locale fait partie de l'état voulu : un changement de schéma de
    # liaison doit relancer l'application.
    h.update(b"liaison-locale:v1")
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Verrou d'écriture et chemins Paperclip
# ---------------------------------------------------------------------------

@contextlib.contextmanager
def verrou_ecriture(operation: str):
    """Verrou de fichier exclusif (flock) : deux « appliquer » simultanés se marcheraient dessus
    (doubles imports, états locaux croisés). Le verrou est rendu par le système à la fin du
    processus, même en cas de plantage : aucun fichier obsolète ne peut bloquer."""
    FICHIER_VERROU_EXECUTION.parent.mkdir(parents=True, exist_ok=True)
    with open(FICHIER_VERROU_EXECUTION, "a+", encoding="utf-8") as f:
        debut = time.monotonic()
        while True:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                pass
            f.seek(0)
            detenteur = f.read().strip() or "inconnu"
            # Le Gardien des connexions tient le verrou une seconde par minute : une écriture
            # lancée par un humain l'attend (30 s au plus) au lieu d'être refusée.
            if detenteur.startswith("assurer-connexions") and operation != "assurer-connexions" and time.monotonic() - debut < 30:
                time.sleep(0.5)
                continue
            raise ErreurAtelier(
                f"« {operation} » refusé : une autre écriture du bootstrap est déjà en cours "
                f"(verrou {FICHIER_VERROU_EXECUTION}, détenteur : {detenteur}). "
                "Attendez la fin de l'autre commande puis relancez ; rien n'a été modifié."
            ) from None
        f.seek(0)
        f.truncate()
        f.write(f"{operation} pid={os.getpid()}\n")
        f.flush()
        try:
            yield
        finally:
            f.seek(0)
            f.truncate()
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def _valeur_env_atelier(nom: str) -> str | None:
    """Variable d'environnement, sinon valeur de config/atelier.env (même source que le serveur)."""
    if os.environ.get(nom, "").strip():
        return os.environ[nom].strip()
    env = RACINE / "config" / "atelier.env"
    if env.exists():
        m = re.search(rf"^{nom}=(.*?)\s*$", env.read_text(encoding="utf-8"), re.M)
        if m:
            return m.group(1).strip().strip("'\"")
    return None


def dossier_fichiers_entreprise(company_id: str) -> Path | None:
    """<PAPERCLIP_HOME>/instances/<instance>/companies/<id>, comme
    resolveManagedInstructionsRoot (paperclip/server/src/services/agent-instructions.ts:136)
    et resolvePaperclipInstanceRoot (paperclip/packages/shared/src/home-paths.ts:32).
    Renvoie None si l'identifiant n'est pas un UUID (aucun chemin n'est alors construit)."""
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", company_id or ""):
        return None
    home = _valeur_env_atelier("PAPERCLIP_HOME")
    instance_id = _valeur_env_atelier("PAPERCLIP_INSTANCE_ID") or "default"
    if not home or not re.fullmatch(r"[a-zA-Z0-9_-]+", instance_id):
        return None
    return Path(os.path.expanduser(home)).resolve() / "instances" / instance_id / "companies" / company_id


def supprimer_fichiers_entreprise(company_id: str) -> str:
    """Supprime les fichiers Paperclip d'UNE entreprise, après contrôle strict du chemin :
    UUID valide, parent exactement « companies », dossier réel (ni lien symbolique ni fichier)."""
    cible = dossier_fichiers_entreprise(company_id)
    if cible is None:
        return "ignoré (identifiant d'entreprise ou réglages d'instance invalides)"
    if not cible.exists() and not cible.is_symlink():
        return f"aucun fichier à supprimer ({cible})"
    if cible.is_symlink() or not cible.is_dir():
        raise ErreurAtelier(f"{cible} n'est pas un dossier ordinaire : suppression refusée.")
    if cible.name != company_id or cible.parent.name != "companies" or cible.parent.parent.parent.name != "instances":
        raise ErreurAtelier(f"chemin inattendu {cible} : suppression refusée.")
    shutil.rmtree(cible)
    return f"fichiers Paperclip supprimés : {cible}"


# API Paperclip
# ---------------------------------------------------------------------------

def url_api() -> str:
    if os.environ.get("ATELIER_API"):
        return os.environ["ATELIER_API"].rstrip("/")
    port = "3100"
    env = RACINE / "config" / "atelier.env"
    if env.exists():
        m = re.search(r"^PORT=(\d+)\s*$", env.read_text(encoding="utf-8"), re.M)
        if m:
            port = m.group(1)
    return f"http://127.0.0.1:{port}/api"


def ajouter_cle_tableau(req):
    """Mode authentifié (accès à distance) : ajoute la clé d'API du tableau (PAPERCLIP_BOARD_KEY), facultative.

    La clé n'est envoyée que vers http://127.0.0.1:<port>, http://localhost:<port> ou https://<nom>.ts.net ;
    ailleurs, rien n'est envoyé (avertissement sans la clé). L'en-tête est « non redirigeable » : il n'est
    jamais recopié lors d'une redirection. (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    cle = os.environ.get("PAPERCLIP_BOARD_KEY")
    if not cle:
        return
    u = urllib.parse.urlsplit(req.full_url)
    h = (u.hostname or "").lower()
    if u.scheme == "http" and h in ("127.0.0.1", "localhost") and u.port is not None:
        autorise = True
    else:
        autorise = u.scheme == "https" and h.endswith(".ts.net") and len(h) > len(".ts.net")
    if autorise:
        req.add_unredirected_header("Authorization", "Bearer " + cle)
    else:
        print("AVERTISSEMENT : PAPERCLIP_BOARD_KEY non envoyée (destination hors 127.0.0.1, localhost et *.ts.net : "
              + (u.hostname or "?") + ").", file=sys.stderr)


class Api:
    def __init__(self, base: str):
        self.base = base
        self.ecritures = 0

    def appel(self, methode: str, chemin: str, corps=None, attendu=(200, 201)):
        donnees = None if corps is None else json.dumps(corps).encode("utf-8")
        req = urllib.request.Request(self.base + chemin, data=donnees, method=methode)
        # Mode authentifié (accès à distance) : clé d'API du tableau, facultative et limitée aux destinations sûres.
        ajouter_cle_tableau(req)
        req.add_header("Accept", "application/json")
        if donnees is not None:
            req.add_header("Content-Type", "application/json")
        if methode != "GET":
            self.ecritures += 1
        try:
            with urllib.request.urlopen(req, timeout=300) as rep:
                brut = rep.read().decode("utf-8")
                statut = rep.status
        except urllib.error.HTTPError as e:
            brut = e.read().decode("utf-8", "replace")
            raise ErreurAtelier(f"{methode} {chemin} -> HTTP {e.code} : {brut[:800]}") from None
        except urllib.error.URLError as e:
            raise ErreurAtelier(f"API injoignable ({self.base}) : {e.reason}. L'instance est-elle lancée ?") from None
        if statut not in attendu:
            raise ErreurAtelier(f"{methode} {chemin} -> HTTP {statut} inattendu")
        return json.loads(brut) if brut else None

    def get(self, chemin):
        return self.appel("GET", chemin)


def normaliser_slug(valeur: str) -> str:
    # Copie de normalizeAgentUrlKey (packages/shared/src/agent-url-key.ts).
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", valeur.strip().lower()))


def porte_marqueur(description, marqueur: str) -> bool:
    """Le marqueur figure dans la description comme MOT ENTIER (jamais comme début ou fin d'un autre :
    « atelier-client:abc » n'est pas dans « atelier-client:abc-def »). Il ne sert qu'à l'affichage et au
    rapprochement : l'identité d'un client repose sur le registre local (voir lire_registre_client)."""
    return re.search(r"(?<![A-Za-z0-9_-])" + re.escape(marqueur) + r"(?![A-Za-z0-9_-])", description or "") is not None


def trouver_entreprise(api: Api, reg_orga: dict):
    """Renvoie l'entreprise de démonstration ou None. Refuse toute ambiguïté."""
    entreprise = reg_orga["entreprise"]
    nom = unicodedata.normalize("NFC", entreprise["nom"])
    toutes = api.get("/companies")
    candidates = [c for c in toutes if unicodedata.normalize("NFC", c.get("name") or "") == nom]
    # Une entreprise marquée sous un autre nom (renommée dans l'interface, ou entreprise
    # jetable d'une sonde restée en place) rendrait le périmètre ambigu : on refuse.
    autres = [c for c in toutes if porte_marqueur(c.get("description"), entreprise["marqueur"]) and c not in candidates]
    if autres:
        liste = ", ".join(f"« {c.get('name')} » ({c['id']})" for c in autres)
        raise ErreurAtelier(
            f"entreprise(s) portant le marqueur {entreprise['marqueur']} sous un autre nom : {liste}. "
            "Renommez-la ou supprimez-la ; rien n'est modifié."
        )
    if not candidates:
        return None
    marquees = [c for c in candidates if porte_marqueur(c.get("description"), entreprise["marqueur"])]
    if len(candidates) != len(marquees):
        raise ErreurAtelier(
            f"une entreprise nommée « {entreprise['nom']} » existe sans le marqueur "
            f"{entreprise['marqueur']} : périmètre ambigu, rien n'est modifié."
        )
    if len(marquees) > 1:
        ids = ", ".join(c["id"] for c in marquees)
        raise ErreurAtelier(f"plusieurs entreprises de démonstration trouvées ({ids}) : rien n'est modifié.")
    return marquees[0]


def utilisateur_responsable(api: Api) -> str:
    session = api.get("/auth/get-session")
    uid = ((session or {}).get("user") or {}).get("id")
    if not uid:
        raise ErreurAtelier("impossible de déterminer l'utilisateur humain responsable (session board absente)")
    return uid


# ---------------------------------------------------------------------------
# Liaison locale des agents (jamais exportée dans le paquet)
# ---------------------------------------------------------------------------

def dossiers_agent(company_id: str, slug: str) -> tuple[Path, Path]:
    """Espace de travail et configuration Claude d'un agent, propres à SON entreprise : deux entreprises
    ne partagent jamais le cwd ni le CLAUDE_CONFIG_DIR d'un même rôle (cloisonnement entre clients).
    Disposition : ESPACES/<id entreprise>/<rôle> et CONFIGS_CLAUDE/<id entreprise>/<rôle>."""
    if not RE_UUID.fullmatch(company_id or ""):
        raise ErreurAtelier(f"identifiant d'entreprise invalide pour les dossiers locaux (UUID attendu) : {company_id!r}")
    return ESPACES / company_id / slug, CONFIGS_CLAUDE / company_id / slug


# Fichiers d'authentification de la configuration Claude d'un agent : seuls recopiés de l'ancien dossier
# partagé (le reste, historique de sessions et projets, mélange des entreprises). Aujourd'hui l'agent
# s'authentifie par la variable CLAUDE_CODE_OAUTH_TOKEN (secret_ref) : en pratique rien à recopier.
FICHIERS_AUTHENTIFICATION = (".credentials.json",)


def migrer_dossiers_anciens(company_id: str, slug: str) -> list[str]:
    """Migration depuis la disposition partagée (ESPACES/<rôle>, CONFIGS_CLAUDE/<rôle>), qui mélangeait
    les entreprises : l'ancien dossier n'est JAMAIS déplacé ni supprimé. On recopie seulement les fichiers
    d'authentification absents du nouveau dossier, et on renvoie les avertissements (contenu à trier)."""
    espace, config = dossiers_agent(company_id, slug)
    avertissements = []
    for racine, nouveau in ((ESPACES, espace), (CONFIGS_CLAUDE, config)):
        ancien = racine / slug
        if not ancien.is_dir() or ancien.is_symlink():
            continue
        if racine is CONFIGS_CLAUDE:
            for nom in FICHIERS_AUTHENTIFICATION:
                source, cible = ancien / nom, nouveau / nom
                if source.is_file() and not source.is_symlink() and not cible.exists():
                    shutil.copy2(source, cible)
                    os.chmod(cible, 0o600)
                    avertissements.append(f"{cible} : authentification recopiée depuis {source}")
        contenu = sorted(e.name for e in ancien.iterdir() if e.name not in (".", ".."))
        if contenu:
            avertissements.append(
                f"ancien dossier partagé laissé en place (mélange possible d'entreprises, à trier par l'opérateur) : "
                f"{ancien} ({len(contenu)} élément(s) : {', '.join(contenu[:12])}{', …' if len(contenu) > 12 else ''})"
            )
    return avertissements


def reglages_agent(reg_agents: dict, config: Path) -> dict:
    """settings.json dédié d'un agent : réglages du registre + chemins propres à la machine.

    Les refus portant sur les secrets de l'instance et de la racine du dépôt ont besoin de
    chemins absolus (forme « //chemin » des règles Claude Code) : ils sont calculés ici, au
    moment de generer/appliquer, et jamais écrits dans un fichier suivi par git. L'autorisation
    de lecture ne vise que les fichiers « tool-results » de l'agent lui-même, dans sa propre
    configuration, hors de son cwd.
    """
    reglages = json.loads(json.dumps(reg_agents["adaptateur"]["reglagesConfigClaude"]))
    permissions = reglages.setdefault("permissions", {})
    secrets = [
        f"/{INSTANCE}/instances/*/secrets/**",
        f"/{INSTANCE}/instances/*/db/**",
        f"/{INSTANCE}/cles/**",
        f"/{RACINE}/config/**",
    ]
    refus = list(permissions.get("deny", []))
    for chemin in secrets:
        refus.append(f"Read({chemin})")
    for chemin in secrets:
        refus.append(f"Edit({chemin})")
    permissions["deny"] = refus
    permissions["allow"] = [f"Read(/{config}/projects/**)"]
    return reglages


def preparer_dossiers_locaux(company_id: str, reg_agents: dict) -> int:
    """Crée l'espace et la configuration Claude dédiée de chaque agent de l'entreprise « company_id ».

    Le settings.json dédié porte « claudeMdExcludes » : sans lui, Claude Code charge les
    CLAUDE.md de tous les dossiers parents du cwd, y compris ~/.claude/CLAUDE.md
    (constaté le 15/10/2026 par capture locale de la requête, sans appel de modèle :
    scripts/bootstrap-tests.sh, test d'isolement). Renvoie le nombre de fichiers écrits.
    """
    ecrits = 0
    for agent in reg_agents["agents"]:
        if agent.get("deterministe"):
            continue  # aucun Claude : ni espace ni configuration dédiée
        espace, config = dossiers_agent(company_id, agent["slug"])
        for d in (espace.parent, espace, config.parent, config):
            d.mkdir(parents=True, exist_ok=True)
            os.chmod(d, 0o700)
        for avertissement in migrer_dossiers_anciens(company_id, agent["slug"]):
            print(f"  Attention migration : {avertissement}")
        reglages = json.dumps(reglages_agent(reg_agents, config), ensure_ascii=False, indent=2) + "\n"
        if ecrire_si_change(config / "settings.json", reglages):
            os.chmod(config / "settings.json", 0o600)
            ecrits += 1
    return ecrits


def env_voulu(company_id: str, reg_agents: dict, slug: str, jeton_id: str | None) -> dict:
    _, config = dossiers_agent(company_id, slug)
    env = {cle: {"type": "plain", "value": val} for cle, val in reg_agents["adaptateur"]["envPortable"].items()}
    env["CLAUDE_CONFIG_DIR"] = {"type": "plain", "value": str(config)}
    if jeton_id:
        env[VARIABLE_JETON] = {"type": "secret_ref", "secretId": jeton_id, "version": "latest"}
    return env


def liaison_voulue(company_id: str, reg_agents: dict, slug: str, jeton_id: str | None, mode: str) -> dict:
    """Configuration propre à la machine, jamais écrite dans le paquet.

    reel : adaptateur claude_local du paquet + cwd et CLAUDE_CONFIG_DIR dédiés (+ jeton).
    demonstration : adaptateur process du lot A (aucun modèle), cwd = dossier du plugin.
    """
    espace, _ = dossiers_agent(company_id, slug)
    agent = next((a for a in reg_agents["agents"] if a["slug"] == slug), {})
    if agent.get("deterministe"):
        # Même liaison dans les deux modes : un programme déterministe, jamais de modèle ni de jeton.
        return {"adapterType": "process", "cwd": str(PLUGIN), "config": {**config_deterministe(agent), "cwd": str(PLUGIN)}}
    if mode == "demonstration":
        return {
            "adapterType": "process",
            "cwd": str(PLUGIN),
            "config": {
                "command": "node",
                "args": [SCRIPT_DEMO, slug],
                "cwd": str(PLUGIN),
                "timeoutSec": 300,
                "env": {"ATELIER_MODE": {"type": "plain", "value": "demonstration"}},
            },
        }
    return {
        "adapterType": reg_agents["adaptateur"]["type"],
        "cwd": str(espace),
        "config": {"cwd": str(espace), "env": env_voulu(company_id, reg_agents, slug, jeton_id)},
    }


def secret_jeton(api: Api, company_id: str):
    for s in api.get(f"/companies/{company_id}/secrets"):
        if s.get("key") == CLE_SECRET_JETON:
            return s
    return None


def empreinte_liaison(liaison: dict) -> str:
    brut = json.dumps(liaison, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(brut.encode("utf-8")).hexdigest()


def liaison_conforme(agent: dict, liaison: dict) -> bool:
    """Compare la liaison locale voulue à celle de l'agent.

    L'API renvoie les valeurs « plain » masquées (***REDACTED***) : on compare donc le
    type d'adaptateur, le cwd, les clés, les types et les références de secret, plus
    l'empreinte de liaison que le bootstrap enregistre dans metadata.atelier.bootstrap.
    """
    cfg = agent.get("adapterConfig") or {}
    if agent.get("adapterType") != liaison["adapterType"] or cfg.get("cwd") != liaison["cwd"]:
        return False
    env = liaison["config"].get("env") or {}
    actuel = cfg.get("env") or {}
    if set(actuel) != set(env):
        return False
    for cle, val in env.items():
        a = actuel.get(cle)
        if not isinstance(a, dict) or a.get("type") != val["type"]:
            return False
        if val["type"] == "secret_ref" and a.get("secretId") != val["secretId"]:
            return False
    meta = ((agent.get("metadata") or {}).get("atelier") or {}).get("bootstrap") or {}
    return meta.get("liaison") == empreinte_liaison(liaison)


# ---------------------------------------------------------------------------
# Application idempotente
# ---------------------------------------------------------------------------

def agents_par_slug(api: Api, company_id: str) -> dict[str, dict]:
    sortie = {}
    for a in api.get(f"/companies/{company_id}/agents"):
        if a.get("status") == "terminated":
            continue
        sortie[normaliser_slug(a["name"])] = a
    return sortie


def detail_agent(api: Api, agent_id: str) -> dict:
    return api.get(f"/agents/{agent_id}")


def derives_configuration(company_id: str, d: dict, agent: dict, reg_agents: dict, agents: dict, mode: str) -> list[str]:
    """Champs lisibles (non masqués) de l'agent qui s'écartent du registre.

    Détecte une retouche faite dans l'interface (modèle, outils, permissions, budget,
    hiérarchie, compétences...). Les valeurs « plain » des variables restent masquées par
    l'API : elles sont couvertes par l'empreinte de liaison.
    """
    ecarts = []
    attendu_ext = construire_extension(reg_agents, {"entreprise": {"approbationHumainePourNouveauxAgents": True},
                                                    "projets": [], "routines": []})["agents"][agent["slug"]]
    simples = {
        "name": agent["nom"],
        "title": agent["titre"],
        "role": agent["role"],
        "budgetMonthlyCents": agent["budgetMensuelCentimes"],
        "reportsTo": agents[agent["rapporteA"]]["id"] if agent["rapporteA"] in agents else None,
    }
    for cle, val in simples.items():
        if d.get(cle) != val:
            ecarts.append(cle)
    heartbeat = ((d.get("runtimeConfig") or {}).get("heartbeat") or {})
    if heartbeat.get("maxConcurrentRuns") != reg_agents["adaptateur"]["maxConcurrentRuns"]:
        ecarts.append("runtimeConfig.heartbeat.maxConcurrentRuns")
    cfg = d.get("adapterConfig") or {}
    voulues = {c.rsplit("/", 1)[-1] for c in (cfg.get("paperclipSkillSync") or {}).get("desiredSkills") or []}
    if voulues != set(agent["competences"]):
        ecarts.append("paperclipSkillSync.desiredSkills")
    if mode == "reel" and not agent.get("deterministe"):
        attendu = attendu_ext["adapter"]["config"]
        for cle in ("engine", "model", "effort", "dangerouslySkipPermissions", "maxTurnsPerRun",
                    "timeoutSec", "graceSec", "extraArgs"):
            if cfg.get(cle) != attendu.get(cle):
                ecarts.append(f"adapterConfig.{cle}")
    else:
        attendu = liaison_voulue(company_id, reg_agents, agent["slug"], None, mode)["config"]
        for cle in ("command", "args", "timeoutSec"):
            if cfg.get(cle) != attendu.get(cle):
                ecarts.append(f"adapterConfig.{cle}")
    return ecarts


def etat_a_jour(api: Api, company_id: str, reg_agents: dict, empreinte: str, jeton_id: str | None, mode: str) -> list[str]:
    """Liste des raisons pour lesquelles l'état n'est pas à jour (vide = à jour)."""
    raisons = []
    agents = agents_par_slug(api, company_id)
    for agent in reg_agents["agents"]:
        a = agents.get(agent["slug"])
        if not a:
            raisons.append(f"agent absent : {agent['slug']}")
            continue
        d = detail_agent(api, a["id"])
        derive = derives_configuration(company_id, d, agent, reg_agents, agents, mode)
        if derive:
            raisons.append(f"configuration modifiée hors registre : {agent['slug']} ({', '.join(derive)})")
        meta = ((d.get("metadata") or {}).get("atelier") or {}).get("bootstrap") or {}
        if meta.get("empreinte") != empreinte:
            raisons.append(f"empreinte différente : {agent['slug']}")
        if not liaison_conforme(d, liaison_voulue(company_id, reg_agents, agent["slug"], jeton_id, mode)):
            raisons.append(f"liaison locale à refaire : {agent['slug']}")
        if (d.get("adapterConfig") or {}).get("instructionsBundleMode") != "managed":
            raisons.append(f"bundle d'instructions géré non rattaché : {agent['slug']}")
    for slug in competences_desynchronisees(api, company_id):
        raisons.append(f"compétence absente ou contenu différent du dépôt : {slug}")
    return raisons


def corps_instructions(slug: str) -> str:
    """Corps d'AGENTS.md tel que Paperclip l'importe (parseFrontmatterMarkdown : en-tête retiré, trim)."""
    _, corps = separer_frontmatter((ORGA / "agents" / slug / "AGENTS.md").read_text(encoding="utf-8"))
    return corps.strip()


def synchroniser_instructions(api: Api, company_id: str, reg_agents: dict) -> int:
    """Met à jour les instructions par l'API de révision canonique de Paperclip.

    Un import « replace » refuse de réécrire un AGENTS.md dont le contenu a changé
    (INSTRUCTION_REVISION_REQUIRED, server/src/services/agent-instructions.ts) et ne laisse
    qu'un avertissement : on passe donc d'abord par PUT instructions-bundle/file avec le
    hash de base, ce qui crée une révision traçable.
    """
    agents = agents_par_slug(api, company_id)
    ecritures = 0
    for agent in reg_agents["agents"]:
        a = agents.get(agent["slug"])
        if not a:
            continue
        fichier = api.get(f"/agents/{a['id']}/instructions-bundle/file?path=AGENTS.md")
        voulu = corps_instructions(agent["slug"])
        if (fichier or {}).get("content") == voulu:
            continue
        api.appel("PUT", f"/agents/{a['id']}/instructions-bundle/file", {
            "path": "AGENTS.md",
            "content": voulu,
            "baseHash": (fichier or {}).get("contentHash"),
        })
        ecritures += 1
    return ecritures


def empreinte_competence_distante(api: Api, company_id: str, competence: dict) -> str:
    """Empreinte du contenu enregistré dans Paperclip, même algorithme que le verrou."""
    detail = api.get(f"/companies/{company_id}/skills/{competence['id']}")
    chemins = sorted(e["path"] for e in (detail.get("fileInventory") or []))
    h = hashlib.sha256()
    for chemin in chemins:
        f = api.get(f"/companies/{company_id}/skills/{competence['id']}/files?path={urllib.parse.quote(chemin)}")
        h.update(chemin.encode("utf-8") + b"\0")
        h.update((f.get("content") or "").encode("utf-8") + b"\0")
    return h.hexdigest()


def competences_desynchronisees(api: Api, company_id: str) -> list[str]:
    verrou = lire_json(ORGA / FICHIER_VERROU)["competences"]
    distantes = {s["slug"]: s for s in api.get(f"/companies/{company_id}/skills")}
    ecarts = []
    for slug, entree in verrou.items():
        s = distantes.get(slug)
        if s is None or empreinte_competence_distante(api, company_id, s) != entree["sha256"]:
            ecarts.append(slug)
    return ecarts


def entete_simple(texte: str) -> tuple[dict, str]:
    """Clés scalaires de premier niveau d'un en-tête (chaînes JSON ou valeurs nues) et corps."""
    fm, corps = separer_frontmatter(texte)
    valeurs = {}
    for ligne in (fm or "").splitlines():
        m = re.match(r"^([A-Za-z0-9_]+):\s*(.+?)\s*$", ligne)
        if not m:
            continue
        brut = m.group(2)
        try:
            valeurs[m.group(1)] = json.loads(brut)
        except ValueError:
            valeurs[m.group(1)] = brut
    return valeurs, corps.strip()


def routines_existantes(api: Api, company_id: str) -> list[dict]:
    # Pas de repli silencieux : une erreur de lecture ferait réimporter les routines en double.
    routines = api.get(f"/companies/{company_id}/routines")
    if isinstance(routines, dict):
        routines = routines.get("items") or routines.get("routines") or []
    return routines


def titres_routines_existantes(api: Api, company_id: str) -> set[str]:
    return {r.get("title") for r in routines_existantes(api, company_id)}


def selection_sans_routines_existantes(api: Api, company_id: str, fichiers: dict[str, str]) -> list[str] | None:
    existantes = titres_routines_existantes(api, company_id)
    exclus = []
    for chemin, contenu in fichiers.items():
        if not chemin.endswith("/TASK.md"):
            continue
        if entete_simple(contenu)[0].get("name") in existantes:
            exclus.append(chemin)
    if not exclus:
        return None
    return [c for c in fichiers if c not in exclus]


def assurer_routines(api: Api, company_id: str, reg_orga: dict, agents: dict, projets: dict) -> int:
    """Réconcilie les routines existantes avec le dépôt (l'import natif ne les met jamais à jour).

    Champs alignés : description, responsable, projet, politiques de concurrence et de
    rattrapage, déclencheur planifié (cron, fuseau). Le statut (en pause ou actif) n'est
    jamais touché : c'est une décision humaine.
    """
    par_titre = {r.get("title"): r for r in routines_existantes(api, company_id)}
    ecritures = 0
    for routine in reg_orga["routines"]:
        tache = next((p for p in (ORGA / "projects").rglob("TASK.md") if p.parent.name == routine["slug"]), None)
        if tache is None:
            raise ErreurAtelier(f"TASK.md introuvable pour la routine {routine['slug']}")
        entete, corps = entete_simple(tache.read_text(encoding="utf-8"))
        r = par_titre.get(entete.get("name"))
        if r is None:
            raise ErreurAtelier(f"routine absente après import : {entete.get('name')}")
        voulu = {
            "description": corps,
            "assigneeAgentId": agents[entete["assignee"]]["id"],
            "projectId": projets[entete["project"]],
            "concurrencyPolicy": routine["concurrence"],
            "catchUpPolicy": routine["rattrapage"],
        }
        def actuel(cle):
            v = r.get(cle)
            return v.strip() if isinstance(v, str) else v

        diff = {k: v for k, v in voulu.items() if actuel(k) != v}
        if diff:
            api.appel("PATCH", f"/routines/{r['id']}", diff)
            ecritures += 1
        planifies = [t for t in r.get("triggers") or [] if t.get("kind") == "schedule"]
        if not planifies:
            api.appel("POST", f"/routines/{r['id']}/triggers",
                      {"kind": "schedule", "cronExpression": routine["cron"], "timezone": routine["fuseau"]})
            ecritures += 1
        elif planifies[0].get("cronExpression") != routine["cron"] or planifies[0].get("timezone") != routine["fuseau"]:
            api.appel("PATCH", f"/routine-triggers/{planifies[0]['id']}",
                      {"cronExpression": routine["cron"], "timezone": routine["fuseau"]})
            ecritures += 1
    return ecritures


def ecarts_non_geres(api: Api, company_id: str, reg_agents: dict, reg_orga: dict) -> list[str]:
    """Éléments présents dans l'entreprise mais absents du dépôt. L'import natif ne supprime
    rien et le bootstrap non plus (décision humaine) : on les signale."""
    ecarts = []
    slugs = {a["slug"] for a in reg_agents["agents"]}
    for slug in sorted(set(agents_par_slug(api, company_id)) - slugs - {GARDIEN_SLUG}):
        ecarts.append(f"agent hors registre : {slug}")
    verrou = set(lire_json(ORGA / FICHIER_VERROU)["competences"])
    for s in api.get(f"/companies/{company_id}/skills"):
        if (s.get("key") or "").startswith("company/") and s.get("slug") not in verrou:
            ecarts.append(f"compétence hors dépôt : {s.get('slug')}")
    projets = {p["slug"] for p in reg_orga["projets"]}
    for p in api.get(f"/companies/{company_id}/projects"):
        if p.get("urlKey") not in projets:
            ecarts.append(f"projet hors registre : {p.get('urlKey')}")
    cles = {o["cle"] for o in reg_orga["objectifs"]}
    for g in api.get(f"/companies/{company_id}/goals"):
        if (g.get("title") or "").split(" ", 1)[0] not in cles:
            ecarts.append(f"objectif hors registre : {g.get('title')}")
    titres = {entete_simple(p.read_text(encoding="utf-8"))[0].get("name") for p in (ORGA / "projects").rglob("TASK.md")}
    for r in routines_existantes(api, company_id):
        if r.get("title") not in titres:
            ecarts.append(f"routine hors dépôt : {r.get('title')}")
    return ecarts


def importer(api: Api, fichiers, cible: dict, collision: str, selection, pause: bool = True) -> dict:
    corps = {
        "source": {"type": "inline", "files": fichiers, "expectedFileCount": len(fichiers)},
        "include": {"company": True, "agents": True, "projects": True, "issues": True, "skills": True},
        "target": cible,
        "collisionStrategy": collision,
        "pauseAutomations": pause,
    }
    if selection is not None:
        corps["selectedFiles"] = selection
        corps["source"]["files"] = {k: v for k, v in fichiers.items() if k in set(selection)}
        corps["source"]["expectedFileCount"] = len(corps["source"]["files"])
    apercu = api.appel("POST", "/companies/import/preview", {k: v for k, v in corps.items() if k != "pauseAutomations"})
    if apercu.get("errors"):
        raise ErreurAtelier("aperçu d'import en erreur : " + "; ".join(apercu["errors"]))
    return api.appel("POST", "/companies/import", corps)


CLES_CONSERVEES = ("paperclipSkillSync", "instructionsFilePath", "instructionsRootPath",
                   "instructionsEntryFile", "instructionsBundleMode")


def lier_agents(api, company_id, reg_agents, empreinte, jeton_id, mode="reel") -> int:
    agents = agents_par_slug(api, company_id)
    horodatage = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    modifies = 0
    for agent in reg_agents["agents"]:
        a = agents.get(agent["slug"])
        if a is None:
            raise ErreurAtelier(f"agent absent après import : {agent['slug']}")
        d = detail_agent(api, a["id"])
        liaison = liaison_voulue(company_id, reg_agents, agent["slug"], jeton_id, mode)
        meta = d.get("metadata") or {}
        atelier = dict(meta.get("atelier") or {})
        deja = (atelier.get("bootstrap") or {}).get("empreinte") == empreinte
        if deja and liaison_conforme(d, liaison):
            continue
        atelier["bootstrap"] = {
            "empreinte": empreinte,
            "mode": mode,
            "liaison": empreinte_liaison(liaison),
            "date": horodatage,
        }
        meta = dict(meta)
        meta["atelier"] = atelier
        corps = {"metadata": meta}
        if liaison["adapterType"] == d.get("adapterType"):
            corps["adapterConfig"] = liaison["config"]
        else:
            # Changement d'adaptateur : configuration remplacée, en gardant les compétences
            # voulues et le bundle d'instructions géré par Paperclip.
            actuelle = d.get("adapterConfig") or {}
            config = {k: actuelle[k] for k in CLES_CONSERVEES if k in actuelle}
            config.update(liaison["config"])
            corps.update({"adapterType": liaison["adapterType"], "adapterConfig": config, "replaceAdapterConfig": True})
        api.appel("PATCH", f"/agents/{a['id']}", corps)
        modifies += 1
    return modifies


def assurer_objectifs(api, company_id, reg_orga, agents) -> tuple[dict[str, str], int]:
    existants = api.get(f"/companies/{company_id}/goals")
    ids, ecritures = {}, 0
    for obj in reg_orga["objectifs"]:
        titre = f"{obj['cle']} · {obj['titre']}"
        voulu = {
            "title": titre,
            "description": obj["description"],
            "level": obj["niveau"],
            "status": obj["statut"],
            "ownerAgentId": (agents.get(obj["responsable"]) or {}).get("id"),
        }
        trouve = next((g for g in existants if (g.get("title") or "").startswith(obj["cle"] + " ")), None)
        if not trouve:
            g = api.appel("POST", f"/companies/{company_id}/goals", voulu)
            ids[obj["cle"]] = g["id"]
            ecritures += 1
            continue
        ids[obj["cle"]] = trouve["id"]
        diff = {k: v for k, v in voulu.items() if trouve.get(k) != v}
        if diff:
            api.appel("PATCH", f"/goals/{trouve['id']}", diff)
            ecritures += 1
    return ids, ecritures


def assurer_liens_projets(api, company_id, reg_orga, objectifs) -> tuple[dict[str, str], int]:
    projets = {p.get("urlKey"): p for p in api.get(f"/companies/{company_id}/projects")}
    ids, ecritures = {}, 0
    for projet in reg_orga["projets"]:
        p = projets.get(projet["slug"])
        if not p:
            raise ErreurAtelier(f"projet absent après import : {projet['slug']}")
        ids[projet["slug"]] = p["id"]
        voulus = sorted(objectifs[c] for c in projet["objectifs"])
        actuels = sorted(p.get("goalIds") or [g.get("id") for g in (p.get("goals") or [])])
        if voulus != actuels:
            api.appel("PATCH", f"/projects/{p['id']}", {"goalIds": voulus})
            ecritures += 1
    return ids, ecritures


def etiquette_version(verrou_entree: dict) -> str:
    return f"atelier {verrou_entree['version']} sha256:{verrou_entree['sha256'][:16]}"


def assurer_versions_competences(api, company_id) -> tuple[dict, int]:
    """Fige une version native par compétence du paquet, étiquetée avec la version du
    registre et l'empreinte du dossier. N'écrit que si la version courante diffère."""
    verrou = lire_json(ORGA / FICHIER_VERROU)["competences"]
    competences = {s["slug"]: s for s in api.get(f"/companies/{company_id}/skills")}
    sortie, ecritures = {}, 0
    for slug, entree in verrou.items():
        s = competences.get(slug)
        if not s:
            raise ErreurAtelier(f"compétence absente après import : {slug}")
        voulu = etiquette_version(entree)
        courante = None
        if s.get("currentVersionId"):
            versions = api.get(f"/companies/{company_id}/skills/{s['id']}/versions")
            if isinstance(versions, dict):
                versions = versions.get("items") or versions.get("versions") or []
            courante = next((v for v in versions if v.get("id") == s["currentVersionId"]), None)
        if not courante or courante.get("label") != voulu:
            courante = api.appel("POST", f"/companies/{company_id}/skills/{s['id']}/versions", {"label": voulu})
            ecritures += 1
        sortie[slug] = {
            "skillId": s["id"],
            "cle": s["key"],
            "versionId": courante.get("id"),
            "revision": courante.get("revisionNumber"),
            "etiquette": voulu,
            "sha256": entree["sha256"],
        }
    return sortie, ecritures


HOTES_BOUCLE = {"127.0.0.1", "localhost", "[::1]", "::1"}


def service_connexion(connexion: dict, services: dict) -> str | None:
    """Service de la passerelle d'une connexion native : carte `atelier-*` (sourceTemplateKey)
    ou, pour une connexion générique, adresse de boucle locale `/mcp/<service>`."""
    cfg = connexion.get("config") or {}
    par_carte = {slug: cle for cle, slug in services.items()}
    if cfg.get("sourceTemplateKey") in par_carte:
        return par_carte[cfg["sourceTemplateKey"]]
    u = urllib.parse.urlparse(str(cfg.get("url") or ""))
    m = re.fullmatch(r"/mcp/([a-z0-9_-]+)/?", u.path or "")
    if u.hostname in HOTES_BOUCLE and m and m.group(1) in services:
        return m.group(1)
    return None


def nom_politique_lecture(connexion_id: str, slug: str) -> str:
    return f"atelier-lecture-seule:{connexion_id}:{slug}"


def nom_politique_outil_interdit(connexion_id: str, slug: str, outil: str) -> str:
    return f"atelier-outil-interdit:{connexion_id}:{slug}:{outil}"


def politiques_outils(api: Api, company_id: str) -> list[dict]:
    rep = api.get(f"/companies/{company_id}/tools/policies")
    return rep.get("policies", []) if isinstance(rep, dict) else rep


def connexions_passerelle(api: Api, company_id: str, services: dict) -> list[tuple[str, dict]]:
    rep = api.get(f"/companies/{company_id}/tools/connections")
    liste = rep.get("connections", []) if isinstance(rep, dict) else rep
    sortie = []
    for cx in liste:
        cle = service_connexion(cx, services)
        if cle and cx.get("status") != "archived":
            sortie.append((cle, cx))
    return sortie


def besoins_connexions(reg_agents: dict) -> dict[str, list[tuple[str, str]]]:
    """Service -> [(slug du rôle, accès)] d'après le registre (champ `connexions`)."""
    besoins: dict[str, list[tuple[str, str]]] = {cle: [] for cle in reg_agents["connexionsPasserelle"]["services"]}
    for agent in reg_agents["agents"]:
        for cle, acces in (agent.get("connexions") or {}).items():
            besoins[cle].append((agent["slug"], acces))
    return besoins


def assurer_connexions(api: Api, company_id: str, reg_agents: dict, agents: dict) -> tuple[int, list[str]]:
    """Réserve chaque connexion de la passerelle EXISTANTE aux rôles qui la déclarent.

    - Accès natif « qui peut utiliser » : même geste que l'onglet Permissions de Paperclip
      (`POST …/tools/apps/:id/finish` avec les actions activées et les « Ask first » ACTUELS,
      inchangés, et `access: {agentIds}`) : le profil `app:<connexion>` n'est plus lié à toute
      l'entreprise mais aux seuls rôles (profil effectif lu par le moteur au démarrage d'un run).
    - Installations natives (`PUT /tool-connections/:id/installs`) : exactement les agents des
      rôles déclarés, jamais l'entreprise entière (c'est l'installation qui livre les outils à
      un run : `buildPaperclipRuntimeMcpServers`). Une connexion créée plus tard par une carte
      arrive pour « tous les agents » : le Gardien des connexions (sous-commande `assurer-connexions`,
      battement de 60 s) la resserre seul ; `appliquer` fait le même travail.
    - Rôle en `lecture` : politique native « block » sur les écritures (`risk.isWrite`) de la
      connexion pour cet agent ; une politique « block » l'emporte toujours. Créée si absente,
      jamais modifiée ni réactivée ensuite (un choix humain dans Paperclip est respecté).
    - Rôle en `ecriture_sur_accord` avec `outilsBloques` (registre) : politique native « block » par
      OUTIL (sélecteurs connexion + nom d'outil, condition sur l'agent) pour chaque outil interdit
      du service, par exemple `facebook_envoyer_message` pour Contenus. Même règle de création.
    Les écritures des autres rôles restent « Ask first » (patch socle 0005).
    """
    services = reg_agents["connexionsPasserelle"]["services"]
    besoins = besoins_connexions(reg_agents)
    toutes_politiques = politiques_outils(api, company_id)
    existantes = {p.get("name") for p in toutes_politiques}
    rep_profils = api.get(f"/companies/{company_id}/tools/profiles")
    profils = {p.get("profileKey"): p for p in (rep_profils.get("profiles", []) if isinstance(rep_profils, dict) else rep_profils)}
    interdits = {a["slug"]: a.get("outilsBloques") or {} for a in reg_agents["agents"]}
    ecritures, resume = 0, []
    for cle, cx in connexions_passerelle(api, company_id, services):
        roles = [(s, acces) for s, acces in besoins[cle] if s in agents]
        ids_roles = sorted(agents[s]["id"] for s, _ in roles)
        profil = profils.get(f"app:{cx['id']}")
        if profil and ids_roles:
            liaisons = profil.get("bindings") or []
            actuel = sorted(b["targetId"] for b in liaisons if b.get("targetType") == "agent")
            if any(b.get("targetType") == "company" for b in liaisons) or actuel != ids_roles:
                rep_cat = api.get(f"/tool-connections/{cx['id']}/catalog")
                du_catalogue = {e["id"] for e in (rep_cat.get("catalog", []) if isinstance(rep_cat, dict) else rep_cat)}
                actives = [e["catalogEntryId"] for e in profil.get("entries") or []
                           if e.get("effect") == "include" and e.get("selectorType") == "catalog_entry" and e.get("catalogEntryId") in du_catalogue]
                demander_avant = [p["selectors"]["catalogEntryId"] for p in toutes_politiques
                                  if p.get("policyType") == "require_approval" and p.get("enabled", True)
                                  and (p.get("selectors") or {}).get("catalogEntryId") in du_catalogue
                                  and not (p.get("conditions") or {}).get("actor")]
                api.appel("POST", f"/companies/{company_id}/tools/apps/{cx['id']}/finish", {
                    "enabledCatalogEntryIds": actives,
                    "askFirstCatalogEntryIds": [i for i in demander_avant if i in set(actives)],
                    "access": {"agentIds": ids_roles},
                })
                ecritures += 1
        voulus = sorted(("agent", i) for i in ids_roles)
        actuels = sorted((i["targetType"], i["targetId"]) for i in api.get(f"/tool-connections/{cx['id']}/installs").get("installs", []))
        if actuels != voulus:
            api.appel("PUT", f"/tool-connections/{cx['id']}/installs", {"installs": [{"targetType": t, "targetId": i} for t, i in voulus]})
            ecritures += 1
        for slug, acces in roles:
            for outil in interdits.get(slug, {}).get(cle, []):
                nom_outil = nom_politique_outil_interdit(cx["id"], slug, outil)
                if acces == "lecture" or nom_outil in existantes:
                    continue  # un rôle en lecture a déjà le « block » de toutes les écritures
                api.appel("POST", f"/companies/{company_id}/tools/policies", {
                    "name": nom_outil,
                    "description": f"Atelier : le rôle « {slug} » n'appelle jamais {outil} du service {cle} (registre des agents, champ outilsBloques).",
                    "policyType": "block",
                    "priority": 10,
                    "selectors": {"connectionId": cx["id"], "toolName": outil},
                    "conditions": {"actor": {"agentId": agents[slug]["id"]}},
                })
                ecritures += 1
            nom = nom_politique_lecture(cx["id"], slug)
            if acces != "lecture" or nom in existantes:
                continue
            api.appel("POST", f"/companies/{company_id}/tools/policies", {
                "name": nom,
                "description": f"Atelier : le rôle « {slug} » lit le service {cle} sans jamais y écrire (registre des agents).",
                "policyType": "block",
                "priority": 10,
                "selectors": {"connectionId": cx["id"]},
                "conditions": {"actor": {"agentId": agents[slug]["id"]}, "risk": {"isWrite": True}},
            })
            ecritures += 1
        detail = (", ".join(f"{s} ({a})" for s, a in roles) or "aucun rôle") + ("" if profil else " ; connexion non terminée : accès appliqué à sa finalisation")
        resume.append(f"{cle} « {cx.get('name')} » : {detail}")
    return ecritures, resume


def corps_gardien(api: Api, rapporte_a: str | None = None) -> dict:
    """Définition voulue du « Gardien des connexions » : agent natif process, AUCUN modèle.
    Le battement natif (runtimeConfig.heartbeat, intervalle en secondes) lance, sans tâche ni
    issue créée, `bootstrap-organisation.py assurer-connexions`. L'API visée et le dossier de
    données locales sont ceux du « appliquer » qui l'a posé ; la commande est fixée par l'humain
    (Paperclip refuse qu'une clé d'agent configure un adaptateur process)."""
    adaptateur = {
        "command": "python3",
        "args": ["-I", str(RACINE / "scripts" / "bootstrap-organisation.py"), "assurer-connexions"],
        "cwd": str(RACINE),
        "env": {"ATELIER_API": api.base, "ATELIER_DONNEES_LOCALES": str(INSTANCE)},
        "timeoutSec": 120,
    }
    battement = {"enabled": True, "intervalSec": GARDIEN_INTERVALLE_SEC, "wakeOnDemand": False, "maxConcurrentRuns": 1}
    # L'API masque les valeurs de l'environnement (***REDACTED***) : l'empreinte, rangée dans les
    # métadonnées, sert à détecter un changement d'API ou de dossier de données.
    empreinte = hashlib.sha256(json.dumps([adaptateur, battement], sort_keys=True).encode()).hexdigest()
    return {
        "name": GARDIEN_NOM,
        "role": "devops",
        "title": "Gardien des connexions (déterministe, sans modèle)",
        "reportsTo": rapporte_a,
        "capabilities": (
            "Agent déterministe, sans modèle : réserve aux rôles déclarés dans le registre chaque connexion de "
            "la passerelle créée après le bootstrap (accès natif, installations, politiques de lecture seule)."
        ),
        "adapterType": "process",
        "adapterConfig": adaptateur,
        "runtimeConfig": {"heartbeat": battement},
        "budgetMonthlyCents": 0,
        "permissions": {"canCreateAgents": False, "canCreateSkills": False},
        "metadata": {"atelier": {"gardien": {"empreinte": empreinte}}},
    }


def gardien_conforme(d: dict, voulu: dict) -> list[str]:
    """Écarts entre l'agent existant et la définition voulue (liste vide = conforme)."""
    ecarts = []
    if d.get("reportsTo") != voulu.get("reportsTo"):
        ecarts.append("reportsTo")
    cfg = d.get("adapterConfig") or {}
    for cle, valeur in voulu["adapterConfig"].items():
        if cle != "env" and cfg.get(cle) != valeur:
            ecarts.append(f"adapterConfig.{cle}")
    meta_actuelle = (((d.get("metadata") or {}).get("atelier") or {}).get("gardien") or {}).get("empreinte")
    if meta_actuelle != voulu["metadata"]["atelier"]["gardien"]["empreinte"]:
        ecarts.append("empreinte (API, dossier de données ou réglages)")
    if d.get("adapterType") != voulu["adapterType"]:
        ecarts.append("adaptateur")
    beat = ((d.get("runtimeConfig") or {}).get("heartbeat")) or {}
    for cle, valeur in voulu["runtimeConfig"]["heartbeat"].items():
        if beat.get(cle) != valeur:
            ecarts.append(f"heartbeat.{cle}")
    perms = d.get("permissions") or {}
    for cle, valeur in voulu["permissions"].items():
        if perms.get(cle) != valeur:
            ecarts.append(f"permissions.{cle}")
    return ecarts


def assurer_gardien(api: Api, company_id: str) -> tuple[int, str]:
    """Crée ou réaligne le « Gardien des connexions ». Création par l'embauche native
    (`agent-hires`) puis approbation par l'humain qui lance « appliquer » : l'entreprise exige
    une approbation pour tout nouvel agent, et cet agent n'a aucun modèle ni aucun droit.
    Un agent mis en pause par un humain n'est jamais réactivé (choix humain respecté) : il est
    seulement signalé, car les connexions restent alors ouvertes tant qu'il est en pause."""
    agents = agents_par_slug(api, company_id)
    # Le Gardien rend compte au Responsable qualité (branche des contrôleurs), pas au Coordinateur.
    voulu = corps_gardien(api, (agents.get("relecteur") or {}).get("id"))
    existant = agents.get(GARDIEN_SLUG)
    ecritures = 0
    if existant is None:
        rep = api.appel("POST", f"/companies/{company_id}/agent-hires", voulu)
        ecritures += 1
        approbation = (rep or {}).get("approval")
        if (rep or {}).get("agent", {}).get("status") == "pending_approval" and approbation:
            api.appel("POST", f"/approvals/{approbation['id']}/approve", {
                "decisionNote": "Agent déterministe sans modèle posé par le bootstrap de l'atelier (assurer-connexions).",
            })
            ecritures += 1
        return ecritures, "créé et approuvé"
    d = detail_agent(api, existant["id"])
    if d.get("status") == "pending_approval":
        for ap in api.get(f"/companies/{company_id}/approvals?status=pending"):
            if ap.get("type") == "hire_agent" and (ap.get("payload") or {}).get("agentId") == existant["id"]:
                api.appel("POST", f"/approvals/{ap['id']}/approve", {
                    "decisionNote": "Agent déterministe sans modèle posé par le bootstrap de l'atelier (assurer-connexions).",
                })
                ecritures += 1
    ecarts = gardien_conforme(d, voulu)
    if ecarts:
        api.appel("PATCH", f"/agents/{existant['id']}", {
            "adapterConfig": voulu["adapterConfig"], "replaceAdapterConfig": True,
            "runtimeConfig": voulu["runtimeConfig"], "metadata": voulu["metadata"],
            "reportsTo": voulu["reportsTo"],
        })
        ecritures += 1
        if any(e.startswith("permissions") for e in ecarts):
            api.appel("PATCH", f"/agents/{existant['id']}/permissions", voulu["permissions"])
            ecritures += 1
    etat = d.get("status") or "inconnu"
    if etat == "paused":
        return ecritures, "EN PAUSE (choix humain respecté) : les nouvelles connexions restent ouvertes tant qu'il l'est"
    return ecritures, ("réaligné (" + ", ".join(ecarts) + ")" if ecarts else "conforme")


def cmd_assurer_connexions(args) -> int:
    """Étape légère et idempotente, sans import ni écriture hors connexions : lancée par le
    Gardien des connexions à chaque battement (60 s). Rien à faire = aucune écriture. Si un
    « appliquer » tient le verrou, on passe : le battement suivant reprendra."""
    try:
        with verrou_ecriture("assurer-connexions"):
            return _assurer_connexions(args)
    except ErreurAtelier as e:
        if "est déjà en cours" in str(e):
            print("assurer-connexions : une autre écriture du bootstrap est en cours, passage au prochain battement.")
            return 0
        raise


def entreprise_du_gardien(api: Api, reg_orga: dict):
    """Entreprise sur laquelle agit « assurer-connexions ».

    Lancée par le Gardien (adaptateur process), la commande reçoit de Paperclip
    PAPERCLIP_COMPANY_ID, l'entreprise de l'agent, que la configuration de l'agent ne
    peut pas remplacer : le Gardien agit sur SA propre entreprise. Sans cette variable
    (appel à la main), on cherche l'entreprise par le nom et le marqueur du registre.
    Chercher par le nom depuis le Gardien ferait agir le Gardien d'une seconde
    entreprise de démonstration sur la première."""
    cid = (os.environ.get("PAPERCLIP_COMPANY_ID") or "").strip()
    if not cid:
        return trouver_entreprise(api, reg_orga)
    for c in api.get("/companies"):
        if c.get("id") == cid:
            return c
    raise ErreurAtelier(f"entreprise du Gardien introuvable sur cette instance : {cid}")


def _assurer_connexions(args) -> int:
    reg_agents, reg_orga = registres()
    api = Api(url_api())
    entreprise = entreprise_du_gardien(api, reg_orga)
    if entreprise is None:
        print("assurer-connexions : aucune organisation de démonstration sur cette instance, rien à faire.")
        return 0
    agents = agents_par_slug(api, entreprise["id"])
    manquants = [a["slug"] for a in reg_agents["agents"] if a["slug"] not in agents]
    if manquants:
        raise ErreurAtelier("agents du registre absents (lancer « appliquer » d'abord) : " + ", ".join(manquants))
    ecritures, resume = assurer_connexions(api, entreprise["id"], reg_agents, agents)
    print(f"assurer-connexions : {ecritures} écriture(s) sur {len(resume)} connexion(s) de la passerelle.")
    if ecritures or args.detail:
        for ligne in resume:
            print(f"  {ligne}")
    return 0


def resoudre_politiques(agents: dict, responsable: str) -> dict:
    resolues = {}
    for chemin in sorted(DOSSIER_POLITIQUES.glob("*.json")):
        texte = chemin.read_text(encoding="utf-8")

        def remplacer(m):
            genre, nom = m.group(1), m.group(2)
            if genre == "humain":
                return responsable
            if nom in agents:
                return agents[nom]["id"]
            raise ErreurAtelier(f"{chemin.name} : agent inconnu dans un gabarit : {nom}")

        resolues[chemin.stem] = json.loads(re.sub(r"\{\{(agent|humain):([a-z0-9-]+)\}\}", remplacer, texte))
    return resolues


def ecrire_si_change(chemin: Path, contenu: str) -> bool:
    if chemin.exists() and chemin.read_text(encoding="utf-8") == contenu:
        return False
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(contenu, encoding="utf-8")
    return True


def cmd_appliquer(args) -> int:
    with verrou_ecriture("appliquer"):
        return _appliquer(args)


def _appliquer(args) -> int:
    if cmd_generer(argparse.Namespace(verifier=True)) != 0:
        return 1
    reg_agents, reg_orga = registres()
    appliquer_organisation(Api(url_api()), reg_agents, reg_orga, fichiers_paquet(), args.mode, ETAT_LOCAL)
    return 0


def appliquer_organisation(api: Api, reg_agents: dict, reg_orga: dict, fichiers: dict[str, str], mode: str,
                           dossier_etat: Path) -> str:
    """Applique l'organisation des agents à UNE entreprise, retrouvée par le nom et le marqueur de
    reg_orga["entreprise"] : celle de démonstration pour « appliquer », celle d'un client pour
    « nouveau-client » (mêmes étapes, mêmes fonctions). Renvoie l'identifiant de l'entreprise."""
    if mode == "demonstration" and not (PLUGIN / SCRIPT_DEMO).exists():
        print(f"Attention : {SCRIPT_DEMO} n'existe pas encore dans plugin-atelier/ (lot A) ; "
              "les agents de démonstration restent en pause et ne pourront pas tourner avant sa livraison.")
    # L'empreinte couvre le paquet ET le mode : changer de mode relance l'import natif,
    # qui remet la configuration canonique avant la nouvelle liaison.
    empreinte = hashlib.sha256((empreinte_paquet(fichiers) + ":" + mode).encode()).hexdigest()
    slugs = [a["slug"] for a in reg_agents["agents"]]

    entreprise = trouver_entreprise(api, reg_orga)  # contrôle de périmètre avant toute écriture
    import_fait = None
    if entreprise is None:
        print(f"Création de « {reg_orga['entreprise']['nom']} » par import natif (agents en pause).")
        resultat = importer(
            api, fichiers,
            {"mode": "new_company", "newCompanyName": reg_orga["entreprise"]["nom"]},
            "rename", None,
        )
        import_fait = resultat
        entreprise = trouver_entreprise(api, reg_orga)
        if entreprise is None:
            raise ErreurAtelier("l'import a réussi mais l'entreprise reste introuvable par son nom et son marqueur")
    company_id = entreprise["id"]
    # Les dossiers locaux portent l'identifiant de l'entreprise : ils ne peuvent être créés qu'ici, une fois
    # l'entreprise connue (créée par l'import natif au besoin).
    reglages_ecrits = preparer_dossiers_locaux(company_id, reg_agents)
    secret = secret_jeton(api, company_id)
    jeton_id = secret["id"] if secret else None

    instructions_sync = 0
    if import_fait is None:
        instructions_sync = synchroniser_instructions(api, company_id, reg_agents)
        raisons = etat_a_jour(api, company_id, reg_agents, empreinte, jeton_id, mode)
        if raisons:
            print("Mise à jour en place (import natif, stratégie replace) :")
            for r in raisons:
                print(f"  - {r}")
            selection = selection_sans_routines_existantes(api, company_id, fichiers)
            # La branche « update » de l'import remet en pause tout agent mis à jour si
            # pauseAutomations est vrai. On ne le demande que si un agent doit être créé :
            # une mise à jour ne rallume ni n'éteint un agent que l'opérateur aurait activé.
            creation = any(r.startswith("agent absent") for r in raisons)
            import_fait = importer(
                api, fichiers, {"mode": "existing_company", "companyId": company_id}, "replace", selection,
                pause=creation,
            )
    if import_fait is not None:
        for w in import_fait.get("warnings") or []:
            print(f"  avertissement Paperclip : {w}")
        echecs = [w for w in import_fait.get("warnings") or [] if w.startswith("Failed to")]
        if echecs:
            raise ErreurAtelier("l'import a laissé des échecs : " + " | ".join(echecs))

    liaisons = lier_agents(api, company_id, reg_agents, empreinte, jeton_id, mode)
    agents = agents_par_slug(api, company_id)
    objectifs, ecr_obj = assurer_objectifs(api, company_id, reg_orga, agents)
    projets, ecr_proj = assurer_liens_projets(api, company_id, reg_orga, objectifs)
    ecr_routines = assurer_routines(api, company_id, reg_orga, agents, projets)
    responsable = utilisateur_responsable(api)
    versions, ecr_versions = assurer_versions_competences(api, company_id)
    ecr_connexions, connexions = assurer_connexions(api, company_id, reg_agents, agents)
    ecr_gardien, etat_gardien = assurer_gardien(api, company_id)

    politiques = resoudre_politiques(agents, responsable)
    etat = {
        "schema": "atelier/etat-bootstrap/v1",
        "api": api.base,
        "companyId": company_id,
        "entreprise": reg_orga["entreprise"]["nom"],
        "empreintePaquet": empreinte,
        "mode": mode,
        "responsableHumainUserId": responsable,
        "agents": {s: {"id": agents[s]["id"], "nom": agents[s]["name"]} for s in slugs},
        "objectifs": objectifs,
        "projets": projets,
        "jetonSecretId": jeton_id,
        "competences": versions,
    }
    fichiers_ecrits = 0
    fichiers_ecrits += ecrire_si_change(dossier_etat / "etat-bootstrap.json", json.dumps(etat, ensure_ascii=False, indent=2) + "\n")
    for nom, contenu in politiques.items():
        fichiers_ecrits += ecrire_si_change(
            dossier_etat / "politiques" / f"{nom}.json", json.dumps(contenu, ensure_ascii=False, indent=2) + "\n"
        )

    print(f"Entreprise : {company_id} (mode {mode}, agents en pause)")
    print(f"Import natif : {'oui' if import_fait is not None else 'non (déjà à jour)'}")
    print(f"Instructions mises à jour par révision : {instructions_sync}")
    print(f"Agents reliés localement : {liaisons} modifié(s) sur {len(slugs)}")
    print(f"Objectifs : {ecr_obj} écriture(s) ; liens projets-objectifs : {ecr_proj} écriture(s)")
    print(f"Versions natives de compétences figées : {ecr_versions} sur {len(versions)}")
    print(f"Routines réalignées : {ecr_routines} écriture(s)")
    print(f"Connexions de la passerelle réservées aux rôles : {ecr_connexions} écriture(s) sur {len(connexions)} connexion(s)")
    for ligne in connexions:
        print(f"  {ligne}")
    print(f"« {GARDIEN_NOM} » (battement toutes les {GARDIEN_INTERVALLE_SEC} s) : {etat_gardien} ({ecr_gardien} écriture(s))")
    print(f"Réglages Claude dédiés écrits : {reglages_ecrits} fichier(s)")
    for ecart in ecarts_non_geres(api, company_id, reg_agents, reg_orga):
        print(f"  écart non géré (rien n'est supprimé automatiquement) : {ecart}")
    print(f"Fichiers d'état locaux réécrits : {fichiers_ecrits}")
    print(f"Écritures API totales : {api.ecritures}")
    return company_id


# ---------------------------------------------------------------------------
# État, export, remise à zéro, jeton
# ---------------------------------------------------------------------------

def cmd_etat(args) -> int:
    _, reg_orga = registres()
    api = Api(url_api())
    e = trouver_entreprise(api, reg_orga)
    if not e:
        print("Aucune organisation de démonstration sur cette instance.")
        return 0
    cid = e["id"]
    agents = agents_par_slug(api, cid)
    print(f"{e['name']} ({cid})")
    for slug, a in sorted(agents.items()):
        d = detail_agent(api, a["id"])
        cfg = d.get("adapterConfig") or {}
        if slug == GARDIEN_SLUG:
            beat = (d.get("runtimeConfig") or {}).get("heartbeat") or {}
            # Ligne distincte (« gardien », pas « agent ») : les onze agents du registre restent comptés seuls.
            print(f"  gardien {slug} statut={a.get('status')} adaptateur={d.get('adapterType')} (sans modèle) battement={beat.get('intervalSec')} s "
                  f"dernier={d.get('lastHeartbeatAt') or 'jamais'}")
            continue
        print(f"  agent {slug:18} statut={str(a.get('status')):8} adaptateur={d.get('adapterType')} modèle={cfg.get('model')} rapporte_à={d.get('reportsTo')}")
    print(f"  compétences : {len(api.get(f'/companies/{cid}/skills'))}")
    print(f"  objectifs : {len(api.get(f'/companies/{cid}/goals'))}")
    print(f"  projets : {len(api.get(f'/companies/{cid}/projects'))}")
    print(f"  routines : {len(routines_existantes(api, cid))}")
    reg_agents, _ = registres()
    services = reg_agents["connexionsPasserelle"]["services"]
    besoins = besoins_connexions(reg_agents)
    for cle, cx in connexions_passerelle(api, cid, services):
        installs = api.get(f"/tool-connections/{cx['id']}/installs").get("installs", [])
        noms = {a["id"]: s for s, a in agents.items()}
        reel = sorted(noms.get(i["targetId"], "entreprise entière" if i["targetType"] == "company" else i["targetId"]) for i in installs)
        voulu = sorted(s for s, _ in besoins[cle] if s in agents)
        ecart = "" if reel == voulu else (
            f" ; ÉCART, attendu : {', '.join(voulu) or 'aucun'} "
            f"(le Gardien des connexions le corrige au prochain battement, sinon : assurer-connexions ou appliquer)"
        )
        print(f"  connexion {cle:10} « {cx.get('name')} » : {', '.join(reel) or 'aucun agent'}{ecart}")
    for ecart in ecarts_non_geres(api, cid, reg_agents, reg_orga):
        print(f"  écart non géré : {ecart}")
    return 0


MOTIFS_INTERDITS_EXPORT = [
    (re.compile(r"/home/|/tmp/|/root/|/Users/|/mnt/|/media/|/var/|/opt/|/srv/|(?<![A-Za-z])[A-Za-z]:\\[A-Za-z]"), "chemin local absolu"),
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{8,}"), "clé Anthropic"),
    (re.compile(r"(?i)oauth[_-]?token\"?\s*[:=]\s*\"[A-Za-z0-9_\-]{12,}"), "jeton OAuth"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "clé privée"),
]


def charger_yaml_sur(texte: str):
    """Lit le YAML exporté par Paperclip SANS les conversions de YAML 1.1 de PyYAML.

    Paperclip écrit du YAML 1.2 (bibliothèque « yaml » de Node) : « on », « yes », « no »,
    « off » y sont de simples chaînes, et une clé comme « 123 » une clé texte. PyYAML (1.1)
    les lirait comme des booléens ou des entiers, puis la réécriture produirait « true » ou
    « 123 » et changerait le sens du paquet. Ce chargeur : (1) garde TOUTES les clés de
    dictionnaire sous forme de texte, telles qu'écrites ; (2) ne reconnaît comme booléens que
    true/false ; (3) ne reconnaît ni base 60 (« 1:30 »), ni octal à l'ancienne (« 0777 »), ni
    séparateur « _ », ni dates (elles restent du texte). Les autres types sont conservés."""
    import yaml

    class Chargeur(yaml.SafeLoader):
        pass

    Chargeur.yaml_implicit_resolvers = {}
    for balise, motif, premiers in (
        ("tag:yaml.org,2002:bool", r"^(?:true|True|TRUE|false|False|FALSE)$", "tTfF"),
        ("tag:yaml.org,2002:int", r"^(?:[-+]?(?:0|[1-9][0-9]*)|0x[0-9a-fA-F]+|0o[0-7]+)$", "-+0123456789"),
        ("tag:yaml.org,2002:float", r"^(?:[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?|[-+]?[0-9]+[eE][-+]?[0-9]+)$", "-+0123456789."),
        ("tag:yaml.org,2002:null", r"^(?:~|null|Null|NULL|)$", "~nN"),
    ):
        yaml.add_implicit_resolver(balise, re.compile(motif), list(premiers) + ([""] if balise.endswith("null") else []), Loader=Chargeur)

    def construire_entier(chargeur, noeud):
        v = noeud.value
        return int(v, 16) if v.lower().startswith("0x") else int(v[2:], 8) if v.lower().startswith("0o") else int(v)

    Chargeur.add_constructor("tag:yaml.org,2002:int", construire_entier)

    def construire_dictionnaire(chargeur, noeud, deep=False):
        resultat = {}
        for cle_noeud, valeur_noeud in noeud.value:
            if isinstance(cle_noeud, yaml.ScalarNode):
                cle = cle_noeud.value  # texte exact, jamais converti
            else:
                cle = chargeur.construct_object(cle_noeud, deep=True)
            if cle in resultat:
                raise ErreurAtelier(f"YAML exporté : clé en double « {cle} »")
            resultat[cle] = chargeur.construct_object(valeur_noeud, deep=deep)
        return resultat

    Chargeur.add_constructor("tag:yaml.org,2002:map", construire_dictionnaire)
    return yaml.load(texte, Loader=Chargeur)  # noqa: S506 : chargeur dérivé de SafeLoader


def nettoyer_extension_export(texte: str) -> tuple[str, list[str]]:
    """Retire les valeurs par défaut des entrées « system_dependent » (chemins de la machine)."""
    donnees = charger_yaml_sur(texte) or {}
    retraits = []
    for genre in ("agents", "projects"):
        for slug, ext in (donnees.get(genre) or {}).items():
            env = ((ext or {}).get("inputs") or {}).get("env") or {}
            for cle, decl in env.items():
                if isinstance(decl, dict) and decl.get("portability") == "system_dependent" and decl.get("default"):
                    decl["default"] = ""
                    retraits.append(f"{genre}.{slug}.inputs.env.{cle}.default")
            cfg = (((ext or {}).get("adapter") or {}).get("config") or {})
            for cle in ("cwd", "command", "instructionsFilePath"):
                if isinstance(cfg.get(cle), str) and cfg[cle].startswith("/"):
                    del cfg[cle]
                    retraits.append(f"{genre}.{slug}.adapter.config.{cle}")
            # Un chemin absolu dans extraArgs n'est pas retiré (cela changerait le sens de la
            # commande) : controler_export le signale comme problème bloquant.
    return yaml_texte_libre(donnees), retraits


def yaml_texte_libre(donnees) -> str:
    # Les clés exportées par Paperclip peuvent sortir du jeu de caractères des
    # clés du registre : on les écrit telles quelles (dialecte compatible).
    def lignes(objet, indent=0):
        pad = " " * indent
        out = []
        if isinstance(objet, dict):
            for cle, valeur in objet.items():
                cle_txt = cle if re.fullmatch(r"[A-Za-z0-9_.\-]+", str(cle)) else json.dumps(str(cle), ensure_ascii=False)
                if isinstance(valeur, (dict, list)) and valeur:
                    out.append(f"{pad}{cle_txt}:")
                    out.extend(lignes(valeur, indent + 2))
                elif isinstance(valeur, dict):
                    out.append(f"{pad}{cle_txt}: {{}}")
                elif isinstance(valeur, list):
                    out.append(f"{pad}{cle_txt}: []")
                else:
                    out.append(f"{pad}{cle_txt}: {_scalaire(valeur if not isinstance(valeur, (dt.date, dt.datetime)) else valeur.isoformat())}")
        elif isinstance(objet, list):
            for el in objet:
                if isinstance(el, (dict, list)):
                    out.append(f"{pad}-")
                    out.extend(lignes(el, indent + 2))
                else:
                    out.append(f"{pad}- {_scalaire(el)}")
        return out

    return "\n".join(lignes(donnees)) + "\n"


def controler_export(fichiers: dict[str, str]) -> list[str]:
    problemes = []
    for chemin, contenu in fichiers.items():
        if not isinstance(contenu, str):
            continue
        for motif, libelle in MOTIFS_INTERDITS_EXPORT:
            if motif.search(contenu):
                problemes.append(f"{chemin} : {libelle}")
    ext = fichiers.get(".paperclip.yaml")
    if isinstance(ext, str):
        donnees = charger_yaml_sur(ext) or {}
        for slug, a in (donnees.get("agents") or {}).items():
            env_cfg = (((a or {}).get("adapter") or {}).get("config") or {}).get("env")
            if env_cfg:
                problemes.append(f".paperclip.yaml : agents.{slug}.adapter.config.env présent en clair")
            for cle, decl in (((a or {}).get("inputs") or {}).get("env") or {}).items():
                if decl.get("kind") == "secret" and decl.get("default"):
                    problemes.append(f".paperclip.yaml : valeur de secret {slug}.{cle} exportée")
    return problemes


FICHIER_MANIFESTE_EXPORT = "manifeste-export.json"
RE_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def empreinte_manifeste(fichiers: dict[str, str]) -> str:
    """Empreinte globale : SHA-256 des lignes « chemin:empreinte » triées."""
    return hashlib.sha256("\n".join(f"{c}:{h}" for c, h in sorted(fichiers.items())).encode("utf-8")).hexdigest()


def ecrire_manifeste_export(sortie: Path, company_id: str, contenus: dict[str, bytes]) -> dict:
    """Manifeste de l'export (entreprise, date, empreinte de chaque fichier) : aucune donnée personnelle.
    « purger » ne s'appuie que sur lui pour reconnaître un export récent et intact."""
    fichiers = {c: hashlib.sha256(v).hexdigest() for c, v in contenus.items()}
    manifeste = {
        "version": 1, "entrepriseId": company_id,
        "exporteLe": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fichiers": fichiers, "empreinte": empreinte_manifeste(fichiers),
    }
    (sortie / FICHIER_MANIFESTE_EXPORT).write_text(json.dumps(manifeste, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifeste


DOSSIER_DONNEES_PLUGIN = "donnees-plugin"


def appel_export_plugin(api: Api, company_id: str, **corps) -> dict:
    return api.appel("POST", f"/plugins/{PLUGIN_CLE}/api/donnees/export", {"companyId": company_id, **corps}) or {}


def exporter_donnees_plugin(api: Api, company_id: str) -> dict[str, bytes]:
    """Lit par la route « donnees.exporter » (humain seulement) toutes les tables du plugin pour cette entreprise,
    par pages, et rend {« donnees-plugin/<table>.json » : octets}. Les colonnes chiffrées restent chiffrées.
    Échoue si une table change pendant la lecture : mieux vaut aucun export qu'un export incomplet."""
    comptes = appel_export_plugin(api, company_id).get("tables")
    if not isinstance(comptes, dict) or not comptes:
        raise ErreurAtelier("la route donnees.exporter du plugin n'a rendu aucune table : export refusé, rien n'a été écrit")
    contenus: dict[str, bytes] = {}
    for table in sorted(comptes):
        lignes: list = []
        decalage: int | None = 0
        while decalage is not None:
            page = appel_export_plugin(api, company_id, table=table, decalage=decalage)
            recues = page.get("lignes")
            if not isinstance(recues, list):
                raise ErreurAtelier(f"réponse d'export illisible pour la table {table} : export refusé, rien n'a été écrit")
            lignes += recues
            suivant = page.get("suivant")
            if suivant is not None and (not isinstance(suivant, int) or suivant <= decalage):
                raise ErreurAtelier(f"pagination incohérente pour la table {table} : export refusé, rien n'a été écrit")
            decalage = suivant
        if len(lignes) != comptes[table]:
            raise ErreurAtelier(f"la table {table} a changé pendant l'export ({len(lignes)} ligne(s) lues sur {comptes[table]}) : "
                                "relancez l'export, rien n'a été écrit")
        contenus[f"{DOSSIER_DONNEES_PLUGIN}/{table}.json"] = (
            json.dumps(lignes, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    return contenus


def cmd_exporter(args) -> int:
    reg_agents, reg_orga = registres()
    api = Api(url_api())
    if args.entreprise:
        cible = args.entreprise.strip().lower()
        if not RE_UUID.fullmatch(cible):
            raise ErreurAtelier("--entreprise doit être un UUID d'entreprise valide")
        e = next((c for c in api.get("/companies") if c.get("id") == cible), None)
        if not e:
            raise ErreurAtelier(f"entreprise {cible} introuvable : rien n'est exporté")
        sortie = (Path(args.sortie) if args.sortie
                  else INSTANCE / "exports" / cible / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")).resolve()
    else:
        if not args.sortie:
            raise ErreurAtelier("--sortie est obligatoire sans --entreprise")
        e = trouver_entreprise(api, reg_orga)
        if not e:
            raise ErreurAtelier("aucune organisation de démonstration à exporter")
        sortie = Path(args.sortie).resolve()
    if sortie.exists() and any(sortie.iterdir()):
        raise ErreurAtelier(f"le dossier de sortie n'est pas vide : {sortie}")
    resultat = api.appel("POST", f"/companies/{e['id']}/exports", {
        "include": {"company": True, "agents": True, "projects": True, "issues": True, "skills": True},
        # Hors export : le Gardien des connexions (chemins absolus propres à la machine).
        "agents": [a["slug"] for a in reg_agents["agents"]],
        "expandReferencedSkills": True,
    })
    fichiers = resultat.get("files") or {}
    for w in resultat.get("warnings") or []:
        print(f"avertissement Paperclip : {w}")
    retraits = []
    if isinstance(fichiers.get(".paperclip.yaml"), str):
        fichiers[".paperclip.yaml"], retraits = nettoyer_extension_export(fichiers[".paperclip.yaml"])
    for r in retraits:
        print(f"nettoyé : {r}")
    problemes = controler_export(fichiers)
    # Les fichiers binaires (organigramme PNG généré par Paperclip) ne sont pas contrôlables
    # par motif : ils sont exclus de l'export plutôt qu'écrits sans contrôle.
    for chemin in [c for c, v in fichiers.items() if not isinstance(v, str)]:
        print(f"exclu (binaire non contrôlé) : {chemin}")
        del fichiers[chemin]
    if problemes:
        for p in problemes:
            print(f"PROBLÈME : {p}", file=sys.stderr)
        print("Export refusé : rien n'a été écrit.", file=sys.stderr)
        return 1
    # Données du plugin (seulement avec --entreprise : l'export de la démonstration n'en a pas besoin).
    donnees_plugin = exporter_donnees_plugin(api, e["id"]) if args.entreprise else {}
    sortie.mkdir(parents=True, exist_ok=True)
    ecrits: dict[str, bytes] = {}
    for chemin, contenu in fichiers.items():
        cible = (sortie / chemin).resolve()
        if not str(cible).startswith(str(sortie) + os.sep):
            raise ErreurAtelier(f"chemin d'export hors du dossier : {chemin}")
        cible.parent.mkdir(parents=True, exist_ok=True)
        octets = contenu.encode("utf-8") if isinstance(contenu, str) else base64.b64decode(contenu["data"])
        cible.write_bytes(octets)
        ecrits[chemin] = octets
    for chemin, octets in donnees_plugin.items():
        cible = sortie / chemin
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_bytes(octets)
        ecrits[chemin] = octets
    print(f"{len(fichiers)} fichier(s) exporté(s) dans {sortie}")
    if donnees_plugin:
        lignes_plugin = sum(len(json.loads(o)) for o in donnees_plugin.values())
        print(f"Données du plugin : {lignes_plugin} ligne(s) dans {len(donnees_plugin)} table(s), écrites dans {DOSSIER_DONNEES_PLUGIN}/ (colonnes chiffrées non déchiffrées)")
    manifeste = ecrire_manifeste_export(sortie, e["id"], ecrits)
    print(f"Manifeste de l'export : {FICHIER_MANIFESTE_EXPORT} (empreinte {manifeste['empreinte'][:16]}…)")
    # Aperçu d'import du paquet exporté (aucune écriture).
    textes = {k: v for k, v in fichiers.items() if isinstance(v, str)}
    apercu = api.appel("POST", "/companies/import/preview", {
        "source": {"type": "inline", "files": textes, "expectedFileCount": len(textes)},
        "include": {"company": True, "agents": True, "projects": True, "issues": True, "skills": True},
        "target": {"mode": "new_company", "newCompanyName": "Aperçu d'import (non créé)"},
        "collisionStrategy": "rename",
    })
    plan = apercu.get("plan") or {}
    print(
        "Aperçu d'import du paquet exporté : "
        f"{len(plan.get('agentPlans') or [])} agent(s), {len(plan.get('projectPlans') or [])} projet(s), "
        f"{len(plan.get('issuePlans') or [])} tâche(s), {len((apercu.get('manifest') or {}).get('skills') or [])} compétence(s), "
        f"erreurs : {len(apercu.get('errors') or [])}"
    )
    for err in apercu.get("errors") or []:
        print(f"ERREUR d'aperçu : {err}", file=sys.stderr)
    print("Contrôle de l'export : aucun secret, aucune variable d'environnement en clair, aucun chemin local absolu.")
    return 1 if apercu.get("errors") else 0


def cmd_reinitialiser(args) -> int:
    with verrou_ecriture("reinitialiser"):
        return _reinitialiser(args)


def _reinitialiser(args) -> int:
    reg_agents, reg_orga = registres()
    nom = reg_orga["entreprise"]["nom"]
    if args.confirmer != nom:
        raise ErreurAtelier(f'confirmation requise : --confirmer "{nom}"')
    api = Api(url_api())
    e = trouver_entreprise(api, reg_orga)
    if e:
        # Défaut amont (v2026.1012.0, server/src/services/companies.ts) : la suppression
        # efface « goals » avant « projects » alors que projects.goal_id référence goals
        # sans ON DELETE ; toute la transaction échoue (HTTP 500) dès qu'un projet est lié à
        # un objectif. On délie donc projets et objectifs avant de supprimer.
        for projet in api.get(f"/companies/{e['id']}/projects"):
            if projet.get("goalIds") or projet.get("goalId"):
                api.appel("PATCH", f"/projects/{projet['id']}", {"goalIds": []})
        api.appel("DELETE", f"/companies/{e['id']}")
        if trouver_entreprise(api, reg_orga) is not None:
            raise ErreurAtelier("l'entreprise existe encore après suppression")
        print(f"Entreprise supprimée : {e['id']}")
        # Paperclip ne supprime pas ses fichiers disque avec l'entreprise (instructions et
        # synchronisation de fichiers des agents) : on les retire, pour cette entreprise seule.
        print(f"Fichiers de l'entreprise : {supprimer_fichiers_entreprise(e['id'])}")
    else:
        print("Aucune entreprise de démonstration à supprimer.")
    if e:
        # Dossiers de CETTE entreprise seulement (ceux que « appliquer » a créés). Les anciens dossiers
        # partagés par rôle (disposition d'avant le cloisonnement) ne sont jamais touchés.
        for racine in (ESPACES, CONFIGS_CLAUDE):
            d = racine / e["id"]
            if RE_UUID.fullmatch(e["id"]) and d.is_dir() and not d.is_symlink() and d.parent == racine:
                shutil.rmtree(d)
    if ETAT_LOCAL.is_dir() and ETAT_LOCAL.parent == INSTANCE:
        shutil.rmtree(ETAT_LOCAL)
    print("Dossiers locaux de la démonstration supprimés (espaces, configurations Claude dédiées, état).")
    return 0


def cmd_jeton(args) -> int:
    if not args.confirmer:
        raise ErreurAtelier("ajoutez --confirmer : le jeton sera rangé comme secret et lié aux agents")
    reg_agents, reg_orga = registres()
    api = Api(url_api())
    e = trouver_entreprise(api, reg_orga)
    if not e:
        raise ErreurAtelier("lancez d'abord « appliquer »")
    valeur = sys.stdin.readline().strip() if not sys.stdin.isatty() else getpass.getpass("Jeton (non affiché) : ").strip()
    if not valeur:
        raise ErreurAtelier("jeton vide")
    cid = e["id"]
    existant = secret_jeton(api, cid)
    if existant:
        api.appel("POST", f"/secrets/{existant['id']}/rotate", {"value": valeur})
        secret_id = existant["id"]
        print("Secret existant renouvelé (nouvelle version).")
    else:
        s = api.appel("POST", f"/companies/{cid}/secrets", {
            "name": "Jeton Claude Code (claude setup-token)",
            "key": CLE_SECRET_JETON,
            "value": valeur,
            "description": "Jeton OAuth longue durée de l'abonnement de l'opérateur. Usage personnel uniquement.",
        })
        secret_id = s["id"]
        print("Secret créé dans le coffre de Paperclip.")
    del valeur
    etat = lire_json(ETAT_LOCAL / "etat-bootstrap.json") if (ETAT_LOCAL / "etat-bootstrap.json").exists() else {}
    mode = etat.get("mode", "reel")
    if mode != "reel":
        print("Mode démonstration actif : le secret est rangé ; il sera lié aux agents au passage en mode réel.")
        return 0
    empreinte = etat.get("empreintePaquet") or ""
    n = lier_agents(api, cid, reg_agents, empreinte, secret_id, mode)
    print(f"Secret lié à {n} agent(s) par référence (secret_ref). Les agents restent en pause.")
    return 0


def cmd_test_reel(args) -> int:
    """Test réel minimal de l'adaptateur claude_local : sonde native de Paperclip
    (« Respond with hello. », POST /companies/:id/adapters/claude_local/test-environment).

    Sans --confirmer : n'envoie rien, affiche la requête qui serait faite (sans secret).
    Avec --confirmer : UN appel de modèle réel, facturé sur le jeton rangé (abonnement de l'opérateur).
    """
    reg_agents, reg_orga = registres()
    api = Api(url_api())
    e = trouver_entreprise(api, reg_orga)
    if not e:
        raise ErreurAtelier("lancez d'abord « appliquer »")
    agents = agents_par_slug(api, e["id"])
    if args.agent not in agents:
        raise ErreurAtelier(f"agent inconnu : {args.agent}")
    detail = detail_agent(api, agents[args.agent]["id"])
    if detail.get("adapterType") != "claude_local":
        raise ErreurAtelier("l'agent n'est pas en mode réel (claude_local) : lancez « appliquer --mode reel »")
    secret = secret_jeton(api, e["id"])
    corps = {"agentId": detail["id"], "adapterConfig": detail.get("adapterConfig") or {}}
    cfg = corps["adapterConfig"]
    print(f"Agent : {args.agent} ({detail['id']}), modèle {cfg.get('model')}, moteur {cfg.get('engine')}")
    print(f"Jeton rangé dans le coffre : {'oui' if secret else 'NON'} ; lié à l'agent : "
          f"{'oui' if (cfg.get('env') or {}).get(VARIABLE_JETON, {}).get('type') == 'secret_ref' else 'non'}")
    print(f"Requête : POST {api.base}/companies/{e['id']}/adapters/claude_local/test-environment "
          "(valeurs masquées restaurées côté serveur depuis l'agent enregistré)")
    if not args.confirmer:
        print("À blanc : rien n'a été envoyé. Ajoutez --confirmer pour lancer UN appel de modèle réel.")
        return 0
    if not secret:
        raise ErreurAtelier("aucun jeton rangé : lancez d'abord « jeton --confirmer »")
    resultat = api.appel("POST", f"/companies/{e['id']}/adapters/claude_local/test-environment", corps)
    print(json.dumps(resultat, ensure_ascii=False, indent=2)[:4000])
    return 0


# ---------------------------------------------------------------------------
# Clés de l'opérateur : preuves d'approbation (plugin) et signatures (passerelle)
# ---------------------------------------------------------------------------
# Deux paires Ed25519 (docs/contrats.md §14, docs/revue-securite-passerelle.md §6 et §6 bis) :
#  - approbation : le PLUGIN signe les preuves d'approbation, la passerelle les vérifie. La clé privée vit
#    SEULEMENT dans le coffre de secrets natif de Paperclip (jamais sur disque, jamais affichée) et est
#    référencée par la configuration du plugin (approbationClePrivee) ; la clé publique est écrite dans un
#    fichier 0600 lu par la passerelle (PASSERELLE_APPROBATION_CLE_PUBLIQUE_FICHIER) ;
#  - passerelle : la PASSERELLE signe l'enveloppe de chaque réponse d'outil, le plugin la vérifie. La clé
#    privée est un fichier 0600 hors dépôt (PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER) ; la clé publique est
#    dans la configuration du plugin (passerelleClesPubliques, une liste pour la rotation).
# Génération par « openssl » (OpenSSL 3, Ed25519), jamais de code cryptographique maison.
PLUGIN_CLE = "atelier.marketing-ia"
CLE_SECRET_APPROBATION = "atelier-approbation-cle-privee"
DOSSIER_CLES = INSTANCE / "cles"
FICHIER_SIGNATURE_PRIVEE = DOSSIER_CLES / "passerelle-signature.pem"
FICHIER_SIGNATURE_SUIVANTE = DOSSIER_CLES / "passerelle-signature.suivante.pem"
FICHIER_APPROBATION_PUBLIQUES = DOSSIER_CLES / "approbation-publiques.pub"
FICHIER_ETAT_CLES = DOSSIER_CLES / "etat-cles.json"
FICHIER_ENV_PASSERELLE = INSTANCE / "passerelle.env"
PREFIXE_SPKI_ED25519 = bytes.fromhex("302a300506032b6570032100")
MAX_CLES_PASSERELLE = 5  # maxItems de passerelleClesPubliques (manifeste du plugin)
DELAI_RETRAIT_JOURS = 7  # âge maximal d'une réponse signée ou d'une preuve : au-delà, l'ancienne clé ne sert plus


def _openssl(*args: str, entree: bytes | None = None) -> bytes:
    """Appelle openssl ; en cas d'échec, un message sans sortie (elle pourrait contenir de la clé)."""
    try:
        r = subprocess.run(["openssl", *args], input=entree, capture_output=True, check=False, timeout=30)
    except (OSError, subprocess.SubprocessError) as e:
        raise ErreurAtelier(f"openssl indisponible ({type(e).__name__}) : le paquet « openssl » (OpenSSL 3, version stable) est requis") from None
    if r.returncode != 0:
        raise ErreurAtelier(f"openssl {args[0]} a échoué (code {r.returncode}) : aucune clé n'a été écrite")
    return r.stdout


def _verifier_spki(publique_b64: str) -> str:
    try:
        der = base64.b64decode(publique_b64, validate=True)
    except ValueError:
        raise ErreurAtelier("clé publique illisible (base64 attendu)") from None
    if len(der) != 44 or not der.startswith(PREFIXE_SPKI_ED25519):
        raise ErreurAtelier("clé publique : une clé Ed25519 (SPKI DER, 44 octets) est attendue")
    return publique_b64


def empreinte_publique(publique_b64: str) -> str:
    """Empreinte courte (16 hexadécimaux), la même que celle du journal de démarrage de la passerelle."""
    return hashlib.sha256(base64.b64decode(publique_b64)).hexdigest()[:16]


def generer_paire() -> tuple[str, str]:
    """(clé privée PEM PKCS#8, clé publique SPKI DER en base64). La privée ne quitte jamais la mémoire du processus."""
    pem = _openssl("genpkey", "-algorithm", "ed25519")
    publique = base64.b64encode(_openssl("pkey", "-pubout", "-outform", "DER", entree=pem)).decode("ascii")
    return pem.decode("ascii"), _verifier_spki(publique)


def publique_depuis_fichier_prive(chemin: Path) -> str:
    return _verifier_spki(base64.b64encode(_openssl("pkey", "-in", str(chemin), "-pubout", "-outform", "DER")).decode("ascii"))


def ecrire_0600(chemin: Path, contenu: str) -> None:
    """Écriture atomique d'un fichier lisible par son seul propriétaire, dans un dossier 0700."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    if chemin.parent == DOSSIER_CLES:
        os.chmod(chemin.parent, 0o700)
    tmp = chemin.with_name(chemin.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(contenu)
        os.chmod(tmp, 0o600)
        os.replace(tmp, chemin)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def effacer_fichier_prive(chemin: Path) -> None:
    """Écrase puis supprime une clé privée qui ne sert plus (au mieux sur un disque à journal)."""
    if not chemin.exists():
        return
    with contextlib.suppress(OSError):
        with open(chemin, "r+b") as f:
            f.write(b"\0" * max(1, chemin.stat().st_size))
            f.flush()
            os.fsync(f.fileno())
    chemin.unlink()


def etat_cles_vide() -> dict:
    # « passerelle » : une seule clé de signature pour la passerelle (donc commune à toutes les entreprises).
    # « approbation » : une clé par entreprise (le secret natif est propre à l'entreprise), indexée par son identifiant.
    return {"version": 2, "passerelle": {"actif": None, "suivant": None, "anciens": []}, "approbation": {}}


def lire_etat_cles() -> dict:
    if not FICHIER_ETAT_CLES.exists():
        return etat_cles_vide()
    try:
        etat = json.loads(FICHIER_ETAT_CLES.read_text(encoding="utf-8"))
        if etat["version"] != 2 or not isinstance(etat["approbation"], dict) or "passerelle" not in etat:
            raise KeyError("version")
        return etat
    except (ValueError, KeyError):
        raise ErreurAtelier(f"{FICHIER_ETAT_CLES} illisible : ne le recréez pas à la main (voir docs/exploitation.md, perte des clés)") from None


def ecrire_etat_cles(etat: dict) -> None:
    ecrire_0600(FICHIER_ETAT_CLES, json.dumps(etat, ensure_ascii=False, indent=2) + "\n")


def section_approbation(etat: dict, cid: str) -> dict:
    return etat["approbation"].setdefault(cid, {"actif": None, "suivant": None, "anciens": []})


def lignes_publiques_approbation() -> list[str]:
    """Clés publiques d'approbation de toutes les entreprises, une par ligne (la passerelle les accepte toutes)."""
    if not FICHIER_APPROBATION_PUBLIQUES.exists():
        return []
    return [l.strip() for l in FICHIER_APPROBATION_PUBLIQUES.read_text(encoding="utf-8").splitlines() if l.strip()]


def ecrire_publiques_approbation(lignes: list[str]) -> None:
    ecrire_0600(FICHIER_APPROBATION_PUBLIQUES, "".join(f"{_verifier_spki(l)}\n" for l in lignes))


def ecrire_env_passerelle(actuel_signature: Path, publiques: Path) -> bool:
    """Renseigne les variables _FICHIER dans la configuration locale de la passerelle (non suivie) ;
    les autres lignes de ce fichier sont conservées. Renvoie True si le fichier a changé."""
    voulu = {
        "PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER": str(actuel_signature),
        "PASSERELLE_APPROBATION_CLE_PUBLIQUE_FICHIER": str(publiques),
    }
    lignes = FICHIER_ENV_PASSERELLE.read_text(encoding="utf-8").splitlines() if FICHIER_ENV_PASSERELLE.exists() else [
        "# Configuration locale de la passerelle marketing (non suivie par git, 0600).",
        "# À charger avant « npm start » : set -a; source <ce fichier>; set +a",
    ]
    restantes = [l for l in lignes if l.split("=", 1)[0] not in voulu]
    nouveau = "\n".join(restantes + [f"{k}={v}" for k, v in voulu.items()]) + "\n"
    ancien = FICHIER_ENV_PASSERELLE.read_text(encoding="utf-8") if FICHIER_ENV_PASSERELLE.exists() else None
    if ancien == nouveau and (FICHIER_ENV_PASSERELLE.stat().st_mode & 0o077) == 0:
        return False
    ecrire_0600(FICHIER_ENV_PASSERELLE, nouveau)
    return True


def masquer(texte: str, *secrets: str) -> str:
    for s in secrets:
        if s:
            texte = texte.replace(s, "***")
    return texte


def entreprise_des_cles(api: Api, args) -> dict:
    if getattr(args, "entreprise", None):
        # Par la liste. Constaté le 15/10/2026 : juste après sa création, une entreprise n'apparaît pas tout de suite
        # (liste et lecture par identifiant répondent « introuvable » pendant quelques secondes) : quelques essais.
        for essai in range(6):
            e = next((c for c in api.get("/companies") if c.get("id") == args.entreprise), None)
            if e:
                return e
            time.sleep(2)
        raise ErreurAtelier(f"entreprise introuvable : {args.entreprise}")
    _, reg_orga = registres()
    e = trouver_entreprise(api, reg_orga)
    if not e:
        raise ErreurAtelier("aucune organisation de démonstration : lancez d'abord « appliquer », ou donnez --entreprise <identifiant>")
    return e


def config_plugin(api: Api, cid: str) -> dict:
    try:
        rep = api.get(f"/plugins/{PLUGIN_CLE}/config?companyId={cid}")
    except ErreurAtelier as e:
        if "HTTP 404" in str(e):
            raise ErreurAtelier(f"plugin {PLUGIN_CLE} introuvable : installez-le d'abord (scripts/preparer-plugin.sh puis installation depuis l'interface)") from None
        raise
    return dict((rep or {}).get("configJson") or {})


def ecrire_config_plugin(api: Api, cid: str, config: dict) -> None:
    api.appel("POST", f"/plugins/{PLUGIN_CLE}/config", {"companyId": cid, "configJson": config})


def secret_par_cle(api: Api, cid: str, cle: str):
    return next((s for s in api.get(f"/companies/{cid}/secrets") if s.get("key") == cle), None)


def creer_secret_approbation(api: Api, cid: str, cle: str, pem: str, libelle: str) -> str:
    try:
        s = api.appel("POST", f"/companies/{cid}/secrets", {
            "name": f"Clé privée d'approbation de l'atelier ({libelle})",
            "key": cle,
            "value": pem,
            "description": "Clé privée Ed25519 (PEM PKCS#8) qui signe les preuves d'approbation des diffusions réelles. Générée par « bootstrap-organisation.py cles » ; jamais stockée ailleurs.",
        })
    except ErreurAtelier as e:
        raise ErreurAtelier(masquer(str(e), pem)) from None
    return s["id"]


def fusionner_config(api: Api, cid: str, *, secret_id: str | None = None, publiques: list[str] | None = None) -> bool:
    """Met la configuration du plugin à jour sans toucher aux autres clés ; True si elle a été écrite."""
    actuelle = config_plugin(api, cid)
    voulue = dict(actuelle)
    if secret_id is not None:
        ref = actuelle.get("approbationClePrivee") or {}
        if not (isinstance(ref, dict) and ref.get("type") == "secret_ref" and ref.get("secretId") == secret_id):
            voulue["approbationClePrivee"] = {"type": "secret_ref", "secretId": secret_id}
    if publiques is not None:
        if len(publiques) > MAX_CLES_PASSERELLE:
            raise ErreurAtelier(f"{len(publiques)} clés publiques de la passerelle : le plugin en accepte {MAX_CLES_PASSERELLE} au plus (terminez la rotation par --retirer-anciennes)")
        voulue["passerelleClesPubliques"] = publiques
    if voulue == actuelle:
        return False
    ecrire_config_plugin(api, cid, voulue)
    return True


def cles_actuelles_plugin(api: Api, cid: str) -> list[str]:
    liste = config_plugin(api, cid).get("passerelleClesPubliques")
    return [c for c in liste if isinstance(c, str)] if isinstance(liste, list) else []


def entreprises_suivies(etat: dict, cid: str) -> list[str]:
    """Entreprises dont la configuration de plugin porte les clés publiques de la passerelle : celle visée plus
    toutes celles déjà configurées par cette commande (la clé de la passerelle est commune)."""
    return list(dict.fromkeys([cid, *etat["approbation"]]))


def afficher_etat_cles(api: Api, cid: str, etat: dict) -> None:
    """À blanc : lit seulement, n'écrit rien."""
    print("Clés de l'opérateur (à blanc : rien n'est écrit ; ajoutez --confirmer pour agir).")
    a, p = etat["approbation"].get(cid) or {"actif": None, "suivant": None, "anciens": []}, etat["passerelle"]
    cfg = config_plugin(api, cid)
    ref = cfg.get("approbationClePrivee") or {}
    print(f"  approbation : clé active {a['actif']['empreinte'] if a['actif'] else 'ABSENTE'} ; "
          f"secret natif {'référencé' if isinstance(ref, dict) and ref.get('type') == 'secret_ref' else 'NON référencé'} par la configuration du plugin ; "
          f"clés publiques du fichier : {len(lignes_publiques_approbation())} ; suivante : {a['suivant']['empreinte'] if a['suivant'] else 'aucune'} ; anciennes : {len(a['anciens'])}")
    print(f"  passerelle  : clé active {p['actif']['empreinte'] if p['actif'] else 'ABSENTE'} ; fichier privé "
          f"{'présent' if FICHIER_SIGNATURE_PRIVEE.exists() else 'ABSENT'} ; clés publiques dans le plugin : {len(cles_actuelles_plugin(api, cid))} ; "
          f"suivante : {p['suivant']['empreinte'] if p['suivant'] else 'aucune'} ; anciennes : {len(p['anciens'])}")
    print(f"  configuration locale de la passerelle : {FICHIER_ENV_PASSERELLE} ({'présente' if FICHIER_ENV_PASSERELLE.exists() else 'ABSENTE'})")


def cles_initialiser(api: Api, cid: str, etat: dict, faits: list[str]) -> None:
    """Crée ce qui manque ; ne touche à rien de ce qui existe et est cohérent (idempotent)."""
    a, p = section_approbation(etat, cid), etat["passerelle"]
    # --- approbation (plugin) -------------------------------------------------
    if a["actif"] is None:
        existant = secret_par_cle(api, cid, CLE_SECRET_APPROBATION)
        if existant:
            raise ErreurAtelier(
                f"un secret « {CLE_SECRET_APPROBATION} » existe déjà dans cette entreprise sans état local : la clé privée ne se relit pas, "
                "la clé publique ne peut donc pas être retrouvée. Supprimez ce secret dans l'interface (Paramètres, Secrets) puis relancez, "
                "ou voyez docs/exploitation.md (perte des clés)."
            )
        pem, publique = generer_paire()
        secret_id = creer_secret_approbation(api, cid, CLE_SECRET_APPROBATION, pem, "active")
        del pem
        faits.append(f"secret natif « {CLE_SECRET_APPROBATION} » créé (clé privée d'approbation, jamais écrite sur disque)")
        ecrire_publiques_approbation(lignes_publiques_approbation() + [publique])
        a["actif"] = {"secretId": secret_id, "empreinte": empreinte_publique(publique), "publique": publique}
        ecrire_etat_cles(etat)
        faits.append(f"clé publique d'approbation ajoutée : {FICHIER_APPROBATION_PUBLIQUES} (0600)")
    elif a["actif"]["publique"] not in lignes_publiques_approbation():
        raise ErreurAtelier(f"{FICHIER_APPROBATION_PUBLIQUES} ne contient plus la clé d'approbation de cette entreprise : « cles --confirmer --rotation approbation » (docs/exploitation.md)")
    # --- passerelle (signature des réponses) -------------------------------------
    if p["actif"] is None:
        if FICHIER_SIGNATURE_PRIVEE.exists():
            publique = publique_depuis_fichier_prive(FICHIER_SIGNATURE_PRIVEE)
            faits.append("clé de signature de la passerelle existante adoptée")
        else:
            pem, publique = generer_paire()
            ecrire_0600(FICHIER_SIGNATURE_PRIVEE, pem)
            del pem
            faits.append(f"clé de signature de la passerelle écrite : {FICHIER_SIGNATURE_PRIVEE} (0600)")
        p["actif"] = {"empreinte": empreinte_publique(publique), "publique": publique}
        ecrire_etat_cles(etat)
    elif not FICHIER_SIGNATURE_PRIVEE.exists():
        raise ErreurAtelier(f"{FICHIER_SIGNATURE_PRIVEE} a disparu : « cles --confirmer --rotation passerelle » crée une nouvelle clé (docs/exploitation.md, perte des clés)")
    elif publique_depuis_fichier_prive(FICHIER_SIGNATURE_PRIVEE) != p["actif"]["publique"]:
        raise ErreurAtelier(f"{FICHIER_SIGNATURE_PRIVEE} ne correspond plus à la clé enregistrée : fichier remplacé ? Rien n'est modifié.")
    if (FICHIER_SIGNATURE_PRIVEE.stat().st_mode & 0o077) != 0:
        os.chmod(FICHIER_SIGNATURE_PRIVEE, 0o600)
        faits.append(f"droits de {FICHIER_SIGNATURE_PRIVEE} ramenés à 0600")
    # --- configuration du plugin et de la passerelle ------------------------------
    publiques = list(cles_actuelles_plugin(api, cid))
    for cle in [p["actif"]["publique"]] + ([p["suivant"]["publique"]] if p["suivant"] else []):
        if cle not in publiques:
            publiques.append(cle)
    if fusionner_config(api, cid, secret_id=a["actif"]["secretId"], publiques=publiques):
        faits.append("configuration du plugin renseignée (approbationClePrivee, passerelleClesPubliques)")
    if ecrire_env_passerelle(FICHIER_SIGNATURE_PRIVEE, FICHIER_APPROBATION_PUBLIQUES):
        faits.append(f"configuration locale de la passerelle écrite : {FICHIER_ENV_PASSERELLE} (0600)")


def cles_rotation(api: Api, cid: str, etat: dict, quoi: str, faits: list[str]) -> None:
    """Phase 1 : la nouvelle clé publique est AJOUTÉE à côté de l'ancienne ; rien n'est encore retiré."""
    section = etat["passerelle"] if quoi == "passerelle" else section_approbation(etat, cid)
    if section["actif"] is None:
        raise ErreurAtelier("aucune clé active : lancez d'abord « cles --confirmer »")
    if section["suivant"]:
        raise ErreurAtelier(f"une rotation est déjà préparée (clé suivante {section['suivant']['empreinte']}) : terminez-la par --basculer {quoi}")
    pem, publique = generer_paire()
    empreinte = empreinte_publique(publique)
    if quoi == "passerelle":
        ecrire_0600(FICHIER_SIGNATURE_SUIVANTE, pem)
        del pem
        section["suivant"] = {"empreinte": empreinte, "publique": publique}
        ecrire_etat_cles(etat)
        for e in entreprises_suivies(etat, cid):
            fusionner_config(api, e, publiques=[*cles_actuelles_plugin(api, e), publique])
        faits.append(f"nouvelle clé de signature {empreinte} préparée ({FICHIER_SIGNATURE_SUIVANTE}) ; sa clé publique est ajoutée au plugin à côté de l'ancienne")
    else:
        secret_id = creer_secret_approbation(api, cid, f"{CLE_SECRET_APPROBATION}-{empreinte[:8]}", pem, f"suivante {empreinte[:8]}")
        del pem
        ecrire_publiques_approbation(lignes_publiques_approbation() + [publique])
        section["suivant"] = {"secretId": secret_id, "empreinte": empreinte, "publique": publique}
        ecrire_etat_cles(etat)
        faits.append(f"nouvelle clé d'approbation {empreinte} créée (secret natif, pas encore utilisée) ; sa clé publique est ajoutée au fichier de la passerelle à côté de l'ancienne")


def cles_basculer(api: Api, cid: str, etat: dict, quoi: str, faits: list[str]) -> None:
    """Phase 2 : le signataire passe à la nouvelle clé ; l'ancienne reste vérifiable jusqu'au retrait."""
    section = etat["passerelle"] if quoi == "passerelle" else section_approbation(etat, cid)
    if not section["suivant"]:
        raise ErreurAtelier(f"aucune rotation préparée pour {quoi} : « cles --confirmer --rotation {quoi} » d'abord")
    suivant = section["suivant"]
    if quoi == "passerelle":
        if not FICHIER_SIGNATURE_SUIVANTE.exists():
            raise ErreurAtelier(f"{FICHIER_SIGNATURE_SUIVANTE} introuvable : rotation à refaire")
        if publique_depuis_fichier_prive(FICHIER_SIGNATURE_SUIVANTE) != suivant["publique"]:
            raise ErreurAtelier(f"{FICHIER_SIGNATURE_SUIVANTE} ne correspond pas à la clé préparée : rien n'est modifié")
        os.replace(FICHIER_SIGNATURE_SUIVANTE, FICHIER_SIGNATURE_PRIVEE)
        os.chmod(FICHIER_SIGNATURE_PRIVEE, 0o600)
    else:
        if suivant["publique"] not in lignes_publiques_approbation():
            raise ErreurAtelier("la nouvelle clé publique n'est plus dans le fichier de la passerelle : rotation à refaire")
        fusionner_config(api, cid, secret_id=suivant["secretId"])
    section["anciens"].append(section["actif"])
    section["actif"], section["suivant"] = suivant, None
    ecrire_etat_cles(etat)
    faits.append(f"signataire basculé sur la clé {suivant['empreinte']} ({quoi}) ; l'ancienne reste vérifiable {DELAI_RETRAIT_JOURS} jours, puis « cles --confirmer --retirer-anciennes »")


def cles_retirer_anciennes(api: Api, cid: str, etat: dict, faits: list[str]) -> None:
    """Phase 3 : les anciennes clés publiques (et le secret de l'ancienne clé d'approbation) sont retirés."""
    p, a = etat["passerelle"], section_approbation(etat, cid)
    if p["anciens"]:
        gardees = [p["actif"]["publique"]] + ([p["suivant"]["publique"]] if p["suivant"] else [])
        anciennes = {x["publique"] for x in p["anciens"]}
        for e in entreprises_suivies(etat, cid):
            # Une clé du plugin inconnue de l'état (ajoutée à la main) n'est pas retirée.
            fusionner_config(api, e, publiques=[c for c in cles_actuelles_plugin(api, e) if c not in anciennes or c in gardees])
        faits.append(f"{len(p['anciens'])} ancienne(s) clé(s) publique(s) de la passerelle retirée(s) du plugin")
        p["anciens"] = []
        ecrire_etat_cles(etat)
    if a["anciens"]:
        anciennes = {x["publique"] for x in a["anciens"]}
        ecrire_publiques_approbation([l for l in lignes_publiques_approbation() if l not in anciennes])
        for ancien in a["anciens"]:
            if ancien.get("secretId"):
                try:
                    api.appel("DELETE", f"/secrets/{ancien['secretId']}")
                except ErreurAtelier as e:
                    if "HTTP 404" not in str(e):
                        raise
        faits.append(f"{len(a['anciens'])} ancienne(s) clé(s) d'approbation retirée(s) (fichier public et secret natif)")
        a["anciens"] = []
        ecrire_etat_cles(etat)
    if not faits:
        faits.append("aucune ancienne clé à retirer")


def cmd_cles(args) -> int:
    api = Api(url_api())
    e = entreprise_des_cles(api, args)
    cid = e["id"]
    etat = lire_etat_cles()
    if not args.confirmer:
        afficher_etat_cles(api, cid, etat)
        return 0
    faits: list[str] = []
    with verrou_ecriture("cles"):
        etat = lire_etat_cles()
        if args.rotation:
            cles_rotation(api, cid, etat, args.rotation, faits)
        elif args.basculer:
            cles_basculer(api, cid, etat, args.basculer, faits)
        elif args.retirer_anciennes:
            cles_retirer_anciennes(api, cid, etat, faits)
        else:
            cles_initialiser(api, cid, etat, faits)
    etat = lire_etat_cles()
    for f in faits:
        print(f"  fait : {f}")
    if not faits:
        print("Rien à faire : les clés, la configuration du plugin et celle de la passerelle sont déjà en place.")
    a, p = etat["approbation"].get(cid) or {"actif": None}, etat["passerelle"]
    if a["actif"]:
        print(f"Clé d'approbation active : {a['actif']['empreinte']} (secret natif {a['actif']['secretId']})")
    if p["actif"]:
        print(f"Clé de signature de la passerelle active : {p['actif']['empreinte']}")
    print(f"Configuration locale de la passerelle : {FICHIER_ENV_PASSERELLE}")
    redemarrer = bool(faits) and (
        args.rotation == "approbation" or args.basculer == "passerelle"
        or not (args.rotation or args.basculer or args.retirer_anciennes)
        or (args.retirer_anciennes and any("approbation" in f for f in faits))
    )
    if redemarrer:
        print("Redémarrez la passerelle pour qu'elle relise ses clés : set -a; source <ce fichier>; set +a; npm start (dans passerelle/).")
    return 0


# ---------------------------------------------------------------------------
# Nouveau client : entreprise créée à partir d'une fiche, sans intervention du développeur
# ---------------------------------------------------------------------------

PREFIXE_MARQUEUR_CLIENT = "atelier-client:"
PREFIXE_MARQUEUR_DEMO = "atelier-demo:"
LANGUES_CLIENT = ("FR", "NL", "EN")
MODULE_ASSURANCE = "intermediaire_assurance"
CODE_REFERENTIEL = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")


LONGUEUR_NOM_MAX = 120
LONGUEUR_TON_MAX, LONGUEUR_DESCRIPTION_MAX = 500, 1000
NOMBRE_ZONES_MAX, LONGUEUR_ZONE_MAX = 50, 120
NOMBRE_NACE_MAX, LONGUEUR_NACE_MAX = 50, 20


def texte_sain(valeur, maxi: int, multiligne: bool = False, non_vide: bool = False) -> bool:
    """Chaîne de `maxi` caractères au plus, sans caractère de contrôle ni séparateur de ligne Unicode ;
    `multiligne` tolère le saut de ligne et la tabulation (textes libres seulement)."""
    if not isinstance(valeur, str) or len(valeur) > maxi or (non_vide and not valeur.strip()):
        return False
    for c in valeur:
        cat = unicodedata.category(c)
        if cat in ("Zl", "Zp") or (cat[0] == "C" and not (multiligne and c in "\n\t")):
            return False
    return True


def liste_textes_saine(valeur, nombre_max: int, longueur_max: int) -> bool:
    return (isinstance(valeur, list) and len(valeur) <= nombre_max
            and all(texte_sain(x, longueur_max, non_vide=True) for x in valeur))


def normaliser_bce(numero) -> str:
    """Numéro BCE réduit à ses chiffres (points, espaces et préfixe « BE » ôtés), pour comparer deux écritures."""
    return re.sub(r"[\s.]", "", re.sub(r"^BE", "", str(numero).strip().upper()))


def bce_valide(numero: str) -> bool:
    """Même contrôle que bceValide (plugin-atelier/src/serveur/regles-prospection.ts) : 10 chiffres commençant
    par 0 ou 1 (points, espaces et préfixe « BE » tolérés), les 2 derniers valant 97 - (8 premiers mod 97)."""
    brut = re.sub(r"[\s.]", "", re.sub(r"^BE", "", str(numero).strip().upper()))
    if not re.fullmatch(r"[01]\d{9}", brut):
        return False
    return int(brut[8:]) == 97 - (int(brut[:8]) % 97)


def fsma_valide(numero: str, mode: str) -> bool:
    """Numéro FSMA de 5 ou 6 chiffres ; les codes de démonstration « LETTRES-chiffres » (DEMO-0001) ne sont
    admis qu'en mode démonstration (formes reconnues par plugin-atelier/src/serveur/services-faits.ts)."""
    n = str(numero).strip()
    if re.fullmatch(r"\d{5,6}", n):
        return True
    return mode == "demonstration" and re.fullmatch(r"[A-Z]{2,8}-\d{2,8}", n) is not None


def lire_fiche(chemin: Path) -> dict:
    if not chemin.is_file():
        raise ErreurAtelier(f"fiche introuvable : {chemin}")
    texte = chemin.read_text(encoding="utf-8")
    try:
        if chemin.suffix.lower() in (".yaml", ".yml"):
            fiche = charger_yaml_sur(texte)
        elif chemin.suffix.lower() == ".json":
            fiche = json.loads(texte)
        else:
            raise ErreurAtelier(f"fiche {chemin.name} : extension .yaml, .yml ou .json attendue")
    except ErreurAtelier:
        raise
    except Exception as e:  # noqa: BLE001 : toute erreur de lecture devient un refus lisible
        raise ErreurAtelier(f"fiche illisible ({chemin.name}) : {e}") from None
    if not isinstance(fiche, dict):
        raise ErreurAtelier("la fiche doit être un objet (clés et valeurs)")
    return fiche


def _liste_codes(fiche: dict, cle: str, erreurs: list[str]) -> list[dict]:
    liste = fiche.get(cle, [])
    if not isinstance(liste, list) or not all(isinstance(x, dict) for x in liste):
        erreurs.append(f"« {cle} » doit être une liste d'objets")
        return []
    return liste


def valider_fiche(fiche: dict, reel: bool) -> dict:
    """Contrôle la fiche et rend la fiche normalisée (slug, mode, langues). Toutes les erreurs sont
    rassemblées dans un seul refus ; rien n'est écrit tant que la fiche n'est pas valide."""
    erreurs: list[str] = []
    nom = fiche.get("nomCommercial")
    if not isinstance(nom, str) or not nom.strip():
        erreurs.append("nomCommercial : texte non vide attendu")
        nom = ""
    nom = unicodedata.normalize("NFC", nom.strip())
    if nom and not texte_sain(nom, LONGUEUR_NOM_MAX):
        erreurs.append(f"nomCommercial : {LONGUEUR_NOM_MAX} caractères au plus, sans saut de ligne ni caractère de contrôle")
    slug = normaliser_slug(unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode())
    if nom and len(slug) < 2:
        erreurs.append("nomCommercial : impossible d'en tirer un identifiant (slug) lisible")
    if len(slug) > 40:
        slug = slug[:40].rstrip("-")
    mode = fiche.get("mode") or ("reel" if reel else "demonstration")
    if mode not in MODES:
        erreurs.append(f"mode : « demonstration » ou « reel » attendu (reçu : {mode!r})")
    elif mode == "reel" and not reel:
        erreurs.append("mode « reel » : refusé sans l'option --reel (le défaut est la démonstration)")
    elif reel and mode != "reel":
        erreurs.append("option --reel donnée alors que la fiche demande la démonstration : corrigez l'un des deux")
    bce = fiche.get("numeroBce")
    if not isinstance(bce, str) or not bce_valide(bce):
        erreurs.append(f"numeroBce : numéro BCE invalide (10 chiffres, contrôle modulo 97) : {bce!r}")
    courtier = fiche.get("courtier", False)
    if not isinstance(courtier, bool):
        erreurs.append("courtier : true ou false attendu")
        courtier = False
    fsma = fiche.get("numeroFsma")
    if fsma is not None and (not isinstance(fsma, str) or not fsma_valide(fsma, mode)):
        erreurs.append(f"numeroFsma : 5 ou 6 chiffres attendus (codes de démonstration seulement en mode démonstration) : {fsma!r}")
    elif courtier and fsma is None:
        erreurs.append("numeroFsma : obligatoire pour un courtier (courtier = true)")
    langues = fiche.get("langues")
    if not isinstance(langues, list) or not langues or any(l not in LANGUES_CLIENT for l in langues) or len(set(langues)) != len(langues):
        erreurs.append(f"langues : liste non vide parmi {', '.join(LANGUES_CLIENT)}, sans doublon")
        langues = []
    budget = fiche.get("budgetIaMensuelCentimes")
    if isinstance(budget, bool) or not isinstance(budget, int) or budget < 0:
        erreurs.append("budgetIaMensuelCentimes : entier de centimes, zéro ou plus")
        budget = 0
    ton = fiche.get("ton")
    if ton is not None and not texte_sain(ton, LONGUEUR_TON_MAX, multiligne=True):
        erreurs.append(f"ton : texte de {LONGUEUR_TON_MAX} caractères au plus, sans caractère de contrôle")
    zones = fiche.get("zones")
    if zones is not None and not liste_textes_saine(zones, NOMBRE_ZONES_MAX, LONGUEUR_ZONE_MAX):
        erreurs.append(f"zones : liste de {NOMBRE_ZONES_MAX} textes au plus ({LONGUEUR_ZONE_MAX} caractères, non vides, sans caractère de contrôle)")
    bureaux = _liste_codes(fiche, "bureaux", erreurs)
    segments = _liste_codes(fiche, "segmentsCibles", erreurs)
    offres = _liste_codes(fiche, "offres", erreurs)
    if not bureaux:
        erreurs.append("bureaux : au moins un bureau (nom, adresse) attendu")
    if not offres:
        erreurs.append("offres : au moins une offre attendue")
    codes_segments, codes_bureaux, codes_offres = set(), set(), set()
    for i, sg in enumerate(segments):
        c = sg.get("code")
        if not isinstance(c, str) or not CODE_REFERENTIEL.match(c) or c in codes_segments:
            erreurs.append(f"segmentsCibles[{i}].code : code unique (minuscules, chiffres, tirets) attendu")
        else:
            codes_segments.add(c)
        if not isinstance(sg.get("libelle"), str) or not sg["libelle"].strip():
            erreurs.append(f"segmentsCibles[{i}].libelle : texte attendu")
        if sg.get("type") not in ("profession", "secteur", "type_particulier"):
            erreurs.append(f"segmentsCibles[{i}].type : profession, secteur ou type_particulier")
        if sg.get("nace") is not None and not liste_textes_saine(sg["nace"], NOMBRE_NACE_MAX, LONGUEUR_NACE_MAX):
            erreurs.append(f"segmentsCibles[{i}].nace : liste de {NOMBRE_NACE_MAX} codes au plus ({LONGUEUR_NACE_MAX} caractères, non vides, sans caractère de contrôle)")
    for i, b in enumerate(bureaux):
        c = b.get("code") or normaliser_slug(unicodedata.normalize("NFKD", str(b.get("nom", ""))).encode("ascii", "ignore").decode())
        if not isinstance(b.get("nom"), str) or not b["nom"].strip():
            erreurs.append(f"bureaux[{i}].nom : texte attendu")
        if not isinstance(c, str) or not CODE_REFERENTIEL.match(c) or c in codes_bureaux:
            erreurs.append(f"bureaux[{i}] : code unique attendu (donnez « code » ou un nom plus distinct)")
        else:
            codes_bureaux.add(c)
        if not isinstance(b.get("adresse"), str) or not b["adresse"].strip():
            erreurs.append(f"bureaux[{i}].adresse : texte attendu")
        pos = b.get("position")
        if pos is not None and not (isinstance(pos, dict) and set(pos) == {"lat", "lon"}
                                    and all(isinstance(pos[k], (int, float)) and not isinstance(pos[k], bool) for k in pos)
                                    and -90 <= pos["lat"] <= 90 and -180 <= pos["lon"] <= 180):
            erreurs.append(f"bureaux[{i}].position : {{lat, lon}} valides ou absente")
        for sc in b.get("segmentsSuivis") or []:
            if sc not in codes_segments:
                erreurs.append(f"bureaux[{i}].segmentsSuivis : segment inconnu « {sc} »")
    for i, o in enumerate(offres):
        c = o.get("code")
        if not isinstance(c, str) or not CODE_REFERENTIEL.match(c) or c in codes_offres:
            erreurs.append(f"offres[{i}].code : code unique (minuscules, chiffres, tirets) attendu")
        else:
            codes_offres.add(c)
        if not isinstance(o.get("nom"), str) or not o["nom"].strip():
            erreurs.append(f"offres[{i}].nom : texte attendu")
        if o.get("description") is not None and not texte_sain(o["description"], LONGUEUR_DESCRIPTION_MAX, multiligne=True):
            erreurs.append(f"offres[{i}].description : texte de {LONGUEUR_DESCRIPTION_MAX} caractères au plus, sans caractère de contrôle")
        if o.get("cible", "les_deux") not in ("b2c", "b2b", "les_deux"):
            erreurs.append(f"offres[{i}].cible : b2c, b2b ou les_deux")
        for sc in o.get("segments") or []:
            if sc not in codes_segments:
                erreurs.append(f"offres[{i}].segments : segment inconnu « {sc} »")
    if erreurs:
        raise ErreurAtelier("fiche refusée, rien n'est écrit :\n  - " + "\n  - ".join(erreurs))
    return {**fiche, "nomCommercial": nom, "slug": slug, "mode": mode, "courtier": courtier,
            "numeroFsma": fsma, "langues": langues, "budgetIaMensuelCentimes": budget}


def organisation_client(reg_orga: dict, fiche: dict) -> dict:
    """Copie du registre d'organisation avec l'entreprise du client : nom, identifiant, marqueur
    « atelier-client:<slug> », description neutre (aucune donnée de démonstration) et objectifs génériques
    à partir des offres et des bureaux de la fiche. Agents, projets et routines restent ceux du registre."""
    marqueur = f"{PREFIXE_MARQUEUR_CLIENT}{fiche['slug']}"
    nom = fiche["nomCommercial"]
    copie = json.loads(json.dumps(reg_orga))
    copie["entreprise"] = {
        **reg_orga["entreprise"],
        "nom": nom,
        "slug": fiche["slug"],
        "marqueur": marqueur,
        "description": f"Entreprise cliente de l'Atelier Marketing IA ({fiche['mode']}). Marqueur de périmètre : {marqueur}.",
    }
    offres = ", ".join(o["nom"] for o in fiche["offres"])
    objectifs = {
        "OBJ-1": (f"Obtenir des demandes qualifiées pour : {offres}",
                  "Mesuré uniquement à partir de données réellement importées. Sans données : « non mesurable »."),
        "OBJ-2": (f"Rendre les {len(fiche['bureaux'])} bureau(x) visibles et cohérents en recherche locale et dans les réponses des moteurs d'IA",
                  "Informations identiques et vérifiées sur le site, les fiches et les contenus. Aucune promesse de classement."),
    }
    for o in copie["objectifs"]:
        if o["cle"] in objectifs:
            o["titre"], o["description"] = objectifs[o["cle"]]
    return copie


def company_md_client(reg_orga_client: dict) -> str:
    e = reg_orga_client["entreprise"]
    return avec_frontmatter(
        {
            "schema": "agentcompanies/v1",
            "kind": "company",
            "slug": e["slug"],
            "name": e["nom"],
            "description": e["description"],
            "version": reg_orga_client["version"],
            "goals": [f"{o['cle']} · {o['titre']}" for o in reg_orga_client["objectifs"]],
        },
        f"\n# {e['nom']}\n\nEntreprise cliente de l'Atelier Marketing IA, créée par "
        "`scripts/bootstrap-organisation.py nouveau-client` à partir d'une fiche. L'organisation des agents est celle du dépôt "
        "(`organisation/`).\n",
    )


def referentiel_client(fiche: dict) -> dict:
    """Corps de l'action atelier.marque.enregistrer (ReferentielSaisie) tiré de la fiche. Rien n'est affirmé au
    nom du client : offres et bureaux restent « non confirmés » jusqu'à sa validation."""
    nom, slug = fiche["nomCommercial"], fiche["slug"]
    code_entite = slug[:40]
    identifiants = [{"type": "bce", "libelle": None, "valeur": fiche["numeroBce"]}]
    mentions = f"{nom}, BCE {fiche['numeroBce']}"
    if fiche.get("numeroFsma"):
        identifiants.append({"type": "fsma", "libelle": None, "valeur": fiche["numeroFsma"]})
        mentions += f", FSMA {fiche['numeroFsma']}"
    manquantes = ["Ton de la marque à définir avec le client"] if not fiche.get("ton") else []
    manquantes.append("Offres, bureaux et arguments à faire confirmer par le client")
    modules = []
    if fiche["courtier"]:
        modules.append({"code": MODULE_ASSURANCE, "entites": [], "motsInterdits": [],
                        "activeLe": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                        "activePar": "bootstrap nouveau-client"})
    etablissements = []
    for b in fiche["bureaux"]:
        code = b.get("code") or normaliser_slug(unicodedata.normalize("NFKD", b["nom"]).encode("ascii", "ignore").decode())
        e = {"nom": b["nom"], "adresse": b["adresse"], "confirme": False, "code": code, "entites": [code_entite]}
        if b.get("position") is not None:
            e["position"] = {"lat": b["position"]["lat"], "lon": b["position"]["lon"]}
        if b.get("segmentsSuivis"):
            e["segmentsSuivis"] = list(b["segmentsSuivis"])
        etablissements.append(e)
    offres = []
    for o in fiche["offres"]:
        x = {"nom": o["nom"], "description": o.get("description") or "", "confirmee": False, "code": o["code"],
             "cible": o.get("cible", "les_deux"), "entite": code_entite}
        if o.get("segments"):
            x["segments"] = list(o["segments"])
        offres.append(x)
    segments = [{"code": sg["code"], "libelle": sg["libelle"], "type": sg["type"], "nace": list(sg.get("nace") or [])}
                for sg in fiche["segmentsCibles"]]
    return {
        "identite": f"{nom} (langues : {', '.join(fiche['langues'])})",
        "ton": fiche.get("ton") or "",
        "offres": offres,
        "zones": list(fiche.get("zones") or []),
        "etablissements": etablissements,
        "affirmationsAutorisees": [],
        "informationsManquantes": manquantes,
        "entites": [{"code": code_entite, "nom": nom, "type": "entite_juridique", "porteePar": None,
                     "identifiants": identifiants, "mentionsLegales": mentions}],
        "segments": segments,
        "ciblesProspection": [],
        "modulesConformite": modules,
    }


def _contient(actuel, voulu) -> bool:
    """Vrai si « actuel » porte tout ce que « voulu » demande (le serveur ajoute des valeurs par défaut)."""
    if isinstance(voulu, dict):
        return isinstance(actuel, dict) and all(k in actuel and _contient(actuel[k], v) for k, v in voulu.items())
    if isinstance(voulu, list):
        return isinstance(actuel, list) and len(actuel) == len(voulu) and all(_contient(a, v) for a, v in zip(actuel, voulu))
    return actuel == voulu


def referentiel_a_jour(actuel: dict | None, voulu: dict) -> bool:
    """La dernière version enregistrée couvre déjà la saisie (l'horodatage d'activation des modules ne compte pas)."""
    if not actuel:
        return False
    comparable = {k: v for k, v in voulu.items() if k != "modulesConformite"}
    if not _contient(actuel, comparable):
        return False
    codes_voulus = sorted(m["code"] for m in voulu["modulesConformite"])
    return codes_voulus == sorted(m.get("code") for m in actuel.get("modulesConformite") or [])


def marque_actuelle(api: Api, company_id: str) -> dict | None:
    """Lecture (par la route de données du plugin, sans effet) de la dernière version du référentiel."""
    rep = api.appel("POST", f"/plugins/{PLUGIN_CLE}/data/atelier.marque", {"companyId": company_id, "params": {}})
    return ((rep or {}).get("data") or {}).get("marque")


# Registre local d'identité des clients : instance/atelier-client/<slug>/entreprise.json (dossier 0700, fichier
# 0600), écrit par « nouveau-client » à la création. Les agents (rôle ceo compris) peuvent modifier la description
# d'une entreprise par l'API, donc le marqueur qui s'y trouve ne prouve rien : il ne sert qu'à l'affichage et au
# rapprochement. L'identité d'un client est l'identifiant d'entreprise inscrit dans ce registre, hors de leur portée.
FICHIER_REGISTRE_CLIENT = "entreprise.json"
RE_SLUG_REGISTRE = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
AIDE_ENREGISTRER = ("« nouveau-client --enregistrer-existante --entreprise <UUID> --fiche <fiche> » crée le registre d'une entreprise "
                    "créée avant l'introduction du registre, après contrôle du BCE")


def dossier_client(slug: str) -> Path:
    if not RE_SLUG_REGISTRE.fullmatch(slug or ""):
        raise ErreurAtelier(f"identifiant (slug) de client invalide : {slug!r}")
    return INSTANCE / "atelier-client" / slug


def lire_registre_client(slug: str) -> dict | None:
    """Registre du client (None s'il n'existe pas) ; ErreurAtelier s'il est illisible ou incohérent."""
    chemin = dossier_client(slug) / FICHIER_REGISTRE_CLIENT
    if not chemin.exists() and not chemin.is_symlink():
        return None
    try:
        if chemin.is_symlink() or not chemin.is_file():
            raise ValueError("pas un fichier ordinaire")
        r = json.loads(chemin.read_text(encoding="utf-8"))
        if (not isinstance(r, dict) or not isinstance(r.get("entrepriseId"), str) or not RE_UUID.fullmatch(r["entrepriseId"])
                or not isinstance(r.get("numeroBce"), str) or not r["numeroBce"]):
            raise ValueError("contenu inattendu")
    except (ValueError, OSError) as e:
        raise ErreurAtelier(f"registre local du client {slug} illisible ou incohérent ({e}) : {chemin}") from None
    return r


def slug_client_par_entreprise(company_id: str) -> str | None:
    """Slug du client dont le registre porte cet identifiant d'entreprise (None si aucun) ; ErreurAtelier si deux
    registres le revendiquent. Un registre illisible ne désigne personne."""
    racine = INSTANCE / "atelier-client"
    trouves = []
    if racine.is_dir() and not racine.is_symlink():
        for d in sorted(racine.iterdir()):
            if not RE_SLUG_REGISTRE.fullmatch(d.name) or d.is_symlink() or not d.is_dir():
                continue
            try:
                r = lire_registre_client(d.name)
            except ErreurAtelier:
                continue
            if r and r["entrepriseId"] == company_id:
                trouves.append(d.name)
    if len(trouves) > 1:
        raise ErreurAtelier(f"plusieurs registres locaux désignent l'entreprise {company_id} ({', '.join(trouves)}) : rien n'est modifié.")
    return trouves[0] if trouves else None


def ecrire_registre_client(slug: str, company_id: str, numero_bce: str) -> Path:
    """Écrit (atomiquement) le registre : dossier 0700, fichier 0600."""
    d = dossier_client(slug)
    d.parent.mkdir(parents=True, exist_ok=True)
    d.mkdir(exist_ok=True)
    os.chmod(d, 0o700)
    contenu = {"entrepriseId": company_id, "numeroBce": normaliser_bce(numero_bce), "slug": slug,
               "creeLe": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    chemin, tmp = d / FICHIER_REGISTRE_CLIENT, d / f".{FICHIER_REGISTRE_CLIENT}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(contenu, indent=2, ensure_ascii=False) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, chemin)
    return chemin


def verifier_identite_client(slug: str, numero_bce: str, registre: dict | None, existante: dict | None) -> None:
    """Refus (rien n'est écrit) si l'entreprise retrouvée par marqueur n'est pas celle du registre, si le registre
    manque alors qu'une entreprise porte le marqueur, ou si le BCE de la fiche diffère de celui du registre."""
    if registre is not None and normaliser_bce(registre["numeroBce"]) != normaliser_bce(numero_bce):
        raise ErreurAtelier(
            f"le BCE de la fiche ({numero_bce}) diffère de celui du registre local du client {slug} ({registre['numeroBce']}) : "
            "deux clients différents ne peuvent pas partager un nom. Refusé, rien n'est écrit.")
    if existante is not None:
        if registre is None:
            raise ErreurAtelier(
                f"l'entreprise « {existante.get('name')} » ({existante.get('id')}) porte le marqueur atelier-client:{slug}, mais aucun "
                f"registre local ne la désigne (le marqueur est modifiable par les agents : il ne prouve rien). Refusé, rien n'est écrit. "
                f"Si c'est bien l'entreprise de ce client : {AIDE_ENREGISTRER}.")
        if registre["entrepriseId"] != existante.get("id"):
            raise ErreurAtelier(
                f"l'entreprise « {existante.get('name')} » ({existante.get('id')}) porte le marqueur atelier-client:{slug}, mais le registre "
                f"local désigne l'entreprise {registre['entrepriseId']} : refusé, rien n'est écrit.")
    elif registre is not None:
        raise ErreurAtelier(
            f"le registre local du client {slug} désigne l'entreprise {registre['entrepriseId']}, mais aucune entreprise ne porte ce nom "
            f"et ce marqueur (renommée, marqueur retiré ou supprimée) : refusé, rien n'est écrit. Corrigez l'entreprise, ou supprimez "
            f"le dossier {dossier_client(slug)} si elle a été supprimée à dessein.")


def retrouver_entreprise_client(api: Api, reg_orga: dict, reg_orga_client: dict) -> dict | None:
    """Entreprise du client retrouvée par son marqueur ; refus clair si elle touche à la démonstration."""
    e_demo, e_client = reg_orga["entreprise"], reg_orga_client["entreprise"]
    nom_demo = unicodedata.normalize("NFC", e_demo["nom"])
    if e_client["slug"] == e_demo["slug"] or unicodedata.normalize("NFC", e_client["nom"]) == nom_demo:
        raise ErreurAtelier("le nom de la fiche est celui de l'organisation de démonstration : refusé, rien n'est écrit.")
    for c in api.get("/companies"):
        description = c.get("description") or ""
        if porte_marqueur(description, e_client["marqueur"]) and (e_demo["marqueur"] in description or PREFIXE_MARQUEUR_DEMO in description
                                                    or unicodedata.normalize("NFC", c.get("name") or "") == nom_demo):
            raise ErreurAtelier(
                f"l'entreprise « {c.get('name')} » ({c.get('id')}) porte le marqueur {e_client['marqueur']} mais appartient "
                "à l'organisation de démonstration : refusé, rien n'est modifié."
            )
    return trouver_entreprise(api, reg_orga_client)


def entreprise_de_demonstration(societe: dict, reg_orga: dict) -> bool:
    """Vrai si l'entreprise est (ou se dit) celle de la démonstration : marqueur ou nom."""
    description = societe.get("description") or ""
    demo = reg_orga["entreprise"]
    return (PREFIXE_MARQUEUR_DEMO in description or demo["marqueur"] in description
            or unicodedata.normalize("NFC", societe.get("name") or "") == unicodedata.normalize("NFC", demo["nom"]))


def bce_de_la_marque(marque: dict | None) -> set[str]:
    """Numéros BCE (normalisés) des entités du référentiel de marque enregistré dans le plugin."""
    return {normaliser_bce(i.get("valeur")) for e in (marque or {}).get("entites") or [] for i in e.get("identifiants") or []
            if i.get("type") == "bce"}


def enregistrer_existante(args, fiche: dict) -> int:
    """Migration : crée le registre local d'une entreprise cliente créée avant son introduction. Aucune écriture dans
    l'API : le registre n'est créé qu'après contrôle (entreprise existante, hors démonstration, nom et marqueur de la
    fiche, BCE du référentiel de marque enregistré dans le plugin égal à celui de la fiche)."""
    cid = (args.entreprise or "").strip().lower()
    if not RE_UUID.fullmatch(cid):
        raise ErreurAtelier("--entreprise doit être l'UUID de l'entreprise à enregistrer")
    _, reg_orga = registres()
    slug, marqueur = fiche["slug"], f"{PREFIXE_MARQUEUR_CLIENT}{fiche['slug']}"
    api = Api(url_api())
    societe = next((c for c in api.get("/companies") if c.get("id") == cid), None)
    if societe is None:
        raise ErreurAtelier(f"entreprise {cid} introuvable : rien n'est écrit.")
    if entreprise_de_demonstration(societe, reg_orga):
        raise ErreurAtelier("enregistrement refusé : c'est l'entreprise de démonstration. Rien n'est écrit.")
    if unicodedata.normalize("NFC", societe.get("name") or "") != fiche["nomCommercial"]:
        raise ErreurAtelier(f"enregistrement refusé : l'entreprise s'appelle « {societe.get('name')} », pas « {fiche['nomCommercial']} ». Rien n'est écrit.")
    if not porte_marqueur(societe.get("description"), marqueur):
        raise ErreurAtelier(f"enregistrement refusé : l'entreprise ne porte pas le marqueur {marqueur}. Rien n'est écrit.")
    bces = bce_de_la_marque(marque_actuelle(api, cid))
    if not bces:
        raise ErreurAtelier("enregistrement refusé : aucun BCE enregistré dans le référentiel de marque de cette entreprise, "
                            "le BCE de la fiche ne peut pas être vérifié. Rien n'est écrit.")
    if normaliser_bce(fiche["numeroBce"]) not in bces:
        raise ErreurAtelier("enregistrement refusé : le BCE de la fiche ne correspond pas à celui du référentiel de marque de l'entreprise. Rien n'est écrit.")
    existant = lire_registre_client(slug)
    autre = slug_client_par_entreprise(cid)
    if (existant and existant["entrepriseId"] != cid) or (autre and autre != slug):
        raise ErreurAtelier(f"enregistrement refusé : un registre local désigne déjà une autre entreprise pour {slug}, ou ce UUID pour un autre client. Rien n'est écrit.")
    if existant:
        print(f"Registre déjà en place pour « {fiche['nomCommercial']} » ({cid}) : rien à faire.")
        return 0
    if args.a_blanc:
        print(f"À blanc : le registre {dossier_client(slug) / FICHIER_REGISTRE_CLIENT} serait écrit pour l'entreprise {cid}. Rien n'est écrit.")
        return 0
    with verrou_ecriture("nouveau-client"):
        chemin = ecrire_registre_client(slug, cid, fiche["numeroBce"])
    print(f"Registre local écrit : {chemin} (entreprise {cid}).")
    return 0


def cmd_nouveau_client(args) -> int:
    if args.entreprise and not args.enregistrer_existante:
        raise ErreurAtelier("--entreprise ne s'utilise qu'avec --enregistrer-existante.")
    if args.enregistrer_existante and not args.entreprise:
        raise ErreurAtelier("--enregistrer-existante exige --entreprise <UUID>.")
    fiche = valider_fiche(lire_fiche(Path(args.fiche)), args.reel)
    if args.enregistrer_existante:
        return enregistrer_existante(args, fiche)
    reg_agents, reg_orga = registres()
    reg_client = organisation_client(reg_orga, fiche)
    marqueur = reg_client["entreprise"]["marqueur"]
    referentiel = referentiel_client(fiche)
    api = Api(url_api())
    try:
        api.get(f"/plugins/{PLUGIN_CLE}")
    except ErreurAtelier as e:
        if "HTTP 404" in str(e):
            raise ErreurAtelier(f"plugin {PLUGIN_CLE} introuvable : installez-le d'abord (scripts/preparer-plugin.sh puis installation depuis l'interface)") from None
        raise
    existante = retrouver_entreprise_client(api, reg_orga, reg_client)
    registre = lire_registre_client(fiche["slug"])
    verifier_identite_client(fiche["slug"], fiche["numeroBce"], registre, existante)
    cid = existante["id"] if existante else None
    nom = fiche["nomCommercial"]
    budget = fiche["budgetIaMensuelCentimes"]
    actuel_marque = marque_actuelle(api, cid) if cid else None

    ecritures = []
    if existante is None:
        ecritures.append(f"créer l'entreprise « {nom} » (marqueur {marqueur}, mode {fiche['mode']}) par import natif")
    else:
        ecritures.append(f"entreprise « {nom} » déjà présente ({cid}) : aucune création")
    if registre is None:
        ecritures.append(f"registre local d'identité : {dossier_client(fiche['slug']) / FICHIER_REGISTRE_CLIENT} (écrit à la création)")
    ecritures.append("organisation des agents (import natif si besoin, liaisons, objectifs, projets, routines, connexions, Gardien) : "
                     + ("création complète" if existante is None else "réconciliation idempotente, aucune écriture si déjà à jour"))
    if (existante or {}).get("budgetMonthlyCents") == budget:
        ecritures.append(f"budget IA mensuel de l'entreprise : déjà {budget} centimes, aucune écriture")
    else:
        ecritures.append(f"budget IA mensuel de l'entreprise : {budget} centimes (PATCH /companies/<id>/budgets)")
    if referentiel_a_jour(actuel_marque, referentiel):
        ecritures.append("référentiel de marque : déjà à jour, aucune écriture")
    else:
        ecritures.append(f"référentiel de marque (atelier.marque.enregistrer) : {len(referentiel['offres'])} offre(s), "
                         f"{len(referentiel['etablissements'])} bureau(x), {len(referentiel['segments'])} segment(s)"
                         + (f", module de conformité {MODULE_ASSURANCE}" if fiche["courtier"] else ""))
    if args.a_blanc:
        print(f"À blanc : rien n'est écrit. Écritures prévues pour « {nom} » :")
        for ligne in ecritures:
            print(f"  - {ligne}")
        return 0

    if cmd_generer(argparse.Namespace(verifier=True)) != 0:
        return 1
    with verrou_ecriture("nouveau-client"):
        fichiers = fichiers_paquet()
        fichiers["COMPANY.md"] = company_md_client(reg_client)
        try:
            cid = appliquer_organisation(api, reg_agents, reg_client, fichiers, fiche["mode"],
                                         INSTANCE / "atelier-client" / fiche["slug"])
        except (ErreurAtelier, OSError):
            if registre is None and existante is None:
                # Entreprise créée avant l'échec : on garde son identité pour que la reprise ne soit pas refusée.
                try:
                    creee = trouver_entreprise(api, reg_client)
                    if creee and lire_registre_client(fiche["slug"]) is None:
                        ecrire_registre_client(fiche["slug"], creee["id"], fiche["numeroBce"])
                except (ErreurAtelier, OSError):
                    pass
            raise
        if registre is None:
            ecrire_registre_client(fiche["slug"], cid, fiche["numeroBce"])
            print(f"Registre local d'identité écrit : {dossier_client(fiche['slug']) / FICHIER_REGISTRE_CLIENT}")
        societe = next((c for c in api.get("/companies") if c.get("id") == cid), {})
        if societe.get("budgetMonthlyCents") != budget:
            api.appel("PATCH", f"/companies/{cid}/budgets", {"budgetMonthlyCents": budget})
            print(f"Budget IA mensuel posé : {budget} centimes")
        else:
            print(f"Budget IA mensuel déjà à {budget} centimes")
        if referentiel_a_jour(marque_actuelle(api, cid), referentiel):
            print("Référentiel de marque déjà à jour : aucune écriture")
        else:
            api.appel("POST", f"/plugins/{PLUGIN_CLE}/actions/atelier.marque.enregistrer",
                      {"companyId": cid, "params": referentiel})
            print("Référentiel de marque enregistré (nouvelle version)")
    print(f"Client « {nom} » prêt : entreprise {cid}, marqueur {marqueur}.")
    return 0


# ---------------------------------------------------------------------------
# Purge : fin de contrat et droit à l'effacement (RGPD)
# ---------------------------------------------------------------------------

DELAI_EXPORT_HEURES = 24
ROTATION_SAUVEGARDES_JOURS = 14
AVERTISSEMENT_SAUVEGARDES = (
    "Les sauvegardes existantes ne sont PAS modifiées : elles contiennent encore les données de ce client "
    f"jusqu'à leur expiration par rotation ({ROTATION_SAUVEGARDES_JOURS} jours). Une restauration d'avant la purge "
    "les ferait revenir : la purge doit alors être rejouée."
)
LIMITE_EXPORT = (
    "L'export contient le paquet de l'organisation (agents, projets, tâches, compétences) et, dans donnees-plugin/, "
    "les données du plugin (prospects, clients, connaissances, journal) ; leurs colonnes chiffrées y restent chiffrées "
    "(la clé de chiffrement n'est pas dans l'export : à conserver à part si le client doit pouvoir les relire)."
)


def _horodatage_utc(texte) -> dt.datetime | None:
    try:
        return dt.datetime.strptime(str(texte), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def verifier_export_recent(company_id: str, dossier: Path, maintenant: dt.datetime) -> tuple[dict | None, str]:
    """(manifeste, "") si le dossier contient un export intact, de cette entreprise, de moins de 24 h ;
    sinon (None, raison). Intact : chaque fichier du manifeste existe avec la même empreinte SHA-256."""
    chemin = dossier / FICHIER_MANIFESTE_EXPORT
    if not chemin.is_file():
        return None, f"pas de {FICHIER_MANIFESTE_EXPORT} dans {dossier.name}"
    try:
        m = json.loads(chemin.read_text(encoding="utf-8"))
        fichiers = m["fichiers"]
        assert isinstance(fichiers, dict) and fichiers
    except (ValueError, KeyError, AssertionError, OSError):
        return None, f"{FICHIER_MANIFESTE_EXPORT} illisible dans {dossier.name}"
    if m.get("entrepriseId") != company_id:
        return None, f"{dossier.name} concerne une autre entreprise"
    quand = _horodatage_utc(m.get("exporteLe"))
    if quand is None:
        return None, f"date d'export illisible dans {dossier.name}"
    age = maintenant - quand
    if age < dt.timedelta(minutes=-5):
        return None, f"date d'export dans le futur dans {dossier.name}"
    if age > dt.timedelta(hours=DELAI_EXPORT_HEURES):
        return None, f"export de {dossier.name} trop ancien ({int(age.total_seconds() // 3600)} h, maximum {DELAI_EXPORT_HEURES} h)"
    if m.get("empreinte") != empreinte_manifeste(fichiers):
        return None, f"empreinte du manifeste de {dossier.name} incohérente"
    racine = dossier.resolve()
    for c, h in fichiers.items():
        f = (dossier / c).resolve()
        if not str(f).startswith(str(racine) + os.sep) or not f.is_file():
            return None, f"fichier d'export manquant : {c}"
        if hashlib.sha256(f.read_bytes()).hexdigest() != h:
            return None, f"fichier d'export modifié depuis l'export : {c}"
    return m, ""


def trouver_export_recent(company_id: str, explicite: str | None) -> tuple[Path, dict]:
    """Dernier export valide de l'entreprise (--export, sinon instance/exports/<UUID>/*), ou ErreurAtelier."""
    candidats = [Path(explicite).resolve()] if explicite else sorted(
        (d for d in (INSTANCE / "exports" / company_id).glob("*") if d.is_dir()), reverse=True)
    maintenant = dt.datetime.now(dt.timezone.utc)
    raisons = []
    for d in candidats:
        m, raison = verifier_export_recent(company_id, d, maintenant)
        if m:
            return d, m
        raisons.append(raison)
    detail = " ; ".join(raisons) if raisons else f"aucun export trouvé sous {INSTANCE / 'exports' / company_id}"
    raise ErreurAtelier(
        f"aucun export de moins de {DELAI_EXPORT_HEURES} h pour cette entreprise ({detail}). Lancez d'abord : "
        f"python3 -I scripts/bootstrap-organisation.py exporter --entreprise {company_id} ; rien n'a été supprimé.")


def dossiers_locaux_client(company_id: str) -> list[Path]:
    """Dossiers locaux d'un client : espaces des agents et configurations Claude dédiées rangés par identifiant
    d'entreprise (disposition actuelle, voir dossiers_agent), anciennes dispositions « client-<slug> » et état
    « atelier-client/<slug> » (registre compris) du slug que le REGISTRE LOCAL associe à cet identifiant : jamais
    celui d'un marqueur de la description, que les agents peuvent modifier. Seulement ceux qui existent."""
    candidats = [ESPACES / company_id, CONFIGS_CLAUDE / company_id]
    slug = slug_client_par_entreprise(company_id)
    if slug:
        candidats += [ESPACES / f"client-{slug}", CONFIGS_CLAUDE / f"client-{slug}", INSTANCE / "atelier-client" / slug]
    return [d for d in candidats if d.is_dir() and not d.is_symlink()]


def verifier_donnees_plugin_export(export: Path, manifeste: dict, comptes: dict) -> None:
    """L'export doit contenir donnees-plugin/<table>.json (déjà contrôlé par empreinte au manifeste) pour CHAQUE table
    du plugin, avec AU MOINS autant de lignes que les comptes actuels de la purge à blanc ; sinon ErreurAtelier (rien supprimé).
    Un export qui contient plus de lignes qu'aujourd'hui reste valable : c'est le cas d'une purge reprise après un échec
    à l'étape du socle, l'étape 1 ayant déjà vidé les tables du plugin (constaté lors de la validation réelle du 16/10/2026)."""
    refus = []
    fichiers = manifeste.get("fichiers") or {}
    for table in sorted(comptes):
        chemin = f"{DOSSIER_DONNEES_PLUGIN}/{table}.json"
        if chemin not in fichiers:
            refus.append(f"{chemin} absent de l'export")
            continue
        try:
            lues = len(json.loads((export / chemin).read_text(encoding="utf-8")))
        except (ValueError, OSError, TypeError):
            refus.append(f"{chemin} illisible")
            continue
        if lues < comptes[table]:
            refus.append(f"{table} : {lues} ligne(s) exportée(s) pour {comptes[table]} actuellement")
    if refus:
        raise ErreurAtelier(
            "purge refusée : l'export ne contient pas toutes les données du plugin à jour (" + " ; ".join(refus[:8])
            + (f" ; … {len(refus)} problèmes" if len(refus) > 8 else "")
            + f"). Relancez : python3 -I scripts/bootstrap-organisation.py exporter --entreprise {manifeste.get('entrepriseId')} ; rien n'a été supprimé.")


def appel_purge_plugin(api: Api, company_id: str, a_blanc: bool) -> dict:
    corps = {"companyId": company_id, "aBlanc": True} if a_blanc else {"companyId": company_id, "confirmer": True}
    return api.appel("POST", f"/plugins/{PLUGIN_CLE}/api/donnees/purge", corps) or {}


def resume_comptes(tables: dict) -> str:
    non_vides = {t: n for t, n in tables.items() if n}
    if not non_vides:
        return f"0 ligne dans les {len(tables)} tables"
    return (f"{sum(non_vides.values())} ligne(s) dans {len(non_vides)} table(s) sur {len(tables)} : "
            + ", ".join(f"{t} {n}" for t, n in sorted(non_vides.items())))


def cmd_purger(args) -> int:
    cid = (args.entreprise or "").strip().lower()
    if not args.confirmer and not args.a_blanc:
        raise ErreurAtelier("purge refusée : ajoutez --confirmer (irréversible) ; --a-blanc liste d'abord ce qui serait supprimé. Rien n'a été supprimé.")
    if not RE_UUID.fullmatch(cid):
        raise ErreurAtelier("--entreprise doit être l'UUID de l'entreprise à purger")
    reg_agents, reg_orga = registres()
    api = Api(url_api())
    societe = next((c for c in api.get("/companies") if c.get("id") == cid), None)
    if societe is None:
        raise ErreurAtelier(f"entreprise {cid} introuvable : rien n'est supprimé.")
    # Garde-fou : un UUID ne suffit pas. L'identité d'un client est son registre local (écrit par « nouveau-client »,
    # hors de portée des agents) ; la description (marqueur) est modifiable par un agent et ne prouve rien.
    if slug_client_par_entreprise(cid) is None:
        if entreprise_de_demonstration(societe, reg_orga):
            raise ErreurAtelier("purge refusée : c'est l'entreprise de démonstration (utilisez « reinitialiser »). Rien n'a été supprimé.")
        nom_societe = unicodedata.normalize("NFC", societe.get("name") or "")
        if not args.hors_marqueur:
            raise ErreurAtelier(
                "purge refusée : aucun registre local ne désigne cette entreprise (le marqueur atelier-client:<slug> de la description "
                "ne prouve rien : un agent peut le modifier ; seul instance/atelier-client/<slug>/entreprise.json, écrit par « nouveau-client » "
                f"à la création, fait foi). Si elle a été créée avant le registre : {AIDE_ENREGISTRER}. Pour la purger quand même : "
                "--hors-marqueur --nom-confirme \"<nom exact de l'entreprise>\". Rien n'a été supprimé.")
        if args.nom_confirme is None or unicodedata.normalize("NFC", args.nom_confirme) != nom_societe:
            raise ErreurAtelier(
                "purge refusée : --hors-marqueur exige --nom-confirme avec le nom exact de l'entreprise "
                f"(« {societe.get('name')} »), retapé à l'identique. Rien n'a été supprimé.")
    dossier_fichiers = dossier_fichiers_entreprise(cid)
    locaux = dossiers_locaux_client(cid)
    print(AVERTISSEMENT_SAUVEGARDES)
    print(f"Entreprise à purger : « {societe.get('name')} » ({cid})")

    if args.a_blanc:
        comptes = (appel_purge_plugin(api, cid, True)).get("tables") or {}
        try:
            export, manifeste_ab = trouver_export_recent(cid, args.export)
            verifier_donnees_plugin_export(export, manifeste_ab, comptes)
            print(f"Export récent : {export.name} (complet, données du plugin comprises : la purge réelle est autorisée)")
        except ErreurAtelier as e:
            print(f"Export récent : ABSENT ou INCOMPLET, la purge réelle serait refusée ({e})")
        print("À blanc : rien n'est supprimé. Étapes prévues, dans l'ordre :")
        print(f"  1. données du plugin : {resume_comptes(comptes)}")
        for t, n in sorted(comptes.items()):
            print(f"       {t} : {n}")
        print(f"  2. entreprise côté socle : suppression (DELETE /companies/{cid}, agents, projets, tâches, objectifs)")
        print(f"  3. fichiers Paperclip : {dossier_fichiers if dossier_fichiers and dossier_fichiers.is_dir() else 'aucun dossier'}"
              f" ; index de connaissances : inclus à l'étape 1 (connaissances_index {comptes.get('connaissances_index', 0)}, "
              f"documents {comptes.get('connaissances_documents', 0)}, passages {comptes.get('connaissances_passages', 0)})")
        print(f"  4. dossiers locaux du client : {', '.join(str(d) for d in locaux) if locaux else 'aucun'}")
        print(LIMITE_EXPORT)
        return 0

    export, manifeste = trouver_export_recent(cid, args.export)
    comptes_avant = (appel_purge_plugin(api, cid, True)).get("tables") or {}
    verifier_donnees_plugin_export(export, manifeste, comptes_avant)
    print(f"Export récent trouvé : {export.name} (empreinte {manifeste['empreinte'][:16]}…), données du plugin complètes")
    debut = dt.datetime.now(dt.timezone.utc)
    rapport = {
        "version": 1, "entrepriseId": cid, "debut": debut.strftime("%Y-%m-%dT%H:%M:%SZ"), "fin": None, "statut": "en cours",
        "export": {"dossier": export.name, "exporteLe": manifeste["exporteLe"], "empreinte": manifeste["empreinte"]},
        "etapes": [], "tables": {}, "total": 0,
        "avertissements": [AVERTISSEMENT_SAUVEGARDES, LIMITE_EXPORT],
    }

    def etape(numero: int, nom: str, detail: str, detail_rapport: str | None = None, statut: str = "fait"):
        print(f"[purge] étape {numero}/4 : {nom} : {detail}", flush=True)
        rapport["etapes"].append({"etape": numero, "nom": nom, "statut": statut, "detail": detail_rapport or detail,
                                  "a": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})

    chemin_rapport = export / f"rapport-purge-{debut.strftime('%Y%m%d-%H%M%S')}.json"
    code = 0
    try:
        with verrou_ecriture("purger"):
            res = appel_purge_plugin(api, cid, False)
            rapport["tables"], rapport["total"] = res.get("tables") or {}, res.get("total") or 0
            etape(1, "données du plugin", resume_comptes(rapport["tables"]))
            # Défaut amont (voir « reinitialiser ») : on délie projets et objectifs avant la suppression.
            for projet in api.get(f"/companies/{cid}/projects"):
                if projet.get("goalIds") or projet.get("goalId"):
                    api.appel("PATCH", f"/projects/{projet['id']}", {"goalIds": []})
            api.appel("DELETE", f"/companies/{cid}")
            if any(c.get("id") == cid for c in api.get("/companies")):
                raise ErreurAtelier("l'entreprise existe encore après suppression")
            etape(2, "entreprise côté socle", "supprimée (DELETE /companies/<id> ; l'archivage seul n'a pas été nécessaire)")
            existait = bool(dossier_fichiers and dossier_fichiers.is_dir())
            message = supprimer_fichiers_entreprise(cid)
            etape(3, "fichiers Paperclip et index de connaissances", message + " ; index de connaissances supprimé avec les tables du plugin (étape 1)",
                  ("fichiers de l'entreprise supprimés" if existait else "aucun fichier à supprimer")
                  + " ; index de connaissances supprimé avec les tables du plugin (étape 1)")
            for d in locaux:
                shutil.rmtree(d)
            etape(4, "dossiers locaux du client", f"{len(locaux)} dossier(s) supprimé(s)" + "".join(f" ({d})" for d in locaux),
                  f"{len(locaux)} dossier(s) supprimé(s)")
            rapport["statut"] = "réussie"
    except (ErreurAtelier, OSError) as e:
        rapport["statut"] = "échec"
        rapport["etapes"].append({"etape": len(rapport["etapes"]) + 1, "nom": "échec", "statut": "échec",
                                  "detail": re.sub(r"/[^\s]*", "<chemin>", str(e))[:400],
                                  "a": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
        print(f"ERREUR : {e}", file=sys.stderr)
        code = 2
    finally:
        rapport["fin"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        chemin_rapport.write_text(json.dumps(rapport, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Rapport de purge : {chemin_rapport}")
    print("Purge terminée." if code == 0 else "Purge INCOMPLÈTE : relancez après correction ; le rapport indique l'étape en échec.")
    print(AVERTISSEMENT_SAUVEGARDES)
    return code


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sp = p.add_subparsers(dest="commande", required=True)
    g = sp.add_parser("generer")
    g.add_argument("--verifier", action="store_true")
    ap_ = sp.add_parser("appliquer")
    ap_.add_argument("--mode", choices=MODES, default="reel",
                     help="reel : claude_local prêt mais en pause (défaut) ; demonstration : agents process du lot A")
    sp.add_parser("etat")
    nc = sp.add_parser("nouveau-client")
    nc.add_argument("--fiche", required=True, help="fiche du client (.yaml, .yml ou .json) ; modèle : organisation/modeles/fiche-client.exemple.json")
    nc.add_argument("--reel", action="store_true", help="autorise le mode réel (sans lui, démonstration seulement)")
    nc.add_argument("--a-blanc", "--a_blanc", action="store_true", dest="a_blanc", help="liste les écritures prévues sans rien écrire")
    nc.add_argument("--enregistrer-existante", action="store_true", dest="enregistrer_existante",
                    help="migration : crée le registre local d'une entreprise cliente déjà créée (avec --entreprise et --fiche), après contrôle du BCE")
    nc.add_argument("--entreprise", default=None, help="UUID de l'entreprise à enregistrer (avec --enregistrer-existante)")
    ac = sp.add_parser("assurer-connexions")
    ac.add_argument("--detail", action="store_true", help="affiche aussi le détail quand rien n'a été écrit")
    x = sp.add_parser("exporter")
    x.add_argument("--sortie", default=None, help="dossier de sortie (vide ou absent) ; obligatoire sans --entreprise")
    x.add_argument("--entreprise", default=None, help="UUID de l'entreprise à exporter (défaut : l'organisation de démonstration)")
    pg = sp.add_parser("purger")
    pg.add_argument("--entreprise", required=True, help="UUID de l'entreprise dont toutes les données seront supprimées")
    pg.add_argument("--confirmer", action="store_true", help="obligatoire : la suppression est irréversible")
    pg.add_argument("--a-blanc", "--a_blanc", action="store_true", dest="a_blanc", help="liste ce qui serait supprimé (comptes par table), sans rien supprimer")
    pg.add_argument("--export", default=None, help="dossier d'un export déjà fait (défaut : le plus récent sous instance/exports/<UUID>/)")
    pg.add_argument("--hors-marqueur", action="store_true", dest="hors_marqueur",
                    help="autorise la purge d'une entreprise sans registre local (instance/atelier-client/<slug>/entreprise.json) ; exige --nom-confirme")
    pg.add_argument("--nom-confirme", default=None, dest="nom_confirme",
                    help="avec --hors-marqueur : nom exact de l'entreprise, retapé à l'identique")
    r = sp.add_parser("reinitialiser")
    r.add_argument("--confirmer", default="")
    j = sp.add_parser("jeton")
    j.add_argument("--confirmer", action="store_true")
    tr = sp.add_parser("test-reel")
    tr.add_argument("--agent", default="tests-techniques")
    tr.add_argument("--confirmer", action="store_true")
    cl = sp.add_parser("cles")
    cl.add_argument("--confirmer", action="store_true")
    cl.add_argument("--entreprise", default=None, help="identifiant de l'entreprise (défaut : l'organisation de démonstration)")
    groupe = cl.add_mutually_exclusive_group()
    groupe.add_argument("--rotation", choices=("passerelle", "approbation"))
    groupe.add_argument("--basculer", choices=("passerelle", "approbation"))
    groupe.add_argument("--retirer-anciennes", action="store_true", dest="retirer_anciennes")
    args = p.parse_args(argv)
    commandes = {
        "generer": cmd_generer,
        "appliquer": cmd_appliquer,
        "etat": cmd_etat,
        "nouveau-client": cmd_nouveau_client,
        "assurer-connexions": cmd_assurer_connexions,
        "exporter": cmd_exporter,
        "purger": cmd_purger,
        "reinitialiser": cmd_reinitialiser,
        "jeton": cmd_jeton,
        "test-reel": cmd_test_reel,
        "cles": cmd_cles,
    }
    try:
        return commandes[args.commande](args)
    except ErreurAtelier as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
