// AFC-A17 (fuite /tmp, tests passerelle restants) : /tmp est en mémoire vive. Un fichier de tests qui échoue ne laisse aucun
// dossier : echec-volontaire.test.ts est relancé sous un TMPDIR neuf et doit échouer en le laissant vide.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

it("les aides statbel, google et social suppriment leurs dossiers même quand le test échoue", () => {
  const tmp = mkdtempSync(join(tmpdir(), "passerelle-fuite-"));
  onTestFinished(() => rmSync(tmp, { recursive: true, force: true }));
  const fini = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/fuites/echec-volontaire.test.ts"], {
    env: { ...process.env, PASSERELLE_ESSAI_FUITE: "1", TMPDIR: tmp, NODE_COMPILE_CACHE: "" },
    encoding: "utf8",
    timeout: 120_000,
  });
  expect(fini.status, fini.stdout.slice(-800)).toBe(1);
  expect(fini.stdout).toContain("3 failed");
  // node-compile-cache : cache de compilation de Node, pas un dossier de test.
  expect(readdirSync(tmp).filter((n) => n !== "node-compile-cache")).toEqual([]);
}, 150_000);
