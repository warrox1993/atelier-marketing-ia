// Simulateur GA4 : Google Analytics Data API, properties.runReport
// (POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport).
// Documentation consultée le 15/10/2026 :
//   https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
//   https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/RunReportResponse
//   https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
// Réponse : { dimensionHeaders, metricHeaders, rows: [{ dimensionValues, metricValues }], rowCount, metadata, kind }.
// Pendant la lacune de données (modeleDemo.donneesDisponibles("ga4", …) faux), le modèle ne renvoie aucune
// ligne : la réponse est vide (pas de `rows`, rowCount 0), comme l'API réelle sans données.

import * as z from "zod";
import type { OutilPasserelle } from "../../fournisseurs.js";
import { ANNOTATIONS_LECTURE, dateCompacte, lirePeriode, modeleDemo, refuserNonModelise } from "./commun.js";
import { schemaEntreeGa4 } from "../../commun/google/schemas.js";
import { type LigneGa4 } from "../modele/index.js";

export const PROPRIETE_GA4 = "properties/100000001";

/** Nom d'API → valeur de la ligne du modèle. */
const DIMENSIONS: Record<string, (l: LigneGa4) => string> = {
  date: (l) => dateCompacte(l.date),
  sessionSource: (l) => l.source,
  sessionMedium: (l) => l.support,
  sessionSourceMedium: (l) => `${l.source} / ${l.support}`,
  sessionDefaultChannelGroup: (l) => l.groupeCanaux,
};

const METRIQUES: Record<string, (l: LigneGa4) => number> = {
  sessions: (l) => l.sessions,
  engagedSessions: (l) => l.sessionsEngagees,
  totalUsers: (l) => l.utilisateurs,
  activeUsers: (l) => l.utilisateurs,
  keyEvents: (l) => l.demandesDiagnostic,
  "keyEvents:demande_diagnostic": (l) => l.demandesDiagnostic,
};

/**
 * Le modèle donne des utilisateurs par jour : le total sur plusieurs jours (utilisateurs
 * distincts) n'est pas la somme des jours. Ces métriques exigent donc la dimension `date`.
 */
const METRIQUES_UTILISATEURS = new Set(["totalUsers", "activeUsers"]);

export { schemaEntreeGa4 };

interface ArgsGa4 {
  property: string;
  dateRanges: { startDate: string; endDate: string; name?: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  limit?: number;
  offset?: number;
  orderBys?: { metric?: { metricName: string }; dimension?: { dimensionName: string }; desc?: boolean }[];
  keepEmptyRows?: boolean;
}

const ligneVide = (l: LigneGa4): boolean => l.sessions === 0;

export function rapportGa4(args: ArgsGa4): Record<string, unknown> {
  if (args.property !== PROPRIETE_GA4) {
    throw new Error(`Propriété inconnue : « ${args.property} » (accès refusé). Propriété du compte : ${PROPRIETE_GA4}.`);
  }
  if (args.dateRanges.length !== 1) {
    refuserNonModelise("Nombre de plages de dates", String(args.dateRanges.length), ["1 plage (la dimension dateRange n'est pas modélisée)"]);
  }
  const plage = args.dateRanges[0]!;
  const { debut, fin } = lirePeriode(plage.startDate, plage.endDate);

  const nomsDimensions = (args.dimensions ?? []).map((d) => d.name);
  for (const n of nomsDimensions) if (!(n in DIMENSIONS)) refuserNonModelise("Dimension", n, Object.keys(DIMENSIONS));
  if (new Set(nomsDimensions).size !== nomsDimensions.length) throw new Error("Dimension en double dans `dimensions`.");
  const nomsMetriques = args.metrics.map((m) => m.name);
  for (const n of nomsMetriques) if (!(n in METRIQUES)) refuserNonModelise("Métrique", n, Object.keys(METRIQUES));
  if (new Set(nomsMetriques).size !== nomsMetriques.length) throw new Error("Métrique en double dans `metrics`.");
  for (const n of nomsMetriques) {
    if (METRIQUES_UTILISATEURS.has(n) && !nomsDimensions.includes("date")) {
      throw new Error(`La métrique ${n} n'est servie qu'avec la dimension date : le modèle compte les utilisateurs par jour, un total sur plusieurs jours serait inventé.`);
    }
  }
  for (const o of args.orderBys ?? []) {
    if (o.metric && !nomsMetriques.includes(o.metric.metricName)) throw new Error(`orderBys : la métrique ${o.metric.metricName} n'est pas dans le rapport.`);
    if (o.dimension && !nomsDimensions.includes(o.dimension.dimensionName)) throw new Error(`orderBys : la dimension ${o.dimension.dimensionName} n'est pas dans le rapport.`);
    if (!o.metric && !o.dimension) throw new Error("orderBys : indiquer `metric` ou `dimension`.");
  }

  const groupes = new Map<string, { dims: string[]; mets: number[] }>();
  for (const l of modeleDemo.ga4({ debut, fin })) {
    if (!args.keepEmptyRows && ligneVide(l)) continue;
    const dims = nomsDimensions.map((n) => DIMENSIONS[n]!(l));
    const cle = JSON.stringify(dims);
    const g = groupes.get(cle) ?? { dims, mets: nomsMetriques.map(() => 0) };
    nomsMetriques.forEach((n, i) => {
      g.mets[i]! += METRIQUES[n]!(l);
    });
    groupes.set(cle, g);
  }

  let lignes = [...groupes.values()];
  // Ordre : orderBys s'il est donné ; sinon dimensions croissantes (l'ordre par défaut n'est pas précisé par la documentation).
  const criteres = (args.orderBys ?? []).map((o) => ({
    lire: o.metric ? (g: { dims: string[]; mets: number[] }) => g.mets[nomsMetriques.indexOf(o.metric!.metricName)]! : (g: { dims: string[]; mets: number[] }) => g.dims[nomsDimensions.indexOf(o.dimension!.dimensionName)]!,
    desc: o.desc === true,
  }));
  lignes.sort((a, b) => {
    for (const c of criteres) {
      const va = c.lire(a);
      const vb = c.lire(b);
      if (va !== vb) return (va < vb ? -1 : 1) * (c.desc ? -1 : 1);
    }
    return JSON.stringify(a.dims).localeCompare(JSON.stringify(b.dims));
  });

  const total = lignes.length;
  const decalage = args.offset ?? 0;
  lignes = lignes.slice(decalage, decalage + (args.limit ?? 10_000));

  return {
    dimensionHeaders: nomsDimensions.map((name) => ({ name })),
    metricHeaders: nomsMetriques.map((name) => ({ name, type: "TYPE_INTEGER" })),
    ...(lignes.length > 0
      ? {
          rows: lignes.map((g) => ({
            dimensionValues: g.dims.map((value) => ({ value })),
            metricValues: g.mets.map((m) => ({ value: String(m) })),
          })),
        }
      : {}),
    rowCount: total,
    metadata: { currencyCode: "EUR", timeZone: "Europe/Brussels" },
    kind: "analyticsData#runReport",
  };
}


export const outilGa4: OutilPasserelle = {
  nom: "ga4_rapport",
  description:
    "Google Analytics 4, runReport : rapport de sessions, utilisateurs et événements clés (demande_diagnostic) par date, " +
    "source, support ou groupe de canaux. Lecture seule. Démonstration : appareil, pays, pages et événements autres que la demande de diagnostic ne sont pas modélisés ; " +
    "une période sans données renvoie un rapport vide.",
  schemaEntree: schemaEntreeGa4,
  annotations: ANNOTATIONS_LECTURE,
  executer: (args) => rapportGa4(args as unknown as ArgsGa4),
};
