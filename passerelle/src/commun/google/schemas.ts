// Schémas d'entrée des outils Google (Search Console, GA4, Google Ads, fiche d'établissement) : mêmes noms, mêmes
// formes que les API réelles. Partagés par les simulateurs (src/demo/google/) et les fournisseurs réels (src/reel/google/).

import * as z from "zod";

// --- Search Console ---

/** Toutes les dimensions de la vraie API, pour que le schéma d'entrée soit identique ; seules certaines sont servies. */
export const DIMENSIONS_API = ["country", "device", "page", "query", "date", "hour", "searchAppearance"] as const;
export const OPERATEURS_API = ["equals", "contains", "notEquals", "notContains", "includingRegex", "excludingRegex"] as const;

const LIMITE_LIGNES_MAX = 25_000;

const schemaFiltre = z.object({
  dimension: z.enum(DIMENSIONS_API),
  operator: z.enum(OPERATEURS_API).optional(),
  expression: z.string(),
});

export const schemaEntreeGsc = {
  siteUrl: z.string().describe("Propriété : « sc-domain:renovation-liege.example » ou « https://www.renovation-liege.example/ »."),
  startDate: z.string().describe("AAAA-MM-JJ (fuseau Pacifique dans l'API réelle)."),
  endDate: z.string().describe("AAAA-MM-JJ."),
  dimensions: z.array(z.enum(DIMENSIONS_API)).optional().describe("Regroupements ; servis en démonstration : date, query, page."),
  type: z.enum(["web", "discover", "googleNews", "news", "image", "video"]).optional().describe("Type de recherche ; seul « web » est servi."),
  dimensionFilterGroups: z
    .array(z.object({ groupType: z.enum(["and"]).optional(), filters: z.array(schemaFiltre) }))
    .optional()
    .describe("Filtres sur query ou page (equals, contains, notEquals, notContains)."),
  aggregationType: z.enum(["auto", "byPage", "byProperty", "byNewsShowcasePanel"]).optional(),
  rowLimit: z.number().int().min(1).max(LIMITE_LIGNES_MAX).optional().describe("1 à 25 000 (1 000 par défaut)."),
  startRow: z.number().int().min(0).optional().describe("Décalage de pagination, à partir de 0."),
  dataState: z.enum(["final", "all", "hourly_all"]).optional(),
};


// --- Google Analytics 4 ---

const nomObjet = z.object({ name: z.string() });

export const schemaEntreeGa4 = {
  property: z.string().describe("Propriété GA4 : « properties/100000001 »."),
  dateRanges: z
    .array(z.object({ startDate: z.string(), endDate: z.string(), name: z.string().optional() }))
    .min(1)
    .describe("Une seule plage en démonstration, au format AAAA-MM-JJ."),
  dimensions: z.array(nomObjet).optional().describe("Servies : date, sessionSource, sessionMedium, sessionSourceMedium, sessionDefaultChannelGroup."),
  metrics: z.array(nomObjet).min(1).describe("Servies : sessions, engagedSessions, totalUsers, activeUsers (avec la dimension date), keyEvents, keyEvents:demande_diagnostic."),
  limit: z.number().int().min(1).max(250_000).optional().describe("10 000 par défaut."),
  offset: z.number().int().min(0).optional(),
  orderBys: z
    .array(
      z.object({
        metric: z.object({ metricName: z.string() }).optional(),
        dimension: z.object({ dimensionName: z.string() }).optional(),
        desc: z.boolean().optional(),
      }),
    )
    .optional(),
  keepEmptyRows: z.boolean().optional(),
};


// --- Google Ads ---

export const schemaEntreeAds = {
  customerId: z.string().describe("Compte Google Ads : « 0000000001 » ou « 000-000-0001 »."),
  query: z.string().min(1).describe("Requête GAQL : SELECT … FROM campaign | ad_group [WHERE …] [ORDER BY …] [LIMIT n]."),
  pageSize: z.number().int().min(1).max(10_000).optional().describe("Lignes par page (10 000 par défaut)."),
  pageToken: z.string().optional(),
  returnTotalResultsCount: z.boolean().optional(),
};


// --- Google Business Profile ---

export const METRIQUES_API = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_BOOKINGS",
  "BUSINESS_FOOD_ORDERS",
  "BUSINESS_FOOD_MENU_CLICKS",
] as const;

export const schemaEntreeAvis = {
  parent: z.string().describe("« accounts/9000000000/locations/9000000001 » (ou 2, 3) ; la forme courte « locations/9000000001 » est tolérée."),
  pageSize: z.number().int().min(1).max(50).optional().describe("Avis par page, 50 au plus (20 par défaut)."),
  pageToken: z.string().optional(),
  orderBy: z.enum(["rating", "rating desc", "updateTime desc"]).optional().describe("Tri ; « updateTime desc » par défaut."),
  debut: z.string().optional().describe("Extension de démonstration : première date d'avis (AAAA-MM-JJ). Absent : toute la période du modèle."),
  fin: z.string().optional().describe("Extension de démonstration : dernière date d'avis (AAAA-MM-JJ)."),
};

const schemaDate = z.object({ year: z.number().int().min(1).max(9999), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) });

export const schemaEntreeMetriques = {
  location: z.string().describe("« locations/9000000001 » (ou 2, 3)."),
  dailyMetrics: z.array(z.enum(METRIQUES_API)).min(1).describe("Servies : impressions (4 variantes), CALL_CLICKS, WEBSITE_CLICKS, BUSINESS_DIRECTION_REQUESTS."),
  dailyRange: z.object({ startDate: schemaDate, endDate: schemaDate }),
};

