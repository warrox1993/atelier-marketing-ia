#!/usr/bin/env python3
"""Test hors ligne de `assurer_fabrique` : la fabrique est ouverte par identifiant d'agent, pas par rôle Paperclip.

Usage : python3 -I scripts/test-assurer-fabrique.py
"""
import importlib.util
import copy
import json
import pathlib
import sys
import unittest

RACINE = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bootstrap_organisation", RACINE / "scripts" / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(spec)
sys.modules["bootstrap_organisation"] = bo
spec.loader.exec_module(bo)

DOCUMENTS = {"contenus", "stratege", "prospection", "crm-conversion", "mesure"}
VIDEO = {"reseaux-sociaux"}


class FauxApi:
    """Simule la configuration du plugin et les politiques d'outils d'une entreprise."""

    def __init__(self, config):
        self.config = dict(config)
        self.politiques = []
        self.ecritures_config = 0
        self.suppressions = 0

    def get(self, chemin):
        if chemin.startswith("/plugins/"):
            return {"configJson": dict(self.config)}
        if chemin.endswith("/tools/policies"):
            return {"policies": list(self.politiques)}
        raise AssertionError(chemin)

    def appel(self, methode, chemin, corps=None):
        if chemin == "/plugins/" + bo.PLUGIN_CLE + "/config":
            self.config = dict(corps["configJson"])
            self.ecritures_config += 1
        elif chemin.endswith("/tools/policies"):
            self.politiques.append({**corps, "id": f"pol-{len(self.politiques)}-{len(corps['name'])}"})
        elif methode == "DELETE" and "/tools/policies/" in chemin:
            identifiant = chemin.rsplit("/", 1)[1]
            self.politiques = [p for p in self.politiques if p["id"] != identifiant]
            self.suppressions += 1
        else:
            raise AssertionError(chemin)


class TestAssurerFabrique(unittest.TestCase):
    def setUp(self):
        self.reg = json.loads((RACINE / "organisation" / "registre" / "agents.json").read_text(encoding="utf-8"))
        # Plusieurs agents partagent le même rôle Paperclip, comme dans l'usine réelle.
        roles = {"contenus": "designer", "reseaux-sociaux": "designer", "stratege": "researcher", "prospection": "researcher",
                 "mesure": "researcher", "veille": "researcher", "crm-conversion": "general", "seo-local-geo": "general"}
        self.agents = {a["slug"]: {"id": f"id-{a['slug']}", "role": roles.get(a["slug"], "general")} for a in self.reg["agents"]}

    def test_ecrit_les_identifiants_des_agents_retenus(self):
        api = FauxApi({"fabriqueRolesDocuments": ["designer"], "fabriqueRolesVideo": ["designer"], "autre": 1})
        bo.assurer_fabrique(api, "cid", self.reg, self.agents)
        self.assertEqual(set(api.config["fabriqueAgentsDocuments"]), {f"id-{s}" for s in DOCUMENTS})
        self.assertEqual(api.config["fabriqueAgentsVideo"], [f"id-{s}" for s in VIDEO])
        self.assertNotIn("id-veille", api.config["fabriqueAgentsDocuments"])
        self.assertNotIn("id-seo-local-geo", api.config["fabriqueAgentsDocuments"])
        self.assertNotIn("id-contenus", api.config["fabriqueAgentsVideo"])
        self.assertNotIn("fabriqueRolesDocuments", api.config)
        self.assertNotIn("fabriqueRolesVideo", api.config)
        self.assertEqual(api.config["autre"], 1)

    def test_idempotent(self):
        api = FauxApi({})
        bo.assurer_fabrique(api, "cid", self.reg, self.agents)
        ecritures = api.ecritures_config
        nb_politiques = len(api.politiques)
        self.assertEqual(bo.assurer_fabrique(api, "cid", self.reg, self.agents), 0)
        self.assertEqual(api.ecritures_config, ecritures)
        self.assertEqual(len(api.politiques), nb_politiques)

    def test_agent_retenu_plus_tard_perd_sa_politique_block(self):
        # « veille » n'est pas retenu : politiques block créées. JB le retient ensuite : elles doivent disparaître.
        api = FauxApi({})
        bo.assurer_fabrique(api, "cid", self.reg, self.agents)
        self.assertTrue([p for p in api.politiques if ":veille:" in p["name"]])
        autre = [p["name"] for p in api.politiques if ":veille:" not in p["name"]]
        reg2 = copy.deepcopy(self.reg)
        veille = next(a for a in reg2["agents"] if a["slug"] == "veille")
        veille["outils"]["mutation"].append(bo.OUTILS_CLIENT_FABRIQUE["document"])
        bo.assurer_fabrique(api, "cid", reg2, self.agents)
        self.assertIn("id-veille", api.config["fabriqueAgentsDocuments"])
        restantes = [p["name"] for p in api.politiques if ":veille:" in p["name"]]
        # Documents et état de fabrication ouverts ; la vidéo reste interdite.
        self.assertEqual(restantes, ["atelier-fabrique-interdit:veille:fabriquer_video"])
        self.assertEqual([p["name"] for p in api.politiques if ":veille:" not in p["name"]], autre)
        # Rejeu : plus rien à faire.
        self.assertEqual(bo.assurer_fabrique(api, "cid", reg2, self.agents), 0)

    def test_politique_du_meme_nom_retouchee_a_la_main_conservee(self):
        # Revue du 25/10 : on ne supprime que la forme exacte créée par le script, jamais une politique élargie à la main.
        api = FauxApi({})
        bo.assurer_fabrique(api, "cid", self.reg, self.agents)
        nom = "atelier-fabrique-interdit:veille:fabriquer_document"
        retouchee = next(p for p in api.politiques if p["name"] == nom)
        retouchee["selectors"] = {"toolName": retouchee["selectors"]["toolName"], "serverName": "autre"}
        reg2 = copy.deepcopy(self.reg)
        veille = next(a for a in reg2["agents"] if a["slug"] == "veille")
        veille["outils"]["mutation"].append(bo.OUTILS_CLIENT_FABRIQUE["document"])
        bo.assurer_fabrique(api, "cid", reg2, self.agents)
        self.assertIn(nom, [p["name"] for p in api.politiques])
        self.assertNotIn("atelier-fabrique-interdit:veille:etat_fabrication", [p["name"] for p in api.politiques])


if __name__ == "__main__":
    unittest.main(verbosity=2)
