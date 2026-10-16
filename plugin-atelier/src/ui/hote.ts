/**
 * Appels à l'API NATIVE de Paperclip depuis l'interface (même origine, session
 * de l'utilisateur). Utilisés seulement là où le contrat le prévoit ou là où
 * l'humain agit sur un objet natif :
 * - création du projet natif d'une campagne (contrat `CreerCampagneEntree.projectId`) ;
 * - montée d'un cran du producteur lors d'une relance de correction ;
 * - transition native de la tâche après la décision humaine (comme dans
 *   `scripts/scenarios/atelier_scenarios.py`), toujours soumise aux gardes du
 *   serveur patché (P2 refuse `done` sans porte franchie).
 * Aucun secret n'est lu ni envoyé : seuls les cookies de session de l'hôte.
 */
export interface ErreurHote {
  code: string;
  message: string;
}

export async function appelHote<T>(methode: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      credentials: "include",
      headers: corps === undefined ? undefined : { "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
    throw { code: "RESEAU", message: "Serveur Paperclip injoignable." } satisfies ErreurHote;
  }
  const texte = await reponse.text();
  let json: unknown = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = null;
  }
  if (!reponse.ok) {
    const j = (json ?? {}) as { error?: unknown; erreur?: unknown; message?: unknown };
    const message = [j.erreur, j.error, j.message].find((x): x is string => typeof x === "string") ?? `Réponse HTTP ${reponse.status}.`;
    throw { code: `HTTP_${reponse.status}`, message } satisfies ErreurHote;
  }
  return json as T;
}

export interface ProjetNatif {
  id: string;
  name: string;
}

export function creerProjetNatif(companyId: string, nom: string, idempotencyKey: string): Promise<ProjetNatif> {
  return appelHote<ProjetNatif>("POST", `/companies/${encodeURIComponent(companyId)}/projects`, { name: nom, status: "planned", idempotencyKey });
}

export function transitionTache(issueId: string, statut: "done" | "in_progress", commentaire: string): Promise<{ status?: string }> {
  return appelHote("PATCH", `/issues/${encodeURIComponent(issueId)}`, { status: statut, comment: commentaire });
}

/**
 * Levier « montée d'un cran » d'une relance de correction : applique le palier
 * au producteur par l'API native des agents (fusion de `adapterConfig`, réservée
 * au board). Le worker revérifie ensuite la configuration réelle de l'agent.
 */
export function appliquerPalierAgent(agentId: string, palier: { modele: string; effort: string }): Promise<unknown> {
  return appelHote("PATCH", `/agents/${encodeURIComponent(agentId)}`, { adapterConfig: { model: palier.modele, effort: palier.effort } });
}

/** Action de récupération réglée par Paperclip pour la tâche (activité native), si elle existe. */
export async function actionRecuperation(issueId: string): Promise<string | null> {
  const brut = await appelHote<unknown>("GET", `/issues/${encodeURIComponent(issueId)}/activity`);
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] } | null)?.items ?? [])) as Array<{ action?: string; details?: { recoveryActionId?: string } }>;
  const reglee = liste.find((a) => a.action === "issue.execution_recovery_settled" && a.details?.recoveryActionId);
  return reglee?.details?.recoveryActionId ?? null;
}

/**
 * Reprise après un arrêt du serveur : réconciliation humaine native
 * (`POST /api/issues/:id/recovery-actions/resolve` avec `executionReconciliation`),
 * la seule voie qui lève le verrou de la tâche (Paperclip ne rejoue jamais un run).
 */
export function reprendreTache(issueId: string, corps: Record<string, unknown>): Promise<{ issue?: { status?: string } }> {
  return appelHote("POST", `/issues/${encodeURIComponent(issueId)}/recovery-actions/resolve`, corps);
}

/**
 * Levier « version corrigée » : l'humain écrit la nouvelle révision du document natif
 * (concurrence optimiste par `baseRevisionId`) ; le worker la vérifie ensuite.
 */
export function ecrireVersionHumaine(issueId: string, cle: string, titre: string | null, corps: string, baseRevisionId: string): Promise<{ latestRevisionId?: string | null }> {
  return appelHote("PUT", `/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(cle)}`, {
    title: titre ?? undefined,
    format: "markdown",
    body: corps,
    changeSummary: "Version corrigée à la main par l'humain (relance de correction)",
    baseRevisionId,
  });
}

/* ------------------------------------------------------------------ */
/* Budgets IA NATIFS (entreprise et agent) : l'atelier n'a pas de budget parallèle */
/* ------------------------------------------------------------------ */

/** Budget mensuel natif en centimes ; 0 = aucune limite (règle de Paperclip, `services/budgets.ts`). */
export interface BudgetNatif {
  id: string;
  nom: string;
  budgetMonthlyCents: number;
}

export async function lireBudgetEntreprise(companyId: string): Promise<BudgetNatif> {
  const c = await appelHote<{ id: string; name: string; budgetMonthlyCents?: number }>("GET", `/companies/${encodeURIComponent(companyId)}`);
  return { id: c.id, nom: c.name, budgetMonthlyCents: c.budgetMonthlyCents ?? 0 };
}

export async function lireBudgetsAgents(companyId: string): Promise<BudgetNatif[]> {
  const brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(companyId)}/agents`);
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] } | null)?.items ?? [])) as Array<{ id: string; name: string; budgetMonthlyCents?: number; status?: string }>;
  return liste.filter((a) => a.status !== "terminated").map((a) => ({ id: a.id, nom: a.name, budgetMonthlyCents: a.budgetMonthlyCents ?? 0 }));
}

export function ecrireBudgetNatif(portee: "entreprise" | "agent", id: string, budgetMonthlyCents: number): Promise<unknown> {
  const chemin = portee === "entreprise" ? `/companies/${encodeURIComponent(id)}/budgets` : `/agents/${encodeURIComponent(id)}/budgets`;
  return appelHote("PATCH", chemin, { budgetMonthlyCents });
}
