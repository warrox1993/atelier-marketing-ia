// Revue de sécurité S9 (constat M2 de docs/revue-independante.md) : enveloppe `_atelier` signée par la passerelle.

import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";
import { RegistreFournisseurs } from "../src/fournisseurs.js";
import { appelerOutil, construireCatalogue } from "../src/outils.js";
import { FICHES_PAR_DEFAUT } from "../src/services.js";
import { empreinteArgumentsAppel, signataireDepuisEnv, SignataireEnveloppe, verifierEnveloppe } from "../src/signature-enveloppe.js";
import { demarrer, fournisseurFactice, obtenirJetons, rpc, type PasserelleDeTest } from "./aide.js";

const paire = generateKeyPairSync("ed25519");
const autre = generateKeyPairSync("ed25519");
const signataire = new SignataireEnveloppe(paire.privateKey);
const PUBLIQUE = signataire.clePubliqueBase64;

const copie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("chaque réponse d'outil porte une enveloppe signée", () => {
  let p: PasserelleDeTest;
  let jeton: string;
  beforeAll(async () => {
    p = await demarrer({ signataire });
    jeton = (await obtenirJetons(p.url, "gsc", "sc-domain:essai.example")).access_token;
  });
  afterAll(async () => {
    await p.arreter();
  });

  it("succès : signature valide sur structuredContent et sur le JSON du texte ; charge liée au service, à l'outil et aux arguments", async () => {
    const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "bonjour" } }, jeton);
    const s = r.corps.result.structuredContent as Record<string, unknown>;
    const v = verifierEnveloppe(s, PUBLIQUE);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.charge).toMatchObject({ v: 1, mode: "reel", service: "gsc", outil: "gsc_ping", erreur: false, compte: "sc-domain:essai.example" });
    expect(v.charge.arguments).toBe(empreinteArgumentsAppel({ texte: "bonjour" }));
    const texte = r.corps.result.content[0].text as string;
    expect(verifierEnveloppe(JSON.parse(texte.slice(texte.indexOf("{"))), PUBLIQUE).ok).toBe(true);
  });

  it("erreur d'outil, outil inconnu, arguments invalides : signés aussi, erreur = vrai", async () => {
    for (const [nom, args] of [["gsc_echec", {}], ["inconnu", {}], ["gsc_ping", { texte: "" }]] as const) {
      const r = await rpc(p.url, "gsc", "tools/call", { name: nom, arguments: args }, jeton);
      const v = verifierEnveloppe(r.corps.result.structuredContent, PUBLIQUE);
      expect(v.ok, nom).toBe(true);
      if (v.ok) expect(v.charge.erreur, nom).toBe(true);
    }
  });

  it("falsifications refusées : mode changé en « demonstration », données modifiées, signature retirée, autre clé", async () => {
    const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "42" } }, jeton);
    const s = r.corps.result.structuredContent as Record<string, any>;

    const versDemo = copie(s);
    versDemo._atelier.mode = "demonstration";
    expect(verifierEnveloppe(versDemo, PUBLIQUE)).toEqual({ ok: false, motif: "mode de l'enveloppe différent du mode signé" });

    const chiffre = copie(s);
    chiffre.echo = "4200";
    expect(verifierEnveloppe(chiffre, PUBLIQUE)).toEqual({ ok: false, motif: "contenu modifié après signature" });

    const sansSignature = copie(s);
    delete sansSignature._atelier.signature;
    expect(verifierEnveloppe(sansSignature, PUBLIQUE)).toEqual({ ok: false, motif: "enveloppe non signée" });

    const autreCle = copie(s);
    autreCle._atelier.signature = new SignataireEnveloppe(autre.privateKey).signer({ mode: "reel", service: "gsc", outil: "gsc_ping", erreur: false, compte: "compte-essai", args: {}, ecriture: false, structure: autreCle });
    autreCle._atelier.mode = "reel";
    expect(verifierEnveloppe(autreCle, PUBLIQUE)).toEqual({ ok: false, motif: "signature invalide" });

    const charge = copie(s);
    const [prefixe, , sig] = (charge._atelier.signature as string).split(".");
    const faux = Buffer.from(JSON.stringify({ v: 1, mode: "reel" })).toString("base64url");
    charge._atelier.signature = `${prefixe}.${faux}.${sig}`;
    expect(verifierEnveloppe(charge, PUBLIQUE).ok).toBe(false);
  });
});

describe("enveloppe signée d'un service de tiers ; preuve d'approbation exclue des arguments signés", () => {
  it("mode reel signé", async () => {
    const p = await demarrer({ registre: new RegistreFournisseurs().enregistrer(fournisseurFactice("tiers")), signataire });
    try {
      const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "x" } }, "jeton-google-factice");
      const v = verifierEnveloppe(r.corps.result.structuredContent, PUBLIQUE);
      expect(v.ok && v.charge.mode).toBe("reel");
    } finally {
      await p.arreter();
    }
  });

  it("preuve_approbation n'entre pas dans l'empreinte des arguments", async () => {
    const fiche = FICHES_PAR_DEFAUT.find((f) => f.id === "facebook")!;
    const catalogue = construireCatalogue(fiche, "reel", {
      service: "facebook",
      mode: "reel",
      outils: [{ nom: "facebook_publier", description: "essai", schemaEntree: { message: z.string(), preuve_approbation: z.string().optional() }, executer: () => ({ etat: "preparee" }) }],
    });
    const contexte = { service: "facebook", mode: "reel" as const, identite: { compte: "Page", propriete: { id: "1", libelle: "Page" } }, jetonPorteur: "x" };
    const r = await appelerOutil(catalogue, "facebook_publier", { message: "Bonjour", preuve_approbation: "apv1.a.b" }, contexte, signataire);
    const v = verifierEnveloppe(r.structuredContent as Record<string, unknown>, PUBLIQUE);
    expect(v.ok && v.charge.arguments).toBe(empreinteArgumentsAppel({ message: "Bonjour" }));
    expect(JSON.stringify(r)).not.toContain("apv1.a.b");
  });
});

describe("S-3 : seule une lecture explicitement annoncée peut valoir mesure (liste blanche)", () => {
  const contexte = { service: "crm", mode: "reel" as const, identite: { compte: "Compte", propriete: null }, jetonPorteur: "x" };
  const catalogue = construireCatalogue(FICHES_PAR_DEFAUT.find((f) => f.id === "gsc")!, "reel", {
    ...fournisseurFactice("tiers"),
    outils: [
      { nom: "lecture_ok", description: "l", schemaEntree: {}, annotations: { readOnlyHint: true }, executer: () => ({ chiffre: 1 }) },
      { nom: "sans_annotation", description: "s", schemaEntree: {}, executer: () => ({ chiffre: 2 }) },
      { nom: "ecriture_declaree", description: "e", schemaEntree: {}, annotations: { readOnlyHint: false }, executer: () => ({ etat: "preparee", executee: false }) },
      { nom: "ecriture_executee", description: "x", schemaEntree: {}, annotations: { readOnlyHint: false }, executer: () => ({ etat: "executee", executee: true }) },
    ],
  });
  const charge = async (nom: string): Promise<Record<string, unknown>> => {
    const r = await appelerOutil(catalogue, nom, {}, contexte, signataire);
    const v = verifierEnveloppe(r.structuredContent as Record<string, unknown>, PUBLIQUE);
    if (!v.ok) throw new Error(v.motif);
    return v.charge as unknown as Record<string, unknown>;
  };

  it("lecture : ecriture = faux ; tout le reste (sans annotation, écriture, outil inconnu) : ecriture = vrai", async () => {
    expect(await charge("lecture_ok")).toMatchObject({ ecriture: false, executee: false });
    expect(await charge("sans_annotation")).toMatchObject({ ecriture: true, executee: false });
    expect(await charge("ecriture_declaree")).toMatchObject({ ecriture: true, executee: false });
    expect(await charge("ecriture_executee")).toMatchObject({ ecriture: true, executee: true });
    expect(await charge("outil_qui_n_existe_pas")).toMatchObject({ ecriture: true, executee: false, erreur: true });
  });
});

describe("sans clé : réponses non signées (le plugin doit les refuser comme réelles)", () => {
  it("aucune signature", async () => {
    const p = await demarrer({ registre: new RegistreFournisseurs().enregistrer(fournisseurFactice("tiers")) });
    try {
      const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "x" } }, "jeton-google-factice");
      expect(r.corps.result.structuredContent._atelier.signature).toBeUndefined();
      expect(verifierEnveloppe(r.corps.result.structuredContent, PUBLIQUE)).toEqual({ ok: false, motif: "enveloppe non signée" });
    } finally {
      await p.arreter();
    }
  });
});

describe("lecture de la clé (PASSERELLE_SIGNATURE_CLE_PRIVEE)", () => {
  it("absente : null ; PEM, DER base64 et fichier 0600 acceptés ; fichier lisible par d'autres refusé ; erreur sans la valeur", () => {
    expect(signataireDepuisEnv({})).toBeNull();
    const pem = paire.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const der = paire.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    expect(signataireDepuisEnv({ PASSERELLE_SIGNATURE_CLE_PRIVEE: pem })?.clePubliqueBase64).toBe(PUBLIQUE);
    expect(signataireDepuisEnv({ PASSERELLE_SIGNATURE_CLE_PRIVEE: der })?.clePubliqueBase64).toBe(PUBLIQUE);
    const dossier = mkdtempSync(join(tmpdir(), "passerelle-signature-"));
    try {
      const f = join(dossier, "cle.pem");
      writeFileSync(f, pem, { mode: 0o600 });
      expect(signataireDepuisEnv({ PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER: f })?.clePubliqueBase64).toBe(PUBLIQUE);
      chmodSync(f, 0o644);
      expect(() => signataireDepuisEnv({ PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER: f })).toThrow(/chmod 600/);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => signataireDepuisEnv({ PASSERELLE_SIGNATURE_CLE_PRIVEE: rsa })).toThrow(/Ed25519/);
    try {
      signataireDepuisEnv({ PASSERELLE_SIGNATURE_CLE_PRIVEE: "valeur-secrete-illisible" });
    } catch (e) {
      expect((e as Error).message).not.toContain("valeur-secrete-illisible");
    }
  });
});
