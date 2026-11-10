/**
 * Moteur de missions (#49, tâche 5) : exécuteur, reprise et réglage d'activation.
 * Seam : hôte Paperclip double (compte les créations, les mises à jour et les réveils), base en mémoire qui rejoue
 * les unicités du SQL (clé d'idempotence, compare-and-set), horloge injectée.
 */
import { describe, expect, it, vi } from "vitest";
import manifest from "../src/manifest.js";
import { agentParSlug, creerExecuteur, creerResolveur, moteurActif, ORIGINE_ETAPE, REFUS_IDENTIQUES_MAX, reprendreSiActif, type DepsExecuteur } from "../src/moteur/executeur.js";
import { chargerGabarit, PorteRefusee, type Gabarit } from "../src/moteur/gabarits.js";
import type { EtapeMission, Mission } from "../src/serveur/base.js";

const SOC = "11111111-1111-4111-8111-111111111111";
const INSTANT = new Date("2026-11-08T10:00:00.000Z");
const ENTREES = { brief: "brief", charte: "charte", sources: ["https://exemple.fr/a"] };
const SORTIE = { textes: ["un texte"], briefsVisuels: ["un visuel"], sources: ["https://exemple.fr/a"] };

const GABARIT_4: Gabarit = {
  ...chargerGabarit("contenu-reseau-social"),
  porte: false,
  etapes: [1, 2, 3, 4].map((rang) => ({ rang, role: "contenus", competences: [], contratId: "wf-c-contenu", contratVersion: 1 })),
};

function baseMemoire() {
  const missions = new Map<string, Mission>();
  const etapes: EtapeMission[] = [];
  const executions = new Map<string, { statut: string; type?: string; requete?: unknown; missionId?: string }>();
  const journal: Array<{ type: string; donnees?: Record<string, unknown> }> = [];
  const compteurs = { transitions: 0 };
  let n = 0;
  const base = {
    async creerMission(m: Partial<Mission> & { companyId: string }) {
      const id = `mission-${++n}`;
      missions.set(id, { id, gabaritCle: "contenu-reseau-social", gabaritVersion: 1, contratId: "wf-c-contenu", contratVersion: 1, mandat: "mandat", etat: "prete", etatAvantPause: null, rangCourant: 0, enveloppeCents: 0, campagneId: null, issueRacineId: null, creeLe: "", modifieLe: "", ...m } as Mission);
      return id;
    },
    async lireMission(companyId: string, id: string) {
      const m = missions.get(id);
      return m && m.companyId === companyId ? { ...m } : null;
    },
    async missionsActives(companyId: string) {
      return [...missions.values()].filter((m) => m.companyId === companyId && !["cloturee", "annulee", "echec"].includes(m.etat)).map((m) => ({ ...m }));
    },
    async changerEtatMission(companyId: string, id: string, ancien: string, nouveau: string) {
      const m = missions.get(id);
      if (!m || m.companyId !== companyId || m.etat !== ancien) return false;
      // Comme le SQL : la sortie de blocage incrémente le compteur de cycle dans le même changement.
      if (ancien === "blocage") Object.assign(m, { cycleBlocage: ((m as { cycleBlocage?: number }).cycleBlocage ?? 0) + 1 });
      m.etat = nouveau as Mission["etat"];
      compteurs.transitions += 1;
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
    async lireEtapes(companyId: string, missionId: string) {
      return etapes.filter((e) => e.companyId === companyId && e.missionId === missionId).sort((a, b) => a.rang - b.rang || a.tentative - b.tentative).map((e) => ({ ...e }));
    },
    async majEtape(companyId: string, id: string, c: { etat?: string; sortie?: unknown; issueId?: string | null }) {
      const e = etapes.find((x) => x.companyId === companyId && x.id === id);
      if (!e) return false;
      Object.assign(e, c);
      return true;
    },
    async etapeParIssue(companyId: string, issueId: string) {
      const e = etapes.find((x) => x.companyId === companyId && x.issueId === issueId);
      return e ? { ...e } : null;
    },
    async enregistrerExecution(e: { companyId: string; missionId?: string; cle: string; type?: string; requete?: unknown }) {
      const k = `${e.companyId}|${e.cle}`;
      if (executions.has(k)) return false;
      executions.set(k, { statut: "demandee", type: e.type, requete: e.requete, missionId: e.missionId });
      return true;
    },
    /** Comme le SQL : les exécutions encore `demandee` de la mission pour ce type, clé d'idempotence comprise. */
    async executionsDemandees(companyId: string, missionId: string, type: string) {
      return [...executions].filter(([k, x]) => k.startsWith(`${companyId}|`) && x.missionId === missionId && x.type === type && x.statut === "demandee").map(([k, x]) => ({ cle: k.slice(k.indexOf("|") + 1), requete: x.requete }));
    },
    async marquerExecution(companyId: string, cle: string, statut: string) {
      const x = executions.get(`${companyId}|${cle}`);
      if (x) x.statut = statut;
      return Boolean(x);
    },
    async lireExecution(companyId: string, cle: string) {
      return executions.get(`${companyId}|${cle}`) ?? null;
    },
    /** Comme le SQL : exécutions `appliquee` de la mission, clé commençant par `prefixe` et finissant par `suffixe` (vide : sans suffixe de cycle). */
    async compterExecutionsAppliquees(companyId: string, missionId: string, prefixe: string, suffixe: string) {
      return [...executions].filter(([k, x]) => {
        const cle = k.slice(k.indexOf("|") + 1);
        return k.startsWith(`${companyId}|`) && x.missionId === missionId && x.statut === "appliquee" && cle.startsWith(prefixe) && (suffixe ? cle.endsWith(suffixe) : !/:c[0-9]+$/.test(cle));
      }).length;
    },
    async journaliser(e: { type: string; donnees?: Record<string, unknown> }) {
      journal.push({ type: e.type, donnees: e.donnees });
    },
  };
  /** Exécutions enregistrées et pas encore marquées : celles qu'un veilleur rejouerait. */
  const executionsDemandees = () => [...executions].filter(([, x]) => x.statut === "demandee").map(([k, x]) => ({ cle: k.slice(k.indexOf("|") + 1), type: x.type, requete: x.requete }));
  return { base, missions, etapes, journal, compteurs, executionsDemandees };
}

function hoteDouble() {
  const issues = new Map<string, Record<string, unknown>>();
  const creations: Array<Record<string, unknown>> = [];
  const majs: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const reveils: Array<{ issueId: string; options: Record<string, unknown> }> = [];
  const commentaires: Array<{ issueId: string; body: string }> = [];
  const agentsResolus: string[] = [];
  const panne = { creationNumero: null as number | null, majSi: null as null | ((id: string, patch: Record<string, unknown>) => boolean), reveil: false };
  let horlogeIssues = 0;
  const hote = {
    issues: {
      async createComment(issueId: string, body: string) {
        commentaires.push({ issueId, body });
        return {};
      },
      async listComments(issueId: string) {
        return commentaires.filter((c) => c.issueId === issueId).map((c) => ({ body: c.body }));
      },
      async create(i: Record<string, unknown>) {
        if (panne.creationNumero === creations.length + 1) {
          panne.creationNumero = null;
          throw new Error("panne simulée pendant la création");
        }
        const id = `issue-${issues.size + 1}`;
        creations.push(i);
        issues.set(id, { id, ...i });
        return { id };
      },
      /** Comme `issues.list` du vrai hôte : `executionPolicy` et `executionState` rendus à null. */
      async list(f: { originId?: string }) {
        return [...issues.values()].filter((i) => i.originId === f.originId).map((i) => ({ ...i, executionPolicy: null, executionState: null }));
      },
      /** Comme `issues.get` : l'objet complet (politique et état natifs compris), null hors entreprise. */
      async get(id: string, companyId: string) {
        const i = issues.get(id);
        return i && i.companyId === companyId ? { executionPolicy: null, executionState: null, ...i } : null;
      },
      async update(id: string, patch: Record<string, unknown>) {
        if (panne.majSi?.(id, patch)) {
          panne.majSi = null;
          throw new Error("panne simulée pendant la mise à jour");
        }
        majs.push({ id, patch });
        Object.assign(issues.get(id) ?? {}, patch, { updatedAt: new Date(Date.UTC(2026, 10, 8, 10, 0, ++horlogeIssues)).toISOString() });
        return {};
      },
      /** Refus du vrai hôte (plugin-host-services.ts, requestWakeup) : sans assigné, statut non réveillable, bloqueur non terminé. */
      async requestWakeup(issueId: string, _companyId: string, options: Record<string, unknown>) {
        const tache = issues.get(issueId);
        if (!tache?.assigneeAgentId) throw new Error("Issue has no assigned agent to wake");
        if (["backlog", "done", "cancelled"].includes(String(tache.status))) throw new Error(`Issue is not wakeable in status: ${String(tache.status)}`);
        const bloqueurs = (tache.blockedByIssueIds as string[] | undefined) ?? [];
        if (bloqueurs.some((b) => issues.get(b)?.status !== "done")) throw new Error("Issue is blocked by unresolved blockers");
        if (panne.reveil) {
          panne.reveil = false;
          throw new Error("panne simulée pendant le réveil");
        }
        reveils.push({ issueId, options });
        return {};
      },
    },
    async resoudreAgent(_companyId: string, role: string) {
      agentsResolus.push(role);
      return `agent-${role}`;
    },
  };
  return { hote, issues, creations, majs, reveils, commentaires, agentsResolus, panne };
}

/** Double de la pose de porte : une porte par tâche (le vrai `creerPorte` rend faux au rejeu). */
function porteDouble() {
  const portes: Array<{ issueId: string; campagneId: string; exigencesCiblees: string[] }> = [];
  const politiques: string[] = [];
  const panne = { majPolitique: false };
  const porte = {
    async creerPorte(p: { issueId: string; campagneId: string; exigencesCiblees: string[] }) {
      if (portes.some((x) => x.issueId === p.issueId)) return false;
      portes.push({ issueId: p.issueId, campagneId: p.campagneId, exigencesCiblees: p.exigencesCiblees });
      return true;
    },
    async majPolitique(issueId: string) {
      if (panne.majPolitique) {
        panne.majPolitique = false;
        throw new Error("panne passagère de l'hôte");
      }
      politiques.push(issueId);
      return {};
    },
    async conformiteImposee() {
      return false;
    },
    async exigences() {
      return ["EXI-1", "EXI-2"];
    },
    async resolveur() {
      return <T>(v: T) => v;
    },
  };
  return { porte, portes, politiques, panneePorte: panne };
}

async function monter(opts: { contratVersion?: number; entrees?: boolean; gabarit?: Gabarit; campagneId?: string | null } = {}) {
  const m = baseMemoire();
  const h = hoteDouble();
  const p = porteDouble();
  const gabarit = opts.gabarit ?? GABARIT_4;
  /** Révision courante du document livrable, par tâche. */
  const docs = new Map<string, string>();
  const executeur = creerExecuteur({ hote: h.hote as never, base: m.base as unknown as DepsExecuteur["base"], porte: p.porte as never, horloge: () => INSTANT, revisionLivrable: async (_c, issueId) => docs.get(issueId) ?? null, chargerGabarit: () => gabarit });
  const missionId = await m.base.creerMission({ companyId: SOC, contratVersion: opts.contratVersion ?? 1, campagneId: opts.campagneId ?? null });
  if (opts.entrees !== false) for (const rang of [1, 2, 3, 4]) await m.base.creerEtape({ companyId: SOC, missionId, rang, role: "contenus", etat: "en_attente", entree: ENTREES });
  return { ...m, ...h, ...p, executeur, missionId, docs };
}

/** Fait échouer une seule fois l'appel `nom` de la base quand `quand` est vrai (panne simulée entre deux écritures). */
function panneUneFois(base: object, nom: string, quand: (arg: { cle?: string }) => boolean) {
  const b = base as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const origine = b[nom]!.bind(base);
  let faite = false;
  b[nom] = async (...a: unknown[]) => {
    if (!faite && quand(a[0] as { cle?: string })) {
      faite = true;
      throw new Error("panne simulée de la base");
    }
    return origine(...a);
  };
}

const resultat = (missionId: string, rang: number, sortie: unknown = SORTIE) => ({ missionId, rang, tentative: 1, sortie });

describe("exécuteur de missions", () => {
  it("crée en un appel les tâches de toutes les étapes et réveille directement l'agent de la première, sans le coordinateur", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    // Le critère 9 de #49 (écritures du modèle) se mesure avec l'outil typé de #50 : ici, seulement les appels du moteur à l'hôte.
    expect({ creationsHote: t.creations.length, reveilsHote: t.reveils.length }).toEqual({ creationsHote: 4, reveilsHote: 1 });
    const [i1, i2, i3, i4] = [...t.issues.keys()];
    expect(t.creations.map((c) => c.status)).toEqual(["backlog", "backlog", "backlog", "backlog"]);
    expect(t.creations.map((c) => c.blockedByIssueIds)).toEqual([[], [i1], [i2], [i3]]);
    expect(t.creations.map((c) => c.originId)).toEqual([1, 2, 3, 4].map((r) => `mission:${t.missionId}:${r}`));
    expect(t.creations[0]!.originKind).toBe(ORIGINE_ETAPE);
    expect(t.creations[3]!.assigneeAgentId).toBe("agent-contenus");
    expect(i4).toBeDefined();
    expect(t.reveils[0]!.issueId).toBe(i1);
    expect(t.agentsResolus).not.toContain("coordinateur");
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
  });

  it("avance au résultat valide : étape terminée, suivante débloquée puis réveillée", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const [i1, i2] = [...t.issues.keys()];
    const r = await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    expect(r.statut).toBe("accepte");
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
    expect(t.majs).toContainEqual({ id: i1, patch: { status: "done" } });
    expect(t.majs).toContainEqual({ id: i2, patch: { status: "todo" } });
    expect(t.reveils.map((x) => x.issueId)).toEqual([i1, i2]);
  });

  it("refuse une sortie hors contrat sans réveil, l'état reste en_cours", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const r = await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1, { textes: "pas une liste" }));
    expect(r.statut).toBe("refuse");
    expect(r.erreurs.length).toBeGreaterThan(0);
    expect(t.reveils).toHaveLength(1);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
  });

  describe("plafond de refus identiques (#84)", () => {
    const HORS = { textes: "pas une liste" };
    const AUTRE = { briefsVisuels: "pas une liste" };
    const deposer = (t: Awaited<ReturnType<typeof monter>>, sortie: unknown, n: number, cle?: (i: number) => string | undefined) =>
      (async () => {
        let dernier;
        for (let i = 0; i < n; i++) dernier = await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1, sortie), ...(cle?.(i) ? { cleEvenement: cle(i) } : {}) });
        return dernier!;
      })();

    it("REFUS_IDENTIQUES_MAX refus hors contrat identiques donnent blocage et un seul réveil du coordinateur", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      const [i1] = [...t.issues.keys()];
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX - 1, (i) => `run-${i}`);
      expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
      expect(t.reveils).toHaveLength(1);
      const r = await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1, HORS), cleEvenement: "run-plafond" });
      expect(r.statut).toBe("refuse");
      expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
      expect(t.journal.find((j) => j.type === "moteur.blocage")?.donnees).toMatchObject({ evenement: "plafond_atteint", rang: 1 });
      expect(t.majs).toContainEqual({ id: i1, patch: { status: "blocked", assigneeAgentId: "agent-coordinateur" } });
      expect(t.reveils).toHaveLength(2);
      expect(t.reveils[1]!.options.reason).toBe("moteur_blocage");
    });

    it("un dépôt après le plafond est ignoré, sans réveil", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX, (i) => `run-${i}`);
      const reveils = t.reveils.length;
      const r = await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1, HORS), cleEvenement: "run-apres" });
      expect(r.statut).toBe("ignore");
      expect(t.reveils).toHaveLength(reveils);
    });

    it("un même dépôt redélivré (même clé d'événement) ne compte qu'une fois", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX, () => "run-unique");
      expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    });

    it("le même dépôt livré deux fois au 4e refus ne fait pas atteindre le plafond", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX - 2, (i) => `run-${i}`);
      await deposer(t, HORS, 2, () => "run-doublon");
      expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
      expect(t.reveils).toHaveLength(1);
      expect(t.journal.some((j) => j.type === "moteur.blocage")).toBe(false);
    });

    it("après des changements demandés par le relecteur, le compte des refus identiques repart de zéro", async () => {
      const t = await monter({ gabarit: GABARIT_PORTE_1, campagneId: "campagne-1" });
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX - 1, (i) => `run-${i}`);
      await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1), cleEvenement: "run-ok" });
      expect(t.missions.get(t.missionId)!.etat).toBe("en_revue");
      await t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 1, tentative: 1, accepte: false, runId: "run-r1" });
      expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
      await deposer(t, HORS, 1, () => "run-m1-0");
      expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX - 1, (i) => `run-m1-${i + 1}`);
      expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    });

    it("des refus aux erreurs différentes ne s'additionnent pas", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX - 1);
      await deposer(t, AUTRE, REFUS_IDENTIQUES_MAX - 1);
      expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    });

    it("après la reprise de l'arbitrage, le compteur repart de zéro", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX);
      expect(await t.executeur.sortirDeBlocage(SOC, t.missionId)).toBe(true);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX - 1);
      expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    });

    it("la reprise après le plafond ne réveille personne de plus", async () => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      await deposer(t, HORS, REFUS_IDENTIQUES_MAX);
      const reveils = t.reveils.length;
      await t.executeur.reprendre(SOC);
      expect(t.reveils).toHaveLength(reveils);
    });
  });

  it("une entrée manquante mène à attente_information, sans aucun réveil", async () => {
    const t = await monter({ entrees: false });
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
    expect(t.reveils).toHaveLength(0);
  });

  it("un même événement rejoué ne produit aucune deuxième transition ni réveil", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    const avant = { transitions: t.compteurs.transitions, reveils: t.reveils.length, etat: { ...t.missions.get(t.missionId) } };
    const r = await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    expect(r.statut).toBe("ignore");
    expect({ transitions: t.compteurs.transitions, reveils: t.reveils.length, etat: { ...t.missions.get(t.missionId) } }).toEqual(avant);
  });

  it("la dernière étape valide clôt la mission et la tâche", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    for (const rang of [1, 2, 3, 4]) await t.executeur.recevoirResultat(SOC, resultat(t.missionId, rang));
    expect(t.missions.get(t.missionId)!.etat).toBe("cloturee");
    expect(t.reveils).toHaveLength(4);
    expect(t.agentsResolus).not.toContain("coordinateur");
  });

  it("ne réveille le coordinateur qu'à l'entrée de blocage", async () => {
    const t = await monter({ contratVersion: 99 });
    await t.executeur.reprendre(SOC);
    const [i1] = [...t.issues.keys()];
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.reveils).toHaveLength(1);
    expect(t.reveils[0]!.issueId).toBe(i1);
    expect(t.majs).toContainEqual({ id: i1, patch: { status: "blocked", assigneeAgentId: "agent-coordinateur" } });
    await t.executeur.reprendre(SOC);
    expect(t.reveils).toHaveLength(1);
  });

  it("un blocage avant la porte réécrit la tâche et y dépose la consigne une seule fois", async () => {
    const t = await monter({ contratVersion: 99 });
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    const [i1] = [...t.issues.keys()];
    expect(t.majs.filter((x) => x.patch.status === "blocked")).toHaveLength(1);
    expect(t.commentaires).toHaveLength(1);
    expect(t.commentaires[0]!.issueId).toBe(i1);
    expect(t.commentaires[0]!.body).toContain(t.missionId);
    expect(t.commentaires[0]!.body).toContain("contrat_invalide");
    expect(t.commentaires[0]!.body).toContain("mission_etat");
    expect(t.creations.filter((c) => String(c.originId).endsWith(":arbitrage"))).toHaveLength(0);
  });

  it("refuse à la reprise un contrat d'une autre version : blocage, aucun réveil de l'agent de l'étape", async () => {
    const t = await monter({ contratVersion: 2 });
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.reveils.every((r) => t.issues.get(r.issueId)!.assigneeAgentId === "agent-coordinateur")).toBe(true);
  });

  it("reprend après un arrêt entre deux créations, sans doublon ni deuxième réveil", async () => {
    const t = await monter();
    t.panne.creationNumero = 3;
    await expect(t.executeur.demarrerMission(SOC, t.missionId)).rejects.toThrow("panne simulée");
    expect(t.issues.size).toBe(2);
    await t.executeur.reprendre(SOC);
    expect(t.issues.size).toBe(4);
    expect(new Set(t.creations.map((c) => c.originId)).size).toBe(4);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
    expect(t.reveils).toHaveLength(1);
    await t.executeur.reprendre(SOC);
    expect({ issues: t.issues.size, reveils: t.reveils.length }).toEqual({ issues: 4, reveils: 1 });
  });

  it("rattrape une sortie enregistrée dont la transition s'est perdue", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const [etape1] = await t.base.lireEtapes(SOC, t.missionId);
    await t.base.majEtape(SOC, etape1!.id, { sortie: SORTIE, etat: "terminee" });
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
    expect(t.reveils).toHaveLength(2);
  });

  it("un done natif sans sortie valide ramène la tâche en in_progress et journalise", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const [i1] = [...t.issues.keys()];
    await t.executeur.surDoneNatif(SOC, i1!);
    expect(t.majs).toContainEqual({ id: i1, patch: { status: "in_progress" } });
    expect(t.journal.find((j) => j.type === "moteur.done_sans_sortie")?.donnees).toMatchObject({ le: INSTANT.toISOString() });
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
  });
  it("A : agentParSlug rend l'agent actif du slug, null pour aucun ou plusieurs", () => {
    const a = (id: string, slug: string, status = "idle") => ({ id, status, metadata: { atelier: { slug } } });
    expect(agentParSlug([], "contenus")).toBeNull();
    expect(agentParSlug([a("a1", "contenus"), a("a2", "coordinateur")], "contenus")).toBe("a1");
    expect(agentParSlug([a("a1", "contenus"), a("a2", "contenus")], "contenus")).toBeNull();
    expect(agentParSlug([a("a1", "contenus", "terminated"), a("a2", "contenus")], "contenus")).toBe("a2");
    expect(agentParSlug([{ id: "a3", status: "idle", metadata: null }], "contenus")).toBeNull();
  });

  it("A : creerResolveur remplace {{agent:slug}} et {{humain:responsable}}, et refuse un agent absent", () => {
    const agents = [{ id: "a1", status: "idle", metadata: { atelier: { slug: "revue-metier" } } }];
    const r = creerResolveur(agents, "humain-1");
    expect(r({ x: "{{agent:revue-metier}}", y: ["{{humain:responsable}}"] })).toEqual({ x: "a1", y: ["humain-1"] });
    expect(() => r("{{agent:absent}}")).toThrow("absent");
  });

  it("B : pose la porte d'office sur la tâche de la dernière étape, une seule fois, même au rejeu", async () => {
    const t = await monter({ gabarit: { ...GABARIT_4, porte: true }, campagneId: "campagne-1" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    const derniere = [...t.issues.keys()][3];
    expect(t.portes).toEqual([{ issueId: derniere, campagneId: "campagne-1", exigencesCiblees: ["EXI-1", "EXI-2"] }]);
    expect(t.politiques).toEqual([derniere]);
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    expect(t.portes).toHaveLength(1);
    expect(t.politiques).toHaveLength(1);
  });

  it("B : un gabarit sans porte ne pose rien", async () => {
    const t = await monter({ campagneId: "campagne-1" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.portes).toHaveLength(0);
  });

  it("B : sans campagne la porte est refusée, journalisée, et la mission part en blocage sans réveiller d'agent d'étape", async () => {
    const t = await monter({ gabarit: { ...GABARIT_4, porte: true }, campagneId: null });
    await t.executeur.demarrerMission(SOC, t.missionId);
    expect(t.missions.get(t.missionId)!.etat).toBe("blocage");
    expect(t.portes).toHaveLength(0);
    expect(t.journal.find((j) => j.type === "moteur.porte_refusee")?.donnees).toMatchObject({ motif: expect.stringContaining("campagne") });
    expect(t.reveils.every((r) => t.issues.get(r.issueId)!.assigneeAgentId === "agent-coordinateur")).toBe(true);
  });

  it("D : un done natif sur une mission close, annulée ou en échec ne change rien", async () => {
    for (const etat of ["cloturee", "annulee", "echec"] as const) {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      t.missions.get(t.missionId)!.etat = etat;
      const [i1] = [...t.issues.keys()];
      const avant = t.majs.length;
      await t.executeur.surDoneNatif(SOC, i1!);
      expect({ etat, majs: t.majs.length - avant, journal: t.journal.some((j) => j.type === "moteur.done_sans_sortie") }).toEqual({ etat, majs: 0, journal: false });
    }
  });

  it("E : deux reprises d'une mission en blocage ne réécrivent la tâche qu'une fois", async () => {
    const t = await monter({ contratVersion: 99 });
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    expect(t.majs.filter((x) => x.patch.status === "blocked")).toHaveLength(1);
    expect(t.reveils).toHaveLength(1);
  });

  it("F : reprise d'une mission prête dont l'étape est terminée : la tâche passe à done avant le réveil de la suivante", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const [i1, i2] = [...t.issues.keys()];
    const [etape1] = await t.base.lireEtapes(SOC, t.missionId);
    await t.base.majEtape(SOC, etape1!.id, { sortie: SORTIE, etat: "terminee" });
    t.missions.get(t.missionId)!.etat = "prete";
    await t.executeur.reprendre(SOC);
    expect(t.issues.get(i1!)!.status).toBe("done");
    expect(t.reveils.map((x) => x.issueId)).toEqual([i1, i2]);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
  });

  it("2 : panne sur la mise à todo juste après demarrage : la reprise réveille une seule fois et la tâche n'est plus en backlog", async () => {
    const t = await monter();
    t.panne.majSi = (_id, patch) => patch.status === "todo";
    await expect(t.executeur.demarrerMission(SOC, t.missionId)).rejects.toThrow("panne simulée");
    await t.executeur.reprendre(SOC);
    const [i1] = [...t.issues.keys()];
    expect(t.issues.get(i1!)!.status).toBe("todo");
    expect(t.reveils.map((x) => x.issueId)).toEqual([i1]);
    expect((await t.base.lireEtapes(SOC, t.missionId))[0]!.etat).toBe("en_cours");
    await t.executeur.reprendre(SOC);
    expect({ reveils: t.reveils.length, todo: t.majs.filter((x) => x.patch.status === "todo").length }).toEqual({ reveils: 1, todo: 1 });
  });

  it("3 : panne entre le changement de rang et le démarrage : la reprise relance l'étape sans doublon", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    panneUneFois(t.base, "enregistrerExecution", (e) => Boolean(e.cle?.includes(":2:1:demarrage")));
    await expect(t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1))).rejects.toThrow("panne simulée");
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "prete", rangCourant: 2 });
    await t.executeur.reprendre(SOC);
    const [i1, i2] = [...t.issues.keys()];
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 2 });
    expect(t.reveils.map((x) => x.issueId)).toEqual([i1, i2]);
    await t.executeur.reprendre(SOC);
    expect(t.reveils).toHaveLength(2);
  });

  it("4 : clôture, la tâche passe à done avant l'événement cloture ; une panne à chaque fenêtre est rattrapée par la reprise", async () => {
    const dernier = async (panne: (t: Awaited<ReturnType<typeof monter>>) => void) => {
      const t = await monter();
      await t.executeur.demarrerMission(SOC, t.missionId);
      for (const rang of [1, 2, 3]) await t.executeur.recevoirResultat(SOC, resultat(t.missionId, rang));
      panne(t);
      await expect(t.executeur.recevoirResultat(SOC, resultat(t.missionId, 4))).rejects.toThrow("panne simulée");
      return t;
    };
    const fenetreDone = await dernier((t) => { t.panne.majSi = (_id, patch) => patch.status === "done"; });
    expect(fenetreDone.missions.get(fenetreDone.missionId)!.etat).toBe("resultat_confirme");
    await fenetreDone.executeur.reprendre(SOC);
    expect(fenetreDone.missions.get(fenetreDone.missionId)!.etat).toBe("cloturee");
    expect([...fenetreDone.issues.values()][3]!.status).toBe("done");
    const fenetreCloture = await dernier((t) => panneUneFois(t.base, "enregistrerExecution", (e) => Boolean(e.cle?.endsWith(":4:1:cloture"))));
    expect([...fenetreCloture.issues.values()][3]!.status).toBe("done");
    expect(fenetreCloture.missions.get(fenetreCloture.missionId)!.etat).toBe("resultat_confirme");
    await fenetreCloture.executeur.reprendre(SOC);
    await fenetreCloture.executeur.reprendre(SOC);
    expect(fenetreCloture.missions.get(fenetreCloture.missionId)!.etat).toBe("cloturee");
    expect(fenetreCloture.reveils).toHaveLength(4);
  });

  it("4 : panne à la mise sous attente d'information : la reprise réapplique blocked et l'état de l'étape, sans réveil", async () => {
    const t = await monter({ entrees: false });
    t.panne.majSi = (_id, patch) => patch.status === "blocked";
    await expect(t.executeur.demarrerMission(SOC, t.missionId)).rejects.toThrow("panne simulée");
    await t.executeur.reprendre(SOC);
    const [i1] = [...t.issues.keys()];
    expect(t.issues.get(i1!)!.status).toBe("blocked");
    expect((await t.base.lireEtapes(SOC, t.missionId))[0]!.etat).toBe("attente_information");
    await t.executeur.reprendre(SOC);
    expect({ reveils: t.reveils.length, blocked: t.majs.filter((x) => x.patch.status === "blocked").length, etat: t.missions.get(t.missionId)!.etat }).toEqual({ reveils: 0, blocked: 1, etat: "attente_information" });
  });

  it("5 : le done d'un tiers restaure le statut projeté selon l'état de la mission et de l'étape", async () => {
    const statutApresDone = async (t: Awaited<ReturnType<typeof monter>>, issueId: string) => {
      await t.executeur.surDoneNatif(SOC, issueId);
      return t.majs.filter((x) => x.id === issueId).at(-1)?.patch.status;
    };
    const futur = await monter();
    await futur.executeur.demarrerMission(SOC, futur.missionId);
    expect(await statutApresDone(futur, [...futur.issues.keys()][2]!)).toBe("backlog");
    const blocage = await monter({ contratVersion: 99 });
    await blocage.executeur.reprendre(SOC);
    expect(await statutApresDone(blocage, [...blocage.issues.keys()][0]!)).toBe("blocked");
    const attente = await monter({ entrees: false });
    await attente.executeur.demarrerMission(SOC, attente.missionId);
    expect(await statutApresDone(attente, [...attente.issues.keys()][0]!)).toBe("blocked");
    const courante = await monter();
    await courante.executeur.demarrerMission(SOC, courante.missionId);
    expect(await statutApresDone(courante, [...courante.issues.keys()][0]!)).toBe("in_progress");
  });

  it("5 : sans effet pour une étape terminée avec sortie ou une tâche inconnue : aucune mise à jour, aucun journal", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    const avant = { majs: t.majs.length, journal: t.journal.length };
    await t.executeur.surDoneNatif(SOC, [...t.issues.keys()][0]!);
    await t.executeur.surDoneNatif(SOC, "issue-inconnue");
    expect({ majs: t.majs.length, journal: t.journal.length }).toEqual(avant);
  });

  it("6 : un done posé pendant l'arrêt est rouvert et réveillé une fois à la reprise, pas deux", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const [i1] = [...t.issues.keys()];
    Object.assign(t.issues.get(i1!)!, { status: "done", updatedAt: "2026-11-08T10:05:00.000Z" });
    await t.executeur.reprendre(SOC);
    expect(t.issues.get(i1!)!.status).toBe("in_progress");
    expect(t.reveils.map((x) => x.issueId)).toEqual([i1, i1]);
    expect(t.journal.some((j) => j.type === "moteur.done_sans_sortie")).toBe(true);
    const avant = { majs: t.majs.length, reveils: t.reveils.length };
    await t.executeur.reprendre(SOC);
    expect({ majs: t.majs.length, reveils: t.reveils.length }).toEqual(avant);
  });

  it("7 : deux reprises concurrentes d'une mission sans tâche créent chaque tâche une seule fois", async () => {
    const t = await monter();
    await Promise.all([t.executeur.reprendre(SOC), t.executeur.reprendre(SOC)]);
    expect(t.creations).toHaveLength(4);
    expect(new Set(t.creations.map((c) => c.originId)).size).toBe(4);
    expect(t.reveils).toHaveLength(1);
  });

  it("8 : une panne passagère à la pose de porte ne met pas la mission en blocage, la passe suivante pose la porte", async () => {
    const t = await monter({ gabarit: { ...GABARIT_4, porte: true }, campagneId: "campagne-1" });
    t.panneePorte.majPolitique = true;
    await expect(t.executeur.demarrerMission(SOC, t.missionId)).rejects.toThrow("panne passagère");
    expect(t.missions.get(t.missionId)!.etat).toBe("prete");
    expect(t.journal.some((j) => j.type === "moteur.porte_refusee")).toBe(false);
    await t.executeur.reprendre(SOC);
    expect(t.portes).toHaveLength(1);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
  });

  it("9 : trois passes en échec identique ne laissent qu'une ligne de journal", async () => {
    const t = await monter();
    t.hote.resoudreAgent = (async () => null) as never;
    for (let i = 0; i < 3; i++) await t.executeur.reprendre(SOC);
    expect(t.journal.filter((j) => j.type === "moteur.reprise_echec")).toHaveLength(1);
  });

  it("9 : un blocage sans coordinateur n'est journalisé qu'une fois malgré les reprises", async () => {
    const t = await monter({ contratVersion: 99 });
    t.hote.resoudreAgent = (async (_c: string, role: string) => (role === "coordinateur" ? null : `agent-${role}`)) as never;
    for (let i = 0; i < 3; i++) await t.executeur.reprendre(SOC);
    expect(t.journal.filter((j) => j.type === "moteur.blocage_sans_reveil")).toHaveLength(1);
  });

  it("10 : sous porte, la dernière sortie valide met la mission en revue sans clore ni passer la tâche à done", async () => {
    const t = await monter({ gabarit: { ...GABARIT_4, porte: true, etapes: [GABARIT_4.etapes[0]!] }, campagneId: "campagne-1" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    const r = await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    expect(r.statut).toBe("accepte");
    expect(t.missions.get(t.missionId)!.etat).toBe("en_revue");
    expect(t.majs.some((x) => x.patch.status === "done")).toBe(false);
    expect(await t.base.lireExecution(SOC, `${t.missionId}:1:1:cloture`)).toBeNull();
    const avant = { majs: t.majs.length, reveils: t.reveils.length, transitions: t.compteurs.transitions, journal: t.journal.length };
    await t.executeur.reprendre(SOC);
    expect({ majs: t.majs.length, reveils: t.reveils.length, transitions: t.compteurs.transitions, journal: t.journal.length }).toEqual(avant);
  });
});

/** Une seule étape sous porte, menée jusqu'à `attente_autorisation` (sortie déposée sur la révision `rev-1`, porte franchie par un relecteur). */
const GABARIT_PORTE_1: Gabarit = { ...GABARIT_4, porte: true, etapes: [GABARIT_4.etapes[0]!] };
async function jusquAutorisation() {
  const t = await monter({ gabarit: GABARIT_PORTE_1, campagneId: "campagne-1" });
  await t.executeur.demarrerMission(SOC, t.missionId);
  const issue = [...t.issues.keys()][0]!;
  t.docs.set(issue, "rev-1");
  await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1), revisionLivrable: "rev-1" });
  await t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 1, tentative: 1, accepte: true, runId: "run-r1" });
  expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
  /** État natif de l'hôte après une décision humaine (visible par `issues.get`, jamais par `issues.list`). */
  const natif = (patch: Record<string, unknown>) => void Object.assign(t.issues.get(issue)!, patch);
  const approuver = () => natif({ status: "done", executionPolicy: { stages: [{ id: "etape-approbation", type: "approval" }] }, executionState: { completedStageIds: ["etape-approbation"] } });
  return { ...t, issue, natif, approuver };
}

describe("approbation, changements demandés et refus de porte", () => {
  it("1 : l'approbation se lit par issues.get (list rend l'état natif à null) : la tâche done approuvée clôt la mission sans réveil", async () => {
    const t = await jusquAutorisation();
    t.approuver();
    expect(((await t.hote.issues.list({ originId: `mission:${t.missionId}:1` })) as Array<{ executionState: unknown }>)[0]!.executionState).toBeNull();
    const reveils = t.reveils.length;
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("cloturee");
    expect(t.issues.get(t.issue)!.status).toBe("done");
    expect(t.reveils).toHaveLength(reveils);
  });

  it("1 : un done sans approbation ne clôt pas, la tâche retrouve in_review et le journal le dit ; la reprise clôt une approbation survenue pendant l'arrêt", async () => {
    const t = await jusquAutorisation();
    t.natif({ status: "done", executionPolicy: { stages: [{ id: "etape-approbation", type: "approval" }] }, executionState: { completedStageIds: [] } });
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
    expect(t.issues.get(t.issue)!.status).toBe("in_review");
    expect(t.journal.some((j) => j.type === "moteur.done_sans_sortie")).toBe(true);
    t.approuver();
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)!.etat).toBe("cloturee");
  });

  it("4 : approuvée sur une autre révision que celle relue, la mission n'est pas close : tâche rouverte et journal moteur.revision_changee", async () => {
    const t = await jusquAutorisation();
    expect(t.etapes[0]!.revisionLivrable).toBe("rev-1");
    t.docs.set(t.issue, "rev-2");
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
    expect(t.issues.get(t.issue)!.status).toBe("in_review");
    expect(t.journal.filter((j) => j.type === "moteur.revision_changee")).toHaveLength(1);
    expect(await t.base.lireExecution(SOC, `${t.missionId}:1:1:approuvee_sans_effet`)).toBeNull();
  });

  it("5 : porte refusée au lancement : journal, erreur remontée, mission toujours en attente, clé de blocage non consommée ; la relance corrigée réveille le rédacteur une seule fois", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_1, campagneId: "campagne-1" });
    t.missions.get(t.missionId)!.etat = "attente_information";
    let refus = true;
    t.porte.resolveur = (async () => {
      if (refus) throw new PorteRefusee("Humain responsable inconnu : renseignez humainDestinataire.");
      return <T>(v: T) => v;
    }) as never;
    await expect(t.executeur.lancerMission(SOC, t.missionId, ENTREES)).rejects.toBeInstanceOf(PorteRefusee);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_information");
    expect(t.journal.find((j) => j.type === "moteur.porte_refusee")?.donnees).toMatchObject({ motif: expect.stringContaining("humainDestinataire") });
    expect(await t.base.lireExecution(SOC, `${t.missionId}:1:1:contrat_invalide`)).toBeNull();
    expect(t.reveils).toHaveLength(0);
    refus = false;
    expect(await t.executeur.lancerMission(SOC, t.missionId, ENTREES)).toBe(true);
    expect(t.missions.get(t.missionId)).toMatchObject({ etat: "en_cours", rangCourant: 1 });
    expect(t.reveils.map((r) => t.issues.get(r.issueId)!.assigneeAgentId)).toEqual(["agent-contenus"]);
    expect(await t.executeur.lancerMission(SOC, t.missionId, ENTREES)).toBe(false);
    expect(t.reveils).toHaveLength(1);
    expect(t.creations).toHaveLength(1);
  });

  it("6 : changements demandés par un relecteur : la tâche repasse en cours et le rédacteur est réveillé une fois ; le redépôt est accepté", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_1, campagneId: "campagne-1" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    const issue = [...t.issues.keys()][0]!;
    await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    expect(t.missions.get(t.missionId)!.etat).toBe("en_revue");
    const reveils = t.reveils.length;
    const verdict = { missionId: t.missionId, rang: 1, tentative: 1, accepte: false, runId: "run-r1" };
    expect((await t.executeur.deposerVerdict(SOC, verdict)).statut).toBe("applique");
    expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    expect(t.issues.get(issue)!.status).toBe("in_progress");
    expect(t.reveils).toHaveLength(reveils + 1);
    expect(t.reveils.at(-1)).toMatchObject({ issueId: issue, options: { reason: "moteur_correction", idempotencyKey: `${t.missionId}:1:1:reveil:correction:run-r1` } });
    expect((await t.executeur.deposerVerdict(SOC, verdict)).statut).toBe("rejeu");
    expect(t.reveils).toHaveLength(reveils + 1);
    expect((await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1), cleEvenement: "run-b" })).statut).toBe("accepte");
    expect(t.missions.get(t.missionId)!.etat).toBe("en_revue");
    expect((await t.executeur.deposerVerdict(SOC, { ...verdict, accepte: true, runId: "run-r2" })).statut).toBe("applique");
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
  });

  it("arrêt avant la mise à jour, puis arrêt avant le réveil : la reprise réveille le rédacteur une seule fois, tâche en cours", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_1, campagneId: "campagne-1" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    const issue = [...t.issues.keys()][0]!;
    await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    const reveils = t.reveils.length;
    t.panne.majSi = (_id, patch) => patch.status === "in_progress";
    await expect(t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 1, tentative: 1, accepte: false, runId: "run-r1" })).rejects.toThrow("panne simulée");
    expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    expect(t.issues.get(issue)!.status).not.toBe("in_progress");
    expect(t.reveils).toHaveLength(reveils);
    // première reprise : la tâche repasse en cours, mais le réveil tombe en panne
    t.panne.reveil = true;
    await t.executeur.reprendre(SOC);
    expect(t.issues.get(issue)!.status).toBe("in_progress");
    expect(t.reveils).toHaveLength(reveils);
    // deuxième reprise : le réveil part, avec la clé du verdict ; la troisième ne fait plus rien
    await t.executeur.reprendre(SOC);
    await t.executeur.reprendre(SOC);
    expect(t.reveils.slice(reveils)).toEqual([{ issueId: issue, options: expect.objectContaining({ reason: "moteur_correction", idempotencyKey: `${t.missionId}:1:1:reveil:correction:run-r1` }) }]);
    expect(t.issues.get(issue)!.status).toBe("in_progress");
    expect(t.executionsDemandees().filter((x) => x.type === "reveil")).toEqual([]);
  });

  it("deux corrections successives réveillent deux fois", async () => {
    const t = await monter({ gabarit: GABARIT_PORTE_1, campagneId: "campagne-1" });
    await t.executeur.demarrerMission(SOC, t.missionId);
    const issue = [...t.issues.keys()][0]!;
    await t.executeur.recevoirResultat(SOC, resultat(t.missionId, 1));
    await t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 1, tentative: 1, accepte: false, runId: "run-r1" });
    await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1), cleEvenement: "run-b" });
    await t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 1, tentative: 1, accepte: false, runId: "run-r2" });
    await t.executeur.reprendre(SOC);
    const corrections = t.reveils.filter((r) => r.options.reason === "moteur_correction");
    expect(corrections.map((r) => [r.issueId, r.options.idempotencyKey])).toEqual([
      [issue, `${t.missionId}:1:1:reveil:correction:run-r1`],
      [issue, `${t.missionId}:1:1:reveil:correction:run-r2`],
    ]);
  });

  it("la description d'une tâche d'étape donne la mission, les champs de sortie et livrable_deposer", async () => {
    const t = await monter();
    await t.executeur.demarrerMission(SOC, t.missionId);
    for (const c of t.creations) {
      const d = String(c.description);
      expect(d).toContain("mandat");
      expect(d).toContain(`Mission : ${t.missionId}`);
      for (const champ of ["textes", "briefsVisuels", "sources"]) expect(d).toContain(champ);
      expect(d).toContain("livrable_deposer");
      expect(d).toContain("mission_etat");
    }
  });

  it("la consigne d'arbitrage cite arbitrage_deposer, pas decision_demander, et jamais le motif", async () => {
    const t = await monter({ contratVersion: 99 });
    await t.executeur.reprendre(SOC);
    const consigne = t.commentaires[0]!.body;
    expect(consigne).toContain("arbitrage_deposer");
    expect(consigne).toContain("request_confirmation");
    expect(consigne).not.toContain("decision_demander");
    expect(consigne).not.toContain("motif");
  });

  it("7 : refus humain à l'approbation : la mission repart en cours, sans réveil (l'hôte rend la tâche à son assigné) ; un nouveau dépôt passe, le rejeu et l'ancien refus relu n'ont aucun effet", async () => {
    const t = await jusquAutorisation();
    t.natif({ status: "in_progress", executionState: { status: "changes_requested", lastDecisionOutcome: "changes_requested", lastDecisionId: "decision-1", completedStageIds: [] } });
    const reveils = t.reveils.length;
    await t.executeur.surChangementsNatifs(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    expect(t.etapes[0]!.etat).toBe("en_cours");
    expect(t.journal.filter((j) => j.type === "moteur.changements_humains")).toHaveLength(1);
    expect(t.reveils).toHaveLength(reveils);
    const apres = { transitions: t.compteurs.transitions, journal: t.journal.length };
    await t.executeur.surChangementsNatifs(SOC, t.issue);
    expect({ transitions: t.compteurs.transitions, journal: t.journal.length }).toEqual(apres);
    // nouveau dépôt, relecture, porte franchie : l'état natif garde la trace du refus déjà traité
    expect((await t.executeur.recevoirResultat(SOC, { ...resultat(t.missionId, 1), cleEvenement: "run-b", revisionLivrable: "rev-1" })).statut).toBe("accepte");
    await t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 1, tentative: 1, accepte: true, runId: "run-r2" });
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
    await t.executeur.surChangementsNatifs(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
  });

  it("7 : un état natif encore en attente d'approbation, même avec une ancienne décision de changements, ne fait rien ; mission ailleurs qu'en autorisation : rien", async () => {
    const t = await jusquAutorisation();
    t.natif({ executionState: { status: "pending", lastDecisionOutcome: "changes_requested", lastDecisionId: "decision-0", completedStageIds: [] } });
    await t.executeur.surChangementsNatifs(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("attente_autorisation");
    t.natif({ executionState: { status: "changes_requested", lastDecisionOutcome: "changes_requested", lastDecisionId: "decision-1", completedStageIds: [] } });
    t.missions.get(t.missionId)!.etat = "en_revue";
    await t.executeur.surChangementsNatifs(SOC, t.issue);
    expect(t.missions.get(t.missionId)!.etat).toBe("en_revue");
  });

  it("7 : un refus humain survenu pendant l'arrêt est rattrapé à la reprise", async () => {
    const t = await jusquAutorisation();
    t.natif({ status: "in_progress", executionState: { status: "changes_requested", lastDecisionOutcome: "changes_requested", lastDecisionId: "decision-1", completedStageIds: [] } });
    await t.executeur.reprendre(SOC);
    expect(t.missions.get(t.missionId)!.etat).toBe("en_cours");
    expect(t.etapes[0]!.etat).toBe("en_cours");
  });
});

describe("réglage moteurMissions", () => {
  const schema = (manifest.instanceConfigSchema as { properties: Record<string, { type?: string; default?: unknown }> }).properties.moteurMissions;

  it("est un booléen faux par défaut dans le manifeste", () => {
    expect(schema).toMatchObject({ type: "boolean", default: false });
    expect(moteurActif(undefined)).toBe(false);
    expect(moteurActif({})).toBe(false);
    expect(moteurActif({ moteurMissions: false })).toBe(false);
    expect(moteurActif({ moteurMissions: true })).toBe(true);
  });

  it("désactivé : la reprise n'exécute rien et ne touche aucune table du moteur", async () => {
    const interdit = new Proxy({}, { get: (_cible, nom: string) => () => { throw new Error(`table du moteur touchée : ${nom}`); } }) as never;
    const executeur = creerExecuteur({ base: interdit, hote: interdit, porte: interdit, horloge: () => INSTANT, revisionLivrable: interdit });
    const entreprises = async () => [SOC];
    const logger = { info: vi.fn(), warn: vi.fn() };
    await reprendreSiActif({ entreprises, config: async () => ({ moteurMissions: false }), executeur, logger });
    await reprendreSiActif({ entreprises, config: async () => null, executeur, logger });
    expect(logger.warn).not.toHaveBeenCalled();
    await reprendreSiActif({ entreprises, config: async () => ({ moteurMissions: true }), executeur, logger });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ companyId: SOC, erreur: "table du moteur touchée : missionsActives" }));
  });
});

describe("reprise de toutes les entreprises", () => {
  it("C : reprend chaque entreprise active de la liste des entreprises, sans passer par une table du moteur", async () => {
    const reprendre = vi.fn(async () => undefined);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const config = async (id: string) => ({ moteurMissions: id !== "inactive" });
    await reprendreSiActif({ entreprises: async () => [SOC, "inactive", "autre"], config, executeur: { reprendre }, logger });
    expect(reprendre.mock.calls).toEqual([[SOC], ["autre"]]);
  });

  it("G : une liste d'entreprises en échec est journalisée, jamais une promesse rejetée", async () => {
    const reprendre = vi.fn(async () => undefined);
    const logger = { info: vi.fn(), warn: vi.fn() };
    await expect(reprendreSiActif({ entreprises: async () => { throw new Error("liste indisponible"); }, config: async () => ({ moteurMissions: true }), executeur: { reprendre }, logger })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ erreur: "liste indisponible" }));
    expect(reprendre).not.toHaveBeenCalled();
  });
});

describe("brouillon du chat dont la carte est refusée", () => {
  async function brouillon(statuts: string[], mission = "") {
    const t = await monter({ entrees: false });
    Object.assign(t.missions.get(t.missionId)!, { etat: "attente_information", issueRacineId: "discussion-1" });
    const detail = `Brouillon.\n\nMission : ${mission || t.missionId}\nDemande : un post`;
    (t.hote.issues as Record<string, unknown>).listInteractions = async () => statuts.map((status) => ({ kind: "request_confirmation", status, payload: { detailsMarkdown: detail } }));
    await t.executeur.reprendre(SOC);
    return { etat: t.missions.get(t.missionId)!.etat, journal: t.journal.filter((j) => j.type === "moteur.brouillon_refuse").length };
  }

  it("toutes ses cartes refusées : annulé une fois, journalisé", async () => {
    expect(await brouillon(["rejected"])).toEqual({ etat: "annulee", journal: 1 });
  });

  it("une carte encore en attente ou acceptée le garde (demande refaite après un refus, lancement à venir)", async () => {
    expect(await brouillon(["rejected", "pending"])).toEqual({ etat: "attente_information", journal: 0 });
    expect(await brouillon(["accepted"])).toEqual({ etat: "attente_information", journal: 0 });
  });

  it("la carte refusée d'une autre mission ne l'annule pas", async () => {
    expect(await brouillon(["rejected"], "autre-mission")).toEqual({ etat: "attente_information", journal: 0 });
  });
});
