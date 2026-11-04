#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests du registre des services (python3 -I scripts/tests/tester-atelier-services.py)."""

import atexit
import copy
import importlib.util
import json
import shutil
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
            "evenementiel", "services-generaux", "partenariats", "observatoire", "complements",
        }
        self.assertEqual(len(reg["services"]), 30)
        self.assertEqual({s["slug"] for s in reg["services"]}, attendus)
        self.assertTrue(all(s["actif"] is True for s in reg["services"]))
        marketing = next(s for s in reg["services"] if s["slug"] == "marketing")
        with open(RACINE / "organisation/registre/agents.json", encoding="utf-8") as f:
            agents_reels = [a["slug"] for a in json.load(f)["agents"]]
        self.assertEqual(marketing["agents"], agents_reels)
        slugs = {s["slug"] for s in reg["services"]}
        for autre in slugs - {"direction"}:
            self.assertTrue(any(f["source"] == autre and f["cible"] == "direction" for f in reg["flux"]), autre)

    def test_cadence_observatoire_declaree(self):
        """P1-5 (audit du 29/10/2026) : seul l'Observatoire déclare un projet et des routines ; chaque routine a son TASK.md."""
        reg = svc.charger_services()
        avec = {s["slug"] for s in reg["services"] if s.get("projets") or s.get("routines")}
        self.assertEqual(avec, {"observatoire"})
        obs = next(s for s in reg["services"] if s["slug"] == "observatoire")
        self.assertEqual([p["slug"] for p in obs["projets"]], ["cadence-observatoire"])
        racine = RACINE / "organisation/services/observatoire/projects/cadence-observatoire"
        self.assertTrue((racine / "PROJECT.md").is_file())
        self.assertEqual({r["slug"]: r["cron"] for r in obs["routines"]}, {
            "veille-technique-hebdomadaire": "30 10 * * 1", "exploration-sources-hebdomadaire": "30 10 * * 3",
            "arbitrage-hebdomadaire": "30 10 * * 4", "edition-hebdomadaire": "30 10 * * 5"})
        for r in obs["routines"]:
            self.assertTrue((racine / "tasks" / r["slug"] / "TASK.md").is_file(), r["slug"])

    def test_marketing_peut_saisir_le_juridique_sous_approbation(self):
        # LIV-MK-3 (audit du 29/10/2026) : un BESOIN juridique du Marketing ouvre une liaison vers le Juridique
        # (service sensible), donc toujours sous approbation humaine.
        reg = svc.charger_services()
        flux = [f for f in reg["flux"] if f["source"] == "marketing" and f["cible"] == "juridique"]
        self.assertEqual(len(flux), 1)
        self.assertIs(flux[0]["approbationHumaine"], True)

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
        # COORD-P2-7 (décision du 30/10) : le réseau généré relie seulement le coordinateur général (Direction) et chaque
        # coordinateur, dans les deux sens, pour les paires que la matrice métier ne couvre pas ; plus aucun flux généré
        # entre deux départements (690 avant, 26 maintenant : les 28 « X vers direction » et 3 « direction vers X » sont métier).
        reg = svc.charger_services()
        generes = svc.flux_coordinateurs(reg)
        complets = svc.flux_complets(reg)
        self.assertEqual(len(reg["flux"]), 126)  # LIV-MK-3 : + marketing vers juridique (approbation humaine)
        self.assertEqual(len(generes), 26)
        self.assertTrue(all("direction" in (f["source"], f["cible"]) for f in generes), "aucun flux généré entre deux départements")
        paires = [(f["source"], f["cible"]) for f in complets]
        self.assertEqual(len(paires), len(set(paires)), "aucune paire déclarée deux fois")
        # Le registre ne liste aucun flux généré : ils naissent seulement de la liste des services.
        self.assertFalse(any("protocole-inter-coordinateurs" in f["objet"] for f in reg["flux"]))
        # Règle sensible inchangée, étendue au service public (V2-6) : tout flux qui en touche un exige l'approbation humaine.
        sensibles = {s["slug"] for s in reg["services"] if s.get("sensible")}
        self.assertEqual(sensibles, {"juridique", "ressources-humaines", "fiscalite", "hse", "juridique-social", "conformite", "sav-sinistres"})
        publics = {s["slug"] for s in reg["services"] if s.get("public")}
        self.assertEqual(publics, {"observatoire"})
        for f in complets:
            if {f["source"], f["cible"]} & (sensibles | publics):
                self.assertTrue(f["approbationHumaine"], f)
        for f in generes:
            self.assertEqual(f["approbationHumaine"], bool({f["source"], f["cible"]} & (sensibles | publics)), f)
            self.assertEqual(f["origine"], "coordinateur-general")
            self.assertLessEqual(len(f["objet"]), 200)
        # Le coordinateur général (Direction) joint chaque service et chaque service le joint.
        autres = {s["slug"] for s in reg["services"]} - {"direction"}
        self.assertEqual({f["cible"] for f in complets if f["source"] == "direction"}, autres)
        self.assertEqual({f["source"] for f in complets if f["cible"] == "direction"}, autres)
        # Les flux métier gardent leur objet et leur approbation.
        self.assertEqual(complets[:126], [{**f, "origine": "metier"} for f in reg["flux"]])

    def test_protocole_annonce_le_reseau_reduit(self):
        # COORD-P2-7 et V2-6 : la compétence des coordinateurs dit comment joindre un département sans flux métier.
        texte = (RACINE / "organisation/skills/protocole-inter-coordinateurs/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("adresse ta demande au coordinateur général (`direction`), qui la relaie", texte)
        self.assertIn("ou public (l'Observatoire", texte)

    def test_observatoire_public_tous_ses_flux_approuves(self):
        # V2-6 : l'Observatoire publie sur un site public ; aucune donnée n'y entre ni n'en sort sans l'accord d'un humain.
        reg = svc.charger_services()
        self.assertIs(next(s for s in reg["services"] if s["slug"] == "observatoire").get("public"), True)
        touches = [f for f in svc.flux_complets(reg) if "observatoire" in (f["source"], f["cible"])]
        self.assertEqual({(f["source"], f["cible"]) for f in touches if f["origine"] == "metier"},
                         {("observatoire", c) for c in ("direction", "informatique", "recherche-innovation", "formation", "complements")}
                         | {("complements", "observatoire")})
        self.assertIn(("direction", "observatoire"), {(f["source"], f["cible"]) for f in touches})
        self.assertTrue(all(f["approbationHumaine"] for f in touches), touches)


class TestDeclaration(unittest.TestCase):
    """Corps envoyé à services.declarer : réseau des coordinateurs compris, jamais un service hors du client."""

    def local(self, slug, services):
        return {"slug": slug, "entreprises": {s: {"entrepriseId": f"{slug}-{s}"} for s in services}}

    def test_client_complet(self):
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        tous = [s["slug"] for s in reg["services"]]
        corps = declarer.construire_corps(reg, self.local("trio", tous))
        self.assertEqual(len(corps["flux"]), 152)  # COORD-P2-7 : 126 métier + 26 générés avec la Direction (812 avant)
        self.assertLessEqual(len(corps["flux"]), 40 * 39, "borne du contrat FluxService du plugin")
        self.assertTrue(all(set(f) == {"source", "cible", "objet", "approbationHumaine", "origine"} for f in corps["flux"]))
        # L'origine déclarée au plugin sépare le métier du réseau des coordinateurs.
        self.assertEqual(sum(f["origine"] == "metier" for f in corps["flux"]), 126)
        self.assertEqual(sum(f["origine"] == "coordinateurs" for f in corps["flux"]), 26)
        self.assertTrue(all((f["origine"] == "coordinateurs") == ("protocole-inter-coordinateurs" in f["objet"]) for f in corps["flux"]))

    def test_sous_ensemble_du_client(self):
        reg = json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))
        corps = declarer.construire_corps(reg, self.local("duo", ["marketing", "direction", "juridique"]))
        paires = {(f["source"], f["cible"]) for f in corps["flux"]}
        # Seul flux métier entre eux : marketing vers juridique (LIV-MK-3) ; le reste passe par le coordinateur général (COORD-P2-7).
        self.assertEqual(paires, {("marketing", "direction"), ("direction", "marketing"), ("juridique", "direction"), ("direction", "juridique"),
                                  ("marketing", "juridique")})
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
        self.assertEqual({(f["source"], f["cible"]) for f in b["flux"]}, {("marketing", "commercial")})  # flux métier seul, sans Direction
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
        for n in (0, 51, "3", True):  # T3 : nombre de runs par session, entier de 1 à 50
            e = self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"sessionsParRotation": n}}))
            self.contient(e, "sessionsParRotation")
        self.assertEqual(self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"sessionsParRotation": 3}})), [])
        # AFB-8 : seules les variables déjà communes peuvent être surchargées par agent, en texte.
        for env in ({"LD_PRELOAD": "x"}, {"CLAUDE_CODE_PROMPT_CACHE_TTL": 1}, "1h"):
            e = self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"envPortable": env}}))
            self.contient(e, "envPortable")
        self.assertEqual(self.erreurs(lambda r: r["services"][0].update(
            reglages={"autre-aaa": {"envPortable": {"CLAUDE_CODE_PROMPT_CACHE_TTL": "1h"}}})), [])
        e = self.erreurs(lambda r: r["services"][0].update(outilsInterdits="WebFetch"))
        self.contient(e, "outilsInterdits doit être une liste")
        e = self.erreurs(lambda r: r["services"][0].update(reglages={"autre-aaa": {"outilsInterdits": "Write"}}))
        self.contient(e, "outilsInterdits doit être une liste")
        self.assertEqual(self.erreurs(lambda r: r["services"][0].update(
            outilsInterdits=["WebFetch"],
            reglages={"autre-aaa": {"modele": {"id": "claude-opus-5-5", "effort": "high"}, "outilsInterdits": ["Write"]}})), [])

    def test_projets_et_routines(self):
        """P1-5 : projets et routines d'un service, facultatifs, contrôlés comme ceux du marketing."""
        projet = {"slug": "cadence", "responsable": "coord-aaa", "statut": "in_progress", "couleur": "#2f6f5e", "objectifs": []}
        routine = {"slug": "hebdo", "cron": "30 10 * * 1", "fuseau": "Europe/Brussels",
                   "concurrence": "skip_if_active", "rattrapage": "skip_missed"}
        self.assertEqual(self.erreurs(lambda r: r["services"][0].update(projets=[projet], routines=[routine])), [])
        cas = [
            ({"projets": {"slug": "x"}}, "projets doit être une liste"),
            ({"projets": [{**projet, "slug": "Cadence"}]}, "slug de projet invalide"),
            ({"projets": [{**projet, "responsable": "inconnu"}]}, "responsable « inconnu » absent"),
            ({"projets": [{**projet, "statut": "ouvert"}]}, "statut de projet invalide"),
            ({"projets": [{**projet, "couleur": "vert"}]}, "couleur invalide"),
            ({"projets": [{**projet, "objectifs": ["OBJ-1"]}]}, "objectifs"),
            ({"projets": [projet, projet]}, "projet en double"),
            ({"routines": "hebdo"}, "routines doit être une liste"),
            ({"routines": [{**routine, "cron": "0 9 * * 1"}]}, "à partir de 10 h"),
            ({"routines": [{**routine, "cron": "30 10 * *"}]}, "cron invalide"),
            ({"routines": [{**routine, "fuseau": ""}]}, "fuseau"),
            ({"routines": [{**routine, "concurrence": "toujours"}]}, "concurrence invalide"),
            ({"routines": [{**routine, "rattrapage": "tout"}]}, "rattrapage invalide"),
            ({"routines": [routine, routine]}, "routine en double"),
        ]
        for modif, texte in cas:
            with self.subTest(texte=texte):
                self.contient(self.erreurs(lambda r: r["services"][0].update(**modif)), texte)

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

    def test_flux_public_sans_approbation(self):
        def public(r):
            r["services"][0]["public"] = True  # aaa, dont le flux métier vers direction est sans approbation
        self.contient(self.erreurs(public), "service public « aaa » impose l'approbation humaine")
        self.contient(self.erreurs(lambda r: r["services"][0].update(public="oui")), "« public » doit être un booléen")
        self.contient(self.erreurs(lambda r: r["services"][0].update(interne="oui")), "« interne » doit être un booléen")

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
        self.assertEqual({(f["source"], f["cible"]) for f in generes}, {("bbb", "direction"), ("direction", "bbb"), ("direction", "aaa")})
        self.assertEqual({(f["source"], f["cible"]): f["approbationHumaine"] for f in generes},
                         {("bbb", "direction"): True, ("direction", "bbb"): True, ("direction", "aaa"): False})
        # Un service public (V2-6) impose l'approbation, comme un sensible.
        reg["services"][0]["public"] = True
        self.assertTrue(next(f for f in svc.flux_coordinateurs(reg) if (f["source"], f["cible"]) == ("direction", "aaa"))["approbationHumaine"])

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
        donnees = tempfile.mkdtemp(prefix="atelier-test-porte-")
        atexit.register(shutil.rmtree, donnees, ignore_errors=True)  # /tmp est en mémoire vive : rien ne reste
        os.environ.setdefault("ATELIER_DONNEES_LOCALES", donnees)
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

    def test_couverture_documentee_observatoire(self):
        """Pilote du 27/10 : sans base du plugin ni route de couverture dans sa fiche, le rédacteur a appelé
        /api/plugins/obs/… (404) et l'article est resté bloqué. Le directeur, assigné de l'article (confier.py),
        déclare ; les autres producteurs connaissent la route ; le relecteur lit la partie couvertures."""
        bo, svc_obs = self.bo, self.services["observatoire"]
        agents, corps, _ = bo.agents_service(self.reg_agents, svc_obs)
        orga = {"version": self.reg_orga["version"], "objectifs": [], "projets": [], "routines": [],
                "entreprise": {**self.reg_orga["entreprise"], "nom": "Essai", "slug": "essai-obs",
                               "marqueur": "atelier-client:essai:observatoire", "description": "Essai."}}
        fichiers = bo.fichiers_service(bo.reg_agents_service(self.reg_agents, agents), orga, svc_obs, corps)
        base = "/api/plugins/atelier.marketing-ia/api/taches/<issueId>"
        for slug in ("directeur", "redacteur-en-chef", "analyste-technique", "adaptateur-anglais"):
            texte = fichiers[f"agents/{slug}/AGENTS.md"]
            self.assertIn(f"`POST {base}/couverture`", texte, slug)
            self.assertIn("### POST /taches/:issueId/couverture", texte, slug)  # corps recopié de la fiche routes-agents
        self.assertIn(f"{base}/contexte?partie=couvertures", fichiers["agents/relecteur-independant/AGENTS.md"])
        # Pilote du 27/10, 17 h 20 : sans outil Write, un curl de 12 979 caractères est refusé (9 572 passent).
        self.assertIn("8 000 caractères", fichiers["agents/directeur/AGENTS.md"])
        for slug in (a["slug"] for a in agents):
            self.assertNotRegex(fichiers[f"agents/{slug}/AGENTS.md"], r"/api/plugins/(?!atelier\.marketing-ia/api\b)", slug)

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
        # T3 (audit du 29/10/2026) : la session du directeur gonflait de 26 k à 297 k jetons ; nouvelle session tous les 3 runs.
        self.assertEqual(par["directeur"].get("sessionsParRotation"), 3)
        self.assertEqual([s for s, a in par.items() if a.get("sessionsParRotation")], ["directeur"])
        battement = bo.construire_extension(bo.reg_agents_service(self.reg_agents, agents), bo.registres()[1])["agents"]["directeur"]["runtime"]["heartbeat"]
        self.assertEqual(battement["sessionCompaction"], {"enabled": True, "maxSessionRuns": 3})
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
        # N5 (30/10/2026) : WebFetch est mort dans la cage (réseau borné à api.anthropic.com), donc interdit partout.
        self.assertFalse([a["slug"] for a in agents if "WebFetch" in a["outils"]["recherche"]])
        self.assertTrue(all("WebFetch" in a["outils"]["interdits"] for a in agents))

    def test_tous_sans_les_services_internes(self):
        # DOC-A2 : l'Observatoire est interne à l'usine (projet de l'opérateur) ; « tous » ne l'installe pas chez un client,
        # mettre-a-jour-client ne l'ajoute pas, mais il reste installable en le nommant.
        self.assertIs(self.services["observatoire"].get("interne"), True)
        erreurs: list[str] = []
        tous, _ = self.bo.valider_services_fiche({"services": "tous"}, erreurs)
        self.assertEqual(erreurs, [])
        self.assertNotIn("observatoire", tous)
        self.assertEqual(len(tous), len([s for s in self.services.values() if s.get("actif") and not s.get("interne")]))
        nomme, _ = self.bo.valider_services_fiche({"services": ["observatoire"]}, erreurs)
        self.assertEqual((nomme, erreurs), (["observatoire"], []))


class TestCadenceService(unittest.TestCase):
    """P1-5 (audit du 29/10/2026) : les entreprises de service importent leurs projets et routines (l'Observatoire : 1 projet,
    4 routines hebdomadaires), créées EN PAUSE ; une seconde application n'écrit rien ; les autres services et le marketing
    restent inchangés. L'import natif est simulé d'après le socle (server/src/services/company-portability.ts : routine
    toujours CRÉÉE, jamais mise à jour ; statut = « paused » si pauseAutomations, sinon celui de l'extension, sinon « active »)."""

    @classmethod
    def setUpClass(cls):
        import os
        import tempfile
        donnees = tempfile.mkdtemp(prefix="atelier-test-cadence-")
        atexit.register(shutil.rmtree, donnees, ignore_errors=True)  # /tmp est en mémoire vive : rien ne reste
        os.environ.setdefault("ATELIER_DONNEES_LOCALES", donnees)
        spec = importlib.util.spec_from_file_location("bootstrap_organisation", RACINE / "scripts" / "bootstrap-organisation.py")
        cls.bo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.bo)
        cls.reg_agents, cls.reg_orga = cls.bo.registres()
        cls.services = {s["slug"]: s for s in cls.bo.registre_services()["services"]}

    def paquet(self, slug):
        bo, s = self.bo, self.services[slug]
        agents, corps, _ = bo.agents_service(self.reg_agents, s)
        reg_s = bo.organisation_service(self.reg_orga, {"slug": "essai", "mode": "reel"}, s, f"Essai {slug}",
                                        f"atelier-client:essai:{slug}")
        reg_agents_s = bo.reg_agents_service(self.reg_agents, agents)
        return reg_agents_s, reg_s, bo.fichiers_service(reg_agents_s, reg_s, s, corps)

    def test_paquet_observatoire(self):
        _, reg_s, fichiers = self.paquet("observatoire")
        self.assertEqual([p["slug"] for p in reg_s["projets"]], ["cadence-observatoire"])
        self.assertEqual(len(reg_s["routines"]), 4)
        self.assertEqual(reg_s["objectifs"], [])
        base = "projects/cadence-observatoire/"
        self.assertIn(base + "PROJECT.md", fichiers)
        self.assertIn("importées en pause", fichiers[base + "PROJECT.md"])
        self.assertEqual(sorted(c for c in fichiers if c.endswith("/TASK.md")), sorted(
            f"{base}tasks/{r['slug']}/TASK.md" for r in reg_s["routines"]))
        ext = self.bo.charger_yaml_sur(fichiers[".paperclip.yaml"])
        self.assertEqual(ext["projects"]["cadence-observatoire"]["leadAgentSlug"], "directeur")
        self.assertEqual({r["status"] for r in ext["routines"].values()}, {"paused"})

    def test_autre_service_et_marketing_inchanges(self):
        _, reg_s, fichiers = self.paquet("juridique")
        self.assertEqual((reg_s["projets"], reg_s["routines"]), ([], []))
        self.assertFalse([c for c in fichiers if c.startswith("projects/")])
        ext_mkt = self.bo.charger_yaml_sur(self.bo.fichiers_paquet()[".paperclip.yaml"])
        self.assertFalse([s for s, r in ext_mkt["routines"].items() if "status" in r])

    def test_a_blanc_annonce_projets_et_routines(self):
        bo = self.bo
        for slug, attendu in (("observatoire", True), ("juridique", False)):
            s = self.services[slug]
            agents, _, _ = bo.agents_service(self.reg_agents, s)
            reg_s = bo.organisation_service(self.reg_orga, {"slug": "essai", "mode": "reel"}, s, "Essai", "atelier-client:essai")
            plan = {"svc": s, "nom": "Essai", "marqueur": "atelier-client:essai", "existante": None, "budget": 1,
                    "agents": agents, "avertissements": [], "reg_s": reg_s}
            lignes = bo.ecritures_service(plan, {"mode": "reel"}, None, None)
            annonce = [l for l in lignes if "routine(s)" in l]
            with self.subTest(service=slug):
                if attendu:
                    self.assertEqual(annonce, ["projets et routines du service : 1 projet(s) (cadence-observatoire), 4 routine(s) "
                                               "créée(s) en pause, statut jamais touché ensuite"])
                else:
                    self.assertEqual(annonce, [])

    def faux_socle(self, reg_agents_s):
        bo = self.bo
        etat = {"projets": [], "routines": [], "journal": [], "imports": []}
        ids = {a["slug"]: {"id": f"id-{a['slug']}", "name": a["nom"]} for a in reg_agents_s["agents"]}

        class Api:
            base = "http://faux"

            def get(self, chemin):
                return self.appel("GET", chemin)

            def appel(self, methode, chemin, corps=None):
                if methode == "GET" and chemin.endswith("/projects"):
                    return [dict(p) for p in etat["projets"]]
                if methode == "GET" and chemin.endswith("/routines"):
                    return [dict(r, triggers=[dict(t) for t in r["triggers"]]) for r in etat["routines"]]
                if methode == "GET":
                    raise AssertionError(f"lecture non prévue : {chemin}")
                etat["journal"].append((methode, chemin, corps))
                return {}

        def importer_en_place(api, fichiers, company_id, reg_agents, selection, pause):
            if selection is not None:
                fichiers = {k: v for k, v in fichiers.items() if k in set(selection)}
            etat["imports"].append(sorted(fichiers))
            ext = bo.charger_yaml_sur(fichiers[".paperclip.yaml"])
            for chemin, texte in fichiers.items():
                entete, corps = bo.entete_simple(texte)
                if chemin.endswith("/PROJECT.md") and not any(p["urlKey"] == entete["slug"] for p in etat["projets"]):
                    etat["projets"].append({"id": f"p-{entete['slug']}", "urlKey": entete["slug"], "goalIds": []})
                if chemin.endswith("/TASK.md") and entete.get("recurring") is True:
                    r = ext["routines"][entete["slug"]]
                    etat["routines"].append({
                        "id": f"r-{len(etat['routines'])}", "title": entete["name"], "description": corps,
                        "assigneeAgentId": ids[entete["assignee"]]["id"], "projectId": f"p-{entete['project']}",
                        "concurrencyPolicy": r["concurrencyPolicy"], "catchUpPolicy": r["catchUpPolicy"],
                        "status": "paused" if pause else r.get("status", "active"),
                        "triggers": [{"id": f"t-{len(etat['routines'])}", **t} for t in r["triggers"]]})
            return {"warnings": []}

        remplace = {
            "trouver_entreprise": lambda api, reg: {"id": "cid-essai"},
            "preparer_dossiers_locaux": lambda cid, reg: 0,
            "secret_jeton": lambda *a, **k: None,
            "synchroniser_instructions_service": lambda *a, **k: 0,
            "etat_service_a_jour": lambda *a, **k: list(etat.get("raisons", ["empreinte différente : directeur"])),
            "importer_en_place": importer_en_place,
            "lier_agents": lambda *a, **k: 0,
            "agents_par_slug": lambda api, cid: ids,
            "assurer_permissions_agents": lambda api, agents: 0,
            "assurer_gouvernance": lambda *a, **k: None,
        }
        sauve = {n: getattr(bo, n) for n in remplace}
        for n, v in remplace.items():
            setattr(bo, n, v)
        self.addCleanup(lambda: [setattr(bo, n, v) for n, v in sauve.items()])
        return Api(), etat

    def appliquer(self, slug):
        import contextlib
        import io
        import tempfile
        reg_agents_s, reg_s, fichiers = self.paquet(slug)
        api, etat = self.faux_socle(reg_agents_s)
        dossier = Path(tempfile.mkdtemp(prefix="atelier-test-cadence-etat-"))
        self.addCleanup(shutil.rmtree, dossier, ignore_errors=True)

        def lancer():
            with contextlib.redirect_stdout(io.StringIO()):
                return self.bo.appliquer_service(api, reg_agents_s, reg_s, fichiers, "reel", dossier)
        return lancer, etat

    def test_observatoire_importe_un_projet_et_quatre_routines_en_pause(self):
        lancer, etat = self.appliquer("observatoire")
        self.assertEqual(lancer(), "cid-essai")
        self.assertEqual([p["urlKey"] for p in etat["projets"]], ["cadence-observatoire"])
        self.assertEqual(len(etat["routines"]), 4)
        self.assertEqual({r["status"] for r in etat["routines"]}, {"paused"})
        self.assertEqual({r["triggers"][0]["timezone"] for r in etat["routines"]}, {"Europe/Brussels"})
        self.assertEqual(etat["journal"], [])  # tout vient de l'import, aucune réconciliation à faire
        # Seconde application, paquet à reprendre (empreinte) : l'import exclut les routines déjà là, aucun doublon.
        lancer()
        self.assertEqual(len(etat["routines"]), 4)
        self.assertFalse([c for c in etat["imports"][1] if c.endswith("/TASK.md")])
        self.assertEqual(etat["journal"], [])
        # Seconde application, déjà à jour : aucun import, aucune écriture ; une routine activée par un humain le reste.
        etat["raisons"] = []
        etat["routines"][0]["status"] = "active"
        lancer()
        self.assertEqual((len(etat["imports"]), etat["journal"]), (2, []))
        self.assertEqual(etat["routines"][0]["status"], "active")

    def test_routine_realignee_sans_toucher_au_statut(self):
        lancer, etat = self.appliquer("observatoire")
        lancer()
        etat["raisons"] = []
        etat["routines"][1]["concurrencyPolicy"] = "always_enqueue"
        lancer()
        self.assertEqual([(m, c, sorted(b)) for m, c, b in etat["journal"]],
                         [("PATCH", "/routines/r-1", ["concurrencyPolicy"])])

    def test_autre_service_sans_projet_ni_routine(self):
        lancer, etat = self.appliquer("juridique")
        lancer()
        self.assertEqual((etat["projets"], etat["routines"], etat["journal"]), ([], [], []))


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


class FuiteTmp(unittest.TestCase):
    """AFC-A17 (fuite /tmp, autres suites) : un lancement ne laisse aucun dossier dans /tmp, qui est en mémoire vive."""

    def test_lancement_ne_laisse_rien_dans_tmp(self):
        # Un TMPDIR neuf isole le compte des dossiers des autres agents ; le dernier lancement échoue exprès.
        import os
        import subprocess
        import tempfile
        env = {k: v for k, v in os.environ.items() if k != "ATELIER_DONNEES_LOCALES"}
        for noms in (["TestPorteDeterministe.test_autres_services_sans_deterministe", "TestCadenceService.test_paquet_observatoire", "TestCadenceService.test_observatoire_importe_un_projet_et_quatre_routines_en_pause"], ["FuiteTmp.test_inexistant"]):
            with tempfile.TemporaryDirectory() as tmp:
                fini = subprocess.run([sys.executable, "-I", __file__, *noms], env={**env, "TMPDIR": tmp},
                                      capture_output=True, text=True, check=False)
                self.assertEqual(fini.returncode != 0, noms[0].endswith("inexistant"), fini.stderr[-500:])
                self.assertEqual(os.listdir(tmp), [], noms)


if __name__ == "__main__":
    unittest.main()
