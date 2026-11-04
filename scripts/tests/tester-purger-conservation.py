#!/usr/bin/env python3
"""Tests de scripts/purger-conservation.py (DROIT-1.4) : dossier temporaire seulement, aucune instance réelle."""
import contextlib
import datetime
import http.server
import importlib.util
import io
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.parse

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("purge", os.path.join(ICI, "..", "purger-conservation.py"))
purge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(purge)

JOUR = 86400


def fichier(racine, rel, age_jours, maintenant):
    chemin = os.path.join(racine, rel)
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write('{"texte": "+32 4 000 00 00"}\n')
    os.utime(chemin, (maintenant - age_jours * JOUR, maintenant - age_jours * JOUR))
    return chemin


def iso(maintenant, age_jours):
    return datetime.datetime.fromtimestamp(maintenant - age_jours * JOUR, datetime.timezone.utc).isoformat().replace("+00:00", "Z")


class FauxSocle:
    """Faux serveur HTTP local (jamais l'instance 3100) : entreprises, tâches par statut, documents, DELETE."""

    def __init__(self, maintenant):
        e = "11111111-1111-4111-8111-111111111111"
        self.taches = {  # id : (statut, âge de la tâche en jours, {clé : âge du document en jours})
            "t-vieille": ("done", 1200, {"livrable": 1100, "recent": 30, "verrou": 1150}),
            "t-recente": ("done", 10, {"ancien": 1100}),
            "t-annulee": ("cancelled", 1300, {"brouillon": 1200}),
            "t-ouverte": ("todo", 1300, {"ouvert": 1200}),
            "t-filler1": ("done", 1300, {}),
            "t-filler2": ("done", 1300, {}),
        }
        self.entreprises = [{"id": e, "name": "Société Exemple"}]
        self.maintenant = maintenant
        self.appels = []
        socle = self

        class Gestion(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def repondre(self, code, corps):
                donnees = json.dumps(corps).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(donnees)))
                self.end_headers()
                self.wfile.write(donnees)

            def do_GET(self):
                socle.appels.append(("GET", self.path, self.headers.get("Authorization")))
                u = urllib.parse.urlsplit(self.path)
                q = urllib.parse.parse_qs(u.query)
                morceaux = u.path.strip("/").split("/")
                if u.path == "/api/companies":
                    return self.repondre(200, socle.entreprises)
                if morceaux[:2] == ["api", "companies"] and morceaux[3:] == ["issues"]:
                    liste = [{"id": i, "status": st, "updatedAt": iso(socle.maintenant, age)}
                             for i, (st, age, _) in socle.taches.items() if st == q["status"][0]]
                    debut, n = int(q.get("offset", ["0"])[0]), int(q["limit"][0])
                    return self.repondre(200, liste[debut:debut + n])
                if morceaux[:2] == ["api", "issues"] and morceaux[3:] == ["documents"]:
                    docs = socle.taches[morceaux[2]][2]
                    return self.repondre(200, [{"key": k, "updatedAt": iso(socle.maintenant, age)} for k, age in docs.items()])
                self.repondre(404, {"error": "inconnu"})

            def do_DELETE(self):
                socle.appels.append(("DELETE", self.path, self.headers.get("Authorization")))
                morceaux = self.path.strip("/").split("/")
                docs = socle.taches[morceaux[2]][2]
                if morceaux[4] == "verrou":
                    return self.repondre(409, {"error": "Document is locked"})
                docs.pop(morceaux[4])
                self.repondre(200, {"ok": True})

        self.serveur = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Gestion)
        self.base = f"http://127.0.0.1:{self.serveur.server_address[1]}"
        self.fil = threading.Thread(target=self.serveur.serve_forever, args=(0.05,), daemon=True)
        self.fil.start()

    def arreter(self):
        self.serveur.shutdown()
        self.serveur.server_close()
        self.fil.join()

    def suppressions(self):
        return [chemin for methode, chemin, _ in self.appels if methode == "DELETE"]


class TestPurgerConservation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.inst = self.tmp.name
        self.maintenant = time.time()
        self.vieux = fichier(self.inst, "data/run-logs/soc/agent/vieux.ndjson", 1100, self.maintenant)
        self.recent = fichier(self.inst, "data/run-logs/soc/agent/recent.ndjson", 30, self.maintenant)
        self.op = fichier(self.inst, "data/workspace-operation-logs/soc/op.ndjson", 1200, self.maintenant)
        self.hors = fichier(self.inst, "data/storage/piece.pdf", 2000, self.maintenant)
        self.socle = FauxSocle(self.maintenant)
        self.addCleanup(self.socle.arreter)
        self._env = os.environ.get("PAPERCLIP_BOARD_KEY")
        os.environ["PAPERCLIP_BOARD_KEY"] = "cle-board-de-test-0123456789"  # jamais le fichier ~/.config/atelier

    def tearDown(self):
        self.tmp.cleanup()
        if self._env is None:
            os.environ.pop("PAPERCLIP_BOARD_KEY", None)
        else:
            os.environ["PAPERCLIP_BOARD_KEY"] = self._env

    def lancer(self, *args):
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
            code = purge.main(["--instance", self.inst, "--api", self.socle.base, *args], maintenant=self.maintenant)
        return code, sortie.getvalue()

    def test_a_blanc_par_defaut_rien_n_est_supprime(self):
        code, sortie = self.lancer()
        self.assertEqual(code, 0)
        self.assertIn("2 fichier(s) de plus de 1095 jours", sortie)
        self.assertIn("à blanc", sortie)
        for f in (self.vieux, self.recent, self.op, self.hors):
            self.assertTrue(os.path.exists(f), f)

    def test_confirmer_supprime_seulement_les_journaux_anciens(self):
        del self.socle.taches["t-vieille"][2]["verrou"]  # aucun document verrouillé : la purge est complète
        code, _ = self.lancer("--confirmer")
        self.assertEqual(code, 0)
        self.assertFalse(os.path.exists(self.vieux))
        self.assertFalse(os.path.exists(self.op))
        self.assertTrue(os.path.exists(self.recent))
        self.assertTrue(os.path.exists(self.hors), "les pièces jointes ne sont pas des journaux")
        self.assertFalse(os.path.exists(os.path.dirname(self.op)), "dossier vidé retiré")

    def test_duree_par_defaut_trois_ans_et_refus_d_une_duree_plus_courte_qu_un_an(self):
        self.assertEqual(purge.JOURS_PAR_DEFAUT, 1095)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertNotEqual(self.lancer("--jours", "30")[0], 0)

    def test_instance_sans_dossier_data_refusee(self):
        with contextlib.redirect_stderr(io.StringIO()):
            code = purge.main(["--instance", os.path.join(self.inst, "absente")], maintenant=self.maintenant)
        self.assertNotEqual(code, 0)


    def test_documents_a_blanc_rien_n_est_supprime(self):
        # DROIT-1.4 : documents des tâches terminées ou annulées, document ET tâche vieux de plus de 3 ans.
        code, sortie = self.lancer()
        self.assertEqual(code, 0)
        self.assertEqual(self.socle.suppressions(), [])
        self.assertIn("3 document(s)", sortie)
        lus = [c for m, c, _ in self.socle.appels if m == "GET"]
        self.assertTrue(any("status=done" in c for c in lus) and any("status=cancelled" in c for c in lus))
        self.assertFalse(any("status=todo" in c or "t-ouverte" in c for c in lus), "tâche ouverte jamais examinée")
        self.assertTrue(all("includeSystem=true" in c for c in lus if c.endswith("documents") or "/documents?" in c))

    def test_documents_confirmer_supprime_et_signale_le_verrou_sans_forcer(self):
        code, sortie = self.lancer("--confirmer")
        self.assertEqual(sorted(self.socle.suppressions()), [
            "/api/issues/t-annulee/documents/brouillon",
            "/api/issues/t-vieille/documents/livrable",
            "/api/issues/t-vieille/documents/verrou",
        ])
        self.assertEqual(self.socle.taches["t-vieille"][2].keys(), {"recent", "verrou"})
        self.assertEqual(self.socle.taches["t-recente"][2].keys(), {"ancien"}, "tâche récente : document gardé")
        self.assertEqual(code, 1, "purge incomplète : un document verrouillé")
        self.assertIn("verrouillé", sortie)
        self.assertIn("t-vieille/verrou", sortie)
        self.assertEqual({a for m, _, a in self.socle.appels if m == "DELETE"}, {"Bearer cle-board-de-test-0123456789"})

    def test_toutes_les_pages_de_taches_sont_lues(self):
        ancienne = purge.TAILLE_PAGE
        purge.TAILLE_PAGE = 2
        self.addCleanup(setattr, purge, "TAILLE_PAGE", ancienne)
        self.assertIn("3 document(s)", self.lancer()[1])

    def test_api_injoignable_signalee(self):
        self.socle.arreter()
        code, sortie = self.lancer()
        self.assertEqual(code, 3)
        self.assertIn("injoignable", sortie)


if __name__ == "__main__":
    unittest.main(verbosity=1)
