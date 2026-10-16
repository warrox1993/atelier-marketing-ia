/**
 * Route `liaison.lire` (humain seulement) : liaisons d'une tâche, pour l'onglet « Échanges » de sa fiche.
 *
 * L'entreprise est celle de la tâche (résolue par l'hôte). Ne sont renvoyées que les liaisons dont cette entreprise est
 * la SOURCE (la tâche est l'origine) ou la CIBLE (la tâche est celle que la liaison a créée) ; une troisième entreprise
 * n'en voit aucune. Côté cible, la vue se limite à ce qui a été transmis : objet, question, extraits, et la réponse
 * donnée ; jamais la tâche d'origine ni l'entreprise source, et jamais une demande non transmise (attente d'accord,
 * refus) dont le service cible n'a pas été informé.
 */
import { IdNatif, type CleRouteApi } from "../../contrats/index.js";
import { libelleStatutLiaison, NOM_SERVICE_SUPPRIME, nomService, type ReponseLireLiaisons, type VueLiaison } from "../../contrats/liaisons-lecture.js";
import type { ActeurHote, GestionnaireRoute } from "../atelier.js";
import { erreur } from "../erreurs.js";
import type { DependancesLiaisons } from "./transmission.js";
import type { LectureLiaisons, LiaisonLue } from "./lecture-liaisons.js";

export const memeId = (a: string | null | undefined, b: string | null | undefined): boolean => a != null && b != null && a.toLowerCase() === b.toLowerCase();

export const exigerHumainLecture = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

/** Vue d'une liaison du point de vue de la tâche consultée ; null si l'entreprise n'est ni source ni cible, ou si la cible ne doit rien voir. */
export function vueLiaison(l: LiaisonLue, companyId: string, issueId: string): VueLiaison | null {
  let role: "source" | "cible";
  if (memeId(l.entrepriseSource, companyId) && memeId(l.tacheOrigine, issueId)) role = "source";
  else if (memeId(l.entrepriseCible, companyId) && memeId(l.tacheCible, issueId)) role = "cible";
  else return null;
  // Le service cible ne sait rien d'une demande qui ne lui a pas été transmise.
  if (role === "cible" && (l.statut === "en_attente_approbation" || l.statut === "refusee")) return null;
  return {
    id: l.id,
    role,
    serviceSource: l.serviceSource,
    serviceCible: l.serviceCible,
    nomServiceSource: nomService(l.serviceSource),
    nomServiceCible: l.entrepriseCible === null ? NOM_SERVICE_SUPPRIME : nomService(l.serviceCible),
    objet: l.objet,
    question: l.question,
    extraits: l.extraits.map((e) => ({ titre: e.titre, texte: e.texte })),
    statut: l.statut,
    libelleStatut: libelleStatutLiaison(l.statut, "fiche"),
    creeLe: l.creeLe,
    reponduLe: l.reponduLe,
    ...(l.reponse === undefined ? {} : { reponse: l.reponse }),
  };
}

export function routeLire(d: Pick<DependancesLiaisons, "ctx"> & { lecture: LectureLiaisons }): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, lecture } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["liaison.lire"] = async (r) => {
    exigerHumainLecture(r.acteur, "La lecture des échanges entre services");
    const issueId = r.params["issueId"];
    if (!issueId || !IdNatif.safeParse(issueId).success) erreur("entree_invalide", "Identifiant de tâche invalide.");
    // Isolation : la tâche doit exister dans l'entreprise résolue par l'hôte, jamais ailleurs.
    const tache = await ctx.issues.get(issueId!, r.companyId);
    if (!tache || !memeId(tache.companyId, r.companyId)) erreur("hors_entreprise", "Tâche introuvable dans cette entreprise.");
    const brutes = await lecture.parTache(r.companyId, issueId!);
    const liaisons = brutes.map((l) => vueLiaison(l, r.companyId, issueId!)).filter((v): v is VueLiaison => v !== null);
    return { statut: 200, corps: { liaisons } satisfies ReponseLireLiaisons };
  };

  return routes;
}
