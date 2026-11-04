// Réponses d'outils de lecture gardées en mémoire, relues UNE SEULE fois par référence (lot C1).
// Le plugin reprend ainsi la réponse signée telle quelle au lieu de la recopier par l'agent. La référence est un secret
// à usage unique : la passerelle ne la journalise pas, mais elle figure dans le résultat d'outil, donc dans les
// transcriptions de l'agent (durée de vie courte). Mémoire seulement, rien n'est écrit sur disque.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { lireFichierSecret } from "./reel/prospection/commun.js";
import type { RouteInterne } from "./serveur.js";

export const CHEMIN_PRENDRE_REPONSE = "/interne/reponses/prendre";

// Un dépôt se fait dans le même run que la lecture : 1 h suffit largement.
const DUREE_DE_VIE_MS = 3600 * 1000;
const MAX_ENTREES = 1000;
const MAX_PAR_CLE = 100;
const MAX_OCTETS = 50 * 1024 * 1024;

export interface OptionsReponsesGardees {
  maintenant?: () => number;
  dureeMs?: number;
  maxEntrees?: number;
  /** Plafond par clé de cloisonnement (service + compte de l'appel) : un agent bavard n'évince pas les autres. */
  maxParCle?: number;
  maxOctets?: number;
  /** Jeton partagé avec le plugin, exigé sur la route interne (en-tête Authorization: Bearer). Sans lui, la route ne se construit pas. */
  jeton?: string;
}

export interface OptionsGarde {
  /** Clé de cloisonnement du plafond par appelant ; absente : seul le plafond global s'applique. */
  cloisonnement?: string;
  /** Service et outil de la lecture : la prise doit les redonner à l'identique (sinon refus, référence intacte). */
  service?: string;
  outil?: string;
}

interface Entree {
  json: string;
  octets: number;
  expire: number;
  cloisonnement: string | null;
  service: string | null;
  outil: string | null;
}

export class ReponsesGardees {
  // Map conserve l'ordre d'insertion : la première clé est toujours la plus ancienne.
  private readonly entrees = new Map<string, Entree>();
  private octets = 0;
  private readonly maintenant: () => number;
  private readonly dureeMs: number;
  private readonly maxEntrees: number;
  private readonly maxParCle: number;
  private readonly maxOctets: number;
  private readonly empreinteJeton: Buffer | null;

  constructor(options: OptionsReponsesGardees = {}) {
    this.maintenant = options.maintenant ?? Date.now;
    this.dureeMs = options.dureeMs ?? DUREE_DE_VIE_MS;
    this.maxEntrees = options.maxEntrees ?? MAX_ENTREES;
    this.maxParCle = options.maxParCle ?? MAX_PAR_CLE;
    this.maxOctets = options.maxOctets ?? MAX_OCTETS;
    this.empreinteJeton = options.jeton ? createHash("sha256").update(options.jeton).digest() : null;
  }

  /** Garde la réponse ; renvoie sa référence, ou null si elle dépasse à elle seule le plafond en octets. */
  garder(reponse: unknown, { cloisonnement, service, outil }: OptionsGarde = {}): string | null {
    const json = JSON.stringify(reponse);
    const octets = Buffer.byteLength(json);
    if (octets > this.maxOctets) return null;
    this.purgerExpirees();
    if (cloisonnement !== undefined) this.faireDePlace(cloisonnement);
    while (this.entrees.size > 0 && (this.entrees.size >= this.maxEntrees || this.octets + octets > this.maxOctets)) {
      this.retirer(this.entrees.keys().next().value as string);
    }
    const reference = randomBytes(16).toString("base64url");
    this.entrees.set(reference, { json, octets, expire: this.maintenant() + this.dureeMs, cloisonnement: cloisonnement ?? null, service: service ?? null, outil: outil ?? null });
    this.octets += octets;
    return reference;
  }

  /** Rend la réponse puis l'efface (usage unique) ; null si inconnue, déjà prise ou expirée. */
  prendre(reference: unknown): unknown {
    if (typeof reference !== "string") return null;
    const entree = this.entrees.get(reference);
    if (!entree) return null;
    this.retirer(reference);
    return entree.expire < this.maintenant() ? null : JSON.parse(entree.json);
  }

  /** Jeton exact en en-tête `Authorization: Bearer` ; comparaison des empreintes en temps constant. */
  private jetonValide(entetes: IncomingHttpHeaders): boolean {
    const m = /^Bearer (.+)$/u.exec(entetes.authorization ?? "");
    if (!m || !this.empreinteJeton) return false;
    return timingSafeEqual(createHash("sha256").update(m[1]!).digest(), this.empreinteJeton);
  }

  /**
   * Route interne POST /interne/reponses/prendre {reference, service, outil} : 401 sans le bon jeton, 404 si inconnue, déjà
   * prise ou expirée, 409 si service/outil diffèrent de la lecture (référence NON consommée), 200 {reponse} sinon.
   */
  routeInterne(): RouteInterne {
    if (!this.empreinteJeton) throw new Error("ReponsesGardees : le jeton partagé avec le plugin est obligatoire pour ouvrir la route interne.");
    return {
      chemin: CHEMIN_PRENDRE_REPONSE,
      traiter: async (corps, entetes) => {
        if (!this.jetonValide(entetes)) return { statut: 401, corps: { error: "jeton_invalide" } };
        const c = typeof corps === "object" && corps !== null ? (corps as { reference?: unknown; service?: unknown; outil?: unknown }) : {};
        const entree = typeof c.reference === "string" ? this.entrees.get(c.reference) : undefined;
        if (!entree || entree.expire < this.maintenant()) {
          if (typeof c.reference === "string") this.retirer(c.reference);
          return { statut: 404, corps: { error: "reference_inconnue" } };
        }
        if (entree.service !== c.service || entree.outil !== c.outil) return { statut: 409, corps: { error: "reference_autre_outil" } };
        const reponse = this.prendre(c.reference);
        return reponse === null ? { statut: 404, corps: { error: "reference_inconnue" } } : { statut: 200, corps: { reponse } };
      },
    };
  }

  /** Évince les plus anciennes références de la même clé jusqu'à ce qu'il en reste moins que le plafond par clé. */
  private faireDePlace(cloisonnement: string): void {
    const memes = [...this.entrees].filter(([, e]) => e.cloisonnement === cloisonnement).map(([reference]) => reference);
    for (const reference of memes.slice(0, Math.max(0, memes.length - this.maxParCle + 1))) this.retirer(reference);
  }

  private retirer(reference: string): void {
    const entree = this.entrees.get(reference);
    if (!entree) return;
    this.octets -= entree.octets;
    this.entrees.delete(reference);
  }

  private purgerExpirees(): void {
    const maintenant = this.maintenant();
    for (const [reference, entree] of this.entrees) if (entree.expire < maintenant) this.retirer(reference);
  }
}

const JETON_LONGUEUR_MIN = 32;

/**
 * Gardien actif seulement si `PASSERELLE_REPONSES_JETON_FICHIER` désigne un fichier 0600 contenant le jeton partagé avec le
 * plugin (32 caractères au moins). Sinon null : aucune référence n'est émise et l'agent recopie la réponse (jamais de route ouverte).
 */
export function reponsesGardeesDepuisEnv(env: NodeJS.ProcessEnv, journal: (message: string) => void): ReponsesGardees | null {
  const fichier = env["PASSERELLE_REPONSES_JETON_FICHIER"]?.trim();
  if (!fichier) {
    journal("références à usage unique inactives (PASSERELLE_REPONSES_JETON_FICHIER absent) : les agents recopient la réponse complète.");
    return null;
  }
  try {
    const jeton = lireFichierSecret(fichier, "PASSERELLE_REPONSES_JETON_FICHIER").trim();
    if (jeton.length < JETON_LONGUEUR_MIN) throw new Error(`PASSERELLE_REPONSES_JETON_FICHIER : jeton de ${JETON_LONGUEUR_MIN} caractères au moins attendu.`);
    return new ReponsesGardees({ jeton });
  } catch (erreur) {
    journal(`références à usage unique inactives : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    return null;
  }
}
