#!/usr/bin/env python3
"""Standard « haut de gamme » des vidéos publicitaires (JB, 30/10/2026) : la compétence qui écrit la vidéo fixe la
chronologie, le dialogue, le rythme et la carte finale ; elle renvoie aux mesures que la fabrique refuse et à la grille
du relecteur ; ses faits viennent du dossier du sujet. Lecture des fichiers seulement.

À lancer : python3 -I scripts/tests/tester-standard-video.py
"""
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ORGA = Path(__file__).resolve().parent.parent.parent / "organisation"


def plat(rel):
    return re.sub(r"\s+", " ", (ORGA / rel).read_text(encoding="utf-8"))


class StandardVideo(unittest.TestCase):
    TEXTE = plat("skills/script-video-publicitaire/SKILL.md")

    def test_section_dans_les_etapes(self):
        etapes = self.TEXTE.split("## Étapes")[1].split("## Livrable")[0]
        self.assertIn("### Standard haut de gamme", etapes)

    def test_chronologie_et_dialogue(self):
        for attendu in ("0 à 2 s", "carte finale", "deux voix", "`voix`", "chute", "7 mots"):
            self.assertIn(attendu, self.TEXTE, attendu)

    def test_mesures_de_la_fabrique(self):
        for attendu in ("−16 LUFS", "−1 dBTP", "42 caractères", "17 caractères par seconde", "35 %", "14 %"):
            self.assertIn(attendu, self.TEXTE, attendu)

    def test_renvois(self):
        self.assertIn("`qualite-visuels`", self.TEXTE)
        self.assertIn("dossier du sujet", self.TEXTE)
        self.assertNotIn("figure dans les documents du client. Sinon", self.TEXTE)

    def test_le_relecteur_applique_la_grille(self):
        self.assertIn("`qualite-visuels`", plat("agents/relecteur/AGENTS.md"))


if __name__ == "__main__":
    unittest.main(verbosity=1)
