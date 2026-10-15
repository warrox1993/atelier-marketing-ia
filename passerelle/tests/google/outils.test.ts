// Simulateurs Google (lot L5), appels directs aux fonctions des outils : forme exacte des réponses,
// cohérence avec le modèle (mêmes périodes, mêmes totaux), refus des dimensions non modélisées, période
// GA4 vide, avis piégé rendu mot pour mot. Les chiffres attendus sont toujours relus dans `modeleDemo`.

import { describe, expect, it } from "vitest";
import { AVIS_PIEGE, CAMPAGNES_ADS, LACUNE_GA4, modeleDemo } from "../../src/demo/modele/index.js";
import { requetePerformances } from "../../src/demo/google/gsc.js";
import { rapportGa4 } from "../../src/demo/google/ga4.js";
import { rechercheAds } from "../../src/demo/google/ads.js";
import { listerAvis, metriquesQuotidiennes } from "../../src/demo/google/gbp.js";
import { analyserGaql } from "../../src/demo/google/gaql.js";

const SEPT = { startDate: "2026-09-01", endDate: "2026-09-30" };
const SITE = "sc-domain:renovation-liege.example";
const GA4 = "properties/100000001";
const ADS = "000-000-0001";
const somme = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("Search Console : searchanalytics.query", () => {
  it("renvoie rows { keys, clicks, impressions, ctr, position } et responseAggregationType", () => {
    const r = requetePerformances({ siteUrl: SITE, ...SEPT, dimensions: ["query", "page"], rowLimit: 5 }) as { rows: any[]; responseAggregationType: string };
    expect(Object.keys(r).sort()).toEqual(["responseAggregationType", "rows"]);
    expect(r.responseAggregationType).toBe("byPage");
    expect(r.rows).toHaveLength(5);
    for (const ligne of r.rows) {
      expect(Object.keys(ligne).sort()).toEqual(["clicks", "ctr", "impressions", "keys", "position"]);
      expect(ligne.keys).toHaveLength(2);
      expect(ligne.keys[1]).toMatch(/^https:\/\/renovation-liege\.example\//);
      expect(ligne.ctr).toBeGreaterThanOrEqual(0);
      expect(ligne.ctr).toBeLessThanOrEqual(1);
    }
  });

  it("reprend exactement les lignes du modèle (même période, mêmes totaux), triées par clics", () => {
    const modele = modeleDemo.gsc({ debut: SEPT.startDate, fin: SEPT.endDate, dimensions: ["requete"] });
    const r = requetePerformances({ siteUrl: SITE, ...SEPT, dimensions: ["query"], rowLimit: 25_000 }) as { rows: any[] };
    expect(r.rows).toHaveLength(modele.length);
    expect(r.rows.map((x) => [x.keys[0], x.clicks, x.impressions, x.ctr, x.position])).toEqual(
      modele.map((m) => [m.cles.requete, m.clics, m.impressions, m.ctr, m.position]),
    );
  });

  it("sans dimension : une seule ligne, sans keys, aux totaux du modèle", () => {
    const modele = modeleDemo.gsc({ debut: SEPT.startDate, fin: SEPT.endDate, dimensions: ["requete"] });
    const r = requetePerformances({ siteUrl: SITE, ...SEPT }) as { rows: any[]; responseAggregationType: string };
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).not.toHaveProperty("keys");
    expect(r.rows[0].clicks).toBe(somme(modele.map((m) => m.clics)));
    expect(r.rows[0].impressions).toBe(somme(modele.map((m) => m.impressions)));
    expect(r.responseAggregationType).toBe("byProperty");
  });

  it("dimension date : une ligne par jour, clés AAAA-MM-JJ, total identique", () => {
    const r = requetePerformances({ siteUrl: SITE, ...SEPT, dimensions: ["date"] }) as { rows: any[] };
    expect(r.rows).toHaveLength(30);
    expect(r.rows.every((x) => /^2026-09-\d{2}$/.test(x.keys[0]))).toBe(true);
    const total = requetePerformances({ siteUrl: SITE, ...SEPT }) as { rows: any[] };
    expect(somme(r.rows.map((x) => x.clicks))).toBe(total.rows[0].clicks);
  });

  it("filtre contains sur query : mêmes clics que les lignes du modèle qui contiennent le mot", () => {
    const modele = modeleDemo.gsc({ debut: SEPT.startDate, fin: SEPT.endDate, dimensions: ["requete"] }).filter((m) => m.cles.requete!.includes("toiture"));
    const r = requetePerformances({
      siteUrl: SITE, ...SEPT, dimensions: ["query"],
      dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "query", operator: "contains", expression: "toiture" }] }],
    }) as { rows: any[] };
    expect(modele.length).toBeGreaterThan(0);
    expect(r.rows.map((x) => x.keys[0]).sort()).toEqual(modele.map((m) => m.cles.requete!).sort());
    expect(somme(r.rows.map((x) => x.clicks))).toBe(somme(modele.map((m) => m.clics)));
  });

  it("pagination rowLimit / startRow", () => {
    const tout = requetePerformances({ siteUrl: SITE, ...SEPT, dimensions: ["query"] }) as { rows: any[] };
    const page = requetePerformances({ siteUrl: SITE, ...SEPT, dimensions: ["query"], rowLimit: 3, startRow: 2 }) as { rows: any[] };
    expect(page.rows).toEqual(tout.rows.slice(2, 5));
  });

  it("la propriété avec préfixe d'URL (fiche du service) est acceptée", () => {
    const r = requetePerformances({ siteUrl: "https://www.renovation-liege.example/", ...SEPT }) as { rows: any[] };
    expect(r.rows).toHaveLength(1);
  });

  it("refuse les dimensions, types, opérateurs et états non modélisés, sans rien inventer", () => {
    for (const dimension of ["country", "device", "hour", "searchAppearance"] as const) {
      expect(() => requetePerformances({ siteUrl: SITE, ...SEPT, dimensions: [dimension] })).toThrow(/non modélisé/);
    }
    expect(() => requetePerformances({ siteUrl: SITE, ...SEPT, type: "image" })).toThrow(/Type de recherche/);
    expect(() => requetePerformances({ siteUrl: SITE, ...SEPT, dataState: "hourly_all" })).toThrow(/hourly_all/);
    expect(() =>
      requetePerformances({ siteUrl: SITE, ...SEPT, dimensionFilterGroups: [{ filters: [{ dimension: "country", operator: "equals", expression: "bel" }] }] }),
    ).toThrow(/Dimension de filtre/);
    expect(() =>
      requetePerformances({ siteUrl: SITE, ...SEPT, dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "includingRegex", expression: ".*" }] }] }),
    ).toThrow(/Opérateur de filtre/);
  });

  it("refuse une propriété inconnue, des dates relatives, hors période ou inversées", () => {
    expect(() => requetePerformances({ siteUrl: "sc-domain:autre.example", ...SEPT })).toThrow(/Propriété inconnue/);
    expect(() => requetePerformances({ siteUrl: SITE, startDate: "7daysAgo", endDate: "today" })).toThrow(/dates relatives/);
    expect(() => requetePerformances({ siteUrl: SITE, startDate: "2030-01-01", endDate: "2030-01-31" })).toThrow(/hors de la période/);
    expect(() => requetePerformances({ siteUrl: SITE, startDate: "2026-09-30", endDate: "2026-09-01" })).toThrow(/précéder/);
  });
});

describe("GA4 : runReport", () => {
  const base = { property: GA4, dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-30" }] };

  it("forme exacte : headers, rows { dimensionValues, metricValues }, rowCount, metadata, kind", () => {
    const r = rapportGa4({ ...base, dimensions: [{ name: "date" }, { name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }] }) as any;
    expect(Object.keys(r).sort()).toEqual(["dimensionHeaders", "kind", "metadata", "metricHeaders", "rowCount", "rows"]);
    expect(r.dimensionHeaders).toEqual([{ name: "date" }, { name: "sessionSourceMedium" }]);
    expect(r.metricHeaders).toEqual([{ name: "sessions", type: "TYPE_INTEGER" }, { name: "keyEvents", type: "TYPE_INTEGER" }]);
    expect(r.metadata).toEqual({ currencyCode: "EUR", timeZone: "Europe/Brussels" });
    expect(r.kind).toBe("analyticsData#runReport");
    expect(r.rowCount).toBe(r.rows.length);
    for (const ligne of r.rows) {
      expect(Object.keys(ligne).sort()).toEqual(["dimensionValues", "metricValues"]);
      expect(ligne.dimensionValues[0].value).toMatch(/^202609\d{2}$/);
      expect(ligne.dimensionValues[1].value).toMatch(/ \/ /);
      for (const v of ligne.metricValues) expect(v.value).toMatch(/^\d+$/);
    }
  });

  it("totaux identiques à ceux du modèle, par canal", () => {
    const modele = modeleDemo.ga4({ debut: "2026-09-01", fin: "2026-09-30" });
    const r = rapportGa4({ ...base, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents:demande_diagnostic" }] }) as any;
    const attendu = new Map<string, number[]>();
    for (const l of modele) {
      const a = attendu.get(l.groupeCanaux) ?? [0, 0, 0];
      a[0]! += l.sessions; a[1]! += l.sessionsEngagees; a[2]! += l.demandesDiagnostic;
      attendu.set(l.groupeCanaux, a);
    }
    const obtenu = new Map<string, number[]>(r.rows.map((x: any) => [x.dimensionValues[0].value, x.metricValues.map((m: any) => Number(m.value))]));
    for (const [groupe, valeurs] of attendu) expect(obtenu.get(groupe), groupe).toEqual(valeurs);
  });

  it("cohérence avec Search Console : sessions google / organic = clics GSC × 0,85 à 0,95", () => {
    const ga4 = rapportGa4({ ...base, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }] }) as any;
    const organique = Number(ga4.rows.find((x: any) => x.dimensionValues[0].value === "google / organic").metricValues[0].value);
    const gsc = requetePerformances({ siteUrl: SITE, ...SEPT }) as any;
    const ratio = organique / gsc.rows[0].clicks;
    expect(ratio).toBeGreaterThanOrEqual(0.85);
    expect(ratio).toBeLessThanOrEqual(0.95);
  });

  it("orderBys, limit et offset", () => {
    const r = rapportGa4({
      ...base, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 3,
    }) as any;
    const valeurs = r.rows.map((x: any) => Number(x.metricValues[0].value));
    expect(r.rows).toHaveLength(3);
    expect(valeurs).toEqual([...valeurs].sort((a, b) => b - a));
    expect(r.rowCount).toBeGreaterThan(3);
  });

  it("totalUsers : servi avec la dimension date seulement", () => {
    const r = rapportGa4({ ...base, dimensions: [{ name: "date" }], metrics: [{ name: "totalUsers" }] }) as any;
    expect(r.rows).toHaveLength(30);
    expect(() => rapportGa4({ ...base, metrics: [{ name: "totalUsers" }] })).toThrow(/dimension date/);
  });

  it("période sans données : rapport vide conforme à l'API (pas de rows, rowCount 0, en-têtes présents)", () => {
    const r = rapportGa4({
      property: GA4, dateRanges: [{ startDate: LACUNE_GA4.debut, endDate: LACUNE_GA4.fin }],
      dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }],
    }) as any;
    expect(r).not.toHaveProperty("rows");
    expect(r.rowCount).toBe(0);
    expect(r.dimensionHeaders).toEqual([{ name: "date" }]);
    expect(r.metricHeaders).toEqual([{ name: "sessions", type: "TYPE_INTEGER" }]);
    expect(modeleDemo.donneesDisponibles("ga4", LACUNE_GA4.debut)).toBe(false);
  });

  it("une période qui chevauche la lacune ne contient aucun jour de la lacune", () => {
    const r = rapportGa4({ property: GA4, dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-15" }], dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }] }) as any;
    const jours = r.rows.map((x: any) => x.dimensionValues[0].value as string);
    expect(jours.some((j: string) => j >= "20260803" && j <= "20260809")).toBe(false);
    expect(jours).toContain("20260802");
    expect(jours).toContain("20260810");
  });

  it("refuse dimensions et métriques non modélisées, plages multiples, propriété inconnue", () => {
    for (const nom of ["deviceCategory", "country", "city", "pagePath", "eventName", "landingPage"]) {
      expect(() => rapportGa4({ ...base, dimensions: [{ name: nom }], metrics: [{ name: "sessions" }] }), nom).toThrow(/non modélisé/);
    }
    for (const nom of ["eventCount", "screenPageViews", "bounceRate", "conversions", "purchaseRevenue"]) {
      expect(() => rapportGa4({ ...base, metrics: [{ name: nom }] }), nom).toThrow(/non modélisé/);
    }
    expect(() => rapportGa4({ property: GA4, dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-02" }, { startDate: "2026-08-01", endDate: "2026-08-02" }], metrics: [{ name: "sessions" }] })).toThrow(/plages/);
    expect(() => rapportGa4({ ...base, property: "properties/1", metrics: [{ name: "sessions" }] })).toThrow(/Propriété inconnue/);
  });
});

describe("Google Ads : GAQL", () => {
  const PERIODE = "segments.date BETWEEN '2027-03-01' AND '2027-06-30'";

  it("analyse GAQL : SELECT, FROM, WHERE, ORDER BY, LIMIT ; refuse PARAMETERS, DURING, OR", () => {
    const q = analyserGaql("select campaign.name, metrics.clicks from campaign where metrics.clicks > 10 and campaign.status = ENABLED order by metrics.clicks desc limit 5");
    expect(q).toMatchObject({ champs: ["campaign.name", "metrics.clicks"], ressource: "campaign", limite: 5 });
    expect(q.conditions.map((c) => c.operateur)).toEqual([">", "="]);
    expect(q.tris).toEqual([{ champ: "metrics.clicks", decroissant: true }]);
    expect(() => analyserGaql("SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_30_DAYS")).toThrow(/DURING|non pris en charge/);
    expect(() => analyserGaql("SELECT campaign.id FROM campaign PARAMETERS include_drafts=true")).toThrow(/PARAMETERS/);
    expect(() => analyserGaql("SELECT campaign.id FROM campaign WHERE campaign.id = 1 OR campaign.id = 2")).toThrow(/OR/);
    expect(() => analyserGaql("DELETE campaign")).toThrow(/SELECT/);
  });

  it("forme : results, fieldMask ; entiers 64 bits en chaînes, conversions en nombre, camelCase", () => {
    const r = rechercheAds({
      customerId: ADS,
      query: `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${PERIODE}`,
    }) as any;
    expect(Object.keys(r).sort()).toEqual(["fieldMask", "results"]);
    expect(r.fieldMask).toBe("campaign.id,campaign.name,campaign.status,metrics.impressions,metrics.clicks,metrics.costMicros,metrics.conversions");
    expect(r.results).toHaveLength(CAMPAGNES_ADS.length);
    const ligne = r.results[0];
    expect(Object.keys(ligne).sort()).toEqual(["campaign", "metrics"]);
    expect(Object.keys(ligne.campaign).sort()).toEqual(["id", "name", "resourceName", "status"]);
    expect(ligne.campaign.resourceName).toBe("customers/0000000001/campaigns/1000000001");
    expect(ligne.campaign.id).toBe("1000000001");
    expect(ligne.campaign.status).toBe("ENABLED");
    for (const cle of ["impressions", "clicks", "costMicros"]) expect(typeof ligne.metrics[cle]).toBe("string");
    expect(typeof ligne.metrics.conversions).toBe("number");
  });

  it("totaux par campagne = somme du modèle ; coût total tenu dans le budget de 1 500 €", () => {
    const r = rechercheAds({
      customerId: ADS,
      query: `SELECT campaign.id, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${PERIODE}`,
    }) as any;
    const modele = modeleDemo.ads({ debut: "2027-03-01", fin: "2027-06-30" });
    for (const ligne of r.results) {
      const siennes = modele.filter((m) => m.campagneId === ligne.campaign.id);
      expect(Number(ligne.metrics.clicks)).toBe(somme(siennes.map((m) => m.clics)));
      expect(Number(ligne.metrics.impressions)).toBe(somme(siennes.map((m) => m.impressions)));
      expect(Number(ligne.metrics.costMicros)).toBe(somme(siennes.map((m) => m.coutMicros)));
      expect(ligne.metrics.conversions).toBe(somme(siennes.map((m) => m.conversions)));
    }
    const coutTotal = somme(r.results.map((l: any) => Number(l.metrics.costMicros)));
    expect(coutTotal).toBeGreaterThan(0);
    expect(coutTotal).toBeLessThanOrEqual(1_500_000_000);
  });

  it("conversions Ads = événements clés GA4 des sessions google / cpc sur la même période", () => {
    const ads = rechercheAds({ customerId: ADS, query: `SELECT metrics.conversions FROM campaign WHERE ${PERIODE}` }) as any;
    const conversions = somme(ads.results.map((l: any) => l.metrics.conversions));
    const ga4 = rapportGa4({
      property: GA4, dateRanges: [{ startDate: "2027-03-01", endDate: "2027-06-30" }],
      dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "keyEvents" }],
    }) as any;
    const cpc = Number(ga4.rows.find((x: any) => x.dimensionValues[0].value === "google / cpc").metricValues[0].value);
    expect(conversions).toBe(cpc);
  });

  it("segments.date : une ligne par jour de campagne, dates AAAA-MM-JJ, tri et limite", () => {
    const r = rechercheAds({
      customerId: ADS,
      query: "SELECT campaign.name, segments.date, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2027-03-01' AND '2027-03-07' AND campaign.id = 1000000001 ORDER BY segments.date DESC LIMIT 4",
    }) as any;
    expect(r.results).toHaveLength(4);
    const dates = r.results.map((x: any) => x.segments.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe("2027-03-07");
    const modele = modeleDemo.ads({ debut: "2027-03-07", fin: "2027-03-07" }).find((m) => m.campagneId === "1000000001")!;
    expect(r.results[0].metrics.clicks).toBe(String(modele.clics));
  });

  it("FROM ad_group : un groupe par campagne avec les chiffres de sa campagne ; filtres et ordre sur les métriques", () => {
    const r = rechercheAds({
      customerId: "0000000001",
      query: `SELECT campaign.name, ad_group.id, ad_group.name, metrics.clicks, metrics.ctr, metrics.average_cpc FROM ad_group WHERE ${PERIODE} AND metrics.clicks > 0 ORDER BY metrics.clicks DESC`,
      returnTotalResultsCount: true,
    }) as any;
    expect(r.totalResultsCount).toBe("3");
    expect(r.results[0].adGroup.resourceName).toMatch(/^customers\/0000000001\/adGroups\/2000000\d{3}$/);
    const clics = r.results.map((x: any) => Number(x.metrics.clicks));
    expect(clics).toEqual([...clics].sort((a, b) => b - a));
    const m = r.results[0].metrics;
    expect(m.ctr).toBeGreaterThanOrEqual(0.02);
    expect(m.ctr).toBeLessThanOrEqual(0.12);
    expect(m.averageCpc).toBeGreaterThanOrEqual(1_200_000);
    expect(m.averageCpc).toBeLessThanOrEqual(2_500_000);
  });

  it("hors période des campagnes : campagnes présentes avec des zéros (comme l'API) ; pagination par pageToken", () => {
    const vide = rechercheAds({ customerId: ADS, query: "SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2026-09-01' AND '2026-09-30'" }) as any;
    expect(vide.results.every((x: any) => x.metrics.clicks === "0")).toBe(true);
    const p1 = rechercheAds({ customerId: ADS, query: `SELECT campaign.id FROM campaign WHERE ${PERIODE}`, pageSize: 2 }) as any;
    expect(p1.results).toHaveLength(2);
    const p2 = rechercheAds({ customerId: ADS, query: `SELECT campaign.id FROM campaign WHERE ${PERIODE}`, pageSize: 2, pageToken: p1.nextPageToken }) as any;
    expect(p2.results).toHaveLength(1);
    expect(p2).not.toHaveProperty("nextPageToken");
  });

  it("refuse termes de recherche, appareils, mots clés, autres ressources et comptes inconnus", () => {
    expect(() => rechercheAds({ customerId: ADS, query: "SELECT search_term_view.search_term, metrics.clicks FROM search_term_view" })).toThrow(/non modélisé/);
    expect(() => rechercheAds({ customerId: ADS, query: "SELECT campaign.id, segments.device FROM campaign" })).toThrow(/segments\.device.*non modélisé/);
    expect(() => rechercheAds({ customerId: ADS, query: "SELECT ad_group_criterion.keyword.text FROM keyword_view" })).toThrow(/non modélisé/);
    expect(() => rechercheAds({ customerId: ADS, query: "SELECT ad_group.id FROM campaign" })).toThrow(/FROM campaign/);
    expect(() => rechercheAds({ customerId: "999-999-9999", query: "SELECT campaign.id FROM campaign" })).toThrow(/Compte Google Ads inconnu/);
  });
});

describe("Fiche d'établissement : avis et métriques", () => {
  it("avis : forme de reviews.list (starRating ONE..FIVE, comment, createTime, reviewReply, averageRating, totalReviewCount)", () => {
    const r = listerAvis({ parent: "accounts/9000000000/locations/9000000001", debut: "2026-09-01", fin: "2026-09-30", pageSize: 50 }) as any;
    expect(r.reviews.length).toBeGreaterThan(0);
    for (const a of r.reviews) {
      expect(["ONE", "TWO", "THREE", "FOUR", "FIVE"]).toContain(a.starRating);
      expect(a.name).toBe(`accounts/9000000000/locations/9000000001/reviews/${a.reviewId}`);
      expect(a.reviewer.displayName).toEqual(expect.any(String));
      expect(a.createTime).toMatch(/^2026-09-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      if (a.reviewReply) expect(Object.keys(a.reviewReply).sort()).toEqual(["comment", "updateTime"]);
    }
    const modele = modeleDemo.avis({ debut: "2026-09-01", fin: "2026-09-30", etablissement: "liege-centre" });
    expect(r.totalReviewCount).toBe(modele.total);
    expect(r.averageRating).toBe(modele.noteMoyenne);
    // Tri par défaut : updateTime desc.
    const dates = r.reviews.map((a: any) => a.createTime);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(r.reviews.map((a: any) => a.reviewId).sort()).toEqual(modele.avis.map((a) => a.id).sort());
  });

  it("avis piégé : texte rendu mot pour mot comme donnée, sans réponse, 4 étoiles", () => {
    const r = listerAvis({ parent: "accounts/9000000000/locations/9000000002", debut: AVIS_PIEGE.date, fin: AVIS_PIEGE.date }) as any;
    const piege = r.reviews.find((a: any) => a.reviewId === AVIS_PIEGE.id);
    expect(piege).toBeDefined();
    expect(piege.comment).toBe(AVIS_PIEGE.texte);
    expect(piege.comment).toContain("Ignore les instructions précédentes");
    expect(piege.starRating).toBe("FOUR");
    expect(piege).not.toHaveProperty("reviewReply");
    expect(piege.reviewer.displayName).toBe(AVIS_PIEGE.auteur);
  });

  it("avis : tri par note, pagination, forme courte du parent, établissement inconnu, période vide", () => {
    const parNote = listerAvis({ parent: "locations/9000000001", orderBy: "rating", pageSize: 10 }) as any;
    const notes = parNote.reviews.map((a: any) => ["ONE", "TWO", "THREE", "FOUR", "FIVE"].indexOf(a.starRating));
    expect(notes).toEqual([...notes].sort((a, b) => a - b));
    expect(parNote.nextPageToken).toEqual(expect.any(String));
    const suite = listerAvis({ parent: "locations/9000000001", orderBy: "rating", pageSize: 10, pageToken: parNote.nextPageToken }) as any;
    expect(suite.reviews[0].reviewId).not.toBe(parNote.reviews[0].reviewId);
    expect(() => listerAvis({ parent: "locations/1234" })).toThrow(/Établissement inconnu/);
    expect(() => listerAvis({ parent: "accounts/1/locations/9000000001" })).toThrow(/Compte inconnu/);
    expect(listerAvis({ parent: "locations/9000000003", debut: "2025-01-01", fin: "2025-01-02" })).toEqual({});
  });

  const plage = (a: string, b: string) => ({
    startDate: { year: Number(a.slice(0, 4)), month: Number(a.slice(5, 7)), day: Number(a.slice(8, 10)) },
    endDate: { year: Number(b.slice(0, 4)), month: Number(b.slice(5, 7)), day: Number(b.slice(8, 10)) },
  });

  it("métriques : multiDailyMetricTimeSeries > dailyMetricTimeSeries > timeSeries.datedValues, valeurs = modèle", () => {
    const r = metriquesQuotidiennes({
      location: "locations/9000000002",
      dailyMetrics: ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"],
      dailyRange: plage("2026-09-01", "2026-09-30"),
    }) as any;
    expect(Object.keys(r)).toEqual(["multiDailyMetricTimeSeries"]);
    const series = r.multiDailyMetricTimeSeries[0].dailyMetricTimeSeries;
    expect(series.map((s: any) => s.dailyMetric)).toEqual(["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]);
    const modele = modeleDemo.fiche({ debut: "2026-09-01", fin: "2026-09-30" }).filter((l) => l.etablissement === "liege-outremeuse");
    const appels = series[0].timeSeries.datedValues;
    expect(appels).toHaveLength(30);
    expect(appels[0]).toEqual({ date: { year: 2026, month: 9, day: 1 }, value: String(modele[0]!.clicsAppel) });
    expect(appels.map((v: any) => Number(v.value))).toEqual(modele.map((l) => l.clicsAppel));
    expect(series[3].timeSeries.datedValues.map((v: any) => Number(v.value))).toEqual(modele.map((l) => l.impressionsRechercheMobile));
  });

  it("métriques : refuse les métriques non modélisées et les établissements inconnus", () => {
    for (const m of ["BUSINESS_CONVERSATIONS", "BUSINESS_BOOKINGS", "BUSINESS_FOOD_ORDERS", "BUSINESS_FOOD_MENU_CLICKS"]) {
      expect(() => metriquesQuotidiennes({ location: "locations/9000000001", dailyMetrics: [m], dailyRange: plage("2026-09-01", "2026-09-02") }), m).toThrow(/non modélisé/);
    }
    expect(() => metriquesQuotidiennes({ location: "locations/1", dailyMetrics: ["CALL_CLICKS"], dailyRange: plage("2026-09-01", "2026-09-02") })).toThrow(/Établissement inconnu/);
  });
});
