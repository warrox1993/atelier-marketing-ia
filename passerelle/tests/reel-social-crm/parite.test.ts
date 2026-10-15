// Parité des catalogues : en réel, mêmes noms d'outils, mêmes schémas d'entrée (au paramètre facultatif
// `preuve_approbation` près, sur les mutations) et mêmes annotations qu'en démonstration (L7).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { construireCatalogue } from "../../src/outils.js";
import { enregistrerSocialCrm } from "../../src/demo/social-crm/enregistrer.js";
import { adressesFaussesSocialCrm, type ConfigSocialCrmReel } from "../../src/reel/social-crm/config.js";
import { construireSocialCrmReel } from "../../src/reel/social-crm/enregistrer.js";
import { IDENTIFIANTS } from "./faux-plateformes.js";

const SERVICES = ["facebook", "instagram", "linkedin", "crm", "pipedrive", "odoo", "teamleader"];
const dossier = mkdtempSync(join(tmpdir(), "passerelle-parite-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

function config(applications: ConfigSocialCrmReel["applications"]): ConfigSocialCrmReel {
  return {
    cle: Buffer.alloc(32, 1), fichierEtat: join(dossier, `etat-${Object.keys(applications).length}.json`), portAutorisation: 0,
    adresses: adressesFaussesSocialCrm("http://127.0.0.1:9"), essai: true, applications, clePubliqueApprobation: null,
    attenteQuotaMaxMs: 0, delaiAppelMs: 1000, urlRetourPublique: null,
  };
}

const TOUTES = { facebook: IDENTIFIANTS.meta, instagram: IDENTIFIANTS.instagram, linkedin: IDENTIFIANTS.linkedin, crm: IDENTIFIANTS.hubspot, pipedrive: IDENTIFIANTS.pipedrive, teamleader: IDENTIFIANTS.teamleader };

describe("parité démonstration / réel", () => {
  const demo = enregistrerSocialCrm(new RegistreFournisseurs());
  const reel = new RegistreFournisseurs();
  const social = construireSocialCrmReel(reel, {}, { hote: "127.0.0.1", urlPasserelle: () => "http://127.0.0.1:3190", config: config(TOUTES) })!;

  it("les sept services sont servis en réel quand toutes les applications sont configurées", () => {
    expect([...social.services].sort()).toEqual([...SERVICES].sort());
  });

  it("sans application OAuth, seuls Odoo et Pipedrive (jeton d'API) sont servis", () => {
    const r = new RegistreFournisseurs();
    const journal: string[] = [];
    const s = construireSocialCrmReel(r, {}, { hote: "127.0.0.1", urlPasserelle: () => "http://x", config: config({}), journal: (l) => journal.push(l) })!;
    expect([...s.services].sort()).toEqual(["odoo", "pipedrive"]);
    expect(r.obtenir("reel", "facebook")).toBeUndefined();
    expect(journal.join("\n")).toMatch(/facebook non servi en réel/);
    expect(journal.join("\n")).toMatch(/mutations réelles resteront « préparées, non exécutées »/);
  });

  for (const service of SERVICES) {
    it(`${service} : mêmes outils, mêmes schémas JSON, mêmes annotations`, () => {
      const fiche = demo.fiche(service)!;
      const catDemo = construireCatalogue(fiche, "demonstration", demo.obtenir("demonstration", service)).descripteurs;
      const catReel = construireCatalogue(fiche, "reel", reel.obtenir("reel", service)).descripteurs;
      expect(catReel.map((d) => d.name).sort()).toEqual(catDemo.map((d) => d.name).sort());
      for (const d of catDemo) {
        const r = catReel.find((x) => x.name === d.name)!;
        expect(r.annotations, d.name).toEqual(d.annotations);
        const schemaReel = structuredClone(r.inputSchema) as { properties?: Record<string, unknown>; required?: string[] };
        if (d.annotations?.readOnlyHint === false) {
          expect(schemaReel.properties?.["preuve_approbation"], d.name).toBeDefined();
          expect(schemaReel.required ?? [], d.name).not.toContain("preuve_approbation");
          delete schemaReel.properties!["preuve_approbation"];
        } else {
          expect(schemaReel.properties?.["preuve_approbation"], d.name).toBeUndefined();
        }
        expect(schemaReel, d.name).toEqual(d.inputSchema);
      }
    });
  }
});
