/**
 * Migration 018 : origine des flux de la matrice (métier ou réseau des coordinateurs).
 * Lue comme texte (format du validateur de Paperclip) ; le classement des lignes existantes est vérifié en
 * appliquant les motifs LIKE de la migration, traduits en expression régulière, aux objets réellement générés
 * par `flux_coordinateurs` (scripts/atelier_services.py) et aux 118 objets métier du registre.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { origineDepuisObjet } from "../src/contrats/index.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOSSIER = join(RACINE, "plugin-atelier", "migrations");
const NOM = "018_flux_origine.sql";

/** Traduit un motif LIKE (jokers % et _) en expression régulière ancrée. */
const likeVersRegex = (motif: string): RegExp => new RegExp(`^${motif.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/%/gu, "[\\s\\S]*").replace(/_/gu, "[\\s\\S]")}$`, "u");

describe("migration 018 : origine des flux", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const motifs = [...instructions.matchAll(/objet LIKE '([^']*)'/gu)].map((m) => m[1]!);

  it("est numérotée immédiatement après 017 et avant 019", () => {
    const i = fichiers.indexOf(NOM);
    expect(fichiers[i - 1]).toMatch(/^017_/u);
    expect(fichiers[i + 1]).toMatch(/^019_/u);
  });

  it("ajoute la colonne origine (métier par défaut, deux valeurs permises) dans l'espace du plugin", () => {
    expect(instructions).toMatch(/ALTER TABLE plugin_atelier_f0322cc62c\.flux_services\s+ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'metier' CHECK \(origine IN \('metier', 'coordinateurs'\)\)/u);
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN|INSERT)\b/iu);
    for (const m of instructions.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/giu)) expect(m[1]).toBe("plugin_atelier_f0322cc62c");
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });

  it("classe en coordinateurs tous les objets générés par flux_coordinateurs et aucun objet métier du registre", () => {
    expect(motifs).toHaveLength(2);
    const regexes = motifs.map(likeVersRegex);
    const classe = (objet: string) => regexes.some((r) => r.test(objet));
    const brut = execFileSync("python3", ["-I", "-c",
      "import json,sys; sys.path.insert(0, sys.argv[1]); import atelier_services as a; r=a.charger_services(); print(json.dumps({'generes':[f['objet'] for f in a.flux_coordinateurs(r)],'metier':[f['objet'] for f in r['flux']]}))",
      join(RACINE, "scripts")], { encoding: "utf8" });
    const { generes, metier } = JSON.parse(brut) as { generes: string[]; metier: string[] };
    expect(generes).toHaveLength(638);
    expect(metier).toHaveLength(118);
    expect(generes.filter((o) => !classe(o))).toEqual([]);
    expect(metier.filter(classe)).toEqual([]);
    // Le repli côté code applique la même règle que la migration.
    expect(generes.every((o) => origineDepuisObjet(o) === "coordinateurs")).toBe(true);
    expect(metier.every((o) => origineDepuisObjet(o) === "metier")).toBe(true);
  });
});
