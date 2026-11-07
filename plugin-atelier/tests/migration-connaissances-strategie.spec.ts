/**
 * Migration 031 : type « strategie » des connaissances (lot 2, T12). Lue comme texte, comme les autres tests de migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TypeDocumentConnaissance } from "../src/contrats/connaissances.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "031_connaissances_type_strategie.sql";

describe("migration 031 : type strategie des connaissances", () => {
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const lignes = sql.split("\n");
  const instructions = lignes.filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit 030 et n'a aucune apostrophe dans ses commentaires", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(fichiers[fichiers.indexOf(NOM) - 1]).toMatch(/^030_/u);
    expect(lignes.filter((l) => l.trimStart().startsWith("--")).some((l) => l.includes("'"))).toBe(false);
  });

  it("remplace la contrainte implicite de la migration 008, sans toucher aux lignes", () => {
    expect(instructions).toMatch(/DROP CONSTRAINT IF EXISTS connaissances_documents_type_check;/u);
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|INSERT|UPDATE)\b/iu);
  });

  it("admet exactement les types du contrat, dont strategie", () => {
    const liste = /CHECK \(type IN \(([^)]*)\)\)/u.exec(instructions)?.[1] ?? "";
    const types = [...liste.matchAll(/'([a-z_]+)'/gu)].map((m) => m[1]).sort();
    expect(types).toEqual([...TypeDocumentConnaissance.options].sort());
    expect(types).toContain("strategie");
  });
});
