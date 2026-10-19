/**
 * Actions structurées que le Coordinateur joint à un message de la Discussion (télécommande de l'atelier).
 *
 * Format : un bloc de code `atelier-actions` à la fin du commentaire, contenant un tableau JSON.
 *
 *     ```atelier-actions
 *     [{"type":"ouvrir","cible":"prospects","filtre":{"statut":"qualifie"}},{"type":"traiter","element":"contenu:<issueId>"}]
 *     ```
 *
 * Listes fermées : trois types (`ouvrir`, `traiter`, `agents`), des cibles connues, un identifiant d'élément « À faire »
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
  "organigramme", "departements", "echanges", "rapport", "agents",
] as const;
/** Sections de la vue Paramètres qu'une action `ouvrir` peut viser (ancre `#param-<section>`). */
export const SECTIONS_PARAMETRES = ["diagnostic", "sources", "criteres", "depenses", "modeles"] as const;
export const MAX_ACTIONS = 6;

/** Identifiant court d'un service (même forme que les slugs déclarés : minuscules, chiffres, tirets). */
export const SlugService = z.string().max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u);

/**
 * `service` (facultatif) : organigramme = ancre `#service=<slug>` ; autres cibles = l'écran dans l'entreprise de ce service.
 * `section` (facultatif, `parametres` seulement) : ancre `#param-<section>`. `filtre` : `prospects` seulement.
 */
export const ActionOuvrir = z
  .object({ type: z.literal("ouvrir"), cible: z.enum(CIBLES_DISCUSSION), filtre: FiltreProspects.optional(), service: SlugService.optional(), section: z.enum(SECTIONS_PARAMETRES).optional() })
  .strict()
  .superRefine((a, ctx) => {
    if (a.filtre !== undefined && a.cible !== "prospects") ctx.addIssue({ code: "custom", message: "`filtre` n'a de sens que pour la cible `prospects`", path: ["filtre"] });
    if (a.section !== undefined && a.cible !== "parametres") ctx.addIssue({ code: "custom", message: "`section` n'a de sens que pour la cible `parametres`", path: ["section"] });
  });

/**
 * Allumer ou couper des agents d'un service (ou de tous). Jamais d'identifiant d'entreprise ni d'agent : le service est
 * résolu parmi ceux du client de la Discussion, les agents par leur NOM, et rien ne part sans le clic de l'humain.
 */
export const ActionAgents = z
  .object({
    type: z.literal("agents"),
    operation: z.enum(["couper", "allumer"]),
    service: z.union([SlugService, z.literal("tous")]),
    agents: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict();
/** `element` : identifiant d'un élément de « À faire » (`contenu:`, `question:`, `approbation:` ou `tache:` + jeton sûr). */
export const ActionTraiter = z.object({ type: z.literal("traiter"), element: z.string().regex(/^(contenu|question|approbation|tache):[A-Za-z0-9_-]{1,64}$/u) }).strict();
export const ActionDiscussion = z.discriminatedUnion("type", [ActionOuvrir, ActionTraiter, ActionAgents]);
export type ActionDiscussion = z.infer<typeof ActionDiscussion>;

/** Jeton qui ouvre un bloc d'actions (revue du 19/10/2026, F1). */
export const JETON_ACTIONS = "atelier-actions";
const JETON_RE = /atelier-actions/giu;
const JETON_PRESENT = /atelier-actions/iu;
/** Ouverture d'un bloc d'actions : début de ligne, trois accents graves (pas quatre : une clôture plus longue n'ouvre rien), jeton, fin de ligne. */
const OUVERTURE = /(?:^|\n)```atelier-actions[ \t]*\r?\n/gu;

/**
 * Neutralise le jeton dans un texte recopié d'un autre service ou d'une autre source (tiret insécable U+2011) : un bloc
 * d'actions cité dans une réponse de liaison ne doit jamais pouvoir redevenir un bloc exécutable.
 */
export const neutraliserJetonActions = (texte: string): string => texte.replace(JETON_RE, "atelier\u2011actions");

export interface ExtractionActions {
  /** Texte du message sans les blocs d'actions. */
  texte: string;
  actions: ActionDiscussion[];
  /** Motifs des actions écartées, pour le journal. */
  ignorees: string[];
}

/**
 * Un seul bloc compte : celui qui CLÔT le message (revue du 19/10/2026, F1). Un bloc cité au milieu d'un message
 * (réponse d'un service recopiée, exemple) n'est jamais extrait, et si le jeton apparaît ailleurs que dans ce bloc final,
 * toutes les actions du message sont écartées (le message cite du contenu qui n'est pas du Coordinateur).
 */
export function extraireActions(corps: string): ExtractionActions {
  const actions: ActionDiscussion[] = [];
  const ignorees: string[] = [];
  const fin = corps.trimEnd();
  let texte = corps.trim();
  let brutBloc: string | null = null;
  let debutBloc = -1;
  if (fin.endsWith("```")) {
    // Dernière ouverture avant la clôture finale ; le contenu ne doit contenir aucune autre clôture.
    for (const o of fin.matchAll(OUVERTURE)) {
      const contenu = fin.slice((o.index ?? 0) + o[0].length, fin.length - 3);
      if (!contenu.includes("```")) {
        brutBloc = contenu;
        debutBloc = o.index ?? 0;
        break;
      }
    }
  }
  const sansBloc = debutBloc >= 0 ? fin.slice(0, debutBloc) : fin;
  if (debutBloc >= 0) texte = sansBloc.trim();
  if (JETON_PRESENT.test(sansBloc)) {
    ignorees.push("jeton de bloc d'actions cité dans le texte du message : toutes les actions sont écartées");
    return { texte, actions, ignorees };
  }
  if (brutBloc === null) return { texte, actions, ignorees };
  let brut: unknown;
  try {
    brut = JSON.parse(brutBloc);
  } catch {
    ignorees.push("bloc d'actions illisible (JSON invalide)");
    return { texte, actions, ignorees };
  }
  if (!Array.isArray(brut)) {
    ignorees.push("bloc d'actions : un tableau est attendu");
    return { texte, actions, ignorees };
  }
  const vues = new Set<string>();
  for (const entree of brut) {
    const p = ActionDiscussion.safeParse(entree);
    if (!p.success) {
      const type = typeof entree === "object" && entree !== null && "type" in entree ? String((entree as { type: unknown }).type).slice(0, 40) : "?";
      ignorees.push(`action refusée (type « ${type} ») : ${p.error.issues[0]?.message ?? "invalide"}`.slice(0, 200));
      continue;
    }
    const cle = JSON.stringify(p.data);
    if (vues.has(cle)) continue;
    if (p.data.type === "agents" && actions.some((a) => a.type === "agents")) {
      ignorees.push("plus d'une action `agents` dans le message : les suivantes sont écartées");
      continue;
    }
    if (actions.length >= MAX_ACTIONS) {
      ignorees.push(`plus de ${MAX_ACTIONS} actions : les suivantes sont écartées`);
      break;
    }
    vues.add(cle);
    actions.push(p.data);
  }
  return { texte, actions, ignorees };
}
