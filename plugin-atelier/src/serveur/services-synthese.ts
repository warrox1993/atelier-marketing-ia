/**
 * Route `direction.synthese` : le Coordinateur général « voit tout » son client en agrégats.
 *
 * Pourquoi en SQL : une clé d'agent ne lit aucune autre entreprise et les appels `ctx.*` d'une route sont limités à
 * l'entreprise de l'invocation. Seule voie : `ctx.db.query` sur les tables du cœur déclarées dans `coreReadTables`,
 * que l'hôte valide par liste de tables SEULEMENT (aucun cloisonnement par entreprise). Le cloisonnement est donc ici.
 *
 * Gardes (testées) :
 *  1. l'entreprise de la requête est la Direction d'un client déclaré, sinon 403 ;
 *  2. l'appelant est un agent (route `agent` seulement, revue du 19/10/2026 F4) de rôle `ceo` dans cette entreprise, sinon 403 ;
 *  3. les entreprises lues sont les services CONFIRMÉS du MÊME client (`servicesDuClient`, filtrés), jamais une entrée de
 *     l'appelant, et chaque requête filtre `company_id = any($1::uuid[])` sur cette liste.
 *
 * Contenu : agrégats uniquement. Au plus 5 identifiants de tâches bloquées par service, jamais un titre, aucun
 * identifiant pour les services sensibles (`SERVICES_SENSIBLES`).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { BORNE_BLOQUEES_SYNTHESE, SERVICES_SENSIBLES, type CleRouteApi, type LigneSyntheseService, type SyntheseClient } from "../contrats/index.js";
import { nomService } from "../contrats/liaisons-lecture.js";
import type { GestionnaireRoute } from "./atelier.js";
import { iso } from "./base.js";
import { erreur } from "./erreurs.js";
import type { StockLiaisons } from "./liaisons/base-liaisons.js";

/** Durée de vie du cache mémoire d'une synthèse, par client. */
export const DUREE_CACHE_SYNTHESE_MS = 30_000;

export interface DependancesSynthese {
  ctx: Pick<PluginContext, "agents" | "db">;
  stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">;
  /** Tests : horloge. */
  maintenant?: () => number;
}

type Ligne = Record<string, unknown>;
const nb = (v: unknown) => Number(v ?? 0);

export function routesSynthese(d: DependancesSynthese): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, stock } = d;
  const maintenant = d.maintenant ?? (() => Date.now());
  const cache = new Map<string, { jusqua: number; valeur: SyntheseClient }>();
  const q = (sql: string, params: unknown[]) => ctx.db.query<Ligne>(sql, params);

  // `ctx.db` n'est lu qu'à l'appel : la route peut être branchée avec un hôte de test sans base.
  async function calculer(client: string, ids: string[], services: Array<{ companyId: string; serviceSlug: string; estDirection: boolean }>): Promise<SyntheseClient> {
    for (const id of ids) if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) erreur("erreur_interne", "Identifiant d'entreprise invalide dans la déclaration des services.");
    const ns = ctx.db.namespace;
    const maint = new Date(maintenant());
    const debutMois = new Date(Date.UTC(maint.getUTCFullYear(), maint.getUTCMonth(), 1)).toISOString();
    // Toutes les requêtes reçoivent la liste du client en $1 et filtrent dessus. L'hôte aplatit les paramètres tableau :
    // la liste passe en littéral Postgres `{a,b}`, converti par `$1::uuid[]`.
    const liste = `{${ids.join(",")}}`;
    const [agents, taches, bloquees, couts, activite, prospects, liaisons] = await Promise.all([
      q(`select company_id, status, count(*)::int as n from public.agents where company_id = any($1::uuid[]) and status <> 'terminated' group by company_id, status`, [liste]),
      q(`select company_id, status, count(*)::int as n from public.issues where company_id = any($1::uuid[]) and hidden_at is null and status in ('todo', 'in_progress', 'blocked', 'in_review') group by company_id, status`, [liste]),
      q(
        `select company_id, identifier from (
           select company_id, identifier, row_number() over (partition by company_id order by updated_at desc) as rang
           from public.issues where company_id = any($1::uuid[]) and hidden_at is null and status = 'blocked' and identifier is not null
         ) t where rang <= ${BORNE_BLOQUEES_SYNTHESE}`,
        [liste],
      ),
      q(`select company_id, coalesce(sum(cost_cents), 0) as total from public.cost_events where company_id = any($1::uuid[]) and occurred_at >= $2 group by company_id`, [liste, debutMois]),
      q(
        `select c.id as company_id, greatest(
           (select max(i.updated_at) from public.issues i where i.company_id = c.id and i.hidden_at is null),
           (select max(a.last_heartbeat_at) from public.agents a where a.company_id = c.id and a.status <> 'terminated')
         ) as derniere from public.companies c where c.id = any($1::uuid[])`,
        [liste],
      ),
      q(`select company_id, count(*)::int as total, count(*) filter (where statut = 'qualifie')::int as qualifies from ${ns}.prospects where company_id = any($1::uuid[]) and corbeille_le is null group by company_id`, [liste]),
      q(`select company_id, count(*)::int as n from ${ns}.liaisons where company_id = any($1::uuid[]) and statut in ('ouverte', 'en_attente_approbation') group by company_id`, [liste]),
    ]);

    // Défense en profondeur : une ligne hors liste est ignorée même si la base en renvoyait.
    const dans = new Set(ids.map((x) => x.toLowerCase()));
    const cle = (l: Ligne) => String(l["company_id"]).toLowerCase();
    const garde = (lignes: Ligne[]) => lignes.filter((l) => dans.has(cle(l)));

    const lignes: LigneSyntheseService[] = services.map((s) => {
      const c = s.companyId.toLowerCase();
      const par = (lignesSource: Ligne[], statut: string) => nb(garde(lignesSource).find((l) => cle(l) === c && l["status"] === statut)?.["n"]);
      const sensible = SERVICES_SENSIBLES.has(s.serviceSlug);
      const derniere = garde(activite).find((l) => cle(l) === c)?.["derniere"];
      const derniereIso = derniere == null ? "" : iso(derniere as Date | string);
      const p = garde(prospects).find((l) => cle(l) === c);
      return {
        slug: s.serviceSlug,
        nom: nomService(s.serviceSlug),
        estDirection: s.estDirection,
        agents: { idle: par(agents, "idle"), running: par(agents, "running"), paused: par(agents, "paused"), error: par(agents, "error") },
        taches: { todo: par(taches, "todo"), in_progress: par(taches, "in_progress"), blocked: par(taches, "blocked"), in_review: par(taches, "in_review") },
        bloquees: sensible ? [] : garde(bloquees).filter((l) => cle(l) === c).map((l) => String(l["identifier"])).slice(0, BORNE_BLOQUEES_SYNTHESE),
        coutsMoisCentimes: nb(garde(couts).find((l) => cle(l) === c)?.["total"]),
        derniereActivite: derniereIso !== "" && !Number.isNaN(Date.parse(derniereIso)) ? derniereIso : null,
        prospects: { total: nb(p?.["total"]), qualifies: nb(p?.["qualifies"]) },
        liaisonsOuvertes: nb(garde(liaisons).find((l) => cle(l) === c)?.["n"]),
      };
    });
    lignes.sort((a, b) => (a.estDirection !== b.estDirection ? (a.estDirection ? -1 : 1) : a.nom.localeCompare(b.nom, "fr")));
    return { client, services: lignes };
  }

  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  routes["direction.synthese"] = async (r) => {
    // Garde 1 : la Direction seulement.
    const service = await stock.serviceDeEntreprise(r.companyId);
    if (!service || !service.estDirection) erreur("elevation_refusee", "La synthèse du client est réservée à la Direction.");
    // Garde 2 : l'appelant est un agent, et c'est le Coordinateur général (rôle ceo) de cette entreprise. La route est
    // `agent` seulement (revue du 19/10/2026, F4) ; la garde reste ici si l'hôte venait à admettre un humain.
    if (r.acteur.type !== "agent") erreur("elevation_refusee", "La synthèse du client est réservée au Coordinateur général (agent).");
    const agentId = r.acteur.agentId;
    const agent = agentId ? await ctx.agents.get(agentId, r.companyId) : null;
    if (!agent || agent.companyId.toLowerCase() !== r.companyId.toLowerCase() || agent.role !== "ceo") {
      erreur("elevation_refusee", "La synthèse du client est réservée au Coordinateur général (rôle ceo) de la Direction.");
    }
    const client = service.clientMarqueur;
    const en = cache.get(client);
    if (en && en.jusqua > maintenant()) return { statut: 200, corps: en.valeur };
    // Garde 3 : entreprises = services déclarés du MÊME client, rien venant de l'appelant.
    const services = (await stock.servicesDuClient(client)).filter((s) => s.clientMarqueur === client);
    const valeur = await calculer(client, services.map((s) => s.companyId), services);
    cache.set(client, { jusqua: maintenant() + DUREE_CACHE_SYNTHESE_MS, valeur });
    return { statut: 200, corps: valeur };
  };
  return routes;
}
