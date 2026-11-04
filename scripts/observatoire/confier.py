#!/usr/bin/env python3
"""Confie les articles au département Observatoire d'une instance Paperclip.

Pour chaque sujet NN-*.json : déclare le projet (POST obs/projets, idempotent par slug) puis crée UNE tâche
« Article : <titre> » assignée au directeur, statut todo (idempotent par titre). Ne démarre rien.

Usage : python3 -I confier.py --api http://127.0.0.1:<port>/api [--a-blanc] [--seulement NN] [--projet-seulement] [--production]
--api est obligatoire (aucune valeur par défaut) et le port 3100 est refusé, sauf avec --production.
--projet-seulement : déclare le projet sans créer la tâche (la tâche se crée après l'activation des agents).
"""
import argparse
import glob
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

PLUGIN_CLE = "atelier.marketing-ia"
PORTS_INTERDITS = {3100}
ICI = os.path.dirname(os.path.abspath(__file__))


class ErreurHttp(Exception):
    def __init__(self, code, texte):
        super().__init__(f"HTTP {code} : {texte}")
        self.code, self.texte = code, texte


def verifier_api(api, production=False):
    u = urllib.parse.urlsplit(api)
    if u.scheme != "http" or u.hostname not in ("127.0.0.1", "localhost") or u.port is None:
        raise ValueError(f"--api doit être http://127.0.0.1:<port>/api (reçu : {api})")
    if u.port in PORTS_INTERDITS and not production:
        raise ValueError(f"port {u.port} interdit sans --production")
    return api.rstrip("/")


def lire_cle_fichier(port) -> str | None:
    """Clé board lue dans un fichier 0600 hors dépôt : ATELIER_CLE_BOARD_FICHIER, sinon ~/.config/atelier/board-<port>.key.

    Absent : None (mode local_trusted, comportement historique). Fichier qui ne m'appartient pas, ouvert au groupe
    ou aux autres, ou contenu invalide : ignoré avec un avertissement. Créé par scripts/passer-en-mode-authentifie.sh.
    (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    chemin = os.environ.get("ATELIER_CLE_BOARD_FICHIER") or os.path.join(
        os.path.expanduser("~"), ".config", "atelier", f"board-{port}.key")
    try:
        st = os.stat(chemin)
    except OSError:
        return None
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        print(f"AVERTISSEMENT : {chemin} ignoré (il doit m'appartenir et être en 0600).", file=sys.stderr)
        return None
    try:
        with open(chemin, encoding="utf-8") as f:
            cle = f.read().strip()
    except OSError:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.-]{16,512}", cle):
        print(f"AVERTISSEMENT : contenu de {chemin} invalide : clé non envoyée.", file=sys.stderr)
        return None
    return cle


def ajouter_cle_tableau(req):
    """Mode authentifié : ajoute la clé d'API du tableau (board), facultative.

    Source : PAPERCLIP_BOARD_KEY si elle est définie, sinon le fichier de clé de l'instance visée
    (lire_cle_fichier, seulement vers la boucle locale). Sans clé, la requête part sans jeton (local_trusted).
    La clé n'est envoyée que vers http://127.0.0.1:<port>, http://localhost:<port> ou https://<nom>.ts.net ;
    ailleurs, rien n'est envoyé (avertissement sans la clé). L'en-tête est « non redirigeable » : il n'est
    jamais recopié lors d'une redirection. (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    u = urllib.parse.urlsplit(req.full_url)
    h = (u.hostname or "").lower()
    boucle_locale = u.scheme == "http" and h in ("127.0.0.1", "localhost") and u.port is not None
    cle = os.environ.get("PAPERCLIP_BOARD_KEY") or (lire_cle_fichier(u.port) if boucle_locale else None)
    if not cle:
        return
    if boucle_locale:
        autorise = True
    else:
        autorise = u.scheme == "https" and h.endswith(".ts.net") and len(h) > len(".ts.net")
    if autorise:
        req.add_unredirected_header("Authorization", "Bearer " + cle)
    else:
        print("AVERTISSEMENT : PAPERCLIP_BOARD_KEY non envoyée (destination hors 127.0.0.1, localhost et *.ts.net : "
              + (u.hostname or "?") + ").", file=sys.stderr)


def appel_http(api):
    def appel(methode, chemin, corps=None):
        donnees = None if corps is None else json.dumps(corps).encode("utf-8")
        req = urllib.request.Request(api + chemin, data=donnees, method=methode,
                                     headers={"Content-Type": "application/json", "Accept": "application/json"})
        ajouter_cle_tableau(req)  # mode authentifié : clé board facultative, boucle locale seulement
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                brut = r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise ErreurHttp(e.code, e.read().decode("utf-8", "replace")[:400]) from None
        return json.loads(brut) if brut else None
    return appel


def corps_projet(sujet, company_id):
    """Corps de POST obs/projets : copie du projet avec <OBS> remplacé (l'entrée n'est pas modifiée)."""
    return {**sujet["projet"], "companyId": company_id}


def titre_tache(sujet):
    return "Article : " + sujet["projet"]["nom"]


def _puces(valeurs):
    return "\n".join(f"- {v}" for v in valeurs)


def description_brief(brief):
    """Sujet en Markdown : consigne, plan, pistes sourcées (jamais des preuves), points ouverts, règles."""
    blocs = [f"# {brief['tache']}", f"Catégorie : {brief.get('categorie', 'non précisée')}\n\nDate de publication : {brief.get('publie_le', 'non précisée')}",
             "## Angle\n\n" + brief["angle"], "## Plan\n\n" + "\n".join(f"{i}. {p}" for i, p in enumerate(brief["plan"], 1))]
    faits = []
    for f in brief["faits"]:
        faits.append(f"- {f['texte']}\n  - Source : {f['source_url']}\n  - Extrait exact : `{f['extrait_exact']}`"
                     + (f"\n  - Statut proposé : {f['statut_propose']}" if f.get("statut_propose") else ""))
    # T5 : faits écrits hors du département, donc pistes ; le dossier de recherche est écrit par la veille (étape 0 du directeur).
    blocs.append("## Pistes du sujet (à vérifier : le dossier de recherche est écrit par la veille du département)\n\n" + "\n".join(faits))
    if brief.get("points_ouverts"):
        blocs.append("## Points ouverts\n\n" + _puces(brief["points_ouverts"]))
    if brief.get("regles"):
        regles = brief["regles"]
        blocs.append("## Règles\n\n" + (_puces(regles) if isinstance(regles, list) else str(regles)))
    return "\n\n".join(blocs) + "\n"


def politique_article(porte_id, utilisateur_id):
    """Politique d'exécution native exigée par portes.creer (même forme que organisation/politiques/livrable-public.json) :
    une étape de revue tenue par la porte déterministe, puis l'approbation de l'humain responsable."""
    return {"responsibleUserId": utilisateur_id, "executionPolicy": {
        "mode": "normal", "commentRequired": True, "maxReviewRounds": 3,
        "stages": [{"type": "review", "participants": [{"type": "agent", "agentId": porte_id}]},
                   {"type": "approval", "participants": [{"type": "user", "userId": utilisateur_id}]}]}}


def titre_anglais(sujet):
    return "Version anglaise : " + sujet["projet"]["nom"]


def corps_anglais(sujet, adaptateur_id, project_id, parent_id, politique):
    """Sous-tâche de la version anglaise (T7), bloquée par la tâche française : ni prise avant (dépendance non prête), ni oubliée
    (réveil issue_blockers_resolved quand l'article passe à done, donc après l'approbation de l'opérateur)."""
    slug = sujet["projet"]["slug"]
    description = (f"Tâche obs.traduire : document `{slug}-en`, adaptation de la révision approuvée du document `{slug}-fr` "
                   "de la tâche parente (la porte l'y lit pour OBS-08). Première ligne : `base_revision_fr: <latestRevisionId du document -fr>`.")
    return {"title": titre_anglais(sujet), "description": description, "status": "blocked", "blockedByIssueIds": [parent_id],
            "assigneeAgentId": adaptateur_id, "projectId": project_id, "parentId": parent_id, **politique}


def corps_tache(sujet, agent_id, project_id, politique):
    return {"title": titre_tache(sujet), "description": description_brief(sujet["brief"]),
            "status": "todo", "assigneeAgentId": agent_id, "projectId": project_id, **politique}


def lister_projets_natifs(appel, company_id):
    """{nom: identifiant} des projets natifs de l'entreprise."""
    return {p["name"]: p["id"] for p in appel("GET", f"/companies/{company_id}/projects")}


def utilisateur_responsable(appel):
    """Humain connecté (session du board), approbateur final des tâches d'article."""
    uid = ((appel("GET", "/auth/get-session") or {}).get("user") or {}).get("id")
    if not uid:
        raise ValueError("utilisateur humain responsable introuvable (session du board absente)")
    return uid


# Revues requises de portes.creer : seul le relecteur indépendant rend un verdict (rôle metier).
# La porte déterministe tient l'étape native de revue et évalue les verdicts : elle n'en rend pas,
# donc la lister comme revue requise bloquerait la tâche (porte.ts : verdict du rôle exigences attendu).
ROLES_PORTE = (("metier", "relecteur-independant"),)


def _agent_unique(agents, slug):
    trouves = [a for a in agents if _slug_agent(a) == slug]
    if len(trouves) != 1:
        raise ValueError(f"{len(trouves)} agent « {slug} » trouvé(s), un seul attendu")
    return trouves[0]["id"]


def trouver_adaptateur(appel, cid):
    """Identifiant de l'agent adaptateur-anglais (T7). Échoue s'il manque ou est en double."""
    return _agent_unique(appel("GET", f"/companies/{cid}/agents"), "adaptateur-anglais")


def _slug_agent(agent):
    """Slug stable d'un agent : le nom sans accent ni majuscule, espaces en tirets (l'urlKey de Paperclip perd les lettres accentuées)."""
    nom = unicodedata.normalize("NFD", agent.get("name") or "").encode("ascii", "ignore").decode()
    return "-".join(nom.strip().lower().split())


def trouver_agents_porte(appel, cid):
    """(id de l'agent porte, revuesRequises). Échoue si un agent manque ou est en double."""
    agents = appel("GET", f"/companies/{cid}/agents")
    return _agent_unique(agents, "porte"), [{"role": role, "agentId": _agent_unique(agents, slug)} for role, slug in ROLES_PORTE]


def mettre_sous_porte(appel, sujet, company_id, issue_id, revues, langue="fr"):
    """Pose la porte sur la tâche d'article (ou sa sous-tâche anglaise) ; un conflit (409) veut dire que la porte existe déjà."""
    corps = {"companyId": company_id, "issueId": issue_id, "cleLivrable": f"{sujet['projet']['slug']}-{langue}", "revuesRequises": revues}
    try:
        appel("POST", f"/plugins/{PLUGIN_CLE}/api/obs/articles/mettre-sous-porte", corps)
    except ErreurHttp as e:
        if e.code != 409:
            raise
        return "porte déjà posée (conflit accepté)"
    return "porte posée"


def ajouter_alias(appel, sujet, company_id):
    """Projet déjà déclaré : relie les alias du sujet (route idempotente) ; rend le complément d'état (vide si rien d'ignoré)."""
    alias = sujet["projet"].get("alias") or []
    if not alias:
        return ""
    r = appel("POST", f"/plugins/{PLUGIN_CLE}/api/obs/projets/alias",
              {"companyId": company_id, "slug": sujet["projet"]["slug"], "alias": alias})
    ignores = (r or {}).get("aliasIgnores") or []
    return f" ; alias d'un autre projet ignorés : {', '.join(ignores)}" if ignores else ""


def confier_sujet(appel, sujet, company_id, agent_id, titres_existants, a_blanc, projet_seulement=False, revues=None, ids_taches=None, politique=None, projets_natifs=None, adaptateur=None):
    """Rend (état du projet, état de la tâche). titres_existants est mis à jour (liste modifiable).
    Avec `revues` (voir trouver_agents_porte), la tâche est mise sous porte ; `ids_taches` ({titre: id}) est mis à jour.
    Avec `adaptateur` (et `revues`), la sous-tâche anglaise est créée sous la tâche française et mise sous porte (T7).
    La tâche naît dans un projet natif (article-<n>-<slug>, créé s'il manque dans `projets_natifs`) avec `politique`."""
    projets_natifs = {} if projets_natifs is None else projets_natifs
    ids_taches = {} if ids_taches is None else ids_taches
    if a_blanc:
        etat_projet = "projet : POST serait tenté (409 = déjà déclaré)"
    else:
        try:
            appel("POST", f"/plugins/{PLUGIN_CLE}/api/obs/projets", corps_projet(sujet, company_id))
            etat_projet = "projet créé"
        except ErreurHttp as e:
            if e.code != 409:
                raise
            etat_projet = "projet déjà déclaré" + ajouter_alias(appel, sujet, company_id)
    if projet_seulement:
        return etat_projet, "tâche non créée (--projet-seulement)"
    titre = titre_tache(sujet)
    if titre in titres_existants:
        etat = "tâche déjà présente"
    elif a_blanc:
        return etat_projet, "tâche serait créée" + ("" if revues is None else " ; porte serait posée" + _a_blanc_anglais(adaptateur))
    else:
        if politique is None:
            raise ValueError("politique d'exécution requise pour créer la tâche d'article")
        nom = sujet["projet"]["slug"]
        if nom not in projets_natifs:
            projets_natifs[nom] = appel("POST", f"/companies/{company_id}/projects", {"name": nom, "status": "in_progress"})["id"]
        ids_taches[titre] = appel("POST", f"/companies/{company_id}/issues", corps_tache(sujet, agent_id, projets_natifs[nom], politique))["id"]
        titres_existants.append(titre)
        etat = "tâche créée"
    if revues is None:
        return etat_projet, etat
    if titre not in ids_taches:
        raise ValueError(f"identifiant de la tâche « {titre} » inconnu : impossible de la mettre sous porte")
    if a_blanc:
        return etat_projet, etat + " ; porte serait posée" + _a_blanc_anglais(adaptateur)
    etat += " ; " + mettre_sous_porte(appel, sujet, company_id, ids_taches[titre], revues)
    if adaptateur is None:
        return etat_projet, etat
    return etat_projet, etat + " ; " + confier_anglais(appel, sujet, company_id, adaptateur, titres_existants, revues, ids_taches, politique, projets_natifs)


def _a_blanc_anglais(adaptateur):
    return "" if adaptateur is None else " ; sous-tâche anglaise et sa porte seraient créées"


def confier_anglais(appel, sujet, company_id, adaptateur, titres_existants, revues, ids_taches, politique, projets_natifs):
    """Sous-tâche anglaise (idempotente par son titre) puis sa porte, sur la clé `<slug>-en`."""
    titre = titre_anglais(sujet)
    if titre in titres_existants:
        etat = "sous-tâche anglaise déjà présente"
    else:
        projet = projets_natifs.get(sujet["projet"]["slug"])
        corps = corps_anglais(sujet, adaptateur, projet, ids_taches[titre_tache(sujet)], politique)
        ids_taches[titre] = appel("POST", f"/companies/{company_id}/issues", corps)["id"]
        titres_existants.append(titre)
        etat = "sous-tâche anglaise créée"
    if titre not in ids_taches:
        raise ValueError(f"identifiant de la tâche « {titre} » inconnu : impossible de la mettre sous porte")
    return etat + " ; " + mettre_sous_porte(appel, sujet, company_id, ids_taches[titre], revues, "en").replace("porte posée", "porte anglaise posée")


def ordre(texte_lisez_moi):
    """Numéros dans l'ordre de la section « Ordre conseillé » du LISEZ-MOI."""
    m = re.search(r"## Ordre conseillé\n(.*?)(?:\n## |\Z)", texte_lisez_moi, re.S)
    return re.findall(r"^\d+\. (\d\d) ", m.group(1), re.M) if m else []


def charger_sujets(dossier, seulement=None):
    fichiers = {os.path.basename(f)[:2]: f for f in glob.glob(os.path.join(dossier, "[0-9][0-9]-*.json"))}
    try:
        with open(os.path.join(dossier, "LISEZ-MOI.md"), encoding="utf-8") as f:
            voulu = ordre(f.read())
    except OSError:
        voulu = []
    nns = [n for n in voulu if n in fichiers] + sorted(n for n in fichiers if n not in voulu)
    if seulement:
        nns = [n for n in nns if n == seulement]
        if not nns:
            raise ValueError(f"aucun sujet {seulement}")
    sujets = []
    for n in nns:
        with open(fichiers[n], encoding="utf-8") as f:
            sujets.append(json.load(f))
    return sujets


def trouver_obs(appel):
    """Entreprise dont le nom commence par « OBS · » (refus si absente ou ambiguë) et son agent « Directeur »."""
    obs = [c for c in appel("GET", "/companies") if (c.get("name") or "").startswith("OBS ·")]
    if len(obs) != 1:
        raise ValueError(f"{len(obs)} entreprise(s) « OBS · » trouvée(s), une seule attendue")
    cid = obs[0]["id"]
    dirs = [a for a in appel("GET", f"/companies/{cid}/agents") if (a.get("name") or "").strip().lower() == "directeur"]
    if len(dirs) != 1:
        raise ValueError(f"{len(dirs)} agent « Directeur » trouvé(s), un seul attendu")
    return cid, obs[0]["name"], dirs[0]["id"]


def main(argv=None):
    p = argparse.ArgumentParser(description="Confie les articles au département Observatoire")
    p.add_argument("--api", required=True, help="http://127.0.0.1:<port>/api (3100 : seulement avec --production)")
    p.add_argument("--a-blanc", action="store_true", help="n'écrit rien, affiche ce qui serait fait")
    p.add_argument("--seulement", metavar="NN", help="un seul sujet (numéro à deux chiffres)")
    p.add_argument("--projet-seulement", action="store_true", help="déclare le projet, ne crée pas la tâche")
    p.add_argument("--production", action="store_true", help="autorise le port 3100 (instance de production)")
    a = p.parse_args(argv)
    try:
        api = verifier_api(a.api, a.production)
        sujets = charger_sujets(os.path.join(ICI, "sujets"), a.seulement)
        appel = appel_http(api)
        cid, nom, agent = trouver_obs(appel)
        issues = appel("GET", f"/companies/{cid}/issues?limit=5000")
        titres = [i["title"] for i in issues]
        ids_taches = {i["title"]: i["id"] for i in issues}
        porte_id, revues = (None, None) if a.projet_seulement else trouver_agents_porte(appel, cid)
        adaptateur = None if a.projet_seulement else trouver_adaptateur(appel, cid)
        politique = None if a.projet_seulement else politique_article(porte_id, utilisateur_responsable(appel))
        natifs = lister_projets_natifs(appel, cid)
        print(f"Instance {api} | entreprise « {nom} » ({cid}) | directeur {agent} | {'À BLANC' if a.a_blanc else 'RÉEL'}")
        for s in sujets:
            etats = confier_sujet(appel, s, cid, agent, titres, a.a_blanc, a.projet_seulement, revues, ids_taches, politique, natifs, adaptateur)
            print(f"{s['numero']:02d} {s['projet']['slug']} : {' ; '.join(etats)}")
    except (ValueError, ErreurHttp, OSError, KeyError) as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
