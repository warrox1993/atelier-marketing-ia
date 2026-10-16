/**
 * Carte des prospects (`prospects.carte`, GET `/prospects/carte`, lecture seule).
 *
 * Les filtres sont ceux de `prospects.lister` : la requête lui est transmise telle quelle (sans `page` ni
 * `parPage`) et on parcourt ses pages. Seuls les prospects dont la zone porte une position sont placés ;
 * les autres sont comptés dans `sansPosition`, jamais posés au hasard ni au centre d'un code postal par
 * défaut. La précision de chaque point (`exacte`, `code_postal`, `commune`) est transmise telle que la source l'a annoncée.
 * Les établissements du client apparaissent seulement si un humain a saisi leur position.
 */
import type { CleRouteApi, PositionProspect, Prospect } from "../contrats/index.js";
import type { GestionnaireRoute, RequeteRoute } from "./atelier.js";
import { nomDuProspect } from "./compte-rendu-prospect.js";

/** Au plus 50 pages de 100 prospects : au-delà, la réponse est marquée `tronque`. */
const PAGES_MAX = 50;
const PAR_PAGE = 100;
/** Plafond de points avec `qualifiesSeulement` (50 pages de 100, comme le parcours paginé). */
export const PLAFOND_QUALIFIES = PAGES_MAX * PAR_PAGE;

export interface PointCarte {
  id: string;
  nom: string;
  lat: number;
  lon: number;
  precision: PositionProspect["precision"];
  /** Confiance de qualification en pourcentage ; null si elle n'est pas calculée. */
  confiance: number | null;
  qualifie: boolean;
}

export interface EtablissementCarte {
  nom: string;
  code: string | null;
  adresse: string | null;
  lat: number;
  lon: number;
  confirme: boolean;
}

export interface DependancesCarte {
  /** Route `prospects.lister`, lue au moment de l'appel (elle est enregistrée avant). */
  lister: () => GestionnaireRoute | undefined;
  /** Établissements de la dernière version de la marque du client. */
  /**
   * Optionnel : tous les prospects qualifiés du filtre en UN parcours (plafond de 5 000). Utilisé seulement avec
   * `qualifiesSeulement=true`, où chaque appel de `lister` reparcourt toute la sélection ; sans lui, on retombe sur le
   * parcours page par page.
   */
  listerQualifies?: (r: RequeteRoute, filtres: Record<string, string | string[]>) => Promise<ReadonlyArray<Prospect>>;
  etablissements: (companyId: string) => Promise<ReadonlyArray<{ nom: string; code?: string | undefined; adresse: string | null; confirme: boolean; position?: { lat: number; lon: number } | null | undefined }>>;
}

export function routesCarte(d: DependancesCarte): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["prospects.carte"] = async (r) => {
    const lister = d.lister();
    if (!lister) throw new Error("Carte : la liste des prospects n'est pas disponible.");
    const query = Object.fromEntries(Object.entries(r.query).filter(([cle]) => cle !== "page" && cle !== "parPage"));
    const points: PointCarte[] = [];
    let total = 0;
    let tronque = false;
    const ajouter = (prospects: ReadonlyArray<Prospect>) => {
      for (const p of prospects) {
        const pos = p.zone.position;
        if (!pos) continue;
        points.push({ id: p.id, nom: nomDuProspect(p), lat: pos.lat, lon: pos.lon, precision: pos.precision, confiance: p.confiance?.valeur ?? null, qualifie: p.confiance?.qualifie ?? false });
      }
    };
    const seulementQualifies = query["qualifiesSeulement"] === "true";
    if (seulementQualifies && d.listerQualifies) {
      // Un seul parcours de la sélection (la liste paginée la reparcourrait à chaque page).
      const qualifies = await d.listerQualifies(r, query);
      total = qualifies.length;
      tronque = total > PLAFOND_QUALIFIES;
      ajouter(qualifies.slice(0, PLAFOND_QUALIFIES));
    } else {
      for (let page = 1; ; page++) {
        if (page > PAGES_MAX) {
          tronque = true;
          break;
        }
        const res = (await lister({ ...r, cle: "prospects.lister", query: { ...query, vue: "complete", page: String(page), parPage: String(PAR_PAGE) } })).corps as { total: number; pages: number; prospects: Prospect[] };
        total = res.total;
        ajouter(res.prospects);
        if (page >= res.pages) break;
      }
    }
    const etablissements: EtablissementCarte[] = (await d.etablissements(r.companyId))
      .filter((e) => e.position != null)
      .map((e) => ({ nom: e.nom, code: e.code ?? null, adresse: e.adresse, lat: e.position!.lat, lon: e.position!.lon, confirme: e.confirme }));
    return { corps: { total, positionnes: points.length, sansPosition: tronque ? null : total - points.length, tronque, points, etablissements } };
  };

  return routes;
}
