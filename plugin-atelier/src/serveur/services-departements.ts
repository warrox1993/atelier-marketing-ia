/**
 * Tableau des départements d'un client : routes `departements.lister` et `departement.etat` (humain seulement).
 *
 * - `departements.lister` ne lit que la déclaration des services (`services_entreprises`) du client de l'entreprise de
 *   la requête : aucun appel à l'hôte, aucun service d'un autre client.
 * - `departement.etat` lit l'état de l'entreprise de la requête, et d'elle seule : tous les appels à l'hôte portent
 *   `r.companyId` (l'hôte refuse les autres pendant une route, `requireInvocationCompanyScope`). L'interface lit donc
 *   une case par appel, et l'hôte contrôle à chaque appel que l'utilisateur a accès à ce service.
 */
import type { Agent, Issue, PluginContext } from "@paperclipai/plugin-sdk";
import {
  BORNE_TACHES_DEPARTEMENT,
  compteDansAFaire,
  MOTIFS_PAUSE,
  type AlerteDepartement,
  type CleRouteApi,
  type DepartementDeclare,
  type EtatDepartement,
  type ReponseDepartements,
} from "../contrats/index.js";
import { nomService } from "../contrats/liaisons-lecture.js";
import type { GestionnaireRoute, RequeteRoute } from "./atelier.js";
import { iso } from "./base.js";
import { erreur } from "./erreurs.js";
import type { StockLiaisons } from "./liaisons/base-liaisons.js";
import { exigerHumainLecture } from "./liaisons/lire.js";

export interface DependancesDepartements {
  ctx: Pick<PluginContext, "agents" | "issues" | "companies" | "logger">;
  stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">;
  /** Éléments d'« À faire » de l'entreprise de la requête (gestionnaire `accueil.lister`, même requête). */
  aFaire(r: RequeteRoute): Promise<ReadonlyArray<{ type: string; urgence: string }>>;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Direction d'abord, puis par nom lisible. */
function ordonner(a: DepartementDeclare, b: DepartementDeclare): number {
  if (a.estDirection !== b.estDirection) return a.estDirection ? -1 : 1;
  return a.nom.localeCompare(b.nom, "fr");
}

export function routesDepartements(d: DependancesDepartements): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, stock } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  routes["departements.lister"] = async (r) => {
    exigerHumainLecture(r.acteur, "Le tableau des départements");
    const service = await stock.serviceDeEntreprise(r.companyId);
    if (!service) {
      const corps: ReponseDepartements = { client: null, departements: [] };
      return { statut: 200, corps };
    }
    const services = (await stock.servicesDuClient(service.clientMarqueur)).filter((s) => s.clientMarqueur === service.clientMarqueur);
    const departements = services
      .map((s): DepartementDeclare => ({ companyId: s.companyId, slug: s.serviceSlug, nom: nomService(s.serviceSlug), estDirection: s.estDirection, courant: s.companyId === r.companyId }))
      .sort(ordonner);
    const corps: ReponseDepartements = { client: service.clientMarqueur, departements };
    return { statut: 200, corps };
  };

  routes["departement.etat"] = async (r) => {
    exigerHumainLecture(r.acteur, "Le tableau des départements");
    const c = r.companyId;
    const service = await stock.serviceDeEntreprise(c);
    if (!service) erreur("introuvable", "Cette entreprise n'est déclarée comme service d'aucun client.");

    const manquants: string[] = [];
    const lire = async <T>(quoi: string, lecture: () => Promise<T>, repli: T): Promise<T> => {
      try {
        return await lecture();
      } catch (e) {
        manquants.push(quoi);
        ctx.logger.warn("Départements : lecture indisponible", { quoi, erreur: e instanceof Error ? e.message : String(e) });
        return repli;
      }
    };
    const [societe, agents, enCours, bloquees, elements] = await Promise.all([
      lire("entreprise", () => ctx.companies.get(c), null),
      lire("agents", () => ctx.agents.list({ companyId: c, limit: 200 }), [] as Agent[]),
      lire("tâches en cours", () => ctx.issues.list({ companyId: c, status: "in_progress", limit: BORNE_TACHES_DEPARTEMENT }), [] as Issue[]),
      lire("tâches bloquées", () => ctx.issues.list({ companyId: c, status: "blocked", limit: BORNE_TACHES_DEPARTEMENT }), [] as Issue[]),
      lire("validations", () => d.aFaire(r), [] as ReadonlyArray<{ type: string; urgence: string }>),
    ]);

    // Défense en profondeur : rien d'une autre entreprise, même si l'hôte en renvoyait.
    const memeEntreprise = <T extends { companyId?: string | null }>(x: T) => x.companyId == null || x.companyId === c;
    const vivants = agents.filter(memeEntreprise).filter((a) => a.status !== "terminated");
    const tachesEnCours = enCours.filter(memeEntreprise).filter((i) => i.status === "in_progress");
    const tachesBloquees = bloquees.filter(memeEntreprise).filter((i) => i.status === "blocked");
    const agentsCompte = {
      actifs: vivants.filter((a) => a.status === "active" || a.status === "idle" || a.status === "running").length,
      enPause: vivants.filter((a) => a.status === "paused").length,
      enErreur: vivants.filter((a) => a.status === "error").length,
    };

    const attente = elements.filter(compteDansAFaire);
    const parType: Record<string, number> = {};
    for (const e of attente) parType[e.type] = (parType[e.type] ?? 0) + 1;

    const dates = [
      ...tachesEnCours.map((i) => i.updatedAt),
      ...tachesBloquees.map((i) => i.updatedAt),
      ...vivants.map((a) => a.lastHeartbeatAt),
    ]
      .filter((x): x is Date => x != null)
      .map((x) => iso(x))
      .filter((x) => x !== "" && !Number.isNaN(Date.parse(x)));
    const derniereActivite = dates.length ? dates.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;

    const enPause = societe?.status === "paused";
    const motifPause = enPause ? (societe?.pauseReason ? MOTIFS_PAUSE[societe.pauseReason] ?? societe.pauseReason : "motif non précisé") : null;
    const tachesTronquees = enCours.length >= BORNE_TACHES_DEPARTEMENT || bloquees.length >= BORNE_TACHES_DEPARTEMENT;

    const alertes: AlerteDepartement[] = [];
    if (enPause) alertes.push({ niveau: "haute", texte: `Service en pause : ${motifPause}.` });
    if (agentsCompte.enErreur) alertes.push({ niveau: "haute", texte: `${pluriel(agentsCompte.enErreur, "agent", "agents")} en erreur.` });
    if (tachesBloquees.length) alertes.push({ niveau: "moyenne", texte: `${pluriel(tachesBloquees.length, "tâche bloquée", "tâches bloquées")}.` });
    if (manquants.length) alertes.push({ niveau: "moyenne", texte: `Lecture partielle : ${manquants.join(", ")} indisponible${manquants.length > 1 ? "s" : ""}.` });

    const corps: EtatDepartement = {
      companyId: c,
      slug: service!.serviceSlug,
      nom: nomService(service!.serviceSlug),
      enPause,
      motifPause,
      agents: agentsCompte,
      taches: { enCours: tachesEnCours.length, bloquees: tachesBloquees.length },
      tachesTronquees,
      validations: { total: attente.length, parType },
      derniereActivite,
      alertes,
    };
    return { statut: 200, corps };
  };

  return routes;
}
