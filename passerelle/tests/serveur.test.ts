// Tests du serveur MCP : transport, routage par service, authentification (locale et de tiers),
// « non_connecte » pour un service sans fournisseur, garde Host/Origin, point d'extension.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../src/fournisseurs.js";
import { creerServeur } from "../src/serveur.js";
import { FICHES_PAR_DEFAUT } from "../src/services.js";
import { MENTION_DONNEES_TIERCES } from "../src/outils.js";
import {
  PARAMS_INITIALISATION,
  demarrer,
  fournisseurFactice,
  obtenirJetons,
  rpc,
  type PasserelleDeTest,
} from "./aide.js";
import { request } from "node:http";
import * as z from "zod";

describe("passerelle : service à autorisation locale (parcours OAuth local)", () => {
  let p: PasserelleDeTest;
  let jeton: string;
  beforeAll(async () => {
    p = await demarrer();
    jeton = (await obtenirJetons(p.url, "gsc", "sc-domain:essai.example")).access_token;
  });
  afterAll(async () => {
    await p.arreter();
  });

  it("écoute sur la boucle locale, sur l'adresse annoncée", () => {
    expect(p.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("/sante liste les services branchés et ceux qui ne le sont pas, sans aucune mention de démonstration", async () => {
    const corps = (await (await fetch(`${p.url}/sante`)).json()) as Record<string, any>;
    expect(corps.ok).toBe(true);
    expect(corps.mode).toBe("reel");
    expect(corps.services).toEqual(["gsc"]);
    expect(corps.services_non_connectes).toEqual(FICHES_PAR_DEFAUT.map((f) => f.id).filter((id) => id !== "gsc"));
    expect(corps._atelier).toEqual({ mode: "reel" });
  });

  it("sans jeton : 401 avec l'indication des métadonnées (premier contact de Paperclip)", async () => {
    const r = await rpc(p.url, "gsc", "initialize", PARAMS_INITIALISATION);
    expect(r.statut).toBe(401);
    expect(r.entetes.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${p.url}/.well-known/oauth-protected-resource/mcp/gsc"`,
    );
  });

  it("jeton inconnu : 401 invalid_token", async () => {
    const r = await rpc(p.url, "gsc", "tools/list", {}, "jeton-bidon");
    expect(r.statut).toBe(401);
    expect(r.entetes.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("initialize puis tools/list : au moins atelier_identite et les outils du fournisseur factice", async () => {
    const init = await rpc(p.url, "gsc", "initialize", PARAMS_INITIALISATION, jeton);
    expect(init.statut).toBe(200);
    expect(init.corps.result.serverInfo.name).toBe("passerelle-marketing-gsc");
    expect(init.corps.result.instructions).toContain("non_connecte");
    expect(init.corps.result.instructions).not.toMatch(/démonstration/i);
    const liste = await rpc(p.url, "gsc", "tools/list", {}, jeton);
    const noms = liste.corps.result.tools.map((t: { name: string }) => t.name);
    expect(noms).toEqual(["atelier_identite", "gsc_ping", "gsc_publier_factice", "gsc_echec"]);
    const ping = liste.corps.result.tools.find((t: { name: string }) => t.name === "gsc_ping");
    expect(ping.inputSchema.type).toBe("object");
    expect(ping.inputSchema.properties.texte.type).toBe("string");
    expect(ping.inputSchema.required).toEqual(["texte"]);
    expect(ping.inputSchema.$schema).toBeUndefined();
    expect(ping.annotations.readOnlyHint).toBe(true);
    const ecriture = liste.corps.result.tools.find((t: { name: string }) => t.name === "gsc_publier_factice");
    expect(ecriture.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("un service sans fournisseur répond « non_connecte » (503, message en français), jamais des données simulées", async () => {
    for (const service of ["crm", "ga4", "osm", "bce", "fsma"]) {
      const sans = await rpc(p.url, service, "tools/list", {});
      expect(sans.statut, service).toBe(503);
      expect(sans.corps.error, service).toBe("non_connecte");
      expect(sans.corps.message, service).toMatch(/n'est pas connecté.*aucun fournisseur réel/);
      // Même avec un jeton quelconque : la réponse est la même, rien n'est simulé.
      const avec = await rpc(p.url, service, "tools/call", { name: "atelier_identite", arguments: {} }, "jeton-quelconque");
      expect(avec.statut, service).toBe(503);
      expect(avec.corps.error, service).toBe("non_connecte");
      const meta = await fetch(`${p.url}/.well-known/oauth-protected-resource/mcp/${service}`);
      expect(meta.status, service).toBe(503);
    }
  });

  it("le serveur d'autorisation local ne délivre rien pour un service non connecté", async () => {
    await expect(obtenirJetons(p.url, "crm", "portail/essai")).rejects.toThrow();
  });

  it("atelier_identite : service, compte local, propriété choisie, enveloppe sans mention de démonstration", async () => {
    const r = await rpc(p.url, "gsc", "tools/call", { name: "atelier_identite", arguments: {} }, jeton);
    const s = r.corps.result.structuredContent;
    expect(s.service).toBe("gsc");
    expect(s.compte).toBe("Poste local de la passerelle");
    expect(s.propriete.id).toBe("sc-domain:essai.example");
    expect(s.outils).toContain("atelier_identite");
    expect(s._atelier).toEqual({ mode: "reel" });
  });

  it("la mention « données de tiers » figure sur 100 % des réponses d'outils : succès, outil inconnu, arguments invalides, échec", async () => {
    const appels: Array<[string, unknown]> = [
      ["atelier_identite", {}],
      ["gsc_ping", { texte: "bonjour" }],
      ["gsc_publier_factice", {}],
      ["gsc_ping", { texte: "" }], // arguments invalides
      ["gsc_ping", {}], // argument manquant
      ["outil_qui_n_existe_pas", {}],
      ["gsc_echec", {}], // l'outil lève une exception
    ];
    for (const [nom, args] of appels) {
      const r = await rpc(p.url, "gsc", "tools/call", { name: nom, arguments: args }, jeton);
      expect(r.statut, nom).toBe(200);
      const res = r.corps.result;
      expect(res.content[0].text.startsWith(`${MENTION_DONNEES_TIERCES}\n\n`), nom).toBe(true);
      expect(res.structuredContent._atelier, nom).toEqual({ mode: "reel" });
    }
    const invalide = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "" } }, jeton);
    expect(invalide.corps.result.isError).toBe(true);
    expect(invalide.corps.result.structuredContent.erreur).toBe("arguments_invalides");
    const echec = await rpc(p.url, "gsc", "tools/call", { name: "gsc_echec", arguments: {} }, jeton);
    expect(echec.corps.result.isError).toBe(true);
    expect(echec.corps.result.structuredContent.message).toBe("échec volontaire");
    const inconnu = await rpc(p.url, "gsc", "tools/call", { name: "outil_qui_n_existe_pas", arguments: {} }, jeton);
    expect(inconnu.corps.result.structuredContent.erreur).toBe("outil_inconnu");
  });

  it("le fournisseur reçoit l'identité du compte autorisé (propriété choisie au consentement)", async () => {
    const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "x" } }, jeton);
    expect(r.corps.result.structuredContent.echo).toBe("x");
    expect(r.corps.result.structuredContent.propriete).toBe("sc-domain:essai.example");
  });

  it("le client MCP officiel (SDK) se connecte, liste et appelle", async () => {
    const client = new Client({ name: "essai-sdk", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${p.url}/mcp/gsc`), {
      requestInit: { headers: { authorization: `Bearer ${jeton}` } },
    });
    await client.connect(transport);
    try {
      const outils = await client.listTools();
      expect(outils.tools.map((t) => t.name)).toContain("atelier_identite");
      const reponse = await client.callTool({ name: "gsc_ping", arguments: { texte: "sdk" } });
      const contenu = reponse["content"] as Array<{ type: string; text: string }>;
      expect(contenu[0]!.text.startsWith(MENTION_DONNEES_TIERCES)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("service sans fiche : 404 ; méthodes GET et DELETE : 405 (pas de session)", async () => {
    expect((await rpc(p.url, "inconnu", "tools/list", {}, jeton)).statut).toBe(404);
    expect((await fetch(`${p.url}/mcp/gsc`, { headers: { authorization: `Bearer ${jeton}` } })).status).toBe(405);
    expect((await fetch(`${p.url}/mcp/gsc`, { method: "DELETE", headers: { authorization: `Bearer ${jeton}` } })).status).toBe(405);
  });

  it("corps JSON invalide : 400 ; corps trop gros : 413", async () => {
    const mauvais = await fetch(`${p.url}/mcp/gsc`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${jeton}` },
      body: "{pas du json",
    });
    expect(mauvais.status).toBe(400);
    const gros = await fetch(`${p.url}/mcp/gsc`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { remplissage: "x".repeat(1024 * 1024 + 10) } }),
    });
    expect(gros.status).toBe(413);
  });

  it("garde Host : un en-tête Host étranger est refusé (rebond DNS)", async () => {
    const port = new URL(p.url).port;
    const statut = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/sante", headers: { host: "pirate.example" } }, (rep) => {
        rep.resume();
        resolve(rep.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(statut).toBe(403);
  });

  it("garde Origin : une origine étrangère est refusée, l'origine locale acceptée", async () => {
    const etrangere = await fetch(`${p.url}/sante`, { headers: { origin: "http://pirate.example" } });
    expect(etrangere.status).toBe(403);
    const locale = await fetch(`${p.url}/sante`, { headers: { origin: p.url } });
    expect(locale.status).toBe(200);
  });

  it("n'écoute pas hors de la boucle locale : l'adresse du socket est 127.0.0.1", async () => {
    // Le port est lié à 127.0.0.1 : une connexion par une autre adresse locale échoue.
    const port = Number(new URL(p.url).port);
    const autre = await fetch(`http://127.0.0.2:${port}/sante`).then(
      () => "joignable",
      () => "injoignable",
    );
    // 127.0.0.2 est aussi une adresse de bouclage Linux, mais le socket n'est lié qu'à 127.0.0.1.
    expect(autre).toBe("injoignable");
  });

  it("chemin inconnu : 404 JSON", async () => {
    const r = await fetch(`${p.url}/nimporte-quoi`);
    expect(r.status).toBe(404);
  });
});

describe("registre des fournisseurs (point d'extension)", () => {
  it("refuse les noms réservés, invalides et en double", () => {
    const base = fournisseurFactice();
    const registre = new RegistreFournisseurs();
    const outil = base.outils[0]!;
    expect(() => registre.enregistrer({ ...base, outils: [{ ...outil, nom: "atelier_identite" }] })).toThrow(/réservé/);
    expect(() => registre.enregistrer({ ...base, outils: [{ ...outil, nom: "Mauvais Nom" }] })).toThrow(/invalide/);
    expect(() => registre.enregistrer({ ...base, outils: [outil, outil] })).toThrow(/double/);
  });

  it("obtenir(service) rend le fournisseur enregistré, undefined sinon", () => {
    const registre = new RegistreFournisseurs().enregistrer(fournisseurFactice());
    expect(registre.obtenir("gsc")).toBeDefined();
    expect(registre.obtenir("ga4")).toBeUndefined();
  });

  it("les outils acceptent un schéma Zod riche (valeurs par défaut, énumérations)", async () => {
    const registre = new RegistreFournisseurs().enregistrer({
      service: "ga4",
      mode: "reel",
      outils: [
        {
          nom: "ga4_essai",
          description: "Essai de schéma",
          schemaEntree: { periode: z.enum(["7j", "28j"]).default("28j"), limite: z.number().int().min(1).max(100).default(10) },
          executer: (args) => args,
        },
      ],
    });
    const p = await demarrer({ registre, sansAuthentification: true });
    try {
      const r = await rpc(p.url, "ga4", "tools/call", { name: "ga4_essai", arguments: {} });
      expect(r.corps.result.structuredContent).toMatchObject({ periode: "28j", limite: 10 });
      const mauvais = await rpc(p.url, "ga4", "tools/call", { name: "ga4_essai", arguments: { periode: "1an" } });
      expect(mauvais.corps.result.isError).toBe(true);
    } finally {
      await p.arreter();
    }
  });
});

describe("passerelle : option sansAuthentification réservée aux tests (audit F2)", () => {
  it("refusée au démarrage hors test, acceptée en test", () => {
    const registre = new RegistreFournisseurs().enregistrer(fournisseurFactice());
    const avant = { NODE_ENV: process.env.NODE_ENV, VITEST: process.env.VITEST };
    try {
      delete process.env.VITEST;
      process.env.NODE_ENV = "production";
      expect(() => creerServeur({ port: 0, registre, sansAuthentification: true })).toThrow(/réservée aux tests/);
      // Sans l'option, le démarrage n'est pas affecté par l'environnement.
      expect(() => creerServeur({ port: 0, registre })).not.toThrow();
      process.env.NODE_ENV = "test";
      expect(() => creerServeur({ port: 0, registre, sansAuthentification: true })).not.toThrow();
    } finally {
      for (const [cle, valeur] of Object.entries(avant)) {
        if (valeur === undefined) delete process.env[cle];
        else process.env[cle] = valeur;
      }
    }
  });
});

describe("passerelle : service dont le fournisseur apporte sa propre autorisation (sans état, jeton relayé)", () => {
  let p: PasserelleDeTest;
  beforeAll(async () => {
    p = await demarrer({ registre: new RegistreFournisseurs().enregistrer(fournisseurFactice("tiers")) });
  });
  afterAll(async () => {
    await p.arreter();
  });

  it("sans jeton : 401 ; avec jeton : le fournisseur reçoit le jeton porteur", async () => {
    expect((await rpc(p.url, "gsc", "tools/list", {})).statut).toBe(401);
    // Jeton refusé par le fournisseur réel : 401 au niveau HTTP pour TOUTE requête MCP, défi conforme (RFC 6750, RFC 9728).
    for (const methode of ["initialize", "tools/list", "tools/call"]) {
      const refus = await rpc(p.url, "gsc", methode, methode === "tools/call" ? { name: "gsc_ping", arguments: { texte: "x" } } : {}, "jeton-invente");
      expect(refus.statut, methode).toBe(401);
      expect(refus.entetes.get("www-authenticate"), methode).toBe(`Bearer resource_metadata="${p.url}/.well-known/oauth-protected-resource/mcp/gsc", error="invalid_token"`);
      expect(refus.corps.error, methode).toBe("invalid_token");
    }
    const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "reel" } }, "jeton-google-factice");
    expect(r.statut).toBe(200);
    const s = r.corps.result.structuredContent;
    expect(s.jetonRelaye).toBe("jeton-google-factice");
    expect(s._atelier).toEqual({ mode: "reel" });
    expect(r.corps.result.content[0].text.startsWith(MENTION_DONNEES_TIERCES)).toBe(true);
  });

  it("annonce le serveur d'autorisation du fournisseur dans les métadonnées de ressource protégée", async () => {
    const meta = (await (await fetch(`${p.url}/.well-known/oauth-protected-resource/mcp/gsc`)).json()) as Record<string, unknown>;
    expect(meta["authorization_servers"]).toEqual(["https://accounts.google.example"]);
    expect(meta["resource"]).toBe(`${p.url}/mcp/gsc`);
  });

  it("un service sans fournisseur répond non_connecte ; l'autorisation locale ne délivre rien pour un service de tiers", async () => {
    const sans = await rpc(p.url, "ga4", "tools/list", {}, "x");
    expect(sans.statut).toBe(503);
    expect(sans.corps.error).toBe("non_connecte");
    expect((await fetch(`${p.url}/.well-known/oauth-protected-resource/mcp/ga4`)).status).toBe(503);
    // Le serveur d'autorisation local existe mais ne connaît que les services locaux : gsc est un service de tiers ici.
    await expect(obtenirJetons(p.url, "gsc")).rejects.toThrow();
    const sante = (await (await fetch(`${p.url}/sante`)).json()) as Record<string, any>;
    expect(sante.services).toEqual(["gsc"]);
    expect(sante.services_non_connectes).toContain("ga4");
    expect(sante.mode).toBe("reel");
  });
});

describe("journal d'accès", () => {
  it("note méthode, chemin et statut, sans jamais écrire de jeton, de code ni de paramètres de requête", async () => {
    const lignes: string[] = [];
    const p = await demarrer({ journal: (m) => lignes.push(m) });
    try {
      const j = await obtenirJetons(p.url, "gsc", "sc-domain:essai.example");
      await rpc(p.url, "gsc", "tools/list", {}, j.access_token);
      // Laisse le temps aux événements « finish » d'écrire leurs lignes.
      await new Promise((r) => setTimeout(r, 50));
      const texte = lignes.join("\n");
      expect(texte).toContain("POST /mcp/gsc -> 200");
      expect(texte).toContain("GET /oauth/authorize -> 200");
      expect(texte).not.toContain(j.access_token);
      expect(texte).not.toContain(j.refresh_token);
      expect(texte).not.toMatch(/code=|state=|code_challenge/);
    } finally {
      await p.arreter();
    }
  });
});

describe("registre générique : N services, rien de câblé pour un fournisseur en particulier", () => {
  const ficheZoho = {
    id: "zoho",
    libelle: "CRM (Zoho)",
    portees: ["ZohoCRM.modules.contacts.READ"],
    proprietes: [{ id: "org/zoho-42", libelle: "Organisation Zoho (essai)" }],
  };
  const outilZoho = {
    nom: "zoho_contacts",
    description: "Contacts (factice)",
    schemaEntree: {},
    annotations: { readOnlyHint: true },
    executer: () => ({ contacts: [] }),
  };

  it("un nouveau service déclaré par son fournisseur est servi avec autorisation locale et outils", async () => {
    const registre = new RegistreFournisseurs().enregistrer({
      service: "zoho",
      mode: "reel",
      autorisationLocale: true,
      fiche: ficheZoho,
      outils: [outilZoho],
    });
    const p = await demarrer({ registre });
    try {
      const j = await obtenirJetons(p.url, "zoho", "org/zoho-42");
      const liste = await rpc(p.url, "zoho", "tools/list", {}, j.access_token);
      expect(liste.corps.result.tools.map((t: { name: string }) => t.name)).toEqual(["atelier_identite", "zoho_contacts"]);
      const id = await rpc(p.url, "zoho", "tools/call", { name: "atelier_identite", arguments: {} }, j.access_token);
      expect(id.corps.result.structuredContent.libelle).toBe("CRM (Zoho)");
      const sante = (await (await fetch(`${p.url}/sante`)).json()) as { services: string[]; services_non_connectes: string[] };
      expect(sante.services).toEqual(["zoho"]);
      expect(sante.services_non_connectes).toContain("pipedrive");
      expect(sante.services_non_connectes).toContain("teamleader");
    } finally {
      await p.arreter();
    }
  });

  it("seuls les services avec fournisseur sont servis, leurs portées sont annoncées", async () => {
    const registre = new RegistreFournisseurs().enregistrer({
      service: "teamleader",
      mode: "reel",
      outils: [{ ...outilZoho, nom: "teamleader_contacts" }],
      serveursAutorisation: ["https://app.teamleader.example"],
    });
    const p = await demarrer({ registre });
    try {
      const sante = (await (await fetch(`${p.url}/sante`)).json()) as { services: string[]; services_non_connectes: string[] };
      expect(sante.services).toEqual(["teamleader"]);
      const meta = (await (await fetch(`${p.url}/.well-known/oauth-protected-resource/mcp/teamleader`)).json()) as Record<string, unknown>;
      expect(meta["authorization_servers"]).toEqual(["https://app.teamleader.example"]);
      expect(meta["scopes_supported"]).toEqual(["contacts", "deals"]);
      expect((await rpc(p.url, "pipedrive", "tools/list", {}, "x")).statut).toBe(503);
      // Fournisseur SANS fonction de vérification du jeton : refus par défaut, jamais d'acceptation.
      const refus = await rpc(p.url, "teamleader", "tools/list", {}, "n-importe-quel-jeton");
      expect(refus.statut).toBe(401);
      expect(refus.entetes.get("www-authenticate")).toContain('error="invalid_token"');
    } finally {
      await p.arreter();
    }
  });

  it("refuse un service sans fiche et une fiche mal formée", () => {
    const registre = new RegistreFournisseurs();
    expect(() => registre.enregistrer({ service: "inconnu", mode: "reel", outils: [] })).toThrow(/sans fiche/);
    expect(() => registre.declarerFiche({ ...ficheZoho, id: "Mauvais-Id" })).toThrow(/invalide/);
    expect(() => registre.enregistrer({ service: "zoho", mode: "reel", fiche: { ...ficheZoho, id: "autre" }, outils: [] })).toThrow(/ne correspond pas/);
  });
});
