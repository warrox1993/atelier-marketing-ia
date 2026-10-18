// @vitest-environment jsdom
/**
 * Échanges entre services (lot L7), interface : onglet « Échanges » d'une tâche (rendu des statuts, source et cible),
 * rubrique « Direction » visible seulement quand le serveur autorise le registre, tableau filtré, pagination, export CSV.
 * Les routes du plugin sont servies par un `fetch` simulé.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationAtelier, OngletAtelierTache, PageAtelier } from "../../src/ui/index.js";
import { OngletEchanges, oublierAccesDirection } from "../../src/ui/vues/echanges.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";
import type { VueLiaison } from "../../src/contrats/liaisons-lecture.js";
import { libelleStatutLiaison } from "../../src/contrats/liaisons-lecture.js";

const T = "22222222-2222-4222-8222-222222222222";
const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string }> = [];
let serveur: (url: string) => { statut: number; corps: unknown };

const liaison = (o: Partial<VueLiaison> = {}): VueLiaison => ({
  id: "l1", role: "source", serviceSource: "marketing", serviceCible: "direction", nomServiceSource: "Marketing", nomServiceCible: "Direction", objet: "Rapport mensuel",
  question: "Pouvez-vous valider le budget ?", extraits: [{ titre: "Budget", texte: "12 000 euros" }], statut: "ouverte", libelleStatut: "Transmise",
  creeLe: "2026-10-10T08:00:00.000Z", reponduLe: null, ...o,
});
const ligneRegistre = (n: number) => ({
  id: `r${n}`, serviceSource: "marketing", serviceCible: "juridique", nomServiceSource: "Marketing", nomServiceCible: "Juridique", objet: `Objet ${n}`, statut: "ouverte",
  libelleStatut: "Transmise", nombreExtraits: 1, creeLe: "2026-10-10T08:00:00.000Z", reponduLe: null,
});

beforeEach(() => {
  oublierAccesDirection();
  appels = [];
  serveur = () => ({ statut: 404, corps: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      appels.push({ methode: init?.method ?? "GET", url });
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

describe("onglet « Échanges » d'une tâche", () => {
  const ouvrirTache = async () => {
    installerPont("/RNO/atelier/contenus");
    rendu = await rendre(createElement(OngletAtelierTache, { context: { ...contexte, entityId: T, entityType: "issue" } }));
    return rendu.conteneur;
  };
  const onglets = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[role="tab"]')).map((o) => o.textContent?.trim());

  it("sans échange, la fiche reste celle d'avant : aucun onglet « Échanges »", async () => {
    serveur = (url) => (url.includes("/liaisons") ? { statut: 200, corps: { liaisons: [] } } : { statut: 404, corps: {} });
    const c = await ouvrirTache();
    expect(onglets(c)).toEqual([]);
    expect(appels[0]!.url).toContain(`/taches/${T}/liaisons`);
  });

  it("tâche d'origine : onglet « Échanges » avec question, extraits, dates, ouvert sur le dossier", async () => {
    serveur = () => ({ statut: 200, corps: { liaisons: [liaison({ statut: "repondue", libelleStatut: "Répondue", reponse: "Budget validé.", reponduLe: "2026-10-12T09:30:00.000Z" })] } });
    const c = await ouvrirTache();
    expect(onglets(c).map((t) => t?.replace(/\d+\s*échange.*/u, "").trim())).toEqual(["Dossier", "Échanges"]);
    expect(c.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Dossier");
    await cliquer(parTexte(c, '[role="tab"]', "Échanges"));
    const t = c.querySelector(".atl-ech")!.textContent!;
    expect(t).toContain("Demande du service Marketing au service Direction");
    expect(t).toContain("Rapport mensuel");
    expect(t).toContain("Répondue");
    expect(t).toContain("Pouvez-vous valider le budget ?");
    expect(t).toContain("Budget");
    expect(t).toContain("12 000 euros");
    expect(t).toContain("Budget validé.");
    expect(t).toContain("Répondue le");
    expect(t).not.toContain("—");
  });

  it("tâche reçue : s'ouvre sur les échanges et rappelle que seul le transmis est visible", async () => {
    serveur = () => ({ statut: 200, corps: { liaisons: [liaison({ role: "cible" })] } });
    const c = await ouvrirTache();
    expect(c.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Échanges");
    expect(c.textContent).toContain("Demande reçue du service Marketing");
    expect(c.textContent).toContain("ne voyez ici que ce que le service demandeur a transmis");
  });

  it("une réponse inattendue du serveur ou une panne vaut « aucun échange »", async () => {
    serveur = () => ({ statut: 200, corps: { points: [], total: 0 } });
    expect(onglets(await ouvrirTache())).toEqual([]);
    rendu?.demonter();
    serveur = () => ({ statut: 500, corps: {} });
    expect(onglets(await ouvrirTache())).toEqual([]);
  });

  it("affiche le libellé de chacun des cinq statuts", async () => {
    const statuts = ["en_attente_approbation", "ouverte", "repondue", "refusee", "annulee"] as const;
    rendu = await rendre(createElement(OngletEchanges, { liaisons: statuts.map((s, i) => liaison({ id: `l${i}`, statut: s, libelleStatut: libelleStatutLiaison(s) })) }));
    const pastilles = Array.from(rendu.conteneur.querySelectorAll(".atl-pastille")).map((p) => p.textContent);
    expect(pastilles).toEqual(["En attente de votre accord", "Transmise", "Répondue", "Refusée", "Annulée"]);
  });
});

describe("rubrique « Direction » et registre", () => {
  const navigation = async () => {
    installerPont("/RNO/atelier/accueil");
    rendu = await rendre(createElement(NavigationAtelier, { context: contexte }));
    await cliquer(document.body); // laisse les promesses se résoudre
    return rendu.conteneur;
  };
  const liens = (c: HTMLElement) => Array.from(c.querySelectorAll("nav a")).map((a) => a.textContent?.trim());

  it("n'apparaît pas hors Direction (acces: false) ni quand la réponse n'est pas celle de la sonde, et ne sonde jamais le registre", async () => {
    serveur = () => ({ statut: 200, corps: { acces: false } });
    expect(liens(await navigation())).not.toContain("Registre des échanges");
    rendu?.demonter();
    oublierAccesDirection();
    serveur = () => ({ statut: 200, corps: { points: [], total: 0 } });
    expect(liens(await navigation())).not.toContain("Registre des échanges");
    expect(appels.some((a) => a.url.includes("/liaisons/registre"))).toBe(false);
    expect(appels.some((a) => a.url.includes("/liaisons/acces?companyId="))).toBe(true);
  });

  it("apparaît avant Réglages quand la sonde répond acces: true", async () => {
    serveur = (url) => (url.includes("/liaisons/acces") ? { statut: 200, corps: { acces: true } } : { statut: 404, corps: {} });
    const l = liens(await navigation());
    expect(l).toContain("Registre des échanges");
    expect(l.indexOf("Registre des échanges")).toBe(l.indexOf("Réglages") - 1);
  });

  const registre = async () => {
    installerPont("/RNO/atelier/echanges");
    rendu = await rendre(createElement(PageAtelier, { context: contexte }));
    await cliquer(document.body);
    return rendu.conteneur;
  };
  const page = (n: number, total = 30) => ({ autorise: true, lignes: Array.from({ length: Math.min(25, total - (n - 1) * 25) }, (_, i) => ligneRegistre((n - 1) * 25 + i + 1)), total, page: n, taille: 25, pages: Math.ceil(total / 25) });

  it("affiche le tableau, filtre par statut et par service, pagine et exporte", async () => {
    const urlCsv = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: urlCsv, revokeObjectURL: vi.fn() }));
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    serveur = (url) => {
      if (url.includes("exporter=csv")) return { statut: 200, corps: { autorise: true, fichier: { nom: "registre.csv", typeMime: "text/csv", contenuBase64: btoa("a;b") }, lignes: 30, tronque: false } };
      return { statut: 200, corps: page(url.includes("page=2") ? 2 : 1) };
    };
    const c = await registre();
    expect(c.querySelector("h1")?.textContent).toBe("Registre des échanges");
    expect(c.querySelectorAll("tbody tr")).toHaveLength(25);
    expect(c.textContent).toContain("30 échanges, page 1 sur 2");
    expect(c.textContent).not.toContain("—");

    await cliquer(parTexte(c, "button", "Suivant"));
    expect(appels.at(-1)!.url).toContain("page=2");
    expect(c.querySelectorAll("tbody tr")).toHaveLength(5);

    await saisir(champParLibelle(c, "Statut"), "repondue");
    expect(appels.at(-1)!.url).toContain("statut=repondue");
    expect(appels.at(-1)!.url).toContain("page=1"); // un filtre ramène à la première page
    await saisir(champParLibelle(c, "Service"), "juridique");
    expect(appels.at(-1)!.url).toContain("service=juridique");

    await cliquer(parTexte(c, "button", "Exporter en CSV"));
    const exportUrl = appels.find((a) => a.url.includes("exporter=csv"))!.url;
    expect(exportUrl).toContain("statut=repondue");
    expect(exportUrl).toContain("service=juridique");
    expect(urlCsv).toHaveBeenCalled();
    clic.mockRestore();
    expect(c.textContent).toContain("30 échanges exportés");
  });

  it("explique un registre refusé et signale une période inversée", async () => {
    serveur = () => ({ statut: 403, corps: { error: "Le registre des échanges est réservé à l'entreprise Direction du client." } });
    const c = await registre();
    expect(c.textContent).toContain("réservé à l'entreprise Direction");
    await saisir(champParLibelle(c, "Du"), "2026-10-09");
    await saisir(champParLibelle(c, "Au"), "2026-10-01");
    expect(c.textContent).toContain("La date de fin précède la date de début.");
  });

  it("montre un état vide quand aucun échange ne correspond", async () => {
    serveur = () => ({ statut: 200, corps: { autorise: true, lignes: [], total: 0, page: 1, taille: 25, pages: 1 } });
    const c = await registre();
    expect(c.textContent).toContain("Aucun échange ne correspond.");
    expect(parTexte(c, "button", "Exporter en CSV").getAttribute("aria-disabled")).toBe("true");
  });
});
