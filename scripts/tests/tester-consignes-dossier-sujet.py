#!/usr/bin/env python3
"""Consignes du dossier du sujet (étude 2026-10-30, section 4.5, partie organisation) : le coordinateur confie un
« Dossier du sujet » à la veille avant toute image ou vidéo, la veille le produit (compétence préchargée), Contenus et
Réseaux sociaux le lisent une seule fois, la conformité relit la rubrique Droits.
Lecture des consignes et du registre seulement : aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-consignes-dossier-sujet.py
"""
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
RACINE = Path(__file__).resolve().parent.parent.parent
ORGA = RACINE / "organisation"
ROLES = ("coordinateur", "veille", "contenus", "reseaux-sociaux", "conformite-publicitaire")
RUBRIQUES = ("Sujet", "Faits vérifiés", "Vocabulaire et références du public", "Ton", "À ne pas dire", "Droits")
REFUS = "Aucun dossier du sujet : demander au coordinateur la sous-tâche Dossier du sujet (veille)"


def plat(rel):
    return re.sub(r"\s+", " ", (ORGA / rel).read_text(encoding="utf-8"))


def role(slug):
    """Consigne propre au rôle, sans le bloc des consignes communes générées."""
    return plat(f"agents/{slug}/AGENTS.md").split("Consignes communes : générées")[0]


class TestDossierSujet(unittest.TestCase):
    def test_skill_gabarit_criteres_et_methode(self):
        brut = (ORGA / "skills/dossier-sujet/SKILL.md").read_text(encoding="utf-8")
        texte = re.sub(r"\s+", " ", brut)
        self.assertIn('name: "dossier-sujet"', brut)
        for rubrique in RUBRIQUES:
            self.assertIn(f"## {rubrique}", texte, rubrique)
        for attendu in ("| Fait | Source | Extrait |", "au moins 3", "connaissance://", "20 caractères", "accessible",
                        "WebSearch", "documents/dossier-sujet", "à confirmer", "lecture protégée", "mode réel"):
            self.assertIn(attendu, texte, attendu)
        # Une route du plugin citée en clair serait documentée à tous les rôles du skill (piège GP9).
        self.assertNotIn("atelier.marketing-ia/api", texte)
        # L'exemple est fictif : aucune vraie marque, aucun nom de client.
        self.assertIn("Exemple", texte)
        self.assertIsNone(re.search("r[g]f", texte, re.I))

    def test_competence_aux_cinq_roles_et_verificateur(self):
        reg = json.loads((ORGA / "registre/agents.json").read_text(encoding="utf-8"))
        par = {a["slug"]: a for a in reg["agents"]}
        for slug in ROLES:
            self.assertIn("dossier-sujet", par[slug]["competences"], slug)
        spec = importlib.util.spec_from_file_location("verifier_organisation", RACINE / "scripts/verifier-organisation.py")
        vo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(vo)
        self.assertIn("dossier-sujet", vo.COMPETENCES_ATTENDUES)

    def test_coordinateur_sous_tache_bloquante_et_liaison_juridique(self):
        texte = role("coordinateur")
        for attendu in ("Dossier du sujet", "`veille`", "`blockedByIssueIds`", "`fabriquer_image`", "`fabriquer_video`",
                        "Droits", "à confirmer", "liaison", "`juridique`", "diffusion", REFUS):
            self.assertIn(attendu, texte, attendu)

    def test_veille_produit_le_dossier(self):
        texte = role("veille")
        for attendu in ("Dossier du sujet", "`dossier-sujet`", "documents/dossier-sujet", "sur TA tâche", "baseRevisionId",
                        "WebSearch", "6 rubriques", "connaissance://"):
            self.assertIn(attendu, texte, attendu)

    def test_producteurs_lisent_une_seule_fois_et_savent_que_faire_du_refus(self):
        for slug in ("contenus", "reseaux-sociaux"):
            texte = role(slug)
            with self.subTest(role=slug):
                for attendu in ("`dossier-sujet`", "`dossierSujet`", "documents/dossier-sujet", "une seule fois",
                                "ne refais jamais la recherche", "n'affirmes rien", REFUS, "Information manquante"):
                    self.assertIn(attendu, texte, attendu)

    def test_conformite_relit_la_rubrique_droits(self):
        texte = role("conformite-publicitaire")
        for attendu in ("`dossier-sujet`", "rubrique `Droits`", "marque tierce", "à confirmer"):
            self.assertIn(attendu, texte, attendu)
        skill = plat("skills/conformite-publicite-ia/SKILL.md")
        self.assertIn("marque tierce : rubrique Droits du dossier du sujet sourcée", skill)

    def test_aucun_tiret_cadratin_ni_nom_de_client(self):
        for rel in ("skills/dossier-sujet/SKILL.md", "skills/conformite-publicite-ia/SKILL.md",
                    *[f"agents/{s}/AGENTS.md" for s in ROLES]):
            texte = plat(rel)
            self.assertNotIn(chr(0x2014), texte, rel)
            self.assertIsNone(re.search("r[g]f", texte, re.I), rel)


if __name__ == "__main__":
    unittest.main()
