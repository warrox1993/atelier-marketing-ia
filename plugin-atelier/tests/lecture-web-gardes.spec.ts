/**
 * N2 : la lecture du web par le serveur (sources, liens, collecte et proposition de l'Observatoire) est réservée
 * à l'agent assigné à la tâche EN COURS et aux rôles dont la consigne documente la route ; les URL à longue
 * chaîne de requête sont refusées (canal d'exfiltration).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LireUrlEntree, REQUETE_MAX_CARACTERES, VerifierLiensEntree } from "../src/contrats/sources.js";
import manifest from "../src/manifest.js";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { normaliserNom } from "../src/serveur/couverture-prospection.js";
import { ROLES_LECTURE_WEB } from "../src/serveur/lecture-web.js";
import { ProposerSources } from "../src/serveur/observatoire/routes-observatoire.js";
import { creerServices } from "../src/serveur/services.js";
import { ISSUE, PRODUCTEUR, RELECTEUR, SOC, creerBanc } from "./outils-base.js";

const RACINE = resolve(import.meta.dirname, "../..");
const agent = (id: string): ActeurHote => ({ type: "agent", id, agentId: id, userId: null, runId: "run-1" });
const HUMAIN: ActeurHote = { type: "humain", id: "jb", agentId: null, userId: "jb", runId: null };
const URL_SOURCE = "https://renovation-liege.example/";

function monter(o: { status?: string; nom?: string } = {}) {
  const banc = creerBanc();
  banc.tacheSousPorte({ status: o.status ?? "in_progress", etape: null });
  banc.noms.set(PRODUCTEUR, o.nom ?? "Prospection");
  banc.noms.set(RELECTEUR, "Relecteur");
  const services = creerServices(banc.ctx, { base: banc.base });
  const appeler = (cle: "tache.sources.lire" | "tache.liens.verifier", acteur: ActeurHote, corps: unknown) =>
    services.routes[cle]!({ cle, params: { issueId: ISSUE }, query: {}, companyId: SOC, acteur, corps });
  const code = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? "sans_code");
  return { banc, appeler, code };
}

describe("N2 : lecture web réservée à l'agent assigné à la tâche en cours et aux rôles documentés", () => {
  it("l'agent assigné, tâche en cours, rôle Prospection : la source est lue et enregistrée", async () => {
    const m = monter();
    const r = await m.appeler("tache.sources.lire", agent(PRODUCTEUR), { url: URL_SOURCE });
    expect([201, 422]).toContain(r.statut);
    expect(m.banc.t.sources).toHaveLength(1);
  });

  it("un agent d'un rôle autorisé mais NON assigné à la tâche est refusé, rien n'est lu", async () => {
    const m = monter();
    expect(await m.code(m.appeler("tache.sources.lire", agent(RELECTEUR), { url: URL_SOURCE }))).toBe("elevation_refusee");
    expect(await m.code(m.appeler("tache.liens.verifier", agent(RELECTEUR), { urls: [URL_SOURCE] }))).toBe("elevation_refusee");
    expect(m.banc.t.sources).toHaveLength(0);
    expect(m.banc.t.journal.filter((j) => j.type === "liens.verifies")).toHaveLength(0);
  });

  it("l'agent assigné est refusé si la tâche n'est pas en cours", async () => {
    const m = monter({ status: "in_review" });
    expect(await m.code(m.appeler("tache.sources.lire", agent(PRODUCTEUR), { url: URL_SOURCE }))).toBe("elevation_refusee");
    expect(m.banc.t.sources).toHaveLength(0);
  });

  it("un rôle dont la consigne ne documente pas la route est refusé, même assigné", async () => {
    const m = monter({ nom: "Mesure" });
    expect(await m.code(m.appeler("tache.sources.lire", agent(PRODUCTEUR), { url: URL_SOURCE }))).toBe("elevation_refusee");
    // Prospection lit des sources mais ne vérifie pas de liens (rôle Tests techniques seul).
    const p = monter();
    expect(await p.code(p.appeler("tache.liens.verifier", agent(PRODUCTEUR), { urls: [URL_SOURCE] }))).toBe("elevation_refusee");
    const t = monter({ nom: "Tests techniques" });
    const r = await t.appeler("tache.liens.verifier", agent(PRODUCTEUR), { urls: [URL_SOURCE] });
    expect(r.corps).toHaveLength(1);
  });

  it("un humain (board) lit librement", async () => {
    const m = monter({ status: "in_review" });
    const r = await m.appeler("tache.sources.lire", HUMAIN, { url: URL_SOURCE });
    expect([201, 422]).toContain(r.statut);
  });

  it("une chaîne de requête de plus de 200 caractères est refusée (400), la limite exacte passe", async () => {
    const m = monter();
    const limite = `https://exemple.org/p?${"a".repeat(REQUETE_MAX_CARACTERES)}`;
    const trop = `https://exemple.org/p?${"a".repeat(REQUETE_MAX_CARACTERES + 1)}`;
    expect(await m.code(m.appeler("tache.sources.lire", agent(PRODUCTEUR), { url: trop }))).toBe("entree_invalide");
    expect(m.banc.t.sources).toHaveLength(0);
    expect(LireUrlEntree.safeParse({ url: limite }).success).toBe(true);
    expect(VerifierLiensEntree.safeParse({ urls: [URL_SOURCE, trop] }).success).toBe(false);
    expect(ProposerSources.safeParse({ sources: [{ url: trop, type: "secondaire", motif: "m" }] }).success).toBe(false);
  });

  it("les 709 URL de la base commune versionnée passent les schémas de lecture et de proposition", () => {
    const urls = readFileSync(resolve(RACINE, "docs/observatoire/sources/base-sources.jsonl"), "utf8").trim().split("\n").map((l) => (JSON.parse(l) as { url: string }).url);
    expect(urls.length).toBeGreaterThanOrEqual(709);
    for (const url of urls) {
      expect(LireUrlEntree.safeParse({ url }).success, url).toBe(true);
      expect(ProposerSources.safeParse({ sources: [{ url, type: "secondaire", motif: "m" }] }).success, url).toBe(true);
    }
  });

  it("le manifeste impose « always-for-agent » aux quatre routes (le socle vérifie le checkout du run)", () => {
    const politiques = Object.fromEntries(manifest.apiRoutes!.map((r) => [r.routeKey, (r as { checkoutPolicy?: string }).checkoutPolicy]));
    for (const cle of Object.keys(ROLES_LECTURE_WEB)) expect(politiques[cle], cle).toBe("always-for-agent");
  });
});

describe("N2 : rôles autorisés = rôles dont la consigne (AGENTS.md ou compétence) documente la route", () => {
  const MOTIFS: Record<keyof typeof ROLES_LECTURE_WEB, RegExp> = {
    "tache.sources.lire": /\/taches\/[^\s`]*\/sources(?![/a-z])/u,
    "tache.liens.verifier": /\/liens\/verifier/u,
    "tache.obs.collecter": /\/obs\/collecter/u,
    "tache.obs.sources.proposer": /\/obs\/sources\/proposer/u,
  };
  const competences = new Map(readdirSync(resolve(RACINE, "organisation/skills")).map((s) => [s, (() => { try { return readFileSync(resolve(RACINE, "organisation/skills", s, "SKILL.md"), "utf8"); } catch { return ""; } })()]));
  const fiches: Array<{ nom: string; texte: string; competences: string[] }> = [];
  const lireFiche = (chemin: string) => {
    if (!existsSync(chemin)) return; // dossier sans fiche (état local d'un outil, exclu de git) : aucune consigne
    const texte = readFileSync(chemin, "utf8");
    const entete = /^---\n([\s\S]*?)\n---/u.exec(texte)![1]!;
    const nom = /^name: "(.*)"$/mu.exec(entete)![1]!;
    fiches.push({ nom: normaliserNom(nom), texte, competences: [...(entete.split("skills:")[1] ?? "").matchAll(/^ {2}- "(.*)"$/gmu)].map((x) => x[1]!) });
  };
  for (const slug of readdirSync(resolve(RACINE, "organisation/agents"))) lireFiche(resolve(RACINE, "organisation/agents", slug, "AGENTS.md"));
  for (const service of readdirSync(resolve(RACINE, "organisation/services"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dossier = resolve(RACINE, "organisation/services", service.name, "agents");
    let agents: string[] = [];
    try { agents = readdirSync(dossier); } catch { continue; }
    for (const slug of agents) lireFiche(resolve(dossier, slug, "AGENTS.md"));
  }

  it.each(Object.keys(MOTIFS) as Array<keyof typeof ROLES_LECTURE_WEB>)("%s : la liste est exactement celle des consignes, et aucun rôle homonyme ne l'ignore", (cle) => {
    const documente = (f: (typeof fiches)[number]) => MOTIFS[cle].test(f.texte) || f.competences.some((c) => MOTIFS[cle].test(competences.get(c) ?? ""));
    const attendus = [...new Set(fiches.filter(documente).map((f) => f.nom))].sort();
    expect([...ROLES_LECTURE_WEB[cle]].sort()).toEqual(attendus);
    for (const f of fiches) if ((ROLES_LECTURE_WEB[cle] as readonly string[]).includes(f.nom)) expect(documente(f), f.nom).toBe(true);
    // Décision de l'opérateur (30/10) : le coordinateur général ne lit pas le web (route absente de ses consignes).
    expect(ROLES_LECTURE_WEB[cle]).not.toContain("coordinateur general");
  });
});
