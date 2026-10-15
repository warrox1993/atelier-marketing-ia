// Lot L4 : erreurs réelles de Google, jouées par le faux Google (formes documentées, voir faux-google.ts).
// Quota (429, attente bornée, un seul nouvel essai), jeton expiré (rafraîchissement), accès retiré,
// droits insuffisants, propriété introuvable, API non activée, accès Ads du projet ; jamais de réessai aveugle.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ERREUR_404,
  ERREUR_429,
  ERREUR_ADS_PERMISSION,
  ERREUR_ADS_PROJET,
  ERREUR_API_NON_ACTIVEE,
  ERREUR_GA4_403,
  ERREUR_GSC_403,
} from "./faux-google.js";
import { appeler, clientMcp, connecter, monter, nettoyer, type Montage } from "./aide-reel.js";
import { AutorisationGoogle } from "../../src/reel/google/autorisation.js";

const GSC = { siteUrl: "sc-domain:smidjan.be", startDate: "2026-09-01", endDate: "2026-09-30" };
const GA4 = { property: "properties/123", dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-30" }], metrics: [{ name: "sessions" }] };
const ADS = { customerId: "1234567890", query: "SELECT campaign.id FROM campaign" };

describe("Google réel : erreurs", () => {
  let m: Montage;
  let gsc: Client;
  let ga4: Client;
  let ads: Client;
  let jetonAds: string;

  beforeAll(async () => {
    m = await monter();
    gsc = await clientMcp(m, "gsc", (await connecter(m, "gsc")).jetons.access_token);
    ga4 = await clientMcp(m, "ga4", (await connecter(m, "ga4")).jetons.access_token);
    jetonAds = (await connecter(m, "ads")).jetons.access_token;
    ads = await clientMcp(m, "ads", jetonAds);
  });

  afterAll(async () => {
    for (const c of [gsc, ga4, ads]) await c.close();
    await m.arreter();
    nettoyer(m.dossier);
  });

  beforeEach(() => {
    m.attentes.length = 0;
  });

  const appelsGoogle = (prefixe: string): number => m.faux.requetes.filter((r) => r.chemin.startsWith(prefixe)).length;

  it("429 avec délai annoncé court : attend ce délai, réessaie UNE fois, réussit", async () => {
    m.faux.forcer("/webmasters", { statut: 429, corps: ERREUR_429 });
    const avant = appelsGoogle("/webmasters");
    const r = await appeler(gsc, "gsc_requete_performances", GSC);
    expect(r.erreur).toBe(false);
    expect(m.attentes).toEqual([1000]);
    expect(appelsGoogle("/webmasters") - avant).toBe(2);
  });

  it("429 deux fois de suite : une seule attente, puis message de quota avec le délai", async () => {
    m.faux.forcer("/webmasters", { statut: 429, corps: ERREUR_429 }, { statut: 429, corps: ERREUR_429 });
    const avant = appelsGoogle("/webmasters");
    const r = await appeler(gsc, "gsc_requete_performances", GSC);
    expect(r.erreur).toBe(true);
    expect(r.donnees["message"]).toMatch(/^Quota Google atteint pour la propriété Search Console sc-domain:smidjan\.be : réessayer dans 1 s\./);
    expect(m.attentes).toEqual([1000]);
    expect(appelsGoogle("/webmasters") - avant).toBe(2);
  });

  it("429 avec Retry-After au-delà de la borne (10 s) : aucune attente, aucun nouvel essai", async () => {
    m.faux.forcer("/v1beta", { statut: 429, corps: { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }, entetes: { "retry-after": "3600" } });
    const avant = appelsGoogle("/v1beta");
    const r = await appeler(ga4, "ga4_rapport", GA4);
    expect(r.erreur).toBe(true);
    expect(r.donnees["message"]).toContain("réessayer dans 3600 s");
    expect(m.attentes).toEqual([]);
    expect(appelsGoogle("/v1beta") - avant).toBe(1);
  });

  it("429 sans délai annoncé : pas de réessai aveugle", async () => {
    m.faux.forcer("/v1beta", { statut: 429, corps: { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } } });
    const avant = appelsGoogle("/v1beta");
    const r = await appeler(ga4, "ga4_rapport", GA4);
    expect(r.donnees["message"]).toContain("réessayer plus tard");
    expect(appelsGoogle("/v1beta") - avant).toBe(1);
  });

  it("jeton d'accès Google expiré (401) : rafraîchi par le jeton de rafraîchissement, requête rejouée une fois", async () => {
    m.faux.expirerAcces();
    const avantJetons = m.faux.echangesJeton.filter((e) => e["grant_type"] === "refresh_token").length;
    const r = await appeler(gsc, "gsc_requete_performances", GSC);
    expect(r.erreur).toBe(false);
    expect(m.faux.echangesJeton.filter((e) => e["grant_type"] === "refresh_token").length - avantJetons).toBe(1);
    const dernier = m.faux.echangesJeton.at(-1)!;
    expect(dernier["client_secret"]).toBe(m.config.clientSecret);
    expect(dernier).not.toHaveProperty("resource");
  });

  it("403 Search Console (ancien format) : « la propriété n'est pas accessible avec ce compte », sans réessai", async () => {
    m.faux.forcer("/webmasters", { statut: 403, corps: ERREUR_GSC_403 });
    const avant = appelsGoogle("/webmasters");
    const r = await appeler(gsc, "gsc_requete_performances", { ...GSC, siteUrl: "sc-domain:inconnu.example" });
    expect(r.erreur).toBe(true);
    expect(r.donnees["erreur"]).toBe("echec_outil");
    expect(r.donnees["message"]).toMatch(/^La propriété n'est pas accessible avec ce compte : la propriété Search Console sc-domain:inconnu\.example\./);
    expect(appelsGoogle("/webmasters") - avant).toBe(1);
  });

  it("403 GA4 PERMISSION_DENIED : même message clair", async () => {
    m.faux.forcer("/v1beta", { statut: 403, corps: ERREUR_GA4_403 });
    const r = await appeler(ga4, "ga4_rapport", GA4);
    expect(r.donnees["message"]).toMatch(/^La propriété n'est pas accessible avec ce compte : la propriété GA4 properties\/123\./);
  });

  it("403 SERVICE_DISABLED : l'API n'est pas activée dans le projet Google Cloud", async () => {
    m.faux.forcer("/v1beta", { statut: 403, corps: ERREUR_API_NON_ACTIVEE });
    const r = await appeler(ga4, "ga4_rapport", GA4);
    expect(r.donnees["message"]).toMatch(/^L'API Google n'est pas activée dans le projet Google Cloud/);
  });

  it("404 : propriété introuvable", async () => {
    m.faux.forcer("/v1beta", { statut: 404, corps: ERREUR_404 });
    const r = await appeler(ga4, "ga4_rapport", { ...GA4, property: "properties/999" });
    expect(r.donnees["message"]).toMatch(/^Propriété introuvable : la propriété GA4 properties\/999\./);
  });

  it("Google Ads USER_PERMISSION_DENIED : la propriété n'est pas accessible ; CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION : niveau d'accès à demander", async () => {
    m.faux.forcer("/v26", { statut: 403, corps: ERREUR_ADS_PERMISSION }, { statut: 403, corps: ERREUR_ADS_PROJET });
    const r1 = await appeler(ads, "ads_recherche", ADS);
    expect(r1.donnees["message"]).toMatch(/^La propriété n'est pas accessible avec ce compte : le compte Google Ads 1234567890\./);
    const r2 = await appeler(ads, "ads_recherche", ADS);
    expect(r2.donnees["message"]).toMatch(/^Le projet Google Cloud de l'opérateur n'a pas d'accès Google Ads de production/);
  });

  it("accès retiré chez Google (invalid_grant au rafraîchissement) : message « reconnectez », octroi supprimé", async () => {
    m.faux.revoquer();
    const r = await appeler(ads, "ads_recherche", ADS);
    expect(r.erreur).toBe(true);
    expect(r.donnees["message"]).toContain("L'autorisation Google a été retirée ou a expiré : reconnectez le service dans Paperclip (Apps).");
    // L'octroi n'existe plus : toute nouvelle requête MCP est refusée dès le niveau HTTP (401, invalid_token, ce
    // que voit la santé de la connexion dans Paperclip), sans solliciter Google.
    const avant = m.faux.echangesJeton.length;
    const avantApi = m.faux.requetes.length;
    for (const methode of ["tools/call", "tools/list"]) {
      const r2 = await fetch(`${m.urlPasserelle}/mcp/ads`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${jetonAds}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: methode, params: methode === "tools/call" ? { name: "ads_recherche", arguments: ADS } : {} }),
      });
      expect(r2.status, methode).toBe(401);
      expect(r2.headers.get("www-authenticate"), methode).toContain('error="invalid_token"');
    }
    expect(m.faux.echangesJeton.length).toBe(avant);
    expect(m.faux.requetes.length).toBe(avantApi);
  });
});

describe("Google réel : consentement refusé ou incomplet", () => {
  it("« Refuser » chez Google : Paperclip reçoit error=access_denied avec son état", async () => {
    const m = await monter({ refuserConsentement: true });
    try {
      const c = await connecter(m, "gsc", { attendreErreur: true });
      expect(c.retour.get("error")).toBe("access_denied");
      expect(c.retour.get("state")).toBe("etat-paperclip");
      expect(c.retour.get("code")).toBeNull();
    } finally {
      await m.arreter();
      nettoyer(m.dossier);
    }
  });

  it("portée décochée sur l'écran granulaire : aucune connexion, explication", async () => {
    const m = await monter({ porteesAccordees: ["openid"] });
    try {
      const c = await connecter(m, "gsc", { attendreErreur: true });
      expect(c.retour.get("error")).toBe("access_denied");
      expect(c.retour.get("error_description")).toContain("webmasters.readonly");
    } finally {
      await m.arreter();
      nettoyer(m.dossier);
    }
  });

  it("portée demandée hors du service : refusée (invalid_scope) avant tout passage chez Google", async () => {
    const m = await monter();
    try {
      const c = await connecter(m, "gsc", { attendreErreur: true, scope: "https://www.googleapis.com/auth/webmasters" }).catch((e: Error) => e);
      // La passerelle redirige directement vers Paperclip : la première redirection n'est pas Google.
      expect(c).toBeInstanceOf(Error);
      expect(m.faux.demandesAutorisation).toHaveLength(0);
    } finally {
      await m.arreter();
      nettoyer(m.dossier);
    }
  });
});

describe("Google réel : redémarrage", () => {
  it("un nouveau processus relit l'octroi chiffré : le jeton de la passerelle reste valable et Google est rappelé par rafraîchissement", async () => {
    const m = await monter();
    try {
      const c = await connecter(m, "gsc");
      // Nouvelle instance sur le même fichier d'état : aucun jeton d'accès Google en mémoire.
      const relue = new AutorisationGoogle({
        config: m.config,
        urlPasserelle: () => m.urlPasserelle,
        porteesParService: new Map([["gsc", ["https://www.googleapis.com/auth/webmasters.readonly"]]]),
      });
      const avant = m.faux.echangesJeton.filter((e) => e["grant_type"] === "refresh_token").length;
      const jeton = await relue.jetonGoogle(c.jetons.access_token, "gsc");
      expect(jeton).toMatch(/^ya29\./);
      expect(m.faux.echangesJeton.filter((e) => e["grant_type"] === "refresh_token").length - avant).toBe(1);
      // Une autre clé ne déchiffre pas l'octroi.
      const mauvaiseCle = new AutorisationGoogle({
        config: { ...m.config, cle: Buffer.alloc(32, 9) },
        urlPasserelle: () => m.urlPasserelle,
        porteesParService: new Map([["gsc", ["https://www.googleapis.com/auth/webmasters.readonly"]]]),
      });
      await expect(mauvaiseCle.jetonGoogle(c.jetons.access_token, "gsc")).rejects.toThrow();
    } finally {
      await m.arreter();
      nettoyer(m.dossier);
    }
  });
});
