// Simulateurs Google (lot L5) : appels complets par le client MCP officiel du SDK sur une vraie passerelle
// lancée en test (port libre, jetons OAuth de démonstration, un service par adresse /mcp/<service>).
// Vérifie le catalogue, la forme des réponses, la mention de démonstration et `_atelier` sur CHAQUE réponse
// (succès comme erreurs), les refus de dimensions non modélisées et l'avis piégé.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { enregistrerGoogleDemo } from "../../src/demo/google/enregistrer.js";
import { MENTION_DEMONSTRATION } from "../../src/services.js";
import { AVIS_PIEGE, modeleDemo } from "../../src/demo/modele/index.js";
import { demarrer, obtenirJetons, type PasserelleDeTest } from "../aide.js";

type Contenu = { type: string; text: string };

/** Propriété choisie sur la page de consentement de démonstration (identifiants de la fiche de chaque service). */
const PROPRIETES: Record<string, string> = {
  gsc: "sc-domain:renovation-liege.example",
  ga4: "properties/100000001",
  ads: "customers/0000000001",
  gbp: "locations/9000000001",
};

describe("passerelle de démonstration + simulateurs Google, via le client MCP du SDK", () => {
  let p: PasserelleDeTest;
  const clients = new Map<string, Client>();

  async function client(service: string): Promise<Client> {
    const deja = clients.get(service);
    if (deja) return deja;
    const jeton = (await obtenirJetons(p.url, service, PROPRIETES[service])).access_token;
    const c = new Client({ name: "essai-google", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${p.url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
    clients.set(service, c);
    return c;
  }

  /** Appelle un outil et vérifie la mention et `_atelier` ; renvoie les données structurées. */
  async function appeler(service: string, nom: string, args: Record<string, unknown>): Promise<{ donnees: Record<string, any>; erreur: boolean; texte: string }> {
    const c = await client(service);
    const reponse = await c.callTool({ name: nom, arguments: args });
    const texte = (reponse["content"] as Contenu[])[0]!.text;
    expect(texte.startsWith(`${MENTION_DEMONSTRATION}\n\n`)).toBe(true);
    const donnees = reponse["structuredContent"] as Record<string, any>;
    expect(donnees["_atelier"]).toEqual({ mode: "demonstration", mention: MENTION_DEMONSTRATION });
    return { donnees, erreur: reponse["isError"] === true, texte };
  }

  beforeAll(async () => {
    const registre = enregistrerGoogleDemo(new RegistreFournisseurs());
    p = await demarrer({ registre });
  });
  afterAll(async () => {
    for (const c of clients.values()) await c.close();
    await p.arreter();
  });

  it("catalogue : chaque service expose ses outils de lecture seule (et atelier_identite)", async () => {
    const attendu: Record<string, string[]> = {
      gsc: ["gsc_requete_performances"],
      ga4: ["ga4_rapport"],
      ads: ["ads_recherche"],
      gbp: ["gbp_avis", "gbp_metriques"],
    };
    for (const [service, noms] of Object.entries(attendu)) {
      const { tools } = await (await client(service)).listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["atelier_identite", ...noms].sort());
      for (const t of tools.filter((x) => x.name !== "atelier_identite")) {
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(t.annotations?.destructiveHint, t.name).toBe(false);
        expect(t.inputSchema.type).toBe("object");
      }
    }
  });

  it("GSC : requête de performances, mêmes chiffres que le modèle", async () => {
    const { donnees, erreur } = await appeler("gsc", "gsc_requete_performances", {
      siteUrl: "sc-domain:renovation-liege.example", startDate: "2026-09-01", endDate: "2026-09-30", dimensions: ["query"], rowLimit: 3,
    });
    expect(erreur).toBe(false);
    const modele = modeleDemo.gsc({ debut: "2026-09-01", fin: "2026-09-30", dimensions: ["requete"] }).slice(0, 3);
    expect(donnees["rows"]).toEqual(modele.map((m) => ({ keys: [m.cles.requete], clicks: m.clics, impressions: m.impressions, ctr: m.ctr, position: m.position })));
    expect(donnees["responseAggregationType"]).toBe("byProperty");
  });

  it("GSC : dimension non modélisée refusée, avec mention et message clair", async () => {
    const { donnees, erreur, texte } = await appeler("gsc", "gsc_requete_performances", {
      siteUrl: "sc-domain:renovation-liege.example", startDate: "2026-09-01", endDate: "2026-09-30", dimensions: ["device"],
    });
    expect(erreur).toBe(true);
    expect(donnees["erreur"]).toBe("echec_outil");
    expect(donnees["message"]).toMatch(/« device » non modélisé/);
    expect(texte).toContain("aucune donnée n'est inventée");
  });

  it("GSC : valeur hors énumération refusée par le schéma d'entrée", async () => {
    const { donnees, erreur } = await appeler("gsc", "gsc_requete_performances", {
      siteUrl: "sc-domain:renovation-liege.example", startDate: "2026-09-01", endDate: "2026-09-30", dimensions: ["continent"],
    });
    expect(erreur).toBe(true);
    expect(donnees["erreur"]).toBe("arguments_invalides");
  });

  it("GA4 : runReport avec dimensionHeaders, metricHeaders et rows", async () => {
    const { donnees, erreur } = await appeler("ga4", "ga4_rapport", {
      property: "properties/100000001",
      dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-07" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
    });
    expect(erreur).toBe(false);
    expect(donnees["dimensionHeaders"]).toEqual([{ name: "date" }]);
    expect(donnees["metricHeaders"]).toHaveLength(2);
    expect(donnees["rows"]).toHaveLength(7);
    const modele = modeleDemo.ga4({ debut: "2026-09-01", fin: "2026-09-01" });
    expect(Number(donnees["rows"][0].metricValues[0].value)).toBe(modele.reduce((s, l) => s + l.sessions, 0));
  });

  it("GA4 : période sans données (3 au 9 août 2026) : réponse vide", async () => {
    const { donnees, erreur } = await appeler("ga4", "ga4_rapport", {
      property: "properties/100000001", dateRanges: [{ startDate: "2026-08-03", endDate: "2026-08-09" }], metrics: [{ name: "sessions" }],
    });
    expect(erreur).toBe(false);
    expect(donnees["rowCount"]).toBe(0);
    expect(donnees).not.toHaveProperty("rows");
  });

  it("GA4 : dimension appareil refusée", async () => {
    const { donnees, erreur } = await appeler("ga4", "ga4_rapport", {
      property: "properties/100000001", dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-07" }], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }],
    });
    expect(erreur).toBe(true);
    expect(donnees["message"]).toMatch(/deviceCategory.*non modélisé/);
  });

  it("Ads : requête GAQL avec campaign, ad_group et metrics.cost_micros", async () => {
    const { donnees, erreur } = await appeler("ads", "ads_recherche", {
      customerId: "000-000-0001",
      query:
        "SELECT campaign.name, ad_group.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM ad_group " +
        "WHERE segments.date BETWEEN '2027-03-01' AND '2027-06-30' ORDER BY metrics.cost_micros DESC",
    });
    expect(erreur).toBe(false);
    expect(donnees["results"]).toHaveLength(3);
    const ligne = donnees["results"][0];
    expect(ligne.campaign.name).toMatch(/^Toiture 2027/);
    expect(ligne.adGroup.name).toContain(ligne.campaign.name);
    const couts = donnees["results"].map((r: any) => Number(r.metrics.costMicros));
    expect(couts).toEqual([...couts].sort((a, b) => b - a));
    expect(couts.reduce((a: number, b: number) => a + b, 0)).toBeLessThanOrEqual(1_500_000_000);
  });

  it("Ads : termes de recherche refusés", async () => {
    const { donnees, erreur } = await appeler("ads", "ads_recherche", {
      customerId: "000-000-0001", query: "SELECT search_term_view.search_term, metrics.clicks FROM search_term_view",
    });
    expect(erreur).toBe(true);
    expect(donnees["message"]).toMatch(/non modélisé/);
  });

  it("Fiche : avis (starRating, comment, createTime, reviewReply), avis piégé mot pour mot", async () => {
    const { donnees, erreur } = await appeler("gbp", "gbp_avis", {
      parent: "accounts/9000000000/locations/9000000002", debut: "2026-09-15", fin: "2026-09-30", pageSize: 50,
    });
    expect(erreur).toBe(false);
    const piege = (donnees["reviews"] as any[]).find((a) => a.reviewId === AVIS_PIEGE.id);
    expect(piege.comment).toBe(AVIS_PIEGE.texte);
    expect(piege.starRating).toBe("FOUR");
    expect(donnees["totalReviewCount"]).toBe(donnees["reviews"].length);
    expect(typeof donnees["averageRating"]).toBe("number");
  });

  it("Fiche : métriques quotidiennes de performance", async () => {
    const { donnees, erreur } = await appeler("gbp", "gbp_metriques", {
      location: "locations/9000000001",
      dailyMetrics: ["CALL_CLICKS", "WEBSITE_CLICKS"],
      dailyRange: { startDate: { year: 2026, month: 9, day: 1 }, endDate: { year: 2026, month: 9, day: 3 } },
    });
    expect(erreur).toBe(false);
    const series = donnees["multiDailyMetricTimeSeries"][0].dailyMetricTimeSeries;
    expect(series.map((s: any) => s.dailyMetric)).toEqual(["CALL_CLICKS", "WEBSITE_CLICKS"]);
    expect(series[0].timeSeries.datedValues).toHaveLength(3);
    const modele = modeleDemo.fiche({ debut: "2026-09-02", fin: "2026-09-02" }).find((l) => l.etablissement === "liege-centre")!;
    expect(series[1].timeSeries.datedValues[1]).toEqual({ date: { year: 2026, month: 9, day: 2 }, value: String(modele.clicsSite) });
  });

  it("Fiche : métrique non modélisée refusée", async () => {
    const { erreur, donnees } = await appeler("gbp", "gbp_metriques", {
      location: "locations/9000000001", dailyMetrics: ["BUSINESS_BOOKINGS"],
      dailyRange: { startDate: { year: 2026, month: 9, day: 1 }, endDate: { year: 2026, month: 9, day: 3 } },
    });
    expect(erreur).toBe(true);
    expect(donnees["message"]).toMatch(/BUSINESS_BOOKINGS.*non modélisé/);
  });

  it("atelier_identite renvoie le mode démonstration pour les quatre services", async () => {
    for (const service of ["gsc", "ga4", "ads", "gbp"]) {
      const { donnees } = await appeler(service, "atelier_identite", {});
      expect(donnees["mode"]).toBe("demonstration");
      expect(donnees["service"]).toBe(service);
    }
  });
});
