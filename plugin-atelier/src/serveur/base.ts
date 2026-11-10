/**
 * Accès à l'espace de base du plugin (`ctx.db`).
 *
 * Contraintes de l'hôte (`server/src/services/plugin-database.ts`) : une seule
 * requête par appel, `SELECT` en lecture, `INSERT`/`UPDATE`/`DELETE` dans le
 * schéma du plugin en écriture, noms qualifiés, aucun mot réservé de
 * mutation dans un `SELECT`. Les identifiants sont générés ici ; les dates
 * de fraîcheur sont relues en texte pour garder la microseconde.
 */
import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { ESPACE_BASE, LIMITES, type RoleRevue } from "../contrats/index.js";
import type { EtatMission } from "../moteur/transitions.js";
import { erreur } from "./erreurs.js";

type Db = PluginContext["db"];
type Ligne = Record<string, unknown>;

export type TypeExecution = "evenement" | "creation_tache" | "reveil" | "effet_externe";
export type StatutExecution = "demandee" | "appliquee" | "refusee";
export interface Mission {
  id: string; companyId: string; gabaritCle: string; gabaritVersion: number; contratId: string; contratVersion: number; mandat: string; etat: EtatMission;
  etatAvantPause: EtatMission | null; rangCourant: number; enveloppeCents: number; campagneId: string | null; issueRacineId: string | null; cycleBlocage: number; creeLe: string; modifieLe: string;
}
export interface EtapeMission {
  id: string; companyId: string; missionId: string; rang: number; role: string; tentative: number; etat: string; entree: unknown; sortie: unknown;
  delaiLe: string | null; issueId: string | null; revisionLivrable: string | null; creeLe: string; modifieLe: string;
}

const IDENT = /^plugin_[a-z0-9_]{1,55}$/u;

export function json(valeur: unknown): string {
  return JSON.stringify(valeur ?? null);
}

/** Horodatage ISO 8601 UTC, y compris depuis la forme texte de PostgreSQL (« 2026-10-15 14:23:59.691232+02 »). */
export function iso(valeur: unknown): string {
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === "string") {
    // Le fuseau court (« +01 ») suit une heure : dans une date seule, « -05 » est le jour.
    const normalise = valeur.trim().replace(" ", "T").replace(/(T.*[+-]\d{2})$/u, "$1:00");
    const d = new Date(normalise);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(0).toISOString();
}

function tableau<T = unknown>(valeur: unknown): T[] {
  if (Array.isArray(valeur)) return valeur as T[];
  if (typeof valeur === "string") {
    try {
      const v = JSON.parse(valeur);
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Objet JSON (colonne jsonb relue en objet ou en texte) ; {} sinon. */
function objet(valeur: unknown): Record<string, unknown> {
  let v = valeur;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Dépôt de prospection lu dans une entrée de journal `prospects.deposes` (forme de `DepotCouverture`). */
export function depotDepuisJournal(issueId: string | null, donnees: Record<string, unknown>, creeLe: string) {
  const appel = (donnees["appel"] && typeof donnees["appel"] === "object" ? donnees["appel"] : {}) as Record<string, unknown>;
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const args = appel["arguments"];
  return {
    issueId,
    outil: String(donnees["outil"] ?? ""),
    arguments: args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : null,
    total: nombre(appel["total"]),
    page: nombre(appel["page"]),
    pages: nombre(appel["pages"]),
    taillePage: nombre(appel["taillePage"]),
    renvoyes: nombre(appel["renvoyes"]),
    creeLe,
  };
}

/** Tables légales que la remise à zéro conserve toujours (faille M1). */
/** Avant le lot 2, l'agent créait lui-même son bilan sous un autre originId : rattraper les confirmations plus anciennes ferait un doublon. */
export const DEBUT_RATTRAPAGE_J30 = "2026-11-07T00:00:00.000Z";
export const TABLES_CONSERVEES = ["oppositions", "bases_legales", "journal"] as const;

/** Tables vidées par la remise à zéro, dans l'ordre (enfants avant parents). `prospects` ne perd que ceux sans base légale. */
export const TABLES_REMISE_A_ZERO = [
  "corrections_criteres", "evaluations_criteres", "reglages_leads", "exports_crm", "issues_commerciales", "prospects_scores", "prospects_empreintes", "prospects", "etalonnages", "poids_score",
  "clients_empreintes", "clients", "bases_clients_imports", "regles_ventes_croisees",
  "executions", "etapes", "missions", "relances_correction", "appels_proposes", "diffusions", "decisions_humaines", "constats", "verdicts", "couvertures", "evaluations_porte", "messages", "sources", "mesures", "imports", "planifications", "portes", "exigences", "briefs", "campagnes", "marques", "reglages_entreprise",
] as const;

export function creerBase(db: Db) {
  const ns = db.namespace;
  if (!IDENT.test(ns)) erreur("erreur_interne", "Espace de base du plugin invalide");
  if (ns !== ESPACE_BASE) {
    // L'hôte dérive le nom ; s'il diffère, la migration (noms qualifiés) ne correspond pas.
    erreur("erreur_interne", `Espace de base inattendu : ${ns} (attendu ${ESPACE_BASE})`);
  }
  const q = <T = Ligne>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
  const x = (sql: string, params: unknown[] = []) => db.execute(sql, params);

  /* ---------------- journal ---------------- */
  async function journaliser(e: {
    companyId: string;
    type: string;
    entite: string;
    entiteId: string;
    issueId?: string | null;
    runId?: string | null;
    acteur?: string | null;
    donnees?: Record<string, unknown>;
  }) {
    await x(
      `insert into ${ns}.journal (company_id, type, entite, entite_id, issue_id, run_id, acteur, donnees) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [e.companyId, e.type, e.entite, e.entiteId, e.issueId ?? null, e.runId ?? null, e.acteur ?? null, json(e.donnees ?? {})],
    );
  }

  /** Dates (ISO, de la plus récente à la plus ancienne) des entrées de journal d'un type donné sur une tâche. */
  async function datesJournal(companyId: string, issueId: string, type: string) {
    return (await q(`select cree_le from ${ns}.journal where company_id = $1 and issue_id = $2 and type = $3 order by cree_le desc limit 200`, [companyId, issueId, type])).map((r) => iso(r.cree_le));
  }

  /**
   * EXP-C8 : tâches abandonnées par le veilleur et toujours en attente d'un humain (aucun réveil, remise au travail ni
   * décision depuis le dernier abandon), les plus récentes d'abord.
   */
  async function abandonsVeilleur(companyId: string) {
    const rangs = await q(
      `select a.issue_id, max(a.cree_le) as le from ${ns}.journal a where a.company_id = $1 and a.type = 'veilleur.abandon' and a.issue_id is not null group by a.issue_id
       having not exists (select 1 from ${ns}.journal r where r.company_id = $1 and r.issue_id = a.issue_id and r.type in ('veilleur.reveil', 'cycles.remise_humaine') and r.cree_le > max(a.cree_le))
       and not exists (select 1 from ${ns}.decisions_humaines h where h.company_id = $1 and h.issue_id = a.issue_id and h.cree_le > max(a.cree_le))
       order by le desc limit 20`,
      [companyId],
    );
    return rangs.map((r) => ({ issueId: String(r.issue_id), le: iso(r.le) }));
  }

  /**
   * #78 : renvois au Coordinateur différés (parente en attente de l'humain) dont aucune demande ni clôture (redispatch_differe_clos) de même clé n'a suivi,
   * tâche non close, les plus récents d'abord.
   * shortcut: reprise limitée à 30 jours et 20 tâches par passe, à élargir si un différé plus ancien reste sans suite.
   */
  async function differesSansDemande(companyId: string) {
    const rangs = await q(
      `select d.issue_id, d.donnees->>'cle' as cle from ${ns}.journal d join public.issues i on i.id = d.issue_id
       where d.company_id = $1 and d.type = 'coordinateur.redispatch_differe' and d.cree_le > now() - interval '30 days' and i.status not in ('done', 'cancelled')
       and not exists (select 1 from ${ns}.journal r where r.company_id = $1 and r.issue_id = d.issue_id and r.type = 'coordinateur.redispatch_demande' and r.donnees->>'cle' = d.donnees->>'cle')
       and not exists (select 1 from ${ns}.journal r where r.company_id = $1 and r.issue_id = d.issue_id and r.type = 'coordinateur.redispatch_differe_clos' and r.donnees->>'cle' = d.donnees->>'cle')
       group by d.issue_id, d.donnees->>'cle' order by max(d.cree_le) desc limit 20`,
      [companyId],
    );
    return rangs.map((r) => ({ issueId: String(r.issue_id), cle: String(r.cle) }));
  }

  /** #78 : demandes de renvoi dont le réveil du Coordinateur a échoué et qui n'ont pas encore eu leur unique nouvel essai (mêmes bornes). */
  async function reveilsRedispatchRates(companyId: string) {
    const rangs = await q(
      `select d.issue_id, d.donnees->>'cle' as cle, max(d.donnees->>'parentId') as parent_id from ${ns}.journal d join public.issues i on i.id = d.issue_id
       where d.company_id = $1 and d.type = 'coordinateur.redispatch_demande' and d.donnees->>'erreurReveil' is not null and d.cree_le > now() - interval '30 days' and i.status not in ('done', 'cancelled')
       and not exists (select 1 from ${ns}.journal r where r.company_id = $1 and r.issue_id = d.issue_id and r.type = 'coordinateur.redispatch_relance' and r.donnees->>'cle' = d.donnees->>'cle')
       group by d.issue_id, d.donnees->>'cle' order by max(d.cree_le) desc limit 20`,
      [companyId],
    );
    return rangs.map((r) => ({ issueId: String(r.issue_id), cle: String(r.cle), parentId: String(r.parent_id) }));
  }

  /** Vrai si une entrée de journal de ce type existe déjà pour cette entité (dédoublonnage des relais automatiques). */
  async function journalExiste(companyId: string, type: string, entiteId: string) {
    return (await q(`select 1 as un from ${ns}.journal where company_id = $1 and type = $2 and entite_id = $3 limit 1`, [companyId, type, entiteId])).length > 0;
  }

  /** INJ-8 : vrai si ce run a lu une page du web par le plugin (tache.sources.lire journalise « source.collectee »). */
  async function lectureWebDansRun(companyId: string, runId: string) {
    return (await q(`select 1 as un from ${ns}.journal where company_id = $1 and run_id = $2 and type = 'source.collectee' limit 1`, [companyId, runId])).length > 0;
  }

  /** Parmi ces entités, celles qui ont déjà une entrée de journal de ce type (une seule requête ; liste passée en JSON, l'hôte aplatit les tableaux). */
  async function journalExistants(companyId: string, type: string, entiteIds: readonly string[]): Promise<Set<string>> {
    if (entiteIds.length === 0) return new Set();
    const rangs = await q(
      `select distinct entite_id from ${ns}.journal where company_id = $1 and type = $2 and entite_id in (select jsonb_array_elements_text($3::jsonb))`,
      [companyId, type, JSON.stringify([...entiteIds])],
    );
    return new Set(rangs.map((r) => String(r.entite_id)));
  }

  /** Date (ISO) de la plus récente entrée de journal de ce type pour cette entité, ou `null`. */
  async function derniereDateJournal(companyId: string, type: string, entiteId: string): Promise<string | null> {
    const [r] = await q(`select max(cree_le) as le from ${ns}.journal where company_id = $1 and type = $2 and entite_id = $3`, [companyId, type, entiteId]);
    return r?.le == null ? null : iso(r.le);
  }

  /**
   * Dépôts signés de prospection d'une campagne (journal `prospects.deposes`), avec les arguments vérifiés
   * de l'appel et la pagination de la réponse : base de la couverture calculée (`couverture-prospection.ts`).
   */
  async function depotsProspectionCampagne(companyId: string, campagneId: string, pas = 5000) {
    // Lecture paginée par seq croissant : tous les dépôts, jamais les 5 000 plus anciens seulement.
    const depots: ReturnType<typeof depotDepuisJournal>[] = [];
    let apres = 0;
    for (;;) {
      const rangs = await q(
        `select seq, issue_id, donnees, cree_le from ${ns}.journal where company_id = $1 and type = 'prospects.deposes' and donnees->>'campagneId' = $2 and seq > $3 order by seq asc limit ${Math.max(1, Math.floor(pas))}`,
        [companyId, campagneId, apres],
      );
      for (const r of rangs) depots.push(depotDepuisJournal((r.issue_id as string | null) ?? null, (typeof r.donnees === "object" && r.donnees ? r.donnees : {}) as Record<string, unknown>, iso(r.cree_le)));
      if (rangs.length < pas) break;
      apres = Number(rangs[rangs.length - 1]!.seq);
    }
    return depots;
  }

  /** Entreprises suivies par l'atelier (au moins une porte de tâche). */
  async function entreprisesSuivies() {
    return (await q(`select distinct company_id from ${ns}.portes`)).map((r) => String(r.company_id));
  }

  /**
   * Veilleur (tâches orphelines) : tâches assignées à un agent invocable, `todo` ou `in_progress`,
   * sans bloqueur ouvert ni sous-tâche ouverte, sans passage en file ou en cours, dont le dernier
   * passage s'est arrêté sans aboutir (interrompu, échoué, expiré) sans code d'arrêt « définitif »
   * (tours épuisés, budget, quota, authentification), hors issue de discussion, est une relance programmée
   * jamais partie, ou n'existe pas ; et rien n'a bougé (tâche, passage) depuis `seuilMinutes`.
   * Filet « la chaîne ne s'arrête pas » : une tâche `in_review` ou `blocked` est aussi candidate (sans exécution depuis le
   * seuil, quel que soit l'état du dernier passage), sauf si une porte active la gère (redispatch et décision humaine).
   * Revue M4 (21/10/2026) : `in_review` et `blocked` sont aussi écartées si la tâche a une liaison `en_attente_approbation`, une
   * approbation Paperclip en attente qui la cite (charge de l'approbation), ou une revue ouverte qui la cite par son identifiant
   * dans le titre et dont l'assigné est un autre agent (le relecteur). `blocked` n'est prise que si le dernier passage a échoué
   * ou été interrompu : un blocage posé volontairement (question) n'est jamais relancé.
   */
  async function tachesOrphelines(companyId: string, seuilMinutes: number, dormanteHeures = 24) {
    // COORD-P1-6 : sous-tâche ouverte sans mise à jour ni passage depuis `dormanteHeures` : elle n'écarte plus sa parente,
    // qui devient candidate (sauf parente bloquée) pour que le coordinateur relance ou redistribue.
    const dormante = "c.updated_at < now() - make_interval(hours => $3::int) and not exists (select 1 from public.heartbeat_runs y where y.company_id = $1 and y.context_snapshot->>'issueId' = c.id::text and y.created_at > now() - make_interval(hours => $3::int))";
    const rangs = await q(
      `with dernier as (
         select distinct on (r.context_snapshot->>'issueId') r.context_snapshot->>'issueId' as issue_id, r.id, r.status, r.error_code, coalesce(r.finished_at, r.scheduled_retry_at, r.created_at) as le
         from public.heartbeat_runs r
         where r.company_id = $1 and r.created_at > now() - interval '30 days'
         order by r.context_snapshot->>'issueId', r.created_at desc
       )
       select i.id, i.identifier, i.status, i.assignee_agent_id, d.id as run_id, d.status as run_statut, d.le as run_le
       from public.issues i
       join public.agents a on a.id = i.assignee_agent_id and a.company_id = i.company_id
       left join dernier d on d.issue_id = i.id::text
       where i.company_id = $1
         and i.status in ('todo', 'in_progress', 'in_review', 'blocked')
         and (i.status in ('todo', 'in_progress') or not exists (select 1 from ${ns}.portes p where p.issue_id = i.id and p.actif))
         and i.assignee_user_id is null
         and i.hidden_at is null
         and not (i.origin_kind like 'plugin:%:discussion' and coalesce(i.origin_id, '') like 'discussion:%')
         and coalesce(d.error_code, '') not in ('max_turns_exhausted', 'provider_quota', 'claude_auth_required', 'acpx_auth_required', 'continuation_user_authorization_missing')
         and coalesce(d.error_code, '') not like '%budget%'
         and coalesce(d.error_code, '') not like '%quota%'
         and coalesce(d.error_code, '') not like '%auth%'
         and a.status not in ('paused', 'terminated', 'pending_approval')
         and i.updated_at < now() - make_interval(mins => $2::int)
         and ((case
               when i.status = 'blocked' then d.status in ('interrupted', 'failed', 'timed_out', 'scheduled_retry')
               else (d.id is null or i.status = 'in_review' or d.status in ('interrupted', 'failed', 'timed_out', 'scheduled_retry'))
             end) or (i.status <> 'blocked' and exists (select 1 from public.issues c where c.parent_id = i.id and c.status not in ('done', 'cancelled') and c.hidden_at is null and ${dormante})))
         and (i.status in ('todo', 'in_progress') or (
               not exists (select 1 from ${ns}.liaisons li where li.company_id = i.company_id and li.tache_origine_id = i.id and li.statut = 'en_attente_approbation')
           and not exists (select 1 from public.approvals ap where ap.company_id = i.company_id and ap.status = 'pending' and ap.payload::text like '%' || i.id::text || '%')
           and not exists (select 1 from public.issues rv where rv.company_id = i.company_id and rv.id <> i.id and rv.status not in ('done', 'cancelled') and rv.hidden_at is null
                             and i.identifier is not null and rv.title ~ ('(^|[^A-Za-z0-9-])' || i.identifier || '([^0-9]|$)')
                             and rv.assignee_agent_id is not null and rv.assignee_agent_id <> i.assignee_agent_id)))
         and coalesce(d.le, i.updated_at) < now() - make_interval(mins => $2::int)
         and not exists (select 1 from public.heartbeat_runs x where x.company_id = $1 and x.context_snapshot->>'issueId' = i.id::text and x.status in ('queued', 'running'))
         and not exists (select 1 from public.issue_relations rel join public.issues b on b.id = rel.issue_id where rel.related_issue_id = i.id and rel.type = 'blocks' and b.status <> 'done')
         and not exists (select 1 from public.issues c where c.parent_id = i.id and c.status not in ('done', 'cancelled') and not (${dormante}))
       order by i.updated_at asc
       limit 50`,
      [companyId, Math.max(1, Math.floor(seuilMinutes)), dormanteHeures],
    );
    return rangs.map((r) => ({
      issueId: String(r.id),
      identifier: r.identifier == null ? null : String(r.identifier),
      statut: String(r.status),
      agentId: String(r.assignee_agent_id),
      dernierRun: r.run_id == null ? null : { id: String(r.run_id), statut: String(r.run_statut), le: iso(r.run_le) },
    }));
  }

  /**
   * T7 (lot 2) : tâches `in_review` sous porte active restées sans rien depuis `heures` h. `tachesOrphelines` les exclut (le
   * veilleur ne les réveille jamais : la porte et ses relecteurs les gèrent) ; elles sont rendues ici pour que l'accueil les
   * signale, sans aucun réveil. Écartées : passage récent ou en cours, approbation ou liaison en attente, revue ouverte et récente.
   */
  async function tachesFigeesSousPorte(companyId: string, heures = 24) {
    const rangs = await q(
      `select i.id, i.identifier, i.title, i.assignee_agent_id, a.name as agent_nom, i.updated_at as le,
         exists (select 1 from public.issues c where c.parent_id = i.id and c.status not in ('done', 'cancelled') and c.hidden_at is null) as revue_ouverte
       from public.issues i
       left join public.agents a on a.id = i.assignee_agent_id and a.company_id = i.company_id
       where i.company_id = $1 and i.status = 'in_review' and i.hidden_at is null
         and exists (select 1 from ${ns}.portes p where p.issue_id = i.id and p.actif)
         and i.updated_at < now() - make_interval(hours => $2::int)
         and not exists (select 1 from public.heartbeat_runs y where y.company_id = $1 and y.context_snapshot->>'issueId' = i.id::text and (y.status in ('queued', 'running') or y.created_at > now() - make_interval(hours => $2::int)))
         and not exists (select 1 from public.approvals ap where ap.company_id = i.company_id and ap.status = 'pending' and ap.payload::text like '%' || i.id::text || '%')
         and not exists (select 1 from ${ns}.liaisons li where li.company_id = i.company_id and li.tache_origine_id = i.id and li.statut = 'en_attente_approbation')
         and not exists (select 1 from public.issues c where c.parent_id = i.id and c.status not in ('done', 'cancelled') and c.updated_at >= now() - make_interval(hours => $2::int))
       order by i.updated_at asc
       limit 20`,
      [companyId, Math.max(1, Math.floor(heures))],
    );
    return rangs.map((r) => ({
      issueId: String(r.id),
      identifier: r.identifier == null ? null : String(r.identifier),
      titre: String(r.title ?? ""),
      agentId: String(r.assignee_agent_id),
      agentNom: r.agent_nom == null ? null : String(r.agent_nom),
      revueOuverte: r.revue_ouverte === true,
      le: iso(r.le),
    }));
  }

  async function lireJournal(companyId: string, afterSeq: number, limite: number, issueId?: string) {
    const lim = Math.min(Math.max(1, limite), LIMITES.journalPageMax);
    const rangs = issueId
      ? await q(`select seq, company_id, type, entite, entite_id, issue_id, run_id, acteur, donnees, cree_le from ${ns}.journal where company_id = $1 and seq > $2 and issue_id = $3 order by seq asc limit ${lim + 1}`, [companyId, afterSeq, issueId])
      : await q(`select seq, company_id, type, entite, entite_id, issue_id, run_id, acteur, donnees, cree_le from ${ns}.journal where company_id = $1 and seq > $2 order by seq asc limit ${lim + 1}`, [companyId, afterSeq]);
    const page = rangs.slice(0, lim).map((r) => ({
      seq: Number(r.seq),
      companyId: String(r.company_id),
      type: String(r.type),
      entite: String(r.entite),
      entiteId: String(r.entite_id),
      issueId: (r.issue_id as string | null) ?? null,
      runId: (r.run_id as string | null) ?? null,
      acteur: (r.acteur as string | null) ?? null,
      donnees: (typeof r.donnees === "object" && r.donnees ? r.donnees : {}) as Record<string, unknown>,
      creeLe: iso(r.cree_le),
    }));
    return { evenements: page, dernierSeq: page.length ? page[page.length - 1]!.seq : afterSeq, complet: rangs.length <= lim };
  }

  /* ---------------- réglages ---------------- */
  /** Plafond publicitaire lu en base ; `null` tant qu'aucun choix n'a été fait. */
  function plafondDepuisLigne(type: unknown, cents: unknown, par: unknown, le: unknown) {
    if (type === "montant" && cents != null && Number(cents) > 0) return { type: "montant" as const, montantCents: Number(cents), decidePar: String(par ?? "inconnu"), decideLe: iso(le) };
    if (type === "aucune_limite") return { type: "aucune_limite" as const, decidePar: String(par ?? "inconnu"), decideLe: iso(le) };
    return null;
  }

  async function lireReglages(companyId: string) {
    const [r] = await q(`select company_id, max_runs_actifs, max_cycles_correction, mode_par_defaut, retention_jours, modifie_le, plafond_pub_type, plafond_pub_cents, plafond_pub_decide_par, plafond_pub_decide_le from ${ns}.reglages_entreprise where company_id = $1`, [companyId]);
    return {
      companyId,
      maxRunsActifs: r ? Number(r.max_runs_actifs) : LIMITES.maxRunsActifsParDefaut,
      maxCyclesCorrection: r ? Number(r.max_cycles_correction) : LIMITES.maxCyclesCorrectionParDefaut,
      modeParDefaut: (r?.mode_par_defaut as "demonstration" | "reel" | undefined) ?? "reel",
      retentionJours: r ? Number(r.retention_jours) : 365,
      plafondPub: r ? plafondDepuisLigne(r.plafond_pub_type, r.plafond_pub_cents, r.plafond_pub_decide_par, r.plafond_pub_decide_le) : null,
      modifieLe: r ? iso(r.modifie_le) : new Date(0).toISOString(),
      existe: Boolean(r),
    };
  }

  /** Témoin de la clé des empreintes de l'entreprise (migration 033) ; null tant qu'aucune clé n'a été chargée. */
  async function lireTemoinCleEmpreintes(companyId: string): Promise<string | null> {
    const [r] = await q(`select temoin_cle_empreintes from ${ns}.reglages_entreprise where company_id = $1`, [companyId]);
    return typeof r?.temoin_cle_empreintes === "string" ? r.temoin_cle_empreintes : null;
  }

  /** Adopte le témoin d'une entreprise qui n'en a pas ; ne remplace jamais un témoin existant. Vrai si l'adoption a eu lieu. */
  async function adopterTemoinCleEmpreintes(companyId: string, temoin: string): Promise<boolean> {
    const { rowCount } = await x(
      `insert into ${ns}.reglages_entreprise as r (company_id, temoin_cle_empreintes, modifie_le) values ($1, $2, now())
       on conflict (company_id) do update set temoin_cle_empreintes = excluded.temoin_cle_empreintes where r.temoin_cle_empreintes is null`,
      [companyId, temoin],
    );
    return rowCount === 1;
  }

  /** Vrai si l'entreprise a au moins une opposition (sa clé d'empreintes compte alors). */
  async function entrepriseAOppositions(companyId: string): Promise<boolean> {
    return (await q(`select 1 as un from ${ns}.oppositions where company_id = $1 limit 1`, [companyId])).length > 0;
  }

  /** Remplace le témoin de clé d'une entreprise (rotation voulue, sans opposition à protéger). */
  async function remplacerTemoinCleEmpreintes(companyId: string, temoin: string): Promise<void> {
    await x(`update ${ns}.reglages_entreprise set temoin_cle_empreintes = $2, modifie_le = now() where company_id = $1`, [companyId, temoin]);
  }

  /** Enregistre les réglages ; le plafond publicitaire n'est touché que par `enregistrerPlafondEntreprise`. */
  async function enregistrerReglages(r: { companyId: string; maxRunsActifs: number; maxCyclesCorrection: number; modeParDefaut: string; retentionJours: number }) {
    await x(
      `insert into ${ns}.reglages_entreprise (company_id, max_runs_actifs, max_cycles_correction, mode_par_defaut, retention_jours, modifie_le) values ($1, $2, $3, $4, $5, now())
       on conflict (company_id) do update set max_runs_actifs = excluded.max_runs_actifs, max_cycles_correction = excluded.max_cycles_correction, mode_par_defaut = excluded.mode_par_defaut, retention_jours = excluded.retention_jours, modifie_le = now()`,
      [r.companyId, r.maxRunsActifs, r.maxCyclesCorrection, r.modeParDefaut, r.retentionJours],
    );
  }

  /** Choix du plafond publicitaire de l'entreprise (`null` : retire le choix). Les autres réglages restent tels quels. */
  async function enregistrerPlafondEntreprise(
    companyId: string,
    plafond: { type: "montant"; montantCents: number } | { type: "aucune_limite" } | null,
    par: string,
  ) {
    const type = plafond?.type ?? null;
    const cents = plafond?.type === "montant" ? plafond.montantCents : null;
    await x(
      `insert into ${ns}.reglages_entreprise (company_id, plafond_pub_type, plafond_pub_cents, plafond_pub_decide_par, plafond_pub_decide_le, modifie_le) values ($1, $2, $3, $4, $5, now())
       on conflict (company_id) do update set plafond_pub_type = excluded.plafond_pub_type, plafond_pub_cents = excluded.plafond_pub_cents, plafond_pub_decide_par = excluded.plafond_pub_decide_par, plafond_pub_decide_le = excluded.plafond_pub_decide_le, modifie_le = now()`,
      [companyId, type, cents, type === null ? null : par, type === null ? null : new Date().toISOString()],
    );
  }

  /* ---------------- campagnes et briefs ---------------- */
  function campagneDepuisLigne(r: Ligne) {
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      projectId: String(r.project_id),
      briefIssueId: (r.brief_issue_id as string | null) ?? null,
      nom: String(r.nom),
      objectifs: tableau<string>(r.objectifs),
      cible: (r.cible as string | null) ?? null,
      offre: (r.offre as string | null) ?? null,
      canaux: tableau<string>(r.canaux),
      perimetre: { etablissements: tableau<string>(r.etablissements), zones: tableau<string>(r.zones) },
      budgetMaxCents: r.plafond_pub_type === "montant" && r.budget_max_cents != null && Number(r.budget_max_cents) > 0 ? Number(r.budget_max_cents) : null,
      plafondPub: plafondDepuisLigne(r.plafond_pub_type, r.budget_max_cents, r.plafond_pub_decide_par, r.plafond_pub_decide_le),
      mode: r.mode as "demonstration" | "reel",
      etatProjet: {
        statut: String(r.projet_statut ?? "inconnu"),
        enPause: r.projet_en_pause === true,
        archive: r.projet_archive === true,
      },
      creeLe: iso(r.cree_le),
    };
  }
  const SELECT_CAMPAGNE = `select c.*, p.status as projet_statut, (p.paused_at is not null) as projet_en_pause, (p.archived_at is not null) as projet_archive from ${ns}.campagnes c join public.projects p on p.id = c.project_id`;

  async function creerCampagne(c: {
    companyId: string; projectId: string; briefIssueId: string | null; nom: string; objectifs: string[]; cible: string | null; offre: string | null;
    canaux: string[]; etablissements: string[]; zones: string[]; mode: string;
    plafond: { type: "montant"; montantCents: number } | { type: "aucune_limite" } | null; plafondDecidePar: string;
  }) {
    const id = randomUUID();
    const type = c.plafond?.type ?? null;
    const cents = c.plafond?.type === "montant" ? c.plafond.montantCents : null;
    await x(
      `insert into ${ns}.campagnes (id, company_id, project_id, brief_issue_id, nom, objectifs, cible, offre, canaux, etablissements, zones, budget_max_cents, mode, plafond_pub_type, plafond_pub_decide_par, plafond_pub_decide_le)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16)`,
      [id, c.companyId, c.projectId, c.briefIssueId, c.nom, json(c.objectifs), c.cible, c.offre, json(c.canaux), json(c.etablissements), json(c.zones), cents, c.mode, type,
        type === null ? null : c.plafondDecidePar, type === null ? null : new Date().toISOString()],
    );
    return id;
  }

  /** Choix du plafond publicitaire d'une campagne (`null` : retire le choix). */
  async function enregistrerPlafondCampagne(companyId: string, campagneId: string, plafond: { type: "montant"; montantCents: number } | { type: "aucune_limite" } | null, par: string) {
    const type = plafond?.type ?? null;
    const cents = plafond?.type === "montant" ? plafond.montantCents : null;
    await x(
      `update ${ns}.campagnes set budget_max_cents = $3, plafond_pub_type = $4, plafond_pub_decide_par = $5, plafond_pub_decide_le = $6, modifie_le = now() where company_id = $1 and id = $2`,
      [companyId, campagneId, cents, type, type === null ? null : par, type === null ? null : new Date().toISOString()],
    );
  }

  async function listerCampagnes(companyId: string) {
    return (await q(`${SELECT_CAMPAGNE} where c.company_id = $1 order by c.cree_le desc`, [companyId])).map(campagneDepuisLigne);
  }

  async function lireCampagne(companyId: string, campagneId: string) {
    const [r] = await q(`${SELECT_CAMPAGNE} where c.company_id = $1 and c.id = $2`, [companyId, campagneId]);
    return r ? campagneDepuisLigne(r) : null;
  }

  async function creerBrief(b: { companyId: string; campagneId: string; issueId: string | null; texte: string }) {
    const [dernier] = await q<{ v: number | null }>(`select max(version) as v from ${ns}.briefs where campagne_id = $1`, [b.campagneId]);
    const version = Number(dernier?.v ?? 0) + 1;
    const id = randomUUID();
    await x(`insert into ${ns}.briefs (id, company_id, campagne_id, issue_id, texte_original, version) values ($1, $2, $3, $4, $5, $6)`, [id, b.companyId, b.campagneId, b.issueId, b.texte, version]);
    return { id, version };
  }

  async function dernierBrief(companyId: string, campagneId: string) {
    const [r] = await q(`select * from ${ns}.briefs where company_id = $1 and campagne_id = $2 order by version desc limit 1`, [companyId, campagneId]);
    if (!r) return null;
    return { id: String(r.id), companyId, campagneId, issueId: (r.issue_id as string | null) ?? null, texteOriginal: String(r.texte_original), version: Number(r.version), creeLe: iso(r.cree_le) };
  }

  /* ---------------- exigences ---------------- */
  function exigenceDepuisLigne(r: Ligne) {
    return {
      id: String(r.id),
      code: String(r.code),
      companyId: String(r.company_id),
      campagneId: String(r.campagne_id),
      texteOriginal: String(r.texte_original),
      interpretation: String(r.interpretation),
      obligatoire: Boolean(r.obligatoire),
      criteres: tableau<string>(r.criteres),
      dependances: tableau<string>(r.dependances),
      elementsAttendus: tableau<string>(r.elements_attendus),
      exclusion: {
        etat: r.exclusion_etat as "aucune" | "demandee" | "autorisee" | "refusee",
        justification: (r.exclusion_justification as string | null) ?? null,
        demandeePar: (r.exclusion_demandee_par as string | null) ?? null,
        decideePar: (r.exclusion_decidee_par as string | null) ?? null,
        decideeLe: r.exclusion_decidee_le ? iso(r.exclusion_decidee_le) : null,
      },
      version: Number(r.version),
      creeLe: iso(r.cree_le),
      modifieLe: iso(r.modifie_le),
    };
  }

  async function enregistrerExigence(e: {
    companyId: string; campagneId: string; code: string; texteOriginal: string; interpretation: string; obligatoire: boolean;
    criteres: string[]; dependances: string[]; elementsAttendus: string[];
  }) {
    await x(
      `insert into ${ns}.exigences (id, company_id, campagne_id, code, texte_original, interpretation, obligatoire, criteres, dependances, elements_attendus) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
       on conflict (campagne_id, code) do update set texte_original = excluded.texte_original, interpretation = excluded.interpretation, obligatoire = excluded.obligatoire,
         criteres = excluded.criteres, dependances = excluded.dependances, elements_attendus = excluded.elements_attendus, version = exigences.version + 1, modifie_le = now()`,
      [randomUUID(), e.companyId, e.campagneId, e.code, e.texteOriginal, e.interpretation, e.obligatoire, json(e.criteres), json(e.dependances), json(e.elementsAttendus)],
    );
  }

  /**
   * H1 : création SEULE (jamais de remplacement). Renvoie faux si le code existe déjà : un agent
   * ne réécrit jamais une exigence existante, même en course avec une autre création.
   */
  async function creerExigenceSiAbsente(e: {
    companyId: string; campagneId: string; code: string; texteOriginal: string; interpretation: string; obligatoire: boolean;
    criteres: string[]; dependances: string[]; elementsAttendus: string[];
  }) {
    const { rowCount } = await x(
      `insert into ${ns}.exigences (id, company_id, campagne_id, code, texte_original, interpretation, obligatoire, criteres, dependances, elements_attendus) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
       on conflict (campagne_id, code) do nothing`,
      [randomUUID(), e.companyId, e.campagneId, e.code, e.texteOriginal, e.interpretation, e.obligatoire, json(e.criteres), json(e.dependances), json(e.elementsAttendus)],
    );
    return rowCount === 1;
  }

  async function listerExigences(companyId: string, campagneId: string) {
    return (await q(`select * from ${ns}.exigences where company_id = $1 and campagne_id = $2 order by code`, [companyId, campagneId])).map(exigenceDepuisLigne);
  }

  async function lireExigence(companyId: string, id: string) {
    const [r] = await q(`select * from ${ns}.exigences where company_id = $1 and id = $2`, [companyId, id]);
    return r ? exigenceDepuisLigne(r) : null;
  }

  async function changerExclusion(companyId: string, id: string, etat: string, justification: string, acteur: string, decision: boolean) {
    return x(
      decision
        ? `update ${ns}.exigences set exclusion_etat = $3, exclusion_justification = $4, exclusion_decidee_par = $5, exclusion_decidee_le = now(), modifie_le = now() where company_id = $1 and id = $2`
        : `update ${ns}.exigences set exclusion_etat = $3, exclusion_justification = $4, exclusion_demandee_par = $5, modifie_le = now() where company_id = $1 and id = $2 and exclusion_etat <> 'autorisee'`,
      [companyId, id, etat, justification, acteur],
    );
  }

  /* ---------------- portes ---------------- */
  function porteDepuisLigne(r: Ligne) {
    return {
      issueId: String(r.issue_id),
      companyId: String(r.company_id),
      campagneId: String(r.campagne_id),
      cleLivrable: String(r.cle_livrable),
      exigencesCiblees: tableau<string>(r.exigences_ciblees),
      revuesRequises: tableau<{ role: RoleRevue; agentId: string }>(r.revues_requises),
      maxCycles: Number(r.max_cycles),
      cyclesConsommes: Number(r.cycles_consommes),
      actif: Boolean(r.actif),
      leveePar: (r.levee_par as string | null) ?? null,
      motifLevee: (r.motif_levee as string | null) ?? null,
      creeLe: iso(r.cree_le),
      modifieLe: iso(r.modifie_le),
    };
  }

  async function creerPorte(p: { issueId: string; companyId: string; campagneId: string; cleLivrable: string; exigencesCiblees: string[]; revuesRequises: unknown; maxCycles: number }) {
    const { rowCount } = await x(
      `insert into ${ns}.portes (issue_id, company_id, campagne_id, cle_livrable, exigences_ciblees, revues_requises, max_cycles) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) on conflict (issue_id) do nothing`,
      [p.issueId, p.companyId, p.campagneId, p.cleLivrable, json(p.exigencesCiblees), json(p.revuesRequises), p.maxCycles],
    );
    return rowCount === 1;
  }

  async function lirePorte(companyId: string, issueId: string) {
    const [r] = await q(`select * from ${ns}.portes where company_id = $1 and issue_id = $2`, [companyId, issueId]);
    return r ? porteDepuisLigne(r) : null;
  }

  async function listerPortes(companyId: string) {
    return (await q(`select * from ${ns}.portes where company_id = $1`, [companyId])).map(porteDepuisLigne);
  }

  async function majCycles(companyId: string, issueId: string, cycles: number) {
    await x(`update ${ns}.portes set cycles_consommes = $3 where company_id = $1 and issue_id = $2`, [companyId, issueId, cycles]);
  }

  /* ---------------- couvertures, verdicts, constats ---------------- */
  async function insererCouverture(c: { companyId: string; issueId: string; revisionId: string; code: string; etat: string; preuves: unknown; hypotheses: unknown; question: string | null; par: string; runId: string | null }) {
    const id = randomUUID();
    await x(
      `insert into ${ns}.couvertures (id, company_id, issue_id, revision_id, code, etat, preuves, hypotheses, question, declaree_par, run_id, modifie_le) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, clock_timestamp())`,
      [id, c.companyId, c.issueId, c.revisionId, c.code, c.etat, json(c.preuves), json(c.hypotheses), c.question, c.par, c.runId],
    );
    return id;
  }

  async function listerCouvertures(companyId: string, issueId: string) {
    return (await q(`select *, cree_le::text as cree_le_texte from ${ns}.couvertures where company_id = $1 and issue_id = $2 order by cree_le`, [companyId, issueId])).map((r) => ({
      id: String(r.id),
      companyId,
      issueId,
      revisionId: String(r.revision_id),
      code: String(r.code),
      etat: r.etat as "non_traite" | "partiel" | "couvert" | "bloque" | "na_justifie",
      preuves: tableau<{ revisionId: string; emplacement: string; element: string | null; extrait: string; sourceIds?: string[] }>(r.preuves).map((p) => ({ ...p, element: p.element ?? null, sourceIds: p.sourceIds ?? [] })),
      hypotheses: tableau<{ texte: string; autoriseePar: string | null }>(r.hypotheses),
      question: (r.question as string | null) ?? null,
      declareePar: String(r.declaree_par),
      creeLe: iso(r.cree_le),
      ordre: String(r.cree_le_texte),
    }));
  }

  async function insererVerdict(v: {
    id: string; companyId: string; issueId: string; revisionId: string; role: string; relecteurType: string; relecteurId: string; runId: string | null; verdict: string;
    exigencesExaminees: unknown; preuvesVerifiees: unknown; constatsResolus: unknown; limites: unknown; controlesNonExecutes: unknown; justification: string | null;
  }) {
    await x(
      `insert into ${ns}.verdicts (id, company_id, issue_id, revision_id, role, relecteur_type, relecteur_id, run_id, verdict, exigences_examinees, preuves_verifiees, constats_resolus, limites, controles_non_executes, justification, modifie_le)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, clock_timestamp())`,
      [v.id, v.companyId, v.issueId, v.revisionId, v.role, v.relecteurType, v.relecteurId, v.runId, v.verdict, json(v.exigencesExaminees), json(v.preuvesVerifiees), json(v.constatsResolus), json(v.limites), json(v.controlesNonExecutes), v.justification],
    );
  }

  async function listerVerdicts(companyId: string, issueId: string) {
    return (await q(`select *, cree_le::text as cree_le_texte from ${ns}.verdicts where company_id = $1 and issue_id = $2 order by cree_le`, [companyId, issueId])).map((r) => ({
      id: String(r.id),
      companyId,
      issueId,
      revisionId: String(r.revision_id),
      role: r.role as RoleRevue,
      relecteur: { type: (r.relecteur_type === "agent" ? "agent" : "humain") as "agent" | "humain", id: String(r.relecteur_id), runId: (r.run_id as string | null) ?? null },
      verdict: r.verdict as "PASS" | "CHANGES_REQUESTED" | "BLOCKED_INFORMATION" | "NOT_APPLICABLE_JUSTIFIED",
      exigencesExaminees: tableau<string>(r.exigences_examinees),
      preuvesVerifiees: tableau<{ revisionId: string; emplacement: string; element: string | null; extrait: string; sourceIds?: string[] }>(r.preuves_verifiees).map((p) => ({ ...p, element: p.element ?? null, sourceIds: p.sourceIds ?? [] })),
      constatsResolus: tableau<string>(r.constats_resolus),
      limites: tableau<string>(r.limites),
      controlesNonExecutes: tableau<string>(r.controles_non_executes),
      justification: (r.justification as string | null) ?? null,
      creeLe: iso(r.cree_le),
      ordre: String(r.cree_le_texte),
    }));
  }

  async function insererConstat(c: {
    findingId: string; companyId: string; issueId: string; verdictId: string; role: string; relecteurType: string; relecteurId: string; revisionId: string;
    requirementIds: string[]; categorie: string; gravite: string; emplacement: string; description: string; preuve: string; correctionAttendue: string;
  }) {
    await x(
      `insert into ${ns}.constats (finding_id, company_id, issue_id, verdict_id, role, relecteur_type, relecteur_id, revision_id, requirement_ids, categorie, gravite, emplacement, description, preuve, correction_attendue, modifie_le)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, clock_timestamp())`,
      [c.findingId, c.companyId, c.issueId, c.verdictId, c.role, c.relecteurType, c.relecteurId, c.revisionId, json(c.requirementIds), c.categorie, c.gravite, c.emplacement, c.description, c.preuve, c.correctionAttendue],
    );
  }

  async function resoudreConstats(companyId: string, issueId: string, findingIds: string[], revisionId: string, role: string) {
    if (findingIds.length === 0) return 0;
    const { rowCount } = await x(
      `update ${ns}.constats set statut_resolution = 'resolu', resolu_dans_revision = $3, modifie_le = clock_timestamp() where company_id = $1 and issue_id = $2 and role = $5 and statut_resolution = 'ouvert' and finding_id in (select jsonb_array_elements_text($4::jsonb))`,
      [companyId, issueId, revisionId, json(findingIds), role],
    );
    return rowCount;
  }

  async function listerConstats(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.constats where company_id = $1 and issue_id = $2 order by cree_le`, [companyId, issueId])).map((r) => ({
      findingId: String(r.finding_id),
      companyId,
      issueId,
      reviewer: { type: (r.relecteur_type === "agent" ? "agent" : "humain") as "agent" | "humain", id: String(r.relecteur_id), runId: null },
      role: r.role as RoleRevue,
      artifactVersion: String(r.revision_id),
      requirementIds: tableau<string>(r.requirement_ids),
      categorie: String(r.categorie) as never,
      gravite: r.gravite as "critique" | "majeure" | "mineure" | "info",
      emplacement: String(r.emplacement),
      description: String(r.description),
      preuve: String(r.preuve),
      correctionAttendue: String(r.correction_attendue),
      statutResolution: r.statut_resolution as "ouvert" | "resolu" | "rejete" | "accepte_par_humain",
      resoluDansRevision: (r.resolu_dans_revision as string | null) ?? null,
      verdictId: String(r.verdict_id),
      creeLe: iso(r.cree_le),
    }));
  }

  /* ---------------- évaluations de porte ---------------- */
  /** Dernière modification des entrées (texte, précision microseconde). */
  async function derniereEntree(companyId: string, issueId: string, campagneId: string): Promise<string | null> {
    const [r] = await q<{ d: string | null }>(
      `select greatest(
         (select max(modifie_le) from ${ns}.couvertures where company_id = $1 and issue_id = $2),
         (select max(modifie_le) from ${ns}.verdicts where company_id = $1 and issue_id = $2),
         (select max(modifie_le) from ${ns}.constats where company_id = $1 and issue_id = $2),
         (select max(modifie_le) from ${ns}.exigences where company_id = $1 and campagne_id = $3),
         (select max(date_collecte) from ${ns}.sources where company_id = $1 and issue_id = $2),
         (select modifie_le from ${ns}.portes where company_id = $1 and issue_id = $2)
       )::text as d`,
      [companyId, issueId, campagneId],
    );
    return r?.d ?? null;
  }

  async function insererEvaluation(e: {
    id: string; companyId: string; issueId: string; revisionId: string | null; decision: string; motifs: unknown; empreinte: string;
    entreesJusquA: string; cyclesEpuises: boolean; par: string;
  }) {
    await x(
      `insert into ${ns}.evaluations_porte (id, company_id, issue_id, revision_id, decision, motifs, empreinte, entrees_jusqu_a, cycles_epuises, evaluee_par) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9, $10)`,
      [e.id, e.companyId, e.issueId, e.revisionId, e.decision, json(e.motifs), e.empreinte, e.entreesJusquA, e.cyclesEpuises, e.par],
    );
  }

  /** Même contrôle que le serveur (P2), calculé par PostgreSQL : dernière évaluation et fraîcheur. */
  async function etatDerniereEvaluation(companyId: string, issueId: string, campagneId: string) {
    const [r] = await q<{ decision: string; perimee: boolean; revision_id: string | null; plus_recentes: boolean | null }>(
      `select ev.decision, ev.perimee, ev.revision_id, coalesce(greatest(
         (select max(modifie_le) from ${ns}.couvertures where company_id = $1 and issue_id = $2),
         (select max(modifie_le) from ${ns}.verdicts where company_id = $1 and issue_id = $2),
         (select max(modifie_le) from ${ns}.constats where company_id = $1 and issue_id = $2),
         (select max(modifie_le) from ${ns}.exigences where company_id = $1 and campagne_id = $3),
         (select max(date_collecte) from ${ns}.sources where company_id = $1 and issue_id = $2),
         (select modifie_le from ${ns}.portes where company_id = $1 and issue_id = $2)
       ) > ev.entrees_jusqu_a, false) as plus_recentes
       from ${ns}.evaluations_porte ev where ev.company_id = $1 and ev.issue_id = $2 order by ev.cree_le desc limit 1`,
      [companyId, issueId, campagneId],
    );
    return r ? { decision: r.decision, perimee: Boolean(r.perimee), revisionId: r.revision_id, plusRecentes: Boolean(r.plus_recentes) } : null;
  }

  async function perimerEvaluations(companyId: string, issueId: string) {
    await x(`update ${ns}.evaluations_porte set perimee = true where company_id = $1 and issue_id = $2 and perimee = false`, [companyId, issueId]);
  }

  async function listerEvaluations(companyId: string, issueId: string) {
    return (await q(`select *, entrees_jusqu_a::text as entrees_texte from ${ns}.evaluations_porte where company_id = $1 and issue_id = $2 order by cree_le desc`, [companyId, issueId])).map((r) => ({
      id: String(r.id),
      companyId,
      issueId,
      revisionId: (r.revision_id as string | null) ?? null,
      decision: r.decision as "PASS" | "REFUS" | "BLOQUE_INFORMATION",
      motifs: tableau(r.motifs) as never[],
      empreinte: String(r.empreinte),
      entreesJusquA: iso(r.entrees_jusqu_a),
      perimee: Boolean(r.perimee),
      cyclesEpuises: Boolean(r.cycles_epuises),
      evalueePar: String(r.evaluee_par),
      creeLe: iso(r.cree_le),
    }));
  }

  /* ---------------- messages ---------------- */
  async function insererMessage(m: {
    id: string; companyId: string; projectId: string | null; campagneId: string | null; runId: string | null; issueId: string;
    expediteurType: string; expediteurId: string; destinataireType: string; destinataireId: string; type: string; contenu: unknown; references: unknown; provenance: string;
  }) {
    await x(
      `insert into ${ns}.messages (id, company_id, project_id, campagne_id, run_id, issue_id, expediteur_type, expediteur_id, destinataire_type, destinataire_id, type, contenu, references_artefacts, provenance)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)`,
      [m.id, m.companyId, m.projectId, m.campagneId, m.runId, m.issueId, m.expediteurType, m.expediteurId, m.destinataireType, m.destinataireId, m.type, json(m.contenu), json(m.references), m.provenance],
    );
  }

  async function lierCommentaire(companyId: string, messageId: string, commentaireId: string) {
    await x(`update ${ns}.messages set commentaire_natif_id = $3 where company_id = $1 and id = $2`, [companyId, messageId, commentaireId]);
  }

  function messageDepuisLigne(r: Ligne) {
    return {
      messageId: String(r.id),
      companyId: String(r.company_id),
      projectId: (r.project_id as string | null) ?? null,
      campaignId: (r.campagne_id as string | null) ?? null,
      runId: (r.run_id as string | null) ?? null,
      taskId: String(r.issue_id),
      sender: { type: r.expediteur_type as "agent" | "humain" | "systeme", id: String(r.expediteur_id), runId: (r.run_id as string | null) ?? null },
      recipient: { type: r.destinataire_type as "agent" | "humain", id: String(r.destinataire_id) },
      type: String(r.type) as never,
      contenu: r.contenu as never,
      references: tableau(r.references_artefacts) as never[],
      commentaireNatifId: (r.commentaire_natif_id as string | null) ?? null,
      horodatage: iso(r.cree_le),
      etatTraitement: r.etat_traitement as "recu" | "lu" | "traite" | "rejete",
      provenance: r.provenance as "agent" | "humain" | "systeme",
    };
  }

  async function listerMessages(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.messages where company_id = $1 and issue_id = $2 order by cree_le`, [companyId, issueId])).map(messageDepuisLigne);
  }

  async function messagesRecents(companyId: string, limite = 30) {
    return (await q(`select * from ${ns}.messages where company_id = $1 order by cree_le desc limit ${Math.min(200, Math.max(1, limite))}`, [companyId])).map(messageDepuisLigne);
  }

  async function compterEnvoisRecents(companyId: string, issueId: string, expediteurId: string) {
    const [r] = await q<{ n: number | string }>(`select count(*) as n from ${ns}.messages where company_id = $1 and issue_id = $2 and expediteur_id = $3 and cree_le > now() - interval '1 hour'`, [companyId, issueId, expediteurId]);
    return Number(r?.n ?? 0);
  }

  async function changerEtatMessage(companyId: string, issueId: string, messageId: string, destinataireId: string, etat: string) {
    return x(`update ${ns}.messages set etat_traitement = $5, modifie_le = now() where company_id = $1 and issue_id = $2 and id = $3 and destinataire_id = $4`, [companyId, issueId, messageId, destinataireId, etat]);
  }

  /* ---------------- sources et imports ---------------- */
  async function insererSource(s: {
    id: string; companyId: string; campagneId: string | null; issueId: string | null; revisionId: string | null; url: string; urlFinale: string | null; titre: string | null;
    statutAcces: string; codeHttp: number | null; typeContenu: string | null; extrait: string | null; empreinte: string | null; indicesErreur: string[]; injections: string[]; provenance: string; mode: string;
    /** Source de connexion (lot L9, migration 004). */
    connexion?: { service: string; outil: string; indicesMode: string[]; chiffres: Array<{ valeur: number; chemin: string }>; modeCampagne: "demonstration" | "reel"; compte?: string | null } | null;
  }) {
    const c = s.connexion ?? null;
    await x(
      `insert into ${ns}.sources (id, company_id, campagne_id, issue_id, revision_id, url, url_finale, titre, statut_acces, code_http, type_contenu, extrait, empreinte, indices_erreur, injections_signalees, provenance, mode, service, outil, indices_mode, chiffres, mode_campagne, compte)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19, $20::jsonb, $21::jsonb, $22, $23)`,
      [s.id, s.companyId, s.campagneId, s.issueId, s.revisionId, s.url, s.urlFinale, s.titre, s.statutAcces, s.codeHttp, s.typeContenu, s.extrait, s.empreinte, json(s.indicesErreur), json(s.injections), s.provenance, s.mode,
        c?.service ?? null, c?.outil ?? null, json(c?.indicesMode ?? []), json(c?.chiffres ?? []), c?.modeCampagne ?? null, c?.compte ?? null],
    );
  }

  /**
   * v1.6 (S-6) : comptes signés des données RÉELLES déjà déposées pour ce service, dans la campagne
   * (ou, sans campagne, dans la tâche). Une campagne n'interroge qu'une propriété par service.
   */
  async function comptesConnexion(companyId: string, campagneId: string | null, issueId: string, service: string) {
    const lignes = campagneId
      ? await q(`select distinct compte from ${ns}.sources where company_id = $1 and campagne_id = $2 and provenance = 'connexion' and mode = 'reel' and service = $3 and compte is not null`, [companyId, campagneId, service])
      : await q(`select distinct compte from ${ns}.sources where company_id = $1 and issue_id = $2 and provenance = 'connexion' and mode = 'reel' and service = $3 and compte is not null`, [companyId, issueId, service]);
    return [...new Set(lignes.map((r) => r.compte).filter((c): c is string => typeof c === "string" && c !== ""))];
  }

  function sourceDepuisLigne(r: Ligne) {
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      campagneId: (r.campagne_id as string | null) ?? null,
      issueId: (r.issue_id as string | null) ?? null,
      revisionId: (r.revision_id as string | null) ?? null,
      url: String(r.url),
      urlFinale: (r.url_finale as string | null) ?? null,
      titre: (r.titre as string | null) ?? null,
      dateCollecte: iso(r.date_collecte),
      statutAcces: String(r.statut_acces) as never,
      codeHttp: r.code_http == null ? null : Number(r.code_http),
      typeContenu: (r.type_contenu as string | null) ?? null,
      extrait: (r.extrait as string | null) ?? null,
      empreinte: (r.empreinte as string | null) ?? null,
      indicesErreur: tableau<string>(r.indices_erreur),
      nonFiable: true as const,
      injectionsSignalees: tableau<string>(r.injections_signalees),
      provenance: String(r.provenance) as never,
      mode: r.mode as "demonstration" | "reel",
      connexion:
        r.provenance === "connexion"
          ? {
              service: String(r.service ?? ""),
              outil: String(r.outil ?? ""),
              indicesMode: tableau<string>(r.indices_mode),
              nombreChiffres: tableau(r.chiffres).length,
              modeCampagne: (r.mode_campagne === "reel" ? "reel" : "demonstration") as "demonstration" | "reel",
              compte: (r.compte as string | null) ?? null,
            }
          : null,
    };
  }

  /** Sources d'une tâche avec leurs chiffres retenus (garde des données simulées, lot L9). */
  async function sourcesPourGarde(companyId: string, issueId: string) {
    const lignes = await q(`select id, mode, provenance, url, service, outil, chiffres from ${ns}.sources where company_id = $1 and issue_id = $2 order by date_collecte asc, id asc`, [companyId, issueId]);
    return lignes.map((r) => ({
      id: String(r.id),
      mode: (r.mode === "reel" ? "reel" : "demonstration") as "demonstration" | "reel",
      provenance: String(r.provenance),
      url: String(r.url),
      service: (r.service as string | null) ?? null,
      outil: (r.outil as string | null) ?? null,
      chiffres: tableau<{ valeur: number; chemin: string }>(r.chiffres).filter((c) => typeof c?.valeur === "number"),
    }));
  }

  /**
   * Une nouvelle entrée de la porte (donnée de connexion) : la date de la porte avance, ce que
   * le serveur patché (P2) lit comme une entrée plus récente que la dernière évaluation.
   */
  async function toucherPorte(companyId: string, issueId: string) {
    await x(`update ${ns}.portes set modifie_le = now() where company_id = $1 and issue_id = $2`, [companyId, issueId]);
  }

  /** M3 : toutes les portes de l'entreprise (changement du mode par défaut) ; P2 lit `portes.modifie_le`. */
  async function toucherPortesEntreprise(companyId: string) {
    await x(`update ${ns}.portes set modifie_le = now() where company_id = $1`, [companyId]);
  }

  async function perimerEvaluationsEntreprise(companyId: string) {
    await x(`update ${ns}.evaluations_porte set perimee = true where company_id = $1 and perimee = false`, [companyId]);
  }

  async function listerSources(companyId: string, filtre: { campagneId?: string; issueId?: string } = {}) {
    if (filtre.issueId) return (await q(`select * from ${ns}.sources where company_id = $1 and issue_id = $2 order by date_collecte desc`, [companyId, filtre.issueId])).map(sourceDepuisLigne);
    if (filtre.campagneId) return (await q(`select * from ${ns}.sources where company_id = $1 and campagne_id = $2 order by date_collecte desc limit 200`, [companyId, filtre.campagneId])).map(sourceDepuisLigne);
    return (await q(`select * from ${ns}.sources where company_id = $1 order by date_collecte desc limit 200`, [companyId])).map(sourceDepuisLigne);
  }

  async function insererImport(i: {
    id: string; companyId: string; campagneId: string | null; nomFichier: string; type: string; tailleOctets: number; empreinte: string; lignes: number | null;
    colonnes: string[] | null; contenu: string; apercu: string; injections: string[]; par: string;
  }) {
    await x(
      `insert into ${ns}.imports (id, company_id, campagne_id, nom_fichier, type, taille_octets, empreinte, lignes, colonnes, contenu, apercu, injections_signalees, cree_par)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13)`,
      [i.id, i.companyId, i.campagneId, i.nomFichier, i.type, i.tailleOctets, i.empreinte, i.lignes, json(i.colonnes), i.contenu, i.apercu, json(i.injections), i.par],
    );
  }

  async function listerImports(companyId: string) {
    return (await q(`select id, company_id, campagne_id, nom_fichier, type, taille_octets, empreinte, lignes, colonnes, apercu, injections_signalees, cree_le from ${ns}.imports where company_id = $1 order by cree_le desc limit 200`, [companyId])).map((r) => ({
      id: String(r.id),
      companyId,
      campagneId: (r.campagne_id as string | null) ?? null,
      nomFichier: String(r.nom_fichier),
      type: r.type as "texte" | "markdown" | "csv",
      tailleOctets: Number(r.taille_octets),
      empreinte: String(r.empreinte),
      lignes: r.lignes == null ? null : Number(r.lignes),
      colonnes: r.colonnes == null ? null : tableau<string>(r.colonnes),
      apercu: String(r.apercu),
      injectionsSignalees: tableau<string>(r.injections_signalees),
      creeLe: iso(r.cree_le),
    }));
  }

  /* ---------------- décisions et diffusions ---------------- */
  async function insererDecision(d: { id: string; companyId: string; issueId: string; revisionId: string; action: string; commentaire: string; userId: string; portee: unknown; mode: string }) {
    await x(
      `insert into ${ns}.decisions_humaines (id, company_id, issue_id, revision_id, action, commentaire, user_id, portee, mode) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [d.id, d.companyId, d.issueId, d.revisionId, d.action, d.commentaire, d.userId, json(d.portee), d.mode],
    );
  }

  async function invaliderDecisions(companyId: string, issueId: string, revisionCourante: string) {
    return x(`update ${ns}.decisions_humaines set invalidee = true where company_id = $1 and issue_id = $2 and revision_id <> $3 and invalidee = false`, [companyId, issueId, revisionCourante]);
  }

  async function listerDecisions(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.decisions_humaines where company_id = $1 and issue_id = $2 order by cree_le desc`, [companyId, issueId])).map((r) => ({
      id: String(r.id),
      companyId,
      issueId,
      revisionId: String(r.revision_id),
      action: r.action as "approuver" | "demander_correction" | "rejeter",
      commentaire: String(r.commentaire),
      userId: String(r.user_id),
      portee: (r.portee ?? null) as never,
      invalidee: Boolean(r.invalidee),
      mode: r.mode as "demonstration" | "reel",
      creeLe: iso(r.cree_le),
    }));
  }

  /**
   * Décisions et diffusions de l'entreprise, avec la campagne de chaque tâche (via sa porte),
   * pour calculer les montants engagés (`regles-plafonds.ts`). Les volumes sont petits.
   */
  async function donneesEngagement(companyId: string) {
    const [decisions, diffusions] = await Promise.all([
      q(`select d.id, d.issue_id, d.revision_id, d.action, d.portee, d.invalidee, d.cree_le, p.campagne_id from ${ns}.decisions_humaines d left join ${ns}.portes p on p.issue_id = d.issue_id where d.company_id = $1`, [companyId]),
      q(`select f.id, f.issue_id, f.revision_id, f.decision_id, f.action, f.etat, f.montant_cents, p.campagne_id from ${ns}.diffusions f left join ${ns}.portes p on p.issue_id = f.issue_id where f.company_id = $1`, [companyId]),
    ]);
    return {
      decisions: decisions.map((r) => ({
        id: String(r.id),
        issueId: String(r.issue_id),
        revisionId: String(r.revision_id),
        campagneId: (r.campagne_id as string | null) ?? null,
        action: r.action as "approuver" | "demander_correction" | "rejeter",
        invalidee: Boolean(r.invalidee),
        creeLe: iso(r.cree_le),
        portee: (typeof r.portee === "string" ? JSON.parse(r.portee) : r.portee ?? null) as { action: string; montantMaxCents: number | null } | null,
      })),
      diffusions: diffusions.map((r) => ({
        id: String(r.id),
        issueId: String(r.issue_id),
        revisionId: (r.revision_id as string | null) ?? null,
        campagneId: (r.campagne_id as string | null) ?? null,
        decisionId: (r.decision_id as string | null) ?? null,
        action: String(r.action),
        etat: String(r.etat),
        montantCents: r.montant_cents == null ? null : Number(r.montant_cents),
      })),
    };
  }

  /* ---------------- relances de correction ---------------- */
  async function insererRelance(r: {
    id: string; companyId: string; issueId: string; userId: string; commentaire: string; information: unknown; sourceId: string | null; consigne: string | null;
    escalade: unknown; revisionAvant: string | null; revisionCorrigee: string | null; cyclesConsommes: number; maximumAvant: number; maximumApres: number; mode: string;
  }) {
    await x(
      `insert into ${ns}.relances_correction (id, company_id, issue_id, user_id, commentaire, information, source_id, consigne, escalade, revision_avant, revision_corrigee, cycles_consommes, maximum_avant, maximum_apres, mode)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)`,
      [r.id, r.companyId, r.issueId, r.userId, r.commentaire, r.information === null ? null : json(r.information), r.sourceId, r.consigne, r.escalade === null ? null : json(r.escalade),
        r.revisionAvant, r.revisionCorrigee, r.cyclesConsommes, r.maximumAvant, r.maximumApres, r.mode],
    );
  }

  /** Relances d'une tâche, la plus récente en premier. */
  async function listerRelances(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.relances_correction where company_id = $1 and issue_id = $2 order by cree_le desc`, [companyId, issueId])).map((r) => {
      const information = (r.information ?? null) as { question: string | null; reponse: string } | null;
      const escalade = (r.escalade ?? null) as { agentId: string; avant: { modele: string; effort: string }; apres: { modele: string; effort: string } } | null;
      const revisionCorrigee = (r.revision_corrigee as string | null) ?? null;
      const consigne = (r.consigne as string | null) ?? null;
      const leviers: Array<"information" | "consigne" | "escalade" | "version_corrigee"> = [];
      if (information) leviers.push("information");
      if (consigne) leviers.push("consigne");
      if (escalade) leviers.push("escalade");
      if (revisionCorrigee) leviers.push("version_corrigee");
      return {
        id: String(r.id),
        companyId,
        issueId,
        userId: String(r.user_id),
        commentaire: String(r.commentaire),
        leviers,
        information: information ? { question: information.question ?? null, reponse: information.reponse, sourceId: String(r.source_id) } : null,
        consigne,
        escalade,
        revisionAvant: (r.revision_avant as string | null) ?? null,
        revisionCorrigee,
        cyclesConsommes: Number(r.cycles_consommes),
        maximumAvant: Number(r.maximum_avant),
        maximumApres: Number(r.maximum_apres),
        mode: r.mode as "demonstration" | "reel",
        creeLe: iso(r.cree_le),
      };
    });
  }

  async function insererDiffusion(d: {
    id: string; companyId: string; issueId: string; revisionId: string; decisionId: string | null; action: string; canal: string; compte: string | null; audience: string | null;
    montantCents: number | null; etat: string; cleIdempotence: string; motifRefus: string | null; mode: string; par: string;
    /** v1.5 : appel d'outil visé (mode réel) ; la preuve n'est jamais stockée. */
    service?: string | null; outil?: string | null; empreinteArguments?: string | null;
    /** v1.6 (S-4) : charge de la première preuve signée (figée) ; le jeton n'est jamais stocké. */
    preuveCharge?: unknown;
    /** M1 (revue du 25/10) : travaux de la fabrique (UUID normalisés, triés) dont la provenance a été contrôlée ; rejoués au rejeu. */
    travauxFabrique?: readonly string[];
  }) {
    const { rowCount } = await x(
      `insert into ${ns}.diffusions (id, company_id, issue_id, revision_id, decision_id, action, canal, compte, audience, montant_cents, etat, cle_idempotence, motif_refus, mode, demandee_par, service, outil, empreinte_arguments, preuve_charge, travaux_fabrique)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb) on conflict (company_id, cle_idempotence) do nothing`,
      [d.id, d.companyId, d.issueId, d.revisionId, d.decisionId, d.action, d.canal, d.compte, d.audience, d.montantCents, d.etat, d.cleIdempotence, d.motifRefus, d.mode, d.par,
        d.service ?? null, d.outil ?? null, d.empreinteArguments ?? null, d.preuveCharge === undefined || d.preuveCharge === null ? null : json(d.preuveCharge), json([...new Set(d.travauxFabrique ?? [])].sort())],
    );
    return rowCount === 1;
  }

  /** v1.6 (S-4) : fige la charge d'une diffusion qui n'en a pas encore (diffusion antérieure à la v1.6). */
  async function figerPreuve(companyId: string, id: string, charge: unknown) {
    const { rowCount } = await x(`update ${ns}.diffusions set preuve_charge = $3::jsonb where company_id = $1 and id = $2 and preuve_charge is null`, [companyId, id, json(charge)]);
    return rowCount === 1;
  }

  /**
   * v1.6 (S-7) : révoque les preuves remises de diffusions réelles encore « préparées » d'une tâche. Avec
   * `diffusionId`, une seule ; avec `saufDecision`, toutes sauf celles de cette décision. Rend les identifiants.
   */
  async function revoquerPreuves(companyId: string, issueId: string, o: { diffusionId?: string; saufDecision?: string | null }, motif: string) {
    const lignes = await q(
      `select id from ${ns}.diffusions where company_id = $1 and issue_id = $2 and mode = 'reel' and etat = 'preparee' and preuve_charge is not null and revoquee_le is null
         and ($3::uuid is null or id = $3::uuid) and ($4::uuid is null or decision_id is distinct from $4::uuid)`,
      [companyId, issueId, o.diffusionId ?? null, o.saufDecision ?? null],
    );
    const ids: string[] = [];
    for (const r of lignes) {
      const { rowCount } = await x(`update ${ns}.diffusions set revoquee_le = now(), revocation_motif = $3 where company_id = $1 and id = $2 and revoquee_le is null`, [companyId, String(r.id), motif]);
      if (rowCount === 1) ids.push(String(r.id));
    }
    return ids;
  }

  /** v1.6 (S-7) : preuves révoquées de l'entreprise (charges), pour la liste signée remise à la passerelle. */
  async function listerRevocations(companyId: string) {
    const lignes = await q(`select id, preuve_charge from ${ns}.diffusions where company_id = $1 and revoquee_le is not null and preuve_charge is not null order by revoquee_le asc`, [companyId]);
    return lignes.map((r) => ({ id: String(r.id), charge: (typeof r.preuve_charge === "string" ? JSON.parse(r.preuve_charge) : r.preuve_charge) as Record<string, unknown> }));
  }

  /* ---------------- appels proposés (v1.6, S-1) ---------------- */
  async function insererAppel(a: { id: string; companyId: string; issueId: string; revisionId: string; service: string; outil: string; action: string; compte: string; arguments: unknown; empreinte: string; empreinteArguments: string; par: string }) {
    const { rowCount } = await x(
      `insert into ${ns}.appels_proposes (id, company_id, issue_id, revision_id, service, outil, action, compte, arguments, empreinte, empreinte_arguments, propose_par)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12) on conflict (company_id, issue_id, revision_id, empreinte) do nothing`,
      [a.id, a.companyId, a.issueId, a.revisionId, a.service, a.outil, a.action, a.compte, json(a.arguments), a.empreinte, a.empreinteArguments, a.par],
    );
    return rowCount === 1;
  }

  function appelDepuisLigne(r: Ligne) {
    return {
      id: String(r.id), issueId: String(r.issue_id), revisionId: String(r.revision_id), service: String(r.service), outil: String(r.outil),
      action: String(r.action) as "publier" | "envoyer" | "modifier_crm", compte: String(r.compte),
      arguments: (typeof r.arguments === "string" ? JSON.parse(r.arguments) : r.arguments) as Record<string, unknown>,
      empreinte: String(r.empreinte), empreinteArguments: String(r.empreinte_arguments), proposePar: String(r.propose_par), creeLe: iso(r.cree_le),
    };
  }

  async function listerAppels(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.appels_proposes where company_id = $1 and issue_id = $2 order by cree_le desc`, [companyId, issueId])).map(appelDepuisLigne);
  }

  async function lireAppel(companyId: string, issueId: string, id: string) {
    const [r] = await q(`select * from ${ns}.appels_proposes where company_id = $1 and issue_id = $2 and id = $3`, [companyId, issueId, id]);
    return r ? appelDepuisLigne(r) : null;
  }

  async function lireAppelParEmpreinte(companyId: string, issueId: string, revisionId: string, empreinte: string) {
    const [r] = await q(`select * from ${ns}.appels_proposes where company_id = $1 and issue_id = $2 and revision_id = $3 and empreinte = $4`, [companyId, issueId, revisionId, empreinte]);
    return r ? appelDepuisLigne(r) : null;
  }

  /**
   * Issue rapportée d'une diffusion réelle : transition à sens unique, seulement depuis les états
   * permis (`UPDATE … WHERE etat IN …` : deux rapports simultanés ne se contredisent pas).
   */
  async function rapporterIssueDiffusion(companyId: string, issueId: string, id: string, depuis: readonly string[], etat: string, motif: string | null) {
    const { rowCount } = await x(
      `update ${ns}.diffusions set etat = $4, issue_motif = $5, issue_rapportee_le = now() where company_id = $1 and issue_id = $2 and id = $3 and etat in (select jsonb_array_elements_text($6::jsonb))`,
      [companyId, issueId, id, etat, motif, json(depuis)],
    );
    return rowCount;
  }

  function diffusionDepuisLigne(r: Ligne) {
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      issueId: String(r.issue_id),
      revisionId: String(r.revision_id),
      decisionId: (r.decision_id as string | null) ?? null,
      action: r.action as never,
      canal: String(r.canal),
      compte: (r.compte as string | null) ?? null,
      montantCents: r.montant_cents == null ? null : Number(r.montant_cents),
      etat: r.etat as "refusee" | "simulee" | "preparee" | "confirmee" | "ambigue_a_reconcilier",
      cleIdempotence: String(r.cle_idempotence),
      // v1.5 : le motif rapporté par la passerelle (issue d'une diffusion réelle) prime sur le motif d'origine.
      motifRefus: (r.issue_motif as string | null) ?? (r.motif_refus as string | null) ?? null,
      mode: r.mode as "demonstration" | "reel",
      creeLe: iso(r.cree_le),
      service: (r.service as string | null) ?? null,
      outil: (r.outil as string | null) ?? null,
      preuveExpire: chargeDe(r.preuve_charge)?.expire ?? null,
      revocation: r.revoquee_le ? { le: iso(r.revoquee_le), motif: String(r.revocation_motif ?? "") } : null,
    };
  }

  function chargeDe(v: unknown): { expire: number } & Record<string, unknown> | null {
    const c = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
    return c && typeof c === "object" && typeof (c as { expire?: unknown }).expire === "number" ? (c as { expire: number } & Record<string, unknown>) : null;
  }

  /** Données internes d'une diffusion (jamais renvoyées telles quelles) : audience, empreinte des arguments, charge figée, révocation. */
  async function lireDiffusionInterne(companyId: string, id: string) {
    const [r] = await q(`select id, issue_id, audience, empreinte_arguments, service, outil, preuve_charge, travaux_fabrique, revoquee_le, revocation_motif from ${ns}.diffusions where company_id = $1 and id = $2`, [companyId, id]);
    return r
      ? {
          id: String(r.id), issueId: String(r.issue_id), audience: (r.audience as string | null) ?? null, empreinteArguments: (r.empreinte_arguments as string | null) ?? null,
          service: (r.service as string | null) ?? null, outil: (r.outil as string | null) ?? null, preuveCharge: chargeDe(r.preuve_charge),
          // Anciennes diffusions (colonne absente ou nulle) : liste vide.
          travauxFabrique: Array.isArray(r.travaux_fabrique) ? (r.travaux_fabrique as unknown[]).filter((t): t is string => typeof t === "string") : [],
          revocation: r.revoquee_le ? { le: iso(r.revoquee_le), motif: String(r.revocation_motif ?? "") } : null,
        }
      : null;
  }

  async function lireDiffusionParCle(companyId: string, cle: string) {
    const [r] = await q(`select * from ${ns}.diffusions where company_id = $1 and cle_idempotence = $2`, [companyId, cle]);
    return r ? diffusionDepuisLigne(r) : null;
  }

  /**
   * Diffusions confirmées dont le bilan J+30 n'a ni été créé ni écarté faute d'agent Mesure (journal), avec leur date de confirmation :
   * le rattrapage du veilleur quand la création a échoué à la confirmation. Les plus anciennes d'abord, 50 au plus.
   */
  async function diffusionsConfirmeesSansBilan(companyId: string) {
    const rangs = await q(
      `select f.id, f.issue_id, f.action, f.canal, p.campagne_id,
              (select min(j.cree_le) from ${ns}.journal j where j.company_id = f.company_id and j.type = 'diffusion.confirmee' and j.entite_id = f.id::text) as confirmee_le
         from ${ns}.diffusions f join ${ns}.portes p on p.issue_id = f.issue_id
        where f.company_id = $1 and f.etat = 'confirmee'
          and not exists (select 1 from ${ns}.journal j where j.company_id = f.company_id and j.entite_id = f.id::text and j.type in ('diffusion.bilan_cree', 'diffusion.bilan_sans_mesure'))
          and (select min(j.cree_le) from ${ns}.journal j where j.company_id = f.company_id and j.type = 'diffusion.confirmee' and j.entite_id = f.id::text) >= $2::timestamptz
        order by confirmee_le limit 50`,
      [companyId, DEBUT_RATTRAPAGE_J30],
    );
    return rangs
      .filter((r) => r.confirmee_le)
      .map((r) => ({ id: String(r.id), issueId: String(r.issue_id), action: String(r.action), canal: String(r.canal), campagneId: String(r.campagne_id), confirmeeLe: iso(r.confirmee_le) }));
  }

  async function listerDiffusions(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.diffusions where company_id = $1 and issue_id = $2 order by cree_le desc`, [companyId, issueId])).map(diffusionDepuisLigne);
  }

  /* ---------------- marque, planifications, mesures ---------------- */
  async function insererMarque(m: { companyId: string; identite: string; ton: string; offres: unknown; zones: unknown; etablissements: unknown; affirmations: unknown; manquantes: unknown; entites?: unknown; segments?: unknown; ciblesProspection?: unknown; modulesConformite?: unknown; par: string }) {
    const [d] = await q<{ v: number | null }>(`select max(version) as v from ${ns}.marques where company_id = $1`, [m.companyId]);
    const version = Number(d?.v ?? 0) + 1;
    const id = randomUUID();
    await x(
      `insert into ${ns}.marques (id, company_id, version, identite, ton, offres, zones, etablissements, affirmations_autorisees, informations_manquantes, entites, segments, cibles_prospection, modules_conformite, cree_par) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15)`,
      [id, m.companyId, version, m.identite, m.ton, json(m.offres), json(m.zones), json(m.etablissements), json(m.affirmations), json(m.manquantes), json(m.entites ?? []), json(m.segments ?? []), json(m.ciblesProspection ?? []), json(m.modulesConformite ?? []), m.par],
    );
    return { id, version };
  }

  async function marques(companyId: string) {
    return (await q(`select * from ${ns}.marques where company_id = $1 order by version desc limit 50`, [companyId])).map((r) => ({
      id: String(r.id),
      companyId,
      version: Number(r.version),
      identite: String(r.identite),
      ton: String(r.ton),
      offres: tableau(r.offres) as never[],
      zones: tableau<string>(r.zones),
      etablissements: tableau(r.etablissements) as never[],
      affirmationsAutorisees: tableau(r.affirmations_autorisees) as never[],
      informationsManquantes: tableau<string>(r.informations_manquantes),
      entites: tableau(r.entites) as never[],
      segments: tableau(r.segments) as never[],
      ciblesProspection: tableau(r.cibles_prospection) as never[],
      modulesConformite: tableau(r.modules_conformite) as never[],
      creeLe: iso(r.cree_le),
    }));
  }

  async function planifier(p: { issueId: string; companyId: string; canal: string; dateProposee: string | null }) {
    await x(
      `insert into ${ns}.planifications (issue_id, company_id, canal, date_proposee) values ($1, $2, $3, $4::timestamptz) on conflict (issue_id) do update set canal = excluded.canal, date_proposee = excluded.date_proposee, modifie_le = now()`,
      [p.issueId, p.companyId, p.canal, p.dateProposee],
    );
  }

  async function listerPlanifications(companyId: string) {
    return q(`select pl.issue_id, pl.canal, pl.date_proposee, i.title, i.status, i.project_id from ${ns}.planifications pl join public.issues i on i.id = pl.issue_id where pl.company_id = $1 order by pl.date_proposee nulls last`, [companyId]);
  }

  async function listerMesures(companyId: string, campagneId?: string) {
    const rangs = campagneId
      ? await q(`select * from ${ns}.mesures where company_id = $1 and campagne_id = $2 order by periode_debut`, [companyId, campagneId])
      : await q(`select * from ${ns}.mesures where company_id = $1 order by periode_debut limit 500`, [companyId]);
    return rangs.map((r) => ({
      id: String(r.id),
      campagneId: (r.campagne_id as string | null) ?? null,
      indicateur: String(r.indicateur),
      valeur: Number(r.valeur),
      unite: String(r.unite),
      periodeDebut: iso(r.periode_debut),
      periodeFin: iso(r.periode_fin),
      provenance: String(r.provenance),
      importeLe: iso(r.importe_le),
    }));
  }

  /* ---------------- lectures natives autorisées ---------------- */
  async function tachesDeProjet(companyId: string, projectId: string) {
    return q(
      `select i.id, i.identifier, i.title, i.status, i.assignee_agent_id, i.assignee_user_id, i.execution_state, i.execution_run_id, i.updated_at from public.issues i where i.company_id = $1 and i.project_id = $2 order by i.created_at`,
      [companyId, projectId],
    );
  }

  async function bloqueursNonResolus(companyId: string, issueIds: string[]) {
    if (issueIds.length === 0) return [] as Array<{ issue_id: string; bloqueur: string }>;
    return q<{ issue_id: string; bloqueur: string }>(
      `select r.related_issue_id as issue_id, r.issue_id as bloqueur from public.issue_relations r join public.issues b on b.id = r.issue_id
       where r.company_id = $1 and r.type = 'blocks' and b.status not in ('done', 'cancelled') and r.related_issue_id in (select (jsonb_array_elements_text($2::jsonb))::uuid)`,
      [companyId, json(issueIds)],
    );
  }

  /** Tâches qui bloquent `issueId` (relations `blocks`), même résolues ; la relation et les deux tâches doivent appartenir à l'entreprise. */
  async function tachesBloquantes(companyId: string, issueId: string): Promise<string[]> {
    const rangs = await q<{ bloqueur: string }>(
      `select r.issue_id as bloqueur from public.issue_relations r join public.issues b on b.id = r.issue_id and b.company_id = r.company_id join public.issues t on t.id = r.related_issue_id and t.company_id = r.company_id
       where r.company_id = $1 and r.type = 'blocks' and r.related_issue_id = $2 order by r.created_at asc, r.issue_id asc limit 20`,
      [companyId, issueId],
    );
    return rangs.map((r) => String(r.bloqueur));
  }

  async function tachesSoeurs(companyId: string, parentId: string, sauf: string): Promise<string[]> {
    const rangs = await q<{ id: string }>(
      `select id from public.issues where company_id = $1 and parent_id = $2 and id <> $3 and status <> 'cancelled' order by created_at asc, id asc limit 20`,
      [companyId, parentId, sauf],
    );
    return rangs.map((r) => String(r.id));
  }

  async function runsDeTaches(companyId: string) {
    return q(
      `select id, agent_id, status, context_snapshot->>'issueId' as issue_id, created_at from public.heartbeat_runs where company_id = $1 and created_at > now() - interval '7 days' order by created_at desc limit 500`,
      [companyId],
    );
  }

  /** Tâche d'origine d'un passage d'agent (contexte du run), ou null. */
  async function tacheDuRun(companyId: string, runId: string): Promise<string | null> {
    const [r] = await q<{ issue_id: string | null }>(
      `select context_snapshot->>'issueId' as issue_id from public.heartbeat_runs where id = $1 and company_id = $2`,
      [runId, companyId],
    );
    return r?.issue_id ? String(r.issue_id) : null;
  }

  async function coutsEntreprise(companyId: string) {
    const [r] = await q<{ total: number | string | null; n: number | string }>(`select coalesce(sum(cost_cents), 0) as total, count(*) as n from public.cost_events where company_id = $1`, [companyId]);
    return { totalCents: Number(r?.total ?? 0), evenements: Number(r?.n ?? 0) };
  }

  /** Coûts du mois civil UTC en cours : la fenêtre des budgets natifs (`calendar_month_utc`). */
  async function coutsEntrepriseMois(companyId: string) {
    const maintenant = new Date();
    const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString();
    const [r] = await q<{ total: number | string | null }>(`select coalesce(sum(cost_cents), 0) as total from public.cost_events where company_id = $1 and occurred_at >= $2`, [companyId, debut]);
    return Number(r?.total ?? 0);
  }

  /** Inventaire des compétences consigné par le moteur patché dans le dernier run de chaque agent. */
  async function competencesDernierRun(companyId: string) {
    const rangs = await q<{ agent_id: string; inventaire: unknown; cree: unknown }>(
      `select distinct on (agent_id) agent_id, context_snapshot->'atelierCompetences' as inventaire, created_at as cree from public.heartbeat_runs
       where company_id = $1 and context_snapshot->'atelierCompetences' is not null order by agent_id, created_at desc`,
      [companyId],
    );
    const carte = new Map<string, Array<{ cle: string; sha256: string | null; versionCourante: string | null }>>();
    for (const r of rangs) {
      const inv = (typeof r.inventaire === "string" ? JSON.parse(r.inventaire) : r.inventaire) as { transmises?: Array<{ cle: string; sha256: string | null; versionCourante: string | null }> } | null;
      carte.set(String(r.agent_id), inv?.transmises ?? []);
    }
    return carte;
  }

  /** M6 : une décision ou une diffusion RÉELLE existe-t-elle dans l'entreprise ? */
  async function traceReelle(companyId: string) {
    const [r] = await q<{ d: number | string; f: number | string }>(
      `select (select count(*) from ${ns}.decisions_humaines where company_id = $1 and mode = 'reel') as d, (select count(*) from ${ns}.diffusions where company_id = $1 and mode = 'reel') as f`,
      [companyId],
    );
    return { decisions: Number(r?.d ?? 0), diffusions: Number(r?.f ?? 0) };
  }

  /* ---------------- prospection (lot P9a, migration 007) ---------------- */
  // Toutes les requêtes filtrent `company_id`. Les listes passent en JSON (`$n::jsonb`), comme ailleurs
  // dans ce fichier. Aucune valeur en clair n'arrive ici : coordonnées chiffrées (chv1), empreintes HMAC.

  function ligneProspect(r: Ligne) {
    return {
      id: String(r.id),
      companyId: String(r.company_id),
      campagneId: (r.campagne_id as string | null) ?? null,
      cible: r.cible as "entreprise" | "particulier" | "partenaire",
      identifiant: { type: r.identifiant_type as "numero_bce" | "identifiant_reglementaire" | "empreinte", valeur: String(r.identifiant_valeur) },
      numeroBce: (r.numero_bce as string | null) ?? null,
      referentiel: objet(r.referentiel),
      forme: r.forme as "personne_morale" | "personne_physique" | "inconnue",
      denomination: (r.denomination as string | null) ?? null,
      nomChiffre: (r.nom_chiffre as string | null) ?? null,
      nace: tableau<string>(r.nace),
      zone: objet(r.zone),
      coordonnees: tableau(r.coordonnees),
      sources: tableau(r.sources),
      mode: r.mode as "demonstration" | "reel",
      statut: r.statut as "nouveau" | "exclu" | "qualifie" | "exporte" | "refuse",
      motifsExclusion: tableau(r.motifs_exclusion),
      particulier: r.particulier == null ? null : objet(r.particulier),
      creeLe: iso(r.cree_le),
      modifieLe: iso(r.modifie_le),
      /** Chiffrée avec l'ancienne clé devinable (migration 016) : illisible, jamais servie comme donnée valide. */
      cleAReimporter: r.cle_a_reimporter === true,
    };
  }
  type LigneProspect = ReturnType<typeof ligneProspect>;

  async function prospectsParIdentifiants(companyId: string, identifiants: ReadonlyArray<{ type: string; valeur: string }>): Promise<LigneProspect[]> {
    if (identifiants.length === 0) return [];
    const cles = identifiants.map((i) => `${i.type}:${i.valeur}`);
    return (await q(`select * from ${ns}.prospects where company_id = $1 and (identifiant_type || ':' || identifiant_valeur) in (select jsonb_array_elements_text($2::jsonb))`, [companyId, json(cles)])).map(ligneProspect);
  }

  /**
   * Un prospect à la corbeille n'est pas servi (`corbeille_le` renseignée) : seules la corbeille elle-même et
   * les règles qui doivent encore l'atteindre (opposition d'un client) passent `{ corbeille: true }`.
   */
  async function lireProspect(companyId: string, id: string, options: { corbeille?: boolean } = {}): Promise<LigneProspect | null> {
    // Une fiche à réimporter n'est jamais servie (clé devinable) ; elle reste atteignable par `prospectsParIdentifiants` pour être remplacée.
    const filtre = `${options.corbeille === true ? "" : " and corbeille_le is null"} and cle_a_reimporter = false`;
    const [r] = await q(`select * from ${ns}.prospects where company_id = $1 and id = $2${filtre}`, [companyId, id]);
    return r ? ligneProspect(r) : null;
  }

  /** Empreintes déjà portées par des prospects de l'entreprise, parmi les valeurs données. */
  async function empreintesProspectsEnBase(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return [];
    // Les fiches à réimporter portent des empreintes calculées avec l'ancienne clé : exclues du rapprochement de doublons.
    return (await q(
      `select e.prospect_id, e.type, e.empreinte from ${ns}.prospects_empreintes e join ${ns}.prospects p on p.id = e.prospect_id and p.company_id = e.company_id
       where e.company_id = $1 and not p.cle_a_reimporter and e.empreinte in (select jsonb_array_elements_text($2::jsonb))`,
      [companyId, json(valeurs)],
    )).map((r) => ({
      prospectId: String(r.prospect_id), type: String(r.type), valeur: String(r.empreinte),
    }));
  }

  async function oppositionsPour(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return [];
    // Une opposition à réimporter n'est pas lisible avec la clé du coffre : exclue ici, et tout export de contact est refusé
    // tant qu'il en reste (`compterAReimporter`), pour ne jamais rendre contactable une personne qui s'est opposée.
    return (await q(`select type, empreinte, canal from ${ns}.oppositions where company_id = $1 and not cle_a_reimporter and empreinte in (select jsonb_array_elements_text($2::jsonb))`, [companyId, json(valeurs)])).map((r) => ({
      type: String(r.type), valeur: String(r.empreinte), canal: String(r.canal),
    }));
  }

  /** Lignes marquées « à réimporter » (migration 016) de l'entreprise, par table : jamais déchiffrées ni servies. */
  async function compterAReimporter(companyId: string) {
    const [r] = await q(
      `select (select count(*) from ${ns}.prospects where company_id = $1 and cle_a_reimporter) as prospects,
              (select count(*) from ${ns}.clients where company_id = $1 and cle_a_reimporter) as clients,
              (select count(*) from ${ns}.bases_clients_imports where company_id = $1 and cle_a_reimporter) as imports,
              (select count(*) from ${ns}.oppositions where company_id = $1 and cle_a_reimporter) as oppositions`,
      [companyId],
    );
    return { prospects: Number(r?.prospects ?? 0), clients: Number(r?.clients ?? 0), imports: Number(r?.imports ?? 0), oppositions: Number(r?.oppositions ?? 0) };
  }

  /** Empreintes des clients ACTIFS de la base de clients, parmi les valeurs données. */
  async function clientsActuelsPour(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return [];
    return (await q(
      `select e.type, e.empreinte from ${ns}.clients_empreintes e join ${ns}.clients c on c.id = e.client_id and c.company_id = e.company_id
       where e.company_id = $1 and c.statut = 'actif' and not c.cle_a_reimporter and e.empreinte in (select jsonb_array_elements_text($2::jsonb))`,
      [companyId, json(valeurs)],
    )).map((r) => ({ type: String(r.type), valeur: String(r.empreinte) }));
  }

  async function clientExiste(companyId: string, clientId: string) {
    return (await q(`select id from ${ns}.clients where company_id = $1 and id = $2 and not cle_a_reimporter`, [companyId, clientId])).length > 0;
  }

  /** Client de la base de clients désigné par une empreinte (ex. `identifiant_client`) ; null si absent. */
  async function clientParEmpreinte(companyId: string, type: string, valeur: string): Promise<string | null> {
    const [r] = await q(
      `select e.client_id from ${ns}.clients_empreintes e join ${ns}.clients c on c.id = e.client_id and c.company_id = e.company_id
       where e.company_id = $1 and not c.cle_a_reimporter and e.type = $2 and e.empreinte = $3 limit 1`,
      [companyId, type, valeur],
    );
    return r ? String(r.client_id) : null;
  }

  /** Dernière version des poids du score choisis par le client ; null si aucune. */
  async function poidsScoreCourant(companyId: string): Promise<{ version: number; poids: Record<string, number> } | null> {
    const [r] = await q(`select version, poids from ${ns}.poids_score where company_id = $1 order by version desc limit 1`, [companyId]);
    return r ? { version: Number(r.version), poids: objet(r.poids) as Record<string, number> } : null;
  }

  /**
   * Renvoi au référentiel enregistré sur la campagne (ou null), dernière version de la marque (ou null) et
   * zones de ses établissements (codes postaux, communes), pour le critère B2C « zone desservie ».
   */
  async function referentielProspection(companyId: string, campagneId: string | null) {
    const [c] = campagneId ? await q(`select referentiel from ${ns}.campagnes where company_id = $1 and id = $2`, [companyId, campagneId]) : [];
    const [m] = await q(`select version, etablissements from ${ns}.marques where company_id = $1 order by version desc limit 1`, [companyId]);
    const etablissements = tableau<Record<string, unknown>>(m?.etablissements).map((e) => ({
      codesPostaux: Array.isArray(e.codesPostaux) ? e.codesPostaux.filter((x): x is string => typeof x === "string") : [],
      communes: Array.isArray(e.communes) ? e.communes.filter((x): x is string => typeof x === "string") : [],
    }));
    return { renvoi: c?.referentiel == null ? null : objet(c.referentiel), versionMarque: m?.version == null ? null : Number(m.version), etablissements };
  }

  /** Prospect validé par le contrat `Prospect` (l'appelant le vérifie avant). Score et bases légales vont dans leurs tables. */
  async function insererProspect(p: Omit<LigneProspect, "creeLe" | "modifieLe" | "cleAReimporter">) {
    await x(
      `insert into ${ns}.prospects (id, company_id, campagne_id, cible, identifiant_type, forme, referentiel, identifiant_valeur, numero_bce, denomination, nom_chiffre, nace, zone, coordonnees, sources, mode, statut, motifs_exclusion, particulier, origine_particulier)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17, $18::jsonb, $19::jsonb, $20)`,
      [p.id, p.companyId, p.campagneId, p.cible, p.identifiant.type, p.forme, json(p.referentiel), p.identifiant.valeur, p.numeroBce, p.denomination, p.nomChiffre,
        json(p.nace), json(p.zone), json(p.coordonnees), json(p.sources), p.mode, p.statut, json(p.motifsExclusion),
        p.particulier === null ? null : json(p.particulier), (p.particulier as { origine?: string } | null)?.origine ?? null],
    );
  }

  /** Mise à jour d'un prospect existant après un nouveau dépôt ou une nouvelle saisie (fusion faite par l'appelant). */
  async function majProspect(companyId: string, id: string, p: Pick<LigneProspect, "nace" | "zone" | "coordonnees" | "sources" | "statut" | "motifsExclusion" | "particulier">) {
    const { rowCount } = await x(
      `update ${ns}.prospects set nace = $3::jsonb, zone = $4::jsonb, coordonnees = $5::jsonb, sources = $6::jsonb, statut = $7, motifs_exclusion = $8::jsonb, particulier = $9::jsonb, modifie_le = now()
       where company_id = $1 and id = $2`,
      [companyId, id, json(p.nace), json(p.zone), json(p.coordonnees), json(p.sources), p.statut, json(p.motifsExclusion), p.particulier === null ? null : json(p.particulier)],
    );
    return rowCount;
  }

  /**
   * Nouveau dépôt d'un prospect marqué « à réimporter » : la fiche reçoit le contenu neuf (chiffré avec la clé du coffre),
   * ses anciennes empreintes (ancienne clé) sont retirées et la marque tombe. Bases légales, scores et identifiant restent.
   */
  async function remplacerProspectAReimporter(companyId: string, id: string, p: Pick<LigneProspect, "nomChiffre" | "nace" | "zone" | "coordonnees" | "sources" | "statut" | "motifsExclusion" | "particulier">) {
    const { rowCount } = await x(
      `update ${ns}.prospects set nom_chiffre = $3, nace = $4::jsonb, zone = $5::jsonb, coordonnees = $6::jsonb, sources = $7::jsonb, statut = $8, motifs_exclusion = $9::jsonb, particulier = $10::jsonb,
         cle_a_reimporter = false, modifie_le = now() where company_id = $1 and id = $2 and cle_a_reimporter`,
      [companyId, id, p.nomChiffre, json(p.nace), json(p.zone), json(p.coordonnees), json(p.sources), p.statut, json(p.motifsExclusion), p.particulier === null ? null : json(p.particulier)],
    );
    if (rowCount) await x(`delete from ${ns}.prospects_empreintes where company_id = $1 and prospect_id = $2`, [companyId, id]);
    return rowCount;
  }

  async function exclureProspect(companyId: string, id: string, motifs: unknown[]) {
    const { rowCount } = await x(`update ${ns}.prospects set statut = 'exclu', motifs_exclusion = $3::jsonb, modifie_le = now() where company_id = $1 and id = $2`, [companyId, id, json(motifs)]);
    return rowCount;
  }

  async function ajouterEmpreintesProspect(companyId: string, prospectId: string, empreintes: ReadonlyArray<{ type: string; valeur: string }>) {
    if (empreintes.length === 0) return;
    await x(
      `insert into ${ns}.prospects_empreintes (company_id, prospect_id, type, empreinte) select $1, $2, e->>'type', e->>'valeur' from jsonb_array_elements($3::jsonb) as e on conflict do nothing`,
      [companyId, prospectId, json(empreintes)],
    );
  }

  async function insererScoreProspect(s: { id: string; companyId: string; prospectId: string; valeur: number; criteres: unknown; versionPoids: number; calculeLe: string }) {
    await x(
      `insert into ${ns}.prospects_scores (id, company_id, prospect_id, valeur, criteres, version_poids, nature, calcule_le) values ($1, $2, $3, $4, $5::jsonb, $6, 'estimation', $7::timestamptz)`,
      [s.id, s.companyId, s.prospectId, s.valeur, json(s.criteres), s.versionPoids, s.calculeLe],
    );
  }

  /** Empreintes, dernier score et bases légales des prospects donnés (affichage d'une page). */
  async function detailsProspects(companyId: string, ids: readonly string[]) {
    const empreintes = new Map<string, Array<{ type: string; valeur: string }>>();
    const scores = new Map<string, { valeur: number; criteres: unknown[]; versionPoids: number; calculeLe: string; nature?: "estimation" | "probabilite_mesuree"; etalonnage?: { etalonnageId: string; probabilite: number; borneBasse: number; borneHaute: number; effectif: number; conversions: number; methode: string; date: string } | null }>();
    const bases = new Map<string, Ligne[]>();
    if (ids.length === 0) return { empreintes, scores, bases };
    const liste = json(ids);
    for (const r of await q(`select prospect_id, type, empreinte from ${ns}.prospects_empreintes where company_id = $1 and prospect_id::text in (select jsonb_array_elements_text($2::jsonb)) order by type, empreinte`, [companyId, liste])) {
      const id = String(r.prospect_id);
      (empreintes.get(id) ?? empreintes.set(id, []).get(id)!).push({ type: String(r.type), valeur: String(r.empreinte) });
    }
    // P9b : nature du score et, pour une probabilité mesurée, l'étalonnage appliqué (marge de Wilson).
    for (const r of await q(
      `select s.prospect_id, s.valeur, s.criteres, s.version_poids, s.calcule_le, s.nature, s.etalonnage_id, s.probabilite, s.borne_basse, s.borne_haute,
              e.effectif, e.conversions, e.methode, e.calcule_le as etalonne_le
       from ${ns}.prospects_scores s left join ${ns}.etalonnages e on e.id = s.etalonnage_id and e.company_id = s.company_id
       where s.company_id = $1 and s.prospect_id::text in (select jsonb_array_elements_text($2::jsonb)) order by s.calcule_le asc`,
      [companyId, liste],
    )) {
      const mesure = r.nature === "probabilite_mesuree" && r.etalonnage_id != null && r.effectif != null;
      scores.set(String(r.prospect_id), {
        valeur: Number(r.valeur), criteres: tableau(r.criteres), versionPoids: Number(r.version_poids), calculeLe: iso(r.calcule_le),
        nature: mesure ? ("probabilite_mesuree" as const) : ("estimation" as const),
        etalonnage: mesure
          ? { etalonnageId: String(r.etalonnage_id), probabilite: Number(r.probabilite), borneBasse: Number(r.borne_basse), borneHaute: Number(r.borne_haute), effectif: Number(r.effectif), conversions: Number(r.conversions), methode: String(r.methode), date: iso(r.etalonne_le) }
          : null,
      });
    }
    for (const r of await q(`select * from ${ns}.bases_legales where company_id = $1 and prospect_id::text in (select jsonb_array_elements_text($2::jsonb)) order by canal`, [companyId, liste])) {
      const id = String(r.prospect_id);
      (bases.get(id) ?? bases.set(id, []).get(id)!).push(r);
    }
    return { empreintes, scores, bases };
  }

  /** Page de prospects filtrée (filtres cumulés ; plusieurs valeurs d'un filtre = l'une OU l'autre), triée par score décroissant. */
  async function listerProspects(companyId: string, f: {
    campagneId?: string | undefined; cibles?: string[] | undefined; nace?: string[] | undefined; codesPostaux?: string[] | undefined; communes?: string[] | undefined;
    provinces?: string[] | undefined; regions?: string[] | undefined; statuts?: string[] | undefined; entites?: string[] | undefined; etablissements?: string[] | undefined;
    segments?: string[] | undefined; offres?: string[] | undefined; origines?: string[] | undefined;
    zonesBureau?: string[] | undefined; source?: "reelle" | "demonstration" | undefined; avecClientsActuels?: boolean | undefined; scoreMin?: number | undefined; page: number; parPage: number;
  }) {
    const params: unknown[] = [companyId];
    const p = (v: unknown) => `$${params.push(v)}`;
    const dans = (expr: string, valeurs?: string[]) => (valeurs?.length ? [`${expr} in (select jsonb_array_elements_text(${p(json(valeurs))}::jsonb))`] : []);
    const score = `(select s.valeur from ${ns}.prospects_scores s where s.company_id = p.company_id and s.prospect_id = p.id order by s.calcule_le desc limit 1)`;
    const conditions = [
      "p.company_id = $1",
      "p.corbeille_le is null",
      "p.cle_a_reimporter = false",
      ...(f.campagneId ? [`p.campagne_id = ${p(f.campagneId)}`] : []),
      ...dans("p.cible", f.cibles),
      ...dans("p.statut", f.statuts),
      ...dans("p.origine_particulier", f.origines),
      ...(f.source ? [`p.mode = ${p(f.source === "reelle" ? "reel" : "demonstration")}`] : []),
      // Zone d'un bureau : même code postal OU même commune.
      ...(f.zonesBureau?.length
        ? [`((p.zone->>'codePostal') in (select jsonb_array_elements_text(${p(json(f.zonesBureau.filter((z) => /^\d{4}$/u.test(z))))}::jsonb)) or lower(p.zone->>'commune') in (select jsonb_array_elements_text(${p(json(f.zonesBureau.filter((z) => !/^\d{4}$/u.test(z)).map((z) => z.toLowerCase())))}::jsonb)))`]
        : []),
      // Déjà clients exclus par défaut : motif « client_actuel » ou origine « client_existant » (critère de qualification contraire).
      ...(f.avecClientsActuels ? [] : [`not (p.motifs_exclusion @> ${p(json([{ motif: "client_actuel" }]))}::jsonb or coalesce(p.origine_particulier, '') = 'client_existant')`]),
      ...dans("(p.zone->>'codePostal')", f.codesPostaux),
      ...dans("lower(p.zone->>'commune')", f.communes?.map((c) => c.toLowerCase())),
      ...dans("lower(p.zone->>'province')", f.provinces?.map((c) => c.toLowerCase())),
      ...dans("(p.zone->>'region')", f.regions),
      ...dans("(p.referentiel->>'entite')", f.entites),
      ...dans("(p.referentiel->>'etablissement')", f.etablissements),
      ...(f.segments?.length ? [`exists (select 1 from jsonb_array_elements_text(p.referentiel->'segments') as sg where sg in (select jsonb_array_elements_text(${p(json(f.segments))}::jsonb)))`] : []),
      ...(f.offres?.length ? [`exists (select 1 from jsonb_array_elements_text(p.referentiel->'offres') as o where o in (select jsonb_array_elements_text(${p(json(f.offres))}::jsonb)))`] : []),
      // NACE : préfixe sans point (« 43 » couvre 43.910 et 43910).
      ...(f.nace?.length
        ? [`exists (select 1 from jsonb_array_elements_text(p.nace) as n, jsonb_array_elements_text(${p(json(f.nace.map((c) => `${c.replace(/\./gu, "")}%`)))}::jsonb) as m where replace(n, '.', '') like m)`]
        : []),
      ...(f.scoreMin !== undefined ? [`coalesce(${score}, -1) >= ${p(f.scoreMin)}`] : []),
    ];
    const ou = conditions.join(" and ");
    const [c] = await q(`select count(*) as total from ${ns}.prospects p where ${ou}`, params);
    const total = Number(c?.total ?? 0);
    const limite = p(f.parPage);
    const decalage = p((f.page - 1) * f.parPage);
    const lignes = (await q(`select p.* from ${ns}.prospects p where ${ou} order by ${score} desc nulls last, p.cree_le desc, p.id limit ${limite} offset ${decalage}`, params)).map(ligneProspect);
    // Fiches à réimporter de l'entreprise : exclues de la liste, comptées à part pour que l'interface le dise.
    const [m] = await q(`select count(*) as total from ${ns}.prospects where company_id = $1 and cle_a_reimporter`, [companyId]);
    return { total, lignes, aReimporter: Number(m?.total ?? 0) };
  }

  async function insererOpposition(o: { id: string; companyId: string; type: string; empreinte: string; canal: string; origine: string; par: string; recueillieLe: string | null }) {
    const { rowCount } = await x(
      `insert into ${ns}.oppositions (id, company_id, type, empreinte, canal, origine, enregistree_par, recueillie_le) values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))
       on conflict (company_id, type, empreinte, canal) do nothing`,
      [o.id, o.companyId, o.type, o.empreinte, o.canal, o.origine, o.par, o.recueillieLe],
    );
    return rowCount;
  }

  async function lireOpposition(companyId: string, type: string, empreinte: string, canal: string) {
    const [r] = await q(`select * from ${ns}.oppositions where company_id = $1 and type = $2 and empreinte = $3 and canal = $4`, [companyId, type, empreinte, canal]);
    return r
      ? { id: String(r.id), companyId, type: String(r.type), empreinte: String(r.empreinte), canal: String(r.canal), origine: String(r.origine), recueillieLe: iso(r.recueillie_le), enregistreePar: String(r.enregistree_par) }
      : null;
  }

  /* ---------------- lot P9b : base de clients, étalonnage, exports CRM ---------------- */

  async function insererImportBaseClients(i: {
    id: string; companyId: string; nomFichier: string; format: string; empreinteFichier: string; lignesLues: number; lignesRetenues: number; lignesRejetees: number;
    rejets: unknown; correspondance: unknown; colonnesSensiblesRefusees: unknown; finalite: string; dureeConservationMois: number; purgeLe: string; mode: string; importePar: string; importeLe: string;
  }) {
    await x(
      `insert into ${ns}.bases_clients_imports (id, company_id, nom_fichier, format, empreinte_fichier, lignes_lues, lignes_retenues, lignes_rejetees, rejets, correspondance, colonnes_sensibles_refusees, finalite, duree_conservation_mois, purge_le, mode, importe_par, importe_le)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14::timestamptz, $15, $16, $17::timestamptz)`,
      [i.id, i.companyId, i.nomFichier, i.format, i.empreinteFichier, i.lignesLues, i.lignesRetenues, i.lignesRejetees, json(i.rejets), json(i.correspondance), json(i.colonnesSensiblesRefusees),
        i.finalite, i.dureeConservationMois, i.purgeLe, i.mode, i.importePar, i.importeLe],
    );
  }

  /** Clients validés par le contrat `ClientBase` (l'appelant le vérifie), par lots : une instruction pour les clients, une pour leurs empreintes. */
  async function insererClients(companyId: string, clients: ReadonlyArray<Record<string, unknown>>) {
    for (let i = 0; i < clients.length; i += 500) {
      const lot = json(clients.slice(i, i + 500));
      await x(
        `insert into ${ns}.clients (id, company_id, import_id, type_client, pseudonyme, contrats, etablissement, entites, segments, donnees_chiffrees, entreprise, numero_bce, code_postal, commune, produits_detenus, debut_contrat, statut, consentements, mode, cree_le)
         select (c->>'id')::uuid, $1::uuid, (c->>'importId')::uuid, c->>'typeClient', c->>'pseudonyme', coalesce(c->'contrats', '[]'::jsonb), c->>'etablissement', coalesce(c->'entites', '[]'::jsonb),
                coalesce(c->'segments', '[]'::jsonb), coalesce(c->'donneesChiffrees', '{}'::jsonb), c->>'entreprise', c->>'numeroBce', c->>'codePostal', c->>'commune',
                coalesce(c->'produitsDetenus', '[]'::jsonb), (c->>'debutContrat')::date, c->>'statut', coalesce(c->'consentements', '{}'::jsonb), c->>'mode', (c->>'creeLe')::timestamptz
         from jsonb_array_elements($2::jsonb) as c`,
        [companyId, lot],
      );
      await x(
        `insert into ${ns}.clients_empreintes (company_id, client_id, type, empreinte)
         select $1::uuid, (c->>'id')::uuid, e->>'type', e->>'valeur' from jsonb_array_elements($2::jsonb) as c, jsonb_array_elements(c->'empreintes') as e on conflict do nothing`,
        [companyId, lot],
      );
    }
  }

  /** Dernier import de la base de clients (ou null) et nombre de clients enregistrés. */
  async function etatBaseClients(companyId: string) {
    const [i] = await q(`select * from ${ns}.bases_clients_imports where company_id = $1 and not cle_a_reimporter order by importe_le desc limit 1`, [companyId]);
    const [c] = await q(`select count(*) filter (where not cle_a_reimporter) as total, count(*) filter (where statut = 'actif' and not cle_a_reimporter) as actifs, count(*) filter (where cle_a_reimporter) as a_reimporter from ${ns}.clients where company_id = $1`, [companyId]);
    return {
      dernierImport: i
        ? { id: String(i.id), nomFichier: String(i.nom_fichier), format: String(i.format), importeLe: iso(i.importe_le), importePar: String(i.importe_par), purgeLe: iso(i.purge_le), finalite: String(i.finalite), dureeConservationMois: Number(i.duree_conservation_mois), lignesRetenues: Number(i.lignes_retenues), lignesRejetees: Number(i.lignes_rejetees), mode: String(i.mode) }
        : null,
      clients: Number(c?.total ?? 0),
      actifs: Number(c?.actifs ?? 0),
      /** Clients chiffrés avec l'ancienne clé : exclus des totaux ci-dessus ; un nouvel import les remplace. */
      aReimporter: Number(c?.a_reimporter ?? 0),
    };
  }

  /** Règles de vente croisée enregistrées par le client (table `regles_ventes_croisees`). */
  async function reglesVentesCroisees(companyId: string) {
    return (await q(`select type_client, detenue, proposee, decide_par, decide_le from ${ns}.regles_ventes_croisees where company_id = $1 order by type_client, detenue, proposee`, [companyId])).map((r) => ({
      companyId, typeClient: String(r.type_client) as "particulier" | "entreprise", detenue: String(r.detenue), proposee: String(r.proposee), decidePar: String(r.decide_par), decideLe: iso(r.decide_le),
    }));
  }

  /**
   * Clients de la base (forme `ClientBase`, identifiants directs toujours chiffrés) avec leurs empreintes,
   * pour les ventes croisées ; au plus `limite` clients, les plus anciens d'abord.
   */
  async function clientsPourVentesCroisees(companyId: string, limite = 5000) {
    const lignes = await q(
      `select c.*, c.debut_contrat::text as debut_contrat_texte, coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'valeur', e.empreinte)) from ${ns}.clients_empreintes e where e.client_id = c.id and e.company_id = c.company_id), '[]'::jsonb) as empreintes_client
       from ${ns}.clients c where c.company_id = $1 and not c.cle_a_reimporter order by c.cree_le, c.id limit $2`,
      [companyId, limite],
    );
    return lignes.map((r) => ({
      id: String(r.id), companyId, importId: r.import_id == null ? null : String(r.import_id), typeClient: String(r.type_client) as "particulier" | "entreprise",
      etablissement: r.etablissement == null ? null : String(r.etablissement), entites: tableau<string>(r.entites), segments: tableau<string>(r.segments), pseudonyme: String(r.pseudonyme),
      contrats: tableau(r.contrats) as never[], donneesChiffrees: objet(r.donnees_chiffrees) as Record<string, string>, empreintes: tableau<{ type: string; valeur: string }>(r.empreintes_client) as never[],
      entreprise: r.entreprise == null ? null : String(r.entreprise), numeroBce: r.numero_bce == null ? null : String(r.numero_bce), codePostal: r.code_postal == null ? null : String(r.code_postal),
      commune: r.commune == null ? null : String(r.commune), produitsDetenus: tableau<string>(r.produits_detenus), debutContrat: r.debut_contrat_texte == null ? null : String(r.debut_contrat_texte),
      statut: String(r.statut) as "actif" | "ancien", consentements: objet(r.consentements) as { courriel: boolean | null; sms: boolean | null; telephone: boolean | null },
      mode: String(r.mode) as "demonstration" | "reel", creeLe: iso(r.cree_le),
    }));
  }

  /** Suppression de la base de clients (clients, contrats, empreintes, imports) ; les oppositions restent. */
  async function supprimerBaseClients(companyId: string) {
    const clients = (await x(`delete from ${ns}.clients where company_id = $1`, [companyId])).rowCount;
    const imports = (await x(`delete from ${ns}.bases_clients_imports where company_id = $1`, [companyId])).rowCount;
    return { clients, imports };
  }

  async function insererEtalonnage(e: {
    id: string; companyId: string; segment: unknown; methode: string; parametres: unknown; separation: string; horizonJours: number; effectif: number; conversions: number; brier: number;
    tranches: unknown; statut: string; versionPoids: number; donnees: unknown; mode: string; calculePar: string; calculeLe: string;
  }) {
    await x(
      `insert into ${ns}.etalonnages (id, company_id, segment, methode, parametres, separation, horizon_jours, effectif, conversions, brier, tranches, statut, version_poids, donnees, mode, calcule_par, calcule_le)
       values ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14::jsonb, $15, $16, $17::timestamptz)`,
      [e.id, e.companyId, json(e.segment), e.methode, e.parametres === null ? null : json(e.parametres), e.separation, e.horizonJours, e.effectif, e.conversions, e.brier,
        json(e.tranches), e.statut, e.versionPoids, json(e.donnees), e.mode, e.calculePar, e.calculeLe],
    );
  }

  /** Issues commerciales des prospects d'une cible, avec le dernier score attribué au plus tard le jour de l'issue. */
  async function issuesPourEtalonnage(companyId: string, cible: string, mode: string) {
    return (await q(
      `select ic.issue, ic.date_issue, ic.origine, p.nace,
              (select s.valeur from ${ns}.prospects_scores s where s.company_id = ic.company_id and s.prospect_id = ic.prospect_id and s.calcule_le < ic.date_issue + 1 order by s.calcule_le desc limit 1) as score
       from ${ns}.issues_commerciales ic join ${ns}.prospects p on p.id = ic.prospect_id and p.company_id = ic.company_id
       where ic.company_id = $1 and p.cible = $2 and ic.mode = $3 and p.corbeille_le is null order by ic.date_issue`,
      [companyId, cible, mode],
    )).map((r) => ({ issue: String(r.issue), date: iso(r.date_issue).slice(0, 10), origine: String(r.origine), nace: tableau<string>(r.nace), score: r.score == null ? null : Number(r.score) }));
  }

  /** Prospects non exclus d'une cible avec leur dernier score (application d'un étalonnage). */
  async function scoresCourantsCible(companyId: string, cible: string) {
    return (await q(
      `select p.id, p.nace, s.valeur, s.criteres, s.version_poids from ${ns}.prospects p
       join lateral (select valeur, criteres, version_poids from ${ns}.prospects_scores where company_id = p.company_id and prospect_id = p.id order by calcule_le desc limit 1) s on true
       where p.company_id = $1 and p.cible = $2 and p.statut <> 'exclu' and p.corbeille_le is null`,
      [companyId, cible],
    )).map((r) => ({ prospectId: String(r.id), nace: tableau<string>(r.nace), valeur: Number(r.valeur), criteres: tableau(r.criteres), versionPoids: Number(r.version_poids) }));
  }

  /** Score avec probabilité mesurée (étalonnage appliqué, marge de Wilson). */
  async function insererScoreMesure(s: { id: string; companyId: string; prospectId: string; valeur: number; criteres: unknown; versionPoids: number; etalonnageId: string; probabilite: number; borneBasse: number; borneHaute: number; calculeLe: string }) {
    await x(
      `insert into ${ns}.prospects_scores (id, company_id, prospect_id, valeur, criteres, version_poids, nature, etalonnage_id, probabilite, borne_basse, borne_haute, calcule_le)
       values ($1, $2, $3, $4, $5::jsonb, $6, 'probabilite_mesuree', $7, $8, $9, $10, $11::timestamptz)`,
      [s.id, s.companyId, s.prospectId, s.valeur, json(s.criteres), s.versionPoids, s.etalonnageId, s.probabilite, s.borneBasse, s.borneHaute, s.calculeLe],
    );
  }

  function exportDepuisLigne(r: Ligne) {
    return {
      id: String(r.id), companyId: String(r.company_id), issueId: String(r.issue_id), diffusionId: (r.diffusion_id as string | null) ?? null, entite: String(r.entite),
      referentielVersion: Number(r.referentiel_version), service: String(r.service), canal: String(r.canal), prospectIds: tableau<string>(r.prospect_ids), verifications: tableau(r.verifications),
      etat: String(r.etat), motifRefus: (r.motif_refus as string | null) ?? null, cleIdempotence: String(r.cle_idempotence), mode: String(r.mode), demandePar: String(r.demande_par), creeLe: iso(r.cree_le),
    };
  }

  async function lireExportCrmParCle(companyId: string, cle: string) {
    const [r] = await q(`select * from ${ns}.exports_crm where company_id = $1 and cle_idempotence = $2`, [companyId, cle]);
    return r ? exportDepuisLigne(r) : null;
  }

  /**
   * Un export non refusé (simulé, confirmé, à réconcilier) de ce service et de ce mode contient déjà ce prospect : le moteur ne le réécrit pas.
   * Une diffusion seulement préparée ne compte pas pour la tâche de la porte `issueId` (l'état réel est sur la diffusion liée) : la clé du lot se rejoue jusqu'à l'exécution par l'agent CRM ; pour une autre tâche, elle compte.
   */
  async function prospectDansExportNonRefuse(companyId: string, prospectId: string, service: string, mode: string, issueId: string) {
    const [r] = await q(`select 1 as un from ${ns}.exports_crm e left join ${ns}.diffusions d on d.id = e.diffusion_id where e.company_id = $1 and e.service = $3 and e.mode = $4 and e.etat <> 'refusee' and (coalesce(d.etat, '') <> 'preparee' or e.issue_id <> $5) and e.prospect_ids @> jsonb_build_array($2::text) limit 1`, [companyId, prospectId, service, mode, issueId]);
    return r !== undefined;
  }

  /** L'état réel se lit sur la diffusion liée (`exports_crm.etat` n'est écrit qu'à l'insertion) : simulée ou confirmée ; préparée ou ambiguë, pas encore. */
  async function prospectExportConfirme(companyId: string, prospectId: string, service: string, mode: string) {
    const [r] = await q(`select 1 as un from ${ns}.exports_crm e join ${ns}.diffusions d on d.id = e.diffusion_id where e.company_id = $1 and e.service = $3 and e.mode = $4 and d.etat in ('simulee', 'confirmee') and e.prospect_ids @> jsonb_build_array($2::text) limit 1`, [companyId, prospectId, service, mode]);
    return r !== undefined;
  }

  /** Un export dont la diffusion est ambiguë à réconcilier contient ce prospect : l'effet est incertain, le moteur ne réécrit rien. */
  async function prospectExportAmbigu(companyId: string, prospectId: string, service: string, mode: string) {
    const [r] = await q(`select 1 as un from ${ns}.exports_crm e join ${ns}.diffusions d on d.id = e.diffusion_id where e.company_id = $1 and e.service = $3 and e.mode = $4 and d.etat = 'ambigue_a_reconcilier' and e.prospect_ids @> jsonb_build_array($2::text) limit 1`, [companyId, prospectId, service, mode]);
    return r !== undefined;
  }

  async function insererExportCrm(e: {
    id: string; companyId: string; issueId: string; diffusionId: string | null; entite: string; referentielVersion: number; service: string; canal: string; prospectIds: string[];
    verifications: unknown; etat: string; motifRefus: string | null; cleIdempotence: string; mode: string; demandePar: string; creeLe: string;
  }) {
    await x(
      `insert into ${ns}.exports_crm (id, company_id, issue_id, diffusion_id, entite, referentiel_version, service, canal, prospect_ids, verifications, etat, motif_refus, cle_idempotence, mode, demande_par, cree_le)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16::timestamptz)`,
      [e.id, e.companyId, e.issueId, e.diffusionId, e.entite, e.referentielVersion, e.service, e.canal, json(e.prospectIds), json(e.verifications), e.etat, e.motifRefus, e.cleIdempotence, e.mode, e.demandePar, e.creeLe],
    );
  }

  /* ---------------- moteur de missions (#49) ---------------- */
  const texteOuNul = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const missionDepuisLigne = (r: Ligne): Mission => ({
    id: String(r.id), companyId: String(r.company_id), gabaritCle: String(r.gabarit_cle), gabaritVersion: Number(r.gabarit_version),
    contratId: String(r.contrat_id), contratVersion: Number(r.contrat_version), mandat: String(r.mandat), etat: r.etat as EtatMission,
    etatAvantPause: texteOuNul(r.etat_avant_pause) as EtatMission | null, rangCourant: Number(r.rang_courant), enveloppeCents: Number(r.enveloppe_cents),
    campagneId: texteOuNul(r.campagne_id), issueRacineId: texteOuNul(r.issue_racine_id), cycleBlocage: Number(r.cycle_blocage ?? 0), creeLe: iso(r.cree_le), modifieLe: iso(r.modifie_le),
  });

  const etapeDepuisLigne = (r: Ligne): EtapeMission => ({
    id: String(r.id), companyId: String(r.company_id), missionId: String(r.mission_id), rang: Number(r.rang), role: String(r.role), tentative: Number(r.tentative),
    etat: String(r.etat), entree: r.entree ?? null, sortie: r.sortie ?? null, delaiLe: r.delai_le === null || r.delai_le === undefined ? null : iso(r.delai_le),
    issueId: texteOuNul(r.issue_id), revisionLivrable: texteOuNul(r.revision_livrable), creeLe: iso(r.cree_le), modifieLe: iso(r.modifie_le),
  });

  async function creerMission(m: {
    companyId: string; gabaritCle: string; gabaritVersion: number; contratId: string; contratVersion: number; mandat: string;
    enveloppeCents?: number; campagneId?: string | null; issueRacineId?: string | null; etat?: EtatMission;
  }) {
    const id = randomUUID();
    await x(
      `insert into ${ns}.missions (id, company_id, gabarit_cle, gabarit_version, contrat_id, contrat_version, mandat, etat, enveloppe_cents, campagne_id, issue_racine_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, m.companyId, m.gabaritCle, m.gabaritVersion, m.contratId, m.contratVersion, m.mandat, m.etat ?? "prete", m.enveloppeCents ?? 0, m.campagneId ?? null, m.issueRacineId ?? null],
    );
    return id;
  }

  async function lireMission(companyId: string, id: string) {
    const [r] = await q(`select * from ${ns}.missions where company_id = $1 and id = $2`, [companyId, id]);
    return r ? missionDepuisLigne(r) : null;
  }

  /** Missions non terminales d'une entreprise, les plus anciennes d'abord. */
  async function missionsActives(companyId: string) {
    return (await q(`select * from ${ns}.missions where company_id = $1 and etat not in ('cloturee', 'annulee', 'echec') order by cree_le, id limit 500`, [companyId])).map(missionDepuisLigne);
  }

  /** Compare-and-set de l'état : vrai si la mission était bien dans `ancien` et a changé. */
  /** Rattache la campagne d'une mission encore en attente d'information ; faux si elle est ailleurs, en a déjà une autre ou n'existe pas. */
  async function rattacherCampagneMission(companyId: string, id: string, campagneId: string) {
    const { rowCount } = await x(`update ${ns}.missions set campagne_id = $3, modifie_le = now() where company_id = $1 and id = $2 and etat = 'attente_information' and (campagne_id is null or campagne_id = $3)`, [companyId, id, campagneId]);
    return rowCount === 1;
  }

  async function changerEtatMission(companyId: string, id: string, ancien: EtatMission, nouveau: EtatMission) {
    // Sortie de blocage par reprise ou levée : le compteur de cycle monte dans le même UPDATE (atomique), il entre dans les clés du moteur ; pause, annulation et échec ne reprennent rien.
    const cycle = ancien === "blocage" && !["pause", "annulee", "echec"].includes(nouveau) ? "cycle_blocage = cycle_blocage + 1, " : "";
    const { rowCount } = await x(`update ${ns}.missions set etat = $4, ${cycle}modifie_le = now() where company_id = $1 and id = $2 and etat = $3`, [companyId, id, ancien, nouveau]);
    return rowCount === 1;
  }

  async function creerEtape(e: { companyId: string; missionId: string; rang: number; role: string; tentative?: number; etat: string; entree?: unknown; delaiLe?: string | null; issueId?: string | null }) {
    const id = randomUUID();
    await x(
      `insert into ${ns}.etapes (id, company_id, mission_id, rang, role, tentative, etat, entree, delai_le, issue_id) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10)`,
      [id, e.companyId, e.missionId, e.rang, e.role, e.tentative ?? 1, e.etat, e.entree === undefined ? null : json(e.entree), e.delaiLe ?? null, e.issueId ?? null],
    );
    return id;
  }

  async function lireEtapes(companyId: string, missionId: string) {
    return (await q(`select * from ${ns}.etapes where company_id = $1 and mission_id = $2 order by rang, tentative limit 500`, [companyId, missionId])).map(etapeDepuisLigne);
  }

  /** Fichiers de prospects préparés par des missions sans CRM (sortie `fichier` d'une étape) : identifiants seulement, les plus récents d'abord. */
  async function missionsAvecFichier(companyId: string, limite: number) {
    const lignes = await q(
      `select m.id as mission_id, m.issue_racine_id, m.etat, e.modifie_le as date, e.sortie -> 'fichier' as fichier
       from ${ns}.etapes e join ${ns}.missions m on m.id = e.mission_id
       where e.company_id = $1 and m.company_id = $1 and jsonb_typeof(e.sortie -> 'fichier') = 'object'
       order by e.modifie_le desc, e.id limit $2`,
      [companyId, limite],
    );
    return lignes.flatMap((r) => {
      const f = r.fichier as { canal?: unknown; prospectIds?: unknown } | null;
      if (!f || typeof f.canal !== "string" || !Array.isArray(f.prospectIds) || !f.prospectIds.every((i) => typeof i === "string")) return [];
      return [{ missionId: String(r.mission_id), issueRacineId: texteOuNul(r.issue_racine_id), etat: String(r.etat), date: iso(r.date), canal: f.canal, prospectIds: f.prospectIds as string[] }];
    });
  }

  /** Met à jour les seuls champs fournis d'une étape. */
  async function majEtape(companyId: string, id: string, c: { etat?: string; entree?: unknown; sortie?: unknown; delaiLe?: string | null; issueId?: string | null; revisionLivrable?: string | null }) {
    const sets: string[] = [];
    const params: unknown[] = [companyId, id];
    const ajouter = (colonne: string, valeur: unknown, cast = "") => void sets.push(`${colonne} = $${params.push(valeur)}${cast}`);
    if (c.etat !== undefined) ajouter("etat", c.etat);
    if (c.entree !== undefined) ajouter("entree", json(c.entree), "::jsonb");
    if (c.sortie !== undefined) ajouter("sortie", json(c.sortie), "::jsonb");
    if (c.delaiLe !== undefined) ajouter("delai_le", c.delaiLe, "::timestamptz");
    if (c.issueId !== undefined) ajouter("issue_id", c.issueId);
    if (c.revisionLivrable !== undefined) ajouter("revision_livrable", c.revisionLivrable);
    if (sets.length === 0) return false;
    const { rowCount } = await x(`update ${ns}.etapes set ${sets.join(", ")}, modifie_le = now() where company_id = $1 and id = $2`, params);
    return rowCount === 1;
  }

  /** Inscrit l'intention d'une écriture rejouable en `demandee` ; vrai si la clé est neuve, faux si elle existait déjà. */
  async function enregistrerExecution(e: { companyId: string; missionId: string; rang: number; type: TypeExecution; cle: string; requete?: unknown; diffusionId?: string | null }) {
    const { rowCount } = await x(
      `insert into ${ns}.executions (id, company_id, mission_id, rang, type, cle_idempotence, requete, diffusion_id) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict (company_id, cle_idempotence) do nothing`,
      [randomUUID(), e.companyId, e.missionId, e.rang, e.type, e.cle, json(e.requete ?? {}), e.diffusionId ?? null],
    );
    return rowCount === 1;
  }

  /** Fait passer l'exécution de clé `cle` de cette entreprise au statut donné. */
  async function marquerExecution(companyId: string, cle: string, statut: StatutExecution) {
    const { rowCount } = await x(`update ${ns}.executions set statut = $3, modifie_le = now() where company_id = $1 and cle_idempotence = $2`, [companyId, cle, statut]);
    return rowCount === 1;
  }

  /** Exécution de clé `cle` de cette entreprise (statut seulement), ou null : distingue `demandee` (reprise) de `appliquee` (rejeu sans effet). */
  async function lireExecution(companyId: string, cle: string) {
    const [r] = await q(`select statut from ${ns}.executions where company_id = $1 and cle_idempotence = $2`, [companyId, cle]);
    return r ? { statut: String(r.statut) as StatutExecution } : null;
  }

  /** Nombre d'exécutions `appliquee` de cette mission dont la clé commence par `prefixe` et finit par `suffixe` (vide : clé sans suffixe de cycle `:c<n>`). */
  async function compterExecutionsAppliquees(companyId: string, missionId: string, prefixe: string, suffixe: string) {
    const [r] = await q(
      `select count(*)::int as n from ${ns}.executions where company_id = $1 and mission_id = $2 and statut = 'appliquee' and left(cle_idempotence, length($3)) = $3
         and (($4 <> '' and right(cle_idempotence, length($4)) = $4) or ($4 = '' and cle_idempotence !~ ':c[0-9]+$'))`,
      [companyId, missionId, prefixe, suffixe],
    );
    return Number(r?.n ?? 0);
  }

  /** Exécutions encore `demandee` de cette mission pour ce type (clé d'idempotence et requête) : ce qu'une reprise doit rejouer. */
  async function executionsDemandees(companyId: string, missionId: string, type: TypeExecution) {
    const lignes = await q(`select cle_idempotence, requete from ${ns}.executions where company_id = $1 and mission_id = $2 and type = $3 and statut = 'demandee' order by cree_le`, [companyId, missionId, type]);
    return lignes.map((r) => ({ cle: String(r.cle_idempotence), requete: r.requete as unknown }));
  }

  /** Compare-and-set du rang courant d'une mission : vrai si la mission était bien au rang `ancien`. */
  async function changerRangMission(companyId: string, id: string, ancien: number, nouveau: number) {
    const { rowCount } = await x(`update ${ns}.missions set rang_courant = $4, modifie_le = now() where company_id = $1 and id = $2 and rang_courant = $3`, [companyId, id, ancien, nouveau]);
    return rowCount === 1;
  }

  /** Étape (dernière tentative) dont la tâche Paperclip est `issueId`. */
  async function etapeParIssue(companyId: string, issueId: string) {
    const [r] = await q(`select * from ${ns}.etapes where company_id = $1 and issue_id = $2 order by tentative desc limit 1`, [companyId, issueId]);
    return r ? etapeDepuisLigne(r) : null;
  }

  /* ---------------- purge des prospects au terme de conservation (DROIT-1.4) ---------------- */
  // Mêmes gardes que la remise à zéro (M1) : un prospect qui porte une base légale est gardé (sa preuve avec lui) ;
  // les oppositions ne sont pas touchées. Contact = mise à jour, export CRM ou issue commerciale.
  const sansContactDepuis = `p.company_id = $1 and p.modifie_le < $2::timestamptz
       and not exists (select 1 from ${ns}.bases_legales b where b.prospect_id = p.id)
       and not exists (select 1 from ${ns}.exports_crm e where e.company_id = p.company_id and e.prospect_ids @> jsonb_build_array(p.id::text) and e.cree_le >= $2::timestamptz)
       and not exists (select 1 from ${ns}.issues_commerciales i where i.prospect_id = p.id and i.date_issue >= $2::timestamptz)`;
  async function purgerProspectsSansContact(companyId: string, avant: string, confirmer: boolean) {
    const [r] = await q(`select count(*) as n from ${ns}.prospects p where ${sansContactDepuis}`, [companyId, avant]);
    const candidats = Number(r?.n ?? 0);
    if (!confirmer) return { candidats, supprimes: 0 };
    const { rowCount } = await x(`delete from ${ns}.prospects p where ${sansContactDepuis}`, [companyId, avant]);
    return { candidats, supprimes: rowCount ?? 0 };
  }

  /* ---------------- remise à zéro des données de l'atelier ---------------- */
  // Faille M1 : oppositions RGPD, bases légales et journal d'audit
  // sont des obligations légales. La remise à zéro ne les efface JAMAIS, quel que soit l'appelant :
  // ces tables ne figurent pas dans la liste des suppressions, et les prospects qui portent une base
  // légale sont gardés (la clé étrangère `bases_legales.prospect_id` est en ON DELETE CASCADE).
  async function supprimerDonneesEntreprise(companyId: string) {
    const supprimes: Record<string, number> = {};
    // Les oppositions sont conservées : le témoin de la clé qui les a empreintées l'est aussi (relu avant, réinséré après).
    const temoinCle = await lireTemoinCleEmpreintes(companyId);
    // P9b : tables de prospection et de base clients d'abord (exports avant diffusions ; enfants avant parents).
    for (const table of TABLES_REMISE_A_ZERO) {
      const { rowCount } = table === "prospects"
        ? await x(
          `delete from ${ns}.prospects p where p.company_id = $1 and not exists (select 1 from ${ns}.bases_legales b where b.prospect_id = p.id)`,
          [companyId],
        )
        : await x(`delete from ${ns}.${table} where company_id = $1`, [companyId]);
      supprimes[table] = rowCount;
    }
    if (temoinCle !== null) await adopterTemoinCleEmpreintes(companyId, temoinCle);
    const [r] = await q<Record<string, number | string>>(
      `select ${TABLES_CONSERVEES.map((t) => `(select count(*) from ${ns}.${t} where company_id = $1) as ${t}`).join(", ")}, (select count(*) from ${ns}.prospects where company_id = $1) as prospects_avec_base_legale`,
      [companyId],
    );
    const conserves: Record<string, number> = {};
    for (const t of [...TABLES_CONSERVEES, "prospects_avec_base_legale"]) conserves[t] = Number(r?.[t] ?? 0);
    return { supprimes, conserves };
  }

  return {
    ns,
    journaliser, lireJournal, datesJournal, diffusionsConfirmeesSansBilan, abandonsVeilleur, differesSansDemande, reveilsRedispatchRates, journalExiste, journalExistants, lectureWebDansRun, derniereDateJournal, entreprisesSuivies, tachesOrphelines, tachesFigeesSousPorte,
    lireReglages, enregistrerReglages, lireTemoinCleEmpreintes, adopterTemoinCleEmpreintes, entrepriseAOppositions, remplacerTemoinCleEmpreintes, enregistrerPlafondEntreprise, enregistrerPlafondCampagne, donneesEngagement,
    creerCampagne, listerCampagnes, lireCampagne, creerBrief, dernierBrief,
    enregistrerExigence, creerExigenceSiAbsente, listerExigences, lireExigence, changerExclusion,
    creerPorte, lirePorte, listerPortes, majCycles, toucherPortesEntreprise, perimerEvaluationsEntreprise, traceReelle,
    insererCouverture, listerCouvertures, insererVerdict, listerVerdicts, insererConstat, resoudreConstats, listerConstats,
    derniereEntree, etatDerniereEvaluation, insererEvaluation, perimerEvaluations, listerEvaluations,
    insererMessage, lierCommentaire, listerMessages, messagesRecents, compterEnvoisRecents, changerEtatMessage,
    insererSource, listerSources, sourcesPourGarde, depotsProspectionCampagne, toucherPorte, insererImport, listerImports,
    insererDecision, invaliderDecisions, listerDecisions, insererRelance, listerRelances, insererDiffusion, lireDiffusionParCle, listerDiffusions,
    rapporterIssueDiffusion, lireDiffusionInterne, figerPreuve, revoquerPreuves, listerRevocations,
    insererAppel, listerAppels, lireAppel, lireAppelParEmpreinte, comptesConnexion,
    insererMarque, marques, planifier, listerPlanifications, listerMesures,
    tachesDeProjet, bloqueursNonResolus, tachesBloquantes, tachesSoeurs, runsDeTaches, tacheDuRun, coutsEntreprise, coutsEntrepriseMois, competencesDernierRun,
    supprimerDonneesEntreprise, purgerProspectsSansContact,
    prospectsParIdentifiants, lireProspect, empreintesProspectsEnBase, oppositionsPour, compterAReimporter, clientsActuelsPour, clientExiste, clientParEmpreinte, poidsScoreCourant,
    referentielProspection, insererProspect, majProspect, remplacerProspectAReimporter, exclureProspect, ajouterEmpreintesProspect, insererScoreProspect,
    detailsProspects, listerProspects, insererOpposition, lireOpposition,
    insererImportBaseClients, insererClients, etatBaseClients, supprimerBaseClients, reglesVentesCroisees, clientsPourVentesCroisees, insererEtalonnage, issuesPourEtalonnage, scoresCourantsCible, insererScoreMesure,
    lireExportCrmParCle, prospectDansExportNonRefuse, prospectExportConfirme, prospectExportAmbigu, insererExportCrm,
    creerMission, lireMission, missionsActives, rattacherCampagneMission, changerEtatMission, creerEtape, lireEtapes, missionsAvecFichier, majEtape, enregistrerExecution, marquerExecution, lireExecution, compterExecutionsAppliquees, executionsDemandees, changerRangMission, etapeParIssue,
  };
}

export type BaseAtelier = ReturnType<typeof creerBase>;
