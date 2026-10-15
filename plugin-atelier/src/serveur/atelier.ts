/**
 * Assemblage du worker : enregistre les clés de données et d'actions de
 * l'interface et aiguille les routes API vers les services.
 */
import type { PluginApiRequestInput, PluginApiResponse, PluginContext } from "@paperclipai/plugin-sdk";
import { ACTIONS_UI, DONNEES_UI, PLUGIN_ID, ROUTES_API, type CleRouteApi } from "../contrats/index.js";
import { ErreurAtelier, erreur } from "./erreurs.js";
import { creerServices } from "./services.js";

/** Acteur authentifié par l'hôte, normalisé pour les services. */
export interface ActeurHote {
  type: "agent" | "humain" | "systeme";
  id: string;
  agentId: string | null;
  userId: string | null;
  runId: string | null;
}

export interface RequeteRoute {
  cle: CleRouteApi;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  corps: unknown;
  acteur: ActeurHote;
  companyId: string;
}

export type GestionnaireRoute = (requete: RequeteRoute) => Promise<{ statut?: number; corps: unknown }>;
export type GestionnaireDonnees = (params: Record<string, unknown>, companyId: string) => Promise<unknown>;
export type GestionnaireAction = (params: Record<string, unknown>, companyId: string, acteur: ActeurHote) => Promise<unknown>;

export interface Services {
  routes: Partial<Record<CleRouteApi, GestionnaireRoute>>;
  donnees: Partial<Record<keyof typeof DONNEES_UI, GestionnaireDonnees>>;
  actions: Partial<Record<keyof typeof ACTIONS_UI, GestionnaireAction>>;
}

export function acteurDepuisRequete(actor: PluginApiRequestInput["actor"]): ActeurHote {
  if (actor.actorType === "agent") {
    return { type: "agent", id: actor.agentId ?? actor.actorId, agentId: actor.agentId ?? actor.actorId, userId: null, runId: actor.runId ?? null };
  }
  return { type: "humain", id: actor.userId ?? actor.actorId, agentId: null, userId: actor.userId ?? actor.actorId, runId: actor.runId ?? null };
}

export function reponseErreur(err: unknown): PluginApiResponse {
  if (err instanceof ErreurAtelier) {
    return { status: err.statut, body: { erreur: err.message, code: err.code, ...(err.details === undefined ? {} : { details: err.details }) } };
  }
  return { status: 500, body: { erreur: "Erreur interne de l'atelier", code: "erreur_interne" } };
}

/**
 * Le pont de l'hôte ne transmet à l'interface que le MESSAGE d'une erreur du
 * worker (code générique WORKER_ERROR). Le code stable est donc placé en tête
 * du message : « [code] message » (besoin B-1 du lot C).
 */
export async function avecCode<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ErreurAtelier) throw new Error(`[${err.code}] ${err.message}`);
    throw err;
  }
}

export function creerAiguillage(ctx: PluginContext, services: Services) {
  async function traiterRequeteApi(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const route = ROUTES_API.find((r) => r.cle === input.routeKey);
    const gestionnaire = route ? services.routes[route.cle] : undefined;
    try {
      if (!route) erreur("introuvable", `Route inconnue : ${input.routeKey}`);
      if (!gestionnaire) erreur("non_implemente", `Route ${route.cle} non implémentée`);
      const resultat = await gestionnaire({
        cle: route.cle,
        params: input.params,
        query: input.query,
        corps: input.body,
        acteur: acteurDepuisRequete(input.actor),
        companyId: input.companyId,
      });
      return { status: resultat.statut ?? 200, body: resultat.corps };
    } catch (err) {
      if (!(err instanceof ErreurAtelier)) {
        ctx.logger.error("Erreur non gérée dans une route de l'atelier", {
          route: input.routeKey,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return reponseErreur(err);
    }
  }

  function enregistrer() {
    for (const cle of Object.keys(DONNEES_UI) as Array<keyof typeof DONNEES_UI>) {
      ctx.data.register(cle, (params) =>
        avecCode(async () => {
          const companyId = typeof params.companyId === "string" ? params.companyId : null;
          if (!companyId) erreur("acces_refuse", "Entreprise non autorisée par l'hôte");
          const gestionnaire = services.donnees[cle];
          if (!gestionnaire) erreur("non_implemente", `Données ${cle} non implémentées`);
          const { companyId: _ignore, renderEnvironment: _env, ...reste } = params;
          const analyse = DONNEES_UI[cle].params.safeParse(reste);
          if (!analyse.success) erreur("entree_invalide", `Paramètres invalides pour ${cle}`);
          return gestionnaire(analyse.data as Record<string, unknown>, companyId);
        }),
      );
    }
    for (const cle of Object.keys(ACTIONS_UI) as Array<keyof typeof ACTIONS_UI>) {
      ctx.actions.register(cle, (params, contexte) =>
        avecCode(async () => {
          const acteurHote = contexte.actor;
          const companyId = contexte.companyId;
          if (!companyId) erreur("acces_refuse", "Entreprise non autorisée par l'hôte");
          const acteur: ActeurHote =
            acteurHote.type === "agent"
              ? { type: "agent", id: acteurHote.agentId ?? "inconnu", agentId: acteurHote.agentId, userId: null, runId: acteurHote.runId }
              : acteurHote.type === "user"
                ? { type: "humain", id: acteurHote.userId ?? "inconnu", agentId: null, userId: acteurHote.userId, runId: acteurHote.runId }
                : { type: "systeme", id: "systeme", agentId: null, userId: null, runId: acteurHote.runId };
          if (ACTIONS_UI[cle].humainSeulement && acteur.type !== "humain") {
            erreur("elevation_refusee", `L'action ${cle} est réservée à un humain`);
          }
          const gestionnaire = services.actions[cle];
          if (!gestionnaire) erreur("non_implemente", `Action ${cle} non implémentée`);
          // L'hôte ajoute `companyId` et parfois `renderEnvironment` aux paramètres : ils ne
          // font pas partie de l'entrée (les schémas stricts, comme la relance, les refuseraient).
          const { companyId: _ignore, renderEnvironment: _env, ...reste } = params;
          const analyse = ACTIONS_UI[cle].params.safeParse(reste);
          if (!analyse.success) {
            const champs = analyse.error.issues.slice(0, 5).map((i) => `${i.path.map(String).join(".") || "entrée"} : ${i.message}`).join(" ; ");
            erreur("entree_invalide", `Paramètres invalides pour ${cle} (${champs})`);
          }
          return gestionnaire(analyse.data as Record<string, unknown>, companyId, acteur);
        }),
      );
    }
  }

  return { traiterRequeteApi, enregistrer };
}

/** Fabrique principale : branche les services réels (`services.ts`). */
export function creerAtelier(ctx: PluginContext, services?: Services) {
  ctx.logger.info("Initialisation de l'atelier", { plugin: PLUGIN_ID });
  return creerAiguillage(ctx, services ?? creerServices(ctx));
}
