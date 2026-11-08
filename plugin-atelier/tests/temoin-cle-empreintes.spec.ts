/**
 * Témoin de la clé des empreintes : une valeur courte, par entreprise, qui prouve avec quelle clé les oppositions ont été
 * empreintes. Si le secret change, l'atelier le signale au lieu de laisser la liste muette (elle ne refuse jamais rien).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE } from "../src/contrats/index.js";
import { creerBase } from "../src/serveur/base.js";
import { temoinCleEmpreintes } from "../src/serveur/chiffrement-donnees.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const SOC = "11111111-1111-4111-8111-111111111111";

describe("temoinCleEmpreintes", () => {
  const K1 = Buffer.alloc(32, 2);
  const K2 = Buffer.alloc(32, 3);

  it("stable pour une même clé, distinct pour deux clés, 16 caractères hexadécimaux", () => {
    expect(temoinCleEmpreintes(K1)).toBe(temoinCleEmpreintes(Buffer.from(K1)));
    expect(temoinCleEmpreintes(K1)).not.toBe(temoinCleEmpreintes(K2));
    expect(temoinCleEmpreintes(K1)).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("ne contient ni la clé ni un hachage nu de la clé", () => {
    const t = temoinCleEmpreintes(K1);
    expect(t).not.toContain(K1.toString("hex").slice(0, 16));
    expect(t).not.toContain(K1.toString("base64").slice(0, 8));
    expect(t).not.toBe(createHash("sha256").update(K1).digest("hex").slice(0, 16));
  });
});

describe("migration 033 : colonne du témoin, additive", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const nom = "033_temoin_cle_empreintes.sql";
  const sql = readFileSync(join(DOSSIER, nom), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("suit la 032 et un seul ADD COLUMN IF NOT EXISTS sur reglages_entreprise", () => {
    const i = fichiers.indexOf(nom);
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toMatch(/^032_/u);
    expect(instructions).toMatch(/ALTER TABLE plugin_atelier_f0322cc62c\.reglages_entreprise\s+ADD COLUMN IF NOT EXISTS temoin_cle_empreintes text NULL/u);
    expect(instructions.match(/ADD COLUMN/gu)).toHaveLength(1);
  });

  it("aucune suppression : ni DELETE, ni DROP, ni TRUNCATE, ni UPDATE", () => {
    expect(instructions).not.toMatch(/\b(DELETE|DROP|TRUNCATE|UPDATE)\b/iu);
  });

  it("respecte le format du validateur : aucune apostrophe droite dans les commentaires", () => {
    for (const c of sql.split("\n").filter((l) => l.trimStart().startsWith("--"))) expect(c).not.toContain("'");
  });
});

describe("SQL du témoin (base.ts réelle)", () => {
  function capture(lignes: unknown[] = []) {
    const ecrits: Array<{ sql: string; params: unknown[] }> = [];
    const lus: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      namespace: ESPACE_BASE,
      async query(sql: string, params: unknown[] = []) { lus.push({ sql, params }); return lignes; },
      async execute(sql: string, params: unknown[] = []) { ecrits.push({ sql, params }); return { rowCount: 1 }; },
    };
    return { base: creerBase(db as unknown as PluginContext["db"]), ecrits, lus };
  }

  it("lecture : null sans témoin, la valeur sinon ; adoption : une seule instruction qui ne remplace jamais un témoin existant", async () => {
    expect(await capture().base.lireTemoinCleEmpreintes(SOC)).toBeNull();
    expect(await capture([{ temoin_cle_empreintes: "0123456789abcdef" }]).base.lireTemoinCleEmpreintes(SOC)).toBe("0123456789abcdef");
    const { base, ecrits } = capture();
    expect(await base.adopterTemoinCleEmpreintes(SOC, "0123456789abcdef")).toBe(true);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0]!.sql).toMatch(/insert into \S+\.reglages_entreprise/u);
    expect(ecrits[0]!.sql).toMatch(/where r\.temoin_cle_empreintes is null/u);
    expect(ecrits[0]!.sql).not.toContain(";");
    expect(ecrits[0]!.params).toEqual([SOC, "0123456789abcdef"]);
  });

  it("C8 : présence d'oppositions lue par entreprise ; le remplacement du témoin est un UPDATE ciblé sur l'entreprise", async () => {
    expect(await capture().base.entrepriseAOppositions(SOC)).toBe(false);
    expect(await capture([{ un: 1 }]).base.entrepriseAOppositions(SOC)).toBe(true);
    const { base, ecrits } = capture();
    await base.remplacerTemoinCleEmpreintes(SOC, "fedcba9876543210");
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0]!.sql).toMatch(/update \S+\.reglages_entreprise set temoin_cle_empreintes = \$2.* where company_id = \$1/u);
    expect(ecrits[0]!.params).toEqual([SOC, "fedcba9876543210"]);
  });
});
