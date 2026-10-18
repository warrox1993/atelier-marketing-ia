/**
 * Voix en direct (humain seulement) pour le futur chat de pilotage, par l'API Realtime d'OpenAI (disponibilité
 * générale, WebRTC).
 *
 * - `voix.session` : lit la clé OpenAI dans le coffre de secrets du socle (configuration `openaiSecretRef`), crée un
 *   secret client ÉPHÉMÈRE (`POST /v1/realtime/client_secrets`, durée de vie courte) déjà réglé (modèle, voix,
 *   français, instructions, outils) et renvoie `{clientSecret, expireLe, modele}`. Le navigateur s'en sert pour
 *   négocier l'appel WebRTC directement avec OpenAI (`POST /v1/realtime/calls`) : l'audio ne passe pas par ce plugin.
 *
 * Garanties : la clé API ne sort jamais du serveur et n'est jamais journalisée ni renvoyée (ni dans une erreur) ;
 * le journal ne note que la création de la session (modèle, voix, durée) ; un agent reçoit 403 ; sans clé
 * configurée : 503 `voix_non_configuree`.
 */
import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";

export const URL_SECRETS_CLIENT = "https://api.openai.com/v1/realtime/client_secrets";
/** Modèle de la disponibilité générale (documentation OpenAI consultée le 16/10/2026, voir docs/voix-en-direct.md). */
export const MODELE_VOIX = "gpt-realtime";
export const VOIX = "marin";
/** Modèle de transcription de ce que dit l'utilisateur (affichage en direct). */
export const MODELE_TRANSCRIPTION = "gpt-4o-mini-transcribe";
/** Durée de vie du secret éphémère : juste le temps d'ouvrir l'appel. */
export const DUREE_SECRET_SECONDES = 60;
const DELAI_APPEL_MS = 15_000;

export const INSTRUCTIONS_VOIX =
  "Tu es l'assistant vocal de l'Atelier. Réponds toujours en français, brièvement et simplement, comme à l'oral. " +
  "Pour consulter l'état de l'atelier, utilise les outils de lecture (etat_missions, taches_bloquees, resume_prospects) et ne devine jamais un chiffre. " +
  "Pour toute action (créer, modifier, publier, envoyer, relancer), tu ne la fais pas toi-même : dis que tu la transmets au Coordinateur et appelle transmettre_au_coordinateur avec la demande reformulée.";

/** Outils exposés au modèle (lecture seule + transmission au Coordinateur) ; le navigateur les exécute. */
export const OUTILS_VOIX = [
  { type: "function", name: "etat_missions", description: "Lit les missions en cours de l'atelier et leur avancement.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "taches_bloquees", description: "Lit les tâches bloquées ou en échec qui attendent une décision ou une information.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "resume_prospects", description: "Résume la base de prospects : nombre total et nombre de prospects qualifiés.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  {
    type: "function",
    name: "transmettre_au_coordinateur",
    description: "Transmet une demande d'action au Coordinateur de l'équipe, qui crée la tâche. Seul moyen d'agir : à utiliser pour toute action.",
    parameters: { type: "object", properties: { demande: { type: "string", description: "La demande, reformulée clairement en français." } }, required: ["demande"], additionalProperties: false },
  },
] as const;

const Entree = z.object({ companyId: IdNatif }).strict();

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

export interface DependancesVoix {
  ctx: PluginContext;
  base: BaseAtelier;
  /** Tests : remplace `ctx.http.fetch` (appel sortant vers api.openai.com). */
  fetchSortant?: (url: string, init: RequestInit) => Promise<Response>;
  /** Tests : horloge. */
  maintenant?: () => number;
}

/** Corps envoyé à OpenAI (session GA de type « realtime »). */
export function sessionVoix() {
  return {
    expires_after: { anchor: "created_at", seconds: DUREE_SECRET_SECONDES },
    session: {
      type: "realtime",
      model: MODELE_VOIX,
      instructions: INSTRUCTIONS_VOIX,
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: MODELE_TRANSCRIPTION, language: "fr" },
          noise_reduction: { type: "near_field" },
          turn_detection: { type: "semantic_vad", create_response: true, interrupt_response: true },
        },
        output: { voice: VOIX },
      },
      tools: OUTILS_VOIX,
      tool_choice: "auto",
    },
  };
}

export function routesVoix(d: DependancesVoix): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const appel = (url: string, init: RequestInit) => (d.fetchSortant ?? ((u, i) => ctx.http.fetch(u, i)))(url, init);
  const maintenant = d.maintenant ?? Date.now;
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  /** Résout la clé dans le coffre ; tout échec devient « non configurée », sans détail ni valeur. */
  async function cleOpenAi(companyId: string): Promise<string> {
    const manque = () =>
      erreur("voix_non_configuree", "La voix en direct n'est pas configurée : renseignez le secret de la clé OpenAI (réglage « openaiSecretRef ») dans la configuration du plugin.");
    let ref: unknown;
    try {
      ref = ((await ctx.config.get(companyId)) ?? ({} as Record<string, unknown>)) as Record<string, unknown>;
      ref = (ref as Record<string, unknown>).openaiSecretRef;
    } catch {
      manque();
    }
    if (!ref || typeof ref !== "object") manque();
    let valeur: unknown;
    try {
      valeur = await ctx.secrets.resolve(ref as never, { companyId, configPath: "openaiSecretRef" } as never);
    } catch {
      manque();
    }
    if (typeof valeur !== "string" || valeur.trim() === "") manque();
    return (valeur as string).trim();
  }

  routes["voix.session"] = async (r) => {
    exigerHumain(r.acteur, "La voix en direct");
    const c = (r.corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    const p = Entree.safeParse(r.corps ?? {});
    if (!p.success) erreurValidation("Voix en direct", p.error.issues);
    const cle = await cleOpenAi(r.companyId);

    let reponse: Response;
    try {
      reponse = await appel(URL_SECRETS_CLIENT, {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify(sessionVoix()),
        signal: AbortSignal.timeout(DELAI_APPEL_MS),
        redirect: "error",
      });
    } catch {
      erreur("voix_indisponible", "OpenAI ne répond pas : la voix en direct est momentanément indisponible.");
    }
    if (reponse.status === 401 || reponse.status === 403) erreur("voix_non_configuree", "OpenAI a refusé la clé configurée : vérifiez le secret « openaiSecretRef ».");
    if (!reponse.ok) erreur("voix_indisponible", `OpenAI a refusé de créer la session (HTTP ${reponse.status}).`);
    let secret: string;
    let expireLe: string;
    try {
      const corps = (await reponse.json()) as { value?: unknown; expires_at?: unknown };
      if (typeof corps.value !== "string" || corps.value === "") throw new Error("sans secret");
      secret = corps.value;
      expireLe = new Date(typeof corps.expires_at === "number" ? corps.expires_at * 1000 : maintenant() + DUREE_SECRET_SECONDES * 1000).toISOString();
    } catch {
      erreur("voix_indisponible", "Réponse illisible d'OpenAI.");
    }
    // Jamais la clé ni le secret éphémère : seulement le fait que la session a été créée.
    await base.journaliser({
      companyId: r.companyId, type: "voix.session", entite: "voix", entiteId: randomUUID(), acteur: r.acteur.id,
      donnees: { modele: MODELE_VOIX, voix: VOIX, dureeSecretSecondes: DUREE_SECRET_SECONDES },
    });
    return { corps: { clientSecret: secret, expireLe, modele: MODELE_VOIX } };
  };

  return routes;
}
