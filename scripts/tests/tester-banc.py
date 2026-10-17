#!/usr/bin/env python3
"""Tests du banc d'essais (scripts/banc) : faux Phoenix, faux Ollama et faux `claude`, aucun vrai service.

    python3 -I scripts/tests/tester-banc.py
"""
import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, "..", ".."))
BANC = os.path.join(RACINE, "scripts", "banc")
sys.path.insert(0, BANC)
import banc_commun as bc  # noqa: E402
import executer as ex  # noqa: E402


def charger(nom, fichier):
    spec = importlib.util.spec_from_file_location(nom, os.path.join(BANC, fichier))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


charger_cas = charger("charger_cas", "charger-cas.py")
proposer = charger("proposer_dspy", "proposer-dspy.py")


# ------------------------------------------------------------------------------------------------ faux services

class Serveur:
    def __init__(self, gestion):
        parent = self

        class H(BaseHTTPRequestHandler):
            def _rep(self, code, obj):
                b = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)

            def do_GET(self):
                self._rep(*gestion(parent, "GET", self.path, None))

            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                self._rep(*gestion(parent, "POST", self.path, json.loads(self.rfile.read(n) or b"null")))

            def log_message(self, *a):
                pass

        self.appels = []
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def fermer(self):
        self.srv.shutdown()
        self.srv.server_close()


def faux_phoenix():
    etat = {"jeux": {}, "experiences": {}, "runs": {}, "evals": [], "envois": []}

    def gestion(s, methode, chemin, corps):
        s.appels.append((methode, chemin))
        u = urllib.parse.urlsplit(chemin)
        q = urllib.parse.parse_qs(u.query)
        p = u.path.strip("/").split("/")
        if methode == "GET" and u.path == "/v1/datasets":
            nom = q.get("name", [None])[0]
            data = [{"id": j["id"], "name": n, "example_count": len(j["ex"])} for n, j in etat["jeux"].items()
                    if nom in (None, n)]
            return 200, {"data": data, "next_cursor": None}
        if methode == "GET" and len(p) == 4 and p[3] == "examples":
            j = next(j for j in etat["jeux"].values() if j["id"] == p[2])
            return 200, {"data": {"dataset_id": j["id"], "version_id": f"v{j['version']}",
                                  "examples": list(j["ex"].values())}}
        if methode == "POST" and u.path == "/v1/datasets/upload":
            etat["envois"].append(corps)
            nom = corps["name"]
            if corps["action"] == "create":
                assert nom not in etat["jeux"]
                etat["jeux"][nom] = {"id": f"D{len(etat['jeux']) + 1}", "ex": {}, "version": 0}
            j = etat["jeux"][nom]
            j["version"] += 1
            cr = maj = 0
            for i, eid in enumerate(corps["example_ids"]):
                nouveau = {"id": eid, "node_id": f"N-{j['id']}-{eid}", "input": corps["inputs"][i], "output": corps["outputs"][i],
                           "metadata": corps["metadata"][i]}
                if eid in j["ex"]:
                    maj += j["ex"][eid] != nouveau
                else:
                    cr += 1
                j["ex"][eid] = nouveau
            return 200, {"data": {"dataset_id": j["id"], "version_id": f"v{j['version']}",
                                  "num_created_examples": cr, "num_updated_examples": maj,
                                  "num_deleted_examples": 0}}
        if methode == "POST" and len(p) == 4 and p[3] == "experiments":
            eid = f"E{len(etat['experiences']) + 1}"
            etat["experiences"][eid] = {"jeu": p[2], **corps, "runs": []}
            return 200, {"data": {"id": eid, "dataset_id": p[2]}}
        if methode == "POST" and len(p) == 4 and p[3] == "runs":
            rid = f"R{len(etat['runs']) + 1}"
            if not str(corps["dataset_example_id"]).startswith("N-"):
                return 500, {"detail": "Incorrect padding"}
            etat["runs"][rid] = {"experience": p[2], **corps}
            etat["experiences"][p[2]]["runs"].append(rid)
            return 200, {"data": {"id": rid}}
        if methode == "POST" and u.path == "/v1/experiment_evaluations":
            assert corps["experiment_run_id"] in etat["runs"]
            etat["evals"].append(corps)
            return 200, {"data": {"id": f"V{len(etat['evals'])}"}}
        return 404, {"detail": chemin}

    s = Serveur(gestion)
    s.etat = etat
    return s


def faux_ollama(verdict_juge="oui"):
    """Sortie de génération : « VERSION-B » si la consigne système le contient (sert aux tests A / B)."""

    def gestion(s, methode, chemin, corps):
        s.appels.append((methode, chemin, corps))
        if chemin == "/api/version":
            return 200, {"version": "0.0.0-faux"}
        if chemin == "/api/chat":
            systeme = corps["messages"][0]["content"]
            if "format" in corps:
                v = verdict_juge(corps) if callable(verdict_juge) else verdict_juge
                texte = json.dumps({"verdict": v, "raison": "faux juge"})
            elif "VERSION-B" in systeme:
                texte = "Sortie B : CONFLIT : relevé, statut « brouillon à envoyer par un humain »."
            else:
                texte = "Sortie A : donnée manquante."
            return 200, {"message": {"content": texte}, "prompt_eval_count": 10, "eval_count": 5,
                         "total_duration": 1_000_000}
        return 404, {}

    return Serveur(gestion)


FAUX_CLAUDE = r'''#!/usr/bin/env python3
import json, os, sys
prompt = sys.stdin.read()
with open(os.environ["FAUX_CLAUDE_JOURNAL"], "a") as f:
    f.write(json.dumps({"args": sys.argv[1:], "beta": os.environ.get("CLAUDE_CODE_ENHANCED_TELEMETRY_BETA")}) + "\n")
mode = os.environ.get("FAUX_CLAUDE_MODE", "ok")
if mode == "non-json":
    print("pas du json"); sys.exit(0)
if mode == "erreur":
    print(json.dumps({"type": "result", "subtype": "success", "is_error": True, "result": "quota"})); sys.exit(0)
if mode == "sous-type":
    print(json.dumps({"type": "result", "subtype": "error_max_turns", "is_error": False, "result": ""})); sys.exit(0)
gagnant = "X" if "Sortie B" in prompt.split("=== Sortie X ===")[1].split("=== Sortie Y ===")[0] else "Y"
res = json.dumps({"meilleure": gagnant, "criteres_X": 1, "criteres_Y": 0, "raison": "B cite le fragment"})
print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "Voici : " + res}))
'''


# ------------------------------------------------------------------------------------------------ base commune

class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="tester-banc-")
        self.ancien_dossier = bc.DOSSIER_BANC
        bc.DOSSIER_BANC = os.path.join(self.tmp, "banc")
        # Racine factice : copies des trois études, dossiers de services, une compétence et sa variante B.
        self.racine = os.path.join(self.tmp, "depot")
        for rel in bc.ETUDES:
            os.makedirs(os.path.dirname(os.path.join(self.racine, rel)), exist_ok=True)
            shutil.copy(os.path.join(RACINE, rel), os.path.join(self.racine, rel))
        for n in os.listdir(os.path.join(RACINE, "organisation", "services")):
            if os.path.isdir(os.path.join(RACINE, "organisation", "services", n)):
                os.makedirs(os.path.join(self.racine, "organisation", "services", n))
        self.skill = os.path.join(self.racine, "organisation", "skills", "essai", "SKILL.md")
        os.makedirs(os.path.dirname(self.skill))
        with open(self.skill, "w", encoding="utf-8") as f:
            f.write('---\nname: "essai"\nmetadata:\n  domaine: "direction"\n---\n# Essai\n')
        self.skill_b = os.path.join(self.tmp, "SKILL-B.md")
        with open(self.skill_b, "w", encoding="utf-8") as f:
            f.write("# Essai VERSION-B\n")
        self.serveurs = []

    def tearDown(self):
        for s in self.serveurs:
            s.fermer()
        bc.DOSSIER_BANC = self.ancien_dossier
        shutil.rmtree(self.tmp, ignore_errors=True)

    def serveur(self, s):
        self.serveurs.append(s)
        return s

    def lancer(self, fonction, *args, **kw):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = fonction(list(args), **kw)
        return code, out.getvalue(), err.getvalue()

    def empreinte_organisation(self):
        r = []
        for d, _, fs in os.walk(os.path.join(self.racine, "organisation")):
            for f in fs:
                p = os.path.join(d, f)
                r.append((p, os.path.getmtime(p), os.path.getsize(p)))
        return sorted(r)


# ------------------------------------------------------------------------------------------------ cas d'essai

class TestsCas(unittest.TestCase):
    def test_84_cas_28_departements_existants(self):
        cas = bc.tous_les_cas()
        self.assertEqual(len(cas), 84)
        par_dept = {}
        for c in cas:
            par_dept.setdefault(c["departement"], []).append(c)
        self.assertEqual(len(par_dept), 28)
        self.assertTrue(all(len(v) == 3 for v in par_dept.values()))
        self.assertLessEqual(set(par_dept), bc.departements_valides())
        self.assertEqual(len({c["cle"] for c in cas}), 84)
        for c in cas:
            self.assertTrue(c["entree"] and c["sortie_attendue"] and c["criteres"], c["cle"])
            self.assertRegex(c["source"], r"^docs/etude-usine-v2/groupe-\d-.+\.md:\d+$")

    def test_entree_avec_parenthese_et_criteres_par_virgules(self):
        cas = {c["cle"]: c for c in bc.tous_les_cas()}
        self.assertIn("8 000 euros", cas["g2-8.3.1"]["entree"])
        self.assertNotIn("inspirée", cas["g2-8.3.1"]["entree"])
        self.assertEqual(len(cas["g1-3.3.2"]["criteres"]), 5)
        self.assertIn("aucune décision marquée « prise »", cas["g1-3.3.2"]["criteres"])
        # Les virgules internes d'un critère ne sont pas coupées quand l'étude utilise « ; ».
        self.assertIn("0 question sur la famille, la santé, l'âge ou l'origine", cas["g1-8.3.1"]["criteres"])

    def test_criteres_lettres(self):
        self.assertEqual(bc.decouper_criteres("(a) un ; (b) deux ; (c) trois."), ["un", "deux", "trois"])

    def test_verification_code(self):
        neg = "aucune mention « prêt à signer »"
        self.assertEqual(bc.verification_code(neg, "Contrôle non réussi.")[0], True)
        self.assertIsNone(bc.verification_code(neg, "Le contrat est PRÊT à signer."))  # le juge tranche
        pos = "citation marquée « à valider par la personne citée »"
        self.assertEqual(bc.verification_code(pos, "Citation sans réserve.")[0], False)
        self.assertIsNone(bc.verification_code(pos, "Citation (à valider par la personne citée)."))
        self.assertIsNone(bc.verification_code("3 exclus sur 3", "n'importe quoi"))
        # Limite de mot : « prise » n'est pas trouvé dans « entreprise ».
        self.assertEqual(bc.verification_code("aucune décision marquée « prise »", "Une entreprise.")[0], True)
        self.assertEqual(bc.verification_code("chaque conflit écrit avec `CONFLIT :`", "rien")[0], False)

    def test_boucle_locale_seulement(self):
        for u in ("http://127.0.0.1:6006", "http://localhost:11434", "http://[::1]:1"):
            bc.verifier_boucle_locale(u)
        for u in ("http://192.168.1.10:6006", "https://exemple.org", "http://0.0.0.0:6006"):
            with self.assertRaises(bc.ErreurBanc):
                bc.verifier_boucle_locale(u)


# ------------------------------------------------------------------------------------------------ chargement

class TestsChargement(Base):
    def test_creation_puis_idempotence_puis_mise_a_jour(self):
        ph = self.serveur(faux_phoenix())
        code, out, _ = self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                                   "--interdits", os.path.join(self.tmp, "absent"))
        self.assertEqual(code, 0, out)
        self.assertEqual(len(ph.etat["jeux"]), 28)
        self.assertEqual(sum(len(j["ex"]) for j in ph.etat["jeux"].values()), 84)
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["crees"], 28)
        ex1 = ph.etat["jeux"]["banc-recouvrement"]["ex"]["g2-11.3.3"]
        self.assertEqual(ex1["metadata"]["departement"], "recouvrement")
        self.assertIn("IBAN", ex1["input"]["entree"])
        self.assertTrue(ex1["output"]["criteres"])
        # Deuxième passage : rien n'est renvoyé.
        n = len(ph.etat["envois"])
        code, out, _ = self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                                   "--interdits", os.path.join(self.tmp, "absent"))
        self.assertEqual(code, 0)
        self.assertEqual(len(ph.etat["envois"]), n)
        self.assertEqual(json.loads(out.strip().splitlines()[-1])["inchanges"], 28)
        # Une étude modifiée : seul le jeu concerné est mis à jour.
        g2 = os.path.join(self.racine, bc.ETUDES[1])
        with open(g2, encoding="utf-8") as f:
            t = f.read()
        with open(g2, "w", encoding="utf-8") as f:
            f.write(t.replace("sur un nouvel IBAN", "sur un nouvel IBAN étranger"))
        code, out, _ = self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                                   "--interdits", os.path.join(self.tmp, "absent"))
        self.assertEqual(code, 0)
        self.assertEqual(len(ph.etat["envois"]), n + 1)
        self.assertEqual(ph.etat["envois"][-1]["action"], "update")
        self.assertEqual(ph.etat["envois"][-1]["name"], "banc-recouvrement")

    def test_a_blanc_n_envoie_rien(self):
        ph = self.serveur(faux_phoenix())
        code, out, _ = self.lancer(charger_cas.main, "--a-blanc", "--phoenix", ph.url, "--racine", self.racine)
        self.assertEqual(code, 0)
        self.assertEqual(ph.appels, [])
        self.assertIn("banc-recouvrement : 3 cas", out)

    def test_nom_interdit_bloque_tout(self):
        ph = self.serveur(faux_phoenix())
        interdits = os.path.join(self.tmp, "interdits.txt")
        with open(interdits, "w", encoding="utf-8") as f:
            f.write("# commentaire\nphotocopieur\n")
        code, _, err = self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                                   "--interdits", interdits)
        self.assertEqual(code, 3)
        self.assertIn("nom interdit", err)
        self.assertEqual(ph.appels, [])


# ------------------------------------------------------------------------------------------------ banc

class TestsBanc(Base):
    def preparer(self, verdict="oui"):
        ph = self.serveur(faux_phoenix())
        ol = self.serveur(faux_ollama(verdict))
        self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                    "--interdits", os.path.join(self.tmp, "absent"))
        return ph, ol

    def banc(self, ph, ol, *extra, retour=None):
        # Une seule répétition par défaut dans ces tests (le défaut réel, 3, a ses propres tests plus bas).
        if "--repetitions" not in extra:
            extra = ("--repetitions", "1") + extra
        return self.lancer(ex.main, "--competence", "essai", "--racine", self.racine, "--version-a", self.skill,
                           "--phoenix", ph.url, "--ollama", ol.url, *extra, retour=retour)

    def test_a_b_dans_phoenix_et_resultat_hors_depot(self):
        ph, ol = self.preparer()
        avant = self.empreinte_organisation()
        res = {}
        code, _out, err = self.banc(ph, ol, "--version-b", self.skill_b, retour=res)
        self.assertEqual(code, 0, err)
        self.assertEqual(avant, self.empreinte_organisation())  # organisation/ intacte
        exps = ph.etat["experiences"]
        self.assertEqual(len(exps), 2)
        self.assertEqual({e["metadata"]["version"] for e in exps.values()}, {"A", "B"})
        self.assertTrue(all(len(e["runs"]) == 3 for e in exps.values()))
        self.assertTrue(all(e["jeu"] == ph.etat["jeux"]["banc-direction"]["id"] for e in exps.values()))
        self.assertEqual(len([v for v in ph.etat["evals"] if v["name"] == "criteres"]), 6)
        # Le cas « Décision transverse » exige `CONFLIT :` : A échoue par code, B passe au juge.
        a = next(c for c in res["versions"][0]["cas"] if c["cle"] == "g1-3.3.2")
        b = next(c for c in res["versions"][1]["cas"] if c["cle"] == "g1-3.3.2")
        d_a = next(d for d in a["details"] if "CONFLIT" in d["critere"])
        d_b = next(d for d in b["details"] if "CONFLIT" in d["critere"])
        self.assertEqual((d_a["reussi"], d_a["source"]), (False, "code"))
        self.assertEqual((d_b["reussi"], d_b["source"]), (True, "juge-local"))
        self.assertTrue(res["comparaison"]["b_meilleure_sans_regression"])
        self.assertTrue(res["fichier"].startswith(bc.DOSSIER_BANC))
        self.assertTrue(os.path.isfile(res["fichier"]))
        # La consigne système envoyée à Ollama est bien la compétence.
        systemes = {c[2]["messages"][0]["content"] for c in ol.appels if c[1] == "/api/chat" and "format" not in c[2]}
        self.assertEqual(len(systemes), 2)

    def test_sans_phoenix(self):
        ph, ol = self.preparer()
        n = len(ph.appels)
        code, _, err = self.banc(ph, ol, "--sans-phoenix")
        self.assertEqual(code, 0, err)
        self.assertEqual(len(ph.appels), n)

    def test_jeu_absent(self):
        ph = self.serveur(faux_phoenix())
        ol = self.serveur(faux_ollama())
        code, _, err = self.banc(ph, ol)
        self.assertEqual(code, 1)
        self.assertIn("charger-cas.py", err)

    def test_regression_refusee(self):
        def cas(scores):
            return {"score": sum(scores) / len(scores), "cas": [{"cle": str(i), "score": s} for i, s in enumerate(scores)]}
        r = ex.comparer(cas([0.5, 0.5, 0.5]), cas([1.0, 1.0, 0.25]))
        self.assertGreater(r["ecart"], 0)
        self.assertEqual(r["reculs"], ["2"])
        self.assertFalse(r["b_meilleure_sans_regression"])
        self.assertTrue(ex.comparer(cas([0.5, 0.5]), cas([0.5, 1.0]))["b_meilleure_sans_regression"])
        self.assertFalse(ex.comparer(cas([0.5, 0.5]), cas([0.5, 0.5]))["b_meilleure_sans_regression"])


class TestsJugeClaude(TestsBanc):
    def setUp(self):
        super().setUp()
        self.claude = os.path.join(self.tmp, "faux-claude")
        with open(self.claude, "w") as f:
            f.write(FAUX_CLAUDE)
        os.chmod(self.claude, os.stat(self.claude).st_mode | stat.S_IEXEC)
        self.journal = os.path.join(self.tmp, "claude.jsonl")
        self.env = {"ATELIER_CLAUDE": self.claude, "FAUX_CLAUDE_JOURNAL": self.journal,
                    "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1"}
        self.ancien_env = {k: os.environ.get(k) for k in list(self.env) + ["FAUX_CLAUDE_MODE"]}
        os.environ.update(self.env)

    def tearDown(self):
        for k, v in self.ancien_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        super().tearDown()

    def appels_claude(self):
        if not os.path.exists(self.journal):
            return []
        with open(self.journal) as f:
            return [json.loads(l) for l in f]

    def test_plafond_obligatoire(self):
        ph, ol = self.preparer()
        code, _, err = self.banc(ph, ol, "--version-b", self.skill_b, "--juge-claude")
        self.assertEqual(code, 1)
        self.assertIn("--plafond-claude", err)
        self.assertEqual(self.appels_claude(), [])

    def test_a_blanc_aucun_appel(self):
        ph, ol = self.preparer()
        res = {}
        code, out, err = self.banc(ph, ol, "--version-b", self.skill_b, "--juge-claude", "--plafond-claude", "2",
                                   "--a-blanc-claude", retour=res)
        self.assertEqual(code, 0, err)
        self.assertEqual(self.appels_claude(), [])
        self.assertEqual(res["juge_claude"]["appels_prevus"], 2)
        self.assertEqual(len(res["juge_claude"]["cas_non_juges"]), 1)
        self.assertIn("[à blanc]", out)

    def test_plafond_respecte_et_ordre_alterne(self):
        ph, ol = self.preparer()
        res = {}
        code, _, err = self.banc(ph, ol, "--version-b", self.skill_b, "--juge-claude", "--plafond-claude", "2",
                                 "--modele-claude", "sonnet", retour=res)
        self.assertEqual(code, 0, err)
        appels = self.appels_claude()
        self.assertEqual(len(appels), 2)
        self.assertTrue(all(a["beta"] is None for a in appels))  # variable bêta retirée de l'environnement
        self.assertTrue(all({"-p", "--output-format", "json"} <= set(a["args"]) for a in appels))
        self.assertTrue(all(a["args"][-2:] == ["--model", "sonnet"] for a in appels))
        # B gagne aux deux cas, qu'elle soit présentée en X ou en Y.
        self.assertEqual([v["meilleure"] for v in res["juge_claude"]["verdicts"]], ["B", "B"])
        self.assertEqual(len([v for v in ph.etat["evals"] if v["name"] == "juge-claude"]), 4)

    def test_erreurs_claude(self):
        for mode, attendu in (("erreur", "is_error=True"), ("sous-type", "error_max_turns"), ("non-json", "non JSON")):
            os.environ["FAUX_CLAUDE_MODE"] = mode
            with self.assertRaises(bc.ErreurBanc) as ctx:
                bc.appeler_claude("=== Sortie X ===\nSortie B\n=== Sortie Y ===\nSortie A\n", self.claude)
            self.assertIn(attendu, str(ctx.exception))


# ------------------------------------------------------------------------------------------------ propositions DSPy

class TestsProposition(Base):
    def test_assembler_remplace_l_ancien_bloc(self):
        t = proposer.assembler("# Compétence\n\nRègle.\n", "Toujours citer la source.")
        self.assertTrue(t.startswith("# Compétence\n\nRègle.\n\n" + proposer.TITRE_BLOC))
        t2 = proposer.assembler(t, "Nouveau bloc.")
        self.assertEqual(t2.count(proposer.TITRE_BLOC), 1)
        self.assertIn("Nouveau bloc.", t2)
        self.assertNotIn("Toujours citer", t2)

    def test_consigne_initiale_ancree_sur_la_competence(self):
        skill = '---\nname: "relance-x"\ndescription: "Rédige des relances amiables. À utiliser pour X."\n---\n'
        c = proposer.consigne_initiale(skill)
        self.assertTrue(c.startswith(proposer.CONSIGNE_INITIALE))
        self.assertIn("Compétence : relance-x.", c)
        self.assertIn("Objet : Rédige des relances amiables.", c)
        self.assertEqual(proposer.consigne_initiale("# sans en-tête\n"), proposer.CONSIGNE_INITIALE)

    def test_langue(self):
        self.assertTrue(proposer.est_francais("Ne jamais inventer une donnée ; toujours citer la source dans le brouillon."))
        self.assertFalse(proposer.est_francais("Always cite the source and never invent any data in the draft."))

    def test_depot_hors_git_seulement(self):
        chemin = proposer.deposer("essai", "contenu", {"score_avant": 0.5}, "20260101-000000")
        self.assertTrue(chemin.startswith(os.path.realpath(bc.DOSSIER_BANC)))
        self.assertTrue(os.path.isfile(os.path.join(os.path.dirname(chemin), "proposition.json")))
        bc.DOSSIER_BANC = os.path.join(RACINE, "organisation")
        with self.assertRaises(bc.ErreurBanc):
            proposer.dossier_propositions()


# ------------------------------------------------------------------------------------------------ pièces fictives

PIECES = os.path.join(RACINE, "tests", "banc", "pieces")


def lire_piece(dept, cle, nom):
    with open(os.path.join(PIECES, dept, cle, nom), encoding="utf-8") as f:
        return f.read()


def lire_csv(dept, cle, nom):
    lignes = lire_piece(dept, cle, nom).strip("\n").split("\n")
    entetes = lignes[0].split(";")
    return [dict(zip(entetes, l.split(";"))) for l in lignes[1:]]


def nb(s):
    return float(s.replace(" ", "").replace(",", "."))


def criteres_de(dept, cle):
    return json.loads(lire_piece(dept, cle, "criteres.json"))


def nombres_du_critere(dept, cle, debut):
    return next(c["nombres"] for c in criteres_de(dept, cle) if c["critere"].startswith(debut))


class TestsPiecesFictives(unittest.TestCase):
    """Les pièces versionnées dans tests/banc/pieces : reliées aux cas, sans donnée réelle, cohérentes avec leurs critères."""

    def test_chaque_dossier_est_un_cas_existant(self):
        cas = {(c["departement"], c["cle"]): c for c in bc.tous_les_cas()}
        dossiers = [(d, c) for d in os.listdir(PIECES) if os.path.isdir(os.path.join(PIECES, d))
                    for c in os.listdir(os.path.join(PIECES, d))]
        self.assertGreaterEqual(len(dossiers), 70)
        for d in dossiers:
            self.assertIn(d, cas, f"dossier de pièces sans cas : {d}")
            self.assertTrue(cas[d]["pieces"], d)
        # Tout cas qui a des pièces les voit injectées dans son entrée.
        for c in cas.values():
            texte = bc.texte_entree(c)
            self.assertTrue(texte.startswith(c["entree"]))
            for p in c["pieces"]:
                self.assertIn(p["contenu"].rstrip(), texte)

    def test_taille_sous_le_plafond(self):
        for c in bc.tous_les_cas():
            self.assertLessEqual(sum(len(p["contenu"]) for p in c["pieces"]), bc.PLAFOND_PIECES, c["cle"])

    def test_criteres_json_bien_formes(self):
        cles = {"critere", "nombres", "un_parmi", "nombres_interdits", "mots", "interdits"}
        n = 0
        for c in bc.tous_les_cas():
            for spec in c["criteres_code"]:
                n += 1
                self.assertTrue(spec["critere"], c["cle"])
                self.assertTrue(set(spec) <= cles and len(spec) >= 2, (c["cle"], spec))
        self.assertGreaterEqual(n, 55)

    def test_aucune_donnee_reelle(self):
        iban = re.compile(r"\bBE\d{2}(?: ?\d{4}){3}\b")
        courriel = re.compile(r"[\w.+-]+@([\w.-]+)")
        for racine, _, fichiers in os.walk(PIECES):
            for nom in fichiers:
                chemin = os.path.join(racine, nom)
                with open(chemin, encoding="utf-8") as f:
                    for ligne in f:
                        for m in courriel.finditer(ligne):
                            self.assertTrue(m.group(1).rstrip(".,;)").endswith("exemple.invalid"), (chemin, ligne))
                        for m in iban.finditer(ligne):
                            self.assertIn("fictif", ligne, (chemin, ligne))
                            chiffres = re.sub(r"\D", "", m.group(0))
                            # Clé de contrôle 00 : jamais valide (modulo 97 égal à 1 exigé).
                            self.assertNotEqual(int(chiffres[2:] + "1114" + chiffres[:2]) % 97, 1, chemin)

    def test_cas_sans_piece_restent_possibles(self):
        cas = {c["cle"]: c for c in bc.tous_les_cas()}
        self.assertEqual(cas["g1-3.3.1"]["pieces"], [])  # énoncé complet : rien à fournir
        self.assertEqual(bc.texte_entree(cas["g1-3.3.1"]), cas["g1-3.3.1"]["entree"])

    # --- cohérence des critères chiffrés avec les pièces (recalculés ici à partir des données)

    def test_rapprochement_bancaire(self):
        from collections import Counter
        banque = lire_csv("comptabilite-finance", "g3-3.3.1", "releve-bancaire-septembre-2026.csv")
        livre = lire_csv("comptabilite-finance", "g3-3.3.1", "grand-livre-banque-septembre-2026.csv")
        self.assertEqual((len(banque), len(livre)), (42, 41))
        cb, cl = Counter(nb(r["montant"]) for r in banque), Counter(nb(r["montant"]) for r in livre)
        self.assertEqual(dict(cb - cl), {-37.40: 1, -412.50: 1})  # absents du grand livre
        self.assertEqual(dict(cl - cb), {-1815.00: 1})  # encodée deux fois
        self.assertEqual(sorted(nombres_du_critere("comptabilite-finance", "g3-3.3.1", "les trois")), [37.40, 412.50, 1815.00])

    def test_ecarts_budgetaires(self):
        postes = lire_csv("comptabilite-finance", "g3-3.3.2", "budget-reel-t3-2026.csv")
        self.assertEqual(len(postes), 12)
        ecarts = [(nb(p["reel_t3"]) - nb(p["budget_t3"]), nb(p["budget_t3"])) for p in postes]
        signales = sorted(abs(e) for e, b in ecarts if abs(e) >= 5000 or abs(e) / b >= 0.10)
        self.assertEqual(signales, sorted(nombres_du_critere("comptabilite-finance", "g3-3.3.2", "écarts")))
        d = lire_csv("comptabilite-finance", "g3-3.3.2", "detail-matieres-consommables.csv")
        qb, pb, qr, pr = nb(d[0]["quantite_unites"]), nb(d[0]["prix_unitaire_eur"]), nb(d[1]["quantite_unites"]), nb(d[1]["prix_unitaire_eur"])
        self.assertEqual(sorted(round(x, 6) for x in [(qr - qb) * pb, (pr - pb) * qr]), [1800.0, 6000.0])
        self.assertEqual(sorted(nombres_du_critere("comptabilite-finance", "g3-3.3.2", "effet")), [1800.0, 6000.0])

    def test_tva_et_offres_et_stock(self):
        lignes = lire_csv("fiscalite", "g3-4.3.1", "operations-t3-2026.csv")
        self.assertEqual(len(lignes), 30)
        de = [l for l in lignes if l["pays"] == "DE"]
        self.assertEqual([nb(l["base_ht"]) for l in de], [4800.0])
        faute = [l for l in lignes if l["nature"].startswith("Manuel") and l["taux_applique_pct"] == "21"]
        self.assertEqual(len(faute), 1)
        self.assertAlmostEqual(nb(faute[0]["base_ht"]) * 0.15, 375.0)
        # Trois offres : coût total sur 36 mois recalculé depuis les fichiers.
        totaux = []
        for k in "ABC":
            txt = lire_piece("achats", "g3-5.3.1", f"offre-{k}.md")
            nombre = lambda motif: float(re.search(motif, txt).group(1).replace(" ", "").replace(",", "."))
            total = nombre(r"Abonnement : ([\d ,]+) euros") * 60 * 36 + nombre(r"mise en route : ([\d ,]+) euros")
            if "Formation : incluse" not in txt:
                total += nombre(r"Formation : ([\d ,]+) euros")
            if "export des données en fin de contrat : aucun" not in txt:
                total += nombre(r"fin de contrat : ([\d ,]+) euros")
            totaux.append(total)
        self.assertEqual(sorted(totaux), sorted(nombres_du_critere("achats", "g3-5.3.1", "coût")))
        # Stock : 11 semaines vendues, moyenne 42 ; la moyenne trompeuse sur 13 semaines vaut 35,54.
        v = [int(l["unites_vendues"]) for l in lire_csv("logistique", "g3-6.3.1", "ventes-13-semaines.csv")]
        self.assertEqual(len(v), 13)
        self.assertEqual(sum(v) / (len(v) - 2), 42.0)
        self.assertAlmostEqual(sum(v) / len(v), 35.54, places=2)
        spec = criteres_de("logistique", "g3-6.3.1")[0]
        self.assertEqual((spec["nombres"], spec["nombres_interdits"]), ([42.0], [35.54, 35.5]))

    def test_projets_charge_plaintes_et_totaux(self):
        from datetime import datetime
        retards, meteo = [], []
        for p in lire_csv("gestion-projets", "g3-11.3.1", "portefeuille-projets.csv"):
            prev = datetime.strptime(p["jalon_en_cours_prevu"], "%d/%m/%Y")
            reel = datetime.strptime(p["jalon_en_cours_reel_ou_estime"], "%d/%m/%Y")
            r = max((reel - prev).days, 0)
            conso = nb(p["consomme_eur"]) / nb(p["budget_eur"])
            retards.append(r)
            meteo.append("rouge" if r > 20 or conso > 1.10 else "orange" if r > 5 or conso > 1.0 else "vert")
        self.assertEqual(sorted(r for r in retards if r > 0), sorted(nombres_du_critere("gestion-projets", "g3-11.3.1", "écarts")))
        self.assertEqual(sorted(meteo), ["orange", "orange", "rouge", "rouge", "vert", "vert"])
        charge = lire_csv("gestion-projets", "g3-11.3.2", "charge-equipe-t4.csv")
        dispo = sum(int(c["disponibilite_jours_apres_conges"]) for c in charge)
        dem = sum(int(c["demandes_jours"]) for c in charge)
        self.assertEqual((dispo, dem, round(100 * dem / dispo)), (250, 325, 130))
        plaintes = lire_csv("sav-sinistres", "g2-6.3.3", "plaintes-septembre-2026.csv")
        self.assertEqual(len(plaintes), 23)
        self.assertEqual(sum(int(p["delai_reponse_jours"]) for p in plaintes) / 23, 9.0)
        total = sum(nb(r["taille_go"]) for r in lire_csv("informatique", "g3-8.3.2", "boites-messagerie.csv"))
        self.assertEqual(len(lire_csv("informatique", "g3-8.3.2", "boites-messagerie.csv")), 100)
        self.assertEqual(round(total, 1), nombres_du_critere("informatique", "g3-8.3.2", "volume")[0])
        # Poste P3 saturé à 130 % en semaine 2.
        charge_p3 = 0.0
        for o in lire_csv("production", "g3-7.3.2", "ordres-de-fabrication.csv"):
            if o["echeance_semaine"] == "2":
                charge_p3 += sum(float(h) for p_, h in (x.strip().split(":") for x in o["gamme_heures_par_poste"].split("+")) if p_ == "P3")
        self.assertEqual((charge_p3, round(100 * charge_p3 / 60)), (78.0, 130))

    def test_listes_de_contacts_et_fiches(self):
        appel = lire_csv("marketing", "g2-3.3.2", "fichier-appel-campagne.csv")
        self.assertEqual(len(appel), 40)
        self.assertEqual([l["id"] for l in appel if l["drapeau_liste_robinson"]], ["P-007", "P-019", "P-033"])
        fiches = lire_csv("evenementiel", "g2-8.3.3", "fiches-contacts-salon.csv")
        self.assertEqual((len(fiches), sum(1 for f in fiches if f["notes_de_conversation"])), (25, 8))
        self.assertEqual(sum(int(l["effectif"]) for l in lire_csv("formation", "g1-9.3.1", "effectif-par-fonction.csv")), 100)
        visio = [l for l in lire_csv("achats", "g3-5.3.2", "depenses-annuelles-2026.csv") if l["categorie"] == "visioconférence"]
        self.assertEqual((len(visio), sum(nb(l["montant_annuel_eur"]) for l in visio)), (3, 3480.0))
        janv = [l for l in lire_csv("achats", "g3-5.3.2", "depenses-annuelles-2026.csv") if l["prochain_renouvellement"] == "01/2027"]
        self.assertEqual(len(janv), 4)


class TestsCriteresDePiece(unittest.TestCase):
    def test_extraction_des_nombres(self):
        v = bc.extraire_nombres("1 815,00 ; 1.815,00 ; 1815.00 ; 94,97 % ; -3 000 ; 12/06/2026 ; 1,815.00")
        for attendu in (1815.0, 94.97, 3000.0, 12.0, 2026.0):
            self.assertTrue(bc.presente(v, attendu), attendu)
        self.assertEqual(v.count(1815.0), 4)
        self.assertFalse(bc.presente(v, 1816.0))
        # Séparateur isolé suivi de 3 chiffres : les deux lectures existent.
        self.assertTrue(bc.presente(bc.extraire_nombres("1.815"), 1815.0))
        self.assertTrue(bc.presente(bc.extraire_nombres("1.815"), 1.815))
        self.assertTrue(bc.presente(bc.extraire_nombres("1 815,00 €"), 1815.0))

    def test_verifier_critere_piece(self):
        spec = {"critere": "x", "nombres": [1815.0, 37.4], "mots": ["Annexe 2|annexe n° 2"], "interdits": ["payé"],
                "nombres_interdits": [35.54], "un_parmi": [630.0, 210.0]}
        ok = "Doublon de 1 815,00 et frais de 37,40 ; l'annexe n° 2 manque ; avoir de 630 euros."
        self.assertEqual(bc.verifier_critere_piece(spec, ok)[0], True)
        for mauvais, motif in (("1 815,00 seulement, annexe 2, 630", "37,4"), (ok + " Moyenne 35,54.", "35,54"),
                               (ok + " payé", "payé"), (ok.replace("annexe n° 2", "pièce"), "Annexe 2"),
                               (ok.replace("630", "12"), "un parmi")):
            r = bc.verifier_critere_piece(spec, mauvais)
            self.assertEqual(r[0], False, mauvais)
            self.assertIn(motif, r[1])

    def test_noter_ajoute_les_criteres_de_piece_sans_juge(self):
        class SansJuge:
            def discuter(self, *a, **k):
                raise AssertionError("le juge local ne doit pas être appelé")
        cas = {"entree": "e", "sortie_attendue": "s", "criteres": [],
               "criteres_code": [{"critere": "3 anomalies", "nombres": [1815.0, 37.4, 412.5]}]}
        n = bc.noter(SansJuge(), cas, "Trouvé : 1 815,00 ; 37,40 ; 412,50.")
        self.assertEqual((n["score"], n["details"][0]["source"]), (1.0, "code-piece"))
        n = bc.noter(SansJuge(), cas, "Trouvé : 1 815,00 seulement.")
        self.assertEqual((n["score"], n["details"][0]["reussi"]), (0.0, False))


class FauxOllamaVariable:
    """Génération « OK » aux graines 42 et 44, « KO » à la graine 43 : répétitions de scores 1, 0, 1."""

    def __init__(self):
        self.appels = []

    def discuter(self, systeme, utilisateur, schema=None, temperature=0.0, max_jetons=2048, graine=42):
        self.appels.append({"temperature": temperature, "graine": graine, "utilisateur": utilisateur})
        return {"texte": "KO" if graine == 43 else "OK", "jetons_entree": 1, "jetons_sortie": 1, "duree_s": 0}


class TestsRepetitions(Base):
    def cas_simple(self):
        return {"cle": "c1", "titre": "t", "entree": "e", "sortie_attendue": "s", "criteres": [],
                "criteres_code": [{"critere": "dit OK", "mots": ["OK"]}], "pieces": []}

    def test_statistiques(self):
        self.assertAlmostEqual(bc.moyenne([1, 0, 1]), 2 / 3)
        self.assertAlmostEqual(bc.ecart_type([1, 0, 1]), (1 / 3) ** 0.5)
        self.assertEqual(bc.ecart_type([0.4]), 0.0)
        self.assertEqual(bc.ecart_type([]), 0.0)

    def test_jouer_version_moyenne_et_ecart_type(self):
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            v = ex.jouer_version(FauxOllamaVariable(), "A", self.skill, [self.cas_simple()], repetitions=3)
        self.assertEqual(v["scores_repetitions"], [1.0, 0.0, 1.0])
        self.assertAlmostEqual(v["score"], 2 / 3, places=4)
        self.assertAlmostEqual(v["ecart_type"], (1 / 3) ** 0.5, places=3)
        c = v["cas"][0]
        self.assertEqual([r["score"] for r in c["repetitions"]], [1.0, 0.0, 1.0])
        self.assertEqual(c["details"][0]["taux"], 0.667)
        self.assertTrue(c["details"][0]["reussi"])
        self.assertIn("répétitions : 1.00 / 0.00 / 1.00", sortie.getvalue())

    def test_graine_et_temperature(self):
        ol = FauxOllamaVariable()
        with contextlib.redirect_stdout(io.StringIO()):
            ex.jouer_version(ol, "A", self.skill, [self.cas_simple()], repetitions=3)
        self.assertEqual([(a["graine"], a["temperature"]) for a in ol.appels], [(42, 0.3), (43, 0.3), (44, 0.3)])
        ol = FauxOllamaVariable()
        with contextlib.redirect_stdout(io.StringIO()):
            ex.jouer_version(ol, "A", self.skill, [self.cas_simple()], repetitions=1)
        self.assertEqual([(a["graine"], a["temperature"]) for a in ol.appels], [(42, 0.0)])
        ol = FauxOllamaVariable()
        with contextlib.redirect_stdout(io.StringIO()):
            ex.jouer_version(ol, "A", self.skill, [self.cas_simple()], repetitions=2, temperature=0.7)
        self.assertEqual([a["temperature"] for a in ol.appels], [0.7, 0.7])

    def version(self, score, ecart_type, scores_cas):
        return {"score": score, "ecart_type": ecart_type,
                "cas": [{"cle": str(i), "score": s} for i, s in enumerate(scores_cas)]}

    def test_regle_de_decision(self):
        a = self.version(0.50, 0.10, [0.5, 0.5, 0.5])
        # Écart de 0,12 pour un écart-type combiné de 0,1414 : pas retenue, même sans recul.
        b = self.version(0.62, 0.10, [0.6, 0.6, 0.66])
        r = ex.comparer(a, b)
        self.assertAlmostEqual(r["ecart_type_combine"], 0.1414, places=3)
        self.assertEqual((r["depasse_un_ecart_type"], r["b_meilleure_sans_regression"], r["reculs"]), (False, False, []))
        # Écart de 0,20 > 0,1414 et aucun recul : retenue.
        b = self.version(0.70, 0.10, [0.7, 0.7, 0.7])
        self.assertTrue(ex.comparer(a, b)["b_meilleure_sans_regression"])
        # Même écart mais un cas en recul : refusée.
        b = self.version(0.70, 0.10, [1.0, 1.0, 0.1])
        r = ex.comparer(a, b)
        self.assertEqual((r["depasse_un_ecart_type"], r["reculs"], r["b_meilleure_sans_regression"]), (True, ["2"], False))
        # Écart-types nuls (une répétition) : B > A sans recul suffit, comme avant.
        self.assertTrue(ex.comparer(self.version(0.5, 0.0, [0.5]), self.version(0.51, 0.0, [0.51]))["b_meilleure_sans_regression"])
        self.assertFalse(ex.comparer(self.version(0.5, 0.0, [0.5]), self.version(0.5, 0.0, [0.5]))["b_meilleure_sans_regression"])

    def test_defauts_du_banc(self):
        self.assertEqual(bc.REPETITIONS_DEFAUT, 3)
        self.assertEqual(bc.MODELE_CLAUDE_DEFAUT, "sonnet")

    def test_trois_repetitions_par_defaut_dans_phoenix(self):
        ph = self.serveur(faux_phoenix())
        ol = self.serveur(faux_ollama())
        self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                    "--interdits", os.path.join(self.tmp, "absent"))
        res = {}
        # Sans --repetitions : le défaut (3) s'applique.
        code, out, err = self.lancer(ex.main, "--competence", "essai", "--racine", self.racine, "--version-a", self.skill,
                                     "--version-b", self.skill_b, "--phoenix", ph.url, "--ollama", ol.url, retour=res)
        self.assertEqual(code, 0, err)
        self.assertEqual(res["versions"][0]["repetitions"], 3)
        for e in ph.etat["experiences"].values():
            self.assertEqual(e["repetitions"], 3)
            self.assertEqual(len(e["runs"]), 9)  # 3 cas x 3 répétitions
            self.assertEqual(sorted({ph.etat["runs"][r]["repetition_number"] for r in e["runs"]}), [1, 2, 3])
        self.assertEqual(len([v for v in ph.etat["evals"] if v["name"] == "criteres"]), 18)
        self.assertIn("+/-", out)
        self.assertIn("écart-type combiné", out)
        gen = [c[2]["options"] for c in ol.appels if c[1] == "/api/chat" and "format" not in c[2]]
        self.assertEqual(sorted({o["seed"] for o in gen}), [42, 43, 44])
        self.assertEqual({o["temperature"] for o in gen}, {0.3})
        self.assertEqual({o["temperature"] for c in ol.appels if c[1] == "/api/chat" and "format" in c[2]
                          for o in [c[2]["options"]]}, {0.0})  # le juge reste déterministe

    def test_repetitions_invalides(self):
        ph = self.serveur(faux_phoenix())
        ol = self.serveur(faux_ollama())
        code, _, err = self.lancer(ex.main, "--competence", "essai", "--racine", self.racine, "--version-a", self.skill,
                                   "--repetitions", "0", "--sans-phoenix", "--ollama", ol.url)
        self.assertEqual(code, 1)
        self.assertIn("--repetitions", err)


class TestsPiecesInjectees(Base):
    """Une pièce versionnée dans la racine du dépôt est injectée dans l'entrée, chargée dans Phoenix et notée par code."""

    PIECE = "Facture F-1 : montant 1 815,00 euros, doublon.\n"

    def setUp(self):
        super().setUp()
        d = os.path.join(self.racine, "tests", "banc", "pieces", "direction", "g1-3.3.1")
        os.makedirs(d)
        with open(os.path.join(d, "facture.txt"), "w", encoding="utf-8") as f:
            f.write(self.PIECE)
        with open(os.path.join(d, "criteres.json"), "w", encoding="utf-8") as f:
            json.dump([{"critere": "montant du doublon cité", "nombres": [1815.0]}], f)

    def test_chargement_dans_phoenix_idempotent(self):
        ph = self.serveur(faux_phoenix())
        argv = ["--phoenix", ph.url, "--racine", self.racine, "--interdits", os.path.join(self.tmp, "absent")]
        code, out, err = self.lancer(charger_cas.main, *argv)
        self.assertEqual(code, 0, err)
        exemple = ph.etat["jeux"]["banc-direction"]["ex"]["g1-3.3.1"]
        self.assertEqual(exemple["input"]["pieces"], {"facture.txt": self.PIECE})
        self.assertIn(self.PIECE.strip(), exemple["input"]["entree_complete"])
        self.assertEqual(exemple["output"]["criteres_code"][0]["nombres"], [1815.0])
        # Un cas sans pièce reste sans champ « pieces ».
        self.assertNotIn("pieces", ph.etat["jeux"]["banc-direction"]["ex"]["g1-3.3.2"]["input"])
        n = len(ph.etat["envois"])
        code, out, _ = self.lancer(charger_cas.main, *argv)
        self.assertEqual(len(ph.etat["envois"]), n)
        # Pièce modifiée : le jeu est mis à jour.
        with open(os.path.join(self.racine, "tests", "banc", "pieces", "direction", "g1-3.3.1", "facture.txt"), "w", encoding="utf-8") as f:
            f.write(self.PIECE + "Ligne ajoutée.\n")
        code, out, _ = self.lancer(charger_cas.main, *argv)
        self.assertEqual(len(ph.etat["envois"]), n + 1)
        self.assertEqual(ph.etat["envois"][-1]["action"], "update")

    def test_nom_interdit_dans_une_piece(self):
        ph = self.serveur(faux_phoenix())
        interdits = os.path.join(self.tmp, "interdits.txt")
        with open(interdits, "w", encoding="utf-8") as f:
            f.write("doublon\n")
        code, _, err = self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine, "--interdits", interdits)
        self.assertEqual(code, 3)
        self.assertEqual(ph.appels, [])

    def test_injection_dans_l_entree_et_critere_code(self):
        ph = self.serveur(faux_phoenix())
        ol = self.serveur(faux_ollama())
        self.lancer(charger_cas.main, "--phoenix", ph.url, "--racine", self.racine,
                    "--interdits", os.path.join(self.tmp, "absent"))
        res = {}
        code, _, err = self.lancer(ex.main, "--competence", "essai", "--racine", self.racine, "--version-a", self.skill,
                                   "--repetitions", "1", "--phoenix", ph.url, "--ollama", ol.url, retour=res)
        self.assertEqual(code, 0, err)
        utilisateurs = [c[2]["messages"][1]["content"] for c in ol.appels if c[1] == "/api/chat" and "format" not in c[2]]
        avec = [u for u in utilisateurs if "Pièce « facture.txt »" in u]
        self.assertEqual(len(avec), 1)  # seul le cas g1-3.3.1 a une pièce
        self.assertIn(self.PIECE.strip(), avec[0])
        cas = next(c for c in res["versions"][0]["cas"] if c["cle"] == "g1-3.3.1")
        d = next(d for d in cas["details"] if d["critere"] == "montant du doublon cité")
        self.assertEqual((d["source"], d["reussi"]), ("code-piece", False))  # la sortie du faux modèle n'a pas le montant
        # Le juge local voit aussi les pièces.
        juges = [c[2]["messages"][1]["content"] for c in ol.appels if c[1] == "/api/chat" and "format" in c[2]]
        self.assertTrue(any(self.PIECE.strip() in j for j in juges))


class TestsModeleClaudeParDefaut(TestsJugeClaude):
    def test_sonnet_par_defaut_opus_sur_option(self):
        ph, ol = self.preparer()
        code, _, err = self.banc(ph, ol, "--version-b", self.skill_b, "--juge-claude", "--plafond-claude", "1")
        self.assertEqual(code, 0, err)
        self.assertEqual(self.appels_claude()[-1]["args"][-2:], ["--model", "sonnet"])
        code, _, err = self.banc(ph, ol, "--version-b", self.skill_b, "--juge-claude", "--plafond-claude", "1",
                                 "--modele-claude", "opus")
        self.assertEqual(code, 0, err)
        self.assertEqual(self.appels_claude()[-1]["args"][-2:], ["--model", "opus"])
        self.assertEqual(len(self.appels_claude()), 2)
        # Appel direct sans modèle : Sonnet aussi.
        bc.appeler_claude("=== Sortie X ===\nSortie B\n=== Sortie Y ===\nSortie A\n", self.claude)
        self.assertEqual(self.appels_claude()[-1]["args"][-2:], ["--model", "sonnet"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
