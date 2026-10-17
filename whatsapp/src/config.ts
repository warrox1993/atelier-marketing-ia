/**
 * Configuration de la passerelle WhatsApp, lue dans l'environnement (fichier ~/.config/atelier/whatsapp.env, 0600,
 * hors dépôt, chargé par l'unité systemd). Toute valeur douteuse fait refuser le démarrage : mieux vaut une passerelle
 * arrêtée qu'une passerelle qui accepte n'importe qui ou qui parle à une instance distante.
 */
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  /** Jeton d'accès de l'API Graph (utilisateur système Meta). */
  jetonAcces: string;
  /** Secret de l'application Meta : clé HMAC de X-Hub-Signature-256. */
  secretApplication: string;
  /** Jeton de vérification choisi par l'opérateur pour la poignée de main `hub.verify_token`. */
  jetonVerification: string;
  /** Identifiant du numéro WhatsApp Business (phone_number_id), émetteur des messages. */
  idNumero: string;
  /** Liste blanche des expéditeurs (chiffres seuls, format international sans « + »). */
  numerosAutorises: string[];
  hote: "127.0.0.1" | "::1";
  port: number;
  /** Base de l'API Graph, sans version (https, ou boucle locale pour les tests). */
  graphUrl: string;
  graphVersion: string;
  /** API de l'instance Paperclip (boucle locale obligatoire : l'instance n'est jamais publiée). */
  atelierApi: string;
  pluginId: string;
  /** Entreprise Direction du client (coordinateur général) ; les autres services sont lus par `departements.lister`. */
  entreprise: string;
  /** Clé « board » facultative, si l'instance n'est plus en mode local_trusted. */
  cleBoard: string | null;
  /** Modèle utilitaire préapprouvé pour les alertes hors fenêtre de 24 h. */
  modeleNom: string | null;
  modeleLangue: string;
  /**
   * Envoi du modèle hors fenêtre : FACTURÉ par Meta à l'unité (modèle utilitaire hors fenêtre de service client).
   * Désactivé par défaut (règle « gratuit uniquement ») : les alertes attendent alors le prochain message de l'opérateur.
   */
  modeleHorsFenetre: boolean;
  /**
   * Envoi à Meta du contenu des liaisons et livrables d'un service sensible (juridique, RH, fiscalité…) : refusé par
   * défaut (l'API Cloud est hébergée par Meta) ; « oui » = décision du client, voir docs/whatsapp.md.
   */
  contenuSensible: boolean;
  fichierEtat: string;
  fichierJournal: string;
  intervalleAlertesMs: number;
  intervalleDiscussionMs: number;
  /** Messages entrants acceptés par minute et par expéditeur autorisé. */
  debitParMinute: number;
}

export class ErreurConfig extends Error {}

const exiger = (env: NodeJS.ProcessEnv, cle: string): string => {
  const v = env[cle]?.trim();
  if (!v) throw new ErreurConfig(`Variable obligatoire absente : ${cle}.`);
  return v;
};

const entier = (env: NodeJS.ProcessEnv, cle: string, defaut: number, min: number, max: number): number => {
  const brut = env[cle]?.trim();
  if (!brut) return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErreurConfig(`${cle} doit être un entier entre ${min} et ${max}.`);
  return n;
};

const estBoucleLocale = (u: URL) => u.hostname === "127.0.0.1" || u.hostname === "[::1]" || u.hostname === "localhost";

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const numeros = exiger(env, "WHATSAPP_NUMEROS_AUTORISES")
    .split(",")
    .map((n) => n.trim().replace(/^\+/, ""))
    .filter(Boolean);
  if (numeros.length === 0 || numeros.some((n) => !/^\d{8,15}$/.test(n))) {
    throw new ErreurConfig("WHATSAPP_NUMEROS_AUTORISES : numéros au format international, chiffres seuls (ex. 32470123456).");
  }
  const hote = (env["WHATSAPP_HOTE"]?.trim() || "127.0.0.1") as Config["hote"];
  if (hote !== "127.0.0.1" && hote !== "::1") throw new ErreurConfig("WHATSAPP_HOTE : seule la boucle locale est permise (127.0.0.1 ou ::1).");

  const atelierApi = (env["ATELIER_API"]?.trim() || "http://127.0.0.1:3100/api").replace(/\/+$/, "");
  let ua: URL;
  try {
    ua = new URL(atelierApi);
  } catch {
    throw new ErreurConfig("ATELIER_API invalide.");
  }
  if (!estBoucleLocale(ua) || ua.protocol !== "http:") throw new ErreurConfig("ATELIER_API doit viser l'instance sur la boucle locale (http://127.0.0.1:<port>/api).");

  const graphUrl = (env["WHATSAPP_GRAPH_URL"]?.trim() || "https://graph.facebook.com").replace(/\/+$/, "");
  let ug: URL;
  try {
    ug = new URL(graphUrl);
  } catch {
    throw new ErreurConfig("WHATSAPP_GRAPH_URL invalide.");
  }
  if (ug.protocol !== "https:" && !estBoucleLocale(ug)) throw new ErreurConfig("WHATSAPP_GRAPH_URL doit être en https (boucle locale admise pour les essais).");

  const graphVersion = env["WHATSAPP_GRAPH_VERSION"]?.trim() || "v26.0";
  if (!/^v\d{2}\.\d$/.test(graphVersion)) throw new ErreurConfig("WHATSAPP_GRAPH_VERSION au format vNN.N (ex. v26.0).");

  const entreprise = exiger(env, "ATELIER_ENTREPRISE");
  if (!/^[0-9a-f-]{36}$/i.test(entreprise)) throw new ErreurConfig("ATELIER_ENTREPRISE : identifiant (UUID) de l'entreprise Direction.");

  const horsFenetre = (env["WHATSAPP_MODELE_HORS_FENETRE"]?.trim() || "non").toLowerCase();
  if (horsFenetre !== "oui" && horsFenetre !== "non") throw new ErreurConfig("WHATSAPP_MODELE_HORS_FENETRE : oui ou non.");
  const modeleNom = env["WHATSAPP_MODELE_NOM"]?.trim() || null;
  if (modeleNom && !/^[a-z0-9_]{1,512}$/.test(modeleNom)) throw new ErreurConfig("WHATSAPP_MODELE_NOM : minuscules, chiffres et _ seulement.");
  if (horsFenetre === "oui" && !modeleNom) throw new ErreurConfig("WHATSAPP_MODELE_HORS_FENETRE=oui exige WHATSAPP_MODELE_NOM.");

  const sensible = (env["WHATSAPP_CONTENU_SENSIBLE"]?.trim() || "non").toLowerCase();
  if (sensible !== "oui" && sensible !== "non") throw new ErreurConfig("WHATSAPP_CONTENU_SENSIBLE : oui ou non.");

  const dossierEtat = join(env["XDG_STATE_HOME"]?.trim() || join(homedir(), ".local", "state"), "atelier", "whatsapp");
  return {
    jetonAcces: exiger(env, "WHATSAPP_JETON_ACCES"),
    secretApplication: exiger(env, "WHATSAPP_SECRET_APPLICATION"),
    jetonVerification: exiger(env, "WHATSAPP_JETON_VERIFICATION"),
    idNumero: (() => {
      const v = exiger(env, "WHATSAPP_ID_NUMERO");
      if (!/^\d{5,30}$/.test(v)) throw new ErreurConfig("WHATSAPP_ID_NUMERO : identifiant numérique du numéro (phone_number_id).");
      return v;
    })(),
    numerosAutorises: numeros,
    hote,
    port: entier(env, "WHATSAPP_PORT", 3195, 1024, 65535),
    graphUrl,
    graphVersion,
    atelierApi,
    pluginId: env["ATELIER_PLUGIN"]?.trim() || "atelier.marketing-ia",
    entreprise,
    cleBoard: env["ATELIER_CLE_BOARD"]?.trim() || null,
    modeleNom,
    modeleLangue: env["WHATSAPP_MODELE_LANGUE"]?.trim() || "fr",
    modeleHorsFenetre: horsFenetre === "oui",
    contenuSensible: sensible === "oui",
    fichierEtat: env["WHATSAPP_ETAT"]?.trim() || join(dossierEtat, "etat.json"),
    fichierJournal: env["WHATSAPP_JOURNAL"]?.trim() || join(dossierEtat, "decisions.jsonl"),
    intervalleAlertesMs: entier(env, "WHATSAPP_INTERVALLE_ALERTES_S", 60, 10, 3600) * 1000,
    intervalleDiscussionMs: entier(env, "WHATSAPP_INTERVALLE_DISCUSSION_S", 10, 2, 600) * 1000,
    debitParMinute: entier(env, "WHATSAPP_DEBIT_PAR_MINUTE", 20, 1, 120),
  };
}

/** Refuse un fichier de secrets lisible par le groupe ou les autres (0600 attendu). */
export function verifierDroitsFichier(chemin: string): void {
  let mode: number;
  try {
    mode = statSync(chemin).mode;
  } catch {
    throw new ErreurConfig(`Fichier de configuration introuvable : ${chemin}.`);
  }
  if ((mode & 0o077) !== 0) throw new ErreurConfig(`${chemin} est lisible par d'autres comptes : chmod 600 ${chemin}.`);
}
