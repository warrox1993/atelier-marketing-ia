// Parcours « en un clic » de chaque plateforme, puis lectures normalisées aux formes L7, contre les faux serveurs.

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { donnees as donneesDemo } from "../social-crm/aide.js";
import { appeler, clientMcp, connecter, forme, monter, type Montage } from "./aide.js";
import { CLE_API_ODOO, CLE_API_PIPEDRIVE, SECRETS_EMIS } from "./faux-plateformes.js";

let m: Montage;
beforeAll(async () => {
  m = await monter();
});
afterAll(async () => {
  await m.arreter();
});

/** Les clés de la réponse réelle sont celles de L7 (mêmes objets imbriqués), valeurs ignorées. */
async function memeForme(service: string, outil: string, argsDemo: Record<string, unknown>, reel: Record<string, unknown>): Promise<void> {
  const demo = await donneesDemo(service, outil, argsDemo);
  expect(forme(reel)).toEqual(forme(demo));
}

const SEPT = { debut: "2026-09-01", fin: "2026-09-30" };

describe("métadonnées et refus d'accès", () => {
  it("annonce le serveur d'autorisation de la passerelle et refuse un appel sans jeton", async () => {
    const meta = (await (await fetch(`${m.urlPasserelle}/.well-known/oauth-protected-resource/mcp/facebook`)).json()) as { authorization_servers: string[] };
    expect(meta.authorization_servers).toEqual([m.social.autorisation.urlBase()]);
    const as = await (await fetch(`${meta.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({ code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], grant_types_supported: ["authorization_code", "refresh_token"] });
    const r = await fetch(`${m.urlPasserelle}/mcp/facebook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(401);
  });

  it("un jeton inventé ou destiné à un autre service est refusé dès le niveau HTTP (401), pour toute requête MCP", async () => {
    const { jetons } = await connecter(m, "crm");
    const brut = (service: string, jeton: string, methode: string, params: unknown) =>
      fetch(`${m.urlPasserelle}/mcp/${service}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: methode, params }),
      });
    const avant = m.faux.appels.length;
    for (const [service, jeton, methode, params] of [
      ["teamleader", jetons.access_token, "tools/call", { name: "teamleader_contacts", arguments: SEPT }],
      ["teamleader", jetons.access_token, "tools/list", {}],
      ["crm", "jeton-invente", "tools/list", {}],
      ["crm", jetons.refresh_token, "tools/list", {}],
      // Une mutation sans preuve ne répond plus « préparée » à un porteur de jeton invalide.
      ["crm", "jeton-invente", "tools/call", { name: "crm_modifier_contact", arguments: { contact_id: "1", properties: { firstname: "x" } } }],
    ] as [string, string, string, unknown][]) {
      const r = await brut(service, jeton, methode, params);
      expect(r.status, `${service} ${methode}`).toBe(401);
      expect(r.headers.get("www-authenticate"), `${service} ${methode}`).toBe(
        `Bearer resource_metadata="${m.urlPasserelle}/.well-known/oauth-protected-resource/mcp/${service}", error="invalid_token"`,
      );
    }
    expect(m.faux.appels.length).toBe(avant);
    // Le bon jeton sur le bon service passe, et atelier_identite donne le compte connecté.
    const c = await clientMcp(m, "crm", jetons.access_token);
    const id = await appeler(c, "atelier_identite", {});
    expect(id.donnees["mode"]).toBe("reel");
    expect(id.donnees["compte"]).toMatch(/HubSpot/);
    await c.close();
  });

  it("refus de l'utilisateur sur l'écran de la plateforme : erreur access_denied renvoyée à Paperclip", async () => {
    m.faux.refuserConsentement = true;
    try {
      const { retour } = await connecter(m, "linkedin");
      expect(retour.get("error")).toBe("access_denied");
      expect(retour.get("state")).toBe("etat-paperclip");
    } finally {
      m.faux.refuserConsentement = false;
    }
  });
});

describe("Facebook (Pages)", () => {
  it("connexion avec choix de la Page, puis publications et statistiques à la forme L7", async () => {
    const { jetons, pages } = await connecter(m, "facebook", { choix: 0 });
    expect(pages.some((p) => p.includes("Rénovation Liège") && p.includes("Rénovation Ans"))).toBe(true);
    const c = await clientMcp(m, "facebook", jetons.access_token);
    const id = await appeler(c, "atelier_identite", {});
    expect(id.donnees).toMatchObject({ mode: "reel", service: "facebook" });

    const pub = await appeler(c, "facebook_publications", { ...SEPT, limit: 2 });
    expect(pub.erreur, pub.texte).toBe(false);
    expect(pub.donnees.data.map((p: { id: string }) => p.id)).toEqual(["1000_3", "1000_2"]);
    expect(pub.donnees.data[1].shares).toEqual({ count: 0 }); // Meta omet shares quand il n'y en a pas
    await memeForme("facebook", "facebook_publications", { ...SEPT, limit: 2 }, pub.donnees);
    // Pagination : l'adresse next de Meta contient le jeton de Page ; la passerelle le retire.
    expect(pub.donnees.paging.next).toBeDefined();
    expect(pub.donnees.paging.next).not.toContain("access_token");
    expect(JSON.stringify(pub.donnees)).not.toContain(SECRETS_EMIS.pageA);
    const suite = await appeler(c, "facebook_publications", { ...SEPT, limit: 2, after: pub.donnees.paging.cursors.after });
    expect(suite.donnees.data.map((p: { id: string; message: unknown }) => [p.id, p.message])).toEqual([["1000_1", null]]);
    expect(suite.donnees.paging.next).toBeUndefined();

    // 120 jours : deux tranches de 90 jours au plus, recollées.
    const ins = await appeler(c, "facebook_insights_page", { debut: "2026-06-01", fin: "2026-09-28" });
    expect(ins.erreur, ins.texte).toBe(false);
    expect(ins.donnees.data[0].values).toHaveLength(120);
    expect(m.faux.appelsVers("GET /meta-graph/v26.0/100000000000001/insights")).toHaveLength(2);
    await memeForme("facebook", "facebook_insights_page", { debut: "2026-09-01", fin: "2026-09-02" }, ins.donnees);
    await c.close();
  });
});

describe("Instagram professionnel", () => {
  it("connexion Instagram (jeton long), médias et statistiques à la forme L7", async () => {
    const { jetons } = await connecter(m, "instagram");
    const c = await clientMcp(m, "instagram", jetons.access_token);
    const medias = await appeler(c, "instagram_medias", SEPT);
    expect(medias.erreur, medias.texte).toBe(false);
    expect(medias.donnees.data).toHaveLength(3);
    expect(medias.donnees.data[2].caption).toBeNull();
    await memeForme("instagram", "instagram_medias", SEPT, medias.donnees);
    const ins = await appeler(c, "instagram_insights_media", { media_id: "17900000000000" });
    expect(ins.erreur, ins.texte).toBe(false);
    const idDemo = (await donneesDemo("instagram", "instagram_medias", SEPT)).data[0].id;
    await memeForme("instagram", "instagram_insights_media", { media_id: idDemo }, ins.donnees);
    const absent = await appeler(c, "instagram_insights_media", { media_id: "404" });
    expect(absent.erreur).toBe(true);
    expect(absent.texte).toMatch(/introuvable/);
    await c.close();
  });
});

describe("LinkedIn (pages)", () => {
  it("organisation administrée, période reconstituée sur deux pages d'API, statistiques", async () => {
    const { jetons } = await connecter(m, "linkedin");
    const c = await clientMcp(m, "linkedin", jetons.access_token);
    // Du 01/04 au 30/09/2026 : 150 publications (une par jour à rebours), plus que la page de 100 de l'API.
    const r = await appeler(c, "linkedin_publications", { debut: "2026-05-04", fin: "2026-09-30", start: 0, count: 100 });
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees.elements).toHaveLength(100);
    expect(r.donnees.paging.links).toHaveLength(1);
    const suite = await appeler(c, "linkedin_publications", { debut: "2026-05-04", fin: "2026-09-30", start: 100, count: 100 });
    expect(suite.donnees.elements).toHaveLength(50);
    expect(m.faux.appelsVers("GET /linkedin-api/rest/posts").length).toBeGreaterThanOrEqual(3);
    await memeForme("linkedin", "linkedin_publications", { ...SEPT, start: 0, count: 2 }, { ...r.donnees, elements: r.donnees.elements.slice(0, 1) });

    const total = await appeler(c, "linkedin_statistiques", SEPT);
    expect(total.donnees.elements[0].totalShareStatistics).toMatchObject({ impressionCount: 3000, clickCount: 60, uniqueImpressionsCount: null });
    await memeForme("linkedin", "linkedin_statistiques", SEPT, total.donnees);
    const jours = await appeler(c, "linkedin_statistiques", { ...SEPT, granularite: "DAY" });
    expect(jours.donnees.elements).toHaveLength(30);
    await memeForme("linkedin", "linkedin_statistiques", { ...SEPT, granularite: "DAY" }, jours.donnees);
    const parPub = await appeler(c, "linkedin_statistiques", { ...SEPT, partages: ["urn:li:share:1000000"] });
    expect(parPub.donnees.elements[0]).toMatchObject({ share: "urn:li:share:1000000", totalShareStatistics: { likeCount: 14 } });
    await c.close();
  });
});

describe("HubSpot (crm)", () => {
  it("contacts et affaires par la recherche CRM v3, associations v4, forme L7", async () => {
    const { jetons } = await connecter(m, "crm");
    const c = await clientMcp(m, "crm", jetons.access_token);
    const page1 = await appeler(c, "crm_contacts", { ...SEPT, limit: 2 });
    expect(page1.erreur, page1.texte).toBe(false);
    expect(page1.donnees.results.map((x: { id: string }) => x.id)).toEqual(["101", "102"]);
    expect(page1.donnees.results[0].properties.etablissement).toBeNull();
    await memeForme("crm", "crm_contacts", { ...SEPT, limit: 2 }, page1.donnees);
    const page2 = await appeler(c, "crm_contacts", { ...SEPT, limit: 2, after: page1.donnees.paging.next.after });
    expect(page2.donnees.results.map((x: { id: string }) => x.id)).toEqual(["103"]);
    expect(page2.donnees.paging).toBeUndefined();
    const search = JSON.parse(m.faux.appelsVers("POST /hubspot-api/crm/v3/objects/contacts/search")[0]!.corps);
    expect(search.filterGroups[0].filters[0]).toEqual({ propertyName: "createdate", operator: "BETWEEN", value: String(Date.parse("2026-09-01T00:00:00Z")), highValue: String(Date.parse("2026-10-01T00:00:00Z") - 1) });

    const affaires = await appeler(c, "crm_transactions", SEPT);
    expect(affaires.donnees.results[0].associations).toEqual({ contacts: { results: [{ id: "101", type: "deal_to_contact" }] } });
    await memeForme("crm", "crm_transactions", { ...SEPT, limit: 100 }, affaires.donnees);

    const passe = await appeler(c, "crm_contacts", { ...SEPT, au: "2026-09-30" });
    expect(passe.erreur).toBe(true);
    expect(passe.texte).toMatch(/état actuel/);
    await c.close();
  });
});

describe("Pipedrive", () => {
  it("par OAuth (api_domain de la société) : personnes v2 rendues à la forme v1 de L7, curseurs parcourus", async () => {
    const { jetons } = await connecter(m, "pipedrive", { oauthDepuisPage: true });
    const c = await clientMcp(m, "pipedrive", jetons.access_token);
    const r = await appeler(c, "pipedrive_personnes", { ...SEPT, start: 0, limit: 1 });
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees.data.map((p: { name: string }) => p.name)).toEqual(["Alice Dupont"]);
    expect(r.donnees.data[0]).toMatchObject({ add_time: "2026-09-02 09:00:00", email: [{ value: "alice@exemple.invalid", primary: true, label: "work" }], localite: "Liège" });
    expect(r.donnees.additional_data.pagination).toEqual({ start: 0, limit: 1, more_items_in_collection: true, next_start: 1 });
    await memeForme("pipedrive", "pipedrive_personnes", { ...SEPT, start: 0, limit: 1 }, r.donnees);
    // updated_since au début de la période, tri par création, au moins deux pages de curseur.
    const appels = m.faux.appelsVers("GET /pipedrive-societe/acme/api/v2/persons");
    expect(appels[0]!.requete.get("updated_since")).toBe("2026-09-01T00:00:00Z");
    expect(appels.some((a) => a.requete.get("cursor") === "2")).toBe(true);
    expect(appels[0]!.entetes.authorization).toBe(`Bearer ${SECRETS_EMIS.pipedrive}`);
    const affaires = await appeler(c, "pipedrive_affaires", { ...SEPT, start: 0, limit: 10 });
    expect(affaires.donnees.data[0]).toMatchObject({ status: "won", person_id: 2, won_time: "2026-09-20 10:00:00" });
    await memeForme("pipedrive", "pipedrive_affaires", { ...SEPT, start: 0, limit: 500 }, affaires.donnees);
    await c.close();
  });

  it("par jeton d'API (formulaire « adresse et clé ») : en-tête x-api-token, jamais le jeton dans l'URL", async () => {
    const { jetons, pages } = await connecter(m, "pipedrive", { formulaire: { societe: "acme.pipedrive.com", jeton: CLE_API_PIPEDRIVE } });
    expect(pages[0]).toContain("Se connecter avec CRM (Pipedrive)");
    const c = await clientMcp(m, "pipedrive", jetons.access_token);
    const avant = m.faux.appels.length;
    const r = await appeler(c, "pipedrive_personnes", { ...SEPT, start: 0, limit: 10 });
    expect(r.donnees.data).toHaveLength(2);
    const nouveaux = m.faux.appels.slice(avant);
    expect(nouveaux.every((a) => a.entetes["x-api-token"] === CLE_API_PIPEDRIVE && !a.requete.toString().includes(CLE_API_PIPEDRIVE))).toBe(true);
    await c.close();
  });

  it("formulaire : un jeton refusé par Pipedrive réaffiche le formulaire avec un message clair", async () => {
    await expect(connecter(m, "pipedrive", { formulaire: { societe: "acme", jeton: "0000000000000000000000000000000000000000" } })).rejects.toThrow(/refusée|Autorisation/);
  });
});

describe("Odoo", () => {
  it("Odoo 19 : API JSON-2 (clé en bearer), domaine de période, champs de l'instance seulement", async () => {
    const { jetons } = await connecter(m, "odoo", { formulaire: { instance: m.odoo19.base, cle: CLE_API_ODOO, base: "", identifiant: "" } });
    const c = await clientMcp(m, "odoo", jetons.access_token);
    const r = await appeler(c, "odoo_leads_search_read", { ...SEPT, id: 7 });
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees.jsonrpc).toBe("2.0");
    expect(r.donnees.id).toBe(7);
    expect(r.donnees.result.map((l: { id: number }) => l.id)).toEqual([25, 26]); // le lead archivé est exclu, comme dans Odoo
    expect(r.donnees.result[0].stage_id).toEqual([3, "Proposition"]);
    // Toute l'année : on y trouve des devis gagnés et perdus, donc tous les champs du simulateur (dont probability).
    const demo = await donneesDemo("odoo", "odoo_leads_search_read", { debut: "2026-01-01", fin: "2026-09-30", limit: 500, domain: [["active", "in", [true, false]]] });
    const clesDemo = new Set((demo.result as Record<string, unknown>[]).flatMap((l) => Object.keys(l)));
    expect(Object.keys(r.donnees.result[0]).filter((k) => !clesDemo.has(k))).toEqual([]);
    const appel = m.odoo19.appels.find((a) => a.chemin === "/json/2/crm.lead/search_read")!;
    expect(JSON.parse(appel.corps).domain.slice(0, 2)).toEqual([["create_date", ">=", "2026-09-01 00:00:00"], ["create_date", "<", "2026-10-01 00:00:00"]]);
    const archives = await appeler(c, "odoo_leads_search_read", { ...SEPT, domain: [["active", "=", false]] });
    expect(archives.donnees.result.map((l: { id: number }) => l.id)).toEqual([27]);
    const mauvais = await appeler(c, "odoo_leads_search_read", { ...SEPT, fields: ["x_metier"] });
    expect(mauvais.erreur).toBe(true);
    expect(mauvais.texte).toMatch(/x_metier/);
    await c.close();
  });

  it("Odoo 17 : repli JSON-RPC execute_kw (base et identifiant demandés)", async () => {
    await expect(connecter(m, "odoo", { formulaire: { instance: m.odoo17.base, cle: CLE_API_ODOO, base: "", identifiant: "" } })).rejects.toThrow(/la base de données et l/);
    const { jetons } = await connecter(m, "odoo", { formulaire: { instance: m.odoo17.base, cle: CLE_API_ODOO, base: "demo17", identifiant: "jean@exemple.invalid" } });
    const c = await clientMcp(m, "odoo", jetons.access_token);
    const r = await appeler(c, "odoo_leads_search_read", SEPT);
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees.result.map((l: { id: number }) => l.id)).toEqual([25, 26]);
    expect(m.odoo17.appels.some((a) => a.chemin.startsWith("/json/2/"))).toBe(false);
    await c.close();
  });
});

describe("Teamleader Focus", () => {
  it("contacts et affaires reconstitués par période, statut « new » rendu « open », forme L7", async () => {
    const { jetons } = await connecter(m, "teamleader");
    const c = await clientMcp(m, "teamleader", jetons.access_token);
    const r = await appeler(c, "teamleader_contacts", { ...SEPT, page: { size: 2, number: 1 } });
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees.data).toHaveLength(2);
    await memeForme("teamleader", "teamleader_contacts", SEPT, r.donnees);
    const p2 = await appeler(c, "teamleader_contacts", { ...SEPT, page: { size: 2, number: 2 } });
    expect(p2.donnees.data).toHaveLength(1);
    const d = await appeler(c, "teamleader_deals", SEPT);
    expect(d.donnees.data[0]).toMatchObject({ status: "open", estimated_value: { amount: 9300, currency: "EUR" } });
    await memeForme("teamleader", "teamleader_deals", SEPT, d.donnees);
    await c.close();
  });
});

describe("secrets", () => {
  it("le fichier d'état ne contient aucun jeton ni clé en clair", () => {
    const etat = readFileSync(m.config.fichierEtat, "utf8");
    for (const s of [...Object.values(SECRETS_EMIS), CLE_API_PIPEDRIVE, CLE_API_ODOO]) expect(etat).not.toContain(s);
  });
});
