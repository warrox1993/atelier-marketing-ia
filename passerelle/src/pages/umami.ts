// Client minimal de l'API locale d'Umami 3.x (127.0.0.1:3196) : connexion, site « pages de destination », statistiques,
// et relais du script de suivi et du point de collecte (Umami n'est jamais exposé : tout passe par le serveur de pages).

import { readFileSync, statSync } from "node:fs";

export const NOM_SITE_UMAMI = "Pages de destination de l'atelier";

export interface ReglagesUmami {
  url: string;
  utilisateur: string;
  motDePasse: string;
}

export class ErreurConfigUmami extends Error {}

/** Lit un fichier d'environnement 0600 (UMAMI_URL, UMAMI_UTILISATEUR, UMAMI_MOT_DE_PASSE). Refuse un fichier lisible par d'autres comptes. */
export function lireReglagesUmami(chemin: string): ReglagesUmami {
  const st = statSync(chemin);
  if ((st.mode & 0o077) !== 0) throw new ErreurConfigUmami(`${chemin} est lisible par d'autres comptes (chmod 600 attendu).`);
  const vars = new Map<string, string>();
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/u.exec(ligne.trim());
    if (m) vars.set(m[1] as string, m[2] as string);
  }
  const url = (vars.get("UMAMI_URL") ?? "http://127.0.0.1:3196").replace(/\/+$/u, "");
  const u = new URL(url);
  if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost" && u.hostname !== "[::1]") throw new ErreurConfigUmami("UMAMI_URL doit viser la boucle locale.");
  const utilisateur = vars.get("UMAMI_UTILISATEUR");
  const motDePasse = vars.get("UMAMI_MOT_DE_PASSE");
  if (!utilisateur || !motDePasse) throw new ErreurConfigUmami("UMAMI_UTILISATEUR ou UMAMI_MOT_DE_PASSE manquant.");
  return { url, utilisateur, motDePasse };
}

export interface StatistiquesUmami {
  vues: number;
  visiteurs: number;
  visites: number;
}

type Appel = typeof fetch;

export class ClientUmami {
  private jeton: string | null = null;
  private siteId: string | null = null;

  constructor(
    private readonly r: ReglagesUmami,
    private readonly f: Appel = fetch,
  ) {}

  get url(): string {
    return this.r.url;
  }

  private async requete(chemin: string, init: RequestInit = {}, reconnecte = false): Promise<Response> {
    if (!this.jeton) await this.connecter();
    const rep = await this.f(`${this.r.url}${chemin}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${this.jeton}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (rep.status === 401 && !reconnecte) {
      this.jeton = null;
      return this.requete(chemin, init, true);
    }
    return rep;
  }

  private async connecter(): Promise<void> {
    const rep = await this.f(`${this.r.url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: this.r.utilisateur, password: this.r.motDePasse }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!rep.ok) throw new Error(`Umami : connexion refusée (HTTP ${rep.status}).`);
    const corps = (await rep.json()) as { token?: string };
    if (!corps.token) throw new Error("Umami : réponse de connexion sans jeton.");
    this.jeton = corps.token;
  }

  /** Identifiant du site « pages de destination » : retrouvé par son nom, créé au besoin. Mis en cache. */
  async assurerSite(domaine = "pages.atelier.invalid"): Promise<string> {
    if (this.siteId) return this.siteId;
    const rech = await this.requete(`/api/websites?search=${encodeURIComponent(NOM_SITE_UMAMI)}&pageSize=50`);
    if (!rech.ok) throw new Error(`Umami : liste des sites refusée (HTTP ${rech.status}).`);
    const donnees = (await rech.json()) as { data?: Array<{ id: string; name: string }> };
    const trouve = donnees.data?.find((s) => s.name === NOM_SITE_UMAMI);
    if (trouve) return (this.siteId = trouve.id);
    const cree = await this.requete("/api/websites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: NOM_SITE_UMAMI, domain: domaine }) });
    if (!cree.ok) throw new Error(`Umami : création du site refusée (HTTP ${cree.status}).`);
    const site = (await cree.json()) as { id?: string };
    if (!site.id) throw new Error("Umami : création du site sans identifiant.");
    return (this.siteId = site.id);
  }

  /** Statistiques d'un chemin exact (/p/<slug> ou /p/<slug>/merci) sur une période. */
  async statistiques(chemin: string, debutMs: number, finMs: number): Promise<StatistiquesUmami> {
    const id = await this.assurerSite();
    const q = new URLSearchParams({ startAt: String(debutMs), endAt: String(finMs), path: chemin });
    const rep = await this.requete(`/api/websites/${id}/stats?${q.toString()}`);
    if (!rep.ok) throw new Error(`Umami : statistiques refusées (HTTP ${rep.status}).`);
    const s = (await rep.json()) as Record<string, unknown>;
    // Umami 3 : { pageviews, visitors, visits, ... } en nombres (2.x : { pageviews: { value } }).
    const n = (v: unknown): number => (typeof v === "number" ? v : typeof v === "object" && v !== null && typeof (v as { value?: unknown }).value === "number" ? (v as { value: number }).value : 0);
    return { vues: n(s["pageviews"]), visiteurs: n(s["visitors"]), visites: n(s["visits"]) };
  }
}
