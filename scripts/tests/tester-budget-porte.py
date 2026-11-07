#!/usr/bin/env python3
"""Tests du passage de la Porte en usage non tarifé autorisé : API de Paperclip simulée en mémoire.

À lancer : python3 -I scripts/tests/tester-budget-porte.py
Aucune instance réelle : on regarde ce que l'API reçoit, politique par politique.
"""
import contextlib
import importlib.util
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ["ATELIER_DONNEES_LOCALES"] = tempfile.mkdtemp(prefix="atelier-test-budget-")
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

CID = "11111111-1111-4111-8111-111111111111"
AGENTS = {"porte": {"id": "id-porte"}, "contenus": {"id": "id-contenus"}}
ROUTE = f"/companies/{CID}/budgets/policies"


def politique(type_portee, portee, regle="block", metrique="billed_cents", fenetre="calendar_month_utc"):
    return {"policyId": f"p-{portee}", "scopeType": type_portee, "scopeId": portee, "metric": metrique, "windowKind": fenetre, "amount": 500, "unpricedUsagePolicy": regle}


class ApiFausse(bo.Api):
    def __init__(self, politiques, ignore_ecriture=False, refuse_ecriture=False):
        super().__init__("http://faux")
        self.politiques = politiques
        self.ignore_ecriture = ignore_ecriture
        self.refuse_ecriture = refuse_ecriture
        self.journal = []

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        if methode == "GET" and chemin == f"/companies/{CID}/budgets/overview":
            return {"companyId": CID, "policies": self.politiques}
        if methode == "POST" and chemin == ROUTE:
            if self.refuse_ecriture:
                raise bo.ErreurAtelier(f"POST {chemin} -> HTTP 500")
            self.journal.append(corps)
            if not self.ignore_ecriture:
                for p in self.politiques:
                    if (p["scopeType"], p["scopeId"], p["metric"], p["windowKind"]) == (corps["scopeType"], corps["scopeId"], corps["metric"], corps["windowKind"]):
                        p["unpricedUsagePolicy"] = corps["unpricedUsagePolicy"]
            return {}
        raise AssertionError(f"appel non prévu : {methode} {chemin}")


def lancer(api, agents=None):
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie):
        ecritures = bo.assurer_usage_non_tarife_porte(api, CID, AGENTS if agents is None else agents)
    return ecritures, sortie.getvalue()


class BudgetPorte(unittest.TestCase):
    def test_seule_la_porte_change_et_le_plafond_n_est_pas_envoye(self):
        api = ApiFausse([politique("agent", "id-porte"), politique("agent", "id-contenus"), politique("company", CID)])
        ecritures, _ = lancer(api)
        self.assertEqual(ecritures, 1)
        self.assertEqual(api.journal, [{"scopeType": "agent", "scopeId": "id-porte", "metric": "billed_cents", "windowKind": "calendar_month_utc", "unpricedUsagePolicy": "allow"}])
        self.assertEqual(api.politiques[1]["unpricedUsagePolicy"], "block")
        self.assertEqual(api.politiques[2]["unpricedUsagePolicy"], "block")

    def test_la_metrique_et_la_fenetre_sont_reprises_de_la_politique_lue(self):
        api = ApiFausse([politique("agent", "id-porte", metrique="total_tokens", fenetre="lifetime")])
        lancer(api)
        self.assertEqual((api.journal[0]["metric"], api.journal[0]["windowKind"]), ("total_tokens", "lifetime"))

    def test_un_deuxieme_passage_n_ecrit_rien(self):
        api = ApiFausse([politique("agent", "id-porte")])
        lancer(api)
        api.journal.clear()
        ecritures, _ = lancer(api)
        self.assertEqual(ecritures, 0)
        self.assertEqual(api.journal, [])

    def test_une_porte_sans_politique_n_en_recoit_pas_et_le_fait_est_signale(self):
        # Sans plafond, le socle refuserait la création (422) : on ne crée rien, on le dit.
        api = ApiFausse([politique("agent", "id-contenus")])
        ecritures, sortie = lancer(api)
        self.assertEqual(ecritures, 0)
        self.assertEqual(api.journal, [])
        self.assertIn("Porte", sortie)

    def test_une_ecriture_sans_effet_est_une_erreur(self):
        api = ApiFausse([politique("agent", "id-porte")], ignore_ecriture=True)
        with self.assertRaises(bo.ErreurAtelier):
            lancer(api)

    def test_une_organisation_sans_porte_n_ecrit_rien(self):
        api = ApiFausse([politique("agent", "id-contenus")])
        ecritures, _ = lancer(api, agents={"contenus": {"id": "id-contenus"}})
        self.assertEqual(ecritures, 0)
        self.assertEqual(api.journal, [])

    def traverser_appliquer(self, api):
        # Vrai passage dans appliquer_organisation : ses étapes voisines sont simulées, la suite est coupée à l'étape d'après.
        class Arret(Exception):
            pass
        voisines = {"trouver_entreprise": {"id": CID}, "preparer_dossiers_locaux": 0, "secret_jeton": None, "synchroniser_instructions": 0,
                    "etat_a_jour": [], "lier_agents": 0, "agents_par_slug": AGENTS, "assurer_permissions_agents": 0}
        sortie = io.StringIO()
        with mock.patch.multiple(bo, **{nom: mock.Mock(return_value=valeur) for nom, valeur in voisines.items()}), \
                mock.patch.object(bo, "assurer_roles_agents", side_effect=Arret), contextlib.redirect_stdout(sortie):
            with self.assertRaises(Arret):
                bo.appliquer_organisation(api, {"agents": []}, {}, {}, "reel", Path("."))
        return sortie.getvalue()

    def test_appliquer_organisation_passe_la_porte_en_usage_autorise(self):
        api = ApiFausse([politique("agent", "id-porte"), politique("agent", "id-contenus")])
        self.traverser_appliquer(api)
        self.assertEqual([corps["scopeId"] for corps in api.journal], ["id-porte"])
        self.assertEqual(api.politiques[0]["unpricedUsagePolicy"], "allow")

    def test_une_panne_du_budget_n_arrete_pas_le_resserrement(self):
        # Sinon, sur une entreprise neuve, les connexions resteraient ouvertes à tous les agents jusqu'à la relance.
        api = ApiFausse([politique("agent", "id-porte")], refuse_ecriture=True)
        sortie = self.traverser_appliquer(api)
        self.assertIn("avertissement", sortie)
        self.assertIn("Porte", sortie)
        self.assertEqual(api.politiques[0]["unpricedUsagePolicy"], "block")


if __name__ == "__main__":
    unittest.main(verbosity=1)
