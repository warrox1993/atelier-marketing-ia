// Serveur de pages : affichage, consentement exigé, CSRF, piège à robots, limite de débit, en-têtes, rejeu, panne du dépôt.
// Serveur réel sur un port éphémère, magasin SQLite en mémoire, faux dépôt dans l'atelier.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MagasinPages } from "../../src/pages/magasin.js";
import { creerServeurPages, type ServeurPages } from "../../src/pages/serveur.js";
import type { EnvoiVisiteur } from "../../src/pages/depot-atelier.js";
import { LimiteDebit } from "../../src/pages/securite.js";
import type { PageDestination } from "../../src/pages/magasin.js";

const ENTREPRISE = "123e4567-e89b-42d3-a456-426614174000";
const SECRET = Buffer.from("secret-de-test-0123456789abcdef0123456789");

interface Montage {
  base: string;
  magasin: MagasinPages;
  page: PageDestination;
  depots: Array<{ page: PageDestination; envoi: EnvoiVisiteur }>;
  horloge: { t: number };
  echecDepot: { actif: boolean };
  arreter(): Promise<void>;
}

async function monter(options: { limiteEnvoi?: LimiteDebit; confianceProxy?: boolean; sautsProxy?: number; limiteRefus?: LimiteDebit } = {}): Promise<Montage> {
  const magasin = new MagasinPages(":memory:");
  const page = magasin.creerPage({
    entreprise_id: ENTREPRISE, titre: "Isolation de toiture", accroche: "Réduisez votre facture de chauffage cet hiver.", offre_type: "rappel_conseiller",
    offre_intitule: "Diagnostic gratuit de toiture", offre_description: "Un conseiller étudie votre toiture et vous rappelle.", responsable: "Toitures Exemple SRL",
    contact_confidentialite: "vie-privee@exemple.test",
  });
  const depots: Montage["depots"] = [];
  const echecDepot = { actif: false };
  const horloge = { t: Date.parse("2026-10-22T10:00:00Z") };
  const serveur: ServeurPages = creerServeurPages({
    hote: "127.0.0.1", port: 0, magasin, secret: SECRET, umami: null,
    depot: { deposer: async (p, e) => { if (echecDepot.actif) throw new Error("atelier hors service"); depots.push({ page: p, envoi: e }); return { prospectId: `prospect-${depots.length}`, nouveau: true, tacheId: "t1", tacheErreur: null }; } },
    maintenant: () => horloge.t, ...options,
  });
  const a = await serveur.ecouter();
  return { base: `http://127.0.0.1:${a.port}`, magasin, page, depots, horloge, echecDepot, arreter: () => serveur.arreter() };
}

/** Charge la page et renvoie le jeton caché et le cookie, puis laisse passer 3 s (au-delà du délai minimal). */
async function ouvrir(m: Montage, entetes: Record<string, string> = {}): Promise<{ jeton: string; cookie: string; html: string }> {
  const r = await fetch(`${m.base}/p/${m.page.slug}`, { headers: entetes });
  const html = await r.text();
  const jeton = /name="jeton" value="([^"]+)"/u.exec(html)?.[1] ?? "";
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  m.horloge.t += 3000;
  return { jeton, cookie, html };
}

const VALIDE = { nom: "Camille Dupont", telephone: "0470 12 34 56", courriel: "", creneau: "matin", consentement: "oui", site_web: "" };

async function envoyer(m: Montage, champs: Record<string, string>, cookie: string, entetes: Record<string, string> = {}): Promise<Response> {
  return fetch(`${m.base}/p/${m.page.slug}`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: m.base, ...entetes },
    body: new URLSearchParams(champs).toString(),
  });
}

let m: Montage;
beforeEach(async () => { m = await monter(); });
afterEach(async () => { await m.arreter(); m.magasin.fermer(); });

describe("affichage de la page", () => {
  it("sert le formulaire avec une case de consentement NON pré-cochée et le texte exact figé", async () => {
    const { html } = await ouvrir(m);
    const case_ = /<input id="consentement"[^>]*>/u.exec(html)?.[0] ?? "";
    expect(case_).toContain('type="checkbox"');
    expect(case_).not.toMatch(/checked/iu);
    expect(html).toContain("J&#39;accepte que Toitures Exemple SRL utilise mon nom");
    expect(html).toContain("vie-privee@exemple.test");
  });
  it("applique la CSP stricte et les en-têtes de protection, sans script ni style en ligne", async () => {
    const r = await fetch(`${m.base}/p/${m.page.slug}`);
    const html = await r.text();
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(/<script(?![^>]*\bsrc=)/iu.test(html)).toBe(false);
    expect(/\sstyle=|\son[a-z]+=/iu.test(html)).toBe(false);
  });
  it("répond 404 pour une page inconnue ou un slug invalide", async () => {
    expect((await fetch(`${m.base}/p/inconnue-abcdef12`)).status).toBe(404);
    expect((await fetch(`${m.base}/p/..%2Fetc`)).status).toBe(404);
  });
  it("refuse un en-tête Host étranger (rebond DNS)", async () => {
    const r = await new Promise<number>((resolve, reject) => {
      import("node:http").then(({ request }) => {
        const q = request({ host: "127.0.0.1", port: Number(new URL(m.base).port), path: `/p/${m.page.slug}`, headers: { host: "pirate.example" } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
        q.on("error", reject); q.end();
      }, reject);
    });
    expect(r).toBe(421);
  });
});

describe("envoi du formulaire", () => {
  it("crée un dépôt avec le consentement exact, l'IP tronquée, la page et redirige vers la page de remerciement", async () => {
    const { jeton, cookie } = await ouvrir(m);
    const r = await envoyer(m, { ...VALIDE, jeton }, cookie);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/p/${m.page.slug}/merci`);
    expect(m.depots).toHaveLength(1);
    const d = m.depots[0]!;
    expect(d.envoi.telephone).toBe("+32470123456");
    expect(d.envoi.nom).toBe("Camille Dupont");
    expect(d.envoi.ipTronquee).toBe("127.0.0.0");
    expect(d.page.texteConsentement).toContain("J'accepte que Toitures Exemple SRL");
    expect(m.magasin.compterEnvois(m.page.slug)).toBe(1);
    const merci = await fetch(`${m.base}${r.headers.get("location")}`);
    expect(merci.status).toBe(200);
  });

  it("exige le consentement : case non cochée = aucun dépôt, message d'erreur lié au champ", async () => {
    const { jeton, cookie } = await ouvrir(m);
    const { consentement: _c, ...sans } = VALIDE;
    const r = await envoyer(m, { ...sans, jeton }, cookie);
    expect(r.status).toBe(422);
    const html = await r.text();
    expect(html).toContain('id="consentement-erreur"');
    expect(m.depots).toHaveLength(0);
    expect(m.magasin.compterEnvois(m.page.slug)).toBe(0);
    // Une valeur autre que « oui » ne vaut pas consentement non plus.
    const second = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, consentement: "on", jeton: second.jeton }, second.cookie)).status).toBe(422);
    expect(m.depots).toHaveLength(0);
  });

  it("garde en mémoire du formulaire les valeurs saisies, échappées, sans les interpréter", async () => {
    const { jeton, cookie } = await ouvrir(m);
    const r = await envoyer(m, { ...VALIDE, nom: "x", telephone: '"><script>alert(1)</script>', consentement: "", jeton }, cookie);
    const html = await r.text();
    expect(r.status).toBe(422);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("refuse sans jeton, avec un jeton falsifié ou avec le cookie d'une autre session (CSRF)", async () => {
    const a = await ouvrir(m);
    const b = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE }, a.cookie)).status).toBe(403);
    expect((await envoyer(m, { ...VALIDE, jeton: a.jeton.slice(0, -2) + "xx" }, a.cookie)).status).toBe(403);
    expect((await envoyer(m, { ...VALIDE, jeton: a.jeton }, b.cookie)).status).toBe(403);
    expect((await envoyer(m, { ...VALIDE, jeton: a.jeton }, "")).status).toBe(403);
    expect(m.depots).toHaveLength(0);
  });

  it("refuse un jeton émis pour une autre page", async () => {
    const autre = m.magasin.creerPage({
      entreprise_id: ENTREPRISE, titre: "Autre page", accroche: "Une autre accroche valable.", offre_type: "guide_gratuit", offre_intitule: "Guide gratuit",
      offre_description: "Description du guide offert.", responsable: "Toitures Exemple SRL", contact_confidentialite: "vie-privee@exemple.test",
    });
    const r = await fetch(`${m.base}/p/${autre.slug}`);
    const jeton = /name="jeton" value="([^"]+)"/u.exec(await r.text())![1]!;
    const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0]!;
    m.horloge.t += 3000;
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(403);
    expect(m.depots).toHaveLength(0);
  });

  it("refuse un jeton expiré (plus de 2 h)", async () => {
    const { jeton, cookie } = await ouvrir(m);
    m.horloge.t += 3 * 3600 * 1000;
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(403);
    expect(m.depots).toHaveLength(0);
  });

  it("piège à robots : champ caché rempli = réponse de succès apparente, rien d'enregistré", async () => {
    const { jeton, cookie } = await ouvrir(m);
    const r = await envoyer(m, { ...VALIDE, site_web: "https://spam.example", jeton }, cookie);
    expect(r.status).toBe(303);
    expect(m.depots).toHaveLength(0);
    expect(m.magasin.compterEnvois(m.page.slug)).toBe(0);
  });

  it("piège à robots : envoi plus rapide que 2 s = réponse de succès apparente, rien d'enregistré", async () => {
    const r0 = await fetch(`${m.base}/p/${m.page.slug}`);
    const jeton = /name="jeton" value="([^"]+)"/u.exec(await r0.text())![1]!;
    const cookie = (r0.headers.get("set-cookie") ?? "").split(";")[0]!;
    const r = await envoyer(m, { ...VALIDE, jeton }, cookie); // aucune seconde écoulée
    expect(r.status).toBe(303);
    expect(m.depots).toHaveLength(0);
  });

  it("un jeton ne sert qu'une fois : le rejeu ne crée pas de second prospect", async () => {
    const { jeton, cookie } = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(303);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(303);
    expect(m.depots).toHaveLength(1);
  });

  it("refuse un envoi d'une autre origine, un type de contenu inattendu et un corps trop gros", async () => {
    const { jeton, cookie } = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie, { origin: "https://pirate.example" })).status).toBe(403);
    const json = await fetch(`${m.base}/p/${m.page.slug}`, { method: "POST", headers: { "content-type": "application/json", cookie, origin: m.base }, body: "{}" });
    expect(json.status).toBe(415);
    const gros = await envoyer(m, { ...VALIDE, jeton, nom: "a".repeat(20_000) }, cookie).catch(() => null);
    expect(gros === null || gros.status === 413).toBe(true);
    expect(m.depots).toHaveLength(0);
  });

  it("panne du dépôt : 503, rien n'est marqué comme envoyé, le même formulaire peut être renvoyé", async () => {
    const { jeton, cookie } = await ouvrir(m);
    m.echecDepot.actif = true;
    const r = await envoyer(m, { ...VALIDE, jeton }, cookie);
    expect(r.status).toBe(503);
    expect(m.magasin.compterEnvois(m.page.slug)).toBe(0);
    m.echecDepot.actif = false;
    m.horloge.t += 3000;
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(303);
    expect(m.depots).toHaveLength(1);
  });
});

describe("limite de débit", () => {
  it("répond 429 après 5 envois en 10 minutes depuis la même adresse", async () => {
    const statuts: number[] = [];
    for (let i = 0; i < 7; i++) {
      const { jeton, cookie } = await ouvrir(m);
      statuts.push((await envoyer(m, { ...VALIDE, jeton, nom: `Personne ${i}` }, cookie)).status);
    }
    expect(statuts.slice(0, 5)).toEqual([303, 303, 303, 303, 303]);
    expect(statuts.slice(5)).toEqual([429, 429]);
    expect(m.depots).toHaveLength(5);
  });
});

describe("limite de débit : adresse du visiteur et refus", () => {
  it("derrière un proxy de confiance, une valeur forgée à gauche de X-Forwarded-For est ignorée : on retient celle ajoutée par le proxy", async () => {
    await m.arreter(); m.magasin.fermer();
    m = await monter({ confianceProxy: true });
    const { jeton, cookie } = await ouvrir(m);
    const r = await envoyer(m, { ...VALIDE, jeton }, cookie, { "x-forwarded-for": "6.6.6.6, 203.0.113.77" });
    expect(r.status).toBe(303);
    expect(m.depots[0]!.envoi.ipTronquee).toBe("203.0.113.0");
  });

  it("deux mandataires de confiance (PAGES_PROXY_SAUTS=2) : on retient l'adresse à deux rangs depuis la droite", async () => {
    await m.arreter(); m.magasin.fermer();
    m = await monter({ confianceProxy: true, sautsProxy: 2 });
    const { jeton, cookie } = await ouvrir(m);
    await envoyer(m, { ...VALIDE, jeton }, cookie, { "x-forwarded-for": "6.6.6.6, 198.51.100.9, 10.0.0.2" });
    expect(m.depots[0]!.envoi.ipTronquee).toBe("198.51.100.0");
  });

  it("valeur invalide ou liste trop courte : adresse de la connexion ; sans proxy de confiance, l'en-tête est ignoré", async () => {
    await m.arreter(); m.magasin.fermer();
    m = await monter({ confianceProxy: true, sautsProxy: 3 });
    let t = await ouvrir(m);
    await envoyer(m, { ...VALIDE, jeton: t.jeton }, t.cookie, { "x-forwarded-for": "6.6.6.6, 203.0.113.77" });
    t = await ouvrir(m);
    await envoyer(m, { ...VALIDE, jeton: t.jeton, nom: "Autre Personne" }, t.cookie, { "x-forwarded-for": "6.6.6.6, pas-une-adresse" });
    expect(m.depots.map((d) => d.envoi.ipTronquee)).toEqual(["127.0.0.0", "127.0.0.0"]);
    await m.arreter(); m.magasin.fermer();
    m = await monter();
    t = await ouvrir(m);
    await envoyer(m, { ...VALIDE, jeton: t.jeton }, t.cookie, { "x-forwarded-for": "203.0.113.77" });
    expect(m.depots[0]!.envoi.ipTronquee).toBe("127.0.0.0");
  });

  it("60 POST sans jeton ne bloquent pas la page : un visiteur légitime est accepté ensuite", async () => {
    for (let i = 0; i < 60; i++) {
      const r = await envoyer(m, { ...VALIDE, jeton: "faux" }, "csrf=faux");
      expect([403, 429]).toContain(r.status);
    }
    const { jeton, cookie } = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(303);
    expect(m.depots).toHaveLength(1);
  });

  it("l'anti-abus des refus répond 429 au-delà de son plafond, sans jamais bloquer un envoi valide de la même adresse", async () => {
    await m.arreter(); m.magasin.fermer();
    m = await monter({ limiteRefus: new LimiteDebit(3, 10 * 60 * 1000, () => m.horloge.t) });
    const statuts: number[] = [];
    for (let i = 0; i < 6; i++) statuts.push((await envoyer(m, { ...VALIDE, jeton: "faux" }, "csrf=faux")).status);
    expect(statuts).toEqual([403, 403, 403, 429, 429, 429]);
    const { jeton, cookie } = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(303);
  });

  it("5 POST invalides depuis l'adresse commune du tunnel (sans proxy de confiance) : un visiteur valide est accepté ensuite", async () => {
    for (let i = 0; i < 5; i++) {
      const { jeton, cookie } = await ouvrir(m);
      expect((await envoyer(m, { ...VALIDE, jeton, consentement: "" }, cookie)).status).toBe(422);
    }
    const { jeton, cookie } = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(303);
    expect(m.depots).toHaveLength(1);
  });

  it("les pièges à robots comptent comme des refus : au-delà du plafond, 429 (plus de journal illimité)", async () => {
    await m.arreter(); m.magasin.fermer();
    m = await monter({ limiteRefus: new LimiteDebit(3, 10 * 60 * 1000, () => m.horloge.t) });
    const statuts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { jeton, cookie } = await ouvrir(m);
      statuts.push((await envoyer(m, { ...VALIDE, jeton, site_web: "https://spam.example" }, cookie)).status);
    }
    expect(statuts).toEqual([303, 303, 303, 429, 429]);
    expect(m.depots).toHaveLength(0);
  });

  it("IPv6 : des adresses différentes d'un même /64 partagent la limite des envois valides", async () => {
    await m.arreter(); m.magasin.fermer();
    m = await monter({ confianceProxy: true });
    const statuts: number[] = [];
    for (let i = 1; i <= 7; i++) {
      const { jeton, cookie } = await ouvrir(m);
      statuts.push((await envoyer(m, { ...VALIDE, jeton, nom: `Personne ${i}` }, cookie, { "x-forwarded-for": `2001:db8:1:2::${i}` })).status);
    }
    expect(statuts).toEqual([303, 303, 303, 303, 303, 429, 429]);
    expect(m.depots).toHaveLength(5);
  });

  it("la limite sur les envois valides reste effective : 5 par adresse, puis 429 sans consommer le jeton", async () => {
    for (let i = 0; i < 5; i++) {
      const { jeton, cookie } = await ouvrir(m);
      expect((await envoyer(m, { ...VALIDE, jeton, nom: `Personne ${i}` }, cookie)).status).toBe(303);
    }
    const { jeton, cookie } = await ouvrir(m);
    expect((await envoyer(m, { ...VALIDE, jeton }, cookie)).status).toBe(429);
    expect(m.depots).toHaveLength(5);
  });
});
