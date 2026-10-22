// Serveur des pages de destination (boucle locale seulement). Sert /p/<slug>, reçoit le formulaire « On vous rappelle »,
// relaie le script et le point de collecte d'Umami (/_s/...). Défenses : CSP stricte, jeton anti-CSRF signé à usage
// unique lié à un cookie, contrôle d'origine, limite de débit, piège à robots (champ caché et délai minimal),
// consentement explicite jamais pré-coché, aucune donnée personnelle conservée ici.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP, type AddressInfo } from "node:net";
import { CRENEAUX, nettoyerTexte } from "./contenu.js";
import { CSS_PAGE, rendreErreur, rendreMerci, rendrePage, type OptionsRendu, type ValeursFormulaire } from "./gabarit.js";
import type { MagasinPages, PageDestination } from "./magasin.js";
import { estSlugValide } from "./magasin.js";
import { cleLimite, emettreJeton, LimiteDebit, tronquerIp, verifierJeton } from "./securite.js";
import type { ClientUmami } from "./umami.js";
import type { DepotAtelier, ResultatDepot, EnvoiVisiteur } from "./depot-atelier.js";

export const CORPS_MAX_OCTETS = 8 * 1024;
export const COLLECTE_MAX_OCTETS = 16 * 1024;
const AGE_COOKIE_S = 2 * 60 * 60;

export interface OptionsServeurPages {
  hote: string;
  port: number;
  magasin: MagasinPages;
  secret: Buffer;
  umami: ClientUmami | null;
  depot: Pick<DepotAtelier, "deposer">;
  /** Hôtes acceptés dans l'en-tête Host (protection contre le rebond DNS). Par défaut : 127.0.0.1 et localhost avec le port. */
  hotesAutorises?: readonly string[];
  indexable?: boolean;
  /** Cookie « Secure » (à activer derrière HTTPS). */
  cookieSecurise?: boolean;
  /** Lire l'adresse du visiteur dans X-Forwarded-For (seulement derrière un proxy de confiance). */
  confianceProxy?: boolean;
  /** Nombre de mandataires de confiance devant le serveur (1 = un seul : Cloudflare ou Caddy). L'adresse retenue est celle à N sauts depuis la DROITE de X-Forwarded-For. */
  sautsProxy?: number;
  journal?: (m: string) => void;
  maintenant?: () => number;
  limiteEnvoi?: LimiteDebit;
  /** Anti-abus des POST refusés (par adresse) : au-delà, les refus deviennent des 429 ; ne bloque jamais un envoi valide. */
  limiteRefus?: LimiteDebit;
  limiteLecture?: LimiteDebit;
  limiteCollecte?: LimiteDebit;
  appel?: typeof fetch;
}

export interface ServeurPages {
  ecouter(): Promise<AddressInfo>;
  arreter(): Promise<void>;
  serveur: Server;
}

const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function entetesCommuns(indexable: boolean): Record<string, string> {
  return {
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "x-frame-options": "DENY",
    ...(indexable ? {} : { "x-robots-tag": "noindex, nofollow" }),
  };
}

function lireCookie(en: IncomingMessage, nom: string): string | undefined {
  const brut = en.headers.cookie;
  if (!brut) return undefined;
  for (const morceau of brut.split(";")) {
    const i = morceau.indexOf("=");
    if (i > 0 && morceau.slice(0, i).trim() === nom) return morceau.slice(i + 1).trim();
  }
  return undefined;
}

async function lireCorps(en: IncomingMessage, max: number): Promise<Buffer | null> {
  const morceaux: Buffer[] = [];
  let total = 0;
  for await (const m of en) {
    const b = m as Buffer;
    total += b.length;
    if (total > max) {
      en.destroy();
      return null;
    }
    morceaux.push(b);
  }
  return Buffer.concat(morceaux);
}

/** Numéro de téléphone normalisé en +CCNNNN ; Belgique par défaut pour un numéro national (0...). Null si invalide. */
export function normaliserTelephone(brut: string): string | null {
  const sep = brut.replace(/[\s.\-()/]/gu, "");
  if (!/^\+?\d+$/u.test(sep)) return null;
  let n = sep;
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  else if (n.startsWith("0")) n = `+32${n.slice(1)}`;
  else if (!n.startsWith("+")) return null;
  const chiffres = n.slice(1);
  if (chiffres.length < 8 || chiffres.length > 15 || chiffres.startsWith("0")) return null;
  return n;
}

const MOTIF_COURRIEL = /^[^\s@<>"',;:()[\]\\]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu;

export interface EnvoiValide {
  nom: string;
  telephone: string;
  courriel: string | null;
  creneau: string;
}
export type ErreursChamps = Partial<Record<"nom" | "telephone" | "courriel" | "creneau" | "consentement", string>>;

/** Valide les champs du visiteur. Un champ invalide donne un message ; rien n'est interprété comme du HTML. */
export function validerEnvoi(champs: URLSearchParams): { ok: true; envoi: EnvoiValide } | { ok: false; erreurs: ErreursChamps; valeurs: ValeursFormulaire } {
  const nom = nettoyerTexte(champs.get("nom") ?? "");
  const telBrut = nettoyerTexte(champs.get("telephone") ?? "");
  const courrielBrut = nettoyerTexte(champs.get("courriel") ?? "");
  const creneau = champs.get("creneau") ?? "peu_importe";
  const erreurs: ErreursChamps = {};
  if (nom.length < 2) erreurs.nom = "Indiquez votre nom (2 caractères au moins).";
  else if (nom.length > 100 || /[<>]/u.test(nom)) erreurs.nom = "Ce nom contient des caractères non admis.";
  const tel = normaliserTelephone(telBrut);
  if (tel === null) erreurs.telephone = "Indiquez un numéro de téléphone valide, par exemple 0470 12 34 56 ou +32 470 12 34 56.";
  if (courrielBrut !== "" && (courrielBrut.length > 254 || !MOTIF_COURRIEL.test(courrielBrut))) erreurs.courriel = "Cette adresse e-mail n'est pas valide (laissez le champ vide si vous ne souhaitez pas en donner).";
  if (!CRENEAUX.some((c) => c.code === creneau)) erreurs.creneau = "Choisissez un des créneaux proposés.";
  if (champs.get("consentement") !== "oui") erreurs.consentement = "Cochez la case pour que nous puissions vous rappeler : sans votre accord, nous ne pouvons pas enregistrer votre demande.";
  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs, valeurs: { nom, telephone: telBrut, courriel: courrielBrut, creneau } };
  return { ok: true, envoi: { nom, telephone: tel as string, courriel: courrielBrut === "" ? null : courrielBrut, creneau } };
}

export function creerServeurPages(o: OptionsServeurPages): ServeurPages {
  const maintenant = o.maintenant ?? Date.now;
  const journal = o.journal ?? ((): void => undefined);
  const indexable = o.indexable ?? false;
  const appel = o.appel ?? fetch;
  const limiteEnvoi = o.limiteEnvoi ?? new LimiteDebit(5, 10 * 60 * 1000, maintenant);
  const limiteRefus = o.limiteRefus ?? new LimiteDebit(30, 10 * 60 * 1000, maintenant);
  const limiteEnvoiPage = new LimiteDebit(60, 60 * 60 * 1000, maintenant);
  const limiteLecture = o.limiteLecture ?? new LimiteDebit(120, 60 * 1000, maintenant);
  const limiteCollecte = o.limiteCollecte ?? new LimiteDebit(120, 60 * 1000, maintenant);
  const communs = entetesCommuns(indexable);

  let siteUmami: string | null = null;
  let siteUmamiEssaiA = 0;
  async function identifiantSite(): Promise<string | null> {
    if (!o.umami) return null;
    if (siteUmami) return siteUmami;
    if (maintenant() - siteUmamiEssaiA < 30_000) return null;
    siteUmamiEssaiA = maintenant();
    try {
      siteUmami = await o.umami.assurerSite();
    } catch (e) {
      journal(`Umami indisponible : ${e instanceof Error ? e.message : String(e)}`);
    }
    return siteUmami;
  }

  let scriptCache: { texte: string; jusqua: number } | null = null;

  function repondre(res: ServerResponse, statut: number, corps: string, type = "text/html; charset=utf-8", extra: Record<string, string | string[]> = {}): void {
    res.writeHead(statut, { ...communs, "content-type": type, "cache-control": "no-store", ...extra });
    res.end(corps);
  }
  const erreurPage = (res: ServerResponse, statut: number, titre: string, message: string, extra: Record<string, string> = {}): void => repondre(res, statut, rendreErreur(titre, message), undefined, extra);

  /**
   * Adresse du visiteur. Derrière un proxy de confiance, X-Forwarded-For se lit DE DROITE À GAUCHE : chaque mandataire ajoute à droite
   * l'adresse qu'il a vue, la valeur de gauche est fournie par le client et ne vaut rien. On prend celle à `sautsProxy` rangs depuis la droite ;
   * valeur absente, hors liste ou qui n'est pas une adresse IP : adresse de la connexion.
   */
  const sauts = Number.isInteger(o.sautsProxy) && (o.sautsProxy as number) >= 1 ? (o.sautsProxy as number) : 1;
  function adresseVisiteur(en: IncomingMessage): string {
    if (o.confianceProxy) {
      const x = en.headers["x-forwarded-for"];
      const valeurs = (Array.isArray(x) ? x.join(",") : (x ?? "")).split(",").map((v) => v.trim());
      const choisie = valeurs.length >= sauts ? valeurs[valeurs.length - sauts] : undefined;
      if (choisie && isIP(choisie) !== 0) return choisie;
    }
    return en.socket.remoteAddress ?? "inconnue";
  }

  const hotes = new Set((o.hotesAutorises ?? []).map((h) => h.toLowerCase()));
  function hoteAutorise(en: IncomingMessage): boolean {
    const h = en.headers.host?.toLowerCase();
    if (!h) return false;
    if (hotes.size > 0) return hotes.has(h);
    const port = (en.socket.localPort ?? o.port).toString();
    return h === `127.0.0.1:${port}` || h === `localhost:${port}` || h === `[::1]:${port}`;
  }

  /** Même origine exigée pour tout envoi : Origin (ou Sec-Fetch-Site) doit désigner ce serveur. */
  function memeOrigine(en: IncomingMessage): boolean {
    const origine = en.headers.origin;
    if (origine !== undefined) {
      try {
        return new URL(origine).host.toLowerCase() === en.headers.host?.toLowerCase();
      } catch {
        return false;
      }
    }
    const site = en.headers["sec-fetch-site"];
    return site === undefined || site === "same-origin" || site === "none";
  }

  function pageAvecJeton(res: ServerResponse, statut: number, page: PageDestination, rendu: Omit<OptionsRendu, "jeton" | "siteUmami" | "indexable">, site: string | null): void {
    const jeton = emettreJeton(o.secret, page.slug, maintenant());
    const cookie = `csrf=${jeton.nonce}; Path=/p/${page.slug}; HttpOnly; SameSite=Strict; Max-Age=${AGE_COOKIE_S}${o.cookieSecurise ? "; Secure" : ""}`;
    repondre(res, statut, rendrePage(page, { ...rendu, jeton: jeton.champ, siteUmami: site, indexable }), undefined, { "set-cookie": cookie });
  }

  async function traiterEnvoi(en: IncomingMessage, res: ServerResponse, page: PageDestination, ip: string): Promise<void> {
    // Limites : seuls les refus consomment `limiteRefus` (par adresse, large) ; les limites d'envoi (par adresse, par page) ne se consomment
    // qu'APRÈS un jeton valide, un délai respecté et un formulaire valide. Des POST invalides ne peuvent donc jamais bloquer les envois valides.
    const refus = (): boolean => !limiteRefus.autoriser(`x:${cleLimite(ip)}`);
    const tropDeRefus = (): void => erreurPage(res, 429, "Trop de demandes", "Merci de patienter quelques minutes avant de renvoyer le formulaire.", { "retry-after": "600" });
    if (!memeOrigine(en)) return refus() ? tropDeRefus() : erreurPage(res, 403, "Envoi refusé", "Cette demande ne vient pas de cette page.");
    if (!/^application\/x-www-form-urlencoded(?:;|$)/iu.test(en.headers["content-type"] ?? "")) return refus() ? tropDeRefus() : erreurPage(res, 415, "Envoi refusé", "Format de formulaire non pris en charge.");
    const corps = await lireCorps(en, CORPS_MAX_OCTETS);
    if (corps === null) return refus() ? tropDeRefus() : erreurPage(res, 413, "Envoi refusé", "La demande est trop volumineuse.", { connection: "close" });
    const champs = new URLSearchParams(corps.toString("utf8"));
    const site = await identifiantSite();
    // Piège 1 : champ caché rempli = robot. On répond comme un succès, sans rien enregistrer.
    if ((champs.get("site_web") ?? "") !== "") {
      // Les pièges comptent comme des refus : au-delà du plafond, 429 sans journal (pas de saturation de journald).
      if (refus()) return tropDeRefus();
      journal(`piège à robots (champ caché) sur ${page.slug}`);
      return redirigerMerci(res, page);
    }
    const verdict = verifierJeton(o.secret, page.slug, champs.get("jeton") ?? undefined, lireCookie(en, "csrf"), maintenant());
    if (!verdict.ok) {
      // Piège 2 : envoi plus rapide que 2 s après l'affichage = robot, même réponse silencieuse.
      if (verdict.raison === "trop_rapide") {
        if (refus()) return tropDeRefus();
        journal(`piège à robots (délai) sur ${page.slug}`);
        return redirigerMerci(res, page);
      }
      journal(`jeton refusé (${verdict.raison}) sur ${page.slug}`);
      if (refus()) return tropDeRefus();
      const v = validerEnvoi(champs);
      const valeurs = v.ok ? { nom: v.envoi.nom, telephone: v.envoi.telephone, courriel: v.envoi.courriel ?? "", creneau: v.envoi.creneau } : v.valeurs;
      return pageAvecJeton(res, 403, page, { valeurs, erreurs: { formulaire: "Le formulaire a expiré ou n'est plus valide. Vérifiez vos informations, cochez la case de consentement puis renvoyez-le." } }, site);
    }
    const v = validerEnvoi(champs);
    if (!v.ok && refus()) return tropDeRefus();
    if (!v.ok) return pageAvecJeton(res, 422, page, { erreurs: v.erreurs, valeurs: v.valeurs }, site);
    if (!limiteEnvoi.autoriser(`e:${cleLimite(ip)}`) || !limiteEnvoiPage.autoriser(`p:${page.slug}`)) return erreurPage(res, 429, "Trop de demandes", "Merci de patienter quelques minutes avant de renvoyer le formulaire.", { "retry-after": "600" });
    const envoi = o.magasin.reserverEnvoi(page.slug, verdict.nonce, new Date(maintenant()));
    if (envoi === null) return redirigerMerci(res, page); // double clic ou rejeu : déjà enregistré
    const libelle = CRENEAUX.find((c) => c.code === v.envoi.creneau)?.libelle ?? v.envoi.creneau;
    const visiteur: EnvoiVisiteur = {
      nom: v.envoi.nom, telephone: v.envoi.telephone, courriel: v.envoi.courriel, creneau: v.envoi.creneau, libelleCreneau: libelle,
      envoiId: envoi.id, ipTronquee: tronquerIp(ip), recuLe: new Date(maintenant()),
    };
    let depot: ResultatDepot;
    try {
      depot = await o.depot.deposer(page, visiteur);
    } catch (e) {
      o.magasin.abandonnerEnvoi(envoi.id);
      journal(`dépôt dans l'atelier impossible pour ${page.slug} : ${e instanceof Error ? e.message : String(e)}`);
      return pageAvecJeton(
        res, 503, page,
        { valeurs: { nom: v.envoi.nom, telephone: v.envoi.telephone, courriel: v.envoi.courriel ?? "", creneau: v.envoi.creneau }, erreurs: { formulaire: "Le service est momentanément indisponible : vos informations n'ont pas été enregistrées. Réessayez dans quelques minutes." } },
        site,
      );
    }
    o.magasin.marquerEnvoi(envoi.id, "prospect_cree", depot.prospectId);
    journal(`envoi enregistré pour ${page.slug} (prospect ${depot.prospectId}${depot.tacheErreur ? `, tâche non créée : ${depot.tacheErreur}` : ""})`);
    return redirigerMerci(res, page);
  }

  function redirigerMerci(res: ServerResponse, page: PageDestination): void {
    res.writeHead(303, { ...communs, location: `/p/${page.slug}/merci`, "cache-control": "no-store" });
    res.end();
  }

  async function relayerScript(res: ServerResponse): Promise<void> {
    if (!o.umami) return repondre(res, 404, "", "text/plain; charset=utf-8");
    if (!scriptCache || scriptCache.jusqua < maintenant()) {
      try {
        const rep = await appel(`${o.umami.url}/script.js`, { signal: AbortSignal.timeout(10_000), redirect: "error" });
        if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
        scriptCache = { texte: await rep.text(), jusqua: maintenant() + 10 * 60 * 1000 };
      } catch (e) {
        journal(`script Umami indisponible : ${e instanceof Error ? e.message : String(e)}`);
        return repondre(res, 502, "", "text/plain; charset=utf-8");
      }
    }
    repondre(res, 200, scriptCache.texte, "application/javascript; charset=utf-8", { "cache-control": "public, max-age=3600" });
  }

  async function relayerCollecte(en: IncomingMessage, res: ServerResponse, ip: string): Promise<void> {
    if (!o.umami) return repondre(res, 204, "", "text/plain; charset=utf-8");
    const corps = await lireCorps(en, COLLECTE_MAX_OCTETS);
    if (corps === null) return repondre(res, 413, "", "text/plain; charset=utf-8", { connection: "close" });
    const site = await identifiantSite();
    // Seul le site des pages de destination est alimenté : une collecte visant un autre site est refusée.
    try {
      const j = JSON.parse(corps.toString("utf8")) as { payload?: { website?: unknown } };
      if (!site || j.payload?.website !== site) return repondre(res, 403, "", "text/plain; charset=utf-8");
    } catch {
      return repondre(res, 400, "", "text/plain; charset=utf-8");
    }
    try {
      const rep = await appel(`${o.umami.url}/api/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": String(en.headers["user-agent"] ?? ""), "x-forwarded-for": ip },
        body: new Uint8Array(corps),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      repondre(res, rep.status === 200 ? 200 : 204, await rep.text(), rep.headers.get("content-type") ?? "application/json");
    } catch (e) {
      journal(`collecte Umami impossible : ${e instanceof Error ? e.message : String(e)}`);
      repondre(res, 204, "", "text/plain; charset=utf-8");
    }
  }

  async function traiter(en: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hoteAutorise(en)) return erreurPage(res, 421, "Adresse non reconnue", "Cette adresse n'est pas servie ici.");
    const url = new URL(en.url ?? "/", "http://pages.local");
    const methode = en.method ?? "GET";
    const ip = adresseVisiteur(en);
    const chemin = url.pathname;

    if (chemin === "/sante") return repondre(res, 200, JSON.stringify({ ok: true }), "application/json");
    if (chemin === "/_a/page.css") {
      if (methode !== "GET" && methode !== "HEAD") return erreurPage(res, 405, "Méthode non permise", "Cette adresse se lit seulement.", { allow: "GET, HEAD" });
      return repondre(res, 200, CSS_PAGE, "text/css; charset=utf-8", { "cache-control": "public, max-age=3600" });
    }
    if (chemin === "/_s/script.js") {
      if (!limiteCollecte.autoriser(`s:${ip}`)) return repondre(res, 429, "", "text/plain; charset=utf-8", { "retry-after": "60" });
      return relayerScript(res);
    }
    if (chemin === "/_s/api/send") {
      if (methode !== "POST") return repondre(res, 405, "", "text/plain; charset=utf-8", { allow: "POST" });
      if (!limiteCollecte.autoriser(`c:${ip}`)) return repondre(res, 429, "", "text/plain; charset=utf-8", { "retry-after": "60" });
      if (!memeOrigine(en)) return repondre(res, 403, "", "text/plain; charset=utf-8");
      return relayerCollecte(en, res, ip);
    }

    const m = /^\/p\/([a-z0-9-]+)(\/merci)?$/u.exec(chemin);
    if (!m || !estSlugValide(m[1] as string)) return erreurPage(res, 404, "Page introuvable", "Cette page n'existe pas ou n'est plus en ligne.");
    const slug = m[1] as string;
    const merci = m[2] !== undefined;
    if (methode === "POST" && !merci) {
      const page = o.magasin.lirePage(slug);
      if (!page) return erreurPage(res, 404, "Page introuvable", "Cette page n'existe pas ou n'est plus en ligne.");
      return traiterEnvoi(en, res, page, ip);
    }
    if (methode !== "GET" && methode !== "HEAD") return erreurPage(res, 405, "Méthode non permise", "Cette page se lit seulement.", { allow: "GET, HEAD" });
    if (!limiteLecture.autoriser(`l:${ip}`)) return erreurPage(res, 429, "Trop de demandes", "Merci de patienter une minute.", { "retry-after": "60" });
    const page = o.magasin.lirePage(slug);
    if (!page) return erreurPage(res, 404, "Page introuvable", "Cette page n'existe pas ou n'est plus en ligne.");
    const site = await identifiantSite();
    if (merci) return repondre(res, 200, rendreMerci(page, { siteUmami: site, indexable }));
    return pageAvecJeton(res, 200, page, {}, site);
  }

  const serveur = createServer((en, res) => {
    traiter(en, res).catch((e: unknown) => {
      journal(`erreur interne : ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) erreurPage(res, 500, "Erreur", "Une erreur est survenue. Réessayez dans quelques instants.");
      else res.end();
    });
  });
  serveur.requestTimeout = 15_000;
  serveur.headersTimeout = 10_000;
  serveur.keepAliveTimeout = 5_000;

  return {
    serveur,
    ecouter: () =>
      new Promise((resolve, reject) => {
        serveur.once("error", reject);
        serveur.listen(o.port, o.hote, () => resolve(serveur.address() as AddressInfo));
      }),
    arreter: () => new Promise((resolve) => { serveur.closeAllConnections(); serveur.close(() => resolve()); }),
  };
}
