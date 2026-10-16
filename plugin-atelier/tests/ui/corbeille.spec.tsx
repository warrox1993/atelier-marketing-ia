// @vitest-environment jsdom
/**
 * Corbeille : liste, restauration d'un élément, vidage avec confirmation explicite, état vide.
 * Les routes du plugin sont servies par un `fetch` simulé ; la vue est rendue seule (`VueCorbeille`).
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueCorbeille } from "../../src/ui/vues/corbeille.js";
import { cliquer, installerPont, parTexte, rendre, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let serveur: (methode: string, url: string, corps: unknown) => { statut: number; corps: unknown };

const ligne = (o: Record<string, unknown>) => ({
  id: "l1", type: "document", typeLibelle: "Document de connaissances", elementId: "e1", titre: "Tarifs 2026", supprimePar: "local-board",
  supprimeLe: "2026-10-15T10:00:00.000Z", purgePrevueLe: "2026-11-14T10:00:00.000Z", joursRestants: 29, ...o,
});
let elements: Array<Record<string, unknown>> = [];

beforeEach(() => {
  installerPont("/RNO/atelier/corbeille");
  appels = [];
  elements = [ligne({}), ligne({ id: "l2", type: "tache", typeLibelle: "Tâche", elementId: "e2", titre: "DEM-1 · Post de printemps", joursRestants: 29 })];
  serveur = (methode, url) => {
    if (methode === "GET" && url.includes("/corbeille?")) return { statut: 200, corps: { companyId: "c", delaiPurgeJours: 30, elements, purges: 0 } };
    if (url.endsWith("/corbeille/restauration")) return { statut: 200, corps: { restaure: elements[0] } };
    if (url.endsWith("/corbeille/vidage")) return { statut: 200, corps: { purges: 2 } };
    return { statut: 404, corps: {} };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const corps = init?.body ? JSON.parse(init.body) : null;
      appels.push({ methode: init?.method ?? "GET", url, corps });
      const r = serveur(init?.method ?? "GET", url, corps);
      return new Response(JSON.stringify(r.corps), { status: r.statut });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(VueCorbeille));
  return rendu.conteneur;
}

describe("corbeille", () => {
  it("liste les éléments supprimés avec leur type et le délai avant suppression définitive", async () => {
    const c = await ouvrir();
    const lignes = c.querySelectorAll("tbody tr");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.textContent).toContain("Tarifs 2026");
    expect(lignes[0]!.textContent).toContain("Document de connaissances");
    expect(lignes[0]!.textContent).toContain("Dans 29 jours");
    expect(lignes[1]!.textContent).toContain("Reste annulée");
    expect(c.textContent).toContain("30 jours");
    expect(c.textContent).not.toContain("—");
    expect(appels[0]!.url).toContain("/corbeille?companyId=");
  });

  it("« Restaurer » envoie le type et l'identifiant de l'élément, puis recharge la liste", async () => {
    const c = await ouvrir();
    await cliquer(c.querySelectorAll("tbody tr")[0]!.querySelector("button")!);
    const post = appels.find((a) => a.methode === "POST");
    expect(post?.url).toContain("/corbeille/restauration");
    expect(post?.corps).toMatchObject({ type: "document", id: "e1" });
    expect(c.querySelector('[role="status"]')?.textContent).toContain("Tarifs 2026");
    expect(appels.filter((a) => a.url.includes("/corbeille?")).length).toBeGreaterThanOrEqual(2);
  });

  it("« Vider la corbeille » demande d'abord confirmation et n'envoie rien avant", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Vider la corbeille"));
    expect(appels.filter((a) => a.methode === "POST")).toHaveLength(0);
    expect(c.querySelector('[role="group"]')?.textContent).toContain("ne peut pas être annulée");
    // Annuler ne supprime rien.
    await cliquer(parTexte(c, "button", "Garder la corbeille"));
    expect(appels.filter((a) => a.methode === "POST")).toHaveLength(0);
    await cliquer(parTexte(c, "button", "Vider la corbeille"));
    elements = [];
    await cliquer(parTexte(c, "button", "Supprimer définitivement"));
    const post = appels.find((a) => a.methode === "POST");
    expect(post?.url).toContain("/corbeille/vidage");
    expect(post?.corps).toMatchObject({ confirmer: true });
    expect(c.textContent).toContain("La corbeille est vide.");
  });

  it("restauration groupée : cases étiquetées, « Restaurer (N) », une requête par élément", async () => {
    const c = await ouvrir();
    expect([...c.querySelectorAll("button")].some((b) => /^Restaurer \(/u.test(b.textContent ?? ""))).toBe(false);
    expect(c.querySelector('input[aria-label="Sélectionner « Tarifs 2026 »"]')).not.toBeNull();
    await cliquer(Array.from(c.querySelectorAll("label")).find((l) => l.textContent === "Tout sélectionner")!.querySelector("input")!);
    await cliquer(parTexte(c, "button", "Restaurer (2)"));
    const posts = appels.filter((a) => a.methode === "POST");
    expect(posts.map((p) => p.corps)).toMatchObject([
      { type: "document", id: "e1" },
      { type: "tache", id: "e2" },
    ]);
    expect(c.querySelector('[role="status"]')?.textContent).toContain("2 éléments restaurés");
  });

  it("restauration groupée : un échec n'arrête pas les autres et le récapitulatif le nomme", async () => {
    const base = serveur;
    serveur = (m, u, b) => (u.endsWith("/restauration") && (b as { id: string }).id === "e1" ? { statut: 404, corps: { erreur: "Cet élément n'est pas à la corbeille." } } : base(m, u, b));
    const c = await ouvrir();
    await cliquer(Array.from(c.querySelectorAll("label")).find((l) => l.textContent === "Tout sélectionner")!.querySelector("input")!);
    await cliquer(parTexte(c, "button", "Restaurer (2)"));
    expect(appels.filter((a) => a.methode === "POST")).toHaveLength(2);
    const alerte = c.querySelector('[role="alert"]')!;
    expect(alerte.textContent).toContain("1 élément restauré, 1 en échec");
    expect(alerte.textContent).toContain("Tarifs 2026");
    expect(alerte.textContent).toContain("pas à la corbeille");
    expect((c.querySelector('input[aria-label="Sélectionner « Tarifs 2026 »"]') as HTMLInputElement).checked).toBe(true);
  });

  it("affiche l'erreur du serveur si la restauration échoue", async () => {
    const base = serveur;
    serveur = (m, u, b) => (u.endsWith("/restauration") ? { statut: 404, corps: { erreur: "Cet élément n'est pas à la corbeille." } } : base(m, u, b));
    const c = await ouvrir();
    await cliquer(c.querySelectorAll("tbody tr")[0]!.querySelector("button")!);
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("pas à la corbeille");
  });

  it("état vide", async () => {
    elements = [];
    const c = await ouvrir();
    expect(c.textContent).toContain("La corbeille est vide.");
    expect(c.querySelectorAll("tbody tr")).toHaveLength(0);
    expect([...c.querySelectorAll("button")].some((b) => b.textContent === "Vider la corbeille")).toBe(false);
  });
});
