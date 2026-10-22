// Protections du serveur de pages : jeton CSRF signé, limite de débit, adresse tronquée.

import { describe, expect, it } from "vitest";
import { AGE_JETON_MAX_MS, AGE_JETON_MIN_MS, cleLimite, emettreJeton, LimiteDebit, tronquerIp, verifierJeton } from "../../src/pages/securite.js";

const SECRET = Buffer.from("secret-de-test-0123456789abcdef0123456789");
const T0 = 1_790_000_000_000;

describe("jeton CSRF", () => {
  it("accepte un jeton émis entre 2 s et 2 h plus tôt avec son cookie", () => {
    const j = emettreJeton(SECRET, "page-aaaa1111", T0);
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, j.nonce, T0 + AGE_JETON_MIN_MS)).toEqual({ ok: true, nonce: j.nonce });
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, j.nonce, T0 + AGE_JETON_MAX_MS)).toMatchObject({ ok: true });
  });
  it("refuse trop rapide, expiré, absent, falsifié, autre page, autre secret, autre cookie", () => {
    const j = emettreJeton(SECRET, "page-aaaa1111", T0);
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, j.nonce, T0 + 500)).toEqual({ ok: false, raison: "trop_rapide" });
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, j.nonce, T0 + AGE_JETON_MAX_MS + 1)).toEqual({ ok: false, raison: "expire" });
    expect(verifierJeton(SECRET, "page-aaaa1111", undefined, j.nonce, T0 + 5000)).toEqual({ ok: false, raison: "absent" });
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, undefined, T0 + 5000)).toEqual({ ok: false, raison: "absent" });
    // Signature falsifiée : premier caractère remplacé par un caractère TOUJOURS différent (« A » pouvait être déjà là : test aléatoire).
    const [n0, e0, s0] = j.champ.split(".") as [string, string, string];
    const falsifie = `${n0}.${e0}.${s0[0] === "A" ? "B" : "A"}${s0.slice(1)}`;
    expect(falsifie).not.toBe(j.champ);
    expect(verifierJeton(SECRET, "page-aaaa1111", falsifie, j.nonce, T0 + 5000)).toEqual({ ok: false, raison: "invalide" });
    expect(verifierJeton(SECRET, "autre-page-1", j.champ, j.nonce, T0 + 5000)).toMatchObject({ ok: false, raison: "invalide" });
    expect(verifierJeton(Buffer.from("un-autre-secret-0123456789abcdef012345"), "page-aaaa1111", j.champ, j.nonce, T0 + 5000)).toMatchObject({ ok: false, raison: "invalide" });
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, "autrenonce", T0 + 5000)).toMatchObject({ ok: false, raison: "invalide" });
    expect(verifierJeton(SECRET, "page-aaaa1111", "a.b", j.nonce, T0 + 5000)).toMatchObject({ ok: false, raison: "invalide" });
  });
  it("refuse un jeton daté du futur", () => {
    const j = emettreJeton(SECRET, "page-aaaa1111", T0 + 10_000);
    expect(verifierJeton(SECRET, "page-aaaa1111", j.champ, j.nonce, T0)).toMatchObject({ ok: false });
  });
});

describe("limite de débit", () => {
  it("plafonne par clé dans la fenêtre glissante puis rouvre", () => {
    let t = 0;
    const l = new LimiteDebit(3, 1000, () => t);
    expect([l.autoriser("a"), l.autoriser("a"), l.autoriser("a"), l.autoriser("a")]).toEqual([true, true, true, false]);
    expect(l.autoriser("b")).toBe(true);
    t = 1500;
    expect(l.autoriser("a")).toBe(true);
  });
  it("ne grossit pas sans fin", () => {
    const l = new LimiteDebit(1, 60_000, () => 1, 50);
    for (let i = 0; i < 500; i++) l.autoriser(`cle-${i}`);
    expect((l as unknown as { passages: Map<string, number[]> }).passages.size).toBeLessThanOrEqual(51);
  });
});

describe("adresse IP tronquée", () => {
  it.each([
    ["203.0.113.77", "203.0.113.0"],
    ["::ffff:198.51.100.9", "198.51.100.0"],
    ["2001:db8:abcd:12::1", "2001:db8:abcd::"],
    [undefined, "inconnue"],
    ["pas une adresse", "inconnue"],
  ])("%s -> %s", (entree, attendu) => {
    expect(tronquerIp(entree)).toBe(attendu);
  });
});

describe("clé des limites de débit", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::1", "2001:db8:1:2::/64"],
    ["2001:0db8:0001:0002:ffff::9", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
  ])("%s → %s", (entree, attendu) => {
    expect(cleLimite(entree)).toBe(attendu);
  });
  it("deux adresses d'un même /64 partagent la clé, deux /64 voisins non", () => {
    expect(cleLimite("2001:db8:1:2::a")).toBe(cleLimite("2001:db8:1:2:ffff:ffff:ffff:ffff"));
    expect(cleLimite("2001:db8:1:2::a")).not.toBe(cleLimite("2001:db8:1:3::a"));
  });
});
