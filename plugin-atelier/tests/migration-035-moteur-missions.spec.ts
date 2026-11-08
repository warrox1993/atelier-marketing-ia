/** Migration 035 (additive) : tables du moteur de missions (#49, tâche 2), d'après `docs/moteur-missions.md`. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "035_moteur_missions.sql";

describe("migration 035 : moteur de missions", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const table = (nom: string) => new RegExp(`CREATE TABLE IF NOT EXISTS plugin_atelier_f0322cc62c\\.${nom} \\(([\\s\\S]*?)\\n\\);`, "u").exec(instructions)?.[1] ?? "";

  it("suit la 034", () => {
    expect(fichiers[fichiers.indexOf(NOM) - 1]).toMatch(/^034_/u);
  });

  it("additive : ni DROP, ni DELETE FROM, ni TRUNCATE, ni UPDATE, ni INSERT ; seulement des tables et index nouveaux", () => {
    expect(instructions).not.toMatch(/\b(DELETE FROM|DROP|TRUNCATE|UPDATE|INSERT|ALTER)\b/iu);
    expect(instructions.match(/\bCREATE TABLE\b/gu)).toHaveLength(3);
  });

  it("missions : colonnes du document, campagne nullable", () => {
    const t = table("missions");
    for (const c of ["gabarit_cle", "gabarit_version", "contrat_id", "contrat_version", "mandat", "etat", "etat_avant_pause", "rang_courant", "enveloppe_cents", "campagne_id", "issue_racine_id", "company_id", "cree_le", "modifie_le"]) expect(t, c).toContain(`${c} `);
    expect(t).toMatch(/campagne_id uuid REFERENCES/u);
    expect(t).not.toMatch(/campagne_id uuid NOT NULL/u);
  });

  it("etapes : unique (mission_id, rang, tentative)", () => {
    const t = table("etapes");
    for (const c of ["mission_id", "rang", "role", "tentative", "etat", "entree", "sortie", "delai_le", "issue_id"]) expect(t, c).toContain(`${c} `);
    expect(t).toContain("UNIQUE (mission_id, rang, tentative)");
  });

  it("etapes : index (issue_id, tentative) pour etapeParIssue et la clé étrangère", () => {
    expect(instructions).toContain("CREATE INDEX IF NOT EXISTS etapes_tache_idx ON plugin_atelier_f0322cc62c.etapes (issue_id, tentative);");
  });

  it("executions : unique (company_id, cle_idempotence), types et statuts du document", () => {
    const t = table("executions");
    for (const c of ["mission_id", "rang", "type", "cle_idempotence", "requete", "statut", "statut_externe", "identifiant_fournisseur", "diffusion_id"]) expect(t, c).toContain(`${c} `);
    expect(t).toContain("UNIQUE (company_id, cle_idempotence)");
    expect(t).toContain("'evenement', 'creation_tache', 'reveil', 'effet_externe'");
    expect(t).toContain("'demandee', 'appliquee', 'refusee'");
    expect(t).not.toMatch(/diffusion_id uuid NOT NULL/u);
  });

  it("respecte le format du validateur : aucune apostrophe droite dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});
