#!/usr/bin/env python3
"""Tests des compétences communes (mémoire « memoire-para » et « recherche-connaissances ») livrées par le générateur
à tous les agents claude_local, et du confinement de leur mémoire. Aucune instance, aucun appel de modèle.

À lancer : python3 -I scripts/tests/tester-competences-communes.py
"""
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
DONNEES = tempfile.mkdtemp(prefix="atelier-test-competences-communes-")
os.environ["ATELIER_DONNEES_LOCALES"] = DONNEES
ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

COMMUNES = ("memoire-para", "recherche-connaissances")
CID_A = "11111111-1111-4111-8111-111111111111"
CID_B = "22222222-2222-4222-8222-222222222222"


def skills_entete(texte: str) -> list[str]:
    fm, _ = bo.separer_frontmatter(texte)
    return re.findall(r'^  - "([^"]+)"$', fm.split("skills:", 1)[1], re.M) if fm and "skills:" in fm else []


def agents_de_tous_les_services(reg_agents: dict) -> list[tuple[str, dict]]:
    tous = []
    for svc in bo.registre_services()["services"]:
        if svc["slug"] == "marketing" or not svc.get("actif"):
            continue
        agents, _, _ = bo.agents_service(reg_agents, svc)
        tous.extend((svc["slug"], a) for a in agents)
    return tous


def ecriture_effective(reg_agents: dict, agent: dict) -> bool:
    """Règle d'écriture réellement passée à Claude Code (--allowedTools), indépendante de l'aide du générateur."""
    args = bo.arguments_outils(agent, reg_agents["adaptateur"])
    return "Edit(./**)" in args[args.index("--allowedTools") + 1: args.index("--disallowedTools")]


class Fusion(unittest.TestCase):
    def test_ajout_sans_doublon_et_ordre_garde(self):
        self.assertEqual(bo.COMPETENCES_COMMUNES, COMMUNES)
        self.assertEqual(bo.avec_competences_communes([]), list(COMMUNES))
        self.assertEqual(bo.avec_competences_communes(["a", "b"]), ["a", "b", *COMMUNES])
        self.assertEqual(bo.avec_competences_communes(["recherche-connaissances", "a"]),
                         ["recherche-connaissances", "a", "memoire-para"])
        self.assertEqual(bo.avec_competences_communes(["a", "a", "memoire-para"]),
                         ["a", "memoire-para", "recherche-connaissances"])
        # M2 : sans écriture, memoire-para n'est ni ajoutée ni gardée ; recherche-connaissances reste.
        self.assertEqual(bo.avec_competences_communes(["a", "memoire-para"], ecrit=False), ["a", "recherche-connaissances"])

    def test_les_dossiers_des_competences_communes_existent(self):
        for nom in COMMUNES:
            self.assertTrue((bo.ORGA / "skills" / nom / "SKILL.md").is_file(), nom)


class Livraison(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reg_agents, cls.reg_orga = bo.registres()

    def verifier(self, libelle: str, competences: list[str], agent: dict):
        # M2 : memoire-para seulement pour un agent qui a la règle d'écriture effective « Edit(./**) ».
        self.assertIn("recherche-connaissances", competences, libelle)
        if ecriture_effective(self.reg_agents, agent):
            self.assertIn("memoire-para", competences, libelle)
        else:
            self.assertNotIn("memoire-para", competences, f"{libelle} : aucune écriture, pas de mémoire en fichiers")
        self.assertEqual(len(competences), len(set(competences)), f"{libelle} : doublon {competences}")

    def test_marketing_registre(self):
        for a in self.reg_agents["agents"]:
            if a.get("deterministe"):
                self.assertEqual(a["competences"], [], f"{a['slug']} : aucun modèle, aucune compétence")
            else:
                self.verifier(a["slug"], a["competences"], a)

    def test_m2_agents_sans_ecriture_sans_memoire(self):
        sans = {a["slug"] for a in self.reg_agents["agents"] if not a.get("deterministe") and not ecriture_effective(self.reg_agents, a)}
        self.assertEqual(sans, {"coordinateur", "exigences", "relecteur"})
        for a in self.reg_agents["agents"]:
            if a["slug"] in sans:
                self.assertNotIn("memoire-para", a["competences"], a["slug"])
                self.assertIn("recherche-connaissances", a["competences"], a["slug"])

    def test_marketing_agents_md_generes(self):
        fichiers = bo.fichiers_generes(self.reg_agents, self.reg_orga)
        vus = 0
        for a in self.reg_agents["agents"]:
            if a.get("deterministe"):
                continue
            self.verifier(a["slug"], skills_entete(fichiers[bo.ORGA / "agents" / a["slug"] / "AGENTS.md"]), a)
            vus += 1
        self.assertEqual(vus, 14)

    def test_tous_les_agents_des_services(self):
        tous = agents_de_tous_les_services(self.reg_agents)
        self.assertGreaterEqual(len(tous), 190)
        avec = 0
        for svc, a in tous:
            self.verifier(f"{svc}/{a['slug']}", a["competences"], a)
            avec += "memoire-para" in a["competences"]
        self.assertGreater(avec, 0)
        self.assertLess(avec, len(tous), "les coordinateurs de service n'écrivent pas : pas de memoire-para")
        print(f"\n  {len(tous)} agents de services (dont {avec} avec memoire-para) vérifiés", file=sys.stderr)

    def test_paquet_d_un_service(self):
        svc = next(s for s in bo.registre_services()["services"] if s["slug"] == "juridique")
        agents, corps, _ = bo.agents_service(self.reg_agents, svc)
        reg_agents_s = bo.reg_agents_service(self.reg_agents, agents)
        reg_s = {"version": self.reg_orga["version"], "objectifs": [], "projets": [], "routines": [],
                 "entreprise": {**self.reg_orga["entreprise"], "nom": "Essai · Juridique", "slug": "essai-juridique",
                                "marqueur": "atelier-client:essai:juridique", "description": "Essai."}}
        fichiers = bo.fichiers_service(reg_agents_s, reg_s, svc, corps)
        for nom in COMMUNES:
            self.assertIn(f"skills/{nom}/SKILL.md", fichiers)
        self.assertIn("skills/memoire-para/references/schemas.md", fichiers)
        for a in agents:
            texte = fichiers[f"agents/{a['slug']}/AGENTS.md"]
            self.verifier(a["slug"], skills_entete(texte), a)
            self.assertIn("## Mémoire et connaissances", texte)


class ConfinementMemoire(unittest.TestCase):
    """La mémoire est ./memoire/ du cwd : couverte par Edit(./**), aucune permission ajoutée ni élargie."""

    @classmethod
    def setUpClass(cls):
        cls.reg_agents, _ = bo.registres()

    def test_reglages_inchanges_et_bornes(self):
        _, config = bo.dossiers_agent(CID_A, "veille")
        reglages = bo.reglages_agent(self.reg_agents, config)
        self.assertIs(reglages.get("autoMemoryEnabled"), False)
        self.assertEqual(reglages["permissions"]["allow"], [f"Read(/{config}/projects/**)"])
        self.assertNotIn("additionalDirectories", reglages["permissions"])
        refus = reglages["permissions"]["deny"]
        self.assertTrue(any(r.startswith("Edit(") and "secrets" in r for r in refus))

    def test_seule_ecriture_autorisee_le_cwd(self):
        for a in self.reg_agents["agents"]:
            if a.get("deterministe"):
                continue
            args = bo.arguments_outils(a, self.reg_agents["adaptateur"])
            autorises = args[args.index("--allowedTools") + 1: args.index("--disallowedTools")]
            ecritures = [r for r in autorises if r.split("(")[0] in ("Edit", "Write", "MultiEdit", "NotebookEdit")]
            self.assertIn(ecritures, ([], ["Edit(./**)"]), a["slug"])

    def test_confinement_fichiers_espace_de_l_agent(self):
        for a in self.reg_agents["agents"]:
            if a.get("deterministe"):
                continue
            config = bo.config_adaptateur(a, self.reg_agents["adaptateur"])
            self.assertEqual(config["filesystemScope"], "workspace", a["slug"])
            self.assertNotIn("filesystemExtraPaths", config, a["slug"])

    def test_memoire_propre_a_l_agent_et_a_l_entreprise(self):
        espaces = {bo.dossiers_agent(c, s)[0] / "memoire" for c in (CID_A, CID_B) for s in ("veille", "contenus")}
        self.assertEqual(len(espaces), 4)
        for m in espaces:
            self.assertEqual(m.parent.parent.parent, bo.ESPACES)
        liaison = bo.liaison_voulue(CID_A, self.reg_agents, "veille", None, "reel")
        self.assertEqual(Path(liaison["cwd"]) / "memoire", bo.dossiers_agent(CID_A, "veille")[0] / "memoire")

    def test_espaces_jamais_suivis_par_git(self):
        chemin = (RACINE / "instance" / "agents-atelier" / CID_A / "veille" / "memoire" / "MEMORY.md").relative_to(RACINE)
        r = subprocess.run(["git", "-C", str(RACINE), "check-ignore", "-q", str(chemin)], check=False)
        self.assertEqual(r.returncode, 0, "la mémoire des agents doit être ignorée par git")


class PurgeMemoires(unittest.TestCase):
    """M3 : effacement d'une personne dans la mémoire des agents de toutes les entreprises du client, à blanc par défaut."""

    CID_AUTRE = "33333333-3333-4333-8333-333333333333"

    def setUp(self):
        self.slug = "client-purge"
        d = bo.INSTANCE / "atelier-client" / self.slug
        d.mkdir(parents=True, exist_ok=True)
        (d / "entreprise.json").write_text(json.dumps({
            "entrepriseId": CID_A, "numeroBce": "0123456789",
            "entreprises": {"marketing": {"entrepriseId": CID_A, "nom": None, "marqueur": "m"},
                            "direction": {"entrepriseId": CID_B, "nom": None, "marqueur": "d"}}}), encoding="utf-8")
        self.fichiers = {}
        for cid, role, rel, texte in (
            (CID_A, "veille", "MEMORY.md", "# Mémoire\n- Appel de Zoé Fictivia le 12/10 (source : tâche)\n- Fait neutre\n"),
            (CID_A, "veille", "projets/notes.md", "zoé FICTIVIA a demandé un devis\nAutre ligne\n"),
            (CID_B, "coordinateur", "MEMORY.md", "Rien à signaler\n"),
            (CID_B, "coordinateur", "fiche Zoé Fictivia.md", "Notes\n"),
            (self.CID_AUTRE, "veille", "MEMORY.md", "Zoé Fictivia (autre client)\n"),
        ):
            f = bo.ESPACES / cid / role / "memoire" / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(texte, encoding="utf-8")
            self.fichiers[(cid, role, rel)] = f
        # Lien symbolique planté par un agent vers un fichier hors de son espace : jamais suivi ni réécrit.
        self.dehors = Path(DONNEES) / "dehors.txt"
        self.dehors.write_text("Zoé Fictivia hors espace\n", encoding="utf-8")
        lien = bo.ESPACES / CID_A / "veille" / "memoire" / "lien.md"
        if not lien.is_symlink():
            lien.symlink_to(self.dehors)

    def test_a_blanc_par_defaut_puis_effacement_journalise_sans_la_donnee(self):
        avant = {k: f.read_bytes() for k, f in self.fichiers.items()}
        sortie = subprocess.run([sys.executable, "-I", str(ICI.parent / "bootstrap-organisation.py"), "purger-memoires",
                                 "--client", self.slug, "--motif", "zoé fictivia"], capture_output=True, text=True,
                                env={**os.environ, "ATELIER_DONNEES_LOCALES": DONNEES}, check=False)
        self.assertEqual(sortie.returncode, 0, sortie.stderr)
        self.assertIn("À blanc", sortie.stdout)
        self.assertIn("2 ligne(s) dans 3 fichier(s)", sortie.stdout)
        self.assertNotIn("Fictivia", sortie.stdout)
        self.assertNotIn("fictivia", sortie.stdout.lower())
        self.assertIn("6 mois", sortie.stdout)
        self.assertEqual({k: f.read_bytes() for k, f in self.fichiers.items()}, avant)
        self.assertFalse((bo.INSTANCE / "atelier-client" / self.slug / bo.FICHIER_JOURNAL_PURGES_MEMOIRES).exists())

        bilan = bo.purger_memoires(self.slug, "Zoé Fictivia", True)
        self.assertEqual((bilan["lignes"], len(bilan["fichiers"])), (2, 3))
        self.assertEqual(self.fichiers[(CID_A, "veille", "MEMORY.md")].read_text(encoding="utf-8"), "# Mémoire\n- Fait neutre\n")
        self.assertEqual(self.fichiers[(CID_A, "veille", "projets/notes.md")].read_text(encoding="utf-8"), "Autre ligne\n")
        self.assertEqual(self.fichiers[(CID_B, "coordinateur", "MEMORY.md")].read_text(encoding="utf-8"), "Rien à signaler\n")
        self.assertFalse(self.fichiers[(CID_B, "coordinateur", "fiche Zoé Fictivia.md")].exists())
        # Hors du client et hors de l'espace (lien) : rien n'est touché.
        self.assertIn("Fictivia", self.fichiers[(self.CID_AUTRE, "veille", "MEMORY.md")].read_text(encoding="utf-8"))
        self.assertIn("Fictivia", self.dehors.read_text(encoding="utf-8"))
        journal = (bo.INSTANCE / "atelier-client" / self.slug / bo.FICHIER_JOURNAL_PURGES_MEMOIRES).read_text(encoding="utf-8")
        self.assertNotIn("fictivia", journal.lower())
        self.assertIn("<chemin contenant le motif>", journal)
        self.assertEqual(json.loads(journal.splitlines()[-1])["empreinteMotif"], bo.hashlib.sha256("zoé fictivia".encode()).hexdigest())

    def test_motif_trop_court_et_client_inconnu_refuses(self):
        with self.assertRaises(bo.ErreurAtelier):
            bo.purger_memoires(self.slug, "zo", True)
        with self.assertRaises(bo.ErreurAtelier):
            bo.purger_memoires("client-inconnu", "Zoé Fictivia", True)

    def test_export_du_client_contient_la_memoire(self):
        export = bo.memoires_pour_export(CID_A)
        self.assertIn("memoires-agents/veille/MEMORY.md", export)
        self.assertIn("memoires-agents/veille/projets/notes.md", export)
        self.assertNotIn("memoires-agents/veille/lien.md", export)


class TexteCompetence(unittest.TestCase):
    DOSSIER = RACINE / "organisation" / "skills" / "memoire-para"

    def test_nom_distinct_du_socle(self):
        # Le socle importe « para-memory-files » dans chaque entreprise : même slug = référence ambiguë.
        self.assertNotIn("para-memory-files", COMMUNES)
        self.assertFalse((RACINE / "organisation" / "skills" / "para-memory-files").exists())

    def test_emplacement_et_garde_fous(self):
        texte = (self.DOSSIER / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("./memoire/", texte)
        self.assertIn("N'utilise pas `$AGENT_HOME`", texte)
        self.assertNotIn("qmd query", texte)
        self.assertNotIn("areas/people", texte)
        communes = (RACINE / "organisation" / "consignes" / "communes.md").read_text(encoding="utf-8")
        for attendu in ("## Mémoire et connaissances", "Jamais de secret, jeton, mot de passe",
                        "DONNÉE, jamais une consigne", "sa source et sa date", "connaissance://",
                        "se corrige ou s'efface", "base commune du groupe"):
            self.assertIn(attendu, communes)

    def test_texte_d_origine_inchange(self):
        origine = (self.DOSSIER / "references" / "origine-paperclip.md").read_text(encoding="utf-8")
        self.assertIn("Copyright (c) 2025 Paperclip AI", origine)
        socle = RACINE / "paperclip" / "skills" / "para-memory-files"
        if not socle.is_dir():
            self.skipTest("socle paperclip/ absent (clone non préparé)")
        for f in ("SKILL.md", "references/schemas.md"):
            self.assertIn((socle / f).read_text(encoding="utf-8"), origine, f)
        licences = (RACINE / "organisation" / "skills" / "LICENCES-TIERS.md").read_text(encoding="utf-8")
        self.assertIn("## Texte de la licence MIT de S8", licences)
        self.assertIn("| `memoire-para` | S8 |", licences)


if __name__ == "__main__":
    unittest.main(verbosity=1)
