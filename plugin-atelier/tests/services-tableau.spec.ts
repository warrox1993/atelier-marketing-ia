/**
 * Route `tableau.direction` : déclaration, droits (humain seulement), validation du mois, isolation par entreprise,
 * une source illisible vaut null (« non mesuré ») sans faire échouer la route.
 */
import { describe, expect, it } from "vitest";
import { DonneesDirection, ROUTES_API } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import { lecturesTableauSql, routesTableau, type LecturesTableau } from "../src/serveur/services-tableau.js";
import { SOC } from "./outils-base.js";

const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "user-jb", runId: null };
const AGENT: ActeurHote = { type: "agent", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", userId: null, runId: "run-1" };
const SOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function lectures(o: Partial<LecturesTableau> = {}) {
  const appels: Array<[string, string, string]> = [];
  const l: LecturesTableau = {
    prospects: async (c, d, f) => (appels.push(["prospects", c, d + f]), c === SOC ? { trouves: 10, avecNumero: 4 } : { trouves: 99, avecNumero: 99 }),
    mesures: async () => ({ contactes: 5, rendezVous: null, clientsGagnes: null, vues: null, soumissions: null, envois: null }),
    missions: async () => ({ lignes: [], taches: [] }),
    coutsParMission: async () => ({ lignes: [{ identifiant: "MKT-1", titre: "Mission", coutCentimes: 100, jetons: 10 }], coutSansMissionCentimes: 0 }),
    delaisDecision: async () => [3, 5],
    ...o,
  };
  const routes = routesTableau({ lectures: l, maintenant: () => new Date("2026-11-02T08:00:00.000Z") });
  const appeler = (r: Partial<RequeteRoute> = {}) => routes["tableau.direction"]!({ cle: "tableau.direction", params: {}, query: { mois: "2026-10" }, corps: null, acteur: HUMAIN, companyId: SOC, ...r });
  return { appeler, appels };
}
const erreurDe = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as ErreurAtelier | null);

describe("tableau.direction : déclaration, droits, validation", () => {
  it("route GET /tableau/direction, entreprise lue dans la requête, session humaine seulement", () => {
    expect(ROUTES_API.find((r) => r.cle === "tableau.direction")).toMatchObject({ methode: "GET", chemin: "/tableau/direction", auth: "board", resolution: { from: "query", key: "companyId" } });
  });
  it("un agent est refusé", async () => {
    expect((await erreurDe(lectures().appeler({ acteur: AGENT })))?.code).toBe("elevation_refusee");
  });
  it("mois absent ou mal formé : erreur de validation", async () => {
    expect(await erreurDe(lectures().appeler({ query: {} }))).not.toBeNull();
    expect(await erreurDe(lectures().appeler({ query: { mois: "2026-13" } }))).not.toBeNull();
  });
});

describe("tableau.direction : contenu", () => {
  it("rend les données du mois, conformes au contrat, filtrées sur l'entreprise de la requête", async () => {
    const { appeler, appels } = lectures();
    const corps = DonneesDirection.parse((await appeler()).corps);
    expect(corps).toMatchObject({ companyId: SOC, mois: "2026-10", prospects: { trouves: 10, avecNumero: 4 }, etapes: { contactes: 5, rendezVous: null, clientsGagnes: null }, delaiDecision: { heures: [3, 5] } });
    expect(corps.periode.debut).toBe("2026-10-01T00:00:00.000Z");
    expect(appels[0]![1]).toBe(SOC);
    const autre = DonneesDirection.parse((await appeler({ companyId: SOC2 })).corps);
    expect(autre.prospects?.trouves).toBe(99);
  });
  it("une lecture qui échoue donne null pour son bloc seulement, jamais 0 ni une erreur", async () => {
    const { appeler } = lectures({ prospects: async () => { throw new Error("base indisponible"); }, mesures: async () => { throw new Error("x"); } });
    const corps = DonneesDirection.parse((await appeler()).corps);
    expect(corps.prospects).toBeNull();
    expect(corps.etapes).toBeNull();
    expect(corps.captation).toBeNull();
    expect(corps.emailing).toBeNull();
    expect(corps.coutParMission).not.toBeNull();
    expect(corps.delaiDecision).toEqual({ heures: [3, 5] });
  });
});

describe("lecturesTableauSql : requêtes paramétrées et bornées à l'entreprise", () => {
  it("chaque requête filtre company_id en $1 et ne contient aucune valeur interpolée", async () => {
    const requetes: Array<{ sql: string; params: unknown[] }> = [];
    const db = { namespace: "plugin_test", query: async (sql: string, params: unknown[]) => (requetes.push({ sql, params }), [] as never[]) } as never;
    const l = lecturesTableauSql(db);
    await l.prospects(SOC, "a", "b");
    await l.mesures(SOC, "a", "b");
    expect(await l.missions(SOC, "a", "b")).toEqual({ lignes: [], taches: [] });
    expect(await l.coutsParMission(SOC, "a", "b")).toEqual({ lignes: [], coutSansMissionCentimes: 0 });
    expect(await l.delaisDecision(SOC, "a", "b")).toEqual([]);
    expect(requetes.length).toBeGreaterThanOrEqual(6);
    for (const r of requetes) {
      expect(r.sql).toMatch(/company_id = \$1/u);
      expect(r.params[0]).toBe(SOC);
      expect(r.sql).not.toContain(SOC);
    }
  });
});
