import { describe, expect, it } from "vitest";
import { creerAiguillage } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";
import { iso } from "../src/serveur/base.js";
import { avecCode } from "../src/serveur/atelier.js";
import { erreur } from "../src/serveur/erreurs.js";
import { libelleEvenement } from "../src/contrats/index.js";

describe("sérialisation et erreurs du pont (besoins du lot C)", () => {
  it("B-8 : la forme texte de PostgreSQL devient de l'ISO 8601 UTC", () => {
    expect(iso("2026-10-15 14:23:59.691232+02")).toBe("2026-10-15T12:23:59.691Z");
    expect(iso("2026-10-15T12:00:00Z")).toBe("2026-10-15T12:00:00.000Z");
    expect(iso(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10-15T12:00:00.000Z");
  });
  it("B-1 : le code stable précède le message transmis par le pont", async () => {
    await expect(avecCode(async () => erreur("revision_perimee", "Révision dépassée."))).rejects.toThrow("[revision_perimee] Révision dépassée.");
    await expect(avecCode(async () => { throw new Error("autre"); })).rejects.toThrow(/^autre$/u);
  });
  it("B-6 : libellé français d'un événement, type brut s'il est inconnu", () => {
    expect(libelleEvenement("porte.refusee")).toBe("Contrôle automatique refusé");
    expect(libelleEvenement("type.inconnu")).toBe("type.inconnu");
  });
});

describe("diagnostic : sources réelles lues sur la passerelle", () => {
  async function sante(o: { config?: Record<string, unknown>; http?: (url: string) => Promise<Response>; agents?: boolean }) {
    const b = creerBanc({ config: o.config ?? {} });
    const ctx = b.ctx as unknown as { http?: unknown; agents: { list: () => Promise<unknown[]> } };
    if (o.agents) ctx.agents.list = async () => [{ id: "a", companyId: SOC, name: "a", adapterType: "claude_local", adapterConfig: {} }];
    const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base: b.base, ...(o.http ? { fetchBoucleLocale: o.http } : {}) }));
    const r = (await aiguillage.traiterRequeteApi({
      routeKey: "sante", method: "GET", path: "/sante", params: {}, query: {}, body: undefined,
      actor: { actorType: "user", actorId: "local-board", userId: "local-board", runId: null }, companyId: SOC, headers: {},
    } as never)) as { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    return r.body;
  }
  const reponse = (corps: unknown, statut = 200) => async () => new Response(JSON.stringify(corps), { status: statut });

  it("passerelle mélangée : seules les sources de `services_reels` sont réelles, les autres disent pourquoi", async () => {
    const d = await sante({ config: { passerelleUrl: "http://127.0.0.1:3190" }, http: reponse({ ok: true, mode: "demonstration", services: ["osm", "liens", "bce"], services_reels: ["osm", "liens"] }) });
    expect(d.sourcesReelles.passerelle).toBe("joignable");
    const par = Object.fromEntries(d.sourcesReelles.sources.map((s: any) => [s.cle, s])); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(par.osm.reelle).toBe(true);
    expect(par.liens.reelle).toBe(true);
    expect(par.bce).toMatchObject({ reelle: false, detail: "Index BCE réel non branché : inscription au portail de la BCE à terminer." });
    expect(par.bnb).toMatchObject({ reelle: false, detail: "Clé de la Banque nationale en attente d'approbation." });
    expect(par.bce.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("extraction et audit : réels quand la passerelle les sert en réel, sinon ils disent pourquoi", async () => {
    const reel = await sante({ config: { passerelleUrl: "http://127.0.0.1:3190" }, http: reponse({ ok: true, mode: "demonstration", services: ["extraction", "audit"], services_reels: ["extraction", "audit"] }) });
    const parReel = Object.fromEntries(reel.sourcesReelles.sources.map((s: any) => [s.cle, s])); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(parReel.extraction).toMatchObject({ nom: "Lecture de sites", reelle: true, detail: "Lecture de sites réelle servie par la passerelle." });
    expect(parReel.audit).toMatchObject({ nom: "Audit de pages", reelle: true, detail: "Audit de pages réel servi par la passerelle." });
    const demo = await sante({ config: { passerelleUrl: "http://127.0.0.1:3190" }, http: reponse({ ok: true, mode: "demonstration", services: ["osm"], services_reels: ["osm"] }) });
    const parDemo = Object.fromEntries(demo.sourcesReelles.sources.map((s: any) => [s.cle, s])); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(parDemo.extraction).toMatchObject({ reelle: false, detail: "Lecture de sites non réelle : non branchée sur la passerelle." });
    expect(parDemo.audit).toMatchObject({ reelle: false, detail: "Audit de pages non réel : non branché sur la passerelle." });
  });

  it("BCE branchée : elle devient réelle", async () => {
    const d = await sante({ config: { passerelleUrl: "http://127.0.0.1:3190" }, http: reponse({ ok: true, mode: "demonstration", services: [], services_reels: ["bce", "bnb", "osm", "liens", "extraction", "audit"] }) });
    expect(d.sourcesReelles.sources.map((s: any) => s.cle)).toEqual(["bce", "bnb", "osm", "liens", "extraction", "audit"]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(d.sourcesReelles.sources.every((s: any) => s.reelle)).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("passerelle injoignable ou réponse en erreur : aucune source réelle, état « injoignable », sans planter", async () => {
    const hs = await sante({ config: { passerelleUrl: "http://127.0.0.1:3190" }, http: async () => { throw new Error("ECONNREFUSED"); } });
    expect(hs.sourcesReelles.passerelle).toBe("injoignable");
    expect(hs.sourcesReelles.sources.some((s: any) => s.reelle)).toBe(false); // eslint-disable-line @typescript-eslint/no-explicit-any
    const erreur500 = await sante({ config: { passerelleUrl: "http://127.0.0.1:3190" }, http: reponse({}, 500) });
    expect(erreur500.sourcesReelles.passerelle).toBe("injoignable");
  });

  it("adresse hors de la boucle locale : refusée sans aucun appel réseau", async () => {
    let appels = 0;
    const d = await sante({ config: { passerelleUrl: "http://10.0.0.5:3190" }, http: async () => { appels += 1; return new Response("{}"); } });
    expect(d.sourcesReelles.passerelle).toBe("non_configuree");
    expect(appels).toBe(0);
  });
  it("aucune adresse (ou adresse invalide) : « non_configuree », et les textes périmés ont disparu", async () => {
    const d = await sante({ config: { passerelleUrl: "pas une adresse" }, agents: true });
    expect(d.sourcesReelles.passerelle).toBe("non_configuree");
    const texte = JSON.stringify(d.connecteurs);
    expect(texte).not.toContain("aucun run réel exécuté");
    expect(texte).not.toContain("Recherche Web non connectée");
    expect(d.connecteurs.find((c: any) => c.cle === "claude_local").detail).toContain("Agents configurés en mode réel (abonnement)"); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  it("lecture d'URL : transport toujours réel, jamais l'état « demonstration »", async () => {
    const d = await sante({ config: { passerelleUrl: "pas une adresse" } });
    const ligne = d.connecteurs.find((c: any) => c.cle === "lecture_url"); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(ligne.etat).toBe("configure_non_verifie");
    expect(ligne.etat).not.toBe("demonstration");
  });
});
