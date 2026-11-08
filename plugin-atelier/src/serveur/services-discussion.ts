/**
 * Discussion avec le Coordinateur (humain seulement) : un fil de messages pour piloter l'atelier.
 * Pour un client à plusieurs services, l'interface l'ouvre dans l'entreprise Direction, dont le coordinateur (rôle
 * ceo) est le coordinateur général : seul interlocuteur de l'humain, il délègue aux coordinateurs de département.
 *
 * Une discussion est le fil de commentaires d'une issue native assignée au Coordinateur. Une entreprise en a
 * plusieurs (historique, « Nouvelle discussion », `/clear`). Aucune table, aucune migration, aucune nouvelle capacité :
 * - marqueur stable : `originKind` = `plugin:<id>:discussion` et `originId` = `discussion:<companyId>` (fil historique,
 *   « Discussion avec le Coordinateur ») ou `discussion:<companyId>:<uuid>` (les nouvelles) ; l'hôte ne filtre que par
 *   `originKind` ici : le préfixe de `originId` se filtre en mémoire ;
 * - message de l'humain : commentaire posé par le plugin (l'attribution à un humain exigerait la capacité
 *   `issue.comments.create_human_attributed`, absente du manifeste), préfixé par `PREFIXE_HUMAIN` ;
 * - réponse du Coordinateur : commentaire d'un agent (`authorAgentId` renseigné).
 *
 * Routes (toutes `board`, `exigerHumain`) ; `issueId` facultatif dans ouvrir, envoyer et messages (contrôlé : même
 * entreprise, même marqueur, sinon `introuvable`), sans lui c'est la discussion la plus récemment active :
 * - `discussion.ouvrir` : rend `{issueId, identifiant, messages}` (100 derniers) ;
 * - `discussion.envoyer` : ajoute le message, remet l'issue en `todo` si elle était terminée, en revue ou en
 *   attente, puis réveille le Coordinateur ; `/clear` ou `/nouveau` seul ouvre une nouvelle discussion à la place ;
 * - `discussion.messages` : messages strictement postérieurs à `depuis`, pour l'interrogation périodique ;
 * - `discussion.lister` : historique (50 au plus, dernière activité d'abord) ;
 * - `discussion.nouvelle` : crée une discussion vide, sans rien fermer (la session du Coordinateur naît au premier message) ;
 * - `discussion.supprimer` : annule la discussion `issueId` (elle quitte l'historique ; rien n'est détruit).
 *
 * Télécommande (16/10/2026) : un message du Coordinateur peut porter des actions structurées (bloc
 * `atelier-actions`, voir `discussion-actions.ts`), rendues en `actions` ; les cartes natives en attente
 * (`ask_user_questions`, `request_confirmation`) de la discussion et des demandes à l'équipe sont rendues en
 * `cartes`, pour être traitées dans le fil. Les messages de l'humain ne portent jamais d'actions.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { IdNatif, PLUGIN_ID, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { extraireActions, type ActionDiscussion } from "./discussion-actions.js";
import { erreur, erreurValidation } from "./erreurs.js";
import { elementDepuisCarte, type ElementAccueil } from "./services-accueil.js";
import { chargerContrat, verifierEntrees } from "../moteur/contrats.js";
import { moteurActif, type Executeur } from "../moteur/executeur.js";
import { chargerGabarit, PorteRefusee } from "../moteur/gabarits.js";
import { reconnaitreDemandeContenu, reconnaitreQuestionEtat, repondreEtat } from "../moteur/questions-etat.js";

export const ORIGINE_DISCUSSION = `plugin:${PLUGIN_ID}:discussion` as const;
export const TITRE_DISCUSSION = "Discussion avec le Coordinateur";
export const TITRE_NOUVELLE = "Nouvelle discussion";
/** Discussions rendues par `discussion.lister`. */
export const MAX_DISCUSSIONS = 50;
/** Issues lues pour reconstituer l'historique (l'hôte n'expose ni tri ni filtre par préfixe d'`originId`). */
const LECTURE_DISCUSSIONS = 100;
export const MAX_TITRE = 60;
const COMMANDE_NOUVELLE = /^\/(clear|nouveau)$/i;
/** Début de tout message de l'humain : permet de le distinguer d'une réponse d'agent dans le fil natif. */
export const PREFIXE_HUMAIN = "**Message de l'humain (atelier)**";
/**
 * Première ligne du commentaire posé par `discussion.envoyer` : le type de travail et l'origine du fil (`originId` de la tâche,
 * jamais son titre, que le plugin renomme) y sont portés pour que le Coordinateur reconnaisse son chat sans dépendre du titre.
 * Forme : `**Message de l'humain (atelier)** · travail : discussion · origine : <originId>`, puis une ligne vide et le texte.
 */
export const prefixeMessage = (originId: string | null | undefined) => `${PREFIXE_HUMAIN} · travail : discussion · origine : ${originId ?? ""}\n\n`;
/** Reconnaît le préfixe d'un message de l'humain, avec ou sans le type et l'origine (fils antérieurs). */
const PREFIXE_RECONNU = /^\*\*Message de l'humain \(atelier\)\*\*[^\n]*\n\n/;
export const MAX_MESSAGES = 100;
export const MAX_TEXTE = 4000;
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
  /** Réglages de l'entreprise ; par défaut `ctx.config.get`. */
  config?: (companyId: string) => Promise<Record<string, unknown> | null | undefined>;
}

const exigerHumain = (acteur: ActeurHote) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", "La discussion avec le Coordinateur est réservée à un humain.");
};

const NouvelleEntree = z.object({ companyId: IdNatif }).strict();
const SupprimerEntree = z.object({ companyId: IdNatif, issueId: IdNatif }).strict();
const EnvoyerEntree = z
  .object({ companyId: IdNatif, issueId: IdNatif.optional(), texte: z.string().trim().min(1, "Le message est vide.").max(MAX_TEXTE, `Le message dépasse ${MAX_TEXTE} caractères.`) })
  .strict();

const iso = (d: Date | string | null | undefined) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString());

/** Vrai si l'issue est une discussion non annulée de cette entreprise (fil historique ou `discussion:<companyId>:<uuid>`). */
export function estDiscussionDe(companyId: string, i: Pick<Issue, "originKind" | "originId" | "status" | "companyId">): boolean {
  if (i.originKind !== ORIGINE_DISCUSSION || i.status === "cancelled" || i.companyId.toLowerCase() !== companyId.toLowerCase()) return false;
  const racine = `discussion:${companyId}`.toLowerCase();
  const origine = String(i.originId ?? "").toLowerCase();
  return origine === racine || origine.startsWith(`${racine}:`);
}

export const LancerEntree = z
  .object({ companyId: IdNatif, missionId: z.string().min(1).max(100), campagneId: z.string().min(1).max(100), entrees: z.record(z.string(), z.unknown()) })
  .strict();

export interface DependancesLancement {
  ctx: PluginContext;
  base: BaseAtelier;
  executeur: Pick<Executeur, "lancerMission">;
  /** Réglages de l'entreprise ; par défaut `ctx.config.get`. */
  config?: DependancesDiscussion["config"];
}

/**
 * `mission.lancer` : démarre le brouillon d'une mission de contenu une fois la carte de confirmation acceptée par un humain.
 * Contrôles dans l'ordre, tous AVANT la moindre écriture : moteur actif, mission de l'entreprise, état `attente_information`,
 * campagne de l'entreprise (lue en base, filtre `company_id`), carte `request_confirmation` acceptée par un humain (non créée par un agent) dont le détail porte la
 * mission, entrées complètes. L'exécuteur arrive de `brancherMoteur` (il a besoin des routes, d'où l'enregistrement séparé).
 */
export function routesLancement(d: DependancesLancement): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const configDe = d.config ?? (async (companyId: string) => (await ctx.config.get(companyId)) as Record<string, unknown> | null);
  return {
    "mission.lancer": async (r) => {
      const p = LancerEntree.safeParse(r.corps);
      if (!p.success) erreurValidation("Lancement de mission", p.error.issues);
      if (p.data.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
      if (!moteurActif(await configDe(r.companyId))) erreur("acces_refuse", "Le moteur de missions n'est pas activé pour cette entreprise.");
      const m = await base.lireMission(r.companyId, p.data.missionId);
      if (!m) erreur("introuvable", "Mission introuvable dans cette entreprise.");
      if (m.etat !== "attente_information") erreur("conflit", `La mission est « ${m.etat} » : seul un brouillon en attente d'information se lance.`);
      if (!(await base.lireCampagne(r.companyId, p.data.campagneId))) erreur("hors_entreprise", "Campagne introuvable dans cette entreprise.");
      // L'accord humain : une carte acceptée, sur la tâche racine, qui nomme exactement cette mission (ligne « Mission : <id> »).
      const cartes = m.issueRacineId ? await ctx.issues.listInteractions(m.issueRacineId, r.companyId) : [];
      // Carte posée par le plugin (aucun agent auteur) et résolue par un humain : celle d'un agent ou sans résolveur humain ne vaut pas accord.
      if (!cartes.some((c) => c.kind === "request_confirmation" && c.status === "accepted" && !c.createdByAgentId && c.resolvedByUserId && String((c.payload as { detailsMarkdown?: unknown }).detailsMarkdown ?? "").split("\n").includes(`Mission : ${m.id}`))) {
        erreur("elevation_refusee", "Aucune carte de confirmation acceptée par un humain pour cette mission : le lancement est refusé.");
      }
      const gabarit = chargerGabarit(m.gabaritCle, m.gabaritVersion);
      const etape = gabarit.etapes.find((e) => e.rang === 1)!;
      const { manquantes } = verifierEntrees(chargerContrat(etape.contratId, etape.contratVersion), p.data.entrees);
      if (manquantes.length > 0) erreur("entree_invalide", `Entrées manquantes : ${manquantes.join(", ")}.`, { manquantes });
      if (!(await base.rattacherCampagneMission(r.companyId, m.id, p.data.campagneId))) erreur("conflit", "La campagne n'a pas pu être rattachée : la mission a changé entre-temps.");
      const lancee = await d.executeur.lancerMission(r.companyId, m.id, p.data.entrees).catch((e: unknown) => {
        // Porte refusée : la mission reste en attente d'information, la relance après correction repart de là.
        if (e instanceof PorteRefusee) erreur("conflit", `La porte de la mission est refusée : ${e.message} Corrigez puis relancez.`);
        throw e;
      });
      if (!lancee) erreur("conflit", "La mission a déjà été lancée.");
      await base.journaliser({ companyId: r.companyId, type: "mission.lancee", entite: "mission", entiteId: m.id, issueId: m.issueRacineId, acteur: r.acteur.id, donnees: { campagneId: p.data.campagneId } });
      return { corps: { missionId: m.id, etat: (await base.lireMission(r.companyId, m.id))?.etat ?? null } };
    },
  };
}

export function routesDiscussion(d: DependancesDiscussion): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const configDe = d.config ?? (async (companyId: string) => (await ctx.config.get(companyId)) as Record<string, unknown> | null);
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};
  /** Évite deux créations simultanées de l'issue unique dans ce processus. */
  const creations = new Map<string, Promise<Issue>>();

  async function coordinateur(companyId: string) {
    const agents = (await ctx.agents.list({ companyId, limit: 200 })).filter((a) => a.status !== "terminated");
    return agents.find((a) => a.role === "ceo") ?? agents.find((a) => a.name.startsWith("Coordinateur")) ?? null;
  }

  const activite = (i: Issue) => iso(i.updatedAt ?? i.createdAt);
  /** Discussions de l'entreprise, la plus récemment active d'abord. */
  async function toutes(companyId: string): Promise<Issue[]> {
    const trouvees = await ctx.issues.list({ companyId, originKind: ORIGINE_DISCUSSION as never, includePluginOperations: true, limit: LECTURE_DISCUSSIONS });
    return trouvees.filter((i) => estDiscussionDe(companyId, i)).sort((a, b) => activite(b).localeCompare(activite(a)) || iso(b.createdAt).localeCompare(iso(a.createdAt)));
  }

  /** Discussion demandée (contrôlée) ou, sans identifiant, la plus récemment active (null s'il n'y en a aucune). */
  async function chercher(companyId: string, issueId?: string | null): Promise<Issue | null> {
    if (!issueId) return (await toutes(companyId))[0] ?? null;
    const issue = await ctx.issues.get(issueId, companyId).catch(() => null);
    if (!issue || !estDiscussionDe(companyId, issue)) erreur("introuvable", "Discussion introuvable dans cette entreprise.");
    return issue;
  }

  const idDemande = (brut: string | string[] | undefined): string | null => {
    const v = Array.isArray(brut) ? brut[0] : brut;
    if (!v) return null;
    if (!IdNatif.safeParse(v).success) erreur("introuvable", "Discussion introuvable dans cette entreprise.");
    return v;
  };

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

  async function creer(companyId: string, acteur: ActeurHote, originId: string, titre: string, description: string): Promise<Issue> {
    const coord = await coordinateur(companyId);
    if (!coord) erreur("introuvable", "Aucun Coordinateur dans cette entreprise : la discussion ne peut pas être ouverte.");
    return ctx.issues.create({
      companyId, title: titre, status: "backlog", priority: "medium", assigneeAgentId: coord.id, description,
      originKind: ORIGINE_DISCUSSION as never, originId,
      ...(acteur.userId ? { actor: { actorUserId: acteur.userId } } : {}),
    });
  }

  /** Sans discussion existante, la première est le fil historique (`discussion:<companyId>`), comme avant. */
  function retrouverOuCreer(companyId: string, acteur: ActeurHote): Promise<Issue> {
    const cle = companyId.toLowerCase();
    const enCours = creations.get(cle);
    if (enCours) return enCours;
    const p = (async () => {
      const existante = await chercher(companyId);
      if (existante) return suivreCoordinateur(companyId, existante, acteur);
      const issue = await creer(companyId, acteur, `discussion:${companyId}`, TITRE_DISCUSSION,
        "Fil de discussion entre l'humain et le Coordinateur, ouvert depuis l'atelier. Chaque message de l'humain réveille le Coordinateur, qui répond dans ce fil.");
      await base.journaliser({ companyId, type: "discussion.ouverte", entite: "tache", entiteId: issue.id, issueId: issue.id, acteur: acteur.id, donnees: { coordinateurId: issue.assigneeAgentId ?? null } });
      return issue;
    })();
    creations.set(cle, p);
    return p.finally(() => creations.delete(cle));
  }

  async function creerNouvelle(companyId: string, acteur: ActeurHote): Promise<Issue> {
    const issue = await creer(companyId, acteur, `discussion:${companyId}:${randomUUID()}`, TITRE_NOUVELLE,
      "Discussion entre l'humain et le Coordinateur, ouverte depuis l'atelier. Chaque message de l'humain réveille le Coordinateur, qui répond dans ce fil.");
    await base.journaliser({ companyId, type: "discussion.nouvelle", entite: "tache", entiteId: issue.id, issueId: issue.id, acteur: acteur.id, donnees: { coordinateurId: issue.assigneeAgentId ?? null } });
    return issue;
  }

  /** Une ligne, 60 caractères au plus (points de code entiers), à partir du premier message de l'humain. */
  const titreDepuis = (texte: string) => Array.from(texte.replace(/\s+/g, " ").trim()).slice(0, MAX_TITRE).join("").trimEnd();

  const noms = new Map<string, string>();
  const NOM_SANS_AUTEUR = "Réponse d'un service";
  async function nomAgent(companyId: string, agentId: string | null): Promise<string> {
    // F5 (revue du 19/10/2026) : un commentaire sans auteur agent (réponse recopiée par le bureau de liaison, par exemple)
    // ne s'affiche jamais sous le nom du Coordinateur.
    if (!agentId) return NOM_SANS_AUTEUR;
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

  async function versMessage(companyId: string, issueId: string, c: Commentaire, coordinateurId: string | null, ceoId: string | null = null): Promise<MessageDiscussion | null> {
    if (c.deletedAt || c.body.trim() === "") return null;
    const deAgent = c.authorAgentId != null || c.authorType === "agent";
    if (!deAgent && (c.authorType === "user" || PREFIXE_RECONNU.test(c.body))) {
      return { id: c.id, auteur: "humain", nom: "Vous", texte: c.body.replace(PREFIXE_RECONNU, ""), date: iso(c.createdAt), actions: [] };
    }
    const extrait = extraireActions(c.body);
    const { texte, ignorees } = extrait;
    // Seules les actions du Coordinateur de l'entreprise sont des boutons : un autre agent peut commenter
    // la tâche, mais ne pilote pas l'interface.
    const duCoordinateur = coordinateurId !== null && c.authorAgentId === coordinateurId;
    let actions = duCoordinateur ? extrait.actions : [];
    if (!duCoordinateur && extrait.actions.length > 0) {
      ignorees.push("actions d'un agent autre que le Coordinateur : écartées");
    }
    // Allumer ou couper des agents : réservé à l'agent de rôle ceo. Le repli sur un nom « Coordinateur… » (fil d'une
    // entreprise dont le ceo est introuvable) ne suffit pas pour piloter les agents.
    if (duCoordinateur && actions.some((a) => a.type === "agents") && (ceoId === null || c.authorAgentId !== ceoId)) {
      actions = actions.filter((a) => a.type !== "agents");
      ignorees.push("action `agents` d'un auteur qui n'a pas le rôle ceo : écartée");
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
    const coord = await coordinateur(companyId);
    const coordinateurId = coord?.id ?? null;
    const ceoId = coord?.role === "ceo" ? coord.id : null;
    for (const c of tries) {
      if (depuis && iso(c.createdAt) <= depuis) continue;
      const m = await versMessage(companyId, issueId, c, coordinateurId, ceoId);
      if (m) sortie.push(m);
    }
    return sortie.slice(-MAX_MESSAGES);
  }

  /**
   * Cartes natives en attente sur l'issue de la discussion elle-même : le fil ne montre que ce qui est né de CETTE
   * discussion (les demandes à l'équipe et les cartes des services sont suivies ailleurs). Une panne de lecture
   * n'empêche jamais d'afficher le fil, mais elle est signalée (`indisponible`) pour que l'interface propose de réessayer.
   */
  async function lireCartes(companyId: string, discussion: Issue): Promise<{ cartes: ElementAccueil[]; indisponible: boolean }> {
    try {
      const elements: ElementAccueil[] = [];
      for (const carte of await ctx.issues.listInteractions(discussion.id, companyId)) {
        const e = elementDepuisCarte(discussion, carte);
        if (e) elements.push(e);
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
    const cle = `${companyId}:${discussion.id}`.toLowerCase();
    const memo = cacheCartes.get(cle);
    if (!frais && memo && Date.now() - memo.a < TTL_CARTES_MS) return memo.valeur;
    const valeur = await lireCartes(companyId, discussion);
    if (valeur.indisponible) cacheCartes.delete(cle);
    else cacheCartes.set(cle, { a: Date.now(), valeur });
    return valeur;
  }

  const VIDE = { issueId: null, identifiant: null, messages: [], cartes: [], cartesIndisponibles: false };
  /** Forme commune de `ouvrir`, `messages` et `nouvelle` pour une discussion donnée. */
  async function forme(companyId: string, issue: Issue, depuis: string | null, cartesFraiches: boolean) {
    const { cartes, indisponible } = await cartesEnAttente(companyId, issue, cartesFraiches);
    return { issueId: issue.id, identifiant: issue.identifier ?? null, messages: await lireMessages(companyId, issue.id, depuis), cartes, cartesIndisponibles: indisponible };
  }

  routes["discussion.ouvrir"] = async (r) => {
    exigerHumain(r.acteur);
    // Ouvrir la page ne crée rien : la tâche native naît au premier message envoyé (`discussion.envoyer`).
    const trouvee = await chercher(r.companyId, idDemande(r.query["issueId"]));
    if (!trouvee) return { corps: VIDE };
    return { corps: await forme(r.companyId, await suivreCoordinateur(r.companyId, trouvee, r.acteur), null, true) };
  };

  routes["discussion.lister"] = async (r) => {
    exigerHumain(r.acteur);
    const discussions = (await toutes(r.companyId)).slice(0, MAX_DISCUSSIONS)
      .map((i) => ({ issueId: i.id, identifiant: i.identifier ?? null, titre: i.title, majLe: activite(i), statut: i.status }));
    return { corps: { discussions } };
  };

  routes["discussion.nouvelle"] = async (r) => {
    exigerHumain(r.acteur);
    const p = NouvelleEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Nouvelle discussion", p.error.issues);
    if (p.data.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    return { statut: 201, corps: await forme(r.companyId, await creerNouvelle(r.companyId, r.acteur), null, true) };
  };

  routes["discussion.supprimer"] = async (r) => {
    exigerHumain(r.acteur);
    const p = SupprimerEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Suppression de discussion", p.error.issues);
    if (p.data.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    // Contrôle d'appartenance avant toute écriture : une issue d'une autre entreprise, qui n'est pas une discussion ou déjà annulée est « introuvable ».
    const issue = await chercher(r.companyId, p.data.issueId);
    if (!issue) erreur("introuvable", "Discussion introuvable dans cette entreprise.");
    // Rien n'est détruit : l'issue passe en `cancelled`, ce que la liste exclut déjà.
    await ctx.issues.update(issue.id, { status: "cancelled" }, r.companyId, r.acteur.userId ? { actorUserId: r.acteur.userId } : undefined);
    cacheCartes.delete(`${r.companyId}:${issue.id}`.toLowerCase());
    await base.journaliser({ companyId: r.companyId, type: "discussion.supprimee", entite: "tache", entiteId: issue.id, issueId: issue.id, acteur: r.acteur.id, donnees: { titre: issue.title } });
    return { corps: { supprimee: issue.id } };
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
    const issue = await chercher(r.companyId, idDemande(r.query["issueId"]));
    if (!issue) return { corps: VIDE };
    return { corps: await forme(r.companyId, issue, depuis, false) };
  };

  /** Moteur actif et repli non demandé : le chat peut répondre sans modèle. Un réglage illisible vaut « modèle » (défaut sûr). */
  async function chatSansModele(companyId: string): Promise<boolean> {
    try {
      const config = await configDe(companyId);
      return moteurActif(config) && config?.moteurChatVersModele !== true;
    } catch {
      return false;
    }
  }

  /**
   * Brouillon de mission `wf-c-contenu` pour une demande de contenu reconnue, avec une seule carte de confirmation sur la
   * discussion. Rien n'est lancé : l'état `attente_information` n'est jamais repris par le moteur. Les entrées non nommées par
   * le texte restent absentes. Idempotent : même demande sur la même discussion = même brouillon, carte recréée seulement si perdue.
   */
  async function preparerBrouillon(companyId: string, issue: Issue, texte: string, demande: NonNullable<ReturnType<typeof reconnaitreDemandeContenu>>): Promise<string> {
    const mandat = texte;
    const gabarit = chargerGabarit("wf-c-contenu");
    const etape = gabarit.etapes[0]!;
    const existante = (await base.missionsActives(companyId)).find((m) => m.etat === "attente_information" && m.gabaritCle === gabarit.cle && m.issueRacineId === issue.id && m.mandat === mandat);
    const missionId = existante?.id ?? await base.creerMission({
      companyId, gabaritCle: gabarit.cle, gabaritVersion: gabarit.version, contratId: etape.contratId, contratVersion: etape.contratVersion, mandat,
      etat: "attente_information", issueRacineId: issue.id, campagneId: null,
    });
    const manquantes = verifierEntrees(chargerContrat(etape.contratId, etape.contratVersion), demande).manquantes;
    const resume = `Brouillon de mission « ${gabarit.cle} » (${demande.typeLivrable}${demande.canal ? `, ${demande.canal}` : ""}), non lancé.`;
    const detail = `${resume}\n\nMission : ${missionId}\nDemande : ${mandat.replace(/[\r\n]+/g, " ")}\nÀ préciser avant tout démarrage : ${manquantes.join(", ")}.\nAucune campagne n'est rattachée : la porte du gabarit en exige une.`;
    const cartes = await ctx.issues.listInteractions(issue.id, companyId);
    if (!cartes.some((c) => c.kind === "request_confirmation" && c.status === "pending" && JSON.stringify(c.payload).includes(missionId))) {
      await ctx.issues.requestConfirmation(issue.id, {
        continuationPolicy: "wake_assignee_on_accept", resolverPolicy: "human_only",
        payload: { version: 1, prompt: "Préparer cette mission de contenu ?", detailsMarkdown: detail, acceptLabel: "Préparer", rejectLabel: "Laisser tomber", supersedeOnUserComment: false, allowDeclineReason: true },
      }, companyId);
    }
    return `${resume} À préciser : ${manquantes.join(", ")}. Aucune campagne n'est rattachée. Une carte de confirmation attend votre décision dans ce fil.`;
  }

  routes["discussion.envoyer"] = async (r) => {
    exigerHumain(r.acteur);
    const p = EnvoyerEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Message de discussion", p.error.issues);
    if (p.data.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    // La discussion demandée est contrôlée avant toute écriture (y compris pour `/clear`).
    const choisie = p.data.issueId ? await chercher(r.companyId, p.data.issueId) : null;
    // `/clear` seul : traité ici (et non dans l'interface) pour valoir aussi depuis WhatsApp ; ni commentaire ni réveil.
    if (COMMANDE_NOUVELLE.test(p.data.texte)) {
      return { statut: 201, corps: { nouvelle: await forme(r.companyId, await creerNouvelle(r.companyId, r.acteur), null, true) } };
    }
    const issue = choisie ? await suivreCoordinateur(r.companyId, choisie, r.acteur) : await retrouverOuCreer(r.companyId, r.acteur);
    const c = await ctx.issues.createComment(issue.id, `${prefixeMessage(issue.originId)}${p.data.texte}`, r.companyId);
    const auteur = r.acteur.userId ? { actorUserId: r.acteur.userId } : undefined;
    // Sans modèle : question d'état ou demande de contenu reconnue, moteur actif, repli faux. Une panne retombe sur le modèle.
    let local: { reponse: string; questionEtat?: string } | null = null;
    if (await chatSansModele(r.companyId)) {
      try {
        const question = reconnaitreQuestionEtat(p.data.texte);
        const demande = question ? null : reconnaitreDemandeContenu(p.data.texte);
        if (question) local = { reponse: await repondreEtat(question, base, r.companyId), questionEtat: question };
        else if (demande) local = { reponse: await preparerBrouillon(r.companyId, issue, p.data.texte, demande) };
      } catch (e) {
        ctx.logger.warn("Discussion : réponse sans modèle impossible, le message part vers le modèle", { issueId: issue.id, erreur: e instanceof Error ? e.message : String(e) });
      }
    }
    if (!local && (issue.status === "done" || issue.status === "in_review" || issue.status === "backlog")) {
      await ctx.issues.update(issue.id, { status: "todo" }, r.companyId, auteur);
    }
    if (issue.title === TITRE_NOUVELLE) {
      // Le titre n'est qu'un repère : son échec ne doit ni bloquer le réveil ni pousser l'humain à renvoyer (doublon).
      await ctx.issues.update(issue.id, { title: titreDepuis(p.data.texte) }, r.companyId, auteur).catch((e: unknown) =>
        ctx.logger.warn("Discussion : titre non posé", { issueId: issue.id, erreur: e instanceof Error ? e.message : String(e) }));
    }
    let reveil: { queued: boolean; runId: string | null } | null = null;
    let echec: string | null = null;
    if (local) {
      const coord = await coordinateur(r.companyId);
      await ctx.issues.createComment(issue.id, local.reponse, r.companyId, coord ? { authorAgentId: coord.id } : undefined);
    } else try {
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
      donnees: { commentaireId: c.id, longueur: p.data.texte.length, reveil, ...(local?.questionEtat ? { questionEtat: local.questionEtat } : {}), ...(echec ? { erreurReveil: echec } : {}) },
    });
    const message: MessageDiscussion = { id: c.id, auteur: "humain", nom: "Vous", texte: p.data.texte, date: iso(c.createdAt), actions: [] };
    return { statut: 201, corps: { ...message, reveilDemande: local ? false : echec == null } };
  };

  return routes;
}
