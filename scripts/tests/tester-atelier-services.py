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
    return {"services": [service("aaa", "AAA"), service("bbb", "BBB", True), service("direction", "DIR")],
            "flux": [{"source": "aaa", "cible": "direction", "objet": "rapport", "approbationHumaine": False}]}


class TestFichierReel(unittest.TestCase):
    def test_valide(self):
        reg = svc.charger_services()
        self.assertEqual(svc.valider(reg), [])

    def test_contenu_attendu(self):
        reg = svc.charger_services()
        # Usine complète (16/10/2026) : 14 services d'origine + 14 ajoutés, liste exacte.
        attendus = {
            "marketing", "direction", "administratif", "juridique", "commercial", "recouvrement",
            "sav-sinistres", "commerce-exterieur", "conformite", "comptabilite-finance",
            "ressources-humaines", "informatique", "achats", "qualite",
            "logistique", "production", "recherche-innovation", "communication", "service-client",
            "fiscalite", "gestion-projets", "hse", "formation", "juridique-social", "donnees-bi",
            "evenementiel", "services-generaux", "partenariats",
        }
        self.assertEqual(len(reg["services"]), 28)
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
        self.contient(e, "2 à 4 agents")
        e = self.erreurs(lambda r: r["services"][0].update(agents=["coord-aaa", "a", "b", "c", "d"]))
        self.contient(e, "2 à 4 agents")

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

    def test_structure_invalide(self):
        self.assertTrue(svc.valider([]))
        self.assertTrue(svc.valider({"services": [], "flux": []}))
        self.assertTrue(svc.valider({"services": minimal()["services"]}))

    def test_reference_agents_illisible(self):
        def modif(r):
            r["services"][0]["agentsRef"] = "absent.json"
            r["services"][0]["agentsRefErreur"] = "FileNotFoundError : absent.json"
        self.contient(self.erreurs(modif), "illisible")


if __name__ == "__main__":
    unittest.main()
