// @vitest-environment jsdom
/**
 * Vue « Organigramme », interface : entrée de menu, carte des services (28 nœuds, aucune flèche au repos, aperçu au
 * survol, flèches et panneau après sélection, Échap), recherche d'un agent ou d'un service, onglet matrice, vue d'un
 * service, ancre et retour, téléphone, états d'erreur. Routes du plugin et API de l'hôte servies par un `fetch` simulé.
 */
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementDeclare, FluxServiceLu } from "../../src/contrats/departements.js";
import { EntreeAtelier, PageAtelier } from "../../src/ui/index.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
import { STYLES_ORGANIGRAMME } from "../../src/ui/styles-organigramme.js";
import { oublierAccesDirection } from "../../src/ui/vues/echanges.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

const DIR = "22222222-2222-4222-8222-222222222222";
const JUR = "33333333-3333-4333-8333-333333333333";
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const declare = (companyId: string, slug: string, nom: string, o: Partial<DepartementDeclare> = {}): DepartementDeclare => ({ companyId, slug, nom, estDirection: false, courant: false, ...o });
const TROIS = [declare(DIR, "direction", "Direction", { estDirection: true }), declare(JUR, "juridique", "Juridique"), declare(ENTREPRISE, "marketing", "Marketing", { courant: true })];
const ENTREPRISES = [
  { id: ENTREPRISE, name: "Fictive SA · Marketing", issuePrefix: "RNO" },
  { id: DIR, name: "Fictive SA · Direction", issuePrefix: "RNOAB" },
  { id: JUR, name: "Fictive SA · Juridique", issuePrefix: "RNOAC" },
];
const ag = (id: string, name: string, o: Record<string, unknown> = {}) => ({ id, name, role: "general", title: null, status: "idle", reportsTo: null, adapterType: "claude_local", ...o });
const AGENTS: Record<string, unknown[]> = {
  [DIR]: [ag("d1", "Coordinateur général", { role: "ceo" }), ag("d2", "Gouvernance", { reportsTo: "d1" })],
  [JUR]: [ag("j1", "Coordinateur juridique", { role: "ceo", status: "paused" }), ag("j2", "Contrats", { reportsTo: "j1", status: "error" }), ag("j3", "Veille légale", { reportsTo: "j2" })],
  [ENTREPRISE]: [ag("m1", "Coordinateur marketing", { role: "ceo" })],
};
const FLUX: FluxServiceLu[] = [
  { source: "marketing", cible: "juridique", objet: "Relecture légale", approbationHumaine: false, origine: "metier" },
  { source: "juridique", cible: "marketing", objet: "Avis sur une mention", approbationHumaine: true, origine: "metier" },
  { source: "direction", cible: "juridique", objet: "Contrat à signer", approbationHumaine: false, origine: "metier" },
];

let rendu: Rendu | null = null;
let appels: string[] = [];
let serveur: (url: string) => { statut: number; corps: unknown };

beforeEach(() => {
  window.location.hash = "";
  oublierDepartements();
  oublierAccesDirection();
  appels = [];
  serveur = () => ({ statut: 404, corps: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      appels.push(url);
      const r = serveur(url);
      return new Response(JSON.stringify(r.corps), { status: r.statut });
    }),
  );
});
afterEach(() => {
  window.location.hash = "";
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const servir = (o: { departements?: DepartementDeclare[]; flux?: FluxServiceLu[] | "panne"; agentsParService?: Record<string, unknown[] | "panne">; entreprises?: unknown[]; aTraiter?: Record<string, number> } = {}) => (url: string) => {
  const parService = o.agentsParService ?? AGENTS;
  const m = /\/api\/companies\/([^/?]+)\/agents/u.exec(url);
  if (m) {
    const a = parService[decodeURIComponent(m[1]!)];
    return a === "panne" || a === undefined ? { statut: 500, corps: { error: "hôte injoignable" } } : { statut: 200, corps: a };
  }
  const e = /\/departements\/etat\?companyId=([^&]+)/u.exec(url);
  if (e) return { statut: 200, corps: { validations: { total: o.aTraiter?.[decodeURIComponent(e[1]!)] ?? 0 }, taches: { bloquees: 0, enCours: 0 }, alertes: [] } };
  if (url.includes("/services/flux?companyId=")) return o.flux === "panne" ? { statut: 500, corps: { error: "flux en panne" } } : { statut: 200, corps: { client: "fictive-sa", flux: o.flux ?? FLUX } };
  if (url.includes("/departements?companyId=")) return { statut: 200, corps: { client: "fictive-sa", departements: o.departements ?? TROIS } };
  if (url.endsWith("/api/companies")) return { statut: 200, corps: o.entreprises ?? ENTREPRISES };
  return { statut: 404, corps: {} };
};

const laisser = async (n = 6) => {
  for (let i = 0; i < n; i += 1) {
    await cliquer(document.body);
    // Laisse passer une tâche : jsdom signale `hashchange` de façon asynchrone.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const ouvrir = async () => {
  const pont = installerPont("/RNO/atelier/organigramme");
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await laisser();
  return { c: rendu.conteneur, pont };
};

const textes = (e: ParentNode, s: string) => Array.from(e.querySelectorAll(s)).map((x) => x.textContent);
const noeud = (c: ParentNode, nom: string) => {
  const trouve = Array.from(c.querySelectorAll<HTMLElement>(".atl-car-noeud")).find((e) => e.querySelector(".atl-car-nom")?.textContent === nom);
  if (!trouve) throw new Error(`Nœud introuvable : ${nom}`);
  return trouve;
};
const touche = async (el: Element, key: string) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};
const doubleClic = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
};
const focaliser = async (el: HTMLElement) => {
  await act(async () => {
    el.focus();
  });
};
const onglet = (c: ParentNode, libelle: string) => parTexte(c, '[role="tab"]', libelle);
/** Échelle et translation du plan de la carte, lues sur sa transformation CSS. */
const vueActuelle = (c: ParentNode) => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/u.exec(c.querySelector<HTMLElement>(".atl-car-plan")!.style.transform);
  if (!m) throw new Error("Pas de transformation sur le plan");
  return { x: Number(m[1]), y: Number(m[2]), echelle: Number(m[3]) };
};
const pointeur = async (el: Element, type: string, x: number, y: number) => {
  await act(async () => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, "pointerId", { value: 1 });
    el.dispatchEvent(e);
  });
};
const boutonZoom = (c: ParentNode, libelle: string) => c.querySelector<HTMLElement>(`.atl-car-commandes button[aria-label="${libelle}"]`)!;

/** Jeu réel en miniature : 28 services, 218 agents dont un coordinateur (rôle ceo) par service. */
function grandJeu() {
  const ids = Array.from({ length: 28 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  const departements = ids.map((id, i) => declare(id, i === 0 ? "direction" : `service${i}`, i === 0 ? "Direction" : `Service ${i}`, { estDirection: i === 0, courant: i === 1 }));
  const entreprises = ids.map((id, i) => ({ id, name: `Fictive SA · ${i}`, issuePrefix: `P${i}` }));
  const agentsParService: Record<string, unknown[]> = {};
  let n = 0;
  ids.forEach((id, i) => {
    const nb = i < 22 ? 8 : 7; // 22 x 8 + 6 x 7 = 218
    const liste = [ag(`c${i}`, i === 0 ? "Coordinateur général" : `Coordinateur ${i}`, { role: "ceo" })];
    for (let k = 1; k < nb; k += 1) {
      n += 1;
      liste.push(ag(`a${i}-${k}`, `Agent numéro ${n}`, { reportsTo: k === 3 ? `a${i}-2` : `c${i}` }));
    }
    agentsParService[id] = liste;
  });
  return { departements, entreprises, agentsParService, ids };
}


describe("entrée de menu", () => {
  it("lien « Organigramme » sous « Départements » pour un client à plusieurs services", async () => {
    serveur = servir();
    installerPont("/RNO/atelier/accueil");
    rendu = await rendre(createElement(EntreeAtelier, { context: contexte }));
    await laisser();
    expect(textes(rendu.conteneur, "a.atl-entree").map((t) => t?.trim())).toEqual(["Atelier", "Départements", "Organigramme"]);
    expect(parTexte(rendu.conteneur, "a.atl-entree", "Organigramme").getAttribute("href")).toContain("/RNO/atelier/organigramme");
  });

  it("absent pour un client à un seul service", async () => {
    serveur = servir({ departements: [TROIS[2]!] });
    installerPont("/RNO/atelier/accueil");
    rendu = await rendre(createElement(EntreeAtelier, { context: contexte }));
    await laisser();
    expect(textes(rendu.conteneur, "a.atl-entree").join(" ")).not.toContain("Organigramme");
  });
});


describe("carte des services", () => {
  it("lit les agents de chaque service avec le companyId de SON service, dessine le général, un nœud par service et l'ellipse ; aucun rayon au repos", async () => {
    serveur = servir({ aTraiter: { [JUR]: 2 } });
    const { c } = await ouvrir();
    const lus = appels.filter((u) => /\/agents/u.test(u)).map((u) => /companies\/([^/]+)\/agents/u.exec(u)![1]).sort();
    expect(lus).toEqual([DIR, JUR, ENTREPRISE].sort());
    expect(textes(c, ".atl-car-noeud .atl-car-nom").sort()).toEqual(["Direction", "Juridique", "Marketing"]);
    expect(noeud(c, "Juridique").querySelector(".atl-car-agents")?.textContent).toBe("3 agents");
    expect(noeud(c, "Marketing").querySelector(".atl-car-agents")?.textContent).toBe("1 agent");
    expect(noeud(c, "Juridique").textContent).toContain("À traiter");
    expect(noeud(c, "Marketing").textContent).not.toContain("À traiter");
    expect(c.querySelector(".atl-car-general")?.textContent).toContain("Coordinateur général");
    // Au repos : l'ellipse en trait fin, aucun des rayons du général, aucun panneau vide.
    expect(c.querySelectorAll("ellipse.atl-car-anneau")).toHaveLength(1);
    expect(c.querySelectorAll(".atl-car-hierarchie")).toHaveLength(0);
    expect(c.querySelector(".atl-car-panneau")).toBeNull();
    expect(c.querySelector(".atl-car-note")?.textContent).toContain("Cliquez un service pour voir ses échanges ; double-cliquez pour l'ouvrir.");
    expect(c.textContent).toContain("Tous les coordinateurs peuvent aussi se parler entre eux et avec le Coordinateur général.");
    // Aucun agent n'est dessiné sur la carte.
    expect(c.textContent).not.toContain("Veille légale");
  });

  it("survol ou focus du Coordinateur général : un rayon par service, qui disparaît au départ ; un clic les épingle", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const general = c.querySelector<HTMLElement>(".atl-car-general")!;
    await focaliser(general);
    expect(c.querySelectorAll("path.atl-car-hierarchie")).toHaveLength(3);
    await act(async () => general.blur());
    expect(c.querySelectorAll(".atl-car-hierarchie")).toHaveLength(0);
    await cliquer(general);
    expect(general.getAttribute("aria-pressed")).toBe("true");
    await act(async () => general.blur());
    expect(c.querySelectorAll("path.atl-car-hierarchie")).toHaveLength(3);
    await cliquer(general);
    expect(c.querySelectorAll(".atl-car-hierarchie")).toHaveLength(0);
  });

  it("28 services et 218 agents : 28 nœuds, aucune flèche au repos, pas de chevauchement de position", async () => {
    const jeu = grandJeu();
    serveur = servir({ departements: jeu.departements, entreprises: jeu.entreprises, agentsParService: jeu.agentsParService, flux: [] });
    const { c } = await ouvrir();
    await laisser(12);
    expect(c.querySelectorAll(".atl-car-noeud")).toHaveLength(28);
    expect(c.querySelectorAll(".atl-car-fleche")).toHaveLength(0);
    expect(c.querySelectorAll(".atl-car-apercu")).toHaveLength(0);
    expect(c.querySelectorAll(".atl-car-carte-agent, .atl-orgs-carte")).toHaveLength(0);
    const positions = Array.from(c.querySelectorAll<HTMLElement>(".atl-car-noeud")).map((e) => `${e.style.left}|${e.style.top}`);
    expect(new Set(positions).size).toBe(28);
    expect(c.querySelector("#atl-org-titre")?.textContent).toContain("Organigramme");
    expect(c.querySelector("header")?.textContent).toContain("218 agents");
  });

  it("le survol (focus) d'un nœud montre un aperçu léger de ses liaisons métier, sans sélection ni flèche", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await focaliser(noeud(c, "Marketing"));
    expect(c.querySelectorAll(".atl-car-apercu").length).toBeGreaterThan(0);
    expect(c.querySelectorAll(".atl-car-fleche")).toHaveLength(0);
    expect(noeud(c, "Marketing").getAttribute("aria-pressed")).toBe("false");
    await act(async () => noeud(c, "Marketing").blur());
    expect(c.querySelectorAll(".atl-car-apercu")).toHaveLength(0);
  });

  it("un clic sélectionne : flèches pleines (sortant) et pointillées (entrant), partenaires en avant, autres atténués, panneau des liaisons", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await cliquer(noeud(c, "Marketing"));
    expect(noeud(c, "Marketing").getAttribute("aria-pressed")).toBe("true");
    const fleches = Array.from(c.querySelectorAll<SVGGElement>(".atl-car-fleche"));
    expect(fleches.map((f) => f.dataset["sens"]).sort()).toEqual(["entrant", "sortant"]);
    for (const f of fleches) {
      expect(f.querySelector("path.atl-car-courbe")?.getAttribute("d")).toMatch(/^M/u);
      expect(f.querySelector("path.atl-car-tete")?.getAttribute("transform")).toMatch(/rotate/u);
    }
    expect(noeud(c, "Juridique").dataset["relie"]).toBe("true");
    expect(noeud(c, "Direction").dataset["estompe"]).toBe("true");
    expect(noeud(c, "Direction").dataset["relie"]).toBeUndefined();
    const panneau = c.querySelector(".atl-car-panneau")!;
    expect(panneau.querySelector("h2")?.textContent).toBe("Marketing");
    expect(panneau.textContent).toContain("1 service relié");
    const vers = panneau.querySelector('[data-sens="sortant"]')!;
    const depuis = panneau.querySelector('[data-sens="entrant"]')!;
    expect(vers.textContent).toContain("Vers");
    expect(vers.textContent).toContain("Relecture légale");
    expect(vers.textContent).not.toContain("approbation humaine");
    expect(depuis.textContent).toContain("Depuis");
    expect(depuis.textContent).toContain("Avis sur une mention");
    expect(depuis.textContent).toContain("approbation humaine");
    // Le nom du partenaire est cliquable : il devient la sélection.
    await cliquer(parTexte(panneau, "button.atl-car-nom-partenaire", "Juridique"));
    expect(c.querySelector(".atl-car-panneau h2")?.textContent).toBe("Juridique");
    expect(noeud(c, "Juridique").getAttribute("aria-pressed")).toBe("true");
    // Juridique a trois partenaires possibles dans le jeu : Marketing (aller et retour) et Direction (entrant).
    expect(c.querySelectorAll(".atl-car-fleche")).toHaveLength(3);
  });

  it("Échap désélectionne ; le bouton du panneau aussi", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await cliquer(noeud(c, "Marketing"));
    expect(c.querySelectorAll(".atl-car-fleche").length).toBeGreaterThan(0);
    await touche(document.body, "Escape");
    expect(c.querySelectorAll(".atl-car-fleche")).toHaveLength(0);
    expect(c.querySelector("[data-selection]")).toBeNull();
    expect(c.querySelector(".atl-car-panneau h2")).toBeNull();
    await cliquer(noeud(c, "Marketing"));
    await cliquer(parTexte(c, ".atl-car-panneau button", "Fermer"));
    expect(c.querySelector("[data-selection]")).toBeNull();
  });

  it("le réseau des coordinateurs n'est jamais tracé : un flux de coordinateurs ne crée aucune flèche", async () => {
    const reseau: FluxServiceLu[] = [{ source: "marketing", cible: "direction", objet: "Liaison entre coordinateurs", approbationHumaine: false, origine: "coordinateurs" }];
    serveur = servir({ flux: reseau });
    const { c } = await ouvrir();
    await cliquer(noeud(c, "Marketing"));
    expect(c.querySelectorAll(".atl-car-fleche")).toHaveLength(0);
    expect(c.querySelector(".atl-car-panneau")?.textContent).toContain("aucune liaison métier");
  });

  it("double-clic ou « Ouvrir le service » : vue du service, adresse avec #service=", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await doubleClic(noeud(c, "Juridique"));
    await laisser();
    expect(window.location.hash).toBe("#service=juridique");
    expect(c.querySelector('section[aria-label="Service Juridique"]')).not.toBeNull();
    expect(c.querySelector(".atl-car")).toBeNull();
    expect(c.textContent).toContain("Veille légale");
    await cliquer(parTexte(c, ".atl-orgs-fil button", "Organigramme"));
    await laisser();
    expect(c.querySelector(".atl-car")).not.toBeNull();
    await cliquer(noeud(c, "Direction"));
    await cliquer(parTexte(c, ".atl-car-panneau button", "Ouvrir le service"));
    await laisser();
    expect(window.location.hash).toBe("#service=direction");
  });

  it("la sélection est gardée quand on ouvre un service puis qu'on revient", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await cliquer(noeud(c, "Marketing"));
    await cliquer(parTexte(c, ".atl-car-panneau button", "Ouvrir le service"));
    await laisser();
    await cliquer(parTexte(c, ".atl-orgs-fil button", "Organigramme"));
    await laisser();
    expect(noeud(c, "Marketing").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("carte : toile, zoom, déplacement et tiroir", () => {
  it("en-tête compact : titre et décompte à gauche, recherche et commutateur Carte / Matrice à droite, libellé de la recherche en aria-label", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const tete = c.querySelector(".atl-org-tete")!;
    expect(tete.querySelector("h1")?.textContent).toBe("Organigramme");
    expect(tete.querySelector(".atl-org-compte")?.textContent).toBe("3 services · 6 agents");
    const outils = tete.querySelector(".atl-org-outils")!;
    const champ = outils.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(champ.getAttribute("aria-label")).toBe("Chercher un agent ou un service");
    expect(outils.querySelector("label")).toBeNull();
    expect(Array.from(outils.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(["Carte", "Matrice"]);
    // Un seul rang avant la carte : la zone suit directement l'en-tête.
    expect(tete.nextElementSibling?.id).toBe("atl-org-titre");
  });

  it("la zone occupe la hauteur de la fenêtre moins 1 rem ; à l'ouverture la carte est ajustée à l'écran (échelle de 0,4 à 1)", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const zone = c.querySelector<HTMLElement>(".atl-car-zone")!;
    expect(zone.style.height).toBe(`${window.innerHeight - 16}px`);
    const ouverture = vueActuelle(c);
    expect(ouverture.echelle).toBeGreaterThanOrEqual(0.4);
    expect(ouverture.echelle).toBeLessThanOrEqual(1);
    expect(c.querySelector(".atl-car-echelle")?.textContent).toBe(`${Math.round(ouverture.echelle * 100)} %`);
  });

  it("légende en surimpression (trois échantillons) et commandes de 44 px avec leur aria-label", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const legende = c.querySelector(".atl-car-legende")!;
    expect(legende.querySelectorAll("p")).toHaveLength(3);
    expect(legende.textContent).toContain("Plein : demandes envoyées");
    expect(legende.textContent).toContain("Pointillé : demandes reçues");
    expect(legende.querySelectorAll("p")[2]?.textContent).toBe("approbation humaine exigée");
    expect(Array.from(c.querySelectorAll(".atl-car-commandes button")).map((b) => b.getAttribute("aria-label"))).toEqual(["Zoom avant", "Zoom arrière", "Ajuster à l'écran"]);
    expect(STYLES_ORGANIGRAMME).toMatch(/\.atl-car-commande \{[^}]*width: 2\.75rem; height: 2\.75rem/u);
  });

  it("boutons : + et - zooment de 25 % autour du centre, bornés de 0,3 à 2,5, Ajuster revient à l'ouverture, sans redessiner les nœuds", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const premier = c.querySelector(".atl-car-noeud")!;
    const ouverture = vueActuelle(c);
    await cliquer(boutonZoom(c, "Zoom avant"));
    expect(vueActuelle(c).echelle).toBeCloseTo(ouverture.echelle * 1.25, 3);
    await cliquer(boutonZoom(c, "Zoom arrière"));
    await cliquer(boutonZoom(c, "Zoom arrière"));
    expect(vueActuelle(c).echelle).toBeLessThan(ouverture.echelle);
    for (let i = 0; i < 20; i += 1) await cliquer(boutonZoom(c, "Zoom avant"));
    expect(vueActuelle(c).echelle).toBeCloseTo(2.5, 5);
    for (let i = 0; i < 30; i += 1) await cliquer(boutonZoom(c, "Zoom arrière"));
    expect(vueActuelle(c).echelle).toBeCloseTo(0.3, 5);
    await cliquer(boutonZoom(c, "Ajuster à l'écran"));
    expect(vueActuelle(c)).toEqual(ouverture);
    expect(c.querySelector(".atl-car-noeud")).toBe(premier);
  });

  it("glisser déplace la carte ; le clic qui suit n'active aucun nœud, sans minuterie ; un petit mouvement reste un clic", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const vue = c.querySelector<HTMLElement>(".atl-car-vue")!;
    const depart = vueActuelle(c);
    await pointeur(vue, "pointerdown", 100, 100);
    await pointeur(vue, "pointermove", 160, 130);
    await pointeur(vue, "pointerup", 160, 130);
    const apres = vueActuelle(c);
    expect(apres.x).toBeCloseTo(depart.x + 60, 3);
    expect(apres.y).toBeCloseTo(depart.y + 30, 3);
    expect(apres.echelle).toBe(depart.echelle);
    // Le clic qui suit le glissement n'active pas le nœud situé sous le pointeur.
    await cliquer(noeud(c, "Marketing"));
    expect(noeud(c, "Marketing").getAttribute("aria-pressed")).toBe("false");
    // Prochain appui : le drapeau est effacé, un clic normal sélectionne.
    await pointeur(vue, "pointerdown", 10, 10);
    await pointeur(vue, "pointermove", 12, 11);
    await pointeur(vue, "pointerup", 12, 11);
    expect(vueActuelle(c)).toEqual(apres);
    await cliquer(noeud(c, "Marketing"));
    expect(noeud(c, "Marketing").getAttribute("aria-pressed")).toBe("true");
  });

  it("molette (sans Ctrl) : zoom autour du pointeur, page non défilée ; clavier : flèches déplacent, + et - zooment, 0 ajuste", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const vue = c.querySelector<HTMLElement>(".atl-car-vue")!;
    const ouverture = vueActuelle(c);
    const molette = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 300, clientY: 200 });
    await act(async () => void vue.dispatchEvent(molette));
    expect(molette.defaultPrevented).toBe(true);
    const zoome = vueActuelle(c);
    expect(zoome.echelle).toBeGreaterThan(ouverture.echelle);
    // Le point sous le pointeur reste fixe : (px - x) / echelle est inchangé.
    expect((300 - zoome.x) / zoome.echelle).toBeCloseTo((300 - ouverture.x) / ouverture.echelle, 3);
    await touche(vue, "ArrowLeft");
    expect(vueActuelle(c).x).toBeCloseTo(zoome.x + 80, 3);
    await touche(vue, "ArrowDown");
    expect(vueActuelle(c).y).toBeCloseTo(zoome.y - 80, 3);
    const e0 = vueActuelle(c).echelle;
    await touche(vue, "+");
    expect(vueActuelle(c).echelle).toBeGreaterThan(e0);
    await touche(vue, "-");
    expect(vueActuelle(c).echelle).toBeCloseTo(e0, 5);
    await touche(vue, "0");
    expect(vueActuelle(c)).toEqual(ouverture);
    expect(vue.getAttribute("tabindex")).toBe("0");
    expect(vue.getAttribute("aria-label")).toContain("zoomer");
  });

  it("le tiroir n'existe qu'avec un service choisi, flotte dans la carte (Fermer, Échap) et la vue se décale pour garder le service visible hors du tiroir", async () => {
    const jeu = grandJeu();
    serveur = servir({ departements: jeu.departements, entreprises: jeu.entreprises, agentsParService: jeu.agentsParService, flux: [] });
    const { c } = await ouvrir();
    await laisser(12);
    expect(c.querySelector(".atl-car-tiroir")).toBeNull();
    // Le nœud le plus à droite à l'ouverture : il serait sous le tiroir.
    const noeuds = Array.from(c.querySelectorAll<HTMLElement>(".atl-car-noeud"));
    const droite = noeuds.reduce((m, e) => (parseFloat(e.style.left) > parseFloat(m.style.left) ? e : m));
    await cliquer(droite);
    const tiroir = c.querySelector(".atl-car-zone > .atl-car-tiroir");
    expect(tiroir).not.toBeNull();
    expect(c.querySelector(".atl-car-zone")?.getAttribute("data-tiroir")).toBe("ouvert");
    const v = vueActuelle(c);
    const bordDroit = (parseFloat(droite.style.left) + parseFloat(droite.style.width)) * v.echelle + v.x;
    const largeurZone = 1100; // largeur supposée sans mise en page (jsdom)
    expect(bordDroit).toBeLessThanOrEqual(largeurZone - 352 - 12);
    await touche(document.body, "Escape");
    expect(c.querySelector(".atl-car-tiroir")).toBeNull();
    expect(c.querySelector(".atl-car-zone")?.getAttribute("data-tiroir")).toBeNull();
  });

  it("nœuds non liés à la sélection estompés à 35 % (contenu), partenaires et service choisi en pleine intensité (styles)", () => {
    expect(STYLES_ORGANIGRAMME).toMatch(/\.atl-car-noeud\[data-estompe\] > \* \{ opacity: 0\.35;/u);
    expect(STYLES_ORGANIGRAMME).not.toMatch(/\.atl-car-noeud\[data-(relie|selection)\][^}]*opacity/u);
  });
});

describe("recherche", () => {
  it("un agent trouvé ouvre la vue de son service avec l'agent mis en évidence (clavier : bas, Entrée)", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const champ = c.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await saisir(champ, "veille");
    const options = Array.from(c.querySelectorAll('[role="option"]'));
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain("Veille légale");
    expect(options[0]!.textContent).toContain("Juridique");
    expect(champ.getAttribute("aria-expanded")).toBe("true");
    await touche(champ, "Enter");
    await laisser();
    expect(window.location.hash).toBe("#service=juridique&agent=j3");
    expect(c.querySelector('section[aria-label="Service Juridique"]')).not.toBeNull();
    expect(c.querySelector('[data-agent="j3"]')?.getAttribute("data-mis-en-evidence")).toBe("true");
    expect(c.querySelector<HTMLInputElement>('input[role="combobox"]')!.value).toBe("");
  });

  it("un service trouvé ouvre sa vue ; flèches haut et bas parcourent les résultats, huit au plus", async () => {
    const jeu = grandJeu();
    serveur = servir({ departements: jeu.departements, entreprises: jeu.entreprises, agentsParService: jeu.agentsParService, flux: [] });
    const { c } = await ouvrir();
    await laisser(12);
    const champ = c.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await saisir(champ, "agent numéro");
    const options = () => Array.from(c.querySelectorAll('[role="option"]'));
    expect(options()).toHaveLength(8);
    expect(options()[0]!.getAttribute("aria-selected")).toBe("true");
    await touche(champ, "ArrowDown");
    expect(options()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(champ.getAttribute("aria-activedescendant")).toBe(options()[1]!.id);
    await touche(champ, "ArrowUp");
    await touche(champ, "ArrowUp");
    expect(options()[7]!.getAttribute("aria-selected")).toBe("true");
    await saisir(champ, "service 5");
    await cliquer(options().find((o) => o.textContent?.startsWith("Service 5"))!);
    await laisser();
    expect(window.location.hash).toBe("#service=service5");
    expect(c.querySelector('section[aria-label="Service Service 5"]')).not.toBeNull();
  });

  it("aucun résultat : message ; Échap vide le champ", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const champ = c.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    await saisir(champ, "introuvable-xyz");
    expect(c.querySelector("#atl-org-resultats")?.textContent).toContain("Aucun agent ni service ne correspond");
    await touche(champ, "Escape");
    expect(c.querySelector<HTMLInputElement>('input[role="combobox"]')!.value).toBe("");
    expect(c.querySelector("#atl-org-resultats")).toBeNull();
  });
});

describe("onglets et adresse", () => {
  it("onglets Carte | Matrice accessibles ; la matrice s'affiche et l'adresse porte #vue=matrice", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    expect(c.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Affichage de l'organigramme");
    expect(textes(c, '[role="tab"]')).toEqual(["Carte", "Matrice"]);
    expect(onglet(c, "Carte").getAttribute("aria-selected")).toBe("true");
    await cliquer(onglet(c, "Matrice"));
    await laisser();
    expect(window.location.hash).toBe("#vue=matrice");
    expect(onglet(c, "Matrice").getAttribute("aria-selected")).toBe("true");
    expect(c.querySelector(".atl-mx")).not.toBeNull();
    expect(c.querySelector(".atl-car")).toBeNull();
    // Depuis la matrice, ouvrir un service puis revenir ramène à la matrice.
    await cliquer(parTexte(c, ".atl-mx button", "Juridique"));
    await laisser();
    expect(window.location.hash).toContain("service=juridique");
    await cliquer(parTexte(c, ".atl-orgs-fil button", "Organigramme"));
    await laisser();
    expect(window.location.hash).toBe("#vue=matrice");
    expect(c.querySelector(".atl-mx")).not.toBeNull();
    await cliquer(onglet(c, "Carte"));
    await laisser();
    expect(c.querySelector(".atl-car")).not.toBeNull();
  });

  it("le rechargement avec #service=… rouvre le service ; #vue=matrice rouvre la matrice", async () => {
    window.location.hash = "service=juridique";
    serveur = servir();
    const a = await ouvrir();
    expect(a.c.querySelector('section[aria-label="Service Juridique"]')).not.toBeNull();
    expect(a.c.querySelector('[role="tablist"]')).toBeNull();
    rendu?.demonter();
    rendu = null;
    window.location.hash = "vue=matrice";
    const b = await ouvrir();
    expect(b.c.querySelector(".atl-mx")).not.toBeNull();
  });

  it("un service inconnu dans l'adresse retombe sur la carte", async () => {
    window.location.hash = "service=inexistant";
    serveur = servir();
    const { c } = await ouvrir();
    expect(c.querySelector(".atl-car")).not.toBeNull();
  });
});

describe("téléphone (640 px et moins)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("la carte devient la liste des services ; « Voir les liens » déplie les partenaires", async () => {
    serveur = servir({ aTraiter: { [JUR]: 1 } });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));
    const { c } = await ouvrir();
    expect(c.querySelector(".atl-car-scene")).toBeNull();
    const lignes = Array.from(c.querySelectorAll<HTMLElement>(".atl-car-ligne"));
    expect(lignes.map((l) => l.querySelector(".atl-car-nom")?.textContent)).toEqual(["Direction", "Juridique", "Marketing"]);
    expect(lignes[1]!.textContent).toContain("À traiter");
    const voir = parTexte(lignes[2]!, "button", "Voir les liens");
    expect(voir.getAttribute("aria-expanded")).toBe("false");
    await cliquer(voir);
    const marketing = c.querySelector<HTMLElement>('.atl-car-ligne[data-service="marketing"]')!;
    expect(parTexte(marketing, "button", "Masquer les liens").getAttribute("aria-expanded")).toBe("true");
    expect(marketing.querySelector(".atl-car-partenaires")?.textContent).toContain("Juridique");
    expect(marketing.textContent).toContain("Relecture légale");
    await cliquer(parTexte(marketing, "button", "Ouvrir le service"));
    await laisser();
    expect(window.location.hash).toBe("#service=marketing");
  });
});

describe("états d'erreur", () => {
  it("un service en panne n'empêche pas les autres : « Agents indisponibles », puis relecture depuis sa vue", async () => {
    serveur = servir({ agentsParService: { ...AGENTS, [JUR]: "panne" } });
    const { c } = await ouvrir();
    expect(noeud(c, "Juridique").textContent).toContain("Agents indisponibles");
    expect(noeud(c, "Marketing").textContent).toContain("1 agent");
    await doubleClic(noeud(c, "Juridique"));
    await laisser();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Lecture impossible des agents de Juridique");
    serveur = servir();
    await cliquer(parTexte(c, '[role="alert"] button', "Réessayer"));
    await laisser();
    expect(c.querySelector('section[aria-label="Service Juridique"]')).not.toBeNull();
  });

  it("flux indisponibles : message, la carte fonctionne sans flèche, nouvel essai possible", async () => {
    serveur = servir({ flux: "panne" });
    const { c } = await ouvrir();
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Liaisons indisponibles");
    await cliquer(noeud(c, "Marketing"));
    expect(c.querySelectorAll(".atl-car-fleche")).toHaveLength(0);
    serveur = servir();
    await cliquer(parTexte(c, '[role="alert"] button', "Réessayer"));
    await laisser();
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(c.querySelectorAll(".atl-car-fleche").length).toBeGreaterThan(0);
  });

  it("erreur de la liste des services : état d'erreur avec nouvel essai", async () => {
    serveur = () => ({ statut: 500, corps: { error: "panne" } });
    const { c } = await ouvrir();
    expect(c.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("aucun tiret cadratin dans la vue", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    expect(c.textContent).not.toContain("—");
    await cliquer(noeud(c, "Marketing"));
    expect(c.textContent).not.toContain("—");
  });
});
