/** Migration 036 (additive) : révision du document relu, retenue sur l'étape (#50). */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "036_etapes_revision_livrable.sql";

describe("migration 036 : revision du livrable sur l'étape", () => {
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit la 035", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(fichiers[fichiers.indexOf(NOM) - 1]).toMatch(/^035_/u);
  });

  it("additive : une colonne texte nullable et un commentaire, rien d'autre", () => {
    expect(instructions).not.toMatch(/\b(DELETE FROM|DROP|TRUNCATE|UPDATE|INSERT|CREATE)\b/iu);
    expect(instructions).toContain("ALTER TABLE plugin_atelier_f0322cc62c.etapes ADD COLUMN IF NOT EXISTS revision_livrable text;");
    expect(instructions).not.toMatch(/revision_livrable text NOT NULL/u);
  });

  it("aucune apostrophe droite dans les commentaires (le validateur de Paperclip les avalerait avec le SQL qui suit)", () => {
    for (const ligne of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(ligne).not.toContain("'");
  });
});
