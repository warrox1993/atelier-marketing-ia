// @vitest-environment jsdom
/**
 * Paramètres, section « Critères des leads » : lecture des réglages et des poids du score, désactivation d'un
 * critère, poids, seuil, ajout et retrait d'un critère personnalisé, enregistrement par PATCH.
 * Les routes du plugin sont servies par un `fetch` simulé ; la section est rendue seule (`CriteresLeads`).
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CriteresLeads } from "../../src/ui/vues/parametres.js";
import { champParLibelle, cliquer, ENTREPRISE, installerPont, parTexte, rendre, saisir, type Rendu } from "./pont.js";

let rendu: Rendu | null = null;
let appels: Array<{ methode: string; url: string; corps: any }> = []; // eslint-disable-line @typescript-eslint/no-explicit-any

const CRITERES = [
  ["entreprise_active", "Active (entreprise) ou demande / client (particulier)", 20],
  ["segment_cible", "Dans un segment de la cible", 20],
  ["zone_cible", "Dans une zone de la cible", 15],
  ["taille_connue", "Taille connue", 10],
  ["joignable_legalement", "Joignable légalement", 15],
  ["pas_deja_client", "Pas déjà client", 10],
  ["sources_concordantes", "Au moins deux sources concordantes", 10],
] as const;
const leads = (o: Record<string, unknown> = {}) => ({
  companyId: ENTREPRISE, version: 0, seuil: 90, personnalises: [], decidePar: null, decideLe: null,
  criteres: CRITERES.map(([code, libelle, poids]) => ({ code, libelle, actif: true, poids })), ...o,
});
const score = { companyId: ENTREPRISE, version: 1, poids: { site_present: 15 }, decidePar: "u", decideLe: "2026-10-15T10:00:00.000Z", criteres: [{ code: "site_present", libelle: "Site web publié" }, { code: "telephone_present", libelle: "Téléphone publié" }] };

beforeEach(() => {
  installerPont("/RNO/atelier/parametres");
  appels = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const methode = init?.method ?? "GET";
      const corps = init?.body ? JSON.parse(init.body) : null;
      appels.push({ methode, url, corps });
      let r: unknown = {};
      if (url.includes("/reglages/leads")) r = methode === "GET" ? leads() : leads({ ...corps, version: 1, criteres: corps.criteres.map((c: { code: string }) => ({ ...c, libelle: CRITERES.find((x) => x[0] === c.code)![1] })) });
      if (url.includes("/reglages/score")) r = methode === "GET" ? score : { ...score, version: 2, poids: corps.poids };
      return new Response(JSON.stringify(r), { status: 200 });
    }),
  );
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.unstubAllGlobals();
});

async function ouvrir() {
  rendu = await rendre(createElement(CriteresLeads));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendu.conteneur;
}
/** Raison affichée d'un bouton inactif (élément désigné par `aria-describedby`). */
const raisonDe = (b: HTMLElement) => (b.getAttribute("aria-disabled") === "true" ? (document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent ?? "") : "");
const parAria = (racine: ParentNode, libelle: string) => {
  const el = racine.querySelector<HTMLInputElement>(`[aria-label="${libelle}"]`);
  if (!el) throw new Error(`Introuvable : ${libelle}`);
  return el;
};

describe("Paramètres : critères des leads", () => {
  it("lit les réglages de l'entreprise de la route : sept critères cochés, poids, seuil, poids du score", async () => {
    const c = await ouvrir();
    expect(appels.map((a) => `${a.methode} ${a.url.replace(/^.*\/api(\/[^/]+)$/u, "$1").replace(/^.*\/api\/reglages/u, "/reglages")}`)).toEqual([
      `GET /reglages/leads?companyId=${ENTREPRISE}`,
      `GET /reglages/score?companyId=${ENTREPRISE}`,
    ]);
    expect(parAria(c, "Compter « Taille connue »").checked).toBe(true);
    expect(parAria(c, "Poids de « Dans une zone de la cible »").value).toBe("15");
    expect((champParLibelle(c, "Seuil de qualification (%)") as HTMLInputElement).value).toBe("90");
    expect(parAria(c, "Poids du score : « Site web publié »").value).toBe("15");
    expect(parAria(c, "Poids du score : « Téléphone publié »").value).toBe("0");
    // Rien de modifié : le bouton explique pourquoi il est inactif.
    expect(raisonDe(parTexte(c, "button", "Enregistrer"))).toMatch(/Aucune modification/u);
  });

  it("désactive un critère, change un poids et le seuil, ajoute puis retire un critère personnalisé, enregistre par PATCH", async () => {
    const c = await ouvrir();
    await cliquer(parAria(c, "Compter « Taille connue »"));
    await saisir(parAria(c, "Poids de « Dans une zone de la cible »"), "30");
    await saisir(champParLibelle(c, "Seuil de qualification (%)"), "75");
    await saisir(champParLibelle(c, "Libellé du critère"), "Rencontré au salon");
    await saisir(champParLibelle(c, "Poids du critère"), "25");
    await cliquer(parTexte(c, "button", "Ajouter le critère"));
    await saisir(champParLibelle(c, "Libellé du critère"), "Recommandé");
    await cliquer(parTexte(c, "button", "Ajouter le critère"));
    await cliquer(parTexte(c, "button", "Retirer « Recommandé »"));
    expect(c.textContent).toContain("Rencontré au salon");
    expect(c.textContent).not.toContain("Retirer « Recommandé »");
    await cliquer(parTexte(c, "button", "Enregistrer"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const patch = appels.filter((a) => a.methode === "PATCH");
    expect(patch).toHaveLength(1);
    expect(patch[0]!.url).toMatch(/\/reglages\/leads$/u);
    expect(patch[0]!.corps).toMatchObject({ companyId: ENTREPRISE, seuil: 75, personnalises: [{ code: "perso_rencontre_au_salon", libelle: "Rencontré au salon", poids: 25, description: "" }] });
    expect(patch[0]!.corps.criteres.find((x: { code: string }) => x.code === "taille_connue")).toEqual({ code: "taille_connue", actif: false, poids: 10 });
    expect(patch[0]!.corps.criteres.find((x: { code: string }) => x.code === "zone_cible")).toEqual({ code: "zone_cible", actif: true, poids: 30 });
    expect(c.textContent).toContain("Critères des leads enregistrés.");
  });

  it("poids du score modifié : une nouvelle version par PATCH /reglages/score, avec tous les critères du score", async () => {
    const c = await ouvrir();
    await saisir(parAria(c, "Poids du score : « Téléphone publié »"), "20");
    await cliquer(parTexte(c, "button", "Enregistrer"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const patch = appels.filter((a) => a.methode === "PATCH");
    expect(patch.map((a) => a.url.split("/api").at(-1))).toEqual(["/reglages/score"]);
    expect(patch[0]!.corps).toEqual({ companyId: ENTREPRISE, poids: { site_present: 15, telephone_present: 20 } });
  });

  it("refuse côté écran un poids hors 0..100 et un seuil hors 50..100 (rien n'est envoyé)", async () => {
    const c = await ouvrir();
    await saisir(parAria(c, "Poids de « Pas déjà client »"), "150");
    expect(raisonDe(parTexte(c, "button", "Enregistrer"))).toMatch(/entier de 0 à 100/u);
    await saisir(parAria(c, "Poids de « Pas déjà client »"), "10");
    await saisir(champParLibelle(c, "Seuil de qualification (%)"), "40");
    expect(raisonDe(parTexte(c, "button", "Enregistrer"))).toMatch(/Seuil : entre 50 et 100/u);
    await cliquer(parTexte(c, "button", "Enregistrer"));
    expect(appels.filter((a) => a.methode === "PATCH")).toHaveLength(0);
  });
});
