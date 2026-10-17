/**
 * Route `liaison.demander` : un service demande quelque chose à un autre service par le bureau de liaison.
 *
 * L'entreprise SOURCE est celle de la tâche d'origine, résolue par l'hôte (chemin `/taches/:issueId/liaisons`) et
 * revérifiée ici : aucun `companyId` n'est accepté en entrée. L'entreprise CIBLE est déduite du service visé.
 *
 * Gardes (code d'erreur `liaison_refusee`, `details.garde` = lettre) :
 * - (a) un agent doit être un coordinateur DÉCLARÉ : l'unique agent de rôle `ceo` de son entreprise (coordinateur du
 *   service, ou coordinateur général pour l'entreprise Direction), l'entreprise étant elle-même déclarée comme service
 *   (garde « service »). Avoir un subordonné ne suffit plus (revue B6 : le relecteur du marketing a des subordonnés) ;
 *   un humain est exempté ;
 * - (b) le flux source vers cible doit figurer dans la matrice `flux_services` ; s'il exige l'approbation humaine, la
 *   demande reste `en_attente_approbation` : elle apparaît dans « À faire » de l'Accueil de l'entreprise source, avec son
 *   contenu complet, et ne part qu'après `liaison.decider` (aucune carte native, donc aucune capacité de plus) ;
 * - (c) la tâche d'origine ne peut pas être elle-même une tâche de liaison (un seul saut, `details.motif` « saut ») ;
 *   la chaîne est dérivée de la tâche d'origine ET de ses ancêtres (revue H2 : une sous-tâche d'une tâche reçue hérite
 *   de la chaîne reçue) : au plus deux relais (`relais`) et jamais un service déjà présent dans la chaîne (`cycle`) ;
 * - (d) au plus 5 liaisons ouvertes (ou en attente d'approbation) par entreprise source ; 30 pour l'entreprise
 *   Direction, celle du coordinateur général, pour qu'il puisse interroger tous les coordinateurs (revue M3) ;
 * - teinte (revue M1) : une tâche qui a reçu la réponse d'une liaison approuvée, ou qui descend d'une tâche reçue par
 *   une liaison approuvée, est teintée : toute liaison ouverte depuis elle (ou ses descendantes) attend l'approbation
 *   humaine, même entre deux services non sensibles ;
 * - prudence (revue de f525e9b, contournement par TÂCHE RACINE) : un coordinateur peut recopier une demande reçue, ou
 *   une réponse teintée, dans une tâche racine qui n'en descend pas. Donc, quelle que soit la tâche d'origine :
 *   tant qu'une liaison reçue par l'entreprise est `ouverte`, la nouvelle liaison hérite de la chaîne et de la
 *   profondeur MAXIMALES des liaisons reçues ouvertes (3e relais et cycle refusés, `details.prudence`) et de leur
 *   teinte ; et si l'entreprise a reçu une réponse teintée depuis moins de 7 jours, ou sur une tâche encore ouverte,
 *   la liaison attend l'approbation humaine. Faux positifs assumés (refus ou approbations en plus). Exemption : quand la
 *   lignée remonte à une VRAIE racine humaine (sommet créé par un humain, `createdByUserId` non nul et `createdByAgentId`
 *   nul, aucun ancêtre reçu par liaison), seule la lignée compte ; créateur absent ou illisible : prudence ;
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

const refus = (garde: "a" | "b" | "c" | "d" | "e" | "service", message: string, details: Record<string, unknown> = {}): never =>
  erreur("liaison_refusee", message, { garde, ...details });

/** Tâche de la lignée : seuls les champs lus ici (le créateur vient de l'hôte, jamais du corps de la requête). */
type IssueLignee = { id: string; parentId?: string | null; originKind?: string | null; createdByUserId?: string | null; createdByAgentId?: string | null };

export const enPublic = (l: LiaisonStockee): LiaisonEnregistree => ({
  id: l.id, entrepriseSource: l.entrepriseSource, entrepriseCible: l.entrepriseCible, tacheOrigine: l.tacheOrigine, tacheCible: l.tacheCible, statut: l.statut,
  objet: l.objet, extraits: l.extraits, creeLe: l.creeLe, reponduLe: l.reponduLe, ...(l.reponse === undefined ? {} : { reponse: l.reponse }),
});

export function routeDemander(d: DependancesLiaisons): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base, stock } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  const { agents } = creerTransmission(d);

  /**
   * Tâche d'origine et ses ancêtres (dans l'entreprise source seulement), du plus proche au plus lointain. Bornée :
   * au-delà de `ancetresMax`, la demande est refusée (on ne devine jamais une chaîne qu'on n'a pas pu lire).
   * `ancetreRecu` : un ancêtre porte l'origine « liaison » ; il compte pour au moins un relais même si sa ligne de
   * liaison a disparu (entreprise source supprimée).
   */
  async function ligneeDe(origine: IssueLignee, companyId: string): Promise<{ ids: string[]; ancetreRecu: boolean; racineHumaine: boolean }> {
    const ids = [origine.id];
    let racine: IssueLignee = origine;
    const vus = new Set([origine.id.toLowerCase()]);
    let ancetreRecu = false;
    let parentId = origine.parentId ?? null;
    while (parentId) {
      if (vus.has(parentId.toLowerCase())) break;
      if (ids.length >= LIMITES_LIAISON.ancetresMax) refus("c", "Lignée de tâches trop profonde pour retrouver la chaîne de la demande : demande refusée.", { motif: "relais" });
      const parent = await ctx.issues.get(parentId, companyId);
      if (!parent || parent.companyId.toLowerCase() !== companyId.toLowerCase()) break;
      ids.push(parent.id);
      racine = parent;
      vus.add(parent.id.toLowerCase());
      if (parent.originKind === ORIGINE_LIAISON) ancetreRecu = true;
      parentId = parent.parentId ?? null;
    }
    // Racine humaine : la lignée a été lue jusqu'au sommet (aucun parent restant), le sommet est créé par un humain et non
    // par un agent, et aucun ancêtre n'est une tâche reçue. Créateur absent ou illisible : pas de racine humaine (prudence).
    const racineHumaine = parentId === null && !ancetreRecu && Boolean(racine.createdByUserId) && !racine.createdByAgentId;
    return { ids, ancetreRecu, racineHumaine };
  }

  /**
   * Teinte par prudence (tâche racine) : l'entreprise a reçu une réponse teintée il y a moins de
   * `teinteFenetreJours` jours, ou sur une tâche d'origine encore ouverte (ni `done` ni `cancelled`). Au-delà de
   * `teintesExamineesMax` réponses teintées, l'entreprise est tenue pour teintée (on ne devine pas ce qu'on n'a pas lu).
   */
  async function teinteParPrudence(companyId: string): Promise<boolean> {
    const max = LIMITES_LIAISON.teintesExamineesMax;
    const retours = await stock.retoursTeintesDe(companyId, LIMITES_LIAISON.teinteFenetreJours, max);
    if (retours.length >= max || retours.some((t) => t.recente)) return true;
    const vues = new Set<string>();
    for (const { tacheOrigine: tacheId } of retours) {
      if (vues.has(tacheId.toLowerCase())) continue;
      vues.add(tacheId.toLowerCase());
      const tache = await ctx.issues.get(tacheId, companyId);
      if (tache && tache.companyId.toLowerCase() === companyId.toLowerCase() && tache.status !== "done" && tache.status !== "cancelled") return true;
    }
    return false;
  }

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

    // (a) coordinateur déclaré : l'unique agent de rôle ceo de l'entreprise (coordinateur du service ou coordinateur général).
    if (r.acteur.type === "agent") {
      const ceos = (await agents(r.companyId)).filter((a) => a.role === "ceo");
      if (!r.acteur.agentId || ceos.length !== 1 || ceos[0]!.id !== r.acteur.agentId) {
        refus("a", "Seul le coordinateur déclaré du service (ou le coordinateur général) peut ouvrir une liaison vers un autre service.");
      }
    }
    // (c) un seul saut
    if (origine!.originKind === ORIGINE_LIAISON || (await stock.estTacheDeLiaison(r.companyId, origine!.id))) {
      refus("c", "La tâche d'origine est déjà une tâche de liaison : une demande entre services ne peut pas en déclencher une autre (un seul saut).", { motif: "saut" });
    }
    // (c) chaîne : tâche d'origine ET ancêtres. Une sous-tâche d'une tâche reçue hérite de sa chaîne et de sa teinte.
    const lignee = await ligneeDe(origine!, r.companyId);
    const parLignee = await stock.liaisonsEntrantes(r.companyId, lignee.ids);
    // Relais par prudence (tâche racine) : une tâche RACINE créée par le coordinateur peut recopier une demande reçue
    // sans en descendre. Tant qu'une liaison reçue par l'entreprise est ouverte, on suppose qu'il la relaie : toute
    // liaison sortante hérite de la chaîne et de la profondeur MAXIMALES des liaisons reçues ouvertes.
    // Exemption : une VRAIE racine humaine (demande posée par l'opérateur au coordinateur général depuis la Discussion) n'est pas
    // un contournement ; seule la lignée réelle compte. Toute racine créée par un agent garde la prudence.
    const ambiantes = lignee.racineHumaine ? [] : await stock.liaisonsEntrantesOuvertes(r.companyId);
    const entrantes = [...parLignee, ...ambiantes];
    const heriteLignee = parLignee.reduce((p, e) => Math.max(p, e.profondeur), lignee.ancetreRecu ? 1 : 0);
    const herite = entrantes.reduce((p, e) => Math.max(p, e.profondeur), heriteLignee);
    const profondeur = herite + 1;
    const recues = () => [...new Set(ambiantes.map((e) => e.chaine[0]).filter((s): s is string => Boolean(s)))].join(", ");
    if (profondeur > LIMITES_LIAISON.relaisMax) {
      if (heriteLignee + 1 > LIMITES_LIAISON.relaisMax) {
        refus("c", `Au plus ${LIMITES_LIAISON.relaisMax} relais par chaîne : cette tâche descend déjà d'une chaîne de ${herite} relais. Supposez (et écrivez l'hypothèse) ou remontez à l'humain.`, { motif: "relais" });
      }
      refus("c", `Au plus ${LIMITES_LIAISON.relaisMax} relais par chaîne : une demande reçue (chaîne partie de ${recues()}) est encore ouverte dans ce service et compte déjà ${herite} relais ; par prudence, toute nouvelle liaison est comptée comme son relais. Terminez d'abord la demande reçue, supposez (et écrivez l'hypothèse) ou remontez à l'humain.`, { motif: "relais", prudence: true });
    }
    if (parLignee.some((e) => e.chaine.includes(demande.serviceCible))) {
      refus("c", `Demande circulaire : le service « ${demande.serviceCible} » est déjà dans la chaîne de cette tâche.`, { motif: "cycle" });
    }
    if (ambiantes.some((e) => e.chaine.includes(demande.serviceCible))) {
      refus("c", `Demande circulaire par prudence : une demande reçue où figure le service « ${demande.serviceCible} » est encore ouverte dans ce service ; toute nouvelle liaison est comptée comme son relais. Terminez d'abord la demande reçue ou remontez à l'humain.`, { motif: "cycle", prudence: true });
    }
    const plusLongue = [...entrantes].sort((a, b) => b.profondeur - a.profondeur)[0]?.chaine ?? null;
    // Teinte : par la lignée (tâche reçue approuvée, réponse teintée sur la tâche ou un ancêtre), puis par prudence pour
    // l'entreprise entière (liaison reçue approuvée encore ouverte, réponse teintée récente ou sur une tâche encore ouverte).
    const teintee = entrantes.some((e) => e.approbationRequise) || (await stock.retourTeinte(r.companyId, lignee.ids)) || (!lignee.racineHumaine && (await teinteParPrudence(r.companyId)));

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

    // (d) plafond : propre à l'entreprise Direction (coordinateur général), 5 pour les autres. Jamais d'exemption d'approbation.
    const plafond = source!.estDirection ? LIMITES_LIAISON.ouvertesCoordinateurGeneralMax : LIMITES_LIAISON.ouvertesParEntrepriseMax;
    if ((await stock.compterOuvertes(r.companyId)) >= plafond) {
      refus("d", `Plafond atteint : ${plafond} liaisons ouvertes pour ce service. Attendez des réponses ou annulez-en.`);
    }
    const approbationRequise = flux!.approbationHumaine || teintee;

    const liaison: LiaisonStockee = {
      id: randomUUID(), entrepriseSource: r.companyId, entrepriseCible: cible!.companyId, tacheOrigine: origine!.id, tacheCible: null,
      statut: approbationRequise ? "en_attente_approbation" : "ouverte", objet: demande.objet, extraits: demande.extraits, creeLe: new Date().toISOString(),
      reponduLe: null, serviceSource: source!.serviceSlug, serviceCible: cible!.serviceSlug, question: demande.question, cleIdempotence: cle, interactionId: null, demandePar: acteurId,
      chaine: [...(plusLongue ?? [source!.serviceSlug]), cible!.serviceSlug], profondeur, approbationRequise,
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
      await base.journaliser({ companyId: liaison.entrepriseSource, type: "liaison.approbation_demandee", entite: "liaison", entiteId: liaison.id, issueId: liaison.tacheOrigine, acteur: acteurId, runId: r.acteur.runId, donnees: { liaisonId: liaison.id, serviceCible: liaison.serviceCible, extraits: liaison.extraits.length, teinte: teintee && !flux!.approbationHumaine } });
      return { statut: 201, corps: { liaison: enPublic(liaison), dejaEnregistree: false, transmise: false, approbationRequise: true, teinte: teintee } };
    }
    return { statut: 201, corps: { liaison: enPublic(liaison), dejaEnregistree: false, transmise: false, enFile: true, approbationRequise: false } };
  };

  return routes;
}
