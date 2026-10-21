// Mandataire local du navigateur d'audit : refus des adresses non publiques AU MOMENT de la connexion (CONNECT et HTTP simple),
// une seule résolution par requête (rebinding simulé par un résolveur factice), redirections vers l'interne refusées.
// Les « amonts » sont de vrais serveurs locaux ; le filtre d'essai n'autorise que 127.0.0.1 en plus de la production,
// sauf pour les essais du filtre de production lui-même.

import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { demarrerMandataire, type Mandataire } from "../../src/reel/audit/mandataire-audit.js";
import { adresseAutorisee } from "../../src/reel/liens/verifier-url.js";

const LOCAL = "127.0.0.1";
const filtreEssai = (ip: string): boolean => ip === LOCAL || adresseAutorisee(ip);

const aFermer: (() => Promise<void>)[] = [];
afterEach(async () => { while (aFermer.length > 0) await (aFermer.pop() as () => Promise<void>)(); });

async function amont(gestionnaire: http.RequestListener): Promise<{ port: number; connexions: () => number; requetes: string[] }> {
  const requetes: string[] = [];
  let connexions = 0;
  const s = http.createServer((req, res) => { requetes.push(`${req.method} ${req.url} host=${req.headers.host}`); gestionnaire(req, res); });
  s.on("connection", () => { connexions++; });
  await new Promise<void>((r) => s.listen(0, LOCAL, r));
  aFermer.push(async () => { s.closeAllConnections(); await new Promise<void>((r) => s.close(() => r())); });
  return { port: (s.address() as AddressInfo).port, connexions: () => connexions, requetes };
}

async function serveurTcp(sur: (s: net.Socket) => void): Promise<{ port: number }> {
  const sockets = new Set<net.Socket>();
  const echo = net.createServer((s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); sur(s); });
  await new Promise<void>((r) => echo.listen(0, LOCAL, r));
  aFermer.push(async () => { for (const s of sockets) s.destroy(); await new Promise<void>((r) => echo.close(() => r())); });
  return { port: (echo.address() as AddressInfo).port };
}

async function mandataire(options: Parameters<typeof demarrerMandataire>[0]): Promise<Mandataire> {
  const m = await demarrerMandataire(options);
  aFermer.push(() => m.arreter());
  return m;
}

/** Requête HTTP « absolute-form » envoyée au mandataire, comme le fait Chrome. */
function viaMandataire(m: Mandataire, url: string): Promise<{ code: number; corps: string; entetes: http.IncomingHttpHeaders }> {
  return new Promise((resolve, rejeter) => {
    const req = http.request({ host: LOCAL, port: m.port, method: "GET", path: url, headers: { host: new URL(url).host } }, (res) => {
      const morceaux: Buffer[] = [];
      res.on("data", (c: Buffer) => morceaux.push(c));
      res.on("end", () => resolve({ code: res.statusCode ?? 0, corps: Buffer.concat(morceaux).toString(), entetes: res.headers }));
    });
    req.on("error", rejeter);
    req.end();
  });
}

/** CONNECT envoyé au mandataire : rend la ligne d'état et le socket ouvert (ou fermé si refus). */
function connecter(m: Mandataire, cible: string): Promise<{ statut: string; socket: net.Socket }> {
  return new Promise((resolve, rejeter) => {
    const socket = net.connect({ host: LOCAL, port: m.port }, () => socket.write(`CONNECT ${cible} HTTP/1.1\r\nhost: ${cible}\r\n\r\n`));
    let tampon = "";
    socket.on("data", (d) => {
      tampon += d.toString();
      if (tampon.includes("\r\n\r\n")) { socket.removeAllListeners("data"); resolve({ statut: tampon.split("\r\n")[0] as string, socket }); }
    });
    socket.on("error", rejeter);
    socket.on("close", () => { if (!tampon.includes("\r\n\r\n")) resolve({ statut: tampon.split("\r\n")[0] ?? "", socket }); });
    aFermer.push(async () => { socket.destroy(); });
  });
}

describe("mandataire d'audit : écoute", () => {
  it("n'écoute que sur 127.0.0.1, sur un port éphémère, et s'arrête vraiment", async () => {
    const m = await demarrerMandataire({});
    expect(m.port).toBeGreaterThan(1023);
    const ecoute = await new Promise<boolean>((r) => { const s = net.connect({ host: LOCAL, port: m.port }); s.on("connect", () => { s.destroy(); r(true); }); s.on("error", () => r(false)); });
    expect(ecoute).toBe(true);
    await m.arreter();
    const apres = await new Promise<boolean>((r) => { const s = net.connect({ host: LOCAL, port: m.port }); s.on("connect", () => { s.destroy(); r(true); }); s.on("error", () => r(false)); });
    expect(apres).toBe(false);
  });
});

describe("mandataire d'audit : adresse interne refusée à la connexion (filtre de production)", () => {
  it.each(["127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1", "[::1]", "[::ffff:7f00:1]", "[fd00::1]", "[::127.0.0.1]", "localhost", "machine.localhost"])(
    "CONNECT %s:443 : 403, aucune connexion amont", async (hote) => {
      const cible = await amont((_q, r) => r.end("secret"));
      const m = await mandataire({ resoudre: async () => ["10.0.0.5"] });
      const { statut } = await connecter(m, `${hote}:${hote === "127.0.0.1" ? cible.port : 443}`);
      expect(statut).toContain("403");
      expect(cible.connexions()).toBe(0);
      expect(m.refus()).toBe(1);
    });

  it("requête HTTP simple vers une adresse littérale interne : 403, l'amont ne reçoit rien", async () => {
    const cible = await amont((_q, r) => r.end("secret"));
    const m = await mandataire({});
    const rep = await viaMandataire(m, `http://127.0.0.1:${cible.port}/secret`);
    expect(rep.code).toBe(403);
    expect(rep.corps).not.toContain("secret");
    expect(cible.connexions()).toBe(0);
  });

  it("nom public qui se résout vers une adresse interne : 403 (CONNECT et HTTP)", async () => {
    const cible = await amont((_q, r) => r.end("secret"));
    const m = await mandataire({ resoudre: async () => ["10.0.0.5"] });
    expect((await connecter(m, "pirate.example:443")).statut).toContain("403");
    expect((await viaMandataire(m, `http://pirate.example:${cible.port}/`)).code).toBe(403);
    expect(cible.connexions()).toBe(0);
  });

  it("une seule adresse interne parmi celles résolues suffit à refuser", async () => {
    const m = await mandataire({ resoudre: async () => ["8.8.8.8", "192.168.0.10"] });
    expect((await viaMandataire(m, "http://mixte.example/")).code).toBe(403);
  });

  it("cible CONNECT mal formée ou port invalide : refusée", async () => {
    const m = await mandataire({ resoudre: async () => ["8.8.8.8"] });
    expect((await connecter(m, "exemple.be")).statut).toContain("403");
    expect((await connecter(m, "exemple.be:0")).statut).toContain("403");
    expect((await connecter(m, "exemple.be:99999")).statut).toContain("403");
  });
});

describe("mandataire d'audit : relais d'une connexion autorisée", () => {
  it("HTTP simple : relaie vers l'adresse résolue, conserve l'en-tête Host du nom demandé, retire les en-têtes de proxy", async () => {
    const cible = await amont((q, r) => { r.setHeader("x-vu", String(q.headers["proxy-connection"] ?? "aucun")); r.end("bonjour"); });
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async () => [LOCAL] });
    const rep = await viaMandataire(m, `http://site-fictif.example:${cible.port}/chemin?a=1`);
    expect(rep.code).toBe(200);
    expect(rep.corps).toBe("bonjour");
    expect(cible.requetes).toEqual([`GET /chemin?a=1 host=site-fictif.example:${cible.port}`]);
  });

  it("CONNECT : ouvre un tunnel d'octets vers l'adresse résolue", async () => {
    const echo = await serveurTcp((s) => s.on("data", (d) => s.write(`écho:${d.toString()}`)));
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async () => [LOCAL] });
    const { statut, socket } = await connecter(m, `tunnel.example:${echo.port}`);
    expect(statut).toContain("200");
    const reponse = await new Promise<string>((r) => { socket.once("data", (d) => r(d.toString())); socket.write("salut"); });
    expect(reponse).toBe("écho:salut");
  });

  it("amont injoignable : 502, pas d'exception", async () => {
    const libre = await new Promise<number>((r) => { const s = net.createServer(); s.listen(0, LOCAL, () => { const p = (s.address() as AddressInfo).port; s.close(() => r(p)); }); });
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async () => [LOCAL] });
    expect((await connecter(m, `ferme.example:${libre}`)).statut).toContain("502");
    expect((await viaMandataire(m, `http://ferme.example:${libre}/`)).code).toBe(502);
  });
});

describe("mandataire d'audit : redirection et rebinding", () => {
  it("redirection vers une adresse interne : le navigateur suit en repassant par le mandataire, qui refuse", async () => {
    const cible = await amont((_q, r) => { r.writeHead(302, { location: "http://10.0.0.5/admin" }); r.end(); });
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async (h) => (h === "ouvert.example" ? [LOCAL] : ["10.0.0.5"]) });
    const premiere = await viaMandataire(m, `http://ouvert.example:${cible.port}/`);
    expect(premiere.code).toBe(302);
    const suite = await viaMandataire(m, premiere.entetes.location as string);
    expect(suite.code).toBe(403);
  });

  it("rebinding simulé : le nom est résolu UNE fois par requête, la connexion va à l'adresse vérifiée", async () => {
    const cible = await amont((_q, r) => r.end("public"));
    // 1re résolution : adresse autorisée ; toute résolution suivante : adresse interne. Un mandataire qui résoudrait deux
    // fois (une pour vérifier, une pour se connecter) irait vers l'interne ; celui-ci n'en fait qu'une.
    let appels = 0;
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async () => (++appels === 1 ? [LOCAL] : ["10.0.0.5"]) });
    const rep = await viaMandataire(m, `http://rebond.example:${cible.port}/`);
    expect(rep.code).toBe(200);
    expect(rep.corps).toBe("public");
    expect(appels).toBe(1);
    expect(cible.connexions()).toBe(1);
  });

  it("rebinding simulé, ordre inverse : la 1re résolution est interne, donc refus, même si la 2e serait publique", async () => {
    const cible = await amont((_q, r) => r.end("public"));
    let appels = 0;
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async () => (++appels === 1 ? ["10.0.0.5"] : [LOCAL]) });
    expect((await viaMandataire(m, `http://rebond.example:${cible.port}/`)).code).toBe(403);
    expect(appels).toBe(1);
    expect(cible.connexions()).toBe(0);
  });

  it("CONNECT : une seule résolution aussi", async () => {
    const echo = await serveurTcp((s) => s.on("data", () => s.end("ok")));
    let appels = 0;
    const m = await mandataire({ adresseAutorisee: filtreEssai, resoudre: async () => (++appels === 1 ? [LOCAL] : ["10.0.0.5"]) });
    const { statut } = await connecter(m, `rebond.example:${echo.port}`);
    expect(statut).toContain("200");
    expect(appels).toBe(1);
  });
});
