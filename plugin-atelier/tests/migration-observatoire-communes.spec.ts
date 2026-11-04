/**
 * Migration 025 : base commune des sources de l Observatoire (colonnes ajoutées à obs_sources, rien de supprimé).
 * Lue comme texte (format du validateur de Paperclip). Elle ne modifie ni la 023 ni la 024.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "025_obs_sources_communes.sql";
const NOM_028_GLOBAL = "028_obs_sources_autorisees.sql";

describe("migration 025 : sources communes", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit immédiatement la 024", () => {
    expect(fichiers[fichiers.indexOf(NOM) - 1]).toBe("024_obs_injections.sql");
  });

  it("ajoute seulement des colonnes relançables à obs_sources, dans le schéma du plugin, sans rien supprimer", () => {
    expect(instructions).toMatch(/^\s*ALTER TABLE plugin_atelier_f0322cc62c\.obs_sources\b/u);
    for (const col of ["commune boolean NOT NULL DEFAULT false", "fiabilite text", "langue text", "pays text", "sujets jsonb", "etat text NOT NULL DEFAULT 'active'", "etat_motif text", "etat_le timestamptz", "motif text", "ajoutee_par text", "ajoutee_le timestamptz"]) {
      expect(instructions).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
    expect(instructions).toMatch(/CHECK \(etat IN \('active', 'candidate', 'en_sommeil'\)\)/u);
    expect(instructions).toMatch(/CHECK \(fiabilite IN \('A', 'B', 'C'\)\)/u);
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP|INSERT|UPDATE|CREATE TABLE)\b/iu);
    expect(instructions.match(/;/gu)).toHaveLength(1);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});

// V2-7 : état « suspecte » posé par un humain ; la contrainte de la 025 est élargie, rien n'est supprimé ni réécrit.
describe("migration 026 : sources suspectes", () => {
  const NOM_026 = "026_obs_sources_suspecte.sql";
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM_026), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit immédiatement la 025", () => {
    expect(fichiers[fichiers.indexOf(NOM_026) - 1]).toBe(NOM);
  });

  it("remplace seulement la contrainte d'état (nom donné par Postgres à la 025), relançable, sans toucher aux lignes", () => {
    const etapes = instructions.split(";").map((x) => x.replace(/\s+/gu, " ").trim()).filter(Boolean);
    expect(etapes).toEqual([
      "ALTER TABLE plugin_atelier_f0322cc62c.obs_sources DROP CONSTRAINT IF EXISTS obs_sources_etat_check",
      "ALTER TABLE plugin_atelier_f0322cc62c.obs_sources ADD CONSTRAINT obs_sources_etat_check CHECK (etat IN ('active', 'candidate', 'en_sommeil', 'suspecte'))",
    ]);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});

// INJ-9 : seconde décision de publication ; une table ajoutée, relançable, rien d'autre.
describe("migration 027 : seconde décision de publication", () => {
  const NOM_027 = "027_obs_confirmations_publication.sql";
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM_027), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit immédiatement la 026", () => {
    expect(fichiers[fichiers.indexOf(NOM_027) - 1]).toBe("026_obs_sources_suspecte.sql");
  });

  it("crée seulement la table des confirmations (clé entreprise et révision), relançable, sans rien supprimer", () => {
    expect(instructions).toMatch(/^\s*CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c\.obs_confirmations_publication \(/u);
    expect(instructions).toContain("company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE");
    expect(instructions).toContain("PRIMARY KEY (company_id, objet)");
    expect(instructions).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP|INSERT|UPDATE|ALTER)\b/iu);
    expect(instructions.match(/;/gu)).toHaveLength(1);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});

// O1 : les sources déjà enregistrées avant la règle de refus par défaut sont des sources examinées, autorisées.
describe("migration 028 : sources existantes autorisées à la collecte", () => {
  const NOM_028 = "028_obs_sources_autorisees.sql";
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM_028), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit immédiatement la 027", () => {
    expect(fichiers[fichiers.indexOf(NOM_028) - 1]).toBe("027_obs_confirmations_publication.sql");
  });

  it("pose autorisee seulement là où aucune décision n'existe, relançable, sans rien supprimer", () => {
    const etapes = instructions.split(";").map((x) => x.replace(/\s+/gu, " ").trim()).filter(Boolean);
    expect(etapes).toEqual([
      `UPDATE plugin_atelier_f0322cc62c.obs_sources SET politique_collecte = politique_collecte || '{"autorisee": true}'::jsonb WHERE politique_collecte->'autorisee' IS NULL`,
    ]);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});

// LIV-OB-7 : les sources importées actives sans jamais avoir été lues redeviennent candidates (rien n est supprimé).
describe("migration 029 : sources importées jamais lues repassées candidates", () => {
  const NOM_029 = "029_obs_sources_importees_candidates.sql";
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM_029), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit immédiatement la 028", () => {
    expect(fichiers[fichiers.indexOf(NOM_029) - 1]).toBe(NOM_028_GLOBAL);
  });

  it("ne touche que les communes importées par un humain, actives, sans instantané ni alias de projet ; relançable", () => {
    const etapes = instructions.split(";").map((x) => x.replace(/\s+/gu, " ").trim()).filter(Boolean);
    expect(etapes).toEqual([
      "UPDATE plugin_atelier_f0322cc62c.obs_sources s SET etat = 'candidate', etat_motif = 'importee sans lecture (LIV-OB-7)', etat_le = now() "
        + "WHERE s.commune AND s.ajoutee_par = 'humain' AND s.etat = 'active' "
        + "AND NOT EXISTS (SELECT 1 FROM plugin_atelier_f0322cc62c.obs_instantanes i WHERE i.source_id = s.id) "
        + "AND NOT EXISTS (SELECT 1 FROM plugin_atelier_f0322cc62c.obs_alias a WHERE a.company_id = s.company_id AND a.valeur = s.url_canonique)",
    ]);
  });

  it("respecte le format du validateur : aucune apostrophe dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
