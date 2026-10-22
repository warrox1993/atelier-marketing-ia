// @vitest-environment jsdom
/**
 * Bande d'avancement épinglée : choix 3D ou 2D selon les conditions (WebGL simulé), scène aria-hidden, liste d'étiquettes
 * toujours présente, nettoyage au démontage, clic sur une station, panneau « Voir les N missions », place hors du log.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avancementMission, type AgentMission, type MissionLue, type TacheMission } from "../../src/ui/avancement-missions.js";
import { BandeauMissions } from "../../src/ui/composants/bandeau-missions.js";
import { reinitialiserSondeWebgl } from "../../src/ui/frise3d/logique.js";
import type { ModuleScene } from "../../src/ui/frise3d/chargeur.js";
import { cliquer, installerPont, rendre } from "./pont.js";

const AGENTS: AgentMission[] = [{ id: "r", nom: "Relecteur", cle: "relecteur", role: "qa" }];
const t = (n: number, status: string, titre: string, agentId: string | null): TacheMission => ({ id: `t${n}`, identifier: `SVC-${n}`, title: titre, status, agentId, maj: "2026-10-21T10:00:00Z" });
const mission = (racine: TacheMission, filles: TacheMission[]): MissionLue => ({ companyId: "c", slug: "s", nom: "Service fictif", racine, filles, agents: AGENTS });
const enCours = () => avancementMission(mission(t(1, "in_progress", "Mission A", null), [t(2, "in_progress", "Revue finale", "r")]), new Set(["SVC-2"]));
const terminee = () => avancementMission(mission(t(9, "done", "Ancienne mission", null), []));

/** Module de scène simulé : compte les créations, mises à jour et destructions. */
function moduleSimule() {
  const detruire = vi.fn();
  const mettre = vi.fn();
  const creerScene = vi.fn(() => ({ mettre, recolorer: vi.fn(), redimensionner: vi.fn(), detruire }));
  return { module: { creerScene } as unknown as ModuleScene, creerScene, mettre, detruire };
}

function simulerWebgl(actif: boolean) {
  if (actif) vi.stubGlobal("WebGLRenderingContext", class {});
  else vi.stubGlobal("WebGLRenderingContext", undefined);
  if (actif) vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ getExtension: () => null })) as never);
}

function simulerMouvement(reduit: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduit && q.includes("reduced-motion"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
}

function simulerLargeur(px: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: px, height: 100, top: 0, left: 0, right: px, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
}

beforeEach(() => {
  installerPont("/RNO/atelier/discussion");
  reinitialiserSondeWebgl();
  simulerMouvement(false);
  simulerLargeur(800);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  reinitialiserSondeWebgl();
  document.body.innerHTML = "";
});

describe("BandeauMissions : choix 3D ou 2D", () => {
  it("3D : la scène est créée dans un conteneur aria-hidden, les étiquettes restent dans l'arbre d'accessibilité", async () => {
    simulerWebgl(true);
    const s = moduleSimule();
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: async () => s.module }));
    const bande = r.conteneur.querySelector(".atl-bande")!;
    expect(bande.getAttribute("data-mode")).toBe("3d");
    const scene = r.conteneur.querySelector("[data-testid=bande-scene]")!;
    expect(scene.getAttribute("aria-hidden")).toBe("true");
    expect(s.creerScene).toHaveBeenCalledOnce();
    const options = (s.creerScene.mock.calls[0] as unknown as [{ conteneur: HTMLElement; phases: Array<{ etat: string }> }])[0];
    expect(options.conteneur).toBe(scene);
    expect(options.phases).toHaveLength(6);
    expect(options.phases.find((p) => p.etat === "attend_decision")).toBeDefined();
    const liste = r.conteneur.querySelector("ol[role=list]")!;
    expect(liste.closest("[aria-hidden=true]")).toBeNull();
    expect(liste.querySelectorAll("li")).toHaveLength(6);
    expect(liste.querySelector("[data-phase=revue]")!.textContent).toContain("attend votre décision");
    expect(liste.querySelector("[data-phase=revue] button")!.getAttribute("aria-label")).toContain("Revue : attend votre décision, 1 tâche");
  });

  it("sans WebGL : repli 2D, aucune scène chargée", async () => {
    simulerWebgl(false);
    const s = moduleSimule();
    const charger = vi.fn(async () => s.module);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: charger }));
    expect(r.conteneur.querySelector(".atl-bande")!.getAttribute("data-mode")).toBe("2d");
    expect(r.conteneur.querySelector("[data-testid=bande-scene]")).toBeNull();
    expect(charger).not.toHaveBeenCalled();
    expect(r.conteneur.querySelectorAll("li.atl-bande-phase")).toHaveLength(6);
  });

  it("prefers-reduced-motion : repli 2D", async () => {
    simulerWebgl(true);
    simulerMouvement(true);
    const charger = vi.fn(async () => moduleSimule().module);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: charger }));
    expect(r.conteneur.querySelector(".atl-bande")!.getAttribute("data-mode")).toBe("2d");
    expect(charger).not.toHaveBeenCalled();
  });

  it("sous 600 px : repli 2D (marqueurs seuls, étroit)", async () => {
    simulerWebgl(true);
    simulerLargeur(390);
    const charger = vi.fn(async () => moduleSimule().module);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: charger }));
    const bande = r.conteneur.querySelector(".atl-bande")!;
    expect(bande.getAttribute("data-mode")).toBe("2d");
    expect(bande.getAttribute("data-etroit")).toBe("oui");
    expect(charger).not.toHaveBeenCalled();
  });

  it("échec du chargement du module : repli 2D, liste intacte", async () => {
    simulerWebgl(true);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: async () => Promise.reject(new Error("réseau")) }));
    expect(r.conteneur.querySelector(".atl-bande")!.getAttribute("data-mode")).toBe("2d");
    expect(r.conteneur.querySelector("[data-testid=bande-scene]")).toBeNull();
    expect(r.conteneur.querySelectorAll("li.atl-bande-phase")).toHaveLength(6);
  });

  it("perte du contexte WebGL pendant la vie de la bande : repli 2D et scène détruite", async () => {
    simulerWebgl(true);
    const s = moduleSimule();
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: async () => s.module }));
    const options = (s.creerScene.mock.calls[0] as unknown as [{ surPerte: () => void }])[0];
    const { act } = await import("react");
    await act(async () => options.surPerte());
    expect(r.conteneur.querySelector(".atl-bande")!.getAttribute("data-mode")).toBe("2d");
    expect(s.detruire).toHaveBeenCalledOnce();
  });
});

describe("BandeauMissions : vie de la scène", () => {
  it("le démontage détruit la scène ; un démontage avant la fin du chargement ne crée rien", async () => {
    simulerWebgl(true);
    const s = moduleSimule();
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: async () => s.module }));
    r.demonter();
    expect(s.detruire).toHaveBeenCalledOnce();

    const s2 = moduleSimule();
    let livrer!: (m: ModuleScene) => void;
    const lent = new Promise<ModuleScene>((ok) => (livrer = ok));
    const r2 = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: () => lent }));
    r2.demonter();
    livrer(s2.module);
    await lent;
    expect(s2.creerScene).not.toHaveBeenCalled();
  });

  it("un nouvel état de phases est transmis à la scène existante, sans la recréer", async () => {
    simulerWebgl(true);
    const s = moduleSimule();
    const charger = async () => s.module;
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: charger }));
    const avant = s.mettre.mock.calls.length;
    const suite = avancementMission(mission(t(1, "in_progress", "Mission A", null), [t(2, "done", "Revue finale", "r")]));
    const { act } = await import("react");
    await act(async () => {
      r.racine.render(createElement(BandeauMissions, { enCours: [suite], terminees: [], chargerScene: charger }));
    });
    expect(s.creerScene).toHaveBeenCalledOnce();
    expect(s.mettre.mock.calls.length).toBeGreaterThan(avant);
  });
});

describe("BandeauMissions : interactions et place", () => {
  it("un clic sur une station déplie ses tâches, un second les replie", async () => {
    simulerWebgl(false);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [] }));
    const bouton = r.conteneur.querySelector<HTMLButtonElement>("[data-phase=revue] button")!;
    await cliquer(bouton);
    const panneau = r.conteneur.querySelector(".atl-bande-taches")!;
    expect(panneau.textContent).toContain("SVC-2");
    expect(panneau.textContent).toContain("Revue finale");
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    await cliquer(bouton);
    expect(r.conteneur.querySelector(".atl-bande-taches")).toBeNull();
  });

  it("« Voir les N missions » déplie le panneau complet (frise 2D de chaque mission), « Replier » le ferme", async () => {
    simulerWebgl(false);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [terminee()] }));
    const voir = r.conteneur.querySelector<HTMLButtonElement>(".atl-bande-voir")!;
    expect(voir.textContent).toBe("Voir les 2 missions");
    expect(voir.getAttribute("aria-expanded")).toBe("false");
    expect(r.conteneur.querySelector("[data-testid=frises-missions]")).toBeNull();
    await cliquer(voir);
    expect(voir.getAttribute("aria-expanded")).toBe("true");
    expect(voir.textContent).toBe("Replier");
    const panneau = r.conteneur.querySelector("#" + CSS.escape(voir.getAttribute("aria-controls")!))!;
    expect(panneau.querySelector("[data-testid=frise-mission]")).not.toBeNull();
    expect(panneau.querySelector("[data-testid=frise-terminee]")).not.toBeNull();
    await cliquer(voir);
    expect(r.conteneur.querySelector("[data-testid=frises-missions]")).toBeNull();
  });

  it("une seule mission : « Voir le détail » ; aucune mission : rien", async () => {
    simulerWebgl(false);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [] }));
    expect(r.conteneur.querySelector(".atl-bande-voir")!.textContent).toBe("Voir le détail");
    const vide = await rendre(createElement(BandeauMissions, { enCours: [], terminees: [] }));
    expect(vide.conteneur.querySelector("[data-testid=bandeau-missions]")).toBeNull();
  });

  it("seulement des missions terminées : texte clair, bouton pour les voir, pas de scène", async () => {
    simulerWebgl(true);
    const charger = vi.fn(async () => moduleSimule().module);
    const r = await rendre(createElement(BandeauMissions, { enCours: [], terminees: [terminee()], chargerScene: charger }));
    expect(r.conteneur.textContent).toContain("Aucune mission en cours");
    expect(r.conteneur.querySelector("[data-testid=bande-scene]")).toBeNull();
    expect(charger).not.toHaveBeenCalled();
  });

  it("le résumé dit la décision attendue, en texte", async () => {
    simulerWebgl(false);
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [] }));
    expect(r.conteneur.querySelector(".atl-bande-resume")!.textContent).toBe("Revue : vous devez décider");
    expect(r.conteneur.querySelector(".atl-bande-resume")!.getAttribute("data-attend")).toBe("oui");
  });

  it("clic sur la scène : déplie les tâches de la station sous le pointeur", async () => {
    simulerWebgl(true);
    const s = moduleSimule();
    const r = await rendre(createElement(BandeauMissions, { enCours: [enCours()], terminees: [], chargerScene: async () => s.module }));
    const scene = r.conteneur.querySelector<HTMLElement>("[data-testid=bande-scene]")!;
    const { act } = await import("react");
    // 800 px de large, six colonnes : la colonne 3 (Revue) couvre 400 à 533 px
    await act(async () => {
      scene.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 450 }));
    });
    expect(r.conteneur.querySelector(".atl-bande-taches")?.textContent).toContain("SVC-2");
  });
});
