// Revue de sécurité du 15/10/2026, constat S4 : adresse d'instance Odoo saisie par le client (SSRF).
// Plages refusées, résolution unique, connexion à l'adresse vérifiée (épinglage), aucune redirection.

import { createServer as serveurHttp, type IncomingHttpHeaders, type Server } from "node:http";
import { createServer as serveurTcp } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierAdresseInstance } from "../../src/reel/social-crm/connecteurs.js";
import { envoyer } from "../../src/reel/social-crm/http.js";
import { adresseInterdite, envoyerVersDestination, resoudreDestination, type Resolveur } from "../../src/reel/social-crm/reseau-sur.js";

describe("adresses non publiques", () => {
  const interdites = [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:ac10:1", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001::1", "2001:db8::1",
    "fc00::1", "fd12::1", "fe80::1", "fec0::1", "ff02::1", "3fff::1", "pas-une-ip",
  ];
  for (const ip of interdites) it(`refuse ${ip}`, () => expect(adresseInterdite(ip)).toBe(true));
  for (const ip of ["8.8.8.8", "93.184.215.14", "2606:4700:4700::1111", "2a00:1450:4007:80e::200e"]) {
    it(`accepte ${ip}`, () => expect(adresseInterdite(ip)).toBe(false));
  }
});

describe("adresse d'instance Odoo saisie dans le formulaire", () => {
  it("refuse les écritures littérales qui visent le réseau local (dont IPv6 « IPv4 mappée » en hexadécimal)", async () => {
    for (const a of [
      "https://[::ffff:7f00:1]:3100/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:ac10:1]/", "https://[64:ff9b::7f00:1]/",
      "https://[2002:7f00:1::1]/", "https://198.18.0.1/", "https://224.0.0.1/", "https://[ff02::1]/", "https://[fec0::1]/",
      "https://0x7f.1/", "https://2130706433/", "https://127.1/",
    ]) {
      await expect(verifierAdresseInstance(a, false), a).rejects.toThrow(/privé ou local/);
    }
  });

  it("refuse un nom dont UNE des adresses résolues n'est pas publique", async () => {
    const melange: Resolveur = async () => [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.7", family: 4 }];
    await expect(verifierAdresseInstance("https://odoo.exemple.invalid", false, melange)).rejects.toThrow(/privé ou local/);
    const publique: Resolveur = async () => [{ address: "93.184.215.14", family: 4 }];
    await expect(verifierAdresseInstance("https://odoo.exemple.invalid/odoo", false, publique)).resolves.toBe("https://odoo.exemple.invalid");
  });
});

describe("appel épinglé : résolution unique et connexion à l'adresse vérifiée", () => {
  let serveur: Server;
  let port = 0;
  const recus: { url: string; entetes: IncomingHttpHeaders }[] = [];
  beforeAll(async () => {
    serveur = serveurHttp((req, res) => {
      recus.push({ url: req.url ?? "", entetes: req.headers });
      if (req.url === "/redirige") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
        return;
      }
      if (req.url === "/gros") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ x: "y".repeat(4096) }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: "19.0", version_info: [19, 0, 0, "final", 0, ""] }));
    });
    await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", r));
    port = (serveur.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise<void>((r) => serveur.close(() => r()));
  });

  it("le nom n'est résolu qu'une fois, la connexion part vers l'adresse obtenue, Host garde le nom", async () => {
    let appels = 0;
    // Le nom n'existe pas dans le DNS : seule l'adresse épinglée permet de joindre le serveur.
    const resoudre: Resolveur = async () => {
      appels += 1;
      return [{ address: "127.0.0.1", family: 4 }];
    };
    const r = await envoyer({ methode: "GET", url: `http://odoo.essai.invalid:${port}/web/version`, adresseSaisie: { essai: true, resoudre } }, "odoo", 3000);
    expect(r.statut).toBe(200);
    expect((r.json as { version: string }).version).toBe("19.0");
    expect(appels).toBe(1);
    expect(recus.at(-1)?.entetes.host).toBe(`odoo.essai.invalid:${port}`);
  });

  it("aucune redirection n'est suivie (même vers les métadonnées de nuage)", async () => {
    const resoudre: Resolveur = async () => [{ address: "127.0.0.1", family: 4 }];
    const avant = recus.length;
    await expect(envoyer({ methode: "GET", url: `http://odoo.essai.invalid:${port}/redirige`, adresseSaisie: { essai: true, resoudre } }, "odoo", 3000)).rejects.toThrow(/redirection refusée/);
    expect(recus.length).toBe(avant + 1);
  });

  it("réponse bornée en taille", async () => {
    await expect(envoyerVersDestination({ methode: "GET", url: `http://127.0.0.1:${port}/gros`, entetes: {}, delaiMs: 3000, maxOctets: 1024 }, { adresse: "127.0.0.1", famille: 4 })).rejects.toThrow(/trop volumineuse/);
  });

  it("en essai, HTTP n'est permis que si TOUTES les adresses sont de la boucle locale", async () => {
    const vers10: Resolveur = async () => [{ address: "10.0.0.7", family: 4 }];
    await expect(resoudreDestination(new URL("http://odoo.essai.invalid/"), true, vers10)).rejects.toThrow(/HTTPS/);
    await expect(resoudreDestination(new URL("http://127.0.0.1:1/"), false)).rejects.toThrow(/HTTPS/);
  });

  it("hors essai : une adresse refusée n'ouvre AUCUNE connexion (rien n'atteint la boucle locale)", async () => {
    let connexions = 0;
    const piege = serveurTcp((c) => {
      connexions += 1;
      c.destroy();
    });
    await new Promise<void>((r) => piege.listen(0, "127.0.0.1", r));
    const p = (piege.address() as { port: number }).port;
    try {
      await expect(envoyer({ methode: "GET", url: `https://[::ffff:7f00:1]:${p}/web/version`, adresseSaisie: { essai: false } }, "odoo", 3000)).rejects.toThrow(/refusée/);
      const rebond: Resolveur = async () => [{ address: "127.0.0.1", family: 4 }];
      await expect(envoyer({ methode: "GET", url: `https://odoo.exemple.invalid:${p}/web/version`, adresseSaisie: { essai: false, resoudre: rebond } }, "odoo", 3000)).rejects.toThrow(/refusée/);
      expect(connexions).toBe(0);
    } finally {
      await new Promise<void>((r) => piege.close(() => r()));
    }
  });
});
