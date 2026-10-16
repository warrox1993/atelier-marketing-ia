/**
 * Purge des données d'une entreprise (fin de contrat, droit à l'effacement), humain seulement.
 *
 * - `donnees.purger` : supprime, pour l'entreprise de la route et pour elle seule, TOUTES les lignes des
 *   tables du plugin (migrations `migrations/*.sql`, colonne `company_id`), y compris les connaissances
 *   (index, documents, versions, passages), les prospects, les clients, les bases légales et le journal.
 *   Avec `{"aBlanc": true}`, rien n'est supprimé : la route rend seulement les comptes par table.
 *   Sans `aBlanc`, `{"confirmer": true}` est obligatoire.
 * - Le journal du plugin étant lui-même purgé, aucune ligne n'est écrite après coup : la trace est le compte
 *   par table rendu à l'appelant (le script `purger` l'inscrit dans son rapport) et un message de journal
 *   technique sans donnée personnelle.
 * - Après la suppression, un nouveau comptage doit rendre zéro partout, sinon la route échoue (500).
 *
 * - `donnees.exporter` : copie lisible des mêmes tables avant une purge (humain seulement). Sans `table`, rend les
 *   comptes par table ; avec `table`, rend les lignes de cette table pour l'entreprise de la route, par pages
 *   (`decalage`, `limite`, `suivant`). Les lignes sont rendues telles que stockées : les colonnes déjà chiffrées
 *   (« chv1. ») restent chiffrées, rien n'est déchiffré. Le script `exporter --entreprise` s'en sert, et `purger`
 *   refuse de supprimer si cet export est absent ou ne correspond pas aux comptes de la purge à blanc.
 *
 * L'entreprise vient toujours de la résolution de route par l'hôte ; un corps qui en désigne une autre est
 * refusé. La suppression de l'entreprise côté socle (et les fichiers disque) relève du script `purger`.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import { erreur, erreurValidation } from "./erreurs.js";

/**
 * Toutes les tables du plugin qui portent `company_id` (migrations 001 à 011). Un test relit les migrations
 * et échoue si une table s'ajoute sans figurer ici : une purge incomplète serait un défaut de conformité.
 */
export const TABLES_PURGE: readonly string[] = [
  "reglages_entreprise", "campagnes", "briefs", "exigences", "portes", "couvertures", "verdicts", "constats", "evaluations_porte",
  "messages", "sources", "imports", "decisions_humaines", "diffusions", "journal", "marques", "planifications", "mesures",
  "relances_correction", "appels_proposes", "prospects", "prospects_empreintes", "poids_score", "etalonnages", "prospects_scores",
  "bases_legales", "oppositions", "listes_dncm", "dncm_empreintes", "bases_clients_imports", "clients", "regles_ventes_croisees",
  "clients_empreintes", "issues_commerciales", "exports_crm", "connaissances_index", "connaissances_documents",
  "connaissances_versions", "connaissances_passages", "corbeille", "reglages_leads", "corrections_criteres", "evaluations_criteres",
];

export type ComptesPurge = Record<string, number>;

/** Accès en base ; les tests le remplacent par une version en mémoire. */
export interface StockPurge {
  compter(companyId: string): Promise<ComptesPurge>;
  /** Lignes d'une table de TABLES_PURGE pour l'entreprise, triées de façon stable, telles que stockées (rien n'est déchiffré). */
  lire(companyId: string, table: string, decalage: number, limite: number): Promise<unknown[]>;
  supprimer(companyId: string): Promise<void>;
}

export interface DependancesPurge {
  ctx: PluginContext;
  stock?: StockPurge;
}

const PurgeEntree = z.object({ companyId: IdNatif, confirmer: z.boolean().optional(), aBlanc: z.boolean().optional() }).strict();

/** Lignes par page de l'export : bornées pour que la réponse reste de taille raisonnable. */
export const LIMITE_EXPORT_DEFAUT = 500;
export const LIMITE_EXPORT_MAX = 1000;

const ExportEntree = z.object({
  companyId: IdNatif,
  table: z.string().optional(),
  decalage: z.number().int().min(0).optional(),
  limite: z.number().int().min(1).max(LIMITE_EXPORT_MAX).optional(),
}).strict();

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

export function creerStockPurge(db: PluginContext["db"]): StockPurge {
  const ns = db.namespace;
  return {
    async compter(companyId) {
      const comptes: ComptesPurge = {};
      for (const table of TABLES_PURGE) {
        const [r] = await db.query<{ n: number | string }>(`select count(*)::int as n from ${ns}.${table} where company_id = $1`, [companyId]);
        comptes[table] = Number(r?.n ?? 0);
      }
      return comptes;
    },
    async lire(companyId, table, decalage, limite) {
      // Le nom de table vient de TABLES_PURGE (jamais d'une entrée) ; to_jsonb rend les colonnes telles que stockées.
      if (!TABLES_PURGE.includes(table)) erreur("entree_invalide", `Table inconnue : ${table}.`);
      const lignes = await db.query<{ ligne: unknown }>(
        `select to_jsonb(t) as ligne from ${ns}.${table} t where company_id = $1 order by to_jsonb(t)::text offset $2 limit $3`,
        [companyId, decalage, limite]);
      return lignes.map((l) => l.ligne);
    },
    async supprimer(companyId) {
      // Les clés étrangères entre tables du plugin sont toutes en cascade ou en « SET NULL » : l'ordre est sans effet.
      for (const table of [...TABLES_PURGE].reverse()) await db.execute(`delete from ${ns}.${table} where company_id = $1`, [companyId]);
    },
  };
}

function stockParDefaut(ctx: PluginContext): StockPurge {
  let reel: StockPurge | null = null;
  const base = (): StockPurge => {
    if (!(ctx as { db?: unknown }).db) erreur("erreur_interne", "Base du plugin indisponible : purge impossible.");
    return (reel ??= creerStockPurge(ctx.db));
  };
  return { compter: (c) => base().compter(c), lire: (c, t, d, l) => base().lire(c, t, d, l), supprimer: (c) => base().supprimer(c) };
}

export function routesPurge(d: DependancesPurge): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const stock = d.stock ?? stockParDefaut(d.ctx);
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["donnees.purger"] = async (r) => {
    exigerHumain(r.acteur, "La purge des données d'une entreprise");
    const c = (r.corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    const p = PurgeEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Purge des données", p.error.issues);
    const aBlanc = p.data.aBlanc === true;
    if (!aBlanc && p.data.confirmer !== true) erreur("entree_invalide", 'Confirmation requise : envoyez {"confirmer": true} (ou {"aBlanc": true} pour compter sans rien supprimer).');
    const comptes = await stock.compter(r.companyId);
    const total = Object.values(comptes).reduce((s, n) => s + n, 0);
    if (!aBlanc) {
      await stock.supprimer(r.companyId);
      const reste = await stock.compter(r.companyId);
      const restantes = Object.entries(reste).filter(([, n]) => n > 0).map(([t, n]) => `${t} (${n})`);
      if (restantes.length > 0) erreur("erreur_interne", `Purge incomplète, il reste des lignes : ${restantes.join(", ")}.`);
      d.ctx.logger.info("Purge des données de l'entreprise terminée", { companyId: r.companyId, acteur: r.acteur.id, lignes: total, tables: TABLES_PURGE.length });
    }
    return { corps: { companyId: r.companyId, aBlanc, supprime: !aBlanc, total, tables: comptes } };
  };

  routes["donnees.exporter"] = async (r) => {
    exigerHumain(r.acteur, "L'export des données d'une entreprise");
    const c = (r.corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    const p = ExportEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Export des données", p.error.issues);
    const comptes = await stock.compter(r.companyId);
    if (p.data.table === undefined) {
      return { corps: { companyId: r.companyId, total: Object.values(comptes).reduce((s, n) => s + n, 0), tables: comptes } };
    }
    const table = p.data.table;
    if (!TABLES_PURGE.includes(table)) erreur("entree_invalide", `Table inconnue : ${table}.`);
    const decalage = p.data.decalage ?? 0;
    const limite = p.data.limite ?? LIMITE_EXPORT_DEFAUT;
    const lignes = await stock.lire(r.companyId, table, decalage, limite);
    const total = comptes[table] ?? 0;
    const suivant = decalage + lignes.length < total && lignes.length > 0 ? decalage + lignes.length : null;
    return { corps: { companyId: r.companyId, table, total, decalage, limite, lignes, suivant } };
  };

  return routes;
}
