// @vitest-environment jsdom
/** Frise d'une mission : rôles, annonces, état en texte, dépli des tâches avec lien, missions terminées repliées. */
import { createElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { avancementMission, type AgentMission, type MissionLue, type TacheMission } from "../../src/ui/avancement-missions.js";
import { FrisesMissions, TERMINEES_AFFICHEES } from "../../src/ui/composants/frise-mission.js";
import { cliquer, installerPont, rendre } from "./pont.js";

const AGENTS: AgentMission[] = [
  { id: "p", nom: "Prospection", cle: "prospection", role: "researcher" },
  { id: "r", nom: "Relecteur", cle: "relecteur", role: "qa" },
];
const t = (n: number, status: string, titre: string, agentId: string | null): TacheMission => ({ id: `t${n}`, identifier: `SVC-${n}`, title: titre, status, agentId, maj: "2026-10-21T10:00:00Z" });
const m = (racine: TacheMission, filles: TacheMission[]): MissionLue => ({ companyId: "c", slug: "s", nom: "Service fictif", racine, filles, agents: AGENTS });

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
});

describe("FrisesMissions", () => {
  it("rien à montrer : rien dans le fil", async () => {
    const r = await rendre(createElement(FrisesMissions, { enCours: [], terminees: [] }));
    expect(r.conteneur.querySelector("[data-testid=frises-missions]")).toBeNull();
  });

  it("liste de six phases, états écrits en texte, annonce « Revue : en cours, 1 tâche »", async () => {
    const av = avancementMission(m(t(1, "in_progress", "Mission", null), [t(2, "done", "Prospection", "p"), t(3, "todo", "Revue", "r")]));
    const r = await rendre(createElement(FrisesMissions, { enCours: [av], terminees: [] }));
    const liste = r.conteneur.querySelector("ol[role=list]")!;
    expect(liste.querySelectorAll("li.atl-frise-phase")).toHaveLength(6);
    const revue = liste.querySelector("[data-phase=revue]")!;
    expect(revue.textContent).toContain("en cours");
    expect(revue.querySelector("button")!.getAttribute("aria-label")).toContain("Revue : en cours, 1 tâche");
    expect(liste.querySelector("[data-phase=production]")!.textContent).toContain("faite");
    expect(liste.querySelector("[data-phase=strategie]")!.textContent).toContain("non prévue");
    expect(liste.querySelector("[data-phase=strategie] button")).toBeNull();
    expect(r.conteneur.querySelector("[aria-current=step]")!.getAttribute("data-phase")).toBe("revue");
  });

  it("un clic déplie les tâches (identifiant en lien, titre, statut, agent), un second clic les replie", async () => {
    const av = avancementMission(m(t(1, "in_progress", "Mission", null), [t(3, "in_review", "Revue finale", "r")]));
    const r = await rendre(createElement(FrisesMissions, { enCours: [av], terminees: [] }));
    const bouton = r.conteneur.querySelector<HTMLButtonElement>("[data-phase=revue] button")!;
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    await cliquer(bouton);
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    const panneau = r.conteneur.querySelector("[data-testid=frise-taches-revue]")!;
    expect(panneau.id).toBe(bouton.getAttribute("aria-controls"));
    expect(panneau.textContent).toContain("SVC-3");
    expect(panneau.textContent).toContain("Revue finale");
    expect(panneau.textContent).toContain("En revue · Relecteur");
    expect(panneau.querySelector("a")).not.toBeNull();
    await cliquer(bouton);
    expect(r.conteneur.querySelector("[data-testid=frise-taches-revue]")).toBeNull();
  });

  it("attend votre décision : écrit en texte et résumé en tête", async () => {
    const av = avancementMission(m(t(1, "in_progress", "Mission", null), [t(3, "in_progress", "Revue", "r")]), new Set(["SVC-3"]));
    const r = await rendre(createElement(FrisesMissions, { enCours: [av], terminees: [] }));
    expect(r.conteneur.querySelector("[data-phase=revue]")!.textContent).toContain("attend votre décision");
    expect(r.conteneur.querySelector(".atl-frise-resume")!.textContent).toBe("Revue : vous devez décider");
  });

  it("missions terminées : une ligne « Terminée » chacune, plafonnées, le reste compté", async () => {
    const fin = (n: number) => avancementMission(m(t(n, "done", `Mission ${n}`, null), []));
    const toutes = [1, 2, 3, 4, 5].map(fin);
    const r = await rendre(createElement(FrisesMissions, { enCours: [], terminees: toutes }));
    const lignes = r.conteneur.querySelectorAll("[data-testid=frise-terminee]");
    expect(lignes).toHaveLength(TERMINEES_AFFICHEES);
    expect(lignes[0]!.textContent).toContain("Terminée");
    expect(r.conteneur.querySelector(".atl-frise-fini-reste")!.textContent).toBe("et 2 autres terminées");
    expect(r.conteneur.querySelector("[data-testid=frise-mission]")).toBeNull();
  });
});
