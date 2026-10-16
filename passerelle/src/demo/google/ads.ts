// Simulateur Google Ads : GoogleAdsService.Search (GAQL)
// (POST https://googleads.googleapis.com/v26/customers/{customerId}/googleAds:search).
// Documentation consultée le 15/10/2026 :
//   https://developers.google.com/google-ads/api/rest/common/search
//   https://developers.google.com/google-ads/api/docs/query/overview
//   https://developers.google.com/google-ads/api/reference/rpc/v20/SearchGoogleAdsResponse
// Réponse REST : { results: [GoogleAdsRow], fieldMask, nextPageToken?, totalResultsCount? } ; les champs sont en
// camelCase, les entiers 64 bits (id, impressions, clics, coût en micros) sont des chaînes, les décimaux
// (conversions, ctr, average_cpc) des nombres.
//
// Ressources servies : campaign et ad_group. Le modèle ne connaît qu'un niveau « campagne » : chaque campagne
// a UN SEUL groupe d'annonces qui porte 100 % de ses chiffres (aucun chiffre n'est réparti ni inventé).
// Refusés : mots clés, termes de recherche, appareils, zones géographiques, réseaux (non modélisés).

import * as z from "zod";
import type { OutilPasserelle } from "../../fournisseurs.js";
import { CAMPAGNES_ADS, COMPTE_ADS, DEBUT_MODELE, FIN_MODELE, type LigneAds } from "../modele/index.js";
import { ANNOTATIONS_LECTURE, modeleDemo, refuserNonModelise } from "./commun.js";
import { schemaEntreeAds } from "../../commun/google/schemas.js";
import { analyserGaql, type Condition, type Valeur } from "./gaql.js";

export const COMPTE_ADS_NUMERO = COMPTE_ADS.replace("customers/", "");

type Type = "int64" | "double" | "chaine" | "date";
interface DefChamp {
  type: Type;
  /** Disponible quand la ressource FROM est … */
  depuis: readonly ("campaign" | "ad_group")[];
}
const DEUX = ["campaign", "ad_group"] as const;
const CHAMPS: Record<string, DefChamp> = {
  "customer.id": { type: "int64", depuis: DEUX },
  "customer.currency_code": { type: "chaine", depuis: DEUX },
  "campaign.resource_name": { type: "chaine", depuis: DEUX },
  "campaign.id": { type: "int64", depuis: DEUX },
  "campaign.name": { type: "chaine", depuis: DEUX },
  "campaign.status": { type: "chaine", depuis: DEUX },
  "ad_group.resource_name": { type: "chaine", depuis: ["ad_group"] },
  "ad_group.id": { type: "int64", depuis: ["ad_group"] },
  "ad_group.name": { type: "chaine", depuis: ["ad_group"] },
  "ad_group.status": { type: "chaine", depuis: ["ad_group"] },
  "ad_group.campaign": { type: "chaine", depuis: ["ad_group"] },
  "metrics.impressions": { type: "int64", depuis: DEUX },
  "metrics.clicks": { type: "int64", depuis: DEUX },
  "metrics.cost_micros": { type: "int64", depuis: DEUX },
  "metrics.conversions": { type: "double", depuis: DEUX },
  "metrics.ctr": { type: "double", depuis: DEUX },
  "metrics.average_cpc": { type: "double", depuis: DEUX },
  "segments.date": { type: "date", depuis: DEUX },
};

const enCamel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

interface Entite {
  campagneId: string;
  campagneNom: string;
  ressourceCampagne: string;
  /** Identifiant du groupe d'annonces unique : 2 + campagne (identifiant fictif). */
  groupeId: string;
}

const ENTITES: Entite[] = CAMPAGNES_ADS.map((c) => ({
  campagneId: c.id,
  campagneNom: c.nom,
  ressourceCampagne: `${COMPTE_ADS}/campaigns/${c.id}`,
  groupeId: `2${c.id.slice(1)}`,
}));

interface Ligne {
  entite: Entite;
  date: string | null;
  impressions: number;
  clics: number;
  coutMicros: number;
  conversions: number;
}

/** Valeur brute (nombre ou chaîne) d'un champ pour une ligne : sert au filtre, au tri et à la sortie. */
function valeurChamp(champ: string, l: Ligne): string | number {
  switch (champ) {
    case "customer.id": return COMPTE_ADS_NUMERO.replace(/^0+/, "") || "0";
    case "customer.currency_code": return "EUR";
    case "campaign.resource_name": return l.entite.ressourceCampagne;
    case "campaign.id": return l.entite.campagneId;
    case "campaign.name": return l.entite.campagneNom;
    case "campaign.status": return "ENABLED";
    case "ad_group.resource_name": return `${COMPTE_ADS}/adGroups/${l.entite.groupeId}`;
    case "ad_group.id": return l.entite.groupeId;
    case "ad_group.name": return `Groupe unique · ${l.entite.campagneNom}`;
    case "ad_group.status": return "ENABLED";
    case "ad_group.campaign": return l.entite.ressourceCampagne;
    case "metrics.impressions": return l.impressions;
    case "metrics.clicks": return l.clics;
    case "metrics.cost_micros": return l.coutMicros;
    case "metrics.conversions": return l.conversions;
    case "metrics.ctr": return l.impressions > 0 ? l.clics / l.impressions : 0;
    case "metrics.average_cpc": return l.clics > 0 ? l.coutMicros / l.clics : 0;
    case "segments.date": return l.date ?? "";
    default: throw new Error(`Champ inconnu : ${champ}`);
  }
}

function verifierChamp(champ: string, ressource: "campaign" | "ad_group", contexte: string): DefChamp {
  const def = CHAMPS[champ];
  if (!def) {
    refuserNonModelise(`Champ GAQL (${contexte})`, champ, Object.keys(CHAMPS));
  }
  if (!def.depuis.includes(ressource)) {
    throw new Error(`Le champ ${champ} n'est pas sélectionnable avec FROM ${ressource} (${contexte}).`);
  }
  return def;
}

function normaliserDate(v: Valeur): string {
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) {
    throw new Error(`Date GAQL invalide : « ${s} » (format AAAA-MM-JJ attendu).`);
  }
  return s;
}

function comparer(a: string | number, op: string, b: Valeur, type: Type): boolean {
  const x = type === "double" || type === "int64" ? Number(a) : String(a);
  const y = type === "double" || type === "int64" ? Number(b) : String(b);
  if (typeof x === "number" && Number.isNaN(Number(y))) throw new Error(`Valeur non numérique « ${String(b)} » comparée à un champ numérique.`);
  switch (op) {
    case "=": return x === y;
    case "!=": return x !== y;
    case "<": return x < y;
    case "<=": return x <= y;
    case ">": return x > y;
    case ">=": return x >= y;
    default: throw new Error(`Opérateur inattendu : ${op}`);
  }
}

function filtrer(l: Ligne, c: Condition, type: Type): boolean {
  const v = valeurChamp(c.champ, l);
  if (c.operateur === "IN") return c.valeurs.some((w) => comparer(v, "=", w, type));
  if (c.operateur === "NOT IN") return !c.valeurs.some((w) => comparer(v, "=", w, type));
  if (c.operateur === "BETWEEN") return comparer(v, ">=", c.valeurs[0]!, type) && comparer(v, "<=", c.valeurs[1]!, type);
  return comparer(v, c.operateur, c.valeurs[0]!, type);
}

function lirePage(jeton: string | undefined): number {
  if (!jeton) return 0;
  const n = /^page:(\d+)$/.exec(Buffer.from(jeton, "base64url").toString("utf8"));
  if (!n) throw new Error("pageToken invalide.");
  return Number(n[1]);
}

export { schemaEntreeAds };

interface ArgsAds {
  customerId: string;
  query: string;
  pageSize?: number;
  pageToken?: string;
  returnTotalResultsCount?: boolean;
}

export function rechercheAds(args: ArgsAds): Record<string, unknown> {
  if (args.customerId.replace(/-/g, "") !== COMPTE_ADS_NUMERO) {
    throw new Error(`Compte Google Ads inconnu : « ${args.customerId} » (accès refusé). Compte du service : ${COMPTE_ADS_NUMERO}.`);
  }
  const req = analyserGaql(args.query);
  if (req.ressource !== "campaign" && req.ressource !== "ad_group") {
    refuserNonModelise("Ressource GAQL (FROM)", req.ressource, ["campaign", "ad_group"]);
  }
  const ressource = req.ressource;
  for (const ch of req.champs) verifierChamp(ch, ressource, "SELECT");
  const defsWhere = req.conditions.map((c) => ({ c, def: verifierChamp(c.champ, ressource, "WHERE") }));
  for (const t of req.tris) verifierChamp(t.champ, ressource, "ORDER BY");

  // Bornes de date : WHERE segments.date, sinon toute la durée des campagnes.
  let bas = CAMPAGNES_ADS.map((c) => c.debut).sort()[0]!;
  let haut = CAMPAGNES_ADS.map((c) => c.fin).sort().reverse()[0]!;
  let borneBas: string | null = null;
  let borneHaut: string | null = null;
  const autres: { c: Condition; def: DefChamp }[] = [];
  for (const { c, def } of defsWhere) {
    if (c.champ !== "segments.date") {
      autres.push({ c, def });
      continue;
    }
    const v = c.valeurs.map(normaliserDate);
    const maj = (inf: string | null, sup: string | null): void => {
      if (inf !== null && (borneBas === null || inf > borneBas)) borneBas = inf;
      if (sup !== null && (borneHaut === null || sup < borneHaut)) borneHaut = sup;
    };
    if (c.operateur === "BETWEEN") maj(v[0]!, v[1]!);
    else if (c.operateur === "=") maj(v[0]!, v[0]!);
    else if (c.operateur === ">=") maj(v[0]!, null);
    else if (c.operateur === ">") maj(String(new Date(Date.parse(`${v[0]}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)), null);
    else if (c.operateur === "<=") maj(null, v[0]!);
    else if (c.operateur === "<") maj(null, String(new Date(Date.parse(`${v[0]}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)));
    else throw new Error(`Opérateur ${c.operateur} non pris en charge sur segments.date (servis : BETWEEN, =, <, <=, >, >=).`);
  }
  if (borneBas !== null) bas = borneBas;
  if (borneHaut !== null) haut = borneHaut;
  // Le modèle couvre 2025-2027 : hors de cette plage il n'y a pas de campagne, donc pas de chiffre.
  if (bas < DEBUT_MODELE) bas = DEBUT_MODELE;
  if (haut > FIN_MODELE) haut = FIN_MODELE;

  const segmenteParDate = req.champs.includes("segments.date");
  const lignesModele: LigneAds[] = bas <= haut ? modeleDemo.ads({ debut: bas, fin: haut }) : [];

  let lignes: Ligne[] = [];
  for (const entite of ENTITES) {
    const siennes = lignesModele.filter((l) => l.campagneId === entite.campagneId);
    if (segmenteParDate) {
      for (const l of siennes) {
        lignes.push({ entite, date: l.date, impressions: l.impressions, clics: l.clics, coutMicros: l.coutMicros, conversions: l.conversions });
      }
    } else {
      lignes.push({
        entite,
        date: null,
        impressions: siennes.reduce((s, l) => s + l.impressions, 0),
        clics: siennes.reduce((s, l) => s + l.clics, 0),
        coutMicros: siennes.reduce((s, l) => s + l.coutMicros, 0),
        conversions: siennes.reduce((s, l) => s + l.conversions, 0),
      });
    }
  }
  for (const { c, def } of autres) lignes = lignes.filter((l) => filtrer(l, c, def.type));

  lignes.sort((a, b) => {
    for (const t of req.tris) {
      const va = valeurChamp(t.champ, a);
      const vb = valeurChamp(t.champ, b);
      const def = CHAMPS[t.champ]!;
      const [x, y] = def.type === "int64" || def.type === "double" ? [Number(va), Number(vb)] : [String(va), String(vb)];
      if (x !== y) return (x < y ? -1 : 1) * (t.decroissant ? -1 : 1);
    }
    return a.entite.campagneId.localeCompare(b.entite.campagneId) || (a.date ?? "").localeCompare(b.date ?? "");
  });
  if (req.limite !== null) lignes = lignes.slice(0, req.limite);

  const total = lignes.length;
  const taille = args.pageSize ?? 10_000;
  const debutPage = lirePage(args.pageToken);
  const page = lignes.slice(debutPage, debutPage + taille);

  const results = page.map((l) => {
    const ligne: Record<string, Record<string, unknown>> = {};
    const poser = (champ: string, valeur: unknown): void => {
      const [objet, nom] = champ.split(".") as [string, string];
      (ligne[enCamel(objet)] ??= {})[enCamel(nom)] = valeur;
    };
    // L'API renvoie toujours le nom de ressource de la ressource FROM.
    poser(`${ressource}.resource_name`, valeurChamp(`${ressource}.resource_name`, l));
    for (const ch of req.champs) {
      const v = valeurChamp(ch, l);
      poser(ch, CHAMPS[ch]!.type === "int64" ? String(v) : v);
    }
    return ligne;
  });

  const suivant = debutPage + taille < total ? Buffer.from(`page:${debutPage + taille}`).toString("base64url") : undefined;
  return {
    results,
    ...(suivant ? { nextPageToken: suivant } : {}),
    ...(args.returnTotalResultsCount ? { totalResultsCount: String(total) } : {}),
    fieldMask: req.champs.map((ch) => ch.split(".").map(enCamel).join(".")).join(","),
  };
}

export const outilAds: OutilPasserelle = {
  nom: "ads_recherche",
  description:
    "Google Ads, GoogleAdsService.Search : requête GAQL en lecture seule sur les campagnes (FROM campaign) ou les groupes d'annonces (FROM ad_group) " +
    "avec metrics.impressions, clicks, cost_micros, conversions, ctr, average_cpc et segments.date. " +
    "Démonstration : une campagne a un seul groupe d'annonces ; mots clés, termes de recherche, appareils et zones ne sont pas modélisés ; " +
    "pour une période, utiliser segments.date BETWEEN 'AAAA-MM-JJ' AND 'AAAA-MM-JJ'.",
  schemaEntree: schemaEntreeAds,
  annotations: ANNOTATIONS_LECTURE,
  executer: (args) => rechercheAds(args as unknown as ArgsAds),
};
