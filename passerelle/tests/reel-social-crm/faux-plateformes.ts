// Faux serveurs locaux des six plateformes, fidèles aux exemples des documentations consultées le 15/10/2026
// (URL citées dans src/reel/social-crm/*.ts). Un seul serveur HTTP, un préfixe de chemin par hôte imité
// (adressesFaussesSocialCrm) ; Odoo a ses propres serveurs (une instance = une origine).
// Le consentement de chaque plateforme est simulé : la boîte de dialogue redirige aussitôt avec un code
// (ou une erreur si `refuser` est demandé). Aucun appel ne sort de la boucle locale.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const IDENTIFIANTS = {
  meta: { clientId: "meta-app-1", clientSecret: "secret-meta-NE-PAS-JOURNALISER" },
  instagram: { clientId: "ig-app-1", clientSecret: "secret-ig-NE-PAS-JOURNALISER" },
  linkedin: { clientId: "li-app-1", clientSecret: "secret-li-NE-PAS-JOURNALISER" },
  hubspot: { clientId: "hs-app-1", clientSecret: "secret-hs-NE-PAS-JOURNALISER" },
  pipedrive: { clientId: "pd-app-1", clientSecret: "secret-pd-NE-PAS-JOURNALISER" },
  teamleader: { clientId: "tl-app-1", clientSecret: "secret-tl-NE-PAS-JOURNALISER" },
};

/** Valeurs secrètes émises par les faux serveurs : aucune ne doit apparaître dans un journal ni une réponse d'outil. */
export const SECRETS_EMIS = {
  pageA: "EAAjetonPageA-SECRET",
  pageB: "EAAjetonPageB-SECRET",
  utilisateurMeta: "EAAjetonUtilisateurLong-SECRET",
  instagram: "IGjetonLong-SECRET",
  linkedin: "AQVjetonLinkedin-SECRET",
  linkedinRafraichi: "AQVjetonLinkedin2-SECRET",
  hubspot: "CJhubspotAcces-SECRET",
  hubspotRafraichi: "CJhubspotAcces2-SECRET",
  pipedrive: "pdOauthAcces-SECRET",
  teamleader: "tlAcces1-SECRET",
};

export const CLE_API_PIPEDRIVE = "abcdef0123456789abcdef0123456789abcdef01";
export const CLE_API_ODOO = "6578616d706c65206a736f6e20617069206b6579";

type Reponse = { statut: number; corps?: unknown; entetes?: Record<string, string> } | "coupure" | "coupure_apres_effet";

export interface Appel {
  methode: string;
  chemin: string;
  requete: URLSearchParams;
  entetes: IncomingMessage["headers"];
  corps: string;
}

const PUBLICATIONS_FB = [
  // Plus récentes d'abord, comme /feed.
  { id: "1000_3", message: "Toiture : nos conseils d'automne", created_time: "2026-09-24T08:00:00+0000", link: "https://exemple.invalid/toiture", reactions: 12, comments: 3, shares: 2 },
  { id: "1000_2", message: "Châssis : devis gratuit", created_time: "2026-09-17T08:00:00+0000", reactions: 5, comments: 0, shares: 0 },
  { id: "1000_1", created_time: "2026-09-10T08:00:00+0000", reactions: 1, comments: 1, shares: 0 },
  { id: "1000_0", message: "Hors période", created_time: "2026-08-01T08:00:00+0000", reactions: 1, comments: 0, shares: 0 },
];

export class FauxPlateformes {
  private serveur: Server | null = null;
  base = "";
  readonly appels: Appel[] = [];
  private readonly injections = new Map<string, Reponse[]>();
  /** Ce que les faux ont réellement « fait » (effets des mutations). */
  readonly effets: { type: string; donnees: Record<string, unknown> }[] = [];
  /** Nombre de pages Facebook renvoyées par /me/accounts. */
  pagesFacebook = 2;
  refuserConsentement = false;
  private compteur = 0;
  private refreshTeamleader = "tlRafraichissement-1";
  /** Contacts HubSpot : propriétés modifiables. */
  readonly contactsHubspot = new Map<string, Record<string, string | null>>();
  readonly personnesPipedrive = new Map<number, Record<string, unknown>>();
  readonly contactsTeamleader = new Map<string, Record<string, unknown>>();
  publicationsLinkedin: Record<string, unknown>[] = [];
  readonly publicationsFacebook: Record<string, unknown>[] = PUBLICATIONS_FB.map((p) => ({ ...p }));
  readonly mediasInstagram: Record<string, unknown>[] = [];
  /** Jeton HubSpot actuellement valide (le premier « expire » sur demande). */
  jetonHubspotValide = SECRETS_EMIS.hubspot;

  constructor() {
    for (let i = 1; i <= 3; i++) {
      this.contactsHubspot.set(String(100 + i), {
        createdate: `2026-09-0${i}T10:00:00.000Z`, email: `client${i}@exemple.invalid`, firstname: `Prénom${i}`, lastname: `Nom${i}`, phone: `+32 4 000 10 0${i}`,
        city: "Liège", zip: "4000", lifecyclestage: "lead", hs_lead_status: "NEW", hs_analytics_source: "ORGANIC_SEARCH", hs_object_id: String(100 + i),
        lastmodifieddate: `2026-09-0${i}T11:00:00.000Z`,
      });
    }
    // Pipedrive : 3 personnes, triées par add_time ; la première est créée avant la période.
    const personnes = [
      { id: 1, name: "Ancien Client", first_name: "Ancien", last_name: "Client", add_time: "2026-08-20T09:00:00Z", update_time: "2026-09-05T09:00:00Z" },
      { id: 2, name: "Alice Dupont", first_name: "Alice", last_name: "Dupont", add_time: "2026-09-02T09:00:00Z", update_time: "2026-09-02T09:00:00Z" },
      { id: 3, name: "Bruno Martin", first_name: "Bruno", last_name: "Martin", add_time: "2026-09-15T14:30:00Z", update_time: "2026-09-16T08:00:00Z" },
      { id: 4, name: "Futur Client", first_name: "Futur", last_name: "Client", add_time: "2026-10-03T09:00:00Z", update_time: "2026-10-03T09:00:00Z" },
    ];
    for (const p of personnes) {
      this.personnesPipedrive.set(p.id, {
        ...p, owner_id: 1, org_id: null, emails: [{ value: `${p.first_name.toLowerCase()}@exemple.invalid`, primary: true, label: "work" }],
        phones: [{ value: "+32 4 000 20 00", primary: true, label: "work" }], is_deleted: false, visible_to: 3, label_ids: [], picture_id: null,
        postal_address: { value: "Liège", locality: "Liège", postal_code: "4000" }, custom_fields: { "1a2b3c": "Liège-Centre" },
      });
    }
    for (let i = 1; i <= 3; i++) {
      const id = `cb8da52a-ce89-4bf6-8f7e-8ee6cb85e3b${i}`;
      this.contactsTeamleader.set(id, {
        id, first_name: `Prénom${i}`, last_name: `Nom${i}`, status: "active", emails: [{ type: "primary", email: `tl${i}@exemple.invalid` }],
        telephones: [{ type: "phone", number: `+32 4 000 30 0${i}` }], added_at: `2026-09-${String(i * 7).padStart(2, "0")}T10:00:00+00:00`, updated_at: `2026-09-${String(i * 7).padStart(2, "0")}T12:00:00+00:00`,
        tags: [], web_url: "https://focus.teamleader.eu/contact_detail.php?id=1",
      });
    }
    // LinkedIn : 150 publications d'organisation, une par jour à rebours du 30/09/2026 (deux pages de 100).
    const fin = Date.parse("2026-09-30T09:00:00Z");
    this.publicationsLinkedin = Array.from({ length: 150 }, (_, i) => ({
      lifecycleState: "PUBLISHED", lastModifiedAt: fin - i * 86_400_000, visibility: "PUBLIC", publishedAt: fin - i * 86_400_000, author: "urn:li:organization:2414183",
      distribution: { feedDistribution: "MAIN_FEED", thirdPartyDistributionChannels: [] }, lifecycleStateInfo: { isEditedByAuthor: false }, isReshareDisabledByAuthor: false,
      createdAt: fin - i * 86_400_000, id: `urn:li:share:68569211377215${String(44704 + i)}`, commentary: `Publication ${i}`,
    }));
    for (let i = 0; i < 3; i++) {
      this.mediasInstagram.push({ id: `1790000000000${i}`, caption: i === 2 ? undefined : `Légende ${i}`, timestamp: `2026-09-${String(20 - i * 5).padStart(2, "0")}T08:00:00+0000`, like_count: 10 + i, comments_count: i });
    }
  }

  demarrer(): Promise<string> {
    return new Promise((resolve) => {
      this.serveur = createServer((req, res) => {
        void this.traiter(req, res);
      });
      this.serveur.listen(0, "127.0.0.1", () => {
        this.base = `http://127.0.0.1:${(this.serveur!.address() as AddressInfo).port}`;
        resolve(this.base);
      });
    });
  }

  arreter(): Promise<void> {
    return new Promise((resolve) => {
      this.serveur?.close(() => resolve());
      this.serveur?.closeAllConnections();
    });
  }

  /** Réponse(s) forcée(s) pour la prochaine requête dont « MÉTHODE chemin » commence par `cle`. */
  injecter(cle: string, ...reponses: Reponse[]): void {
    this.injections.set(cle, [...(this.injections.get(cle) ?? []), ...reponses]);
  }

  appelsVers(prefixe: string): Appel[] {
    return this.appels.filter((a) => `${a.methode} ${a.chemin}`.startsWith(prefixe));
  }

  private async traiter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const morceaux: Buffer[] = [];
    for await (const m of req) morceaux.push(Buffer.isBuffer(m) ? m : Buffer.from(m as string));
    const corps = Buffer.concat(morceaux).toString("utf8");
    const url = new URL(req.url ?? "/", this.base);
    const appel: Appel = { methode: req.method ?? "GET", chemin: url.pathname, requete: url.searchParams, entetes: req.headers, corps };
    this.appels.push(appel);
    const cle = `${appel.methode} ${appel.chemin}`;
    for (const [prefixe, file] of this.injections) {
      if (cle.startsWith(prefixe) && file.length > 0) {
        const r = file.shift()!;
        if (file.length === 0) this.injections.delete(prefixe);
        if (r === "coupure") {
          req.socket.destroy();
          return;
        }
        if (r === "coupure_apres_effet") {
          // L'effet a lieu, puis la connexion tombe : cas ambigu par excellence.
          this.repondre(appel, () => undefined);
          req.socket.destroy();
          return;
        }
        res.writeHead(r.statut, { "content-type": "application/json", ...(r.entetes ?? {}) });
        res.end(r.corps === undefined ? "" : JSON.stringify(r.corps));
        return;
      }
    }
    this.repondre(appel, (statut, json, entetes = {}) => {
      if (statut === 302) {
        res.writeHead(302, { location: String(json) });
        res.end();
        return;
      }
      res.writeHead(statut, { "content-type": "application/json", ...entetes });
      res.end(json === undefined ? "" : JSON.stringify(json));
    });
  }

  private formulaire(a: Appel): URLSearchParams {
    return new URLSearchParams(a.corps);
  }

  private json(a: Appel): Record<string, unknown> {
    try {
      return JSON.parse(a.corps) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private porteur(a: Appel): string {
    return /^Bearer (.+)$/.exec(String(a.entetes.authorization ?? ""))?.[1] ?? "";
  }

  /** Consentement simulé : redirection immédiate vers redirect_uri avec code (ou erreur). */
  private dialogue(a: Appel, envoyer: Envoi, code: string): void {
    const retour = new URL(a.requete.get("redirect_uri") ?? "");
    if (this.refuserConsentement) {
      retour.searchParams.set("error", "access_denied");
      retour.searchParams.set("error_description", "Permissions error");
    } else retour.searchParams.set("code", code);
    retour.searchParams.set("state", a.requete.get("state") ?? "");
    envoyer(302, retour.toString());
  }

  private repondre(a: Appel, envoyer: Envoi): void {
    const p = a.chemin;
    // --- Meta (Facebook) ---------------------------------------------------------------------
    if (p === "/facebook-www/v26.0/dialog/oauth") return this.dialogue(a, envoyer, "code-meta");
    if (p === "/meta-graph/v26.0/oauth/access_token") {
      const q = a.requete;
      if (q.get("client_secret") !== IDENTIFIANTS.meta.clientSecret) return envoyer(400, { error: { message: "Error validating client secret.", type: "OAuthException", code: 1, fbtrace_id: "A1" } });
      if (q.get("grant_type") === "fb_exchange_token") return envoyer(200, { access_token: SECRETS_EMIS.utilisateurMeta, token_type: "bearer", expires_in: 5_183_944 });
      if (q.get("code") !== "code-meta") return envoyer(400, { error: { message: "Invalid verification code format.", type: "OAuthException", code: 100, fbtrace_id: "A2" } });
      return envoyer(200, { access_token: "EAAjetonCourt", token_type: "bearer", expires_in: 5400 });
    }
    if (p === "/meta-graph/v26.0/me/accounts") {
      if (this.porteur(a) !== SECRETS_EMIS.utilisateurMeta) return envoyer(401, { error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190, fbtrace_id: "A3" } });
      const pages = [
        { id: "100000000000001", name: "Rénovation Liège", access_token: SECRETS_EMIS.pageA, tasks: ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MANAGE"] },
        { id: "100000000000002", name: "Rénovation Ans", access_token: SECRETS_EMIS.pageB, tasks: ["CREATE_CONTENT"] },
      ].slice(0, this.pagesFacebook);
      return envoyer(200, { data: pages, paging: { cursors: { before: "QVFI", after: "QVFJ" } } });
    }
    const pageFb = /^\/meta-graph\/v26\.0\/(\d+)\/(feed|insights|messages)$/.exec(p);
    if (pageFb) {
      const [, page, arete] = pageFb as unknown as [string, string, string];
      const jetonAttendu = page === "100000000000001" ? SECRETS_EMIS.pageA : SECRETS_EMIS.pageB;
      if (this.porteur(a) !== jetonAttendu) return envoyer(400, { error: { message: "Error validating access token: Session has expired.", type: "OAuthException", code: 190, error_subcode: 463, fbtrace_id: "A4" } });
      if (arete === "feed" && a.methode === "POST") {
        const f = this.formulaire(a);
        const id = `${page}_${900 + this.compteur++}`;
        this.publicationsFacebook.unshift({ id, message: f.get("message"), created_time: new Date().toISOString().replace(/\.\d{3}Z$/, "+0000"), reactions: 0, comments: 0, shares: 0 });
        this.effets.push({ type: "facebook_publication", donnees: { id, message: f.get("message"), link: f.get("link") } });
        return envoyer(200, { id });
      }
      if (arete === "feed") {
        const since = Number(a.requete.get("since") ?? 0);
        const until = Number(a.requete.get("until") ?? Number.MAX_SAFE_INTEGER);
        const limite = Number(a.requete.get("limit") ?? 25);
        const decalage = Number(Buffer.from(a.requete.get("after") ?? "MA", "base64url").toString() || 0);
        const toutes = this.publicationsFacebook.filter((x) => {
          const t = Date.parse(String(x["created_time"]).replace("+0000", "Z")) / 1000;
          return t >= since && t < until;
        });
        const tranche = toutes.slice(decalage, decalage + limite);
        const data = tranche.map((x) => {
          const sortie: Record<string, unknown> = { id: x["id"], created_time: x["created_time"] };
          if (x["message"] !== undefined) sortie["message"] = x["message"];
          if (x["link"] !== undefined) sortie["link"] = x["link"];
          sortie["reactions"] = { data: [], summary: { total_count: x["reactions"], viewer_reaction: "NONE" } };
          sortie["comments"] = { data: [], summary: { order: "ranked", total_count: x["comments"], can_comment: true } };
          if (Number(x["shares"]) > 0) sortie["shares"] = { count: x["shares"] };
          return sortie;
        });
        const curseur = (n: number): string => Buffer.from(String(n)).toString("base64url");
        const paging: Record<string, unknown> = { cursors: { before: curseur(decalage), after: curseur(decalage + tranche.length) } };
        // Comme l'API Graph : l'adresse « next » contient le jeton d'accès.
        if (decalage + limite < toutes.length) paging["next"] = `https://graph.facebook.com/v26.0/${page}/feed?access_token=${jetonAttendu}&limit=${limite}&after=${curseur(decalage + limite)}`;
        return envoyer(200, { data, paging });
      }
      if (arete === "insights") {
        const metriques = (a.requete.get("metric") ?? "").split(",");
        const since = Number(a.requete.get("since"));
        const until = Number(a.requete.get("until"));
        const valeurs: { value: number; end_time: string }[] = [];
        for (let t = since; t < until; t += 86_400) valeurs.push({ value: 10, end_time: new Date((t + 86_400) * 1000).toISOString().replace(/\.\d{3}Z$/, "+0000") });
        return envoyer(200, {
          data: metriques.map((m) => ({ name: m, period: "day", values: valeurs, title: `Titre ${m}`, description: `Description ${m}`, id: `${page}/insights/${m}/day` })),
          paging: { previous: `https://graph.facebook.com/v26.0/${page}/insights?access_token=${jetonAttendu}`, next: `https://graph.facebook.com/v26.0/${page}/insights?access_token=${jetonAttendu}` },
        });
      }
      if (arete === "messages") {
        const j = this.json(a);
        const message_id = `m_${this.compteur++}`;
        this.effets.push({ type: "facebook_message", donnees: { ...j } });
        return envoyer(200, { recipient_id: String((j["recipient"] as Record<string, unknown>)?.["id"]), message_id });
      }
    }
    // --- Instagram (connexion Instagram) ----------------------------------------------------------
    if (p === "/instagram-www/oauth/authorize") return this.dialogue(a, envoyer, "code-ig");
    if (p === "/instagram-api/oauth/access_token") {
      const f = this.formulaire(a);
      if (f.get("code") !== "code-ig" || f.get("client_secret") !== IDENTIFIANTS.instagram.clientSecret) return envoyer(400, { error_type: "OAuthException", code: 400, error_message: "Invalid authorization code" });
      return envoyer(200, { data: [{ access_token: "IGcourt", user_id: "17841400000000001", permissions: "instagram_business_basic,instagram_business_content_publish" }] });
    }
    if (p === "/instagram-graph/access_token") return envoyer(200, { access_token: SECRETS_EMIS.instagram, token_type: "bearer", expires_in: 5_183_944 });
    if (p === "/instagram-graph/refresh_access_token") return envoyer(200, { access_token: `${SECRETS_EMIS.instagram}-2`, token_type: "bearer", expires_in: 5_183_944 });
    if (p.startsWith("/instagram-graph/v26.0/")) {
      if (!this.porteur(a).startsWith(SECRETS_EMIS.instagram)) return envoyer(400, { error: { message: "Invalid OAuth access token - Cannot parse access token", type: "OAuthException", code: 190, fbtrace_id: "I1" } });
      const reste = p.slice("/instagram-graph/v26.0/".length);
      if (reste === "me") return envoyer(200, { user_id: "17841400000000001", username: "renovation.liege", id: "26000000000000001" });
      if (reste === "17841400000000001/media" && a.methode === "GET") {
        const since = Number(a.requete.get("since") ?? 0);
        const fins = this.mediasInstagram.filter((m) => Date.parse(String(m["timestamp"]).replace("+0000", "Z")) / 1000 >= since);
        return envoyer(200, { data: fins.map((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined))), paging: { cursors: { before: "QVFIa", after: "QVFIb" } } });
      }
      if (reste === "17841400000000001/media" && a.methode === "POST") return envoyer(200, { id: `cont_${this.compteur++}` });
      if (/^cont_\d+$/.test(reste)) return envoyer(200, { status_code: "FINISHED", id: reste });
      if (reste === "17841400000000001/media_publish") {
        const id = `1790000000009${this.compteur++}`;
        const conteneur = this.formulaire(a).get("creation_id");
        this.effets.push({ type: "instagram_publication", donnees: { id, conteneur } });
        this.mediasInstagram.unshift({ id, caption: "(publiée)", timestamp: new Date().toISOString(), like_count: 0, comments_count: 0 });
        return envoyer(200, { id });
      }
      const insights = /^(\d+)\/insights$/.exec(reste);
      if (insights) {
        if (insights[1] === "404") return envoyer(400, { error: { message: "Unsupported get request. Object with ID '404' does not exist, cannot be loaded due to missing permissions, or does not support this operation.", type: "GraphMethodException", code: 100, error_subcode: 33, fbtrace_id: "I2" } });
        const metriques = (a.requete.get("metric") ?? "").split(",");
        return envoyer(200, { data: metriques.map((m) => ({ name: m, period: "lifetime", values: [{ value: 7 }], title: m, description: `d ${m}`, id: `${insights[1]}/insights/${m}/lifetime` })) });
      }
    }
    // --- LinkedIn ---------------------------------------------------------------------------------
    if (p === "/linkedin-www/oauth/v2/authorization") return this.dialogue(a, envoyer, "code-li");
    if (p === "/linkedin-www/oauth/v2/accessToken") {
      const f = this.formulaire(a);
      if (f.get("client_secret") !== IDENTIFIANTS.linkedin.clientSecret) return envoyer(401, { error: "invalid_client", error_description: "Client authentication failed" });
      if (f.get("grant_type") === "refresh_token") return envoyer(200, { access_token: SECRETS_EMIS.linkedinRafraichi, expires_in: 5_184_000, refresh_token: "AQXrafraichi", refresh_token_expires_in: 30_000_000, scope: "r_organization_social" });
      if (f.get("code") !== "code-li") return envoyer(400, { error: "invalid_request", error_description: "Unable to retrieve access token: authorization code not found" });
      return envoyer(200, { access_token: SECRETS_EMIS.linkedin, expires_in: 5_184_000, refresh_token: "AQXrafraichi", refresh_token_expires_in: 31_536_000, scope: "r_organization_social,rw_organization_admin,w_organization_social" });
    }
    if (p.startsWith("/linkedin-api/rest/")) {
      if (a.entetes["linkedin-version"] !== "202610" || a.entetes["x-restli-protocol-version"] !== "2.0.0") return envoyer(426, { status: 426, code: "NONEXISTENT_VERSION", message: "Requested version is not active" });
      const jeton = this.porteur(a);
      if (jeton !== SECRETS_EMIS.linkedin && jeton !== SECRETS_EMIS.linkedinRafraichi) return envoyer(401, { status: 401, serviceErrorCode: 65601, code: "REVOKED_ACCESS_TOKEN", message: "The token used in the request has been revoked by the user" });
      const reste = p.slice("/linkedin-api/rest/".length);
      if (reste === "organizationAcls") return envoyer(200, { paging: { count: 10, start: 0, links: [] }, elements: [{ roleAssignee: "urn:li:person:abc", state: "APPROVED", role: "ADMINISTRATOR", organization: "urn:li:organization:2414183" }] });
      if (reste === "posts" && a.methode === "GET") {
        const start = Number(a.requete.get("start") ?? 0);
        const count = Number(a.requete.get("count") ?? 10);
        const tri = [...this.publicationsLinkedin].sort((x, y) => Number(y["createdAt"]) - Number(x["createdAt"]));
        const page = tri.slice(start, start + count);
        const links = start + count < tri.length ? [{ type: "application/json", rel: "next", href: `/rest/posts?q=author&start=${start + count}&count=${count}` }] : [];
        return envoyer(200, { paging: { start, count, links }, elements: page });
      }
      if (reste === "posts" && a.methode === "POST") {
        const j = this.json(a);
        const id = `urn:li:share:70000000000000${this.compteur++}`;
        this.publicationsLinkedin.push({ ...j, id, createdAt: Date.now(), lastModifiedAt: Date.now(), publishedAt: Date.now() });
        this.effets.push({ type: "linkedin_publication", donnees: { id, ...j } });
        return envoyer(201, undefined, { "x-restli-id": id });
      }
      if (reste === "organizationalEntityShareStatistics") {
        const entite = a.requete.get("organizationalEntity");
        const intervalles = a.requete.get("timeIntervals");
        if (intervalles) {
          const m = /start:(\d+),end:(\d+)\),timeGranularityType:(DAY|MONTH)/.exec(intervalles);
          if (!m) return envoyer(400, { status: 400, message: "Invalid timeIntervals" });
          const elements = [];
          for (let t = Number(m[1]); t < Number(m[2]); t += 86_400_000) {
            elements.push({ timeRange: { start: t, end: t + 86_400_000 }, totalShareStatistics: { clickCount: 2, engagement: 0.04, likeCount: 1, commentCount: 1, shareCount: 0, impressionCount: 100 }, organizationalEntity: entite });
          }
          return envoyer(200, { paging: { count: 10, start: 0 }, elements });
        }
        const partages = /List\((.*)\)/.exec(a.requete.get("shares") ?? "")?.[1]?.split(",") ?? [];
        return envoyer(200, { elements: partages.slice(0, 1).map((s) => ({ organizationalEntity: entite, share: s, totalShareStatistics: { clickCount: 78, commentCount: 24, engagement: 0.0228, impressionCount: 5287, likeCount: 14, shareCount: 5 } })), paging: { count: 10, links: [], start: 0 } });
      }
    }
    // --- HubSpot ----------------------------------------------------------------------------------
    if (p === "/hubspot-app/oauth/authorize") return this.dialogue(a, envoyer, "code-hs");
    if (p === "/hubspot-api/oauth/v3/token") {
      const f = this.formulaire(a);
      if (f.get("client_secret") !== IDENTIFIANTS.hubspot.clientSecret) return envoyer(400, { status: "BAD_CLIENT_ID", message: "missing or unknown client id" });
      if (f.get("grant_type") === "refresh_token") {
        this.jetonHubspotValide = SECRETS_EMIS.hubspotRafraichi;
        return envoyer(200, { token_type: "bearer", refresh_token: "na1-rafraichissement", access_token: SECRETS_EMIS.hubspotRafraichi, expires_in: 1800 });
      }
      if (f.get("code") !== "code-hs") return envoyer(400, { status: "BAD_AUTH_CODE", message: "auth code not found" });
      return envoyer(200, { token_type: "bearer", refresh_token: "na1-rafraichissement", access_token: SECRETS_EMIS.hubspot, hub_id: 1234567, scopes: ["oauth", "crm.objects.contacts.read"], expires_in: 1800 });
    }
    if (p.startsWith("/hubspot-api/crm/")) {
      if (this.porteur(a) !== this.jetonHubspotValide) return envoyer(401, { status: "error", message: "Authentication credentials not found.", correlationId: "c1", category: "INVALID_AUTHENTICATION" });
      if (p === "/hubspot-api/crm/v3/objects/contacts/search") {
        const j = this.json(a);
        const filtre = ((j["filterGroups"] as { filters: { value: string; highValue: string }[] }[])[0]!.filters[0])!;
        const limite = Number(j["limit"] ?? 10);
        const apres = Number(j["after"] ?? 0);
        const tous = [...this.contactsHubspot.entries()].filter(([, v]) => {
          const t = Date.parse(String(v["createdate"]));
          return t >= Number(filtre.value) && t <= Number(filtre.highValue);
        });
        const page = tous.slice(apres, apres + limite);
        return envoyer(200, {
          total: tous.length,
          results: page.map(([id, v]) => ({ id, properties: { ...v, hs_object_id: id }, createdAt: v["createdate"], updatedAt: v["lastmodifieddate"], archived: false })),
          ...(apres + limite < tous.length ? { paging: { next: { after: String(apres + limite) } } } : {}),
        });
      }
      if (p === "/hubspot-api/crm/v3/objects/deals/search") {
        return envoyer(200, { total: 1, results: [{ id: "5001", properties: { dealname: "Toiture Dupont", amount: "8400", dealstage: "contractsent", pipeline: "default", createdate: "2026-09-05T00:00:00.000Z", closedate: null, hs_lastmodifieddate: "2026-09-05T00:00:00.000Z", hs_object_id: "5001" }, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z", archived: false }] });
      }
      if (p === "/hubspot-api/crm/v4/associations/deals/contacts/batch/read") {
        return envoyer(207, { status: "COMPLETE", results: [{ from: { id: "5001" }, to: [{ toObjectId: 101, associationTypes: [{ category: "HUBSPOT_DEFINED", typeId: 3, label: null }] }] }], startedAt: "x", completedAt: "y" });
      }
      const contact = /^\/hubspot-api\/crm\/v3\/objects\/contacts\/(\d+)$/.exec(p);
      if (contact) {
        const existant = this.contactsHubspot.get(contact[1]!);
        if (!existant) return envoyer(404, { status: "error", message: "resource not found", correlationId: "c2", category: "OBJECT_NOT_FOUND" });
        if (a.methode === "PATCH") {
          const props = (this.json(a)["properties"] ?? {}) as Record<string, string>;
          Object.assign(existant, props);
          this.effets.push({ type: "hubspot_modification", donnees: { id: contact[1], ...props } });
        }
        return envoyer(200, { id: contact[1], properties: existant, createdAt: existant["createdate"], updatedAt: new Date().toISOString(), archived: false });
      }
    }
    // --- Pipedrive -------------------------------------------------------------------------------
    if (p === "/pipedrive-oauth/oauth/authorize") return this.dialogue(a, envoyer, "code-pd");
    if (p === "/pipedrive-oauth/oauth/token") {
      const attendu = `Basic ${Buffer.from(`${IDENTIFIANTS.pipedrive.clientId}:${IDENTIFIANTS.pipedrive.clientSecret}`).toString("base64")}`;
      if (a.entetes.authorization !== attendu) return envoyer(401, { success: false, error: "Unauthorized", error_info: "" });
      return envoyer(200, { access_token: SECRETS_EMIS.pipedrive, token_type: "Bearer", refresh_token: "pd-rafraichissement", scope: "base,deals:full,contacts:full", expires_in: 3599, api_domain: `${this.base}/pipedrive-societe/acme` });
    }
    const pd = /^\/pipedrive-societe\/acme(\/.*)$/.exec(p);
    if (pd) {
      const autorise = this.porteur(a) === SECRETS_EMIS.pipedrive || a.entetes["x-api-token"] === CLE_API_PIPEDRIVE;
      if (!autorise) return envoyer(401, { success: false, error: "unauthorized access", errorCode: 401, error_info: "Please check developers.pipedrive.com" });
      const chemin = pd[1]!;
      if (chemin === "/api/v1/users/me") return envoyer(200, { success: true, data: { id: 1, name: "Jean Test", company_id: 7, company_name: "Acme Rénovation", company_domain: "acme" } });
      if (chemin === "/api/v2/persons" || chemin === "/api/v2/deals") {
        const depuis = Date.parse(a.requete.get("updated_since") ?? "1970-01-01T00:00:00Z");
        const elements =
          chemin === "/api/v2/persons"
            ? [...this.personnesPipedrive.values()]
            : [{ id: 11, title: "Châssis Dupont", owner_id: 1, person_id: 2, org_id: null, pipeline_id: 1, stage_id: 4, value: 5200, currency: "EUR", add_time: "2026-09-03T10:00:00Z", update_time: "2026-09-20T10:00:00Z", stage_change_time: null, is_deleted: false, is_archived: false, status: "won", probability: null, lost_reason: null, visible_to: 3, close_time: "2026-09-20T10:00:00Z", won_time: "2026-09-20T10:00:00Z", lost_time: null, expected_close_date: null, label_ids: [], origin: "API", custom_fields: {} }];
        const filtres = elements.filter((e) => Date.parse(String(e["update_time"])) >= depuis).sort((x, y) => String(x["add_time"]).localeCompare(String(y["add_time"])));
        const limite = Number(a.requete.get("limit") ?? 100);
        // Curseur v2 : on force une petite page (2) pour éprouver le parcours des curseurs.
        const taille = Math.min(limite, 2);
        const decalage = Number(a.requete.get("cursor") ?? 0);
        const page = filtres.slice(decalage, decalage + taille);
        return envoyer(200, { success: true, data: page, additional_data: { next_cursor: decalage + taille < filtres.length ? String(decalage + taille) : null } });
      }
      const personne = /^\/api\/v2\/persons\/(\d+)$/.exec(chemin);
      if (personne) {
        const existante = this.personnesPipedrive.get(Number(personne[1]));
        if (!existante) return envoyer(404, { success: false, error: "Person not found", error_info: "", code: "ERR_NOT_FOUND" });
        if (a.methode === "PATCH") {
          Object.assign(existante, this.json(a));
          this.effets.push({ type: "pipedrive_modification", donnees: { id: Number(personne[1]), ...this.json(a) } });
        }
        return envoyer(200, { success: true, data: existante });
      }
    }
    // --- Teamleader ------------------------------------------------------------------------------
    if (p === "/teamleader-www/oauth2/authorize") return this.dialogue(a, envoyer, "code-tl");
    if (p === "/teamleader-www/oauth2/access_token") {
      const f = this.formulaire(a);
      if (f.get("client_secret") !== IDENTIFIANTS.teamleader.clientSecret) return envoyer(401, { error: "invalid_client", message: "Client authentication failed" });
      if (f.get("grant_type") === "refresh_token") {
        // Jeton de rafraîchissement à usage unique : l'ancien est refusé, un nouveau est émis.
        if (f.get("refresh_token") !== this.refreshTeamleader) return envoyer(400, { error: "invalid_request", message: "The refresh token is invalid." });
        const n = Number(this.refreshTeamleader.split("-")[1]) + 1;
        this.refreshTeamleader = `tlRafraichissement-${n}`;
        return envoyer(200, { token_type: "Bearer", expires_in: 3600, access_token: `tlAcces${n}-SECRET`, refresh_token: this.refreshTeamleader });
      }
      return envoyer(200, { token_type: "Bearer", expires_in: 3600, access_token: SECRETS_EMIS.teamleader, refresh_token: this.refreshTeamleader });
    }
    if (p.startsWith("/teamleader-api/")) {
      if (!/^tlAcces\d+-SECRET$/.test(this.porteur(a))) return envoyer(401, { errors: [{ code: 401, title: "Unauthorized", status: 401 }] });
      const action = p.slice("/teamleader-api/".length);
      if (action === "users.me") return envoyer(200, { data: { id: "66abace2-62af-0836-a927-fe3f44b9b47b", account: { type: "account", id: "a1b2c3d4-0000-4000-8000-000000000001" }, first_name: "Jean", last_name: "Test", email: "jean@exemple.invalid" } });
      if (action === "contacts.list") {
        const j = this.json(a) as { page?: { size?: number; number?: number }; filter?: { updated_since?: string } };
        const taille = j.page?.size ?? 20;
        const numero = j.page?.number ?? 1;
        const depuis = Date.parse(j.filter?.updated_since ?? "1970-01-01T00:00:00+00:00");
        const tous = [...this.contactsTeamleader.values()].filter((c) => Date.parse(String(c["updated_at"])) >= depuis).sort((x, y) => String(x["added_at"]).localeCompare(String(y["added_at"])));
        return envoyer(200, { data: tous.slice((numero - 1) * taille, numero * taille) });
      }
      if (action === "deals.list") {
        return envoyer(200, { data: [{ id: "d0d1d2d3-0000-4000-8000-000000000001", title: "Toiture Martin", summary: null, reference: "2026/1", status: "new", lead: { customer: { type: "contact", id: "cb8da52a-ce89-4bf6-8f7e-8ee6cb85e3b1" }, contact_person: null }, department: { id: "x", type: "department" }, estimated_value: { amount: 9300, currency: "EUR" }, estimated_closing_date: null, estimated_probability: 0.5, weighted_value: { amount: 4650, currency: "EUR" }, current_phase: { id: "p1", type: "dealPhase" }, responsible_user: { id: "u1", type: "user" }, closed_at: null, created_at: "2026-09-08T10:00:00+00:00", updated_at: "2026-09-09T10:00:00+00:00", web_url: "https://focus.teamleader.eu/sale_detail.php?id=1" }] });
      }
      if (action === "contacts.update") {
        const j = this.json(a);
        const c = this.contactsTeamleader.get(String(j["id"]));
        if (!c) return envoyer(404, { errors: [{ code: 404, title: "Contact not found", status: 404 }] });
        Object.assign(c, j);
        this.effets.push({ type: "teamleader_modification", donnees: j });
        return envoyer(204, undefined);
      }
      if (action === "contacts.info") {
        const c = this.contactsTeamleader.get(String(this.json(a)["id"]));
        return c ? envoyer(200, { data: c }) : envoyer(404, { errors: [{ title: "Not found", status: 404 }] });
      }
    }
    envoyer(404, { error: "faux : chemin non imité", chemin: p });
  }
}

type Envoi = (statut: number, json: unknown, entetes?: Record<string, string>) => void;

// --- Odoo : une instance = une origine ---------------------------------------------------------------

export interface LeadOdoo extends Record<string, unknown> {
  id: number;
}

/** Faux Odoo : 19 (JSON-2) ou 17 (JSON-RPC seulement). Base « demo19 » / « demo17 ». */
export class FauxOdoo {
  private serveur: Server | null = null;
  base = "";
  readonly appels: Appel[] = [];
  readonly effets: Record<string, unknown>[] = [];
  readonly leads: LeadOdoo[] = [
    { id: 25, name: "Toiture · Alice Dupont", type: "opportunity", contact_name: "Alice Dupont", partner_name: false, email_from: "alice@exemple.invalid", phone: "+32 4 000 40 01", city: "Liège", zip: "4000", stage_id: [3, "Proposition"], expected_revenue: 8400, create_date: "2026-09-02 09:00:00", write_date: "2026-09-10 09:00:00", date_closed: false, won_status: "pending", active: true, user_id: [2, "Jean"], team_id: [1, "Ventes"], partner_id: false, probability: 40 },
    { id: 26, name: "Murs · Bruno Martin", type: "lead", contact_name: "Bruno Martin", partner_name: false, email_from: "bruno@exemple.invalid", phone: false, city: "Ans", zip: "4430", stage_id: [1, "Nouveau"], expected_revenue: 0, create_date: "2026-09-12 14:00:00", write_date: "2026-09-12 14:00:00", date_closed: false, won_status: "pending", active: true, user_id: false, team_id: false, partner_id: false, probability: 10 },
    { id: 27, name: "Perdu", type: "opportunity", contact_name: "Carla", partner_name: false, email_from: false, phone: false, city: false, zip: false, stage_id: [3, "Proposition"], expected_revenue: 3000, create_date: "2026-09-20 09:00:00", write_date: "2026-09-25 09:00:00", date_closed: false, won_status: "lost", active: false, user_id: false, team_id: false, partner_id: false, probability: 0 },
  ];

  constructor(readonly version: 19 | 17) {}

  demarrer(): Promise<string> {
    return new Promise((resolve) => {
      this.serveur = createServer((req, res) => void this.traiter(req, res));
      this.serveur.listen(0, "127.0.0.1", () => {
        this.base = `http://127.0.0.1:${(this.serveur!.address() as AddressInfo).port}`;
        resolve(this.base);
      });
    });
  }

  arreter(): Promise<void> {
    return new Promise((resolve) => {
      this.serveur?.close(() => resolve());
      this.serveur?.closeAllConnections();
    });
  }

  private champs(): Record<string, { type: string }> {
    const sortie: Record<string, { type: string }> = {};
    for (const c of Object.keys(this.leads[0]!)) sortie[c] = { type: "char" };
    return sortie; // pas de x_etablissement ni de x_metier sur cette instance
  }

  private executer(methode: string, nommes: Record<string, unknown>): { ok: true; valeur: unknown } | { ok: false; statut: number; nom: string; message: string } {
    if (methode === "fields_get") return { ok: true, valeur: this.champs() };
    if (methode === "search_read") {
      const domaine = (nommes["domain"] ?? []) as [string, string, unknown][];
      const champs = (nommes["fields"] ?? []) as string[];
      for (const c of champs) if (!(c in this.champs())) return { ok: false, statut: 422, nom: "builtins.ValueError", message: `Invalid field '${c}' on model 'crm.lead'` };
      let lignes = this.leads.filter((l) =>
        domaine.every(([champ, op, v]) => {
          const x = l[champ];
          if (op === ">=") return String(x) >= String(v);
          if (op === "<") return String(x) < String(v);
          if (op === "=") return x === v;
          return true;
        }),
      );
      if (!domaine.some(([c]) => c === "active")) lignes = lignes.filter((l) => l["active"] === true);
      const offset = Number(nommes["offset"] ?? 0);
      const limit = Number(nommes["limit"] ?? 80);
      return { ok: true, valeur: lignes.slice(offset, offset + limit).map((l) => Object.fromEntries([["id", l.id], ...champs.map((c) => [c, l[c]])])) };
    }
    if (methode === "write") {
      const ids = nommes["ids"] as number[];
      const vals = nommes["vals"] as Record<string, unknown>;
      for (const id of ids) {
        const l = this.leads.find((x) => x.id === id);
        if (!l) return { ok: false, statut: 404, nom: "odoo.exceptions.MissingError", message: "Record does not exist or has been deleted." };
        Object.assign(l, vals);
      }
      this.effets.push({ ids, vals });
      return { ok: true, valeur: true };
    }
    if (methode === "read") {
      const ids = nommes["ids"] as number[];
      const champs = nommes["fields"] as string[];
      return { ok: true, valeur: this.leads.filter((l) => ids.includes(l.id)).map((l) => Object.fromEntries([["id", l.id], ...champs.map((c) => [c, l[c]])])) };
    }
    if (methode === "context_get") return { ok: true, valeur: { lang: "fr_BE", tz: "Europe/Brussels", uid: 2 } };
    return { ok: false, statut: 404, nom: "werkzeug.exceptions.NotFound", message: "Not Found" };
  }

  private async traiter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const morceaux: Buffer[] = [];
    for await (const m of req) morceaux.push(Buffer.isBuffer(m) ? m : Buffer.from(m as string));
    const corps = Buffer.concat(morceaux).toString("utf8");
    const url = new URL(req.url ?? "/", this.base);
    this.appels.push({ methode: req.method ?? "GET", chemin: url.pathname, requete: url.searchParams, entetes: req.headers, corps });
    const envoyer = (statut: number, json: unknown): void => {
      res.writeHead(statut, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(json));
    };
    if (url.pathname === "/web/version") {
      return envoyer(200, this.version === 19 ? { version_info: [19, 0, 0, "final", 0, ""], version: "19.0" } : { version_info: [17, 0, 0, "final", 0, ""], version: "17.0" });
    }
    const json2 = /^\/json\/2\/([a-z._]+)\/([a-z_]+)$/.exec(url.pathname);
    if (json2 && this.version === 19) {
      if (req.headers.authorization !== `bearer ${CLE_API_ODOO}` && req.headers.authorization !== `Bearer ${CLE_API_ODOO}`) {
        return envoyer(401, { name: "werkzeug.exceptions.Unauthorized", message: "Invalid apikey", arguments: ["Invalid apikey", 401], context: {} });
      }
      const r = this.executer(json2[2]!, JSON.parse(corps || "{}") as Record<string, unknown>);
      return r.ok ? envoyer(200, r.valeur) : envoyer(r.statut, { name: r.nom, message: r.message, arguments: [r.message], context: {} });
    }
    if (url.pathname === "/jsonrpc") {
      const j = JSON.parse(corps) as { id: number; params: { service: string; method: string; args: unknown[] } };
      const erreur = (nom: string, message: string) => envoyer(200, { jsonrpc: "2.0", id: j.id, error: { code: 200, message: "Odoo Server Error", data: { name: nom, message, arguments: [message], debug: "" } } });
      if (j.params.service === "common" && j.params.method === "authenticate") {
        const [bd, login, cle] = j.params.args as string[];
        return envoyer(200, { jsonrpc: "2.0", id: j.id, result: bd === "demo17" && login === "jean@exemple.invalid" && cle === CLE_API_ODOO ? 2 : false });
      }
      if (j.params.service === "object" && j.params.method === "execute_kw") {
        const [bd, uid, cle, modele, methode, args, kw] = j.params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
        if (bd !== "demo17" || uid !== 2 || cle !== CLE_API_ODOO) return erreur("odoo.exceptions.AccessDenied", "Access Denied");
        if (modele !== "crm.lead") return erreur("builtins.KeyError", modele);
        const nommes: Record<string, unknown> =
          methode === "search_read" ? { domain: args[0], ...kw } : methode === "write" ? { ids: args[0], vals: args[1] } : methode === "read" ? { ids: args[0], fields: args[1] } : { ...kw };
        const r = this.executer(methode, nommes);
        return r.ok ? envoyer(200, { jsonrpc: "2.0", id: j.id, result: r.valeur }) : erreur(r.nom, r.message);
      }
    }
    envoyer(404, { name: "werkzeug.exceptions.NotFound", message: "Not Found" });
  }
}
