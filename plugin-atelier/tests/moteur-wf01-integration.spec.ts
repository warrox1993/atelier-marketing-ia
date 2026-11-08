/**
 * Chaîne WF-01 de bout en bout (#51, tâche 4) : exécuteur, outils (`livrable_deposer`) et chat (`discussion.envoyer`) réels ; seul le CRM est un double.
 * Les quatre étapes d'agent déposent leur sortie par l'outil, validée par son vrai contrat ; les étapes en code sont les vraies (`creerEtapesWf01`) ;
 * l'approbation se lit par `issues.get` de l'hôte double, qui rend la politique et l'état natifs comme le vrai hôte (`issues.list` les rend à null).
 * Limites : le verdict de la porte est déposé par `deposerVerdict` (la route des verdicts a ses propres essais, moteur-routes-reelles.spec.ts) ;
 * l'état natif d'approbation est posé à la main sur le double.
 * Le moteur désactivé par défaut est prouvé ailleurs : `moteurActif` sur config vide ou à `false` (moteur-executeur.spec.ts, « moteurActif ») et l'abonné
 * `issue.updated` qui ne fait rien sans le réglage (moteur-wfc-integration.spec.ts, réglage coupé).
 * Ces scénarios s'arrêtent au double du CRM : la vraie route d'export (décision humaine, refus, appel unique) est essayée dans moteur-routes-reelles.spec.ts.
 */
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import { creerExecuteur, type DepsExecuteur } from "../src/moteur/executeur.js";
import { creerOutilsMoteur } from "../src/moteur/outils.js";
import type { RequeteRoute } from "../src/serveur/atelier.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { routesDiscussion } from "../src/serveur/services-discussion.js";
import { GABARIT, P1, P2, P3, PHZ, SOC, approbationNative, h, monter, type OptionsBanc } from "./moteur-wf01-doubles.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const LIMITES = ["aucune limite"];
const HUMAIN = { type: "humain" as const, id: "local-board", agentId: null, userId: "local-board", runId: null };
const ROLES = [...new Set(GABARIT.etapes.map((e) => e.role))];
const AGENTS = [...ROLES, "exigences", "relecteur"].map((slug) => ({ id: `agent-${slug}`, status: "idle", companyId: SOC, metadata: { atelier: { slug } } }));

interface Sorties { collecte: string[]; qualifies: string[]; enrichis: string[]; lot: string[] }
const TOUS: Sorties = { collecte: [P1, P2, P3, P1], qualifies: [], enrichis: [P1, P2, P3], lot: [P1, P2, P3] };

/** Banc de la chaîne : doubles de `moteur-wf01-doubles.ts` plus les vrais outils, branchés sur le même exécuteur. */
async function monterChaine(opts: OptionsBanc = {}) {
  const t = await monter(opts);
  const runs = new Map<string, string>();
  const outils = creerOutilsMoteur({
    config: async () => ({ moteurMissions: true }),
    base: t.base as never,
    tacheDuRun: async (_c, runId) => runs.get(runId) ?? null,
    agents: async () => AGENTS,
    executeur: t.executeur,
    issues: t.hote.issues as never,
    routes: { "tache.verdict": async () => { throw new Error("hors sujet"); } },
    evaluerPorte: async () => { throw new Error("hors sujet"); },
    revisionLivrable: async (_c, issueId) => t.docs.get(issueId) ?? null,
  });
  /** L'agent du rôle de l'étape dépose sa sortie depuis la tâche de l'étape (un run par étape). */
  const deposer = (rang: number, sortie: Record<string, unknown>) => {
    const runId = `run-${rang}`;
    runs.set(runId, t.issueDuRang(rang));
    if (rang === 7) t.docs.set(t.issueDuRang(7), "rev-1");
    return outils.livrable_deposer({ missionId: t.missionId, versionContrat: 1, sortie }, { agentId: `agent-${GABARIT.etapes.find((e) => e.rang === rang)!.role}`, runId, companyId: SOC, projectId: "projet" });
  };
  /** Les quatre étapes d'agent, dans l'ordre ; les étapes en code s'enchaînent seules. */
  const agents = async (s: Sorties = TOUS) => {
    const res = [
      await deposer(2, { reponsesBrutesSignees: ["rep-1"], prospectIds: s.collecte, limites: LIMITES }),
      await deposer(4, { reponsesBrutesSignees: ["rep-1"], qualification: "qualifiés", personnesOpposeesMarquees: [], limites: LIMITES }),
      await deposer(5, { prospectIds: s.enrichis, limites: LIMITES }),
      await deposer(7, { prospectIds: s.lot, limites: LIMITES }),
    ];
    for (const r of res) expect(r.error).toBeUndefined();
  };
  const verdictAccepte = () => t.executeur.deposerVerdict(SOC, { missionId: t.missionId, rang: 7, tentative: 1, accepte: true, runId: "run-r1" });
  const jusquAutorisation = async (s: Sorties = TOUS) => {
    await t.executeur.demarrerMission(SOC, t.missionId);
    await agents(s);
    await verdictAccepte();
  };
  const natif = (patch: Record<string, unknown>) => void Object.assign(t.issues.get(t.issueDuRang(7))!, patch);
  const approuver = () => natif(approbationNative(t.issues.get(t.issueDuRang(7))!));
  /** Redémarrage du worker : un nouvel exécuteur sur la même base et le même hôte, sans mémoire de l'ancien. */
  const redemarrer = () => creerExecuteur({ hote: t.hote as never, base: t.base as unknown as DepsExecuteur["base"], porte: {} as never, horloge: () => new Date(), revisionLivrable: async (_c, i) => t.docs.get(i) ?? null, etapesCode: t.etapesCode });
  const etat = () => t.missions.get(t.missionId)!.etat;
  const etape = (rang: number) => t.etapes.find((e) => e.rang === rang)!;
  return { ...t, outils, deposer, agents, jusquAutorisation, natif, approuver, redemarrer, etat, etape, verdictAccepte };
}

describe("WF-01 de bout en bout (étapes en code, outils et approbation natifs réels, CRM double)", () => {
  it("1. mission complète jusqu'à l'export CRM confirmé", async () => {
    const t = await monterChaine();
    await t.jusquAutorisation();
    expect(t.etat()).toBe("attente_autorisation");
    expect(t.etape(3).sortie).toEqual({ prospectIds: [P1, P2, P3], doublons: [] });
    expect(t.etape(6).sortie).toEqual({ retenus: [P1, P2, P3], marques: [], exclus: [] });
    const reveils = t.reveils.length;
    expect(t.reveils).toEqual([2, 4, 5, 7].map(t.issueDuRang));
    // Approbation native lue par `issues.get` : le filet `issue.updated` la constate, l'export part sans aucun réveil.
    expect((await t.hote.issues.get(t.issueDuRang(7), SOC))?.executionState).toBeNull();
    t.approuver();
    expect((await t.hote.issues.get(t.issueDuRang(7), SOC))?.executionState).toEqual({ completedStageIds: ["etape-2"] });
    await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
    expect(t.etat()).toBe("cloturee");
    expect(t.reveils).toHaveLength(reveils);
    expect(t.crm.ecritures.map((e) => [e.missionId, e.prospectId])).toEqual([P1, P2, P3].map((p) => [t.missionId, p]));
    expect(t.crm.appels).toEqual([[P1, P2, P3]]);
    expect(t.etape(9)).toMatchObject({ etat: "terminee", sortie: { reussis: [P1, P2, P3], echecs: [], essais: 1 } });
    expect(t.etape(10)).toMatchObject({ etat: "terminee", sortie: { verifies: 3 } });
  });

  it("2. arrêt du worker entre deux étapes, redémarrage : aucun doublon, la décision humaine prise pendant l'arrêt n'est pas perdue", async () => {
    const t = await monterChaine();
    await t.executeur.demarrerMission(SOC, t.missionId);
    await t.deposer(2, { reponsesBrutesSignees: ["rep-1"], prospectIds: TOUS.collecte, limites: LIMITES });
    // Arrêt entre l'écriture de la sortie de l'étape 4 et sa transition.
    const enregistrer = t.base.enregistrerExecution;
    let arret = true;
    t.base.enregistrerExecution = async (e: { cle: string; companyId: string }) => {
      if (arret && e.cle.includes(":4:1:sortie_valide_etape")) {
        arret = false;
        throw new Error("arrêt simulé du worker");
      }
      return enregistrer(e as never);
    };
    await expect(t.deposer(4, { reponsesBrutesSignees: ["rep-1"], qualification: "qualifiés", personnesOpposeesMarquees: [], limites: LIMITES })).rejects.toThrow("arrêt simulé");
    expect(t.etape(4)).toMatchObject({ etat: "terminee" });
    expect(t.reveils).toEqual([2, 4].map(t.issueDuRang));
    // Redémarrage : la passe de reprise termine la transition et réveille l'étape 5, une seule fois.
    const apres = t.redemarrer();
    await apres.reprendre(SOC);
    await apres.reprendre(SOC);
    expect(t.reveils).toEqual([2, 4, 5].map(t.issueDuRang));
    await t.deposer(5, { prospectIds: TOUS.enrichis, limites: LIMITES });
    await t.deposer(7, { prospectIds: TOUS.lot, limites: LIMITES });
    await t.verdictAccepte();
    // L'humain approuve pendant l'arrêt (aucun événement reçu) : la reprise lit l'état natif et exporte, sans doublon.
    t.approuver();
    const encore = t.redemarrer();
    await encore.reprendre(SOC);
    await encore.reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P1, P2, P3]);
    expect(t.creations.map((c) => c.originId)).toEqual([2, 4, 5, 7].map((r) => `mission:${t.missionId}:${r}`));
    expect(t.reveils).toEqual([2, 4, 5, 7].map(t.issueDuRang));
  });

  it("3. même événement rejoué : aucune deuxième transition, aucun réveil, aucun écrit CRM de plus", async () => {
    const t = await monterChaine();
    await t.jusquAutorisation();
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
    expect(t.etat()).toBe("cloturee");
    const avant = { cles: [...t.executions.keys()], reveils: [...t.reveils], creations: t.creations.length, ecritures: t.crm.ecritures.length, journal: t.journal.length };
    // Rejeux : l'approbation, le verdict (même run), et le dépôt de la dernière sortie (même run).
    await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
    expect(await t.verdictAccepte()).toMatchObject({ statut: "rejeu" });
    // Le dépôt rejoué est refusé par l'outil (l'étape n'est plus courante) ; rejoué directement à l'exécuteur, il est ignoré.
    expect((await t.deposer(7, { prospectIds: TOUS.lot, limites: LIMITES })).data).toMatchObject({ code: "run_hors_etape" });
    expect(await t.executeur.recevoirResultat(SOC, { missionId: t.missionId, rang: 7, tentative: 1, sortie: { prospectIds: TOUS.lot, limites: LIMITES }, cleEvenement: "run-7" })).toMatchObject({ statut: "ignore" });
    await t.redemarrer().reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect({ cles: [...t.executions.keys()], reveils: t.reveils, creations: t.creations.length, ecritures: t.crm.ecritures.length }).toEqual({ cles: avant.cles, reveils: avant.reveils, creations: avant.creations, ecritures: avant.ecritures });
    expect(t.journal.slice(avant.journal).map((j) => j.type)).toEqual(["moteur.resultat_ignore"]);
  });

  it("4. prospect exclu par un autre motif que l'opposition (hors_zone) : jamais exporté, même ajouté au lot par l'agent", async () => {
    const t = await monterChaine({ zone: { codesPostaux: ["4000"] } });
    await t.jusquAutorisation({ collecte: [P1, P2, PHZ.id], qualifies: [], enrichis: [P1, P2, PHZ.id], lot: [P1, P2, PHZ.id] });
    expect(t.etape(6).sortie).toEqual({ retenus: [P1, P2], marques: [], exclus: [{ prospectId: PHZ.id, motifs: ["hors_zone"] }] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P1, P2]);
    expect(t.journal.find((j) => j.type === "moteur.export_ids_ecartes")?.donnees).toMatchObject({ ids: [PHZ.id] });
  });

  it("5. échec partiel d'export : liste exacte des réussites et des échecs, la reprise n'écrit que les échecs", async () => {
    const t = await monterChaine();
    await t.jusquAutorisation();
    t.crm.refuserSur([P1, P3]);
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
    expect(t.etat()).toBe("en_execution");
    expect(t.journal.find((j) => j.type === "moteur.export_partiel")?.donnees).toMatchObject({
      reussis: [P2], echecs: [{ prospectId: P1, raison: `CRM indisponible pour ${P1}` }, { prospectId: P3, raison: `CRM indisponible pour ${P3}` }], essais: 1,
    });
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P2]);
    t.crm.reparer();
    await t.redemarrer().reprendre(SOC);
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P2, P1, P3]);
    expect(t.etape(9)).toMatchObject({ etat: "terminee", sortie: { reussis: [P2, P1, P3].sort(), echecs: [], essais: 2 } });
  });

  it("6. tâche native passée à done sans contrôle : l'action externe reste refusée", async () => {
    const t = await monterChaine();
    await t.jusquAutorisation();
    // Ni politique ni état natifs, puis une politique dont l'approbation n'est pas franchie.
    for (const patch of [{ status: "done", executionPolicy: null, executionState: null }, { status: "done", executionPolicy: { stages: [{ id: "approbation", type: "approval" }] }, executionState: { completedStageIds: [] } }]) {
      t.natif(patch);
      await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
      expect(t.etat()).toBe("attente_autorisation");
      expect(t.crm.ecritures).toEqual([]);
      expect(t.issues.get(t.issueDuRang(7))!.status).toBe("in_review");
    }
    // Un `done` natif sans étape terminée est reposé juste avant la reprise : elle le lit et rend la tâche à `in_review`.
    t.natif({ status: "done" });
    await t.redemarrer().reprendre(SOC);
    expect(t.issues.get(t.issueDuRang(7))!.status).toBe("in_review");
    expect(t.etat()).toBe("attente_autorisation");
    expect(t.crm.ecritures).toEqual([]);
    expect(t.etape(9).etat).not.toBe("terminee");
  });

  it("7. question d'état : réponse tirée de la base, aucun réveil de modèle, aucun changement de statut", async () => {
    const t = await monterChaine();
    await t.jusquAutorisation();
    const reveils = t.reveils.length;
    const chat: string[] = [];
    const commentaires: Ligne[] = [];
    const salon: Ligne[] = [];
    const ctx = {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      config: { get: async () => ({ moteurMissions: true }) },
      agents: { list: async () => [{ id: "coordinateur", name: "Coordinateur", role: "ceo", status: "idle" }], get: async () => ({ id: "coordinateur", name: "Coordinateur" }) },
      issues: {
        list: async (f: Ligne) => salon.filter((i) => i.companyId === f.companyId && i.originKind === f.originKind),
        get: async (id: string, companyId: string) => salon.find((i) => i.id === id && i.companyId === companyId) ?? null,
        create: async (i: Ligne) => { const c = { id: `salon-${salon.length + 1}`, identifier: "DEM-9", createdAt: new Date(), updatedAt: new Date(), ...i }; salon.push(c); return c; },
        update: async (_id: string, patch: Ligne) => void chat.push(`update:${JSON.stringify(patch)}`),
        listInteractions: async () => [],
        listComments: async (id: string) => commentaires.filter((c) => c.issueId === id),
        createComment: async (issueId: string, body: string, companyId: string, opt?: Ligne) => { const c = { id: `c-${commentaires.length}`, issueId, companyId, body, authorType: opt?.authorAgentId ? "agent" : "system", authorAgentId: opt?.authorAgentId ?? null, createdAt: new Date() }; commentaires.push(c); return c; },
        requestConfirmation: async () => { chat.push("requestConfirmation"); return {}; },
        requestWakeup: async () => { chat.push("requestWakeup"); return { queued: true, runId: "run-1" }; },
      },
    } as unknown as PluginContext;
    const base = { ...t.base, coutsEntreprise: async () => ({ totalCents: 0, evenements: 0 }) } as unknown as BaseAtelier;
    const rendu = await routesDiscussion({ ctx, base })["discussion.envoyer"]!({ cle: "discussion.envoyer", params: {}, query: {}, corps: { companyId: SOC, texte: "Où en est la mission ?" }, acteur: HUMAIN, companyId: SOC } as RequeteRoute);
    expect(rendu.corps).toMatchObject({ reveilDemande: false });
    const reponse = commentaires.find((c) => c.authorAgentId === "coordinateur")!.body as string;
    expect(reponse).toContain("attend une autorisation");
    expect(reponse).toContain("(étape 7, prospection)");
    expect(chat).toEqual([]);
    expect(t.reveils).toHaveLength(reveils);
    expect(t.journal.find((j) => j.type === "discussion.message")).toMatchObject({ donnees: { questionEtat: "avancement", reveil: null } });
    expect(t.etat()).toBe("attente_autorisation");
  });

  it("8. sortie hors contrat : refusée par l'outil, sans nouveau réveil ni nouvelle tâche, la mission n'avance pas", async () => {
    const t = await monterChaine();
    await t.executeur.demarrerMission(SOC, t.missionId);
    const reveils = [...t.reveils];
    const creations = t.creations.length;
    const r = await t.deposer(2, { prospectIds: "pas une liste" });
    expect(r.error).toBeTruthy();
    expect(r.data).toMatchObject({ code: "sortie_hors_contrat" });
    expect(t.etape(2).sortie).toBeNull();
    expect(t.etape(3)?.etat).toBe("en_attente");
    expect(t.reveils).toEqual(reveils);
    expect(t.creations).toHaveLength(creations);
    expect(t.journal.some((j) => j.type === "moteur.sortie_hors_contrat")).toBe(true);
    expect(t.crm.ecritures).toEqual([]);
  });

  it("9. un prospect marqué par une opposition est exporté, avec sa marque", async () => {
    const t = await monterChaine({ oppositions: [{ type: "courriel", valeur: h(2) }] });
    await t.jusquAutorisation();
    expect(t.etape(6).sortie).toEqual({ retenus: [P1, P2, P3], marques: [P2], exclus: [] });
    t.approuver();
    await t.executeur.surDoneNatif(SOC, t.issueDuRang(7));
    expect(t.etat()).toBe("cloturee");
    expect(t.crm.ecritures.map((e) => e.prospectId)).toEqual([P1, P2, P3]);
    // La marque se lit dans le journal du moteur (identifiants seuls), le CRM ne la reçoit pas.
    expect(t.journal.find((j) => j.type === "moteur.export_marque_opposition")?.donnees).toMatchObject({ ids: [P2] });
    // Le journal est conservé : ni coordonnée chiffrée ni empreinte de la personne opposée.
    expect(JSON.stringify(t.journal)).not.toContain("chv1.");
    expect(JSON.stringify(t.journal)).not.toContain(h(2));
  });
});
