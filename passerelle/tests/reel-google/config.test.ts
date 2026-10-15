// Lot L4 : lecture de la configuration Google, chiffrement au repos, traduction d'erreurs isolée.

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADRESSES_GOOGLE, lireConfigGoogle } from "../../src/reel/google/config.js";
import { chiffrer, dechiffrer } from "../../src/reel/google/chiffrement.js";
import { attenteAnnoncee, traduireErreur } from "../../src/reel/google/appel.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { construireGoogleReel } from "../../src/reel/google/enregistrer.js";

const CLE = Buffer.alloc(32, 1).toString("base64");
const BASE = { PASSERELLE_GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", PASSERELLE_GOOGLE_CLIENT_SECRET: "secret-de-test", PASSERELLE_GOOGLE_CLE: CLE };

describe("configuration Google réelle", () => {
  it("sans client OAuth : Google n'est pas servi, raison claire, aucun fournisseur enregistré", () => {
    const journal: string[] = [];
    const registre = new RegistreFournisseurs();
    expect(construireGoogleReel(registre, {}, { hote: "127.0.0.1", urlPasserelle: () => "", journal: (m) => journal.push(m) })).toBeNull();
    expect(journal[0]).toContain("client OAuth Google non configuré");
    expect(registre.obtenir("reel", "gsc")).toBeUndefined();
  });

  it("clé absente ou de mauvaise taille : refus", () => {
    expect(lireConfigGoogle({ ...BASE, PASSERELLE_GOOGLE_CLE: "" }, "/x")).toMatchObject({ ok: false });
    const r = lireConfigGoogle({ ...BASE, PASSERELLE_GOOGLE_CLE: Buffer.alloc(16).toString("base64") }, "/x");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.raison).toContain("32 octets");
  });

  it("valeurs par défaut : vraies adresses Google, port 3192, pas d'essai", () => {
    const r = lireConfigGoogle(BASE, "/etat.json");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.adresses).toEqual(ADRESSES_GOOGLE);
    expect(r.config.portAutorisation).toBe(3192);
    expect(r.config.essai).toBe(false);
    expect(r.config.fichierEtat).toBe("/etat.json");
  });

  it("faux Google : boucle locale seulement", () => {
    expect(lireConfigGoogle({ ...BASE, PASSERELLE_GOOGLE_FAUX_URL: "https://exemple.org" }, "/x")).toMatchObject({ ok: false });
    const r = lireConfigGoogle({ ...BASE, PASSERELLE_GOOGLE_FAUX_URL: "http://127.0.0.1:4999" }, "/x");
    expect(r.ok && r.config.essai && r.config.adresses.jeton).toBe("http://127.0.0.1:4999/token");
  });

  it("secret dans un fichier : exige le mode 0600 ; le message ne contient jamais la valeur", () => {
    const d = mkdtempSync(join(tmpdir(), "l4-conf-"));
    try {
      const f = join(d, "secret");
      writeFileSync(f, "valeur-tres-secrete\n");
      chmodSync(f, 0o644);
      const r = lireConfigGoogle({ PASSERELLE_GOOGLE_CLIENT_ID: "id", PASSERELLE_GOOGLE_CLIENT_SECRET_FICHIER: f, PASSERELLE_GOOGLE_CLE: CLE }, "/x");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.raison).not.toContain("valeur-tres-secrete");
      chmodSync(f, 0o600);
      const r2 = lireConfigGoogle({ PASSERELLE_GOOGLE_CLIENT_ID: "id", PASSERELLE_GOOGLE_CLIENT_SECRET_FICHIER: f, PASSERELLE_GOOGLE_CLE: CLE }, "/x");
      expect(r2.ok && r2.config.clientSecret).toBe("valeur-tres-secrete");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("login-customer-id : 10 chiffres, tirets tolérés", () => {
    const r = lireConfigGoogle({ ...BASE, PASSERELLE_GOOGLE_ADS_LOGIN_CUSTOMER_ID: "123-456-7890" }, "/x");
    expect(r.ok && r.config.adsLoginCustomerId).toBe("1234567890");
    expect(lireConfigGoogle({ ...BASE, PASSERELLE_GOOGLE_ADS_LOGIN_CUSTOMER_ID: "12" }, "/x")).toMatchObject({ ok: false });
  });
});

describe("chiffrement au repos", () => {
  it("aller-retour ; contexte (octroi) lié ; clé différente refusée ; chiffrés distincts", () => {
    const cle = Buffer.alloc(32, 3);
    const a = chiffrer(cle, "1//jeton", "octroi-a");
    expect(a).not.toContain("jeton");
    expect(dechiffrer(cle, a, "octroi-a")).toBe("1//jeton");
    expect(() => dechiffrer(cle, a, "octroi-b")).toThrow();
    expect(() => dechiffrer(Buffer.alloc(32, 4), a, "octroi-a")).toThrow();
    expect(chiffrer(cle, "1//jeton", "octroi-a")).not.toBe(a);
  });
});

describe("traduction des erreurs Google", () => {
  it("délai annoncé : Retry-After, RetryInfo.retryDelay, quotaErrorDetails.retryDelay (Ads)", () => {
    expect(attenteAnnoncee("7", {})).toBe(7000);
    expect(attenteAnnoncee(null, { details: [{ retryDelay: "2.5s" }] })).toBe(2500);
    expect(attenteAnnoncee(null, { details: [{ errors: [{ details: { quotaErrorDetails: { retryDelay: "30s" } } }] }] })).toBe(30_000);
    expect(attenteAnnoncee(null, {})).toBeNull();
  });

  it("403 rateLimitExceeded (ancien format) = quota, pas « accès refusé »", () => {
    const e = traduireErreur(403, { code: 403, message: "Rate", errors: [{ reason: "rateLimitExceeded" }] }, "la propriété X", null);
    expect(e.motif).toBe("quota");
  });

  it("autres statuts : indisponible, message sans réessai", () => {
    expect(traduireErreur(503, { message: "Backend" }, "X", null).motif).toBe("indisponible");
    expect(traduireErreur(400, { message: "Invalid argument" }, "X", null).message).toBe("Requête refusée par Google pour X. (Google : Invalid argument)");
  });
});
