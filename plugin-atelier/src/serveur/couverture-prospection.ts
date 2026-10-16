/**
 * Couverture géographique d'une campagne de prospection, CALCULÉE par la machine (jamais choisie par l'agent).
 *
 * 1. Zones à interroger : chaque code postal belge dont la position approximative (référentiel
 *    `codes-postaux-be.ts`, dérivé d'OpenStreetMap) est à moins du rayon d'au moins un bureau positionné
 *    de la fiche du client.
 * 2. Zones interrogées : d'après les dépôts signés `osm_commerces` et `bce_rechercher` de la campagne
 *    (arguments vérifiés contre la signature de la passerelle). Une requête ne compte que si TOUTES ses
 *    pages ont été déposées ; elle couvre un code postal si elle le nomme, nomme l'une de ses communes,
 *    sa province ou sa région, ou ne filtre aucune zone.
 * 3. Contrôle du livrable : zones manquantes, sommes fausses (« 2 + 37 + 127 = 166 »), « Total OpenStreetMap »
 *    ou « Total BCE » différent du total machine, « N codes postaux » annoncés mais pas autant nommés.
 *
 * Fonctions pures : mêmes entrées, même résultat.
 */
import { distanceKm, provinceDuCodePostal, regionDeLaProvince } from "./geo.js";
import { CODES_POSTAUX_BE, SOURCE_CODES_POSTAUX, type LigneCodePostal } from "./codes-postaux-be.js";

export const OUTILS_COUVERTURE = ["osm_commerces", "bce_rechercher"] as const;
export type OutilCouverture = (typeof OUTILS_COUVERTURE)[number];
const LIBELLE_OUTIL: Record<OutilCouverture, string> = { osm_commerces: "OpenStreetMap", bce_rechercher: "BCE" };

export interface BureauCouverture {
  nom: string;
  code: string | null;
  lat: number;
  lon: number;
}

/** Un dépôt signé tel que le journal `prospects.deposes` le garde. */
export interface DepotCouverture {
  issueId: string | null;
  outil: string;
  /** Arguments de l'appel, vérifiés contre la signature ; null si l'agent ne les a pas fournis. */
  arguments: Record<string, unknown> | null;
  total: number | null;
  page: number | null;
  pages: number | null;
  /** Taille de page demandée et nombre de résultats renvoyés, quand la réponse les donne (facultatifs). */
  taillePage?: number | null;
  renvoyes?: number | null;
  creeLe: string;
}

export interface ZoneCouverture {
  codePostal: string;
  communes: string[];
  distanceKm: number;
  bureau: string;
  interrogee: Record<OutilCouverture, boolean>;
  couverte: boolean;
}

export interface RequeteCouverture {
  outil: OutilCouverture;
  arguments: Record<string, unknown>;
  total: number | null;
  pagesAttendues: number;
  pagesDeposees: number[];
  complete: boolean;
}

export interface ResultatCouverture {
  rayonKm: number;
  bureaux: BureauCouverture[];
  zones: ZoneCouverture[];
  /** Outils dont la campagne a déjà déposé au moins une requête : chaque zone doit l'être par chacun d'eux. */
  outilsRequis: OutilCouverture[];
  manquantes: Array<{ codePostal: string; communes: string[]; outils: OutilCouverture[] }>;
  complete: boolean;
  requetes: RequeteCouverture[];
  /** Dépôts sans arguments : ils ne prouvent aucune zone. */
  depotsSansArguments: number;
  totaux: Record<OutilCouverture, { requetes: number; requetesIncompletes: number; total: number }>;
  /** Phrases à citer telles quelles dans le livrable. */
  phrases: string[];
  source: typeof SOURCE_CODES_POSTAUX;
}

export function normaliserNom(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[-'’_.]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Codes postaux à moins de `rayonKm` d'au moins un bureau (bureau le plus proche retenu), triés par code. */
export function zonesAInterroger(bureaux: readonly BureauCouverture[], rayonKm: number, referentiel: readonly LigneCodePostal[] = CODES_POSTAUX_BE) {
  const zones: Array<{ codePostal: string; communes: string[]; distanceKm: number; bureau: string }> = [];
  for (const [cp, lat, lon, , communes] of referentiel) {
    let proche: { d: number; nom: string } | null = null;
    for (const b of bureaux) {
      const d = distanceKm({ latitude: lat, longitude: lon }, { latitude: b.lat, longitude: b.lon });
      if (proche === null || d < proche.d) proche = { d, nom: b.nom };
    }
    if (proche !== null && proche.d <= rayonKm) zones.push({ codePostal: cp, communes: [...communes], distanceKm: Math.round(proche.d * 10) / 10, bureau: proche.nom });
  }
  return zones.sort((a, b) => a.codePostal.localeCompare(b.codePostal));
}

const textes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** JSON canonique (clés triées), sans la page : deux pages d'une même requête ont la même clé. */
function cleRequete(outil: string, args: Record<string, unknown>): string {
  const trier = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(trier) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, trier(x)])) : v;
  const { page: _page, ...reste } = args;
  return `${outil}|${JSON.stringify(trier(reste))}`;
}

/** La requête (ses filtres de zone) couvre-t-elle ce code postal ? */
function requeteCouvre(args: Record<string, unknown>, cp: string, communes: readonly string[]): boolean {
  const codes = textes(args["codes_postaux"]);
  const noms = textes(args["communes"]).map(normaliserNom);
  const provinces = textes(args["provinces"]).map(normaliserNom);
  const regions = textes(args["regions"]);
  if (codes.length + noms.length + provinces.length + regions.length === 0) return true; // aucun filtre de zone : toute la Belgique
  if (codes.includes(cp)) return true;
  if (communes.some((c) => noms.includes(normaliserNom(c)))) return true;
  const province = provinceDuCodePostal(cp);
  if (province !== null && provinces.includes(normaliserNom(province))) return true;
  return province !== null && regions.includes(regionDeLaProvince(province));
}

export function calculerCouverture(e: { bureaux: readonly BureauCouverture[]; rayonKm: number; depots: readonly DepotCouverture[]; referentiel?: readonly LigneCodePostal[] }): ResultatCouverture {
  const aInterroger = zonesAInterroger(e.bureaux, e.rayonKm, e.referentiel);
  const estOutil = (o: string): o is OutilCouverture => (OUTILS_COUVERTURE as readonly string[]).includes(o);

  // Requêtes distinctes (arguments sans la page), pages déposées, total et nombre de pages les plus récents.
  // `pagesConnues` : nombre de pages établi par la réponse (`pages`, ou `total` / taille de page, ou dernière page prouvée).
  type Acc = RequeteCouverture & { dernier: string; paginee: boolean; pagesConnues: boolean };
  const parCle = new Map<string, Acc>();
  let depotsSansArguments = 0;
  for (const d of e.depots) {
    if (!estOutil(d.outil)) continue;
    if (d.arguments === null) {
      depotsSansArguments++;
      continue;
    }
    const cle = cleRequete(d.outil, d.arguments);
    const pageExplicite = typeof d.arguments["page"] === "number" ? (d.arguments["page"] as number) : d.page;
    const page = pageExplicite ?? 1;
    const r = parCle.get(cle) ?? { outil: d.outil, arguments: Object.fromEntries(Object.entries(d.arguments).filter(([k]) => k !== "page")), total: null, pagesAttendues: 1, pagesDeposees: [], complete: false, dernier: "", paginee: false, pagesConnues: false };
    if (!r.pagesDeposees.includes(page)) r.pagesDeposees.push(page);
    if (pageExplicite !== null || (d.pages !== null && d.pages > 1)) r.paginee = true;
    if (d.creeLe >= r.dernier) {
      r.dernier = d.creeLe;
      if (d.total !== null) r.total = d.total;
      const taille = d.taillePage ?? null;
      if (d.pages !== null) {
        r.pagesAttendues = Math.max(1, d.pages);
        r.pagesConnues = true;
      } else if (d.total !== null && taille !== null && taille > 0) {
        r.pagesAttendues = Math.max(1, Math.ceil(d.total / taille));
        r.pagesConnues = true;
      } else if (taille !== null && taille > 0 && d.renvoyes != null && d.renvoyes < taille) {
        r.pagesAttendues = page; // page plus courte que demandé : c'est la dernière
        r.pagesConnues = true;
      }
    }
    parCle.set(cle, r);
  }
  const requetes: RequeteCouverture[] = [...parCle.values()].map(({ dernier: _d, paginee, pagesConnues, ...r }) => {
    const pagesDeposees = [...r.pagesDeposees].sort((a, b) => a - b);
    // Requête paginée dont le nombre de pages n'est pas établi : la dernière page n'est pas prouvée, donc incomplète
    // (`pagesAttendues` = au moins la page qui suit la dernière déposée).
    const pagesAttendues = paginee && !pagesConnues ? Math.max(r.pagesAttendues, (pagesDeposees[pagesDeposees.length - 1] ?? 0) + 1) : r.pagesAttendues;
    const complete = Array.from({ length: pagesAttendues }, (_, i) => i + 1).every((p) => pagesDeposees.includes(p));
    return { ...r, pagesAttendues, pagesDeposees, complete };
  });

  const outilsRequis = OUTILS_COUVERTURE.filter((o) => requetes.some((r) => r.outil === o));
  const zones: ZoneCouverture[] = aInterroger.map((z) => {
    const interrogee = Object.fromEntries(
      OUTILS_COUVERTURE.map((o) => [o, requetes.some((r) => r.outil === o && r.complete && requeteCouvre(r.arguments, z.codePostal, z.communes))]),
    ) as Record<OutilCouverture, boolean>;
    return { ...z, interrogee, couverte: outilsRequis.length > 0 && outilsRequis.every((o) => interrogee[o]) };
  });
  const manquantes = zones
    .filter((z) => !z.couverte)
    .map((z) => ({ codePostal: z.codePostal, communes: z.communes, outils: (outilsRequis.length > 0 ? outilsRequis : [...OUTILS_COUVERTURE]).filter((o) => !z.interrogee[o]) }));

  const totaux = Object.fromEntries(
    OUTILS_COUVERTURE.map((o) => {
      const rs = requetes.filter((r) => r.outil === o);
      return [o, { requetes: rs.length, requetesIncompletes: rs.filter((r) => !r.complete).length, total: rs.reduce((s, r) => s + (r.total ?? 0), 0) }];
    }),
  ) as ResultatCouverture["totaux"];

  const nbCouvertes = zones.filter((z) => z.couverte).length;
  const phrases = [
    `Couverture (calcul machine) : ${zones.length} codes postaux à moins de ${e.rayonKm} km des bureaux, ${nbCouvertes} interrogés, ${zones.length - nbCouvertes} manquants.`,
    ...outilsRequis.map((o) => `Total ${LIBELLE_OUTIL[o]} : ${totaux[o].total} résultats renvoyés par ${totaux[o].requetes} requêtes distinctes (calcul machine).`),
  ];

  return {
    rayonKm: e.rayonKm, bureaux: [...e.bureaux], zones, outilsRequis, manquantes,
    complete: zones.length > 0 && manquantes.length === 0,
    requetes, depotsSansArguments, totaux, phrases, source: SOURCE_CODES_POSTAUX,
  };
}

/* ------------------------------------------------------------------ */
/* Contrôle du livrable                                                */
/* ------------------------------------------------------------------ */

export interface EcartCouverture {
  code: "couverture_zone_manquante" | "total_incoherent";
  message: string;
  element: string | null;
}

const libelleZone = (z: { codePostal: string; communes: readonly string[] }) => (z.communes.length > 0 ? `${z.codePostal} (${z.communes.slice(0, 2).join(", ")})` : z.codePostal);
const entier = (s: string) => Number(s.replace(/[\s  .]/gu, ""));
const CODES_CONNUS = new Set(CODES_POSTAUX_BE.map((l) => l[0]));

/** Lignes qui suivent une annonce, jusqu'au prochain titre ou au premier blanc qui n'est pas suivi d'une liste ou d'un tableau. */
function segmentApres(lignes: readonly string[], i: number): string {
  const morceaux = [lignes[i]!];
  for (let j = i + 1; j < lignes.length; j++) {
    const l = lignes[j]!;
    if (/^\s*#/u.test(l)) break;
    if (l.trim() === "") {
      const suivante = lignes.slice(j + 1).find((x) => x.trim() !== "");
      if (suivante === undefined || !/^\s*([-*+]|\d+[.)]|\|)/u.test(suivante)) break;
      continue;
    }
    if (/\b\d+\s+codes?\s+postaux\b/iu.test(l)) break;
    morceaux.push(l);
  }
  return morceaux.join("\n");
}

/** Écarts du livrable face à la couverture calculée (bureaux positionnés). */
export function controlerLivrableProspection(livrable: string, couverture: ResultatCouverture): EcartCouverture[] {
  const ecarts: EcartCouverture[] = [];

  if (couverture.zones.length > 0 && couverture.outilsRequis.length === 0) {
    ecarts.push({
      code: "couverture_zone_manquante",
      message: `Aucune requête osm_commerces ni bce_rechercher déposée avec ses arguments pour cette campagne : ${couverture.zones.length} codes postaux à interroger (GET /prospection/couverture).`,
      element: null,
    });
  } else if (couverture.manquantes.length > 0) {
    const liste = couverture.manquantes.map((z) => `${libelleZone(z)} [${z.outils.join(", ")}]`).join(" ; ");
    ecarts.push({
      code: "couverture_zone_manquante",
      message: `${couverture.manquantes.length} code(s) postal(aux) à moins de ${couverture.rayonKm} km d'un bureau jamais interrogé(s) (ou requête aux pages incomplètes) : ${liste}.`,
      element: couverture.manquantes.map((z) => z.codePostal).join(", "),
    });
  }

  // Sommes écrites dans le texte : « 2 + 37 + 127 = 166 ».
  for (const m of livrable.matchAll(/(\d[\d  ]*(?:\s*\+\s*\d[\d  ]*)+)\s*=\s*(\d[\d  ]*)/gu)) {
    const termes = m[1]!.split("+").map((t) => entier(t.trim()));
    const annonce = entier(m[2]!.trim());
    const somme = termes.reduce((s, x) => s + x, 0);
    if (somme !== annonce) ecarts.push({ code: "total_incoherent", message: `Somme fausse dans le livrable : « ${m[0].trim()} » (le calcul donne ${somme}).`, element: m[0].trim() });
  }

  // « Total OpenStreetMap : N » ou « Total BCE : N » : doit être le total machine.
  for (const m of livrable.matchAll(/total\s+(?:des?\s+)?(osm|openstreetmap|bce)\b(?:[^:\n]{0,60}:|[^\d\n:]{0,40}?)\s*(\d[\d  ]*)/giu)) {
    const outil: OutilCouverture = /bce/iu.test(m[1]!) ? "bce_rechercher" : "osm_commerces";
    const annonce = entier(m[2]!.trim());
    const machine = couverture.totaux[outil].total;
    if (annonce !== machine) {
      ecarts.push({ code: "total_incoherent", message: `« ${m[0].trim()} » : le total recompté sur les dépôts de la campagne est ${machine} (${couverture.totaux[outil].requetes} requêtes distinctes).`, element: m[0].trim() });
    }
  }

  // « 20 codes postaux » annoncés : autant de codes postaux doivent être nommés dans la suite immédiate.
  const lignes = livrable.split(/\r?\n/u);
  const phraseMachine = couverture.phrases[0] ?? null;
  lignes.forEach((l, i) => {
    // Phrase de la route recopiée telle quelle : son annonce est exacte, ce qui la suit n'est pas sa liste.
    if (phraseMachine !== null && l.replace(/^[\s>*_-]+|[\s*_]+$/gu, "") === phraseMachine) return;
    for (const m of l.matchAll(/\b(\d+)\s+codes?\s+postaux\b/giu)) {
      const annonce = Number(m[1]);
      const segment = segmentApres(lignes, i).replace(/\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4}/gu, " ");
      const nommes = new Set([...segment.matchAll(/(?<![\d,.])\d{4}(?![\d,.]\d)/gu)].map((x) => x[0]).filter((c) => CODES_CONNUS.has(c)));
      if (nommes.size > 0 && nommes.size !== annonce) {
        ecarts.push({ code: "total_incoherent", message: `« ${m[0]} » annoncés mais ${nommes.size} nommés à la suite (${[...nommes].sort().join(", ")}).`, element: m[0] });
      }
    }
  });

  return ecarts;
}
