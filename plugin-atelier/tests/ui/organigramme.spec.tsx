// @vitest-environment jsdom
/**
 * Vue « Organigramme » dessinée, interface : entrée de menu, agents lus par service avec le companyId de SON service, plan
 * reportsTo, zoom et déplacement, filtre, lien vers la fiche d'un agent, service choisi avec voisins
 * surlignés et flux listés, états d'erreur. Routes du plugin et API de l'hôte servies par un `fetch` simulé.
 */
import { createElement } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementDeclare, FluxServiceLu } from "../../src/contrats/departements.js";
import { EntreeAtelier, PageAtelier } from "../../src/ui/index.js";
import { STYLES_ORGANIGRAMME } from "../../src/ui/styles-organigramme.js";
import { disposerOrganigramme, transformationAjustee } from "../../src/ui/organigramme-disposition.js";
import { oublierDepartements } from "../../src/ui/departements-sonde.js";
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
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const servir = (o: { departements?: DepartementDeclare[]; flux?: FluxServiceLu[] | "panne"; agentsParService?: Record<string, unknown[] | "panne">; entreprises?: unknown[] } = {}) => (url: string) => {
  const parService = o.agentsParService ?? AGENTS;
  const m = /\/api\/companies\/([^/?]+)\/agents/u.exec(url);
  if (m) {
    const a = parService[decodeURIComponent(m[1]!)];
    return a === "panne" || a === undefined ? { statut: 500, corps: { error: "hôte injoignable" } } : { statut: 200, corps: a };
  }
  if (url.includes("/services/flux?companyId=")) return o.flux === "panne" ? { statut: 500, corps: { error: "flux en panne" } } : { statut: 200, corps: { client: "fictive-sa", flux: o.flux ?? FLUX } };
  if (url.includes("/departements?companyId=")) return { statut: 200, corps: { client: "fictive-sa", departements: o.departements ?? TROIS } };
  if (url.endsWith("/api/companies")) return { statut: 200, corps: o.entreprises ?? ENTREPRISES };
  return { statut: 404, corps: {} };
};

const laisser = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await cliquer(document.body);
};
const ouvrir = async () => {
  const pont = installerPont("/RNO/atelier/organigramme");
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await laisser();
  return { c: rendu.conteneur, pont };
};
const carte = (c: HTMLElement, nom: string) => {
  const trouvee = Array.from(c.querySelectorAll<HTMLElement>(".atl-org-service")).find((e) => e.querySelector(".atl-org-nom")?.textContent === nom);
  if (!trouvee) throw new Error(`Service introuvable : ${nom}`);
  return trouvee;
};
const textes = (e: ParentNode, s: string) => Array.from(e.querySelectorAll(s)).map((x) => x.textContent);
/** Échelle et translation du plan, lues sur sa transformation CSS. */
const vueActuelle = (c: HTMLElement) => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/u.exec(c.querySelector<HTMLElement>(".atl-org-plan")!.style.transform);
  if (!m) throw new Error("Pas de transformation sur le plan");
  return { x: Number(m[1]), y: Number(m[2]), echelle: Number(m[3]) };
};
const bouton = (c: HTMLElement, libelle: string) => c.querySelector<HTMLElement>(`button[aria-label="${libelle}"]`)!;
const pointeur = async (el: Element, type: string, x: number, y: number) => {
  await act(async () => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, "pointerId", { value: 1 });
    el.dispatchEvent(e);
  });
};
const toucheClavier = async (el: Element, key: string) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};
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

describe("vue « Organigramme »", () => {
  it("lit les agents de chaque service avec le companyId de SON service et dessine le général, une carte par service et un trait vers chacune", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const lus = appels.filter((u) => /\/agents/u.test(u)).map((u) => /companies\/([^/]+)\/agents/u.exec(u)![1]).sort();
    expect(lus).toEqual([DIR, JUR, ENTREPRISE].sort());
    expect(textes(c, ".atl-org-service .atl-org-nom")).toEqual(["Direction", "Juridique", "Marketing"]);
    expect(carte(c, "Juridique").querySelector(".atl-org-compteur")?.textContent).toBe("3 agents");
    expect(carte(c, "Juridique").querySelector(".atl-org-coord")?.textContent).toContain("Coordinateur juridique");
    expect(c.querySelector(".atl-org-carte-general")?.textContent).toContain("Coordinateur général");
    expect(c.querySelector("svg.atl-org-traits path")?.getAttribute("d")).toMatch(/^M/u);
    const legende = c.querySelector(".atl-org-legende")?.textContent ?? "";
    expect(legende).toBe("Chaque service est relié au Coordinateur général par les échanges entre services.");
    expect(legende).not.toMatch(/Paperclip|entreprises/u);
    // Longueur de ligne bornée à 75 caractères au plus.
    expect(Number(/\.atl-org-legende \{[^}]*max-width: (\d+)ch/u.exec(STYLES_ORGANIGRAMME)![1])).toBeLessThanOrEqual(75);
    // Un cadre par service, derrière les cartes.
    expect(c.querySelectorAll(".atl-org-cadre")).toHaveLength(3);
  });

  it("agents empilés sous leur coordinateur avec retrait par niveau, statuts en texte et lien vers la fiche dans le socle", async () => {
    serveur = servir();
    const { c, pont } = await ouvrir();
    const cartes = Array.from(c.querySelectorAll<HTMLElement>(".atl-org-carte-agent"));
    const de = (nom: string) => cartes.find((k) => k.textContent?.includes(nom))!;
    const gauche = (k: HTMLElement) => Number.parseFloat(k.style.left);
    const haut = (k: HTMLElement) => Number.parseFloat(k.style.top);
    expect(de("Contrats").textContent).toContain("en erreur");
    expect(gauche(de("Veille légale"))).toBeGreaterThan(gauche(de("Contrats")));
    expect(haut(de("Veille légale"))).toBeGreaterThan(haut(de("Contrats")));
    expect(carte(c, "Juridique").textContent).toContain("en pause");
    await cliquer(parTexte(c, "a.atl-org-agent-lien", "Veille légale"));
    expect(pont.navigations).toContain("/RNOAC/agents/j3");
  });

  it("28 services et 218 agents : 28 cartes de coordinateur, 190 cartes d'agents, chacun une seule fois", async () => {
    const jeu = grandJeu();
    serveur = servir({ departements: jeu.departements, entreprises: jeu.entreprises, agentsParService: jeu.agentsParService, flux: [] });
    const { c } = await ouvrir();
    await laisser(12);
    expect(c.querySelectorAll(".atl-org-carte-service")).toHaveLength(28);
    const agents = Array.from(c.querySelectorAll<HTMLAnchorElement>(".atl-org-carte-agent a.atl-org-agent-lien"));
    expect(agents).toHaveLength(190);
    expect(new Set(agents.map((a) => a.textContent)).size).toBe(190);
    expect(c.querySelectorAll(".atl-org-coord a")).toHaveLength(28);
    expect(c.querySelector(".atl-org-carte-general")?.textContent).toContain("Coordinateur général");
    expect(c.querySelector(".atl-org-vue")?.textContent).toContain("Agent numéro 190");
    expect(c.querySelector(".atl-org-carte-general")?.textContent).toContain("actif");
  });

  it("boutons de zoom : plus, moins et ajuster à l'écran, sans redessiner les cartes", async () => {
    const jeu = grandJeu();
    serveur = servir({ departements: jeu.departements, entreprises: jeu.entreprises, agentsParService: jeu.agentsParService, flux: [] });
    const { c } = await ouvrir();
    await laisser(12);
    const premiereCarte = c.querySelector(".atl-org-carte-agent")!;
    // Ouverture lisible (au moins 0,6), pas « tout faire tenir ».
    const ajustee = vueActuelle(c);
    expect(ajustee.echelle).toBeGreaterThanOrEqual(0.6);
    expect(ajustee.echelle).toBeLessThan(1);
    await cliquer(bouton(c, "Zoom avant"));
    const avant = vueActuelle(c);
    expect(avant.echelle).toBeCloseTo(ajustee.echelle * 1.25, 3);
    await cliquer(bouton(c, "Zoom arrière"));
    await cliquer(bouton(c, "Zoom arrière"));
    expect(vueActuelle(c).echelle).toBeLessThan(ajustee.echelle);
    await cliquer(bouton(c, "Ajuster à l'écran"));
    const plan = c.querySelector<HTMLElement>(".atl-org-plan")!;
    const entier = transformationAjustee({ largeur: Number.parseFloat(plan.style.width), hauteur: Number.parseFloat(plan.style.height) }, 1000, 600);
    expect(vueActuelle(c)).toEqual({ x: entier.x, y: entier.y, echelle: entier.echelle });
    expect(vueActuelle(c).echelle).toBeLessThan(ajustee.echelle);
    expect(vueActuelle(c).echelle).toBeGreaterThan(0.1);
    // Les cartes sont les mêmes éléments du DOM : aucun rendu pendant le zoom.
    expect(c.querySelector(".atl-org-carte-agent")).toBe(premiereCarte);
  });

  it("glisser déplace le plan, un clic reste un clic, les flèches déplacent et + / - / 0 zooment", async () => {
    serveur = servir();
    const { c, pont } = await ouvrir();
    const vue = c.querySelector<HTMLElement>(".atl-org-vue")!;
    const depart = vueActuelle(c);
    await pointeur(vue, "pointerdown", 100, 100);
    await pointeur(vue, "pointermove", 160, 130);
    await pointeur(vue, "pointerup", 160, 130);
    const apres = vueActuelle(c);
    expect(apres.x).toBeCloseTo(depart.x + 60, 3);
    expect(apres.y).toBeCloseTo(depart.y + 30, 3);
    expect(apres.echelle).toBe(depart.echelle);
    // Le clic qui suit le glissement n'active pas le lien situé sous le pointeur.
    await act(async () => {
      parTexte(c, "a.atl-org-agent-lien", "Veille légale").click();
    });
    expect(pont.navigations).not.toContain("/RNOAC/agents/j3");
    // Un petit mouvement (sous le seuil) ne déplace rien.
    await new Promise((r) => setTimeout(r, 5));
    await pointeur(vue, "pointerdown", 10, 10);
    await pointeur(vue, "pointermove", 12, 11);
    await pointeur(vue, "pointerup", 12, 11);
    expect(vueActuelle(c)).toEqual(apres);
    await toucheClavier(vue, "ArrowLeft");
    expect(vueActuelle(c).x).toBe(apres.x + 80);
    await toucheClavier(vue, "ArrowDown");
    expect(vueActuelle(c).y).toBe(apres.y - 80);
    const e0 = vueActuelle(c).echelle;
    await toucheClavier(vue, "+");
    expect(vueActuelle(c).echelle).toBeGreaterThan(e0);
    await toucheClavier(vue, "-");
    expect(vueActuelle(c).echelle).toBeCloseTo(e0, 5);
    await toucheClavier(vue, "0");
    const plan = c.querySelector<HTMLElement>(".atl-org-plan")!;
    const entier = transformationAjustee({ largeur: Number.parseFloat(plan.style.width), hauteur: Number.parseFloat(plan.style.height) }, 1000, 600);
    expect(vueActuelle(c)).toEqual({ x: entier.x, y: entier.y, echelle: entier.echelle });
    expect(vue.getAttribute("tabindex")).toBe("0");
    expect(vue.getAttribute("aria-label")).toContain("Flèches");
  });

  it("sur téléphone (640 px et moins) : liste accordéon à la place de la toile, avec cibles de 44 px", async () => {
    const ancien = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("640"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
    try {
      serveur = servir();
      const { c, pont } = await ouvrir();
      expect(c.querySelector(".atl-org-vue")).toBeNull();
      const liste = c.querySelector<HTMLElement>('[data-testid="organigramme-liste"]')!;
      expect(liste).not.toBeNull();
      expect(liste.querySelector(".atl-orgl-general")?.textContent).toContain("Coordinateur général");
      const blocs = Array.from(liste.querySelectorAll<HTMLElement>("details.atl-orgl-service"));
      expect(blocs.map((b) => b.querySelector(".atl-orgl-nom")?.textContent)).toEqual(["Direction", "Juridique", "Marketing"]);
      const juridique = blocs[1]!;
      expect(juridique.textContent).toContain("Coordinateur juridique");
      // Retrait de reportsTo : l'agent subordonné est plus indenté que le coordinateur.
      const lignes = Array.from(juridique.querySelectorAll<HTMLElement>(".atl-orgl-agents li"));
      expect(lignes.length).toBeGreaterThan(0);
      expect(juridique.querySelector(".atl-orgl-agents li")?.getAttribute("style")).toContain("padding-left");
      await cliquer(parTexte(juridique, "a.atl-orgl-lien", "Veille légale"));
      expect(pont.navigations).toContain("/RNOAC/agents/j3");
      // Cibles de 44 px (2,75 rem) au moins pour le résumé, les liens et le bouton.
      for (const sel of [".atl-orgl-service > summary", ".atl-orgl-lien", ".atl-orgl-liens"]) {
        expect(STYLES_ORGANIGRAMME, sel).toMatch(new RegExp(`${sel.replace(/\./gu, "\\.")}[^}]*min-height: 2\\.75rem`, "u"));
      }
      // « Voir les liens » reste disponible.
      await cliquer(parTexte(juridique, "button", "Voir les liens"));
      expect(c.textContent).toContain("Liens de Juridique");
    } finally {
      window.matchMedia = ancien;
    }
  });

  it("Ctrl + molette zoome, la molette seule laisse la page défiler", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    const vue = c.querySelector<HTMLElement>(".atl-org-vue")!;
    const e0 = vueActuelle(c).echelle;
    const simple = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    await act(async () => void vue.dispatchEvent(simple));
    expect(simple.defaultPrevented).toBe(false);
    expect(vueActuelle(c).echelle).toBe(e0);
    const avecCtrl = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true });
    await act(async () => void vue.dispatchEvent(avecCtrl));
    expect(avecCtrl.defaultPrevented).toBe(true);
    expect(vueActuelle(c).echelle).toBeGreaterThan(e0);
  });

  it("le filtre met en évidence les cartes qui correspondent, atténue les autres et « Ajuster » centre la première", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await saisir(c.querySelector<HTMLInputElement>('input[type="search"]')!, "veille");
    const trouvees = Array.from(c.querySelectorAll<HTMLElement>("[data-trouve]"));
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]!.textContent).toContain("Veille légale");
    expect(c.querySelectorAll("[data-carte][data-estompe]").length).toBe(c.querySelectorAll("[data-carte]").length - 1);
    expect(c.querySelector('[role="status"].atl-org-etat')?.textContent).toContain("1 carte correspond");
    // Le plan est centré sur la carte trouvée, à 80 % au moins.
    const centre = () => {
      const v = vueActuelle(c);
      const k = trouvees[0]!;
      return { echelle: v.echelle, cx: (Number.parseFloat(k.style.left) + Number.parseFloat(k.style.width) / 2) * v.echelle + v.x, cy: (Number.parseFloat(k.style.top) + Number.parseFloat(k.style.height) / 2) * v.echelle + v.y };
    };
    expect(centre().echelle).toBeGreaterThanOrEqual(0.8);
    expect(centre().cx).toBeCloseTo(500, 3);
    expect(centre().cy).toBeCloseTo(300, 3);
    await toucheClavier(c.querySelector(".atl-org-vue")!, "ArrowRight");
    await cliquer(bouton(c, "Ajuster à l'écran"));
    expect(centre().cx).toBeCloseTo(500, 3);
    await saisir(c.querySelector<HTMLInputElement>('input[type="search"]')!, "marketing");
    expect(Array.from(c.querySelectorAll("[data-trouve]")).map((e) => e.querySelector(".atl-org-nom")?.textContent)).toEqual(["Marketing"]);
    await saisir(c.querySelector<HTMLInputElement>('input[type="search"]')!, "introuvable-xyz");
    expect(c.querySelector("[data-trouve]")).toBeNull();
    expect(c.textContent).toContain("Aucune carte ne correspond");
  });

  it("« Voir les liens » surligne les services reliés par un flux et ouvre le panneau des flux dans les deux sens", async () => {
    serveur = servir();
    const { c } = await ouvrir();
    await cliquer(parTexte(carte(c, "Marketing"), "button", "Voir les liens"));
    const panneau = c.querySelector(".atl-org-panneau")!;
    expect(panneau.querySelector("h2")?.textContent).toBe("Liens de Marketing");
    const [sortants, entrants] = Array.from(panneau.querySelectorAll(".atl-org-flux"));
    expect(sortants!.textContent).toContain("vers Juridique");
    expect(sortants!.textContent).toContain("Relecture légale");
    expect(entrants!.textContent).toContain("depuis Juridique");
    expect(entrants!.textContent).toContain("approbation humaine");
    expect(sortants!.textContent).not.toContain("approbation humaine");
    expect(parTexte(carte(c, "Marketing"), "button", "Masquer les liens").getAttribute("aria-pressed")).toBe("true");
    expect(carte(c, "Juridique").dataset["relie"]).toBe("true");
    expect(carte(c, "Direction").dataset["relie"]).toBeUndefined();
    expect(carte(c, "Direction").dataset["estompe"]).toBe("true");
    await cliquer(parTexte(panneau, "button.atl-org-flux-service", "Juridique"));
    expect(c.querySelector(".atl-org-panneau h2")?.textContent).toBe("Liens de Juridique");
    await cliquer(parTexte(c, ".atl-org-panneau button", "Fermer"));
    expect(c.querySelector(".atl-org-panneau")).toBeNull();
    expect(c.querySelector("[data-relie]")).toBeNull();
  });

  it("un service en panne n'empêche pas les autres et propose de réessayer", async () => {
    serveur = servir({ agentsParService: { ...AGENTS, [JUR]: "panne" } });
    const { c } = await ouvrir();
    expect(carte(c, "Juridique").textContent).toContain("Lecture impossible");
    expect(c.textContent).toContain("Gouvernance");
    serveur = servir();
    await cliquer(parTexte(carte(c, "Juridique"), "button", "Réessayer"));
    await laisser();
    expect(carte(c, "Juridique").querySelector(".atl-org-compteur")?.textContent).toBe("3 agents");
  });

  it("flux indisponibles : message dans le panneau, le dessin fonctionne, nouvel essai possible", async () => {
    serveur = servir({ flux: "panne" });
    const { c } = await ouvrir();
    expect(c.textContent).toContain("Gouvernance");
    await cliquer(parTexte(carte(c, "Marketing"), "button", "Voir les liens"));
    expect(c.querySelector(".atl-org-panneau")?.textContent).toContain("Flux indisponibles");
    serveur = servir();
    await cliquer(parTexte(c, ".atl-org-panneau button", "Réessayer"));
    await laisser();
    expect(c.querySelector(".atl-org-panneau")?.textContent).toContain("vers Juridique");
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
  });
});
