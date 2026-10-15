// Gardes communes des serveurs d'autorisation de la passerelle (démonstration, Google réel, réseaux sociaux
// et CRM réels). Revue de sécurité du 15/10/2026 (docs/revue-securite-passerelle.md, constats S2 et S3).
//
//   - Origine : une requête qui porte l'en-tête Origin d'un autre site est refusée. Un navigateur envoie
//     Origin sur tout POST ; une page piégée ne peut donc plus enregistrer de clients ni appeler /oauth/token
//     depuis le navigateur de l'opérateur. « null » reste permis : nos propres formulaires l'envoient (politique de
//     référent no-referrer) et ils sont protégés par leur identifiant de transaction secret.
//   - Enregistrement dynamique (RFC 7591) : corps `application/json` exigé. Ce type n'est pas « simple » au
//     sens de CORS : un site tiers ne peut l'envoyer qu'après une requête préalable OPTIONS, que la
//     passerelle ne satisfait jamais.
//   - Adresses de redirection des serveurs RÉELS : boucle locale seulement, plus les origines HTTPS déclarées
//     par l'opérateur (PASSERELLE_REDIRECTIONS_PERMISES). Sans cela, n'importe qui pouvait enregistrer un
//     client qui renvoie le code vers son propre site : la passerelle réelle ne montre aucun écran de
//     consentement à elle, l'utilisateur ne voit que l'écran (légitime) de Google ou de Meta, et le code
//     de la passerelle partait vers l'attaquant (« confused deputy » des relais OAuth).
//   - Débit : un plafond d'enregistrements par minute, et la table des clients n'évince jamais un client
//     qui a une connexion vivante (jetons non expirés ou parcours en cours).

import type { IncomingMessage } from "node:http";
import * as z from "zod";
import { schemaEnregistrementClient, uriRedirectionAcceptable } from "./oauth-demo.js";

const HOTES_BOUCLE = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Erreur de garde : statut HTTP, code OAuth et message (sans aucune valeur secrète). */
export class RefusGarde extends Error {
  constructor(
    readonly statut: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Vrai si l'URL désigne la boucle locale (127.0.0.1, localhost, [::1]). */
export function estBoucleLocale(url: URL): boolean {
  return HOTES_BOUCLE.has(url.hostname);
}

/**
 * Lit PASSERELLE_REDIRECTIONS_PERMISES : origines HTTPS (schéma, hôte, port) séparées par des virgules ou des
 * espaces, par exemple « https://atelier.exemple.be ». Lève une erreur claire sur une valeur invalide.
 */
export function lireRedirectionsPermises(env: NodeJS.ProcessEnv): string[] {
  const brut = env["PASSERELLE_REDIRECTIONS_PERMISES"]?.trim() ?? "";
  if (brut === "") return [];
  const origines: string[] = [];
  for (const morceau of brut.split(/[\s,]+/).filter(Boolean)) {
    let url: URL;
    try {
      url = new URL(morceau);
    } catch {
      throw new Error(`PASSERELLE_REDIRECTIONS_PERMISES : adresse invalide « ${morceau} ».`);
    }
    if (url.protocol !== "https:" || url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
      throw new Error(`PASSERELLE_REDIRECTIONS_PERMISES : origine HTTPS attendue, sans chemin (« https://hote[:port] »), reçu « ${morceau} ».`);
    }
    origines.push(url.origin);
  }
  return origines;
}

/** Adresse de redirection permise pour un serveur d'autorisation RÉEL : boucle locale, ou origine déclarée. */
export function redirectionReellePermise(valeur: string, originesPermises: readonly string[]): boolean {
  if (!uriRedirectionAcceptable(valeur)) return false;
  const url = new URL(valeur);
  if (estBoucleLocale(url)) return true;
  return url.protocol === "https:" && originesPermises.includes(url.origin);
}

/** Schéma d'enregistrement des serveurs réels : celui de la démonstration, plus la liste des redirections permises. */
export function schemaEnregistrementReel(originesPermises: readonly string[]) {
  return schemaEnregistrementClient.extend({
    redirect_uris: z
      .array(
        z
          .string()
          .max(2048)
          .refine(
            (v) => redirectionReellePermise(v, originesPermises),
            "URI de redirection refusée : boucle locale seulement, ou origine HTTPS déclarée dans PASSERELLE_REDIRECTIONS_PERMISES",
          ),
      )
      .min(1)
      .max(5),
  });
}

/**
 * Refuse une requête qui porte l'en-tête Origin d'un autre site. `originesPropres` : origines sous
 * lesquelles ce serveur est servi (boucle locale, et éventuellement son adresse publique HTTPS).
 */
export function verifierOrigine(req: IncomingMessage, originesPropres: readonly string[]): void {
  const origine = req.headers.origin;
  if (typeof origine !== "string" || origine === "null") return;
  let normalisee: string;
  try {
    normalisee = new URL(origine).origin;
  } catch {
    throw new RefusGarde(403, "access_denied", "Origine refusée.");
  }
  if (!originesPropres.includes(normalisee)) throw new RefusGarde(403, "access_denied", "Origine refusée.");
}

/** Origines équivalentes d'un serveur de la boucle locale (même port, trois écritures). */
export function originesBoucle(base: string): string[] {
  const port = new URL(base).port;
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`];
}

/** Exige un corps JSON (RFC 7591 §3.1) : un site tiers ne peut pas l'envoyer sans requête préalable CORS. */
export function exigerCorpsJson(req: IncomingMessage): void {
  const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    throw new RefusGarde(400, "invalid_client_metadata", "Content-Type attendu : application/json");
  }
}

/** Plafond simple de débit sur une fenêtre glissante (enregistrements dynamiques). */
export class LimiteurDebit {
  private readonly instants: number[] = [];

  constructor(
    private readonly maximum: number,
    private readonly fenetreMs: number,
    private readonly maintenant: () => number = Date.now,
  ) {}

  /** Lève RefusGarde 429 si le plafond est atteint ; sinon compte la demande. */
  consommer(): void {
    const t = this.maintenant();
    while (this.instants.length > 0 && this.instants[0]! <= t - this.fenetreMs) this.instants.shift();
    if (this.instants.length >= this.maximum) {
      throw new RefusGarde(429, "temporarily_unavailable", "Trop d'enregistrements de clients : réessayer dans une minute.");
    }
    this.instants.push(t);
  }
}

export const MAX_CLIENTS_DCR = 200;
export const ENREGISTREMENTS_PAR_MINUTE = 30;
export const MAX_TRANSACTIONS = 500;

/**
 * Place un nouveau client dans une table bornée sans jamais évincer un client vivant : on retire le plus
 * ancien client SANS connexion vivante ; s'il n'y en a aucun, la demande est refusée (503).
 */
export function placerClient<T extends { clientId: string }>(clients: T[], nouveau: T, vivant: (clientId: string) => boolean, maximum: number): void {
  if (clients.length >= maximum) {
    const index = clients.findIndex((c) => !vivant(c.clientId));
    if (index < 0) throw new RefusGarde(503, "temporarily_unavailable", "Table des clients pleine (toutes les connexions sont actives) : réessayer plus tard.");
    clients.splice(index, 1);
  }
  clients.push(nouveau);
}

/** Borne une table de transactions en mémoire : la plus ancienne cède la place. */
export function bornerTable<K, V>(table: Map<K, V>, maximum: number): void {
  while (table.size >= maximum) {
    const plusAncienne = table.keys().next().value;
    if (plusAncienne === undefined) return;
    table.delete(plusAncienne);
  }
}
