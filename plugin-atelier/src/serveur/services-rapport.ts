/**
 * Rapport mensuel remis au client (humain seulement, lecture seule).
 *
 * Route `rapport.mensuel` (`?mois=AAAA-MM`) : ce que l'équipe d'agents a fait et obtenu sur le mois, à partir des
 * seules données existantes. Chaque chiffre porte sa source (table ou route lue) et la période. Une donnée non
 * mesurée vaut `null` (« non mesuré »), jamais 0. La démonstration est comptée à part et nommée comme telle.
 *
 * Mois civil en UTC, comme la fenêtre budgétaire du socle et `scripts/releve-couts.py`. L'entreprise vient de la
 * résolution de route de l'hôte et filtre chaque lecture.
 *
 * Définitions :
 * - contenu produit : tâche placée sous porte créée dans le mois ;
 * - contenu validé : décision humaine « approuver » non invalidée prise dans le mois ;
 * - contenu publié : diffusion « confirmee » en mode réel dans le mois (démonstration : à part) ;
 * - prospects : leads créés dans le mois, badge recalculé au jour de la consultation (`calculerConfiance`) ;
 *   le parcours s'arrête à `PAGES_MAX` pages de 200 et le signale (`tronque`) ;
 * - coût IA : `cost_events` du mois par agent et modèle, l'équivalent de `/costs/by-agent-model`.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  MoisRapport,
  RapportMensuel,
  type ChiffreRapport,
  type CleRouteApi,
  type LigneCoutIa,
  type PeriodeRapport,
  type PointClient,
  type Prospect,
} from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute, RequeteRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { iso } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { calculerConfiance } from "./qualification-prospects.js";
import { assemblerProspect, contexteQualification } from "./services-realite.js";
import type { StockReglagesLeads } from "./services-reglages-leads.js";

/** Pages de 200 leads lues au plus : au-delà, les nombres sont des minimums. */
export const PAGES_MAX_RAPPORT = 25;
const PAR_PAGE = 200;

type Mode = "reel" | "demonstration";
export type ComptesParMode = Record<Mode, number>;

/** Lectures SQL du rapport (injectées : le banc de test les simule). Fenêtre : `[debut, finExclue[`. */
export interface LecturesRapport {
  contenus(companyId: string, debut: string, finExclue: string): Promise<{ produits: ComptesParMode; valides: ComptesParMode; publies: ComptesParMode }>;
  exportsCrm(companyId: string, debut: string, finExclue: string): Promise<{ exportes: ComptesParMode }>;
  mesures(companyId: string, debut: string, finExclue: string): Promise<Array<{ indicateur: string; valeur: number; unite: string; periodeDebut: string; periodeFin: string; provenance: string }>>;
  couts(companyId: string, debut: string, finExclue: string): Promise<LigneCoutIa[]>;
}

export interface DependancesRapport {
  ctx: PluginContext;
  base: BaseAtelier;
  stock: StockReglagesLeads;
  lectures: LecturesRapport;
  /** Éléments de la liste « À faire » (même source que l'accueil). */
  elementsAFaire(r: RequeteRoute): Promise<Array<{ type: string; titre: string; raison: string }>>;
  maintenant?: () => Date;
}

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "Le rapport mensuel est réservé à un humain.");
};

/** Fenêtre du mois civil UTC. */
export function fenetreDuMois(mois: string): { debut: string; finExclue: string; periode: PeriodeRapport } {
  const [a, m] = mois.split("-").map(Number) as [number, number];
  const debut = new Date(Date.UTC(a, m - 1, 1));
  const finExclue = new Date(Date.UTC(a, m, 1));
  return { debut: debut.toISOString(), finExclue: finExclue.toISOString(), periode: { debut: debut.toISOString(), fin: new Date(finExclue.getTime() - 1).toISOString() } };
}

/** Badge d'un lead, même règle que l'interface : écarté, qualifié, sinon à vérifier. */
export function badgeLead(p: Prospect, qualifie: boolean, plafonnee: boolean): "qualifie" | "ecarte" | "a_verifier" {
  const exclu = p.statut === "exclu" || p.statut === "refuse" || p.motifsExclusion.length > 0;
  if (exclu || plafonnee) return "ecarte";
  return qualifie ? "qualifie" : "a_verifier";
}

export function facturationDe(billingType: string, coutCentimes: number): string {
  if (billingType.startsWith("subscription")) return "abonnement";
  if (billingType === "metered_api") return coutCentimes ? "api" : "api_cout_nul";
  return billingType || "inconnue";
}

/** Lectures SQL réelles, en lecture seule (l'hôte autorise `public.cost_events`, `agents` et l'espace du plugin). */
export function lecturesRapportSql(db: PluginContext["db"]): LecturesRapport {
  // Lecture paresseuse : l'accès à la base n'est touché qu'au premier appel de la route.
  const q = <T = Record<string, unknown>>(sql: string, p: unknown[]) => db.query<T>(sql, p);
  const parMode = (lignes: Array<Record<string, unknown>>): ComptesParMode => {
    const c: ComptesParMode = { reel: 0, demonstration: 0 };
    for (const l of lignes) if (l.mode === "reel" || l.mode === "demonstration") c[l.mode] += Number(l.n);
    return c;
  };
  return {
    async contenus(companyId, debut, fin) {
      const ns = db.namespace;
      const [produits, valides, publies] = await Promise.all([
        q(`select c.mode as mode, count(*) as n from ${ns}.portes po join ${ns}.campagnes c on c.id = po.campagne_id where po.company_id = $1 and po.cree_le >= $2::timestamptz and po.cree_le < $3::timestamptz group by c.mode`, [companyId, debut, fin]),
        q(`select mode, count(distinct issue_id) as n from ${ns}.decisions_humaines where company_id = $1 and action = 'approuver' and invalidee = false and cree_le >= $2::timestamptz and cree_le < $3::timestamptz group by mode`, [companyId, debut, fin]),
        q(`select mode, count(distinct issue_id) as n from ${ns}.diffusions where company_id = $1 and etat <> 'refusee' and (mode = 'demonstration' or etat = 'confirmee') and cree_le >= $2::timestamptz and cree_le < $3::timestamptz group by mode`, [companyId, debut, fin]),
      ]);
      return { produits: parMode(produits), valides: parMode(valides), publies: parMode(publies) };
    },
    async exportsCrm(companyId, debut, fin) {
      const ns = db.namespace;
      const l = await q(
        `select mode, coalesce(sum(jsonb_array_length(prospect_ids)), 0) as n from ${ns}.exports_crm where company_id = $1 and etat <> 'refusee' and (mode = 'demonstration' or etat = 'confirmee') and cree_le >= $2::timestamptz and cree_le < $3::timestamptz group by mode`,
        [companyId, debut, fin],
      );
      return { exportes: parMode(l) };
    },
    async mesures(companyId, debut, fin) {
      const ns = db.namespace;
      const l = await q(
        `select indicateur, valeur, unite, periode_debut, periode_fin, provenance from ${ns}.mesures where company_id = $1 and periode_debut >= $2::timestamptz and periode_fin <= $3::timestamptz and lower(indicateur) ~ '(devis|conversion)' order by periode_debut, indicateur limit 200`,
        [companyId, debut, fin],
      );
      return l.map((r) => ({ indicateur: String(r.indicateur), valeur: Number(r.valeur), unite: String(r.unite), periodeDebut: iso(r.periode_debut), periodeFin: iso(r.periode_fin), provenance: String(r.provenance) }));
    },
    async couts(companyId, debut, fin) {
      const ns = db.namespace;
      const l = await q(
        `select coalesce(a.name, '(agent supprimé)') as agent, c.model as modele, c.billing_type as facturation, sum(c.input_tokens) as entree, sum(c.cached_input_tokens) as cache, sum(c.output_tokens) as sortie, sum(c.cost_cents) as cout
         from public.cost_events c left join public.agents a on a.id = c.agent_id
         where c.company_id = $1 and c.occurred_at >= $2::timestamptz and c.occurred_at < $3::timestamptz
         group by c.agent_id, a.name, c.model, c.billing_type order by 1, 2, 3`,
        [companyId, debut, fin],
      );
      return l.map((r) => {
        const cout = Math.round(Number(r.cout ?? 0));
        return { agent: String(r.agent), modele: String(r.modele), facturation: facturationDe(String(r.facturation ?? ""), cout), jetonsEntree: Number(r.entree ?? 0), jetonsEntreeCache: Number(r.cache ?? 0), jetonsSortie: Number(r.sortie ?? 0), coutCentimes: cout };
      });
    },
  };
}

export function routesRapport(d: DependancesRapport): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { base, stock, lectures, ctx } = d;
  const maintenant = () => (d.maintenant ? d.maintenant() : new Date());
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["rapport.mensuel"] = async (r) => {
    exigerHumain(r.acteur);
    const brut = r.query["mois"];
    const lu = MoisRapport.safeParse(Array.isArray(brut) ? brut[0] : brut);
    if (!lu.success) erreurValidation("Rapport mensuel", lu.error.issues.map((i) => ({ ...i, path: ["mois"] })));
    const mois = lu.data;
    const { debut, finExclue, periode } = fenetreDuMois(mois);
    const companyId = r.companyId;
    const chiffre = (cle: string, libelle: string, valeur: number | null, source: string, mode: Mode | null = null, note: string | null = null): ChiffreRapport => ({
      cle, libelle, valeur, mesure: valeur !== null, source, periode, mode, note,
    });

    const [societe, campagnes, contenus, exports, mesures, couts, aFaire, parcours] = await Promise.all([
      ctx.companies.get(companyId),
      base.listerCampagnes(companyId),
      lectures.contenus(companyId, debut, finExclue),
      lectures.exportsCrm(companyId, debut, finExclue),
      lectures.mesures(companyId, debut, finExclue),
      lectures.couts(companyId, debut, finExclue),
      d.elementsAFaire(r),
      parcourirProspects(companyId, debut, finExclue),
    ]);

    // Campagnes : l'état du projet n'est connu qu'au jour de la consultation (la date de fin n'est pas conservée).
    const terminee = (c: (typeof campagnes)[number]) => c.etatProjet.archive || c.etatProjet.statut === "completed" || c.etatProjet.statut === "cancelled";
    const avantFin = campagnes.filter((c) => c.creeLe < finExclue);
    const noteEtat = "État du projet au jour de la consultation : la date de fin d'une campagne n'est pas conservée.";
    const lignesCampagnes = [
      chiffre("campagnes_creees", "Campagnes créées dans le mois", campagnes.filter((c) => c.creeLe >= debut && c.creeLe < finExclue).length, "campagnes"),
      chiffre("campagnes_actives", "Campagnes actives", avantFin.filter((c) => !terminee(c)).length, "campagnes, projets (état)", null, noteEtat),
      chiffre("campagnes_terminees", "Campagnes terminées", avantFin.filter(terminee).length, "campagnes, projets (état)", null, noteEtat),
    ];

    const parModes = (cle: string, libelle: string, c: ComptesParMode, source: string, noteDemo: string): ChiffreRapport[] => [
      chiffre(`${cle}_reel`, libelle, c.reel, source, "reel"),
      chiffre(`${cle}_demonstration`, `${libelle} (démonstration)`, c.demonstration, source, "demonstration", noteDemo),
    ];
    const lignesContenus = [
      ...parModes("contenus_produits", "Contenus produits", contenus.produits, "portes, campagnes (mode)", "Campagnes en démonstration : aucun effet réel."),
      ...parModes("contenus_valides", "Contenus validés par vous", contenus.valides, "decisions_humaines (approuver, non invalidée)", "Décisions prises en démonstration."),
      ...parModes("contenus_publies", "Contenus publiés", contenus.publies, "diffusions (confirmee en mode réel)", "Diffusions simulées ou préparées en démonstration : rien n'a été publié pour de bon."),
    ];

    const trouvesNote = parcours.tronque ? `Parcours arrêté à ${PAGES_MAX_RAPPORT * PAR_PAGE} leads : nombres minimums.` : null;
    const chiffresProspects = [
      chiffre("prospects_trouves_reel", "Prospects trouvés", parcours.trouves.reel, "prospects", "reel", trouvesNote),
      chiffre("prospects_trouves_demonstration", "Prospects trouvés (démonstration)", parcours.trouves.demonstration, "prospects", "demonstration", "Leads de démonstration : pas de vrais prospects."),
      ...parModes("prospects_exportes", "Prospects exportés vers le CRM", exports.exportes, "exports_crm (confirmee en mode réel)", "Exports simulés en démonstration."),
    ];
    const noteBadge = "Badge recalculé au jour de la consultation, pour les leads trouvés dans le mois." + (trouvesNote ? ` ${trouvesNote}` : "");
    const badges = [
      chiffre("prospects_qualifies", "Qualifiés", parcours.badges.qualifie, "prospects, qualification (calculerConfiance)", null, noteBadge),
      chiffre("prospects_a_verifier", "À vérifier", parcours.badges.a_verifier, "prospects, qualification (calculerConfiance)", null, noteBadge),
      chiffre("prospects_ecartes", "Écartés", parcours.badges.ecarte, "prospects, qualification (calculerConfiance)", null, noteBadge),
    ];
    if (parcours.illisibles > 0) badges.push(chiffre("prospects_illisibles", "Leads illisibles, non classés", parcours.illisibles, "prospects", null, "Fiches non conformes au contrat : ignorées du classement."));

    const chiffresResultats =
      mesures.length === 0
        ? [chiffre("devis_conversions", "Demandes de devis et conversions", null, "mesures", null, "Aucune mesure de devis ou de conversion importée pour ce mois : non mesuré.")]
        : mesures.map((m, i) => chiffre(`mesure_${i}`, m.indicateur, m.valeur, `mesures (${m.provenance})`, null, m.unite));

    const total = couts.reduce((t, l) => ({ jetonsEntree: t.jetonsEntree + l.jetonsEntree, jetonsEntreeCache: t.jetonsEntreeCache + l.jetonsEntreeCache, jetonsSortie: t.jetonsSortie + l.jetonsSortie, coutCentimes: t.coutCentimes + l.coutCentimes }), { jetonsEntree: 0, jetonsEntreeCache: 0, jetonsSortie: 0, coutCentimes: 0 });
    const points: PointClient[] = aFaire.filter((e) => e.type !== "tache_bloquee").map((e) => ({ type: e.type, titre: e.titre, raison: e.raison }));

    const rapport: RapportMensuel = {
      companyId,
      entreprise: societe?.name ?? null,
      mois,
      periode,
      genereLe: maintenant().toISOString(),
      campagnes: lignesCampagnes,
      contenus: lignesContenus,
      prospects: { chiffres: chiffresProspects, badges, tronque: parcours.tronque, plafond: PAGES_MAX_RAPPORT * PAR_PAGE },
      resultats: { chiffres: chiffresResultats, mesures },
      coutsIa: {
        lignes: couts,
        total,
        source: "cost_events par agent et modèle (équivalent de /costs/by-agent-model)",
        periode,
        note: couts.length === 0 ? "Aucun coût déclaré par Paperclip sur ce mois." : "Coût en centimes du socle, sans conversion. Les agents sous abonnement affichent un coût nul : seuls les jetons comptent.",
      },
      enAttenteClient: { points, source: "accueil (liste « À faire », hors tâches bloquées)", note: "État au jour de la consultation, pas au dernier jour du mois." },
    };
    return { corps: RapportMensuel.parse(rapport) };
  };

  /** Un seul parcours des leads, par pages de 200 : trouvés dans le mois (par mode) et badge de chacun. */
  async function parcourirProspects(companyId: string, debut: string, finExclue: string) {
    const ctxQualif = await contexteQualification(base, stock, companyId, maintenant());
    const trouves: ComptesParMode = { reel: 0, demonstration: 0 };
    const badges = { qualifie: 0, a_verifier: 0, ecarte: 0 };
    let illisibles = 0;
    let tronque = false;
    for (let page = 1; ; page++) {
      if (page > PAGES_MAX_RAPPORT) {
        tronque = true;
        break;
      }
      const { lignes } = await base.listerProspects(companyId, { page, parPage: PAR_PAGE, avecClientsActuels: true });
      const duMois = lignes.filter((l) => l.creeLe >= debut && l.creeLe < finExclue);
      if (duMois.length > 0) {
        const det = await base.detailsProspects(companyId, duMois.map((l) => l.id));
        for (const l of duMois) {
          trouves[l.mode === "reel" ? "reel" : "demonstration"]++;
          const p = assemblerProspect(l, det);
          if (p === null) {
            illisibles++;
            continue;
          }
          const c = calculerConfiance(p, ctxQualif);
          badges[badgeLead(p, c.qualifie, c.plafonnee)]++;
        }
      }
      if (lignes.length < PAR_PAGE) break;
    }
    return { trouves, badges, illisibles, tronque };
  }

  return routes;
}
