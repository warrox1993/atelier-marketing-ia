// @vitest-environment jsdom
/**
 * Onglet « Rapport du mois » : présence dans Marketing (les autres onglets inchangés), sélecteur de mois qui
 * relit la route, « non mesuré » en clair, démonstration nommée, impression appelée, erreur lisible.
 * La route `rapport.mensuel` est servie par un `fetch` simulé.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChiffreRapport, RapportMensuel } from "../../src/contrats/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { libelleMois, moisProposes } from "../../src/ui/vues/rapport.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
let pont: Pont;
let rendu: Rendu | null = null;
let urls: string[] = [];

const P = { debut: "2026-10-01T00:00:00.000Z", fin: "2026-10-31T23:59:59.999Z" };
const ch = (cle: string, libelle: string, valeur: number | null, o: Partial<ChiffreRapport> = {}): ChiffreRapport => ({ cle, libelle, valeur, mesure: valeur !== null, source: `table_${cle}`, periode: P, mode: null, note: null, ...o });
const RAPPORT = (mois = "2026-10", o: Partial<RapportMensuel> = {}): RapportMensuel => ({
  companyId: ENTREPRISE, entreprise: "Cabinet fictif", mois, periode: P, genereLe: "2026-11-02T08:00:00.000Z",
  campagnes: [ch("campagnes_actives", "Campagnes actives", 2)],
  contenus: [ch("contenus_publies_reel", "Contenus publiés", 3, { mode: "reel" }), ch("contenus_publies_demonstration", "Contenus publiés (démonstration)", 4, { mode: "demonstration" })],
  prospects: { chiffres: [ch("prospects_trouves_reel", "Prospects trouvés", 12)], badges: [ch("prospects_qualifies", "Qualifiés", 5)], tronque: false, plafond: 5000 },
  resultats: { chiffres: [ch("devis_conversions", "Demandes de devis et conversions", null, { note: "Aucune mesure : non mesuré." })], mesures: [] },
  coutsIa: {
    lignes: [{ agent: "Contenus", modele: "claude-sonnet", facturation: "abonnement", jetonsEntree: 1000, jetonsEntreeCache: 400, jetonsSortie: 200, coutCentimes: 0 }],
    total: { jetonsEntree: 1000, jetonsEntreeCache: 400, jetonsSortie: 200, coutCentimes: 0 }, source: "cost_events", periode: P, note: "Abonnement : coût nul.",
  },
  enAttenteClient: { points: [{ type: "information_manquante", titre: "Marque non décrite", raison: "Sans elle, pas de ton." }], source: "accueil", note: "État du jour." },
  ...o,
});

function stubReseau(reponse: (url: string) => { statut?: number; corps: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = url.includes("/rapport/mensuel?") ? reponse(url) : url.includes("/accueil?") ? { corps: { companyId: ENTREPRISE, elements: [], missions: [] } } : { corps: {} };
      return new Response(JSON.stringify(r.corps), { status: r.statut ?? 200 });
    }),
  );
}
beforeEach(() => {
  urls = [];
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  stubReseau((u) => ({ corps: RAPPORT(new URL(u, "http://x").searchParams.get("mois") ?? "2026-10") }));
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});
async function ouvrir() {
  pont = installerPont("/RNO/atelier/rapport");
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}

describe("Rapport du mois", () => {
  it("est un onglet de Marketing, après les autres qui restent en place", async () => {
    const c = await ouvrir();
    const onglets = Array.from(c.querySelectorAll('[role="tablist"][aria-label="Marketing : sections"] [role="tab"]'));
    expect(onglets.map((o) => o.firstChild?.textContent?.trim())).toEqual(["Campagnes", "Contenus", "Calendrier", "Résultats", "Équipe", "Rapport du mois"]);
    expect(onglets.find((o) => o.getAttribute("aria-selected") === "true")?.firstChild?.textContent?.trim()).toBe("Rapport du mois");
    expect(pont.violations).toEqual([]);
  });

  it("lit la route avec le mois courant et affiche l'entête, les chiffres, leurs sources et le coût", async () => {
    const c = await ouvrir();
    const mois = moisProposes()[0]!;
    expect(urls.some((u) => u.includes(`/rapport/mensuel?companyId=${ENTREPRISE}&mois=${mois}`))).toBe(true);
    expect(c.querySelector(".atl-rapport-titre")?.textContent).toContain("Cabinet fictif");
    expect(c.querySelector(".atl-rapport-titre")?.textContent).toContain(libelleMois(mois));
    expect(c.textContent).toContain("Campagnes actives");
    expect(c.textContent).toContain("table_campagnes_actives");
    expect(c.textContent).toContain("claude-sonnet");
    expect(c.textContent).toContain("Marque non décrite");
  });

  it("écrit « Non mesuré » quand la valeur manque (jamais 0) et nomme la démonstration", async () => {
    const c = await ouvrir();
    const ligne = parTexte(c, "tr", /Demandes de devis et conversions/);
    expect(ligne.querySelector(".atl-rapport-non-mesure")?.textContent).toBe("Non mesuré");
    expect(ligne.querySelector("td")?.textContent).not.toBe("0");
    const demo = parTexte(c, "tr", /Contenus publiés \(démonstration\)/);
    expect(demo.textContent).toContain("Démonstration : à ne pas confondre avec le réel.");
  });

  it("le sélecteur de mois relit la route pour le mois choisi", async () => {
    const c = await ouvrir();
    const select = c.querySelector<HTMLSelectElement>(".atl-rapport-commandes select")!;
    expect(select.options).toHaveLength(24);
    const autre = moisProposes()[3]!;
    await saisir(select, autre);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(urls.some((u) => u.includes(`mois=${autre}`))).toBe(true);
    expect(c.querySelector(".atl-rapport-titre")?.textContent).toContain(libelleMois(autre));
  });

  it("le bouton « Imprimer ou enregistrer en PDF » appelle window.print", async () => {
    const impression = vi.fn();
    vi.stubGlobal("print", impression);
    window.print = impression;
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Imprimer ou enregistrer en PDF"));
    expect(impression).toHaveBeenCalledTimes(1);
  });

  it("une réponse en erreur est dite clairement, sans rapport affiché", async () => {
    stubReseau(() => ({ statut: 500, corps: { error: "erreur_interne", message: "boum" } }));
    const c = await ouvrir();
    expect(c.querySelector(".atl-rapport")).toBeNull();
    expect(c.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("la feuille d'impression ne montre que le rapport", async () => {
    const { STYLES_RAPPORT } = await import("../../src/ui/styles-rapport.js");
    expect(STYLES_RAPPORT).toContain("@media print");
    expect(STYLES_RAPPORT).toContain("body * { visibility: hidden");
    expect(STYLES_RAPPORT).not.toMatch(/[—–]/u);
  });
});
