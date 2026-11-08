/**
 * DROIT-2.1 et DROIT-2.2 (audit du 29/10/2026) : avant de créer la carte d'envoi, le plugin rapproche chaque adresse ciblée de ses
 * oppositions (art. 21, § 3 RGPD) et exige une base légale « courriel » enregistrée (consentement ou client existant, produits analogues).
 */
import { describe, expect, it } from "vitest";
import type { BaseAtelier } from "../src/serveur/base.js";
import { empreinte } from "../src/serveur/chiffrement-donnees.js";
import { controlerDestinatairesCourriel, type ClesDonnees } from "../src/serveur/services-prospection.js";
import { SOC } from "./outils-base.js";

const CLES: ClesDonnees = { chiffrement: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2), origine: "coffre" };
const h = (c: string) => empreinte("courriel", c, CLES.hmac);

function base(o: { oppositions?: Array<{ courriel: string; canal: string }>; prospects?: Array<{ id: string; courriel: string; bases: Array<{ canal: string; base: string }> }> }) {
  return {
    oppositionsPour: async (_c: string, v: string[]) => (o.oppositions ?? []).map((x) => ({ type: "courriel", valeur: h(x.courriel), canal: x.canal })).filter((x) => v.includes(x.valeur)),
    empreintesProspectsEnBase: async (_c: string, v: string[]) => (o.prospects ?? []).map((p) => ({ prospectId: p.id, type: "courriel", valeur: h(p.courriel) })).filter((x) => v.includes(x.valeur)),
    detailsProspects: async (_c: string, ids: string[]) => ({
      empreintes: new Map(), scores: new Map(),
      bases: new Map((o.prospects ?? []).filter((p) => ids.includes(p.id)).map((p) => [p.id, p.bases])),
    }),
  } as unknown as BaseAtelier;
}

describe("contrôle des destinataires d'une campagne e-mail", () => {
  it("adresse avec consentement ou client existant enregistré, sans opposition : acceptée", async () => {
    const b = base({ prospects: [
      { id: "p1", courriel: "un@exemple.test", bases: [{ canal: "courriel", base: "consentement" }] },
      { id: "p2", courriel: "deux@exemple.test", bases: [{ canal: "courriel", base: "client_existant_produits_analogues" }] },
      // Matrice §3.2 (AR du 4/4/2003, art. 1er) : adresse impersonnelle d'une personne morale, base vérifiée par un humain.
      { id: "p3", courriel: "info@exemple.test", bases: [{ canal: "courriel", base: "personne_morale_adresse_impersonnelle" }] },
    ] });
    expect(await controlerDestinatairesCourriel(b, CLES, SOC, ["un@exemple.test", "Deux@Exemple.test", "info@exemple.test"])).toEqual({ opposes: 0, sansBase: 0 });
  });

  it("adresse dans les oppositions (courriel ou tous canaux) : comptée opposée, même avec un consentement", async () => {
    const b = base({
      oppositions: [{ courriel: "un@exemple.test", canal: "courriel" }, { courriel: "deux@exemple.test", canal: "tous" }, { courriel: "trois@exemple.test", canal: "telephone" }],
      prospects: ["un", "deux", "trois"].map((n) => ({ id: n, courriel: `${n}@exemple.test`, bases: [{ canal: "courriel", base: "consentement" }] })),
    });
    expect(await controlerDestinatairesCourriel(b, CLES, SOC, ["un@exemple.test", "deux@exemple.test", "trois@exemple.test"])).toEqual({ opposes: 2, sansBase: 0 });
  });

  it("adresse inconnue de l'atelier, base d'un autre canal ou adresse illisible : sans base", async () => {
    const b = base({ prospects: [
      { id: "p1", courriel: "tel@exemple.test", bases: [{ canal: "telephone", base: "interet_legitime" }, { canal: "courrier", base: "interet_legitime" }] },
    ] });
    expect(await controlerDestinatairesCourriel(b, CLES, SOC, ["inconnu@exemple.test", "tel@exemple.test", "  "])).toEqual({ opposes: 0, sansBase: 3 });
  });

  it("adresse opposée ET sans base « courriel » : comptée opposée et sans base (envoi refusé faute de base légale)", async () => {
    const b = base({
      oppositions: [{ courriel: "un@exemple.test", canal: "courriel" }],
      prospects: [{ id: "p1", courriel: "un@exemple.test", bases: [{ canal: "telephone", base: "interet_legitime" }] }],
    });
    expect(await controlerDestinatairesCourriel(b, CLES, SOC, ["un@exemple.test", "Deux@Exemple.test"])).toEqual({ opposes: 1, sansBase: 2 });
  });
});
