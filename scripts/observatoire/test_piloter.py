#!/usr/bin/env python3
"""Tests de piloter.py sur une API Paperclip simulée en mémoire. À lancer : python3 -I test_piloter.py"""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import tempfile
import unittest

ICI = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("piloter", os.path.join(ICI, "piloter.py"))
pi = importlib.util.module_from_spec(_s)
_s.loader.exec_module(pi)

CID = "c-obs"
NOMS = ["Porte", "Analyste technique", "Rédacteur en chef", "Relecteur indépendant", "Directeur", "Adaptateur anglais"]
REF = {"CLAUDE_CODE_OAUTH_TOKEN": {"type": "secret_ref", "secretId": "s1", "version": "latest"}}


class Monde:
    """API en mémoire. `evolution(monde)` est appelée à chaque attente simulée."""
    def __init__(self, jeton=True, bloque=None):
        self.agents = {}
        for i, n in enumerate(NOMS):
            claude = n != "Porte"
            cfg = {"model": "claude-sonnet-5-5", "env": REF if (jeton or not claude) else {}}
            self.agents[f"a{i}"] = {"id": f"a{i}", "name": n, "status": "paused", "adapterType": "claude_local" if claude else "process",
                                    "adapterConfig": cfg if claude else {}}
        self.bloque = bloque  # nom d'agent qui reste en « verifying »
        self.runs, self.issues, self.approbations, self.incidents = [], [], [], []
        self.ecritures, self.horloge, self.evolution, self.coupes = [], 0.0, None, []

    def appel(self, methode, chemin, corps=None):
        if methode == "GET":
            if chemin == "/companies":
                return [{"id": CID, "name": "OBS · Observatoire · Client test"}]
            if chemin == f"/companies/{CID}/agents":
                return [dict(a) for a in self.agents.values()]
            if chemin.startswith("/agents/"):
                return dict(self.agents[chemin.split("/")[2]])
            if chemin.startswith(f"/companies/{CID}/heartbeat-runs"):
                return list(self.runs)
            if chemin.startswith(f"/companies/{CID}/issues"):
                return list(self.issues)
            if chemin.startswith(f"/companies/{CID}/approvals"):
                return list(self.approbations)
            if chemin == f"/companies/{CID}/budgets/overview":
                return {"activeIncidents": list(self.incidents)}
            raise AssertionError(f"lecture non prévue : {chemin}")
        self.ecritures.append((methode, chemin))
        ident = chemin.split("/")[2]
        a = self.agents[ident]
        if chemin.endswith("/resume"):
            a["status"] = "verifying" if a["name"] == self.bloque else "idle"
        elif chemin.endswith("/pause"):
            if any(r["agentId"] == ident and r["status"] in pi.EN_COURS for r in self.runs):
                self.coupes.append(a["name"])  # un run coupé laisse sa comptabilité en attente et bloque l'entreprise
            a["status"] = "paused"
        else:
            raise AssertionError(f"écriture non prévue : {methode} {chemin}")
        return a

    def dormir(self, s):
        self.horloge += s
        if self.evolution:
            self.evolution(self)

    def run(self, agent, statut="succeeded"):
        self.runs.append({"id": f"r{len(self.runs)}", "agentId": agent, "status": statut, "createdAt": f"{len(self.runs):04d}",
                          "startedAt": "t0", "finishedAt": "t1", "usageJson": {"inputTokens": 10, "outputTokens": 5}})

    def confier(self):
        self.issues.append({"id": "i1", "title": "Article : Pilote", "status": "todo"})
        return 0


def lancer(monde, tmp, **kw):
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie):
        res = pi.piloter(monde.appel, CID, monde.confier, "client-test", dormir=monde.dormir, horloge=lambda: monde.horloge,
                         dossier=tmp, **kw)
    return res, sortie.getvalue()


class Piloter(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="test-piloter-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def toutes_en_pause(self, m):
        self.assertEqual({a["status"] for a in m.agents.values()}, {"paused"})

    def test_refus_3100_sans_production(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code = pi.main(["--api", "http://127.0.0.1:3100/api", "--client", "client-test", "--sujet", "01"])
        self.assertEqual(code, 1)
        self.assertIn("3100", err.getvalue())

    def test_api_obligatoire(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            pi.main(["--sujet", "01"])

    def test_client_obligatoire(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            pi.main(["--api", "http://127.0.0.1:3122/api", "--sujet", "01"])

    def test_arret_si_jeton_absent(self):
        m = Monde(jeton=False)
        with self.assertRaises(pi.ArretPilote) as c:
            lancer(m, self.tmp)
        self.assertIn("bootstrap-organisation.py jeton --client client-test --service observatoire --confirmer", str(c.exception))
        self.assertEqual(m.ecritures, [])

    def test_arret_si_run_en_cours(self):
        m = Monde()
        m.run("a0", "running")
        with self.assertRaises(pi.ArretPilote):
            lancer(m, self.tmp)
        self.assertEqual(m.ecritures, [])

    def test_agent_bloque_remet_tout_en_pause(self):
        m = Monde(bloque="Relecteur indépendant")
        with self.assertRaises(pi.ArretPilote):
            lancer(m, self.tmp)
        self.toutes_en_pause(m)
        self.assertEqual(m.issues, [])  # la tâche n'a pas été créée
        self.assertGreaterEqual(m.horloge, 60)

    def test_activation_dans_l_ordre(self):
        m = Monde()
        m.evolution = lambda mm: mm.issues[0].update(status="done")
        lancer(m, self.tmp)
        reprises = [m.agents[c.split("/")[2]]["name"] for (_, c) in m.ecritures if c.endswith("/resume")]
        self.assertEqual(reprises, ["Porte", "Analyste technique", "Rédacteur en chef", "Relecteur indépendant", "Adaptateur anglais", "Directeur"])

    def veille(self, evolution, attendu):
        m = Monde()
        m.evolution = evolution
        (condition, _), sortie = lancer(m, self.tmp)
        self.assertIn(attendu, condition)
        self.toutes_en_pause(m)
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "journal.jsonl")))
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "pilote-avant.json")))
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "pilote-apres.json")))
        return m, sortie

    def test_stop_15_runs(self):
        def ev(m):
            for _ in range(5):
                m.run("a1")
        m, sortie = self.veille(ev, "15 runs")
        self.assertIn("Analyste technique", sortie)

    def test_stop_deux_echecs_de_suite(self):
        etat = {"n": 0}
        def ev(m):
            etat["n"] += 1
            m.run("a2", "failed")
        self.veille(ev, "2 échecs")

    def test_un_echec_puis_succes_ne_stoppe_pas(self):
        etat = {"n": 0}
        def ev(m):
            etat["n"] += 1
            if etat["n"] == 1:
                m.run("a2", "failed")
            elif etat["n"] == 2:
                m.run("a2", "succeeded")
            elif etat["n"] == 3:
                m.run("a2", "failed")
            else:
                m.issues[0]["status"] = "done"
        self.veille(ev, "done")

    def test_stop_statuts_de_la_tache(self):
        for statut in ("in_review", "done", "blocked"):
            with self.subTest(statut=statut):
                self.veille(lambda m, s=statut: m.issues[0].update(status=s), statut)

    def test_stop_approbation(self):
        self.veille(lambda m: m.approbations.append({"id": "ap1", "status": "pending"}), "approbation")

    def test_stop_incident_budget(self):
        self.veille(lambda m: m.incidents.append({"id": "inc1"}), "budget")

    def test_stop_60_minutes(self):
        self.veille(lambda m: None, "60 min")

    def test_reprise_veille_la_tache_existante_sans_en_creer(self):
        m = Monde()
        m.issues.append({"id": "i0", "title": "Article : Ancien", "status": "in_progress"})
        demarre = []
        m.evolution = lambda mm: mm.issues[0].update(status="in_review")
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            condition, _ = pi.piloter(m.appel, CID, lambda: demarre.append(1) or 0, "client-test", dormir=m.dormir,
                                      horloge=lambda: m.horloge, dossier=self.tmp, tache="i0")
        self.assertIn("in_review", condition)
        self.assertEqual(demarre, [1])
        self.assertEqual(len(m.issues), 1)
        self.toutes_en_pause(m)

    def test_article_bloque_par_sous_tache_active_continue(self):
        etat = {"n": 0}
        def ev(m):
            etat["n"] += 1
            if etat["n"] == 1:
                m.issues[0]["status"] = "blocked"
                m.issues.append({"id": "i2", "parentId": "i1", "title": "Étape 2", "status": "in_progress"})
            elif etat["n"] == 3:
                m.issues[1]["status"] = "done"
                m.issues[0]["status"] = "in_review"
        self.veille(ev, "in_review")
        self.assertEqual(etat["n"], 3)

    def test_famille_bloquee_sans_sous_tache_active_arrete(self):
        def ev(m):
            m.issues[0]["status"] = "blocked"
            if len(m.issues) == 1:
                m.issues.append({"id": "i2", "parentId": "i1", "title": "Étape 2", "status": "blocked"})
        self.veille(ev, "blocked")

    def test_attend_la_fin_des_runs_avant_la_pause(self):
        etat = {"n": 0}
        def ev(m):
            etat["n"] += 1
            if etat["n"] == 1:
                m.run("a4", "running")
                m.issues[0]["status"] = "in_review"
            elif etat["n"] == 6:
                m.runs[0]["status"] = "succeeded"
        m, _ = self.veille(ev, "in_review")
        self.assertEqual(m.coupes, [])
        self.assertGreaterEqual(etat["n"], 6)

    def test_run_interminable_pause_quand_meme_apres_le_delai(self):
        def ev(m):
            if not m.runs:
                m.run("a4", "running")
                m.issues[0]["status"] = "in_review"
        m, sortie = self.veille(ev, "in_review")
        self.assertEqual(m.coupes, ["Directeur"])
        self.assertIn("comptabilité", sortie)

    def test_journaux_par_defaut_hors_du_depot_suivi(self):
        # AFC-A17 : par défaut, photos et journal vont sous /instance/ (ignoré par git), jamais dans scripts/.
        import inspect
        defaut = inspect.signature(pi.piloter).parameters["dossier"].default
        self.assertEqual(defaut, pi.DOSSIER_PILOTE)
        self.assertNotIn(os.sep + "scripts" + os.sep, defaut + os.sep)
        self.assertTrue(defaut.endswith(os.path.join("instance", "observatoire", "pilote")))

    def test_resume_final(self):
        def ev(m):
            m.run("a3")
            m.issues[0]["status"] = "in_review"
        _, sortie = self.veille(ev, "in_review")
        self.assertIn("Relecteur indépendant", sortie)
        self.assertIn("claude-sonnet-5-5", sortie)


if __name__ == "__main__":
    unittest.main(verbosity=2)
