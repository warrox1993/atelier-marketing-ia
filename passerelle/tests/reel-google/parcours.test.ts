// Lot L4 : parcours d'autorisation de bout en bout contre le faux Google, puis appels des cinq outils réels
// par le client MCP officiel du SDK. Vérifie la traduction des paramètres (ce que reçoit le « Google »), la
// réponse rendue telle quelle, l'absence de jeton dans le journal et dans l'état, et la persistance.

import { readFileSync, statSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { EXEMPLES } from "./faux-google.js";
import { appeler, clientMcp, connecter, monter, nettoyer, sansEnveloppe, type Montage, type ResultatConnexion } from "./aide-reel.js";
import { MENTION_DONNEES_TIERCES } from "../../src/outils.js";

const PORTEES: Record<string, string> = {
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  ads: "https://www.googleapis.com/auth/adwords",
  gbp: "https://www.googleapis.com/auth/business.manage",
};

describe("Google réel : autorisation gardée par la passerelle et outils, contre un faux Google", () => {
  let m: Montage;
  const connexions = new Map<string, ResultatConnexion>();
  const clients = new Map<string, Client>();

  beforeAll(async () => {
    m = await monter();
    for (const s of ["gsc", "ga4", "ads", "gbp"]) {
      const c = await connecter(m, s);
      connexions.set(s, c);
      clients.set(s, await clientMcp(m, s, c.jetons.access_token));
    }
  });

  afterAll(async () => {
    for (const c of clients.values()) await c.close();
    await m.arreter();
    nettoyer(m.dossier);
  });

  it("annonce son propre serveur d'autorisation et les portées Google minimales du service", async () => {
    const meta = (await (await fetch(`${m.urlPasserelle}/.well-known/oauth-protected-resource/mcp/gsc`)).json()) as Record<string, unknown>;
    expect(meta["authorization_servers"]).toEqual([m.urlAutorisation]);
    expect(meta["scopes_supported"]).toEqual([PORTEES["gsc"]]);
    const as = (await (await fetch(`${m.urlAutorisation}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    expect(as["issuer"]).toBe(m.urlAutorisation);
    expect(as["registration_endpoint"]).toBe(`${m.urlAutorisation}/oauth/register`);
    expect(as["code_challenge_methods_supported"]).toEqual(["S256"]);
    // Pas d'offline_access : Paperclip ne doit pas l'ajouter aux portées (Google le refuserait).
    expect(as["scopes_supported"]).not.toContain("offline_access");
  });

  it("demande à Google un accès hors ligne, avec consentement, PKCE S256, les seules portées du service et sans `resource`", () => {
    expect(m.faux.demandesAutorisation).toHaveLength(4);
    for (const [i, s] of ["gsc", "ga4", "ads", "gbp"].entries()) {
      const d = m.faux.demandesAutorisation[i]!;
      expect(d["client_id"]).toBe(m.config.clientId);
      expect(d["access_type"]).toBe("offline");
      expect(d["prompt"]).toBe("consent");
      expect(d["code_challenge_method"]).toBe("S256");
      expect(d["scope"]).toBe(PORTEES[s]);
      expect(d["redirect_uri"]).toBe(`${m.urlAutorisation}/oauth/google/retour`);
      expect(d).not.toHaveProperty("resource");
    }
    const echange = m.faux.echangesJeton[0]!;
    expect(echange["grant_type"]).toBe("authorization_code");
    expect(echange["code_verifier"]).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it("rend à Paperclip un code, l'état et l'émetteur (RFC 9207), puis des jetons de la passerelle (pas ceux de Google)", () => {
    const c = connexions.get("gsc")!;
    expect(c.retour.get("state")).toBe("etat-paperclip");
    expect(c.retour.get("iss")).toBe(m.urlAutorisation);
    expect(c.jetons.token_type).toBe("Bearer");
    expect(c.jetons.scope).toBe(PORTEES["gsc"]);
    expect(c.jetons.refresh_token).toBeTruthy();
    expect(m.faux.jetonsEmis).not.toContain(c.jetons.access_token);
    expect(m.faux.jetonsEmis).not.toContain(c.jetons.refresh_token);
  });

  it("expose les mêmes noms d'outils que la démonstration, en lecture seule", async () => {
    const attendus: Record<string, string[]> = {
      gsc: ["atelier_identite", "gsc_requete_performances"],
      ga4: ["atelier_identite", "ga4_rapport"],
      ads: ["atelier_identite", "ads_recherche"],
      gbp: ["atelier_identite", "gbp_avis", "gbp_metriques"],
    };
    for (const [s, noms] of Object.entries(attendus)) {
      const outils = (await clients.get(s)!.listTools()).tools;
      expect(outils.map((o) => o.name)).toEqual(noms);
      for (const o of outils) expect(o.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("gsc_requete_performances : POST searchAnalytics/query, siteUrl encodé, corps fidèle, réponse telle quelle sans mention de démonstration", async () => {
    const args = { siteUrl: "sc-domain:smidjan.be", startDate: "2026-09-01", endDate: "2026-09-30", dimensions: ["date", "query"], rowLimit: 100, dataState: "final" };
    const r = await appeler(clients.get("gsc")!, "gsc_requete_performances", args);
    expect(r.erreur).toBe(false);
    expect(r.texte.startsWith(MENTION_DONNEES_TIERCES)).toBe(true);
    expect(r.donnees["_atelier"]).toEqual({ mode: "reel" });
    expect(sansEnveloppe(r.donnees)).toEqual(EXEMPLES.gsc);
    const q = m.faux.requetes.at(-1)!;
    expect(q.methode).toBe("POST");
    expect(q.chemin).toBe("/webmasters/v3/sites/sc-domain%3Asmidjan.be/searchAnalytics/query");
    expect(q.corps).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30", dimensions: ["date", "query"], rowLimit: 100, dataState: "final" });
    expect(q.entetes["authorization"]).toMatch(/^Bearer ya29\./);
  });

  it("ga4_rapport : POST v1beta/{property}:runReport, corps fidèle, réponse telle quelle", async () => {
    const args = { property: "properties/123456789", dateRanges: [{ startDate: "2023-09-01", endDate: "2023-09-15" }], dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }] };
    const r = await appeler(clients.get("ga4")!, "ga4_rapport", args);
    expect(r.erreur).toBe(false);
    expect(sansEnveloppe(r.donnees)).toEqual(EXEMPLES.ga4);
    const q = m.faux.requetes.at(-1)!;
    expect(q.chemin).toBe("/v1beta/properties/123456789:runReport");
    expect(q.corps).toEqual({ dateRanges: args.dateRanges, dimensions: args.dimensions, metrics: args.metrics });
  });

  it("ads_recherche : v26, tirets retirés, login-customer-id, aucun developer-token, total par searchSettings", async () => {
    const args = { customerId: "123-456-7890", query: "SELECT campaign.id, campaign.name, metrics.clicks FROM campaign LIMIT 10", returnTotalResultsCount: true };
    const r = await appeler(clients.get("ads")!, "ads_recherche", args);
    expect(r.erreur).toBe(false);
    expect(sansEnveloppe(r.donnees)).toEqual(EXEMPLES.ads);
    const q = m.faux.requetes.at(-1)!;
    expect(q.chemin).toBe("/v26/customers/1234567890/googleAds:search");
    expect(q.corps).toEqual({ query: args.query, searchSettings: { returnTotalResultsCount: true } });
    expect(q.entetes["login-customer-id"]).toBe("9876543210");
    expect(q.entetes).not.toHaveProperty("developer-token");
  });

  it("ads_recherche : pageSize autre que 10 000 refusé avant tout appel (l'API ne l'accepte plus)", async () => {
    const avant = m.faux.requetes.length;
    const r = await appeler(clients.get("ads")!, "ads_recherche", { customerId: "1234567890", query: "SELECT campaign.id FROM campaign", pageSize: 50 });
    expect(r.erreur).toBe(true);
    expect(r.donnees["message"]).toContain("LIMIT");
    expect(m.faux.requetes.length).toBe(avant);
  });

  it("gbp_avis : GET v4 …/reviews avec pageSize et orderBy ; avis piégé rendu comme donnée ; debut/fin filtrent la page", async () => {
    const r = await appeler(clients.get("gbp")!, "gbp_avis", { parent: "accounts/111/locations/222", pageSize: 20, orderBy: "updateTime desc" });
    expect(r.erreur).toBe(false);
    expect(sansEnveloppe(r.donnees)).toEqual(EXEMPLES.avis);
    const q = m.faux.requetes.at(-1)!;
    expect(q.methode).toBe("GET");
    expect(q.chemin).toBe("/v4/accounts/111/locations/222/reviews");
    expect(q.query).toEqual({ pageSize: ["20"], orderBy: ["updateTime desc"] });
    const filtre = await appeler(clients.get("gbp")!, "gbp_avis", { parent: "accounts/111/locations/222", debut: "2026-09-01", fin: "2026-09-30" });
    expect(filtre.donnees["reviews"].map((a: { reviewId: string }) => a.reviewId)).toEqual(["r-1"]);
    expect(filtre.donnees["totalReviewCount"]).toBe(2); // chiffre de Google, non recalculé
  });

  it("gbp_avis : la forme courte « locations/<id> » est refusée en réel avec une explication", async () => {
    const r = await appeler(clients.get("gbp")!, "gbp_avis", { parent: "locations/222" });
    expect(r.erreur).toBe(true);
    expect(r.donnees["message"]).toContain("accounts/<compte>/locations/<établissement>");
  });

  it("gbp_metriques : GET …:fetchMultiDailyMetricsTimeSeries, dailyMetrics répété et dailyRange en notation pointée", async () => {
    const args = {
      location: "locations/222",
      dailyMetrics: ["CALL_CLICKS", "WEBSITE_CLICKS"],
      dailyRange: { startDate: { year: 2026, month: 9, day: 1 }, endDate: { year: 2026, month: 9, day: 30 } },
    };
    const r = await appeler(clients.get("gbp")!, "gbp_metriques", args);
    expect(r.erreur).toBe(false);
    expect(sansEnveloppe(r.donnees)).toEqual(EXEMPLES.performance);
    const q = m.faux.requetes.at(-1)!;
    expect(q.chemin).toBe("/v1/locations/222:fetchMultiDailyMetricsTimeSeries");
    expect(q.query).toEqual({
      dailyMetrics: ["CALL_CLICKS", "WEBSITE_CLICKS"],
      "dailyRange.startDate.year": ["2026"],
      "dailyRange.startDate.month": ["9"],
      "dailyRange.startDate.day": ["1"],
      "dailyRange.endDate.year": ["2026"],
      "dailyRange.endDate.month": ["9"],
      "dailyRange.endDate.day": ["30"],
    });
  });

  it("refuse un jeton de la passerelle émis pour un autre service, ou inconnu, sans appeler Google", async () => {
    // Refus au niveau HTTP (401 + WWW-Authenticate), pour TOUTE requête MCP : initialize, tools/list et tools/call.
    const avant = m.faux.requetes.length;
    const brut = (service: string, jeton: string, methode: string, params: unknown) =>
      fetch(`${m.urlPasserelle}/mcp/${service}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: methode, params }),
      });
    const essais: [string, string, string, unknown][] = [
      ["ga4", connexions.get("gsc")!.jetons.access_token, "tools/call", { name: "ga4_rapport", arguments: { property: "properties/1", dateRanges: [{ startDate: "2026-09-01", endDate: "2026-09-02" }], metrics: [{ name: "sessions" }] } }],
      ["ga4", connexions.get("gsc")!.jetons.access_token, "tools/list", {}],
      ["gsc", "jeton-invente", "tools/call", { name: "gsc_requete_performances", arguments: { siteUrl: "sc-domain:smidjan.be", startDate: "2026-09-01", endDate: "2026-09-02" } }],
      ["gsc", "jeton-invente", "tools/list", {}],
      ["gsc", "jeton-invente", "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }],
      // Le jeton de RAFRAÎCHISSEMENT de la passerelle n'est pas un jeton d'accès.
      ["gsc", connexions.get("gsc")!.jetons.refresh_token, "tools/list", {}],
    ];
    for (const [service, jeton, methode, params] of essais) {
      const r = await brut(service, jeton, methode, params);
      expect(r.status, `${service} ${methode}`).toBe(401);
      expect(r.headers.get("www-authenticate"), `${service} ${methode}`).toBe(
        `Bearer resource_metadata="${m.urlPasserelle}/.well-known/oauth-protected-resource/mcp/${service}", error="invalid_token"`,
      );
    }
    // Le bon jeton, sur le bon service, passe toujours.
    expect((await brut("gsc", connexions.get("gsc")!.jetons.access_token, "tools/list", {})).status).toBe(200);
    expect(m.faux.requetes.length).toBe(avant);
  });

  it("rafraîchissement par Paperclip : nouveau couple de jetons, rotation (l'ancien jeton de rafraîchissement ne sert qu'une fois)", async () => {
    const c = connexions.get("gsc")!;
    const demander = (jeton: string) =>
      fetch(`${m.urlAutorisation}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: jeton, client_id: c.clientId, resource: `${m.urlPasserelle}/mcp/gsc` }),
      });
    const r = await demander(c.jetons.refresh_token);
    expect(r.status).toBe(200);
    const neufs = (await r.json()) as { access_token: string; refresh_token: string };
    expect(neufs.access_token).not.toBe(c.jetons.access_token);
    expect((await demander(c.jetons.refresh_token)).status).toBe(400);
    const client = await clientMcp(m, "gsc", neufs.access_token);
    const ok = await appeler(client, "gsc_requete_performances", { siteUrl: "sc-domain:smidjan.be", startDate: "2026-09-01", endDate: "2026-09-02" });
    expect(ok.erreur).toBe(false);
    await client.close();
  });

  it("n'écrit aucun jeton (Google ou passerelle) dans le journal, et l'état sur disque ne contient que des valeurs chiffrées ou des empreintes", () => {
    const journal = m.journal.join("\n");
    const etat = readFileSync(m.config.fichierEtat, "utf8");
    const jetonsPasserelle = [...connexions.values()].flatMap((c) => [c.jetons.access_token, c.jetons.refresh_token]);
    for (const j of [...m.faux.jetonsEmis, ...jetonsPasserelle, m.config.clientSecret]) {
      expect(j.length).toBeGreaterThan(8);
      expect(journal).not.toContain(j);
      expect(etat).not.toContain(j);
    }
    expect(etat).toMatch(/"rafraichissementGoogle":"v1\./);
    expect(statSync(m.config.fichierEtat).mode & 0o777).toBe(0o600);
    expect(journal).toContain("POST /mcp/gsc -> 200");
  });
});
