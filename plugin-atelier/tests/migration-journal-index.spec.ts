/**
 * Migration 020 : index du journal par (entreprise, type, entité) (revue de sécurité du 21/10/2026, F6).
 * Lue comme texte (format du validateur de Paperclip), comme les autres tests de migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "020_journal_index_entite.sql";

describe("migration 020 : index du journal", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("est numérotée immédiatement après 019 et suivie de 021", () => {
    const i = fichiers.indexOf(NOM);
    expect(fichiers[i - 1]).toMatch(/^019_/u);
    expect(fichiers[i + 1]).toMatch(/^021_/u);
  });

  it("crée l'index (company_id, type, entite_id) sur le journal du plugin, sans toucher aux données, relançable", () => {
    expect(instructions).toMatch(/CREATE INDEX IF NOT EXISTS \w+\s+ON plugin_atelier_f0322cc62c\.journal \(company_id, type, entite_id\)/u);
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP|INSERT|UPDATE|ALTER)\b/iu);
    for (const m of instructions.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/giu)) expect(m[1]).toBe("plugin_atelier_f0322cc62c");
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
