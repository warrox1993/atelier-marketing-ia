/**
 * Lot G1 : le mode d'exécution par défaut est « reel » (contrat, base, migration 014).
 * La migration est lue comme texte : elle doit respecter le format du validateur de Paperclip
 * (aucune apostrophe droite dans les commentaires, instructions ALTER TABLE et UPDATE de l'espace du plugin).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CreerCampagneEntree } from "../src/contrats/index.js";
import { calculerModeEffectif } from "../src/serveur/regles-donnees.js";

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

describe("migration 014 : mode réel par défaut", () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
  const sql = readFileSync(join(DOSSIER, "014_mode_reel_par_defaut.sql"), "utf8");
  const instructions = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("reste numérotée à la suite de 013 et immédiatement avant 015", () => {
    const i = fichiers.indexOf("014_mode_reel_par_defaut.sql");
    expect(i).toBeGreaterThan(0);
    expect(fichiers[i - 1]).toMatch(/^013_/u);
    expect(fichiers[i + 1]).toMatch(/^015_/u);
  });

  it("passe le défaut de mode_par_defaut à reel et migre les réglages existants", () => {
    expect(instructions).toMatch(/ALTER TABLE plugin_atelier_f0322cc62c\.reglages_entreprise\s+ALTER COLUMN mode_par_defaut SET DEFAULT 'reel'/u);
    expect(instructions).toMatch(/UPDATE plugin_atelier_f0322cc62c\.reglages_entreprise SET mode_par_defaut = 'reel'/u);
  });

  it("ne touche pas aux contraintes CHECK (demonstration reste accepté jusqu'au lot suivant)", () => {
    expect(instructions).not.toMatch(/CONSTRAINT|CHECK|DROP/iu);
  });

  it("respecte le format du validateur : apostrophes seulement dans les instructions, jamais dans les commentaires", () => {
    const commentaires = sql.split("\n").filter((l) => l.trimStart().startsWith("--"));
    for (const c of commentaires) expect(c).not.toContain("'");
  });

  it("ne requalifie jamais des campagnes ou données existantes en reel", () => {
    expect(instructions).not.toMatch(/UPDATE plugin_atelier_f0322cc62c\.(?!reglages_entreprise)/u);
  });
});

describe("mode réel par défaut côté TypeScript", () => {
  it("une campagne créée sans mode est en reel", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(CreerCampagneEntree.parse({ companyId: id, projectId: id, nom: "Essai", brief: "Brief" }).mode).toBe("reel");
  });

  it("une entreprise sans réglages enregistrés suit le défaut réel", () => {
    expect(calculerModeEffectif(null, { existe: false, modeParDefaut: "reel" }).mode).toBe("reel");
  });

  it("la garde reste stricte : une démonstration explicite dans une entreprise en démonstration reste démonstration", () => {
    expect(calculerModeEffectif({ mode: "demonstration" }, { existe: true, modeParDefaut: "demonstration" }).mode).toBe("demonstration");
  });
});
