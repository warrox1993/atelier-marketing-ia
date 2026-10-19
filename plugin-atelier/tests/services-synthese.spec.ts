/**
 * Synthèse du client pour le Coordinateur général (`direction.synthese`, src/serveur/services-synthese.ts).
 *
 * Le faux hôte ressemble à l'hôte réel sur le point critique : `ctx.db.query` ne cloisonne RIEN par entreprise
 * (paperclip/server/src/services/plugin-database.ts valide seulement la liste des tables). Il garde donc des lignes de
 * deux clients et ne filtre que si la requête SQL le demande elle-même (`any($1::uuid[])`) avec la liste reçue en
 * paramètre : retirer le filtre du code fait remonter les lignes de l'autre client ET échouer le test des gardes SQL.
 */
import { describe, expect, it } from "vitest";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { ESPACE_BASE, ROUTES_API, SERVICES_SENSIBLES, type SyntheseClient } from "../src/contrats/index.js";
import type { ActeurHote, RequeteRoute } from "../src/serveur/atelier.js";
import type { ErreurAtelier } from "../src/serveur/erreurs.js";
import type { ServiceEntreprise } from "../src/serveur/liaisons/base-liaisons.js";
import { DUREE_CACHE_SYNTHESE_MS, routesSynthese } from "../src/serveur/services-synthese.js";

type Ligne = Record<string, unknown>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DIR = id(1);
const MKT = id(2);
const JUR = id(3);
const AUTRE_DIR = id(4);
const AUTRE_MKT = id(5);
const CEO = id(11);
const AGENT_SIMPLE = id(12);
const HUMAIN: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const agentCeo: ActeurHote = { type: "agent", id: CEO, agentId: CEO, userId: null, runId: "r1" };
const agentSimple: ActeurHote = { type: "agent", id: AGENT_SIMPLE, agentId: AGENT_SIMPLE, userId: null, runId: "r2" };

const SERVICES: ServiceEntreprise[] = [
  { companyId: DIR, clientMarqueur: "fictive-sa", serviceSlug: "direction", estDirection: true },
  { companyId: MKT, clientMarqueur: "fictive-sa", serviceSlug: "marketing", estDirection: false },
  { companyId: JUR, clientMarqueur: "fictive-sa", serviceSlug: "juridique", estDirection: false },
  { companyId: AUTRE_DIR, clientMarqueur: "autre-sprl", serviceSlug: "direction", estDirection: true },
  { companyId: AUTRE_MKT, clientMarqueur: "autre-sprl", serviceSlug: "marketing", estDirection: false },
];

const t = (j: number) => new Date(Date.UTC(2026, 9, j, 10));

function monde(o: { servicesDuClientRetourne?: ServiceEntreprise[] } = {}) {
  const requetes: Array<{ sql: string; params: unknown[] }> = [];
  let maintenant = Date.UTC(2026, 9, 19, 12);
  const agents: Ligne[] = [
    { company_id: MKT, status: "idle" }, { company_id: MKT, status: "idle" }, { company_id: MKT, status: "running" },
    { company_id: MKT, status: "error" }, { company_id: MKT, status: "terminated" }, { company_id: JUR, status: "paused" },
    { company_id: AUTRE_MKT, status: "running" },
  ];
  const issues: Ligne[] = [
    { company_id: MKT, status: "todo", identifier: "COM-1", titre: "Secret commercial" },
    { company_id: MKT, status: "blocked", identifier: "COM-2", titre: "Titre confidentiel A" },
    { company_id: MKT, status: "blocked", identifier: "COM-3", titre: "Titre confidentiel B" },
    { company_id: MKT, status: "in_review", identifier: "COM-4", titre: "x" },
    { company_id: JUR, status: "blocked", identifier: "JUR-9", titre: "Litige client" },
    { company_id: AUTRE_MKT, status: "blocked", identifier: "ETR-1", titre: "Autre client" },
    { company_id: AUTRE_MKT, status: "todo", identifier: "ETR-2", titre: "Autre client" },
  ];
  for (let i = 0; i < 8; i++) issues.push({ company_id: DIR, status: "blocked", identifier: `DIR-${i}`, titre: "t" });
  const filtre = (lignes: Ligne[], sql: string, params: unknown[], col = "company_id") => {
    if (!/any\(\$1::uuid\[\]\)/u.test(sql)) return lignes; // requête sans filtre : l'hôte ne cloisonne rien
    const liste = String(params[0]).replace(/[{}]/gu, "").split(",");
    return lignes.filter((l) => liste.includes(String(l[col])));
  };
  const regrouper = (lignes: Ligne[]) => {
    const m = new Map<string, Ligne>();
    for (const l of lignes) {
      const k = `${l["company_id"]}|${l["status"]}`;
      const e = m.get(k) ?? { company_id: l["company_id"], status: l["status"], n: 0 };
      e["n"] = (e["n"] as number) + 1;
      m.set(k, e);
    }
    return [...m.values()];
  };
  const db = {
    namespace: ESPACE_BASE,
    query: async (sql: string, params: unknown[] = []) => {
      requetes.push({ sql, params });
      if (!/^\s*(select|with)\s/iu.test(sql)) throw new Error("ctx.db.query only allows SELECT statements");
      if (params.some((p) => Array.isArray(p))) throw new Error("l'hôte aplatit les paramètres tableau");
      if (sql.includes("from public.agents where")) return regrouper(filtre(agents, sql, params).filter((a) => a["status"] !== "terminated"));
      if (sql.includes("row_number()")) {
        const bloquees = filtre(issues, sql, params).filter((i) => i["status"] === "blocked");
        const vu = new Map<string, number>();
        return bloquees.filter((i) => { const n = (vu.get(String(i["company_id"])) ?? 0) + 1; vu.set(String(i["company_id"]), n); return n <= 5; }).map((i) => ({ company_id: i["company_id"], identifier: i["identifier"] }));
      }
      if (sql.includes("from public.issues where")) return regrouper(filtre(issues, sql, params).filter((i) => ["todo", "in_progress", "blocked", "in_review"].includes(String(i["status"]))));
      if (sql.includes("from public.cost_events")) return filtre([{ company_id: MKT, total: "1250" }, { company_id: AUTRE_MKT, total: "99999" }], sql, params);
      if (sql.includes("from public.companies c")) return filtre([{ company_id: MKT, derniere: t(18) }, { company_id: JUR, derniere: "2026-10-17 08:00:00+00" }, { company_id: AUTRE_MKT, derniere: t(19) }].map((l) => ({ ...l })), sql.replace("c.id", "company_id"), params);
      if (sql.includes(".prospects")) return filtre([{ company_id: MKT, total: 40, qualifies: 7 }, { company_id: AUTRE_MKT, total: 500, qualifies: 400 }], sql, params);
      if (sql.includes(".liaisons")) return filtre([{ company_id: MKT, n: 2 }, { company_id: AUTRE_MKT, n: 9 }], sql, params);
      throw new Error(`requête inconnue : ${sql.slice(0, 60)}`);
    },
  };
  const appelsAgents: string[] = [];
  const ctx = {
    db,
    agents: {
      get: async (agentId: string, companyId: string) => {
        appelsAgents.push(`${agentId}@${companyId}`);
        if (agentId === CEO) return { id: CEO, companyId, role: "ceo" };
        if (agentId === AGENT_SIMPLE) return { id: AGENT_SIMPLE, companyId, role: "general" };
        return null;
      },
    },
  } as unknown as Pick<PluginContext, "agents" | "db">;
  const stock = {
    serviceDeEntreprise: async (c: string) => SERVICES.find((s) => s.companyId === c) ?? null,
    servicesDuClient: async (m: string) => o.servicesDuClientRetourne ?? SERVICES.filter((s) => s.clientMarqueur === m),
  };
  const route = routesSynthese({ ctx, stock, maintenant: () => maintenant })["direction.synthese"]!;
  const appeler = (companyId: string, acteur: ActeurHote) => route({ cle: "direction.synthese", params: {}, query: { companyId }, corps: null, acteur, companyId } satisfies RequeteRoute);
  return { appeler, requetes, appelsAgents, avancer: (ms: number) => { maintenant += ms; } };
}

const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: ErreurAtelier) => e)) as ErreurAtelier | null);

describe("direction.synthese : contrat", () => {
  it("la route existe, en lecture, ouverte à un agent seulement (F4 : le seul consommateur est le Coordinateur)", () => {
    const r = ROUTES_API.find((x) => x.cle === "direction.synthese");
    expect(r).toMatchObject({ methode: "GET", chemin: "/direction/synthese", auth: "agent" });
  });
});

describe("direction.synthese : gardes", () => {
  it("403 hors Direction (un service ordinaire), même pour un humain", async () => {
    const m = monde();
    const e = await code(m.appeler(MKT, HUMAIN));
    expect(e?.statut).toBe(403);
    expect(m.requetes).toHaveLength(0);
  });

  it("403 pour une entreprise déclarée nulle part", async () => {
    expect((await code(monde().appeler(id(99), HUMAIN)))?.statut).toBe(403);
  });

  it("403 pour un agent qui n'est pas de rôle ceo, sans aucune requête SQL", async () => {
    const m = monde();
    expect((await code(m.appeler(DIR, agentSimple)))?.statut).toBe(403);
    expect(m.requetes).toHaveLength(0);
  });

  it("403 pour un agent inconnu de l'entreprise", async () => {
    const m = monde();
    expect((await code(m.appeler(DIR, { type: "agent", id: id(77), agentId: id(77), userId: null, runId: null })))?.statut).toBe(403);
  });

  it("le ceo de la Direction y accède ; un humain, même dans la Direction, est refusé sans aucune requête SQL (F4)", async () => {
    const m = monde();
    expect((await m.appeler(DIR, agentCeo)).statut).toBe(200);
    const nbRequetes = m.requetes.length;
    expect((await code(m.appeler(DIR, HUMAIN)))?.statut).toBe(403);
    expect(m.requetes).toHaveLength(nbRequetes);
    expect(m.appelsAgents).toEqual([`${CEO}@${DIR}`]);
  });
});

describe("direction.synthese : cloisonnement par client (garde 3)", () => {
  it("l'entreprise d'un autre client, présente en base, est absente du résultat", async () => {
    const m = monde();
    const corps = (await m.appeler(DIR, agentCeo)).corps as SyntheseClient;
    expect(corps.client).toBe("fictive-sa");
    expect(corps.services.map((s) => s.slug).sort()).toEqual(["direction", "juridique", "marketing"]);
    const marketing = corps.services.find((s) => s.slug === "marketing")!;
    // Les chiffres de l'autre client (marketing d'« autre-sprl ») ne se mélangent pas aux siens.
    expect(marketing.coutsMoisCentimes).toBe(1250);
    expect(marketing.prospects).toEqual({ total: 40, qualifies: 7 });
    expect(marketing.liaisonsOuvertes).toBe(2);
    expect(marketing.agents).toEqual({ idle: 2, running: 1, paused: 0, error: 1 });
    expect(marketing.taches).toEqual({ todo: 1, in_progress: 0, blocked: 2, in_review: 1 });
    expect(JSON.stringify(corps)).not.toContain("ETR-");
  });

  it("toutes les requêtes SQL filtrent sur la liste du client, passée en paramètre, jamais sur autre chose", async () => {
    const m = monde();
    await m.appeler(DIR, agentCeo);
    expect(m.requetes).toHaveLength(7);
    const liste = `{${[DIR, MKT, JUR].join(",")}}`;
    for (const r of m.requetes) {
      expect(r.sql).toMatch(/(company_id|c\.id) = any\(\$1::uuid\[\]\)/u);
      expect(r.params[0]).toBe(liste);
      expect(r.sql).not.toContain(AUTRE_DIR);
    }
  });

  it("les paramètres SQL restent la liste du client même si la requête transporte un companyId étranger", async () => {
    const m = monde();
    const requete: RequeteRoute = { cle: "direction.synthese", params: { companyId: AUTRE_MKT }, query: { companyId: AUTRE_MKT, entreprises: AUTRE_DIR }, corps: { companyId: AUTRE_MKT, ids: [AUTRE_MKT] }, acteur: agentCeo, companyId: DIR };
    const routes = routesSynthese({
      ctx: { db: { namespace: ESPACE_BASE, query: async (sql: string, params: unknown[] = []) => { m.requetes.push({ sql, params }); return []; } }, agents: { get: async (a: string, c: string) => ({ id: a, companyId: c, role: "ceo" }) } } as unknown as Pick<PluginContext, "agents" | "db">,
      stock: { serviceDeEntreprise: async (c) => SERVICES.find((s) => s.companyId === c) ?? null, servicesDuClient: async (k) => SERVICES.filter((s) => s.clientMarqueur === k) },
    });
    await routes["direction.synthese"]!(requete);
    expect(m.requetes.length).toBeGreaterThan(0);
    for (const r of m.requetes) {
      expect(r.params[0]).toBe(`{${[DIR, MKT, JUR].join(",")}}`);
      expect(JSON.stringify(r.params)).not.toContain(AUTRE_MKT);
      expect(JSON.stringify(r.params)).not.toContain(AUTRE_DIR);
    }
  });

  it("une déclaration qui mélangerait deux clients est filtrée par marqueur avant toute requête", async () => {
    const m = monde({ servicesDuClientRetourne: SERVICES });
    const corps = (await m.appeler(DIR, agentCeo)).corps as SyntheseClient;
    expect(corps.services).toHaveLength(3);
    expect(m.requetes[0]!.params[0]).toBe(`{${[DIR, MKT, JUR].join(",")}}`);
  });
});

describe("direction.synthese : contenu", () => {
  it("au plus 5 identifiants de tâches bloquées, jamais un titre", async () => {
    const m = monde();
    const corps = (await m.appeler(DIR, agentCeo)).corps as SyntheseClient;
    const direction = corps.services.find((s) => s.slug === "direction")!;
    expect(direction.taches.blocked).toBe(8);
    expect(direction.bloquees).toHaveLength(5);
    expect(direction.bloquees.every((x) => /^DIR-\d$/u.test(x))).toBe(true);
    const texte = JSON.stringify(corps);
    for (const titre of ["Secret commercial", "Titre confidentiel", "Litige client", "Autre client"]) expect(texte).not.toContain(titre);
    expect(corps.services.find((s) => s.slug === "marketing")!.bloquees).toEqual(["COM-2", "COM-3"]);
    // Aucune requête ne lit de titre.
    for (const r of m.requetes) expect(r.sql).not.toMatch(/\btitle\b/u);
  });

  it("aucun identifiant pour un service sensible, mais les nombres restent", async () => {
    expect(SERVICES_SENSIBLES.has("juridique")).toBe(true);
    const m = monde();
    const corps = (await m.appeler(DIR, agentCeo)).corps as SyntheseClient;
    const juridique = corps.services.find((s) => s.slug === "juridique")!;
    expect(juridique.bloquees).toEqual([]);
    expect(juridique.taches.blocked).toBe(1);
    expect(JSON.stringify(corps)).not.toContain("JUR-9");
    expect(juridique.derniereActivite).toBe("2026-10-17T08:00:00.000Z");
  });

  it("la Direction vient d'abord, la dernière activité est en ISO ou nulle", async () => {
    const corps = (await monde().appeler(DIR, agentCeo)).corps as SyntheseClient;
    expect(corps.services[0]!.slug).toBe("direction");
    expect(corps.services.find((s) => s.slug === "marketing")!.derniereActivite).toBe(t(18).toISOString());
    expect(corps.services.find((s) => s.slug === "direction")!.derniereActivite).toBeNull();
  });
});

describe("direction.synthese : cache de 30 s par client", () => {
  it("réutilise la synthèse pendant 30 s puis la recalcule ; les gardes s'appliquent même en cache", async () => {
    const m = monde();
    await m.appeler(DIR, agentCeo);
    expect(m.requetes).toHaveLength(7);
    await m.appeler(DIR, agentCeo);
    m.avancer(DUREE_CACHE_SYNTHESE_MS - 1);
    expect((await code(m.appeler(DIR, HUMAIN)))?.statut).toBe(403);
    expect(m.requetes).toHaveLength(7);
    expect((await code(m.appeler(DIR, agentSimple)))?.statut).toBe(403);
    expect((await code(m.appeler(MKT, HUMAIN)))?.statut).toBe(403);
    m.avancer(1);
    await m.appeler(DIR, agentCeo);
    expect(m.requetes).toHaveLength(14);
  });

  it("le cache est par client : la Direction d'un autre client ne reçoit pas la synthèse mise en cache", async () => {
    const m = monde();
    await m.appeler(DIR, agentCeo);
    const autre = (await m.appeler(AUTRE_DIR, agentCeo)).corps as SyntheseClient;
    expect(autre.client).toBe("autre-sprl");
    expect(autre.services.map((s) => s.slug).sort()).toEqual(["direction", "marketing"]);
    expect(m.requetes).toHaveLength(14);
  });
});
