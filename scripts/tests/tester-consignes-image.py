#!/usr/bin/env python3
"""Consignes de l'outil fabriquer_image (plan 2026-10-30, tâche 7) : Contenus et Réseaux sociaux livrent une image
finie, le gabarit et le format suivent le réseau, la conformité couvre l'image et seuls ces deux rôles ont l'outil.
Lecture des consignes et du registre seulement : aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-consignes-image.py
"""
import json
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
RACINE = Path(__file__).resolve().parent.parent.parent
ORGA = RACINE / "organisation"
OUTIL = "mcp__paperclip-assigned__atelier_marketing-ia_fabriquer_image"
ROLES_IMAGE = ("contenus", "reseaux-sociaux")


def plat(rel):
    return re.sub(r"\s+", " ", (ORGA / rel).read_text(encoding="utf-8"))


class TestConsignesImage(unittest.TestCase):
    def test_contenus_et_reseaux_sociaux_citent_l_outil_et_le_choix_du_format(self):
        for slug in ROLES_IMAGE:
            texte = plat(f"agents/{slug}/AGENTS.md")
            with self.subTest(role=slug):
                self.assertIn("`fabriquer_image`", texte)
                for format_ in ("1080x1350", "1440x1800", "1080x1920", "1200x628", "1080x1080"):
                    self.assertIn(format_, texte)
                for gabarit in ("accroche", "chiffre_cle", "liste_3_points", "offre"):
                    self.assertIn(f"`{gabarit}`", texte)
                # image finie, plus un simple brief de visuel
                self.assertIn("image finie", texte)
                self.assertIn("`conformite-publicite-ia`", texte)
                self.assertIn("30 par jour", texte)
                for refus in ("fond_ia", "charte refusée"):
                    self.assertIn(refus, texte)

    def test_outil_ouvert_a_ces_deux_roles_seulement(self):
        reg = json.loads((ORGA / "registre/agents.json").read_text(encoding="utf-8"))
        for agent in reg["agents"]:
            o = agent["outils"]
            autorises = set(o["recherche"]) | set(o["mutation"])
            if agent["slug"] in ROLES_IMAGE:
                self.assertIn(OUTIL, o["mutation"], agent["slug"])
                self.assertNotIn(OUTIL, o["interdits"], agent["slug"])
            else:
                self.assertNotIn(OUTIL, autorises, agent["slug"])
                self.assertIn(OUTIL, o["interdits"], agent["slug"])

    def test_conformite_couvre_l_image_et_contenus_la_charge(self):
        skill = plat("skills/conformite-publicite-ia/SKILL.md")
        self.assertIn("fabriquer_image", skill.split("# Conformité", 1)[0])  # description
        self.assertIn("Liste image", skill)
        for attendu in ("fond_ia", "mentions_legales", "charte"):
            self.assertIn(attendu, skill)
        reg = json.loads((ORGA / "registre/agents.json").read_text(encoding="utf-8"))
        par = {a["slug"]: a for a in reg["agents"]}
        for slug in ROLES_IMAGE:
            self.assertIn("conformite-publicite-ia", par[slug]["competences"], slug)

    def test_design_visuel_sobre_renvoie_a_l_outil(self):
        self.assertIn("fabriquer_image", plat("skills/design-visuel-sobre/SKILL.md"))

    def test_aucun_tiret_cadratin(self):
        for rel in ("agents/contenus/AGENTS.md", "agents/reseaux-sociaux/AGENTS.md", "skills/conformite-publicite-ia/SKILL.md"):
            self.assertNotIn(chr(0x2014), plat(rel), rel)


if __name__ == "__main__":
    unittest.main()
