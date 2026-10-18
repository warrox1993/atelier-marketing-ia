// @vitest-environment jsdom
/**
 * Vue d'un service de l'organigramme : disposition pure de l'arbre (aucun chevauchement, lignes selon la largeur disponible,
 * groupe « +N agents » au-delà de 40, 10 000 agents en moins de 150 ms), satellites (côtés, équilibre, hauteur du contenu,
 * colonne qui défile, flèches pleines et pointillées sans nombre), toile (zoom, ajustement, glisser, clavier), rendu jsdom
 * (en-tête, liens, surbrillance, virtualisation, clic sur un partenaire, téléphone) et cibles tactiles des styles.
 */
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentHote } from "../../src/ui/organigramme-arbre.js";
import type { FluxBrut, ServiceCarte } from "../../src/ui/organigramme-flux.js";
import { liaisonsDe, fluxMetier } from "../../src/ui/organigramme-flux.js";
import {
  CARTE_AGENT, CARTES_AVANT_VIRTUALISATION, ECHELLE_MAX, ECHELLE_MIN, ECHELLE_OUVERTURE_MIN, ENFANTS_AVANT_GROUPE, GOUTTIERE, HAUTEUR_MIN_FIGURE, SATELLITE, SATELLITES_VISIBLES_MAX,
  ancetresDe, disposerArbreAgents, disposerSatellites, elementsVisibles, epaisseurPourVolume, fenetreVisible, transformationAjustee, transformationCentree, VueServiceOrganigramme, zoomerAutour,
  type CarteArbre, type DispositionArbre,
} from "../../src/ui/organigramme-service.js";
import { STYLES_ORGANIGRAMME_SERVICE } from "../../src/ui/styles-organigramme-service.js";
import { cliquer, installerPont, rendre, type Rendu } from "./pont.js";

const ag = (id: string, name: string, o: Partial<AgentHote> = {}): AgentHote => ({ id, name, role: "general", title: null, status: "idle", reportsTo: null, adapterType: "claude_local", ...o });
const coord = (id = "c") => ag(id, "Coordinateur", { role: "ceo" });
const sousCoord = (n: number, pere = "c", prefixe = "a"): AgentHote[] => Array.from({ length: n }, (_, i) => ag(`${prefixe}${i}`, `Agent ${String(i).padStart(5, "0")}`, { reportsTo: pere }));

/** Vrai si deux cartes se recouvrent (balayage par ordre de y, jamais O(n²) sur 10 000 cartes). */
function chevauchement(cartes: readonly CarteArbre[]): boolean {
  const tri = [...cartes].sort((a, b) => a.y - b.y);
  let actives: CarteArbre[] = [];
  for (const c of tri) {
    actives = actives.filter((a) => a.y + a.hauteur > c.y);
    if (actives.some((a) => a.x < c.x + c.largeur && c.x < a.x + a.largeur)) return true;
    actives.push(c);
  }
  return false;
}
const carte = (d: DispositionArbre, id: string) => d.cartes.find((c) => c.id === id) as CarteArbre;

describe("disposerArbreAgents", () => {
  it("coordinateur en haut, enfants en rangée dessous, sans chevauchement", () => {
    const agents = [coord(), ...sousCoord(5)];
    const d = disposerArbreAgents(agents);
    expect(d.cartes).toHaveLength(6);
    expect(carte(d, "c").y).toBeLessThan(carte(d, "a0").y);
    const ys = new Set(["a0", "a1", "a2", "a3", "a4"].map((id) => carte(d, id).y));
    expect(ys.size).toBe(1);
    expect(chevauchement(d.cartes)).toBe(false);
    // Le parent est centré au-dessus de ses enfants.
    const milieu = (carte(d, "a0").x + carte(d, "a4").x + CARTE_AGENT.largeur) / 2;
    expect(carte(d, "c").x + CARTE_AGENT.largeur / 2).toBeCloseTo(milieu, 5);
    // Une barre horizontale par ligne d'enfants, avec une descente vers chacun des 5 enfants (plus la tige du coordinateur).
    const ligne = d.traits.find((t) => t.id === "ligne:c:0")!;
    expect(ligne.d.match(/V/g)).toHaveLength(5);
    expect(d.traits.some((t) => t.id === "tige:c")).toBe(true);
    expect(d.traits.some((t) => t.id.startsWith("colonne:"))).toBe(false);
  });

  it("arbre à plusieurs niveaux sans chevauchement", () => {
    const agents = [coord(), ...sousCoord(8, "c", "m"), ...Array.from({ length: 8 }, (_, i) => sousCoord(9, `m${i}`, `f${i}-`)).flat()];
    const d = disposerArbreAgents(agents);
    expect(d.cartes).toHaveLength(1 + 8 + 72);
    expect(chevauchement(d.cartes)).toBe(false);
    expect(carte(d, "f3-2").profondeur).toBe(2);
  });

  it("enfants par ligne = largeur disponible / (carte + 16) ; les suivants passent à la ligne d'en dessous, sans chevauchement", () => {
    const agents = [coord(), ...sousCoord(12)];
    const parLigne = (largeur: number) => {
      const d = disposerArbreAgents(agents, new Set(), largeur);
      const lignes = new Map<number, CarteArbre[]>();
      for (const c of d.cartes.filter((k) => k.id.startsWith("a"))) lignes.set(c.y, [...(lignes.get(c.y) ?? []), c]);
      return { d, tailles: [...lignes.entries()].sort((x, y) => x[0] - y[0]).map(([, l]) => l.length) };
    };
    // Largeur utile = largeur - 2 marges (16) ; une carte et son écart de 16 : floor((utile + 16) / 204).
    expect(parLigne(2600).tailles).toEqual([12]);
    expect(parLigne(1100).tailles).toEqual([5, 5, 2]);
    expect(parLigne(700).tailles).toEqual([3, 3, 3, 3]);
    expect(parLigne(100).tailles).toEqual(Array(12).fill(1));
    for (const w of [2600, 1100, 700, 100]) {
      const { d } = parLigne(w);
      expect(chevauchement(d.cartes)).toBe(false);
      // Aucune ligne ne dépasse la largeur disponible (sauf une carte seule plus large que le cadre).
      expect(d.largeur).toBeLessThanOrEqual(Math.max(w, CARTE_AGENT.largeur + 32));
    }
    // Plusieurs lignes : les cartes d'une même colonne sont alignées et une colonne de liaison dans la marge relie les barres.
    const { d } = parLigne(1100);
    expect(carte(d, "a0").x).toBe(carte(d, "a5").x);
    expect(carte(d, "a5").y).toBeGreaterThan(carte(d, "a0").y + CARTE_AGENT.hauteur);
    const colonne = d.traits.find((t) => t.id === "colonne:c")!;
    expect(colonne.x1).toBeLessThan(carte(d, "a0").x);
    expect(d.traits.filter((t) => t.id.startsWith("ligne:c:"))).toHaveLength(3);
    // Les traits restent dans le dessin.
    expect(d.traits.every((t) => t.x0 >= 0 && t.x1 <= d.largeur && t.y1 <= d.hauteur)).toBe(true);
    // Un sous-arbre sous un enfant d'une rangée large reste lui aussi sans chevauchement.
    for (const w of [900, 1500]) {
      const profond = disposerArbreAgents([coord(), ...sousCoord(20), ...sousCoord(15, "a3", "z"), ...sousCoord(3, "a4", "y")], new Set(), w);
      expect(chevauchement(profond.cartes)).toBe(false);
      expect(profond.cartes).toHaveLength(1 + 20 + 15 + 3);
    }
  });

  it(`au-delà de ${ENFANTS_AVANT_GROUPE} enfants, un groupe « +N agents » replie les suivants ; on le déplie par responsable`, () => {
    const agents = [coord(), ...sousCoord(100)];
    const replie = disposerArbreAgents(agents);
    const groupe = replie.cartes.find((c) => c.genre === "groupe") as CarteArbre;
    expect(replie.cartes).toHaveLength(1 + ENFANTS_AVANT_GROUPE + 1);
    expect(groupe.restants).toBe(60);
    expect(groupe.responsable).toBe("c");
    expect(groupe.deplie).toBe(false);
    const deplie = disposerArbreAgents(agents, new Set(["c"]));
    expect(deplie.cartes.filter((c) => c.genre === "agent")).toHaveLength(101);
    expect((deplie.cartes.find((c) => c.genre === "groupe") as CarteArbre).deplie).toBe(true);
    expect(chevauchement(deplie.cartes)).toBe(false);
  });

  it("un cycle de reportsTo ne fait jamais boucler et tous les agents sont dessinés une fois", () => {
    const d = disposerArbreAgents([ag("x", "X", { reportsTo: "y" }), ag("y", "Y", { reportsTo: "z" }), ag("z", "Z", { reportsTo: "x" }), ag("s", "Soi", { reportsTo: "s" })]);
    expect(d.cartes.map((c) => c.id).sort()).toEqual(["s", "x", "y", "z"]);
    expect(chevauchement(d.cartes)).toBe(false);
  });

  it("plusieurs racines : côte à côte, sans trait entre elles", () => {
    const d = disposerArbreAgents([ag("r1", "R1"), ag("r2", "R2"), ag("r3", "R3", { reportsTo: "inconnu" })]);
    expect(d.cartes).toHaveLength(3);
    expect(d.traits).toHaveLength(0);
    expect(chevauchement(d.cartes)).toBe(false);
  });

  it("service sans agent : disposition vide", () => {
    const d = disposerArbreAgents([]);
    expect(d.cartes).toEqual([]);
  });

  it("10 000 agents dans un service : disposition en moins de 150 ms, sans chevauchement", () => {
    const agents = [coord(), ...sousCoord(10000)];
    const t0 = performance.now();
    const d = disposerArbreAgents(agents, new Set(["c"]));
    const duree = performance.now() - t0;
    expect(d.cartes).toHaveLength(10002);
    expect(duree).toBeLessThan(150);
    expect(chevauchement(d.cartes)).toBe(false);
    // Variante équilibrée : 100 responsables de 99 agents.
    const equilibre = [coord(), ...sousCoord(100, "c", "m"), ...Array.from({ length: 100 }, (_, i) => sousCoord(99, `m${i}`, `f${i}-`)).flat()];
    const t1 = performance.now();
    const e = disposerArbreAgents(equilibre, new Set(["c", ...Array.from({ length: 100 }, (_, i) => `m${i}`)]));
    expect(performance.now() - t1).toBeLessThan(150);
    expect(e.cartes.filter((c) => c.genre === "agent")).toHaveLength(10001);
    expect(chevauchement(e.cartes)).toBe(false);
  });

  it("la fenêtre ne garde que les cartes visibles au-delà de 200 cartes, et toujours celle mise en évidence", () => {
    const d = disposerArbreAgents([coord(), ...sousCoord(1000)], new Set(["c"]));
    const v = elementsVisibles(d, { x: 0, y: 0, largeur: 1000, hauteur: 600 });
    expect(v.cartes.length).toBeLessThan(60);
    expect(v.traits.length).toBeLessThan(60);
    expect(elementsVisibles(d, { x: 0, y: 0, largeur: 1000, hauteur: 600 }, 240, "a900").cartes.some((c) => c.id === "a900")).toBe(true);
    const petit = disposerArbreAgents([coord(), ...sousCoord(5)]);
    expect(elementsVisibles(petit, { x: 90000, y: 90000, largeur: 10, hauteur: 10 }).cartes).toHaveLength(6);
  });

  it("ancetresDe : responsables à déplier jusqu'à la racine", () => {
    const agents = [coord(), ag("m", "M", { reportsTo: "c" }), ag("f", "F", { reportsTo: "m" })];
    expect(ancetresDe(agents, "f")).toEqual(["m", "c", "__racines__"]);
    expect(ancetresDe(agents, "introuvable")).toEqual([]);
  });
});

const flux = (source: string, cible: string, objet: string, o: Partial<FluxBrut> = {}): FluxBrut => ({ source, cible, objet, approbationHumaine: false, origine: "metier", ...o });
const SERVICES: ServiceCarte[] = ["marketing", "juridique", "finance", "rh", "it"].map((slug) => ({ slug, nom: slug === "rh" ? "Ressources humaines" : slug[0]!.toUpperCase() + slug.slice(1) }));
const FLUX: FluxBrut[] = [
  flux("marketing", "juridique", "Relecture légale"),
  flux("juridique", "marketing", "Avis sur une mention", { approbationHumaine: true }),
  flux("juridique", "marketing", "Avis sur un visuel"),
  flux("finance", "marketing", "Budget trimestriel"),
  flux("marketing", "rh", "Offre d'emploi; Fiche de poste"),
  flux("marketing", "it", "Accès aux outils", { origine: "coordinateurs" }),
  flux("it", "marketing", "Réseau des coordinateurs", { origine: "coordinateurs" }),
];

describe("disposerSatellites", () => {
  const liaisons = liaisonsDe("marketing", fluxMetier(FLUX));
  const nomDe = (s: string) => SERVICES.find((x) => x.slug === s)?.nom ?? s;
  const dispo = disposerSatellites(liaisons, nomDe);

  it("entrants à gauche, sortants à droite, bidirectionnel du côté du plus fort volume", () => {
    expect(dispo.gauche.map((s) => s.slug).sort()).toEqual(["finance", "juridique"]);
    expect(dispo.droite.map((s) => s.slug)).toEqual(["rh"]);
    const jur = dispo.gauche.find((s) => s.slug === "juridique")!;
    expect(jur.entrants).toBe(2);
    expect(jur.sortants).toBe(1);
    expect(jur.liaison.approbation).toBe(true);
  });

  it("égalité de volumes : à droite si les colonnes sont aussi chargées, sinon dans la moins chargée ; le réseau des coordinateurs n'apparaît jamais", () => {
    const egal = disposerSatellites(liaisonsDe("a", [flux("a", "b", "x"), flux("b", "a", "y")]), (s) => s);
    expect(egal.droite.map((s) => s.slug)).toEqual(["b"]);
    expect([...dispo.gauche, ...dispo.droite].some((s) => s.slug === "it")).toBe(false);
    // 9 partenaires à égalité, plus un entrant franc : répartition équilibrée (5 de chaque côté), pas 9 contre 1.
    const bidirectionnels = Array.from({ length: 9 }, (_, i) => [flux("a", `s${i}`, "x"), flux(`s${i}`, "a", "y")]).flat();
    const eq = disposerSatellites(liaisonsDe("a", [...bidirectionnels, flux("e", "a", "z"), flux("e", "a", "z2")]), (s) => s);
    expect(eq.gauche).toHaveLength(5);
    expect(eq.droite).toHaveLength(5);
    expect(eq.gauche.some((s) => s.slug === "e")).toBe(true);
  });

  it("chaque satellite a la hauteur de son contenu : nom complet sur autant de lignes qu'il en faut, puis le détail", () => {
    const liaisonsLongues = liaisonsDe("a", [flux("a", "court", "x"), flux("a", "long", "x", { approbationHumaine: true }), flux("a", "treslong", "x")]);
    const noms: Record<string, string> = { court: "Achats", long: "Comptabilité et finance du groupe", treslong: "Hygiène, sécurité, environnement et bien-être au travail" };
    const sats = disposerSatellites(liaisonsLongues, (s) => noms[s] ?? s).droite;
    const h = (slug: string) => sats.find((s) => s.slug === slug)!.hauteur;
    expect(h("court")).toBe(SATELLITE.hauteur);
    expect(h("long")).toBeGreaterThanOrEqual(SATELLITE.hauteur + SATELLITE.ligne);
    expect(h("treslong")).toBeGreaterThan(h("long"));
    // Pas de superposition, et le contenu de la colonne loge tous les satellites.
    const tries = [...sats].sort((x, y) => x.y - y.y);
    tries.forEach((s, i) => {
      if (i > 0) expect(s.y - s.hauteur / 2).toBeGreaterThanOrEqual(tries[i - 1]!.y + tries[i - 1]!.hauteur / 2);
    });
    const dispo2 = disposerSatellites(liaisonsLongues, (s) => noms[s] ?? s);
    expect(Math.max(...sats.map((s) => s.y + s.hauteur / 2))).toBeLessThanOrEqual(dispo2.contenuDroite);
  });

  it(`au-delà de ${SATELLITES_VISIBLES_MAX} satellites dans une colonne, la colonne défile : contenu plus haut que la figure, satellites contigus`, () => {
    const lia = (n: number) => liaisonsDe("a", Array.from({ length: n }, (_, i) => flux("a", `s${i}`, "x")));
    const sept = disposerSatellites(lia(SATELLITES_VISIBLES_MAX), (s) => s);
    expect(sept.contenuDroite).toBe(sept.hauteur);
    const beaucoup = disposerSatellites(lia(30), (s) => s);
    const pas = SATELLITE.hauteur + SATELLITE.ecart;
    expect(beaucoup.contenuDroite).toBeGreaterThanOrEqual(30 * pas - SATELLITE.ecart);
    expect(beaucoup.hauteur).toBeLessThan(beaucoup.contenuDroite);
    expect(beaucoup.hauteur).toBeLessThanOrEqual(SATELLITES_VISIBLES_MAX * pas);
    const ys = beaucoup.droite.map((s) => s.y);
    expect(ys.every((y, i) => i === 0 || y - (ys[i - 1] as number) >= SATELLITE.hauteur)).toBe(true);
    // Colonne qui tient : répartie sur toute la hauteur réclamée par l'arbre.
    const haute = disposerSatellites(lia(2), (s) => s, 640);
    expect(haute.hauteur).toBe(640);
    expect(haute.droite[1]!.y).toBeGreaterThan(400);
    expect(disposerSatellites([], (s) => s).hauteur).toBe(HAUTEUR_MIN_FIGURE);
  });

  it("épaisseur du trait croissante et bornée", () => {
    expect(epaisseurPourVolume(1)).toBe(1);
    expect(epaisseurPourVolume(4)).toBeGreaterThan(epaisseurPourVolume(2));
    expect(epaisseurPourVolume(100000)).toBe(5);
  });
});

let rendu: Rendu | null = null;
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const service = { slug: "marketing", nom: "Marketing", companyId: "co-1", prefixe: "RNO" };

/** Transformation courante du plan (`translate(Xpx, Ypx) scale(E)`). */
function lireTransformation(plan: HTMLElement): { x: number; y: number; echelle: number } {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(plan.style.transform);
  if (!m) throw new Error(`transformation absente : « ${plan.style.transform} »`);
  return { x: Number(m[1]), y: Number(m[2]), echelle: Number(m[3]) };
}
const AGENTS = [
  coord("m1"),
  ag("m2", "Rédaction", { reportsTo: "m1", title: "Responsable contenus" }),
  ag("m3", "Veille", { reportsTo: "m1", status: "paused" }),
  ag("m4", "Visuels", { reportsTo: "m2", status: "error" }),
];

async function monter(o: Partial<Parameters<typeof VueServiceOrganigramme>[0]> = {}) {
  const pont = installerPont();
  const ouvrirService = vi.fn();
  const retour = vi.fn();
  rendu = await rendre(createElement(VueServiceOrganigramme, { service, agents: AGENTS, flux: FLUX, services: SERVICES, ouvrirService, retour, ...o }));
  return { pont, ouvrirService, retour, c: rendu.conteneur };
}

describe("VueServiceOrganigramme", () => {
  it("en-tête : fil « Organigramme › Service », nombre d'agents et résumé des états", async () => {
    const { c, retour } = await monter();
    const fil = c.querySelector("nav")!;
    expect(fil.textContent).toContain("Organigramme");
    expect(fil.textContent).toContain("Marketing");
    expect(c.querySelector(".atl-orgs-resume")!.textContent).toMatch(/4 agents/);
    expect(c.querySelector(".atl-orgs-resume")!.textContent).toMatch(/2 actifs/);
    expect(c.querySelector(".atl-orgs-resume")!.textContent).toMatch(/1 en pause/);
    expect(c.querySelector(".atl-orgs-resume")!.textContent).toMatch(/1 en erreur/);
    await cliquer(c.querySelector(".atl-orgs-retour")!);
    expect(retour).toHaveBeenCalledTimes(1);
  });

  it("cartes : lien vers la fiche, titre court et état en texte ; traits SVG fins", async () => {
    const { c } = await monter();
    const carteM2 = c.querySelector('[data-agent="m2"]')!;
    const lien = carteM2.querySelector("a")!;
    expect(lien.getAttribute("href")).toContain("/RNO/agents/m2");
    expect(lien.textContent).toBe("Rédaction");
    expect(carteM2.textContent).toContain("Responsable contenus");
    expect(carteM2.textContent).toContain("actif");
    expect(c.querySelector('[data-agent="m4"]')!.textContent).toContain("en erreur");
    expect(c.querySelector('[data-agent="m1"]')!.textContent).toContain("Coordinateur");
    expect(c.querySelectorAll(".atl-orgs-traits path").length).toBeGreaterThanOrEqual(3);
  });

  it("satellites : entrants à gauche, sortants à droite, flèches pleines et pointillées, partenaire cliquable", async () => {
    const { c, ouvrirService } = await monter();
    const gauche = Array.from(c.querySelectorAll('.atl-orgs-satellite[data-cote="gauche"]')).map((e) => e.querySelector(".atl-orgs-satellite-nom")!.textContent);
    expect(gauche.sort()).toEqual(["Finance", "Juridique"]);
    const droite = Array.from(c.querySelectorAll('.atl-orgs-satellite[data-cote="droite"]')).map((e) => e.querySelector(".atl-orgs-satellite-nom")!.textContent);
    expect(droite).toEqual(["Ressources humaines"]);
    expect(c.querySelectorAll('.atl-orgs-fleche[data-sens="sortant"]').length).toBeGreaterThanOrEqual(2);
    expect(c.querySelectorAll('.atl-orgs-fleche[data-sens="entrant"]').length).toBeGreaterThanOrEqual(2);
    expect(c.textContent).not.toContain("Réseau des coordinateurs");
    const jur = Array.from(c.querySelectorAll<HTMLElement>(".atl-orgs-satellite")).find((e) => e.textContent!.includes("Juridique"))!;
    expect(jur.textContent).toContain("approbation");
    expect(jur.textContent).toContain("3 échanges");
    await cliquer(jur);
    expect(ouvrirService).toHaveBeenCalledWith("juridique");
    // La largeur de gouttière sert aux deux côtés.
    expect(c.querySelector(".atl-orgs-gouttiere")!.getAttribute("width")).toBe(String(GOUTTIERE));
  });

  it("panneau des échanges : objets et sens groupés par partenaire, mention d'approbation", async () => {
    const { c, ouvrirService } = await monter();
    const panneau = c.querySelector(".atl-orgs-panneau")!;
    const jur = panneau.querySelector('[aria-label="Échanges avec Juridique"]')!;
    expect(jur.textContent).toContain("Vers Juridique");
    expect(jur.textContent).toContain("Relecture légale");
    expect(jur.textContent).toContain("Depuis Juridique");
    expect(jur.textContent).toContain("Avis sur une mention (approbation humaine)");
    expect(jur.textContent).toContain("Avis sur un visuel");
    expect(panneau.querySelector('[aria-label="Échanges avec Ressources humaines"]')!.textContent).toContain("Fiche de poste");
    await cliquer(jur.querySelector("button")!);
    expect(ouvrirService).toHaveBeenCalledWith("juridique");
  });

  it("service sans liaison métier ni agent : messages clairs", async () => {
    const { c } = await monter({ agents: [], flux: [flux("marketing", "it", "x", { origine: "coordinateurs" })] });
    expect(c.textContent).toContain("Ce service n'a aucun agent.");
    expect(c.textContent).toContain("n'a pas d'échange métier");
    expect(c.querySelector(".atl-orgs-satellite")).toBeNull();
  });

  it("agent mis en évidence : carte surlignée (même caché dans un groupe) et amenée dans la vue", async () => {
    const { c } = await monter({ agentMisEnEvidence: "m4" });
    expect(c.querySelector('[data-agent="m4"]')!.getAttribute("data-mis-en-evidence")).toBe("true");
    expect(c.querySelectorAll("[data-mis-en-evidence]")).toHaveLength(1);

    const agents = [coord("c"), ...sousCoord(500)];
    const r2 = await rendre(createElement(VueServiceOrganigramme, { service, agents, flux: [], services: SERVICES, ouvrirService: vi.fn(), retour: vi.fn(), agentMisEnEvidence: "a450" }));
    try {
      expect(r2.conteneur.querySelector('[data-agent="a450"]')?.getAttribute("data-mis-en-evidence")).toBe("true");
      // La toile s'est déplacée vers la carte (plus de défilement natif) : le plan est translaté très haut.
      expect(lireTransformation(r2.conteneur.querySelector<HTMLElement>(".atl-orgs-plan")!).y).toBeLessThan(-1000);
    } finally {
      r2.demonter();
    }
  });

  it("10 000 agents : seules les cartes visibles sont rendues ; le groupe se déplie au clic", async () => {
    const agents = [coord("c"), ...sousCoord(10000)];
    const { c } = await monter({ agents });
    const avant = c.querySelectorAll(".atl-orgs-carte").length;
    expect(avant).toBe(ENFANTS_AVANT_GROUPE + 2);
    const groupe = c.querySelector<HTMLElement>(".atl-orgs-groupe")!;
    expect(groupe.textContent).toContain("+9");
    await cliquer(groupe);
    const apres = c.querySelectorAll(".atl-orgs-carte").length;
    expect(CARTES_AVANT_VIRTUALISATION).toBeLessThan(10001);
    expect(apres).toBeLessThan(120);
    expect(c.querySelector(".atl-orgs-plan")!.getAttribute("style")).toMatch(/height: \d{6,}px/);
  });

  it("téléphone : liste indentée des agents et des partenaires, pas de dessin", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));
    const { c, ouvrirService } = await monter({ agentMisEnEvidence: "m4" });
    expect(c.querySelector("svg")).toBeNull();
    expect(c.querySelector(".atl-orgs-figure")).toBeNull();
    const lignes = Array.from(c.querySelectorAll<HTMLElement>(".atl-orgs-ligne"));
    expect(lignes).toHaveLength(4);
    const retrait = (id: string) => parseFloat(lignes.find((l) => l.getAttribute("data-agent") === id)!.style.paddingLeft);
    expect(retrait("m4")).toBeGreaterThan(retrait("m2"));
    expect(retrait("m2")).toBeGreaterThan(retrait("m1"));
    expect(lignes.find((l) => l.getAttribute("data-agent") === "m4")!.hasAttribute("data-mis-en-evidence")).toBe(true);
    const part = Array.from(c.querySelectorAll<HTMLElement>(".atl-orgs-satellite-ligne")).find((e) => e.textContent!.includes("Ressources humaines"))!;
    await cliquer(part);
    expect(ouvrirService).toHaveBeenCalledWith("rh");
  });

  it("téléphone, 10 000 agents : liste paginée", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));
    const { c } = await monter({ agents: [coord("c"), ...sousCoord(300)] });
    expect(c.querySelectorAll(".atl-orgs-ligne").length).toBe(ENFANTS_AVANT_GROUPE + 2);
    await cliquer(c.querySelector(".atl-orgs-groupe-ligne")!);
    expect(c.querySelectorAll(".atl-orgs-ligne").length).toBe(200);
    const plus = Array.from(c.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent!.includes("de plus"))!;
    await cliquer(plus);
    expect(c.querySelectorAll(".atl-orgs-ligne").length).toBe(302);
  });
});

describe("toile : transformation (pure)", () => {
  it("ajuste le dessin en haut au centre, jamais agrandi ni réduit sous le plancher", () => {
    const grand = { largeur: 4000, hauteur: 2000 };
    const sansPlancher = transformationAjustee(grand, 1000, 600);
    expect(sansPlancher.echelle).toBeCloseTo(0.25, 5);
    const ouverture = transformationAjustee(grand, 1000, 600, ECHELLE_OUVERTURE_MIN);
    expect(ouverture.echelle).toBe(ECHELLE_OUVERTURE_MIN);
    expect(ouverture.y).toBe(0);
    expect(transformationAjustee({ largeur: 300, hauteur: 200 }, 1000, 600).echelle).toBe(1);
    // Centré en largeur quand il tient.
    expect(transformationAjustee({ largeur: 300, hauteur: 200 }, 1000, 600).x).toBe(350);
  });

  it("zoomer autour d'un point garde ce point fixe ; l'échelle est bornée", () => {
    const t = zoomerAutour({ echelle: 1, x: 10, y: 20 }, 2, 300, 200);
    expect(t.echelle).toBe(2);
    expect(t.x).toBe(300 - (300 - 10) * 2);
    expect(zoomerAutour({ echelle: 1, x: 0, y: 0 }, 1000, 0, 0).echelle).toBe(ECHELLE_MAX);
    expect(zoomerAutour({ echelle: 1, x: 0, y: 0 }, 0.0001, 0, 0).echelle).toBe(ECHELLE_MIN);
  });

  it("centrer une carte la met au milieu de la vue ; la fenêtre visible suit le zoom", () => {
    const c = { x: 1000, y: 3000, largeur: 188, hauteur: 60 };
    const t = transformationCentree(c, 800, 600, 0.8, 1);
    expect(1000 + 94).toBeCloseTo((400 - t.x) / t.echelle, 5);
    const f = fenetreVisible({ echelle: 0.5, x: -100, y: -200 }, 800, 600);
    expect(f).toEqual({ x: 200, y: 400, largeur: 1600, hauteur: 1200 });
  });
});

describe("toile : zoom, ajustement et gestes", () => {
  const plan = (c: HTMLElement) => c.querySelector<HTMLElement>(".atl-orgs-plan")!;
  const vue = (c: HTMLElement) => c.querySelector<HTMLElement>(".atl-orgs-vue")!;
  const bouton = (c: HTMLElement, nom: string) => c.querySelector<HTMLElement>(`button[aria-label="${nom}"]`)!;
  const touche = async (el: HTMLElement, key: string) => {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  };
  const pointeur = async (el: HTMLElement, type: string, x: number, y: number) => {
    await act(async () => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.assign(e, { pointerId: 1, pointerType: "touch" });
      el.dispatchEvent(e);
    });
  };

  it("s'ouvre ajustée, avec les boutons « + », « − » et « Ajuster » dans le dessin et la légende sous le dessin", async () => {
    const { c } = await monter();
    expect(lireTransformation(plan(c)).echelle).toBe(1);
    expect(c.querySelector(".atl-orgs-bloc .atl-orgs-zoom")).not.toBeNull();
    // La légende est sous le dessin, jamais en surimpression sur les cartes d'agents.
    expect(c.querySelector(".atl-orgs-legende")).not.toBeNull();
    expect(c.querySelector(".atl-orgs-bloc .atl-orgs-legende")).toBeNull();
    const legende = c.querySelector(".atl-orgs-legende")!.textContent!;
    expect(legende).toContain("trait plein");
    expect(legende).toContain("trait pointillé");
    expect(legende).toContain("approbation");
    expect(vue(c).getAttribute("role")).toBe("group");
    expect(vue(c).tabIndex).toBe(0);
    expect(vue(c).getAttribute("aria-label")).toMatch(/zoomer/);
  });

  it("les boutons zooment et « Ajuster » revient à l'ajustement", async () => {
    const { c } = await monter();
    await cliquer(bouton(c, "Zoom avant"));
    expect(lireTransformation(plan(c)).echelle).toBeCloseTo(1.25, 5);
    await cliquer(bouton(c, "Zoom arrière"));
    await cliquer(bouton(c, "Zoom arrière"));
    expect(lireTransformation(plan(c)).echelle).toBeCloseTo(0.8, 5);
    await cliquer(bouton(c, "Ajuster à l'écran"));
    expect(lireTransformation(plan(c)).echelle).toBe(1);
  });

  it("clavier : + et − zooment, 0 ajuste, les flèches déplacent (seulement quand la toile a le focus)", async () => {
    const { c } = await monter();
    await touche(vue(c), "+");
    expect(lireTransformation(plan(c)).echelle).toBeCloseTo(1.25, 5);
    await touche(vue(c), "-");
    expect(lireTransformation(plan(c)).echelle).toBeCloseTo(1, 5);
    const avant = lireTransformation(plan(c));
    await touche(vue(c), "ArrowLeft");
    expect(lireTransformation(plan(c)).x).toBe(avant.x + 80);
    await touche(vue(c), "ArrowDown");
    expect(lireTransformation(plan(c)).y).toBe(avant.y - 80);
    await touche(vue(c), "+");
    await touche(vue(c), "0");
    expect(lireTransformation(plan(c)).echelle).toBe(1);
    // Une touche venue d'un lien de carte ne déplace pas la toile.
    const lien = c.querySelector<HTMLElement>('[data-agent="m2"] a')!;
    const t0 = lireTransformation(plan(c));
    await touche(lien, "+");
    expect(lireTransformation(plan(c))).toEqual(t0);
  });

  it("Ctrl + molette zoome autour du pointeur ; la molette seule laisse défiler la page", async () => {
    const { c } = await monter();
    const molette = async (ctrl: boolean, deltaY: number) => {
      const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: ctrl, deltaY });
      await act(async () => {
        vue(c).dispatchEvent(e);
      });
      return e;
    };
    const sans = await molette(false, -200);
    expect(sans.defaultPrevented).toBe(false);
    expect(lireTransformation(plan(c)).echelle).toBe(1);
    const avec = await molette(true, -200);
    expect(avec.defaultPrevented).toBe(true);
    expect(lireTransformation(plan(c)).echelle).toBeGreaterThan(1);
    await molette(true, 2000);
    expect(lireTransformation(plan(c)).echelle).toBeGreaterThanOrEqual(ECHELLE_MIN);
  });

  it("glisser déplace le dessin, et le clic qui suit un glissement n'ouvre pas la fiche d'un agent", async () => {
    const { c, pont } = await monter();
    const avant = lireTransformation(plan(c));
    const lien = c.querySelector<HTMLElement>('[data-agent="m2"] a')!;
    await pointeur(lien, "pointerdown", 100, 100);
    await pointeur(lien, "pointermove", 160, 130);
    await pointeur(lien, "pointerup", 160, 130);
    const apres = lireTransformation(plan(c));
    expect(apres.x).toBe(avant.x + 60);
    expect(apres.y).toBe(avant.y + 30);
    const clicApresGlissement = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      lien.dispatchEvent(clicApresGlissement);
    });
    expect(clicApresGlissement.defaultPrevented).toBe(true);
    expect(pont.navigations).toEqual([]);
    // Un simple clic (sans glissement) reste un clic : il n'est pas supprimé.
    await pointeur(lien, "pointerdown", 100, 100);
    await pointeur(lien, "pointerup", 101, 100);
    const clicNormal = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    await act(async () => {
      lien.dispatchEvent(clicNormal);
    });
    expect(lireTransformation(plan(c)).x).toBe(apres.x);
    expect(pont.navigations).toEqual(["/RNO/agents/m2"]);
  });

  it("pincement : deux doigts qui s'écartent zooment", async () => {
    const { c } = await monter();
    const doigt = async (id: number, type: string, x: number, y: number) =>
      act(async () => {
        const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
        Object.assign(e, { pointerId: id, pointerType: "touch" });
        vue(c).dispatchEvent(e);
      });
    await doigt(1, "pointerdown", 200, 200);
    await doigt(2, "pointerdown", 300, 200);
    await doigt(2, "pointermove", 400, 200);
    expect(lireTransformation(plan(c)).echelle).toBeCloseTo(2, 5);
    await doigt(1, "pointerup", 200, 200);
    await doigt(2, "pointerup", 400, 200);
  });

  it("le nombre d'enfants par ligne suit la largeur mesurée du cadre (ResizeObserver) et la figure a la hauteur de l'arbre", async () => {
    const rappels: Array<() => void> = [];
    class ObservateurFactice {
      constructor(cb: () => void) {
        rappels.push(cb);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    let largeur = 2600;
    const descripteur = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("atl-orgs-vue") ? largeur : 0;
      },
    });
    vi.stubGlobal("ResizeObserver", ObservateurFactice);
    try {
      const agents = [coord("c"), ...sousCoord(12)];
      const { c } = await monter({ agents, flux: [] });
      const lignes = () => new Set(Array.from(c.querySelectorAll<HTMLElement>('[data-agent^="a"]')).map((e) => e.style.top)).size;
      expect(lignes()).toBe(1);
      const hauteurPleine = parseFloat(c.querySelector<HTMLElement>(".atl-orgs-figure")!.style.height);
      expect(hauteurPleine).toBe(HAUTEUR_MIN_FIGURE);
      largeur = 700;
      await act(async () => {
        rappels.forEach((cb) => cb());
      });
      expect(lignes()).toBe(4);
      // Le dessin plus haut agrandit la figure, jusqu'au plafond.
      const hauteurEtroite = parseFloat(c.querySelector<HTMLElement>(".atl-orgs-figure")!.style.height);
      expect(hauteurEtroite).toBeGreaterThan(hauteurPleine);
      expect(hauteurEtroite).toBeLessThanOrEqual(640);
      // Le plan rend la hauteur du dessin et la toile a été réajustée à la nouvelle largeur (rien n'est coupé à droite).
      expect(parseFloat(plan(c).style.width)).toBeLessThanOrEqual(700);
    } finally {
      if (descripteur) Object.defineProperty(HTMLElement.prototype, "clientWidth", descripteur);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)["clientWidth"];
    }
  });

  it("virtualisation au-delà de 200 cartes : la fenêtre suit la toile (le zoom arrière montre plus de cartes)", async () => {
    const responsables = sousCoord(30, "c", "m");
    const agents = [coord("c"), ...responsables, ...responsables.flatMap((r) => sousCoord(10, r.id, `${r.id}-`))];
    expect(agents).toHaveLength(331);
    const { c } = await monter({ agents });
    const avant = c.querySelectorAll(".atl-orgs-carte").length;
    expect(avant).toBeLessThan(331);
    expect(avant).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) await cliquer(bouton(c, "Zoom arrière"));
    const loin = c.querySelectorAll(".atl-orgs-carte").length;
    expect(loin).toBeGreaterThan(avant);
    expect(loin).toBeLessThanOrEqual(331);
    // Déplacer le dessin au clavier change la fenêtre : les cartes rendues suivent.
    const ids = () => Array.from(c.querySelectorAll<HTMLElement>(".atl-orgs-carte")).map((e) => e.dataset["agent"]).join(",");
    const avantDeplacement = ids();
    for (let i = 0; i < 8; i++) await touche(vue(c), "ArrowDown");
    expect(ids()).not.toBe(avantDeplacement);
  });
});

describe("vue d'un service : satellites, titres et cibles", () => {
  it("satellite sur deux lignes (nom complet, puis « N échanges · approbation »), jamais rogné, sans nombre sur les flèches", async () => {
    const { c } = await monter({
      services: [...SERVICES, { slug: "compta", nom: "Comptabilité et finance du groupe" }],
      flux: [...FLUX, flux("marketing", "compta", "Facture", { approbationHumaine: true })],
    });
    const compta = Array.from(c.querySelectorAll<HTMLElement>(".atl-orgs-satellite")).find((e) => e.textContent!.includes("Comptabilité"))!;
    expect(compta.querySelector(".atl-orgs-satellite-nom")!.textContent).toBe("Comptabilité et finance du groupe");
    expect(compta.querySelector(".atl-orgs-satellite-detail")!.textContent).toBe("1 échange · approbation");
    expect(compta.children).toHaveLength(2);
    // Hauteur donnée = minimum, jamais plafond : le contenu peut grandir sans être coupé.
    expect(parseFloat(compta.style.minHeight)).toBeGreaterThanOrEqual(SATELLITE.hauteur + SATELLITE.ligne);
    expect(compta.style.height).toBe("");
    expect(c.querySelector(".atl-orgs-fleche-nombre")).toBeNull();
    expect(c.querySelectorAll(".atl-orgs-fleche text")).toHaveLength(0);
    const css = STYLES_ORGANIGRAMME_SERVICE;
    expect(css).not.toMatch(/\.atl-orgs-satellite-nom \{[^}]*(overflow: hidden|text-overflow|nowrap)/);
  });

  it("hiérarchie des titres : h2 pour le service, h3 pour ses sections", async () => {
    const { c } = await monter();
    expect(c.querySelector("h2")!.textContent).toBe("Marketing");
    expect(c.querySelector("h3")!.textContent).toBe("Échanges avec les autres services");
    expect(c.querySelector("h4")).not.toBeNull();
    expect(c.querySelectorAll("h1")).toHaveLength(0);
  });

  it("colonne de plus de 7 satellites : elle défile (région au clavier) avec ses flèches ; sinon pas de défilement", async () => {
    const services = Array.from({ length: 12 }, (_, i) => ({ slug: `s${i}`, nom: `Service ${i}` }));
    const fl = services.map((s) => flux("marketing", s.slug, "x"));
    const { c } = await monter({ services: [...SERVICES, ...services], flux: fl });
    const flanc = c.querySelector<HTMLElement>(".atl-orgs-flanc")!;
    expect(flanc.hasAttribute("data-defile")).toBe(true);
    expect(flanc.tabIndex).toBe(0);
    expect(flanc.getAttribute("role")).toBe("region");
    expect(c.querySelectorAll(".atl-orgs-satellite")).toHaveLength(12);
    const contenu = c.querySelector<HTMLElement>(".atl-orgs-flanc-contenu")!;
    expect(parseFloat(contenu.style.height)).toBeGreaterThan(parseFloat(flanc.style.height));
    expect(c.querySelector(".atl-orgs-gouttiere")!.getAttribute("height")).toBe(String(parseFloat(contenu.style.height)));
    const court = await rendre(createElement(VueServiceOrganigramme, { service, agents: AGENTS, flux: FLUX, services: SERVICES, ouvrirService: vi.fn(), retour: vi.fn() }));
    try {
      expect(court.conteneur.querySelector(".atl-orgs-flanc[data-defile]")).toBeNull();
    } finally {
      court.demonter();
    }
  });

  it("cibles : 24 px au moins sur bureau, 44 px sur téléphone", () => {
    const css = STYLES_ORGANIGRAMME_SERVICE;
    const hors = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
    const media = css.slice(css.indexOf("@media (max-width: 640px)"), css.indexOf("@media (prefers-reduced-motion"));
    const rem = (source: string, selecteur: string, propriete: string): number => {
      const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`(?<![\\w.-])${echappe} \\{[^}]*?${propriete}: ([\\d.]+)rem`).exec(source);
      if (!m) throw new Error(`${selecteur} ${propriete} introuvable`);
      return Number(m[1]);
    };
    expect(rem(hors, ".atl-orgs-lien", "min-height") * 16).toBeGreaterThanOrEqual(24);
    expect(rem(hors, ".atl-orgs-lien-service", "min-height") * 16).toBeGreaterThanOrEqual(24);
    expect(rem(hors, ".atl-orgs-retour", "min-height") * 16).toBeGreaterThanOrEqual(24);
    expect(rem(hors, ".atl-orgs-zoom-bouton", "min-height") * 16).toBeGreaterThanOrEqual(24);
    expect(rem(media, ".atl-orgs-lien-service", "min-height") * 16).toBeGreaterThanOrEqual(44);
    expect(rem(media, ".atl-orgs-retour", "min-height") * 16).toBeGreaterThanOrEqual(44);
    expect(rem(hors, ".atl-orgs-ligne .atl-orgs-lien", "min-height") * 16).toBeGreaterThanOrEqual(44);
    expect(rem(hors, ".atl-orgs-satellite-ligne", "min-height") * 16).toBeGreaterThanOrEqual(44);
    expect(rem(hors, ".atl-orgs-groupe-ligne", "min-height") * 16).toBeGreaterThanOrEqual(44);
    expect(css).not.toMatch(/gradient|box-shadow|—/);
  });
});
