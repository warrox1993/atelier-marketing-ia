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
  exporter --sortie DIR  export natif, nettoyage des valeurs propres à la machine,
                         contrôle, puis aperçu d'import du paquet exporté.
  reinitialiser --confirmer "<nom exact>"
                         supprime l'entreprise de démonstration, ses dossiers locaux et les
                         fichiers que Paperclip a rangés pour elle sous
                         <PAPERCLIP_HOME>/instances/<instance>/companies/<id>/.
  jeton --confirmer      lit un jeton sur l'entrée standard (jamais en argument), le
                         range comme secret Paperclip natif et le lie aux agents.
  test-reel [--agent SLUG] [--confirmer]
                         test réel minimal de claude_local (sonde « hello » native) ;
                         à blanc sans --confirmer.

Limite connue : l'API masque les valeurs « plain » des variables d'un agent (***REDACTED***). Une valeur
changée dans l'interface (par exemple CLAUDE_CONFIG_DIR) n'est ni détectée ni corrigée par « appliquer » ;
l'empreinte de liaison décrit la liaison voulue par le registre, pas la valeur réelle. Détection manuelle :
GET /agents/<id>/config-revisions (docs/exploitation.md, section 8).

Verrou : « appliquer » et « reinitialiser » prennent un verrou de fichier exclusif
(instance/.bootstrap-ecriture.lock) ; un second lancement simultané est refusé.

Variables : ATELIER_API (défaut http://127.0.0.1:<PORT>/api, PORT lu dans
config/atelier.env, sinon 3100) ; PAPERCLIP_HOME et PAPERCLIP_INSTANCE_ID (défaut : valeurs de
config/atelier.env) pour retrouver les fichiers Paperclip d'une entreprise ;
ATELIER_DONNEES_LOCALES (défaut : dossier instance/ du dépôt).
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import getpass
import hashlib
import json
import os
import re
import shutil
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ORGA = RACINE / "organisation"
REGISTRE_AGENTS = ORGA / "registre" / "agents.json"
REGISTRE_ORGA = ORGA / "registre" / "organisation.json"
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

def arguments_outils(agent: dict, adaptateur: dict) -> list[str]:
    outils = agent["outils"]
    autorises = outils["recherche"] + outils["mutation"]
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

    for agent in reg_agents["agents"]:
        chemin = ORGA / "agents" / agent["slug"] / "AGENTS.md"
        if not chemin.exists():
            raise ErreurAtelier(f"instructions manquantes : {chemin.relative_to(RACINE)}")
        _, corps = separer_frontmatter(chemin.read_text(encoding="utf-8"))
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
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            f.seek(0)
            detenteur = f.read().strip() or "inconnu"
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


class Api:
    def __init__(self, base: str):
        self.base = base
        self.ecritures = 0

    def appel(self, methode: str, chemin: str, corps=None, attendu=(200, 201)):
        donnees = None if corps is None else json.dumps(corps).encode("utf-8")
        req = urllib.request.Request(self.base + chemin, data=donnees, method=methode)
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


def trouver_entreprise(api: Api, reg_orga: dict):
    """Renvoie l'entreprise de démonstration ou None. Refuse toute ambiguïté."""
    entreprise = reg_orga["entreprise"]
    nom = unicodedata.normalize("NFC", entreprise["nom"])
    toutes = api.get("/companies")
    candidates = [c for c in toutes if unicodedata.normalize("NFC", c.get("name") or "") == nom]
    # Une entreprise marquée sous un autre nom (renommée dans l'interface, ou entreprise
    # jetable d'une sonde restée en place) rendrait le périmètre ambigu : on refuse.
    autres = [c for c in toutes if entreprise["marqueur"] in (c.get("description") or "") and c not in candidates]
    if autres:
        liste = ", ".join(f"« {c.get('name')} » ({c['id']})" for c in autres)
        raise ErreurAtelier(
            f"entreprise(s) portant le marqueur {entreprise['marqueur']} sous un autre nom : {liste}. "
            "Renommez-la ou supprimez-la ; rien n'est modifié."
        )
    if not candidates:
        return None
    marquees = [c for c in candidates if entreprise["marqueur"] in (c.get("description") or "")]
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

def dossiers_agent(slug: str) -> tuple[Path, Path]:
    return ESPACES / slug, CONFIGS_CLAUDE / slug


def preparer_dossiers_locaux(reg_agents: dict) -> int:
    """Crée l'espace et la configuration Claude dédiée de chaque agent.

    Le settings.json dédié porte « claudeMdExcludes » : sans lui, Claude Code charge les
    CLAUDE.md de tous les dossiers parents du cwd, y compris ~/.claude/CLAUDE.md
    (constaté le 15/10/2026 par capture locale de la requête, sans appel de modèle :
    scripts/bootstrap-tests.sh, test d'isolement). Renvoie le nombre de fichiers écrits.
    """
    reglages = json.dumps(reg_agents["adaptateur"]["reglagesConfigClaude"], ensure_ascii=False, indent=2) + "\n"
    ecrits = 0
    for agent in reg_agents["agents"]:
        if agent.get("deterministe"):
            continue  # aucun Claude : ni espace ni configuration dédiée
        espace, config = dossiers_agent(agent["slug"])
        for d in (espace, config):
            d.mkdir(parents=True, exist_ok=True)
            os.chmod(d, 0o700)
        if ecrire_si_change(config / "settings.json", reglages):
            os.chmod(config / "settings.json", 0o600)
            ecrits += 1
    return ecrits


def env_voulu(reg_agents: dict, slug: str, jeton_id: str | None) -> dict:
    _, config = dossiers_agent(slug)
    env = {cle: {"type": "plain", "value": val} for cle, val in reg_agents["adaptateur"]["envPortable"].items()}
    env["CLAUDE_CONFIG_DIR"] = {"type": "plain", "value": str(config)}
    if jeton_id:
        env[VARIABLE_JETON] = {"type": "secret_ref", "secretId": jeton_id, "version": "latest"}
    return env


def liaison_voulue(reg_agents: dict, slug: str, jeton_id: str | None, mode: str) -> dict:
    """Configuration propre à la machine, jamais écrite dans le paquet.

    reel : adaptateur claude_local du paquet + cwd et CLAUDE_CONFIG_DIR dédiés (+ jeton).
    demonstration : adaptateur process du lot A (aucun modèle), cwd = dossier du plugin.
    """
    espace, _ = dossiers_agent(slug)
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
        "config": {"cwd": str(espace), "env": env_voulu(reg_agents, slug, jeton_id)},
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


def derives_configuration(d: dict, agent: dict, reg_agents: dict, agents: dict, mode: str) -> list[str]:
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
        attendu = liaison_voulue(reg_agents, agent["slug"], None, mode)["config"]
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
        derive = derives_configuration(d, agent, reg_agents, agents, mode)
        if derive:
            raisons.append(f"configuration modifiée hors registre : {agent['slug']} ({', '.join(derive)})")
        meta = ((d.get("metadata") or {}).get("atelier") or {}).get("bootstrap") or {}
        if meta.get("empreinte") != empreinte:
            raisons.append(f"empreinte différente : {agent['slug']}")
        if not liaison_conforme(d, liaison_voulue(reg_agents, agent["slug"], jeton_id, mode)):
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
    for slug in sorted(set(agents_par_slug(api, company_id)) - slugs):
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
        liaison = liaison_voulue(reg_agents, agent["slug"], jeton_id, mode)
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
      arrive pour « tous les agents » : relancer `appliquer` la resserre.
    - Rôle en `lecture` : politique native « block » sur les écritures (`risk.isWrite`) de la
      connexion pour cet agent ; une politique « block » l'emporte toujours. Créée si absente,
      jamais modifiée ni réactivée ensuite (un choix humain dans Paperclip est respecté).
    Les écritures des autres rôles restent « Ask first » (patch socle 0005).
    """
    services = reg_agents["connexionsPasserelle"]["services"]
    besoins = besoins_connexions(reg_agents)
    toutes_politiques = politiques_outils(api, company_id)
    existantes = {p.get("name") for p in toutes_politiques}
    rep_profils = api.get(f"/companies/{company_id}/tools/profiles")
    profils = {p.get("profileKey"): p for p in (rep_profils.get("profiles", []) if isinstance(rep_profils, dict) else rep_profils)}
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
    api = Api(url_api())
    fichiers = fichiers_paquet()
    mode = args.mode
    if mode == "demonstration" and not (PLUGIN / SCRIPT_DEMO).exists():
        print(f"Attention : {SCRIPT_DEMO} n'existe pas encore dans plugin-atelier/ (lot A) ; "
              "les agents de démonstration restent en pause et ne pourront pas tourner avant sa livraison.")
    # L'empreinte couvre le paquet ET le mode : changer de mode relance l'import natif,
    # qui remet la configuration canonique avant la nouvelle liaison.
    empreinte = hashlib.sha256((empreinte_paquet(fichiers) + ":" + mode).encode()).hexdigest()
    slugs = [a["slug"] for a in reg_agents["agents"]]

    entreprise = trouver_entreprise(api, reg_orga)  # contrôle de périmètre avant toute écriture
    reglages_ecrits = preparer_dossiers_locaux(reg_agents)
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
    fichiers_ecrits += ecrire_si_change(ETAT_LOCAL / "etat-bootstrap.json", json.dumps(etat, ensure_ascii=False, indent=2) + "\n")
    for nom, contenu in politiques.items():
        fichiers_ecrits += ecrire_si_change(
            ETAT_LOCAL / "politiques" / f"{nom}.json", json.dumps(contenu, ensure_ascii=False, indent=2) + "\n"
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
    print(f"Réglages Claude dédiés écrits : {reglages_ecrits} fichier(s)")
    for ecart in ecarts_non_geres(api, company_id, reg_agents, reg_orga):
        print(f"  écart non géré (rien n'est supprimé automatiquement) : {ecart}")
    print(f"Fichiers d'état locaux réécrits : {fichiers_ecrits}")
    print(f"Écritures API totales : {api.ecritures}")
    return 0


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
        ecart = "" if reel == voulu else f" ; ÉCART, attendu : {', '.join(voulu) or 'aucun'} (relancer appliquer)"
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


def cmd_exporter(args) -> int:
    _, reg_orga = registres()
    api = Api(url_api())
    e = trouver_entreprise(api, reg_orga)
    if not e:
        raise ErreurAtelier("aucune organisation de démonstration à exporter")
    sortie = Path(args.sortie).resolve()
    if sortie.exists() and any(sortie.iterdir()):
        raise ErreurAtelier(f"le dossier de sortie n'est pas vide : {sortie}")
    resultat = api.appel("POST", f"/companies/{e['id']}/exports", {
        "include": {"company": True, "agents": True, "projects": True, "issues": True, "skills": True},
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
    sortie.mkdir(parents=True, exist_ok=True)
    for chemin, contenu in fichiers.items():
        cible = (sortie / chemin).resolve()
        if not str(cible).startswith(str(sortie) + os.sep):
            raise ErreurAtelier(f"chemin d'export hors du dossier : {chemin}")
        cible.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(contenu, str):
            cible.write_text(contenu, encoding="utf-8")
        else:
            import base64

            cible.write_bytes(base64.b64decode(contenu["data"]))
    print(f"{len(fichiers)} fichier(s) exporté(s) dans {sortie}")
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
    for slug in (a["slug"] for a in reg_agents["agents"]):
        for d in dossiers_agent(slug):
            if d.is_dir() and d.parent in (ESPACES, CONFIGS_CLAUDE):
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


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sp = p.add_subparsers(dest="commande", required=True)
    g = sp.add_parser("generer")
    g.add_argument("--verifier", action="store_true")
    ap_ = sp.add_parser("appliquer")
    ap_.add_argument("--mode", choices=MODES, default="reel",
                     help="reel : claude_local prêt mais en pause (défaut) ; demonstration : agents process du lot A")
    sp.add_parser("etat")
    x = sp.add_parser("exporter")
    x.add_argument("--sortie", required=True)
    r = sp.add_parser("reinitialiser")
    r.add_argument("--confirmer", default="")
    j = sp.add_parser("jeton")
    j.add_argument("--confirmer", action="store_true")
    tr = sp.add_parser("test-reel")
    tr.add_argument("--agent", default="tests-techniques")
    tr.add_argument("--confirmer", action="store_true")
    args = p.parse_args(argv)
    commandes = {
        "generer": cmd_generer,
        "appliquer": cmd_appliquer,
        "etat": cmd_etat,
        "exporter": cmd_exporter,
        "reinitialiser": cmd_reinitialiser,
        "jeton": cmd_jeton,
        "test-reel": cmd_test_reel,
    }
    try:
        return commandes[args.commande](args)
    except ErreurAtelier as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
