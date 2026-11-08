#!/usr/bin/env python3
"""Consignes RGPD et AI Act des paquets R1 et R2 de l'audit du 29/10/2026 (MK-11, MK-12, MKT-8, LIV-MK-3, LIV-MK-7, T18 ;
DROIT-1.1, DROIT-1.2, DROIT-1.5, DROIT-2.4, P3-4 ;
R3 : SKMK-E01 à E04, E14, E19, E28, FSMA et IDD relus).
Lecture des consignes seulement : aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-consignes-rgpd.py
"""
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


class TestConsignesRgpd(unittest.TestCase):
    def test_mk11_praticien_en_nom_propre_admis_avec_base_legale_ecrite(self):
        prospection = plat(lire("agents/prospection/AGENTS.md"))
        # Plus de règle contradictoire : la BCE reste exclue, le praticien en nom propre est admis sous conditions.
        self.assertNotIn("B2B : entreprises seulement", prospection)
        self.assertNotIn("une personne physique n'est jamais retenue", prospection)
        for attendu in ("Les données BCE d'une personne physique ne servent jamais au marketing direct",
                        "mise en balance validée par un humain", "art. 14, § 3", "art. 21, § 4",
                        "mise en balance : non fournie (optionnel)",
                        "le lead est collecté et déposé quand même, sans rien demander",
                        "information art. 14 : à faire au plus tard au premier contact"):
            self.assertIn(attendu, prospection)
        # Décision de l'opérateur du 30/10/2026 : la mise en balance est un document optionnel, son absence ne bloque plus le lead.
        self.assertNotIn("à qualifier : base légale manquante", prospection)
        relecteur = plat(lire("agents/relecteur/AGENTS.md"))
        self.assertIn("Un praticien en nom propre (personne physique) dans une liste est un constat critique", relecteur)
        conformite = plat(lire("agents/conformite-publicitaire/AGENTS.md"))
        self.assertNotIn("sans mise en balance est un point bloquant", conformite)
        self.assertIn("sinon « mise en balance : non fournie (optionnel) », sans bloquer la liste ni la demander", conformite)
        self.assertIn("Sans consentement, aucun courriel à une personne physique et aucun appel téléphonique", conformite)
        self.assertIn("Une mise en balance absente, notée « non fournie (optionnel) », n'est pas un constat", relecteur)

    def test_mk12_video_livree_comme_document_et_relue(self):
        reseaux = plat(lire("agents/reseaux-sociaux/AGENTS.md"))
        self.assertIn("par le document livrable de la tâche", reseaux)
        self.assertNotIn("**Livraison** : par le commentaire de fin de tâche", reseaux)
        self.assertIn("liste APRÈS de `conformite-publicite-ia`", plat(lire("agents/relecteur/AGENTS.md")))

    def test_mkt8_regles_rgpd_de_l_aimant_a_prospects(self):
        conformite = plat(lire("agents/conformite-publicitaire/AGENTS.md"))
        for attendu in ("information de l'art. 13 au moment de la collecte", "art. 7, § 4", "jamais pré-cochée",
                        "art. 7, § 3", "art. 7, § 1"):
            self.assertIn(attendu, conformite)

    def test_liv_mk7_liste_de_demarchage_controlee_avec_textes_lus(self):
        conformite = plat(lire("agents/conformite-publicitaire/AGENTS.md"))
        self.assertIn("## Contrôle d'une liste destinée à un démarchage", lire("agents/conformite-publicitaire/AGENTS.md"))
        self.assertIn("3 ans sans contact", conformite)
        self.assertNotIn("Ne m'appelez plus", conformite)
        coordinateur = plat(lire("agents/coordinateur/AGENTS.md"))
        self.assertIn("toute liste de prospects destinée à un démarchage (appel, courriel, courrier) : revue `conformite` de la Conformité publicitaire", coordinateur)
        reference = lire("skills/controle-communications-reglementees/references/rgpd-prospection.md")
        self.assertIn("https://publications.europa.eu/resource/celex/32016R0679", reference)
        for article in ("(art. 6, § 1)", "(art. 7)", "(art. 13)", "(art. 14)", "(art. 21)"):
            self.assertIn(article, reference)
        self.assertIn("references/rgpd-prospection.md", lire("skills/controle-communications-reglementees/SKILL.md"))

    def test_liv_mk3_besoin_d_un_service_ouvre_une_liaison(self):
        coordinateur = plat(lire("agents/coordinateur/AGENTS.md"))
        self.assertIn("« BESOIN : » adressé à un autre service", coordinateur)
        self.assertIn("POST /api/plugins/atelier.marketing-ia/api/taches/<issueId>/liaisons", coordinateur)
        # La route citée fait générer sa fiche de corps de requête.
        self.assertIn("### POST /taches/:issueId/liaisons", lire("agents/coordinateur/AGENTS.md"))

    def test_t18_grille_du_relecteur_observatoire(self):
        grille = plat(lire("services/observatoire/agents/relecteur-independant/AGENTS.md"))
        for attendu in ("10. Citation d'un texte tiers : courte", "11. Affirmation défavorable à une entreprise",
                        "preuve primaire", "12. Données personnelles d'un auteur",
                        "La mention d'assistance IA et de responsabilité éditoriale est ajoutée à l'export"):
            self.assertIn(attendu, grille)

    def test_droit_1_2_base_legale_art_6_seulement_avec_mise_en_balance(self):
        enrich = plat(lire("agents/enrichissement-coordonnees/AGENTS.md"))
        recoup = plat(lire("skills/coordonnees-recoupement/SKILL.md"))
        for texte in (enrich, recoup):
            self.assertNotIn("numéro publié par la personne elle-même)", texte)
            self.assertNotIn("Base légale : intérêt légitime B2B | numéro publié par la personne", texte)
            self.assertIn("art. 6, § 1, f", texte)
            self.assertIn("mise en balance validée par un humain", texte)
        self.assertIn("Base légale : intérêt légitime (art. 6, § 1, f), mise en balance <référence> | intérêt légitime (art. 6, § 1, f), mise en balance : non fournie (optionnel)", recoup)
        for texte in (enrich, recoup):
            self.assertNotIn("mise en balance manquante", texte)  # décision de l'opérateur du 30/10/2026 : document optionnel
            self.assertIn("mise en balance : non fournie (optionnel)", texte)

    def test_droit_1_5_minimisation_standard_d_abord_aucun_motif_d_absence(self):
        for rel in ("agents/enrichissement-coordonnees/AGENTS.md", "skills/coordonnees-recoupement/SKILL.md"):
            texte = plat(lire(rel))
            self.assertIn("le standard ou la ligne du cabinet d'abord", texte, rel)
            self.assertIn("seulement s'il est le seul numéro professionnel publié", texte, rel)
            self.assertIn("jamais le motif d'une absence", texte, rel)

    def test_droit_2_4_textes_belges_lus_a_la_source(self):
        reference = plat(lire("skills/controle-communications-reglementees/references/rgpd-prospection.md"))
        self.assertNotIn("n'ont pas été relus pour cette fiche", reference)
        for attendu in ("https://www.ejustice.just.fgov.be/eli/arrete/2003/04/04/2003011238/justel",
                        "https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel",
                        "https://www.ejustice.just.fgov.be/eli/loi/2018/07/30/2018040581/justel",
                        "« La preuve du caractère sollicité des publicités par courrier électronique incombe au prestataire. »",
                        "il fournit à ses clients, au moment où leurs coordonnées électroniques sont recueillies, la faculté de s'opposer",
                        "auprès de personnes morales si les coordonnées électroniques qu'il utilise à cette fin sont impersonnelles",
                        "enfants âgés de 13 ans ou plus"):
            self.assertIn(attendu, reference)
        matrice = plat((RACINE / "plugin-atelier/src/contrats/prospection.ts").read_text(encoding="utf-8"))
        self.assertIn("coordonnées obtenues directement lors d'une vente, opposition offerte dès la collecte", matrice)
        self.assertIn("CDE, art. XII.13", matrice)

    def test_droit_1_1_modele_d_information_art_14_sans_envoi(self):
        modele = plat(lire("skills/controle-communications-reglementees/references/information-art14.md"))
        for attendu in ("Rien n'est envoyé par l'atelier", "la source d'où proviennent les données", "accessibles au public",
                        "Autorité de protection des données", "art. 21", "au plus tard au moment de la première communication",
                        "preuve du consentement (date, moyen, texte accepté)"):
            self.assertIn(attendu, modele)
        self.assertIn("references/information-art14.md", lire("skills/controle-communications-reglementees/SKILL.md"))
        self.assertIn("references/information-art14.md", plat(lire("agents/conformite-publicitaire/AGENTS.md")))

    def test_p3_4_politique_de_corrections_de_l_observatoire(self):
        for rel in ("services/observatoire/agents/redacteur-en-chef/AGENTS.md", "services/observatoire/agents/directeur/AGENTS.md"):
            texte = plat(lire(rel))
            self.assertIn("## Corrections", texte, rel)
            self.assertIn("date, ancien texte, nouveau texte, motif", texte, rel)
            self.assertIn("jamais en silence", texte, rel)

    def test_droit_1_8_modele_de_contrat_art_28(self):
        contrat = plat((RACINE / "docs/rgpd/contrat-sous-traitance-art28.md").read_text(encoding="utf-8"))
        self.assertIn("À faire valider par un juriste avant signature", contrat)
        self.assertIn("https://publications.europa.eu/resource/celex/32016R0679", contrat)
        self.assertIn("https://publications.europa.eu/resource/celex/32021D0915", contrat)
        for point in "abcdefgh":
            self.assertIn(f"(art. 28, § 3, {point})", contrat)
        for attendu in ("3 ans sans contact", "aucun appel", "sous-traitants ultérieurs", "Signatures"):
            self.assertIn(attendu, contrat)
        self.assertNotIn("—", contrat)

    def test_skmk_e01_aimant_aligne_sur_l_outil_de_captation(self):
        aimant = plat(lire("skills/aimant-a-prospects/SKILL.md"))
        for absent in ("e-mail (obligatoire)", "téléphone FACULTATIF", "champ téléphone facultatif", "Téléphone facultatif, justifié"):
            self.assertNotIn(absent, aimant)
        for attendu in ("téléphone obligatoire, e-mail facultatif", "`offre_type` `guide_gratuit`",
                        "remis par l'humain au rappel", "art. 7, § 4", "jamais une condition du guide"):
            self.assertIn(attendu, aimant)

    def test_skmk_e02_adresse_impersonnelle_regle_unique(self):
        prospects = plat(lire("skills/recherche-prospects/SKILL.md"))
        self.assertNotIn("une adresse de rôle (info@, ventes@) n'entre pas dans une séquence personnelle", prospects)
        for attendu in ("adresse impersonnelle d'une personne morale (`info@`, `contact@`)", "AR du 4 avril 2003, art. 1er",
                        "`controle-communications-reglementees/references/rgpd-prospection.md`"):
            self.assertIn(attendu, prospects)

    def test_skmk_e03_information_art_14_dans_la_collecte_indirecte(self):
        for nom in ("recherche-prospects", "coordonnees-recherche", "coordonnees-recoupement", "achat-coordonnees-fournisseur"):
            texte = plat(lire(f"skills/{nom}/SKILL.md"))
            self.assertIn("information art. 14 : à faire au plus tard au premier contact", texte, nom)
            self.assertIn("references/information-art14.md", texte, nom)

    def test_skmk_e04_fournisseur_sans_nom_requete_par_l_humain(self):
        achat = plat(lire("skills/achat-coordonnees-fournisseur/SKILL.md"))
        for absent in ("Lusha", "Kaspr", "la requête est faite avec le compte fourni"):
            self.assertNotIn(absent, achat)
        for attendu in ("la requête est faite par l'humain", "preuve de l'origine des données"):
            self.assertIn(attendu, achat)

    def test_skmk_e19_linkedin_page_entreprise_lue_par_l_humain(self):
        recherche = plat(lire("skills/coordonnees-recherche/SKILL.md"))
        self.assertNotIn("profil public ouvert sans connexion", recherche)
        self.assertIn("page entreprise seulement, lue par l'humain", recherche)

    def test_skmk_e14_loi_cookies_relue_et_acces_reel(self):
        suivi = plat(lire("skills/suivi-conversions/SKILL.md"))
        self.assertNotIn("13 juin 2005", suivi)
        for attendu in ("art. 10/2 de la loi du 30 juillet 2018", "https://www.ejustice.just.fgov.be/eli/loi/2018/07/30/2018040581/justel",
                        "L'agent n'a aucun accès au gestionnaire de balises"):
            self.assertIn(attendu, suivi)

    def test_skmk_e28_publicite_b2b_vi_104(self):
        conformite = plat(lire("skills/conformite-publicite-ia/SKILL.md"))
        self.assertIn("VI.104", conformite)

    def test_r2_reste_fsma_idd_relus_a_la_source(self):
        controle = plat(lire("skills/controle-communications-reglementees/SKILL.md"))
        for absent in ("[mémoire de l'article]", "novembre 2025", "IDD, article 20 [mémoire"):
            self.assertNotIn(absent, controle)
        for attendu in ("loi du 4 avril 2014 relative aux assurances, art. 279, § 2", "art. 284, § 1er", "art. 284, § 5",
                        "directive (UE) 2016/97, art. 17, § 2", "art. 20, § 5",
                        "https://www.ejustice.just.fgov.be/eli/loi/2014/04/04/2014011239/justel",
                        "https://publications.europa.eu/resource/celex/32016L0097",
                        "https://www.fsma.be/sites/default/files/media/files/2024-11/rapportsectoriel-devoirdediligence-courtiersassurances.pdf",
                        "https://www.fsma.be/sites/default/files/media/files/2024-10/fsma_2022_06_fr.pdf"):
            self.assertIn(attendu, controle)
        reference = plat(lire("skills/controle-communications-reglementees/references/rgpd-prospection.md"))
        self.assertNotIn("Les règles FSMA et IDD (assurance) ne sont pas relues dans cette fiche", reference)

    def test_aucun_tiret_cadratin(self):
        for rel in ("agents/prospection/AGENTS.md", "agents/relecteur/AGENTS.md", "agents/conformite-publicitaire/AGENTS.md",
                    "agents/coordinateur/AGENTS.md", "agents/reseaux-sociaux/AGENTS.md",
                    "services/observatoire/agents/relecteur-independant/AGENTS.md",
                    "skills/controle-communications-reglementees/references/rgpd-prospection.md",
                    "skills/controle-communications-reglementees/references/information-art14.md",
                    "agents/enrichissement-coordonnees/AGENTS.md", "skills/coordonnees-recoupement/SKILL.md",
                    "services/observatoire/agents/redacteur-en-chef/AGENTS.md", "services/observatoire/agents/directeur/AGENTS.md",
                    "skills/aimant-a-prospects/SKILL.md", "skills/recherche-prospects/SKILL.md", "skills/coordonnees-recherche/SKILL.md",
                    "skills/achat-coordonnees-fournisseur/SKILL.md", "skills/suivi-conversions/SKILL.md",
                    "skills/conformite-publicite-ia/SKILL.md", "skills/controle-communications-reglementees/SKILL.md"):
            self.assertNotIn("—", lire(rel), rel)

    def test_aucune_consigne_ne_reclame_la_liste_ne_m_appelez_plus(self):
        # Décision de l'opérateur du 07/11/2026 : la liste est retirée en entier ; les oppositions restent (facultatives).
        sources = (list(ORGA.glob("agents/*/AGENTS.md")) + list(ORGA.glob("services/*/agents/*/AGENTS.md"))
                   + list(ORGA.glob("skills/**/*.md")) + [ORGA / "registre/agents.json", ORGA / "registre/routes-agents.md"])
        self.assertGreater(len(sources), 100)
        for source in sources:
            texte = source.read_text(encoding="utf-8")
            for motif in ("Ne m'appelez plus", "Ne m’appelez plus", "DNCM"):
                self.assertNotIn(motif, texte, str(source.relative_to(ORGA)))
            # Tolère le retour à la ligne et l'apostrophe typographique entre les mots.
            self.assertIsNone(re.search(r"m.appelez\s+plus", texte, re.I), str(source.relative_to(ORGA)))
        conformite = plat(lire("agents/conformite-publicitaire/AGENTS.md"))
        self.assertIn("la liste des oppositions appliquée", conformite)
        self.assertIn("3 ans sans contact", conformite)


if __name__ == "__main__":
    unittest.main(verbosity=1)
