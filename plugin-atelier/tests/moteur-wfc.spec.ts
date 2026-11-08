/**
 * Moteur de missions (#50, tâche 3) : gabarit de contenu WF-C. Un seul gabarit pour un post, un article ou une newsletter :
 * seuls les paramètres changent. Seam : exécuteur sur doubles, dont l'hôte rejoue les refus du vrai `requestWakeup`
 * (double recopié de `moteur-executeur.spec.ts`, réduit à ce que ces cas utilisent).
 */
import { describe, expect, it } from "vitest";
import { creerExecuteur, type DepsExecuteur } from "../src/moteur/executeur.js";
import { chargerContrat } from "../src/moteur/contrats.js";
import { chargerGabarit, poserPorteMission, revuesImposees, type DepsPorteMission } from "../src/moteur/gabarits.js";
import type { EtapeMission, Mission } from "../src/serveur/base.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const CAMPAGNE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INSTANT = new Date("2026-11-08T10:00:00.000Z");
const SORTIE = { textes: ["un texte"], briefsVisuels: [], sources: ["https://exemple.fr/a"] };
const ENTREES = { canal: "linkedin", cible: "dirigeants de PME", objectif: "faire connaître l'offre", sources: ["https://exemple.fr/a"], typeLivrable: "post" };

function monter(entree: Record<string, unknown>) {
  const missions = new Map<string, Mission>();
  const etapes: EtapeMission[] = [];
  const executions = new Map<string, { statut: string }>();
  const issues = new Map<string, Record<string, unknown>>();
  const reveils: string[] = [];
  const majs: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const base = {
    async lireMission(companyId: string, id: string) { const m = missions.get(id); return m && m.companyId === companyId ? { ...m } : null; },
    async missionsActives() { return []; },
    async changerEtatMission(companyId: string, id: string, ancien: string, nouveau: string) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.etat !== ancien) return false;
      m.etat = nouveau as Mission["etat"];
      return true;
    },
    async changerRangMission(companyId: string, id: string, ancien: number, nouveau: number) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.rangCourant !== ancien) return false;
      m.rangCourant = nouveau;
      return true;
    },
    async creerEtape(e: { companyId: string; missionId: string; rang: number; role: string; tentative?: number; etat: string; entree?: unknown; issueId?: string | null }) {
      etapes.push({ id: `etape-${etapes.length + 1}`, companyId: e.companyId, missionId: e.missionId, rang: e.rang, role: e.role, tentative: e.tentative ?? 1, etat: e.etat, entree: e.entree ?? null, sortie: null, delaiLe: null, issueId: e.issueId ?? null, revisionLivrable: null, creeLe: "", modifieLe: "" });
      return `etape-${etapes.length}`;
    },
    async lireEtapes(companyId: string, missionId: string) { return etapes.filter((e) => e.companyId === companyId && e.missionId === missionId).sort((a, b) => a.rang - b.rang || a.tentative - b.tentative).map((e) => ({ ...e })); },
    async majEtape(companyId: string, id: string, c: { etat?: string; sortie?: unknown; issueId?: string | null }) {
      const e = etapes.find((x) => x.companyId === companyId && x.id === id);
      if (!e) return false;
      Object.assign(e, c);
      return true;
    },
    async etapeParIssue() { return null; },
    async enregistrerExecution(e: { companyId: string; cle: string }) {
      const k = `${e.companyId}|${e.cle}`;
      if (executions.has(k)) return false;
      executions.set(k, { statut: "demandee" });
      return true;
    },
    async marquerExecution(companyId: string, cle: string, statut: string) { const x = executions.get(`${companyId}|${cle}`); if (x) x.statut = statut; return Boolean(x); },
    async lireExecution(companyId: string, cle: string) { return executions.get(`${companyId}|${cle}`) ?? null; },
    async journaliser() { /* sans objet ici */ },
  };
  const hote = {
    issues: {
      async create(i: Record<string, unknown>) { const id = `issue-${issues.size + 1}`; issues.set(id, { id, ...i }); return { id }; },
      async list(f: { originId?: string }) { return [...issues.values()].filter((i) => i.originId === f.originId); },
      async update(id: string, patch: Record<string, unknown>) { majs.push({ id, patch }); Object.assign(issues.get(id) ?? {}, patch); return {}; },
      /** Refus du vrai hôte (plugin-host-services.ts, requestWakeup) : sans assigné, statut non réveillable, bloqueur non terminé. */
      async requestWakeup(issueId: string) {
        const tache = issues.get(issueId);
        if (!tache?.assigneeAgentId) throw new Error("Issue has no assigned agent to wake");
        if (["backlog", "done", "cancelled"].includes(String(tache.status))) throw new Error(`Issue is not wakeable in status: ${String(tache.status)}`);
        if (((tache.blockedByIssueIds as string[] | undefined) ?? []).some((b) => issues.get(b)?.status !== "done")) throw new Error("Issue is blocked by unresolved blockers");
        reveils.push(issueId);
        return {};
      },
    },
    async resoudreAgent(_c: string, role: string) { return `agent-${role}`; },
  };
  const portes: string[] = [];
  const porte = {
    async creerPorte(p: { issueId: string }) { if (portes.includes(p.issueId)) return false; portes.push(p.issueId); return true; },
    async majPolitique() { return {}; },
    async conformiteImposee() { return false; },
    async exigences() { return ["EXI-1"]; },
    async resolveur() { return <T>(v: T) => v; },
  };
  const executeur = creerExecuteur({ hote: hote as never, base: base as unknown as DepsExecuteur["base"], porte: porte as never, horloge: () => INSTANT, revisionLivrable: async () => null });
  const missionId = "mission-1";
  missions.set(missionId, { id: missionId, companyId: SOC, gabaritCle: "wf-c-contenu", gabaritVersion: 1, contratId: "wf-c-contenu-parametre", contratVersion: 1, mandat: "mandat", etat: "prete", etatAvantPause: null, rangCourant: 0, enveloppeCents: 0, campagneId: CAMPAGNE, issueRacineId: null, creeLe: "", modifieLe: "" } as Mission);
  etapes.push({ id: "etape-0", companyId: SOC, missionId, rang: 1, role: "contenus", tentative: 1, etat: "en_attente", entree, sortie: null, delaiLe: null, issueId: null, revisionLivrable: null, creeLe: "", modifieLe: "" } as EtapeMission);
  return { executeur, missions, etapes, issues, reveils, majs, portes, missionId };
}

describe("gabarit de contenu WF-C", () => {
  it("se charge : livrable public, une étape de rédaction par contenus sous le contrat paramétré", () => {
    const g = chargerGabarit("wf-c-contenu");
    expect(g.typeLivrable).toBe("public");
    expect(g.etapes).toEqual([{ rang: 1, role: "contenus", competences: ["redaction-declinaison-canal", "charte-marque"], contratId: "wf-c-contenu-parametre", contratVersion: 1 }]);
    expect(chargerContrat("wf-c-contenu-parametre", 1).entreesRequises.map((e) => e.cle)).toEqual(["canal", "cible", "objectif", "sources", "typeLivrable"]);
  });

  it("impose les revues du type (exigences, métier, technique), plus la conformité si le client a le module", () => {
    const g = chargerGabarit("wf-c-contenu");
    expect(revuesImposees(g).map((r) => r.role)).toEqual(["exigences", "metier", "technique"]);
    expect(revuesImposees(g, { conformite: true }).map((r) => r.role)).toEqual(["exigences", "metier", "technique", "conformite"]);
  });

  it("pose la porte d'office : relecture puis approbation humaine, après l'unique étape d'agent", async () => {
    const g = chargerGabarit("wf-c-contenu");
    expect([g.porte, g.approbationRequise]).toEqual([true, true]);
    const politiques: unknown[] = [];
    const deps: DepsPorteMission = { creerPorte: async () => true, majPolitique: async (_i, _c, p) => { politiques.push(p); }, resoudre: (v) => v, conformiteImposee: async () => false };
    await poserPorteMission(deps, { companyId: SOC, issueId: "i", campagneId: CAMPAGNE, gabarit: g, exigencesCiblees: [] });
    const stages = (politiques[0] as { stages: Array<{ type: string }> }).stages;
    expect(stages.map((s) => s.type)).toEqual(["review", "approval"]);
  });

  it("ne publie rien : contrat sans effet externe, aucune compétence de publication", () => {
    const g = chargerGabarit("wf-c-contenu");
    for (const e of g.etapes) {
      expect(chargerContrat(e.contratId, e.contratVersion).effetExterne).toBe("aucun");
      expect(e.competences.filter((c) => /publi|diffusion|courriel/u.test(c))).toEqual([]);
    }
  });

  it.each(["post", "article", "newsletter"])("le même gabarit sert un(e) %s : seuls les paramètres changent", async (typeLivrable) => {
    const t = monter({ ...ENTREES, typeLivrable, canal: typeLivrable === "newsletter" ? "courriel" : "linkedin" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
    expect(t.reveils).toEqual(["issue-1"]);
    const r = await t.executeur.recevoirResultat(SOC, { missionId: t.missionId, rang: 1, tentative: 1, sortie: SORTIE });
    expect(r.statut).toBe("accepte");
    expect(t.missions.get(t.missionId)!.etat).toBe("en_revue");
    expect(t.portes).toEqual(["issue-1"]);
  });

  it.each(["canal", "cible", "objectif", "sources", "typeLivrable"])("sans « %s » à l'entrée : attente_information, aucun réveil, aucune erreur", async (cle) => {
    const { [cle]: _retire, ...entree } = ENTREES as Record<string, unknown>;
    const t = monter(entree);
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
    expect(t.etapes[0]!.etat).toBe("attente_information");
    expect(t.reveils).toEqual([]);
  });
});
