/**
 * Branchement du moteur de missions (#49) sur l'hôte : exécuteur, reprise au démarrage et sur minuterie, filet `issue.updated`.
 * Sorti de `worker.ts` pour être testable avec un faux `ctx` ; même forme que `creerVeilleur` (`demarrer` / `arreter`).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { creerBase } from "../serveur/base.js";
import { VEILLEUR } from "../serveur/veilleur.js";
import { agentParSlug, creerExecuteur, creerResolveur, moteurActif, reprendreSiActif, type DepsPorteMoteur } from "./executeur.js";
import { PorteRefusee } from "./gabarits.js";

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

export function brancherMoteur(ctx: PluginContext, baseMoteur: BaseMoteur = creerBase(ctx.db)) {
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
  });
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
          if ((event.payload as { changes?: { status?: { to?: unknown } } } | null)?.changes?.status?.to !== "done") return;
          if (moteurActif(await configMoteur(event.companyId))) await moteur.surDoneNatif(event.companyId, event.entityId);
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
