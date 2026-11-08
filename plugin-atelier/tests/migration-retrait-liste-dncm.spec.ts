/**
 * Migration 032 : la base légale ne porte plus de date de vérification de la liste « Ne m'appelez plus ».
 * Décision du propriétaire (06/11) : liste retirée en entier ; migration ADDITIVE seulement : la contrainte
 * qui exigeait la date pour le téléphone est levée, la colonne reste en base sans plus être lue ni écrite.
 * La migration est lue comme texte (format du validateur de Paperclip : aucune apostrophe droite dans les commentaires).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BaseLegaleContact } from "../src/contrats/index.js";
import { PROSPECT_B2C } from "../src/contrats/exemples/prospection.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOM = "032_retrait_liste_dncm.sql";

describe("migration 032 : levée de la contrainte sur la date de la liste", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, NOM), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const liste = instructions.split(";").map((s) => s.replace(/\s+/gu, " ").trim()).filter((s) => s !== "");

  it("suit immédiatement la migration 031", () => {
    const i = fichiers.indexOf(NOM);
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toMatch(/^031_/u);
  });

  it("ne contient que l'instruction attendue, écrite à la main", () => {
    expect(liste).toEqual(["ALTER TABLE plugin_atelier_f0322cc62c.bases_legales DROP CONSTRAINT IF EXISTS bases_legales_dncm"]);
  });

  it("reste additive : ni suppression de table ou de colonne, ni TRUNCATE, ni DELETE", () => {
    expect(instructions).not.toMatch(/DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE\s+FROM/iu);
  });

  it("respecte le format du validateur : aucune apostrophe droite dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });

  it("la migration 007 n'est pas réécrite : elle crée toujours la colonne", () => {
    expect(readFileSync(join(DOSSIER, "007_prospection.sql"), "utf8")).toContain("dncm_verifie_le timestamptz");
  });
});

describe("BaseLegaleContact sans date de liste", () => {
  const tel = PROSPECT_B2C.basesLegales[1]!;
  it("accepte une base téléphone sans date", () => {
    expect(tel.canal).toBe("telephone");
    expect(BaseLegaleContact.safeParse(tel).success).toBe(true);
  });
  it("refuse un objet qui porte encore la date (strict)", () => {
    expect(BaseLegaleContact.safeParse({ ...tel, dncmVerifieLe: "2026-10-10T09:00:00.000Z" }).success).toBe(false);
    expect(BaseLegaleContact.safeParse({ ...tel, dncmVerifieLe: null }).success).toBe(false);
  });
});
