/**
 * Route `liaison.registre` (humain seulement, entreprise Direction seulement) : registre de tous les échanges entre
 * services du client, avec filtres (service, statut, période), pagination et export CSV.
 *
 * Accès : l'acteur doit être humain ET l'entreprise courante doit être déclarée `est_direction` dans
 * `services_entreprises` ; sinon 403. Le registre porte sur les liaisons du client de cette entreprise, jamais d'un
 * autre client. Il trace (services, objet, statut, dates, nombre d'extraits) sans recopier question, extraits ni réponse.
 */
import type { CleRouteApi } from "../../contrats/index.js";
import {
  FiltreRegistre,
  LIMITES_REGISTRE,
  libelleStatutLiaison,
  nomService,
  type LigneRegistre,
  type ReponseExportRegistre,
  type ReponseRegistre,
} from "../../contrats/liaisons-lecture.js";
import type { GestionnaireRoute } from "../atelier.js";
import { erreur, erreurValidation } from "../erreurs.js";
import type { StockLiaisons } from "./base-liaisons.js";
import type { LectureLiaisons, LiaisonLue } from "./lecture-liaisons.js";
import { exigerHumainLecture } from "./lire.js";

const enLigne = (l: LiaisonLue): LigneRegistre => ({
  id: l.id,
  serviceSource: l.serviceSource,
  serviceCible: l.serviceCible,
  nomServiceSource: nomService(l.serviceSource),
  nomServiceCible: nomService(l.serviceCible),
  objet: l.objet,
  statut: l.statut,
  libelleStatut: libelleStatutLiaison(l.statut, "registre"),
  nombreExtraits: l.extraits.length,
  creeLe: l.creeLe,
  reponduLe: l.reponduLe,
});

const formatBruxelles = (isoStr: string | null): string => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-BE", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p["year"]}-${p["month"]}-${p["day"]} ${p["hour"]}:${p["minute"]}`;
};

/** Cellule CSV entre guillemets ; une valeur qui commencerait par un caractère de formule reçoit une apostrophe (injection de formule). */
export function celluleCsv(valeur: string): string {
  const sure = /^[=+\-@\t\r]/u.test(valeur) ? `'${valeur}` : valeur;
  return `"${sure.replace(/"/gu, '""')}"`;
}

export function csvRegistre(lignes: readonly LigneRegistre[]): string {
  const entete = ["Date de la demande", "Service demandeur", "Service sollicité", "Objet", "Statut", "Extraits transmis", "Date de réponse"];
  const corps = lignes.map((l) =>
    [formatBruxelles(l.creeLe), l.nomServiceSource, l.nomServiceCible, l.objet, l.libelleStatut, String(l.nombreExtraits), formatBruxelles(l.reponduLe)].map(celluleCsv).join(";"),
  );
  // BOM pour qu'Excel lise l'UTF-8 ; séparateur « ; » et fins de ligne CRLF (usage belge).
  return "﻿" + [entete.map(celluleCsv).join(";"), ...corps].join("\r\n") + "\r\n";
}

export function routeRegistre(d: { stock: Pick<StockLiaisons, "serviceDeEntreprise">; lecture: LectureLiaisons }): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { stock, lecture } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["liaison.registre"] = async (r) => {
    exigerHumainLecture(r.acteur, "Le registre des échanges");
    const service = await stock.serviceDeEntreprise(r.companyId);
    if (!service?.estDirection) erreur("acces_refuse", "Le registre des échanges est réservé à l'entreprise Direction du client.");

    // Les paramètres de requête arrivent en texte (ou en liste) ; `companyId` est celui de l'hôte, jamais un filtre.
    const brut: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.query)) {
      if (k === "companyId") continue;
      const x = Array.isArray(v) ? v[0] : v;
      if (typeof x === "string" && x.trim() !== "") brut[k] = x.trim();
    }
    const p = FiltreRegistre.safeParse(brut);
    if (!p.success) erreurValidation("Filtres du registre", p.error.issues);
    const f = p.data!;
    if (f.du && f.au && f.du > f.au) erreur("entree_invalide", "La date de début doit précéder la date de fin.");
    const critere = { ...(f.service ? { service: f.service } : {}), ...(f.statut ? { statut: f.statut } : {}), ...(f.du ? { du: f.du } : {}), ...(f.au ? { au: f.au } : {}) };

    if (f.exporter === "csv") {
      const toutes: LigneRegistre[] = [];
      let total = 0;
      const lot = 500;
      for (let decalage = 0; decalage < LIMITES_REGISTRE.exportMax; decalage += lot) {
        const page = await lecture.registre(service!.clientMarqueur, critere, Math.min(lot, LIMITES_REGISTRE.exportMax - decalage), decalage);
        total = page.total;
        toutes.push(...page.lignes.map(enLigne));
        if (page.lignes.length === 0 || toutes.length >= total) break;
      }
      const jour = formatBruxelles(new Date().toISOString()).slice(0, 10);
      const corps: ReponseExportRegistre = {
        autorise: true,
        fichier: { nom: `registre-des-echanges-${jour}.csv`, typeMime: "text/csv;charset=utf-8", contenuBase64: Buffer.from(csvRegistre(toutes), "utf8").toString("base64") },
        lignes: toutes.length,
        tronque: total > toutes.length,
      };
      return { statut: 200, corps };
    }

    const { lignes, total } = await lecture.registre(service!.clientMarqueur, critere, f.taille, (f.page - 1) * f.taille);
    const corps: ReponseRegistre = { autorise: true, lignes: lignes.map(enLigne), total, page: f.page, taille: f.taille, pages: Math.max(1, Math.ceil(total / f.taille)) };
    return { statut: 200, corps };
  };

  return routes;
}
