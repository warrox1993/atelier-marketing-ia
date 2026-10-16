// Services locaux (PASSERELLE_SERVICES_REELS) : `osm`, `bce` et `bnb` servis par leur fournisseur RÉEL, accès par
// l'autorisation locale de la passerelle. Un service non branché répond « non_connecte », jamais des données simulées.

import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { lireServicesLocaux } from "../../src/config.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { ATTRIBUTION_OSM, LICENCE_OSM } from "../../src/commun/prospection/osm-commun.js";
import { enregistrerBceReelSeul, enregistrerBnbReelSeul, enregistrerOsmReelSeul } from "../../src/reel/prospection/enregistrer.js";
import { importerOsm } from "../../src/reel/prospection/osm/importer.js";
import { MENTION_DONNEES_TIERCES } from "../../src/outils.js";
import { PREFIXE_ENVELOPPE, SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { demarrer, obtenirJetons, rpc, type PasserelleDeTest } from "../aide.js";
import { dossierTemporaire } from "./aide-bce.js";

const FIXTURE_OSM = new URL("./fixtures/extrait-osm.geojsonseq", import.meta.url).pathname;

describe("PASSERELLE_SERVICES_REELS : lecture du réglage", () => {
  it("vide ou absent : aucun service local", () => {
    expect(lireServicesLocaux({})).toEqual([]);
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "  " })).toEqual([]);
  });
  it("liste séparée par des virgules ou des espaces, sans doublon", () => {
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "osm, osm" })).toEqual(["osm"]);
  });
  it("refuse un service de tiers (comptes et jetons de plateforme)", () => {
    expect(() => lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "osm,gsc" })).toThrow(/gsc.*non permis/);
    expect(() => lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "fsma" })).toThrow(/non permis/);
  });
});

describe("osm local réel ; bce, fsma et les autres non branchés", () => {
  const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);
  const dossier = dossierTemporaire("passerelle-locaux-");
  const clients: Client[] = [];
  const journal: string[] = [];
  let passerelle: PasserelleDeTest;
  let fermerIndex: () => void;

  async function connecter(url: string, service: string): Promise<Client> {
    const jeton = (await obtenirJetons(url, service, "extrait/osm-local")).access_token;
    const c = new Client({ name: "essai-locaux", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
    clients.push(c);
    return c;
  }

  beforeAll(async () => {
    await importerOsm(FIXTURE_OSM, join(dossier, "osm.sqlite"), { date: "2026-10-14" });
    const registre = new RegistreFournisseurs();
    const index = enregistrerOsmReelSeul(registre, { PASSERELLE_OSM_INDEX: join(dossier, "osm.sqlite") }, { journal: (m) => journal.push(m) });
    fermerIndex = () => index.fermer();
    passerelle = await demarrer({ registre, signataire });
  });

  afterAll(async () => {
    for (const c of clients) await c.close().catch(() => undefined);
    await passerelle.arreter();
    fermerIndex();
  });

  it("osm : données de l'index, mention « données de tiers », enveloppe signée en mode reel, licence ODbL", async () => {
    const c = await connecter(passerelle.url, "osm");
    const reponse = await c.callTool({ name: "osm_commerces", arguments: { categories: ["commerce"] } });
    const donnees = reponse["structuredContent"] as Record<string, any>;
    const texte = (reponse["content"] as { text: string }[])[0]!.text;
    expect(texte.startsWith(`${MENTION_DONNEES_TIERCES}\n\n`)).toBe(true);
    expect(donnees["_atelier"].mode).toBe("reel");
    expect(donnees["_atelier"].mention).toBeUndefined();
    expect(String(donnees["_atelier"].signature).startsWith(PREFIXE_ENVELOPPE)).toBe(true);
    const verdict = verifierEnveloppe(donnees, signataire.clePubliqueBase64);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.charge).toMatchObject({ mode: "reel", service: "osm", outil: "osm_commerces", ecriture: false });
    expect(donnees["source"]).toContain("Geofabrik");
    expect(donnees["total"]).toBeGreaterThan(0);
    expect(donnees["attribution"]).toBe(ATTRIBUTION_OSM);
    expect(donnees["licence"]).toBe(LICENCE_OSM);
  });

  it("atelier_identite d'osm annonce le service et la source locale", async () => {
    const c = await connecter(passerelle.url, "osm");
    const r = (await c.callTool({ name: "atelier_identite", arguments: {} }))["structuredContent"] as Record<string, any>;
    expect(r["service"]).toBe("osm");
    expect(r["propriete"].id).toBe("extrait/osm-local");
  });

  it("bce et fsma, non branchés, répondent « non_connecte » : rien n'est simulé", async () => {
    for (const service of ["bce", "fsma"]) {
      const r = await rpc(passerelle.url, service, "tools/list", {});
      expect(r.statut, service).toBe(503);
      expect(r.corps.error, service).toBe("non_connecte");
    }
    // Un service sans fiche (b2c) reste inconnu.
    expect((await rpc(passerelle.url, "b2c", "tools/list", {})).statut).toBe(404);
  });

  it("/sante liste osm parmi les services connectés ; bce et fsma parmi les non connectés", async () => {
    const corps = (await (await fetch(`${passerelle.url}/sante`)).json()) as Record<string, any>;
    expect(corps["services"]).toEqual(["osm"]);
    expect(corps["services_non_connectes"]).toEqual(expect.arrayContaining(["bce", "fsma", "gsc", "crm"]));
    expect(corps["services_non_connectes"]).not.toContain("osm");
    expect(corps["_atelier"]).toEqual({ mode: "reel" });
  });

  it("le jeton reste exigé (401 sans jeton) pour osm", async () => {
    const rep = await fetch(`${passerelle.url}/mcp/osm`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    expect(rep.status).toBe(401);
  });

  it("le journal d'enregistrement dit que osm est un service local", () => {
    expect(journal.some((m) => m.includes("osm (service local)"))).toBe(true);
  });
});

describe("bce et bnb locaux sans index ni clé", () => {
  const dossier = dossierTemporaire("passerelle-locaux-bce-bnb-");
  const clients: Client[] = [];
  const journal: string[] = [];
  let p: PasserelleDeTest;
  let fermerIndex: () => void;

  const PROPRIETES: Record<string, string> = { bce: "registre/bce-local", bnb: "centrale/bnb-cbso" };

  async function connecter(service: string): Promise<Client> {
    const jeton = (await obtenirJetons(p.url, service, PROPRIETES[service])).access_token;
    const c = new Client({ name: "essai-locaux-bce-bnb", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${p.url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
    clients.push(c);
    return c;
  }

  beforeAll(async () => {
    const registre = new RegistreFournisseurs();
    // Index BCE ABSENT et aucune clé BNB : le démarrage ne doit pas en souffrir.
    const env = { PASSERELLE_BCE_INDEX: join(dossier, "absent-bce.sqlite") };
    const indexBce = enregistrerBceReelSeul(registre, env, { journal: (m) => journal.push(m) });
    enregistrerBnbReelSeul(registre, env, { journal: (m) => journal.push(m) });
    fermerIndex = () => indexBce.fermer();
    p = await demarrer({ registre });
  });

  afterAll(async () => {
    for (const c of clients) await c.close().catch(() => undefined);
    await p.arreter();
    fermerIndex();
  });

  it("/sante liste bce et bnb comme connectés ; fsma comme non connecté", async () => {
    const corps = (await (await fetch(`${p.url}/sante`)).json()) as Record<string, any>;
    expect(corps["services"]).toEqual(expect.arrayContaining(["bce", "bnb"]));
    expect(corps["services"]).not.toContain("fsma");
    expect(corps["services_non_connectes"]).toContain("fsma");
  });

  it("fsma, non branché : « non_connecte »", async () => {
    const r = await rpc(p.url, "fsma", "tools/list", {});
    expect(r.statut).toBe(503);
    expect(r.corps.error).toBe("non_connecte");
  });

  it("bce avec index absent : erreur claire en français, pas de données simulées", async () => {
    const c = await connecter("bce");
    const r = await c.callTool({ name: "bce_rechercher", arguments: {} });
    expect(r["isError"]).toBe(true);
    expect(JSON.stringify(r["content"])).toMatch(/index BCE absent.*bce-telecharger --importer/);
  });

  it("bnb sans clé : erreur claire", async () => {
    const c = await connecter("bnb");
    const r = await c.callTool({ name: "bnb_comptes", arguments: { numero: "0403170701" } });
    expect(JSON.stringify(r["content"])).toMatch(/Clé BNB invalide ou absente/);
  });

  it("le journal dit que la clé BNB manque et que l'index BCE est absent", () => {
    expect(journal.some((m) => m.includes("index BCE absent"))).toBe(true);
    expect(journal.some((m) => m.includes("clé BNB absente"))).toBe(true);
  });
});
