#!/usr/bin/env python3
"""Tests de scripts/releve-couts.py : aucun réseau, réponses API enregistrées dans tests/donnees/."""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("releve", os.path.join(ICI, "..", "releve-couts.py"))
releve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(releve)

A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"


def donnee(nom):
    with open(os.path.join(ICI, "donnees", nom), encoding="utf-8") as f:
        return json.load(f)


def faux_api(base, chemin, parametres=None):
    if chemin == "/api/companies":
        return donnee("releve-companies.json")
    for cle, lettre in ((A, "a"), (B, "b")):
        if chemin.startswith(f"/api/companies/{cle}/costs/"):
            assert parametres["from"] == "2026-02-01T00:00:00.000Z"
            assert parametres["to"] == "2026-02-28T23:59:59.999Z"
            return donnee(f"releve-{lettre}-{chemin.rsplit('/', 1)[1]}.json")
    raise AssertionError(f"appel inattendu : {chemin}")


ATTENDU_A = """mois,entreprise,agent,modele,facturation,jetons_entree,jetons_entree_cache,jetons_sortie,cout_centimes_socle,runs
2026-02,Société Exemple A,Agent Alpha,claude-opus-5-5,abonnement,1000,5000,200,0,4
2026-02,Société Exemple A,Agent Alpha,claude-sonnet-5-5,abonnement,300,700,50,0,
2026-02,Société Exemple A,Agent Beta,claude-opus-5-5,abonnement,2000,10000,400,0,7
2026-02,Société Exemple A,TOTAL,,abonnement,3300,15700,650,0,11
"""


class TestReleve(unittest.TestCase):
    def setUp(self):
        self._ancien = releve.appeler_api
        releve.appeler_api = faux_api

    def tearDown(self):
        releve.appeler_api = self._ancien

    def test_csv_exact_une_entreprise_abonnement(self):
        self.assertEqual(releve.produire_csv("x", A, "2026-02"), ATTENDU_A)

    def test_total_et_facturation_mixte(self):
        lignes = releve.lignes_entreprise("x", {"id": B, "name": "Société Exemple B"}, "2026-02")
        total = lignes[-1]
        self.assertEqual(total["agent"], "TOTAL")
        self.assertEqual(total["cout_centimes_socle"], 125)
        self.assertEqual(total["jetons_entree"], 16)
        self.assertEqual(total["jetons_sortie"], 28)
        self.assertEqual(total["runs"], 5)
        self.assertEqual(total["facturation"], "mixte")

    def test_cout_nul_signale(self):
        lignes = releve.lignes_entreprise("x", {"id": B, "name": "Société Exemple B"}, "2026-02")
        par_modele = {(l["agent"], l["modele"]): l["facturation"] for l in lignes}
        self.assertEqual(par_modele[("Agent Gamma", "claude-opus-5-5")], "api")
        self.assertEqual(par_modele[("Agent Gamma", "claude-haiku-4-5")], "api_cout_nul")
        self.assertEqual(par_modele[("(agent supprimé)", "claude-opus-5-5")], "abonnement")

    def test_toutes_les_entreprises(self):
        lignes = list(releve.csv.DictReader(io.StringIO(releve.produire_csv("x", None, "2026-02"))))
        self.assertEqual([l["entreprise"] for l in lignes if l["agent"] == "TOTAL"],
                         ["Société Exemple A", "Société Exemple B"])

    def test_entreprise_inconnue(self):
        with self.assertRaises(releve.ErreurReleve) as ctx:
            releve.produire_csv("x", "99999999-9999-4999-8999-999999999999", "2026-02")
        self.assertEqual(ctx.exception.code, 4)

    def test_mois_invalide(self):
        for mauvais in ("2026-13", "octobre", "2026"):
            with self.assertRaises(releve.ErreurReleve) as ctx:
                releve.fenetre_du_mois(mauvais)
            self.assertEqual(ctx.exception.code, 2)

    def test_main_codes_de_sortie_et_fichier(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(releve.main(["--entreprise", "inconnue", "--mois", "2026-02"]), 4)
        self.assertIn("Entreprise inconnue", err.getvalue())
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stderr(io.StringIO()):
            sortie = os.path.join(d, "r.csv")
            self.assertEqual(releve.main(["--entreprise", A, "--mois", "2026-02", "--sortie", sortie]), 0)
            with open(sortie, encoding="utf-8") as f:
                self.assertEqual(f.read(), ATTENDU_A)

    def test_api_muette(self):
        releve.appeler_api = self._ancien
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = releve.main(["--api", "http://127.0.0.1:1", "--mois", "2026-02"])
        self.assertEqual(code, 3)
        self.assertIn("injoignable", err.getvalue())


if __name__ == "__main__":
    unittest.main()
