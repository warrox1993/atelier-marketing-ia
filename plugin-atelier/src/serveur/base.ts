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
    connexion?: { service: string; outil: string; indicesMode: string[]; chiffres: Array<{ valeur: number; chemin: string }>; modeCampagne: "demonstration" | "reel" } | null;
  }) {
    const c = s.connexion ?? null;
    await x(
      `insert into ${ns}.sources (id, company_id, campagne_id, issue_id, revision_id, url, url_finale, titre, statut_acces, code_http, type_contenu, extrait, empreinte, indices_erreur, injections_signalees, provenance, mode, service, outil, indices_mode, chiffres, mode_campagne)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19, $20::jsonb, $21::jsonb, $22)`,
      [s.id, s.companyId, s.campagneId, s.issueId, s.revisionId, s.url, s.urlFinale, s.titre, s.statutAcces, s.codeHttp, s.typeContenu, s.extrait, s.empreinte, json(s.indicesErreur), json(s.injections), s.provenance, s.mode,
        c?.service ?? null, c?.outil ?? null, json(c?.indicesMode ?? []), json(c?.chiffres ?? []), c?.modeCampagne ?? null],
    );
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
  }) {
    const { rowCount } = await x(
      `insert into ${ns}.diffusions (id, company_id, issue_id, revision_id, decision_id, action, canal, compte, audience, montant_cents, etat, cle_idempotence, motif_refus, mode, demandee_par, service, outil, empreinte_arguments)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) on conflict (company_id, cle_idempotence) do nothing`,
      [d.id, d.companyId, d.issueId, d.revisionId, d.decisionId, d.action, d.canal, d.compte, d.audience, d.montantCents, d.etat, d.cleIdempotence, d.motifRefus, d.mode, d.par,
        d.service ?? null, d.outil ?? null, d.empreinteArguments ?? null],
    );
    return rowCount === 1;
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
    };
  }

  /** Données internes d'une diffusion (jamais renvoyées telles quelles) : audience et empreinte des arguments. */
  async function lireDiffusionInterne(companyId: string, id: string) {
    const [r] = await q(`select id, issue_id, audience, empreinte_arguments, service, outil from ${ns}.diffusions where company_id = $1 and id = $2`, [companyId, id]);
    return r ? { id: String(r.id), issueId: String(r.issue_id), audience: (r.audience as string | null) ?? null, empreinteArguments: (r.empreinte_arguments as string | null) ?? null, service: (r.service as string | null) ?? null, outil: (r.outil as string | null) ?? null } : null;
  }

  async function lireDiffusionParCle(companyId: string, cle: string) {
    const [r] = await q(`select * from ${ns}.diffusions where company_id = $1 and cle_idempotence = $2`, [companyId, cle]);
    return r ? diffusionDepuisLigne(r) : null;
  }

  async function listerDiffusions(companyId: string, issueId: string) {
    return (await q(`select * from ${ns}.diffusions where company_id = $1 and issue_id = $2 order by cree_le desc`, [companyId, issueId])).map(diffusionDepuisLigne);
  }

  /* ---------------- marque, planifications, mesures ---------------- */
  async function insererMarque(m: { companyId: string; identite: string; ton: string; offres: unknown; zones: unknown; etablissements: unknown; affirmations: unknown; manquantes: unknown; par: string }) {
    const [d] = await q<{ v: number | null }>(`select max(version) as v from ${ns}.marques where company_id = $1`, [m.companyId]);
    const version = Number(d?.v ?? 0) + 1;
    const id = randomUUID();
    await x(
      `insert into ${ns}.marques (id, company_id, version, identite, ton, offres, zones, etablissements, affirmations_autorisees, informations_manquantes, cree_par) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)`,
      [id, m.companyId, version, m.identite, m.ton, json(m.offres), json(m.zones), json(m.etablissements), json(m.affirmations), json(m.manquantes), m.par],
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

  /* ---------------- remise à zéro de la démonstration ---------------- */
  async function supprimerDonneesEntreprise(companyId: string) {
    const supprimes: Record<string, number> = {};
    for (const table of ["relances_correction", "diffusions", "decisions_humaines", "constats", "verdicts", "couvertures", "evaluations_porte", "messages", "sources", "mesures", "imports", "planifications", "portes", "exigences", "briefs", "campagnes", "marques", "journal", "reglages_entreprise"]) {
      const { rowCount } = await x(`delete from ${ns}.${table} where company_id = $1`, [companyId]);
      supprimes[table] = rowCount;
    }
    return supprimes;
  }

  return {
    ns,
    journaliser, lireJournal,
    lireReglages, enregistrerReglages, enregistrerPlafondEntreprise, enregistrerPlafondCampagne, donneesEngagement,
    creerCampagne, listerCampagnes, lireCampagne, creerBrief, dernierBrief,
    enregistrerExigence, creerExigenceSiAbsente, listerExigences, lireExigence, changerExclusion,
    creerPorte, lirePorte, listerPortes, majCycles, toucherPortesEntreprise, perimerEvaluationsEntreprise, traceReelle,
    insererCouverture, listerCouvertures, insererVerdict, listerVerdicts, insererConstat, resoudreConstats, listerConstats,
    derniereEntree, etatDerniereEvaluation, insererEvaluation, perimerEvaluations, listerEvaluations,
    insererMessage, lierCommentaire, listerMessages, messagesRecents, compterEnvoisRecents, changerEtatMessage,
    insererSource, listerSources, sourcesPourGarde, toucherPorte, insererImport, listerImports,
    insererDecision, invaliderDecisions, listerDecisions, insererRelance, listerRelances, insererDiffusion, lireDiffusionParCle, listerDiffusions,
    rapporterIssueDiffusion, lireDiffusionInterne,
    insererMarque, marques, planifier, listerPlanifications, listerMesures,
    tachesDeProjet, bloqueursNonResolus, runsDeTaches, coutsEntreprise, coutsEntrepriseMois, competencesDernierRun,
    supprimerDonneesEntreprise,
  };
}

export type BaseAtelier = ReturnType<typeof creerBase>;
