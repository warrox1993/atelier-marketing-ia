#!/usr/bin/env python3
"""Tests du délai des outils lents posé par `assurer_connexions` : API de Paperclip simulée en mémoire.

À lancer : python3 -I scripts/tests/tester-delais-outils.py
Aucune instance réelle : on regarde ce que l'API reçoit, connexion par connexion.
"""
import contextlib
import copy
import importlib.util
import io
import os
import tempfile
import unittest
from pathlib import Path

os.environ["ATELIER_DONNEES_LOCALES"] = tempfile.mkdtemp(prefix="atelier-test-delais-")
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

CID = "11111111-1111-4111-8111-111111111111"
REG = {
    "connexionsPasserelle": {"services": {"extraction": "atelier-extraction", "audit": "atelier-audit", "gbp": "atelier-gbp"}},
    "agents": [],
}


def connexion(ident, carte, **config):
    return {"id": ident, "name": ident, "status": "active", "config": {"sourceTemplateKey": carte, "url": f"http://127.0.0.1:1/mcp/{ident}", **config}}


class ApiFausse(bo.Api):
    def __init__(self, connexions, refuse_patch=False, apres_liste=None):
        super().__init__("http://faux")
        self.connexions = connexions
        self.refuse_patch = refuse_patch
        self.apres_liste = apres_liste
        self.journal = []

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        if methode == "GET":
            if chemin.endswith("/tools/policies"):
                return {"policies": []}
            if chemin.endswith("/tools/profiles"):
                return {"profiles": []}
            if chemin.endswith("/tools/connections"):
                liste = copy.deepcopy(self.connexions)
                if self.apres_liste:
                    self.apres_liste(self.connexions)
                return {"connections": liste}
            if chemin.endswith("/installs"):
                return {"installs": []}
            if chemin.startswith("/tool-connections/"):
                return copy.deepcopy(next(c for c in self.connexions if c["id"] == chemin.split("/")[2]))
            raise AssertionError(f"lecture non prévue : {chemin}")
        self.journal.append((methode, chemin, corps))
        if methode == "PATCH" and chemin.startswith("/tool-connections/"):
            if self.refuse_patch:
                raise bo.ErreurAtelier("refus simulé")
            cx = next(c for c in self.connexions if c["id"] == chemin.split("/")[2])
            cx["config"] = corps["config"]  # le socle remplace la configuration entière
            return cx
        if methode == "PUT" and chemin.endswith("/installs"):
            return {}
        raise AssertionError(f"écriture non prévue : {methode} {chemin}")

    def patchs(self):
        return [(chemin, corps) for methode, chemin, corps in self.journal if methode == "PATCH"]


class DelaiOutils(unittest.TestCase):
    def test_extraction_et_audit_recoivent_le_delai_sans_perdre_leur_configuration(self):
        api = ApiFausse([connexion("ex", "atelier-extraction", headers={"x": "y"}), connexion("au", "atelier-audit")])
        ecritures, _ = bo.assurer_connexions(api, CID, REG, {})
        self.assertEqual(ecritures, 2)
        corps = dict(api.patchs())
        self.assertEqual(corps["/tool-connections/ex"], {"config": {"sourceTemplateKey": "atelier-extraction", "url": "http://127.0.0.1:1/mcp/ex", "headers": {"x": "y"}, "toolTimeoutMs": 60000}})
        self.assertEqual(corps["/tool-connections/au"]["config"]["toolTimeoutMs"], 60000)

    def test_un_deuxieme_passage_n_ecrit_rien(self):
        api = ApiFausse([connexion("ex", "atelier-extraction")])
        bo.assurer_connexions(api, CID, REG, {})
        api.journal.clear()
        ecritures, _ = bo.assurer_connexions(api, CID, REG, {})
        self.assertEqual(ecritures, 0)
        self.assertEqual(api.patchs(), [])

    def test_un_delai_different_est_remis_a_la_valeur_voulue(self):
        api = ApiFausse([connexion("ex", "atelier-extraction", toolTimeoutMs=10000)])
        bo.assurer_connexions(api, CID, REG, {})
        self.assertEqual(api.patchs()[0][1]["config"]["toolTimeoutMs"], 60000)

    def test_une_autre_connexion_n_est_pas_touchee(self):
        api = ApiFausse([connexion("gb", "atelier-gbp")])
        ecritures, _ = bo.assurer_connexions(api, CID, REG, {})
        self.assertEqual(ecritures, 0)
        self.assertEqual(api.patchs(), [])

    def test_la_configuration_est_relue_juste_avant_d_ecrire(self):
        # Le socle remplace la configuration entière : renvoyer la copie lue avant la boucle effacerait ce qui a changé depuis.
        def jeton_rafraichi(connexions):
            connexions[0]["config"]["oauth"] = {"jeton": "neuf"}
        api = ApiFausse([connexion("ex", "atelier-extraction", oauth={"jeton": "ancien"})], apres_liste=jeton_rafraichi)
        bo.assurer_connexions(api, CID, REG, {})
        self.assertEqual(api.patchs()[0][1]["config"]["oauth"], {"jeton": "neuf"})

    def test_un_refus_sur_le_delai_n_arrete_pas_le_passage(self):
        # Réglage secondaire : sans cela, le Gardien sauterait la fabrique à chaque battement, et `appliquer` le reste de son travail.
        reg = {**REG, "agents": [{"slug": "r", "connexions": {"extraction": "ecriture_sur_accord", "audit": "ecriture_sur_accord"}}]}
        api = ApiFausse([connexion("ex", "atelier-extraction"), connexion("au", "atelier-audit")], refuse_patch=True)
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            ecritures, resume = bo.assurer_connexions(api, CID, reg, {"r": {"id": "agent-r"}})
        self.assertEqual([(m, c) for m, c, _ in api.journal], [
            ("PUT", "/tool-connections/ex/installs"),
            ("PUT", "/tool-connections/au/installs"),
            ("PATCH", "/tool-connections/ex"),
            ("PATCH", "/tool-connections/au"),
        ])
        self.assertEqual(ecritures, 2)  # les deux accès ; un délai refusé ne compte pas
        self.assertEqual(len(resume), 2)
        self.assertIn("extraction", sortie.getvalue())
        self.assertIn("audit", sortie.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=1)
