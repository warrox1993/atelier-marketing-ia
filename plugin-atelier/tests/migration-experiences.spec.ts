/**
 * Migration 021 : table des expériences A/B. Lue comme texte (format du validateur de Paperclip), comme les autres tests de migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "021_experiences.sql";

describe("migration 021 : expériences", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("est numérotée immédiatement après 020 et c'est la dernière", () => {
    const i = fichiers.indexOf(NOM);
    expect(fichiers[i - 1]).toMatch(/^020_/u);
    expect(fichiers[i + 1]).toBeUndefined();
  });

  it("crée la table experiences avec company_id, relançable, sans rien supprimer", () => {
    expect(instructions).toMatch(/CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c\.experiences/u);
    expect(instructions).toMatch(/company_id uuid NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/u);
    expect(instructions).toMatch(/statut IN \('en_cours', 'conclue', 'arretee'\)/u);
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP|INSERT|UPDATE|ALTER)\b/iu);
    for (const m of instructions.matchAll(/\b(plugin_atelier_f0322cc62c|public)\.[a-z_]+/giu)) expect(["plugin_atelier_f0322cc62c", "public"]).toContain(m[1]);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
