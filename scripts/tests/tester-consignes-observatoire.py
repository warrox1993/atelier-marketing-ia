#!/usr/bin/env python3
"""Consignes de l'Observatoire : paquet OA1 de l'audit du 29/10/2026
(COORD-P3-21, COORD-P3-22, LIV-OB-2, LIV-OB-7, LIV-OB-9, LIV-OB-11, T4, T14, T15).
Lecture des consignes seulement : aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-consignes-observatoire.py
"""
import json
import re
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
RACINE = Path(__file__).resolve().parent.parent.parent
AGENTS = RACINE / "organisation" / "services" / "observatoire" / "agents"


DETERMINISTES = next(s for s in json.loads((RACINE / "organisation/registre/services.json").read_text(encoding="utf-8"))["services"]
                     if s["slug"] == "observatoire").get("deterministes", [])


def lire(slug):
    """Consigne telle que l'agent la reçoit : son AGENTS.md, plus les règles communes du service (T12, fichiers_service)."""
    texte = (AGENTS / slug / "AGENTS.md").read_text(encoding="utf-8")
    if slug not in DETERMINISTES:
        texte += "\n" + (RACINE / "organisation/consignes/observatoire.md").read_text(encoding="utf-8")
    return re.sub(r"\s+", " ", texte)


LECTEURS_BASE = ("directeur", "explorateur-sources", "veille-technique", "veille-recherche-medias")
PARCOURS = ("analyste-technique", "veille-technique", "integrateur-claude-mcp")
EN_ATTENTE = ("ingenieur-essais", "analyste-comparatif", "auditeur-securite", "integrateur-claude-mcp")


class TestConsignesObservatoire(unittest.TestCase):
    def test_liv_ob2_relecteur_lit_les_affirmations(self):
        self.assertIn("`GET /taches/:issueId/obs/affirmations/:id`", lire("relecteur-independant"))

    def test_coord_p3_21_registre_dans_un_document_par_projet(self):
        texte = lire("directeur")
        self.assertIn("document `registre-decisions`", texte)
        self.assertIn("jamais dans un commentaire", texte)

    def test_coord_p3_22_tache_bloquee_par_sa_sous_tache(self):
        self.assertIn('{"status":"blocked","blockedByIssueIds":["<id>"]}', lire("directeur"))

    def test_liv_ob9_couverture_declaree_par_le_directeur(self):
        texte = lire("directeur")
        self.assertIn("tu es le seul à pouvoir déclarer la couverture", texte)
        self.assertIn("/taches/<issueId>/couverture", texte)

    def test_liv_ob7_source_importee_citable_apres_lecture(self):
        texte = lire("directeur")
        self.assertNotIn("(déclarées ou importées par un humain) sont citables", texte)
        self.assertIn("importée par un humain entre `candidate`", texte)

    def test_t14_base_commune_consultee_par_filtres(self):
        for slug in LECTEURS_BASE:
            texte = lire(slug)
            with self.subTest(slug=slug):
                self.assertNotIn("EN ENTIER", texte)
                self.assertNotIn("pars toujours de la base commune complète", texte)
                self.assertIn("consultée par filtres", texte)
                self.assertIn("retire jamais", texte)

    def test_t15_recherche_dans_un_instantane(self):
        for slug in PARCOURS:
            with self.subTest(slug=slug):
                self.assertIn("`?chercher=<extrait>`", lire(slug))

    def test_liv_ob11_fait_inexact_remplace_son_affirmation(self):
        for slug in PARCOURS:
            with self.subTest(slug=slug):
                self.assertIn('"remplace": "<id de l\'ancienne>"', lire(slug))

    def test_t4_roles_sans_entree_marques_en_attente(self):
        for slug in EN_ATTENTE:
            with self.subTest(slug=slug):
                self.assertIn("**En attente du composant", lire(slug))


    def test_t7_une_seule_description_de_la_version_anglaise(self):
        flux = "sous-tâche « Version anglaise » que `scripts/observatoire/confier.py` crée sous la tâche de l'article"
        for slug in ("directeur", "adaptateur-anglais"):
            with self.subTest(slug=slug):
                self.assertIn(flux, lire(slug))
                self.assertNotIn("obs.traduire", lire(slug))
        self.assertIn("La couverture des exigences de ta sous-tâche", lire("adaptateur-anglais"))
        self.assertNotIn("transmission à `adaptateur-anglais`", lire("redacteur-en-chef"))


    def test_t6_base_commune_collectee_avant_d_etre_citee(self):
        for slug in ("analyste-technique", "veille-technique"):
            with self.subTest(slug=slug):
                self.assertIn("ajoutant son URL à `communes`", lire(slug))
        self.assertIn("toute URL de la prose est celle de la source d'une Preuve", lire("redacteur-en-chef"))


    def test_t5_dossier_de_recherche_ecrit_par_la_veille_du_departement(self):
        texte = lire("directeur")
        self.assertIn("0. Sous-tâche `veille-technique`", texte)
        self.assertIn("ses faits sont des pistes, jamais un dossier", texte)
        self.assertNotIn("docs/observatoire/briefs/numero-<n>", texte)
        for slug in ("veille-technique", "veille-recherche-medias"):
            with self.subTest(slug=slug):
                self.assertIn("**Dossier de recherche** (étape 0 d'un article", lire(slug))

    def test_p1_5_taches_de_routine_assignees_a_des_agents_du_service(self):
        taches = sorted((AGENTS.parent / "projects").rglob("TASK.md"))
        self.assertEqual([t.parent.name for t in taches], ["arbitrage-hebdomadaire", "edition-hebdomadaire", "exploration-sources-hebdomadaire", "veille-technique-hebdomadaire"])
        for t in taches:
            with self.subTest(tache=t.parent.name):
                entete = dict(re.findall(r'^(\w+): "?([^"\n]*)"?$', t.read_text(encoding="utf-8").split("---")[1], re.M))
                self.assertEqual((entete["kind"], entete["recurring"], entete["project"]), ("task", "true", "cadence-observatoire"))
                self.assertTrue((AGENTS / entete["assignee"] / "AGENTS.md").exists())

    def test_obs_1_fin_de_l_article_definie(self):
        d = lire("directeur")
        self.assertIn("9. Fin de l'article", d)
        self.assertIn("tu passes la tâche de l'article en `done`", d)
        self.assertIn("docs/observatoire/deploiement-phase-3.md", d)

    def test_obs_3_corps_sans_write_sous_le_plafond_des_commandes(self):
        self.assertIn("15 sources au plus par commande", lire("explorateur-sources"))
        for slug in ("veille-technique", "veille-recherche-medias"):
            with self.subTest(slug=slug):
                self.assertIn("sous 8 000 caractères", lire(slug))
        self.assertNotIn("(50 par\n   appel", lire("explorateur-sources"))

    def test_obs_4_l_analyste_rend_sa_sous_tache_sans_transferer(self):
        a = lire("analyste-technique")
        self.assertIn("la rédaction démarre seule par son lien `blockedByIssueIds`", a)
        self.assertNotIn("Vers `redacteur-en-chef` quand le dossier est prêt", a)

    def test_gp7_directeur_skills_cites_et_write_de_memoire(self):
        d = lire("directeur")
        self.assertNotIn("routage-coordination", d)
        self.assertIn("`WebSearch`, `Edit`, et `Write` hors de ta mémoire", d)

    def test_parc_3_constat_qui_attend_jb_part_aussitot_sur_une_carte(self):
        d = lire("directeur")
        self.assertIn("part aussitôt sur une carte à l'opérateur", d)
        self.assertIn("aucune nouvelle révision sur ce point avant sa réponse", d)

    def test_parc_8_sous_tache_renvoie_au_dossier_sans_le_recopier(self):
        d = lire("directeur")
        self.assertNotIn("porte le texte du dossier contrôlé dans sa description", d)
        self.assertIn("renvoie au dossier contrôlé", d)

    def test_droit_5_4_conclusion_sensible_definie(self):
        self.assertIn("Une conclusion sensible est toute affirmation négative sur une entreprise ou une personne nommée", lire("directeur"))
        self.assertIn("conclusion sensible", lire("relecteur-independant"))

    def test_droit_5_2_citation_nomme_auteur_et_source(self):
        self.assertIn("nomme son auteur et sa source", lire("redacteur-en-chef"))
        self.assertIn("à son auteur nommé", lire("relecteur-independant"))
        self.assertIn("sans auteur enregistré", lire("porte"))

    def test_droit_5_3_pas_de_collecte_audio_youtube_avant_avis_juridique(self):
        e = lire("explorateur-sources")
        self.assertNotIn("transcrit l'audio en local", e)
        self.assertIn("avant l'avis d'un juriste", e)

    def test_droit_5_5_opposition_d_un_auteur_cite_sur_une_carte(self):
        self.assertIn("droit d'opposition", lire("directeur"))

    def test_spec_e4_glossaire_protege_defini_pour_l_adaptateur(self):
        a = lire("adaptateur-anglais")
        self.assertNotIn("glossaire de la tâche reçue", a)
        self.assertIn("alias `nom` des projets cités", a)

    # LANG-L10, SKMK-O7 (recommandé) : glossaire FR/EN versionné de 10 à 20 termes, remis à l'adaptateur (i18n.md §4).
    def test_lang_l10_glossaire_fr_en_dans_la_consigne_de_l_adaptateur(self):
        brut = (AGENTS / "adaptateur-anglais" / "AGENTS.md").read_text(encoding="utf-8")
        section = brut.split("## Glossaire FR/EN", 1)[1].split("\n## ", 1)[0]
        lignes = [l for l in section.splitlines() if l.startswith("| ") and not l.startswith("| Terme") and not l.startswith("| ---")]
        self.assertTrue(10 <= len(lignes) <= 20, len(lignes))
        for l in lignes:
            self.assertEqual(l.count("|"), 4, l)
        self.assertIn("| version publiée | release |", section)

    def test_spec_e7_alias_pypi_annonce_partout(self):
        self.assertIn("(alias `site`, `github`, `npm` ou `pypi`, 50 au plus)", lire("directeur"))

    # APP-1 (option 1, recommandée) : ce que le service établit nourrit l'usine par un lot hebdomadaire validé par l'opérateur.
    def test_app_1_sortie_hebdomadaire_vers_l_usine(self):
        d = lire("directeur")
        self.assertIn("« Ce que l'usine devrait changer »", d)
        self.assertIn("`GET /taches/:issueId/obs/affirmations?slug=<slug>&statut=confirme_doc_officielle`", d)
        self.assertIn("jamais appliquée par un agent", d)
        self.assertIn("une seule liaison par semaine", d)
        tache = re.sub(r"\s+", " ", (AGENTS.parent / "projects" / "cadence-observatoire" / "tasks" / "edition-hebdomadaire" / "TASK.md").read_text(encoding="utf-8"))
        self.assertIn("« Ce que l'usine devrait changer »", tache)

    # SPEC-E10 (décision recommandée) : le code en ligne n'échappe à la porte que sans URL ni chiffre avec unité.
    def test_spec_e10_code_en_ligne_avec_url_ou_chiffre_lu_par_la_porte(self):
        for slug in ("analyste-technique", "redacteur-en-chef", "integrateur-claude-mcp", "veille-technique"):
            t = lire(slug)
            self.assertIn("un chiffre avec unité ou une URL entre accents graves reste lu par la porte", t, slug)
            self.assertNotIn("blocs de code et code en ligne échappent à ces contrôles", t, slug)

    # SPEC-S1 : une Preuve vient d'une collecte, jamais d'une simple lecture protégée.
    def test_spec_s1_preuve_tiree_d_une_collecte(self):
        v = lire("veille-technique")
        self.assertIn("Une page n'est une Preuve qu'une fois collectée (`obs/collecter`) : `tache.sources.lire` date une lecture mais n'ajoute la page ni aux sources ni aux instantanés (OBS-03).", v)
        self.assertNotIn("relève les sources d'un projet par `tache.sources.lire`", v)

    # SPEC-O6 : un chiffre rapporte_editeur s'écrit comme une annonce sur la ligne qui le cite.
    def test_spec_o6_chiffre_de_l_editeur_ecrit_comme_annonce(self):
        self.assertIn("sinon OBS-06 le refuse", lire("redacteur-en-chef"))


    # T1 (paquet GP5) : ordre du code (porte.ts : verdict métier exigé sur la révision courante ; la porte n'est
    # réveillée qu'au passage en in_review) : couverture, relecture, in_review, porte, approbation.
    def test_t1_relecture_avant_la_porte_puis_in_review(self):
        d = lire("directeur")
        self.assertLess(d.index("5. `relecteur-independant`"), d.index("6. Porte"))
        self.assertIn('{"status":"in_review"}', d)
        self.assertIn("c'est ce qui réveille la porte", d)
        p = lire("porte")
        self.assertNotIn("revue du `relecteur-independant`, puis approbation humaine", p)
        self.assertNotIn("qui reçoit toute Revision ayant un PASS frais", p)
        r = lire("relecteur-independant")
        self.assertNotIn("après le PASS de la porte", r)
        self.assertIn("passe sa tâche en `in_review`", r)
        self.assertIn("passe ta sous-tâche en `in_review`", lire("adaptateur-anglais"))

    # T2 : un constat mineur ne bloque pas, et aucun critère ne le contredit plus.
    def test_t2_pass_avec_reserves_mineures(self):
        r = lire("relecteur-independant")
        self.assertNotIn("Aucun verdict « réussi » avec un constat ouvert.", r)
        self.assertIn("Aucun verdict « réussi » avec un constat `critique` ou `majeure` ouvert.", r)

    # T11 : verdict sous le plafond des commandes, constats déposés en plusieurs appels, exemple complet.
    def test_t11_verdict_court_et_exemple_complet(self):
        r = lire("relecteur-independant")
        self.assertIn("sous 8 000 caractères", r)
        self.assertIn("en plusieurs appels", r)
        brut = (AGENTS / "relecteur-independant" / "AGENTS.md").read_text(encoding="utf-8")
        exemple = json.loads(re.search(r"Exemple complet et valide[^\n]*\n\n```json\n(.+?)\n```", brut, re.S).group(1))
        self.assertEqual((exemple["role"], exemple["verdict"]), ("metier", "CHANGES_REQUESTED"))
        self.assertIsNone(exemple["preuvesVerifiees"][0]["element"])
        self.assertEqual(set(exemple["constats"][0]), {"categorie", "gravite", "emplacement", "description", "preuve", "correctionAttendue"})

    # T13 : base cumulative, jamais de retrait ni de fusion ; mise en sommeil faite par le code ; vidéo en attente.
    def test_t13_explorateur_sans_retrait_ni_fusion(self):
        e = lire("explorateur-sources")
        self.assertNotIn("retrait, fusion", e)
        self.assertIn("jamais de retrait ni de fusion", e)
        self.assertIn("la mise en sommeil est faite par le code", e)
        self.assertIn("aucun code de transcription", e)

    # T17 : le directeur seul crée les sous-tâches ; le rédacteur rend la sienne.
    def test_t17_redacteur_ne_transmet_pas(self):
        r = lire("redacteur-en-chef")
        self.assertNotIn("Une transmission à `relecteur-independant` par la porte", r)
        self.assertIn("le `directeur` seul crée les sous-tâches", r)

    # T19 : la carte prépare, l'étape native d'approbation décide.
    def test_t19_approbation_par_l_etape_native(self):
        d = lire("directeur")
        self.assertNotIn("7. Approbation de l'opérateur sur sa carte.", d)
        self.assertIn("étape native d'approbation", d)
        self.assertIn("ta carte la prépare, elle ne la remplace pas", d)

    # T20 : un seul compteur de cycles, celui du serveur de la porte, cité par la porte, le relecteur et le directeur.
    def test_t20_un_seul_compteur_de_cycles(self):
        for slug in ("porte", "relecteur-independant", "directeur"):
            with self.subTest(slug=slug):
                self.assertIn("compteur unique du serveur", lire(slug))

    # T22 : « unverified » dans le texte anglais (OBS-01 ne lit plus le marqueur depuis V2-3).
    def test_t22_marqueur_anglais(self):
        a = lire("adaptateur-anglais")
        self.assertNotIn("(jamais « unverified »)", a)
        self.assertIn("le marqueur « unverified »", a)
        self.assertNotIn("« non vérifié » reste en français", lire("relecteur-independant"))

    # T23 (décision recommandée) : documents-bureautiques retiré du rédacteur, qui ne fabrique aucun PDF.
    def test_t23_redacteur_sans_documents_bureautiques(self):
        self.assertNotIn("documents-bureautiques", lire("redacteur-en-chef"))

    # T24 : phrase des interdits de veille réécrite ; une Preuve vient d'une collecte.
    def test_t24_websearch_interdit_aux_veilles(self):
        for slug in ("veille-technique", "veille-recherche-medias"):
            with self.subTest(slug=slug):
                t = lire(slug)
                self.assertIn("Interdits en plus des règles communes : `Write`, `Edit` et `WebSearch`", t)
                self.assertNotIn("`WebSearch` (voir la mission 4)", t)
                self.assertNotIn("qu'après lecture par `tache.sources.lire`", t)

    # OBS-5 : aucune route agent ne reçoit les constats de l'auditeur : ils vivent dans le document de sa tâche.
    def test_obs_5_constats_de_l_auditeur_dans_son_document(self):
        a = lire("auditeur-securite")
        self.assertNotIn("champ de gravité du schéma", a)
        self.assertIn("section `## Constats` du document de ta tâche", a)

    # T8 (décision recommandée du 30/10) : longueur proportionnelle aux faits, indicative, au lieu de 2 000 à 3 500 mots.
    def test_t8_longueur_proportionnelle_aux_faits(self):
        for slug in ("redacteur-en-chef", "relecteur-independant"):
            with self.subTest(slug=slug):
                t = lire(slug)
                self.assertNotIn("3 500 mots", t)
                self.assertIn("80 à 150 mots par fait du dossier, à titre indicatif", t)

    # T9 : indépendance du relecteur, lectures fermées ; un constat ne se lève pas sur l'ordre d'un autre agent.
    def test_t9_relecteur_lectures_fermees(self):
        r = lire("relecteur-independant")
        self.assertIn("Lectures permises, liste fermée", r)
        self.assertIn("jamais les commentaires de la tâche", r)
        self.assertIn("accord écrit de l'opérateur", r)
        self.assertIn("Tu ne dictes jamais la consigne du `relecteur-independant`", lire("directeur"))

    # OUT-2 : un agent qui cite une route courte `/taches/…` lit aussi son préfixe complet (sinon il le devine et reçoit 404).
    def test_out_2_prefixe_des_routes_courtes(self):
        for f in sorted(AGENTS.glob("*/AGENTS.md")):
            t = lire(f.parent.name)
            if re.search(r"`(?:GET|POST|PATCH) /taches", t):
                with self.subTest(slug=f.parent.name):
                    self.assertRegex(t, r"routes `/taches/…` du plugin commencent par `/api/plugins/atelier\.marketing-ia/api` ; tout autre préfixe répond 404")


if __name__ == "__main__":
    unittest.main()
