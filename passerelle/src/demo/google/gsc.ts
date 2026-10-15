// Simulateur Search Console : searchanalytics.query
// (POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query).
// Documentation consultée le 15/10/2026 :
//   https://developers.google.com/webmaster-tools/v1/searchanalytics/query
// Réponse : { rows: [{ keys, clicks, impressions, ctr, position }], responseAggregationType }.

import * as z from "zod";
import type { OutilPasserelle } from "../../fournisseurs.js";
import type { LigneGsc } from "../modele/index.js";
import { ANNOTATIONS_LECTURE, lirePeriode, modeleDemo, refuserNonModelise } from "./commun.js";

/** Propriétés de la fiche du service (src/services.ts) ; le modèle ne distingue pas « avec ou sans www ». */
export const SITES_GSC = ["sc-domain:renovation-liege.example", "https://www.renovation-liege.example/"] as const;

/** Toutes les dimensions de la vraie API, pour que le schéma d'entrée soit identique ; seules certaines sont servies. */
const DIMENSIONS_API = ["country", "device", "page", "query", "date", "hour", "searchAppearance"] as const;
const DIMENSIONS_SERVIES = ["date", "query", "page"] as const;
type DimensionServie = (typeof DIMENSIONS_SERVIES)[number];
const VERS_MODELE: Record<DimensionServie, "date" | "requete" | "page"> = { date: "date", query: "requete", page: "page" };

const OPERATEURS_API = ["equals", "contains", "notEquals", "notContains", "includingRegex", "excludingRegex"] as const;
const OPERATEURS_SERVIS = ["equals", "contains", "notEquals", "notContains"] as const;

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

interface ArgsGsc {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: (typeof DIMENSIONS_API)[number][];
  type?: string;
  dimensionFilterGroups?: { groupType?: "and"; filters: { dimension: (typeof DIMENSIONS_API)[number]; operator?: (typeof OPERATEURS_API)[number]; expression: string }[] }[];
  aggregationType?: "auto" | "byPage" | "byProperty" | "byNewsShowcasePanel";
  rowLimit?: number;
  startRow?: number;
  dataState?: "final" | "all" | "hourly_all";
}

function dimensionsServies(liste: readonly string[], quoi: string): DimensionServie[] {
  for (const d of liste) {
    if (!(DIMENSIONS_SERVIES as readonly string[]).includes(d)) refuserNonModelise(`${quoi}`, d, DIMENSIONS_SERVIES);
  }
  return liste as DimensionServie[];
}

function appliquerOperateur(operateur: string, valeur: string, expression: string): boolean {
  const v = valeur.toLowerCase();
  const e = expression.toLowerCase();
  switch (operateur) {
    case "equals": return v === e;
    case "notEquals": return v !== e;
    case "contains": return v.includes(e);
    case "notContains": return !v.includes(e);
    default: return refuserNonModelise("Opérateur de filtre", operateur, OPERATEURS_SERVIS);
  }
}

export function requetePerformances(args: ArgsGsc): { rows?: unknown[]; responseAggregationType: string } {
  if (!(SITES_GSC as readonly string[]).includes(args.siteUrl)) {
    throw new Error(`Propriété inconnue : « ${args.siteUrl} » (accès refusé). Propriétés du compte : ${SITES_GSC.join(", ")}.`);
  }
  const { debut, fin } = lirePeriode(args.startDate, args.endDate);
  const dims = dimensionsServies(args.dimensions ?? [], "Dimension");
  if (new Set(dims).size !== dims.length) throw new Error("Dimension en double dans `dimensions`.");
  if ((args.type ?? "web") !== "web") refuserNonModelise("Type de recherche", args.type!, ["web"]);
  if (args.dataState === "hourly_all") refuserNonModelise("dataState", "hourly_all", ["final", "all"]);
  if (args.aggregationType === "byNewsShowcasePanel") refuserNonModelise("aggregationType", "byNewsShowcasePanel", ["auto", "byPage", "byProperty"]);

  const filtres: { dimension: DimensionServie; operator: string; expression: string }[] = [];
  for (const groupe of args.dimensionFilterGroups ?? []) {
    for (const f of groupe.filters) {
      const dimension = dimensionsServies([f.dimension], "Dimension de filtre")[0]!;
      if (dimension === "date") refuserNonModelise("Dimension de filtre", "date", ["query", "page"]);
      const operator = f.operator ?? "equals";
      if (!(OPERATEURS_SERVIS as readonly string[]).includes(operator)) refuserNonModelise("Opérateur de filtre", operator, OPERATEURS_SERVIS);
      filtres.push({ dimension, operator, expression: f.expression });
    }
  }

  const limite = args.rowLimit ?? 1000;
  const decalage = args.startRow ?? 0;

  let lignes: { cles: LigneGsc["cles"]; clics: number; impressions: number; ctr: number; position: number }[];
  if (filtres.length === 0) {
    lignes = modeleDemo.gsc({ debut, fin, dimensions: dims.map((d) => VERS_MODELE[d]) });
  } else {
    // Le filtre porte sur des valeurs que les dimensions demandées ne montrent pas forcément :
    // on part du grain requête + page (+ date si demandée), on filtre, puis on regroupe.
    const fin_ = [...new Set<"date" | "requete" | "page">([...dims.map((d) => VERS_MODELE[d]), "requete", "page"])];
    const brut = modeleDemo.gsc({ debut, fin, dimensions: fin_ });
    const gardees = brut.filter((l) =>
      filtres.every((f) => appliquerOperateur(f.operator, (f.dimension === "query" ? l.cles.requete : l.cles.page) ?? "", f.expression)),
    );
    const groupes = new Map<string, { cles: LigneGsc["cles"]; clics: number; impressions: number; somme: number }>();
    for (const l of gardees) {
      const cles: LigneGsc["cles"] = {};
      for (const d of dims) {
        const m = VERS_MODELE[d];
        (cles as Record<string, unknown>)[m] = (l.cles as Record<string, unknown>)[m];
      }
      const cle = JSON.stringify(cles);
      const g = groupes.get(cle) ?? { cles, clics: 0, impressions: 0, somme: 0 };
      g.clics += l.clics;
      g.impressions += l.impressions;
      g.somme += l.position * l.impressions;
      groupes.set(cle, g);
    }
    lignes = [...groupes.entries()]
      .sort(([ca, a], [cb, b]) => b.clics - a.clics || b.impressions - a.impressions || ca.localeCompare(cb))
      .map(([, g]) => ({ cles: g.cles, clics: g.clics, impressions: g.impressions, ctr: g.clics / g.impressions, position: Math.round((g.somme / g.impressions) * 100) / 100 }));
  }

  const rows = lignes.slice(decalage, decalage + limite).map((l) => ({
    // `keys` suit l'ordre des dimensions demandées ; absent quand aucune dimension n'est demandée (comme l'API).
    ...(dims.length > 0 ? { keys: dims.map((d) => (l.cles as Record<string, string | undefined>)[VERS_MODELE[d]] ?? "") } : {}),
    clicks: l.clics,
    impressions: l.impressions,
    ctr: l.ctr,
    position: l.position,
  }));

  const agregation = args.aggregationType && args.aggregationType !== "auto" ? args.aggregationType : dims.includes("page") ? "byPage" : "byProperty";
  // L'API réelle omet `rows` quand il n'y a aucune ligne.
  return rows.length > 0 ? { rows, responseAggregationType: agregation } : { responseAggregationType: agregation };
}

export const outilGsc: OutilPasserelle = {
  nom: "gsc_requete_performances",
  description:
    "Search Console, searchanalytics.query : performances de recherche (clics, impressions, CTR, position) sur une période, " +
    "regroupées par date, requête ou page. Lecture seule. Démonstration : country, device, hour et searchAppearance ne sont pas modélisés.",
  schemaEntree: schemaEntreeGsc,
  annotations: ANNOTATIONS_LECTURE,
  executer: (args) => requetePerformances(args as unknown as ArgsGsc),
};
