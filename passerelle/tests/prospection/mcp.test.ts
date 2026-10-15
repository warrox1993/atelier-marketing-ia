// Lot P2 : bce, bnb et fsma servis par une vraie passerelle de démonstration, lus par le client MCP officiel du SDK.
// Vérifie le catalogue (lecture seule), la mention de démonstration, `_atelier` et l'enveloppe SIGNÉE (aev1) sur
// chaque réponse : lecture (ecriture et executee faux), erreur d'outil et arguments invalides inclus.

import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { enregistrerProspectionDemo, SERVICES_PROSPECTION } from "../../src/demo/prospection/enregistrer.js";
import { jeuProspection } from "../../src/demo/prospection/jeu.js";
import { NOM_ASSUREUR_PAR_DEFAUT } from "../../src/demo/prospection/referentiel.js";
import { MENTION_DEMONSTRATION } from "../../src/services.js";
import { SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { demarrer, obtenirJetons, type PasserelleDeTest } from "../aide.js";

type Contenu = { type: string; text: string };

const PROPRIETES: Record<string, string> = { bce: "registre/demo-bce", bnb: "centrale/demo-bnb", fsma: "registre/demo-fsma" };
const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);

describe("passerelle de démonstration + simulateurs de prospection, via le client MCP du SDK", () => {
  let p: PasserelleDeTest;
  const clients = new Map<string, Client>();
  const jeu = jeuProspection();

  async function client(service: string): Promise<Client> {
    const deja = clients.get(service);
    if (deja) return deja;
    const jeton = (await obtenirJetons(p.url, service, PROPRIETES[service])).access_token;
    const c = new Client({ name: "essai-prospection", version: "0.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${p.url}/mcp/${service}`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
    clients.set(service, c);
    return c;
  }

  async function appeler(service: string, nom: string, args: Record<string, unknown>): Promise<{ donnees: Record<string, any>; erreur: boolean }> {
    const reponse = await (await client(service)).callTool({ name: nom, arguments: args });
    const texte = (reponse["content"] as Contenu[])[0]!.text;
    expect(texte.startsWith(`${MENTION_DEMONSTRATION}\n\n`)).toBe(true);
    const donnees = reponse["structuredContent"] as Record<string, any>;
    expect(donnees["_atelier"]).toMatchObject({ mode: "demonstration", mention: MENTION_DEMONSTRATION });
    // Enveloppe signée : valide, liée au service et à l'outil, outil de lecture (ni écriture ni exécution).
    const verdict = verifierEnveloppe(donnees, signataire.clePubliqueBase64);
    expect(verdict.ok, nom).toBe(true);
    if (verdict.ok) {
      expect(verdict.charge).toMatchObject({ v: 1, mode: "demonstration", service, outil: nom, ecriture: false, executee: false });
      expect(verdict.charge.erreur).toBe(reponse["isError"] === true);
    }
    return { donnees, erreur: reponse["isError"] === true };
  }

  beforeAll(async () => {
    p = await demarrer({ registre: enregistrerProspectionDemo(new RegistreFournisseurs()), signataire });
  });
  afterAll(async () => {
    for (const c of clients.values()) await c.close();
    await p.arreter();
  });

  it("catalogue : chaque service expose ses outils, tous en lecture seule", async () => {
    const attendu: Record<string, string[]> = {
      bce: ["bce_rechercher", "bce_entreprise", "bce_changements"],
      bnb: ["bnb_comptes"],
      fsma: ["fsma_intermediaire", "fsma_rechercher"],
    };
    expect(Object.keys(attendu).sort()).toEqual([...SERVICES_PROSPECTION].sort());
    for (const [service, noms] of Object.entries(attendu)) {
      const { tools } = await (await client(service)).listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["atelier_identite", ...noms].sort());
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        if (t.name !== "atelier_identite") expect(t.annotations?.destructiveHint, t.name).toBe(false);
        expect(t.inputSchema.type).toBe("object");
      }
    }
  });

  it("bce_rechercher : secteur × zone × taille, réponse signée, client de démonstration nommé", async () => {
    const { donnees, erreur } = await appeler("bce", "bce_rechercher", { nace: ["43"], communes: ["Liège"], taille: ["micro", "petite"] });
    expect(erreur).toBe(false);
    expect(donnees["client_demonstration"]).toBe(NOM_ASSUREUR_PAR_DEFAUT);
    expect(donnees["total"]).toBeGreaterThan(0);
    for (const e of donnees["entreprises"]) expect(e.activites[0].NaceCode.startsWith("43")).toBe(true);
  });

  it("bce_entreprise, bnb_comptes, fsma_intermediaire : même entreprise, trois sources", async () => {
    const f = jeu.fsma.find((x) => x.dansBce && x.statut === "Inscrit")!;
    const bce = await appeler("bce", "bce_entreprise", { numero: f.numeroBce });
    expect(bce.donnees["entreprise"].denominations[0].Denomination).toBe(f.denomination);
    const bnb = await appeler("bnb", "bnb_comptes", { numero: f.numeroBce });
    expect(bnb.donnees["EnterpriseNumber"]).toBe(f.numeroBce);
    const fsma = await appeler("fsma", "fsma_intermediaire", { numero: f.numeroBce });
    expect(fsma.donnees["intermediaires"][0].categorie).toBe(f.categorie);
  });

  it("erreurs d'outil (numéro mal formé, arguments invalides) : signées aussi, en français", async () => {
    const mal = await appeler("bce", "bce_entreprise", { numero: "0123.456.78" });
    expect(mal.erreur).toBe(true);
    expect(mal.donnees["message"]).toMatch(/10 chiffres attendus/);
    const invalide = await appeler("bce", "bce_rechercher", { taille: ["geante"] });
    expect(invalide.erreur).toBe(true);
    expect(invalide.donnees["erreur"]).toBe("arguments_invalides");
    const sans = await appeler("fsma", "fsma_intermediaire", {});
    expect(sans.erreur).toBe(true);
  });

  it("atelier_identite : mode démonstration pour les trois services", async () => {
    for (const service of SERVICES_PROSPECTION) {
      const { donnees } = await appeler(service, "atelier_identite", {});
      expect(donnees["mode"]).toBe("demonstration");
      expect(donnees["service"]).toBe(service);
    }
  });
});
