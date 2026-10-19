/**
 * Non-régression de la revue de sécurité du 19/10/2026 (E1, E2) : déclaration empoisonnée puis lecture de la synthèse.
 * Reprend les deux démonstrations jetables de la revue (fuite inter-clients, promotion en Direction) : elles réussissaient
 * avant la correction, elles échouent maintenant.
 *
 * Le stock en mémoire applique les mêmes règles que le SQL de `creerStockLiaisons` : seules les lignes CONFIRMÉES existent
 * pour les lecteurs, une ligne « à confirmer » d'un autre client est reprise, une ligne confirmée jamais.
 * Le faux hôte de base ne cloisonne rien : seule la liste de `company_id` de la requête filtre (comme `ctx.db.query`).
 */
import { describe, expect, it } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import type { StockLiaisons } from "../src/serveur/liaisons/base-liaisons.js";
import { routeDeclarer } from "../src/serveur/liaisons/declarer.js";
import { routesSynthese } from "../src/serveur/services-synthese.js";

type Ligne = Record<string, unknown>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = id(0xaa); // entreprise de l'attaquant : seule dont l'hôte prouve l'accès
const Y = id(0xbb); // entreprise d'un autre client, jamais déclarée
const D = id(0xd1); // Direction du client réel
const RH = id(0xa2);
const COM = id(0xc3);
const CEO_X = id(0x501);
const CEO_D = id(0x502);
const humain = (u: string): ActeurHote => ({ type: "humain", id: u, agentId: null, userId: u, runId: null });
const agentCeo = (agentId: string): ActeurHote => ({ type: "agent", id: agentId, agentId, userId: null, runId: "r" });

type Ligne3 = { companyId: string; clientMarqueur: string; serviceSlug: string; estDirection: boolean; confirme: boolean };

function stockMemoire() {
  const l = new Map<string, Ligne3>();
  const confirmes = () => [...l.values()].filter((x) => x.confirme);
  const stock: Pick<StockLiaisons, "serviceDeEntreprise" | "clientExiste" | "servicesDuClient" | "servicesParSlug" | "declarer" | "confirmer"> = {
    serviceDeEntreprise: async (c) => confirmes().find((x) => x.companyId === c.toLowerCase()) ?? null,
    clientExiste: async (m) => confirmes().some((x) => x.clientMarqueur === m),
    servicesDuClient: async (m) => confirmes().filter((x) => x.clientMarqueur === m),
    servicesParSlug: async (s) => confirmes().filter((x) => x.serviceSlug === s),
    declarer: async (d) => {
      for (const e of d.entreprises) {
        const cle = e.companyId.toLowerCase();
        const deja = l.get(cle);
        if (deja && deja.clientMarqueur !== d.clientMarqueur && deja.confirme) continue;
        l.set(cle, { ...e, companyId: cle, clientMarqueur: d.clientMarqueur, confirme: e.confirmee || (deja?.clientMarqueur === d.clientMarqueur && deja.confirme) });
      }
    },
    confirmer: async (c) => {
      const x = l.get(c.toLowerCase());
      if (!x || x.confirme) return false;
      x.confirme = true;
      return true;
    },
  };
  return { stock, lignes: l };
}

const db = {
  namespace: "plugin_atelier",
  query: async (sql: string, params: unknown[] = []) => {
    const liste = String(params[0] ?? "").replace(/[{}]/gu, "").split(",");
    const f = (ls: Ligne[]) => ls.filter((x) => liste.includes(String(x["company_id"])));
    if (sql.includes("from public.agents where")) return f([{ company_id: Y, status: "running", n: 7 }]);
    if (sql.includes("row_number()")) return f([{ company_id: Y, identifier: "VIC-42" }, { company_id: COM, identifier: "COM-17" }]);
    if (sql.includes("from public.issues where")) return f([{ company_id: Y, status: "blocked", n: 3 }]);
    if (sql.includes("from public.cost_events")) return f([{ company_id: Y, total: "123456" }, { company_id: COM, total: "777700" }, { company_id: D, total: "5000" }]);
    if (sql.includes("from public.companies c")) return f([{ company_id: Y, derniere: "2026-10-19T08:00:00.000Z" }]);
    if (sql.includes(".prospects")) return f([{ company_id: Y, total: 900, qualifies: 120 }]);
    if (sql.includes(".liaisons")) return f([]);
    throw new Error("requête inconnue");
  },
};

function monde() {
  const { stock, lignes } = stockMemoire();
  const agents = new Map<string, { id: string; companyId: string; role: string }>([
    [CEO_X, { id: CEO_X, companyId: X, role: "ceo" }],
    [CEO_D, { id: CEO_D, companyId: D, role: "ceo" }],
  ]);
  const ctx = { db, agents: { get: async (a: string) => agents.get(a) ?? null } } as never;
  const declarer = routeDeclarer({ base: { journaliser: async () => undefined } as never, stock: stock as never })["services.declarer"]!;
  const confirmer = routeDeclarer({ base: { journaliser: async () => undefined } as never, stock: stock as never })["services.confirmer"]!;
  const synthese = routesSynthese({ ctx, stock: stock as never })["direction.synthese"]!;
  const decl = (acteur: ActeurHote, companyId: string, corps: unknown) => declarer({ cle: "services.declarer", params: {}, query: {}, acteur, companyId, corps });
  const conf = (acteur: ActeurHote, companyId: string) => confirmer({ cle: "services.confirmer", params: {}, query: {}, acteur, companyId, corps: { companyId } });
  const syn = (acteur: ActeurHote, companyId: string) => synthese({ cle: "direction.synthese", params: {}, query: { companyId }, corps: null, acteur, companyId });
  return { stock, lignes, decl, conf, syn };
}
const refus = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ErreurAtelier | null;
const ligneDe = (corps: unknown, slug: string) => (corps as { services: Array<Record<string, unknown>> }).services.find((s) => s["slug"] === slug);

describe("E1 : fuite inter-clients par déclaration empoisonnée", () => {
  const pirate = (o: Ligne = {}) => ({
    companyId: X, clientMarqueur: "pirate", flux: [],
    entreprises: [{ companyId: X, serviceSlug: "direction", estDirection: true }, { companyId: Y, serviceSlug: "marketing", estDirection: false }],
    ...o,
  });

  it("la synthèse du pirate ne contient pas l'entreprise Y tant que Y n'est pas confirmée par un humain qui y a accès", async () => {
    const m = monde();
    expect((await m.decl(humain("attaquant"), X, pirate())).corps).toMatchObject({ entreprises: 2, aConfirmer: 1 });
    const s = await m.syn(agentCeo(CEO_X), X);
    expect(ligneDe(s.corps, "marketing")).toBeUndefined();
    expect(JSON.stringify(s.corps)).not.toContain("123456");
    expect(JSON.stringify(s.corps)).not.toContain("VIC-42");
    expect((s.corps as { services: unknown[] }).services).toHaveLength(1);
  });

  it("seule la confirmation de Y (route portant le companyId de Y, accès prouvé par l'hôte) la rend lisible", async () => {
    const m = monde();
    await m.decl(humain("attaquant"), X, pirate());
    // Pour confirmer Y, il faut une requête portant Y : l'hôte la refuse à l'attaquant ; ici, l'humain de Y la fait.
    await m.conf(humain("proprietaire-de-y"), Y);
    const s = await m.syn(agentCeo(CEO_X), X);
    expect(ligneDe(s.corps, "marketing")).toMatchObject({ coutsMoisCentimes: 123456 });
  });
});

describe("E2 : promotion en Direction depuis un seul service", () => {
  const decl = (dir: string) => [
    { companyId: D, serviceSlug: "direction", estDirection: dir === D },
    { companyId: RH, serviceSlug: "ressources-humaines", estDirection: dir === RH },
    { companyId: COM, serviceSlug: "commercial", estDirection: false },
  ];
  it("un membre du seul service RH ne peut pas redéclarer le client avec RH en Direction, et ne lit rien", async () => {
    const m = monde();
    await m.decl(humain("jb"), D, { companyId: D, clientMarqueur: "client-trois", entreprises: decl(D), flux: [] });
    await m.conf(humain("jb"), RH);
    await m.conf(humain("jb"), COM);
    expect(await refus(m.syn(humain("rh"), RH))).toMatchObject({ code: "elevation_refusee" });
    const e = await refus(m.decl(humain("rh"), RH, { companyId: RH, clientMarqueur: "client-trois", entreprises: decl(RH), flux: [] }));
    expect(e).toMatchObject({ code: "acces_refuse" });
    expect(e!.statut).toBe(403);
    // Rien n'a changé : la Direction reste D, et la synthèse n'est lisible que par le ceo de la Direction.
    expect(m.lignes.get(RH)?.estDirection).toBe(false);
    expect(await refus(m.syn(agentCeo(CEO_X), RH))).toMatchObject({ code: "elevation_refusee" });
    expect(ligneDe((await m.syn(agentCeo(CEO_D), D)).corps, "commercial")).toMatchObject({ coutsMoisCentimes: 777700, bloquees: ["COM-17"] });
  });
});
