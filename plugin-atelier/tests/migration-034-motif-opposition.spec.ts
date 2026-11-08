/**
 * Migration 034 (données, additive) : l'opposition ne fait plus qu'informer. Les fiches que l'ancien code avait écartées avec le
 * seul motif « opposition_client » redeviennent « nouveau » ; une fiche qui porte aussi un autre motif garde cet autre motif.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "034_retrait_motif_opposition_client.sql";

describe("migration 034 : retrait du motif opposition_client des fiches déjà écartées", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit la 033 et ne fait qu'un UPDATE de la table prospects", () => {
    const i = fichiers.indexOf(NOM);
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toMatch(/^033_/u);
    expect(instructions.match(/\bUPDATE\b/gu)).toHaveLength(1);
    expect(instructions).toMatch(/UPDATE plugin_atelier_f0322cc62c\.prospects\b/u);
  });

  it("aucune suppression de schéma ni de ligne : ni DELETE, ni DROP, ni TRUNCATE, ni ALTER, ni INSERT", () => {
    expect(instructions).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER|INSERT)\b/iu);
  });

  it("retire seulement ce motif et remet « nouveau » quand aucun autre motif ne reste (contrainte exclu <=> au moins un motif)", () => {
    expect(instructions).toMatch(/m->>'motif' <> 'opposition_client'/u);
    expect(instructions).toMatch(/statut = CASE WHEN statut = 'exclu' AND NOT EXISTS/u);
    expect(instructions).toMatch(/THEN 'nouveau' ELSE statut END/u);
    expect(instructions).toMatch(/WHERE motifs_exclusion @> '\[\{"motif":"opposition_client"\}\]'::jsonb/u);
  });

  it("respecte le format du validateur : aucune apostrophe droite dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
