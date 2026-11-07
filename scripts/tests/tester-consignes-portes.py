#!/usr/bin/env python3
"""Consignes des portes, verdicts et cycles de revue : paquet GP2 de l'audit du 29/10/2026
(LIV-OB-1, LIV-OB-3, LIV-OB-5, LIV-OB-10, MK-02, MK-04, MK-05, MK-06, LIV-MK-5).
Lecture des consignes seulement : aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-consignes-portes.py
"""
import json
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
RACINE = Path(__file__).resolve().parent.parent.parent
ORGA = RACINE / "organisation"


def lire(rel):
    return (ORGA / rel).read_text(encoding="utf-8")


def plat(texte):
    return re.sub(r"\s+", " ", texte)


RELECTEUR_OBS = "services/observatoire/agents/relecteur-independant/AGENTS.md"


class TestConsignesPortes(unittest.TestCase):
    def test_bce_et_fsma_sans_supposer_qu_ils_different(self):
        # Le numéro d'entreprise est aussi le numéro d'inscription FSMA : aucune copie ne doit dire le contraire.
        for chemin in [ORGA / "consignes/marketing.md", *sorted((ORGA / "agents").glob("*/AGENTS.md"))]:
            t = plat(chemin.read_text(encoding="utf-8"))
            self.assertNotIn("jamais un numéro FSMA", t, chemin.parent.name)
            self.assertNotIn("Une page du client qui affiche autre chose", t, chemin.parent.name)
        t = plat(lire("consignes/marketing.md"))
        self.assertIn("sans supposer qu'ils diffèrent", t)
        self.assertIn("0999.888.777 comme numéro FSMA", t)

    def test_coordinateur_n_evalue_pas_la_porte(self):
        # exigerEvaluateur refuse cet agent : la Porte déterministe reste seule à évaluer.
        self.assertNotIn("porte/evaluer", lire("agents/coordinateur/AGENTS.md"))
        self.assertIn("porte/evaluer", lire("agents/porte/AGENTS.md"))
        self.assertIn("/porte/evaluer", (RACINE / "plugin-atelier/agents/porte.mjs").read_text(encoding="utf-8"))

    def test_tout_producteur_relu_connait_la_route_de_couverture(self):
        # Sans couverture déclarée, une exigence obligatoire est refusée d'office par la porte : tout agent relu doit savoir la déclarer.
        registre = json.loads(lire("registre/agents.json"))
        producteurs = {slug for agent in registre["agents"] for slug in agent.get("relit", [])}
        self.assertIn("stratege", producteurs)
        for slug in sorted(producteurs):
            texte = lire(f"agents/{slug}/AGENTS.md")
            self.assertIn("taches/<issueId>/couverture", texte, slug)
            self.assertIn("### POST /taches/:issueId/couverture", texte, slug)

    def test_liv_ob1_relecteur_obs_part_de_l_evaluation_de_la_porte(self):
        texte = plat(lire(RELECTEUR_OBS))
        # Plus d'exigence d'un PASS de la porte avant la revue : il est impossible, la porte attend ce verdict.
        self.assertNotIn("porte déjà un PASS frais", texte)
        self.assertIn("Lis d'abord cette évaluation (`GET /taches/:issueId/porte`)", texte)
        self.assertIn("tu le reprends en constat bloquant, sans le recontrôler", texte)
        self.assertNotIn("OBS-01 à OBS-16", texte)

    def test_liv_ob3_grille_nombre_de_la_phrase_dans_l_affirmation(self):
        texte = plat(lire(RELECTEUR_OBS))
        self.assertIn("Chaque nombre, date ou heure d'une phrase figure dans le texte de l'Affirmation qu'elle cite", texte)
        porte = plat(lire("services/observatoire/agents/porte/AGENTS.md"))
        for code in ("obs_nombre_absent_affirmation", "obs_version_hors_extrait"):
            self.assertIn(code, porte)

    def test_liv_ob5_mineur_non_bloquant_et_decision_de_jb_au_premier_cycle(self):
        texte = plat(lire(RELECTEUR_OBS))
        self.assertIn("verdict réussi (`PASS`) avec réserves", texte)
        self.assertIn("dès le premier cycle", texte)

    def test_liv_ob10_redacteur_un_fait_une_occurrence(self):
        texte = plat(lire("services/observatoire/agents/redacteur-en-chef/AGENTS.md"))
        for attendu in ("**Un fait, une occurrence**", "« version publiée » pour release",
                        "un fait établi n'y figure pas", "Aucune méta-phrase"):
            self.assertIn(attendu, texte)

    def test_mk02_relecteur_verifie_sur_les_sources_enregistrees_plafond_10(self):
        texte = plat(lire("agents/relecteur/AGENTS.md"))
        self.assertNotIn("Tu vérifies les sources toi-même", texte)
        for attendu in ("`GET …/taches/<issueId>/dossier?partie=sources`", "au plus 10 par run",
                        "Une revue finale suffit", "reste au rôle technique"):
            self.assertIn(attendu, texte)

    def test_mk04_reponse_signee_sans_reference_par_fichier_sinon_coordinateur(self):
        # Rôles connectés seulement : un rôle sans connexion (relecteur) ne reçoit plus la notice (MK-20e, testé pour
        # tous les rôles dans tester-competences-communes RestesGP4Registre).
        for slug in ("tests-techniques", "prospection", "contenus"):
            texte = plat(lire(f"agents/{slug}/AGENTS.md"))
            self.assertIn("elle passe toujours par un fichier, jamais en ligne", texte)
            self.assertIn("Sans l'outil Write, ne la recopie pas : signale-le au coordinateur", texte)

    def test_mk05_cadrage_produit_par_le_coordinateur_controle_par_exigences(self):
        self.assertNotIn("Étape 0 : avant de dériver des exigences", plat(lire("agents/exigences/AGENTS.md")))
        stratege = plat(lire("agents/stratege/AGENTS.md"))
        self.assertNotIn("La fiche de cadrage de l'agent exigences", stratege)
        self.assertIn("La fiche de cadrage du coordinateur", stratege)

    def test_mk06_strategie_rangee_et_lue_au_meme_endroit(self):
        stratege = plat(lire("agents/stratege/AGENTS.md"))
        self.assertIn("le document `strategie` de ta tâche « Stratégie »", stratege)
        self.assertIn("le plugin la publie en connaissance du client « Stratégie marketing »", stratege)
        for slug in ("contenus", "relecteur", "sea", "veille", "mesure"):
            texte = plat(lire(f"agents/{slug}/AGENTS.md"))
            # Une seule phrase, venue du complément marketing, au lieu de copies sans emplacement.
            self.assertEqual(texte.count("**Stratégie du client**"), 1, slug)
            self.assertNotIn("lis le document de stratégie du client tenu par l'agent `stratege`", texte)

    def test_liv_mk5_aucun_depot_d_essai(self):
        texte = plat(lire("agents/relecteur/AGENTS.md"))
        self.assertIn("jamais de dépôt d'essai, de test d'encodage ni de « dépôt en cours »", texte)

    def test_promesses_fausses_retirees(self):
        # gbp_avis et gbp_metriques (passerelle/src/reel/google/outils.ts) ne lisent que l'établissement du client,
        # jamais la fiche d'un tiers ; et aucun outil de la passerelle ne répond à un commentaire.
        recherche = lire("skills/coordonnees-recherche/SKILL.md")
        agent = lire("agents/enrichissement-coordonnees/AGENTS.md")
        for texte in (recherche, agent):
            self.assertNotIn("Google Business", texte)
            self.assertNotIn("gbp", texte)
        self.assertEqual(re.findall(r"^(\d+)\. \*\*", recherche, re.M), list("12345"))
        self.assertIn("Les cinq étapes", recherche)
        methode = agent.split("## Méthode")[1].split("Pour chaque numéro")[0]
        self.assertEqual(re.findall(r"^(\d+)\. ", methode, re.M), list("12345678"))

        registre = {a["slug"]: a for a in json.loads(lire("registre/agents.json"))["agents"]}
        self.assertEqual(registre["enrichissement-coordonnees"]["connexions"], {"extraction": "lecture"})
        self.assertNotIn("Google", registre["enrichissement-coordonnees"]["mission"])
        self.assertEqual(registre["seo-local-geo"]["connexions"]["gbp"], "lecture")  # sa propre fiche, légitime

        sociaux = plat(lire("agents/reseaux-sociaux/AGENTS.md"))
        self.assertNotIn("toute réponse publique", sociaux)
        self.assertNotIn("réponses publiques", sociaux)
        self.assertIn("ton brouillon de réponse est préparé pour l'humain, qui la poste lui-même", sociaux)
        self.assertNotIn("réponses publiques", registre["reseaux-sociaux"]["titre"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
