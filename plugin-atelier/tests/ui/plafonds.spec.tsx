// @vitest-environment jsdom
/**
 * Interface des plafonds (décision de l'opérateur du 15/10/2026) : choix « Montant maximal (€) »
 * ou « Aucune limite », avertissement sans garde-fou, montants engagés face à la limite,
 * budgets IA natifs (0 = aucune limite côté Paperclip) tracés par le plugin.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { PageAtelier } from "../../src/ui/index.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, radio, rendre, saisir, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const AGENT = "55555555-5555-4555-8555-555555555551";
let pont: Pont;
let rendu: Rendu | null = null;
beforeEach(() => {
  pont = installerPont();
});
afterEach(() => {
  expect(pont.violations).toEqual([]);
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});
async function page(chemin: string) {
  pont.chemin = chemin;
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("création de campagne : plafond publicitaire", () => {
  it("« Aucune limite » affiche l'avertissement et envoie le choix explicite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "99999999-0000-4000-8000-000000000001", name: "x" }), { status: 201 })));
    pont.actions["atelier.campagne.creer"] = async () => ({ id: "33333333-3333-4333-8333-333333333333" });
    const c = await page("/RNO/atelier/campagnes/nouvelle");
    expect(c.querySelector('[role="note"][data-ton="attention"]')).toBeNull();
    await cliquer(radio(c, "Aucune limite"));
    const avertissement = c.querySelector('[role="note"][data-ton="attention"]');
    expect(avertissement?.textContent).toContain("approbation humaine");
    expect(avertissement?.textContent).toContain("Aucun plafond ne limitera");
    // Le bouton radio est décrit par l'avertissement (lecteur d'écran).
    expect(radio(c, "Aucune limite").getAttribute("aria-describedby")).toBe(avertissement?.id);
    await saisir(champParLibelle(c, "Nom de la campagne"), "Façades");
    await saisir(champParLibelle(c, "Brief"), "Brief de la campagne.");
    await cliquer(parTexte(c, "button", "Créer la campagne"));
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.campagne.creer");
    expect(appel?.params).toMatchObject({ plafondPub: { type: "aucune_limite" } });
    expect(appel?.params).not.toHaveProperty("budgetMaxCents");
  });

  it("aucun choix par défaut ; montant invalide ou nul bloque l'envoi avec la raison", async () => {
    const c = await page("/RNO/atelier/campagnes/nouvelle");
    expect(radio(c, "Pas de choix pour cette campagne").checked).toBe(true);
    const fieldset = radio(c, "Aucune limite").closest("fieldset");
    expect(fieldset?.querySelector("legend")?.textContent).toBe("Plafond des dépenses publicitaires");
    await cliquer(radio(c, "Montant maximal (€)"));
    const champ = champParLibelle(c, "Montant maximal en euros");
    await saisir(champParLibelle(c, "Nom de la campagne"), "N");
    await saisir(champParLibelle(c, "Brief"), "B");
    await saisir(champ, "0");
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    expect(parTexte(c, "button", "Créer la campagne").getAttribute("aria-disabled")).toBe("true");
    expect(c.textContent).toContain("supérieur à 0");
    await saisir(champ, "1 500,50");
    expect(parTexte(c, "button", "Créer la campagne").getAttribute("aria-disabled")).toBeNull();
  });
});

describe("paramètres : plafond de l'entreprise", () => {
  it("affiche les montants engagés face à la limite et enregistre « aucune limite » (action humaine)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const base = EXEMPLES_DONNEES["atelier.reglages"] as Record<string, unknown>;
    pont.donnees["atelier.reglages"] = {
      data: { ...base, plafondPub: { type: "montant", montantCents: 100000, decidePar: "local-board", decideLe: "2026-10-15T10:00:00.000Z" }, engagementPub: { engageCents: 40000, diffuseCents: 15000, reserveCents: 25000, limiteCents: 100000, choisi: true } },
      loading: false,
      error: null,
    };
    pont.actions["atelier.reglages.enregistrer"] = async () => base;
    const c = await page("/RNO/atelier/parametres");
    expect(c.textContent).toMatch(/400,00\s€ engagés sur 1\s000,00\s€/u);
    expect(c.textContent).toContain("Choisi par local-board");
    const bouton = parTexte(c, "button", "Enregistrer le plafond");
    expect(bouton.getAttribute("aria-disabled")).toBe("true"); // rien à enregistrer
    await cliquer(radio(c, "Aucune limite"));
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    await cliquer(bouton);
    const appel = pont.appelsActions.find((a) => a.cle === "atelier.reglages.enregistrer");
    expect(appel?.params).toEqual({ plafondPub: { type: "aucune_limite" } });
  });

  it("« sans limite » et « aucun choix » s'affichent distinctement", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const base = EXEMPLES_DONNEES["atelier.reglages"] as Record<string, unknown>;
    pont.donnees["atelier.reglages"] = {
      data: { ...base, plafondPub: { type: "aucune_limite", decidePar: "local-board", decideLe: "2026-10-15T10:00:00.000Z" }, engagementPub: { engageCents: 5000, diffuseCents: 5000, reserveCents: 0, limiteCents: null, choisi: true } },
      loading: false,
      error: null,
    };
    let c = await page("/RNO/atelier/parametres");
    expect(c.textContent).toContain("sans limite");
    rendu?.demonter();
    pont.donnees["atelier.reglages"] = { data: { ...base, plafondPub: null, engagementPub: { engageCents: 0, diffuseCents: 0, reserveCents: 0, limiteCents: null, choisi: false } }, loading: false, error: null };
    c = await page("/RNO/atelier/parametres");
    expect(c.textContent).toContain("Aucun plafond choisi");
  });
});

const ligneTableau = (c: ParentNode, nom: string) => Array.from(c.querySelectorAll("tbody tr")).find((l) => l.querySelector("th")?.textContent === nom)!;
const champBudget = (c: ParentNode, nom: string) => c.querySelector<HTMLInputElement>(`input[aria-label="Budget mensuel de ${nom} en euros"]`)!;

function simulerHote(agents: Array<{ id: string; name: string; budgetMonthlyCents: number }>, entreprise = 5000, echecAgent?: string) {
  const appels: Array<{ methode: string; url: string; corps: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      appels.push({ methode: init?.method ?? "GET", url, corps: init?.body ? JSON.parse(init.body) : null });
      if (url === `/api/companies/${ENTREPRISE}`) return new Response(JSON.stringify({ id: ENTREPRISE, name: "Entreprise", budgetMonthlyCents: entreprise }), { status: 200 });
      if (url === `/api/companies/${ENTREPRISE}/agents`) return new Response(JSON.stringify(agents.map((a) => ({ ...a, status: "idle" }))), { status: 200 });
      if (echecAgent && url === `/api/agents/${echecAgent}/budgets`) return new Response(JSON.stringify({ error: "refusé" }), { status: 403 });
      return new Response("{}", { status: 200 });
    }),
  );
  return appels;
}

describe("paramètres : coûts IA = budgets natifs de Paperclip, un seul tableau", () => {
  it("affiche tous les budgets dans un tableau, sans <details>, et « aucune limite » écrit 0 puis est tracé", async () => {
    const appels = simulerHote([{ id: AGENT, name: "Contenus", budgetMonthlyCents: 1500 }]);
    pont.actions["atelier.budget-ia.tracer"] = async () => ({ portee: "agent", agentId: AGENT, budgetMensuelCents: 0, illimite: true });
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Contenus"));
    expect(c.querySelector(".atl-budget-ia details")).toBeNull();
    expect(ligneTableau(c, "Contenus").textContent).toMatch(/15,00\s€/u);
    expect(ligneTableau(c, "Entreprise").textContent).toMatch(/50,00\s€/u);
    expect(champBudget(c, "Contenus").value).toBe("15");
    expect(parTexte(c, "button", "Enregistrer les budgets (0 modifié)").getAttribute("aria-disabled")).toBe("true");
    await saisir(champBudget(c, "Contenus"), "");
    expect(c.querySelector('[role="note"]')?.textContent).toContain("Contenus");
    await cliquer(parTexte(c, "button", "Enregistrer les budgets (1 modifié)"));
    expect(appels).toContainEqual({ methode: "PATCH", url: `/api/agents/${AGENT}/budgets`, corps: { budgetMonthlyCents: 0 } });
    expect(appels.filter((a) => a.methode === "PATCH")).toHaveLength(1);
    const trace = pont.appelsActions.find((a) => a.cle === "atelier.budget-ia.tracer");
    expect(trace?.params).toEqual({ portee: "agent", agentId: AGENT, avantCents: 1500 });
  });

  it("« Appliquer à tous » recopie la valeur dans les agents (pas l'entreprise) et n'envoie que les lignes modifiées", async () => {
    const AUTRE = "55555555-5555-4555-8555-555555555552";
    const appels = simulerHote([
      { id: AGENT, name: "Contenus", budgetMonthlyCents: 1500 },
      { id: AUTRE, name: "Veille", budgetMonthlyCents: 2000 },
    ]);
    pont.actions["atelier.budget-ia.tracer"] = async () => ({});
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Veille"));
    await saisir(champParLibelle(c, "Même budget mensuel pour tous les agents (en euros)"), "20");
    await cliquer(parTexte(c, "button", "Appliquer à tous"));
    expect(champBudget(c, "Contenus").value).toBe("20");
    expect(champBudget(c, "Veille").value).toBe("20");
    expect(champBudget(c, "Entreprise").value).toBe("50");
    await cliquer(parTexte(c, "button", "Enregistrer les budgets (1 modifié)"));
    const patchs = appels.filter((a) => a.methode === "PATCH");
    expect(patchs).toEqual([{ methode: "PATCH", url: `/api/agents/${AGENT}/budgets`, corps: { budgetMonthlyCents: 2000 } }]);
  });

  it("un échec partiel est signalé sur la ligne concernée et sa saisie est conservée", async () => {
    const AUTRE = "55555555-5555-4555-8555-555555555552";
    simulerHote(
      [
        { id: AGENT, name: "Contenus", budgetMonthlyCents: 1500 },
        { id: AUTRE, name: "Veille", budgetMonthlyCents: 2000 },
      ],
      5000,
      AUTRE,
    );
    pont.actions["atelier.budget-ia.tracer"] = async () => ({});
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Veille"));
    await saisir(champBudget(c, "Contenus"), "30");
    await saisir(champBudget(c, "Veille"), "40");
    await cliquer(parTexte(c, "button", "Enregistrer les budgets (2 modifiés)"));
    await vi.waitFor(() => expect(c.textContent).toContain("1 enregistré, 1 en échec"));
    expect(ligneTableau(c, "Veille").textContent).toContain("budget de Veille non enregistré");
    expect(ligneTableau(c, "Contenus").textContent).not.toContain("non enregistré");
    expect(champBudget(c, "Veille").value).toBe("40");
  });

  it("budget écrit mais trace en échec : message exact, et seule la trace est retentée", async () => {
    const appels = simulerHote([{ id: AGENT, name: "Contenus", budgetMonthlyCents: 1500 }]);
    let essais = 0;
    pont.actions["atelier.budget-ia.tracer"] = async () => {
      essais += 1;
      if (essais === 1) throw { code: "WORKER_ERROR", message: "[indisponible] Journal fermé." };
      return {};
    };
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Contenus"));
    await saisir(champBudget(c, "Contenus"), "30");
    await cliquer(parTexte(c, "button", "Enregistrer les budgets (1 modifié)"));
    await vi.waitFor(() => expect(c.textContent).toContain("trace non écrite : réessayer la trace"));
    expect(c.textContent).not.toContain("non enregistré");
    expect(ligneTableau(c, "Contenus").textContent).toContain("enregistré, trace non écrite : réessayer la trace");
    expect(appels.filter((a) => a.methode === "PATCH")).toHaveLength(1);
    await cliquer(parTexte(c, "button", "Réessayer la trace"));
    expect(essais).toBe(2);
    expect(appels.filter((a) => a.methode === "PATCH")).toHaveLength(1);
    expect(pont.appelsActions.filter((a) => a.cle === "atelier.budget-ia.tracer").map((a) => a.params)).toEqual([
      { portee: "agent", agentId: AGENT, avantCents: 1500 },
      { portee: "agent", agentId: AGENT, avantCents: 1500 },
    ]);
    expect(c.textContent).toContain("Trace écrite");
    expect(c.textContent).not.toContain("trace non écrite");
  });

  it("un montant invalide bloque l'enregistrement avec la raison sur la ligne", async () => {
    simulerHote([{ id: AGENT, name: "Contenus", budgetMonthlyCents: 1500 }]);
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Contenus"));
    await saisir(champBudget(c, "Contenus"), "abc");
    expect(ligneTableau(c, "Contenus").textContent).toContain("Montant invalide");
    expect(c.textContent).toContain("Corriger la ligne « Contenus »");
  });

  it("l'avertissement « plus de garde-fou » n'apparaît que pour une ligne qui passe à aucune limite", async () => {
    simulerHote([{ id: AGENT, name: "Contenus", budgetMonthlyCents: 1500 }], 0);
    const c = await page("/RNO/atelier/parametres");
    await vi.waitFor(() => expect(c.textContent).toContain("Contenus"));
    expect(c.querySelector('[role="note"]')).toBeNull();
    await saisir(champBudget(c, "Contenus"), "");
    expect(c.querySelector('[role="note"]')?.textContent).toContain("Paperclip ne mettra plus en pause");
  });
});

describe("résultats : montants engagés face à la limite", () => {
  it("affiche la limite par campagne et pour l'entreprise, ou « sans limite »", async () => {
    const base = EXEMPLES_DONNEES["atelier.resultats"] as { plafondsPub: { campagnes: Array<Record<string, unknown>> } } & Record<string, unknown>;
    pont.donnees["atelier.resultats"] = {
      data: {
        ...base,
        coutsIa: { totalCents: 800, estimation: false, detail: "d", moisCents: 800, budgetMensuelCents: 0 },
        plafondsPub: {
          entreprise: { plafondPub: { type: "aucune_limite", decidePar: "u", decideLe: "2026-10-15T10:00:00.000Z" }, engagementPub: { engageCents: 7000, diffuseCents: 2000, reserveCents: 5000, limiteCents: null, choisi: true } },
          campagnes: [{ ...base.plafondsPub.campagnes[0], engagementPub: { engageCents: 7000, diffuseCents: 2000, reserveCents: 5000, limiteCents: 150000, choisi: true } }],
        },
      },
      loading: false,
      error: null,
    };
    const c = await page("/RNO/atelier/resultats");
    expect(c.textContent).toMatch(/70,00\s€ engagés, sans limite/u);
    expect(c.textContent).toMatch(/70,00\s€ engagés sur 1\s500,00\s€/u);
    expect(c.textContent).toMatch(/Ce mois : 8,00\s€, budget mensuel sans limite/u);
  });
});
