/**
 * Route `discussion.cartes-services` (humain seulement, entreprise Direction seulement) : liste des tâches reçues par une
 * liaison née de la discussion avec le Coordinateur général, dont l'interface va lire les cartes de décision humaine
 * (`ask_user_questions`, `request_confirmation`) en attente dans les AUTRES services du client.
 *
 * Portée de l'hôte : l'appel de la route est limité à l'entreprise Direction (`requireInvocationCompanyScope`, SDK),
 * toute lecture `ctx.issues.*` d'une autre entreprise est refusée. La route ne lit donc QUE la Direction : la
 * discussion, le registre des liaisons et la descendance de la tâche d'origine. Les tâches, sous-tâches et cartes des
 * services sont lues par l'interface, avec la session de la personne (`src/ui/cartes-services-lecture.ts`).
 *
 * Cloisonnement : seules les entreprises CONFIRMÉES du même client (`servicesDuClient`) sont rendues. Lecture seule :
 * rien n'est écrit. Une tâche d'origine compte si c'est la discussion, un de ses descendants ou une demande à l'équipe
 * de la Direction.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { nomService } from "../../contrats/liaisons-lecture.js";
import type { CleRouteApi } from "../../contrats/index.js";
import type { GestionnaireRoute } from "../atelier.js";
import { erreur } from "../erreurs.js";
import { ORIGINE_DISCUSSION } from "../services-discussion.js";
import { ORIGINE_DEMANDE } from "../services-accueil.js";
import type { TacheASuivre } from "../../contrats/carte-decision.js";
import type { StockLiaisons } from "./base-liaisons.js";
import type { LectureLiaisons } from "./lecture-liaisons.js";
import { exigerHumainLecture, memeId } from "./lire.js";

export type { TacheASuivre };

export interface ReponseCartesServices {
  /** Tâches reçues à suivre (une par liaison retenue, sans doublon), dans l'ordre du registre. */
  taches: TacheASuivre[];
  /** Une lecture de la Direction a échoué : l'interface propose de réessayer. */
  indisponible: boolean;
}

/** Liaisons examinées (les plus récentes du registre) et tâches lues au plus par interrogation. */
const MAX_LIAISONS = 100;
const MAX_TACHES = 30;
const MAX_ORIGINES = 40;
const PROFONDEUR_MAX = 8;
/** Réutilisation d'une lecture récente (le chat interroge toutes les 15 s, plusieurs emplacements à la fois). */
export const TTL_CARTES_SERVICES_MS = 10_000;

type Issue = NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;
const iso = (d: Date | string | null | undefined) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString());

export function routeCartesServices(d: { ctx: PluginContext; stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">; lecture: Pick<LectureLiaisons, "registre"> }): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, stock, lecture } = d;
  const cache = new Map<string, { a: number; valeur: ReponseCartesServices }>();

  async function lire(companyId: string, clientMarqueur: string): Promise<ReponseCartesServices> {
    let indisponible = false;
    const trouvees = await ctx.issues.list({ companyId, originKind: ORIGINE_DISCUSSION as never, originId: `discussion:${companyId}`, includePluginOperations: true, limit: 10 });
    const discussion = trouvees
      .filter((i) => memeId(i.companyId, companyId) && i.status !== "cancelled" && i.originId === `discussion:${companyId}`)
      .sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)))[0];
    if (!discussion) return { taches: [], indisponible: false };

    const services = new Map((await stock.servicesDuClient(clientMarqueur)).filter((s) => !s.estDirection).map((s) => [s.companyId.toLowerCase(), s]));
    const { lignes } = await lecture.registre(clientMarqueur, {}, MAX_LIAISONS, 0);
    const retenues = lignes.filter((l) => memeId(l.entrepriseSource, companyId) && l.entrepriseCible !== null && l.tacheCible !== null && services.has(l.entrepriseCible.toLowerCase()));

    // La tâche d'origine descend-elle de la discussion ? (mémorisé par tâche pour toute l'interrogation)
    const descend = new Map<string, boolean>();
    async function descendDeLaDiscussion(tacheId: string): Promise<boolean> {
      const cle = tacheId.toLowerCase();
      const connu = descend.get(cle);
      if (connu !== undefined) return connu;
      let courant: string | null = tacheId;
      let ok = false;
      for (let n = 0; courant && n < PROFONDEUR_MAX; n += 1) {
        if (memeId(courant, discussion!.id)) {
          ok = true;
          break;
        }
        const issue: Issue | null = await ctx.issues.get(courant, companyId).catch(() => {
          indisponible = true;
          return null;
        });
        if (!issue) break;
        if (issue.originKind === ORIGINE_DEMANDE) {
          ok = true;
          break;
        }
        courant = issue.parentId ?? null;
      }
      descend.set(cle, ok);
      return ok;
    }

    const taches: TacheASuivre[] = [];
    const vues = new Set<string>();
    let origines = 0;
    for (const l of retenues) {
      if (taches.length >= MAX_TACHES) break;
      if (!descend.has(l.tacheOrigine.toLowerCase())) {
        if (origines >= MAX_ORIGINES) continue;
        origines += 1;
      }
      if (!(await descendDeLaDiscussion(l.tacheOrigine))) continue;
      const cible = l.entrepriseCible!;
      const cle = l.tacheCible!.toLowerCase();
      if (vues.has(cle)) continue;
      vues.add(cle);
      const service = services.get(cible.toLowerCase())!;
      taches.push({ companyId: cible, tacheId: l.tacheCible!, slug: service.serviceSlug, nom: nomService(service.serviceSlug) });
    }
    return { taches, indisponible };
  }

  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  routes["discussion.cartes-services"] = async (r) => {
    exigerHumainLecture(r.acteur, "La lecture des décisions en attente dans les services");
    const service = await stock.serviceDeEntreprise(r.companyId);
    if (!service?.estDirection) erreur("acces_refuse", "Les décisions en attente des services se lisent depuis l'entreprise Direction du client.");
    const cle = r.companyId.toLowerCase();
    const frais = [r.query["frais"]].flat()[0] === "1";
    const memo = cache.get(cle);
    if (!frais && memo && Date.now() - memo.a < TTL_CARTES_SERVICES_MS) return { statut: 200, corps: memo.valeur };
    let valeur: ReponseCartesServices;
    try {
      valeur = await lire(r.companyId, service!.clientMarqueur);
    } catch (e) {
      ctx.logger.warn("Cartes des services : lecture impossible", { erreur: e instanceof Error ? e.message : String(e) });
      cache.delete(cle);
      return { statut: 200, corps: { taches: [], indisponible: true } satisfies ReponseCartesServices };
    }
    if (valeur.indisponible) cache.delete(cle);
    else cache.set(cle, { a: Date.now(), valeur });
    return { statut: 200, corps: valeur };
  };
  return routes;
}
