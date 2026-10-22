#!/usr/bin/env python3
"""Tests de l'inscription des rôles Mesure et Stratège dans la configuration du plugin (revue F5, 22/10/2026).

Le plugin reconnaît ces rôles par IDENTIFIANT d'agent (réglage `rolesAgents`), jamais par le nom que l'agent peut changer.
À lancer : python3 -I scripts/tests/tester-roles-agents.py
"""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

os.environ["ATELIER_DONNEES_LOCALES"] = tempfile.mkdtemp(prefix="atelier-test-roles-")
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

CID = "11111111-1111-4111-8111-111111111111"


class FauxApi:
    """Configuration de plugin en mémoire."""

    def __init__(self, config=None):
        self.config = dict(config or {})
        self.ecritures = []

    def get(self, chemin):
        assert chemin.startswith(f"/plugins/{bo.PLUGIN_CLE}/config")
        return {"configJson": dict(self.config)}

    def appel(self, methode, chemin, corps=None):
        assert methode == "POST" and chemin == f"/plugins/{bo.PLUGIN_CLE}/config"
        self.config = dict(corps["configJson"])
        self.ecritures.append(corps)
        return {}


class RolesAgents(unittest.TestCase):
    def test_ecrit_les_identifiants_sans_toucher_aux_autres_cles(self):
        api = FauxApi({"passerelleClesPubliques": ["cle"], "rolesAgents": {"mesure": "ancien-id-0001"}})
        agents = {"mesure": {"id": "id-mesure-0001"}, "stratege": {"id": "id-stratege-001"}, "veille": {"id": "id-veille-0001"}}
        self.assertTrue(bo.assurer_roles_agents(api, CID, agents))
        self.assertEqual(api.config["rolesAgents"], {"mesure": "id-mesure-0001", "stratege": "id-stratege-001"})
        self.assertEqual(api.config["passerelleClesPubliques"], ["cle"])

    def test_idempotent(self):
        api = FauxApi()
        agents = {"mesure": {"id": "id-mesure-0001"}}
        self.assertTrue(bo.assurer_roles_agents(api, CID, agents))
        self.assertFalse(bo.assurer_roles_agents(api, CID, agents))
        self.assertEqual(len(api.ecritures), 1)

    def test_organisation_sans_mesure_ni_stratege_non_touchee(self):
        api = FauxApi()
        self.assertFalse(bo.assurer_roles_agents(api, CID, {"veille": {"id": "id-veille-0001"}}))
        self.assertEqual(api.ecritures, [])

    def test_ne_retient_que_les_deux_roles(self):
        self.assertEqual(bo.roles_agents_voulus({"mesure": {"id": "a"}, "sea": {"id": "b"}}), {"mesure": "a"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
