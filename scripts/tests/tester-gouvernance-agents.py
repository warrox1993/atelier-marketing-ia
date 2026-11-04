#!/usr/bin/env python3
"""Tests des gestes de gouvernance du bootstrap (lot S, 30/10/2026), sans instance : API simulée en mémoire.

- N3 : portée d'assignation (soi, sous-arbre, destinataires déclarés) et recoupement des transferts écrits dans les
  consignes avec ceux du registre ;
- M3 : politique de skills d'entreprise en refus par défaut pour les agents ;
- V2-5 : cartes de question et de confirmation résolues par un humain seulement ;
- CV-1 : filesystemExtraPaths et filesystemSandboxCommand surveillés par derives_configuration.

À lancer : python3 -I scripts/tests/tester-gouvernance-agents.py
"""
import atexit
import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

os.environ["ATELIER_DONNEES_LOCALES"] = tempfile.mkdtemp(prefix="atelier-test-gouvernance-")
atexit.register(shutil.rmtree, os.environ["ATELIER_DONNEES_LOCALES"], ignore_errors=True)  # /tmp est en mémoire vive : rien ne reste
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

CID = "11111111-1111-4111-8111-111111111111"
VERBE_TRANSFERT = re.compile(r"(?i)(\bvers\b|transmission à|transmet|remonte au)")
# Lignes qui citent un agent avec un verbe de transfert sans être un transfert par sous-tâche (motif à côté).
NON_TRANSFERTS = {
    ("sav-sinistres", "ouverture-sinistres"): {"sinistres-particuliers", "sinistres-entreprises"},  # transfert proposé au coordinateur
    ("qualite", "non-conformites"): {"procedures"},  # propositions livrées au coordinateur
    ("partenariats", "suivi-partenaires"): {"recherche-selection", "accords", "co-marketing", "fournisseurs-produits"},  # frontières
}


def transferts_ecrits(fichier: Path, slug: str, collegues: set[str]) -> set[str]:
    """Agents vers lesquels la consigne (hors consignes communes) dit transférer ; « par la porte » = redispatch du plugin."""
    corps = fichier.read_text(encoding="utf-8").split(bo.MARQUEUR_CONSIGNES_COMMUNES)[0]
    trouves = set()
    for ligne in corps.splitlines():
        if not VERBE_TRANSFERT.search(ligne):
            continue
        for m in re.finditer(r"`([a-z0-9-]+)`( par la porte)?", ligne):
            if m.group(1) in collegues and m.group(1) != slug and not m.group(2):
                trouves.add(m.group(1))
        if re.search(r"remonte au \S*directeur\S* par une sous-tâche", ligne):
            trouves.add("directeur")
    return trouves


def charger_agents() -> dict:
    return json.loads(bo.REGISTRE_AGENTS.read_text(encoding="utf-8"))


def agents_api(reg_agents: dict) -> dict[str, dict]:
    return {a["slug"]: {"id": f"id-{a['slug']}", "name": a["nom"]} for a in reg_agents["agents"]}


class FauxApi:
    def __init__(self, details=None, politique=None, entreprise=None):
        self.details = details or {}
        self.politique = politique or {"schemaVersion": 1, "revision": 0, "defaultEffect": "allow", "rules": [], "materialized": False}
        self.entreprise = entreprise or {"id": CID}
        self.ecritures = []

    def get(self, chemin):
        if chemin.startswith("/agents/"):
            return self.details.get(chemin.split("/")[2], {"permissions": {}, "access": {"grants": []}})
        if chemin == f"/companies/{CID}/skill-policy":
            return self.politique
        if chemin == f"/companies/{CID}":
            return self.entreprise
        raise AssertionError(f"lecture non prévue : {chemin}")

    def appel(self, methode, chemin, corps=None):
        self.ecritures.append((methode, chemin, corps))
        return {}


class RecoupementTransferts(unittest.TestCase):
    def test_transferts_des_consignes_tous_declares_dans_le_registre(self):
        for svc in bo.registre_services()["services"]:
            collegues = set(svc["agents"])
            declares = svc.get("transferts", {})
            self.assertLessEqual(set(declares), collegues, svc["slug"])
            for slug in svc["agents"]:
                fichier = bo.ORGA / "services" / svc["slug"] / "agents" / slug / "AGENTS.md"
                if slug == svc["coordinateur"] or slug == svc.get("coordinateurGeneral") or not fichier.is_file():
                    continue  # le coordinateur (ceo) assigne partout ; un déterministe n'a pas de consigne
                ecrits = transferts_ecrits(fichier, slug, collegues) - NON_TRANSFERTS.get((svc["slug"], slug), set())
                with self.subTest(service=svc["slug"], agent=slug):
                    self.assertEqual(ecrits, set(declares.get(slug, [])))

    def test_transferts_marketing_declares_dans_le_registre_des_agents(self):
        reg = charger_agents()
        collegues = {a["slug"] for a in reg["agents"]}
        for a in reg["agents"]:
            fichier = bo.ORGA / "agents" / a["slug"] / "AGENTS.md"
            if a["role"] == "ceo" or not fichier.is_file():
                continue
            with self.subTest(agent=a["slug"]):
                self.assertEqual(transferts_ecrits(fichier, a["slug"], collegues), set(a.get("transmetA", [])))

    def test_observatoire_les_neuf_transferts_attendus(self):
        obs = next(s for s in bo.registre_services()["services"] if s["slug"] == "observatoire")
        self.assertEqual(len(obs["transferts"]), 7)
        # OBS-4 (paquet OA2) : l'analyste rend sa sous-tâche, la rédaction démarre par blockedByIssueIds ; les chapitres
        # d'intégration, de sécurité et d'essai sont demandés au directeur.
        self.assertNotIn("analyste-technique", obs["transferts"])
        # T7 (paquet OA2) : la sous-tâche « Version anglaise » est créée par confier.py, plus par le rédacteur ;
        # relecteur-independant : par la porte.
        self.assertNotIn("redacteur-en-chef", obs["transferts"])


class PorteesAssignation(unittest.TestCase):
    def test_service_soi_et_destinataires_declares_ni_ceo_ni_deterministe(self):
        svc = next(s for s in bo.registre_services()["services"] if s["slug"] == "observatoire")
        agents, _, _ = bo.agents_service(charger_agents(), svc)
        reg = bo.reg_agents_service(charger_agents(), agents)
        portees = bo.portees_assignation(reg, agents_api(reg))
        self.assertEqual(portees["analyste-comparatif"], sorted(["id-analyste-comparatif", "id-redacteur-en-chef", "id-directeur"]))
        # OBS-4 : l'analyste technique ne déclare plus de destinataire, il garde la portée par défaut du socle.
        for absent in ("directeur", "porte", "relecteur-independant", "adaptateur-anglais", "analyste-technique"):
            self.assertNotIn(absent, portees)

    def test_marketing_sous_arbre_compris(self):
        reg = charger_agents()
        for a in reg["agents"]:
            if a["slug"] == "relecteur":
                a["transmetA"] = ["stratege"]  # le relecteur a des subordonnés : ils restent dans sa portée
        portees = bo.portees_assignation(reg, agents_api(reg))
        self.assertEqual(portees["exigences"], ["id-exigences", "id-stratege"])
        self.assertEqual(portees["mesure"], ["id-mesure", "id-stratege"])
        self.assertEqual(portees["relecteur"], sorted(f"id-{s}" for s in ("relecteur", "exigences", "tests-techniques", "porte", "conformite-publicitaire", "stratege")))
        self.assertNotIn("coordinateur", portees)

    def test_sous_arbre_sur_plusieurs_niveaux(self):
        fiche = lambda slug, chef, **k: {"slug": slug, "nom": slug, "role": "general", "rapporteA": chef, **k}
        reg = {"agents": [fiche("chef", None, role="ceo"), fiche("pole", "chef", transmetA=["voisin"]),
                          fiche("equipe", "pole"), fiche("membre", "equipe"), fiche("voisin", "chef")]}
        self.assertEqual(bo.portees_assignation(reg, agents_api(reg)),
                         {"pole": ["id-equipe", "id-membre", "id-pole", "id-voisin"]})

    def test_destinataire_absent_refuse(self):
        reg = charger_agents()
        api = agents_api(reg)
        del api["stratege"]
        with self.assertRaises(bo.ErreurAtelier):
            bo.portees_assignation(reg, api)

    def test_patch_garde_les_permissions_et_est_idempotent(self):
        reg = charger_agents()
        details = {"id-mesure": {"permissions": {"canCreateAgents": False}, "access": {"grants": [
            {"permissionKey": "tasks:assign", "scope": None},
            {"permissionKey": "tasks:assign_scope", "scope": {"subtreeRootAgentId": "id-mesure"}}]}}}
        api = FauxApi(details)
        self.assertEqual(bo.assurer_portees_assignation(api, reg, agents_api(reg)), 2)
        corps = {chemin: c for _, chemin, c in api.ecritures}
        self.assertEqual(corps["/agents/id-mesure/permissions"],
                         {"canCreateAgents": False, "canAssignTasks": True, "assignableAgentIds": ["id-mesure", "id-stratege"]})
        self.assertFalse(corps["/agents/id-exigences/permissions"]["canAssignTasks"])  # aucun grant large : il n'en reçoit pas
        details["id-mesure"]["access"]["grants"][1]["scope"] = {"assigneeAgentIds": ["id-stratege", "id-mesure"]}
        details["id-exigences"] = {"permissions": {}, "access": {"grants": [
            {"permissionKey": "tasks:assign_scope", "scope": {"assigneeAgentIds": ["id-exigences", "id-stratege"]}}]}}
        api2 = FauxApi(details)
        self.assertEqual(bo.assurer_portees_assignation(api2, reg, agents_api(reg)), 0)
        self.assertEqual(api2.ecritures, [])


    def test_portee_perimee_ramenee_au_sous_arbre(self):
        """OA2 / P-PORTEE : un agent qui ne déclare plus de destinataire (redacteur-en-chef depuis 9157f82, analyste-technique
        depuis 7d28e28) ne garde pas l'ancien grant posé par le bootstrap. Depuis le patch 0128 du socle, assignableAgentIds: null
        rétablit la portée par défaut {subtreeRootAgentId} (lui-même et son sous-arbre, dynamique) : plus de liste figée."""
        svc = next(s for s in bo.registre_services()["services"] if s["slug"] == "observatoire")
        agents, _, _ = bo.agents_service(charger_agents(), svc)
        reg = bo.reg_agents_service(charger_agents(), agents)
        perimee = lambda *ids: {"permissions": {}, "access": {"grants": [
            {"permissionKey": "tasks:assign", "scope": None},
            {"permissionKey": "tasks:assign_scope", "scope": {"assigneeAgentIds": list(ids)}}]}}
        details = {
            "id-redacteur-en-chef": perimee("id-redacteur-en-chef", "id-adaptateur-anglais", "id-relecteur-independant"),
            "id-analyste-technique": perimee("id-analyste-technique", "id-redacteur-en-chef", "id-auditeur-securite"),
            "id-directeur": perimee("id-directeur", "id-porte"),  # ceo : jamais touché
            "id-porte": perimee("id-porte", "id-directeur"),  # déterministe : jamais touché
            "id-adaptateur-anglais": {"permissions": {}, "access": {"grants": [  # portée par défaut du socle : gardée
                {"permissionKey": "tasks:assign_scope", "scope": {"subtreeRootAgentId": "id-adaptateur-anglais"}}]}},
        }
        api = FauxApi(details)
        bo.assurer_portees_assignation(api, reg, agents_api(reg))
        corps = {chemin: c for _, chemin, c in api.ecritures}
        self.assertEqual(corps["/agents/id-redacteur-en-chef/permissions"],
                         {"canCreateAgents": False, "canAssignTasks": True, "assignableAgentIds": None})
        self.assertEqual(corps["/agents/id-analyste-technique/permissions"]["assignableAgentIds"], None)
        for intact in ("directeur", "porte", "adaptateur-anglais"):
            self.assertNotIn(f"/agents/id-{intact}/permissions", corps, intact)
        # Liste figée d'un passage d'avant le patch 0128 (lui-même seul) : remplacée par la portée par défaut.
        details["id-redacteur-en-chef"] = perimee("id-redacteur-en-chef")
        api_fige = FauxApi(details)
        bo.assurer_portees_assignation(api_fige, reg, agents_api(reg))
        self.assertIn(("PATCH", "/agents/id-redacteur-en-chef/permissions",
                       {"canCreateAgents": False, "canAssignTasks": True, "assignableAgentIds": None}), api_fige.ecritures)
        # Second passage, portées ramenées au défaut du socle : rien n'est réécrit pour eux.
        defaut = lambda i: {"permissions": {}, "access": {"grants": [
            {"permissionKey": "tasks:assign", "scope": None}, {"permissionKey": "tasks:assign_scope", "scope": {"subtreeRootAgentId": i}}]}}
        details["id-redacteur-en-chef"] = defaut("id-redacteur-en-chef")
        details["id-analyste-technique"] = defaut("id-analyste-technique")
        api2 = FauxApi(details)
        bo.assurer_portees_assignation(api2, reg, agents_api(reg))
        ramenes = {"/agents/id-redacteur-en-chef/permissions", "/agents/id-analyste-technique/permissions"}
        self.assertEqual([c for _, c, _ in api2.ecritures if c in ramenes], [])

    def test_sous_arbre_garde_ses_subordonnes(self):
        fiche = lambda slug, chef, **k: {"slug": slug, "nom": slug, "role": "general", "rapporteA": chef, **k}
        reg = {"agents": [fiche("chef", None, role="ceo"), fiche("pole", "chef"), fiche("equipe", "pole"), fiche("membre", "equipe")]}
        api = FauxApi({"id-pole": {"permissions": {}, "access": {"grants": [
            {"permissionKey": "tasks:assign_scope", "scope": {"assigneeAgentIds": ["id-pole", "id-chef"]}}]}}})
        self.assertEqual(bo.assurer_portees_assignation(api, reg, agents_api(reg)), 1)
        self.assertIsNone(api.ecritures[0][2]["assignableAgentIds"])  # sous-arbre dynamique du socle (patch 0128)


class PolitiqueSkills(unittest.TestCase):
    def test_posee_si_absente_avec_refus_des_agents_avant_le_board(self):
        api = FauxApi()
        self.assertEqual(bo.assurer_politique_skills(api, CID), "posée")
        [(methode, chemin, corps)] = api.ecritures
        self.assertEqual((methode, chemin), ("PUT", f"/companies/{CID}/skill-policy"))
        self.assertEqual(corps["expectedRevision"], 0)
        self.assertEqual(corps["defaultEffect"], "deny")
        regles = sorted(corps["rules"], key=lambda r: r["priority"])
        self.assertEqual((regles[0]["effect"], regles[0]["subject"]), ("deny", {"type": "all_agents"}))
        self.assertEqual((regles[1]["effect"], regles[1]["subject"]), ("allow", {"type": "roles", "roles": ["board"]}))
        for r in regles:
            self.assertEqual(len(r["actions"]), 8)

    def test_deja_en_place_rien_n_est_ecrit(self):
        api = FauxApi(politique={**bo.POLITIQUE_SKILLS, "revision": 3, "materialized": True})
        self.assertEqual(bo.assurer_politique_skills(api, CID), "déjà en place")
        self.assertEqual(api.ecritures, [])

    def test_politique_retouchee_a_la_main_gardee(self):
        api = FauxApi(politique={"schemaVersion": 1, "revision": 2, "defaultEffect": "allow", "rules": [], "materialized": True})
        with contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(bo.assurer_politique_skills(api, CID), "gardée")
        self.assertEqual(api.ecritures, [])
        self.assertIn("modifiée à la main", err.getvalue())


class GouvernanceCartes(unittest.TestCase):
    def test_plafond_humain_fusionne_sans_perdre_les_autres_reglages(self):
        api = FauxApi(entreprise={"id": CID, "interactionResolverGovernance": {
            "suggest_tasks": {"defaultPolicy": "anyone"}, "request_confirmation": {"defaultPolicy": "not_creator"}}})
        self.assertTrue(bo.assurer_gouvernance_cartes(api, CID))
        [(methode, chemin, corps)] = api.ecritures
        self.assertEqual((methode, chemin), ("PATCH", f"/companies/{CID}"))
        self.assertEqual(corps["interactionResolverGovernance"], {
            "suggest_tasks": {"defaultPolicy": "anyone"},
            "ask_user_questions": {"cap": "human_only"},
            "request_confirmation": {"defaultPolicy": "not_creator", "cap": "human_only"},
            "request_checkbox_confirmation": {"cap": "human_only"},
        })

    def test_idempotent(self):
        voulue = {genre: {"cap": "human_only"} for genre in bo.CARTES_HUMAINES}
        api = FauxApi(entreprise={"id": CID, "interactionResolverGovernance": voulue})
        self.assertFalse(bo.assurer_gouvernance_cartes(api, CID))
        self.assertEqual(api.ecritures, [])


class DerivesCage(unittest.TestCase):
    def test_chemins_et_commande_de_la_cage_surveilles(self):
        reg = charger_agents()
        agent = next(a for a in reg["agents"] if a["slug"] == "mesure")
        agents = {a["slug"]: {"id": f"id-{a['slug']}"} for a in reg["agents"]}
        attendu = bo.construire_extension(reg, {"entreprise": {"approbationHumainePourNouveauxAgents": True},
                                                "projets": [], "routines": []})["agents"]["mesure"]["adapter"]["config"]
        d = {"name": agent["nom"], "title": agent["titre"], "role": agent["role"],
             "budgetMonthlyCents": agent["budgetMensuelCentimes"], "reportsTo": agents[agent["rapporteA"]]["id"],
             "runtimeConfig": {"heartbeat": {"maxConcurrentRuns": reg["adaptateur"]["maxConcurrentRuns"],
                                             "maxDailyRuns": reg["adaptateur"]["maxRunsParJour"]}},
             "adapterConfig": {**attendu, "paperclipSkillSync": {"desiredSkills": list(agent["competences"])}}}
        self.assertEqual(bo.derives_configuration(CID, d, agent, reg, agents, "reel"), [])
        for cle, valeur in (("filesystemExtraPaths", [{"path": "/", "access": "rw"}]), ("filesystemSandboxCommand", "/bin/true")):
            retouche = json.loads(json.dumps(d))
            retouche["adapterConfig"][cle] = valeur
            self.assertEqual(bo.derives_configuration(CID, retouche, agent, reg, agents, "reel"), [f"adapterConfig.{cle}"])

    def test_rotation_de_session_surveillee(self):
        # T3 : la rotation de session posée par le registre est réalignée par « appliquer » ; absente, rien n'est exigé.
        reg = charger_agents()
        agent = {**next(a for a in reg["agents"] if a["slug"] == "mesure"), "sessionsParRotation": 3}
        agents = {a["slug"]: {"id": f"id-{a['slug']}"} for a in reg["agents"]}
        attendu = bo.construire_extension({**reg, "agents": [agent if a["slug"] == "mesure" else a for a in reg["agents"]]},
                                          {"entreprise": {"approbationHumainePourNouveauxAgents": True}, "projets": [], "routines": []})["agents"]["mesure"]
        d = {"name": agent["nom"], "title": agent["titre"], "role": agent["role"],
             "budgetMonthlyCents": agent["budgetMensuelCentimes"], "reportsTo": agents[agent["rapporteA"]]["id"],
             "runtimeConfig": attendu["runtime"],
             "adapterConfig": {**attendu["adapter"]["config"], "paperclipSkillSync": {"desiredSkills": list(agent["competences"])}}}
        self.assertEqual(d["runtimeConfig"]["heartbeat"]["sessionCompaction"], {"enabled": True, "maxSessionRuns": 3})
        self.assertEqual(bo.derives_configuration(CID, d, agent, reg, agents, "reel"), [])
        sans = json.loads(json.dumps(d))
        del sans["runtimeConfig"]["heartbeat"]["sessionCompaction"]
        self.assertEqual(bo.derives_configuration(CID, sans, agent, reg, agents, "reel"), ["runtimeConfig.heartbeat.sessionCompaction"])
        ordinaire = next(a for a in reg["agents"] if a["slug"] == "mesure")
        self.assertEqual(bo.derives_configuration(CID, sans, ordinaire, reg, agents, "reel"), [])


class FuiteTmp(unittest.TestCase):
    """AFC-A17 (fuite /tmp, autres suites) : un lancement ne laisse aucun dossier dans /tmp, qui est en mémoire vive."""

    def test_lancement_ne_laisse_rien_dans_tmp(self):
        # Un TMPDIR neuf isole le compte des dossiers des autres agents ; le dernier lancement échoue exprès.
        import os
        import subprocess
        import tempfile
        env = {k: v for k, v in os.environ.items() if k != "ATELIER_DONNEES_LOCALES"}
        for noms in (["RecoupementTransferts.test_observatoire_les_neuf_transferts_attendus"], ["FuiteTmp.test_inexistant"]):
            with tempfile.TemporaryDirectory() as tmp:
                fini = subprocess.run([sys.executable, "-I", __file__, *noms], env={**env, "TMPDIR": tmp},
                                      capture_output=True, text=True, check=False)
                self.assertEqual(fini.returncode != 0, noms[0].endswith("inexistant"), fini.stderr[-500:])
                self.assertEqual(os.listdir(tmp), [], noms)


if __name__ == "__main__":
    unittest.main()
