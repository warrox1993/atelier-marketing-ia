// @vitest-environment jsdom
/**
 * Matrice des échanges (organigramme), interface : cases et totaux, aria-label, case choisie, détail de la paire, clic sur
 * un en-tête, survol en croix, liste « service → partenaires » sur téléphone, tenue à 60 services.
 */
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FluxBrut } from "../../src/ui/organigramme-flux.js";
import { MatriceEchangesVue } from "../../src/ui/organigramme-matrice.js";
import { cliquer, rendre, type Rendu } from "./pont.js";

const SERVICES = [
  { slug: "direction", nom: "Direction", estDirection: true },
  { slug: "juridique", nom: "Juridique" },
  { slug: "marketing", nom: "Marketing" },
];
const f = (source: string, cible: string, objet: string, approbationHumaine = false, origine: "metier" | "coordinateurs" = "metier"): FluxBrut => ({ source, cible, objet, approbationHumaine, origine });
const FLUX: FluxBrut[] = [
  f("marketing", "juridique", "Relecture légale; Avis sur un slogan"),
  f("juridique", "marketing", "Avis sur une mention", true),
  f("direction", "juridique", "Contrat à signer"),
  f("direction", "marketing", "Réseau des coordinateurs", false, "coordinateurs"),
];

let rendu: Rendu | null = null;
afterEach(async () => {
  await rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

const monter = async (props: Partial<Parameters<typeof MatriceEchangesVue>[0]> = {}) => {
  const choisirCase = vi.fn();
  const ouvrirService = vi.fn();
  rendu = await rendre(createElement(MatriceEchangesVue, { services: SERVICES, flux: FLUX, choisirCase, ouvrirService, ...props }));
  return { choisirCase, ouvrirService, el: rendu.conteneur };
};
const bouton = (el: ParentNode, etiquette: string) => el.querySelector<HTMLButtonElement>(`button[aria-label="${etiquette}"]`);

describe("MatriceEchangesVue (bureau)", () => {
  it("dessine un vrai tableau accessible : légende, en-têtes avec scope, diagonale neutre", async () => {
    const { el } = await monter();
    expect(el.querySelector("table caption")?.textContent).toMatch(/De.*Vers/);
    expect(el.querySelectorAll('thead th[scope="col"]').length).toBe(1 + 3 + 1);
    expect(el.querySelectorAll('tbody th[scope="row"]').length).toBe(3);
    expect(el.querySelectorAll("td[data-diagonale]").length).toBe(3);
    expect(el.textContent).toContain("Le réseau des coordinateurs (tous reliés entre eux) n'est pas compté ici.");
    expect(el.textContent).toMatch(/A.*approbation humaine/);
  });

  it("montre le nombre de liaisons métier, jamais 0, et ignore le réseau des coordinateurs", async () => {
    const { el } = await monter();
    expect(bouton(el, "De Marketing vers Juridique : 2 échanges")?.textContent).toBe("2");
    expect(bouton(el, "De Juridique vers Marketing : 1 échange, approbation requise")?.textContent).toBe("1A");
    expect(bouton(el, "De Direction vers Juridique : 1 échange")).not.toBeNull();
    // Direction -> Marketing n'existe qu'en réseau des coordinateurs : case vide.
    expect(el.querySelector('td[data-i="0"][data-j="2"]')?.textContent).toBe("");
    expect(el.querySelectorAll("tbody button.atl-mx-bouton").length).toBe(3);
    const cellules = [...el.querySelectorAll("td.atl-mx-case")].map((t) => t.textContent);
    expect(cellules.includes("0")).toBe(false);
  });

  it("totalise chaque ligne (envoyé) et chaque colonne (reçu)", async () => {
    const { el } = await monter();
    const lignes = [...el.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td.atl-mx-total")?.textContent);
    expect(lignes).toEqual(["1", "1", "2"]); // Direction 1, Juridique 1, Marketing 2
    const pied = [...el.querySelectorAll("tfoot td")].map((t) => t.textContent);
    expect(pied).toEqual(["0", "3", "1", "4"]); // Direction 0, Juridique 3, Marketing 1, total 4
  });

  it("proportionne l'intensité au nombre (paliers) sur une seule teinte", async () => {
    const flux = [f("marketing", "juridique", "a;b;c;d;e;f;g;h"), f("juridique", "marketing", "x")];
    const { el } = await monter({ flux });
    const palier = (i: number, j: number) => Number(el.querySelector(`td[data-i="${i}"][data-j="${j}"]`)?.getAttribute("data-palier"));
    expect(palier(2, 1)).toBe(4);
    expect(palier(1, 2)).toBe(1);
  });

  it("marque la case choisie et affiche le détail de la paire (objets, sens, approbation)", async () => {
    const { el } = await monter({ caseChoisie: { source: "marketing", cible: "juridique" } });
    expect(bouton(el, "De Marketing vers Juridique : 2 échanges")?.getAttribute("aria-pressed")).toBe("true");
    expect(bouton(el, "De Juridique vers Marketing : 1 échange, approbation requise")?.getAttribute("aria-pressed")).toBe("false");
    const detail = el.querySelector('[data-testid="detail-paire"]')!;
    expect(detail.querySelector("h3")?.textContent).toBe("De Marketing vers Juridique");
    const lignes = [...detail.querySelectorAll("li")].map((li) => li.textContent);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain("Relecture légale");
    expect(lignes[1]).toContain("Avis sur un slogan");
    expect(lignes[0]).toContain("Marketing demande à Juridique");
    expect(lignes[0]).toContain("Sans approbation humaine");
  });

  it("indique l'approbation humaine dans le détail", async () => {
    const { el } = await monter({ caseChoisie: { source: "juridique", cible: "marketing" } });
    expect(el.querySelector('[data-testid="detail-paire"]')?.textContent).toContain("Approbation humaine requise");
  });

  it("sans case choisie : invite à en choisir une", async () => {
    const { el } = await monter();
    expect(el.querySelector('[data-testid="detail-paire"]')).toBeNull();
    expect(el.textContent).toContain("Choisissez une case");
  });

  it("clic sur une case : choisirCase(source, cible) ; clic sur un en-tête : ouvrirService(slug)", async () => {
    const { el, choisirCase, ouvrirService } = await monter();
    await cliquer(bouton(el, "De Marketing vers Juridique : 2 échanges")!);
    expect(choisirCase).toHaveBeenCalledWith("marketing", "juridique");
    await cliquer(bouton(el, "Ouvrir le service Juridique (source)")!);
    expect(ouvrirService).toHaveBeenLastCalledWith("juridique");
    await cliquer(bouton(el, "Ouvrir le service Marketing (cible)")!);
    expect(ouvrirService).toHaveBeenLastCalledWith("marketing");
  });

  it("surbrillance croisée au survol : ligne et colonne de la case", async () => {
    const { el } = await monter();
    const b = bouton(el, "De Marketing vers Juridique : 2 échanges")!;
    await import("react").then(({ act }) =>
      act(async () => {
        b.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      }),
    );
    // ligne 2 (Marketing) et colonne 1 (Juridique)
    expect(el.querySelector('td[data-i="2"][data-j="0"]')?.hasAttribute("data-croise")).toBe(true);
    expect(el.querySelector('td[data-i="0"][data-j="1"]')?.hasAttribute("data-croise")).toBe(true);
    expect(el.querySelector('td[data-i="0"][data-j="0"]')?.hasAttribute("data-croise")).toBe(false);
    expect(el.querySelector('tbody tr:nth-child(3) th')?.hasAttribute("data-croise")).toBe(true);
  });

  it("reste utilisable à 60 services", async () => {
    const services = Array.from({ length: 60 }, (_, k) => ({ slug: `s${k}`, nom: `Service ${String(k).padStart(2, "0")}` }));
    const flux: FluxBrut[] = [];
    for (let k = 0; k < 60; k++) flux.push(f(`s${k}`, `s${(k + 1) % 60}`, `Objet ${k}`, k % 7 === 0), f(`s${k}`, `s${(k + 5) % 60}`, "Autre; Encore"));
    const t0 = performance.now();
    const { el, choisirCase } = await monter({ services, flux });
    const duree = performance.now() - t0;
    expect(el.querySelectorAll("tbody tr").length).toBe(60);
    expect(el.querySelectorAll("tbody button.atl-mx-bouton").length).toBe(120);
    expect(duree).toBeLessThan(5000);
    await cliquer(bouton(el, "De Service 00 vers Service 01 : 1 échange, approbation requise")!);
    expect(choisirCase).toHaveBeenCalledWith("s0", "s1");
  });

  it("services sans aucun flux : message, pas d'échec", async () => {
    const { el } = await monter({ flux: [] });
    expect(el.textContent).toContain("Aucun échange métier déclaré");
    expect(el.querySelectorAll("tbody button.atl-mx-bouton").length).toBe(0);
  });
});

describe("MatriceEchangesVue (téléphone)", () => {
  const telephone = () => vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));

  it("remplace le tableau par une liste service -> partenaires repliable", async () => {
    telephone();
    const { el } = await monter();
    expect(el.querySelector("table")).toBeNull();
    const services = el.querySelectorAll("details.atl-mx-service");
    expect(services).toHaveLength(3);
    const marketing = services[2]!;
    expect(marketing.querySelector("summary")?.textContent).toContain("Marketing");
    expect(marketing.querySelector("summary")?.textContent).toContain("2 envoyés, 1 reçus");
    expect(marketing.textContent).toContain("Marketing demande à");
    expect(marketing.textContent).toContain("Marketing reçoit de");
    expect(el.textContent).toContain("Le réseau des coordinateurs (tous reliés entre eux) n'est pas compté ici.");
  });

  it("partenaire cliquable (44 px), détail sous la ligne choisie, ouverture du service", async () => {
    telephone();
    const { el, choisirCase, ouvrirService } = await monter({ caseChoisie: { source: "marketing", cible: "juridique" } });
    const b = [...el.querySelectorAll<HTMLButtonElement>("button.atl-mx-partenaire")].find((x) => x.getAttribute("aria-label") === "De Marketing vers Juridique : 2 échanges")!;
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.parentElement?.textContent).toContain("Relecture légale");
    await cliquer(b);
    expect(choisirCase).toHaveBeenCalledWith("marketing", "juridique");
    await cliquer([...el.querySelectorAll<HTMLButtonElement>("button.atl-mx-ouvrir")][1]!);
    expect(ouvrirService).toHaveBeenCalledWith("juridique");
  });

  it("cibles tactiles d'au moins 44 px dans les styles", async () => {
    const { STYLES_ORGANIGRAMME_MATRICE } = await import("../../src/ui/styles-organigramme-matrice.js");
    expect(STYLES_ORGANIGRAMME_MATRICE).toMatch(/\.atl-mx-partenaire \{[^}]*min-height: 2\.75rem/);
    expect(STYLES_ORGANIGRAMME_MATRICE).toMatch(/\.atl-mx-service > summary \{[^}]*min-height: 2\.75rem/);
  });
});

describe("MatriceEchangesVue : masquer les services sans échange", () => {
  const SERVICES_AVEC_INACTIFS = [...SERVICES, { slug: "rh", nom: "Ressources humaines" }, { slug: "it", nom: "Informatique" }];
  const case_ = (el: ParentNode) => el.querySelector<HTMLInputElement>('.atl-mx-option input[type="checkbox"]');
  const telephone = () => vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("640"), media: q, addEventListener() {}, removeEventListener() {} }));

  it("pas de case à cocher quand tous les services ont au moins un échange", async () => {
    const { el } = await monter();
    expect(case_(el)).toBeNull();
  });

  it("case décochée par défaut, avec le nombre de services concernés ; le réseau des coordinateurs ne compte pas comme un échange", async () => {
    // « it » n'a que des échanges du réseau des coordinateurs : il compte comme sans échange.
    const flux = [...FLUX, f("it", "direction", "Réseau des coordinateurs", false, "coordinateurs")];
    const { el } = await monter({ services: SERVICES_AVEC_INACTIFS, flux });
    const c = case_(el)!;
    expect(c.checked).toBe(false);
    expect(el.querySelector(".atl-mx-option")!.textContent).toBe("Masquer les services sans échange (2)");
    expect(el.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(c.closest("label")).not.toBeNull();
  });

  it("cochée : la matrice se recalcule sans ces services, les totaux restent ; décochée : ils reviennent", async () => {
    const { el } = await monter({ services: SERVICES_AVEC_INACTIFS });
    const noms = () => [...el.querySelectorAll("tbody th button.atl-mx-nom")].map((b) => b.textContent);
    expect(noms()).toContain("Informatique");
    await cliquer(case_(el)!);
    expect(case_(el)!.checked).toBe(true);
    expect(noms().sort()).toEqual(["Direction", "Juridique", "Marketing"]);
    expect(el.querySelectorAll('thead th[scope="col"]')).toHaveLength(1 + 3 + 1);
    expect([...el.querySelectorAll("tfoot td")].map((t) => t.textContent)).toEqual(["0", "3", "1", "4"]);
    expect(bouton(el, "De Marketing vers Juridique : 2 échanges")?.textContent).toBe("2");
    await cliquer(case_(el)!);
    expect(noms()).toHaveLength(5);
    expect(noms()).toContain("Ressources humaines");
  });

  it("services tous sans échange : la case reste disponible et le message explique pourquoi la matrice est vide", async () => {
    const { el } = await monter({ flux: [] });
    await cliquer(case_(el)!);
    expect(el.querySelector("table")).toBeNull();
    expect(el.textContent).toContain("Aucun échange métier déclaré entre ces services.");
    expect(case_(el)).not.toBeNull();
  });

  it("téléphone : la liste « service → partenaires » ne montre plus les services masqués", async () => {
    telephone();
    const { el } = await monter({ services: SERVICES_AVEC_INACTIFS });
    expect(el.querySelectorAll("details.atl-mx-service")).toHaveLength(5);
    await cliquer(case_(el)!);
    expect(el.querySelectorAll("details.atl-mx-service")).toHaveLength(3);
  });
});

describe("MatriceEchangesVue : noms de colonnes complets", () => {
  const NOMS = ["Comptabilité et finance", "Hygiène, sécurité et environnement", "Recherche et innovation"];
  const longs = NOMS.map((nom, k) => ({ slug: `s${k}`, nom }));

  it("chaque nom de colonne est écrit en entier (titre et contenu), jamais remplacé par des points de suspension", async () => {
    const { el } = await monter({ services: longs, flux: [f("s0", "s1", "x")] });
    const colonnes = [...el.querySelectorAll<HTMLButtonElement>("thead button.atl-mx-nom-colonne")];
    expect(colonnes.map((b) => b.textContent)).toEqual([...NOMS].sort((a, b) => a.localeCompare(b, "fr")));
    for (const b of colonnes) expect(b.getAttribute("title")).toBe(b.textContent);
  });

  it("styles : en-têtes plus hauts (11 rem), noms sur plusieurs lignes sans points de suspension, marge intérieure du cadre défilant", async () => {
    const { STYLES_ORGANIGRAMME_MATRICE: css } = await import("../../src/ui/styles-organigramme-matrice.js");
    const entete = /\.atl-mx-table thead th \{[^}]*?height: ([\d.]+)rem/.exec(css);
    expect(Number(entete?.[1])).toBeGreaterThanOrEqual(11);
    const colonne = /\.atl-mx-nom-colonne \{([^}]*)\}/.exec(css)![1]!;
    expect(colonne).toMatch(/white-space: normal/);
    expect(colonne).not.toMatch(/text-overflow: ellipsis/);
    expect(Number(/max-height: ([\d.]+)rem/.exec(colonne)![1])).toBeLessThan(Number(entete![1]));
    const defile = /\.atl-mx-defile \{([^}]*)\}/.exec(css)![1]!;
    expect(defile).toMatch(/padding: 0\.5rem/);
    // Case à cocher : cible d'au moins 24 px, 44 px sur téléphone.
    expect(css).toMatch(/\.atl-mx-option \{[^}]*min-height: 1\.5rem/);
    expect(css).toMatch(/@media \(max-width: 640px\) \{ \.atl-mx-option \{ min-height: 2\.75rem/);
  });
});
