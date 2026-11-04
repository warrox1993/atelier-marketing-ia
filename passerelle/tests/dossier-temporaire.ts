// Dossier temporaire des aides de test, supprimé en afterAll du fichier de test qui l'importe, même quand un test ou un
// montage échoue avant son propre nettoyage (AFC-A17 : /tmp est en mémoire vive). Même méthode que aide-bce.ts.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const dossiersCrees: string[] = [];
afterAll(() => { for (const d of dossiersCrees.splice(0)) rmSync(d, { recursive: true, force: true }); });

export function dossierTemporaire(prefixe: string): string {
  const dossier = mkdtempSync(join(tmpdir(), prefixe));
  dossiersCrees.push(dossier);
  return dossier;
}
