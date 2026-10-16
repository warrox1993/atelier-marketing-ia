/**
 * Migration 015 : supprimer une entreprise ne doit jamais effacer les liaisons d'une autre entreprise.
 * La migration est lue comme texte : elle doit respecter le format du validateur de Paperclip
 * (aucune apostrophe droite dans les commentaires) et remplacer la clé étrangère vers la cible.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STATUTS_LIAISON } from "../src/contrats/index.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

describe("migration 015 : liaisons et suppression d'une entreprise cible", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, "015_liaisons_cible_supprimee.sql"), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("est la dernière migration, numérotée à la suite de 014", () => {
    expect(fichiers.at(-1)).toBe("015_liaisons_cible_supprimee.sql");
    expect(fichiers.at(-2)).toMatch(/^014_/u);
  });

  it("rend la cible nullable, retire la clé CASCADE par son nom réel et la recrée en SET NULL", () => {
    expect(instructions).toMatch(/ALTER TABLE plugin_atelier_f0322cc62c\.liaisons\s+ALTER COLUMN entreprise_cible_id DROP NOT NULL/u);
    expect(instructions).toMatch(/DROP CONSTRAINT IF EXISTS liaisons_entreprise_cible_id_fkey/u);
    expect(instructions).toMatch(/ADD CONSTRAINT liaisons_entreprise_cible_id_fkey FOREIGN KEY \(entreprise_cible_id\) REFERENCES public\.companies\(id\) ON DELETE SET NULL/u);
    expect(instructions).not.toMatch(/entreprise_cible_id[^;]*ON DELETE CASCADE/u);
  });

  it("ajoute le statut final cible_supprimee à la contrainte, avec tous les statuts existants", () => {
    const m = /ADD CONSTRAINT liaisons_statut_check CHECK \(statut IN \(([^)]*)\)\)/u.exec(instructions);
    expect(m).not.toBeNull();
    const dansSql = [...m![1]!.matchAll(/'([a-z_]+)'/gu)].map((x) => x[1]).sort();
    expect(dansSql).toEqual([...STATUTS_LIAISON].sort());
    expect(STATUTS_LIAISON).toContain("cible_supprimee");
  });

  it("ne touche à aucune donnée existante", () => {
    expect(instructions).not.toMatch(/\b(UPDATE|DELETE FROM|INSERT|TRUNCATE|DROP TABLE)\b/iu);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });

  it("aucune autre migration ne référence public.companies hors company_id et entreprise_cible_id", () => {
    for (const f of fichiers) {
      const t = readFileSync(join(DOSSIER, f), "utf8");
      for (const l of t.split("\n").filter((x) => x.includes("REFERENCES public.companies"))) {
        expect(l, f).toMatch(/^\s*(company_id|entreprise_cible_id)\s|^\s*ADD CONSTRAINT liaisons_entreprise_cible_id_fkey FOREIGN KEY \(entreprise_cible_id\)/u);
      }
    }
  });
});
