/**
 * Dictée vocale locale (humain seulement) pour le futur chat de l'atelier.
 *
 * - `dictee.transcrire` : reçoit un enregistrement du navigateur (base64), l'envoie en multipart au
 *   serveur whisper.cpp local (`POST /inference`) et renvoie `{texte, dureeMs}`.
 * - `dictee.etat` : `{disponible}`, selon que le serveur local répond.
 *
 * Garanties : l'audio et le texte ne sont jamais stockés ni journalisés (le journal ne garde que la durée et la
 * taille) ; l'adresse du serveur (configuration d'instance `dicteeUrl`, défaut http://127.0.0.1:8178) est
 * toujours en boucle locale sur le port 8178 ; un agent reçoit 403.
 */
import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { IdNatif, type CleRouteApi } from "../contrats/index.js";
import type { ActeurHote, GestionnaireRoute } from "./atelier.js";
import type { BaseAtelier } from "./base.js";
import { erreur, erreurValidation } from "./erreurs.js";

export const ADRESSE_DICTEE_DEFAUT = "http://127.0.0.1:8178";
/**
 * Taille maximale de l'audio une fois décodé. L'hôte limite le corps d'une requête de plugin à 1 000 000 d'octets,
 * base64 compris (paperclip/server/src/routes/plugins.ts:173) : 700 000 octets décodés font 933 336 caractères base64.
 */
export const TAILLE_MAX_AUDIO = 700_000;
/** Seul port accepté pour le serveur de dictée local. */
export const PORT_DICTEE = "8178";
/** Délai de la transcription. */
export const DELAI_TRANSCRIPTION_MS = 60_000;
const DELAI_ETAT_MS = 3_000;

/** Types acceptés (liste blanche) et extension donnée au fichier envoyé à whisper (ffmpeg s'en sert pour deviner). */
const EXTENSION_PAR_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "mp4",
};

const Entree = z.object({ companyId: IdNatif, audioBase64: z.string().min(1), type: z.string().min(1).max(100) }).strict();

const exigerHumain = (acteur: ActeurHote, quoi: string) => {
  if (acteur.type !== "humain") erreur("elevation_refusee", `${quoi} est réservé à un humain.`);
};

export interface DependancesDictee {
  ctx: PluginContext;
  base: BaseAtelier;
  /** Tests : remplace le fetch de Node (le serveur whisper est sur la boucle locale, que `ctx.http` refuserait). */
  fetchLocal?: (url: string, init: RequestInit) => Promise<Response>;
}

/** Base d'adresse du serveur : boucle locale ET port 8178 seulement, sinon l'adresse par défaut. */
export function adresseDictee(brute: unknown): URL {
  if (typeof brute === "string" && brute.trim() !== "") {
    try {
      const u = new URL(brute.trim());
      if ((u.protocol === "http:" || u.protocol === "https:") && ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname) && u.port === PORT_DICTEE) return u;
    } catch {
      /* adresse illisible : défaut */
    }
  }
  return new URL(ADRESSE_DICTEE_DEFAUT);
}

/** Type sans paramètres (« audio/webm;codecs=opus » du navigateur devient « audio/webm »), en minuscules. */
const typeSansParametres = (type: string) => type.split(";")[0]!.trim().toLowerCase();

export function routesDictee(d: DependancesDictee): Partial<Record<CleRouteApi, GestionnaireRoute>> {
  const { ctx, base } = d;
  const appel = (url: string, init: RequestInit) => (d.fetchLocal ?? globalThis.fetch)(url, init);
  const routes: Partial<Record<CleRouteApi, GestionnaireRoute>> = {};

  async function adresse(companyId: string): Promise<URL> {
    try {
      const config = ((await ctx.config.get(companyId)) ?? {}) as Record<string, unknown>;
      return adresseDictee(config.dicteeUrl);
    } catch {
      return adresseDictee(undefined);
    }
  }

  routes["dictee.etat"] = async (r) => {
    exigerHumain(r.acteur, "La dictée vocale");
    try {
      const rep = await appel(new URL("/", await adresse(r.companyId)).toString(), { signal: AbortSignal.timeout(DELAI_ETAT_MS), redirect: "error" });
      return { corps: { disponible: rep.ok } };
    } catch {
      return { corps: { disponible: false } };
    }
  };

  routes["dictee.transcrire"] = async (r) => {
    exigerHumain(r.acteur, "La dictée vocale");
    const c = (r.corps as { companyId?: unknown } | null)?.companyId;
    if (typeof c === "string" && c.toLowerCase() !== r.companyId.toLowerCase()) erreur("hors_entreprise", "Le corps désigne une autre entreprise que celle de la route.");
    const p = Entree.safeParse(r.corps);
    if (!p.success) erreurValidation("Dictée", p.error.issues);
    const type = typeSansParametres(p.data.type);
    const extension = EXTENSION_PAR_TYPE[type];
    if (!extension) erreur("entree_invalide", `Type audio refusé (acceptés : ${Object.keys(EXTENSION_PAR_TYPE).join(", ")}).`);
    // Contrôle de taille avant de décoder : 700 000 octets décodés valent au plus 933 336 caractères en base64.
    const b64 = p.data.audioBase64;
    if (b64.length > Math.ceil((TAILLE_MAX_AUDIO * 4) / 3) + 4) erreur("entree_invalide", "Enregistrement trop volumineux (700 Ko au plus).");
    if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) erreur("entree_invalide", "Audio illisible (base64 invalide).");
    const audio = Buffer.from(b64, "base64");
    if (audio.length === 0) erreur("entree_invalide", "Enregistrement vide.");
    if (audio.length > TAILLE_MAX_AUDIO) erreur("entree_invalide", "Enregistrement trop volumineux (700 Ko au plus).");

    const formulaire = new FormData();
    formulaire.append("file", new Blob([new Uint8Array(audio)], { type }), `dictee.${extension}`);
    formulaire.append("response_format", "json");
    formulaire.append("temperature", "0.0");
    const debut = Date.now();
    let reponse: Response;
    try {
      reponse = await appel(new URL("/inference", await adresse(r.companyId)).toString(), {
        method: "POST", body: formulaire, signal: AbortSignal.timeout(DELAI_TRANSCRIPTION_MS), redirect: "error",
      });
    } catch {
      erreur("dictee_indisponible", "Le serveur de dictée vocale local ne répond pas.");
    }
    if (reponse.status >= 500) erreur("dictee_indisponible", "Le serveur de dictée vocale local a échoué.");
    if (!reponse.ok) erreur("entree_invalide", "Audio non lisible par le serveur de dictée.");
    let texte: string;
    try {
      const corps = (await reponse.json()) as { text?: unknown };
      if (typeof corps.text !== "string") throw new Error("réponse sans texte");
      texte = corps.text.trim();
    } catch {
      erreur("dictee_indisponible", "Réponse illisible du serveur de dictée vocale local.");
    }
    const dureeMs = Date.now() - debut;
    // Jamais le texte ni l'audio : seulement la durée et la taille.
    await base.journaliser({
      companyId: r.companyId, type: "dictee.transcrire", entite: "dictee", entiteId: randomUUID(), acteur: r.acteur.id,
      donnees: { dureeMs, tailleOctets: audio.length },
    });
    return { corps: { texte, dureeMs } };
  };

  return routes;
}
