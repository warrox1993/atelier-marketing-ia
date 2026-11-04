/**
 * Dépôt par référence : au lieu de recopier la réponse signée d'un outil de la passerelle, l'agent
 * dépose son `_atelier.reference`. Le plugin la prend chez la passerelle (usage unique) puis la
 * passe au chemin de vérification ordinaire : la signature n'est jamais contournée.
 */
import { ReponseDeposee } from "../contrats/index.js";
import type { ReponseOutil } from "./regles-donnees.js";
import { erreur } from "./erreurs.js";

export const CHEMIN_PRENDRE_REPONSE = "/interne/reponses/prendre";
const DELAI_PRISE_MS = 10_000;

/** Service et outil déclarés au dépôt : la passerelle les compare à ceux de la lecture et refuse sans consommer la référence. */
export interface LectureAttendue { service: string; outil: string }

/** Prend une réponse gardée chez la passerelle (adresse locale déjà contrôlée) : `reponse` du CallToolResult, ou null si 404. */
export type PrendreReponse = (companyId: string, reference: string, attendu: LectureAttendue) => Promise<unknown>;

export function creerPriseReponse(
  adresse: (companyId: string) => Promise<URL | null>,
  appel: (url: string, init: RequestInit) => Promise<Response>,
  /** Jeton partagé avec la passerelle (secret natif du plugin) ; null si non configuré. */
  jeton: (companyId: string) => Promise<string | null>,
): PrendreReponse {
  return async (companyId, reference, attendu) => {
    const base = await adresse(companyId);
    if (!base) erreur("emailing_indisponible", "Adresse de la passerelle absente ou hors de cette machine (réglage « passerelleUrl ») : la référence ne peut pas être lue, rien n'est déposé.");
    const secret = await jeton(companyId);
    if (!secret) erreur("emailing_indisponible", "Jeton de lecture des références absent (réglage « reponsesJetonRef » du plugin) : la référence ne peut pas être lue, rien n'est déposé. Recopier la réponse complète.");
    let reponse: Response;
    try {
      reponse = await appel(new URL(CHEMIN_PRENDRE_REPONSE, base).toString(), {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, redirect: "error", signal: AbortSignal.timeout(DELAI_PRISE_MS),
        body: JSON.stringify({ reference, service: attendu.service, outil: attendu.outil }),
      });
    } catch {
      erreur("emailing_indisponible", "La passerelle ne répond pas : la référence n'a pas pu être lue, rien n'est déposé. Réessayer, ou recopier la réponse complète.");
    }
    if (reponse.status === 404) return null;
    if (reponse.status === 401) erreur("emailing_indisponible", "La passerelle a refusé le jeton de lecture des références : vérifier que le secret « reponsesJetonRef » du plugin et PASSERELLE_REPONSES_JETON_FICHIER de la passerelle contiennent le même jeton. Rien n'est déposé.");
    if (reponse.status === 409) erreur("entree_invalide", "Cette référence vient d'une autre lecture (service ou outil différents de ceux déclarés) : elle n'est pas consommée. Redéclare le service et l'outil réellement appelés.");
    let corps: unknown = null;
    try { corps = await reponse.json(); } catch { /* illisible : refus ci-dessous */ }
    if (!reponse.ok || typeof corps !== "object" || corps === null || !("reponse" in corps)) {
      erreur("emailing_indisponible", `Réponse inattendue de la passerelle pour la référence (HTTP ${reponse.status}) : rien n'est déposé.`);
    }
    return (corps as { reponse: unknown }).reponse;
  };
}

/**
 * Exactement un de `reponse` et `reference` ; la référence est échangée contre la réponse (CallToolResult
 * `{content, structuredContent}` mis à la forme du dépôt `{texte, structuredContent}`).
 */
export async function resoudreReponse(
  entree: { reponse?: ReponseOutil | undefined; reference?: string | undefined },
  companyId: string,
  prendre: PrendreReponse,
  attendu: LectureAttendue,
): Promise<ReponseOutil> {
  if ((entree.reponse === undefined) === (entree.reference === undefined)) {
    erreur("entree_invalide", "Dépôt de données de connexion : fournir exactement un de « reponse » (recopie complète) et « reference » (_atelier.reference de la réponse de l'outil).");
  }
  if (entree.reponse !== undefined) return entree.reponse;
  const prise = await prendre(companyId, entree.reference!, attendu);
  if (prise === null) erreur("entree_invalide", "La référence est inconnue ou déjà utilisée : relis l'outil et dépose la nouvelle référence.");
  const r = prise as { content?: unknown; structuredContent?: unknown } | null;
  const premier = Array.isArray(r?.content) ? (r.content as Array<{ type?: unknown; text?: unknown }>).find((c) => c?.type === "text" && typeof c.text === "string") : undefined;
  const forme = ReponseDeposee.safeParse({
    ...(premier && String(premier.text).length > 0 ? { texte: String(premier.text) } : {}),
    ...(r?.structuredContent !== undefined ? { structuredContent: r.structuredContent } : {}),
  });
  if (!forme.success) erreur("entree_invalide", "Réponse prise sur la passerelle illisible : relis l'outil et dépose la nouvelle référence.");
  return forme.data;
}
