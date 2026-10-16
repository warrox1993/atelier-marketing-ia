/**
 * Réglages des leads (humain seulement) : le client choisit sur quoi reposent la confiance de qualification
 * et le score, et corrige à la main un critère d'un lead.
 *
 * - `reglages-leads.lire` / `reglages-leads.enregistrer` : critères codés (actif, poids), seuil, critères
 *   personnalisés. Versionnés (migration 010) : chaque enregistrement ajoute une version.
 * - `reglages-score.lire` / `reglages-score.enregistrer` : poids du score (table `poids_score`, migration 007),
 *   une nouvelle version à chaque modification, jamais d'écrasement.
 * - `prospects.critere.evaluer` : évaluation d'un critère personnalisé par l'agent Prospection (agent seulement) ;
 *   la décision humaine prime.
 * - `prospects.critere.corriger` / `prospects.critere.retirer` : décision humaine sur un critère d'un lead ;
 *   elle remplace le statut calculé jusqu'à son retrait.
 *
 * L'entreprise vient toujours de la résolution de route par l'hôte ; un corps qui en désigne une autre est
 * refusé. Un agent reçoit 403. Chaque écriture est journalisée.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  CRITERES_SCORE,
  CodeCritere,
  CodeCritereQualification,
  CorrigerCritereEntree,
  EnregistrerPoidsScore,
  EnregistrerReglagesLeads,
  EvaluerCritereEntree,
  IdNatif,
  type CleRouteApi,
  type CorrectionCritere,
  type CriterePersonnalise,
  type EvaluationCritere,
  type ReglageCritere,
  type ReglagesLeads,
  type ReglagesScore,
} from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { REGLAGES_QUALIFICATION_DEFAUT, libelleCritere, type CorrectionLue, type EvaluationLue, type ReglagesQualification } from "./qualification-prospects.js";

/** Réglages des leads tels qu'ils sont rangés (une version). */
export interface VersionReglagesLeads {
  version: number;
  criteres: ReglageCritere[];
  seuil: number;
  personnalises: CriterePersonnalise[];
  decidePar: string;
  decideLe: string;
}

/** Version des poids du score. */
export interface VersionPoidsScore {
  version: number;
  poids: Record<string, number>;
  decidePar: string;
  decideLe: string;
}

/** Accès en base (migration 010, table `poids_score` de la 007) ; les tests le remplacent par une version en mémoire. */
export interface StockReglagesLeads {
  reglagesCourants(companyId: string): Promise<VersionReglagesLeads | null>;
  insererReglages(companyId: string, v: VersionReglagesLeads): Promise<void>;
  poidsCourants(companyId: string): Promise<VersionPoidsScore | null>;
  insererPoids(companyId: string, v: VersionPoidsScore): Promise<void>;
  /** Toutes les corrections de l'entreprise (une lecture par parcours de qualification). */
  corrections(companyId: string): Promise<CorrectionCritere[]>;
  /** Crée ou remplace la décision humaine sur ce critère de ce prospect. */
  ecrireCorrection(companyId: string, c: CorrectionCritere): Promise<void>;
  retirerCorrection(companyId: string, prospectId: string, code: string): Promise<number>;
  /** Toutes les évaluations de l'agent de l'entreprise (migration 011). */
  evaluations(companyId: string): Promise<EvaluationCritere[]>;
  /** Crée ou remplace l'évaluation de l'agent sur ce critère de ce prospect. */
  ecrireEvaluation(companyId: string, e: EvaluationCritere): Promise<void>;
}

export interface DependancesReglagesLeads {
  ctx: PluginContext;
  base: BaseAtelier;
  stock: StockReglagesLeads;
  maintenant?: () => Date;
}

/* ------------------------------------------------------------------ */
/* Stock réel                                                          */
/* ------------------------------------------------------------------ */

type Db = PluginContext["db"];
type Ligne = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
function jsonLu<T>(v: unknown, defaut: T): T {
  if (typeof v !== "string") return (v ?? defaut) as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return defaut;
  }
}

export function creerStockReglagesLeads(db: Db): StockReglagesLeads {
  const ns = db.namespace;
  const q = (sql: string, params: unknown[]) => db.query<Ligne>(sql, params);
  const x = async (sql: string, params: unknown[]) => (await db.execute(sql, params)).rowCount;
  return {
    async reglagesCourants(companyId) {
      const [r] = await q(`select version, criteres, seuil, personnalises, decide_par, decide_le from ${ns}.reglages_leads where company_id = $1 order by version desc limit 1`, [companyId]);
      return r
        ? { version: Number(r.version), criteres: jsonLu(r.criteres, []), seuil: Number(r.seuil), personnalises: jsonLu(r.personnalises, []), decidePar: String(r.decide_par), decideLe: iso(r.decide_le) }
        : null;
    },
    async insererReglages(companyId, v) {
      await x(
        `insert into ${ns}.reglages_leads (company_id, version, criteres, seuil, personnalises, decide_par, decide_le) values ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7::timestamptz)`,
        [companyId, v.version, JSON.stringify(v.criteres), v.seuil, JSON.stringify(v.personnalises), v.decidePar, v.decideLe],
      );
    },
    async poidsCourants(companyId) {
      const [r] = await q(`select version, poids, decide_par, decide_le from ${ns}.poids_score where company_id = $1 order by version desc limit 1`, [companyId]);
      return r ? { version: Number(r.version), poids: jsonLu(r.poids, {}), decidePar: String(r.decide_par), decideLe: iso(r.decide_le) } : null;
    },
    async insererPoids(companyId, v) {
      await x(`insert into ${ns}.poids_score (company_id, version, poids, decide_par, decide_le) values ($1, $2, $3::jsonb, $4, $5::timestamptz)`, [
        companyId, v.version, JSON.stringify(v.poids), v.decidePar, v.decideLe,
      ]);
    },
    async corrections(companyId) {
      const lignes = await q(`select prospect_id, code, statut, justification, auteur, decide_le from ${ns}.corrections_criteres where company_id = $1`, [companyId]);
      return lignes.map((r) => ({
        prospectId: String(r.prospect_id), code: String(r.code), statut: r.statut as CorrectionCritere["statut"], justification: String(r.justification), auteur: String(r.auteur), date: iso(r.decide_le),
      }));
    },
    async ecrireCorrection(companyId, c) {
      await x(
        `insert into ${ns}.corrections_criteres (company_id, prospect_id, code, statut, justification, auteur, decide_le) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
         on conflict (prospect_id, code) do update set statut = excluded.statut, justification = excluded.justification, auteur = excluded.auteur, decide_le = excluded.decide_le`,
        [companyId, c.prospectId, c.code, c.statut, c.justification, c.auteur, c.date],
      );
    },
    async retirerCorrection(companyId, prospectId, code) {
      return x(`delete from ${ns}.corrections_criteres where company_id = $1 and prospect_id = $2 and code = $3`, [companyId, prospectId, code]);
    },
    async evaluations(companyId) {
      const lignes = await q(`select prospect_id, code, statut, justification, sources, agent, evalue_le from ${ns}.evaluations_criteres where company_id = $1`, [companyId]);
      return lignes.map((r) => ({
        prospectId: String(r.prospect_id), code: String(r.code), statut: r.statut as EvaluationCritere["statut"], justification: String(r.justification),
        sources: jsonLu<string[]>(r.sources, []), agent: String(r.agent), date: iso(r.evalue_le),
      }));
    },
    async ecrireEvaluation(companyId, e) {
      await x(
        `insert into ${ns}.evaluations_criteres (company_id, prospect_id, code, statut, justification, sources, agent, evalue_le) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)
         on conflict (prospect_id, code) do update set statut = excluded.statut, justification = excluded.justification, sources = excluded.sources, agent = excluded.agent, evalue_le = excluded.evalue_le`,
        [companyId, e.prospectId, e.code, e.statut, e.justification, JSON.stringify(e.sources), e.agent, e.date],
      );
    },
  };
}

/** Sans `ctx.db` (bancs de test qui n'en déclarent pas) : réglages par défaut, aucune correction, écritures refusées. */
export function stockReglagesParDefaut(ctx: PluginContext): StockReglagesLeads {
  let reel: StockReglagesLeads | null = null;
  const indisponible = async (): Promise<never> => erreur("erreur_interne", "Base du plugin indisponible : réglages des leads inutilisables.");
  const vide: StockReglagesLeads = {
    reglagesCourants: async () => null, poidsCourants: async () => null, corrections: async () => [],
    insererReglages: indisponible, insererPoids: indisponible, ecrireCorrection: indisponible, retirerCorrection: indisponible,
    evaluations: async () => [], ecrireEvaluation: indisponible,
  };
  return new Proxy(vide, {
    get(cible, cle) {
      if (!(ctx as { db?: unknown }).db) return cible[cle as keyof StockReglagesLeads];
      reel ??= creerStockReglagesLeads(ctx.db);
      return reel[cle as keyof StockReglagesLeads];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lecture pour le calcul de la confiance                              */
/* ------------------------------------------------------------------ */

/** Réglages de calcul d'une version rangée (un critère codé absent garde son réglage par défaut). */
export function reglagesDeVersion(v: VersionReglagesLeads | null): ReglagesQualification {
  if (v === null) return REGLAGES_QUALIFICATION_DEFAUT;
  const criteres = { ...REGLAGES_QUALIFICATION_DEFAUT.criteres };
  for (const c of v.criteres) if (c.code in criteres) criteres[c.code] = { actif: c.actif, poids: c.poids };
  return { criteres, seuil: v.seuil, personnalises: v.personnalises };
}

/** Réglages et corrections d'une entreprise, lus en une fois pour tout un parcours de prospects. */
export async function lireQualification(
  stock: StockReglagesLeads,
  companyId: string,
): Promise<{ reglages: ReglagesQualification; corrections: Map<string, CorrectionLue[]>; evaluations: Map<string, EvaluationLue[]> }> {
  const [v, liste, evals] = await Promise.all([stock.reglagesCourants(companyId), stock.corrections(companyId), stock.evaluations(companyId)]);
  const corrections = new Map<string, CorrectionLue[]>();
  for (const { prospectId, ...c } of liste) corrections.set(prospectId, [...(corrections.get(prospectId) ?? []), c]);
  const evaluations = new Map<string, EvaluationLue[]>();
  for (const { prospectId, ...e } of evals) evaluations.set(prospectId, [...(evaluations.get(prospectId) ?? []), e]);
  return { reglages: reglagesDeVersion(v), corrections, evaluations };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

const CODES_CODES = CodeCritereQualification.options;

export function routesReglagesLeads(d: DependancesReglagesLeads): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { base, stock } = d;
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  const auteur = (a: ActeurHote) => a.userId ?? a.id;

  const memeEntreprise = (corps: unknown, companyId: string) => {
    const c = (corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
  };
  /** Le corps porte l'entreprise de la route (résolue par l'hôte), jamais une autre. */
  const corpsAvecEntreprise = (corps: unknown, companyId: string) => {
    memeEntreprise(corps, companyId);
    return typeof corps === "object" && corps !== null ? { ...(corps as Record<string, unknown>), companyId } : corps;
  };

  async function vueReglages(companyId: string): Promise<ReglagesLeads> {
    const v = await stock.reglagesCourants(companyId);
    const r = reglagesDeVersion(v);
    return {
      companyId,
      version: v?.version ?? 0,
      criteres: CODES_CODES.map((code) => ({ code, libelle: libelleCritere(code), actif: r.criteres[code].actif, poids: r.criteres[code].poids })),
      seuil: r.seuil,
      personnalises: [...r.personnalises],
      decidePar: v?.decidePar ?? null,
      decideLe: v?.decideLe ?? null,
    };
  }

  async function vueScore(companyId: string): Promise<ReglagesScore> {
    const v = await stock.poidsCourants(companyId);
    return {
      companyId, version: v?.version ?? null, poids: v?.poids ?? {}, criteres: CRITERES_SCORE.map((c) => ({ code: c.code, libelle: c.libelle })),
      decidePar: v?.decidePar ?? null, decideLe: v?.decideLe ?? null,
    };
  }

  routes["reglages-leads.lire"] = async (r) => {
    exigerHumain(r.acteur, "La lecture des réglages des leads");
    return { corps: await vueReglages(r.companyId) };
  };

  routes["reglages-leads.enregistrer"] = async (r) => {
    exigerHumain(r.acteur, "Le réglage des critères des leads");
    const p = EnregistrerReglagesLeads.safeParse(corpsAvecEntreprise(r.corps, r.companyId));
    if (!p.success) erreurValidation("Réglages des leads", p.error.issues);
    const courante = await stock.reglagesCourants(r.companyId);
    const ordre = (c: ReglageCritere) => CODES_CODES.indexOf(c.code);
    const v: VersionReglagesLeads = {
      version: (courante?.version ?? 0) + 1,
      criteres: [...p.data.criteres].sort((a, b) => ordre(a) - ordre(b)),
      seuil: p.data.seuil,
      personnalises: p.data.personnalises,
      decidePar: auteur(r.acteur),
      decideLe: maintenant().toISOString(),
    };
    await stock.insererReglages(r.companyId, v);
    await base.journaliser({
      companyId: r.companyId, type: "reglages.leads", entite: "reglages_leads", entiteId: String(v.version), acteur: r.acteur.id,
      donnees: { version: v.version, seuil: v.seuil, inactifs: v.criteres.filter((c) => !c.actif).map((c) => c.code), personnalises: v.personnalises.map((c) => c.code) },
    });
    return { corps: await vueReglages(r.companyId) };
  };

  routes["reglages-score.lire"] = async (r) => {
    exigerHumain(r.acteur, "La lecture des poids du score");
    return { corps: await vueScore(r.companyId) };
  };

  routes["reglages-score.enregistrer"] = async (r) => {
    exigerHumain(r.acteur, "Le réglage des poids du score");
    const p = EnregistrerPoidsScore.safeParse(corpsAvecEntreprise(r.corps, r.companyId));
    if (!p.success) erreurValidation("Poids du score", p.error.issues);
    const courante = await stock.poidsCourants(r.companyId);
    const v: VersionPoidsScore = { version: (courante?.version ?? 0) + 1, poids: p.data.poids as Record<string, number>, decidePar: auteur(r.acteur), decideLe: maintenant().toISOString() };
    await stock.insererPoids(r.companyId, v);
    await base.journaliser({ companyId: r.companyId, type: "reglages.score", entite: "poids_score", entiteId: String(v.version), acteur: r.acteur.id, donnees: { version: v.version, poids: v.poids } });
    return { corps: await vueScore(r.companyId) };
  };

  /** Prospect de l'entreprise et code d'un critère qui lui est applicable et en vigueur. */
  async function cibleCorrection(companyId: string, params: Record<string, string>) {
    const prospectId = IdNatif.safeParse(params.prospectId ?? "");
    if (!prospectId.success) erreur("entree_invalide", "Identifiant de prospect invalide.");
    const code = CodeCritere.safeParse(params.code ?? "");
    if (!code.success) erreur("entree_invalide", "Code de critère invalide.");
    const p = await base.lireProspect(companyId, prospectId.data);
    if (!p) erreur("introuvable", "Prospect introuvable dans cette entreprise.");
    const reglages = reglagesDeVersion(await stock.reglagesCourants(companyId));
    if ((CODES_CODES as readonly string[]).includes(code.data)) {
      const c = code.data as CodeCritereQualification;
      if (c === "taille_connue" && p.cible !== "entreprise") erreur("entree_invalide", "« Taille connue » ne s'applique qu'à une entreprise.");
      if (!reglages.criteres[c].actif) erreur("entree_invalide", "Ce critère est désactivé dans les réglages des leads.");
    } else if (!reglages.personnalises.some((x) => x.code === code.data)) {
      erreur("introuvable", "Critère inconnu : ni critère existant, ni critère personnalisé des réglages.");
    }
    return { prospectId: prospectId.data, code: code.data };
  }

  routes["prospects.critere.corriger"] = async (r) => {
    exigerHumain(r.acteur, "La correction d'un critère");
    const p = CorrigerCritereEntree.safeParse(corpsAvecEntreprise(r.corps, r.companyId));
    if (!p.success) erreurValidation("Correction d'un critère", p.error.issues);
    const { prospectId, code } = await cibleCorrection(r.companyId, r.params);
    const correction: CorrectionCritere = { prospectId, code, statut: p.data.statut, justification: p.data.justification, auteur: auteur(r.acteur), date: maintenant().toISOString() };
    await stock.ecrireCorrection(r.companyId, correction);
    await base.journaliser({ companyId: r.companyId, type: "prospects.critere.corrige", entite: "prospect", entiteId: prospectId, acteur: r.acteur.id, donnees: { code, statut: correction.statut } });
    return { corps: correction };
  };

  routes["prospects.critere.evaluer"] = async (r) => {
    if (r.acteur.type !== "agent") erreur("elevation_refusee", "L'évaluation d'un critère personnalisé est réservée à l'agent Prospection.");
    // Seul l'agent Prospection évalue (même repérage par le nom que le Coordinateur ailleurs dans le plugin) ; tout autre agent reçoit 403.
    const agent = r.acteur.agentId ? await d.ctx.agents.get(r.acteur.agentId, r.companyId).catch(() => null) : null;
    if (!agent || agent.companyId !== r.companyId || agent.status === "terminated" || !agent.name.startsWith("Prospection")) {
      erreur("elevation_refusee", "L'évaluation d'un critère personnalisé est réservée à l'agent Prospection.");
    }
    const p = EvaluerCritereEntree.safeParse(corpsAvecEntreprise(r.corps, r.companyId));
    if (!p.success) erreurValidation("Évaluation d'un critère", p.error.issues);
    const prospectId = IdNatif.safeParse(r.params.prospectId ?? "");
    const code = CodeCritere.safeParse(r.params.code ?? "");
    if (!prospectId.success || !code.success) erreur("entree_invalide", "Prospect ou critère invalide.");
    if ((CODES_CODES as readonly string[]).includes(code.data)) erreur("entree_invalide", "Ce critère est calculé automatiquement : seul un critère personnalisé s'évalue ici.");
    if (!(await base.lireProspect(r.companyId, prospectId.data))) erreur("introuvable", "Prospect introuvable dans cette entreprise.");
    const reglages = reglagesDeVersion(await stock.reglagesCourants(r.companyId));
    if (!reglages.personnalises.some((x) => x.code === code.data)) erreur("entree_invalide", "Critère personnalisé inconnu ou retiré des réglages des leads.");
    const evaluation: EvaluationCritere = {
      prospectId: prospectId.data, code: code.data, statut: p.data.statut, justification: p.data.justification, sources: p.data.sources, agent: auteur(r.acteur), date: maintenant().toISOString(),
    };
    await stock.ecrireEvaluation(r.companyId, evaluation);
    await base.journaliser({
      companyId: r.companyId, type: "prospects.critere.evalue", entite: "prospect", entiteId: prospectId.data, acteur: r.acteur.id,
      donnees: { code: code.data, statut: evaluation.statut, sources: evaluation.sources.length },
    });
    return { corps: evaluation };
  };

  routes["prospects.critere.retirer"] = async (r) => {
    exigerHumain(r.acteur, "Le retrait d'une correction");
    const prospectId = IdNatif.safeParse(r.params.prospectId ?? "");
    const code = CodeCritere.safeParse(r.params.code ?? "");
    if (!prospectId.success || !code.success) erreur("entree_invalide", "Prospect ou critère invalide.");
    const n = await stock.retirerCorrection(r.companyId, prospectId.data, code.data);
    if (n === 0) erreur("introuvable", "Aucune décision humaine sur ce critère de ce prospect.");
    await base.journaliser({ companyId: r.companyId, type: "prospects.critere.retire", entite: "prospect", entiteId: prospectId.data, acteur: r.acteur.id, donnees: { code: code.data } });
    return { corps: { prospectId: prospectId.data, code: code.data, retire: true } };
  };

  return routes;
}
