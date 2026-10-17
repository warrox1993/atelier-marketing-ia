/**
 * Clôture d'une liaison dont l'entreprise cible a été supprimée (migration 015 : `entreprise_cible_id` passe à NULL,
 * le statut reste inchangé). Une telle liaison, `ouverte` (transmise ou non) ou `en_attente_approbation`, ne doit
 * jamais rester en attente pour toujours : elle passe à l'état final `cible_supprimee`.
 *
 * Idempotent : la transition est conditionnelle (comparer et échanger), seul l'appelant qui la gagne informe la
 * source (commentaire sur la tâche d'origine, réveil du coordinateur) et journalise `liaison.non_transmise`.
 */
import type { LiaisonStockee } from "./base-liaisons.js";
import { notifierSource } from "./retour.js";
import type { DependancesLiaisons } from "./transmission.js";

/** Statuts depuis lesquels la disparition de la cible clôt la liaison. */
export const STATUTS_CLOTURABLES_CIBLE_SUPPRIMEE = ["ouverte", "en_attente_approbation"] as const;

/** Vrai pour l'unique appelant qui a clôturé la liaison ; faux si elle n'était plus dans un état clôturable. */
export async function cloturerCibleSupprimee(d: Pick<DependancesLiaisons, "ctx" | "base" | "stock">, l: LiaisonStockee, acteur: string): Promise<boolean> {
  const { ctx, base, stock } = d;
  if (!(await stock.transiter(l.entrepriseSource, l.id, STATUTS_CLOTURABLES_CIBLE_SUPPRIMEE, { statut: "cible_supprimee", repondu: true }))) return false;
  l.statut = "cible_supprimee";
  const objet = l.objet.replace(/\s+/gu, " ");
  const corps = l.tacheCible
    ? `**Demande au service « ${l.serviceCible} » abandonnée** : « ${objet} ». Ce service n'existe plus (entreprise supprimée), la demande ne sera pas traitée.`
    : `**Demande au service « ${l.serviceCible} » non transmise** : « ${objet} ». Ce service n'existe plus (entreprise supprimée).`;
  const { erreurCommentaire, erreurReveil } = await notifierSource(ctx, l, corps, "atelier_liaison_refusee");
  if (!erreurCommentaire) await stock.marquerNotifiee(l.entrepriseSource, l.id);
  await base.journaliser({
    companyId: l.entrepriseSource, type: "liaison.non_transmise", entite: "liaison", entiteId: l.id, issueId: l.tacheOrigine, acteur, runId: null,
    donnees: { liaisonId: l.id, serviceCible: l.serviceCible, raison: "cible_supprimee", ...(erreurCommentaire ? { erreurCommentaire } : {}), ...(erreurReveil ? { erreurReveil } : {}) },
  });
  return true;
}
