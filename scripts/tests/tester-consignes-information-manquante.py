#!/usr/bin/env python3
"""Règle générale de l'usine (JB, 30/10/2026) : un agent qui n'a pas une information la demande à son coordinateur,
et c'est le coordinateur qui la répartit : d'abord un agent de son équipe qui peut la trouver, puis un autre service
par liaison, l'humain en dernier seulement. Le Coordinateur marketing dit en plus qui, dans son équipe, trouve quoi.
Lecture des consignes générées seulement : aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-consignes-information-manquante.py
"""
import importlib.util
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
RACINE = Path(__file__).resolve().parent.parent.parent
ORGA = RACINE / "organisation"


def plat(chemin):
    return re.sub(r"\s+", " ", chemin.read_text(encoding="utf-8"))


ORDRE = ("(1) toi-même", "(2) un agent de ton équipe", "(3) un autre service par liaison", "(4) l'humain")


class OrdreDuCoordinateur(unittest.TestCase):
    def verifier_ordre(self, texte, nom):
        positions = [texte.find(etape) for etape in ORDRE]
        self.assertNotIn(-1, positions, f"{nom} : étapes de répartition absentes {positions}")
        self.assertEqual(positions, sorted(positions), f"{nom} : l'humain doit venir en dernier")

    def test_tronc_commun(self):
        self.verifier_ordre(plat(ORGA / "consignes" / "communes.md"), "communes.md")

    def test_tous_les_coordinateurs_generes(self):
        # Marketing : consignes communes écrites dans AGENTS.md ; autres services : ajoutées au bootstrap.
        self.verifier_ordre(plat(ORGA / "agents" / "coordinateur" / "AGENTS.md"), "coordinateur marketing")
        spec = importlib.util.spec_from_file_location("bootstrap", RACINE / "scripts" / "bootstrap-organisation.py")
        bootstrap = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bootstrap)
        self.verifier_ordre(re.sub(r"\s+", " ", bootstrap.consignes_communes(False)), "autres services")

    def test_le_specialiste_demande_au_coordinateur(self):
        texte = plat(ORGA / "agents" / "contenus" / "AGENTS.md")
        self.assertIn("Information manquante : <question précise>", texte)
        self.assertIn("c'est lui qui obtient l'information", texte)


class QuiTrouveQuoi(unittest.TestCase):
    TABLES = {
        "agents/coordinateur/AGENTS.md": ("veille", "stratege", "prospection", "enrichissement-coordonnees",
                                          "seo-local-geo", "mesure", "conformite-publicitaire", "juridique"),
        "services/direction/agents/coordinateur-general/AGENTS.md": ("marketing", "observatoire", "juridique",
                                                                     "comptabilite-finance", "donnees-bi", "commercial"),
        "services/observatoire/agents/directeur/AGENTS.md": ("explorateur-sources", "veille-technique",
                                                              "veille-recherche-medias", "analyste-technique",
                                                              "analyste-comparatif", "ingenieur-essais",
                                                              "auditeur-securite", "integrateur-claude-mcp"),
    }

    def test_table_des_trois_coordinateurs(self):
        for rel, cibles in self.TABLES.items():
            texte = plat(ORGA / rel).split("Consignes communes : générées")[0]
            self.assertIn("## Qui trouve quoi", texte, rel)
            self.assertIn("l'humain en dernier", texte, rel)
            for cible in cibles:
                self.assertIn(f"`{cible}`", texte, f"{rel} : {cible}")

    def test_les_agents_cites_existent(self):
        for rel, cibles in self.TABLES.items():
            if "observatoire" in rel:
                for slug in cibles:
                    self.assertTrue((ORGA / "services" / "observatoire" / "agents" / slug).is_dir(), slug)
            elif rel.startswith("agents/"):
                for slug in cibles[:-1]:
                    self.assertTrue((ORGA / "agents" / slug).is_dir(), slug)

    def test_recherche_avant_humain_chez_le_marketing(self):
        texte = plat(ORGA / "agents" / "coordinateur" / "AGENTS.md")
        self.assertIn("une tâche de recherche confiée à l'agent qui peut la trouver", texte)


if __name__ == "__main__":
    unittest.main(verbosity=1)
