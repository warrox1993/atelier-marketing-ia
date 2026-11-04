#!/usr/bin/env python3
"""Tests de scripts/couts-jsonl.py (P3-6) : dédoublonnage par message.id, clés d'entreprise et d'agent, filtre de date."""
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "couts-jsonl.py"
spec = importlib.util.spec_from_file_location("couts_jsonl", SCRIPT)
cj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cj)

ENT = "a78d464f-0000-4000-8000-000000000001"
AGT = "76c4a4a0-0000-4000-8000-000000000002"


def evenement(ident: str, jour: str, entree: int, lecture: int = 0, modele: str = "claude-opus-5-5") -> str:
    return json.dumps({"timestamp": f"{jour}T10:00:00Z", "message": {"id": ident, "model": modele, "usage": {
        "input_tokens": entree, "cache_creation_input_tokens": 0, "cache_read_input_tokens": lecture, "output_tokens": 5}}})


class CoutsJsonl(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.racine = pathlib.Path(self.dossier.name)

    def tearDown(self):
        self.dossier.cleanup()

    def ecrire(self, rel: str, lignes: list[str]) -> None:
        f = self.racine / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("\n".join(lignes) + "\n", encoding="utf-8")

    def test_un_message_repete_dans_deux_journaux_compte_une_fois(self):
        self.ecrire(f"{ENT}/{AGT}/projects/x/s1.jsonl", [evenement("m1", "2026-10-15", 10, 1000), evenement("m2", "2026-10-15", 3)])
        self.ecrire(f"{ENT}/{AGT}/projects/x/subagents/s1.jsonl", [evenement("m1", "2026-10-15", 10, 1000), "pas du json", '{"usage": 1}'])
        t = cj.agreger(self.racine)
        c = t[(ENT, AGT, "2026-10-15", "claude-opus-5-5")]
        self.assertEqual((c["messages"], c["entree"], c["cache_lecture"], c["sortie"]), (2, 13, 1000, 10))

    def test_ancienne_configuration_et_filtre_de_date(self):
        self.ecrire("prospection/projects/p/s.jsonl", [evenement("a", "2026-10-14", 1), evenement("b", "2026-10-16", 2)])
        t = cj.agreger(self.racine, "2026-10-15")
        self.assertEqual(list(t), [("ancienne-configuration", "prospection", "2026-10-16", "claude-opus-5-5")])

    def test_seuls_les_jsonl_sont_lus(self):
        self.ecrire(f"{ENT}/{AGT}/.credentials.json", [evenement("z", "2026-10-15", 99)])
        self.assertEqual(cj.agreger(self.racine), {})

    def test_csv(self):
        self.ecrire(f"{ENT}/{AGT}/s.jsonl", [evenement("m", "2026-10-20", 4)])
        sortie = io.StringIO()
        cj.ecrire(cj.agreger(self.racine), sortie)
        self.assertEqual(sortie.getvalue().splitlines(), [
            "entreprise,agent,jour,modele,messages,entree,cache_ecriture,cache_lecture,sortie",
            f"{ENT},{AGT},2026-10-20,claude-opus-5-5,1,4,0,0,5"])

    def test_date_invalide_refusee(self):
        self.assertEqual(cj.main(["--racine", str(self.racine), "--depuis", "15/10"]), 2)


if __name__ == "__main__":
    unittest.main(verbosity=1)
