/**
 * Accès en base du bureau de liaison (migration 012) : services des entreprises, matrice des flux et
 * liaisons. Interface `StockLiaisons` remplaçable par une version en mémoire dans les tests.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { ESPACE_BASE, origineDepuisObjet, type ExtraitLiaison, type FluxService, type LiaisonEnregistree, type OrigineFlux, type StatutLiaison } from "../../contrats/index.js";
import { iso } from "../base.js";

export interface ServiceEntreprise {
  companyId: string;
  clientMarqueur: string;
  serviceSlug: string;
  estDirection: boolean;
}

export interface FluxLu {
  objet: string;
  approbationHumaine: boolean;
}

/** Liaison telle que stockée, avec les champs internes (service, clé d'idempotence, interaction). */
export interface LiaisonStockee extends LiaisonEnregistree {
  serviceSource: string;
  serviceCible: string;
  question: string;
  cleIdempotence: string;
  interactionId: string | null;
  demandePar: string;
  /** File de sortie (migration 013) : essais déjà faits par le facteur pour l'étape en cours. */
  facteurEssais?: number;
  /** Date du commentaire de réponse posé sur la tâche d'origine (null tant que la source n'est pas notifiée). */
  sourceNotifieeLe?: string | null;
  /**
   * Migration 017 : services traversés par la chaîne de liaisons, du premier demandeur au service visé inclus,
   * dérivée de la tâche d'origine ET de ses ancêtres.
   */
  chaine: string[];
  /** Nombre de relais de la chaîne (1 pour une demande directe), au plus `LIMITES_LIAISON.relaisMax`. */
  profondeur: number;
  /** La liaison a exigé l'approbation humaine (flux sensible ou tâche d'origine teintée). */
  approbationRequise: boolean;
  /** La réponse recopiée sur la tâche d'origine vient d'une liaison approuvée : cette tâche est teintée. */
  teinteRetour?: boolean;
}

/** Liaison reçue par une tâche (ou un de ses ancêtres) : ce qu'il faut pour prolonger sa chaîne. */
export interface LiaisonEntrante {
  chaine: string[];
  profondeur: number;
  approbationRequise: boolean;
}

export interface StockLiaisons {
  /** Service déclaré ET CONFIRMÉ pour cette entreprise, ou null (une ligne « à confirmer » est ignorée, faille E1). */
  serviceDeEntreprise(companyId: string): Promise<ServiceEntreprise | null>;
  /** Vrai si au moins une entreprise CONFIRMÉE est déjà déclarée sous ce marqueur de client. */
  clientExiste(clientMarqueur: string): Promise<boolean>;
  /** Toutes les entreprises confirmées déclarées sous ce slug (tous clients confondus). */
  servicesParSlug(slug: string): Promise<ServiceEntreprise[]>;
  /** Services confirmés de CE client seulement (tableau des départements), au plus 200. */
  servicesDuClient(clientMarqueur: string): Promise<ServiceEntreprise[]>;
  lireFlux(clientMarqueur: string, source: string, cible: string): Promise<FluxLu | null>;
  /** Tous les flux déclarés de CE client seulement (vue Organigramme), au plus 2 000. */
  fluxDuClient(clientMarqueur: string): Promise<Array<FluxService & { origine: OrigineFlux }>>;
  /**
   * Remplace la déclaration d'un client (entreprises et flux). `confirmee` : l'accès de l'humain à cette entreprise est
   * prouvé (c'est l'entreprise de la route, ou déjà un membre confirmé du client) ; sinon la ligne reste « à confirmer »
   * jusqu'à `confirmer`. Une ligne déjà confirmée du même client le reste ; une ligne « à confirmer » d'un autre client
   * est reprise, une ligne confirmée d'un autre client n'est jamais touchée.
   */
  declarer(d: { clientMarqueur: string; entreprises: Array<{ companyId: string; serviceSlug: string; estDirection: boolean; confirmee: boolean }>; flux: FluxService[]; par: string }): Promise<void>;
  /** Confirme la ligne « à confirmer » de cette entreprise ; vrai si une ligne vient d'être confirmée (faux : absente ou déjà confirmée). */
  confirmer(companyId: string): Promise<boolean>;
  lireParCle(companyId: string, cleIdempotence: string): Promise<LiaisonStockee | null>;
  /** Liaisons ouvertes ou en attente d'approbation dont l'entreprise est la source. */
  compterOuvertes(companyId: string): Promise<number>;
  /** Vrai si cette tâche a été créée par une liaison dans cette entreprise (tâche de liaison côté cible). */
  estTacheDeLiaison(companyId: string, issueId: string): Promise<boolean>;
  /** Liaisons dont l'une de ces tâches (la tâche d'origine et ses ancêtres) est la tâche cible, côté entreprise CIBLE. */
  liaisonsEntrantes(companyId: string, issueIds: readonly string[]): Promise<LiaisonEntrante[]>;
  /** Vrai si l'une de ces tâches a reçu la réponse d'une liaison approuvée (teinte), côté entreprise SOURCE. */
  retourTeinte(companyId: string, issueIds: readonly string[]): Promise<boolean>;
  /**
   * Relais par prudence (tâche racine) : liaisons dont cette entreprise est la CIBLE, déjà transmises (tâche reçue
   * créée) et encore `ouverte` (tâche reçue ni terminée ni annulée), quelle que soit la tâche d'où part la demande.
   */
  liaisonsEntrantesOuvertes(companyId: string): Promise<LiaisonEntrante[]>;
  /**
   * Teinte par prudence (tâche racine) : réponses teintées reçues par cette entreprise SOURCE, les plus récentes
   * d'abord, au plus `limite`. `recente` : reçue depuis moins de `fenetreJours` jours (ou date inconnue).
   */
  retoursTeintesDe(companyId: string, fenetreJours: number, limite: number): Promise<Array<{ tacheOrigine: string; recente: boolean }>>;
  inserer(l: LiaisonStockee): Promise<void>;
  /** Liaison de cette entreprise SOURCE, par identifiant. */
  lireParId(companyId: string, id: string): Promise<LiaisonStockee | null>;
  /** Liaison dont cette tâche est la tâche cible, côté entreprise CIBLE. */
  lireParTacheCible(entrepriseCible: string, tacheCible: string): Promise<LiaisonStockee | null>;
  /** Liaisons en attente d'approbation de cette entreprise source, les plus anciennes d'abord. */
  listerEnAttente(companyId: string, limite: number): Promise<LiaisonStockee[]>;
  /**
   * Changement de statut conditionnel (comparer et échanger) : n'agit que si le statut actuel figure dans `depuis`.
   * Rend vrai pour l'unique appelant qui a effectué la transition (idempotence face aux rejeux et aux courses).
   */
  transiter(companyId: string, id: string, depuis: readonly StatutLiaison[], vers: { statut: StatutLiaison; reponse?: string | null; repondu?: boolean; /** Marque la teinte de la réponse (jamais retirée). */ teinte?: boolean }): Promise<boolean>;
  /** Fixe la tâche cible et l'identifiant de carte d'une liaison existante (une tâche cible remet les essais du facteur à zéro). */
  attacher(companyId: string, id: string, champs: { tacheCible?: string; interactionId?: string; statut?: StatutLiaison }): Promise<void>;
  /**
   * File de sortie, toutes entreprises confondues (lue par le facteur hors invocation) : liaisons `ouverte` sans tâche
   * cible dont l'essai suivant est dû et sous le plafond d'essais, les plus anciennes d'abord.
   */
  listerATransmettre(limite: number, essaisMax: number): Promise<LiaisonStockee[]>;
  /**
   * File de sortie : liaisons `ouverte` ou `en_attente_approbation` dont l'entreprise cible a été supprimée
   * (`entreprise_cible_id` NULL), transmises ou non, à clôturer en `cible_supprimee`.
   */
  listerCibleSupprimee(limite: number, essaisMax: number): Promise<LiaisonStockee[]>;
  /** File de sortie : liaisons `repondue` ou `annulee` dont la tâche d'origine n'a pas encore reçu la réponse. */
  listerANotifier(limite: number, essaisMax: number): Promise<LiaisonStockee[]>;
  /**
   * Réserve un essai (comparer et échanger) : incrémente le compteur et repousse l'essai suivant de `attenteMs`.
   * Faux si l'essai n'est pas dû, si le plafond est atteint ou si un autre traitement l'a déjà pris.
   */
  reserverEssai(companyId: string, id: string, attenteMs: number, essaisMax: number): Promise<boolean>;
  /** Garde la dernière erreur du facteur (bornée à 500 caractères). */
  noterErreurFacteur(companyId: string, id: string, erreur: string): Promise<void>;
  /** Note que la source a reçu la réponse ; vrai pour l'unique appelant qui l'a fait. */
  marquerNotifiee(companyId: string, id: string): Promise<boolean>;
  /** Remet les essais du facteur à zéro (rejeu explicite de la demande ou de la décision). */
  relancerFacteur(companyId: string, id: string): Promise<void>;
}

type Ligne = Record<string, unknown>;

const enService = (r: Ligne): ServiceEntreprise => ({
  companyId: String(r["company_id"]),
  clientMarqueur: String(r["client_marqueur"]),
  serviceSlug: String(r["service_slug"]),
  estDirection: r["est_direction"] === true,
});

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

function chaineDe(v: unknown): string[] {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return [];
    }
  }
  return Array.isArray(x) ? x.filter((e): e is string => typeof e === "string") : [];
}

const enLiaison = (r: Ligne): LiaisonStockee => ({
  id: String(r["id"]),
  entrepriseSource: String(r["company_id"]),
  entrepriseCible: r["entreprise_cible_id"] == null ? null : String(r["entreprise_cible_id"]),
  tacheOrigine: String(r["tache_origine_id"]),
  tacheCible: r["tache_cible_id"] == null ? null : String(r["tache_cible_id"]),
  statut: String(r["statut"]) as StatutLiaison,
  objet: String(r["objet"]),
  extraits: extraitsDe(r["extraits"]),
  creeLe: iso(r["cree_le"]),
  reponduLe: r["repondu_le"] == null ? null : iso(r["repondu_le"]),
  ...(r["reponse"] == null ? {} : { reponse: String(r["reponse"]) }),
  serviceSource: String(r["service_source"]),
  serviceCible: String(r["service_cible"]),
  question: String(r["question"]),
  cleIdempotence: String(r["cle_idempotence"]),
  interactionId: r["interaction_id"] == null ? null : String(r["interaction_id"]),
  demandePar: String(r["demande_par"]),
  facteurEssais: Number(r["facteur_essais"] ?? 0),
  sourceNotifieeLe: r["source_notifiee_le"] == null ? null : iso(r["source_notifiee_le"]),
  ...enEntrante(r),
  teinteRetour: r["teinte_retour"] === true,
});

/** Une ligne sans chaîne (antérieure à la migration 017, en principe reprise par elle) garde ses deux services. */
function enEntrante(r: Ligne): LiaisonEntrante {
  const chaine = chaineDe(r["chaine"]);
  return {
    chaine: chaine.length > 0 ? chaine : [String(r["service_source"]), String(r["service_cible"])],
    profondeur: Math.max(1, Number(r["profondeur"] ?? 1) || 1),
    approbationRequise: r["approbation_requise"] === true,
  };
}

export function creerStockLiaisons(db: PluginContext["db"]): StockLiaisons {
  const ns = db.namespace;
  if (ns !== ESPACE_BASE) throw new Error(`Espace de base inattendu : ${ns}`);
  const q = <T = Ligne>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
  return {
    async serviceDeEntreprise(companyId) {
      const [r] = await q(`select company_id, client_marqueur, service_slug, est_direction from ${ns}.services_entreprises where company_id = $1 and confirme_le is not null`, [companyId]);
      return r ? enService(r) : null;
    },
    async clientExiste(clientMarqueur) {
      const [r] = await q<{ n: number | string }>(`select count(*)::int as n from ${ns}.services_entreprises where client_marqueur = $1 and confirme_le is not null`, [clientMarqueur]);
      return Number(r?.n ?? 0) > 0;
    },
    async servicesParSlug(slug) {
      return (await q(`select company_id, client_marqueur, service_slug, est_direction from ${ns}.services_entreprises where service_slug = $1 and confirme_le is not null limit 50`, [slug])).map(enService);
    },
    async servicesDuClient(clientMarqueur) {
      return (await q(`select company_id, client_marqueur, service_slug, est_direction from ${ns}.services_entreprises where client_marqueur = $1 and confirme_le is not null order by service_slug limit 200`, [clientMarqueur])).map(enService);
    },
    async lireFlux(clientMarqueur, source, cible) {
      const [r] = await q(`select objet, approbation_humaine from ${ns}.flux_services where client_marqueur = $1 and source_slug = $2 and cible_slug = $3`, [clientMarqueur, source, cible]);
      return r ? { objet: String(r["objet"]), approbationHumaine: r["approbation_humaine"] === true } : null;
    },
    async fluxDuClient(clientMarqueur) {
      const lignes = await q(`select source_slug, cible_slug, objet, approbation_humaine, origine from ${ns}.flux_services where client_marqueur = $1 order by source_slug, cible_slug limit 2000`, [clientMarqueur]);
      return lignes.map((r) => ({ source: String(r["source_slug"]), cible: String(r["cible_slug"]), objet: String(r["objet"]), approbationHumaine: r["approbation_humaine"] === true, origine: r["origine"] === "coordinateurs" ? "coordinateurs" : "metier" }));
    },
    async declarer(d) {
      for (const e of d.entreprises) {
        // Reprise d'une ligne : seulement si elle est du même client, ou si elle n'est pas confirmée (une ligne « à
        // confirmer » posée par un tiers ne bloque jamais la déclaration légitime). Une ligne confirmée du même client le reste.
        await db.execute(
          `insert into ${ns}.services_entreprises (company_id, client_marqueur, service_slug, est_direction, declare_par, confirme_le)
           values ($1, $2, $3, $4, $5, case when $6::boolean then now() else null end)
           on conflict (company_id) do update set
             confirme_le = case when ${ns}.services_entreprises.client_marqueur = excluded.client_marqueur and ${ns}.services_entreprises.confirme_le is not null
                                then ${ns}.services_entreprises.confirme_le else excluded.confirme_le end,
             client_marqueur = excluded.client_marqueur, service_slug = excluded.service_slug,
             est_direction = excluded.est_direction, declare_par = excluded.declare_par, declare_le = now()
           where ${ns}.services_entreprises.client_marqueur = excluded.client_marqueur or ${ns}.services_entreprises.confirme_le is null`,
          [e.companyId, d.clientMarqueur, e.serviceSlug, e.estDirection, d.par, e.confirmee],
        );
      }
      for (const f of d.flux) {
        await db.execute(
          `insert into ${ns}.flux_services (client_marqueur, source_slug, cible_slug, objet, approbation_humaine, origine)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (client_marqueur, source_slug, cible_slug) do update set objet = excluded.objet,
             approbation_humaine = excluded.approbation_humaine, origine = excluded.origine, declare_le = now()`,
          [d.clientMarqueur, f.source, f.cible, f.objet, f.approbationHumaine, f.origine ?? origineDepuisObjet(f.objet)],
        );
      }
      // Ménage seulement après les écritures : un échec en cours de route laisse un surensemble, jamais un trou.
      await db.execute(
        `delete from ${ns}.services_entreprises where client_marqueur = $1 and company_id::text not in (select jsonb_array_elements_text($2::jsonb))`,
        [d.clientMarqueur, JSON.stringify(d.entreprises.map((e) => e.companyId))],
      );
      await db.execute(
        `delete from ${ns}.flux_services where client_marqueur = $1 and (source_slug || '>' || cible_slug) not in (select jsonb_array_elements_text($2::jsonb))`,
        [d.clientMarqueur, JSON.stringify(d.flux.map((f) => `${f.source}>${f.cible}`))],
      );
    },
    async confirmer(companyId) {
      const { rowCount } = await db.execute(`update ${ns}.services_entreprises set confirme_le = now() where company_id = $1 and confirme_le is null`, [companyId]);
      return rowCount > 0;
    },
    async lireParCle(companyId, cle) {
      const [r] = await q(`select * from ${ns}.liaisons where company_id = $1 and cle_idempotence = $2`, [companyId, cle]);
      return r ? enLiaison(r) : null;
    },
    async compterOuvertes(companyId) {
      const [r] = await q<{ n: number | string }>(`select count(*)::int as n from ${ns}.liaisons where company_id = $1 and statut in ('ouverte', 'en_attente_approbation')`, [companyId]);
      return Number(r?.n ?? 0);
    },
    async estTacheDeLiaison(companyId, issueId) {
      const [r] = await q<{ n: number | string }>(`select count(*)::int as n from ${ns}.liaisons where entreprise_cible_id = $1 and tache_cible_id = $2`, [companyId, issueId]);
      return Number(r?.n ?? 0) > 0;
    },
    async liaisonsEntrantes(companyId, issueIds) {
      if (issueIds.length === 0) return [];
      // Liste en JSON : l'hôte aplatit un paramètre tableau.
      return (await q(
        `select service_source, service_cible, chaine, profondeur, approbation_requise from ${ns}.liaisons
          where entreprise_cible_id = $1 and tache_cible_id::text in (select jsonb_array_elements_text($2::jsonb))`,
        [companyId, JSON.stringify(issueIds.map((i) => i.toLowerCase()))],
      )).map(enEntrante);
    },
    async retourTeinte(companyId, issueIds) {
      if (issueIds.length === 0) return false;
      const [r] = await q<{ n: number | string }>(
        `select count(*)::int as n from ${ns}.liaisons
          where company_id = $1 and teinte_retour = true and tache_origine_id::text in (select jsonb_array_elements_text($2::jsonb))`,
        [companyId, JSON.stringify(issueIds.map((i) => i.toLowerCase()))],
      );
      return Number(r?.n ?? 0) > 0;
    },
    async liaisonsEntrantesOuvertes(companyId) {
      // Bornée par les plafonds des entreprises sources (5, ou 30 pour la Direction) : pas de limite propre.
      return (await q(
        `select service_source, service_cible, chaine, profondeur, approbation_requise from ${ns}.liaisons
          where entreprise_cible_id = $1 and statut = 'ouverte' and tache_cible_id is not null`,
        [companyId],
      )).map(enEntrante);
    },
    async retoursTeintesDe(companyId, fenetreJours, limite) {
      return (await q<{ tache_origine_id: string; recente: boolean | null }>(
        `select tache_origine_id, coalesce(repondu_le > now() - make_interval(days => $2::int), true) as recente from ${ns}.liaisons
          where company_id = $1 and teinte_retour = true order by repondu_le desc nulls first limit $3`,
        [companyId, fenetreJours, limite],
      )).map((r) => ({ tacheOrigine: String(r.tache_origine_id), recente: r.recente !== false }));
    },
    async inserer(l) {
      await db.execute(
        `insert into ${ns}.liaisons (id, company_id, entreprise_cible_id, service_source, service_cible, tache_origine_id, tache_cible_id, interaction_id,
           statut, objet, question, extraits, cle_idempotence, demande_par, chaine, profondeur, approbation_requise)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15::jsonb, $16, $17)`,
        [l.id, l.entrepriseSource, l.entrepriseCible, l.serviceSource, l.serviceCible, l.tacheOrigine, l.tacheCible, l.interactionId, l.statut, l.objet, l.question,
          JSON.stringify(l.extraits), l.cleIdempotence, l.demandePar, JSON.stringify(l.chaine), l.profondeur, l.approbationRequise],
      );
    },
    async lireParId(companyId, id) {
      const [r] = await q(`select * from ${ns}.liaisons where company_id = $1 and id = $2`, [companyId, id]);
      return r ? enLiaison(r) : null;
    },
    async lireParTacheCible(entrepriseCible, tacheCible) {
      const [r] = await q(`select * from ${ns}.liaisons where entreprise_cible_id = $1 and tache_cible_id = $2 order by cree_le limit 1`, [entrepriseCible, tacheCible]);
      return r ? enLiaison(r) : null;
    },
    async listerEnAttente(companyId, limite) {
      return (await q(`select * from ${ns}.liaisons where company_id = $1 and statut = 'en_attente_approbation' order by cree_le limit $2`, [companyId, limite])).map(enLiaison);
    },
    async transiter(companyId, id, depuis, vers) {
      // Écriture : `ctx.db.query` n'accepte que SELECT (constaté sur l'instance d'essai du 16/10/2026) ; on passe par
      // `execute` et on compte les lignes touchées. Zéro ligne : la liaison n'était plus dans l'un des états de départ.
      // La liste des états passe en JSON : l'hôte aplatit un paramètre tableau (un seul état donnait « malformed array literal »).
      const { rowCount } = await db.execute(
        `update ${ns}.liaisons set statut = $4, reponse = coalesce($5, reponse), repondu_le = case when $6::boolean then now() else repondu_le end,
           teinte_retour = teinte_retour or $7::boolean
         where company_id = $1 and id = $2 and statut in (select jsonb_array_elements_text($3::jsonb))`,
        [companyId, id, JSON.stringify([...depuis]), vers.statut, vers.reponse ?? null, vers.repondu === true, vers.teinte === true],
      );
      return rowCount > 0;
    },
    async attacher(companyId, id, champs) {
      await db.execute(
        `update ${ns}.liaisons set tache_cible_id = coalesce($3::uuid, tache_cible_id), interaction_id = coalesce($4, interaction_id), statut = coalesce($5, statut),
           facteur_essais = case when $3::uuid is null then facteur_essais else 0 end,
           facteur_prochain_le = case when $3::uuid is null then facteur_prochain_le else null end,
           facteur_erreur = case when $3::uuid is null then facteur_erreur else null end
         where company_id = $1 and id = $2`,
        [companyId, id, champs.tacheCible ?? null, champs.interactionId ?? null, champs.statut ?? null],
      );
    },
    async listerATransmettre(limite, essaisMax) {
      return (await q(
        `select * from ${ns}.liaisons where statut = 'ouverte' and tache_cible_id is null and facteur_essais < $2
           and (facteur_prochain_le is null or facteur_prochain_le <= now()) order by cree_le limit $1`,
        [limite, essaisMax],
      )).map(enLiaison);
    },
    async listerCibleSupprimee(limite, essaisMax) {
      return (await q(
        `select * from ${ns}.liaisons where statut in ('ouverte', 'en_attente_approbation') and entreprise_cible_id is null and facteur_essais < $2
           and (facteur_prochain_le is null or facteur_prochain_le <= now()) order by cree_le limit $1`,
        [limite, essaisMax],
      )).map(enLiaison);
    },
    async listerANotifier(limite, essaisMax) {
      return (await q(
        `select * from ${ns}.liaisons where statut in ('repondue', 'annulee') and source_notifiee_le is null and facteur_essais < $2
           and (facteur_prochain_le is null or facteur_prochain_le <= now()) order by repondu_le nulls first, cree_le limit $1`,
        [limite, essaisMax],
      )).map(enLiaison);
    },
    async reserverEssai(companyId, id, attenteMs, essaisMax) {
      const { rowCount } = await db.execute(
        `update ${ns}.liaisons set facteur_essais = facteur_essais + 1, facteur_prochain_le = now() + ($3::bigint * interval '1 millisecond')
         where company_id = $1 and id = $2 and facteur_essais < $4 and (facteur_prochain_le is null or facteur_prochain_le <= now())`,
        [companyId, id, Math.max(0, Math.round(attenteMs)), essaisMax],
      );
      return rowCount > 0;
    },
    async noterErreurFacteur(companyId, id, erreur) {
      await db.execute(`update ${ns}.liaisons set facteur_erreur = $3 where company_id = $1 and id = $2`, [companyId, id, erreur.slice(0, 500)]);
    },
    async marquerNotifiee(companyId, id) {
      const { rowCount } = await db.execute(
        `update ${ns}.liaisons set source_notifiee_le = now(), facteur_erreur = null where company_id = $1 and id = $2 and source_notifiee_le is null`,
        [companyId, id],
      );
      return rowCount > 0;
    },
    async relancerFacteur(companyId, id) {
      await db.execute(`update ${ns}.liaisons set facteur_essais = 0, facteur_prochain_le = null where company_id = $1 and id = $2`, [companyId, id]);
    },
  };
}
