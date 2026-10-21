/**
 * Veilleur des tâches orphelines (constat réel du 16/10/2026 : passage interrompu par un
 * redémarrage, tâche restée « en cours » sans aucun passage). La sélection SQL (passage actif,
 * tâche terminée, bloquée, agent en pause, discussion, tours épuisés) est dans `base.tachesOrphelines` ; ces tests couvrent
 * la décision de réveil : une fois par période, jamais en attente humaine, plafond total par tâche (3 réveils), plafond de 10 par passe.
 */
import { describe, expect, it } from "vitest";
import { VEILLEUR, creerVeilleur, seuilMinutes } from "../src/serveur/veilleur.js";
import { creerBase } from "../src/serveur/base.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const ORPHELINE = "55555555-5555-4555-8555-555555555555";
const AGENT = "99999999-9999-4999-8999-999999999999";

type Candidat = { issueId: string; identifier: string | null; statut: string; agentId: string; dernierRun: { id: string; statut: string; le: string } | null };

function banc(o: { candidats?: Candidat[]; interactions?: Array<{ status: string }>; reveilEchoue?: boolean } = {}) {
  const decisions: Array<{ creeLe: string }> = [];
  let maintenant = new Date(Date.UTC(2026, 9, 16, 12, 0, 0));
  const journal: Array<{ type: string; issueId: string; creeLe: string; donnees: unknown }> = [];
  const reveils: Array<{ issueId: string; cle: string | null | undefined }> = [];
  // Tâche interrompue il y a 20 minutes (le SQL l'a déjà retenue comme orpheline au-delà du seuil).
  const candidats: Candidat[] = o.candidats ?? [
    { issueId: ORPHELINE, identifier: "ATL-35", statut: "in_progress", agentId: AGENT, dernierRun: { id: "run-1", statut: "interrupted", le: new Date(maintenant.getTime() - 20 * 60_000).toISOString() } },
  ];
  const seuils: number[] = [];
  const veilleur = creerVeilleur({
    base: {
      entreprisesSuivies: async () => [SOC],
      tachesOrphelines: async (_c: string, seuil: number) => (seuils.push(seuil), candidats),
      listerDecisions: async () => decisions,
      datesJournal: async (_c: string, issueId: string, type: string) => journal.filter((j) => j.issueId === issueId && j.type === type).map((j) => j.creeLe).sort().reverse(),
      journaliser: async (e: { type: string; issueId?: string | null; donnees?: unknown }) => void journal.push({ type: e.type, issueId: e.issueId ?? "", creeLe: maintenant.toISOString(), donnees: e.donnees }),
    } as never,
    issues: {
      listInteractions: async () => (o.interactions ?? []) as never,
      requestWakeup: async (issueId: string, _c: string, opts?: { idempotencyKey?: string | null }) => {
        if (o.reveilEchoue) throw new Error("Issue is blocked by unresolved blockers");
        reveils.push({ issueId, cle: opts?.idempotencyKey });
        return { queued: true, runId: "run-2" };
      },
    } as never,
    logger: { info() {}, warn() {} },
    config: async () => ({}),
    maintenant: () => maintenant,
  });
  const avancer = (minutes: number) => (maintenant = new Date(maintenant.getTime() + minutes * 60_000));
  const maintenantIso = () => maintenant.toISOString();
  return { veilleur, journal, reveils, seuils, avancer, candidats, decisions, maintenantIso };
}

describe("veilleur des tâches orphelines", () => {
  it("une tâche orpheline depuis 20 minutes est réveillée une fois, et le réveil est journalisé", async () => {
    const b = banc();
    const r = await b.veilleur.passe();
    expect(r.reveillees).toEqual([ORPHELINE]);
    expect(b.reveils).toHaveLength(1);
    expect(b.reveils[0]!.cle).toMatch(/^atelier-veilleur-55555555-/u);
    expect(b.seuils).toEqual([VEILLEUR.seuilMinutesDefaut]);
    expect(b.journal.filter((j) => j.type === "veilleur.reveil")).toHaveLength(1);
    expect(b.journal[0]!.donnees).toMatchObject({ identifiant: "ATL-35", dernierRun: { statut: "interrupted" }, seuilMinutes: 15 });
  });

  it("pas de second réveil dans la même période, un seul à la période suivante", async () => {
    const b = banc();
    await b.veilleur.passe();
    b.avancer(5);
    expect((await b.veilleur.passe()).ignorees).toEqual([{ issueId: ORPHELINE, raison: "deja_reveillee_dans_la_periode" }]);
    b.avancer(5);
    await b.veilleur.passe();
    expect(b.reveils).toHaveLength(1);
    b.avancer(6); // 16 minutes après le premier réveil : nouvelle période
    await b.veilleur.passe();
    expect(b.reveils).toHaveLength(2);
  });

  it("plafond total : 3 réveils au plus, puis un seul abandon journalisé (pas de boucle)", async () => {
    const b = banc();
    for (let i = 0; i < 6; i++) {
      await b.veilleur.passe();
      b.avancer(20);
    }
    expect(b.reveils).toHaveLength(VEILLEUR.maxReveils);
    expect(b.journal.filter((j) => j.type === "veilleur.abandon")).toHaveLength(1);
  });

  it("aucun nouveau réveil le lendemain ni les jours suivants sans action humaine, et aucun second abandon", async () => {
    const b = banc();
    for (let i = 0; i < 4; i++) {
      await b.veilleur.passe();
      b.avancer(20);
    }
    for (let jour = 0; jour < 5; jour++) {
      b.avancer(24 * 60);
      const r = await b.veilleur.passe();
      expect(r.reveillees).toEqual([]);
      expect(r.ignorees).toEqual([{ issueId: ORPHELINE, raison: "plafond_total" }]);
    }
    expect(b.reveils).toHaveLength(3);
    expect(b.journal.filter((j) => j.type === "veilleur.abandon")).toHaveLength(1);
  });

  it("reprise après cycles.remise_humaine : 3 nouveaux réveils, puis un nouvel abandon", async () => {
    const b = banc();
    for (let i = 0; i < 5; i++) {
      await b.veilleur.passe();
      b.avancer(20);
    }
    expect(b.reveils).toHaveLength(3);
    b.avancer(1);
    b.journal.push({ type: "cycles.remise_humaine", issueId: ORPHELINE, creeLe: b.maintenantIso(), donnees: {} });
    b.avancer(20);
    for (let i = 0; i < 6; i++) {
      await b.veilleur.passe();
      b.avancer(20);
    }
    expect(b.reveils).toHaveLength(6);
    expect(b.journal.filter((j) => j.type === "veilleur.abandon")).toHaveLength(2);
  });

  it("une décision humaine de l'atelier remet aussi le compteur à zéro", async () => {
    const b = banc();
    for (let i = 0; i < 4; i++) {
      await b.veilleur.passe();
      b.avancer(20);
    }
    b.avancer(1);
    b.decisions.push({ creeLe: b.maintenantIso() });
    b.avancer(20);
    expect((await b.veilleur.passe()).reveillees).toEqual([ORPHELINE]);
    expect(b.reveils).toHaveLength(4);
  });

  it("plafond global : 10 réveils au plus par passe, le reste attend la passe suivante", async () => {
    const candidats: Candidat[] = Array.from({ length: 14 }, (_, i) => ({
      issueId: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`, identifier: `ATL-${i}`, statut: "in_progress", agentId: AGENT,
      dernierRun: { id: `run-${i}`, statut: "interrupted", le: "2026-10-16T11:00:00.000Z" },
    }));
    const b = banc({ candidats });
    const r1 = await b.veilleur.passe();
    expect(r1.reveillees).toHaveLength(VEILLEUR.maxReveilsParPasse);
    expect(r1.ignorees.filter((x) => x.raison === "plafond_passe")).toHaveLength(4);
    b.avancer(20);
    const r2 = await b.veilleur.passe();
    expect(r2.reveillees).toHaveLength(10);
    expect(b.reveils).toHaveLength(20);
  });

  it("une tâche qui attend une réponse humaine n'est pas réveillée", async () => {
    const b = banc({ interactions: [{ status: "pending" }] });
    expect((await b.veilleur.passe()).ignorees).toEqual([{ issueId: ORPHELINE, raison: "attente_humaine" }]);
    expect(b.reveils).toEqual([]);
  });

  it("aucune candidate (passage actif, tâche terminée ou bloquée : écartées par la sélection) : aucun réveil", async () => {
    const b = banc({ candidats: [] });
    expect(await b.veilleur.passe()).toEqual({ reveillees: [], ignorees: [], echecs: [] });
    expect(b.reveils).toEqual([]);
  });

  it("un réveil refusé par l'hôte compte quand même pour la période (aucune relance en boucle)", async () => {
    const b = banc({ reveilEchoue: true });
    expect((await b.veilleur.passe()).echecs).toHaveLength(1);
    b.avancer(5);
    expect((await b.veilleur.passe()).ignorees).toEqual([{ issueId: ORPHELINE, raison: "deja_reveillee_dans_la_periode" }]);
  });

  it("seuil configurable, borné entre 5 minutes et 24 heures", () => {
    expect(seuilMinutes({})).toBe(15);
    expect(seuilMinutes({ veilleurSeuilMinutes: 30 })).toBe(30);
    expect(seuilMinutes({ veilleurSeuilMinutes: 1 })).toBe(5);
    expect(seuilMinutes({ veilleurSeuilMinutes: 99999 })).toBe(1440);
    expect(seuilMinutes({ veilleurSeuilMinutes: "abc" })).toBe(15);
  });
});

describe("sélection SQL des tâches orphelines : exclusions", () => {
  async function requete() {
    const vues: string[] = [];
    const base = creerBase({ namespace: "plugin_atelier_f0322cc62c", query: async (sql: string) => (vues.push(sql), []), execute: async () => ({ rowCount: 0 }) } as never);
    await base.tachesOrphelines(SOC, 15);
    return vues[0]!;
  }

  it("M4 : in_review et blocked écartées si une liaison en attente d'approbation, une approbation Paperclip ou une revue ouverte les gère", async () => {
    const sql = await requete();
    expect(sql).toContain("li.tache_origine_id = i.id and li.statut = 'en_attente_approbation'");
    expect(sql).toContain("from public.approvals ap where ap.company_id = i.company_id and ap.status = 'pending' and ap.payload::text like '%' || i.id::text || '%'");
    expect(sql).toMatch(/rv\.title ~ \('\(\^\|\[\^A-Za-z0-9-\]\)' \|\| i\.identifier \|\| '\(\[\^0-9\]\|\$\)'\)/u);
    expect(sql).toContain("rv.status not in ('done', 'cancelled')");
    expect(sql).toContain("rv.assignee_agent_id <> i.assignee_agent_id");
    // Ces trois exclusions ne s'appliquent qu'à in_review et blocked (todo et in_progress ne sont pas concernées).
    expect(sql).toContain("i.status in ('todo', 'in_progress') or (");
  });

  it("M4 : blocked n'est prise que si le dernier passage a échoué ou été interrompu, jamais un blocage volontaire sans passage", async () => {
    const sql = await requete();
    expect(sql).toContain("when i.status = 'blocked' then d.status in ('interrupted', 'failed', 'timed_out', 'scheduled_retry')");
    expect(sql).not.toContain("or i.status in ('in_review', 'blocked') or");
    expect(sql).toContain("else (d.id is null or i.status = 'in_review' or d.status in");
  });

  it("écarte les passages arrêtés pour tours épuisés, budget, quota ou authentification", async () => {
    const sql = await requete();
    expect(sql).toContain("r.error_code");
    expect(sql).toContain("'max_turns_exhausted'");
    expect(sql).toContain("'claude_auth_required'");
    expect(sql).toContain("not like '%budget%'");
    expect(sql).toContain("not like '%quota%'");
    expect(sql).toContain("not like '%auth%'");
  });

  it("écarte l'issue de discussion (origin_kind plugin:*:discussion et origin_id discussion:*)", async () => {
    const sql = await requete();
    expect(sql).toContain("i.origin_kind like 'plugin:%:discussion'");
    expect(sql).toContain("i.origin_id, '') like 'discussion:%'");
  });

  describe("filet de la chaîne : tâches en revue ou bloquées (21/10/2026)", () => {
    const enRevue = (statut: string): Candidat => ({ issueId: ORPHELINE, identifier: "ABC-8", statut, agentId: AGENT, dernierRun: { id: "run-1", statut: "succeeded", le: "2026-10-16T11:00:00.000Z" } });

    it.each(["in_review", "blocked"])("une tâche %s sans exécution depuis le seuil est réveillée, journalisée avec son statut", async (statut) => {
      const b = banc({ candidats: [enRevue(statut)] });
      const r = await b.veilleur.passe();
      expect(r.reveillees).toEqual([ORPHELINE]);
      expect(b.journal[0]!.donnees).toMatchObject({ statut, dernierRun: { statut: "succeeded" } });
    });

    it("jamais de réveil quand une carte attend l'humain", async () => {
      const b = banc({ candidats: [enRevue("in_review")], interactions: [{ status: "pending" }] });
      const r = await b.veilleur.passe();
      expect(r.reveillees).toEqual([]);
      expect(r.ignorees).toEqual([{ issueId: ORPHELINE, raison: "attente_humaine" }]);
      expect(b.reveils).toHaveLength(0);
    });

    it("mêmes plafonds : 3 réveils au plus puis un seul abandon journalisé", async () => {
      const b = banc({ candidats: [enRevue("in_review")] });
      for (let i = 0; i < 6; i++) {
        await b.veilleur.passe();
        b.avancer(16);
      }
      expect(b.reveils).toHaveLength(VEILLEUR.maxReveils);
      expect(b.journal.filter((j) => j.type === VEILLEUR.typeAbandon)).toHaveLength(1);
    });
  });
});
