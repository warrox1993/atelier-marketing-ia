/**
 * Banc de test des services (`creerServices`) : base de l'atelier EN MÉMOIRE (mêmes méthodes que
 * `base.ts`, mêmes règles de fraîcheur, d'idempotence et de transitions) et faux contexte de l'hôte
 * (tâches, documents, agents, configuration, secrets, journal d'activité). Une méthode de base non
 * implémentée lève une erreur explicite : un test ne peut pas passer par un chemin non simulé.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { depotDepuisJournal, type BaseAtelier } from "../src/serveur/base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SOC = "11111111-1111-4111-8111-111111111111";
export const CAMP = "22222222-2222-4222-8222-222222222222";
export const BRIEF = "33333333-3333-4333-8333-333333333333";
export const COORD = "44444444-4444-4444-8444-444444444444";
export const ISSUE = "55555555-5555-4555-8555-555555555555";
export const RELECTEUR = "66666666-6666-4666-8666-666666666666";
export const PROJET = "77777777-7777-4777-8777-777777777777";
export const PRODUCTEUR = "99999999-9999-4999-8999-999999999999";
export const PORTE_AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const REV1 = "88888888-8888-4888-8888-888888888881";
export const REV2 = "88888888-8888-4888-8888-888888888882";

export function creerBanc(o: { mode?: "demonstration" | "reel"; modeEntreprise?: "demonstration" | "reel"; config?: Record<string, unknown>; secret?: string | null } = {}) {
  let tic = 0;
  const horloge = () => new Date(Date.UTC(2026, 9, 15, 10, 0, 0, 0) + ++tic).toISOString();
  const t = {
    reglages: [] as Ligne[], campagnes: [] as Ligne[], exigences: [] as Ligne[], portes: [] as Ligne[], evaluations: [] as Ligne[], decisions: [] as Ligne[],
    diffusions: [] as Ligne[], appels: [] as Ligne[], sources: [] as Ligne[], journal: [] as Ligne[], couvertures: [] as Ligne[], verdicts: [] as Ligne[], constats: [] as Ligne[], relances: [] as Ligne[], messages: [] as Ligne[],
  };
  if (o.modeEntreprise) t.reglages.push({ companyId: SOC, modeParDefaut: o.modeEntreprise, maxRunsActifs: 3, maxCyclesCorrection: 3, retentionJours: 365, plafondPub: null, modifieLe: horloge() });
  t.campagnes.push({ id: CAMP, companyId: SOC, projectId: PROJET, briefIssueId: BRIEF, nom: "Printemps", objectifs: [], cible: null, offre: null, canaux: [], perimetre: { etablissements: [], zones: [] }, budgetMaxCents: null, plafondPub: null, mode: o.mode ?? "demonstration", etatProjet: { statut: "in_progress", enPause: false, archive: false }, creeLe: horloge() });

  const derniere = <T extends Ligne>(l: T[], f: (x: T) => boolean) => [...l].filter(f).sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1))[0];
  const maxDate = (dates: Array<string | undefined>) => dates.filter(Boolean).sort().pop() ?? null;
  const entrees = (companyId: string, issueId: string, campagneId: string) =>
    maxDate([
      ...t.couvertures.filter((x) => x.issueId === issueId).map((x) => x.modifieLe),
      ...t.verdicts.filter((x) => x.issueId === issueId).map((x) => x.modifieLe),
      ...t.constats.filter((x) => x.issueId === issueId).map((x) => x.modifieLe),
      ...t.exigences.filter((x) => x.campagneId === campagneId && x.companyId === companyId).map((x) => x.modifieLe),
      ...t.sources.filter((x) => x.issueId === issueId).map((x) => x.dateCollecte),
      ...t.portes.filter((x) => x.issueId === issueId).map((x) => x.modifieLe),
    ]);

  const impl: Partial<BaseAtelier> & Record<string, unknown> = {
    ns: "plugin_atelier_f0322cc62c",
    // Fiche du client : aucune marque par défaut (les garde-fous de vérité de la porte lisent `marques`).
    marques: async () => [],
    // Base de clients vide par défaut (la confiance de qualification la lit pour « pas déjà client »).
    etatBaseClients: async () => ({ dernierImport: null, clients: 0, actifs: 0 }),
    journaliser: async (e) => void t.journal.push({ ...e, seq: t.journal.length + 1, creeLe: horloge() }),
    datesJournal: async (_c, issueId, type) => t.journal.filter((j) => j.issueId === issueId && j.type === type).map((j) => j.creeLe as string).sort().reverse(),
    depotsProspectionCampagne: async (companyId, campagneId) =>
      t.journal.filter((j) => j.companyId === companyId && j.type === "prospects.deposes" && j.donnees?.campagneId === campagneId).map((j) => depotDepuisJournal(j.issueId ?? null, j.donnees ?? {}, j.creeLe)),
    lireJournal: async (_c, after, _l, issueId) => ({ evenements: t.journal.filter((j) => j.seq > after && (!issueId || j.issueId === issueId)) as never, dernierSeq: t.journal.length, complet: true }),
    lireReglages: async (companyId) => {
      const r = t.reglages.find((x) => x.companyId === companyId);
      return { companyId, maxRunsActifs: r?.maxRunsActifs ?? 3, maxCyclesCorrection: r?.maxCyclesCorrection ?? 3, modeParDefaut: r?.modeParDefaut ?? "demonstration", retentionJours: r?.retentionJours ?? 365, plafondPub: r?.plafondPub ?? null, modifieLe: r?.modifieLe ?? new Date(0).toISOString(), existe: Boolean(r) };
    },
    enregistrerReglages: async (r) => {
      const ex = t.reglages.find((x) => x.companyId === r.companyId);
      if (ex) Object.assign(ex, r, { modifieLe: horloge() });
      else t.reglages.push({ ...r, plafondPub: null, modifieLe: horloge() });
    },
    enregistrerPlafondEntreprise: async (companyId, plafond, par) => {
      let ex = t.reglages.find((x) => x.companyId === companyId);
      if (!ex) t.reglages.push((ex = { companyId, modeParDefaut: "demonstration", maxRunsActifs: 3, maxCyclesCorrection: 3, retentionJours: 365 }));
      ex.plafondPub = plafond ? { ...plafond, decidePar: par, decideLe: horloge() } : null;
    },
    donneesEngagement: async (companyId) => ({
      decisions: t.decisions.filter((d) => d.companyId === companyId).map((d) => ({ id: d.id, issueId: d.issueId, revisionId: d.revisionId, campagneId: CAMP, action: d.action, invalidee: d.invalidee, creeLe: d.creeLe, portee: d.portee })),
      diffusions: t.diffusions.filter((d) => d.companyId === companyId).map((d) => ({ id: d.id, issueId: d.issueId, revisionId: d.revisionId, campagneId: CAMP, decisionId: d.decisionId, action: d.action, etat: d.etat, montantCents: d.montantCents })),
    }),
    creerCampagne: async (c) => {
      const id = globalThis.crypto.randomUUID();
      t.campagnes.push({ id, companyId: c.companyId, projectId: c.projectId, briefIssueId: c.briefIssueId, nom: c.nom, objectifs: c.objectifs, cible: c.cible, offre: c.offre, canaux: c.canaux, perimetre: { etablissements: c.etablissements, zones: c.zones }, budgetMaxCents: null, plafondPub: c.plafond, mode: c.mode, etatProjet: { statut: "in_progress", enPause: false, archive: false }, creeLe: horloge() });
      return id;
    },
    creerBrief: async () => ({ id: globalThis.crypto.randomUUID(), version: 1 }),
    listerCampagnes: async (companyId) => t.campagnes.filter((c) => c.companyId === companyId) as never,
    lireCampagne: async (companyId, id) => (t.campagnes.find((c) => c.companyId === companyId && c.id === id) ?? null) as never,
    // Copies, comme la vraie base (lignes relues) : une écriture ne modifie pas une lecture antérieure.
    listerExigences: async (companyId, campagneId) => structuredClone(t.exigences.filter((e) => e.companyId === companyId && e.campagneId === campagneId).sort((a, b) => (a.code < b.code ? -1 : 1))) as never,
    lireExigence: async (companyId, id) => structuredClone(t.exigences.find((e) => e.companyId === companyId && e.id === id) ?? null) as never,
    enregistrerExigence: async (e) => {
      const ex = t.exigences.find((x) => x.campagneId === e.campagneId && x.code === e.code);
      if (ex) Object.assign(ex, { texteOriginal: e.texteOriginal, interpretation: e.interpretation, obligatoire: e.obligatoire, criteres: e.criteres, dependances: e.dependances, elementsAttendus: e.elementsAttendus, version: ex.version + 1, modifieLe: horloge() });
      else t.exigences.push({ ...e, id: `ex-${e.code}`, exclusion: { etat: "aucune", justification: null, demandeePar: null, decideePar: null, decideeLe: null }, version: 1, creeLe: horloge(), modifieLe: horloge() });
    },
    creerExigenceSiAbsente: async (e) => {
      if (t.exigences.some((x) => x.campagneId === e.campagneId && x.code === e.code)) return false;
      t.exigences.push({ ...e, id: `ex-${e.code}`, exclusion: { etat: "aucune", justification: null, demandeePar: null, decideePar: null, decideeLe: null }, version: 1, creeLe: horloge(), modifieLe: horloge() });
      return true;
    },
    creerPorte: async (p) => {
      if (t.portes.some((x) => x.issueId === p.issueId)) return false;
      t.portes.push({ ...p, cyclesConsommes: 0, actif: true, leveePar: null, motifLevee: null, creeLe: horloge(), modifieLe: horloge() });
      return true;
    },
    lirePorte: async (companyId, issueId) => structuredClone(t.portes.find((p) => p.companyId === companyId && p.issueId === issueId) ?? null) as never,
    listerPortes: async (companyId) => structuredClone(t.portes.filter((p) => p.companyId === companyId)) as never,
    majCycles: async (_c, issueId, n) => void t.portes.filter((p) => p.issueId === issueId).forEach((p) => (p.cyclesConsommes = n)),
    toucherPorte: async (_c, issueId) => void t.portes.filter((p) => p.issueId === issueId).forEach((p) => (p.modifieLe = horloge())),
    toucherPortesEntreprise: async (companyId) => void t.portes.filter((p) => p.companyId === companyId).forEach((p) => (p.modifieLe = horloge())),
    perimerEvaluations: async (_c, issueId) => void t.evaluations.filter((e) => e.issueId === issueId).forEach((e) => (e.perimee = true)),
    perimerEvaluationsEntreprise: async (companyId) => void t.evaluations.filter((e) => e.companyId === companyId).forEach((e) => (e.perimee = true)),
    traceReelle: async (companyId) => ({ decisions: t.decisions.filter((d) => d.companyId === companyId && d.mode === "reel").length, diffusions: t.diffusions.filter((d) => d.companyId === companyId && d.mode === "reel").length }),
    insererCouverture: async (c) => {
      const id = `cv-${t.couvertures.length + 1}-0-0-0` as `${string}-${string}-${string}-${string}-${string}`;
      const d = horloge();
      t.couvertures.push({ ...c, id, creeLe: d, ordre: d, modifieLe: d, declareePar: c.par });
      return id;
    },
    listerCouvertures: async (_c, issueId) => t.couvertures.filter((c) => c.issueId === issueId) as never,
    insererVerdict: async (v) => {
      const d = horloge();
      t.verdicts.push({ ...v, relecteur: { type: v.relecteurType, id: v.relecteurId, runId: v.runId }, creeLe: d, ordre: d, modifieLe: d });
    },
    listerVerdicts: async (_c, issueId) => t.verdicts.filter((v) => v.issueId === issueId) as never,
    insererConstat: async (c) => void t.constats.push({ ...c, statutResolution: "ouvert", creeLe: horloge(), modifieLe: horloge() }),
    resoudreConstats: async () => 0,
    listerConstats: async (_c, issueId) => t.constats.filter((c) => c.issueId === issueId) as never,
    derniereEntree: async (companyId, issueId, campagneId) => entrees(companyId, issueId, campagneId),
    insererEvaluation: async (e) => void t.evaluations.push({ ...e, perimee: false, creeLe: horloge() }),
    etatDerniereEvaluation: async (companyId, issueId, campagneId) => {
      const ev = derniere(t.evaluations, (x) => x.issueId === issueId);
      if (!ev) return null;
      const dernier = entrees(companyId, issueId, campagneId);
      return { decision: ev.decision, perimee: Boolean(ev.perimee), revisionId: ev.revisionId, plusRecentes: dernier !== null && dernier > ev.entreesJusquA };
    },
    listerEvaluations: async (_c, issueId) => structuredClone([...t.evaluations].filter((e) => e.issueId === issueId).sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1))) as never,
    insererDecision: async (d) => void t.decisions.push({ ...d, invalidee: false, creeLe: horloge() }),
    invaliderDecisions: async (_c, issueId, rev) => {
      t.decisions.filter((d) => d.issueId === issueId && d.revisionId !== rev).forEach((d) => (d.invalidee = true));
      return { rowCount: 0 };
    },
    listerDecisions: async (_c, issueId) => structuredClone([...t.decisions].filter((d) => d.issueId === issueId).sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1))) as never,
    insererDiffusion: async (d) => {
      if (t.diffusions.some((x) => x.companyId === d.companyId && x.cleIdempotence === d.cleIdempotence)) return false;
      t.diffusions.push({ ...d, preuveCharge: d.preuveCharge ? structuredClone(d.preuveCharge) : null, creeLe: horloge(), issueMotif: null });
      return true;
    },
    lireDiffusionParCle: async (companyId, cle) => {
      const d = t.diffusions.find((x) => x.companyId === companyId && x.cleIdempotence === cle);
      return d ? (vueDiffusion(d) as never) : null;
    },
    listerDiffusions: async (_c, issueId) => t.diffusions.filter((d) => d.issueId === issueId).map(vueDiffusion) as never,
    lireDiffusionInterne: async (_c, id) => {
      const d = t.diffusions.find((x) => x.id === id);
      return d
        ? {
            id: d.id, issueId: d.issueId, audience: d.audience ?? null, empreinteArguments: d.empreinteArguments ?? null, service: d.service ?? null, outil: d.outil ?? null,
            preuveCharge: d.preuveCharge ? structuredClone(d.preuveCharge) : null, revocation: d.revoqueeLe ? { le: d.revoqueeLe, motif: d.revocationMotif } : null,
          }
        : null;
    },
    figerPreuve: async (_c, id, charge) => {
      const d = t.diffusions.find((x) => x.id === id && !x.preuveCharge);
      if (d) d.preuveCharge = structuredClone(charge);
      return Boolean(d);
    },
    revoquerPreuves: async (companyId, issueId, o, motif) => {
      const visees = t.diffusions.filter((d) => d.companyId === companyId && d.issueId === issueId && d.mode === "reel" && d.etat === "preparee" && d.preuveCharge && !d.revoqueeLe
        && (!o.diffusionId || d.id === o.diffusionId) && (!o.saufDecision || d.decisionId !== o.saufDecision));
      for (const d of visees) Object.assign(d, { revoqueeLe: horloge(), revocationMotif: motif });
      return visees.map((d) => d.id);
    },
    listerRevocations: async (companyId) => t.diffusions.filter((d) => d.companyId === companyId && d.revoqueeLe && d.preuveCharge).map((d) => ({ id: d.id, charge: structuredClone(d.preuveCharge) })),
    insererAppel: async (a) => {
      if (t.appels.some((x) => x.companyId === a.companyId && x.issueId === a.issueId && x.revisionId === a.revisionId && x.empreinte === a.empreinte)) return false;
      t.appels.push({ ...structuredClone(a), proposePar: a.par, creeLe: horloge() });
      return true;
    },
    listerAppels: async (companyId, issueId) => structuredClone(t.appels.filter((a) => a.companyId === companyId && a.issueId === issueId).reverse()).map(vueAppel) as never,
    lireAppel: async (companyId, issueId, id) => {
      const a = t.appels.find((x) => x.companyId === companyId && x.issueId === issueId && x.id === id);
      return a ? (vueAppel(structuredClone(a)) as never) : null;
    },
    lireAppelParEmpreinte: async (companyId, issueId, revisionId, empreinte) => {
      const a = t.appels.find((x) => x.companyId === companyId && x.issueId === issueId && x.revisionId === revisionId && x.empreinte === empreinte);
      return a ? (vueAppel(structuredClone(a)) as never) : null;
    },
    comptesConnexion: async (companyId, campagneId, issueId, service) =>
      [...new Set(t.sources.filter((x) => x.companyId === companyId && (campagneId ? x.campagneId === campagneId : x.issueId === issueId) && x.provenance === "connexion" && x.mode === "reel" && x.connexion?.service === service && x.connexion?.compte).map((x) => x.connexion.compte as string))],
    rapporterIssueDiffusion: async (_c, issueId, id, depuis, etat, motif) => {
      const d = t.diffusions.find((x) => x.id === id && x.issueId === issueId && depuis.includes(x.etat));
      if (!d) return 0;
      Object.assign(d, { etat, issueMotif: motif });
      return 1;
    },
    insererSource: async (s) => void t.sources.push({ ...s, dateCollecte: horloge() }),
    listerSources: async (_c, f = {}) => t.sources.filter((s) => !f.issueId || s.issueId === f.issueId) as never,
    sourcesPourGarde: async (_c, issueId) => t.sources.filter((s) => s.issueId === issueId).map((s) => ({ id: s.id, mode: s.mode, provenance: s.provenance, url: s.url, service: s.connexion?.service ?? null, outil: s.connexion?.outil ?? null, chiffres: s.connexion?.chiffres ?? [] })),
    listerRelances: async () => [],
    dernierBrief: async () => null,
    listerMessages: async () => [],
    insererMessage: async (m) => void t.messages.push({ ...m }),
    lierCommentaire: async () => undefined,
    coutsEntreprise: async () => ({ totalCents: 0, evenements: 0 }),
    runsDeTaches: async () => [],
    bloqueursNonResolus: async () => [],
    supprimerDonneesEntreprise: async () => ({ journal: t.journal.splice(0).length }),
  };
  function vueDiffusion(d: Ligne) {
    return {
      id: d.id, companyId: d.companyId, issueId: d.issueId, revisionId: d.revisionId, decisionId: d.decisionId, action: d.action, canal: d.canal, compte: d.compte ?? null,
      montantCents: d.montantCents ?? null, etat: d.etat, cleIdempotence: d.cleIdempotence, motifRefus: d.issueMotif ?? d.motifRefus ?? null, mode: d.mode, creeLe: d.creeLe,
      service: d.service ?? null, outil: d.outil ?? null, preuveExpire: d.preuveCharge?.expire ?? null,
      revocation: d.revoqueeLe ? { le: d.revoqueeLe, motif: d.revocationMotif } : null,
    };
  }
  function vueAppel(a: Ligne) {
    return {
      id: a.id, issueId: a.issueId, revisionId: a.revisionId, service: a.service, outil: a.outil, action: a.action, compte: a.compte, arguments: a.arguments,
      empreinte: a.empreinte, empreinteArguments: a.empreinteArguments, proposePar: a.proposePar, creeLe: a.creeLe,
    };
  }
  const base = new Proxy(impl, {
    get(cible, cle) {
      if (cle in cible) return cible[cle as string];
      return () => {
        throw new Error(`base factice : ${String(cle)} non implémentée`);
      };
    },
  }) as unknown as BaseAtelier;

  /* ---------------- hôte ---------------- */
  const issues = new Map<string, Ligne>();
  issues.set(BRIEF, { id: BRIEF, companyId: SOC, projectId: PROJET, status: "in_progress", assigneeAgentId: COORD, title: "Brief", executionPolicy: null, executionState: null });
  const documents = new Map<string, Ligne>();
  const mises: Array<{ issueId: string; patch: Ligne }> = [];
  const commentaires: string[] = [];
  const activite: string[] = [];
  const journauxLogger: string[] = [];
  const reveils: string[] = [];
  const evenements = new Map<string, (e: unknown) => Promise<void>>();
  const listes: Ligne[] = [];
  const interactions = new Map<string, Ligne[]>();
  const ctx = {
    logger: {
      info: (...a: unknown[]) => journauxLogger.push(JSON.stringify(a)), warn: (...a: unknown[]) => journauxLogger.push(JSON.stringify(a)),
      error: (...a: unknown[]) => journauxLogger.push(JSON.stringify(a)), debug: (...a: unknown[]) => journauxLogger.push(JSON.stringify(a)),
    },
    events: { on: (nom: string, fn: (e: unknown) => Promise<void>) => evenements.set(nom, fn) },
    activity: { log: async (e: { message: string }) => void activite.push(e.message) },
    config: { get: async () => o.config ?? {} },
    secrets: {
      resolve: async () => {
        if (!o.secret) throw new Error("secret introuvable");
        return o.secret;
      },
    },
    issues: {
      get: async (id: string, companyId: string) => {
        const i = issues.get(id);
        return i && i.companyId === companyId ? { ...i } : null;
      },
      update: async (id: string, patch: Ligne) => {
        mises.push({ issueId: id, patch });
        Object.assign(issues.get(id)!, patch);
        return issues.get(id);
      },
      list: async (q: Ligne) => {
        listes.push(q);
        return [...issues.values()].filter((i) => (!q.originKind || i.originKind === q.originKind) && (q.originId === undefined || i.originId === q.originId));
      },
      create: async (i: Ligne) => {
        const id = `00000000-0000-4000-8000-${String(issues.size).padStart(12, "0")}`;
        issues.set(id, { ...i, id, identifier: `REV-${issues.size}` });
        return issues.get(id);
      },
      listInteractions: async (issueId: string) => interactions.get(issueId) ?? [],
      createComment: async (_id: string, texte: string) => (commentaires.push(texte), { id: "c" }),
      requestWakeup: async (id: string) => void reveils.push(id),
      documents: {
        get: async (issueId: string, cle: string) => documents.get(`${issueId}:${cle}`) ?? null,
      },
    },
    agents: {
      list: async () => [COORD, RELECTEUR, PRODUCTEUR, PORTE_AGENT].map((id) => ({ id, companyId: SOC, name: id, adapterType: "process", adapterConfig: {} })),
      get: async (id: string) => ({ id, companyId: SOC, name: id, role: id === COORD ? "ceo" : "general", adapterType: "process", adapterConfig: {}, status: "active" }),
    },
    projects: { get: async (id: string, companyId: string) => (companyId === SOC ? { id, companyId: SOC, name: "Projet" } : null) },
    companies: { get: async () => ({ id: SOC, budgetMonthlyCents: 0 }) },
  } as unknown as PluginContext;

  /** Tâche de production sous porte, livrable `revision` écrit par le producteur. */
  function tacheSousPorte(o2: { revision?: string; corps?: string; status?: string; etape?: "review" | "approval" | null; revuesRequises?: Array<{ role: string; agentId: string }>; maxCycles?: number } = {}) {
    const revision = o2.revision ?? REV1;
    issues.set(ISSUE, {
      id: ISSUE, companyId: SOC, projectId: PROJET, status: o2.status ?? "in_review", assigneeAgentId: PRODUCTEUR, title: "Page", identifier: "DEM-1",
      executionPolicy: { stages: [{ type: "review", participants: [{ type: "agent", agentId: PORTE_AGENT }] }, { type: "approval", participants: [{ type: "user", userId: "local-board" }] }] },
      executionState: o2.etape === null ? null : { status: "pending", currentStageType: o2.etape ?? "approval", currentParticipant: { type: "user", userId: "local-board" }, returnAssignee: { type: "agent", agentId: PRODUCTEUR } },
    });
    documents.set(`${ISSUE}:livrable`, { latestRevisionId: revision, latestRevisionNumber: 1, title: "Page", body: o2.corps ?? "# Page\n\nTexte approuvé.", updatedByAgentId: PRODUCTEUR, createdByAgentId: PRODUCTEUR });
    t.portes.push({ issueId: ISSUE, companyId: SOC, campagneId: CAMP, cleLivrable: "livrable", exigencesCiblees: [], revuesRequises: o2.revuesRequises ?? [], maxCycles: o2.maxCycles ?? 3, cyclesConsommes: 0, actif: true, leveePar: null, motifLevee: null, creeLe: horloge(), modifieLe: horloge() });
    return { revision };
  }

  /** Évaluation PASS fraîche sur la révision donnée (comme `evaluer` l'enregistre). */
  function passe(revision = REV1) {
    t.evaluations.push({ id: `ev-${t.evaluations.length}`, companyId: SOC, issueId: ISSUE, revisionId: revision, decision: "PASS", motifs: [], empreinte: "e", entreesJusquA: horloge(), cyclesEpuises: false, par: "agent:porte", perimee: false, creeLe: horloge() });
  }

  function decision(o3: { revision?: string; action?: string; portee?: Ligne | null; mode?: "demonstration" | "reel" } = {}) {
    const id = `dec-${t.decisions.length + 1}`.padEnd(8, "0");
    t.decisions.push({ id, companyId: SOC, issueId: ISSUE, revisionId: o3.revision ?? REV1, action: o3.action ?? "approuver", commentaire: "ok", userId: "local-board", portee: o3.portee ?? null, mode: o3.mode ?? "demonstration", invalidee: false, creeLe: horloge() });
    return id;
  }

  return { base, ctx, t, issues, interactions, documents, mises, commentaires, activite, journauxLogger, reveils, evenements, listes, tacheSousPorte, passe, decision, horloge };
}
