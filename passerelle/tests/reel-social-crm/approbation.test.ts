// Preuve d'approbation : forme canonique, empreinte, signature Ed25519 et chaque motif de refus.

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { empreinteArguments, jsonCanonique, signerPreuve, VerificateurPreuves, type ChargePreuve } from "../../src/reel/social-crm/approbation.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const autre = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const MAINTENANT = 1_790_000_000;
const ARGS = { message: "Bonjour Liège", link: "https://exemple.invalid/" };

function charge(extra: Partial<ChargePreuve> = {}): ChargePreuve {
  return { v: 1, cle: "diffusion-0001", service: "facebook", outil: "facebook_publier", empreinte: empreinteArguments(ARGS), compte: null, diffusion: "d1", decision: "dec1", emis: MAINTENANT - 10, expire: MAINTENANT + 600, ...extra };
}

const attendu = { service: "facebook", outil: "facebook_publier", args: ARGS, compte: "100000000000001", maintenantS: MAINTENANT };

describe("forme canonique et empreinte", () => {
  it("trie les clés, sans espace, ordre des tableaux conservé", () => {
    expect(jsonCanonique({ b: 1, a: [3, { d: true, c: null }], é: "x" })).toBe('{"a":[3,{"c":null,"d":true}],"b":1,"é":"x"}');
  });
  it("l'empreinte ignore preuve_approbation et l'ordre des clés", () => {
    expect(empreinteArguments({ link: ARGS.link, message: ARGS.message, preuve_approbation: "apv1.x.y" })).toBe(empreinteArguments(ARGS));
    expect(empreinteArguments({ ...ARGS, message: "Bonjour Liège !" })).not.toBe(empreinteArguments(ARGS));
  });
});

describe("vérification", () => {
  const v = new VerificateurPreuves(pem);

  it("accepte une preuve valide", () => {
    const r = v.verifier(signerPreuve(privateKey, charge()), attendu);
    expect(r.ok).toBe(true);
  });

  const refus: [string, string, RegExp][] = [
    ["absente", "", /aucune preuve/],
    ["illisible", "n'importe quoi", /illisible/],
    ["autre clé de signature", signerPreuve(autre.privateKey, charge()), /signature/],
    ["expirée", signerPreuve(privateKey, charge({ expire: MAINTENANT - 1 })), /expirée/],
    ["émise dans le futur", signerPreuve(privateKey, charge({ emis: MAINTENANT + 3600, expire: MAINTENANT + 7200 })), /futur/],
    ["trop longue", signerPreuve(privateKey, charge({ emis: MAINTENANT, expire: MAINTENANT + 8 * 86_400 })), /7 jours/],
    ["autre service", signerPreuve(privateKey, charge({ service: "linkedin" })), /service linkedin/],
    ["autre outil", signerPreuve(privateKey, charge({ outil: "facebook_envoyer_message" })), /outil/],
    ["autre contenu", signerPreuve(privateKey, charge({ empreinte: empreinteArguments({ message: "autre" }) })), /contenu demandé diffère/],
    ["autre compte", signerPreuve(privateKey, charge({ compte: "100000000000002" })), /compte 100000000000002/],
    ["incomplète", signerPreuve(privateKey, { ...charge(), cle: "court" }), /incomplète/],
  ];
  for (const [nom, preuve, motif] of refus) {
    it(`refuse une preuve ${nom}`, () => {
      const r = v.verifier(preuve, attendu);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motif).toMatch(motif);
    });
  }

  it("une charge altérée après signature est refusée", () => {
    const [p, c, s] = signerPreuve(privateKey, charge()).split(".") as [string, string, string];
    const modifiee = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(c, "base64url").toString()), outil: "linkedin_publier" })).toString("base64url");
    expect(v.verifier(`${p}.${modifiee}.${s}`, attendu).ok).toBe(false);
  });

  it("sans clé publique configurée, aucune preuve n'est acceptée", () => {
    const r = new VerificateurPreuves(null).verifier(signerPreuve(privateKey, charge()), attendu);
    expect(r).toEqual({ ok: false, motif: expect.stringMatching(/PASSERELLE_APPROBATION_CLE_PUBLIQUE/) });
  });

  it("refuse une clé publique qui n'est pas Ed25519", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => new VerificateurPreuves(rsa)).toThrow(/Ed25519/);
  });
});
