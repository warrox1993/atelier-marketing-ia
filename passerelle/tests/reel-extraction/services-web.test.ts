// Services « extraction » et « audit » dans la passerelle : catalogue, réponses SIGNÉES et adresse privée refusée de bout en bout
// (filtre de production, aucun conteneur ni navigateur lancé).

import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { fournisseurExtractionReel } from "../../src/reel/extraction/extraire-site.js";
import { fournisseurAuditReel } from "../../src/reel/audit/auditer-page.js";
import { lireServicesLocaux } from "../../src/config.js";
import { SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { demarrer, obtenirJetons, rpc, type PasserelleDeTest } from "../aide.js";

const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);

describe("services locaux extraction et audit", () => {
  let p: PasserelleDeTest;
  const jetons: Record<string, string> = {};

  beforeAll(async () => {
    const registre = new RegistreFournisseurs()
      .enregistrer(fournisseurExtractionReel({ jeton: "essai", appel: async () => { throw new Error("ne doit jamais être appelé"); } }))
      .enregistrer(fournisseurAuditReel({ lanceur: async () => { throw new Error("ne doit jamais être lancé"); } }));
    p = await demarrer({ registre, signataire });
    jetons["extraction"] = (await obtenirJetons(p.url, "extraction", "web/public")).access_token;
    jetons["audit"] = (await obtenirJetons(p.url, "audit", "web/public")).access_token;
  });
  afterAll(async () => { await p.arreter(); });

  it("config : extraction et audit sont des services locaux permis", () => {
    expect(lireServicesLocaux({ PASSERELLE_SERVICES_REELS: "osm,liens,extraction,audit" })).toEqual(["osm", "liens", "extraction", "audit"]);
  });

  it.each([["extraction", "extraire_site"], ["audit", "auditer_page"]] as const)("%s : catalogue atelier_identite + %s, en lecture seule", async (service, outil) => {
    const r = await rpc(p.url, service, "tools/list", {}, jetons[service] as string);
    const outils = r.corps.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
    expect(outils.map((o) => o.name).sort()).toEqual(["atelier_identite", outil]);
    expect(outils.find((o) => o.name === outil)?.annotations?.readOnlyHint).toBe(true);
  });

  it.each([["extraction", "extraire_site"], ["audit", "auditer_page"]] as const)("%s : adresse privée refusée, réponse signée, mode réel", async (service, outil) => {
    for (const url of ["http://127.0.0.1:11235/", "http://127.1.2.3/", "http://169.254.169.254/latest/meta-data/", "http://localhost/"]) {
      const r = await rpc(p.url, service, "tools/call", { name: outil, arguments: { url } }, jetons[service] as string);
      const s = r.corps.result.structuredContent as Record<string, unknown>;
      expect(String(s["erreur"]), url).toMatch(/refusée/);
      const v = verifierEnveloppe(s, signataire.clePubliqueBase64);
      expect(v.ok, url).toBe(true);
      if (v.ok) expect(v.charge).toMatchObject({ mode: "reel", service, outil, erreur: false, ecriture: false });
    }
  });
});
