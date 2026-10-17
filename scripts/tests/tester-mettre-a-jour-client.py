#!/usr/bin/env python3
"""Tests de « bootstrap-organisation.py mettre-a-jour-client » : API de Paperclip simulée en mémoire, aucune instance réelle.

À lancer : python3 -I scripts/tests/tester-mettre-a-jour-client.py
Les données locales (registre du client, verrou) vont dans un dossier temporaire (ATELIER_DONNEES_LOCALES).
"""
import argparse
import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

DONNEES = tempfile.mkdtemp(prefix="atelier-test-maj-client-")
os.environ["ATELIER_DONNEES_LOCALES"] = DONNEES
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

ID_MKT = "11111111-1111-4111-8111-111111111111"
ID_DIR = "22222222-2222-4222-8222-222222222222"
ID_NOUVEAU = "33333333-3333-4333-8333-333333333333"
BCE = "0123456789"


class ApiFausse(bo.Api):
    """État en mémoire : entreprises, agents par entreprise, objectifs. Journalise les appels qui écrivent."""

    def __init__(self):
        super().__init__("http://faux")
        self.entreprises = [
            {"id": ID_MKT, "name": "Client Test · Marketing", "description": "Entreprise cliente. atelier-client:client-test:marketing"},
            {"id": ID_DIR, "name": "Client Test · Direction", "description": "Service. atelier-client:client-test:direction"},
        ]
        self.agents = {ID_MKT: [], ID_DIR: []}
        self.objectifs = {ID_MKT: [{"title": "OBJ-1 · Titre propre au client", "description": "Description du client",
                                    "level": "company", "status": "active"}]}
        self.journal = []

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        if methode != "GET":
            self.ecritures += 1
            self.journal.append((methode, chemin, corps))
            for aid_liste in self.agents.values():
                for a in aid_liste:
                    if chemin == f"/agents/{a['id']}/pause":
                        a["status"] = "paused"
                    if chemin == f"/agents/{a['id']}/resume":
                        a["status"] = "idle"
            return {}
        if chemin == "/companies":
            return self.entreprises
        if chemin.endswith("/agents") and chemin.startswith("/companies/"):
            return self.agents.get(chemin.split("/")[2], [])
        if chemin.endswith("/goals"):
            return self.objectifs.get(chemin.split("/")[2], [])
        if chemin.endswith("/secrets"):
            return []
        raise AssertionError(f"lecture non prévue : {chemin}")

    def get(self, chemin):
        return self.appel("GET", chemin)


def agent(nom, statut="paused", ident=None):
    return {"id": ident or f"a-{nom}", "name": nom, "status": statut}


class MiseAJourClient(unittest.TestCase):
    def setUp(self):
        self.api = ApiFausse()
        self.appliques = []
        self.sauve = {n: getattr(bo, n) for n in ("Api", "url_api", "etat_a_jour", "etat_service_a_jour", "cmd_generer",
                                                  "configurer_plugin_client", "appliquer_organisation", "appliquer_service",
                                                  "registre_services")}
        bo.Api = lambda base: self.api
        bo.url_api = lambda: "http://faux"
        bo.etat_a_jour = lambda *a, **k: ["empreinte différente : coordinateur", "agent absent : reseaux-sociaux"]
        bo.etat_service_a_jour = lambda *a, **k: []
        bo.cmd_generer = lambda args: 0
        bo.configurer_plugin_client = lambda api, slug: self.appliques.append(("plugin", slug))
        bo.appliquer_organisation = self.faux_appliquer(ID_MKT)
        bo.appliquer_service = self.faux_appliquer(ID_DIR)
        reel = self.sauve["registre_services"]()
        sous_ensemble = [s for s in reel["services"] if s["slug"] in ("marketing", "direction", "administratif")]
        bo.registre_services = lambda: {**reel, "services": sous_ensemble}
        bo.ecrire_registre_client("client-test", BCE, {
            "marketing": {"entrepriseId": ID_MKT, "nom": "Client Test · Marketing", "marqueur": "atelier-client:client-test:marketing"},
            "direction": {"entrepriseId": ID_DIR, "nom": "Client Test · Direction", "marqueur": "atelier-client:client-test:direction"}})

    def tearDown(self):
        for n, v in self.sauve.items():
            setattr(bo, n, v)

    def faux_appliquer(self, cid_defaut):
        def appliquer(api, reg_agents, reg_s, fichiers, mode, dossier_etat):
            nom = reg_s["entreprise"]["nom"]
            self.appliques.append((nom, [a["slug"] for a in reg_agents["agents"]], reg_s, mode))
            if nom.endswith("Marketing"):
                return ID_MKT
            if nom.endswith("Direction"):
                return ID_DIR
            self.api.entreprises.append({"id": ID_NOUVEAU, "name": nom, "description": reg_s["entreprise"]["marqueur"]})
            self.api.agents[ID_NOUVEAU] = [agent("nouvel-agent")]
            return ID_NOUVEAU
        return appliquer

    def lancer(self, **options):
        args = argparse.Namespace(client="client-test", a_blanc=False, pause_hors_registre=False, sans_nouveaux_services=True)
        for k, v in options.items():
            setattr(args, k, v)
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            code = bo.cmd_mettre_a_jour_client(args)
        return code, sortie.getvalue()

    def test_fiche_minimale_depuis_le_registre(self):
        fiche = bo.fiche_depuis_registre_client("client-test", bo.lire_registre_client("client-test"))
        self.assertEqual(fiche["nomCommercial"], "Client Test")
        self.assertEqual(fiche["numeroBce"], BCE)

    def test_a_blanc_ne_rien_ecrire_et_compte(self):
        self.api.agents[ID_MKT] = [agent("coordinateur")]
        self.api.agents[ID_DIR] = [agent("ancien-agent", "idle")]
        code, sortie = self.lancer(a_blanc=True)
        self.assertEqual(code, 0)
        self.assertEqual(self.api.ecritures, 0)
        self.assertEqual(self.appliques, [])
        self.assertIn("À blanc : rien n'est écrit", sortie)
        self.assertIn("1 agent(s) hors registre", sortie)
        self.assertIn("reseaux-sociaux", sortie)  # agent marketing du registre manquant, annoncé
        self.assertIn("(ancien-agent)", sortie)
        self.assertIn("1 encore actif(s)", sortie)

    def test_ecriture_applique_chaque_service_avec_l_identite_du_registre(self):
        code, sortie = self.lancer()
        self.assertEqual(code, 0)
        noms = [x[0] for x in self.appliques if x[0] != "plugin"]
        self.assertEqual(noms, ["Client Test · Marketing", "Client Test · Direction"])
        marketing = self.appliques[0]
        self.assertIn("reseaux-sociaux", marketing[1])
        self.assertIn("conformite-publicitaire", marketing[1])
        self.assertEqual(self.appliques[-1], ("plugin", "client-test"))
        self.assertEqual(self.api.journal, [])  # aucune écriture directe : tout passe par appliquer_*, budgets existants intacts

    def test_objectifs_et_description_existants_repris_de_l_instance(self):
        self.lancer()
        reg_s = self.appliques[0][2]
        obj1 = next(o for o in reg_s["objectifs"] if o["cle"] == "OBJ-1")
        self.assertEqual(obj1["titre"], "Titre propre au client")
        self.assertEqual(obj1["description"], "Description du client")
        self.assertEqual(reg_s["entreprise"]["description"], "Entreprise cliente. atelier-client:client-test:marketing")

    def test_hors_registre_laisse_actif_sans_option(self):
        self.api.agents[ID_DIR] = [agent("sinistres", "idle")]
        code, sortie = self.lancer()
        self.assertEqual(code, 0)
        self.assertFalse([j for j in self.api.journal if j[1].endswith("/pause")])
        self.assertIn("encore actif (décision humaine", sortie)

    def test_pause_hors_registre_met_en_pause_sans_supprimer(self):
        self.api.agents[ID_DIR] = [agent("sinistres", "idle"), agent("deja-en-pause", "paused"),
                                   agent(bo.GARDIEN_SLUG, "idle", "gardien")]
        self.api.agents[ID_MKT] = [agent(bo.GARDIEN_SLUG, "idle", "gardien-m")]
        code, _ = self.lancer(pause_hors_registre=True)
        self.assertEqual(code, 0)
        self.assertEqual([j[:2] for j in self.api.journal], [("POST", "/agents/a-sinistres/pause")])
        self.assertFalse([j for j in self.api.journal if j[0] == "DELETE"])

    def test_agent_actif_rallume_apres_import(self):
        self.api.agents[ID_DIR] = [agent("coordinateur-general", "idle")]
        pauses = {"fait": False}
        base = bo.appliquer_service

        def appliquer_qui_pause(api, reg_agents, reg_s, fichiers, mode, dossier_etat):
            for a in api.agents[ID_DIR]:
                a["status"] = "paused"  # l'import natif remet en pause ce qu'il met à jour
            pauses["fait"] = True
            return base(api, reg_agents, reg_s, fichiers, mode, dossier_etat)
        bo.appliquer_service = appliquer_qui_pause
        self.lancer()
        self.assertTrue(pauses["fait"])
        self.assertIn(("POST", "/agents/a-coordinateur-general/resume", None), self.api.journal)

    def test_service_absent_ajoute_avec_budget_et_registre(self):
        code, sortie = self.lancer(sans_nouveaux_services=False)
        self.assertEqual(code, 0)
        self.assertIn("service à AJOUTER", sortie)
        registre = bo.lire_registre_client("client-test")
        self.assertEqual(registre["entreprises"]["administratif"]["entrepriseId"], ID_NOUVEAU)
        self.assertEqual(registre["entreprises"]["administratif"]["marqueur"], "atelier-client:client-test:administratif")
        self.assertEqual(registre["entreprises"]["administratif"]["nom"], "Client Test · Administratif")
        budgets = [j for j in self.api.journal if j[1] == f"/companies/{ID_NOUVEAU}/budgets"]
        self.assertEqual(len(budgets), 1)
        self.assertTrue(budgets[0][2]["budgetMonthlyCents"] > 0)
        self.assertFalse([j for j in self.api.journal if j[1] in (f"/companies/{ID_MKT}/budgets", f"/companies/{ID_DIR}/budgets")])

    def test_idempotent_deuxieme_passage_sans_ecriture_directe(self):
        self.lancer(sans_nouveaux_services=False)
        self.api.journal.clear()
        self.appliques.clear()
        self.lancer(sans_nouveaux_services=False)
        self.assertEqual(self.api.journal, [])  # le service ajouté existe maintenant : plus de budget ni de création

    def test_refus_client_inconnu(self):
        with self.assertRaises(bo.ErreurAtelier):
            self.lancer(client="inconnu")

    def test_refus_si_le_registre_designe_une_autre_entreprise(self):
        self.api.entreprises[1]["id"] = "44444444-4444-4444-8444-444444444444"
        with self.assertRaises(bo.ErreurAtelier):
            self.lancer()
        self.assertEqual(self.appliques, [])
        self.assertEqual(self.api.journal, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
