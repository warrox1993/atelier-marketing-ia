/**
 * Discussion avec le Coordinateur (humain seulement) : un fil de messages pour piloter l'atelier.
 * Pour un client à plusieurs services, l'interface l'ouvre dans l'entreprise Direction, dont le coordinateur (rôle
 * ceo) est le coordinateur général : seul interlocuteur de l'humain, il délègue aux coordinateurs de département.
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
 *
 * Télécommande (16/10/2026) : un message du Coordinateur peut porter des actions structurées (bloc
 * `atelier-actions`, voir `discussion-actions.ts`), rendues en `actions` ; les cartes natives en attente
 * (`ask_user_questions`, `request_confirmation`) de la discussion et des demandes à l'équipe sont rendues en
 * `cartes`, pour être traitées dans le fil. Les messages de l'humain ne portent jamais d'actions.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, PLUGIN_ID, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { extraireActions, type ActionDiscussion } from "./discussion-actions.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { ORIGINE_DEMANDE, elementDepuisCarte, type ElementAccueil } from "./services-accueil.js";

export const ORIGINE_DISCUSSION = `plugin:${PLUGIN_ID}:discussion` as const;
export const TITRE_DISCUSSION = "Discussion avec le Coordinateur";
/** Début de tout message de l'humain : permet de le distinguer d'une réponse d'agent dans le fil natif. */
export const PREFIXE_HUMAIN = "**Message de l'humain (atelier)**\n\n";
export const MAX_MESSAGES = 100;
export const MAX_TEXTE = 4000;
/** Tâches de demande à l'équipe examinées pour leurs cartes en attente (les plus récentes, non terminées). */
const MAX_DEMANDES_CARTES = 5;
/** Durée pendant laquelle les cartes en attente sont réutilisées entre deux interrogations du fil. */
export const TTL_CARTES_MS = 30_000;

export interface MessageDiscussion {
  id: string;
  auteur: "humain" | "agent";
  nom: string;
  texte: string;
  date: string;
  /** Actions validées jointes par le Coordinateur (liste vide pour l'humain). */
  actions: ActionDiscussion[];
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

  /**
   * Le fil suit le coordinateur ACTUEL de l'entreprise (rôle ceo) : quand il change (Direction : le coordinateur
   * général remplace le coordinateur du service comme interlocuteur de l'humain), l'issue existante lui est réaffectée,
   * pour que le réveil de `discussion.envoyer` le vise lui. Aucune réaffectation si l'entreprise n'a pas de coordinateur.
   */
  async function suivreCoordinateur(companyId: string, issue: Issue, acteur: ActeurHote): Promise<Issue> {
    const coord = await coordinateur(companyId);
    if (!coord || issue.assigneeAgentId === coord.id) return issue;
    const ancien = issue.assigneeAgentId ?? null;
    await ctx.issues.update(issue.id, { assigneeAgentId: coord.id }, companyId, acteur.userId ? { actorUserId: acteur.userId } : undefined);
    await base.journaliser({ companyId, type: "discussion.reaffectee", entite: "tache", entiteId: issue.id, issueId: issue.id, acteur: acteur.id, donnees: { ancien, coordinateurId: coord.id } });
    return { ...issue, assigneeAgentId: coord.id };
  }

  function retrouverOuCreer(companyId: string, acteur: ActeurHote): Promise<Issue> {
    const cle = companyId.toLowerCase();
    const enCours = creations.get(cle);
    if (enCours) return enCours;
    const p = (async () => {
      const existante = await chercher(companyId);
      if (existante) return suivreCoordinateur(companyId, existante, acteur);
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

  /** Une action écartée est journalisée une seule fois par commentaire (le fil est relu toutes les 4 s). */
  const dejaJournalees = new Set<string>();

  async function versMessage(companyId: string, issueId: string, c: Commentaire, coordinateurId: string | null): Promise<MessageDiscussion | null> {
    if (c.deletedAt || c.body.trim() === "") return null;
    const deAgent = c.authorAgentId != null || c.authorType === "agent";
    if (!deAgent && (c.authorType === "user" || c.body.startsWith(PREFIXE_HUMAIN))) {
      return { id: c.id, auteur: "humain", nom: "Vous", texte: c.body.startsWith(PREFIXE_HUMAIN) ? c.body.slice(PREFIXE_HUMAIN.length) : c.body, date: iso(c.createdAt), actions: [] };
    }
    const extrait = extraireActions(c.body);
    const { texte, ignorees } = extrait;
    // Seules les actions du Coordinateur de l'entreprise sont des boutons : un autre agent peut commenter
    // la tâche, mais ne pilote pas l'interface.
    const duCoordinateur = coordinateurId !== null && c.authorAgentId === coordinateurId;
    const actions = duCoordinateur ? extrait.actions : [];
    if (!duCoordinateur && extrait.actions.length > 0) {
      ignorees.push("actions d'un agent autre que le Coordinateur : écartées");
    }
    if (ignorees.length > 0 && !dejaJournalees.has(c.id)) {
      dejaJournalees.add(c.id);
      ctx.logger.warn("Discussion : actions du Coordinateur écartées", { issueId, commentaireId: c.id, ignorees });
      try {
        await base.journaliser({ companyId, type: "discussion.action_ignoree", entite: "tache", entiteId: issueId, issueId, acteur: "discussion", donnees: { commentaireId: c.id, ignorees } });
      } catch (e) {
        ctx.logger.warn("Discussion : journalisation des actions écartées impossible", { erreur: e instanceof Error ? e.message : String(e) });
      }
    }
    return { id: c.id, auteur: "agent", nom: await nomAgent(companyId, c.authorAgentId ?? null), texte, date: iso(c.createdAt), actions };
  }

  async function lireMessages(companyId: string, issueId: string, depuis: string | null): Promise<MessageDiscussion[]> {
    const commentaires = await ctx.issues.listComments(issueId, companyId);
    const tries = [...commentaires].sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)) || a.id.localeCompare(b.id));
    const sortie: MessageDiscussion[] = [];
    const coordinateurId = (await coordinateur(companyId))?.id ?? null;
    for (const c of tries) {
      if (depuis && iso(c.createdAt) <= depuis) continue;
      const m = await versMessage(companyId, issueId, c, coordinateurId);
      if (m) sortie.push(m);
    }
    return sortie.slice(-MAX_MESSAGES);
  }

  /**
   * Cartes natives en attente sur les tâches liées à la discussion : l'issue de discussion elle-même et les
   * tâches de demande à l'équipe encore ouvertes. Une panne de lecture n'empêche jamais d'afficher le fil,
   * mais elle est signalée (`indisponible`) pour que l'interface propose de réessayer.
   */
  async function lireCartes(companyId: string, discussion: Issue): Promise<{ cartes: ElementAccueil[]; indisponible: boolean }> {
    try {
      const demandes = (await ctx.issues.list({ companyId, originKind: ORIGINE_DEMANDE as never, limit: 50 }))
        .filter((i) => i.companyId.toLowerCase() === companyId.toLowerCase() && i.status !== "done" && i.status !== "cancelled")
        .sort((a, b) => iso(b.createdAt).localeCompare(iso(a.createdAt)))
        .slice(0, MAX_DEMANDES_CARTES);
      const elements: ElementAccueil[] = [];
      for (const issue of [discussion, ...demandes]) {
        for (const carte of await ctx.issues.listInteractions(issue.id, companyId)) {
          const e = elementDepuisCarte(issue, carte);
          if (e) elements.push(e);
        }
      }
      return { cartes: elements, indisponible: false };
    } catch (e) {
      ctx.logger.warn("Discussion : cartes en attente illisibles", { erreur: e instanceof Error ? e.message : String(e) });
      return { cartes: [], indisponible: true };
    }
  }

  /**
   * Le fil est relu toutes les 4 s mais les cartes coûtent jusqu'à 7 appels à l'hôte : lues au plus toutes les
   * 30 s par entreprise (jamais mises en cache en cas de panne). L'ouverture de la discussion les relit toujours.
   */
  const cacheCartes = new Map<string, { a: number; valeur: { cartes: ElementAccueil[]; indisponible: boolean } }>();
  async function cartesEnAttente(companyId: string, discussion: Issue, frais = false) {
    const cle = companyId.toLowerCase();
    const memo = cacheCartes.get(cle);
    if (!frais && memo && Date.now() - memo.a < TTL_CARTES_MS) return memo.valeur;
    const valeur = await lireCartes(companyId, discussion);
    if (valeur.indisponible) cacheCartes.delete(cle);
    else cacheCartes.set(cle, { a: Date.now(), valeur });
    return valeur;
  }

  routes["discussion.ouvrir"] = async (r) => {
    exigerHumain(r.acteur);
    const issue = await retrouverOuCreer(r.companyId, r.acteur);
    const { cartes, indisponible } = await cartesEnAttente(r.companyId, issue, true);
    return { corps: { issueId: issue.id, identifiant: issue.identifier ?? null, messages: await lireMessages(r.companyId, issue.id, null), cartes, cartesIndisponibles: indisponible } };
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
    if (!issue) return { corps: { issueId: null, identifiant: null, messages: [], cartes: [], cartesIndisponibles: false } };
    const { cartes, indisponible } = await cartesEnAttente(r.companyId, issue);
    return { corps: { issueId: issue.id, identifiant: issue.identifier ?? null, messages: await lireMessages(r.companyId, issue.id, depuis), cartes, cartesIndisponibles: indisponible } };
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
    const message: MessageDiscussion = { id: c.id, auteur: "humain", nom: "Vous", texte: p.data.texte, date: iso(c.createdAt), actions: [] };
    return { statut: 201, corps: { ...message, reveilDemande: echec == null } };
  };

  return routes;
}
