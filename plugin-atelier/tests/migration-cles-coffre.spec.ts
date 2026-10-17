/**
 * Faille E1 : plus de clé de données déterministe. Migration 016 lue comme texte (format du validateur de
 * Paperclip) ; son effet a été rejoué sur un PostgreSQL jetable lors de sa mise au point (voir le commit).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "016_cles_donnees_coffre_seulement.sql";

describe("migration 016 : clés de données du coffre seulement", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("est numérotée immédiatement après 015 et immédiatement avant 017", () => {
    const i = fichiers.indexOf(NOM);
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toMatch(/^015_/u);
    expect(fichiers[i + 1]).toMatch(/^017_/u);
  });

  it("passe tout réglage en reel puis interdit demonstration par contrainte", () => {
    expect(instructions).toMatch(/UPDATE plugin_atelier_f0322cc62c\.reglages_entreprise SET mode_par_defaut = 'reel'[^;]*WHERE mode_par_defaut <> 'reel'/u);
    expect(instructions).toMatch(/ADD CONSTRAINT reglages_entreprise_mode_par_defaut_check CHECK \(mode_par_defaut = 'reel'\)/u);
  });

  it("marque « à réimporter » sans rien supprimer ni requalifier : ni DELETE, ni DROP de colonne ou de table, ni mode réécrit", () => {
    expect(instructions).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|DROP\s+(TABLE|COLUMN)/iu);
    expect(instructions).not.toMatch(/SET\s+mode\s*=/iu);
    for (const table of ["prospects", "clients", "bases_clients_imports", "oppositions"]) {
      expect(instructions).toMatch(new RegExp(`ALTER TABLE plugin_atelier_f0322cc62c\\.${table}\\s+ADD COLUMN IF NOT EXISTS cle_a_reimporter boolean NOT NULL DEFAULT false`, "u"));
      expect(instructions).toMatch(new RegExp(`UPDATE plugin_atelier_f0322cc62c\\.${table}(?: AS o)? SET cle_a_reimporter = true`, "u"));
    }
    for (const table of ["prospects", "clients", "bases_clients_imports"]) {
      expect(instructions).toMatch(new RegExp(`UPDATE plugin_atelier_f0322cc62c\\.${table} SET cle_a_reimporter = true\\s+WHERE mode = 'demonstration'`, "u"));
    }
    expect(instructions).toMatch(/j\.donnees ->> 'cles' = 'demonstration'/u);
  });

  it("respecte le format du validateur : aucune apostrophe droite dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
