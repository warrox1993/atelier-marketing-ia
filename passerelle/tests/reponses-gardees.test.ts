// Références à usage unique : réponses d'outils de lecture gardées en mémoire (lot C1, côté passerelle).

import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";
import { ReponsesGardees, reponsesGardeesDepuisEnv } from "../src/reponses-gardees.js";
import { appelerOutil, construireCatalogue } from "../src/outils.js";
import { FICHES_PAR_DEFAUT } from "../src/services.js";
import { SignataireEnveloppe, verifierEnveloppe } from "../src/signature-enveloppe.js";
import { demarrer, obtenirJetons, rpc, type PasserelleDeTest } from "./aide.js";

describe("ReponsesGardees", () => {
  it("garder renvoie un identifiant de 22 caractères base64url ; prendre rend la réponse exacte puis null (usage unique)", () => {
    const g = new ReponsesGardees();
    const reponse = { a: 1, liste: ["x", { y: true }] };
    const ref = g.garder(reponse)!;
    expect(ref).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(g.prendre(ref)).toEqual(reponse);
    expect(g.prendre(ref)).toBeNull();
    expect(g.prendre("inconnue")).toBeNull();
  });

  it("une référence expire après 1 h (horloge injectée)", () => {
    let t = 1_000;
    const g = new ReponsesGardees({ maintenant: () => t });
    const ref = g.garder({ a: 1 })!;
    t += 3600 * 1000 - 1;
    const encore = g.garder({ b: 2 })!;
    t += 2;
    expect(g.prendre(ref)).toBeNull();
    expect(g.prendre(encore)).toEqual({ b: 2 });
  });

  it("plafond en nombre d'entrées : la plus ancienne est évincée", () => {
    const g = new ReponsesGardees({ maxEntrees: 2 });
    const [a, b, c] = [g.garder({ n: 1 })!, g.garder({ n: 2 })!, g.garder({ n: 3 })!];
    expect(g.prendre(a)).toBeNull();
    expect(g.prendre(b)).toEqual({ n: 2 });
    expect(g.prendre(c)).toEqual({ n: 3 });
  });

  it("plafond par clé de cloisonnement : un bavard n'évince que ses propres références, pas celles des autres", () => {
    const g = new ReponsesGardees({ maxParCle: 2 });
    const autre = g.garder({ n: "autre" }, { cloisonnement: "gsc|B" })!;
    const [a1, a2, a3] = [1, 2, 3].map((n) => g.garder({ n }, { cloisonnement: "gsc|A" })!) as [string, string, string];
    expect(g.prendre(a1)).toBeNull();
    expect(g.prendre(a2)).toEqual({ n: 2 });
    expect(g.prendre(a3)).toEqual({ n: 3 });
    expect(g.prendre(autre)).toEqual({ n: "autre" });
  });

  it("plafond en octets : la plus ancienne est évincée ; une réponse seule trop grosse n'est pas gardée (null)", () => {
    const g = new ReponsesGardees({ maxOctets: 100 });
    const a = g.garder({ t: "a".repeat(40) })!;
    const b = g.garder({ t: "b".repeat(40) })!;
    const c = g.garder({ t: "c".repeat(40) })!;
    expect(g.prendre(a)).toBeNull();
    expect(g.prendre(b)).not.toBeNull();
    expect(g.prendre(c)).not.toBeNull();
    expect(g.garder({ t: "z".repeat(500) })).toBeNull();
  });
});

describe("références dans l'enveloppe signée", () => {
  const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);
  const contexte = { service: "gsc", mode: "reel" as const, identite: { compte: "Compte", propriete: null }, jetonPorteur: "x" };
  const catalogue = construireCatalogue(FICHES_PAR_DEFAUT.find((f) => f.id === "gsc")!, "reel", {
    service: "gsc",
    mode: "reel",
    outils: [
      { nom: "lecture", description: "l", schemaEntree: { q: z.string().optional() }, annotations: { readOnlyHint: true }, executer: () => ({ chiffre: 1 }) },
      { nom: "ecriture", description: "e", schemaEntree: {}, annotations: { readOnlyHint: false }, executer: () => ({ etat: "preparee" }) },
      { nom: "echec", description: "f", schemaEntree: {}, annotations: { readOnlyHint: true }, executer: () => { throw new Error("boum"); } },
    ],
  });

  it("lecture réussie : _atelier.reference dans structuredContent ET dans le texte ; prendre rend la réponse signée valide ; signature valide avec la référence", async () => {
    const g = new ReponsesGardees();
    const r = await appelerOutil(catalogue, "lecture", {}, contexte, signataire, g);
    const s = r.structuredContent as Record<string, any>;
    const ref = s._atelier.reference as string;
    expect(ref).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifierEnveloppe(s, signataire.clePubliqueBase64).ok).toBe(true);
    const texte = (r.content[0] as { text: string }).text;
    const dansTexte = JSON.parse(texte.slice(texte.indexOf("{")));
    expect(dansTexte._atelier.reference).toBe(ref);
    expect(verifierEnveloppe(dansTexte, signataire.clePubliqueBase64).ok).toBe(true);
    const gardee = g.prendre(ref) as { structuredContent: Record<string, any> };
    expect(gardee.structuredContent.chiffre).toBe(1);
    expect(verifierEnveloppe(gardee.structuredContent, signataire.clePubliqueBase64).ok).toBe(true);
  });

  it("l'empreinte signée est la même avec ou sans gardien de références", async () => {
    const avec = await appelerOutil(catalogue, "lecture", {}, contexte, signataire, new ReponsesGardees());
    const sans = await appelerOutil(catalogue, "lecture", {}, contexte, signataire);
    const charge = (r: typeof avec) => {
      const v = verifierEnveloppe(r.structuredContent as Record<string, unknown>, signataire.clePubliqueBase64);
      if (!v.ok) throw new Error(v.motif);
      return v.charge.empreinte;
    };
    expect(charge(avec)).toBe(charge(sans));
  });

  it("le cloisonnement vient du service et du compte signé de l'appel : un autre compte n'est pas évincé", async () => {
    const g = new ReponsesGardees({ maxParCle: 1 });
    const autreCompte = { ...contexte, identite: { compte: "Autre", propriete: null } };
    const ref = async (c: typeof contexte) => ((await appelerOutil(catalogue, "lecture", {}, c, signataire, g)).structuredContent as Record<string, any>)._atelier.reference as string;
    const premiere = await ref(contexte);
    const autre = await ref(autreCompte);
    const seconde = await ref(contexte);
    expect(g.prendre(premiere)).toBeNull();
    expect(g.prendre(seconde)).not.toBeNull();
    expect(g.prendre(autre)).not.toBeNull();
  });

  it("aucune référence pour un outil d'écriture, une erreur d'outil, un outil inconnu ou des arguments invalides", async () => {
    const g = new ReponsesGardees();
    for (const [nom, args] of [["ecriture", {}], ["echec", {}], ["inconnu", {}], ["lecture", { q: 5 }]] as const) {
      const r = await appelerOutil(catalogue, nom, args, contexte, signataire, g);
      expect((r.structuredContent as Record<string, any>)._atelier.reference, nom).toBeUndefined();
    }
  });
});

describe("POST /interne/reponses/prendre", () => {
  let p: PasserelleDeTest;
  const JETON = "jeton-de-test-partage-0123456789abcdef";
  const g = new ReponsesGardees({ jeton: JETON });
  const AUTH = { authorization: `Bearer ${JETON}` };
  const OUTIL = { service: "gsc", outil: "gsc_ping" };
  const garder = (r: unknown) => g.garder(r, { cloisonnement: "gsc|c", ...OUTIL })!;
  beforeAll(async () => {
    p = await demarrer({ routesInternes: [g.routeInterne()] });
  });
  afterAll(async () => { await p.arreter(); });
  const post = (corps: unknown, entetes: Record<string, string> = AUTH) =>
    fetch(`${p.url}/interne/reponses/prendre`, { method: "POST", headers: { "content-type": "application/json", ...entetes }, body: JSON.stringify(corps) });

  it("200 {reponse} au premier appel, 404 au deuxième ; 404 pour une référence inconnue ou absente ; origine étrangère refusée", async () => {
    const ref = garder({ ok: [1, 2] });
    const un = await post({ reference: ref, ...OUTIL });
    expect(un.status).toBe(200);
    expect(await un.json()).toEqual({ reponse: { ok: [1, 2] } });
    expect((await post({ reference: ref, ...OUTIL })).status).toBe(404);
    expect((await post({ reference: "nope", ...OUTIL })).status).toBe(404);
    expect((await post({ ...OUTIL })).status).toBe(404);
    const ref2 = garder({ ok: 1 });
    expect((await post({ reference: ref2, ...OUTIL }, { ...AUTH, origin: "https://exemple.test" })).status).toBe(403);
    expect((await post({ reference: ref2, ...OUTIL })).status).toBe(200);
  });

  it("F4 : sans jeton ou avec un mauvais jeton, refus 401 et la référence n'est pas consommée", async () => {
    const ref = garder({ secret: true });
    expect((await post({ reference: ref, ...OUTIL }, {})).status).toBe(401);
    expect((await post({ reference: ref, ...OUTIL }, { authorization: "Bearer autre-jeton-de-meme-longueur-0123456789" })).status).toBe(401);
    expect((await post({ reference: ref, ...OUTIL }, { authorization: JETON })).status).toBe(401);
    expect(g.prendre(ref)).toEqual({ secret: true });
  });

  it("F2/F1 : autre service ou autre outil que celui de la lecture, ou absents : refus et référence non consommée", async () => {
    const ref = garder({ n: 1 });
    expect((await post({ reference: ref, service: "ga4", outil: "gsc_ping" })).status).toBe(409);
    expect((await post({ reference: ref, service: "gsc", outil: "autre" })).status).toBe(409);
    expect((await post({ reference: ref })).status).toBe(409);
    expect((await post({ reference: ref, ...OUTIL })).status).toBe(200);
  });

  it("sans jeton configuré, la route ne se construit pas (jamais ouverte par défaut)", () => {
    expect(() => new ReponsesGardees().routeInterne()).toThrow(/jeton/u);
  });
});

describe("de bout en bout par le serveur MCP", () => {
  it("un appel de lecture porte une référence que la route interne rend une seule fois", async () => {
    const signataire = new SignataireEnveloppe(generateKeyPairSync("ed25519").privateKey);
    const g = new ReponsesGardees({ jeton: "jeton-de-test-partage-0123456789abcdef" });
    const p = await demarrer({ signataire, reponsesGardees: g, routesInternes: [g.routeInterne()] });
    try {
      const jeton = (await obtenirJetons(p.url, "gsc", "sc-domain:essai.example")).access_token;
      const r = await rpc(p.url, "gsc", "tools/call", { name: "gsc_ping", arguments: { texte: "salut" } }, jeton);
      const ref = r.corps.result.structuredContent._atelier.reference as string;
      expect(ref).toMatch(/^[A-Za-z0-9_-]{22}$/);
      const prendre = () => fetch(`${p.url}/interne/reponses/prendre`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer jeton-de-test-partage-0123456789abcdef" }, body: JSON.stringify({ reference: ref, service: "gsc", outil: "gsc_ping" }) });
      const un = await prendre();
      expect(un.status).toBe(200);
      const { reponse } = (await un.json()) as { reponse: { structuredContent: Record<string, unknown> } };
      expect(verifierEnveloppe(reponse.structuredContent, signataire.clePubliqueBase64).ok).toBe(true);
      expect((await prendre()).status).toBe(404);
    } finally {
      await p.arreter();
    }
  });
});

describe("reponsesGardeesDepuisEnv (F4 : jeton partagé lu dans un fichier 0600)", () => {
  const dossier = mkdtempSync(join(tmpdir(), "gardees-"));
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));
  const fichier = (nom: string, contenu: string, mode: number) => {
    const chemin = join(dossier, nom);
    writeFileSync(chemin, contenu);
    chmodSync(chemin, mode);
    return chemin;
  };
  const jeton = "j".repeat(40);

  it("fichier 0600 valide : gardien actif, jeton exigé par la route", async () => {
    const g = reponsesGardeesDepuisEnv({ PASSERELLE_REPONSES_JETON_FICHIER: fichier("ok", `${jeton}\n`, 0o600) }, () => undefined);
    expect(g).not.toBeNull();
    const r = await g!.routeInterne().traiter({ reference: "x" }, { authorization: `Bearer ${jeton}` });
    expect(r.statut).toBe(404);
    expect((await g!.routeInterne().traiter({ reference: "x" }, {})).statut).toBe(401);
  });

  it("variable absente, jeton trop court ou fichier lisible par d'autres : pas de gardien (aucune référence émise), motif journalisé", () => {
    const messages: string[] = [];
    const journal = (m: string) => void messages.push(m);
    expect(reponsesGardeesDepuisEnv({}, journal)).toBeNull();
    expect(reponsesGardeesDepuisEnv({ PASSERELLE_REPONSES_JETON_FICHIER: fichier("court", "abc", 0o600) }, journal)).toBeNull();
    expect(reponsesGardeesDepuisEnv({ PASSERELLE_REPONSES_JETON_FICHIER: fichier("ouvert", jeton, 0o644) }, journal)).toBeNull();
    expect(reponsesGardeesDepuisEnv({ PASSERELLE_REPONSES_JETON_FICHIER: join(dossier, "absent") }, journal)).toBeNull();
    expect(messages).toHaveLength(4);
    expect(messages.join("\n")).not.toContain(jeton);
  });
});
