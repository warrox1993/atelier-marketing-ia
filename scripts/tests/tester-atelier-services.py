#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests du registre des services (python3 -I scripts/tests/tester-atelier-services.py)."""

import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("atelier_services", RACINE / "scripts" / "atelier_services.py")
svc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(svc)


def minimal():
    def service(slug, pre, sensible=False):
        s = {"slug": slug, "nom": slug.title(), "prefixe": pre, "actif": True, "description": "a\nb",
             "coordinateur": f"coord-{slug}", "agents": [f"coord-{slug}", f"autre-{slug}"],
             "humainSeul": ["x"], "obligations": ["y"], "donnees": ["z"]}
        if sensible:
            s["sensible"] = True
        return s
    direction = service("direction", "DIR")
    direction["coordinateurGeneral"] = "general"
    direction["agents"].insert(0, "general")
    return {"services": [service("aaa", "AAA"), service("bbb", "BBB", True), direction],
            "flux": [{"source": "aaa", "cible": "direction", "objet": "rapport", "approbationHumaine": False}]}


_spec_d = importlib.util.spec_from_file_location("declarer_services", RACINE / "scripts" / "declarer-services.py")
declarer = importlib.util.module_from_spec(_spec_d)
_spec_d.loader.exec_module(declarer)


class TestFichierReel(unittest.TestCase):
    def test_valide(self):
        reg = svc.charger_services()
        self.assertEqual(svc.valider(reg), [])

    def test_contenu_attendu(self):
        reg = svc.charger_services()
        # Usine complète (16/10/2026) : 14 services d'origine + 14 ajoutés, puis l'Observatoire (26/10/2026), liste exacte.
        attendus = {
            "marketing", "direction", "administratif", "juridique", "commercial", "recouvrement",
            "sav-sinistres", "commerce-exterieur", "conformite", "comptabilite-finance",
            "ressources-humaines", "informatique", "achats", "qualite",
            "logistique", "production", "recherche-innovation", "communication", "service-client",
            "fiscalite", "gestion-projets", "hse", "formation", "juridique-social", "donnees-bi",
            "evenementiel", "services-generaux", "partenariats", "observatoire",
        }
        self.assertEqual(len(reg["services"]), 29)
        self.assertEqual({s["slug"] for s in reg["services"]}, attendus)
        self.assertTrue(all(s["actif"] is True for s in reg["services"]))
        marketing = next(s for s in reg["services"] if s["slug"] == "marketing")
        with open(RACINE / "organisation/registre/agents.json", encoding="utf-8") as f:
            agents_reels = [a["slug"] for a in json.load(f)["agents"]]
        self.assertEqual(marketing["agents"], agents_reels)
        slugs = {s["slug"] for s in reg["services"]}
        for autre in slugs - {"direction"}:
            self.assertTrue(any(f["source"] == autre and f["cible"] == "direction" for f in reg["flux"]), autre)

    def test_cli(self):
        self.assertEqual(svc.main(["verifier"]), 0)

    def test_coordinateur_general_direction(self):
        reg = svc.charger_services()
        direction = next(s for s in reg["services"] if s["slug"] == "direction")
        self.assertEqual(direction["coordinateurGeneral"], "coordinateur-general")
        self.assertEqual(direction["coordinateur"], "coordinateur-direction")
        self.assertEqual(direction["agents"][0], "coordinateur-general")
        self.assertEqual([s["slug"] for s in reg["services"] if "coordinateurGeneral" in s], ["direction"])
        self.assertTrue((RACINE / "organisation/services/direction/agents/coordinateur-general/AGENTS.md").is_file())

    def test_reseau_coordinateurs_reel(self):
        # Toutes les paires ordonnées de services distincts : 29 x 28 = 812, dont 122 flux métier et 690 générés.
        reg = svc.charger_services()
        n = len(reg["services"])
        generes = svc.flux_coordinateurs(reg)
        complets = svc.flux_complets(reg)
        self.assertEqual(len(reg["flux"]), 122)
        self.assertEqual(len(generes), n * (n - 1) - 122)
        self.assertEqual(len(generes), 690)
        paires = [(f["source"], f["cible"]) for f in complets]
        self.assertEqual(len(paires), len(set(paires)), "aucune paire déclarée deux fois")
        self.assertEqual(set(paires), {(a["slug"], b["slug"]) for a in reg["services"] for b in reg["services"] if a is not b})
        # Le registre ne liste aucun flux généré : ils naissent seulement de la liste des services.
        self.assertFalse(any("protocole-inter-coordinateurs" in f["objet"] for f in reg["flux"]))
        # Règle sensible inchangée : tout flux qui touche un service sensible exige l'approbation humaine.
        sensibles = {s["slug"] for s in reg["services"] if s.get("sensible")}
        self.assertEqual(sensibles, {"juridique", "ressources-humaines", "fiscalite", "hse", "juridique-social", "conformite", "sav-sinistres"})
        for f in complets:
            if f["source"] in sensibles or f["cible"] in sensibles:
                self.assertTrue(f["approbationHumaine"], f)
        for f in generes:
            self.assertEqual(f["approbationHumaine"], f["source"] in sensibles or f["cible"] in sensibles, f)
            self.assertEqual(f["origine"], "coordinateur-general" if "direction" in (f["source"], f["cible"]) else "coordinateurs")
            self.assertLessEqual(len(f["objet"]), 200)
        # Le coordinateur général (Direction) joint chaque service et chaque service le joint.
        autres = {s["slug"] for s in reg["services"]} - {"direction"}
        self.assertEqual({f["cible"] for f in complets if f["source"] == "direction"}, autres)
        self.assertEqual({f["source"] for f in complets if f["cible"] == "direction"}, autres)
        # Les flux métier gardent leur objet et leur approbation.
        self.assertEqual(complets[:122], [{**f, "origine": "metier"} for f in reg["flux"]])


class TestDeclaration(unittest.TestCase):
    """Corps envoyé à services.declarer : réseau des coordinateurs compris, jamais un service hors du client."""

    def local(self, slug, services):
        return {"slug": slug, "entreprises": {s: {"entrepriseId": f"{slug}-{s}"} for s in services}}

    def test_client_complet(self):
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        tous = [s["slug"] for s in reg["services"]]
        corps = declarer.construire_corps(reg, self.local("trio", tous))
        self.assertEqual(len(corps["flux"]), 812)
        self.assertLessEqual(len(corps["flux"]), 40 * 39, "borne du contrat FluxService du plugin")
        self.assertTrue(all(set(f) == {"source", "cible", "objet", "approbationHumaine", "origine"} for f in corps["flux"]))
        # L'origine déclarée au plugin sépare le métier du réseau des coordinateurs (614 + 24 générés).
        self.assertEqual(sum(f["origine"] == "metier" for f in corps["flux"]), 122)
        self.assertEqual(sum(f["origine"] == "coordinateurs" for f in corps["flux"]), 690)
        self.assertTrue(all((f["origine"] == "coordinateurs") == ("protocole-inter-coordinateurs" in f["objet"]) for f in corps["flux"]))

    def test_sous_ensemble_du_client(self):
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        corps = declarer.construire_corps(reg, self.local("duo", ["marketing", "direction", "juridique"]))
        paires = {(f["source"], f["cible"]) for f in corps["flux"]}
        self.assertEqual(paires, {(a, b) for a in ("marketing", "direction", "juridique") for b in ("marketing", "direction", "juridique") if a != b})
        presents = {"marketing", "direction", "juridique"}
        self.assertTrue(all(f["source"] in presents and f["cible"] in presents for f in corps["flux"]))
        for f in corps["flux"]:
            if "juridique" in (f["source"], f["cible"]):
                self.assertTrue(f["approbationHumaine"], f)
        self.assertEqual({e["serviceSlug"] for e in corps["entreprises"] if e["estDirection"]}, {"direction"})

    def test_route_depuis_la_direction(self):
        # M1 : le plugin n'accepte comme Direction que l'entreprise de la route (ou une entreprise déjà déclarée).
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        corps = declarer.construire_corps(reg, self.local("duo", ["marketing", "direction", "juridique"]))
        self.assertEqual(corps["companyId"], "duo-direction")
        sans = declarer.construire_corps(reg, self.local("solo", ["marketing", "juridique"]))
        self.assertEqual(sans["companyId"], "solo-marketing")

    def test_confirmation_de_chaque_entreprise_apres_la_declaration(self):
        # E1 (revue du 19/10/2026) : seule l'entreprise de la route compte tout de suite ; les autres sont confirmées une à une,
        # chacune par un appel qui porte SON identifiant (l'hôte en prouve l'accès).
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        corps = declarer.construire_corps(reg, self.local("trio", ["marketing", "direction", "juridique"]))
        ordre = []
        etapes = declarer.etapes_declaration(corps, lambda c: (ordre.append(("declarer", c["companyId"])), "ok")[1], lambda cid: (ordre.append(("confirmer", cid)), "ok")[1])
        self.assertEqual(ordre[0], ("declarer", "trio-direction"))
        self.assertEqual(sorted(cid for quoi, cid in ordre[1:] if quoi == "confirmer"), sorted(e["companyId"] for e in corps["entreprises"]))
        self.assertTrue(all(quoi == "confirmer" for quoi, _ in ordre[1:]))
        self.assertEqual(len(etapes), 2)
        self.assertIn("3 entreprise(s) confirmée(s)", etapes[1])

    def test_deux_temps_si_direction_ajoutee_a_un_client_existant(self):
        import io
        import urllib.error
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        corps = declarer.construire_corps(reg, self.local("duo", ["marketing", "direction"]))
        envois = []
        ordre = []

        def envoyer(c):
            envois.append(c)
            ordre.append(("declarer", c["companyId"]))
            if len(envois) == 1:
                raise urllib.error.HTTPError("x", 403, "refus", {}, io.BytesIO(b"{}"))
            return "ok"

        def confirmer(cid):
            ordre.append(("confirmer", cid))
            return "ok"
        self.assertEqual(len(declarer.etapes_declaration(corps, envoyer, confirmer)), 4)
        self.assertEqual([e["companyId"] for e in envois], ["duo-direction", "duo-marketing", "duo-direction"])
        self.assertFalse(any(x["estDirection"] for x in envois[1]["entreprises"]))
        self.assertEqual(envois[2], corps)
        # La Direction est confirmée AVANT de se déclarer Direction depuis sa propre route (sinon le plugin la refuse).
        confirmees_avant = [cid for quoi, cid in ordre[:ordre.index(("declarer", "duo-direction"), 1)] if quoi == "confirmer"]
        self.assertIn("duo-direction", confirmees_avant)
        # Un autre refus (409, ou 403 sans Direction à la route) remonte tel quel, sans aucune confirmation.
        def refus(c):
            raise urllib.error.HTTPError("x", 409, "conflit", {}, io.BytesIO(b"{}"))

        def pas_de_confirmation(cid):
            raise AssertionError("aucune confirmation après un refus")
        with self.assertRaises(urllib.error.HTTPError):
            declarer.etapes_declaration(corps, refus, pas_de_confirmation)

    def test_deux_clients_jamais_meles(self):
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        a = declarer.construire_corps(reg, self.local("a", ["marketing", "direction"]))
        b = declarer.construire_corps(reg, self.local("b", ["marketing", "commercial"]))
        self.assertEqual({e["companyId"] for e in a["entreprises"]} & {e["companyId"] for e in b["entreprises"]}, set())
        self.assertEqual({(f["source"], f["cible"]) for f in b["flux"]}, {("marketing", "commercial"), ("commercial", "marketing")})
        self.assertEqual((a["clientMarqueur"], b["clientMarqueur"]), ("a", "b"))


class TestRefus(unittest.TestCase):
    def erreurs(self, modif):
        reg = minimal()
        modif(reg)
        return svc.valider(reg)

    def contient(self, erreurs, texte):
        self.assertTrue(any(texte in e for e in erreurs), erreurs)

    def test_base_valide(self):
        self.assertEqual(svc.valider(minimal()), [])

    def test_slug_double(self):
        e = self.erreurs(lambda r: r["services"][1].update(slug="aaa"))
        self.contient(e, "slug en double")

    def test_prefixe_double(self):
        e = self.erreurs(lambda r: r["services"][1].update(prefixe="AAA"))
        self.contient(e, "préfixe en double")

    def test_prefixe_invalide(self):
        for mauvais in ("ab", "abc", "ABCDE", "AB1", "A-B"):
            e = self.erreurs(lambda r, m=mauvais: r["services"][0].update(prefixe=m))
            self.contient(e, "préfixe invalide")

    def test_prefixe_reserve(self):
        e = self.erreurs(lambda r: r["services"][0].update(prefixe="COUA"))
        self.contient(e, "déjà utilisé")

    def test_coordinateur_absent(self):
        e = self.erreurs(lambda r: r["services"][0].update(coordinateur="inconnu"))
        self.contient(e, "absent de la liste des agents")

    def test_nombre_agents(self):
        e = self.erreurs(lambda r: r["services"][0].update(agents=["coord-aaa"]))
        self.contient(e, "2 à 13 agents")
        quatorze = ["coord-aaa"] + [f"specialiste-{i}" for i in range(13)]
        e = self.erreurs(lambda r: r["services"][0].update(agents=quatorze))
        self.contient(e, "2 à 13 agents")
        treize = quatorze[:13]
        e = self.erreurs(lambda r: r["services"][0].update(agents=treize))
        self.assertFalse([x for x in e if "agents attendus" in x], e)

    def test_deterministes(self):
        e = self.erreurs(lambda r: r["services"][0].update(deterministes=["inconnu"]))
        self.contient(e, "déterministe absent de la liste des agents")
        e = self.erreurs(lambda r: r["services"][0].update(deterministes=["coord-aaa"]))
        self.contient(e, "coordinateur ne peut pas être déterministe")
        e = self.erreurs(lambda r: r["services"][2].update(deterministes=["general"]))
        self.contient(e, "coordinateur ne peut pas être déterministe")
        e = self.erreurs(lambda r: r["services"][0].update(deterministes="autre-aaa"))
        self.contient(e, "deterministes doit être une liste")
        self.assertEqual(self.erreurs(lambda r: r["services"][0].update(deterministes=["autre-aaa"])), [])

    def test_reglages(self):
        e = self.erreurs(lambda r: r["services"][0].update(reglages={"inconnu": {}}))
        self.contient(e, "réglage pour un agent absent")
        e = self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"modele": {"id": "gpt-5", "effort": "high"}}}))
        self.contient(e, "modèle invalide")
        e = self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"modele": {"id": "claude-opus-5-5", "effort": "turbo"}}}))
        self.contient(e, "modèle invalide")
        e = self.erreurs(lambda r: r["services"][0].update(deterministes=["autre-aaa"], reglages={"autre-aaa": {"outilsInterdits": ["Write"]}}))
        self.contient(e, "agent déterministe sans réglage")
        e = self.erreurs(lambda r: r["services"][0].update(outilsInterdits="WebFetch"))
        self.contient(e, "outilsInterdits doit être une liste")
        e = self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"outilsInterdits": "Write"}}))
        self.contient(e, "outilsInterdits doit être une liste")
        self.assertEqual(self.erreurs(lambda r: r["services"][0].update(
            outilsInterdits=["WebFetch"],
            reglages={"autre-aaa": {"modele": {"id": "claude-opus-5-5", "effort": "high"}, "outilsInterdits": ["Write"]}})), [])

    def test_flux_service_inconnu(self):
        e = self.erreurs(lambda r: r["flux"][0].update(cible="fantome"))
        self.contient(e, "service inconnu en cible")
        e = self.erreurs(lambda r: r["flux"][0].update(source="fantome"))
        self.contient(e, "service inconnu en source")

    def test_flux_vers_soi_meme(self):
        e = self.erreurs(lambda r: r["flux"][0].update(cible="aaa"))
        self.contient(e, "lui-même")

    def test_flux_double(self):
        e = self.erreurs(lambda r: r["flux"].append(copy.deepcopy(r["flux"][0])))
        self.contient(e, "flux en double")

    def test_flux_meme_paire_objet_different(self):
        # La route services.declarer du plugin refuse deux flux sur la même paire : le registre aussi.
        def ajout(r):
            f = copy.deepcopy(r["flux"][0])
            f["objet"] = "Autre objet"
            r["flux"].append(f)
        e = self.erreurs(ajout)
        self.contient(e, "flux en double")

    def test_flux_sensible_sans_approbation(self):
        e = self.erreurs(lambda r: r["flux"].append(
            {"source": "bbb", "cible": "aaa", "objet": "o", "approbationHumaine": False}))
        self.contient(e, "sensible")

    def test_champs_manquants_service(self):
        for champ in ("slug", "nom", "prefixe", "actif", "description", "coordinateur",
                      "agents", "humainSeul", "obligations", "donnees"):
            def retire(r, c=champ):
                del r["services"][0][c]
            e = self.erreurs(retire)
            self.assertTrue(e, champ)

    def test_champs_manquants_flux(self):
        for champ in ("source", "cible", "objet", "approbationHumaine"):
            def retire(r, c=champ):
                del r["flux"][0][c]
            e = self.erreurs(retire)
            self.contient(e, "champ obligatoire manquant")

    def test_approbation_non_booleenne(self):
        e = self.erreurs(lambda r: r["flux"][0].update(approbationHumaine="oui"))
        self.contient(e, "non booléen")

    def test_listes_vides(self):
        e = self.erreurs(lambda r: r["services"][0].update(humainSeul=[]))
        self.contient(e, "est vide")

    def test_flux_generes_minimal(self):
        reg = minimal()
        generes = svc.flux_coordinateurs(reg)
        self.assertEqual({(f["source"], f["cible"]) for f in generes},
                         {("aaa", "bbb"), ("bbb", "aaa"), ("bbb", "direction"), ("direction", "bbb"), ("direction", "aaa")})
        self.assertEqual({(f["source"], f["cible"]): f["approbationHumaine"] for f in generes},
                         {("aaa", "bbb"): True, ("bbb", "aaa"): True, ("bbb", "direction"): True, ("direction", "bbb"): True, ("direction", "aaa"): False})

    def test_coordinateur_general_absent(self):
        self.contient(self.erreurs(lambda r: r["services"][2].pop("coordinateurGeneral")), "aucun coordinateur général")

    def test_coordinateur_general_hors_direction(self):
        def modif(r):
            r["services"][0]["coordinateurGeneral"] = "autre-aaa"
        self.contient(self.erreurs(modif), "seul le service direction")

    def test_coordinateur_general_inconnu_ou_confondu(self):
        self.contient(self.erreurs(lambda r: r["services"][2].update(coordinateurGeneral="fantome")), "absent de la liste des agents")
        self.contient(self.erreurs(lambda r: r["services"][2].update(coordinateurGeneral="coord-direction")), "distinct du coordinateur")
        self.contient(self.erreurs(lambda r: r["services"][2].update(coordinateurGeneral="")), "texte non vide")

    def test_structure_invalide(self):
        self.assertTrue(svc.valider([]))
        self.assertTrue(svc.valider({"services": [], "flux": []}))
        self.assertTrue(svc.valider({"services": minimal()["services"]}))

    def test_reference_agents_illisible(self):
        def modif(r):
            r["services"][0]["agentsRef"] = "absent.json"
            r["services"][0]["agentsRefErreur"] = "FileNotFoundError : absent.json"
        self.contient(self.erreurs(modif), "illisible")


class TestPorteDeterministe(unittest.TestCase):
    """Un agent déclaré dans « deterministes » est construit depuis le gabarit porte (adaptateur process, aucun modèle)."""

    @classmethod
    def setUpClass(cls):
        import os
        import tempfile
        os.environ.setdefault("ATELIER_DONNEES_LOCALES", tempfile.mkdtemp(prefix="atelier-test-porte-"))
        spec = importlib.util.spec_from_file_location("bootstrap_organisation", RACINE / "scripts" / "bootstrap-organisation.py")
        cls.bo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.bo)
        cls.reg_agents, cls.reg_orga = cls.bo.registres()
        cls.services = {s["slug"]: s for s in cls.bo.registre_services()["services"]}

    def test_porte_observatoire_deterministe(self):
        bo, svc_obs = self.bo, self.services["observatoire"]
        agents, corps, _ = bo.agents_service(self.reg_agents, svc_obs)
        porte = next(a for a in agents if a["slug"] == "porte")
        self.assertTrue(porte["deterministe"])
        self.assertIsNone(porte["modele"])
        self.assertEqual((porte["competences"], porte["role"], porte["rapporteA"]), ([], "qa", svc_obs["coordinateur"]))
        self.assertFalse([a["slug"] for a in agents if a["slug"] != "porte" and a.get("deterministe")])
        reg_s = bo.reg_agents_service(self.reg_agents, agents)
        ext = bo.construire_extension(reg_s, self.reg_orga)["agents"]
        self.assertEqual(ext["porte"]["adapter"]["type"], "process")
        self.assertEqual(ext["porte"]["adapter"]["config"]["args"], ["agents/porte.mjs"])
        self.assertEqual({ext[s]["adapter"]["type"] for s in ext if s != "porte"}, {"claude_local"})
        orga = {"version": self.reg_orga["version"], "objectifs": [], "projets": [], "routines": [],
                "entreprise": {**self.reg_orga["entreprise"], "nom": "Essai", "slug": "essai-obs",
                               "marqueur": "atelier-client:essai:observatoire", "description": "Essai."}}
        fichiers = bo.fichiers_service(reg_s, orga, svc_obs, corps)
        texte = fichiers["agents/porte/AGENTS.md"]
        self.assertNotIn(bo.MARQUEUR_CONSIGNES_COMMUNES, texte)
        self.assertIn('reportsTo: "directeur"', texte)
        self.assertIn(bo.MARQUEUR_CONSIGNES_COMMUNES, fichiers["agents/directeur/AGENTS.md"])

    def test_explorateur_sources_13e_agent(self):
        agents, _, avert = self.bo.agents_service(self.reg_agents, self.services["observatoire"])
        self.assertEqual(len(agents), 13)
        e = next(a for a in agents if a["slug"] == "explorateur-sources")
        self.assertNotIn("WebSearch", e["outils"]["recherche"])
        self.assertIn("affirmations-preuves", e["competences"])
        self.assertFalse([x for x in avert if "explorateur-sources" in x], avert)

    def test_reglages_observatoire(self):
        bo, svc_obs = self.bo, self.services["observatoire"]
        agents, _, _ = bo.agents_service(self.reg_agents, svc_obs)
        par = {a["slug"]: a for a in agents}
        opus = {"id": "claude-opus-5-5", "effort": "high"}
        self.assertEqual((par["auditeur-securite"]["modele"], par["relecteur-independant"]["modele"]), (opus, opus))
        self.assertEqual(par["veille-technique"]["modele"]["id"], "claude-sonnet-5-5")
        for slug, a in par.items():
            if a.get("deterministe"):
                continue
            self.assertNotIn("WebFetch", a["outils"]["recherche"], slug)
            self.assertIn("WebFetch", a["outils"]["interdits"], slug)
        for slug in ("explorateur-sources", "relecteur-independant", "veille-technique", "veille-recherche-medias", "directeur"):
            self.assertNotIn("Write", par[slug]["outils"]["mutation"], slug)
            self.assertIn("Write", par[slug]["outils"]["interdits"], slug)
        self.assertIn("Write", par["analyste-technique"]["outils"]["mutation"])  # brouillons permis par sa consigne
        ext = bo.construire_extension(bo.reg_agents_service(self.reg_agents, agents), self.reg_orga)["agents"]
        config = ext["relecteur-independant"]["adapter"]["config"]
        self.assertEqual(config["model"], "claude-opus-5-5")
        self.assertNotIn("Edit(./**)", config["extraArgs"])
        self.assertNotIn("WebFetch", config["extraArgs"][: config["extraArgs"].index("--disallowedTools")])

    def test_autres_services_sans_deterministe(self):
        agents, _, _ = self.bo.agents_service(self.reg_agents, self.services["juridique"])
        self.assertFalse([a["slug"] for a in agents if a.get("deterministe")])
        self.assertTrue(all("WebFetch" in a["outils"]["recherche"] for a in agents))  # réglages propres à l'Observatoire


class TestRubriques(unittest.TestCase):
    """Plan des compétences : rubriques obligatoires ordonnées, rubriques facultatives (dont « Pièges ») placées n'importe où."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("verifier_organisation", RACINE / "scripts" / "verifier-organisation.py")
        cls.vo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.vo)

    def test_pieges_facultatif(self):
        r = list(self.vo.RUBRIQUES)
        self.assertTrue(self.vo.rubriques_conformes(r))
        self.assertTrue(self.vo.rubriques_conformes(r[:-1] + ["Pièges"] + r[-1:]))
        self.assertTrue(self.vo.rubriques_conformes(r + ["Pièges", "Sources officielles"]))
        self.assertFalse(self.vo.rubriques_conformes(r[:-1] + ["Truc"] + r[-1:]))
        self.assertFalse(self.vo.rubriques_conformes(r[:-1]))

    def test_rubrique_en_double(self):
        r = list(self.vo.RUBRIQUES)
        self.assertFalse(self.vo.rubriques_conformes(r + ["Pièges", "Pièges"]))
        self.assertFalse(self.vo.rubriques_conformes(r[:-1] + ["Pièges"] + r[-1:] + ["Pièges"]))
        self.assertFalse(self.vo.rubriques_conformes(r + ["Sources officielles", "Sources officielles"]))


if __name__ == "__main__":
    unittest.main()
