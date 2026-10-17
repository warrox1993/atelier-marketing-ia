#!/usr/bin/env python3
"""Tests de scripts/phoenix-exporter.py : faux psql (ATELIER_PSQL) et faux récepteur OTLP local, aucun vrai service.

À lancer avec l'interpréteur du venv Phoenix (il fournit opentelemetry-proto) :
    ~/.local/share/atelier-phoenix/venv/bin/python -I scripts/tests/tester-phoenix-exporter.py
"""
import contextlib
import importlib.util
import io
import json
import os
import shlex
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("exporteur", os.path.join(ICI, "..", "phoenix-exporter.py"))
exp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exp)

from opentelemetry.proto.collector.trace.v1 import trace_service_pb2  # noqa: E402

E = "11111111-1111-4111-8111-111111111111"
T1 = "22222222-2222-4222-8222-222222222222"
T2 = "33333333-3333-4333-8333-333333333333"
AG = "44444444-4444-4444-8444-444444444444"
SCHEMA = "plugin_atelier_abc123"

# Faux psql : vérifie la lecture seule, journalise le SQL reçu, rend les lignes du fichier FAUX_PSQL_DONNEES
# (seq > N du SQL, LIMIT respecté) ou la liste des schémas.
FAUX_PSQL = r'''
import json, os, re, sys
sql = sys.stdin.read()
with open(os.environ["FAUX_PSQL_SQL"], "a", encoding="utf-8") as f:
    f.write(sql + "\n-----\n")
if not sql.startswith("BEGIN READ ONLY"):
    print("pas en lecture seule", file=sys.stderr); sys.exit(3)
d = json.load(open(os.environ["FAUX_PSQL_DONNEES"], encoding="utf-8"))
if "pg_namespace" in sql:
    print(json.dumps({"schemas": d.get("schemas", [])})); sys.exit(0)
apres = int(re.search(r"j\.seq > (\d+)", sql).group(1))
lot = int(re.search(r"LIMIT (\d+)", sql).group(1))
lignes = [l for l in d["lignes"] if l["seq"] > apres][:lot]
print(json.dumps({"max_seq": max([l["seq"] for l in d["lignes"]] or [0])}))
for l in lignes: print(json.dumps(l))
'''


class Recepteur:
    """Faux Phoenix : accepte POST /v1/traces, garde les corps reçus ; code de réponse réglable."""

    def __init__(self):
        self.corps, self.code = [], 200
        parent = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                corps = self.rfile.read(n)
                if self.path == "/v1/traces" and self.headers.get("Content-Type") == "application/x-protobuf":
                    if parent.code == 200:
                        parent.corps.append(corps)
                    self.send_response(parent.code)
                else:
                    self.send_response(404)
                self.end_headers()

            def log_message(self, *a):
                pass

        self.serveur = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.serveur.server_address[1]}"
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()

    def spans(self):
        sortie = []
        for c in self.corps:
            req = trace_service_pb2.ExportTraceServiceRequest()
            req.ParseFromString(c)
            for rs in req.resource_spans:
                res = {kv.key: kv.value.string_value for kv in rs.resource.attributes}
                for ss in rs.scope_spans:
                    for s in ss.spans:
                        sortie.append((res, s))
        return sortie

    def fermer(self):
        self.serveur.shutdown()
        self.serveur.server_close()


def attrs(span):
    a = {}
    for kv in span.attributes:
        v = kv.value
        champ = v.WhichOneof("value")
        a[kv.key] = [x.string_value for x in v.array_value.values] if champ == "array_value" else getattr(v, champ)
    return a


def ligne(seq, type_, tache=T1, donnees=None, acteur_agent=None, acteur_empreinte="ab" * 32, corrections=0, **autres):
    l = {"seq": seq, "company_id": E, "type": type_, "entite": "tache" if tache else "entreprise", "issue_id": tache,
         "run_id": None, "cree_le_us": 1_790_000_000_000_000 + seq, "acteur_agent_id": acteur_agent,
         "acteur_empreinte": None if acteur_agent else acteur_empreinte, "service": "marketing",
         "agent_id": AG if tache else None, "agent_role": "qa" if tache else None,
         "competences": ["relecture-independante"] if tache else None, "donnees": donnees or {},
         "corrections": corrections}
    l.update(autres)
    return l


class Base(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        d = self.dossier.name
        self.faux = os.path.join(d, "faux-psql.py")
        with open(self.faux, "w", encoding="utf-8") as f:
            f.write(FAUX_PSQL)
        self.donnees = os.path.join(d, "donnees.json")
        self.sql = os.path.join(d, "sql.txt")
        self.etat = os.path.join(d, "etat", "exporteur.json")
        self.env = {"ATELIER_PSQL": f"{shlex.quote(sys.executable)} -I {shlex.quote(self.faux)}",
                    "FAUX_PSQL_DONNEES": self.donnees, "FAUX_PSQL_SQL": self.sql}
        self.ancien = {k: os.environ.get(k) for k in self.env}
        os.environ.update(self.env)
        self.recepteur = Recepteur()

    def tearDown(self):
        self.recepteur.fermer()
        for k, v in self.ancien.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self.dossier.cleanup()

    def ecrire(self, lignes, schemas=(SCHEMA,)):
        with open(self.donnees, "w", encoding="utf-8") as f:
            json.dump({"lignes": lignes, "schemas": list(schemas)}, f)

    def lancer(self, *extra, phoenix=None):
        sortie, erreur = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(erreur):
            code = exp.main(["--pg-port", "54329", "--phoenix", phoenix or self.recepteur.url, "--etat", self.etat, *extra])
        return code, sortie.getvalue(), erreur.getvalue()


class TestsExport(Base):
    def test_regroupe_par_tache_avec_attributs(self):
        self.ecrire([
            ligne(1, "services.declares", tache=None),
            ligne(2, "revue.echouee", donnees={"role": "metier", "verdict": "CHANGES_REQUESTED"}, acteur_agent=AG, corrections=1),
            ligne(3, "porte.refusee", donnees={"decision": "REFUS", "motifs": ["revue_manquante"], "cyclesEpuises": False}, corrections=2),
            ligne(4, "decision.demander_correction", donnees={"mode": "demonstration"}, corrections=3),
            ligne(5, "porte.franchie", tache=T2, donnees={"decision": "PASS", "motifs": []}),
        ])
        code, sortie, _ = self.lancer()
        self.assertEqual(code, 0, sortie)
        spans = [s for _, s in self.recepteur.spans()]
        self.assertEqual(len(spans), 7)  # 5 évènements + 2 racines de tâche
        res = self.recepteur.spans()[0][0]
        self.assertEqual(res["openinference.project.name"], "atelier")
        par_nom = {}
        for s in spans:
            par_nom.setdefault(s.name, []).append(s)
        racines = par_nom["tache"]
        self.assertEqual(len(racines), 2)
        r1 = next(r for r in racines if attrs(r)["atelier.tache_id"] == T1)
        enfants_t1 = [s for s in spans if s.trace_id == r1.trace_id and s.name != "tache"]
        self.assertEqual({s.name for s in enfants_t1}, {"revue.echouee", "porte.refusee", "decision.demander_correction"})
        self.assertTrue(all(s.parent_span_id == r1.span_id for s in enfants_t1))
        hors_tache = par_nom["services.declares"][0]
        self.assertEqual(hors_tache.parent_span_id, b"")
        self.assertNotIn(hors_tache.trace_id, {r.trace_id for r in racines})
        rev = attrs(par_nom["revue.echouee"][0])
        self.assertEqual((rev["atelier.verdict"], rev["atelier.verdict.source"], rev["atelier.revue.role"]),
                         ("CHANGES_REQUESTED", "relecteur", "metier"))
        self.assertEqual((rev["atelier.entreprise_id"], rev["atelier.service"], rev["atelier.agent_id"]), (E, "marketing", AG))
        self.assertEqual(rev["atelier.competences"], ["relecture-independante"])
        self.assertEqual((rev["atelier.acteur.type"], rev["atelier.acteur.id"]), ("agent", AG))
        self.assertEqual(rev["atelier.corrections"], 1)
        self.assertEqual(rev["openinference.span.kind"], "EVALUATOR")
        porte = attrs(par_nom["porte.refusee"][0])
        self.assertEqual((porte["atelier.verdict"], porte["atelier.verdict.source"]), ("REFUS", "porte"))
        self.assertEqual(porte["atelier.porte.motifs"], ["revue_manquante"])
        dec = attrs(par_nom["decision.demander_correction"][0])
        self.assertEqual((dec["atelier.decision_humaine"], dec["atelier.corrections"]), ("demander_correction", 3))
        self.assertEqual(dec["atelier.acteur.type"], "autre")
        self.assertEqual(dec["atelier.acteur.empreinte"], "ab" * 8)
        with open(self.etat, encoding="utf-8") as f:
            etat = json.load(f)
        self.assertEqual(etat["dernier_seq"], 5)
        self.assertEqual(len(etat["racines"]), 2)

    def test_idempotent(self):
        lignes = [ligne(1, "revue.reussie", donnees={"verdict": "PASS", "role": "technique"})]
        self.ecrire(lignes)
        self.assertEqual(self.lancer()[0], 0)
        self.assertEqual(len(self.recepteur.spans()), 2)
        self.assertEqual(self.lancer()[0], 0)
        self.assertEqual(len(self.recepteur.corps), 1, "deuxième passage : rien ne doit être renvoyé")
        self.ecrire(lignes + [ligne(2, "decision.approuver")])
        self.assertEqual(self.lancer()[0], 0)
        nouveaux = self.recepteur.spans()[2:]
        self.assertEqual([s.name for _, s in nouveaux], ["decision.approuver"], "ni l'ancienne entrée ni la racine ne sont renvoyées")
        premier_parent = [s for _, s in self.recepteur.spans() if s.name == "tache"][0].span_id
        self.assertEqual(nouveaux[0][1].parent_span_id, premier_parent)

    def test_a_blanc_n_envoie_ni_ne_memorise(self):
        self.ecrire([ligne(1, "porte.franchie", donnees={"decision": "PASS"})])
        code, sortie, _ = self.lancer("--a-blanc")
        self.assertEqual(code, 0)
        self.assertEqual(self.recepteur.corps, [])
        self.assertFalse(os.path.exists(self.etat))
        self.assertIn("porte.franchie", sortie)
        self.assertIn("à blanc", sortie)

    def test_lots_successifs(self):
        self.ecrire([ligne(i, "livrable.revise", tache=None) for i in range(1, 6)])
        code, _, _ = self.lancer("--lot", "2")
        self.assertEqual(code, 0)
        self.assertEqual(len(self.recepteur.corps), 3)
        self.assertEqual(sorted(attrs(s)["atelier.seq"] for _, s in self.recepteur.spans()), [1, 2, 3, 4, 5])

    def test_echec_phoenix_etat_inchange(self):
        self.ecrire([ligne(1, "porte.franchie", donnees={"decision": "PASS"})])
        self.recepteur.code = 500
        code, _, erreur = self.lancer()
        self.assertEqual(code, 1)
        self.assertIn("HTTP 500", erreur)
        self.assertFalse(os.path.exists(self.etat))
        self.recepteur.code = 200
        self.assertEqual(self.lancer()[0], 0)
        self.assertEqual(len(self.recepteur.spans()), 2)

    def test_url_hors_boucle_locale_refusee(self):
        self.ecrire([ligne(1, "porte.franchie")])
        code, _, erreur = self.lancer(phoenix="http://192.168.1.10:6006")
        self.assertEqual(code, 1)
        self.assertIn("boucle locale", erreur)
        self.assertFalse(os.path.exists(self.sql), "aucune lecture avant le refus")

    def test_journal_plus_court_que_l_etat(self):
        self.ecrire([ligne(1, "porte.franchie"), ligne(2, "porte.franchie")])
        self.assertEqual(self.lancer()[0], 0)
        self.ecrire([ligne(1, "porte.franchie")])
        code, _, erreur = self.lancer()
        self.assertEqual(code, 2)
        self.assertIn("plus court", erreur)

    def test_schema_ambigu(self):
        self.ecrire([], schemas=(SCHEMA, "plugin_atelier_def456"))
        code, _, erreur = self.lancer()
        self.assertEqual(code, 1)
        self.assertIn("--schema", erreur)

    def test_lecture_seule_et_pas_de_texte_libre_dans_le_sql(self):
        self.ecrire([ligne(1, "porte.franchie")])
        self.assertEqual(self.lancer()[0], 0)
        with open(self.sql, encoding="utf-8") as f:
            requetes = [r for r in f.read().split("\n-----\n") if r.strip()]
        self.assertEqual(len(requetes), 2)  # découverte du schéma + lecture du journal
        for r in requetes:
            self.assertTrue(r.startswith("BEGIN READ ONLY"))
            haut = r.upper()
            for mot in ("INSERT ", "UPDATE ", "DELETE ", "TRUNCATE ", "ALTER ", "DROP ", "CREATE "):
                self.assertNotIn(mot, haut)
        journal = requetes[1]
        for colonne in ("commentaire", "title", "description", "name", "email", "consigne", "justification"):
            self.assertNotIn(colonne, journal.lower(), f"la requête ne doit pas lire « {colonne} »")
        self.assertNotIn("'acteur', j.acteur", journal)


class TestDonneesPersonnelles(Base):
    def test_aucune_donnee_personnelle_dans_les_spans(self):
        # Même si la base renvoyait du texte personnel (base modifiée, colonne détournée), rien ne doit sortir.
        personnelles = ["Jean Dupont", "jean.dupont@example.be", "Rue de la Station 12, 4000 Liège",
                        "+32 470 12 34 56", "Merci de corriger l'adresse de Mme Martin", "BE68539007547034"]
        self.ecrire([
            ligne(1, "decision.demander_correction", acteur_empreinte=None, acteur_agent="jean.dupont@example.be",
                  donnees={"mode": "Jean Dupont", "commentaire": personnelles[4], "verdict": personnelles[1],
                           "motifs": ["revue_manquante", personnelles[2]], "role": personnelles[3],
                           "nom": personnelles[0], "iban": personnelles[5], "leviers": [personnelles[0]]},
                  service="Jean Dupont", agent_role="jean.dupont@example.be", competences=[personnelles[2], "redaction"],
                  agent_id="Jean Dupont", run_id=personnelles[1], entite=personnelles[0]),
            ligne(2, "revue.echouee", donnees={"verdict": "CHANGES_REQUESTED", "role": personnelles[1],
                                               "justification": personnelles[4]}),
            ligne(3, personnelles[1], tache=None, company_id=personnelles[0]),
        ])
        code, sortie, erreur = self.lancer()
        self.assertEqual(code, 0, sortie + erreur)
        self.assertEqual(len(self.recepteur.spans()), 4)
        brut = b"".join(self.recepteur.corps)
        for p in personnelles + ["Dupont", "example.be", "Liège".encode("utf-8").decode("utf-8"), "Martin"]:
            self.assertNotIn(p.encode("utf-8"), brut, f"donnée personnelle envoyée : {p}")
        self.assertNotIn(b"@", brut)
        for _, s in self.recepteur.spans():
            for k, v in attrs(s).items():
                for x in v if isinstance(v, list) else [v]:
                    if isinstance(x, str):
                        self.assertNotIn(" ", x, f"{k} contient du texte libre : {x!r}")
        # Les codes légitimes restent présents.
        d = attrs(next(s for _, s in self.recepteur.spans() if s.name == "decision.demander_correction"))
        self.assertEqual(d["atelier.porte.motifs"] if "atelier.porte.motifs" in d else None, None)
        self.assertEqual(d["atelier.competences"], ["redaction"])
        self.assertNotIn("atelier.acteur.id", d)
        self.assertNotIn("atelier.agent_id", d)


if __name__ == "__main__":
    unittest.main(verbosity=2)
