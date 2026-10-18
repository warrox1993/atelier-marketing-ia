// @vitest-environment jsdom
/**
 * Vue d'un service de l'organigramme : disposition pure de l'arbre (aucun chevauchement, colonne au-delà de 12 enfants,
 * groupe « +N agents » au-delà de 40, 10 000 agents en moins de 150 ms), satellites (côtés, flèches pleines et pointillées),
 * rendu jsdom (en-tête, liens, surbrillance, virtualisation, clic sur un partenaire, téléphone).
 */
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentHote } from "../../src/ui/organigramme-arbre.js";
import type { FluxBrut, ServiceCarte } from "../../src/ui/organigramme-flux.js";
import { liaisonsDe, fluxMetier } from "../../src/ui/organigramme-flux.js";
import {
  CARTE_AGENT, CARTES_AVANT_VIRTUALISATION, ENFANTS_AVANT_GROUPE, ENFANTS_EN_RANGEE_MAX, GOUTTIERE, SATELLITE,
  ancetresDe, disposerArbreAgents, disposerSatellites, elementsVisibles, epaisseurPourVolume, VueServiceOrganigramme,
  type CarteArbre, type DispositionArbre,
} from "../../src/ui/organigramme-service.js";
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
    expect(d.traits.length).toBeGreaterThanOrEqual(5);
  });

  it("arbre à plusieurs niveaux sans chevauchement", () => {
    const agents = [coord(), ...sousCoord(8, "c", "m"), ...Array.from({ length: 8 }, (_, i) => sousCoord(9, `m${i}`, `f${i}-`)).flat()];
    const d = disposerArbreAgents(agents);
    expect(d.cartes).toHaveLength(1 + 8 + 72);
    expect(chevauchement(d.cartes)).toBe(false);
    expect(carte(d, "f3-2").profondeur).toBe(2);
  });

  it(`au-delà de ${ENFANTS_EN_RANGEE_MAX} enfants directs, les enfants passent en colonne empilée`, () => {
    const d = disposerArbreAgents([coord(), ...sousCoord(ENFANTS_EN_RANGEE_MAX)]);
    expect(new Set(d.cartes.filter((c) => c.id.startsWith("a")).map((c) => c.y)).size).toBe(1);
    const e = disposerArbreAgents([coord(), ...sousCoord(ENFANTS_EN_RANGEE_MAX + 1)]);
    const enfants = e.cartes.filter((c) => c.id.startsWith("a"));
    expect(new Set(enfants.map((c) => c.x)).size).toBe(1);
    expect(new Set(enfants.map((c) => c.y)).size).toBe(enfants.length);
    expect(enfants.every((c) => c.x > carte(e, "c").x)).toBe(true);
    expect(chevauchement(e.cartes)).toBe(false);
    // Un sous-arbre sous un enfant empilé reste lui aussi sans chevauchement.
    const profond = disposerArbreAgents([coord(), ...sousCoord(20), ...sousCoord(15, "a3", "z"), ...sousCoord(3, "a4", "y")]);
    expect(chevauchement(profond.cartes)).toBe(false);
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

  it("égalité de volumes : à droite ; le réseau des coordinateurs n'apparaît jamais", () => {
    const egal = disposerSatellites(liaisonsDe("a", [flux("a", "b", "x"), flux("b", "a", "y")]), (s) => s);
    expect(egal.droite.map((s) => s.slug)).toEqual(["b"]);
    expect([...dispo.gauche, ...dispo.droite].some((s) => s.slug === "it")).toBe(false);
  });

  it("répartit les satellites sur toute la hauteur sans les superposer", () => {
    const beaucoup = disposerSatellites(liaisonsDe("a", Array.from({ length: 30 }, (_, i) => flux("a", `s${i}`, "x"))), (s) => s);
    expect(beaucoup.hauteur).toBeGreaterThanOrEqual(30 * (SATELLITE.hauteur + SATELLITE.ecart));
    const ys = beaucoup.droite.map((s) => s.y);
    expect(ys.every((y, i) => i === 0 || y - (ys[i - 1] as number) >= SATELLITE.hauteur)).toBe(true);
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
      const defilant = r2.conteneur.querySelector<HTMLElement>(".atl-orgs-defilant")!;
      expect(defilant.scrollTop).toBeGreaterThan(1000);
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
