// Mélange démonstration / réel (PASSERELLE_SERVICES_REELS) : `osm` servi par son fournisseur RÉEL (index importé d'un petit
// extrait) pendant que `bce` reste en démonstration, sur la même passerelle démarrée en mode démonstration.

import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { lireServicesReels } from "../../src/config.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { enregistrerProspectionDemo } from "../../src/demo/prospection/enregistrer.js";
import { enregistrerOsmDemo, SOURCE_OSM_DEMO } from "../../src/demo/prospection/osm.js";
import { ATTRIBUTION_OSM, LICENCE_OSM } from "../../src/demo/prospection/osm-commun.js";
import { enregistrerOsmReelSeul } from "../../src/reel/prospection/enregistrer.js";
import { importerOsm } from "../../src/reel/prospection/osm/importer.js";
import { MENTION_DONNEES_TIERCES } from "../../src/outils.js";
import { MENTION_DEMONSTRATION } from "../../src/services.js";
import { PREFIXE_ENVELOPPE, SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { demarrer, obtenirJetons, type PasserelleDeTest } from "../aide.js";
import { dossierTemporaire } from "./aide-bce.js";

const FIXTURE_OSM = new URL("./fixtures/extrait-osm.geojsonseq", import.meta.url).pathname;

describe("PASSERELLE_SERVICES_REELS : lecture du réglage", () => {
  it("vide ou absent : aucun service réel", () => {
    expect(lireServicesReels({})).toEqual([]);
    expect(lireServicesReels({ PASSERELLE_SERVICES_REELS: "  " })).toEqual([]);
  });
  it("liste séparée par des virgules ou des espaces, sans doublon", () => {
    expect(lireServicesReels({ PASSERELLE_SERVICES_REELS: "osm, osm" })).toEqual(["osm"]);
  });
  it("refuse un service qui n'est pas mélangeable (comptes de tiers, jetons réels)", () => {
    expect(() => lireServicesReels({ PASSERELLE_SERVICES_REELS: "osm,gsc" })).toThrow(/gsc.*non permis/);
    expect(() => lireServicesReels({ PASSERELLE_SERVICES_REELS: "bce" })).toThrow(/non permis/);
  });
});

describe("mélange : osm réel, bce en démonstration", () => {
  const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);
  const dossier = dossierTemporaire("passerelle-melange-");
  const clients: Client[] = [];
  const journal: string[] = [];
  let melange: PasserelleDeTest;
  let temoin: PasserelleDeTest;
  let fermerIndex: () => void;

  const PROPRIETES: Record<string, string> = { osm: "extrait/demo-osm", bce: "registre/demo-bce" };

  async function connecter(url: string, service: string): Promise<Client> {
    const jeton = (await obtenirJetons(url, service, PROPRIETES[service])).access_token;
    const c = new Client({ name: "essai-melange", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
    clients.push(c);
    return c;
  }

  function registreMelange(): RegistreFournisseurs {
    const registre = enregistrerOsmDemo(enregistrerProspectionDemo(new RegistreFournisseurs()));
    const index = enregistrerOsmReelSeul(registre, { PASSERELLE_OSM_INDEX: join(dossier, "osm.sqlite") }, { journal: (m) => journal.push(m) });
    fermerIndex = () => index.fermer();
    return registre;
  }

  beforeAll(async () => {
    await importerOsm(FIXTURE_OSM, join(dossier, "osm.sqlite"), { date: "2026-10-14" });
    melange = await demarrer({ registre: registreMelange(), signataire, servicesReels: ["osm"] });
    // Témoin : même registre (osm réel ET simulé enregistrés) mais SANS le réglage : tout reste en démonstration.
    temoin = await demarrer({ registre: registreMelange(), signataire });
  });

  afterAll(async () => {
    for (const c of clients) await c.close().catch(() => undefined);
    await melange.arreter();
    await temoin.arreter();
    fermerIndex();
  });

  it("osm : fournisseur réel, mode `reel`, sans mention de démonstration, enveloppe signée, licence ODbL", async () => {
    const c = await connecter(melange.url, "osm");
    const reponse = await c.callTool({ name: "osm_commerces", arguments: { categories: ["commerce"] } });
    const donnees = reponse["structuredContent"] as Record<string, any>;
    const texte = (reponse["content"] as { text: string }[])[0]!.text;
    expect(texte.startsWith(`${MENTION_DONNEES_TIERCES}\n\n`)).toBe(true);
    expect(texte).not.toContain(MENTION_DEMONSTRATION);
    expect(donnees["_atelier"].mode).toBe("reel");
    expect(donnees["_atelier"].mention).toBeUndefined();
    expect(String(donnees["_atelier"].signature).startsWith(PREFIXE_ENVELOPPE)).toBe(true);
    const verdict = verifierEnveloppe(donnees, signataire.clePubliqueBase64);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.charge).toMatchObject({ mode: "reel", service: "osm", outil: "osm_commerces", ecriture: false });
    // Données de l'index, pas du simulateur.
    expect(donnees["source"]).not.toBe(SOURCE_OSM_DEMO);
    expect(donnees["source"]).toContain("Geofabrik");
    expect(donnees["client_demonstration"]).toBeUndefined();
    expect(donnees["total"]).toBeGreaterThan(0);
    expect(donnees["attribution"]).toBe(ATTRIBUTION_OSM);
    expect(donnees["licence"]).toBe(LICENCE_OSM);
    expect(donnees["commerces"].some((x: any) => String(x.nom).includes("(démonstration)"))).toBe(false);
  });

  it("atelier_identite d'osm annonce le mode réel", async () => {
    const c = await connecter(melange.url, "osm");
    const r = await c.callTool({ name: "atelier_identite", arguments: {} });
    expect((r["structuredContent"] as Record<string, any>)["mode"]).toBe("reel");
  });

  it("bce : reste en démonstration, avec la mention", async () => {
    const c = await connecter(melange.url, "bce");
    const r = await c.callTool({ name: "bce_rechercher", arguments: {} });
    const donnees = r["structuredContent"] as Record<string, any>;
    expect(((r["content"] as { text: string }[])[0]!.text).startsWith(`${MENTION_DEMONSTRATION}\n\n`)).toBe(true);
    expect(donnees["_atelier"].mode).toBe("demonstration");
    expect(donnees["_atelier"].mention).toBe(MENTION_DEMONSTRATION);
  });

  it("sans le réglage, osm reste simulé même si le fournisseur réel est enregistré", async () => {
    const c = await connecter(temoin.url, "osm");
    const r = await c.callTool({ name: "osm_commerces", arguments: { communes: ["Liège"] } });
    const donnees = r["structuredContent"] as Record<string, any>;
    expect(donnees["_atelier"].mode).toBe("demonstration");
    expect(donnees["source"]).toBe(SOURCE_OSM_DEMO);
  });

  it("/sante liste les services réels du mélange et garde le mode démonstration de la passerelle", async () => {
    const corps = (await (await fetch(`${melange.url}/sante`)).json()) as Record<string, any>;
    expect(corps["mode"]).toBe("demonstration");
    expect(corps["services_reels"]).toEqual(["osm"]);
    expect(corps["_atelier"].mode).toBe("demonstration");
    const t = (await (await fetch(`${temoin.url}/sante`)).json()) as Record<string, any>;
    expect(t["services_reels"]).toBeUndefined();
  });

  it("le jeton reste exigé (401 sans jeton) pour osm réel du mélange", async () => {
    const rep = await fetch(`${melange.url}/mcp/osm`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    expect(rep.status).toBe(401);
  });

  it("le journal d'enregistrement dit que osm est réel", () => {
    expect(journal.some((m) => m.includes("osm RÉEL"))).toBe(true);
  });
});

describe("mélange : service listé sans fournisseur réel", () => {
  it("reste en démonstration (jamais de service réel fantôme)", async () => {
    const registre = enregistrerOsmDemo(enregistrerProspectionDemo(new RegistreFournisseurs()));
    const p = await demarrer({ registre, servicesReels: ["osm"] });
    try {
      const corps = (await (await fetch(`${p.url}/sante`)).json()) as Record<string, any>;
      expect(corps["services_reels"]).toEqual([]);
    } finally {
      await p.arreter();
    }
  });
});
