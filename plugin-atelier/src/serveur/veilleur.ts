/**
 * Veilleur des tâches orphelines (16/10/2026).
 *
 * Constat réel : après un redémarrage de l'instance pendant un passage d'agent (passage
 * « interrupted »), la tâche est restée « en cours », assignée à l'agent, sans aucun passage
 * pendant longtemps ; la récupération du socle l'a ignorée et un commentaire humain ne l'a pas
 * réveillée. Le veilleur repère ces tâches toutes les quelques minutes et réveille l'agent par le
 * mécanisme natif (`ctx.issues.requestWakeup`).
 *
 * Garde-fous (jamais de boucle) :
 * - candidates seulement si rien n'a bougé depuis `seuil` minutes (`base.tachesOrphelines`) ;
 * - au plus UN réveil par tâche et par période (journal `veilleur.reveil`, persistant) ;
 * - au plus `maxReveils` (3) réveils AU TOTAL par tâche depuis la dernière action humaine (décision de
 *   l'atelier ou `cycles.remise_humaine`), puis un seul abandon journalisé (l'humain voit) ;
 * - au plus `maxReveilsParPasse` (10) réveils par passe, toutes entreprises confondues ;
 * - sont écartées par la sélection : issue de discussion, passage arrêté pour tours épuisés, budget, quota ou authentification ;
 * - une tâche qui attend une réponse humaine (interaction en attente) n'est jamais réveillée ;
 * - agents en pause écartés (choix de l'opérateur), comme les tâches terminées ;
 * - filet de la chaîne (21/10/2026) : les tâches `in_review` et `blocked` (sans porte active, sans bloqueur ouvert, sans
 *   interaction humaine en attente) sont aussi réveillées après le seuil, avec les mêmes plafonds. Revue M4 (21/10/2026) : pas non
 *   plus quand une liaison `en_attente_approbation`, une approbation Paperclip en attente ou une revue ouverte qui la cite
 *   gère déjà la tâche, et `blocked` seulement si le dernier passage a échoué ou été interrompu (jamais un blocage volontaire).
 *
 * Minuterie du worker plutôt que les « jobs » du SDK : la capacité `jobs.schedule` serait nouvelle
 * et ferait échouer la mise à niveau du plugin tant qu'un administrateur ne l'a pas approuvée.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { BaseAtelier } from "./base.js";

export const VEILLEUR = {
  seuilMinutesDefaut: 15,
  seuilMinutesMin: 5,
  seuilMinutesMax: 1440,
  intervalleMs: 5 * 60 * 1000,
  maxReveils: 3,
  maxReveilsParPasse: 10,
  typeRemiseHumaine: "cycles.remise_humaine",
  typeReveil: "veilleur.reveil",
  typeAbandon: "veilleur.abandon",
} as const;

export interface DependancesVeilleur {
  base: Pick<BaseAtelier, "entreprisesSuivies" | "tachesOrphelines" | "datesJournal" | "journaliser" | "listerDecisions">;
  issues: Pick<PluginContext["issues"], "listInteractions" | "requestWakeup">;
  logger: Pick<PluginContext["logger"], "info" | "warn">;
  /** Configuration de l'entreprise (instanceConfigSchema) ; `veilleurSeuilMinutes` facultatif. */
  config: (companyId: string) => Promise<Record<string, unknown> | null | undefined>;
  maintenant?: () => Date;
}

export function seuilMinutes(config: Record<string, unknown> | null | undefined): number {
  const v = Number(config?.veilleurSeuilMinutes);
  if (!Number.isInteger(v)) return VEILLEUR.seuilMinutesDefaut;
  return Math.min(VEILLEUR.seuilMinutesMax, Math.max(VEILLEUR.seuilMinutesMin, v));
}

export interface ResultatPasse {
  reveillees: string[];
  ignorees: Array<{ issueId: string; raison: "deja_reveillee_dans_la_periode" | "plafond_total" | "plafond_passe" | "attente_humaine" }>;
  echecs: Array<{ issueId: string; erreur: string }>;
}

export function creerVeilleur(d: DependancesVeilleur) {
  const maintenant = d.maintenant ?? (() => new Date());
  let enCours = false;
  let minuterie: ReturnType<typeof setInterval> | null = null;

  async function passeEntreprise(companyId: string, r: ResultatPasse, tentatives: { n: number }) {
    let config: Record<string, unknown> | null | undefined = null;
    try {
      config = await d.config(companyId);
    } catch {
      config = null;
    }
    const seuil = seuilMinutes(config);
    const now = maintenant().getTime();
    const debutPeriode = new Date(now - seuil * 60_000).toISOString();
    for (const t of await d.base.tachesOrphelines(companyId, seuil)) {
      const reveils = await d.base.datesJournal(companyId, t.issueId, VEILLEUR.typeReveil);
      if (reveils.some((le) => le > debutPeriode)) {
        r.ignorees.push({ issueId: t.issueId, raison: "deja_reveillee_dans_la_periode" });
        continue;
      }
      // Remise à zéro seulement par une action humaine : décision de l'atelier ou renvoi au travail dans le socle.
      const [decisions, remises] = await Promise.all([
        d.base.listerDecisions(companyId, t.issueId),
        d.base.datesJournal(companyId, t.issueId, VEILLEUR.typeRemiseHumaine),
      ]);
      const actionsHumaines = [...decisions.map((x) => x.creeLe), ...remises].sort();
      const derniereAction = actionsHumaines[actionsHumaines.length - 1] ?? "";
      if (reveils.filter((le) => le > derniereAction).length >= VEILLEUR.maxReveils) {
        r.ignorees.push({ issueId: t.issueId, raison: "plafond_total" });
        const abandons = await d.base.datesJournal(companyId, t.issueId, VEILLEUR.typeAbandon);
        if (!abandons.some((le) => le > derniereAction)) {
          await d.base.journaliser({
            companyId, type: VEILLEUR.typeAbandon, entite: "tache", entiteId: t.issueId, issueId: t.issueId, acteur: "atelier:veilleur",
            donnees: { identifiant: t.identifier, agentId: t.agentId, reveils: VEILLEUR.maxReveils, dernierRun: t.dernierRun },
          });
          d.logger.warn("Veilleur : tâche toujours orpheline après le plafond de réveils, intervention humaine nécessaire", { issueId: t.issueId, identifiant: t.identifier });
        }
        continue;
      }
      if (VEILLEUR.maxReveilsParPasse - tentatives.n <= 0) {
        r.ignorees.push({ issueId: t.issueId, raison: "plafond_passe" });
        continue;
      }
      const interactions = await d.issues.listInteractions(t.issueId, companyId);
      if (interactions.some((i) => i.status === "pending")) {
        r.ignorees.push({ issueId: t.issueId, raison: "attente_humaine" });
        continue;
      }
      tentatives.n += 1;
      let resultat: { queued: boolean; runId: string | null } | null = null;
      let erreur: string | null = null;
      try {
        resultat = await d.issues.requestWakeup(t.issueId, companyId, {
          reason: "atelier_veilleur_tache_orpheline",
          contextSource: "atelier.veilleur",
          idempotencyKey: `atelier-veilleur-${t.issueId}-${Math.floor(now / (seuil * 60_000))}`,
        });
      } catch (err) {
        erreur = err instanceof Error ? err.message : String(err);
      }
      // Journalisé même en cas d'échec : la période compte, aucune relance en boucle.
      await d.base.journaliser({
        companyId, type: VEILLEUR.typeReveil, entite: "tache", entiteId: t.issueId, issueId: t.issueId, acteur: "atelier:veilleur",
        donnees: { identifiant: t.identifier, statut: t.statut, agentId: t.agentId, dernierRun: t.dernierRun, seuilMinutes: seuil, resultat, erreur },
      });
      if (erreur) {
        r.echecs.push({ issueId: t.issueId, erreur });
        d.logger.warn("Veilleur : réveil refusé", { issueId: t.issueId, identifiant: t.identifier, erreur });
      } else {
        r.reveillees.push(t.issueId);
        d.logger.info("Veilleur : tâche orpheline réveillée", { issueId: t.issueId, identifiant: t.identifier, runId: resultat?.runId ?? null });
      }
    }
  }

  /** Une passe sur toutes les entreprises suivies ; une seule passe à la fois. */
  async function passe(): Promise<ResultatPasse> {
    const r: ResultatPasse = { reveillees: [], ignorees: [], echecs: [] };
    const tentatives = { n: 0 };
    if (enCours) return r;
    enCours = true;
    try {
      for (const companyId of await d.base.entreprisesSuivies()) {
        try {
          await passeEntreprise(companyId, r, tentatives);
        } catch (err) {
          d.logger.warn("Veilleur : passe interrompue pour une entreprise", { companyId, erreur: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      enCours = false;
    }
    return r;
  }

  return {
    passe,
    demarrer(intervalleMs: number = VEILLEUR.intervalleMs) {
      if (minuterie) return;
      minuterie = setInterval(() => {
        passe().catch((err) => d.logger.warn("Veilleur : passe en échec", { erreur: err instanceof Error ? err.message : String(err) }));
      }, intervalleMs);
      (minuterie as { unref?: () => void }).unref?.();
    },
    arreter() {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
    },
  };
}
