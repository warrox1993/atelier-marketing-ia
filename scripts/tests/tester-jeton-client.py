#!/usr/bin/env python3
"""Tests de « bootstrap-organisation.py jeton --client » et « test-reel --client » : API de Paperclip simulée en mémoire.

À lancer : python3 -I scripts/tests/tester-jeton-client.py
Aucune instance réelle ; les registres locaux vont dans un dossier temporaire (ATELIER_DONNEES_LOCALES).
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

DONNEES = tempfile.mkdtemp(prefix="atelier-test-jeton-client-")
os.environ["ATELIER_DONNEES_LOCALES"] = DONNEES
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

ID_A = "11111111-1111-4111-8111-111111111111"
ID_B = "22222222-2222-4222-8222-222222222222"
JETON = "sk-ant-oat01-VALEUR-SECRETE-DE-TEST-0123456789"
BCE = "0123456789"


def agent(ident, nom, adaptateur="claude_local", statut="paused", config=None):
    return {"id": ident, "name": nom, "status": statut, "adapterType": adaptateur,
            "adapterConfig": config if config is not None else {}}


class ApiFausse(bo.Api):
    def __init__(self):
        super().__init__("http://faux")
        self.agents = {ID_A: [], ID_B: []}
        self.secrets = {ID_A: [], ID_B: []}
        self.journal = []

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        if methode == "GET":
            if chemin.startswith("/companies/") and chemin.endswith("/agents"):
                return [{"id": a["id"], "name": a["name"], "status": a["status"]} for a in self.agents[chemin.split("/")[2]]]
            if chemin.startswith("/companies/") and chemin.endswith("/secrets"):
                return self.secrets[chemin.split("/")[2]]
            if chemin.startswith("/agents/"):
                return next(a for l in self.agents.values() for a in l if a["id"] == chemin.split("/")[2])
            raise AssertionError(f"lecture non prévue : {chemin}")
        self.ecritures += 1
        self.journal.append((methode, chemin, corps))
        if methode == "POST" and chemin.endswith("/secrets"):
            cid = chemin.split("/")[2]
            s = {"id": f"secret-{cid[:4]}", "key": corps["key"]}
            self.secrets[cid].append(s)
            return s
        if methode == "POST" and chemin.endswith("/rotate"):
            return {}
        if methode == "PATCH" and chemin.startswith("/agents/"):
            a = next(a for l in self.agents.values() for a in l if a["id"] == chemin.split("/")[2])
            a["adapterConfig"] = {**a["adapterConfig"], **corps["adapterConfig"]}
            return a
        raise AssertionError(f"écriture non prévue : {methode} {chemin}")

    def get(self, chemin):
        return self.appel("GET", chemin)


class JetonClient(unittest.TestCase):
    def setUp(self):
        self.api = ApiFausse()
        self.sauve = {n: getattr(bo, n) for n in ("Api", "url_api", "lire_jeton")}
        bo.Api = lambda base: self.api
        bo.url_api = lambda: "http://faux"
        bo.lire_jeton = self.sauve["lire_jeton"]
        bo.ecrire_registre_client("client-trois", BCE, {
            "marketing": {"entrepriseId": ID_A, "nom": "Client Trois · Marketing", "marqueur": "atelier-client:client-trois:marketing"},
            "direction": {"entrepriseId": ID_B, "nom": "Client Trois · Direction", "marqueur": "atelier-client:client-trois:direction"}})
        self.api.agents[ID_A] = [
            agent("a1", "Coordinateur général", config={"model": "claude-sonnet-5-5", "engine": "x", "cwd": "/e/a1",
                                                       "env": {"AUTRE": {"type": "plain", "value": "***REDACTED***"}}}),
            agent("a2", "Rédacteur", statut="idle", config={"model": "m2", "env": {}}),
            agent("a3", "Programme", adaptateur="process", config={"command": "x"}),
        ]
        self.api.agents[ID_B] = [agent("b1", "Coordinateur général", config={"model": "m3"})]

    def tearDown(self):
        for n, v in self.sauve.items():
            setattr(bo, n, v)

    def lancer(self, commande, **options):
        args = argparse.Namespace(**{"confirmer": True, "client": "client-trois", **options})
        sortie, erreur = io.StringIO(), io.StringIO()
        entree = io.StringIO(JETON + "\n")
        sauve_in = sys.stdin
        sys.stdin = entree
        try:
            with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(erreur):
                code = commande(args)
        finally:
            sys.stdin = sauve_in
        return code, sortie.getvalue() + erreur.getvalue()

    def test_secret_cree_puis_renouvele_et_lie_aux_seuls_claude_local(self):
        code, sortie = self.lancer(bo.cmd_jeton)
        self.assertEqual(code, 0)
        self.assertIn("Secret rangé dans 2 entreprise(s), lié à 3 agent(s).", sortie)
        self.assertNotIn(JETON, sortie)
        creations = [j for j in self.api.journal if j[1].endswith("/secrets")]
        self.assertEqual(len(creations), 2)
        self.assertTrue(all(j[2]["key"] == bo.CLE_SECRET_JETON for j in creations))
        a1, a2, a3 = self.api.agents[ID_A]
        ref = {"type": "secret_ref", "secretId": f"secret-{ID_A[:4]}", "version": "latest"}
        self.assertEqual(a1["adapterConfig"]["env"][bo.VARIABLE_JETON], ref)
        self.assertEqual(a2["adapterConfig"]["env"][bo.VARIABLE_JETON], ref)
        self.assertNotIn("env", a3["adapterConfig"])  # process : intact
        self.assertEqual(a3["adapterConfig"], {"command": "x"})
        # Autres champs conservés, y compris l'autre variable d'environnement
        self.assertEqual(a1["adapterConfig"]["model"], "claude-sonnet-5-5")
        self.assertEqual(a1["adapterConfig"]["engine"], "x")
        self.assertEqual(a1["adapterConfig"]["cwd"], "/e/a1")
        self.assertIn("AUTRE", a1["adapterConfig"]["env"])
        # États inchangés, aucune pause ni reprise
        self.assertEqual([a["status"] for a in self.api.agents[ID_A]], ["paused", "idle", "paused"])
        self.assertFalse([j for j in self.api.journal if "pause" in j[1] or "resume" in j[1]])
        # Deuxième passage : le secret existe, il est renouvelé ; liaisons déjà faites, rien à modifier
        self.api.journal.clear()
        code, sortie = self.lancer(bo.cmd_jeton)
        self.assertEqual(code, 0)
        self.assertIn("Secret rangé dans 2 entreprise(s), lié à 0 agent(s).", sortie)
        self.assertIn("renouvelé", sortie)
        self.assertNotIn(JETON, sortie)
        self.assertEqual([j[1] for j in self.api.journal if j[0] == "POST"], [f"/secrets/secret-{ID_B[:4]}/rotate", f"/secrets/secret-{ID_A[:4]}/rotate"])  # ordre des services : direction, marketing
        self.assertFalse([j for j in self.api.journal if j[0] == "PATCH"])

    def test_la_valeur_du_jeton_ne_va_que_dans_le_secret(self):
        self.lancer(bo.cmd_jeton)
        vues = [j for j in self.api.journal if JETON in repr(j)]
        self.assertTrue(vues and all(j[1].endswith("/secrets") for j in vues))

    def test_client_inconnu_erreur_claire_sans_ecriture(self):
        with self.assertRaises(bo.ErreurAtelier) as c:
            bo.cmd_jeton(argparse.Namespace(confirmer=True, client="inconnu"))
        self.assertIn("aucun registre local pour le client inconnu", str(c.exception))
        self.assertEqual(self.api.ecritures, 0)

    def test_sans_confirmer_refuse(self):
        with self.assertRaises(bo.ErreurAtelier):
            bo.cmd_jeton(argparse.Namespace(confirmer=False, client="client-trois"))
        self.assertEqual(self.api.ecritures, 0)

    def test_test_reel_client_a_blanc_et_ambiguite(self):
        code, sortie = self.lancer(bo.cmd_test_reel, confirmer=False, agent="coordinateur-general", service="direction")
        self.assertEqual(code, 0)
        self.assertIn("À blanc", sortie)
        self.assertIn("Jeton rangé dans le coffre : NON", sortie)
        self.assertEqual(self.api.ecritures, 0)
        with self.assertRaises(bo.ErreurAtelier) as c:
            bo.cmd_test_reel(argparse.Namespace(confirmer=False, client="client-trois", agent="Coordinateur général", service=None))
        self.assertIn("plusieurs services", str(c.exception))
        with self.assertRaises(bo.ErreurAtelier):
            bo.cmd_test_reel(argparse.Namespace(confirmer=False, client="client-trois", agent=None, service=None))
        with self.assertRaises(bo.ErreurAtelier):
            bo.cmd_test_reel(argparse.Namespace(confirmer=False, client="inconnu", agent="x", service=None))


if __name__ == "__main__":
    unittest.main(verbosity=2)
