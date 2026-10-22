/**
 * Captation de prospects : l'envoi d'un formulaire de page de destination traverse le VRAI serveur de pages et le VRAI
 * dépôt de la passerelle (`passerelle/src/pages`), puis la VRAIE route `prospects.particuliers.enregistrer` du plugin
 * (aiguillage et services réels, base en mémoire, entreprise en mode réel). On vérifie ce qui est stocké : origine
 * « formulaire_entrant », preuve du consentement (date, texte exact, source = la page, IP tronquée, numéro donné par la
 * personne), coordonnées chiffrées, et la tâche « rappeler sous 24 h » demandée à l'API native de Paperclip (faux hôte).
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prospect } from "../src/contrats/index.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { dechiffrer } from "../src/serveur/chiffrement-donnees.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";
import { avecClesDonnees, CLES_TEST, REFS_CLES } from "./outils-cles-donnees.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* Code RÉEL de la passerelle chargé à l'exécution (chemin calculé : le projet TypeScript du plugin ne compile pas la passerelle, comme outils-passerelle.ts). */
const PASSERELLE = resolve(dirname(fileURLToPath(import.meta.url)), "../../passerelle/src/pages");
const { DepotAtelier } = (await import(/* @vite-ignore */ resolve(PASSERELLE, "depot-atelier.ts"))) as { DepotAtelier: new (r: Ligne, f: typeof fetch) => unknown };
const { MagasinPages } = (await import(/* @vite-ignore */ resolve(PASSERELLE, "magasin.ts"))) as {
  MagasinPages: new (chemin: string) => { creerPage(c: Ligne): { slug: string }; compterEnvois(slug: string): number; fermer(): void };
};
const { creerServeurPages } = (await import(/* @vite-ignore */ resolve(PASSERELLE, "serveur.ts"))) as {
  creerServeurPages(o: Ligne): { ecouter(): Promise<{ port: number }>; arreter(): Promise<void> };
};
type ServeurPages = ReturnType<typeof creerServeurPages>;
const HUMAIN = "local-board";
const PROSPECTION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Base en mémoire : les méthodes de prospection que la route utilise (mêmes règles que `base.ts`). */
function monterAtelier() {
  const b = creerBanc({ modeEntreprise: "reel", config: REFS_CLES });
  avecClesDonnees(b.ctx as PluginContext);
  const prospects: Ligne[] = [];
  const empreintes: Ligne[] = [];
  const scores: Ligne[] = [];
  const copie = <T>(v: T): T => structuredClone(v);
  const ext: Record<string, unknown> = {
    prospectsParIdentifiants: async (c: string, ids: Array<{ type: string; valeur: string }>) =>
      copie(prospects.filter((p) => p.companyId === c && ids.some((i) => i.type === p.identifiant.type && i.valeur === p.identifiant.valeur))),
    lireProspect: async (c: string, id: string) => copie(prospects.find((p) => p.companyId === c && p.id === id) ?? null),
    empreintesProspectsEnBase: async (c: string, v: string[]) => empreintes.filter((e) => e.companyId === c && v.includes(e.valeur)).map((e) => ({ prospectId: e.prospectId, type: e.type, valeur: e.valeur })),
    oppositionsPour: async () => [],
    clientsActuelsPour: async () => [],
    marques: async () => [],
    etatBaseClients: async () => ({ dernierImport: null, clients: 0, actifs: 0 }),
    dncmPour: async () => null,
    clientExiste: async () => false,
    clientParEmpreinte: async () => null,
    poidsScoreCourant: async () => null,
    referentielProspection: async () => ({ renvoi: null, versionMarque: null }),
    insererProspect: async (p: Ligne) => {
      const { empreintes: _e, score: _s, basesLegales: _b, ...ligne } = copie(p);
      prospects.push({ ...ligne, cleAReimporter: false, creeLe: p.creeLe ?? b.horloge(), modifieLe: p.modifieLe ?? b.horloge() });
    },
    majProspect: async () => 1,
    ajouterEmpreintesProspect: async (c: string, id: string, e: Array<{ type: string; valeur: string }>) => {
      for (const x of e) empreintes.push({ companyId: c, prospectId: id, ...x });
    },
    prospectsAvecEmpreinte: async (c: string, type: string, v: string) => [...new Set(empreintes.filter((e) => e.companyId === c && e.type === type && e.valeur === v).map((e) => e.prospectId))],
    insererScoreProspect: async (s: Ligne) => void scores.push(copie(s)),
    detailsProspects: async (c: string, ids: string[]) => ({
      empreintes: new Map(ids.map((id) => [id, empreintes.filter((e) => e.companyId === c && e.prospectId === id).map((e) => ({ type: e.type, valeur: e.valeur }))])),
      scores: new Map(),
      bases: new Map(),
    }),
  };
  const base = new Proxy(b.base as unknown as Ligne, { get: (cible, cle) => (cle in ext ? ext[cle as string] : cible[cle as string]) }) as unknown as BaseAtelier;
  const aiguillage = creerAiguillage(b.ctx, creerServices(b.ctx, { base }));
  return { prospects, empreintes, aiguillage };
}

describe("formulaire de page de destination -> prospect de l'atelier", () => {
  const atelier = monterAtelier();
  const tachesCreees: Array<{ url: string; corps: Ligne }> = [];
  const appelsRoute: Array<{ statut: number; corps: unknown }> = [];
  let magasin: InstanceType<typeof MagasinPages>;
  let serveur: ServeurPages;
  let base: string;
  let slug: string;
  const horloge = { t: Date.parse("2026-10-22T10:00:00Z") };

  // Faux hôte Paperclip : la route du plugin est la vraie ; agents et tâches sont de simples réponses.
  const hote = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    const corps = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (u.endsWith("/plugins/atelier.marketing-ia/api/prospects/particuliers")) {
      const r = (await atelier.aiguillage.traiterRequeteApi({
        routeKey: "prospects.particuliers.enregistrer", method: "POST", path: "/prospects/particuliers", params: {}, query: {}, body: corps,
        actor: { actorType: "user", actorId: HUMAIN, userId: HUMAIN, runId: null }, companyId: corps.companyId, headers: {},
      } as never)) as { status: number; body: unknown };
      appelsRoute.push({ statut: r.status, corps: r.body });
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    if (u.endsWith(`/companies/${SOC}/agents`)) return new Response(JSON.stringify([{ id: PROSPECTION, name: "Prospection", status: "idle" }]), { status: 200 });
    if (u.endsWith(`/companies/${SOC}/issues`)) {
      tachesCreees.push({ url: u, corps });
      return new Response(JSON.stringify({ id: "tache-1" }), { status: 201 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  beforeAll(async () => {
    magasin = new MagasinPages(":memory:");
    slug = magasin.creerPage({
      entreprise_id: SOC, titre: "Isolation de toiture", accroche: "Réduisez votre facture de chauffage cet hiver.", offre_type: "rappel_conseiller",
      offre_intitule: "Diagnostic gratuit de toiture", offre_description: "Un conseiller étudie votre toiture et vous rappelle.", responsable: "Toitures Exemple SRL",
      contact_confidentialite: "vie-privee@exemple.test",
    }).slug;
    const depot = new DepotAtelier({ api: "http://127.0.0.1:3100/api", plugin: "atelier.marketing-ia", cleBoard: null, urlPages: "http://127.0.0.1:3195" }, hote);
    serveur = creerServeurPages({ hote: "127.0.0.1", port: 0, magasin, secret: Buffer.from("secret-de-test-0123456789abcdef0123456789"), umami: null, depot, maintenant: () => horloge.t });
    base = `http://127.0.0.1:${(await serveur.ecouter()).port}`;
  });
  afterAll(async () => { await serveur.arreter(); magasin.fermer(); });

  it("charge la page, soumet le formulaire, crée le prospect avec sa preuve de consentement et la tâche de rappel", async () => {
    const page = await fetch(`${base}/p/${slug}`);
    const html = await page.text();
    const jeton = /name="jeton" value="([^"]+)"/u.exec(html)![1]!;
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0]!;
    horloge.t += 3000;
    const r = await fetch(`${base}/p/${slug}`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: base },
      body: new URLSearchParams({ nom: "Camille Dupont", telephone: "0470 12 34 56", courriel: "", creneau: "soir", consentement: "oui", site_web: "", jeton }).toString(),
    });
    expect(r.status).toBe(303);
    expect(appelsRoute.map((a) => a.statut)).toEqual([201]);

    // Prospect stocké
    expect(atelier.prospects).toHaveLength(1);
    const p = Prospect.parse(appelsRoute[0]!.corps);
    expect(p).toMatchObject({ cible: "particulier", forme: "personne_physique", mode: "reel", statut: "nouveau" });
    expect(p.particulier?.origine).toBe("formulaire_entrant");
    const preuve = p.particulier!.consentements[0]!;
    expect(preuve.texteAccepte).toContain("J'accepte que Toitures Exemple SRL utilise mon nom, mon numéro de téléphone");
    expect(preuve.source).toBe(`http://127.0.0.1:3195/p/${slug}`);
    expect(preuve.date).toBe(new Date(horloge.t).toISOString());
    expect(preuve.canauxAutorises).toEqual(["telephone"]);
    expect(preuve.reference).toMatch(/IP 127\.0\.0\.0 · numéro de téléphone donné par la personne/u);
    expect(preuve.retireLe).toBeNull();

    // Coordonnées chiffrées : rien en clair dans la base, déchiffrables avec la clé de l'entreprise.
    expect(JSON.stringify(atelier.prospects)).not.toMatch(/Camille|Dupont|470 ?12|\+32470123456/u);
    expect(dechiffrer(p.nomChiffre!, CLES_TEST.chiffrement)).toBe("Camille Dupont");

    // Tâche pour la Prospection, sans coordonnées
    expect(tachesCreees).toHaveLength(1);
    const t = tachesCreees[0]!.corps;
    expect(t["assigneeAgentId"]).toBe(PROSPECTION);
    expect(String(t["title"])).toContain("Rappeler sous 24 h");
    expect(String(t["description"])).toContain("Soir (17 h à 20 h)");
    expect(JSON.stringify(t)).not.toMatch(/Camille|470/u);
    expect(magasin.compterEnvois(slug)).toBe(1);
  });

  it("sans case de consentement cochée, aucun prospect ni tâche supplémentaire n'est créé", async () => {
    const page = await fetch(`${base}/p/${slug}`);
    const html = await page.text();
    const jeton = /name="jeton" value="([^"]+)"/u.exec(html)![1]!;
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0]!;
    horloge.t += 3000;
    const r = await fetch(`${base}/p/${slug}`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: base },
      body: new URLSearchParams({ nom: "Autre Personne", telephone: "0471 00 00 00", courriel: "", creneau: "matin", site_web: "", jeton }).toString(),
    });
    expect(r.status).toBe(422);
    expect(atelier.prospects).toHaveLength(1);
    expect(tachesCreees).toHaveLength(1);
  });
});
