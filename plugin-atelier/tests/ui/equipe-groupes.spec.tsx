// @vitest-environment jsdom
/** Équipe lisible pour un client : pôles, contrôles automatiques repliés, mention unique, « Jamais lancé ». */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentVue, VueEquipe } from "../../src/contrats/ui.js";
import { PageAtelier } from "../../src/ui/index.js";
import { grouperAgents } from "../../src/ui/vues/equipe.js";
import { ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let n = 0;
const agent = (nom: string, titre: string | null, o: Partial<AgentVue> = {}): AgentVue => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, nom, role: "general", titre, statutNatif: "paused", pauseRaison: "import",
  adaptateur: "claude_local", etatConnexion: "configure_non_verifie", mode: "demonstration", rapporteA: null, tacheEnCours: null, runActifId: null,
  competences: [{ cle: "a", empreinte: null, source: "configuration" }], blocages: [], ...o,
});
const AGENTS = [
  agent("Gardien des connexions", "Gardien des connexions (déterministe, sans modèle)", { etatConnexion: "non_connecte", competences: [] }),
  agent("Contenus", "Pôle Production · Contenus et création"),
  agent("Conformité publicitaire", "Pôle Contrôle préalable · Communications commerciales réglementées"),
  agent("Tests techniques", "Vérificateur technique", { competences: [] }),
  agent("Réseaux sociaux", "Pôle Contenus · Calendrier social"),
  agent("Mesure", "Pôle Intelligence · Mesure et optimisation"),
  agent("Exigences", "Contrôleur des exigences"),
  agent("Porte", "Porte de contrôle", { etatConnexion: "non_connecte", competences: [] }),
  agent("Coordinateur", "Coordinateur marketing"),
];
const equipe = (agents: AgentVue[]): VueEquipe => ({ agents, runsActifs: 0, plafondRunsActifs: 3, echangesRecents: [], dependances: [] });

let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont("/RNO/atelier/equipe");
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});
async function ouvrir(agents: AgentVue[]) {
  pont.donnees["atelier.equipe"] = { data: equipe(agents), loading: false, error: null };
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("grouperAgents", () => {
  it("pôles dans l'ordre, coordination d'abord, contrôles automatiques à part", () => {
    const g = grouperAgents(AGENTS);
    expect(g.groupes.map((x) => x.titre)).toEqual(["Coordination et qualité", "Pôle Intelligence", "Pôle Production", "Pôle Contenus", "Pôle Contrôle préalable"]);
    expect(g.groupes[0]!.agents.map((a) => a.nom)).toEqual(["Coordinateur"]);
    expect(g.controles.map((a) => a.nom)).toEqual(["Gardien des connexions", "Tests techniques", "Exigences", "Porte"]);
  });
});

describe("vue Équipe", () => {
  it("un titre par pôle et un groupe « Contrôles automatiques » replié par défaut", async () => {
    const c = await ouvrir(AGENTS);
    const titres = Array.from(c.querySelectorAll(".atl-equipe-groupe > h3")).map((h) => h.textContent);
    expect(titres).toEqual(["Coordination et qualité", "Pôle Intelligence", "Pôle Production", "Pôle Contenus", "Pôle Contrôle préalable"]);
    const controles = c.querySelector("details.atl-equipe-controles") as HTMLDetailsElement;
    expect(controles.open).toBe(false);
    expect(controles.querySelector("summary")!.textContent).toContain("Contrôles automatiques (4)");
    expect(controles.querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("aucun agent n'a travaillé : une seule mention, « Jamais lancé » par ligne, plus de « Prêt, pas encore utilisé »", async () => {
    const c = await ouvrir(AGENTS);
    expect(c.textContent!.split("Aucun agent n'a encore travaillé pour ce client.").length - 1).toBe(1);
    expect(c.textContent).not.toContain("Prêt, pas encore utilisé");
    expect(c.textContent).not.toContain("pas encore utilisées");
    expect(c.textContent).toContain("Jamais lancé");
  });

  it("un agent a travaillé : la mention disparaît", async () => {
    const c = await ouvrir([agent("Contenus", "Pôle Production · Contenus", { etatConnexion: "reel_teste" }), ...AGENTS.slice(2, 3)]);
    expect(c.textContent).not.toContain("Aucun agent n'a encore travaillé");
  });

  it("« En pause » sans « Depuis l'import des agents » ; les autres raisons restent dites", async () => {
    const c = await ouvrir([agent("Contenus", "Pôle Production · Contenus"), agent("SEA", "Pôle Production · SEA", { pauseRaison: "budget" })]);
    expect(c.textContent).not.toContain("Depuis l'import");
    expect(c.textContent).toContain("En pause");
    expect(c.textContent).toContain("Plafond de budget atteint");
  });

  it("« (déterministe, sans modèle) » n'est plus visible mais reste en info-bulle", async () => {
    const c = await ouvrir(AGENTS);
    expect(c.textContent).not.toContain("déterministe");
    const ligne = parTexte(c, "th[scope=row]", "Gardien des connexions");
    expect(ligne.querySelector(".atl-sous")!.getAttribute("title")).toContain("déterministe, sans modèle");
  });

  it("l'agent choisi dans les contrôles automatiques ouvre le groupe", async () => {
    pont.chemin = `/RNO/atelier/equipe/${AGENTS[0]!.id}`;
    const c = await ouvrir(AGENTS);
    expect((c.querySelector("details.atl-equipe-controles") as HTMLDetailsElement).open).toBe(true);
  });
});
