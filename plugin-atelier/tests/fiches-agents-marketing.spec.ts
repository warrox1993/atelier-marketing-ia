/**
 * Fiches des agents marketing : le fichier généré est à jour par rapport aux sources (registre, AGENTS.md, SKILL.md),
 * chaque agent du registre a sa fiche complète, et les textes n'ont ni tiret cadratin ni chemin local.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FICHES_AGENTS_MARKETING, HUMAIN_SEUL_MARKETING, OBLIGATIONS_MARKETING, PARCOURS_DEMANDE } from "../src/contrats/fiches-agents-marketing.js";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FICHIER = resolve(RACINE, "plugin-atelier/src/contrats/fiches-agents-marketing.ts");
const registre = JSON.parse(readFileSync(resolve(RACINE, "organisation/registre/agents.json"), "utf8")) as { agents: Array<{ slug: string; mission: string; competences: string[] }> };

describe("fiches des agents marketing", () => {
  it("le fichier généré est à jour (régénéré par scripts/generer-fiches-agents.py puis comparé)", () => {
    const attendu = execFileSync("python3", ["-I", resolve(RACINE, "scripts/generer-fiches-agents.py"), "--stdout"], { encoding: "utf8" });
    expect(readFileSync(FICHIER, "utf8")).toBe(attendu);
  });

  it("chaque agent du registre a une fiche avec mission, entrées, sorties et justification", () => {
    expect(FICHES_AGENTS_MARKETING.map((f) => f.slug)).toEqual(registre.agents.map((a) => a.slug));
    for (const f of FICHES_AGENTS_MARKETING) {
      expect(f.mission.length, f.slug).toBeGreaterThan(20);
      expect(f.recoit.length, f.slug).toBeGreaterThan(0);
      expect(f.livre.length, f.slug).toBeGreaterThan(0);
      expect(f.pourquoi.length, f.slug).toBeGreaterThan(20);
    }
  });

  it("les compétences listées sont celles des consignes de l'agent, chacune avec un nom et une phrase", () => {
    for (const f of FICHES_AGENTS_MARKETING) {
      const entete = /^---\n([\s\S]*?)\n---/u.exec(readFileSync(resolve(RACINE, `organisation/agents/${f.slug}/AGENTS.md`), "utf8"))![1]!;
      const attachees = [...(/^skills:\s*\n((?:\s+- .*\n?)+)/mu.exec(entete)?.[1] ?? "").matchAll(/"([^"]+)"/gu)].map((m) => m[1]);
      expect(f.competences.map((c) => c.cle), f.slug).toEqual(attachees);
      for (const c of f.competences) {
        expect(c.nom.length, c.cle).toBeGreaterThan(3);
        expect(c.sert, c.cle).toMatch(/[.!?]$/u);
      }
    }
    const coord = FICHES_AGENTS_MARKETING.find((f) => f.slug === "coordinateur")!;
    expect(coord.competences.find((c) => c.cle === "cadrage-exigences")).toMatchObject({ nom: "Cadrage et extraction des exigences" });
  });

  it("les interdits viennent des règles non négociables, recopiés (ex. : le Coordinateur ne publie rien)", () => {
    const coord = FICHES_AGENTS_MARKETING.find((f) => f.slug === "coordinateur")!;
    expect(coord.interdits.some((i) => i.startsWith("Aucune publication, aucun envoi, aucune dépense"))).toBe(true);
    const social = FICHES_AGENTS_MARKETING.find((f) => f.slug === "reseaux-sociaux")!;
    expect(social.interdits).toContain("Tu ne publies rien, tu ne programmes rien et tu n'envoies aucun message privé.");
  });

  it("le parcours a 6 étapes au plus, nomme des agents connus, et reprend humainSeul et obligations du registre", () => {
    expect(PARCOURS_DEMANDE.length).toBeLessThanOrEqual(6);
    const slugs = new Set(FICHES_AGENTS_MARKETING.map((f) => f.slug));
    for (const e of PARCOURS_DEMANDE) for (const s of e.agents) expect(slugs.has(s), s).toBe(true);
    const services = JSON.parse(readFileSync(resolve(RACINE, "organisation/registre/services.json"), "utf8")) as { services: Array<{ slug: string; humainSeul: string[]; obligations: string[] }> };
    const marketing = services.services.find((s) => s.slug === "marketing")!;
    expect([...HUMAIN_SEUL_MARKETING]).toEqual(marketing.humainSeul);
    expect([...OBLIGATIONS_MARKETING]).toEqual(marketing.obligations);
  });

  it("aucun tiret cadratin ni chemin local dans le fichier généré", () => {
    expect(readFileSync(FICHIER, "utf8")).not.toMatch(/—|\/home\//u);
  });
});
