/**
 * Migration 019 : confirmation des services déclarés (revue du 19/10/2026, E1). Lue comme texte (format du validateur de
 * Paperclip) : la colonne naît CONFIRMÉE pour les lignes existantes (défaut now()), puis le défaut est retiré pour que
 * toute ligne nouvelle soit « à confirmer » ; aucune donnée n'est supprimée, et rejouer la migration ne confirme rien de plus.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "019_services_confirmation.sql";

describe("migration 019 : confirmation des services", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const T = "plugin_atelier_f0322cc62c.services_entreprises";

  it("est numérotée immédiatement après 018 et reste la dernière", () => {
    const i = fichiers.indexOf(NOM);
    expect(fichiers[i - 1]).toMatch(/^018_/u);
    expect(i).toBe(fichiers.length - 1);
  });

  it("les lignes existantes naissent confirmées, puis le défaut est retiré (une ligne nouvelle n'est jamais confirmée d'office)", () => {
    const ajout = instructions.indexOf(`ALTER TABLE ${T}\n  ADD COLUMN IF NOT EXISTS confirme_le timestamptz DEFAULT now();`);
    const retrait = instructions.indexOf(`ALTER TABLE ${T}\n  ALTER COLUMN confirme_le DROP DEFAULT;`);
    expect(ajout).toBeGreaterThanOrEqual(0);
    expect(retrait).toBeGreaterThan(ajout);
  });

  it("ne supprime rien, ne réécrit aucune ligne et reste dans l'espace du plugin", () => {
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN|INSERT|UPDATE)\b/iu);
    for (const m of instructions.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/giu)) expect(m[1]).toBe("plugin_atelier_f0322cc62c");
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
