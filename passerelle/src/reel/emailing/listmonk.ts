// Client minimal de l'API de listmonk v6.2.0 (conteneur Podman local, boucle locale seulement).
//
// Garde-fous : adresse de listmonk en http sur la boucle locale uniquement ; jeton d'API lu dans un fichier 0600, jamais journalisé ni
// renvoyé ; redirections refusées ; délai et taille de réponse plafonnés ; l'erreur renvoyée à l'agent ne reprend jamais le corps brut.
// Deux jetons distincts existent côté listmonk (scripts/emailing-provisionner.py) : « gestion » (listes, abonnés, brouillons, SANS droit
// d'envoi) pour les outils de l'agent, et « envoi » (changement d'état des campagnes) réservé à la route humaine de la passerelle.

import { lireFichierSecret } from "../prospection/commun.js";

export const URL_LISTMONK_DEFAUT = "http://127.0.0.1:19000";
export const DELAI_LISTMONK_MS = 20_000;
export const REPONSE_LISTMONK_MAX_OCTETS = 4 * 1024 * 1024;
/** Nom du serveur SMTP de TEST (Mailpit) dans le réseau Podman dédié : tout autre serveur est un envoi réel. */
export const HOTE_SMTP_TEST = "atelier-mailpit";

export class ErreurListmonk extends Error {
  constructor(message: string, readonly statut: number | null = null) {
    super(message);
  }
}

export interface ListeListmonk { id: number; name: string; type: string; optin: string; subscriber_count: number; description?: string }
export interface AbonneListmonk {
  id: number; email: string; name: string; status: string;
  lists?: Array<{ id: number; name?: string; subscription_status: string }>;
}
export interface CampagneListmonk {
  id: number; name: string; subject: string; status: string; body: string; altbody: string | null; content_type: string; template_id: number;
  from_email?: string; lists: Array<{ id: number; name: string }>; to_send: number; sent: number; started_at: string | null; updated_at: string | null;
  messenger?: string;
}

export interface OptionsListmonk {
  url?: string;
  /** « utilisateur:jeton » (contenu du fichier). */
  jeton: string;
  fetch?: typeof fetch;
}

/** Vrai pour une adresse de boucle locale en http. */
export function verifierUrlListmonk(valeur: string): URL {
  let u: URL;
  try { u = new URL(valeur); } catch { throw new Error(`PASSERELLE_LISTMONK_URL invalide : « ${valeur} ».`); }
  if (u.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(u.hostname)) {
    throw new Error("PASSERELLE_LISTMONK_URL : listmonk doit être joint sur la boucle locale en http (127.0.0.1, ::1 ou localhost).");
  }
  return u;
}

/** Lit un jeton d'API listmonk (« utilisateur:jeton ») dans un fichier lisible par son seul propriétaire. */
export function lireJetonListmonk(chemin: string, nomVariable: string): string {
  const jeton = lireFichierSecret(chemin, nomVariable).trim();
  if (!/^[A-Za-z0-9_.-]{1,64}:[A-Za-z0-9_.-]{8,200}$/.test(jeton)) throw new Error(`${nomVariable} : format attendu « utilisateur:jeton ».`);
  return jeton;
}

async function lirePlafonne(rep: Response): Promise<string> {
  const annonce = Number(rep.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > REPONSE_LISTMONK_MAX_OCTETS) { await rep.body?.cancel().catch(() => undefined); throw new ErreurListmonk("listmonk : réponse trop volumineuse."); }
  if (!rep.body) return "";
  const lecteur = rep.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > REPONSE_LISTMONK_MAX_OCTETS) { await lecteur.cancel().catch(() => undefined); throw new ErreurListmonk("listmonk : réponse trop volumineuse."); }
    morceaux.push(value);
  }
  return Buffer.concat(morceaux).toString("utf8");
}

export class ClientListmonk {
  private readonly base: string;
  private readonly jeton: string;
  private readonly appelFetch: typeof fetch;

  constructor(options: OptionsListmonk) {
    this.base = verifierUrlListmonk(options.url ?? URL_LISTMONK_DEFAUT).origin;
    this.jeton = options.jeton;
    this.appelFetch = options.fetch ?? fetch;
  }

  /** Appel JSON ; renvoie le champ `data` de listmonk. */
  async appeler<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
    let rep: Response;
    try {
      rep = await this.appelFetch(`${this.base}${chemin}`, {
        method: methode,
        headers: { authorization: `token ${this.jeton}`, ...(corps === undefined ? {} : { "content-type": "application/json" }), accept: "application/json" },
        ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
        signal: AbortSignal.timeout(DELAI_LISTMONK_MS),
        redirect: "error",
      });
    } catch {
      throw new ErreurListmonk("listmonk injoignable (service atelier-listmonk arrêté ?).");
    }
    const texte = await lirePlafonne(rep);
    let json: { data?: T; message?: string } = {};
    try { json = texte.trim() === "" ? {} : (JSON.parse(texte) as { data?: T; message?: string }); } catch { /* corps non JSON : message générique ci-dessous */ }
    if (!rep.ok) {
      const motif = typeof json.message === "string" ? json.message.slice(0, 200) : `HTTP ${rep.status}`;
      throw new ErreurListmonk(`listmonk a refusé la demande (${motif}).`, rep.status);
    }
    return json.data as T;
  }

  async listes(): Promise<ListeListmonk[]> {
    const rep = await this.appeler<{ results: ListeListmonk[] }>("GET", "/api/lists?per_page=all&minimal=false");
    return rep?.results ?? [];
  }

  /**
   * Destinataires RÉELS d'une liste : abonnés confirmés comptés par listmonk au moment de l'appel. Le champ `subscriber_count` des listes
   * est un compteur mis en cache par listmonk (constaté à 0 juste après une inscription) : il ne sert qu'à l'affichage.
   */
  async compterConfirmes(listeId: number): Promise<number> {
    const rep = await this.appeler<{ total?: number }>("GET", `/api/subscribers?list_id=${listeId}&subscription_status=confirmed&per_page=1`);
    return typeof rep?.total === "number" ? rep.total : 0;
  }

  /**
   * Identifiants des abonnés confirmés d'une liste, au moment de l'appel (tous, pas une page) : sert à lier l'accord humain aux
   * destinataires réels. Erreur si listmonk rend moins d'abonnés que son total (liste tronquée : on ne devine pas).
   */
  async idsConfirmes(listeId: number): Promise<number[]> {
    const rep = await this.appeler<{ results?: Array<{ id: number }>; total?: number }>("GET", `/api/subscribers?list_id=${listeId}&subscription_status=confirmed&per_page=all`);
    const ids = (rep?.results ?? []).map((a) => a.id);
    if (typeof rep?.total === "number" && rep.total > ids.length) throw new ErreurListmonk(`listmonk a rendu ${ids.length} abonnés sur ${rep.total} pour la liste ${listeId}.`, 502);
    return ids;
  }

  creerListe(nom: string, description: string): Promise<ListeListmonk> {
    // Liste privée en inscription simple : la preuve du consentement est exigée par l'atelier, pas par un courriel de confirmation.
    return this.appeler<ListeListmonk>("POST", "/api/lists", { name: nom, type: "private", optin: "single", tags: [], description });
  }

  async chercherAbonne(email: string): Promise<AbonneListmonk | null> {
    const rep = await this.appeler<{ results: AbonneListmonk[] }>("GET", `/api/subscribers?search=${encodeURIComponent(email)}&per_page=20`);
    return (rep?.results ?? []).find((a) => a.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  creerAbonne(a: { email: string; nom: string; listeId: number; attribs: Record<string, unknown> }): Promise<AbonneListmonk> {
    return this.appeler<AbonneListmonk>("POST", "/api/subscribers", {
      email: a.email, name: a.nom, status: "enabled", lists: [a.listeId], preconfirm_subscriptions: true, attribs: a.attribs,
    });
  }

  async ajouterALaListe(abonneId: number, listeId: number): Promise<void> {
    await this.appeler<boolean>("PUT", "/api/subscribers/lists", { ids: [abonneId], action: "add", target_list_ids: [listeId], status: "confirmed" });
  }

  async gabaritParNom(nom: string): Promise<number | null> {
    const g = await this.appeler<Array<{ id: number; name: string }>>("GET", "/api/templates");
    return (g ?? []).find((x) => x.name === nom)?.id ?? null;
  }

  creerCampagne(c: { nom: string; sujet: string; listeIds: number[]; html: string; texte: string; gabaritId: number }): Promise<CampagneListmonk> {
    // status « draft » : listmonk ne l'envoie jamais tout seul ; aucune date d'envoi programmée.
    return this.appeler<CampagneListmonk>("POST", "/api/campaigns", {
      name: c.nom, subject: c.sujet, lists: c.listeIds, type: "regular", content_type: "html", body: c.html, altbody: c.texte,
      template_id: c.gabaritId, messenger: "email", tags: ["atelier"],
    });
  }

  campagne(id: number): Promise<CampagneListmonk> {
    return this.appeler<CampagneListmonk>("GET", `/api/campaigns/${id}`);
  }

  async changerEtat(id: number, statut: "running" | "cancelled" | "paused"): Promise<CampagneListmonk> {
    return this.appeler<CampagneListmonk>("PUT", `/api/campaigns/${id}/status`, { status: statut });
  }

  /** Serveurs SMTP actifs de listmonk (les mots de passe sont masqués par listmonk). */
  async hotesSmtpActifs(): Promise<string[]> {
    const r = await this.appeler<{ smtp?: Array<{ enabled?: boolean; host?: string }> }>("GET", "/api/settings");
    return (r?.smtp ?? []).filter((s) => s.enabled === true).map((s) => String(s.host ?? ""));
  }
}

/** « test » seulement si TOUS les serveurs SMTP actifs sont Mailpit ; au moindre autre serveur ou sans serveur actif, « reel ». */
export async function modeEnvoi(client: ClientListmonk): Promise<"test" | "reel"> {
  const hotes = await client.hotesSmtpActifs();
  return hotes.length > 0 && hotes.every((h) => h === HOTE_SMTP_TEST) ? "test" : "reel";
}

export const MESSAGE_ENVOI_TEST =
  "envoi de test, rien n'est parti : listmonk envoie tout à Mailpit (http://127.0.0.1:18025), le SMTP réel n'est pas configuré.";
