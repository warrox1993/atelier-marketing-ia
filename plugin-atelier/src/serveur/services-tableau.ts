/**
 * Tableau de direction du bureau Marketing : données brutes du mois (humain seulement, lecture seule).
 *
 * Route `tableau.direction` (`?mois=AAAA-MM`). Elle complète `rapport.mensuel` (entonnoir, coût IA, contenus,
 * campagnes) par ce qu'il ne donne pas. Mois civil en UTC, comme le rapport. L'entreprise vient de la résolution de
 * route de l'hôte et filtre chaque lecture. Chaque bloc est lu à part : une source illisible vaut `null`
 * (« non mesuré » dans l'interface), elle ne fait jamais échouer le tableau ni n'écrit un 0.
 *
 * Définitions :
 * - prospect avec numéro : lead du mois (mode réel, hors corbeille) qui porte une coordonnée de canal téléphone ;
 * - étapes contactés, rendez-vous, clients gagnés : somme des mesures importées dont l'indicateur les nomme ;
 * - vues, soumissions, envois : idem (captation et e-mailing), absents tant que ces services n'importent rien ;
 * - mission : tâche sans parent dans l'entreprise, active dans le mois ; ses étapes sont ses sous-tâches ;
 * - coût d'une mission : coûts IA du mois portés par la tâche racine et toute sa descendance ;
 * - délai de décision : de la mise sous porte du livrable à la décision humaine non annulée.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DonneesDirection, MoisRapport, type CleRouteApi, type CoutMission, type MissionTableau, type TacheMissionTableau } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import { iso } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { fenetreDuMois } from "./services-rapport.js";

export const MISSIONS_MAX_TABLEAU = 80;
const TACHES_MAX_TABLEAU = 800;
const MISSIONS_COUTEUSES = 8;

export interface LecturesTableau {
  prospects(companyId: string, debut: string, finExclue: string): Promise<{ trouves: number; avecNumero: number }>;
  mesures(companyId: string, debut: string, finExclue: string): Promise<{
    contactes: number | null; rendezVous: number | null; clientsGagnes: number | null; vues: number | null; soumissions: number | null; envois: number | null;
  }>;
  missions(companyId: string, debut: string, finExclue: string): Promise<{ lignes: MissionTableau[]; taches: TacheMissionTableau[] }>;
  coutsParMission(companyId: string, debut: string, finExclue: string): Promise<{ lignes: CoutMission[]; coutSansMissionCentimes: number }>;
  delaisDecision(companyId: string, debut: string, finExclue: string): Promise<number[]>;
}

export interface DependancesTableau {
  lectures: LecturesTableau;
  maintenant?: () => Date;
}

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "Le tableau de direction est réservé à un humain.");
};

type Ligne = Record<string, unknown>;
const nombreOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const dateOuNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v as Date | string));

/** Racines de mission : tâches sans parent dans la même entreprise. */
const SANS_PARENT = "not exists (select 1 from public.issues p where p.id = i.parent_id and p.company_id = i.company_id)";

export function lecturesTableauSql(db: PluginContext["db"]): LecturesTableau {
  const q = (sql: string, p: unknown[]) => db.query<Ligne>(sql, p);
  return {
    async prospects(companyId, debut, fin) {
      const ns = db.namespace;
      const l = await q(
        `select count(*)::int as trouves, (count(*) filter (where coordonnees @> '[{"canal":"telephone"}]'::jsonb))::int as avec
         from ${ns}.prospects where company_id = $1 and mode = 'reel' and corbeille_le is null and cree_le >= $2::timestamptz and cree_le < $3::timestamptz`,
        [companyId, debut, fin],
      );
      return { trouves: Number(l[0]?.["trouves"] ?? 0), avecNumero: Number(l[0]?.["avec"] ?? 0) };
    },
    async mesures(companyId, debut, fin) {
      const ns = db.namespace;
      const m = (motif: string) => `sum(valeur) filter (where lower(indicateur) ~ '${motif}')`;
      const l = await q(
        `select ${m("contact(e|é)s?( |$)") } as contactes, ${m("rendez")} as rdv, ${m("gagn")} as gagnes,
                ${m("(^|[ _])vues?([ _]|$)")} as vues, ${m("soumission")} as soumissions, ${m("(^|[ _])envois?([ _]|$)")} as envois
         from ${ns}.mesures where company_id = $1 and periode_debut >= $2::timestamptz and periode_fin <= $3::timestamptz`,
        [companyId, debut, fin],
      );
      const r = l[0] ?? {};
      return { contactes: nombreOuNull(r["contactes"]), rendezVous: nombreOuNull(r["rdv"]), clientsGagnes: nombreOuNull(r["gagnes"]), vues: nombreOuNull(r["vues"]), soumissions: nombreOuNull(r["soumissions"]), envois: nombreOuNull(r["envois"]) };
    },
    async missions(companyId, debut, fin) {
      const racines = await q(
        `select i.id, i.identifier, i.title, i.status, i.created_at, i.completed_at from public.issues i
         where i.company_id = $1 and i.hidden_at is null and ${SANS_PARENT} and i.created_at < $3::timestamptz
           and ((i.completed_at is null and i.status <> 'cancelled') or i.completed_at >= $2::timestamptz)
         order by i.updated_at desc limit ${MISSIONS_MAX_TABLEAU}`,
        [companyId, debut, fin],
      );
      const lignes: MissionTableau[] = racines.map((r) => ({
        id: String(r["id"]), identifiant: r["identifier"] == null ? null : String(r["identifier"]), titre: String(r["title"]), statut: String(r["status"]),
        creeLe: iso(r["created_at"] as Date | string), termineLe: dateOuNull(r["completed_at"]),
      }));
      if (lignes.length === 0) return { lignes, taches: [] };
      const filles = await q(
        `with recursive arbre as (
           select i.id, i.id as racine from public.issues i where i.company_id = $1 and i.id = any($2::uuid[])
           union all
           select f.id, a.racine from public.issues f join arbre a on f.parent_id = a.id where f.company_id = $1 and f.hidden_at is null)
         select a.racine, f.title, f.status, f.created_at, f.completed_at, ag.name as agent
         from arbre a join public.issues f on f.id = a.id left join public.agents ag on ag.id = f.assignee_agent_id
         where a.id <> a.racine order by f.created_at limit ${TACHES_MAX_TABLEAU}`,
        [companyId, `{${lignes.map((x) => x.id).join(",")}}`],
      );
      const taches: TacheMissionTableau[] = filles.map((f) => ({
        missionId: String(f["racine"]), titre: String(f["title"]), statut: String(f["status"]), agentNom: f["agent"] == null ? null : String(f["agent"]), agentCle: null,
        creeLe: iso(f["created_at"] as Date | string), termineLe: dateOuNull(f["completed_at"]),
      }));
      return { lignes, taches };
    },
    async coutsParMission(companyId, debut, fin) {
      const [parMission, total] = await Promise.all([
        q(
          `with recursive arbre as (
             select i.id, i.id as racine from public.issues i where i.company_id = $1 and ${SANS_PARENT}
             union all
             select f.id, a.racine from public.issues f join arbre a on f.parent_id = a.id where f.company_id = $1)
           select r.identifier, r.title, sum(c.cost_cents) as cout, sum(c.input_tokens + c.output_tokens) as jetons
           from public.cost_events c join arbre a on a.id = c.issue_id join public.issues r on r.id = a.racine
           where c.company_id = $1 and c.occurred_at >= $2::timestamptz and c.occurred_at < $3::timestamptz
           group by r.id, r.identifier, r.title order by 3 desc, 4 desc limit 500`,
          [companyId, debut, fin],
        ),
        q(`select coalesce(sum(cost_cents), 0) as cout from public.cost_events where company_id = $1 and occurred_at >= $2::timestamptz and occurred_at < $3::timestamptz`, [companyId, debut, fin]),
      ]);
      const lignes = parMission.map((l) => ({ identifiant: l["identifier"] == null ? null : String(l["identifier"]), titre: String(l["title"]), coutCentimes: Math.round(Number(l["cout"] ?? 0)), jetons: Number(l["jetons"] ?? 0) }));
      const rattache = lignes.reduce((t, l) => t + l.coutCentimes, 0);
      return { lignes: lignes.slice(0, MISSIONS_COUTEUSES), coutSansMissionCentimes: Math.max(0, Math.round(Number(total[0]?.["cout"] ?? 0)) - rattache) };
    },
    async delaisDecision(companyId, debut, fin) {
      const ns = db.namespace;
      const l = await q(
        `select extract(epoch from (d.cree_le - po.cree_le)) / 3600.0 as heures
         from ${ns}.decisions_humaines d join ${ns}.portes po on po.issue_id = d.issue_id
         where d.company_id = $1 and d.invalidee = false and d.cree_le >= $2::timestamptz and d.cree_le < $3::timestamptz and d.cree_le >= po.cree_le
         limit 2000`,
        [companyId, debut, fin],
      );
      return l.map((x) => Number(x["heures"]));
    },
  };
}

export function routesTableau(d: DependancesTableau): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  /** Une source illisible vaut `null` : « non mesuré », jamais une erreur ni un zéro. */
  const lire = async <T>(f: () => Promise<T>): Promise<T | null> => {
    try {
      return await f();
    } catch {
      return null;
    }
  };

  routes["tableau.direction"] = async (r) => {
    exigerHumain(r.acteur);
    const brut = r.query["mois"];
    const lu = MoisRapport.safeParse(Array.isArray(brut) ? brut[0] : brut);
    if (!lu.success) erreurValidation("Tableau de direction", lu.error.issues.map((i) => ({ ...i, path: ["mois"] })));
    const mois = lu.data;
    const { debut, finExclue, periode } = fenetreDuMois(mois);
    const c = r.companyId;
    const L = d.lectures;
    const [prospects, mesures, missions, couts, delais] = await Promise.all([
      lire(() => L.prospects(c, debut, finExclue)),
      lire(() => L.mesures(c, debut, finExclue)),
      lire(() => L.missions(c, debut, finExclue)),
      lire(() => L.coutsParMission(c, debut, finExclue)),
      lire(() => L.delaisDecision(c, debut, finExclue)),
    ]);
    const donnees: DonneesDirection = {
      companyId: c,
      mois,
      periode,
      genereLe: maintenant().toISOString(),
      prospects,
      etapes: mesures ? { contactes: mesures.contactes, rendezVous: mesures.rendezVous, clientsGagnes: mesures.clientsGagnes } : null,
      captation: mesures ? { vues: mesures.vues, soumissions: mesures.soumissions } : null,
      emailing: mesures ? { envois: mesures.envois } : null,
      missions: missions ? { lignes: missions.lignes, taches: missions.taches, plafond: MISSIONS_MAX_TABLEAU } : null,
      coutParMission: couts,
      delaiDecision: delais ? { heures: delais } : null,
    };
    return { corps: DonneesDirection.parse(donnees) };
  };
  return routes;
}
