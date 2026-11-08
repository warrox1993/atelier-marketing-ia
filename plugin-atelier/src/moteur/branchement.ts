/**
 * Branchement du moteur de missions (#49) sur l'hôte : exécuteur, reprise au démarrage et sur minuterie, filet `issue.updated`.
 * Sorti de `worker.ts` pour être testable avec un faux `ctx` ; même forme que `creerVeilleur` (`demarrer` / `arreter`).
 */
import type { PluginContext, PluginToolDeclaration } from "@paperclipai/plugin-sdk";
import type { Services } from "../serveur/atelier.js";
import { creerBase } from "../serveur/base.js";
import { creerServices } from "../serveur/services.js";
import { routesLancement } from "../serveur/services-discussion.js";
import { VEILLEUR } from "../serveur/veilleur.js";
import { agentParSlug, creerExecuteur, creerResolveur, moteurActif, reprendreSiActif, type DepsPorteMoteur } from "./executeur.js";
import { PorteRefusee } from "./gabarits.js";
import { creerOutilsMoteur, type EvaluerPorte, DECLARATION_MISSION_ETAT, DECLARATION_LIVRABLE_DEPOSER, DECLARATION_VERDICT_DEPOSER, DECLARATION_DECISION_DEMANDER, DECLARATION_SOURCES_LISTER } from "./outils.js";

type BaseMoteur = ReturnType<typeof creerBase>;

const configDe = (ctx: PluginContext) => async (companyId: string) => (await ctx.config.get(companyId)) as Record<string, unknown> | null;
const agentsDeCtx = (ctx: PluginContext) => async (companyId: string) => (await ctx.agents.list({ companyId, limit: 200 })).filter((a) => a.companyId === companyId);

/** Dépendances de la porte des missions : fiche du client, exigences de la campagne, politique native, humain responsable. */
export function depsPorte(ctx: PluginContext, baseMoteur: BaseMoteur): DepsPorteMoteur {
  const configMoteur = configDe(ctx);
  const agentsDe = agentsDeCtx(ctx);
  return {
    creerPorte: (p) => baseMoteur.creerPorte(p),
    majPolitique: (issueId, companyId, politique) => ctx.issues.update(issueId, { executionPolicy: politique } as never, companyId),
    // Même lecture que `conformiteImposee` des services : la fiche du client active un module de conformité.
    conformiteImposee: async (companyId) => ((await baseMoteur.marques(companyId))[0]?.modulesConformite ?? []).length > 0,
    // Toutes les exigences de la campagne sont ciblées (le gabarit n'en choisit pas) ; liste vide si elle n'en a pas.
    exigences: async (companyId, campagneId) => (await baseMoteur.listerExigences(companyId, campagneId)).map((e) => e.code),
    // Humain responsable : réglage `humainDestinataire`, sinon « local-board » hors mode authenticated (comme les services, sans l'historique de décisions).
    // shortcut: en mode authenticated sans humainDestinataire, pas de repli sur l'auteur de la dernière décision comme humainDestinataire des services (mission en blocage), à ajouter si une mission relance une tâche déjà décidée.
    resolveur: async (companyId) => {
      const reglage = (await configMoteur(companyId))?.humainDestinataire;
      const humain = typeof reglage === "string" && reglage.trim() !== "" ? reglage.trim() : (process.env["PAPERCLIP_DEPLOYMENT_MODE"] ?? "").trim() !== "authenticated" ? "local-board" : null;
      // Refus définitif : un humain absent ne se répare pas en retentant à chaque passe.
      if (!humain || !/^[A-Za-z0-9_-]{3,128}$/u.test(humain)) throw new PorteRefusee("Humain responsable inconnu : renseignez humainDestinataire dans les réglages du plugin.");
      return creerResolveur(await agentsDe(companyId), humain);
    },
  };
}

/** Révision courante du document livrable de la tâche, à la clé de sa porte ; null sans porte ou sans document. */
export const revisionLivrableDe = (ctx: PluginContext, baseMoteur: BaseMoteur) => async (companyId: string, issueId: string) => {
  const porte = await baseMoteur.lirePorte(companyId, issueId);
  return porte ? ((await ctx.issues.documents.get(issueId, porte.cleLivrable, companyId))?.latestRevisionId ?? null) : null;
};

/** `routes` et `evaluerPorte` : ceux des services du plugin (verdicts et porte) ; sans eux, des services neufs sur la même base sont créés au premier appel. */
export function brancherMoteur(ctx: PluginContext, baseMoteur: BaseMoteur = creerBase(ctx.db), routes?: Services["routes"], evaluerPorte?: EvaluerPorte) {
  const configMoteur = configDe(ctx);
  const agentsDe = agentsDeCtx(ctx);
  // `companies.list` pagine : on lit jusqu'à une page incomplète.
  const entreprisesDeLInstance = async () => {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await ctx.companies.list({ limit: 100, offset });
      ids.push(...page.map((c) => c.id));
      if (page.length < 100) return ids;
    }
  };
  const moteur = creerExecuteur({
    hote: {
      issues: ctx.issues,
      // Slug enregistré à l'import (`metadata.atelier.slug`), comme `tache.mettre-sous-porte` ; aucun ou plusieurs agents : pas d'agent.
      resoudreAgent: async (companyId, role) => agentParSlug(await agentsDe(companyId), role),
    },
    base: baseMoteur,
    porte: depsPorte(ctx, baseMoteur),
    horloge: () => new Date(),
    revisionLivrable: revisionLivrableDe(ctx, baseMoteur),
  });
  // La route de lancement a besoin de l'exécuteur : elle s'ajoute ici aux routes du plugin (l'hôte les relit à chaque requête).
  if (routes) Object.assign(routes, routesLancement({ ctx, base: baseMoteur, executeur: moteur }));
  let secours: Services | undefined;
  const services = () => (secours ??= creerServices(ctx, { base: baseMoteur }));
  const verdict: Required<Services["routes"]>["tache.verdict"] = (r) => (routes ?? services().routes)["tache.verdict"]!(r);
  const evaluer: EvaluerPorte = (companyId, issueId, par) => (evaluerPorte ?? services().evaluerPorte!)(companyId, issueId, par);
  // Enregistrés même moteur désactivé (le réglage est par entreprise) : chaque appel refuse alors en `moteur_desactive`.
  const outils = creerOutilsMoteur({ config: configMoteur, base: baseMoteur, tacheDuRun: (companyId, runId) => baseMoteur.tacheDuRun(companyId, runId), agents: agentsDe, executeur: moteur, issues: ctx.issues, routes: { "tache.verdict": verdict }, evaluerPorte: evaluer, revisionLivrable: revisionLivrableDe(ctx, baseMoteur) });
  // Noms littéraux : le contrôle du dépôt (verifier-organisation) les lit pour classer chaque outil par rôle.
  const meta = ({ name: _nom, ...reste }: PluginToolDeclaration) => reste;
  ctx.tools.register("mission_etat", meta(DECLARATION_MISSION_ETAT), (p, run) => outils.mission_etat(p, run));
  ctx.tools.register("livrable_deposer", meta(DECLARATION_LIVRABLE_DEPOSER), (p, run) => outils.livrable_deposer(p, run));
  ctx.tools.register("verdict_deposer", meta(DECLARATION_VERDICT_DEPOSER), (p, run) => outils.verdict_deposer(p, run));
  ctx.tools.register("decision_demander", meta(DECLARATION_DECISION_DEMANDER), (p, run) => outils.decision_demander(p, run));
  ctx.tools.register("sources_lister", meta(DECLARATION_SOURCES_LISTER), (p, run) => outils.sources_lister(p, run));
  const reprise = () => reprendreSiActif({ entreprises: entreprisesDeLInstance, config: configMoteur, executeur: moteur, logger: ctx.logger });
  // Une passe qui chevauche la précédente ne fait rien ; `enCours` retombe aussi après une erreur.
  let enCours = false;
  const passe = async () => {
    if (enCours) return;
    enCours = true;
    try {
      await reprise();
    } finally {
      enCours = false;
    }
  };
  const lancer = () => {
    passe().catch((e) => ctx.logger.warn("Moteur de missions : passe en échec", { erreur: e instanceof Error ? e.message : String(e) }));
  };
  let minuterie: ReturnType<typeof setInterval> | null = null;
  return {
    demarrer() {
      if (minuterie) return;
      // Reprise au démarrage et sur minuterie (écart 4), filet `issue.updated` ; rien sans le réglage `moteurMissions`.
      lancer();
      minuterie = setInterval(lancer, VEILLEUR.intervalleMs);
      (minuterie as { unref?: () => void }).unref?.();
      ctx.events.on("issue.updated", async (event) => {
        try {
          if (!event.entityId || (event.entityType && event.entityType !== "issue")) return;
          if (!moteurActif(await configMoteur(event.companyId))) return;
          // `done` : filet de l'approbation ; toute autre mise à jour : un refus humain à l'approbation (changements demandés) se lit dans l'état natif.
          if ((event.payload as { changes?: { status?: { to?: unknown } } } | null)?.changes?.status?.to === "done") await moteur.surDoneNatif(event.companyId, event.entityId);
          else await moteur.surChangementsNatifs(event.companyId, event.entityId);
        } catch (e) {
          ctx.logger.warn("Moteur de missions : abonné issue.updated en échec", { erreur: e instanceof Error ? e.message : String(e) });
        }
      });
    },
    arreter() {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
    },
  };
}
