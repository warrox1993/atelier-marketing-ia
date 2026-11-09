/** Migration 037 (additive) : compteur de cycles de blocage sur la mission (#56). */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "037_missions_cycle_blocage.sql";

describe("migration 037 : cycle_blocage sur la mission", () => {
  it("suit la 036", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(fichiers[fichiers.indexOf(NOM) - 1]).toMatch(/^036_/u);
  });

  it("migration additive : une colonne, ni DROP ni DELETE, sans apostrophe droite", () => {
    const sql = readFileSync(join(DOSSIER, NOM), "utf8");
    const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(instructions).not.toMatch(/\b(DELETE FROM|DROP|TRUNCATE|UPDATE|INSERT|CREATE)\b/iu);
    expect(instructions).toContain("ALTER TABLE plugin_atelier_f0322cc62c.missions ADD COLUMN IF NOT EXISTS cycle_blocage integer NOT NULL DEFAULT 0;");
    expect(instructions.match(/ADD COLUMN/giu)).toHaveLength(1);
    // Le validateur de Paperclip retire les chaines entre apostrophes avant les commentaires : aucune apostrophe droite dans les commentaires.
    for (const ligne of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(ligne).not.toContain("'");
  });
});
