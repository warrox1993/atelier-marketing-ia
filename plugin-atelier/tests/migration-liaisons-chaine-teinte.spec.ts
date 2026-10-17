/**
 * Migration 017 : chaîne, profondeur, approbation requise et teinte des liaisons (revue indépendante H2 et M1).
 * Lue comme texte : format du validateur de Paperclip (aucune apostrophe droite dans les commentaires), aucune
 * suppression de donnée, reprise des lignes existantes en sur-ensemble sûr.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "017_liaisons_chaine_teinte.sql";

describe("migration 017 : chaîne et teinte des liaisons", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("est numérotée immédiatement après 016 et reste la dernière", () => {
    const i = fichiers.indexOf(NOM);
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toMatch(/^016_/u);
    expect(i).toBe(fichiers.length - 1);
  });

  it("ajoute les quatre colonnes avec des valeurs par défaut sûres", () => {
    expect(instructions).toMatch(/ADD COLUMN IF NOT EXISTS chaine jsonb NOT NULL DEFAULT '\[\]'::jsonb/u);
    expect(instructions).toMatch(/ADD COLUMN IF NOT EXISTS profondeur integer NOT NULL DEFAULT 1 CHECK \(profondeur >= 1\)/u);
    expect(instructions).toMatch(/ADD COLUMN IF NOT EXISTS approbation_requise boolean NOT NULL DEFAULT false/u);
    expect(instructions).toMatch(/ADD COLUMN IF NOT EXISTS teinte_retour boolean NOT NULL DEFAULT false/u);
  });

  it("reprend les lignes existantes : chaîne des deux services, approbation et teinte en sur-ensemble", () => {
    expect(instructions).toMatch(/SET chaine = jsonb_build_array\(service_source, service_cible\)\s+WHERE chaine = '\[\]'::jsonb/u);
    expect(instructions).toMatch(/SET approbation_requise = true[\s\S]*statut IN \('en_attente_approbation', 'refusee'\)[\s\S]*f\.approbation_humaine = true/u);
    expect(instructions).toMatch(/SET teinte_retour = true\s+WHERE statut = 'repondue' AND approbation_requise = true/u);
  });

  it("ne supprime aucune donnée et ne vise que l'espace du plugin", () => {
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/iu);
    for (const m of instructions.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/giu)) {
      if (["l", "s", "f"].includes(m[1]!)) continue;
      expect(m[1]).toBe("plugin_atelier_f0322cc62c");
    }
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
