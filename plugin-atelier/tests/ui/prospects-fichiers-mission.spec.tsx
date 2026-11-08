// @vitest-environment jsdom
/**
 * Issue 60, tâche 4 : section « Fichiers de mission » de la vue Prospects. Elle liste les fichiers que des missions sans CRM
 * ont préparés (`missions.fichiers-prospects`) et, au clic, demande le fichier Excel au serveur avec le lot exact de la mission
 * (`prospects.exporter-fichier`), puis affiche le rapport. Routes servies par un `fetch` simulé.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROSPECT_B2B } from "../../src/contrats/exemples/prospection.js";
import { PageAtelier } from "../../src/ui/index.js";
import { cliquer, ENTREPRISE, installerPont, parTexte, rendre, type Pont, type Rendu } from "./pont.js";

const contexte = { companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" };
const LOT = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const FICHIER = { missionId: "m-1", issueRacineId: "i-1", etat: "cloturee", date: "2026-11-03T08:00:00.000Z", canal: "courriel", nombre: 2, prospectIds: LOT };
const RAPPORT = {
  nomFichier: "prospects-courriel-2026-11-03.xlsx", format: "xlsx", typeMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  contenuBase64: Buffer.from("xlsx").toString("base64"), mode: "demonstration",
  rapport: { demandes: 2, inclus: 1, refuses: [{ prospectId: LOT[1], denomination: "Dupont SRL", motif: "Aucune base légale pour ce canal." }] },
};

let pont: Pont;
let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: unknown }> = [];
let fichiers: unknown[] = [];
let listeEnPanne = false;

beforeEach(() => {
  window.localStorage.clear();
  pont = installerPont();
  appels = [];
  fichiers = [];
  listeEnPanne = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url, corps: init?.body ? JSON.parse(init.body) : null });
      if (url.includes("/missions/fichiers-prospects")) {
        if (listeEnPanne) return new Response(JSON.stringify({ error: "panne" }), { status: 500 });
        return new Response(JSON.stringify({ fichiers }), { status: 200 });
      }
      if (methode === "POST" && url.endsWith("/prospects/exports-fichier")) return new Response(JSON.stringify(RAPPORT), { status: 201 });
      return new Response(JSON.stringify({ total: 1, page: 1, pages: 1, prospects: [structuredClone(PROSPECT_B2B)] }), { status: 200 });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  pont.chemin = "/RNO/atelier/prospects";
  rendu = await rendre(createElement(PageAtelier, { context: contexte }));
  return rendu.conteneur;
}

describe("section « Fichiers de mission »", () => {
  it("n'affiche rien quand aucune mission n'a préparé de fichier", async () => {
    const c = await ouvrir();
    expect(appels.some((a) => a.methode === "GET" && a.url.includes(`/missions/fichiers-prospects?companyId=${ENTREPRISE}`))).toBe(true);
    expect(c.textContent).not.toContain("Fichiers de mission");
    expect(c.textContent).not.toContain("Télécharger le fichier Excel");
  });

  it("liste illisible : l'erreur se voit et Réessayer recharge les fichiers", async () => {
    listeEnPanne = true;
    fichiers = [FICHIER];
    const c = await ouvrir();
    expect(c.textContent).toContain("fichiers de mission");
    expect(c.textContent).not.toContain("Télécharger le fichier Excel");
    listeEnPanne = false;
    const encart = [...c.querySelectorAll('[role="alert"]')].find((e) => e.textContent?.includes("fichiers de mission"))!;
    await cliquer(encart.querySelector("button")!);
    expect(c.textContent).toContain("Télécharger le fichier Excel");
  });

  it("le bouton appelle l'export avec le lot exact de la mission, télécharge puis affiche le rapport", async () => {
    fichiers = [FICHIER];
    const cliques: Array<{ nom: string }> = [];
    const creer = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: creer, revokeObjectURL: vi.fn() }));
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      cliques.push({ nom: this.download });
    });
    const c = await ouvrir();
    expect(c.textContent).toContain("Fichiers de mission");
    expect(c.textContent).toContain("2 prospects");
    await cliquer(parTexte(c, "button", "Télécharger le fichier Excel"));
    const post = appels.find((a) => a.methode === "POST" && a.url.endsWith("/prospects/exports-fichier"))!;
    expect(post.corps).toEqual({ companyId: ENTREPRISE, canal: "courriel", format: "xlsx", prospectIds: LOT });
    expect(cliques).toEqual([{ nom: RAPPORT.nomFichier }]);
    expect(c.textContent).toContain("1 inclus");
    expect(c.textContent).toContain("1 écartés");
    expect(c.textContent).toContain("Dupont SRL");
    clic.mockRestore();
  });
});
