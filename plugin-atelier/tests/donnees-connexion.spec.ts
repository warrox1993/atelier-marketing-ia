/**
 * Lot L9 : intégration de la route `tache.donnees.deposer` à travers l'aiguillage réel
 * (`atelier.ts`), les services (`services.ts`) et l'accès base (`base.ts`). La base est une
 * fausse base en mémoire qui interprète les INSERT et les SELECT réellement émis.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { ESPACE_BASE, MENTION_DONNEES_DEMONSTRATION, Source } from "../src/contrats/index.js";
import { creerAiguillage } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { emballer, paireEd25519, passerelle } from "./outils-passerelle.js";

const P = await passerelle();
const CLES = paireEd25519();
const SIGNATAIRE = new P.SignataireEnveloppe(CLES.privee);

const SOC = "11111111-1111-4111-8111-111111111111";
const ISSUE = "33333333-3333-4333-8333-333333333333";
const AGENT = "44444444-4444-4444-8444-444444444444";

type Ligne = Record<string, unknown>;

function fausseBase(o: { modeEntreprise?: "demonstration" | "reel"; sousPorte?: boolean; clesPasserelle?: string[] }) {
  const tables: Record<string, Ligne[]> = { sources: [], journal: [], portes: [], evaluations_porte: [], reglages_entreprise: [] };
  if (o.modeEntreprise) tables.reglages_entreprise!.push({ company_id: SOC, max_runs_actifs: 3, max_cycles_correction: 3, mode_par_defaut: o.modeEntreprise, retention_jours: 365, modifie_le: "2026-10-15 10:00:00+00" });
  if (o.sousPorte) tables.portes!.push({ issue_id: ISSUE, company_id: SOC, campagne_id: "c", cle_livrable: "livrable", exigences_ciblees: "[]", revues_requises: "[]", max_cycles: 3, cycles_consommes: 0, actif: true, cree_le: "2026-10-15 10:00:00+00", modifie_le: "2026-10-15 10:00:00+00" });
  tables.evaluations_porte!.push({ company_id: SOC, issue_id: ISSUE, perimee: false });
  const executions: string[] = [];
  const table = (sql: string) => /(?:from|into|update)\s+\w+\.(\w+)/iu.exec(sql)?.[1] ?? "";
  const db = {
    namespace: ESPACE_BASE,
    async query(sql: string, params: unknown[] = []) {
      const t = table(sql);
      const lignes = tables[t] ?? [];
      if (/where company_id = \$1 and issue_id = \$2/u.test(sql)) return lignes.filter((l) => l.company_id === params[0] && l.issue_id === params[1]);
      if (/where company_id = \$1/u.test(sql)) return lignes.filter((l) => l.company_id === params[0]);
      return [];
    },
    async execute(sql: string, params: unknown[] = []) {
      executions.push(sql.replace(/\s+/gu, " ").trim());
      const t = table(sql);
      const insertion = /insert into \w+\.\w+ \(([^)]+)\)\s*values\s*\(([^)]+)\)/iu.exec(sql.replace(/\s+/gu, " "));
      if (insertion) {
        const colonnes = insertion[1]!.split(",").map((c) => c.trim());
        const valeurs = insertion[2]!.split(",").map((v) => v.trim());
        const ligne: Ligne = {};
        colonnes.forEach((c, i) => {
          const n = /^\$(\d+)/u.exec(valeurs[i]!);
          ligne[c] = n ? params[Number(n[1]) - 1] : null;
        });
        (tables[t] ??= []).push(ligne);
      }
      if (/^update/iu.test(sql.trim()) && t === "evaluations_porte") for (const l of tables[t]!) if (l.issue_id === params[1]) l.perimee = true;
      if (/^update/iu.test(sql.trim()) && t === "portes") for (const l of tables[t]!) if (l.issue_id === params[1]) l.modifie_le = "touchée";
      return { rowCount: 1 };
    },
  };
  const activite: string[] = [];
  const routes = new Map<string, unknown>();
  const ctx = {
    db,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    issues: { get: async (id: string, companyId: string) => (id === ISSUE && companyId === SOC ? { id: ISSUE, companyId: SOC, projectId: null, status: "in_progress", title: "Bilan" } : null) },
    activity: { log: async (e: { message: string }) => void activite.push(e.message) },
    // §6 bis : clé publique de la passerelle fixée par l'humain dans la configuration du plugin.
    config: { get: async () => ({ passerelleClesPubliques: o.clesPasserelle ?? [CLES.publiqueBase64] }) },
    events: { on() {} },
    data: { register() {} },
    actions: { register() {} },
    apiRoutes: { register: (cle: string, fn: unknown) => routes.set(cle, fn) },
  } as unknown as PluginContext;
  return { ctx, tables, executions, activite };
}

const ARGS = { debut: "2026-09-01", fin: "2026-09-30" };

/** Réponse emballée comme par la passerelle ; signée par sa clé en mode réel (§6 bis). */
function reponse(mode: "demonstration" | "reel", signer = mode === "reel") {
  const donnees = {
    siteUrl: mode === "demonstration" ? "sc-domain:renovation-liege.example" : "sc-domain:client-reel.be",
    rows: [{ keys: ["toiture"], clicks: 412, impressions: 9870, ctr: 0.0417, position: 3.42 }, { keys: ["diagnostic"], clicks: 280, impressions: 5120, ctr: 0.0547, position: 4.1 }],
  };
  void MENTION_DONNEES_DEMONSTRATION;
  return emballer(signer ? SIGNATAIRE : null, mode, donnees, { service: "gsc", outil: "gsc_requete_performances", compte: donnees.siteUrl, args: ARGS }) as { texte: string; structuredContent: Record<string, unknown> };
}

async function deposer(f: ReturnType<typeof fausseBase>, corps: unknown) {
  const aiguillage = creerAiguillage(f.ctx, creerServices(f.ctx));
  return aiguillage.traiterRequeteApi({
    routeKey: "tache.donnees.deposer", method: "POST", path: `/taches/${ISSUE}/donnees-connexion`, params: { issueId: ISSUE }, query: {}, body: corps,
    actor: { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: "run-1" }, companyId: SOC, headers: {},
  } as never);
}

describe("route tache.donnees.deposer (service complet, fausse base)", () => {
  it("réponse simulée, même dans une entreprise réglée en démonstration : enregistrée pour la trace, signalée interdite, indices et chiffres conservés, porte périmée", async () => {
    const f = fausseBase({ modeEntreprise: "demonstration", sousPorte: true });
    const r = await deposer(f, { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("demonstration") });
    expect(r.status).toBe(201);
    const corps = r.body as { source: unknown; mode: string; interdite: boolean; chiffresRetenus: number; consigne: string };
    expect(corps.mode).toBe("demonstration");
    expect(corps.interdite).toBe(true);
    expect(corps.consigne).toMatch(/interdite ici/u);
    const source = Source.parse(corps.source);
    expect(source).toMatchObject({ provenance: "connexion", mode: "demonstration", url: "connexion://gsc/gsc_requete_performances", nonFiable: true });
    expect(source.connexion?.indicesMode).toContain("_atelier.mode = demonstration");
    expect(source.connexion?.modeCampagne).toBe("demonstration");
    const ligne = f.tables.sources![0]!;
    expect(ligne.provenance).toBe("connexion");
    expect(JSON.parse(String(ligne.chiffres)).map((c: { valeur: number }) => c.valeur)).toEqual(expect.arrayContaining([412, 280, 692, 9870]));
    expect(f.tables.journal!.map((j) => j.type)).toEqual(["donnees.demo_campagne_reelle"]);
    expect(f.tables.evaluations_porte![0]!.perimee).toBe(true);
    expect(f.tables.portes![0]!.modifie_le).toBe("touchée");
  });

  it("réponse réelle signée par la passerelle : mode réel déduit ; aucune activité d'alerte", async () => {
    const f = fausseBase({ modeEntreprise: "reel" });
    const r = await deposer(f, { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("reel"), arguments: ARGS });
    expect(r.status).toBe(201);
    expect((r.body as { mode: string }).mode).toBe("reel");
    expect(f.activite).toEqual([]);
  });

  it("E2-A : réponse réelle signée qui ne fait que renvoyer la saisie de l'agent (référence numérique) : aucun chiffre retenu", async () => {
    const f = fausseBase({ modeEntreprise: "reel" });
    const args = { commune: "123456" };
    const donnees = { statut: "introuvable", reference: "123456", echo: "123456", raison: "Aucune commune." };
    const rep = emballer(SIGNATAIRE, "reel", donnees, { service: "gsc", outil: "gsc_requete_performances", compte: "sc-domain:client-reel.be", args }) as { texte: string; structuredContent: Record<string, unknown> };
    const r = await deposer(f, { service: "gsc", outil: "gsc_requete_performances", reponse: rep, arguments: args });
    expect(r.status).toBe(201);
    expect((r.body as { mode: string; chiffresRetenus: number }).mode).toBe("reel");
    expect((r.body as { chiffresRetenus: number }).chiffresRetenus).toBe(0);
    expect(JSON.parse(String(f.tables.sources![0]!.chiffres))).toEqual([]);
  });

  it("§6 bis : réponse « réelle » non signée, modifiée, d'un autre outil ou d'autres arguments : refusée, rien n'est enregistré comme réel", async () => {
    const cas: Array<[string, unknown]> = [
      ["non signée", { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("reel", false) }],
      ["chiffre modifié", (() => {
        const r = reponse("reel");
        const s = r.structuredContent as { rows: Array<{ clicks: number }> };
        s.rows[0]!.clicks = 9999;
        return { service: "gsc", outil: "gsc_requete_performances", reponse: { structuredContent: s } };
      })()],
      ["autre outil déclaré", { service: "gsc", outil: "gsc_sitemaps", reponse: reponse("reel") }],
      ["autres arguments (rejeu)", { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("reel"), arguments: { debut: "2025-01-01", fin: "2025-01-31" } }],
    ];
    for (const [nom, corps] of cas) {
      const f = fausseBase({ modeEntreprise: "reel" });
      const r = await deposer(f, corps);
      expect(r.status, nom).toBe(400);
      expect(String((r.body as { erreur: string }).erreur), nom).toMatch(/non signée par la passerelle/u);
      expect(f.tables.sources, nom).toEqual([]);
      expect(f.tables.journal!.map((j) => j.type), nom).toEqual(["donnees.refusees"]);
    }
    // Sans clé publique configurée dans le plugin : aucune donnée n'est tenue pour réelle.
    const sansCle = fausseBase({ modeEntreprise: "reel", clesPasserelle: [] });
    expect((await deposer(sansCle, { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("reel") })).status).toBe(400);
  });

  it("démonstration dans une entreprise réelle : enregistrée pour la trace, signalée interdite, activité native consignée", async () => {
    const f = fausseBase({ modeEntreprise: "reel" });
    const r = await deposer(f, { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("demonstration") });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ mode: "demonstration", interdite: true });
    expect(f.tables.sources![0]!.mode_campagne).toBe("reel");
    expect(f.tables.journal!.map((j) => j.type)).toEqual(["donnees.demo_campagne_reelle"]);
    expect(f.activite[0]).toMatch(/déposée \(entreprise en mode réel\)/u);
  });

  it("mode déclaré par l'agent : refusé (400), rien n'est enregistré", async () => {
    const f = fausseBase({ modeEntreprise: "reel" });
    const r = await deposer(f, { service: "gsc", outil: "gsc_requete_performances", mode: "reel", reponse: reponse("demonstration") });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "entree_invalide" });
    expect(f.tables.sources).toEqual([]);
  });

  it("réponse sans enveloppe « _atelier » : refusée (provenance inconnue), refus journalisé", async () => {
    const f = fausseBase({ modeEntreprise: "demonstration" });
    const { _atelier: _a, ...nue } = reponse("reel").structuredContent;
    const r = await deposer(f, { service: "gsc", outil: "gsc_requete_performances", reponse: { structuredContent: nue } });
    expect(r.status).toBe(400);
    expect(String((r.body as { erreur: string }).erreur)).toMatch(/Provenance inconnue/u);
    expect(f.tables.sources).toEqual([]);
    expect(f.tables.journal!.map((j) => j.type)).toEqual(["donnees.refusees"]);
  });

  it("tâche hors de l'entreprise : introuvable", async () => {
    const f = fausseBase({});
    const aiguillage = creerAiguillage(f.ctx, creerServices(f.ctx));
    const r = await aiguillage.traiterRequeteApi({
      routeKey: "tache.donnees.deposer", method: "POST", path: "/x", params: { issueId: "55555555-5555-4555-8555-555555555555" }, query: {},
      body: { service: "gsc", outil: "gsc_requete_performances", reponse: reponse("demonstration") }, actor: { actorType: "agent", actorId: AGENT, agentId: AGENT, runId: null }, companyId: SOC, headers: {},
    } as never);
    expect(r.status).toBe(404);
  });
});
