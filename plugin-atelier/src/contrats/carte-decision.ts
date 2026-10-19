/**
 * Cartes de décision humaine (`ask_user_questions`, `request_confirmation`) : logique PURE partagée entre le serveur
 * (accueil, discussion) et l'interface (décisions en attente dans les autres services du client). Aucune dépendance
 * à l'hôte ni au SDK : une carte brute de l'API native, en entrée ; un élément « À faire », en sortie.
 */
import type { ElementAccueil, InteractionAccueil } from "../serveur/services-accueil.js";

/** Carte native telle que l'hôte la rend (seuls les champs lus ici). */
export interface CarteNative {
  id: string;
  kind: string;
  status: string;
  title?: string | null;
  payload?: unknown;
}

/** Tâche native réduite à ce que l'élément affiche. */
export interface TacheNative {
  id: string;
  identifier?: string | null;
  title: string;
}

/** Tâche reçue par une liaison née de la discussion, à suivre dans son entreprise (lue par l'interface, pas par le plugin). */
export interface TacheASuivre {
  companyId: string;
  tacheId: string;
  slug: string;
  nom: string;
}

/** Carte en attente d'un autre service, avec sa date de création (placement chronologique dans le fil) et son service. */
export interface CarteService {
  element: ElementAccueil;
  /** Date de création de la carte (ISO). */
  date: string;
  companyId: string;
  slug: string;
  nom: string;
  /** Identifiant lisible de la tâche qui porte la carte (ex. MKT-2). */
  tache: string;
}

export const texteOuNul = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Lien relatif à l'entreprise vers une tâche native. */
export const lienTache = (i: { id: string; identifier?: string | null }) => `/issues/${i.identifier ?? i.id}`;

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

/** Élément « À faire » d'une carte native en attente (question ou confirmation) ; `null` pour toute autre carte. */
export function elementDepuisCarte(issue: TacheNative, carte: CarteNative): ElementAccueil | null {
  if (carte.status !== "pending" || (carte.kind !== "ask_user_questions" && carte.kind !== "request_confirmation")) return null;
  const question = carte.kind === "ask_user_questions";
  return {
    id: `question:${carte.id}`, type: "information_manquante", urgence: "haute", enTete: true,
    titre: carte.title?.trim() || (question ? "L'équipe vous pose une question" : "L'équipe attend votre confirmation"),
    raison: `${question ? "Il manque une information que l'équipe ne peut pas obtenir seule" : "Une décision vous revient"} (${issue.identifier ?? "tâche"} · ${issue.title}). Le travail attend votre réponse.`,
    lien: lienTache(issue), action: question ? "Répondre" : "Confirmer", issueId: issue.id, interaction: interactionAccueil(carte),
  };
}
