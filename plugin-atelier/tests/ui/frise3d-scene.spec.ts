// @vitest-environment jsdom
/**
 * Scène 3D avec un moteur de rendu simulé (pas de WebGL en test) : rendu à la demande (aucune boucle permanente),
 * plafond du rapport de pixels, libération complète au démontage, perte de contexte.
 */
import { BoxGeometry, BufferGeometry, Material, TorusGeometry } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerScene, type MoteurRendu, type PhaseScene } from "../../src/ui/frise3d/scene.js";
import type { Pieces } from "../../src/ui/frise3d/pieces.js";
import { DUREES } from "../../src/ui/frise3d/logique.js";
import type { EtatPhase } from "../../src/ui/avancement-missions.js";

const IDS = ["strategie", "production", "coordonnees", "revue", "controles", "reponse"];
const phases = (...etats: EtatPhase[]): PhaseScene[] => etats.map((etat, i) => ({ id: IDS[i]!, etat }));

// Le vrai modèle (GLB) est lu dans frise3d-modele.spec.ts, en environnement node ; ici, des formes simples de mêmes noms et rôles.
const pieces: Pieces = {
  station: new BoxGeometry(1.3, 0.34, 0.8).translate(0, 0.17, 0),
  piste: { geometrie: new BoxGeometry(13, 0.1, 1.7).translate(0, 0.05, 0), y: -0.1 },
  volume: new BoxGeometry(0.3, 0.3, 0.3),
  anneau: new TorusGeometry(0.66, 0.03, 8, 56).rotateX(Math.PI / 2),
};
let rafs: Array<(t: number) => void>;
let maintenant: number;
type Espion = ReturnType<typeof vi.fn>;
let moteur: { domElement: HTMLCanvasElement; shadowMap: { enabled: boolean; type: number }; setPixelRatio: Espion; setSize: Espion; render: Espion; dispose: Espion; forceContextLoss: Espion };
let conteneur: HTMLDivElement;

const fabrique = (): MoteurRendu => {
  moteur = {
    domElement: document.createElement("canvas"),
    shadowMap: { enabled: false, type: 0 },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
  return moteur as unknown as MoteurRendu;
};

/** Joue les images demandées en avançant l'horloge de 16 ms par image ; renvoie le nombre d'images jouées. */
function jouer(max = 1000): number {
  let n = 0;
  while (rafs.length > 0 && n < max) {
    const f = rafs.shift()!;
    maintenant += 16;
    f(maintenant);
    n += 1;
  }
  return n;
}

beforeEach(() => {
  rafs = [];
  maintenant = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => maintenant);
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => rafs.push(f));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafs.splice(id - 1, 1);
  });
  conteneur = document.createElement("div");
  Object.defineProperty(conteneur, "clientWidth", { value: 768 });
  Object.defineProperty(conteneur, "clientHeight", { value: 60 });
  document.body.append(conteneur);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  conteneur.remove();
});

describe("creerScene", () => {
  it("monte un canvas aria-hidden dans le conteneur et plafonne le rapport de pixels à 2", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    window.devicePixelRatio = 3;
    creerScene({ conteneur, pieces, phases: phases("faite", "faite", "faite", "en_cours", "a_venir", "a_venir"), fabriqueMoteur: fabrique });
    expect(conteneur.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
    expect(moteur.setPixelRatio).toHaveBeenCalledWith(2);
    expect(moteur.shadowMap.enabled).toBe(true);
  });

  it("rendu à la demande : une animation courte, puis plus aucune image demandée", () => {
    creerScene({ conteneur, pieces, phases: phases("faite", "faite", "faite", "en_cours", "a_venir", "a_venir"), fabriqueMoteur: fabrique });
    expect(moteur.render).toHaveBeenCalled(); // image initiale
    expect(rafs.length).toBe(1); // animation d'entrée
    const images = jouer();
    expect(images).toBeGreaterThan(1);
    expect(images * 16).toBeLessThan(2500); // quelques secondes au plus
    expect(rafs.length).toBe(0); // arrêt : pas de boucle permanente
    const rendus = moteur.render.mock.calls.length;
    maintenant += 60_000;
    expect(jouer()).toBe(0);
    expect(moteur.render.mock.calls.length).toBe(rendus);
  });

  it("un changement d'état relance une animation courte, puis s'arrête ; sans changement, rien", () => {
    const s = creerScene({ conteneur, pieces, phases: phases("faite", "faite", "faite", "en_cours", "a_venir", "a_venir"), fabriqueMoteur: fabrique });
    jouer();
    s.mettre(phases("faite", "faite", "faite", "en_cours", "a_venir", "a_venir"));
    const apresIdentique = rafs.length;
    jouer();
    expect(apresIdentique).toBeLessThanOrEqual(1);
    s.mettre(phases("faite", "faite", "faite", "faite", "en_cours", "a_venir"));
    expect(rafs.length).toBe(1);
    expect(jouer()).toBeGreaterThan(1);
    expect(rafs.length).toBe(0);
  });

  it("« attend votre décision » : pulsation bornée dans le temps (pas de boucle infinie)", () => {
    creerScene({ conteneur, pieces, phases: phases("faite", "faite", "faite", "faite", "attend_decision", "a_venir"), fabriqueMoteur: fabrique });
    const images = jouer(10_000);
    expect(images * 16).toBeGreaterThanOrEqual(DUREES.pulsation - 100);
    expect(images * 16).toBeLessThan(DUREES.pulsation + 1500);
    expect(rafs.length).toBe(0);
  });

  it("une seule image en attente à la fois, même après plusieurs changements rapprochés", () => {
    const s = creerScene({ conteneur, pieces, phases: phases("faite", "en_cours", "a_venir", "a_venir", "a_venir", "a_venir"), fabriqueMoteur: fabrique });
    s.mettre(phases("faite", "faite", "en_cours", "a_venir", "a_venir", "a_venir"));
    s.mettre(phases("faite", "faite", "faite", "en_cours", "a_venir", "a_venir"));
    expect(rafs.length).toBe(1);
  });

  it("nettoyage complet : géométries, matières, moteur, contexte, canvas ; sans effet au second appel", () => {
    const geoms = vi.spyOn(BufferGeometry.prototype, "dispose");
    const mats = vi.spyOn(Material.prototype, "dispose");
    const s = creerScene({ conteneur, pieces, phases: phases("faite", "faite", "faite", "attend_decision", "a_venir", "non_prevue"), fabriqueMoteur: fabrique });
    expect(rafs.length).toBe(1);
    s.detruire();
    // socle, piste, volume, anneau (copies propres à la scène) ; piste, 6 socles, 6 anneaux, volume
    expect(new Set(geoms.mock.instances).size).toBe(4);
    expect(new Set(mats.mock.instances).size).toBe(1 + 6 + 6 + 1);
    expect(moteur.dispose).toHaveBeenCalledOnce();
    expect(moteur.forceContextLoss).toHaveBeenCalledOnce();
    expect(conteneur.querySelector("canvas")).toBeNull();
    expect(rafs.length).toBe(0); // l'image en attente est annulée
    const rendus = moteur.render.mock.calls.length;
    s.mettre(phases("faite", "faite", "faite", "faite", "faite", "faite"));
    s.redimensionner();
    s.detruire();
    expect(moteur.dispose).toHaveBeenCalledOnce();
    expect(moteur.render.mock.calls.length).toBe(rendus);
    expect(rafs.length).toBe(0);
  });

  it("perte du contexte WebGL : l'appelant est prévenu (repli 2D)", () => {
    const surPerte = vi.fn();
    creerScene({ conteneur, pieces, phases: phases("faite", "faite", "faite", "en_cours", "a_venir", "a_venir"), fabriqueMoteur: fabrique, surPerte });
    const e = new Event("webglcontextlost", { cancelable: true });
    moteur.domElement.dispatchEvent(e);
    expect(surPerte).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });
});
