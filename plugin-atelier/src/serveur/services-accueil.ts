/**
 * Lot 1 : routes de l'ACCUEIL de l'atelier (humain seulement).
 *
 * - `accueil.lister` : une liste unique, triée par urgence, de tout ce qui attend une décision ou une
 *   information de la personne (contenus à valider, approbations natives, tâches bloquées, demandes
 *   d'accès des agents, documents de connaissances à revoir, informations manquantes), plus les
 *   missions en cours (demandes déjà envoyées au Coordinateur). Chaque raison est écrite en français
 *   clair : les messages techniques de l'hôte ne sont jamais recopiés.
 * - `equipe.demander` : une demande en texte libre devient une tâche native assignée au Coordinateur.
 * - `mission.suivre` : la tâche mère et ses sous-tâches (agent, statut, dernier commentaire résumé).
 *
 * L'entreprise vient toujours de la résolution de route par l'hôte ; un corps qui en désigne une autre
 * est refusé. Aucune écriture hors la création de la tâche de la demande.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, PLUGIN_ID, ROUTE_ATELIER, type CleRouteApi, type StatutFonctionnel } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";

type Issue = NonNullable<Awaited<ReturnType<PluginContext["issues"]["get"]>>>;

export const ORIGINE_DEMANDE = `plugin:${PLUGIN_ID}:demande` as const;

export type TypeElementAccueil =
  | "contenu_a_valider"
  | "approbation"
  | "liaison_a_approuver"
  | "demande_acces"
  | "tache_bloquee"
  | "document_a_revoir"
  | "information_manquante";

export type UrgenceAccueil = "haute" | "moyenne" | "basse";

/** Question d'une carte native `ask_user_questions`, réduite à ce que l'Accueil affiche. */
export interface QuestionAccueil {
  id: string;
  invite: string;
  aide: string | null;
  choix: "single" | "multi";
  obligatoire: boolean;
  /** Réponse libre autorisée en plus des choix. */
  autre: boolean;
  options: Array<{ id: string; libelle: string; description: string | null; texteLibre: boolean }>;
}

/** Carte native en attente, avec de quoi y répondre sur place (route native de réponse aux interactions). */
export interface InteractionAccueil {
  id: string;
  kind: "ask_user_questions" | "request_confirmation";
  /** Texte de la confirmation demandée (`request_confirmation`). */
  invite: string | null;
  details: string | null;
  libelleAccepter: string | null;
  libelleRefuser: string | null;
  /** Le serveur exige une raison pour refuser (`rejectRequiresReason`). */
  refusRaisonObligatoire: boolean;
  /**
   * La carte exécute un outil (`toolAction`, ex. envoi d'un e-mail) ou propose un secret (`secretProposal`) :
   * jamais de décision sur place, seulement le lien vers la tâche native où le détail est visible.
   */
  natifSeulement: boolean;
  questions: QuestionAccueil[];
}

/** Approbation native réduite à ce que l'Accueil affiche avant toute décision. */
export interface DetailApprobation {
  /** Type natif (`hire_agent`, `budget_override_required`, …). */
  type: string;
  /** Vrai seulement pour les types connus et sans effet caché : sinon, page native uniquement. */
  surPlace: boolean;
  demandeur: string;
  lignes: Array<{ libelle: string; valeur: string }>;
}

/** Demande d'un service à un autre (bureau de liaison) en attente d'approbation : tout son contenu, affiché AVANT décision. */
export interface LiaisonAApprouver {
  liaisonId: string;
  /** Service qui demande (slug du registre). */
  serviceSource: string;
  /** Service visé (slug du registre). */
  serviceCible: string;
  objet: string;
  question: string;
  extraits: Array<{ titre: string; texte: string }>;
}

export interface ElementAccueil {
  /** Identifiant stable (type et objet), utile comme clé de liste. */
  id: string;
  type: TypeElementAccueil;
  urgence: UrgenceAccueil;
  titre: string;
  /** Pourquoi cet élément attend la personne, en français clair. */
  raison: string;
  /** Chemin relatif à l'entreprise (rubrique de l'atelier, tâche ou approbation natives). */
  lien: string;
  /** Libellé du bouton d'action de la ligne. */
  action: string;
  /** Question posée par l'équipe (carte native en attente) : toujours en tête de « À faire ». */
  enTete?: boolean;
  /** Tâche native concernée (contenu à valider, tâche bloquée, carte en attente). */
  issueId?: string;
  /** Approbation native en attente (approbation, demande d'accès). */
  approbationId?: string;
  /** Contenu de l'approbation native (type, demandeur, détails) et possibilité de la décider sur place. */
  approbation?: DetailApprobation;
  /** Carte native en attente (question ou confirmation). */
  interaction?: InteractionAccueil;
  /** Liaison entre services en attente d'approbation (décision par `liaison.decider`). */
  liaison?: LiaisonAApprouver;
}

export interface MissionResumee {
  issueId: string;
  identifiant: string | null;
  titre: string;
  statut: string;
  statutLibelle: string;
  creeLe: string;
  lien: string;
  /** Projet de la tâche (nom lisible), `null` si elle n'en a pas ou s'il est illisible. */
  projet: { id: string; nom: string } | null;
  /** La tâche porte un document `plan`. */
  aPlan: boolean;
  /** Lien vers le plan (`/issues/<identifiant>#document-plan`), `null` sans plan. */
  lienPlan: string | null;
}

export interface EtapeMission {
  issueId: string;
  identifiant: string | null;
  titre: string;
  statut: string;
  statutLibelle: string;
  agent: { id: string; nom: string } | null;
  /** Profondeur sous la tâche mère (0 : la mère). */
  profondeur: number;
  dernierCommentaire: { resume: string; le: string } | null;
  misAJourLe: string;
  lien: string;
}

export interface DependancesAccueil {
  ctx: PluginContext;
  base: BaseAtelier;
  /** Statut fonctionnel d'une tâche (même calcul que le reste de l'atelier). */
  statutTache(companyId: string, issue: Issue, sousPorte: boolean): Promise<{ statut: StatutFonctionnel; motif: string }>;
  /** Au moins une clé publique de passerelle est configurée pour l'entreprise. */
  passerelleConnectee(companyId: string): Promise<boolean>;
  /** Documents de connaissances dont la revue est due. */
  documentsARevoir(companyId: string): Promise<Array<{ id: string; titre: string }>>;
  /** Liaisons entre services de cette entreprise (source) qui attendent l'approbation d'un humain. Absent : aucune. */
  liaisonsAApprouver?(companyId: string): Promise<Array<LiaisonAApprouver & { tacheOrigine: string }>>;
}

/* ------------------------------------------------------------------ */
/* Fonctions pures (exportées pour les tests)                          */
/* ------------------------------------------------------------------ */

const RANG_URGENCE: Readonly<Record<UrgenceAccueil, number>> = { haute: 0, moyenne: 1, basse: 2 };
const RANG_TYPE: Readonly<Record<TypeElementAccueil, number>> = {
  contenu_a_valider: 0,
  approbation: 1,
  liaison_a_approuver: 2,
  demande_acces: 3,
  tache_bloquee: 4,
  document_a_revoir: 5,
  information_manquante: 6,
};

/** Tri : questions de l'équipe d'abord, puis par urgence, par type et par titre (ordre stable et prévisible). */
export function trierElements(elements: readonly ElementAccueil[]): ElementAccueil[] {
  return [...elements].sort(
    (a, b) => Number(Boolean(b.enTete)) - Number(Boolean(a.enTete)) || RANG_URGENCE[a.urgence] - RANG_URGENCE[b.urgence] || RANG_TYPE[a.type] - RANG_TYPE[b.type] || a.titre.localeCompare(b.titre, "fr"),
  );
}

const LIBELLES_STATUT_NATIF: Readonly<Record<string, string>> = {
  backlog: "En attente",
  todo: "À faire",
  in_progress: "En cours",
  in_review: "En relecture",
  blocked: "Bloquée",
  done: "Terminée",
  cancelled: "Annulée",
};
export const libelleStatutNatif = (statut: string) => LIBELLES_STATUT_NATIF[statut] ?? "Statut inconnu";

/** Résumé d'un commentaire : espaces réduits, 200 caractères au plus. */
export function resumer(texte: string, max = 200): string {
  const plat = texte.replace(/\s+/gu, " ").trim();
  return plat.length <= max ? plat : `${plat.slice(0, max - 1).trimEnd()}…`;
}

/** Titre déduit des premiers mots d'une demande (au plus 8 mots et 80 caractères). */
export function titreDepuisTexte(texte: string): string {
  const mots = texte.replace(/\s+/gu, " ").trim().split(" ");
  let titre = mots.slice(0, 8).join(" ");
  let coupe = mots.length > 8;
  if (titre.length > 80) {
    titre = titre.slice(0, 80).replace(/\s+\S*$/u, "").trimEnd() || titre.slice(0, 80);
    coupe = true;
  }
  return coupe ? `${titre}…` : titre;
}

/** Raison lisible d'une tâche bloquée, sans recopier le message technique du calcul de statut. */
export function raisonTacheBloquee(statut: StatutFonctionnel, issue: { status: string }): { raison: string; action: string } | null {
  switch (statut) {
    case "blocked_dependency":
      return { raison: "Elle attend qu'une autre tâche soit terminée.", action: "Voir la tâche" };
    case "blocked_budget":
      return { raison: "L'agent est en pause : son budget est atteint. Il reprendra si vous relevez le budget.", action: "Voir la tâche" };
    case "blocked_information":
      return issue.status === "done"
        ? { raison: "L'agent a terminé, mais votre approbation manque sur la version actuelle du contenu.", action: "Relire et décider" }
        : issue.status === "in_review"
          ? { raison: "La relecture automatique n'a pas abouti après plusieurs essais : l'équipe vous demande d'arbitrer.", action: "Relire et décider" }
          : { raison: "Il manque une information ou une décision de votre part pour avancer.", action: "Répondre" };
    case "failed":
      return { raison: "Le dernier essai de l'agent a échoué. L'équipe réessaie selon la règle prévue ; regardez si une consigne manque.", action: "Voir la tâche" };
    default:
      return null;
  }
}

const texteOuNul = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Réduit une carte native en attente à ce que l'Accueil affiche (lecture défensive : la charge vient de l'hôte). */
export function interactionAccueil(carte: { id: string; kind: string; payload?: unknown }): InteractionAccueil {
  const p = (carte.payload ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(p.questions) ? (p.questions as Array<Record<string, unknown>>) : [];
  return {
    id: carte.id,
    kind: carte.kind === "ask_user_questions" ? "ask_user_questions" : "request_confirmation",
    invite: texteOuNul(p.prompt),
    details: texteOuNul(p.detailsMarkdown),
    libelleAccepter: texteOuNul(p.acceptLabel),
    libelleRefuser: texteOuNul(p.rejectLabel),
    refusRaisonObligatoire: p.rejectRequiresReason === true,
    natifSeulement: p.toolAction != null || p.secretProposal != null,
    questions: carte.kind !== "ask_user_questions" ? [] : questions.map((q) => ({
      id: String(q.id ?? ""),
      invite: texteOuNul(q.prompt) ?? "",
      aide: texteOuNul(q.helpText),
      choix: q.selectionMode === "multi" ? "multi" : "single",
      obligatoire: q.required === true,
      autre: q.allowOther === true,
      options: (Array.isArray(q.options) ? (q.options as Array<Record<string, unknown>>) : []).map((o) => ({
        id: String(o.id ?? ""), libelle: texteOuNul(o.label) ?? "", description: texteOuNul(o.description), texteLibre: o.freeText === true,
      })),
    })),
  };
}

/**
 * Types d'approbation décidables sur place : leur approbation n'a aucun effet caché. `hire_agent` active un
 * agent avec l'adaptateur et la configuration de la demande, `budget_override_required` s'approuve sans
 * montant, et tout type inconnu est traité comme eux : page native uniquement.
 */
const TYPES_APPROBATION_SURS = new Set(["approve_ceo_strategy", "request_board_approval"]);

const coupe = (v: unknown, max = 1200): string | null => {
  const t = texteOuNul(v);
  return t === null ? null : t.length > max ? `${t.slice(0, max)}…` : t;
};

/** Réduit une approbation native à son contenu lisible (lecture défensive : la charge vient d'un agent). */
export function detailApprobation(a: { type: string; payload?: unknown; requestedByAgentId?: string | null }): DetailApprobation {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  const lignes: Array<{ libelle: string; valeur: string }> = [];
  const ajouter = (libelle: string, v: unknown) => {
    const t = coupe(v);
    if (t !== null) lignes.push({ libelle, valeur: t });
  };
  ajouter("Titre", p.title ?? p.name);
  ajouter("Résumé", p.summary);
  ajouter("Plan", p.plan ?? p.description ?? p.strategy ?? p.text);
  ajouter("Action recommandée", p.recommendedAction);
  ajouter("Suite si vous approuvez", p.nextActionOnApproval);
  if (Array.isArray(p.risks)) {
    const risques = p.risks.map((r) => coupe(r, 300)).filter((r): r is string => r !== null).slice(0, 8);
    if (risques.length > 0) lignes.push({ libelle: "Risques", valeur: risques.join(" ; ") });
  }
  for (const [cle, libelle] of [["amountCents", "Montant"], ["budgetAmount", "Budget"], ["observedAmount", "Dépense constatée"]] as const) {
    const v = p[cle];
    if (typeof v === "number" && Number.isFinite(v)) lignes.push({ libelle, valeur: cle === "amountCents" ? `${(v / 100).toFixed(2)} €` : String(v) });
  }
  return {
    type: a.type,
    surPlace: TYPES_APPROBATION_SURS.has(a.type),
    demandeur: a.requestedByAgentId ? "Un agent de l'équipe" : "Un membre de l'équipe humaine",
    lignes,
  };
}

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

const lienRubrique = (rubrique: string, id?: string) => `/${ROUTE_ATELIER}/${rubrique}${id ? `/${encodeURIComponent(id)}` : ""}`;
const lienTache = (i: { id: string; identifier?: string | null }) => `/issues/${i.identifier ?? i.id}`;
const iso = (d: Date | string | null | undefined) => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString());

const DemanderEntree = z
  .object({
    companyId: IdNatif,
    titre: z.string().trim().min(1).max(200).optional(),
    texte: z.string().trim().min(1, "La demande est vide.").max(8000),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

/** Appels à l'hôte simultanés au plus, pour l'accueil. */
const CONCURRENCE_HOTE = 8;
const MAX_PORTES_QUESTIONS = 60;
const MAX_TACHES_QUESTIONS = 40;

/** Applique `f` à chaque élément avec au plus `n` appels en cours ; l'ordre des résultats suit celui des éléments. */
async function enParallele<T, R>(elements: readonly T[], n: number, f: (e: T) => Promise<R>): Promise<R[]> {
  const resultats = new Array<R>(elements.length);
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < elements.length) {
      const i = suivant++;
      resultats[i] = await f(elements[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, ouvrier));
  return resultats;
}

/** Élément « À faire » d'une carte native en attente (question ou confirmation) ; `null` pour toute autre carte. */
export function elementDepuisCarte(issue: Pick<Issue, "id" | "identifier" | "title">, carte: Awaited<ReturnType<PluginContext["issues"]["listInteractions"]>>[number]): ElementAccueil | null {
  if (carte.status !== "pending" || (carte.kind !== "ask_user_questions" && carte.kind !== "request_confirmation")) return null;
  const question = carte.kind === "ask_user_questions";
  return {
    id: `question:${carte.id}`, type: "information_manquante", urgence: "haute", enTete: true,
    titre: carte.title?.trim() || (question ? "L'équipe vous pose une question" : "L'équipe attend votre confirmation"),
    raison: `${question ? "Il manque une information que l'équipe ne peut pas obtenir seule" : "Une décision vous revient"} (${issue.identifier ?? "tâche"} · ${issue.title}). Le travail attend votre réponse.`,
    lien: lienTache(issue), action: question ? "Répondre" : "Confirmer", issueId: issue.id, interaction: interactionAccueil(carte),
  };
}

export function routesAccueil(d: DependancesAccueil): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  /** Les lectures annexes ne font jamais échouer l'accueil : une source en panne est simplement absente. */
  async function sansEchec<T>(quoi: string, lecture: () => Promise<T>, repli: T): Promise<T> {
    try {
      return await lecture();
    } catch (e) {
      ctx.logger.warn("Accueil : lecture indisponible", { quoi, erreur: e instanceof Error ? e.message : String(e) });
      return repli;
    }
  }

  async function coordinateur(companyId: string) {
    const agents = (await ctx.agents.list({ companyId, limit: 200 })).filter((a) => a.status !== "terminated");
    return agents.find((a) => a.role === "ceo") ?? agents.find((a) => a.name.startsWith("Coordinateur")) ?? null;
  }

  async function elementsTaches(companyId: string): Promise<ElementAccueil[]> {
    const portes = await base.listerPortes(companyId);
    const sousPorte = new Map(portes.filter((p) => p.actif).map((p) => [p.issueId, true]));
    const vues = new Map<string, Issue>();
    for (const p of portes.filter((x) => x.actif).slice(0, 60)) {
      const i = await ctx.issues.get(p.issueId, companyId);
      if (i) vues.set(i.id, i);
    }
    for (const i of await ctx.issues.list({ companyId, status: "blocked", limit: 60 })) vues.set(i.id, i);

    const elements: ElementAccueil[] = [];
    for (const issue of vues.values()) {
      if (issue.status === "cancelled") continue;
      const { statut } = await d.statutTache(companyId, issue, sousPorte.has(issue.id));
      const identifiant = issue.identifier ?? "tâche";
      if (statut === "ready_for_human") {
        elements.push({
          id: `contenu:${issue.id}`, type: "contenu_a_valider", urgence: "haute", titre: issue.title,
          raison: "Le contenu a passé les contrôles de l'équipe. Il attend votre décision avant toute suite.",
          lien: lienRubrique("contenus", issue.id), action: "Relire et décider", issueId: issue.id,
        });
        continue;
      }
      const bloque = raisonTacheBloquee(statut, issue);
      if (bloque) {
        elements.push({
          id: `tache:${issue.id}`, type: "tache_bloquee", urgence: statut === "failed" ? "moyenne" : "haute", titre: `${identifiant} · ${issue.title}`,
          raison: bloque.raison, lien: sousPorte.has(issue.id) ? lienRubrique("contenus", issue.id) : lienTache(issue), action: bloque.action, issueId: issue.id,
        });
      }
    }
    return elements;
  }

  /**
   * Questions de l'équipe (16/10/2026) : cartes natives `ask_user_questions` ou `request_confirmation`
   * en attente sur les tâches de coordination (brief des campagnes, tâches parentes des livrables sous
   * porte). Le Coordinateur y demande une information introuvable ou une décision : en tête de « À faire ».
   */
  async function elementsQuestions(companyId: string): Promise<ElementAccueil[]> {
    const [campagnes, portes] = await Promise.all([
      sansEchec("campagnes", () => base.listerCampagnes(companyId), [] as Awaited<ReturnType<BaseAtelier["listerCampagnes"]>>),
      sansEchec("portes", () => base.listerPortes(companyId), [] as Awaited<ReturnType<BaseAtelier["listerPortes"]>>),
    ]);
    const candidates = new Set<string>(campagnes.map((c) => c.briefIssueId).filter((x): x is string => typeof x === "string" && x !== ""));
    const actives = portes.filter((x) => x.actif);
    if (actives.length > MAX_PORTES_QUESTIONS) ctx.logger.warn("Accueil : questions de l'équipe, livrables sous porte tronqués", { total: actives.length, lus: MAX_PORTES_QUESTIONS });
    const parents = await enParallele(actives.slice(0, MAX_PORTES_QUESTIONS), CONCURRENCE_HOTE, async (p) => (await sansEchec("tâche", () => ctx.issues.get(p.issueId, companyId), null))?.parentId ?? null);
    for (const parentId of parents) if (parentId) candidates.add(parentId);
    if (candidates.size > MAX_TACHES_QUESTIONS) ctx.logger.warn("Accueil : questions de l'équipe, tâches de coordination tronquées", { total: candidates.size, lues: MAX_TACHES_QUESTIONS });
    const lots = await enParallele([...candidates].slice(0, MAX_TACHES_QUESTIONS), CONCURRENCE_HOTE, async (issueId) => {
      const issue = await sansEchec("tâche", () => ctx.issues.get(issueId, companyId), null);
      if (!issue || issue.companyId !== companyId || issue.status === "done" || issue.status === "cancelled") return [];
      const cartes = await sansEchec("cartes", () => ctx.issues.listInteractions(issue.id, companyId), [] as Awaited<ReturnType<PluginContext["issues"]["listInteractions"]>>);
      const trouves: ElementAccueil[] = [];
      for (const carte of cartes) {
        const element = elementDepuisCarte(issue, carte);
        if (element) trouves.push(element);
      }
      return trouves;
    });
    const elements: ElementAccueil[] = lots.flat();
    return elements;
  }

  async function elementsApprobations(companyId: string): Promise<ElementAccueil[]> {
    const attente = await ctx.approvals.list({ companyId, status: "pending" });
    return attente.map((a) => {
      const acces = a.type === "hire_agent";
      const budget = a.type === "budget_override_required";
      const detail = detailApprobation(a);
      const nom = typeof a.payload?.name === "string" && a.payload.name.trim() !== "" ? a.payload.name.trim() : null;
      return {
        id: `approbation:${a.id}`,
        type: acces ? "demande_acces" : "approbation",
        urgence: acces ? "moyenne" : "haute",
        titre: acces ? (nom ? `Un nouvel agent demande à rejoindre l'équipe : ${nom}` : "Un nouvel agent demande à rejoindre l'équipe") : budget ? "Dépassement de budget à autoriser" : "Approbation en attente",
        raison: (acces
          ? "L'agent ne peut pas travailler tant que vous n'avez pas accepté ou refusé sa demande."
          : budget
            ? "Un agent a atteint son budget et demande l'autorisation de continuer."
            : "L'équipe attend votre accord pour poursuivre.") + (detail.surPlace ? "" : " Cette décision se prend dans la page native, où tout son contenu est visible."),
        lien: `/approvals/${a.id}`,
        action: acces ? "Examiner la demande" : "Décider",
        approbationId: a.id,
        approbation: detail,
      } satisfies ElementAccueil;
    });
  }

  async function elementsLiaisons(companyId: string): Promise<ElementAccueil[]> {
    if (!d.liaisonsAApprouver) return [];
    const liaisons = (await d.liaisonsAApprouver(companyId)).slice(0, 20);
    return Promise.all(
      liaisons.map(async ({ tacheOrigine, ...l }) => {
        const origine = await sansEchec("tâche d'origine de la liaison", () => ctx.issues.get(tacheOrigine, companyId), null);
        return {
          id: `liaison:${l.liaisonId}`, type: "liaison_a_approuver" as const, urgence: "haute" as const,
          titre: `Demande au service ${l.serviceCible} : ${resumer(l.objet, 120)}`,
          raison: `Le service ${l.serviceSource} veut envoyer une demande au service ${l.serviceCible}. Rien n'est envoyé tant que vous n'avez pas décidé : lisez le contenu complet avant de répondre.`,
          lien: origine ? lienTache(origine) : `/issues/${tacheOrigine}`, action: "Voir la tâche d'origine", issueId: tacheOrigine, liaison: l,
        };
      }),
    );
  }

  async function elementsConnaissances(companyId: string): Promise<ElementAccueil[]> {
    const docs = (await d.documentsARevoir(companyId)).slice(0, 10);
    return docs.map((doc) => ({
      id: `document:${doc.id}`, type: "document_a_revoir", urgence: "moyenne", titre: doc.titre,
      raison: "La date de revue prévue est passée : vérifiez que ce document est toujours exact, sinon l'équipe s'en servira à tort.",
      lien: lienRubrique("connaissances"), action: "Revoir le document",
    }));
  }

  async function elementsManquants(companyId: string): Promise<ElementAccueil[]> {
    const [baseClients, marques, passerelle] = await Promise.all([
      sansEchec("base clients", () => base.etatBaseClients(companyId), null),
      sansEchec("marque", () => base.marques(companyId), null),
      sansEchec("passerelle", () => d.passerelleConnectee(companyId), null),
    ]);
    const elements: ElementAccueil[] = [];
    if (baseClients !== null && baseClients.clients === 0) {
      elements.push({
        id: "manque:base-clients", type: "information_manquante", urgence: "basse", titre: "Aucune base de clients importée",
        raison: "Sans vos clients actuels, l'équipe ne peut ni les écarter des prospects ni leur proposer d'offres complémentaires.",
        lien: lienRubrique("prospects"), action: "Importer la base",
      });
    }
    if (passerelle === false) {
      elements.push({
        id: "manque:passerelle", type: "information_manquante", urgence: "basse", titre: "Aucune connexion à vos outils",
        raison: "L'équipe ne peut lire ni vos statistiques ni vos réseaux : elle travaille sans chiffres réels.",
        lien: lienRubrique("parametres"), action: "Configurer la connexion",
      });
    }
    if (marques !== null) {
      const courante = marques[0];
      if (!courante) {
        elements.push({
          id: "manque:marque", type: "information_manquante", urgence: "basse", titre: "Marque non décrite",
          raison: "Sans description de votre marque, l'équipe ne connaît ni votre ton ni vos offres.",
          lien: lienRubrique("marque"), action: "Décrire la marque",
        });
      } else if (courante.informationsManquantes.length > 0) {
        const n = courante.informationsManquantes.length;
        elements.push({
          id: "manque:marque", type: "information_manquante", urgence: "basse", titre: "Description de la marque incomplète",
          raison: `Il manque ${n} information${n > 1 ? "s" : ""} : ${courante.informationsManquantes.slice(0, 3).join(", ")}${n > 3 ? ", …" : ""}.`,
          lien: lienRubrique("marque"), action: "Compléter la marque",
        });
      }
    }
    return elements;
  }

  routes["accueil.lister"] = async (r) => {
    exigerHumain(r.acteur, "L'accueil");
    const c = r.companyId;
    const [taches, approbations, liaisons, connaissances, manquants, demandes, questions] = await Promise.all([
      sansEchec("tâches", () => elementsTaches(c), [] as ElementAccueil[]),
      sansEchec("approbations", () => elementsApprobations(c), [] as ElementAccueil[]),
      sansEchec("liaisons", () => elementsLiaisons(c), [] as ElementAccueil[]),
      sansEchec("connaissances", () => elementsConnaissances(c), [] as ElementAccueil[]),
      elementsManquants(c),
      sansEchec("missions", () => ctx.issues.list({ companyId: c, originKind: ORIGINE_DEMANDE as never, includePluginOperations: true, limit: 50 }), [] as Issue[]),
      sansEchec("questions", () => elementsQuestions(c), [] as ElementAccueil[]),
    ]);
    const projets = new Map<string, { id: string; nom: string } | null>();
    const projetDe = async (issue: Issue) => {
      const projectId = (issue as { projectId?: string | null }).projectId ?? null;
      if (!projectId) return null;
      if (!projets.has(projectId)) {
        const p = await sansEchec("projet", () => ctx.projects.get(projectId, c), null);
        projets.set(projectId, p ? { id: p.id, nom: p.name } : null);
      }
      return projets.get(projectId) ?? null;
    };
    const missions: MissionResumee[] = await Promise.all(
      demandes
        .filter((i) => i.status !== "done" && i.status !== "cancelled" && i.parentId == null)
        .sort((a, b) => iso(b.createdAt).localeCompare(iso(a.createdAt)))
        .slice(0, 5)
        .map(async (i) => {
          const documents = await sansEchec("documents de la tâche", () => ctx.issues.documents.list(i.id, c), []);
          const aPlan = documents.some((doc) => doc.key === "plan");
          return {
            issueId: i.id, identifiant: i.identifier ?? null, titre: i.title, statut: i.status, statutLibelle: libelleStatutNatif(i.status), creeLe: iso(i.createdAt), lien: lienTache(i),
            projet: await projetDe(i), aPlan, lienPlan: aPlan ? `${lienTache(i)}#document-plan` : null,
          };
        }),
    );
    return { corps: { companyId: c, elements: trierElements([...questions, ...taches, ...approbations, ...liaisons, ...connaissances, ...manquants]), missions } };
  };

  routes["equipe.demander"] = async (r) => {
    exigerHumain(r.acteur, "L'envoi d'une demande à l'équipe");
    const p = DemanderEntree.safeParse(r.corps);
    if (!p.success) erreurValidation("Demande à l'équipe", p.error.issues);
    if (p.data.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Entreprise incohérente : seule l'entreprise résolue par l'hôte est servie.");
    const coord = await coordinateur(r.companyId);
    if (!coord) erreur("introuvable", "Aucun Coordinateur dans cette entreprise : la demande ne peut pas être répartie.");
    const titre = p.data.titre ?? titreDepuisTexte(p.data.texte);
    const tache = await ctx.issues.create({
      companyId: r.companyId, title: titre, description: p.data.texte, status: "todo", priority: "medium", assigneeAgentId: coord.id,
      originKind: ORIGINE_DEMANDE as never, originId: `demande:${globalThis.crypto.randomUUID()}`,
      ...(r.acteur.userId ? { actor: { actorUserId: r.acteur.userId } } : {}),
    });
    // L'hôte ne réveille pas l'agent à la création : on le réveille ici pour ne pas attendre le balayage
    // périodique. Un échec n'annule pas la demande (le balayage reste le filet) mais est journalisé.
    let erreurReveil: string | null = null;
    try {
      await ctx.issues.requestWakeup(tache.id, r.companyId, {
        reason: "atelier_demande_equipe",
        contextSource: "atelier.demande",
        idempotencyKey: `atelier-demande-${tache.id}`,
      });
    } catch (err) {
      erreurReveil = err instanceof Error ? err.message : String(err);
      ctx.logger.warn("Demande à l'équipe : réveil du Coordinateur impossible, le balayage périodique prendra le relais", { issueId: tache.id, erreur: erreurReveil });
    }
    await base.journaliser({
      companyId: r.companyId, type: "equipe.demande", entite: "tache", entiteId: tache.id, issueId: tache.id, acteur: r.acteur.id,
      donnees: { coordinateurId: coord.id, titre, ...(erreurReveil ? { erreurReveil } : {}) },
    });
    return { statut: 201, corps: { issueId: tache.id, identifiant: tache.identifier ?? null, lien: lienTache(tache) } };
  };

  routes["mission.suivre"] = async (r) => {
    exigerHumain(r.acteur, "Le suivi d'une mission");
    const racine = await ctx.issues.get(r.params.issueId ?? "", r.companyId);
    if (!racine || racine.companyId.toLowerCase() !== r.companyId.toLowerCase()) erreur("introuvable", "Tâche introuvable dans cette entreprise.");
    // Descendants lus en mémoire (l'API native ne filtre pas par parent) : trois niveaux au plus.
    const toutes = await ctx.issues.list({ companyId: r.companyId, includePluginOperations: true, limit: 500 });
    const profondeurs = new Map<string, number>([[racine.id, 0]]);
    for (let niveau = 1; niveau <= 3; niveau += 1) {
      for (const i of toutes) {
        if (!profondeurs.has(i.id) && i.parentId && profondeurs.get(i.parentId) === niveau - 1) profondeurs.set(i.id, niveau);
      }
    }
    const ordre = [racine, ...toutes.filter((i) => profondeurs.has(i.id) && i.id !== racine.id).sort((a, b) => iso(a.createdAt).localeCompare(iso(b.createdAt)))];
    const agents = new Map<string, { id: string; nom: string } | null>();
    const agentDe = async (id: string | null) => {
      if (!id) return null;
      if (!agents.has(id)) {
        const a = await sansEchec("agent", () => ctx.agents.get(id, r.companyId), null);
        agents.set(id, a ? { id: a.id, nom: a.name } : null);
      }
      return agents.get(id) ?? null;
    };
    const etapes: EtapeMission[] = [];
    for (const i of ordre.slice(0, 40)) {
      const commentaires = await sansEchec("commentaires", () => ctx.issues.listComments(i.id, r.companyId), []);
      const dernier = [...commentaires].sort((a, b) => iso(b.createdAt).localeCompare(iso(a.createdAt)))[0];
      etapes.push({
        issueId: i.id, identifiant: i.identifier ?? null, titre: i.title, statut: i.status, statutLibelle: libelleStatutNatif(i.status),
        agent: await agentDe(i.assigneeAgentId ?? null), profondeur: profondeurs.get(i.id) ?? 0,
        dernierCommentaire: dernier && dernier.body.trim() !== "" ? { resume: resumer(dernier.body), le: iso(dernier.createdAt) } : null,
        misAJourLe: iso(i.updatedAt), lien: lienTache(i),
      });
    }
    return { corps: { mere: etapes[0], sousTaches: etapes.slice(1) } };
  };

  return routes;
}
