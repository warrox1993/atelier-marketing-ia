/**
 * Branchement du moteur de missions (#49) sur l'hôte : exécuteur, reprise au démarrage et sur minuterie, filet `issue.updated`.
 * Sorti de `worker.ts` pour être testable avec un faux `ctx` ; même forme que `creerVeilleur` (`demarrer` / `arreter`).
 */
import type { PluginContext, PluginToolDeclaration } from "@paperclipai/plugin-sdk";
import type { ActeurHote, GestionnaireRoute, Services } from "../serveur/atelier.js";
import { creerBase } from "../serveur/base.js";
import { creerServices } from "../serveur/services.js";
import { routesLancement } from "../serveur/services-discussion.js";
import { VEILLEUR } from "../serveur/veilleur.js";
import { agentParSlug, creerExecuteur, creerResolveur, moteurActif, reprendreSiActif, type DepsPorteMoteur } from "./executeur.js";
import { creerEtapesWf01, type CrmMoteur } from "./export-crm.js";
import { chargerGabarit, PorteRefusee, rangPorte } from "./gabarits.js";
import { creerOutilsMoteur, type EvaluerPorte, DECLARATION_MISSION_ETAT, DECLARATION_LIVRABLE_DEPOSER, DECLARATION_VERDICT_DEPOSER, DECLARATION_DECISION_DEMANDER, DECLARATION_SOURCES_LISTER } from "./outils.js";

type BaseMoteur = ReturnType<typeof creerBase>;

const configDe = (ctx: PluginContext) => async (companyId: string) => (await ctx.config.get(companyId)) as Record<string, unknown> | null;
const agentsDeCtx = (ctx: PluginContext) => async (companyId: string) => (await ctx.agents.list({ companyId, limit: 200 })).filter((a) => a.companyId === companyId);

const ACTEUR_MOTEUR: ActeurHote = { type: "systeme", id: "moteur-missions", agentId: null, userId: null, runId: null };
/** États d'une diffusion acceptée : simulée (démonstration) ou confirmée. « Préparée » (preuve signée) n'est pas une écriture : l'agent CRM l'exécute. */
const EXPORT_ACCEPTE = new Set(["simulee", "confirmee"]);
const objet = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * CRM de production : l'écriture passe par la route `tache.prospects.exporter`, un seul appel par lot. La route exige la décision humaine
 * « modifier_crm » sur l'appel exact : le moteur ne la crée, ne la simule et ne la contourne jamais. Une diffusion acceptée est une écriture ;
 * l'attente d'approbation et le refus (prospects refusés, avec leur motif) sont rendus tels quels à `exporterLot` ; une diffusion préparée est à exécuter par l'agent CRM
 * (le moteur ne détient jamais la preuve signée : elle est jetée ici) ; tout autre état (ambigu) lève une erreur.
 */
export function creerCrmProduction(base: BaseMoteur, exporter: GestionnaireRoute, modeDe: (companyId: string, campagneId: string | null) => Promise<"demonstration" | "reel">): CrmMoteur {
  /** Mission, périmètre (service, canal, entité) de l'étape 1 et tâche de la porte. */
  const perimetre = async (companyId: string, missionId: string) => {
    const m = await base.lireMission(companyId, missionId);
    if (!m) throw new Error(`Mission « ${missionId} » inconnue.`);
    const etapes = (await base.lireEtapes(companyId, m.id)).filter((x) => x.tentative === 1);
    const { service, canal, entite } = objet(objet(etapes.find((x) => x.rang === 1)?.entree).exportCrm);
    const issueId = etapes.find((x) => x.rang === rangPorte(chargerGabarit(m.gabaritCle, m.gabaritVersion)))?.issueId;
    if (typeof service !== "string" || typeof canal !== "string" || typeof entite !== "string" || !issueId) throw new Error("Export CRM : périmètre (service, canal, entité) ou tâche de la porte introuvable.");
    return { m, service, canal, entite, issueId };
  };
  return {
    async existe(companyId, missionId, prospectId) {
      const { m, service, issueId } = await perimetre(companyId, missionId);
      return base.prospectDansExportNonRefuse(companyId, prospectId, service, await modeDe(companyId, m.campagneId), issueId);
    },
    async confirme(companyId, missionId, prospectId) {
      const { m, service } = await perimetre(companyId, missionId);
      return base.prospectExportConfirme(companyId, prospectId, service, await modeDe(companyId, m.campagneId));
    },
    async ambigu(companyId, missionId, prospectId) {
      const { m, service } = await perimetre(companyId, missionId);
      return base.prospectExportAmbigu(companyId, prospectId, service, await modeDe(companyId, m.campagneId));
    },
    async ecrire(companyId, e) {
      const { service, canal, entite, issueId } = await perimetre(companyId, e.missionId);
      const rep = await exporter({ cle: "tache.prospects.exporter", params: { issueId }, query: {}, companyId, acteur: ACTEUR_MOTEUR, corps: { prospectIds: e.prospectIds, service, canal, entite, cleIdempotence: e.cle } });
      const corps = objet(rep.corps);
      const etat = String(corps.etat);
      const consigne = typeof corps.consigne === "string" ? corps.consigne : null;
      if (EXPORT_ACCEPTE.has(etat)) return { etat: "acceptee" };
      if (etat === "preparee") {
        // Premier appel ou rejeu de la clé : jamais de lecture de `preuveApprobation`.
        const diffusionId = objet(corps.export).diffusionId;
        const cleDiffusion = `export:${e.cle}`.slice(0, 200);
        const interne = typeof diffusionId === "string" ? await base.lireDiffusionInterne(companyId, diffusionId) : null;
        if (!interne) throw new Error("Export CRM : diffusion préparée introuvable.");
        if (interne.revocation) return { etat: "bloquee", raison: "preuve_revoquee", motif: interne.revocation.motif };
        const diffusion = await base.lireDiffusionParCle(companyId, cleDiffusion);
        const motifPrepare = diffusion?.motifRefus ?? null;
        if (!interne.preuveCharge) return { etat: "bloquee", raison: "preuve_non_signee", motif: motifPrepare };
        // `expire` est en secondes (charge de la preuve, signatures.ts).
        if (interne.preuveCharge.expire * 1000 <= Date.now()) return { etat: "bloquee", raison: "preuve_expiree", motif: motifPrepare };
        // L'appel à relire : rendu par la route au premier appel ; au rejeu de la clé, retrouvé par la révision, le service, l'outil et l'empreinte des arguments de la diffusion.
        const appelId = typeof objet(corps.appel).id === "string" ? (objet(corps.appel).id as string)
          : (await base.listerAppels(companyId, issueId)).find((a) => a.revisionId === diffusion?.revisionId && a.service === interne.service && a.outil === interne.outil && a.empreinteArguments === interne.empreinteArguments)?.id;
        if (!appelId) return { etat: "bloquee", raison: "appel_introuvable", motif: null };
        return { etat: "a_executer", diffusionId: interne.id, cleDiffusion, appelId };
      }
      if (etat === "en_attente_approbation") {
        // Refus humain de la révision courante : rien ne partira sous cette décision, la mission s'arrête au lieu d'attendre.
        if (corps.decisionRefusee === true) return { etat: "bloquee", raison: "decision_refusee", motif: consigne };
        return { etat: "en_attente", appelId: typeof objet(corps.appel).id === "string" ? (objet(corps.appel).id as string) : null, consigne };
      }
      const motifRefus = objet(corps.export).motifRefus;
      if (etat === "refusee") {
        const refuses = (Array.isArray(corps.verifications) ? corps.verifications : []).map(objet).filter((v) => v.ok === false).map((v) => ({ prospectId: String(v.prospectId), motif: String(v.motif ?? "refusé") }));
        return { etat: "refusee", refuses, motif: typeof motifRefus === "string" ? motifRefus : "Export refusé." };
      }
      throw new Error(`Export CRM non accepté (état ${etat}, statut ${rep.statut ?? 200}).${consigne ? ` ${consigne}` : typeof motifRefus === "string" ? ` ${motifRefus}` : ""}`);
    },
  };
}

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

/** `routes`, `evaluerPorte` et `lecturesMoteur` : ceux des services du plugin (verdicts, porte, export CRM, lectures des étapes en code) ; sans eux, des services neufs sur la même base sont créés au premier appel. */
export function brancherMoteur(ctx: PluginContext, baseMoteur: BaseMoteur = creerBase(ctx.db), routes?: Services["routes"], evaluerPorte?: EvaluerPorte, lecturesMoteur?: Services["lecturesMoteur"]) {
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
  let secours: Services | undefined;
  const services = () => (secours ??= creerServices(ctx, { base: baseMoteur }));
  const lectures = () => (lecturesMoteur ?? services().lecturesMoteur)!;
  const exporter: GestionnaireRoute = (r) => (routes ?? services().routes)["tache.prospects.exporter"]!(r);
  // Étapes en code de WF-01 : lectures et route résolues à l'appel, comme le verdict et la porte (les services peuvent naître après le moteur).
  const etapesCode = creerEtapesWf01({
    lireProspects: (c, ids) => lectures().lireProspectsMoteur!(c, ids),
    contexteExclusions: (c, campagneId, prospects) => lectures().contexteExclusionsMoteur!(c, campagneId, prospects),
    deps: { crm: creerCrmProduction(baseMoteur, exporter, (c, campagneId) => lectures().modeMoteur!(c, campagneId)), base: baseMoteur },
  });
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
    etapesCode,
  });
  // La route de lancement a besoin de l'exécuteur : elle s'ajoute ici aux routes du plugin (l'hôte les relit à chaque requête).
  if (routes) Object.assign(routes, routesLancement({ ctx, base: baseMoteur, executeur: moteur }));
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
