// Revue des signatures (docs/revue-securite-signatures.md), côté passerelle : preuves d'exploitation F-B (S-3),
// F-E (S-5) et garde S-8 transformées en tests de non-régression. Chaque test décrit l'exploitation d'origine et
// vérifie qu'elle échoue désormais.

import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construireSocialCrmReel } from "../../src/reel/social-crm/enregistrer.js";
import type { ConfigSocialCrmReel } from "../../src/reel/social-crm/config.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { empreinteArgumentsAppel, SignataireEnveloppe, verifierEnveloppe } from "../../src/signature-enveloppe.js";
import { appelerOutil, construireCatalogue } from "../../src/outils.js";
import { FICHES_PAR_DEFAUT } from "../../src/services.js";
import { clientMcp, connecter, monter, preuve, type Montage, listeRevocations } from "./aide.js";

const paireSignature = generateKeyPairSync("ed25519");
const signataire = new SignataireEnveloppe(paireSignature.privateKey);
const PUBLIQUE = signataire.clePubliqueBase64;

let m: Montage;
let clientA: Client;
let clientB: Client;
beforeAll(async () => {
  m = await monter({ signataire });
  // Deux comptes Facebook (deux Pages) servis par la même passerelle : A = 100000000000001, B = 100000000000002.
  clientA = await clientMcp(m, "facebook", (await connecter(m, "facebook", { choix: 0 })).jetons.access_token);
  clientB = await clientMcp(m, "facebook", (await connecter(m, "facebook", { choix: 1 })).jetons.access_token);
});
afterAll(async () => {
  await clientA.close();
  await clientB.close();
  await m.arreter();
});

/** Réponse brute (structure signée comprise) d'un appel d'outil. */
async function brute(c: Client, nom: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const r = await c.callTool({ name: nom, arguments: args });
  return r["structuredContent"] as Record<string, any>;
}

const publications = (page: string): number => m.faux.appelsVers(`POST /meta-graph/v26.0/${page}/feed`).length;

describe("S-3 : la réponse d'un outil d'écriture n'est jamais signée comme une mesure", () => {
  it("F-B : écriture appelée SANS preuve (« préparée ») : signée avec ecriture = vrai et executee = faux, à refuser au dépôt de données", async () => {
    const s = await brute(clientA, "facebook_publier", { message: "Chiffres inventés : 48211 sessions" });
    expect(s["etat"]).toBe("preparee");
    const v = verifierEnveloppe(s, PUBLIQUE);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // L'indicateur que le plugin refusera : ce n'est pas une donnée de mesure.
    expect(v.charge).toMatchObject({ mode: "reel", outil: "facebook_publier", ecriture: true, executee: false });
  });

  it("l'indicateur est signé : le passer à faux invalide la signature (l'agent ne peut pas « blanchir » la réponse)", async () => {
    const s = await brute(clientA, "facebook_publier", { message: "Texte quelconque" });
    const morceaux = (s["_atelier"].signature as string).split(".");
    const charge = JSON.parse(Buffer.from(morceaux[1]!, "base64url").toString("utf8"));
    charge.ecriture = false;
    const forgee = structuredClone(s);
    forgee["_atelier"].signature = [morceaux[0], Buffer.from(JSON.stringify(charge), "utf8").toString("base64url"), morceaux[2]].join(".");
    expect(verifierEnveloppe(forgee, PUBLIQUE)).toEqual({ ok: false, motif: "signature invalide" });
  });

  it("écriture réellement exécutée : ecriture = vrai aussi (exécutée = vrai seulement sur le témoignage de l'outil)", async () => {
    const args = { message: "Publication approuvée S-3" };
    const p = preuve(m, "facebook", "facebook_publier", args, { compte: "100000000000001" });
    const s = await brute(clientA, "facebook_publier", { ...args, preuve_approbation: p, revocations_approbation: listeRevocations(m) });
    expect(s["etat"]).toBe("executee");
    const v = verifierEnveloppe(s, PUBLIQUE);
    expect(v.ok && v.charge.ecriture).toBe(true);
    expect(v.ok && v.charge.executee).toBe(true);
  });

  it("outil de lecture : ecriture = faux (seule réponse qui peut valoir mesure)", async () => {
    const s = await brute(clientA, "facebook_publications", { debut: "2026-09-01", fin: "2026-09-28", limit: 1 });
    const v = verifierEnveloppe(s, PUBLIQUE);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.charge).toMatchObject({ ecriture: false, executee: false });
  });
});

describe("S-5 : le journal d'idempotence est indexé par compte + service + outil + clé", () => {
  it("F-E : même clé et mêmes arguments sur un AUTRE compte : exécuté pour ce compte, jamais le résultat du premier", async () => {
    const args = { message: "Même texte, même clé, deux comptes" };
    const cle = "diffusion-cle-partagee-s5";
    const pA = preuve(m, "facebook", "facebook_publier", args, { cle, compte: "100000000000001" });
    const pB = preuve(m, "facebook", "facebook_publier", args, { cle, compte: "100000000000002" });
    const avantA = publications("100000000000001");
    const avantB = publications("100000000000002");

    const a = await brute(clientA, "facebook_publier", { ...args, preuve_approbation: pA, revocations_approbation: listeRevocations(m) });
    expect(a).toMatchObject({ etat: "executee", rejeu: false });
    const b = await brute(clientB, "facebook_publier", { ...args, preuve_approbation: pB, revocations_approbation: listeRevocations(m) });
    // Avant la correction : rejeu = vrai, résultat de A, rien publié chez B.
    expect(b).toMatchObject({ etat: "executee", rejeu: false });
    expect(String(b["resultat"].id)).toMatch(/^100000000000002_/);
    expect(b["resultat"]).not.toEqual(a["resultat"]);
    expect(publications("100000000000001")).toBe(avantA + 1);
    expect(publications("100000000000002")).toBe(avantB + 1);

    // Le rejeu légitime, lui, reste protégé pour chaque compte (aucun nouvel envoi).
    const a2 = await brute(clientA, "facebook_publier", { ...args, preuve_approbation: pA, revocations_approbation: listeRevocations(m) });
    const b2 = await brute(clientB, "facebook_publier", { ...args, preuve_approbation: pB, revocations_approbation: listeRevocations(m) });
    expect(a2).toMatchObject({ etat: "executee", rejeu: true, resultat: a["resultat"] });
    expect(b2).toMatchObject({ etat: "executee", rejeu: true, resultat: b["resultat"] });
    expect(publications("100000000000001")).toBe(avantA + 1);
    expect(publications("100000000000002")).toBe(avantB + 1);
  });

  it("même clé et texte différent sur un autre compte : plus de déni de service (le compte B publie)", async () => {
    const cle = "diffusion-cle-partagee-s5-dos";
    const pA = preuve(m, "facebook", "facebook_publier", { message: "Texte de A" }, { cle, compte: "100000000000001" });
    const pB = preuve(m, "facebook", "facebook_publier", { message: "Texte de B" }, { cle, compte: "100000000000002" });
    expect((await brute(clientA, "facebook_publier", { message: "Texte de A", preuve_approbation: pA, revocations_approbation: listeRevocations(m) }))["etat"]).toBe("executee");
    const b = await brute(clientB, "facebook_publier", { message: "Texte de B", preuve_approbation: pB, revocations_approbation: listeRevocations(m) });
    expect(b).toMatchObject({ etat: "executee", rejeu: false });
  });

  it("sur le même compte, une clé réutilisée pour un autre contenu reste refusée", async () => {
    const cle = "diffusion-cle-meme-compte-s5";
    const p1 = preuve(m, "facebook", "facebook_publier", { message: "Un" }, { cle, compte: "100000000000001" });
    const p2 = preuve(m, "facebook", "facebook_publier", { message: "Deux" }, { cle, compte: "100000000000001" });
    expect((await brute(clientA, "facebook_publier", { message: "Un", preuve_approbation: p1, revocations_approbation: listeRevocations(m) }))["etat"]).toBe("executee");
    const r = await brute(clientA, "facebook_publier", { message: "Deux", preuve_approbation: p2, revocations_approbation: listeRevocations(m) });
    expect(r["etat"]).toBe("preparee");
    expect(r["message"]).toMatch(/déjà servi pour une autre action/);
  });
});

describe("S-8 : refus de démarrer si la clé de signature est la clé publique d'approbation", () => {
  it("construireSocialCrmReel lève une erreur claire, sans citer de clé", () => {
    const config = { applications: {}, clePubliqueApprobation: paireSignature.publicKey.export({ type: "spki", format: "pem" }).toString() } as unknown as ConfigSocialCrmReel;
    const essai = (): unknown => construireSocialCrmReel(new RegistreFournisseurs(), {}, { hote: "127.0.0.1", urlPasserelle: () => "http://127.0.0.1:1", config, signataire });
    expect(essai).toThrow(/même paire de clés/);
    try {
      essai();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(PUBLIQUE);
    }
  });

  it("clés distinctes, absence de signataire ou de clé d'approbation : aucune erreur de séparation", () => {
    const autre = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const base = { applications: {} };
    const lancer = (cfg: unknown, sig: SignataireEnveloppe | null): unknown =>
      construireSocialCrmReel(new RegistreFournisseurs(), {}, { hote: "127.0.0.1", urlPasserelle: () => "http://127.0.0.1:1", config: cfg as ConfigSocialCrmReel, signataire: sig });
    // Ces configurations incomplètes peuvent échouer plus loin (coffre absent) mais jamais sur la séparation des clés.
    for (const [cfg, sig] of [[{ ...base, clePubliqueApprobation: autre }, signataire], [{ ...base, clePubliqueApprobation: null }, signataire], [{ ...base, clePubliqueApprobation: autre }, null]] as const) {
      try {
        lancer(cfg, sig);
      } catch (e) {
        expect(String((e as Error).message)).not.toMatch(/même paire de clés/);
      }
    }
  });

  it("rotation : une seule des clés d'approbation égale à la clé de signature suffit à refuser", () => {
    const autre = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const pem = autre + paireSignature.publicKey.export({ type: "spki", format: "pem" }).toString();
    const config = { applications: {}, clePubliqueApprobation: pem } as unknown as ConfigSocialCrmReel;
    expect(() => construireSocialCrmReel(new RegistreFournisseurs(), {}, { hote: "127.0.0.1", urlPasserelle: () => "http://127.0.0.1:1", config, signataire })).toThrow(/même paire de clés/);
  });
});

describe("S-7 : liste de révocation arv1 exigée avant toute mutation réelle", () => {
  const A = "100000000000001";
  /** Appelle facebook_publier avec une preuve et la liste donnée ; vérifie que rien n'est publié quand `refus`. */
  async function essai(args: Record<string, unknown>, preuveJeton: string, revocations: string | undefined): Promise<Record<string, any>> {
    return brute(clientA, "facebook_publier", { ...args, preuve_approbation: preuveJeton, ...(revocations === undefined ? {} : { revocations_approbation: revocations }) });
  }

  it("sans liste : préparée avec un message clair, rien n'est publié (preuve valide par ailleurs)", async () => {
    const args = { message: "Sans liste de révocation" };
    const avant = publications(A);
    const r = await essai(args, preuve(m, "facebook", "facebook_publier", args), undefined);
    expect(r["etat"]).toBe("preparee");
    expect(r["message"]).toMatch(/aucune liste de révocation récente.*revocations_approbation/);
    expect(publications(A)).toBe(avant);
  });

  it("liste périmée (6 minutes) : préparée, rien n'est publié", async () => {
    const args = { message: "Liste trop ancienne" };
    const avant = publications(A);
    const r = await essai(args, preuve(m, "facebook", "facebook_publier", args), listeRevocations(m, { emis: Math.floor(Date.now() / 1000) - 6 * 60 }));
    expect(r["etat"]).toBe("preparee");
    expect(r["message"]).toMatch(/trop ancienne/);
    expect(publications(A)).toBe(avant);
  });

  it("preuve révoquée (la liste fraîche cite sa diffusion) : préparée, rien n'est publié", async () => {
    const args = { message: "Preuve révoquée par l'humain" };
    const avant = publications(A);
    const p = preuve(m, "facebook", "facebook_publier", args, { diffusion: "diff-revoquee", decision: "dec-revoquee" });
    const liste = listeRevocations(m, { revoquees: [{ diffusion: "diff-revoquee", cle: "autre-cle-0001", decision: "dec-revoquee", expire: Math.floor(Date.now() / 1000) + 600 }] });
    const r = await essai(args, p, liste);
    expect(r["etat"]).toBe("preparee");
    expect(r["message"]).toMatch(/révoquée.*nouvelle approbation/);
    expect(publications(A)).toBe(avant);
  });

  it("liste d'une autre entreprise (preuve liée à l'entreprise) : préparée ; même entreprise : exécutée", async () => {
    const args = { message: "Liée à l'entreprise 1" };
    const avant = publications(A);
    const p = preuve(m, "facebook", "facebook_publier", args, { entreprise: "ent-1" });
    const refusee = await essai(args, p, listeRevocations(m, { entreprise: "ent-2" }));
    expect(refusee["etat"]).toBe("preparee");
    expect(refusee["message"]).toMatch(/pas la même entreprise/);
    expect(publications(A)).toBe(avant);
    const ok = await essai(args, p, listeRevocations(m, { entreprise: "ent-1" }));
    expect(ok).toMatchObject({ etat: "executee", rejeu: false });
    expect(publications(A)).toBe(avant + 1);
  });

  it("une liste qui cite d'autres preuves ne bloque pas celle-ci", async () => {
    const args = { message: "Autre preuve révoquée, pas celle-ci" };
    const r = await essai(args, preuve(m, "facebook", "facebook_publier", args), listeRevocations(m, { revoquees: [{ diffusion: "autre", cle: "autre-cle-0002", decision: "autre-dec", expire: Math.floor(Date.now() / 1000) + 600 }] }));
    expect(r["etat"]).toBe("executee");
  });

  it("la liste n'entre pas dans l'empreinte ni dans les paramètres rapportés ni dans les arguments signés (route d'issue du plugin)", async () => {
    const args = { message: "Liste hors empreinte" };
    const liste = listeRevocations(m);
    const r = await essai(args, preuve(m, "facebook", "facebook_publier", args), liste);
    expect(r["etat"]).toBe("executee");
    expect(r["action"].parametres).toEqual(args);
    expect(JSON.stringify(r)).not.toContain(liste);
    const v = verifierEnveloppe(r, PUBLIQUE);
    expect(v.ok && v.charge.arguments).toBe(empreinteArgumentsAppel(args));
  });

  it("compte null refusé pour un réseau social, même avec une liste fraîche", async () => {
    const args = { message: "Preuve sans compte" };
    const avant = publications(A);
    const r = await essai(args, preuve(m, "facebook", "facebook_publier", args, { compte: null }), listeRevocations(m));
    expect(r["etat"]).toBe("preparee");
    expect(r["message"]).toMatch(/sans compte pour le service facebook/);
    expect(publications(A)).toBe(avant);
  });
});

describe("S-4 (défense en profondeur) : un rejeu ne laisse jamais l'entrée expirer avant la preuve présentée", () => {
  it("la preuve plus longue présentée au rejeu prolonge expirePreuve de l'entrée exécutée", async () => {
    const args = { message: "Rejeu avec une preuve plus longue" };
    const cle = "diffusion-cle-rejeu-s4-long";
    const maintenant = Math.floor(Date.now() / 1000);
    const courte = preuve(m, "facebook", "facebook_publier", args, { cle, emis: maintenant, expire: maintenant + 3600 });
    const longue = preuve(m, "facebook", "facebook_publier", args, { cle, emis: maintenant, expire: maintenant + 6 * 86_400 });
    expect((await brute(clientA, "facebook_publier", { ...args, preuve_approbation: courte, revocations_approbation: listeRevocations(m) }))["etat"]).toBe("executee");
    const lire = (): number | undefined => {
      const etat = JSON.parse(readFileSync(m.config.fichierEtat, "utf8")) as { mutations: Record<string, { cle: string; expirePreuve?: number }> };
      return Object.values(etat.mutations).find((x) => x.cle === cle)?.expirePreuve;
    };
    expect(lire()).toBe((maintenant + 3600) * 1000);
    const rejeu = await brute(clientA, "facebook_publier", { ...args, preuve_approbation: longue, revocations_approbation: listeRevocations(m) });
    expect(rejeu).toMatchObject({ etat: "executee", rejeu: true });
    // Avant la correction : inchangé (1 h), l'entrée pouvait être oubliée alors que la preuve vivait encore 6 jours.
    expect(lire()).toBe((maintenant + 6 * 86_400) * 1000);
    // Une preuve plus courte ensuite ne raccourcit jamais l'échéance.
    await brute(clientA, "facebook_publier", { ...args, preuve_approbation: courte, revocations_approbation: listeRevocations(m) });
    expect(lire()).toBe((maintenant + 6 * 86_400) * 1000);
  });
});

describe("S-6 : un compte non nul est signé sur toute réponse réelle", () => {
  it("lecture réelle : la charge aev1 porte le compte de la connexion", async () => {
    const s = await brute(clientA, "facebook_publications", { debut: "2026-09-01", fin: "2026-09-28", limit: 1 });
    const v = verifierEnveloppe(s, PUBLIQUE);
    expect(v.ok && v.charge.compte).toBe("100000000000001");
  });

  it("une connexion réelle sans compte n'obtient aucune réponse signée (erreur non signée, outil non exécuté)", async () => {
    let appels = 0;
    const catalogue = construireCatalogue(FICHES_PAR_DEFAUT.find((f) => f.id === "facebook")!, "reel", {
      service: "facebook",
      mode: "reel",
      outils: [{ nom: "facebook_lecture", description: "l", schemaEntree: {}, annotations: { readOnlyHint: true }, executer: () => { appels++; return { chiffre: 1 }; } }],
    });
    for (const identite of [{ compte: "", propriete: null }, { compte: "  ", propriete: { id: "", libelle: "x" } }]) {
      const r = await appelerOutil(catalogue, "facebook_lecture", {}, { service: "facebook", mode: "reel", identite, jetonPorteur: "x" }, signataire);
      expect(r.isError).toBe(true);
      const structure = r.structuredContent as Record<string, any>;
      expect(structure["erreur"]).toBe("compte_absent");
      expect(structure["_atelier"].signature).toBeUndefined();
    }
    expect(appels).toBe(0);
  });

  it("signer() refuse un compte vide ou null", () => {
    const base = { service: "gsc", outil: "gsc_ping", erreur: false, args: {}, ecriture: false, structure: {} };
    expect(() => signataire.signer({ ...base, mode: "reel", compte: null })).toThrow(/compte non vide/);
    expect(() => signataire.signer({ ...base, mode: "reel", compte: "" })).toThrow(/compte non vide/);
    expect(signataire.signer({ ...base, mode: "reel", compte: "page-1" })).toMatch(/^aev1\./);
  });
});
