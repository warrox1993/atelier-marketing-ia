/**
 * Connexions NATIVES de Paperclip (« Apps ») lues depuis l'interface, lot L8
 * (docs/connecteurs-conception.md §2.4).
 *
 * ATTENTION : ces routes ne font PAS partie du contrat du SDK de plugin. Tout
 * ce qui en dépend est isolé dans ce module, validé par Zod, et dégrade en
 * erreur explicite (« indisponible ») si la forme change. Aucune autre partie
 * de l'interface n'appelle `/tools/connections`.
 *
 * Routes lues (même origine, session de l'utilisateur, lecture seule) :
 * - `GET /api/companies/:id/tools/connections` -> `{ connections: [...] }`
 *   (`paperclip/server/src/routes/tool-access.ts`, filtrée selon les droits) ;
 * - `GET /api/companies/:id/agents` -> agents natifs (adaptateur, outils, jeton).
 *
 * Sécurité : seuls les champs utiles sont conservés. Les identifiants de
 * secret, jetons et `config.oauth` renvoyés par l'hôte sont ignorés dès
 * l'analyse. La valeur d'un jeton n'est jamais lue : on ne sait que « présent ».
 */
import { z } from "zod";
import type { EtatConnexion } from "../contrats/communs.js";
import { appelHote, type ErreurHote } from "./hote.js";

/* ------------------------------------------------------------------ */
/* Services marketing de la passerelle                                  */
/* ------------------------------------------------------------------ */

/**
 * `slug` : carte de galerie NATIVE du service (patch socle 0004, `atelier-<service>` ;
 * HubSpot = `atelier-hubspot`, servie par `/mcp/crm`).
 */
export const SERVICES_PASSERELLE = [
  { cle: "gsc", slug: "atelier-google-search-console", nom: "Google Search Console", capacites: "lecture" },
  { cle: "ga4", slug: "atelier-google-analytics", nom: "Google Analytics 4", capacites: "lecture" },
  { cle: "ads", slug: "atelier-google-ads", nom: "Google Ads", capacites: "lecture" },
  { cle: "gbp", slug: "atelier-google-business-profile", nom: "Fiche d'établissement Google", capacites: "lecture" },
  { cle: "facebook", slug: "atelier-facebook", nom: "Facebook", capacites: "lecture, préparation d'action" },
  { cle: "instagram", slug: "atelier-instagram", nom: "Instagram", capacites: "lecture, préparation d'action" },
  { cle: "linkedin", slug: "atelier-linkedin", nom: "LinkedIn", capacites: "lecture, préparation d'action" },
  { cle: "crm", slug: "atelier-hubspot", nom: "CRM (HubSpot)", capacites: "lecture, préparation d'action" },
  { cle: "pipedrive", slug: "atelier-pipedrive", nom: "Pipedrive", capacites: "lecture, préparation d'action" },
  { cle: "odoo", slug: "atelier-odoo", nom: "Odoo", capacites: "lecture, préparation d'action" },
  { cle: "teamleader", slug: "atelier-teamleader", nom: "Teamleader", capacites: "lecture, préparation d'action" },
] as const;
export type CleService = (typeof SERVICES_PASSERELLE)[number]["cle"];

/** Portée d'autorisation émise par le serveur d'autorisation de DÉMONSTRATION de la passerelle. */
const PORTEE_DEMONSTRATION = "demonstration";
/** Suffixe que le socle (patch 0004) donne aux connexions créées par une carte en démonstration. */
const SUFFIXE_DEMONSTRATION = /\(démonstration\)\s*$/u;
const HOTES_BOUCLE = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/* ------------------------------------------------------------------ */
/* Formes natives (sous-ensemble toléré)                                */
/* ------------------------------------------------------------------ */

const SANTES = ["ok", "unchecked", "degraded", "failed", "error", "missing_secret"] as const;
export type SanteNative = (typeof SANTES)[number];

const SchemaConnexion = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.enum(["draft", "active", "disabled", "archived"]).optional(),
  enabled: z.boolean().optional(),
  transport: z.string().optional(),
  healthStatus: z.string().nullish(),
  healthMessage: z.string().nullish(),
  healthCheckedAt: z.string().nullish(),
  lastHealthAt: z.string().nullish(),
  lastUsedAt: z.string().nullish(),
  config: z
    .object({
      url: z.string().optional(),
      sourceTemplateKey: z.string().nullish(),
      oauth: z.object({ scope: z.string().optional(), scopes: z.array(z.string()).optional() }).passthrough().optional(),
    })
    .passthrough()
    .optional(),
  transportConfig: z.object({ url: z.string().optional() }).passthrough().optional(),
});
const SchemaListe = z.object({ connections: z.array(z.unknown()) });

/** Connexion native réduite à ce que l'atelier affiche (rien de secret). */
export interface ConnexionNative {
  id: string;
  nom: string;
  statut: "draft" | "active" | "disabled" | "archived";
  activee: boolean;
  sante: SanteNative | "inconnue";
  messageSante: string | null;
  verifieLe: string | null;
  dernierUsage: string | null;
  /** Service de la passerelle reconnu (carte `atelier-*` ou URL de boucle locale `/mcp/<service>`), sinon `null`. */
  service: CleService | null;
  /** Créée par la carte de galerie native du service (et non par « Connect your own MCP server »). */
  carte: boolean;
  /** Mode de la passerelle (voir `modeDepuisConnexion`), `null` si service inconnu. */
  mode: "demonstration" | "reel" | null;
}

export function serviceDepuisUrl(url: string | undefined): CleService | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!HOTES_BOUCLE.has(u.hostname)) return null;
  const m = /^\/mcp\/([a-z0-9_-]+)\/?$/u.exec(u.pathname);
  const cle = m?.[1];
  return SERVICES_PASSERELLE.find((s) => s.cle === cle)?.cle ?? null;
}

/**
 * Mode de la passerelle. Le serveur d'autorisation de démonstration émet la
 * portée « demonstration » ; un fournisseur réel émet d'autres portées. C'est
 * un signal de lecture seule : `atelier_identite` (appel d'outil) confirmerait
 * le mode, mais l'interface n'appelle jamais d'outil.
 */
export function modeDepuisAutorisation(portees: string[]): "demonstration" | "reel" {
  return portees.includes(PORTEE_DEMONSTRATION) ? "demonstration" : "reel";
}

/** Service d'une carte de galerie de la passerelle (`atelier-hubspot` → `crm`), sinon `null`. */
export function serviceDepuisCarte(slug: string | null | undefined): CleService | null {
  return SERVICES_PASSERELLE.find((s) => s.slug === slug)?.cle ?? null;
}

/**
 * Mode d'une connexion de la passerelle. Une carte en démonstration ne demande AUCUNE portée
 * (patch 0004) : la connexion porte alors le nom « … (démonstration) ». Une connexion
 * générique de démonstration porte la portée « demonstration ». Sinon : réel.
 */
export function modeDepuisConnexion(nom: string, portees: string[]): "demonstration" | "reel" {
  return SUFFIXE_DEMONSTRATION.test(nom) ? "demonstration" : modeDepuisAutorisation(portees);
}

export function analyserConnexion(brut: unknown): ConnexionNative | null {
  const p = SchemaConnexion.safeParse(brut);
  if (!p.success) return null;
  const c = p.data;
  const carte = serviceDepuisCarte(c.config?.sourceTemplateKey);
  const service = carte ?? serviceDepuisUrl(c.config?.url ?? c.transportConfig?.url);
  const portees = [...(c.config?.oauth?.scopes ?? []), ...(c.config?.oauth?.scope ? [c.config.oauth.scope] : [])];
  const sante = (SANTES as readonly string[]).includes(c.healthStatus ?? "") ? (c.healthStatus as SanteNative) : "inconnue";
  return {
    id: c.id,
    nom: c.name,
    statut: c.status ?? "draft",
    activee: c.enabled ?? false,
    sante,
    messageSante: c.healthMessage ?? null,
    verifieLe: c.healthCheckedAt ?? c.lastHealthAt ?? null,
    dernierUsage: c.lastUsedAt ?? null,
    service,
    carte: carte !== null,
    mode: service ? modeDepuisConnexion(c.name, portees) : null,
  };
}

function erreurForme(detail: string): ErreurHote {
  return { code: "FORME_INCONNUE", message: `Fonction non disponible : la forme de la réponse native a changé (${detail}).` };
}

/** Normalise une erreur HTTP de l'hôte pour que l'interface la classe correctement (accès refusé, etc.). */
function normaliser(err: unknown): never {
  const e = (err ?? {}) as Partial<ErreurHote>;
  if (e.code === "HTTP_401" || e.code === "HTTP_403") throw { code: e.code, message: "Accès refusé : les connexions de l'entreprise ne sont pas lisibles avec cette session." } satisfies ErreurHote;
  throw err;
}

export async function lireConnexionsNatives(companyId: string): Promise<ConnexionNative[]> {
  let brut: unknown;
  try {
    brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(companyId)}/tools/connections`);
  } catch (err) {
    return normaliser(err);
  }
  const liste = SchemaListe.safeParse(brut);
  if (!liste.success) throw erreurForme("liste « connections » absente");
  // Une connexion illisible est écartée, pas fatale ; si TOUTES le sont, la forme a changé.
  const lues = liste.data.connections.map(analyserConnexion);
  if (liste.data.connections.length > 0 && lues.every((x) => x === null)) throw erreurForme("connexions illisibles");
  return lues.filter((x): x is ConnexionNative => x !== null);
}

/* ------------------------------------------------------------------ */
/* Agents natifs : adaptateur Claude Code, jeton, recherche Web         */
/* ------------------------------------------------------------------ */

const SchemaAgent = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  adapterType: z.string().optional(),
  adapterConfig: z.object({ extraArgs: z.array(z.unknown()).optional(), env: z.record(z.string(), z.unknown()).optional() }).passthrough().nullish(),
});

export interface AgentClaude {
  id: string;
  nom: string;
  /** Un jeton d'accès (`CLAUDE_CODE_OAUTH_TOKEN` ou `ANTHROPIC_API_KEY`) est déclaré. Sa valeur n'est jamais lue. */
  jetonPresent: boolean;
  /** `WebSearch` autorisé et non interdit dans les arguments de l'adaptateur. */
  rechercheWeb: boolean;
}

const VARIABLES_JETON = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

function valeurDeclaree(v: unknown): boolean {
  if (typeof v === "string") return v.length > 0;
  if (v && typeof v === "object") {
    const o = v as { type?: unknown; secretId?: unknown; value?: unknown };
    if (o.type === "secret_ref") return typeof o.secretId === "string" && o.secretId.length > 0;
    return typeof o.value === "string" && o.value.length > 0;
  }
  return false;
}

/** Arguments suivant `drapeau` jusqu'au prochain argument commençant par `--`. */
function valeursApres(args: string[], drapeau: string): string[] {
  const i = args.indexOf(drapeau);
  if (i < 0) return [];
  const sortie: string[] = [];
  for (const a of args.slice(i + 1)) {
    if (a.startsWith("--")) break;
    sortie.push(a);
  }
  return sortie;
}

export function analyserAgentClaude(brut: unknown): AgentClaude | null {
  const p = SchemaAgent.safeParse(brut);
  if (!p.success || p.data.adapterType !== "claude_local" || p.data.status === "terminated") return null;
  const cfg = p.data.adapterConfig ?? {};
  const args = (cfg.extraArgs ?? []).filter((x): x is string => typeof x === "string");
  const permis = valeursApres(args, "--allowedTools").some((o) => o === "WebSearch");
  const interdit = valeursApres(args, "--disallowedTools").some((o) => o === "WebSearch");
  return {
    id: p.data.id,
    nom: p.data.name,
    jetonPresent: VARIABLES_JETON.some((v) => valeurDeclaree(cfg.env?.[v])),
    rechercheWeb: permis && !interdit,
  };
}

export async function lireAgentsClaude(companyId: string): Promise<AgentClaude[]> {
  let brut: unknown;
  try {
    brut = await appelHote<unknown>("GET", `/companies/${encodeURIComponent(companyId)}/agents`);
  } catch (err) {
    return normaliser(err);
  }
  const liste = Array.isArray(brut) ? brut : ((brut as { items?: unknown } | null)?.items ?? null);
  if (!Array.isArray(liste)) throw erreurForme("liste d'agents absente");
  return liste.map(analyserAgentClaude).filter((a): a is AgentClaude => a !== null);
}

/* ------------------------------------------------------------------ */
/* Correspondance avec les six états du cahier (§3, conception §2.4)    */
/* ------------------------------------------------------------------ */

export const LIBELLES_SANTE: Record<SanteNative | "inconnue", string> = {
  ok: "Bonne",
  unchecked: "Non vérifiée",
  degraded: "Dégradée",
  failed: "En échec",
  error: "En erreur",
  missing_secret: "Secret manquant",
  inconnue: "Inconnue",
};

export interface LigneService {
  cle: CleService;
  /** Carte de galerie native du service. */
  slug: string;
  nom: string;
  capacites: string;
  etat: EtatConnexion;
  mode: "demonstration" | "reel" | null;
  sante: SanteNative | "inconnue" | null;
  verifieLe: string | null;
  detail: string;
  /** Une connexion native existe (terminée ou non) : le bouton propose alors de la gérer. */
  connexionId: string | null;
}

/** Une connexion termine mieux qu'une autre : active et saine d'abord, puis la plus récemment vérifiée. */
function rang(c: ConnexionNative): number {
  return (c.statut === "active" ? 4 : c.statut === "draft" ? 2 : 1) + (c.sante === "ok" ? 1 : 0);
}

export function etatDepuisConnexion(c: ConnexionNative): { etat: EtatConnexion; detail: string } {
  if (c.statut === "draft") return { etat: "non_connecte", detail: "Connexion commencée, autorisation non terminée : reprenez-la avec « Connecter »." };
  if (c.statut === "disabled" || c.statut === "archived" || !c.activee) {
    return { etat: "indisponible", detail: c.statut === "archived" ? "Connexion archivée dans Paperclip." : "Connexion désactivée dans Paperclip." };
  }
  if (c.sante === "failed" || c.sante === "error" || c.sante === "missing_secret") {
    return { etat: "erreur", detail: c.messageSante ? `Dernière vérification en échec : ${c.messageSante}` : "Dernière vérification en échec." };
  }
  if (c.mode === "demonstration") return { etat: "non_connecte", detail: "Aucun accès réel au service : terminez l'autorisation avec « Connecter » pour le brancher." };
  if (c.sante === "ok" && c.dernierUsage) return { etat: "reel_teste", detail: "Passerelle réelle : au moins un appel d'outil enregistré par Paperclip (l'issue de cet appel n'est pas relue ici)." };
  return { etat: "configure_non_verifie", detail: "Passerelle réelle connectée ; aucun appel d'outil enregistré à ce jour." };
}

/** Une ligne par service marketing, toujours dans le même ordre, quel que soit le contenu de l'hôte. */
export function lignesServices(connexions: ConnexionNative[]): LigneService[] {
  return SERVICES_PASSERELLE.map((s) => {
    const candidates = connexions.filter((c) => c.service === s.cle).sort((a, b) => rang(b) - rang(a) || (b.verifieLe ?? "").localeCompare(a.verifieLe ?? ""));
    const c = candidates[0];
    if (!c) {
      return { ...s, etat: "non_connecte" as const, mode: null, sante: null, verifieLe: null, detail: "Aucune connexion native pour ce service.", connexionId: null };
    }
    const { etat, detail } = etatDepuisConnexion(c);
    // Brouillon : l'autorisation n'a pas abouti, mode et santé n'ont pas de sens à afficher.
    if (c.statut === "draft") return { ...s, etat, mode: null, sante: null, verifieLe: null, detail, connexionId: c.id };
    return { ...s, etat, mode: c.mode, sante: c.sante, verifieLe: c.verifieLe, detail, connexionId: c.id };
  });
}

export interface LigneAgentNatif {
  etat: EtatConnexion;
  detail: string;
}

/** Adaptateur Claude Code : configuré ou non, jeton présent ou non. Jamais « testé » sans run réel (vue Équipe). */
export function etatClaude(agents: AgentClaude[]): LigneAgentNatif {
  if (agents.length === 0) return { etat: "non_connecte", detail: "Aucun agent claude_local configuré." };
  const sans = agents.filter((a) => !a.jetonPresent);
  if (sans.length === agents.length) return { etat: "non_connecte", detail: `${agents.length} agent(s) claude_local, aucun jeton déclaré : aucun passage réel possible.` };
  if (sans.length > 0) return { etat: "configure_non_verifie", detail: `Jeton présent pour ${agents.length - sans.length} agent(s) sur ${agents.length} ; absent pour : ${sans.map((a) => a.nom).join(", ")}. Aucun passage réel vérifié ici.` };
  return { etat: "configure_non_verifie", detail: `${agents.length} agent(s) claude_local avec jeton présent (valeur jamais affichée). Aucun passage réel vérifié ici.` };
}

/** Recherche Web : outil natif des agents claude_local en mode réel, jamais prouvé sans run réel. */
export function etatRechercheWeb(agents: AgentClaude[]): LigneAgentNatif {
  const autorises = agents.filter((a) => a.rechercheWeb);
  if (autorises.length === 0) return { etat: "non_connecte", detail: "Aucun agent claude_local n'est autorisé à utiliser WebSearch." };
  return {
    etat: "configure_non_verifie",
    detail: `Disponible en mode réel (outil natif de l'agent), non vérifié : ${autorises.map((a) => a.nom).join(", ")}.`,
  };
}
