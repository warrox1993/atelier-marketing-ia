// Services réseaux sociaux et CRM : lesquels sont servis selon les applications configurées.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
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

describe("services servis selon la configuration", () => {
  const reel = new RegistreFournisseurs();
  const social = construireSocialCrmReel(reel, {}, { hote: "127.0.0.1", urlPasserelle: () => "http://127.0.0.1:3190", config: config(TOUTES) })!;

  it("les sept services sont servis quand toutes les applications sont configurées", () => {
    expect([...social.services].sort()).toEqual([...SERVICES].sort());
  });

  it("sans application OAuth, seuls Odoo et Pipedrive (jeton d'API) sont servis", () => {
    const r = new RegistreFournisseurs();
    const journal: string[] = [];
    const s = construireSocialCrmReel(r, {}, { hote: "127.0.0.1", urlPasserelle: () => "http://x", config: config({}), journal: (l) => journal.push(l) })!;
    expect([...s.services].sort()).toEqual(["odoo", "pipedrive"]);
    expect(r.obtenir("facebook")).toBeUndefined();
    expect(journal.join("\n")).toMatch(/facebook non servi en réel/);
    expect(journal.join("\n")).toMatch(/mutations réelles resteront « préparées, non exécutées »/);
  });
});
