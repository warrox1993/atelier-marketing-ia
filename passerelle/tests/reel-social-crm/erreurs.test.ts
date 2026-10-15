// Erreurs réelles : limites de débit, jeton expiré (renouvellement, rotation Teamleader), permission manquante
// (App Review), objet introuvable ; et absence de tout secret dans les journaux.

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appeler, clientMcp, connecter, monter, preuve, type Montage } from "./aide.js";
import { CLE_API_ODOO, CLE_API_PIPEDRIVE, IDENTIFIANTS, SECRETS_EMIS } from "./faux-plateformes.js";

let m: Montage;
const jetonsPasserelle: string[] = [];
const clients = new Map<string, Client>();
const SEPT = { debut: "2026-09-01", fin: "2026-09-30" };

beforeAll(async () => {
  m = await monter();
  for (const [service, options] of [["facebook", { choix: 1 }], ["linkedin", {}], ["crm", {}], ["teamleader", {}], ["pipedrive", { formulaire: { societe: "acme", jeton: CLE_API_PIPEDRIVE } }]] as const) {
    const { jetons } = await connecter(m, service, options);
    jetonsPasserelle.push(jetons.access_token, jetons.refresh_token);
    clients.set(service, await clientMcp(m, service, jetons.access_token));
  }
});
afterAll(async () => {
  for (const c of clients.values()) await c.close();
  await m.arreter();
});

describe("limites de débit", () => {
  it("HubSpot 429 avec Retry-After court : une attente, un nouvel essai, puis le résultat", async () => {
    m.faux.injecter("POST /hubspot-api/crm/v3/objects/contacts/search", { statut: 429, entetes: { "retry-after": "2" }, corps: { status: "error", message: "You have reached your ten_secondly_rolling limit.", errorType: "RATE_LIMIT", policyName: "TEN_SECONDLY_ROLLING", correlationId: "r1" } });
    const r = await appeler(clients.get("crm")!, "crm_contacts", SEPT);
    expect(r.erreur, r.texte).toBe(false);
    expect(m.attentes).toContain(2000);
  });

  it("Meta code 4 avec un retour estimé à 5 min : pas d'attente, message clair", async () => {
    m.faux.injecter("GET /meta-graph/v26.0/100000000000002/feed", {
      statut: 403,
      entetes: { "x-business-use-case-usage": JSON.stringify({ "100000000000002": [{ type: "pages", call_count: 100, total_cputime: 30, total_time: 40, estimated_time_to_regain_access: 5 }] }) },
      corps: { error: { message: "(#4) Application request limit reached", type: "OAuthException", is_transient: true, code: 4, fbtrace_id: "L1" } },
    });
    const avant = m.attentes.length;
    const r = await appeler(clients.get("facebook")!, "facebook_publications", { ...SEPT, limit: 5 });
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/limite_debit.*Facebook.*code 4.*réessayer dans 5 min/s);
    expect(m.attentes.length).toBe(avant);
  });

  it("Teamleader 429 (200 requêtes par minute) : date de reprise annoncée", async () => {
    const reprise = new Date(Date.now() + 45_000).toISOString();
    m.faux.injecter("POST /teamleader-api/contacts.list", { statut: 429, entetes: { "x-ratelimit-limit": "200", "x-ratelimit-remaining": "0", "x-ratelimit-reset": reprise }, corps: { errors: [{ title: "Too Many Requests", status: 429 }] } });
    const r = await appeler(clients.get("teamleader")!, "teamleader_contacts", SEPT);
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/limite_debit.*Teamleader.*réessayer dans 4\d s/s);
  });
});

describe("jetons expirés", () => {
  it("HubSpot : 401 → renouvellement par le jeton de rafraîchissement, puis l'appel réussit", async () => {
    m.faux.jetonHubspotValide = SECRETS_EMIS.hubspotRafraichi; // l'ancien jeton d'accès n'est plus accepté
    const r = await appeler(clients.get("crm")!, "crm_contacts", SEPT);
    expect(r.erreur, r.texte).toBe(false);
    const renouvellement = m.faux.appelsVers("POST /hubspot-api/oauth/v3/token").find((a) => new URLSearchParams(a.corps).get("grant_type") === "refresh_token");
    expect(renouvellement).toBeDefined();
  });

  it("Teamleader : chaque renouvellement utilise le NOUVEAU jeton de rafraîchissement (usage unique)", async () => {
    for (let i = 0; i < 2; i++) {
      m.faux.injecter("POST /teamleader-api/contacts.list", { statut: 401, corps: { errors: [{ title: "Unauthorized", status: 401 }] } });
      const r = await appeler(clients.get("teamleader")!, "teamleader_contacts", SEPT);
      expect(r.erreur, r.texte).toBe(false);
    }
    const jetonsUtilises = m.faux.appelsVers("POST /teamleader-www/oauth2/access_token").map((a) => new URLSearchParams(a.corps).get("refresh_token")).filter(Boolean);
    expect(jetonsUtilises).toEqual(["tlRafraichissement-1", "tlRafraichissement-2"]);
  });

  it("Facebook : jeton de Page refusé (190/463), pas de renouvellement possible → reconnecter", async () => {
    m.faux.injecter("GET /meta-graph/v26.0/100000000000002/feed", { statut: 400, corps: { error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190, error_subcode: 463, fbtrace_id: "E1" } } });
    const r = await appeler(clients.get("facebook")!, "facebook_publications", SEPT);
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/jeton_expire.*reconnectez le service dans Paperclip/s);
  });
});

describe("permissions et objets introuvables", () => {
  it("LinkedIn 403 ACCESS_DENIED : accès Community Management ou rôle d'administrateur", async () => {
    m.faux.injecter("GET /linkedin-api/rest/organizationalEntityShareStatistics", { statut: 403, corps: { status: 403, serviceErrorCode: 100, code: "ACCESS_DENIED", message: "Not enough permissions to access: GET /organizationalEntityShareStatistics" } });
    const r = await appeler(clients.get("linkedin")!, "linkedin_statistiques", SEPT);
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/permission_manquante.*Community Management.*administratrice/s);
  });

  it("Facebook (#10) : permission non accordée ou App Review non obtenue", async () => {
    m.faux.injecter("GET /meta-graph/v26.0/100000000000002/insights", { statut: 403, corps: { error: { message: "(#10) This endpoint requires the 'read_insights' permission.", type: "OAuthException", code: 10, fbtrace_id: "P2" } } });
    const r = await appeler(clients.get("facebook")!, "facebook_insights_page", SEPT);
    expect(r.texte).toMatch(/permission_manquante.*read_insights.*App Review de Meta/s);
  });

  it("HubSpot : contact inexistant → introuvable, mutation close sans effet", async () => {
    const args = { contact_id: "999999", properties: { lifecyclestage: "customer" } };
    const r = await appeler(clients.get("crm")!, "crm_modifier_contact", { ...args, preuve_approbation: preuve(m, "crm", "crm_modifier_contact", args) });
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/introuvable.*HubSpot.*999999/s);
  });

  it("Odoo : clé refusée au moment de la connexion → message dans le formulaire, aucun octroi", async () => {
    await expect(connecter(m, "odoo", { formulaire: { instance: m.odoo19.base, cle: "0000000000000000000000000000000000000000", base: "", identifiant: "" } })).rejects.toThrow(/Autorisation Odoo refusée/);
  });
});

describe("journaux", () => {
  it("aucun jeton, secret ni clé n'apparaît dans le journal de la passerelle", () => {
    const journal = m.journal.join("\n");
    expect(journal.length).toBeGreaterThan(0);
    const interdits = [
      ...Object.values(SECRETS_EMIS),
      ...Object.values(IDENTIFIANTS).map((i) => i.clientSecret),
      CLE_API_PIPEDRIVE,
      CLE_API_ODOO,
      "tlAcces2-SECRET",
      "tlRafraichissement",
      "na1-rafraichissement",
      ...jetonsPasserelle,
    ];
    for (const s of interdits) expect(journal, s).not.toContain(s);
    // Le journal ne garde que méthode, chemin et statut : aucun paramètre de requête (codes, états).
    expect(journal).not.toMatch(/[?&](code|state|access_token)=/);
  });
});
