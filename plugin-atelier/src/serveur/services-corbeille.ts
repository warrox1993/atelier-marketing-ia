/**
 * Corbeille de l'atelier (humain seulement).
 *
 * - `corbeille.lister` : ce qui est à la corbeille, avec la date de purge prévue (30 jours après la
 *   suppression). Les éléments dont la date est passée sont purgés au passage.
 * - `corbeille.supprimer` : met une tâche, un document de connaissances ou un prospect à la corbeille.
 *   Rien n'est détruit : un document ou un prospect est masqué (colonne `corbeille_le`, ignorée par les
 *   listes, la recherche et les exports) ; une tâche passe au statut « annulée » (le SDK des plugins
 *   n'expose pas le masquage natif `hiddenAt`) et son statut d'avant est mémorisé.
 * - `corbeille.restaurer` : remet l'élément comme avant.
 * - `corbeille.vider` : suppression réelle des documents et des prospects de la corbeille, sur
 *   confirmation explicite (`{"confirmer": true}`). Une tâche ne se supprime pas réellement : elle reste
 *   annulée et quitte seulement la corbeille.
 *
 * L'entreprise vient toujours de la résolution de route par l'hôte ; un corps qui en désigne une autre
 * est refusé. Chaque opération est journalisée.
 */
import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { ErreurAtelier, erreur, erreurValidation } from "./erreurs.js";

export const DELAI_PURGE_JOURS = 30;
const JOUR_MS = 24 * 60 * 60 * 1000;

export type TypeCorbeille = "tache" | "document" | "prospect";
export const LIBELLES_TYPE: Readonly<Record<TypeCorbeille, string>> = { tache: "Tâche", document: "Document de connaissances", prospect: "Prospect" };

export interface ElementCorbeille {
  id: string;
  companyId: string;
  type: TypeCorbeille;
  elementId: string;
  titre: string;
  /** Ce qu'il faut pour tout remettre comme avant (tâche : `{ statut }`). */
  etatAvant: Record<string, unknown>;
  supprimePar: string;
  supprimeLe: string;
  purgePrevueLe: string;
}

/** Accès en base (migration 009) ; les tests le remplacent par une version en mémoire. */
export interface StockCorbeille {
  lister(companyId: string): Promise<ElementCorbeille[]>;
  lire(companyId: string, type: TypeCorbeille, elementId: string): Promise<ElementCorbeille | null>;
  inserer(e: ElementCorbeille): Promise<void>;
  retirer(companyId: string, id: string): Promise<void>;
  /** Titre d'un document ou d'un prospect de l'entreprise et son état de masquage ; `null` s'il n'existe pas. */
  lireCible(companyId: string, type: "document" | "prospect", elementId: string): Promise<{ titre: string; masque: boolean } | null>;
  /** Masque (date) ou démasque (`null`) un document ou un prospect. */
  masquer(companyId: string, type: "document" | "prospect", elementId: string, quand: string | null): Promise<number>;
  /** Suppression réelle d'un prospect (ses empreintes, scores, bases légales et issues partent en cascade). */
  supprimerProspect(companyId: string, elementId: string): Promise<number>;
}

type Issue = NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;

export interface DependancesCorbeille {
  ctx: PluginContext;
  base: BaseAtelier;
  /** Routes des connaissances : la purge d'un document passe par `connaissances.supprimer` (journal, cache, tâches citantes). */
  routesConnaissances: Partial<Record<CleRouteApi, GestionnaireRoute>>;
  /** Tests : stock en mémoire ; par défaut, la base du plugin (`ctx.db`). */
  stock?: StockCorbeille;
  maintenant?: () => Date;
}

/* ------------------------------------------------------------------ */
/* Entrées                                                             */
/* ------------------------------------------------------------------ */

const TypeElement = z.enum(["tache", "document", "prospect"]);
const ElementEntree = z.object({ companyId: IdNatif, type: TypeElement, id: IdNatif }).strict();
const ViderEntree = z.object({ companyId: IdNatif, confirmer: z.boolean().optional() }).strict();

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

/* ------------------------------------------------------------------ */
/* Stock réel                                                          */
/* ------------------------------------------------------------------ */

type Db = PluginContext["db"];
type Ligne = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export function creerStockCorbeille(db: Db): StockCorbeille {
  const ns = db.namespace;
  const q = (sql: string, params: unknown[]) => db.query<Ligne>(sql, params);
  const x = async (sql: string, params: unknown[]) => (await db.execute(sql, params)).rowCount;
  const COLONNES = "id, company_id, type, element_id, titre, etat_avant, supprime_par, supprime_le, purge_prevue_le";
  const element = (r: Ligne): ElementCorbeille => {
    const brut = r.etat_avant;
    let etat: unknown = brut;
    if (typeof brut === "string") {
      try {
        etat = JSON.parse(brut);
      } catch {
        etat = {};
      }
    }
    return {
      id: String(r.id), companyId: String(r.company_id), type: r.type as TypeCorbeille, elementId: String(r.element_id), titre: String(r.titre),
      etatAvant: typeof etat === "object" && etat !== null && !Array.isArray(etat) ? (etat as Record<string, unknown>) : {},
      supprimePar: String(r.supprime_par), supprimeLe: iso(r.supprime_le), purgePrevueLe: iso(r.purge_prevue_le),
    };
  };
  return {
    async lister(companyId) {
      return (await q(`select ${COLONNES} from ${ns}.corbeille where company_id = $1 order by supprime_le desc, id asc`, [companyId])).map(element);
    },
    async lire(companyId, type, elementId) {
      const [r] = await q(`select ${COLONNES} from ${ns}.corbeille where company_id = $1 and type = $2 and element_id = $3`, [companyId, type, elementId]);
      return r ? element(r) : null;
    },
    async inserer(e) {
      await x(
        `insert into ${ns}.corbeille (id, company_id, type, element_id, titre, etat_avant, supprime_par, supprime_le, purge_prevue_le) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::timestamptz)`,
        [e.id, e.companyId, e.type, e.elementId, e.titre, JSON.stringify(e.etatAvant), e.supprimePar, e.supprimeLe, e.purgePrevueLe],
      );
    },
    async retirer(companyId, id) {
      await x(`delete from ${ns}.corbeille where company_id = $1 and id = $2`, [companyId, id]);
    },
    async lireCible(companyId, type, elementId) {
      if (type === "document") {
        const [r] = await q(`select titre, corbeille_le from ${ns}.connaissances_documents where company_id = $1 and id = $2`, [companyId, elementId]);
        return r ? { titre: String(r.titre), masque: r.corbeille_le != null } : null;
      }
      const [r] = await q(`select denomination, cible, corbeille_le from ${ns}.prospects where company_id = $1 and id = $2`, [companyId, elementId]);
      if (!r) return null;
      const libelle = r.denomination ? String(r.denomination) : `${r.cible === "particulier" ? "Particulier" : "Prospect"} ${elementId.slice(0, 8)}`;
      return { titre: libelle, masque: r.corbeille_le != null };
    },
    async masquer(companyId, type, elementId, quand) {
      const table = type === "document" ? "connaissances_documents" : "prospects";
      return x(`update ${ns}.${table} set corbeille_le = $3::timestamptz where company_id = $1 and id = $2`, [companyId, elementId, quand]);
    },
    async supprimerProspect(companyId, elementId) {
      return x(`delete from ${ns}.prospects where company_id = $1 and id = $2`, [companyId, elementId]);
    },
  };
}

/** Sans `ctx.db` (bancs de test qui n'en déclarent pas), la corbeille est vide et refuse toute écriture. */
function stockParDefaut(ctx: PluginContext): StockCorbeille {
  let reel: StockCorbeille | null = null;
  const indisponible = async (): Promise<never> => erreur("erreur_interne", "Base du plugin indisponible : corbeille inutilisable.");
  const vide: StockCorbeille = {
    lister: async () => [], lire: async () => null, lireCible: async () => null,
    inserer: indisponible, retirer: indisponible, masquer: indisponible, supprimerProspect: indisponible,
  };
  return new Proxy(vide, {
    get(cible, cle) {
      if (!(ctx as { db?: unknown }).db) return cible[cle as keyof StockCorbeille];
      reel ??= creerStockCorbeille(ctx.db);
      return reel[cle as keyof StockCorbeille];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function routesCorbeille(d: DependancesCorbeille): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const stock = d.stock ?? stockParDefaut(ctx);
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  const memeEntreprise = (corps: unknown, companyId: string) => {
    const c = (corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
  };

  const ligne = (e: ElementCorbeille) => ({
    id: e.id, type: e.type, typeLibelle: LIBELLES_TYPE[e.type], elementId: e.elementId, titre: e.titre, supprimePar: e.supprimePar,
    supprimeLe: e.supprimeLe, purgePrevueLe: e.purgePrevueLe,
    joursRestants: Math.max(0, Math.ceil((new Date(e.purgePrevueLe).getTime() - maintenant().getTime()) / JOUR_MS)),
  });

  /** Suppression réelle d'un élément de la corbeille, puis sortie de la corbeille. */
  async function purger(companyId: string, e: ElementCorbeille, acteur: ActeurHote): Promise<void> {
    let dejaSupprime = false;
    if (e.type === "document") {
      const supprimer = d.routesConnaissances["connaissances.supprimer"];
      if (!supprimer) erreur("erreur_interne", "Suppression des connaissances indisponible.");
      try {
        await supprimer({
          cle: "connaissances.supprimer", params: {}, query: {}, acteur, companyId,
          corps: { companyId, portee: { type: "document", documentId: e.elementId }, motif: "Purge de la corbeille" },
        });
      } catch (err) {
        // Document déjà supprimé autrement : la ligne de corbeille est retirée quand même, sinon la purge échouerait à chaque appel.
        if (!(err instanceof ErreurAtelier) || err.code !== "introuvable") throw err;
        dejaSupprime = true;
      }
    } else if (e.type === "prospect") {
      await stock.supprimerProspect(companyId, e.elementId);
    }
    await stock.retirer(companyId, e.id);
    await base.journaliser({
      companyId, type: "corbeille.purge", entite: e.type, entiteId: e.elementId, acteur: acteur.id,
      donnees: { titre: e.titre, reelle: e.type !== "tache" && !dejaSupprime, ...(dejaSupprime ? { dejaSupprime: true } : {}) },
    });
  }

  routes["corbeille.lister"] = async (r) => {
    exigerHumain(r.acteur, "La corbeille");
    let elements = await stock.lister(r.companyId);
    // Purge à J+30 : faite au passage, sans tâche de fond.
    const echus = elements.filter((e) => new Date(e.purgePrevueLe).getTime() <= maintenant().getTime());
    for (const e of echus) await purger(r.companyId, e, r.acteur);
    if (echus.length > 0) elements = elements.filter((e) => !echus.includes(e));
    return { corps: { companyId: r.companyId, delaiPurgeJours: DELAI_PURGE_JOURS, elements: elements.map(ligne), purges: echus.length } };
  };

  routes["corbeille.supprimer"] = async (r) => {
    exigerHumain(r.acteur, "La suppression");
    memeEntreprise(r.corps, r.companyId);
    const p = ElementEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Mise à la corbeille", p.error.issues);
    const { type, id } = p.data;
    if (await stock.lire(r.companyId, type, id)) erreur("conflit", "Cet élément est déjà à la corbeille.");
    let titre: string;
    let etatAvant: Record<string, unknown> = {};
    if (type === "tache") {
      const issue: Issue | null = await ctx.issues.get(id, r.companyId);
      if (!issue || issue.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("introuvable", "Tâche introuvable dans cette entreprise.");
      if (issue.status === "cancelled") erreur("conflit", "Cette tâche est déjà annulée.");
      titre = `${issue.identifier ? `${issue.identifier} · ` : ""}${issue.title}`;
      etatAvant = { statut: issue.status };
      await ctx.issues.update(issue.id, { status: "cancelled" }, r.companyId, r.acteur.userId ? { actorUserId: r.acteur.userId } : undefined);
    } else {
      const cible = await stock.lireCible(r.companyId, type, id);
      if (!cible) erreur("introuvable", type === "document" ? "Document introuvable dans cette entreprise." : "Prospect introuvable dans cette entreprise.");
      if (cible.masque) erreur("conflit", "Cet élément est déjà à la corbeille.");
      titre = cible.titre;
      await stock.masquer(r.companyId, type, id, maintenant().toISOString());
    }
    const maintenantIso = maintenant().toISOString();
    const element: ElementCorbeille = {
      id: randomUUID(), companyId: r.companyId, type, elementId: id, titre, etatAvant, supprimePar: r.acteur.userId ?? r.acteur.id,
      supprimeLe: maintenantIso, purgePrevueLe: new Date(maintenant().getTime() + DELAI_PURGE_JOURS * JOUR_MS).toISOString(),
    };
    await stock.inserer(element);
    await base.journaliser({ companyId: r.companyId, type: "corbeille.supprime", entite: type, entiteId: id, issueId: type === "tache" ? id : null, acteur: r.acteur.id, donnees: { titre } });
    return { statut: 201, corps: ligne(element) };
  };

  routes["corbeille.restaurer"] = async (r) => {
    exigerHumain(r.acteur, "La restauration");
    memeEntreprise(r.corps, r.companyId);
    const p = ElementEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Restauration", p.error.issues);
    const { type, id } = p.data;
    const e = await stock.lire(r.companyId, type, id);
    if (!e) erreur("introuvable", "Cet élément n'est pas à la corbeille.");
    if (type === "tache") {
      const issue = await ctx.issues.get(id, r.companyId);
      if (issue && issue.status === "cancelled") {
        const avant = typeof e.etatAvant.statut === "string" ? e.etatAvant.statut : "todo";
        await ctx.issues.update(issue.id, { status: avant as Issue["status"] }, r.companyId, r.acteur.userId ? { actorUserId: r.acteur.userId } : undefined);
      }
    } else {
      await stock.masquer(r.companyId, type, id, null);
    }
    await stock.retirer(r.companyId, e.id);
    await base.journaliser({ companyId: r.companyId, type: "corbeille.restaure", entite: type, entiteId: id, issueId: type === "tache" ? id : null, acteur: r.acteur.id, donnees: { titre: e.titre } });
    return { corps: { restaure: ligne(e) } };
  };

  routes["corbeille.vider"] = async (r) => {
    exigerHumain(r.acteur, "Le vidage de la corbeille");
    memeEntreprise(r.corps, r.companyId);
    const p = ViderEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Vidage de la corbeille", p.error.issues);
    if (p.data.confirmer !== true) erreur("entree_invalide", 'Confirmation requise : envoyez {"confirmer": true} pour supprimer définitivement le contenu de la corbeille.');
    const elements = await stock.lister(r.companyId);
    for (const e of elements) await purger(r.companyId, e, r.acteur);
    return { corps: { companyId: r.companyId, purges: elements.length, parType: { tache: elements.filter((e) => e.type === "tache").length, document: elements.filter((e) => e.type === "document").length, prospect: elements.filter((e) => e.type === "prospect").length } } };
  };

  return routes;
}
