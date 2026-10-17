/**
 * Serveur HTTP du webhook (boucle locale seulement ; Tailscale Funnel le publie en HTTPS).
 *
 * - GET  /webhook : poignée de main de Meta (`hub.mode=subscribe`, `hub.verify_token` comparé en temps constant,
 *   réponse = `hub.challenge`) ; sinon 403.
 * - POST /webhook : corps brut (256 Kio au plus ; au-delà, 413 et fermeture de la connexion sans lire la suite),
 *   signature X-Hub-Signature-256 vérifiée AVANT toute lecture du JSON (401 sinon), puis plafond global (300 par
 *   minute, compté sur les seules requêtes signées : les rejets ont un compteur à part qui ne bloque jamais une
 *   notification signée), 200 immédiat et traitement en file : numéro de téléphone émetteur de la notification
 *   (`metadata.phone_number_id`) = celui de la configuration, expéditeur sur la liste blanche, message ni plus
 *   vieux que 48 h ni daté du futur, identifiant jamais vu (rejeu ignoré, mémoire persistante), débit borné par
 *   minute et par expéditeur (avertissement unique « Trop de messages » ; le message refusé n'est pas marqué vu).
 * - Tout le reste : 404. Aucun contenu de message n'est journalisé.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";
import type { Etat } from "./etat.js";
import { empreinteNumero, type Journaliseur } from "./journal.js";
import { signatureValide } from "./signature.js";

export const TAILLE_MAX_CORPS = 256 * 1024;
/** Requêtes POST SIGNÉES acceptées par minute sur le webhook. Les requêtes non signées n'y sont jamais comptées. */
export const DEBIT_GLOBAL_PAR_MINUTE = 300;
/** Rejets de signature journalisés par minute (le reste est compté sans être écrit : le journal ne doit pas gonfler). */
export const REJETS_JOURNALISES_PAR_MINUTE = 30;
/** Un message plus vieux est refusé (Meta réessaie 36 h au plus) ; la mémoire des identifiants dure 72 h. */
export const AGE_MAX_MESSAGE_MS = 48 * 3600 * 1000;
/** Tolérance d'horloge pour un message daté du futur. */
export const AVANCE_MAX_MESSAGE_MS = 5 * 60 * 1000;
export const AVERTISSEMENT_DEBIT = "Trop de messages, réessayez dans une minute.";

export interface MessageEntrant {
  id: string;
  de: string;
  type: string;
  texte: string | null;
  /** Horodatage Meta (ms depuis 1970) ; `null` s'il est absent ou illisible. */
  horodatage: number | null;
}

export interface DependancesServeur {
  config: Config;
  etat: Etat;
  journal: Journaliseur;
  /** Traitement d'un message accepté (expéditeur autorisé, jamais vu, débit respecté). */
  traiter(m: MessageEntrant): Promise<void>;
  /** Avertit l'expéditeur dont un message vient d'être refusé pour débit (au plus une fois par minute). */
  avertirDebit?(de: string): Promise<void>;
  horloge?: () => number;
}

const egalConstant = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
};

class Fenetre {
  private readonly instants = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly horloge: () => number) {}
  accepter(cle: string): boolean {
    const t = this.horloge();
    const liste = (this.instants.get(cle) ?? []).filter((x) => t - x < 60_000);
    if (liste.length >= this.max) {
      this.instants.set(cle, liste);
      return false;
    }
    liste.push(t);
    this.instants.set(cle, liste);
    return true;
  }
}

/** Corps brut, ou `null` dès que la taille maximale est dépassée (le reste n'est pas lu : l'appelant ferme la connexion). */
function lireCorps(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    let taille = 0;
    let termine = false;
    req.on("data", (c: Buffer) => {
      if (termine) return;
      taille += c.length;
      if (taille > TAILLE_MAX_CORPS) {
        termine = true;
        morceaux.length = 0;
        req.pause();
        resolve(null);
        return;
      }
      morceaux.push(c);
    });
    req.on("end", () => {
      if (!termine) resolve(Buffer.concat(morceaux));
    });
    req.on("error", (e) => {
      if (!termine) reject(e);
    });
  });
}

/** Extrait les messages d'une notification WhatsApp (champ `messages`), en ignorant les accusés (`statuses`). */
export function extraireMessages(charge: unknown, idNumero: string): { messages: MessageEntrant[]; autreNumero: number } {
  const messages: MessageEntrant[] = [];
  let autreNumero = 0;
  const c = charge as { object?: unknown; entry?: unknown };
  if (c?.object !== "whatsapp_business_account" || !Array.isArray(c.entry)) return { messages, autreNumero };
  for (const entree of c.entry as Array<{ changes?: unknown }>) {
    if (!Array.isArray(entree?.changes)) continue;
    for (const ch of entree.changes as Array<{ field?: unknown; value?: unknown }>) {
      if (ch?.field !== "messages") continue;
      const v = ch.value as { metadata?: { phone_number_id?: unknown }; messages?: unknown };
      if (!Array.isArray(v?.messages)) continue;
      if (String(v.metadata?.phone_number_id ?? "") !== idNumero) {
        autreNumero += v.messages.length;
        continue;
      }
      for (const m of v.messages as Array<{ id?: unknown; from?: unknown; type?: unknown; timestamp?: unknown; text?: { body?: unknown } }>) {
        if (typeof m?.id !== "string" || typeof m.from !== "string" || typeof m.type !== "string") continue;
        const secondes = typeof m.timestamp === "string" && /^\d{1,12}$/.test(m.timestamp) ? Number(m.timestamp) : typeof m.timestamp === "number" && Number.isSafeInteger(m.timestamp) && m.timestamp >= 0 ? m.timestamp : null;
        messages.push({
          id: m.id, de: m.from.replace(/^\+/, ""), type: m.type, texte: m.type === "text" && typeof m.text?.body === "string" ? m.text.body : null,
          horodatage: secondes === null ? null : secondes * 1000,
        });
      }
    }
  }
  return { messages, autreNumero };
}

export function creerServeur(d: DependancesServeur): { serveur: Server; attendre(): Promise<void> } {
  const horloge = d.horloge ?? Date.now;
  const global = new Fenetre(DEBIT_GLOBAL_PAR_MINUTE, horloge);
  const rejetsJournalises = new Fenetre(REJETS_JOURNALISES_PAR_MINUTE, horloge);
  const dernierAvertissement = new Map<string, number>();
  const parExpediteur = new Fenetre(d.config.debitParMinute, horloge);
  const autorises = new Set(d.config.numerosAutorises);
  let file: Promise<void> = Promise.resolve();

  const repondre = (res: ServerResponse, statut: number, corps = "") => {
    res.writeHead(statut, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(corps);
  };

  const serveur = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/webhook") return repondre(res, 404);

      if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const jeton = url.searchParams.get("hub.verify_token") ?? "";
        const defi = url.searchParams.get("hub.challenge") ?? "";
        if (mode === "subscribe" && egalConstant(jeton, d.config.jetonVerification) && /^[A-Za-z0-9_-]{1,256}$/.test(defi)) {
          d.journal("poignee_de_main", { resultat: "acceptee" });
          return repondre(res, 200, defi);
        }
        d.journal("poignee_de_main", { resultat: "refusee" });
        return repondre(res, 403);
      }

      if (req.method !== "POST") return repondre(res, 405);
      const corps = await lireCorps(req);
      if (corps === null) {
        d.journal("corps_trop_grand");
        // Fin de l'envoi sans lire la suite : 413, puis la connexion est détruite une fois la réponse partie.
        res.once("finish", () => req.destroy());
        res.setHeader("connection", "close");
        return repondre(res, 413);
      }
      if (!signatureValide(corps, req.headers["x-hub-signature-256"], d.config.secretApplication)) {
        // Compteur à part : un flot de requêtes non signées ne prend jamais de place dans le plafond des signées.
        if (rejetsJournalises.accepter("signature")) d.journal("signature_refusee", { taille: corps.length });
        return repondre(res, 401);
      }
      if (!global.accepter("webhook")) {
        d.journal("debit_global_depasse");
        return repondre(res, 429);
      }
      let charge: unknown;
      try {
        charge = JSON.parse(corps.toString("utf8"));
      } catch {
        d.journal("json_invalide");
        return repondre(res, 400);
      }
      // Meta attend un 200 rapide ; le traitement suit, en série (l'ordre des messages de l'opérateur est gardé).
      repondre(res, 200, "ok");
      const { messages, autreNumero } = extraireMessages(charge, d.config.idNumero);
      if (autreNumero > 0) d.journal("autre_numero_ignore", { nombre: autreNumero });
      for (const m of messages) {
        if (!autorises.has(m.de)) {
          d.journal("expediteur_inconnu_ignore", { expediteur: empreinteNumero(m.de), type: m.type });
          continue;
        }
        // Un message ancien (rejeu tardif, capture rejouée) ou daté du futur n'est jamais traité.
        const age = m.horodatage === null ? null : horloge() - m.horodatage;
        if (age === null || age > AGE_MAX_MESSAGE_MS || age < -AVANCE_MAX_MESSAGE_MS) {
          d.journal("horodatage_refuse", { type: m.type, motif: age === null ? "absent" : age > 0 ? "trop_ancien" : "futur" });
          continue;
        }
        if (d.etat.dejaVu(m.id)) {
          d.journal("rejeu_ignore", { type: m.type });
          continue;
        }
        d.etat.d.derniereEntree[m.de] = horloge();
        d.etat.sauver();
        // Débit avant de marquer le message « vu » : un message refusé n'est ni perdu en silence ni compté comme traité.
        if (!parExpediteur.accepter(m.de)) {
          d.journal("debit_expediteur_depasse");
          const avant = dernierAvertissement.get(m.de) ?? -Infinity;
          if (d.avertirDebit && horloge() - avant >= 60_000) {
            dernierAvertissement.set(m.de, horloge());
            file = file.then(() => d.avertirDebit!(m.de)).catch((e: unknown) => d.journal("avertissement_echec", { erreur: e instanceof Error ? e.message.slice(0, 200) : "inconnue" }));
          }
          continue;
        }
        d.etat.premiereFois(m.id, horloge());
        d.journal("message_accepte", { type: m.type, longueur: m.texte?.length ?? 0 });
        file = file.then(() => d.traiter(m)).catch((e: unknown) => d.journal("traitement_echec", { erreur: e instanceof Error ? e.message.slice(0, 200) : "inconnue" }));
      }
    } catch (e) {
      d.journal("erreur_serveur", { erreur: e instanceof Error ? e.message.slice(0, 200) : "inconnue" });
      if (!res.headersSent) repondre(res, 500);
    }
  });
  // `attendre` : fin des traitements en file (tests, arrêt propre).
  return { serveur, attendre: () => file };
}
