// Filtre d'adresses « unicast globale seulement » (adresseAutorisee) : IPv4 du registre des usages spéciaux, IPv6 hors 2000::/3,
// et toutes les façons de cacher une IPv4 interne dans une IPv6 (mappée, compatible, 6to4, Teredo, NAT64).

import { describe, expect, it } from "vitest";
import { adresseAutorisee, verifierUrl } from "../../src/reel/liens/verifier-url.js";

describe("IPv4", () => {
  it.each([
    "0.0.0.0", "0.255.255.255", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254",
    "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1", "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.19.255.255",
    "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
  ])("refusée : %s", (ip) => { expect(adresseAutorisee(ip), ip).toBe(false); });

  it.each([
    "1.1.1.1", "8.8.8.8", "9.255.255.255", "11.0.0.1", "100.63.255.255", "100.128.0.1", "126.255.255.255", "128.0.0.1", "169.253.0.1", "169.255.0.1",
    "172.15.255.255", "172.32.0.1", "192.0.1.1", "192.167.1.1", "192.169.1.1", "198.17.255.255", "198.20.0.1", "198.51.101.1", "203.0.114.1", "223.255.255.255",
  ])("publique acceptée : %s", (ip) => { expect(adresseAutorisee(ip), ip).toBe(true); });

  it("texte qui n'est pas une adresse : refusé", () => {
    for (const t of ["", "pas-une-ip", "1.2.3", "1.2.3.4.5", "256.1.1.1", "exemple.be"]) expect(adresseAutorisee(t), t).toBe(false);
  });
});

describe("IPv6", () => {
  it.each([
    "::", "::1", "fe80::1", "fe80::1%eth0", "febf::1", "fc00::1", "fd12:3456:789a::1", "fec0::1", "feff::1", "ff02::1", "ff00::", "100::1", "100::",
    "2001:db8::1", "2001:0db8:ffff::1", "3fff::1", "3fff:0fff::1", "2001:1::1", "2001:10::1", "2001:20::1", "2001:100::1", "4000::1", "1fff::1",
  ])("refusée : %s", (ip) => { expect(adresseAutorisee(ip), ip).toBe(false); });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4007::200e", "2001:200::1", "2001:4860::1", "3ffe::1", "2400::1", "2001:db9::1"])(
    "publique acceptée : %s", (ip) => { expect(adresseAutorisee(ip), ip).toBe(true); });

  describe("IPv4 embarquée : jugée comme l'IPv4", () => {
    it.each([
      // mappée (::ffff:), notations dotted et hexadécimale
      "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.1.2.3", "::ffff:a01:203", "::ffff:192.168.0.1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:7f00:1",
      // traduite SIIT (::ffff:0:a.b.c.d)
      "::ffff:0:127.0.0.1", "::ffff:0:7f00:1",
      // compatible (obsolète) : ::a.b.c.d
      "::127.0.0.1", "::7f00:1", "::10.0.0.1", "::192.168.1.1", "::172.16.0.1", "::0.0.0.2", "0:0:0:0:0:0:7f00:1",
      // 6to4 (2002::/16) : IPv4 aux bits 16 à 47
      "2002:7f00:1::1", "2002:a00:1::", "2002:c0a8:101::1", "2002:a9fe:a9fe::1", "2002:ac10:1::5",
      // Teredo (2001::/32) : serveur interne, ou client interne (inversé bit à bit : 127.0.0.1 devient 80ff:fffe)
      "2001:0:7f00:1::1", "2001:0:a00:1::1", "2001:0:808:808:0:0:80ff:fffe", "2001:0:808:808:0:0:f5ff:fffe",
      // NAT64 64:ff9b::/96
      "64:ff9b::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "64:ff9b::a9fe:a9fe", "64:ff9b::c0a8:1",
      // NAT64 à usage local 64:ff9b:1::/48 (RFC 6052 : IPv4 aux octets 6, 7, 9 et 10)
      "64:ff9b:1:a01:2:300::" /* 10.1.2.3 */, "64:ff9b:1:c0a8:0:100::" /* 192.168.0.1 */, "64:ff9b:1:a9fe:0:a900::" /* 169.254.0.169 */,
    ])("interne cachée refusée : %s", (ip) => { expect(adresseAutorisee(ip), ip).toBe(false); });

    it.each([
      "::ffff:8.8.8.8", "::ffff:808:808", "::ffff:0:8.8.8.8", "::8.8.8.8", "2002:808:808::1", "2001:0:808:808:0:0:f7f7:f7f7", "64:ff9b::8.8.8.8", "64:ff9b::808:808", "64:ff9b:1:808:8:800::" /* 8.8.8.8 */,
    ])("publique cachée acceptée : %s", (ip) => { expect(adresseAutorisee(ip), ip).toBe(true); });
  });

  it("formes mal écrites : refusées", () => {
    for (const t of ["1::2::3", ":::", "12345::1", "2606:4700::g", "2606:4700:4700:1:2:3:4:5:6", "::1.2.3", "::ffff:300.1.1.1"]) expect(adresseAutorisee(t), t).toBe(false);
  });
});

describe("URL avec adresse littérale : refusée avant toute connexion", () => {
  it.each([
    "http://[::127.0.0.1]/", "http://[::7f00:1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[2002:7f00:1::1]/", "http://[64:ff9b::7f00:1]/",
    "http://[fec0::1]/", "http://[100::1]/", "http://[2001:0:7f00:1::1]/", "http://[::10.0.0.1]/", "http://[fd00::1]/", "http://[ff02::1]/",
    "http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/", "http://127.1/", "http://0/",
  ])("%s", async (u) => {
    const r = await verifierUrl(u);
    expect(r.erreur, u).toMatch(/refusée/);
    expect(r.code).toBeNull();
    expect(r.chaine).toEqual([]);
  });
});
