#!/usr/bin/env python3
"""Tests de scripts/detecter-erreurs-repetees.py (APP-3) : journaux de runs factices, aucune instance.

À lancer : python3 -I scripts/tests/tester-detecter-erreurs-repetees.py
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parent.parent / "detecter-erreurs-repetees.py"
ENT = "a0000000-0000-4000-8000-000000000000"


def journal(dossier, agent_dir, run, slug, echanges):
    """Écrit un run-log : init (cwd de l'agent) puis, par échange, un appel d'outil et son résultat."""
    # Lignes réelles sans contenu d'outil : message texte, tableau JSON.
    lignes = [{"type": "system", "subtype": "init", "cwd": f"/x/agents-atelier/{ENT}/{slug}"}, {"type": "user", "message": "texte"}, [1]]
    for i, (outil, entree, resultat, erreur) in enumerate(echanges):
        lignes.append({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": f"t{i}", "name": outil, "input": entree}]}})
        lignes.append({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": f"t{i}", "content": resultat, "is_error": erreur}]}})
    flux = "".join(json.dumps(l) + "\n" for l in lignes)
    chemin = Path(dossier) / ENT / agent_dir / f"{run}.ndjson"
    chemin.parent.mkdir(parents=True, exist_ok=True)
    # Le socle découpe la sortie en morceaux : la signature doit survivre à une coupure au milieu d'une ligne.
    morceaux = [flux[:37], flux[37:]]
    chemin.write_text("".join(json.dumps({"ts": "2026-10-30T10:00:00Z", "stream": "stdout", "chunk": m}) + "\n" for m in morceaux), encoding="utf-8")
    return chemin


CURL_404 = ("Bash", {"command": "curl -s -w '\\nHTTP %{http_code}\\n' '{{PAPERCLIP_API_URL}}/api/issues/1b2c3d4e-1111-4222-8333-444455556666/documents/plan'"},
            '{"error":"introuvable","detail":"SECRET-CORPS-123"}\nHTTP 404', False)


class TestDetecteur(unittest.TestCase):
    def lancer(self, dossier, *args):
        sortie = Path(dossier) / "rapport.json"
        p = subprocess.run([sys.executable, "-I", str(SCRIPT), "--journaux", str(dossier), "--sortie", str(sortie), *args],
                           capture_output=True, text=True, timeout=60)
        return p, (json.loads(sortie.read_text(encoding="utf-8")) if sortie.exists() else None)

    def test_signature_repetee_dans_deux_runs_sans_le_corps(self):
        with tempfile.TemporaryDirectory() as d:
            journal(d, "ag1", "r1", "redacteur-en-chef", [CURL_404, ("Skill", {"skill": "x"}, "Unknown skill: x", True)])
            journal(d, "ag1", "r2", "redacteur-en-chef", [CURL_404, ("Skill", {"skill": "x"}, "Unknown skill: x", True)])
            journal(d, "ag2", "r3", "directeur", [CURL_404, ("Write", {"file_path": "/a"}, "Permission denied", True)])
            vieux = journal(d, "ag1", "r0", "redacteur-en-chef", [("Bash", {"command": "curl -X POST 'http://h/api/z'"}, "HTTP 500", False)] * 1)
            journal(d, "ag1", "r9", "redacteur-en-chef", [])
            os.utime(vieux, (time.time() - 30 * 86400,) * 2)
            p, r = self.lancer(d)
            self.assertEqual(p.returncode, 1, p.stderr)
            self.assertEqual([(x["signature"], x["runs"]) for x in r["repetees"]], [
                ("redacteur-en-chef | HTTP 404 GET /api/issues/:id/documents/plan introuvable", 2),
                ("redacteur-en-chef | competence-inconnue Skill", 2),
            ])
            self.assertEqual(r["signatures"], 4)  # 2 répétées + 404 et refus du directeur ; le run vieux de 30 jours est ignoré
            brut = (Path(d) / "rapport.json").read_text(encoding="utf-8") + p.stdout
            self.assertNotIn("SECRET-CORPS-123", brut)
            self.assertNotIn("1b2c3d4e", brut)
            self.assertIn("2 runs : redacteur-en-chef | HTTP 404", p.stdout)
            self.assertEqual(os.stat(Path(d) / "rapport.json").st_mode & 0o777, 0o600)

    def test_aucune_repetition_code_zero_et_dossier_absent_code_deux(self):
        with tempfile.TemporaryDirectory() as d:
            journal(d, "ag1", "r1", "directeur", [CURL_404])
            p, r = self.lancer(d)
            self.assertEqual((p.returncode, r["repetees"]), (0, []))
            self.assertEqual(self.lancer(Path(d) / "absent")[0].returncode, 2)


if __name__ == "__main__":
    unittest.main()
