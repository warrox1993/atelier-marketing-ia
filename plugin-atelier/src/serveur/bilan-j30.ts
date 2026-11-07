/**
 * Bilan J+30 : créé en code à la confirmation RÉELLE d'une diffusion (jamais à l'approbation, jamais pour une diffusion
 * simulée, préparée ou refusée). Tâche racine en `backlog` pour l'agent Mesure, dans le projet de la campagne, que la tâche
 * récurrente `mesure-mensuelle` retrouve par `q=Bilan` et dont elle lit la date « à partir du » dans le titre.
 * Trouver-ou-créer par `originId` `bilan-j30:<idDiffusion>` : un rejeu de la confirmation ne crée pas de doublon.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "../contrats/index.js";
import type { BaseAtelier } from "./base.js";
import { agentEstRole, lireRolesAgents } from "./services-experiences.js";

const MESURE_MAX = 300;
/** Objectifs écrits par un agent : bornés à 300 caractères avant d'entrer dans la description d'une tâche. */
export function mesureAttendue(objectifs: string[]): string {
  if (objectifs.length === 0) return "non précisée";
  const t = objectifs.join(" ; ");
  return t.length > MESURE_MAX ? `${t.slice(0, MESURE_MAX)}…` : t;
}

export const ORIGINE_BILAN = `plugin:${PLUGIN_ID}:bilan-j30` as const;
const JOURS = 30;
const verrous = new Map<string, Promise<unknown>>();

export interface EntreeBilan {
  companyId: string;
  /** Tâche de la campagne portant la diffusion. */
  tache: { id: string; identifier?: string | null };
  diffusion: { id: string; action: string; canal: string };
  campagneId: string;
  confirmeeLe: Date;
}

export const dateBilan = (confirmeeLe: Date) => new Date(confirmeeLe.getTime() + JOURS * 86_400_000).toISOString().slice(0, 10);

/**
 * Rattrapage (veilleur) : crée le bilan des diffusions confirmées dont la création a échoué à la confirmation. Sans doublon
 * (`originId`), sans journal répété sans agent Mesure (la trace de `assurerBilanJ30` écarte la diffusion). Une panne sur une diffusion
 * n'empêche pas les suivantes ; elle est retentée à la passe suivante.
 */
export async function rattraperBilansJ30(d: { ctx: PluginContext; base: BaseAtelier }, companyId: string): Promise<number> {
  let crees = 0;
  for (const f of await d.base.diffusionsConfirmeesSansBilan(companyId)) {
    try {
      const tache = await d.ctx.issues.get(f.issueId, companyId);
      if (!tache) continue;
      if (await assurerBilanJ30(d, { companyId, tache, diffusion: f, campagneId: f.campagneId, confirmeeLe: new Date(f.confirmeeLe) })) crees += 1;
    } catch (err) {
      d.ctx.logger.warn("Bilan J+30 : rattrapage en échec", { diffusionId: f.id, erreur: err instanceof Error ? err.message : String(err) });
    }
  }
  return crees;
}

/** Rend l'identifiant de la tâche de bilan (créée ou déjà là), ou null sans agent Mesure. */
export function assurerBilanJ30(d: { ctx: PluginContext; base: BaseAtelier }, e: EntreeBilan): Promise<string | null> {
  const originId = `bilan-j30:${e.diffusion.id}`;
  const cle = `${e.companyId}:${originId}`;
  const enCours = verrous.get(cle);
  if (enCours) return enCours as Promise<string | null>;
  const p = (async () => {
    const { ctx, base } = d;
    const deja = (await ctx.issues.list({ companyId: e.companyId, originKind: ORIGINE_BILAN as never, originId, includePluginOperations: true, limit: 5 }))
      .find((i) => i.companyId.toLowerCase() === e.companyId.toLowerCase() && i.originId === originId);
    if (deja) {
      // Tâche déjà là sans journal : on le pose, pour que le rattrapage ne relise plus cette diffusion.
      if (!(await base.journalExiste(e.companyId, "diffusion.bilan_cree", e.diffusion.id))) {
        await base.journaliser({ companyId: e.companyId, type: "diffusion.bilan_cree", entite: "diffusion", entiteId: e.diffusion.id, issueId: deja.id, acteur: "plugin", donnees: { apartirDu: dateBilan(e.confirmeeLe) } });
      }
      return deja.id;
    }
    // Une panne de lecture de la configuration remonte (la confirmation et le rattrapage l'attrapent, le veilleur retente).
    const roles = lireRolesAgents(await ctx.config.get(e.companyId));
    const mesure = (await ctx.agents.list({ companyId: e.companyId, limit: 200 })).find((a) => a.status !== "terminated" && a.companyId.toLowerCase() === e.companyId.toLowerCase() && agentEstRole(a, "mesure", roles));
    if (!mesure) {
      await base.journaliser({ companyId: e.companyId, type: "diffusion.bilan_sans_mesure", entite: "diffusion", entiteId: e.diffusion.id, issueId: e.tache.id, acteur: "plugin", donnees: {} });
      return null;
    }
    const campagne = await base.lireCampagne(e.companyId, e.campagneId);
    const metrique = mesureAttendue(campagne?.objectifs ?? []);
    const tache = await ctx.issues.create({
      companyId: e.companyId, ...(campagne ? { projectId: campagne.projectId } : {}),
      title: `Bilan J+30 de ${e.diffusion.action} sur ${e.diffusion.canal} (à partir du ${dateBilan(e.confirmeeLe)})`,
      description: `Tâche de la campagne : ${e.tache.identifier ?? e.tache.id}. Canal : ${e.diffusion.canal}. Diffusion : ${e.diffusion.id}. Mesure attendue (donnée déclarée) : ${metrique}.`,
      status: "backlog", priority: "medium", assigneeAgentId: mesure.id, originKind: ORIGINE_BILAN as never, originId,
    });
    await base.journaliser({ companyId: e.companyId, type: "diffusion.bilan_cree", entite: "diffusion", entiteId: e.diffusion.id, issueId: tache.id, acteur: "plugin", donnees: { mesure: mesure.id, apartirDu: dateBilan(e.confirmeeLe) } });
    return tache.id;
  })();
  verrous.set(cle, p);
  return p.finally(() => verrous.delete(cle));
}
