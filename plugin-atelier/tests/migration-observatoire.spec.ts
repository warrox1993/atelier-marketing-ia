/**
 * Migration 023 : stockage documentaire de l Observatoire (9 tables obs_*). Lue comme texte (format du validateur de Paperclip),
 * comme les autres tests de migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STATUTS_VERIFICATION } from "../src/contrats/observatoire.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "023_obs_documentaire.sql";
const SCHEMA = "plugin_atelier_f0322cc62c";
const TABLES = [
  "obs_projets", "obs_alias", "obs_sources", "obs_instantanes", "obs_versions",
  "obs_affirmations", "obs_preuves", "obs_revisions", "obs_publications",
] as const;

/** Corps d une table : du CREATE TABLE jusqu au point-virgule de fin d instruction. */
function corps(instructions: string, table: string): string {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${SCHEMA}\\.${table} \\(([\\s\\S]*?)\\n\\);`, "u").exec(instructions);
  expect(m, `table ${table} absente`).not.toBeNull();
  return m?.[1] ?? "";
}

describe("migration 023 : stockage documentaire de l Observatoire", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("est numérotée immédiatement après 022", () => {
    const i = fichiers.indexOf(NOM);
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toBe("022_diffusions_travaux_fabrique.sql");
  });

  it("est purement additive et relançable, dans le seul schéma du plugin", () => {
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP|INSERT|UPDATE|ALTER)\b/iu);
    for (const m of instructions.matchAll(/\b(plugin_atelier_f0322cc62c|public)\.[a-z_]+/giu)) expect(["plugin_atelier_f0322cc62c", "public"]).toContain(m[1]);
    expect(instructions.match(/CREATE TABLE/gu)?.length).toBe(TABLES.length);
    expect(instructions.match(/CREATE TABLE IF NOT EXISTS/gu)?.length).toBe(TABLES.length);
  });

  it("crée les 9 tables, chacune avec company_id relié aux entreprises", () => {
    for (const t of TABLES) expect(corps(instructions, t)).toMatch(/company_id uuid NOT NULL REFERENCES public\.companies\(id\) ON DELETE CASCADE/u);
  });

  it("garantit les unicités exigées", () => {
    expect(corps(instructions, "obs_projets")).toMatch(/UNIQUE \(company_id, slug\)/u);
    expect(corps(instructions, "obs_alias")).toMatch(/UNIQUE \(company_id, type, valeur\)/u);
    expect(corps(instructions, "obs_sources")).toMatch(/UNIQUE \(company_id, url_canonique\)/u);
    expect(corps(instructions, "obs_instantanes")).toMatch(/UNIQUE \(source_id, empreinte_sha256\)/u);
    expect(corps(instructions, "obs_versions")).toMatch(/UNIQUE \(projet_id, version\)/u);
  });

  it("date chaque affirmation (cree_le) pour désigner l'affirmation active", () => {
    expect(corps(instructions, "obs_affirmations")).toMatch(/cree_le timestamptz NOT NULL DEFAULT now\(\)/u);
  });

  it("contraint les 8 statuts de vérification et la confiance de 0 à 3", () => {
    const c = corps(instructions, "obs_affirmations");
    const liste = /statut text NOT NULL CHECK \(statut IN \(([^)]*)\)\)/u.exec(c)?.[1] ?? "";
    const valeurs = [...liste.matchAll(/'([a-z_]+)'/gu)].map((m) => m[1]);
    expect([...valeurs].sort()).toEqual([...STATUTS_VERIFICATION].sort());
    expect(c).toMatch(/confiance smallint NOT NULL CHECK \(confiance BETWEEN 0 AND 3\)/u);
  });

  it("impose à une preuve exactement un lien : instantané XOR essai (essai sans clé étrangère)", () => {
    const c = corps(instructions, "obs_preuves");
    expect(c).toMatch(/CHECK \(\(instantane_id IS NOT NULL\) <> \(essai_id IS NOT NULL\)\)/u);
    expect(c).toMatch(/essai_id uuid[,\s]/u);
    expect(c).not.toMatch(/essai_id uuid REFERENCES/u);
  });

  it("porte les colonnes de suivi des sources et la révision native des révisions", () => {
    const s = corps(instructions, "obs_sources");
    expect(s).toMatch(/controle_le timestamptz/u);
    expect(s).toMatch(/echecs_consecutifs integer NOT NULL DEFAULT 0/u);
    expect(s).toMatch(/en_echec boolean NOT NULL DEFAULT false/u);
    expect(s).toMatch(/etag text/u);
    expect(corps(instructions, "obs_revisions")).toMatch(/revision_native_id uuid/u);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
