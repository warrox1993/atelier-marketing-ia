// Fichier d'essai lancé seulement par fuite-tmp.test.ts (PASSERELLE_ESSAI_FUITE=1) : chaque test crée ses dossiers par une
// aide de test puis échoue avant son propre nettoyage. Les dossiers doivent pourtant disparaître (AFC-A17).

import { describe, it } from "vitest";
import { monter as monterGoogle } from "../reel-google/aide-reel.js";
import { monter as monterSocial } from "../reel-social-crm/aide.js";
import { construireIndexDeTest } from "../reel-statbel/aide-statbel.js";

describe.runIf(process.env["PASSERELLE_ESSAI_FUITE"] === "1")("échecs volontaires", () => {
  it("statbel : index construit puis échec", async () => {
    await construireIndexDeTest();
    throw new Error("échec voulu");
  });

  it("google : montage arrêté sans nettoyer(), puis échec", async () => {
    const m = await monterGoogle();
    await m.arreter();
    throw new Error("échec voulu");
  });

  it("social : serveurs arrêtés un à un (comme un arreter() qui casse avant la suppression), puis échec", async () => {
    const m = await monterSocial();
    await m.social.arreter();
    await m.passerelle.arreter();
    await m.faux.arreter();
    await m.odoo19.arreter();
    await m.odoo17.arreter();
    throw new Error("échec voulu");
  });
});
