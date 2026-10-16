/**
 * Discussion avec le Coordinateur (humain seulement) : un fil de messages pour piloter l'atelier.
 *
 * Le fil est le fil de commentaires d'UNE issue native par entreprise, « Discussion avec le Coordinateur »,
 * assignée au Coordinateur. Aucune table, aucune migration, aucune nouvelle capacité :
 * - marqueur stable : `originKind` = `plugin:<id>:discussion` et `originId` = `discussion:<companyId>`
 *   (la recherche par `originId` exact se fait côté hôte) ;
 * - message de l'humain : commentaire posé par le plugin (l'attribution à un humain exigerait la capacité
 *   `issue.comments.create_human_attributed`, absente du manifeste), préfixé par `PREFIXE_HUMAIN` ;
 * - réponse du Coordinateur : commentaire d'un agent (`authorAgentId` renseigné).
 *
 * Routes (toutes `board`, `exigerHumain`) :
 * - `discussion.ouvrir` : retrouve ou crée l'issue, rend `{issueId, identifiant, messages}` (100 derniers) ;
 * - `discussion.envoyer` : ajoute le message, remet l'issue en `todo` si elle était terminée, en revue ou en
 *   attente, puis réveille le Coordinateur ;
 * - `discussion.messages` : messages strictement postérieurs à `depuis`, pour l'interrogation périodique.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, PLUGIN_ID, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";

export const ORIGINE_DISCUSSION = `plugin:${PLUGIN_ID}:discussion` as const;
export const TITRE_DISCUSSION = "Discussion avec le Coordinateur";
/** Début de tout message de l'humain : permet de le distinguer d'une réponse d'agent dans le fil natif. */
export const PREFIXE_HUMAIN = "**Message de l'humain (atelier)**\n\n";
export const MAX_MESSAGES = 100;
export const MAX_TEXTE = 4000;

export interface MessageDiscussion {
  id: string;
  auteur: "humain" | "agent";
  nom: string;
  texte: string;
  date: string;
}

type Issue = NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;
type Commentaire = Awaited<ReturnType<PluginContext["issues"]["listComments"]>>[number];

export interface DependancesDiscussion {
  ctx: PluginContext;
  base: BaseAtelier;
}

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "La discussion avec le Coordinateur est réservée à un humain.");
};

const EnvoyerEntree = z
  .object({ companyId: IdNatif, texte: z.string().trim().min(1, "Le message est vide.").max(MAX_TEXTE, `Le message dépasse ${MAX_TEXTE} caractères.`) })
  .strict();

const iso = (d: Date | string | null | undefined) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString());

export function routesDiscussion(d: DependancesDiscussion): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  /** Évite deux créations simultanées de l'issue unique dans ce processus. */
  const creations = new Map<string, Promise<Issue>>();

  async function coordinateur(companyId: string) {
    const agents = (await ctx.agents.list({ companyId, limit: 200 })).filter((a) => a.status !== "terminated");
    return agents.find((a) => a.role === "ceo") ?? agents.find((a) => a.name.startsWith("Coordinateur")) ?? null;
  }

  async function chercher(companyId: string): Promise<Issue | null> {
    const trouvees = await ctx.issues.list({ companyId, originKind: ORIGINE_DISCUSSION as never, originId: `discussion:${companyId}`, includePluginOperations: true, limit: 10 });
    const valides = trouvees.filter((i) => i.companyId.toLowerCase() === companyId.toLowerCase() && i.status !== "cancelled" && i.originId === `discussion:${companyId}`);
    // En cas de doublon accidentel, la plus ancienne reste la discussion.
    return valides.sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)))[0] ?? null;
  }

  function retrouverOuCreer(companyId: string, acteur: ActeurHote): Promise<Issue> {
    const cle = companyId.toLowerCase();
    const enCours = creations.get(cle);
    if (enCours) return enCours;
    const p = (async () => {
      const existante = await chercher(companyId);
      if (existante) return existante;
      const coord = await coordinateur(companyId);
      if (!coord) erreur("introuvable", "Aucun Coordinateur dans cette entreprise : la discussion ne peut pas être ouverte.");
      const issue = await ctx.issues.create({
        companyId, title: TITRE_DISCUSSION, status: "backlog", priority: "medium", assigneeAgentId: coord.id,
        description: "Fil de discussion permanent entre l'humain et le Coordinateur, ouvert depuis l'atelier. Chaque message de l'humain réveille le Coordinateur, qui répond dans ce fil.",
        originKind: ORIGINE_DISCUSSION as never, originId: `discussion:${companyId}`,
        ...(acteur.userId ? { actor: { actorUserId: acteur.userId } } : {}),
      });
      await base.journaliser({ companyId, type: "discussion.ouverte", entite: "tache", entiteId: issue.id, issueId: issue.id, acteur: acteur.id, donnees: { coordinateurId: coord.id } });
      return issue;
    })();
    creations.set(cle, p);
    return p.finally(() => creations.delete(cle));
  }

  const noms = new Map<string, string>();
  async function nomAgent(companyId: string, agentId: string | null): Promise<string> {
    if (!agentId) return "Coordinateur";
    const cle = `${companyId}:${agentId}`;
    if (!noms.has(cle)) {
      try {
        noms.set(cle, (await ctx.agents.get(agentId, companyId))?.name ?? "Coordinateur");
      } catch {
        return "Coordinateur";
      }
    }
    return noms.get(cle) ?? "Coordinateur";
  }

  async function versMessage(companyId: string, c: Commentaire): Promise<MessageDiscussion | null> {
    if (c.deletedAt || c.body.trim() === "") return null;
    const deAgent = c.authorAgentId != null || c.authorType === "agent";
    if (!deAgent && (c.authorType === "user" || c.body.startsWith(PREFIXE_HUMAIN))) {
      return { id: c.id, auteur: "humain", nom: "Vous", texte: c.body.startsWith(PREFIXE_HUMAIN) ? c.body.slice(PREFIXE_HUMAIN.length) : c.body, date: iso(c.createdAt) };
    }
    return { id: c.id, auteur: "agent", nom: await nomAgent(companyId, c.authorAgentId ?? null), texte: c.body, date: iso(c.createdAt) };
  }

  async function lireMessages(companyId: string, issueId: string, depuis: string | null): Promise<MessageDiscussion[]> {
    const commentaires = await ctx.issues.listComments(issueId, companyId);
    const tries = [...commentaires].sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)) || a.id.localeCompare(b.id));
    const sortie: MessageDiscussion[] = [];
    for (const c of tries) {
      if (depuis && iso(c.createdAt) <= depuis) continue;
      const m = await versMessage(companyId, c);
      if (m) sortie.push(m);
    }
    return sortie.slice(-MAX_MESSAGES);
  }

  routes["discussion.ouvrir"] = async (r) => {
    exigerHumain(r.acteur);
    const issue = await retrouverOuCreer(r.companyId, r.acteur);
    return { corps: { issueId: issue.id, identifiant: issue.identifier ?? null, messages: await lireMessages(r.companyId, issue.id, null) } };
  };

  routes["discussion.messages"] = async (r) => {
    exigerHumain(r.acteur);
    const brut = r.query["depuis"];
    const depuisBrut = Array.isArray(brut) ? brut[0] : brut;
    let depuis: string | null = null;
    if (depuisBrut) {
      const t = new Date(depuisBrut);
      if (Number.isNaN(t.getTime())) erreur("entree_invalide", "Le paramètre `depuis` doit être une date ISO valide.");
      depuis = t.toISOString();
    }
    const issue = await chercher(r.companyId);
    if (!issue) return { corps: { issueId: null, identifiant: null, messages: [] } };
    return { corps: { issueId: issue.id, identifiant: issue.identifier ?? null, messages: await lireMessages(r.companyId, issue.id, depuis) } };
  };

  routes["discussion.envoyer"] = async (r) => {
    exigerHumain(r.acteur);
    const p = EnvoyerEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Message de discussion", p.error.issues);
    if (p.data.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    const issue = await retrouverOuCreer(r.companyId, r.acteur);
    const c = await ctx.issues.createComment(issue.id, `${PREFIXE_HUMAIN}${p.data.texte}`, r.companyId);
    if (issue.status === "done" || issue.status === "in_review" || issue.status === "backlog") {
      await ctx.issues.update(issue.id, { status: "todo" }, r.companyId, r.acteur.userId ? { actorUserId: r.acteur.userId } : undefined);
    }
    let reveil: { queued: boolean; runId: string | null } | null = null;
    let echec: string | null = null;
    try {
      reveil = await ctx.issues.requestWakeup(issue.id, r.companyId, {
        reason: "atelier_discussion_message", contextSource: "atelier.discussion", idempotencyKey: `atelier-discussion-${c.id}`,
        ...(r.acteur.userId ? { actorUserId: r.acteur.userId } : {}),
      });
    } catch (e) {
      echec = e instanceof Error ? e.message : String(e);
      ctx.logger.warn("Discussion : réveil du Coordinateur impossible", { issueId: issue.id, erreur: echec });
    }
    await base.journaliser({
      companyId: r.companyId, type: "discussion.message", entite: "tache", entiteId: issue.id, issueId: issue.id, acteur: r.acteur.id,
      donnees: { commentaireId: c.id, longueur: p.data.texte.length, reveil, ...(echec ? { erreurReveil: echec } : {}) },
    });
    const message: MessageDiscussion = { id: c.id, auteur: "humain", nom: "Vous", texte: p.data.texte, date: iso(c.createdAt) };
    return { statut: 201, corps: { ...message, reveilDemande: echec == null } };
  };

  return routes;
}
