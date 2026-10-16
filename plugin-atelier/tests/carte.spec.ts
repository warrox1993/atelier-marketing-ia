/**
 * Carte des prospects : position lue dans les réponses d'outils (OSM exacte, BCE approximative) et
 * route `prospects.carte` (points positionnés, établissements positionnés, prospects sans position comptés).
 */
import { describe, expect, it } from "vitest";
import { Prospect, ZoneProspect } from "../src/contrats/index.js";
import { PROSPECT_B2B } from "../src/contrats/exemples/prospection.js";
import { extraireProspects } from "../src/serveur/services-prospection.js";
import { routesCarte } from "../src/serveur/services-carte.js";
import type { GestionnaireRoute, RequeteRoute } from "../src/serveur/atelier.js";
import { calculerConfiance } from "../src/serveur/qualification-prospects.js";

const BCE = {
  entreprises: [
    {
      EnterpriseNumber: "0201.234.567", TypeOfEnterprise: "2", denominations: [{ Denomination: "Atelier Test SRL" }],
      adresses: [{ TypeOfAddress: "REGO", Zipcode: "4000", MunicipalityFR: "Liège" }],
      position_approx: { lat: 50.64, lon: 5.57, precision: "code_postal", source: "osm" },
    },
    { EnterpriseNumber: "0202.345.678", TypeOfEnterprise: "2", denominations: [{ Denomination: "Sans Position SA" }], adresses: [{ Zipcode: "1000", MunicipalityFR: "Bruxelles" }], position_approx: null },
    { EnterpriseNumber: "0203.456.789", TypeOfEnterprise: "2", denominations: [{ Denomination: "Précision Inconnue" }], adresses: [{ Zipcode: "4000" }], position_approx: { lat: 50.6, lon: 5.5, precision: "rue", source: "osm" } },
    { EnterpriseNumber: "0204.567.890", TypeOfEnterprise: "2", denominations: [{ Denomination: "Hors Limites" }], adresses: [{ Zipcode: "4000" }], position_approx: { lat: 250, lon: 5.5, precision: "commune", source: "osm" } },
  ],
};

describe("position lue dans les réponses", () => {
  it("BCE : position_approx reprise avec sa précision ; absente, imprécise ou hors limites : aucune position", () => {
    const { prospects } = extraireProspects("bce", "bce_rechercher", [BCE]);
    expect(prospects.map((p) => p.zone.position ?? null)).toEqual([{ lat: 50.64, lon: 5.57, precision: "code_postal" }, null, null, null]);
    for (const p of prospects) expect(ZoneProspect.safeParse(p.zone).success).toBe(true);
  });

  it("OSM : la position du commerce est exacte", () => {
    const { prospects } = extraireProspects("osm", "osm_commerces", [{ commerces: [{ id: "n1", nom: "Boulangerie", adresse: { code_postal: "4000", commune: "Liège" }, position: { lat: 50.6326, lon: 5.5797 } }, { id: "n2", nom: "Sans point" }] }]);
    expect(prospects[0]!.zone.position).toEqual({ lat: 50.6326, lon: 5.5797, precision: "exacte" });
    expect(prospects[1]!.zone.position).toBeUndefined();
  });

  it("une zone sans position (données déjà stockées) reste valide", () => {
    const sans = Prospect.parse(structuredClone(PROSPECT_B2B));
    expect(sans.zone.position).toBeUndefined();
  });
});

describe("route prospects.carte", () => {
  const SOC = "11111111-1111-4111-8111-111111111111";
  const base = Prospect.parse(structuredClone(PROSPECT_B2B));
  const ctxConf = { cibles: [], segments: [], etablissements: [], baseClientsImportee: false, maintenant: "2026-10-16T10:00:00.000Z" } as never;
  const prospect = (n: number, position: unknown): Prospect => {
    const p = { ...base, id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, denomination: `Société ${n}`, zone: { ...base.zone, ...(position ? { position } : {}) } } as Prospect;
    return { ...p, confiance: calculerConfiance(p, ctxConf) };
  };
  const tous = [
    prospect(1, { lat: 50.63, lon: 5.58, precision: "exacte" }),
    prospect(2, { lat: 50.64, lon: 5.57, precision: "code_postal" }),
    prospect(3, null),
  ];
  const requeteLister: Array<Record<string, string | string[]>> = [];
  const lister: GestionnaireRoute = async (r) => {
    requeteLister.push(r.query);
    const page = Number(r.query.page);
    return { corps: { total: tous.length, page, pages: 2, prospects: page === 1 ? tous.slice(0, 2) : tous.slice(2) } };
  };
  const routes = routesCarte({
    lister: () => lister,
    etablissements: async () => [
      { nom: "Bureau Liège", code: "bureau-liege", adresse: "Rue X 1", confirme: true, position: { lat: 50.6412, lon: 5.5718 } },
      { nom: "Bureau sans position", adresse: null, confirme: true },
      { nom: "Bureau null", adresse: null, confirme: false, position: null },
    ],
  });
  const appel = (query: Record<string, string | string[]>) =>
    routes["prospects.carte"]!({ cle: "prospects.carte", params: {}, query, corps: null, acteur: { type: "humain", id: "u", agentId: null, userId: "u", runId: null }, companyId: SOC } as RequeteRoute);

  it("renvoie les points positionnés, les bureaux positionnés et compte les prospects sans position", async () => {
    const { corps } = await appel({ companyId: SOC, statuts: "nouveau", page: "7", parPage: "3" });
    const c = corps as { total: number; positionnes: number; sansPosition: number; tronque: boolean; points: Array<Record<string, unknown>>; etablissements: Array<Record<string, unknown>> };
    expect(c).toMatchObject({ total: 3, positionnes: 2, sansPosition: 1, tronque: false });
    expect(c.points.map((p) => [p.nom, p.precision])).toEqual([["Société 1", "exacte"], ["Société 2", "code_postal"]]);
    expect(Object.keys(c.points[0]!).sort()).toEqual(["confiance", "id", "lat", "lon", "nom", "precision", "qualifie"]);
    expect(typeof c.points[0]!.confiance).toBe("number");
    expect(c.etablissements).toEqual([{ nom: "Bureau Liège", code: "bureau-liege", adresse: "Rue X 1", lat: 50.6412, lon: 5.5718, confirme: true }]);
    // Mêmes filtres que la liste ; la pagination de l'appelant est ignorée, la carte parcourt les pages.
    expect(requeteLister).toEqual([{ companyId: SOC, statuts: "nouveau", vue: "complete", page: "1", parPage: "100" }, { companyId: SOC, statuts: "nouveau", vue: "complete", page: "2", parPage: "100" }]);
  });

  it("avec qualifiesSeulement : un seul parcours, la liste paginée n'est jamais rappelée", async () => {
    let appelsQualifies = 0;
    let appelsLister = 0;
    const routesQ = routesCarte({
      lister: () => async () => { appelsLister++; return { corps: { total: 0, page: 1, pages: 1, prospects: [] } }; },
      listerQualifies: async () => { appelsQualifies++; return tous; },
      etablissements: async () => [],
    });
    const { corps } = await routesQ["prospects.carte"]!({ cle: "prospects.carte", params: {}, query: { companyId: SOC, qualifiesSeulement: "true" }, corps: null, acteur: { type: "humain", id: "u", agentId: null, userId: "u", runId: null }, companyId: SOC } as RequeteRoute);
    expect(corps).toMatchObject({ total: 3, positionnes: 2, sansPosition: 1, tronque: false });
    expect(appelsQualifies).toBe(1);
    expect(appelsLister).toBe(0);
  });

  it("avec qualifiesSeulement : au-delà de 5 000 qualifiés, la réponse est tronquée et plafonnée", async () => {
    const beaucoup = Array.from({ length: 5_001 }, (_, i) => prospect(i + 1, { lat: 50.6, lon: 5.5, precision: "exacte" }));
    const routesQ = routesCarte({ lister: () => async () => ({ corps: {} }), listerQualifies: async () => beaucoup, etablissements: async () => [] });
    const { corps } = await routesQ["prospects.carte"]!({ cle: "prospects.carte", params: {}, query: { companyId: SOC, qualifiesSeulement: "true" }, corps: null, acteur: { type: "humain", id: "u", agentId: null, userId: "u", runId: null }, companyId: SOC } as RequeteRoute);
    expect(corps).toMatchObject({ total: 5_001, positionnes: 5_000, sansPosition: null, tronque: true });
  });
});
