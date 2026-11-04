"""Tests minimaux de confier.py, avec des données factices (aucun réseau). Lancer : python3 -I test_confier.py"""
import importlib.util
import os

ici = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("confier", os.path.join(ici, "confier.py"))
confier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(confier)

SUJET = {
    "numero": 7, "slug": "x",
    "projet": {"companyId": "<OBS>", "slug": "article-7-x", "nom": "Titre factice", "alias": [{"type": "npm", "valeur": "pkg"}]},
    "brief": {"tache": "Rédiger", "angle": "Un angle", "plan": ["a", "b"], "faits": [{"texte": "t", "source_url": "http://s", "extrait_exact": "e"}]},
}


class Faux:
    """Faux serveur : mémorise les appels, refuse un slug déjà vu (409) comme le plugin."""
    def __init__(self, titres=()):
        self.appels, self.slugs, self.titres = [], set(), list(titres)
        self.natifs = {}  # nom -> identifiant des projets natifs

    def __call__(self, methode, chemin, corps=None):
        self.appels.append((methode, chemin, corps))
        if methode == "POST" and chemin.endswith("/obs/projets"):
            if corps["slug"] in self.slugs:
                raise confier.ErreurHttp(409, "existe déjà")
            self.slugs.add(corps["slug"])
            return {"projetId": "p"}
        if methode == "POST" and chemin.endswith("/obs/projets/alias"):
            assert corps["slug"] in self.slugs, "alias ajoutés à un projet inconnu"
            return {"projetId": "p", "slug": corps["slug"], "aliasIgnores": getattr(self, "ignores", [])}
        if methode == "GET" and chemin.endswith("/projects"):
            return [{"id": i, "name": n} for n, i in self.natifs.items()]
        if methode == "POST" and chemin.endswith("/projects"):
            self.natifs[corps["name"]] = "pn-" + corps["name"]
            return {"id": self.natifs[corps["name"]]}
        if methode == "POST" and chemin.endswith("/issues"):
            self.titres.append(corps["title"])
            return {"id": "i"}
        raise AssertionError(f"appel inattendu {methode} {chemin}")


POLITIQUE = confier.politique_article("ag-porte", "humain-1")


def ecritures(faux):
    return [a for a in faux.appels if a[0] == "POST"]


# remplacement de <OBS>, sans modifier l'entrée
corps = confier.corps_projet(SUJET, "CID")
assert corps["companyId"] == "CID" and SUJET["projet"]["companyId"] == "<OBS>"
assert corps["slug"] == "article-7-x" and corps["alias"] == SUJET["projet"]["alias"]

# titre et corps de la tâche
assert confier.titre_tache(SUJET) == "Article : Titre factice"
t = confier.corps_tache(SUJET, "AGENT", "PN", POLITIQUE)
assert t["title"] == "Article : Titre factice" and t["status"] == "todo" and t["assigneeAgentId"] == "AGENT"
assert "Un angle" in t["description"] and "http://s" in t["description"] and "1. a" in t["description"]
assert "## Pistes du sujet" in t["description"] and "## Faits" not in t["description"]  # T5 : le dossier vient de la veille

# idempotence : seconde passe ne recrée ni projet ni tâche
faux = Faux()
r1 = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, politique=POLITIQUE)
assert r1 == ("projet créé", "tâche créée"), r1
assert len(ecritures(faux)) == 3  # projet, projet natif, tâche
r2 = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, politique=POLITIQUE)
assert r2 == ("projet déjà déclaré", "tâche déjà présente"), r2
assert sum(1 for a in faux.appels if a[1].endswith("/issues")) == 1

# à blanc : aucune écriture
faux = Faux()
confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=True, politique=POLITIQUE)
assert ecritures(faux) == []

# garde-fous : adresse 3100 refusée, ordre du LISEZ-MOI
try:
    confier.verifier_api("http://127.0.0.1:3100/api")
    raise SystemExit("3100 aurait dû être refusé")
except ValueError:
    pass
# 3100 accepté seulement avec production=True ; les autres hôtes restent refusés
assert confier.verifier_api("http://127.0.0.1:3100/api", production=True) == "http://127.0.0.1:3100/api"
try:
    confier.verifier_api("http://example.com:3100/api", production=True)
    raise SystemExit("hôte distant aurait dû être refusé")
except ValueError:
    pass
# --projet-seulement : le projet est déclaré, aucune tâche n'est créée
faux = Faux()
r3 = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, projet_seulement=True)
assert r3 == ("projet créé", "tâche non créée (--projet-seulement)"), r3
assert [a[1] for a in ecritures(faux)] == [a[1] for a in faux.appels if a[1].endswith("/obs/projets")] and len(ecritures(faux)) == 1
assert faux.titres == []
# l'option --production est la seule porte vers 3100 en ligne de commande
assert confier.main(["--api", "http://127.0.0.1:3100/api", "--a-blanc"]) == 1
assert confier.verifier_api("http://127.0.0.1:3122/api") == "http://127.0.0.1:3122/api"
assert confier.ordre("## Ordre conseillé\n\n1. 02 b\n2. 01 a\n\n## Autre\n") == ["02", "01"]
print("OK : tous les tests passent")


# ---- mise sous porte de la tâche d'article (fonctions pytest) ----
import contextlib
import io
import json
import tempfile

import pytest

AGENTS_OBS = [
    {"id": "ag-dir", "name": "Directeur"}, {"id": "ag-porte", "name": "Porte"},
    {"id": "ag-rel", "name": "Relecteur indépendant"}, {"id": "ag-red", "name": "Rédacteur en chef"},
]
URL_PORTE = f"/plugins/{confier.PLUGIN_CLE}/api/obs/articles/mettre-sous-porte"
REVUES = [{"role": "metier", "agentId": "ag-rel"}]


class FauxPorte(Faux):
    """Ajoute la route de mise sous porte : un second appel pour la même clé répond 409, comme portes.creer."""
    def __init__(self, titres=()):
        super().__init__(titres)
        self.portes = set()

    def __call__(self, methode, chemin, corps=None):
        if methode == "POST" and chemin == URL_PORTE:
            self.appels.append((methode, chemin, corps))
            if corps["cleLivrable"] in self.portes:
                raise confier.ErreurHttp(409, "déjà sous contrôle automatique")
            self.portes.add(corps["cleLivrable"])
            return {"porteId": "po"}
        return super().__call__(methode, chemin, corps)


def appels_porte(faux):
    return [a for a in faux.appels if a[1] == URL_PORTE]


def test_resolution_des_deux_agents():
    faux = lambda m, c, corps=None: AGENTS_OBS if (m, c) == ("GET", "/companies/CID/agents") else pytest.fail(c)
    assert confier.trouver_agents_porte(faux, "CID") == ("ag-porte", REVUES)


def test_la_porte_tient_l_etape_mais_n_est_pas_une_revue_requise():
    faux = lambda m, c, corps=None: list(reversed(AGENTS_OBS))
    porte, revues = confier.trouver_agents_porte(faux, "CID")
    assert porte == "ag-porte" and all(r["agentId"] != "ag-porte" for r in revues)


def test_agent_manquant():
    faux = lambda m, c, corps=None: [a for a in AGENTS_OBS if a["name"] != "Porte"]
    with pytest.raises(ValueError, match="porte"):
        confier.trouver_agents_porte(faux, "CID")


def test_agent_en_double():
    faux = lambda m, c, corps=None: AGENTS_OBS + [{"id": "ag-rel2", "name": "Relecteur indépendant"}]
    with pytest.raises(ValueError, match="2 agent.*relecteur-independant"):
        confier.trouver_agents_porte(faux, "CID")


def test_appel_de_la_route_avec_la_bonne_charge():
    faux = FauxPorte()
    r = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, politique=POLITIQUE)
    assert r == ("projet créé", "tâche créée ; porte posée")
    assert appels_porte(faux) == [("POST", URL_PORTE, {
        "companyId": "CID", "issueId": "i", "cleLivrable": "article-7-x-fr", "revuesRequises": REVUES})]


def test_seconde_execution_ne_recree_rien():
    faux = FauxPorte()
    ids = {}
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, ids_taches=ids,
                          politique=POLITIQUE, projets_natifs=confier.lister_projets_natifs(faux, "CID"))
    avant = len(ecritures(faux))
    # seconde exécution : le projet natif est retrouvé par la liste de l'API, pas recréé
    r = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, ids_taches=ids,
                              politique=POLITIQUE, projets_natifs=confier.lister_projets_natifs(faux, "CID"))
    assert r == ("projet déjà déclaré", "tâche déjà présente ; porte déjà posée (conflit accepté)")
    assert sum(1 for a in faux.appels if a[1].endswith("/issues")) == 1
    assert sum(1 for a in faux.appels if a[0] == "POST" and a[1].endswith("/projects")) == 1
    assert len(faux.portes) == 1
    assert len(ecritures(faux)) == avant + 3  # projet (409), alias du sujet (idempotent) et route (409) tentés, rien de créé


def test_projet_natif_cree_puis_retrouve_et_nomme_comme_le_projet_de_l_observatoire():
    faux = FauxPorte()
    natifs = confier.lister_projets_natifs(faux, "CID")
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, politique=POLITIQUE, projets_natifs=natifs)
    crees = [a for a in faux.appels if a[0] == "POST" and a[1] == "/companies/CID/projects"]
    assert [c[2]["name"] for c in crees] == ["article-7-x"]
    assert natifs == {"article-7-x": "pn-article-7-x"}
    # un projet existant (autre exécution) est retrouvé, pas recréé
    faux2 = FauxPorte()
    faux2.natifs["article-7-x"] = "deja"
    natifs2 = confier.lister_projets_natifs(faux2, "CID")
    confier.confier_sujet(faux2, SUJET, "CID", "AGENT", faux2.titres, a_blanc=False, politique=POLITIQUE, projets_natifs=natifs2)
    assert not [a for a in faux2.appels if a[0] == "POST" and a[1].endswith("/projects")]
    assert [a for a in faux2.appels if a[1].endswith("/issues")][0][2]["projectId"] == "deja"


def test_corps_de_la_tache_porte_projet_et_politique_d_execution():
    faux = FauxPorte()
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, politique=POLITIQUE,
                          projets_natifs={})
    corps = [a for a in faux.appels if a[1] == "/companies/CID/issues"][0][2]
    assert corps["projectId"] == "pn-article-7-x"
    assert corps["responsibleUserId"] == "humain-1"
    etapes = corps["executionPolicy"]["stages"]
    assert [e["type"] for e in etapes] == ["review", "approval"]
    assert etapes[0]["participants"] == [{"type": "agent", "agentId": "ag-porte"}]
    assert etapes[1]["participants"] == [{"type": "user", "userId": "humain-1"}]
    assert "AGENT" not in json.dumps(corps["executionPolicy"])  # le producteur ne relit pas sa tâche


def test_ordre_des_appels_projet_natif_tache_puis_porte():
    faux = FauxPorte()
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, politique=POLITIQUE,
                          projets_natifs={})
    ordre = [a[1] for a in faux.appels if a[0] == "POST"]
    assert ordre == [f"/plugins/{confier.PLUGIN_CLE}/api/obs/projets", "/companies/CID/projects", "/companies/CID/issues", URL_PORTE]


def test_creation_de_tache_sans_politique_refusee():
    with pytest.raises(ValueError, match="politique"):
        confier.confier_sujet(FauxPorte(), SUJET, "CID", "AGENT", [], a_blanc=False, projets_natifs={})


def test_utilisateur_responsable_lu_dans_la_session():
    faux = lambda m, c, corps=None: {"user": {"id": "u1"}} if (m, c) == ("GET", "/auth/get-session") else pytest.fail(c)
    assert confier.utilisateur_responsable(faux) == "u1"
    with pytest.raises(ValueError, match="session"):
        confier.utilisateur_responsable(lambda m, c, corps=None: None)


def test_a_blanc_et_projet_seulement_ne_touchent_pas_la_porte():
    faux = FauxPorte()
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=True, revues=REVUES, politique=POLITIQUE)
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, projet_seulement=True, revues=REVUES)
    assert appels_porte(faux) == []


def test_autre_erreur_http_de_la_route_remonte():
    def faux(m, c, corps=None):
        if c == URL_PORTE:
            raise confier.ErreurHttp(400, "entrée invalide")
        return FauxPorte()(m, c, corps)
    with pytest.raises(confier.ErreurHttp):
        confier.confier_sujet(faux, SUJET, "CID", "AGENT", [], a_blanc=False, revues=REVUES, politique=POLITIQUE)


def test_refus_3100_sans_production_intact():
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        assert confier.main(["--api", "http://127.0.0.1:3100/api"]) == 1
    assert "3100" in err.getvalue()


def test_urlkey_ecorchee_par_paperclip_ignoree():
    # Sur 3100, Paperclip retire les accents de l'urlKey : « relecteur-ind-pendant ».
    agents = [{"id": "ag-porte", "name": "Porte", "urlKey": "porte"},
              {"id": "ag-rel", "name": "Relecteur indépendant", "urlKey": "relecteur-ind-pendant"}]
    porte, revues = confier.trouver_agents_porte(lambda m, c, corps=None: agents, "CID")
    assert porte == "ag-porte" and revues == [{"role": "metier", "agentId": "ag-rel"}]


def test_projet_deja_declare_recoit_les_alias_du_sujet():
    faux = Faux()
    confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, projet_seulement=True)
    r = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, projet_seulement=True)
    assert r[0] == "projet déjà déclaré", r
    assert faux.appels[-1] == ("POST", f"/plugins/{confier.PLUGIN_CLE}/api/obs/projets/alias",
                               {"companyId": "CID", "slug": "article-7-x", "alias": SUJET["projet"]["alias"]})
    faux.ignores = ["pkg"]
    r = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, projet_seulement=True)
    assert r[0] == "projet déjà déclaré ; alias d'un autre projet ignorés : pkg", r


def test_projet_deja_declare_sans_alias_n_appelle_pas_la_route():
    sujet = {**SUJET, "projet": {**SUJET["projet"], "alias": []}}
    faux = Faux()
    faux.slugs.add("article-7-x")
    confier.confier_sujet(faux, sujet, "CID", "AGENT", faux.titres, a_blanc=False, projet_seulement=True)
    assert not any(a[1].endswith("/alias") for a in faux.appels)


def test_sujet_01_porte_les_trois_url_du_pilote():
    with open(os.path.join(ici, "sujets", "01-claude-code-2-1-311.json"), encoding="utf-8") as f:
        alias = json.load(f)["projet"]["alias"]
    for url in ("https://github.com/anthropics/claude-code/releases/tag/v2.1.311",
                "https://api.github.com/repos/anthropics/claude-code/git/commits/08c6a4f5121ae140d3c1b5c96e3e5ae53587b54b",
                "https://api.github.com/repos/anthropics/claude-code/git/refs/tags/v2.1.311"):
        assert {"type": "site", "valeur": url} in alias, url


def test_t7_sous_tache_anglaise_creee_en_attente_et_mise_sous_porte():
    # T7 : aucun agent ne peut poser une porte ; confier.py pose donc aussi celle de la version anglaise, sur une sous-tâche
    # de la tâche française confiée à l'adaptateur, bloquée par elle : réveillée seule quand l'article est approuvé (done).
    faux = FauxPorte()
    ids = {}
    r = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, ids_taches=ids,
                              politique=POLITIQUE, projets_natifs={}, adaptateur="ag-en")
    assert r == ("projet créé", "tâche créée ; porte posée ; sous-tâche anglaise créée ; porte anglaise posée"), r
    taches = [a[2] for a in faux.appels if a[1] == "/companies/CID/issues"]
    assert len(taches) == 2
    en = taches[1]
    assert en["title"] == "Version anglaise : Titre factice" and en["status"] == "blocked" and en["blockedByIssueIds"] == ["i"]
    assert en["assigneeAgentId"] == "ag-en" and en["parentId"] == "i" and en["projectId"] == "pn-article-7-x"
    assert en["executionPolicy"] == POLITIQUE["executionPolicy"] and "article-7-x-fr" in en["description"]
    assert [c[2]["cleLivrable"] for c in appels_porte(faux)] == ["article-7-x-fr", "article-7-x-en"]
    # seconde exécution : rien de recréé, les deux portes en conflit acceptées
    r2 = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=False, revues=REVUES, ids_taches=ids,
                               politique=POLITIQUE, projets_natifs=confier.lister_projets_natifs(faux, "CID"), adaptateur="ag-en")
    assert r2[1] == "tâche déjà présente ; porte déjà posée (conflit accepté) ; sous-tâche anglaise déjà présente ; porte déjà posée (conflit accepté)", r2
    assert sum(1 for a in faux.appels if a[1] == "/companies/CID/issues") == 2


def test_t7_a_blanc_annonce_la_sous_tache_anglaise_sans_rien_ecrire():
    faux = FauxPorte()
    r = confier.confier_sujet(faux, SUJET, "CID", "AGENT", faux.titres, a_blanc=True, revues=REVUES, politique=POLITIQUE, adaptateur="ag-en")
    assert r[1] == "tâche serait créée ; porte serait posée ; sous-tâche anglaise et sa porte seraient créées", r
    assert [a for a in faux.appels if a[0] == "POST" and not a[1].endswith("/obs/projets")] == []


def test_t7_adaptateur_resolu_par_son_slug():
    agents = AGENTS_OBS + [{"id": "ag-en", "name": "Adaptateur anglais"}]
    assert confier.trouver_adaptateur(lambda m, c, corps=None: agents, "CID") == "ag-en"
    with pytest.raises(ValueError, match="adaptateur-anglais"):
        confier.trouver_adaptateur(lambda m, c, corps=None: AGENTS_OBS, "CID")
