#!/usr/bin/env python3
"""Tests de « scripts/deplacer-service.py » : API de Paperclip simulée en mémoire, registres dans un dossier temporaire.

À lancer : python3 -I scripts/tests/tester-deplacer-service.py
Aucune instance réelle n'est contactée (ATELIER_API pointe vers une adresse fictive que la fausse API remplace).
"""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

DONNEES = tempfile.mkdtemp(prefix="atelier-test-deplacer-service-")
os.environ["ATELIER_DONNEES_LOCALES"] = DONNEES
os.environ["ATELIER_API"] = "http://faux.invalide/api"
ICI = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("deplacer_service", ICI.parent / "deplacer-service.py")
ds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ds)

ID_MKT = "11111111-1111-4111-8111-111111111111"
ID_JUR = "22222222-2222-4222-8222-222222222222"
ID_ADM = "33333333-3333-4333-8333-333333333333"
ID_AUTRE = "44444444-4444-4444-8444-444444444444"
BCE = "0123456789"
NOM_JUR = "JUR · Juridique · Client Alpha"
NOM_JUR_APRES = "JUR · Juridique · Perso Beta"
MARQ_AVANT = "atelier-client:client-alpha:juridique"
MARQ_APRES = "atelier-client:perso-beta:juridique"


class ApiFausse:
    """État en mémoire des entreprises ; journalise les écritures (PATCH)."""

    def __init__(self):
        self.entreprises = [
            {"id": ID_MKT, "name": "Client Alpha", "description": "Entreprise cliente. atelier-client:client-alpha"},
            {"id": ID_JUR, "name": NOM_JUR, "description": f"Service juridique. {MARQ_AVANT} (affichage)"},
            {"id": ID_ADM, "name": "ADM · Administratif · Client Alpha", "description": "atelier-client:client-alpha:administratif"},
        ]
        self.journal = []

    def get(self, chemin):
        assert chemin == "/companies", f"lecture non prévue : {chemin}"
        return [dict(e) for e in self.entreprises]

    def appel(self, methode, chemin, corps=None, attendu=(200, 201)):
        self.journal.append((methode, chemin, corps))
        assert methode == "PATCH" and chemin.startswith("/companies/"), f"écriture non prévue : {methode} {chemin}"
        cid = chemin.rsplit("/", 1)[1]
        for e in self.entreprises:
            if e["id"] == cid:
                e["name"], e["description"] = corps["name"], corps["description"]
        return {}


def entree(cid, nom, marqueur):
    return {"entrepriseId": cid, "nom": nom, "marqueur": marqueur}


class DeplacerService(unittest.TestCase):
    def setUp(self):
        shutil.rmtree(Path(DONNEES) / "atelier-client", ignore_errors=True)
        self.api = ApiFausse()
        self.depart = Path(DONNEES) / "atelier-client" / "client-alpha"
        self.arrivee = Path(DONNEES) / "atelier-client" / "perso-beta"
        self.ecrire_depart({
            "marketing": entree(ID_MKT, "Client Alpha", "atelier-client:client-alpha"),
            "juridique": entree(ID_JUR, NOM_JUR, MARQ_AVANT),
            "administratif": entree(ID_ADM, "ADM · Administratif · Client Alpha", "atelier-client:client-alpha:administratif")})
        (self.depart / "services" / "juridique").mkdir(parents=True)
        (self.depart / "services" / "juridique" / "notes.txt").write_text("contenu du service\n", encoding="utf-8")

    def ecrire_depart(self, entreprises, principal=None):
        self.depart.mkdir(parents=True, exist_ok=True)
        contenu = {"version": 2, "entrepriseId": principal or entreprises["marketing"]["entrepriseId"], "numeroBce": BCE,
                   "slug": "client-alpha", "creeLe": "2026-10-01T00:00:00Z", "entreprises": entreprises}
        (self.depart / "entreprise.json").write_text(json.dumps(contenu), encoding="utf-8")

    def lire(self, dossier):
        return json.loads((dossier / "entreprise.json").read_text(encoding="utf-8"))

    def lancer(self, *options, service="juridique", de="client-alpha", vers="perso-beta", nom="Perso Beta"):
        argv = ["--service", service, "--de", de, "--vers", vers, "--nom-commercial", nom, *options]
        sortie, erreur = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(erreur):
            try:
                code = ds.main(argv, api=self.api)
            except SystemExit as e:  # argparse
                code = e.code
        return code, sortie.getvalue(), erreur.getvalue()

    def refuse(self, *options, motif, **kw):
        """Refus (code 2) avec le motif, sans la moindre écriture."""
        avant = self.instantane()
        code, sortie, erreur = self.lancer(*options, **kw)
        self.assertEqual(code, 2, sortie + erreur)
        self.assertIn(motif, erreur)
        self.assertEqual(self.api.journal, [])
        self.assertEqual(self.instantane(), avant)

    def instantane(self):
        return sorted((str(p.relative_to(DONNEES)), p.read_bytes() if p.is_file() else None) for p in Path(DONNEES).rglob("*"))

    # -- sans l'option d'écriture ou à blanc

    def test_sans_option_refus(self):
        avant = self.instantane()
        code, _, erreur = self.lancer()
        self.assertNotEqual(code, 0)
        self.assertIn("--a-blanc", erreur)
        self.assertEqual(self.api.journal, [])
        self.assertEqual(self.instantane(), avant)

    def test_a_blanc_liste_sans_rien_ecrire(self):
        avant = self.instantane()
        code, sortie, erreur = self.lancer("--a-blanc")
        self.assertEqual(code, 0, erreur)
        for attendu in (f"PATCH /companies/{ID_JUR}", NOM_JUR_APRES, MARQ_APRES, "registre d'arrivée", "registre de départ", "dossier"):
            self.assertIn(attendu, sortie)
        self.assertEqual(self.api.journal, [])
        self.assertEqual(self.instantane(), avant)

    # -- déplacement nominal

    def test_deplacement_nominal(self):
        code, sortie, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertEqual(len(self.api.journal), 1)
        methode, chemin, corps = self.api.journal[0]
        self.assertEqual((methode, chemin), ("PATCH", f"/companies/{ID_JUR}"))
        self.assertEqual(corps["name"], NOM_JUR_APRES)
        self.assertEqual(corps["description"], f"Service juridique. {MARQ_APRES} (affichage)")
        # registre d'arrivée créé : personnel, sans BCE, droits stricts
        arrivee = self.lire(self.arrivee)
        self.assertEqual((arrivee["version"], arrivee["personnel"], arrivee["numeroBce"], arrivee["slug"]), (2, True, None, "perso-beta"))
        self.assertEqual(arrivee["entrepriseId"], ID_JUR)
        self.assertEqual(arrivee["entreprises"], {"juridique": entree(ID_JUR, NOM_JUR_APRES, MARQ_APRES)})
        self.assertEqual(stat.S_IMODE(os.stat(self.arrivee).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(self.arrivee / "entreprise.json").st_mode), 0o600)
        # registre de départ sans le service, le reste intact
        depart = self.lire(self.depart)
        self.assertEqual(sorted(depart["entreprises"]), ["administratif", "marketing"])
        self.assertEqual(depart["numeroBce"], BCE)
        # dossier du service déplacé
        self.assertFalse((self.depart / "services" / "juridique").exists())
        self.assertEqual((self.arrivee / "services" / "juridique" / "notes.txt").read_text(encoding="utf-8"), "contenu du service\n")
        # journal et commandes à lancer ensuite
        lignes = [json.loads(l) for l in (self.arrivee / "journal-deplacements.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertTrue(lignes)
        self.assertTrue(all(l["service"] == "juridique" and l["de"] == "client-alpha" and l["vers"] == "perso-beta" for l in lignes))
        self.assertEqual(stat.S_IMODE(os.stat(self.arrivee / "journal-deplacements.jsonl").st_mode), 0o600)
        self.assertIn("declarer-services.py client-alpha", sortie)
        self.assertIn("declarer-services.py perso-beta", sortie)

    def test_registre_d_arrivee_existant_complete(self):
        self.arrivee.mkdir(parents=True)
        (self.arrivee / "entreprise.json").write_text(json.dumps({
            "version": 2, "entrepriseId": ID_AUTRE, "numeroBce": None, "personnel": True, "slug": "perso-beta",
            "creeLe": "2026-10-02T00:00:00Z", "entreprises": {"commercial": entree(ID_AUTRE, "COM · Commercial · Perso Beta", "atelier-client:perso-beta:commercial")}}),
            encoding="utf-8")
        code, _, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        arrivee = self.lire(self.arrivee)
        self.assertEqual(sorted(arrivee["entreprises"]), ["commercial", "juridique"])
        self.assertEqual(arrivee["entrepriseId"], ID_AUTRE)
        self.assertEqual(arrivee["creeLe"], "2026-10-02T00:00:00Z")

    def test_entreprise_principale_repointee_vers_le_marketing(self):
        self.ecrire_depart({
            "marketing": entree(ID_MKT, "Client Alpha", "atelier-client:client-alpha"),
            "juridique": entree(ID_JUR, NOM_JUR, MARQ_AVANT)}, principal=ID_JUR)
        code, _, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertEqual(self.lire(self.depart)["entrepriseId"], ID_MKT)

    def test_service_sans_dossier_local(self):
        shutil.rmtree(self.depart / "services")
        code, _, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertFalse((self.arrivee / "services").exists())

    # -- idempotence et reprise

    def test_relance_idempotente(self):
        self.assertEqual(self.lancer("--confirmer")[0], 0)
        apres = self.instantane()
        code, sortie, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertIn("rien à faire", sortie)
        self.assertEqual(len(self.api.journal), 1)
        self.assertEqual(self.instantane(), apres)

    def test_interruption_entre_arrivee_et_depart_puis_relance(self):
        with mock.patch.object(ds, "etape_depart", side_effect=RuntimeError("coupure")):
            with self.assertRaises(RuntimeError):
                self.lancer("--confirmer")
        # état intermédiaire : Paperclip et registre d'arrivée faits, départ encore plein, dossier pas déplacé
        self.assertIn("juridique", self.lire(self.arrivee)["entreprises"])
        self.assertIn("juridique", self.lire(self.depart)["entreprises"])
        self.assertTrue((self.depart / "services" / "juridique").exists())
        code, _, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertEqual(len(self.api.journal), 1, "le renommage n'est pas refait")
        self.assertEqual(sorted(self.lire(self.depart)["entreprises"]), ["administratif", "marketing"])
        self.assertTrue((self.arrivee / "services" / "juridique" / "notes.txt").exists())
        self.assertFalse((self.depart / "services" / "juridique").exists())

    def test_interruption_apres_renommage_puis_relance(self):
        with mock.patch.object(ds, "etape_arrivee", side_effect=RuntimeError("coupure")):
            with self.assertRaises(RuntimeError):
                self.lancer("--confirmer")
        self.assertEqual(self.api.entreprises[1]["name"], NOM_JUR_APRES)
        self.assertFalse((self.arrivee / "entreprise.json").exists())
        code, _, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertEqual(len(self.api.journal), 1)
        self.assertEqual(list(self.lire(self.arrivee)["entreprises"]), ["juridique"])
        self.assertNotIn("juridique", self.lire(self.depart)["entreprises"])

    def test_interruption_avant_le_dossier_puis_relance(self):
        with mock.patch.object(ds, "etape_dossier", side_effect=RuntimeError("coupure")):
            with self.assertRaises(RuntimeError):
                self.lancer("--confirmer")
        self.assertNotIn("juridique", self.lire(self.depart)["entreprises"])
        code, _, erreur = self.lancer("--confirmer")
        self.assertEqual(code, 0, erreur)
        self.assertTrue((self.arrivee / "services" / "juridique" / "notes.txt").exists())
        self.assertFalse((self.depart / "services" / "juridique").exists())

    # -- refus (rien n'est écrit)

    def test_refus_service_absent(self):
        self.refuse("--confirmer", service="recouvrement", motif="recouvrement")

    def test_refus_registre_de_depart_absent(self):
        self.refuse("--confirmer", de="client-inconnu", motif="client-inconnu")

    def test_refus_marketing(self):
        self.refuse("--confirmer", service="marketing", motif="marketing")

    def test_refus_nom_divergent(self):
        self.api.entreprises[1]["name"] = "JUR · Juridique · Autre nom"
        self.refuse("--confirmer", motif="nom")

    def test_refus_marqueur_divergent(self):
        self.api.entreprises[1]["description"] = "atelier-client:autre-client:juridique"
        self.refuse("--confirmer", motif="marqueur")

    def test_refus_entreprise_absente_de_paperclip(self):
        del self.api.entreprises[1]
        self.refuse("--confirmer", motif=ID_JUR)

    def test_refus_service_deja_a_l_arrivee(self):
        self.arrivee.mkdir(parents=True)
        (self.arrivee / "entreprise.json").write_text(json.dumps({
            "version": 2, "entrepriseId": ID_AUTRE, "numeroBce": None, "personnel": True, "slug": "perso-beta",
            "creeLe": "2026-10-02T00:00:00Z", "entreprises": {"juridique": entree(ID_AUTRE, "JUR · Juridique · Perso Beta", MARQ_APRES)}}),
            encoding="utf-8")
        self.refuse("--confirmer", motif="déjà")

    def test_refus_entreprise_revendiquee_ailleurs(self):
        autre = Path(DONNEES) / "atelier-client" / "client-gamma"
        autre.mkdir(parents=True)
        (autre / "entreprise.json").write_text(json.dumps({
            "version": 2, "entrepriseId": ID_JUR, "numeroBce": BCE, "slug": "client-gamma", "creeLe": "2026-10-03T00:00:00Z",
            "entreprises": {"juridique": entree(ID_JUR, NOM_JUR, MARQ_AVANT)}}), encoding="utf-8")
        self.refuse("--confirmer", motif="client-gamma")

    def test_refus_depart_sans_autre_entreprise(self):
        self.ecrire_depart({"juridique": entree(ID_JUR, NOM_JUR, MARQ_AVANT)}, principal=ID_JUR)
        self.refuse("--confirmer", motif="au moins une entreprise")

    def test_refus_meme_client(self):
        self.refuse("--confirmer", vers="client-alpha", motif="différer")

    def test_refus_dossier_deja_present_a_l_arrivee(self):
        (self.arrivee / "services" / "juridique").mkdir(parents=True)
        self.refuse("--confirmer", motif="existe déjà")

    def test_refus_nom_commercial_invalide(self):
        self.refuse("--confirmer", nom="Deux\nlignes", motif="nom commercial")


if __name__ == "__main__":
    unittest.main(verbosity=1)
