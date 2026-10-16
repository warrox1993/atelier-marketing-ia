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
import { ESPACE_BASE, LIMITES } from "../contrats/index.js";
import { erreur } from "./erreurs.js";

type Db = PluginContext["db"];
type Ligne = Record<string, unknown>;

const IDENT = /^plugin_[a-z0-9_]{1,55}$/u;

export function json(valeur: unknown): string {
  return JSON.stringify(valeur ?? null);
}

/** Horodatage ISO 8601 UTC, y compris depuis la forme texte de PostgreSQL (« 2026-10-15 14:23:59.691232+02 »). */
export function iso(valeur: unknown): string {
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === "string") {
    const normalise = valeur.trim().replace(" ", "T").replace(/([+-]\d{2})$/u, "$1:00");
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
   */
  async function tachesOrphelines(companyId: string, seuilMinutes: number) {
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
         and i.status in ('todo', 'in_progress')
         and i.assignee_user_id is null
         and i.hidden_at is null
         and not (i.origin_kind like 'plugin:%:discussion' and coalesce(i.origin_id, '') like 'discussion:%')
         and coalesce(d.error_code, '') not in ('max_turns_exhausted', 'provider_quota', 'claude_auth_required', 'acpx_auth_required', 'continuation_user_authorization_missing')
         and coalesce(d.error_code, '') not like '%budget%'
         and coalesce(d.error_code, '') not like '%quota%'
         and coalesce(d.error_code, '') not like '%auth%'
         and a.status not in ('paused', 'terminated', 'pending_approval')
         and i.updated_at < now() - make_interval(mins => $2::int)
         and (d.id is null or d.status in ('interrupted', 'failed', 'timed_out', 'scheduled_retry'))
         and coalesce(d.le, i.updated_at) < now() - make_interval(mins => $2::int)
         and not exists (select 1 from public.heartbeat_runs x where x.company_id = $1 and x.context_snapshot->>'issueId' = i.id::text and x.status in ('queued', 'running'))
         and not exists (select 1 from public.issue_relations rel join public.issues b on b.id = rel.issue_id where rel.related_issue_id = i.id and rel.type = 'blocks' and b.status <> 'done')
         and not exists (select 1 from public.issues c where c.parent_id = i.id and c.status not in ('done', 'cancelled'))
       order by i.updated_at asc
       limit 50`,
      [companyId, Math.max(1, Math.floor(seuilMinutes))],
    );
    return rangs.map((r) => ({
      issueId: String(r.id),
      identifier: r.identifier == null ? null : String(r.identifier),
      statut: String(r.status),
      agentId: String(r.assignee_agent_id),
      dernierRun: r.run_id == null ? null : { id: String(r.run_id), statut: String(r.run_statut), le: iso(r.run_le) },
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
      modeParDefaut: (r?.mode_par_defaut as "demonstration" | "reel" | undefined) ?? "demonstration",
      retentionJours: r ? Number(r.retention_jours) : 365,
      plafondPub: r ? plafondDepuisLigne(r.plafond_pub_type, r.plafond_pub_cents, r.plafond_pub_decide_par, r.plafond_pub_decide_le) : null,
      modifieLe: r ? iso(r.modifie_le) : new Date(0).toISOString(),
      existe: Boolean(r),
    };
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
      revuesRequises: tableau<{ role: "exigences" | "metier" | "technique"; agentId: string }>(r.revues_requises),
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
      role: r.role as "exigences" | "metier" | "technique",
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
      role: r.role as "exigences" | "metier" | "technique",
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
  }) {
    const { rowCount } = await x(
      `insert into ${ns}.diffusions (id, company_id, issue_id, revision_id, decision_id, action, canal, compte, audience, montant_cents, etat, cle_idempotence, motif_refus, mode, demandee_par, service, outil, empreinte_arguments, preuve_charge)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb) on conflict (company_id, cle_idempotence) do nothing`,
      [d.id, d.companyId, d.issueId, d.revisionId, d.decisionId, d.action, d.canal, d.compte, d.audience, d.montantCents, d.etat, d.cleIdempotence, d.motifRefus, d.mode, d.par,
        d.service ?? null, d.outil ?? null, d.empreinteArguments ?? null, d.preuveCharge === undefined || d.preuveCharge === null ? null : json(d.preuveCharge)],
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
    const [r] = await q(`select id, issue_id, audience, empreinte_arguments, service, outil, preuve_charge, revoquee_le, revocation_motif from ${ns}.diffusions where company_id = $1 and id = $2`, [companyId, id]);
    return r
      ? {
          id: String(r.id), issueId: String(r.issue_id), audience: (r.audience as string | null) ?? null, empreinteArguments: (r.empreinte_arguments as string | null) ?? null,
          service: (r.service as string | null) ?? null, outil: (r.outil as string | null) ?? null, preuveCharge: chargeDe(r.preuve_charge),
          revocation: r.revoquee_le ? { le: iso(r.revoquee_le), motif: String(r.revocation_motif ?? "") } : null,
        }
      : null;
  }

  async function lireDiffusionParCle(companyId: string, cle: string) {
    const [r] = await q(`select * from ${ns}.diffusions where company_id = $1 and cle_idempotence = $2`, [companyId, cle]);
    return r ? diffusionDepuisLigne(r) : null;
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

  async function runsDeTaches(companyId: string) {
    return q(
      `select id, agent_id, status, context_snapshot->>'issueId' as issue_id, created_at from public.heartbeat_runs where company_id = $1 and created_at > now() - interval '7 days' order by created_at desc limit 500`,
      [companyId],
    );
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
    const filtre = options.corbeille === true ? "" : " and corbeille_le is null";
    const [r] = await q(`select * from ${ns}.prospects where company_id = $1 and id = $2${filtre}`, [companyId, id]);
    return r ? ligneProspect(r) : null;
  }

  /** Empreintes déjà portées par des prospects de l'entreprise, parmi les valeurs données. */
  async function empreintesProspectsEnBase(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return [];
    return (await q(`select prospect_id, type, empreinte from ${ns}.prospects_empreintes where company_id = $1 and empreinte in (select jsonb_array_elements_text($2::jsonb))`, [companyId, json(valeurs)])).map((r) => ({
      prospectId: String(r.prospect_id), type: String(r.type), valeur: String(r.empreinte),
    }));
  }

  async function oppositionsPour(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return [];
    return (await q(`select type, empreinte, canal from ${ns}.oppositions where company_id = $1 and empreinte in (select jsonb_array_elements_text($2::jsonb))`, [companyId, json(valeurs)])).map((r) => ({
      type: String(r.type), valeur: String(r.empreinte), canal: String(r.canal),
    }));
  }

  /** Empreintes des clients ACTIFS de la base de clients, parmi les valeurs données. */
  async function clientsActuelsPour(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return [];
    return (await q(
      `select e.type, e.empreinte from ${ns}.clients_empreintes e join ${ns}.clients c on c.id = e.client_id and c.company_id = e.company_id
       where e.company_id = $1 and c.statut = 'actif' and e.empreinte in (select jsonb_array_elements_text($2::jsonb))`,
      [companyId, json(valeurs)],
    )).map((r) => ({ type: String(r.type), valeur: String(r.empreinte) }));
  }

  /** Numéros (empreintes) inscrits à la liste « Ne m'appelez plus » chargée, parmi les valeurs données ; null si aucun. */
  async function dncmPour(companyId: string, valeurs: readonly string[]) {
    if (valeurs.length === 0) return null;
    const lignes = await q(
      `select e.empreinte, l.version_du from ${ns}.dncm_empreintes e join ${ns}.listes_dncm l on l.id = e.liste_id and l.company_id = e.company_id
       where e.company_id = $1 and e.empreinte in (select jsonb_array_elements_text($2::jsonb)) order by l.version_du desc`,
      [companyId, json(valeurs)],
    );
    if (lignes.length === 0) return null;
    return { empreintes: lignes.map((r) => ({ type: "telephone" as const, valeur: String(r.empreinte) })), verifieeLe: iso(lignes[0]!.version_du) };
  }

  async function clientExiste(companyId: string, clientId: string) {
    return (await q(`select id from ${ns}.clients where company_id = $1 and id = $2`, [companyId, clientId])).length > 0;
  }

  /** Client de la base de clients désigné par une empreinte (ex. `identifiant_client`) ; null si absent. */
  async function clientParEmpreinte(companyId: string, type: string, valeur: string): Promise<string | null> {
    const [r] = await q(`select client_id from ${ns}.clients_empreintes where company_id = $1 and type = $2 and empreinte = $3 limit 1`, [companyId, type, valeur]);
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
  async function insererProspect(p: Omit<LigneProspect, "creeLe" | "modifieLe">) {
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

  async function prospectsAvecEmpreinte(companyId: string, type: string, valeur: string) {
    return (await q(`select distinct prospect_id from ${ns}.prospects_empreintes where company_id = $1 and type = $2 and empreinte = $3`, [companyId, type, valeur])).map((r) => String(r.prospect_id));
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
    return { total, lignes };
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
    const [i] = await q(`select * from ${ns}.bases_clients_imports where company_id = $1 order by importe_le desc limit 1`, [companyId]);
    const [c] = await q(`select count(*) as total, count(*) filter (where statut = 'actif') as actifs from ${ns}.clients where company_id = $1`, [companyId]);
    return {
      dernierImport: i
        ? { id: String(i.id), nomFichier: String(i.nom_fichier), format: String(i.format), importeLe: iso(i.importe_le), importePar: String(i.importe_par), purgeLe: iso(i.purge_le), finalite: String(i.finalite), dureeConservationMois: Number(i.duree_conservation_mois), lignesRetenues: Number(i.lignes_retenues), lignesRejetees: Number(i.lignes_rejetees), mode: String(i.mode) }
        : null,
      clients: Number(c?.total ?? 0),
      actifs: Number(c?.actifs ?? 0),
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
       from ${ns}.clients c where c.company_id = $1 order by c.cree_le, c.id limit $2`,
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

  /* ---------------- remise à zéro de la démonstration ---------------- */
  async function supprimerDonneesEntreprise(companyId: string) {
    const supprimes: Record<string, number> = {};
    // P9b : tables de prospection et de base clients d'abord (exports avant diffusions ; enfants avant parents).
    for (const table of ["corrections_criteres", "evaluations_criteres", "reglages_leads", "exports_crm", "issues_commerciales", "bases_legales", "prospects_scores", "prospects_empreintes", "prospects", "etalonnages", "poids_score",
      "clients_empreintes", "clients", "bases_clients_imports", "regles_ventes_croisees", "dncm_empreintes", "listes_dncm", "oppositions",
      "relances_correction", "appels_proposes", "diffusions", "decisions_humaines", "constats", "verdicts", "couvertures", "evaluations_porte", "messages", "sources", "mesures", "imports", "planifications", "portes", "exigences", "briefs", "campagnes", "marques", "journal", "reglages_entreprise"]) {
      const { rowCount } = await x(`delete from ${ns}.${table} where company_id = $1`, [companyId]);
      supprimes[table] = rowCount;
    }
    return supprimes;
  }

  return {
    ns,
    journaliser, lireJournal, datesJournal, entreprisesSuivies, tachesOrphelines,
    lireReglages, enregistrerReglages, enregistrerPlafondEntreprise, enregistrerPlafondCampagne, donneesEngagement,
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
    tachesDeProjet, bloqueursNonResolus, runsDeTaches, coutsEntreprise, coutsEntrepriseMois, competencesDernierRun,
    supprimerDonneesEntreprise,
    prospectsParIdentifiants, lireProspect, empreintesProspectsEnBase, oppositionsPour, clientsActuelsPour, dncmPour, clientExiste, clientParEmpreinte, poidsScoreCourant,
    referentielProspection, insererProspect, majProspect, exclureProspect, ajouterEmpreintesProspect, prospectsAvecEmpreinte, insererScoreProspect,
    detailsProspects, listerProspects, insererOpposition, lireOpposition,
    insererImportBaseClients, insererClients, etatBaseClients, supprimerBaseClients, reglesVentesCroisees, clientsPourVentesCroisees, insererEtalonnage, issuesPourEtalonnage, scoresCourantsCible, insererScoreMesure,
    lireExportCrmParCle, insererExportCrm,
  };
}

export type BaseAtelier = ReturnType<typeof creerBase>;
