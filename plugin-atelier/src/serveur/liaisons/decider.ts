/**
 * Route `liaison.decider` (humain seulement) : décision sur une liaison en attente d'approbation.
 *
 * - `approuver` : la liaison passe à `ouverte` (changement conditionnel, un seul gagnant) et part par la MÊME file que
 *   le cas nominal de `liaison.demander` : le facteur, hors invocation, crée la tâche chez le coordinateur cible, le
 *   réveille et journalise (la route, portée par l'entreprise source, ne peut pas écrire chez la cible).
 *   Idempotent : rejouée, la décision remet en file une transmission en échec, sans doublon, et ne change rien sinon.
 * - `refuser` : la liaison passe à `refusee`, un commentaire est posé sur la tâche d'origine (raison humaine
 *   éventuelle) et le coordinateur source est réveillé.
 * L'entreprise est celle de la route (résolue par l'hôte) ; une liaison d'une autre entreprise est introuvable.
 */
import { DeciderLiaisonEntree, type CleRouteApi } from "../../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "../atelier.js";
import { erreur, erreurValidation } from "../erreurs.js";
import { enPublic } from "./demander.js";
import { notifierSource } from "./retour.js";
import type { DependancesLiaisons } from "./transmission.js";

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "La décision sur une liaison est réservée à un humain.");
};

export function routeDecider(d: DependancesLiaisons): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base, stock } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["liaison.decider"] = async (r) => {
    exigerHumain(r.acteur);
    const p = DeciderLiaisonEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Décision sur une liaison", p.error.issues);
    const e = p.data!;
    if (e.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Liaison introuvable dans cette entreprise.");
    const l = await stock.lireParId(r.companyId, e.liaisonId);
    if (!l) erreur("hors_entreprise", "Liaison introuvable dans cette entreprise.");
    const liaison = l!;

    if (e.decision === "approuver") {
      if (liaison.statut === "en_attente_approbation") {
        // Les règles qui ont autorisé la demande valent toujours : le flux et le client n'ont pas changé depuis.
        const source = await stock.serviceDeEntreprise(liaison.entrepriseSource);
        const cible = liaison.entrepriseCible === null ? null : await stock.serviceDeEntreprise(liaison.entrepriseCible);
        if (!source || !cible || source.clientMarqueur !== cible.clientMarqueur || !(await stock.lireFlux(source.clientMarqueur, source.serviceSlug, cible.serviceSlug))) {
          erreur("liaison_refusee", "Le flux entre ces deux services n'est plus autorisé : la demande ne peut pas être transmise.", { garde: "b" });
        }
        const gagne = await stock.transiter(r.companyId, liaison.id, ["en_attente_approbation"], { statut: "ouverte" });
        if (gagne) liaison.statut = "ouverte";
        else {
          const actuelle = await stock.lireParId(r.companyId, liaison.id);
          if (!actuelle || actuelle.statut !== "ouverte") erreur("conflit", `Cette liaison a déjà été décidée (${actuelle?.statut ?? "inconnue"}).`);
          Object.assign(liaison, actuelle);
        }
        await base.journaliser({ companyId: r.companyId, type: "liaison.approuvee", entite: "liaison", entiteId: liaison.id, issueId: liaison.tacheOrigine, acteur: r.acteur.id, donnees: { liaisonId: liaison.id, serviceCible: liaison.serviceCible, ...(e.raison ? { raison: e.raison } : {}) } });
      } else if (liaison.statut !== "ouverte") {
        erreur("conflit", `Cette liaison n'attend plus d'approbation (${liaison.statut}).`);
      }
      // `ouverte` sans tâche cible : en file (ou en échec), remise en file sans doublon. Avec tâche cible : rien à refaire.
      if (!liaison.tacheCible) {
        await stock.relancerFacteur(r.companyId, liaison.id);
        return { corps: { liaison: enPublic(liaison), dejaDecidee: false, transmise: false, enFile: true } };
      }
      return { corps: { liaison: enPublic(liaison), dejaDecidee: true, transmise: true } };
    }

    // refuser
    if (liaison.statut === "refusee") return { corps: { liaison: enPublic(liaison), dejaDecidee: true, transmise: false } };
    if (liaison.statut !== "en_attente_approbation") erreur("conflit", `Cette liaison n'attend plus d'approbation (${liaison.statut}).`);
    const gagne = await stock.transiter(r.companyId, liaison.id, ["en_attente_approbation"], { statut: "refusee", repondu: true });
    if (!gagne) {
      const actuelle = await stock.lireParId(r.companyId, liaison.id);
      if (actuelle?.statut === "refusee") return { corps: { liaison: enPublic(actuelle), dejaDecidee: true, transmise: false } };
      erreur("conflit", `Cette liaison a déjà été décidée (${actuelle?.statut ?? "inconnue"}).`);
    }
    liaison.statut = "refusee";
    const corps = [
      `**Demande au service « ${liaison.serviceCible} » refusée** par un responsable : « ${liaison.objet.replace(/\s+/gu, " ")} » n'a pas été transmise.`,
      ...(e.raison ? ["", `Raison indiquée : ${e.raison}`] : []),
    ].join("\n");
    const { erreurCommentaire, erreurReveil } = await notifierSource(ctx, liaison, corps, "atelier_liaison_refusee");
    await base.journaliser({
      companyId: r.companyId, type: "liaison.refusee", entite: "liaison", entiteId: liaison.id, issueId: liaison.tacheOrigine, acteur: r.acteur.id,
      donnees: { liaisonId: liaison.id, serviceCible: liaison.serviceCible, ...(e.raison ? { raison: e.raison } : {}), ...(erreurCommentaire ? { erreurCommentaire } : {}), ...(erreurReveil ? { erreurReveil } : {}) },
    });
    return { corps: { liaison: enPublic(liaison), dejaDecidee: false, transmise: false } };
  };
  return routes;
}
