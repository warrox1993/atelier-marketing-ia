#!/usr/bin/env python3
"""P3-3 : forme des scénarios d'évaluation des skills (3 par skill, attendus et interdits, skills existants). À lancer : python3 -I scripts/tests/tester-evaluations-skills.py"""
import json
import unittest
from pathlib import Path

ICI = Path(__file__).resolve().parent
SKILLS = ICI.parent.parent / "organisation" / "skills"


class TestScenarios(unittest.TestCase):
    def test_trois_scenarios_verifiables_par_skill_existant(self):
        s = json.loads((ICI / "evaluations-skills" / "scenarios.json").read_text(encoding="utf-8"))
        self.assertEqual(s["modeles"], ["claude-sonnet-5-5", "claude-opus-5-5"])
        self.assertEqual(sorted(s["skills"]), ["affirmations-preuves", "cadrage-exigences", "controle-couverture", "relecture-independante"])
        for skill, scenarios in s["skills"].items():
            with self.subTest(skill=skill):
                self.assertTrue((SKILLS / skill / "SKILL.md").exists())
                self.assertEqual(len(scenarios), 3)
                for sc in scenarios:
                    self.assertTrue(sc["entree"] and sc["attendus"] and sc["interdits"], sc["nom"])


if __name__ == "__main__":
    unittest.main()
