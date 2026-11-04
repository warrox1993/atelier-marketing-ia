/**
 * Fiche des corps d'entrée des routes d'agents : à jour, complète, et chaque
 * exemple JSON passe son schéma zod.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FICHE_ROUTES_AGENTS,
  ROUTES_SANS_CORPS,
  SCHEMAS_CORPS,
  exempleDeRoute,
  genererFiche,
  routesAgents,
  routesSansSchema,
} from "../scripts/fiche-routes-agents.js";

describe("fiche des routes d'agents", () => {
  it("la fiche écrite est à jour (régénérée puis comparée)", () => {
    expect(readFileSync(FICHE_ROUTES_AGENTS, "utf8")).toBe(genererFiche());
  });

  it("toute route d'agent en écriture a un schéma déclaré ou est déclarée sans corps", () => {
    expect(routesSansSchema()).toEqual([]);
  });

  it("aucun schéma ni exception ne vise une route inexistante ou réservée aux humains", () => {
    const cles = new Set(routesAgents().map((r) => r.cle));
    for (const cle of [...Object.keys(SCHEMAS_CORPS), ...ROUTES_SANS_CORPS]) expect(cles.has(cle), cle).toBe(true);
  });

  it.each(Object.keys(SCHEMAS_CORPS))("l'exemple de %s passe son schéma zod", (cle) => {
    const r = SCHEMAS_CORPS[cle]!.safeParse(exempleDeRoute(cle));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("chaque route d'agent en écriture a sa section et la fiche n'a ni tiret cadratin ni chemin local", () => {
    const fiche = genererFiche();
    for (const r of routesAgents()) expect(fiche).toContain(`## ${r.methode} ${r.chemin}\n`);
    expect(fiche).not.toMatch(/—|\/home\//u);
  });

  it("les bornes d'un tableau affichent le motif de ses éléments (exigencesExaminees)", () => {
    const ligne = genererFiche().split("\n").find((l) => l.includes("exigencesExaminees"));
    expect(ligne, "ligne exigencesExaminees").toBeDefined();
    expect(ligne).toContain("^REQ-");
  });

  it("pas de motif pour des éléments déjà nommés par leur format (filtres.documentIds, uuid)", () => {
    const ligne = genererFiche().split("\n").find((l) => l.includes("`filtres.documentIds`"));
    expect(ligne, "ligne filtres.documentIds").toBeDefined();
    expect(ligne).toContain("tableau de uuid");
    expect(ligne).not.toContain("motif");
  });
});
