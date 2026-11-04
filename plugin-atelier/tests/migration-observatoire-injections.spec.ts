/**
 * Migration 024 : colonne des injections signalées sur les instantanés de l Observatoire. Lue comme texte (format du validateur de
 * Paperclip). Elle ne modifie pas la 023, dont l empreinte est déjà enregistrée par l hôte.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "024_obs_injections.sql";

describe("migration 024 : injections signalées des instantanés", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit immédiatement la 023", () => {
    expect(fichiers[fichiers.indexOf(NOM) - 1]).toBe("023_obs_documentaire.sql");
  });

  it("ajoute la seule colonne jsonb, relançable, dans le schéma du plugin, sans rien supprimer", () => {
    expect(instructions.trim()).toBe("ALTER TABLE plugin_atelier_f0322cc62c.obs_instantanes ADD COLUMN IF NOT EXISTS injections_signalees jsonb;");
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP|INSERT|UPDATE)\b/iu);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
