// Lecture de la configuration réseaux sociaux et CRM : services servis, refus clairs, aucun secret dans les messages.

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { lireConfigSocialCrm, servicesServis } from "../../src/reel/social-crm/config.js";
import { societePipedrive, verifierAdresseInstance, versionMajeureOdoo } from "../../src/reel/social-crm/connecteurs.js";

const dossier = mkdtempSync(join(tmpdir(), "passerelle-social-config-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));
const CLE = Buffer.alloc(32, 3).toString("base64");

describe("lireConfigSocialCrm", () => {
  it("exige la clé de chiffrement de 32 octets", () => {
    expect(lireConfigSocialCrm({}, "x")).toEqual({ ok: false, raison: expect.stringMatching(/PASSERELLE_SOCIAL_CLE/) });
    expect(lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: Buffer.alloc(16).toString("base64") }, "x")).toEqual({ ok: false, raison: expect.stringMatching(/32 octets/) });
  });

  it("ne sert une plateforme OAuth que si son application est complète", () => {
    const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_META_CLIENT_ID: "app", PASSERELLE_META_CLIENT_SECRET: "s", PASSERELLE_LINKEDIN_CLIENT_ID: "seul-id" }, "x");
    expect(lu.ok).toBe(true);
    if (lu.ok) expect(servicesServis(lu.config).sort()).toEqual(["facebook", "odoo", "pipedrive"]);
  });

  it("lit un secret dans un fichier 0600 et refuse un fichier lisible par d'autres, sans citer la valeur", () => {
    const f = join(dossier, "secret");
    writeFileSync(f, "valeur-tres-secrete\n");
    chmodSync(f, 0o644);
    const refus = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_HUBSPOT_CLIENT_ID: "hs", PASSERELLE_HUBSPOT_CLIENT_SECRET_FICHIER: f }, "x");
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.raison).not.toContain("valeur-tres-secrete");
    chmodSync(f, 0o600);
    const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_HUBSPOT_CLIENT_ID: "hs", PASSERELLE_HUBSPOT_CLIENT_SECRET_FICHIER: f }, "x");
    expect(lu.ok && lu.config.applications.crm?.clientSecret).toBe("valeur-tres-secrete");
  });

  it("n'accepte un faux serveur que sur la boucle locale, et une adresse de retour qu'en HTTPS", () => {
    expect(lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_SOCIAL_FAUX_URL: "http://exemple.invalid:80" }, "x").ok).toBe(false);
    expect(lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_SOCIAL_URL_RETOUR: "http://atelier.exemple.invalid" }, "x").ok).toBe(false);
    const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_SOCIAL_URL_RETOUR: "https://atelier.exemple.invalid/auth/" }, "x");
    expect(lu.ok && lu.config.urlRetourPublique).toBe("https://atelier.exemple.invalid/auth");
  });

  it("accepte la clé publique d'approbation en PEM ou en base64 sur une ligne", () => {
    const pem = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const ligne = pem.replace(/-----[A-Z ]+-----|\s/g, "");
    for (const valeur of [pem, ligne]) {
      const lu = lireConfigSocialCrm({ PASSERELLE_SOCIAL_CLE: CLE, PASSERELLE_APPROBATION_CLE_PUBLIQUE: valeur }, "x");
      expect(lu.ok && lu.config.clePubliqueApprobation).toContain("BEGIN PUBLIC KEY");
    }
  });
});

describe("adresses saisies par le client", () => {
  it("Pipedrive : domaine de société normalisé, toute autre forme refusée", () => {
    expect(societePipedrive("https://Acme-Renov.pipedrive.com/deals")).toBe("acme-renov");
    expect(societePipedrive("acme")).toBe("acme");
    expect(() => societePipedrive("acme.example.com/../x")).toThrow(/Adresse Pipedrive invalide/);
  });

  it("Odoo : HTTPS public seulement (pas de réseau privé, ni d'identifiants dans l'URL)", async () => {
    await expect(verifierAdresseInstance("http://odoo.exemple.invalid", false)).rejects.toThrow(/HTTPS/);
    await expect(verifierAdresseInstance("https://10.0.0.5", false)).rejects.toThrow(/privé ou local/);
    await expect(verifierAdresseInstance("https://192.168.1.10", false)).rejects.toThrow(/privé ou local/);
    await expect(verifierAdresseInstance("https://[::1]", false)).rejects.toThrow(/privé ou local/);
    await expect(verifierAdresseInstance("https://moi:motdepasse@93.184.215.14", false)).rejects.toThrow(/identifiant/);
    await expect(verifierAdresseInstance("https://93.184.215.14/odoo", false)).resolves.toBe("https://93.184.215.14");
    await expect(verifierAdresseInstance("http://127.0.0.1:8069", true)).resolves.toBe("http://127.0.0.1:8069");
    await expect(verifierAdresseInstance("http://127.0.0.1:8069", false)).rejects.toThrow();
  });

  it("Odoo : version majeure lue sur /web/version", () => {
    expect(versionMajeureOdoo({ version_info: [19, 0, 0, "final", 0, ""], version: "19.0" })).toBe(19);
    expect(versionMajeureOdoo({ version: "saas~18.3" })).toBe(18);
  });
});
