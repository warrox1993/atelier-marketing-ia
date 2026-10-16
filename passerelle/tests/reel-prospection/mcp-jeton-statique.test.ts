// Lots P3 et P3b : service complet par une vraie passerelle lue par le client MCP du SDK, avec accès par jeton porteur
// statique (PASSERELLE_PROSPECTION_JETON) : réponses SIGNÉES (aev1, ecriture: false), erreurs d'outil signées.

import { generateKeyPairSync } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { ATTRIBUTION_OSM } from "../../src/commun/prospection/osm-commun.js";
import { appliquerMiseAJour, importerComplet } from "../../src/reel/prospection/bce/importer.js";
import { enregistrerProspectionReel, type ProspectionReelle } from "../../src/reel/prospection/enregistrer.js";
import { importerOsm } from "../../src/reel/prospection/osm/importer.js";
import { MENTION_DONNEES_TIERCES } from "../../src/outils.js";
import { PREFIXE_ENVELOPPE, SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { demarrer, type PasserelleDeTest } from "../aide.js";
import { dossierTemporaire, ecrireZip, fichierComplet, miseAJour134, N } from "./aide-bce.js";

const FIXTURE_OSM = new URL("./fixtures/extrait-osm.geojsonseq", import.meta.url).pathname;
const JETON = "jeton-de-prospection-de-test-0123456789abcdef";

describe("service par une vraie passerelle (client MCP du SDK)", () => {
  const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);
  const dossier = dossierTemporaire("passerelle-p3-mcp-");
  const journal: string[] = [];
  let passerelle: PasserelleDeTest;
  let prospection: ProspectionReelle | null;
  const clients: Client[] = [];

  async function connecter(url: string, service: string, jeton: string): Promise<Client> {
    const c = new Client({ name: "essai-prospection-reel", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
    clients.push(c);
    return c;
  }

  async function appelerMcp(c: Client, nom: string, args: Record<string, unknown>, attendu: { service: string; erreur?: boolean }): Promise<Record<string, any>> {
    const reponse = await c.callTool({ name: nom, arguments: args });
    const donnees = reponse["structuredContent"] as Record<string, any>;
    const texte = (reponse["content"] as { text: string }[])[0]!.text;
    expect(texte.startsWith(`${MENTION_DONNEES_TIERCES}\n\n`)).toBe(true);
    expect(donnees["_atelier"]).toMatchObject({ mode: "reel" });
    expect(String(donnees["_atelier"].signature).startsWith(PREFIXE_ENVELOPPE)).toBe(true);
    const verdict = verifierEnveloppe(donnees, signataire.clePubliqueBase64);
    expect(verdict.ok, nom).toBe(true);
    if (verdict.ok) expect(verdict.charge).toMatchObject({ v: 1, mode: "reel", service: attendu.service, outil: nom, ecriture: false, executee: false, erreur: attendu.erreur === true });
    expect(reponse["isError"] === true).toBe(attendu.erreur === true);
    return donnees;
  }

  beforeAll(async () => {
    await importerComplet(ecrireZip(dossier, "c.zip", fichierComplet()), join(dossier, "bce.sqlite"));
    await appliquerMiseAJour(ecrireZip(dossier, "u.zip", miseAJour134()), join(dossier, "bce.sqlite"));
    await importerOsm(FIXTURE_OSM, join(dossier, "osm.sqlite"), { date: "2026-10-14" });
    const registre = new RegistreFournisseurs();
    prospection = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON: JETON, PASSERELLE_BCE_INDEX: join(dossier, "bce.sqlite"), PASSERELLE_OSM_INDEX: join(dossier, "osm.sqlite") }, { journal: (m) => journal.push(m) });
    passerelle = await demarrer({ registre, signataire });
  });
  afterAll(async () => {
    for (const c of clients) await c.close();
    prospection?.fermer();
    await passerelle.arreter();
  });

  const requete = (service: string, entete: Record<string, string>): Promise<Response> =>
    fetch(`${passerelle.url}/mcp/${service}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...entete }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });

  it("services bce, osm et bnb servis ; sans jeton ou avec un mauvais jeton : 401, avant toute requête MCP", async () => {
    expect(prospection?.services).toEqual(["bce", "osm", "bnb"]);
    for (const service of ["bce", "osm", "bnb"]) {
      const sans = await requete(service, {});
      expect(sans.status).toBe(401);
      expect(sans.headers.get("www-authenticate")).toContain("resource_metadata=");
      const faux = await requete(service, { authorization: "Bearer un-autre-jeton-qui-ne-convient-pas-du-tout" });
      expect(faux.status).toBe(401);
      expect(faux.headers.get("www-authenticate")).toContain('error="invalid_token"');
      expect((await requete(service, { authorization: `Bearer ${JETON}` })).status).toBe(200);
    }
    expect(journal.join("\n")).not.toContain(JETON);
  });

  it("catalogue : outils en lecture seule ; identité du compte local", async () => {
    const bce = await connecter(passerelle.url, "bce", JETON);
    const { tools } = await bce.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["atelier_identite", "bce_changements", "bce_entreprise", "bce_rechercher"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
    const id = await appelerMcp(bce, "atelier_identite", {}, { service: "bce" });
    expect(id).toMatchObject({ mode: "reel", service: "bce", propriete: { id: "registre/bce-local" } });
    const osm = await connecter(passerelle.url, "osm", JETON);
    expect((await osm.listTools()).tools.map((t) => t.name).sort()).toEqual(["atelier_identite", "osm_commerces", "osm_repartition"]);
  });

  it("bce_rechercher, bce_entreprise, bce_changements : réponses signées (aev1), ecriture: false, données réelles du fichier d'essai", async () => {
    const c = await connecter(passerelle.url, "bce", JETON);
    const r = await appelerMcp(c, "bce_rechercher", { nace: ["43.91"], provinces: ["Liège"] }, { service: "bce" });
    expect(r["entreprises"].map((e: any) => e.EnterpriseNumber)).toEqual([N.toitures]);
    expect(r["taille_note"]).toMatch(/inconnue/);
    const e = await appelerMcp(c, "bce_entreprise", { numero: N.toitures }, { service: "bce" });
    expect(e["entreprise"].EnterpriseNumber).toBe(N.toitures);
    const ch = await appelerMcp(c, "bce_changements", { depuis: "2026-10-01" }, { service: "bce" });
    expect(ch["total"]).toBe(5);
  });

  it("osm_commerces et osm_repartition : réponses signées avec attribution ODbL", async () => {
    const c = await connecter(passerelle.url, "osm", JETON);
    const r = await appelerMcp(c, "osm_commerces", { categories: ["restauration"], communes: ["Liège"] }, { service: "osm" });
    expect(r["attribution"]).toBe(ATTRIBUTION_OSM);
    expect(r["commerces"].map((x: any) => x.nom).sort()).toEqual(["Café Fictif Polygone", "Table Fictive"]);
    expect((await appelerMcp(c, "osm_repartition", {}, { service: "osm" }))["attribution"]).toBe(ATTRIBUTION_OSM);
  });

  it("erreurs d'outil (arguments invalides, numéro mal formé) : isError, signées elles aussi", async () => {
    const c = await connecter(passerelle.url, "bce", JETON);
    const invalide = await appelerMcp(c, "bce_rechercher", { nace: ["abc"] }, { service: "bce", erreur: true });
    expect(invalide["erreur"]).toBe("arguments_invalides");
    const mal = await appelerMcp(c, "bce_entreprise", { numero: "12" }, { service: "bce", erreur: true });
    expect(mal["message"]).toMatch(/Numéro BCE invalide/);
  });

  it("index absent : service servi, outils en erreur claire ; journal du démarrage explicite", async () => {
    const vide = dossierTemporaire("passerelle-p3-vide-");
    const registre = new RegistreFournisseurs();
    const j: string[] = [];
    const p = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON: JETON }, { journal: (m) => j.push(m), dossierEtat: vide });
    expect(j.filter((m) => /aucun index/.test(m))).toHaveLength(2);
    const pass = await demarrer({ registre, signataire });
    try {
      const c = await connecter(pass.url, "bce", JETON);
      const e = await appelerMcp(c, "bce_rechercher", {}, { service: "bce", erreur: true });
      expect(e["message"]).toMatch(/Index BCE indisponible/);
    } finally {
      p?.fermer();
      await pass.arreter();
    }
  });

  it("sans jeton configuré (ou trop court, ou fichier trop ouvert) : rien n'est servi, le journal le dit sans citer de valeur", async () => {
    const cas: [Record<string, string>, RegExp][] = [
      [{}, /jeton d'accès absent/],
      [{ PASSERELLE_PROSPECTION_JETON: "court" }, /trop court/],
    ];
    const f = join(dossierTemporaire(), "jeton");
    writeFileSync(f, JETON);
    chmodSync(f, 0o644);
    cas.push([{ PASSERELLE_PROSPECTION_JETON_FICHIER: f }, /chmod 600/]);
    for (const [env, motif] of cas) {
      const registre = new RegistreFournisseurs();
      const j: string[] = [];
      expect(enregistrerProspectionReel(registre, env, { journal: (m) => j.push(m) })).toBeNull();
      expect(j.join("\n")).toMatch(motif);
      expect(j.join("\n")).not.toContain(JETON);
      expect(registre.obtenir("bce")).toBeUndefined();
      expect(registre.obtenir("osm")).toBeUndefined();
    }
    // Fichier 0600 : accepté.
    chmodSync(f, 0o600);
    const registre = new RegistreFournisseurs();
    const p = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON_FICHIER: f }, { dossierEtat: dossierTemporaire(), journal: () => undefined });
    expect(p?.services).toEqual(["bce", "osm", "bnb"]);
    p?.fermer();
  });
});
