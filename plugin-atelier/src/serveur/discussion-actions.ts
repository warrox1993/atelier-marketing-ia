/**
 * Actions structurées que le Coordinateur joint à un message de la Discussion (télécommande de l'atelier).
 *
 * Format : un bloc de code `atelier-actions` à la fin du commentaire, contenant un tableau JSON.
 *
 *     ```atelier-actions
 *     [{"type":"ouvrir","cible":"prospects","filtre":{"statut":"qualifie"}},{"type":"traiter","element":"contenu:<issueId>"}]
 *     ```
 *
 * Listes fermées : deux types (`ouvrir`, `traiter`), des cibles connues, un identifiant d'élément « À faire »
 * de forme contrôlée. Jamais d'URL libre, de HTML ni d'identifiant d'entreprise (champ refusé par `.strict()`) :
 * l'action ne peut viser que l'entreprise de la Discussion, car l'interface la résout dans l'entreprise courante.
 * `filtre` (facultatif, cible `prospects` seulement dans l'interface) : objet de champs fermés et bornés,
 * voir `contrats/filtre-prospects.ts` ; la télécommande le convertit en paramètres d'adresse.
 * Toute action invalide est écartée (et rapportée à l'appelant pour journalisation), jamais une erreur visible.
 */
import { z } from "zod";
import { FiltreProspects } from "../contrats/filtre-prospects.js";

/** Rubriques qu'une action `ouvrir` peut viser (clés de vue de l'atelier, discussion exclue). */
export const CIBLES_DISCUSSION = [
  "accueil", "prospects", "carte", "campagnes", "contenus", "calendrier", "resultats", "equipe", "marque", "connaissances", "mise-en-place", "parametres", "corbeille",
] as const;
export const MAX_ACTIONS = 6;

export const ActionOuvrir = z.object({ type: z.literal("ouvrir"), cible: z.enum(CIBLES_DISCUSSION), filtre: FiltreProspects.optional() }).strict();
/** `element` : identifiant d'un élément de « À faire » (`contenu:`, `question:`, `approbation:` ou `tache:` + jeton sûr). */
export const ActionTraiter = z.object({ type: z.literal("traiter"), element: z.string().regex(/^(contenu|question|approbation|tache):[A-Za-z0-9_-]{1,64}$/u) }).strict();
export const ActionDiscussion = z.discriminatedUnion("type", [ActionOuvrir, ActionTraiter]);
export type ActionDiscussion = z.infer<typeof ActionDiscussion>;

const BLOC = /```atelier-actions[ \t]*\r?\n([\s\S]*?)```/gu;

export interface ExtractionActions {
  /** Texte du message sans les blocs d'actions. */
  texte: string;
  actions: ActionDiscussion[];
  /** Motifs des actions écartées, pour le journal. */
  ignorees: string[];
}

export function extraireActions(corps: string): ExtractionActions {
  const actions: ActionDiscussion[] = [];
  const ignorees: string[] = [];
  const vues = new Set<string>();
  for (const bloc of corps.matchAll(BLOC)) {
    let brut: unknown;
    try {
      brut = JSON.parse(bloc[1] ?? "");
    } catch {
      ignorees.push("bloc d'actions illisible (JSON invalide)");
      continue;
    }
    if (!Array.isArray(brut)) {
      ignorees.push("bloc d'actions : un tableau est attendu");
      continue;
    }
    for (const entree of brut) {
      const p = ActionDiscussion.safeParse(entree);
      if (!p.success) {
        const type = typeof entree === "object" && entree !== null && "type" in entree ? String((entree as { type: unknown }).type).slice(0, 40) : "?";
        ignorees.push(`action refusée (type « ${type} ») : ${p.error.issues[0]?.message ?? "invalide"}`.slice(0, 200));
        continue;
      }
      const cle = JSON.stringify(p.data);
      if (vues.has(cle)) continue;
      if (actions.length >= MAX_ACTIONS) {
        ignorees.push(`plus de ${MAX_ACTIONS} actions : les suivantes sont écartées`);
        break;
      }
      vues.add(cle);
      actions.push(p.data);
    }
  }
  return { texte: corps.replace(BLOC, "").trim(), actions, ignorees };
}
