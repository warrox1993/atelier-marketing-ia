#!/usr/bin/env python3
"""Tests de la clé d'API des crédits inclus (liaison, rangement, commande « cle-api ») : API de Paperclip simulée en mémoire.

À lancer : python3 -I scripts/tests/tester-cle-api.py
Aucune instance réelle ; uniquement des clés factices ; les dossiers locaux vont dans un dossier temporaire.
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

DONNEES = tempfile.mkdtemp(prefix="atelier-test-cle-api-")
os.environ["ATELIER_DONNEES_LOCALES"] = DONNEES
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

CID = "11111111-1111-4111-8111-111111111111"
CID2 = "22222222-2222-4222-8222-222222222222"
BCE = "0123456789"
CLE_FACTICE = "sk-ant-factice-0000"
REG = {
    "adaptateur": {"type": "claude_local", "envPortable": {}},
    "agents": [{"slug": "redacteur", "nom": "Redacteur"}, {"slug": "porte", "nom": "Porte", "deterministe": True}],
}
REG_ORGA = {"entreprise": {"nom": "Organisation", "marqueur": "marqueur-orga"}}


def agent(ident, nom, adaptateur="claude_local", statut="paused", config=None, metadata=None):
    return {"id": ident, "name": nom, "status": statut, "adapterType": adaptateur,
            "adapterConfig": config if config is not None else {}, "metadata": metadata or {}}


class ApiFausse(bo.Api):
    def __init__(self):
        super().__init__("http://faux")
        self.agents = {CID: [], CID2: []}
        self.secrets = {CID: [], CID2: []}
        self.journal = []

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        if methode == "GET":
            if chemin == "/companies":
                return [{"id": CID, "name": "Organisation", "description": "marqueur-orga"}]
            if chemin.startswith("/companies/") and chemin.endswith("/agents"):
                return [{"id": a["id"], "name": a["name"], "status": a["status"]} for a in self.agents[chemin.split("/")[2]]]
            if chemin.startswith("/companies/") and chemin.endswith("/secrets"):
                return self.secrets[chemin.split("/")[2]]
            if chemin.startswith("/agents/"):
                return next(a for l in self.agents.values() for a in l if a["id"] == chemin.split("/")[2])
            raise AssertionError(f"lecture non prévue : {chemin}")
        self.ecritures += 1
        self.journal.append((methode, chemin, corps))
        if methode == "PATCH" and chemin.startswith("/agents/"):
            a = next(a for l in self.agents.values() for a in l if a["id"] == chemin.split("/")[2])
            if "adapterConfig" in corps:
                a["adapterConfig"] = {**a["adapterConfig"], **corps["adapterConfig"]}
            if "metadata" in corps:
                a["metadata"] = corps["metadata"]
            return a
        if methode == "POST" and chemin.endswith("/rotate"):
            return {}
        if methode == "POST" and chemin.endswith("/secrets"):
            cid = chemin.split("/")[2]
            sec = {"id": f"secret-{cid[:4]}-{corps['key']}", "key": corps["key"]}
            self.secrets[cid].append(sec)
            return sec
        if methode == "DELETE" and chemin.startswith("/secrets/"):
            for liste in self.secrets.values():
                liste[:] = [x for x in liste if x["id"] != chemin.split("/")[2]]
            return None
        raise AssertionError(f"écriture non prévue : {methode} {chemin}")

    def get(self, chemin):
        return self.appel("GET", chemin)


def secret_ref(ident):
    return {"type": "secret_ref", "secretId": ident, "version": "latest"}


class LiaisonAvecCle(unittest.TestCase):
    def test_env_voulu_avec_cle_ajoute_secret_ref_et_mode_plain(self):
        env = bo.env_voulu(CID, REG, "redacteur", "jeton-id", "cle-id")
        self.assertEqual(env[bo.VARIABLE_CLE_API], secret_ref("cle-id"))
        self.assertEqual(env[bo.VARIABLE_MODE_CLE], {"type": "plain", "value": bo.VALEUR_MODE_CLE})
        self.assertEqual(env[bo.VARIABLE_JETON], secret_ref("jeton-id"))

    def test_env_voulu_sans_cle_identique_a_avant(self):
        avant = bo.env_voulu(CID, REG, "redacteur", "jeton-id")
        sans = bo.env_voulu(CID, REG, "redacteur", "jeton-id", None)
        self.assertEqual(avant, sans)
        self.assertNotIn(bo.VARIABLE_CLE_API, sans)
        self.assertNotIn(bo.VARIABLE_MODE_CLE, sans)

    def test_agent_deterministe_jamais_de_cle(self):
        liaison = bo.liaison_voulue(CID, REG, "porte", "jeton-id", "reel", cle_id="s")
        self.assertEqual(liaison["adapterType"], "process")
        self.assertNotIn("env", liaison["config"])

    def agent_lie(self, liaison):
        env = {c: ({**v, "projectionClass": "x"} if v["type"] == "secret_ref" else {"type": "plain", "value": "***REDACTED***"})
               for c, v in liaison["config"]["env"].items()}
        return agent("a1", "Redacteur", config={"cwd": liaison["cwd"], "env": env},
                     metadata={"atelier": {"bootstrap": {"liaison": bo.empreinte_liaison(liaison)}}})

    def test_liaison_avec_cle_conforme_apres_appliquer(self):
        voulue = bo.liaison_voulue(CID, REG, "redacteur", "jeton-id", "reel", "cle-id")
        lie = self.agent_lie(voulue)
        self.assertTrue(bo.liaison_conforme(lie, voulue))
        # Un appelant qui oublie cle_id voudrait une liaison sans clé : l'agent lié avec la clé n'est plus conforme
        oubli = bo.liaison_voulue(CID, REG, "redacteur", "jeton-id", "reel")
        self.assertFalse(bo.liaison_conforme(lie, oubli))

    def test_appelants_lisent_le_secret_de_cle(self):
        api = ApiFausse()
        api.secrets[CID] = [{"id": "s-jeton", "key": bo.CLE_SECRET_JETON}, {"id": "s-cle", "key": bo.CLE_SECRET_CLE_API}]
        api.agents[CID] = [agent("a1", "Redacteur"), agent("a2", "Porte", adaptateur="process")]
        sauve = {n: getattr(bo, n) for n in ("Api", "url_api", "registres", "lire_jeton")}
        bo.Api, bo.url_api = (lambda base: api), (lambda: "http://faux")
        bo.registres, bo.lire_jeton = (lambda: (REG, REG_ORGA)), (lambda: "jeton-factice")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                bo.cmd_jeton(argparse.Namespace(confirmer=True))
        finally:
            for n, v in sauve.items():
                setattr(bo, n, v)
        env = api.agents[CID][0]["adapterConfig"]["env"]
        self.assertEqual(env[bo.VARIABLE_CLE_API], secret_ref("s-cle"))
        self.assertEqual(env[bo.VARIABLE_JETON], secret_ref("s-jeton"))
        self.assertNotIn("env", api.agents[CID][1]["adapterConfig"])


class RangerEtLier(unittest.TestCase):
    def setUp(self):
        self.api = ApiFausse()
        self.api.agents[CID] = [
            agent("p", "Programme", adaptateur="process", config={"command": "x"}),
            agent("t", "Termine", statut="terminated", config={"model": "m", "env": {}}),
            agent("a1", "Un", config={"model": "m1", "cwd": "/e/a1", "env": {
                "AUTRE": {"type": "plain", "value": "***REDACTED***"}, bo.VARIABLE_JETON: secret_ref("jeton")}}),
            agent("a2", "Deux", statut="idle", config={"model": "m2"}),
        ]

    def patchs(self):
        return [j[1] for j in self.api.journal if j[0] == "PATCH"]

    def test_lie_seulement_les_claude_local_non_resilies(self):
        self.assertEqual(bo.lier_cle_api_agents_locaux(self.api, CID, "s-cle"), 2)
        self.assertEqual(sorted(self.patchs()), ["/agents/a1", "/agents/a2"])
        self.assertEqual(self.api.agents[CID][0]["adapterConfig"], {"command": "x"})
        self.assertEqual(self.api.agents[CID][1]["adapterConfig"], {"model": "m", "env": {}})
        self.assertEqual([a["status"] for a in self.api.agents[CID]], ["paused", "terminated", "paused", "idle"])

    def test_variables_posees_secret_ref_et_plain_credits_inclus(self):
        bo.lier_cle_api_agents_locaux(self.api, CID, "s-cle")
        a1 = self.api.agents[CID][2]["adapterConfig"]
        self.assertEqual(a1["env"][bo.VARIABLE_CLE_API], secret_ref("s-cle"))
        self.assertEqual(a1["env"][bo.VARIABLE_MODE_CLE], {"type": "plain", "value": "credits_inclus"})
        self.assertEqual(a1["model"], "m1")
        self.assertEqual(a1["cwd"], "/e/a1")
        self.assertIn("AUTRE", a1["env"])
        self.assertEqual(a1["env"][bo.VARIABLE_JETON], secret_ref("jeton"))

    def test_deuxieme_passage_sans_ecriture(self):
        bo.lier_cle_api_agents_locaux(self.api, CID, "s-cle")
        # Le serveur enrichit la référence et masque la valeur « plain » : seuls type, secretId, version comptent
        for a in self.api.agents[CID][2:]:
            a["adapterConfig"]["env"][bo.VARIABLE_CLE_API]["projectionClass"] = "unclassified"
            a["adapterConfig"]["env"][bo.VARIABLE_MODE_CLE]["value"] = "***REDACTED***"
        self.api.journal.clear()
        self.assertEqual(bo.lier_cle_api_agents_locaux(self.api, CID, "s-cle"), 0)
        self.assertEqual(self.api.journal, [])

    def test_retrait_enleve_les_deux_variables_et_garde_le_jeton_et_l_etat(self):
        bo.lier_cle_api_agents_locaux(self.api, CID, "s-cle")
        self.assertEqual(bo.lier_cle_api_agents_locaux(self.api, CID, None), 2)
        for a in self.api.agents[CID][2:]:
            self.assertNotIn(bo.VARIABLE_CLE_API, a["adapterConfig"].get("env", {}))
            self.assertNotIn(bo.VARIABLE_MODE_CLE, a["adapterConfig"].get("env", {}))
        a1 = self.api.agents[CID][2]
        self.assertEqual(a1["adapterConfig"]["env"][bo.VARIABLE_JETON], secret_ref("jeton"))
        self.assertEqual([a["status"] for a in self.api.agents[CID]], ["paused", "terminated", "paused", "idle"])
        self.api.journal.clear()
        self.assertEqual(bo.lier_cle_api_agents_locaux(self.api, CID, None), 0)  # déjà retirée
        self.assertEqual(self.api.journal, [])

    def test_ranger_cree_puis_renouvelle_sous_la_cle_anthropic_cle_api_credits(self):
        ident, renouvele = bo.ranger_secret_jeton(self.api, CID, CLE_FACTICE, cle=bo.CLE_SECRET_CLE_API, nom="Clé de test", description="d")
        self.assertFalse(renouvele)
        self.assertEqual(self.api.secrets[CID], [{"id": ident, "key": "anthropic-cle-api-credits"}])
        creation = next(j for j in self.api.journal if j[1].endswith("/secrets"))
        self.assertEqual(creation[2]["key"], "anthropic-cle-api-credits")
        self.assertEqual(creation[2]["name"], "Clé de test")
        ident2, renouvele = bo.ranger_secret_jeton(self.api, CID, CLE_FACTICE, cle=bo.CLE_SECRET_CLE_API)
        self.assertTrue(renouvele)
        self.assertEqual(ident2, ident)
        self.assertEqual(self.api.journal[-1][1], f"/secrets/{ident}/rotate")
        # Sans option : comportement d'avant (secret du jeton)
        bo.ranger_secret_jeton(self.api, CID, "jeton-factice")
        self.assertEqual(self.api.secrets[CID][-1]["key"], bo.CLE_SECRET_JETON)


class CommandeCleApi(unittest.TestCase):
    def setUp(self):
        self.api = ApiFausse()
        self.sauve = {n: getattr(bo, n) for n in ("Api", "url_api", "lire_jeton", "registres")}
        bo.Api, bo.url_api = (lambda base: self.api), (lambda: "http://faux")
        bo.registres = lambda: (REG, REG_ORGA)
        bo.ecrire_registre_client("client-cle", BCE, {
            "marketing": {"entrepriseId": CID, "nom": "Client Cle · Marketing", "marqueur": "atelier-client:client-cle:marketing"},
            "direction": {"entrepriseId": CID2, "nom": "Client Cle · Direction", "marqueur": "atelier-client:client-cle:direction"}})
        self.api.agents[CID] = [agent("a1", "Un", config={"model": "m1"}), agent("p", "Programme", adaptateur="process", config={"command": "x"})]
        self.api.agents[CID2] = [agent("b1", "Deux", config={"model": "m2"})]

    def tearDown(self):
        for n, v in self.sauve.items():
            setattr(bo, n, v)

    def lancer(self, **options):
        args = argparse.Namespace(**{"confirmer": True, "client": None, "service": None, "retirer": False,
                                     "supprimer_secret": False, **options})
        sortie, erreur = io.StringIO(), io.StringIO()
        entree, sauve_in = io.StringIO(CLE_FACTICE + "\n"), sys.stdin
        sys.stdin = entree
        try:
            with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(erreur):
                code = bo.cmd_cle_api(args)
        finally:
            sys.stdin = sauve_in
        return code, sortie.getvalue() + erreur.getvalue()

    def refuse(self, **options):
        bo.lire_jeton = lambda *a: self.fail("la clé ne doit pas être lue")
        with self.assertRaises(bo.ErreurAtelier):
            self.lancer(**options)
        self.assertEqual(self.api.ecritures, 0)

    def test_refus_sans_confirmer(self):
        self.refuse(confirmer=False, client="client-cle")

    def test_refus_service_sans_client(self):
        self.refuse(service="marketing")

    def test_refus_supprimer_secret_sans_retirer(self):
        self.refuse(client="client-cle", supprimer_secret=True)

    def test_client_toutes_les_entreprises_et_valeur_jamais_affichee(self):
        code, sortie = self.lancer(client="client-cle")
        self.assertEqual(code, 0)
        self.assertNotIn(CLE_FACTICE, sortie)
        self.assertIn("[marketing] secret créé, lié à 1 agent(s).", sortie)
        self.assertIn("[direction] secret créé, lié à 1 agent(s).", sortie)
        vues = [j for j in self.api.journal if CLE_FACTICE in repr(j)]
        self.assertEqual(len(vues), 2)
        self.assertTrue(all(j[0] == "POST" and j[1].endswith("/secrets") for j in vues))
        for cid, ident in ((CID, "a1"), (CID2, "b1")):
            a = next(x for x in self.api.agents[cid] if x["id"] == ident)
            self.assertEqual(a["adapterConfig"]["env"][bo.VARIABLE_CLE_API]["secretId"], f"secret-{cid[:4]}-{bo.CLE_SECRET_CLE_API}")
        self.assertEqual(self.api.agents[CID][1]["adapterConfig"], {"command": "x"})  # process : intact

    def test_organisation_modele_sans_client(self):
        code, sortie = self.lancer()
        self.assertEqual(code, 0)
        self.assertIn("secret créé, lié à 1 agent(s).", sortie)
        self.assertEqual(self.api.secrets[CID2], [])

    def test_service_seul(self):
        code, sortie = self.lancer(client="client-cle", service="direction")
        self.assertEqual(code, 0)
        self.assertIn("[direction]", sortie)
        self.assertNotIn("[marketing]", sortie)
        self.assertEqual(self.api.secrets[CID], [])
        self.assertNotIn("env", self.api.agents[CID][0]["adapterConfig"])

    def test_retirer_puis_supprimer_secret(self):
        self.lancer(client="client-cle")
        self.api.journal.clear()
        bo.lire_jeton = lambda *a: self.fail("le retrait ne lit pas la clé")
        code, sortie = self.lancer(client="client-cle", retirer=True, supprimer_secret=True)
        self.assertEqual(code, 0)
        self.assertIn("retirée de 1 agent(s)", sortie)
        suppressions = sorted(j[1] for j in self.api.journal if j[0] == "DELETE")
        self.assertEqual(suppressions, sorted(f"/secrets/secret-{c[:4]}-{bo.CLE_SECRET_CLE_API}" for c in (CID, CID2)))
        self.assertEqual(self.api.secrets[CID] + self.api.secrets[CID2], [])
        self.assertNotIn(bo.VARIABLE_CLE_API, self.api.agents[CID][0]["adapterConfig"]["env"])

    def test_retirer_sans_supprimer_garde_le_secret(self):
        self.lancer(client="client-cle")
        self.lancer(client="client-cle", retirer=True)
        self.assertFalse([j for j in self.api.journal if j[0] == "DELETE"])
        self.assertEqual(len(self.api.secrets[CID]), 1)

    def test_retirer_ne_lit_pas_la_cle(self):
        bo.lire_jeton = lambda *a: self.fail("le retrait ne lit pas la clé")
        code, _ = self.lancer(client="client-cle", retirer=True)
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
