#!/usr/bin/env python3
"""Tests de l'import natif « replace » sans doublon (bogue du 18/10/2026 : « Douane et origine 2 » créés actifs).

Cause : Paperclip apparie un agent du paquet à un agent existant par normalizeAgentUrlKey(nom existant) == slug du paquet
(server/src/services/company-portability.ts) ; un agent renommé « Douane et origine » (clé douane-et-origine) ou accentué
(« Prévision demande », clé pr-vision-demande) n'est plus reconnu : l'import le recrée, suffixé « 2 », actif si l'import
ne met pas en pause.

1. Toujours : serveur simulé en mémoire qui reproduit ces règles (appariement par clé, deduplicateAgentName, statut selon
   pauseAutomations, 409 sur un renommage en collision). Témoin : l'ancien appel (importer seul) crée bien les doublons.
2. Si ATELIER_API_ESSAI est posé (instance d'ESSAI, jamais le port 3100), le même scénario sur une vraie instance :
   entreprise jetable créée par import, renommage, second import, contrôles, puis entreprise supprimée.
     ATELIER_API_ESSAI=http://127.0.0.1:3590/api python3 -I scripts/tests/tester-import-sans-doublon.py

À lancer : python3 -I scripts/tests/tester-import-sans-doublon.py
"""
import argparse
import contextlib
import importlib.util
import io
import os
import tempfile
import unittest
import uuid
from pathlib import Path

DONNEES = tempfile.mkdtemp(prefix="atelier-test-import-doublon-")
os.environ["ATELIER_DONNEES_LOCALES"] = DONNEES
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("bootstrap_organisation", ICI.parent / "bootstrap-organisation.py")
bo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bo)

# Slugs réels du dépôt (service logistique) : slug_canonique les connaît.
SLUGS = {"coordinateur-logistique": "Coordinateur logistique", "douane-origine": "Douane origine",
         "prevision-demande": "Prevision demande"}
NOMS_REGISTRE = {"douane-origine": "Douane et origine", "prevision-demande": "Prévision demande"}


def paquet(noms: dict[str, str]) -> dict[str, str]:
    fichiers = {"COMPANY.md": bo.avec_frontmatter({"schema": "agentcompanies/v1", "kind": "company", "slug": "essai-doublon",
                                                    "name": "Essai doublon"}, "# Essai doublon\n")}
    for slug, nom in noms.items():
        rapporte = None if slug == "coordinateur-logistique" else "coordinateur-logistique"
        fichiers[f"agents/{slug}/AGENTS.md"] = bo.avec_frontmatter(
            {"kind": "agent", "slug": slug, "name": nom, "title": f"Logistique · {nom}", "reportsTo": rapporte},
            f"# {nom}\n\nConsigne d'essai.\n")
    return fichiers


def reg_agents(slugs) -> dict:
    return {"agents": [{"slug": s, "nom": NOMS_REGISTRE.get(s, SLUGS.get(s, s))} for s in slugs]}


class ServeurFaux(bo.Api):
    """Règles de Paperclip utiles ici, copiées du socle : appariement par clé du nom, création suffixée, pause à l'import."""

    def __init__(self):
        super().__init__("http://faux")
        self.cid = "c0000000-0000-4000-8000-000000000001"
        self.agents: list[dict] = []
        self.issues: list[dict] = []
        self.runs: dict[str, list] = {}
        self.journal: list[tuple] = []
        self.echec_import = False
        self.n = 0

    def _nouveau(self, nom, statut, slug=None):
        slug = slug or bo.normaliser_slug(nom)
        self.n += 1
        existants = [a for a in self.agents if a["status"] != "terminated"]
        unique = nom
        if any(bo.normaliser_slug(a["name"]) == bo.normaliser_slug(nom) for a in existants):  # deduplicateAgentName
            i = 2
            while any(bo.normaliser_slug(a["name"]) == bo.normaliser_slug(f"{nom} {i}") for a in existants):
                i += 1
            unique = f"{nom} {i}"
        a = {"id": f"a{self.n:04d}", "name": unique, "status": statut, "role": "general",
             "title": f"Logistique · {slug}", "createdAt": f"2026-10-18T10:00:{self.n:02d}Z"}
        self.agents.append(a)
        return a

    def _import(self, corps):
        if self.echec_import:
            raise bo.ErreurAtelier("POST /companies/import -> HTTP 500 : panne simulée")
        cles = {}
        for a in self.agents:
            if a["status"] != "terminated":
                cles.setdefault(bo.normaliser_slug(a["name"]), a)
        resultat = {"agents": [], "warnings": []}
        for chemin, texte in corps["source"]["files"].items():
            if not (chemin.startswith("agents/") and chemin.endswith("/AGENTS.md")):
                continue
            slug = chemin.split("/")[1]
            nom = bo.entete_simple(texte)[0]["name"]
            existant = cles.get(slug)
            if existant and corps["collisionStrategy"] == "replace":
                if corps.get("pauseAutomations", True):
                    existant["status"] = "paused"
                resultat["agents"].append({"slug": slug, "id": existant["id"], "action": "updated", "name": existant["name"]})
                continue
            cree = self._nouveau(nom, "paused" if corps.get("pauseAutomations", True) else "idle", slug)
            resultat["agents"].append({"slug": slug, "id": cree["id"], "action": "created", "name": cree["name"]})
        return resultat

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        if methode == "GET":
            base, _, requete = chemin.partition("?")
            if base == f"/companies/{self.cid}/agents":
                return [dict(a) for a in self.agents if a["status"] != "terminated"]
            if base == f"/companies/{self.cid}/issues":
                if "assigneeAgentId=" in requete:
                    aid = requete.split("assigneeAgentId=")[1].split("&")[0]
                    return [i for i in self.issues if i.get("assigneeAgentId") == aid]
                return list(self.issues)
            if base == f"/companies/{self.cid}/heartbeat-runs":
                aid = requete.split("agentId=")[1].split("&")[0]
                return self.runs.get(aid, [])
            raise AssertionError(f"lecture non prévue : {chemin}")
        self.ecritures += 1
        self.journal.append((methode, chemin, corps))
        if chemin == "/companies/import/preview":
            return {"errors": []}
        if chemin == "/companies/import":
            return self._import(corps)
        a = next((x for x in self.agents if chemin.startswith(f"/agents/{x['id']}")), None)
        if a is None:
            raise AssertionError(f"écriture non prévue : {methode} {chemin}")
        if methode == "PATCH":
            cle = bo.normaliser_slug(corps["name"])
            if any(o["id"] != a["id"] and o["status"] != "terminated" and bo.normaliser_slug(o["name"]) == cle for o in self.agents):
                raise bo.ErreurAtelier(f"PATCH {chemin} -> HTTP 409 : Agent shortname '{cle}' is already in use in this company")
            a["name"] = corps["name"]
        elif chemin.endswith("/pause"):
            a["status"] = "paused"
        elif methode == "DELETE":
            self.agents.remove(a)
        return {}

    def get(self, chemin):
        return self.appel("GET", chemin)


def scenario_renomme(api: ServeurFaux) -> None:
    """1er import (agents créés en pause, noms sans accents), puis renommage au nom du registre (comme le 1er passage)."""
    for slug, nom in SLUGS.items():
        api._nouveau(nom, "paused", slug)
    for a in api.agents:
        slug = bo.normaliser_slug(a["name"])
        if slug in NOMS_REGISTRE:
            a["name"] = NOMS_REGISTRE[slug]


class ImportSansDoublon(unittest.TestCase):
    def setUp(self):
        self.api = ServeurFaux()
        scenario_renomme(self.api)
        self.fichiers = paquet({s: NOMS_REGISTRE.get(s, n) for s, n in SLUGS.items()})
        self.reg = reg_agents(SLUGS)

    def silencieux(self, f, *a, **k):
        with contextlib.redirect_stdout(io.StringIO()):
            return f(*a, **k)

    def test_temoin_l_ancien_appel_cree_des_doublons_actifs(self):
        """Le serveur simulé reproduit le bogue constaté : importer seul crée « … 2 » au statut idle."""
        self.api.appel("POST", "/companies/import", {"source": {"files": self.fichiers}, "collisionStrategy": "replace",
                                                      "pauseAutomations": False, "target": {}})
        noms = sorted(a["name"] for a in self.api.agents)
        self.assertIn("Douane et origine 2", noms)
        self.assertIn("Prévision demande 2", noms)
        self.assertEqual({a["status"] for a in self.api.agents if a["name"].endswith(" 2")}, {"idle"})

    def test_second_import_zero_doublon_zero_actif_noms_retablis(self):
        avant = {a["id"]: (a["name"], a["status"]) for a in self.api.agents}
        self.silencieux(bo.importer_en_place, self.api, self.fichiers, self.api.cid, self.reg, None, pause=False)
        apres = {a["id"]: (a["name"], a["status"]) for a in self.api.agents}
        self.assertEqual(apres, avant)  # aucun agent créé, mêmes noms, mêmes statuts
        import_ = [c for m, ch, c in self.api.journal if ch == "/companies/import"][0]
        self.assertFalse(import_["pauseAutomations"])
        # Les renommages temporaires précèdent l'import et sont défaits après.
        chemins = [(m, ch, (c or {}).get("name")) for m, ch, c in self.api.journal]
        i_import = chemins.index(("POST", "/companies/import", None))
        self.assertTrue(any(m == "PATCH" and n == "Douane origine" for m, _, n in chemins[:i_import]))
        self.assertTrue(any(m == "PATCH" and n == "Douane et origine" for m, _, n in chemins[i_import:]))

    def test_deux_passages_restent_idempotents(self):
        for _ in range(2):
            self.silencieux(bo.importer_en_place, self.api, self.fichiers, self.api.cid, self.reg, None, pause=False)
        self.assertEqual(len(self.api.agents), 3)

    def test_agent_absent_cree_en_pause_et_accepte(self):
        self.api.agents = [a for a in self.api.agents if a["name"] != "Prévision demande"]
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            bo.importer_en_place(self.api, self.fichiers, self.api.cid, self.reg, None, pause=False)
        crees = [a for a in self.api.agents if a["name"] == "Prévision demande"]
        self.assertEqual(len(crees), 1)
        self.assertEqual(crees[0]["status"], "paused")  # créé idle par l'import (pause=False), mis en pause aussitôt
        self.assertIn("mis en pause aussitôt", sortie.getvalue())

    def test_garde_doublon_cree_mis_en_pause_et_erreur(self):
        """Si un doublon apparaît malgré tout (ici : appariement désactivé), il est mis en pause et l'exécution échoue."""
        original = bo.appariements_import
        bo.appariements_import = lambda *a, **k: []
        try:
            with self.assertRaises(bo.ErreurAtelier) as ctx:
                self.silencieux(bo.importer_en_place, self.api, self.fichiers, self.api.cid, self.reg, None, pause=False)
        finally:
            bo.appariements_import = original
        self.assertIn("n'attendait pas", str(ctx.exception))
        doublons = [a for a in self.api.agents if a["name"].endswith(" 2")]
        self.assertEqual(len(doublons), 2)
        self.assertEqual({a["status"] for a in doublons}, {"paused"})

    def test_collision_de_cle_arrete_avant_toute_ecriture(self):
        self.api._nouveau("douane-origine", "paused")  # agent hors registre qui porte déjà la clé voulue
        with self.assertRaises(bo.ErreurAtelier) as ctx:
            self.silencieux(bo.importer_en_place, self.api, self.fichiers, self.api.cid, self.reg, None, pause=False)
        self.assertIn("collision", str(ctx.exception))
        self.assertEqual(self.api.journal, [])

    def test_echec_de_l_import_retablit_les_noms(self):
        self.api.echec_import = True
        avant = {a["id"]: a["name"] for a in self.api.agents}
        with self.assertRaises(bo.ErreurAtelier):
            self.silencieux(bo.importer_en_place, self.api, self.fichiers, self.api.cid, self.reg, None, pause=False)
        self.assertEqual({a["id"]: a["name"] for a in self.api.agents}, avant)


class NettoyerDoublons(unittest.TestCase):
    def setUp(self):
        self.api = ServeurFaux()
        scenario_renomme(self.api)
        self.api.appel("POST", "/companies/import", {"source": {"files": paquet(
            {s: NOMS_REGISTRE.get(s, n) for s, n in SLUGS.items()})}, "collisionStrategy": "replace",
            "pauseAutomations": False, "target": {}})
        self.api.journal.clear()
        self.api.ecritures = 0
        self.sauve = (bo.Api, bo.url_api)
        bo.Api = lambda base: self.api
        bo.url_api = lambda: "http://faux"
        bo.ecrire_registre_client("client-doublons", "0123456789", {
            "logistique": {"entrepriseId": self.api.cid, "nom": "Client · Logistique", "marqueur": "atelier-client:client-doublons:logistique"}})

    def tearDown(self):
        bo.Api, bo.url_api = self.sauve

    def lancer(self, confirmer):
        sortie = io.StringIO()
        with contextlib.redirect_stdout(sortie):
            code = bo.cmd_nettoyer_doublons(argparse.Namespace(client="client-doublons", confirmer=confirmer))
        return code, sortie.getvalue()

    def test_a_blanc_liste_sans_ecrire(self):
        code, sortie = self.lancer(False)
        self.assertEqual(code, 0)
        self.assertEqual(self.api.ecritures, 0)
        self.assertIn("2 doublon(s) probable(s)", sortie)
        self.assertIn("« Douane et origine 2 »", sortie)
        self.assertIn("« Prévision demande 2 »", sortie)
        self.assertNotIn("« Coordinateur logistique", sortie)

    def test_confirmer_supprime_seulement_sans_activite(self):
        actif = next(a for a in self.api.agents if a["name"] == "Douane et origine 2")
        self.api.issues.append({"id": "i1", "assigneeAgentId": actif["id"]})
        code, sortie = self.lancer(True)
        self.assertEqual(code, 0)
        noms = sorted(a["name"] for a in self.api.agents)
        self.assertIn("Douane et origine 2", noms)  # a une tâche : laissé tel quel
        self.assertNotIn("Prévision demande 2", noms)
        self.assertIn("Prévision demande", noms)  # l'original n'est jamais touché
        ecritures = [(m, ch) for m, ch, _ in self.api.journal]
        self.assertEqual([m for m, _ in ecritures], ["POST", "DELETE"])  # pause puis suppression
        journal = bo.dossier_client("client-doublons") / bo.FICHIER_JOURNAL_DOUBLONS
        self.assertIn("Prévision demande 2", journal.read_text(encoding="utf-8"))


@unittest.skipUnless(os.environ.get("ATELIER_API_ESSAI"), "ATELIER_API_ESSAI non posé : pas d'instance d'essai")
class InstanceEssai(unittest.TestCase):
    """Même scénario sur une vraie instance d'essai : entreprise jetable, supprimée à la fin."""

    def setUp(self):
        base = os.environ["ATELIER_API_ESSAI"].rstrip("/")
        if ":3100" in base:
            self.skipTest("refus : jamais l'instance principale (port 3100)")
        self.api = bo.Api(base)
        self.nom = f"Essai doublon {uuid.uuid4().hex[:8]}"
        fichiers = paquet(SLUGS)
        r = bo.importer(self.api, fichiers, {"mode": "new_company", "newCompanyName": self.nom}, "rename", None)
        self.cid = (r.get("company") or {}).get("id") or next(c["id"] for c in self.api.get("/companies") if c["name"] == self.nom)

    def tearDown(self):
        if getattr(self, "cid", None):
            self.api.appel("DELETE", f"/companies/{self.cid}")

    def agents(self):
        return {a["id"]: (a["name"], a["status"]) for a in self.api.get(f"/companies/{self.cid}/agents")}

    def renommer(self):
        for aid, (nom, _) in self.agents().items():
            slug = bo.normaliser_slug(nom)
            if slug in NOMS_REGISTRE:
                self.api.appel("PATCH", f"/agents/{aid}", {"name": NOMS_REGISTRE[slug]})

    def test_reel_temoin_puis_correctif(self):
        initiaux = self.agents()
        self.assertEqual(len(initiaux), 3)
        self.assertEqual({s for _, s in initiaux.values()}, {"paused"})
        self.renommer()
        renommes = self.agents()
        fichiers = paquet({s: NOMS_REGISTRE.get(s, n) for s, n in SLUGS.items()})
        with contextlib.redirect_stdout(io.StringIO()):
            bo.importer_en_place(self.api, fichiers, self.cid, reg_agents(SLUGS), None, pause=False)
        self.assertEqual(self.agents(), renommes)  # 0 doublon, 0 agent actif nouveau, noms rétablis
        # Témoin sur le vrai serveur : l'ancien appel crée les doublons « … 2 » actifs.
        bo.importer(self.api, fichiers, {"mode": "existing_company", "companyId": self.cid}, "replace", None, pause=False)
        nouveaux = {aid: v for aid, v in self.agents().items() if aid not in renommes}
        self.assertEqual(sorted(n for n, _ in nouveaux.values()), ["Douane et origine 2", "Prévision demande 2"])
        self.assertEqual({s for _, s in nouveaux.values()}, {"idle"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
