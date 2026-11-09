#!/usr/bin/env python3
"""Test hors ligne de `assurer_fabrique` : la fabrique est ouverte par identifiant d'agent, pas par rôle Paperclip.

Usage : python3 -I scripts/test-assurer-fabrique.py
"""
import importlib.util
import copy
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

RACINE = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bootstrap_organisation", RACINE / "scripts" / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(spec)
sys.modules["bootstrap_organisation"] = bo
spec.loader.exec_module(bo)
spec_vo = importlib.util.spec_from_file_location("verifier_organisation", RACINE / "scripts" / "verifier-organisation.py")
vo = importlib.util.module_from_spec(spec_vo)
spec_vo.loader.exec_module(vo)
REGISTRE = json.loads((RACINE / "organisation" / "registre" / "agents.json").read_text(encoding="utf-8"))


def _autorises(agent):
    return set(agent["outils"]["recherche"]) | set(agent["outils"]["mutation"])


def _agents_avec(outil_client):
    return {a["slug"] for a in REGISTRE["agents"] if outil_client in _autorises(a)}


def _outils_plugin_de(agent):
    return {o[len(bo.PREFIXE_CLIENT_FABRIQUE):] for o in _autorises(agent) if o.startswith(bo.PREFIXE_CLIENT_FABRIQUE)}


# Attendus lus dans le registre (et non écrits à la main) : outils du plugin autorisés, puis agents retenus par genre.
OUTILS_REELS = sorted(set().union(*(_outils_plugin_de(a) for a in REGISTRE["agents"])))
DOCUMENTS = _agents_avec(bo.OUTILS_CLIENT_FABRIQUE["document"])
VIDEO = _agents_avec(bo.OUTILS_CLIENT_FABRIQUE["video"])
IMAGE = _agents_avec(bo.OUTILS_CLIENT_FABRIQUE["image"])
VOIR = _agents_avec(bo.OUTILS_CLIENT_FABRIQUE["voir"])
assert OUTILS_REELS and DOCUMENTS and VIDEO and IMAGE and VOIR, "registre sans outil du plugin : attendus vides"
CID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"  # UUID : les dossiers de rendus sont propres à l'entreprise


class FauxApi:
    """Simule la configuration du plugin et les politiques d'outils d'une entreprise."""

    def __init__(self, config):
        self.config = dict(config)
        self.politiques = []
        self.ecritures_config = 0
        self.suppressions = 0

    def get(self, chemin):
        if chemin.startswith("/plugins/"):
            return {"configJson": dict(self.config)}
        if chemin.endswith("/tools/policies"):
            return {"policies": list(self.politiques)}
        raise AssertionError(chemin)

    def appel(self, methode, chemin, corps=None):
        if chemin == "/plugins/" + bo.PLUGIN_CLE + "/config":
            self.config = dict(corps["configJson"])
            self.ecritures_config += 1
        elif chemin.endswith("/tools/policies"):
            self.politiques.append({**corps, "id": f"pol-{len(self.politiques)}-{len(corps['name'])}"})
        elif methode == "DELETE" and "/tools/policies/" in chemin:
            identifiant = chemin.rsplit("/", 1)[1]
            self.politiques = [p for p in self.politiques if p["id"] != identifiant]
            self.suppressions += 1
        else:
            raise AssertionError(chemin)


class TestAssurerFabrique(unittest.TestCase):
    def setUp(self):
        self.reg = json.loads((RACINE / "organisation" / "registre" / "agents.json").read_text(encoding="utf-8"))
        # Plusieurs agents partagent le même rôle Paperclip, comme dans l'usine réelle.
        roles = {"contenus": "designer", "reseaux-sociaux": "designer", "stratege": "researcher", "prospection": "researcher",
                 "mesure": "researcher", "veille": "researcher", "crm-conversion": "general", "seo-local-geo": "general"}
        self.agents = {a["slug"]: {"id": f"id-{a['slug']}", "role": roles.get(a["slug"], "general")} for a in self.reg["agents"]}

    def test_ecrit_les_identifiants_des_agents_retenus(self):
        api = FauxApi({"fabriqueRolesDocuments": ["designer"], "fabriqueRolesVideo": ["designer"], "autre": 1})
        bo.assurer_fabrique(api, CID, self.reg, self.agents)
        self.assertEqual(set(api.config["fabriqueAgentsDocuments"]), {f"id-{s}" for s in DOCUMENTS})
        self.assertEqual(api.config["fabriqueAgentsVideo"], sorted(f"id-{s}" for s in VIDEO))
        self.assertNotIn("id-veille", api.config["fabriqueAgentsDocuments"])
        self.assertNotIn("id-seo-local-geo", api.config["fabriqueAgentsDocuments"])
        for slug in self.agents.keys() - VIDEO:
            self.assertNotIn(f"id-{slug}", api.config["fabriqueAgentsVideo"])
        self.assertEqual(sorted(api.config["fabriqueAgentsImage"]), sorted(f"id-{s}" for s in IMAGE))
        self.assertNotIn("id-stratege", api.config["fabriqueAgentsImage"])
        self.assertNotIn("fabriqueRolesDocuments", api.config)
        self.assertNotIn("fabriqueRolesVideo", api.config)
        self.assertEqual(api.config["autre"], 1)

    def test_voir_rendu_seulement_au_relecteur_avec_son_dossier_de_rendus(self):
        # Lot 3 qualité des visuels : le relecteur reçoit voir_rendu (et son dossier dans sa configuration Claude),
        # aucun producteur n'a ni l'outil ni de dossier ; le relecteur n'a ni fabriquer_image ni fabriquer_video.
        api = FauxApi({})
        bo.assurer_fabrique(api, CID, self.reg, self.agents)
        self.assertEqual(api.config["fabriqueDossiersRendus"],
                         {f"id-{s}": str(bo.dossiers_agent(CID, s)[1] / "rendus") for s in VOIR})
        noms = [p["name"] for p in api.politiques]
        self.assertIn("relecteur", VOIR)
        self.assertNotIn("atelier-fabrique-interdit:relecteur:voir_rendu", noms)
        self.assertIn("atelier-fabrique-interdit:relecteur:fabriquer_image", noms)
        self.assertIn("atelier-fabrique-interdit:relecteur:fabriquer_video", noms)
        for slug in (VIDEO | IMAGE | DOCUMENTS) - VOIR:
            self.assertIn(f"atelier-fabrique-interdit:{slug}:voir_rendu", noms)
        for agent in self.reg["agents"]:
            reglages = bo.reglages_agent(self.reg, pathlib.Path("/c/cfg"), agent, pathlib.Path("/c/esp"))
            self.assertEqual("Read(//c/cfg/rendus/**)" in reglages["permissions"]["allow"], agent["slug"] in VOIR, agent["slug"])

    def test_sans_politiques_ecrit_la_configuration_et_aucune_politique(self):
        # #65 : une entreprise de service reçoit la liste des agents autorisés, sans les ~2 000 politiques block.
        api = FauxApi({"autre": 1})
        ecritures = bo.assurer_fabrique(api, CID, self.reg, self.agents, politiques=False)
        self.assertEqual((ecritures, api.politiques), (1, []))
        self.assertEqual(set(api.config["fabriqueAgentsDocuments"]), {f"id-{s}" for s in DOCUMENTS})
        self.assertEqual(api.config["autre"], 1)
        self.assertEqual(bo.assurer_fabrique(api, CID, self.reg, self.agents, politiques=False), 0)

    def test_retrait_du_droit_vide_la_liste(self):
        reg2 = copy.deepcopy(self.reg)
        veille = next(a for a in reg2["agents"] if a["slug"] == "veille")
        veille["outils"]["mutation"].append(bo.OUTILS_CLIENT_FABRIQUE["document"])
        reg_service = {"agents": [veille]}
        api = FauxApi({})
        bo.assurer_fabrique(api, CID, reg_service, self.agents, politiques=False)
        self.assertEqual(api.config["fabriqueAgentsDocuments"], ["id-veille"])
        veille["outils"]["mutation"].remove(bo.OUTILS_CLIENT_FABRIQUE["document"])
        self.assertEqual(bo.assurer_fabrique(api, CID, reg_service, self.agents, politiques=False), 1)
        self.assertEqual(api.config["fabriqueAgentsDocuments"], [])
        self.assertEqual(api.politiques, [])

    def test_idempotent(self):
        api = FauxApi({})
        bo.assurer_fabrique(api, CID, self.reg, self.agents)
        ecritures = api.ecritures_config
        nb_politiques = len(api.politiques)
        self.assertEqual(bo.assurer_fabrique(api, CID, self.reg, self.agents), 0)
        self.assertEqual(api.ecritures_config, ecritures)
        self.assertEqual(len(api.politiques), nb_politiques)

    def test_agent_retenu_plus_tard_perd_sa_politique_block(self):
        # « veille » n'est pas retenu : politiques block créées. JB le retient ensuite : elles doivent disparaître.
        api = FauxApi({})
        bo.assurer_fabrique(api, CID, self.reg, self.agents)
        self.assertTrue([p for p in api.politiques if ":veille:" in p["name"]])
        autre = [p["name"] for p in api.politiques if ":veille:" not in p["name"]]
        reg2 = copy.deepcopy(self.reg)
        veille = next(a for a in reg2["agents"] if a["slug"] == "veille")
        veille["outils"]["mutation"].append(bo.OUTILS_CLIENT_FABRIQUE["document"])
        bo.assurer_fabrique(api, CID, reg2, self.agents)
        self.assertIn("id-veille", api.config["fabriqueAgentsDocuments"])
        restantes = [p["name"] for p in api.politiques if ":veille:" in p["name"]]
        # Documents et état de fabrication ouverts ; tout autre outil du plugin (registre) reste interdit à « veille ».
        ouverts = {"fabriquer_document", "etat_fabrication"} | _outils_plugin_de(veille)
        self.assertEqual(sorted(restantes), sorted(f"atelier-fabrique-interdit:veille:{o}" for o in OUTILS_REELS if o not in ouverts))
        self.assertIn("atelier-fabrique-interdit:veille:voir_rendu", restantes)
        self.assertEqual([p["name"] for p in api.politiques if ":veille:" not in p["name"]], autre)
        # Rejeu : plus rien à faire.
        self.assertEqual(bo.assurer_fabrique(api, CID, reg2, self.agents), 0)

    def test_politique_du_meme_nom_retouchee_a_la_main_conservee(self):
        # Revue du 25/10 : on ne supprime que la forme exacte créée par le script, jamais une politique élargie à la main.
        api = FauxApi({})
        bo.assurer_fabrique(api, CID, self.reg, self.agents)
        nom = "atelier-fabrique-interdit:veille:fabriquer_document"
        retouchee = next(p for p in api.politiques if p["name"] == nom)
        retouchee["selectors"] = {"toolName": retouchee["selectors"]["toolName"], "serverName": "autre"}
        reg2 = copy.deepcopy(self.reg)
        veille = next(a for a in reg2["agents"] if a["slug"] == "veille")
        veille["outils"]["mutation"].append(bo.OUTILS_CLIENT_FABRIQUE["document"])
        bo.assurer_fabrique(api, CID, reg2, self.agents)
        self.assertIn(nom, [p["name"] for p in api.politiques])
        self.assertNotIn("atelier-fabrique-interdit:veille:etat_fabrication", [p["name"] for p in api.politiques])

    def test_tout_outil_du_plugin_non_autorise_est_bloque(self):
        # DOC-A1 : un futur outil du plugin reçoit une politique block pour chaque agent qui ne l'a pas en autorisation
        # explicite (ici tous sauf veille) ; les politiques des trois outils de la fabrique ne changent pas.
        reg2 = copy.deepcopy(self.reg)
        veille = next(a for a in reg2["agents"] if a["slug"] == "veille")
        veille["outils"]["recherche"].append(bo.nom_client_outil_plugin("outil_futur"))
        temoin = FauxApi({})
        bo.assurer_fabrique(temoin, CID, reg2, self.agents)
        api = FauxApi({})
        with mock.patch.object(bo, "outils_plugin", return_value=OUTILS_REELS + ["outil_futur"]):
            bo.assurer_fabrique(api, CID, reg2, self.agents)
            self.assertEqual(bo.assurer_fabrique(api, CID, reg2, self.agents), 0, "rejeu : rien à écrire")
        futur = {p["name"]: p for p in api.politiques if p["name"].endswith(":outil_futur")}
        self.assertEqual(set(futur), {f"atelier-fabrique-interdit:{s}:outil_futur" for s in self.agents if s != "veille"})
        p = futur["atelier-fabrique-interdit:contenus:outil_futur"]
        self.assertEqual((p["policyType"], p["selectors"], p["conditions"]),
                         ("block", {"toolName": f"{bo.PLUGIN_CLE}:outil_futur"}, {"actor": {"agentId": "id-contenus"}}))
        self.assertEqual(sorted(n for n in (q["name"] for q in api.politiques) if n not in futur),
                         sorted(q["name"] for q in temoin.politiques))


class TestOutilsPlugin(unittest.TestCase):
    """DOC-A1 : liste des outils enregistrés par le plugin, lue dans ses sources (lecture seule)."""

    @staticmethod
    def plugin(dossier, worker, contrats=""):
        src = pathlib.Path(dossier) / "src"
        src.mkdir()
        (src / "worker.ts").write_text(worker, encoding="utf-8")
        (src / "contrats.ts").write_text(contrats, encoding="utf-8")
        return pathlib.Path(dossier)

    def test_outils_du_worker_reel(self):
        self.assertEqual(sorted(bo.outils_plugin()), sorted(OUTILS_REELS))

    def test_manifeste_reel(self):
        # Revue de sécurité 2, B-6 : le manifeste déclare la liste qui fait foi.
        self.assertEqual(sorted(bo.outils_manifeste()), sorted(OUTILS_REELS))

    def test_enregistrement_dans_un_tsx_vu(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.plugin(d, "")
            (p / "src" / "vue.tsx").write_text('ctx.tools.register("outil_tsx", m, f);\n', encoding="utf-8")
            self.assertEqual(bo.outils_plugin(p), ["outil_tsx"])

    def test_manifeste_absent_ou_illisible_refuse(self):
        for manifeste in (None, "export default { name: 'x' };\n", "export default { tools: [inconnu] };\n"):
            with self.subTest(manifeste=manifeste), tempfile.TemporaryDirectory() as d:
                p = self.plugin(d, "")
                if manifeste is not None:
                    (p / "src" / "manifest.ts").write_text(manifeste, encoding="utf-8")
                with self.assertRaises(ValueError):
                    bo.outils_manifeste(p)

    def test_litteral_et_constante_resolus(self):
        with tempfile.TemporaryDirectory() as d:
            p = self.plugin(d, 'ctx.tools.register("outil_futur", m, f);\nctx.tools.register(DECL.name, m, f);\n',
                            'export const NOM = "par_constante" as const;\n'
                            'export const DECL: PluginToolDeclaration = {\n  name: NOM,\n};\n')
            self.assertEqual(bo.outils_plugin(p), ["outil_futur", "par_constante"])

    def test_enregistrement_non_resolu_refuse(self):
        # Un nom qu'on ne sait pas lire ne doit jamais passer en silence : erreur, pas liste incomplète.
        for worker in ("for (const d of liste) ctx.tools.register(d.name, m, f);\n",
                       "ctx.tools.register(inconnu, m, f);\n",
                       "ctx.tools.register(`gabarit`, m, f);\n",
                       "ctx.tools.register(nomSeul);\n"):
            with self.subTest(worker=worker), tempfile.TemporaryDirectory() as d:
                with self.assertRaises(ValueError):
                    bo.outils_plugin(self.plugin(d, worker))
        with tempfile.TemporaryDirectory() as d, self.assertRaises(ValueError):
            bo.outils_plugin(pathlib.Path(d))  # plugin absent : jamais une liste vide qui laisserait tout passer


class TestControleOutilsPlugin(unittest.TestCase):
    """DOC-A1 : verifier-organisation refuse un outil du plugin non classé pour un rôle à règle nue."""

    def setUp(self):
        vo.erreurs.clear()
        vo.infos.clear()
        reg = json.loads((RACINE / "organisation" / "registre" / "agents.json").read_text(encoding="utf-8"))
        self.nus = sorted(a["slug"] for a in reg["agents"]
                          if vo.OUTIL_SERVEUR_CONNEXIONS in set(a["outils"]["recherche"]) | set(a["outils"]["mutation"]))

    def test_registre_reel_tout_classe(self):
        self.assertTrue(self.nus, "au moins un rôle a la règle nue")
        vo.controler_outils_plugin(bo)
        self.assertEqual(vo.erreurs, [])

    def test_outil_futur_non_classe_refuse(self):
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "plugin-atelier").mkdir()
            p = TestOutilsPlugin.plugin(pathlib.Path(d) / "plugin-atelier", 'ctx.tools.register("outil_futur", m, f);\n')
            (p / "src" / "manifest.ts").write_text('export default { tools: [{ name: "outil_futur" }] };\n', encoding="utf-8")
            with mock.patch.object(vo, "RACINE", pathlib.Path(d)):
                vo.controler_outils_plugin(bo)
        self.assertEqual(sorted(e.split(" ")[1] for e in vo.erreurs), self.nus)
        self.assertTrue(all(bo.nom_client_outil_plugin("outil_futur") in e for e in vo.erreurs), vo.erreurs)

    def test_ecart_entre_code_et_manifeste_refuse(self):
        # B-6 : un outil déclaré au manifeste mais jamais vu dans le code (appel indirect) est une erreur, pas un oubli.
        with tempfile.TemporaryDirectory() as d:
            (pathlib.Path(d) / "plugin-atelier").mkdir()
            p = TestOutilsPlugin.plugin(pathlib.Path(d) / "plugin-atelier", 'ctx.tools.register("vu", m, f);\n')
            (p / "src" / "manifest.ts").write_text('export default { tools: [{ name: "vu" }, { name: "cache" }] };\n',
                                                   encoding="utf-8")
            with mock.patch.object(vo, "RACINE", pathlib.Path(d)):
                vo.controler_outils_plugin(bo)
        self.assertTrue(any("manifeste" in e and "cache" in e for e in vo.erreurs), vo.erreurs)


if __name__ == "__main__":
    unittest.main(verbosity=2)
