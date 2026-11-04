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
import { ORIGINE_DISCUSSION, estDiscussionDe } from "../services-discussion.js";
import { ORIGINE_DEMANDE } from "../services-accueil.js";
import type { TacheASuivre } from "../../contrats/carte-decision.js";
import type { StockLiaisons } from "./base-liaisons.js";
import type { LectureLiaisons } from "./lecture-liaisons.js";
import { exigerHumainLecture, memeId } from "./lire.js";

export type { TacheASuivre };

export interface ReponseCartesServices {
  /** Tâches reçues à suivre (une par liaison retenue, sans doublon), dans l'ordre du registre. */
  taches: TacheASuivre[];
  /** Services confirmés du client hors Direction : l'interface lit aussi leurs tâches ouvertes sans parent (HUM-C7). */
  services?: Array<Omit<TacheASuivre, "tacheId">>;
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

export function routeCartesServices(d: { ctx: PluginContext; stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">; lecture: Pick<LectureLiaisons, "registre"> }): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, stock, lecture } = d;
  const cache = new Map<string, { a: number; valeur: ReponseCartesServices }>();

  async function lire(companyId: string, clientMarqueur: string): Promise<ReponseCartesServices> {
    let indisponible = false;
    const services = new Map((await stock.servicesDuClient(clientMarqueur)).filter((s) => !s.estDirection).map((s) => [s.companyId.toLowerCase(), s]));
    const tous = [...services.values()].map((s) => ({ companyId: s.companyId, slug: s.serviceSlug, nom: nomService(s.serviceSlug) }));
    const trouvees = await ctx.issues.list({ companyId, originKind: ORIGINE_DISCUSSION as never, includePluginOperations: true, limit: 100 });
    const discussions = new Map(trouvees.filter((i) => estDiscussionDe(companyId, i)).map((i) => [i.id.toLowerCase(), i.id]));
    if (discussions.size === 0) return { taches: [], services: tous, indisponible: false };

    const { lignes } = await lecture.registre(clientMarqueur, {}, MAX_LIAISONS, 0);
    const retenues = lignes.filter((l) => memeId(l.entrepriseSource, companyId) && l.entrepriseCible !== null && l.tacheCible !== null && services.has(l.entrepriseCible.toLowerCase()));

    // Discussion racine dont descend la tâche d'origine : `undefined` si aucune (tâche écartée), `null` pour une demande à
    // l'équipe sans discussion parente (retenue, mais d'aucun fil). Mémorisé par tâche pour toute l'interrogation.
    const descend = new Map<string, string | null | undefined>();
    async function discussionDe(tacheId: string): Promise<string | null | undefined> {
      const cle = tacheId.toLowerCase();
      if (descend.has(cle)) return descend.get(cle);
      let courant: string | null = tacheId;
      let demande = false;
      let racine: string | undefined;
      for (let n = 0; courant && n < PROFONDEUR_MAX; n += 1) {
        if (discussions.has(courant.toLowerCase())) {
          racine = courant;
          break;
        }
        const issue: Issue | null = await ctx.issues.get(courant, companyId).catch(() => {
          indisponible = true;
          return null;
        });
        if (!issue) break;
        if (issue.originKind === ORIGINE_DEMANDE) demande = true;
        courant = issue.parentId ?? null;
      }
      const resultat = racine !== undefined ? discussions.get(racine.toLowerCase()) : demande ? null : undefined;
      descend.set(cle, resultat);
      return resultat;
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
      const discussionId = await discussionDe(l.tacheOrigine);
      if (discussionId === undefined) continue;
      const cible = l.entrepriseCible!;
      const cle = l.tacheCible!.toLowerCase();
      if (vues.has(cle)) continue;
      vues.add(cle);
      const service = services.get(cible.toLowerCase())!;
      taches.push({ companyId: cible, tacheId: l.tacheCible!, slug: service.serviceSlug, nom: nomService(service.serviceSlug), discussionId });
    }
    return { taches, services: tous, indisponible };
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
