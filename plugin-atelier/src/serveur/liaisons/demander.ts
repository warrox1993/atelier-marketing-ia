/**
 * Route `liaison.demander` : un service demande quelque chose à un autre service par le bureau de liaison.
 *
 * L'entreprise SOURCE est celle de la tâche d'origine, résolue par l'hôte (chemin `/taches/:issueId/liaisons`) et
 * revérifiée ici : aucun `companyId` n'est accepté en entrée. L'entreprise CIBLE est déduite du service visé.
 *
 * Gardes (code d'erreur `liaison_refusee`, `details.garde` = lettre) :
 * - (a) un agent doit être coordinateur (avoir au moins un subordonné, champ `reportsTo`) ; un humain est exempté ;
 * - (b) le flux source vers cible doit figurer dans la matrice `flux_services` ; s'il exige l'approbation humaine, la
 *   demande reste `en_attente_approbation` : elle apparaît dans « À faire » de l'Accueil de l'entreprise source, avec son
 *   contenu complet, et ne part qu'après `liaison.decider` (aucune carte native, donc aucune capacité de plus) ;
 * - (c) la tâche d'origine ne peut pas être elle-même une tâche de liaison (un seul saut) ;
 * - (d) au plus 5 liaisons ouvertes (ou en attente d'approbation) par entreprise source ;
 * - (e) source et cible appartiennent au même client (même `client_marqueur`).
 *
 * Si tout passe, la liaison est enregistrée `ouverte` (réponse `enFile: true`) : la route est une invocation portée par
 * l'entreprise SOURCE et l'hôte y refuse toute écriture chez la cible (essai réel L9). Le facteur (`facteur.ts`), hors
 * invocation, revérifie les gardes puis crée la tâche RACINE chez le coordinateur cible (objet, question et extraits
 * présentés comme DONNÉES, jamais comme instructions), le réveille et journalise des deux côtés, en quelques secondes.
 * L'opération est idempotente : la même demande répétée rend la liaison existante, et une transmission en échec est
 * remise en file sans doublon (la tâche cible est retrouvée par `originId`).
 */
import { randomUUID } from "node:crypto";
import { DemandeLiaisonEntree, IdNatif, LIMITES_LIAISON, type CleRouteApi, type LiaisonEnregistree } from "../../contrats/index.js";
import type { GestionnaireRoute } from "../atelier.js";
import { erreur, erreurValidation } from "../erreurs.js";
import type { LiaisonStockee } from "./base-liaisons.js";
import { cleLiaison, creerTransmission, type DependancesLiaisons } from "./transmission.js";

export { ORIGINE_LIAISON, cleLiaison, descriptionLiaison, type DependancesLiaisons } from "./transmission.js";
import { ORIGINE_LIAISON } from "./transmission.js";

const refus = (garde: "a" | "b" | "c" | "d" | "e" | "service", message: string): never => erreur("liaison_refusee", message, { garde });

export const enPublic = (l: LiaisonStockee): LiaisonEnregistree => ({
  id: l.id, entrepriseSource: l.entrepriseSource, entrepriseCible: l.entrepriseCible, tacheOrigine: l.tacheOrigine, tacheCible: l.tacheCible, statut: l.statut,
  objet: l.objet, extraits: l.extraits, creeLe: l.creeLe, reponduLe: l.reponduLe, ...(l.reponse === undefined ? {} : { reponse: l.reponse }),
});

export function routeDemander(d: DependancesLiaisons): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base, stock } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  const { agents } = creerTransmission(d);

  routes["liaison.demander"] = async (r) => {
    const p = DemandeLiaisonEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Demande de liaison", p.error.issues);
    const demande = p.data!;
    const issueIdChemin = r.params["issueId"];
    if (!issueIdChemin || !IdNatif.safeParse(issueIdChemin).success || issueIdChemin.toLowerCase() !== demande.tacheOrigineId.toLowerCase()) {
      erreur("entree_invalide", "La tâche d'origine du corps doit être celle du chemin.");
    }
    // Isolation : la tâche d'origine doit exister dans l'entreprise résolue par l'hôte, jamais ailleurs.
    const origine = await ctx.issues.get(demande.tacheOrigineId, r.companyId);
    if (!origine || origine.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Tâche d'origine introuvable dans cette entreprise.");

    // (a) coordinateur
    if (r.acteur.type === "agent") {
      const liste = await agents(r.companyId);
      if (!r.acteur.agentId || !liste.some((a) => a.reportsTo === r.acteur.agentId)) refus("a", "Seul un coordinateur (un agent qui a des subordonnés) peut ouvrir une liaison vers un autre service.");
    }
    // (c) un seul saut
    if (origine!.originKind === ORIGINE_LIAISON || (await stock.estTacheDeLiaison(r.companyId, origine!.id))) {
      refus("c", "La tâche d'origine est déjà une tâche de liaison : une demande entre services ne peut pas en déclencher une autre (un seul saut).");
    }

    const source = await stock.serviceDeEntreprise(r.companyId);
    if (!source) refus("service", "Cette entreprise n'est pas déclarée comme un service d'un client (services.declarer).");

    // Idempotence : la même demande rend la liaison existante et reprend une transmission interrompue.
    const cle = cleLiaison(demande);
    const acteurId = r.acteur.id;
    const existante = await stock.lireParCle(r.companyId, cle);
    if (existante) {
      // Transmission pas encore faite (ou en échec) : remise en file immédiate, sans doublon possible.
      const enFile = existante.statut === "ouverte" && !existante.tacheCible;
      if (enFile) await stock.relancerFacteur(r.companyId, existante.id);
      return { statut: 200, corps: { liaison: enPublic(existante), dejaEnregistree: true, enFile } };
    }

    // (e) même client : la cible est cherchée sous le slug demandé ; un service d'un autre client n'est jamais joignable.
    const candidats = await stock.servicesParSlug(demande.serviceCible);
    if (candidats.length === 0) refus("service", `Aucune entreprise n'est déclarée pour le service « ${demande.serviceCible} ».`);
    const cible = candidats.find((c) => c.clientMarqueur === source!.clientMarqueur);
    if (!cible) refus("e", `Le service « ${demande.serviceCible} » appartient à un autre client : aucun échange n'est possible.`);
    if (cible!.companyId.toLowerCase() === r.companyId.toLowerCase()) refus("service", "Un service ne peut pas se demander quelque chose à lui-même.");

    // (b) matrice des flux
    const flux = await stock.lireFlux(source!.clientMarqueur, source!.serviceSlug, cible!.serviceSlug);
    if (!flux) refus("b", `Le flux ${source!.serviceSlug} vers ${cible!.serviceSlug} n'est pas autorisé par la matrice des flux.`);

    // (d) plafond
    if ((await stock.compterOuvertes(r.companyId)) >= LIMITES_LIAISON.ouvertesParEntrepriseMax) {
      refus("d", `Plafond atteint : ${LIMITES_LIAISON.ouvertesParEntrepriseMax} liaisons ouvertes pour ce service. Attendez des réponses ou annulez-en.`);
    }

    const liaison: LiaisonStockee = {
      id: randomUUID(), entrepriseSource: r.companyId, entrepriseCible: cible!.companyId, tacheOrigine: origine!.id, tacheCible: null,
      statut: flux!.approbationHumaine ? "en_attente_approbation" : "ouverte", objet: demande.objet, extraits: demande.extraits, creeLe: new Date().toISOString(),
      reponduLe: null, serviceSource: source!.serviceSlug, serviceCible: cible!.serviceSlug, question: demande.question, cleIdempotence: cle, interactionId: null, demandePar: acteurId,
    };
    try {
      await stock.inserer(liaison);
    } catch (e) {
      // Course avec une requête identique : la clé unique a gagné, on rend la liaison de l'autre.
      const gagnante = await stock.lireParCle(r.companyId, cle);
      if (gagnante) return { statut: 200, corps: { liaison: enPublic(gagnante), dejaEnregistree: true, enFile: gagnante.statut === "ouverte" && !gagnante.tacheCible } };
      throw e;
    }
    if (liaison.statut === "en_attente_approbation") {
      await base.journaliser({ companyId: liaison.entrepriseSource, type: "liaison.approbation_demandee", entite: "liaison", entiteId: liaison.id, issueId: liaison.tacheOrigine, acteur: acteurId, runId: r.acteur.runId, donnees: { liaisonId: liaison.id, serviceCible: liaison.serviceCible, extraits: liaison.extraits.length } });
      return { statut: 201, corps: { liaison: enPublic(liaison), dejaEnregistree: false, transmise: false, approbationRequise: true } };
    }
    return { statut: 201, corps: { liaison: enPublic(liaison), dejaEnregistree: false, transmise: false, enFile: true, approbationRequise: false } };
  };

  return routes;
}
