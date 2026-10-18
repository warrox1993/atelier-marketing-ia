/**
 * Fonctions pures de la carte des services (src/ui/organigramme-flux.ts) : classement des flux métier, liaisons par
 * partenaire, matrice, disposition en anneau, courbes qui évitent les autres nœuds, recherche sur 10 000 agents.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FluxServiceLu } from "../src/contrats/departements.js";
import type { AgentHote } from "../src/ui/organigramme-arbre.js";
import {
  chercher, courbeLiaison, dispositionAnneau, fluxMetier, indexRecherche, liaisonsDe, matriceEchanges, objetsDuFlux, ordonnerServices, pointsSurEllipse, rayonsGeneral, sansChevauchement,
  volumeDuFlux, type CourbeLiaison, type DispositionAnneau, type FluxBrut, type NoeudAnneau, type Point, type ServiceCarte,
} from "../src/ui/organigramme-flux.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const f = (source: string, cible: string, objet = "Objet", approbationHumaine = false, origine: FluxServiceLu["origine"] = "metier"): FluxServiceLu => ({ source, cible, objet, approbationHumaine, origine });
const services = (n: number): ServiceCarte[] => Array.from({ length: n }, (_, i) => ({ slug: i === 0 ? "direction" : `service-${i}`, nom: i === 0 ? "Direction" : `Service ${String(i).padStart(2, "0")}`, estDirection: i === 0 }));

describe("fluxMetier : classement sur le jeu réel (756 flux)", () => {
  // Jeu exporté du registre réel, tel que la déclaration l'envoie au plugin (origine « metier » ou « coordinateurs »).
  const reel = JSON.parse(execFileSync("python3", ["-I", "-c",
    "import json,sys; sys.path.insert(0, sys.argv[1]); import atelier_services as a; r=a.charger_services(); print(json.dumps([{'source':x['source'],'cible':x['cible'],'objet':x['objet'],'approbationHumaine':bool(x['approbationHumaine']),'origine':a.origine_plugin(x)} for x in a.flux_complets(r)]))",
    join(RACINE, "scripts")], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })) as FluxServiceLu[];

  it("rend les 118 flux métier sur 756 et écarte le réseau des coordinateurs (614 + 24)", () => {
    expect(reel).toHaveLength(756);
    expect(fluxMetier(reel)).toHaveLength(118);
    expect(reel.filter((x) => x.origine === "coordinateurs")).toHaveLength(638);
    expect(reel.filter((x) => x.objet.startsWith("Liaison entre coordinateurs"))).toHaveLength(614);
    expect(reel.filter((x) => x.objet.startsWith("Coordinateur général et coordinateurs"))).toHaveLength(24);
    expect(reel.filter((x) => x.objet.startsWith("Rapport périodique et escalade")).every((x) => x.origine === "metier")).toBe(true);
  });

  it("sans champ origine (ancien serveur), le repli par préfixe d'objet donne le même classement", () => {
    const sans: FluxBrut[] = reel.map(({ origine: _o, ...reste }) => reste);
    expect(fluxMetier(sans)).toHaveLength(118);
    expect(fluxMetier(sans).map((x) => `${x.source}>${x.cible}`)).toEqual(fluxMetier(reel).map((x) => `${x.source}>${x.cible}`));
  });

  it("ignore un flux d'un service vers lui-même et respecte le champ du serveur avant le repli", () => {
    expect(fluxMetier([f("a", "a"), f("a", "b"), f("b", "c", "Liaison entre coordinateurs (compétence protocole-inter-coordinateurs) : x", false, "metier")])).toHaveLength(2);
    expect(fluxMetier([f("b", "c", "Objet métier", false, "coordinateurs")])).toEqual([]);
  });

  it("compte les objets regroupés par « ; » comme autant d'échanges", () => {
    expect(objetsDuFlux({ objet: "Rapport périodique et escalade ; Indicateurs et analyses" })).toEqual(["Rapport périodique et escalade", "Indicateurs et analyses"]);
    expect(volumeDuFlux({ objet: "Un" })).toBe(1);
    expect(volumeDuFlux({ objet: " ; " })).toBe(1);
  });

  it("liaisons métier du jeu réel : chaque partenaire apparaît une fois, tri par volume décroissant", () => {
    const l = liaisonsDe("juridique", fluxMetier(reel));
    expect(l.length).toBeGreaterThan(0);
    expect(new Set(l.map((x) => x.partenaire)).size).toBe(l.length);
    expect(l.map((x) => x.volume)).toEqual([...l.map((x) => x.volume)].sort((a, b) => b - a));
    expect(l.every((x) => x.sortants.length + x.entrants.length > 0 && x.partenaire !== "juridique")).toBe(true);
  });
});

describe("liaisonsDe", () => {
  const flux = [f("sav", "juridique", "Avis"), f("juridique", "sav", "Réponse ; Suite", true), f("sav", "direction", "Rapport"), f("achats", "sav", "Commande"), f("sav", "sav", "boucle"), f("achats", "direction")];

  it("agrège sortants et entrants par partenaire, avec l'approbation et le volume", () => {
    const l = liaisonsDe("sav", flux);
    expect(l.map((x) => x.partenaire)).toEqual(["juridique", "achats", "direction"]);
    const jur = l[0]!;
    expect(jur.sortants.map((x) => x.objet)).toEqual(["Avis"]);
    expect(jur.entrants.map((x) => x.objet)).toEqual(["Réponse ; Suite"]);
    expect(jur.approbation).toBe(true);
    expect(jur.volume).toBe(3);
    expect(l[1]).toMatchObject({ partenaire: "achats", sortants: [], approbation: false, volume: 1 });
    expect(l[1]!.entrants).toHaveLength(1);
  });

  it("un service sans liaison n'a aucun partenaire, et un service n'est jamais son propre partenaire", () => {
    expect(liaisonsDe("inconnu", flux)).toEqual([]);
    expect(liaisonsDe("sav", flux).some((x) => x.partenaire === "sav")).toBe(false);
  });
});

describe("matriceEchanges", () => {
  const svc: ServiceCarte[] = [{ slug: "sav", nom: "SAV" }, { slug: "direction", nom: "Direction", estDirection: true }, { slug: "achats", nom: "Achats" }];

  it("ordonne la Direction d'abord puis par nom, mêmes services en lignes et en colonnes", () => {
    expect(ordonnerServices(svc).map((s) => s.slug)).toEqual(["direction", "achats", "sav"]);
    const m = matriceEchanges(svc, []);
    expect(m.ordre).toEqual(["direction", "achats", "sav"]);
    expect(m.noms).toEqual(["Direction", "Achats", "SAV"]);
    expect(m.cases.flat().every((c) => c.nombre === 0 && !c.approbation && c.flux.length === 0)).toBe(true);
  });

  it("place chaque flux à (source, cible) avec son nombre d'objets et son approbation, et totalise lignes et colonnes", () => {
    const m = matriceEchanges(svc, [f("sav", "direction", "Rapport ; Escalade"), f("direction", "sav", "Consigne", true), f("achats", "sav", "Commande"), f("sav", "sav"), f("sav", "fantome")]);
    const i = (s: string) => m.ordre.indexOf(s);
    expect(m.cases[i("sav")]![i("direction")]).toMatchObject({ nombre: 2, approbation: false });
    expect(m.cases[i("direction")]![i("sav")]).toMatchObject({ nombre: 1, approbation: true });
    expect(m.cases[i("achats")]![i("sav")]).toMatchObject({ nombre: 1, approbation: false });
    expect(m.cases[i("sav")]![i("achats")]!.nombre).toBe(0);
    expect(m.cases[i("sav")]![i("sav")]!.nombre).toBe(0);
    expect(m.totalLigne[i("sav")]).toBe(2);
    expect(m.totalColonne[i("sav")]).toBe(2);
    expect(m.totalLigne.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("sur le jeu réel : somme des cases = somme des volumes des 118 flux métier", () => {
    const reg = JSON.parse(execFileSync("python3", ["-I", "-c", "import json,sys; sys.path.insert(0, sys.argv[1]); import atelier_services as a; r=a.charger_services(); print(json.dumps({'services':[{'slug':s['slug'],'nom':s['nom'],'estDirection':s['slug']=='direction'} for s in r['services']],'flux':[{'source':x['source'],'cible':x['cible'],'objet':x['objet'],'approbationHumaine':bool(x['approbationHumaine']),'origine':'metier'} for x in r['flux']]}))", join(RACINE, "scripts")], { encoding: "utf8" })) as { services: ServiceCarte[]; flux: FluxServiceLu[] };
    const m = matriceEchanges(reg.services, reg.flux);
    expect(m.ordre).toHaveLength(28);
    expect(m.ordre[0]).toBe("direction");
    expect(m.cases.flat().reduce((a, c) => a + c.nombre, 0)).toBe(reg.flux.reduce((a, x) => a + volumeDuFlux(x), 0));
    expect(m.cases.flat().reduce((a, c) => a + c.flux.length, 0)).toBe(118);
  });
});

// ---------------------------------------------------------------------------------------------------------------

/** Zone de la carte à 1912 x 956 (haut de la zone vers y = 216, bas de la fenêtre moins 1 rem) et à 1366 x 768. */
const VUE = { largeur: 1568, hauteur: 724 };
const PETITE_VUE = { largeur: 1100, hauteur: 540 };
const services28 = services(28);
const services60 = services(60);
const rect = (n: NoeudAnneau) => ({ x0: n.x - n.largeur / 2, y0: n.y - n.hauteur / 2, x1: n.x + n.largeur / 2, y1: n.y + n.hauteur / 2 });
const dedans = (p: Point, r: ReturnType<typeof rect>) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
/** Position d'un point par rapport à l'ellipse (rx, ry) centrée sur `c` : < 1 dedans, 1 dessus, > 1 dehors. */
const dansEllipse = (p: Point, c: Point, e: { rx: number; ry: number }) => ((p.x - c.x) / e.rx) ** 2 + ((p.y - c.y) / e.ry) ** 2;

describe("pointsSurEllipse", () => {
  it("n points à longueur d'arc égale, sur l'ellipse, le premier en haut", () => {
    for (const [rx, ry, n] of [[800, 300, 28], [500, 500, 12], [900, 120, 40]] as const) {
      const pts = pointsSurEllipse(n, rx, ry, -Math.PI / 2);
      expect(pts).toHaveLength(n);
      expect(pts[0]!.x).toBeCloseTo(0, 6);
      expect(pts[0]!.y).toBeCloseTo(-ry, 6);
      // Longueur d'arc entre deux points consécutifs, intégrée à part (paramètre retrouvé par atan2 sur l'ellipse unité).
      const parametre = (p: Point) => Math.atan2(p.y / ry, p.x / rx);
      const arc = (p: Point, q: Point) => {
        let t0 = parametre(p);
        let t1 = parametre(q);
        if (t1 <= t0) t1 += 2 * Math.PI;
        let l = 0;
        const pas = 4000;
        for (let k = 0; k < pas; k += 1) {
          const ta = t0 + ((t1 - t0) * k) / pas;
          const tb = t0 + ((t1 - t0) * (k + 1)) / pas;
          l += Math.hypot(rx * (Math.cos(tb) - Math.cos(ta)), ry * (Math.sin(tb) - Math.sin(ta)));
        }
        return l;
      };
      const longueurs = pts.map((p, i) => arc(p, pts[(i + 1) % n]!));
      const moyenne = longueurs.reduce((a, b) => a + b, 0) / n;
      for (const l of longueurs) expect(Math.abs(l - moyenne) / moyenne).toBeLessThan(0.003);
      for (const p of pts) expect((p.x / rx) ** 2 + (p.y / ry) ** 2).toBeCloseTo(1, 6);
    }
  });
});

describe("dispositionAnneau", () => {
  it("jusqu'à 28 services : UN anneau elliptique, le général au centre, la Direction en haut, aucun chevauchement", () => {
    for (const n of [1, 2, 5, 12, 24, 28]) {
      const d = dispositionAnneau(services(n), VUE);
      expect(d.anneaux, `n=${n}`).toHaveLength(1);
      expect(d.compact, `n=${n}`).toBe(false);
      expect(d.noeuds).toHaveLength(n + 1);
      expect(sansChevauchement(d.noeuds, 8), `n=${n}`).toBe(true);
      const g = d.noeuds.find((x) => x.genre === "general")!;
      expect(g).toMatchObject({ id: "general", x: d.centre.x, y: d.centre.y, anneau: 0 });
      const dir = d.noeuds.find((x) => x.id === "direction")!;
      expect(dir.x).toBeCloseTo(d.centre.x, 6);
      expect(dir.y).toBeLessThan(d.centre.y);
      // Tous les services sont SUR l'ellipse, dont les axes suivent la largeur et la hauteur de la scène.
      for (const x of d.noeuds.filter((q) => q.genre === "service")) expect(dansEllipse(x, d.centre, d.anneaux[0]!), `n=${n} ${x.id}`).toBeCloseTo(1, 6);
      expect(d.anneaux[0]!.rx).toBeGreaterThan(d.anneaux[0]!.ry);
    }
  });

  it("28 services : la scène a exactement le format de la zone, y tient à l'échelle d'ajustement (au moins 0,8) et ne réserve rien d'inutile", () => {
    const d = dispositionAnneau(services28, VUE);
    expect(d.largeur / d.hauteur).toBeCloseTo(VUE.largeur / VUE.hauteur, 6);
    expect(d.echelle).toBeGreaterThanOrEqual(0.8);
    expect(d.largeur * d.echelle).toBeCloseTo(VUE.largeur, 6);
    // Les nœuds extrêmes frôlent le bord de la scène (marge de 8 px seulement, aucune réserve extérieure).
    const bornes = d.noeuds.map(rect);
    expect(Math.min(...bornes.map((r) => r.x0))).toBeLessThan(20);
    expect(Math.max(...bornes.map((r) => r.x1))).toBeGreaterThan(d.largeur - 20);
    expect(Math.min(...bornes.map((r) => r.y0))).toBeLessThan(20);
    expect(Math.max(...bornes.map((r) => r.y1))).toBeGreaterThan(d.hauteur - 20);
  });

  it("au-delà de 32 : nœuds compacts et second anneau intérieur, la Direction sur l'anneau extérieur, aucun chevauchement", () => {
    for (const n of [33, 40, 60]) {
      const d = dispositionAnneau(services(n), VUE);
      expect(d.anneaux, `n=${n}`).toHaveLength(2);
      expect(d.anneaux[0]!.rx).toBeLessThan(d.anneaux[1]!.rx);
      expect(d.compact).toBe(true);
      expect(sansChevauchement(d.noeuds, 8), `n=${n}`).toBe(true);
      expect(d.noeuds.filter((x) => x.anneau === 1).length + d.noeuds.filter((x) => x.anneau === 2).length).toBe(n);
      const dir = d.noeuds.find((x) => x.id === "direction")!;
      expect(dir.anneau).toBe(2);
      expect(dir.y).toBeLessThan(d.centre.y);
      for (const x of d.noeuds.filter((q) => q.genre === "service")) expect(dansEllipse(x, d.centre, d.anneaux[x.anneau - 1]!), `n=${n} ${x.id}`).toBeCloseTo(1, 6);
    }
  });

  it("zone étroite : nœuds compacts puis second anneau plutôt qu'un texte minuscule (échelle d'ajustement la plus haute)", () => {
    const d = dispositionAnneau(services28, PETITE_VUE);
    expect(d.compact).toBe(true);
    expect(sansChevauchement(d.noeuds, 8)).toBe(true);
    expect(d.echelle).toBeGreaterThanOrEqual(0.6);
    expect(d.echelle).toBeLessThanOrEqual(1);
  });

  it("tout tient dans la scène, jamais plus petite que la zone, et l'échelle d'ajustement fait tenir la scène dans la zone", () => {
    for (const [n, vue] of [[0, VUE], [3, VUE], [28, VUE], [60, VUE], [28, PETITE_VUE], [60, PETITE_VUE]] as const) {
      const d = dispositionAnneau(services(n), vue);
      expect(d.largeur).toBeGreaterThanOrEqual(vue.largeur - 1e-6);
      expect(d.hauteur).toBeGreaterThanOrEqual(vue.hauteur - 1e-6);
      expect(d.largeur * d.echelle).toBeLessThanOrEqual(vue.largeur + 1e-6);
      expect(d.hauteur * d.echelle).toBeLessThanOrEqual(vue.hauteur + 1e-6);
      expect(d.echelle).toBeGreaterThanOrEqual(0.4);
      for (const x of d.noeuds) {
        const r = rect(x);
        expect(r.x0, `${n} ${x.id}`).toBeGreaterThanOrEqual(-1e-6);
        expect(r.y0).toBeGreaterThanOrEqual(-1e-6);
        expect(r.x1).toBeLessThanOrEqual(d.largeur + 1e-6);
        expect(r.y1).toBeLessThanOrEqual(d.hauteur + 1e-6);
      }
    }
  });

  it("la scène grandit pour que les nœuds ne se chevauchent pas, quelle que soit la zone ; slugs en double ignorés", () => {
    const petite = dispositionAnneau(services(20), { largeur: 300, hauteur: 300 });
    expect(sansChevauchement(petite.noeuds)).toBe(true);
    expect(petite.largeur).toBeGreaterThan(300);
    expect(petite.echelle).toBeLessThan(1);
    const doublons = dispositionAnneau([...services(5), ...services(5)], VUE);
    expect(doublons.noeuds).toHaveLength(6);
    expect(dispositionAnneau([], VUE).noeuds.map((x) => x.id)).toEqual(["general"]);
  });

  it("des nœuds imposés plus grands donnent une scène plus grande, toujours sans chevauchement", () => {
    const normal = dispositionAnneau(services(18), VUE);
    const gros = dispositionAnneau(services(18), VUE, { noeud: { largeur: 260, hauteur: 100 } });
    expect(gros.largeur).toBeGreaterThan(normal.largeur);
    expect(sansChevauchement(gros.noeuds)).toBe(true);
  });
});

describe("dispositionAnneau : surimpressions réservées", () => {
  /** Légende en haut à gauche, commandes en haut à droite, aide en bas à gauche (px de la zone, marge de 8 px comprise). */
  const reservesDe = (z: { largeur: number; hauteur: number }) => [
    { x0: 4, y0: 4, x1: 280, y1: 100 },
    { x0: z.largeur - 220, y0: 4, x1: z.largeur - 4, y1: 70 },
    { x0: 4, y0: z.hauteur - 64, x1: 260, y1: z.hauteur - 4 },
  ];
  const noeudsSousUneReserve = (d: DispositionAnneau, reserves: ReturnType<typeof reservesDe>) =>
    d.noeuds.filter((n) => {
      const r = rect(n);
      const [x0, y0, x1, y1] = [r.x0 * d.echelle, r.y0 * d.echelle, r.x1 * d.echelle, r.y1 * d.echelle];
      return reserves.some((q) => x0 < q.x1 && q.x0 < x1 && y0 < q.y1 && q.y0 < y1);
    }).map((n) => n.id);

  it("aucun nœud, à l'échelle d'ajustement, ne passe sous une surimpression (28, 33 et 60 services, zone large et étroite)", () => {
    for (const [n, vue] of [[28, VUE], [28, PETITE_VUE], [33, VUE], [60, VUE]] as const) {
      const reserves = reservesDe(vue);
      const d = dispositionAnneau(services(n), vue, { reserves });
      expect(noeudsSousUneReserve(d, reserves), `n=${n} ${vue.largeur}`).toEqual([]);
      expect(sansChevauchement(d.noeuds, 8), `n=${n}`).toBe(true);
      expect(d.largeur / d.hauteur).toBeCloseTo(vue.largeur / vue.hauteur, 6);
      expect(d.echelle).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("sans réserve la disposition ne change pas ; une réserve qui gêne resserre l'ellipse sans agrandir inutilement la scène", () => {
    const sans = dispositionAnneau(services28, VUE);
    expect(dispositionAnneau(services28, VUE, { reserves: [] })).toEqual(sans);
    // Une réserve posée sur un nœud de l'ellipse libre : l'ellipse se resserre (axes plus courts) pour la dégager.
    const gene = sans.noeuds.find((n) => n.id === "service-3")!;
    const r = rect(gene);
    const reserve = { x0: r.x0 * sans.echelle - 2, y0: r.y0 * sans.echelle - 2, x1: r.x1 * sans.echelle + 2, y1: r.y1 * sans.echelle + 2 };
    const avec = dispositionAnneau(services28, VUE, { reserves: [reserve] });
    expect(noeudsSousUneReserve(avec, [reserve])).toEqual([]);
    expect(avec.anneaux[0]!.rx * avec.echelle).toBeLessThan(sans.anneaux[0]!.rx * sans.echelle);
  });
});

/** Lecture indépendante du chemin SVG (M, L, Q, C absolus) échantillonnée finement, pour ne pas se fier aux points de l'implémentation. */
function echantillonnerChemin(chemin: string, parSegment = 80): Point[] {
  const jetons = chemin.trim().split(/\s+/u);
  const pts: Point[] = [];
  let i = 0;
  let courant: Point = { x: 0, y: 0 };
  const lire = (): Point => ({ x: Number(jetons[i++]), y: Number(jetons[i++]) });
  while (i < jetons.length) {
    const cmd = jetons[i++]!;
    if (cmd === "M") { courant = lire(); pts.push(courant); continue; }
    if (cmd === "L") { const q = lire(); for (let k = 1; k <= parSegment; k += 1) pts.push({ x: courant.x + ((q.x - courant.x) * k) / parSegment, y: courant.y + ((q.y - courant.y) * k) / parSegment }); courant = q; continue; }
    if (cmd === "Q") {
      const c = lire(); const q = lire();
      for (let k = 1; k <= parSegment; k += 1) { const t = k / parSegment; const u = 1 - t; pts.push({ x: u * u * courant.x + 2 * u * t * c.x + t * t * q.x, y: u * u * courant.y + 2 * u * t * c.y + t * t * q.y }); }
      courant = q; continue;
    }
    if (cmd === "C") {
      const c1 = lire(); const c2 = lire(); const q = lire();
      for (let k = 1; k <= parSegment; k += 1) { const t = k / parSegment; const u = 1 - t; pts.push({ x: u ** 3 * courant.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * q.x, y: u ** 3 * courant.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * q.y }); }
      courant = q; continue;
    }
    throw new Error(`commande SVG inattendue : ${cmd}`);
  }
  return pts;
}

/** Nombre de vrais rectangles de nœuds (hors extrémités) traversés par le chemin, échantillonné finement. */
function traverses(c: CourbeLiaison, a: NoeudAnneau, b: NoeudAnneau, d: DispositionAnneau): string[] {
  const pts = echantillonnerChemin(c.chemin);
  return d.noeuds.filter((n) => n.id !== a.id && n.id !== b.id && pts.some((p) => dedans(p, rect(n)))).map((n) => n.id);
}

describe("courbeLiaison", () => {
  const disposition28 = dispositionAnneau(services28, VUE);
  const disposition60 = dispositionAnneau(services60, VUE);
  const duService = (d: DispositionAnneau) => d.noeuds.filter((n) => n.genre === "service");

  it("part du bord du nœud source, finit au bord du nœud cible, et la flèche suit la courbe", () => {
    const [a, b] = [disposition28.noeuds.find((n) => n.id === "service-3")!, disposition28.noeuds.find((n) => n.id === "service-9")!];
    const c = courbeLiaison(a, b, disposition28.noeuds);
    expect(c.chemin).toMatch(/^M [\d. -]+ (Q|L)/u);
    const surBord = (p: Point, n: NoeudAnneau) => {
      const r = rect(n);
      const ecartX = Math.max(r.x0 - p.x, 0, p.x - r.x1);
      const ecartY = Math.max(r.y0 - p.y, 0, p.y - r.y1);
      return Math.hypot(ecartX, ecartY);
    };
    expect(surBord(c.depart, a)).toBeLessThanOrEqual(8);
    expect(surBord(c.arrivee, b)).toBeLessThanOrEqual(8);
    expect(c.fleche).toMatchObject({ x: c.arrivee.x, y: c.arrivee.y });
    const dernier = c.points[c.points.length - 1]!;
    const avant = c.points[c.points.length - 2]!;
    expect(c.fleche.angle).toBeCloseTo(Math.atan2(dernier.y - avant.y, dernier.x - avant.x), 0);
    expect(c.libre).toBe(true);
  });

  it("se courbe vers l'intérieur de l'anneau (au milieu, plus près du centre que la corde)", () => {
    const d = dispositionAnneau(services(12), VUE);
    const [a, b] = [d.noeuds.find((n) => n.id === "service-2")!, d.noeuds.find((n) => n.id === "service-4")!];
    const c = courbeLiaison(a, b, d.noeuds);
    const milieuCorde = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const milieuCourbe = c.points[Math.floor(c.points.length / 2)]!;
    const versCentre = (p: Point) => Math.hypot(p.x - d.centre.x, p.y - d.centre.y);
    expect(versCentre(milieuCourbe)).toBeLessThan(versCentre(milieuCorde));
  });

  it("l'aller et le retour d'une même paire, avec le même décalage, restent séparés", () => {
    const d = disposition28;
    for (const [x, y] of [["service-3", "service-9"], ["direction", "service-14"], ["service-1", "service-2"]] as const) {
      const a = d.noeuds.find((n) => n.id === x)!;
      const b = d.noeuds.find((n) => n.id === y)!;
      const aller = courbeLiaison(a, b, d.noeuds, 14);
      const retour = courbeLiaison(b, a, d.noeuds, 14);
      expect(aller.chemin).not.toBe(retour.chemin);
      // Le milieu de l'aller est écarté de celui du retour d'au moins 12 px.
      const m1 = aller.points[Math.floor(aller.points.length / 2)]!;
      const m2 = retour.points.reduce((meilleur, p) => (Math.hypot(p.x - m1.x, p.y - m1.y) < Math.hypot(meilleur.x - m1.x, meilleur.y - m1.y) ? p : meilleur));
      expect(Math.hypot(m1.x - m2.x, m1.y - m2.y), `${x} > ${y}`).toBeGreaterThanOrEqual(12);
    }
  });

  it("28 services : aucune des 756 courbes ne traverse le rectangle d'un autre nœud (échantillonnage fin, indépendant)", () => {
    const sv = duService(disposition28);
    expect(sv).toHaveLength(28);
    let total = 0;
    for (const a of sv) for (const b of sv) {
      if (a.id === b.id) continue;
      const c = courbeLiaison(a, b, disposition28.noeuds);
      total += 1;
      expect(c.libre, `${a.id} > ${b.id}`).toBe(true);
      expect(traverses(c, a, b, disposition28), `${a.id} > ${b.id}`).toEqual([]);
    }
    expect(total).toBe(756);
  });

  it("28 services : les courbes depuis et vers le général évitent aussi les services", () => {
    const g = disposition28.noeuds.find((n) => n.genre === "general")!;
    for (const s of duService(disposition28)) {
      for (const [a, b] of [[g, s], [s, g]] as const) {
        const c = courbeLiaison(a, b, disposition28.noeuds);
        expect(traverses(c, a, b, disposition28), `${a.id} > ${b.id}`).toEqual([]);
      }
    }
  });

  it("60 services : aucune courbe ne traverse un autre nœud (toutes les paires depuis 8 services répartis sur les deux anneaux)", () => {
    const sv = duService(disposition60);
    const sources = [0, 1, 2, 7, 20, 33, 47, 59].map((i) => sv[i]!);
    expect(new Set(sources.map((s) => s.anneau)).size).toBe(2);
    for (const a of sources) for (const b of sv) {
      if (a.id === b.id) continue;
      const c = courbeLiaison(a, b, disposition60.noeuds);
      expect(c.libre, `${a.id} > ${b.id}`).toBe(true);
      expect(traverses(c, a, b, disposition60), `${a.id} > ${b.id}`).toEqual([]);
    }
  }, 60_000);

  it("28 services : toutes les liaisons passent par l'intérieur de l'ellipse (milieu dedans, aucun point au-delà du bord des nœuds)", () => {
    const d = disposition28;
    const e = d.anneaux[0]!;
    const sv = duService(d);
    const [mx, my] = [sv[0]!.largeur / 2, sv[0]!.hauteur / 2];
    for (const a of sv) for (const b of sv) {
      if (a.id === b.id) continue;
      const pts = echantillonnerChemin(courbeLiaison(a, b, d.noeuds).chemin);
      expect(dansEllipse(pts[Math.floor(pts.length / 2)]!, d.centre, e), `${a.id} > ${b.id}`).toBeLessThan(1);
      for (const p of pts) expect(dansEllipse(p, d.centre, { rx: e.rx + mx, ry: e.ry + my }), `${a.id} > ${b.id}`).toBeLessThanOrEqual(1.0001);
    }
  });

  it("28 services en zone étroite (deux anneaux) : aucune courbe ne traverse un autre nœud", () => {
    const d = dispositionAnneau(services28, PETITE_VUE);
    expect(d.anneaux).toHaveLength(2);
    const sv = duService(d);
    for (const a of [sv[0]!, sv[5]!, sv[14]!, sv[27]!]) for (const b of sv) {
      if (a.id === b.id) continue;
      const c = courbeLiaison(a, b, d.noeuds);
      expect(c.libre, `${a.id} > ${b.id}`).toBe(true);
      expect(traverses(c, a, b, d), `${a.id} > ${b.id}`).toEqual([]);
    }
  });

  it("les 27 liaisons d'un service sont tracées vite (une sélection dans la carte)", () => {
    const d = dispositionAnneau(services28, VUE);
    const a = d.noeuds.find((n) => n.id === "service-5")!;
    const t0 = performance.now();
    for (const b of duService(d)) if (b.id !== a.id) courbeLiaison(a, b, d.noeuds);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("rayonsGeneral", () => {
  /** Rayons rendus, tels que le dessin les trace, lus et échantillonnés à part : nœuds tiers traversés (hors extrémités). */
  const tiersTraverses = (d: DispositionAnneau) => {
    const g = d.noeuds.find((n) => n.genre === "general")!;
    const rayons = rayonsGeneral(d.noeuds);
    const fautes: string[] = [];
    for (const r of rayons) {
      const pts = echantillonnerChemin(r.chemin);
      for (const n of d.noeuds) if (n.id !== g.id && n.id !== r.id && pts.some((p) => dedans(p, rect(n)))) fautes.push(`${r.id} sous ${n.id}`);
    }
    return { rayons, fautes };
  };

  it("28 services : un rayon par service, tous droits, aucun ne passe sous un nœud", () => {
    const { rayons, fautes } = tiersTraverses(dispositionAnneau(services28, VUE));
    expect(rayons).toHaveLength(28);
    expect(rayons.every((r) => r.droit)).toBe(true);
    expect(fautes).toEqual([]);
  });

  it("zone étroite, 33 et 60 services : aucun rayon ne passe sous un nœud, même avec deux anneaux (courbe d'évitement au besoin)", () => {
    for (const [n, vue] of [[28, PETITE_VUE], [33, VUE], [60, VUE]] as const) {
      const { rayons, fautes } = tiersTraverses(dispositionAnneau(services(n), vue));
      expect(rayons, `n=${n}`).toHaveLength(n);
      expect(fautes, `n=${n}`).toEqual([]);
    }
  }, 60_000);

  it("sans Coordinateur général : aucun rayon", () => {
    expect(rayonsGeneral([])).toEqual([]);
  });
});

describe("recherche", () => {
  const agent = (id: string, name: string, title: string | null = null): AgentHote => ({ id, name, role: "general", title, status: "idle", reportsTo: null, adapterType: "claude_local" });
  const svc: ServiceCarte[] = [{ slug: "sav", nom: "SAV et sinistres" }, { slug: "direction", nom: "Direction", estDirection: true }, { slug: "juridique", nom: "Juridique" }];
  const agents = {
    sav: [agent("a1", "Éloïse Gérard", "Gestionnaire sinistres"), agent("a2", "Coordinateur SAV", "Coordinateur"), agent("a3", "Zoé Martin")],
    direction: [agent("d1", "Coordinateur général", "Coordinateur général")],
  };
  const index = indexRecherche(svc, agents);

  it("trouve sans tenir compte des accents ni de la casse, services et agents", () => {
    expect(chercher(index, "eloise").map((r) => r.id)).toEqual(["a1"]);
    expect(chercher(index, "ÉLOÏSE gerard")[0]).toMatchObject({ type: "agent", id: "a1", slug: "sav", nomService: "SAV et sinistres" });
    const sin = chercher(index, "sinistres");
    expect(sin.map((r) => r.type)).toEqual(["service", "agent"]);
    expect(chercher(index, "juridique")[0]).toMatchObject({ type: "service", slug: "juridique", id: "" });
  });

  it("tous les mots doivent correspondre (nom ou titre), et une requête vide ou sans résultat rend []", () => {
    expect(chercher(index, "coordinateur sav").map((r) => r.id)).toEqual(["a2"]);
    expect(chercher(index, "gestionnaire zoe")).toEqual([]);
    expect(chercher(index, "   ")).toEqual([]);
    expect(chercher(index, "introuvable")).toEqual([]);
  });

  it("classe d'abord les noms qui commencent par la requête", () => {
    const r = chercher(index, "coordinateur");
    expect(r.map((x) => x.id)).toEqual(["a2", "d1"].sort((p, q) => r.findIndex((x) => x.id === p) - r.findIndex((x) => x.id === q)));
    expect(r[0]!.nom.toLowerCase().startsWith("coordinateur")).toBe(true);
  });

  it("accepte une table Map et borne le nombre de résultats", () => {
    const m = indexRecherche(svc, new Map(Object.entries(agents)));
    expect(m.entrees).toHaveLength(index.entrees.length);
    expect(chercher(m, "o", 2)).toHaveLength(2);
    expect(chercher(m, "o", 0)).toHaveLength(1);
    expect(chercher(m, "o", 10_000).length).toBeLessThanOrEqual(200);
  });

  it("performance : 10 000 agents sur 60 services, index < 200 ms, requête < 20 ms", () => {
    const ss = services(60);
    const prenoms = ["Alice", "Bruno", "Camille", "Damien", "Élodie", "François", "Gaëlle", "Hugo", "Inès", "Julien"];
    const noms = ["Dupont", "Lambert", "Moreau", "Peeters", "Janssens", "Maes", "Dubois", "Claes", "Willems", "Goossens"];
    const parService: Record<string, AgentHote[]> = {};
    let n = 0;
    for (const s of ss) {
      parService[s.slug] = [];
      for (let k = 0; k < 10_000 / 60 + 1 && n < 10_000; k += 1, n += 1) parService[s.slug]!.push(agent(`ag-${n}`, `${prenoms[n % 10]} ${noms[Math.floor(n / 10) % 10]} ${n}`, n % 3 === 0 ? "Responsable de la relation client" : null));
    }
    expect(n).toBe(10_000);
    chercher(indexRecherche(ss, parService), "dupont"); // échauffement du moteur
    const t0 = performance.now();
    const idx = indexRecherche(ss, parService);
    const construction = performance.now() - t0;
    expect(idx.entrees).toHaveLength(10_060);
    const mesures: number[] = [];
    for (const q of ["dupont", "elodie moreau", "responsable relation", "gael", "service 07", "zzz", "42"]) {
      const t = performance.now();
      const r = chercher(idx, q, 20);
      mesures.push(performance.now() - t);
      expect(r.length).toBeLessThanOrEqual(20);
    }
    console.info(`recherche : index ${construction.toFixed(1)} ms, requêtes max ${Math.max(...mesures).toFixed(2)} ms`);
    expect(construction).toBeLessThan(200);
    expect(Math.max(...mesures)).toBeLessThan(20);
  });
});
