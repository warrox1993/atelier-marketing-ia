// Service réel « liens » (outil verifier_url) : essais contre un petit serveur HTTP local. Le filtre d'adresses est injecté pour
// atteindre ce serveur (boucle locale) ; le comportement de production (refus des adresses locales) est contrôlé séparément.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistreFournisseurs } from "../../src/fournisseurs.js";
import { adresseAutorisee, fournisseurLiensReel, verifierUrl, USER_AGENT } from "../../src/reel/liens/verifier-url.js";
import { demarrer, obtenirJetons, type PasserelleDeTest } from "../aide.js";

let serveur: http.Server;
let base = "";
const enTetesRecus: http.IncomingHttpHeaders[] = [];
/** Seule la boucle locale est permise pour les essais ; tout le reste suit le filtre de production. */
const filtreEssai = (ip: string): boolean => ip === "127.0.0.1" || adresseAutorisee(ip);

beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    enTetesRecus.push(req.headers);
    const chemin = req.url ?? "/";
    if (chemin === "/ok") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><head><title>Rénovation &amp; toitures</title><style>p{}</style></head><body><h1>Bienvenue</h1><script>x()</script><p>Devis gratuit à Liège.</p></body></html>");
    } else if (chemin === "/long") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("a".repeat(5000));
    } else if (chemin === "/a") { res.writeHead(301, { location: "/b" }); res.end();
    } else if (chemin === "/b") { res.writeHead(302, { location: `${base}/ok` }); res.end();
    } else if (chemin.startsWith("/boucle")) { res.writeHead(302, { location: "/boucle" + (Number(chemin.slice(7) || "0") + 1) }); res.end();
    } else if (chemin === "/vers-interne") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end();
    } else if (chemin === "/vers-localhost") { res.writeHead(302, { location: "http://localhost:1/" }); res.end();
    } else if (chemin === "/vers-ftp") { res.writeHead(302, { location: "ftp://exemple.test/x" }); res.end();
    } else if (chemin === "/lent") { /* ne répond jamais */
    } else if (chemin === "/404") { res.writeHead(404, { "content-type": "text/html" }); res.end("<title>Page introuvable</title>");
    } else { res.writeHead(500); res.end(); }
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterAll(async () => {
  serveur.closeAllConnections();
  await new Promise<void>((ok) => serveur.close(() => ok()));
});

const essai = { adresseAutorisee: filtreEssai };

describe("verifier_url : lecture", () => {
  it("200 : code, destination, type, titre décodé et extrait sans script ni style", async () => {
    const r = await verifierUrl(`${base}/ok`, "GET", essai);
    expect(r.erreur).toBeUndefined();
    expect(r.code).toBe(200);
    expect(r.chaine).toEqual([{ url: `${base}/ok`, code: 200 }]);
    expect(r.destination).toBe(`${base}/ok`);
    expect(r.typeContenu).toContain("text/html");
    expect(r.titre).toBe("Rénovation & toitures");
    expect(r.extrait).toBe("Bienvenue Devis gratuit à Liège.");
    expect(r.dureeMs).toBeGreaterThanOrEqual(0);
  });

  it("extrait limité à 500 caractères", async () => {
    const r = await verifierUrl(`${base}/long`, "GET", essai);
    expect(r.extrait).toHaveLength(500);
    expect(r.titre).toBeNull();
  });

  it("HEAD : code seul, pas de contenu lu", async () => {
    const r = await verifierUrl(`${base}/ok`, "HEAD", essai);
    expect(r.code).toBe(200);
    expect(r.titre).toBeNull();
    expect(r.extrait).toBeNull();
  });

  it("404 avec titre : le code et le titre sont rendus (le jugement reste à l'agent)", async () => {
    const r = await verifierUrl(`${base}/404`, "GET", essai);
    expect(r.code).toBe(404);
    expect(r.titre).toBe("Page introuvable");
    expect(r.erreur).toBeUndefined();
  });

  it("chaîne 301 puis 302 puis 200, destination finale", async () => {
    const r = await verifierUrl(`${base}/a`, "GET", essai);
    expect(r.chaine).toEqual([{ url: `${base}/a`, code: 301 }, { url: `${base}/b`, code: 302 }, { url: `${base}/ok`, code: 200 }]);
    expect(r.code).toBe(200);
    expect(r.destination).toBe(`${base}/ok`);
    expect(r.titre).toBe("Rénovation & toitures");
  });

  it("boucle de redirections arrêtée à 10", async () => {
    const r = await verifierUrl(`${base}/boucle`, "GET", essai);
    expect(r.erreur).toMatch(/Trop de redirections \(10 au plus\)/);
    expect(r.chaine).toHaveLength(11);
    expect(r.code).toBe(302);
  });

  it("délai dépassé : erreur claire, sans bloquer", async () => {
    const r = await verifierUrl(`${base}/lent`, "GET", { ...essai, delaiMs: 300 });
    expect(r.erreur).toMatch(/Délai dépassé/);
    expect(r.code).toBeNull();
    expect(r.dureeMs).toBeLessThan(5000);
  });

  it("n'envoie ni cookie ni authentification, et s'identifie par son User-Agent", async () => {
    enTetesRecus.length = 0;
    await verifierUrl(`${base}/ok`, "GET", essai);
    const h = enTetesRecus[0]!;
    expect(h["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toContain("Atelier");
    expect(h["cookie"]).toBeUndefined();
    expect(h["authorization"]).toBeUndefined();
  });
});

describe("verifier_url : sécurité", () => {
  it("schéma refusé (ftp, file, javascript)", async () => {
    for (const u of ["ftp://exemple.test/x", "file:///etc/passwd", "javascript:alert(1)"]) {
      const r = await verifierUrl(u, "GET", essai);
      expect(r.erreur, u).toMatch(/Schéma refusé/);
      expect(r.chaine).toEqual([]);
    }
  });

  it("URL invalide et identifiants dans l'adresse refusés", async () => {
    expect((await verifierUrl("pas une url", "GET", essai)).erreur).toMatch(/URL invalide/);
    expect((await verifierUrl(`http://u:p@127.0.0.1:${new URL(base).port}/ok`, "GET", essai)).erreur).toMatch(/identifiants/);
  });

  it.each(["http://127.0.0.1/", "http://127.1.2.3/", "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.255.255/", "http://192.168.1.1/", "http://169.254.169.254/", "http://0.0.0.0/",
    "http://[::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://2130706433/", "http://localhost/", "http://api.localhost/"])(
    "adresse locale, privée ou réservée refusée par défaut : %s", async (u) => {
      const r = await verifierUrl(u);
      expect(r.erreur).toMatch(/refusée/);
      expect(r.code).toBeNull();
      expect(r.chaine).toEqual([]);
    });

  it("adresses publiques acceptées par le filtre de production, 172.32 et 100.63 compris", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111"]) expect(adresseAutorisee(ip), ip).toBe(true);
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.5.5", "192.168.0.1", "169.254.1.1", "0.0.0.0", "::1", "::", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "pas-une-ip"]) expect(adresseAutorisee(ip), ip).toBe(false);
  });

  it("refus après résolution DNS : un nom public qui pointe vers une adresse interne", async () => {
    const r = await verifierUrl("http://pirate.example/", "GET", { resoudre: async () => ["10.0.0.5"] });
    expect(r.erreur).toMatch(/pointe vers 10\.0\.0\.5/);
  });

  it("refus si UNE des adresses résolues est interne", async () => {
    const r = await verifierUrl("http://mixte.example/", "GET", { resoudre: async () => ["93.184.216.34", "192.168.0.9"] });
    expect(r.erreur).toMatch(/192\.168\.0\.9/);
  });

  it("redirection vers une adresse interne refusée (la première réponse reste dans la chaîne)", async () => {
    const r = await verifierUrl(`${base}/vers-interne`, "GET", essai);
    expect(r.erreur).toMatch(/169\.254\.169\.254/);
    expect(r.chaine).toEqual([{ url: `${base}/vers-interne`, code: 302 }]);
    expect(r.destination).toBe(`${base}/vers-interne`);
  });

  it("redirection vers localhost et vers un schéma ftp refusées", async () => {
    expect((await verifierUrl(`${base}/vers-localhost`, "GET", essai)).erreur).toMatch(/local/);
    expect((await verifierUrl(`${base}/vers-ftp`, "GET", essai)).erreur).toMatch(/Schéma refusé/);
  });

  it("IPv4 d'abord : une première adresse IPv6 sans route (ECONNREFUSED) ne fait plus échouer la lecture", async () => {
    // Le serveur d'essai n'écoute qu'en IPv4 : avant la correction, la connexion partait sur ::1 et échouait.
    const r = await verifierUrl(`http://site-fictif.example:${new URL(base).port}/ok`, "GET", { adresseAutorisee: () => true, resoudre: async () => ["::1", "127.0.0.1"] });
    expect(r.code).toBe(200);
  });

  it("la connexion se fait sur l'adresse vérifiée, sans seconde résolution", async () => {
    // Le nom n'existe pas dans le DNS : seul le résolveur injecté le connaît, la requête doit donc aboutir sur 127.0.0.1.
    const r = await verifierUrl(`http://site-fictif.example:${new URL(base).port}/ok`, "GET", { ...essai, resoudre: async () => ["127.0.0.1"] });
    expect(r.code).toBe(200);
  });
});

describe("service liens dans la passerelle (mélange)", () => {
  let passerelle: PasserelleDeTest;
  let client: Client;

  beforeAll(async () => {
    const registre = new RegistreFournisseurs().enregistrer(fournisseurLiensReel());
    passerelle = await demarrer({ registre, servicesReels: ["liens"] });
    const jeton = (await obtenirJetons(passerelle.url, "liens", "web/public")).access_token;
    client = new Client({ name: "essai-liens", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${passerelle.url}/mcp/liens`), { requestInit: { headers: { authorization: `Bearer ${jeton}` } } }));
  });

  afterAll(async () => {
    await client.close().catch(() => undefined);
    await passerelle.arreter();
  });

  it("/sante liste liens parmi services et services_reels", async () => {
    const sante = (await (await fetch(`${passerelle.url}/sante`)).json()) as { services: string[]; services_reels: string[] };
    expect(sante.services).toContain("liens");
    expect(sante.services_reels).toEqual(["liens"]);
  });

  it("expose atelier_identite et verifier_url (lecture seule), mode réel", async () => {
    const outils = (await client.listTools()).tools;
    expect(outils.map((o) => o.name).sort()).toEqual(["atelier_identite", "verifier_url"]);
    expect(outils.find((o) => o.name === "verifier_url")?.annotations?.readOnlyHint).toBe(true);
    const id = await client.callTool({ name: "atelier_identite", arguments: {} });
    expect((id["structuredContent"] as Record<string, unknown>)["mode"]).toBe("reel");
  });

  it("par la passerelle, le filtre de production refuse la boucle locale (le serveur d'essai n'est pas joignable)", async () => {
    const r = await client.callTool({ name: "verifier_url", arguments: { url: `${base}/ok` } });
    const donnees = r["structuredContent"] as Record<string, unknown>;
    expect(String(donnees["erreur"])).toMatch(/refusée/);
    expect(donnees["code"]).toBeNull();
  });
});
