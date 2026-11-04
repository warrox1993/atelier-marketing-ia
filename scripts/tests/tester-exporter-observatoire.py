#!/usr/bin/env python3
"""Tests de « exporter-observatoire.py » : dépôt git temporaire, aucune API.

À lancer : python3 -I scripts/tests/tester-exporter-observatoire.py
"""
import copy
import hashlib
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("exporter_observatoire", ICI.parent / "exporter-observatoire.py")
eo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eo)

A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

STATUTS = ("verifie_experimentalement", "confirme_doc_officielle", "rapporte_editeur", "rapporte_tiers", "infere", "non_verifie", "contredit", "obsolete")
CHAMPS_FICHE = ("nom", "logo", "descriptionCourte", "categorie", "objectifPrincipal", "problemeResolu", "editeur", "siteOfficiel", "depotSource",
                "licence", "derniereVersion", "dateDerniereVersion", "dateVerification", "plateformes", "compatibiliteClaudeMcp", "prerequis", "niveauDifficulte",
                "coutsLicenceCommerciale", "avantages", "limitations", "risquesNotables", "casUsage", "alternatives", "tutorielDemarrage",
                "liensSources", "accesDossierComplet")


def fiche_serveur():
    """Fiche telle que le serveur l'envoie : 26 champs {valeur, statut, affirmationId}, presque tous inconnus."""
    fiche = {k: {"valeur": None, "statut": "non_verifie", "affirmationId": None} for k in CHAMPS_FICHE}
    fiche["licence"] = {"valeur": "MIT", "statut": "confirme_doc_officielle", "affirmationId": A1}
    fiche["siteOfficiel"] = {"valeur": "https://exemple.org/outil", "statut": "rapporte_editeur", "affirmationId": A2}
    fiche["plateformes"] = {"valeur": ["linux", "macOS"], "statut": "infere", "affirmationId": A1}
    return fiche


REVISION = {
    "id": "rev-1", "projet": {"slug": "outil-x", "nom": "Outil X"}, "langue": "fr", "statut": "valide",
    "numero": 3, "baseRevisionFr": None, "verifieLe": "2026-10-27",
    "sources": [{"id": "s1", "url": "https://exemple.org/s1"}, {"id": "s2", "url": "https://exemple.org/s2"}],
    # Forme réelle du serveur : {id, texte, statut, chapitre, sourceIds}, jamais de « valeur ».
    "affirmations": [
        {"id": A1, "texte": "Licence MIT", "statut": "confirme_doc_officielle", "chapitre": "ch01", "sourceIds": ["s2", "s1"]},
        {"id": A2, "texte": "Dernière version", "statut": "non_verifie", "chapitre": "ch01", "sourceIds": []},
    ],
    "fiche": fiche_serveur(),
    "corps": "# Outil X\n\nTexte.\n",
}


def liste_pour(rev, **ecarts):
    """Réponse de POST /obs/publications/a-exporter : seules les révisions validées par un humain y figurent."""
    art = rev.get("article")
    entree = {"id": rev["id"], "dossierId": "d1", "slug": (art or rev["projet"])["slug"], "articleNumero": art["numero"] if art else None,
              "langue": rev["langue"], "numero": rev["numero"],
              "empreinte": hashlib.sha256(rev["corps"].encode("utf-8")).hexdigest(), "contenuMd": rev["corps"],
              # Données du serveur (lues en base) : le script ne publie rien d'autre que ces champs et le corps approuvé.
              "affirmations": copy.deepcopy(rev["affirmations"]),
              "sources": [{"id": x["id"], "url": x["url"]} for x in rev["sources"]], "verifieLe": rev["verifieLe"],
              "baseRevisionFr": rev.get("baseRevisionFr"),
              "secondeDecision": {"requise": False, "motifs": [], "confirmee": False}}
    if not art:
        entree["fiche"] = copy.deepcopy(rev["fiche"])
    entree.update(ecarts)
    return {"copiees": 0, "aPublier": [entree]}


ARTICLE = {
    "id": "rev-a1", "article": {"numero": 0, "slug": "agents-cooperants", "titre": "Agents coopérants", "chapeau": "Ils se passent le relais."},
    "langue": "fr", "numero": 2, "baseRevisionFr": None, "verifieLe": "2026-10-27",
    "sources": [{"id": "s1", "url": "https://exemple.org/s1"}],
    "affirmations": [{"id": A1, "texte": "Relais testé", "statut": "verifie_experimentalement", "chapitre": "ch01", "sourceIds": ["s1"]}],
    "corps": "# Agents coopérants\n\nIls se passent le relais.\n\nTexte.\n",
}

LISTE = liste_pour(REVISION)


def git(depot, *args):
    return subprocess.run(["git", "-C", str(depot), *args], capture_output=True, text=True, check=True).stdout


class TestExport(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="atelier-test-export-")
        self.addCleanup(self._tmp.cleanup)
        self.depot = Path(self._tmp.name)
        git(self.depot, "init", "-q")
        git(self.depot, "config", "user.name", "Test")
        git(self.depot, "config", "user.email", "test@example.org")

    def fiche(self):
        return self.depot / "fr" / "projets" / "outil-x" / "fiche.md"

    def test_premier_export_renvoie_un_hash_et_ecrit_les_ancres(self):
        h = eo.exporter(REVISION, self.depot, LISTE)
        self.assertRegex(h, r"^[0-9a-f]{40}$")
        texte = self.fiche().read_text(encoding="utf-8")
        self.assertIn(f'<a id="a-{A1}"></a>', texte)
        self.assertIn(f'<a id="a-{A2}"></a>', texte)
        self.assertIn('projet: "outil-x"', texte)
        self.assertEqual(git(self.depot, "log", "-1", "--format=%s").strip(), "observatoire: outil-x révision 3 (fr)")

    def test_reexport_identique_ne_commit_pas(self):
        eo.exporter(REVISION, self.depot, LISTE)
        avant = git(self.depot, "rev-list", "--count", "HEAD").strip()
        self.assertIsNone(eo.exporter(REVISION, self.depot, LISTE))
        self.assertEqual(git(self.depot, "rev-list", "--count", "HEAD").strip(), avant)

    def test_depot_sale_refuse(self):
        (self.depot / "brouillon.txt").write_text("x")
        with self.assertRaises(eo.ExportRefuse):
            eo.exporter(REVISION, self.depot, LISTE)

    def test_statut_approuvee_declare_mais_absent_de_la_liste_refuse(self):
        rev = copy.deepcopy(REVISION)
        rev["statut"] = "approuvee"
        with self.assertRaisesRegex(eo.ExportRefuse, "absente de la liste"):
            eo.exporter(rev, self.depot, {"copiees": 0, "aPublier": []})
        self.assertFalse(self.fiche().exists())

    def test_empreinte_differente_refusee(self):
        with self.assertRaisesRegex(eo.ExportRefuse, "empreinte"):
            eo.exporter(REVISION, self.depot, liste_pour(REVISION, empreinte="0" * 64))
        self.assertFalse(self.fiche().exists())

    def test_corps_du_fichier_different_du_contenu_valide_refuse(self):
        rev = copy.deepcopy(REVISION)
        rev["corps"] = "# Outil X\n\nTexte modifié après validation.\n"
        with self.assertRaisesRegex(eo.ExportRefuse, "empreinte"):
            eo.exporter(rev, self.depot, LISTE)
        self.assertFalse(self.fiche().exists())

    def test_statut_ecrit_est_celui_du_serveur_pas_celui_du_fichier(self):
        rev = copy.deepcopy(REVISION)
        rev["statut"] = "n-importe-quoi"
        eo.exporter(rev, self.depot, LISTE)
        self.assertIn('statut: "valide"', self.fiche().read_text(encoding="utf-8"))

    def test_langue_divergente_du_serveur_refusee(self):
        with self.assertRaisesRegex(eo.ExportRefuse, "langue"):
            eo.exporter(REVISION, self.depot, liste_pour(REVISION, langue="en"))
        self.assertFalse((self.depot / "fr").exists())

    def test_numero_divergent_du_serveur_refuse(self):
        with self.assertRaisesRegex(eo.ExportRefuse, "numéro"):
            eo.exporter(REVISION, self.depot, liste_pour(REVISION, numero=9))
        self.assertFalse((self.depot / "fr").exists())

    def test_chemin_construit_avec_le_slug_du_serveur(self):
        eo.exporter(REVISION, self.depot, liste_pour(REVISION, slug="slug-serveur"))
        self.assertTrue((self.depot / "fr" / "projets" / "slug-serveur" / "fiche.md").exists())
        self.assertFalse(self.fiche().exists())

    def test_article_chemin_construit_avec_slug_et_numero_du_serveur(self):
        eo.exporter(ARTICLE, self.depot, liste_pour(ARTICLE, slug="slug-serveur", articleNumero=7))
        self.assertTrue((self.depot / "fr" / "magazine" / "7" / "slug-serveur.md").exists())

    def test_ligne_technique_base_revision_fr_absente_du_corps_publie(self):
        en = copy.deepcopy(REVISION)
        en.update(langue="en", baseRevisionFr="rev-fr-1", corps="base_revision_fr: rev-fr-1\n\n# Tool X\n\nText.\n")
        eo.exporter(en, self.depot, liste_pour(en))
        texte = (self.depot / "en" / "projets" / "outil-x" / "fiche.md").read_text(encoding="utf-8")
        lignes = [l for l in texte.splitlines() if l.startswith("base_revision_fr:")]
        self.assertEqual(lignes, ['base_revision_fr: "rev-fr-1"'])
        self.assertIn("# Tool X", texte)

    def test_filiation_anglaise_publiee_est_celle_du_serveur(self):
        # T7 : le corps déclare la révision native du document français ; le site compare à la révision française publiée (id du serveur).
        en = copy.deepcopy(REVISION)
        en.update(langue="en", baseRevisionFr="rev-fr-publiee", corps="base_revision_fr: doc-natif-9\n\n# Tool X\n\nText.\n")
        eo.exporter(en, self.depot, liste_pour(en))
        tete, _ = self.en_tete(self.depot / "en" / "projets" / "outil-x" / "fiche.md")
        self.assertEqual(tete["base_revision_fr"], "rev-fr-publiee")

    def test_revision_anglaise_sans_filiation_du_serveur_refusee(self):
        en = copy.deepcopy(REVISION)
        en.update(langue="en", baseRevisionFr=None, corps="base_revision_fr: doc-natif-9\n\n# Tool X\n\nText.\n")
        with self.assertRaisesRegex(eo.ExportRefuse, "française"):
            eo.exporter(en, self.depot, liste_pour(en))
        self.assertFalse((self.depot / "en").exists())

    def en_tete(self, chemin=None):
        texte = (chemin or self.fiche()).read_text(encoding="utf-8")
        return yaml.safe_load(texte.split("\n---\n", 1)[0].removeprefix("---\n")), texte

    def test_affirmations_sans_faux_inconnu(self):
        eo.exporter(REVISION, self.depot, LISTE)
        texte = self.fiche().read_text(encoding="utf-8")
        self.assertIn(f'<a id="a-{A1}"></a>Licence MIT (confirme_doc_officielle)', texte)
        self.assertIn(f'<a id="a-{A2}"></a>Dernière version (non_verifie)', texte)
        self.assertNotIn("inconnu", texte)
        self.assertNotIn("None", texte)

    def test_fiche_en_tete_structure(self):
        eo.exporter(REVISION, self.depot, LISTE)
        tete, texte = self.en_tete()
        self.assertEqual(list(tete), ["projet", "revision", "langue", "base_revision_fr", "verifie_le", "statut", "sources", "affirmations", "renvois", "champs"])
        self.assertEqual(tete["champs"], REVISION["fiche"])
        self.assertEqual(list(tete["champs"]), list(CHAMPS_FICHE))
        self.assertEqual(tete["sources"], ["https://exemple.org/s1", "https://exemple.org/s2"])
        self.assertEqual(tete["affirmations"], [A1, A2])
        self.assertEqual(tete["renvois"], {A1: [2, 1], A2: []})
        for cle in ("renvois:", "champs:"):  # une ligne chacun
            self.assertEqual(len([l for l in texte.splitlines() if l.startswith(cle)]), 1)

    def test_fiche_valeur_avec_separateurs_de_ligne_yaml_conservee(self):
        rev = copy.deepcopy(REVISION)
        rev["fiche"]["nom"] = {"valeur": "A\u2028B\u0085C\u2029D: \"e\" #f", "statut": "rapporte_tiers", "affirmationId": A1}
        eo.exporter(rev, self.depot, liste_pour(rev))
        self.assertEqual(self.en_tete()[0]["champs"], rev["fiche"])

    def test_categorie_hors_liste_refusee_et_slug_accepte(self):
        for valeur in ("Outil", "Agents", "modèles", ""):
            rev = copy.deepcopy(REVISION)
            rev["fiche"]["categorie"] = {"valeur": valeur, "statut": "infere", "affirmationId": A1}
            with self.subTest(refusee=valeur):
                with self.assertRaisesRegex(eo.ExportRefuse, "categorie"):
                    eo.exporter(rev, self.depot, liste_pour(rev))
        self.assertFalse(self.fiche().exists())
        rev = copy.deepcopy(REVISION)
        rev["fiche"]["categorie"] = {"valeur": "outils-de-code", "statut": "infere", "affirmationId": A1}
        eo.exporter(rev, self.depot, liste_pour(rev))
        self.assertEqual(self.en_tete()[0]["champs"]["categorie"]["valeur"], "outils-de-code")

    def test_fiche_serveur_invalide_refusee(self):
        def sans(cle):
            return lambda f: f.pop(cle)
        def statut(f): f["licence"]["statut"] = "verifiee"
        def guid(f): f["licence"]["affirmationId"] = "a1"
        def orpheline(f): f["nom"] = {"valeur": "X", "statut": "infere", "affirmationId": None}
        def extra(f): f["intrus"] = {"valeur": None, "statut": "non_verifie", "affirmationId": None}
        def cle_champ(f): f["licence"]["autre"] = 1
        def schema_site(f): f["siteOfficiel"]["valeur"] = "javascript:alert(1)"
        def schema_depot(f): f["depotSource"] = {"valeur": "ftp://exemple.org/x", "statut": "infere", "affirmationId": A1}
        def liens_ftp(f): f["liensSources"] = {"valeur": ["https://exemple.org/a", "ftp://exemple.org/x"], "statut": "infere", "affirmationId": A1}
        def liens_pas_liste(f): f["liensSources"] = {"valeur": "https://exemple.org/a", "statut": "infere", "affirmationId": A1}
        def pas_dict(f): f["logo"] = "x"
        cas = {"clé manquante": sans("nom"), "fiche à 25 clés (dateDerniereVersion manquante)": sans("dateDerniereVersion"), "statut": statut, "guid": guid, "valeur sans affirmation": orpheline, "clé en trop": extra,
               "sous-clé en trop": cle_champ, "siteOfficiel javascript": schema_site, "depotSource ftp": schema_depot, "liensSources ftp": liens_ftp, "liensSources pas une liste": liens_pas_liste, "champ pas dict": pas_dict}
        for nom, alterer in cas.items():
            liste = liste_pour(REVISION)
            alterer(liste["aPublier"][0]["fiche"])
            with self.subTest(cas=nom):
                with self.assertRaisesRegex(eo.ExportRefuse, "fiche"):
                    eo.exporter(REVISION, self.depot, liste)
        for nom, valeur in (("absente", None), ("pas un dict", [])):
            liste = liste_pour(REVISION)
            if valeur is None:
                del liste["aPublier"][0]["fiche"]
            else:
                liste["aPublier"][0]["fiche"] = valeur
            with self.subTest(cas=nom):
                with self.assertRaisesRegex(eo.ExportRefuse, "fiche"):
                    eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_fiche_refusee_par_le_schema_du_site_refusee_avant_ecriture(self):
        """X2 : les contrôles du schéma du site (content.config.ts) sont repris, sinon un export validé casse la construction."""
        inconnue = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        def id_absent(f): f["nom"] = {"valeur": "X", "statut": "infere", "affirmationId": inconnue}
        def prouve_sans_source(f): f["derniereVersion"] = {"valeur": "1.0", "statut": "confirme_doc_officielle", "affirmationId": A2}
        def prouve_sans_affirmation(f): f["logo"] = {"valeur": None, "statut": "verifie_experimentalement", "affirmationId": None}
        def texte_vide(f): f["nom"] = {"valeur": "  ", "statut": "infere", "affirmationId": A1}
        def texte_pas_chaine(f): f["nom"] = {"valeur": ["X"], "statut": "infere", "affirmationId": A1}
        def liste_element_vide(f): f["plateformes"]["valeur"] = ["linux", ""]
        def liste_pas_liste(f): f["plateformes"]["valeur"] = "linux"
        def date_non_iso(f): f["dateVerification"] = {"valeur": "27/10/2026", "statut": "infere", "affirmationId": A1}
        def date_impossible(f): f["dateDerniereVersion"] = {"valeur": "2026-02-30", "statut": "infere", "affirmationId": A1}
        cas = {"affirmationId absent des affirmations": id_absent, "statut prouvé sans source": prouve_sans_source,
               "statut prouvé sans affirmation": prouve_sans_affirmation, "texte vide": texte_vide, "texte pas une chaîne": texte_pas_chaine,
               "élément de liste vide": liste_element_vide, "liste pas une liste": liste_pas_liste, "date non ISO": date_non_iso, "date impossible": date_impossible}
        for nom, alterer in cas.items():
            liste = liste_pour(REVISION)
            alterer(liste["aPublier"][0]["fiche"])
            with self.subTest(cas=nom):
                with self.assertRaisesRegex(eo.ExportRefuse, "fiche"):
                    eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())
        liste = liste_pour(REVISION)
        liste["aPublier"][0]["fiche"]["dateVerification"] = {"valeur": "2026-10-27", "statut": "infere", "affirmationId": A1}
        eo.exporter(REVISION, self.depot, liste)
        self.assertTrue(self.fiche().exists())

    def test_source_non_http_refusee_pour_une_fiche_comme_pour_un_article(self):
        """X2 : le site n'accepte que des sources http(s)."""
        for rev in (REVISION, ARTICLE):
            for url in ("ftp://exemple.org/s1", "javascript:alert(1)", "exemple.org/s1"):
                liste = liste_pour(rev)
                liste["aPublier"][0]["sources"][0]["url"] = url
                with self.subTest(rev=rev["id"], url=url):
                    with self.assertRaisesRegex(eo.ExportRefuse, "http"):
                        eo.exporter(rev, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_source_id_inconnu_refuse(self):
        liste = liste_pour(REVISION)
        liste["aPublier"][0]["affirmations"][0]["sourceIds"] = ["s1", "s404"]
        with self.assertRaisesRegex(eo.ExportRefuse, "s404"):
            eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_article_inchange_sans_renvois_ni_champs(self):
        eo.exporter(ARTICLE, self.depot, liste_pour(ARTICLE))
        texte = (self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md").read_text(encoding="utf-8")
        self.assertNotIn("renvois:", texte)
        self.assertNotIn("champs:", texte)
        self.assertIn(f'<a id="a-{A1}"></a>Relais testé (verifie_experimentalement)', texte)

    def test_article_ecrit_au_chemin_du_magazine_avec_son_frontmatter(self):
        h = eo.exporter(ARTICLE, self.depot, liste_pour(ARTICLE))
        self.assertRegex(h, r"^[0-9a-f]{40}$")
        texte = (self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md").read_text(encoding="utf-8")
        for attendu in ('titre: "Agents coopérants"', 'chapeau: "Ils se passent le relais."', "numero: 0", 'slug: "agents-cooperants"',
                        'langue: "fr"', 'revision: "rev-a1"', "base_revision_fr: null", 'verifie_le: "2026-10-27"', '  - "https://exemple.org/s1"', f'  - "{A1}"'):
            self.assertIn(attendu, texte)
        self.assertEqual(git(self.depot, "log", "-1", "--format=%s").strip(), "observatoire: article 0 agents-cooperants révision 2 (fr)")

    # T18 (audit du 29/10/2026) : art. 50, §4, al. 2 du règlement (UE) 2024/1689 ; la mention de contrôle humain et de
    # responsabilité éditoriale est publiée avec chaque fiche et chaque article, dans la langue de la révision.
    def test_mention_assistance_ia_et_responsabilite_editoriale_publiee(self):
        eo.exporter(ARTICLE, self.depot, liste_pour(ARTICLE))
        eo.exporter(REVISION, self.depot, LISTE)
        for f in (self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md", self.fiche()):
            texte = f.read_text(encoding="utf-8")
            self.assertTrue(texte.rstrip("\n").endswith(f"*{eo.MENTION_EDITORIALE['fr']}*"), f)
            self.assertEqual(texte.count(eo.MENTION_EDITORIALE["fr"]), 1, f)
        en = eo.rendre({"article": ARTICLE["article"]}, {"id": "rev-en", "slug": "agents-cooperants", "langue": "en", "baseRevisionFr": "rev-a1"}, ARTICLE["corps"], ARTICLE["affirmations"], ARTICLE["sources"], "2026-10-27")
        self.assertTrue(en.rstrip("\n").endswith(f"*{eo.MENTION_EDITORIALE['en']}*"))
        for langue, texte in eo.MENTION_EDITORIALE.items():
            self.assertRegex(texte, r"IA|AI", langue)
            self.assertNotIn("\u2014", texte)

    def test_article_empreinte_fausse_refusee(self):
        with self.assertRaisesRegex(eo.ExportRefuse, "empreinte"):
            eo.exporter(ARTICLE, self.depot, liste_pour(ARTICLE, empreinte="0" * 64))
        self.assertFalse((self.depot / "fr" / "magazine").exists())

    def test_article_absent_de_la_liste_refuse(self):
        with self.assertRaisesRegex(eo.ExportRefuse, "absente de la liste"):
            eo.exporter(ARTICLE, self.depot, {"copiees": 0, "aPublier": []})

    def test_article_slug_ou_numero_invalide_refuse(self):
        for ecart in ({"slug": "../evil"}, {"numero": -1}, {"numero": "0/../x"}):
            art = copy.deepcopy(ARTICLE)
            art["article"].update(ecart)
            with self.assertRaisesRegex(eo.ExportRefuse, "invalide"):
                eo.exporter(art, self.depot, liste_pour(art))
        self.assertFalse((self.depot / "fr" / "magazine").exists())

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks absent du PATH : refus de secret invérifiable")
    def test_secret_dans_le_corps_refuse_par_gitleaks(self):
        # Jeton factice assemblé à l exécution, pour que ce fichier ne contienne pas lui-même un motif de secret.
        rev = copy.deepcopy(REVISION)
        rev["corps"] = "# Outil X\n\njeton = " + "ghp_" + "x7Kq2LmZ9pR4tW1vB8nC" + "5dF3gH6jY0sQ2uE4" + "\n"
        with self.assertRaisesRegex(eo.ExportRefuse, "gitleaks a refusé"):
            eo.exporter(rev, self.depot, liste_pour(rev))
        self.assertEqual(git(self.depot, "status", "--porcelain").strip(), "")
        self.assertNotEqual(subprocess.run(["git", "-C", str(self.depot), "rev-parse", "HEAD"], capture_output=True).returncode, 0)

    # --- Durcissement de la chaîne d'export (revue de sécurité) ---

    def fichier_piege(self):
        """Fichier --revision piégé : tout ce que le serveur ne fournit pas y est hostile."""
        rev = copy.deepcopy(REVISION)
        rev["projet"] = {"slug": "evil", "nom": "<script>x</script>"}
        rev["verifieLe"] = "<script>alert(0)</script>"
        rev["sources"] = [{"id": "s9", "url": "javascript:alert(3)"}]
        rev["affirmations"] = [{"id": 'x"></a><script>alert(1)</script>', "texte": '<img src=x onerror=alert(1)> [clic](javascript:alert(2))', "statut": "<b>", "valeur": "<i>"}]
        return rev

    def test_fichier_revision_piege_rien_de_piege_publie(self):
        eo.exporter(self.fichier_piege(), self.depot, LISTE)
        texte = self.fiche().read_text(encoding="utf-8")
        for interdit in ("<script", "onerror", "javascript:", "<img", "evil", "alert("):
            self.assertNotIn(interdit, texte)
        self.assertIn(f'<a id="a-{A1}"></a>Licence MIT', texte)

    def test_article_titre_et_chapeau_viennent_du_corps_pas_du_fichier(self):
        art = copy.deepcopy(ARTICLE)
        art["article"].update(titre='Piège"\n<script>x</script>', chapeau="Chapeau piégé")
        eo.exporter(art, self.depot, liste_pour(ARTICLE))
        texte = (self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md").read_text(encoding="utf-8")
        self.assertIn('titre: "Agents coopérants"', texte)
        self.assertIn('chapeau: "Ils se passent le relais."', texte)
        self.assertNotIn("piég", texte.lower())

    def test_article_titre_et_chapeau_ne_sont_pas_repetes_dans_le_corps_ecrit(self):
        eo.exporter(ARTICLE, self.depot, liste_pour(ARTICLE))
        texte = (self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md").read_text(encoding="utf-8")
        corps = texte.split("\n---\n", 1)[1].split("\n## Affirmations\n")[0]
        self.assertFalse([l for l in corps.splitlines() if l.startswith("# ")])
        self.assertEqual(texte.count("Ils se passent le relais."), 1)  # une fois, dans le frontmatter
        self.assertEqual(corps.lstrip("\n"), "Texte.\n")

    def test_fiche_garde_son_titre_dans_le_corps(self):
        eo.exporter(REVISION, self.depot, LISTE)
        self.assertIn("# Outil X\n\nTexte.\n", self.fiche().read_text(encoding="utf-8"))

    def test_article_sans_titre_ou_sans_chapeau_dans_le_corps_refuse(self):
        for corps in ("Pas de titre.\n\nTexte.\n", "# Titre seul\n"):
            art = copy.deepcopy(ARTICLE)
            art["corps"] = corps
            with self.assertRaises(eo.ExportRefuse, msg=corps):
                eo.exporter(art, self.depot, liste_pour(art))
        self.assertFalse((self.depot / "fr" / "magazine").exists())

    def test_corps_dangereux_refuse(self):
        dangereux = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "[x](javascript:alert(1))", "[x](JavaScript:alert(1))",
                     "[x](data:text/html;base64,AAAA)", "[x](vbscript:msgbox(1))", "<div>x</div>", "[x](&#106;avascript:alert(1))",
                     "<a href=x onclick=y>x</a>", "[x]: javascript:alert(1)", "texte onload=alert(1)"]
        for morceau in dangereux:
            rev = copy.deepcopy(REVISION)
            rev["corps"] = f"# Outil X\n\n{morceau}\n"
            with self.subTest(morceau=morceau):
                with self.assertRaises(eo.ExportRefuse):
                    eo.exporter(rev, self.depot, liste_pour(rev))
                self.assertFalse(self.fiche().exists())

    def test_corps_markdown_pur_avec_liens_acceptes(self):
        rev = copy.deepcopy(REVISION)
        rev["corps"] = "# Outil X\n\nVoir [le site](https://exemple.org/a) et <https://exemple.org/b>, [ancre](#a-x).\n"
        self.assertRegex(eo.exporter(rev, self.depot, liste_pour(rev)), r"^[0-9a-f]{40}$")

    def test_image_ou_lien_vers_un_tiers_refuse(self):
        # V2-1 : une image distante (même chez une source) ou un lien vers un hôte qui n'est celui d'aucune source rendue
        # afficherait sur le site public un contenu tiers remplaçable après l'approbation de l'opérateur.
        refuses = ["![schéma](https://exemple.org/s1.png)", "![x][r]\n\n[r]: https://exemple.org/i.png", "[lien](https://tiers.example/a)",
                   "<https://tiers.example/b>", "voir https://tiers.example/c ici", "voir www.tiers.example/d ici", "[x](//tiers.example/e)",
                   "[x](HTTPS://TIERS.example/f)", "[t][r]\n\n[r]: https://tiers.example/g", "[x](https://exemple.org.tiers.example/h)"]
        for morceau in refuses:
            rev = copy.deepcopy(REVISION)
            rev["corps"] = f"# Outil X\n\n{morceau}\n"
            with self.subTest(morceau=morceau):
                with self.assertRaises(eo.ExportRefuse):
                    eo.exporter(rev, self.depot, liste_pour(rev))
                self.assertFalse(self.fiche().exists())
        liste = liste_pour(REVISION)
        liste["aPublier"][0]["affirmations"][0]["texte"] = "Voir [ceci](https://tiers.example/z)"
        with self.assertRaises(eo.ExportRefuse):
            eo.exporter(REVISION, self.depot, liste)

    def test_lien_interne_ou_vers_une_source_accepte(self):
        rev = copy.deepcopy(REVISION)
        rev["corps"] = "# Outil X\n\nVoir [la page](/fr/projets/outil-x/), [ancre](#a), et HTTPS://EXEMPLE.org/s1.\n"
        self.assertRegex(eo.exporter(rev, self.depot, liste_pour(rev)), r"^[0-9a-f]{40}$")

    def test_seconde_decision_exigee_avant_export(self):
        # INJ-9 : le serveur dit si une seconde décision humaine est requise ; absente, ou requise et non confirmée : refus.
        rev = copy.deepcopy(REVISION)
        requise = {"requise": True, "motifs": ["première publication du site"], "confirmee": False}
        for decision, refus in ((None, "sans seconde décision"), (requise, "première publication du site"), ({"requise": "oui"}, "sans seconde décision")):
            liste = liste_pour(rev)
            if decision is None:
                del liste["aPublier"][0]["secondeDecision"]
            else:
                liste["aPublier"][0]["secondeDecision"] = decision
            with self.subTest(decision=decision), self.assertRaisesRegex(eo.ExportRefuse, refus):
                eo.exporter(rev, self.depot, liste)
        self.assertFalse((self.depot / "fr/projets").exists(), "rien n'est écrit avant la seconde décision")
        self.assertRegex(eo.exporter(rev, self.depot, liste_pour(rev, secondeDecision={**requise, "confirmee": True})), r"^[0-9a-f]{40}$")

    def test_html_dans_le_code_est_du_texte_et_accepte(self):
        ok = ["Lancer `npx rea <cible>` puis lire.", "Deux accents ``a ` <binaire> b`` graves.",
              "```bash\nnpx rea <cible>\n<script>x</script> onerror=1 [x](javascript:y)\n```",
              "~~~\n<binaire>\n~~~", "````\n<binaire>\n```\n<autre>\n````", "   ```\n<binaire>\n   ```  ",
              "```\n<binaire>\n```\n\nPuis du texte pur et `<x>` encore."]
        for morceau in ok:
            rev = copy.deepcopy(REVISION)
            rev["corps"] = f"# Outil X\n\n{morceau}\n"
            with self.subTest(morceau=morceau):
                self.assertRegex(eo.exporter(rev, self.depot, liste_pour(rev)), r"^[0-9a-f]{40}$")
                git(self.depot, "rm", "-q", "-f", "--", "fr/projets/outil-x/fiche.md")  # dépôt propre pour le cas suivant
                git(self.depot, "commit", "-q", "-m", "retrait")

    def test_html_hors_code_toujours_refuse_meme_pres_d_un_code(self):
        piege = ["```\n<binaire>\n```\n<script>alert(1)</script>",       # après un bloc fermé
                 "`ok` <script>alert(1)</script>",                          # après un code en ligne
                 "```\n<binaire>",                                         # bloc non fermé : refus (le plus sûr)
                 "~~~\n<binaire>\n```\n<script>alert(1)</script>",        # autre clôture : toujours ouvert
                 "```\n<binaire>\n``\n",                                  # clôture trop courte : bloc non fermé
                 "\\`<script>alert(1)</script>\\`",                         # accents échappés : pas du code
                 "``` `\n<script>alert(1)</script>\n```",                  # info avec accent : pas une clôture ouvrante
                 "    ```\n<script>alert(1)</script>\n    ```",             # indenté de 4 : bloc de code indenté, pas une clôture
                 "`<script>alert(1)</script>",                              # accent seul non fermé
                 "`a` `<script>alert(1)</script>"]
        for morceau in piege:
            rev = copy.deepcopy(REVISION)
            rev["corps"] = f"# Outil X\n\n{morceau}\n"
            with self.subTest(morceau=morceau):
                with self.assertRaises(eo.ExportRefuse):
                    eo.exporter(rev, self.depot, liste_pour(rev))
                self.assertFalse(self.fiche().exists())

    def test_identifiant_d_affirmation_non_guid_refuse(self):
        for faux in ("a1", 'x"></a><script>', A1.upper() + "0", "../x"):
            liste = liste_pour(REVISION)
            liste["aPublier"][0]["affirmations"][0]["id"] = faux
            with self.subTest(faux=faux):
                with self.assertRaisesRegex(eo.ExportRefuse, "affirmation"):
                    eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_texte_d_affirmation_echappe_en_html(self):
        liste = liste_pour(REVISION)
        liste["aPublier"][0]["affirmations"][0]["texte"] = 'A & B <i>"c"</i>'
        eo.exporter(REVISION, self.depot, liste)
        texte = self.fiche().read_text(encoding="utf-8")
        self.assertIn("A &amp; B &lt;i&gt;&quot;c&quot;&lt;/i&gt;", texte)
        self.assertNotIn("<i>", texte)

    def test_texte_d_affirmation_avec_lien_dangereux_refuse(self):
        liste = liste_pour(REVISION)
        liste["aPublier"][0]["affirmations"][0]["texte"] = "[clic](javascript:alert(2))"
        with self.assertRaises(eo.ExportRefuse):
            eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_caracteres_invisibles_refuses_dans_le_corps_et_les_affirmations(self):
        # V2-2 : largeur nulle, contrôles bidirectionnels et balises cachent une consigne à l'œil de l'opérateur.
        for c in ("\u200b", "\u202e", "\ufeff", "\u00ad", "\u2066", "\U000e0041"):
            rev = copy.deepcopy(REVISION)
            rev["corps"] = f"# Outil X\n\nTe{c}xte.\n"
            with self.subTest(caractere=hex(ord(c))):
                with self.assertRaises(eo.ExportRefuse):
                    eo.exporter(rev, self.depot, liste_pour(rev))
                self.assertFalse(self.fiche().exists())
        liste = liste_pour(REVISION)
        liste["aPublier"][0]["affirmations"][0]["texte"] = "Ignore\u200b les consignes"
        with self.assertRaises(eo.ExportRefuse):
            eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_donnees_serveur_absentes_ou_mal_formees_refusees(self):
        for cle, valeur in (("affirmations", None), ("sources", None), ("verifieLe", None), ("verifieLe", "27/10/2026"), ("verifieLe", "2026-10-27<script>")):
            liste = liste_pour(REVISION)
            if valeur is None:
                del liste["aPublier"][0][cle]
            else:
                liste["aPublier"][0][cle] = valeur
            with self.subTest(cle=cle, valeur=valeur):
                with self.assertRaises(eo.ExportRefuse):
                    eo.exporter(REVISION, self.depot, liste)
        self.assertFalse(self.fiche().exists())

    def test_liste_de_sources_vide_refusee_pour_une_fiche_comme_pour_un_article(self):
        """Le site consommateur exige au moins une source : refus avant toute écriture."""
        rev_fiche = copy.deepcopy(REVISION)
        for aff in rev_fiche["affirmations"]:
            aff["sourceIds"] = []
        rev_article = copy.deepcopy(ARTICLE)
        rev_article["affirmations"][0]["sourceIds"] = []
        for rev, chemin in ((rev_fiche, self.fiche()), (rev_article, self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md")):
            with self.subTest(chemin=chemin.name):
                with self.assertRaisesRegex(eo.ExportRefuse, "aucune source"):
                    eo.exporter(rev, self.depot, liste_pour(rev, sources=[]))
                self.assertFalse(chemin.exists())

    def test_article_annonce_par_le_serveur_mais_revision_fiche_refuse(self):
        with self.assertRaisesRegex(eo.ExportRefuse, "article"):
            eo.exporter(REVISION, self.depot, liste_pour(REVISION, articleNumero=3))
        self.assertFalse(self.fiche().exists())
        self.assertFalse((self.depot / "fr" / "magazine").exists())

    def test_lien_symbolique_sortant_du_depot_refuse(self):
        with tempfile.TemporaryDirectory(prefix="atelier-test-hors-depot-") as dehors:
            (self.depot / "fr").symlink_to(dehors, target_is_directory=True)
            git(self.depot, "add", "fr")
            git(self.depot, "commit", "-q", "-m", "lien")
            with self.assertRaisesRegex(eo.ExportRefuse, "dépôt"):
                eo.exporter(REVISION, self.depot, LISTE)
            self.assertEqual(list(Path(dehors).iterdir()), [])

    @unittest.skipUnless(shutil.which("gitleaks"), "gitleaks absent du PATH : l'export s'arrête avant le commit")
    def test_commit_qui_echoue_laisse_le_depot_propre(self):
        # X5 : un crochet pre-commit qui refuse ne doit laisser ni fichier indexé ni fichier écrit (sinon FR-036 bloque tout).
        crochet = self.depot / ".git" / "hooks" / "pre-commit"
        crochet.write_text("#!/bin/sh\nexit 1\n")
        crochet.chmod(0o755)
        with self.assertRaisesRegex(eo.ExportRefuse, "commit"):
            eo.exporter(REVISION, self.depot, LISTE)
        self.assertEqual(git(self.depot, "status", "--porcelain").strip(), "")
        crochet.unlink()
        self.assertRegex(eo.exporter(REVISION, self.depot, LISTE), r"^[0-9a-f]{40}$")

    # --- X3 : citations [aff:<id>] rendues en renvois numérotés vers la liste des affirmations ---

    def test_citations_rendues_en_numeros_de_note(self):
        rev = copy.deepcopy(REVISION)
        rev["corps"] = f"# Outil X\n\nLicence MIT [aff:{A1}], version [aff:{A2}] et encore [aff:{A1}].\n"
        eo.exporter(rev, self.depot, liste_pour(rev))
        texte = self.fiche().read_text(encoding="utf-8")
        self.assertNotIn("[aff:", texte)
        self.assertIn(f"Licence MIT [\\[1\\]](#a-{A1}), version [\\[2\\]](#a-{A2}) et encore [\\[1\\]](#a-{A1}).", texte)

    def test_citations_dans_le_code_laissees_telles_quelles(self):
        rev = copy.deepcopy(REVISION)
        rev["corps"] = f"# Outil X\n\nVoir `[aff:{A1}]` et [aff:{A2}].\n\n```\n[aff:{A1}]\n```\n"
        eo.exporter(rev, self.depot, liste_pour(rev))
        texte = self.fiche().read_text(encoding="utf-8")
        self.assertIn(f"Voir `[aff:{A1}]` et [\\[2\\]](#a-{A2}).", texte)
        self.assertIn(f"```\n[aff:{A1}]\n```", texte)

    def test_article_citation_du_chapeau_retiree_de_l_en_tete_et_rendue_dans_le_corps(self):
        rev = copy.deepcopy(ARTICLE)
        rev["corps"] = f"# Agents coopérants\n\nIls se passent le relais [aff:{A1}].\n\nTexte [aff:{A1}].\n"
        eo.exporter(rev, self.depot, liste_pour(rev))
        texte = (self.depot / "fr" / "magazine" / "0" / "agents-cooperants.md").read_text(encoding="utf-8")
        self.assertIn('chapeau: "Ils se passent le relais."', texte)
        self.assertIn(f"Texte [\\[1\\]](#a-{A1}).", texte)
        self.assertNotIn("[aff:", texte)

    def test_citation_inconnue_du_serveur_refusee(self):
        rev = copy.deepcopy(REVISION)
        rev["corps"] = "# Outil X\n\nFait [aff:cccccccc-cccc-4ccc-8ccc-cccccccccccc].\n"
        with self.assertRaisesRegex(eo.ExportRefuse, "affirmation"):
            eo.exporter(rev, self.depot, liste_pour(rev))
        self.assertFalse(self.fiche().exists())


class TestPariteContrat(unittest.TestCase):
    """Les listes recopiées dans le script suivent le contrat TS du plugin (sinon toute fiche serait refusée)."""

    def test_champs_et_statuts_identiques_au_contrat(self):
        import re
        ts = (ICI.parent.parent / "plugin-atelier/src/contrats/observatoire.ts").read_text(encoding="utf-8")
        statuts = re.search(r"STATUTS_VERIFICATION = \[(.*?)\]", ts, re.S).group(1)
        forme = re.search(r"const formeFiche = \{(.*?)\n\};", ts, re.S).group(1)
        self.assertEqual(tuple(re.findall(r'"(\w+)"', statuts)), eo.STATUTS)
        self.assertEqual(tuple(re.findall(r"^\s+(\w+): ChampFiche", forme, re.M)), eo.CHAMPS_FICHE)
        categories = re.search(r"CATEGORIES_OBS = \[(.*?)\]", ts, re.S).group(1)
        self.assertEqual(tuple(re.findall(r'"([\w-]+)"', categories)), eo.CATEGORIES)
        # X2 : types de valeur repris par _verifier_fiche (listes de textes, dates ISO).
        self.assertEqual(tuple(re.findall(r"^\s+(\w+): ChampFiche\(ListeTextes\)", forme, re.M)), eo.LISTES_FICHE)
        self.assertEqual(tuple(re.findall(r"^\s+(\w+): ChampFiche\(DateJour\)", forme, re.M)), eo.DATES_FICHE)


class TestLigneDeCommande(unittest.TestCase):
    """Lance le script en sous-processus, comme le fait l usine."""

    SCRIPT = ICI.parent / "exporter-observatoire.py"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="atelier-test-cli-")
        self.addCleanup(self._tmp.cleanup)
        base = Path(self._tmp.name)
        self.depot = base / "depot"
        self.depot.mkdir()
        git(self.depot, "init", "-q")
        git(self.depot, "config", "user.name", "Test")
        git(self.depot, "config", "user.email", "test@example.org")
        self.dossier = base

    def lancer(self, rev, liste=None):
        fichier = self.dossier / "revision.json"
        fichier.write_text(json.dumps(rev, ensure_ascii=False), encoding="utf-8")
        cmd = ["python3", "-I", str(self.SCRIPT), "--revision", str(fichier), "--depot", str(self.depot)]
        if liste is not None:
            fl = self.dossier / "a-exporter.json"
            fl.write_text(json.dumps(liste, ensure_ascii=False), encoding="utf-8")
            cmd += ["--liste-a-exporter", str(fl)]
        return subprocess.run(cmd, capture_output=True, text=True)

    def test_cli_premier_export_puis_reexport_sans_commit(self):
        r1 = self.lancer(REVISION, LISTE)
        self.assertEqual(r1.returncode, 0, r1.stderr)
        self.assertRegex(r1.stdout.strip(), r"^[0-9a-f]{40}$")
        self.assertEqual(r1.stdout.strip(), git(self.depot, "rev-parse", "HEAD").strip())
        r2 = self.lancer(REVISION, LISTE)
        self.assertEqual(r2.returncode, 0, r2.stderr)
        self.assertIn("Rien à exporter", r2.stdout)
        self.assertEqual(git(self.depot, "rev-list", "--count", "HEAD").strip(), "1")

    def test_cli_annonce_le_marquage_exact_de_la_publication(self):
        # X4 : sans marquage, la révision reste « à exporter » ; le script donne l'appel exact (il ne fait pas d'appel HTTP).
        r = self.lancer(REVISION, LISTE)
        self.assertEqual(r.returncode, 0, r.stderr)
        ligne = next(l for l in r.stderr.splitlines() if "POST /obs/publications " in l)
        corps = json.loads(ligne.split("POST /obs/publications ", 1)[1])
        empreinte = hashlib.sha256((self.depot / "fr" / "projets" / "outil-x" / "fiche.md").read_bytes()).hexdigest()
        self.assertEqual({k: corps[k] for k in ("objet", "empreinteArtefact", "commitContenu")}, {"objet": "rev-1", "empreinteArtefact": empreinte, "commitContenu": r.stdout.strip()})

    def test_cli_sans_liste_a_exporter_refuse_par_argparse(self):
        r = self.lancer(REVISION)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--liste-a-exporter", r.stderr)
        self.assertEqual(r.stdout, "")

    def test_cli_revision_absente_de_la_liste_code_non_nul_et_message(self):
        r = self.lancer(REVISION, {"copiees": 0, "aPublier": []})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Export refusé", r.stderr)
        self.assertEqual(r.stdout, "")

    def lancer_id(self, identifiant, liste, depot=None, avec_revision=False):
        fl = self.dossier / "a-exporter.json"
        fl.write_text(json.dumps(liste, ensure_ascii=False), encoding="utf-8")
        cmd = ["python3", "-I", str(self.SCRIPT), "--id", identifiant, "--liste-a-exporter", str(fl), "--depot", str(depot or self.depot)]
        if avec_revision:
            cmd += ["--revision", str(self.dossier / "revision.json")]
        return subprocess.run(cmd, capture_output=True, text=True)

    def depot_jumeau(self):
        jumeau = Path(tempfile.mkdtemp(dir=self.dossier))
        git(jumeau, "init", "-q")
        git(jumeau, "config", "user.name", "Test")
        git(jumeau, "config", "user.email", "test@example.org")
        return jumeau

    def test_cli_id_exporte_comme_revision_fiche_et_article(self):
        for rev, rel in ((REVISION, "fr/projets/outil-x/fiche.md"), (ARTICLE, "fr/magazine/0/agents-cooperants.md")):
            with self.subTest(rel=rel):
                liste = liste_pour(rev)
                par_revision = self.lancer({"id": rev["id"], "langue": rev["langue"], "numero": rev["numero"], "corps": rev["corps"],
                                            **({"article": rev["article"]} if "article" in rev else {})}, liste)
                self.assertEqual(par_revision.returncode, 0, par_revision.stderr)
                jumeau = self.depot_jumeau()
                par_id = self.lancer_id(rev["id"], liste, depot=jumeau)
                self.assertEqual(par_id.returncode, 0, par_id.stderr)
                self.assertEqual((jumeau / rel).read_text(encoding="utf-8"), (self.depot / rel).read_text(encoding="utf-8"))

    def test_cli_id_inconnu_refuse_sans_ecriture(self):
        r = self.lancer_id("rev-inconnue", LISTE)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("absente de la liste", r.stderr)
        self.assertEqual(r.stdout, "")
        self.assertEqual(list(self.depot.glob("*/")), [self.depot / ".git"])

    def test_cli_id_et_revision_ensemble_erreur_argparse(self):
        (self.dossier / "revision.json").write_text("{}", encoding="utf-8")
        r = self.lancer_id("rev-1", LISTE, avec_revision=True)
        self.assertEqual(r.returncode, 2)
        self.assertIn("not allowed with", r.stderr)



class TestAide(unittest.TestCase):
    def test_aide_nomme_la_meme_methode_que_la_route(self):
        # X6 : la route obs.publications.aexporter est un POST (elle copie en base) ; l'aide ne dit jamais GET.
        source = (ICI.parent / "exporter-observatoire.py").read_text(encoding="utf-8")
        self.assertNotIn("GET /obs/publications/a-exporter", source)
        self.assertIn("POST /obs/publications/a-exporter", source)

if __name__ == "__main__":
    unittest.main()
