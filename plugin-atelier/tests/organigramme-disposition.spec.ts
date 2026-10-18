/**
 * Disposition pure de l'organigramme dessiné : pas de chevauchement, chaque agent une seule fois, chaque coordinateur
 * relié au général, cycle de reportsTo sans boucle, traits orthogonaux, filtre, transformations de la vue.
 */
import { describe, expect, it } from "vitest";
import type { AgentHote } from "../src/ui/organigramme-arbre.js";
import {
  cartesCorrespondantes, DIMENSIONS, disposerOrganigramme, ECHELLE_MAX, ECHELLE_MIN, ECHELLE_OUVERTURE, FORMAT_CIBLE, premiereCorrespondance, transformationAjustee, transformationCentree, transformationOuverture, zoomerAutour,
  type CarteDisposee, type ServiceADisposer,
} from "../src/ui/organigramme-disposition.js";

const agent = (id: string, name: string, o: Partial<AgentHote> = {}): AgentHote => ({ id, name, role: "general", title: null, status: "idle", reportsTo: null, adapterType: "claude_local", ...o });
const service = (slug: string, agents: AgentHote[], o: Partial<ServiceADisposer> = {}): ServiceADisposer => ({ slug, nom: slug[0]!.toUpperCase() + slug.slice(1), estDirection: false, etat: "pret", agents, ...o });

/** 28 services comme en réel : Direction + 27, 218 agents au total, chaînes reportsTo de profondeur variable. */
function grandJeu(): ServiceADisposer[] {
  const services: ServiceADisposer[] = [];
  let n = 0;
  for (let i = 0; i < 28; i += 1) {
    const slug = i === 0 ? "direction" : `service${i}`;
    const nb = i < 22 ? 8 : i === 22 ? 7 : 6; // 22*8 + 7 + 5*6 = 213 ; +5 sur la Direction
    const taille = i === 0 ? nb + 5 : nb;
    const agents: AgentHote[] = [agent(`${slug}-c`, `Coordinateur ${slug}`, { role: "ceo" })];
    for (let k = 1; k < taille; k += 1) {
      n += 1;
      agents.push(agent(`${slug}-${k}`, `Agent ${n}`, { reportsTo: k % 3 === 0 && k > 2 ? `${slug}-${k - 1}` : `${slug}-c` }));
    }
    services.push(service(slug, agents, { estDirection: i === 0 }));
  }
  return services;
}

const chevauche = (a: CarteDisposee, b: CarteDisposee) => a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;

describe("disposerOrganigramme", () => {
  const services = grandJeu();
  const total = services.reduce((n, s) => n + s.agents.length, 0);
  const dispo = disposerOrganigramme(services);

  it("le jeu de test a bien 28 services et au moins 200 agents", () => {
    expect(services).toHaveLength(28);
    expect(total).toBeGreaterThanOrEqual(200);
  });

  it("aucune carte ne chevauche une autre", () => {
    const c = dispo.cartes;
    let chevauchements = 0;
    for (let i = 0; i < c.length; i += 1) for (let j = i + 1; j < c.length; j += 1) if (chevauche(c[i]!, c[j]!)) chevauchements += 1;
    expect(chevauchements).toBe(0);
  });

  it("chaque agent apparaît une seule fois (le coordinateur de service porte la carte du service, la Direction celle du général)", () => {
    const portes = dispo.cartes.filter((k) => k.genre === "agent").map((k) => k.agent!.id);
    expect(new Set(portes).size).toBe(portes.length);
    const coordinateurs = dispo.cartes.filter((k) => k.genre === "service").map((k) => k.coordinateur?.id);
    expect(coordinateurs).toHaveLength(28);
    const tous = [...portes, ...coordinateurs, dispo.cartes.find((k) => k.genre === "general")!.agent!.id];
    // La Direction compte son coordinateur deux fois (général et carte de service) : on le retire une fois.
    expect(tous.length - 1).toBe(total);
    expect(new Set(tous).size).toBe(total);
  });

  it("chaque cadre est relié au général par un trait vertical qui part du bus de sa rangée et s'arrête sur son bord haut", () => {
    expect(dispo.cadres).toHaveLength(28);
    for (const cadre of dispo.cadres) {
      const trait = dispo.segments.find((g) => g.vers === `service:${cadre.slug}` && g.de === "general");
      expect(trait, cadre.id).toBeDefined();
      expect(trait!.x1).toBe(trait!.x2);
      expect(trait!.x1).toBe(cadre.x + cadre.largeur / 2);
      expect(trait!.y2).toBe(cadre.y);
      // Le bus est dans l'espace libre au-dessus de la rangée.
      expect(trait!.y1).toBe(cadre.y - DIMENSIONS.hauteurBarre / 2);
    }
    const general = dispo.cartes.find((k) => k.genre === "general")!;
    expect(dispo.segments.some((g) => g.x1 === g.x2 && g.y1 === general.y + general.hauteur)).toBe(true);
  });

  it("les services sont rangés en grille de plusieurs rangées, au format cible de l'écran, pas en une seule rangée", () => {
    const rangees = new Set(dispo.cadres.map((c) => c.y));
    expect(rangees.size).toBeGreaterThan(1);
    expect(dispo.colonnes).toBeGreaterThanOrEqual(2);
    expect(dispo.colonnes).toBeLessThan(28);
    const format = dispo.largeur / dispo.hauteur;
    expect(format).toBeGreaterThan(FORMAT_CIBLE * 0.6);
    expect(format).toBeLessThan(FORMAT_CIBLE * 1.6);
    // Un plan de 28 colonnes côte à côte ferait plus de 7 000 px de large.
    expect(dispo.largeur).toBeLessThan(5000);
  });

  it("chaque carte est dans le cadre de son service, et les cadres ne se chevauchent pas", () => {
    for (const k of dispo.cartes.filter((c) => c.slug && c.genre !== "general")) {
      const cadre = dispo.cadres.find((c) => c.slug === k.slug)!;
      expect(k.x).toBeGreaterThanOrEqual(cadre.x + DIMENSIONS.margeCadre);
      expect(k.x + k.largeur).toBeLessThanOrEqual(cadre.x + cadre.largeur - DIMENSIONS.margeCadre + 1e-9);
      expect(k.y).toBeGreaterThanOrEqual(cadre.y + DIMENSIONS.margeCadre);
      expect(k.y + k.hauteur).toBeLessThanOrEqual(cadre.y + cadre.hauteur - DIMENSIONS.margeCadre + 1e-9);
    }
    for (let i = 0; i < dispo.cadres.length; i += 1) for (let j = i + 1; j < dispo.cadres.length; j += 1) expect(chevauche(dispo.cadres[i]! as never, dispo.cadres[j]! as never)).toBe(false);
  });

  it("aucun trait du général ne traverse une carte ou un cadre (seulement leur bord haut)", () => {
    const general = dispo.cartes.find((k) => k.genre === "general")!;
    const traits = dispo.segments.filter((g) => g.de === "general");
    for (const g of traits) {
      const [x1, x2] = [Math.min(g.x1, g.x2), Math.max(g.x1, g.x2)];
      const [y1, y2] = [Math.min(g.y1, g.y2), Math.max(g.y1, g.y2)];
      for (const r of [...dispo.cartes.filter((k) => k !== general), ...dispo.cadres]) {
        const dedans = x1 < r.x + r.largeur && x2 > r.x && y1 < r.y + r.hauteur && y2 > r.y;
        expect(dedans, `${g.vers} / ${"id" in r ? r.id : ""}`).toBe(false);
      }
    }
  });

  it("tous les traits sont horizontaux ou verticaux et restent dans le plan", () => {
    for (const g of dispo.segments) {
      expect(g.x1 === g.x2 || g.y1 === g.y2).toBe(true);
      for (const v of [g.x1, g.x2]) expect(v >= 0 && v <= dispo.largeur).toBe(true);
      for (const v of [g.y1, g.y2]) expect(v >= 0 && v <= dispo.hauteur).toBe(true);
    }
  });

  it("chaque agent est relié par un petit trait horizontal à gauche de sa carte", () => {
    for (const k of dispo.cartes.filter((c) => c.genre === "agent")) {
      const trait = dispo.segments.find((g) => g.vers === k.id && g.y1 === g.y2);
      expect(trait, k.id).toBeDefined();
      expect(trait!.x2).toBe(k.x);
      expect(trait!.y1).toBe(k.y + k.hauteur / 2);
    }
  });

  it("les agents sont empilés sous leur coordinateur avec retrait par niveau", () => {
    const rangee = dispo.cartes.filter((k) => k.genre === "service");
    expect(new Set(rangee.map((k) => k.y)).size).toBe(Math.ceil(28 / dispo.colonnes));
    const un = disposerOrganigramme([service("a", [agent("c", "Coord", { role: "ceo" }), agent("n1", "N1", { reportsTo: "c" }), agent("n2", "N2", { reportsTo: "n1" }), agent("n1b", "N1b", { reportsTo: "c" })])]);
    const par = (nom: string) => un.cartes.find((k) => k.nom === nom)!;
    expect(par("N1").x).toBe(par("a".toUpperCase()).x + DIMENSIONS.retrait);
    expect(par("N2").x).toBe(par("N1").x + DIMENSIONS.retrait);
    expect(par("N1b").x).toBe(par("N1").x);
    expect(par("N2").y).toBeGreaterThan(par("N1").y);
    expect(par("N1b").y).toBeGreaterThan(par("N2").y);
    expect(un.hauteur).toBe(par("N1b").y + DIMENSIONS.agentH + DIMENSIONS.margeCadre);
  });

  it("un cycle de reportsTo ne boucle pas et garde chaque agent une seule fois", () => {
    const d = disposerOrganigramme([service("boucle", [agent("a", "Alice", { reportsTo: "b" }), agent("b", "Bruno", { reportsTo: "a" }), agent("c", "Cécile", { reportsTo: "c" })])]);
    const ids = d.cartes.flatMap((k) => (k.agent ? [k.agent.id] : k.coordinateur ? [k.coordinateur.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    // Cécile (seule racine) est sur la carte du service ; Alice et Bruno, membres du cycle, sont empilés dessous.
    expect(d.cartes.find((k) => k.genre === "service")!.coordinateur!.id).toBe("c");
    expect(d.cartes.filter((k) => k.genre === "agent").map((k) => k.agent!.id).sort()).toEqual(["a", "b"]);
  });

  it("services en cours de lecture ou en erreur : carte de service sans agent, aucune erreur", () => {
    const d = disposerOrganigramme([service("direction", [], { estDirection: true, etat: "chargement" }), service("panne", [], { etat: "erreur" })]);
    expect(d.cartes.map((k) => k.genre)).toEqual(["general", "service", "service"]);
    expect(d.cartes[0]!.agent).toBeNull();
    expect(d.cartes[2]!.etat).toBe("erreur");
  });

  it("aucun service : le général seul", () => {
    const d = disposerOrganigramme([]);
    expect(d.cartes).toHaveLength(1);
    expect(d.segments).toHaveLength(0);
    expect(d.largeur).toBe(DIMENSIONS.generalL);
  });

  it("la Direction passe en premier, quel que soit l'ordre reçu", () => {
    const d = disposerOrganigramme([service("b", []), service("direction", [agent("g", "Général", { role: "ceo" })], { estDirection: true })]);
    expect(d.cartes.filter((k) => k.genre === "service").map((k) => k.slug)).toEqual(["direction", "b"]);
    expect(d.cartes[0]!.agent!.name).toBe("Général");
  });
});

describe("filtre", () => {
  const services = [
    service("direction", [agent("g", "Coordinateur général", { role: "ceo" })], { estDirection: true }),
    service("juridique", [agent("j1", "Coord juridique", { role: "ceo" }), agent("j2", "Veille légale", { reportsTo: "j1", title: "Analyste" })]),
    service("marketing", [agent("m1", "Coord marketing", { role: "ceo" }), agent("m2", "Veille concurrence", { reportsTo: "m1" })]),
  ];
  const dispo = disposerOrganigramme(services);

  it("met en évidence les cartes d'agents et la première dans l'ordre du plan", () => {
    const t = cartesCorrespondantes(dispo, services, "veille");
    expect([...t].sort()).toEqual(["agent:juridique:j2", "agent:marketing:m2"]);
    expect(premiereCorrespondance(dispo, t)!.id).toBe("agent:juridique:j2");
  });

  it("le nom d'un service met en évidence sa carte, le nom du coordinateur aussi, sans accents ni casse", () => {
    expect([...cartesCorrespondantes(dispo, services, "MARKÉTING")].sort()).toEqual(["service:marketing"]);
    expect([...cartesCorrespondantes(dispo, services, "coord juridique")]).toEqual(["service:juridique"]);
  });

  it("le coordinateur de la Direction met aussi en évidence le général ; filtre vide ou sans résultat : rien", () => {
    expect([...cartesCorrespondantes(dispo, services, "général")].sort()).toEqual(["general", "service:direction"]);
    expect(cartesCorrespondantes(dispo, services, "").size).toBe(0);
    expect(cartesCorrespondantes(dispo, services, "zzz").size).toBe(0);
    expect(premiereCorrespondance(dispo, new Set())).toBeNull();
  });
});

describe("transformations de la vue", () => {
  it("ajuster : tout le plan tient, centré, sans agrandir au delà de 100 %", () => {
    const t = transformationAjustee({ largeur: 8000, hauteur: 2000 }, 1000, 600);
    expect(t.echelle).toBeCloseTo((1000 - 32) / 8000, 5);
    expect(8000 * t.echelle + 2 * t.x).toBeCloseTo(1000, 5);
    expect(transformationAjustee({ largeur: 200, hauteur: 100 }, 1000, 600).echelle).toBe(1);
    expect(transformationAjustee({ largeur: 1e9, hauteur: 1e9 }, 1000, 600).echelle).toBe(ECHELLE_MIN);
  });

  it("ouverture : zoom lisible (au moins 0,6 et texte de 9 px au moins) centré sur le général, sans tout faire tenir", () => {
    const grand = disposerOrganigramme(grandJeu());
    const general = grand.cartes.find((k) => k.genre === "general")!;
    const t = transformationOuverture(grand, 1000, 600);
    expect(t.echelle).toBeGreaterThanOrEqual(0.6);
    expect(t.echelle).toBe(ECHELLE_OUVERTURE);
    expect(11 * t.echelle).toBeGreaterThanOrEqual(9);
    // Le général est au milieu de la vue, en haut ; la première rangée est visible juste dessous.
    expect((general.x + general.largeur / 2) * t.echelle + t.x).toBeCloseTo(500, 5);
    expect(t.y).toBe(16);
    const premiere = grand.cadres.filter((c) => c.y === Math.min(...grand.cadres.map((k) => k.y)));
    expect(premiere[0]!.y * t.echelle + t.y).toBeLessThan(600);
    // Un petit plan qui tient dans la vue n'est pas agrandi au delà du cadrage.
    expect(transformationOuverture(disposerOrganigramme([service("a", [])]), 1000, 600).echelle).toBeGreaterThanOrEqual(ECHELLE_OUVERTURE);
    // L'échelle minimale ne vide jamais l'écran : le plan ajusté de 28 services reste lisible comme ensemble.
    expect(transformationAjustee(grand, 1000, 600).echelle).toBeGreaterThan(ECHELLE_MIN);
  });

  it("centrer : le centre de la carte tombe au centre de la vue", () => {
    const carte = { x: 1000, y: 400, largeur: 200, hauteur: 100 };
    const t = transformationCentree(carte, 800, 600, 0.8);
    expect(t.echelle).toBe(0.8);
    expect(1100 * t.echelle + t.x).toBeCloseTo(400, 5);
    expect(450 * t.echelle + t.y).toBeCloseTo(300, 5);
    expect(transformationCentree(carte, 800, 600, 0.8, 1.5).echelle).toBe(1.5);
  });

  it("zoomer autour d'un point garde ce point fixe et borne l'échelle", () => {
    const t = { echelle: 1, x: 10, y: 20 };
    const z = zoomerAutour(t, 2, 300, 200);
    expect(z.echelle).toBe(2);
    expect((300 - z.x) / z.echelle).toBeCloseTo((300 - t.x) / t.echelle, 5);
    expect((200 - z.y) / z.echelle).toBeCloseTo((200 - t.y) / t.echelle, 5);
    expect(zoomerAutour(t, 100, 0, 0).echelle).toBe(ECHELLE_MAX);
    expect(zoomerAutour(t, 0.0001, 0, 0).echelle).toBe(ECHELLE_MIN);
  });
});
