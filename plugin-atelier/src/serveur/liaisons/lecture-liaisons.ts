/**
 * Lectures du bureau de liaison pour les humains (lot L7) : liaisons d'une tâche (côté source ou côté cible) et
 * registre d'un client. Interface remplaçable par une version en mémoire dans les tests ; la version SQL n'utilise que
 * des paramètres liés (aucune valeur d'entrée n'est insérée dans le texte SQL).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { ESPACE_BASE, type ExtraitLiaison, type StatutLiaison } from "../../contrats/index.js";
import { iso } from "../base.js";

/** Liaison lue, avec les champs nécessaires aux vues (jamais la clé d'idempotence ni l'auteur). */
export interface LiaisonLue {
  id: string;
  entrepriseSource: string;
  entrepriseCible: string;
  tacheOrigine: string;
  tacheCible: string | null;
  serviceSource: string;
  serviceCible: string;
  objet: string;
  question: string;
  extraits: ExtraitLiaison[];
  statut: StatutLiaison;
  creeLe: string;
  reponduLe: string | null;
  reponse?: string;
}

export interface CritereRegistre {
  service?: string;
  statut?: StatutLiaison;
  /** Jours AAAA-MM-JJ, heure de Bruxelles, bornes incluses. */
  du?: string;
  au?: string;
}

export interface LectureLiaisons {
  /** Liaisons dont la tâche est la tâche d'origine (entreprise source) OU la tâche cible (entreprise cible). */
  parTache(companyId: string, issueId: string): Promise<LiaisonLue[]>;
  /** Liaisons dont l'entreprise source appartient à ce client, les plus récentes d'abord. */
  registre(clientMarqueur: string, critere: CritereRegistre, limite: number, decalage: number): Promise<{ lignes: LiaisonLue[]; total: number }>;
}

type Ligne = Record<string, unknown>;

function extraitsDe(v: unknown): ExtraitLiaison[] {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return [];
    }
  }
  return Array.isArray(x) ? (x as ExtraitLiaison[]) : [];
}

const enLue = (r: Ligne): LiaisonLue => ({
  id: String(r["id"]),
  entrepriseSource: String(r["company_id"]),
  entrepriseCible: String(r["entreprise_cible_id"]),
  tacheOrigine: String(r["tache_origine_id"]),
  tacheCible: r["tache_cible_id"] == null ? null : String(r["tache_cible_id"]),
  serviceSource: String(r["service_source"]),
  serviceCible: String(r["service_cible"]),
  objet: String(r["objet"]),
  question: String(r["question"]),
  extraits: extraitsDe(r["extraits"]),
  statut: String(r["statut"]) as StatutLiaison,
  creeLe: iso(r["cree_le"]),
  reponduLe: r["repondu_le"] == null ? null : iso(r["repondu_le"]),
  ...(r["reponse"] == null ? {} : { reponse: String(r["reponse"]) }),
});

export function creerLectureLiaisons(db: PluginContext["db"]): LectureLiaisons {
  const ns = db.namespace;
  if (ns !== ESPACE_BASE) throw new Error(`Espace de base inattendu : ${ns}`);
  const q = <T = Ligne>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
  return {
    async parTache(companyId, issueId) {
      const lignes = await q(
        `select * from ${ns}.liaisons
         where (company_id = $1 and tache_origine_id = $2) or (entreprise_cible_id = $1 and tache_cible_id = $2)
         order by cree_le, id limit 50`,
        [companyId, issueId],
      );
      return lignes.map(enLue);
    },
    async registre(clientMarqueur, critere, limite, decalage) {
      const params: unknown[] = [clientMarqueur];
      const conditions = [`company_id in (select company_id from ${ns}.services_entreprises where client_marqueur = $1)`];
      const lier = (v: unknown) => `$${params.push(v)}`;
      if (critere.service) {
        const p = lier(critere.service);
        conditions.push(`(service_source = ${p} or service_cible = ${p})`);
      }
      if (critere.statut) conditions.push(`statut = ${lier(critere.statut)}`);
      if (critere.du) conditions.push(`cree_le >= (${lier(critere.du)}::date)::timestamp at time zone 'Europe/Brussels'`);
      if (critere.au) conditions.push(`cree_le < ((${lier(critere.au)}::date + 1))::timestamp at time zone 'Europe/Brussels'`);
      const ou = conditions.join(" and ");
      const [compte] = await q<{ n: number | string }>(`select count(*)::int as n from ${ns}.liaisons where ${ou}`, [...params]);
      const lignes = await q(`select * from ${ns}.liaisons where ${ou} order by cree_le desc, id limit ${lier(limite)} offset ${lier(decalage)}`, params);
      return { lignes: lignes.map(enLue), total: Number(compte?.n ?? 0) };
    },
  };
}

/** Lecture à création différée : le contexte des tests n'a pas toujours de base, l'accès échoue alors proprement. */
export function lectureLiaisonsParesseuse(ctx: PluginContext): LectureLiaisons {
  let reel: LectureLiaisons | null = null;
  const p = (): LectureLiaisons => (reel ??= creerLectureLiaisons(ctx.db));
  return { parTache: (c, i) => p().parTache(c, i), registre: (m, c, l, d) => p().registre(m, c, l, d) };
}
