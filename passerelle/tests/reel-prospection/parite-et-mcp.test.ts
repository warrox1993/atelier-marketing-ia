// Lots P3 et P3b : parité des fournisseurs réels avec les simulateurs (mêmes outils, mêmes schémas d'entrée, mêmes formes de
// réponse), cohérence du simulateur `osm` avec le simulateur `bce` (P2), et service complet par une vraie passerelle lue par le
// client MCP du SDK : accès par jeton porteur statique, réponses SIGNÉES (aev1, ecriture: false), erreurs d'outil signées.

import { createHash, generateKeyPairSync } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs, type OutilPasserelle } from "../../src/fournisseurs.js";
import { outilChangements, outilEntreprise, outilRechercher } from "../../src/demo/prospection/bce.js";
import { enregistrerProspectionDemo } from "../../src/demo/prospection/enregistrer.js";
import { jeuProspection } from "../../src/demo/prospection/jeu.js";
import { enregistrerOsmDemo, outilCommerces, outilRepartition, poisOsmDemo, SOURCE_OSM_DEMO } from "../../src/demo/prospection/osm.js";
import { ATTRIBUTION_OSM, CATEGORIES_OSM } from "../../src/demo/prospection/osm-commun.js";
import { appliquerMiseAJour, importerComplet } from "../../src/reel/prospection/bce/importer.js";
import { IndexBce } from "../../src/reel/prospection/bce/index.js";
import { outilsBce } from "../../src/reel/prospection/bce/outils.js";
import { cheminsIndex, enregistrerProspectionReel, type ProspectionReelle } from "../../src/reel/prospection/enregistrer.js";
import { importerOsm } from "../../src/reel/prospection/osm/importer.js";
import { IndexOsm, outilsOsm } from "../../src/reel/prospection/osm/outils.js";
import { MENTION_DEMONSTRATION } from "../../src/services.js";
import { MENTION_DONNEES_TIERCES } from "../../src/outils.js";
import { PREFIXE_ENVELOPPE, SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { appeler as appelerDemo } from "../prospection/aide.js";
import { demarrer, obtenirJetons, type PasserelleDeTest } from "../aide.js";
import { appeler, dossierTemporaire, E, ecrireZip, fichierComplet, miseAJour134, N } from "./aide-bce.js";

const FIXTURE_OSM = new URL("./fixtures/extrait-osm.geojsonseq", import.meta.url).pathname;
const JETON = "jeton-de-prospection-de-test-0123456789abcdef";

/** Forme d'une valeur JSON : clés triées à chaque niveau, un élément représentatif par tableau, feuilles sans type (une valeur peut être nulle d'un côté). */
function forme(v: unknown): unknown {
  if (Array.isArray(v)) return v.length === 0 ? [] : [forme(v[0])];
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, forme((v as Record<string, unknown>)[k])]));
  return "*";
}
const cles = (o: Record<string, any>): string[] => Object.keys(o).sort();
const schemaJson = (o: OutilPasserelle): unknown => z.toJSONSchema(z.object(o.schemaEntree), { io: "input" });

describe("parité réel / démonstration", () => {
  let indexBce: IndexBce;
  let indexOsm: IndexOsm;
  let reelBce: OutilPasserelle[];
  let reelOsm: OutilPasserelle[];
  const demoBce = [outilRechercher, outilEntreprise, outilChangements];
  const demoOsm = [outilCommerces, outilRepartition];

  beforeAll(async () => {
    const d = dossierTemporaire();
    await importerComplet(ecrireZip(d, "c.zip", fichierComplet()), join(d, "bce.sqlite"));
    await appliquerMiseAJour(ecrireZip(d, "u.zip", miseAJour134()), join(d, "bce.sqlite"));
    indexBce = new IndexBce(join(d, "bce.sqlite"));
    reelBce = outilsBce(() => indexBce);
    await importerOsm(FIXTURE_OSM, join(d, "osm.sqlite"), { date: "2026-10-14" });
    indexOsm = new IndexOsm(join(d, "osm.sqlite"));
    reelOsm = outilsOsm(() => indexOsm);
  });
  afterAll(() => {
    indexBce.fermer();
    indexOsm.fermer();
  });

  it("mêmes noms d'outils, mêmes schémas d'entrée (JSON Schema identique), mêmes annotations, mêmes descriptions de recherche", () => {
    for (const [demo, reel] of [[demoBce, reelBce], [demoOsm, reelOsm]] as const) {
      expect(reel.map((o) => o.nom)).toEqual(demo.map((o) => o.nom));
      for (const o of demo) {
        const r = reel.find((x) => x.nom === o.nom)!;
        expect(schemaJson(r), o.nom).toEqual(schemaJson(o));
        expect(r.annotations, o.nom).toEqual(o.annotations);
      }
    }
    // Les descriptions sont identiques, sauf celle de bce_entreprise (le réel ne refuse pas les numéros valides).
    for (const nom of ["bce_rechercher", "bce_changements"]) expect(reelBce.find((o) => o.nom === nom)!.description).toBe(demoBce.find((o) => o.nom === nom)!.description);
    for (const o of demoOsm) expect(reelOsm.find((x) => x.nom === o.nom)!.description).toBe(o.description);
  });

  it("bce_rechercher : même forme d'entité (clés de chaque niveau) et mêmes clés de réponse, aux extras documentés près", async () => {
    const demo = await appelerDemo(outilRechercher, { nace: ["43"] });
    const dem = (demo["entreprises"] as any[]).find((e) => e.contacts.length > 0 && e.etablissements.length > 0) ?? (await appelerDemo(outilRechercher, {}))["entreprises"][0];
    const reel = await appeler(reelBce, "bce_rechercher", { nace: ["43.91"], communes: ["Ans"] });
    expect(forme(reel["entreprises"][0])).toEqual(forme(dem));
    // Clés de réponse : seules différences permises, listées ici.
    const demoSeul = cles(demo).filter((k) => !cles(reel).includes(k));
    const reelSeul = cles(reel).filter((k) => !cles(demo).includes(k));
    expect(demoSeul).toEqual(["client_demonstration", "note"]);
    expect(reelSeul).toEqual(["conditions", "date_extraction", "taille_note"]);
  });

  it("bce_entreprise : même forme pour une entreprise, une unité d'établissement et une absence", async () => {
    const jeu = jeuProspection();
    const avecEtab = jeu.entreprises.find((e) => e.etablissements.length > 0)!;
    const d1 = await appelerDemo(outilEntreprise, { numero: avecEtab.numero });
    const r1 = await appeler(reelBce, "bce_entreprise", { numero: N.toitures });
    expect(forme(r1["entreprise"])).toEqual(forme(d1["entreprise"]));
    const d2 = await appelerDemo(outilEntreprise, { numero: avecEtab.etablissements[0]!.numero });
    const r2 = await appeler(reelBce, "bce_entreprise", { numero: E.toituresAns });
    expect(forme(r2["etablissement"])).toEqual(forme(d2["etablissement"]));
    const d3 = await appelerDemo(outilEntreprise, { numero: jeu.radiees[0]!.numero });
    const r3 = await appeler(reelBce, "bce_entreprise", { numero: N.courtier });
    expect(cles(d3).filter((k) => !["client_demonstration", "note"].includes(k))).toEqual(cles(r3).filter((k) => !["conditions", "date_extraction"].includes(k)));
    expect(d3["trouve"]).toBe(false);
    expect(r3["trouve"]).toBe(false);
  });

  it("bce_changements : mêmes clés pour chaque type d'événement, mêmes clés de réponse aux extras près", async () => {
    const demo = await appelerDemo(outilChangements, { depuis: "2020-01-01" });
    const demoToutes: any[] = [];
    for (let page = 1; page <= demo["pages"]; page++) demoToutes.push(...(await appelerDemo(outilChangements, { depuis: "2020-01-01", page }))["changements"]);
    const reel = await appeler(reelBce, "bce_changements", { depuis: "2026-10-01" });
    for (const ev of reel["changements"] as any[]) {
      const modele = demoToutes.find((d) => d.type === ev.type);
      expect(modele, ev.type).toBeDefined();
      expect(cles(ev), ev.type).toEqual(cles(modele));
    }
    expect(cles(demo).filter((k) => !cles(reel).includes(k))).toEqual(["client_demonstration", "note"]);
    expect(cles(reel).filter((k) => !cles(demo).includes(k))).toEqual(["conditions", "couverture", "date_extraction"]);
  });

  it("osm_commerces et osm_repartition : même forme d'établissement et mêmes clés de réponse aux extras près", async () => {
    const demo = await appelerDemo(outilCommerces, { communes: ["Liège"] });
    const reel = await appeler(reelOsm, "osm_commerces", { communes: ["Liège"] });
    expect(forme(reel["commerces"][0])).toEqual(forme(demo["commerces"][0]));
    expect(cles(demo).filter((k) => !cles(reel).includes(k))).toEqual(["client_demonstration"]);
    expect(cles(reel).filter((k) => !cles(demo).includes(k))).toEqual([]);
    const dr = await appelerDemo(outilRepartition, {});
    const rr = await appeler(reelOsm, "osm_repartition", {});
    expect(forme(rr["repartition"][0])).toEqual(forme(dr["repartition"][0]));
    expect(cles(dr).filter((k) => !cles(rr).includes(k))).toEqual(["client_demonstration"]);
  });
});

describe("simulateur osm : cohérent avec bce (P2), fictif, déterministe", () => {
  const jeu = jeuProspection();

  it("les établissements issus de la BCE reprennent nom, adresse, téléphone et site de l'entreprise fictive", () => {
    const issus = poisOsmDemo().filter((p) => p.numeroBce !== null);
    expect(issus.length).toBeGreaterThanOrEqual(30);
    for (const p of issus) {
      const e = jeu.entreprises.find((x) => x.numero === p.numeroBce)!;
      expect(p.nom, p.id).toBe(e.denomination);
      expect(p.adresse).toEqual({ rue: e.siege.rue, numero: e.siege.numero, code_postal: e.siege.codePostal, commune: e.siege.commune });
      expect(p.telephone).toBe(e.telephone);
      expect(p.site).toBe(e.site);
    }
    // Des établissements sans entreprise correspondante complètent chaque commune.
    expect(poisOsmDemo().filter((p) => p.numeroBce === null).length).toBeGreaterThanOrEqual(10);
    // Les secteurs de P2 sans équivalent OSM de commerce (construction, transport) ne sont pas repris.
    const secteursRepris = new Set(issus.map((p) => jeu.entreprises.find((x) => x.numero === p.numeroBce)!.secteur));
    expect([...secteursRepris].sort()).toEqual(["commerce", "courtage", "couverture", "garage", "hotellerie", "isolation", "menuiserie", "restauration"]);
  });

  it("rien de réel : noms suffixés « (démonstration) », identifiants demo/, sites .demo-prospection.example, téléphones +32 4 000 00 NN, aucun courriel", async () => {
    const pages = await appelerDemo(outilCommerces, {});
    const tous: any[] = [];
    for (let page = 1; page <= pages["pages"]; page++) tous.push(...(await appelerDemo(outilCommerces, { page }))["commerces"]);
    expect(tous).toHaveLength(poisOsmDemo().length);
    for (const c of tous) {
      expect(c.nom, c.id).toContain("(démonstration)");
      expect(c.id).toMatch(/^demo\/n\d{4}$/);
      expect(c.url_osm).toBeNull();
      if (c.site) expect(new URL(c.site).hostname.endsWith(".demo-prospection.example"), c.site).toBe(true);
      if (c.telephone) expect(c.telephone, c.telephone).toMatch(/^\+32 4 000 00 [1-9]\d$/);
      expect(Object.keys(c)).not.toContain("courriel");
    }
    expect(JSON.stringify(tous)).not.toMatch(/@/);
    for (const cat of new Set(tous.map((c) => c.categorie))) expect(CATEGORIES_OSM).toContain(cat);
    expect(new Set(tous.map((c) => c.categorie)).size).toBeGreaterThanOrEqual(7);
  });

  it("déterminisme : mêmes paramètres, mêmes octets ; filtres de zone, catégorie et nom", async () => {
    const a = JSON.stringify(await appelerDemo(outilCommerces, { communes: ["Liège"], categories: ["restauration", "commerce"] }));
    expect(JSON.stringify(await appelerDemo(outilCommerces, { communes: ["Liège"], categories: ["restauration", "commerce"] }))).toBe(a);
    const empreinte = createHash("sha256").update(JSON.stringify(poisOsmDemo())).digest("hex");
    expect(empreinte).toBe(EMPREINTE_POIS);
    const hors = await appelerDemo(outilCommerces, { regions: ["Flandre"] });
    expect(hors["commerces"].every((c: any) => c.adresse.commune === "Gand")).toBe(true);
    expect((await appelerDemo(outilCommerces, { nom: "boulangerie" }))["total"]).toBe(1);
    expect((await appelerDemo(outilCommerces, { provinces: ["Namur"] }))["total"]).toBeGreaterThan(0);
    const r = await appelerDemo(outilRepartition, { regions: ["Wallonie"] });
    expect(r["lignes"]).toBeGreaterThan(5);
    expect(r["repartition"][0].nombre).toBeGreaterThanOrEqual(r["repartition"][1].nombre);
    expect(r["attribution"]).toBe(ATTRIBUTION_OSM);
  });
});

// Empreinte figée du jeu d'établissements fictifs (à changer seulement si le jeu change volontairement).
const EMPREINTE_POIS = "28ca98a08701a648d74837771219648da633152888a5b355e75bdffc1b4372df";

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

  async function appelerMcp(c: Client, nom: string, args: Record<string, unknown>, attendu: { service: string; mode: "reel" | "demonstration"; erreur?: boolean }): Promise<Record<string, any>> {
    const reponse = await c.callTool({ name: nom, arguments: args });
    const donnees = reponse["structuredContent"] as Record<string, any>;
    const texte = (reponse["content"] as { text: string }[])[0]!.text;
    expect(texte.startsWith(`${attendu.mode === "reel" ? MENTION_DONNEES_TIERCES : MENTION_DEMONSTRATION}\n\n`)).toBe(true);
    expect(donnees["_atelier"]).toMatchObject({ mode: attendu.mode });
    expect(String(donnees["_atelier"].signature).startsWith(PREFIXE_ENVELOPPE)).toBe(true);
    const verdict = verifierEnveloppe(donnees, signataire.clePubliqueBase64);
    expect(verdict.ok, nom).toBe(true);
    if (verdict.ok) expect(verdict.charge).toMatchObject({ v: 1, mode: attendu.mode, service: attendu.service, outil: nom, ecriture: false, executee: false, erreur: attendu.erreur === true });
    expect(reponse["isError"] === true).toBe(attendu.erreur === true);
    return donnees;
  }

  beforeAll(async () => {
    await importerComplet(ecrireZip(dossier, "c.zip", fichierComplet()), join(dossier, "bce.sqlite"));
    await appliquerMiseAJour(ecrireZip(dossier, "u.zip", miseAJour134()), join(dossier, "bce.sqlite"));
    await importerOsm(FIXTURE_OSM, join(dossier, "osm.sqlite"), { date: "2026-10-14" });
    const registre = new RegistreFournisseurs();
    prospection = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON: JETON, PASSERELLE_BCE_INDEX: join(dossier, "bce.sqlite"), PASSERELLE_OSM_INDEX: join(dossier, "osm.sqlite") }, { journal: (m) => journal.push(m) });
    passerelle = await demarrer({ mode: "reel", registre, signataire });
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
    const id = await appelerMcp(bce, "atelier_identite", {}, { service: "bce", mode: "reel" });
    expect(id).toMatchObject({ mode: "reel", service: "bce", propriete: { id: "registre/bce-local" } });
    const osm = await connecter(passerelle.url, "osm", JETON);
    expect((await osm.listTools()).tools.map((t) => t.name).sort()).toEqual(["atelier_identite", "osm_commerces", "osm_repartition"]);
  });

  it("bce_rechercher, bce_entreprise, bce_changements : réponses signées (aev1), ecriture: false, données réelles du fichier d'essai", async () => {
    const c = await connecter(passerelle.url, "bce", JETON);
    const r = await appelerMcp(c, "bce_rechercher", { nace: ["43.91"], provinces: ["Liège"] }, { service: "bce", mode: "reel" });
    expect(r["entreprises"].map((e: any) => e.EnterpriseNumber)).toEqual([N.toitures]);
    expect(r["taille_note"]).toMatch(/inconnue/);
    const e = await appelerMcp(c, "bce_entreprise", { numero: N.toitures }, { service: "bce", mode: "reel" });
    expect(e["entreprise"].EnterpriseNumber).toBe(N.toitures);
    const ch = await appelerMcp(c, "bce_changements", { depuis: "2026-10-01" }, { service: "bce", mode: "reel" });
    expect(ch["total"]).toBe(5);
  });

  it("osm_commerces et osm_repartition : réponses signées avec attribution ODbL", async () => {
    const c = await connecter(passerelle.url, "osm", JETON);
    const r = await appelerMcp(c, "osm_commerces", { categories: ["restauration"], communes: ["Liège"] }, { service: "osm", mode: "reel" });
    expect(r["attribution"]).toBe(ATTRIBUTION_OSM);
    expect(r["commerces"].map((x: any) => x.nom).sort()).toEqual(["Café Fictif Polygone", "Table Fictive"]);
    expect((await appelerMcp(c, "osm_repartition", {}, { service: "osm", mode: "reel" }))["attribution"]).toBe(ATTRIBUTION_OSM);
  });

  it("erreurs d'outil (arguments invalides, numéro mal formé) : isError, signées elles aussi", async () => {
    const c = await connecter(passerelle.url, "bce", JETON);
    const invalide = await appelerMcp(c, "bce_rechercher", { nace: ["abc"] }, { service: "bce", mode: "reel", erreur: true });
    expect(invalide["erreur"]).toBe("arguments_invalides");
    const mal = await appelerMcp(c, "bce_entreprise", { numero: "12" }, { service: "bce", mode: "reel", erreur: true });
    expect(mal["message"]).toMatch(/Numéro BCE invalide/);
  });

  it("index absent : service servi, outils en erreur claire ; journal du démarrage explicite", async () => {
    const vide = dossierTemporaire("passerelle-p3-vide-");
    const registre = new RegistreFournisseurs();
    const j: string[] = [];
    const p = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON: JETON }, { journal: (m) => j.push(m), dossierEtat: vide });
    expect(j.filter((m) => /aucun index/.test(m))).toHaveLength(2);
    const pass = await demarrer({ mode: "reel", registre, signataire });
    try {
      const c = await connecter(pass.url, "bce", JETON);
      const e = await appelerMcp(c, "bce_rechercher", {}, { service: "bce", mode: "reel", erreur: true });
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
      expect(registre.obtenir("reel", "bce")).toBeUndefined();
      expect(registre.obtenir("reel", "osm")).toBeUndefined();
    }
    // Fichier 0600 : accepté.
    chmodSync(f, 0o600);
    const registre = new RegistreFournisseurs();
    const p = enregistrerProspectionReel(registre, { PASSERELLE_PROSPECTION_JETON_FICHIER: f }, { dossierEtat: dossierTemporaire(), journal: () => undefined });
    expect(p?.services).toEqual(["bce", "osm", "bnb"]);
    p?.fermer();
  });

  it("démonstration : le service osm est servi avec la mention de démonstration et une enveloppe signée", async () => {
    const registre = enregistrerOsmDemo(enregistrerProspectionDemo(new RegistreFournisseurs()));
    const demo = await demarrer({ registre, signataire });
    try {
      const jeton = (await obtenirJetons(demo.url, "osm", "extrait/demo-osm")).access_token;
      const c = await connecter(demo.url, "osm", jeton);
      const { tools } = await c.listTools();
      for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      const r = await appelerMcp(c, "osm_commerces", { communes: ["Liège"], categories: ["finance_assurance"] }, { service: "osm", mode: "demonstration" });
      expect(r["source"]).toBe(SOURCE_OSM_DEMO);
      expect(r["client_demonstration"]).toBeTruthy();
      expect(r["commerces"].length).toBeGreaterThan(0);
    } finally {
      await demo.arreter();
    }
  });
});
