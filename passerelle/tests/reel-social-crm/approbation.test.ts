// Preuve d'approbation : forme canonique, empreinte, signature Ed25519 et chaque motif de refus.

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { empreinteArguments, FRAICHEUR_REVOCATIONS_S, jsonCanonique, signerPreuve, signerRevocations, VerificateurPreuves, type ChargePreuve, type ChargeRevocations } from "../../src/reel/social-crm/approbation.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const autre = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const MAINTENANT = 1_790_000_000;
const ARGS = { message: "Bonjour Liège", link: "https://exemple.invalid/" };

const COMPTE = "100000000000001";

function charge(extra: Partial<ChargePreuve> = {}): ChargePreuve {
  return { v: 1, cle: "diffusion-0001", service: "facebook", outil: "facebook_publier", empreinte: empreinteArguments(ARGS), compte: COMPTE, diffusion: "d1", decision: "dec1", emis: MAINTENANT - 10, expire: MAINTENANT + 600, ...extra };
}

/** Liste de révocation signée par la clé d'approbation, comme la sert le plugin (vide par défaut, émise à l'instant). */
function liste(extra: Partial<ChargeRevocations> = {}, cle = privateKey): string {
  return signerRevocations(cle, { v: 1, entreprise: "ent-1", emis: MAINTENANT - 5, revoquees: [], ...extra });
}

const attendu = { service: "facebook", outil: "facebook_publier", args: ARGS, compte: COMPTE, maintenantS: MAINTENANT, revocations: liste() };

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
    ["sans compte (réseau social)", signerPreuve(privateKey, charge({ compte: null })), /sans compte pour le service facebook/],
    ["incomplète", signerPreuve(privateKey, { ...charge(), cle: "court" }), /incomplète/],
  ];
  for (const [nom, preuve, motif] of refus) {
    it(`refuse une preuve ${nom}`, () => {
      const r = v.verifier(preuve, attendu);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motif).toMatch(motif);
    });
  }

  it("accepte compte null pour un service CRM (le contrôle « sans compte » ne vise que les réseaux sociaux)", () => {
    const r = v.verifier(signerPreuve(privateKey, charge({ service: "crm", outil: "crm_modifier_contact", compte: null })), { ...attendu, service: "crm", outil: "crm_modifier_contact" });
    expect(r.ok).toBe(true);
  });

  it("une charge altérée après signature est refusée", () => {
    const [p, c, s] = signerPreuve(privateKey, charge()).split(".") as [string, string, string];
    const modifiee = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(c, "base64url").toString()), outil: "linkedin_publier" })).toString("base64url");
    expect(v.verifier(`${p}.${modifiee}.${s}`, attendu).ok).toBe(false);
  });

  it("sans clé publique configurée, aucune preuve n'est acceptée", () => {
    const r = new VerificateurPreuves(null).verifier(signerPreuve(privateKey, charge()), attendu);
    expect(r).toEqual({ ok: false, motif: expect.stringMatching(/PASSERELLE_APPROBATION_CLE_PUBLIQUE/) });
  });

  it("rotation de la clé du plugin : ancienne et nouvelle clé acceptées ensemble, une clé retirée n'est plus acceptée", () => {
    const nouvelle = generateKeyPairSync("ed25519");
    const pemNouvelle = nouvelle.publicKey.export({ type: "spki", format: "pem" }).toString();
    const double = new VerificateurPreuves(pem + pemNouvelle);
    // La liste de révocation est signée par la même clé que les preuves : elle suit la rotation.
    const attenduNouvelle = { ...attendu, revocations: liste({}, nouvelle.privateKey) };
    expect(double.verifier(signerPreuve(privateKey, charge()), attendu).ok).toBe(true);
    expect(double.verifier(signerPreuve(nouvelle.privateKey, charge()), attenduNouvelle).ok).toBe(true);
    expect(double.verifier(signerPreuve(autre.privateKey, charge()), attendu).ok).toBe(false);
    const seule = new VerificateurPreuves(pemNouvelle);
    expect(seule.verifier(signerPreuve(privateKey, charge()), attendu).ok).toBe(false);
    expect(seule.verifier(signerPreuve(nouvelle.privateKey, charge()), attenduNouvelle).ok).toBe(true);
    // Preuve de la nouvelle clé avec une liste signée par la clé retirée : refusée.
    expect(seule.verifier(signerPreuve(nouvelle.privateKey, charge()), attendu).ok).toBe(false);
  });

  it("refuse une clé publique qui n'est pas Ed25519", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => new VerificateurPreuves(rsa)).toThrow(/Ed25519/);
  });
});

describe("empreinte : les arguments de transport n'y entrent pas", () => {
  it("revocations_approbation est ignoré comme preuve_approbation (des deux côtés)", () => {
    expect(empreinteArguments({ ...ARGS, revocations_approbation: "arv1.x.y", preuve_approbation: "apv1.x.y" })).toBe(empreinteArguments(ARGS));
  });
});

describe("liste de révocation arv1 (revue S-7) : exigée, fraîche, signée, liée à l'entreprise", () => {
  const v = new VerificateurPreuves(pem);
  const preuveOk = signerPreuve(privateKey, charge());
  const refuse = (revocations: string | undefined, motif: RegExp, preuve = preuveOk): void => {
    const r = v.verifier(preuve, { ...attendu, revocations });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(motif);
  };

  it("accepte une liste vide, signée, fraîche", () => {
    expect(v.verifier(preuveOk, attendu).ok).toBe(true);
  });

  it("refuse l'absence de liste (preuve valide par ailleurs)", () => {
    refuse(undefined, /aucune liste de révocation récente/);
    refuse("   ", /aucune liste de révocation récente/);
  });

  it("refuse une liste périmée (plus de 5 minutes) mais accepte juste en dessous", () => {
    refuse(liste({ emis: MAINTENANT - FRAICHEUR_REVOCATIONS_S - 1 }), /trop ancienne/);
    expect(v.verifier(preuveOk, { ...attendu, revocations: liste({ emis: MAINTENANT - FRAICHEUR_REVOCATIONS_S }) }).ok).toBe(true);
  });

  it("refuse une liste émise dans le futur (au-delà de la dérive d'horloge)", () => {
    refuse(liste({ emis: MAINTENANT + 3600 }), /dans le futur/);
    expect(v.verifier(preuveOk, { ...attendu, revocations: liste({ emis: MAINTENANT + 60 }) }).ok).toBe(true);
  });

  it("refuse une liste signée par une autre clé, ou altérée après signature", () => {
    refuse(liste({}, autre.privateKey), /signature de la liste de révocation invalide/);
    const [p, c, s] = liste().split(".") as [string, string, string];
    const modifiee = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(c, "base64url").toString()), revoquees: [] , emis: MAINTENANT })).toString("base64url");
    refuse(`${p}.${modifiee}.${s}`, /signature de la liste de révocation invalide/);
  });

  it("une preuve apv1 ne vaut pas liste, et une liste ne vaut pas preuve (préfixe dans le corps signé)", () => {
    refuse(preuveOk, /liste de révocation illisible/);
    const r = v.verifier(liste(), attendu);
    expect(r).toEqual({ ok: false, motif: expect.stringMatching(/preuve d'approbation illisible/) });
  });

  it("refuse une liste de forme incorrecte", () => {
    refuse(signerRevocations(privateKey, { v: 2 as 1, entreprise: "ent-1", emis: MAINTENANT, revoquees: [] }), /liste de révocation incomplète/);
    refuse(signerRevocations(privateKey, { v: 1, entreprise: "", emis: MAINTENANT, revoquees: [] }), /liste de révocation incomplète/);
    refuse(signerRevocations(privateKey, { v: 1, entreprise: "ent-1", emis: MAINTENANT, revoquees: "x" as never }), /liste de révocation incomplète/);
    refuse(signerRevocations(privateKey, { v: 1, entreprise: "ent-1", emis: MAINTENANT, revoquees: [{ diffusion: 4 } as never] }), /liste de révocation incomplète/);
  });

  it("refuse une preuve dont la diffusion, la clé ou la décision est révoquée", () => {
    const entree = { diffusion: "autre", cle: "autre-cle-0001", decision: "autre-dec", expire: MAINTENANT + 600 };
    refuse(liste({ revoquees: [{ ...entree, diffusion: "d1" }] }), /révoquée/);
    refuse(liste({ revoquees: [{ ...entree, cle: "diffusion-0001" }] }), /révoquée/);
    refuse(liste({ revoquees: [{ ...entree, decision: "dec1" }] }), /révoquée/);
    // Une liste qui ne vise que d'autres preuves laisse passer celle-ci.
    expect(v.verifier(preuveOk, { ...attendu, revocations: liste({ revoquees: [entree] }) }).ok).toBe(true);
  });

  it("lie la liste à l'entreprise quand la preuve en porte une (liste vide d'une autre entreprise refusée)", () => {
    const avecEntreprise = signerPreuve(privateKey, charge({ entreprise: "ent-1" }));
    expect(v.verifier(avecEntreprise, attendu).ok).toBe(true);
    refuse(liste({ entreprise: "ent-2" }), /pas la même entreprise/, avecEntreprise);
    // Liste d'une autre entreprise qui révoquerait la preuve : refusée pour l'entreprise avant tout.
    refuse(liste({ entreprise: "ent-2", revoquees: [{ diffusion: "d1", cle: "diffusion-0001", decision: "dec1", expire: MAINTENANT + 600 }] }), /pas la même entreprise/, avecEntreprise);
  });

  it("une preuve sans champ entreprise (plugin avant v1.6.1) reste acceptée : aucune liaison possible", () => {
    expect(v.verifier(preuveOk, { ...attendu, revocations: liste({ entreprise: "n-importe-laquelle" }) }).ok).toBe(true);
  });

  it("refuse un champ entreprise mal formé dans la preuve", () => {
    const r = v.verifier(signerPreuve(privateKey, charge({ entreprise: 5 as never })), attendu);
    expect(r).toEqual({ ok: false, motif: expect.stringMatching(/incomplète/) });
  });

  it("une preuve expirée ou autre refus de preuve passe avant la liste (message de la preuve)", () => {
    const r = v.verifier(signerPreuve(privateKey, charge({ expire: MAINTENANT - 1 })), { ...attendu, revocations: undefined });
    expect(r).toEqual({ ok: false, motif: expect.stringMatching(/expirée/) });
  });
});
