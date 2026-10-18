#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bootstrap de l'organisation modèle « Rénovation Liège (démonstration) » (nom historique, conservé : les instances
installées la retrouvent par ce nom et son marqueur).

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
  etat                   affiche ce qui existe pour l'organisation modèle.
  nouveau-client --fiche F [--reel] [--a-blanc]
                         crée l'entreprise d'un NOUVEAU client à partir d'une fiche (.yaml ou .json ; modèle :
                         organisation/modeles/fiche-client.exemple.json) : entreprise marquée
                         « atelier-client:<slug> », organisation des agents (mêmes étapes que « appliquer »),
                         budget IA mensuel, référentiel de marque. Idempotent (entreprise retrouvée par
                         marqueur) ; --a-blanc liste les écritures sans rien écrire ; tout est réel (--reel est accepté
                         sans effet, avec un avertissement) ; refus si l'entreprise appartient à l'organisation modèle.
  nouveau-client --fiche F --ajouter-services --entreprise UUID [--slug S] [--reel] [--a-blanc]
                         dote un client EXISTANT de tous ses services : l'entreprise UUID (même portant l'ancien marqueur « atelier-demo:* »)
                         devient le service Marketing du client (marqueur migré vers « atelier-client:<slug> », l'ancien suffixe « (démonstration) »
                         retiré du nom, registre local écrit) ; son organisation et son référentiel de marque ne sont pas
                         réécrits ; les autres services et la Direction sont créés par le chemin habituel (agents en pause).
                         Idempotent ; --a-blanc n'écrit rien. Le nom de la fiche doit être celui de l'entreprise sans « (démonstration) ».
  mettre-a-jour-client --client SLUG [--a-blanc] [--pause-hors-registre] [--sans-nouveaux-services]
                         met à jour un client DÉJÀ créé (registre local instance/atelier-client/<slug>/) sur le registre actuel :
                         crée, dans chaque entreprise de service et le marketing, les agents du registre manquants (en pause, mêmes
                         réglages que nouveau-client), ajoute les services absents, remet à jour consignes, compétences et liaisons
                         des agents existants (import natif « replace »), rallume les agents déjà actifs que l'import aurait mis en
                         pause. Les agents hors registre (renommés, scindés) sont listés ; --pause-hors-registre les met en pause
                         (jamais de suppression). Objectifs, description et budget des entreprises existantes ne sont pas réécrits.
                         Idempotent ; --a-blanc n'écrit rien.
  nettoyer-doublons --client SLUG [--confirmer]
                         doublons « <nom> N » laissés par un import mal apparié : à blanc par défaut ; --confirmer met en
                         pause puis supprime ceux qui n'ont aucune tâche ni exécution (journal local JSONL).
  assurer-connexions     étape légère et idempotente : réserve aux rôles déclarés chaque connexion de la
                         passerelle créée depuis le dernier « appliquer » (accès natif, installations,
                         politiques « block » des rôles en lecture). Lancée toutes les minutes par le
                         « Gardien des connexions » (agent natif sans modèle créé par « appliquer »).
  exporter [--sortie DIR] [--entreprise UUID]
                         export natif, nettoyage des valeurs propres à la machine, contrôle, puis aperçu
                         d'import du paquet exporté, et manifeste « manifeste-export.json » (entreprise, date,
                         empreinte SHA-256 de chaque fichier). Sans --entreprise : l'organisation
                         modèle (--sortie obligatoire). Avec --entreprise : cette entreprise ; sans
                         --sortie, l'export va dans instance/exports/<UUID>/<horodatage>/ ; les données du
                         plugin (route donnees.exporter, colonnes chiffrées laissées chiffrées) y sont écrites
                         table par table dans donnees-plugin/<table>.json, avec leurs empreintes au manifeste.
                         --pg-port PORT (obligatoire avec --entreprise) : activity_log, approvals et cost_events du
                         socle sont lus en LECTURE SEULE par psql (PGPASSWORD dans l'environnement ; ATELIER_PSQL
                         remplace la commande) et écrits dans donnees-socle/<table>.json, comptes vérifiés ;
                         « purger » refuse si ces fichiers manquent ou sont incomplets.
  purger --entreprise UUID [--confirmer] [--a-blanc] [--export DIR] [--hors-marqueur --nom-confirme NOM]
                         fin de contrat / droit à l'effacement : supprime TOUTES les données d'un client, après
                         un export de moins de 24 h (manifeste vérifié, données du plugin présentes et de même
                         nombre de lignes que les comptes actuels). Refus sans --confirmer, pour l'entreprise
                         modèle, sans export récent et complet, ou si aucun registre local
                         (instance/atelier-client/<slug>/entreprise.json) ne la désigne (sauf --hors-marqueur et --nom-confirme avec le nom exact). Étapes journalisées : données du
                         plugin (toutes les tables, connaissances comprises), entreprise côté socle, fichiers
                         Paperclip et espaces locaux. --a-blanc liste tout avec les comptes par table. Rapport
                         JSON horodaté à côté de l'export. Les sauvegardes existantes ne sont PAS modifiées.
  purger-memoires --client SLUG --motif TEXTE [--confirmer]
                         droit à l'effacement d'une personne dans la mémoire des agents (memoire-para) : cherche le
                         motif, sans casse, dans instance/agents-atelier/<UUID de chaque entreprise du client>/*/memoire/
                         et efface les lignes qui le contiennent (un fichier dont le nom le contient est supprimé).
                         À blanc par défaut (comptes seulement) ; --confirmer efface. Journal sans le motif ni les
                         lignes (empreinte SHA-256) : instance/atelier-client/<slug>/journal-purges-memoires.jsonl.
  reinitialiser --confirmer "<nom exact>"
                         supprime l'entreprise modèle, ses dossiers locaux et les
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
import importlib.util
import json
import os
import re
import shlex
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
# Deux sources : le tronc commun à TOUS les agents (organisation/consignes/communes.md) et le complément du seul
# marketing (organisation/consignes/marketing.md, blocs « <!-- bloc : nom --> » qui remplissent les emplacements
# « [[marketing:nom]] » du tronc). Le marqueur ci-dessous garde son texte d'origine : le modifier réécrirait
# les AGENTS.md du marketing.
CONSIGNES_COMMUNES = ORGA / "consignes" / "communes.md"
CONSIGNES_MARKETING = ORGA / "consignes" / "marketing.md"
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
# Nom historique, CONSERVÉ volontairement : le renommer sans migration ferait perdre l'état local des
# instances déjà installées (registre des entreprises appliquées, empreintes). Il ne désigne plus aucun mode.
ETAT_LOCAL = INSTANCE / "atelier-demo"
ESPACES = INSTANCE / "agents-atelier"
QUARANTAINE_MEMOIRE = ".quarantaine"  # memoire/.quarantaine/ : même nom que dans scripts/hooks/garde-memoire.mjs
CONFIGS_CLAUDE = INSTANCE / "claude-config"
FICHIER_VERROU = "company-package.lock.json"
PLUGIN = RACINE / "plugin-atelier"
# Agents déterministes (Porte de contrôle) : adaptateur « process » lancé avec cwd = dossier du plugin
# et un chemin RELATIF vers le script. Le chemin reste celui du registre généré (.paperclip.yaml).
SCRIPT_AGENT_DETERMINISTE = "agents/porte.mjs"
# Tout est réel : un seul mode, conservé comme paramètre pour garder des empreintes de liaison stables.
MODES = ("reel",)
# « Gardien des connexions » : agent natif SANS modèle (adaptateur process) créé par « appliquer »,
# hors paquet. Son battement natif (heartbeat à intervalle) lance « assurer-connexions » : une
# connexion créée par une carte après le bootstrap est réservée aux rôles prévus sans intervention.
GARDIEN_NOM = "Gardien des connexions"
GARDIEN_SLUG = "gardien-des-connexions"
GARDIEN_INTERVALLE_SEC = 60

# Fichiers du paquet AgentCompanies envoyés à Paperclip. Tout le reste
# d'organisation/ (registre, politiques, README) reste
# hors du paquet.
RACINES_PAQUET = ("COMPANY.md", ".paperclip.yaml", "agents", "skills", "projects")

SCHEMA_VERSION_PAQUET = 7
CLE_SECRET_JETON = "claude-code-oauth-token"
VARIABLE_JETON = "CLAUDE_CODE_OAUTH_TOKEN"


class ErreurAtelier(Exception):
    pass


# Compétences communes à TOUS les agents claude_local (décision de l'opérateur du 18/10/2026), ajoutées par le
# générateur à la liste déclarée de chaque agent (registre du marketing et en-tête « skills: » des
# AGENTS.md des services), sans doublon et après les compétences propres au rôle. Aucune n'est ajoutée
# à un agent déterministe (adaptateur process, aucun modèle).
# - memoire-para : mémoire persistante en fichiers dans ./memoire/ du cwd de l'agent. Ce n'est PAS
#   la compétence « para-memory-files » du socle sous son nom : le socle l'importe déjà dans chaque
#   entreprise (paperclip/server/src/services/company-skills.ts, PAPERCLIP_CORE_SKILL_KEYS) et deux
#   compétences de même slug rendent la référence ambiguë (resolveSkillReference, même fichier).
#   Elle n'écrit pas dans $AGENT_HOME : pour un bundle géré, AGENT_HOME est
#   companies/<id>/agents/<id>/file-sync/runs/<run>/live (heartbeat.ts, agent-directory-working-copies.ts),
#   hors du cwd et non monté par le confinement Bubblewrap de claude_local (managedPaths de
#   packages/adapters/claude-local/src/server/execute.ts) ; ./memoire/ est couvert par « Edit(./**) ».
# - recherche-connaissances : chercher dans les connaissances (base du service et base commune du
#   groupe) avant d'affirmer.
COMPETENCES_COMMUNES = ("memoire-para", "recherche-connaissances")
# Compétence commune qui exige d'écrire des fichiers (./memoire/) : un agent sans règle d'écriture effective
# (« Edit(./**) », voir arguments_outils) ne la reçoit pas (revue du 18/10/2026, M2 : coordinateur, exigences,
# relecteur, tests-techniques ont Write et Edit interdits) ; il garde recherche-connaissances.
COMPETENCE_MEMOIRE = "memoire-para"


def ecrit_des_fichiers(outils: dict) -> bool:
    """Vrai si arguments_outils donne à l'agent la règle d'écriture « Edit(./**) » (Write ou Edit autorisé)."""
    return any(o in ("Write", "Edit") for o in outils.get("recherche", []) + outils.get("mutation", []))


def avec_competences_communes(competences: list[str], ecrit: bool = True) -> list[str]:
    """Compétences d'un agent claude_local : les siennes (ordre gardé, doublons retirés), puis les
    compétences communes qu'il ne déclare pas déjà. Sans écriture (ecrit=False), memoire-para n'est ni
    ajoutée ni gardée."""
    resultat: list[str] = []
    for nom in [*competences, *COMPETENCES_COMMUNES]:
        if nom == COMPETENCE_MEMOIRE and not ecrit:
            continue
        if nom not in resultat:
            resultat.append(nom)
    return resultat


# ---------------------------------------------------------------------------
# Lecture du registre
# ---------------------------------------------------------------------------

def lire_json(chemin: Path):
    with chemin.open(encoding="utf-8") as f:
        return json.load(f)


def registres():
    """Registres du marketing ; chaque agent claude_local y reçoit les compétences communes."""
    reg_agents = lire_json(REGISTRE_AGENTS)
    for agent in reg_agents["agents"]:
        if not agent.get("deterministe"):
            agent["competences"] = avec_competences_communes(agent["competences"], ecrit_des_fichiers(agent["outils"]))
    return reg_agents, lire_json(REGISTRE_ORGA)


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


# Confinement des agents claude_local (faille C1 de la revue du 16/10/2026 : `Bash(curl *)` lisait
# `curl file://…` les secrets de l'instance et pouvait les envoyer n'importe où). Options natives
# de l'adaptateur (paperclip/packages/adapters/claude-local/src/index.ts), appliquées par
# Bubblewrap, qui exigent engine "cli" :
# - filesystemScope "workspace" : seuls l'espace de l'agent (écriture), son CLAUDE_CONFIG_DIR, le
#   paquet de consignes et les chemins système en lecture sont visibles ; secrets/, master.key et
#   le reste du disque n'existent pas pour l'agent (patches socle 0051 et 0052) ;
# - networkScope "allowlist" : espace réseau privé, sortie seulement par le mandataire du socle.
#   L'API locale (PAPERCLIP_API_URL) et les serveurs MCP de l'exécution, dont la passerelle
#   marketing servie par l'API (/mcp/gateways/…), sont ajoutés d'office par l'adaptateur avec
#   le port exact de l'instance : ils ne figurent donc pas ici (un port codé en dur ouvrirait
#   l'API d'une instance aux agents d'une autre).
# Hôtes : api.anthropic.com seul (code.claude.com/docs/en/network-config, relevé le 16/10/2026 :
# requêtes du modèle, WebSearch exécuté côté Anthropic, contrôle de domaine de WebFetch). Le
# jeton longue durée CLAUDE_CODE_OAUTH_TOKEN ne demande ni claude.ai ni platform.claude.com
# (connexion et rafraîchissement OAuth) ; télémétrie coupée par l'environnement.
HOTES_RESEAU_CLAUDE = ("api.anthropic.com",)


def config_adaptateur(agent: dict, adaptateur: dict) -> dict:
    env = {cle: {"type": "plain", "value": val} for cle, val in adaptateur["envPortable"].items()}
    if adaptateur["engine"] != "cli":
        raise ErreurAtelier("le confinement filesystemScope/networkScope exige engine « cli » (ACP refusé par le socle)")
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
        "filesystemScope": "workspace",
        "networkScope": "allowlist",
        "networkAllowlist": list(HOTES_RESEAU_CLAUDE),
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
    return {"command": "node", "args": [SCRIPT_AGENT_DETERMINISTE], "timeoutSec": 300}


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


def consignes_communes(marketing: bool) -> str:
    """Consignes communes d'un agent : le tronc commun, plus le complément marketing si l'agent est du marketing.
    Pour un autre service, les emplacements « [[marketing:nom]] » disparaissent (ou prennent leur texte de repli
    « [[marketing:nom|repli]] ») ; pour le marketing, la section « hors-marketing » (échanges entre services) disparaît."""
    texte = CONSIGNES_COMMUNES.read_text(encoding="utf-8")
    blocs: dict[str, str] = {}
    if marketing:
        morceaux = re.split(r"(?m)^<!-- bloc : ([a-z-]+) -->\n", CONSIGNES_MARKETING.read_text(encoding="utf-8"))
        blocs = {morceaux[i]: morceaux[i + 1].rstrip("\n") for i in range(1, len(morceaux) - 1, 2)}
        texte = re.sub(r"(?s)<!-- hors-marketing:début -->\n.*?<!-- hors-marketing:fin -->\n\n?", "", texte)
    else:
        texte = re.sub(r"<!-- hors-marketing:(?:début|fin) -->\n", "", texte)
    emplacements = set(re.findall(r"\[\[marketing:([a-z-]+)", texte))
    if marketing and emplacements != set(blocs):
        raise ErreurAtelier(f"consignes marketing : blocs {sorted(blocs)} différents des emplacements du tronc {sorted(emplacements)}")
    # Emplacement seul sur sa ligne (suivi d'une ligne vide) : bloc entier, ligne vide comprise.
    texte = re.sub(r"(?m)^\[\[marketing:([a-z-]+)\]\]\n\n",
                   lambda m: blocs[m.group(1)] + "\n\n" if marketing else "", texte)
    # Emplacement dans une phrase : bloc, ou texte de repli.
    texte = re.sub(r"\[\[marketing:([a-z-]+)(?:\|([^\]]*))?\]\]",
                   lambda m: blocs[m.group(1)] if marketing else (m.group(2) or ""), texte)
    return texte.strip("\n") + "\n"


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

    communes_marketing = consignes_communes(True)
    for agent in reg_agents["agents"]:
        chemin = ORGA / "agents" / agent["slug"] / "AGENTS.md"
        if not chemin.exists():
            raise ErreurAtelier(f"instructions manquantes : {chemin.relative_to(RACINE)}")
        _, corps = separer_frontmatter(chemin.read_text(encoding="utf-8"))
        corps = corps.split(MARQUEUR_CONSIGNES_COMMUNES)[0].rstrip("\n") + "\n"
        if not agent.get("deterministe"):
            corps_role = corps
            corps += "\n" + MARQUEUR_CONSIGNES_COMMUNES + "\n\n" + communes_marketing
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
    rapprochement : l'identité d'un client repose sur le registre local (voir lire_registre_client). Le « : » ne peut pas
    suivre le marqueur : « atelier-client:abc » n'est pas dans « atelier-client:abc:juridique » (marqueur d'un service)."""
    return re.search(r"(?<![A-Za-z0-9_-])" + re.escape(marqueur) + r"(?![A-Za-z0-9_:-])", description or "") is not None


def trouver_entreprise(api: Api, reg_orga: dict):
    """Renvoie l'entreprise modèle ou None. Refuse toute ambiguïté."""
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
        raise ErreurAtelier(f"plusieurs entreprises modèles trouvées ({ids}) : rien n'est modifié.")
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


# Revue de sécurité du 18/10/2026, M4 : curl ne doit écrire aucun fichier (un « curl -o » dans ./.claude/ ou dans la
# configuration de l'agent changerait ses permissions ou son hook au prochain run) ni lire une URL file:. Règles
# « deny » (elles priment sur toute autorisation, code.claude.com/docs/en/permissions, « Rules are evaluated in order:
# deny, then ask, then allow », relevé le 18/10/2026). La même page prévient qu'un motif qui contraint les arguments est
# fragile (« Bash permission patterns that try to constrain command arguments are fragile ») : options groupées
# (-sSo) et variantes sont refusées par le hook PreToolUse de scripts/hooks/garde-memoire.mjs, qui découpe la commande.
REFUS_CURL_ECRITURE = (
    "Bash(curl -o *)", "Bash(curl * -o *)", "Bash(curl -o*)", "Bash(curl * -o*)",
    "Bash(curl *--output*)",
    "Bash(curl -O*)", "Bash(curl * -O*)", "Bash(curl *--remote-name*)", "Bash(curl * -J*)",
    "Bash(curl -D *)", "Bash(curl * -D *)", "Bash(curl *--dump-header*)",
    "Bash(curl -c *)", "Bash(curl * -c *)", "Bash(curl *--cookie-jar*)",
    "Bash(curl -K*)", "Bash(curl * -K*)", "Bash(curl *--config*)",
    "Bash(curl *--trace*)", "Bash(curl *--stderr*)", "Bash(curl *--libcurl*)", "Bash(curl *--etag-save*)",
    "Bash(curl *--hsts*)", "Bash(curl *--alt-svc*)", "Bash(curl *--create-dirs*)",
    "Bash(curl *file:*)", "Bash(curl *FILE:*)",
)
# Hook de la mémoire (M4) : script et motifs recopiés dans <configuration de l'agent>/hooks/, hors du cwd de l'agent.
# Le confinement Bubblewrap monte cette configuration en écriture (paperclip/packages/adapters/claude-local/src/server/
# execute.ts, managedPaths : sharedClaudeConfigDir « rw ») : des refus Edit sur ces chemins absolus (et sur la
# quarantaine) s'ajoutent donc ; l'agent n'a ni Bash hors curl ni écriture hors de son cwd (mode dontAsk).
SOURCE_HOOK_MEMOIRE = RACINE / "scripts" / "hooks" / "garde-memoire.mjs"
SOURCE_MOTIFS_INJECTION = PLUGIN / "src" / "serveur" / "motifs-injection.json"
NOEUD_HOOK = "/usr/bin/node"  # sous /usr, monté en lecture dans le confinement (local-process-sandbox.ts)
OUTILS_HOOK_MEMOIRE = "Write|Edit|MultiEdit|NotebookEdit|Bash"


def chemins_hook(config: Path) -> tuple[Path, Path]:
    return config / "hooks" / "garde-memoire.mjs", config / "hooks" / "motifs-injection.json"


def hooks_agent(config: Path, espace: Path, memoire: bool) -> dict:
    """Section « hooks » du settings.json : contrôle de curl pour tout agent, contrôle de ./memoire/ après chaque
    écriture pour un agent qui porte memoire-para."""
    script, motifs = chemins_hook(config)
    commande = " ".join(shlex.quote(str(x)) for x in (NOEUD_HOOK, script, espace / "memoire", motifs))
    hooks = {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": commande, "timeout": 10}]}]}
    if memoire:
        hooks["PostToolUse"] = [{"matcher": OUTILS_HOOK_MEMOIRE, "hooks": [{"type": "command", "command": commande, "timeout": 20}]}]
    return hooks


def reglages_agent(reg_agents: dict, config: Path, agent: dict | None = None, espace: Path | None = None) -> dict:
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
    refus.extend(REFUS_CURL_ECRITURE)
    # M4 : hook et réglages de chaque agent, et quarantaine de la mémoire, jamais modifiables par un agent (mêmes
    # règles pour toutes les entreprises : motifs sur les racines des configurations et des espaces).
    refus.extend([
        f"Edit(/{CONFIGS_CLAUDE}/**/hooks/**)", f"Edit(/{CONFIGS_CLAUDE}/**/settings.json)",
        f"Read(/{ESPACES}/**/memoire/{QUARANTAINE_MEMOIRE}/**)", f"Edit(/{ESPACES}/**/memoire/{QUARANTAINE_MEMOIRE}/**)",
    ])
    permissions["deny"] = refus
    permissions["allow"] = [f"Read(/{config}/projects/**)"]
    if agent is not None and espace is not None:
        reglages["hooks"] = hooks_agent(config, espace, COMPETENCE_MEMOIRE in agent.get("competences", []))
    return reglages


def installer_hook(config: Path) -> int:
    """Recopie le hook et les motifs d'injection dans la configuration de l'agent (lecture et exécution seules) ;
    rend le nombre de fichiers écrits (0 s'ils sont déjà à jour)."""
    ecrits = 0
    dossier = config / "hooks"
    if dossier.is_symlink():
        dossier.unlink()
    dossier.mkdir(parents=True, exist_ok=True)
    os.chmod(dossier, 0o700)
    for source, cible, mode in ((SOURCE_HOOK_MEMOIRE, chemins_hook(config)[0], 0o500), (SOURCE_MOTIFS_INJECTION, chemins_hook(config)[1], 0o400)):
        contenu = source.read_bytes()
        if cible.is_symlink():
            cible.unlink()
        if not cible.is_file() or cible.read_bytes() != contenu:
            if cible.exists():
                os.chmod(cible, 0o600)
            cible.write_bytes(contenu)
            ecrits += 1
        os.chmod(cible, mode)
    return ecrits


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
        reglages = json.dumps(reglages_agent(reg_agents, config, agent, espace), ensure_ascii=False, indent=2) + "\n"
        ecrits += installer_hook(config)
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

    Adaptateur claude_local du paquet + cwd et CLAUDE_CONFIG_DIR dédiés (+ jeton) ; agents déterministes :
    adaptateur process (aucun modèle), cwd = dossier du plugin.
    """
    espace, _ = dossiers_agent(company_id, slug)
    agent = next((a for a in reg_agents["agents"] if a["slug"] == slug), {})
    if agent.get("deterministe"):
        # Un programme déterministe, jamais de modèle ni de jeton.
        return {"adapterType": "process", "cwd": str(PLUGIN), "config": {**config_deterministe(agent), "cwd": str(PLUGIN)}}
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

def slug_depuis_nom(nom: str) -> str:
    """Slug d'un nom d'agent, sans accents : « Coordinateur général » -> « coordinateur-general ». Le nom affiché peut être
    accentué (source : AGENTS.md du service), le slug reste la clé de rapprochement : toute recherche d'agent par son nom
    passe par cette fonction (normaliser_slug seule transformerait « é » en « - »)."""
    return normaliser_slug(unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode())


MOTS_OUTILS = frozenset({"de", "des", "du", "d", "et", "la", "le", "les", "l", "a", "au", "aux", "en"})


def cle_souple(slug: str) -> str:
    """Slug sans mots outils : « Cellule de crise » (cellule-de-crise) et le dossier cellule-crise se rapprochent."""
    return "-".join(t for t in slug.split("-") if t not in MOTS_OUTILS)


def nom_correspond(nom: str, slug: str) -> bool:
    """Le nom affiché correspond au slug, exactement ou aux mots outils près."""
    s = slug_depuis_nom(nom)
    return s == slug or cle_souple(s) == cle_souple(slug)


_SLUGS_CONNUS: dict[str, str] | None = None


def slug_canonique(slug: str) -> str:
    """Slug du dépôt qui correspond à un slug tiré d'un nom : exact s'il existe, sinon celui qui lui correspond aux mots
    outils près (« Cellule de crise » -> cellule-crise), sinon le slug tel quel. Index des slugs connus : dossiers
    d'agents des services et du marketing, plus le Gardien ; une clé souple partagée par deux slugs n'est pas utilisée."""
    global _SLUGS_CONNUS
    if _SLUGS_CONNUS is None:
        connus = {GARDIEN_SLUG}
        connus.update(d.name for d in (ORGA / "agents").glob("*") if d.is_dir())
        connus.update(d.name for d in (ORGA / "services").glob("*/agents/*") if d.is_dir())
        souples: dict[str, str | None] = {}
        for c in connus:
            k = cle_souple(c)
            souples[k] = c if k not in souples else None
        _SLUGS_CONNUS = {**{k: v for k, v in souples.items() if v}, **{c: c for c in connus}}
    return _SLUGS_CONNUS.get(slug) or _SLUGS_CONNUS.get(cle_souple(slug)) or slug


def agents_par_slug(api: Api, company_id: str) -> dict[str, dict]:
    """Agents non résiliés indexés par le slug du dépôt qui correspond à leur nom (voir slug_canonique)."""
    sortie = {}
    for a in api.get(f"/companies/{company_id}/agents"):
        if a.get("status") == "terminated":
            continue
        sortie[slug_canonique(slug_depuis_nom(a["name"]))] = a
    return sortie


def renommages_agents(api: Api, company_id: str, reg_agents: dict) -> list[tuple[str, str, str, str]]:
    """Agents existants dont le nom diffère de celui du registre (slug, identifiant, nom actuel, nom voulu). Lecture seule."""
    presents = agents_par_slug(api, company_id)
    sortie = []
    for agent in reg_agents["agents"]:
        a = presents.get(agent["slug"])
        if not a:
            continue
        actuel, voulu = unicodedata.normalize("NFC", a["name"]), unicodedata.normalize("NFC", agent["nom"])
        if actuel != voulu:
            sortie.append((agent["slug"], a["id"], actuel, voulu))
    return sortie


def renommer_agents(api: Api, company_id: str, reg_agents: dict) -> list[tuple[str, str, str, str]]:
    """Renomme (PATCH /agents/<id>, nom seul) les agents dont le nom diffère du registre ; rend les renommages faits."""
    faits = renommages_agents(api, company_id, reg_agents)
    for _, aid, _, voulu in faits:
        api.appel("PATCH", f"/agents/{aid}", {"name": voulu})
    return faits


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
                    "timeoutSec", "graceSec", "extraArgs",
                    "filesystemScope", "networkScope", "networkAllowlist"):
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


# Appariement de l'import natif « replace » : Paperclip rapproche un agent du paquet d'un agent existant par la SEULE clé
# normalizeAgentUrlKey(nom de l'agent existant) == slug du paquet (server/src/services/company-portability.ts, preview :
# existingSlugToAgent puis existingSlugToAgent.get(manifestAgent.slug)), jamais par identifiant. Un agent nommé
# « Douane et origine » (clé douane-et-origine) ou « Prévision demande » (clé pr-vision-demande, l'accent devient un tiret)
# n'est donc pas reconnu par le slug douane-origine ou prevision-demande : l'import le CRÉE à nouveau et agents.create le
# suffixe (« Douane et origine 2 », deduplicateAgentName dans server/src/services/agents.ts). Parade : avant l'import, ces
# agents reçoivent un nom temporaire dont la clé vaut le slug du dépôt, et leur nom est rétabli juste après.
RE_SUFFIXE_DOUBLON = re.compile(r"(.+) ([2-9]|[1-9][0-9]+)")


def nom_appariement(slug: str) -> str:
    """Nom temporaire dont la clé Paperclip (normaliser_slug) vaut exactement le slug du dépôt."""
    for candidat in (libelle_agent(slug), slug):
        if normaliser_slug(candidat) == slug:
            return candidat
    raise ErreurAtelier(f"aucun nom d'appariement possible pour le slug {slug!r} (slug non normalisé)")


def appariements_import(api: Api, company_id: str, reg_agents: dict) -> list[tuple[str, str, str, str]]:
    """Agents du registre présents dans l'entreprise dont la clé Paperclip diffère du slug du dépôt : sans appariement,
    l'import « replace » les créerait en double. Rend (slug, identifiant, nom actuel, nom temporaire). Lecture seule ;
    ErreurAtelier si la clé voulue est déjà portée par un autre agent (l'import mettrait à jour le mauvais agent)."""
    tous = [a for a in api.get(f"/companies/{company_id}/agents") if a.get("status") != "terminated"]
    porteurs, par_slug = {}, {}
    for a in tous:
        porteurs.setdefault(normaliser_slug(a["name"]), []).append(a)
        par_slug.setdefault(slug_canonique(slug_depuis_nom(a["name"])), []).append(a)
    sortie, collisions = [], []
    for agent in reg_agents["agents"]:
        candidats = par_slug.get(agent["slug"], [])
        if len(candidats) > 1:
            collisions.append(f"{agent['slug']} : plusieurs agents y correspondent ("
                              + ", ".join(f"« {o['name']} » {o['id']}" for o in candidats) + ")")
            continue
        a = candidats[0] if candidats else None
        if not a or normaliser_slug(a["name"]) == agent["slug"]:
            continue
        autres = [o for o in porteurs.get(agent["slug"], []) if o["id"] != a["id"]]
        if autres:
            collisions.append(f"{agent['slug']} : la clé est déjà portée par « {autres[0]['name']} » ({autres[0]['id']}), "
                              f"l'agent du registre est « {a['name']} » ({a['id']})")
            continue
        sortie.append((agent["slug"], a["id"], a["name"], nom_appariement(agent["slug"])))
    if collisions:
        raise ErreurAtelier("collision de clé d'agent avant import (rien n'est écrit) : " + " | ".join(collisions))
    return sortie


def garde_creations_import(api: Api, company_id: str, avant: set[str], attendus: set[str]) -> list[str]:
    """Après un import dans une entreprise existante : tout agent créé par ce passage est mis en pause s'il ne l'est pas
    (un import n'allume jamais un agent) ; ErreurAtelier si l'un d'eux n'était pas attendu (slug hors des créations prévues
    ou nom suffixé « … N » d'un agent existant). Rend les noms des agents créés attendus."""
    agents = [a for a in api.get(f"/companies/{company_id}/agents") if a.get("status") != "terminated"]
    noms = {unicodedata.normalize("NFC", a["name"]) for a in agents if a["id"] in avant}
    crees, imprevus = [], []
    for a in agents:
        if a["id"] in avant:
            continue
        nom = unicodedata.normalize("NFC", a["name"])
        if a.get("status") not in STATUTS_AGENT_INACTIFS:
            api.appel("POST", f"/agents/{a['id']}/pause")
            print(f"  agent créé par l'import, mis en pause aussitôt (statut {a.get('status')}) : « {nom} »")
        m = RE_SUFFIXE_DOUBLON.fullmatch(nom)
        if slug_canonique(slug_depuis_nom(nom)) not in attendus or (m and m.group(1) in noms):
            imprevus.append(f"« {nom} » ({a['id']})")
        else:
            crees.append(nom)
    if imprevus:
        raise ErreurAtelier(f"l'import a créé {len(imprevus)} agent(s) que le registre n'attendait pas (doublons probables), "
                            f"tous mis en pause : {', '.join(imprevus)}. Contrôle et nettoyage : "
                            "« bootstrap-organisation.py nettoyer-doublons --client <slug> » (à blanc), puis --confirmer.")
    return crees


def importer_en_place(api: Api, fichiers, company_id: str, reg_agents: dict, selection, pause: bool) -> dict:
    """Import natif « replace » dans une entreprise existante, sans doublon possible : appariement des agents dont la clé
    Paperclip diffère du slug (nom temporaire, rétabli ensuite même si l'import échoue), puis garde sur les créations."""
    avant = {a["id"] for a in api.get(f"/companies/{company_id}/agents")}
    attendus = {a["slug"] for a in reg_agents["agents"]} - set(agents_par_slug(api, company_id))
    appariements = appariements_import(api, company_id, reg_agents)
    faits = []
    try:
        for slug, aid, actuel, temporaire in appariements:
            api.appel("PATCH", f"/agents/{aid}", {"name": temporaire})
            faits.append((slug, aid, actuel))
            print(f"  appariement avant import : {slug} : « {actuel} » -> « {temporaire} » (nom rétabli après l'import)")
        resultat = importer(api, fichiers, {"mode": "existing_company", "companyId": company_id}, "replace", selection,
                            pause=pause)
    finally:
        echecs = []
        for slug, aid, actuel in faits:
            try:
                api.appel("PATCH", f"/agents/{aid}", {"name": actuel})
            except ErreurAtelier as e:
                echecs.append(f"{slug} ({aid}) -> « {actuel} » : {e}")
        if echecs:
            raise ErreurAtelier("nom d'agent non rétabli après l'import (le relancer le rétablit) : " + " | ".join(echecs))
    garde_creations_import(api, company_id, avant, attendus)
    return resultat


CLES_CONSERVEES =("paperclipSkillSync", "instructionsFilePath", "instructionsRootPath",
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
    entreprise modèle sur la première."""
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
        print("assurer-connexions : aucune organisation modèle sur cette instance, rien à faire.")
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
    reg_orga["entreprise"] : celle de l'organisation modèle pour « appliquer », celle d'un client pour
    « nouveau-client » (mêmes étapes, mêmes fonctions). Renvoie l'identifiant de l'entreprise."""
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
            import_fait = importer_en_place(api, fichiers, company_id, reg_agents, selection, pause=creation)
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
        print("Aucune organisation modèle sur cette instance.")
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
    (re.compile(r"(?<![A-Za-z0-9.-])/(?:home|tmp|root|Users|mnt|media|var|opt|srv)/|(?<![A-Za-z])[A-Za-z]:\\[A-Za-z]"), "chemin local absolu"),
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
DOSSIER_MEMOIRES_EXPORT = "memoires-agents"
RE_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def empreinte_manifeste(fichiers: dict[str, str]) -> str:
    """Empreinte globale : SHA-256 des lignes « chemin:empreinte » triées."""
    return hashlib.sha256("\n".join(f"{c}:{h}" for c, h in sorted(fichiers.items())).encode("utf-8")).hexdigest()


def ecrire_manifeste_export(sortie: Path, company_id: str, contenus: dict[str, bytes], comptes_socle: dict[str, int] | None = None) -> dict:
    """Manifeste de l'export (entreprise, date, empreinte de chaque fichier) : aucune donnée personnelle.
    « purger » ne s'appuie que sur lui pour reconnaître un export récent et intact."""
    fichiers = {c: hashlib.sha256(v).hexdigest() for c, v in contenus.items()}
    manifeste = {
        "version": 1, "entrepriseId": company_id,
        "exporteLe": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fichiers": fichiers, "empreinte": empreinte_manifeste(fichiers),
    }
    if comptes_socle:
        manifeste["comptesSocle"] = dict(sorted(comptes_socle.items()))
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


DOSSIER_DONNEES_SOCLE = "donnees-socle"
# Tables que le socle efface à la suppression d'une entreprise (paperclip/server/src/services/companies.ts) et que
# l'export natif ne contient pas : journal d'activité, approbations, évènements de coût.
TABLES_SOCLE = ("activity_log", "approvals", "cost_events")
PG_HOTE, PG_UTILISATEUR, PG_BASE = "127.0.0.1", "paperclip", "paperclip"


def commande_psql(port: int) -> list[str]:
    """Commande psql (modèle : scripts/positions-prospects.py). Le mot de passe vient du seul environnement
    (PGPASSWORD), jamais d'un argument ni d'un fichier. ATELIER_PSQL remplace « psql » (tests : faux psql)."""
    import shlex
    base = shlex.split(os.environ.get("ATELIER_PSQL") or "psql")
    return [*base, "-h", PG_HOTE, "-p", str(port), "-U", PG_UTILISATEUR, "-d", PG_BASE, "-X", "-q", "-A", "-t", "-w",
            "-v", "ON_ERROR_STOP=1"]


def exporter_donnees_socle(port: int, company_id: str) -> tuple[dict[str, bytes], dict[str, int]]:
    """Lit en LECTURE SEULE (transaction BEGIN READ ONLY) activity_log, approvals et cost_events de l'entreprise, avec
    le compte count(*) pris dans la même transaction ; refuse si le nombre de lignes lues diffère du compte.
    Rend ({« donnees-socle/<table>.json » : octets}, comptes)."""
    if not RE_UUID.fullmatch(company_id):
        raise ErreurAtelier("identifiant d'entreprise invalide pour la lecture du socle")
    requetes = "".join(
        f"SELECT json_build_object('table', '{t}', "
        f"'compte', (SELECT count(*) FROM public.{t} WHERE company_id = '{company_id}'), "
        f"'lignes', (SELECT coalesce(json_agg(to_jsonb(x) ORDER BY x.id), '[]'::json) FROM public.{t} x WHERE x.company_id = '{company_id}'));\n"
        for t in TABLES_SOCLE)
    script = "BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ;\n" + requetes + "COMMIT;\n"
    try:
        r = subprocess.run(commande_psql(port), input=script, capture_output=True, text=True, check=False, timeout=600)
    except (OSError, subprocess.SubprocessError) as e:
        raise ErreurAtelier(f"lecture du socle impossible (psql) : {e}. Export refusé, rien n'a été écrit") from None
    if r.returncode != 0:
        raise ErreurAtelier(f"psql a échoué (code {r.returncode}) : {r.stderr.strip()[:300]}. Mot de passe dans PGPASSWORD, bon --pg-port ? "
                            "Export refusé, rien n'a été écrit")
    lus: dict[str, dict] = {}
    for ligne in r.stdout.splitlines():
        if not ligne.startswith("{"):
            continue
        try:
            o = json.loads(ligne)
        except ValueError:
            raise ErreurAtelier("réponse de psql illisible : export refusé, rien n'a été écrit") from None
        if isinstance(o, dict) and o.get("table") in TABLES_SOCLE:
            lus[o["table"]] = o
    contenus: dict[str, bytes] = {}
    comptes: dict[str, int] = {}
    for t in TABLES_SOCLE:
        o = lus.get(t)
        if o is None or not isinstance(o.get("lignes"), list) or not isinstance(o.get("compte"), int):
            raise ErreurAtelier(f"table {t} absente de la réponse de psql : export refusé, rien n'a été écrit")
        if len(o["lignes"]) != o["compte"]:
            raise ErreurAtelier(f"table {t} : {len(o['lignes'])} ligne(s) lues pour un compte de {o['compte']} : export refusé, rien n'a été écrit")
        comptes[t] = o["compte"]
        contenus[f"{DOSSIER_DONNEES_SOCLE}/{t}.json"] = (
            json.dumps(o["lignes"], indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    return contenus, comptes


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
        if args.pg_port is None:
            raise ErreurAtelier("--pg-port est obligatoire avec --entreprise (54329 pour l'instance 3100) : "
                                "le journal, les approbations et les coûts du socle sont archivés avec l'export")
        sortie = (Path(args.sortie) if args.sortie
                  else INSTANCE / "exports" / cible / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")).resolve()
    else:
        if not args.sortie:
            raise ErreurAtelier("--sortie est obligatoire sans --entreprise")
        e = trouver_entreprise(api, reg_orga)
        if not e:
            raise ErreurAtelier("aucune organisation modèle à exporter")
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
    # Données du plugin (seulement avec --entreprise : l'export de l'organisation modèle n'en a pas besoin).
    donnees_plugin = exporter_donnees_plugin(api, e["id"]) if args.entreprise else {}
    donnees_socle, comptes_socle = exporter_donnees_socle(args.pg_port, e["id"]) if args.entreprise else ({}, {})
    # Mémoire des agents (memoire-para, ./memoire/ de chaque espace) : portabilité du client (M3).
    memoires = memoires_pour_export(e["id"]) if args.entreprise else {}
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
    for chemin, octets in {**donnees_plugin, **donnees_socle, **memoires}.items():
        cible = (sortie / chemin).resolve()
        if not str(cible).startswith(str(sortie) + os.sep):
            raise ErreurAtelier(f"chemin d'export hors du dossier : {chemin}")
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_bytes(octets)
        ecrits[chemin] = octets
    print(f"{len(fichiers)} fichier(s) exporté(s) dans {sortie}")
    if memoires:
        print(f"Mémoire des agents : {len(memoires)} fichier(s) dans {DOSSIER_MEMOIRES_EXPORT}/")
    if donnees_plugin:
        lignes_plugin = sum(len(json.loads(o)) for o in donnees_plugin.values())
        print(f"Données du plugin : {lignes_plugin} ligne(s) dans {len(donnees_plugin)} table(s), écrites dans {DOSSIER_DONNEES_PLUGIN}/ (colonnes chiffrées non déchiffrées)")
    if donnees_socle:
        print(f"Données du socle : {sum(comptes_socle.values())} ligne(s) ({', '.join(f'{t} {n}' for t, n in comptes_socle.items())}), "
              f"écrites dans {DOSSIER_DONNEES_SOCLE}/ (lecture seule, comptes vérifiés)")
    manifeste = ecrire_manifeste_export(sortie, e["id"], ecrits, comptes_socle)
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
        print("Aucune entreprise modèle à supprimer.")
    if e:
        # Dossiers de CETTE entreprise seulement (ceux que « appliquer » a créés). Les anciens dossiers
        # partagés par rôle (disposition d'avant le cloisonnement) ne sont jamais touchés.
        for racine in (ESPACES, CONFIGS_CLAUDE):
            d = racine / e["id"]
            if RE_UUID.fullmatch(e["id"]) and d.is_dir() and not d.is_symlink() and d.parent == racine:
                shutil.rmtree(d)
    if ETAT_LOCAL.is_dir() and ETAT_LOCAL.parent == INSTANCE:
        shutil.rmtree(ETAT_LOCAL)
    print("Dossiers locaux de l'organisation modèle supprimés (espaces, configurations Claude dédiées, état).")
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
    mode = "reel"
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
        raise ErreurAtelier("aucune organisation modèle : lancez d'abord « appliquer », ou donnez --entreprise <identifiant>")
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
PREFIXE_MARQUEUR_ANCIEN = "atelier-demo:"
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


def fsma_valide(numero: str) -> bool:
    """Numéro FSMA de 5 ou 6 chiffres (aucun code factice admis)."""
    return re.fullmatch(r"\d{5,6}", str(numero).strip()) is not None


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


def registre_services() -> dict:
    """Registre des services (organisation/registre/services.json), chargé par scripts/atelier_services.py.
    Le script tourne en « python3 -I » : le dossier scripts/ n'est pas dans le chemin d'import, on charge par fichier."""
    spec = importlib.util.spec_from_file_location("atelier_services", RACINE / "scripts" / "atelier_services.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.charger_services()


def valider_services_fiche(fiche: dict, erreurs: list[str]) -> tuple[list[str], dict]:
    """Champs facultatifs « services » (liste de slugs du registre, ou « tous » ; défaut : marketing seul, pour rester
    compatible) et « budgets » (slug -> centimes). La Direction s'ajoute dès qu'il y a 2 services (hors Direction) ou plus.
    Rend les slugs retenus, dans l'ordre du registre, et les budgets."""
    try:
        actifs = [s["slug"] for s in registre_services()["services"] if s.get("actif")]
    except (OSError, ValueError, KeyError, TypeError) as e:
        erreurs.append(f"registre des services illisible : {e}")
        return [], {}
    brut = fiche.get("services")
    choisis: list[str] = []
    if brut is None:
        choisis = ["marketing"]
    elif brut == "tous" or brut == ["tous"]:
        choisis = list(actifs)
    elif (isinstance(brut, list) and brut and all(isinstance(x, str) for x in brut) and len(set(brut)) == len(brut)
          and "tous" not in brut):
        inconnus = [x for x in brut if x not in actifs]
        if inconnus:
            erreurs.append(f"services : service inconnu ou inactif : {', '.join(inconnus)} (disponibles : {', '.join(actifs)})")
        choisis = [x for x in brut if x in actifs]
    else:
        erreurs.append("services : liste non vide de slugs sans doublon, ou « tous »")
    if "marketing" not in actifs and brut is None:
        erreurs.append("services : le service marketing du défaut est absent ou inactif dans le registre")
    if len([x for x in choisis if x != "direction"]) >= 2 and "direction" not in choisis and "direction" in actifs:
        choisis.append("direction")
    choisis = [x for x in actifs if x in choisis]
    budgets = fiche.get("budgets", {})
    if not isinstance(budgets, dict):
        erreurs.append("budgets : objet {service: centimes} attendu")
        return choisis, {}
    for cle, v in budgets.items():
        if cle not in choisis:
            erreurs.append(f"budgets : « {cle} » n'est pas un service créé pour ce client ({', '.join(choisis)})")
        if isinstance(v, bool) or not isinstance(v, int) or v < 0:
            erreurs.append(f"budgets.{cle} : entier de centimes, zéro ou plus")
    return choisis, dict(budgets)


def valider_fiche(fiche: dict, reel: bool = True) -> dict:
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
    # Tout est réel : l'option --reel n'a plus d'effet (acceptée pour ne pas casser les appels existants).
    mode = fiche.get("mode") or "reel"
    if mode not in MODES:
        erreurs.append(f"mode : « reel » attendu ou champ absent (reçu : {mode!r}) ; il n'existe plus de mode démonstration")
    bce = fiche.get("numeroBce")
    if not isinstance(bce, str) or not bce_valide(bce):
        erreurs.append(f"numeroBce : numéro BCE invalide (10 chiffres, contrôle modulo 97) : {bce!r}")
    courtier = fiche.get("courtier", False)
    if not isinstance(courtier, bool):
        erreurs.append("courtier : true ou false attendu")
        courtier = False
    fsma = fiche.get("numeroFsma")
    if fsma is not None and (not isinstance(fsma, str) or not fsma_valide(fsma)):
        erreurs.append(f"numeroFsma : 5 ou 6 chiffres attendus : {fsma!r}")
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
    services, budgets = valider_services_fiche(fiche, erreurs)
    if erreurs:
        raise ErreurAtelier("fiche refusée, rien n'est écrit :\n  - " + "\n  - ".join(erreurs))
    return {**fiche, "services": services, "budgets": budgets, "nomCommercial": nom, "slug": slug, "mode": mode, "courtier": courtier,
            "numeroFsma": fsma, "langues": langues, "budgetIaMensuelCentimes": budget}


def organisation_client(reg_orga: dict, fiche: dict, nom: str | None = None, marqueur: str | None = None) -> dict:
    """Copie du registre d'organisation avec l'entreprise du client : nom, identifiant, marqueur
    « atelier-client:<slug> », description neutre (aucune donnée de l'organisation modèle) et objectifs génériques
    à partir des offres et des bureaux de la fiche. Agents, projets et routines restent ceux du registre."""
    marqueur = marqueur or f"{PREFIXE_MARQUEUR_CLIENT}{fiche['slug']}"
    nom = nom or fiche["nomCommercial"]
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
    """Registre du client (None s'il n'existe pas) ; ErreurAtelier s'il est illisible ou incohérent.

    Deux formats : l'ancien (une seule entreprise : « entrepriseId » = celle du marketing, clé « _ancienFormat »
    ajoutée à la lecture) et le courant (version 2 : « entreprises » = service -> {entrepriseId, nom, marqueur}).
    Dans les deux cas le résultat porte « entreprises » ; « entrepriseId » reste l'entreprise principale
    (marketing, sinon la première)."""
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
        if "entreprises" not in r:
            r["entreprises"] = {"marketing": {"entrepriseId": r["entrepriseId"], "nom": None, "marqueur": f"{PREFIXE_MARQUEUR_CLIENT}{slug}"}}
            r["_ancienFormat"] = True
        entreprises = r["entreprises"]
        if not isinstance(entreprises, dict) or not entreprises:
            raise ValueError("« entreprises » doit être un objet non vide")
        for service, e in entreprises.items():
            if (not RE_SLUG_REGISTRE.fullmatch(str(service)) or not isinstance(e, dict) or not isinstance(e.get("entrepriseId"), str)
                    or not RE_UUID.fullmatch(e["entrepriseId"]) or not isinstance(e.get("marqueur"), str) or not e["marqueur"]
                    or not (e.get("nom") is None or isinstance(e["nom"], str))):
                raise ValueError(f"entreprise du service {service!r} mal formée")
        ids = [e["entrepriseId"] for e in entreprises.values()]
        if len(set(ids)) != len(ids):
            raise ValueError("deux services désignent la même entreprise")
    except (ValueError, OSError) as e:
        raise ErreurAtelier(f"registre local du client {slug} illisible ou incohérent ({e}) : {chemin}") from None
    return r


def slug_client_par_entreprise(company_id: str) -> str | None:
    """Slug du client dont le registre porte cet identifiant d'entreprise, quel que soit son service (None si aucun) ;
    ErreurAtelier si deux registres le revendiquent. Un registre illisible ne désigne personne."""
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
            if r and any(e["entrepriseId"] == company_id for e in r["entreprises"].values()):
                trouves.append(d.name)
    if len(trouves) > 1:
        raise ErreurAtelier(f"plusieurs registres locaux désignent l'entreprise {company_id} ({', '.join(trouves)}) : rien n'est modifié.")
    return trouves[0] if trouves else None


def ecrire_registre_client(slug: str, numero_bce: str, entreprises: dict[str, dict], cree_le: str | None = None) -> Path:
    """Écrit (atomiquement) le registre au format courant : dossier 0700, fichier 0600. « entreprises » : service ->
    {entrepriseId, nom, marqueur}."""
    d = dossier_client(slug)
    d.parent.mkdir(parents=True, exist_ok=True)
    d.mkdir(exist_ok=True)
    os.chmod(d, 0o700)
    principale = entreprises.get("marketing") or next(iter(entreprises.values()))
    contenu = {"version": 2, "entrepriseId": principale["entrepriseId"], "numeroBce": normaliser_bce(numero_bce), "slug": slug,
               "creeLe": cree_le or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "entreprises": {s: {"entrepriseId": e["entrepriseId"], "nom": e.get("nom"), "marqueur": e["marqueur"]}
                               for s, e in entreprises.items()}}
    chemin, tmp = d / FICHIER_REGISTRE_CLIENT, d / f".{FICHIER_REGISTRE_CLIENT}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(contenu, indent=2, ensure_ascii=False) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, chemin)
    return chemin


def noter_entreprise_registre(slug: str, numero_bce: str, registre: dict | None, service: str, entree: dict) -> dict:
    """Inscrit (ou confirme) l'entreprise d'un service dans le registre ; ne réécrit que si le contenu change ou si
    l'ancien format doit être migré. Rend le registre à jour."""
    entreprises = dict(registre["entreprises"]) if registre else {}
    ancien = bool(registre and registre.get("_ancienFormat"))
    if entreprises.get(service) != entree or ancien:
        entreprises[service] = entree
        ecrire_registre_client(slug, numero_bce, entreprises, registre.get("creeLe") if registre else None)
    return lire_registre_client(slug)


def verifier_identite_client(slug: str, numero_bce: str, registre: dict | None, existante: dict | None,
                             service: str = "marketing", marqueur: str | None = None) -> None:
    """Refus (rien n'est écrit) si l'entreprise retrouvée par marqueur n'est pas celle du registre pour ce service, si le
    registre manque alors qu'une entreprise porte le marqueur, ou si le BCE de la fiche diffère de celui du registre."""
    marqueur = marqueur or f"{PREFIXE_MARQUEUR_CLIENT}{slug}"
    entree = ((registre or {}).get("entreprises") or {}).get(service)
    if registre is not None and normaliser_bce(registre["numeroBce"]) != normaliser_bce(numero_bce):
        raise ErreurAtelier(
            f"le BCE de la fiche ({numero_bce}) diffère de celui du registre local du client {slug} ({registre['numeroBce']}) : "
            "deux clients différents ne peuvent pas partager un nom. Refusé, rien n'est écrit.")
    if existante is not None:
        if entree is None:
            raise ErreurAtelier(
                f"l'entreprise « {existante.get('name')} » ({existante.get('id')}) porte le marqueur {marqueur}, mais aucun "
                f"registre local ne la désigne (le marqueur est modifiable par les agents : il ne prouve rien). Refusé, rien n'est écrit. "
                f"Si c'est bien l'entreprise de ce client : {AIDE_ENREGISTRER}.")
        if entree["entrepriseId"] != existante.get("id"):
            raise ErreurAtelier(
                f"l'entreprise « {existante.get('name')} » ({existante.get('id')}) porte le marqueur {marqueur}, mais le registre "
                f"local désigne l'entreprise {entree['entrepriseId']} : refusé, rien n'est écrit.")
    elif entree is not None:
        raise ErreurAtelier(
            f"le registre local du client {slug} désigne l'entreprise {entree['entrepriseId']} (service {service}), mais aucune entreprise "
            f"ne porte ce nom et ce marqueur (renommée, marqueur retiré ou supprimée) : refusé, rien n'est écrit. Corrigez l'entreprise, "
            f"ou supprimez le dossier {dossier_client(slug)} si elle a été supprimée à dessein.")


def retrouver_entreprise_client(api: Api, reg_orga: dict, reg_orga_client: dict) -> dict | None:
    """Entreprise du client retrouvée par son marqueur ; refus clair si elle touche à l'organisation modèle."""
    e_demo, e_client = reg_orga["entreprise"], reg_orga_client["entreprise"]
    nom_demo = unicodedata.normalize("NFC", e_demo["nom"])
    if e_client["slug"] == e_demo["slug"] or unicodedata.normalize("NFC", e_client["nom"]) == nom_demo:
        raise ErreurAtelier("le nom de la fiche est celui de l'organisation modèle : refusé, rien n'est écrit.")
    for c in api.get("/companies"):
        description = c.get("description") or ""
        if porte_marqueur(description, e_client["marqueur"]) and (e_demo["marqueur"] in description or PREFIXE_MARQUEUR_ANCIEN in description
                                                    or unicodedata.normalize("NFC", c.get("name") or "") == nom_demo):
            raise ErreurAtelier(
                f"l'entreprise « {c.get('name')} » ({c.get('id')}) porte le marqueur {e_client['marqueur']} mais appartient "
                "à l'organisation modèle : refusé, rien n'est modifié."
            )
    return trouver_entreprise(api, reg_orga_client)


def entreprise_modele(societe: dict, reg_orga: dict) -> bool:
    """Vrai si l'entreprise est (ou se dit) celle de l'organisation modèle : marqueur ou nom."""
    description = societe.get("description") or ""
    demo = reg_orga["entreprise"]
    return (PREFIXE_MARQUEUR_ANCIEN in description or demo["marqueur"] in description
            or unicodedata.normalize("NFC", societe.get("name") or "") == unicodedata.normalize("NFC", demo["nom"]))


def bce_de_la_marque(marque: dict | None) -> set[str]:
    """Numéros BCE (normalisés) des entités du référentiel de marque enregistré dans le plugin."""
    return {normaliser_bce(i.get("valeur")) for e in (marque or {}).get("entites") or [] for i in e.get("identifiants") or []
            if i.get("type") == "bce"}


def enregistrer_existante(args, fiche: dict) -> int:
    """Migration : crée le registre local d'une entreprise cliente créée avant son introduction. Aucune écriture dans
    l'API : le registre n'est créé qu'après contrôle (entreprise existante, hors organisation modèle, nom et marqueur de la
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
    if entreprise_modele(societe, reg_orga):
        raise ErreurAtelier("enregistrement refusé : c'est l'entreprise modèle. Rien n'est écrit.")
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
        chemin = ecrire_registre_client(slug, fiche["numeroBce"], {"marketing": {"entrepriseId": cid, "nom": fiche["nomCommercial"], "marqueur": marqueur}})
    print(f"Registre local écrit : {chemin} (entreprise {cid}).")
    return 0


# ---------------------------------------------------------------------------
# Une entreprise par service (registre organisation/registre/services.json)
# ---------------------------------------------------------------------------

# Gabarits d'agents du registre marketing dont les services reprennent les réglages (modèle, effort, tours, budget,
# outils) : le coordinateur du service part du « coordinateur », ses spécialistes de la « veille », sans la recherche
# sur le web (WebSearch devient interdit : un service n'en a pas besoin pour traiter ses propres dossiers).
GABARIT_COORDINATEUR, GABARIT_SPECIALISTE = "coordinateur", "veille"
ENTREES_SERVICE = ["demandes affectées par le coordinateur du service", "documents et données de l'entreprise cliente"]
SORTIES_SERVICE = ["livrables du service avec sources et réserves", "demandes tracées vers les autres services (par leur coordinateur)"]
CRITERES_SERVICE = ["aucune information présentée comme un fait sans source",
                    "aucune décision réservée à un humain n'est prise ni annoncée comme prise"]


def libelle_agent(slug: str) -> str:
    return slug.replace("-", " ").capitalize()


RE_NOM_COMPETENCE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def competences_entete(texte: str, service: str, agent: str) -> list[str]:
    """Liste « skills: » de l'en-tête d'un AGENTS.md de service (absente ou « [] » : aucune compétence). Chaque nom doit
    être un dossier organisation/skills/<nom>/ avec son SKILL.md : sinon erreur explicite (agent et compétence nommés),
    jamais d'échec silencieux."""
    fm, _ = separer_frontmatter(texte)
    noms: list[str] = []
    dans_liste = False
    for ligne in (fm or "").splitlines():
        if dans_liste:
            m = re.match(r"^\s+-\s*(.+?)\s*$", ligne)
            if m:
                noms.append(m.group(1).strip("\"'"))
                continue
            if ligne.strip():
                dans_liste = False
        m = re.match(r"^skills:\s*(.*?)\s*$", ligne)
        if m:
            reste = m.group(1)
            if reste in ("", "[]"):
                dans_liste = reste == ""
            elif reste.startswith("[") and reste.endswith("]"):
                try:  # liste en ligne : skills: ["a", "b"]
                    noms = [str(x) for x in json.loads(reste)]
                except ValueError:
                    raise ErreurAtelier(f"agent {agent} du service {service} : la liste « skills » de son AGENTS.md est illisible : {reste}") from None
            else:
                raise ErreurAtelier(f"agent {agent} du service {service} : la clé « skills » de son AGENTS.md doit être une liste YAML (« - nom »)")
    for nom in noms:
        if not RE_NOM_COMPETENCE.match(nom) or not (ORGA / "skills" / nom / "SKILL.md").is_file():
            raise ErreurAtelier(
                f"agent {agent} du service {service} : compétence « {nom} » déclarée dans son AGENTS.md "
                f"mais absente du dépôt (organisation/skills/{nom}/SKILL.md)")
    if len(set(noms)) != len(noms):
        raise ErreurAtelier(f"agent {agent} du service {service} : compétence déclarée deux fois dans son AGENTS.md")
    return noms


def consigne_minimale(svc: dict, agent: dict) -> str:
    """Consigne de repli d'un agent dont le fichier organisation/services/<service>/agents/<agent>/AGENTS.md manque."""
    humain = "\n".join(f"- {x}" for x in svc["humainSeul"])
    return (f"# {agent['titre']}\n\n"
            f"Consigne à rédiger : ce rôle du service {svc['nom']} n'a pas encore de consigne détaillée dans le dépôt "
            f"(organisation/services/{svc['slug']}/agents/{agent['slug']}/AGENTS.md).\n\n"
            f"Mission : {agent['mission']}\n\n"
            "Tant que la consigne n'est pas rédigée : n'agis que sur les tâches qui te sont affectées, ne produis que des brouillons "
            "sourcés, signale ce qui te manque au coordinateur du service et ne prends aucune décision à la place d'un humain.\n\n"
            f"Décisions réservées à un humain :\n{humain}\n")


def agents_service(reg_agents: dict, svc: dict) -> tuple[list[dict], dict[str, str], list[str]]:
    """Agents d'un service (hors marketing) au format du registre d'agents, leur corps de consigne (sans consignes communes) et les
    avertissements. Le coordinateur (rôle ceo) ne rapporte à personne ; les autres lui rapportent.
    Direction (champ « coordinateurGeneral ») : le coordinateur général est le rôle ceo, seul interlocuteur de l'humain
    (discussion de l'atelier, demandes du bureau de liaison adressées à la Direction) ; le coordinateur du service lui
    rapporte et reste un coordinateur de département comme les autres (ses spécialistes lui rapportent)."""
    gabarits = {a["slug"]: a for a in reg_agents["agents"]}
    agents, corps_par_slug, avertissements = [], {}, []
    general = svc.get("coordinateurGeneral")
    for slug in svc["agents"]:
        est_general = slug == general
        coordinateur = slug == svc["coordinateur"] or est_general
        a = json.loads(json.dumps(gabarits[GABARIT_COORDINATEUR if coordinateur else GABARIT_SPECIALISTE]))
        nom, titre = libelle_agent(slug), f"{svc['nom']} · {libelle_agent(slug)}"
        fichier = ORGA / "services" / svc["slug"] / "agents" / slug / "AGENTS.md"
        corps = None
        competences: list[str] = []
        if fichier.is_file():
            competences = competences_entete(fichier.read_text(encoding="utf-8"), svc["slug"], slug)
            entete, corps_brut = entete_simple(fichier.read_text(encoding="utf-8"))
            if isinstance(entete.get("name"), str) and nom_correspond(entete["name"], slug):
                nom = entete["name"]
            if isinstance(entete.get("title"), str) and entete["title"].strip():
                titre = entete["title"]
            corps = corps_brut.split(MARQUEUR_CONSIGNES_COMMUNES)[0].strip()
        a.update({
            "slug": slug, "nom": nom, "titre": titre,
            "role": "ceo" if est_general or (coordinateur and not general) else "general",
            "rapporteA": None if est_general or (coordinateur and not general) else (general if coordinateur else svc["coordinateur"]),
            "mission": ("Coordinateur général : seul interlocuteur de l'humain, délègue aux coordinateurs de département par le "
                        "bureau de liaison, consolide leurs réponses sans fusionner les validations et ne décide, ne publie, "
                        "n'envoie ni ne dépense rien." if est_general
                        else f"Coordonne le service {svc['nom']} : répartit les demandes entre les spécialistes, contrôle les livrables "
                        "et prépare le dossier de validation humaine." if coordinateur
                        else f"{titre} : traite les tâches que le coordinateur du service {svc['nom']} lui affecte."),
            "entrees": list(ENTREES_SERVICE), "sorties": list(SORTIES_SERVICE), "criteresReussite": list(CRITERES_SERVICE),
            "competences": avec_competences_communes(competences, ecrit_des_fichiers(a["outils"])), "competencesObligatoires": [], "connexions": {},
            "relit": [], "roleRevue": None,
        })
        if not coordinateur:
            a["outils"]["recherche"] = [o for o in a["outils"]["recherche"] if o != "WebSearch"]
            if "WebSearch" not in a["outils"]["interdits"]:
                a["outils"]["interdits"].append("WebSearch")
        if not corps:
            avertissements.append(
                f"AVERTISSEMENT : consigne à rédiger pour l'agent {slug} du service {svc['slug']} "
                f"(fichier attendu : organisation/services/{svc['slug']}/agents/{slug}/AGENTS.md) ; consigne minimale générée.")
            corps = consigne_minimale(svc, a).strip()
        corps_par_slug[slug] = corps + "\n"
        agents.append(a)
    return agents, corps_par_slug, avertissements


def reg_agents_service(reg_agents: dict, agents: list[dict]) -> dict:
    copie = json.loads(json.dumps(reg_agents))
    copie["agents"] = agents
    return copie


def budget_service(fiche: dict, svc: dict, agents: list[dict] | None) -> int:
    """Budget IA mensuel de l'entreprise du service, en centimes : celui de la fiche (champ « budgets »), sinon pour le
    marketing le budget de la fiche (« budgetIaMensuelCentimes », comme avant), sinon la somme des budgets mensuels
    de ses agents (plafond cohérent avec leurs propres budgets)."""
    if svc["slug"] in fiche["budgets"]:
        return fiche["budgets"][svc["slug"]]
    if svc["slug"] == "marketing":
        return fiche["budgetIaMensuelCentimes"]
    return sum(a["budgetMensuelCentimes"] for a in agents or [])


def identite_service(fiche: dict, svc: dict, registre: dict | None) -> tuple[str, str]:
    """(nom, marqueur) de l'entreprise d'un service. L'identité déjà inscrite au registre local prime (une entreprise
    existante n'est jamais renommée). Sinon : marketing seul = nom commercial et « atelier-client:<slug> » (compatible
    avec l'existant) ; autrement « <nom commercial> · <service> » et « atelier-client:<slug>:<service> »."""
    entree = ((registre or {}).get("entreprises") or {}).get(svc["slug"])
    if entree:
        return entree.get("nom") or fiche["nomCommercial"], entree["marqueur"]
    if svc["slug"] == "marketing" and fiche["services"] == ["marketing"]:
        return fiche["nomCommercial"], f"{PREFIXE_MARQUEUR_CLIENT}{fiche['slug']}"
    return f"{fiche['nomCommercial']} · {svc['nom']}", f"{PREFIXE_MARQUEUR_CLIENT}{fiche['slug']}:{svc['slug']}"


def organisation_service(reg_orga: dict, fiche: dict, svc: dict, nom: str, marqueur: str) -> dict:
    """Organisation (au format organisation.json) de l'entreprise d'un service : celle du marketing reste l'organisation
    actuelle ; les autres n'ont ni objectifs, ni projets, ni routines (rien n'est inventé pour eux)."""
    if svc["slug"] == "marketing":
        return organisation_client(reg_orga, fiche, nom=nom, marqueur=marqueur)
    return {
        "version": reg_orga["version"],
        "entreprise": {
            **reg_orga["entreprise"], "nom": nom, "slug": f"{fiche['slug']}-{svc['slug']}", "marqueur": marqueur,
            "description": (f"Service {svc['nom']} de l'entreprise cliente de l'Atelier Marketing IA ({fiche['mode']}). "
                            f"Préfixe de service : {svc['prefixe']}. Marqueur de périmètre : {marqueur}."),
        },
        "objectifs": [], "projets": [], "routines": [],
    }


def fichiers_service(reg_agents_s: dict, reg_s: dict, svc: dict, corps_par_slug: dict[str, str]) -> dict[str, str]:
    """Paquet natif d'un service : COMPANY.md, .paperclip.yaml et un AGENTS.md par agent (consigne du dépôt ou de repli,
    puis consignes communes et fiche des routes, comme « generer » le fait pour le marketing)."""
    e = reg_s["entreprise"]
    fichiers = {
        "COMPANY.md": avec_frontmatter(
            {"schema": "agentcompanies/v1", "kind": "company", "slug": e["slug"], "name": e["nom"],
             "description": e["description"], "version": reg_s["version"], "goals": []},
            f"\n# {e['nom']}\n\nService {svc['nom']} d'une entreprise cliente de l'Atelier Marketing IA, créé par "
            "`scripts/bootstrap-organisation.py nouveau-client`. Les agents et leurs consignes viennent du dépôt "
            f"(`organisation/services/{svc['slug']}/`).\n"),
        ".paperclip.yaml": yaml_texte(construire_extension(reg_agents_s, reg_s)),
    }
    communes = consignes_communes(svc["slug"] == "marketing")
    # Compétences déclarées par les agents du service : leurs dossiers entrent dans le paquet (comme pour le marketing).
    for nom in sorted({c for a in reg_agents_s["agents"] for c in a["competences"]}):
        dossier = ORGA / "skills" / nom
        for f in sorted(p for p in dossier.rglob("*") if p.is_file()):
            fichiers[f.relative_to(ORGA).as_posix()] = f.read_text(encoding="utf-8")
    for a in reg_agents_s["agents"]:
        corps = corps_par_slug[a["slug"]]
        fiche = fiche_routes_agent(a, corps)
        corps += "\n" + MARQUEUR_CONSIGNES_COMMUNES + "\n\n" + communes + ("\n" + fiche if fiche else "")
        fichiers[f"agents/{a['slug']}/AGENTS.md"] = avec_frontmatter(
            {"kind": "agent", "slug": a["slug"], "name": a["nom"], "title": a["titre"], "reportsTo": a["rapporteA"], "skills": a["competences"]}, corps)
    return fichiers


def etat_service_a_jour(api: Api, company_id: str, reg_agents: dict, fichiers: dict[str, str], empreinte: str,
                        jeton_id: str | None, mode: str) -> list[str]:
    """Raisons pour lesquelles l'entreprise d'un service n'est pas à jour (vide = à jour) : comme etat_a_jour, avec
    les compétences déclarées par ses agents (champ « skills » de leur AGENTS.md) ; les instructions sont comparées au paquet du service."""
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
    return raisons


def synchroniser_instructions_service(api: Api, company_id: str, reg_agents: dict, fichiers: dict[str, str]) -> int:
    """Comme synchroniser_instructions, avec les consignes du paquet du service (révision canonique de Paperclip)."""
    agents = agents_par_slug(api, company_id)
    ecritures = 0
    for agent in reg_agents["agents"]:
        a = agents.get(agent["slug"])
        if not a:
            continue
        fichier = api.get(f"/agents/{a['id']}/instructions-bundle/file?path=AGENTS.md")
        voulu = separer_frontmatter(fichiers[f"agents/{agent['slug']}/AGENTS.md"])[1].strip()
        if (fichier or {}).get("content") == voulu:
            continue
        api.appel("PUT", f"/agents/{a['id']}/instructions-bundle/file", {
            "path": "AGENTS.md", "content": voulu, "baseHash": (fichier or {}).get("contentHash")})
        ecritures += 1
    return ecritures


def appliquer_service(api: Api, reg_agents: dict, reg_orga: dict, fichiers: dict[str, str], mode: str,
                      dossier_etat: Path) -> str:
    """Applique l'organisation d'UN service (hors marketing) à son entreprise, retrouvée par nom et marqueur de
    reg_orga["entreprise"] : import natif (création, puis mise à jour en place), instructions, dossiers locaux propres à
    l'entreprise, liaison locale des agents. Idempotent. Rend l'identifiant de l'entreprise."""
    empreinte = hashlib.sha256((empreinte_paquet(fichiers) + ":" + mode).encode()).hexdigest()
    slugs = [a["slug"] for a in reg_agents["agents"]]
    entreprise = trouver_entreprise(api, reg_orga)
    import_fait = None
    if entreprise is None:
        print(f"Création de « {reg_orga['entreprise']['nom']} » par import natif (agents en pause).")
        import_fait = importer(api, fichiers, {"mode": "new_company", "newCompanyName": reg_orga["entreprise"]["nom"]}, "rename", None)
        entreprise = trouver_entreprise(api, reg_orga)
        if entreprise is None:
            raise ErreurAtelier("l'import a réussi mais l'entreprise reste introuvable par son nom et son marqueur")
    company_id = entreprise["id"]
    reglages_ecrits = preparer_dossiers_locaux(company_id, reg_agents)
    secret = secret_jeton(api, company_id)
    jeton_id = secret["id"] if secret else None
    instructions_sync = 0
    if import_fait is None:
        instructions_sync = synchroniser_instructions_service(api, company_id, reg_agents, fichiers)
        raisons = etat_service_a_jour(api, company_id, reg_agents, fichiers, empreinte, jeton_id, mode)
        if raisons:
            print("Mise à jour en place (import natif, stratégie replace) :")
            for r in raisons:
                print(f"  - {r}")
            creation = any(r.startswith("agent absent") for r in raisons)
            import_fait = importer_en_place(api, fichiers, company_id, reg_agents, None, pause=creation)
    if import_fait is not None:
        for w in import_fait.get("warnings") or []:
            print(f"  avertissement Paperclip : {w}")
        echecs = [w for w in import_fait.get("warnings") or [] if w.startswith("Failed to")]
        if echecs:
            raise ErreurAtelier("l'import a laissé des échecs : " + " | ".join(echecs))
    liaisons = lier_agents(api, company_id, reg_agents, empreinte, jeton_id, mode)
    agents = agents_par_slug(api, company_id)
    etat = {"schema": "atelier/etat-bootstrap-service/v1", "api": api.base, "companyId": company_id,
            "entreprise": reg_orga["entreprise"]["nom"], "empreintePaquet": empreinte, "mode": mode, "jetonSecretId": jeton_id,
            "agents": {s: {"id": agents[s]["id"], "nom": agents[s]["name"]} for s in slugs}}
    ecrits = ecrire_si_change(dossier_etat / "etat-bootstrap.json", json.dumps(etat, ensure_ascii=False, indent=2) + "\n")
    print(f"Entreprise : {company_id} (mode {mode}, agents en pause)")
    print(f"Import natif : {'oui' if import_fait is not None else 'non (déjà à jour)'}")
    print(f"Instructions mises à jour par révision : {instructions_sync}")
    print(f"Agents reliés localement : {liaisons} modifié(s) sur {len(slugs)}")
    print(f"Réglages Claude dédiés écrits : {reglages_ecrits} fichier(s) ; état local réécrit : {int(ecrits)}")
    for ecart in sorted(set(agents_par_slug(api, company_id)) - set(slugs)):
        print(f"  écart non géré (rien n'est supprimé automatiquement) : agent hors registre : {ecart}")
    return company_id


def plan_service(api: Api, reg_agents: dict, reg_orga: dict, fiche: dict, svc: dict, registre: dict | None) -> dict:
    """Prépare un service du client : identité, organisation, agents, budget, entreprise existante ; contrôle l'identité
    contre le registre local (refus avant toute écriture). Ne touche à l'API qu'en lecture."""
    nom, marqueur = identite_service(fiche, svc, registre)
    reg_s = organisation_service(reg_orga, fiche, svc, nom, marqueur)
    existante = retrouver_entreprise_client(api, reg_orga, reg_s)
    verifier_identite_client(fiche["slug"], fiche["numeroBce"], registre, existante, svc["slug"], marqueur)
    plan = {"svc": svc, "nom": nom, "marqueur": marqueur, "reg_s": reg_s, "existante": existante,
            "agents": None, "corps": {}, "avertissements": [], "reg_agents": reg_agents}
    if svc["slug"] != "marketing":
        plan["agents"], plan["corps"], plan["avertissements"] = agents_service(reg_agents, svc)
        plan["reg_agents"] = reg_agents_service(reg_agents, plan["agents"])
    plan["budget"] = budget_service(fiche, svc, plan["agents"])
    return plan


def ecritures_service(plan: dict, fiche: dict, referentiel: dict | None, actuel_marque: dict | None) -> list[str]:
    """Écritures prévues pour un service (liste lue par --a-blanc)."""
    svc, nom, marqueur, existante = plan["svc"], plan["nom"], plan["marqueur"], plan["existante"]
    cid, budget, lignes = (existante or {}).get("id"), plan["budget"], []
    if existante is None:
        lignes.append(f"créer l'entreprise « {nom} » (marqueur {marqueur}, mode {fiche['mode']}) par import natif")
    else:
        lignes.append(f"entreprise « {nom} » déjà présente ({cid}) : aucune création")
    if svc["slug"] == "marketing":
        lignes.append("organisation des agents (import natif si besoin, liaisons, objectifs, projets, routines, connexions, Gardien) : "
                      + ("création complète" if existante is None else "réconciliation idempotente, aucune écriture si déjà à jour"))
    else:
        noms = ", ".join(f"{a['slug']} ({a['role']})" for a in plan["agents"])
        lignes.append(f"organisation du service {svc['nom']} ({len(plan['agents'])} agents : {noms} ; import natif si besoin, liaisons) : "
                      + ("création complète" if existante is None else "réconciliation idempotente, aucune écriture si déjà à jour"))
        lignes.append(f"espace et configuration Claude de chaque agent sous {ESPACES}/<id entreprise>/<rôle> (et {CONFIGS_CLAUDE}/<id entreprise>/<rôle>)")
        lignes.extend(plan["avertissements"])
    if (existante or {}).get("budgetMonthlyCents") == budget:
        lignes.append(f"budget IA mensuel de l'entreprise : déjà {budget} centimes, aucune écriture")
    else:
        lignes.append(f"budget IA mensuel de l'entreprise : {budget} centimes (PATCH /companies/<id>/budgets)")
    if svc["slug"] == "marketing":
        if referentiel_a_jour(actuel_marque, referentiel):
            lignes.append("référentiel de marque : déjà à jour, aucune écriture")
        else:
            lignes.append(f"référentiel de marque (atelier.marque.enregistrer) : {len(referentiel['offres'])} offre(s), "
                          f"{len(referentiel['etablissements'])} bureau(x), {len(referentiel['segments'])} segment(s)"
                          + (f", module de conformité {MODULE_ASSURANCE}" if fiche["courtier"] else ""))
    return lignes


def configurer_plugin_client(api: Api, slug: str) -> None:
    """Bureau de liaison : configuration du plugin pour chaque entreprise du client qui n'en a pas. Sans elle, l'hôte
    refuse au facteur du bureau d'agir dans cette entreprise (essai réel L9 du 16/10/2026) : les demandes entre services
    resteraient en file. Une configuration existante n'est jamais réécrite ; relancer n'écrit rien.
    Même fonction que scripts/declarer-services.py (chargé par fichier : le script tourne en « python3 -I »), qui reste
    l'outil de la déclaration des services et de la matrice des flux (aucune route ne permet ici de la relire, donc de
    la rejouer sans écriture)."""
    spec = importlib.util.spec_from_file_location("declarer_services", RACINE / "scripts" / "declarer-services.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    ids = [e["entrepriseId"] for e in lire_registre_client(slug)["entreprises"].values()]
    creees = module.assurer_configurations(lambda m, c, corps=None: api.appel(m, c, corps), ids)
    print(f"Configuration du plugin (bureau de liaison) : {len(creees)} entreprise(s) configurée(s), {len(ids) - len(creees)} déjà configurée(s)")


RE_SUFFIXE_ANCIEN = re.compile(r"\s*\((?:démonstration|demonstration)\)\s*$", re.I)
RE_MARQUEUR_ANCIEN = re.compile(r"(?<![A-Za-z0-9_-])atelier-demo:[a-z0-9-]+(?![A-Za-z0-9_:-])")


class ApiEntreprisesSimulees(Api):
    """Lectures réelles, sauf la liste des entreprises : celle d'après la migration (planification et --a-blanc)."""

    def __init__(self, base: str, entreprises: list[dict]):
        super().__init__(base)
        self.simulees = entreprises

    def get(self, chemin):
        return self.simulees if chemin == "/companies" else super().get(chemin)


def preparer_migration_marketing(args, api: Api, fiche: dict) -> dict:
    """Contrôles (aucune écriture) de « nouveau-client --ajouter-services » : l'entreprise existe, son nom est celui de la
    fiche (sans « (démonstration) »), elle porte un ancien marqueur « atelier-demo: » à migrer ou déjà le marqueur du client, aucun
    registre local ne la rattache à un autre client, son BCE (référentiel de marque, s'il en a) est celui de la fiche.
    Rend le plan : société migrée, registre voulu, actions à faire (vide = déjà migrée)."""
    cid = (args.entreprise or "").strip().lower()
    if not RE_UUID.fullmatch(cid):
        raise ErreurAtelier("--entreprise doit être l'UUID de l'entreprise existante à doter de ses services")
    slug, marqueur = fiche["slug"], f"{PREFIXE_MARQUEUR_CLIENT}{fiche['slug']}"
    societes = api.get("/companies")
    societe = next((c for c in societes if c.get("id") == cid), None)
    if societe is None:
        raise ErreurAtelier(f"entreprise {cid} introuvable : rien n'est écrit.")
    nom_actuel = unicodedata.normalize("NFC", societe.get("name") or "")
    nom_voulu = RE_SUFFIXE_ANCIEN.sub("", nom_actuel).strip()
    if nom_voulu != fiche["nomCommercial"]:
        raise ErreurAtelier(f"ajout de services refusé : l'entreprise s'appelle « {nom_actuel} », la fiche « {fiche['nomCommercial']} » "
                            "(hors « (démonstration) »). Rien n'est écrit.")
    description = societe.get("description") or ""
    marqueurs_demo = RE_MARQUEUR_ANCIEN.findall(description)
    deja = porte_marqueur(description, marqueur)
    if not deja and (len(marqueurs_demo) != 1 or PREFIXE_MARQUEUR_CLIENT in description):
        raise ErreurAtelier(f"ajout de services refusé : la description de « {nom_actuel} » ne porte ni le marqueur {marqueur} ni un seul marqueur "
                            f"« {PREFIXE_MARQUEUR_ANCIEN}… » à migrer (elle appartient peut-être à un autre client). Rien n'est écrit.")
    registre = lire_registre_client(slug)
    entree_actuelle = ((registre or {}).get("entreprises") or {}).get("marketing")
    if entree_actuelle and entree_actuelle["entrepriseId"] != cid:
        raise ErreurAtelier(f"ajout de services refusé : le registre local du client {slug} désigne déjà une autre entreprise marketing "
                            f"({entree_actuelle['entrepriseId']}). Rien n'est écrit.")
    autre = slug_client_par_entreprise(cid)
    if autre and autre != slug:
        raise ErreurAtelier(f"ajout de services refusé : l'entreprise {cid} appartient déjà au client {autre}. Rien n'est écrit.")
    if registre is not None and normaliser_bce(registre["numeroBce"]) != normaliser_bce(fiche["numeroBce"]):
        raise ErreurAtelier(f"ajout de services refusé : le BCE de la fiche diffère de celui du registre local du client {slug}. Rien n'est écrit.")
    try:
        bces = bce_de_la_marque(marque_actuelle(api, cid))
    except ErreurAtelier:
        bces = set()  # plugin absent ou référentiel illisible : pas de second contrôle possible
    if bces and normaliser_bce(fiche["numeroBce"]) not in bces:
        raise ErreurAtelier("ajout de services refusé : le BCE de la fiche ne correspond pas à celui du référentiel de marque de l'entreprise. Rien n'est écrit.")
    nouvelle_description = description if deja else RE_MARQUEUR_ANCIEN.sub(marqueur, description)
    corps = {}
    if nom_actuel != nom_voulu:
        corps["name"] = nom_voulu
    if nouvelle_description != description:
        corps["description"] = nouvelle_description
    entree = {"entrepriseId": cid, "nom": nom_voulu, "marqueur": marqueur}
    actions = []
    if corps:
        actions.append(f"entreprise {cid} : " + ", ".join(
            [f"nom « {nom_actuel} » -> « {nom_voulu} »"] * ("name" in corps) + [f"marqueur -> {marqueur}"] * ("description" in corps)) + " (PATCH /companies/<id>)")
    if entree_actuelle != entree or (registre or {}).get("_ancienFormat"):
        actions.append(f"registre local : {dossier_client(slug) / FICHIER_REGISTRE_CLIENT} (service marketing -> {cid})")
    entreprises = dict((registre or {}).get("entreprises") or {})
    entreprises["marketing"] = entree
    virtuel = {"version": 2, "entrepriseId": cid, "numeroBce": normaliser_bce(fiche["numeroBce"]), "slug": slug,
               "creeLe": (registre or {}).get("creeLe"), "entreprises": entreprises}
    migree = {**societe, "name": nom_voulu, "description": nouvelle_description}
    return {"cid": cid, "corps": corps, "entree": entree, "actions": actions, "registre": virtuel,
            "api": ApiEntreprisesSimulees(api.base, [migree if c.get("id") == cid else c for c in societes]),
            "registre_reel": registre}


def executer_migration_marketing(api: Api, fiche: dict, migration: dict) -> None:
    """Écrit la migration préparée (nom et marqueur côté socle, puis registre local). Idempotent : sans action, rien n'est écrit."""
    cid = migration["cid"]
    if migration["corps"]:
        api.appel("PATCH", f"/companies/{cid}", migration["corps"])
        print(f"Entreprise {cid} migrée : {', '.join(migration['corps'])} mis à jour.")
    registre = migration["registre_reel"]
    if (registre or {}).get("entreprises", {}).get("marketing") != migration["entree"] or (registre or {}).get("_ancienFormat"):
        chemin_registre = dossier_client(fiche["slug"]) / FICHIER_REGISTRE_CLIENT
        noter_entreprise_registre(fiche["slug"], fiche["numeroBce"], registre, "marketing", migration["entree"])
        print(f"Registre local écrit : {chemin_registre}")
    if not migration["actions"]:
        print("Entreprise marketing déjà migrée : rien à faire pour elle.")


def cmd_nouveau_client(args) -> int:
    if args.ajouter_services and args.enregistrer_existante:
        raise ErreurAtelier("--ajouter-services et --enregistrer-existante s'excluent.")
    if args.entreprise and not (args.enregistrer_existante or args.ajouter_services):
        raise ErreurAtelier("--entreprise ne s'utilise qu'avec --enregistrer-existante ou --ajouter-services.")
    if (args.enregistrer_existante or args.ajouter_services) and not args.entreprise:
        raise ErreurAtelier("--enregistrer-existante et --ajouter-services exigent --entreprise <UUID>.")
    if args.slug and not args.ajouter_services:
        raise ErreurAtelier("--slug ne s'utilise qu'avec --ajouter-services.")
    if args.reel:
        print("Avertissement : l'option --reel n'a plus d'effet (tout est réel) ; vous pouvez la retirer.", file=sys.stderr)
    fiche = valider_fiche(lire_fiche(Path(args.fiche)))
    if args.slug:
        if not CODE_REFERENTIEL.fullmatch(args.slug):
            raise ErreurAtelier(f"--slug invalide (lettres minuscules, chiffres et tirets, 2 à 40 caractères) : {args.slug!r}")
        fiche["slug"] = args.slug
    if args.enregistrer_existante:
        return enregistrer_existante(args, fiche)
    reg_agents, reg_orga = registres()
    par_slug = {s["slug"]: s for s in registre_services()["services"]}
    services = [par_slug[s] for s in fiche["services"]]
    avec_marketing = any(s["slug"] == "marketing" for s in services)
    multiple = fiche["services"] != ["marketing"]
    referentiel = referentiel_client(fiche)
    api = Api(url_api())
    if avec_marketing:
        try:
            api.get(f"/plugins/{PLUGIN_CLE}")
        except ErreurAtelier as e:
            if "HTTP 404" in str(e):
                raise ErreurAtelier(f"plugin {PLUGIN_CLE} introuvable : installez-le d'abord (scripts/preparer-plugin.sh puis installation depuis l'interface)") from None
            raise
    slug, nom = fiche["slug"], fiche["nomCommercial"]
    migration = None
    if args.ajouter_services:
        if not avec_marketing:
            raise ErreurAtelier("--ajouter-services exige que la fiche contienne le service marketing (services: \"tous\").")
        migration = preparer_migration_marketing(args, api, fiche)
        api_reelle, api = api, migration["api"]  # planification sur l'état d'après la migration
        registre = migration["registre"]
        referentiel = None  # le référentiel de marque de l'entreprise existante n'est jamais réécrit
    else:
        registre = lire_registre_client(slug)
    # Tous les contrôles d'identité passent avant la moindre écriture : un refus sur un service n'en laisse aucun créé.
    plans = [plan_service(api, reg_agents, reg_orga, fiche, svc, registre) for svc in services]
    for plan in plans:
        plan["marque"] = marque_actuelle(api, plan["existante"]["id"]) if plan["svc"]["slug"] == "marketing" and plan["existante"] else None

    ecritures = []
    if migration:
        ecritures.extend(f"[marketing] {a}" for a in migration["actions"])
        if not migration["actions"]:
            ecritures.append("[marketing] entreprise déjà migrée (nom, marqueur et registre à jour) : aucune écriture")
    if migration:
        pass
    elif registre is None:
        ecritures.append(f"registre local d'identité : {dossier_client(slug) / FICHIER_REGISTRE_CLIENT} (écrit à la création)")
    elif registre.get("_ancienFormat"):
        ecritures.append(f"registre local d'identité {dossier_client(slug) / FICHIER_REGISTRE_CLIENT} : migré vers le format « une entreprise par service »")
    for plan in plans:
        if migration and plan["svc"]["slug"] == "marketing":
            ecritures.append("[marketing] organisation, agents et référentiel de marque existants conservés : non réappliqués")
            continue
        lignes = ecritures_service(plan, fiche, referentiel, plan["marque"])
        ecritures.extend(f"[{plan['svc']['slug']}] {l}" if multiple else l for l in lignes)
    if args.a_blanc:
        print(f"À blanc : rien n'est écrit. Écritures prévues pour « {nom} »"
              + (f" ({len(plans)} entreprise(s) : {', '.join(p['svc']['slug'] for p in plans)})" if multiple else "") + " :")
        for ligne in ecritures:
            print(f"  - {ligne}")
        return 0

    if cmd_generer(argparse.Namespace(verifier=True)) != 0:
        return 1
    for plan in plans:
        for avert in plan["avertissements"]:
            print(avert)
    with verrou_ecriture("nouveau-client"):
        if migration:
            api = api_reelle
            executer_migration_marketing(api, fiche, migration)
            registre = lire_registre_client(slug)
        for plan in plans:
            svc, reg_s = plan["svc"], plan["reg_s"]
            if multiple:
                print(f"=== Service {svc['nom']} : « {plan['nom']} » ===")
            if migration and svc["slug"] == "marketing":
                plan["cid"] = migration["cid"]
                continue
            if avec_marketing and svc["slug"] == "marketing":
                fichiers = fichiers_paquet()
                fichiers["COMPANY.md"] = company_md_client(reg_s)
                appliquer, dossier_etat = appliquer_organisation, INSTANCE / "atelier-client" / slug
            else:
                fichiers = fichiers_service(plan["reg_agents"], reg_s, svc, plan["corps"])
                appliquer, dossier_etat = appliquer_service, INSTANCE / "atelier-client" / slug / "services" / svc["slug"]
            try:
                cid = appliquer(api, plan["reg_agents"], reg_s, fichiers, fiche["mode"], dossier_etat)
            except (ErreurAtelier, OSError):
                if plan["existante"] is None:
                    # Entreprise créée avant l'échec : on garde son identité pour que la reprise ne soit pas refusée.
                    try:
                        creee = trouver_entreprise(api, reg_s)
                        if creee:
                            noter_entreprise_registre(slug, fiche["numeroBce"], lire_registre_client(slug), svc["slug"],
                                                      {"entrepriseId": creee["id"], "nom": plan["nom"], "marqueur": plan["marqueur"]})
                    except (ErreurAtelier, OSError):
                        pass
                raise
            avant = registre
            registre = noter_entreprise_registre(slug, fiche["numeroBce"], registre, svc["slug"],
                                                 {"entrepriseId": cid, "nom": plan["nom"], "marqueur": plan["marqueur"]})
            plan["cid"] = cid
            if avant is None:
                print(f"Registre local d'identité écrit : {dossier_client(slug) / FICHIER_REGISTRE_CLIENT}")
            elif avant.get("_ancienFormat"):
                print(f"Registre local d'identité migré vers le format « une entreprise par service » : {dossier_client(slug) / FICHIER_REGISTRE_CLIENT}")
            budget = plan["budget"]
            societe = next((c for c in api.get("/companies") if c.get("id") == cid), {})
            if societe.get("budgetMonthlyCents") != budget:
                api.appel("PATCH", f"/companies/{cid}/budgets", {"budgetMonthlyCents": budget})
                print(f"Budget IA mensuel posé : {budget} centimes")
            else:
                print(f"Budget IA mensuel déjà à {budget} centimes")
            if svc["slug"] == "marketing":
                if referentiel_a_jour(marque_actuelle(api, cid), referentiel):
                    print("Référentiel de marque déjà à jour : aucune écriture")
                else:
                    api.appel("POST", f"/plugins/{PLUGIN_CLE}/actions/atelier.marque.enregistrer",
                              {"companyId": cid, "params": referentiel})
                    print("Référentiel de marque enregistré (nouvelle version)")
    if multiple:
        configurer_plugin_client(api, slug)
        print(f"Client « {nom} » prêt : {len(plans)} entreprise(s).")
        for plan in plans:
            print(f"  {plan['svc']['slug']} : entreprise {plan['cid']}, marqueur {plan['marqueur']}")
        manquantes = sum(len(p["avertissements"]) for p in plans)
        if manquantes:
            print(f"{manquantes} consigne(s) à rédiger (consigne minimale générée) : voir les avertissements ci-dessus.")
    else:
        print(f"Client « {nom} » prêt : entreprise {plans[0]['cid']}, marqueur {plans[0]['marqueur']}.")
    return 0


# ---------------------------------------------------------------------------
# Mise à jour d'un client déjà créé : agents du registre manquants, services absents, agents hors registre
# ---------------------------------------------------------------------------

SUFFIXE_MARKETING_NOM = " · Marketing"
STATUTS_AGENT_INACTIFS = ("paused", "terminated", "pending_approval")


def fiche_depuis_registre_client(slug: str, registre: dict) -> dict:
    """Fiche minimale d'un client DÉJÀ créé, tirée de son registre local (la fiche d'origine n'est pas conservée) : de quoi
    réutiliser plan_service. Les offres et les bureaux ne servent pas ici : les objectifs, la description et le budget des
    entreprises existantes sont repris de l'instance, jamais réécrits depuis cette fiche."""
    nom_commercial = None
    for service, e in registre["entreprises"].items():
        nom = unicodedata.normalize("NFC", e.get("nom") or "")
        if nom and (service == "marketing" or nom_commercial is None):
            nom_commercial = nom[: -len(SUFFIXE_MARKETING_NOM)] if nom.endswith(SUFFIXE_MARKETING_NOM) else nom.split(" · ")[0]
    if not nom_commercial:
        raise ErreurAtelier(f"registre local du client {slug} : aucun nom d'entreprise, impossible de nommer les services à ajouter.")
    return {"slug": slug, "nomCommercial": nom_commercial, "numeroBce": registre["numeroBce"], "mode": "reel",
            "services": list(registre["entreprises"]), "budgets": {}, "budgetIaMensuelCentimes": 0, "offres": [], "bureaux": []}


def reprendre_etat_existant(api: Api, plan: dict) -> None:
    """Pour une entreprise existante : description, et pour le marketing objectifs (titre, description, niveau, statut), repris
    tels que l'instance les porte, pour que la mise à jour n'en écrase rien."""
    existante = plan["existante"]
    if existante is None:
        return
    reg_s = plan["reg_s"]
    if existante.get("description"):
        reg_s["entreprise"]["description"] = existante["description"]
    if plan["svc"]["slug"] != "marketing":
        return
    buts = api.get(f"/companies/{existante['id']}/goals")
    for o in reg_s["objectifs"]:
        g = next((g for g in buts if (g.get("title") or "").startswith(o["cle"] + " ")), None)
        if g is None:
            continue
        prefixe = f"{o['cle']} · "
        titre = g.get("title") or ""
        o["titre"] = titre[len(prefixe):] if titre.startswith(prefixe) else titre
        o["description"] = g.get("description") or o["description"]
        o["niveau"], o["statut"] = g.get("level") or o["niveau"], g.get("status") or o["statut"]


def fichiers_mise_a_jour(plan: dict) -> dict[str, str]:
    """Paquet natif de l'entreprise d'un service (même construction que nouveau-client)."""
    if plan["svc"]["slug"] == "marketing":
        fichiers = fichiers_paquet()
        fichiers["COMPANY.md"] = company_md_client(plan["reg_s"])
        return fichiers
    return fichiers_service(plan["reg_agents"], plan["reg_s"], plan["svc"], plan["corps"])


def diagnostic_mise_a_jour(api: Api, plan: dict, mode: str) -> dict:
    """Lecture seule : agents du registre à créer, agents hors registre, raisons de mise à jour des agents existants."""
    slugs = [a["slug"] for a in plan["reg_agents"]["agents"]]
    diag = {"creer": list(slugs), "hors_registre": [], "raisons": [], "renommages": [], "appariements": [], "collision": None,
            "doublons": []}
    if plan["existante"] is None:
        return diag
    cid = plan["existante"]["id"]
    presents = agents_par_slug(api, cid)
    diag["creer"] = [s for s in slugs if s not in presents]
    diag["hors_registre"] = sorted((s, a["id"], a.get("status")) for s, a in presents.items() if s not in slugs and s != GARDIEN_SLUG)
    secret = secret_jeton(api, cid)
    jeton_id = secret["id"] if secret else None
    fichiers = plan["fichiers"]
    empreinte = hashlib.sha256((empreinte_paquet(fichiers) + ":" + mode).encode()).hexdigest()
    if plan["svc"]["slug"] == "marketing":
        raisons = etat_a_jour(api, cid, plan["reg_agents"], empreinte, jeton_id, mode)
    else:
        raisons = etat_service_a_jour(api, cid, plan["reg_agents"], fichiers, empreinte, jeton_id, mode)
    diag["raisons"] = [r for r in raisons if not r.startswith("agent absent")]
    diag["renommages"] = renommages_agents(api, cid, plan["reg_agents"])
    try:
        diag["appariements"] = appariements_import(api, cid, plan["reg_agents"])
    except ErreurAtelier as e:
        diag["collision"] = str(e)
    diag["doublons"] = doublons_entreprise(api, cid)
    return diag


def agents_actifs(api: Api, company_id: str, slugs) -> dict[str, str]:
    """Slug -> identifiant des agents du registre qui ne sont ni en pause, ni terminés, ni en attente d'approbation."""
    voulus = set(slugs)
    return {s: a["id"] for s, a in agents_par_slug(api, company_id).items()
            if s in voulus and a.get("status") not in STATUTS_AGENT_INACTIFS}


def remettre_agents_actifs(api: Api, company_id: str, avant: dict[str, str]) -> list[str]:
    """L'import natif qui crée des agents remet en pause ceux qu'il met à jour : un agent que l'opérateur avait activé est rallumé
    (POST /agents/<id>/resume), il retrouve l'état d'avant. Rend les slugs rallumés."""
    apres = agents_par_slug(api, company_id)
    rallumes = []
    for slug, aid in sorted(avant.items()):
        if (apres.get(slug) or {}).get("status") == "paused":
            api.appel("POST", f"/agents/{aid}/resume")
            rallumes.append(slug)
    return rallumes


def cmd_mettre_a_jour_client(args) -> int:
    """Met à jour un client enregistré (registre local) sur le registre actuel : crée dans chaque entreprise de service (et
    le marketing) les agents du registre manquants, en pause, avec les réglages de nouveau-client ; ajoute les services du
    registre absents ; remet à jour consignes, compétences et liaisons des agents existants (import natif « replace » de
    appliquer_service / appliquer_organisation) ; signale les agents hors registre et, avec --pause-hors-registre, les met en
    pause. Rien n'est jamais supprimé. Idempotent."""
    slug = args.client
    registre = lire_registre_client(slug)
    if registre is None:
        raise ErreurAtelier(f"aucun registre local pour le client {slug} ({dossier_client(slug) / FICHIER_REGISTRE_CLIENT}) : "
                            "créez-le avec nouveau-client (--enregistrer-existante ou --ajouter-services).")
    if "marketing" not in registre["entreprises"]:
        raise ErreurAtelier(f"le client {slug} n'a pas d'entreprise marketing dans son registre : utilisez nouveau-client.")
    if registre.get("_ancienFormat"):
        raise ErreurAtelier(f"le registre du client {slug} est à l'ancien format : migrez-le d'abord (nouveau-client --ajouter-services).")
    reg_agents, reg_orga = registres()
    fiche = fiche_depuis_registre_client(slug, registre)
    actifs = [s for s in registre_services()["services"] if s.get("actif")]
    absents = [] if args.sans_nouveaux_services else [s["slug"] for s in actifs if s["slug"] not in registre["entreprises"]]
    services = [s for s in actifs if s["slug"] in registre["entreprises"] or s["slug"] in absents]
    inconnus = sorted(set(registre["entreprises"]) - {s["slug"] for s in actifs})
    api = Api(url_api())
    plans = []
    for svc in services:  # tous les contrôles d'identité passent avant la moindre écriture
        plan = plan_service(api, reg_agents, reg_orga, fiche, svc, registre)
        reprendre_etat_existant(api, plan)
        plan["fichiers"] = fichiers_mise_a_jour(plan)
        plan["diag"] = diagnostic_mise_a_jour(api, plan, fiche["mode"])
        plans.append(plan)
    total_creer = sum(len(p["diag"]["creer"]) for p in plans)
    total_hors = sum(len(p["diag"]["hors_registre"]) for p in plans)
    total_renommer = sum(len(p["diag"]["renommages"]) for p in plans)
    prefixe = "À blanc : rien n'est écrit. " if args.a_blanc else ""
    print(f"{prefixe}Client « {fiche['nomCommercial']} » ({slug}) : {len(plans)} service(s), "
          f"{total_creer} agent(s) à créer en pause, {total_hors} agent(s) hors registre, {total_renommer} agent(s) à renommer.")
    for s in inconnus:
        print(f"  service du registre local absent du registre des services (ou inactif), laissé tel quel : {s}")
    for plan in plans:
        d, etiquette = plan["diag"], plan["svc"]["slug"]
        if plan["existante"] is None:
            print(f"  [{etiquette}] service à AJOUTER : entreprise « {plan['nom']} » créée avec {len(d['creer'])} agent(s) en pause")
            continue
        detail = f"{len(d['creer'])} à créer" + (f" ({', '.join(d['creer'])})" if d["creer"] else "")
        print(f"  [{etiquette}] {plan['existante']['id']} : {detail} ; {len(d['raisons'])} écart(s) à réconcilier sur les agents existants ; "
              f"{len(d['hors_registre'])} hors registre" + (f" ({', '.join(s for s, _, _ in d['hors_registre'])})" if d["hors_registre"] else ""))
    for plan in plans:
        for s_, _, actuel, voulu in plan["diag"]["renommages"]:
            print(f"  [{plan['svc']['slug']}] renommage prévu : {s_} : « {actuel} » -> « {voulu} »")
    for plan in plans:
        d, etiquette = plan["diag"], plan["svc"]["slug"]
        for s_, _, actuel, temporaire in d["appariements"]:
            print(f"  [{etiquette}] risque de doublon écarté : la clé Paperclip de « {actuel} » diffère du slug {s_} ; si l'import "
                  f"natif a lieu, nom temporaire « {temporaire} » avant l'import, rétabli après (sinon : « {actuel} 2 » créé)")
        if d["collision"]:
            print(f"  [{etiquette}] RISQUE DE COLLISION, la mise à jour s'arrêtera avant toute écriture : {d['collision']}")
        if d["doublons"]:
            print(f"  [{etiquette}] {len(d['doublons'])} doublon(s) probable(s) déjà présent(s) : "
                  + ", ".join(f"« {x['doublon']['name']} » ({x['doublon'].get('status')})" for x in d["doublons"])
                  + f" ; contrôle : nettoyer-doublons --client {slug}")
    collisions = [f"[{p['svc']['slug']}] {p['diag']['collision']}" for p in plans if p["diag"]["collision"]]
    if args.a_blanc:
        encore_actifs = sum(1 for p in plans for _, _, st in p["diag"]["hors_registre"] if st != "paused")
        if args.pause_hors_registre:
            print(f"  --pause-hors-registre : {encore_actifs} agent(s) hors registre encore actif(s) seraient mis en pause (aucune suppression).")
        elif total_hors:
            print(f"  sans --pause-hors-registre, aucun agent hors registre n'est touché ({encore_actifs} encore actif(s) : décision humaine).")
        return 1 if collisions else 0
    if collisions:
        raise ErreurAtelier("collision de clé d'agent, rien n'est écrit : " + " ; ".join(collisions))

    if cmd_generer(argparse.Namespace(verifier=True)) != 0:
        return 1
    with verrou_ecriture("mettre-a-jour-client"):
        for plan in plans:
            svc, reg_s = plan["svc"], plan["reg_s"]
            print(f"=== Service {svc['nom']} : « {plan['nom']} » ===")
            if svc["slug"] == "marketing":
                appliquer, dossier_etat = appliquer_organisation, INSTANCE / "atelier-client" / slug
            else:
                appliquer, dossier_etat = appliquer_service, INSTANCE / "atelier-client" / slug / "services" / svc["slug"]
            avant = agents_actifs(api, plan["existante"]["id"], [a["slug"] for a in plan["reg_agents"]["agents"]]) if plan["existante"] else {}
            try:
                cid = appliquer(api, plan["reg_agents"], reg_s, plan["fichiers"], fiche["mode"], dossier_etat)
            except (ErreurAtelier, OSError):
                if plan["existante"] is None:
                    try:
                        creee = trouver_entreprise(api, reg_s)
                        if creee:
                            noter_entreprise_registre(slug, fiche["numeroBce"], lire_registre_client(slug), svc["slug"],
                                                      {"entrepriseId": creee["id"], "nom": plan["nom"], "marqueur": plan["marqueur"]})
                    except (ErreurAtelier, OSError):
                        pass
                raise
            registre = noter_entreprise_registre(slug, fiche["numeroBce"], registre, svc["slug"],
                                                 {"entrepriseId": cid, "nom": plan["nom"], "marqueur": plan["marqueur"]})
            plan["cid"] = cid
            for s_, _, actuel, voulu in renommer_agents(api, cid, plan["reg_agents"]):
                print(f"  agent renommé : {s_} : « {actuel} » -> « {voulu} »")
            for rallume in remettre_agents_actifs(api, cid, avant):
                print(f"  agent déjà actif avant la mise à jour, rallumé : {rallume}")
            if plan["existante"] is None:  # budget posé à la création seulement : celui d'une entreprise existante n'est pas touché
                api.appel("PATCH", f"/companies/{cid}/budgets", {"budgetMonthlyCents": plan["budget"]})
                print(f"Budget IA mensuel posé : {plan['budget']} centimes")
        mis_en_pause, restes = 0, []
        for plan in plans:
            slugs = {a["slug"] for a in plan["reg_agents"]["agents"]}
            for s, a in sorted(agents_par_slug(api, plan["cid"]).items()):
                if s in slugs or s == GARDIEN_SLUG or a.get("status") == "paused":
                    continue
                if args.pause_hors_registre:
                    api.appel("POST", f"/agents/{a['id']}/pause")
                    mis_en_pause += 1
                    print(f"  agent hors registre mis en pause (rien n'est supprimé) : [{plan['svc']['slug']}] {s}")
                else:
                    restes.append(f"[{plan['svc']['slug']}] {s} (statut {a.get('status')})")
        for r in restes:
            print(f"  agent hors registre, encore actif (décision humaine, --pause-hors-registre pour le mettre en pause) : {r}")
        configurer_plugin_client(api, slug)
    print(f"Client « {fiche['nomCommercial']} » à jour : {len(plans)} entreprise(s), {mis_en_pause} agent(s) hors registre mis en pause, "
          f"{len(restes)} laissé(s) actif(s).")
    return 0


FICHIER_JOURNAL_DOUBLONS = "journal-nettoyage-doublons.jsonl"


def doublons_entreprise(api: Api, company_id: str) -> list[dict]:
    """Agents « <nom> N » (N >= 2) créés APRÈS un agent existant nommé exactement « <nom> », de même rôle et même titre,
    dans la même entreprise : doublons laissés par un import natif mal apparié. Lecture seule."""
    agents = [a for a in api.get(f"/companies/{company_id}/agents") if a.get("status") != "terminated"]
    par_nom: dict[str, list[dict]] = {}
    for a in agents:
        par_nom.setdefault(unicodedata.normalize("NFC", a["name"]), []).append(a)
    sortie = []
    for a in agents:
        m = RE_SUFFIXE_DOUBLON.fullmatch(unicodedata.normalize("NFC", a["name"]))
        if not m:
            continue
        originaux = [o for o in par_nom.get(m.group(1), []) if o["id"] != a["id"] and o.get("role") == a.get("role")
                     and o.get("title") == a.get("title") and str(o.get("createdAt") or "") < str(a.get("createdAt") or "~")]
        if originaux:
            sortie.append({"doublon": a, "original": originaux[0]})
    return sorted(sortie, key=lambda x: x["doublon"]["name"])


def activite_agent(api: Api, company_id: str, agent_id: str) -> list[str]:
    """Traces de travail d'un agent : tâches qui lui sont affectées ou qu'il a créées, exécutions. Vide = aucune."""
    traces = []
    affectees = api.get(f"/companies/{company_id}/issues?assigneeAgentId={agent_id}")
    creees = [i for i in api.get(f"/companies/{company_id}/issues") if i.get("createdByAgentId") == agent_id]
    ids = {i.get("id") for i in affectees} | {i.get("id") for i in creees}
    if ids:
        traces.append(f"{len(ids)} tâche(s)")
    if api.get(f"/companies/{company_id}/heartbeat-runs?agentId={agent_id}&limit=1&summary=true"):
        traces.append("exécution(s)")
    return traces


def cmd_nettoyer_doublons(args) -> int:
    """Doublons « <nom> N » laissés par un import natif mal apparié, dans les entreprises du client (registre local). À blanc
    par défaut : liste et contrôle. --confirmer : met en pause puis supprime (DELETE /agents/<id>) ceux qui n'ont aucune
    tâche ni exécution ; ceux qui en ont sont signalés et laissés tels quels (décision humaine). Journal JSONL local."""
    slug = args.client
    registre = lire_registre_client(slug)
    if registre is None:
        raise ErreurAtelier(f"aucun registre local pour le client {slug} ({dossier_client(slug) / FICHIER_REGISTRE_CLIENT}).")
    api = Api(url_api())
    prefixe = "" if args.confirmer else "À blanc : rien n'est écrit. "
    candidats = []
    for service, e in sorted(registre["entreprises"].items()):
        cid = e.get("entrepriseId")
        if not cid:
            continue
        for x in doublons_entreprise(api, cid):
            traces = activite_agent(api, cid, x["doublon"]["id"])
            candidats.append({"service": service, "companyId": cid, **x, "traces": traces})
    supprimables = [c for c in candidats if not c["traces"]]
    print(f"{prefixe}Client {slug} : {len(candidats)} doublon(s) probable(s), {len(supprimables)} sans tâche ni exécution "
          f"(supprimable(s)), {len(candidats) - len(supprimables)} avec activité (laissé(s) tel(s) quel(s)).")
    for c in candidats:
        d, o = c["doublon"], c["original"]
        etat = "AVEC ACTIVITÉ (" + ", ".join(c["traces"]) + "), non touché" if c["traces"] else (
            "sera mis en pause puis supprimé" if args.confirmer else "serait mis en pause puis supprimé avec --confirmer")
        print(f"  [{c['service']}] « {d['name']} » {d['id']} (statut {d.get('status')}, créé {d.get('createdAt')}) "
              f"doublon de « {o['name']} » {o['id']} (statut {o.get('status')}) : {etat}")
    if not args.confirmer:
        return 0
    journal = dossier_client(slug) / FICHIER_JOURNAL_DOUBLONS
    supprimes = 0
    with verrou_ecriture("nettoyer-doublons"):
        journal.parent.mkdir(parents=True, exist_ok=True)
        for c in supprimables:
            d = c["doublon"]
            if activite_agent(api, c["companyId"], d["id"]):  # nouveau contrôle juste avant d'écrire
                print(f"  activité apparue entre-temps, non touché : « {d['name']} » {d['id']}")
                continue
            if d.get("status") != "paused":
                api.appel("POST", f"/agents/{d['id']}/pause")
            api.appel("DELETE", f"/agents/{d['id']}")
            supprimes += 1
            ligne = {"date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "action": "pause+suppression",
                     "service": c["service"], "companyId": c["companyId"], "agentId": d["id"], "nom": d["name"],
                     "statutAvant": d.get("status"), "originalId": c["original"]["id"], "original": c["original"]["name"]}
            with open(journal, "a", encoding="utf-8") as f:
                f.write(json.dumps(ligne, ensure_ascii=False) + "\n")
            print(f"  supprimé : [{c['service']}] « {d['name']} » {d['id']}")
    print(f"{supprimes} doublon(s) supprimé(s) ; journal : {journal}")
    return 0


# ---------------------------------------------------------------------------
# Purge : fin de contrat et droit à l'effacement (RGPD)
# ---------------------------------------------------------------------------

DELAI_EXPORT_HEURES = 24
ROTATION_SAUVEGARDES_JOURS = 14
# Sauvegarde du poste (hors du dépôt, ~/.local/bin/sauvegarde-quotidienne.sh, rotation « restic forget --keep-daily 7
# --keep-weekly 4 --keep-monthly 6 ») : elle couvre tout $HOME, donc instance/ ; une donnée purgée y reste jusqu'à environ
# 6 mois (revue du 18/10/2026, M3). Depuis le 18/10/2026, instance/ est exclue de cette sauvegarde (décision de l'opérateur) ;
# seuls les instantanés antérieurs la contiennent encore. Le script ne la modifie pas.
RETENTION_SAUVEGARDE_POSTE_MOIS = 6
AVERTISSEMENT_SAUVEGARDES = (
    "Les sauvegardes existantes ne sont PAS modifiées : elles contiennent encore les données de ce client "
    f"jusqu'à leur expiration par rotation ({ROTATION_SAUVEGARDES_JOURS} jours pour les sauvegardes de l'instance ; "
    f"et, pour les instantanés restic du poste pris AVANT le 18/10/2026, jusqu'à environ {RETENTION_SAUVEGARDE_POSTE_MOIS} "
    "mois : depuis le 18/10/2026, instance/ est exclue de la sauvegarde du poste (~/.config/backup/excludes.txt, "
    "décision de l'exploitant). Une restauration d'avant la purge les ferait revenir : la purge doit alors être rejouée. "
    "Pour effacer plus tôt des anciens instantanés (décision de l'exploitant, jamais faite par ce script) : "
    "« restic forget <id> » puis « restic prune »."
)
LIMITE_EXPORT = (
    "L'export contient le paquet de l'organisation (agents, projets, tâches, compétences), dans donnees-socle/ le journal "
    "d'activité, les approbations et les coûts du socle, et, dans donnees-plugin/, "
    "les données du plugin (prospects, clients, connaissances, journal, oppositions, bases légales) ; leurs colonnes chiffrées y restent chiffrées "
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


def dossiers_locaux_client(company_id: str, avec_etat: bool = True) -> list[Path]:
    """Dossiers locaux d'un client : espaces des agents et configurations Claude dédiées rangés par identifiant
    d'entreprise (disposition actuelle, voir dossiers_agent), anciennes dispositions « client-<slug> » et état
    « atelier-client/<slug> » (registre compris) du slug que le REGISTRE LOCAL associe à cet identifiant : jamais
    celui d'un marqueur de la description, que les agents peuvent modifier. Seulement ceux qui existent.
    Un client à plusieurs entreprises (une par service) partage ce dernier groupe : « avec_etat » n'est vrai que pour
    la dernière entreprise purgée, car l'état « atelier-client/<slug> » porte le registre qui désigne les autres."""
    candidats = [ESPACES / company_id, CONFIGS_CLAUDE / company_id]
    slug = slug_client_par_entreprise(company_id) if avec_etat else None
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


def verifier_donnees_socle_export(export: Path, manifeste: dict) -> None:
    """L'export doit contenir donnees-socle/<table>.json (déjà contrôlé par empreinte au manifeste) pour activity_log,
    approvals et cost_events, avec exactement le nombre de lignes compté à l'export (manifeste.comptesSocle) ; sinon
    ErreurAtelier (rien supprimé)."""
    refus = []
    fichiers = manifeste.get("fichiers") or {}
    comptes = manifeste.get("comptesSocle")
    comptes = comptes if isinstance(comptes, dict) else {}
    for table in TABLES_SOCLE:
        chemin = f"{DOSSIER_DONNEES_SOCLE}/{table}.json"
        if chemin not in fichiers:
            refus.append(f"{chemin} absent de l'export")
            continue
        if not isinstance(comptes.get(table), int):
            refus.append(f"{table} : compte absent du manifeste")
            continue
        try:
            lues = len(json.loads((export / chemin).read_text(encoding="utf-8")))
        except (ValueError, OSError, TypeError):
            refus.append(f"{chemin} illisible")
            continue
        if lues != comptes[table]:
            refus.append(f"{table} : {lues} ligne(s) dans le fichier pour {comptes[table]} comptée(s) à l'export")
    if refus:
        raise ErreurAtelier(
            "purge refusée : l'export ne contient pas le journal, les approbations et les coûts du socle, complets (" + "; ".join(refus)
            + f"). Relancez : python3 -I scripts/bootstrap-organisation.py exporter --entreprise {manifeste.get('entrepriseId')} --pg-port <port> ; "
            "rien n'a été supprimé.")


def appel_purge_plugin(api: Api, company_id: str, a_blanc: bool) -> dict:
    corps = {"companyId": company_id, "aBlanc": True} if a_blanc else {"companyId": company_id, "confirmer": True}
    return api.appel("POST", f"/plugins/{PLUGIN_CLE}/api/donnees/purge", corps) or {}


def resume_comptes(tables: dict) -> str:
    non_vides = {t: n for t, n in tables.items() if n}
    if not non_vides:
        return f"0 ligne dans les {len(tables)} tables"
    return (f"{sum(non_vides.values())} ligne(s) dans {len(non_vides)} table(s) sur {len(tables)} : "
            + ", ".join(f"{t} {n}" for t, n in sorted(non_vides.items())))


# ---------------------------------------------------------------------------
# Effacement d'une personne dans la mémoire des agents (memoire-para, revue du 18/10/2026, M3)
# ---------------------------------------------------------------------------

FICHIER_JOURNAL_PURGES_MEMOIRES = "journal-purges-memoires.jsonl"
MOTIF_MEMOIRE_MIN = 3


def _cle_motif(texte: str) -> str:
    return unicodedata.normalize("NFC", texte).casefold()


def fichiers_memoire(company_id: str):
    """(rôle, chemin relatif au dossier memoire/, chemin) de chaque fichier ordinaire sous ESPACES/<id>/<rôle>/memoire/,
    quarantaine comprise. Aucun lien symbolique n'est suivi (l'agent écrit dans ce dossier : un lien pourrait viser un
    fichier hors de son espace)."""
    racine = ESPACES / company_id
    if not racine.is_dir() or racine.is_symlink():
        return
    for role in sorted(racine.iterdir()):
        memoire = role / "memoire"
        if role.is_symlink() or not role.is_dir() or memoire.is_symlink() or not memoire.is_dir():
            continue
        for dossier, sous, noms in os.walk(memoire, followlinks=False):
            sous[:] = sorted(d for d in sous if not (Path(dossier) / d).is_symlink())
            for nom in sorted(noms):
                f = Path(dossier) / nom
                if f.is_symlink() or not f.is_file():
                    continue
                yield role.name, f.relative_to(memoire), f


def purger_memoires(slug: str, motif: str, confirmer: bool) -> dict:
    """Cherche le motif (sans casse) dans la mémoire de tous les agents de toutes les entreprises du client, et, si
    `confirmer`, efface les lignes qui le contiennent (un fichier dont le NOM contient le motif est supprimé en entier).
    Rend le bilan, sans le motif ni aucune ligne : comptes par fichier, chemins (masqués s'ils contiennent le motif)."""
    if len(motif.strip()) < MOTIF_MEMOIRE_MIN:
        raise ErreurAtelier(f"--motif doit compter au moins {MOTIF_MEMOIRE_MIN} caractères (sinon trop de lignes seraient effacées)")
    registre = lire_registre_client(slug)
    if registre is None:
        raise ErreurAtelier(f"aucun registre local pour le client {slug} : rien n'est cherché")
    cle = _cle_motif(motif.strip())
    fichiers = []
    for service, e in sorted(registre["entreprises"].items()):
        cid = e["entrepriseId"]
        for role, relatif, chemin in fichiers_memoire(cid):
            nom_vise = cle in _cle_motif(str(relatif))
            texte = chemin.read_bytes().decode("utf-8", "surrogateescape")
            lignes = texte.splitlines(keepends=True)
            gardees = [l for l in lignes if cle not in _cle_motif(l)]
            if not nom_vise and len(gardees) == len(lignes):
                continue
            affiche = "<chemin contenant le motif>" if nom_vise else str(relatif)
            fichiers.append({"service": service, "entreprise": cid, "role": role, "fichier": affiche,
                             "lignes": len(lignes) - len(gardees), "supprime": nom_vise})
            if not confirmer:
                continue
            if nom_vise:
                chemin.unlink()
                continue
            temporaire = chemin.with_name(f".{chemin.name}.purge-{os.getpid()}")
            temporaire.write_bytes("".join(gardees).encode("utf-8", "surrogateescape"))
            os.chmod(temporaire, chemin.stat().st_mode & 0o777)
            os.replace(temporaire, chemin)
    bilan = {
        "date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "client": slug, "aBlanc": not confirmer,
        "empreinteMotif": hashlib.sha256(cle.encode("utf-8")).hexdigest(),
        "fichiers": fichiers, "lignes": sum(f["lignes"] for f in fichiers),
    }
    if confirmer:
        journal = dossier_client(slug) / FICHIER_JOURNAL_PURGES_MEMOIRES
        with open(journal, "a", encoding="utf-8") as j:
            j.write(json.dumps(bilan, ensure_ascii=False) + "\n")
        os.chmod(journal, 0o600)
    return bilan


def cmd_purger_memoires(args) -> int:
    bilan = purger_memoires(args.client, args.motif, args.confirmer and not args.a_blanc)
    prefixe = "À blanc (rien n'est effacé ; --confirmer pour effacer) : " if bilan["aBlanc"] else "Effacé : "
    print(f"{prefixe}{bilan['lignes']} ligne(s) dans {len(bilan['fichiers'])} fichier(s) de mémoire d'agents du client {args.client}.")
    for f in bilan["fichiers"]:
        print(f"  {f['service']}/{f['role']}/memoire/{f['fichier']} : {f['lignes']} ligne(s)" + (" (fichier supprimé : son nom contient le motif)" if f["supprime"] else ""))
    if not bilan["aBlanc"]:
        print(f"Journal (sans le motif ni les lignes) : {dossier_client(args.client) / FICHIER_JOURNAL_PURGES_MEMOIRES}")
    print(AVERTISSEMENT_SAUVEGARDES)
    return 0


def memoires_pour_export(company_id: str) -> dict[str, bytes]:
    """Mémoire des agents de l'entreprise (portabilité, M3) : fichiers sous memoires-agents/<rôle>/, sans lien suivi."""
    return {f"{DOSSIER_MEMOIRES_EXPORT}/{role}/{relatif.as_posix()}": chemin.read_bytes() for role, relatif, chemin in fichiers_memoire(company_id)}


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
        if entreprise_modele(societe, reg_orga):
            raise ErreurAtelier("purge refusée : c'est l'entreprise modèle (utilisez « reinitialiser »). Rien n'a été supprimé.")
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
    # Client à plusieurs entreprises (une par service) : la purge les supprime TOUTES, chacune après son propre export.
    # Le registre local (donc l'état du client) n'est supprimé qu'avec la dernière.
    cibles = [(cid, societe)]
    slug_client = slug_client_par_entreprise(cid)
    if slug_client:
        toutes = {c.get("id"): c for c in api.get("/companies")}
        autres = [e["entrepriseId"] for e in lire_registre_client(slug_client)["entreprises"].values() if e["entrepriseId"] != cid]
        cibles += [(i, toutes[i]) for i in autres if i in toutes]
        if len(cibles) > 1:
            print(f"Ce client a {len(cibles)} entreprise(s) à purger (une par service) : "
                  + ", ".join(f"« {c.get('name')} » ({i})" for i, c in cibles))
    print(AVERTISSEMENT_SAUVEGARDES)

    if args.a_blanc:
        for rang, (c_id, soc) in enumerate(cibles):
            apercu_purge(api, c_id, soc, args.export if c_id == cid else None,
                         dossiers_locaux_client(c_id, avec_etat=rang == len(cibles) - 1))
        return 0

    # Tous les exports sont contrôlés avant la première suppression.
    pretes = []
    for rang, (c_id, soc) in enumerate(cibles):
        print(f"Entreprise à purger : « {soc.get('name')} » ({c_id})")
        export, manifeste = trouver_export_recent(c_id, args.export if c_id == cid else None)
        comptes_avant = (appel_purge_plugin(api, c_id, True)).get("tables") or {}
        verifier_donnees_plugin_export(export, manifeste, comptes_avant)
        verifier_donnees_socle_export(export, manifeste)
        print(f"Export récent trouvé : {export.name} (empreinte {manifeste['empreinte'][:16]}…), données du plugin complètes")
        pretes.append((c_id, soc, export, manifeste, dossiers_locaux_client(c_id, avec_etat=rang == len(cibles) - 1)))
    code = 0
    for c_id, soc, export, manifeste, locaux in pretes:
        if len(pretes) > 1:
            print(f"--- Purge de « {soc.get('name')} » ({c_id}) ---")
        code = purger_une(api, c_id, export, manifeste, locaux)
        if code != 0:
            break
    print("Purge terminée." if code == 0 else "Purge INCOMPLÈTE : relancez après correction ; le rapport indique l'étape en échec"
          + (" (avec l'identifiant d'une entreprise du client qui existe encore)." if len(pretes) > 1 else "."))
    print(AVERTISSEMENT_SAUVEGARDES)
    return code


def apercu_purge(api: Api, cid: str, societe: dict, export_explicite: str | None, locaux: list[Path]) -> None:
    """Purge à blanc d'UNE entreprise : export récent, étapes prévues et comptes par table, sans rien supprimer."""
    print(f"Entreprise à purger : « {societe.get('name')} » ({cid})")
    dossier_fichiers = dossier_fichiers_entreprise(cid)
    comptes = (appel_purge_plugin(api, cid, True)).get("tables") or {}
    try:
        export, manifeste_ab = trouver_export_recent(cid, export_explicite)
        verifier_donnees_plugin_export(export, manifeste_ab, comptes)
        verifier_donnees_socle_export(export, manifeste_ab)
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


def purger_une(api: Api, cid: str, export: Path, manifeste: dict, locaux: list[Path]) -> int:
    """Purge réelle d'UNE entreprise (les contrôles d'export sont faits) : quatre étapes journalisées et rapport JSON."""
    dossier_fichiers = dossier_fichiers_entreprise(cid)
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
    return code


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sp = p.add_subparsers(dest="commande", required=True)
    g = sp.add_parser("generer")
    g.add_argument("--verifier", action="store_true")
    ap_ = sp.add_parser("appliquer")
    ap_.add_argument("--mode", choices=MODES, default="reel",
                     help="reel (seul mode) : claude_local prêt mais en pause")
    sp.add_parser("etat")
    nc = sp.add_parser("nouveau-client")
    nc.add_argument("--fiche", required=True, help="fiche du client (.yaml, .yml ou .json) ; modèle : organisation/modeles/fiche-client.exemple.json")
    nc.add_argument("--reel", action="store_true", help="sans effet (tout est réel) ; accepté pour ne pas casser les appels existants")
    nc.add_argument("--a-blanc", "--a_blanc", action="store_true", dest="a_blanc", help="liste les écritures prévues sans rien écrire")
    nc.add_argument("--enregistrer-existante", action="store_true", dest="enregistrer_existante",
                    help="migration : crée le registre local d'une entreprise cliente déjà créée (avec --entreprise et --fiche), après contrôle du BCE")
    nc.add_argument("--entreprise", default=None, help="UUID de l'entreprise à enregistrer (avec --enregistrer-existante)")
    nc.add_argument("--ajouter-services", action="store_true", dest="ajouter_services",
                    help="dote une entreprise EXISTANTE (avec --entreprise) de tous les services de la fiche : elle devient le service marketing du client")
    nc.add_argument("--slug", default=None, help="identifiant du client à la place de celui tiré du nom (avec --ajouter-services)")
    mc = sp.add_parser("mettre-a-jour-client")
    mc.add_argument("--client", required=True, help="identifiant (slug) du client enregistré sous instance/atelier-client/<slug>/")
    mc.add_argument("--a-blanc", "--a_blanc", action="store_true", dest="a_blanc", help="liste les écritures prévues sans rien écrire")
    mc.add_argument("--pause-hors-registre", action="store_true", dest="pause_hors_registre",
                    help="met en pause (jamais de suppression) les agents hors registre ; décision humaine")
    mc.add_argument("--sans-nouveaux-services", action="store_true", dest="sans_nouveaux_services",
                    help="n'ajoute pas les services du registre absents chez ce client")
    ac = sp.add_parser("assurer-connexions")
    ac.add_argument("--detail", action="store_true", help="affiche aussi le détail quand rien n'a été écrit")
    x = sp.add_parser("exporter")
    x.add_argument("--sortie", default=None, help="dossier de sortie (vide ou absent) ; obligatoire sans --entreprise")
    x.add_argument("--entreprise", default=None, help="UUID de l'entreprise à exporter (défaut : l'organisation modèle)")
    x.add_argument("--pg-port", type=int, default=None, dest="pg_port",
                   help="avec --entreprise : port PostgreSQL de l'instance (54329 pour 3100) ; mot de passe dans PGPASSWORD")
    pg = sp.add_parser("purger")
    pg.add_argument("--entreprise", required=True, help="UUID de l'entreprise dont toutes les données seront supprimées")
    pg.add_argument("--confirmer", action="store_true", help="obligatoire : la suppression est irréversible")
    pg.add_argument("--a-blanc", "--a_blanc", action="store_true", dest="a_blanc", help="liste ce qui serait supprimé (comptes par table), sans rien supprimer")
    pg.add_argument("--export", default=None, help="dossier d'un export déjà fait (défaut : le plus récent sous instance/exports/<UUID>/)")
    pg.add_argument("--hors-marqueur", action="store_true", dest="hors_marqueur",
                    help="autorise la purge d'une entreprise sans registre local (instance/atelier-client/<slug>/entreprise.json) ; exige --nom-confirme")
    pg.add_argument("--nom-confirme", default=None, dest="nom_confirme",
                    help="avec --hors-marqueur : nom exact de l'entreprise, retapé à l'identique")
    pm = sp.add_parser("purger-memoires")
    pm.add_argument("--client", required=True, help="identifiant (slug) du client enregistré sous instance/atelier-client/<slug>/")
    pm.add_argument("--motif", required=True, help="texte qui désigne la personne (nom, courriel, numéro), cherché sans casse")
    pm.add_argument("--confirmer", action="store_true", help="efface vraiment ; sans lui : à blanc (liste les comptes, n'écrit rien)")
    pm.add_argument("--a-blanc", "--a_blanc", action="store_true", dest="a_blanc", help="à blanc (défaut) : n'écrit rien")
    nd = sp.add_parser("nettoyer-doublons")
    nd.add_argument("--client", required=True)
    nd.add_argument("--confirmer", action="store_true", help="met en pause puis supprime les doublons sans activité (défaut : à blanc)")
    r = sp.add_parser("reinitialiser")
    r.add_argument("--confirmer", default="")
    j = sp.add_parser("jeton")
    j.add_argument("--confirmer", action="store_true")
    tr = sp.add_parser("test-reel")
    tr.add_argument("--agent", default="tests-techniques")
    tr.add_argument("--confirmer", action="store_true")
    cl = sp.add_parser("cles")
    cl.add_argument("--confirmer", action="store_true")
    cl.add_argument("--entreprise", default=None, help="identifiant de l'entreprise (défaut : l'organisation modèle)")
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
        "mettre-a-jour-client": cmd_mettre_a_jour_client,
        "nettoyer-doublons": cmd_nettoyer_doublons,
        "assurer-connexions": cmd_assurer_connexions,
        "exporter": cmd_exporter,
        "purger": cmd_purger,
        "purger-memoires": cmd_purger_memoires,
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
